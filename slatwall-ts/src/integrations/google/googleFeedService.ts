// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that one of them exists, and no behaviour in this file depends on
// one - this module imports three specifiers and all three resolve today. The
// complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts             composition root; the sole place this
//                                         class is constructed and bound to its
//                                         port
//   src/handlers/productFeedHandler.ts    the feed entrypoint; the sole holder
//                                         of the incoming event, and therefore
//                                         the origin of the feed host
//   tests/unit/integrations/google/googleFeedService.test.ts   this file's suite
//
// All three are named at FILE granularity on purpose, because both directories
// already exist and calling either one planned would be wrong. `src/handlers/`
// holds the error mapper and the router today; what is absent is the composition
// root and the feed entrypoint specifically. `tests/unit/integrations/google`
// already holds the adapter's and the repository's suites; what is absent is
// this module's suite.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the Google product-feed orchestration
//
// WHAT THIS MODULE IS
//   The composition half of the Google product-feed adapter, and the module that
//   satisfies the feed capability declared in
//   `src/domain/ports/productFeedPort.ts`. It owns exactly one thing: the ORDER
//   of two collaborators. `./googleFeedRepository.js` decides WHICH SKUs qualify
//   and WHAT is true of each one; `./rssFeedRenderer.js` decides what the
//   document looks like; this module reads the first and hands the result to the
//   second, unchanged.
//
//   NET-NEW, AND IT HAS NO LEGACY ANTECEDENT. There was no orchestration layer
//   in the legacy subsystem to port. The framework was the orchestrator: a
//   controller action wrote one key onto the request context and FW/1 resolved a
//   view that read that key back. Removing the framework is what creates the need
//   for this file, so what is written below is a NEW module standing in for a
//   framework mechanism - not a translation of a legacy component.
//
//   It holds no business rule of its own. Every rule the feed has lives in one of
//   the two collaborators, and a reader looking for a filter, a join, a statement,
//   an element name, an escaper or a monetary calculation will find none here -
//   finding one here would mean it had been duplicated out of the module that owns
//   it.
//
// PROVENANCE - THREE LEGACY ARTEFACTS, TWO OF WHICH ARE NOT PORTED
//   Every locator cited anywhere in this file was opened and read in the legacy
//   tree while writing it, and all of them matched, so there is no locator drift
//   to report.
//
//   * [integrationServices/google/controllers/feed.cfc:L49-L74] is the component
//     this module replaces. Its one method is reshaped below, and the reshaping is
//     audited in full under RESHAPING #3 OF 3.
//
//   * [integrationServices/google/controllers/main.cfc:L49-L52] IS NOT PORTED, and
//     that is a finding rather than an omission. The component body is LITERALLY
//     EMPTY: L49 declares the component, L50 and L51 carry nothing but whitespace,
//     and L52 closes the brace. Zero methods, zero properties, zero logic. Its
//     only role was letting FW/1 resolve the subsystem's default action, which is a
//     routing concern that belongs to `src/handlers/` and not to a feed module.
//     Reading it is what distinguishes a considered omission from an oversight, so
//     the reading is recorded.
//
//   * [integrationServices/google/views/main/default.cfm:L50] IS NOT PORTED
//     either. It is a single paragraph of admin-facing instructional markup
//     telling an operator to point their feed at the `google:feed.product` action.
//     The presentation subsystems are out of scope and this migration renders no
//     user interface, so there is nothing here to carry over. Its only residual
//     value is as evidence of how the legacy action name resolved into the
//     subsystem directory - again a routing concern owned elsewhere.
//
//   No landing page, index route, default action, health check, discovery
//   endpoint or documentation-serving method is authored to stand in for either of
//   the two. One capability in, one capability out.
//
// RESHAPING #3 OF 3 - THE MIGRATION'S LAST PERMITTED SIGNATURE RESHAPING
//   The plan budgets EXACTLY THREE signature reshapings for the whole migration
//   and this file spends the third and final one, ONCE. The budget, stated in full
//   so that it can be audited from this comment alone:
//
//     1. SPENT, elsewhere. `updateOrderAmountsWithPromotions` and
//        `updateOrderAmountsWithPriceGroups` return applied-promotion and
//        applied-price-group intents instead of mutating an order aggregate in
//        place. Owned by the promotion and price-group services.
//     2. SPENT, elsewhere. The two smart-list methods become explicit typed
//        repository queries - `getProductSmartList` becomes `findProducts` and
//        `getSkuSmartList` becomes `findSkus`. Owned by the product and SKU
//        services.
//     3. SPENT HERE. `product(rc)` becomes `generateProductFeed()`. Documented on
//        the method below, with the legacy name, the legacy signature and the
//        locator.
//
//   A FOURTH RESHAPING ANYWHERE IN THE MIGRATION IS A GATE FAILURE. There is no
//   slot left for one, in this folder or in another.
//
//   This folder's remaining budget is likewise ZERO on every other axis, and it is
//   stated here so that no later reader assumes a slot is free:
//     * ZERO of the 5 visibility widenings. Those promote a private CFML method to
//       an exported function so it can be tested directly, and all five belong to
//       the promotion service.
//     * ZERO of the 1 entity signature widening. That one adds an explicit instant
//       parameter to a promotion-period predicate, and it belongs to the domain
//       entity layer.
//     * ZERO of the 3 deliberate divergences. Those are the un-scoped discount
//       variable, the one discount branch that skipped arbitrary-precision
//       arithmetic, and the entity memo defects - all in the service and domain
//       layers.
//     * ZERO preserved-defect markers. Four are registered against this folder and
//       every one of them belongs to a sibling: two to `./integration.js`, one to
//       `./googleFeedRepository.js` and one to `./rssFeedRenderer.js`. Restating a
//       sibling's marker here would double-count a defect and misattribute its
//       owner, so this file carries none.
//     * ZERO carry-forward markers of the kind the plan requires for a known
//       source annotation. Neither `feed.cfc` nor `main.cfc` contains one -
//       verified by reading both in full - and the folder's single honest one
//       belongs to `./rssFeedRenderer.js`, which owns the element it qualifies.
//
//   Beyond the one reshaping, NOTHING is renamed. Interface parity is the
//   acceptance contract for this migration, so every other identifier keeps the
//   legacy CFML camelCase spelling it had, including a spelling a reader might
//   take for a typo.
//
// WHAT IS DELIBERATELY NOT PORTED FROM THE CONTROLLER
//   * THE REQUEST CONTEXT. `product(required struct rc)` took the FW/1 request
//     context and wrote a key onto it [feed.cfc:L58, L63]. T6 replaces ambient
//     request state with explicit values passed down the call chain, so that
//     mechanism does not survive: nothing in this file is named for it, no
//     parameter or field stands in for it, and no value is stashed anywhere for a
//     later layer to read back.
//   * THE LAYOUT SUPPRESSION. `request.layout = false;` [feed.cfc:L60], under the
//     legacy comment "Hide the layout" [feed.cfc:L59], is FW/1 view plumbing with no
//     counterpart in a function that returns a string. Not emulated, and no layout,
//     wrapper or template concept is introduced to give it somewhere to live.
//   * THE SMART LIST. The controller built one [feed.cfc:L63] and then configured
//     it [feed.cfc:L64-L72]. That generic, string-keyed, dynamically-filtered query
//     surface is narrowed to a typed projection across this whole migration, and
//     the narrowing of the SKU one is itself budget slot 2 above. Nothing here
//     references, re-exposes or re-implements it.
//   * THE FILTERS AND THE JOINS [feed.cfc:L64-L72]. They belong to
//     `./googleFeedRepository.js`, which already owns them and hard-codes them into
//     its statement text. They are invariants of what the feed MEANS rather than
//     options, so this module cannot switch one off and does not restate one. Four
//     selection conditions are always applied - the SKU is active, its product is
//     active, its product is published, and the product has a positive quantity
//     available to sell - and this file names them in prose exactly once, here, to
//     record that it neither adds to them nor subtracts from them.
//   * THE DOCUMENT ITSELF. Every element name, namespace, escape rule, hardcoded
//     item value and monetary presentation decision belongs to
//     `./rssFeedRenderer.js`.
//
// THE DEAD COLLABORATOR
//   [feed.cfc:L51] declares `property name="productService" type="any";` and the
//   method body never touches it - the only collaborator the body reaches for is
//   the SKU service, at [feed.cfc:L63]. It is DELIBERATELY NOT CARRIED FORWARD,
//   and the reasoning is on the constructor below. Neither is the SKU service
//   itself, because what it was used FOR is exactly what the repository replaced.
//
// THE TWO AMBIENT INPUTS THAT HAVE NO LAMBDA ANALOGUE
//   The legacy read both from ambient engine scopes that do not exist here, so
//   both arrive explicitly. Both are held on the instance rather than taken as
//   method arguments, because the port's one method is declared with NO
//   PARAMETERS and this class implements that contract exactly rather than
//   widening it.
//
//   * THE FEED HOST. The legacy template interpolated the engine's CGI host at
//     five sites [integrationServices/google/views/feed/product.cfm:L14, L15, L22,
//     L23, L24]. There is no CGI scope here, and a handler is the only layer that
//     can know the host, so the value is threaded down from
//     `src/handlers/productFeedHandler.ts` (planned) through the constructor and
//     handed to the renderer unchanged. This file reads no environment variable,
//     contributes nothing to `.env.example`, hardcodes no host and derives nothing
//     from a global.
//   * THE RANGE-START INSTANT. The legacy template called the engine's clock
//     [integrationServices/google/views/feed/product.cfm:L30] while rendering the
//     sale-price effective-date range. Reading a clock inside the pipeline would
//     make the document non-deterministic and its assertions time-dependent, so
//     the instant is supplied too. There is no clock read anywhere in this file.
//
//   ONE CONSEQUENCE, STATED PLAINLY FOR THE COMPOSITION ROOT: because both values
//   are request-scoped and both are held on the instance, AN INSTANCE OF THIS
//   CLASS REPRESENTS ONE FEED REQUEST. It must be constructed per invocation. A
//   warm execution container reuses module state, so hoisting an instance to
//   module scope would pin the host and the instant of whichever request happened
//   to create it and then serve them to every later request. The repository and the
//   renderer have no such constraint; this class does, and the constraint is
//   published here rather than left for a later author to discover.
//
// AN EXECUTION-MODEL MISMATCH, AND NOT A BUDGET OF ANY KIND
//   The legacy feed template sets a request timeout of 360 seconds at
//   [integrationServices/google/views/feed/product.cfm:L9]. This is the module the
//   renderer defers that observation to, so it is recorded here, once, as a
//   PLATFORM FACT about two different runtimes: the legacy engine allowed a
//   per-request timeout to be raised from a template, while a function here is
//   capped at 15 minutes and a gateway in front of it holds a connection for 29
//   seconds. Both figures are properties of the platforms, published by them.
//
//   NOTHING IS DERIVED FROM THAT. No service level, no target of any sort, no
//   refresh interval, no row cap and no document-size cap is asserted or implied
//   here, because the legacy system published none and none may be invented. The
//   feed generator is in-memory and has no such need. Nothing is added to work
//   around it either: no timeout, no cancellation signal, no retry, no circuit
//   breaker, no chunking, no paging, no streaming, no resume marker and no cache
//   appears below. One complete document in one pass, which is what the legacy
//   produced. Every decision in this file is justified by correctness and
//   fidelity, and not one of them by speed.
//
// A PUBLIC, UNAUTHENTICATED LEGACY ENDPOINT - RECORDED AS A FACT
//   The legacy action was reachable without credentials of any kind:
//   [feed.cfc:L54] declares the one method public, [feed.cfc:L55] declares no
//   admin-only method and [feed.cfc:L56] declares no secured method. That is a
//   factual property of the source, neither a defect to preserve nor a requirement
//   to satisfy. NO AUTHORIZATION IS INVENTED HERE: no key check, no signature
//   verification, no allow-list and no throttle. Should authorization ever be
//   wanted, it is a gateway concern owned outside this subtree, and it is not this
//   module's to assume.
//
// NO LIVE GOOGLE CALL, AND NO CREDENTIALS
//   The ported adapter remains a stub in the deliverable sense: it satisfies the
//   full contract surface and returns well-formed output, but performs no live
//   Google API call and requires no credentials. So there is no SDK here, no HTTP
//   client, no outbound request, no upload or submit step, no merchant identifier,
//   no endpoint and no credential read. The document is returned to the caller;
//   what a caller does with it is the caller's decision.
//
// NO ARITHMETIC, AND NO MONETARY VALUE TOUCHED
//   Money in this migration passes through one arithmetic surface and one only.
//   This module performs no arithmetic at all: it neither constructs, converts,
//   compares, formats nor inspects a monetary value. The repository constructs
//   money from the driver's decimal strings and the renderer presents it; a row
//   crosses this file as an opaque member of an array it never opens.
//
// PARAMETERIZED SQL - NOT APPLICABLE HERE, AND THE OBLIGATION TRANSFERS
//   The project standard is that every query uses prepared statements
//   exclusively, which is what preserves the injection-safety guarantee the legacy
//   query-parameter tag provided. It does not apply to this module, because this
//   module contains no query, no query fragment, no schema identifier and no
//   database access of any kind. The obligation transfers WHOLLY to
//   `./googleFeedRepository.js`, which is the only module in this folder that
//   reads. The transfer is worth stating rather than assuming, because the legacy
//   feed path contains not one parameterized query tag anywhere.
//
// NO LOGGING, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT
//   `src/lib/logger.ts` exists, it is structured, and it would have been available
//   here. It is deliberately not used. Nothing in this module's correctness
//   depends on a log line; the only data flowing through it IS feed row content,
//   which must not be written to a log; and a count or a duration would be exactly
//   the sort of figure this file is forbidden to publish. Observability belongs at
//   the boundary that owns the request - the entrypoint and the error mapper - and
//   the errors this module can surface are raised by the repository with enough
//   context to be actionable there. Nothing is swallowed here, so nothing needs to
//   be logged here to stay diagnosable.
//
// LAYER POSITION
//   A secondary adapter. It imports from `src/domain/**` and from its own two
//   siblings in `src/integrations/google/`, and it imports nothing from the
//   application-service tier and nothing from the handler tier - the relationship
//   with the composition root and the entrypoint is described in prose and exists
//   nowhere else in this file. Nothing under `src/domain/**` imports it either;
//   that direction is a build failure enforced by the ESLint
//   `no-restricted-imports` boundary. It exports no barrel and re-exports nothing,
//   it opens no connection and owns no pool, and it adds no dependency to the
//   pinned set: the three specifiers below are all first-party.
//
//   IT IS NOT A BUNDLE ENTRY POINT. The bundler's entrypoints are the routed
//   entrypoint and the five per-capability handlers under `src/handlers/`, of which
//   `src/handlers/productFeedHandler.ts` (planned) is the one that will reach this
//   module. Nothing in this folder is bundled directly; this module arrives in an
//   artifact only because an entrypoint imports it.
//
// THE CONSUMER CONTRACT, DESCRIBED AND NOT ASSUMED
//   Stated as PLANNED wiring, because neither consumer exists at this checkpoint:
//     * `src/handlers/bootstrap.ts` (planned) will be the SOLE place this class is
//       constructed and the sole place it is bound to `ProductFeedPort`. It is the
//       explicit composition root that replaces the framework's convention scan.
//     * `src/handlers/productFeedHandler.ts` (planned) will be the SOLE entrypoint
//       that drives it, and the sole holder of the incoming event from which the
//       feed host is derived.
//   This file neither creates, imports nor reference-imports either of them, and
//   it does not assume their internal shape.
//
// THE BINDING STANDARD
//   No user-specified rules were provided for this project. The rules document was
//   read to its end twice, once unbounded and once over an explicit range, and both
//   reads returned the same one-line sentinel, so the absence was VERIFIED, NOT
//   ASSUMED. Four consequences, each one binding on this file: no rule has been
//   invented to fill the gap; the absence is not licence to lower the bar, so the
//   enterprise substitute standard applies at full strength; zero files enter scope
//   by rule mandate, so there is no third rule-driven category of work here and no
//   rule conflict to resolve; and what binds instead is stated plainly - maximal
//   TypeScript strictness with no escape hatch, no suppression comment and no
//   non-null assertion; one arithmetic surface for money; no configuration literal
//   and no credential in application code; one cohesive exported unit per file with
//   no barrel; and an in-code annotation at every judgment call.
//
// WHERE THE ANNOTATIONS LAND IN THE ARTIFACTS
//   `tsconfig.build.json` sets `removeComments: false` because the annotations in
//   this file are part of the shipped deliverable, so it is worth stating exactly
//   where each of them ends up. Measured by compiling this module and reading both
//   emitted artifacts rather than assumed:
//     * This header, and every annotation on the class, its fields, its constructor
//       and its one method, survives in the emitted JavaScript - which is why the
//       import block below is ordered the way it is.
//     * The two annotations on the collaborator types survive in the emitted
//       DECLARATION file instead. A type alias is erased from the JavaScript
//       entirely and its comments are erased with it, so a declaration artifact is
//       the only place a type-level annotation can land.
//     * A LINE-comment banner attached to an erased alias reaches neither artifact,
//       because declaration emit copies only block-form doc comments. That is why
//       the collaborator-type reasoning below is written as doc blocks on the
//       aliases themselves and not as a banner above them.
//   All eight judgment calls therefore reach the deliverable, and none of them
//   depends on a comment placement that silently drops it.
//
// LICENSE
//   Derived from Slatwall 3.1.39, which is GPL v3.0 [readme.md:L20-L23]. The
//   special exception's sole literal path is `/integrationServices/`
//   [readme.md:L65], and this folder is the one that lifts logic OUT of that path
//   into `slatwall-ts/`, where the exception does not reach, so standard GPL v3.0
//   terms apply to this module. Attribution lives in `slatwall-ts/NOTICE-GPL.md`
//   and nowhere else; no license text is reproduced here and no license file is
//   authored or edited from here.
//
// TEST COVERAGE
//   NET-NEW, AND NET-NEW TWICE OVER. `meta/tests/**` contains nothing for the
//   Google subsystem - no controller test, no DAO test and no view test - so there
//   is no legacy antecedent to trace to; and this module has no legacy antecedent
//   of its own either, since the orchestration it performs was the framework's.
//   The obligation that every converted method carries a test is real and is
//   recorded here; it is NEVER to be presented as parity. This module's suite
//   belongs at `tests/unit/integrations/google/googleFeedService.test.ts` (planned)
//   and belongs to another author, so this file authors no test of its own. What it
//   does instead is stay assertable with nothing mocked beyond its own two
//   collaborators: both are injected, the host and the instant are explicit, there
//   is no ambient state, no clock read, no environment read and no I/O of its own,
//   so a suite can drive it with a fake row source and a capturing fake renderer
//   and assert the whole of its behaviour.
// ---------------------------------------------------------------------------

