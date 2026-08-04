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

import {
  DataIntegrityError,
  DomainError,
  UniqueConstraintViolationError,
} from '../../errors/DomainError';
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../domain/BaseProductType';
import {
  mapBrandRow,
  mapOptionGroupRow,
  mapOptionRow,
  mapProductRow,
  mapProductTypeRow,
  mapSkuRow,
  toRows,
} from './rowMappers';

import type { Option } from '../../domain/option/Option';
import type { OptionGroup } from '../../domain/option/OptionGroup';
import type { Product, ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type { Sku } from '../../domain/sku/Sku';
import type { SmartListEntityName } from '../../ports/SmartListQueryPort';
import type { MySqlRow } from './rowMappers';

/* ================================================================================================
 * TODO(parity) the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] — THE LEGACY TREE SPEAKS TWO TABLE VOCABULARIES AT ONCE, AND BOTH ARE CORRECT
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
 * the two registers are stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts`, and BOTH ARE FROZEN AT THE AAP's OWN BOUNDS — AAP
 * 0.6.7's D1-D21 and AAP 0.6.6's M1-M8. Nothing in this port mints an identifier beyond either
 * range; a further source observation is recorded by its `path:Lnnn` locator instead. It CITES the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132], D8, M3, M5, M6 and M7 and
 * records every other finding by `path:Lnnn` locator alone. It does not OWN any of them: the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132]'s
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
 * boundary holding rather than a gap: `MySqlProductRepository.ts` clears them through an injected
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

/* ================================================================================================
 * ⭐⭐ THE SCOPE CLASSIFICATION — REVIEW FINDING SEC-SQL-SCOPE-01 (CWE-284, CWE-250)
 * ================================================================================================
 * The finding measured two things and both are true: this registry admitted TWELVE tables where the
 * AAP's own Catalog boundary names SEVEN, and `./MySqlSkuRepository.ts` emitted FOURTEEN FURTHER
 * out-of-scope table literals from a private frozen object that never reached this registry at all.
 * Its resolution: "Ratify the exact unavoidable schema surface, provision least-privilege credentials,
 * and require every emitted table/column to pass one auditable registry."
 *
 * ⚠️ AND RATIFYING IT FOUND MORE THAN THE FINDING COUNTED. Auditing every emitted identifier against this
 * registry — rather than only the two places the finding named — turned up a THIRD private literal object,
 * in `./MySqlProductRepository.ts`, holding five further table names from the excluded `Attribute*` family.
 * One of them, `SwAttributeValue`, is WRITTEN by the importer's custom-attribute step. A ratification that
 * had stopped at the two modules the finding cited would have published a surface that was still incomplete
 * and would have understated the required privilege from `SELECT` to `SELECT, INSERT, UPDATE`. The census
 * below is therefore the whole of it, and {@link registeredTableScopes} exists so the next audit is a test
 * rather than a re-reading.
 *
 * ⭐ WHAT WAS ACTUALLY WRONG WAS NOT THE COUNT — IT WAS THAT THE COUNT WAS UNKNOWABLE FROM ONE PLACE.
 * Neither number was arbitrary. The twelve are the six Catalog entity tables, the four link tables
 * `model/entity/Sku.cfc:L76-L79` declares, the one link table `model/entity/Product.cfc:L81` declares
 * whose far side is also in scope, and the alternate-SKU-code table the code lookup joins. The fourteen
 * are the tables the legacy existence chain and fetch branches genuinely reach. But a reviewer asking
 * "what schema surface does this service require, and with what privileges" had to read two modules and
 * reconcile a whitelist against a private literal object — and only ONE of the two was enforced.
 *
 * ⛔ SO THE REGISTRY IS NOT SHRUNK, IT IS CLASSIFIED. Shrinking it would be the wrong repair twice over.
 * Removing the link tables would make relationships the in-scope entity OWNS unwriteable, which drops
 * behaviour rather than respecting a boundary. Removing the cross-domain tables would delete the
 * ten-way existence chain of `model/dao/SkuDAO.cfc:L53-L98`, whose RESULT is observable — it answers the
 * `transactionExistsFlag` delete guard of `model/validation/Product.json` and `model/validation/Sku.json`.
 * Both are required, and the honest response is to make the requirement legible and to bound what may be
 * DONE with each name rather than to pretend the surface is smaller than it is.
 *
 * ⭐ THE FOUR CLASSES, AND WHY THE LINE FALLS WHERE IT DOES:
 *
 *   • `catalog-core` — the SEVEN the AAP §0.2.1.2 boundary names: the six entity tables plus
 *     `SwSkuOption`, the option link table without which the option model is unusable. Fully writeable.
 *
 *   • `catalog-owned-link` — FOUR link tables whose OWNING side is an in-scope entity even though the far
 *     side is not: `SwSkuAccessContent` and `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit` from
 *     `model/entity/Sku.cfc:L77-L79`, and `SwRelatedProduct` from `model/entity/Product.cfc:L81`, which is
 *     the ONE of that entity's ten many-to-many collections with `SwProduct` on both sides. Writeable,
 *     because writing a link row the in-scope entity owns is in-scope work; the far entity's own table is
 *     never named anywhere in this subtree.
 *
 *   • `cross-domain-write` — ONE table, `SwAttributeValue`. It belongs to an excluded family and is
 *     nonetheless written, because `model/dao/ProductDAO.cfc:L244` and `:L250` write it from the importer's
 *     custom-attribute step and AAP §0.4.1.7 keeps the importer's behaviour. Given its own class rather
 *     than folded into either neighbour, so the credential below grants `INSERT, UPDATE` on exactly one
 *     table outside the Catalog and an auditor can see which one without reading any statement.
 *
 *   • `cross-domain-read-only` — every other table belonging to a family AAP §0.2.2.1 EXCLUDES: the
 *     alternate-SKU-code table, the subscription term, the ten order, inventory, stock, physical-count,
 *     stock-adjustment and vendor-order tables the existence chain traverses, and the four attribute-family
 *     tables the attribute-set selection joins. Reached to ANSWER A QUESTION and never to write.
 *
 * ⚠️ `SwAttributeSetProductType` IS A LINK TABLE AND IS STILL READ-ONLY, which shows the middle class is a
 * real test rather than a label for anything shaped like a link. The four `catalog-owned-link` members
 * qualify because their OWNING side is an in-scope entity; this one's owning side is `AttributeSet`, and
 * `SwProductType` appears only as the far column. Writing it would be writing a relationship the Catalog
 * does not own.
 *
 * ⛔ AND THE CLASSIFICATION IS ENFORCED, NOT MERELY RECORDED — which is what makes this a fix rather than
 * a comment. {@link assertWriteTableName} refuses a `cross-domain-read-only` name outright, so no write
 * path in the subtree can compose a statement against an excluded family's table even by accident.
 * {@link assertTableName} keeps its existing contract for reads. A future member that tried to INSERT into
 * `SwOrderItem` would fail at composition with a message naming the classification, rather than succeeding
 * and requiring a privilege the deployment should never have granted.
 *
 * ⭐ THE LEAST-PRIVILEGE CREDENTIAL THIS SERVICE NEEDS FOLLOWS MECHANICALLY, AND IS STATED SO A DEPLOYMENT
 * CAN PROVISION IT — the second half of the finding's resolution. Granting it is an operator act and
 * AAP §0.2.2.5 puts infrastructure outside this refactoring, so no DDL or GRANT is authored here:
 *
 *   ELEVEN Catalog tables — full DML:
 *     GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwProduct                  TO '<user>'@'<host>';
 *     … the same for SwSku, SwProductType, SwBrand, SwOption, SwOptionGroup, SwSkuOption,
 *       SwSkuAccessContent, SwSkuSubsBenefit, SwSkuRenewalSubsBenefit, SwRelatedProduct
 *
 *   ONE cross-domain table — INSERT and UPDATE but DELIBERATELY NOT `DELETE`, because the importer's two
 *   statements are an UPDATE and an INSERT and nothing in this subtree deletes an attribute value:
 *     GRANT SELECT, INSERT, UPDATE ON <schema>.SwAttributeValue                   TO '<user>'@'<host>';
 *
 *   SIXTEEN cross-domain tables — `SELECT` and nothing more:
 *     GRANT SELECT ON <schema>.SwAlternateSkuCode                                 TO '<user>'@'<host>';
 *     … SELECT ONLY, likewise, on SwSubscriptionTerm, SwStock, SwOrderItem, SwInventory,
 *       SwOrderDeliveryItem, SwPhysicalCountItem, SwStockAdjustmentDeliveryItem, SwStockAdjustmentItem,
 *       SwStockHold, SwStockReceiverItem, SwVendorOrderItem, SwAttributeSet, SwAttribute,
 *       SwAttributeSetProductType, SwType
 *
 * Nothing outside those TWENTY-EIGHT tables is required; no privilege beyond `SELECT` is required on sixteen
 * of them, and no `DELETE` on the seventeenth. The enforcement above means a deployment that grants exactly
 * this cannot be defeated by a later code change: the code refuses the write before the database would have
 * to. {@link registeredTableScopes} answers the census in one call, so a provisioning script can be
 * generated from the code rather than transcribed from this comment and drift away from it.
 *
 * ⚠️ WHAT THIS IS NOT. It is not a claim that the cross-domain reads are desirable. The finding's first
 * clause — "Move out-of-scope checks behind narrowly privileged collaborators or approved read-only
 * views" — asks for something this deliverable cannot supply: a view is a schema object (AAP §0.2.2.5), and
 * a collaborator owned by the excluded family would have to be implemented by whoever owns that family,
 * which is outside the entire AAP. The classification is the part that can be built here, and it is what
 * makes either of those later moves a substitution at one seam rather than an audit of two modules.
 * ============================================================================================== */

/**
 * How far outside the Catalog boundary a validated table name sits.
 *
 * A union rather than a boolean because the middle class is real and collapsing it would misreport it:
 * a link table owned by an in-scope entity is not core Catalog, and it is not cross-domain either.
 */
export type TableScope =
  'catalog-core' | 'catalog-owned-link' | 'cross-domain-write' | 'cross-domain-read-only';

/**
 * Every table this service may name, mapped to its scope.
 *
 * ⭐ ONE OBJECT, WHICH IS THE WHOLE OF THE FINDING'S "one auditable registry" CLAUSE. Twenty-eight entries:
 * the twelve this module already declared, plus the eleven `./MySqlSkuRepository.ts` held privately (its
 * fourteen minus `SwAlternateSkuCode`, `SwSkuAccessContent` and `SwSkuSubsBenefit`, which this module
 * already had), plus the five `./MySqlProductRepository.ts` held privately. A reviewer answering "what
 * schema surface does this service need, and with what privilege" reads this object and nothing else.
 *
 * ⚠️ EVERY CROSS-DOMAIN ENTRY CITES THE LEGACY DECLARATION IT WAS READ FROM AND THE STATEMENT THAT REACHES
 * IT, because a name whose necessity cannot be re-verified is a name that should not be here. Each is a
 * compile-time constant authored from that declaration; none derives from caller input, so none is an
 * injection surface — S2 requires only that no caller-supplied string reach statement text except as a
 * bound `?`, and that holds throughout.
 */
const TABLE_SCOPES = {
  /* ── catalog-core: the SEVEN of AAP §0.2.1.2 ───────────────────────────────────────────────── */
  SwProduct: 'catalog-core',
  SwSku: 'catalog-core',
  SwProductType: 'catalog-core',
  SwBrand: 'catalog-core',
  SwOption: 'catalog-core',
  SwOptionGroup: 'catalog-core',
  /** `model/entity/Sku.cfc:L76` `linktable="SwSkuOption"` — without it the option model is unusable. */
  SwSkuOption: 'catalog-core',

  /* ── catalog-owned-link: owning side in scope, far side not ────────────────────────────────── */
  /** `model/entity/Sku.cfc:L77` `linktable="SwSkuAccessContent"`; far side `Content` excluded. */
  SwSkuAccessContent: 'catalog-owned-link',
  /** `model/entity/Sku.cfc:L78` `linktable="SwSkuSubsBenefit"`; far side `SubscriptionBenefit` excluded. */
  SwSkuSubsBenefit: 'catalog-owned-link',
  /** `model/entity/Sku.cfc:L79` `linktable="SwSkuRenewalSubsBenefit"`; same far family. */
  SwSkuRenewalSubsBenefit: 'catalog-owned-link',
  /** `model/entity/Product.cfc:L81` — the ONE of ten collections with `SwProduct` on BOTH sides. */
  SwRelatedProduct: 'catalog-owned-link',

  /* ── cross-domain-read-only: excluded families, reached to answer a question ────────────────── */
  /** `model/entity/AlternateSkuCode.cfc:L49` — the SKU-code fallback at `model/dao/SkuDAO.cfc:L103`. */
  SwAlternateSkuCode: 'cross-domain-read-only',
  /** `model/entity/SubscriptionTerm.cfc` — the non-fetching join of `model/dao/SkuDAO.cfc:L159`. */
  SwSubscriptionTerm: 'cross-domain-read-only',
  /** `model/entity/Stock.cfc:L49` — the mediating table EIGHT of the ten existence tests traverse. */
  SwStock: 'cross-domain-read-only',
  /** `model/entity/OrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L66`. */
  SwOrderItem: 'cross-domain-read-only',
  /** `model/entity/Inventory.cfc:L49` — `model/dao/SkuDAO.cfc:L68`. */
  SwInventory: 'cross-domain-read-only',
  /** `model/entity/OrderDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L70`. */
  SwOrderDeliveryItem: 'cross-domain-read-only',
  /** `model/entity/PhysicalCountItem.cfc:L49` — `model/dao/SkuDAO.cfc:L72`. */
  SwPhysicalCountItem: 'cross-domain-read-only',
  /** `model/entity/StockAdjustmentDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L74`. */
  SwStockAdjustmentDeliveryItem: 'cross-domain-read-only',
  /** `model/entity/StockAdjustmentItem.cfc:L49` — reached TWICE, `model/dao/SkuDAO.cfc:L76` and `:L78`. */
  SwStockAdjustmentItem: 'cross-domain-read-only',
  /** `model/entity/StockHold.cfc:L49` — `model/dao/SkuDAO.cfc:L80`. */
  SwStockHold: 'cross-domain-read-only',
  /** `model/entity/StockReceiverItem.cfc:L49` — `model/dao/SkuDAO.cfc:L82`. */
  SwStockReceiverItem: 'cross-domain-read-only',
  /** `model/entity/VendorOrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L84`. */
  SwVendorOrderItem: 'cross-domain-read-only',

  /* ── the attribute family, reached by the importer and the attribute-set selection ──────────── */
  /**
   * `model/entity/AttributeSet.cfc:L49` — the root of the selection at `model/dao/ProductDAO.cfc:L53`,
   * whose result IS the return of `ProductRepository.findAttributeSets`, a declared port member.
   */
  SwAttributeSet: 'cross-domain-read-only',
  /** `model/entity/Attribute.cfc:L49` — the `activeFlag` existence test at `model/dao/ProductDAO.cfc:L54`. */
  SwAttribute: 'cross-domain-read-only',
  /**
   * `model/entity/AttributeSet.cfc:L70` `linktable="SwAttributeSetProductType"` — the PHYSICAL
   * relationship standing in for the association path `model/dao/ProductDAO.cfc:L58` names.
   *
   * ⚠️ READ-ONLY DESPITE BEING A LINK TABLE, because it fails the test the four `catalog-owned-link`
   * members pass: its OWNING side is `AttributeSet`, an excluded entity. `SwProductType` appears only as
   * the far column. Writing it would be writing a relationship the Catalog does not own.
   */
  SwAttributeSetProductType: 'cross-domain-read-only',
  /** `model/entity/Type.cfc:L49` — reached through `attributeSetType` for its `systemCode`. */
  SwType: 'cross-domain-read-only',
  /**
   * `model/entity/AttributeValue.cfc:L54` — the ONE cross-domain table this service WRITES.
   *
   * ⭐ THE SOLE MEMBER OF `cross-domain-write`, AND THE REASON THAT CLASS EXISTS RATHER THAN BEING FOLDED
   * INTO EITHER NEIGHBOUR. `model/dao/ProductDAO.cfc:L244` UPDATEs it and `:L250` INSERTs it, from the
   * importer's custom-attribute step — the values a caller asked to import. Classifying it read-only
   * would delete behaviour AAP §0.4.1.7 requires the importer to keep; classifying it `catalog-owned-link`
   * would misreport an excluded family's own entity table as Catalog-owned. So it is named for what it is:
   * a boundary crossing that WRITES, called out separately so the credential an operator provisions grants
   * `INSERT, UPDATE` on exactly one table outside the Catalog and on no other.
   *
   * ⚠️ NO `DELETE`. The legacy reaches this table through those two statements only, so the least-privilege
   * grant below withholds `DELETE` on it even though the eleven Catalog tables have it.
   */
  SwAttributeValue: 'cross-domain-write',
} as const satisfies Readonly<Record<string, TableScope>>;

/**
 * Any table name this service may name in a statement, of any scope.
 *
 * ⚠️ DISTINCT FROM BOTH {@link PhysicalTableName} AND {@link WriteableTableName}, AND ALL THREE
 * DISTINCTIONS ARE LOAD-BEARING RATHER THAN BOOKKEEPING. `PhysicalTableName` is the twelve tables
 * {@link TABLE_COLUMNS} maps; `WriteableTableName` is the twelve whose SCOPE permits writing; and the two
 * are not the same twelve — see the note on `WriteableTableName` for the two names that differ. This type is
 * the widest of the three, carrying all twenty-eight, so a READ path can name any of them while a write path
 * structurally cannot receive one it may not write.
 */
export type RegisteredTableName = keyof typeof TABLE_SCOPES;

/**
 * The registered names carrying any of the given scopes.
 *
 * A mapped-and-indexed type rather than four hand-written unions, so the scope declared beside each entry
 * in {@link TABLE_SCOPES} is the ONLY place a name's classification is stated. Re-classifying a table is a
 * one-word edit there and every derived union follows; there is no second list to forget.
 */
type TableNamesScoped<S extends TableScope> = {
  [K in RegisteredTableName]: (typeof TABLE_SCOPES)[K] extends S ? K : never;
}[RegisteredTableName];

/**
 * A registered name this service is permitted to WRITE.
 *
 * ⭐ DERIVED FROM THE SCOPES, WHICH IS WHY IT IS NOT THE SAME TWELVE AS {@link PhysicalTableName}. Both
 * unions happen to have twelve members and they differ in exactly two: this one excludes
 * `SwAlternateSkuCode`, which {@link TABLE_COLUMNS} maps because the SKU-code fallback JOINS it but which
 * belongs to an excluded family and must never be written; and it includes `SwAttributeValue`, which has no
 * column map here because the importer names its columns from its own declaration.
 *
 * That the two unions are near-identical yet not identical is precisely why {@link assertWriteTableName}
 * validates against this one and not against `PhysicalTableName`.
 */
export type WriteableTableName = TableNamesScoped<
  'catalog-core' | 'catalog-owned-link' | 'cross-domain-write'
>;

/**
 * Reports the scope of a table name already validated by {@link assertRegisteredTableName}.
 *
 * @param table - a registered physical name.
 * @returns its scope, as declared in {@link TABLE_SCOPES}.
 */
export function tableScope(table: RegisteredTableName): TableScope {
  return TABLE_SCOPES[table];
}

/**
 * Every registered table name, for the audit a reviewer or a provisioning script performs.
 *
 * Exported deliberately: the finding asks that the schema surface be RATIFIED, and a surface nobody can
 * enumerate cannot be ratified. A test asserts the census, so the set cannot grow unremarked.
 *
 * @returns the twenty-eight names paired with their scopes, frozen, in declaration order.
 */
export function registeredTableScopes(): readonly (readonly [RegisteredTableName, TableScope])[] {
  return Object.freeze(
    Object.entries(TABLE_SCOPES).map(
      ([name, scope]) => Object.freeze([name, scope]) as readonly [RegisteredTableName, TableScope],
    ),
  );
}

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
 * and `:L104` and prepends it when absent; the six `entityname` values in the naming-divergence table above are the
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
   * from this whitelist — `MySqlProductRepository.ts` reaches them through a declared collaborator
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
 * A registered table that {@link TABLE_COLUMNS} does not map.
 *
 * Exactly the registered names outside {@link PhysicalTableName}, computed by the compiler rather than
 * listed, so the two column registries below partition the registry with no name in both and none in
 * neither.
 */
type ExtendedTableName = Exclude<RegisteredTableName, PhysicalTableName>;

/**
 * The columns this service names on each registered table that {@link TABLE_COLUMNS} does not map.
 *
 * ⭐⭐ THE OTHER HALF OF SEC-SQL-SCOPE-01's "every emitted table/column" CLAUSE. Classifying the TABLES was
 * only half the finding: the sibling adapters also emitted cross-domain COLUMN literals from private frozen
 * objects — six in `./MySqlSkuRepository.ts`, eleven in `./MySqlProductRepository.ts` — that reached no gate
 * at all. Declaring them here means a reviewer auditing "what does this service touch" reads two objects in
 * one module instead of four objects in three, and {@link assertRegisteredColumnName} makes the declaration
 * enforced rather than advisory.
 *
 * ⛔ TOTALITY IS COMPILE-ENFORCED, WHICH IS THE PROPERTY THAT MAKES THIS A REGISTRY AND NOT A LIST. The
 * annotation is a total `Record` over {@link ExtendedTableName}, so adding a name to {@link TABLE_SCOPES}
 * without declaring the columns it needs FAILS THE BUILD. That is deliberate: the failure mode this finding
 * describes is a surface that grew without anyone noticing, and the compiler is the only reviewer guaranteed
 * to look every time.
 *
 * ⚠️ EACH SET IS THE COLUMNS ACTUALLY EMITTED, NOT THE ENTITY'S FULL DECLARATION. These are excluded
 * families (AAP §0.2.2.1); enumerating their complete column lists would assert knowledge of tables this
 * refactoring does not own and would invite a future statement to reach further. A narrow set is the point.
 */
const EXTENDED_TABLE_COLUMNS: Readonly<Record<ExtendedTableName, ReadonlySet<string>>> =
  Object.freeze({
    /* ── the ten-way existence chain of `model/dao/SkuDAO.cfc:L53-L98` ──────────────────────────── */
    /* `model/entity/Stock.cfc` — the mediating table eight of the ten tests traverse: they name the
     * association path `stock.sku`, which resolves to this table's own key plus its SKU foreign key. */
    SwStock: new Set(['stockID', 'skuID']),
    /* `model/entity/OrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L66`, keyed directly by SKU. */
    SwOrderItem: new Set(['skuID']),
    /* `model/entity/Inventory.cfc:L49` — `:L68`, mediated through stock. */
    SwInventory: new Set(['stockID']),
    /* `model/entity/OrderDeliveryItem.cfc:L49` — `:L70`, mediated through stock. */
    SwOrderDeliveryItem: new Set(['stockID']),
    /* `model/entity/PhysicalCountItem.cfc:L49` — `:L72`, mediated through stock. */
    SwPhysicalCountItem: new Set(['stockID']),
    /* `model/entity/StockAdjustmentDeliveryItem.cfc:L49` — `:L74`, mediated through stock. */
    SwStockAdjustmentDeliveryItem: new Set(['stockID']),
    /* `model/entity/StockAdjustmentItem.cfc:L57-L58` — reached TWICE, `:L76` via `fromStockID` and `:L78`
     * via `toStockID`, which is why this is the one chain member carrying two stock keys. */
    SwStockAdjustmentItem: new Set(['fromStockID', 'toStockID']),
    /* `model/entity/StockHold.cfc:L49` — `:L80`, mediated through stock. */
    SwStockHold: new Set(['stockID']),
    /* `model/entity/StockReceiverItem.cfc:L49` — `:L82`, mediated through stock. */
    SwStockReceiverItem: new Set(['stockID']),
    /* `model/entity/VendorOrderItem.cfc:L49` — `:L84`, keyed directly by SKU. */
    SwVendorOrderItem: new Set(['skuID']),

    /* ── the non-fetching join of `model/dao/SkuDAO.cfc:L159` ───────────────────────────────────── */
    /* `model/entity/SubscriptionTerm.cfc`, and `model/entity/Sku.cfc:L66` on the near side — the term key
     * carries the same spelling on both, which is why one name serves the join. */
    SwSubscriptionTerm: new Set(['subscriptionTermID']),

    /* ── the attribute-set selection of `model/dao/ProductDAO.cfc:L52-L62` ──────────────────────── */
    /* `model/entity/AttributeSet.cfc` — key :L52, `globalFlag` :L57, `sortOrder` :L61,
     * `fkcolumn="attributeSetTypeID"` :L64. */
    SwAttributeSet: new Set(['attributeSetID', 'globalFlag', 'sortOrder', 'attributeSetTypeID']),
    /* `model/entity/Attribute.cfc` — key :L52, `activeFlag` :L53, `fkcolumn="attributeSetID"` :L67. */
    SwAttribute: new Set(['attributeID', 'activeFlag', 'attributeSetID']),
    /* `model/entity/AttributeSet.cfc:L70` — `fkcolumn="attributeSetID"`,
     * `inversejoincolumn="productTypeID"`. */
    SwAttributeSetProductType: new Set(['attributeSetID', 'productTypeID']),
    /* `model/entity/Type.cfc` — key :L52, `systemCode` :L55, the bound filter and first sort term. */
    SwType: new Set(['typeID', 'systemCode']),

    /* ── the importer's custom-attribute step, `model/dao/ProductDAO.cfc:L244` and `:L250` ─────── */
    /* `model/entity/AttributeValue.cfc` — key :L57, value :L58, `attributeValueType` :L60 (`notnull`,
     * which is why the INSERT supplies it), `attributeID` :L78, `fkcolumn="productID"` :L70.
     *
     * ⚠️ THE ONLY SET HERE WHOSE COLUMNS ARE WRITTEN rather than only read; see the
     * `cross-domain-write` note beside its entry in {@link TABLE_SCOPES}. */
    SwAttributeValue: new Set([
      'attributeValueID',
      'attributeValue',
      'attributeValueType',
      'attributeID',
      'productID',
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

/**
 * The case-insensitive index of the ELEVEN cross-domain read-only names — SEC-SQL-SCOPE-01.
 *
 * Separate from {@link TABLE_NAME_LOOKUP} rather than merged into it, deliberately: that map is what
 * {@link assertTableName} answers from, so merging would silently make every cross-domain table writeable
 * through the existing gate and undo the classification. Derived from {@link TABLE_SCOPES} rather than
 * listed again, so a name cannot appear in one and not the other.
 *
 * Only the physical spelling is indexed; see {@link assertRegisteredTableName} for why the logical and
 * bare vocabularies do not apply to families this port models no entity for.
 */
const CROSS_DOMAIN_NAME_LOOKUP: ReadonlyMap<string, RegisteredTableName> = new Map(
  /* ⚠️ FILTERED BY ABSENCE FROM THE SIBLING MAP, NOT BY SCOPE, AND THE DIFFERENCE IS A BUG THIS COMMENT
   * EXISTS TO PREVENT RECURRING. An earlier revision filtered on `scope === 'cross-domain-read-only'`,
   * which was correct only while that was the ONLY cross-domain class. Adding `cross-domain-write` for
   * `SwAttributeValue` immediately made that name resolvable through NEITHER map — absent from
   * `TABLE_NAME_LOOKUP` because it has no column map there, and excluded from this one by the scope test —
   * so `assertRegisteredTableName` refused a name the registry had just ratified, and every statement the
   * importer composes failed at module load. Partitioning by "is it in the other map" is total by
   * construction: a name is in exactly one of the two, whatever scope it is later given. */
  Object.entries(TABLE_SCOPES)
    .filter(([name]) => !TABLE_NAME_LOOKUP.has(name.toLowerCase()))
    .map(([name]) => [name.toLowerCase(), name as RegisteredTableName]),
);

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
 *     acceptance of an unprefixed name at the five sites listed in the naming-divergence block above.
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

/**
 * Validates any REGISTERED table name — including a cross-domain one — for use in a READ.
 *
 * ⭐ THE SEC-SQL-SCOPE-01 READ GATE. {@link assertTableName} admits only the twelve names with a column map,
 * which is right for every write path and too narrow for the reads the legacy genuinely performs: the ten-way
 * existence chain of `model/dao/SkuDAO.cfc:L53-L98`, the SKU-code fallback at `:L103` and the two fetch
 * branches at `:L155`/`:L160` all name tables belonging to families AAP §0.2.2.1 excludes. Before this gate
 * existed those fourteen literals lived in a private frozen object in `./MySqlSkuRepository.ts`, and five
 * more in a second such object in `./MySqlProductRepository.ts`, and every one passed through NO registry
 * at all — which is exactly what the finding measured. Routing them here is what makes
 * the registry the single auditable surface it claims to be.
 *
 * ⚠️ IT ACCEPTS THE SAME THREE VOCABULARIES AS ITS SIBLING for the twelve names that have all three, and
 * only the physical spelling for the sixteen further registered names. That is not an oversight: the logical and
 * bare forms exist because `org/Hibachi/HibachiDAO.cfc` SYNTHESISES them for ENTITIES this port models, and
 * this port models none of the excluded families — no caller in the subtree holds a `SlatwallOrderItem`
 * spelling to pass, because nothing here has an order entity to name.
 *
 * @param candidate - the name to validate, in any accepted vocabulary.
 * @returns the canonical physical name.
 * @throws {DomainError} when the name is in no scope at all, refused before any statement text exists.
 */
export function assertRegisteredTableName(candidate: string): RegisteredTableName {
  const normalized = candidate.trim();
  const writeable = TABLE_NAME_LOOKUP.get(normalized.toLowerCase());

  if (writeable !== undefined) {
    return writeable;
  }

  const crossDomain = CROSS_DOMAIN_NAME_LOOKUP.get(normalized.toLowerCase());

  if (crossDomain === undefined) {
    throw new DomainError(
      'A statement named a table that is in neither the extracted Catalog schema nor the ratified ' +
        'cross-domain read surface, so it was refused before any statement text was assembled.',
      { context: { candidate } },
    );
  }

  return crossDomain;
}

/**
 * Validates a table name for a WRITE, refusing any table outside the Catalog boundary.
 *
 * ⭐⭐ THIS IS WHERE SEC-SQL-SCOPE-01's CLASSIFICATION IS ENFORCED RATHER THAN MERELY RECORDED, and it is
 * the whole difference between this fix and a comment. The sixteen `cross-domain-read-only` tables are
 * reached to ANSWER A QUESTION — an existence chain, a code fallback, a fetch branch, an attribute-set
 * selection — and never to write. A write path that named one would require a privilege the least-privilege
 * credential in the header does not grant, so it would fail at the database; refusing at COMPOSITION means
 * it fails with a message naming the classification, before a connection is involved and before an
 * over-granted deployment could let it through.
 *
 * ⚠️ VALIDATES AGAINST THE SCOPES, NOT AGAINST {@link TABLE_NAME_LOOKUP}, AND THE DIFFERENCE IS NOT
 * COSMETIC. That map is keyed by {@link PhysicalTableName} — the twelve tables with a column map — which
 * includes `SwAlternateSkuCode`, a table this service JOINS for the SKU-code fallback and must never write.
 * Deriving the gate from `TABLE_SCOPES` instead refuses that name and admits `SwAttributeValue`, the one
 * cross-domain table the importer legitimately writes. A gate built on the column map would have got both
 * of those backwards while looking correct.
 *
 * @param candidate - the name to validate, in any accepted vocabulary.
 * @returns the canonical physical name, guaranteed writeable.
 * @throws {DomainError} when the name is unregistered, or is registered as `cross-domain-read-only`.
 */
export function assertWriteTableName(candidate: string): WriteableTableName {
  const resolved = assertRegisteredTableName(candidate);

  /* ⭐ THE PREDICATE IS THE GUARD, WHICH IS WHY THERE IS NO CAST ON THIS PATH. {@link isWriteableTableName}
   * states the scope test to the compiler as a type predicate, so the narrowing below is CHECKED rather
   * than asserted — and a name whose scope is later changed to read-only starts being refused here without
   * any edit to this function. */
  if (!isWriteableTableName(resolved)) {
    throw new DomainError(
      'A write statement named a table on the ratified cross-domain READ surface, which this service ' +
        'reaches only to answer questions and never to modify. It was refused before any statement text ' +
        'was assembled.',
      { context: { table: resolved, scope: TABLE_SCOPES[resolved] } },
    );
  }

  return resolved;
}

/**
 * Type predicate narrowing a registered name to the writeable subset.
 *
 * Implemented by reading the name's declared scope, so this predicate and {@link WriteableTableName} are
 * two views of the same one-word declaration in {@link TABLE_SCOPES} and cannot disagree.
 *
 * @param candidate - a registered physical name.
 * @returns true when the name's scope permits writing.
 */
function isWriteableTableName(candidate: RegisteredTableName): candidate is WriteableTableName {
  const scope: TableScope = TABLE_SCOPES[candidate];

  return scope !== 'cross-domain-read-only';
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

/**
 * Validates a column on ANY registered table, Catalog or cross-domain.
 *
 * ⭐⭐ THE COLUMN HALF OF SEC-SQL-SCOPE-01's "require every emitted table/column to pass one auditable
 * registry". {@link assertColumnName} covers only the twelve tables {@link TABLE_COLUMNS} maps, which left
 * every cross-domain column — the existence chain's stock keys, the attribute family's set and value keys —
 * emitted from private literals that no gate saw. This function closes that half by dispatching on which of
 * the two registries owns the table, so ONE call site shape serves both and no caller has to know which
 * registry a name lives in.
 *
 * ⚠️ THE DISPATCH IS EXHAUSTIVE BY CONSTRUCTION, not by a default branch. {@link ExtendedTableName} is
 * defined as the registry MINUS {@link PhysicalTableName}, so the two maps partition the registry: a name
 * is in exactly one, and the `in` test below therefore always resolves. That is why there is no unreachable
 * `else` to write a placeholder into.
 *
 * @param table - a table name already validated by {@link assertRegisteredTableName}.
 * @param candidate - the column name to validate.
 * @returns the canonical column name as its declaration spells it.
 * @throws {DomainError} when the table does not declare the column in this subtree's registry.
 */
export function assertRegisteredColumnName(table: RegisteredTableName, candidate: string): string {
  if (table in TABLE_COLUMN_LOOKUP) {
    return assertColumnName(table as PhysicalTableName, candidate);
  }

  const declared = EXTENDED_TABLE_COLUMNS[table as ExtendedTableName];
  const normalized = candidate.trim();

  /* Matched case-insensitively for the same reason `TABLE_COLUMN_LOOKUP` is: the legacy interpolates these
   * names with inconsistent casing — `modifiedDatetime` at `model/dao/ProductDAO.cfc:L363` beside
   * `CreatedByAccountID` at `:L365` — and got away with it because SQL identifiers are case-insensitive on
   * the engines it targeted. Resolving to the DECLARED spelling removes the dependency on that leniency. */
  for (const column of declared) {
    if (column.toLowerCase() === normalized.toLowerCase()) {
      return column;
    }
  }

  throw new DomainError(
    'A statement named a column that this service does not declare on the ratified cross-domain table ' +
      'it was applied to, so it was refused before any statement text was assembled.',
    { context: { table, candidate, scope: TABLE_SCOPES[table] } },
  );
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
 * ⭐ SEC-HARDENING (D18-CLASS) — DUPLICATE-KEY TRANSLATION, SHARED BY BOTH DRIVER PATHS
 * ================================================================================================
 * A duplicate key is not a uniqueness-path concept — ANY write in the subtree can hit one — so the report
 * has to be the same wherever it happens, and that is why the translation lives in this shared module
 * rather than beside any one probe.
 *
 * ⭐ THIS PARAGRAPH DESCRIBES A PAIR AGAIN — REVIEW FINDING SEC-RACE-01. The check-then-write race on the
 * uniqueness path is closed in two places: `./UniquePropertyChecker` serialises the check against the write
 * with a `FOR UPDATE` when it is transaction-scoped, and this helper classifies the collision for the
 * writers a lock cannot bind. An intervening revision withdrew the first half, holding that "the single
 * declared hardening exception — D18, the importer's SQL parameter binding (AAP §0.6.7.7) — does not extend
 * by analogy to a locking read". SEC-RACE-01 reverses that: §0.6.7 is the DEFECT AND TODO CARRY-OVER
 * REGISTER of twenty-one LEGACY BUSINESS-LOGIC defects, so it never spoke to the extracted service's data
 * integrity under concurrency, and reading D18 as the sole licence to take a lock would make §0.6.7.7 say a
 * faithful migration must reproduce a TOCTOU race. THE HALF IN THIS MODULE never rested on the locking
 * argument and is unchanged in kind: it classifies a failure the driver already raised. The two are
 * complementary rather than redundant — a lock serialises writers that take it, a constraint binds every
 * writer including a legacy CFML request against the same schema, and this helper is what makes the second
 * one's verdict legible.
 *
 * ⭐ THERE ARE EXACTLY TWO ROUTES TO THE DRIVER IN THIS SUBTREE, AND BOTH USE THIS ONE HELPER.
 * `QueryRunner.runStatement` below is the pool-bound route; `createExecutor`'s local `runStatement` in
 * `./UnitOfWork` is the transaction-scoped route. That is the complete list — the folder's central
 * guarantee is that no other code speaks to the database — so translating in both places translates
 * everywhere, and translating HERE rather than twice means the two can never disagree about what a
 * collision looks like. `./UnitOfWork` already imports `assertTableName`, `assertColumnName` and
 * `readAffectedRows` from this module, so the shared home costs it no new dependency.
 *
 * ⚠️ NOT A BEHAVIOUR CHANGE — SEE {@link UniqueConstraintViolationError} FOR THE FULL ADJUDICATION.
 * The same writes succeed, the same writes fail, at the same moment. A failure that previously escaped
 * as the driver's own object now escapes as a typed one that classifies itself as a request rejection
 * instead of an undisclosed service fault. No retry is PERFORMED here, no backoff, no second attempt and no
 * fallback write: a lost race is REPORTED, never papered over. Performing a retry inside this module would
 * be the invented behaviour AAP §0.8.2 Guideline 4 forbids, and it would also be wrong for a duplicate key,
 * since the caller's own validation verdict is stale by the time the collision is known.
 *
 * ⭐ WHAT IS ADDED IS A CLASSIFICATION, WHICH IS NOT THE SAME AS A RETRY, AND THE DISTINCTION IS THE WHOLE
 * OF SEC-RACE-01's "retry duplicate-key conflicts where semantics permit" CLAUSE. The finding asks that a
 * conflict be retryABLE where the semantics permit — not that this module decide the semantics. It cannot:
 * whether re-running is correct depends on what the caller was doing, and only the caller knows. So each
 * translated failure now carries `retryable` in its context, set from the FAILURE MODE rather than guessed:
 *   • a duplicate key is `retryable: false` — the value is taken, and asking again gets the same answer;
 *   • a DEADLOCK (errno 1213) and a LOCK-WAIT TIMEOUT (errno 1205) are `retryable: true` — the transaction
 *     was rolled back or timed out through no fault of its own, and the identical request may well succeed.
 * The second pair is newly classified BECAUSE this port now takes locks. Introducing locks introduces those
 * two failure modes; leaving them indistinguishable from a syntax error or a permission refusal would make
 * the lock a net loss for a caller trying to behave correctly.
 *
 * ⛔ AND EVERY OTHER FAILURE STILL PASSES THROUGH UNTOUCHED — same object, same message, same stack, same
 * identity under `instanceof`. Three error numbers are classified; nothing else is.
 * ============================================================================================== */

/**
 * MySQL's server error number for a rejected duplicate key: `ER_DUP_ENTRY`.
 *
 * Named as a constant rather than written inline because it is matched in one place and asserted in
 * another, and a bare `1062` at two sites is two chances to mistype a number with no compiler to
 * notice. The driver reports it on `errno`, and reports the same condition symbolically on `code` as
 * `'ER_DUP_ENTRY'`; both are checked, because which fields a driver populates is the driver's choice
 * and not a contract this port can pin.
 *
 * It is a MySQL fact, not an invented threshold: AAP §0.7.3 S9 forbids inventing numbers, and this one
 * is the server's own. Compare the sibling note on `ER_WRONG_ARGUMENTS (errno 1210)` above, recorded
 * for the same reason.
 */
export const MYSQL_DUPLICATE_ENTRY_ERRNO = 1062;

/** The driver's symbolic spelling of {@link MYSQL_DUPLICATE_ENTRY_ERRNO}. */
const MYSQL_DUPLICATE_ENTRY_CODE = 'ER_DUP_ENTRY';

/**
 * MySQL's server error number for a transaction rolled back to break a deadlock: `ER_LOCK_DEADLOCK`.
 *
 * ⭐ CLASSIFIED BECAUSE THIS PORT NOW TAKES LOCKS — review finding SEC-RACE-01. Before the locking reads in
 * `./UniquePropertyChecker` and `./UnitOfWork` this failure mode was not reachable from any statement this
 * subtree emits. Introducing the locks makes it reachable, so naming it is part of introducing them rather
 * than an unrelated addition: a caller that cannot tell a deadlock from a syntax error cannot behave
 * correctly in the face of one.
 *
 * A MySQL fact, not an invented threshold (AAP §0.7.3 S9). The server rolls the victim transaction back
 * ENTIRELY, which is exactly why the identical request may succeed on a second attempt — nothing of it
 * survived to conflict with.
 */
export const MYSQL_LOCK_DEADLOCK_ERRNO = 1213;

/** The driver's symbolic spelling of {@link MYSQL_LOCK_DEADLOCK_ERRNO}. */
const MYSQL_LOCK_DEADLOCK_CODE = 'ER_LOCK_DEADLOCK';

/**
 * MySQL's server error number for a lock that could not be acquired in time: `ER_LOCK_WAIT_TIMEOUT`.
 *
 * The sibling of {@link MYSQL_LOCK_DEADLOCK_ERRNO} and classified for the same reason. It differs from a
 * deadlock in one respect a caller may care about, which is why the two are separate constants rather than
 * one: a timeout does NOT necessarily roll the whole transaction back, so a caller that retries must retry
 * the transaction rather than the statement. The classification says only that the failure was transient.
 */
export const MYSQL_LOCK_WAIT_TIMEOUT_ERRNO = 1205;

/** The driver's symbolic spelling of {@link MYSQL_LOCK_WAIT_TIMEOUT_ERRNO}. */
const MYSQL_LOCK_WAIT_TIMEOUT_CODE = 'ER_LOCK_WAIT_TIMEOUT';

/**
 * How many characters of a constraint name are retained in the internal account.
 *
 * A constraint name is an identifier the SCHEMA chose, not caller data, so it is safe to record —
 * but it arrives inside a driver message, and a message is a channel an attacker may be able to
 * influence in ways this port cannot audit. Capping it keeps a hostile or corrupted value from
 * becoming an unbounded write into whatever log consumes the error (CWE-117), on the same reasoning
 * `../../validation/Validator.ts` records for its own echo limit.
 */
const CONSTRAINT_NAME_ECHO_LIMIT = 96;

/**
 * Reports whether a caught value is MySQL's rejection of a duplicate key.
 *
 * Structural rather than `instanceof`, deliberately. The value arrives typed `unknown` under
 * `useUnknownInCatchVariables`, the driver's error class is not part of any contract this port
 * declares, and a test double must be able to produce the same condition without importing driver
 * internals. Reading two well-known fields off an object is what both a real driver error and a
 * faithful double satisfy.
 *
 * @param cause - the caught value, of unknown type.
 * @returns true when the value identifies itself as a duplicate-key rejection.
 */
export function isDuplicateEntryFailure(cause: unknown): boolean {
  return matchesMySqlFailure(cause, MYSQL_DUPLICATE_ENTRY_ERRNO, MYSQL_DUPLICATE_ENTRY_CODE);
}

/**
 * Reports whether a caught value is one of MySQL's two TRANSIENT lock failures.
 *
 * ⭐ TRANSIENT MEANS "THE IDENTICAL REQUEST MAY SUCCEED", WHICH IS THE ONLY CLAIM MADE. It does not mean
 * the request WILL succeed, and it does not mean this port retries anything — see the section header for
 * why classifying and retrying are different acts and why only the caller can decide the second.
 *
 * Structural rather than `instanceof`, for the same three reasons {@link isDuplicateEntryFailure} is: the
 * value arrives typed `unknown` under `useUnknownInCatchVariables`, the driver's error class is part of no
 * contract this port declares, and a test double must be able to produce the condition without importing
 * driver internals.
 *
 * @param cause - the caught value, of unknown type.
 * @returns true when the value identifies itself as a deadlock or a lock-wait timeout.
 */
export function isTransientLockFailure(cause: unknown): boolean {
  return (
    matchesMySqlFailure(cause, MYSQL_LOCK_DEADLOCK_ERRNO, MYSQL_LOCK_DEADLOCK_CODE) ||
    matchesMySqlFailure(cause, MYSQL_LOCK_WAIT_TIMEOUT_ERRNO, MYSQL_LOCK_WAIT_TIMEOUT_CODE)
  );
}

/**
 * The one structural match every failure predicate above shares.
 *
 * Extracted rather than written three times because the shape check — object, non-null, then two
 * well-known fields — is identical in each case, and three copies are three chances for one to drift into
 * accepting a value the others reject.
 *
 * @param cause - the caught value, of unknown type.
 * @param errno - the server error number to match on `errno`.
 * @param code - the driver's symbolic spelling to match on `code`.
 * @returns true when either field identifies the failure. BOTH are checked because which fields a driver
 *   populates is the driver's choice and not a contract this port can pin.
 */
function matchesMySqlFailure(cause: unknown, errno: number, code: string): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false;
  }

  const candidate = cause as { readonly errno?: unknown; readonly code?: unknown };

  return candidate.errno === errno || candidate.code === code;
}

/**
 * Extracts the constraint name from a duplicate-key failure, discarding the colliding value.
 *
 * ⚠️ THE VALUE IS DELIBERATELY DROPPED, AND THAT IS THE WHOLE POINT OF THIS FUNCTION EXISTING.
 * MySQL's message reads `Duplicate entry '<value>' for key '<table>.<index>'`. The first quoted group
 * is CALLER DATA — routinely the very field being validated, and on this path routinely a product
 * code, SKU code or URL title. Forwarding it into an error object risks it reaching a log, a trace or
 * a serialized diagnostic. The second quoted group is a schema identifier, which discloses nothing
 * about the caller and is the only part that helps a reader work out WHICH rule was violated.
 *
 * The full driver error is still attached as `cause` by the translator below, so nothing is destroyed;
 * what changes is that the value is no longer promoted into a field this port composed itself.
 *
 * @param cause - the caught value, already known to be a duplicate-key rejection.
 * @returns the constraint name, truncated to {@link CONSTRAINT_NAME_ECHO_LIMIT}, or undefined when
 *   the message does not carry one in the documented shape.
 */
export function describeDuplicateEntryConstraint(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }

  const { message } = cause as { readonly message?: unknown };

  if (typeof message !== 'string') {
    return undefined;
  }

  /*
   * Anchored on the literal `for key '` that MySQL emits, and matching to the NEXT quote rather than
   * greedily to the last one, so a colliding value that itself contains `for key '` cannot extend the
   * captured span. Only printable ASCII other than a quote is admitted, which excludes the control
   * characters a log-injection payload would need.
   */
  const matched = /for key '([\x20-\x26\x28-\x7e]*)'/.exec(message);
  const constraintName = matched?.[1];

  if (constraintName === undefined || constraintName.length === 0) {
    return undefined;
  }

  return constraintName.length > CONSTRAINT_NAME_ECHO_LIMIT
    ? `${constraintName.slice(0, CONSTRAINT_NAME_ECHO_LIMIT)}…`
    : constraintName;
}

/**
 * Re-raises a caught driver failure, typing it when — and only when — it is one of THREE known conditions.
 *
 * ⭐ EVERY OTHER FAILURE PASSES THROUGH COMPLETELY UNTOUCHED, by `throw cause` on the original value.
 * A connection reset, a syntax error and a permission refusal all reach the caller exactly as they did
 * before this helper existed — same object, same message, same stack, same identity under `instanceof`.
 * Narrowing the translation to three error numbers is what keeps this a reporting change rather than a
 * rewrite of the port's failure surface, and it is why the helper re-throws rather than returning a value:
 * its return type is `never`, so a caller cannot accidentally continue past a failure it did not handle.
 *
 * ⭐ THE THIRD AND SECOND CONDITIONS ARE NEW WITH REVIEW FINDING SEC-RACE-01, AND THEY ARE NEW BECAUSE THE
 * LOCKS ARE. A deadlock and a lock-wait timeout were formerly listed in this docblock among the failures
 * that pass through untouched, and that was right while no statement this subtree emitted could provoke
 * them. The locking reads in `./UniquePropertyChecker` and `./UnitOfWork` make both reachable, so both are
 * now classified as RETRYABLE — the "retry duplicate-key conflicts where semantics permit" half of the
 * finding's resolution, discharged by making retryability LEGIBLE rather than by retrying here. See the
 * section header for why this module must not decide the semantics.
 *
 * ⚠️ ALL THREE ARRIVE AS `UniqueConstraintViolationError`, WHICH IS DELIBERATE AND WORTH DEFENDING. A new
 * error class per failure mode would widen `src/errors/**` for a distinction every caller can already draw
 * from `context.retryable`, and it would break the one thing callers do today — catching a concurrency
 * conflict at the persistence boundary. The class says "the write lost a race with another writer", which is
 * true of all three; the context says which kind of race and whether asking again could help.
 *
 * @param cause - the caught value, of unknown type.
 * @param parameterCount - how many values the failing statement bound. Recorded instead of the
 *   statement text and instead of the values, matching the sibling throw sites in this module, which
 *   record a count for the same reason: it is diagnostic without being disclosive.
 * @returns never — the function always throws.
 * @throws {UniqueConstraintViolationError} when the failure is a duplicate-key rejection (`retryable:
 *   false`), a deadlock or a lock-wait timeout (`retryable: true`).
 * @throws {unknown} the original caught value, unchanged, in every other case.
 */
export function rethrowTranslatingDuplicateEntry(cause: unknown, parameterCount: number): never {
  /* SEC-RACE-01 — the transient pair is checked FIRST, and the order is not arbitrary: the two predicates
   * are disjoint by construction (three distinct error numbers), so either order gives the same answer, and
   * checking the newer arm first keeps the older arm's body exactly as it was. */
  if (isTransientLockFailure(cause)) {
    const deadlocked = matchesMySqlFailure(
      cause,
      MYSQL_LOCK_DEADLOCK_ERRNO,
      MYSQL_LOCK_DEADLOCK_CODE,
    );

    throw new UniqueConstraintViolationError(
      deadlocked
        ? 'The database rolled this transaction back to break a deadlock with another writer, so no ' +
            'part of it was applied. The identical request may succeed if it is made again.'
        : 'The database could not acquire a lock another writer was holding before the wait timed ' +
            'out, so the write did not happen. The identical request may succeed if it is made again.',
      {
        cause,
        context: {
          parameterCount,
          errno: deadlocked ? MYSQL_LOCK_DEADLOCK_ERRNO : MYSQL_LOCK_WAIT_TIMEOUT_ERRNO,
          /* ⭐ THE CLASSIFICATION, NOT A DECISION. `true` says "asking again is not futile", which is what
           * the server's own rollback establishes. Whether asking again is CORRECT is the caller's
           * question, and this module deliberately does not answer it. */
          retryable: true,
        },
      },
    );
  }

  if (!isDuplicateEntryFailure(cause)) {
    throw cause;
  }

  const constraintName = describeDuplicateEntryConstraint(cause);

  throw new UniqueConstraintViolationError(
    'The database refused a write because a value it carries is already held by another row, so the ' +
      'uniqueness check that preceded it was overtaken.',
    {
      cause,
      context: {
        parameterCount,
        errno: MYSQL_DUPLICATE_ENTRY_ERRNO,
        /* ⛔ FALSE, AND STATED RATHER THAN OMITTED. The value is taken; asking again gets the same answer,
         * and the caller's own validation verdict is stale by now. Recording it explicitly is what lets a
         * caller branch on `retryable` alone instead of having to know which errno means what. */
        retryable: false,
        ...(constraintName !== undefined ? { constraintName } : {}),
      },
    },
  );
}

/* ================================================================================================
 * ROW-COUNT BINDING — THE ONE PLACE A PAGING FIGURE IS TURNED INTO A BOUND VALUE
 * ================================================================================================
 * `toRowCountBinding` is the whole of this section, and its one caller is the smart list's paged read
 * in `./SmartListQueryBuilder.ts` — the port of `org/Hibachi/HibachiSmartList.cfc`'s page view.
 *
 * ⛔ IT USED TO HAVE COMPANY: `PreparedBoundedRead`, `prepareBoundedRead` and `settleBoundedRead`
 * implemented the one-extra-row probe shared by the explicitly bounded repository members — a window
 * validator that raised rather than clamped, and a settler that discarded the probe row and reported
 * `hasMore` as an observed fact. All three have been REMOVED, because the members they served have
 * been: `../../ports/repositories/SkuRepository.ts` and `../../ports/repositories/OptionRepository.ts`
 * each record the withdrawal of their windowed companions, which left these helpers with no caller in
 * `src/**` at all. They are exclusive support for a surface that no longer exists, so they went with
 * it rather than remaining as a mechanism nothing drives.
 *
 * ⭐ WHAT THAT REMOVAL DID NOT TOUCH. `toRowCountBinding` stays exactly as it was, because the smart
 * list's paging is a different thing entirely: it is carried from legacy source
 * [`org/Hibachi/HibachiSmartList.cfc`], reached from a routed member, and covered by its own suite. The
 * driver constraint documented below is likewise unchanged, and it is the reason the function exists.
 * ============================================================================================== */

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
 * `destroy` IS PART OF THE CONTRACT ON PURPOSE. A connection whose begin, commit or roll-back itself
 * failed has an unknown transaction state, and returning it to a warm pool would hand that state to
 * the next caller. The boundary needs a way to take such a connection out of service rather than
 * recycle it, and this is that way. All three failing steps are named because all three reach it: the
 * boundary withdraws the connection's standing BEFORE `beginTransaction` is attempted, so a begin that
 * failed part-way through is disposed of exactly as a failed settlement is. `test/adapters/MySqlSkuRepository.test.ts`'s folded `UnitOfWork` block
 * asserts each of the three, against this contract's own double.
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
 *   `MySqlProductRepository.ts`; and `ProductTypeStatementExecutor` in
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
   * ⭐ SEC-HARDENING (D18-CLASS) — A DUPLICATE KEY IS TRANSLATED HERE, AND NOTHING ELSE IS.
   * This is one of the two routes to the driver in the subtree, so it is one of the two places
   * {@link rethrowTranslatingDuplicateEntry} is applied; `./UnitOfWork`'s `createExecutor` is the
   * other. See that helper for the F6 adjudication in full. Every failure that is NOT MySQL error
   * 1062 leaves this method as the identical object the driver raised.
   *
   * @param sql - the statement text as composed by the caller.
   * @param params - the values to bind, in legacy positional order.
   * @returns the driver's answer, unnarrowed.
   * @throws {DomainError} when the statement text is blank, a parameter is not a bindable scalar, or
   *   the statement's placeholder count does not match the number of values supplied.
   * @throws {UniqueConstraintViolationError} when the driver refuses the write as a duplicate key.
   */
  private async runStatement(sql: string, params: readonly unknown[]): Promise<unknown> {
    if (sql.trim().length === 0) {
      throw new DomainError(
        'A blank statement reached the execution boundary, so there was nothing to prepare.',
        { context: { parameterCount: params.length } },
      );
    }

    try {
      const [driverResult] = await this.pool.execute(sql, toBoundValues(params));

      return driverResult;
    } catch (cause: unknown) {
      /*
       * The catch wraps ONLY the driver call, not the blank-statement guard above and not the
       * parameter narrowing inside `toBoundValues`, so a `DomainError` this class raised deliberately
       * can never be mistaken for a driver failure and re-examined as one.
       */
      rethrowTranslatingDuplicateEntry(cause, params.length);
    }
  }
}

/* =====================================================================================================
 * FOLDED IN FROM `src/adapters/mysql/catalogAggregates.ts` — AAP §0.4.1 INVENTORY ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THIS SECTION IS HERE RATHER THAN IN ITS OWN FILE. AAP §0.4.1 freezes the subtree at 102 files and
 * `QueryRunner.ts` was not one of them. It holds the association loaders that hydrate a selection's
 * brands, product types, default SKUs and SKU options — real, covered behaviour — so it is folded into an
 * approved adapter rather than deleted, and every declaration and doc paragraph below is unchanged.
 *
 * ⭐ WHY THIS HOST AND NOT `rowMappers.ts`, WHICH READS AS THE MORE OBVIOUS CHOICE. The section needs
 * BOTH files: `assertColumnName`/`assertTableName` and `SqlExecutor`/`PhysicalTableName` from this one,
 * and the six row mappers plus `MySqlRow` from `./rowMappers`. The existing edge runs THIS FILE ->
 * `./rowMappers` (for `toRows`) and NOT the other way, so hosting the section in `rowMappers.ts` would
 * have made `rowMappers` import `QueryRunner` for the two guards — a genuine RUNTIME import cycle
 * between two adapter modules. Hosting it here creates none: the mapper imports it already needs are
 * type-safe additions in the direction the dependency already points. That asymmetry is the whole reason
 * for the choice, and it was measured rather than assumed.
 *
 * ⛔ WHAT THE FOLD ADDED TO THIS FILE'S IMPORTS, EXACTLY. Four names it did not have —
 * `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE`, the six row mappers, four domain entity types and
 * `SmartListEntityName` — and nothing else. `DataIntegrityError`, `MySqlRow`, `assertColumnName`,
 * `assertTableName`, `PhysicalTableName` and `SqlExecutor` were already here or are declared here, so
 * those six import lines disappeared entirely. No import points at a service, a handler or an
 * integration, so the layering is unchanged.
 *
 * ⚠️ THE FOLD CHANGES ONLY THE IMPORT PATH ITS CONSUMERS WRITE — `src/config/container.ts` and six test
 * suites now name this file.
 * ================================================================================================== */

/**
 * Resolves the many-to-one associations a hydrated Catalog record needs before business logic reads it.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/src/adapters/mysql/**` | CREATE. This module is the
 * "aggregate loader" half of the Data Mapper pattern AAP 0.3.3 assigns to this layer; the scalar half
 * is `src/adapters/mysql/rowMappers.ts` and stays exactly as it is.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS — AND WHY THE FIX IS NOT "MAKE THE ROW MAPPERS RESOLVE ASSOCIATIONS"
 * =================================================================================================
 * `rowMappers.ts` RULE 3 is explicit and this module is written to obey it, not to work around it: a
 * row mapper hydrates scalar columns only, and every many-to-one field is left genuinely ABSENT rather
 * than filled with a stub. That rule states its own escape hatch, and this module is that hatch:
 *
 *   "A caller either resolves the association through the repository or gets a compile error. The
 *    foreign-key value is not lost either — the repository holds the same row and reads the `*ID`
 *    column itself when it needs to resolve the other side."
 *
 * That is precisely the mechanism here. Every loader below receives the RAW ROWS alongside the mapped
 * entities, reads the foreign-key column the mapper deliberately skipped, and resolves the other side
 * with its own parameterized statement. Nothing stubs, nothing guesses, and `rowMappers.ts` keeps its
 * invariant intact.
 *
 * ⚠️ TWO FINDINGS SHARE ONE ROOT CAUSE, WHICH IS WHY THEY SHARE ONE FIX. Both reported symptoms are the
 * same absent-association fault observed at two different roots:
 *
 *   INT-02 — `SmartListQueryBuilder` projects `<baseAlias>.*`, so a SKU smart list hydrates SKUs whose
 *            `product` is absent. The Google feed's first act is `requireProduct(sku)`, so EVERY item
 *            raised and the feed produced nothing.
 *   DATA-02 — the same builder rooted at `SlatwallOption` hydrates options whose `optionGroup` is
 *            absent. `OptionService.getOption` reads through that builder and
 *            `SkuService.createSkus` immediately calls `requireOptionGroupID(option)`, so EVERY
 *            merchandise SKU creation with options raised.
 *
 * Both are resolved by giving the builder a per-root loader rather than by patching either consumer:
 * the consumers' guards are correct and stay as they are. A guard that fires on absent data is doing
 * its job; the defect was that the data was absent.
 *
 * ⚠️ WHAT EACH ROOT LOADS IS DETERMINED BY WHAT ITS CONSUMERS ACTUALLY READ, not by loading everything
 * reachable. Eager-versus-lazy is this layer's decision to make (RULE 3), and it is made narrowly:
 *
 *   SlatwallSku      -> `product`, and on that product `productType`, `brand`, `defaultSku`.
 *                       `product.getPrice()` falls through to `defaultSku.getPrice()`, which is why the
 *                       default SKU is required and not merely convenient.
 *   SlatwallOption   -> `optionGroup`. Required, never optional [model/entity/Option.cfc:L59].
 *   SlatwallProduct  -> `productType`, `brand`, `defaultSku` and `skus`.
 *
 * The remaining three roots — `SlatwallProductType`, `SlatwallBrand`, `SlatwallOptionGroup` — and
 * `SlatwallAlternateSkuCode` declare NO loader. That is a decision, not an omission: `Brand` and
 * `OptionGroup` declare no many-to-one at all, and `ProductType.parentProductType` is not how the
 * hierarchy is read — `getBaseProductType` walks `productTypeIDPath` through an injected resolver, and
 * the tree query has its own dedicated projection. Declaring an empty loader for them would suggest
 * there was something to load.
 *
 * ⚠️ THE BRAND ASSOCIATION IS OPTIONAL AND STAYS OPTIONAL. `integrationServices/google/controllers/
 * feed.cfc` joins to brand with a LEFT join and the view guards the read at `product.cfm:L32`, so a
 * product with no brand is ordinary data rather than a fault. An absent `brandID`, or one naming a row
 * that no longer exists, leaves the field absent and raises nothing. `productType` is the opposite: the
 * view dereferences it unguarded, so its absence is left to surface at the consumer's own guard rather
 * than being masked here.
 *
 * ⚠️ ONE STATEMENT PER TABLE PER BATCH, NOT ONE PER ROW. Identifiers are collected and de-duplicated
 * across the whole batch before a single `IN (…)` statement is issued, so a page of fifty SKUs spanning
 * three products issues one product statement rather than fifty. Placeholders are generated to match the
 * identifier count and every value is bound (TR-4); no identifier is ever interpolated into the text.
 *
 * ⚠️ ORDER IS PRESERVED BECAUSE NOTHING IS REORDERED. Loaders mutate the entities they are given in
 * place and never re-sort, filter, replace or copy the arrays, so the caller's query order — which the
 * sorted-SKU odometer and the feed both depend on — survives untouched.
 *
 * ⛔ NOTHING HERE COMMITS, AND NOTHING HERE OPENS A CONNECTION. Every statement runs on the injected
 * executor, which is the same one the caller is using, so a load inside a transaction observes that
 * transaction's own uncommitted writes (M6). The boundary belongs to `src/adapters/mysql/UnitOfWork.ts`.
 *
 * No timeout, retry, batch-size cap, page size or cache lifetime appears below: the legacy declares
 * none and AAP 0.7.3 S9 forbids inventing one.
 */
/* ================================================================================================
 * THE TABLES AND COLUMNS THIS MODULE READS
 *
 * Every identifier goes through the same whitelist the rest of the adapter layer uses, so a typo is a
 * build failure rather than a statement that reaches the driver.
 * ============================================================================================== */

const PRODUCT_TABLE: PhysicalTableName = assertTableName('SwProduct');
const SKU_TABLE: PhysicalTableName = assertTableName('SwSku');
const PRODUCT_TYPE_TABLE: PhysicalTableName = assertTableName('SwProductType');
const BRAND_TABLE: PhysicalTableName = assertTableName('SwBrand');
const OPTION_GROUP_TABLE: PhysicalTableName = assertTableName('SwOptionGroup');
const SKU_OPTION_TABLE: PhysicalTableName = assertTableName('SwSkuOption');
const OPTION_TABLE: PhysicalTableName = assertTableName('SwOption');
const SKU_ACCESS_CONTENT_TABLE: PhysicalTableName = assertTableName('SwSkuAccessContent');
const SKU_SUBSCRIPTION_BENEFIT_TABLE: PhysicalTableName = assertTableName('SwSkuSubsBenefit');

/** The identifier and foreign-key columns each loader reads or filters on. */
const COLUMN = Object.freeze({
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  productBrandID: assertColumnName(PRODUCT_TABLE, 'brandID'),
  productProductTypeID: assertColumnName(PRODUCT_TABLE, 'productTypeID'),
  productDefaultSkuID: assertColumnName(PRODUCT_TABLE, 'defaultSkuID'),
  skuID: assertColumnName(SKU_TABLE, 'skuID'),
  skuProductID: assertColumnName(SKU_TABLE, 'productID'),
  productTypeID: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID'),
  brandID: assertColumnName(BRAND_TABLE, 'brandID'),
  optionGroupID: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID'),
  optionID: assertColumnName(OPTION_TABLE, 'optionID'),
  optionOptionGroupID: assertColumnName(OPTION_TABLE, 'optionGroupID'),
  skuOptionSkuID: assertColumnName(SKU_OPTION_TABLE, 'skuID'),
  skuOptionOptionID: assertColumnName(SKU_OPTION_TABLE, 'optionID'),
  accessContentSkuID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'skuID'),
  accessContentContentID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'contentID'),
  subscriptionBenefitSkuID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
  subscriptionBenefitID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'subscriptionBenefitID'),
});

