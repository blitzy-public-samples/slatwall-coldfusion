/**
 * ProductRepository — the repository PORT for the Catalog's product-side data access.
 *
 * Legacy origin: `model/dao/ProductDAO.cfc`, a 441-line component declaring exactly three
 * public members and one private helper. Authority: AAP 0.4.1.6 "Ports" — "Three public
 * members typed; the importer's return contract made explicit" — with the member-by-member
 * mapping fixed by AAP 0.4.2.6.
 *
 * WHY A DAO PORT EXISTS AT ALL
 * ---------------------------
 * The prompt named no DAOs. AAP 0.2.1.3 explains the implicit addition: "This is where the
 * Catalog's business logic actually resides, which makes these four files the single most
 * important implicit addition in the plan." A transliteration of the four named services
 * alone "would therefore produce four thin, nearly empty TypeScript classes and silently lose
 * the system's behavior" (AAP 0.1.1). This module is one quarter of the correction.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * A declaration-only contract: two projection types and one interface carrying three method
 * signatures. There is no runtime code here — no statement text, no driver reference, no
 * input/output, no executable line — so the module is erased entirely at compile time and
 * contributes zero bytes to the packaged Lambda artifact. Its implementation lives at
 * `slatwall-ts/src/adapters/mysql/MySqlProductRepository.ts` (AAP 0.4.1.7) and its consumer
 * is `slatwall-ts/src/services/ProductService.ts`, wired once in the composition root at
 * `slatwall-ts/src/config/container.ts` (AAP 0.3.3, "Composition root").
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3, S4 — hexagonal separation)
 * ------------------------------------------------------------
 * `src/ports/` declares boundaries; it never crosses them. This module consequently references
 * nothing outside itself — not a sibling port, not a domain entity, not a Node builtin, not a
 * package, and no barrel re-export. Deliberate consequences, each a rule rather than an
 * omission:
 *   - No database driver type and no prepared-statement placeholder array appears. Statement
 *     text, identifier handling and binding order belong to the adapter (AAP 0.7.3, S2 and
 *     AAP 0.4.3.4, rule R4).
 *   - No AWS event, result or invocation-context type is named. All AWS coupling is confined
 *     to `src/handlers/` (AAP 0.7.3, S4).
 *   - The environment is never read here. Configuration flows one way through `src/config/`
 *     (AAP 0.4.3.5).
 *   - No transaction, commit or flush member is declared. Transaction demarcation belongs to
 *     `slatwall-ts/src/adapters/mysql/UnitOfWork.ts` (mismatch M5, AAP 0.6.6).
 *   - Every member is an ordinary method signature and there is no default export, so the
 *     interface is satisfiable by a plain object literal. That matters concretely: the legacy
 *     repository vendors no mocking library at all (AAP 0.6.5.2), so
 *     `slatwall-ts/test/support/inMemoryRepositories.ts` hand-implements these contracts.
 *
 * Nothing from `org/Hibachi/**` is carried across. AAP 0.8.3.2 is explicit — "Do not port or
 * depend on anything from `org/Hibachi/` (DI/1, FW/1) — that framework is being retired for
 * this slice, not carried forward." The legacy component inherits from `HibachiDAO`, and that
 * inherited surface — including the paginated dynamic-query plumbing at
 * `org/Hibachi/HibachiDAO.cfc:L102-L111` — is read as a contract and reproduced nowhere here.
 * The paginated abstraction belongs wholly to the smart-list query port, a separate file.
 *
 * THE MEMBER CENSUS IS COMPLETE, AND THAT IS A VERIFIED CLAIM
 * ----------------------------------------------------------
 * The entire component body is one `<cfscript>` block spanning
 * `model/dao/ProductDAO.cfc:L51-L438`, and the component tag at
 * `model/dao/ProductDAO.cfc:L49` declares `accessors="true" extends="HibachiDAO"` with no
 * property declaration of any kind. Two things follow. First, the component is STATELESS, so
 * the caching mismatch M7 of AAP 0.6.6 does not apply to it and no cache-bearing or
 * cache-clearing member appears below — unlike `model/dao/SkuDAO.cfc`, which is stateful and
 * memoizes an option-group sort order. Second, because no member hides in tag syntax outside
 * that script block, the three-public-plus-one-private census is exhaustive; the scanning
 * hazard recorded as Discrepancy 7 in AAP 0.4.2.6 genuinely does not reach this file.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP 0.8.2, Guideline 6)
 * -----------------------------------------------------------------
 * Guideline 6 requires every technology-specific judgment to be documented where the judgment
 * is made. Judgments recorded at the member they affect: which of the two attribute-set
 * conditionals may collapse; the opaque return element type; declaring two members that have
 * no caller; `void` as the honest importer contract; the preserved plural argument name; and
 * the corrected direction of the stale-logical-name finding. Two further judgments are
 * file-wide and recorded here:
 *
 *   (a) CFML EQUALITY IS CASE-INSENSITIVE; TYPESCRIPT `===` IS NOT. This is a live hazard in
 *       this component rather than a theoretical one: `model/dao/ProductDAO.cfc:L288` tests
 *       the database-type value with one spelling of "mySQL" and
 *       `model/dao/ProductDAO.cfc:L304` tests it with a differently-cased spelling of the same
 *       word. CFML treats the two as equal; a strict TypeScript comparison would not, so one
 *       of the two backfills would silently stop firing. Discharging this is an obligation of
 *       `MySqlProductRepository.ts`, which targets a single dialect; no signature below is
 *       affected, and the hazard is recorded here so the adapter author does not meet it cold.
 *
 *   (b) TWO DIVERGENT UNIQUE-`urlTitle` STRATEGIES COEXIST IN THE LEGACY TREE, AND THEY ARE
 *       DOCUMENTED RATHER THAN HARMONISED (AAP 0.8.2, Guideline 4). The private importer
 *       helper at `model/dao/ProductDAO.cfc:L328` derives a title from a filtered product name
 *       and, on collision, appends the product code — see
 *       `model/dao/ProductDAO.cfc:L398-L409` — and it does so only for the product table. The
 *       service-layer algorithm at `model/service/DataService.cfc:L53-L71` instead appends an
 *       incrementing numeric suffix. Only the second is ported, as
 *       `slatwall-ts/src/util/urlTitle.ts`; the first stays inside the adapter that owns the
 *       importer. Making the two agree would be exactly the enhancement Guideline 4 forbids.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - The private helper at `model/dao/ProductDAO.cfc:L328`. AAP 0.4.2.6 marks it "Internal to
 *     the adapter", so it is absent from this contract by instruction, not by oversight.
 *   - Defect D18. The legacy importer builds 21 statements by interpolating file-supplied
 *     values directly into statement text — see `model/dao/ProductDAO.cfc:L165`, `L180`,
 *     `L184`, `L213`, `L219` and `L244` among them. `MySqlProductRepository.ts` replaces all
 *     21 with parameterized equivalents bound through `?` placeholders, which structurally
 *     eliminates that entire category of flaw. Per AAP 0.6.7.7 this is the single place in the
 *     whole plan where the port intentionally does NOT preserve legacy behaviour exactly — a
 *     deliberate, documented hardening, recorded "so a reviewer comparing generated SQL
 *     against legacy SQL knows the divergence is intended." It is cited here and owned there;
 *     no statement text of any kind appears in this module (AAP 0.7.3, S2).
 *   - Any timeout, retry, batch-size, page-size or maximum-results number. AAP 0.7.3, S9 and
 *     IR-12 forbid inventing figures the source does not state.
 *   - Any new defect or mismatch identifier. Both registers are closed — defects at D1-D22 and
 *     execution-model mismatches at M1-M8 — so findings recorded below that carry no register
 *     number carry none deliberately.
 */

