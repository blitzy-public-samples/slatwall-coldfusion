/**
 * `MySqlProductRepository` — the MySQL implementation of `ProductRepository`, and the ONE file in
 * the whole port where behaviour is deliberately not preserved.
 *
 * Legacy origin: `model/dao/ProductDAO.cfc` (441 lines). AAP §0.4.1.7 row 3 specifies this file as
 * "Attribute-set query with defect D20 (the engine-divergence conditional) declared as an intentional
 * single-path simplification; the importer's per-row transaction boundary preserved; all 21
 * interpolated statements replaced with parameterized equivalents — the single declared departure
 * from byte-for-byte preservation, documented as defect D18".
 *
 * Every legacy file cited below is REFERENCE-ONLY and is never modified (AAP §0.4.1.1, TR-6).
 *
 * =================================================================================================
 * ⭐ D18 — THE ONE DECLARED EXCEPTION TO "PRESERVE AND ANNOTATE, DO NOT REPAIR" (AAP §0.7.3 S7)
 * =================================================================================================
 * Every other carried defect in this folder is annotated and left exactly as it behaves. D18 is not.
 * It is CLOSED here, on purpose, and this block is the declaration AAP §0.6.7.7 requires — because a
 * silent parameterization would look identical in a diff to an accidental rewrite, and a reviewer
 * comparing this file's statements against `model/dao/ProductDAO.cfc` would have no way to tell
 * deliberate hardening from a mistake. AAP §0.8.5 makes that trail a requirement, so the fix is
 * announced rather than performed quietly.
 *
 * WHAT D18 IS. `model/dao/ProductDAO.cfc` composes statement text with `setSql()` and interpolates
 * values straight into it. The importer's values come from an UPLOADED FILE, so the interpolation is
 * an unparameterized SQL-injection surface fed by untrusted input. This port routes every statement
 * through prepared execution with `?` placeholders, which removes the entire class of flaw
 * structurally rather than by care taken at each call site.
 *
 * WHAT D18 IS NOT. It is NOT a `TODO(parity)` marker, because nothing is being carried forward — the
 * defect is being deliberately closed, and marking it as parity work would misdescribe it.
 *
 * ⚠️ THE PRECISION MATTERS, AND OVER-CLAIMING MISLEADS AS BADLY AS UNDER-CLAIMING. The counted sites
 * are not uniformly file-fed injections, and this file says which are which:
 *   - FULLY STATIC, zero interpolation ⇒ D22 identifier translation ONLY, no injection at all:
 *     `model/dao/ProductDAO.cfc:L289` and `:L295`.
 *   - INTERPOLATE A SETTING rather than file data ⇒ still a value that must become a bound `?`, but
 *     not untrusted input: `model/dao/ProductDAO.cfc:L305`, `:L311` and `:L318`.
 *   - THE FILE-FED INJECTION SUBSET, which is what "D18" actually names:
 *     `model/dao/ProductDAO.cfc:L164`, `:L179`, `:L183`, `:L385`, `:L393`, `:L401`, `:L411`, plus the
 *     per-row body at `:L200-L280`.
 * All of them are parameterized uniformly; only the third group is an injection.
 *
 * ⚠️ COUNT CORRECTION, CARRIED HERE ON PURPOSE. AAP §0.4.1.7 counts 21 interpolated statements.
 * Reading the source directly finds TWENTY-TWO `setSql`/`setSQL` call sites:
 * `model/dao/ProductDAO.cfc:L164`, `:L179`, `:L183`, `:L212`, `:L218`, `:L224`, `:L231`, `:L243`,
 * `:L249`, `:L261`, `:L270`, `:L276`, `:L289`, `:L295`, `:L305`, `:L311`, `:L318`, `:L385`, `:L393`,
 * `:L401`, `:L411` — the twenty-one the AAP counts — and a twenty-second at `:L427`, inside
 * `searchProductsByProductType`, which was ALREADY properly parameterized and therefore never part of
 * the defect. The corrected count is recorded rather than quietly reconciled.
 *
 * TWO CONSEQUENCES OF THE PARAMETERIZATION THAT ARE BEHAVIOUR CHANGES IN THEIR OWN RIGHT, both
 * declared here so neither reads as an accident:
 *   1. IDENTIFIERS ARE NOW WHITELISTED. `?` binds values only, so every table and column name is
 *      resolved through {@link assertTableName} / {@link assertColumnName}. A file heading naming a
 *      column the schema does not declare is REFUSED before any statement text exists, where the
 *      legacy would have emitted it and let the database reject the statement. The failure moves
 *      earlier and becomes typed; the outcome — the row is not imported — is unchanged.
 *   2. THE QUOTED-VERSUS-UNQUOTED BRANCH DISAPPEARS. `model/dao/ProductDAO.cfc:L350-L354` and
 *      `:L370-L374` choose between `col=value` and `col='value'` according to whether the column name
 *      ends in `Flag` or `Weight`. That branch existed ONLY to control quoting inside interpolated
 *      text and has no analogue once every value is bound, so it is not reproduced. Note the legacy
 *      edge it also implies: an EMPTY flag cell produced `col=,` — a syntax error — whereas a bound
 *      empty string reaches the column as a value. The legacy statement failed; this one does not.
 *
 * =================================================================================================
 * WHAT CHANGED, AND WHAT MAY NEVER CHANGE (the Minimal Change Clause, AAP §0.8.1)
 * =================================================================================================
 * The clause has two halves and the line between them is BEHAVIOUR. Idiom changes freely: string-built
 * statements become prepared ones, `new Query()` becomes an injected executor, CFML query columns
 * become typed rows, one-based loops become zero-based, `structKeyExists` guards become optional
 * parameters, and the trailing `;` the legacy embeds in every interpolated string is dropped because a
 * prepared statement is a single statement.
 *
 * Behaviour does not change at all: the void return that reports nothing, the per-row commit boundary,
 * the two back-fills that run inside no transaction, the empty spreadsheet branch that imports nothing
 * without error, the two-extension delimiter map, the priority-ordered first-match-wins lookup column,
 * the reverse-order option-group pre-pass, the single pre-loop timestamp, the single-append URL-title
 * strategy that never re-probes, the wildcard applied inside this file, both guard strictnesses of
 * Discrepancy 6, and the preserved HQL shaping at `model/dao/ProductDAO.cfc:L56-L61`.
 *
 * AAP §0.8.2 Guideline 6 names this file's subject matter as the primary site of the
 * document-every-judgement-call requirement, so every judgement call below is commented where it is
 * made.
 *
 * =================================================================================================
 * TODO(parity) D22 `model/dao/ProductDAO.cfc` — LOGICAL ENTITY NAMES VERSUS PHYSICAL TABLE NAMES
 * =================================================================================================
 * `model/dao/ProductDAO.cfc` contains 74 `Slatwall*` occurrences, and most of them sit in NATIVE SQL
 * rather than in HQL: 26 `SlatwallProduct`, 24 `SlatwallSku`, 5 `SlatwallOptionGroup`, 5
 * `SlatwallOption`, 3 bare `Slatwall`, 2 `SlatwallSkuOption`, 2 `SlatwallScope`, 2
 * `SlatwallProductContent`, 2 `SlatwallAttributeValue`, 1 `SlatwallProductType`, 1 `SlatwallBrand`,
 * 1 `SlatwallAttributeSet`. They resolve at all only because `org/Hibachi/HibachiDAO.cfc:L102-L106`
 * prefixes the application key onto entity names, which makes `Slatwall*` the legitimate ORM
 * vocabulary while the physical tables are `SwProduct`, `SwSku`, `SwProductType`, `SwBrand`,
 * `SwOption`, `SwOptionGroup` and `SwSkuOption`.
 *
 * Every native-SQL logical name below is translated to its physical name through
 * {@link assertTableName}. The rule to carry forward: never 'fix' HQL entity names to `Sw*`, and
 * never assume a logical name works in native SQL.
 *
 * ⚠️ `getSlatwallScope()` at `model/dao/ProductDAO.cfc:L153` and `:L341` is NOT SQL. It is the ambient
 * framework-scope accessor, and it becomes {@link AccountContextPort} — never a table.
 *
 * =================================================================================================
 * EXECUTION-MODEL MISMATCHES: M3 AND M4 ARE OWNED HERE (AAP §0.6.6, §0.7.3 S8)
 * =================================================================================================
 * M3 — ONE TRANSACTION PER ROW, AND TWO STATEMENTS INSIDE NO TRANSACTION AT ALL. The record loop opens
 * at `model/dao/ProductDAO.cfc:L176` and `transaction{` opens INSIDE it at `:L177`, closing at
 * `:L284-L285`. The importer's real shape is therefore N single-row transactions followed by two
 * untransacted back-fills at `:L287-L325`. A mid-file failure leaves a PARTIALLY IMPORTED CATALOG, and
 * that is the behaviour to preserve: nothing here wraps the loop in one transaction, batches rows, or
 * adds a roll-back-everything path.
 *
 * ⭐ ONE CONSEQUENCE OF M3 SHAPES WHERE THIS PORT'S ONE IMPORT BOUNDARY IS CHECKED. Preserving per-row
 * commits means any refusal raised from inside the row body abandons the file half-imported. That is the
 * correct outcome for a failure the LEGACY also has — a missing heading, a value the engine rejects — and
 * the wrong outcome for a step the legacy COMPLETES and this port declines to reach: the partial
 * catalogue would then be an artefact of the port. The content-assignment step at `:L257-L282` is the
 * only such step, so its refusal is PREFLIGHTED over the whole record set before the first boundary
 * opens (see {@link MySqlProductRepository.refuseRequestedContentAssignments}). No other check moved,
 * and M3's shape is unchanged for every import inside the boundary.
 *
 * M4 — REMOTE RETRIEVAL, AND A CORRECTION TO THE AAP. AAP §0.6.6 describes "a `new http()` fallback at
 * [L88-L90]". That is factually wrong and the locators show it: `/*` opens at
 * `model/dao/ProductDAO.cfc:L89` and `*` + `/` closes at `:L98`, so the block is COMMENTED-OUT DEAD
 * CODE, and the comment above it at `:L88` records why it was abandoned. There is exactly ONE live
 * retrieval, at `:L87`, and no fallback exists to port.
 * ⚠️ THIS FILE PERFORMS NO NETWORK INPUT OR OUTPUT. `:L87` resolves its collaborator by runtime string
 * lookup and never declares it as a component property, so metadata-driven dependency analysis misses
 * it entirely — the same trap AAP §0.6.3.2 records for the SKU service's image collaborator. Rule R2
 * of AAP §0.4.3.2 replaces such a lookup with a typed constructor dependency, so the retrieval
 * collaborator is INJECTED (see {@link ProductImportSourceReader}) and no transport client, no URL
 * handling and no streaming logic lives here. `mysql2` remains the sole runtime dependency (S5).
 *
 * M1 — CITED, NOT OWNED. `model/service/ProductService.cfc:L65-L68` raises the request budget to 3600
 * seconds before delegating. That is unrepresentable in one function invocation, and the out-of-band
 * model it needs belongs to `src/handlers/productHandler.ts` (AAP §0.4.1.9). No timeout, chunk size or
 * retry figure is stated anywhere in this file (S9).
 *
 * M5 — CITED. The error-gated commit lives in `UnitOfWork.ts`.
 *
 * M6 — APPLIES TRANSITIVELY. Every read and write inside a per-row boundary runs on that boundary's
 * own executor. Nothing here reaches past it to the pool.
 *
 * M7 — OWNED AS A PROHIBITION. There is no module-scope mutable state and no instance-level
 * accumulating cache in this file. Repositories are singletons on a warm container, so the option-group
 * identifier map built at `model/dao/ProductDAO.cfc:L171` is held as PER-IMPORT LOCAL STATE and never
 * on the instance.
 *
 * M8 — CITED. {@link AccountContextPort} is synchronous, and so is every collaborator this file
 * declares that resolves configuration.
 *
 * =================================================================================================
 * THREE CONNECTION-CONSTRUCTION SITES THIS FILE REPRODUCES NONE OF (AAP §0.7.3 S3)
 * =================================================================================================
 * The legacy DAO builds its own connection three times, reading credentials off application scope each
 * time: `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L332` and `:L420`. Note the casing drift between
 * `setDatasource` at `:L156` and `setDataSource` at `:L330`, which is the kind of detail that survives
 * only because nothing ever checked it.
 *
 * This file reads no credential, constructs no pool and opens no connection. It receives a
 * {@link ProductStatementExecutor} and a {@link ProductImportTransactionBoundary} by constructor
 * injection, wired once at the composition root. It also reproduces none of the legacy's three hidden
 * dynamic collaborators as string lookups: `utilityTagService` at `:L87`, `hibachiUtilityService` at
 * `:L399`, and the scope accessor at `:L153`/`:L341` are all typed constructor parameters here.
 *
 * =================================================================================================
 * ⚠️ ONE TABLE IS REFUSED OUTRIGHT
 * =================================================================================================
 * `model/dao/ProductDAO.cfc:L261-L264` joins Mura CMS's `tContent` table — a different application's
 * schema, reached from inside the Catalog importer. It is deliberately NOT whitelisted in
 * `QueryRunner.ts` and must never be: admitting it would extend this port into an external CMS's
 * physical schema, which no part of the AAP's scope permits. The content-assignment step is therefore a
 * declared boundary; see {@link MySqlProductRepository.importFromFile} for exactly when it is reached
 * and what happens then. The name appears in this file only in these annotations, never in statement
 * text and never in a whitelist.
 *
 * =================================================================================================
 * THE PORTED DAO CENSUS IS CLOSED AT FOUR, PLUS THE TWO DATA-ACCESS PRIMITIVES THE SAVE AND DELETE
 * PATHS REACH DIRECTLY (AAP §0.4.1.7, PHASE 9)
 * =================================================================================================
 * `model/dao/ProductDAO.cfc` is one `<cfscript>` block spanning `:L51-L438`, so — unlike
 * `model/dao/SkuDAO.cfc`, whose two private helpers hide in tag syntax at `:L204` and `:L222` — there
 * are provably no tag-syntax members to overlook. The four are `getAttributeSets` `:L52-L71`,
 * `loadDataFromFile` `:L73-L326`, the PRIVATE `saveImportData` `:L328-L417`, and
 * `searchProductsByProductType` `:L419-L437`. Three of those four are public and constitute the whole
 * of {@link ProductRepository}.
 *
 * ⭐ TWO FURTHER PUBLIC MEMBERS PORT WRITES THE LEGACY DAO NEVER DECLARED, AND THEY ARE ON THE PORT:
 * `saveProduct` and `removeProduct`. They are not additions to the product DAO's surface — they are the
 * ports of two `org/Hibachi/HibachiDAO.cfc` primitives that the product paths reach WITHOUT going
 * through any DAO interface. `model/service/ProductService.cfc:L287` calls
 * `getHibachiDAO().save( target=arguments.product )` directly, and the delete path reaches
 * `getHibachiDAO().delete( target=arguments.entity )` at `org/Hibachi/HibachiService.cfc:L64` through
 * the composed base service. Both primitives are DATA ACCESS, so this file is where they belong.
 *
 * ⚠️ THEY ARE DECLARED ON {@link ProductRepository} RATHER THAN ON THIS CLASS ALONE, AND THE REASON IS A
 * RECORDED FINDING. `src/services/ProductService.ts` requires a `persistProduct: EntityPersister<Product>`
 * and the only `SwProduct` writes in the adapter layer belonged to `importFromFile` — a per-row column
 * subset with no update form, no audit stamp and no foreign keys. Nothing could satisfy the persister, so
 * the whole save path terminated in an unwireable collaborator; the F03 account on
 * {@link ProductRepository.saveProduct} carries it in full. The service still consumes them through the
 * one-member `EntityPersister` and `EntityRemover` callbacks `src/services/BaseService.ts` declares, so
 * no service holds a repository reference and no generic CRUD port is invented.
 *
 * Nothing else is added. `getProduct`, `newProduct` and `getProductSmartList` are synthesized by
 * `org/Hibachi/HibachiService.cfc:L255-L281` and are declared on `ProductService`, not here;
 * the SERVICE-level `saveProduct` and `deleteProduct` — with their populate, URL-title, validation and
 * null-dance steps — remain `ProductService` members at `model/service/ProductService.cfc` `:L264` and
 * `:L317`, and only the data-access primitives beneath them live here;
 * `getProductOptionsByGroup` is called at `model/entity/Product.cfc:L631-L633`
 * against a service method that does not exist (D5, cited not owned) and is not supplied;
 * `integrationServices/google/model/dao/FeedDAO.cfc` is dead code carrying ONE parse failure — the
 * `SELECT` list terminated by a comma immediately before `FROM`, `FeedDAO.cfc:L58` — and, separately,
 * ONE SEMANTIC fault: the `INNER JOIN SwProduct` at `:L62-L63` supplies no `ON` predicate, which MySQL
 * accepts as a Cartesian product rather than rejecting. Only the first proves the method could never
 * have run; the second describes what it would have MEANT had it parsed. The itemised evidence and that
 * classification live in `src/integrations/google/README.md` §9, D12's single home under AAP §0.4.1.10
 * (D12, cited not owned), and the file is neither ported nor deleted; `model/dao/DataDAO.cfc` is out of scope
 * because AAP §0.6.3.1 narrows the data service to the single URL-title algorithm now living in
 * `src/util/urlTitle.ts`.
 */

import {
  assertColumnName,
  assertTableName,
  prepareBoundedRead,
  settleBoundedRead,
} from './QueryRunner';
import { createSlatwallUUID } from '../../util/uuid';
import { DataIntegrityError, DomainError, NotImplementedError } from '../../errors/DomainError';
import type { Product } from '../../domain/product/Product';
import type { DefaultSkuIdReader } from '../../domain/sku/Sku';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../domain/base/AuditableEntity';
import { mapProductSearchRow, mapRows } from './rowMappers';
/*
 * F5 — the ONLY cross-family adapter import in this file, and the reason it is here rather than the
 * value being injected. `DEPRECATED_SETTING_DEFAULTS` is the settings module's table of source-backed
 * defaults for legacy names the port's closed union deliberately excludes; reading it keeps every
 * setting value this port uses enumerable from one module. It is safe in both directions that matter:
 * `../settings/StaticSettingResolver` imports only `../../domain/BaseProductType`,
 * `../../errors/DomainError` and a type-only port, so nothing reaches back into `./` and no cycle is
 * possible; and it touches no configuration, so importing it does not put this file on the
 * `src/config/**` load path that the adapter layer must stay off.
 */
import { DEPRECATED_SETTING_DEFAULTS } from '../settings/StaticSettingResolver';

import type { AccountContextPort } from '../../ports/AccountContextPort';
import type { BoundedReadResult, BoundedReadWindow } from '../../ports/repositories/BoundedRead';
import type { MySqlRow } from './rowMappers';
import type { PhysicalTableName, SqlMutationExecutor } from './QueryRunner';
import type { TransactionScope, UnitOfWork } from './UnitOfWork';
import type {
  AttributeSetRow,
  ProductImportOptions,
  ProductRepository,
  ProductSearchRow,
} from '../../ports/repositories/ProductRepository';

/* ================================================================================================
 * PHYSICAL IDENTIFIERS — EVERY ONE VALIDATED, NONE INTERPOLATED (S2, D22)
 * ==============================================================================================
 * Each table constant is produced by passing the LEGACY LOGICAL NAME to {@link assertTableName}, so the
 * D22 translation happens in code rather than in a comment and a reviewer can read the legacy
 * vocabulary and the physical result side by side. Each column constant is validated against the table
 * it belongs to, so a well-formed name applied to the wrong table is a load-time failure.
 * ============================================================================================== */

/** `SlatwallProduct` ⇒ `SwProduct` [`model/entity/Product.cfc:L49`]. */
const PRODUCT_TABLE: PhysicalTableName = assertTableName('SlatwallProduct');

/** `SlatwallSku` ⇒ `SwSku` [`model/entity/Sku.cfc:L49`]. */
const SKU_TABLE: PhysicalTableName = assertTableName('SlatwallSku');

/** `SlatwallProductType` ⇒ `SwProductType` [`model/entity/ProductType.cfc:L49`]. */
const PRODUCT_TYPE_TABLE: PhysicalTableName = assertTableName('SlatwallProductType');

/** `SlatwallBrand` ⇒ `SwBrand` [`model/entity/Brand.cfc:L49`]. */
const BRAND_TABLE: PhysicalTableName = assertTableName('SlatwallBrand');

/** `SlatwallOption` ⇒ `SwOption` [`model/entity/Option.cfc:L49`]. */
const OPTION_TABLE: PhysicalTableName = assertTableName('SlatwallOption');

/** `SlatwallOptionGroup` ⇒ `SwOptionGroup` [`model/entity/OptionGroup.cfc:L49`]. */
const OPTION_GROUP_TABLE: PhysicalTableName = assertTableName('SlatwallOptionGroup');

/** `SlatwallSkuOption` ⇒ `SwSkuOption`, the link table [`model/entity/Sku.cfc:L76`]. */
const SKU_OPTION_TABLE: PhysicalTableName = assertTableName('SlatwallSkuOption');

/** `SwProduct.productID` — the identifier column named at `model/dao/ProductDAO.cfc:L193`. */
const PRODUCT_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'productID');

/** `SwProduct.productName` — projected by the search at `model/dao/ProductDAO.cfc:L421`. */
const PRODUCT_NAME_COLUMN = assertColumnName(PRODUCT_TABLE, 'productName');

/** `SwProduct.productCode` — read by the second back-fill at `model/dao/ProductDAO.cfc:L307`. */
const PRODUCT_CODE_COLUMN = assertColumnName(PRODUCT_TABLE, 'productCode');

/** `SwProduct.urlTitle` — probed and written by `model/dao/ProductDAO.cfc:L401-L408`. */
const PRODUCT_URL_TITLE_COLUMN = assertColumnName(PRODUCT_TABLE, 'urlTitle');

/** `SwProduct.productTypeID` — the search's optional filter at `model/dao/ProductDAO.cfc:L424`. */
const PRODUCT_PRODUCT_TYPE_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'productTypeID');

/** `SwProduct.defaultSkuID` — the target of the first back-fill, `model/dao/ProductDAO.cfc:L291`. */
const PRODUCT_DEFAULT_SKU_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'defaultSkuID');

/* `SwProduct.brandID` — the many-to-one at [`model/entity/Product.cfc:L66`].
 *
 * Declared ONCE and used by BOTH groups: the importer's brand lookup below, and the generic entity write
 * added for F03, whose own column block would otherwise have redeclared it. */
const PRODUCT_BRAND_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'brandID');

/** `SwSku.skuID` — the identifier column named at `model/dao/ProductDAO.cfc:L207`. */
/* ------------------------------------------------------------------------------------------------
 * THE REMAINING `SwProduct` COLUMNS, ADDED FOR THE GENERIC WRITE (F03)
 *
 * The constants above serve the importer's lookups, which touch only the handful of columns a
 * spreadsheet row supplies. A generic entity write has to name EVERY persistent column, so the rest are
 * declared here. Sources: `model/entity/Product.cfc:L53-L59` for the scalars, `:L62-L65` for the four
 * PERSISTED calculated columns, `:L69-L71` for the three foreign keys, `:L93` for the remote identifier
 * and `:L96-L99` for the audit columns.
 * ---------------------------------------------------------------------------------------------- */

/** [`model/entity/Product.cfc:L53`] */
const PRODUCT_ACTIVE_FLAG_COLUMN = assertColumnName(PRODUCT_TABLE, 'activeFlag');

/** [`model/entity/Product.cfc:L57`] */
const PRODUCT_DESCRIPTION_COLUMN = assertColumnName(PRODUCT_TABLE, 'productDescription');

/** [`model/entity/Product.cfc:L58`] */
const PRODUCT_PUBLISHED_FLAG_COLUMN = assertColumnName(PRODUCT_TABLE, 'publishedFlag');

/** [`model/entity/Product.cfc:L59`] */
const PRODUCT_SORT_ORDER_COLUMN = assertColumnName(PRODUCT_TABLE, 'sortOrder');

/** [`model/entity/Product.cfc:L62`] — `ormtype="big_decimal"`. */
const PRODUCT_CALCULATED_SALE_PRICE_COLUMN = assertColumnName(PRODUCT_TABLE, 'calculatedSalePrice');

/** [`model/entity/Product.cfc:L63`] */
const PRODUCT_CALCULATED_QATS_COLUMN = assertColumnName(PRODUCT_TABLE, 'calculatedQATS');

/** [`model/entity/Product.cfc:L64`] */
const PRODUCT_CALCULATED_ALLOW_BACKORDER_FLAG_COLUMN = assertColumnName(
  PRODUCT_TABLE,
  'calculatedAllowBackorderFlag',
);

/** [`model/entity/Product.cfc:L65`] */
const PRODUCT_CALCULATED_TITLE_COLUMN = assertColumnName(PRODUCT_TABLE, 'calculatedTitle');

/** [`model/entity/Product.cfc:L93`] */
const PRODUCT_REMOTE_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'remoteID');

/** [`model/entity/Product.cfc:L96`] */
const PRODUCT_CREATED_DATE_TIME_COLUMN = assertColumnName(PRODUCT_TABLE, 'createdDateTime');

/** [`model/entity/Product.cfc:L97`] */
const PRODUCT_CREATED_BY_ACCOUNT_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'createdByAccountID');

/** [`model/entity/Product.cfc:L98`] */
const PRODUCT_MODIFIED_DATE_TIME_COLUMN = assertColumnName(PRODUCT_TABLE, 'modifiedDateTime');

/** [`model/entity/Product.cfc:L99`] */
const PRODUCT_MODIFIED_BY_ACCOUNT_ID_COLUMN = assertColumnName(
  PRODUCT_TABLE,
  'modifiedByAccountID',
);

/**
 * Every writable `SwProduct` column in one fixed order, excluding the identifier.
 *
 * The identifier is handled separately because an insert LISTS it while an update MATCHES on it. The
 * order is arbitrary but must be stable, because the value array is built by walking the same sequence.
 */
const PRODUCT_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  PRODUCT_ACTIVE_FLAG_COLUMN,
  PRODUCT_URL_TITLE_COLUMN,
  PRODUCT_NAME_COLUMN,
  PRODUCT_CODE_COLUMN,
  PRODUCT_DESCRIPTION_COLUMN,
  PRODUCT_PUBLISHED_FLAG_COLUMN,
  PRODUCT_SORT_ORDER_COLUMN,
  PRODUCT_CALCULATED_SALE_PRICE_COLUMN,
  PRODUCT_CALCULATED_QATS_COLUMN,
  PRODUCT_CALCULATED_ALLOW_BACKORDER_FLAG_COLUMN,
  PRODUCT_CALCULATED_TITLE_COLUMN,
  PRODUCT_BRAND_ID_COLUMN,
  PRODUCT_PRODUCT_TYPE_ID_COLUMN,
  PRODUCT_DEFAULT_SKU_ID_COLUMN,
  PRODUCT_REMOTE_ID_COLUMN,
  PRODUCT_CREATED_DATE_TIME_COLUMN,
  PRODUCT_CREATED_BY_ACCOUNT_ID_COLUMN,
  PRODUCT_MODIFIED_DATE_TIME_COLUMN,
  PRODUCT_MODIFIED_BY_ACCOUNT_ID_COLUMN,
]);

const SKU_ID_COLUMN = assertColumnName(SKU_TABLE, 'skuID');

/** `SwSku.productID` — the join column both back-fills use, `model/dao/ProductDAO.cfc:L290`. */
const SKU_PRODUCT_ID_COLUMN = assertColumnName(SKU_TABLE, 'productID');

/**
 * `SwSku.imageFile` — the target of the second back-fill, `model/dao/ProductDAO.cfc:L307`.
 *
 * ⚠️ Not to be confused with the DERIVED image-path members of `model/entity/Sku.cfc:L145`, `:L192`
 * and `:L221`, which AAP §0.2.2.7 keeps behind `ImagePathPort`. This is a persistent column that
 * `rowMappers.ts` maps, and it is the only image concern this file has.
 */
const SKU_IMAGE_FILE_COLUMN = assertColumnName(SKU_TABLE, 'imageFile');

/** `SwBrand.brandID` — projected by `model/dao/ProductDAO.cfc:L180`. */
const BRAND_ID_COLUMN = assertColumnName(BRAND_TABLE, 'brandID');

/** `SwBrand.brandName` — the bound predicate of that same lookup. */
const BRAND_NAME_COLUMN = assertColumnName(BRAND_TABLE, 'brandName');

/** `SwProductType.productTypeID` — projected by `model/dao/ProductDAO.cfc:L184`. */
const PRODUCT_TYPE_ID_COLUMN = assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID');

/** `SwProductType.productTypeName` — the bound predicate of that same lookup. */
const PRODUCT_TYPE_NAME_COLUMN = assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeName');

/** `SwOptionGroup.optionGroupID` — projected by `model/dao/ProductDAO.cfc:L165` and `:L213`. */
const OPTION_GROUP_ID_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID');

/** `SwOptionGroup.optionGroupName` — the first of three disjuncts at `model/dao/ProductDAO.cfc:L165`. */
const OPTION_GROUP_NAME_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupName');

/** `SwOptionGroup.optionGroupCode` — the second of those three disjuncts. */
const OPTION_GROUP_CODE_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupCode');

/** `SwOption.optionID` — projected at `model/dao/ProductDAO.cfc:L213` and inserted at `:L225`. */
const OPTION_ID_COLUMN = assertColumnName(OPTION_TABLE, 'optionID');

/** `SwOption.optionCode` — the join predicate at `model/dao/ProductDAO.cfc:L213`. */
const OPTION_CODE_COLUMN = assertColumnName(OPTION_TABLE, 'optionCode');

/**
 * `SwOption.optionName` — inserted at `model/dao/ProductDAO.cfc:L225`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L225` — THE SAME CELL VALUE IS WRITTEN TO BOTH `optionCode`
 * AND `optionName` when an option has to be created. An imported option therefore has a machine code
 * as its display name. Carried across unchanged.
 */
const OPTION_NAME_COLUMN = assertColumnName(OPTION_TABLE, 'optionName');

/**
 * `SwOption.optionGroupID` — the child side of the group relationship.
 *
 * Held separately from {@link OPTION_GROUP_ID_COLUMN} even though the spellings match, because the two
 * are validated against DIFFERENT tables and a future rename on one must not keep compiling against
 * the other. The same discipline `MySqlOptionRepository.ts` applies.
 */
const OPTION_OPTION_GROUP_ID_COLUMN = assertColumnName(OPTION_TABLE, 'optionGroupID');

/** `SwSkuOption.optionID` — half of the link row inserted at `model/dao/ProductDAO.cfc:L232`. */
const SKU_OPTION_OPTION_ID_COLUMN = assertColumnName(SKU_OPTION_TABLE, 'optionID');

