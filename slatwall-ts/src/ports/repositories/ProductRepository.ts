/**
 * ProductRepository — the repository PORT for the Catalog's product-side data access.
 *
 * Legacy origin: `model/dao/ProductDAO.cfc`, declaring exactly three public members and one private
 * helper. Authority: AAP §0.4.1.6 "Ports" — "Three public members typed; the importer's return
 * contract made explicit" — with the member-by-member mapping fixed by AAP §0.4.2.6.
 *
 * The prompt named no DAOs. AAP §0.2.1.3 explains the implicit addition: "This is where the
 * Catalog's business logic actually resides, which makes these four files the single most important
 * implicit addition in the plan", because transliterating the four named services alone "would
 * therefore produce four thin, nearly empty TypeScript classes and silently lose the system's
 * behavior" (AAP §0.1.1). This module is one quarter of the correction.
 *
 * A declaration-only contract: two projection types and one interface carrying three method
 * signatures, with no runtime code of any kind. Its implementation lives at
 * `src/adapters/mysql/MySqlProductRepository.ts` (AAP §0.4.1.7) and its consumer is
 * `src/services/ProductService.ts`, wired once in the composition root at `src/config/container.ts`.
 *
 * As a port it references nothing outside itself — no sibling port, no domain entity, no Node
 * builtin, no package. Consequences, each a rule rather than an omission: no driver type and no
 * placeholder array appears, because statement text, identifier handling and binding order belong to
 * the adapter (AAP §0.7.3 S2, AAP §0.4.3.4 rule R4); no AWS type is named, because that coupling is
 * confined to `src/handlers/`; the environment is never read, because configuration flows one way
 * through `src/config/` (AAP §0.4.3.5); and no transaction, commit or flush member is declared,
 * because demarcation belongs to `src/adapters/mysql/UnitOfWork.ts` (mismatch M5, AAP §0.6.6).
 * Nothing from `org/Hibachi/**` is carried across (AAP §0.8.3.2) — the legacy component inherits from
 * `HibachiDAO`, and that inherited surface, including the paginated dynamic-query plumbing at
 * `org/Hibachi/HibachiDAO.cfc:L102-L111`, is read as a contract and reproduced nowhere. The
 * paginated abstraction belongs wholly to the smart-list query port.
 *
 * THE MEMBER CENSUS IS EXHAUSTIVE. The entire component body is one `<cfscript>` block spanning
 * `model/dao/ProductDAO.cfc:L51-L438`, and the component tag at `model/dao/ProductDAO.cfc:L49`
 * declares `accessors="true" extends="HibachiDAO"` with no property. Two things follow: the component
 * is STATELESS, so the caching mismatch M7 does not apply and no cache-bearing or cache-clearing
 * member appears below — unlike `model/dao/SkuDAO.cfc`, which memoizes an option-group sort order —
 * and because no member hides in tag syntax, the scanning hazard recorded as Discrepancy 7 in
 * AAP §0.4.2.6 does not reach this file.
 *
 * TWO FILE-WIDE TRANSLATION JUDGEMENTS (AAP §0.8.2 Guideline 6; the rest are recorded on the member
 * they affect):
 *
 *   (a) CFML EQUALITY IS CASE-INSENSITIVE; TYPESCRIPT `===` IS NOT — a live hazard here rather than a
 *       theoretical one. `model/dao/ProductDAO.cfc:L288` tests the database-type value with one
 *       spelling of "mySQL" and `model/dao/ProductDAO.cfc:L304` tests it with a differently-cased
 *       spelling of the same word. CFML treats the two as equal; a strict comparison would not, so
 *       one of the two backfills would silently stop firing. Discharging this is an obligation of
 *       `MySqlProductRepository.ts`; no signature below is affected.
 *
 *   (b) TWO DIVERGENT UNIQUE-`urlTitle` STRATEGIES COEXIST IN THE LEGACY TREE, AND ARE DOCUMENTED
 *       RATHER THAN HARMONISED (AAP §0.8.2 Guideline 4). The private importer helper at
 *       `model/dao/ProductDAO.cfc:L328` derives a title from a filtered product name and, on
 *       collision, appends the product code (`model/dao/ProductDAO.cfc:L398-L409`), and only for the
 *       product table. The service-layer algorithm at `model/service/DataService.cfc:L53-L71` instead
 *       appends an incrementing numeric suffix. Only the second is ported, as `src/util/urlTitle.ts`;
 *       the first stays inside the adapter that owns the importer.
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
 *   - Any new defect or mismatch identifier. ⚠️ F27: this bullet previously said "Both registers are
 *     closed — defects at D1-D22 and execution-model mismatches at M1-M8", and both numbers were
 *     wrong. The claim this module can honestly make is the LOCAL one — THIS FILE mints no identifier
 *     — so findings recorded below that carry no register number carry none deliberately. No range is
 *     restated here: the bounds and every port-minted entry are enumerated once, in
 *     `src/ports/repositories/SkuRepository.ts`.
 */