// THE RUNTIME IMPORT IS DELIBERATELY FIRST, and the ordering is load-bearing
// rather than stylistic. `tsconfig.build.json` sets `removeComments: false`
// because the annotations in this file are part of the shipped deliverable, but
// the compiler ERASES a type-only import statement entirely - and a comment block
// attached to an erased statement is erased with it. With a type-only import in
// first position the whole header above this line disappears from `build/**`.
// Verified by compiling both arrangements and reading the emitted JavaScript:
// anchoring the header to a statement that survives erasure is what keeps it in
// the artifact. `./rssFeedRenderer.js` is that statement, and it is a genuine
// runtime import - the renderer is called through it.
import { renderGoogleProductFeed } from './rssFeedRenderer.js';
import type { ProductFeedPort } from '../../domain/ports/productFeedPort.js';
import type { GoogleFeedRepository } from './googleFeedRepository.js';

// ---------------------------------------------------------------------------
// The two collaborator types. Both are supporting types co-located with the one
// principal exported unit below, and both are DERIVED FROM THE MODULE THAT OWNS
// THE CONTRACT rather than written out again here. Nothing is re-exported and
// there is no barrel, no `index.ts` and no `types.ts` anywhere in this subtree.
// ---------------------------------------------------------------------------

/**
 * The renderer collaborator: a pure function from rows, host and instant to a
 * complete document. Derived from `./rssFeedRenderer.js`, which owns it.
 *
 * JUDGMENT CALL: declared as `typeof` the sibling's own exported function instead
 * of re-stating its parameter list.
 *   Re-stating it would create a second, independent declaration of one contract -
 *   two places to keep in step, and a silent mismatch the day one of them changed.
 *   Deriving the type means the renderer's signature is the single source of truth
 *   for what this module may call: if that signature changes, this file stops
 *   compiling, which is the outcome to want. It also spares this file an import of
 *   the feed-row projection type, which it has no other reason to name - rows cross
 *   this module opaquely.
 */
