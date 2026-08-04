// ---------------------------------------------------------------------------
// Google Merchant Center product feed - orchestration
//
// This module owns ONE decision: the ORDER of two collaborators. `./googleFeedRepository.js`
// decides which SKUs qualify; `./rssFeedRenderer.js` decides the document's shape and its escaping.
// Nothing here selects, sorts, formats or escapes, and no business rule lives here.
//
// IT HAS NO LEGACY ANTECEDENT. In the CFML original the framework was the orchestrator: a
// controller action wrote a query onto the request context and the framework resolved a template
// that read it back. Removing the framework leaves that sequencing unowned, and this is where it
// becomes explicit.
//
// PROVENANCE
//
//   REPLACES the controller and its single action
//   [integrationServices/google/controllers/feed.cfc:L49-L74].
//   NOT PORTED: a controller component with an empty body and no methods
//   [integrationServices/google/controllers/main.cfc:L49-L52], and one line of admin markup
//   advertising the feed URL [integrationServices/google/views/main/default.cfm:L50], from a
//   subsystem that is out of scope.
//
// NOT PORTED FROM THE CONTROLLER, AND WHY
//
//   * The request context the action wrote to and never read back
//     [integrationServices/google/controllers/feed.cfc:L63]: a return value replaces it.
//   * The layout suppression [integrationServices/google/controllers/feed.cfc:L60]: there is no
//     template engine to suppress.
//   * The smart list with its joins, filters and range
//     [integrationServices/google/controllers/feed.cfc:L64-L72]. Its four selection invariants -
//     SKU active, product active, product published, positive quantity available to sell - are
//     enforced in `./googleFeedRepository.js`, where the statement lives.
//   * The template itself, replaced by `./rssFeedRenderer.js`.
//   * A dead collaborator [integrationServices/google/controllers/feed.cfc:L51]: the component
//     declares a `productService` property that the action never touches, so porting it would make
//     the composition root state a dependency this module does not have.
//
// THE TWO AMBIENT INPUTS THAT HAVE NO LAMBDA ANALOGUE, AND ARE THEREFORE CONSTRUCTOR PARAMETERS
//
//   THE FEED HOST. The legacy interpolated `CGI.HTTP_HOST` - the request's own `Host` header - into
//   five URL sites of the document, from the channel link through the additional image links
//   [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24], and validated
//   nothing. That one value decides the ORIGIN a shopper follows, so it is validated before it
//   reaches this class - but NOT BY THIS CLASS, and not as a branded type. This paragraph said
//   otherwise for one revision, naming a `TrustedFeedHost` brand and a `toTrustedFeedHost` mint
//   that this module exported; both were withdrawn, and the record of that removal is immediately
//   above the class. The two checks that replaced them each sit where their subject is:
//
//     GRAMMAR is `./rssFeedRenderer.js`'s, which refuses a scheme, credentials, a path, a query, a
//     fragment, whitespace, control characters, a non-ASCII byte and emptiness, and throws instead
//     of emitting a document. It is the only thing that concatenates the value, so it is the only
//     thing that needs the grammar.
//
//     MEMBERSHIP is `src/handlers/bootstrap.ts`'s, against `AppConfig.feed.allowedHosts`. A
//     REQUEST-DERIVED CANDIDATE IS THEREFORE ADMISSIBLE, in one narrow sense only: it can select
//     among hosts the deployment has already approved, and it can never introduce one. An empty
//     allow-list refuses everything, which is the safe failure and not a bypass.
//
//   THE RANGE-START INSTANT. The legacy template called `now()` inline while rendering each item's
//   sale-price effective-date range [integrationServices/google/views/feed/product.cfm:L30]. Here
//   the instant is captured once by the caller and passed in, so one document cannot straddle two
//   clock readings and a suite can pin it.
//
// AN INSTANCE REPRESENTS ONE FEED REQUEST. Both of those values are request-scoped and are held on
// the instance, so `src/handlers/bootstrap.ts` constructs this class inside the per-invocation
// request scope. Hoisting an instance to module scope would let a warm container serve one request's
// host and instant to every later request.
//
// THE CONSUMERS. `src/handlers/router.ts` owns the route - `GET /feeds/google/products`, capability
// `productFeed`, action `generateProductFeed` - and `src/handlers/bootstrap.ts` is the only place
// this class is constructed, from the candidate host and allow-list it is given. There is no
// separate feed handler module in the subtree.
//
// AN EXECUTION-MODEL DIFFERENCE. The legacy template raised its own request timeout to 360 seconds
// [integrationServices/google/views/feed/product.cfm:L9]. There is no per-template equivalent here
// and none is introduced: the whole document is built in memory in a single pass, and this module
// declares no timeout, budget or size limit of its own.
//
// THE LEGACY ENDPOINT WAS PUBLIC AND UNAUTHENTICATED - recorded as a fact about the source rather
// than as a target requirement: the action is listed as a public method, with the admin and secure
// method lists left empty [integrationServices/google/controllers/feed.cfc:L54-L56]. Authorization
// is not this module's concern, and none is silently added here.
//
// THE ADAPTER PERFORMS NO LIVE GOOGLE CALL. It builds a document and returns it; nothing here opens
// a socket, holds a credential or talks to Merchant Center.
//
// LAYER POSITION. A secondary adapter with three first-party imports - the domain port it implements
// and its two siblings - and nothing from `src/handlers/**` or `src/repositories/**`. There is no
// barrel in this subtree, and this file is not a bundle entry point.
//
// LICENSE. Derived from Slatwall 3.1.39, which is GPL v3.0 [readme.md:L20-L23]. The special
// exception's sole literal path is `/integrationServices/` [readme.md:L65], and this folder lifts
// logic out of that path into `slatwall-ts/`, where the exception does not reach, so standard GPL
// v3.0 terms apply. Attribution lives in `slatwall-ts/NOTICE-GPL.md`.
// ---------------------------------------------------------------------------