import type { BoundedReadResult, BoundedReadWindow } from './BoundedRead';

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

import type { Product } from '../../domain/product/Product';

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
  readonly id: string;

  readonly value: string;
}

/* ================================================================================================
 * SEC-08 IS WITHDRAWN — AN IMPORT LOCATION IS A PLAIN `string`, AND THE RISK IS FLAGGED, NOT CLOSED
 * ================================================================================================
 * ⚠️ WHAT WAS HERE, AND WHY IT IS GONE. An earlier revision narrowed the location argument of
 * {@link ProductRepository.importFromFile} to an unforgeable branded `ProductImportSource`, produced only
 * by a `validateProductImportSource` gate run against an operator-supplied `ProductImportSourcePolicy`
 * of allowed schemes, allowed hosts, byte cap, timeout and redirect count — and it laid four
 * address-level obligations (resolve-then-vet, connect-to-the-vetted-address, re-validate every redirect
 * hop, enforce bounds while streaming) on any adapter. All of it has been removed.
 *
 * ⛔ THE REASON IS THE MINIMAL CHANGE CLAUSE, NOT A REASSESSMENT OF THE RISK. AAP §0.6.7.7 declares D18
 * — parameterising `model/dao/ProductDAO.cfc`'s 21 interpolated statements — as THE SOLE deliberate
 * departure from behaviour preservation, and AAP §0.8.2 guideline 4 forbids enhancing or optimising
 * business logic beyond what the migration requires. A location the legacy would have fetched was being
 * REFUSED, which is a behavioural divergence; and the policy object itself was five invented
 * configuration values, which AAP §0.7.3 standard 9 and IR-12 forbid outright. The earlier block argued
 * the exception "on the D18 precedent", but D18 is a precedent for a divergence that removes an entire
 * class of flaw WITHOUT changing a single outcome the legacy produced — parameterised SQL returns exactly
 * the rows interpolated SQL returned. Refusing a fetch changes an outcome, so the two are not analogous.
 *
 * ⭐ WHAT THE LEGACY ACTUALLY DOES, STATED SO NOTHING IS ASSUMED. `model/service/ProductService.cfc:L65`
 * takes `required string fileURL` and performs NO check of any kind on it;
 * `model/dao/ProductDAO.cfc:L73` takes the same untouched string; and `model/dao/ProductDAO.cfc:L87`
 * retrieves it SERVER-SIDE with `cfhttp`, with a `new http()` fallback at `:L88-L90` for tab-delimited
 * files. There is no scheme list, no host list, no size cap, no timeout, no redirect policy and no
 * address check anywhere on that path. The port therefore declares a plain `string`, exactly as AAP
 * §0.4.2.6 specifies for `ProductRepository.importFromFile(fileURL, textQualifier)`.
 *
 * ⚠️ THE RISK IS REAL AND IS RECORDED AS MISMATCH M4, WHICH IS THE TREATMENT AAP §0.8.3.6 PRESCRIBES.
 * A caller-named location fetched from inside a VPC can reach internal services, a loopback admin port
 * or an instance-metadata endpoint, and the response is then parsed and written into the catalog — the
 * shape CWE-918 describes. That is a property of the LEGACY DESIGN, it is inherited by the port along
 * with everything else, and AAP §0.6.6 M4 already carries it ("Remote file fetch inside the request").
 * Closing it is a PRODUCT DECISION for the operator of the migrated service, taken with knowledge of the
 * network the Lambda runs in; it is not something this port may decide on the operator's behalf while
 * claiming behaviour preservation. No new mismatch identifier is minted: M4 is the entry.
 *
 * ⛔ CONSEQUENTLY THERE IS NOTHING FOR AN ADAPTER TO ENFORCE HERE. An implementation reproduces the
 * legacy retrieval and the legacy parse, and nothing more. It must not invent a scheme list, a host
 * list, a byte cap, a timeout, a redirect limit or an address check, because each of those would be a
 * number or a rule the source does not state.
 * ============================================================================================== */

