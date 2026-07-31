/* ================================================================================================
 * `MySqlProductTypeRepository` — the MySQL adapter for the Catalog's product-type tree projection.
 *
 * Legacy origin: `model/dao/ProductTypeDAO.cfc`, whose whole body is one member declared at
 * `model/dao/ProductTypeDAO.cfc:L52`, assembled at `:L54-L62` and executed at `:L64`. AAP §0.4.1.7
 * mandates this file in one line — "The tree-sorted query with its `isAssigned` and `childCount`
 * subselects" — and AAP §0.4.2.6 fixes the target name: `getProductTypeQuery` becomes
 * `findAllForTree` on `ProductTypeRepository`, which this class implements and does not extend.
 *
 * THIS IS THE SMALLEST OF THE FOUR REPOSITORY TRANSLATIONS AND THE ONE WITH THE LEAST CODE TO GET
 * WRONG. One member, one statement, no branch, no loop, no bound value and no caller. What it has
 * instead is an unusual density of MISLEADING SOURCE: two of the four comment-bearing lines in the
 * legacy component state things that are false about the code beneath them, one column alias names
 * something other than what it holds, and the member that would consume all of it does not exist.
 * Preserving that faithfully while making every falsehood visible is the deliverable here, which is
 * why the annotation below is long relative to the eight lines of statement text it explains
 * (AAP §0.8.2 Guideline 6 — document the technology-specific judgment calls where they are made).
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ALLOWED TO TOUCH (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------------------------------------------
 * MAY import: `domain/`, `ports/`, `util/`, `errors/` and the MySQL driver. It happens to need only
 * two adapter-local modules and one port, so the driver is not imported here at all — the execution
 * boundary owns that import, and this class never sees a driver type.
 *
 * MUST NOT import: `config/`, `services/`, `handlers/`, `integrations/` or `validation/`. Nothing
 * reads the environment either: configuration flows one way, and `src/config/env.ts` is the only
 * module permitted to read it (AAP §0.4.3.5). That one-way flow is what keeps the apparent
 * configuration-to-adapter cycle from existing, so it is a hard requirement and not a preference.
 * No handler-layer type appears, because AWS coupling is confined to `src/handlers/**`.
 *
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) D22 `model/dao/ProductTypeDAO.cfc:L54-L62` — THE LEGACY STATEMENT NAMES ITS TABLES
 * WITH LOGICAL ENTITY NAMES, INSIDE NATIVE SQL
 * ------------------------------------------------------------------------------------------------
 * Every table reference in the legacy statement — at `:L55`, `:L56`, `:L57`, `:L59`, `:L60` and
 * `:L61` — is a LOGICAL ORM entity name, and the statement around it is native SQL rather than HQL:
 * a query object is created at `:L53` and executed at `:L64` with no mapping layer in between to
 * translate a logical name. In release 3.1.39 the physical tables are `SwProductType` and
 * `SwProduct`, declared at `model/entity/ProductType.cfc:L49` and `model/entity/Product.cfc:L49`,
 * and this component contains no physical name anywhere. The translation this file performs is
 * therefore fixed and mechanical:
 *
 *     legacy `SlatwallProductType`  ->  emitted `SwProductType`   [model/entity/ProductType.cfc:L49]
 *     legacy `SlatwallProduct`      ->  emitted `SwProduct`       [model/entity/Product.cfc:L49]
 *
 * ROOT CAUSE, quoted from `org/Hibachi/HibachiDAO.cfc:L102-L106`, which prefixes the application key
 * onto an entity name whenever it is absent:
 *
 *     getSmartList(required string entityName, struct data={})
 *       if(left(arguments.entityName, len(getApplicationKey())) != getApplicationKey()) {
 *           arguments.entityName = "#getApplicationKey()##arguments.entityName#";
 *       }
 *
 * That is why the logical form is the legitimate ORM and HQL vocabulary, and it is why native SQL
 * spelled that way worked only for as long as the logical and physical names coincided. The
 * conclusion an implementer must carry forward is exactly this: never "fix" HQL entity names to
 * `Sw*`, and never assume a logical name works in native SQL. The two are different vocabularies for
 * different layers, and which one is correct depends entirely on which layer executes the text.
 *
 * HOW THE TRANSLATION IS ENFORCED RATHER THAN ASSERTED. Both names are routed through the schema
 * whitelist in the execution-boundary module, which accepts either vocabulary and returns the
 * physical form, and refuses any identifier outside the seven in-scope tables. The argument passed is
 * the PHYSICAL literal rather than the legacy logical token, deliberately: the whitelist would
 * normalise either, but writing the emitted identifier at the site that emits it means a reader sees
 * the statement text as the database receives it, without having to run a normalisation step in their
 * head. The legacy token stays visible in this annotation, which is where a reader looks for the
 * reason. Every column identifier is routed through the companion column whitelist for the same
 * reason, and per table, so a well-formed column name applied to the wrong table is refused too.
 *
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) FALSEHOOD #1 — `model/dao/ProductTypeDAO.cfc:L51` ADVERTISES CACHING THAT DOES NOT
 * EXIST, AND THIS FILE ADDS NONE
 * ------------------------------------------------------------------------------------------------
 * The legacy hint, preserved verbatim:
 *
 *     //@hint for caching product types as a tree-sorted query
 *
 * NOTHING IN THE LEGACY COMPONENT CACHES ANYTHING. A fresh query object is created at
 * `model/dao/ProductTypeDAO.cfc:L53` and executed at `:L64` on every single invocation, and the
 * component declares no property of any kind to hold a result in — `:L49` is
 * `component extends="HibachiDAO" accessors="true" {` and nothing follows it but the one member.
 * Contrast `model/dao/SkuDAO.cfc:L51`, which declares exactly such a property and genuinely
 * memoizes an option-group sort order; this component is stateless, and the hint describes an
 * intention that was never implemented.
 *
 * THE HINT IS PRESERVED AND NOT ACTED ON, AND THAT IS THE SINGLE MOST IMPORTANT DECISION IN THIS
 * FILE. It reads as an unfinished intention, and finishing it would be a handful of lines. It is
 * wrong twice over:
 *   - It would invent behaviour the legacy does not have, which AAP §0.8.2 Guideline 4 forbids
 *     ("Do not enhance or optimize business logic beyond what the migration requires") and AAP
 *     §0.7.3 S9 forbids again.
 *   - It would be unsound in the target execution model. Mismatch M7 is explicit: memoization is
 *     scoped to the request object and never to the module, because module-scope state survives
 *     between warm invocations. Dependency resolution made repositories singletons in the legacy
 *     application (`org/Hibachi/Hibachi.cfc` around `:L289`) and the composition root honours that,
 *     so a per-instance memo would leak one invocation's product types into the next just as surely
 *     as a module-scope one.
 * There is therefore no result cache here at any scope — not module-level, not instance-level, not
 * "just a keyed collection", and no expiry to tune. Two calls issue two statements, which is exactly
 * what the legacy does.
 *
 * WHAT IS BUILT ONCE AT MODULE SCOPE IS NOT A CACHE, AND THE DIFFERENCE IS THE POINT. The statement
 * text and the empty bound-value list below are immutable constants derived from the schema
 * whitelist, holding no row, no result and no invocation-specific value — the same shape the
 * execution-boundary module already uses for its whitelists. Composing statement text once is
 * assembling a literal; retaining rows between calls is what M7 prohibits.
 *
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) FALSEHOOD #2 — `model/dao/ProductTypeDAO.cfc:L63` CALLS THE RESULT A TREE. THE
 * ORDERING IS FLAT AND ALPHABETICAL
 * ------------------------------------------------------------------------------------------------
 * The legacy trailing comment, preserved verbatim:
 *
 *     // return query sorted Product Type tree
 *
 * Three separate signals point at a hierarchy — that comment, the legacy member name
 * `getProductTypeQuery`, and the target member name `findAllForTree` — and the statement delivers
 * none. `model/dao/ProductTypeDAO.cfc:L62` is `ORDER BY productTypeName ASC` and nothing else: one
 * sort term, over the whole table, alphabetical by name, hierarchy-blind. Nothing groups a child
 * beneath its parent, and the identifier-path property that could express a hierarchy — declared at
 * `model/entity/ProductType.cfc:L53` and maintained at `model/entity/ProductType.cfc:L251-L253` — is
 * not referenced by the statement at any point.
 *
 * THE ORDERING IS CARRIED EXACTLY AND MUST NOT BE "IMPROVED". No second sort term, no ordering on
 * the identifier-path property, no self-referencing common table expression, no depth-first
 * assembly performed after the read. Row order is observable output, so changing it is a
 * behavioural change that would compile cleanly and fail no test — precisely the silent divergence
 * AAP §0.7.3 S7 ("preserve and annotate, do not repair") exists to prevent. The port name
 * `findAllForTree` describes INTENDED CONSUMPTION, not emitted ordering: a caller that wants a
 * hierarchy assembles one from the parent reference on each returned row.
 *
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) `isAssigned` IS A COUNT, NOT A FLAG — `model/dao/ProductTypeDAO.cfc:L55-L57`
 * ------------------------------------------------------------------------------------------------
 * The alias is a misnomer inherited from the legacy source and preserved exactly, because callers
 * observe it. What it holds is `count(...)` over the products of the product type — a value from
 * zero through N. It is not coerced here, not renamed here, and the statement does not compare it
 * against zero to produce a two-state answer. `ProductTypeRepository` declares it `number` for this
 * reason, and the row mapper reads it as one.
 *
 * The failure this annotation exists to prevent is quiet: a reader who trusts the name writes a
 * plain truthiness test, gets the right answer for every product type that has products and for
 * every one that has none, and loses the magnitude everywhere in between without any symptom. A
 * consumer that genuinely needs a present-or-absent answer derives it from the number; neither this
 * adapter nor the statement derives it for them, because the legacy does not either.
 *
 * `childCount` at `model/dao/ProductTypeDAO.cfc:L58-L60` is named accurately but bounded more
 * narrowly than a reader may assume: its predicate matches one generation through the
 * self-referencing foreign key `parentProductTypeID` — declared as the `fkcolumn` of the
 * many-to-one at `model/entity/ProductType.cfc:L62` and confirmed as a physical column by
 * `config/dbdata/SlatwallProductType.xml.cfm` — so a product type with one child that itself has four
 * children reports one and not five. Nothing in the statement walks the hierarchy transitively.
 *
 * ------------------------------------------------------------------------------------------------
 * THIS MEMBER HAS NO CALLER ANYWHERE IN THE LEGACY REPOSITORY, AND IS PORTED ANYWAY
 * ------------------------------------------------------------------------------------------------
 * Verified from both ends. Searching the whole legacy tree for the legacy member name returns
 * exactly one line — its own declaration at `model/dao/ProductTypeDAO.cfc:L52`. Searching for the
 * dependency-injection property that would reach it returns exactly one line too, its declaration
 * at `model/service/ProductService.cfc:L54`, which AAP §0.6.3.1 classifies as one of the four dead
 * injections with zero call sites.
 *
 * It is implemented regardless, because TR-5 is unambiguous: "The member is never quietly dropped
 * from the interface." AAP §0.4.1.7 lists this file explicitly and AAP §0.4.2.6 maps the legacy
 * member to this named target, so the absence of a caller is a fact to record rather than a licence
 * to omit. AAP §0.4.1.3 completes the picture: the dead injection is deliberately NOT wired in the
 * composition root, so this class is constructible and correct and nothing in the slice invokes it.
 * That is the intended end state; wiring a caller to justify the file would be inventing a call path
 * the legacy does not have. Dead code is dropped only on explicit instruction — the one omission the
 * plan does sanction, the private method at `model/service/ProductService.cfc:L82-L97` that only ever
 * calls itself, is omitted because AAP §0.4.1.8 says so and not because an author judged it
 * unreachable.
 *
 * ------------------------------------------------------------------------------------------------
 * SMALLER SOURCE OBSERVATIONS, CARRIED SO THEY ARE NOT REDISCOVERED AS BUGS
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) `model/dao/ProductTypeDAO.cfc:L53` constructs its query object as `new query()`,
 * lower-cased, where `model/dao/SkuDAO.cfc:L131` and `model/dao/ProductDAO.cfc:L155`, `:L329` and
 * `:L420` all write `new Query()`. CFML component paths are case-insensitive, so both resolve to the
 * same component and the drift is harmless. It is recorded because it is the kind of inconsistency a
 * reader is tempted to read meaning into, and there is none to read: nothing in this file varies as
 * a result, since the construction has no target-side counterpart at all — the injected execution
 * boundary replaces it.
 *
 * THE STATEMENT IS FULLY STATIC AND BINDS NOTHING, SO THERE IS NO D18 SITE IN THIS FILE. The single
 * declared parameterization-hardening exception in the whole plan belongs exclusively to the product
 * importer's adapter, whose legacy statements interpolate values taken from an uploaded file. This
 * statement interpolates no value at all: the only text substituted into it is a table or column
 * identifier that the schema whitelist has already validated, and there is no caller input to
 * substitute in the first place, because the member takes no argument. It is stated positively here
 * so that the absence reads as a verified property rather than an omission.
 *
 * REGISTER DISCIPLINE. This file MINTS NO defect or mismatch identifier. It cites D22, defined in
 * `src/ports/repositories/SkuRepository.ts`, whose finding F27 records that the plan's own defect
 * register is frozen at D1-D21 and that no single file can honestly assert a global closure. It also
 * cites M7. Every other finding above is recorded by `path:Lnnn` locator alone, which is the only
 * claim one file can verify. Defect D21 — the unfiltered inherited-assignment read at
 * `model/entity/ProductType.cfc:L92-L98`, which carries one of the three literal legacy TODO
 * comments in the slice — is CITED AND NOT OWNED: it is boundary-stubbed in
 * `src/domain/product/ProductType.ts`, reaches an excluded domain family, and nothing here touches
 * it.
 *
 * ------------------------------------------------------------------------------------------------
 * NO EXECUTION-MODEL MISMATCH OTHER THAN M7 REACHES THIS FILE, AND THAT IS STATED RATHER THAN LEFT
 * BLANK (AAP §0.7.3 S8)
 * ------------------------------------------------------------------------------------------------
 * The member performs one read, takes no argument, holds no state and opens no transaction. There is
 * no long-running bulk operation here, no per-row commit boundary, no request-end flush gate and no
 * background thread, so M1 through M5 and M8 are cited and not owned, and nothing is added in
 * response to any of them — no time budget, no row-count clause, no batch size.
 *
 * M6 DOES APPLY TRANSITIVELY, AND THE DESIGN IS WHAT SATISFIES IT. When the unit of work supplies a
 * transaction-scoped executor, this read runs on that executor and therefore observes writes the
 * enclosing transaction has not yet committed. That follows from taking the execution contract as a
 * constructor parameter and never reaching past it: this class holds no pool, builds no pool, reads
 * no credential and resolves no connection target. Contrast the legacy importer's data-access
 * component, which builds a credential-reading connection three separate times inside the
 * data-access layer itself, at `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L332` and `:L420`.
 *
 * ------------------------------------------------------------------------------------------------
 * INVENT NOTHING (AAP §0.7.3 S9, IR-12)
 * ------------------------------------------------------------------------------------------------
 * No number appears in this file that the legacy source does not state. In particular: no pool-sizing
 * knob of any kind, no time budget, no retry count, no backoff, no page size, no batch size, no
 * maximum-results clause, no index hint, no expiry and no service-level figure of any kind.
 *
 * The maximum-results point deserves naming because the temptation is real rather than theoretical:
 * the statement selects every row of the product-type table with no upper bound, which feels unsafe
 * to a reader sizing an unbounded read. The legacy has no such bound, and adding one would silently
 * truncate the result — a wrong answer delivered confidently, which is worse than a large one.
 * ============================================================================================== */