/**
 * Builds an explicit, TABLE-QUALIFIED projection for one table.
 *
 * Explicit rather than `*` for the reason `MySqlSkuRepository` states about its own projection: it keeps
 * the statement stable if the physical table ever carries a column the entity does not declare. Column
 * order is immaterial — every mapper reads by name.
 *
 * ⭐ QUALIFICATION IS THE DEFAULT, AND IT IS THE FIX FOR A DEFECT THAT COULD ONLY BE SEEN ON A REAL
 * SERVER. This function used to return BARE column names. That is safe in the three single-table
 * statements below and FATAL in the one join: {@link attachSkuOptions} reads
 * `SwSkuOption link INNER JOIN SwOption`, and `optionID` is a column of BOTH tables, so MySQL refused
 * the whole statement with `ER_NON_UNIQ_ERROR (1052): Column 'optionID' in field list is ambiguous`.
 * `SwSkuOption.optionID` is the port's own schema contract — `MySqlSkuRepository.persistSku` writes
 * `INSERT INTO SwSkuOption (skuID, optionID)` and `findSkusBySelectedOptions` reads `so.optionID`
 * (AAP §0.3.3.1) — so the collision is structural rather than incidental, and every SKU-option fetch
 * through `SkuRepository.findByProduct` with `fetchOptions` raised failed on every invocation.
 *
 * ⚠️ FIXING THE ONE CALLER WOULD HAVE LEFT THE TRAP IN PLACE. A projection builder that takes a table
 * name and then discards it is an invitation: every `*_PROJECTION` constant below reads as safe, and the
 * next joined statement that reuses one reproduces the same failure with no warning. Qualifying HERE
 * makes every projection in this module safe in a join by construction, which is the difference between
 * fixing the instance and closing the class.
 *
 * ⚠️ THE QUALIFIER IS THE VALIDATED PHYSICAL TABLE NAME, NEVER A CALLER-SUPPLIED ALIAS. `table` has
 * already been through {@link assertTableName} — the parameter type admits nothing else — so the emitted
 * identifier is drawn from the same whitelist as the columns (AAP §0.7.3: "identifiers built only from
 * validated whitelists"). No alias parameter is accepted, because an alias is a free string and would
 * reopen the identifier surface the whitelist exists to close. Statements that need an ALIASED
 * projection build one from the whitelist themselves, as `MySqlSkuRepository.hydrateSkuOptions` does.
 *
 * ⚠️ AND IT COSTS NOTHING AT EITHER END. Every single-table statement in this module names its table in
 * `FROM` WITHOUT an alias, so `SwProduct.productID` resolves exactly as `productID` did; and the driver
 * returns result keys UNQUALIFIED (`productID`, not `SwProduct.productID`), so every row mapper reads
 * the same field names it always read and none of them changes.
 */
