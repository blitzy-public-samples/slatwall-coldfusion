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
 * `src/ports/repositories/SkuRepository.ts`, which is the single place that records the plan's frozen
 * D1-D21 range and every entry the port minted beyond it. It also
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
import { createSlatwallUUID } from '../../util/uuid';
import { DomainError } from '../../errors/DomainError';
import { mapProductTypeTreeRow, mapRows, readHydratedParentProductTypeID } from './rowMappers';

import type { ProductType } from '../../domain/product/ProductType';
import type { SqlExecutor } from './QueryRunner';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../ports/repositories/ProductTypeRepository';
import type { AccountContextPort } from '../../ports/AccountContextPort';

/**
 * The statement surface this repository needs, now that it writes as well as reads.
 *
 * ⭐ WIDENED FROM `SqlExecutor` TO CLOSE REVIEW FINDING 3. The read-only surface carries `execute`
 * only, so a write member could not be expressed against it at all. This is the FIFTH declaration of
 * the same two-member seam — after `SkuStatementExecutor`, `BrandStatementExecutor`,
 * `ProductStatementExecutor` and `UnitOfWork`'s `TransactionalSqlExecutor` — and it is declared here
 * for the same reason the others are declared where they are: a repository names the surface IT needs,
 * so a test can satisfy it with a plain object literal and nothing has to import a sibling adapter.
 * `QueryRunner` satisfies all five structurally.
 */
export interface ProductTypeStatementExecutor extends SqlExecutor {
  /**
   * Runs a data-modifying statement and returns the number of rows it AFFECTED.
   *
   * Matches `QueryRunner.executeMutation`, the port of the legacy `save()` and `delete()` primitives at
   * `org/Hibachi/HibachiDAO.cfc:L48-L67` and `:L69-L77`. See `MySqlBrandRepository`'s equivalent
   * declaration for why an UPDATE's count is not a reliable success signal and is therefore not read as
   * one here either.
   */
  executeMutation(sql: string, parameters: readonly unknown[]): Promise<number>;
}

/* ================================================================================================
 * THE WRITE-SIDE TABLE AND COLUMN NAMES
 *
 * Separate module constants rather than the locals the tree statement builds at its own point of use,
 * because these are read by two members and a shared name cannot drift between them. Every one is
 * validated through `assertColumnName` / `assertTableName`, so an identifier reaches statement text only
 * after being checked — the same discipline R4 imposes everywhere identifiers cannot be bound.
 * ============================================================================================== */

const PRODUCT_TYPE_WRITE_TABLE = assertTableName('SwProductType');

/**
 * Every `SwProductType` column the port writes, keyed by its legacy property name.
 *
 * Mirrors `mapProductTypeRow` in `./rowMappers` column for column, with ONE addition: the
 * `parentProductTypeID` foreign key. The read mapper deliberately resolves no association — RULE 3
 * there — but a WRITE that omitted the key would silently discard the hierarchy, because the FK column
 * IS where the parent link lives. The asymmetry is intentional and is the reason it is called out.
 *
 * Sources: `model/entity/ProductType.cfc:L52-L59` for the scalars, `:L62` for the parent key, `:L80`
 * for the remote identifier and `:L83-L86` for the audit columns.
 */
const PRODUCT_TYPE_WRITE_COLUMN = Object.freeze({
  productTypeID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeID'),
  productTypeIDPath: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeIDPath'),
  activeFlag: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'activeFlag'),
  publishedFlag: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'publishedFlag'),
  urlTitle: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'urlTitle'),
  productTypeName: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeName'),
  productTypeDescription: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeDescription'),
  systemCode: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'systemCode'),
  parentProductTypeID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'parentProductTypeID'),
  remoteID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'remoteID'),
  createdDateTime: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'createdDateTime'),
  createdByAccountID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'createdByAccountID'),
  modifiedDateTime: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'modifiedDateTime'),
  modifiedByAccountID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'modifiedByAccountID'),
} as const);