import { assertColumnName, assertTableName } from './QueryRunner';
import { mapProductTypeTreeRow, mapRows } from './rowMappers';

import type { SqlExecutor } from './QueryRunner';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../ports/repositories/ProductTypeRepository';

/* ================================================================================================
 * THE TWO DERIVED-COLUMN ALIASES, PINNED TO THE PORT'S FIELD NAMES AT COMPILE TIME
 * ============================================================================================== */

/**
 * The alias the assigned-product count is projected under — `as isAssigned` at
 * `model/dao/ProductTypeDAO.cfc:L57`.
 *
 * `satisfies keyof ProductTypeTreeRow` is doing real work rather than decorating the declaration.
 * The alias in the statement text and the field the row mapper reads have to agree, and nothing else
 * in the type system connects a string inside a template literal to a declared field. With the
 * constraint in place, renaming the field on the port turns this line into a compile error instead of
 * an empty column at run time. Without it, the two could drift apart and the only symptom would be
 * every count reading as absent.
 *
 * The alias is NOT routed through the column whitelist, and must not be: it names no column of any
 * table, so the whitelist would correctly refuse it and the module would fail to load. It is a
 * projection label chosen by the statement, fixed here as a literal, and never derived from caller
 * input — there is no caller input.
 */
const IS_ASSIGNED_ALIAS = 'isAssigned' satisfies keyof ProductTypeTreeRow;