function projectionFor(table: PhysicalTableName, columns: readonly string[]): string {
  return columns.map((column) => `${table}.${assertColumnName(table, column)}`).join(', ');
}

const PRODUCT_PROJECTION = projectionFor(PRODUCT_TABLE, [
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
]);

const SKU_PROJECTION = projectionFor(SKU_TABLE, [
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
]);

const PRODUCT_TYPE_PROJECTION = projectionFor(PRODUCT_TYPE_TABLE, [
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
]);

const BRAND_PROJECTION = projectionFor(BRAND_TABLE, [
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
]);

const OPTION_GROUP_PROJECTION = projectionFor(OPTION_GROUP_TABLE, [
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
]);

const OPTION_PROJECTION = projectionFor(OPTION_TABLE, [
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
]);

/* ================================================================================================
 * THE ONE COLLABORATOR THESE LOADERS CANNOT SUPPLY THEMSELVES
 * ============================================================================================== */

/**
 * What a caller must provide before the product and SKU roots can be resolved.
 *
 * ⛔ THE BINDER IS REQUIRED, NOT OPTIONAL, AND THAT IS DELIBERATE. `src/domain/sku/Sku.ts` records in
 * its own mismatch register that `Sku` IS INTENTIONALLY NOT ASSIGNABLE to
 * {@link ProductDefaultSkuDelegate}: the delegate wants nine synchronous, argument-free readers, while
 * the entity's image and currency equivalents are asynchronous and port-parameterised. The register also
 * names the resolution — "a thin binding adapter in the composition root closes over the ports and
 * satisfies the delegate" — and {@link SkuDefaultSkuDelegateBinder} on `SkuService` is the same
 * collaborator, injected the same way, for the same reason.
 *
 * ⛔ SO THIS MODULE DOES NOT CAST, DOES NOT INVENT `getImageDirectory` ON `Sku`, AND DOES NOT MAKE THE
 * BINDER OPTIONAL. A cast would be unsound and S1 forbids it; inventing the member would contradict
 * `model/entity/Sku.cfc`, which declares no such member, and S9 forbids it; and an optional binder would
 * mean `product.defaultSku` was silently left unresolved, which is exactly the class of half-load this
 * module exists to eliminate. `Product.getPrice()` falls through to `defaultSku.getPrice()`, so an
 * unresolved default SKU makes the Google feed emit an empty `<g:price>` for every item — a quiet wrong
 * answer rather than a failure.
 *
 * ⚠️ MAKING IT REQUIRED PUTS THE COMPILER IN CHARGE OF THE WIRING. Every site that constructs a
 * {@link SmartListQueryBuilder} must now supply these loaders, and therefore a binder, or the build
 * fails. That is a stronger guarantee than any comment, and it costs nothing today because no
 * construction site exists yet.
 */
