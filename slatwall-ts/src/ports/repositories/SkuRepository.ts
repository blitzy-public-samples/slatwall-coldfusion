/**
 * `SkuRepository` — the repository port for the Catalog's SKU query surface, and the contract that
 * carries the option-to-SKU resolution algorithm across the migration boundary.
 *
 * Legacy origin: `model/dao/SkuDAO.cfc`. AAP §0.1.1 explains why a service-oriented reading of this
 * codebase misleads — the Catalog's option-to-SKU resolution "lives in a DAO as a hand-assembled HQL
 * string", so transliterating the four named services would produce thin, nearly empty classes and
 * silently lose the system's behaviour. That string is `model/dao/SkuDAO.cfc:L107-L128`, and this
 * file is its contract. The consuming service corroborates it: `model/service/SkuService.cfc`
 * reaches this component eight times, the heaviest dependency in the slice (AAP §0.6.3.2), and four
 * of its members are one-line pass-throughs at `L272`, `L282`, `L286` and `L290`.
 *
 * AAP §0.4.1.6 mandates the shape — "Six public members plus the two private helpers become a typed
 * interface; the memoized sort-order cache becomes explicit request-scoped state" — and AAP §0.4.2.6
 * fixes each target name, which is the authority followed below.
 *
 * SEVEN MEMBERS, NOT SIX (Discrepancy 7). AAP §0.2.1.3 characterises the component as "6 public, 2
 * private"; the declarations read SEVEN public and ONE private, because only
 * `model/dao/SkuDAO.cfc:L204` restricts access while `model/dao/SkuDAO.cfc:L222` declares itself
 * public. AAP §0.4.2.6 enumerates seven target methods, so seven are declared rather than one being
 * dropped. The count is easy to get wrong because the component MIXES BOTH CFML SYNTAXES — tag at
 * `model/dao/SkuDAO.cfc:L49-L98`, script at `L100-L170`, tag again at `L172-L226` — so a scan
 * matching only script-style declarations finds four members and misses the other four, including
 * the memoized sort order and its clearing member.
 *
 * THE FIVE SEMANTICS THAT MUST SURVIVE TRANSLATION. AAP §0.6.1.3 names five semantics of the option
 * resolver and calls them silent-drift traps — a plausible "improvement" that changes results
 * without producing an error. Each is documented on
 * {@link SkuRepository.findSkusBySelectedOptions} as T1 through T5, because that is the member whose
 * signature decides them, and four are decided HERE rather than in the adapter:
 *
 *   T1 is an array parameter rather than a deduplicating collection type.
 *   T2 is a required parameter rather than an optional one.
 *   T5 is a plain array type rather than a non-empty one.
 *   T3 and T4 are documentation obligations on the returned set.
 *
 * An adapter cannot recover a semantic the interface has already discarded: if T1's parameter type
 * deduplicated, no adapter could reconstruct the duplicates; if T5's type forbade emptiness, no
 * adapter would ever see the degenerate case two legacy callers depend on.
 *
 * Statement text, placeholder generation, identifier handling and row mapping belong to
 * `src/adapters/mysql/MySqlSkuRepository.ts` (AAP §0.4.1.7, §0.4.3.4). Nothing statement-shaped
 * crosses this boundary — no fragment, no table or column name as a parameter, no placeholder array,
 * no ordering expression (AAP §0.7.3 S2). What this file DOES carry is the adapter OBLIGATIONS the
 * type system cannot express, each stated on the member it constrains with its legacy locator.
 *
 * TWO PARAMETER CONVENTIONS COEXIST in the legacy component and the adapter must reconcile them
 * without disturbing order: the existence chain binds by NAME, the option resolver binds
 * POSITIONALLY. The target driver supports positional placeholders only, so named bindings become
 * positional ones while PRESERVING THE LEGACY SEQUENCE exactly (TR-4). Where a value is composed
 * into statement text rather than bound, the adapter binds it — see
 * {@link SkuRepository.findSortedSkuIdsByProduct}, the one place where a memoized NUMBER occupies a
 * value position.
 *
 * =================================================================================================
 * THE ONE STATEFUL DATA-ACCESS COMPONENT OF THE FOUR (execution-model mismatch M7)
 * =================================================================================================
 * `model/dao/SkuDAO.cfc:L49` declares the component with generated accessors and
 * `model/dao/SkuDAO.cfc:L51` declares a numeric property to hold a memoized value. Its three
 * siblings declare no property at all. This is therefore the only port in the folder that has a
 * cache lifetime to reason about, and the reasoning is recorded on
 * {@link SkuRepository.clearOptionGroupSortOrderCache}: under mismatch M7 the memo becomes EXPLICIT
 * REQUEST-SCOPED state and never module-scope state, because module-scope state survives between
 * warm invocations and would bleed across them. No new mismatch identifier is introduced HERE — but
 * the mismatch register is NOT closed at M1-M8, and see the register note below (F27).
 *
 * =================================================================================================
 * THE COMPONENT USES TWO NAMING CONVENTIONS FOR THE SAME TABLES (defect D22)
 * =================================================================================================
 * TODO(parity): the divergence is INTRA-FILE, which is the sharpest form the finding takes, and it
 * is carried rather than reconciled. `model/dao/SkuDAO.cfc:L132` and `model/dao/SkuDAO.cfc:L135`
 * place LOGICAL entity names inside a NATIVE statement, whereas `model/dao/SkuDAO.cfc:L179-L211`
 * correctly uses the PHYSICAL table names in native statements. One component, two conventions. The
 * logical names arise because the framework prefixes an entity name with the application key at
 * `org/Hibachi/HibachiDAO.cfc:L102-L106`, which is a mapping-layer convenience that native
 * statements do not receive. The conclusion for implementers is unchanged and must be carried:
 * never "fix" mapping-layer entity names to physical ones, and never assume a logical name works in
 * a native statement. Which convention each member's statement uses is stated on that member. No
 * new defect identifier is introduced BY THIS MEMBER'S ANNOTATION.
 *
 * =================================================================================================
 * ⚠️ F27 — THE REGISTERS ARE NOT "CLOSED", AND SAYING SO WAS A FALSE STATEMENT OF FACT
 * =================================================================================================
 * This block previously ended "No new defect identifier is introduced — the register is closed at
 * D1-D22", and the sentence refuted itself: D22 is annotated immediately above it, and D22 is NOT an
 * AAP entry. The accurate position is stated here ONCE, because this is where the first port-minted
 * number is defined, and every other register note in the subtree now points at it rather than
 * restating a range.
 *
 *   AAP §0.6.7 IS AUTHORITATIVE AND FROZEN AT D1–D21 — twenty-one entries: three literal source
 *   TODOs (D8, D20, D21) plus eighteen defects surfaced during analysis. No file in this port may
 *   amend that range, and none does.
 *
 *   THIS PORT HAS MINTED THREE IDENTIFIERS BEYOND IT, each where a verified source-level finding had
 *   no AAP entry. D22 is the one above. D23 and D24 are both in `src/services/SkuService.ts`:
 *   `getTransactionExistsFlag` forwards arguments its signature never declares
 *   (`model/service/SkuService.cfc:L285-L287`), and `processImageUpload` returns a boolean rather
 *   than the `Promise<Sku>` AAP §0.4.2.2 tabulates (`:L210-L218`).
 *
 *   THE MISMATCH REGISTER IS EXTENDED THE SAME WAY. AAP §0.6.6 allocates M1–M8; `SkuService.ts`
 *   mints M9, because CFML specifies no iteration order for a plain struct while the port's `Map`
 *   preserves insertion order.
 *
 *   THERE IS NO D25 AND NO M10. Nothing in this subtree mints or cites either, so there is no
 *   authoritative D25 classification outstanding to supply: the numbering runs D1–D24 and M1–M9
 *   with no gap and no reservation.
 *
 * The only honest claim a single file can therefore make is LOCAL — "no new identifier is minted
 * here" — and that is what every register note in this subtree now says. A GLOBAL closure claim is
 * unverifiable by a reviewer reading one file, and as of D22 it is simply untrue.
 *
 * WHAT IS DELIBERATELY NOT HERE. Each omission is identified by its behaviour and its locator, never
 * by its legacy identifier string, so that a documented ABSENCE cannot be mistaken for a declaration
 * by a surface scan:
 *
 *   - THE PRIVATE MEMOIZED SORT-ORDER ACCESSOR at `model/dao/SkuDAO.cfc:L204-L220`. AAP §0.4.2.6
 *     marks it "Internal to the adapter", so it is absent BY INSTRUCTION. Its observable
 *     consequences are documented on {@link SkuRepository.findSortedSkuIdsByProduct} (it supplies
 *     the ordering exponent) and {@link SkuRepository.clearOptionGroupSortOrderCache} (it is the
 *     thing not being cleared).
 *
 *   - THE INHERITED PAGINATED DYNAMIC-QUERY READER at `org/Hibachi/HibachiDAO.cfc:L102-L111`, which
 *     is framework plumbing serving every service and belongs to the paginated dynamic-query port at
 *     the root of `src/ports/`. Nothing from `org/Hibachi/**` is carried across (AAP §0.8.3.2).
 *
 *   - THE STOCK-DELETABILITY FLAG READER that `model/service/SkuService.cfc:L281-L283` delegates to.
 *     It does not exist anywhere in the legacy tree — only the service declaration, the delegation
 *     and the entity call site at `model/entity/Sku.cfc:L569` — and that absence IS defect D4.
 *     Inventing it here to make the service compile is the wrong repair; AAP §0.4.2.2 requires an
 *     explicit not-implemented boundary in the SERVICE instead. Named so a later reader does not
 *     helpfully add it.
 *
 *   - THE UNIQUENESS CHECK at `org/Hibachi/HibachiDAO.cfc:L129-L147`. Real behaviour (IR-5) and
 *     genuinely needed by the SKU-code rule of `model/validation/Sku.json`, but framework-level and
 *     shared by every entity, so it is owned by the uniqueness port at the root of `src/ports/`.
 *
 *   - THE IDENTIFIER GENERATOR. `model/dao/HibachiDAO.cfc` — the LOCAL base this component extends,
 *     not the framework one (IR-8) — exposes the 32-character generator ported to `src/util/uuid.ts`
 *     (IR-6). This port neither generates nor validates identifiers.
 *
 *   - ANY TRANSACTION, SESSION, FLUSH OR VISIBILITY PARAMETER. The read-back ordering hazard of AAP
 *     §0.6.2 passes straight through this contract and is documented on
 *     {@link SkuRepository.findSkusBySelectedOptions}, but the guarantee is owned by
 *     `src/adapters/mysql/UnitOfWork.ts` under mismatch M6 — the VALIDATION READ-BACK, which is M6
 *     and not M5. M5 is the request-end implicit transaction demarcation; the two are adjacent and
 *     easy to transpose, and `UnitOfWork.ts` answers for both for different reasons. Expressing
 *     either as a parameter here would place a demarcation concern in a query contract.
 *
 *   - ANY TIMEOUT, RETRY, BATCH-SIZE, PAGE-SIZE, MAXIMUM-RESULTS, CACHE-LIFETIME OR EVICTION NUMBER,
 *     and any filter, sort-key or collation argument (AAP §0.7.3 S9, IR-12). Every number below is a
 *     source-declared value carrying its locator.
 *
 * `model/dao/SkuDAO.cfc` is REFERENCE-ONLY and never modified (AAP §0.4.1.1, TR-6). The Minimal
 * Change Clause (AAP §0.8.1) draws the line this file is built on — idiom may change freely,
 * behaviour may not. So a delimited list becomes an array, a column-oriented record set becomes a
 * typed array, one-based loops become zero-based, and synchronous members become promise-returning
 * ones because the target driver is asynchronous; exactly one member stays synchronous and says why.
 * Meanwhile duplicate option identifiers survive, an empty option list stays legal, option-less SKUs
 * stay excluded, a required argument stays required, a singular argument name keeps carrying a plural
 * value, a multi-match still raises, and an inert clearing member still exists.
 */

