/* ==================================================================================================
 * MySqlBrandRepository — the MySQL implementation of the brand persistence surface.
 *
 * ⭐ THERE IS NO LEGACY FILE THIS WAS TRANSLATED FROM, AND THAT IS THE POINT (IR-1). Every sibling in
 * this folder has a legacy counterpart on disk; this file has none. A repository-wide filename search
 * for a brand data-access component returns ZERO hits in any casing, and `model/dao/` contains
 * twenty-five components, none of them a brand one. The consuming service corroborates the absence from
 * the other side: `model/service/BrandService.cfc` declares exactly ONE property, `dataService` at
 * `:L51`, so there was never a brand data-access injection for a generated accessor to reach.
 *
 * So where did `brandService.newBrand()`, `brandService.getBrand(id)` and
 * `brandService.deleteBrand(entity)` come from? They were FABRICATED AT CALL TIME.
 * `org/Hibachi/HibachiService.cfc:L255` declares `onMissingMethod`, and `:L258-L276` dispatches on a
 * lower-cased method-name PREFIX across eight branches — `get` at `:L258` (splitting at `:L259-L260` on
 * a nine-character suffix into a paginated variant), `new` `:L264`, `list` `:L266`, `save` `:L268`,
 * `delete` `:L270`, `count` `:L272`, `export` `:L274`, `process` `:L276` — routing each to the inherited
 * primitives at `org/Hibachi/HibachiDAO.cfc:L6-L86`. A name matching no branch reaches the fallthrough
 * raise at `org/Hibachi/HibachiService.cfc:L280`. IR-1 states the consequence exactly: TypeScript under
 * `strict` "has no equivalent facility", so every synthesized call site becomes an explicitly declared,
 * typed member. A reviewer looking for the `.cfc` this was ported from will not find one; that is the
 * finding, not an omission. `org/Hibachi/HibachiService.cfc:L253` fixes the calling convention,
 * verbatim: "NOTE: Ordered arguments only--named arguments not supported."
 *
 * TWO NAMES FOR ONE THING — `SwBrand` IS PHYSICAL, `SlatwallBrand` IS THE ORM NAME.
 * `model/entity/Brand.cfc:L49` declares `entityname="SlatwallBrand" table="SwBrand"`, and the prefix is
 * applied at run time by the application-key block appearing at five sites in
 * `org/Hibachi/HibachiDAO.cfc` (`:L7-L10`, `:L29-L32`, `:L39-L42`, `:L80-L83`, `:L103-L106`). Native
 * statements name the physical table and every statement here is native, so the standing warning is
 * carried: never "fix" HQL entity names to `Sw*`, and never assume a logical name works in native SQL.
 * `SwBrand` is resolved once through `assertTableName`, so the identifier in every statement came from a
 * validated whitelist rather than a call-site literal.
 *
 * WHAT THIS FILE IS NOT — THE SERVICE/REPOSITORY SPLIT (IR-8). `model/service/BrandService.cfc:L67-L77`
 * is the legacy save path, and it does three things this file deliberately does not: inspects the
 * existing URL title against the incoming payload at `:L68`, derives a unique URL title at `:L70` and
 * `:L72`, and forwards both to `super.save()` at `:L76`.
 *
 * ⚠️ That forwarding call resolves to the LOCAL override at `model/service/HibachiService.cfc:L86` —
 * Slatwall code inside the extraction path — NOT to the framework base. The local override adds
 * behaviour, so the distinction is load-bearing. In the target, inheritance is replaced by composition
 * against `src/services/BaseService.ts`, and `src/services/BrandService.ts` owns the URL-title
 * derivation, the population and the validation. THIS FILE IS THE PERSISTENCE PRIMITIVE UNDERNEATH ALL
 * OF THAT: by the time control arrives the entity is populated and validated, so there is no populate
 * logic, no URL-title assignment, no validation dispatch and no delete-guard evaluation. The brand
 * delete guards in `model/validation/Brand.json` (`products` and `physicalCounts`, both bounded at zero
 * for the delete context) are evaluated ABOVE this boundary, so a blocked removal never reaches
 * {@link MySqlBrandRepository.deleteBrand}.
 *
 * THE SET IS CLOSED AT FIVE MEMBERS. AAP §0.4.2.5, verbatim: "synthesis is not reproduced wholesale,
 * only where used." The dispatcher fabricated nine prefixes and `org/Hibachi/HibachiDAO.cfc` really does
 * implement `list()` (`:L28-L35`), `count()` (`:L79-L86`), an export read (`:L113-L119`), `reloadEntity`
 * (`:L88-L90`) and the sort-order members (`:L149-L170`); each is WITHHELD because no in-scope call site
 * reaches it for a brand. The paginated read variant belongs in full to `SmartListQueryBuilder.ts` behind
 * `SmartListQueryPort`. ⚠️ Brand reaches the product feed as a LEFT-JOINED PROJECTION, not through a
 * brand-shaped paginated read: `model/service/ProductService.cfc:L349` joins
 * `("SlatwallProduct","brand","left")` and `integrationServices/google/controllers/feed.cfc:L66` does
 * the same, and NOTHING filters on brand anywhere in the slice. The general uniqueness predicate at
 * `org/Hibachi/HibachiDAO.cfc:L130-L147` is owned by `UniquePropertyChecker.ts` (IR-5);
 * {@link MySqlBrandRepository.isUrlTitleAvailable} is the brand narrowing of that concern, not a second
 * general implementation of it.
 *
 * NO DEFECT INSTANCE IS CARRIED IN THIS FILE, AND THAT IS ITSELF A FINDING. AAP §0.6.3.3 calls
 * `BrandService` "the cleanest of the four services", and the measurements agree: zero dead injections,
 * zero non-persistent properties on `model/entity/Brand.cfc`, and — with no legacy data-access component
 * — no interpolated-statement site and no logical-versus-physical naming mistake to carry. Stated as the
 * two identifiers a reviewer will look for: THERE IS NO D18 SITE HERE and THERE IS NO D22 SITE HERE.
 * D18 is exclusive to `MySqlProductRepository.ts`; D22 needs a legacy statement for this entity and
 * there is none, which is why the naming note above is a plain warning rather than a carry-over
 * annotation. Nothing in the legacy tree is corrected (TR-6).
 *
 * M6 — APPLIES TRANSITIVELY, WHICH IS WHY THERE IS EXACTLY ONE INJECTED EXECUTOR. Given a
 * transaction-scoped executor, the reads here — {@link MySqlBrandRepository.isUrlTitleAvailable} above
 * all — must run ON IT so they observe writes the same transaction has issued and not yet committed. A
 * probe that reached past the injected executor to a pool could not see a brand inserted moments earlier
 * in the same unit of work, and would report a taken value as available with no error anywhere. M5 is
 * cited, not owned: nothing here begins, commits or rolls back a transaction, and its owner is
 * `./UnitOfWork`.
 *
 * This file is the persistence primitive UNDERNEATH all of that. By the time control arrives, the
 * entity is populated and validated. So: no populate logic, no URL-title assignment, no validation
 * dispatch and no delete-guard evaluation. The brand delete guards declared in
 * `model/validation/Brand.json` — `products` and `physicalCounts` both bounded at zero for the delete
 * context — are ported as a typed rule set under `src/validation/rules/**` and evaluated ABOVE this
 * boundary; a blocked removal never reaches {@link MySqlBrandRepository.deleteBrand}. Importing
 * `src/validation/**` from an adapter is forbidden outright (AAP §0.7.3 S4), so the boundary is
 * recorded here rather than crossed.
 *
 * --------------------------------------------------------------------------------------------------
 * NEGATIVE MANDATE — THE SET IS CLOSED AT FIVE MEMBERS
 * --------------------------------------------------------------------------------------------------
 * AAP §0.4.2.5, verbatim: "synthesis is not reproduced wholesale, only where used."
 *
 * The dispatcher fabricated NINE prefixes and `org/Hibachi/HibachiDAO.cfc` really does implement
 * `list()` and `count()`, so five members next to a nine-prefix mechanism can read as unfinished. It
 * is not. Each of the following is WITHHELD deliberately, because no in-scope call site reaches it
 * for a brand, and adding one would re-create the very indirection this port exists to retire while
 * inventing a public API nothing needs (AAP §0.8.2 Guideline 4, AAP §0.7.3 S9):
 *
 *   • the `count`-prefixed member — real at `org/Hibachi/HibachiDAO.cfc:L79-L86`, unused for brands
 *   • the `list`-prefixed member — real at `org/Hibachi/HibachiDAO.cfc:L28-L35`, unused for brands
 *   • the `export`-prefixed member, and the export read at `org/Hibachi/HibachiDAO.cfc:L113-L119`
 *     (which interpolates a table name into its statement and writes an unscoped variable at `:L117`)
 *   • the paginated read variant. That surface belongs in full to `SmartListQueryBuilder.ts` behind
 *     `SmartListQueryPort`. ⚠️ Brand reaches the product feed as a LEFT-JOINED PROJECTION, not
 *     through a brand-shaped paginated read: `model/service/ProductService.cfc:L349` joins
 *     `("SlatwallProduct","brand","left")` and `integrationServices/google/controllers/feed.cfc:L66`
 *     does the same. NOTHING filters on brand anywhere in the slice, which is precisely why the join
 *     is left rather than inner — it projects, it does not select
 *   • any `process`-prefixed member — no brand process object exists in scope
 *   • `reloadEntity` at `org/Hibachi/HibachiDAO.cfc:L88-L90` — no in-scope caller
 *   • `getTableTopSortOrder` at `org/Hibachi/HibachiDAO.cfc:L149-L168`, whose owner is
 *     `UnitOfWork.ts`, and `updateRecordSortOrder` at `:L170`, which is formally excluded from
 *     the port. `model/entity/Brand.cfc` declares NO `sortOrder` property, so neither applies here
 *   • the general uniqueness predicate `isUniqueProperty` at `org/Hibachi/HibachiDAO.cfc:L130-L147`,
 *     whose owner is `UniquePropertyChecker.ts` (IR-5). {@link
 *     MySqlBrandRepository.isUrlTitleAvailable} is the brand narrowing of that concern, not a second
 *     general implementation of it
 *   • a products loader. `model/entity/Brand.cfc:L61` declares the one-to-many, and `SwProduct` is
 *     in scope — but reading products is `MySqlProductRepository`'s business, so there is no
 *     brand-side products query here
 *   • anything for an excluded domain family (AAP §0.2.2.1)
 *
 * NO GENERIC BASE REPOSITORY, EITHER. These five members are the most boilerplate-looking code in
 * the folder and the pull toward a shared `get`/`save`/`delete` base type is strong. AAP §0.3.3
 * replaces template-method reuse with composition over inheritance, and a generic base would put the
 * per-table column whitelist behind a type parameter — which is exactly where it stops being
 * auditable against `model/entity/Brand.cfc:L52-L80` line by line. The five members are written out.
 *
 * --------------------------------------------------------------------------------------------------
 * NO DEFECT INSTANCE IS CARRIED IN THIS FILE, AND THAT IS ITSELF A FINDING (AAP §0.7.3 S7)
 * --------------------------------------------------------------------------------------------------
 * AAP §0.6.3.3 calls `BrandService` "the cleanest of the four services", and the measurements agree:
 * ZERO dead injections (its siblings carry four between them), zero non-persistent properties on
 * `model/entity/Brand.cfc` so nothing is boundary-excluded from the entity, and — because there is no
 * legacy data-access component — no interpolated-statement site and no logical-versus-physical
 * naming mistake to carry. Stated as the two register identifiers a reviewer will look for: THERE IS
 * NO D18 SITE HERE and THERE IS NO D22 SITE HERE. D18 is the single declared hardening exception of
 * the whole port and it is exclusive to `MySqlProductRepository.ts`, which translates the importer's
 * twenty-one value-interpolating statements; this file neither inherits it nor claims it. D22 is a
 * logical-versus-physical naming instance, and with no legacy statement for this entity there is no
 * instance of it to carry — which is why the naming note above is a plain warning and deliberately
 * NOT a carry-over annotation. Both numbers are placed by the canonical register statement: the
 * register is stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus the
 * source extension D22 and the three contract corrections D23, D24 and D25, with no D26 or beyond;
 * and AAP 0.6.6's M1-M8 plus M9, with no M10 or beyond).
 *
 * What IS annotated below, each with its locator: the two `get()` behaviours deliberately not
 * reproduced (`org/Hibachi/HibachiDAO.cfc:L24` and `:L19`), the availability polarity
 * (`model/dao/DataDAO.cfc:L126-L130`), the test-enforced empty-collection default
 * (`meta/tests/unit/entity/BrandTest.cfc:L59`), the audit column-to-field divergence, and the reason
 * an update's affected-row count is unusable here while a removal's is authoritative — a distinction
 * measured rather than assumed, and recorded ONCE on {@link BrandStatementExecutor.executeMutation}
 * together with the exact reproduction and its evidence boundary (F-21). The
 * defect and mismatch registers are CLOSED; no new identifier is minted here and nothing in the
 * legacy tree is corrected (TR-6).
 *
 * --------------------------------------------------------------------------------------------------
 * EXECUTION-MODEL POSTURE (AAP §0.7.3 S8)
 * --------------------------------------------------------------------------------------------------
 * M5 — CITED, NOT OWNED. Nothing here begins, commits or rolls back a transaction, and no autocommit
 * setting is touched. The legacy commit is implicit at request end and error-conditional
 * (`org/Hibachi/Hibachi.cfc:L455-L459`, flushing through the double flush at
 * `org/Hibachi/HibachiDAO.cfc:L93` and `:L95` only when the mapping layer reports no errors). Its
 * owner in the target is `src/adapters/mysql/UnitOfWork.ts`. These members run inside whatever
 * boundary the caller already established.
 *
 * M6 — APPLIES TRANSITIVELY, WHICH IS WHY THERE IS EXACTLY ONE INJECTED EXECUTOR. When the unit of
 * work supplies a transaction-scoped executor, the reads here — {@link
 * MySqlBrandRepository.isUrlTitleAvailable} above all — must run ON IT so they observe writes the
 * same transaction has issued and not yet committed. A URL-title probe that reached past the injected
 * executor to a pool could not see a brand inserted moments earlier in the same unit of work, and
 * would report a taken value as available with no error anywhere. Nothing here constructs a pool,
 * resolves a connection or reads a credential.
 *
 * M7 — OWNED AS A PROHIBITION. There is no module-scope mutable state, no instance-level cache and
 * no memoized read. The composition root registers repositories as singletons, mirroring the
 * dependency framework's lifecycle at `org/Hibachi/Hibachi.cfc:L289-L345`, so an instance cache on a
 * warm container would bleed one invocation's rows into the next. The URL-title probe is called an
 * unbounded number of times per derivation by the loop at `model/service/DataService.cfc:L64-L68`, so
 * caching it would make that loop non-terminating on its first collision.
 *
 * M1, M2, M3, M4 and M8 are cited elsewhere and owned elsewhere. Nothing here adds a timeout, a
 * row-count cap, a batch size, a retry, a backoff or an index hint (AAP §0.7.3 S9). No statement in
 * this file carries a row-restricting or row-skipping clause of any kind, because no legacy statement
 * for this entity had one.
 * ============================================================================================== */