/**
 * Optional invocation-scoped controls on one import.
 *
 * ⚠️ IT HAS NO LEGACY ORIGIN, AND NEITHER FIELD CHANGES WHAT IS IMPORTED, IN WHAT ORDER, OR WITH WHAT
 * STATEMENTS. `model/dao/ProductDAO.cfc:L73` declares exactly two arguments and the importer then runs
 * to completion or dies with its request. Omitting this object — which every caller written before it
 * existed does — reproduces that behaviour exactly. Each field below records the legacy fact that makes
 * it a workflow control rather than a behavioural switch.
 *
 * ⚠️ AND NO DURATION LIVES HERE. There is no timeout field, no deadline field and no default of either,
 * because AAP §0.7.3 S9 forbids inventing one: the legacy's only budget is the 3600-second REQUEST
 * timeout `model/service/ProductService.cfc:L65-L68` asks the CFML engine for, recorded as mismatch M1
 * precisely because no single invocation of the target runtime can represent it.
 */
export interface ProductImportOptions {
  /**
   * An invocation-scoped cancellation signal, observed at existing I/O and row boundaries only.
   *
   * ⚠️ IT IS NOT A TIMEOUT AND IT IS NOT DERIVED FROM ONE. The signal is whatever the caller already
   * holds — a handler's own invocation-scoped controller, typically. Absent it, behaviour is unchanged.
   *
   * ⚠️ WHERE IT IS OBSERVED, AND WHY ONLY THERE. Before the retrieval, after the retrieval, and at each
   * row boundary before that row's first statement — never inside a transaction, never between two
   * statements of one row, never mid-statement. Aborting between rows produces exactly the M3
   * partial-import shape a mid-file data failure already produces: rows before it committed, the
   * aborting row's own transaction rolled back with nothing written, and no later row attempted.
   * Aborting anywhere else would invent an outcome the legacy cannot produce.
   *
   * Cancellation surfaces as a thrown error naming the phase and, at a row boundary, the row number and
   * the count of rows already committed. It is not swallowed and not reported as success, because the
   * member's `void` return has no channel in which to report it.
   */
  readonly signal?: AbortSignal;