/**
 * The alias the immediate-child count is projected under — `as childCount` at
 * `model/dao/ProductTypeDAO.cfc:L60`. Pinned to the port's field name for the reason given on
 * {@link IS_ASSIGNED_ALIAS}, and likewise not a column of any table.
 */
const CHILD_COUNT_ALIAS = 'childCount' satisfies keyof ProductTypeTreeRow;

/**
 * The correlation alias the legacy statement gives its self-reference — `spt` at
 * `model/dao/ProductTypeDAO.cfc:L59`.
 *
 * Carried verbatim. It is scoped to the inner query, so it is invisible to the outer projection and
 * to the ordering clause, and renaming it would change nothing observable — which is precisely why it
 * is left alone: a rename would be a gratuitous difference in a statement a reviewer is expected to
 * compare against `model/dao/ProductTypeDAO.cfc:L58-L60` line by line.
 *
 * Like the two aliases above it is not a table name, so it does not pass through the schema
 * whitelist. It is a fixed literal authored here, not a value that arrives from anywhere.
 */
const SELF_REFERENCE_ALIAS = 'spt';

/* ================================================================================================
 * THE STATEMENT
 * ============================================================================================== */

/**
 * Composes the product-type tree statement once, from identifiers the schema whitelist has approved.
 *
 * This is the translation of `model/dao/ProductTypeDAO.cfc:L54-L62` — the legacy text with its
 * logical entity names replaced by the physical ones per the D22 annotation in the file header, and
 * with nothing else changed. What the legacy statement does, this statement does:
 *
 *   - `SELECT *` is PRESERVED AS A WILDCARD, and the decision not to enumerate columns is deliberate.
 *     The wildcard sits over a single `FROM`, so it resolves to every column of the product-type
 *     table and nothing else — the self-reference alias belongs to the inner query and contributes no
 *     column to the outer projection. Enumerating the columns would change nothing observable, but it
 *     would assert a column list this file has no locator for, and the port's own reasoning already
 *     rejects that as fabrication. The row mapper hydrates by column name, so it reads whatever the
 *     wildcard supplies; a mapper that required an enumerated list would have coupled the two.
 *   - BOTH DERIVED COLUMNS STAY CORRELATED SCALAR SUBQUERIES. Rewriting either as an outer join with
 *     grouping would change row multiplicity and the meaning of the counts, and is forbidden by AAP
 *     §0.8.2 Guideline 4. The aliases are preserved exactly.
 *   - THE ORDERING IS THE SINGLE LEGACY SORT TERM. See FALSEHOOD #2 in the file header.
 *
 * Called once at module evaluation. If the schema whitelist ever stopped recognising one of these
 * seven identifiers the module would fail to load, loudly, at the earliest possible moment — which is
 * the correct outcome, and the reason the assertions are not wrapped in anything that would soften
 * them. Every argument below is a literal authored here, so this cannot fail on account of a caller.
 *
 * @returns The complete statement text, with a physical table name at every table position, a
 *   validated column name at every column position, and no value placeholder anywhere.
 * @throws {DomainError} From the whitelists, at module evaluation, if an identifier below ever falls
 *   outside the extracted Catalog schema.
 */