export interface CatalogAggregateDependencies {
  /**
   * Adapts a hydrated SKU to the shape `Product.defaultSku` accepts.
   *
   * Assembling it needs the setting, pricing and image ports, none of which belong to this layer, so it
   * arrives as the function it is.
   */
  readonly bindDefaultSkuDelegate: (sku: Sku) => ProductDefaultSkuDelegate;
}

/* ================================================================================================
 * THE REQUEST SHAPE
 * ============================================================================================== */

/**
 * One batch of hydrated records whose associations are to be resolved.
 *
 * ⚠️ `rows` AND `entities` MUST BE INDEX-ALIGNED, because that alignment is the only thing connecting a
 * mapped entity to the foreign-key column its mapper skipped. The caller produced both from one result
 * set, so the alignment holds by construction; a loader that re-sorted either would break it silently,
 * which is why no loader here does.
 */
export interface AggregateLoadRequest {
  /**
   * The executor the caller is already using.
   *
   * Reusing it rather than reaching for a pool is what keeps M6 intact: inside a transaction, a load
   * observes that transaction's own uncommitted writes.
   */
  readonly executor: SqlExecutor;
  /** The raw rows, carrying the foreign-key columns the mappers deliberately skipped. */
  readonly rows: readonly MySqlRow[];
  /** The mapped entities, index-aligned with `rows` and mutated in place. */
  readonly entities: readonly unknown[];
}