import { manageEntity } from '../../domain/base/populate';
import type { ManagedEntity } from '../../domain/base/populate';
import { BRAND_ENTITY_METADATA, Brand } from '../../domain/product/Brand';
import { DataIntegrityError } from '../../errors/DomainError';
import type { BrandRepository } from '../../ports/repositories/BrandRepository';
import { createSlatwallUUID } from '../../util/uuid';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../domain/base/AuditableEntity';
import type { AccountContextPort } from '../../ports/AccountContextPort';
import type { SqlExecutor } from './QueryRunner';
import { assertColumnName, assertTableName } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import { mapBrandRow } from './rowMappers';

const BRAND_TABLE = assertTableName('SwBrand');

const BRAND_COLUMN = Object.freeze({
  brandID: assertColumnName(BRAND_TABLE, 'brandID'),
  activeFlag: assertColumnName(BRAND_TABLE, 'activeFlag'),
  publishedFlag: assertColumnName(BRAND_TABLE, 'publishedFlag'),
  urlTitle: assertColumnName(BRAND_TABLE, 'urlTitle'),
  brandName: assertColumnName(BRAND_TABLE, 'brandName'),
  brandWebsite: assertColumnName(BRAND_TABLE, 'brandWebsite'),
  remoteID: assertColumnName(BRAND_TABLE, 'remoteID'),
  createdDateTime: assertColumnName(BRAND_TABLE, 'createdDateTime'),
  createdByAccountID: assertColumnName(BRAND_TABLE, 'createdByAccountID'),
  modifiedDateTime: assertColumnName(BRAND_TABLE, 'modifiedDateTime'),
  modifiedByAccountID: assertColumnName(BRAND_TABLE, 'modifiedByAccountID'),
});