/**
 * The writable columns, in one fixed order, excluding the identifier.
 *
 * The identifier is handled separately because an insert LISTS it while an update MATCHES on it. The
 * order is arbitrary but must be stable: the value array below is built by walking the same sequence,
 * so a column added to one list and not the other is a compile error rather than a shifted binding.
 */
const PRODUCT_TYPE_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  /** `:L53` — the materialised ancestry path, comma-delimited, root first and self last. */
  PRODUCT_TYPE_WRITE_COLUMN.productTypeIDPath,
  /** `:L54`. */
  PRODUCT_TYPE_WRITE_COLUMN.activeFlag,
  /** `:L55`. */
  PRODUCT_TYPE_WRITE_COLUMN.publishedFlag,
  /** `:L56` — `unique="true"`; the constraint is the column's, and IR-5 checks it in code as well. */
  PRODUCT_TYPE_WRITE_COLUMN.urlTitle,
  /** `:L57`. */
  PRODUCT_TYPE_WRITE_COLUMN.productTypeName,
  /** `:L58`. */
  PRODUCT_TYPE_WRITE_COLUMN.productTypeDescription,
  /** `:L59` — the discriminator whose three seeded values IR-7 pins. */
  PRODUCT_TYPE_WRITE_COLUMN.systemCode,
  /** `:L62` — the `fkcolumn` of the `parentProductType` many-to-one. */
  PRODUCT_TYPE_WRITE_COLUMN.parentProductTypeID,
  /** `:L79`. */
  PRODUCT_TYPE_WRITE_COLUMN.remoteID,
  /** `:L82`. */
  PRODUCT_TYPE_WRITE_COLUMN.createdDateTime,
  /** `:L83` — field `createdByAccount`, column `createdByAccountID`; the pairing is crossed. */
  PRODUCT_TYPE_WRITE_COLUMN.createdByAccountID,
  /** `:L84`. */
  PRODUCT_TYPE_WRITE_COLUMN.modifiedDateTime,
  /** `:L85` — field `modifiedByAccount`, column `modifiedByAccountID`. */
  PRODUCT_TYPE_WRITE_COLUMN.modifiedByAccountID,
]);

/** The bound-parameter placeholder. `?` binds VALUES only and can never carry an identifier (R4). */
const PRODUCT_TYPE_BIND_PLACEHOLDER = '?';