import type { Product } from '../../domain/product/Product';
import type { Sku } from '../../domain/sku/Sku';

/**
 * The element type of {@link SkuRepository.findSkusBySelectedOptions} — a hydrated SKU.
 *
 * WHY THE ALIAS EXISTS AT ALL, SINCE IT ADDS NO STRUCTURE. AAP 0.6.1.4 names the return type
 * `Promise<SkuRow[]>` verbatim when it specifies that member, so the name is preserved to keep the
 * plan and the code checkable against each other line by line (AAP 0.8.5). What the name must NOT
 * do is imply a second, narrower shape: the legacy call at `model/dao/SkuDAO.cfc:L127` passes no
 * unique-result flag and returns fully hydrated SKU entities, exactly like every other read in the
 * component. This alias therefore resolves to the domain entity and to nothing else.
 *
 * AN ENUMERATED COLUMN-LIST TYPE IS DELIBERATELY NOT DECLARED HERE. Column-to-field mapping has one
 * owner, `src/adapters/mysql/rowMappers.ts` (AAP 0.4.1.7), which replaces the mapping the ORM
 * previously derived from component metadata. A parallel row type in this file would be a second
 * place for the physical schema to be described, and the two would drift the first time a mapper
 * changed. The name is a compatibility alias; the type is the entity.
 */
export type SkuRow = Sku;

/**
 * One row of {@link SkuRepository.searchByProductType} — a SKU offered for selection.
 *
 * NEITHER FIELD NAME DESCRIBES ITS CONTENT, AND BOTH ARE FIXED. `model/dao/SkuDAO.cfc:L141-L146`
 * assembles each row with two QUOTED lowercase keys: `id` carries the SKU's own identifier and
 * `value` carries its SKU CODE — a human-readable code, not an identifier and not a price. The
 * projection is chosen at `model/dao/SkuDAO.cfc:L132`, so the pairing is fixed there and only
 * renamed here. Implementations MUST keep both keys lowercase and MUST NOT swap their contents: the
 * two fields are same-typed, so a swap produces a drop-down whose visible labels are opaque
 * identifiers and whose submitted values are codes, with no compile error anywhere.
 *
 * THE STRUCTURAL DUPLICATION WITH THE SIBLING PORTS IS DELIBERATE — DO NOT COLLAPSE IT. Two other
 * ports in this folder declare shape-identical two-field row types, and the search member of the
 * product port even shares this one's target method name. They are nonetheless separate types,
 * because they are semantically different: this row's `value` is a SKU code, while a sibling's
 * corresponding field carries a different entity's label entirely. Aliasing them together, or
 * hoisting one into a shared module, would let a row from one search be handed to a consumer
 * expecting the other with nothing to catch it. Two names for two meanings encodes a
 * behaviour-bearing difference; it is not redundancy awaiting cleanup (AAP 0.8.2, Guideline 4). For
 * the same reason this module imports nothing from its siblings.
 *
 * Both fields are `readonly`: a row is a query-computed projection, never an object written back.
 * The legacy array is assembled one-based at `model/dao/SkuDAO.cfc:L141`; the zero-based array a
 * TypeScript implementation returns holds the same rows, in the same order, with the same values —
 * an idiom change under AAP 0.8.1 and nothing more.
 */
export interface SkuSearchRow {
  readonly id: string;
  readonly value: string;
}

/**
 * Port for the seven SKU queries of `model/dao/SkuDAO.cfc`, consumed by
 * `src/services/SkuService.ts` and `src/services/ProductService.ts`, and implemented against MySQL
 * in `src/adapters/mysql/**`.
 *
 * The implementation arrives by explicit constructor injection, replacing the framework property
 * declared at `model/service/SkuService.cfc:L52` and the accessor synthesised for it, which
 * resolved by name at runtime (AAP 0.4.3.1 R1 and 0.4.3.2 R2; AAP 0.7.3, S3). Two consumers inject
 * it, and both are genuine: `SkuService` with eight call sites and `ProductService` with one, the
 * latter being the sole caller of the option resolver (AAP 0.6.3.1 and 0.6.3.2). The dead injection
 * those components also declare — a mutual service reference with zero call sites at
 * `model/service/SkuService.cfc:L54` — is deliberately unrepresented anywhere, which also removes a
 * cycle between the two services at no cost (AAP 0.4.3.1).
 *
 * THE SERVICE SURFACE AND THIS SURFACE ARE DIFFERENT SHAPES, DELIBERATELY, AND THREE MEMBERS PROVE
 * IT. Their signatures diverge in the legacy tree, and the divergence is PRESERVED on both sides
 * rather than harmonised (TR-1): the existence check takes no argument at the service and two here;
 * the SKU-code read is optional at the service and required here; the fetch flag is defaulted at
 * the service and required here. Each divergence is documented on the member it affects, with both
 * locators, so it stays checkable from either end. Harmonising them would be the enhancement AAP
 * 0.8.2 Guideline 4 forbids.
 *
 * SIX MEMBERS RESOLVE, ONE RETURNS DIRECTLY. The six database-touching reads are promise-returning
 * because the target driver is asynchronous, whereas the legacy members were synchronous only
 * because a CFML query blocks the request thread — idiom, and the permitted half of the Minimal
 * Change Clause (AAP 0.8.1). {@link SkuRepository.clearOptionGroupSortOrderCache} is the deliberate
 * exception and its synchronous signature carries information rather than style; see the member.
 */