function composeProductTypeTreeStatement(): string {
  /*
   * The physical form is passed rather than the legacy logical form. The whitelist would normalise
   * either — see the D22 annotation in the file header for why the emitted form is written here.
   */
  const productTypeTable = assertTableName('SwProductType');
  const productTable = assertTableName('SwProduct');

  const productTypeId = assertColumnName(productTypeTable, 'productTypeID');
  const parentProductTypeId = assertColumnName(productTypeTable, 'parentProductTypeID');
  const productTypeName = assertColumnName(productTypeTable, 'productTypeName');

  /*
   * Two columns of the product table, validated against THAT table. `productTypeID` exists on both
   * tables, which is exactly why the whitelist is keyed per table: the correlation predicate compares
   * one table's column against the other's, and each side is checked against the table it belongs to.
   */
  const productId = assertColumnName(productTable, 'productID');
  const productProductTypeId = assertColumnName(productTable, 'productTypeID');

  const assignedProductCount =
    `(SELECT count(${productTable}.${productId})\n` +
    `   FROM ${productTable}\n` +
    `   WHERE ${productTable}.${productProductTypeId} = ${productTypeTable}.${productTypeId})`;

  const immediateChildCount =
    `(SELECT count(${SELF_REFERENCE_ALIAS}.${productTypeId})\n` +
    `   FROM ${productTypeTable} ${SELF_REFERENCE_ALIAS}\n` +
    `   WHERE ${SELF_REFERENCE_ALIAS}.${parentProductTypeId} =` +
    ` ${productTypeTable}.${productTypeId})`;

  return (
    `SELECT *,\n` +
    `  ${assignedProductCount} as ${IS_ASSIGNED_ALIAS},\n` +
    `  ${immediateChildCount} as ${CHILD_COUNT_ALIAS}\n` +
    `FROM ${productTypeTable}\n` +
    `ORDER BY ${productTypeName} ASC`
  );
}

