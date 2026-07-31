/* ==================================================================================================
 * MySqlBrandRepository — the MySQL implementation of the brand persistence surface.
 *
 * ⭐ THERE IS NO LEGACY FILE THIS WAS TRANSLATED FROM, AND THAT IS THE POINT (IR-1).
 *
 * Every sibling in this folder has a legacy counterpart on disk: `MySqlSkuRepository` translates
 * `model/dao/SkuDAO.cfc`, `MySqlOptionRepository` translates `model/dao/OptionDAO.cfc`,
 * `MySqlProductRepository` translates `model/dao/ProductDAO.cfc` and `MySqlProductTypeRepository`
 * translates `model/dao/ProductTypeDAO.cfc`. THIS FILE HAS NO SUCH COUNTERPART. A repository-wide
 * filename search for a brand data-access component returns ZERO hits in any casing, and
 * `model/dao/` contains exactly twenty-five components, none of them a brand one. The service that
 * consumes this surface corroborates the absence from the other side: `model/service/BrandService.cfc`
 * declares exactly ONE property, `dataService` at `model/service/BrandService.cfc:L51`, so there was
 * never a brand data-access injection for a generated accessor to reach.
 *
 * So where did `brandService.newBrand()`, `brandService.getBrand(id)` and
 * `brandService.deleteBrand(entity)` come from? They were FABRICATED AT CALL TIME.
 * `org/Hibachi/HibachiService.cfc:L255` declares `onMissingMethod`, and `:L258-L276` dispatches on a
 * lower-cased method-name PREFIX across eight branches — `get` at `:L258` (splitting at `:L259-L260`
 * on a nine-character suffix into a paginated variant), `new` at `:L264`, `list` at `:L266`, `save` at
 * `:L268`, `delete` at `:L270`, `count` at `:L272`, `export` at `:L274` and `process` at `:L276` —
 * routing each to the inherited primitives at `org/Hibachi/HibachiDAO.cfc:L6-L86`: `get()` `:L6-L26`,
 * `list()` `:L28-L35`, `new()` `:L38-L45`, `save()` `:L48-L67`, `delete()` `:L69-L77` and `count()`
 * `:L79-L86`. A name matching no branch reaches the fallthrough raise at
 * `org/Hibachi/HibachiService.cfc:L280`, cited by locator only: that message literal belongs to the
 * closed inventory owned by `src/errors/DomainError.ts` and is reproduced nowhere else in this
 * subtree, not even inside a comment.
 *
 * IR-1 states the consequence exactly: TypeScript under `strict` "has no equivalent facility", so
 * every synthesized call site becomes an explicitly declared, typed member. That makes this file the
 * purest instance of the whole exercise — the behaviour it implements existed in the legacy system
 * only as the emergent product of eight string comparisons, and here it is five declarations a
 * compiler checks. A reviewer looking for the `.cfc` this was ported from will not find one; that is
 * the finding, not an omission.
 *
 * `org/Hibachi/HibachiService.cfc:L253` fixes the calling convention, verbatim: "NOTE: Ordered
 * arguments only--named arguments not supported." No member below takes a keyed options bag.
 *
 * --------------------------------------------------------------------------------------------------
 * TWO NAMES FOR ONE THING — `SwBrand` IS PHYSICAL, `SlatwallBrand` IS THE ORM NAME
 * --------------------------------------------------------------------------------------------------
 * `model/entity/Brand.cfc:L49` declares `entityname="SlatwallBrand" table="SwBrand"` on one line. The
 * logical name is the vocabulary of the mapping layer's own query language, and the prefix is applied
 * at run time by the application-key block that appears at FIVE separate sites in
 * `org/Hibachi/HibachiDAO.cfc` — `:L7-L10`, `:L29-L32`, `:L39-L42`, `:L80-L83` and `:L103-L106`.
 * Native statements name the physical table, and every statement in this file is native. The standing
 * warning is carried verbatim: never "fix" HQL entity names to `Sw*`, and never assume a logical name
 * works in native SQL.
 *
 * This file therefore uses `SwBrand` throughout, resolved once through `assertTableName` so the
 * identifier in every statement came from a validated whitelist rather than from a string literal at
 * the call site. There is no defect instance to carry here: with no legacy data-access component,
 * there is no legacy native statement that named the logical name by mistake.
 *
 * --------------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT — THE SERVICE/REPOSITORY SPLIT (IR-8)
 * --------------------------------------------------------------------------------------------------
 * `model/service/BrandService.cfc:L67-L77` is the legacy save path, and it does THREE things this
 * file deliberately does not. It inspects the entity's existing URL title together with the incoming
 * payload at `:L68`; it derives a unique URL title at `:L70` and `:L72`; and it forwards both values
 * to `super.save()` at `:L76`.
 *
 * ⚠️ That forwarding call resolves to the LOCAL override at `model/service/HibachiService.cfc:L86`,
 * which is Slatwall code inside the extraction path, NOT to the framework base at
 * `org/Hibachi/HibachiService.cfc`. The local override adds behaviour, so the distinction is
 * load-bearing rather than trivia. In the target, template-method inheritance is replaced by
 * composition against an injected base collaborator (`src/services/BaseService.ts`), and
 * `src/services/BrandService.ts` owns the URL-title derivation, the population and the validation.
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
 * NOT a carry-over annotation.
 *
 * What IS annotated below, each with its locator: the two `get()` behaviours deliberately not
 * reproduced (`org/Hibachi/HibachiDAO.cfc:L24` and `:L19`), the availability polarity
 * (`model/dao/DataDAO.cfc:L126-L130`), the test-enforced empty-collection default
 * (`meta/tests/unit/entity/BrandTest.cfc:L59`), the audit column-to-field divergence, and the reason
 * an update's affected-row count is unusable here while a removal's is authoritative — a distinction
 * measured against MySQL 8.4.11 rather than assumed, and recorded on the two members concerned. The
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
import type { SqlExecutor } from './QueryRunner';
import { assertColumnName, assertTableName } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import { mapBrandRow } from './rowMappers';

/* ==================================================================================================
 * VALIDATED IDENTIFIERS (AAP §0.7.3 S2)
 *
 * A `?` placeholder binds a VALUE and cannot substitute an identifier, so the table name and every
 * column name below are resolved ONCE, at module load, through the whitelist in `QueryRunner.ts`.
 * Both helpers raise when a name is not declared for the extracted Catalog schema, which means a
 * typo here fails at import time rather than at the first statement — and no caller-supplied string
 * can ever reach an identifier position, because no member of this file accepts one.
 * ============================================================================================== */