  /**
   * Suppress the two whole-catalog back-fills so the caller can run them once, later, via
   * {@link ProductRepository.backfillImportDerivedColumns}.
   *
   * ⚠️ THE DEFAULT — omitted or `false` — IS THE LEGACY'S OWN BEHAVIOUR, UNCONDITIONALLY.
   * `model/dao/ProductDAO.cfc:L288` and `:L304` sit outside every boundary AND outside every branch, so
   * they run after an empty file and after the `.xls` no-op too. That is what happens when this is unset.
   *
   * ⚠️ IT IS A DEFERRAL, NOT A SUPPRESSION, AND NOT A NARROWING. Neither statement is changed, guarded on
   * a record count, restricted to the identifiers an import touched, or given a `LIMIT`. A workflow that
   * defers and never invokes the back-fill member leaves products without default SKUs and SKUs without
   * image file names — state a legacy import never leaves behind. The obligation transfers to the caller;
   * it does not disappear.
   */
  readonly deferBackfills?: boolean;
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
 *
 * ⚠️ AND THE MEMBER COUNT IS NOW SEVEN, NOT THREE, WITHOUT THAT CONTRADICTING THE SENTENCE ABOVE. Three
 * members are the legacy's three public DAO members. The other FOUR are ADDITIVE and each is documented
 * at its own declaration:
 *
 *   `searchByProductTypeBounded`     an explicitly windowed companion to the unbounded search, issuing
 *                                    the same statement with the same match set.
 *   `backfillImportDerivedColumns`   exposes the two untransacted statements `importFromFile` already
 *                                    runs at `model/dao/ProductDAO.cfc:L287-L325`, so the out-of-band M1
 *                                    workflow can run them once per logical import.
 *   `saveProduct`                    the write `ProductService` requires and no adapter supplied — the
 *                                    F03 account is on the declaration itself.
 *   `removeProduct`                  its delete-path mirror, reached through `EntityRemover`.
 *
 * None adds behaviour and none replaces a legacy member. The first two re-express statements the legacy
 * already issued; the second two port writes the mapping layer emitted IMPLICITLY at flush time from the
 * property metadata at `model/entity/Product.cfc:L52-L99`, which AAP §0.4.1.7 gives to the adapter layer.
 */
export interface ProductRepository {
  /**
   * Returns the attribute sets matching the given attribute-set type codes, restricted by
   * product-type assignment.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L52`. Both arguments are declared `required array`
   * there, so both are REQUIRED and both are arrays here — under `exactOptionalPropertyTypes` that
   * distinction is load-bearing. Result ordering is fixed by the clause appended unconditionally at
   * `model/dao/ProductDAO.cfc:L62`.
   *
   * THE LEGACY MEMBER HAS TWO CONDITIONALS ON THE SAME PREDICATE, AND ONLY ONE MAY COLLAPSE. This is
   * the highest-risk item in the module, because getting it backwards compiles cleanly and returns
   * the wrong rows:
   *
   *   1. `model/dao/ProductDAO.cfc:L56-L61` SHAPES THE QUERY and MUST SURVIVE INTACT. When the
   *      product-type list is non-empty the predicate admits globally-flagged attribute sets OR those
   *      assigned to one of the given product types (`L57-L58`); when it is empty it admits
   *      globally-flagged sets ONLY (`L60`). Those are two genuinely different result sets.
   *   2. `model/dao/ProductDAO.cfc:L64-L69` ONLY BINDS PARAMETERS, and this is the one that
   *      collapses — see the parity note below.
   *
   * TODO(parity): `model/dao/ProductDAO.cfc:L64` carries a literal source TODO asking for its
   * conditional to be removed once the two CFML engines agree on how arrays are handled for an
   * `IN` clause. Its subject is the binding divergence immediately beneath it: the branch at
   * `model/dao/ProductDAO.cfc:L66` binds the attribute-set type codes as a flattened LIST while
   * `model/dao/ProductDAO.cfc:L68` binds the very same named parameter as an ARRAY — one
   * parameter, two shapes, purely to work around an engine difference. Per AAP 0.6.7.1 the
   * treatment is an intentional simplification with its reason recorded: no such engine
   * divergence exists in TypeScript, so the migration itself satisfies the TODO's precondition
   * and the adapter binds one shape on one path. This carries no new number because this file mints
   * none (S7).
   * Note that the two conditionals must be reasoned about together:
   * collapsing the binding branch while leaving the query-shaping branch intact is correct,
   * whereas collapsing the shaping branch — or collapsing only one and letting the query text
   * and the bound parameters drift apart — produces a fault with no compile-time signal.
   *
   * DECLARED DESPITE HAVING NO CALLER. No live path reaches this DAO member: the only call site of
   * the product DAO accessor in the tree is `model/service/ProductService.cfc:L67`, which reaches the
   * importer, and the same-named member at `model/entity/Product.cfc:L830-L832` is a different one —
   * it sits beneath the deprecation banner at `model/entity/Product.cfc:L830` and resolves through
   * the entity's own assigned-attribute-set accessor at `model/entity/Product.cfc:L833`. It is
   * declared anyway, because AAP §0.4.2.6 maps it explicitly to a named target method and TR-5 is
   * unambiguous: "The member is never quietly dropped from the interface." The asymmetry with the one
   * member the plan DOES omit is deliberate — the private, only-self-recursive method at
   * `model/service/ProductService.cfc:L82-L97` (defect D15) is omitted solely because AAP §0.4.1.8
   * instructs it. Dead code is dropped on explicit instruction, never on a port author's own
   * reachability analysis.
   *
   * @param attributeSetTypeCode - Attribute-set type system codes to match; required, and an array,
   *   per `model/dao/ProductDAO.cfc:L52`.
   * @param productTypeIDs - Product-type identifiers as a genuine array; required per
   *   `model/dao/ProductDAO.cfc:L52`. An empty array is meaningful, not degenerate: it selects the
   *   globally-flagged-only predicate at `model/dao/ProductDAO.cfc:L60`.
   * @returns The matching attribute sets in the legacy order. The element type is opaque; see
   *   {@link AttributeSetRow} for why.
   */
  findAttributeSets(
    attributeSetTypeCode: string[],
    productTypeIDs: string[],
  ): Promise<AttributeSetRow[]>;