/**
 * The columns the write path assigns, in `model/entity/Brand.cfc` declaration order — which is also the
 * bind order (TR-4). The primary key is deliberately absent: the insert names it FIRST and the update
 * matches ON it, so it is handled separately at both call sites.
 *
 * The list is complete rather than sparse, and that is a decision. Omitting an absent field from the
 * insert would let the database apply a column default, a different outcome from writing the absence the
 * entity actually holds — and `model/validation/Brand.json` supplies no defaults while
 * `model/entity/Brand.cfc` declares no calculated member to fall back on.
 */
const BRAND_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  BRAND_COLUMN.activeFlag,
  BRAND_COLUMN.publishedFlag,
  BRAND_COLUMN.urlTitle,
  BRAND_COLUMN.brandName,
  BRAND_COLUMN.brandWebsite,
  BRAND_COLUMN.remoteID,
  BRAND_COLUMN.createdDateTime,
  BRAND_COLUMN.createdByAccountID,
  BRAND_COLUMN.modifiedDateTime,
  BRAND_COLUMN.modifiedByAccountID,
]);

const BIND_PLACEHOLDER = '?';

const CLAUSE_JOINER = ', ';

const BRAND_COLUMN_LIST = [BRAND_COLUMN.brandID, ...BRAND_WRITABLE_COLUMNS].join(CLAUSE_JOINER);