// The first import is deliberately a RUNTIME import: `tsconfig.build.json` keeps comments, but the
// compiler erases a type-only import statement together with the comment block attached to it, so
// anchoring this header to `./rssFeedRenderer.js` is what keeps it in `build/**`.
import { renderGoogleProductFeed } from './rssFeedRenderer.js';
import type { FeedUrlScheme } from '../../lib/config.js';
import type { ProductFeedPort } from '../../domain/ports/productFeedPort.js';
import type { GoogleFeedRepository } from './googleFeedRepository.js';

export type GoogleProductFeedRenderer = typeof renderGoogleProductFeed;

/**
 * The row-source collaborator: the ONE repository capability this module consumes. Derived from
 * `./googleFeedRepository.js`, which owns it.
 *
 * JUDGMENT CALL: narrowed to the one method consumed rather than typed as the whole repository
 * class, and narrowed by reference so that it tracks the real one. Two consequences.
 *
 *   The repository's constructor collaborators, its statement text and its private hydration
 *   helpers are none of this module's business, and a narrowed type says so in a way the compiler
 *   enforces.
 *
 *   TESTABILITY IS DECIDED HERE. The repository holds private fields, and TypeScript treats a class
 *   type with private members as satisfiable only by that class, so an object literal is rejected
 *   for missing them even when every public member matches. Typing the parameter as the class would
 *   force every suite to reach through the repository's own database collaborator to exercise an
 *   orchestration that has nothing to do with a database.
 *
 *   It is a NARROWING and never a widening: a real repository instance satisfies it without a cast,
 *   and no member the repository does not declare is admitted.
 */
export type GoogleProductFeedRowSource = Pick<GoogleFeedRepository, 'fetchProductFeedRows'>;