/**
 * The one statement this adapter runs, composed once and never rebuilt.
 *
 * EXPORTED SO THE TRANSLATION IS ASSERTABLE WITHOUT A DATABASE. AAP §0.6.5.2 records that no legacy
 * test exists for any of the four data-access components, so every test of this adapter is net-new,
 * the legacy repository ships no mocking library, and the CFML runtime cannot be reproduced in this
 * environment — the local development setup the plan cites does not exist and the legacy test
 * framework is not vendored, so the legacy suite cannot even be run for comparison. The consequence
 * for design is that the statement has to be checkable as a value: a test asserts that it names only
 * physical tables, that it carries both derived aliases, that its ordering has exactly one term, and
 * that it contains no value placeholder — none of which needs a connection.
 *
 * THIS IS NOT A REPOSITORY MEMBER AND DOES NOT WIDEN THE PORT. `ProductTypeRepository` declares one
 * method and this class implements exactly that one; a module-level constant is not part of the
 * interface, and no consumer needs it in order to use the repository.
 *
 * IT IS ALSO NOT A CACHE. It holds statement text, not rows. See the FALSEHOOD #1 annotation in the
 * file header, which draws that line explicitly, because this constant is the thing most likely to be
 * mistaken for the beginning of one.
 */
export const PRODUCT_TYPE_TREE_STATEMENT: string = composeProductTypeTreeStatement();