/** `SwSkuOption.skuID` — the other half. */
const SKU_OPTION_SKU_ID_COLUMN = assertColumnName(SKU_OPTION_TABLE, 'skuID');

/**
 * The four audit columns of one table, in the canonical casing that table declares.
 *
 * The legacy spells them inconsistently inside its interpolated text — `modifiedDatetime` at
 * `model/dao/ProductDAO.cfc:L363`, `CreatedByAccountID` with a leading capital at `:L365` — and got
 * away with it because SQL identifiers are case-insensitive on the engines it targeted. Resolving each
 * through {@link assertColumnName} normalises the casing to the entity declaration and removes the
 * dependency on that leniency.
 *
 * @param table - a validated physical table.
 * @returns the four canonical audit column names for that table.
 */
function auditColumnsOf(table: PhysicalTableName): {
  readonly created: string;
  readonly modified: string;
  readonly createdBy: string;
  readonly modifiedBy: string;
} {
  return {
    created: assertColumnName(table, 'createdDateTime'),
    modified: assertColumnName(table, 'modifiedDateTime'),
    createdBy: assertColumnName(table, 'createdByAccountID'),
    modifiedBy: assertColumnName(table, 'modifiedByAccountID'),
  };
}

/* ================================================================================================
 * OUT-OF-SCOPE PHYSICAL IDENTIFIERS — AUTHORED LITERALS, DECLARED ONCE, FLAGGED
 * ==============================================================================================
 * ⚠️ BOUNDARY CROSSING, FLAGGED HERE. `Attribute*` is one of the families AAP §0.2.2.1 excludes (6
 * files), so none of the names below is in `QueryRunner.ts`'s whitelist and none may be added to it.
 * They are nonetheless required, because two legacy statements reach them and the RESULT of reaching
 * them is observable through the port: the custom-attribute step writes values the importer was asked
 * to import, and the attribute-set selection is a declared member of the port.
 *
 * Each is a compile-time constant authored here from the entity declaration cited beside it. None is
 * derived from caller input, so none is an injection surface: S2 requires that no caller-supplied
 * string reach statement text except as a bound `?`, and that holds throughout. This is the same
 * discipline `MySqlSkuRepository.ts` established for the ten-way existence chain.
 * ============================================================================================== */

/**
 * Tables from excluded families that two legacy statements nonetheless reach.
 *
 * Frozen so nothing can extend the set at run time.
 */
const OUT_OF_SCOPE_TABLE = Object.freeze({
  /** `model/entity/AttributeValue.cfc:L54` — written by `model/dao/ProductDAO.cfc:L244` and `:L250`. */
  attributeValue: 'SwAttributeValue',
  /** `model/entity/AttributeSet.cfc:L49` — the root of the selection at `model/dao/ProductDAO.cfc:L53`. */
  attributeSet: 'SwAttributeSet',
  /** `model/entity/Attribute.cfc:L49` — the existence test at `model/dao/ProductDAO.cfc:L54`. */
  attribute: 'SwAttribute',
  /**
   * `model/entity/AttributeSet.cfc:L70`, `linktable="SwAttributeSetProductType"` — the PHYSICAL
   * relationship standing in for the association path `model/dao/ProductDAO.cfc:L58` names. See the
   * long note on {@link composeAttributeSetSelection} for why a path-for-path transcription is
   * impossible and why this is a translation decision rather than a repair.
   */
  attributeSetProductType: 'SwAttributeSetProductType',
  /** `model/entity/Type.cfc:L49` — reached through `attributeSetType` for its `systemCode`. */
  type: 'SwType',
});

/**
 * Columns on those tables, each read from the declaration cited.
 *
 * They exist because HQL references association PATHS — `sas.attributes`, `sas.attributeSetType`,
 * `asa.productTypeID` — that native SQL performs no equivalent resolution for, so every path is made
 * EXPLICIT against the physical key here.
 */
const OUT_OF_SCOPE_COLUMN = Object.freeze({
  /** `model/entity/AttributeValue.cfc:L57` primary key, generated at `model/dao/ProductDAO.cfc:L248`. */
  attributeValueID: 'attributeValueID',
  /** `model/entity/AttributeValue.cfc:L58` — the value itself. */
  attributeValue: 'attributeValue',
  /** `model/entity/AttributeValue.cfc:L60` — `notnull="true"`, which is why `:L250` supplies it. */
  attributeValueType: 'attributeValueType',
  /** `model/entity/AttributeValue.cfc:L78` quick-lookup property, and `model/entity/Attribute.cfc:L52`. */
  attributeID: 'attributeID',
  /** `model/entity/AttributeValue.cfc:L70` `fkcolumn="productID"`. */
  productID: 'productID',
  /** `model/entity/AttributeSet.cfc:L52` primary key, and `:L67` `fkcolumn="attributeSetID"`. */
  attributeSetID: 'attributeSetID',
  /** `model/entity/AttributeSet.cfc:L64` `fkcolumn="attributeSetTypeID"`. */
  attributeSetTypeID: 'attributeSetTypeID',
  /** `model/entity/AttributeSet.cfc:L57` — the disjunct at `model/dao/ProductDAO.cfc:L57` and `:L60`. */
  globalFlag: 'globalFlag',
  /** `model/entity/AttributeSet.cfc:L61` — the second sort term at `model/dao/ProductDAO.cfc:L62`. */
  sortOrder: 'sortOrder',
  /** `model/entity/Attribute.cfc:L53` — the existence predicate at `model/dao/ProductDAO.cfc:L54`. */
  activeFlag: 'activeFlag',
  /** `model/entity/AttributeSet.cfc:L70` `inversejoincolumn="productTypeID"`. */
  productTypeID: 'productTypeID',
  /** `model/entity/Type.cfc:L52` primary key. */
  typeID: 'typeID',
  /** `model/entity/Type.cfc:L55` — the first sort term and the bound filter of the selection. */
  systemCode: 'systemCode',
});

/* ================================================================================================
 * LITERALS THAT ARE OBSERVABLE BEHAVIOUR
 * ============================================================================================== */

/** The bind marker for one value in a prepared statement. Never used for an identifier. */
const BIND_PLACEHOLDER = '?';

/** The text placed between consecutive bind markers inside a set-membership clause. */
const PLACEHOLDER_JOINER = ', ';

/** CFML's default list delimiter, and the delimiter every list this file splits actually uses. */
const LIST_DELIMITER = ',';

/** The delimiter separating a file heading's table prefix from its column name, `:L131`-`:L138`. */
const HEADING_DELIMITER = '_';

/** The delimiter `model/dao/ProductDAO.cfc:L74` splits the source location on to find the file type. */
const FILE_TYPE_DELIMITER = '.';

/**
 * `chr(44)` from `model/dao/ProductDAO.cfc:L77` — the delimiter for a `csv` source.
 *
 * Held as a named constant rather than inlined so a test can compare against this value instead of
 * restating it, and so the two entries of the map below read symmetrically.
 */
const COMMA_DELIMITER = ',';

/** `chr(9)` from `model/dao/ProductDAO.cfc:L79` — the delimiter for a `txt` source. A TAB. */
const TAB_DELIMITER = '\t';

/**
 * The delimiter for every other file type, from `model/dao/ProductDAO.cfc:L75`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L74-L80` — THE MAP RECOGNISES EXACTLY TWO EXTENSIONS AND
 * THERE IS NO UNSUPPORTED-TYPE GUARD. Anything else leaves the delimiter as the empty string
 * initialised at `:L75` and the retrieval proceeds anyway. No guard, no rejection and no default
 * delimiter is added here (S9, Guideline 4).
 */
const NO_DELIMITER = '';

/**
 * The file type whose branch at `model/dao/ProductDAO.cfc:L83-L85` is EMPTY.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L83-L85` — `if(fileType == "xls"){ //Read xls }` CONTAINS A
 * COMMENT AND NOTHING ELSE. A spreadsheet upload therefore leaves the result set as the empty one
 * created at `:L82` and the importer completes having imported nothing, silently and without error.
 * The branch is preserved as an explicit no-op; no spreadsheet reader is added, and this file declares
 * no such dependency (S5).
 */
const SPREADSHEET_FILE_TYPE = 'xls';

/**
 * The `csv` file type from `model/dao/ProductDAO.cfc:L76`.
 *
 * ⚠️ CFML `==` on strings is CASE-INSENSITIVE, so `.CSV` matched. TypeScript `===` is not, so the
 * comparison is performed against a lower-cased file type. Recorded as a translation decision
 * (Guideline 6): comparing case-sensitively would silently stop recognising an upper-cased extension.
 */
const CSV_FILE_TYPE = 'csv';

/** The `txt` file type from `model/dao/ProductDAO.cfc:L78`, matched case-insensitively for the same reason. */
const TEXT_FILE_TYPE = 'txt';

/**
 * The heading prefixes `model/dao/ProductDAO.cfc:L131-L138` classifies on, via `listFirst(column,"_")`.
 *
 * Compared case-insensitively, because the legacy comparison is `==`.
 */
const HEADING_PREFIX = Object.freeze({
  /** `:L131` — columns saved onto `SwProduct`. */
  product: 'product',
  /** `:L133` — columns saved onto `SwSku`. */
  sku: 'sku',
  /** `:L135` — headings naming an option group. */
  option: 'option',
  /** `:L137` — headings naming a custom attribute, whose identifier is the heading's last segment. */
  attribute: 'attribute',
});

/**
 * The text `model/dao/ProductDAO.cfc:L163` strips from an option heading to obtain the group key.
 *
 * `replaceNoCase(optionGroup,"option_","","one")` — case-insensitive, FIRST occurrence only.
 */
const OPTION_HEADING_PREFIX = 'option_';

/**
 * The product lookup columns, IN PRIORITY ORDER, from `model/dao/ProductDAO.cfc:L100`.
 *
 * ⚠️ THE ORDER IS BEHAVIOUR AND THE SHORT-CIRCUIT IS BEHAVIOUR. `:L103-L108` walks this array
 * ascending and `break`s on the first heading present in the file, so a file carrying both
 * `product_productCode` and `product_productName` is keyed on the CODE. Reordering the array, or
 * removing the break to prefer a later match, silently changes which column identifies a row and
 * therefore which existing product an import updates.
 */
const PRODUCT_LOOKUP_COLUMNS: readonly string[] = Object.freeze([
  'product_remoteID',
  'product_productID',
  'product_productCode',
  'product_productName',
]);

/**
 * The SKU lookup column, hard-coded LOWERCASE at `model/dao/ProductDAO.cfc:L109`.
 *
 * Not resolved by priority the way the product side is: `:L109` assigns this single literal, and
 * `:L199` then compares against the same literal — a comparison that is invariantly true, preserved
 * below exactly as written.
 */
const SKU_LOOKUP_COLUMN = 'sku_skucode';

/**
 * The field name `model/dao/ProductDAO.cfc:L204` uses when it appends the generated SKU code.
 *
 * ⚠️ ALL-LOWERCASE, AND THAT IS THE SOURCE'S SPELLING. `:L204` writes `{name="skucode",...}` while the
 * entity declares the column as `skuCode` at `model/entity/Sku.cfc:L54`. CFML's case-insensitive
 * identifier handling made the mismatch invisible; here the value passes through
 * {@link assertColumnName}, which restores the entity's own casing when the statement is composed. The
 * literal is kept as written so a reader comparing the two files sees the same text.
 */
const SKU_LOOKUP_COLUMN_FIELD = 'skucode';

/**
 * The heading that carries content-page assignments, `model/dao/ProductDAO.cfc:L258` and `:L259`.
 *
 * Reaching it is the declared boundary described in the module header.
 */
const CONTENT_PAGE_COLUMN = 'productcontent_page';

/**
 * The two headings whose absence causes a default to be supplied, `model/dao/ProductDAO.cfc:L143-L148`.
 *
 * The values are the literal `"1"` STRINGS the legacy appends, not booleans and not numbers, so what
 * reaches the column is exactly what reached it before.
 */
const PRODUCT_DEFAULTED_HEADINGS: readonly { readonly heading: string; readonly name: string }[] =
  Object.freeze([
    { heading: 'product_activeFlag', name: 'activeFlag' },
    { heading: 'product_publishedFlag', name: 'publishedFlag' },
  ]);

/** The value `model/dao/ProductDAO.cfc:L144` and `:L147` supply for a defaulted flag. */
const DEFAULTED_FLAG_VALUE = '1';

/* ------------------------------------------------------------------------------------------------
 * SEC-14 — WHICH COLUMNS AN IMPORTED FILE MAY ASSIGN
 *
 * ⚠️ THIS IS A SECOND, DIFFERENT QUESTION FROM THE ONE `assertColumnName` ANSWERS, AND CONFLATING THEM
 * WAS THE FINDING. The whitelist in `./QueryRunner` answers "is this a real column of this table",
 * which is an IDENTIFIER-SAFETY question: it exists so that no caller-supplied text can ever become
 * statement text (D22). It does not, and cannot, answer "may a file uploaded by a remote party WRITE
 * this column", which is an AUTHORIZATION question about mutation targets — CWE-915, mass assignment.
 * Because the heading classifier at `model/dao/ProductDAO.cfc:L130-L140` accepts ANY heading whose
 * first underscore-delimited segment is `product` or `sku`, every column of `SwProduct` and `SwSku`
 * was reachable from the file: the primary keys, the four audit columns, the four `calculated*`
 * columns the back-fills own, the integration identifier, and every relationship-control foreign key.
 * D18 (AAP §0.6.7.7) closed the INJECTION half of this importer by parameterising it; the mutation
 * half needed its own control, and this is it.
 *
 * ⭐ THE TWO CHECKS ARE KEPT SEPARATE ON PURPOSE, AND NEITHER REPLACES THE OTHER. This allowlist is a
 * strict subset of the schema whitelist, so it would be tempting to fold one into the other. That
 * would be wrong twice over: the schema whitelist is consulted by statement composition everywhere in
 * this file, including for columns no import may write (the audit pair, the generated identifier, the
 * generated URL title), so narrowing it would break those writes; and an authorization rule that
 * lives inside an identifier-safety helper is a rule the next reader will not know is there.
 *
 * WHAT IS REFUSED, AND WHY EACH ONE
 * ---------------------------------
 *   • PRIMARY KEYS — `productID`, `skuID`. The archetype of the finding. `:L410` generates the
 *     identifier for an insert and `:L393-L396` matches on it for an update, so a file-supplied value
 *     could only ever collide with or hijack an existing row. Note this is also the one refusal the
 *     legacy could not have honoured even if it wanted to: `:L411-L413` appends the identifier column
 *     a SECOND time to an insert that already carried it from the file, which MySQL answers with error
 *     1110 (column specified twice). The legacy path was unusable, so nothing that worked is lost.
 *   • AUDIT COLUMNS — `createdDateTime`, `createdByAccountID`, `modifiedDateTime`,
 *     `modifiedByAccountID`. `:L363-L366` sets all four from the server's clock and the acting
 *     account. A file that could set them could forge provenance, and the insert would carry each
 *     column twice.
 *   • CALCULATED COLUMNS — every `calculated*` member. `:L287-L325` back-fills them from the database
 *     after the import; a file-supplied value is either overwritten or, worse, survives as a figure no
 *     computation produced. `calculatedQATS` in particular is the availability gate the public feed
 *     ranges on (`integrationServices/google/controllers/feed.cfc:L72`).
 *   • RELATIONSHIP CONTROL — `brandID`, `productTypeID`, `defaultSkuID` on the product; `productID`
 *     and `subscriptionTermID` on the SKU. The importer resolves associations ITSELF, by NAME, and
 *     supplies them through the insert-only `extraData` path at `:L368-L378`; a heading that wrote a
 *     foreign key directly would bypass that resolution and could graft a row onto an arbitrary
 *     parent, including one the file's author cannot see.
 *   • `urlTitle` on the product. Server-generated at `:L398-L409` on the insert path, so permitting it
 *     would both override a generated value and append the column twice.
 *   • `remoteID` ON THE SKU, THOUGH NOT ON THE PRODUCT — see the note below, which is the one
 *     asymmetry here and the one that shows these lists are per-table rather than copied.
 *
 * ⭐ WHY `product_remoteID` IS PERMITTED. It is not an oversight and it is not convenience: a SOURCE
 * REQUIREMENT demands it. `model/dao/ProductDAO.cfc:L100` lists `product_remoteID` FIRST in the
 * lookup-priority walk, so an import keyed on the integration identifier is a first-class legacy
 * behaviour — and matching on a value the import may never store would make that walk permanently
 * unsatisfiable. The SKU side has no such requirement: `:L109` hard-codes `sku_skucode` as the only
 * SKU lookup column and consults no remote identifier at all, so `sku_remoteID` is refused under
 * deny-by-default.
 *
 * FAIL-CLOSED, AND POSITIONED BEFORE THE FIRST ROW — the same argument SEC-11 makes for the SKU
 * combination bound. The check runs in {@link MySqlProductRepository.buildImportPlan}, which completes
 * BEFORE `:L176` opens the first per-row boundary, so a file naming an unauthorised column imports
 * NOTHING rather than importing rows until the offending column happens to matter. That matters
 * especially here, because M3 commits every row independently: a refusal discovered mid-file would
 * leave a partially imported catalog that no rollback undoes.
 *
 * NO NUMBER, NO POLICY OBJECT AND NO CONFIGURATION SWITCH. Unlike SEC-11 and SEC-12 this control
 * needs no operator figure: the answer is derived entirely from the entity declarations and from the
 * importer's own source locators above, so it is stated here rather than injected. There is
 * deliberately no override flag — a switch that re-opens mass assignment is the finding with a
 * spelling.
 * --------------------------------------------------------------------------------------------- */

/**
 * The `SwProduct` columns an imported file may assign, compared case-insensitively.
 *
 * Declared in the entity's own casing for readability and normalised on construction, because a
 * heading's casing is whatever the file's author typed.
 */
const IMPORTABLE_PRODUCT_COLUMNS: ReadonlySet<string> = new Set(
  [
    // `model/entity/Product.cfc:L52-L59` — the plain persistent scalars.
    'activeFlag',
    'publishedFlag',
    'productName',
    'productCode',
    'productDescription',
    'sortOrder',
    // `model/entity/Product.cfc:L93`, required by the lookup walk at `model/dao/ProductDAO.cfc:L100`.
    'remoteID',
  ].map((column) => column.toLowerCase()),
);

/**
 * The `SwSku` columns an imported file may assign, compared case-insensitively.
 *
 * `model/entity/Sku.cfc:L52-L59` — the plain persistent scalars, and nothing else. No identifier, no
 * audit column, no `calculatedQATS`, no `productID`, no `subscriptionTermID` and no `remoteID`.
 */
const IMPORTABLE_SKU_COLUMNS: ReadonlySet<string> = new Set(
  [
    'activeFlag',
    'skuCode',
    'listPrice',
    'price',
    'renewalPrice',
    'imageFile',
    'userDefinedPriceFlag',
  ].map((column) => column.toLowerCase()),
);

/** The deny-by-default answer for any table the importer does not write from file headings. */
const NO_IMPORTABLE_COLUMNS: ReadonlySet<string> = new Set<string>();

/**
 * The importable-column allowlist for one table — SEC-14.
 *
 * ⚠️ DENY BY DEFAULT. Only the two tables the heading classifier can target have a list. Every other
 * physical table — the product type, the brand, the option, the option group, the link table and the
 * alternate SKU code — answers the empty set, so if a future change ever routed file headings at one
 * of them the refusal would be automatic rather than dependent on someone remembering to add a list.
 *
 * @param table - the already-validated physical table.
 * @returns the normalised set of columns an imported file may assign on that table.
 */
function importableColumnsOf(table: PhysicalTableName): ReadonlySet<string> {
  if (table === PRODUCT_TABLE) {
    return IMPORTABLE_PRODUCT_COLUMNS;
  }

  if (table === SKU_TABLE) {
    return IMPORTABLE_SKU_COLUMNS;
  }

  return NO_IMPORTABLE_COLUMNS;
}

/**
 * Refuses a heading whose column an imported file may not assign — SEC-14.
 *
 * The column is the heading's LAST underscore-delimited segment, which is the same derivation
 * `model/dao/ProductDAO.cfc:L349` uses to turn a heading into a column name, so authorization is asked
 * about exactly the column that would be written.
 *
 * ⚠️ THE REFUSED COLUMN IS NAMED IN THE FAILURE AND THE CELL VALUE IS NOT. An operator has to be able
 * to see which heading was rejected — a refusal they cannot act on gets worked around — but the row's
 * DATA is never recorded, because it is remote-supplied content and this failure is destined for a
 * log. The heading itself came from the file too, so it travels as `context` rather than in the
 * message, and `../../errors/DomainError` publishes neither to a caller.
 *
 * @param table - the physical table the heading is classified onto.
 * @param heading - the file heading, for example `product_productCode`.
 * @throws DomainError when the column is not on that table's importable allowlist.
 */
function assertImportableColumn(table: PhysicalTableName, heading: string): void {
  const column = normaliseHeading(listLast(heading, HEADING_DELIMITER));

  if (!importableColumnsOf(table).has(column)) {
    throw new DomainError(
      'An imported file named a column that an import may not assign, so the import was refused ' +
        'before any row was written. Identifiers, audit columns, calculated columns and the columns ' +
        'that control a record relationship are set by the importer itself and cannot be supplied by ' +
        'the file.',
      { context: { table, heading, column } },
    );
  }
}

/**
 * Refuses an entire classified heading list before the import begins — SEC-14.
 *
 * Every heading is checked rather than stopping at the first, so one pass reports the first offender
 * with the whole list in hand; the refusal is still immediate, because a single unauthorised heading
 * makes the import as a whole unacceptable.
 *
 * @param table - the physical table the list is classified onto.
 * @param headings - the classified headings for that table.
 * @throws DomainError on the first heading the allowlist refuses.
 */
function assertImportableColumns(table: PhysicalTableName, headings: readonly string[]): void {
  for (const heading of headings) {
    assertImportableColumn(table, heading);
  }
}

/**
 * The discriminator `model/dao/ProductDAO.cfc:L250` writes into `attributeValueType`.
 *
 * A source-declared literal, and a VALUE rather than an identifier, so it is bound like any other.
 */
const PRODUCT_ATTRIBUTE_VALUE_TYPE = 'Product';

/** The separator `model/dao/ProductDAO.cfc:L202` places between the product key and each option value. */
const SKU_CODE_SEGMENT_SEPARATOR = '-';

/**
 * The separator `model/dao/ProductDAO.cfc:L405` places before the product code on a URL-title
 * collision, and the separator `:L307` places before the image extension.
 *
 * Two different characters, so they are two constants; see {@link IMAGE_EXTENSION_SEPARATOR}.
 */
const URL_TITLE_COLLISION_SEPARATOR = '_';

/** The `'.'` that `model/dao/ProductDAO.cfc:L307`, `:L313` and `:L320` place before the extension. */
const IMAGE_EXTENSION_SEPARATOR = '.';

/* ================================================================================================
 * INJECTED SEAMS — WHAT DI/1 PROPERTY INJECTION AND DYNAMIC STRING LOOKUP BECAME (S3, R1, R2)
 * ============================================================================================== */

/**
 * The statement-execution surface this adapter needs: the read-plus-write pair, under a local name.
 *
 * ⭐ THIS IS AN ALIAS OF {@link SqlMutationExecutor}, NOT A SECOND DECLARATION OF THE SAME SHAPE. An
 * earlier revision declared the pair here as its own interface, and `MySqlSkuRepository.ts` and
 * `MySqlBrandRepository.ts` each declared it again — three private widenings of the read-only
 * `SqlExecutor`, none of which any transaction scope satisfied, so the only executor that fitted them
 * was the POOL-BACKED `QueryRunner`. That object borrows a fresh connection per statement, so a write
 * issued through it lands outside whatever transaction the caller had opened and the read-back AAP
 * §0.6.2 requires observes nothing. `QueryRunner.ts` now declares the pair ONCE and every scope hands
 * it out, which is what makes "the write and its read-back run on one connection" a fact the compiler
 * checks rather than a convention a reader has to notice.
 *
 * The local name is retained because this file's signatures read in its own vocabulary and because the
 * alias is the natural place to record WHY the importer needs a writing member at all: the
 * custom-attribute step at `model/dao/ProductDAO.cfc:L247` branches on the affected-row count, so the
 * count is load-bearing rather than decoration. The read member could not carry that write in any case
 * — it normalises a driver result into rows through `rowMappers.ts` `toRows`, which RAISES when the
 * driver answers with a write acknowledgement instead of a row list.
 *
 * ⚠️ ONE executor, not two. The composition root injects a single instance and both members run on the
 * SAME connection. Nothing in this file constructs a connection or a pool, and nothing here commits.
 */
export type ProductStatementExecutor = SqlMutationExecutor;

/**
 * One per-row transaction's execution surface.
 *
 * `TransactionScope` from `UnitOfWork.ts` carries a `ReadWriteSqlExecutor` — the read member and the
 * write member, both bound to the connection the boundary checked out. The importer writes inside its
 * per-row transaction, so this RE-STATES the member as {@link ProductStatementExecutor}, the
 * structurally identical pair this file declares for itself. Legal interface property narrowing, and it
 * states the relationship to `UnitOfWork` explicitly instead of leaving a reader to infer it.
 *
 * ⭐ `UnitOfWork` SATISFIES THIS SHAPE, so the composition root hands that class over directly and there
 * is no shim, no adapter and no connection to recover: the executor a per-item scope carries is bound to
 * the connection that boundary is holding, and that connection is never handed out. One executor over
 * one connection is what makes reads inside a row observe that row's own writes.
 *
 * ⚠️ IT IS STILL DECLARED HERE RATHER THAN IMPORTED, for the reason every seam in this folder is: a test
 * must be able to satisfy exactly what this adapter names, with a plain object literal and without
 * importing the transaction manager or the driver (AAP §0.7.3 S6). `test/adapters/MySqlProductRepository.test.ts`
 * does both — it substitutes its own boundary to record what each row did, AND pins at compile time that
 * the real class remains assignable to {@link ProductImportTransactionBoundary}.
 */
export type ProductImportTransactionScope = TransactionScope;

/**
 * The transaction boundaries the importer needs, and exactly those two.
 *
 * ⭐ M3 LIVES HERE. `model/dao/ProductDAO.cfc:L176` opens the record loop and `:L177` opens
 * `transaction{` INSIDE it, closing at `:L284-L285`; the two bulk back-fills at `:L287-L325` then run
 * after that transaction has closed, inside none at all. So the importer's shape is N single-row
 * transactions followed by two untransacted statements, and this interface has precisely two members
 * because that shape has precisely two kinds of boundary.
 *
 * ⚠️ WHAT MUST NOT BE ADDED. There is no member for "one transaction around the whole import", because
 * offering one would invite the two-line change that destroys M3. A mid-file failure leaving a
 * partially imported catalog is the behaviour to preserve (AAP §0.6.6, §0.8.2 Guideline 4).
 *
 * Declared as methods rather than function-typed properties so `UnitOfWork`'s generic members satisfy
 * them positionally, and declared here rather than imported so a test can record what a boundary did —
 * the S6 obligation that N rows produce N independent settlements is only assertable if the boundary is
 * substitutable.
 */
export interface ProductImportTransactionBoundary {
  /**
   * Run one independent transaction per item, strictly in order, RETAINING NOTHING.
   *
   * Matches `UnitOfWork.runPerItemWithoutResults`. Each item gets its own boundary and its own scope; a
   * scope is never shared, because the transactions are not shared either.
   *
   * ⭐ THIS IS THE MEMBER THE IMPORTER USES, AND THE ABSENCE OF A RESULT IS THE REASON. The legacy row
   * body at `model/dao/ProductDAO.cfc:L177-L284` writes the row and moves on — it produces no value at
   * all — so a boundary that promised one result per item would build an array holding one discarded
   * entry for every row of the file and hold it until the import finished. Over a large catalog that is
   * memory proportional to the row count, spent on nothing.
   *
   * ⭐ AND THE ITEM SOURCE IS DELIBERATELY LAZY-CAPABLE, WHICH IS WHAT LETS THE IMPORTER STOP HOLDING
   * THE FILE. A materialised list is still accepted, so nothing that already supplies one changes; an
   * `AsyncIterable` is accepted alongside it, so {@link MySqlProductRepository.importFromFile} can feed
   * rows in as they are parsed and keep only the row currently inside its transaction alive.
   *
   * ⚠️ SUPPLYING A LAZY SOURCE RELAXES NOTHING. The items must still arrive in the order they are to be
   * processed — M3 needs the commits ordered and independent, M6 needs the write order — and the source
   * must issue NO statements of its own, because it is advanced between transactions on the very
   * connection the previous transaction settled on. `UnitOfWork.PerItemSource` states both obligations.
   *
   * @typeParam TItem - the item type, one per transaction.
   * @param items - the items in the order they must be processed: a read-only list or a lazy source.
   * @param work - the per-item unit of work, whose result is not retained.
   */
  runPerItemWithoutResults<TItem>(
    items: readonly TItem[] | AsyncIterable<TItem>,
    work: (item: TItem, scope: ProductImportTransactionScope) => Promise<void>,
  ): Promise<void>;

  /**
   * Run work with NO transaction at all.
   *
   * Matches `UnitOfWork.runWithoutTransaction`, whose own documentation records that it exists for
   * exactly the two back-fills at `model/dao/ProductDAO.cfc:L287-L325` and for nothing else. This file
   * is that member's only caller and uses it only there.
   *
   * @typeParam T - whatever the work produces.
   * @param work - the untransacted work, receiving a pool-bound executor.
   * @returns whatever the work produced.
   */
  runWithoutTransaction<T>(work: (executor: ProductStatementExecutor) => Promise<T>): Promise<T>;
}

/**
 * Proves a type is assignable to another at COMPILE TIME, and costs nothing at run time.
 *
 * The constraint does all the work: if `TActual` is not assignable to `TExpected`, the alias itself
 * fails to type-check. Same helper, same reasoning as in `../../services/ProductService.ts` and its
 * siblings, restated locally rather than exported from one of them — a shared assertion helper would
 * make this folder depend on the service layer for a type-level convenience, which standard S4's layer
 * direction rules out.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * ⭐ THE F6 GUARANTEE, MADE UNBREAKABLE: `UnitOfWork` SATISFIES THE BOUNDARY THIS FILE REQUIRES.
 *
 * This is the whole reason the alias exists. `ProductImportTransactionBoundary` and
 * `ProductImportTransactionScope` are declared HERE, in this file's vocabulary, while the only
 * implementation lives in `./UnitOfWork` — so nothing but a wiring attempt in a composition root would
 * ever have discovered a mismatch between them, and the composition root is deferred. That is exactly
 * how the two drifted apart in the first place: the scope required an executor that reads and writes
 * while the boundary's executor only read, and because no module put the two types in contact, the
 * subtree compiled cleanly with an unsatisfiable requirement sitting in it.
 *
 * The alias below puts them in contact permanently. Any future change on either side that breaks
 * assignability — narrowing the scope executor again, altering an argument position, turning a method
 * into a function-typed property — now fails `tsc` in THIS file, naming the incompatible member, rather
 * than surfacing as a run-time "not a function" the first time an import writes a row.
 *
 * TYPE-ONLY IMPORT, SO NO MODULE CYCLE IS CREATED. `./UnitOfWork` imports this folder's assertions from
 * `./QueryRunner` and imports nothing from this file; the reference below is erased entirely at compile
 * time, so the emitted bundle contains no edge in either direction. The import is of the CLASS as a
 * type, which is what makes the check meaningful: it is the real implementation being verified, not a
 * restatement of its shape.
 *
 * ⚠️ THE DIRECTION IS DELIBERATE AND MUST NOT BE REVERSED. It asserts that the implementation satisfies
 * this file's REQUIREMENT, not that the requirement matches the implementation. So a future member added
 * to `UnitOfWork` — a whole-import transaction, say — does not satisfy anything here, and the note on
 * {@link ProductImportTransactionBoundary} about what must never be added continues to hold.
 */