// ---------------------------------------------------------------------------
// THE FEED HOST IS A PLAIN STRING, AND NO HOST POLICY LIVES IN THIS MODULE
//
// Every absolute URL in the document - the channel link, the channel description,
// each item's link, its image link and each additional image link - is built by
// prefixing one host string [integrationServices/google/views/feed/product.cfm:L14,
// L15, L22, L23, L24]. That single value therefore decides the ORIGIN of the whole
// feed, which is a security property and not a formatting one: XML escaping stops
// markup injection, and stops nothing about where a link points.
//
// (A comments review de-duplicated this paragraph, which also carried the legacy's
// `CGI.HTTP_HOST` provenance a second time; that fact now appears once, on the
// constructor parameter where a caller reads it. The same review compressed the five
// locators above to a `L14-L24` RANGE, and that compression is declined: L16-L21 are
// the item loop, `g:id`, `title`, `description`, `g:google_product_category` and
// `g:product_type`, and not one of them interpolates the host. A range there would
// claim six lines that carry no host, which the review's own locator-truth standard
// forbids.)
//
// TWO OBLIGATIONS FOLLOW, AND NEITHER ONE IS THIS MODULE'S TO DISCHARGE.
//
//   SHAPE is enforced by `./rssFeedRenderer.js`, which refuses a scheme, a path,
//   credentials, a query, a fragment, whitespace, control characters and emptiness,
//   and THROWS rather than emitting a partial document. That check is real, it is
//   reached on every render, and it is where the constraint belongs: the renderer is
//   the only thing that concatenates the value.
//
//   PROVENANCE is the composition root's, and it is stated as a documented obligation
//   on the constructor parameter below. A shape check cannot answer it - `evil.test`
//   is a perfectly well-formed host - so the requirement that the value come from
//   configuration rather than from a request header is expressed where the value is
//   chosen, not where it is consumed.
//
// ★ AN ALLOW-LIST SUBSYSTEM LIVED HERE FOR ONE REVISION, AND THIS IS THE RECORD OF
// ITS REMOVAL. This module exported `UntrustedFeedHostError`, a branded
// `TrustedFeedHost` type, a `toTrustedFeedHost(candidate, allowedHosts)` mint that
// trimmed, lower-cased, shape-checked and then allow-list-checked its input, and a
// second private copy of the renderer's host grammar plus an
// `assertConfiguredFeedHost` constructor guard. The constructor took the branded type,
// and `src/handlers/bootstrap.ts` grew a `FeedHostRequest` input carrying an
// `allowedHosts` list to feed it.
//
// The reasoning was that reproduce-rather-than-repair "governs business behaviour -
// discount arithmetic, use limits, price cascades - where changing an outcome changes
// what a merchant charges", and "is not a licence to carry a trust decision the legacy
// never had to make", because `CGI.HTTP_HOST` was resolved behind a fixed virtual host
// whereas this value arrives from an event whose `Host` header the caller chooses.
// THAT ARGUMENT IS SOUND AS FAR AS IT GOES, AND IT IS NOT THIS MODULE'S TO ACT ON. The
// legacy endpoint is public and unauthenticated as a matter of verified source fact -
// `this.publicMethods="product"`, `this.anyAdminMethods=""`, `this.secureMethods=""`
// [integrationServices/google/controllers/feed.cfc:L54-L56] - and this module's
// authority records that as a source property while excluding an allow-list by name,
// alongside an API key, a token check, a signature check and a rate limit:
// authorization, if it is ever added, is an API Gateway concern owned outside this
// subtree. An allow-list authored here is an invented requirement, and an invented
// requirement is not made admissible by being a careful one.
//
// NOTHING THAT WAS ACTUALLY CHECKING ANYTHING WAS LOST. The shape half was a SECOND
// copy of a grammar the renderer already enforces identically and still enforces; only
// the moment of refusal moved, from construction to render. The provenance half was
// never a check this module could perform - it was a type brand asserting that someone
// else had checked, and the brand is erased at runtime. What replaces it is the
// obligation written on the parameter, which is the same thing the brand was
// communicating, minus the exported surface and minus the claim to be enforcing it.
// ---------------------------------------------------------------------------