export interface SkuRepository {
  /**
   * Reports whether any transaction record references a SKU — either one specific SKU, or any SKU
   * of one product.
   *
   * DECLARED IN TAG SYNTAX, RETURNING A BOOLEAN, WITH NO ACCESS RESTRICTION. The legacy member is
   * declared at `model/dao/SkuDAO.cfc:L53`, which states a boolean return and omits any access
   * attribute, so it is public by default. It is also one of the four members that a script-only
   * scan of the component never sees — see the mixed-syntax note in the file header — and AAP
   * 0.4.2.6 maps it to the target name declared below.
   *
   * THE BUSINESS RULE, AND IT IS A DELETE GUARD. A single existence predicate spans
   * `model/dao/SkuDAO.cfc:L65-L85` and combines TEN existence tests across NINE distinct entity
   * families with OR: order items, inventory records, order delivery items, physical count items,
   * stock adjustment delivery items, stock adjustment items TWICE — once through their source stock
   * and once through their destination stock, at `L76` and `L78` — stock holds, stock receiver
   * items and vendor order items. A true result means the SKU has been transacted against and
   * therefore must not be deleted; the flag is consumed by the delete guards that
   * `model/validation/Sku.json` and `model/validation/Product.json` declare.
   *
   * TODO(boundary): every one of those nine families is EXCLUDED from this slice by AAP 0.2.2.1 —
   * the order, inventory, physical, stock and vendor patterns together cover dozens of files — so
   * this single predicate is the widest reach across the scope boundary in the whole port. It is
   * crossed by returning a `boolean` and nothing else. No entity type from any excluded family is
   * imported, referenced or described here, and none may be: doing so would drag those domains into
   * the port and break AAP 0.8.3.8, which requires the extracted services to be "callable and
   * deployable without requiring the rest of Slatwall to be converted". The adapter answers the
   * question; the boundary stays a single scalar.
   *
   * THE TWO ARGUMENTS ARE MUTUALLY EXCLUSIVE, NOT COMBINABLE, AND THE SKU IDENTIFIER WINS.
   * `model/dao/SkuDAO.cfc:L59-L63` chooses ONE predicate: when a SKU identifier is present and
   * non-null it filters on that SKU, and OTHERWISE it filters on the product. The binding branch at
   * `model/dao/SkuDAO.cfc:L87-L91` repeats the identical test, so exactly ONE value is ever bound.
   * Implementations MUST NOT emit two predicates, MUST NOT combine them with AND, and MUST NOT bind
   * two values — supplying both arguments does not narrow the search, it silently ignores the
   * product argument. That precedence is behaviour, and it is the single most likely thing to be
   * "tidied" into a conjunction.
   *
   * SUPPLYING NEITHER ARGUMENT IS A RUNTIME FAILURE, AND THAT FAILURE IS PRESERVED. Both parameters
   * are optional because `model/dao/SkuDAO.cfc:L54-L55` declares both arguments without a required
   * attribute and without a type — so the signature below is faithful, and AAP 0.4.2.6 specifies
   * exactly this shape. But the ELSE branch reads the product argument unconditionally at
   * `model/dao/SkuDAO.cfc:L90`, so calling with neither argument raises rather than returning
   * false. Implementations MUST reproduce the failure rather than quietly resolving `false`: a
   * missing guard is a caller defect, and converting it into a negative answer would let a
   * transacted SKU be deleted. "Both optional" is therefore nominally true and functionally means
   * "at least one".
   *
   * NO EXCLUSIVE-OR PARAMETER TYPE IS USED, AND THE REASON IS A CALLER. A discriminated union would
   * express the mutual exclusivity in the type system and is deliberately rejected: it changes the
   * callable shape, and the zero-argument form the service uses could no longer be forwarded at
   * all. See the forwarding hazard below.
   *
   * TODO(parity): Discrepancy 4 — the service member above this one takes NO ARGUMENTS.
   * `model/service/SkuService.cfc:L285` declares an empty parameter list and forwards its whole
   * argument scope onward at `L286`. Both contracts are preserved as found: the narrower service
   * signature belongs to `src/services/SkuService.ts`, and the wider two-argument surface belongs
   * here per AAP 0.4.2.6. They are not reconciled.
   *
   * TODO(parity): THE FORWARDING MECHANISM HAS NO TYPESCRIPT EQUIVALENT, AND THIS IS A TRANSLATION
   * HAZARD RATHER THAN A LEGACY DEFECT. CFML forwards UNDECLARED named arguments through an
   * argument-collection call, so both real call sites work despite the empty service signature:
   * `model/entity/Product.cfc:L626` passes a product identifier by name and
   * `model/entity/Sku.cfc:L594` passes a SKU identifier by name, and both land in the argument
   * scope of a function declaring neither. TypeScript offers no such facility, so the two
   * capabilities must be reachable through explicitly declared parameters — which is why this
   * member keeps both, even though its service caller declares none. Nothing about the legacy
   * runtime is broken here and the service signature must NOT be "fixed"; what is missing is the
   * declaration, and this contract supplies it (IR-1, TR-3).
   *
   * ADAPTER OBLIGATION — RESOLVE EVERY ASSOCIATION PATH EXPLICITLY. The existence tests reference
   * unqualified association paths that are never bound to the subquery's own alias: a SKU path at
   * `model/dao/SkuDAO.cfc:L66`, a stock-to-SKU path at `L68` and at most of the others, and
   * distinct source-stock and destination-stock paths at `L76` and `L78`. The mapping layer
   * resolves such paths against the single entity of the enclosing subquery, which is why the
   * legacy text works; a native statement performs no equivalent resolution. A path-for-path
   * transcription therefore either fails to parse or resolves against the wrong table — the same
   * silent-failure family as T3. Every path must be made explicit against the physical foreign-key
   * column.
   *
   * ADAPTER OBLIGATION — THE INNER PROJECTIONS ARE NOISE AND NEED NO REPRODUCTION. Each existence
   * test projects an aliased column, which is meaningless inside an existence test. Implementations
   * are free to project a constant instead; nothing observes the projected column.
   *
   * TR-1 TIGHTENING, RECORDED. The legacy member counts matching rows and then compares the first
   * cell of the result against zero at `model/dao/SkuDAO.cfc:L93-L97`, returning the count coerced
   * to a boolean. The target returns the boolean directly. The indexed read that comparison
   * performs is exactly the kind `noUncheckedIndexedAccess` types as possibly-undefined, so
   * handling it is the adapter's obligation and is discharged there rather than leaking into this
   * signature. Both arguments are also narrowed from untyped to `string`, matching the 32-character
   * identifiers of IR-6 and the types the two real call sites already pass.
   *
   * @param productID - A product's identifier. When supplied WITHOUT a SKU identifier, the question
   *   becomes "has any SKU of this product been transacted against". Ignored entirely when a SKU
   *   identifier is also supplied — see the precedence rule above.
   * @param skuID - A single SKU's identifier. TAKES PRECEDENCE over `productID` whenever it is
   *   present and non-null.
   * @returns True when at least one of the ten existence tests matches; false when none does.
   *   Raises when neither argument is supplied, reproducing `model/dao/SkuDAO.cfc:L90`.
   */
  transactionExists(productID?: string, skuID?: string): Promise<boolean>;