/**
 * The bound-value list for {@link PRODUCT_TYPE_TREE_STATEMENT}: empty, and passed rather than omitted.
 *
 * The legacy statement interpolates nothing and binds nothing, so there is genuinely no value to
 * bind. Two things follow, and both are requirements rather than stylistic choices:
 *
 *   - The argument is still SUPPLIED. The execution contract takes a statement and its values, and
 *     handing it an empty list keeps every read in this folder on one code path. A member that
 *     omitted it would be a second path, and second paths are how the client-side text-substitution
 *     member — the one this port never reaches — gets reintroduced.
 *   - Binding nothing is NOT a reason to reach for that other member. Prepared execution with an
 *     empty bound list is exactly as correct as prepared execution with a full one, and the security
 *     property of this folder comes from there being a single execution path rather than from care
 *     taken at each call site (AAP §0.7.3 S2).
 *
 * Frozen because an empty list is a constant, and a shared mutable array reachable from two
 * invocations of a warm container is a defect waiting to be written by someone who assumed otherwise.
 */
export const PRODUCT_TYPE_TREE_BOUND_VALUES: readonly unknown[] = Object.freeze([]);

/* ================================================================================================
 * THE ADAPTER
 * ============================================================================================== */

/**
 * The MySQL implementation of `ProductTypeRepository`.
 *
 * ONE MEMBER, AND THE MEMBER SET IS CLOSED. `model/dao/ProductTypeDAO.cfc` declares exactly one
 * member across all 68 of its lines, and unlike `model/dao/SkuDAO.cfc` — whose two private helpers sit
 * in tag syntax at `model/dao/SkuDAO.cfc:L204` and `:L222`, where a scan for script-syntax
 * declarations misses them — this component is uniformly script, so nothing is concealed. The
 * temptations to complete the surface are enumerated here so that each absence reads as a decision:
 *
 *   - No single-product-type read, no factory member and no paginated-list member. Those resolved at
 *     run time through the framework's missing-method dispatch (IR-1,
 *     `org/Hibachi/HibachiService.cfc:L255-L281`) and AAP §0.4.2.5 declares the single read on
 *     `ProductService`, not on this repository.
 *   - No save member and no delete member. Both are declared explicitly on `ProductService` at
 *     `model/service/ProductService.cfc:L294`, and persistence goes through the injected base service
 *     rather than through a bespoke member here.
 *   - Nothing that reads inherited attribute-set assignments. That is defect D21 at
 *     `model/entity/ProductType.cfc:L92-L98`, boundary-stubbed in the domain layer, reaching an
 *     excluded domain family.
 *   - No counting, listing, exporting or process member. AAP §0.4.2.5 is explicit that the framework's
 *     synthesised surface "is not reproduced wholesale, only where used".
 *   - No repository for any excluded domain family.
 *
 * DEPENDENCY INJECTION IS EXPLICIT AND THE DEPENDENCY IS THE INTERFACE (AAP §0.7.3 S3). The single
 * constructor parameter is the narrow execution contract, not the concrete execution boundary that
 * implements it. That is what makes this class testable with a plain object literal that records the
 * statement and the bound list and returns canned rows — no mocking library, no connection, no
 * container. It is also what satisfies mismatch M6: hand it a transaction-scoped executor and this
 * read runs inside that transaction, seeing writes it has not yet committed.
 *
 * This replaces the dependency-injection property at `model/service/ProductService.cfc:L54` and the
 * accessor synthesised for it, which resolved by name at run time (AAP §0.4.3.1 rule R1 and §0.4.3.2
 * rule R2). Nothing here looks a collaborator up by string, and nothing here inherits behaviour: the
 * legacy component's `extends="HibachiDAO"` at `model/dao/ProductTypeDAO.cfc:L49` becomes composition,
 * and the framework members the legacy inherited but never used are simply not present (AAP §0.8.3.2 —
 * the framework is a boundary to extract from, never carried forward).
 *
 * @example
 * ```ts
 * // Wired in the composition root, which supplies the executor it already built.
 * const productTypes = new MySqlProductTypeRepository(executor);
 * for (const row of await productTypes.findAllForTree()) {
 *   // `row.isAssigned` is how MANY products use this product type, 0..N — never a yes-or-no answer.
 *   report(row.productTypeName, row.isAssigned, row.childCount);
 * }
 * ```
 */