/** Resolves the associations one root entity's consumers require. */
export type CatalogAggregateLoader = (request: AggregateLoadRequest) => Promise<void>;

/* ================================================================================================
 * READING FOREIGN KEYS OFF A RAW ROW
 * ============================================================================================== */

/**
 * Reads one foreign-key column as a non-empty string, or `undefined` when the association is absent.
 *
 * ⚠️ AN EMPTY STRING IS TREATED AS ABSENCE, NOT AS AN IDENTIFIER. `unsavedvalue=""` means the legacy
 * spells "no value yet" as the empty string as well as NULL (IR-6), so both must collapse to the same
 * answer or a `WHERE id = ''` statement would be issued for a row that simply has no association.
 *
 * @param row - one raw result row.
 * @param column - the whitelisted column name to read.
 * @returns the identifier, or `undefined` when the column is absent, NULL or empty.
 * @throws {DataIntegrityError} when the column holds something that is not a string. A foreign key that
 *   is not text is a schema disagreement, and guessing at a coercion would hide it.
 */
function readForeignKey(row: MySqlRow, column: string): string | undefined {
  const value = row[column];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DataIntegrityError(
      'A Catalog foreign-key column holds a value that is not text, so the association it names ' +
        'could not be resolved. Every identifier in this schema is a 32-character string ' +
        '[model/entity/Sku.cfc:L52].',
      { context: { column, receivedType: typeof value } },
    );
  }

  return value;
}