  /**
   * Reads one SKU by its own SKU code OR by any of its alternate SKU codes.
   *
   * THE FALLBACK IS ONE STATEMENT, NOT TWO LOOKUPS. `model/dao/SkuDAO.cfc:L103` reaches the
   * alternate codes through a LEFT JOIN and combines the two comparisons with OR, so a SKU with no
   * alternate codes still matches on its own code, and a SKU reached only by an alternate code
   * matches too. Implementations MUST NOT model this as two members, as a two-step lookup, or as a
   * primary-then-fallback retry: a single statement with an outer join and a disjunction is the
   * behaviour, and a two-step version would differ the moment both sides could match different
   * rows.
   *
   * ADAPTER OBLIGATION — TWO PLACEHOLDERS, ONE VALUE. The legacy statement references the same
   * named parameter TWICE at `model/dao/SkuDAO.cfc:L103` while binding it ONCE. Positional
   * placeholders cannot be reused, so the translated statement carries TWO placeholders bound to
   * the SAME value, in statement order (TR-4). Emitting one placeholder per bound value — the
   * obvious reflex — is a parameter-count error at the database rather than a compile error here.
   *
   * A MULTI-MATCH RAISES, AND MUST CONTINUE TO. The third argument of the legacy call at
   * `model/dao/SkuDAO.cfc:L103` requests a UNIQUE result, so the read raises when more than one row
   * matches. That is why this member returns a single value rather than an array, and why the
   * absent case is `null` rather than an empty array. Implementations MUST NOT collapse a
   * multi-match to `null`, MUST NOT silently take the first row, and MUST NOT return a collection:
   * each would turn a loud data-integrity failure into a quiet wrong answer.
   *
   * TODO(parity): THE STATEMENT HAS NO DISTINCT PROJECTION, IN DELIBERATE CONTRAST WITH THE OPTION
   * RESOLVER, AND THE ASYMMETRY IS PRESERVED AS FOUND. `model/dao/SkuDAO.cfc:L103` projects without
   * distinctness while `model/dao/SkuDAO.cfc:L109` explicitly requires it (T4). Because the outer
   * join fans out one row per alternate code, a SKU carrying several alternate codes can therefore
   * produce several rows — which, combined with the unique-result request above, makes this member
   * sensitive to exactly that data shape. Implementations MUST NOT add a distinct projection to
   * "fix" it: that would change which inputs raise, and AAP 0.7.3 S7 requires legacy behaviour to
   * be preserved and annotated rather than repaired. Recorded as observed, with no new register
   * number.
   *
   * TODO(parity): the SKU code is REQUIRED here and OPTIONAL one layer up. The legacy declaration
   * at `model/dao/SkuDAO.cfc:L102` marks it required, while `model/service/SkuService.cfc:L289`
   * declares it optional and forwards its argument scope onward. The required form is the one AAP
   * 0.4.2.6 specifies for this port and the one declared below; the optional form belongs to the
   * service. An out-of-scope caller depends on the service member —
   * `model/service/PhysicalService.cfc:L199` — which is one of the two callers AAP Goal B names as
   * not to be broken, so neither signature is changed to match the other.
   *
   * ADAPTER OBLIGATION — THE STATEMENT USES MAPPING-LAYER ENTITY NAMES. This read is expressed
   * against the mapping layer, not against physical tables; see the D22 note in the file header for
   * why that distinction must be respected in both directions.
   *
   * @param skuCode - The SKU code to resolve. Matched against the SKU's own code and against every
   *   alternate code, in one statement. Required, exactly as at `model/dao/SkuDAO.cfc:L102`.
   * @returns The single matching SKU, or `null` when nothing matches. Raises when more than one row
   *   matches, reproducing the unique-result request at `model/dao/SkuDAO.cfc:L103`.
   */
  findBySkuCode(skuCode: string): Promise<Sku | null>;