/**
 * The element type returned by {@link ProductRepository.findAttributeSets}.
 *
 * OPAQUE BY DESIGN. This is a judgment call (AAP 0.8.2, Guideline 6) and the reasoning is
 * recorded so it reads as a decision rather than a shortcut.
 *
 * The two query executions at `model/dao/ProductDAO.cfc:L66` and
 * `model/dao/ProductDAO.cfc:L68` return hydrated attribute-set entities. Attribute-set
 * entities belong to the Attribute domain, which AAP 0.2.2.1 excludes from this slice
 * outright — the exclusion pattern `model/**\/Attribute*.cfc` covers six files. No
 * corresponding domain type exists anywhere under `slatwall-ts/src/domain/`, and none is
 * planned. Describing a field surface for it would mean asserting column names for which this
 * port has no locator, and AAP 0.8.5 requires every behavioural claim to carry one.
 *
 * `unknown` is therefore the honest type, and it is the strict one: unlike a permissive
 * escape-hatch type it forces every consumer to narrow before use, so the boundary stays
 * visible at every call site instead of dissolving (AAP 0.7.3, S1). It is also precisely how
 * this module honours AAP 0.8.3.8 — "new TypeScript services must be callable and deployable
 * without requiring the rest of Slatwall to be converted" — because the excluded domain is
 * crossed by an opaque alias rather than by dragging six more files into the port. Declaring
 * the member with an opaque element type, rather than dropping it, is what transformation rule
 * TR-5 requires: the boundary is declared and flagged, and nothing is quietly lost.
 *
 * TODO(boundary): `model/dao/ProductDAO.cfc:L52` yields hydrated attribute-set entities from
 * the excluded Attribute domain (AAP 0.2.2.1). Should a future iteration bring that domain
 * into scope, this alias is the single place to replace with a typed row shape; until then no
 * primary-key or column name is invented for it.
 */