export class MySqlProductTypeRepository implements ProductTypeRepository {
  /**
   * The injected execution contract.
   *
   * `private readonly`: nothing replaces it and nothing outside can reach around it, so no code path
   * in this class can end up on a connection this repository resolved for itself. Its lifetime belongs
   * to whatever supplied it, which is what preserves connection reuse across warm invocations.
   */
  private readonly executor: SqlExecutor;

  /**
   * @param executor - the contract every statement in this folder runs through, supplied by the
   *   composition root. This class never builds a pool, never reads a credential and never resolves a
   *   connection target.
   */
  public constructor(executor: SqlExecutor) {
    this.executor = executor;
  }

  /**
   * Returns every product type, each carrying its assigned-product count and its immediate-child
   * count.
   *
   * Legacy origin: `model/dao/ProductTypeDAO.cfc:L52`, whose statement is assembled at `:L54-L62` and
   * executed at `:L64`. The translation is one-for-one and the whole method is visible below, which is
   * the honest shape of this port: the legacy member is a statement and a return, and so is this one.
   *
   * NO ARGUMENT, BY PRESERVATION. `model/dao/ProductTypeDAO.cfc:L52` declares none and the statement
   * carries no predicate on its outer query — no active-flag filter, no published-flag filter, no
   * parent restriction and no upper bound on rows. Every row of the product-type table is returned,
   * and no filter, sort key, page size or maximum-results parameter is offered here, because offering
   * one would invent a capability the source does not have (AAP §0.7.3 S9, IR-12). A caller wanting a
   * subset filters the resolved array.
   *
   * NO BOUND VALUE, AND THE EMPTY LIST IS STILL PASSED. See
   * {@link PRODUCT_TYPE_TREE_BOUND_VALUES} — binding nothing keeps this on the single prepared
   * execution path rather than becoming a reason to leave it.
   *
   * TODO(parity) `model/dao/ProductTypeDAO.cfc:L51` and `:L63` — TWO LEGACY COMMENTS MISDESCRIBE WHAT
   * THIS RETURNS, AND BOTH ARE CARRIED RATHER THAN CORRECTED. The hint advertises caching that the
   * component does not perform, and the trailing comment calls a flat alphabetical ordering a tree.
   * Both are annotated in full in the file header. The two consequences for anyone editing this
   * method: it must issue a statement on every call, and it must not touch the ordering.
   *
   * TODO(parity) `model/dao/ProductTypeDAO.cfc:L55-L57` — `isAssigned` IS A COUNT AND NOT A FLAG. The
   * rows this method resolves carry a number from zero through N in that field. It is not coerced,
   * compared or renamed anywhere on this path. Full reasoning in the file header.
   *
   * TR-1 TIGHTENING, RECORDED. The legacy member declares `returntype="query"` at
   * `model/dao/ProductTypeDAO.cfc:L52` and returns the untyped, column-oriented, row-indexed query
   * object that `:L53` created. This narrows that to `Promise<ProductTypeTreeRow[]>` — a row-oriented
   * array of typed rows. Same rows, same values, same order; a different access idiom, and two derived
   * columns that are now named fields with declared types. TR-1 sanctions exactly this kind of
   * tightening provided it is recorded, and this note is the record. The member resolving rather than
   * returning synchronously is the same category of change: a CFML query blocks the request thread
   * whereas the driver here is asynchronous, which is idiom and not behaviour.
   *
   * ERROR HANDLING IS DELEGATED, DELIBERATELY, AND EVERY FAILURE MODE HAS A NAMED OWNER. This method
   * catches nothing, and that is a decision rather than an omission — each failure is already reported
   * by the collaborator that detects it, with its own context attached, and wrapping them here would
   * replace a precise report with a vaguer one and lose the originating detail:
   *   - An identifier outside the extracted schema is refused by the whitelists at module evaluation,
   *     before any instance of this class exists.
   *   - Blank statement text, a value that is not a bindable scalar, and a driver answer that is not a
   *     list of rows are all reported by the execution boundary. The last of those matters: a
   *     non-row answer raises rather than degrading to an empty list, so "nothing found" is never
   *     reported for a statement that read nothing.
   *   - A column whose value does not match its declared field, and either derived count arriving
   *     absent or non-numeric, are reported by the row mapper. A count aggregate cannot be null, so an
   *     absent one means the projection handed in is not this projection — and substituting zero there
   *     would report "no products assigned" for every product type, a wrong answer no isolated test of
   *     the mapper would catch.
   * There is consequently no failure this method can describe better than its collaborators already
   * do, and no invented message is introduced here.
   *
   * @returns Every product type in flat alphabetical order by name, each row carrying its two derived
   *   counts. Possibly empty; never null and never undefined. The array is a snapshot of one read —
   *   nothing retains it, and two calls are two independent reads that need not agree.
   * @throws {DomainError} When the execution boundary or the row mapper rejects what it was given, per
   *   the ownership list above.
   */
  public async findAllForTree(): Promise<ProductTypeTreeRow[]> {
    const rows = await this.executor.execute(
      PRODUCT_TYPE_TREE_STATEMENT,
      PRODUCT_TYPE_TREE_BOUND_VALUES,
    );

    return mapRows(rows, mapProductTypeTreeRow);
  }
}