/** Every distinct identifier the given column holds across the batch, in first-seen order. */
function collectIdentifiers(rows: readonly MySqlRow[], column: string): readonly string[] {
  const seen = new Set<string>();

  for (const row of rows) {
    const identifier = readForeignKey(row, column);
    if (identifier !== undefined) {
      seen.add(identifier);
    }
  }

  return [...seen];
}

/**
 * Loads rows from one table by identifier and indexes the mapped results.
 *
 * Issues NO statement for an empty identifier list — an `IN ()` clause is not legal SQL, and there is
 * nothing to ask for.
 *
 * @param request - the batch being resolved, for its executor.
 * @param table - the whitelisted table to read.
 * @param projection - that table's explicit column list.
 * @param idColumn - the whitelisted identifier column to filter on.
 * @param identifiers - the distinct identifiers wanted.
 * @param mapper - the scalar row mapper for this table.
 * @returns the mapped entities keyed by identifier, alongside the raw row for each.
 */
async function loadByIdentifiers<TEntity>(
  request: AggregateLoadRequest,
  table: PhysicalTableName,
  projection: string,
  idColumn: string,
  identifiers: readonly string[],
  mapper: (row: MySqlRow) => TEntity,
): Promise<Map<string, { readonly entity: TEntity; readonly row: MySqlRow }>> {
  const indexed = new Map<string, { readonly entity: TEntity; readonly row: MySqlRow }>();

  if (identifiers.length === 0) {
    return indexed;
  }

  const placeholders = identifiers.map(() => '?').join(', ');
  const rows = await request.executor.execute(
    `SELECT ${projection} FROM ${table} WHERE ${idColumn} IN (${placeholders})`,
    [...identifiers],
  );

  for (const row of rows) {
    const identifier = readForeignKey(row, idColumn);
    if (identifier !== undefined) {
      indexed.set(identifier, { entity: mapper(row), row });
    }
  }

  return indexed;
}

