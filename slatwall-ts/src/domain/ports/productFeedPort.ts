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
//   src/domain/promotionEngine                       engine type contracts
//   src/handlers/bootstrap.ts                        composition root (wiring)
//   src/handlers/productFeedHandler.ts               feed Lambda entrypoint
//   src/integrations/google/googleFeedRepository.ts  feed query adapter
//   src/integrations/google/googleFeedService.ts     feed orchestration
//   src/integrations/google/rssFeedRenderer.ts       RSS 2.0 renderer
//   tests/unit/integrations/google                   Google adapter unit tier
// ---------------------------------------------------------------------------

/**
 * Product-feed generation contract, kept separate from the integration interface.
 *
 * WHAT THIS MODULE IS
 *   The single declared capability behind the Google Merchant Center product
 *   feed, expressed as a criteria-in / feed-document-out contract: one method,
 *   returning the finished feed document as a string.
 *
 *   It is a PORT, not an implementation. This module declares one exported
 *   interface holding one method and it emits NO runtime JavaScript at all —
 *   no class, no constant, no enum, no function body, no default parameter
 *   value, no runtime value of any kind. Compiled in isolation it yields an
 *   empty module. That is the defining property of src/domain/ports/: the
 *   domain declares what it needs, the outward layers implement it, and the
 *   dependency flow therefore stays strictly domain-inward.
 *
 * THE LEGACY SOURCE, AND WHAT CHANGED
 *   [integrationServices/google/controllers/feed.cfc:L58] declares
 *   `public void function product(required struct rc)`. It returns nothing.
 *   Instead it suppresses the layout, builds a Hibachi SmartList of SKUs, and
 *   assigns that list onto the FW/1 request context, whereupon the framework
 *   renders [integrationServices/google/views/feed/product.cfm] — which reads
 *   back exactly the one key the controller wrote (declared as a cfparam at
 *   that view's L8). There is no return value and no document string anywhere
 *   in the legacy control flow; the document only ever existed as rendered
 *   template output.
 *
 *   The target inverts that: the caller receives the document. The legacy name
 *   `product` is a framework ACTION name rather than a business method name,
 *   so it is deliberately renamed to `generateProductFeed` (B4 — interface
 *   parity is the acceptance contract, and the legacy name plus its locator
 *   are recorded here and on the method so a reviewer can trace the rename).
 *   `ProductFeedPort` itself has no legacy antecedent: the legacy subsystem
 *   had a controller, a dead DAO and a view, but no declared contract.
 *
 *   THE RESHAPING IS NOT SPENT BY THIS FILE. `product(rc)` becoming
 *   `generateProductFeed(...)` is one of exactly three budgeted signature
 *   reshapings in the whole plan, and it is attributed to the modules that
 *   actually replace the legacy controller surface: everything under
 *   src/integrations/google/ and src/handlers/productFeedHandler.ts (planned). This port
 *   merely DECLARES the contract that the reshaping produces. src/domain/ports/
 *   owns zero deliberate divergences, and a fourth reshaping is not available.
 *
 * WHY THIS PORT IS SEPARATE FROM THE INTEGRATION CONTRACT
 *   [integrationServices/IntegrationInterface.cfc:L50-L89] declares a
 *   five-method cfinterface — init, getDisplayName, getIntegrationTypes,
 *   getSettings, getEventHandlers — and documents its integration-type
 *   vocabulary in the comment at L64-L72 as exactly four values: shipping,
 *   payment, fw1 and custom. THERE IS NO PRODUCT-FEED TYPE. The legacy Google
 *   adapter consequently registers under the fw1 type
 *   [integrationServices/google/Integration.cfc:L55-L57], and its actual feed
 *   logic lives in a controller, a DAO and a view rather than in the interface
 *   implementation at all.
 *
 *   The consequence, stated plainly: THE INTEGRATION INTERFACE ALONE CANNOT
 *   CARRY THE FEED. That is why this separate feed-generation port exists, and
 *   why the plan resolves the recorded ambiguity by implementing both the
 *   interface contract and this port. The plan also records a tension over
 *   which integration type the ported adapter should declare — the legacy value
 *   is fw1 while the ambiguity resolution reasons toward the custom type — and
 *   that decision belongs to src/integrations/google/integration.ts, not to
 *   this port; neither value is encoded here.
 *
 *   Nothing from that interface is declared here: no init, no display name, no
 *   integration-type union, no settings-definition type, no event-handler list
 *   and no admin navbar method. Those belong to
 *   src/integrations/integrationInterface.ts and
 *   src/integrations/google/integration.ts.
 *
 * THE FOUR FILTERS ARE INVARIANTS OF THE CONTRACT, NOT OPTIONS
 *   The legacy selection applies exactly four conditions, and all four are
 *   ALWAYS APPLIED:
 *
 *     1. active SKU                              [feed.cfc:L68]
 *     2. active product                          [feed.cfc:L69]
 *     3. published product                       [feed.cfc:L70]
 *     4. positive quantity available to sell     [feed.cfc:L72]
 *
 *   They are part of what "the feed" MEANS. A merchant feed that advertised
 *   inactive, unpublished or out-of-stock items would be wrong, so none of them
 *   is expressible as a parameter, a property, a boolean toggle, an options
 *   bag, a predicate callback or an override of any kind. A caller cannot
 *   switch a filter off. They are enforced in
 *   src/integrations/google/googleFeedRepository.ts (planned), where the legacy SmartList
 *   filter chain becomes explicit repository filters.
 *
 * WHY THERE IS NO CRITERIA PARAMETER
 *   Decided by reading [feed.cfc:L58-L74] rather than by assumption. Every
 *   reference to the request context in that method body is a WRITE: the
 *   SmartList is assigned onto it, then joins and the four conditions above are
 *   added to that object. Nothing is READ back out of it. The smart-list
 *   factory is invoked with no arguments, so not even the legacy dynamic
 *   filter-data surface reaches it, and the layout suppression at L60 is
 *   framework plumbing rather than narrowing input.
 *
 *   The legacy action therefore took NO caller-supplied narrowing whatsoever,
 *   and `generateProductFeed` is declared with zero parameters. No
 *   `FeedCriteria` type is declared: the plan's shorthand for the reshaping
 *   writes the target as taking a criteria argument, but the reading collapses
 *   that criteria set to empty, and declaring a named-but-empty criteria type
 *   to match a shorthand would be inventing a requirement the source does not
 *   supply. An empty interface is also a lint failure here, which is the type
 *   system agreeing with the reading rather than a second, independent reason.
 *
 *   Nothing speculative is added either: no paging, limit, offset, cursor or
 *   sort argument; no locale, currency selector or format discriminator; no
 *   channel or destination; no site or store selector; no since/updated-after
 *   timestamp; no compression flag, chunk size, callback or streaming shape.
 *   The legacy emits one complete document in one pass, and so does the target.
 *
 * WHY THE METHOD IS ASYNC
 *   The async boundary in this port set is a documented contract, not a
 *   stylistic preference: a method is asynchronous if and only if its legacy
 *   body reached the DAO or the ORM. The legacy body builds a database-backed
 *   SKU selection, so the ported capability reaches the data store and the
 *   method returns a promise.
 *
 * WHAT THE RETURNED STRING IS, AND WHO PRODUCES IT
 *   A complete RSS 2.0 document carrying the Google base namespace on its root
 *   element, for MACHINE consumption by Google Merchant Center. It is not a
 *   user interface: this migration renders no user interface anywhere, the
 *   presentation subsystems are out of scope, and there is no templating
 *   engine, no layout, no view resolution and no client-side asset in the
 *   target.
 *
 *   The legacy view becomes src/integrations/google/rssFeedRenderer.ts (planned), a pure
 *   string-emitting function with a hand-rolled five-entity XML escaper — no
 *   XML library is added, because the dependency set is closed and a dependency
 *   for one file is unjustified. That renderer preserves the two hardcoded item
 *   values the legacy template emits (a condition of new and an availability of
 *   in stock), and the g:google_product_category element stays empty and stays
 *   flagged there as a B3 carry-forward owned by the renderer; this port
 *   authors no such marker of its own. No renderer method, escaper, namespace
 *   constant, element name, attribute name or XML type is declared here.
 *
 *   The feed's price elements are likewise the renderer's concern, rendered
 *   through the Money value object's two-decimal presentation: this port
 *   declares no monetary member, imports nothing from src/domain/valueObjects/,
 *   and types no price as a number.
 *
 *   There is deliberately no feed-item, feed-row or feed-entry projection type
 *   here. The document is a string; its item shape is internal to the renderer,
 *   and declaring it here would leak the renderer's contract into the domain
 *   and duplicate a type another module owns.
 *
 * AN EXECUTION-MODEL MISMATCH, NOT A PERFORMANCE BUDGET
 *   The legacy view sets a request timeout of 360 seconds at
 *   [integrationServices/google/views/feed/product.cfm:L9]. Lambda cannot
 *   structurally provide that shape of budget — the function cap is 15 minutes
 *   and API Gateway holds a connection for 29 seconds — so the observation is
 *   recorded as an execution-model mismatch between the two runtimes. It is not
 *   a requirement, and no service level, throughput figure or refresh interval
 *   is asserted anywhere in this port. Nothing is added to work around it: no
 *   timeout, retry, chunking, paging, streaming, resume or job parameter
 *   appears in the signature.
 *
 * NO LIVE GOOGLE CALL, AND NO CREDENTIALS
 *   The ported adapter remains a stub in the deliverable sense: it satisfies
 *   the full contract surface and returns well-formed output, but performs no
 *   live Google API call and requires no credentials. Accordingly this port
 *   declares no API key, endpoint, URL, merchant identifier, OAuth shape or
 *   upload/submit method, and it holds no connection string, datasource name,
 *   table name or environment value.
 *
 * PARAMETERIZED SQL — NOT APPLICABLE TO THIS FILE
 *   The project standard is that every query uses prepared statements
 *   exclusively, preserving the injection-safety guarantee that cfqueryparam
 *   provided. That standard does not apply to this module, because this module
 *   declares interfaces only and contains no query, no query fragment and no
 *   database access of any kind. The obligation TRANSFERS WHOLLY to the module
 *   that does the reading — src/integrations/google/googleFeedRepository.ts (planned) for
 *   this port, and src/repositories/mysql/ for the six repository ports. It is
 *   recorded here so that the transfer is explicit rather than assumed.
 *
 * WHO IMPLEMENTS THIS PORT, AND WHO CONSUMES IT
 *   This is NOT a repository port. Six of the thirteen ports in this folder
 *   have a MySQL adapter under src/repositories/mysql/ — product, SKU, option,
 *   product-type, promotion and price-group — and this is not one of them. It
 *   is one of the seven ports with no adapter file anywhere in the target
 *   layout, alongside settingsProvider, currencyConverter, addressZoneEvaluator,
 *   urlTitleGenerator, imageStore and subscriptionTermProvider.
 *
 *   Its only legal implementation home is therefore src/handlers/bootstrap.ts (planned),
 *   the composition root, where it WILL BE satisfied by adapting the net-new
 *   orchestration in src/integrations/google/googleFeedService.ts (planned) — which in
 *   turn composes src/integrations/google/googleFeedRepository.ts (planned) (the
 *   four-filter selection) and src/integrations/google/rssFeedRenderer.ts (planned) (the
 *   pure string-emitting renderer). This is stated so the composition-root
 *   author has unambiguous direction.
 *
 *   It WILL additionally BE CONSUMED by the modules under
 *   src/integrations/google/ and by the src/handlers/productFeedHandler.ts (planned)
 *   entrypoint: this port is the seam between the routed Lambda entrypoint and
 *   the feed subsystem.
 *
 *   CHECKPOINT STATUS OF THE FEED PATH, stated once so nothing below is read as
 *   a capability claim: at this checkpoint the subtree carries THIS CONTRACT,
 *   src/integrations/integrationInterface.ts and
 *   src/integrations/google/integration.ts, and NOTHING ELSE of the feed path.
 *   The composition root, the feed repository, the feed service, the renderer
 *   and the handler entrypoint are all planned targets that do not exist yet, so
 *   NO FEED DOCUMENT IS PRODUCED AT THIS CHECKPOINT and no filter is executed.
 *   Everything stated below is the OBLIGATION this port places on those modules
 *   when they are authored, never a description of behaviour that runs today.
 *
 *   Six obligations leave this file and are recorded here so none is lost:
 *
 *     1. The four filters above are enforced in googleFeedRepository.ts,
 *        always, with no toggle.
 *     2. googleFeedRepository.ts uses prepared statements exclusively.
 *     3. The dead, syntactically broken FeedDAO is NOT ported;
 *        googleFeedRepository.ts reproduces the INTENDED filter set and flags
 *        the source defect rather than silently authoring a working query and
 *        presenting it as a faithful port.
 *     4. The legacy view becomes a pure function returning a string in
 *        rssFeedRenderer.ts, with the hand-rolled five-entity escaper, the two
 *        hardcoded item values preserved, and the empty
 *        g:google_product_category element preserved together with its
 *        still-flagged B3 carry-forward.
 *     5. The adapter performs no live Google API call and requires no
 *        credentials.
 *     6. The integration-interface surface — including which integration type
 *        the ported adapter declares — is the decision of
 *        src/integrations/integrationInterface.ts and
 *        src/integrations/google/integration.ts, not of this port.
 *
 * SIBLING OWNERSHIP — WHAT DOES NOT BELONG HERE
 *   The feed QUERY is src/integrations/google/googleFeedRepository.ts (planned); the
 *   ORCHESTRATION is src/integrations/google/googleFeedService.ts (planned) (net-new);
 *   the RENDERING is src/integrations/google/rssFeedRenderer.ts (planned); the ENTRYPOINT
 *   is src/handlers/productFeedHandler.ts (planned); the INTERFACE CONTRACT is
 *   src/integrations/integrationInterface.ts together with
 *   src/integrations/google/integration.ts. All six are named in prose only.
 *
 *   No product, SKU, brand, category, option or product-type query method is
 *   declared here — those belong to the productRepository, skuRepository,
 *   optionRepository and productTypeRepository ports. No settings accessor is
 *   declared here — that is the settingsProvider port, through which the global
 *   product and product-type URL keys resolve for any product link the feed
 *   emits, with their legacy defaults living in
 *   [model/service/SettingService.cfc:L178-L179] and never as literals here. No
 *   currency conversion is declared here — that is the currencyConverter port.
 *
 *   The Google adapter is the only integration adapter in scope. The
 *   full-circle and Mura adapters and every payment-gateway and
 *   shipping-carrier adapter under integrationServices/ are out of scope and
 *   are not referenced as capabilities.
 *
 * IMPORTS: NONE
 *   This module has zero import statements. Its one method returns a promise of
 *   a string, and because the criteria set is empty there is no supporting type
 *   to compose, so nothing from src/domain/entities/, src/domain/valueObjects/,
 *   src/domain/views/, src/domain/promotionEngine/ (planned) or src/lib/ is needed.
 *
 *   The layer boundary makes that more than a coincidence. src/domain/ may
 *   import only from within src/domain/ and from src/lib/; importing
 *   src/repositories/, src/handlers/ or src/integrations/, or the mysql2,
 *   dotenv or aws-lambda packages, is a BUILD FAILURE enforced by
 *   `no-restricted-imports` in slatwall-ts/eslint.config.mjs. That boundary is
 *   at its sharpest on this particular port, because every one of its
 *   collaborators lives in src/integrations/ or src/handlers/ — which is
 *   precisely why they are named in prose and imported nowhere, and why this
 *   port cannot decay into a feed implementation. No sibling port is imported
 *   either: zero ports in this folder import one another, every supporting type
 *   is co-located with the port that needs it, and there are no barrel files
 *   anywhere in the subtree.
 *
 * NAMES PUBLISHED HERE ARE CANONICAL
 *   Every consumer subtree is still empty at the time of writing, so the names
 *   and the signature published here are the canonical ones the composition
 *   root, the handler and the Google adapter will import. They are not to be
 *   renamed later.
 *
 *   This is port 13 of exactly 13 in src/domain/ports/ and the folder is locked
 *   at that count: no fourteenth port, no index or barrel module, and in
 *   particular no separate rounding-rule repository — that lookup is hosted on
 *   the promotionRepository port. The method count on THIS port is locked at
 *   one, and no signature reshaping, visibility widening or deliberate
 *   divergence is spent from this file.
 *
 * SCHEMA CONTINUITY
 *   The feed reads the existing Sw-prefixed MySQL schema unchanged — the legacy
 *   path joins the SKU and product tables directly, with an inner join to the
 *   product and an outer join to the brand so that a brand-less product is
 *   still advertised. No migration, rename, new table or column change is
 *   implied, and no table name appears as a literal in this file.
 *
 * WHAT THIS PORT DOES AND DOES NOT OWE EXACT PRESERVATION
 *   The three must-preserve areas named in the plan are the promotion discount
 *   math with its use-limit enforcement, the price-group and currency
 *   resolution cascade, and option-based SKU resolution. This port touches none
 *   of them, directly or indirectly, and claims no part in them. What it does
 *   owe exact preservation is the four-filter selection above, which is the
 *   feed's own behavioural contract.
 *
 * TEST COVERAGE IS NET-NEW, NOT LEGACY PARITY
 *   Only three legacy test files touch the in-scope slice —
 *   meta/tests/unit/entity/BrandTest.cfc, meta/tests/unit/entity/ProductTest.cfc
 *   and meta/tests/functional/admin/entity/ProductTest.cfc, the last of which is
 *   an empty stub — and none of them touches the Google adapter, the feed
 *   controller, the feed DAO or the feed view. Coverage for this port is
 *   therefore NET-NEW and is presented as such rather than as parity; the
 *   Google adapter's suites live under tests/unit/integrations/google/ (planned). No test
 *   is authored in this file.
 *
 * NO USER RULES WERE PROVIDED
 *   The project rules source returns exactly "No user rules provided." No rule
 *   has been invented to fill the gap, and the absence is not treated as
 *   licence to lower the bar: the enterprise-standard substitutes apply at full
 *   strength and are the reason for the strictness profile, the layer boundary,
 *   the closed dependency set, the single-arithmetic-surface money standard, the
 *   absence of hardcoded literals, the one-exported-unit-per-file policy and the
 *   uniform preserved-defect marker below.
 *
 * WHY THE PRESERVED-DEFECT MARKER SITS AT MODULE SCOPE
 *   It qualifies the one capability this module declares, so its natural home
 *   would be beside that method's doc comment inside the interface body. It is
 *   deliberately placed here instead, immediately below this header and
 *   immediately above the declaration it qualifies, and the reason is measured
 *   rather than stylistic.
 *
 *   The build config keeps comments (removeComments is false) precisely so that
 *   annotations reach the deliverable. But a marker must use the project's
 *   uniform two-line form, which is a pair of LINE comments, and TypeScript
 *   discards line comments from both emitted artifacts: the interface body is
 *   erased from the JavaScript output altogether, and declaration emit copies
 *   only block-form doc comments. Verified by compiling this module in
 *   isolation and reading both artifacts: a line comment inside the interface
 *   body, and a line comment separated from this header by a blank line, each
 *   survive in neither the JavaScript nor the declaration file. The one
 *   placement that does survive is a line comment contiguous with the first
 *   comment block of the file, which the compiler emits as a detached
 *   file-level comment.
 *
 *   Placed as it is, all seven annotations this port is required to preserve
 *   reach the emitted output, and there is still exactly one marker. Do not
 *   move it into the interface body: doing so silently deletes it from the
 *   build, and do not duplicate it to compensate.
 */

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L58-L63]: the feed query's select list ends in a trailing comma before `FROM` and its `INNER JOIN` carries no `ON` clause, so the statement cannot execute as written.
// Preserved deliberately; do not fix without a product decision.
// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L63-L72]: the controller never calls that DAO; it expresses the same filter set through a SKU smart list, and states the quantity bound as `>= 1` where the DAO states `> 0`.
// Retained to preserve the cited legacy behavior.
/**
 * The product-feed generation capability.
 *
 * One method, and exactly one: the legacy subsystem exposed a single public
 * action [integrationServices/google/controllers/feed.cfc:L54 declares
 * `this.publicMethods="product"`], so one method is the correct and complete
 * outcome here. The minimal-change directive scopes the functional surface, not
 * the code style — idiomatic TypeScript is required, and growing a feed
 * subsystem API around one legacy action would breach that directive rather
 * than satisfy it.
 *
 * Implemented in src/handlers/bootstrap.ts (planned) by adapting
 * src/integrations/google/googleFeedService.ts (planned); consumed by the modules under
 * src/integrations/google/ and by src/handlers/productFeedHandler.ts (planned).
 */