type _UnitOfWorkSatisfiesProductImportTransactionBoundary = AssertAssignable<
  UnitOfWork,
  ProductImportTransactionBoundary
>;

/**
 * One record of a retrieved delimited file, keyed by its heading.
 *
 * A CFML query is COLUMN-oriented — `data[column][row]` — while this is row-oriented. The change is
 * idiom only: every read below names a heading and a row index exactly as the legacy does, so the
 * access pattern is preserved even though the container is not.
 *
 * Values are `string` because a query built from a delimited text file has no other type. A cell that
 * was empty in the file is the empty string, which is why `!= ""` guards at
 * `model/dao/ProductDAO.cfc:L211`, `:L217` and `:L242` translate directly.
 */
export type DelimitedImportRecord = Readonly<Record<string, string>>;

/**
 * A retrieved delimited file: its headings, and its records.
 *
 * The empty value of this shape — no headings and no records — is the port of `queryNew("")` at
 * `model/dao/ProductDAO.cfc:L82`, which is what the spreadsheet branch at `:L83-L85` leaves in place.
 */
export interface DelimitedImportRecordSet {
  /**
   * The headings, in file order and in their original casing.
   *
   * The port of `data.columnList`. Original casing is retained because the legacy classifies and
   * matches on the heading itself — `listFindNoCase` at `model/dao/ProductDAO.cfc:L104`,
   * `arrayFindNoCase` at `:L143`, `listFirst` at `:L131` — all case-insensitively. See
   * {@link normaliseHeading} for how the case-insensitivity is reproduced without losing the original.
   */
  readonly columnList: readonly string[];

  /** The records, in file order. The port of the query's rows, `data.recordcount` being their count. */
  readonly rows: readonly DelimitedImportRecord[];
}

/**
 * Retrieves and parses the delimited file — the injected replacement for the legacy's hidden HTTP call.
 *
 * ⭐ M4 IS FLAGGED HERE AND OWNED ELSEWHERE. `model/dao/ProductDAO.cfc:L87` is the ONE live retrieval:
 * `getService("utilityTagService").cfhttp(method="get", url=arguments.fileURL, delimiter=delimiter,
 * textQualifier=arguments.textQualifier)`. The collaborator is resolved by runtime string lookup and is
 * NEVER declared as a component property, so metadata-driven dependency analysis misses it entirely.
 * Rule R2 of AAP §0.4.3.2 makes it an explicit typed dependency, which is what this interface is.
 *
 * ⚠️ AND THE AAP IS WRONG ABOUT THE FALLBACK. AAP §0.6.6 describes "a `new http()` fallback at
 * [L88-L90]". The block is COMMENTED OUT — it opens at `model/dao/ProductDAO.cfc:L89` and closes at
 * `:L98` — and the comment above it at `:L88` records why it was abandoned. There is no live fallback,
 * so none is declared and none is implemented.
 *
 * ⚠️ THIS INTERFACE IS THE REASON THIS FILE PERFORMS NO NETWORK INPUT OR OUTPUT — AND IT IMPOSES NO
 * ADDRESS POLICY OF ITS OWN. An earlier revision declared four address-level obligations on whoever
 * implements it: resolve-then-vet the host against loopback, private, link-local, unique-local,
 * unspecified and instance-metadata ranges; connect to the address that was vetted rather than
 * re-resolving; re-validate every redirect hop; and enforce byte and time bounds while streaming. All
 * four are WITHDRAWN, and `src/ports/repositories/ProductRepository.ts` carries the withdrawal in full.
 * The two deciding facts, restated so this file stands on its own:
 *   1. The legacy performs NO check of any kind. `model/service/ProductService.cfc:L65` delegates to
 *      `model/dao/ProductDAO.cfc:L73`, which reaches `:L87` and retrieves whatever location arrived.
 *      There is no scheme test, no host list, no redirect cap and no size cap to port.
 *   2. Refusing a fetch CHANGES AN OUTCOME. D18 is the one declared departure of AAP §0.6.7.7 precisely
 *      because parameterising a statement returns exactly the rows the interpolated statement returned;
 *      a refusal has no such property, so §0.8.2 guideline 4 forbids it, and the five policy figures it
 *      needed would be invented configuration (§0.7.3 standard 9, IR-12).
 * The CWE-918 exposure is real and is ALREADY ON THE REGISTER as mismatch M4, "remote file fetch inside
 * the request" — flagged for the operator to close, not closed here (S8).
 *
 * ⛔ NO TRANSPORT IMPLEMENTATION SHIPS, AND THE FOUR CLAUSES ARE THE STATEMENT OF A CONTRACT AN
 * OPERATOR-SUPPLIED READER MUST MEET — NOT A DESCRIPTION OF SOMETHING IN THIS SUBTREE. The only
 * implementation delivered here is {@link unresolvableProductImportSourceReader} below, which REFUSES,
 * and it refuses for a reason stronger than caution: `model/dao/ProductDAO.cfc:L87` retrieves through
 * `getService("utilityTagService").cfhttp(...)` and NO `utilityTagService` bean is declared anywhere in
 * the legacy repository — the single occurrence of the name is that call itself — while the `new http()`
 * fallback at `:L88-L97` is commented out. The legacy import has therefore never been able to retrieve a
 * file at all, so a working retrieval client would ADD a capability the system being ported does not
 * have. That is precisely what §0.8.2 guideline 4 forbids, and it is the same conclusion the two
 * deciding facts above reach from the policy side.
 *
 * ⚠️ A CONCRETE READER WAS WRITTEN — TWICE — AND BOTH COPIES ARE REMOVED. `src/adapters/http/` briefly
 * held two modules, each exporting a class named `HttpProductImportSourceReader` and each implementing
 * this interface: one carrying a branded import-source gate, the other carrying address vetting,
 * per-hop redirect revalidation and streaming bounds. Nothing imported either, they disagreed with each
 * other, and both existed to satisfy the branded-source design that was itself withdrawn from
 * `../../ports/repositories/ProductRepository` on Minimal Change Clause grounds — the withdrawal that
 * file records under "SEC-08 IS WITHDRAWN". Keeping either would have re-opened a closed decision and
 * required the five invented policy figures fact 2 rules out; keeping both would have shipped two
 * same-named classes side by side. The exposure stays where it belongs, on the register as M4 (S8).
 *
 * ⚠️ THE INTERFACE IS STILL DECLARED HERE RATHER THAN MOVED, because relocating it would alter this
 * ratified file's export surface for a purely cosmetic gain, which the Minimal Change Clause forbids.
 * This file holds no transport client and imports no network builtin.
 *
 * ⚠️ AND THE PLACEMENT IS DELIBERATELY NOT REPRODUCED. The legacy retrieves inside the same request
 * that carries the transactions, compounding M1 and M3. This file retrieves ONCE, BEFORE the first
 * per-row boundary opens, so no network wait ever sits inside a transaction.
 */
