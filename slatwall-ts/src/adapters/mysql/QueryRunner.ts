/**
 * QueryRunner — the single parameterized-execution boundary of the extracted Catalog slice, and the
 * home of the validated identifier whitelist the whole adapter folder depends on.
 *
 * AAP 0.4.1.7 makes this file CREATE against `model/dao/HibachiDAO.cfc`, with
 * `org/Hibachi/HibachiDAO.cfc` as REFERENCE: *"`pool.execute()` wrapper enforcing parameterized
 * binding; the get / list / save / delete / count surface the slice actually uses"*. Rule R4
 * (AAP 0.4.3.4) names the translation — `ormExecuteQuery(hql, positionalParams)` becomes
 * `pool.execute(sql, params)` — and TR-4 names the invariant that must survive it: the bound value
 * list is assembled in exactly the legacy sequence, one placeholder per legacy positional parameter,
 * because binding ORDER is observable behaviour even when the statement text is not.
 *
 * WHICH LEGACY SURFACE THIS IS, AND WHY IT IS REACHED THROUGH A LOCAL SUBCLASS (IR-8)
 * ----------------------------------------------------------------------------------
 * The four in-scope data-access components extend `model/dao/HibachiDAO.cfc`, whose declaration at
 * `:L49` is `extends="Slatwall.org.Hibachi.HibachiDAO"` and whose entire body — `:L51-L53` — is one
 * identifier helper that is already ported to `src/util/uuid.ts`. The surface actually being ported
 * therefore belongs to the FRAMEWORK class, reached through a Slatwall-local subclass that adds
 * nothing to it. That indirection is easy to miss and worth stating once: reading only the local
 * file would suggest there is no persistence surface to port at all.
 *
 * THE FIVE LEGACY MEMBERS THIS FILE ANSWERS FOR, AND THE TARGET MEMBER EACH BECOMES
 * --------------------------------------------------------------------------------
 *   `get()`    [org/Hibachi/HibachiDAO.cfc:L6-L26]   ->  {@link QueryRunner.executeOne}
 *   `list()`   [org/Hibachi/HibachiDAO.cfc:L28-L35]  ->  {@link QueryRunner.execute}
 *   `save()`   [org/Hibachi/HibachiDAO.cfc:L48-L67]  ->  {@link QueryRunner.executeMutation}
 *   `delete()` [org/Hibachi/HibachiDAO.cfc:L69-L77]  ->  {@link QueryRunner.executeMutation}
 *   `count()`  [org/Hibachi/HibachiDAO.cfc:L79-L86]  ->  {@link QueryRunner.executeScalarCount}
 *
 * Five legacy members, four target members, because a write and a delete are the same shape once the
 * ORM's cascade traversal is gone: `save()` recursed through `getPopulatedSubProperties()` at
 * `:L54-L64` and `delete()` recursed through an array at `:L70-L73`, and both recursions were
 * Hibernate graph walks rather than statement execution. Cascade is a repository decision in this
 * port, so what reaches the driver is one statement returning one write acknowledgement.
 *
 * THE MEMBER CENSUS IS CLOSED — DO NOT COMPLETE THE SET
 * ----------------------------------------------------
 * `org/Hibachi/HibachiDAO.cfc` was read end to end, all 215 lines. It is a mixed tag-and-script
 * component — the `<cfscript>` block closes at `:L127` and the "Private Helper Methods" banner at
 * `:L123-L125` is empty — so a scan for `public … function` undercounts it. The exhaustive census is
 * `get`, `list`, `new`, `save`, `delete`, `count`, `reloadEntity`, `flushORMSession`,
 * `clearORMSession`, `getSmartList`, `getExportQuery`, `isUniqueProperty`, `getTableTopSortOrder` and
 * `updateRecordSortOrder`. Everything outside the five members above is DELIBERATELY elsewhere, and
 * each omission below is a recorded decision rather than an oversight:
 *
 *   MEMBER                  LOCATOR                        DISPOSITION
 *   flushORMSession         :L92-L96                       -> `UnitOfWork.ts`. The two primitives it
 *   clearORMSession         :L98-L100                         conceptually replaces. Not here.
 *   getSmartList            :L102-L111                     -> `SmartListQueryBuilder.ts`, behind
 *                                                             `SmartListQueryPort`. Cited here only
 *                                                             as the root cause of the dual name
 *                                                             vocabulary documented below.
 *   getExportQuery          :L113-L119                     Not on any port and not in scope. It
 *                                                             interpolates a table name into
 *                                                             `SELECT * FROM …` at `:L116` and writes
 *                                                             an unscoped result variable at `:L117`.
 *                                                             Cited by locator; nothing implemented.
 *   isUniqueProperty        :L130-L147                     -> `UniquePropertyChecker.ts` (IR-5).
 *   getTableTopSortOrder    :L149-L168                     -> `UnitOfWork.ts`.
 *   updateRecordSortOrder   :L170-L215                     Formally excluded — noted, not
 *                                                             implemented.
 *   reloadEntity            :L88-L90                       No in-scope caller. Not implemented.
 *   new                     :L38-L45                       Instantiation, not execution. Domain
 *                                                             construction lives in `src/domain/**`.
 *
 * NO TRANSACTION DEMARCATION LIVES HERE, AND THAT SEPARATION IS LOAD-BEARING (M5)
 * ------------------------------------------------------------------------------
 * This class opens nothing, commits nothing and rolls back nothing, and it exposes no member that
 * would let a caller try. Demarcation belongs to `UnitOfWork.ts`, which is answerable for the
 * request-end implicit commit the legacy system performed out of band: `flushORMSession()` at
 * `org/Hibachi/HibachiDAO.cfc:L92-L96` flushes TWICE — `ormFlush()` at `:L93` and again at `:L95`,
 * the second one commented as persisting changes made by ORM event handlers — and it is reached from
 * `org/Hibachi/Hibachi.cfc:L413` and `:L463` through the error-gated block at `:L455-L459`, plus
 * `Application.cfc:L177`. There is no request-end hook in a stateless handler, so that boundary has
 * to become explicit somewhere; making it explicit HERE would put statement execution and
 * transaction lifetime in one object and leave every caller able to commit by accident.
 *
 * Two further mismatches make the same point from the other direction, and both are `UnitOfWork.ts`'s
 * to answer: the importer commits once PER ROW because `transaction{` opens inside the record loop at
 * `model/dao/ProductDAO.cfc:L177`, and SKU uniqueness validation reads back siblings the same
 * operation is still writing. Neither is reproducible by a per-statement wrapper.
 *
 * WHAT THIS FILE HOLDS, WHICH IS NOTHING (M7)
 * -------------------------------------------
 * No result cache, no memoised statement, no prepared-statement registry of its own, no lookup that
 * grows at run time. The frozen whitelist tables below are module-level constants built once at load
 * and never written to, which is a different thing entirely. AAP 0.6.6 requires any memoisation in
 * this port be *"scoped to the request object rather than the module, to avoid cross-tenant bleed on
 * a warm container"*, because `cacheuse="transactional"` sits on 111 of the 113 legacy entities and
 * the legacy components memoise inside their own `variables` scope — `model/dao/SkuDAO.cfc:L204-L228`
 * being the in-slice example. A cache in a shared execution boundary is exactly that bleed. The
 * driver maintains its own prepared-statement handling and this file adds none.
 *
 * NOTHING IS CONSTRUCTED HERE EITHER (S3)
 * ---------------------------------------
 * The pool arrives as a typed constructor parameter and is stored `readonly`. No credential is read,
 * no connection target is resolved, no environment is consulted and no default parameter manufactures
 * a pool. That is a deliberate inversion of the legacy shape: `model/dao/ProductDAO.cfc` builds a
 * credential-reading connection in three separate places — `:L155-L158`, `:L329-L332` and `:L420` —
 * and the two spellings `setDatasource` at `:L156` and `setDataSource` at `:L330` are a small
 * reminder that CFML resolved those member names case-insensitively while TypeScript does not.
 * Ownership of the pool's lifetime sits above this file, in the composition root; nothing here can
 * end it, resize it or replace it.
 *
 * THE DIALECT BRANCH IS COLLAPSED, WHICH IS NOT THE SAME AS RESOLVED
 * -----------------------------------------------------------------
 * `config/configORM.cfm:L8-L14` chooses `MySQL`, `MicrosoftSQLServer` or `Oracle10g` at run time from
 * a `cfdbinfo` version probe, and the slice branches on the result in three places:
 * `model/dao/SkuDAO.cfc:L194-L197` (the sorted-SKU ordering expression) and
 * `model/dao/ProductDAO.cfc:L288` and `:L304`. This port targets MySQL only (AAP 0.4.1.3), so there
 * is no dialect type here, no branch on a database-product setting and no per-dialect module. See the
 * TODO(parity) block below for why that is a documented collapse rather than a repair.
 *
 * IMPORT DIRECTION (S4)
 * ---------------------
 * An adapter may reach `domain/`, `ports/`, `util/`, `errors/` and the driver, and nothing else. This
 * module reaches `errors/`, its sibling mapper and one driver TYPE. It imports no configuration
 * module, reads no environment value and names no cloud type: configuration flows one way through
 * `src/config/`, and `src/config/env.ts` is the only file in the subtree permitted to read the
 * ambient environment of the running process. That one-way flow is what stops the apparent
 * configuration/adapter cycle from ever forming — the composition root imports this file, this file
 * never imports it back. Every import is relative, extensionless and single-quoted, because
 * `tsconfig.json` declares no `baseUrl` and no `paths`, so an alias that type-checks could still fail
 * to resolve in the bundled artefact.
 *
 * THE FAILURE MODE THIS FILE EXISTS TO PREVENT
 * --------------------------------------------
 * It is not a bug; it is a kindness. Sooner or later one statement in this folder resists the typed
 * surface — the hand-assembled `SET` clause at `model/dao/ProductDAO.cfc:L393-L395` is the likeliest
 * candidate — and the generous response is to add an overload that accepts pre-assembled statement
 * text with a note asking callers to sanitise it. That overload compiles, reads reasonably, passes
 * review, and silently reopens the entire injection surface the port is documented as closing. There
 * is no such overload, there is no member that accepts a caller-assembled fragment, and the driver's
 * client-side text-substituting execution member is never reached from this file under any name or
 * behind any flag. When a statement cannot be expressed as {@link assertTableName} plus
 * {@link assertColumnName} plus `?` placeholders, the whitelist is incomplete: extend the whitelist.
 *
 * @see `src/adapters/mysql/rowMappers.ts` for the hydration half of the same boundary.
 */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import { toRows } from './rowMappers';

import type { MySqlRow } from './rowMappers';