/** `SwBrand`, the physical table — `model/entity/Brand.cfc:L49`. */
const BRAND_TABLE = assertTableName('SwBrand');

/**
 * Every `SwBrand` column this file names, resolved through the per-table whitelist.
 *
 * The set is the entity's WHOLE persistent surface, which is unusually easy to state for this
 * entity: `model/entity/Brand.cfc` declares no non-persistent property at all (its non-persistent
 * section at `:L83-L85` contains nothing but its own banner comments), so there is no calculated
 * member to exclude and no boundary to draw inside the row. Contrast `model/entity/Product.cfc` and
 * `model/entity/Sku.cfc`, which declare twenty and twenty-three non-persistent properties
 * respectively and whose mappers must therefore be read alongside a scope boundary.
 *
 * ⚠️ THE TWO ACCOUNT KEYS ARE THE ONE PLACE COLUMN AND FIELD NAMES DIVERGE. The columns are
 * `createdByAccountID` and `modifiedByAccountID` — `fkcolumn` on the many-to-one declarations at
 * `model/entity/Brand.cfc:L78` and `:L80` — while the domain fields they carry are named
 * `createdByAccount` and `modifiedByAccount`. `rowMappers.ts` reads them in exactly that crossed
 * pairing, and the write path below binds them the same way round. Getting the pairing wrong is
 * silent in both directions: the whitelist would reject `createdByAccount` as a column, but nothing
 * would reject binding the WRONG FIELD to the right column.
 */