  /**
   * Resolves the SKUs of one product that carry EVERY option in a given list.
   *
   * `model/dao/SkuDAO.cfc:L107-L128` assembles its statement in a loop, appending one correlated
   * existence test per option and growing the bound-parameter array in lockstep. The source states
   * its own intent at `model/dao/SkuDAO.cfc:L106` — "returns product skus which matches ALL options
   * (list of optionIDs) that are passed in" — which is the strongest available evidence against the
   * rewrite T1 warns about, and is quoted rather than paraphrased for that reason.
   *
   * Four call sites exist (AAP §0.6.1.1): the uniqueness validation rule at
   * `model/entity/Sku.cfc:L763`, the single-result wrapper at `model/entity/Product.cfc:L349-L364`,
   * the plural wrapper at `model/entity/Product.cfc:L366-L368`, and one OUT-OF-SCOPE caller in the
   * order domain at `model/process/Order_AddOrderItem.cfc:L238`. All four funnel through the
   * one-line delegation at `model/service/ProductService.cfc:L104-L106`.
   *
   * THE POSITIONAL ARGUMENT ORDER IS LOAD-BEARING, WHICH IS WHY THE PRODUCT COMES SECOND. Both the
   * out-of-scope caller and `model/entity/Product.cfc:L367` pass their arguments POSITIONALLY as
   * options-then-product, and AAP Goal B names the order-domain caller as one the port must not
   * break. It is also why the adapter's bound array is every option identifier in list order
   * FOLLOWED BY the product identifier: the legacy appends the option parameters inside the loop at
   * `model/dao/SkuDAO.cfc:L120` and the product parameter afterwards at
   * `model/dao/SkuDAO.cfc:L125`, and TR-4 requires that sequence exactly.
   *
   * T1 — CONJUNCTION, NOT INTERSECTION. AN ARRAY, NEVER A DEDUPLICATING COLLECTION.
   * `model/dao/SkuDAO.cfc:L113-L121` appends ONE correlated existence test per list element and
   * combines them with AND, so a SKU qualifies only by carrying EVERY listed option. Two rewrites
   * look like simplifications and are both wrong: a set-membership predicate over the whole list
   * turns the conjunction into a DISJUNCTION, and a grouped counting predicate diverges as soon as
   * the list contains a DUPLICATE, because the legacy deduplicates nowhere. Implementations MUST
   * emit one existence test per element, duplicates included — which is why the parameter is a plain
   * array: a deduplicating type would discard duplicates before any adapter could see them.
   *
   * T2 — THE PRODUCT IDENTIFIER IS REQUIRED, AND THAT IS A DECLARED DECISION.
   * `model/dao/SkuDAO.cfc:L107` marks it OPTIONAL and `model/dao/SkuDAO.cfc:L123` guards the product
   * predicate on presence, but on the real path that guard is never false:
   * `model/service/ProductService.cfc:L104` declares the argument REQUIRED and forwards its whole
   * argument scope, and it is this member's ONLY caller. The target therefore types it required, as
   * AAP §0.6.1.4 specifies. Typing it optional "to be faithful to the declaration" would hand every
   * implementation an unreachable branch and would let a caller omit the product scope and receive
   * SKUs from other products.
   *
   * ADAPTER OBLIGATION — THE PRODUCT PREDICATE IS GUARDED ON PRESENCE ONLY, NOT ON EMPTINESS.
   * `model/dao/SkuDAO.cfc:L123` tests solely that the argument exists, applying no length or
   * whitespace test, so an EMPTY-STRING product identifier still appends the predicate and binds the
   * empty value, matching nothing. Contrast `model/dao/SkuDAO.cfc:L134`, where the sibling search
   * member additionally requires a non-blank value. That divergence in guard strictness is
   * preserved, so this member's product argument and
   * {@link SkuRepository.searchByProductType}'s product-type argument cannot be reasoned about
   * interchangeably.
   *
   * T3 — THE VESTIGIAL JOIN IS LOAD-BEARING. THE RESULT IS OPTION-BEARING SKUS ONLY.
   * `model/dao/SkuDAO.cfc:L110` joins the SKU to its options with an alias THAT IS NEVER REFERENCED
   * again. It looks removable; it is not. Because the join is inner it silently EXCLUDES every SKU
   * carrying no options, from every result, including when the option list is empty. Implementations
   * MUST retain an equivalent existence guard against the SKU-option link table; dropping it would
   * widen every result set with nothing in the type system noticing.
   *
   * T4 — THE DISTINCT PROJECTION IS MANDATORY. `model/dao/SkuDAO.cfc:L109` projects DISTINCTLY and
   * the join at `L110` fans out one row per SKU-option pair, so without distinctness a SKU carrying
   * N options is returned N TIMES and every arity assertion above this member breaks — the
   * single-result wrapper at `model/entity/Product.cfc:L349-L364` raises on more than one, and the
   * uniqueness rule at `model/entity/Sku.cfc:L756-L769` compares a count against one. Each
   * qualifying SKU is returned EXACTLY ONCE.
   *
   * T5 — AN EMPTY OPTION LIST IS LEGAL, MEANINGFUL AND RELIED UPON BY TWO CALLERS. The plural
   * wrapper at `model/entity/Product.cfc:L366-L368` defaults its option list to the empty string,
   * whose delimited-list length is ZERO, so the loop at `model/dao/SkuDAO.cfc:L113` appends NO
   * existence tests and the statement degenerates to "all option-bearing SKUs of this product". That
   * form is depended upon by both `model/entity/Product.cfc:L349-L364` and
   * `model/entity/Sku.cfc:L756-L769`. The parameter is therefore a plain array and NOT a non-empty
   * one, empty input is NOT invalid, and NO guard clause exists at this boundary.
   *
   * NAVIGATION SIDE — AN EXPLICIT, EQUIVALENT SIMPLIFICATION. The legacy existence test at
   * `model/dao/SkuDAO.cfc:L116-L118` navigates the many-to-many relationship starting at the OPTION
   * end, in two hops. AAP §0.3.3.1 fixes the target shape as reading the SKU-option LINK TABLE
   * directly, correlating on the SKU identifier and comparing the option identifier. The two are
   * equivalent, and the simplification is recorded because a reader diffing the statements will
   * otherwise find a TABLE in no legacy text and an ENTITY in no generated text: that is the correct
   * translation of an association the mapping layer hid (TR-2).
   *
   * IDENTIFIER ALIASES — THE STATEMENT TEXT DOES NOT REVEAL THE MAPPING. This member's statement uses
   * the mapping layer's implicit identifier alias at `model/dao/SkuDAO.cfc:L117` and
   * `model/dao/SkuDAO.cfc:L124`, while other members of the SAME component spell the property names
   * out (`model/dao/SkuDAO.cfc:L60`, `L62`, `L163`). The adapter must resolve the implicit alias to
   * the concrete SKU and product identifier columns; nothing in the legacy text says which they are.
   *
   * ===============================================================================================
   * THIS MEMBER SITS INSIDE A VALIDATION READ-BACK CYCLE (mismatch M6, defect D19)
   * ===============================================================================================
   * TODO(parity): AAP 0.6.2 identifies this as the highest-risk item in the slice, and the risk
   * passes through this member. The uniqueness rule at `model/entity/Sku.cfc:L756-L769` is not an
   * ordinary helper: it is a DECLARATIVE VALIDATION RULE registered in `model/validation/Sku.json`
   * that EXECUTES A DATABASE READ, at `model/entity/Sku.cfc:L763`, reaching this member through the
   * two wrappers and the service delegation. It runs WHILE the SKU-creation batch is writing the
   * very rows it reads, so the result depends on whether an in-flight sibling insert is visible to
   * the next uniqueness read. Under the legacy mapping layer that visibility came from session
   * flush ordering; the target has no session and no automatic flush, so a naive port that inserts
   * everything and then validates — or validates before inserting — produces DIFFERENT RESULTS with
   * no error anywhere.
   *
   * ⚠️ F01 — WHERE THAT GUARANTEE LIVES, CORRECTED. This note previously said the guarantee "is NOT
   * this contract's to express", assigning it wholly to `src/adapters/mysql/UnitOfWork.ts`. The
   * consequence was that NOTHING expressed it: this contract declared seven read and cache members
   * and no way to write a SKU at all, so no implementation could make an insert visible to the next
   * read, and the cycle above could not be reproduced in either direction. Documenting a required
   * ordering while omitting the operation that ordering governs left the highest-risk item in the
   * slice unimplementable.
   *
   * THE PART OF THE OLD REASONING THAT WAS RIGHT, AND IS KEPT. This member still declares NO
   * transaction, session, flush or visibility parameter, and none may be added: a QUERY contract
   * that accepted one would be expressing a demarcation concern, and every test double would then
   * have to model transaction semantics to satisfy it. The capability is therefore declared as a
   * SEPARATE member — {@link SkuRepository.persistSku} — which carries the visibility guarantee
   * explicitly while leaving all seven read members exactly as demarcation-free as they were.
   * Transaction DEMARCATION remains the adapter's and composition root's concern; what belongs here
   * is the guarantee a caller may rely on, and that is now stated.
   *
   * TODO(parity): defect D19 follows directly from T5 and is carried, not repaired. For a SKU with
   * ZERO options the assembled list is empty, so by T5 this member returns ALL option-bearing SKUs of
   * the product, and the legacy guard at `model/entity/Sku.cfc:L764` can then only pass when the
   * product has none. An option-less default SKU on a product that already has option-bearing SKUs
   * therefore FAILS its uniqueness rule. That is observed behaviour flowing from a correct
   * translation, and any repair would belong to the entity in any case (AAP §0.7.3 S7). The sibling
   * rule at `model/entity/Sku.cfc:L772-L784` does NOT behave alike: it is pure and in-memory, walks
   * the SKU's own options and touches no repository.
   *
   * ADAPTER OBLIGATION — THE STATEMENT USES MAPPING-LAYER ENTITY NAMES throughout
   * `model/dao/SkuDAO.cfc:L109-L124`, unlike the physical names of
   * {@link SkuRepository.findSortedSkuIdsByProduct}; see the D22 note in the file header.
   *
   * TR-1 TIGHTENING, RECORDED. The legacy option list is a COMMA-DELIMITED STRING
   * (`model/dao/SkuDAO.cfc:L107`) read element by element inside the loop at
   * `model/dao/SkuDAO.cfc:L114`; the target takes an array, which is an idiom change under AAP
   * §0.8.1 that preserves both duplicates and order. The return type is widened from untyped to a
   * typed array of hydrated SKUs, matching what `model/dao/SkuDAO.cfc:L127` resolves to.
   *
   * @param optionIds - The option identifiers a SKU must ALL carry. Order is preserved and passed
   *   through to the bound parameters; DUPLICATES ARE PRESERVED AND MUST NOT BE COLLAPSED (T1); the
   *   EMPTY ARRAY IS LEGAL and degenerates to every option-bearing SKU of the product (T5).
   * @param productId - The product whose SKUs are considered. REQUIRED — see T2 for why this
   *   tightens an optionally-declared legacy argument, and note that an empty string is passed
   *   through and matches nothing rather than being rejected.
   * @returns Each qualifying SKU exactly once (T4), restricted to option-bearing SKUs (T3).
   *   Possibly empty; never null or undefined.
   */
  findSkusBySelectedOptions(optionIds: string[], productId: string): Promise<SkuRow[]>;