/**
 * Orchestrates the Google Merchant Center product feed.
 *
 * THE PRINCIPAL EXPORTED UNIT of this module, and the implementation of {@link ProductFeedPort}.
 * The `implements` clause is the parity proof: it makes the match between this class and the
 * declared capability a COMPILER CHECK rather than a review comment, and it compiles without a
 * cast. The whole behaviour is three steps in one order - read the qualifying rows, render them,
 * return the document - and the value of the class is that the order is stated once, explicitly.
 *
 * JUDGMENT CALL: the exported class is named `GoogleFeedService`, following the sibling adapter's
 * precedent. Interface parity binds METHOD names, and the one method below carries its provenance
 * explicitly. It does not bind the type name, because there is no legacy type name to bind: the
 * legacy component's identity was its dotted path, of which the bare word `feed` was only a
 * filename segment, and a controller in that framework had no exported type at all.
 *
 * JUDGMENT CALL: BOTH collaborators are CONSTRUCTOR-INJECTED, which is what replaces the
 * framework's dependency injection with wiring the compiler checks. The legacy controller declared
 * its collaborators as bare properties [integrationServices/google/controllers/feed.cfc:L51-L52]
 * and the container resolved them at runtime by scanning the source tree for that convention. Here
 * they are constructor parameters: a missing or mistyped collaborator is a compile error rather
 * than a lookup that fails on the first request, the whole graph is assembled once in the
 * composition root, and the container's first-scan lock disappears along with the container itself.
 * Hand-wiring is the point, so no container, service locator, registry or metadata reflection
 * appears here.
 *
 *   Nothing is constructed here either. This class never builds its own row source, holds no
 *   module-level instance of one and has no lazy accessor that would build one on first use.
 *   Connection ownership belongs entirely to `src/repositories/mysql/connection.ts`, whose executor
 *   is injected into the ROW SOURCE and not into this class.
 *
 * JUDGMENT CALL: the renderer parameter names the real renderer as its DEFAULT. The renderer is a
 * pure, stateless module-level function, so naming it in the signature states the production
 * collaborator exactly once, where it is visible and compile-checked, while still leaving the seam
 * substitutable by the composition root or by a suite. It also makes the import of the renderer a
 * genuine runtime import, which is what carries this file's annotations into the emitted artifact.
 * The row source has no default and must not acquire one: there is no sensible production instance
 * of it to name from here.
 *
 * AN INSTANCE REPRESENTS ONE FEED REQUEST. The feed host and the range-start instant are
 * request-scoped values held on the instance, so the composition root must construct this class per
 * invocation and must not hoist an instance to module scope, where a warm container would share one
 * request's host and instant with every later request. Both fields are read-only and this class
 * holds nothing else, so two instances never interfere.
 *
 * @example
 * ```ts
 * // In the composition root, once per invocation, with the host taken from
 * // CONFIGURATION and never from the incoming request's `Host` header - see the
 * // constructor's own note on that obligation - and the instant taken at the start
 * // of handling:
 * const feedService = new GoogleFeedService(rowSource, configuredFeedHost, invocationInstant);
 * const feedDocument = await feedService.generateProductFeed();
 * ```
 */

/**
 * Orchestrates the Google Merchant Center product feed.
 *
 * THE PRINCIPAL EXPORTED UNIT of this module and the implementation of {@link ProductFeedPort}. The
 * `implements` clause is the parity proof: it makes the match between this class and the declared
 * capability a compiler check rather than a review comment. The whole behaviour is three steps in
 * one order - read the qualifying rows, render them, return the document - and the value of the
 * class is that the order is stated once, explicitly.
 *
 * JUDGMENT CALL: BOTH COLLABORATORS ARE CONSTRUCTOR-INJECTED, which is what replaces the framework's
 * dependency injection with wiring the compiler checks. The legacy controller declared its
 * collaborators as bare properties [integrationServices/google/controllers/feed.cfc:L51-L52] and the
 * container resolved them at runtime by scanning the source tree for that convention. Here a missing
 * or mistyped collaborator is a compile error rather than a lookup that fails on the first request.
 * Nothing is constructed here either: this class never builds its own row source and has no lazy
 * accessor that would build one, so connection ownership stays with
 * `src/repositories/mysql/connection.ts`, whose executor is injected into the ROW SOURCE.
 *
 * JUDGMENT CALL: the renderer parameter names the real renderer as its DEFAULT. The renderer is a
 * pure, stateless module-level function, so naming it in the signature states the production
 * collaborator once, where it is compile-checked, while leaving the seam substitutable. The row
 * source has no default and must not acquire one: there is no sensible production instance of it to
 * name from here.
 *
 * AN INSTANCE REPRESENTS ONE FEED REQUEST. The feed host and the range-start instant are
 * request-scoped values held on the instance, so it is constructed per invocation and never hoisted
 * to module scope, where a warm container would share one request's host and instant with every
 * later request. Both fields are read-only and this class holds nothing else, so two instances never
 * interfere.
 */
export class GoogleFeedService implements ProductFeedPort {
  private readonly repository: GoogleProductFeedRowSource;