const BRAND_COLUMN = Object.freeze({
  /** Primary key: `fieldtype="id" generator="uuid" ormtype="string" length="32"`, minted in
   *  application code — `model/entity/Brand.cfc:L52` (IR-6). `unsavedvalue=""` is the source of the
   *  empty-string-means-new convention this file discriminates on. */
  brandID: assertColumnName(BRAND_TABLE, 'brandID'),
  /** `model/entity/Brand.cfc:L53`. */
  activeFlag: assertColumnName(BRAND_TABLE, 'activeFlag'),
  /** `model/entity/Brand.cfc:L54`. */
  publishedFlag: assertColumnName(BRAND_TABLE, 'publishedFlag'),
  /** `unique="true"` — `model/entity/Brand.cfc:L55`. One of the five unique columns in this slice,
   *  and the column the availability probe reads. */
  urlTitle: assertColumnName(BRAND_TABLE, 'urlTitle'),
  /** `model/entity/Brand.cfc:L56`. Required for the save context by `model/validation/Brand.json`,
   *  which is enforced above this boundary. */
  brandName: assertColumnName(BRAND_TABLE, 'brandName'),
  /** `hb_formatType="url"` — `model/entity/Brand.cfc:L57`. */
  brandWebsite: assertColumnName(BRAND_TABLE, 'brandWebsite'),
  /** `model/entity/Brand.cfc:L74`. */
  remoteID: assertColumnName(BRAND_TABLE, 'remoteID'),
  /** Audit timestamp — `model/entity/Brand.cfc:L77`. */
  createdDateTime: assertColumnName(BRAND_TABLE, 'createdDateTime'),
  /** Audit foreign key, carrying the `createdByAccount` FIELD — `model/entity/Brand.cfc:L78`. */
  createdByAccountID: assertColumnName(BRAND_TABLE, 'createdByAccountID'),
  /** Audit timestamp — `model/entity/Brand.cfc:L79`. */
  modifiedDateTime: assertColumnName(BRAND_TABLE, 'modifiedDateTime'),
  /** Audit foreign key, carrying the `modifiedByAccount` FIELD — `model/entity/Brand.cfc:L80`. */
  modifiedByAccountID: assertColumnName(BRAND_TABLE, 'modifiedByAccountID'),
});

/**
 * The columns the write path assigns, in `model/entity/Brand.cfc` declaration order.
 *
 * The primary key is deliberately absent: the insert names it FIRST and the update matches ON it, so
 * it is handled separately at both call sites rather than folded into this list.
 *
 * The list is complete rather than sparse, and that is a decision. Omitting an absent field from the
 * insert would let the database apply a column default, which is a different outcome from writing
 * the absence the entity actually holds — and `model/validation/Brand.json` supplies no defaults
 * while `model/entity/Brand.cfc` declares no calculated member to fall back on, so there is no
 * defaulting behaviour to reproduce (AAP §0.7.3 S9).
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

/** The bind placeholder. Named once so no statement below spells it inline. */
const BIND_PLACEHOLDER = '?';

/** The separator between projected columns, between column assignments and between placeholders. */
const CLAUSE_JOINER = ', ';

/**
 * Every `SwBrand` column, named explicitly: the read projection, and the insert's column list.
 *
 * A star projection would compile, run and hydrate correctly — `rowMappers.ts` reads columns by name
 * — and it is still the wrong choice here. Naming the columns keeps EVERY identifier in EVERY
 * statement in this file traceable to the whitelist, which is the property S2 is actually about, and
 * it makes the column set auditable against `model/entity/Brand.cfc:L52-L80` line by line. It also
 * means a column added to the table later cannot silently widen a read or acquire an implicit
 * default on an insert.
 *
 * The primary key leads and the writable columns follow in declaration order, so ONE ordering serves
 * both statements: the projection reads in the same order the insert writes.
 */
const BRAND_COLUMN_LIST = [BRAND_COLUMN.brandID, ...BRAND_WRITABLE_COLUMNS].join(CLAUSE_JOINER);

/* ==================================================================================================
 * INJECTED SEAM (AAP §0.7.3 S3, S6)
 * ============================================================================================== */

/**
 * The statement-execution surface this adapter needs.
 *
 * `SqlExecutor` from `QueryRunner.ts` is deliberately ONE member wide so a test can satisfy it with a
 * plain object literal, and that width is preserved: this interface EXTENDS it rather than replacing
 * it, adding exactly one member. The addition is forced rather than chosen — the read member
 * normalises a driver answer into rows and raises when the driver returns a write acknowledgement
 * instead of a row set, so an adapter that both reads and writes must name both members. This is the
 * same shape `MySqlSkuRepository.ts` declares for the same reason, and `QueryRunner` satisfies it
 * structurally, so the composition root injects ONE instance and both members run on the SAME
 * connection. See the M6 discussion in the module header for why that matters here.
 *
 * @example
 * ```ts
 * // A complete double: no mocking library, no database, no inheritance.
 * const calls: { sql: string; params: readonly unknown[] }[] = [];
 * const executor: BrandStatementExecutor = {
 *   execute: (sql, params) => { calls.push({ sql, params }); return Promise.resolve([]); },
 *   executeMutation: (sql, params) => { calls.push({ sql, params }); return Promise.resolve(1); },
 * };
 * ```
 */