/* ================================================================================================
 * TODO(parity) D22 — THE LEGACY TREE SPEAKS TWO TABLE VOCABULARIES AT ONCE, AND BOTH ARE CORRECT
 * ================================================================================================
 * This is the single most consequential design decision in this file, and getting it wrong produces
 * code that compiles, passes every test anybody happens to write, and then fails at run time the
 * first time a real caller reaches it.
 *
 * Byte-verified at each entity component's `:L49` declaration:
 *
 *   ENTITY COMPONENT                    entityname (LOGICAL, HQL)   table (PHYSICAL, SQL)
 *   model/entity/Product.cfc:L49        SlatwallProduct             SwProduct
 *   model/entity/Sku.cfc:L49            SlatwallSku                 SwSku
 *   model/entity/ProductType.cfc:L49    SlatwallProductType         SwProductType
 *   model/entity/Brand.cfc:L49          SlatwallBrand               SwBrand
 *   model/entity/Option.cfc:L49         SlatwallOption              SwOption
 *   model/entity/OptionGroup.cfc:L49    SlatwallOptionGroup         SwOptionGroup
 *   model/entity/AlternateSkuCode.cfc:L49
 *                                       SlatwallAlternateSkuCode    SwAlternateSkuCode
 *
 * The last row is NOT one of the six in-scope entity components of AAP 0.2.1.2, and it is here for a
 * concrete reason rather than for completeness: `model/service/SkuService.cfc:L316` joins the
 * `alternateSkuCodes` collection and `:L321` keyword-searches `alternateSkuCodes.alternateSkuCode`, so
 * the SKU smart list — one of the AAP-declared signatures — cannot be composed without naming this
 * table. `src/ports/SmartListQueryPort.ts` admits `SlatwallAlternateSkuCode` as a traversable entity
 * for exactly that reason, so refusing it here would leave the port able to describe a query the
 * adapter could not emit. The whitelist is extended rather than an escape hatch opened, which is the
 * rule this file states and the resolution its own guidance prescribes. It is reachable as a JOIN
 * TARGET only; nothing makes it the base of a query, and no domain type is invented for it.
 *
 * plus the many-to-many link table SwSkuOption, declared on the owning side at
 * `model/entity/Sku.cfc:L76` with `fkcolumn="skuID" inversejoincolumn="optionID"` and mirrored with
 * `inverse="true"` at `model/entity/Option.cfc:L66`. Its logical counterpart SlatwallSkuOption is
 * real too, and is named in statement text at `model/dao/ProductDAO.cfc:L219`.
 *
 * WHY THE DUALITY EXISTS. It is not an inconsistency to be tidied away. The framework prefixes the
 * application key onto any entity name handed to it whenever the name does not already begin with it,
 * at FIVE separate sites in `org/Hibachi/HibachiDAO.cfc` — `:L8-L10` in `get()`, `:L30-L32` in
 * `list()`, `:L40-L42` in `new()`, `:L81-L83` in `count()` and `:L104-L106` in `getSmartList()`. So a
 * bare `Product` becomes `SlatwallProduct`, and `Slatwall*` is the LEGITIMATE and CORRECT name in
 * HQL, while `Sw*` is the only name a native statement can use. Both reach identifier-bearing code
 * paths, and four independent mechanisms prove it:
 *
 *   1. `org/Hibachi/HibachiEntity.cfc:L642` and `:L644` pass `getMetaData(this).table` — a PHYSICAL
 *      name — into the sort-order helper.
 *   2. `org/Hibachi/HibachiService.cfc:L781-L785` resolves an entity name into `entityMetaData.table`
 *      before delegating, so the same call arrives PHYSICAL one layer down and LOGICAL one layer up.
 *   3. The five prefix sites above SYNTHESISE a logical name from a bare one.
 *   4. `model/dao/ProductDAO.cfc:L193` and `:L207` pass the LOGICAL literals `"SlatwallProduct"` and
 *      `"SlatwallSku"` straight into a save path whose statement text then interpolates them, at
 *      `:L386`, `:L394` and `:L412`. Meanwhile `model/dao/SkuDAO.cfc:L179-L188` names SwSku,
 *      SwSkuOption, SwOption and SwOptionGroup — all PHYSICAL — in native statement text.
 *
 * WHAT WOULD GO WRONG WITH A ONE-VOCABULARY WHITELIST. Accepting only `Sw*` compiles cleanly and then
 * throws the first time the `"SlatwallProduct"` literal at `model/dao/ProductDAO.cfc:L193` reaches it.
 * Accepting only `Slatwall*` emits a table name that does not exist in the schema. {@link
 * assertTableName} therefore accepts the physical name, the logical name and the bare name, and always
 * EMITS the physical one, because that is the only form a statement may carry.
 *
 * WHAT MUST NOT BE REPRODUCED. The prefixing rule itself is a string operation with no knowledge of
 * the schema, so applied literally to a physical name it produces `SlatwallSwProduct` — a table that
 * does not exist. Resolution here is a whitelist lookup, never a prefix concatenation, and any name
 * outside the twelve is refused rather than transformed.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L288` and `:L304` — CASE SENSITIVITY IS A DELIBERATE
 * TRANSLATION DECISION, NOT AN INCIDENTAL ONE (AAP 0.8.2 Guideline 6). CFML `eq` and `==` compare
 * strings case-insensitively, and the legacy source relies on it without noticing: the same
 * database-product test is spelled `eq "mySQL"` at `:L288` and `eq "mySql"` at `:L304`, and the
 * importer matches a column key spelled `brand_brandname` at `:L180` against a differently-cased
 * heading. TypeScript `===` is case-sensitive. Both assertions below therefore normalise their INPUT
 * case, preserving the legacy tolerance, while EMITTING the exact canonical casing the schema
 * declares, so nothing downstream depends on how a caller happened to spell it.
 *
 * ONE TABLE THAT IS DELIBERATELY ABSENT. `model/dao/ProductDAO.cfc:L261-L264` joins an external
 * content-management table that is not part of the `Sw*` schema, and `:L271` and `:L277` reach a
 * product-content table outside this slice. None of them is admitted here. Admitting an external
 * schema to this whitelist would silently extend the port's surface past the boundary AAP 0.2.2 draws,
 * so the refusal is the correct behaviour and the repository that meets that join is answerable for
 * flagging it.
 *
 * THIS FILE MINTS NO NEW DEFECT OR MISMATCH IDENTIFIER, and no global closure claim is made here:
 * the register is stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus the
 * source extension D22 and the three contract corrections D23, D24 and D25, with no D26 or beyond;
 * and AAP 0.6.6's M1-M8 plus M9, with no M10 or beyond). It CITES D22, D8, M3, M5, M6 and M7 and
 * records every other finding by `path:Lnnn` locator alone. It does not OWN any of them: D22's
 * home is that same SKU port, M3 and M5 belong to `UnitOfWork.ts`, and M7 binds every memoising
 * site rather than belonging to one.
 * ============================================================================================== */

/**
 * The twelve physical table names the extracted Catalog slice may name in a statement.
 *
 * Declared as the single source of truth so the exported type and the run-time lookups cannot drift
 * apart, and so iterating the set needs no type assertion. Order is the order the entity components
 * appear in AAP 0.2.1.2, then the FOUR link tables `model/entity/Sku.cfc:L76-L79` declares, then the
 * ONE link table `model/entity/Product.cfc:L81` declares whose far side is also in scope, then the
 * join-target-only alternate SKU code table whose presence is justified in the duality note above.
 *
 * ⚠️ ALL FOUR SKU LINK TABLES ARE NAMED, NOT JUST THE OPTION ONE. `model/entity/Sku.cfc` owns four
 * many-to-many collections and each declares its own `linktable` — `SwSkuOption` at `:L76`,
 * `SwSkuAccessContent` at `:L77`, `SwSkuSubsBenefit` at `:L78` and `SwSkuRenewalSubsBenefit` at `:L79`.
 * Only the first was named here originally, which made the other three unwriteable: `assertTableName`
 * refuses an unlisted name, so a persist path could not have composed a statement against them even by
 * accident. That is the whitelist doing its job, and the fix is to declare the tables the entity
 * actually owns rather than to loosen the gate.
 *
 * ⚠️ THE THREE ADDED TABLES ARE IN SCOPE EVEN THOUGH THE ENTITIES ON THEIR FAR SIDE ARE NOT. The
 * content and subscription families are excluded (AAP 0.2.2.1), and nothing here reads or writes
 * `SwContent`, `SwSubscriptionBenefit` or any other table belonging to them. What is written is the LINK
 * ROW, whose owning side is `SwSku` — a table squarely inside the slice — and whose far column carries
 * an identifier the port already models as a plain 32-character reference. Declining to write the link
 * row would not respect the boundary; it would silently drop a relationship the in-scope entity owns.
 *
 * ⚠️ `SwRelatedProduct` IS THE ONLY PRODUCT LINK TABLE NAMED, AND THE NINE OMISSIONS ARE DELIBERATE.
 * `model/entity/Product.cfc:L79-L90` declares TEN many-to-many collections. Exactly one of them —
 * `relatedProducts` at `:L81` — has `SwProduct` on BOTH sides, so it satisfies the same test the three
 * SKU link tables above satisfy and is declared. The other nine name `Content`, `Category`,
 * `PromotionReward` (twice), `PromotionQualifier` (twice), `PriceGroupRate`, `Vendor` and `Physical`,
 * every one of which AAP §0.2.2.1 excludes, and their link tables are NOT declared here. That is the
 * boundary holding rather than a gap: `MySqlProductPersistence.ts` clears them through an injected
 * collaborator whose implementation belongs to whoever owns those families (TR-5), so no excluded
 * family's table identifier is ever composed inside this subtree.
 */
const PHYSICAL_TABLE_NAMES = [
  'SwProduct',
  'SwSku',
  'SwProductType',
  'SwBrand',
  'SwOption',
  'SwOptionGroup',
  'SwSkuOption',
  'SwSkuAccessContent',
  'SwSkuSubsBenefit',
  'SwSkuRenewalSubsBenefit',
  'SwRelatedProduct',
  'SwAlternateSkuCode',
] as const;

/**
 * A physical `Sw*` table name that has been validated against the extracted schema.
 *
 * Resolves to exactly the twelve-member union
 * `'SwProduct' | 'SwSku' | 'SwProductType' | 'SwBrand' | 'SwOption' | 'SwOptionGroup' |
 * 'SwSkuOption' | 'SwSkuAccessContent' | 'SwSkuSubsBenefit' | 'SwSkuRenewalSubsBenefit' |
 * 'SwRelatedProduct' | 'SwAlternateSkuCode'`, derived from {@link PHYSICAL_TABLE_NAMES} rather than
 * written out a second time.
 *
 * Being a type rather than a plain `string` is what makes the whitelist useful at compile time: a
 * function that takes a `PhysicalTableName` cannot be handed an unvalidated identifier, and the only
 * way to obtain one from caller input is {@link assertTableName}.
 */
export type PhysicalTableName = (typeof PHYSICAL_TABLE_NAMES)[number];

/**
 * The application key the framework prefixes onto an entity name to form its logical form.
 *
 * `org/Hibachi/HibachiDAO.cfc` compares against `getApplicationKey()` at `:L8`, `:L30`, `:L40`, `:L81`
 * and `:L104` and prepends it when absent; the six `entityname` values in the D22 table above are the
 * observed result, so the key is this literal. Held lower-cased because it is only ever compared
 * against a lower-cased candidate — this value is never emitted into a statement.
 */
const LOGICAL_NAME_PREFIX = 'slatwall';

/**
 * The number of leading characters of a physical name that form its schema prefix.
 *
 * Every physical name begins `Sw`, so the bare name the framework would have prefixed is the
 * remainder. Named rather than inlined so the derivation below reads as a rule instead of a magic
 * offset; it is not a tunable and not a capacity figure.
 */
const PHYSICAL_NAME_PREFIX_LENGTH = 2;