export interface BrandStatementExecutor extends SqlExecutor {
  /**
   * Runs a data-modifying statement and returns the number of rows it AFFECTED.
   *
   * Matches `QueryRunner.executeMutation`, which is the port of the legacy `save()` and `delete()`
   * primitives at `org/Hibachi/HibachiDAO.cfc:L48-L67` and `:L69-L77`.
   *
   * ⚠️ THE COUNT MEANS DIFFERENT THINGS FOR DIFFERENT STATEMENTS, so the two members below read it
   * differently. THIS IS THE ONE PLACE THE MEASUREMENT IS RECORDED; the header, the save path and the
   * removal path state only what is local to each and point here.
   *
   * F-21 — WHAT WAS ACTUALLY RUN, AND HOW TO RE-RUN IT. Probed against MySQL 8.4.11 through `mysql2`
   * 3.23.2, the pinned runtime dependency, over a STAND-IN table rather than `SwBrand`, because no
   * `Sw*` DDL exists in this repository (see the evidence-boundary note in `src/config/database.ts`).
   * A single-row table, a no-op update that assigns the value already stored, and a real update:
   *
   *   connection option              no-op UPDATE            real UPDATE
   *   ---------------------------    --------------------    --------------------
   *   (none)                         affected 1, changed 0   affected 1, changed 1
   *   flags: '-FOUND_ROWS'           affected 0, changed 0   affected 1, changed 1
   *   ---------------------------    --------------------    --------------------
   *   DELETE, row present  -> 1      DELETE, row absent -> 0     under BOTH option sets
   *
   * So for an update the count is rows MATCHED under the default capability set and rows CHANGED once
   * `CLIENT_FOUND_ROWS` is withdrawn: the SAME statement over the SAME data answers 1 in the first
   * case and 0 in the second. For a removal it is rows REMOVED either way. `src/config/database.ts`
   * pins no capability flags (S9 forbids inventing a pin the source never made), so an update's count
   * is a property of the connection rather than of the row.
   *
   * ⛔ THE LEVER IS `flags`, NOT `foundRows`, AND REACHING FOR THE WRONG ONE MEASURES NOTHING. An
   * earlier revision of this note named `CLIENT_FOUND_ROWS` withdrawal without naming the option that
   * performs it. `foundRows` is NOT a `mysql2` 3.23.2 connection option: passing it emits "Ignoring
   * invalid configuration option passed to Connection: foundRows" and changes no behaviour at all, so
   * a probe written that way reports 1 in both columns and looks like a refutation of the claim above.
   * The option that actually withdraws the capability is `flags: '-FOUND_ROWS'`.
   *
   * ⛔ AND BOTH FIGURES DO REACH THIS PORT — THE NARROWING IS OURS, NOT THE DRIVER'S. The same earlier
   * revision said the driver "surfaces only one of them". It does not: the `mysql2` result object
   * carries `affectedRows` AND `changedRows`, and the server's info text carries both as well
   * ("Rows matched: 1  Changed: 0"). It is `readAffectedRows` in `./QueryRunner.ts` that reads
   * `affectedRows` alone, which is a decision of this subtree. The conclusion the two members draw is
   * unaffected — an update's count still cannot distinguish a matched-but-unchanged row from a
   * changed one — but the reason is a narrowing here, not a limitation there.
   *
   * See {@link MySqlBrandRepository.saveBrand} and {@link MySqlBrandRepository.deleteBrand} for how
   * each path treats it.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

export class MySqlBrandRepository implements BrandRepository {
  private readonly executor: BrandStatementExecutor;

  /** @see MySqlBrandRepository.constructor */
  private readonly accountContext: AccountContextPort;

