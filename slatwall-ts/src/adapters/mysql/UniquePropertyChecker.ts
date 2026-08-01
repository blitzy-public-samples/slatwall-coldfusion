/* ==================================================================================================
 * UniquePropertyChecker — APPLICATION-SIDE UNIQUENESS CHECKING FOR THE EXTRACTED CATALOG SLICE (IR-5)
 *
 * AUTHORITY. AAP 0.4.1.7 ("MySQL Adapters") names this file CREATE from `org/Hibachi/HibachiDAO.cfc`
 * and states the whole of its brief: reproduce "the existence query with its self-exclusion clause
 * ... including the observation that self-exclusion is a no-op on insert". IR-5 states the
 * requirement that brief serves — the check exists IN ADDITION TO the `unique="true"` column
 * metadata, so it is observable behaviour and not a redundant safeguard.
 *
 * LOCATOR, BYTE-VERIFIED. The legacy member spans `org/Hibachi/HibachiDAO.cfc:L130-L147`: the
 * author's hint sits at `:L129`, the declaration opens at `:L130`, its two arguments are declared at
 * `:L131` and `:L132`, the five accessor reads run `:L134-L138`, the statement is `:L140`, the
 * rows-found return is `:L142-L144`, the no-rows return is `:L146` and the closing tag is `:L147`.
 * AAP 0.4.1.7 cites the span one line short; the verified span is the one used throughout this file.
 * The immediate neighbour `getTableTopSortOrder`, which opens at `:L149`, is deliberately absent —
 * it is a sort-order query with nothing to do with uniqueness, and `../../ports/UniquePropertyPort`
 * records that exclusion so a reader can see it was considered rather than overlooked.
 *
 * --------------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL, GIVEN THE SCHEMA ALREADY CONSTRAINS MOST OF THESE COLUMNS
 * --------------------------------------------------------------------------------------------------
 * Because the legacy application does not rely on the schema to answer this question, and the
 * difference is visible to a caller. The check runs during the validation pass, so a collision
 * becomes a validation failure keyed to the offending property — a field-level error the caller can
 * render next to the input that caused it. Drop the check and the same collision instead surfaces as
 * a driver-level constraint violation raised from inside a save, with no property key, at a point
 * where the surrounding operation has already begun. That is a behaviour change, not an
 * implementation detail, which is precisely why IR-5 exists.
 *
 * This file answers exactly one question — "is this value already taken" — and answers it with a
 * boolean. It raises NO validation error and constructs NO error key. Keying is the validation
 * layer's job: `org/Hibachi/HibachiValidationService.cfc:L224`, `:L228` and `:L232` all report
 * against the FULL property identifier, while the name handed to this predicate is only that
 * identifier's trailing segment (`org/Hibachi/HibachiValidationService.cfc:L469`). Reconstructing the
 * key here would need the identifier this file is never given.
 *
 * --------------------------------------------------------------------------------------------------
 * THE TWO PROBES — TWO LEGACY SOURCES, TWO SHAPES, ONE SHARED POLARITY
 * --------------------------------------------------------------------------------------------------
 * The legacy tree contains TWO uniqueness probes, and this file ports both because both are reached
 * from the in-scope surface. They are not two spellings of one idea and neither delegates to the
 * other:
 *
 *   MEMBER                  LEGACY ORIGIN                          SELF-EXCLUSION   BOUND VALUES
 *   isUniqueProperty        org/Hibachi/HibachiDAO.cfc:L130-L147    YES  (`:L140`)   2
 *   isUrlTitleAvailable     model/dao/DataDAO.cfc:L115-L131         NO   (`:L123`)   1
 *
 * Collapsing them into one member — the obvious tidy-up, since both end in a row count — would
 * silently change WHICH ROWS EACH ONE SEES, because one excludes the row under edit and the other
 * does not. They are therefore kept apart, and each carries its own statement.
 *
 * WHAT THEY SHARE IS THEIR POLARITY, AND IT IS THE HIGHEST RISK IN THIS FILE. Both resolve `true`
 * when the value is FREE. `isUniqueProperty` resolves TRUE MEANS UNIQUE; `isUrlTitleAvailable`
 * resolves TRUE MEANS AVAILABLE. Inverting either is silent — no compile error, no type error, no
 * lint finding, no runtime exception — and the two failure modes differ:
 *
 *   - An inverted `isUniqueProperty` reports every colliding value as free, so every uniqueness rule
 *     in the slice passes when it should fail. Two of those rules have no schema constraint behind
 *     them to catch the mistake downstream (see DIVERGENCE, below).
 *   - An inverted `isUrlTitleAvailable` reports every candidate as taken, and the consuming loop at
 *     `model/service/DataService.cfc:L64` is `while(!unique)` with no ceiling, so the loop never
 *     terminates. Inverting it the other way instead skips the loop entirely and writes duplicates.
 *
 * A test that only exercises the non-colliding path passes under EITHER polarity, so the polarity is
 * asserted in both directions for both members.
 *
 * --------------------------------------------------------------------------------------------------
 * THE IN-SCOPE UNIQUENESS INVENTORY IS CLOSED — AND IT IS TWO DIFFERENT SETS
 * --------------------------------------------------------------------------------------------------
 * (a) ORM METADATA — IR-5's arithmetic. Exactly EIGHT properties in the whole system declare
 *     `unique="true"`, and FIVE of them belong to this slice:
 *
 *       model/entity/Product.cfc:L54       urlTitle
 *       model/entity/Product.cfc:L56       productCode
 *       model/entity/Sku.cfc:L54           skuCode
 *       model/entity/ProductType.cfc:L56   urlTitle
 *       model/entity/Brand.cfc:L55         urlTitle
 *
 *     The remaining three belong to entities outside this slice and are DELIBERATELY NOT NAMED here.
 *     AAP 0.2.2 draws the boundary, and completing the set — or generalising this class into a
 *     system-wide uniqueness service — would extend the port past it. The inventory is CLOSED AT
 *     FIVE, and that is a decision recorded rather than an omission.
 *
 * (b) DECLARATIVE VALIDATION — what actually dispatches through the predicate. Uniqueness is driven
 *     by the validation documents, not by the ORM metadata, and the two sets do not coincide. Within
 *     the in-scope documents there are SEVEN save-context `unique` rules:
 *
 *       model/validation/Product.json:L10      productCode
 *       model/validation/Product.json:L16      urlTitle
 *       model/validation/Sku.json:L11          skuCode
 *       model/validation/Brand.json:L5         urlTitle
 *       model/validation/Option.json:L3        optionCode
 *       model/validation/OptionGroup.json:L4   optionGroupCode
 *       model/validation/ProductType.json:L4   urlTitle
 *
 * TODO(parity) `model/validation/Option.json:L3` and `model/validation/OptionGroup.json:L4` declare
 * a save-context `unique` rule while `model/entity/Option.cfc` and `model/entity/OptionGroup.cfc`
 * declare NO `unique="true"` at all. For those two properties this predicate is the ONLY uniqueness
 * enforcement anywhere in the system: delete it and the constraint vanishes rather than degrading to
 * a database guarantee. Carried exactly as observed — no `unique="true"` is proposed, no schema
 * change is authored and no compensating behaviour is invented (AAP 0.7.3 S7 and S9).
 * `../../ports/UniquePropertyPort` records the same finding from the contract side.
 *
 * NEITHER MEMBER NARROWS ITS PROPERTY NAME TO A UNION drawn from those lists, because
 * `org/Hibachi/HibachiValidationService.cfc:L469` derives the name AT RUN TIME as the trailing
 * segment of a property-identifier path. A union cannot express a runtime-derived value, and would
 * make a type change the price of a configuration change. The enforcement is a runtime whitelist
 * instead — see the identifier discussion below.
 *
 * NO FORMAT RULE IS IMPLEMENTED HERE. Three of the seven rules above pair uniqueness with a separate
 * regular-expression constraint; that constraint belongs to `src/validation/rules/**` and is composed
 * with this verdict there. This file compiles no pattern and inspects no value's shape.
 *
 * --------------------------------------------------------------------------------------------------
 * IDENTIFIERS VERSUS VALUES — THE SPLIT THAT SURVIVES TRANSLATION (AAP 0.7.3 S2, TR-4)
 * --------------------------------------------------------------------------------------------------
 * A `?` placeholder binds a VALUE and can never substitute an IDENTIFIER (AAP 0.4.3.4), so the two
 * halves of each legacy statement translate differently and the split has to be respected exactly.
 *
 *   `org/Hibachi/HibachiDAO.cfc:L140`  — THREE interpolated identifiers (the entity name, the
 *                                        resolved property name, the primary-identifier property
 *                                        name) and TWO bound values.
 *   `model/dao/DataDAO.cfc:L122-L124`  — TWO interpolated identifiers (the column, twice, and the
 *                                        table) and ONE bound value.
 *
 * Every one of those identifiers is routed through `assertTableName` or `assertColumnName` from
 * `./QueryRunner`, which resolve against a closed whitelist harvested from the entity declarations
 * and REFUSE anything outside it. Every value becomes a `?`, bound positionally in the legacy order.
 * No statement text in this file is assembled from an unvalidated string, and no fragment of a
 * `WHERE` clause is ever built from caller input.
 *
 * NO EXCEPTION IS CLAIMED BY THIS FILE, AND NONE MAY BE. Interpolation of file-supplied values is
 * what triggered the plan's ONE declared departure from preserve-and-annotate, and that departure
 * belongs exclusively to `./MySqlProductRepository` (AAP 0.6.7.7), whose importer interpolates data
 * read out of an uploaded file. The identifiers here originate in the entity's own metadata and in a
 * caller-supplied table name checked against three literals — never in file content. Parameterising
 * here is ordinary standing compliance, not a declared exception, and must not be labelled as one.
 *
 * TODO(parity) D22 — `org/Hibachi/HibachiDAO.cfc:L140` INTERPOLATES THE **LOGICAL** ENTITY NAME, AND
 * THAT IS CORRECT AS WRITTEN. The statement is expressed over the mapped object graph, where a
 * `Slatwall`-prefixed name is the legitimate vocabulary; the prefixing itself happens at five sites
 * in that same file, `getSmartList` at `:L104-L106` among them. `getEntityName()`
 * (`org/Hibachi/HibachiEntity.cfc:L287`) returns that logical form, so `SlatwallProduct` and not
 * `SwProduct` is what arrives at this boundary. A native statement can only carry the physical name,
 * so the translation is a whitelist LOOKUP — never a prefix concatenation, which applied to a
 * physical name would fabricate a table that does not exist. `assertTableName` in ./QueryRunner
 * performs the normalisation and holds the whole name-mapping table; D22's register home is
 * ../../ports/repositories/SkuRepository, and this file neither owns the entry nor restates it. It
 * states the consequence and no more: never "fix" HQL entity names to `Sw*`, and never assume a
 * logical name works in native SQL.
 *
 * --------------------------------------------------------------------------------------------------
 * EXECUTION-MODEL MISMATCHES HONOURED HERE (AAP 0.7.3 S8)
 * --------------------------------------------------------------------------------------------------
 * M6 — THE VALIDATION READ-BACK LOOP, AND WHY THE EXECUTOR IS INJECTED RATHER THAN REACHED FOR.
 * AAP 0.6.2 identifies the slice's most dangerous behaviour: a validation rule that EXECUTES A QUERY
 * against rows the same operation is still writing. This file has exactly that exposure. A uniqueness
 * check running inside a save must observe the siblings already written in that transaction — the
 * combination engine at `model/service/SkuService.cfc:L58-L211` being the case that matters, where
 * whether row N's check sees rows 1..N-1 decides the outcome, and where the legacy answer is that it
 * does. Under the retired framework an ORM session supplied that visibility implicitly. Here it is
 * supplied by WHICH EXECUTOR IS HANDED IN: given a transaction-scoped one, the check sees the
 * uncommitted siblings; given the pool directly, it does not, and NOTHING WOULD WARN ANYONE. That is
 * why every statement in this file runs through the injected `SqlExecutor`, why no connection or pool
 * is reachable from inside this class, and why the choice of executor is the composition root's to
 * make. Flagged, not solved: the transaction boundary itself belongs to `./UnitOfWork`
 * (AAP 0.4.1.7), and no transaction handle, session object or unit-of-work parameter is added to
 * either signature below.
 *
 * M7 — NO CACHE OF ANY KIND. AAP 0.6.6 records that `cacheuse="transactional"` on 111 of 113 entities
 * has no clean single-invocation equivalent, and requires that memoisation be scoped to the request
 * object rather than to the module. Nothing is remembered here: no module-scope mutable state, no
 * memoised "already checked" set, no instance field accumulating verdicts. Every call issues its
 * statement. The two module-scope declarations below are frozen CONSTANTS, fully populated when the
 * module is evaluated and never written to again, which is a different thing entirely. The
 * prohibition extends to instance scope too, because the composition root wires an adapter once and
 * shares it — as the retired container did, making its data-access components singletons — so an
 * instance field would outlive the invocation exactly as a module field would.
 *
 * M8 — NOTHING HERE AWAITS A SETTING. `SettingResolverPort` is deliberately synchronous, and no
 * setting participates in a uniqueness verdict, so the two shapes never meet.
 *
 * --------------------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT DO (AAP 0.7.3 S3, S5, S9 and AAP 0.8.2 Guideline 4)
 * --------------------------------------------------------------------------------------------------
 *   - Constructs no connection and no pool, reads no credential and no deployment variable. Its one
 *     collaborator arrives as a typed constructor parameter. Contrast `model/dao/ProductDAO.cfc`,
 *     which builds a credential-reading connection three separate times inside the data-access layer
 *     itself, at `:L155-L158`, `:L329-L330` and `:L420`.
 *   - Reaches the driver only through the injected executor, whose single path is prepared
 *     execution. The driver's client-side-substitution member is never named in this file.
 *   - Adds no row cap to either statement. `org/Hibachi/HibachiDAO.cfc:L140` selects entities and
 *     tests their count; `model/dao/DataDAO.cfc:L122-L124` selects a column and tests its record
 *     count. NEITHER caps the rows returned, so neither does this file. Capping would be an
 *     optimisation beyond what the migration requires, and the shape of the emitted statement is what
 *     the tests assert.
 *   - Rewrites neither statement into an existence form for speed, and adds no index hint.
 *   - Normalises no compared VALUE: no case folding, no whitespace stripping, no collation override.
 *     The legacy compared the stored value raw, and a value normalised here would report a collision
 *     the database does not have — or miss one it does. (Identifier normalisation is a separate
 *     matter and belongs to the two assertions in `./QueryRunner`; values are untouched.)
 *   - Adds no ceiling to the unbounded consuming loop. See the note on the URL-title member.
 *   - Adds no retry, no backoff and no statement deadline; declares no dependency of its own beyond
 *     the closed set the manifest already pins; and states no capacity, latency or availability
 *     figure anywhere (IR-12).
 *
 * THIS FILE MINTS NO DEFECT AND NO MISMATCH IDENTIFIER, and no global closure claim is made here:
 * the register is stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus the
 * source extension D22 and the three contract corrections D23, D24 and D25, with no D26 or beyond;
 * and AAP 0.6.6's M1-M8 plus M9, with no M10 or beyond). It CITES D22, D18, M6, M7 and M8, and
 * records every other finding by `path:Lnnn` locator alone.
 * ================================================================================================
 * */