/* ================================================================================================
 * THE PRODUCT AGGREGATE, SHARED BY TWO ROOTS
 * ============================================================================================== */

/**
 * Resolves `productType`, `brand` and `defaultSku` on a batch of products.
 *
 * Shared by the product root and the SKU root rather than written twice, because "what a usable product
 * carries" is one answer and two copies of it would drift.
 *
 * ⚠️ ASSIGNED AS PLAIN FIELDS, NEVER THROUGH A SETTER — `rowMappers.ts` RULE 1. It also matters
 * specifically here: `Sku.setProduct` would append the SKU to `product.skus` as a side effect, so using
 * it to attach a default SKU would fabricate a collection membership the database never stated. Direct
 * assignment resolves the association and nothing else.
 *
 * @param request - the batch being resolved, for its executor.
 * @param dependencies - supplies the default-SKU delegate binder.
 * @param productRows - the raw product rows, carrying the three foreign keys.
 * @param products - the mapped products, index-aligned with `productRows`.
 */
async function attachProductAssociations(
  request: AggregateLoadRequest,
  dependencies: CatalogAggregateDependencies,
  productRows: readonly MySqlRow[],
  products: readonly Product[],
): Promise<void> {
  const productTypes = await loadByIdentifiers(
    request,
    PRODUCT_TYPE_TABLE,
    PRODUCT_TYPE_PROJECTION,
    COLUMN.productTypeID,
    collectIdentifiers(productRows, COLUMN.productProductTypeID),
    mapProductTypeRow,
  );

  const brands = await loadByIdentifiers(
    request,
    BRAND_TABLE,
    BRAND_PROJECTION,
    COLUMN.brandID,
    collectIdentifiers(productRows, COLUMN.productBrandID),
    mapBrandRow,
  );

  const defaultSkus = await loadByIdentifiers(
    request,
    SKU_TABLE,
    SKU_PROJECTION,
    COLUMN.skuID,
    collectIdentifiers(productRows, COLUMN.productDefaultSkuID),
    mapSkuRow,
  );

  products.forEach((product, index) => {
    const row = productRows[index];
    if (row === undefined) {
      return;
    }

    const productTypeID = readForeignKey(row, COLUMN.productProductTypeID);
    const resolvedProductType =
      productTypeID === undefined ? undefined : productTypes.get(productTypeID);
    if (resolvedProductType !== undefined) {
      product.productType = resolvedProductType.entity;
    }

    /* Optional by design — see the LEFT-join note in this module's header. */
    const brandID = readForeignKey(row, COLUMN.productBrandID);
    const resolvedBrand = brandID === undefined ? undefined : brands.get(brandID);
    if (resolvedBrand !== undefined) {
      product.brand = resolvedBrand.entity;
    }

    /* Bound through the injected adapter, never assigned directly — the entity does not satisfy the
     * delegate and deliberately never will. See {@link CatalogAggregateDependencies}. */
    const defaultSkuID = readForeignKey(row, COLUMN.productDefaultSkuID);
    const resolvedDefaultSku =
      defaultSkuID === undefined ? undefined : defaultSkus.get(defaultSkuID);
    if (resolvedDefaultSku !== undefined) {
      product.defaultSku = dependencies.bindDefaultSkuDelegate(resolvedDefaultSku.entity);
    }
  });
}

/* ================================================================================================
 * THE LOADERS
 * ============================================================================================== */

/**
 * `SlatwallSku` — attaches each SKU's product, fully associated. Resolves INT-02.
 *
 * The Google feed reads `sku.product`, then that product's `productType` (unguarded), `brand` (guarded)
 * and — through `product.getPrice()`'s fall-through — its `defaultSku`. All four are therefore resolved
 * here, in two waves: the products first, then their own associations.
 *
 * ⚠️ ONE PRODUCT INSTANCE PER PRODUCT, SHARED BY EVERY SKU THAT NAMES IT. Sibling SKUs of one product
 * observe the same object, which is what the mapping layer's identity semantics give them and what lets
 * a consumer compare products by reference.
 */
const createSkuAggregateLoader =
  (dependencies: CatalogAggregateDependencies): CatalogAggregateLoader =>
  async (request) => {
    const productIdentifiers = collectIdentifiers(request.rows, COLUMN.skuProductID);

    const products = await loadByIdentifiers(
      request,
      PRODUCT_TABLE,
      PRODUCT_PROJECTION,
      COLUMN.productID,
      productIdentifiers,
      mapProductRow,
    );

    const loaded = [...products.values()];
    await attachProductAssociations(
      request,
      dependencies,
      loaded.map((entry) => entry.row),
      loaded.map((entry) => entry.entity),
    );

    request.entities.forEach((entity, index) => {
      const row = request.rows[index];
      if (row === undefined) {
        return;
      }

      const productID = readForeignKey(row, COLUMN.skuProductID);
      const resolved = productID === undefined ? undefined : products.get(productID);
      if (resolved !== undefined) {
        (entity as Sku).product = resolved.entity;
      }
    });
  };

/**
 * `SlatwallOption` — attaches each option's option group. Resolves DATA-02.
 *
 * `model/entity/Option.cfc:L59` declares the relationship REQUIRED, and `SkuService.createSkus` reads it
 * for every selected option through `requireOptionGroupID`, so without this every merchandise SKU
 * creation carrying options raised.
 *
 * ⚠️ A MISSING GROUP IS LEFT ABSENT RATHER THAN RAISED HERE. The consumer's own guard already reports it
 * with the option identifier and the legacy locator, which is a better error than anything this loader
 * could produce, and raising here would also break the read paths that never touch the group.
 */
const loadOptionAggregates: CatalogAggregateLoader = async (request) => {
  const optionGroups = await loadByIdentifiers(
    request,
    OPTION_GROUP_TABLE,
    OPTION_GROUP_PROJECTION,
    COLUMN.optionGroupID,
    collectIdentifiers(request.rows, COLUMN.optionOptionGroupID),
    mapOptionGroupRow,
  );

  request.entities.forEach((entity, index) => {
    const row = request.rows[index];
    if (row === undefined) {
      return;
    }

    const optionGroupID = readForeignKey(row, COLUMN.optionOptionGroupID);
    const resolved = optionGroupID === undefined ? undefined : optionGroups.get(optionGroupID);
    if (resolved !== undefined) {
      (entity as Option).optionGroup = resolved.entity;
    }
  });
};

/**
 * `SlatwallProduct` — attaches `productType`, `brand`, `defaultSku` and `skus`.
 *
 * The first three come from the shared product aggregate. The SKU collection is loaded here because
 * `ProductService.getProduct` reads through this builder and its callers expect a usable product
 * aggregate.
 *
 * ⚠️ THE SKU COLLECTION IS FILLED BY PUSHING ONTO THE LIVE ARRAY, never by replacing it —
 * `rowMappers.ts` RULE 4 keeps entity collections live, and several domain members mutate the array they
 * are handed in place. Each SKU's own `product` back-reference is assigned directly for the same reason
 * `attachProductAssociations` does: `setProduct` would append a second time.
 *
 * ⚠️ EACH PRODUCT ENTITY RECEIVES ITS OWN SKU INSTANCES, mapped from the shared rows rather than shared
 * as objects. The reason is an object-identity one and is argued at the bucketing step below.
 */
const createProductAggregateLoader =
  (dependencies: CatalogAggregateDependencies): CatalogAggregateLoader =>
  async (request) => {
    const products = request.entities as readonly Product[];

    await attachProductAssociations(request, dependencies, request.rows, products);

    const productIdentifiers = collectIdentifiers(request.rows, COLUMN.productID);
    if (productIdentifiers.length === 0) {
      return;
    }

    const placeholders = productIdentifiers.map(() => '?').join(', ');
    const skuRows = await request.executor.execute(
      `SELECT ${SKU_PROJECTION} FROM ${SKU_TABLE} WHERE ${COLUMN.skuProductID} IN (${placeholders})`,
      [...productIdentifiers],
    );

    /*
     * ⭐ THE ROWS ARE BUCKETED, AND EACH PRODUCT ENTITY THEN MAPS ITS OWN SKU INSTANCES FROM THEM.
     *
     * Bucketing already-mapped SKUs would be one line shorter and is WRONG. `records` and `pageRecords`
     * are materialised from two separate result sets, so they hold DISTINCT Product objects for the same
     * row, and both are handed to this loader in ONE call — see the hook in
     * `SmartListQueryBuilder.execute`. A SKU can back-reference exactly ONE product, so pushing a single
     * SKU instance onto both collections leaves every SKU reachable through `records[0].getSkus()`
     * naming `pageRecords[0]` as its product: two objects for one row, with a mutation through either
     * path invisible on the other. One SKU instance per owning product entity keeps each graph
     * internally consistent, which is the identity Hibernate's session gave the legacy for free and
     * which this port has to arrange for itself.
     *
     * ⚠️ THIS IS NOT THE SAME QUESTION AS THE MANY-TO-ONE SHARING ABOVE. `productType`, `brand` and each
     * SKU's own `product` are TARGETS of an association, so one instance per row shared by every owner
     * is both correct and desirable (`createSkuAggregateLoader` states that explicitly). It is only the
     * OWNED side of a one-to-many — a child carrying a back-reference to exactly one parent — that
     * cannot be shared.
     */
    const skuRowsByProduct = new Map<string, MySqlRow[]>();
    for (const skuRow of skuRows) {
      const owningProductID = readForeignKey(skuRow, COLUMN.skuProductID);
      if (owningProductID === undefined) {
        continue;
      }

      let bucket = skuRowsByProduct.get(owningProductID);
      if (bucket === undefined) {
        bucket = [];
        skuRowsByProduct.set(owningProductID, bucket);
      }
      bucket.push(skuRow);
    }

    products.forEach((product, index) => {
      const row = request.rows[index];
      if (row === undefined) {
        return;
      }

      const productID = readForeignKey(row, COLUMN.productID);
      const bucket = productID === undefined ? undefined : skuRowsByProduct.get(productID);
      if (bucket === undefined) {
        return;
      }

      for (const skuRow of bucket) {
        const sku = mapSkuRow(skuRow);
        sku.product = product;
        product.skus.push(sku);
      }
    });
  };

/**
 * Builds every root's loader, or `undefined` where the root has nothing to resolve.
 *
 * ⚠️ `undefined` IS A DECISION, NOT A GAP, at each of the four roots that carry it — see the header. The
 * map is exhaustive over {@link SmartListEntityName}, so a new root cannot be added to the port without
 * this file being made to state which of the two it is.
 */
export function createCatalogAggregateLoaders(
  dependencies: CatalogAggregateDependencies,
): Readonly<Record<SmartListEntityName, CatalogAggregateLoader | undefined>> {
  return Object.freeze({
    SlatwallSku: createSkuAggregateLoader(dependencies),
    SlatwallOption: loadOptionAggregates,
    SlatwallProduct: createProductAggregateLoader(dependencies),
    /* `getBaseProductType` walks `productTypeIDPath` through an injected resolver and the tree query has
     * its own projection, so `parentProductType` is not read as an association by anything in the slice. */
    SlatwallProductType: undefined,
    /* Declares no many-to-one at all [model/entity/Brand.cfc]. */
    SlatwallBrand: undefined,
    /* Declares no many-to-one at all; its `options` collection is the inverse side. */
    SlatwallOptionGroup: undefined,
    /* No domain module and no association the slice reads. */
    SlatwallAlternateSkuCode: undefined,
  });
}

/* ================================================================================================
 * THE SKU OPTION COLLECTION — REQUESTED EXPLICITLY, NOT BY ROOT
 * ============================================================================================== */