  /**
   * Imports products, SKUs, options, custom attributes and content assignments from a delimited file
   * fetched over HTTP.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L73`. `fileURL` is `required string`; `textQualifier` is
   * optional with an empty-string default.
   *
   * THE RETURN CONTRACT IS `void`, AND THAT IS THE FINDING. AAP §0.4.1.6 asks for "the importer's
   * return contract made explicit"; made explicit, the legacy member is declared `void` at
   * `model/dao/ProductDAO.cfc:L73` and tells its caller NOTHING — no imported-row count, no error
   * collection, no success flag. Combined with the per-row commit boundary below, a failure part-way
   * through a file leaves a partially imported catalog that the caller cannot detect. Inventing a
   * summary object would fabricate behaviour the source does not have (AAP §0.7.3 S9).
   *
   * PRESERVED BEHAVIOUR A COMPETENT ENGINEER WOULD INSTINCTIVELY REPAIR — AND WHICH AAP 0.8.2
   * GUIDELINE 4 FORBIDS REPAIRING. Both are stated so they read as decisions, and neither takes
   * a register number, since this file mints none (S7):
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
   * CORRECTING THE RECORD ON THE HTTP FETCH. AAP §0.4.2.6 describes "a `new http()` fallback at
   * [L88-L90]". That characterisation is factually wrong and the locators show it: the block is
   * COMMENTED OUT, opening at `model/dao/ProductDAO.cfc:L89` and closing at
   * `model/dao/ProductDAO.cfc:L98`, and the comment above it at `model/dao/ProductDAO.cfc:L88`
   * records why it was abandoned — the script-based HTTP method did not work for a tab delimiter. It
   * is dead code, not a fallback. The ONE live fetch path is `model/dao/ProductDAO.cfc:L87`, which is
   * execution-model mismatch M4 (AAP §0.6.6): network retrieval performed inside the same request
   * that carries the transactions. No fallback is to be implemented, because none exists.
   *
   * That fetch is also a HIDDEN dependency: `model/dao/ProductDAO.cfc:L87` resolves its collaborator
   * by runtime string lookup and never declares it as a component property, so metadata-driven
   * dependency analysis misses it entirely — the same trap AAP §0.6.3.2 records for the image
   * collaborator of the SKU service. AAP §0.4.3.2 (rule R2) replaces such lookups with typed
   * constructor dependencies, so the retrieval collaborator is injected into
   * `MySqlProductRepository.ts`. This signature therefore takes no HTTP client, fetch function or
   * transport argument: adapters own input and output (AAP §0.7.3 S4).
   *
   * EXECUTION-MODEL MISMATCHES — CITED HERE, OWNED ELSEWHERE (AAP 0.7.3, S8). No new number is
   * minted here, and no range is restated — see `src/ports/repositories/SkuRepository.ts` for the
   * register's bounds:
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
   * TODO(boundary): the legacy importer reaches collaborators this slice excludes, and each is an
   * adapter concern rather than a change to this signature, since ports are injected at the
   * composition root (AAP §0.7.3 S3). It reads the current account at
   * `model/dao/ProductDAO.cfc:L153` and `model/dao/ProductDAO.cfc:L341`, which maps to the
   * account-context port; it reads the global image-extension setting at
   * `model/dao/ProductDAO.cfc:L307`, `L313` and `L320`, which maps to the setting-resolver port; and
   * at `model/dao/ProductDAO.cfc:L262` it reads a Mura CMS content table, which belongs to a
   * different application altogether and has no port in this plan.
   *
   * ⛔ THE LOCATION IS A PLAIN, UNCHECKED `string`, AND SEC-08'S WITHDRAWAL BLOCK ABOVE CARRIES THE WHOLE
   * ACCOUNT. In short: the legacy checks nothing on this path, the risk that follows is mismatch M4, and
   * an implementation must NOT invent a scheme list, host list, byte cap, timeout, redirect limit or
   * address check to close it — closing it is the operator's decision, taken with knowledge of the
   * network the function runs in.
   *
   * ⚠️ AND THE ONE THING NOT TO DO: do not fetch inside the per-row transaction. Mismatch M4 records
   * that the legacy performs network retrieval inside the transaction-bearing request, compounding M1
   * and M3. Reproducing the fetch is required; reproducing its PLACEMENT is not, and the boundary is
   * `UnitOfWork.ts`'s to own.
   *
   * @param fileURL - Location of the delimited file to retrieve and import, forwarded exactly as the
   *   caller supplied it. Occupies the first argument position of `model/dao/ProductDAO.cfc:L73`, where
   *   it is declared `required string fileURL`; the name, type, arity and argument order all match that
   *   declaration (TR-1). The file type is still derived from the extension inside the implementation,
   *   at `model/dao/ProductDAO.cfc:L74`.
   * @param textQualifier - Optional text qualifier, defaulting to empty per
   *   `model/dao/ProductDAO.cfc:L73`.
   * @param options - Optional invocation-scoped controls. Both are ADDITIONS with no legacy origin and
   *   neither changes what is imported, in what order, or with what statements. `signal` lets the caller
   *   cancel at an existing I/O or row boundary; `deferBackfills` lets the out-of-band M1 workflow run
   *   the two whole-catalog back-fills once per logical import rather than once per invocation, via
   *   {@link ProductRepository.backfillImportDerivedColumns}. Omitting the object reproduces the legacy
   *   import exactly, which is what every pre-existing caller does. NO timeout, deadline or duration is
   *   defined by this port (AAP §0.7.3 S9); the legacy's own 3600-second budget is a request timeout owned
   *   by `model/service/ProductService.cfc:L65-L68` and recorded as mismatch M1.
   * @returns Nothing. Resolution carries no report of what was imported; see the return-contract note
   *   above.
   */
  importFromFile(
    fileURL: string,
    textQualifier?: string,
    options?: ProductImportOptions,
  ): Promise<void>;