export type GoogleProductFeedRenderer = typeof renderGoogleProductFeed;

/**
 * The row-source collaborator: the ONE repository capability this module consumes.
 * Derived from `./googleFeedRepository.js`, which owns it.
 *
 * JUDGMENT CALL: narrowed to a single method rather than typed as the whole
 * repository class, and narrowed by reference so that it tracks the real one.
 *   Two reasons, and the second is measured rather than asserted.
 *
 *   First, this module consumes exactly one capability and depending on more than
 *   it consumes would be depending on an accident. The repository's constructor
 *   collaborators, its statement text and its private hydration helpers are none of
 *   this module's business, and a narrowed type says so in a way the compiler
 *   enforces.
 *
 *   Second, TESTABILITY IS DECIDED BY THIS CHOICE, not by good intentions. The
 *   repository holds private fields, and TypeScript treats a class type with
 *   private members as satisfiable only by that class - an object literal is
 *   rejected outright for missing the private members, even when every public
 *   member matches. Verified by compiling both forms: the class type rejects a
 *   structural stand-in, and this narrowed type accepts both a real repository
 *   instance and a structural one. So typing the parameter as the class would have
 *   forced every suite to reach through the repository's own database collaborator
 *   to exercise an orchestration that has nothing to do with a database. The
 *   narrowed type is what lets a suite hand this class canned rows directly.
 *
 *   It is a NARROWING and never a widening: a real repository instance satisfies it
 *   without a cast, and no member the repository does not declare is admitted.
 */