export type AttributeSetRow = unknown;

/**
 * One row of the product type-ahead projection returned by
 * {@link ProductRepository.searchByProductType}.
 *
 * The two keys and their casing are observable behaviour, not a naming preference. The legacy
 * loop at `model/dao/ProductDAO.cfc:L430-L434` builds each element with QUOTED keys — `"id"`
 * and `"value"` — and in CFML the quoting is what forces the keys to stay lowercase instead of
 * being upper-cased by the engine. Renaming either key, or exposing the underlying column
 * names in their place, would change what a consumer receives.
 *
 * `value` carries the product name (`model/dao/ProductDAO.cfc:L433`).
 *
 * THE DUPLICATION AGAINST THE SKU-SIDE PROJECTION IS DELIBERATE. `model/dao/SkuDAO.cfc:L142`
 * through `L145` builds a structurally identical two-key shape, but its `value` carries a SKU
 * code rather than a product name (`model/dao/SkuDAO.cfc:L144`), so the two projections are
 * only accidentally alike. They are declared separately, under different names, in their own
 * port modules: the AAP inventory names no shared types module, and inventing one would both
 * add a file the plan does not contain and couple two ports that have no reason to move
 * together. Structural typing means a consumer can still treat them interchangeably where
 * that is genuinely correct, without either declaration depending on the other.
 *
 * Both fields are `readonly`: a projection is a query result, and nothing downstream has any
 * business mutating it.
 */
export interface ProductSearchRow {
  /** The product identifier, from `model/dao/ProductDAO.cfc:L432`. */
  readonly id: string;

  /** The product name, from `model/dao/ProductDAO.cfc:L433`. */
  readonly value: string;
}

/**
 * The product-side repository boundary: the three public members of
 * `model/dao/ProductDAO.cfc`, typed.
 *
 * Method names follow the renames fixed by AAP 0.4.2.6. Argument names, argument order and
 * required-versus-optional status are preserved exactly as declared in the legacy source, per
 * transformation rule TR-1 — including in the two places where the legacy declaration is
 * internally inconsistent, because the declaration is the contract.
 *
 * A note on the two argument names that look like they should match but must not:
 * `productTypeIDs` appears on two members of this interface with two DIFFERENT types, and that
 * is faithful. At `model/dao/ProductDAO.cfc:L52` it is a genuine array, exercised as one by
 * the length tests at `model/dao/ProductDAO.cfc:L56` and `L65`. At
 * `model/dao/ProductDAO.cfc:L419` it is a single comma-delimited string, bound as a list at
 * `model/dao/ProductDAO.cfc:L425`. The two members are reached independently, so this is the
 * observed contract rather than an inconsistency to resolve; harmonising the types would
 * silently change behaviour at whichever call path was "corrected".
 */