  /**
   * Run the two whole-catalog back-fills the import ends with, as an explicitly invocable step.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L287-L325`. `:L288-L302` sets the default SKU on every
   * product that still lacks one, and `:L303-L325` derives each SKU's image file name from its product.
   * Both sit past the closing braces of the per-row transaction (`:L284`) and the record loop (`:L285`),
   * so BOTH RUN OUTSIDE EVERY TRANSACTION, in that order, and neither can be rolled back.
   *
   * ⚠️ THIS MEMBER ADDS NO BEHAVIOUR AND CHANGES NEITHER STATEMENT. Same two statements, same order, same
   * untransacted execution, same whole-catalog reach. It is not guarded on a record count, not restricted
   * to the identifiers any particular import touched, and carries no `LIMIT` — narrowing any of that would
   * change which rows are updated, which AAP §0.8.2 Guideline 4 forbids and which the review conditions on
   * a parity exception this port does not claim.
   *
   * ⭐ WHY IT IS EXPOSED SEPARATELY. {@link ProductRepository.importFromFile} still runs both by default,
   * so the legacy end-to-end shape is unchanged for every existing caller. But AAP §0.6.6 M1 establishes
   * that a 3600-second import cannot be represented in one invocation of the target runtime and must be
   * carried by an out-of-band workflow. Such a workflow importing a catalog across several invocations
   * would otherwise repeat two full-table passes for every chunk. Passing `deferBackfills` on the chunks
   * and invoking this member once at the end performs exactly the same two statements, in the same order,
   * over the same rows — once per logical import.
   *
   * ⚠️ AND IT IS AN OBLIGATION, NOT AN OPTION. A workflow that defers the back-fills and never invokes
   * this member leaves products without default SKUs and SKUs without image file names — state a legacy
   * import never leaves behind. Deferring transfers the obligation to the caller; it does not remove it.
   *
   * @returns Nothing, for the same reason the import returns nothing: the legacy statements report no
   *   summary and `:L302` and `:L325` are executed for effect alone.
   */
  backfillImportDerivedColumns(): Promise<void>;

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
   * either direction. This takes no register number because this file mints none (S7).
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