export type GoogleProductFeedRowSource = Pick<GoogleFeedRepository, 'fetchProductFeedRows'>;

/**
 * Orchestrates the Google Merchant Center product feed.
 *
 * THE PRINCIPAL EXPORTED UNIT of this module, and the implementation of
 * {@link ProductFeedPort}. The `implements` clause is deliberate and is the parity
 * proof: it makes the match between this class and the declared capability a
 * COMPILER CHECK rather than a review comment, and it compiles without a cast.
 *
 * Its whole behaviour is three steps in one order - read the qualifying rows,
 * render them, return the document - and the value of the class is that the order
 * is stated once, in one place, explicitly.
 *
 * JUDGMENT CALL: the exported class is named `GoogleFeedService`, following the
 * sibling adapter's precedent.
 *   Interface parity binds METHOD names, and the one method below carries its
 *   provenance explicitly. It does not bind the type name, because there is no
 *   legacy type name to bind: the legacy component's identity was its dotted path,
 *   of which the bare word `feed` was only a filename segment, and a controller in
 *   that framework had no exported type at all. The name matches this module's file
 *   name and reads unambiguously alongside `GoogleFeedRepository` and
 *   `GoogleIntegration`.
 *
 * JUDGMENT CALL: BOTH collaborators are CONSTRUCTOR-INJECTED, which is what
 * replaces the framework's dependency injection with wiring the compiler checks.
 *   The legacy controller declared its collaborators as bare properties
 *   [integrationServices/google/controllers/feed.cfc:L51-L52] and the container
 *   resolved them at runtime by scanning the source tree for that convention. Here
 *   they are constructor parameters: a missing or mistyped collaborator is a
 *   compile error rather than a lookup that fails on the first request, the whole
 *   graph is assembled once in the composition root, and the container's
 *   first-scan lock disappears along with the container itself. It is hand-wiring
 *   ON PURPOSE - removing the container is the point, so no container, service
 *   locator, registry, factory-of-factories, decorator or metadata reflection
 *   appears here, and the pinned dependency set holds no container package for one
 *   to be assembled from.
 *
 *   Nothing is constructed here either. This class never builds its own row source,
 *   holds no module-level instance of one and has no lazy accessor that would
 *   build one on first use; the instance arrives through the constructor. It owns
 *   no connection and no pool, and it never touches a database driver: connection
 *   ownership belongs entirely to `src/repositories/mysql/connection.ts`, whose
 *   executor is injected into the ROW SOURCE and not into this class.
 *
 *   Injection is also the whole of this class's testability, which is why it is a
 *   design decision and not a formality: with both collaborators supplied, and the
 *   host and the instant supplied too, a suite can hand it a row source returning
 *   canned rows and a capturing renderer, then assert exactly what it forwarded.
 *
 * JUDGMENT CALL: the renderer parameter names the real renderer as its DEFAULT.
 *   The renderer is a pure, stateless module-level function - no construction, no
 *   configuration, no state - so naming it in the signature states the production
 *   collaborator exactly once, where it is visible and compile-checked, while still
 *   leaving the seam substitutable by the composition root or by a suite. It also
 *   makes the import of the renderer a genuine runtime import, which is what
 *   carries this file's annotations into the emitted artifact for the reason given
 *   above the import block. The row source has no default and must not acquire one:
 *   there is no sensible production instance of it to name from here.
 *
 * AN INSTANCE REPRESENTS ONE FEED REQUEST. The feed host and the range-start
 * instant are request-scoped values held on the instance, so the composition root
 * must construct this class per invocation and must not hoist an instance to
 * module scope, where a warm container would share one request's host and instant
 * with every later request. Both fields are read-only, this class mutates neither,
 * and it holds nothing else: there is no module-scope state in this file at all -
 * no counter, no memo and no cache - so two instances never interfere.
 *
 * @example
 * ```ts
 * // In the composition root, once per invocation, with the host taken from the
 * // incoming event and the instant taken at the start of handling:
 * const feedService = new GoogleFeedService(rowSource, feedHost, invocationInstant);
 * const feedDocument = await feedService.generateProductFeed();
 * ```
 */