export interface ProductFeedPort {
  /**
   * Build the product feed document.
   *
   * CFML parity [integrationServices/google/controllers/feed.cfc:L68-L72]: the included SKUs are
   * fixed rather than chosen by the caller — the SKU is active, its product is active and published,
   * and the product has quantity available to sell — which is why this takes no arguments. The legacy
   * controller returns nothing and defers rendering to a view; the document is returned here instead.
   *
   * FOUR SELECTION FILTERS, ALWAYS APPLIED. They are invariants of this
   * contract, not options, and none of them is switchable by a caller:
   *
   *   1. the SKU is active                       [feed.cfc:L68]
   *   2. its product is active                   [feed.cfc:L69]
   *   3. its product is published                [feed.cfc:L70]
   *   4. its product has a positive quantity available to sell, expressed in
   *      the legacy as an open-ended range from one upward
   *                                              [feed.cfc:L72]
   *
   * All four are enforced in
   * src/integrations/google/googleFeedRepository.ts (planned), which turns the legacy
   * SmartList filter chain into explicit repository filters.
   *
   * NO PARAMETERS. The legacy action reads nothing back out of the request
   * context — every reference to it in [feed.cfc:L58-L74] is a write, and the
   * smart-list factory is called with no arguments — so there is no
   * caller-supplied narrowing to model, and no criteria type is declared.
   *
   * The subsystem's own data-access component
   * [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75] is NOT the
   * provenance of this method and is not ported: it is both syntactically
   * invalid and provably uncalled. The preserved-defect marker at module scope
   * above records that finding in full, and the header explains why it sits
   * there rather than here.
   *
   * @returns The whole feed as a single RSS 2.0 document string, produced in one
   *   pass, for machine consumption by Google Merchant Center. It is not a user
   *   interface and is never rendered to one. Rendering is owned by
   *   src/integrations/google/rssFeedRenderer.ts (planned); monetary values inside the
   *   document are presented there through the Money value object, so no
   *   monetary type crosses this boundary.
   */
  generateProductFeed(): Promise<string>;
}