  /**
   * The same search as {@link ProductRepository.searchByProductType}, restricted to a caller-stated
   * window.
   *
   * ⚠️ ADDITIONAL SURFACE, NOT A REPLACEMENT. The unbounded member above is the port of
   * `model/dao/ProductDAO.cfc:L419-L437` and stays unbounded, because that statement is unbounded and
   * capping it would substitute a short answer for a complete one with nothing to show for the
   * substitution (AAP §0.8.2 Guideline 4, §0.7.3 S9). This member gives a caller that can state a
   * ceiling a place to state it.
   *
   * THE MATCH SET IS IDENTICAL IN EVERY RESPECT. Same `LIKE` predicate with the wildcards still added
   * by the implementation at the binding site, so callers still pass a BARE term; the same
   * `len()`-not-`trim()` guard on the product-type list, which stays deliberately looser than the
   * SKU-side equivalent (Discrepancy 6); the same list splitting; the same bind order of term first
   * then product-type identifiers; and the same failure when the term is omitted. The window is
   * applied last and changes only how many qualifying rows are returned.
   *
   * ⚠️ NO ORDERING IS ADDED. `model/dao/ProductDAO.cfc:L421` declares no `ORDER BY` and none may be
   * introduced, so successive windows are not guaranteed disjoint or exhaustive. This bounds COST, not
   * page stability; `BoundedRead` states the limitation once for all bounded members.
   *
   * THE WINDOW COMES FIRST because both search arguments are optional and an optional parameter cannot
   * precede a required one. That is the only departure from the unbounded member's argument order.
   *
   * @param window - the caller's row ceiling and zero-based offset. Both required; neither defaulted.
   * @param term - bare product-name fragment. Same contract as the unbounded member, including that
   *   omitting it raises.
   * @param productTypeIDs - optional comma-delimited product-type identifier list. Plural by
   *   preservation; a string, not an array.
   * @returns the window's rows, plus whether at least one further match lies past it. Never null.
   */
  searchByProductTypeBounded(
    window: BoundedReadWindow,
    term?: string,
    productTypeIDs?: string,
  ): Promise<BoundedReadResult<ProductSearchRow>>;
  /**
   * Write one product — insert when it is transient, update when it is not.
   *
   * ==================================================================================================
   * THE MEMBER `ProductService.saveProduct` NEEDS, AND WHICH NO ADAPTER SUPPLIED (F03)
   * ==================================================================================================
   * ⭐ THE IMPORTER'S SQL COMPOSERS ARE NOT THIS, AND MISTAKING THEM FOR IT IS THE WHOLE DEFECT.
   * `src/services/ProductService.ts` requires a `persistProduct: EntityPersister<Product>`, and the only
   * `SwProduct` writes anywhere in the adapter layer belonged to `importFromFile` — statements that write
   * the handful of columns a spreadsheet row happens to supply, inside the importer's own per-row
   * transaction, with no update form, no audit stamp and no foreign keys. Nothing could satisfy the
   * persister, so `saveProduct` had no way to store a product: the whole save path terminated in an
   * unwireable collaborator.
   *
   * WHY THE LEGACY DAO DECLARES NO EQUIVALENT. `model/dao/ProductDAO.cfc` has three public members and
   * none of them writes a product, because the mapping layer emitted every insert and update implicitly
   * at flush time from the property metadata at `model/entity/Product.cfc:L52-L99`. AAP §0.4.1.7 gives
   * that vanished behaviour to the adapter layer, so declaring it here ports a real legacy behaviour
   * rather than adding to the legacy surface.
   *
   * ⭐ THE THREE FOREIGN KEYS ARE WRITTEN, AND THE READ MAPPER KEEPS THEM ALIVE AS REFERENCES ONLY.
   * `mapProductRow` in `src/adapters/mysql/rowMappers.ts` resolves no association to a LOADED entity —
   * its RULE 3 — but rule 3a populates `brand`, `productType` and `defaultSku` with IDENTIFIER-ONLY
   * references whose every other read refuses. An implementation must write all three, and it reads each
   * one off the association object rather than off a scalar, because no `product.brandID` field exists
   * anywhere in the domain.
   *
   * ⚠️ RULE 3a IS WHAT MAKES A HYDRATE-THEN-WRITE ROUND TRIP SAFE, and it was added because the omission
   * was data loss rather than an asymmetry: with the three slots left genuinely absent, writing back a
   * product this port had just read NULLED all three foreign keys — silently, with no error and no
   * failing type — since the FK column IS where each of those links lives. A smart-list consumer had no
   * recovery either, because `SmartListQueryBuilder.execute` discards its rows once mapped.
   * `src/adapters/mysql/catalogAggregates.ts` upgrades those references to fully loaded entities for the
   * callers that need the graph; nothing here depends on that having happened.
   *
   * ⛔ AND `defaultSkuID` CANNOT BE WRITTEN ON THE INSERT OF A NEW PRODUCT'S FIRST SAVE. The two tables
   * reference each other: `model/entity/Product.cfc:L71` declares `defaultSku` many-to-one with
   * `fkcolumn="defaultSkuID"`, while `model/entity/Sku.cfc:L65` declares `product` many-to-one with
   * `fkcolumn="productID"`. A SKU cannot be inserted before its product exists, and the product's default
   * cannot be set before that SKU exists. The mapping layer resolved this by ordering the graph itself and
   * issuing a follow-up UPDATE; the port must therefore be able to write a product with a null default and
   * then write it again. That is exactly what insert-then-update supports, and it is why this member takes
   * a whole product rather than a column subset. The full ordering is recorded on
   * {@link ProductRepository.saveProduct} implementations and in `src/adapters/mysql/UnitOfWork.ts`.
   *
   * ⛔ IT DOES NOT COMMIT, AND IT VALIDATES NOTHING. Demarcation belongs to the caller (mismatch M5), and
   * `model/validation/Product.json`'s required fields, uniqueness rules and delete guards are ported as a
   * typed rule set the service evaluates first, exactly as `model/service/HibachiService.cfc:L86` gates
   * its own save.
   *
   * ⚠️ THE FOUR PERSISTED `calculated*` COLUMNS ARE WRITTEN AS THE ENTITY CARRIES THEM.
   * `model/entity/Product.cfc:L62-L65` declares them persistent, and the out-of-scope services that
   * MAINTAIN them are excluded by AAP §0.2.2.6 — so they are stored, never computed here. Computing one
   * would import a pricing or inventory rule into the adapter layer.
   *
   * @param product - The product to write. MUTATED when transient: it receives its 32-character
   *   identifier, because `model/entity/Product.cfc:L52` declares `fieldtype="id" generator="uuid"` and
   *   the legacy generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`.
   * @returns The same product, so the member satisfies `EntityPersister<Product>` directly.
   */
  saveProduct(product: Product): Promise<Product>;