  /**
   * The host written into the document's links.
   *
   * NOT parsed, trimmed, lower-cased, prefixed with a scheme or defaulted here. Those
   * omissions are deliberate and are each a different decision from validating: the
   * scheme is the renderer's own literal, trimming would silently accept a padded value
   * and change it, and there is no host this class could sensibly default to. Escaping
   * is the renderer's job and happens exactly once, there.
   *
   * NOT SHAPE-CHECKED HERE EITHER, and that is not the same as unchecked. `./rssFeedRenderer.js`
   * refuses a scheme, a path, credentials, a query, a fragment, whitespace, control
   * characters and emptiness, and it THROWS rather than emitting a document whose every
   * link points somewhere else. Since this class passes the value to the renderer and
   * does nothing else with it, a second copy of that grammar here would refuse the same
   * inputs a few microseconds earlier and add an exported surface to this module to do
   * it - see the record above the class for the revision that tried exactly that.
   *
   * WHERE IT MUST COME FROM is stated on the constructor parameter, because provenance
   * is the one part of this contract no check in this file could answer.
   *
   * ONE MORE REASON NOT TO RE-NORMALISE HERE, carried over from a comments review whose
   * surrounding text described a withdrawn in-module allow-list: the composition root
   * TRIMS AND LOWER-CASES the candidate in order to compare it against the list, and
   * hands over the normalised form. Trimming or re-casing again here could only make the
   * emitted host differ from the one that was actually matched, which would quietly
   * publish an origin the allow-list never approved.
   */
  private readonly feedHost: string;

  /**
   * The scheme half of the canonical feed origin, completing {@link feedHost}.
   *
   * SECURITY REVIEW DISPOSITION - RAISED AS S-09, CWE-319, ACCEPTED. The legacy wrote the
   * literal `http://` at five sites [integrationServices/google/views/feed/product.cfm:L14,
   * L15, L22, L23, L24]; this port takes the scheme from deployment configuration instead,
   * where `https` is the default and `http` is refused in production. It is held here for
   * the same reason the host is - so no instance can exist without the whole origin it will
   * publish - and forwarded to the renderer unchanged.
   *
   * IT NEEDS NO CONSTRUCTOR CHECK, unlike the host. The host arrives as a string whose shape
   * must be proved; the scheme arrives as a two-member union that only
   * `resolveFeedUrlScheme` can mint from a string, so a value reaching here from compiling
   * code is already one of the two permitted ones.
   */
  private readonly feedScheme: FeedUrlScheme;

  /**
   * The instant that opens each item's sale-price effective-date range. Held rather than read, so
   * this class has no clock; handed to the renderer unchanged and never mutated here.
   */
  private readonly now: Date;

  private readonly renderFeed: GoogleProductFeedRenderer;

  /**
   * Constructs one feed request.
   *
   * @param repository the sole route to feed data.
   * @param feedHost the origin host written into all five URL sites of the rendered
   *   document.
   *
   *   ★★★ IT MUST COME FROM CONFIGURATION AND NEVER FROM A REQUEST, AND THAT IS AN
   *   OBLIGATION ON THE CALLER RATHER THAN A CHECK PERFORMED HERE. The legacy read
   *   `CGI.HTTP_HOST` [integrationServices/google/views/feed/product.cfm:L14, L15,
   *   L22, L23, L24] - the request's own `Host` header, which a client chooses - so a
   *   caller that forwards an event header here reproduces a client-steerable catalog
   *   origin in a document a third party fetches and follows. No check in this file
   *   could catch that: provenance is not a property of the string, and `evil.test` is
   *   a perfectly well-formed host. `./rssFeedRenderer.js` refuses a MALFORMED origin
   *   and cannot refuse a well-formed untrusted one either.
   *
   *   So it is written here, on the parameter, in the one place a caller reads before
   *   supplying the value. The legacy endpoint is public and unauthenticated as a
   *   matter of source fact [integrationServices/google/controllers/feed.cfc:L54-L56],
   *   no allow-list belongs in this subtree, and origin policy - if a deployment wants
   *   one - is an API Gateway concern owned outside it.
   *
   *   THE COMPOSITION ROOT DOES HONOUR IT, and naming where keeps this paragraph checkable:
   *   `src/handlers/bootstrap.ts` refuses a host that is not on the DEPLOYMENT-OWNED allow-list
   *   in `AppConfig.feed.allowedHosts` before it ever constructs this service, which is the
   *   configuration boundary this parameter defers to. That check is NOT in this file and must
   *   not be moved into it: this module may hold no allow-list, and a request may not supply one.
   *
   *   WHICH MAKES A FORWARDED HEADER SAFE WITHOUT MAKING IT TRUSTED, and a comments review
   *   put that distinction better than the paragraph above did: where a deployment has
   *   supplied a list, the header can only SELECT AMONG ALREADY-APPROVED ORIGINS AND CAN
   *   NEVER INTRODUCE ONE. The obligation on this parameter is unchanged - a caller that
   *   forwards a header is relying entirely on that list being configured - but the failure
   *   mode is a refusal at the root, not a poisoned document.
   * @param feedScheme the scheme half of the canonical origin, from deployment
   *   configuration. See {@link GoogleFeedService.feedScheme} for the S-09 disposition and
   *   why this one takes no constructor check while the host does.
   * @param now the instant that opens each item's sale-price effective-date range.
   * @param renderFeed the document renderer, defaulted to the real one.
   */
  constructor(
    repository: GoogleProductFeedRowSource,
    feedHost: string,
    feedScheme: FeedUrlScheme,
    now: Date,
    renderFeed: GoogleProductFeedRenderer = renderGoogleProductFeed,
  ) {
    this.repository = repository;
    this.feedHost = feedHost;
    this.feedScheme = feedScheme;
    this.now = now;
    this.renderFeed = renderFeed;
  }