  /**
   * @param executor - Issues every statement this adapter composes. Typed at the INTERFACE rather than
   *   at the concrete runner, so a hand-written double satisfies it with a plain object literal — which
   *   the legacy suite could never do, having no mocking library at all and booting the whole framework
   *   application instead (S6).
   * @param accountContext - Resolves the acting account for the audit block {@link
   *   MySqlBrandRepository.saveBrand} stamps. Required rather than optional: the legacy write always
   *   reached the framework audit block, so a write seam that could not name an actor could not
   *   reproduce it. The port answers `undefined` for an unauthenticated request and the stamping
   *   functions accept that, so "nobody is acting" is a legitimate ANSWER rather than a missing
   *   collaborator.
   */
  public constructor(executor: BrandStatementExecutor, accountContext: AccountContextPort) {
    this.executor = executor;
    this.accountContext = accountContext;
  }

  /**
   * Returns an equivalent {@link MySqlBrandRepository} bound to a DIFFERENT statement executor.
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
  public withExecutor(executor: BrandStatementExecutor): MySqlBrandRepository {
    return new MySqlBrandRepository(executor, this.accountContext);
  }

  /**
   * Instantiates a new, unpersisted brand. Replaces the `new` branch at
   * `org/Hibachi/HibachiService.cfc:L264`, which reached `new()` at
   * `org/Hibachi/HibachiDAO.cfc:L38-L45` — a member whose whole body is an in-memory instantiation.
   *
   * ⚠️ SYNCHRONOUS, DELIBERATELY: no statement is issued and the injected executor is not touched. A
   * promise-returning signature would compile and then oblige every caller to await something that
   * never yields, permanently encoding an I/O boundary that does not exist.
   *
   * ⚠️ NO IDENTIFIER IS MINTED HERE. The returned brand carries `brandID === ''`, which
   * `model/entity/Brand.cfc:L52` declares as `unsavedvalue` and `Brand.isNew()` tests. Minting one here
   * would make every fresh brand report itself as already persisted, and
   * {@link MySqlBrandRepository.saveBrand} would take the update path for a row that does not exist.
   *
   * ⚠️ THE EMPTY COLLECTION IS TEST-ENFORCED, NOT INCIDENTAL.
   * `meta/tests/unit/entity/BrandTest.cfc:L59` asserts `getProducts()` equals `[]` on an instance
   * obtained from exactly this call path (`:L55`) — the only test-enforced default in the whole brand
   * domain. It is handed out BY REFERENCE and is not frozen, copied or wrapped: the bidirectional
   * helpers at `model/entity/Brand.cfc:L98-L103` mutate collections in place, so a defensive copy would
   * break relationship maintenance several layers up with no error anywhere.
   */
  public newBrand(): ManagedEntity<Brand> {
    return manageEntity(new Brand(), BRAND_ENTITY_METADATA);
  }

  public async getBrand(brandID: string): Promise<ManagedEntity<Brand> | null> {
    if (brandID.length === 0) {
      return null;
    }

    const sql =
      `SELECT ${BRAND_COLUMN_LIST} FROM ${BRAND_TABLE} ` +
      `WHERE ${BRAND_COLUMN.brandID} = ${BIND_PLACEHOLDER}`;

    const rows = await this.executor.execute(sql, [brandID]);

    const row = this.readAtMostOneRow(rows, 'primary identifier');
    if (row === null) {
      return null;
    }

    return mapBrandRow(row);
  }