  /**
   * Searches SKUs by a partial SKU code, optionally narrowed to a set of product types.
   *
   * THE BUSINESS RULE. A row qualifies when its SKU code contains the search term. When a
   * product-type argument is also supplied and non-blank, qualification additionally requires the
   * SKU's product to belong to one of the named product types, expressed as a nested membership
   * test at `model/dao/SkuDAO.cfc:L135`.
   *
   * THE SINGULAR ARGUMENT NAME IS A MISNOMER — THE VALUE IS A DELIMITED LIST. This sharpens
   * Discrepancy 6 rather than restating it. `model/dao/SkuDAO.cfc:L130` names the argument in the
   * SINGULAR, but `model/dao/SkuDAO.cfc:L136` binds it as a LIST, and the parameter it feeds is
   * named in the PLURAL. So one identifier or several may be supplied, comma-delimited, under a
   * singular name. The legacy name is preserved verbatim (TR-1) and the plural meaning is recorded
   * here instead. Implementations MUST NOT rename it, MUST NOT retype it as an array, and MUST NOT
   * harmonise it with the equivalent member of the product port — whose argument is named in the
   * plural for the identical delimited-list value. AAP 0.4.2.6 records the naming asymmetry between
   * the two; the fuller truth from reading both sources is that only the NAMES differ, and both
   * carry delimited lists.
   *
   * ADAPTER OBLIGATION — ONE PLACEHOLDER PER LIST ELEMENT, BOUND INDIVIDUALLY. A positional
   * placeholder binds a single value and cannot stand in for a comma-separated list, so the adapter
   * must generate as many placeholders as the list has elements and bind each element separately
   * (AAP 0.4.3.4). Interpolating the list into the statement text would reintroduce exactly the
   * category of flaw that defect D18 records elsewhere in this folder.
   *
   * BOTH ARGUMENTS ARE OPTIONAL — Discrepancy 3, CONFIRMED AT THE DECLARATION.
   * `model/dao/SkuDAO.cfc:L130` marks NEITHER argument as required, and AAP 0.4.2.6 maps both as
   * optional. The signature below is faithful to that.
   *
   * TODO(parity): THE TWO ARGUMENTS ARE GUARDED WITH DIFFERENT STRICTNESS, AND THE ASYMMETRY IS
   * CARRIED. The product-type argument is DOUBLE-guarded at `model/dao/SkuDAO.cfc:L134` — it must
   * be present AND non-blank after trimming — whereas the search term at
   * `model/dao/SkuDAO.cfc:L133` is read with NO GUARD AT ALL, so omitting it raises in the legacy
   * despite being declared optional. The identical shape exists in the sibling product component at
   * `model/dao/ProductDAO.cfc:L422`, which is what establishes it as the house pattern rather than
   * a one-off slip. The term is NOT promoted to required to "fix" it, because AAP 0.4.2.6 maps it
   * optional and because changing it would change which calls raise. Recorded as observed, with no
   * new register number.
   *
   * ADAPTER OBLIGATION — THE WILDCARDS ARE APPLIED INSIDE THE IMPLEMENTATION, NOT BY THE CALLER.
   * `model/dao/SkuDAO.cfc:L133` wraps the term in leading AND trailing wildcards itself, so callers
   * pass a BARE term. Implementations MUST add the wildcards and MUST NOT expect them; a caller
   * that pre-wraps and an implementation that also wraps would search for the wildcard characters
   * themselves. No wildcard, prefix-match or exact-match option is offered, because the legacy
   * offers none (AAP 0.7.3, S9).
   *
   * ADAPTER OBLIGATION — THE STATEMENT IS NATIVE BUT NAMES MAPPING-LAYER ENTITIES. This is the
   * member where defect D22 bites hardest: `model/dao/SkuDAO.cfc:L132` and
   * `model/dao/SkuDAO.cfc:L135` compose a NATIVE statement yet spell MAPPING-LAYER entity names
   * into it, while `model/dao/SkuDAO.cfc:L179-L211` uses PHYSICAL names in an equally native
   * statement. The implementation must use the physical tables; see the file header for why neither
   * convention may be assumed to work in the other's place.
   *
   * ROW ORDER IS UNSPECIFIED, AND NO ORDERING PARAMETER IS OFFERED. The legacy statement declares
   * no ordering at all, so the sequence is whatever the database returns. That is preserved as
   * found: adding an ordering would be inventing behaviour (AAP 0.7.3, S9), and offering an
   * ordering argument would invent a knob the source does not have.
   *
   * TR-1 TIGHTENING, RECORDED. `model/dao/SkuDAO.cfc:L130` declares an untyped return while
   * `model/service/SkuService.cfc:L271` also leaves it untyped, yet the body demonstrably assembles
   * an array of two-field rows at `model/dao/SkuDAO.cfc:L140-L147`. The target narrows that to a
   * typed array of {@link SkuSearchRow}.
   *
   * @param term - Partial SKU code to match. Wrapped in wildcards by the implementation. Declared
   *   optional per `model/dao/SkuDAO.cfc:L130`, but read unguarded there — see the parity note
   *   above.
   * @param productTypeID - Comma-delimited product-type identifiers, DESPITE THE SINGULAR NAME.
   *   When omitted or blank, no product-type narrowing is applied at all.
   * @returns The matching rows, in unspecified order. Possibly empty; never null or undefined.
   */
  searchByProductType(term?: string, productTypeID?: string): Promise<SkuSearchRow[]>;

  /**
   * Reads the SKUs of one product, with an eager-loading flag that ALSO FILTERS.
   *
   * ===============================================================================================
   * THE FLAG IS NOT A LOADING HINT. IT CHANGES WHICH ROWS COME BACK.
   * ===============================================================================================
   * This is T3's failure mode in a second location, and it is the single most important thing to
   * know about this member. When the flag is true, `model/dao/SkuDAO.cfc:L153-L162` adds a join
   * chosen by the product's base type — access contents for a content-access product at `L155`,
   * options for a merchandise product at `L157`, and a subscription term plus subscription benefits
   * for a subscription product at `L159-L160`. EVERY ONE OF THOSE JOINS IS AN INNER JOIN, not an
   * outer one. So raising the flag silently EXCLUDES a merchandise SKU that carries no options, a
   * content-access SKU with no access contents, and a subscription SKU with no subscription
   * benefits.
   *
   * A flag whose name promises "also load the related records" therefore narrows the result set.
   * Implementations MUST NOT "improve" the joins to outer joins, and callers MUST NOT be told the
   * flag affects loading strategy only: either would widen every result set for merchandise
   * products with an option-less default SKU, which is an ordinary data shape rather than a rarity.
   *
   * THE SUBSCRIPTION BRANCH IS ASYMMETRIC, AND THAT IS ALSO PRESERVED. Of the three branches only
   * the subscription one adds TWO joins, and only ONE of the two is a fetching join — the term is
   * joined at `L159` without fetching while the benefits are fetched at `L160`. Its filtering
   * effect therefore comes from both joins while its loading effect comes from one. The
   * subscription and content-access families are excluded from this slice by AAP 0.2.2.1, so no
   * type from either is named in this signature; the branches are documented because they change
   * the returned SET, which is observable through this contract even when their payloads are not.
   *
   * THE ARGUMENT IS THE ENTITY, NOT AN IDENTIFIER, AND IT MUST STAY THAT WAY. The branch selection
   * at `model/dao/SkuDAO.cfc:L154`, `L156` and `L158` asks the PRODUCT for its base type, and
   * `model/dao/SkuDAO.cfc:L165` then asks the same object for its identifier. Narrowing the
   * parameter to a bare identifier would force the implementation to re-read the product to
   * discover its base type, adding a query the legacy does not perform. This is the ONLY reason the
   * product entity type is imported by this module at all.
   *
   * THE FLAG IS REQUIRED HERE AND DEFAULTED ONE LAYER UP — Discrepancy 5, with a nuance.
   * `model/dao/SkuDAO.cfc:L150` declares BOTH arguments required, and it declares the flag with NO
   * boolean type — it is untyped, like the product beside it. The service member that calls it
   * defaults the flag to false at `model/service/SkuService.cfc:L220` and forwards it explicitly at
   * `L221`. AAP 0.4.2.6 keeps the argument required at this layer, so no default is declared below:
   * the default belongs to the service, and adding a second one here would let the two drift.
   *
   * TODO(parity): defect D9, both halves, carried and not repaired. At `model/dao/SkuDAO.cfc:L153`
   * the flag is read WITHOUT ITS ARGUMENT SCOPE, so the test resolves against whatever the name
   * finds first; and at `model/dao/SkuDAO.cfc:L163` the statement variable is RE-DECLARED
   * mid-function with a compound append, declaring and appending to the same local in one step.
   * Both are scoping faults that TypeScript's block scoping and single-declaration rules remove by
   * construction, so the port cannot reproduce them even in principle — which is precisely why they
   * are recorded rather than passed over: the behavioural difference is that the target's flag test
   * is unambiguous. Two nearby reads at `model/dao/SkuDAO.cfc:L88` and `L90` declare a local INSIDE
   * a conditional branch, which is the same scoping category; they are noted here under D9 rather
   * than given an identifier of their own, because this file mints no identifier beyond D22 — see the
   * register note in this module's header (F27), which states the registers' true position.
   *
   * TODO(parity): defect D13 is the DOWNSTREAM CONSEQUENCE of this member's companion, and it is
   * recorded here because the cause lives in this contract rather than in the service that fails.
   * `model/service/SkuService.cfc:L223-L244` pairs this read with
   * {@link SkuRepository.findSortedSkuIdsByProduct} and positions each SKU by looking its
   * identifier up in the sorted identifier list; because that member returns OPTION-BEARING SKUS
   * ONLY, the lookup can return "not found" and the resulting assignment raises. The service guards
   * weakly by checking that the FIRST SKU has options at `model/service/SkuService.cfc:L223`, which
   * does not protect the later ones. Its neighbour at `model/service/SkuService.cfc:L246-L269` is
   * MORE exposed still: it checks only that more than one SKU exists and bypasses the
   * option-bearing guard entirely. Neither is repaired here, and neither may be worked around by
   * widening this member's contract.
   *
   * ADAPTER OBLIGATION — A FOURTH ARGUMENT EXISTS AND IS A NO-OP TO REPRODUCE. The query call at
   * `model/dao/SkuDAO.cfc:L165` passes FOUR arguments: the statement, the bound values, a false
   * flag meaning "not a unique result", and an OPTIONS STRUCT requesting case-insensitive handling
   * that no other member of this component uses. The target database's default collations are
   * already case-insensitive, so reproducing that request is expected to be a no-op — but it is
   * surfaced rather than silently dropped, because "expected to be" is a judgement call (AAP 0.8.2,
   * Guideline 6). NO case-sensitivity or collation parameter is added to this signature: that would
   * invent a knob (AAP 0.7.3, S9). If the assumption ever proves false, the divergence belongs in
   * the adapter where the statement is issued.
   *
   * ADAPTER OBLIGATION — THE STATEMENT USES MAPPING-LAYER ENTITY NAMES throughout
   * `model/dao/SkuDAO.cfc:L152-L163`; see the D22 note in the file header.
   *
   * @param product - The product whose SKUs are read. The ENTITY, not an identifier: its base type
   *   selects the join and its identifier supplies the filter.
   * @param fetchOptions - When true, adds the base-type-specific inner join described above, which
   *   both eager-loads the related records AND EXCLUDES SKUs lacking them. REQUIRED, exactly as at
   *   `model/dao/SkuDAO.cfc:L150`; the default lives in the service.
   * @returns The product's SKUs — all of them when the flag is false, and only those carrying the
   *   base-type-specific related records when it is true. Possibly empty; never null or undefined.
   */
  findByProduct(product: Product, fetchOptions: boolean): Promise<Sku[]>;