export interface ProductRepository {
  /**
   * Returns the attribute sets matching the given attribute-set type codes, restricted by
   * product-type assignment.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L52`. Both arguments are declared `required
   * array` there, so both are REQUIRED and both are arrays here — neither is optional, and
   * under `exactOptionalPropertyTypes` that distinction is load-bearing rather than decorative.
   * Result ordering is fixed by the clause appended unconditionally at
   * `model/dao/ProductDAO.cfc:L62`.
   *
   * ⚠️ THE LEGACY MEMBER HAS TWO CONDITIONALS ON THE SAME PREDICATE, AND ONLY ONE OF THEM MAY
   * COLLAPSE. This is the highest-risk item in the whole module, because getting it backwards
   * compiles cleanly and returns the wrong rows:
   *
   *   1. `model/dao/ProductDAO.cfc:L56-L61` SHAPES THE QUERY, AND IS NECESSARY BEHAVIOUR THAT
   *      THE ADAPTER MUST PRESERVE. When the product-type list is non-empty the predicate
   *      admits globally-flagged attribute sets OR those assigned to one of the given product
   *      types (`L57-L58`); when it is empty the predicate admits globally-flagged sets ONLY
   *      (`L60`). Those are two genuinely different result sets. This branch must survive the
   *      translation intact.
   *
   *   2. `model/dao/ProductDAO.cfc:L64-L69` ONLY BINDS PARAMETERS, AND THIS IS THE ONE THAT
   *      COLLAPSES — see the parity note below.
   *
   * TODO(parity): `model/dao/ProductDAO.cfc:L64` carries a literal source TODO asking for its
   * conditional to be removed once the two CFML engines agree on how arrays are handled for an
   * `IN` clause. Its subject is the binding divergence immediately beneath it: the branch at
   * `model/dao/ProductDAO.cfc:L66` binds the attribute-set type codes as a flattened LIST while
   * `model/dao/ProductDAO.cfc:L68` binds the very same named parameter as an ARRAY — one
   * parameter, two shapes, purely to work around an engine difference. Per AAP 0.6.7.1 the
   * treatment is an intentional simplification with its reason recorded: no such engine
   * divergence exists in TypeScript, so the migration itself satisfies the TODO's precondition
   * and the adapter binds one shape on one path. The defect register is closed at D1-D22, so
   * this carries no new number. Note that the two conditionals must be reasoned about together:
   * collapsing the binding branch while leaving the query-shaping branch intact is correct,
   * whereas collapsing the shaping branch — or collapsing only one and letting the query text
   * and the bound parameters drift apart — produces a fault with no compile-time signal.
   *
   * DECLARED DESPITE HAVING NO CALLER. A repository-wide scan finds no live path to this DAO
   * member: the only call site of the product DAO accessor anywhere in the tree is
   * `model/service/ProductService.cfc:L67`, which reaches the importer. The same-named member
   * at `model/entity/Product.cfc:L830-L832` is not this one — it sits beneath the deprecation
   * banner at `model/entity/Product.cfc:L830` and resolves through the entity's own
   * assigned-attribute-set accessor at `model/entity/Product.cfc:L833`, never reaching a DAO.
   * The member is nonetheless declared, because AAP 0.4.2.6 maps it explicitly to a named
   * target method and transformation rule TR-5 is unambiguous: "The member is never quietly
   * dropped from the interface." The asymmetry with the one member the plan DOES omit is
   * deliberate — the private, only-self-recursive method at
   * `model/service/ProductService.cfc:L82-L97` (defect D15) is omitted solely because AAP
   * 0.4.1.8 instructs it. Dead code is dropped on explicit instruction, never on a port
   * author's own reachability analysis.
   *
   * @param attributeSetTypeCode - Attribute-set type system codes to match; required, and an
   *   array, per `model/dao/ProductDAO.cfc:L52`.
   * @param productTypeIDs - Product-type identifiers as a genuine array; required per
   *   `model/dao/ProductDAO.cfc:L52`. An empty array is meaningful, not degenerate: it selects
   *   the globally-flagged-only predicate at `model/dao/ProductDAO.cfc:L60`.
   * @returns The matching attribute sets in the legacy order. The element type is opaque; see
   *   {@link AttributeSetRow} for why.
   */
  findAttributeSets(
    attributeSetTypeCode: string[],
    productTypeIDs: string[],
  ): Promise<AttributeSetRow[]>;