/**
 * Every column each in-scope physical table declares, harvested from the entity `property` blocks.
 *
 * WHY A COLUMN WHITELIST IS NEEDED AT ALL. `model/dao/ProductDAO.cfc:L385-L387` derives a column name
 * at RUN TIME with `listLast(arguments.lookupColumn,'_')`, so an uploaded file heading such as
 * `product_productCode` becomes the identifier `productCode` inside statement text; `:L393-L395` then
 * interpolates an entire hand-assembled `SET` clause as text, and `:L412` interpolates a hand-assembled
 * column list. A `?` placeholder binds values only and cannot substitute an identifier, so an identifier
 * that originates in file content has to be checked against something. This is that something.
 *
 * HOW THE SETS WERE DERIVED, so a reader can re-verify each one against the source. A column exists
 * for a scalar persistent `property` under its own name, and for a `many-to-one` property under its
 * declared `fkcolumn`. A `one-to-many` property contributes NO column to this table, because the
 * foreign key lives on the far side; a `many-to-many` property contributes none either, because its
 * keys live in its `linktable`. A `persistent="false"` property contributes none by definition —
 * `model/entity/Product.cfc:L102-L123` declares twenty of those and `model/entity/Sku.cfc:L99-L121`
 * declares twenty-three, and none is a column.
 *
 * The four audit members are present on all six entity tables because every one of them declares
 * `createdDateTime`, `createdByAccount`, `modifiedDateTime` and `modifiedByAccount`, the two account
 * members contributing `createdByAccountID` and `modifiedByAccountID` through their `fkcolumn`. They
 * are absent from the link table, which declares no properties of its own.
 *
 * IMMUTABILITY. The outer object is frozen and each member is typed `ReadonlySet`, so nothing can add
 * a table or a column after load. This is a constant, not a cache: it is fully populated when the
 * module is evaluated and never written to again, which is what keeps it clear of the M7 prohibition
 * on run-time accumulation in a shared execution boundary.
 */