export class GoogleFeedService implements ProductFeedPort {
  /**
   * The only route to feed data from this class.
   *
   * Typed to the one capability consumed, so no statement text, no schema
   * identifier and no database collaborator is reachable from here.
   */
  private readonly repository: GoogleProductFeedRowSource;

  /**
   * The host written into the document's links, supplied by the caller.
   *
   * Passed to the renderer verbatim. It is not parsed, trimmed, lower-cased,
   * validated, prefixed with a scheme or defaulted - the legacy interpolated
   * whatever the engine reported and checked nothing, so a guard here would add
   * behaviour the legacy never had. Escaping it is the renderer's job and is done
   * exactly once, there.
   */
  private readonly feedHost: string;

  /**
   * The instant that opens each item's sale-price effective-date range.
   *
   * Held rather than read, so this class has no clock. It is handed to the
   * renderer unchanged and is never mutated here.
   */
  private readonly now: Date;

  /**
   * The document renderer, defaulted to the real one.
   */
  private readonly renderFeed: GoogleProductFeedRenderer;

  constructor(
    repository: GoogleProductFeedRowSource,
    feedHost: string,
    now: Date,
    renderFeed: GoogleProductFeedRenderer = renderGoogleProductFeed,
  ) {
    this.repository = repository;
    this.feedHost = feedHost;
    this.now = now;
    this.renderFeed = renderFeed;
  }