  /**
   * Imports products, SKUs, options, custom attributes and content assignments from a
   * delimited file fetched over HTTP.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L73`. `fileURL` is `required string`;
   * `textQualifier` is optional with an empty-string default.
   *
   * THE RETURN CONTRACT IS `void`, AND THAT IS THE FINDING. AAP 0.4.1.6 asks for "the
   * importer's return contract made explicit"; made explicit, it is that the legacy member is
   * declared `void` at `model/dao/ProductDAO.cfc:L73` and tells its caller NOTHING — no
   * imported-row count, no error collection, no success flag. Combined with the per-row commit
   * boundary described below, the consequence is that a failure part-way through a file leaves
   * a partially imported catalog and the caller cannot detect it. Writing that down is worth
   * more to a reviewer than a summary object would be, and inventing one would fabricate
   * behaviour the source does not have (AAP 0.7.3, S9).
   *
   * PRESERVED BEHAVIOUR A COMPETENT ENGINEER WOULD INSTINCTIVELY REPAIR — AND WHICH AAP 0.8.2
   * GUIDELINE 4 FORBIDS REPAIRING. Both are stated so they read as decisions, and neither takes
   * a register number, since the defect register is closed at D1-D22:
   *   - The spreadsheet branch at `model/dao/ProductDAO.cfc:L82-L85` is EMPTY — it contains a
   *     comment and nothing else. A spreadsheet upload therefore leaves the result set as the
   *     empty one created at `model/dao/ProductDAO.cfc:L82`, and the importer completes having
   *     imported nothing, silently and without error.
   *   - The delimiter map at `model/dao/ProductDAO.cfc:L74-L80` recognises exactly two
   *     extensions, comma-delimited at `L77` and tab-delimited at `L79`. Any other extension
   *     leaves the delimiter as the empty string initialised at `model/dao/ProductDAO.cfc:L75`.
   * Accordingly this signature takes no file-type argument, declares no unsupported-type guard
   * and promises no rejection: the file type is derived inside the implementation exactly as the
   * legacy member derives it at `model/dao/ProductDAO.cfc:L74`.
   *
   * CORRECTING THE RECORD ON THE HTTP FETCH. AAP 0.4.2.6 describes "a `new http()` fallback at
   * [L88-L90]". That characterisation is factually wrong, and the locators show it: the block
   * is commented out, opening at `model/dao/ProductDAO.cfc:L89` and closing at
   * `model/dao/ProductDAO.cfc:L98`, and the comment immediately above it at
   * `model/dao/ProductDAO.cfc:L88` records why it was abandoned — the script-based HTTP method
   * did not work for a tab delimiter. It is dead code, not a fallback. The ONE live fetch path
   * is `model/dao/ProductDAO.cfc:L87`, which is execution-model mismatch M4 of AAP 0.6.6:
   * network retrieval performed inside the same request that carries the transactions. No
   * fallback is to be implemented, because none exists.
   *
   * That fetch is also a HIDDEN dependency. `model/dao/ProductDAO.cfc:L87` resolves its
   * collaborator by runtime string lookup and never declares it as a component property, so
   * dependency analysis driven by component metadata misses it entirely — the same trap AAP
   * 0.6.3.2 records for the image collaborator of the SKU service. AAP 0.4.3.2 (rule R2)
   * replaces such lookups with typed constructor dependencies, so the retrieval collaborator is
   * injected into `MySqlProductRepository.ts`. This signature therefore takes no HTTP client,
   * fetch function or transport argument: adapters own input and output (AAP 0.7.3, S4).
   *
   * EXECUTION-MODEL MISMATCHES — CITED HERE, OWNED ELSEWHERE (AAP 0.7.3, S8). The register is
   * closed at M1-M8; no new number is minted:
   *   - M3, per-row transactions. The record loop opens at `model/dao/ProductDAO.cfc:L176` and
   *     the transaction opens INSIDE it at `model/dao/ProductDAO.cfc:L177`, closing at
   *     `model/dao/ProductDAO.cfc:L284`. That is one transaction per row, not one per import,
   *     which is what makes a partially imported catalog reachable. Note also that the two bulk
   *     backfills at `model/dao/ProductDAO.cfc:L288-L325` run after that transaction has closed
   *     and are therefore inside none at all. Reproducing these boundaries is an obligation of
   *     `UnitOfWork.ts` and `MySqlProductRepository.ts`; no transaction member is exposed here.
   *   - M1, the one-hour budget. `model/service/ProductService.cfc:L66` raises the request
   *     timeout to 3600 seconds before delegating at `model/service/ProductService.cfc:L67`.
   *     AWS Lambda's maximum function timeout is 15 minutes, so that budget is unrepresentable
   *     in a single invocation and the importer's entry point needs an out-of-band model —
   *     chunked or queued — per AAP 0.6.6. That decision belongs to
   *     `slatwall-ts/src/handlers/productHandler.ts`, where AAP 0.4.1.9 flags it. No timeout,
   *     retry or chunk figure is stated anywhere in this module (AAP 0.7.3, S9).
   *
   * TODO(boundary): the legacy importer reaches collaborators this slice excludes, and each is
   * an adapter concern rather than a change to this signature — ports are injected into the
   * adapter at the composition root (AAP 0.7.3, S3). It reads the current account at
   * `model/dao/ProductDAO.cfc:L153` and `L341`, which maps to the account-context port declared
   * under `slatwall-ts/src/ports/`; it reads the global image-extension setting at
   * `model/dao/ProductDAO.cfc:L307`, `L313` and `L320`, which maps to the setting-resolver port
   * declared in the same directory; and at `model/dao/ProductDAO.cfc:L262` it reads a Mura CMS
   * content table, which belongs to a different application altogether and has no port in this
   * plan.
   *
   * @param fileURL - Location of the delimited file to retrieve and import. Required per
   *   `model/dao/ProductDAO.cfc:L73`; the file type is derived from its extension at
   *   `model/dao/ProductDAO.cfc:L74`.
   * @param textQualifier - Optional text qualifier, defaulting to empty per
   *   `model/dao/ProductDAO.cfc:L73`.
   * @returns Nothing. Resolution carries no report of what was imported; see the return-contract
   *   note above.
   */
  importFromFile(fileURL: string, textQualifier?: string): Promise<void>;