export interface BrandStatementExecutor extends SqlExecutor {
  /**
   * Runs a data-modifying statement and returns the number of rows it AFFECTED.
   *
   * Matches `QueryRunner.executeMutation`, which is the port of the legacy `save()` and `delete()`
   * primitives at `org/Hibachi/HibachiDAO.cfc:L48-L67` and `:L69-L77`.
   *
   * ⚠️ THE COUNT MEANS DIFFERENT THINGS FOR DIFFERENT STATEMENTS, so the two members below read it
   * differently. For a removal it is rows REMOVED, and that holds however the connection was
   * negotiated. For an update it is rows MATCHED when the connection carries the driver's default
   * capability set, and rows CHANGED when `CLIENT_FOUND_ROWS` is withdrawn — the same statement over
   * the same data answers 1 in the first case and 0 in the second. Measured directly against MySQL
   * 8.4.11 through `mysql2` 3.23.2, the pinned runtime dependency; the server reports both figures in
   * its info text ("Rows matched: 1  Changed: 0") while the driver surfaces only one of them.
   * `src/config/database.ts` pins no capability flags, so an update's count is a property of the
   * connection rather than of the row. See {@link MySqlBrandRepository.saveBrand} and
   * {@link MySqlBrandRepository.deleteBrand} for how each path treats it.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

/* ==================================================================================================
 * THE ADAPTER
 * ============================================================================================== */

/**
 * MySQL implementation of {@link BrandRepository}.
 *
 * Five members, one injected collaborator, no state. Each member states which prefix branch of
 * `org/Hibachi/HibachiService.cfc:L258-L276` it replaces, which primitive of
 * `org/Hibachi/HibachiDAO.cfc:L6-L86` that branch reached, and — where the two diverge — exactly what
 * this port does instead and why.
 */
export class MySqlBrandRepository implements BrandRepository {
  /**
   * The injected statement executor.
   *
   * `private readonly`: nothing outside can borrow it and nothing inside replaces it, so no caller
   * can run a statement around this boundary and no member can quietly swap to a different
   * connection mid-operation. Its lifetime belongs to the composition root that supplied it (S3).
   *
   * Contrast the legacy alternative this replaces wholesale: `model/dao/ProductDAO.cfc` builds a
   * credential-reading connection inside the data-access layer itself at three separate sites,
   * `:L155-L158`, `:L329-L330` and `:L420`. This file reads no credential, resolves no host and
   * constructs no pool.
   */
  private readonly executor: BrandStatementExecutor;

  /**
   * @param executor - the statement executor, supplied by the composition root. Typed at the
   *   INTERFACE rather than at the concrete runner, so a hand-written double satisfies it with a
   *   plain object literal — which the legacy suite could never do, having no mocking library at all
   *   and booting the whole framework application instead (S6).
   */
  public constructor(executor: BrandStatementExecutor) {
    this.executor = executor;
  }

  /**
   * Instantiates a new, unpersisted brand.
   *
   * Replaces the `new` branch at `org/Hibachi/HibachiService.cfc:L264`, which reached `new()` at
   * `org/Hibachi/HibachiDAO.cfc:L38-L45` — a member whose whole body is an in-memory instantiation
   * (`:L44`) behind the application-key prefix block (`:L39-L42`).
   *
   * ⚠️ SYNCHRONOUS, AND THE ABSENCE OF A PROMISE IS DELIBERATE. No statement is issued, no
   * connection is acquired and the injected executor is not touched. A promise-returning signature
   * would compile perfectly and would then oblige every caller — production and double alike — to
   * await something that never yields, permanently encoding an I/O boundary that does not exist. The
   * port declares it synchronous; this implementation keeps it that way.
   *
   * ⚠️ NO IDENTIFIER IS MINTED HERE. The returned brand carries `brandID === ''`, which is what
   * `model/entity/Brand.cfc:L52` declares as `unsavedvalue` and what `Brand.isNew()` tests. Minting
   * an identifier at instantiation would make every fresh brand report itself as already persisted,
   * and {@link MySqlBrandRepository.saveBrand} would then take the update path for a row that does
   * not exist. Identifiers are minted on insert, and nowhere else (IR-6).
   *
   * ⚠️ THE EMPTY COLLECTION IS TEST-ENFORCED, NOT INCIDENTAL.
   * `meta/tests/unit/entity/BrandTest.cfc:L59` asserts `getProducts()` equals `[]` on an instance
   * obtained from exactly this call path (`:L55`), and that single assertion is the only
   * test-enforced default in the whole brand domain. `src/domain/product/Brand.ts` initialises the
   * collection to a live empty array at field level, so it holds `[]` here and never `undefined` or
   * `null`. It is handed out BY REFERENCE and is not frozen, copied or wrapped: the bidirectional
   * helpers at `model/entity/Brand.cfc:L98-L103` mutate collections in place, so a defensive copy
   * would break relationship maintenance several layers up with no error anywhere.
   *
   * WHY `manageEntity` IS CALLED. The port returns the MANAGED shape, because the legacy branch
   * produced an entity that already answered the introspection members and already owned an error
   * bean — both supplied by inheritance from `org/Hibachi/HibachiEntity.cfc`, which this port retires
   * for the slice. With no inheritance to lean on, that guarantee is composed explicitly instead.
   * The call mutates and returns the SAME object, so this member still allocates exactly one entity;
   * `rowMappers.ts` composes the read path identically, which is what keeps a new brand and a
   * hydrated brand the same shape.
   *
   * @returns A newly instantiated, unpersisted, already-managed brand. Never null or undefined.
   */
  public newBrand(): ManagedEntity<Brand> {
    return manageEntity(new Brand(), BRAND_ENTITY_METADATA);
  }