import { DomainError } from '../../errors/DomainError';
import { assertColumnName, assertTableName } from './QueryRunner';

import type { PhysicalTableName, SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type { UniquePropertyEntity, UniquePropertyPort } from '../../ports/UniquePropertyPort';

/**
 * The single column the URL-title probe may ever name.
 *
 * Both legacy call sites pin the probe's `column` argument to this one literal —
 * `model/service/DataService.cfc:L62` for the unsuffixed candidate and `:L67` for every suffixed
 * one — so the probe is NOT generalised to an arbitrary column. Generality the source does not have
 * would be an invention (AAP 0.7.3 S9), and it would also hand a caller a way to read any column of
 * any whitelisted table through a member whose name promises otherwise.
 *
 * Declared as a named constant rather than inlined twice so the value the statement emits and the
 * value the whitelist is documented against cannot drift apart. It is still passed through
 * `assertColumnName` on every call: this literal is the column the probe INTENDS, and the assertion
 * is what confirms the resolved table actually declares it and returns the exact casing the entity
 * declaration uses.
 */
const URL_TITLE_COLUMN = 'urlTitle';

/**
 * The three physical tables the URL-title probe may ever name.
 *
 * WHY THREE, AND WHY NOT ONE. Verified at every call site in the slice: `SwProduct` from
 * `model/service/ProductService.cfc:L269`, `SwProductType` from `:L297` and `:L299`, and `SwBrand`
 * from `model/service/BrandService.cfc:L70` and `:L72`. Three distinct tables, five call sites, one
 * algorithm.
 *
 * WHY THE CONSTRAINT LIVES HERE AND NOT IN THE PROBE'S PARAMETER TYPE. The consuming algorithm
 * declares its `tableName` parameter as a plain string deliberately, because a two-member union
 * would compile-break the product-type save path at `model/service/ProductService.cfc:L297`. THIS
 * SET IS THEREFORE WHERE THE THREE-VALUE CONSTRAINT IS ACTUALLY ENFORCED, and a fourth table is
 * refused rather than tolerated.
 *
 * WHY THE OTHER IN-SCOPE TABLES ARE ABSENT. The remaining entities of the slice declare no
 * `urlTitle` property at all, so admitting one of their tables would produce a statement naming a
 * column that does not exist — caught by `assertColumnName`, but caught one step too late to be
 * meaningful. The narrower brand-only question a brand caller asks is a separate member on the brand
 * repository, declared on its own port; it is not reachable from here and is not duplicated here.
 *
 * Typed `ReadonlySet<PhysicalTableName>` for two reasons. The element type makes each literal
 * below checked at COMPILE TIME against the seven tables the extracted schema declares, so a typo
 * cannot reach run time; and the read-only view means nothing can add a fourth table after load.
 * This is a constant, not a cache — it is fully populated when the module is evaluated and never
 * written to again, which is what keeps it clear of the M7 prohibition discussed in the module
 * header.
 */
const URL_TITLE_TABLES: ReadonlySet<PhysicalTableName> = new Set<PhysicalTableName>([
  'SwProduct',
  'SwProductType',
  'SwBrand',
]);

/**
 * The MySQL implementation of application-side uniqueness checking.
 *
 * It implements `UniquePropertyPort` and publishes ONE member beyond it — the URL-title probe, whose
 * legacy origin is a different component and whose shape is deliberately different. Both are
 * documented in THE TWO PROBES in the module header.
 *
 * DEPENDENCY INJECTION IS CONSTRUCTOR-ONLY (AAP 0.7.3 S3). One collaborator, arriving as one typed
 * parameter, wired once by the composition root. There is no service locator, no name-keyed lookup,
 * no dynamic member synthesis, no default parameter that would build an executor when a caller omits
 * one, and no pre-constructed instance exported from this module. Every one of those was a facility
 * the retired framework provided and this port replaces with a declaration.
 *
 * IT IS TESTABLE WITHOUT A DATABASE, WHICH IS NOT AN ACCIDENT (AAP 0.7.3 S6). Every adapter test in
 * this port is NET-NEW: no legacy data-access test exists for this slice, the legacy repository ships
 * no mocking library, and the CFML runtime cannot be reproduced in this environment. So the emitted
 * statement text and the bound parameter list have to be assertable directly, and they are — the
 * constructor accepts any object satisfying the one-member executor contract, including a plain
 * object literal that records what it was asked to run and answers with canned rows.
 *
 * @example
 * ```ts
 * // A complete test double: no mocking library, no database, no pool.
 * const calls: { sql: string; params: readonly unknown[] }[] = [];
 * const checker = new UniquePropertyChecker({
 *   execute(sql, params) {
 *     calls.push({ sql, params });
 *     return Promise.resolve([]);
 *   },
 * });
 *
 * // Resolves true — nothing matched, so the value is still free.
 * await checker.isUrlTitleAvailable('SwBrand', 'acme-tools');
 * ```
 *
 * @example
 * ```ts
 * // Wired once in the composition root, over whichever executor the caller's transaction scope
 * // demands (see M6 in the module header).
 * const checker = new UniquePropertyChecker(queryRunner);
 * const validator = buildProductValidator(checker);
 * ```
 */
export class UniquePropertyChecker implements UniquePropertyPort {
  /**
   * The injected execution boundary — the only way this class reaches a database.
   *
   * `private readonly`, so nothing outside can borrow it and nothing inside replaces it. Its
   * lifetime and its transaction scope belong to whoever supplied it, which is exactly the property
   * mismatch M6 depends on: hand in a transaction-scoped executor and a uniqueness check performed
   * mid-save observes the siblings that save has already written; hand in one bound to the pool and
   * it does not. The class cannot make that choice for the caller and deliberately does not try.
   */
  private readonly executor: SqlExecutor;

  /**
   * @param executor - the parameterized-execution boundary every statement runs through, supplied by
   *   the composition root. This class never builds one, never reads a credential and never resolves
   *   a connection target.
   */
  public constructor(executor: SqlExecutor) {
    this.executor = executor;
  }

  /**
   * Returns an equivalent {@link UniquePropertyChecker} bound to a DIFFERENT statement executor.
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
   *
   * ⭐ RE-BINDING MATTERS MORE HERE THAN ANYWHERE ELSE IN THE FOLDER. This is the read that AAP 0.6.2
   * describes: `Sku.hasUniqueOptions` and the `skuCode` uniqueness rule both run DURING a save, against
   * rows the same unit of work is still writing. Bound to the pool, this check cannot see them, so a
   * batch of SKUs would each be judged unique against a table that does not yet contain its siblings —
   * a silently different answer from the legacy, where the ORM session made the pending rows visible.
   * Bound to `scope.executor` it sees them. That is the whole of M6.
   */
  public withExecutor(executor: SqlExecutor): UniquePropertyChecker {
    return new UniquePropertyChecker(executor);
  }

  /**
   * Reports whether `propertyName` on `entity` still holds a value no OTHER row has taken.
   *
   * ⚠️ TRUE MEANS UNIQUE. `true` says the value is unique and the entity is therefore safe to save;
   * `false` says the value is ALREADY IN USE and the save must be rejected. The polarity is inverted
   * relative to the intuitive reading of a query result, and it is not inferred: the legacy body
   * resolves `false` when rows are found (`org/Hibachi/HibachiDAO.cfc:L142-L144`) and `true` when
   * none are (`:L146`); the author's own hint at `org/Hibachi/HibachiEntity.cfc:L327` says the same
   * in words; and `validate_unique` at `org/Hibachi/HibachiValidationService.cfc:L467-L470` confirms
   * it from the consumer side by returning this verdict UNMODIFIED as its own pass-or-fail answer.
   *
   * THE FIVE READS HAPPEN IN THE LEGACY ORDER, `:L134` through `:L138`. The order is preserved rather
   * than rearranged for readability because these are accessor calls on a caller-supplied object, so
   * the sequence is observable to anything that instruments them, and because reading them in source
   * order is what makes the mapping to the legacy body checkable line by line.
   *
   * SIGNATURE TIGHTENING, RECORDED PER TR-1. The legacy declaration is the loosest contract CFML can
   * express: `org/Hibachi/HibachiDAO.cfc:L130` states NO return type and NO access modifier, and
   * NEITHER argument carries a type attribute — `propertyName` at `:L131` and `entity` at `:L132` are
   * merely marked mandatory. The member name, the parameter count and the parameter order are
   * preserved exactly; the types are tightened to the OBSERVED contract, which two independent
   * in-repository declarations fix — the passthrough at `model/service/DataService.cfc:L166` and the
   * wrapper at `org/Hibachi/HibachiEntity.cfc:L328`, both declaring a boolean return and a string
   * property name. Tightening from "unconstrained" to "precisely what is used" removes no capability
   * a caller previously had, and it is recorded here rather than made silently.
   *
   * ⚠️ THE SELF-EXCLUSION TERM IS EMITTED UNCONDITIONALLY, AND ON AN INSERT IT IS A NO-OP.
   * TODO(parity) `org/Hibachi/HibachiDAO.cfc:L140` — the trailing inequality exists so a row being
   * EDITED does not collide with itself and report its own unchanged value as already taken. On an
   * insert there is no assigned identifier yet to exclude: a primary identifier in this port is a
   * plain string that has not been given a value, so the comparison holds for every stored row and
   * the term contributes nothing, leaving a plain existence test over the whole table. AAP 0.4.1.7
   * names this observation as one the implementation must reproduce, so the term is PRESERVED rather
   * than skipped on the insert path — the emitted statement is identical in both cases, and its shape
   * is what the tests assert. Two "improvements" are therefore refused: dropping the term when the
   * identifier is empty, which would change the emitted statement, and treating the empty identifier
   * as a database null, which would be far worse — an inequality against null is never satisfied, so
   * every row would be filtered out and EVERY value on the insert path would be reported unique. The
   * identifier is bound exactly as the entity supplied it.
   *
   * AN UNRECOGNISED PROPERTY NAME IS SURFACED, NEVER SWALLOWED. The name is resolved through the
   * entity's metadata first (`:L134`) and then checked against the columns the resolved table
   * declares. A name the table does not declare raises out of `assertColumnName`, which is the
   * behaviour the legacy metadata lookup has — it throws for an absent key rather than returning
   * nothing. The two resolutions a strict compiler makes tempting, asserting the value is present or
   * quietly answering "unique", are both refused: the first hides a real fault and the second lets a
   * duplicate through.
   *
   * THE COMPARED VALUE IS BOUND VERBATIM. It arrives typed as an unknown, because the legacy accessor
   * at `org/Hibachi/HibachiTransient.cfc:L466` is declared with the widest CFML type and the value
   * genuinely varies across the properties this predicate serves. It is passed straight into the
   * parameter list without coercion, formatting or normalisation, exactly as the legacy bound it.
   * Narrowing it to a scalar union HERE is deliberately avoided: `./QueryRunner` performs that
   * narrowing once, at the driver boundary, and states plainly that it does not export its union so
   * that callers cannot put a second copy of the decision in this folder. Its parameter list is
   * declared over unknown values for the same reason, so nothing is lost by respecting that — the
   * refusal of an unbindable value still happens, once, in the place that owns it.
   *
   * @param propertyName - the property to check, named as the validation rule names it — in practice
   *   the trailing segment of a property identifier, computed at run time by
   *   `org/Hibachi/HibachiValidationService.cfc:L469`, which is why it is not narrowed to a union.
   * @param entity - the entity being validated, supplying the value under test, the identifier the
   *   self-exclusion term compares against, and the three identifiers the statement names. Passed
   *   whole, per `org/Hibachi/HibachiDAO.cfc:L132`.
   * @returns `true` when the value is unique and the save may proceed; `false` when it is already in
   *   use. Never null, never undefined and never inverted.
   * @throws {DomainError} when the entity names a table outside the extracted schema, or a column its
   *   table does not declare, or when the value cannot be bound to a placeholder. In every case the
   *   refusal happens before or at the execution boundary and no verdict is fabricated.
   */
  public async isUniqueProperty(
    propertyName: string,
    entity: UniquePropertyEntity,
  ): Promise<boolean> {
    /*
     * `:L134-L138` — the five accessor reads, in the legacy order and under the legacy local names,
     * so this block reads as a transcription of the original rather than as a paraphrase of it.
     */
    const property = entity.getPropertyMetaData(propertyName).name;
    const entityName = entity.getEntityName();
    const entityID = entity.getPrimaryIDValue();
    const entityIDproperty = entity.getPrimaryIDPropertyName();
    const propertyValue: unknown = entity.getValueByPropertyIdentifier(propertyName);

    /*
     * The three identifiers of `:L140`, each resolved against the closed schema whitelist before any
     * statement text exists. `assertTableName` is also where D22 is discharged: it accepts the
     * logical name this entity reports and emits the physical name a native statement requires.
     */
    const table = assertTableName(entityName);
    const column = assertColumnName(table, property);
    const idColumn = assertColumnName(table, entityIDproperty);

    /*
     * `:L140`, translated. The predicate is carried across term for term, the alias is carried so the
     * two read as one statement in two dialects, and the self-exclusion term is unconditional.
     *
     * ⚠️ THE PROJECTION IS A CONSTANT AND THE READ STOPS AT ONE ROW, WHERE THE LEGACY SELECTED WHOLE
     * ENTITIES AND READ ALL OF THEM. This is a structural change and it changes no answer, which is
     * provable from the legacy body rather than argued: `:L140` binds the rows to a local, and `:L142`
     * is the ONLY thing that ever reads that local — `arrayLen(results)`, tested for non-zero. No
     * column is read, no row is returned to the caller, and the magnitude of the count is never
     * consulted. One matching row is therefore complete evidence, and every further row the legacy
     * hydrated was transferred and discarded. The verdict below is left in the legacy's own shape
     * (`length > 0` mirroring `arrayLen`) precisely so the transcription stays checkable.
     *
     * The `1` is a projection literal authored here, not caller data, so it is not a value position
     * S2 would require a placeholder for — the two placeholders below remain the only ones.
     */
    const sql = `SELECT 1 FROM ${table} e WHERE e.${column} = ? AND e.${idColumn} != ? LIMIT 1`;

    /*
     * TR-4 — the bound list is assembled in the legacy sequence: the compared VALUE first, the
     * self-exclusion IDENTIFIER second, matching the order the named parameters are supplied in at
     * `:L140`. Reversing them still compiles and still runs, and would compare each value against
     * the wrong column.
     */
    const rows: MySqlRow[] = await this.executor.execute(sql, [propertyValue, entityID]);

    // `:L142-L144` — any matching row means the value is taken.
    if (rows.length > 0) {
      return false;
    }

    // `:L146` — nothing matched, so the value is unique. TRUE MEANS UNIQUE.
    return true;
  }

  /**
   * Reports whether `value` is still free in the `urlTitle` column of `tableName`.
   *
   * ⚠️ TRUE MEANS AVAILABLE. `true` says the candidate is still free and may be used; `false` says it
   * is already taken. Byte-verified against `model/dao/DataDAO.cfc`: `false` on a non-zero record
   * count (`:L126-L128`), `true` otherwise (`:L130`).
   *
   * STRUCTURAL TARGET, AND WHY IT IS NOT IMPORTED (AAP 0.8.2 Guideline 6). This signature is designed
   * to satisfy the `UniqueValueProbe` function type declared at line 73 of `urlTitle.ts` in
   * `src/util/` — the collaborator parameter of the unique-URL-title algorithm ported there from
   * `model/service/DataService.cfc:L53-L71`. That type is deliberately NOT imported. Structural
   * typing already makes this member assignable to it, and matching structurally rather than
   * nominally keeps this folder free of a dependency on the utility layer's type surface, so the two
   * modules can be read, tested and changed independently. The obligation the arrangement creates is
   * that the parameter order stays `(tableName, value)` and the return stays a promised boolean; a
   * test asserts the assignability against a locally declared copy of that shape so a drift in either
   * signature is caught by the compiler rather than at a wiring site.
   *
   * IT IS A METHOD, NOT A BOUND FIELD, AND THAT IS DELIBERATE. A composition root must therefore hand
   * it over wrapped — `(t, v) => checker.isUrlTitleAvailable(t, v)` — rather than as a bare reference
   * that would arrive with no receiver. The type-aware lint rule against unbound method references
   * reports exactly that mistake at the wiring site, so the safer-looking alternative of an
   * always-bound arrow field would in fact remove the compile-time warning that makes the hazard
   * visible.
   *
   * MODELLED ON THE OTHER LEGACY PROBE, AND SHAPED DIFFERENTLY FOR GOOD REASON. There is NO
   * self-exclusion term here, and its absence is correct rather than an omission: the consuming
   * algorithm probes candidate strings on behalf of a record that either has not been persisted yet
   * or is being renamed, so there is no row to exclude. `model/dao/DataDAO.cfc:L122-L124` is a plain
   * existence check with a single bound value, and so is this. The statement also carries no alias,
   * because the legacy statement carries none — and, being a native statement rather than one over the
   * mapped object graph, it already speaks in physical table names, so D22 does not arise on this path
   * the way it does on the other. What both probes DO share is their projection: each selects a
   * constant and stops at the first match, for the reason recorded at the statement itself.
   *
   * THE WHITELIST IS ENFORCED HERE. `tableName` is a plain string on the consuming side by necessity,
   * so this member is where the three-table constraint of `URL_TITLE_TABLES` is actually applied and
   * where a fourth table is refused.
   *
   * TODO(parity) `model/service/DataService.cfc:L64` — THE CONSUMING LOOP IS UNBOUNDED AND NO CEILING
   * IS ADDED HERE. `while(!unique)` has no ceiling in the legacy source, so every colliding candidate
   * issues another round trip, indefinitely; a persistent application server absorbed that as a slow
   * request, and a stateless invocation cannot. It is FLAGGED rather than repaired, and it is
   * deliberately not repaired FROM THIS SIDE: a cap invented here would be behaviour the source does
   * not state (AAP 0.7.3 S9), it would be invisible to the algorithm that owns the loop, and it would
   * silently change which titles get produced. NOR IS IT REPAIRED FROM THE OTHER SIDE: an earlier
   * revision had `src/util/urlTitle.ts` take a required attempt budget and raise on exhaustion, and
   * that is withdrawn too, because a refusal is an outcome `model/service/DataService.cfc:L64`
   * never produces. The bound belongs to whoever owns the invocation timeout, and the mismatch is
   * carried in the M-series register per AAP 0.6.6 / IR-10. Note also what this member must NOT do to make
   * that loop terminate: the first collision suffix is `-2` and never `-1`, because the counter at
   * `model/service/DataService.cfc:L65` is pre-incremented, and nothing here inspects or rewrites a
   * candidate to change that sequence.
   *
   * @param tableName - the table whose `urlTitle` column to probe. Accepted in any of the
   *   vocabularies `assertTableName` recognises and then required to resolve to one of the three
   *   tables the legacy algorithm is actually invoked against.
   * @param value - the candidate title, compared exactly as supplied. Not folded, not stripped and
   *   not otherwise normalised — the legacy compared the stored value raw, and normalising here would
   *   report collisions the database does not have or miss ones it does.
   * @returns `true` when no row holds that title and it is therefore still available; `false` when
   *   one does. Never null, never undefined and never inverted.
   * @throws {DomainError} when the table is outside the extracted schema, when it resolves outside the
   *   three tables this probe serves, or when it does not declare the column.
   */
  public async isUrlTitleAvailable(tableName: string, value: string): Promise<boolean> {
    /*
     * Resolve first, then constrain. `assertTableName` rejects anything outside the extracted schema
     * and normalises the survivors to their physical form, so the membership test below compares one
     * canonical name against three canonical names rather than trying to anticipate every spelling a
     * caller might use.
     */
    const table = assertTableName(tableName);

    if (!URL_TITLE_TABLES.has(table)) {
      throw new DomainError(
        'A URL-title availability probe named a table outside the three the legacy algorithm is ' +
          'invoked against, so it was refused before any statement text was assembled.',
        { context: { candidate: tableName, table } },
      );
    }

    /*
     * The second identifier of `:L123`. The column is a fixed literal rather than a parameter, and it
     * is still asserted, so a table that reached the whitelist without declaring the column fails
     * loudly instead of producing a statement that names a column the schema does not have.
     */
    const column = assertColumnName(table, URL_TITLE_COLUMN);

    /*
     * `:L122-L124`, translated: the table named, one placeholder, no alias and no self-exclusion term.
     *
     * ⚠️ A CONSTANT PROJECTION AND A ONE-ROW STOP, for exactly the reason given on
     * {@link UniquePropertyChecker.isUniqueProperty}: `model/dao/DataDAO.cfc:L126` reads nothing off
     * the result set but its `recordCount`, tested for non-zero, so the projected column was never
     * looked at and additional matching rows were transferred and discarded. The column is still
     * resolved and asserted above, because the WHERE clause names it and a table that reached the
     * whitelist without declaring it must still fail loudly.
     */
    const sql = `SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`;

    const rows: MySqlRow[] = await this.executor.execute(sql, [value]);

    // `:L126-L128` — a matching row means the title is already taken.
    if (rows.length > 0) {
      return false;
    }

    // `:L130` — nothing matched, so the title is free. TRUE MEANS AVAILABLE.
    return true;
  }
}