  /**
   * Builds the product feed document.
   *
   * JUDGMENT CALL: THE RESHAPED SIGNATURE, and one of the three the plan permits for the whole
   * migration. The other two are the order-amount methods returning applied intents instead of
   * mutating an order aggregate, and the smart-list methods becoming typed repository queries.
   *
   *   LEGACY  `public void function product(required struct rc)`
   *           [integrationServices/google/controllers/feed.cfc:L58]
   *   TARGET  `async generateProductFeed(): Promise<string>`
   *
   *   The legacy method returned `void` and produced its result as a SIDE EFFECT: it wrote the
   *   selection onto the request context [integrationServices/google/controllers/feed.cfc:L63] and
   *   let the framework resolve a template that read that one key back
   *   [integrationServices/google/views/feed/product.cfm:L8]. The document string existed nowhere in
   *   that control flow. Returning it is the whole substance of the reshaping, and the rename
   *   follows from it: `product` was a framework ACTION name, meaningful only as half of a routing
   *   pair.
   *
   * JUDGMENT CALL: NO PARAMETERS, and no criteria type is invented to carry any. Settled by reading
   * [integrationServices/google/controllers/feed.cfc:L58-L73]: every reference to the request context
   * in that body is a WRITE, nothing is read back out of it, and the selection factory was called
   * with no arguments, so the legacy action took no caller-supplied narrowing at all.
   * {@link ProductFeedPort} declares this method with no parameters and this class matches it rather
   * than widening it. The four selection conditions are consequently unreachable from a caller,
   * which is what makes them invariants of the feed rather than defaults of a query; they are
   * enforced in `./googleFeedRepository.js`.
   *
   * JUDGMENT CALL: the dead collaborator is NOT carried forward.
   * [integrationServices/google/controllers/feed.cfc:L51] declares a `productService` property that
   * the body never uses - the only collaborator it reaches for is the SKU service
   * [integrationServices/google/controllers/feed.cfc:L63]. Parity binds the METHOD surface, not a
   * collaborator nothing calls. The SKU service is not carried forward either: what it was used for,
   * building and configuring the selection, is what the row source replaced.
   *
   * ASYNCHRONOUS BECAUSE IT READS. A method is asynchronous in this migration if and only if its
   * legacy body reached the DAO or the ORM. This one did, so the repository call is awaited. The
   * renderer is pure and synchronous and is therefore not awaited.
   *
   * A ZERO-ROW FEED IS AN ORDINARY OUTCOME, not an error and not an empty string. Nothing here
   * short-circuits on an empty array, because the renderer emits a complete, well-formed document
   * with no items - exactly what the legacy loop produced over an empty record set.
   *
   * NOTHING IS CAUGHT AND NOTHING IS DEFAULTED. Swallowing a failure here would mean returning a
   * document that silently omitted products a merchant is advertising.
   *
   * @returns the whole feed as a single RSS 2.0 document string, for machine consumption by Google
   *   Merchant Center. It is the renderer's string, returned unchanged: not wrapped, trimmed,
   *   re-encoded, compressed or post-processed.
   * @throws whatever either collaborator raises, unchanged and unwrapped - a column narrowing
   *   failure, a malformed monetary numeral or a driver-level read failure from the row source, and
   *   a host or field validation failure from the renderer. This method adds no failure mode of its
   *   own and maps none: the layer that owns the request maps them to a response.
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
    // origin's two halves and the instant are forwarded exactly as they were supplied.
    return this.renderFeed(rows, this.feedHost, this.feedScheme, this.now);
  }
}