  /**
   * Remove one product.
   *
   * Replaces the `delete` branch at `org/Hibachi/HibachiService.cfc:L270`, reaching `delete()` at
   * `org/Hibachi/HibachiDAO.cfc:L69-L77`. Required because `ProductService` holds a
   * `ProductBaseService` — a `Pick<…, 'delete'>` of the base service — whose construction needs an
   * `EntityRemover<Product>`, and `model/service/ProductService.cfc:L317` declares `deleteProduct` as
   * public surface AAP §0.4.2.1 pins.
   *
   * ⛔ THE DELETE GUARDS RUN ABOVE THIS MEMBER. `model/validation/Product.json` guards deletion on
   * `transactionExistsFlag` and on `physicalCounts`; both are ported as typed rules the service evaluates,
   * so a blocked removal never arrives here and the result carries no validation outcome.
   *
   * ⭐ ONE CASCADE IS EXPRESSED, AND ONLY ONE, BECAUSE ONLY ONE IS UNREACHABLE BY GUARD.
   * `model/entity/Product.cfc:L71` declares `cascade="delete"` on `defaultSku`, and `:L75-L78` declare
   * `cascade="all-delete-orphan"` on skus, productImages, attributeValues and productReviews. The delete
   * guards do NOT bound the SKU collection — a product with SKUs but no transactions and no physical
   * counts is deletable — so the SKU rows and their `SwSkuOption` links must be removed, and they must go
   * BEFORE the product row: `SwSku.productID` references it. `SwProduct.defaultSkuID` references the SKU
   * in the other direction, so the reference has to be cleared first. The resulting order is stated on the
   * implementation and is not a matter of preference: any other sequence leaves a dangling reference.
   *
   * ⚠️ THE OUT-OF-SCOPE CASCADES ARE NOT EMITTED, AND THE GAP IS FLAGGED RATHER THAN GUESSED AT.
   * `productImages`, `attributeValues` and `productReviews` belong to the excluded Content, Attribute and
   * Review domains (AAP §0.2.2.1), whose tables this port may not name — inventing their column names
   * would violate S9. TR-5 requires the boundary be declared, so it is declared here: an operator whose
   * schema enforces those foreign keys must remove those rows outside this port.
   *
   * @param product - The product to remove. Must carry a persistent identifier.
   * @returns Nothing, so the member satisfies `EntityRemover<Product>` directly.
   */
  removeProduct(product: Product): Promise<void>;
}