/** The separator for a column list and for a `SET` clause. */
const PRODUCT_TYPE_CLAUSE_JOINER = ', ';

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
 *   - THE WILDCARD IS PRESERVED AS A WILDCARD, and the decision not to enumerate columns is
 *     deliberate. Enumerating them would change nothing observable, but it would assert a column list
 *     this file has no locator for, and the port's own reasoning already rejects that as fabrication.
 *     The row mapper hydrates by column name, so it reads whatever the wildcard supplies; a mapper
 *     that required an enumerated list would have coupled the two.
 *
 *     ⚠️ IT IS QUALIFIED — `SELECT SwProductType.*` — AND THE QUALIFICATION CHANGES NOTHING. The
 *     outer `FROM` names exactly one table, so bare `*` and `SwProductType.*` expand to precisely the
 *     same column set: the product-type table's own columns, and nothing else. Neither correlated
 *     subquery contributes a column to the outer projection, because a scalar subquery in a select
 *     list yields one VALUE under its alias rather than a table to expand. The qualified form is kept
 *     purely so that every table identifier the statement emits is one the schema whitelist approved
 *     and a reader can see it approved; the projection is the legacy projection either way.
 *   - BOTH DERIVED COLUMNS ARE CORRELATED SCALAR SUBQUERIES, EXACTLY AS THE LEGACY WRITES THEM, AND
 *     THIS IS THE ONE PLACE THE STATEMENT'S STRUCTURE COULD HAVE DRIFTED WITHOUT ANY SYMPTOM. Each is
 *     evaluated once per outer row, against the outer row's own identifier:
 *
 *       `isAssigned`  — `model/dao/ProductTypeDAO.cfc:L55-L57`, correlated on
 *                       `SwProduct.productTypeID = SwProductType.productTypeID`
 *       `childCount`  — `model/dao/ProductTypeDAO.cfc:L58-L60`, correlated on
 *                       `spt.parentProductTypeID = SwProductType.productTypeID`, where `spt` is the
 *                       legacy's own alias for the self-reference
 *
 *     ⛔ A PRE-AGGREGATED REWRITE IS FORBIDDEN HERE, EVEN THOUGH IT WOULD COMPUTE THE SAME NUMBERS.
 *     Replacing both subqueries with `GROUP BY` derived tables, two `LEFT JOIN`s and two `COALESCE`
 *     wrappers yields identical values and identical row multiplicity — a `GROUP BY` produces at most
 *     one row per key — and is still not permitted, for reasons that have nothing to do with the
 *     answer: AAP §0.4.1.7 specifies "its `isAssigned` and `childCount` SUBSELECTS"; AAP §0.8.2
 *     Guideline 4 forbids optimising beyond what the migration requires; and AAP §0.3.3.1 settled the
 *     identical question for the sibling statement in `./MySqlSkuRepository.ts` by keeping N correlated
 *     `EXISTS` clauses "rather than an `IN` list or a `GROUP BY … HAVING COUNT` rewrite". Moving the
 *     evaluation point from once-per-outer-row to once-per-statement is a PERFORMANCE change, which is
 *     the single category of change this port has no licence to make.
 *
 *     ⛔ ALSO FORBIDDEN, AND NEVER PRESENT: joining the base tables directly and aggregating in the
 *     outer query — `LEFT JOIN SwProduct ON … GROUP BY SwProductType.productTypeID`. That fans the
 *     product-type row out once per product before grouping, and with two such joins the fan-outs
 *     multiply, so each count is inflated by the other's cardinality. It changes the values as well as
 *     the row multiplicity.
 *
 *     NO `COALESCE` IS NEEDED, AND ADDING ONE WOULD BE NOISE. A `count(...)` aggregate over a
 *     correlated subquery returns 0 when the predicate matches nothing and can never be NULL, so the
 *     row mapper's requirement that both counts arrive as numbers is satisfied by the aggregate
 *     itself. Both aliases are preserved exactly, and `isAssigned` remains the count-not-flag misnomer
 *     the file header records.
 *   - THE ORDERING IS THE SINGLE LEGACY SORT TERM, AND IS LEFT UNQUALIFIED. See FALSEHOOD #2 in the
 *     file header for why the term itself must not be "improved". It stays unqualified because it is
 *     unambiguous: the outer query has exactly one table in scope, so `productTypeName` can only be
 *     that table's column. A reviewer comparing this line against `model/dao/ProductTypeDAO.cfc:L62`
 *     therefore sees no difference at all, which is the point.
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

  /*
   * `model/dao/ProductTypeDAO.cfc:L55-L57` — the assigned-product count, as a CORRELATED SCALAR
   * SUBQUERY. The counted column, the scanned table and the correlation predicate are all the legacy's,
   * with only the two table names translated to their physical form per the D22 annotation. The
   * predicate reaches OUT to the outer query's product-type identifier, which is what makes it
   * correlated and what makes it evaluate once per outer row.
   */
  const assignedProductCount =
    `(SELECT count(${productTable}.${productId})\n` +
    `      FROM ${productTable}\n` +
    `     WHERE ${productTable}.${productProductTypeId} =` +
    ` ${productTypeTable}.${productTypeId})`;

  /*
   * `model/dao/ProductTypeDAO.cfc:L58-L60` — the immediate-child count, likewise correlated. The
   * legacy's own self-reference alias is carried verbatim, and the predicate compares the aliased
   * inner reference's parent key against the outer row's identifier. One generation only: nothing here
   * walks the hierarchy transitively.
   */
  const childProductTypeCount =
    `(SELECT count(${SELF_REFERENCE_ALIAS}.${productTypeId})\n` +
    `      FROM ${productTypeTable} ${SELF_REFERENCE_ALIAS}\n` +
    `     WHERE ${SELF_REFERENCE_ALIAS}.${parentProductTypeId} =` +
    ` ${productTypeTable}.${productTypeId})`;

  return (
    `SELECT ${productTypeTable}.*,\n` +
    `  ${assignedProductCount} as ${IS_ASSIGNED_ALIAS},\n` +
    `  ${childProductTypeCount} as ${CHILD_COUNT_ALIAS}\n` +
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
 * A SECOND COPY OF THE PERSISTENCE IDENTIFIERS STOOD HERE AND HAS BEEN REMOVED.
 * ================================================================================================
 * It declared `PRODUCT_TYPE_TABLE`, `PRODUCT_TYPE_ID_COLUMN` and a second
 * `PRODUCT_TYPE_WRITABLE_COLUMNS` listing the same thirteen columns in the same order, spelled as
 * `assertColumnName(PRODUCT_TYPE_TABLE, ...)` rather than through {@link PRODUCT_TYPE_WRITE_COLUMN}.
 * Both tables resolved to `assertTableName('SwProductType')`, so the two lists held identical values —
 * but the duplicate name made the module fail to compile, and `PRODUCT_TYPE_ID_COLUMN` had no reader at
 * all. The surviving copy is the one above, because {@link PRODUCT_TYPE_WRITE_COLUMN} is independently
 * read for the primary key by the insert, the update and both `WHERE` clauses, so it cannot be the copy
 * that goes. The per-column `model/entity/ProductType.cfc` line citations that lived here were the one
 * thing the survivor lacked, and they have been carried onto it entry by entry.
 * ============================================================================================== */

/*
 * ⛔ `PRODUCT_TYPE_MANY_TO_MANY_FIELDS` AND `clearProductTypeManyToManyCollections` WERE REMOVED.
 * They ported `org/Hibachi/HibachiService.cfc:L61` `removeAllManyToManyRelationships()` as an in-memory
 * sweep, and nothing called either of them — `removeProductType` below issues its DELETE and does not.
 *
 * ✅ THE CONCERN IS OWNED, AND OWNED ONE LAYER OVER. `./MySqlProductPersistence.ts` carries the judgment
 * call for this exact question and splits it on SCOPE rather than on convenience: link tables inside the
 * extracted slice are removed with STATEMENTS, while every excluded-family link table and cascade child
 * goes behind that module's declared `ProductDependencyCleanup` collaborator and is FLAGGED, which is what
 * TR-5 requires. `removeProductTypeDependencies` is the product-type arm of it.
 *
 * A third mechanism here would clear collections `src/domain/product/ProductType.ts` types with a
 * deliberately opaque element type precisely so that nothing in this port traverses them, and it would do
 * so without issuing any statement — so it could never have satisfied the foreign-key constraint the
 * legacy sweep existed to satisfy. The identical removal on the product side is recorded in
 * `./MySqlProductRepository.ts`.
 */

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
 *   - No SERVICE-level save or delete. `saveProductType` is declared explicitly on `ProductService` at
 *     `model/service/ProductService.cfc:L294` with its URL-title derivation, its by-reference payload
 *     mutation and its parent-inheritance step, and it reaches persistence through the injected base
 *     service. None of that is duplicated here.
 *
 *     ⭐ WHAT *IS* HERE ARE THE TWO DATA-ACCESS PRIMITIVES THAT BASE SERVICE THEN CALLS.
 *     `model/service/HibachiService.cfc:L86` delegates to `org/Hibachi/HibachiService.cfc`, whose save
 *     reaches `getHibachiDAO().save()` [`org/Hibachi/HibachiDAO.cfc:L48-L67`] and whose delete reaches
 *     `getHibachiDAO().delete()` [`:L69-L77`] at `org/Hibachi/HibachiService.cfc:L64`. Those two
 *     primitives are data access, so this file is where they belong — as
 *     {@link MySqlProductTypeRepository.persistProductType} and
 *     {@link MySqlProductTypeRepository.removeProductType}. They are declared on the CLASS and left off
 *     `ProductTypeRepository`, whose inventory AAP §0.4.1.6 closes at the single tree read, because
 *     `src/services/BaseService.ts` consumes them through its one-member `EntityPersister` and
 *     `EntityRemover` callbacks rather than through a repository reference. The port does not change and
 *     no generic CRUD port is invented.
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
 * const productTypes = new MySqlProductTypeRepository(executor, accountContext);
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
   *
   * Typed as the READ-PLUS-WRITE pair `QueryRunner.ts` declares once, because the save and delete
   * primitives below issue data-modifying statements and the reading member cannot carry them — it
   * normalises a driver answer into rows and raises when the driver replies with a write
   * acknowledgement. A `TransactionScope` hands out exactly this shape, which is what lets the probe
   * and the write inside one save run on one connection (M6).
   */
  private readonly executor: ProductTypeStatementExecutor;

  /** @see MySqlProductTypeRepository.constructor */
  private readonly accountContext: AccountContextPort;

  /**
   * @param executor - the contract every statement in this folder runs through, supplied by the
   *   composition root. This class never builds a pool, never reads a credential and never resolves a
   *   connection target.
   */
  /**
   * @param executor - Issues every statement this adapter composes.
   * @param accountContext - Resolves the acting account for the audit block the write seam stamps.
   *   Required rather than optional: `model/entity/ProductType.cfc:L305-L313` overrides both ORM
   *   lifecycle hooks and delegates to the framework audit block, so a write that cannot name an actor
   *   could not reproduce the legacy write. The port answers `undefined` for an unauthenticated request,
   *   which the stamping functions accept, so "no actor" is expressed as a legitimate ANSWER rather than
   *   as a missing collaborator.
   */
  public constructor(executor: ProductTypeStatementExecutor, accountContext: AccountContextPort) {
    this.executor = executor;
    this.accountContext = accountContext;
  }

  /**
   * Returns an equivalent {@link MySqlProductTypeRepository} bound to a DIFFERENT statement executor.
   *
   * ⭐ THIS IS THE FIX FOR REVIEW FINDING 2, AND THE DEFECT IT CLOSES WAS STRUCTURAL. Every repository
   * in this folder captures its executor at construction, which is correct — but while that was the ONLY
   * way to supply one, an executor chosen at construction time was necessarily the POOL-bound one, and
   * no later act could change it. Wrapping a service call in `UnitOfWork.run` therefore did nothing
   * useful: the boundary acquired a connection, began a transaction, and handed out a scope executor
   * that this class had no way to adopt, so every read and write still went to the pool and straight out
   * of the transaction. Rollback-on-errors and M6's same-connection read-back visibility were
   * unreachable no matter how the graph was wired.
   *
   * Re-binding closes that. Inside a boundary a caller re-binds this repository to `scope.executor` and
   * uses the result for the duration of the boundary; every statement the returned instance issues then
   * runs on the connection the boundary owns.
   *
   * ⚠️ A NEW INSTANCE, NOT A MUTATION, AND THE DIFFERENCE IS THE POINT. The captured executor stays
   * `private readonly` and this method never reassigns it, so the pool-bound instance a composition root
   * built is still valid and still pool-bound after the call. Mutating it in place would make the
   * repository's connection depend on WHEN it was used rather than on WHICH instance was used — an
   * ambient current-transaction slot in all but name, which is exactly what
   * `src/adapters/mysql/UnitOfWork.ts` refuses to keep (M7, AAP 0.7.3 S3). Two concurrent boundaries on
   * one warm container get two instances and cannot observe each other's connection.
   *
   * ⚠️ IT IS NOT ON THE PORT INTERFACE, AND MUST NOT BE PUT THERE. A service may not know that a
   * statement executor exists at all (AAP 0.7.3 S2 inverted), so re-binding is exposed on the CONCRETE
   * adapter and used only by the layer that already holds concrete adapters. Adding it to the port would
   * leak the persistence mechanism into `src/services/**`.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns A new instance identical in every other respect.
   */
  public withExecutor(executor: ProductTypeStatementExecutor): MySqlProductTypeRepository {
    return new MySqlProductTypeRepository(executor, this.accountContext);
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

  /**
   * The writable column values, in exactly the order {@link PRODUCT_TYPE_WRITABLE_COLUMNS} lists them.
   *
   * An absent optional field becomes `null` rather than being dropped from the statement. Omitting it
   * would let the database apply its own column default, which is a DIFFERENT outcome from storing the
   * absence the entity actually holds — and on an update it would silently leave a stale value in place.
   *
   * The audit values are written exactly as the entity carries them. Stamping created and modified
   * values is the entity lifecycle's job, not this adapter's; duplicating it here would give one rule two
   * disagreeing implementations. Note that `createdByAccount` and `modifiedByAccount` are declared
   * many-to-one at `model/entity/ProductType.cfc:L84` and `:L86` but are carried on the domain type as
   * the identifier itself, which is what `assignAuditColumns` in `./rowMappers` reads back.
   */
  private collectWritableValues(productType: ProductType): readonly unknown[] {
    return [
      productType.productTypeIDPath ?? null,
      productType.activeFlag ?? null,
      productType.publishedFlag ?? null,
      productType.urlTitle ?? null,
      productType.productTypeName ?? null,
      productType.productTypeDescription ?? null,
      productType.systemCode ?? null,
      /* The hierarchy lives in this key. The association comes first, mirroring the mapping
       * declaration at `model/entity/ProductType.cfc:L62`.
       *
       * ⭐ AND THE PRESERVED FOREIGN KEY IS THE FALLBACK, WHICH IS WHAT CLOSES THE ROUND TRIP. This
       * expression used to end at `?? null`, so a product type READ through `./rowMappers.ts` — which
       * leaves `parentProductType` unhydrated on purpose, because an identifier-only parent would make
       * `ProductType.getSimpleRepresentation` return `undefined` and empty the feed's `g:product_type`
       * element — was written back with `NULL` here and silently DETACHED from its parent. Rule 3b in
       * `./rowMappers.ts` preserves the row's key beside the entity for exactly this read, so the
       * association still wins whenever one is resolved and the column is nulled only when there is
       * genuinely no parent to record. A caller that means to detach a hydrated child calls
       * `forgetHydratedParentProductTypeID` first; the same fallback is applied by
       * `./MySqlProductPersistence.ts`'s `collectProductTypeValues`, and both sites are named at the
       * rule 3b discussion. */
      productType.parentProductType?.productTypeID ??
        readHydratedParentProductTypeID(productType) ??
        null,
      productType.remoteID ?? null,
      productType.createdDateTime ?? null,
      productType.createdByAccount ?? null,
      productType.modifiedDateTime ?? null,
      productType.modifiedByAccount ?? null,
    ];
  }

  /**
   * Write one product type. See {@link ProductTypeRepository.saveProductType} for the contract and for
   * why this member has to exist at all.
   *
   * ⚠️ THE INSERT-OR-UPDATE DECISION COMES FROM THE ENTITY, NOT FROM A PROBE, AND THAT DIFFERS
   * DELIBERATELY FROM `MySqlSkuRepository.persistSku`. That member probes because a SKU can arrive
   * carrying an identifier for a row that does not exist yet — the combination engine assigns one and
   * hands the same entity back on a later pass. A product type reaches this member through
   * `ProductService.saveProductType`, which either populates a freshly constructed instance or one loaded
   * from a row, so `isNew()` answers the question exactly and a round trip would buy nothing. The
   * divergence is recorded rather than smoothed over, because two write members in one folder deciding
   * the same thing two ways is otherwise a reader's trap.
   *
   * ⛔ NO COMMIT, NO CASCADE, NO VALIDATION. All three belong to layers above; the port records why.
   */
  public async saveProductType(productType: ProductType): Promise<ProductType> {
    const isInsert = productType.isNew();

    /* The identifier `generator="uuid"` used to produce at flush time — assigned only while the entity
     * is transient, so an update keeps the identifier its stored row is keyed on. */
    if (isInsert) {
      productType.productTypeID = createSlatwallUUID();
    }

    /*
     * ==================================================================================================
     * THE ORM LIFECYCLE HOOK IS INVOKED HERE, WHICH DISCHARGES A DECLARED BOUNDARY ITEM (F03)
     * ==================================================================================================
     * `src/domain/product/ProductType.ts` carries a `TODO(boundary)` on these two hooks stating that in
     * the legacy they fire themselves and here they MUST be called, "immediately before the corresponding
     * INSERT and UPDATE". This is that call site. Hibernate invoked them as part of the flush the
     * framework triggered at request end (`org/Hibachi/Hibachi.cfc`, double `ormFlush()` gated on the ORM
     * reporting no errors, with `flushAtRequestEnd=false`); a stateless Lambda invocation has no ORM
     * session, no automatic flush and no request-end hook (mismatch M5, AAP §0.6.6), and
     * `src/services/BaseService.ts` explicitly declines the job and places it "behind `EntityPersister`",
     * which is this member.
     *
     * ⭐ THE ENTITY'S OWN HOOKS ARE CALLED, NOT THE FREE STAMPING FUNCTIONS, AND THE DIFFERENCE IS
     * MATERIAL RATHER THAN STYLISTIC. `model/entity/ProductType.cfc:L305-L313` OVERRIDES both hooks and
     * does two things in each: it rebuilds `productTypeIDPath` from the parent chain and only THEN calls
     * `super.preInsert()` / `super.preUpdate()` for the audit block. `productTypeIDPath` is one of the
     * columns this member writes, so calling only the audit functions would persist a stale ancestry
     * path for any product type that has been re-parented — and, as the note on the hooks records,
     * NOTHING WOULD FAIL LOUDLY. `MySqlProductRepository.saveProduct` calls the free functions instead,
     * correctly: `model/entity/Product.cfc` does NOT override the hooks, so a product only ever received
     * the framework block.
     *
     * ⚠️ THE ORDER IS FIXED: HOOK FIRST, COLLECT SECOND. `collectWritableValues` reads both
     * `productTypeIDPath` and the four audit fields off the entity, so invoking the hook afterwards would
     * compose the statement from pre-hook values and write exactly the stale row the hook exists to
     * prevent.
     *
     * ⚠️ `preUpdate`'s FIRST PARAMETER IS PASSED AS `undefined` DELIBERATELY. Hibernate supplied the
     * row's pre-image in `struct oldData`; no legacy body reads it, and this adapter has no pre-image to
     * offer — the update path composes a full-column assignment rather than a diff. Passing `undefined`
     * is therefore accurate, and fabricating a snapshot would imply a change-detection capability neither
     * system has.
     */
    /*
     * ⭐ RULE 3b, SECOND HALF — THE HOOK REBUILDS THE ANCESTRY PATH FROM THE ASSOCIATION THIS ADAPTER
     * DELIBERATELY LEAVES UNRESOLVED, SO THE REBUILD HAS TO BE ALLOWED TO FAIL SAFE.
     *
     * `ProductType.preInsert` / `preUpdate` port `:L306` and `:L311`, which recompute
     * `productTypeIDPath` by walking `parentProductType` to the root. Hibernate could always make that
     * walk, because the parent was loaded or lazily loadable inside the ORM session. This adapter has no
     * session and, under rule 3b in `./rowMappers.ts`, does not attach a parent — so for a HYDRATED
     * CHILD the walk finds no parent and yields the child's own identifier alone. Writing that would
     * FLATTEN the ancestry, and now that the parent column is preserved it would also leave the row
     * self-contradictory: a `parentProductTypeID` pointing at a parent that the path claims does not
     * exist. `ProductType.getBaseProductType` reads `listFirst` of this very path to find the root, so a
     * flattened path silently changes a product's discriminator.
     *
     * THE ROW ALREADY KNOWS THE ANSWER, WHICH IS WHY RESTORING IS CORRECT AND RECOMPUTING IS NOT. The
     * hydrated `productTypeIDPath` is the database's own value for the full chain; the grandparents it
     * names cannot be derived from the preserved key, which identifies only the immediate parent. So the
     * authoritative value is captured before the hook and put back exactly when the rebuild demonstrably
     * had nothing to walk while the row demonstrably HAS a parent.
     *
     * EVERY OTHER CASE STILL GETS THE HOOK'S VALUE, which is what keeps the re-parenting behaviour the
     * hook exists for: a resolved association means the walk was real, so the rebuild stands; a detach
     * that has forgotten its preserved key leaves nothing to restore, so the flattened path is the
     * correct one; and a genuine root records no key and rebuilds to its own identifier, which is what
     * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` seeds for all three.
     */
    const hydratedProductTypeIDPath = productType.productTypeIDPath;
    const preservedParentProductTypeID = readHydratedParentProductTypeID(productType);

    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      productType.preInsert(auditActor);
    } else {
      productType.preUpdate(undefined, auditActor);
    }

    if (
      productType.parentProductType === undefined &&
      preservedParentProductTypeID !== undefined &&
      hydratedProductTypeIDPath !== undefined
    ) {
      productType.productTypeIDPath = hydratedProductTypeIDPath;
    }

    const writableValues = this.collectWritableValues(productType);

    if (isInsert) {
      const columnList = [
        PRODUCT_TYPE_WRITE_COLUMN.productTypeID,
        ...PRODUCT_TYPE_WRITABLE_COLUMNS,
      ].join(PRODUCT_TYPE_CLAUSE_JOINER);
      const placeholders = [
        PRODUCT_TYPE_WRITE_COLUMN.productTypeID,
        ...PRODUCT_TYPE_WRITABLE_COLUMNS,
      ]
        .map(() => PRODUCT_TYPE_BIND_PLACEHOLDER)
        .join(PRODUCT_TYPE_CLAUSE_JOINER);

      await this.executor.executeMutation(
        `INSERT INTO ${PRODUCT_TYPE_WRITE_TABLE} (${columnList}) VALUES (${placeholders})`,
        [productType.productTypeID, ...writableValues],
      );

      return productType;
    }

    const assignments = PRODUCT_TYPE_WRITABLE_COLUMNS.map(
      (column) => `${column} = ${PRODUCT_TYPE_BIND_PLACEHOLDER}`,
    ).join(PRODUCT_TYPE_CLAUSE_JOINER);

    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TYPE_WRITE_TABLE} SET ${assignments} ` +
        `WHERE ${PRODUCT_TYPE_WRITE_COLUMN.productTypeID} = ${PRODUCT_TYPE_BIND_PLACEHOLDER}`,
      [...writableValues, productType.productTypeID],
    );

    return productType;
  }

  /**
   * Remove one product type. See {@link ProductTypeRepository.removeProductType} for the contract.
   *
   * ⚠️ A TRANSIENT PRODUCT TYPE IS REFUSED RATHER THAN TURNED INTO A STATEMENT, on exactly the reasoning
   * `MySqlBrandRepository.deleteBrand` records: an entity reporting itself new carries the empty unsaved
   * value from `model/entity/ProductType.cfc:L52`, so a removal keyed on it would compose
   * `WHERE productTypeID = ''` — a predicate matching nothing in a sound table and an arbitrary row in an
   * unsound one. The mapping layer would have raised on the same input, since a transient instance has no
   * persistent identity to remove. This is not a hardening: it refuses an input the legacy could not
   * express, rather than one it accepted.
   *
   * ⚠️ THE AFFECTED-ROW COUNT IS NOT READ. For a removal the count is exact, but the legacy primitive at
   * `org/Hibachi/HibachiDAO.cfc:L69-L77` is declared `void` and reports nothing, so a caller never learned
   * whether a row was present. Returning `void` keeps that contract, and it is what `EntityRemover`
   * declares.
   */
  public async removeProductType(productType: ProductType): Promise<void> {
    if (productType.isNew()) {
      throw new DomainError('A product type cannot be removed before it has been persisted.', {
        context: { productTypeName: productType.productTypeName },
      });
    }

    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TYPE_WRITE_TABLE} ` +
        `WHERE ${PRODUCT_TYPE_WRITE_COLUMN.productTypeID} = ${PRODUCT_TYPE_BIND_PLACEHOLDER}`,
      [productType.productTypeID],
    );
  }
}