  /**
   * Reads the identifiers of one product's SKUs in option-combination order.
   *
   * ===============================================================================================
   * THE ORDER IS A BASE-TEN ODOMETER, NOT A COLUMN SORT. "SIMPLIFYING" IT CHANGES THE ORDER.
   * ===============================================================================================
   * The ordering expression at `model/dao/SkuDAO.cfc:L193-L198` sums, per SKU across its options,
   * the option's own sort order multiplied by ten raised to the power of (the memoized next
   * option-group sort order MINUS that option's group's sort order). Because the SKU rows are
   * grouped at `model/dao/SkuDAO.cfc:L191-L192`, that sum composes a SINGLE BASE-TEN NUMBER per SKU
   * in which option groups with a LOWER sort order occupy the MORE SIGNIFICANT digits. That
   * composite number is the business rule.
   *
   * Ordering instead by the group's sort order and then the option's — the obvious simplification —
   * produces a DIFFERENT sequence, because that orders ROWS whereas this orders SKUs by a composite
   * key aggregated ACROSS their options. The direction of the subtraction is equally load-bearing:
   * reversing it inverts which group dominates. Implementations MUST reproduce the expression as
   * described, including the subtraction direction.
   *
   * This ordering is the read side of the odometer-style combination enumeration that
   * `model/service/SkuService.cfc` performs when it creates SKUs (AAP 0.6.7.8), and the pairing
   * matters beyond aesthetics: through the read-back cycle documented on
   * {@link SkuRepository.findSkusBySelectedOptions}, enumeration order determines the order in
   * which uniqueness validation observes a SKU's siblings.
   *
   * ===============================================================================================
   * OPTION-BEARING SKUS ONLY — PROVEN AT THE STATEMENT, AND THE ROOT CAUSE OF DEFECT D13
   * ===============================================================================================
   * `model/dao/SkuDAO.cfc:L183-L188` chains THREE inner joins, from the SKU table through the
   * SKU-option link table to the option table and on to the option-group table. A SKU that carries
   * no options CANNOT APPEAR in the result — not because of a filter, but because the join chain
   * eliminates it. This contract therefore returns identifiers for option-bearing SKUs only, and it
   * MUST NOT be widened to include option-less ones: the ordering expression has no meaning for a
   * SKU with no options, since the sum it aggregates would have nothing to aggregate over.
   *
   * TODO(parity): that narrower-than-expected result set is the direct cause of defect D13 in the
   * service above. `model/service/SkuService.cfc:L223-L244` and its neighbour at
   * `model/service/SkuService.cfc:L246-L269` both build a position lookup from this member's output
   * and then index an array by the position they find; for a SKU absent from this result the
   * position is "not found" and the assignment raises. The defect lives in the service and is
   * carried there, but its cause is this contract, which is why it is documented on both sides.
   * Implementations MUST NOT compensate by padding the result with option-less SKUs — that would
   * change output to mask a defect AAP 0.7.3 S7 requires to be preserved.
   *
   * TODO(parity): defect D8 is a LITERAL SOURCE TODO and is carried verbatim in intent. The comment
   * immediately above the statement, at `model/dao/SkuDAO.cfc:L177`, records that the query was
   * never tested against databases other than the two the legacy targeted. The target port
   * addresses ONE of those two, which is CONSISTENT WITH the untested state rather than a
   * RESOLUTION of it (AAP 0.6.7.1). Implementations MUST NOT present single-database support as
   * closing the TODO, and MUST NOT add support for further dialects to close it either — the latter
   * would be inventing behaviour. The legacy branch at `model/dao/SkuDAO.cfc:L194-L198` selects
   * between two dialect spellings of the same arithmetic by composing statement TEXT, so it
   * collapses to a single path in the target; that collapse is a consequence of the single-dialect
   * target and is recorded here rather than treated as a simplification of the rule itself.
   *
   * ADAPTER OBLIGATION — THE MEMOIZED EXPONENT MUST BECOME A BOUND PARAMETER. The memoized
   * next-group sort order is composed into the ordering expression as a BARE NUMBER at
   * `model/dao/SkuDAO.cfc:L195` and `model/dao/SkuDAO.cfc:L197` — it is NOT bound, unlike the
   * product identifier at `model/dao/SkuDAO.cfc:L190`, which is. Because it occupies a VALUE
   * position inside an arithmetic expression rather than naming a table or column, it CAN and MUST
   * be bound as a parameter in the target (AAP 0.7.3, S2). It is the one place in this component
   * where a memoized number crosses into a statement, and it is the only reason the memo is
   * observable through this member at all. Where that value comes from, how it is memoized and how
   * long it lives are all the adapter's concern — see
   * {@link SkuRepository.clearOptionGroupSortOrderCache}.
   *
   * ADAPTER OBLIGATION — THIS STATEMENT USES PHYSICAL TABLE NAMES, unlike every other member of the
   * component: `model/dao/SkuDAO.cfc:L179-L211` names the tables physically and correctly. That
   * contrast IS defect D22; see the file header.
   *
   * TR-1 TIGHTENING, RECORDED — AND THIS IS THE LARGEST NARROWING IN THE FILE.
   * `model/dao/SkuDAO.cfc:L172` declares NEITHER a return type NOR an access level, so the member
   * is public and untyped, and `model/dao/SkuDAO.cfc:L201` returns the RECORD SET itself — a
   * column-oriented, row-indexed structure with no compile-time shape. The target narrows that to
   * an array of identifier strings. The narrowing is justified by what the only two consumers
   * actually read: a row count and one identifier column, at
   * `model/service/SkuService.cfc:L228-L229` and `model/service/SkuService.cfc:L256-L257`. Nothing
   * else about the record set is ever touched, so nothing else is promised. Transformation rule
   * TR-1 sanctions exactly this — a loose legacy signature tightened to the observed contract, WITH
   * THE TIGHTENING RECORDED — and this note is that record. The row ORDER, which is the entire
   * point of the member, is preserved by the array's order.
   *
   * @param productID - The product whose SKU identifiers are read. Bound, per
   *   `model/dao/SkuDAO.cfc:L190`.
   * @returns The identifiers of the product's OPTION-BEARING SKUs, in the composite odometer order
   *   described above. Possibly empty — for a product whose SKUs carry no options it is ALWAYS
   *   empty. Never null or undefined.
   */
  findSortedSkuIdsByProduct(productID: string): Promise<string[]>;