const TABLE_COLUMNS: Readonly<Record<PhysicalTableName, ReadonlySet<string>>> = Object.freeze({
  /* model/entity/Product.cfc — scalars :L52-L59, calculated persistent :L62-L65, many-to-one
   * :L68-L70, remote identifier :L93, audit :L96-L99. */
  SwProduct: new Set([
    'productID',
    'activeFlag',
    'urlTitle',
    'productName',
    'productCode',
    'productDescription',
    'publishedFlag',
    'sortOrder',
    'calculatedSalePrice',
    'calculatedQATS',
    'calculatedAllowBackorderFlag',
    'calculatedTitle',
    'brandID',
    'productTypeID',
    'defaultSkuID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* model/entity/Sku.cfc — scalars :L52-L59, calculated persistent :L62, many-to-one :L65-L66,
   * remote identifier :L90, audit :L93-L96. */
  SwSku: new Set([
    'skuID',
    'activeFlag',
    'skuCode',
    'listPrice',
    'price',
    'renewalPrice',
    'imageFile',
    'userDefinedPriceFlag',
    'calculatedQATS',
    'productID',
    'subscriptionTermID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* model/entity/ProductType.cfc — scalars :L52-L59, self-referencing many-to-one :L62, remote
   * identifier :L80, audit :L83-L86. */
  SwProductType: new Set([
    'productTypeID',
    'productTypeIDPath',
    'activeFlag',
    'publishedFlag',
    'urlTitle',
    'productTypeName',
    'productTypeDescription',
    'systemCode',
    'parentProductTypeID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* model/entity/Brand.cfc — scalars :L52-L57, remote identifier :L74, audit :L77-L80. Brand
   * declares no non-persistent property at all, so its column set is its whole surface. */
  SwBrand: new Set([
    'brandID',
    'activeFlag',
    'publishedFlag',
    'urlTitle',
    'brandName',
    'brandWebsite',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* model/entity/Option.cfc — scalars :L52-L56, many-to-one :L59-L60, remote identifier :L73,
   * audit :L76-L79. `sortOrder` at :L56 carries `sortContext="optionGroup"`, which is why the
   * sort-order helper at org/Hibachi/HibachiDAO.cfc:L149-L168 needs a context column at all. */
  SwOption: new Set([
    'optionID',
    'optionCode',
    'optionName',
    'optionDescription',
    'sortOrder',
    'optionGroupID',
    'defaultImageID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* model/entity/OptionGroup.cfc — scalars :L52-L58, remote identifier :L61, audit :L64-L67. */
  SwOptionGroup: new Set([
    'optionGroupID',
    'optionGroupName',
    'optionGroupCode',
    'optionGroupImage',
    'optionGroupDescription',
    'imageGroupFlag',
    'sortOrder',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* The link table has exactly two columns and no audit members, taken from the owning declaration
   * at model/entity/Sku.cfc:L76 (`fkcolumn="skuID" inversejoincolumn="optionID"`). Both are named in
   * the sorted-SKU statement at model/dao/SkuDAO.cfc:L184 and :L186, and in the existence sub-queries
   * the option-to-SKU resolver composes. */
  SwSkuOption: new Set(['skuID', 'optionID']),

  /* `model/entity/Sku.cfc:L77` — `accessContents`, `linktable="SwSkuAccessContent"`,
   * `fkcolumn="skuID"`, `inversejoincolumn="contentID"`. Note the far column is `contentID` and NOT
   * `accessContentID`: the collection is named for the ROLE it plays on the SKU, while the column names
   * the entity it points at. Deriving the column from the property name would produce a column that
   * does not exist. Two columns, no audit members, exactly as the sibling link tables. */
  SwSkuAccessContent: new Set(['skuID', 'contentID']),

  /* `model/entity/Sku.cfc:L78` — `subscriptionBenefits`, `linktable="SwSkuSubsBenefit"`,
   * `fkcolumn="skuID"`, `inversejoincolumn="subscriptionBenefitID"`. The table name is ABBREVIATED
   * where the column name is not; both are verbatim from the declaration and neither may be
   * regularised to match the other. */
  SwSkuSubsBenefit: new Set(['skuID', 'subscriptionBenefitID']),

  /* `model/entity/Sku.cfc:L79` — `renewalSubscriptionBenefits`, `linktable="SwSkuRenewalSubsBenefit"`,
   * `fkcolumn="skuID"`, `inversejoincolumn="subscriptionBenefitID"`.
   *
   * ⚠️ THE FAR COLUMN IS IDENTICAL TO THE SIBLING ABOVE, and that is correct rather than a copy-paste
   * error: both collections point at the same entity and are distinguished by their TABLE, not by their
   * column. A SKU can therefore carry the same benefit identifier in both roles, and the two rows live
   * in two different tables. */
  SwSkuRenewalSubsBenefit: new Set(['skuID', 'subscriptionBenefitID']),

  /* `model/entity/Product.cfc:L81` — `relatedProducts`, `linktable="SwRelatedProduct"`,
   * `fkcolumn="productID"`, `inversejoincolumn="relatedProductID"`.
   *
   * ⚠️ SELF-REFERENCING, SO BOTH COLUMNS POINT AT `SwProduct`. That is what makes this the ONE
   * many-to-many of `model/entity/Product.cfc:L79-L90` whose far side is in scope: every other one
   * names `Content`, `Category`, `PromotionReward`, `PromotionQualifier`, `PriceGroupRate`, `Vendor`
   * or `Physical`, all excluded outright by AAP §0.2.2.1, and their tables are deliberately absent
   * from this whitelist — `MySqlProductPersistence.ts` reaches them through a declared collaborator
   * instead (TR-5) rather than naming an excluded family's table here.
   *
   * ⚠️ THE DECLARATION CARRIES NO `inverse="true"`, so a product OWNS the rows whose `productID` is
   * its own and does NOT own the rows whose `relatedProductID` is. The removal path reproduces that
   * asymmetry exactly; see the note on the product removal member. */
  SwRelatedProduct: new Set(['productID', 'relatedProductID']),

  /* model/entity/AlternateSkuCode.cfc — identifier :L52, scalar :L53, the two many-to-one foreign
   * keys :L56 and :L57, audit :L60-L63. Note the first foreign key is `skuTypeID` and NOT
   * `alternateSkuCodeTypeID`: `:L56` declares the property `alternateSkuCodeType` with
   * `fkcolumn="skuTypeID"`, so the column name does not follow the property name. Deriving it by
   * convention would produce a column that does not exist. This table carries no `remoteID`. */
  SwAlternateSkuCode: new Set([
    'alternateSkuCodeID',
    'alternateSkuCode',
    'skuTypeID',
    'skuID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),
});

/**
 * Builds the case-insensitive lookup that resolves any accepted spelling to its physical name.
 *
 * Three keys are registered per table, mirroring the three vocabularies the legacy tree actually
 * produces: the physical name, the logical name the framework's prefixing sites synthesise, and the
 * bare name those sites accept as input. All three map to the same physical name, so a caller may pass
 * whichever form its legacy counterpart passed and still get an identifier a statement can carry.
 *
 * The bare names are mutually distinct across the twelve tables, so no key is ever registered twice and
 * no resolution is ambiguous. It is a plain function rather than a lazily initialised accessor because
 * it must run exactly once, at module evaluation, and produce a value that never changes afterwards.
 *
 * @returns the completed lookup, keyed by lower-cased candidate.
 */
function buildTableNameLookup(): ReadonlyMap<string, PhysicalTableName> {
  const lookup = new Map<string, PhysicalTableName>();

  for (const physicalName of PHYSICAL_TABLE_NAMES) {
    const bareName = physicalName.slice(PHYSICAL_NAME_PREFIX_LENGTH).toLowerCase();

    lookup.set(physicalName.toLowerCase(), physicalName);
    lookup.set(`${LOGICAL_NAME_PREFIX}${bareName}`, physicalName);
    lookup.set(bareName, physicalName);
  }

  return lookup;
}

/**
 * Builds one case-insensitive column index per table from the declared column sets.
 *
 * Each index maps a lower-cased candidate to the canonical casing the schema declares, so an
 * identifier derived from file content — see {@link TABLE_COLUMNS} for how that happens — resolves to
 * the spelling the schema actually uses rather than to whatever casing the file supplied.
 *
 * Written as one explicit member per table rather than a loop over the keys, so the return type's
 * `Record` over the table union proves exhaustiveness at compile time and no type assertion is needed
 * anywhere in the derivation. Adding a table to {@link PHYSICAL_TABLE_NAMES} therefore fails to compile
 * until it is declared here too, which is how the three SKU link tables were added safely.
 *
 * @param declarations - the declared column sets, normally {@link TABLE_COLUMNS}.
 * @returns one frozen, fully populated index per table.
 */
function buildColumnLookup(
  declarations: Readonly<Record<PhysicalTableName, ReadonlySet<string>>>,
): Readonly<Record<PhysicalTableName, ReadonlyMap<string, string>>> {
  const indexFor = (columnNames: ReadonlySet<string>): ReadonlyMap<string, string> => {
    const index = new Map<string, string>();
    for (const columnName of columnNames) {
      index.set(columnName.toLowerCase(), columnName);
    }
    return index;
  };

  return Object.freeze({
    SwProduct: indexFor(declarations.SwProduct),
    SwSku: indexFor(declarations.SwSku),
    SwProductType: indexFor(declarations.SwProductType),
    SwBrand: indexFor(declarations.SwBrand),
    SwOption: indexFor(declarations.SwOption),
    SwOptionGroup: indexFor(declarations.SwOptionGroup),
    SwSkuOption: indexFor(declarations.SwSkuOption),
    SwSkuAccessContent: indexFor(declarations.SwSkuAccessContent),
    SwSkuSubsBenefit: indexFor(declarations.SwSkuSubsBenefit),
    SwSkuRenewalSubsBenefit: indexFor(declarations.SwSkuRenewalSubsBenefit),
    SwRelatedProduct: indexFor(declarations.SwRelatedProduct),
    SwAlternateSkuCode: indexFor(declarations.SwAlternateSkuCode),
  });
}

/** The resolved table-name lookup, built once at module evaluation and never mutated. */
const TABLE_NAME_LOOKUP: ReadonlyMap<string, PhysicalTableName> = buildTableNameLookup();

/** The resolved per-table column indexes, built once at module evaluation and never mutated. */
const TABLE_COLUMN_LOOKUP: Readonly<Record<PhysicalTableName, ReadonlyMap<string, string>>> =
  buildColumnLookup(TABLE_COLUMNS);

/**
 * Validates a table name against the extracted Catalog schema and returns its physical form.
 *
 * This is the ONLY sanctioned way to place a table identifier into statement text anywhere in this
 * adapter folder. A `?` placeholder binds a value and cannot substitute an identifier, so the legacy's
 * identifier interpolations have no parameterized equivalent; a validated whitelist is the substitute,
 * and refusing an unknown name is the property that makes it one.
 *
 * ⭐ THE SITES ARE ENUMERATED RATHER THAN COUNTED, because a bare count in a comment is a fact that
 * drifts and cannot be checked. `model/dao/ProductDAO.cfc` interpolates an identifier in exactly THREE
 * statements, NINE positions between them, all inside the private import writer:
 *   - `:L386` — `SELECT #arguments.idColumn# FROM #arguments.tableName#
 *     WHERE #listLast(arguments.lookupColumn,'_')#`: one table, two columns.
 *   - `:L394` — `UPDATE #arguments.tableName# SET #updateSetString# WHERE #arguments.idColumn#`: one
 *     table, one assembled column list, one column.
 *   - `:L412` — `INSERT INTO #arguments.tableName# (#insertColumns##arguments.idColumn#)`: one table,
 *     one assembled column list, one column.
 * Every other statement in that file names its table as a LITERAL — `:L193`, `:L207` and the external
 * content-management table at `:L261-L264` among them — so those need no whitelist to be safe, only
 * D18's parameterisation of the VALUES they compare against.
 *
 * ACCEPTS, case-insensitively and after trimming surrounding whitespace:
 *   - a physical name, returned unchanged — `'SwProduct'` to `'SwProduct'`;
 *   - a logical name, normalised — `'SlatwallProduct'` to `'SwProduct'`, which is what makes the
 *     literals at `model/dao/ProductDAO.cfc:L193` and `:L207` usable;
 *   - a bare name, normalised — `'product'` to `'SwProduct'`, mirroring the framework's own
 *     acceptance of an unprefixed name at the five sites listed in the D22 block above.
 *
 * REFUSES everything else, including a table that exists in the wider `Sw*` schema but outside this
 * slice, and including the external content-management table at `model/dao/ProductDAO.cfc:L261-L264`.
 * It never falls through and never returns its input: a name it does not recognise cannot reach
 * statement text by any path.
 *
 * @param candidate - a table name in any of the three accepted vocabularies.
 * @returns the canonical physical table name, safe to place into statement text.
 * @throws {DomainError} when the name is not one of the twelve in-scope tables. The candidate travels
 *   on the error's `context` for a server-side log; the presentation this error type reports to a
 *   caller is deliberately neutral, so a caller cannot use the refusal to enumerate the schema.
 *
 * @example
 * ```ts
 * const table = assertTableName('SlatwallSku'); // 'SwSku'
 * const sql = `SELECT skuID FROM ${table} WHERE productID = ?`;
 * const rows = await executor.execute(sql, [productId]);
 * ```
 */
export function assertTableName(candidate: string): PhysicalTableName {
  const resolved = TABLE_NAME_LOOKUP.get(candidate.trim().toLowerCase());

  if (resolved === undefined) {
    throw new DomainError(
      'A statement named a table that the extracted Catalog schema does not contain, so it was ' +
        'refused before any statement text was assembled.',
      { context: { candidate } },
    );
  }

  return resolved;
}

/* ================================================================================================
 * TODO(parity) D8 — THE DIALECT BRANCH IS COLLAPSED AS A DOCUMENTED DECISION, NOT RESOLVED
 * ================================================================================================
 * `model/dao/SkuDAO.cfc:L177` carries one of only three literal TODO comments in the whole slice,
 * immediately above the sorted-SKU statement, recording that the statement is UNTESTED against
 * anything other than Microsoft SQL Server and MySQL. The branch it guards is at `:L194-L197`: an
 * ordering expression cast through `bigint` on one engine and left uncast on the other. Two further
 * branches on the same run-time value sit at `model/dao/ProductDAO.cfc:L288` and `:L304`, and the
 * value itself comes from the probe at `config/configORM.cfm:L8-L14`, which reads a database product
 * name and selects `MySQL`, `MicrosoftSQLServer` or `Oracle10g`.
 *
 * This port targets MySQL only, so there is no dialect type in this file, no branch on a
 * database-product value, no per-engine statement variant and no separate dialect module for one to
 * live in. Targeting a single engine is CONSISTENT WITH THE UNTESTED STATE the TODO records rather
 * than a resolution of it: the other engines were never verified before and are not verified now, so
 * the comment is carried forward here instead of being deleted along with the branch.
 *
 * The one thing this file does about it is refuse to make the collapse invisible. There is no seam a
 * later reader could mistake for engine-neutrality, and nothing in the whitelist above varies by
 * engine — the identifiers it emits are the same twelve names on every engine that has the schema.
 * ============================================================================================== */

/**
 * Validates a column name against one table's declared columns and returns its canonical casing.
 *
 * The companion to {@link assertTableName}, and needed for the same reason plus one of its own: the
 * importer does not merely name columns, it DERIVES them from uploaded file content at
 * `model/dao/ProductDAO.cfc:L385-L387` and assembles them into statement text at `:L393-L395` and
 * `:L412`. An identifier whose origin is a file heading has to be checked against the schema before it
 * can be emitted, and the table it belongs to is part of that check — `skuCode` is a column of SwSku
 * and of nothing else, so a per-table index catches a well-formed name applied to the wrong table.
 *
 * The `table` parameter is typed {@link PhysicalTableName} rather than `string`, so the only way to
 * reach this function is with a name {@link assertTableName} has already validated. That ordering is
 * enforced by the compiler rather than by convention.
 *
 * @param table - the validated physical table the column must belong to.
 * @param candidate - a column name in any casing, with surrounding whitespace tolerated.
 * @returns the column name in the exact casing the entity declaration uses.
 * @throws {DomainError} when the table does not declare that column. Both the table and the candidate
 *   travel on the error's `context`; neither is disclosed to a caller.
 *
 * @example
 * ```ts
 * // 'product_productCode' arrives as a file heading; the importer takes its last segment.
 * const column = assertColumnName('SwProduct', 'productcode'); // 'productCode'
 * ```
 */
/**
 * Every column the extracted schema declares on one table, in declaration order.
 *
 * WHY THIS IS EXPOSED. `./SmartListQueryBuilder` must project a JOINED entity's columns under an
 * alias prefix in order to materialise an association — the legacy gets the same data by selecting the
 * base entity and letting the mapping layer lazily load the rest [`org/Hibachi/HibachiSmartList.cfc:L521`],
 * which a stateless port cannot do. Naming those columns requires knowing them, and
 * {@link TABLE_COLUMNS} is already the single place this subtree declares them. Re-listing them in the
 * builder would create a second declaration free to drift from this one.
 *
 * The returned array is frozen and rebuilt per call, so no caller can mutate the registry through it.
 * The set's own iteration order is the order the columns are declared in, which keeps generated
 * statement text stable and therefore diffable between runs.
 *
 * @param table - A table name already validated by {@link assertTableName}.
 * @returns That table's declared columns. Never empty, because every entry of {@link TABLE_COLUMNS}
 *   declares at least a primary key.
 */
export function columnsForTable(table: PhysicalTableName): readonly string[] {
  return Object.freeze([...TABLE_COLUMNS[table]]);
}

export function assertColumnName(table: PhysicalTableName, candidate: string): string {
  const resolved = TABLE_COLUMN_LOOKUP[table].get(candidate.trim().toLowerCase());

  if (resolved === undefined) {
    throw new DomainError(
      'A statement named a column that the extracted Catalog schema does not declare on the table ' +
        'it was applied to, so it was refused before any statement text was assembled.',
      { context: { table, candidate } },
    );
  }

  return resolved;
}

/* ================================================================================================
 * BOUND VALUES — THE OTHER HALF OF S2, AND THE REASON THE PUBLIC BOUNDARY IS `unknown`
 * ============================================================================================== */

/**
 * Narrows one unknown parameter to a bindable scalar.
 *
 * THE UNION IS `BoundValue`, DECLARED ONCE IN src/config/database.ts AND IMPORTED HERE. An earlier
 * revision of this file declared its own local copy, on the reasoning that the narrowing belongs at
 * the driver boundary and that exporting a union would invite callers to pre-narrow. The first half of
 * that reasoning still holds and is why this function exists; the second half turned out to argue for
 * the opposite of what it did. Three near-identical unions had come into being — one here, one in
 * `./UnitOfWork`, and the one on the injected pool type — and the pool's copy omitted `bigint` while
 * these two admitted it. Since the pool is what actually binds, a divergence between them was a real
 * hazard rather than a cosmetic one. The single declaration is the contract now; callers still declare
 * `readonly unknown[]`, and this is still the one place the narrowing happens.
 *
 * WHY THOSE SIX SHAPES AND NOTHING ELSE. Each corresponds to a value shape an in-scope statement
 * actually binds: `string` for the thirty-two-character identifiers and the codes, `number` for the
 * sort orders and the money and quantity columns, `boolean` for the flag columns, `Date` for the two
 * audit timestamps the importer supplies from `now()` at `model/dao/ProductDAO.cfc:L152`, and `null`
 * for a nullable column being cleared. `bigint` belongs because the money columns are declared
 * `big_decimal` at `model/entity/Sku.cfc:L55-L57` and a caller carrying one exactly is binding a
 * legitimate scalar, not an exotic one.
 *
 * WHY A NESTED LIST IS NOT A MEMBER, even though the driver's own value type permits one. Prepared
 * execution binds ONE value per placeholder and does not expand a list into a placeholder group; the
 * expansion the legacy code relied on came from `cfqueryparam … list="true"`, at
 * `model/dao/OptionDAO.cfc:L68` and `:L106`. Reproducing it means the CALLER emitting one `?` per
 * element and binding each element separately, which is what AAP 0.3.2 requires, so a nested list
 * arriving here is a composition mistake and is refused rather than silently flattened.
 *
 * WHY `undefined` IS NOT A MEMBER, and this is the one that would bite. The domain layer expresses a
 * CFML null by DELETING a key rather than assigning `undefined` — the convention
 * `src/domain/base/populate.ts` implements — so an `undefined` reaching a bind position means a value
 * was read from a field that is genuinely absent, and binding it as SQL NULL would invent a value the
 * caller never had. It is refused, and the refusal names the position.
 */
export type BoundParameterValue = string | number | bigint | boolean | Date | null;

/**
 * Narrows one unknown parameter to a bindable scalar.
 *
 * A type predicate rather than an inline check so the narrowing is expressed once and the caller's
 * loop stays free of assertions. `Date` is tested with `instanceof` because the driver formats a date
 * object rather than its string form, and a date rendered to text by a caller would bind as a string
 * and silently depend on the session's date format.
 *
 * @param candidate - one element of a caller-supplied parameter list.
 * @returns `true` when the value can be bound to a `?` placeholder as-is.
 */
function isBoundParameterValue(candidate: unknown): candidate is BoundParameterValue {
  return (
    candidate === null ||
    typeof candidate === 'string' ||
    typeof candidate === 'number' ||
    typeof candidate === 'bigint' ||
    typeof candidate === 'boolean' ||
    candidate instanceof Date
  );
}

/**
 * Narrows a whole parameter list to bindable scalars, preserving order exactly.
 *
 * ORDER IS THE POINT (TR-4). The legacy form is `ormExecuteQuery(hql, positionalParams)`, and the
 * option-to-SKU resolver at `model/dao/SkuDAO.cfc:L106-L128` appends one placeholder and one parameter
 * per selected option inside the same loop, then appends the product identifier last at `:L124-L126`.
 * The bound list is therefore positional in the legacy sense and this function copies it index for
 * index — it never sorts, deduplicates, compacts or reorders, and it never drops an element, because
 * every one of those would silently rebind the statement.
 *
 * A single pass with an indexed loop rather than `map`, so a refusal can name the position that failed
 * without a second traversal.
 *
 * @param params - the caller's parameter list, in legacy positional order.
 * @returns a new list of the same length and order, typed for the driver.
 * @throws {DomainError} when any element is not a bindable scalar. The position and the offending
 *   value's runtime type travel on `context`; the value itself deliberately does not, because a bound
 *   parameter can hold data that has no business in an error object.
 */
function toBoundValues(params: readonly unknown[]): BoundParameterValue[] {
  const values: BoundParameterValue[] = [];

  for (let index = 0; index < params.length; index += 1) {
    const candidate = params[index];

    if (!isBoundParameterValue(candidate)) {
      throw new DomainError(
        'A bound parameter is not one of the scalar shapes this port binds, so the statement was ' +
          'not prepared. Bind one value per placeholder; a list must be expanded by the caller.',
        {
          context: {
            position: index,
            parameterCount: params.length,
            valueType: candidate === undefined ? 'undefined' : typeof candidate,
          },
        },
      );
    }

    values.push(candidate);
  }

  return values;
}

/**
 * Reads the affected-row count from a write acknowledgement, without asserting the driver's type.
 *
 * The driver answers a write with an acknowledgement object rather than a list of rows, so the read
 * path's own narrowing legitimately refuses it and the mutation path has to look at the value itself.
 * The narrowing is done with `in` rather than a type assertion: once the value is known to be a
 * non-list object, membership of the property is enough for the compiler to expose it as `unknown`,
 * which is then checked like any other unknown. No assertion, no cast and no non-null operator appear
 * anywhere in the path.
 *
 * A list is rejected explicitly, before the property test, because a read statement routed into the
 * mutation path returns a list of rows — and a list happens to be an object, so omitting the check
 * would let a read masquerade as a write that affected nothing.
 *
 * ⭐ EXPORTED FOR ONE CONSUMER, AND FOR A REASON THAT MATTERS. `UnitOfWork.ts` builds its own
 * connection-bound executor rather than using this class, because that executor must close over the
 * pooled connection a transaction was begun on (M6). Its write member needs exactly this narrowing, and
 * a second copy of it there would be a second place for the driver's write-acknowledgement shape to be
 * described — the duplicated-grammar hazard `src/ports/SmartListQueryPort.ts` records against
 * `parseRangeValue`, where two copies of one rule drifted in two observable ways before anyone noticed.
 * One owner, two callers.
 *
 * @param driverResult - whatever the driver returned, unnarrowed.
 * @returns the affected-row count, or `undefined` when the value is not a write acknowledgement.
 */
export function readAffectedRows(driverResult: unknown): number | undefined {
  if (typeof driverResult !== 'object' || driverResult === null || Array.isArray(driverResult)) {
    return undefined;
  }

  if (!('affectedRows' in driverResult)) {
    return undefined;
  }

  const affectedRows: unknown = driverResult.affectedRows;

  return typeof affectedRows === 'number' && Number.isInteger(affectedRows) && affectedRows >= 0
    ? affectedRows
    : undefined;
}

/**
 * Reads the affected-row count from a write acknowledgement, or refuses.
 *
 * ⚠️ EXPORTED FOR THE SECOND DRIVER BOUNDARY, AND FOR NOTHING ELSE. There are exactly two objects in
 * this port that speak to the driver: {@link QueryRunner}, which runs on the pool, and the
 * transaction-scoped executor `UnitOfWork.ts` builds on a checked-out connection. Both must narrow a
 * write answer the same way, because "how many rows did this write affect, and what happens when the
 * driver did not answer with an acknowledgement at all" is one rule rather than two. Duplicating the
 * refusal would let the two boundaries drift, and a boundary that quietly reported zero for a
 * misrouted statement is precisely the failure {@link readAffectedRows} exists to prevent.
 *
 * The PARAMETER narrowing is deliberately NOT shared in the same way — each boundary keeps its own,
 * for the reason `UnitOfWork.ts` records on its copy: narrowing at every boundary that actually speaks
 * to the driver is what keeps every boundary closed. This function narrows a RESULT, which is a single
 * fact about the driver's answer, exactly as the sibling row narrowing in `rowMappers.ts` is.
 *
 * @param driverResult - whatever the driver returned, unnarrowed.
 * @param parameterCount - how many values the statement bound, for the diagnostic record only. The
 *   values themselves deliberately never travel, because a bound parameter can hold data that has no
 *   business in an error object.
 * @returns the number of rows the statement affected, which may legitimately be zero.
 * @throws {DataIntegrityError} when the driver's answer is not a write acknowledgement — most often a
 *   read statement routed into a write path, which would otherwise silently report zero rows affected.
 */
export function requireAffectedRows(driverResult: unknown, parameterCount: number): number {
  const affectedRows = readAffectedRows(driverResult);

  if (affectedRows === undefined) {
    throw new DataIntegrityError(
      'A writing statement did not produce a write acknowledgement, so the number of rows it ' +
        'affected could not be read.',
      { context: { parameterCount } },
    );
  }

  return affectedRows;
}

/**
 * Narrows a single projected column value to a whole, non-negative count.
 *
 * Three input shapes are accepted because all three genuinely occur. MySQL types `COUNT()` and
 * `MAX()` as an integer wide enough to need care, and the driver may hand it over as a number, as
 * text, or as an exact integer depending on how the connection was configured — none of which is a
 * choice this file makes or should depend on. Anything else, and any value that is not a whole number
 * a count could be, is refused.
 *
 * Non-negativity and whole-ness are properties of counting itself rather than limits introduced here:
 * the legacy comparison is `results[1] eq 0` at `model/dao/SkuDAO.cfc:L93` and the legacy default is
 * `COALESCE(max(sortOrder), 0)` at `org/Hibachi/HibachiDAO.cfc:L158`, so zero is the floor in both.
 *
 * @param projected - the single column value the counting statement produced.
 * @returns the count as a number.
 * @throws {DataIntegrityError} when the value cannot be read as a whole, non-negative count.
 */
function toCount(projected: unknown): number {
  if (typeof projected === 'number' && Number.isInteger(projected) && projected >= 0) {
    return projected;
  }

  if (
    typeof projected === 'bigint' &&
    projected >= 0n &&
    projected <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(projected);
  }

  if (typeof projected === 'string' && /^\d+$/.test(projected)) {
    const parsed = Number(projected);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  throw new DataIntegrityError(
    'A counting statement produced a value that cannot be read as a whole, non-negative count, so ' +
      'no count could be reported.',
    { context: { valueType: typeof projected } },
  );
}

/* ================================================================================================
 * BOUNDED READS — THE SHARED MECHANICS OF THE EXPLICITLY BOUNDED REPOSITORY MEMBERS
 * ================================================================================================
 * `src/ports/repositories/BoundedRead.ts` declares the caller-facing vocabulary and states the two
 * contracts these helpers implement: nothing truncates silently, and no bound is ever defaulted. The
 * mechanics live here, in the module every repository in this folder already imports for its
 * identifier whitelists, so that the four bounded members share ONE implementation of the
 * one-extra-row probe rather than four chances to disagree about it.
 *
 * Neither helper imports the port's types. They are declared structurally over `{ limit, offset }`,
 * which the port's window satisfies, so the adapter layer gains no dependency on a port type and the
 * port keeps no knowledge of how the bound is applied.
 * ============================================================================================== */

/**
 * A validated bound, with the probe size the adapter actually asks the database for.
 *
 * Produced by {@link prepareBoundedRead} and consumed at the binding site. `probeLimit` exists so the
 * "is there more?" question is answered by the database rather than guessed: it is always
 * `limit + 1`.
 */
export interface PreparedBoundedRead {
  /** The caller's row ceiling, validated. The returned array never exceeds it. */
  readonly limit: number;
  /** The caller's zero-based offset, validated. */
  readonly offset: number;
  /** `limit + 1` — bound to the statement's `LIMIT` so one row past the window can be detected. */
  readonly probeLimit: number;
  /**
   * The two values to append to the bound list, in `LIMIT ? OFFSET ?` order, already in the form the
   * driver accepts for a row-count placeholder.
   *
   * Present so no caller has to remember {@link toRowCountBinding}: appending this pair is the only
   * supported way to bind the window, and it makes binding `probeLimit` directly — which fails at run
   * time and nowhere earlier — impossible to reach by accident.
   */
  readonly boundValues: readonly [string, string];
}

/**
 * Converts a validated row count into the form the driver accepts in a `LIMIT` or `OFFSET` position.
 *
 * ⚠️⚠️ THIS EXISTS BECAUSE OF A MEASURED DRIVER CONSTRAINT, NOT A STYLE PREFERENCE, AND BINDING A
 * NUMBER INSTEAD FAILS AT RUN TIME WITH NOTHING FAILING EARLIER. Against the pinned toolchain —
 * `mysql2@3.23.2` speaking to MySQL 8.4 — a true server-side prepared statement rejects a NUMBER bound
 * to a row-count placeholder:
 *
 *     execute('SELECT id FROM t ORDER BY id LIMIT ? OFFSET ?', [2, 1])
 *       -> ER_WRONG_ARGUMENTS (errno 1210) "Incorrect arguments to mysqld_stmt_execute"
 *     execute('SELECT id FROM t ORDER BY id LIMIT ? OFFSET ?', ['2', '1'])
 *       -> the expected two rows
 *
 * Both forms compile, both type-check, and both pass every test in this repository, because no test
 * reaches a database — AAP §0.6.5.2 records that the whole suite runs against hand-written doubles. The
 * failure is therefore invisible until a real connection is used, which is precisely why the
 * conversion is centralised here and named after the constraint rather than left at each call site.
 *
 * NOTHING SEMANTIC CHANGES. `LIMIT '3'` and `LIMIT 3` select the same rows; the server coerces the
 * operand. The value converted here is always one this module has already validated as a non-negative
 * safe integer, or a paging figure the smart list has validated the same way, so the text produced can
 * only ever be a run of digits.
 *
 * THE ALTERNATIVES WERE CONSIDERED AND REFUSED. Writing the number into the statement text would put a
 * value in an identifier position and change the placeholder count, which S2 rules out even for a value
 * this side authored. Switching the paged reads to `query()` would abandon the true prepared statement
 * that AAP §0.4.1.7 names as this file's whole purpose. Widening the driver's accepted parameter union
 * to coerce every number would change how ORDINARY numeric comparisons bind, which is a far larger
 * behavioural surface than the two positions actually affected.
 *
 * @param value - a non-negative whole row count.
 * @returns the same count as decimal text, ready to bind.
 * @throws {DomainError} when the value is not a non-negative safe integer, so a `NaN` or a fraction
 *   cannot reach a `LIMIT` clause as the string `"NaN"`.
 */
export function toRowCountBinding(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      'A row-count placeholder can only be bound to a whole, non-negative number, and the value ' +
        'supplied is not one.',
      { context: { value } },
    );
  }

  return String(value);
}

/**
 * Validates a caller-stated bound and derives the probe size from it.
 *
 * ⚠️ IT RAISES RATHER THAN CLAMPING, DELIBERATELY. A clamped bound answers a different question than
 * the one asked and reports nothing about the substitution, which is the same silent-truncation
 * failure the bounded members exist to avoid. A caller that passed a fractional, zero, negative or
 * non-finite bound has a fault in it, and the fault is surfaced.
 *
 * NO DEFAULT IS SUPPLIED FOR EITHER FIELD, and none may be added. Any default would be a number the
 * legacy source does not state, which AAP §0.7.3 S9 and IR-12 both rule out — the legacy has no
 * bounded read at all to take a number from.
 *
 * `Number.isSafeInteger` is the test rather than `Number.isInteger`, because a value beyond the safe
 * integer range cannot survive the round trip through the driver's parameter binding intact, and a
 * bound that silently becomes a different bound is exactly what must not happen.
 *
 * @param window - the caller's window. Typed structurally so no port type is imported here.
 * @param member - the member name, for the error context. Callers pass their own qualified name.
 * @returns the validated bound together with its probe size.
 * @throws {DomainError} when `limit` is not a positive safe integer, or `offset` is not a
 *   non-negative safe integer.
 */
export function prepareBoundedRead(
  window: { readonly limit: number; readonly offset: number },
  member: string,
): PreparedBoundedRead {
  if (!Number.isSafeInteger(window.limit) || window.limit < 1) {
    throw new DomainError(
      'A bounded read needs a positive whole row limit, and the one supplied is not usable. It is ' +
        'refused rather than adjusted, because a substituted bound would answer a different ' +
        'question without saying so.',
      { context: { member, limit: window.limit, offset: window.offset } },
    );
  }

  if (!Number.isSafeInteger(window.offset) || window.offset < 0) {
    throw new DomainError(
      'A bounded read needs a whole, non-negative offset, and the one supplied is not usable. It is ' +
        'refused rather than adjusted, for the same reason the limit is.',
      { context: { member, limit: window.limit, offset: window.offset } },
    );
  }

  const probeLimit = window.limit + 1;

  return Object.freeze({
    limit: window.limit,
    offset: window.offset,
    probeLimit,
    boundValues: Object.freeze([
      toRowCountBinding(probeLimit),
      toRowCountBinding(window.offset),
    ] as const),
  });
}

/**
 * Splits a probe result into the window's rows and the verdict on what lies past it.
 *
 * The statement was bound with {@link PreparedBoundedRead.probeLimit}, so receiving more than `limit`
 * rows means at least one row exists past the window. The probe row is DISCARDED and never reaches the
 * caller, which is what keeps `rows.length <= limit` an invariant of every bounded member.
 *
 * ⚠️ `hasMore` IS OBSERVED, NOT INFERRED FROM A FULL WINDOW. A window that is exactly full is NOT
 * evidence of more rows: the match set may end precisely on the boundary. Reporting `hasMore` from
 * `rows.length === limit` would tell a caller to issue one guaranteed-empty follow-up read on every
 * exact-boundary result, and — worse — would report `true` for a complete answer. The extra row is
 * requested so the verdict is a fact.
 *
 * @typeParam Row - the mapped row type; this helper neither inspects nor transforms a row.
 * @param probed - the rows the probe statement returned, at most `limit + 1` of them.
 * @param limit - the caller's validated row ceiling.
 * @returns the window's rows and whether anything lies past them.
 */
export function settleBoundedRead<Row>(
  probed: readonly Row[],
  limit: number,
): { readonly rows: Row[]; readonly hasMore: boolean } {
  const hasMore = probed.length > limit;

  return {
    rows: hasMore ? probed.slice(0, limit) : [...probed],
    hasMore,
  };
}

/* ================================================================================================
 * THE INJECTABLE SEAM AND THE EXECUTION BOUNDARY
 * ============================================================================================== */

/**
 * The narrow READ contract every repository in this folder builds its dependency from.
 *
 * REPOSITORIES DEPEND ON THIS INTERFACE, NEVER ON {@link QueryRunner}. That is not a style preference;
 * it is what makes the folder testable at all. AAP 0.6.5.2 records that every repository test in this
 * port is NET-NEW, the legacy repository contains no mocking library of any kind, and the CFML runtime
 * cannot be reproduced in this environment — `meta/docker/slatwall-local-dev/` does not exist, and
 * MXUnit is not vendored, so the legacy suite cannot even be run for comparison. Consequently every
 * statement this folder composes has to be assertable WITHOUT a database, and the only way that works
 * is if the thing a repository executes through can be replaced by a plain object literal that records
 * the statement text and the bound list and returns canned rows.
 *
 * The interface is therefore deliberately one member wide. Widening it to the four members
 * {@link QueryRunner} publishes would make every hand-written double implement four, for no gain: a
 * single row and a count are both derivable from a list of rows, and those two convenience members
 * exist only to stop each repository re-deriving them.
 *
 * ⚠️ A WRITE IS THE ONE THING THAT IS *NOT* DERIVABLE FROM THIS MEMBER, so an adapter that writes names
 * a second member rather than reaching for this one. The read answer is normalised through
 * `rowMappers.ts` `toRows`, which RAISES on a write acknowledgement; that refusal is deliberate, and it
 * is why {@link ReadWriteSqlExecutor} below exists and why the three writing adapters in this folder
 * each declare a structurally identical two-member dependency of their own.
 *
 * @example
 * ```ts
 * // A complete test double, with no mocking library and no database.
 * const calls: { sql: string; params: readonly unknown[] }[] = [];
 * const executor: SqlExecutor = {
 *   execute(sql, params) {
 *     calls.push({ sql, params });
 *     return Promise.resolve([{ skuID: 'a'.repeat(32) }]);
 *   },
 * };
 * ```
 */
export interface SqlExecutor {
  /**
   * Runs one statement with its values bound positionally and returns the rows it produced.
   *
   * @param sql - the statement text, whose every value position is a `?` placeholder and whose every
   *   identifier came from {@link assertTableName} or {@link assertColumnName}.
   * @param params - the values to bind, in the legacy positional order (TR-4).
   * @returns the rows, in the order the statement produced them; empty when it matched nothing.
   */
  execute(sql: string, params: readonly unknown[]): Promise<MySqlRow[]>;
}

/* ================================================================================================
 * THE DRIVER PORT — DECLARED HERE BECAUSE THIS LAYER IS THE ONE THAT SPEAKS TO THE DRIVER
 * ================================================================================================
 * The three contracts below are the ONLY description of a connection pool that anything in
 * `src/adapters/mysql/**` depends on. They are declared by the consumer rather than imported from
 * the provider, and that direction is the whole point: `src/config/database.ts` owns the ONE
 * module-scope pool this subtree ever creates (AAP 0.4.1.3 — "Module-scope `mysql2` pool created
 * outside the handler for warm-invocation reuse"), and its exported `pool` SATISFIES these shapes
 * structurally without either file importing the other. So there is no import edge from an adapter
 * into the configuration layer, no import edge back, and — decisively — NO SECOND POOL: the
 * composition root wires `new QueryRunner(pool)` and `new UnitOfWork(pool)` against that single
 * export, exactly as `src/config/database.ts` documents.
 *
 * WHY THESE ARE NARROW RATHER THAN THE DRIVER'S OWN TYPES. Naming the driver's `Pool` here would
 * hand every adapter the driver's whole surface — `query` (client-side text substitution),
 * `end`, `changeUser`, `unprepare`, the event emitter — and the folder's central guarantee would
 * then rest on nobody happening to call any of it. Declaring the minimum instead makes the
 * guarantee a property of the type: the only execution member reachable from an adapter is
 * PREPARED execution, and there is nothing else to reach.
 *
 * WHERE THE PARAMETERISATION GUARANTEE LIVES (AAP 0.4.1.7 — this file is the "`pool.execute()`
 * wrapper enforcing parameterized binding"). The two halves below are NOT the same strength of
 * guarantee, and stating them as one sentence would claim more for this file than it can deliver.
 *
 * MECHANICALLY ENFORCED HERE, checkable by inspecting this folder alone:
 *   - PREPARED EXECUTION ONLY. Statement text arrives already composed and is executed at exactly two
 *     funnels, both inside this folder and both unavoidable: this class's
 *     {@link QueryRunner.runStatement} and `./UnitOfWork`'s transaction-scoped executor. Each refuses a
 *     blank statement and reaches the driver's prepared member, never its client-side substituting
 *     one — which is not named anywhere in this folder, not as a fallback and not behind a flag.
 *   - EVERY VALUE IS BOUND, NEVER INTERPOLATED. Parameters reach the driver only after a positional
 *     scalar narrowing that preserves TR-4 ordering and rejects anything unbindable. Neither funnel
 *     composes statement text, so no value has a path by which it could be concatenated into one.
 *   - THE TABLE HALF OF THE IDENTIFIER WHITELIST. {@link PhysicalTableName} is a literal union of the
 *     twelve names, so a member that takes one cannot be handed an unvalidated `string` at all: that
 *     rejection is the compiler's, not a convention.
 *
 * NOT ENFORCED HERE — A CALLER INVARIANT THIS FOLDER DEPENDS ON: {@link SqlExecutor.execute} takes
 *   `sql: string`, so it necessarily accepts complete statement text, and {@link assertColumnName}
 *   returns a bare `string`, so a validated column is indistinguishable in the type system from any
 *   other. Identifier safety in composed text is therefore upheld by the callers. The invariant,
 *   verified by reading the six repositories and `./SmartListQueryBuilder`, is that every identifier
 *   they emit is a compile-time literal, a {@link PhysicalTableName} from {@link assertTableName}, a
 *   column from {@link assertColumnName}, or an alias composed from those — never a value taken from
 *   caller input. The type system makes the intended path checkable and an accidental departure
 *   visible; it does not make a departure impossible.
 * ============================================================================================== */

/**
 * The prepared-execution surface, satisfied by a pool and by a pooled connection alike.
 *
 * ONE MEMBER, AND THAT IS THE FEATURE. A repository handed a value of this type can run a
 * statement and can do nothing else: it cannot begin, commit or roll back anything, cannot return a
 * connection under the boundary that owns it, and cannot route a read back through the pool and out
 * of the transaction it is supposed to be inside (M6).
 *
 * The value type it binds is deliberately the port's own {@link BoundParameterValue} list rather
 * than the driver's permissive parameter type, so a caller cannot hand the driver an object, an
 * array or `undefined` by widening its way past the narrowing this file performs.
 *
 * @remarks The driver's answer is intentionally typed as an unnarrowed tuple. The two callers narrow
 *   it in the two different ways the two kinds of statement need — a read through the sibling
 *   mapper's list narrowing, a write through the acknowledgement reader — and neither narrowing is
 *   expressible in terms of the other.
 */
export interface StatementRunner {
  /**
   * Runs one prepared statement.
   *
   * @param sql - the statement text, with one `?` in every value position.
   * @param values - the values to bind, already narrowed and in legacy positional order.
   * @returns the driver's answer: its result in the first position, its field metadata after it.
   */
  execute(sql: string, values: readonly BoundParameterValue[]): Promise<[unknown, unknown[]]>;
}

/**
 * A checked-out connection a transaction can be opened on, settled and then handed back.
 *
 * The members beyond {@link StatementRunner.execute} exist for `./UnitOfWork` and for nothing else;
 * no repository ever receives a value of this type, which is why no repository can settle a
 * transaction it did not open.
 *
 * `destroy` IS PART OF THE CONTRACT ON PURPOSE. A connection whose commit or roll-back itself
 * failed has an unknown transaction state, and returning it to a warm pool would hand that state to
 * the next caller. The boundary needs a way to take such a connection out of service rather than
 * recycle it, and this is that way.
 */
export interface TransactionalStatementRunner extends StatementRunner {
  /** Opens a transaction on this connection. */
  beginTransaction(): Promise<void>;

  /** Commits the open transaction. */
  commit(): Promise<void>;

  /** Rolls the open transaction back. */
  rollback(): Promise<void>;

  /** Returns a known-clean connection to the pool for re-use. */
  release(): void;

  /** Takes a connection of unknown state permanently out of service instead of recycling it. */
  destroy(): void;
}

/**
 * The pool: prepared execution without a transaction, plus the ability to check one connection out.
 *
 * This is the type the composition root's single exported pool is wired in as, and the only pool
 * description any adapter depends on.
 */
export interface StatementPool extends StatementRunner {
  /**
   * Checks out one connection for the caller to open a transaction on.
   *
   * @returns the connection, which the caller MUST settle and then release or destroy.
   */
  getConnection(): Promise<TransactionalStatementRunner>;
}

/**
 * The execution contract for a caller that both READS and WRITES on one connection.
 *
 * ⭐ THIS IS THE SHARED SHAPE A TRANSACTION BOUNDARY HANDS OUT. `SqlExecutor` above is read-shaped by
 * construction, not by preference: its answer is normalised into rows by `rowMappers.ts` `toRows`,
 * which RAISES when the driver returns a write acknowledgement instead of a row list. So a read member
 * genuinely cannot carry a write, and an object that must do both has to name both members. It is
 * declared here, once, next to the read contract and next to {@link requireAffectedRows}, because the
 * two objects that speak to the driver — {@link QueryRunner} on the pool, and the executor
 * `UnitOfWork.ts` binds to a checked-out connection — must publish the same pair.
 *
 * ⚠️ ONE EXECUTOR, NOT TWO, AND THAT IS THE WHOLE POINT. Both members run on the SAME connection, which
 * is what makes a write visible to a later read inside the same transaction. Splitting reads and writes
 * across two executors, or reaching past the injected one to the pool, breaks that visibility with no
 * error and no failing statement — the M6 read-back hazard `UnitOfWork.ts` documents in full.
 *
 * ⚠️ IT DOES NOT REPLACE THE ADAPTER-LOCAL DECLARATIONS, AND THE SITES ARE ENUMERATED RATHER THAN
 * COUNTED. An earlier revision of this paragraph named `MySqlSkuRepository.ts`,
 * `MySqlBrandRepository.ts` and `MySqlProductRepository.ts` as "the three" that declare their own. Two
 * of those three now ALIAS this name instead, and two files the paragraph never mentioned declare their
 * own — so the count was wrong in both directions. The measured census, folder-wide:
 *
 *   DECLARED STRUCTURALLY, FIVE TIMES, each reading `extends SqlExecutor` plus one `executeMutation`:
 *   {@link SqlMutationExecutor} here; `TransactionalSqlExecutor` in `UnitOfWork.ts`;
 *   `BrandStatementExecutor` in `MySqlBrandRepository.ts`; `ProductPersistenceExecutor` in
 *   `MySqlProductPersistence.ts`; and `ProductTypeStatementExecutor` in
 *   `MySqlProductTypeRepository.ts`, whose parameter is spelled `parameters` rather than `params` —
 *   which changes nothing, since compatibility here is structural and parameter names carry no weight.
 *
 *   ALIASED TO THIS NAME, THREE TIMES: {@link ReadWriteSqlExecutor} below, `SkuStatementExecutor` in
 *   `MySqlSkuRepository.ts` and `ProductStatementExecutor` in `MySqlProductRepository.ts`.
 *
 * THE FOUR SIBLING DECLARATIONS STAY, and the reason is about the MEMBER rather than the interface. Each
 * states the dependency next to the code that consumes it, so a test can satisfy the exact shape an
 * adapter names while importing nothing from here (AAP §0.7.3 S6) — and each attaches to
 * `executeMutation` a note only that file can make: `MySqlBrandRepository.ts` reads the affected-row
 * count against `CLIENT_FOUND_ROWS` withdrawal, `UnitOfWork.ts` explains why a transaction boundary's
 * writing member extends the read-only contract rather than restating a fresh pair. A type alias cannot
 * carry member documentation, so collapsing them would discard exactly that. Structural compatibility is
 * what lets ONE instance satisfy all eight names, so this is one contract stated where each caller needs
 * it — not eight behaviours to keep in step.
 *
 * It stays deliberately at TWO members rather than the four {@link QueryRunner} publishes: a caller
 * that wants a single row, or a count, can derive it from a row list, and the convenience members exist
 * only so each repository need not re-derive it.
 *
 * @example
 * ```ts
 * // A complete double, with no mocking library and no database.
 * const executor: ReadWriteSqlExecutor = {
 *   execute: (sql, params) => Promise.resolve([]),
 *   executeMutation: (sql, params) => Promise.resolve(1),
 * };
 * ```
 */
export type ReadWriteSqlExecutor = SqlMutationExecutor;

/* ⛔ THIS NAME WAS A SECOND, IDENTICAL `export interface` OF THE SHAPE {@link SqlMutationExecutor}
 * DECLARES, IN THIS SAME FILE, AND IT IS NOW AN ALIAS OF IT.
 *
 * Both declarations read `extends SqlExecutor` plus one `executeMutation(sql, params): Promise<number>`
 * member, so they were structurally indistinguishable and every value satisfying one satisfied the
 * other. Nothing detected it: they are separately-named interfaces, so this is not the same case as a
 * repeated name — the compiler has no reason to object, and `export` keeps the linter's unused-symbol
 * rule quiet as well. What gave it away is that {@link SqlMutationExecutor}'s own note claimed the pair
 * was "declared once, here", which was FALSE while a second declaration of it stood twenty lines above.
 * That note has since been reworded too, for the same reason at a wider scope: the shape is declared
 * five times across this folder, so no claim of single declaration was ever true beyond one file.
 *
 * The alias is kept rather than the name deleted, for two reasons that are about callers rather than
 * tidiness. {@link QueryRunner} declares `implements ReadWriteSqlExecutor`, which reads more precisely
 * at that site than the mutation-only name would: the class supplies BOTH members. And `UnitOfWork.ts`
 * cites this name where it explains what a boundary hands out. An alias keeps both readings honest
 * while leaving exactly ONE structural declaration of the shape IN THIS FILE.
 *
 * ⚠️ "IN THIS FILE" IS THE SCOPE THAT IS TRUE, AND THIS SENTENCE USED TO CLAIM THE FOLDER. It ended
 * "exactly ONE structural declaration of the shape in the folder", which is false — there are five,
 * enumerated on {@link SqlMutationExecutor} above — and it contradicted that same block thirty lines
 * earlier, which said sibling declarations were deliberately left in place. Both cannot hold. The
 * duplicate this record is about was itself caught by noticing a claim that contradicted its own file,
 * so the scope is now stated no wider than it can be checked.
 */

/**
 * A {@link SqlExecutor} that can also WRITE, and that is bound to ONE connection.
 *
 * ⭐ WHY THIS EXISTS AT ALL, AND WHY THE SHARED NAME LIVES HERE. `MySqlProductRepository`,
 * `MySqlSkuRepository` and `MySqlBrandRepository` each need both members — they read a row back and then
 * insert or update it — and each had previously declared its own PRIVATE widening of
 * {@link SqlExecutor} that added `executeMutation`. Private is the operative word: while the widenings
 * were unexported, `UnitOfWork`'s transaction scope published only `execute`, so nothing it handed out
 * satisfied any of them, the scope could not be given to a repository at all, and a write and its
 * read-back could not be proven to run on the same connection. That is the visibility AAP §0.6.2 makes
 * load-bearing — the uniqueness rule `model/entity/Sku.cfc:L756-L769` executes a query DURING the save
 * that must observe the sibling rows the same save has just written — and under `mysql2` there is no ORM
 * session to make it happen by itself. Publishing the pair under one name HERE is what let
 * `UnitOfWork.ts` widen its scope to a shape every repository accepts.
 *
 * ⚠️ WHICH IS NOT THE SAME AS THE SHAPE BEING DECLARED ONLY ONCE, and an earlier wording of this
 * paragraph — "declared here rather than three times in three repositories … declaring the pair once,
 * here" — invited that reading. It is declared five times folder-wide, enumerated in the census above,
 * and that is fine: structural compatibility means the ONE instance a boundary supplies satisfies all of
 * them. The invariant that carries the weight is stated in the next block and is about SUPPLIERS, not
 * declarations.
 *
 * ⚠️ "CONNECTION-BOUND" IS THE PART THAT MATTERS, AND IT IS NOT EXPRESSIBLE IN THE TYPE. A pool-backed
 * {@link QueryRunner} implements this interface too, and it borrows a fresh connection per statement —
 * which is correct outside a transaction and WRONG inside one, because MySQL scopes an open transaction
 * to a connection. Inside a transaction boundary a caller must therefore use the executor
 * `UnitOfWork.ts` hands it and nothing else; substituting the pool-backed runner compiles and then
 * silently reads around the very transaction the caller opened. `UnitOfWork.ts` states the same rule
 * from the other side, and both statements are deliberate: the compiler cannot enforce this, so it is
 * enforced by there being exactly one supplier of a transaction-scoped executor.
 *
 * ⛔ NOTHING HERE COMMITS, AND THIS INTERFACE PUBLISHES NO MEMBER THAT WOULD LET A CALLER TRY (M5).
 * Opening, committing and rolling back belong to `UnitOfWork.ts`.
 */
export interface SqlMutationExecutor extends SqlExecutor {
  /**
   * Runs one writing statement with its values bound positionally and returns the rows it affected.
   *
   * @param sql - the writing statement text, whose every value position is a `?` placeholder and whose
   *   every identifier came from {@link assertTableName} or {@link assertColumnName}.
   * @param params - the values to bind, in the legacy positional order (TR-4).
   * @returns the number of rows affected, which may legitimately be zero.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

/**
 * The parameterized-execution boundary: the one object in this port that speaks to the driver.
 *
 * Every statement the Catalog slice runs passes through a single call site inside this class, and that
 * call site uses PREPARED execution exclusively. The driver's other execution member performs
 * client-side text substitution and is never reached from here — not as a fallback, not behind a flag,
 * and not for a statement that happens to bind nothing. That is the whole security property of the
 * folder, and it is a property of there being exactly one path rather than of care taken at each call
 * site.
 *
 * WHAT IT DELIBERATELY IS NOT:
 *   - Not a transaction manager. It opens, commits and rolls back nothing, and publishes no member
 *     that would let a caller try. See the M5 discussion in the module header.
 *   - Not a statement builder. It composes no text and knows no table; a caller brings finished
 *     statement text whose identifiers it validated through the two assertions above.
 *   - Not a mapper. Rows leave as {@link MySqlRow}; hydration into domain objects belongs to
 *     `rowMappers.ts`, and there is deliberately no fetch-and-map convenience member here.
 *   - Not a cache and not a pool owner. See the M7 and S3 discussions in the module header.
 *
 * @example
 * ```ts
 * // Wired once in the composition root; never constructed inside a repository.
 * const runner = new QueryRunner(pool);
 * const skus = await runner.execute('SELECT * FROM SwSku WHERE productID = ?', [productId]);
 * ```
 */
export class QueryRunner implements ReadWriteSqlExecutor {
  /**
   * The injected connection pool.
   *
   * `readonly` and private: nothing in this class replaces it and nothing outside can reach it, so a
   * caller cannot end the pool, resize it or borrow a connection around this boundary. Its lifetime
   * belongs to the composition root that supplied it, which is what preserves reuse across warm
   * invocations — a pool built per invocation would reconnect on every call.
   *
   * Typed as {@link StatementPool}, the port declared above, rather than as the driver's own pool
   * type: the composition root's single exported pool satisfies it structurally, so ONE pool serves
   * this class and `./UnitOfWork` alike and neither file imports the configuration layer.
   */
  private readonly pool: StatementPool;

  /**
   * @param pool - the pool to run every statement on, supplied by the composition root. This class
   *   never builds one, never reads a credential and never resolves a connection target; contrast
   *   `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L332` and `:L420`, which build a credential-reading
   *   connection three separate times inside the data-access layer itself.
   */
  public constructor(pool: StatementPool) {
    this.pool = pool;
  }

  /**
   * Runs one statement and returns every row it produced.
   *
   * The translation of `list()` at `org/Hibachi/HibachiDAO.cfc:L28-L35`, and the member every other
   * read in this folder is built from. Values bind positionally in the order given (TR-4); identifiers
   * must already have passed {@link assertTableName} or {@link assertColumnName}, because a `?` binds a
   * value and can never substitute an identifier.
   *
   * @param sql - the statement text, with a `?` in every value position.
   * @param params - the values to bind, in legacy positional order.
   * @returns the rows produced, in statement order; an empty list when nothing matched.
   * @throws {DomainError} when a parameter is not a bindable scalar, or when the statement text is
   *   blank.
   * @throws {DomainError} when the driver's answer is not a list of rows — a write statement routed
   *   into a read path, for instance — rather than degrading to an empty list, which would report
   *   "nothing found" for a statement that never read anything.
   */
  public async execute(sql: string, params: readonly unknown[]): Promise<MySqlRow[]> {
    return toRows(await this.runStatement(sql, params));
  }

  /**
   * Runs one statement and returns its first row, or `null` when it produced none.
   *
   * The translation of `get()` at `org/Hibachi/HibachiDAO.cfc:L6-L26`, and the reason every
   * single-entity `get`-style member on every repository port in this slice is declared to return
   * `X | null` — `findBySkuCode` on `SkuRepository` and `getBrand` on `BrandRepository` being the two
   * in-scope examples.
   *
   * TODO(parity) `org/Hibachi/HibachiDAO.cfc:L24` — THE `new()` FALLBACK IS DELIBERATELY NOT
   * REPRODUCED HERE. The legacy member takes a third argument, `isReturnNewOnNotFound`, and when it is
   * true and nothing was found it returns a NEWLY CONSTRUCTED, unsaved entity instead of nothing. That
   * is Hibernate-session behaviour and it is a SERVICE-layer decision about what a miss should mean; a
   * statement runner that manufactured an entity on a miss would fabricate domain objects invisibly,
   * and a caller could not tell a stored row from an invented one. This member therefore returns `null`
   * and the decision stays with the service that wanted it. The legacy member's other side effect —
   * `entity.updateCalculatedProperties()` at `:L19`, mutating the entity it is about to hand back — is
   * likewise not reproduced here, for the same reason: it is not part of reading a row.
   *
   * IT IS DELIBERATELY LENIENT ABOUT EXTRA ROWS, and the split is worth stating. Where uniqueness is
   * genuinely part of the contract, the legacy source says so at the call site: `getSkuBySkuCode` at
   * `model/dao/SkuDAO.cfc:L102-L104` passes `true` as the third argument to the ORM helper on `:L103`,
   * which is what makes THAT read unique. Enforcing uniqueness for every read here would impose a
   * constraint the other reads never had; the repository that owns a unique read enforces it itself.
   *
   * @param sql - the statement text, with a `?` in every value position.
   * @param params - the values to bind, in legacy positional order.
   * @returns the first row, or `null` when the statement matched nothing.
   * @throws {DomainError} on the same conditions as {@link QueryRunner.execute}.
   */
  public async executeOne(sql: string, params: readonly unknown[]): Promise<MySqlRow | null> {
    const rows = await this.execute(sql, params);

    // Indexed reads are checked because `noUncheckedIndexedAccess` types this as possibly absent,
    // which is exactly the honest type of "the first row of a result set that may be empty".
    const firstRow = rows[0];

    return firstRow ?? null;
  }

  /**
   * Runs one writing statement and returns how many rows it affected.
   *
   * The translation of `save()` at `org/Hibachi/HibachiDAO.cfc:L48-L67` and `delete()` at `:L69-L77`,
   * which collapse into one member here because the recursion each performed — through
   * `getPopulatedSubProperties()` at `:L54-L64` and through an array at `:L70-L73` — was a Hibernate
   * graph walk rather than statement execution. Cascade is a repository decision in this port, so what
   * arrives here is one statement.
   *
   * The affected-row count is returned rather than discarded because it is the only signal a caller
   * gets that a targeted write actually matched anything. The legacy members returned the entity or
   * nothing at all and relied on the ORM session to notice, which a stateless handler cannot do.
   *
   * NOTHING HERE COMMITS. If the statement must be part of a larger atomic unit — and for the importer
   * it must, because `transaction{` opens once per row at `model/dao/ProductDAO.cfc:L177` — the
   * transaction is opened and closed by `UnitOfWork.ts` around this call, not by it.
   *
   * @param sql - the writing statement text, with a `?` in every value position.
   * @param params - the values to bind, in legacy positional order.
   * @returns the number of rows the statement affected, which may legitimately be zero.
   * @throws {DomainError} when a parameter is not a bindable scalar, or the statement text is blank.
   * @throws {DataIntegrityError} when the driver's answer is not a write acknowledgement — most often a
   *   read statement routed into this path, which would otherwise silently report zero rows affected.
   */
  public async executeMutation(sql: string, params: readonly unknown[]): Promise<number> {
    return requireAffectedRows(await this.runStatement(sql, params), params.length);
  }

  /**
   * Runs one counting statement and returns its single numeric result.
   *
   * The translation of `count()` at `org/Hibachi/HibachiDAO.cfc:L79-L86`, whose body is
   * `ormExecuteQuery("SELECT count(*) FROM …", true)` at `:L85`. The slice's other counting statement
   * is the transaction-existence check at `model/dao/SkuDAO.cfc:L57`, which counts SKU identifiers
   * across a ten-way `EXISTS` chain. A single-column projection of a whole number has the same shape
   * wherever it appears, so the `COALESCE(max(sortOrder), 0)` read at
   * `org/Hibachi/HibachiDAO.cfc:L158` is equally readable through this member.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L93-L95` — THE LEGACY READ WAS UNGUARDED AND THIS ONE IS NOT,
   * WHICH IS A STRICT-MODE REQUIREMENT RATHER THAN A BEHAVIOUR CHANGE. The legacy code reads
   * `results[1]` with no check that the result holds anything and compares it directly to zero; under
   * CFML an empty result would fail there at run time with an index error. Under
   * `noUncheckedIndexedAccess` the same read is typed as possibly absent and cannot compile unchecked,
   * so the absence has to be handled explicitly. It RAISES rather than defaulting to zero, because
   * zero is a meaningful count — the legacy comparison at `:L93` treats zero as "no transaction
   * exists" — and manufacturing it from a malformed result would turn a broken statement into a
   * confident negative answer, which is strictly worse than the legacy failure.
   *
   * @param sql - the counting statement text, projecting exactly one column.
   * @param params - the values to bind, in legacy positional order.
   * @returns the count.
   * @throws {DomainError} when a parameter is not a bindable scalar, or the statement text is blank.
   * @throws {DataIntegrityError} when the statement produced no row, projected more than one column, or
   *   produced a value that is not a whole, non-negative count.
   */
  public async executeScalarCount(sql: string, params: readonly unknown[]): Promise<number> {
    const rows = await this.execute(sql, params);
    const firstRow = rows[0];

    if (firstRow === undefined) {
      throw new DataIntegrityError(
        'A counting statement produced no row at all, so there was no count to read.',
        { context: { parameterCount: params.length } },
      );
    }

    const projectedValues = Object.values(firstRow);

    if (projectedValues.length !== 1) {
      throw new DataIntegrityError(
        'A counting statement did not project exactly one column, so which value is the count is ' +
          'ambiguous.',
        { context: { projectedColumnCount: projectedValues.length } },
      );
    }

    return toCount(projectedValues[0]);
  }

  /**
   * The one and only place in this port where the driver is spoken to.
   *
   * Private, and private on purpose: it answers with the driver's own value, unnarrowed and typed
   * `unknown`, so that no caller outside this class can receive a shape the driver's type system
   * widens to permissive members. The two public paths narrow it in the two different ways the two
   * kinds of statement need — a read through the sibling mapper's list narrowing, a write through the
   * acknowledgement reader above — and neither narrowing is expressible in terms of the other, which
   * is why a single public read member cannot serve both.
   *
   * Funnelling both paths through one call site is what makes the folder's central guarantee checkable
   * by inspection rather than by discipline: there is one prepared-execution call, one place where a
   * parameter list is narrowed, and no other route to the database anywhere in the subtree.
   *
   * The statement text is forwarded EXACTLY as the caller composed it. The blank check reads a trimmed
   * copy, but nothing trimmed, rewritten, reformatted or appended is ever sent — no ordering clause, no
   * row limit the legacy statement did not have and no engine hint, because AAP 0.8.2 Guideline 4
   * forbids optimising a ported statement and a silent limit would truncate a result set.
   *
   * ⭐ TWO STEPS RATHER THAN ONE, AND THE FIRST STEP IS WHERE THE ARITY IS PROVEN. `pool.bind`
   * describes the statement — refusing it outright unless the number of placeholders written in the
   * text equals the number of values narrowed above — and `pool.execute` then runs the description.
   * The alternative shape, handing the driver a string and a list in one call, is what the driver's own
   * pool would have accepted, and it is precisely the shape that lets an off-by-one reach the wire: a
   * short list draws a protocol error naming neither the statement nor the position, and a surplus is
   * accepted with the extra values silently discarded. Describing first turns both into a DomainError
   * raised on this side of the boundary. It also means the value this class holds cannot be the
   * driver's pool, which is the F3 contract mismatch resolved rather than asserted away.
   *
   * @param sql - the statement text as composed by the caller.
   * @param params - the values to bind, in legacy positional order.
   * @returns the driver's answer, unnarrowed.
   * @throws {DomainError} when the statement text is blank, a parameter is not a bindable scalar, or
   *   the statement's placeholder count does not match the number of values supplied.
   */
  private async runStatement(sql: string, params: readonly unknown[]): Promise<unknown> {
    if (sql.trim().length === 0) {
      throw new DomainError(
        'A blank statement reached the execution boundary, so there was nothing to prepare.',
        { context: { parameterCount: params.length } },
      );
    }

    const [driverResult] = await this.pool.execute(sql, toBoundValues(params));

    return driverResult;
  }
}