  /**
   * Reads one brand by its primary identifier.
   *
   * Replaces the `get` branch at `org/Hibachi/HibachiService.cfc:L258` and `:L262`, which reached
   * `get()` at `org/Hibachi/HibachiDAO.cfc:L6-L26`.
   *
   * TODO(parity) `org/Hibachi/HibachiDAO.cfc:L24` — THE `new()` FALLBACK IS DELIBERATELY NOT
   * REPRODUCED. The legacy primitive takes a third argument, `isReturnNewOnNotFound` (`:L6`), and
   * when it is true and nothing matched it returns a FRESHLY CONSTRUCTED, unsaved entity instead of
   * nothing (`:L23-L25`). That is mapping-session behaviour, and it makes a single member's result
   * flip between "the row, or nothing" and "always an entity" on a boolean — which cannot be typed
   * honestly without overloads. The port declares the one-argument form and the legacy default for
   * the flag is false, which is the behaviour the slice relies on. A caller that wants a fresh
   * instance calls {@link MySqlBrandRepository.newBrand} explicitly. Recorded as a documented
   * translation, not a silent drop.
   *
   * TODO(parity) `org/Hibachi/HibachiDAO.cfc:L19` — THE READ-TIME MUTATION IS NOT REPRODUCED EITHER.
   * The legacy primitive calls `entity.updateCalculatedProperties()` on every successful read, so a
   * plain read WROTE to the entity it returned and, through the mapping session, could enqueue that
   * change for the next flush. Nothing here mutates a hydrated brand: hydration is pure, and it is
   * pure for two independent reasons — the calculated properties that member refreshes reach
   * explicitly out-of-scope services (AAP §0.2.2.6), and `model/entity/Brand.cfc` declares no
   * calculated property at all, so for this entity there is provably nothing to refresh. Carried as
   * an annotation rather than repaired.
   *
   * ⚠️ AN EMPTY IDENTIFIER ISSUES NO STATEMENT, AND THAT IS PRESERVED BEHAVIOUR RATHER THAN AN
   * OPTIMISATION. `org/Hibachi/HibachiDAO.cfc:L12` guards the load with
   * `isSimpleValue(idOrFilter) && len(idOrFilter)`: for an empty identifier NEITHER branch of
   * `:L12-L16` runs, the local stays undefined, the `:L18` test fails and the member returns nothing.
   * So the legacy answer for an empty identifier is "no brand", reached WITHOUT touching the
   * database. The check is on length exactly and is NOT trimmed — a blank-but-non-empty identifier
   * has a non-zero length, so the legacy code would have issued the statement and matched nothing,
   * and so does this member.
   *
   * The struct-filter branch at `org/Hibachi/HibachiDAO.cfc:L14-L15` is not reproduced: the port
   * declares an identifier parameter, and a filtered read is the paginated surface's concern.
   *
   * ⚠️ THE IDENTIFIER IS BOUND, NEVER INTERPOLATED. Exactly one placeholder, carrying the identifier
   * as a value (S2).
   *
   * @param brandID - The brand's primary identifier: a 32-character string per IR-6.
   * @returns The matching brand, managed, or `null` when no row matches. Never undefined.
   * @throws {DataIntegrityError} When the primary key matches more than one row.
   */
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
   * requires.
   *
   * Replaces the `save` branch at `org/Hibachi/HibachiService.cfc:L268`, which reached `save()` at
   * `org/Hibachi/HibachiDAO.cfc:L48-L67`.
   *
   * ⚠️ THE INSERT-OR-UPDATE DECISION IS THE ENTITY'S OWN, NOT A PROBE'S. `Brand.isNew()` tests
   * `brandID === ''`, which is exactly the `unsavedvalue=""` declared at
   * `model/entity/Brand.cfc:L52`; the mapping layer made the same distinction from the same value.
   * A pre-flight existence read would be a second, competing source of truth for an answer the
   * entity already holds, and it would issue a statement the legacy path never issued.
   *
   * ⚠️ THE IDENTIFIER IS MINTED HERE AND ONLY HERE (IR-6). On the insert path the value comes from
   * `createSlatwallUUID()` in `src/util/uuid.ts` — the port of `createSlatwallUUID()`
   * [`model/dao/HibachiDAO.cfc:L51-L53`] and, through its delegation, of `createHibachiUUID()`
   * [`org/Hibachi/HibachiObject.cfc:L144-L146`], whose body lower-cases a generated identifier and
   * strips every dash. The result is 32 lowercase hexadecimal characters with no dashes, which is
   * what `ormtype="string" length="32"` requires. Never an auto-increment, never a dashed form,
   * never upper case. It is assigned to the entity BEFORE the statement is composed, so the brand
   * this member resolves carries the identifier the row was written with.
   *
   * ⚠️ THE AUDIT COLUMNS ARE WRITTEN AS THE ENTITY HOLDS THEM, AND ARE NOT SET HERE. The legacy
   * values are applied by the mapping layer's lifecycle hooks, whose port is
   * `src/domain/base/AuditableEntity.ts`; stamping them here would repeat the read-time mutation this
   * file explicitly declines to reproduce, in the other direction. Note the crossed pairing recorded
   * on {@link BRAND_COLUMN}: field `createdByAccount` binds to column `createdByAccountID` and field
   * `modifiedByAccount` binds to column `modifiedByAccountID`. Both account fields are optional
   * 32-character identifier strings rather than an account object — the account family is explicitly
   * out of scope — and they are GENUINELY absent when unset, so an unset one binds as SQL null. No
   * empty-string default is invented for them: `org/Hibachi/HibachiEntity.cfc:L291-L305` overrides
   * only the two timestamp getters to answer with an empty string, never the two foreign keys.
   *
   * ⚠️ THE ASSIGNMENT CLAUSE IS COMPOSED FROM THE WHITELIST, NEVER CONCATENATED FROM VALUES. Each
   * column contributes `column = ?` and each value is appended to a parallel parameter list in the
   * same order, so the statement text is a function of the whitelist alone and no caller-supplied
   * string can reach it (S2). This is the structural difference from the legacy importer's
   * value-interpolating assignment building, which is why the whole class of flaw cannot occur here.
   *
   * ⚠️ THE AFFECTED-ROW COUNT IS DELIBERATELY NOT INSPECTED ON THE UPDATE PATH, BECAUSE ON THAT PATH
   * THE COUNT DESCRIBES THE CONNECTION RATHER THAN THE ROW. Verified empirically against MySQL 8.4.11
   * through `mysql2` 3.23.2 rather than assumed: re-saving a brand whose stored column values are
   * already identical reports an affected count of 1 under the driver's default capability set, and 0
   * when `CLIENT_FOUND_ROWS` is withdrawn from that set. Identical statement, identical data, two
   * different numbers — the server itself distinguishes them ("Rows matched: 1  Changed: 0") but only
   * one figure reaches this port. Since `src/config/database.ts` pins no capability flags (S9 forbids
   * inventing a pin the source never made), neither number may become control flow here: reading it
   * would make correctness depend on an unpinned negotiation detail.
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
   * Removes a brand.
   *
   * Replaces the `delete` branch at `org/Hibachi/HibachiService.cfc:L270`, which reached `delete()`
   * at `org/Hibachi/HibachiDAO.cfc:L69-L77`. The legacy primitive is declared `void` and takes the
   * ENTITY (`:L69`), branching at `:L70-L73` to recurse over an array; the dispatcher hands it
   * whatever the caller passed, reading positional argument one by numeric index. The port declares
   * the single-entity form taking the entity, so that is what this member takes — narrowing the
   * parameter to an identifier string would look tidier and would silently offer callers an entry
   * point the legacy never had.
   *
   * ⚠️ THE DELETE GUARDS RUN ABOVE THIS BOUNDARY, NOT INSIDE IT. `model/validation/Brand.json`
   * bounds both `products` and `physicalCounts` at zero for the delete context; those rules are
   * ported as a typed rule set under `src/validation/rules/**` and evaluated by the service, exactly
   * as `model/service/HibachiService.cfc:L68-L73` gates its own removal on the outcome. A blocked
   * removal never reaches this member, which is why the result is a plain boolean and not a
   * validation outcome, and why nothing here inspects the products collection.
   *
   * ⚠️ A TRANSIENT BRAND IS REFUSED RATHER THAN TURNED INTO A STATEMENT. An entity that reports
   * itself new carries the empty identifier from `model/entity/Brand.cfc:L52`, so a removal keyed on
   * it would compose `WHERE brandID = ''` — a predicate that matches nothing in a sound table and
   * matches an arbitrary row in an unsound one. The mapping layer would have raised on the same
   * input, since a transient instance has no persistent identity to remove. Refusing it keeps a
   * programming fault loud instead of reporting a successful no-op, and the message is this port's
   * own.
   *
   * ⚠️ HERE THE AFFECTED-ROW COUNT IS EXACT AND IS THE ANSWER. Unlike an update, a removal's count is
   * rows REMOVED whatever capabilities the connection negotiated — measured as 1 for a present row
   * and 0 for an absent one against MySQL 8.4.11 both with and without `CLIENT_FOUND_ROWS`, so it
   * states a fact about the data rather than about the connection. That is precisely why this member
   * may build its result on the count while {@link MySqlBrandRepository.saveBrand} may not. So `true`
   * means this statement removed the row and `false` means there was no row to remove.
   *
   * Note that this is the ordinary polarity and deliberately NOT the inverted
   * availability polarity its neighbour {@link MySqlBrandRepository.isUrlTitleAvailable} carries —
   * the two booleans in this class mean unrelated things, so each states its own direction.
   *
   * ⚠️ NOTHING IS COMMITTED HERE (M5), for the same reason given on the save path.
   *
   * @param brand - The already-managed brand to remove.
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
   * The legacy primitive is `verifyUniqueTableValue`, declared with an explicit boolean return type
   * at `model/dao/DataDAO.cfc:L115`. Its body runs one existence read at
   * `model/dao/DataDAO.cfc:L123` and then INVERTS the obvious answer: `:L126-L128` returns FALSE when
   * a row IS found, and `:L130` returns TRUE otherwise. The system-wide uniqueness predicate reads
   * the same way — `org/Hibachi/HibachiDAO.cfc:L142-L144` returns false on a hit and `:L146` returns
   * true otherwise (IR-5). So the boolean answers "is this value still free?".
   *
   * TODO(parity) `model/dao/DataDAO.cfc:L126-L130` — INVERTING THIS IS COMPLETELY SILENT. It
   * produces no compile error, no type error and no lint finding, because both directions are
   * `Promise<boolean>` and the member name reads plausibly either way. The damage lands in the
   * consumer: `model/service/DataService.cfc:L62` probes once and `:L64` then loops `while(!unique)`
   * with NO iteration ceiling, re-probing at `:L67`. Invert the polarity and you get exactly one of
   * two outcomes — the loop never runs and duplicate URL titles reach a column declared
   * `unique="true"` at `model/entity/Brand.cfc:L55`, or every candidate is reported taken and the
   * loop never terminates. Neither raises anything. The polarity is carried, annotated and asserted
   * by test in both directions.
   *
   * WHAT THIS MEMBER DOES NOT OWN. The suffix rule is the caller's: `src/util/urlTitle.ts` ports
   * `model/service/DataService.cfc:L53-L71`, including the detail that `:L55` seeds the counter at
   * one and `:L65` increments BEFORE composing, so the first collision suffix is `-2` and `-1` is
   * never produced. That behaviour and the loop's unboundedness are governed by AAP §0.8.2
   * Guideline 4 and S9 and are neither reimplemented nor capped here.
   *
   * WHY ONE PARAMETER. The legacy primitive is generic over three — a table, a column and a value
   * (`model/dao/DataDAO.cfc:L116-L118`) — but on this path the first two are CONSTANTS, verified on
   * both sides: the column is pinned to `urlTitle` by the algorithm's only two probe sites
   * (`model/service/DataService.cfc:L62` and `:L67`) and the table is pinned to `SwBrand` by its only
   * two brand callers (`model/service/BrandService.cfc:L70` and `:L72`). Accepting either through
   * this signature would hand a caller-supplied string to an identifier position, which is what
   * `model/dao/DataDAO.cfc:L123` does and what S2 forbids. So both identifiers come from the
   * module-level whitelist and only the candidate value is bound.
   *
   * ⚠️ STRUCTURALLY — AND ONLY STRUCTURALLY — THIS SATISFIES THE NARROW PROBE FUNCTION TYPE THAT
   * `src/util/urlTitle.ts` DECLARES FOR ITSELF, once its table argument is bound to `SwBrand`. That
   * type is deliberately NOT imported: structural compatibility is sufficient, and keeping the
   * adapter layer off the utility layer's type surface means neither module re-exports the other's
   * declaration. The general, table-taking form of the same probe lives in
   * `UniquePropertyChecker.ts`, cited by path and not delegated to, so this narrowing does not become
   * a second general implementation (IR-5).
   *
   * ⚠️ NO MEMOIZATION, AND IT MUST STAY THAT WAY (M7). The consumer calls this an unbounded number
   * of times for one derivation and every call MUST read current state. A cache would make the
   * collision loop non-terminating on its first collision, and on a warm container it would leak one
   * invocation's answer into the next.
   *
   * ⚠️ IT MUST RUN ON THE INJECTED EXECUTOR (M6). Inside a unit of work, this read has to observe
   * sibling brands the same transaction has inserted and not yet committed; a probe that reached past
   * the injected executor to a pool would report a taken title as available with nothing to show for
   * it.
   *
   * @param urlTitle - The candidate value to test. Bound as a parameter, never interpolated.
   * @returns `true` when no brand row already carries the value — it is AVAILABLE — and `false` when
   *   one does. Never null.
   */
  public async isUrlTitleAvailable(urlTitle: string): Promise<boolean> {
    const sql =
      `SELECT ${BRAND_COLUMN.urlTitle} FROM ${BRAND_TABLE} ` +
      `WHERE ${BRAND_COLUMN.urlTitle} = ${BIND_PLACEHOLDER}`;

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

  /**
   * Reads at most one row from a result set, refusing an ambiguous answer.
   *
   * Private, and deliberately not on {@link BrandRepository}: it is a row-shape guard, not a
   * persistence capability. The legacy read had no equivalent because a primary-key load through the
   * mapping layer could not return two instances; a hand-composed statement can, if the underlying
   * key is not what it is declared to be. Returning the first of several rows would make a schema
   * fault look like a successful read, which is precisely the failure mode that is impossible to
   * diagnose later.
   *
   * @param rows - The rows the statement produced.
   * @param matchedOn - How the rows were selected, for the error context. Never a value.
   * @returns The single row, or `null` when there were none.
   * @throws {DataIntegrityError} When more than one row matched.
   */
  private readAtMostOneRow(rows: readonly MySqlRow[], matchedOn: string): MySqlRow | null {
    if (rows.length > 1) {
      throw new DataIntegrityError(
        'A brand read that can match at most one row matched several, so the result is ambiguous ' +
          'and no brand was hydrated from it.',
        { context: { table: BRAND_TABLE, matchedOn, rowCount: rows.length } },
      );
    }

    /*
     * Indexed reads are checked, so the element type is `MySqlRow | undefined` and the guard is the
     * compiler's requirement rather than defensive habit. Absence becomes `null`, which is the
     * vocabulary the port declares for "no such row".
     */
    const row = rows[0];
    return row === undefined ? null : row;
  }

  /**
   * Collects the column values for the write path, in the exact order of {@link
   * BRAND_WRITABLE_COLUMNS}.
   *
   * The two lists are read together at both call sites, so they are composed from one ordering and
   * that ordering is `model/entity/Brand.cfc`'s own declaration order. A value and a column that
   * disagreed on position would bind a URL title into a brand name with nothing to report it, so the
   * pairing is stated once, here, rather than at each statement.
   *
   * ABSENT MEANS NULL AT THE BOUNDARY, AND THAT IS NOT A CONTRADICTION OF THE DOMAIN CONVENTION. The
   * domain expresses a legacy null by the ABSENCE of a property — `src/domain/base/populate.ts`
   * deletes the key rather than assigning `undefined`, and `rowMappers.ts` hydrates a null column
   * into an absent property for the same reason. A bind position, however, cannot express absence:
   * the driver's parameter list is positional and every column in the statement needs one value. So
   * absence is translated to SQL null exactly at this seam, and nowhere earlier.
   *
   * @param brand - The brand whose values are being written.
   * @returns One bindable value per writable column, in column order.
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
      /* Field `createdByAccount` -> column `createdByAccountID` — `model/entity/Brand.cfc:L78`. */
      brand.createdByAccount ?? null,
      brand.modifiedDateTime ?? null,
      /* Field `modifiedByAccount` -> column `modifiedByAccountID` — `model/entity/Brand.cfc:L80`. */
      brand.modifiedByAccount ?? null,
    ];
  }
}
