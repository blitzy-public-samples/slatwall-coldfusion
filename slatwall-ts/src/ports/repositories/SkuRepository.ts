/**
 * `SkuRepository` — the repository port for the Catalog's SKU query surface, and the contract that
 * carries the option-to-SKU resolution algorithm across the migration boundary.
 *
 * =================================================================================================
 * WHY THIS PORT CARRIES MORE BEHAVIOUR THAN THE SERVICE ABOVE IT
 * =================================================================================================
 * Legacy origin: `model/dao/SkuDAO.cfc`, a 228-line component. AAP 0.1.1 explains why a
 * service-oriented reading of this codebase misleads — the Catalog's option-to-SKU resolution
 * "lives in a DAO as a hand-assembled HQL string", so a transliteration of the four named services
 * "would therefore produce four thin, nearly empty TypeScript classes and silently lose the
 * system's behavior." That string is `model/dao/SkuDAO.cfc:L107-L128`, and this file is its
 * contract. AAP 0.2.1.3 makes the same point for the folder as a whole: the refactoring prompt
 * names no data-access components at all, and all four are added as implicit scope because "this is
 * where the Catalog's business logic actually resides".
 *
 * The consuming service corroborates it. `model/service/SkuService.cfc` reaches this component
 * eight times — the heaviest dependency in the slice (AAP 0.6.3.2) — and four of its members are
 * one-line pass-throughs: `L272`, `L282`, `L286` and `L290`. Every behaviour worth preserving in
 * those four lives here, not above.
 *
 * AAP 0.4.1.6 mandates this file with one instruction: "Six public members plus the two private
 * helpers become a typed interface; the memoized sort-order cache becomes explicit request-scoped
 * state". AAP 0.4.2.6 then fixes each target name individually, and those names are the authority
 * followed below.
 *
 * =================================================================================================
 * SEVEN MEMBERS, NOT SIX — AND THE SOURCE SETTLES IT (Discrepancy 7)
 * =================================================================================================
 * AAP 0.2.1.3 characterises the component as "6 public, 2 private". Reading the declarations
 * yields SEVEN public and ONE private: only `model/dao/SkuDAO.cfc:L204` carries an
 * access-restricting attribute, while `model/dao/SkuDAO.cfc:L222` declares itself public
 * explicitly. AAP 0.4.2.6 is the authoritative per-member mapping and it enumerates seven target
 * methods, so seven are declared. The characterisation is NOT used to drop a member; per AAP 0.8.5
 * the source line is cited rather than the plan where the two differ.
 *
 * The count is easy to get wrong because THE COMPONENT MIXES BOTH CFML SYNTAXES, and the boundaries
 * were read rather than assumed: a licence banner at `model/dao/SkuDAO.cfc:L1-L48`, tag syntax at
 * `L49-L98`, a script block at `L100-L170`, tag syntax again at `L172-L226`, and the component
 * closing at `L228`. A scan matching only script-style declarations finds FOUR of the EIGHT members
 * — `L102`, `L107`, `L130` and `L150` — and misses the other four entirely, including the memoized
 * sort order and its clearing member. That is exactly why those two are the easiest in the slice to
 * overlook, and it is recorded here so a reader auditing this surface against the source knows that
 * half of it is invisible to a script-only search.
 *
 * =================================================================================================
 * THE FIVE SEMANTICS THAT MUST SURVIVE TRANSLATION, AND WHY FOUR OF THEM ARE TYPES
 * =================================================================================================
 * AAP 0.6.1.3 names five semantics of the option resolver and calls them "silent-drift traps: a
 * plausible, well-intentioned 'improvement' that changes results without producing an error." Each
 * is documented on {@link SkuRepository.findSkusBySelectedOptions} under its own identifier, T1
 * through T5, because that is the member whose signature decides them. Four are decided HERE rather
 * than in the adapter, which is the whole reason they belong in a port file:
 *
 *   T1 is an array parameter rather than a deduplicating collection type.
 *   T2 is a required parameter rather than an optional one.
 *   T5 is a plain array type rather than a non-empty one.
 *   T3 and T4 are documentation obligations on the returned set.
 *
 * An adapter cannot recover a semantic the interface has already discarded. If T1's parameter type
 * deduplicated, no adapter could reconstruct the duplicates; if T5's type forbade emptiness, no
 * adapter would ever see the degenerate case that two legacy callers depend on. AAP 0.8.2
 * Guideline 6 requires technology-specific translation decisions to be documented "especially
 * anywhere legacy behavior (e.g. option-to-SKU resolution edge cases) required an explicit judgment
 * call" — that parenthetical names this file's subject, so the judgement calls are recorded on the
 * members where they are made.
 *
 * =================================================================================================
 * TYPE-ONLY, THEREFORE WEIGHTLESS
 * =================================================================================================
 * Everything below is a type declaration. There is no executable statement, no statement text, no
 * driver reference, no I/O and no state of any kind. TypeScript erases the whole file at compile
 * time, so it contributes zero bytes to the artifact `build/esbuild.mjs` emits — while still being
 * what `src/adapters/mysql/**`, `src/services/**`, the composition root and the hand-written test
 * doubles are all checked against. Both imports are type-only for the same reason: they are erased,
 * so no runtime dependency edge and no bundler ordering constraint is created (AAP 0.7.3, S4).
 *
 * Every member is expressed as an interface method, so a test double satisfies the whole contract
 * with a plain object literal. That property is load-bearing rather than stylistic: the legacy
 * repository vendors NO mocking library at all, and its tests boot the entire framework application
 * and resolve collaborators at runtime (AAP 0.4.3.6). Target tests instead construct the unit under
 * test directly against doubles from `test/support/inMemoryRepositories.ts`, which is only possible
 * because this contract is small enough to implement by hand.
 *
 * Coverage for this surface is NET-NEW in its entirety. AAP 0.6.5.2 records that no test exists for
 * any data-access component in this slice, so the option resolver, the odometer ordering, the
 * ten-way existence chain, the alternate-code fallback and the conditional fetch are all new
 * coverage; AAP 0.4.1.12 assigns it to `test/adapters/MySqlSkuRepository.test.ts`, where T1 through
 * T5 each get an explicit assertion. No test file belongs in this folder. The wider limitation
 * behind that label is AAP 0.8.4.2: the legacy suite cannot be executed in this environment,
 * because the runtime is unavailable and the test frameworks are not vendored. Source reading with
 * locators therefore IS the evidence for every behavioural claim made here (AAP 0.8.5).
 *
 * =================================================================================================
 * WHERE THE STATEMENTS LIVE INSTEAD
 * =================================================================================================
 * Statement text, placeholder generation, identifier handling and row mapping belong to
 * `src/adapters/mysql/MySqlSkuRepository.ts` (AAP 0.4.1.7 and 0.4.3.4). Nothing statement-shaped
 * crosses this boundary: no fragment, no table or column name as a parameter, no placeholder array,
 * no ordering expression (AAP 0.7.3, S2). What this file DOES carry is the set of adapter
 * OBLIGATIONS the type system cannot express, each stated on the member it constrains and each with
 * the legacy locator that justifies it.
 *
 * TWO PARAMETER CONVENTIONS COEXIST IN THE LEGACY COMPONENT, and the adapter must reconcile them
 * without disturbing order. The existence chain binds by NAME, while the option resolver binds
 * POSITIONALLY. The target driver supports positional placeholders only, so named bindings are
 * converted to positional ones while PRESERVING THE LEGACY SEQUENCE exactly (TR-4). Where a value
 * is currently composed into statement text rather than bound, the adapter binds it — see
 * {@link SkuRepository.findSortedSkuIdsByProduct}, which is the one place in this component where a
 * memoized NUMBER occupies a value position and must become a bound parameter.
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
 * warm invocations and would bleed across them. No new mismatch identifier is introduced — the
 * register is closed at M1-M8.
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
 * new defect identifier is introduced — the register is closed at D1-D22.
 *
 * =================================================================================================
 * WHAT IS DELIBERATELY NOT HERE
 * =================================================================================================
 * A CONVENTION FIRST, BECAUSE IT IS WHAT MAKES THIS LIST CHECKABLE: each omitted member below is
 * identified by its BEHAVIOUR AND ITS LOCATOR, never by its legacy identifier string. That is
 * deliberate and it follows the precedent the sibling ports in this folder already set. An
 * automated audit of this contract's surface greps for member identifiers, so reproducing an
 * omitted member's name — even inside a comment — would make a documented ABSENCE indistinguishable
 * from a declaration. Cite the locator, describe the behaviour, and the omission stays both legible
 * to a reader and invisible to a surface scan.
 *
 *   - THE PRIVATE MEMOIZED SORT-ORDER ACCESSOR at `model/dao/SkuDAO.cfc:L204-L220`. AAP 0.4.2.6
 *     marks it "Internal to the adapter", so it is absent from this contract BY INSTRUCTION, not by
 *     oversight. Its observable consequences are nevertheless documented, on
 *     {@link SkuRepository.findSortedSkuIdsByProduct} (it supplies the ordering exponent) and on
 *     {@link SkuRepository.clearOptionGroupSortOrderCache} (it is the thing not being cleared).
 *
 *   - THE INHERITED PAGINATED DYNAMIC-QUERY READER at `org/Hibachi/HibachiDAO.cfc:L102-L111`. It is
 *     framework plumbing rather than a member of this component: one inherited implementation
 *     serves every service, and it prefixes the entity name at `L104-L106`. That whole surface
 *     belongs to the dedicated paginated dynamic-query port at the root of `src/ports/`, and none
 *     of it is restated here. Nothing from `org/Hibachi/**` is carried across in any case — AAP
 *     0.8.3.2 is explicit that the framework "is being retired for this slice, not carried forward"
 *     — so that file was read as a contract and reproduced nowhere.
 *
 *   - THE STOCK-DELETABILITY FLAG READER that `model/service/SkuService.cfc:L281-L283` delegates
 *     to. It DOES NOT EXIST anywhere in the repository: searching the whole tree for it returns
 *     exactly three lines — the service declaration, the delegation itself, and the entity call
 *     site at `model/entity/Sku.cfc:L569` — and no data-access definition. That absence IS
 *     defect D4, and inventing the member here to make the service compile is precisely the
 *     wrong repair. AAP 0.4.2.2 requires an explicit not-implemented boundary in the SERVICE
 *     instead. It is named in this list so a later reader does not helpfully add it.
 *
 *   - THE UNIQUENESS CHECK at `org/Hibachi/HibachiDAO.cfc:L129-L147`. Application-side uniqueness
 *     checking is real behaviour (IR-5) and it is genuinely needed by the SKU-code rule of
 *     `model/validation/Sku.json`, but it is a framework-level member shared by every entity, so it
 *     is owned by the dedicated uniqueness port at the root of `src/ports/`. Declaring a
 *     SKU-specific copy would fork that contract.
 *
 *   - THE IDENTIFIER GENERATOR. `model/dao/HibachiDAO.cfc` — the LOCAL base this component extends,
 *     not the framework one (IR-8) — exposes the 32-character identifier generator ported to
 *     `src/util/uuid.ts` (IR-6). This port neither generates nor validates identifiers.
 *
 *   - ANY TRANSACTION, SESSION, FLUSH OR VISIBILITY PARAMETER. The read-back ordering hazard of AAP
 *     0.6.2 passes straight through this contract and is documented on
 *     {@link SkuRepository.findSkusBySelectedOptions}, but the guarantee is owned by
 *     `src/adapters/mysql/UnitOfWork.ts` under mismatch M5. Expressing it as a parameter here would
 *     place a demarcation concern in a query contract.
 *
 *   - ANY TIMEOUT, RETRY, BATCH-SIZE, PAGE-SIZE, MAXIMUM-RESULTS, CACHE-LIFETIME OR EVICTION
 *     NUMBER, and any filter, sort-key or collation argument. AAP 0.7.3 S9 and IR-12 forbid
 *     inventing figures or knobs the source does not state. Every number appearing below is a
 *     source-declared value carrying its locator.
 *
 *   - THE SERVICE-LAYER PROJECTION TYPE NAME that AAP 0.4.2.2 uses for the search member's return
 *     value. That name belongs to `src/services/SkuService.ts`; the repository-level projection
 *     declared here is {@link SkuSearchRow}.
 *
 *   - THE LICENCE BANNER at `model/dao/SkuDAO.cfc:L1-L48`. No file in this subtree carries a
 *     per-file banner, and inventing one here would diverge from the established convention. The
 *     omission is recorded so the 228-line accounting above is complete rather than silently short
 *     by 48 lines.
 *
 * =================================================================================================
 * REFERENCE-ONLY, AND WHAT MAY CHANGE
 * =================================================================================================
 * `model/dao/SkuDAO.cfc` is REFERENCE-ONLY and is never modified: AAP 0.4.1.1 makes every target
 * file a creation and every legacy file a reference, and TR-6 states it as "change no existing
 * file". The Minimal Change Clause (AAP 0.8.1) then draws the line this file is built on — idiom
 * may change freely, behaviour may not. So a delimited list becomes an array, a column-oriented
 * record set becomes a typed array, one-based loops become zero-based, and synchronous members
 * become promise-returning ones, because the target reaches the database through an asynchronous
 * driver whereas a CFML query blocks the request thread. Exactly one member below stays
 * synchronous, and its rationale is stated on it. Meanwhile duplicate option identifiers survive,
 * an empty option list stays legal, option-less SKUs stay excluded, a required argument stays
 * required, a singular argument name keeps carrying a plural value, a multi-match still raises, and
 * an inert clearing member still exists.
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
   * ===============================================================================================
   * THE ALGORITHM THE WHOLE EXERCISE IS ABOUT
   * ===============================================================================================
   * `model/dao/SkuDAO.cfc:L107-L128` assembles its statement in a loop, appending one correlated
   * existence test per option and growing the bound-parameter array in lockstep. The source
   * documents its own intent at `model/dao/SkuDAO.cfc:L106`, and the comment is both accurate and
   * load-bearing: "returns product skus which matches ALL options (list of optionIDs) that are
   * passed in". That sentence is the strongest available evidence against the rewrite T1 warns
   * about, and it is quoted rather than paraphrased for exactly that reason.
   *
   * Four call sites exist in the whole repository and all four were enumerated (AAP 0.6.1.1): the
   * uniqueness validation rule at `model/entity/Sku.cfc:L763`, the single-result wrapper at
   * `model/entity/Product.cfc:L349-L364`, the plural wrapper at
   * `model/entity/Product.cfc:L366-L368`, and one OUT-OF-SCOPE caller in the order domain at
   * `model/process/Order_AddOrderItem.cfc:L238`. They all funnel through the one-line delegation at
   * `model/service/ProductService.cfc:L104-L106`, which is this member's only path.
   *
   * THE POSITIONAL ARGUMENT ORDER IS LOAD-BEARING, WHICH IS WHY THE PRODUCT COMES SECOND. Both the
   * out-of-scope caller and `model/entity/Product.cfc:L367` pass their two arguments POSITIONALLY
   * as options-then-product. AAP Goal B names the order-domain caller as one the port must not
   * break, so that sequence is fixed here. It is also why the adapter's bound array is every option
   * identifier in list order FOLLOWED BY the product identifier: the legacy appends the option
   * parameters inside the loop at `model/dao/SkuDAO.cfc:L120` and the product parameter afterwards
   * at `model/dao/SkuDAO.cfc:L125`, and TR-4 requires that sequence to be preserved exactly.
   *
   * ===============================================================================================
   * T1 — CONJUNCTION, NOT INTERSECTION. AN ARRAY, NEVER A DEDUPLICATING COLLECTION.
   * ===============================================================================================
   * `model/dao/SkuDAO.cfc:L113-L121` appends ONE separate correlated existence test per list
   * element and combines them with AND, so a SKU qualifies only by carrying EVERY listed option.
   * Two rewrites look like simplifications and are both wrong: a set-membership predicate over the
   * whole list turns the conjunction into a DISJUNCTION, and a grouped counting predicate diverges
   * as soon as the list contains a DUPLICATE, because the legacy appends one test per element with
   * NO DEDUPLICATION ANYWHERE. Implementations MUST emit one existence test per element, duplicates
   * included.
   *
   * That is why the parameter below is a plain array. A deduplicating collection type would drop
   * duplicate identifiers before the adapter ever saw them, and no adapter could reconstruct what
   * the type had already discarded — the semantic would be lost in the signature, silently, with
   * every gate still passing.
   *
   * ===============================================================================================
   * T2 — THE PRODUCT IDENTIFIER IS REQUIRED, AND THAT IS A DECLARED DECISION.
   * ===============================================================================================
   * The legacy declaration at `model/dao/SkuDAO.cfc:L107` marks it OPTIONAL, and
   * `model/dao/SkuDAO.cfc:L123` guards the product predicate on the argument's presence. On the
   * real path that guard is never false: `model/service/ProductService.cfc:L104` declares the
   * argument REQUIRED and forwards its whole argument scope, and it is this member's ONLY caller,
   * so the predicate is always appended. The target therefore types the parameter as required,
   * exactly as AAP 0.6.1.4 specifies.
   *
   * This is recorded as a DECISION rather than made silently, which is the obligation AAP 0.8.2
   * Guideline 6 imposes. The alternative — typing it optional "to be faithful to the declaration" —
   * would hand every implementation and every test double an unreachable branch to invent behaviour
   * for, and would let a caller omit the product scope and receive SKUs from other products.
   *
   * ADAPTER OBLIGATION — THE PRODUCT PREDICATE IS GUARDED ON PRESENCE ONLY, NOT ON EMPTINESS.
   * `model/dao/SkuDAO.cfc:L123` tests solely that the argument exists; it applies no length or
   * whitespace test, so an EMPTY-STRING product identifier still appends the predicate and still
   * binds the empty value, matching nothing. Contrast `model/dao/SkuDAO.cfc:L134`, where the
   * sibling search member additionally requires a non-blank value. That intra-component divergence
   * in guard strictness is preserved, and it is why this member's product argument and
   * {@link SkuRepository.searchByProductType}'s product-type argument cannot be reasoned about
   * interchangeably.
   *
   * ===============================================================================================
   * T3 — THE VESTIGIAL JOIN IS LOAD-BEARING. THE RESULT IS OPTION-BEARING SKUS ONLY.
   * ===============================================================================================
   * `model/dao/SkuDAO.cfc:L110` joins the SKU to its options and gives the join an alias THAT IS
   * NEVER REFERENCED in the rest of the statement. It looks removable. It is not: because the join
   * is inner, it silently EXCLUDES every SKU that carries no options — from every result, including
   * when the option list is empty. This contract therefore promises option-bearing SKUs and nothing
   * more, and implementations MUST retain an equivalent existence guard against the SKU-option link
   * table. Dropping it would widen every result set, and nothing in the type system would notice.
   *
   * ===============================================================================================
   * T4 — THE DISTINCT PROJECTION IS MANDATORY.
   * ===============================================================================================
   * `model/dao/SkuDAO.cfc:L109` projects DISTINCTLY, and the join at `L110` fans out one row per
   * SKU-option pair. Without distinctness a SKU carrying N options is returned N TIMES, and every
   * arity assertion layered above this member breaks at once — the single-result wrapper at
   * `model/entity/Product.cfc:L349-L364` counts results and raises on more than one, and the
   * uniqueness rule at `model/entity/Sku.cfc:L756-L769` compares a count against one. This contract
   * returns each qualifying SKU EXACTLY ONCE.
   *
   * ===============================================================================================
   * T5 — AN EMPTY OPTION LIST IS LEGAL, MEANINGFUL, AND RELIED UPON BY TWO CALLERS.
   * ===============================================================================================
   * The plural wrapper at `model/entity/Product.cfc:L366-L368` defaults its option list to the
   * empty string, and a delimited-list length of an empty string is ZERO — so the loop at
   * `model/dao/SkuDAO.cfc:L113` appends NO existence tests and the statement legitimately
   * degenerates to "all option-bearing SKUs of this product". That degenerate form is not an edge
   * case to be defended against; it is depended upon by both the single-result wrapper at
   * `model/entity/Product.cfc:L349-L364` and the uniqueness rule at
   * `model/entity/Sku.cfc:L756-L769`.
   *
   * The parameter is therefore a plain array and NOT a non-empty one, empty input is NOT documented
   * as invalid, and NO guard clause exists at this boundary. Rejecting or short-circuiting an empty
   * array would break both callers.
   *
   * ===============================================================================================
   * THE JUDGEMENT CALLS THE TRANSLATION REQUIRED (AAP 0.8.2, Guideline 6)
   * ===============================================================================================
   * NAVIGATION SIDE — AN EXPLICIT, EQUIVALENT SIMPLIFICATION. The legacy existence test at
   * `model/dao/SkuDAO.cfc:L116-L118` navigates the many-to-many relationship STARTING AT THE OPTION
   * END: it enters at the option entity, joins to that option's SKUs, correlates them to the outer
   * SKU and then compares the option identifier — a two-hop entity navigation. AAP 0.3.3.1 fixes
   * the target shape as reading the SKU-option LINK TABLE directly instead, correlating on the SKU
   * identifier and comparing the option identifier. The two are equivalent, and the simplification
   * is recorded here because it is invisible otherwise: a reviewer diffing the legacy statement
   * against the generated one will find a TABLE that appears in no legacy text and an ENTITY that
   * appears in no generated text. Unexplained, that reads as drift; explained, it is the correct
   * translation of an association the mapping layer used to hide (TR-2).
   *
   * IDENTIFIER ALIASES — THE STATEMENT TEXT DOES NOT REVEAL THE MAPPING. This member's statement
   * uses the mapping layer's implicit identifier alias in two places, `model/dao/SkuDAO.cfc:L117`
   * and `model/dao/SkuDAO.cfc:L124`, while other members of the SAME component spell the property
   * names out — `model/dao/SkuDAO.cfc:L60`, `L62` and `L163` all do. Both idioms therefore appear
   * in one file, and the adapter must resolve the implicit alias to the concrete SKU and product
   * identifier columns. Nothing in the legacy text says which columns those are; only the entity
   * mappings do.
   *
   * ===============================================================================================
   * THIS MEMBER SITS INSIDE A VALIDATION READ-BACK CYCLE (mismatch M5, defect D19)
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
   * That guarantee is NOT this contract's to express. It is owned by
   * `src/adapters/mysql/UnitOfWork.ts` under mismatch M5, which must make each insert visible to
   * the next read within the same transaction, and it is asserted in
   * `test/services/SkuService.test.ts`. This member deliberately declares NO transaction, session,
   * flush or visibility parameter: a query contract that accepted one would be expressing a
   * demarcation concern, and every test double would then have to model transaction semantics to
   * satisfy it. The cycle is recorded here because this is the file a reader traces it through.
   *
   * TODO(parity): defect D19 follows directly from T5 and is carried, not repaired. For a SKU with
   * ZERO options the assembled list is empty, so by T5 this member returns ALL option-bearing SKUs
   * of the product; the legacy guard at `model/entity/Sku.cfc:L764` can then only pass when the
   * product has none. An option-less default SKU on a product that already has option-bearing SKUs
   * therefore FAILS its uniqueness rule. That is observed behaviour flowing from a correct
   * translation of this member, not a fault in it, and any repair would belong to the entity in any
   * case (AAP 0.7.3, S7).
   *
   * The sibling rule at `model/entity/Sku.cfc:L772-L784` is mentioned only to forestall the
   * assumption that it behaves alike: it is pure and in-memory, walks the SKU's own options and
   * touches no repository at all.
   *
   * ADAPTER OBLIGATION — THE STATEMENT USES MAPPING-LAYER ENTITY NAMES throughout
   * `model/dao/SkuDAO.cfc:L109-L124`, unlike the physical names of
   * {@link SkuRepository.findSortedSkuIdsByProduct}; see the D22 note in the file header.
   *
   * TR-1 TIGHTENING, RECORDED. The legacy option list is a COMMA-DELIMITED STRING
   * [`model/dao/SkuDAO.cfc:L107`] read element by element inside the loop at
   * `model/dao/SkuDAO.cfc:L114`; the target takes an array, which is an idiom change under AAP
   * 0.8.1 and preserves both duplicates and order. The declared return type is widened from untyped
   * to a typed array of hydrated SKUs, matching what `model/dao/SkuDAO.cfc:L127` actually resolves
   * to.
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
   * than given an identifier of their own, because the register is closed at D1-D22.
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
   * ===============================================================================================
   * THIS MEMBER IS INERT TWICE OVER — AND IT IS STILL DECLARED (defect D7)
   * ===============================================================================================
   * TODO(parity): the guard at `model/dao/SkuDAO.cfc:L222-L226` is INVERTED. The removal runs only
   * when the memoized key is ABSENT, so it deletes a key that does not exist and never touches the
   * key that does. THE MEMO IS THEREFORE NEVER CLEARED. A repository-wide search for callers of the
   * legacy member returns NONE, so it is inert for a second, independent reason. Neither is
   * repaired: AAP 0.7.3 S7 requires legacy behaviour to be preserved and annotated, and AAP 0.8.2
   * Guideline 4 singles out this exact case, naming "an inverted cache guard" among the things a
   * competent engineer would instinctively fix and forbidding the fix. Implementations MUST NOT
   * correct the condition and MUST NOT document this member as working.
   *
   * WHY AN INERT MEMBER IS ON THE INTERFACE AT ALL, AND THE RULE THAT DECIDES IT. Two authorities
   * converge: AAP 0.4.2.6 maps the legacy member explicitly to this named target method, and
   * transformation rule TR-5 is unambiguous — "The member is never quietly dropped from the
   * interface." The contrast with the one dead member the plan DOES omit is deliberate and worth
   * naming, because it is the difference between following instructions and improvising: the
   * private, only-self-recursive method at `model/service/ProductService.cfc:L82-L97` (defect D15)
   * is omitted SOLELY because AAP 0.4.1.8 instructs it. Nothing instructs that for this one. DEAD
   * CODE IS DROPPED ON EXPLICIT INSTRUCTION, NEVER ON A PORT AUTHOR'S OWN REACHABILITY ANALYSIS.
   *
   * SYNCHRONOUS, AND THE ABSENCE OF A PROMISE IS THE POINT. `model/dao/SkuDAO.cfc:L222` declares a
   * void return, and the body performs a single in-memory key removal: no statement is issued, no
   * connection is acquired, no row is read or written. Declaring this member synchronous states
   * that fact in the type. It is the ONLY synchronous member of the seven — the shape the sibling
   * brand port already established for its own non-database primitive — and a promise-returning
   * signature would compile perfectly while obliging every caller, production and test double
   * alike, to await something that never yields, permanently encoding an I/O boundary that does not
   * exist.
   *
   * ===============================================================================================
   * THE MEMO'S SCOPE IS AN EXECUTION-MODEL MISMATCH (M7), AND THIS IS THE ONLY PORT IT TOUCHES
   * ===============================================================================================
   * TODO(parity): the memoized value is GLOBAL, not per-product. It is produced by a whole-table
   * maximum at `model/dao/SkuDAO.cfc:L210-L212` that takes NO parameters and applies NO product
   * scoping whatsoever, then held in the component property declared at `model/dao/SkuDAO.cfc:L51`
   * — the only such property among the four data-access components, and the reason this component
   * alone declares generated accessors at `model/dao/SkuDAO.cfc:L49`. Combined with D7, that means
   * one global number, computed once, never invalidated, and used to order every product's SKUs.
   *
   * Under mismatch M7 that arrangement DOES NOT SURVIVE THE MOVE UNCHANGED, and the resolution is
   * stated rather than assumed. Nothing persists between invocations of a stateless handler EXCEPT
   * module-scope state, so a module-scope memo would share one global maximum across invocations
   * and across tenants on a warm container. AAP 0.4.2.6 therefore requires the memo to become
   * EXPLICIT REQUEST-SCOPED STATE, and AAP 0.4.1.6 says the same in its one-line instruction for
   * this file. On a persistent application server the never-cleared memo is merely stale; on a warm
   * container it would be cross-tenant bleed. Implementations MUST hold it per request and MUST NOT
   * hoist it to module scope — and this file, being type-only, declares no state of any kind and
   * could not host such a cache even if that were wanted.
   *
   * TODO(parity): one further observation about the memo belongs to the adapter and is recorded
   * from here because this is the only member that reaches it. The seeding at
   * `model/dao/SkuDAO.cfc:L206` assigns a starting value, and the guard at
   * `model/dao/SkuDAO.cfc:L213-L215` then tests whether the aggregate returned any row — which for
   * a bare maximum is ALWAYS TRUE, since an aggregate always returns exactly one row. The seed is
   * therefore always overwritten. On an EMPTY option-group table the maximum is null, which the
   * legacy language surfaces as an empty string, so incrementing it yields the same value as the
   * seed — the two paths coincide by coincidence rather than by design. Implementations MUST
   * reproduce the resulting value in both cases, including the empty-table case, and MUST NOT rely
   * on the guard to mean what it appears to mean. Recorded as observed, with no new register
   * number.
   *
   * NO LIFETIME, SIZE OR EVICTION PARAMETER IS OFFERED, and none may be added. The legacy exposes a
   * single argument-free removal and nothing else, so a lifetime, maximum size, refresh mode or
   * eviction policy would each be an invented knob (AAP 0.7.3, S9). What "request-scoped" means
   * concretely is the composition root's and the adapter's decision, not a parameter of this
   * contract.
   *
   * @returns Nothing. Synchronous by design, per `model/dao/SkuDAO.cfc:L222`. Note that in the
   *   legacy this call has NO EFFECT AT ALL — see the inverted-guard note above — and
   *   implementations reproduce that rather than correcting it.
   */
  clearOptionGroupSortOrderCache(): void;
}