  /**
   * Builds the product feed document.
   *
   * THE RESHAPED SIGNATURE, recorded here in full so that the migration's
   * three-slot reshaping budget can be audited from this comment alone.
   *
   * JUDGMENT CALL: this is RESHAPING #3 OF THE 3 PERMITTED FOR THE WHOLE
   * MIGRATION, and it is spent once, here.
   *
   *   LEGACY  `public void function product(required struct rc)`
   *           [integrationServices/google/controllers/feed.cfc:L58]
   *           (body L58-L73; component L49-L74)
   *   TARGET  `async generateProductFeed(): Promise<string>`
   *
   *   The legacy method was named `product`, RETURNED `void`, and produced its
   *   result as a SIDE EFFECT: it wrote `rc.skuSmartList` onto the FW/1 request
   *   context [feed.cfc:L63] and let the framework resolve a view that read that
   *   one key back [integrationServices/google/views/feed/product.cfm:L8]. The
   *   document string existed nowhere in that control flow - it only ever appeared
   *   as rendered template output.
   *
   *   The target RETURNS THE DOCUMENT. That inversion is the entire substance of
   *   the reshaping: no request context, no view resolution and no side effect. The
   *   rename follows from it - `product` was a framework ACTION name, meaningful
   *   only as the second half of a routing pair, and a method that returns a feed
   *   document is not called `product` in any style. Interface parity is the
   *   acceptance contract for this migration, so the legacy name and its locator are
   *   recorded above rather than left for a reviewer to reconstruct.
   *
   *   The other two slots are spent elsewhere and are named in this file's header:
   *   the two order-amount methods returning intents instead of mutating in place,
   *   and the two smart-list renames. A FOURTH RESHAPING ANYWHERE IS A GATE
   *   FAILURE, and this folder holds no other budget either - zero visibility
   *   widenings, zero entity signature widenings and zero deliberate divergences.
   *
   * JUDGMENT CALL: NO PARAMETERS, and no criteria type is invented to carry any.
   *   Settled by reading [feed.cfc:L58-L73] rather than by preference. Every
   *   reference to the request context in that body is a WRITE - the selection is
   *   assigned onto it, then configured - and NOTHING is read back out of it. The
   *   selection factory was called with no arguments, so not even the legacy
   *   dynamic filter surface reached it. The legacy action therefore took no
   *   caller-supplied narrowing whatsoever.
   *
   *   {@link ProductFeedPort} declares this method with no parameters, and this
   *   class matches that declaration exactly rather than widening it. Declaring a
   *   named-but-empty criteria type to look like an input contract would be
   *   inventing a requirement the source does not supply, so none is declared here
   *   or anywhere in the feed path. Nothing speculative is added either: no
   *   include-inactive, include-unpublished, include-out-of-stock or minimum-
   *   quantity switch, no filter array, no predicate, no options object, no boolean
   *   toggle, no paging, limit, offset or cursor, no sort, no locale, no currency
   *   selector, no format discriminator, no channel or destination, no site or
   *   store selector, no since-marker, no compression, no chunk size, no callback,
   *   no streaming and no cancellation signal. The two values the method does need
   *   are request-scoped and arrive through the constructor.
   *
   *   The four selection conditions are consequently unreachable from a caller,
   *   which is what makes them invariants of the feed rather than defaults of a
   *   query. They are enforced in `./googleFeedRepository.js`.
   *
   * JUDGMENT CALL: the dead collaborator is NOT carried forward.
   *   [integrationServices/google/controllers/feed.cfc:L51] declares
   *   `property name="productService" type="any";` and the method body never uses
   *   it - the only collaborator the body reaches for is the SKU service at
   *   [feed.cfc:L63]. Porting it would add an unused constructor parameter and make
   *   the composition root state a dependency this module does not have. Parity
   *   binds the METHOD surface, not a collaborator nothing calls, so omitting it is
   *   parity-preserving rather than a divergence. The SKU service at [feed.cfc:L63]
   *   is not carried forward either: what it was used for - building and
   *   configuring the selection - is precisely what the row source replaced.
   *
   * ASYNCHRONOUS BECAUSE IT READS. The async boundary in this migration is a
   * documented contract rather than a preference: a method is asynchronous if and
   * only if its legacy body reached the DAO or the ORM. This one did, so the
   * repository call is awaited. The renderer is pure and synchronous and is
   * therefore NOT awaited - awaiting a value that is not a promise would be noise
   * that also misrepresents the renderer's contract.
   *
   * A ZERO-ROW FEED IS AN ORDINARY OUTCOME, not an error and not an empty string.
   * Nothing here short-circuits on an empty array, because the renderer emits a
   * complete, well-formed document with no items - which is exactly what the legacy
   * loop produced over an empty record set.
   *
   * NOTHING IS CAUGHT AND NOTHING IS DEFAULTED. A read failure, a malformed column
   * or a malformed decimal numeral propagates out of the repository unchanged, to be
   * mapped to a response by the layer that owns the request. Swallowing one here
   * would mean returning a document that silently omitted products a merchant is
   * advertising.
   *
   * @returns the whole feed as a single RSS 2.0 document string, produced in one
   *   pass, for machine consumption by Google Merchant Center. It is the renderer's
   *   string, returned unchanged: this method does not wrap, trim, re-encode,
   *   compress or post-process it, and it is not a user interface and is never
   *   rendered to one.
   * @throws whatever the row source raises - a column narrowing failure, a
   *   malformed monetary numeral, or a driver-level read failure. This method adds
   *   no failure mode of its own.
   */
  async generateProductFeed(): Promise<string> {
    // CFML parity [integrationServices/google/controllers/feed.cfc:L58-L73]: the legacy performed
    // one selection and then rendered it once, in that order, for one request. The same two steps
    // in the same order, with the row order left exactly as the source returns it - the legacy
    // applied no ordering, so imposing one here would be a repair rather than a port.
    //
    // "Create the product feed" [integrationServices/google/controllers/feed.cfc:L62].
    const rows = await this.repository.fetchProductFeedRows();

    // Straight through: the rows are neither filtered, sorted, sliced, mapped nor copied, and the
    // host and the instant are forwarded exactly as they were supplied.
    return this.renderFeed(rows, this.feedHost, this.now);
  }
}