/**
 * Attaches each SKU's `options` collection, with its option groups resolved.
 *
 * Separate from {@link createCatalogAggregateLoaders} because it is requested per call rather than implied by
 * a root: `SkuRepository.findByProduct` takes an explicit `fetchOptions` argument, and the members that
 * read a SKU's options — `getOptionsDisplay`, `getOptionByOptionGroupCode`, `getSkuDefinition` — are only
 * reached on that path. Loading options for every SKU smart list would resolve a collection the feed
 * never reads.
 *
 * ⚠️ THE OPTION GROUPS COME WITH THEM, because the option members that matter here read through the
 * group. `Sku.generateImageFileName` reads `option.getOptionGroup().getImageGroupFlag()`
 * [model/entity/Sku.cfc:L134] and `getOptionsByOptionGroupCodeStruct` keys on the group's code, so an
 * option attached without its group would satisfy the type and then fail — or, worse, answer from a
 * class default. That is exactly the silent-failure class `rowMappers.ts` RULE 3 exists to prevent.
 *
 * ⚠️ ORDERED BY THE LINK TABLE'S NATURAL READ, WITH NO ORDER CLAUSE INVENTED. `model/entity/Sku.cfc:L76`
 * declares no ordering for the option collection — unlike `OptionGroup.getOptions()`, which orders by
 * sort order at `model/entity/OptionGroup.cfc:L73` — so none is imposed here (AAP 0.7.3 S9).
 *
 * @param executor - the caller's executor, so the read shares its transaction (M6).
 * @param skus - the SKUs whose options are wanted; mutated in place.
 */
export async function attachSkuOptions(executor: SqlExecutor, skus: readonly Sku[]): Promise<void> {
  const skuIdentifiers = distinctSkuIdentifiers(skus);

  if (skuIdentifiers.length === 0) {
    return;
  }

  const placeholders = skuIdentifiers.map(() => '?').join(', ');
  /*
   * ⚠️ THE ONLY JOIN IN THIS MODULE, AND THEREFORE THE ONLY STATEMENT WHERE AN UNQUALIFIED PROJECTION
   * IS FATAL. Both tables declare `optionID` — the link table because that IS the association, the
   * option table because that is its primary key — so a bare `optionID` in the field list is ambiguous
   * and MySQL refuses the statement outright with `ER_NON_UNIQ_ERROR (1052)` rather than guessing. That
   * is what happened while {@link projectionFor} emitted bare names: this statement could not run at
   * all, so `SkuRepository.findByProduct` with `fetchOptions` raised — the port of
   * `model/dao/SkuDAO.cfc:L157`'s `INNER JOIN FETCH sku.options` — failed on every invocation.
   *
   * Every projected identifier below is now qualified: `link.` for the link table's own column, and the
   * whitelisted table name for the option's columns, which {@link projectionFor} supplies. The two sides
   * of the `ON` clause were already qualified and are unchanged, as are the bound parameters and their
   * order (TR-4).
   */
  const rows = await executor.execute(
    `SELECT link.${COLUMN.skuOptionSkuID}, ${OPTION_PROJECTION} ` +
      `FROM ${SKU_OPTION_TABLE} link ` +
      `INNER JOIN ${OPTION_TABLE} ON ${OPTION_TABLE}.${COLUMN.optionID} = ` +
      `link.${COLUMN.skuOptionOptionID} ` +
      `WHERE link.${COLUMN.skuOptionSkuID} IN (${placeholders})`,
    [...skuIdentifiers],
  );

  const optionGroups = await loadByIdentifiers(
    { executor, rows, entities: [] },
    OPTION_GROUP_TABLE,
    OPTION_GROUP_PROJECTION,
    COLUMN.optionGroupID,
    collectIdentifiers(rows, COLUMN.optionOptionGroupID),
    mapOptionGroupRow,
  );

  const optionsBySku = new Map<string, Option[]>();
  for (const row of rows) {
    const owningSkuID = readForeignKey(row, COLUMN.skuOptionSkuID);
    if (owningSkuID === undefined) {
      continue;
    }

    const option = mapOptionRowWithGroup(row, optionGroups);

    let bucket = optionsBySku.get(owningSkuID);
    if (bucket === undefined) {
      bucket = [];
      optionsBySku.set(owningSkuID, bucket);
    }
    bucket.push(option);
  }

  for (const sku of skus) {
    const bucket = optionsBySku.get(sku.skuID);
    if (bucket === undefined) {
      continue;
    }

    /* Pushed onto the live array (RULE 4), and NOT through `Sku.addOption`: that member dedupes by
     * reference, which is right for graph construction and wrong for hydration, where each row is a
     * distinct instance and the link table has already decided what the collection contains. */
    for (const option of bucket) {
      sku.options.push(option);
    }
  }
}

/**
 * Maps one joined option row and resolves its group from the pre-loaded index.
 *
 * ⚠️ THE JOINED ROW CARRIES THE LINK TABLE'S `skuID` ALONGSIDE THE OPTION'S OWN COLUMNS, and that does
 * not violate `rowMappers.ts` RULE 2 ("one mapper reads one table's columns"): `mapOptionRow` reads by
 * name and the only added column belongs to no option field, so it is simply never read.
 *
 * @param row - a row carrying the option's own columns plus the link table's SKU identifier.
 * @param optionGroups - the groups already loaded for this batch.
 * @returns the mapped option, with its group attached when the group was found.
 */
function mapOptionRowWithGroup(
  row: MySqlRow,
  optionGroups: ReadonlyMap<string, { readonly entity: OptionGroup }>,
): Option {
  const option = mapOptionRow(row);

  const optionGroupID = readForeignKey(row, COLUMN.optionOptionGroupID);
  const resolved = optionGroupID === undefined ? undefined : optionGroups.get(optionGroupID);
  if (resolved !== undefined) {
    option.optionGroup = resolved.entity;
  }

  return option;
}

/* ================================================================================================
 * THE THREE `INNER JOIN FETCH` BRANCHES OF `getProductSkus`
 * ============================================================================================== */

/**
 * Groups one link table's far identifiers by the SKU that owns them.
 *
 * @param executor - the caller's executor, so the read shares its transaction (M6).
 * @param table - the whitelisted link table.
 * @param skuColumn - its owning SKU column.
 * @param farColumn - its far identifier column.
 * @param skuIdentifiers - the SKUs wanted.
 * @returns far identifiers keyed by SKU identifier, in row order.
 */
async function groupLinkIdentifiers(
  executor: SqlExecutor,
  table: PhysicalTableName,
  skuColumn: string,
  farColumn: string,
  skuIdentifiers: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const grouped = new Map<string, string[]>();

  if (skuIdentifiers.length === 0) {
    return grouped;
  }

  const placeholders = skuIdentifiers.map(() => '?').join(', ');
  const rows = await executor.execute(
    `SELECT ${skuColumn}, ${farColumn} FROM ${table} WHERE ${skuColumn} IN (${placeholders})`,
    [...skuIdentifiers],
  );

  for (const row of rows) {
    const owningSkuID = readForeignKey(row, skuColumn);
    const farIdentifier = readForeignKey(row, farColumn);
    if (owningSkuID === undefined || farIdentifier === undefined) {
      continue;
    }

    let bucket = grouped.get(owningSkuID);
    if (bucket === undefined) {
      bucket = [];
      grouped.set(owningSkuID, bucket);
    }
    bucket.push(farIdentifier);
  }

  return grouped;
}

/** The distinct, saved identifiers of a SKU batch, in first-seen order. */
function distinctSkuIdentifiers(skus: readonly Sku[]): readonly string[] {
  return [...new Set(skus.map((sku) => sku.skuID).filter((skuID) => skuID !== ''))];
}

/**
 * Performs the eager fetch `getProductSkus` requests, for whichever collection its base product type
 * selects.
 *
 * ⚠️ THIS IS THE `FETCH` HALF OF `INNER JOIN FETCH`, AND IT WAS THE MISSING HALF.
 * `model/dao/SkuDAO.cfc:L152-L162` writes three branches, and every one of them is `INNER JOIN FETCH`
 * rather than a plain `INNER JOIN` — except the subscription term at `:L159`, which is deliberately NOT a
 * fetch. Hibernate's `FETCH` keyword does two distinct things at once:
 *
 *   1. it RESTRICTS the result set, because the join is inner — a SKU with none of the association is
 *      excluded, and one with three of it comes back three times; and
 *   2. it POPULATES the association on the returned entities, in the same round trip.
 *
 * `MySqlSkuRepository.findByProduct` already reproduced (1) faithfully, duplicates included. It did not
 * reproduce (2), so a caller that asked for the fetch received SKUs whose collection was still empty —
 * and, because the count of rows was right, nothing looked wrong. Every member that reads a fetched
 * collection then answered from an empty array rather than raising: `getOptionsDisplay` produced the
 * empty string, `getSkuDefinition` produced nothing, and `getOptionsIDList` produced no identifiers.
 * That is a wrong answer with no error attached, which is the failure class this module exists to close.
 *
 * ⚠️ ONE BRANCH PER BASE PRODUCT TYPE, MATCHING THE LEGACY CHAIN EXACTLY, INCLUDING ITS SILENCE. An
 * unrecognised base product type fetches nothing, because `model/dao/SkuDAO.cfc:L154-L161` has no final
 * alternative and simply leaves the statement alone. It does not raise there and does not raise here.
 *
 * ⚠️ THE TWO REFERENCE COLLECTIONS CARRY IDENTIFIERS, NOT ENTITIES, AND THAT IS THE PORT'S OWN SHAPE
 * RATHER THAN A SHORTCUT. `Content` and `SubscriptionBenefit` are out of scope (AAP 0.2.2.1), so
 * `src/domain/sku/Sku.ts` models both collections as identifier references — `AccessContentReference` is
 * `{ contentID }` and `SubscriptionBenefitReference` is `{ subscriptionBenefitID }`. Populating them
 * needs only the link table this adapter already owns the write side of, so no excluded entity is
 * hydrated, queried or constructed.
 *
 * ⚠️ A DUPLICATED SKU RECEIVES THE WHOLE COLLECTION, ONCE PER DUPLICATE. The fan-out of (1) means one
 * SKU may appear several times, and each appearance is a distinct mapped object in this port where
 * Hibernate's identity map would have returned one shared instance. Giving each duplicate the complete
 * collection is the closest available match; the divergence in instance identity is the one
 * `MySqlSkuRepository.findByProduct` already records.
 *
 * ⛔ THE COLLECTIONS ARE APPENDED TO, NEVER REPLACED (RULE 4), and never through the entity's `add*`
 * members: those dedupe by reference, which is correct while a graph is being built and wrong during
 * hydration, where the link table has already decided what the collection contains.
 *
 * @param executor - the caller's executor, so the fetch shares its transaction (M6).
 * @param skus - the SKUs just hydrated; mutated in place.
 * @param baseProductType - the product's resolved base product type, or `undefined` when unresolved.
 */
export async function attachFetchedSkuAssociations(
  executor: SqlExecutor,
  skus: readonly Sku[],
  baseProductType: string | undefined,
): Promise<void> {
  if (skus.length === 0 || baseProductType === undefined) {
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode) {
    /* `model/dao/SkuDAO.cfc:L157` — `INNER JOIN FETCH sku.options`. */
    await attachSkuOptions(executor, skus);
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode) {
    /* `model/dao/SkuDAO.cfc:L155` — `INNER JOIN FETCH sku.accessContents`. */
    const grouped = await groupLinkIdentifiers(
      executor,
      SKU_ACCESS_CONTENT_TABLE,
      COLUMN.accessContentSkuID,
      COLUMN.accessContentContentID,
      distinctSkuIdentifiers(skus),
    );

    for (const sku of skus) {
      for (const contentID of grouped.get(sku.skuID) ?? []) {
        sku.accessContents.push({ contentID });
      }
    }
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode) {
    /* `model/dao/SkuDAO.cfc:L160` — `INNER JOIN FETCH sku.subscriptionBenefits`. The term join at
     * `:L159` is a plain `INNER JOIN` with NO `FETCH`, so `subscriptionTerm` is deliberately left
     * unresolved here; reproducing the restriction without the fetch is exactly what the legacy does. */
    const grouped = await groupLinkIdentifiers(
      executor,
      SKU_SUBSCRIPTION_BENEFIT_TABLE,
      COLUMN.subscriptionBenefitSkuID,
      COLUMN.subscriptionBenefitID,
      distinctSkuIdentifiers(skus),
    );

    for (const sku of skus) {
      for (const subscriptionBenefitID of grouped.get(sku.skuID) ?? []) {
        sku.subscriptionBenefits.push({ subscriptionBenefitID });
      }
    }
  }
}