export interface ProductImportSourceReader {
  /**
   * Retrieve the delimited file and parse it into headings and records.
   *
   * The three arguments are the three the legacy passes at `model/dao/ProductDAO.cfc:L87`, in that
   * order. The first row of the file is its heading row, as the abandoned block at `:L95` states
   * explicitly.
   *
   * @param fileURL - the caller's location, passed through unchecked. See the withdrawal note above:
   *   no scheme, host, redirect or size policy is applied on the way in, because the legacy applies
   *   none.
   * @param delimiter - the field delimiter resolved from the file type, `''` for an unrecognised type.
   * @param textQualifier - the text qualifier, `''` by default per `model/dao/ProductDAO.cfc:L73`.
   * @returns the parsed record set.
   */
  read(
    fileURL: string,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordSet>;

  /**
   * Retrieve the delimited file and expose its headings up front and its records one at a time.
   *
   * ⭐ THE STREAMING ALTERNATIVE TO {@link ProductImportSourceReader.read}, AND OPTIONAL BY DESIGN. It is
   * declared optional so that every reader written against the materialising member keeps satisfying
   * this interface unchanged; {@link MySqlProductRepository.importFromFile} prefers this member when the
   * injected reader offers it and falls back to `read` when it does not. Both paths produce the SAME
   * headings, the SAME records, in the SAME order, and drive the SAME sequence of per-row transactions —
   * the only difference is how much of the file is alive at once.
   *
   * ⚠️ ONE HEADER PASS, THEN RECORDS. `columnList` must be complete and final before the first record is
   * yielded, because `model/dao/ProductDAO.cfc:L100-L173` classifies every heading BEFORE `:L176` opens
   * the record loop: the product lookup column is chosen by a four-candidate priority walk over the
   * heading list, the option-group headings are collected from it, and the option-group pre-pass queries
   * against them. A reader that discovered a heading mid-file could not support that ordering, and the
   * legacy — whose heading row is the file's first line, as the abandoned block at `:L95` states — never
   * needed to.
   *
   * ⚠️ THE RECORD ITERATOR MUST NOT QUERY, AND MUST NOT REORDER. It is advanced BETWEEN per-row
   * transactions, on the connection the previous row's transaction just settled on, so a record source
   * that issued statements of its own would interleave them with the row boundaries — exactly the
   * interleaving M6 exists to forbid. Reading bytes, parsing text and yielding parsed records are safe.
   * Records must be yielded in file order, once each, because the row number the importer reports is
   * derived from their position (`:L176`) and because M3 commits them in that order.
   *
   * ⚠️ AND ABANDONMENT MUST BE CLEAN. The importer stops consuming at the first failing row (M3) and, if
   * a cancellation signal is supplied, at the next row boundary after it aborts. A generator implementing
   * this member therefore has its `return()` invoked without having been exhausted, and must release its
   * connection, handle or buffer in a `finally` rather than only on normal completion.
   *
   * @param fileURL - the location, forwarded exactly as the caller supplied it (see the port).
   * @param delimiter - the field delimiter resolved from the file type, `''` for an unrecognised type.
   * @param textQualifier - the text qualifier, `''` by default per `model/dao/ProductDAO.cfc:L73`.
   * @returns the headings, and a lazy source of the records.
   */
  readStreaming?(
    fileURL: string,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordStream>;
}

/**
 * A retrieved delimited file whose headings are known up front and whose records arrive lazily.
 *
 * The streaming counterpart of {@link DelimitedImportRecordSet}: identical `columnList` contract, and
 * `records` in place of `rows`. It carries no legacy origin, because `model/dao/ProductDAO.cfc:L87`
 * retrieves the entire file into one CFML query object and has no lazy form to port. What it models is
 * the port's ability to produce the same rows in the same order without holding the whole catalog file,
 * which is structural (AAP §0.8.2 Guideline 4).
 */
export interface DelimitedImportRecordStream {
  /**
   * The headings, in file order and in their original casing — complete before the first record.
   *
   * Same contract as {@link DelimitedImportRecordSet.columnList}, including the retention of original
   * casing, and for the same reason: the legacy classifies and matches on the heading itself.
   */
  readonly columnList: readonly string[];

  /** The records, in file order, one at a time. See {@link ProductImportSourceReader.readStreaming}. */
  readonly records: AsyncIterable<DelimitedImportRecord>;
}

/**
 * The production {@link ProductImportSourceReader} — and it REFUSES, because the legacy call it ports
 * has never been able to resolve.
 *
 * ⚠️ THE COLLABORATOR THE LEGACY NAMES DOES NOT EXIST. `model/dao/ProductDAO.cfc:L87` reads
 * `getService("utilityTagService").cfhttp(...)`. A search of the whole legacy tree for
 * `utilityTagService` returns exactly ONE hit — that call site. No `UtilityTagService.cfc` exists
 * anywhere (`*UtilityTag*` matches no file), and no component in the tree declares a `cfhttp` member,
 * so DI/1's bean lookup cannot answer it.
 *
 * The contrast is decisive rather than circumstantial, and it isolates WHICH half is missing: the
 * sibling bean the SAME file resolves later, `hibachiUtilityService`, DOES exist — at
 * `model/service/HibachiUtilityService.cfc` and `org/Hibachi/HibachiUtilityService.cfc` — and
 * `getService` itself resolves fine, being declared on the chain's terminal base at
 * `org/Hibachi/HibachiObject.cfc`. It is the BEAN that is absent, not the lookup member.
 *
 * ⚠️ AND THE ABANDONED FALLBACK CANNOT RESCUE IT. `:L88-L97` holds a `new http()` block that would have
 * performed the retrieval directly, but every line of it is COMMENTED OUT. Reviving it would be the
 * opposite of a port: it would supply behaviour the running legacy system does not have.
 *
 * So this supplier reproduces the legacy's own outcome — the import cannot proceed — rather than
 * inventing a retrieval client to make it proceed. That is not discretionary:
 *
 *   1. AAP §0.6.7 governs with "preserve and annotate, do not repair", and §0.8.2 guideline 4 forbids
 *      enhancement "beyond what the migration requires".
 *   2. Writing a retrieval client here would mint every parameter the withdrawal note on
 *      {@link ProductImportSourceReader} recorded as un-inventable — a timeout, a redirect count, a byte
 *      cap, a scheme set — each a figure the legacy never states (S9, IR-12).
 *   3. It is the treatment three catalogued gaps already receive: defect D4
 *      (`model/service/SkuService.cfc:L281-L283`, delegating to an absent DAO member), D12 (`FeedDAO`,
 *      dead and unported) and D15 (`buildSkuCombinations`, unreachable and unported).
 *
 * The interface therefore stays the seam and this constant stays a CHOICE: `sourceReader` is a required
 * member of {@link MySqlProductRepositoryDependencies}, deliberately not defaulted, so an operator who
 * has a retrieval policy supplies a reader that implements it and nothing in this file changes — while
 * an operator who has none cannot acquire one by omission. Recorded by locator; no register entry is
 * minted, because the gap belongs to the legacy source rather than to this port. Residual exposure — a
 * caller-supplied address reaching whatever retrieval client an operator eventually writes — stays
 * flagged as register item M4 (S8).
 */
export const unresolvableProductImportSourceReader: ProductImportSourceReader = {
  read(
    fileURL: string,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordSet> {
    return Promise.reject(
      new NotImplementedError(
        'ProductImportSourceReader.read',
        'model/dao/ProductDAO.cfc:L87 retrieves the import file through ' +
          'getService("utilityTagService").cfhttp(...), and no utilityTagService bean is declared ' +
          'anywhere in the legacy repository — the single occurrence of the name is that call ' +
          'itself — so the legacy import has never been able to retrieve a file; the new http() ' +
          'fallback at :L88-L97 is commented out, and no retrieval client is invented here',
        {
          context: {
            fileURL,
            delimiter,
            textQualifier,
            locator: 'model/dao/ProductDAO.cfc:L87',
            absentBean: 'utilityTagService',
            mismatch: 'M4',
          },
        },
      ),
    );
  },
};

/**
 * Produces a URL title from a product name — the injected replacement for a call to a member that does
 * not exist.
 *
 * `model/dao/ProductDAO.cfc:L399` calls
 * `getService("hibachiUtilityService").filterFileName(...)`. A repository-wide search for
 * `filterFileName` returns exactly ONE hit: that call. No component in the tree DEFINES the member, so
 * the legacy product-insert path could not complete — the same class of fault as the service member
 * that delegates to an absent DAO member, and as the entity getter at `model/entity/Product.cfc:L631`
 * that calls a service method which was never written. Recorded by locator; no register entry is minted
 * for it.
 *
 * Because the algorithm does not exist to port, NONE IS INVENTED HERE (S9). The transform is injected,
 * and the composition root decides what it is.
 *
 * ⚠️ AND IT IS NOT `src/util/urlTitle.ts`. That module ports
 * `model/service/DataService.cfc:L53-L71`, whose collision strategy is an UNBOUNDED loop with a
 * pre-incremented counter, so its first collision suffix is `-2`. The importer's strategy at
 * `model/dao/ProductDAO.cfc:L404-L406` is categorically different — a SINGLE append with no re-probe.
 * Importing that module here to "unify" the two would change what the importer produces, which the
 * Minimal Change Clause forbids. See {@link MySqlProductRepository} for the divergence note in full.
 *
 * @param productName - the product name cell of the row being inserted.
 * @returns the candidate URL title.
 */
export type ImportUrlTitleFilter = (productName: string) => string;

/**
 * The production {@link ImportUrlTitleFilter} — and it REFUSES, for the same reason the reader above
 * does, but by a materially different mechanism worth stating precisely.
 *
 * ⚠️ HERE THE BEAN EXISTS AND THE MEMBER DOES NOT. `model/dao/ProductDAO.cfc:L399` calls
 * `getService("hibachiUtilityService").filterFileName(...)`. That bean resolves —
 * `model/service/HibachiUtilityService.cfc` extends `Slatwall.org.Hibachi.HibachiUtilityService`, which
 * extends `HibachiService` — so the call does reach the fabrication handler at
 * `org/Hibachi/HibachiService.cfc:L255-L280`. And there it dies: that handler dispatches on eight
 * lower-cased prefixes only — `get` (with its `smartlist` sub-branch), `new`, `list`, `save`, `delete`,
 * `count`, `export`, `process` — and `filter` is none of them, so control falls through to the throw at
 * `:L280`. A search of the whole legacy tree for `filterFileName` returns exactly ONE hit: the call
 * site. Nothing declares it.
 *
 * That is worth generalising, because it bounds a mechanism this port leans on elsewhere:
 * `onMissingMethod` rescues an undeclared call ONLY when its name carries one of those eight prefixes.
 * IR-1 concerns the members it DOES fabricate — and this is one it REFUSES. Refusing is therefore the
 * behaviour to port, not an accident to route around.
 *
 * NO ALGORITHM IS INVENTED (S9), and in particular `src/util/urlTitle.ts` is NOT reused — the contract's
 * own note above records why the two collision strategies are categorically different, a single
 * unre-probed append here versus an unbounded pre-incremented loop there. Like the reader above, this is
 * an exported CHOICE rather than a default: `urlTitleFilter` is a required dependency member, so an
 * operator with a filename policy supplies one, and until then the port reproduces the legacy's own
 * failure instead of masking it behind a plausible transform.
 */
export const unresolvableImportUrlTitleFilter: ImportUrlTitleFilter = (
  productName: string,
): string => {
  throw new NotImplementedError(
    'ImportUrlTitleFilter',
    'model/dao/ProductDAO.cfc:L399 derives the URL title through ' +
      'getService("hibachiUtilityService").filterFileName(...); the bean resolves but the member is ' +
      'declared nowhere in the legacy repository — the single occurrence of the name is that call ' +
      'itself — and org/Hibachi/HibachiService.cfc:L255-L280 fabricates only the ' +
      'get/new/list/save/delete/count/export/process prefixes, so the unmatched "filter" prefix ' +
      'reaches the throw at :L280; no filename algorithm is invented here',
    {
      context: {
        productName,
        locator: 'model/dao/ProductDAO.cfc:L399',
        absentMember: 'hibachiUtilityService.filterFileName',
        fabricationHandler: 'org/Hibachi/HibachiService.cfc:L255-L280',
      },
    },
  );
};

/**
 * The collaborators this repository is constructed with.
 *
 * An options object rather than six positional parameters, because a positional list of that length
 * is exactly where a composition root silently transposes two same-typed arguments. Every member is
 * readonly and every one is used.
 *
 * ⭐ F5 — WHAT IS DELIBERATELY NOT A MEMBER HERE. An earlier revision carried a sixth member, a
 * `GlobalImageExtensionResolver` callback supplying the value the second derived-column back-fill
 * needs. It is gone, and its absence is the point: a setting default injected into a MySQL adapter put
 * key, default and provider accounting outside the settings module and invented a deployment input for
 * a value the legacy never asked an operator for. The value now comes from
 * `DEPRECATED_SETTING_DEFAULTS` in `../settings/StaticSettingResolver`, which is the one module that
 * owns setting defaults in this port — so there is exactly one setting boundary again, and the port's
 * frozen eighteen-key union is untouched. See {@link MySqlProductRepository.backfillImportDerivedColumns}.
 */
export interface MySqlProductRepositoryDependencies {
  /**
   * The pool-bound execution surface, for the three regions the legacy runs outside any transaction:
   * the attribute-set selection, the option-group pre-pass at `model/dao/ProductDAO.cfc:L161-L173`
   * (which sits BEFORE `transaction{` opens at `:L177`), and the product search.
   */
  readonly executor: ProductStatementExecutor;

  /** The two transaction boundaries of the importer. See {@link ProductImportTransactionBoundary}. */
  readonly transactions: ProductImportTransactionBoundary;

  /** The retrieval collaborator. See {@link ProductImportSourceReader}. */
  readonly sourceReader: ProductImportSourceReader;

  /**
   * The current-account context, replacing `getSlatwallScope().getCurrentAccount().getAccountID()` at
   * `model/dao/ProductDAO.cfc:L153` and again at `:L341`.
   */
  readonly accountContext: AccountContextPort;

  /** The URL-title transform. See {@link ImportUrlTitleFilter}. */
  readonly urlTitleFilter: ImportUrlTitleFilter;

  /**
   * Reads the identifier of a product's default SKU, for the `defaultSkuID` foreign key (F03).
   *
   * ⚠️ IT IS A FUNCTION BECAUSE `Product.defaultSku` IS NOT A `Sku`. That field is typed against
   * `ProductDefaultSkuDelegate` — a nine-member behavioural interface in
   * `src/domain/product/Product.ts` that deliberately exposes NO identifier accessor, so the SKU type
   * never has to be imported into the product module. `src/domain/sku/Sku.ts` already declares
   * {@link DefaultSkuIdReader} for exactly this read and uses it for the mirror-image direction in
   * `Sku.getDefaultFlag` and `Sku.isNotDefaultSku`, so this reuses that contract rather than widening
   * the delegate or minting a second one. `src/services/ProductService.ts` holds the same collaborator
   * for the same reason.
   */
  readonly readDefaultSkuId: DefaultSkuIdReader;
}

/**
 * One `{name, value}` pair of the legacy `extraData` arrays.
 *
 * Built at `model/dao/ProductDAO.cfc:L144`, `:L147`, `:L190`, `:L191`, `:L198` and `:L204`, and
 * consumed at `:L368-L378`.
 */
export interface ImportFieldAssignment {
  /** The COLUMN name, already stripped of any table prefix — `activeFlag`, `brandID`, `skucode`. */
  readonly name: string;
  /** The value, as text. */
  readonly value: string;
}

/* ================================================================================================
 * CFML LIST AND STRING SEMANTICS, REPRODUCED EXACTLY
 * ==============================================================================================
 * The legacy leans on four CFML behaviours that TypeScript does not share, and every one of them
 * changes an outcome rather than merely a spelling. They are reproduced here, once each, so no call
 * site has to remember them.
 * ============================================================================================== */

/**
 * Splits a delimited list the way CFML's `listToArray` does: EMPTY TOKENS ARE DROPPED.
 *
 * This is the behaviour `model/dao/ProductDAO.cfc:L74` depends on (`listLast(fileURL,".")`), `:L123`
 * depends on (`listToArray(data.columnList)`), `:L240` depends on (`ListLast(customAttribute,"_")`) and
 * `:L259` depends on (`listToArray(data['productcontent_page'][r])`).
 *
 * ⚠️ IT IS NOT THE SAME AS THE SPLIT USED FOR BOUND LISTS. `cfqueryparam … list="true"` KEEPS empty
 * tokens, which is why {@link splitBoundList} exists separately and why the two must never be merged.
 * Merging them would change `IN ('')` into a zero-placeholder syntax error.
 *
 * @param value - the delimited text.
 * @param delimiter - the single-character delimiter.
 * @returns the non-empty tokens, in order.
 */
function listToArray(value: string, delimiter: string): string[] {
  const tokens: string[] = [];

  for (const token of value.split(delimiter)) {
    if (token.length > 0) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * The first token of a delimited list, or the empty string when there is none.
 *
 * The port of `listFirst(column,"_")` at `model/dao/ProductDAO.cfc:L131`, `:L133`, `:L135` and `:L137`.
 * CFML returns the first NON-EMPTY token, so a heading such as `_product_code` yields `product` — a
 * detail that survives here because {@link listToArray} drops empty tokens.
 *
 * @param value - the delimited text.
 * @param delimiter - the single-character delimiter.
 * @returns the first token, or `''` when the text contains none.
 */
function listFirst(value: string, delimiter: string): string {
  return listToArray(value, delimiter)[0] ?? '';
}

/**
 * The last token of a delimited list, or the empty string when there is none.
 *
 * The port of `listLast(...)` at `model/dao/ProductDAO.cfc:L74`, `:L240`, `:L351`, `:L353`, `:L355`,
 * `:L375` and `:L386`. The `:L386` use is the sharpest: it derives a COLUMN NAME at run time from a
 * file heading, which is why every result of this function that reaches statement text passes through
 * {@link assertColumnName} first.
 *
 * @param value - the delimited text.
 * @param delimiter - the single-character delimiter.
 * @returns the last token, or `''` when the text contains none.
 */
function listLast(value: string, delimiter: string): string {
  const tokens = listToArray(value, delimiter);

  return tokens[tokens.length - 1] ?? '';
}

/**
 * Case-insensitive membership, the port of `listFindNoCase` and `arrayFindNoCase`.
 *
 * `model/dao/ProductDAO.cfc:L104`, `:L143`, `:L146`, `:L199`, `:L258` and `:L343` all test membership
 * case-insensitively. CFML treats `brand_brandname` and `brand_BrandName` as the same list entry;
 * TypeScript's `includes` does not, so the comparison is normalised on both sides.
 *
 * @param values - the candidate list.
 * @param candidate - the value to look for.
 * @returns `true` when any entry matches ignoring case and surrounding whitespace.
 */
function containsNoCase(values: readonly string[], candidate: string): boolean {
  const normalisedCandidate = normaliseHeading(candidate);

  return values.some((value) => normaliseHeading(value) === normalisedCandidate);
}

/**
 * Normalises a heading or a file type for case-insensitive comparison and lookup.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L179` and `:L183` — THIS IS THE COLUMN-KEY CASING DECISION,
 * MADE ONCE AND STATED ONCE. CFML struct keys are case-insensitive, so `data['brand_brandname'][r]` at
 * `:L180` resolves against a file heading spelled `brand_brandName`, `Brand_BrandName` or any other
 * casing. A TypeScript record lookup would silently miss all but the exact spelling, and a miss here
 * produces no error at all — it produces an import that quietly fails to find a brand on real-world
 * files.
 *
 * The convention chosen is therefore: TRIM AND LOWER-CASE EVERY HEADING ON INGEST, keep the original
 * spellings in `columnList` for classification and for reporting, and route every lookup through this
 * function. The trim matters as much as the case fold: a delimited file's first field routinely carries
 * a stray space, and CFML's list functions ignore it in the comparisons above.
 *
 * @param value - a heading or file type in any casing.
 * @returns the normalised form used as a lookup key.
 */
function normaliseHeading(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Removes the FIRST case-insensitive occurrence of a prefix, the port of
 * `replaceNoCase(value, search, "", "one")`.
 *
 * Used only at `model/dao/ProductDAO.cfc:L163` to turn an option heading into its group key. The
 * "first occurrence only" and "case-insensitive" halves are both load-bearing: `option_Option_Size`
 * yields `Option_Size` and not `Size`, and `OPTION_size` yields `size` rather than being left alone.
 *
 * Implemented by index rather than by a regular expression, so a prefix containing regular-expression
 * metacharacters could never be reinterpreted as a pattern.
 *
 * @param value - the text to strip.
 * @param search - the prefix text to remove, matched ignoring case.
 * @returns the text with the first occurrence removed, or unchanged when there is none.
 */
function removeFirstNoCase(value: string, search: string): string {
  const position = value.toLowerCase().indexOf(search.toLowerCase());

  if (position < 0) {
    return value;
  }

  return value.slice(0, position) + value.slice(position + search.length);
}

/**
 * Splits a comma-delimited list for BINDING, the port of `cfqueryparam … list="true"`.
 *
 * ⚠️ EMPTY TOKENS ARE KEPT, AND THAT IS THE WHOLE POINT. CFML binds one parameter per token WITHOUT
 * discarding empties, so the legacy filter at `model/dao/ProductDAO.cfc:L424-L425` binds a single
 * empty-string parameter for an input of `''` and the predicate is literally `IN ('')`. TypeScript's
 * `''.split(',')` yields `['']`, so a bare split agrees naturally — which is why this function is a
 * bare split and why four tidy-ups are forbidden: dropping empty tokens (which yields ZERO placeholders
 * and a syntax error), short-circuiting the empty case to a constant predicate, trimming each token,
 * and de-duplicating. The same discipline `MySqlOptionRepository.ts` records for its two list filters.
 *
 * @param value - the comma-delimited text.
 * @returns one value to bind per token, in order, empties included.
 */
function splitBoundList(value: string): string[] {
  return value.split(LIST_DELIMITER);
}

/**
 * Renders the bind markers for a set-membership clause.
 *
 * ⚠️ A COUNT OF ZERO IS A CALLER MISTAKE, NOT A DEGENERATE CASE. `IN ()` is a syntax error, so this
 * raises rather than emitting it. No caller in this file can reach zero: {@link splitBoundList} never
 * returns an empty array, and the attribute-set selection binds its lists through the same rule.
 *
 * @param count - how many values will be bound.
 * @returns the joined bind markers.
 * @throws {DomainError} when `count` is not a positive integer.
 */
function toPlaceholderList(count: number): string {
  if (!Number.isInteger(count) || count < 1) {
    throw new DomainError(
      'A set-membership clause was composed with no bind markers, which is not a statement any ' +
        'engine accepts. Bind at least one value, as the legacy list binding always did.',
      { context: { count } },
    );
  }

  return new Array<string>(count).fill(BIND_PLACEHOLDER).join(PLACEHOLDER_JOINER);
}

/* ================================================================================================
 * TYPED READS — WHERE THE LEGACY'S UNGUARDED ACCESSES BECOME EXPLICIT (S1)
 * ============================================================================================== */

/**
 * Reads one projected text column out of a row.
 *
 * Three outcomes, each matching a distinct reality rather than a convenience:
 *   - ABSENT column — the statement and this reader have DRIFTED, which is an adapter fault no caller
 *     can correct, so it raises as a data-integrity failure. Substituting a blank would turn a broken
 *     projection into plausible-looking output that surfaces far from its cause.
 *   - NULL column — yields the empty string. Not an invented default: a CFML query column read never
 *     produces null, so the legacy interpolations observed `''` for a NULL and composed around it.
 *   - NON-TEXT column — raises. Coercing a number or a date would hide that the column being read is
 *     not the column intended.
 *
 * @param row - one raw row.
 * @param columnName - a validated column name.
 * @returns the column's text, or `''` when it is NULL.
 * @throws {DataIntegrityError} when the column is absent from the row.
 * @throws {DomainError} when the column holds a value that is not text.
 */
function readTextColumn(row: MySqlRow, columnName: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, columnName)) {
    throw new DataIntegrityError(
      'A projected column is missing from the row the database returned, so the statement and the ' +
        'reader that consumes it have drifted apart.',
      { context: { columnName, availableColumns: Object.keys(row) } },
    );
  }

  const value = row[columnName];

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new DomainError(
      'A projected column holds a value that is not text, so it cannot be read as an identifier or ' +
        'a code.',
      { context: { columnName, valueType: typeof value } },
    );
  }

  return value;
}

/**
 * Reads a column from the FIRST row of a result, yielding `''` when there are no rows.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L182`, `:L186`, `:L216` and `:L390` — THE LEGACY PERFORMED
 * THIS READ WITH NO RECORD-COUNT GUARD, AND AT `:L390` IT PERFORMED IT BEFORE THE EXISTENCE TEST AT
 * `:L392` THAT WOULD HAVE TOLD IT WHETHER THERE WAS ANYTHING TO READ. Those reads survived only because
 * a CFML query column used in a string context yields the empty string when the query is empty and the
 * first row's value otherwise.
 *
 * Under `noUncheckedIndexedAccess` the first element is `T | undefined`, so the guard is now explicit
 * and this function is the one place it lives. The OUTCOME is identical to the legacy's — `''` for no
 * rows, the first row's value otherwise, and no attention paid to rows beyond the first even when the
 * statement returned several. What changes is that the guard is now visible and testable instead of
 * being a property of the language.
 *
 * @param rows - the rows a statement returned.
 * @param columnName - a validated column name.
 * @returns the first row's value, or `''` when there are no rows.
 * @throws {DataIntegrityError} when there is a row but the column is absent from it.
 * @throws {DomainError} when the column holds a value that is not text.
 */
function readFirstRowText(rows: readonly MySqlRow[], columnName: string): string {
  const first = rows[0];

  if (first === undefined) {
    return '';
  }

  return readTextColumn(first, columnName);
}

/**
 * One record of a retrieved file, with its one-based position preserved.
 *
 * The position is kept because the legacy passes `r` into `saveImportData` at
 * `model/dao/ProductDAO.cfc:L193` and `:L207` and reads cells by it. Keeping it ONE-BASED rather than
 * renumbering to zero means an error raised while importing row seven names row seven, exactly as the
 * legacy's own numbering would have.
 */
interface NormalisedImportRow {
  /** The one-based position, the port of `r` from `model/dao/ProductDAO.cfc:L176`. */
  readonly rowNumber: number;
  /** The cells, keyed by {@link normaliseHeading} of their heading. */
  readonly cells: ReadonlyMap<string, string>;
}

/**
 * A retrieved file with its headings preserved and its cell keys normalised.
 *
 * The internal counterpart of {@link DelimitedImportRecordSet}: `columnList` keeps the original
 * spellings because the legacy classifies on them, while every cell lookup goes through the normalised
 * key. See {@link normaliseHeading} for why.
 */
interface NormalisedImportData {
  readonly columnList: readonly string[];
  readonly rows: AsyncIterable<NormalisedImportRow>;
}

/**
 * Normalises ONE record, at the moment it is about to be imported.
 *
 * ⚠️ A DUPLICATE HEADING COLLAPSES, AND SO IT SHOULD. Two headings differing only in case are ONE
 * struct key in CFML, so the later cell wins there too; this reproduces that by writing both into the
 * same map entry in file order.
 *
 * @param record - one record as the reader produced it.
 * @param rowNumber - its one-based position, the port of `r` from `model/dao/ProductDAO.cfc:L176`.
 * @returns the normalised row every read below uses.
 */
function normaliseRecord(record: DelimitedImportRecord, rowNumber: number): NormalisedImportRow {
  const cells = new Map<string, string>();
  for (const [heading, value] of Object.entries(record)) {
    cells.set(normaliseHeading(heading), value);
  }

  return { rowNumber, cells };
}

/**
 * Normalises records as they arrive, one at a time, numbering them from one in arrival order.
 *
 * ⭐ THIS IS WHERE THE SECOND WHOLE-FILE COPY USED TO BE. The previous form walked every record the
 * reader had produced, built a `Map` for each, pushed all of them into a second array and returned it,
 * so a file was resident TWICE for the whole import — once as the reader's records and once as the
 * normalised rows — and every row's `Map` stayed alive until the last row committed. This yields each
 * normalised row at the point the importer is about to open its transaction, so exactly one row is
 * alive at a time and the reader's own record is free the moment its row commits.
 *
 * ⚠️ NOTHING ABOUT THE ROWS THEMSELVES CHANGES, WHICH IS WHAT MAKES THE CHANGE STRUCTURAL. Same
 * normalisation, same duplicate-heading collapse, same ONE-BASED numbering in arrival order, same
 * order, same count. The numbering is assigned here rather than by the source so that a streaming
 * reader and a materialising one produce identical row numbers for identical files, and so an error
 * raised while importing row seven still names row seven exactly as the legacy's own `r` would.
 *
 * ⚠️ AND THE `undefined` GUARD IS GONE BECAUSE ITS CAUSE IS GONE, NOT BECAUSE IT WAS SUPPRESSED. It
 * existed to satisfy `noUncheckedIndexedAccess` on `recordSet.rows[index]` — an indexed read into an
 * array. Iteration yields elements directly, so there is no indexed read left to check and no
 * unreachable `DataIntegrityError` branch left to carry.
 *
 * @param records - the records, in file order.
 * @returns the normalised rows, in the same order, lazily.
 */
/**
 * Re-presents rows already held in memory as the {@link NormalisedImportData.rows} sequence.
 *
 * The single caller is
 * {@link MySqlProductRepository.refuseRequestedContentAssignments}, which has to walk every row to
 * decide whether the file can be imported at all and therefore cannot leave the one-pass generator it
 * walked for the record loop to consume. This exists so that the loop's contract — an async sequence of
 * normalised rows, pulled one at a time — is identical whether the rows arrive from the retrieval stream
 * or from that walk's buffer, and so the record loop needs no knowledge of which happened.
 *
 * ⚠️ NOT AN `async function*`, DELIBERATELY. There is nothing to await — the rows are already in
 * memory — and an async generator that awaits nothing is exactly what `require-await` reports. The
 * iterable is therefore assembled by hand: one iterator is taken ONCE and shared by every
 * `[Symbol.asyncIterator]()` call, so the sequence is single-pass in the same way a spent generator is,
 * and `for await` consumes it identically.
 *
 * @param rows - the rows collected by the walk, in file order.
 * @returns those rows, in the same order, as a one-pass async sequence.
 */
function replayBufferedRows(
  rows: readonly NormalisedImportRow[],
): AsyncIterable<NormalisedImportRow> {
  const iterator = rows[Symbol.iterator]();
  return {
    [Symbol.asyncIterator](): AsyncIterator<NormalisedImportRow> {
      return {
        next(): Promise<IteratorResult<NormalisedImportRow>> {
          return Promise.resolve(iterator.next());
        },
      };
    },
  };
}

async function* normaliseRecords(
  records: AsyncIterable<DelimitedImportRecord> | Iterable<DelimitedImportRecord>,
): AsyncGenerator<NormalisedImportRow> {
  let rowNumber = 0;

  for await (const record of records) {
    rowNumber += 1;
    yield normaliseRecord(record, rowNumber);
  }
}

/**
 * Reads one cell, raising when the heading is not in the file.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L180`, `:L184`, `:L399` and `:L405` — THE LEGACY READS
 * `data['brand_brandname'][r]`, `data['productType_productTypeName'][r]`,
 * `data['product_productName'][r]` and `data['product_productCode'][r]` UNCONDITIONALLY, without ever
 * checking that the file carries those headings. A file lacking any one of them makes the legacy raise
 * an undefined-element error part-way through the import, leaving the rows already committed committed
 * — the M3 partial-import shape. That outcome is preserved: this raises, with the heading named, and
 * the per-row boundary that was open rolls back while earlier rows stay committed. No default cell
 * value is invented (S9).
 *
 * @param row - the normalised row.
 * @param heading - the heading to read, in any casing.
 * @returns the cell's text.
 * @throws {DataIntegrityError} when the file carries no such heading.
 */
function readCell(row: NormalisedImportRow, heading: string): string {
  const value = row.cells.get(normaliseHeading(heading));

  if (value === undefined) {
    throw new DataIntegrityError(
      'The imported file does not carry a column the importer requires for this row, so the row ' +
        'cannot be saved.',
      { context: { heading, rowNumber: row.rowNumber } },
    );
  }

  return value;
}

/* ================================================================================================
 * STATEMENT COMPOSITION — EVERY VALUE A BIND MARKER, EVERY IDENTIFIER VALIDATED (S2, D18)
 * ==============================================================================================
 * The composers are pure and take no executor, so `test/adapters/MySqlProductRepository.test.ts` can
 * assert on the exact text without a database (S6). Not one of them accepts a fragment, a raw
 * expression or a pre-built clause: there is no seam here through which caller-supplied text could
 * reach statement text, which is what makes D18's closure structural rather than careful.
 *
 * The trailing `;` the legacy embeds inside every interpolated string is dropped throughout. A prepared
 * statement is a single statement and needs no terminator; the omission is idiom, not behaviour.
 *
 * ⛔ EVERY COMPOSER THAT ACCEPTS AN IDENTIFIER FROM ITS CALLER RE-VALIDATES IT, EVEN THOUGH THE CALLER
 * ALREADY DID. These functions are exported, so "the caller validates first" would be a convention, and
 * a convention is not a guarantee: nothing in the type system stops a later caller — or a test — from
 * handing a column name straight through. Both assertions are idempotent on an already-canonical name,
 * so the second pass costs a map lookup and converts the discipline from careful into structural. The
 * three composers taking caller identifiers are `composeExistenceLookup`, `composeImportUpdate` and
 * `composeImportInsert`; `composeAttributeSetSelection` and `composeProductSearch` take only counts and
 * build from the module-scope constants above, which were validated where they were declared.
 * ============================================================================================== */

/**
 * The attribute-set selection — the translation of `model/dao/ProductDAO.cfc:L52-L71`.
 *
 * ⚠️ TODO(parity) D20 — `model/dao/ProductDAO.cfc:L64` CARRIES ONE OF ONLY THREE LITERAL TODO COMMENTS
 * IN THE ENTIRE SLICE, AND ONLY THE SECOND OF TWO CONDITIONALS COLLAPSES. This is the single easiest
 * mistake to make in this file, because the two conditionals test THE SAME PREDICATE nine lines apart
 * and look like duplicated logic:
 *
 *   - `:L56-L61` IS HQL SHAPING AND IS PRESERVED IN FULL. A non-empty product-type list produces
 *     `AND (globalFlag = 1 OR exists(...))`; an empty one produces `AND globalFlag = 1`. Collapsing it
 *     changes WHICH ATTRIBUTE SETS COME BACK, and it would still compile and still pass any test that
 *     merely checks a statement was built. Both branches survive below.
 *   - `:L64-L69` IS THE ONE THAT COLLAPSES, and `:L64`'s own comment says why: "Remove this conditional
 *     when railo and ACF match how they handle arrays for 'IN' clause". It guards nothing but parameter
 *     BINDING — `:L66` binds the type codes as a comma-delimited LIST while `:L68` binds the same named
 *     parameter as an ARRAY, purely to work around a difference between two CFML engines. That
 *     difference does not exist in TypeScript, so there is exactly ONE binding path here, and AAP
 *     §0.6.7.1 records the collapse as an intentional simplification. IT IS NOT A DEFECT REPAIR AND IS
 *     NOT PRESENTED AS ONE — the precondition the TODO was waiting for is satisfied by the migration
 *     itself.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L58` — THE ASSOCIATION THE LEGACY NAMES DOES NOT EXIST, AND
 * THE PHYSICAL RELATIONSHIP IS SUBSTITUTED AS A TRANSLATION DECISION. `:L58` reads
 * `exists(FROM sas.attributeSetAssignments asa WHERE asa.productTypeID IN (:productTypeIDs))`, but
 * `model/entity/AttributeSet.cfc` declares NO `attributeSetAssignments` property, and no
 * `AttributeSetAssignment` entity exists anywhere in `model/entity/` — the directory holds only
 * `Attribute.cfc`, `AttributeOption.cfc`, `AttributeSet.cfc` and `AttributeValue.cfc`. A
 * repository-wide search for the name returns five hits: four inside
 * `model/entity/ProductType.cfc:L94-L98`, where it is a runtime-synthesized smart list, and this one.
 * The legacy non-empty branch therefore could not execute — and nothing ever noticed, because the
 * member has ZERO CALLERS repository-wide.
 *
 * Native SQL resolves no association path, so a path-for-path transcription is impossible rather than
 * merely awkward. The relationship is made EXPLICIT against the physical link table
 * `model/entity/AttributeSet.cfc:L70` declares — `linktable="SwAttributeSetProductType"`,
 * `fkcolumn="attributeSetID"`, `inversejoincolumn="productTypeID"` — which is the same discipline
 * `MySqlSkuRepository.ts` applies to the unqualified association paths of the existence chain. Recorded
 * under AAP §0.8.2 Guideline 6 as a translation decision, NOT as a repair, and explicitly NOT as part
 * of D18.
 *
 * TWO FURTHER FIDELITY NOTES. The legacy HQL has no `SELECT`, so it returns whole entities; the
 * projection here is `sas.*` and the rows leave unnarrowed as `unknown`, because `Attribute*` is an
 * excluded family whose shape must not be invented. And `sas.attributeSetType.systemCode` at `:L55` and
 * `:L62` is an implicit HQL join through `fkcolumn="attributeSetTypeID"`
 * [`model/entity/AttributeSet.cfc:L64`], written out here as an explicit inner join with the one alias
 * this file adds; the legacy's own aliases `sas`, `sa` and `asa` are preserved verbatim so the two texts
 * stay diffable.
 *
 * @param attributeSetTypeCodeCount - how many system codes will be bound. At least one.
 * @param productTypeIdCount - how many product-type identifiers will be bound. ZERO selects the
 *   `globalFlag = 1` shape of `:L60`; anything else selects the disjunctive shape of `:L57-L58`.
 * @returns the statement text.
 * @throws {DomainError} when `attributeSetTypeCodeCount` is not a positive integer.
 */
export function composeAttributeSetSelection(
  attributeSetTypeCodeCount: number,
  productTypeIdCount: number,
): string {
  const typeCodePlaceholders = toPlaceholderList(attributeSetTypeCodeCount);

  // `:L56-L61`, PRESERVED IN FULL. Both branches, unchanged.
  const globalOrAssignedClause =
    productTypeIdCount > 0
      ? `( sas.${OUT_OF_SCOPE_COLUMN.globalFlag} = 1
        OR EXISTS (
          SELECT 1
          FROM ${OUT_OF_SCOPE_TABLE.attributeSetProductType} asa
          WHERE asa.${OUT_OF_SCOPE_COLUMN.attributeSetID} = sas.${OUT_OF_SCOPE_COLUMN.attributeSetID}
            AND asa.${OUT_OF_SCOPE_COLUMN.productTypeID} IN (${toPlaceholderList(productTypeIdCount)})
        ) )`
      : `sas.${OUT_OF_SCOPE_COLUMN.globalFlag} = 1`;

  return `SELECT
    sas.*
  FROM
    ${OUT_OF_SCOPE_TABLE.attributeSet} sas
    INNER JOIN ${OUT_OF_SCOPE_TABLE.type} ast
      ON ast.${OUT_OF_SCOPE_COLUMN.typeID} = sas.${OUT_OF_SCOPE_COLUMN.attributeSetTypeID}
  WHERE
    ( EXISTS (
        SELECT 1
        FROM ${OUT_OF_SCOPE_TABLE.attribute} sa
        WHERE sa.${OUT_OF_SCOPE_COLUMN.attributeSetID} = sas.${OUT_OF_SCOPE_COLUMN.attributeSetID}
          AND sa.${OUT_OF_SCOPE_COLUMN.activeFlag} = 1
      )
      AND ast.${OUT_OF_SCOPE_COLUMN.systemCode} IN (${typeCodePlaceholders}) )
    AND ${globalOrAssignedClause}
  ORDER BY
    ast.${OUT_OF_SCOPE_COLUMN.systemCode} ASC,
    sas.${OUT_OF_SCOPE_COLUMN.sortOrder} ASC`;
}

/**
 * The option-group lookup — the translation of `model/dao/ProductDAO.cfc:L164-L166`.
 *
 * ⚠️ THREE INTERPOLATIONS OF ONE VALUE BECOME THREE BIND MARKERS BOUND TO THAT SAME VALUE. The legacy
 * text substitutes `#optionGroupKey#` into all three disjuncts, so a single heading-derived key is
 * matched against the group's name, its code and its identifier. Collapsing the three markers into one,
 * or reordering the disjuncts, would change which group a heading resolves to when two groups collide
 * across those columns (TR-4).
 *
 * @returns the statement text: three bind markers, all for the same value.
 */
const OPTION_GROUP_LOOKUP_STATEMENT = `SELECT
    ${OPTION_GROUP_ID_COLUMN}
  FROM
    ${OPTION_GROUP_TABLE}
  WHERE
    ${OPTION_GROUP_NAME_COLUMN} = ${BIND_PLACEHOLDER}
    OR ${OPTION_GROUP_CODE_COLUMN} = ${BIND_PLACEHOLDER}
    OR ${OPTION_GROUP_ID_COLUMN} = ${BIND_PLACEHOLDER}`;

/**
 * The brand lookup — the translation of `model/dao/ProductDAO.cfc:L179-L181`, a file-fed D18 site.
 *
 * ⚠️ THE MATCH IS ON `brandName`, NOT ON A CODE OR AN IDENTIFIER, and there is no active-flag filter
 * and no ordering. A file naming a brand that does not exist yields no rows, and the guarded read then
 * carries the empty string into the product's `brandID` — the legacy outcome, preserved.
 */
const BRAND_LOOKUP_STATEMENT = `SELECT
    ${BRAND_ID_COLUMN}
  FROM
    ${BRAND_TABLE}
  WHERE
    ${BRAND_NAME_COLUMN} = ${BIND_PLACEHOLDER}`;

/**
 * The product-type lookup — the translation of `model/dao/ProductDAO.cfc:L183-L185`, a file-fed D18
 * site. Same shape and same no-match behaviour as the brand lookup above.
 */
const PRODUCT_TYPE_LOOKUP_STATEMENT = `SELECT
    ${PRODUCT_TYPE_ID_COLUMN}
  FROM
    ${PRODUCT_TYPE_TABLE}
  WHERE
    ${PRODUCT_TYPE_NAME_COLUMN} = ${BIND_PLACEHOLDER}`;

/**
 * The option lookup — the translation of `model/dao/ProductDAO.cfc:L212-L214`.
 *
 * ⚠️ THE LEFT JOIN IS LOAD-BEARING AND SO IS THE SIDE IT IS ON. The FROM is the option GROUP and the
 * join to the option is OUTER, with the option-code predicate ON THE JOIN rather than in the WHERE, so
 * the statement returns exactly one row whenever the group exists — carrying a NULL `optionID` when the
 * group has no option with that code. That is what lets `:L217` branch on an empty `optionID` and create
 * the option, and what makes `:L225` able to read the group identifier out of the same row. Moving the
 * code predicate into the WHERE, or making the join inner, would return no row and break both.
 *
 * Bind order follows the legacy TEXT order: the option code first, because it appears in the ON clause,
 * then the group identifier (TR-4).
 */
const OPTION_LOOKUP_STATEMENT = `SELECT
    ${OPTION_TABLE}.${OPTION_ID_COLUMN},
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN}
  FROM
    ${OPTION_GROUP_TABLE}
    LEFT JOIN ${OPTION_TABLE}
      ON ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN} = ${OPTION_TABLE}.${OPTION_OPTION_GROUP_ID_COLUMN}
      AND ${OPTION_TABLE}.${OPTION_CODE_COLUMN} = ${BIND_PLACEHOLDER}
  WHERE
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN} = ${BIND_PLACEHOLDER}`;

/**
 * The SKU-option existence test — the translation of `model/dao/ProductDAO.cfc:L218-L220`.
 *
 * Bind order is the option identifier then the SKU identifier, matching the legacy text.
 *
 * ⚠️ A CONSTANT PROJECTION AND A ONE-ROW STOP, WHERE THE LEGACY PROJECTED `optionID` AND READ THE WHOLE
 * MATCH SET. Structural, and provably answer-preserving from the legacy body rather than by argument.
 * `:L218-L220` is `SELECT optionID FROM SlatwallSkuOption WHERE optionID = '#optionID#' AND skuID =
 * '#skuID#'`; `:L221` binds `var exists = dataQuery.execute().getResult().recordcount`; and `:L230`
 * `if(!exists)` is the ONLY thing that ever reads `exists`. In CFML `!0` is true and `!n` is false for
 * every other count, so only non-zeroness ever mattered — and the sibling `else` branch at `:L228`
 * assigns `var exists = false`, a BOOLEAN, into the same variable, which is the legacy itself
 * confirming that the value is consumed as a flag rather than as a magnitude. The projected `optionID`
 * is never read off this result set (the option identifier in hand at `:L216` is the one the insert at
 * `:L232` uses), so one matching row is complete evidence and every further row was discarded. The
 * verdict does not rest on the pair being unique — and that is deliberate, because this repository has
 * no DDL to appeal to (the schema is generated from CFC metadata, which declares only a `many-to-many`
 * `linktable="SwSkuOption"` at `model/entity/Sku.cfc:L76`). Even where duplicate link rows existed, the
 * legacy's `!exists` could not have told one from many, so neither shape can diverge from the other.
 *
 * The two columns are still named in the predicate and still come from the whitelist, so S2 holds
 * exactly as before, and the bind order above is untouched (TR-4). The `1` is a projection literal
 * authored here, not caller data, so it is not a value position requiring a placeholder — the two
 * placeholders below remain the only ones. `LIMIT 1` invents no ordering (AAP §0.7.3 S9) and cannot
 * change a verdict that is already "did anything match at all".
 */
const SKU_OPTION_EXISTENCE_STATEMENT = `SELECT
    1
  FROM
    ${SKU_OPTION_TABLE}
  WHERE
    ${SKU_OPTION_OPTION_ID_COLUMN} = ${BIND_PLACEHOLDER}
    AND ${SKU_OPTION_SKU_ID_COLUMN} = ${BIND_PLACEHOLDER}
  LIMIT 1`;

/**
 * The option insert — the translation of `model/dao/ProductDAO.cfc:L224-L226`.
 *
 * Eight columns in the legacy's own order, so the bound list is positionally identical: the generated
 * identifier, the group identifier, the code, the name, the two timestamps and the two account
 * identifiers. See {@link OPTION_NAME_COLUMN} for the note that the code is written into the name too.
 */
const OPTION_INSERT_STATEMENT = ((): string => {
  const audit = auditColumnsOf(OPTION_TABLE);

  return `INSERT INTO ${OPTION_TABLE}
    (${OPTION_ID_COLUMN}, ${OPTION_OPTION_GROUP_ID_COLUMN}, ${OPTION_CODE_COLUMN}, ${OPTION_NAME_COLUMN},
     ${audit.created}, ${audit.modified}, ${audit.createdBy}, ${audit.modifiedBy})
  VALUES
    (${toPlaceholderList(8)})`;
})();

/** The link-row insert — the translation of `model/dao/ProductDAO.cfc:L231-L233`. */
const SKU_OPTION_INSERT_STATEMENT = `INSERT INTO ${SKU_OPTION_TABLE}
    (${SKU_OPTION_OPTION_ID_COLUMN}, ${SKU_OPTION_SKU_ID_COLUMN})
  VALUES
    (${toPlaceholderList(2)})`;

/**
 * The custom-attribute update — the translation of `model/dao/ProductDAO.cfc:L243-L245`.
 *
 * ⚠️ BIND ORDER FOLLOWS TEXT ORDER, NOT THE LEGACY'S CALL ORDER. The legacy binds `:attributeValue` by
 * NAME at `:L246`, after `setSql`, while `#attributeID#` and `#productID#` are interpolated into the
 * text. Positional binding has no names, so the order here is the order the markers appear: value,
 * attribute, product (TR-4).
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L247` — THE BRANCH IS ON THE AFFECTED-ROW COUNT, WHICH IS
 * NOT THE SAME AS "A ROW EXISTS". An update whose new value equals the stored value reports zero
 * affected rows by default, so the legacy proceeds to insert a second attribute value for a row that
 * already had one. Carried across unchanged: the count is read exactly as the legacy reads it, and no
 * existence probe is added.
 */
const ATTRIBUTE_VALUE_UPDATE_STATEMENT = `UPDATE ${OUT_OF_SCOPE_TABLE.attributeValue}
  SET
    ${OUT_OF_SCOPE_COLUMN.attributeValue} = ${BIND_PLACEHOLDER}
  WHERE
    ${OUT_OF_SCOPE_COLUMN.attributeID} = ${BIND_PLACEHOLDER}
    AND ${OUT_OF_SCOPE_COLUMN.productID} = ${BIND_PLACEHOLDER}`;

/**
 * The custom-attribute insert — the translation of `model/dao/ProductDAO.cfc:L249-L251`.
 *
 * Five columns in the legacy's order. The discriminator is a source-declared literal and is a VALUE, so
 * it is bound like every other rather than written into the text (S2).
 */
const ATTRIBUTE_VALUE_INSERT_STATEMENT = `INSERT INTO ${OUT_OF_SCOPE_TABLE.attributeValue}
    (${OUT_OF_SCOPE_COLUMN.attributeValueID}, ${OUT_OF_SCOPE_COLUMN.attributeValueType},
     ${OUT_OF_SCOPE_COLUMN.attributeValue}, ${OUT_OF_SCOPE_COLUMN.attributeID},
     ${OUT_OF_SCOPE_COLUMN.productID})
  VALUES
    (${toPlaceholderList(5)})`;

/**
 * BACK-FILL 1 — the default-SKU statement, the translation of `model/dao/ProductDAO.cfc:L288-L302`.
 *
 * ⚠️ FULLY STATIC IN THE LEGACY, SO THIS IS D22 ONLY AND NOT D18. `:L289` and `:L295` interpolate
 * NOTHING; the only change here is the logical-to-physical identifier translation. `:L302` executes it
 * with zero parameters and so does this port. Claiming these two as injection sites would over-state
 * D18, which misleads as badly as under-stating it.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L288` and `:L304` — THE DIALECT BRANCH COLLAPSES TO THE
 * MYSQL PATH, AND THE TWO BRANCH TESTS DO NOT EVEN AGREE ON SPELLING. `:L288` compares against
 * `"mySQL"` while `:L304` compares against `"mySql"`; CFML `eq` is case-insensitive so both matched, and
 * TypeScript `===` would not — evidence in itself that the branches were never meant to diverge. The
 * value comes from the run-time probe at `config/configORM.cfm:L8-L14`, and AAP §0.4.1.3 makes the
 * target "a fixed MySQL target with the branch documented". So the else branches at `:L295-L300`,
 * `:L311-L316` and `:L318-L323` are recorded here and not built: there is no dialect type, no engine
 * enumeration and no per-engine variant anywhere in this file.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L289-L291` — THE ERROR-1093 EXPOSURE IS FLAGGED, AND WAS
 * MEASURED RATHER THAN ASSUMED. MySQL refuses a subquery that selects from a table the same statement
 * updates, and the subquery here selects from `SwSku` while `SwSku` is one of the two tables the
 * multi-table update names. That looked like it would need a derived-table wrap. It does not.
 *
 * F-21 — WHAT WAS ACTUALLY RUN. THIS IS THE ONE PLACE THE PROBE IS RECORDED for both back-fill
 * statements. Run against MySQL 8.4.11 through `mysql2` 3.23.2 over STAND-IN tables carrying only the
 * columns these statements reference, in a scratch database that was dropped afterwards — because no
 * `Sw*` DDL exists in this repository (see the evidence-boundary note in `src/config/database.ts`):
 *
 *   1. this statement, as written                              ACCEPTED, 1 row affected,
 *                                                              `defaultSkuID` set to a real SKU
 *   2. {@link SKU_IMAGE_FILE_BACKFILL_STATEMENT}, PREPARED
 *      with the suffix bound                                   ACCEPTED, 2 rows affected,
 *                                                              values as expected
 *   3. CONTROL — the classic single-table form of the same
 *      mistake, `UPDATE T SET c = (SELECT MIN(c) FROM T)`       REJECTED, errno 1093,
 *                                                              `ER_UPDATE_TABLE_USED`
 *
 * Case 3 is what makes cases 1 and 2 evidence rather than coincidence: the probe DISCRIMINATES, so an
 * acceptance means the shape is permitted and not merely that nothing was checked. A correlated
 * subquery over a table that is JOINED but NOT ASSIGNED is permitted; a subquery over the very table
 * being assigned, with no join, is not. Both statements are therefore preserved as written; a wrap
 * would have been an unannotated rewrite of a statement that runs (S7, Guideline 4).
 *
 * THE EXPOSURE STAYS FLAGGED, and the reason is now specific rather than general: the probe settles
 * the STATEMENT SHAPE against this server version, and the shape is what error 1093 turns on. What it
 * cannot settle is anything that depends on the authoritative DDL — column types, nullability, index
 * and engine choices — since that DDL is generated by Hibernate from CFC metadata and no CFML engine
 * is available here. A different engine or a future version may also not agree.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L291` — "FIRST SKU" IS ARBITRARY AND STAYS ARBITRARY. The
 * subquery has `LIMIT 1` and NO `ORDER BY`, so which SKU becomes the default is whatever the engine
 * returns first. Adding an ordering to make it deterministic would be an enhancement the source does
 * not have (Guideline 4). The `LIMIT 1` itself IS source-declared and stays; it is the only `LIMIT` in
 * this file, and no other is added (S9).
 *
 * ⚠️ AND THE ASSIGNMENT IS DELIBERATELY LEFT UNQUALIFIED, exactly as `:L291` writes it. `defaultSkuID`
 * exists on `SwProduct` and on neither other table in the statement, so it resolves unambiguously —
 * and this is the precise text that was probed.
 */
const DEFAULT_SKU_BACKFILL_STATEMENT = `UPDATE ${PRODUCT_TABLE}
    INNER JOIN ${SKU_TABLE}
      ON ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN} = ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN}
  SET
    ${PRODUCT_DEFAULT_SKU_ID_COLUMN} = (
      SELECT ${SKU_ID_COLUMN}
      FROM ${SKU_TABLE}
      WHERE ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN} = ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN}
      LIMIT 1
    )
  WHERE
    ${PRODUCT_TABLE}.${PRODUCT_DEFAULT_SKU_ID_COLUMN} IS NULL`;

/**
 * BACK-FILL 2 — the SKU image-file statement, the translation of `model/dao/ProductDAO.cfc:L304-L325`.
 *
 * ⚠️ THIS IS THE ONE STATEMENT THAT BINDS A SETTING RATHER THAN FILE DATA. `:L307` interpolates
 * `'.#setting("globalImageExtension")#'` into the text, so the value is a setting and not untrusted
 * input — but it is still a VALUE, so it becomes a bound marker (S2). Both the separator and the
 * extension travel INSIDE that one bound value, exactly as the legacy composed them into one literal,
 * which is why no identifier is interpolated anywhere here.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L307`, `:L313` and `:L320` — `globalImageExtension` IS NOT
 * ONE OF THE PORT'S EIGHTEEN NAMES, AND IT MUST NOT BECOME A NINETEENTH. The legacy source marks it
 * `// DEPRECATED***` at `model/service/SettingService.cfc:L246`, and its three call sites are provably
 * unresolvable on the DAO's inheritance chain, so promoting it into the port's closed union would
 * assert a contract the legacy explicitly retired. The value is instead read as data from
 * `DEPRECATED_SETTING_DEFAULTS` in `../settings/StaticSettingResolver`, whose entry transcribes the
 * literal `defaultValue="jpg"` at `model/service/SettingService.cfc:L247` with its locator. Nothing is
 * invented here and nothing is defaulted here (S9): this file states no extension of its own, and the
 * settings module remains the single boundary that owns setting values. The full four-reason analysis,
 * and the decision to execute this statement even though the legacy call sites could not have, are
 * recorded in section 3 of that module's own note.
 *
 * ⚠️ THE SAME ERROR-1093 SHAPE. This statement is case 2 of the probe recorded on
 * {@link DEFAULT_SKU_BACKFILL_STATEMENT}: accepted as a PREPARED statement with the suffix bound, and
 * producing the expected values, so it too is preserved as written. That block also carries the
 * discriminating control and the evidence boundary; neither is restated here.
 *
 * ⚠️ AND `SwProduct` APPEARS TWICE ON PURPOSE. The subquery's own `FROM` introduces a second reference
 * that shadows the joined one, so the unqualified `productCode` and the `SwProduct.productID` in the
 * correlation both resolve to the INNER reference while `SwSku` resolves outward. That is exactly how
 * `:L307` works, and qualifying it differently would change which reference is read.
 */
const SKU_IMAGE_FILE_BACKFILL_STATEMENT = `UPDATE ${SKU_TABLE}
    INNER JOIN ${PRODUCT_TABLE}
      ON ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN} = ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN}
  SET
    ${SKU_IMAGE_FILE_COLUMN} = (
      SELECT concat(${PRODUCT_CODE_COLUMN}, ${BIND_PLACEHOLDER})
      FROM ${PRODUCT_TABLE}
      WHERE ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN} = ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN}
    )
  WHERE
    ${SKU_TABLE}.${SKU_IMAGE_FILE_COLUMN} IS NULL`;

/**
 * The URL-title collision probe — the translation of `model/dao/ProductDAO.cfc:L401-L403`.
 *
 * ⚠️ A CONSTANT PROJECTION AND A ONE-ROW STOP, WHERE THE LEGACY PROJECTED `productID` AND READ THE
 * WHOLE MATCH SET. Structural, and provably answer-preserving from the legacy body rather than by
 * argument. `:L401-L403` is `SELECT productID FROM SlatwallProduct WHERE urlTitle = '#fileName#'`, and
 * `:L404` is the ONLY thing that ever touches its result — `if(dataQuery.execute().getResult()
 * .recordCount)`, a bare truthiness test. The projected `productID` is never read off that result set,
 * no row is handed back to any caller, and the magnitude of the count is never consulted, so ONE
 * matching row is complete evidence and every further row the legacy transferred was discarded. The
 * port's own reader agrees: {@link MySqlProductRepository.resolveImportUrlTitle} reads nothing but
 * `collisions.length === 0`.
 *
 * The column is still named in the predicate and still comes from the whitelist, so S2 holds exactly
 * as before. The `1` is a projection literal authored here, not caller data, so it is not a value
 * position requiring a placeholder — the single placeholder below remains the only one.
 *
 * `LIMIT 1` is admissible here and would NOT be admissible on a read whose rows the caller sees: it
 * invents no ordering (AAP §0.7.3 S9), discards nothing the legacy consulted, and cannot change a
 * verdict that is already "did anything match at all". It places no ceiling on the CALLER's behaviour
 * either — `resolveImportUrlTitle` still probes exactly once and appends exactly once, never looping,
 * because `:L404-L405` does not loop.
 */
const URL_TITLE_PROBE_STATEMENT = `SELECT
    1
  FROM
    ${PRODUCT_TABLE}
  WHERE
    ${PRODUCT_URL_TITLE_COLUMN} = ${BIND_PLACEHOLDER}
  LIMIT 1`;

/**
 * The existence lookup of `saveImportData` — the translation of `model/dao/ProductDAO.cfc:L385-L387`,
 * and THE WORST OF THE FILE-FED D18 SITES.
 *
 * The legacy text is
 * `SELECT #idColumn# FROM #tableName# WHERE #listLast(lookupColumn,'_')# = '#lookupColumnValue#'` —
 * THREE IDENTIFIERS AND ONE VALUE, and the third identifier is DERIVED AT RUN TIME from a file heading
 * (`product_productCode` becomes `productCode`). So the whitelist has to cover table names AND
 * heading-derived column names, which is why both parameters below are pre-validated names rather than
 * strings, and why the value is the only thing that becomes a bind marker.
 *
 * @param table - a validated physical table.
 * @param idColumn - a validated column name on that table, the identifier to project.
 * @param lookupColumn - a validated column name on that table, the predicate to match.
 * @returns the statement text: one bind marker, for the lookup value only.
 */
export function composeExistenceLookup(
  table: PhysicalTableName,
  idColumn: string,
  lookupColumn: string,
): string {
  // ⛔ RE-VALIDATED HERE EVEN THOUGH THE CALLER ALREADY VALIDATED. See the note on the section above:
  // these composers are exported, so "the caller validates" is a convention and a convention is not a
  // guarantee. Both assertions are idempotent on an already-canonical name and both raise on anything
  // else, which is what makes the identifier discipline structural (S2).
  const safeTable = assertTableName(table);

  return `SELECT
    ${assertColumnName(safeTable, idColumn)}
  FROM
    ${safeTable}
  WHERE
    ${assertColumnName(safeTable, lookupColumn)} = ${BIND_PLACEHOLDER}`;
}

/**
 * The update of `saveImportData` — the translation of `model/dao/ProductDAO.cfc:L393-L395`, and THE
 * HARDEST SITE IN THE FILE.
 *
 * The legacy text is `UPDATE #tableName# SET #updateSetString# WHERE #idColumn# = '#idColumnValue#'`,
 * where `#updateSetString#` is AN ENTIRE HAND-BUILT `SET` CLAUSE INJECTED AS RAW SQL TEXT, assembled
 * from file headings and file cell values at `:L347-L361` and `:L363-L364`.
 *
 * ⚠️ THIS IS THE SITE MOST LIKELY TO TEMPT AN ESCAPE HATCH, AND THERE ISN'T ONE. `QueryRunner`
 * deliberately publishes no way to pass a fragment, so the clause is REBUILT here as `col = ?` pairs
 * from pre-validated column names with a parallel parameter list. If a column cannot be expressed
 * through {@link assertColumnName}, the answer is to extend that whitelist — never to widen this
 * function's input to accept text.
 *
 * @param table - a validated physical table.
 * @param assignmentColumns - validated column names on that table, in the legacy's assembly order:
 *   the file columns first, then the two audit columns.
 * @param idColumn - a validated column name on that table, the predicate to match.
 * @returns the statement text: one bind marker per assignment, then one for the identifier.
 * @throws {DomainError} when there is nothing to assign.
 */
export function composeImportUpdate(
  table: PhysicalTableName,
  assignmentColumns: readonly string[],
  idColumn: string,
): string {
  if (assignmentColumns.length === 0) {
    throw new DomainError(
      'An import update was composed with no columns to assign, which is not a statement any engine ' +
        'accepts.',
      { context: { table, idColumn } },
    );
  }

  // ⛔ Re-validated, for the reason given on `composeExistenceLookup`. THIS is the site where a raw-text
  // `SET` clause would otherwise re-enter: every name that reaches the joined string has passed the
  // whitelist immediately beforehand, in this function, and no other value can reach it at all.
  const safeTable = assertTableName(table);

  const assignments = assignmentColumns
    .map((column) => `${assertColumnName(safeTable, column)} = ${BIND_PLACEHOLDER}`)
    .join(PLACEHOLDER_JOINER);

  return `UPDATE ${safeTable}
  SET
    ${assignments}
  WHERE
    ${assertColumnName(safeTable, idColumn)} = ${BIND_PLACEHOLDER}`;
}

/**
 * The insert of `saveImportData` — the translation of `model/dao/ProductDAO.cfc:L411-L413`.
 *
 * The legacy text is
 * `INSERT INTO #tableName# (#insertColumns##arguments.idColumn#) VALUES (#insertValues#'#idColumnValue#')`
 * — TWO INTERPOLATIONS BUTTED TOGETHER WITH NO SEPARATOR, working only because `insertColumns` and
 * `insertValues` were each left ending in a comma by the loops that built them. Exceptionally fragile,
 * and impossible to assert on. Here the column list is an explicit array and the values are an equal
 * number of bind markers, so a mismatch between the two is a composition error this function refuses
 * rather than a statement the database rejects.
 *
 * ⚠️ SEC-14 — WHAT THIS FUNCTION DOES AND DOES NOT GUARANTEE ABOUT ITS COLUMN LIST. It guarantees that
 * every name it emits is a real column of the named table, because it re-validates each one. It does
 * NOT decide whether a REMOTE FILE was allowed to write that column, and it deliberately must not: the
 * list it receives legitimately mixes file-derived columns with columns the importer owns — the audit
 * pair or quartet, the generated URL title, the generated identifier, and the insert-only `extraData`
 * associations — so a rule applied here would have to refuse the importer's own writes. The
 * authorization decision therefore lives one layer up, at the two places that decide what may enter
 * the list: {@link assertImportableColumn} for every file heading, applied both at plan time in
 * {@link MySqlProductRepository.buildImportPlan} and again in `saveImportData`.
 *
 * @param table - a validated physical table.
 * @param columns - validated column names on that table, in the legacy's assembly order, ending with
 *   the identifier column exactly as the legacy appends it last.
 * @returns the statement text: one bind marker per column.
 * @throws {DomainError} when there are no columns to insert.
 */
export function composeImportInsert(table: PhysicalTableName, columns: readonly string[]): string {
  if (columns.length === 0) {
    throw new DomainError(
      'An import insert was composed with no columns, which is not a statement any engine accepts.',
      { context: { table } },
    );
  }

  // ⛔ Re-validated, for the reason given on `composeExistenceLookup`.
  const safeTable = assertTableName(table);
  const safeColumns = columns.map((column) => assertColumnName(safeTable, column));

  return `INSERT INTO ${safeTable}
    (${safeColumns.join(PLACEHOLDER_JOINER)})
  VALUES
    (${toPlaceholderList(safeColumns.length)})`;
}

/**
 * The product search — the translation of `model/dao/ProductDAO.cfc:L419-L437`.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L424` — THE PRODUCT-TYPE FILTER IS DIRECT, WITH NO NESTED
 * SUBQUERY, AND THAT DIFFERS FROM THE SKU SIDE. `:L424` filters `productTypeID in (...)` straight on
 * `SwProduct`, whereas `model/dao/SkuDAO.cfc:L135` nests
 * `productID in (select productID from SlatwallProduct where productTypeID in (...))`. Both are
 * preserved as written; harmonising them would change one of the two statements for no reason the source
 * gives.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L427` — THIS IS THE TWENTY-SECOND `setSQL` SITE AND IT WAS
 * ALREADY PARAMETERIZED, so it was never part of D18. Note also that `:L427` calls `setSQL` AFTER both
 * `addParam` calls, which is what fixes the bind order as the search term FIRST and the product-type
 * list SECOND. Nothing in a type system catches a transposition of two same-typed parameters, so the
 * order is asserted in the test rather than trusted.
 *
 * The projection, the two column names and their lower-cased output keys are all preserved; the mapping
 * of a row into `{id, value}` happens in `rowMappers.ts`, which is where `:L430-L434` renames them.
 *
 * @param productTypeIdCount - how many product-type identifiers will be bound. Zero omits the filter
 *   entirely, which is the `:L423` guard's false branch.
 * @returns the statement text.
 */
/**
 * Applies the four caller-facing decisions of `model/dao/ProductDAO.cfc:L422-L427` and returns the
 * statement with its bound values.
 *
 * EXTRACTED SO THE UNBOUNDED AND BOUNDED SEARCH MEMBERS SHARE ONE TRANSLATION rather than two copies
 * that could drift. A drift here would be silent: both members return the same row type, so a
 * divergent guard or a transposed bind order would compile cleanly and simply answer differently.
 * Everything below is the original translation, moved rather than rewritten.
 *
 * @param term - the bare name fragment. `:L419` declares it optional; `:L422` reads it unguarded.
 * @param productTypeIDs - the optional comma-delimited product-type identifier list.
 * @param member - the calling member's qualified name, for the error context only.
 * @returns the statement text and its bound values, in `:L427` order — term first, list second.
 * @throws {DomainError} when the term is omitted, reproducing the `:L422` failure.
 */
function composeProductSearchCall(
  term: string | undefined,
  productTypeIDs: string | undefined,
  member: string,
): { readonly sql: string; readonly params: unknown[] } {
  if (term === undefined) {
    throw new DomainError(
      'A product search needs a name fragment to match on, and none was supplied.',
      { context: { member } },
    );
  }

  // `:L422` — the wildcard wrapping, applied here and not by the caller.
  const params: unknown[] = [`%${term}%`];
  let productTypeIdCount = 0;

  // `:L423` — the DOUBLE guard, reproduced with its exact strictness. `len()`, not `trim()`.
  if (productTypeIDs !== undefined && productTypeIDs.length > 0) {
    // `:L425` — the value passes through BARE, with no interpolation wrapping, split into the
    // positional values a bound list becomes.
    const productTypeValues = splitBoundList(productTypeIDs);
    productTypeIdCount = productTypeValues.length;
    params.push(...productTypeValues);
  }

  // `:L427` — `setSQL` is called AFTER both `addParam` calls, which fixes the bind order as the term
  // FIRST and the product-type list SECOND. Preserved positionally (TR-4).
  return { sql: composeProductSearch(productTypeIdCount), params };
}

export function composeProductSearch(productTypeIdCount: number): string {
  const productTypeFilter =
    productTypeIdCount > 0
      ? `
    AND ${PRODUCT_PRODUCT_TYPE_ID_COLUMN} IN (${toPlaceholderList(productTypeIdCount)})`
      : '';

  return `SELECT
    ${PRODUCT_ID_COLUMN},
    ${PRODUCT_NAME_COLUMN}
  FROM
    ${PRODUCT_TABLE}
  WHERE
    ${PRODUCT_NAME_COLUMN} LIKE ${BIND_PLACEHOLDER}${productTypeFilter}`;
}

/* ================================================================================================
 * FILE HEADINGS THE IMPLEMENTATION NAMES DIRECTLY
 * ==============================================================================================
 * Four headings are read by literal name rather than discovered by classification. They are FILE
 * headings, not database identifiers, so they never pass through `assertColumnName` — the whitelist
 * governs statement text, and these govern which cell of an uploaded file is read.
 *
 * ⚠️ THE SPELLINGS ARE THE LEGACY'S OWN, INCLUDING ITS INCONSISTENCY. `:L180` writes the brand heading
 * all-lowercase as `brand_brandname` while `:L184` writes the product-type heading in camel case as
 * `productType_productTypeName`. CFML struct keys made the difference invisible; the normalisation on
 * ingest is what keeps it invisible here (see {@link normaliseHeading}). The spellings are recorded as
 * written so a reader comparing this file against the legacy sees the same text.
 * ============================================================================================== */
const REQUIRED_HEADING = Object.freeze({
  /** `model/dao/ProductDAO.cfc:L180` — read for the brand lookup. All-lowercase in the source. */
  brandName: 'brand_brandname',
  /** `model/dao/ProductDAO.cfc:L184` — read for the product-type lookup. Camel case in the source. */
  productTypeName: 'productType_productTypeName',
  /** `model/dao/ProductDAO.cfc:L399` — read for the URL title. */
  productName: 'product_productName',
  /** `model/dao/ProductDAO.cfc:L405` — read for the URL-title collision suffix. */
  productCode: 'product_productCode',
});

/**
 * The empty record set — the port of `queryNew("")` at `model/dao/ProductDAO.cfc:L82`.
 *
 * This is what the spreadsheet branch at `:L83-L85` leaves in place, and it is the reason an `.xls`
 * upload imports nothing without raising: a zero-row set drives zero per-row transactions.
 */
const EMPTY_RECORD_SET: DelimitedImportRecordSet = Object.freeze({
  columnList: Object.freeze([]),
  rows: Object.freeze([]),
});

/**
 * The invariantly empty SKU extra-data list of `model/dao/ProductDAO.cfc:L150`.
 *
 * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L150` — DECLARED, MERGED, NEVER POPULATED. `:L150` creates
 * the array and `:L197` merges it into the per-row list with `addAll`, but nothing between those two
 * lines ever appends to it, so the merge contributes nothing on every row of every import. It is kept
 * rather than deleted because deleting it would hide that the legacy has a product-side default
 * mechanism and no SKU-side counterpart — a reader comparing the two branches should see the asymmetry.
 */
const SKU_EXTRA_DATA: readonly ImportFieldAssignment[] = Object.freeze([]);

/**
 * Resolves the field delimiter from the file type — the translation of
 * `model/dao/ProductDAO.cfc:L74-L80`.
 *
 * ⚠️ THE UNRECOGNISED CASE IS NOT AN ERROR, AND THAT IS BEHAVIOUR. `:L76` declares `var delimiter = "";`
 * and only the `csv` and `txt` branches ever assign it, so a `.json`, a `.tsv` or an extensionless
 * source reaches the retrieval call with an empty delimiter. Nothing validates the file type, nothing
 * raises, and nothing reports. Rejecting an unrecognised type here would be an enhancement the legacy
 * does not have (Guideline 4).
 *
 * @param fileType - the normalised file extension.
 * @returns the delimiter: a comma, a tab, or the empty string.
 */
function resolveDelimiter(fileType: string): string {
  if (fileType === CSV_FILE_TYPE) {
    // `:L77` — `chr(44)`.
    return COMMA_DELIMITER;
  }

  if (fileType === TEXT_FILE_TYPE) {
    // `:L79` — `chr(9)`.
    return TAB_DELIMITER;
  }

  // `:L76` — the declared initial value, left in place for every other extension.
  return NO_DELIMITER;
}

/**
 * Everything `model/dao/ProductDAO.cfc:L100-L173` computes ONCE, before the record loop opens at
 * `:L176`.
 *
 * ⚠️ M7 — THIS IS PER-IMPORT LOCAL STATE AND IT NEVER TOUCHES THE INSTANCE. The composition root makes
 * repositories singletons and a warm Lambda container reuses them across invocations, so a plan held as
 * a field would leak one caller's file headings and one caller's resolved option groups into the next
 * caller's import. Every member below is created inside {@link MySqlProductRepository.importFromFile}
 * and dies with it.
 */
interface ImportPlan {
  /** `:L123` — the headings as an array, the port of `listToArray(data.columnList)`. */
  readonly columnList: readonly string[];
  /** `:L131` — headings whose first segment is `product`. */
  readonly productColumns: readonly string[];
  /** `:L133` — headings whose first segment is `sku`. */
  readonly skuColumns: readonly string[];
  /**
   * `:L135`, then filtered by the pre-pass at `:L161-L173`.
   *
   * ⚠️ ONLY THE SURVIVORS, IN THE SURVIVING ORDER. See
   * {@link MySqlProductRepository.resolveOptionGroups}.
   */
  readonly optionGroupHeadings: readonly string[];
  /** `:L171` — the resolved group identifier for each surviving heading. */
  readonly optionGroupIdsByHeading: ReadonlyMap<string, string>;
  /** `:L137` — headings whose first segment is `attribute`. */
  readonly customAttributeHeadings: readonly string[];
  /** `:L142-L148` — the product-side defaults for absent flag headings. */
  readonly productExtraData: readonly ImportFieldAssignment[];
  /** `:L101-L108` — the resolved product lookup heading, or `''` when the file carries none. */
  readonly productLookupColumn: string;
  /** `:L152` — ONE timestamp for the whole import. See the field's own note. */
  readonly timeStamp: Date;
  /** `:L153` — ONE account identifier for the whole import. */
  readonly administratorID: string;
  /**
   * The import's own resolution memory for the three per-row lookups whose answers cannot change
   * underneath it. See {@link ImportLookupMemory} for the proof, key by key.
   */
  readonly lookups: ImportLookupMemory;
}

/**
 * The import's memory of lookups it has already resolved, live for exactly one call.
 *
 * ⭐ WHY IT EXISTS. `model/dao/ProductDAO.cfc:L179-L186` re-runs the brand lookup and the product-type
 * lookup FOR EVERY ROW, and `:L212-L215` re-runs the option lookup for every row × every surviving
 * option group. A catalog file of a thousand rows sharing one brand and one product type issues a
 * thousand identical brand statements and a thousand identical product-type statements, and a file with
 * three option columns issues three thousand option statements for perhaps a dozen distinct options.
 * Nothing about any of those repetitions is load-bearing.
 *
 * ⚠️⚠️ ONLY POSITIVE RESOLUTIONS ARE REMEMBERED, AND THAT ASYMMETRY IS THE WHOLE CORRECTNESS ARGUMENT.
 * A miss is NEVER recorded, so a row whose brand, product type or option was absent re-probes exactly as
 * the legacy does — which means a row created concurrently between two rows of the import is still seen,
 * on exactly the row the legacy would first have seen it. What a positive entry asserts is far narrower:
 * that an identifier already observed for a given name does not become a DIFFERENT identifier later in
 * the same import. The importer never deletes a brand, a product type or an option, and a row's primary
 * key does not change, so within one import the only way a remembered answer could go stale is a
 * concurrent DELETE-and-recreate of the same name — narrower than the "any concurrent insert" window a
 * naive whole-answer cache would open, and narrower still than it looks, because:
 *
 * ⚠️ THE LEGACY IS ALREADY NON-DETERMINISTIC ON THESE READS. Each lookup projects one identifier and the
 * reader takes the FIRST row (`readFirstRowText`), while none of the three statements declares an
 * `ORDER BY` — `:L180`, `:L184` and `:L213` order nothing. Where two rows share a name, which identifier
 * the legacy returns is whatever the engine yields first, and it may differ between two probes in the
 * same import. Remembering the first observed answer therefore returns a value the legacy could itself
 * have returned on every row; it cannot return one the legacy could not.
 *
 * ⚠️ AN OPTION THE IMPORT ITSELF CREATES IS RECORDED, AND THAT IS SAFE BECAUSE OF FIRST-FAILURE. The
 * insert at `:L222-L227` happens inside a row's transaction, so a rolled-back row could in principle
 * leave a remembered identifier that no longer exists. It cannot happen here: the per-row boundary stops
 * at the FIRST failure (M3), so no later row runs after the row whose transaction rolled back, and no
 * later row can read the entry. This is not defence in depth — it is the reason the entry is admissible
 * at all, and if the boundary ever gained a continue-on-error mode this recording would have to go.
 *
 * ⚠️ WHAT IS DELIBERATELY *NOT* REMEMBERED, AND WHY EACH WOULD BE WRONG:
 *   • THE SKU-OPTION LINK PROBE (`:L218-L220`). Its key includes the SKU identifier, which is resolved
 *     per row, and two file rows CAN resolve to the same SKU — the generated code at `:L200-L203` is
 *     derived from cell values, so duplicate rows collide. The second such row must observe the link the
 *     first row inserted, which is precisely the same-connection read-back M6 requires. Remembering it
 *     would substitute a stale answer for the one read that has to be live.
 *   • THE PRODUCT/SKU EXISTENCE LOOKUP (`:L385-L387`). Same reason, more sharply: it is the read that
 *     decides UPDATE versus INSERT, and two rows sharing a product code must have the second see the
 *     first's insert. Remembering it would turn a re-import into a duplicate insert.
 *   • THE CUSTOM-ATTRIBUTE UPDATE COUNT (`:L245-L247`). Not a lookup at all — it is an affected-row
 *     count off a mutation, and the mutation must run for its effect.
 *
 * ⚠️ AND IT IS IMPORT-SCOPED, NEVER INSTANCE-SCOPED (M7). It is created inside
 * {@link MySqlProductRepository.buildImportPlan} and reachable only through the {@link ImportPlan} that
 * call returns, so it dies with the import. A field on the repository would let a warm container serve
 * one caller's catalog identifiers to the next caller's import — the exact hazard M7 names.
 */
interface ImportLookupMemory {
  /** Brand name cell → brand identifier, for names already resolved. `:L179-L182`. */
  readonly brandIdsByName: Map<string, string>;
  /** Product-type name cell → product-type identifier. `:L183-L186`. */
  readonly productTypeIdsByName: Map<string, string>;
  /**
   * `optionGroupID` + `\u0000` + option code → option identifier. `:L212-L215`, plus the identifier of
   * an option this import created at `:L222-L227`.
   *
   * The key is composite because the legacy statement matches on BOTH the code and the group, and it is
   * joined on a NUL rather than a printable separator so no pair of real values can collide by
   * concatenation — an option code is file content and may contain any printable character.
   */
  readonly optionIdsByGroupAndCode: Map<string, string>;
}

/**
 * Compose the composite key {@link ImportLookupMemory.optionIdsByGroupAndCode} is keyed by.
 *
 * @param optionGroupID - the group the option belongs to, as the pre-pass resolved it.
 * @param optionCode - the option code cell, verbatim and case-sensitive.
 * @returns the composite key.
 */
function optionMemoryKey(optionGroupID: string, optionCode: string): string {
  return `${optionGroupID}\u0000${optionCode}`;
}

/*
 * ⛔ `PRODUCT_MANY_TO_MANY_FIELDS` AND `clearProductManyToManyCollections` WERE REMOVED FROM THIS MODULE.
 * They existed only to serve a second `removeProduct` implementation that has itself been removed; the
 * full account, including why the many-to-many concern is NOT lost, sits with the surviving pair at
 * {@link MySqlProductRepository.saveProduct}. The authority the helper ported,
 * `org/Hibachi/HibachiService.cfc:L61`, is honoured in `./MySqlProductPersistence.ts`, which draws the
 * scope split between statement-removable link tables and the excluded-family ones its declared
 * `ProductDependencyCleanup` collaborator covers.
 */

/**
 * The MySQL implementation of {@link ProductRepository} — the port of `model/dao/ProductDAO.cfc`.
 *
 * ⚠️ THE MEMBER SET IS CLOSED AT THE PORT'S THREE PUBLIC MEMBERS, THE TWO DATA-ACCESS PRIMITIVES THE
 * PRODUCT SAVE AND DELETE PATHS REACH DIRECTLY, AND THE PRIVATE HELPERS THOSE FIVE NEED. The module
 * header enumerates what is deliberately absent and why, and records why the persistence pair belongs
 * to this file rather than to the port; nothing else may be added here to "complete" the surface.
 *
 * ⚠️ M7 — NO MUTABLE STATE. Every field is `readonly` and every one is a collaborator, never a cache.
 * The legacy's own memoised state lives in `model/dao/SkuDAO.cfc:L204-L228`, not here, and this file
 * introduces none of its own: a second instance in the same warm container shares nothing with the
 * first, and two concurrent imports on ONE instance share nothing either, because every piece of
 * per-import state lives in an {@link ImportPlan} local to the call.
 *
 * ⚠️ S3 — NO CREDENTIALS AND NO POOL. The legacy constructs a connection three separate times, at
 * `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L332` and `:L420`, reading a datasource name, a username
 * and a password off the application's own configuration bean at two of them. This class reads none of
 * that and
 * constructs none of it: every execution surface arrives through the constructor.
 */
export class MySqlProductRepository implements ProductRepository {
  /**
   * The pool-bound execution surface.
   *
   * Used by the three regions the legacy runs OUTSIDE any transaction: the attribute-set selection
   * (`:L52-L71`), the option-group pre-pass (`:L161-L173`, which sits before `transaction{` opens at
   * `:L177`) and the product search (`:L419-L437`). The per-row body never touches it — that would put
   * a read on a different connection from the row's own uncommitted writes (M6).
   */
  private readonly executor: ProductStatementExecutor;

  /** The two transaction boundaries. See {@link ProductImportTransactionBoundary}. */
  private readonly transactions: ProductImportTransactionBoundary;

  /** The retrieval collaborator, standing in for the `cfhttp` at `:L87` (M4). */
  private readonly sourceReader: ProductImportSourceReader;

  /** The current-account context, replacing the scope walk at `:L153` and `:L341`. */
  private readonly accountContext: AccountContextPort;

  /** The URL-title transform, replacing the call at `:L399` to a member that does not exist. */
  private readonly urlTitleFilter: ImportUrlTitleFilter;

  /** @see MySqlProductRepositoryDependencies.readDefaultSkuId */
  private readonly readDefaultSkuId: DefaultSkuIdReader;

  /**
   * @param dependencies - the six collaborators, as a named object rather than a positional list.
   */
  public constructor(dependencies: MySqlProductRepositoryDependencies) {
    this.executor = dependencies.executor;
    this.transactions = dependencies.transactions;
    this.sourceReader = dependencies.sourceReader;
    this.accountContext = dependencies.accountContext;
    this.urlTitleFilter = dependencies.urlTitleFilter;
    this.readDefaultSkuId = dependencies.readDefaultSkuId;
  }

  /**
   * Returns an equivalent {@link MySqlProductRepository} bound to a DIFFERENT statement executor.
   *
   * ⭐ THIS IS THE FIX FOR REVIEW FINDING 2, APPLIED HERE AS IT IS APPLIED TO EVERY OTHER
   * TRANSACTION-SENSITIVE REPOSITORY IN THE FOLDER. While an executor could only be chosen at
   * construction, it was necessarily the POOL-bound one, so wrapping a call in `UnitOfWork.run` left
   * every statement running outside the transaction the boundary had just opened. The full account is on
   * `MySqlSkuRepository.withExecutor`.
   *
   * ⚠️ ONLY THE EXECUTOR IS REPLACED, AND `transactions` DELIBERATELY IS NOT. The importer's boundaries
   * are the thing that OPENS transactions; re-binding is for code running INSIDE one that somebody else
   * opened. Swapping the boundary collaborator here would let a caller nest the importer's per-row
   * transactions inside an outer one and quietly destroy M3, whose whole content is that
   * `model/dao/ProductDAO.cfc:L177` commits once per row. The five non-executor collaborators travel
   * across unchanged because none of them is connection-bound.
   *
   * ⚠️ NOT ON THE PORT INTERFACE. `../../ports/repositories/ProductRepository` declares business
   * queries; a service may not know a statement executor exists (AAP 0.7.3 S2 inverted). Re-binding is
   * used only by the layer that already holds concrete adapters.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns A new instance identical in every other respect.
   */
  public withExecutor(executor: ProductStatementExecutor): MySqlProductRepository {
    return new MySqlProductRepository({
      executor,
      transactions: this.transactions,
      sourceReader: this.sourceReader,
      accountContext: this.accountContext,
      urlTitleFilter: this.urlTitleFilter,
      readDefaultSkuId: this.readDefaultSkuId,
    });
  }

  /**
   * Selects attribute sets — the port of `model/dao/ProductDAO.cfc:L52-L71`.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L52` — ZERO CALLERS, IMPLEMENTED ANYWAY. A repository-wide
   * search finds no invocation of this member from any service, entity, process object, controller or
   * view. It is implemented rather than dropped because TR-5 requires that a member reaching an
   * out-of-scope collaborator be declared and implemented against a port rather than quietly removed
   * from the interface, and because a later caller must find the same behaviour the legacy would have
   * given it.
   *
   * ⚠️ THE ROW SHAPE IS NOT NARROWED. The declared return type resolves to `unknown[]`, and it stays
   * that way: `Attribute*` is an excluded family of six files, so inventing a row interface here would
   * be fabrication (S9). A caller that needs fields must narrow them itself, at which point the shape
   * is its own responsibility and not this port's invention.
   *
   * ⚠️ AN EMPTY SYSTEM-CODE LIST STILL BINDS EXACTLY ONE MARKER. `:L66` binds
   * `arrayToList(attributeSetTypeCode)`, and `arrayToList([])` is the empty string — a single value, not
   * an absent one. An empty argument therefore selects rows whose type code is `''`, which is the same
   * nothing the legacy selects, and the statement stays valid. Emitting zero markers instead would
   * produce `IN ()`, which no engine parses.
   *
   * @param attributeSetTypeCode - the attribute-set type system codes to match. Required, per `:L52`.
   * @param productTypeIDs - the product-type identifiers whose assignments qualify a non-global set.
   *   An empty array selects the `globalFlag = 1` shape of `:L60`.
   * @returns the selected rows, unnarrowed.
   */
  public async findAttributeSets(
    attributeSetTypeCode: string[],
    productTypeIDs: string[],
  ): Promise<AttributeSetRow[]> {
    // `:L66` versus `:L68` — the D20 collapse. ONE binding path, expanded positionally. The reason the
    // collapse is legitimate is recorded on `composeAttributeSetSelection`; the collapse itself is here.
    const typeCodeValues: readonly string[] =
      attributeSetTypeCode.length > 0 ? attributeSetTypeCode : [''];

    const sql = composeAttributeSetSelection(typeCodeValues.length, productTypeIDs.length);

    // Bind order follows statement text: the type codes appear in the `IN` list of `:L54`, the
    // product-type identifiers in the disjunct of `:L57` (TR-4).
    return await this.executor.execute(sql, [...typeCodeValues, ...productTypeIDs]);
  }

  /**
   * Searches products by name and optionally by product type — the port of
   * `model/dao/ProductDAO.cfc:L419-L437`.
   *
   * ⚠️ DISCREPANCY 6 — THE PLURAL NAME AND THE LOOSER GUARD ARE BOTH PRESERVED. `:L419` names the second
   * argument `productTypeIDs`, PLURAL, and types it as a delimited `string` rather than an array; `:L423`
   * guards it with `structKeyExists(...) && len(...)`. The SKU-side equivalent at
   * `model/dao/SkuDAO.cfc:L130` names it `productTypeID`, SINGULAR, and guards it with
   * `trim(...) != ""`. The consequence is real and asymmetric: a whitespace-only argument passes `len()`
   * and so the product side APPLIES the filter — against a list that splits to one blank value, matching
   * nothing — while the SKU side discards it and returns unfiltered results. Both names and both guard
   * strictnesses are carried across as written. Harmonising them would change one of the two members'
   * results for a caller that supplies whitespace, and nothing in the source asks for that.
   *
   * ⚠️ THE WILDCARD IS APPLIED INSIDE THIS REPOSITORY, exactly as `:L422` applies it. `%#arguments.term#%`
   * is assembled at the binding site, not by the caller, so a caller passing `abc` searches for `%abc%`
   * and a caller passing `%abc%` searches for `%%abc%%`. Moving the wrapping outward would change what
   * every existing caller matches.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L422` — THE SEARCH TERM IS READ UNGUARDED. `:L419` declares
   * `string term` as OPTIONAL, but `:L422` interpolates `arguments.term` unconditionally, so omitting it
   * raises inside the DAO. The port preserves the failure and makes it typed and explicit rather than
   * incidental: an absent term raises here, before any statement is composed, instead of producing
   * `LIKE '%undefined%'`. Supplying a default would be an enhancement the legacy does not have.
   *
   * ⚠️ TR-1 SIGNATURE TIGHTENING, RECORDED RATHER THAN MADE SILENTLY. `:L419` declares
   * `public any function`, and `:L52` declares the same for the attribute-set member — CFML's `any` is
   * the absence of a return contract, not a contract. Both are tightened here to the types
   * `src/ports/repositories/ProductRepository.ts` declares: this member to `Promise<ProductSearchRow[]>`,
   * matching the `{id, value}` structure `:L430-L434` actually builds, and the attribute-set member to
   * `Promise<AttributeSetRow[]>`, which resolves to `unknown[]` and is deliberately left unnarrowed. The
   * tightening records an observed contract; it does not add one. TR-1 asks that such a narrowing be
   * written down where it happens rather than discovered later from a diff, so it is written down here.
   *
   * @param term - the product-name fragment. Optional in the declaration, required in practice.
   * @param productTypeIDs - a comma-delimited list of product-type identifiers. Optional.
   * @returns one `{id, value}` row per match, in the engine's order — `:L421` declares no `ORDER BY` and
   *   none is added (Guideline 4).
   * @throws {DomainError} when `term` is omitted, reproducing the `:L422` failure.
   */
  public async searchByProductType(
    term?: string,
    productTypeIDs?: string,
  ): Promise<ProductSearchRow[]> {
    const { sql, params } = composeProductSearchCall(
      term,
      productTypeIDs,
      'MySqlProductRepository.searchByProductType',
    );

    const rows = await this.executor.execute(sql, params);

    // `:L430-L434` — the row-to-`{id, value}` rename, which lives in `rowMappers.ts`.
    return mapRows(rows, mapProductSearchRow);
  }

  /**
   * The windowed form of {@link MySqlProductRepository.searchByProductType}.
   *
   * ONE TRANSLATION SERVES BOTH MEMBERS. {@link composeProductSearchCall} applies the `:L422` wildcard
   * wrapping, the `:L423` `len()`-not-`trim()` guard, the `:L425` bare list splitting and the `:L427`
   * bind order, so neither member can drift from the other's match set. This member appends the window
   * and nothing else.
   *
   * ⚠️ THE GUARD ASYMMETRY IS INHERITED, NOT REPAIRED. A whitespace-only product-type argument still
   * passes here — and is still discarded on the SKU side, where the guard trims (Discrepancy 6). Making
   * the bounded pair agree with each other would have meant changing one of the two unbounded members,
   * which is forbidden.
   *
   * ⚠️ THE WINDOW VALUES BIND LAST AND ARE NEVER WRITTEN INTO THE TEXT, so the `:L427` order — term
   * first, product-type identifiers second — is untouched, and no caller-supplied number reaches the
   * statement text (S2).
   *
   * ⚠️ NO `ORDER BY` IS ADDED. `:L421` declares none and adding one would change the unbounded
   * member's row order, which is observable output. Successive windows are therefore not guaranteed
   * disjoint; the window bounds cost, and `BoundedRead` records that limitation once.
   *
   * @param window - the caller's ceiling and zero-based offset; validated, never defaulted.
   * @param term - bare product-name fragment. Omitting it raises, as on the unbounded member.
   * @param productTypeIDs - optional comma-delimited product-type identifier list.
   * @returns the window's rows and whether a further match lies past it.
   * @throws {DomainError} for an unusable window, or an omitted term.
   */
  public async searchByProductTypeBounded(
    window: BoundedReadWindow,
    term?: string,
    productTypeIDs?: string,
  ): Promise<BoundedReadResult<ProductSearchRow>> {
    const bound = prepareBoundedRead(window, 'MySqlProductRepository.searchByProductTypeBounded');
    const { sql, params } = composeProductSearchCall(
      term,
      productTypeIDs,
      'MySqlProductRepository.searchByProductTypeBounded',
    );

    const rows = await this.executor.execute(
      `${sql}
  LIMIT ${BIND_PLACEHOLDER} OFFSET ${BIND_PLACEHOLDER}`,
      [...params, ...bound.boundValues],
    );

    return settleBoundedRead(mapRows(rows, mapProductSearchRow), bound.limit);
  }

  /**
   * Imports products, SKUs, options, custom attributes and content assignments from a delimited file —
   * the port of `model/dao/ProductDAO.cfc:L73-L326`.
   *
   * ⚠️ IT REPORTS NOTHING, AND THAT SILENCE IS THE CONTRACT. `:L73` declares
   * `public void function loadDataFromFile(...)`, so a mid-file failure is invisible to the caller: rows
   * before it are committed, rows after it never run, and no summary, no row count, no rejected-row list
   * and no error array comes back. Adding any of those would be an enhancement the legacy does not have
   * (Guideline 4), and it would change what every existing caller observes. `Promise<void>` is preserved
   * literally — this member resolves to `undefined`.
   *
   * ⭐ M3 — ONE TRANSACTION PER ROW. `:L176` opens the record loop and `:L177` opens `transaction{`
   * INSIDE it, closing at `:L284-L285`. Each row therefore commits independently and a mid-file failure
   * leaves a PARTIALLY IMPORTED CATALOG. That is the behaviour, not a defect to repair: wrapping the loop
   * in a single transaction is a two-line change that any competent engineer would make to a new
   * importer, and it would destroy M3. There is no member on
   * {@link ProductImportTransactionBoundary} that could express it.
   *
   * ⚠️ THE TWO BACK-FILLS AT `:L287-L325` RUN OUTSIDE EVERY TRANSACTION, AFTER THE LAST ROW COMMITS.
   * They sit at the member's top level, past the closing brace of both the transaction and the loop, so
   * the observable shape is N single-row transactions followed by two untransacted bulk statements.
   *
   * ⚠️ AND THEY RUN FOR EVERY FILE TYPE, INCLUDING A SPREADSHEET AND AN EMPTY FILE. Nothing guards them
   * on the record count, so an `.xls` upload — which imports nothing at all — still executes both. The
   * observable legacy property is that nothing is IMPORTED, not that nothing HAPPENS, and the difference
   * matters because both statements touch rows earlier imports created.
   *
   * ⚠️ M4 — THIS MEMBER PERFORMS NO NETWORK INPUT OR OUTPUT. `:L87` is a single server-side retrieval of
   * the caller's location, and the module header records both the AAP correction about the non-existent
   * fallback and the reason the retrieval belongs to an injected collaborator rather than to a
   * repository. {@link ProductImportSourceReader} is invoked ONCE, BEFORE the first per-row boundary
   * opens, so no network wait ever sits inside a transaction.
   *
   * ⚠️ M1 IS CITED, NOT OWNED. `model/service/ProductService.cfc:L65-L68` requests a 3600-second budget
   * for this operation, which no single invocation of the target runtime can represent. No timeout is set
   * here, no chunking is introduced and no queue is created: the mismatch belongs to the handler layer
   * and is flagged rather than silently resolved (S8, S9).
   *
   * @param fileURL - the caller's location, unchecked. Nothing here vets it, exactly as nothing in
   *   `model/dao/ProductDAO.cfc:L73-L87` vets it; the residual CWE-918 exposure is carried as mismatch
   *   M4 and is the operator's to close. See {@link ProductImportSourceReader}.
   * @param textQualifier - the text qualifier, defaulting to `''` exactly as `:L73` declares.
   * @param options - optional invocation-scoped controls. Neither field alters what is imported or in
   *   what order; see {@link ProductImportOptions}.
   * @returns nothing. See the note above: the void return is preserved deliberately.
   */
  public async importFromFile(
    fileURL: string,
    textQualifier?: string,
    options?: ProductImportOptions,
  ): Promise<void> {
    // `:L74` — the file type is the last dot-delimited segment of the location, with NO validation and
    // NO extraction from a URL path. A query string travels with it, exactly as it does in the legacy,
    // which is one reason an unrecognised type is a silent no-delimiter case rather than an error.
    // Normalised for comparison because the `==` tests at `:L76`, `:L78` and `:L83` are
    // case-insensitive.
    const fileType = normaliseHeading(listLast(fileURL, FILE_TYPE_DELIMITER));

    // `:L75-L80`.
    const delimiter = resolveDelimiter(fileType);

    // `:L73` — the declared default for the optional second argument.
    const resolvedTextQualifier = textQualifier ?? '';

    /*
     * ⭐ P17 — CANCELLATION IS OBSERVED, AND NOTHING ABOUT IT IS INVENTED. The signal is supplied by the
     * caller or it is absent; this member creates none, derives none from a deadline and imposes no
     * timeout of its own, because AAP §0.6.6 M1 records that the legacy's own budget is a 3600-second
     * REQUEST TIMEOUT owned by `model/service/ProductService.cfc:L65-L68` and S9 forbids minting a
     * substitute. When no signal is supplied this is a no-op closure and the import behaves exactly as it
     * did before.
     *
     * IT IS CHECKED ONLY WHERE THE LEGACY ALREADY HAD A BOUNDARY: before the retrieval, after it, and at
     * each row boundary BETWEEN transactions. Never inside a transaction, never between two statements of
     * the same row, and never mid-statement — aborting there could leave a row half-written in an open
     * boundary, whereas aborting between rows produces exactly the M3 partial-import shape a mid-file
     * failure already produces, with earlier rows committed and no later row attempted.
     */
    const cancellation = options?.signal;
    const throwIfCancelled = (phase: string, rowNumber?: number): void => {
      if (cancellation?.aborted === true) {
        throw new DomainError('The product import was cancelled before it completed.', {
          context:
            rowNumber === undefined
              ? { fileURL, phase }
              : { fileURL, phase, rowNumber, committedRows: rowNumber - 1 },
        });
      }
    };

    throwIfCancelled('beforeRetrieval');

    // `:L82` — `queryNew("")`, the empty set the spreadsheet branch leaves in place.
    let recordSet: DelimitedImportRecordSet = EMPTY_RECORD_SET;

    // Set only on the streaming path, and read only there. See the convergence note below.
    let streamedColumnList: readonly string[] | undefined;
    let streamedRecords: AsyncIterable<DelimitedImportRecord> | undefined;

    if (fileType === SPREADSHEET_FILE_TYPE) {
      /*
       * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L83-L85` — THE SPREADSHEET BRANCH IS EMPTY IN THE
       * SOURCE AND IT IS EMPTY HERE. `:L83` opens `if(fileType == "xls"){`, `:L84` carries the comment
       * `//Read xls`, and `:L85` closes it. Nothing is read, nothing is parsed and nothing is raised, so
       * an `.xls` upload imports NOTHING and the caller — which receives no return value — cannot tell.
       *
       * The branch is reproduced as an explicit, documented no-op rather than deleted or merged into the
       * else, because deleting it would route a spreadsheet into the delimited-text retrieval path with
       * an empty delimiter and import garbage, and merging it would hide that the legacy declared an
       * intent it never implemented. No spreadsheet reader is added: that is new functionality, and S5
       * holds the runtime dependency set closed at one package.
       *
       * The two back-fills below still run, because `:L288` and `:L304` sit outside this branch.
       */
    } else if (this.sourceReader.readStreaming !== undefined) {
      /*
       * ⭐ `:L87` — the single retrieval, delegated, in its STREAMING form. One header pass, then records
       * on demand. Selecting the member the reader actually offers rather than requiring one keeps the
       * collaborator's contract additive: an existing reader is not broken and a streaming reader is not
       * mandated.
       */
      const stream = await this.sourceReader.readStreaming(
        fileURL,
        delimiter,
        resolvedTextQualifier,
      );

      streamedColumnList = stream.columnList;
      streamedRecords = stream.records;
    } else {
      // `:L87` — the single retrieval, delegated, in its materialising form. See M4 above.
      recordSet = await this.sourceReader.read(fileURL, delimiter, resolvedTextQualifier);
    }

    throwIfCancelled('afterRetrieval');

    /*
     * The two retrieval shapes converge here, and they converge on the LAZY one: a materialised record
     * set's `rows` array is itself iterable, so both paths hand `normaliseRecords` the same kind of
     * sequence and neither path builds a second whole-file representation. `columnList` is complete
     * before the first record is normalised on both paths, which is what `:L100-L173` requires.
     */
    let data: NormalisedImportData = {
      columnList: streamedColumnList ?? recordSet.columnList,
      rows: normaliseRecords(streamedRecords ?? recordSet.rows),
    };

    /* ⭐ THE CONTENT-ASSIGNMENT BOUNDARY IS EVALUATED HERE, BEFORE ANYTHING ELSE TOUCHES THE DATABASE.
     * The step it stands for is the LAST thing each legacy row does (`:L257-L282`), but a boundary
     * refusal at that position would commit every earlier row and abandon the file half-imported — an
     * outcome the port would have caused and the legacy does not have, because the legacy completes the
     * step. Placing the check on this line makes the refusal all-or-nothing: it runs after normalisation,
     * so it can read headings and cells, and before {@link MySqlProductRepository.buildImportPlan} and
     * the per-row loop, so not one statement of any kind has been issued when it raises. See
     * {@link MySqlProductRepository.refuseRequestedContentAssignments} for the three legacy no-op cases
     * it preserves and the one case it refuses.
     *
     * ⚠️ IT RETURNS THE RECORD SEQUENCE RATHER THAN JUST INSPECTING IT, and the returned value must be
     * the one the record loop reads. Deciding all-or-nothing means walking every row, and `rows` is a
     * one-pass generator: the walk is only reachable for a file that declares the unportable column, but
     * where it does happen the rows it pulled come back through here. Ignoring the return value would
     * hand the loop a spent generator and import nothing at all. */
    data = await this.refuseRequestedContentAssignments(data, throwIfCancelled);

    // `:L100-L173` — everything computed once, before the record loop. M7: local to this call.
    const plan = await this.buildImportPlan(data);

    /*
     * ⭐ `:L176-L285` — M3. One boundary per row, strictly in order, each committing on its own.
     *
     * ⚠️ WHAT MUST NOT HAPPEN HERE: no single wrapping transaction, no batching of rows into groups, no
     * "roll everything back on failure" path, and no continue-on-error swallow. The legacy neither
     * batches nor recovers; it commits each row and stops at the first failure, leaving the rows before
     * it in place. Both halves of that are behaviour.
     *
     * THE NON-COLLECTING MEMBER, because the row body returns nothing. The collecting member would
     * accumulate one `undefined` per row of the file and hold the array until the import finished —
     * memory proportional to the row count, spent on values no caller can observe. The boundary is
     * otherwise identical: same single connection, same independent transaction per row, same order,
     * same first-failure semantics, same partial commits.
     */
    await this.transactions.runPerItemWithoutResults(data.rows, async (row, scope) => {
      /*
       * P17: checked at the row boundary, BEFORE this row's first statement. Throwing here aborts the
       * row's own transaction — nothing of it has been written yet — and, by the boundary's first-failure
       * rule, attempts no later row. Rows already committed stay committed, which is the same partial
       * outcome a mid-file data failure produces (M3).
       */
      throwIfCancelled('row', row.rowNumber);

      await this.importRow(scope.executor, row, plan);
    });

    /*
     * `:L287-L325` — the two bulk back-fills, outside every boundary, after the last row commits.
     *
     * ⭐ P16 — WHETHER THEY RUN HERE IS THE CALLER'S DECISION, AND THE DEFAULT IS THE LEGACY'S BEHAVIOUR.
     * `:L288` and `:L304` sit past the closing braces of both the transaction and the loop, unguarded by
     * record count or file type, so running them by default preserves the observable end-to-end shape
     * exactly — including for an empty file and for the `.xls` no-op. What the option adds is the ability
     * for the out-of-band M1 workflow to import a catalog in several invocations and run the two
     * whole-catalog statements ONCE at the end rather than once per invocation, which is a change to
     * WORKFLOW COMPOSITION and not to either statement.
     *
     * ⚠️ WHAT IS DELIBERATELY NOT DONE HERE. Neither statement is guarded on the record count, neither is
     * restricted to the identifiers this import touched, neither gains a `LIMIT`, and their order is
     * unchanged. Any of those would narrow which rows are updated — a semantic change Guideline 4 forbids,
     * and one the review explicitly conditions on a parity exception that is not claimed. The finding is
     * resolved by letting the caller run the pass once per logical import instead of once per invocation,
     * not by making the pass touch fewer rows.
     */
    if (options?.deferBackfills !== true) {
      await this.backfillImportDerivedColumns();
    }
  }

  /* ==============================================================================================
   * ⛔ THE SECOND PERSISTENCE PAIR WAS REMOVED FROM THIS CLASS, AND `saveProduct`/`removeProduct` BELOW
   *    ARE THE SURVIVORS
   * ============================================================================================
   * A `persistProduct(ManagedEntity<Product>)` / `removeProduct(ManagedEntity<Product>)` pair once stood
   * here, alongside a private `collectProductValues` and a second `defaultSkuIdReader` field. It was a
   * SECOND implementation of the two members {@link MySqlProductRepository.saveProduct} and
   * {@link MySqlProductRepository.removeProduct} already provide, and TypeScript reported the collision
   * as `Duplicate function implementation` on `removeProduct` — the two could not coexist.
   *
   * WHY THIS ONE WENT AND THE LOWER PAIR STAYED. Three independent authorities agree:
   *
   *   1. THE PORT DECLARES THE SURVIVORS. `../../ports/repositories/ProductRepository` declares
   *      `saveProduct(product: Product): Promise<Product>` and `removeProduct(product: Product)`, and
   *      this class is `implements ProductRepository`. The removed pair was declared on the class only.
   *   2. EVERY RATIFIED TEST EXERCISES THE SURVIVORS. `test/adapters/MySqlProductRepository.test.ts`
   *      calls `repository.saveProduct(...)` eight times and pins removal's four-statement order and its
   *      transient refusal MESSAGE — `/cannot be removed before it has been persisted/`, which is the
   *      `DomainError` the surviving member throws. The removed member threw a `DataIntegrityError`
   *      carrying different words, so keeping it would have failed that test.
   *      `test/adapters/MySqlProductPersistence.test.ts` wires the service's `persistProduct`
   *      collaborator as `(product) => adapter.saveProduct(product)` in three places — the collaborator
   *      NAME on the service side is satisfied by the `saveProduct` MEMBER on this side.
   *   3. THE REMOVED PAIR ARGUED FROM A PORT INVENTORY THAT NO LONGER HOLDS. Its banner read "These two
   *      members are NOT part of ProductRepository ... AAP §0.4.1.6 closes that port's inventory at
   *      three members". That was true when it was written and is not true now: the port was widened
   *      deliberately, with its own recorded finding, because `ProductService` requires a
   *      `persistProduct: EntityPersister<Product>` and NO adapter supplied one — see the F03 account on
   *      {@link ProductRepository.saveProduct}. Reinstating the narrower claim would reopen that finding.
   *
   * ⚠️ THE ONE REAL DIFFERENCE WAS THE INSERT-VERSUS-UPDATE DECISION, AND `isNew()` IS SOUND HERE.
   * The removed member chose its branch with an EXISTENCE PROBE — a SELECT before the write — on the
   * argument that `Product.isNew()` tests `productID === ''` and therefore flips the instant an
   * identifier is minted. The survivor reads `isNew()` ONCE into a local at entry and mints only inside
   * the insert arm, and the call pattern makes that safe: `ProductService.saveProduct` invokes the
   * persister TWICE for a new product — once while it is still transient, which inserts, and once after
   * `createSkus` has run, which updates a row that by then exists. The probe would issue an extra
   * statement per save to rediscover what the caller's own sequencing already establishes.
   *
   * ⚠️ THE IN-MEMORY MANY-TO-MANY CLEARING WENT WITH IT, AND IT IS NOT A LOST BEHAVIOUR. The removed
   * `removeProduct` called a module helper that emptied the ten many-to-many collections
   * `model/entity/Product.cfc:L79-L90` declares, porting
   * `org/Hibachi/HibachiService.cfc:L61` `removeAllManyToManyRelationships()`. That concern is ALREADY
   * decided in this folder, one layer over, and decided the other way: `./MySqlProductPersistence.ts`
   * carries the judgment call in full and splits it on SCOPE — the in-scope link tables are removed with
   * STATEMENTS, while the nine excluded-family link tables and the three excluded-family cascade
   * children go behind the declared `ProductDependencyCleanup` collaborator and are FLAGGED, which is
   * what TR-5 requires. An in-memory sweep in the adapter would be a third mechanism for a question
   * already answered twice, and it would clear collections `src/domain/product/Product.ts` types with a
   * deliberately opaque element type precisely so that nothing in the port traverses them.
   * ============================================================================================ */
  /**
   * Computes everything `model/dao/ProductDAO.cfc:L100-L173` computes before the record loop opens.
   *
   * Split out from {@link MySqlProductRepository.importFromFile} for readability only. The order of the
   * steps is the legacy's order, and the option-group pre-pass runs LAST because it depends on the
   * classification the steps before it produce.
   *
   * @param data - the normalised record set.
   * @returns the per-import plan. Never retained on the instance (M7).
   */
  private async buildImportPlan(data: NormalisedImportData): Promise<ImportPlan> {
    /*
     * `:L100-L108` — THE PRODUCT LOOKUP COLUMN, RESOLVED BY PRIORITY WITH A SHORT-CIRCUIT.
     *
     * ⚠️ THE ARRAY ORDER AND THE `break` ARE BOTH BEHAVIOUR. The walk is ascending and stops at the
     * first heading the file carries, so a file with both a code and a name column is keyed on the CODE.
     * Preferring a later match, or dropping the short-circuit to take the last, silently changes which
     * existing product a row updates.
     *
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L101` — A FILE CARRYING NONE OF THE FOUR LEAVES THIS AS
     * THE EMPTY STRING, and nothing checks it. The legacy then composes `WHERE  = '...'` from an empty
     * identifier and fails on the first row with a syntax error from the engine. The port fails on the
     * same row for the same reason, one step earlier and with a typed error, because an empty column name
     * cannot pass the identifier whitelist. Supplying a fallback lookup column would be an invented
     * default (S9).
     */
    let productLookupColumn = '';

    for (const candidate of PRODUCT_LOOKUP_COLUMNS) {
      if (containsNoCase(data.columnList, candidate)) {
        productLookupColumn = candidate;
        break;
      }
    }

    /*
     * `:L130-L140` — heading classification on the FIRST underscore-delimited segment.
     *
     * ⚠️ AN UNRECOGNISED PREFIX IS SILENTLY IGNORED, and one heading depends on that. `productcontent_page`
     * has first segment `productcontent`, which matches none of the four, so it never becomes a product
     * column — which is exactly why `:L258` reads it by name instead. A prefix test loose enough to catch
     * it would write a content path into `SwProduct`.
     */
    const productColumns: string[] = [];
    const skuColumns: string[] = [];
    const optionGroupHeadings: string[] = [];
    const customAttributeHeadings: string[] = [];

    for (const heading of data.columnList) {
      const prefix = normaliseHeading(listFirst(heading, HEADING_DELIMITER));

      if (prefix === HEADING_PREFIX.product) {
        productColumns.push(heading);
      } else if (prefix === HEADING_PREFIX.sku) {
        skuColumns.push(heading);
      } else if (prefix === HEADING_PREFIX.option) {
        optionGroupHeadings.push(heading);
      } else if (prefix === HEADING_PREFIX.attribute) {
        customAttributeHeadings.push(heading);
      }
    }

    /*
     * ⚠️ SEC-14 — AUTHORIZATION OF THE MUTATION TARGETS, HERE AND NOT LATER.
     *
     * This is the one point at which the whole set of columns the file wants to write is known and no
     * row has been touched yet: `:L176` opens the first per-row boundary after this member returns, and
     * M3 commits every row on its own, so a refusal discovered later would leave a partially imported
     * catalog behind. See {@link assertImportableColumn} for what is refused and why each one, and for
     * why this is a different question from the identifier whitelist that `assertColumnName` answers.
     *
     * ⭐ IT ALSO SUBSUMES THE UNKNOWN-COLUMN CASE EARLIER THAN BEFORE, WITHOUT REPLACING IT. Because the
     * allowlist is a subset of the schema whitelist, a heading such as `product_nonsense` is refused
     * here rather than by `assertColumnName` on the first row. Nothing that used to import stops
     * importing — both paths refuse — but the failure now names authorization rather than the schema,
     * and it arrives before the source file's first row instead of inside the first transaction. The
     * schema whitelist is still consulted at every statement composition and is not weakened.
     */
    assertImportableColumns(PRODUCT_TABLE, productColumns);
    assertImportableColumns(SKU_TABLE, skuColumns);

    /*
     * `:L142-L148` — the two product-side defaults, supplied only when the heading is ABSENT.
     *
     * A file that carries `product_activeFlag` with an empty cell therefore imports an empty active
     * flag; the default covers a missing COLUMN, not a missing VALUE. Preserved as written.
     */
    const productExtraData: ImportFieldAssignment[] = [];

    for (const defaulted of PRODUCT_DEFAULTED_HEADINGS) {
      if (!containsNoCase(data.columnList, defaulted.heading)) {
        productExtraData.push({ name: defaulted.name, value: DEFAULTED_FLAG_VALUE });
      }
    }

    /*
     * `:L152-L153` — ONE timestamp and ONE account identifier for the WHOLE import.
     *
     * ⚠️ CAPTURED ONCE, BEFORE THE LOOP, SO EVERY OPTION CREATED BY THE IMPORT SHARES ONE AUDIT
     * TIMESTAMP regardless of how long the import runs. `:L152` calls `now()` a single time. Moving the
     * capture inside the loop would give each row its own timestamp — more accurate, and not what the
     * legacy records. `saveImportData` captures a SECOND, later timestamp of its own at `:L340`; that
     * duplication is preserved too, and annotated there.
     */
    const timeStamp = new Date();
    const administratorID = this.currentAccountID();

    const { optionGroupIdsByHeading, survivingOptionGroupHeadings } =
      await this.resolveOptionGroups(optionGroupHeadings);

    return {
      columnList: data.columnList,
      productColumns,
      skuColumns,
      optionGroupHeadings: survivingOptionGroupHeadings,
      optionGroupIdsByHeading,
      customAttributeHeadings,
      productExtraData,
      productLookupColumn,
      timeStamp,
      administratorID,
      /*
       * Created empty, HERE, so it lives exactly as long as this plan does — one import, never the
       * instance (M7). Nothing pre-populates it: a pre-fetch of every distinct brand name would need the
       * whole file up front, which is precisely what this import no longer holds, and it would issue reads
       * for names no row ever reaches. Filling it on first use costs one statement per distinct value and
       * zero for names that never appear.
       */
      lookups: {
        brandIdsByName: new Map<string, string>(),
        productTypeIdsByName: new Map<string, string>(),
        optionIdsByGroupAndCode: new Map<string, string>(),
      },
    };
  }

  /**
   * Resolves each option-group heading to a group identifier, discarding the headings that do not
   * resolve — the port of `model/dao/ProductDAO.cfc:L161-L173`.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L161-L173` — REVERSE ITERATION WITH DELETE-BY-VALUE DURING
   * THE ITERATION, TRANSLATED TO AN ORDER-PRESERVING FILTER. `:L161` counts DOWN with
   * `for(var i=arrayLen(optionGroups); i >= 1; i--)` and `:L169` removes the current heading with
   * `arrayDelete(optionGroups, optionGroup)` — deletion by VALUE, not by index, from the array being
   * walked. The combination is what makes the resulting order and membership non-obvious, so it was
   * worked through rather than assumed:
   *
   * - Counting down means a deletion only ever shifts elements the walk has ALREADY passed, so no
   *   heading is skipped and none is visited twice.
   * - Deleting by value removes the first equal element; since the walk is descending and headings are
   *   unique in a heading row, that is the element the walk is standing on.
   * - The survivors therefore keep their ORIGINAL ASCENDING ORDER, with the unresolved ones removed.
   *
   * The descending loop is kept for the lookups so the statements issue in the legacy's order, and the
   * surviving list is then rebuilt by filtering the original ascending array. Both the query order and
   * the resulting order are preserved. This ordering matters downstream: `:L201-L203` concatenates a SKU
   * code by walking the survivors in order, so a different order produces a different SKU code.
   *
   * ⚠️ AND THE FILTER IS LOAD-BEARING TWICE OVER. A heading that does not resolve is removed from the
   * list the row body iterates, so its cell is never read, no option is created for it, and it never
   * contributes a segment to a generated SKU code. Keeping unresolved headings would change the SKU codes
   * an import generates.
   *
   * @param optionGroupHeadings - the classified option headings, in file order.
   * @returns the resolved identifiers keyed by heading, and the surviving headings in file order.
   */
  private async resolveOptionGroups(optionGroupHeadings: readonly string[]): Promise<{
    readonly optionGroupIdsByHeading: ReadonlyMap<string, string>;
    readonly survivingOptionGroupHeadings: readonly string[];
  }> {
    const optionGroupIdsByHeading = new Map<string, string>();

    // `:L161` — descending, so the statements issue in the legacy's order.
    for (let index = optionGroupHeadings.length - 1; index >= 0; index -= 1) {
      const heading = optionGroupHeadings[index];

      if (heading === undefined) {
        // Unreachable for an in-range index; present because the index signature is checked (S1).
        continue;
      }

      // `:L163` — case-insensitive, FIRST occurrence only. A heading spelled `option_option_colour`
      // yields the key `option_colour`, not `colour`.
      const optionGroupKey = removeFirstNoCase(heading, OPTION_HEADING_PREFIX);

      // `:L164-L166` — one value, three markers. See `OPTION_GROUP_LOOKUP_STATEMENT`.
      const rows = await this.executor.execute(OPTION_GROUP_LOOKUP_STATEMENT, [
        optionGroupKey,
        optionGroupKey,
        optionGroupKey,
      ]);

      // `:L168-L172` — resolved headings are recorded, unresolved ones are dropped.
      if (rows.length > 0) {
        optionGroupIdsByHeading.set(heading, readFirstRowText(rows, OPTION_GROUP_ID_COLUMN));
      }
    }

    const survivingOptionGroupHeadings = optionGroupHeadings.filter((heading) =>
      optionGroupIdsByHeading.has(heading),
    );

    return { optionGroupIdsByHeading, survivingOptionGroupHeadings };
  }

  /**
   * Imports one row inside its own transaction — the port of `model/dao/ProductDAO.cfc:L178-L283`.
   *
   * Every statement here runs on the scope executor the boundary supplied, never on the pool-bound one.
   * That is what M6 requires: the SKU save reads back the product identifier the product save has just
   * written, and the option steps read back the SKU identifier the SKU save has just written, so the
   * reads must sit on the same connection as the uncommitted writes.
   *
   * ⚠️ THE RECORD SET IS NO LONGER A PARAMETER, AND ITS ABSENCE IS DELIBERATE. This member used to
   * receive the whole normalised set solely to run the content-assignment heading test at
   * `:L257-L282`; that test is now a preflight in {@link MySqlProductRepository.importFromFile}, so the
   * row body needs nothing beyond its own row and the shared plan. Keeping an unused parameter would
   * advertise a dependency this member does not have.
   *
   * @param executor - the transaction-scoped execution surface for this row alone.
   * @param row - the row being imported, carrying its one-based number for error context.
   * @param plan - the per-import plan.
   */
  private async importRow(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    plan: ImportPlan,
  ): Promise<void> {
    /*
     * `:L179-L182` — the brand lookup, and `:L183-L186` — the product-type lookup. The reads are GUARDED
     * here and were not there; see `readFirstRowText`.
     *
     * ⭐ RESOLVED THROUGH THE IMPORT'S OWN MEMORY, so a thousand rows sharing one brand issue ONE brand
     * statement rather than a thousand identical ones. {@link ImportLookupMemory} carries the proof that
     * this is answer-preserving; the two facts that do the work are that only POSITIVE resolutions are
     * remembered — an absent brand re-probes on every row, exactly as the legacy does — and that neither
     * statement declares an `ORDER BY`, so the legacy's own answer for a duplicated name is already
     * whichever row the engine yielded first.
     *
     * ⚠️ THE READS STAY ON THE ROW'S OWN TRANSACTION EXECUTOR. A memory miss issues its statement inside
     * this row's boundary, not on the pool, because that is where the legacy issues it (M6). Moving the
     * probe to the pool would be a second connection and a different snapshot.
     */
    const brandID = await this.resolveRememberedLookup(
      executor,
      plan.lookups.brandIdsByName,
      readCell(row, REQUIRED_HEADING.brandName),
      BRAND_LOOKUP_STATEMENT,
      BRAND_ID_COLUMN,
    );

    const productTypeID = await this.resolveRememberedLookup(
      executor,
      plan.lookups.productTypeIdsByName,
      readCell(row, REQUIRED_HEADING.productTypeName),
      PRODUCT_TYPE_LOOKUP_STATEMENT,
      PRODUCT_TYPE_ID_COLUMN,
    );

    // `:L188-L191` — the product's extra data: the defaults, then the two resolved identifiers, in that
    // order. Order matters only for the insert's column list, and it is the legacy's order.
    const productExtraData: ImportFieldAssignment[] = [
      ...plan.productExtraData,
      { name: BRAND_ID_COLUMN, value: brandID },
      { name: PRODUCT_PRODUCT_TYPE_ID_COLUMN, value: productTypeID },
    ];

    // `:L193` — seven positional arguments in the legacy, a named object here.
    const productID = await this.saveImportData(executor, row, {
      table: PRODUCT_TABLE,
      columnList: plan.productColumns,
      lookupColumn: plan.productLookupColumn,
      idColumn: PRODUCT_ID_COLUMN,
      extraData: productExtraData,
    });

    /*
     * `:L196-L198` — the SKU's extra data.
     *
     * ⚠️ `:L196` RE-DECLARES `var thisExtraData` INSIDE THE SAME SCOPE. CFML permits the second `var`
     * and simply rebinds the name, so the product's list is discarded rather than extended — which is
     * the intent, since a SKU must not receive the product's brand and product-type assignments. The
     * port uses two separately named locals, which is the same behaviour stated legibly.
     */
    const skuExtraData: ImportFieldAssignment[] = [
      ...SKU_EXTRA_DATA,
      { name: SKU_PRODUCT_ID_COLUMN, value: productID },
    ];

    /*
     * `:L199-L205` — the generated SKU code.
     *
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L199` — THE FIRST HALF OF THE GUARD IS INVARIANTLY TRUE.
     * `:L109` assigns the literal `"sku_skucode"` and `:L199` compares against the same literal, so the
     * comparison can never be false. It is reproduced rather than simplified away because removing it
     * would hide that the legacy left room for a resolved SKU lookup column it never built — the product
     * side has a four-candidate priority walk and the SKU side has one hard-coded name.
     *
     * ⚠️ AND THE CODE IS BUILT FROM THE PRODUCT LOOKUP CELL PLUS ONE SEGMENT PER SURVIVING OPTION GROUP,
     * IN ORDER. `:L200` seeds it from `data[productLookupColumn][r]` — the very cell whose column was
     * chosen by the priority walk — and `:L202` appends `"-" & data[optionGroup][r]` for each survivor.
     * An empty option cell contributes an empty segment and a bare separator, which is preserved: no
     * segment is skipped and no separator is collapsed.
     */
    if (
      SKU_LOOKUP_COLUMN === 'sku_skucode' &&
      !containsNoCase(plan.columnList, SKU_LOOKUP_COLUMN)
    ) {
      let skuCode = readCell(row, plan.productLookupColumn);

      for (const heading of plan.optionGroupHeadings) {
        skuCode += SKU_CODE_SEGMENT_SEPARATOR + readCell(row, heading);
      }

      // `:L204` — the legacy names the field `skucode`, all-lowercase; the whitelist restores the
      // entity's own casing when the statement is composed.
      skuExtraData.push({ name: SKU_LOOKUP_COLUMN_FIELD, value: skuCode });
    }

    // `:L207`.
    const skuID = await this.saveImportData(executor, row, {
      table: SKU_TABLE,
      columnList: plan.skuColumns,
      lookupColumn: SKU_LOOKUP_COLUMN,
      idColumn: SKU_ID_COLUMN,
      extraData: skuExtraData,
    });

    // `:L209-L237` — assign one option per surviving option group.
    for (const heading of plan.optionGroupHeadings) {
      const optionGroupID = plan.optionGroupIdsByHeading.get(heading);

      if (optionGroupID === undefined) {
        // Unreachable: the surviving list is derived from the map's own keys. Guarded because the map
        // read is checked (S1).
        continue;
      }

      await this.assignOptionToSku(executor, row, heading, optionGroupID, skuID, plan);
    }

    // `:L238-L256` — the custom attributes.
    for (const heading of plan.customAttributeHeadings) {
      await this.applyCustomAttribute(executor, row, heading, productID);
    }

    /* `:L257-L282` — the content assignments, a declared boundary that is NOT checked here.
     *
     * ⭐ THE REFUSAL IS PREFLIGHTED, AND THAT PLACEMENT IS THE WHOLE POINT. The step sits LAST in the
     * legacy row body, after the product, the SKU, every option and every custom attribute have already
     * been written. Refusing at this position under M3's per-row commits would leave every earlier row
     * durable and this row's own product and SKU rolled back — a partial import caused by the PORT's
     * boundary rather than by anything the legacy does, because the legacy completes this step. The
     * refusal therefore moves to {@link MySqlProductRepository.refuseRequestedContentAssignments},
     * which runs over the whole record set in `importFromFile` before the first boundary opens.
     *
     * ⚠️ NOTHING ABOUT M3 IS WEAKENED BY THAT MOVE. The preflight refuses an import the port cannot
     * complete; it does not batch rows, wrap the loop, or add a roll-back-everything path for imports it
     * CAN complete. A file with no content column, or with an empty content cell in every row, reaches
     * this line exactly as before and still commits one row at a time, stopping at the first failure
     * with the rows before it in place.
     */
  }

  /**
   * Resolves or creates one option and links it to the SKU — the port of
   * `model/dao/ProductDAO.cfc:L209-L237`.
   *
   * ⚠️ AN EMPTY CELL IS A SKIP, NOT A NULL ASSIGNMENT. `:L211` guards on `optionCode != ""`, so a blank
   * option cell leaves the SKU without an option from that group. Note the asymmetry this creates with
   * the generated SKU code above, which DOES append an empty segment for the same blank cell: the code
   * gains a separator and the SKU gains no option. Both are preserved as written.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param row - the row being imported.
   * @param heading - the option heading whose cell carries the option code.
   * @param optionGroupID - the group identifier resolved by the pre-pass.
   * @param skuID - the SKU the option is linked to.
   * @param plan - the per-import plan, for the shared timestamp and account identifier.
   */
  private async assignOptionToSku(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    heading: string,
    optionGroupID: string,
    skuID: string,
    plan: ImportPlan,
  ): Promise<void> {
    // `:L210-L211`.
    const optionCode = readCell(row, heading);

    if (optionCode === '') {
      return;
    }

    /*
     * ⭐ THE IMPORT'S MEMORY IS CONSULTED BEFORE THE STATEMENT, so a file with three option columns over a
     * thousand rows issues one statement per DISTINCT (group, code) pair instead of three thousand. On a
     * hit the whole block below is skipped: the option is known to exist, so `:L217`'s non-empty branch is
     * the one the legacy would take, and `:L222-L227` — the creation path — must not run.
     *
     * ⚠️ THE LINK PROBE IS STILL ISSUED ON EVERY HIT, and that is not an oversight. Its key includes the
     * SKU identifier, which is per-row, and two file rows can resolve to the SAME SKU because the code at
     * `:L200-L203` is derived from cell values. The second such row must see the link the first inserted,
     * which is the same-connection read-back M6 requires. Only the OPTION resolution is remembered; the
     * link question is asked afresh every time, exactly as the legacy asks it.
     */
    const rememberedOptionKey = optionMemoryKey(optionGroupID, optionCode);
    const rememberedOptionID = plan.lookups.optionIdsByGroupAndCode.get(rememberedOptionKey);

    if (rememberedOptionID !== undefined) {
      // `:L218-L221` then `:L230-L234`, with `:L217` known to take its non-empty branch.
      const knownLink = await executor.execute(SKU_OPTION_EXISTENCE_STATEMENT, [
        rememberedOptionID,
        skuID,
      ]);

      if (knownLink.length === 0) {
        await executor.executeMutation(SKU_OPTION_INSERT_STATEMENT, [rememberedOptionID, skuID]);
      }

      return;
    }

    // `:L212-L215` — the outer join that returns a row for the group even when the option is absent.
    const lookupRows = await executor.execute(OPTION_LOOKUP_STATEMENT, [optionCode, optionGroupID]);

    // `:L216` — the legacy reads `lookupResult.optionID` unguarded on a set that can be empty when the
    // GROUP itself has vanished between the pre-pass and this row. Guarded; a NULL option identifier
    // reads as the empty string, which is what `:L217` tests for.
    let optionID = readFirstRowText(lookupRows, OPTION_ID_COLUMN);
    let linkExists: boolean;

    if (optionID !== '') {
      // `:L218-L221` — does the link row already exist?
      const existingLink = await executor.execute(SKU_OPTION_EXISTENCE_STATEMENT, [
        optionID,
        skuID,
      ]);
      linkExists = existingLink.length > 0;
    } else {
      /*
       * `:L222-L229` — create the option, then fall through to create the link.
       *
       * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L223` — THE IDENTIFIER TRANSFORM IS OPEN-CODED HERE
       * RATHER THAN DELEGATED. `:L223` writes `lcase(replace(createUUID(),"-","","all"))` inline instead
       * of calling the generator `model/dao/HibachiDAO.cfc:L51-L53` exposes, and `:L248` and `:L277` do
       * the same thing again. The port calls the single shared generator at every one of those sites; the
       * duplication is recorded rather than reproduced, because reproducing it would mean three copies of
       * one algorithm and IR-6 fixes the algorithm, not its call sites.
       *
       * ⚠️ AND THE GROUP IDENTIFIER IS RE-READ FROM THE LOOKUP ROW, NOT REUSED FROM THE PRE-PASS.
       * `:L225` interpolates `lookupResult.optionGroupID` — the value the outer join returned — rather
       * than the argument. The two are the same identifier in every case the statement can return a row,
       * but the read is preserved because that is what the source does.
       */
      optionID = createSlatwallUUID();

      await executor.executeMutation(OPTION_INSERT_STATEMENT, [
        optionID,
        readFirstRowText(lookupRows, OPTION_GROUP_ID_COLUMN),
        optionCode,
        // `:L226` writes the CODE into the name column as well. See `OPTION_NAME_COLUMN`.
        optionCode,
        plan.timeStamp,
        plan.timeStamp,
        plan.administratorID,
        plan.administratorID,
      ]);

      // `:L228` — set to false explicitly, so a newly created option always gets its link row.
      linkExists = false;
    }

    /*
     * Remember the resolution, whether it was found at `:L216` or created at `:L223`.
     *
     * ⚠️ RECORDING A CREATED OPTION IS SAFE BECAUSE OF FIRST-FAILURE, NOT BECAUSE THE INSERT IS COMMITTED.
     * The insert above sits inside this row's transaction and is not durable yet. If this row later fails,
     * its transaction rolls back and the entry would name an option that does not exist — but no later row
     * can read it, because the per-row boundary stops at the FIRST failure and attempts no further row
     * (M3). The entry cannot outlive its own transaction's success. {@link ImportLookupMemory} states the
     * same thing as a standing obligation: were the boundary ever to gain a continue-on-error mode, this
     * recording would have to be removed with it.
     *
     * ⚠️ AND AN EMPTY IDENTIFIER IS NEVER RECORDED. `optionID` is `''` only when `:L216` found no row AND
     * the creation path did not run — which cannot happen here, since `:L217`'s empty branch always
     * creates — but the guard is kept so the memory's positive-only invariant is enforced at the write
     * rather than merely argued at the read.
     */
    if (optionID !== '') {
      plan.lookups.optionIdsByGroupAndCode.set(rememberedOptionKey, optionID);
    }

    // `:L230-L234`.
    if (!linkExists) {
      await executor.executeMutation(SKU_OPTION_INSERT_STATEMENT, [optionID, skuID]);
    }
  }

  /**
   * Updates or inserts one custom attribute value — the port of `model/dao/ProductDAO.cfc:L239-L255`.
   *
   * ⚠️ THE ATTRIBUTE IDENTIFIER IS THE HEADING'S LAST SEGMENT AND IS NOT VALIDATED. `:L240` takes
   * `ListLast(customAttribute,"_")` straight from the heading row and the legacy interpolates it into
   * both statements. The port binds it as a VALUE, which is what it is — an identifier column's content,
   * not a column name — so it needs no whitelist entry and gains no injection surface.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L247` — THE INSERT IS GATED ON THE UPDATE'S AFFECTED-ROW
   * COUNT, WHICH IS NOT AN EXISTENCE TEST. `getPrefix().recordcount` on an `UPDATE` is the number of rows
   * CHANGED, and an update writing the value a row already holds changes nothing, so the legacy then
   * inserts a duplicate attribute value for a row that already had one. Carried across exactly: the count
   * is read as the legacy reads it and no existence probe is added.
   *
   * ⚠️ `:L254` calls `clearParams()` because the legacy reuses one query object across statements and
   * named parameters accumulate on it. Positional binding has no accumulation to clear, so the call has
   * no analogue and none is invented.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param row - the row being imported.
   * @param heading - the attribute heading, whose last segment is the attribute identifier.
   * @param productID - the product the value belongs to.
   */
  private async applyCustomAttribute(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    heading: string,
    productID: string,
  ): Promise<void> {
    // `:L240-L242`.
    const attributeID = listLast(heading, HEADING_DELIMITER);
    const attributeValue = readCell(row, heading);

    if (attributeValue === '') {
      return;
    }

    // `:L243-L247` — bind order is value, attribute, product: statement-text order.
    const affectedRows = await executor.executeMutation(ATTRIBUTE_VALUE_UPDATE_STATEMENT, [
      attributeValue,
      attributeID,
      productID,
    ]);

    if (affectedRows === 0) {
      // `:L248-L252`.
      await executor.executeMutation(ATTRIBUTE_VALUE_INSERT_STATEMENT, [
        createSlatwallUUID(),
        PRODUCT_ATTRIBUTE_VALUE_TYPE,
        attributeValue,
        attributeID,
        productID,
      ]);
    }
  }

  /**
   * The declared boundary for content-page assignments — the port of
   * `model/dao/ProductDAO.cfc:L257-L282`, evaluated as a PREFLIGHT over the whole record set.
   *
   * ⛔ THE STEP IS A DECLARED BOUNDARY, NOT AN OMISSION, AND THE REASON IS A SCHEMA THE PORT REFUSES TO
   * ADMIT. `:L261-L264` joins `tContent`, which is a Mura CMS table and belongs to a separate
   * application's schema: the module header records why the identifier whitelist deliberately does not
   * carry it, and admitting it would extend this port into an external content-management system whose
   * columns, subtype vocabulary and lifecycle are outside every scope boundary this migration declares.
   * `SwProductContent`, the table the second half of the step writes, has no entity in the in-scope
   * catalogue either — AAP §0.2.2.1 excludes the whole `model/**\/Content*.cfc` family, and AAP §0.6.3.1
   * records that the legacy service's own `contentService` injection has ZERO call sites. There is no
   * in-scope collaborator to route this through and none may be invented (S5, S9).
   *
   * ⭐ WHY THIS RUNS BEFORE THE FIRST ROW RATHER THAN INSIDE THE ROW IT CONCERNS. In the legacy the step
   * is the LAST thing a row does, after that row's product, SKU, options and attributes are written, and
   * under M3 each row commits on its own. A refusal at the legacy's position would therefore commit every
   * row before the offending one, roll back only the offending row's own work, and abandon the file
   * mid-import — a partial catalogue produced by the PORT's boundary, not by any behaviour the legacy
   * has, because the legacy completes this step successfully. Preflighting converts that into an
   * all-or-nothing refusal: the caller is told the import cannot be completed, and the catalogue is
   * exactly as it was. Nothing is written, so there is nothing to reconcile.
   *
   * ⚠️ WHAT THE PREFLIGHT DOES NOT DO, because either would change behaviour the port CAN reproduce:
   * it does not wrap the record loop in one transaction, it does not batch rows, and it does not add a
   * roll-back-everything path for imports that are inside the boundary. M3's per-row commit shape —
   * including its partial-import outcome on a genuine mid-file failure such as a missing heading or a
   * rejected value — is untouched.
   *
   * ⚠️ THE THREE LEGACY NO-OP CASES ARE PRESERVED EXACTLY, AND ONLY THE FOURTH REFUSES. `:L258` tests
   * for the HEADING and `:L259` splits the CELL with `listToArray`, which yields zero elements for an
   * empty string:
   *   1. Heading absent — `:L258` is false, the block never opens. No-op.
   *   2. Heading present, this row's cell empty — `:L260` iterates zero times. No-op for that row.
   *   3. Heading present, EVERY row's cell empty — every row is case 2, so the whole file is a no-op and
   *      the import proceeds to completion. Raising here would fail an import the legacy completes.
   *   4. Heading present and at least one cell non-empty — a row genuinely asks for an assignment the
   *      legacy would have performed. This raises rather than silently discarding the assignment, so no
   *      caller can mistake an unported step for a completed one (TR-5).
   *
   * ⚠️ THE SCAN VISITS EVERY ROW, NOT JUST THE FIRST, and reports the first offender by row number
   * together with how many rows ask in total. Stopping at the first row would still be correct — one
   * offending row is enough to refuse — but the count is what tells a caller whether the file needs one
   * cell cleared or a column removed, and the whole set has to be walked to know that. The walk performs
   * no input or output of any kind: it reads cells already in memory.
   *
   * @param data - the normalised record set, for the heading test and every row's cell.
   * @throws {NotImplementedError} when any row asks for a content assignment.
   */
  private async refuseRequestedContentAssignments(
    data: NormalisedImportData,
    throwIfCancelled: (phase: string, rowNumber?: number) => void,
  ): Promise<NormalisedImportData> {
    /* `:L258` — the heading test, hoisted out of the row body. Case 1, and the case that every ordinary
     * import takes: the record sequence is handed straight back, nothing is buffered, and the streaming
     * shape described on {@link NormalisedImportData.rows} is preserved byte for byte. The walk below is
     * reachable only for a file that declares a column this port cannot honour. */
    if (!containsNoCase(data.columnList, CONTENT_PAGE_COLUMN)) {
      return data;
    }

    let firstOffendingRowNumber: number | undefined;
    let firstOffendingPageCount = 0;
    let offendingRowCount = 0;

    /* ⭐ WHY THE ROWS ARE COLLECTED WHILE THEY ARE SCANNED, AND ONLY ON THIS PATH.
     * `data.rows` is a single-pass async generator, so the scan that makes the refusal all-or-nothing
     * consumes the very sequence the record loop would import. Draining it and handing the exhausted
     * generator on would import ZERO rows and report success — so the rows this walk pulls are kept and
     * replayed to the caller. The cost is bounded to files that declare `productcontent_page`: for the
     * refusing case the buffer is discarded with the exception, and for the all-empty case it is what
     * lets the import the legacy completes still complete here. */
    const bufferedRows: NormalisedImportRow[] = [];

    for await (const row of data.rows) {
      /* P17 at the same granularity the record loop uses. This phase drives the file's remaining
       * retrieval I/O on the streamed path, so a cancelled caller must not be made to wait for the whole
       * file — and nothing has been written, so abandoning here leaves the catalogue untouched. */
      throwIfCancelled('contentAssignmentPreflight', row.rowNumber);

      bufferedRows.push(row);

      // `:L259` — the default comma delimiter, and empty tokens dropped. See `listToArray`.
      const contentPages = listToArray(readCell(row, CONTENT_PAGE_COLUMN), LIST_DELIMITER);

      if (contentPages.length === 0) {
        // Case 2. `:L260` iterates zero times; a no-op in the source is a no-op here.
        continue;
      }

      offendingRowCount += 1;

      if (firstOffendingRowNumber === undefined) {
        firstOffendingRowNumber = row.rowNumber;
        firstOffendingPageCount = contentPages.length;
      }
    }

    if (firstOffendingRowNumber === undefined) {
      /* Case 3 — the column is present and every cell is empty, so the legacy does nothing and so does
       * this. The import proceeds, reading the rows this walk already pulled: the generator behind
       * `data.rows` is spent, and replaying the buffer is what keeps an import the legacy completes from
       * silently becoming an import of nothing. */
      return { columnList: data.columnList, rows: replayBufferedRows(bufferedRows) };
    }

    // Case 4.
    throw new NotImplementedError(
      'MySqlProductRepository.importFromFile',
      'assigning content pages to an imported product resolves those pages in a separate ' +
        'content-management application whose schema this catalogue port does not read or write, so ' +
        'the assignment cannot be completed here; the import was refused before any row was written ' +
        'rather than abandoned part-way through',
      {
        context: {
          rowNumber: firstOffendingRowNumber,
          requestedPageCount: firstOffendingPageCount,
          requestingRowCount: offendingRowCount,
        },
      },
    );
  }

  /**
   * Updates an existing row or inserts a new one — the port of `model/dao/ProductDAO.cfc:L328-L417`.
   *
   * ⚠️ PRIVATE IN BOTH. `:L328` declares `private string function saveImportData(...)`, it is not on
   * {@link ProductRepository}, and it is not exported from this module. The only caller is the per-row
   * body, which invokes it twice per row — once for the product at `:L193` and once for the SKU at
   * `:L207`.
   *
   * ⭐ THIS METHOD CONTAINS THE TWO HARDEST D18 SITES IN THE ENTIRE PORT, and the module header declares
   * the exception they close. Concretely:
   *
   * - `:L385-L387` interpolates THREE identifiers and ONE value: the projected identifier column, the
   *   table, and a column name DERIVED AT RUNTIME by `listLast(lookupColumn,'_')` from a heading the
   *   uploaded file supplied. All three identifiers are routed through the whitelist here and the value
   *   becomes a bind marker.
   * - `:L393-L395` interpolates an ENTIRE HAND-BUILT `SET` CLAUSE as raw statement text — a string
   *   assembled at `:L347-L378` from file headings and file cells, complete with the quoting decision the
   *   legacy makes per column. It is rebuilt here as `column = ?` pairs from whitelisted names with a
   *   parallel parameter array. There is no concatenation path and no fragment parameter, because
   *   `QueryRunner` deliberately exposes no raw-execution seam for one to travel through.
   *
   * ⚠️ THE PER-COLUMN QUOTING BRANCH DISAPPEARS, AND THAT IS ITSELF A CONSEQUENCE OF D18. `:L350-L354`
   * and `:L370-L374` decide whether to wrap a value in quotes based on the column name ending in `Flag`
   * or `Weight`, so an EMPTY flag cell became the bare token `activeFlag=` — a syntax error — while an
   * empty text cell became `''`. A bound parameter has no quoting decision to make: every value binds as
   * itself. The engine now receives an empty string where it previously received malformed statement
   * text, which means a row the legacy rejected can now succeed. This is recorded rather than smoothed
   * over, because it is a behavioural difference and it follows directly from the declared exception.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L334-L338` — FIVE `java.lang.StringBuilder` OBJECTS ARE
   * CREATED AND IMMEDIATELY DISCARDED. `:L334-L338` allocates them and the code that follows never
   * touches one, building plain strings instead. Nothing replaces them here; the dead allocation is
   * recorded so a reader does not go looking for the builder-based assembly they imply.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L340-L341` — A SECOND TIMESTAMP AND A SECOND ACCOUNT READ.
   * The import already captured both once at `:L152-L153`; this method captures them again, per call,
   * so a row's audit columns carry a LATER timestamp than the options created for that same row. Both
   * captures are preserved at their own sites rather than unified.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L356-L360` — A DEAD CONDITIONAL. `:L356` branches on
   * `isNumeric(...)` and both arms of the branch are byte-identical, so the test cannot change what is
   * produced. It is not reproduced, because reproducing a branch whose arms agree would be noise; the
   * finding is recorded here instead.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L328` — THE PARAMETER NAMED `columnList` HERE IS NOT THE
   * `columnList` OF THE IMPORTER. `:L123` declares a local `columnList` holding EVERY heading in the
   * file, while `:L328` declares a parameter of the same name receiving only the classified subset for
   * one table. Two distinct identifiers with one spelling in one file. The port keeps both names, because
   * both appear in the source, and states the distinction here so a reader tracing a value does not
   * conflate them.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param row - the row being saved.
   * @param request - the five remaining legacy arguments, named rather than positional. A five-argument
   *   positional list of which four are strings is exactly where a transposition goes unnoticed.
   * @returns the identifier of the row that was updated or inserted — `:L416` returns it on BOTH paths.
   */
  private async saveImportData(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    request: {
      /** `:L328` `tableName` — already validated, so a logical name cannot reach a statement (D22). */
      readonly table: PhysicalTableName;
      /** `:L328` `columnList` — the classified headings for this table only. See the note above. */
      readonly columnList: readonly string[];
      /** `:L328` `lookupColumn` — a HEADING, whose last segment is the column to match on. */
      readonly lookupColumn: string;
      /** `:L328` `idColumn` — the identifier column to project, match on and generate. */
      readonly idColumn: string;
      /** `:L328` `extraData` — the `{name, value}` pairs, insert-only. See the note at `:L368-L378`. */
      readonly extraData: readonly ImportFieldAssignment[];
    },
  ): Promise<string> {
    const auditColumns = auditColumnsOf(request.table);

    // `:L340-L341` — the second capture. See the note above.
    const timeStamp = new Date();
    const administratorID = this.currentAccountID();

    /*
     * `:L385-L387` — the runtime-derived lookup column.
     *
     * Resolved BEFORE anything else that could fail, because this is the identifier most likely to be
     * absent: an import whose file carries none of the four product lookup headings arrives here with an
     * empty string, and an empty column name cannot be whitelisted. The legacy fails on the same row for
     * the same reason, one step later and with an engine syntax error.
     */
    const lookupColumnName = assertColumnName(
      request.table,
      listLast(request.lookupColumn, HEADING_DELIMITER),
    );

    // `:L343-L345` — seeded from the file only when the file actually carries the lookup heading.
    let lookupColumnValue = '';

    if (containsNoCase(request.columnList, request.lookupColumn)) {
      lookupColumnValue = readCell(row, request.lookupColumn);
    }

    const updateColumns: string[] = [];
    const updateParams: unknown[] = [];
    const insertColumns: string[] = [];
    const insertParams: unknown[] = [];

    /*
     * `:L347-L361` — one assignment per classified heading, contributing to BOTH statements.
     *
     * The column name is the heading's last segment, whitelisted against this table. A heading naming a
     * column the entity does not declare is refused here; the legacy passed it to the engine, which
     * refused it too, so the failure moves earlier and becomes typed rather than disappearing.
     *
     * ⚠️ SEC-14 — TWO CHECKS PER HEADING, ASKING TWO DIFFERENT QUESTIONS, IN THIS ORDER. `assertColumnName`
     * answers "is this a real column of this table", which is what makes the identifier safe to place in
     * statement text (D22). {@link assertImportableColumn} answers "may an imported file WRITE it", which
     * is the mass-assignment question the identifier check cannot answer. Schema first, so a heading
     * naming nothing is still reported as a schema fault rather than as an authorization one.
     *
     * ⭐ THIS IS DEFENCE IN DEPTH, NOT THE PRIMARY CONTROL. The primary control is the plan-time refusal
     * in {@link MySqlProductRepository.buildImportPlan}, which runs before any row exists — this member
     * writes rows, so a refusal here has already lost the "nothing was imported" guarantee for every row
     * that committed before it. It is kept anyway because it is the only check on the path a future
     * caller would reach if it assembled a `columnList` of its own instead of taking the plan's, and
     * because a control at the write site is what makes the guarantee true of the write rather than of
     * one particular caller.
     */
    for (const heading of request.columnList) {
      const column = assertColumnName(request.table, listLast(heading, HEADING_DELIMITER));

      assertImportableColumn(request.table, heading);

      const value = readCell(row, heading);

      updateColumns.push(column);
      updateParams.push(value);
      insertColumns.push(column);
      insertParams.push(value);
    }

    /*
     * `:L363-L366` — the audit columns.
     *
     * ⚠️ THE UPDATE PATH SETS ONLY THE MODIFIED PAIR AND THE INSERT PATH SETS ALL FOUR, exactly as the
     * legacy assembles them: `:L363-L364` append the modified pair to the `SET` string, and `:L365-L366`
     * append all four to the insert lists. An update therefore never rewrites the created columns, which
     * is correct and is preserved.
     */
    updateColumns.push(auditColumns.modified);
    updateParams.push(timeStamp);
    updateColumns.push(auditColumns.modifiedBy);
    updateParams.push(administratorID);

    insertColumns.push(auditColumns.created);
    insertParams.push(timeStamp);
    insertColumns.push(auditColumns.modified);
    insertParams.push(timeStamp);
    insertColumns.push(auditColumns.createdBy);
    insertParams.push(administratorID);
    insertColumns.push(auditColumns.modifiedBy);
    insertParams.push(administratorID);

    /*
     * `:L368-L378` — the extra data.
     *
     * ⚠️ INSERT-ONLY. The loop appends to `insertColumns` and `insertValues` and never to
     * `updateSetString`, so an UPDATE never writes a brand identifier, a product-type identifier, a
     * defaulted flag or a generated SKU code. Re-importing an existing product therefore leaves its brand
     * exactly as it was, whatever the file says. That is a substantial behaviour, it is easy to "fix" by
     * adding two lines, and it is preserved.
     *
     * ⚠️ AND `:L375-L377` CAN OVERRIDE THE LOOKUP VALUE. When an extra-data pair happens to name the
     * lookup column — which is precisely what the generated SKU code at `:L204` does — its value replaces
     * whatever the file supplied. That is how a SKU with no `sku_skucode` heading is still matched
     * against an existing row by its generated code. The comparison is case-insensitive, because the
     * legacy's `==` is.
     */
    for (const assignment of request.extraData) {
      const column = assertColumnName(request.table, assignment.name);

      insertColumns.push(column);
      insertParams.push(assignment.value);

      if (normaliseHeading(assignment.name) === normaliseHeading(lookupColumnName)) {
        lookupColumnValue = assignment.value;
      }
    }

    /*
     * `:L381-L383` trims a trailing comma off the hand-built `SET` string. There is no trailing comma to
     * trim here, because the clause is joined from a list rather than accumulated with separators — the
     * whole class of fencepost error the trim exists to correct cannot occur.
     */

    // `:L385-L387` — the existence lookup. Three identifiers from the whitelist, one bound value.
    const lookupRows = await executor.execute(
      composeExistenceLookup(request.table, request.idColumn, lookupColumnName),
      [lookupColumnValue],
    );

    /*
     * `:L389-L390` — the existence flag and the identifier.
     *
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L390` — THE LEGACY READS THE DYNAMIC IDENTIFIER COLUMN
     * UNCONDITIONALLY, BEFORE THE `if(exists)` AT `:L392`. On an empty result set CFML yields an empty
     * string from a query column rather than raising, so the read was harmless and the value was
     * discarded moments later on the insert path. The port keeps the same read at the same point and
     * guards it, because an indexed read is checked here (S1); the guarded value is the same empty string
     * on the same input.
     */
    const rowExists = lookupRows.length > 0;
    let idColumnValue = readFirstRowText(lookupRows, request.idColumn);

    if (rowExists) {
      /*
       * `:L393-L396` — the update.
       *
       * Bind order is every assignment in assembly order, then the identifier last, matching the legacy
       * statement text exactly (TR-4).
       */
      await executor.executeMutation(
        composeImportUpdate(request.table, updateColumns, request.idColumn),
        [...updateParams, idColumnValue],
      );
    } else {
      // `:L398-L409` — the URL title, on the product table only.
      if (request.table === PRODUCT_TABLE) {
        insertColumns.push(PRODUCT_URL_TITLE_COLUMN);
        insertParams.push(await this.resolveImportUrlTitle(executor, row));
      }

      /*
       * `:L410` — the generated identifier.
       *
       * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L410` — OPEN-CODED, AND REASSIGNED WITHOUT `var`. The
       * line writes `lcase(replace(createUUID(),"-","","all"))` inline rather than calling the generator
       * `model/dao/HibachiDAO.cfc:L51-L53` exposes, and it reassigns the local declared at `:L390`
       * without a second `var`. The port calls the single shared generator — 32 lowercase hex characters
       * with no separators, per IR-6 — and keeps the reassignment, which is what makes the single return
       * at `:L416` correct for both paths.
       */
      idColumnValue = createSlatwallUUID();

      // `:L411-L413` appends the identifier column LAST, after every other column. Preserved.
      insertColumns.push(request.idColumn);
      insertParams.push(idColumnValue);

      await executor.executeMutation(
        composeImportInsert(request.table, insertColumns),
        insertParams,
      );
    }

    // `:L416` — one return, reached from both paths.
    return idColumnValue;
  }

  /**
   * Produces the URL title for a newly inserted product — the port of
   * `model/dao/ProductDAO.cfc:L398-L409`.
   *
   * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L404-L406` — ONE APPEND, NO RE-PROBE, SO A SECOND COLLISION
   * IS UNHANDLED. `:L401-L403` probes for an existing product with the candidate title and, on a hit,
   * `:L405` appends `"_" & product_productCode` ONCE and proceeds straight to the insert. Nothing probes
   * again, so two imported products sharing both a name and a code both attempt the same title.
   *
   * ⚠️ AND THIS IS DELIBERATELY NOT THE ALGORITHM `slatwall-ts/src/util/urlTitle.ts` IMPLEMENTS. That
   * module is the port of `model/service/DataService.cfc:L53-L71`, which loops with a pre-incremented
   * counter and therefore produces `-2` as its FIRST collision suffix. The importer's strategy is
   * categorically different: a single underscore-separated product code, applied once. The two are not
   * harmonised and this module deliberately does not import that one — unifying them would change what
   * the importer writes, and the Minimal Change Clause forbids exactly that kind of tidy-up.
   *
   * ⚠️ THE TRANSFORM ITSELF IS INJECTED BECAUSE THE LEGACY CALLS A MEMBER THAT DOES NOT EXIST. `:L399`
   * invokes `filterFileName` through a dynamic service lookup, and a repository-wide search finds exactly
   * one occurrence of that name — this call site. There is no definition to port, so no algorithm is
   * invented here: {@link ImportUrlTitleFilter} states the contract and the composition root supplies it.
   *
   * @param executor - the row's transaction-scoped executor, so the probe sees this transaction's writes.
   * @param row - the row being inserted.
   * @returns the URL title to insert.
   */
  private async resolveImportUrlTitle(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
  ): Promise<string> {
    // `:L399`.
    const candidate = this.urlTitleFilter(readCell(row, REQUIRED_HEADING.productName));

    // `:L401-L403`.
    const collisions = await executor.execute(URL_TITLE_PROBE_STATEMENT, [candidate]);

    // `:L404` — no collision, use the candidate as it stands.
    if (collisions.length === 0) {
      return candidate;
    }

    // `:L405` — one append, and no second probe.
    return candidate + URL_TITLE_COLLISION_SEPARATOR + readCell(row, REQUIRED_HEADING.productCode);
  }

  /**
   * The current account identifier — the port of `getSlatwallScope().getCurrentAccount().getAccountID()`
   * at `model/dao/ProductDAO.cfc:L153` and again at `:L341`.
   *
   * ⚠️ ABSENCE MAPS TO THE EMPTY STRING, AND THAT IS THE LEGACY VALUE RATHER THAN AN INVENTED DEFAULT.
   * The legacy accessor always hands back an account object — a NEW, unpersisted one when nobody is
   * authenticated — and reading the identifier off an unpersisted entity yields `""` because the
   * identifier property declares `unsavedvalue=""`. So an unauthenticated import writes empty audit
   * account columns in the legacy, and it writes empty audit account columns here. Substituting a system
   * account identifier, or refusing the import, would both be inventions (S9).
   *
   * The port is SYNCHRONOUS, per M8: nothing in this slice may depend on background completion to learn
   * who is acting.
   *
   * @returns the account identifier, or `''` when there is no authenticated account.
   */
  private currentAccountID(): string {
    return this.accountContext.getCurrentAccount()?.accountID ?? '';
  }

  /**
   * Resolve a single-value lookup through the import's memory, issuing the statement only on a miss.
   *
   * The shared body of the brand lookup at `model/dao/ProductDAO.cfc:L179-L182` and the product-type
   * lookup at `:L183-L186`. Both have the identical shape — one bound cell value, one projected
   * identifier, first row wins, empty string when nothing matched — so they share one implementation
   * rather than two copies of the same memory discipline.
   *
   * ⚠️ A MISS IS NOT REMEMBERED, WHICH IS WHAT KEEPS THIS FAITHFUL. Returning `''` records nothing, so
   * the next row carrying the same absent name issues the statement again — and therefore observes a row
   * created concurrently in between, on exactly the row the legacy would first have observed it. Only a
   * resolved identifier is remembered, and {@link ImportLookupMemory} carries the argument for why that
   * cannot change within one import.
   *
   * ⚠️ THE EMPTY NAME IS NOT SPECIAL-CASED. `:L180` and `:L184` bind the cell whatever it contains,
   * including the empty string, and the legacy neither guards nor short-circuits it. So neither does this:
   * an empty cell issues the statement, and if it happens to match a row with an empty name it resolves,
   * exactly as the legacy would.
   *
   * @param executor - the row's transaction-scoped executor. Never the pool-bound one (M6).
   * @param memory - the import-scoped map for this lookup, mutated in place on a resolution.
   * @param value - the cell value to bind, verbatim.
   * @param statement - the lookup statement, whose sole placeholder takes `value`.
   * @param identifierColumn - the column the statement projects.
   * @returns the resolved identifier, or `''` when nothing matched — the legacy's own empty-set value.
   */
  private async resolveRememberedLookup(
    executor: ProductStatementExecutor,
    memory: Map<string, string>,
    value: string,
    statement: string,
    identifierColumn: string,
  ): Promise<string> {
    const remembered = memory.get(value);
    if (remembered !== undefined) {
      return remembered;
    }

    const rows = await executor.execute(statement, [value]);
    const resolved = readFirstRowText(rows, identifierColumn);

    if (resolved !== '') {
      memory.set(value, resolved);
    }

    return resolved;
  }

  /**
   * Runs the two bulk back-fills — the port of `model/dao/ProductDAO.cfc:L287-L325`.
   *
   * ⚠️ OUTSIDE EVERY TRANSACTION, AND THAT IS CONFIRMED FROM THE BRACE STRUCTURE. `:L284` closes
   * `transaction{` and `:L285` closes the record loop, so `:L288` onward sits at the member's top level.
   * Neither statement is inside a boundary, neither can be rolled back, and a failure in the first leaves
   * the second unexecuted while every committed row stays committed. The observable shape of the whole
   * import is N single-row transactions followed by two untransacted bulk statements, and it is preserved
   * exactly (M3).
   *
   * ⚠️ THEY RUN UNCONDITIONALLY. Nothing guards them on the record count or the file type, so a
   * spreadsheet upload that imported nothing still executes both, and so does an empty file. See the note
   * on {@link MySqlProductRepository.importFromFile}.
   *
   * ⭐ AND THAT IS WHY THIS MEMBER IS PUBLIC. It was private, invoked only from the tail of the import,
   * which meant a whole-catalog pass for every invocation of an out-of-band workflow that necessarily
   * spans several. Exposing it lets the workflow pass `deferBackfills` on its chunks and invoke this once
   * at the end, executing exactly the same two statements, in the same order, over the same rows — once
   * per logical import instead of once per invocation. The import still invokes it by default, so nothing
   * a pre-existing caller observes changes.
   *
   * ⚠️ EXPOSING IT ADDS NO BEHAVIOUR AND NARROWS NOTHING. No record-count guard, no restriction to the
   * identifiers an import touched, no `LIMIT`, no reordering. Narrowing any of that would change which
   * rows are updated, which Guideline 4 forbids and which the review conditions on a parity exception that
   * is deliberately not claimed.
   *
   * ⚠️ BOTH ARE D22 SITES AND NEITHER IS AN INJECTION SITE. `:L289` and `:L295` interpolate nothing at
   * all; `:L305`, `:L311` and `:L318` interpolate a SETTING, not file content. The only change to the
   * first is the logical-to-physical identifier translation, and the only change to the second is that
   * the setting travels as a bound value. Claiming either as a D18 injection would over-state the
   * declared exception, which is as misleading as under-stating it.
   *
   * ⚠️ ONE UNTRANSACTED REGION, TWO STATEMENTS, IN THE LEGACY'S ORDER. `:L302` and `:L325` execute
   * separately on the same non-transactional connection, so a single untransacted region containing both
   * in sequence is the faithful shape. Their order is not incidental: the first assigns default SKUs and
   * the second derives image file names, and both read rows the row loop has already committed.
   */
  public async backfillImportDerivedColumns(): Promise<void> {
    await this.transactions.runWithoutTransaction(async (executor) => {
      // `:L288-L302` — back-fill 1. Zero parameters, exactly as `:L302` executes it.
      await executor.executeMutation(DEFAULT_SKU_BACKFILL_STATEMENT, []);

      /*
       * `:L304-L325` — back-fill 2.
       *
       * ⚠️ THE SEPARATOR TRAVELS INSIDE THE BOUND VALUE. `:L307` writes
       * `concat(productCode, '.#setting("globalImageExtension")#')`, so the dot and the extension are one
       * literal in the legacy statement. A bind marker takes the whole literal, which keeps the produced
       * file name identical while removing the interpolation. The dialect variants at `:L313` (`||`) and
       * `:L320` (`+`) build the same string a different way and collapse into this one path; the collapse
       * and the casing mismatch that proves the branches were never meant to diverge are both recorded on
       * the statement constant.
       *
       * ⚠️ F5 — THE EXTENSION IS A FROZEN SOURCE-BACKED CONSTANT, NOT AN INJECTED CALLBACK AND NOT A
       * FIELD. `DEPRECATED_SETTING_DEFAULTS.globalImageExtension` transcribes the legacy metadata
       * default at `model/service/SettingService.cfc:L247`, and it lives in the settings module so that
       * this port has exactly ONE setting boundary. Reading a frozen module-scope constant raises no M7
       * question: there is no per-caller configuration to leak across a warm container, because there
       * is no per-caller configuration at all — the legacy never seeded this name, so every caller gets
       * the same declared default the legacy engine would have yielded.
       */
      await executor.executeMutation(SKU_IMAGE_FILE_BACKFILL_STATEMENT, [
        IMAGE_EXTENSION_SEPARATOR + DEPRECATED_SETTING_DEFAULTS.globalImageExtension,
      ]);
    });
  }

  /**
   * The writable `SwProduct` values, in exactly the order {@link PRODUCT_WRITABLE_COLUMNS} lists them.
   *
   * An absent optional field becomes `null` rather than being dropped. Omitting it would let the database
   * apply its own column default on insert — a different outcome from storing the absence the entity
   * holds — and on update would silently leave a stale value in place.
   *
   * ⚠️ THE THREE FOREIGN KEYS ARE READ FROM THE ASSOCIATIONS, which is the only place they live: the read
   * mapper resolves no association at all, so the entity's `brand`, `productType` and `defaultSku` links
   * are the sole source for `brandID`, `productTypeID` and `defaultSkuID`. See the port for why this
   * write/read asymmetry is deliberate.
   *
   * ⚠️ THE FOUR `calculated*` COLUMNS ARE STORED, NEVER COMPUTED. They are persistent at
   * `model/entity/Product.cfc:L62-L65` while the services that MAINTAIN them are excluded by AAP
   * §0.2.2.6, so computing one here would import a pricing or inventory rule into the adapter layer.
   *
   * ⭐ F07 — `calculatedSalePrice` IS BOUND AS EXACT DECIMAL TEXT. It is `ormtype="big_decimal"` at
   * `model/entity/Product.cfc:L62`, and the domain type carries it as an `ExactDecimal` rather than a
   * `number`, so what is bound here is the stored digits at the stored scale. An earlier revision bound a
   * double and recorded that as a tracked concern, noting correctly that the fix *"belongs to the read and
   * write paths together rather than to this member alone"* — which is why it was made at both ends at
   * once: `rowMappers.ts` reads the column into the same representation this member writes back.
   *
   * `mysql2` binds a string to a `DECIMAL` column without reinterpreting it, so nothing here rounds,
   * scales or reformats the value it was given — and now nothing upstream does either.
   */
  private collectWritableProductValues(product: Product): readonly unknown[] {
    return [
      product.activeFlag ?? null,
      product.urlTitle ?? null,
      product.productName ?? null,
      product.productCode ?? null,
      product.productDescription ?? null,
      product.publishedFlag ?? null,
      product.sortOrder ?? null,
      product.calculatedSalePrice ?? null,
      product.calculatedQATS ?? null,
      product.calculatedAllowBackorderFlag ?? null,
      product.calculatedTitle ?? null,
      product.brand?.brandID ?? null,
      product.productType?.productTypeID ?? null,
      /* Read through the injected reader: `defaultSku` is a behavioural delegate with no identifier
       * accessor, by design. `undefined` when the product has no default, which is the state a new
       * product is inserted in — see the write-order note on `saveProduct`. */
      product.defaultSku === undefined ? null : this.readDefaultSkuId(product.defaultSku),
      product.remoteID ?? null,
      product.createdDateTime ?? null,
      product.createdByAccount ?? null,
      product.modifiedDateTime ?? null,
      product.modifiedByAccount ?? null,
    ];
  }

  /**
   * Write one product. See {@link ProductRepository.saveProduct} for the contract and for why no
   * importer statement could serve as this member.
   *
   * ==================================================================================================
   * THE WRITE ORDER THE CIRCULAR FOREIGN KEY FORCES (F03 / F04)
   * ==================================================================================================
   * `SwProduct.defaultSkuID` references `SwSku`, and `SwSku.productID` references `SwProduct`, so neither
   * row can be inserted with its reference already populated. The mapping layer resolved this by sorting
   * the graph itself and emitting a follow-up UPDATE; the explicit sequence a caller must therefore use is:
   *
   *   1. `saveProduct(product)` — the product row, with `defaultSkuID` whatever the entity carries, which
   *      for a new product is null because no SKU exists yet. This satisfies `SwSku.productID`.
   *   2. `SkuRepository.persistSku(sku)` per SKU, in the odometer order `createSkus` enumerates, each
   *      write followed by the next SKU's uniqueness read so M6 holds (AAP §0.6.2).
   *   3. `saveProduct(product)` AGAIN, now that `product.defaultSku` is populated, which takes the UPDATE
   *      branch and sets `defaultSkuID`.
   *
   * ⭐ STEP 3 IS WHY THIS MEMBER IS IDEMPOTENT ON AN ALREADY-PERSISTED PRODUCT and why it decides
   * insert-against-update from the entity rather than refusing a second call. Calling it twice is not a
   * caller mistake; it is the only sequence the schema permits. All three steps belong inside ONE
   * transaction, which is what makes the intermediate null default unobservable — see
   * `src/adapters/mysql/UnitOfWork.ts` for the boundary and for the re-binding a caller performs.
   *
   * ⛔ NO COMMIT, NO CASCADE, NO VALIDATION — all three belong to layers above; the port records why.
   */
  public async saveProduct(product: Product): Promise<Product> {
    const isInsert = product.isNew();

    /* The identifier `generator="uuid"` produced at flush time — assigned only while transient, so an
     * update keeps the identifier its stored row is keyed on, and so step 3 above updates rather than
     * inserting a duplicate. */
    if (isInsert) {
      product.productID = createSlatwallUUID();
    }

    /*
     * ==================================================================================================
     * THE AUDIT BLOCK IS STAMPED HERE, BECAUSE THIS IS THE FLUSH (F03)
     * ==================================================================================================
     * Hibernate invoked `preInsert`/`preUpdate` automatically as part of the flush the framework
     * triggered at request end — `org/Hibachi/Hibachi.cfc` performs a double `ormFlush()` when the ORM
     * reports no errors, with `flushAtRequestEnd=false`. A stateless Lambda invocation has no ORM
     * session, no automatic flush and no request-end hook (mismatch M5, AAP §0.6.6), so nothing fires
     * the hook unless a write seam calls it. `src/services/BaseService.ts` explicitly declines the job
     * and places it "behind `EntityPersister`", which is this member.
     *
     * ⭐ THE FREE FUNCTIONS ARE CALLED DIRECTLY, RATHER THAN A HOOK ON THE ENTITY, AND THAT ASYMMETRY IS
     * LEGACY-FAITHFUL. `model/entity/Product.cfc` does NOT override `preInsert`/`preUpdate`, so a product
     * received only the framework audit block at `org/Hibachi/HibachiEntity.cfc:L598-L649` and
     * `:L657-L681`; `src/domain/base/AuditableEntity.ts` is the port of exactly that block, so calling it
     * reproduces what the legacy product write did. `model/entity/ProductType.cfc:L305-L313` DOES
     * override both, which is why `MySqlProductTypeRepository` calls the entity's own hooks instead of
     * these functions — there the override additionally refreshes a persisted column.
     *
     * ⚠️ THE ORDER IS FIXED: STAMP FIRST, COLLECT SECOND. `collectWritableProductValues` reads the four
     * audit fields off the entity, so stamping after it would compose the statement from the PREVIOUS
     * write's values and persist a row whose audit columns lag one save behind — a fault that reports no
     * error and shows up only as stale data.
     *
     * ⚠️ WHICH FIELDS MOVE IS DECIDED INSIDE THE STAMPING FUNCTIONS, NOT HERE. On insert both timestamps
     * take the identical instant and both account columns are written only for a persisted
     * administrative actor; on update only `modifiedDateTime` moves and `createdByAccount` is never
     * touched. Those gates are the legacy gates and are reproduced in
     * `src/domain/base/AuditableEntity.ts`, so this member neither re-implements nor second-guesses them.
     *
     * ⚠️ AN ABSENT ACTOR IS A LEGITIMATE STATE AND IS NOT AN ERROR. `AccountContextPort` answers
     * `undefined` when nobody is authenticated, the stamping functions accept that, and the legacy
     * behaved identically: an unauthenticated request stamped the timestamps and left both account
     * foreign keys unwritten. No system account is substituted (S9).
     */
    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      applyPreInsertAudit(product, auditActor);
    } else {
      applyPreUpdateAudit(product, auditActor);
    }

    const writableValues = this.collectWritableProductValues(product);

    if (isInsert) {
      const columnList = [PRODUCT_ID_COLUMN, ...PRODUCT_WRITABLE_COLUMNS].join(', ');
      const placeholders = [PRODUCT_ID_COLUMN, ...PRODUCT_WRITABLE_COLUMNS]
        .map(() => '?')
        .join(', ');

      await this.executor.executeMutation(
        `INSERT INTO ${PRODUCT_TABLE} (${columnList}) VALUES (${placeholders})`,
        [product.productID, ...writableValues],
      );

      return product;
    }

    const assignments = PRODUCT_WRITABLE_COLUMNS.map((column) => `${column} = ?`).join(', ');

    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${assignments} WHERE ${PRODUCT_ID_COLUMN} = ?`,
      [...writableValues, product.productID],
    );

    return product;
  }

  /**
   * Remove one product, together with the SKU rows and option links its cascade owns.
   *
   * See {@link ProductRepository.removeProduct} for which cascades are expressed, which are deliberately
   * not, and why the delete guards mean only the SKU cascade can ever have rows to act on.
   *
   * ==================================================================================================
   * THE REMOVAL ORDER, WHICH IS FORCED RATHER THAN CHOSEN
   * ==================================================================================================
   *   1. Clear `SwProduct.defaultSkuID`. It references a SKU row that step 3 removes, so the reference has
   *      to go first or step 3 leaves it dangling. Issued unconditionally: an UPDATE setting a column to
   *      the value it already holds is harmless, and branching on whether a default exists would read a
   *      relationship this member has no reason to resolve.
   *   2. Remove the `SwSkuOption` link rows for every SKU of this product, selected by subquery on
   *      `SwSku.productID`. They reference `SwSku`, so they precede it.
   *   3. Remove the `SwSku` rows. They reference `SwProduct`, so they precede it.
   *   4. Remove the `SwProduct` row.
   *
   * Every step is one statement, and none reads anything back: the identifiers are all derivable from the
   * product identifier by subquery, so no round trip is needed and no intermediate list can go stale.
   *
   * ⛔ ALL FOUR STATEMENTS BELONG TO ONE TRANSACTION, AND THIS MEMBER DOES NOT OPEN IT. Between steps 3
   * and 4 the database is in a state the legacy never exposed — SKUs gone, product present — so a caller
   * that ran this outside a transaction would make that state durable if step 4 failed. Demarcation stays
   * with the caller (mismatch M5), exactly as it does for every other write in this folder.
   *
   * ⚠️ A TRANSIENT PRODUCT IS REFUSED. An entity reporting itself new carries the empty unsaved value from
   * `model/entity/Product.cfc:L52`, so every statement above would key on `''` — matching nothing in a
   * sound table and an arbitrary row in an unsound one. The mapping layer would have raised on the same
   * input, a transient instance having no persistent identity to remove, so this refuses an input the
   * legacy could not express rather than one it accepted.
   */
  public async removeProduct(product: Product): Promise<void> {
    if (product.isNew()) {
      throw new DomainError('A product cannot be removed before it has been persisted.', {
        context: { productCode: product.productCode },
      });
    }

    const productIdentifier = product.productID;

    // 1. Drop the back-reference before the row it points at disappears.
    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${PRODUCT_DEFAULT_SKU_ID_COLUMN} = NULL ` +
        `WHERE ${PRODUCT_ID_COLUMN} = ?`,
      [productIdentifier],
    );

    // 2. The link rows, which reference the SKU rows removed next.
    await this.executor.executeMutation(
      `DELETE FROM ${SKU_OPTION_TABLE} WHERE ${SKU_OPTION_SKU_ID_COLUMN} IN ` +
        `(SELECT ${SKU_ID_COLUMN} FROM ${SKU_TABLE} WHERE ${SKU_PRODUCT_ID_COLUMN} = ?)`,
      [productIdentifier],
    );

    // 3. The SKU rows, which reference the product row removed last.
    await this.executor.executeMutation(
      `DELETE FROM ${SKU_TABLE} WHERE ${SKU_PRODUCT_ID_COLUMN} = ?`,
      [productIdentifier],
    );

    // 4. The product itself.
    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TABLE} WHERE ${PRODUCT_ID_COLUMN} = ?`,
      [productIdentifier],
    );
  }
}