  /**
   * Persists an already-populated, already-validated brand, inserting or updating as its identity
   * requires. Replaces the `save` branch at `org/Hibachi/HibachiService.cfc:L268`, which reached
   * `save()` at `org/Hibachi/HibachiDAO.cfc:L48-L67`.
   *
   * ⚠️ THE INSERT-OR-UPDATE DECISION IS THE ENTITY'S OWN, NOT A PROBE'S. `Brand.isNew()` tests
   * `brandID === ''`, exactly the `unsavedvalue=""` declared at `model/entity/Brand.cfc:L52`; the
   * mapping layer made the same distinction from the same value. A pre-flight existence read would be a
   * second, competing source of truth and would issue a statement the legacy path never issued.
   *
   * ⚠️ THE IDENTIFIER IS MINTED HERE AND ONLY HERE (IR-6), from `createSlatwallUUID()` in
   * `src/util/uuid.ts` — the port of `model/dao/HibachiDAO.cfc:L51-L53` and, through its delegation, of
   * `org/Hibachi/HibachiObject.cfc:L144-L146`, whose body lower-cases a generated identifier and strips
   * every dash. 32 lowercase hexadecimal characters, no dashes, as `ormtype="string" length="32"`
   * requires: never an auto-increment, never a dashed form, never upper case. It is assigned to the
   * entity BEFORE the statement is composed.
   *
   * ⚠️ THE AUDIT COLUMNS ARE STAMPED HERE, BECAUSE THIS IS THE FLUSH — AND AN EARLIER REVISION
   * ARGUED THE OPPOSITE ON A REASON THAT DOES NOT HOLD. That revision said stamping here "would repeat
   * the read-time mutation this file explicitly declines to reproduce, in the other direction". The two
   * are not the same mechanism: the read-time mutation is the pair of overridden timestamp GETTERS at
   * `org/Hibachi/HibachiEntity.cfc:L291-L305`, which answer an empty string for an unset value, whereas
   * stamping is the port of the WRITE-time hooks at `:L598-L649` and `:L657-L681`. Declining the first
   * says nothing about the second. Hibernate fired those hooks as part of the flush the framework
   * triggered at request end (`org/Hibachi/Hibachi.cfc`, double `ormFlush()` gated on the ORM reporting
   * no errors, with `flushAtRequestEnd=false`); a stateless Lambda invocation has no ORM session, no
   * automatic flush and no request-end hook (mismatch M5, AAP §0.6.6), and `src/services/BaseService.ts`
   * explicitly declines the job and places it "behind `EntityPersister`" — which is this member. Leaving
   * the columns as a transient entity holds them therefore persisted NULLs where the legacy persisted a
   * timestamp, which is a divergence rather than a deferral. The free functions are called rather than a
   * hook on the entity because `model/entity/Brand.cfc` does not override `preInsert`/`preUpdate`;
   * contrast `MySqlProductTypeRepository`, whose entity does. Note the crossed pairing recorded
   * on {@link BRAND_COLUMN}: field `createdByAccount` binds to column `createdByAccountID` and field
   * `modifiedByAccount` binds to column `modifiedByAccountID`. Both account fields are optional
   * 32-character identifier strings rather than an account object — the account family is explicitly
   * out of scope — and they are GENUINELY absent when unset, so an unset one binds as SQL null. No
   * empty-string default is invented for them: `org/Hibachi/HibachiEntity.cfc:L291-L305` overrides
   * only the two timestamp getters to answer with an empty string, never the two foreign keys.
   *
   * ⚠️ THE ASSIGNMENT CLAUSE IS COMPOSED FROM THE WHITELIST, NEVER CONCATENATED FROM VALUES. Each column
   * contributes `column = ?` and each value is appended to a parallel parameter list in the same order,
   * so the statement text is a function of the whitelist alone — the structural difference from the
   * legacy importer's value-interpolating assignment building.
   *
   * ⚠️ THE AFFECTED-ROW COUNT IS DELIBERATELY NOT INSPECTED ON THE UPDATE PATH, BECAUSE ON THAT PATH
   * THE COUNT DESCRIBES THE CONNECTION RATHER THAN THE ROW. Re-saving a brand whose stored column
   * values are already identical reports 1 under the default capability set and 0 once
   * `CLIENT_FOUND_ROWS` is withdrawn — identical statement, identical data, two different numbers. The
   * measurement, the exact option that withdraws the capability, and the evidence boundary are
   * recorded once on {@link BrandStatementExecutor.executeMutation} and are not restated here. Since
   * `src/config/database.ts` pins no capability flags (S9 forbids inventing a pin the source never
   * made), neither number may become control flow here: reading it would make correctness depend on an
   * unpinned negotiation detail.
   *
   * The legacy behaviour points the same way independently. The mapping layer issued no statement at
   * all when nothing was dirty, so a no-op save was never an error there either. This member
   * therefore treats a statement that completed without raising as a successful save. A removal is a
   * genuinely different case and {@link MySqlBrandRepository.deleteBrand} does read its count.
   *
   * ⚠️ NOTHING IS COMMITTED HERE (M5). No transaction is begun, no commit is issued and no
   * autocommit setting is touched; the boundary belongs to `src/adapters/mysql/UnitOfWork.ts` and
   * this member runs inside whatever boundary the caller established.
   *
   * @param brand - The fully populated, already-validated, already-managed brand to persist.
   * @returns The same brand instance, still managed, carrying its identifier. Never null.
   */
  public async saveBrand(brand: ManagedEntity<Brand>): Promise<ManagedEntity<Brand>> {
    const isInsert = brand.isNew();

    if (isInsert) {
      brand.brandID = createSlatwallUUID();
    }

    /*
     * The lifecycle hook, invoked because nothing else fires it — see the audit note above. STAMP FIRST,
     * COLLECT SECOND: `collectWritableValues` reads the four audit fields off the entity, so stamping
     * afterwards would compose the statement from the previous write's values and persist a row whose
     * audit columns lag one save behind, silently.
     */
    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      applyPreInsertAudit(brand, auditActor);
    } else {
      applyPreUpdateAudit(brand, auditActor);
    }

    const writableValues = this.collectWritableValues(brand);