  /**
   * Type-ahead search over product names, optionally narrowed to a set of product types.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L419`, where NEITHER argument is declared
   * `required` — so both are optional here, and the untyped legacy return becomes a declared
   * projection array, a tightening recorded under transformation rule TR-1.
   *
   * THE ARGUMENT NAME IS PLURAL HERE AND SINGULAR ON THE SKU SIDE. THE ASYMMETRY IS PRESERVED.
   * AAP 0.4.2.6 records it as Discrepancy 6: `model/dao/ProductDAO.cfc:L419` declares
   * `productTypeIDs` while the SKU-side equivalent at `model/dao/SkuDAO.cfc:L130` declares
   * `productTypeID`. Two facts make the asymmetry harmless in practice, and both are worth
   * knowing before anyone is tempted to tidy it. First, the runtime shapes are identical: both
   * are comma-delimited strings bound as lists — `model/dao/ProductDAO.cfc:L425` and
   * `model/dao/SkuDAO.cfc:L136`. Second, the GUARDS genuinely differ:
   * `model/dao/ProductDAO.cfc:L423` tests length only, whereas
   * `model/dao/SkuDAO.cfc:L134` tests the trimmed value against empty, so a whitespace-only
   * argument is ACCEPTED as a filter by the product side and REJECTED by the SKU side. Renaming
   * either member would hide a real behavioural difference behind matching labels.
   *
   * The type stays `string`, deliberately, and is not modernised to an array. The value is
   * bound as a delimited list at `model/dao/ProductDAO.cfc:L425`; those list semantics are
   * load-bearing, and the plural name is what documents them at the call site.
   *
   * THE GUARDS ON THE TWO ARGUMENTS ARE ASYMMETRIC IN THE LEGACY SOURCE, AND THAT IS CARRIED
   * RATHER THAN REPAIRED. `model/dao/ProductDAO.cfc:L422` interpolates the search term into the
   * bound value with no existence check at all, even though the argument is optional at
   * `model/dao/ProductDAO.cfc:L419`, so invoking the legacy member without a term raises. The
   * product-type argument by contrast is doubly guarded — existence and length — at
   * `model/dao/ProductDAO.cfc:L423`. `term` is typed optional here because the declared
   * signature is the contract (transformation rule TR-1 preserves arity and order); the
   * behaviour on omission is recorded rather than corrected, and no rejection is promised in
   * either direction. This takes no register number: the defect register is closed at D1-D22.
   *
   * THE WILDCARD IS APPLIED INSIDE THE IMPLEMENTATION, NOT BY THE CALLER.
   * `model/dao/ProductDAO.cfc:L422` wraps the term in leading and trailing wildcards itself, so
   * callers pass a bare term and never a pattern. Stated explicitly so no caller pre-wraps and
   * no adapter double-wraps.
   *
   * DECLARED DESPITE HAVING NO CALLER, for the same reason as
   * {@link ProductRepository.findAttributeSets}. Searching the whole repository for this member
   * name returns exactly one line — its own declaration at `model/dao/ProductDAO.cfc:L419` — and
   * the sole call site of the product DAO accessor, `model/service/ProductService.cfc:L67`,
   * reaches the importer instead. Transformation rule TR-5 still governs: "The member is never
   * quietly dropped from the interface", and AAP 0.4.2.6 maps it explicitly to this named target
   * method. The finding is recorded so it is visible without being read as licence to remove the
   * member.
   *
   * TODO(parity): `model/dao/ProductDAO.cfc:L421` embeds a stale LOGICAL entity name inside a
   * NATIVE statement — the statement is assembled through the native query object created at
   * `model/dao/ProductDAO.cfc:L420` and set at `model/dao/ProductDAO.cfc:L427`, so a logical
   * name has no meaning there and only resolves at all because of the application-key prefixing
   * at `org/Hibachi/HibachiDAO.cfc:L102-L106`. The contrast that makes the finding legible is
   * `model/dao/ProductDAO.cfc:L53`, where a logical name is used inside HQL, which is exactly
   * where a logical name is correct. This also corrects the direction of the received account of
   * this defect: the component contains ZERO physical `Sw*` names anywhere, so the problem is a
   * logical name in native statement text, not a physical name in HQL. The conclusion the
   * adapter must carry: never "fix" HQL entity names to `Sw*`, and never assume a logical name
   * works in native statement text. Carried as observed, with no new register number.
   *
   * @param term - Bare search term for the product name, optional per
   *   `model/dao/ProductDAO.cfc:L419`; wildcards are added by the implementation at
   *   `model/dao/ProductDAO.cfc:L422`.
   * @param productTypeIDs - Optional comma-delimited product-type identifier list, bound as a
   *   list at `model/dao/ProductDAO.cfc:L425`. Plural by preservation; a string, not an array.
   * @returns The matching rows in the two-key projection built at
   *   `model/dao/ProductDAO.cfc:L430-L434`.
   */
  searchByProductType(term?: string, productTypeIDs?: string): Promise<ProductSearchRow[]>;
}