  /**
   * Discards the memoized option-group sort order used by
   * {@link SkuRepository.findSortedSkuIdsByProduct}.
   *
   * TODO(parity) — THIS MEMBER IS INERT TWICE OVER, AND IS STILL DECLARED (defect D7). The guard at
   * `model/dao/SkuDAO.cfc:L222-L226` is INVERTED: the removal runs only when the memoized key is
   * ABSENT, so it deletes a key that does not exist and never touches the key that does. THE MEMO IS
   * THEREFORE NEVER CLEARED. The legacy member also has no callers, so it is inert for a second,
   * independent reason. Neither is repaired: AAP §0.7.3 S7 requires legacy behaviour to be preserved
   * and annotated, and AAP §0.8.2 Guideline 4 singles out "an inverted cache guard" as exactly the
   * kind of thing a competent engineer would instinctively fix and forbids the fix. Implementations
   * MUST NOT correct the condition and MUST NOT document this member as working.
   *
   * It is on the interface because AAP §0.4.2.6 maps the legacy member explicitly to this target
   * name and TR-5 is unambiguous: "The member is never quietly dropped from the interface." The one
   * dead member the plan DOES omit — the private, only-self-recursive method at
   * `model/service/ProductService.cfc:L82-L97`, defect D15 — is omitted solely because AAP §0.4.1.8
   * instructs it. Dead code is dropped on explicit instruction, never on a port author's own
   * reachability analysis.
   *
   * SYNCHRONOUS, AND THE ABSENCE OF A PROMISE IS THE POINT. `model/dao/SkuDAO.cfc:L222` declares a
   * void return and the body performs a single in-memory key removal: no statement, no connection,
   * no row. This is the ONLY synchronous member of the seven, and a promise-returning signature would
   * compile perfectly while obliging every caller — production and test double alike — to await
   * something that never yields, permanently encoding an I/O boundary that does not exist.
   *
   * TODO(parity) — THE MEMO'S SCOPE IS AN EXECUTION-MODEL MISMATCH (M7). The memoized value is
   * GLOBAL, not per-product: it comes from a whole-table maximum at
   * `model/dao/SkuDAO.cfc:L210-L212` that takes no parameters and applies no product scoping, held in
   * the component property at `model/dao/SkuDAO.cfc:L51` — the only such property among the four
   * data-access components, and why this one alone declares generated accessors at
   * `model/dao/SkuDAO.cfc:L49`. Combined with D7 that means one global number, computed once, never
   * invalidated, ordering every product's SKUs. Under M7 nothing persists between invocations of a
   * stateless handler EXCEPT module-scope state, so a module-scope memo would share that global
   * maximum across invocations and across callers on a warm container. AAP §0.4.2.6 and AAP §0.4.1.6
   * therefore require EXPLICIT REQUEST-SCOPED state: on a persistent application server the
   * never-cleared memo is merely stale, on a warm container it would be cross-caller bleed.
   * Implementations MUST hold it per request and MUST NOT hoist it to module scope.
   *
   * TODO(parity): one further observation belongs to the adapter and is recorded from here because
   * this is the only member that reaches it. The seeding at `model/dao/SkuDAO.cfc:L206` assigns a
   * starting value and the guard at `model/dao/SkuDAO.cfc:L213-L215` then tests whether the aggregate
   * returned any row — which for a bare maximum is ALWAYS TRUE, since an aggregate always returns
   * exactly one row, so the seed is always overwritten. On an EMPTY option-group table the maximum is
   * null, which the legacy language surfaces as an empty string, so incrementing it yields the same
   * value as the seed: the two paths coincide by coincidence rather than by design. Implementations
   * MUST reproduce the resulting value in both cases and MUST NOT rely on the guard to mean what it
   * appears to mean.
   *
   * NO LIFETIME, SIZE OR EVICTION PARAMETER IS OFFERED, and none may be added: the legacy exposes a
   * single argument-free removal, so any lifetime, maximum size, refresh mode or eviction policy
   * would be an invented knob (AAP §0.7.3 S9). What "request-scoped" means concretely is the
   * composition root's and the adapter's decision, not a parameter of this contract.
   *
   * @returns Nothing. Synchronous by design, per `model/dao/SkuDAO.cfc:L222`. Note that in the legacy
   *   this call has NO EFFECT AT ALL — see the inverted-guard note above — and implementations
   *   reproduce that rather than correcting it.
   */
  clearOptionGroupSortOrderCache(): void;

  /**
   * Persists ONE SKU, and makes it visible to every subsequent read issued through this repository.
   *
   * ===============================================================================================
   * THE MEMBER THAT CLOSES THE M6 READ-BACK CYCLE (AAP 0.6.2)
   * ===============================================================================================
   * ⭐ THIS IS THE HIGHEST-RISK CONTRACT IN THE SLICE, and its risk is entirely about ORDERING
   * rather than about storage. `model/service/SkuService.cfc:L58-L211` creates a BATCH of SKUs, and
   * `model/validation/Sku.json` registers `hasUniqueOptions` — a validation rule that executes a
   * database read through {@link SkuRepository.findSkusBySelectedOptions} — against each one. So the
   * batch reads the very rows it is writing, and the answer depends on which siblings are visible at
   * the moment each read runs. Under the legacy mapping layer that visibility came from ORM session
   * flush ordering, which the target does not have: there is no session and no automatic flush.
   *
   * ⛔ THE VISIBILITY GUARANTEE IS PART OF THIS CONTRACT, NOT AN IMPLEMENTATION DETAIL. Once the
   * returned promise resolves, the persisted SKU MUST be observable to every read subsequently
   * issued through this repository WITHIN THE SAME TRANSACTION — in particular to
   * {@link SkuRepository.findSkusBySelectedOptions}, which is the read the uniqueness rule performs.
   * An implementation that defers the write until the transaction commits does NOT satisfy this
   * contract, because the next uniqueness read would then observe none of its siblings, and every
   * SKU in a batch would validate as though it were the first.
   *
   * ⛔ AND THE WRITE MUST NOT BE COMMITTED HERE. Visibility within the transaction is required;
   * DURABILITY is not, and must not be assumed. `model/service/SkuService.cfc` performs no commit of
   * its own — the legacy commits once, implicitly, at request end and only when the ORM reports no
   * errors (mismatch M5) — so committing per SKU would make a partially-created, validation-failing
   * batch permanent, which the legacy never does. Demarcation stays with the caller.
   *
   * ⭐ WHERE IN THE SEQUENCE THE CALL BELONGS, DECIDED DELIBERATELY RATHER THAN GUESSED. AAP 0.6.2
   * requires each insert to be visible to "the NEXT SKU's uniqueness read", so a SKU is persisted
   * AFTER its own validation and BEFORE the next SKU is validated. The alternative — persisting
   * before its own validation, so a SKU can observe ITSELF — is not chosen, and the reason is
   * recorded because the code looks like it anticipates it: `model/entity/Sku.cfc:L763-L768` guards
   * with `arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()`, which tolerates the rule finding
   * exactly one SKU that IS the subject. Under the chosen ordering that self-exclusion clause is a
   * defensive no-op on insert, exactly as the same clause is in
   * `org/Hibachi/HibachiDAO.cfc:L130-L146`, where a not-yet-persisted subject can never match its
   * own identifier either. Both orderings satisfy "visible to the next"; this one is what the AAP
   * and the source's own self-exclusion idiom together indicate.
   *
   * TODO(parity): mismatch M5 is carried, not resolved. The legacy's implicit request-end commit has
   * no equivalent in a stateless invocation, so the transaction this member participates in is opened
   * and closed by the caller. That difference is flagged rather than smoothed over, per AAP 0.6.6.
   *
   * NO BATCH FORM IS OFFERED, and none may be added. A `persistSkus(skus)` member would invite an
   * implementation that writes the whole batch in one statement, which is precisely the naive port
   * AAP 0.6.2 warns produces different results with no error anywhere: the per-SKU boundary IS the
   * behaviour, because it is what interleaves the writes with the uniqueness reads between them.
   *
   * @param sku - The SKU to persist. Carries its own 32-character identifier, generated in
   *   application code per AAP IR-6, so no identifier is returned or assigned by this call.
   * @returns Nothing, once the SKU is visible to subsequent reads in the same transaction.
   */
  persistSku(sku: Sku): Promise<void>;
}