    if (isInsert) {
      const placeholders = [BRAND_COLUMN.brandID, ...BRAND_WRITABLE_COLUMNS]
        .map(() => BIND_PLACEHOLDER)
        .join(CLAUSE_JOINER);

      await this.executor.executeMutation(
        `INSERT INTO ${BRAND_TABLE} (${BRAND_COLUMN_LIST}) VALUES (${placeholders})`,
        [brand.brandID, ...writableValues],
      );

      return brand;
    }

    const assignments = BRAND_WRITABLE_COLUMNS.map(
      (column) => `${column} = ${BIND_PLACEHOLDER}`,
    ).join(CLAUSE_JOINER);

    await this.executor.executeMutation(
      `UPDATE ${BRAND_TABLE} SET ${assignments} ` +
        `WHERE ${BRAND_COLUMN.brandID} = ${BIND_PLACEHOLDER}`,
      [...writableValues, brand.brandID],
    );

    return brand;
  }

  /**
   * Removes a brand. Replaces the `delete` branch at `org/Hibachi/HibachiService.cfc:L270`, which
   * reached `delete()` at `org/Hibachi/HibachiDAO.cfc:L69-L77`. The legacy primitive is declared `void`
   * and takes the ENTITY (`:L69`), branching at `:L70-L73` to recurse over an array. The port declares
   * the single-entity form taking the entity — narrowing the parameter to an identifier string would
   * look tidier and would silently offer callers an entry point the legacy never had.
   *
   * ⚠️ THE DELETE GUARDS RUN ABOVE THIS BOUNDARY, NOT INSIDE IT. `model/validation/Brand.json` bounds
   * both `products` and `physicalCounts` at zero for the delete context; those rules are evaluated by
   * the service, exactly as `model/service/HibachiService.cfc:L68-L73` gates its own removal on the
   * outcome. A blocked removal never reaches this member, which is why the result is a plain boolean.
   *
   * ⚠️ A TRANSIENT BRAND IS REFUSED RATHER THAN TURNED INTO A STATEMENT. An entity that reports itself
   * new carries the empty identifier from `model/entity/Brand.cfc:L52`, so a removal keyed on it would
   * compose `WHERE brandID = ''` — a predicate that matches nothing in a sound table and an arbitrary
   * row in an unsound one. The mapping layer would have raised on the same input.
   *
   * ⚠️ HERE THE AFFECTED-ROW COUNT IS EXACT AND IS THE ANSWER. Unlike an update, a removal's count is
   * rows REMOVED whatever capabilities the connection negotiated — 1 for a present row and 0 for an
   * absent one under BOTH option sets, per the measurement recorded on
   * {@link BrandStatementExecutor.executeMutation} — so it states a fact about the data rather than
   * about the connection. That is precisely why this member
   * may build its result on the count while {@link MySqlBrandRepository.saveBrand} may not. So `true`
   * means this statement removed the row and `false` means there was no row to remove.
   *
   * @returns `true` when the row was removed, `false` when no row matched. Never null.
   * @throws {DataIntegrityError} When the brand was never persisted and therefore has no row.
   */
  public async deleteBrand(brand: ManagedEntity<Brand>): Promise<boolean> {
    if (brand.isNew()) {
      throw new DataIntegrityError(
        'A brand that has never been persisted was handed to the removal path, so there is no row ' +
          'to identify and no statement was issued.',
        { context: { brandID: brand.brandID, className: brand.getClassName() } },
      );
    }

    const removedRows = await this.executor.executeMutation(
      `DELETE FROM ${BRAND_TABLE} WHERE ${BRAND_COLUMN.brandID} = ${BIND_PLACEHOLDER}`,
      [brand.brandID],
    );

    return removedRows > 0;
  }

  /**
   * Reports whether a candidate URL title is still free for a brand.
   *
   * ⚠️⚠️ TRUE MEANS AVAILABLE. NOT "found", not "taken". THIS IS THE HIGHEST-RISK LINE IN THE FILE.
   *
   * The legacy primitive is `verifyUniqueTableValue`, declared with an explicit boolean return type at
   * `model/dao/DataDAO.cfc:L115`. Its body runs one existence read at `:L123` and then INVERTS the
   * obvious answer: `:L126-L128` returns FALSE when a row IS found, and `:L130` returns TRUE otherwise.
   * The system-wide uniqueness predicate reads the same way — `org/Hibachi/HibachiDAO.cfc:L142-L144`
   * returns false on a hit and `:L146` true otherwise (IR-5). So the boolean answers "still free?".
   *
   * TODO(parity) `model/dao/DataDAO.cfc:L126-L130` — INVERTING THIS IS COMPLETELY SILENT. It produces no
   * compile error, no type error and no lint finding, because both directions are `Promise<boolean>` and
   * the member name reads plausibly either way. The damage lands in the consumer:
   * `model/service/DataService.cfc:L62` probes once and `:L64` then loops `while(!unique)` with NO
   * iteration ceiling, re-probing at `:L67`. Invert the polarity and you get exactly one of two outcomes
   * — the loop never runs and duplicate URL titles reach a column declared `unique="true"` at
   * `model/entity/Brand.cfc:L55`, or every candidate is reported taken and the loop never terminates.
   * Neither raises anything. The polarity is carried, annotated and asserted by test in both directions.
   *
   * WHAT THIS MEMBER DOES NOT OWN. The suffix rule is the caller's: `src/util/urlTitle.ts` ports
   * `model/service/DataService.cfc:L53-L71`, including the detail that `:L55` seeds the counter at one
   * and `:L65` increments BEFORE composing, so the first collision suffix is `-2` and `-1` is never
   * produced. That behaviour and the loop's unboundedness are neither reimplemented nor capped here.
   *
   * WHY ONE PARAMETER. The legacy primitive is generic over three — a table, a column and a value
   * (`model/dao/DataDAO.cfc:L116-L118`) — but on this path the first two are CONSTANTS, verified on both
   * sides: the column is pinned to `urlTitle` by the algorithm's only two probe sites
   * (`model/service/DataService.cfc:L62` and `:L67`) and the table to `SwBrand` by its only two brand
   * callers (`model/service/BrandService.cfc:L70` and `:L72`). Accepting either through this signature
   * would hand a caller-supplied string to an identifier position, which is what
   * `model/dao/DataDAO.cfc:L123` does. So both identifiers come from the module-level whitelist and only
   * the candidate value is bound. The general, table-taking form lives in `UniquePropertyChecker.ts`,
   * cited by path and not delegated to, so this narrowing does not become a second general
   * implementation (IR-5).
   *
   * @returns `true` when no brand row already carries the value — it is AVAILABLE — and `false` when one
   *   does. Never null.
   */
  public async isUrlTitleAvailable(urlTitle: string): Promise<boolean> {
    /*
     * ⚠️ A CONSTANT PROJECTION AND A ONE-ROW STOP, WHERE THE LEGACY PROJECTED THE COLUMN AND READ THE
     * WHOLE MATCH SET. Structural, and provably answer-preserving from the legacy body rather than by
     * argument: `model/dao/DataDAO.cfc:L123` runs the read and `:L126` is the ONLY thing that ever
     * touches the result — `rs.recordCount`, tested for non-zero. The projected column is never read,
     * no row is handed back, and the magnitude of the count is never consulted, so one matching row is
     * complete evidence and every further row the legacy transferred was discarded. This is the one
     * departure from the star-projection reasoning recorded on {@link BRAND_COLUMN_LIST}: that
     * paragraph is about reads whose columns are HYDRATED, and this read hydrates nothing.
     *
     * The column is still named in the predicate, and still comes from the whitelist, so S2 holds
     * exactly as before. The `1` is a projection literal authored here, not caller data, so it is not
     * a value position requiring a placeholder — the single placeholder below remains the only one.
     *
     * `LIMIT 1` is admissible here and would NOT be admissible on a read whose rows the caller sees:
     * it invents no ordering, discards nothing the legacy consulted, and cannot change a verdict that
     * is already "did anything match at all". No ceiling is placed on the CALLER's collision loop,
     * which stays unbounded per the TODO(parity) above.
     */
    const sql =
      `SELECT 1 FROM ${BRAND_TABLE} ` +
      `WHERE ${BRAND_COLUMN.urlTitle} = ${BIND_PLACEHOLDER} LIMIT 1`;

    const rows = await this.executor.execute(sql, [urlTitle]);

    /*
     * The inversion, in one place: a match means NOT available. `model/dao/DataDAO.cfc:L126` tests
     * the record count and returns false; `:L130` returns true when it did not. No self-exclusion
     * clause appears here because the legacy probe has none either — its caller derives a candidate
     * for an entity that does not yet own one, so there is no row to exclude. That contrasts with the
     * general predicate at `org/Hibachi/HibachiDAO.cfc:L140`, which does exclude by identifier and
     * whose exclusion is a no-op on insert anyway; that member's owner is `UniquePropertyChecker.ts`.
     */
    return rows.length === 0;
  }

  private readAtMostOneRow(rows: readonly MySqlRow[], matchedOn: string): MySqlRow | null {
    if (rows.length > 1) {
      throw new DataIntegrityError(
        'A brand read that can match at most one row matched several, so the result is ambiguous ' +
          'and no brand was hydrated from it.',
        { context: { table: BRAND_TABLE, matchedOn, rowCount: rows.length } },
      );
    }

    const row = rows[0];
    return row === undefined ? null : row;
  }

  /**
   * Collects the column values for the write path, in the exact order of
   * {@link BRAND_WRITABLE_COLUMNS} — `model/entity/Brand.cfc`'s own declaration order (TR-4). A value
   * and a column that disagreed on position would bind a URL title into a brand name with nothing to
   * report it, so the pairing is stated once, here, rather than at each statement.
   *
   * ABSENT MEANS NULL AT THE BOUNDARY, AND THAT IS NOT A CONTRADICTION OF THE DOMAIN CONVENTION. The
   * domain expresses a legacy null by the ABSENCE of a property — `src/domain/base/populate.ts` deletes
   * the key rather than assigning `undefined`, and `rowMappers.ts` hydrates a null column into an absent
   * property for the same reason. A bind position cannot express absence, so absence is translated to
   * SQL null exactly at this seam, and nowhere earlier.
   */
  private collectWritableValues(brand: ManagedEntity<Brand>): readonly unknown[] {
    return [
      brand.activeFlag ?? null,
      brand.publishedFlag ?? null,
      brand.urlTitle ?? null,
      brand.brandName ?? null,
      brand.brandWebsite ?? null,
      brand.remoteID ?? null,
      brand.createdDateTime ?? null,
      brand.createdByAccount ?? null,
      brand.modifiedDateTime ?? null,
      brand.modifiedByAccount ?? null,
    ];
  }
}
