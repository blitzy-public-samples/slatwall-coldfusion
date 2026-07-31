/**
 * SmartListQueryBuilder — the typed, parameterized replacement for the framework's dynamic HQL
 * composer, and the sole implementation of `SmartListQueryPort`.
 *
 * AAP 0.4.1.7 makes this file CREATE with `org/Hibachi/HibachiSmartList.cfc` as REFERENCE:
 * *"Filter, like-filter, in-filter, range, keyword and related-property join composition with
 * pagination, emitting parameterized SQL"*. AAP 0.3.3 names the pattern — the query builder that
 * replaces *"HibachiSmartList dynamic paginated HQL composition"*, operating *"behind
 * SmartListQueryPort"* — and rule R4 (AAP 0.4.3.4) names the translation: `ormExecuteQuery(hql,
 * positionalParams)` becomes `pool.execute(sql, params)` with the bound list assembled in exactly
 * the legacy sequence (TR-4), because binding ORDER is observable even when statement text is not.
 *
 * WHY THIS IS A BOUNDARY PORT AT ALL
 * ----------------------------------
 * AAP 0.2.2.7 lists `SmartListQueryPort` among the seven ports because the Google feed's
 * availability gate is `addRange('product.calculatedQATS','1^')` at
 * `integrationServices/google/controllers/feed.cfc:L72`, which reads a CALCULATED INVENTORY
 * property. Inventory and stock are excluded from the slice (AAP 0.2.2.1), so the feed cannot
 * resolve its own record selection and the port is what lets it express the gate anyway (TR-5).
 *
 * THE FIVE CONSUMER CONTRACTS THIS FILE MUST BE ABLE TO EXPRESS
 * ------------------------------------------------------------
 *   1. `model/service/ProductService.cfc:L342-L358` — `getProductSmartList`: base
 *      `SlatwallProduct`, three related-property joins (`:L347`, `:L348`, `:L349`) and five
 *      keyword properties (`:L351-L355`).
 *   2. `model/service/SkuService.cfc:L309-L325` — `getSkuSmartList`: base `SlatwallSku`, three
 *      joins (`:L314-L316`) and five keyword properties (`:L318-L322`), one of them a two-hop
 *      path.
 *   3. `integrationServices/google/controllers/feed.cfc:L58-L73` — the feed: three further joins
 *      layered on consumer 2, three equality filters and one open-ended range.
 *   4. `model/entity/Product.cfc:L251-L261` — `getOptionGroups()`: a THREE-HOP filter path and a
 *      pipe-delimited order, with distinctness switched on explicitly at `:L254`.
 *   5. `model/entity/Product.cfc:L339-L347` — `getOptionsByOptionGroup()`: two filters, one of
 *      them three-hop, distinctness switched on at `:L341`.
 * Related: `model/entity/OptionGroup.cfc:L81-L83` reaches
 * `getPropertySmartList(propertyName="options")`, whose shape {@link describePropertyScopedSmartList}
 * serves.
 *
 * TODO(parity) `model/service/SkuService.cfc:L312` — CONSUMER 2 OBTAINS ITS SMART LIST FROM THE WRONG
 * COLLABORATOR, AND IT DOES NOT MATTER. Consumer 1 calls `getHibachiDAO().getSmartList(...)` at
 * `model/service/ProductService.cfc:L345`, but consumer 2 calls `getSkuDAO().getSmartList(...)`. The
 * two are behaviourally identical: `SkuDAO` extends the local `model/dao/HibachiDAO.cfc`, which
 * extends `org/Hibachi/HibachiDAO.cfc`, where the only `getSmartList` in the chain lives at `:L102` —
 * so the same application-key prefixing at `:L103-L106` applies either way. Carried as a LEGACY
 * INCONSISTENCY rather than a semantic difference; nothing in this file distinguishes the two, because
 * nothing in the legacy does either. Recorded so a reader comparing the two consumers does not go
 * looking for a difference in behaviour that is not there.
 *
 * TODO(parity) `model/service/ProductService.cfc:L342` — DISCREPANCY 1: THE PAGING COMPANION ARGUMENT
 * IS UNTYPED. `getProductSmartList(struct data={}, currentURL="")` declares `currentURL` with NO TYPE
 * at all, so CFML accepts anything for it. Its only use is building paging links, which is a
 * presentation concern and belongs to `src/handlers/**` rather than to statement composition, so it
 * has no representation in {@link SmartListQuery} and none here. The tightening to an optional string
 * where it does surface is recorded rather than made silently (TR-1); this file simply never sees it.
 *
 * THE TWO WAYS THIS FILE FAILS SILENTLY, AND WHAT PREVENTS EACH
 * ------------------------------------------------------------
 * FIRST: EMITTING AN IDENTIFIER THAT CAME FROM A CALLER-SUPPLIED STRING. Every filter property,
 * order column and join target arriving here is a name CHOSEN BY THE CALLER, and every one of them
 * lands in an IDENTIFIER position, where a `?` placeholder cannot bind (AAP 0.3.2). A builder that
 * interpolates them compiles, passes every test written against the five consumers above, and hands
 * an injection surface to the first caller that forwards request input. Every table, column, join
 * target and order column in this file therefore resolves through {@link assertTableName} or
 * {@link assertColumnName}, and every value goes through `?`. There is no third path: an
 * unresolvable hop THROWS rather than degrading. When a legitimate consumer cannot be expressed the
 * whitelist is incomplete and the whitelist is extended — never the escape hatch.
 *
 * SECOND: LOSING DISTINCTNESS. `meta/tests/unit/IssuesTest.cfc:L73-L89` (`issue_1296`) sets the
 * page size to one and asserts that the first record of page one differs from the first record of
 * page two. With related-property joins fanning rows out, distinctness is what keeps that true, and
 * it fails NUMERICALLY — in the count and every paging figure derived from it — with no exception
 * and no type error. See {@link SMARTLIST_DISTINCT_ASYMMETRY} for how the two distinctness rules
 * this file carries differ, and why that difference is the legacy's rather than this file's.
 *
 * WHAT THIS FILE HOLDS — NOTHING (M7)
 * -----------------------------------
 * No result cache, no memoised statement, no module-scope mutable state, no instance-level
 * accumulation, and no port of the query-cache surface at
 * `org/Hibachi/HibachiSmartList.cfc:L1081`. AAP 0.6.6 requires any memoisation in this port be
 * *"scoped to the request object rather than the module, to avoid cross-tenant bleed on a warm
 * container"*, and DI/1 hands out data-access components as singletons
 * (`org/Hibachi/Hibachi.cfc:L289`), so a long-lived accumulating instance would be exactly that
 * bleed. Every scrap of per-query state lives in a local plan object created inside
 * {@link SmartListQueryBuilder.build} and discarded when it returns, which is why one builder
 * instance is safe to share across concurrent invocations and why {@link SmartListQueryBuilder} has
 * no mutable fields at all. The module-level tables below are frozen constants built once at load
 * and never written to, which is a different thing entirely.
 *
 * NOTHING IS CONSTRUCTED HERE EITHER (S3)
 * ---------------------------------------
 * The executor arrives as a typed constructor parameter and is stored `readonly`. No pool is
 * created, no credential is read, no environment is consulted, no connection target is resolved and
 * no default parameter manufactures an executor. That inversion is deliberate: the legacy importer
 * builds a credential-reading connection in three separate places —
 * `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L330` and `:L420`. Nor is any collaborator resolved
 * by name: `model/entity/Product.cfc:L253` reaches `getService("OptionService")` while `:L340`
 * spells the same lookup `getService("optionService")`, a case-insensitivity the legacy exploited
 * and TypeScript will not. Those become typed constructor dependencies IN THE SERVICE LAYER, not
 * lookups here.
 *
 * M6 IS WHY THE EXECUTOR IS INJECTED RATHER THAN REACHED FOR. When `UnitOfWork` hands this builder
 * a transaction-scoped executor, reads must run ON THAT EXECUTOR so they observe the uncommitted
 * siblings the same operation is still writing — the read-back loop of AAP 0.6.2. This file never
 * reaches past the injected {@link SqlExecutor}.
 *
 * M2 IS CITED, NOT ANSWERED HERE. `integrationServices/google/views/feed/product.cfm:L9` declares a
 * 360-second render budget, far beyond the roughly 29-second synchronous integration window of a
 * request-response gateway. That decision belongs to `src/handlers/**`. Nothing here responds to it:
 * no result cap, no streaming mode, no statement timeout and no page size of this file's own
 * invention (S9).
 *
 * IMPORT DIRECTION (S4)
 * ---------------------
 * An adapter may reach `domain/`, `ports/`, `util/`, `errors/` and the driver, and nothing else.
 * This module reaches `ports/`, `errors/` and two siblings in its own folder. It imports no
 * configuration module, reads no ambient environment value and names no cloud type:
 * `src/config/env.ts` is the only file in the subtree permitted to read the process environment, and
 * that one-way flow is what stops the apparent configuration/adapter cycle from forming — the
 * composition root imports this file and this file never imports it back. In particular
 * `src/integrations/google/ProductFeedQuery.ts` is a CONSUMER of this builder and must never appear
 * in an import here. Every import is relative, extensionless and single-quoted, because
 * `tsconfig.json` declares neither `baseUrl` nor `paths`, so an alias that type-checks could still
 * fail to resolve in the bundled artefact.
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. The project's rules document reports that none were
 * provided, and a repository scan finds no ancillary rule-bearing file at any depth. Per UR4 that is
 * not permission to lower the bar: the nine binding standards of AAP 0.7.3 govern instead, and this
 * file turns on all nine. Their full text is the rules document's and the plan's to hold; it is not
 * transcribed here, because an in-source copy goes stale against the authority.
 *
 * NO DESIGN SYSTEM APPLIES. Zero attachments and zero Figma files (AAP 0.9.1), and no
 * user-interface surface in this subtree (AAP 0.3.4). Nothing here renders.
 *
 * @see `src/ports/SmartListQueryPort.ts` for the contract, and for why the query is a value rather
 *      than a mutable fluent object.
 * @see `src/adapters/mysql/QueryRunner.ts` for the identifier whitelist and the execution boundary.
 */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import { resolveSmartListPropertyIdentifier } from '../../ports/SmartListQueryPort';
import { assertColumnName, assertTableName } from './QueryRunner';
import {
  mapBrandRow,
  mapOptionGroupRow,
  mapOptionRow,
  mapProductRow,
  mapProductTypeRow,
  mapSkuRow,
  mapRows,
} from './rowMappers';

import type { PhysicalTableName, SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type {
  SmartListEntityName,
  SmartListFilter,
  SmartListFilterValue,
  SmartListJoin,
  SmartListJoinType,
  SmartListOrder,
  SmartListPagination,
  SmartListQuery,
  SmartListQueryPort,
  SmartListRange,
  SmartListResult,
  SmartListWhereGroup,
} from '../../ports/SmartListQueryPort';

/* ================================================================================================
 * TRANSLATION DECISIONS — AAP 0.8.2 Guideline 6 requires that "all technology-specific translation
 * decisions" be documented "with clear comments, especially anywhere legacy behavior ... required an
 * explicit judgment call". AAP 0.8.2 additionally names THIS FOLDER as "the primary site of that
 * requirement". Each judgment is recorded here or at the declaration that makes it, always with a
 * locator.
 *
 * THE REGISTERS ARE CLOSED. This file mints no new defect or mismatch identifier. It owns D22 and
 * M7, cites M2 and M6, and records every other finding by `path:Lnnn` locator alone. D18 is NOT
 * this file's: the single declared parameterization-hardening exception belongs exclusively to
 * `MySqlProductRepository.ts`, and parameterizing here is ordinary compliance rather than a
 * declared exception to behaviour preservation.
 *
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) D22 — TWO TABLE VOCABULARIES, BOTH CORRECT
 * ------------------------------------------------------------------------------------------------
 * The framework prefixes the application key onto any entity name handed to it, at five sites in
 * `org/Hibachi/HibachiDAO.cfc` — `:L7-L10` in `get()`, `:L29-L32` in `list()`, `:L39-L42` in
 * `new()`, `:L80-L83` in `count()` and `:L103-L106` in `getSmartList()`, the last of which is the
 * member every smart list in the slice is created through. So `SlatwallProduct` and `SlatwallSku`
 * in an `entityName` position are LEGITIMATE logical names, not mistakes:
 * `model/service/ProductService.cfc:L343` and `model/service/SkuService.cfc:L310` set exactly
 * those. Meanwhile `model/dao/SkuDAO.cfc:L179-L188` names `SwSku`, `SwSkuOption`, `SwOption` and
 * `SwOptionGroup` — physical names — in native statement text.
 *
 * The rule, stated once so it cannot be misread: never 'fix' HQL entity names to `Sw*`, and never
 * assume a logical name works in native SQL. Callers of this builder keep their `Slatwall*`
 * vocabulary; this builder EMITS physical `Sw*` names, and the translation is
 * {@link assertTableName}'s job rather than a correction applied to the caller's input.
 *
 * What must NOT be reproduced is the prefixing rule itself: it is a string operation with no
 * knowledge of the schema, so applied to a physical name it would yield `SlatwallSwProduct`.
 * Resolution here is always a whitelist lookup, never a prefix concatenation.
 * ============================================================================================== */

/* ================================================================================================
 * THE CAPABILITY SET IS CLOSED AT EIGHT GROUPS — DO NOT COMPLETE THE COMPONENT
 * ================================================================================================
 * `org/Hibachi/HibachiSmartList.cfc` is 1,090 lines and declares thirty-three public members. This
 * file ports the eight capability groups AAP 0.4.1.7 names — equality filter, like filter, in
 * filter, range, keyword, related-property join, ordering and pagination — derived from exactly the
 * five call sites listed in the file header, plus the distinctness switch the source ties to them.
 * The temptation to port "the rest of it for completeness" is real and is forbidden by AAP 0.8.2
 * Guideline 4 (*"Do not enhance or optimize business logic beyond what the migration requires"*).
 * The bound is a decision, not an abandoned port.
 *
 * THREE MEMBERS ARE EXCLUDED BY NAME, EACH FOR A STATED REASON:
 *
 *   1. THE RAW-CONDITION MEMBER — `addWhereCondition`, declared at
 *      `org/Hibachi/HibachiSmartList.cfc:L358` — IS OMITTED ENTIRELY.
 *      It accepts a query-language fragment as a string, appends it verbatim at `:L359`, and the
 *      fragment is spliced straight into the emitted statement at `:L706`. That is flatly
 *      incompatible with the parameterized-SQL standard: an entry point accepting an arbitrary
 *      fragment is an injection surface by construction. Its ONE in-scope caller,
 *      `model/entity/ProductType.cfc:L263` (spanning `:L261-L266`, which interpolates
 *      `getProductTypeIDPath()` into a LIKE predicate and hard-codes a framework-generated alias),
 *      is likewise omitted — AAP 0.4.1.6 names it as such. NO EQUIVALENT IS ADMITTED UNDER ANY
 *      OTHER NAME. To be unambiguous about what "any other name" covers, since a later reader may
 *      reach for one of these spellings believing it new: there is no `addWhereCondition`, no
 *      `rawFilter`, no `whereFragment`, no `sqlExpression`, no `unsafeCondition`, no `addRawWhere`,
 *      no tagged template and no overload accepting pre-assembled statement text anywhere in this
 *      file, and none may be added. Every one of those names is named here precisely so that
 *      searching for it lands on this exclusion instead of on a declaration. When a statement cannot be expressed as
 *      {@link assertTableName} plus {@link assertColumnName} plus `?` placeholders, the whitelist is
 *      incomplete: extend the whitelist.
 *
 *   2. THE QUERY-CACHE SURFACE — `getCacheName`, declared at
 *      `org/Hibachi/HibachiSmartList.cfc:L1081` — IS EXCLUDED under M7. It hashes the serialised
 *      accumulated state, read at `:L1064-L1078` for context only, into a cache key. There is no
 *      cross-invocation cache in a stateless handler, so no `getCacheName`, no cache key, no cache
 *      lookup and no state-derived memo appears here. AAP 0.6.6 requires any memoisation in this
 *      port be scoped to the request rather than the module, and the plan this builder creates per
 *      call already is. See the file header.
 *
 *   3. THE `fetch` AND `isAttribute` JOIN MODIFIERS declared at
 *      `org/Hibachi/HibachiSmartList.cfc:L212` ARE NOT IMPLEMENTED. No in-scope call site passes
 *      either; both are used only by the framework's own internal auto-join walk at `:L324-L339`,
 *      and `isAttribute` additionally reaches the out-of-scope attribute-value entity at `:L215`.
 *      Their absence is why {@link SmartListQueryBuilder} needs no eager-loading concept at all.
 *
 * Two further members are absent for the same restraint and are recorded so the omissions read as
 * decisions: the projection member at `:L351`, whose only in-slice caller is the image member at
 * `model/entity/Product.cfc:L503`, served by `ImagePathPort`; and the keyword-phrase accumulator
 * declared at `:L19` and populated at `:L161`, which the component never consumes anywhere.
 * ============================================================================================== */

/* ================================================================================================
 * SOURCE-DECLARED FIGURES — EVERY NUMBER IN THIS FILE CARRIES A LOCATOR (S9 / IR-12)
 * ================================================================================================
 * No latency, throughput, availability or capacity figure appears anywhere below, and no pool sizing
 * of any kind: AAP 0.4.1.3 records that *"pool sizing is not carried over because the legacy
 * application delegates pooling to the CF/Railo server and pins nothing in source"*, and this file
 * does not construct a pool in any case. The only figures present are the three the legacy declares.
 * ============================================================================================== */

/**
 * The first record of a page when the caller supplies none.
 *
 * Declared at `org/Hibachi/HibachiSmartList.cfc:L39` as the `pageRecordsStart` argument default and
 * applied at `:L65`. THIS IS A CARRIED SOURCE VALUE, NOT A DEFAULT OF THIS PORT'S INVENTION: the
 * property declaration at `:L23` carries no initial value, so `src/ports/SmartListQueryPort.ts`
 * leaves the member optional and states that resolving absent pagination is the adapter's job —
 * exactly as it is the setup member's job in the legacy. This file is that adapter.
 */
const LEGACY_DEFAULT_PAGE_RECORDS_START = 1;

/**
 * The page size when the caller supplies none.
 *
 * Declared at `org/Hibachi/HibachiSmartList.cfc:L39` as the `pageRecordsShow` argument default and
 * applied at `:L66`. Same provenance as {@link LEGACY_DEFAULT_PAGE_RECORDS_START}: the property
 * declaration at `:L24` states no default, the setup member does, and every one of the five consumer
 * contracts reaches this builder through `getSmartList()` at
 * `org/Hibachi/HibachiDAO.cfc:L102-L111`, which calls that setup member — so all five DO receive
 * this figure. Carrying it is faithful; substituting a figure of this file's own choosing would not
 * be.
 */
const LEGACY_DEFAULT_PAGE_RECORDS_SHOW = 10;

/**
 * The requested page when the caller supplies none.
 *
 * Seeded with the number one at `org/Hibachi/HibachiSmartList.cfc:L56`.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L26` — THE REQUESTED PAGE IS DECLARED AS A STRING,
 * NOT A NUMBER, and the string typing is carried deliberately rather than tidied. The legacy treats
 * the value loosely: it seeds it with a number at `:L56`, assigns it from a numerically validated
 * caller value at `:L131-L132`, then COMPARES AND MULTIPLIES with it at `:L793-L794`, which works
 * only because CFML coerces a numeric string on demand. `src/ports/SmartListQueryPort.ts` preserves
 * the declared width so the page-declaration syntax the legacy accepts is not narrowed, and this
 * file coerces at precisely the point `:L793-L794` does — see {@link resolvePagination}, which
 * parses the string and THROWS on a value that will not read as a whole positive number rather than
 * quietly falling back to page one.
 */
const LEGACY_DEFAULT_CURRENT_PAGE_DECLARATION = '1';

/**
 * The alias letters the framework cycles through when an alias collides.
 *
 * `variables` list `"a,b,c,d,e,f,g,h,i,j,k,l"` at `org/Hibachi/HibachiSmartList.cfc:L252`, carried
 * verbatim including its length: the legacy runs off the end of this list rather than growing it, so
 * the twelve-entry bound is behaviour and {@link registerJoin} reproduces the exhaustion as a thrown
 * error rather than inventing a thirteenth letter.
 */
const ENTITY_ALIAS_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] as const;

/** The sub-entity path delimiter. `variables.subEntityDelimiters` at `:L32` is `"._"`; only `.` is
 * produced by `src/ports/SmartListQueryPort.ts`, which declares `.` as the single delimiter, so the
 * underscore form is not accepted here — admitting it would let `option_group` and `optionGroup`
 * mean different things depending on which delimiter a caller happened to type. */
const PROPERTY_PATH_DELIMITER = '.';

/** The value delimiter that turns one filter value into an OR-ed set. `variables.valueDelimiter` at
 * `org/Hibachi/HibachiSmartList.cfc:L33`. */
const FILTER_VALUE_DELIMITER = ',';

/** The wildcard the keyword search wraps around each keyword at
 * `org/Hibachi/HibachiSmartList.cfc:L681`. */
const KEYWORD_WILDCARD = '%';

/** The token a filter value may carry to mean "compare against nothing", tested at
 * `org/Hibachi/HibachiSmartList.cfc:L580` and `:L591`. Compared case-insensitively because CFML
 * `eq` is, exactly as `QueryRunner.ts` normalises identifier case for the same reason. */
const NULL_FILTER_TOKEN = 'null';

/* ================================================================================================
 * DISTINCTNESS — TWO RULES, AND THE ASYMMETRY BETWEEN THEM IS THE LEGACY'S
 * ============================================================================================== */

/**
 * Why the record projection and the count disagree about distinctness, carried rather than repaired.
 *
 * `getHQLSelect` at `org/Hibachi/HibachiSmartList.cfc:L500-L524` has two branches and they do NOT
 * agree:
 *   - The COUNT branch at `:L502` is UNCONDITIONALLY distinct — `count(distinct <alias>.<primaryID>)`
 *     — regardless of any flag.
 *   - The RECORD branch at `:L505-L521` is distinct only when the flag is set, and the flag is
 *     seeded FALSE at `:L59` (`setSelectDistinctFlag(0)`).
 *
 * So a query with a fan-out join and the flag left alone reports a distinct COUNT over
 * non-distinct RECORDS. That asymmetry is behaviour, not an accident this port may quietly fix
 * (AAP 0.7.3 standard 7), and it is exactly what `issue_1296` is numerically sensitive to. Both
 * rules are reproduced as declared: {@link composeSelectClause} honours the flag, and
 * {@link composeCountSelectClause} does not consult it.
 *
 * The two consumers that actually fan out switch the flag on themselves —
 * `model/entity/Product.cfc:L254` and `:L341` both call the distinct setter with one — which is why
 * the seeded FALSE is safe for the three that do not.
 */
export const SMARTLIST_DISTINCT_ASYMMETRY = Object.freeze({
  recordProjectionHonoursFlag: true,
  countProjectionIsAlwaysDistinct: true,
});

/* ================================================================================================
 * THE PHYSICAL SCHEMA — READ FROM THE ENTITY COMPONENTS, EVERY ROW WITH ITS LOCATOR
 * ================================================================================================
 * HQL traverses an association by naming it (`joinRelatedProperty` emits `parentAlias.relatedProperty
 * as childAlias` at `org/Hibachi/HibachiSmartList.cfc:L546`) and lets Hibernate supply the predicate
 * from the mapping metadata. Native SQL has no such facility, so the predicate must be stated. These
 * three tables are that metadata, transcribed from the `property` declarations of the in-scope entity
 * components rather than inferred from column-name convention — inference would silently pick
 * `alternateSkuCodeTypeID` where the source declares `skuTypeID`
 * (`model/entity/AlternateSkuCode.cfc:L56`).
 * ============================================================================================== */

/**
 * The primary-key column of each entity in the smart-list graph.
 *
 * Read from the `fieldtype="id"` declaration of each component. Per IR-6 these are 32-character UUID
 * strings generated in application code, which is why every one is a string column and none is an
 * auto-increment. Used for the count projection (`org/Hibachi/HibachiSmartList.cfc:L502`) and as the
 * far side of every foreign-key predicate below.
 */
const ENTITY_PRIMARY_KEY: Readonly<Record<SmartListEntityName, string>> = Object.freeze({
  /** `model/entity/Product.cfc:L52`. */
  SlatwallProduct: 'productID',
  /** `model/entity/Sku.cfc:L52`. */
  SlatwallSku: 'skuID',
  /** `model/entity/ProductType.cfc:L52`. */
  SlatwallProductType: 'productTypeID',
  /** `model/entity/Brand.cfc:L52`. */
  SlatwallBrand: 'brandID',
  /** `model/entity/Option.cfc:L52`. */
  SlatwallOption: 'optionID',
  /** `model/entity/OptionGroup.cfc:L52`. */
  SlatwallOptionGroup: 'optionGroupID',
  /** `model/entity/AlternateSkuCode.cfc:L52`. */
  SlatwallAlternateSkuCode: 'alternateSkuCodeID',
});

/**
 * How one association becomes one or two SQL joins.
 *
 * Three shapes, because the legacy declares three field types and each needs a different predicate:
 *   - `parentForeignKey` — a `many-to-one`. The PARENT table holds the foreign key, so the predicate
 *     is `child.<childPrimaryKey> = parent.<column>`.
 *   - `childForeignKey` — a `one-to-many` (always `inverse="true"` in this slice). The CHILD table
 *     holds the foreign key, so the predicate is `child.<column> = parent.<parentPrimaryKey>`.
 *   - `linkTable` — a `many-to-many`. Two joins are required, through the declared `linktable`.
 */
type SmartListJoinSpecification =
  | {
      readonly kind: 'parentForeignKey';
      readonly childEntityName: SmartListEntityName;
      readonly parentColumn: string;
    }
  | {
      readonly kind: 'childForeignKey';
      readonly childEntityName: SmartListEntityName;
      readonly childColumn: string;
    }
  | {
      readonly kind: 'linkTable';
      readonly childEntityName: SmartListEntityName;
      readonly linkEntityTable: string;
      readonly linkParentColumn: string;
      readonly linkChildColumn: string;
    };

/**
 * Every association the smart-list graph can traverse, keyed by parent entity then by the related
 * property the caller names.
 *
 * The key set mirrors the `relationships` map of `src/ports/SmartListQueryPort.ts` exactly, so a
 * relationship the port's types admit is one this table can resolve; a mismatch between the two is a
 * compile error at {@link SmartListJoinSpecification}'s use site rather than a run-time surprise.
 */
const ENTITY_JOIN_SPECIFICATIONS: Readonly<
  Record<SmartListEntityName, Readonly<Record<string, SmartListJoinSpecification | undefined>>>
> = Object.freeze({
  SlatwallSku: Object.freeze({
    /** `model/entity/Sku.cfc:L65` — `many-to-one` `fkcolumn="productID"`. */
    product: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallProduct',
      parentColumn: 'productID',
    }),
    /** `model/entity/Sku.cfc:L69` — `one-to-many` `fkcolumn="skuID" inverse="true"`. */
    alternateSkuCodes: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallAlternateSkuCode',
      childColumn: 'skuID',
    }),
    /**
     * `model/entity/Sku.cfc:L76` — `many-to-many linktable="SwSkuOption" fkcolumn="skuID"
     * inversejoincolumn="optionID"`. This is the owning side; `model/entity/Option.cfc:L66` mirrors
     * it with `inverse="true"`.
     */
    options: Object.freeze({
      kind: 'linkTable',
      childEntityName: 'SlatwallOption',
      linkEntityTable: 'SwSkuOption',
      linkParentColumn: 'skuID',
      linkChildColumn: 'optionID',
    }),
  }),
  SlatwallProduct: Object.freeze({
    /** `model/entity/Product.cfc:L68` — `many-to-one` `fkcolumn="brandID"`. */
    brand: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallBrand',
      parentColumn: 'brandID',
    }),
    /** `model/entity/Product.cfc:L69` — `many-to-one` `fkcolumn="productTypeID"`. */
    productType: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallProductType',
      parentColumn: 'productTypeID',
    }),
    /** `model/entity/Product.cfc:L70` — `many-to-one` `fkcolumn="defaultSkuID"`. */
    defaultSku: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallSku',
      parentColumn: 'defaultSkuID',
    }),
    /** `model/entity/Product.cfc:L73` — `one-to-many` `fkcolumn="productID" inverse="true"`. */
    skus: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallSku',
      childColumn: 'productID',
    }),
  }),
  SlatwallProductType: Object.freeze({
    /** `model/entity/ProductType.cfc:L62` — `many-to-one` `fkcolumn="parentProductTypeID"`. */
    parentProductType: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallProductType',
      parentColumn: 'parentProductTypeID',
    }),
    /**
     * `model/entity/ProductType.cfc:L65` — `one-to-many` `fkcolumn="parentProductTypeID"
     * inverse="true"`. A self-association, which is the case the alias-collision loop of
     * `org/Hibachi/HibachiSmartList.cfc:L249-L262` exists to serve; see {@link registerJoin}.
     */
    childProductTypes: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallProductType',
      childColumn: 'parentProductTypeID',
    }),
    /** `model/entity/ProductType.cfc:L66` — `one-to-many` `fkcolumn="productTypeID" inverse="true"`. */
    products: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallProduct',
      childColumn: 'productTypeID',
    }),
  }),
  SlatwallBrand: Object.freeze({
    /** `model/entity/Brand.cfc:L61` — `one-to-many` `fkcolumn="brandID" inverse="true"`. */
    products: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallProduct',
      childColumn: 'brandID',
    }),
  }),
  SlatwallOption: Object.freeze({
    /** `model/entity/Option.cfc:L59` — `many-to-one` `fkcolumn="optionGroupID"`. */
    optionGroup: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallOptionGroup',
      parentColumn: 'optionGroupID',
    }),
    /**
     * `model/entity/Option.cfc:L66` — `many-to-many linktable="SwSkuOption" fkcolumn="optionID"
     * inversejoincolumn="skuID" inverse="true"`. The inverse side of `SlatwallSku.options`, so the
     * two link columns are swapped relative to it. Consumers 4 and 5 traverse this association.
     */
    skus: Object.freeze({
      kind: 'linkTable',
      childEntityName: 'SlatwallSku',
      linkEntityTable: 'SwSkuOption',
      linkParentColumn: 'optionID',
      linkChildColumn: 'skuID',
    }),
  }),
  SlatwallOptionGroup: Object.freeze({
    /**
     * `model/entity/OptionGroup.cfc:L70` — `one-to-many` `fkcolumn="optionGroupID" inverse="true"`,
     * declared with `orderby="sortOrder"`. THE MAPPING-LEVEL ORDER IS NOT CARRIED HERE: a smart list
     * states its own ordering, and consumers 4 and 5 do so explicitly with a pipe-delimited order at
     * `model/entity/Product.cfc:L256` and `:L344`. Reproducing the mapping order as well would add a
     * sort the legacy statement does not carry.
     */
    options: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallOption',
      childColumn: 'optionGroupID',
    }),
  }),
  SlatwallAlternateSkuCode: Object.freeze({
    /** `model/entity/AlternateSkuCode.cfc:L57` — `many-to-one` `fkcolumn="skuID"`. */
    sku: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallSku',
      parentColumn: 'skuID',
    }),
  }),
});

/**
 * The column a `many-to-one` property resolves to when it is the LAST segment of a path rather than
 * a hop through it.
 *
 * `src/ports/SmartListQueryPort.ts` admits relationship names as leaf properties because the legacy
 * does — `getAliasedProperty` at `org/Hibachi/HibachiSmartList.cfc:L348` returns the property name
 * of whatever the final segment is, and for a `many-to-one` Hibernate resolves that to the foreign
 * key. In native SQL the foreign-key column has to be named, so it is named here.
 *
 * Only `many-to-one` properties appear. A collection property has NO column on its own table, so a
 * path that ends at one is refused by {@link resolvePropertyPath} rather than guessed at.
 */
const FOREIGN_KEY_LEAF_COLUMNS: Readonly<
  Record<SmartListEntityName, Readonly<Record<string, string | undefined>>>
> = Object.freeze({
  SlatwallSku: Object.freeze({
    /** `model/entity/Sku.cfc:L65`. */
    product: 'productID',
    /** `model/entity/Sku.cfc:L66` — the term itself is out of scope, but its foreign key is a column
     * of `SwSku` and a filter may legitimately name it. */
    subscriptionTerm: 'subscriptionTermID',
  }),
  SlatwallProduct: Object.freeze({
    /** `model/entity/Product.cfc:L68`. */
    brand: 'brandID',
    /** `model/entity/Product.cfc:L69`. */
    productType: 'productTypeID',
    /** `model/entity/Product.cfc:L70`. */
    defaultSku: 'defaultSkuID',
  }),
  SlatwallProductType: Object.freeze({
    /** `model/entity/ProductType.cfc:L62`. */
    parentProductType: 'parentProductTypeID',
  }),
  SlatwallBrand: Object.freeze({}),
  SlatwallOption: Object.freeze({
    /** `model/entity/Option.cfc:L59`. */
    optionGroup: 'optionGroupID',
  }),
  SlatwallOptionGroup: Object.freeze({}),
  SlatwallAlternateSkuCode: Object.freeze({
    /** `model/entity/AlternateSkuCode.cfc:L56` — declared `fkcolumn="skuTypeID"`. The name does not
     * follow from the property name, which is precisely why this table is transcribed rather than
     * derived. */
    alternateSkuCodeType: 'skuTypeID',
    /** `model/entity/AlternateSkuCode.cfc:L57`. */
    sku: 'skuID',
  }),
});

/**
 * The inverse of each collection association, used only by {@link describePropertyScopedSmartList}.
 *
 * `getPropertySmartList` at `org/Hibachi/HibachiEntity.cfc:L442-L460` obtains the smart list of the
 * COLLECTION's entity and then, for a `one-to-many`, walks the child's properties to find the
 * inverse `many-to-one` and filters on it. This table states that inverse directly, from the same
 * declarations as {@link ENTITY_JOIN_SPECIFICATIONS}, so the walk is not re-implemented.
 */
const COLLECTION_INVERSE_PROPERTY: Readonly<
  Record<SmartListEntityName, Readonly<Record<string, string | undefined>>>
> = Object.freeze({
  /** `model/entity/Sku.cfc:L69` inverse is `model/entity/AlternateSkuCode.cfc:L57`; `:L76` inverse is
   * `model/entity/Option.cfc:L66`. */
  SlatwallSku: Object.freeze({ alternateSkuCodes: 'sku', options: 'skus' }),
  /** `model/entity/Product.cfc:L73` inverse is `model/entity/Sku.cfc:L65`. */
  SlatwallProduct: Object.freeze({ skus: 'product' }),
  /** `model/entity/ProductType.cfc:L65` and `:L66` inverses are `:L62` and
   * `model/entity/Product.cfc:L69`. */
  SlatwallProductType: Object.freeze({
    childProductTypes: 'parentProductType',
    products: 'productType',
  }),
  /** `model/entity/Brand.cfc:L61` inverse is `model/entity/Product.cfc:L68`. */
  SlatwallBrand: Object.freeze({ products: 'brand' }),
  /** `model/entity/Option.cfc:L66` inverse is `model/entity/Sku.cfc:L76`. */
  SlatwallOption: Object.freeze({ skus: 'options' }),
  /** `model/entity/OptionGroup.cfc:L70` inverse is `model/entity/Option.cfc:L59`. */
  SlatwallOptionGroup: Object.freeze({ options: 'optionGroup' }),
  SlatwallAlternateSkuCode: Object.freeze({}),
});

/**
 * The row mapper each base entity hydrates through, selected from the query's entity name exactly as
 * the legacy entity name at `org/Hibachi/HibachiSmartList.cfc:L39` determines what the resulting
 * record collection contains.
 *
 * `SlatwallAlternateSkuCode` is deliberately absent. It exists in the graph because
 * `model/service/SkuService.cfc:L316` joins the collection and `:L321` keyword-searches through it,
 * but no in-scope consumer makes it the BASE of a smart list, and AAP 0.2.1.2 lists six in-scope
 * entity components rather than seven — so there is no `AlternateSkuCode.ts` domain type to hydrate
 * into and none is invented. Naming it as a base entity is reported as unimplemented rather than
 * approximated.
 */
const ENTITY_ROW_MAPPERS: Readonly<
  Record<SmartListEntityName, ((row: MySqlRow) => unknown) | undefined>
> = Object.freeze({
  SlatwallProduct: mapProductRow,
  SlatwallSku: mapSkuRow,
  SlatwallProductType: mapProductTypeRow,
  SlatwallBrand: mapBrandRow,
  SlatwallOption: mapOptionRow,
  SlatwallOptionGroup: mapOptionGroupRow,
  SlatwallAlternateSkuCode: undefined,
});

/* ================================================================================================
 * THE COMPOSED STATEMENT — INSPECTABLE WITHOUT A DATABASE (S6)
 * ============================================================================================== */

/**
 * One parameterized statement: the text, and the values bound to its placeholders in order.
 *
 * AAP 0.6.5.2 records that no legacy test exists for the SKU or option data-access components, and
 * there is no test for the framework's smart list either, so ALL coverage of this builder is
 * NET-NEW. It is also unrunnable against a database in this environment — there is no CFML runtime
 * and the `Sw*` tables are not created by any artefact in the repository — so every composed query
 * has to be assertable as a value. That is what this type is for, and it is why
 * {@link SmartListQueryBuilder.build} is public rather than private.
 *
 * `params` is ordered to match the placeholders in `sql` position for position (TR-4: *"the parameter
 * array assembled in exactly the legacy sequence"*). Nothing in `sql` is caller-supplied except
 * through a `?`.
 */
export interface SmartListStatement {
  /** The statement text. Every identifier in it came from a whitelist; every value is a `?`. */
  readonly sql: string;

  /** The bound values, in placeholder order. */
  readonly params: readonly unknown[];
}

/**
 * Everything one described query compiles to, before anything is executed.
 *
 * THE THREE STATEMENTS SHARE ONE COMPOSITION, WHICH IS THE POINT. The legacy derives all three from
 * the same accumulated state — the record statement at `org/Hibachi/HibachiSmartList.cfc:L751`, the
 * page statement at `:L759-L764` and the counting statement at `:L777-L778` — so they cannot drift
 * apart. Here they are produced from one {@link QueryPlan} in one pass for the same reason. The count
 * carries NO `LIMIT`, and the record statement carries none either; the only bound is the page
 * statement's, and that bound is the legacy's own offset and maximum-results pair from `:L762`
 * rather than a cap of this file's invention (S9).
 */
export interface CompiledSmartListQuery {
  /** The base entity, echoed back so a test can assert the logical name it supplied. */
  readonly entityName: SmartListEntityName;

  /**
   * The PHYSICAL table the base entity resolved to.
   *
   * Present so the D22 translation is directly assertable: a caller supplies `SlatwallProduct` and
   * this reports `SwProduct`.
   */
  readonly baseTable: PhysicalTableName;

  /** The base entity's alias, `a` + the lower-cased logical name, per `:L71`. */
  readonly baseAlias: string;

  /** All matching records, unpaged. Mirrors `org/Hibachi/HibachiSmartList.cfc:L751-L755`. */
  readonly records: SmartListStatement;

  /** The requested page. Mirrors `org/Hibachi/HibachiSmartList.cfc:L759-L764`. */
  readonly pageRecords: SmartListStatement;

  /** The distinct count. Mirrors `org/Hibachi/HibachiSmartList.cfc:L777-L778`. */
  readonly recordsCount: SmartListStatement;

  /** The resolved one-based first record of the page, per `:L790-L796`. */
  readonly pageRecordsStart: number;

  /** The resolved page size, per `:L66` and `:L762`. */
  readonly pageRecordsShow: number;

  /** The resolved page number, per `:L808-L809`. */
  readonly currentPage: number;

  /**
   * Whether the RECORD projection is distinct.
   *
   * Reported separately from the count, which is always distinct — see
   * {@link SMARTLIST_DISTINCT_ASYMMETRY}. Exposing it is what makes the `issue_1296` regression
   * assertable without a database.
   */
  readonly selectDistinct: boolean;
}

/* ================================================================================================
 * THE PLAN — PER-QUERY STATE, LOCAL TO ONE build() CALL (M7)
 * ============================================================================================== */

/** One entity registered in a plan: the legacy `variables.entities[name]` struct, typed. */
interface PlannedEntity {
  /** The logical entity, used to look up relationships, the primary key and the row mapper. */
  readonly entityName: SmartListEntityName;

  /** The physical table, always obtained through {@link assertTableName}. */
  readonly table: PhysicalTableName;

  /** The SQL alias. Built from the logical name and a letter, never from caller input. */
  readonly alias: string;

  /**
   * The related property this entity was reached through, or the empty string for the base entity —
   * mirroring the `parentRelatedProperty=""` default of the private registrar at
   * `org/Hibachi/HibachiSmartList.cfc:L304`. It is not decoration: the alias-collision test at
   * `:L258` compares against it, which is what makes a repeated join idempotent.
   */
  readonly parentRelatedProperty: string;

  /**
   * The `JOIN ... ON ...` fragments this entity contributes. Empty for the base entity, one entry
   * for a foreign-key association and TWO for a many-to-many, which needs the link table joined
   * first.
   */
  readonly joinClauses: readonly string[];
}

/**
 * The accumulated shape of one query in progress — the legacy's `variables.entities` plus
 * `variables.entityJoinOrder`, both declared at `org/Hibachi/HibachiSmartList.cfc:L8-L9`.
 *
 * Created inside {@link SmartListQueryBuilder.build} and unreachable once it returns. Nothing of this
 * survives a call, which is the whole of M7's requirement in this file.
 */
interface QueryPlan {
  /** The registry key of the base entity. */
  readonly baseEntityKey: string;

  /** Registered entities, keyed exactly as the legacy keys them — BY ENTITY NAME, not by path. */
  readonly entities: Map<string, PlannedEntity>;

  /** Registration order, which is emission order in the `FROM` clause, per `:L534-L549`. */
  readonly joinOrder: string[];
}

/**
 * Opens a plan on a base entity.
 *
 * The base alias is `a` + the lower-cased logical entity name, exactly as the setup member builds it
 * at `org/Hibachi/HibachiSmartList.cfc:L71`. That spelling is load-bearing beyond cosmetics: the one
 * excluded raw-condition caller, `model/entity/ProductType.cfc:L264`, hard-codes the literal
 * `aslatwallproducttype`, which is where the convention becomes visible in the legacy source.
 */
function openPlan(entityName: SmartListEntityName): QueryPlan {
  const baseAlias = `${ENTITY_ALIAS_LETTERS[0] ?? 'a'}${entityName.toLowerCase()}`;
  const plan: QueryPlan = {
    baseEntityKey: entityName,
    entities: new Map<string, PlannedEntity>(),
    joinOrder: [],
  };

  plan.entities.set(entityName, {
    entityName,
    table: assertTableName(entityName),
    alias: baseAlias,
    parentRelatedProperty: '',
    joinClauses: [],
  });
  plan.joinOrder.push(entityName);

  return plan;
}

/** Reads a registered entity, refusing to continue if the key is absent. */
function requireRegisteredEntity(plan: QueryPlan, entityKey: string): PlannedEntity {
  const entity = plan.entities.get(entityKey);

  if (entity === undefined) {
    throw new DomainError(
      'A smart-list join named a parent entity that has not been registered on this query, so the ' +
        'join could not be resolved. Register the parent before the association that hangs off it.',
      { context: { parentEntityName: entityKey, registered: [...plan.entities.keys()] } },
    );
  }

  return entity;
}

/* ================================================================================================
 * THE JOIN KEYWORD — ⚠️ THE EMPTY JOIN TYPE EMITS **LEFT**, NOT INNER
 * ============================================================================================== */

/**
 * Maps a declared join type onto the SQL keyword the legacy actually emits for it.
 *
 * ⚠️ READ THIS BEFORE ASSUMING. `org/Hibachi/HibachiSmartList.cfc:L212` declares
 * `joinRelatedProperty(parentEntityName, relatedProperty, joinType="", fetch=false,
 * isAttribute=false)`, so an omitted join type is the EMPTY STRING. The natural reading is that an
 * empty join type means an inner join. IT DOES NOT. `getHQLFrom` normalises it at
 * `org/Hibachi/HibachiSmartList.cfc:L537-L540`:
 *
 *     var joinType = variables.entities[i].joinType;
 *     if(!len(joinType)) { joinType = "left"; }
 *
 * so the empty string is emitted as a LEFT join. Both inhabitants of the declared type therefore map
 * to the same keyword, and that is the byte-verified legacy behaviour rather than a simplification:
 * six of the nine in-scope join calls use the two-argument form, and EVERY auto-join created while
 * walking a dotted path passes no join type either (`:L327` and `:L336`), so the empty-string case is
 * the common one, not the exotic one. Emitting an inner join for it would silently DROP rows —
 * every SKU with no alternate code, every product with no brand — and no test written against the
 * five consumers would notice, because those consumers' data happens to be populated.
 *
 * The mapping is written out exhaustively rather than collapsed to a constant so that the decision is
 * reviewable and so that adding an inhabitant to the declared type becomes a compile error here.
 */
function resolveJoinKeyword(joinType: SmartListJoinType | undefined): string {
  switch (joinType) {
    case 'left':
      return 'LEFT JOIN';
    case '':
    case undefined:
      // The empty string is `:L212`'s default and `:L538-L540` turns it into a left join.
      return 'LEFT JOIN';
  }
}

/* ================================================================================================
 * JOIN REGISTRATION — A FAITHFUL PORT OF org/Hibachi/HibachiSmartList.cfc:L246-L270
 * ============================================================================================== */

/**
 * Registers the association `relatedProperty` of an already-registered parent, and returns the
 * registry key of the entity it introduced.
 *
 * ⭐ THE GRAMMAR IS THREE-PART — PARENT PLUS PROPERTY — AND IT CANNOT BE A FLAT DOTTED PATH. This is
 * the single most consequential shape decision in the file, and the proof is two adjacent lines of
 * the legacy. `model/service/SkuService.cfc:L314` joins `("SlatwallSku", "product")`, and `:L315`
 * joins `("SlatwallProduct", "productType")`. The SECOND join's parent is `SlatwallProduct` — an
 * entity that exists in the registry ONLY because the first join put it there. A flat API such as
 * `join('product.productType')` cannot express that: it would have to INFER the parent, and the
 * inference happens to work for the joins rooted at the base entity while quietly choosing the wrong
 * parent for the ones that are not. So the parent is named explicitly, exactly as the legacy names
 * it, and it is looked up rather than guessed.
 *
 * ⭐ A REPEATED JOIN IS A NO-OP, AND THAT IS PROVEN RATHER THAN ASSUMED. `integrationServices/
 * google/controllers/feed.cfc:L64` re-joins `("SlatwallSku", "product")`, which
 * `model/service/SkuService.cfc:L314` has already joined — a genuine duplicate, and one that must
 * not be "cleaned up" on a hunch. Trace the legacy for it: the association resolves to entity name
 * `SlatwallProduct`; the candidate alias is `aslatwallproduct`; the collision test at `:L258` has two
 * clauses and NEITHER fires, because the registered entry's `parentRelatedProperty` IS `product` (so
 * the first clause's inequality is false) and the candidate alias differs from the parent's
 * `aslatwallsku` (so the second is false); the alias is accepted unchanged; and the existence guard
 * at `:L269` then finds the key already present and appends NOTHING. The duplicate contributes no
 * entity, no alias and no `FROM` fragment. Registration here is idempotent in exactly the same way
 * and for exactly the same reason, so collapsing the duplicate has no observable effect — which is
 * the standard AAP 0.8.2 Guideline 4 sets for touching it at all.
 *
 * TODO(parity) `integrationServices/google/controllers/feed.cfc:L64` — THE FEED RE-JOINS A
 * RELATIONSHIP `model/service/SkuService.cfc:L314` HAS ALREADY JOINED. The duplicate is preserved as a
 * caller-visible fact: a consumer may declare it, this member accepts it, and it is absorbed rather
 * than refused. It is absorbed ONLY because the trace above proves the legacy absorbs it too; had the
 * proof failed, the second join would have had to be emitted as a second join. No optimisation is
 * being performed and none is claimed.
 *
 * THE SELF-ASSOCIATION CASE IS WHY THE COLLISION LOOP EXISTS. `model/entity/ProductType.cfc:L62` and
 * `:L65` relate a product type to itself. Joining one of those from a `SlatwallProductType` base
 * produces a candidate alias equal to the PARENT's alias, which trips the second clause of `:L258`;
 * the letter advances, and the registry key becomes the lower-cased name suffixed with the
 * upper-cased letter, per `:L255`. Both behaviours are reproduced, including the consequence that a
 * later join naming `SlatwallProductType` as its parent still finds the ORIGINAL registration rather
 * than the renamed one.
 *
 * @param plan - The plan being accumulated.
 * @param parentEntityKey - Registry key of the parent. Must already be registered.
 * @param relatedProperty - The association to traverse, as the caller names it.
 * @param joinType - `''` or `'left'`; both emit a left join. See {@link resolveJoinKeyword}.
 * @returns The registry key of the entity on the far side of the association.
 */
function registerJoin(
  plan: QueryPlan,
  parentEntityKey: string,
  relatedProperty: string,
  joinType: SmartListJoinType | undefined,
): string {
  const parent = requireRegisteredEntity(plan, parentEntityKey);
  const specification = ENTITY_JOIN_SPECIFICATIONS[parent.entityName][relatedProperty];

  if (specification === undefined) {
    throw new DomainError(
      'A smart-list query traversed a relationship that the extracted Catalog entity graph does ' +
        'not declare on the entity it was applied to, so the traversal was refused before any ' +
        'statement text was assembled.',
      { context: { parentEntityName: parent.entityName, relatedProperty } },
    );
  }

  const childEntityName = specification.childEntityName;
  const aliasBase = childEntityName.toLowerCase();

  // `:L246-L262` — advance through the twelve letters until the candidate alias is free, renaming the
  // registry key on every advance exactly as `:L255` does.
  let entityKey: string = childEntityName;
  let alias: string | undefined;

  for (let letterIndex = 0; letterIndex < ENTITY_ALIAS_LETTERS.length; letterIndex += 1) {
    const letter = ENTITY_ALIAS_LETTERS[letterIndex];

    if (letter === undefined) {
      break;
    }

    const candidateAlias = `${letter}${aliasBase}`;

    if (letterIndex > 0) {
      entityKey = `${entityKey.toLowerCase()}_${letter.toUpperCase()}`;
    }

    const registered = plan.entities.get(entityKey);
    const collides =
      (registered !== undefined &&
        registered.alias === candidateAlias &&
        registered.parentRelatedProperty !== relatedProperty) ||
      candidateAlias === parent.alias;

    if (!collides) {
      alias = candidateAlias;
      break;
    }
  }

  if (alias === undefined) {
    throw new DomainError(
      'A smart-list query needed more table aliases than the twelve the legacy alias list provides, ' +
        'so it was refused rather than given an alias the legacy could not have produced.',
      {
        context: {
          parentEntityName: parent.entityName,
          relatedProperty,
          aliasCapacity: ENTITY_ALIAS_LETTERS.length,
        },
      },
    );
  }

  // `:L269` — the existence guard. This is the line that makes the feed's duplicate join a no-op.
  const alreadyRegistered = plan.entities.get(entityKey);
  if (alreadyRegistered !== undefined) {
    return entityKey;
  }

  plan.entities.set(entityKey, {
    entityName: childEntityName,
    table: assertTableName(childEntityName),
    alias,
    parentRelatedProperty: relatedProperty,
    joinClauses: composeJoinClauses(parent, specification, alias, joinType),
  });
  plan.joinOrder.push(entityKey);

  return entityKey;
}

/**
 * Registers one DECLARED join — the three-part form a consumer writes out.
 *
 * The declared shape pairs the parent entity with a relationship that entity actually has, checked at
 * compile time by `src/ports/SmartListQueryPort.ts`, so the pairing arriving here is already sound;
 * this member exists to unpack it in one place and to keep the three-part grammar visible at the call
 * site in {@link SmartListQueryBuilder.build}.
 */
function registerDeclaredJoin(plan: QueryPlan, join: SmartListJoin): string {
  return registerJoin(plan, join.parentEntityName, join.relatedProperty, join.joinType);
}

/**
 * Turns one association into the `JOIN ... ON ...` fragments it needs.
 *
 * WHY A LINK-TABLE ALIAS EXISTS AT ALL, WHEN THE LEGACY HAS NONE. HQL traverses an association by
 * NAMING it — `:L546` emits `<parentAlias>.<relatedProperty> as <childAlias>` and Hibernate supplies
 * the predicate, silently including the link table for a many-to-many. Native SQL cannot do that, so
 * a many-to-many becomes two joins and the intermediate table needs a name. That name is derived from
 * the child's already-validated alias, so it is as whitelist-bound as everything else; it is a
 * translation artefact of the target dialect, not a change in what the query means. Consumers 4 and
 * 5 both traverse `SlatwallOption.skus`, so this path is exercised by real callers rather than
 * hypothetical ones.
 *
 * Every column here passes through {@link assertColumnName} against the table it belongs to, so a
 * mistake in the transcribed metadata above is refused rather than emitted.
 */
function composeJoinClauses(
  parent: PlannedEntity,
  specification: SmartListJoinSpecification,
  alias: string,
  joinType: SmartListJoinType | undefined,
): readonly string[] {
  const keyword = resolveJoinKeyword(joinType);
  const childTable = assertTableName(specification.childEntityName);
  const childPrimaryKey = assertColumnName(
    childTable,
    ENTITY_PRIMARY_KEY[specification.childEntityName],
  );
  const parentPrimaryKey = assertColumnName(parent.table, ENTITY_PRIMARY_KEY[parent.entityName]);

  switch (specification.kind) {
    case 'parentForeignKey': {
      // many-to-one: the PARENT table carries the foreign key.
      const parentColumn = assertColumnName(parent.table, specification.parentColumn);
      return [
        `${keyword} ${childTable} ${alias} ` +
          `ON ${alias}.${childPrimaryKey} = ${parent.alias}.${parentColumn}`,
      ];
    }

    case 'childForeignKey': {
      // one-to-many, inverse: the CHILD table carries the foreign key.
      const childColumn = assertColumnName(childTable, specification.childColumn);
      return [
        `${keyword} ${childTable} ${alias} ` +
          `ON ${alias}.${childColumn} = ${parent.alias}.${parentPrimaryKey}`,
      ];
    }

    case 'linkTable': {
      // many-to-many: the link table first, then the far entity off the link table.
      const linkTable = assertTableName(specification.linkEntityTable);
      const linkAlias = `${alias}_link`;
      const linkParentColumn = assertColumnName(linkTable, specification.linkParentColumn);
      const linkChildColumn = assertColumnName(linkTable, specification.linkChildColumn);
      return [
        `${keyword} ${linkTable} ${linkAlias} ` +
          `ON ${linkAlias}.${linkParentColumn} = ${parent.alias}.${parentPrimaryKey}`,
        `${keyword} ${childTable} ${alias} ` +
          `ON ${alias}.${childPrimaryKey} = ${linkAlias}.${linkChildColumn}`,
      ];
    }
  }
}

/* ================================================================================================
 * PATH RESOLUTION — A PORT OF org/Hibachi/HibachiSmartList.cfc:L308-L349
 * ============================================================================================== */

/**
 * Resolves a logical property path to a qualified, whitelisted column, auto-joining every hop.
 *
 * ⚠️ THIS IS THE LARGEST IDENTIFIER SURFACE IN THE FOLDER. The path is a string the CALLER chose, and
 * it lands in an identifier position where a `?` cannot bind. The generous instinct — resolve the
 * hops that are recognised and pass the remainder through — is precisely the failure mode: it
 * compiles, it satisfies the five known consumers, and it forwards whatever the first
 * request-driven caller supplies straight into statement text. So EVERY hop must resolve against the
 * declared graph and EVERY leaf against the column whitelist, and anything that does not resolve
 * THROWS. There is no degraded path and no fallback.
 *
 * The legacy walks the same way: `getAliasedProperty` at `:L329-L344` iterates every segment except
 * the last, calling the join registrar for each, then returns `<alias>.<property>` at `:L348`. The
 * intermediate joins are created with NO join type (`:L336`), which per {@link resolveJoinKeyword}
 * means left joins — so a filter on a deep path does not itself narrow the result set to rows that
 * have the intermediate association, and that is the legacy's behaviour.
 *
 * Depth is genuinely unbounded in practice and three hops are real: `model/entity/Product.cfc:L256`
 * filters `options.skus.product.productID` from a `SlatwallOptionGroup` base, traversing a
 * one-to-many, then a many-to-many through the link table, then a many-to-one.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L318-L320` — THE LEGACY SILENTLY DISCARDS AN
 * UNRESOLVABLE PATH: `getAliasedProperty` returns the empty string, and every accumulator is wrapped
 * in a length test that skips the entry — filters at `:L369`, like filters at `:L396`, in filters at
 * `:L422`, ranges at `:L449`, orders at `:L480` and keyword properties at `:L487`. That discarding is
 * carried where the decision belongs, which is UPSTREAM in
 * `src/ports/SmartListQueryPort.ts`: its resolver returns `undefined` for an unresolvable path and
 * the consuming services drop the entry, so nothing unresolvable is expected to arrive here. By the
 * time a path reaches this function it has already been validated once, and a failure therefore
 * indicates a defect in the caller rather than user input — which is why this layer reports it
 * instead of swallowing it a second time. Reporting where the legacy stayed quiet is the deliberate
 * judgment; the legacy's outward behaviour for a mistyped filter is unchanged because the drop still
 * happens, one layer up.
 */
function resolvePropertyPath(plan: QueryPlan, propertyIdentifier: string): string {
  const segments = propertyIdentifier.split(PROPERTY_PATH_DELIMITER);

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new DomainError(
      'A smart-list property path was empty or contained an empty segment, so no column could be ' +
        'resolved from it.',
      { context: { propertyIdentifier } },
    );
  }

  let entityKey = plan.baseEntityKey;

  // `:L329-L344` — every segment but the last is a hop, and each hop auto-joins with no join type.
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (segment === undefined) {
      throw new DomainError(
        'A smart-list property path lost a segment while it was being walked, so the path could ' +
          'not be resolved.',
        { context: { propertyIdentifier, segmentIndex: index } },
      );
    }

    entityKey = registerJoin(plan, entityKey, segment, '');
  }

  const entity = requireRegisteredEntity(plan, entityKey);
  const leaf = segments[segments.length - 1];

  if (leaf === undefined) {
    throw new DomainError(
      'A smart-list property path had no final segment, so there was no column to resolve.',
      { context: { propertyIdentifier } },
    );
  }

  return `${entity.alias}.${resolveLeafColumn(entity, leaf, propertyIdentifier)}`;
}

/**
 * Resolves the final segment of a path to a column of the entity it belongs to.
 *
 * Three cases, in this order, and the order matters:
 *   1. A `many-to-one` property. `:L348` returns the property name and Hibernate resolves it to the
 *      foreign key; native SQL must name that column, so {@link FOREIGN_KEY_LEAF_COLUMNS} supplies
 *      it. This case is tried FIRST because the property name itself is not a column — a path ending
 *      `product` would otherwise be refused even though the legacy accepts it.
 *   2. A collection property. It has no column on its own table at all, so it is refused. The legacy
 *      would have produced a comparison against an association, which Hibernate handles by identity
 *      and native SQL cannot express; refusing is the only honest translation.
 *   3. An ordinary stored column, validated against the whitelist.
 */
function resolveLeafColumn(
  entity: PlannedEntity,
  leaf: string,
  propertyIdentifier: string,
): string {
  const foreignKeyColumn = FOREIGN_KEY_LEAF_COLUMNS[entity.entityName][leaf];

  if (foreignKeyColumn !== undefined) {
    return assertColumnName(entity.table, foreignKeyColumn);
  }

  const specification = ENTITY_JOIN_SPECIFICATIONS[entity.entityName][leaf];

  if (specification !== undefined && specification.kind !== 'parentForeignKey') {
    throw new DomainError(
      'A smart-list property path ended at a collection association, which has no column on the ' +
        'table it belongs to. Extend the path to a stored property of the associated entity.',
      { context: { entityName: entity.entityName, leaf, propertyIdentifier } },
    );
  }

  return assertColumnName(entity.table, leaf);
}

/* ================================================================================================
 * VALUE SPLITTING — CFML LIST SEMANTICS, WHICH ARE NOT JAVASCRIPT SPLIT SEMANTICS
 * ============================================================================================== */

/** One composed clause: its text, and the values its placeholders consume, in order. */
interface ComposedClause {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Splits a filter value the way `listLen` and `listGetAt` do, which is NOT the way `String.split`
 * does, and the difference is observable.
 *
 * ⚠️ CFML LISTS DISCARD EMPTY ELEMENTS. `listLen("a,,b", ",")` is 2, not 3, and `listGetAt` skips the
 * hole; `listLen("1,", ",")` is 1, not 2. A plain `'1,'.split(',')` yields two elements, so a naive
 * translation would send `"1,"` down the multi-value branch and compare against `"1"` and `""` where
 * the legacy compares against the whole string `"1,"`. Both branches of
 * `org/Hibachi/HibachiSmartList.cfc:L578-L601` are therefore reproduced with the list rule: the
 * multi-value branch at `:L579-L591` iterates the NON-EMPTY elements, and the single-value branch at
 * `:L592-L600` binds the RAW value rather than the first element — which is exactly what the legacy
 * `else` reads.
 *
 * A non-string value has no list structure to speak of, so it is returned as itself. That keeps the
 * numeric filter values of `integrationServices/google/controllers/feed.cfc:L68-L70` bound as
 * numbers rather than round-tripped through a string.
 */
function splitFilterValueForComparison(
  value: SmartListFilterValue,
): readonly SmartListFilterValue[] {
  if (typeof value !== 'string') {
    return [value];
  }

  const elements = value.split(FILTER_VALUE_DELIMITER).filter((element) => element.length > 0);

  // `listLen(...) gt 1` at `:L578` — anything else takes the single-value branch, which uses the raw
  // value and not a trimmed element.
  return elements.length > 1 ? elements : [value];
}

/**
 * Splits an in-filter value the way `listToArray` does — `:L622` — which also discards empty
 * elements, so `listToArray("")` is the EMPTY array.
 */
function splitInFilterValues(value: SmartListFilterValue): readonly SmartListFilterValue[] {
  if (typeof value !== 'string') {
    return [value];
  }

  return value.split(FILTER_VALUE_DELIMITER).filter((element) => element.length > 0);
}

/**
 * The `NULL` sentinel of `org/Hibachi/HibachiSmartList.cfc:L580` and `:L593`.
 *
 * The legacy comparison is CFML `eq` / `==` against the literal `"NULL"`, and CFML string comparison
 * is case-insensitive, so `null`, `Null` and `NULL` all reach the `IS NULL` branch. A numeric or
 * boolean value never does, because CFML would not consider it equal to a non-numeric string either.
 */
function isNullFilterToken(value: SmartListFilterValue): boolean {
  return typeof value === 'string' && value.toLowerCase() === NULL_FILTER_TOKEN;
}

/* ================================================================================================
 * WHERE COMPOSITION — A PORT OF org/Hibachi/HibachiSmartList.cfc:L556-L712
 * ============================================================================================== */

/**
 * Composes one equality filter — `:L577-L601`.
 *
 * Multi-value form: a parenthesised OR chain, with `IS NULL` substituted for the sentinel and NO
 * placeholder consumed for it. Single-value form: one comparison, again with the `IS NULL`
 * substitution.
 *
 * TODO(parity) `integrationServices/google/controllers/feed.cfc:L68-L70` — A NUMBER IS PASSED WHERE A
 * STRING IS DECLARED. The three feed filters pass the NUMERIC literal `1` into `addFilter`, whose
 * `value` parameter is declared `required string` at `org/Hibachi/HibachiSmartList.cfc:L364`. CFML
 * coerces it silently; TypeScript would not, so the filter value type admits `string`, `number` and
 * `boolean` alike and the value is bound AS SUPPLIED rather than stringified. Binding `1` as a number
 * against an integer flag column is what MySQL expects in any case, so nothing is lost by declining to
 * reproduce the coercion — but the coercion is what the legacy does, and it is recorded because a
 * reader checking the declared signature against the call site will notice the mismatch and should
 * find it already accounted for.
 */
function composeEqualityFilter(
  plan: QueryPlan,
  filter: SmartListFilter,
  params: unknown[],
): string {
  const column = resolvePropertyPath(plan, filter.propertyIdentifier);
  const values = splitFilterValueForComparison(filter.value);

  if (values.length > 1) {
    const disjuncts = values.map((value) => {
      if (isNullFilterToken(value)) {
        return `${column} IS NULL`;
      }
      params.push(value);
      return `${column} = ?`;
    });

    return `(${disjuncts.join(' OR ')})`;
  }

  const value = values[0];

  if (value === undefined) {
    throw new DomainError(
      'A smart-list equality filter produced no comparable value, so no predicate could be ' +
        'composed for it.',
      { context: { propertyIdentifier: filter.propertyIdentifier } },
    );
  }

  if (isNullFilterToken(value)) {
    return `${column} IS NULL`;
  }

  params.push(value);
  return `${column} = ?`;
}

/**
 * Composes one like filter — `:L603-L618`.
 *
 * Same two branches as the equality filter, and deliberately WITHOUT the `NULL` sentinel: the legacy
 * like-filter branches carry no such test, so a like filter whose value is the string `NULL` is
 * matched literally. Carried as-is.
 *
 * The wildcards are the CALLER's to supply. The legacy binds the value exactly as it was given —
 * `:L607` and `:L613` — and only the keyword search wraps its own wildcards (`:L699`). Adding them
 * here would widen every like filter in the slice.
 */
function composeLikeFilter(plan: QueryPlan, filter: SmartListFilter, params: unknown[]): string {
  const column = resolvePropertyPath(plan, filter.propertyIdentifier);
  const values = splitFilterValueForComparison(filter.value);

  if (values.length > 1) {
    const disjuncts = values.map((value) => {
      params.push(value);
      return `${column} LIKE ?`;
    });

    return `(${disjuncts.join(' OR ')})`;
  }

  const value = values[0];

  if (value === undefined) {
    throw new DomainError(
      'A smart-list like filter produced no comparable value, so no predicate could be composed ' +
        'for it.',
      { context: { propertyIdentifier: filter.propertyIdentifier } },
    );
  }

  params.push(value);
  return `${column} LIKE ?`;
}

/**
 * Composes one in filter — `:L620-L628`.
 *
 * ⚠️ PLACEHOLDER ARITY IS THE WHOLE PROBLEM. HQL takes a single named parameter bound to an array and
 * expands it (`:L622` binds `listToArray(...)`, `:L624` emits `IN (:param)`); native SQL has no such
 * expansion, so one `?` must be emitted per element and each bound separately. Emitting one
 * placeholder for a multi-element list would bind the whole comma string as a single value and match
 * nothing, with no error and no type failure.
 *
 * ⚠️ AND AN EMPTY LIST NEVER COLLAPSES TO ZERO PLACEHOLDERS. `IN ()` is a syntax error in MySQL, and
 * the legacy has the same flaw — `listToArray("")` is the empty array, so `IN (:param)` binds nothing
 * and the statement fails to prepare. Rather than reproduce a statement that cannot execute, ONE
 * placeholder is emitted bound to the value as supplied. Nothing observable is displaced, because the
 * behaviour being replaced is a failure to run; and the statement stays valid, which is what keeps
 * every other clause of a query carrying one empty in-filter assertable. This is a stated judgment
 * call, not an optimisation.
 */
function composeInFilter(plan: QueryPlan, filter: SmartListFilter, params: unknown[]): string {
  const column = resolvePropertyPath(plan, filter.propertyIdentifier);
  const values = splitInFilterValues(filter.value);

  if (values.length === 0) {
    params.push(filter.value);
    return `${column} IN (?)`;
  }

  for (const value of values) {
    params.push(value);
  }

  return `${column} IN (${values.map(() => '?').join(', ')})`;
}

/**
 * Composes one range — `:L630-L659`, all three branches.
 *
 * The delimiter is `^` (`:L36`) and the three shapes are: a LEADING delimiter, meaning upper bound
 * only (`:L635-L640`); a TRAILING delimiter, meaning lower bound only (`:L642-L647`); and neither,
 * meaning both (`:L649-L656`). Parsing lives upstream in `src/ports/SmartListQueryPort.ts`, so what
 * arrives here is the parsed pair and the branch is chosen by which bounds are present.
 *
 * ⚠️ `'1^'` — THE FEED'S AVAILABILITY GATE — IS THE TRAILING-DELIMITER BRANCH.
 * `integrationServices/google/controllers/feed.cfc:L72` gates the product feed with
 * `addRange('product.calculatedQATS','1^')`, and it must stay expressible with NO upper bound. It
 * emits `>= ?` bound to `1`, which is `:L646`'s comparison exactly. AAP 0.6.4.1 reads the gate as
 * `QATS >= 1`, and the same gate written directly in native SQL by the dead, unported feed component
 * at `integrationServices/google/model/dao/FeedDAO.cfc:L71` uses a strict `> 0` — cited as
 * corroboration of intent only, by locator, since that component is unreferenced and stays unported.
 * The `>=` form is emitted because that is what the legacy line running in production emits.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L630-L659` — THE `'1^'` NORMALISATION IS A DECISION.
 * The legacy carries the range as the RAW STRING `'1^'` all the way to statement assembly and decides
 * its meaning there by inspecting the first and last characters. Here it arrives already separated
 * into bounds, so the branch is chosen by which bound is present rather than by re-inspecting a
 * string, and `'1^'` becomes a lower bound of `1` with no upper bound — one `>= ?` comparison and one
 * parameter. The comparison, the operand and the absence of an upper bound are all identical to
 * `:L646`; only the point at which the string was decomposed moved, and it moved because the port
 * owns parsing. No bound was invented and none was tightened.
 *
 * A range with neither bound is skipped and contributes nothing, which is `:L632`'s `len(...) gt 1`
 * guard: a range string of one character or less never reaches a comparison.
 *
 * When BOTH bounds are present the lower is bound FIRST, matching the order the legacy adds them in
 * at `:L653-L654`, so the parameter array stays in placeholder order (TR-4).
 */
function composeRange(
  plan: QueryPlan,
  range: SmartListRange,
  params: unknown[],
): string | undefined {
  const lowerBound = range.lowerBound;
  const upperBound = range.upperBound;

  if (lowerBound === undefined && upperBound === undefined) {
    return undefined;
  }

  const column = resolvePropertyPath(plan, range.propertyIdentifier);

  if (lowerBound !== undefined && upperBound !== undefined) {
    params.push(lowerBound);
    params.push(upperBound);
    return `${column} >= ? AND ${column} <= ?`;
  }

  if (upperBound !== undefined) {
    params.push(upperBound);
    return `${column} <= ?`;
  }

  params.push(lowerBound);
  return `${column} >= ?`;
}

/**
 * Composes one where group's conjunction, or `undefined` when the group is empty.
 *
 * ENTRIES WITHIN A GROUP ARE AND-ED, and the four kinds are emitted in the legacy's order — filters,
 * like filters, in filters, ranges (`:L577`, `:L603`, `:L620`, `:L630`) — because that order is also
 * the parameter order.
 *
 * AN EMPTY GROUP OPENS NOTHING. `:L562` tests all four accumulators before opening a group, so a
 * group that contributes no predicate contributes no parentheses and no `OR` either.
 */
function composeWhereGroup(
  plan: QueryPlan,
  group: SmartListWhereGroup,
  params: unknown[],
): string | undefined {
  const predicates: string[] = [];

  for (const filter of group.filters ?? []) {
    predicates.push(composeEqualityFilter(plan, filter, params));
  }

  for (const likeFilter of group.likeFilters ?? []) {
    predicates.push(composeLikeFilter(plan, likeFilter, params));
  }

  for (const inFilter of group.inFilters ?? []) {
    predicates.push(composeInFilter(plan, inFilter, params));
  }

  for (const range of group.ranges ?? []) {
    const predicate = composeRange(plan, range, params);

    if (predicate !== undefined) {
      predicates.push(predicate);
    }
  }

  if (predicates.length === 0) {
    return undefined;
  }

  return `(${predicates.join(' AND ')})`;
}

/**
 * Composes the keyword search — `:L671-L693`.
 *
 * Each keyword produces one parenthesised OR chain over every keyword property, and the chains are
 * AND-ed, so a two-keyword search over five properties requires a record to match BOTH keywords, each
 * in at least one of the five. The value bound is the keyword wrapped in wildcards on both sides, per
 * `:L699`.
 *
 * ⚠️ ONE PARAMETER BECOMES N. The legacy binds a keyword ONCE as a named parameter and references
 * that name from every property comparison (`:L699` then `:L703`). Positional placeholders cannot be
 * referenced twice, so the same wrapped value is bound once per property — five bindings per keyword
 * for the two five-property consumers. The predicate is identical; only the parameter array is longer,
 * and TR-4's ordering is preserved because the bindings are pushed in the order the placeholders
 * appear.
 *
 * ⚠️ WEIGHTS ARE NOT USED, AND NOT BECAUSE THEY WERE OVERLOOKED. `weight` appears exactly three times
 * in the entire 1090-line component: the property hint at `:L20`, the setter parameter at `:L485` and
 * the store at `:L488`. It is written and NEVER READ — no ranking, no ordering, no scoring term
 * anywhere in the emitted HQL. Both keyword-bearing consumers pass `1` for all five properties in any
 * case (`model/service/ProductService.cfc:L351-L355` and `model/service/SkuService.cfc:L318-L322`),
 * so a uniform treatment is faithful twice over. Introducing weight arithmetic would be inventing a
 * ranking the legacy does not have (S9).
 */
function composeKeywordClause(plan: QueryPlan, query: SmartListQuery, params: unknown[]): string {
  const keywords = query.keywords ?? [];
  const keywordProperties = query.keywordProperties ?? [];

  // `:L670` tests both accumulators; either being empty means no keyword clause at all.
  if (keywords.length === 0 || keywordProperties.length === 0) {
    return '';
  }

  // Resolved first, and deliberately: resolution may register joins but binds no parameter, so doing
  // it up front cannot disturb placeholder order.
  const columns = keywordProperties.map((keywordProperty) =>
    resolvePropertyPath(plan, keywordProperty.propertyIdentifier),
  );

  const blocks = keywords.map((keyword) => {
    const disjuncts = columns.map((column) => {
      params.push(`${KEYWORD_WILDCARD}${keyword}${KEYWORD_WILDCARD}`);
      return `${column} LIKE ?`;
    });

    return `(${disjuncts.join(' OR ')})`;
  });

  return blocks.join(' AND ');
}

/**
 * Composes the whole `WHERE` clause, or an empty clause when there is nothing to constrain.
 *
 * Shape: `WHERE ( (group) OR (group) ) AND (keyword block) AND (keyword block)`. Groups are OR-ed
 * inside one outer parenthesis (`:L565-L569` opens it, `:L676` AND-s the keyword clause on), and the
 * keyword blocks sit outside that parenthesis so a keyword narrows the whole disjunction rather than
 * joining it.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L565-L667` — THE LEGACY CAN EMIT AN UNBALANCED
 * PARENTHESIS. The outer `(` is opened by the first NON-EMPTY group at `:L569`, but it is closed at
 * `:L666` only when the loop index equals the LAST index of the group array. If the final group is
 * empty it is skipped by the `:L562` guard, the index never reaches the closing test, and the outer
 * parenthesis is left open — invalid HQL that fails at prepare time. Balanced text is emitted here
 * instead, because emitting a statement that cannot be prepared preserves nothing. The situation is
 * unreachable through `src/ports/SmartListQueryPort.ts`, which contributes only non-empty groups, so
 * no observable behaviour differs; the divergence is recorded because it is a divergence.
 */
function composeWhereClause(plan: QueryPlan, query: SmartListQuery): ComposedClause {
  const params: unknown[] = [];
  const groups: string[] = [];

  for (const group of query.whereGroups ?? []) {
    const composed = composeWhereGroup(plan, group, params);

    if (composed !== undefined) {
      groups.push(composed);
    }
  }

  const keywordClause = composeKeywordClause(plan, query, params);
  const conjuncts: string[] = [];

  if (groups.length > 0) {
    conjuncts.push(`(${groups.join(' OR ')})`);
  }

  if (keywordClause.length > 0) {
    conjuncts.push(keywordClause);
  }

  if (conjuncts.length === 0) {
    return { sql: '', params };
  }

  return { sql: ` WHERE ${conjuncts.join(' AND ')}`, params };
}

/* ================================================================================================
 * ORDERING — A PORT OF org/Hibachi/HibachiSmartList.cfc:L717-L744, PLUS THE PIPE GRAMMAR
 * ============================================================================================== */

/**
 * The property each base entity falls back to when a query declares no ordering.
 *
 * `:L730-L742` tries three things in order: a `hb_defaultOrderProperty` entry in the entity's
 * metadata, then a `createdDateTime` property, then the primary identifier. A metadata scan of the
 * six in-scope entity components finds NO `hb_defaultOrderProperty` on any of them, and all seven
 * entities in the graph carry the audit block's `createdDateTime`, so the second branch is the one
 * that applies throughout the slice and the primary-identifier fallback at `:L738` is unreachable
 * here. Stating the resolved value per entity is preferable to re-implementing a metadata probe whose
 * every answer is already known, and it keeps the fallback from being dead code.
 */
const ENTITY_DEFAULT_ORDER_PROPERTY: Readonly<Record<SmartListEntityName, string>> = Object.freeze({
  SlatwallSku: 'createdDateTime',
  SlatwallProduct: 'createdDateTime',
  SlatwallProductType: 'createdDateTime',
  SlatwallBrand: 'createdDateTime',
  SlatwallOption: 'createdDateTime',
  SlatwallOptionGroup: 'createdDateTime',
  SlatwallAlternateSkuCode: 'createdDateTime',
});

/** The order-direction delimiter, `variables.orderDirectionDelimiter` at `:L33`. */
const ORDER_DIRECTION_DELIMITER = '|';

/** The descending tokens `listFindNoCase` tests at `:L476`. */
const DESCENDING_ORDER_TOKENS: readonly string[] = Object.freeze(['D', 'DESC']);

/** The ascending spellings accepted by {@link parseOrderDeclaration}. See its note on the divergence. */
const ASCENDING_ORDER_TOKENS: readonly string[] = Object.freeze(['A', 'ASC']);

/**
 * Parses the legacy pipe-delimited order declaration — `"property|DIRECTION"` — into a typed order.
 *
 * THIS IS THE `addOrder` GRAMMAR OF `org/Hibachi/HibachiSmartList.cfc:L473-L482`, and it has to be
 * expressible from here because two in-scope consumers write it as a LITERAL in code rather than
 * receiving it as request data: `model/entity/Product.cfc:L257` and `model/entity/Product.cfc:L343`
 * both call `addOrder("sortOrder|ASC")`.
 *
 * ⚠️ A DECLARED DIVERGENCE, AND A DELIBERATELY NARROW ONE. The legacy defaults silently: `:L475` seeds
 * the direction `ASC`, and `:L476` upgrades it to `DESC` only when the statement has more than one
 * element AND the last element is `D` or `DESC`. So `"sortOrder"` yields ASC, and so does
 * `"sortOrder|SIDEWAYS"` — a typo in a direction token is indistinguishable from a correct ascending
 * declaration, forever. This function REFUSES both instead.
 *
 * The reason it is safe to refuse here, and why refusing does not change observable behaviour:
 *   • The REQUEST-DRIVEN route is untouched. An `OrderBy` key arriving in framework request data is
 *     translated by `src/ports/SmartListQueryPort.ts`, which reproduces the legacy default exactly,
 *     including the drop of an unresolvable property. User input therefore still behaves as it always
 *     did, and this file never sees the raw string on that path — it receives an already-parsed order.
 *   • This route serves DEVELOPER-AUTHORED LITERALS. For a literal written in source, an unrecognised
 *     direction token is a programming mistake, and the legacy's silence is precisely what makes such
 *     a mistake permanent. Reporting it is the judgment call; it is recorded here rather than made
 *     quietly (AAP 0.8.2 Guideline 6).
 *
 * The property is resolved through the port's own identifier whitelist, so a path that is not part of
 * the declared entity graph is refused before any statement text exists — the same rule
 * {@link resolvePropertyPath} applies one layer down, applied one layer up.
 *
 * @param entityName - The entity the declaration's property path is rooted at.
 * @param declaration - `"property|DIRECTION"`, for example `"sortOrder|ASC"`.
 * @returns The typed order, ready to place in {@link SmartListQuery.orders}.
 */
export function parseOrderDeclaration(
  entityName: SmartListEntityName,
  declaration: string,
): SmartListOrder {
  // CFML list semantics again: `listFirst`/`listLast` ignore empty elements (`:L474`, `:L476`).
  const elements = declaration
    .split(ORDER_DIRECTION_DELIMITER)
    .filter((element) => element.length > 0);

  if (elements.length !== 2) {
    throw new DomainError(
      'A smart-list order declaration must name a property and a direction separated by a pipe, ' +
        'for example "sortOrder|ASC". The declaration supplied did not, so it was refused rather ' +
        'than assigned a direction it did not ask for.',
      { context: { entityName, declaration } },
    );
  }

  const rawProperty = elements[0];
  const rawDirection = elements[1];

  if (rawProperty === undefined || rawDirection === undefined) {
    throw new DomainError(
      'A smart-list order declaration lost one of its two elements while being read, so no order ' +
        'could be built from it.',
      { context: { entityName, declaration } },
    );
  }

  const normalisedDirection = rawDirection.toUpperCase();
  const descending = DESCENDING_ORDER_TOKENS.some((token) => token === normalisedDirection);
  const ascending = ASCENDING_ORDER_TOKENS.some((token) => token === normalisedDirection);

  if (!descending && !ascending) {
    throw new DomainError(
      'A smart-list order declaration named a direction that is neither ascending nor descending. ' +
        'Use A, ASC, D or DESC.',
      { context: { entityName, declaration, direction: rawDirection } },
    );
  }

  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);

  if (propertyIdentifier === undefined) {
    throw new DomainError(
      'A smart-list order declaration named a property path that the extracted Catalog entity ' +
        'graph does not declare, so it was refused before any statement text was assembled.',
      { context: { entityName, declaration, propertyPath: rawProperty } },
    );
  }

  return { propertyIdentifier, direction: descending ? 'DESC' : 'ASC' };
}

/**
 * Composes the `ORDER BY` clause — `:L717-L744`.
 *
 * Declared orders are emitted in declaration order, comma-separated (`:L725-L727`). With none
 * declared, the default single-term ordering of `:L730-L743` is emitted; that branch is guarded by
 * `!structCount(variables.selects)` at `:L729`, and since the projection accumulator at `:L351` is
 * one of the members this port deliberately omits, the guard is vacuously satisfied and the default
 * always applies.
 *
 * Every column here is resolved through the whitelist, so an order term can auto-join exactly as a
 * filter can — which is why this runs before the `FROM` clause is emitted.
 */
function composeOrderClause(plan: QueryPlan, query: SmartListQuery): string {
  const orders = query.orders ?? [];

  if (orders.length > 0) {
    const terms = orders.map(
      (order) => `${resolvePropertyPath(plan, order.propertyIdentifier)} ${order.direction}`,
    );

    return ` ORDER BY ${terms.join(', ')}`;
  }

  const base = requireRegisteredEntity(plan, plan.baseEntityKey);
  const defaultProperty = ENTITY_DEFAULT_ORDER_PROPERTY[base.entityName];

  return ` ORDER BY ${resolvePropertyPath(plan, defaultProperty)} ASC`;
}

/* ================================================================================================
 * PAGING — A PORT OF org/Hibachi/HibachiSmartList.cfc:L792-L814
 * ============================================================================================== */

/** The paging figures one query resolves to, before any row is read. */
interface ResolvedPagination {
  readonly pageRecordsStart: number;
  readonly pageRecordsShow: number;
  readonly currentPage: number;
}

/**
 * Resolves the paging figures.
 *
 * `:L792-L797` — the first record of the page is recomputed from the declared page whenever that page
 * is greater than one, and otherwise the stored start is used as given. `:L808-L809` — the current
 * page is then `ceiling(start / show)`, which is why a caller may specify EITHER a page number or a
 * start offset and get a consistent answer for both.
 *
 * Absent figures fall back to the values the legacy's own setup member declares — `pageRecordsStart=1`
 * and `pageRecordsShow=10` in the signature at `org/Hibachi/HibachiSmartList.cfc:L39`, applied at
 * `:L65-L66`, and the declared page seeded at `:L56`. These are SOURCE-DECLARED figures carried with
 * their locator, not defaults of this file's choosing (S9); `src/ports/SmartListQueryPort.ts` states
 * explicitly that resolving absent pagination belongs to the adapter, exactly as it belongs to the
 * setup member in the legacy.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L26` — THE DECLARED PAGE IS TYPED AS A STRING. The
 * property is `type="string"`, yet `:L56` seeds it with the NUMBER `1` and `:L793` compares it with
 * `>` and does arithmetic on it, relying on CFML's implicit coercion. The port keeps the string type
 * on the wire so the legacy shape stays visible; the conversion happens here, once, and refuses a
 * value that is not a number rather than letting `NaN` propagate into a `LIMIT`.
 *
 * The integrality requirement is a target-dialect necessity rather than an added rule: `LIMIT` and
 * `OFFSET` take non-negative integers, so a fractional page size has no representation and is
 * reported instead of silently truncated.
 */
function resolvePagination(pagination: SmartListPagination | undefined): ResolvedPagination {
  const pageRecordsShow = pagination?.pageRecordsShow ?? LEGACY_DEFAULT_PAGE_RECORDS_SHOW;
  const declaredStart = pagination?.pageRecordsStart ?? LEGACY_DEFAULT_PAGE_RECORDS_START;
  const declaredPageText =
    pagination?.currentPageDeclaration ?? LEGACY_DEFAULT_CURRENT_PAGE_DECLARATION;

  assertPositiveInteger(pageRecordsShow, 'page size');
  assertPositiveInteger(declaredStart, 'first record of the page');

  const declaredPage = Number(declaredPageText);

  if (!Number.isInteger(declaredPage) || declaredPage < 1) {
    throw new DomainError(
      'A smart-list query declared a current page that is not a whole number of at least one, so ' +
        'no page bounds could be derived from it.',
      { context: { currentPageDeclaration: declaredPageText } },
    );
  }

  // `:L793-L794` — the declared page wins whenever it is past the first page.
  const pageRecordsStart =
    declaredPage > 1 ? (declaredPage - 1) * pageRecordsShow + 1 : declaredStart;

  return {
    pageRecordsStart,
    pageRecordsShow,
    // `:L808-L809`.
    currentPage: Math.ceil(pageRecordsStart / pageRecordsShow),
  };
}

/** Refuses a paging figure that cannot be expressed as a `LIMIT` or `OFFSET` operand. */
function assertPositiveInteger(value: number, description: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new DomainError(
      `A smart-list query declared a ${description} that is not a whole number of at least one, so ` +
        'the page bounds could not be expressed.',
      { context: { description, value } },
    );
  }
}

/* ================================================================================================
 * PROJECTION AND SOURCE — A PORT OF org/Hibachi/HibachiSmartList.cfc:L499-L553
 * ============================================================================================== */

/**
 * Composes the record projection — `:L505-L521`.
 *
 * The legacy selects the base entity itself and lets Hibernate hydrate it, so the target selects that
 * entity's own columns and lets `src/adapters/mysql/rowMappers.ts` hydrate them. Selecting
 * `<baseAlias>.*` rather than an enumerated column list is the closest equivalent: the mappers read
 * columns by name, they are the single place the column-to-field correspondence is stated, and an
 * enumerated list here would be a second, silently divergent copy of that correspondence.
 *
 * ⚠️ THE QUALIFIER IS NOT DECORATION. Every join in this builder brings a second table into scope, and
 * several of them carry columns of the same name — `createdDateTime` and `modifiedDateTime` exist on
 * all seven tables, and `skuID` exists on three. An unqualified `*` would return the joined tables'
 * columns too and the mappers would read whichever won, so the base alias qualifier is what keeps a
 * hydrated record the base entity and nothing else.
 *
 * Distinctness honours the flag, whose seeded value is FALSE at `:L59`. Consumers 4 and 5 turn it on
 * explicitly at `model/entity/Product.cfc:L254` and `model/entity/Product.cfc:L341`.
 */
function composeSelectClause(plan: QueryPlan, selectDistinct: boolean): string {
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);

  return `SELECT ${selectDistinct ? 'DISTINCT ' : ''}${base.alias}.*`;
}

/** The column alias the count projection is read back through. A literal of this file, never input. */
const RECORDS_COUNT_COLUMN_ALIAS = 'recordsCount';

/**
 * Composes the counting projection — `:L502`.
 *
 * ⚠️ THE COUNT IS ALWAYS DISTINCT, WHETHER OR NOT THE RECORD PROJECTION IS. `:L502` emits
 * `count(distinct <baseAlias>.<primaryID>)` unconditionally, while the record projection at
 * `:L505-L521` consults the flag. That asymmetry is the legacy's, it is carried rather than tidied,
 * and it is reported through {@link SMARTLIST_DISTINCT_ASYMMETRY} so a test can assert it. It also
 * means a query with fanning joins and the flag off reports a count SMALLER than the number of rows
 * its record statement returns — surprising, and exactly what the legacy does.
 */
function composeCountSelectClause(plan: QueryPlan): string {
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);
  const primaryKey = assertColumnName(base.table, ENTITY_PRIMARY_KEY[base.entityName]);

  return `SELECT COUNT(DISTINCT ${base.alias}.${primaryKey}) AS ${RECORDS_COUNT_COLUMN_ALIAS}`;
}

/**
 * Composes the `FROM` clause and every join, in registration order — `:L534-L549`.
 *
 * ⭐ THIS IS WHERE D22 BECOMES VISIBLE. The legacy emits the LOGICAL entity name, because HQL names
 * entities: `:L535` emits `FROM <baseEntityName> as <baseAlias>` and `:L546` emits
 * `<joinType> join <parentAlias>.<relatedProperty> as <childAlias>`, letting Hibernate resolve both
 * the table and the predicate. Native SQL can do neither, so the physical table name replaces the
 * logical one and an explicit `ON` predicate replaces the named association. The caller's vocabulary
 * is untouched — it still says `SlatwallProduct` — and the translation happens here, once.
 *
 * Registration order is emission order, and it is not arbitrary: a join's `ON` predicate references
 * its parent's alias, so the parent must already appear. {@link SmartListQueryBuilder.build}
 * registers in the same sequence the consumers call in — declared joins first, then the joins implied
 * by filters and keyword properties, then those implied by ordering — which is the order
 * `model/service/ProductService.cfc:L347-L355` and `model/entity/Product.cfc:L256-L257` use.
 */
function composeFromClause(plan: QueryPlan): string {
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);
  const fragments: string[] = [`${base.table} ${base.alias}`];

  for (const entityKey of plan.joinOrder) {
    if (entityKey === plan.baseEntityKey) {
      continue;
    }

    for (const joinClause of requireRegisteredEntity(plan, entityKey).joinClauses) {
      fragments.push(joinClause);
    }
  }

  return ` FROM ${fragments.join(' ')}`;
}

/* ================================================================================================
 * HYDRATION
 * ============================================================================================== */

/**
 * Reads the single figure the counting statement produces.
 *
 * `mysql2` reports an aggregate as a JavaScript number in the ordinary case, and as a string or a
 * `bigint` when the driver is configured to preserve large integers. All three are accepted because
 * the connection options are the composition root's to choose, not this file's to assume, and any
 * other shape means the statement did not return what it was written to return.
 */
function readRecordsCount(rows: readonly MySqlRow[]): number {
  const row = rows[0];

  if (row === undefined) {
    throw new DataIntegrityError(
      'The smart-list counting statement returned no row, so the total record count could not be ' +
        'read.',
    );
  }

  const value = row[RECORDS_COUNT_COLUMN_ALIAS];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new DataIntegrityError(
    'The smart-list counting statement returned a value that is not a number, so the total record ' +
      'count could not be read.',
    { context: { column: RECORDS_COUNT_COLUMN_ALIAS } },
  );
}

/**
 * Hydrates rows through the base entity's mapper.
 *
 * ⚠️ THE ONE AND ONLY TYPE ASSERTION IN THIS FILE, AND WHY IT IS UNAVOIDABLE.
 * `SmartListQueryPort.execute<T>` lets the CALLER choose the element type — that is deliberate, and
 * `src/ports/SmartListQueryPort.ts` explains it: were the element type fixed, the port would have to
 * name domain types and would then depend on the layer beneath it. The consequence is that `T` is
 * unconstrained here, while the mapper selected from {@link ENTITY_ROW_MAPPERS} returns one concrete
 * hydrated entity type. Nothing at compile time can relate the two, because the relation is
 * established by the caller pairing an entity name with an element type at the call site — as
 * `src/services/SkuService.ts` does when it pairs `SlatwallSku` with its SKU element type.
 *
 * The assertion is therefore narrow and load-bearing rather than a way around a type error: the row
 * shape is real, the mapper is real, and the only unchecked step is the caller's own pairing. It is
 * confined to this one function so there is exactly one place to audit.
 */
function materialiseRows<T>(
  rows: readonly MySqlRow[],
  mapper: (row: MySqlRow) => unknown,
): readonly T[] {
  return mapRows(rows, mapper) as T[];
}

/* ================================================================================================
 * THE PROPERTY-SCOPED SMART LIST — getPropertySmartList
 * ============================================================================================== */

/**
 * Describes the smart list of one parent record's collection — the `getPropertySmartList` shape.
 *
 * `model/entity/OptionGroup.cfc:L81-L83` declares `getOptionsSmartList()` as
 * `getPropertySmartList(propertyName="options")`, which is a smart list over the COLLECTION's entity
 * constrained to one parent. The framework member at `org/Hibachi/HibachiEntity.cfc:L442-L460`
 * obtains the collection entity's smart list and then filters it on the inverse association back to
 * the parent, discovering that inverse by walking the child's property metadata. The inverse is stated
 * directly in {@link COLLECTION_INVERSE_PROPERTY} instead, from the same declarations, so the metadata
 * walk is not re-implemented.
 *
 * The filter path depends on which side owns the key, and both cases are real in this slice:
 *   • A `one-to-many` inverse is a `many-to-one` on the child, so the child's own table carries the
 *     foreign key and the path is just the inverse property name — `optionGroup` on `SwOption`
 *     resolves to `optionGroupID`, and no join is needed at all.
 *   • A `many-to-many` inverse is another collection, so the path continues to the parent's primary
 *     key and the link table is traversed. `SlatwallSku.options` reaches back through
 *     `SlatwallOption.skus`, which is the association `model/entity/Option.cfc:L66` declares inverse.
 *
 * Ordering is deliberately NOT set. `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"`
 * on the collection, but that attribute orders the ORM's collection, not a smart list composed over
 * the entity, and the legacy `getPropertySmartList` adds no order of its own. A caller that wants the
 * sort order applied says so, exactly as `model/entity/Product.cfc:L343` does — see
 * {@link parseOrderDeclaration}. Distinctness is likewise left at the seeded FALSE of `:L59`.
 *
 * @param parentEntityName - The entity that owns the collection.
 * @param collectionProperty - The collection property, for example `options`.
 * @param parentPrimaryKeyValue - The parent record's identifier, bound as a value.
 * @returns A query description ready for {@link SmartListQueryBuilder.build} or `execute`.
 */
export function describePropertyScopedSmartList(
  parentEntityName: SmartListEntityName,
  collectionProperty: string,
  parentPrimaryKeyValue: string,
): SmartListQuery {
  const specification = ENTITY_JOIN_SPECIFICATIONS[parentEntityName][collectionProperty];

  if (specification === undefined || specification.kind === 'parentForeignKey') {
    throw new DomainError(
      'A property-scoped smart list named a property that is not a collection on the entity that ' +
        'owns it, so there is no collection to scope.',
      { context: { parentEntityName, collectionProperty } },
    );
  }

  const collectionEntityName = specification.childEntityName;
  const inverseProperty = COLLECTION_INVERSE_PROPERTY[parentEntityName][collectionProperty];

  if (inverseProperty === undefined) {
    throw new DomainError(
      'A property-scoped smart list named a collection whose inverse association back to its owner ' +
        'is not declared, so the collection could not be constrained to one parent record.',
      { context: { parentEntityName, collectionProperty } },
    );
  }

  const inverseSpecification = ENTITY_JOIN_SPECIFICATIONS[collectionEntityName][inverseProperty];

  if (inverseSpecification === undefined) {
    throw new DomainError(
      'A property-scoped smart list resolved an inverse association that the collection entity ' +
        'does not declare, so the constraint could not be composed.',
      { context: { parentEntityName, collectionProperty, inverseProperty } },
    );
  }

  const filterPath =
    inverseSpecification.kind === 'parentForeignKey'
      ? inverseProperty
      : `${inverseProperty}${PROPERTY_PATH_DELIMITER}${ENTITY_PRIMARY_KEY[parentEntityName]}`;

  const propertyIdentifier = resolveSmartListPropertyIdentifier(collectionEntityName, filterPath);

  if (propertyIdentifier === undefined) {
    throw new DomainError(
      'A property-scoped smart list produced a constraint path that the declared entity graph does ' +
        'not admit, so it was refused before any statement text was assembled.',
      { context: { collectionEntityName, filterPath } },
    );
  }

  return {
    entityName: collectionEntityName,
    whereGroups: [{ filters: [{ propertyIdentifier, value: parentPrimaryKeyValue }] }],
  };
}

/* ================================================================================================
 * THE BUILDER
 * ============================================================================================== */

/**
 * Compiles described smart lists into parameterized MySQL, and runs them through an injected executor.
 *
 * ⚠️ THIS INSTANCE HOLDS NO QUERY STATE, WHICH IS THE POINT (M7). The legacy is a TRANSIENT: the
 * framework hands out a fresh smart list per use and the fluent members accumulate onto it. A
 * translation that kept that shape would put mutable accumulators on a long-lived object, and DI/1
 * hands out data-access components as SINGLETONS (`org/Hibachi/Hibachi.cfc:L289`), so the accumulated
 * state of one request would be visible to the next on a warm container. Instead the description
 * arrives complete — `src/ports/SmartListQueryPort.ts` made that decision, and this class honours it
 * — and every scrap of per-query state lives in a {@link QueryPlan} created inside {@link build} and
 * discarded when it returns. One instance is therefore safe to share across concurrent invocations,
 * and the composition root wires exactly one.
 *
 * There is also no cache of any kind: no result cache, no statement cache, no memoised plan, and no
 * port of the cache-key surface at `org/Hibachi/HibachiSmartList.cfc:L1081`.
 */
export class SmartListQueryBuilder implements SmartListQueryPort {
  /**
   * @param executor - The statement executor. Injected, never constructed, and never bypassed: when
   * `src/adapters/mysql/UnitOfWork.ts` supplies a transaction-scoped executor, these reads run inside
   * that transaction and therefore observe rows the same transaction has written but not committed —
   * which is the visibility M6 turns on. Reaching for a pool directly would silently read committed
   * state instead, so the pool is not reachable from this file at all.
   */
  public constructor(private readonly executor: SqlExecutor) {}

  /**
   * Compiles a description into its three statements and its paging figures, executing nothing.
   *
   * Public deliberately. All coverage of this builder is NET-NEW (AAP 0.6.5.2 — no data-access test
   * exists for this slice, and none exists for the framework smart list either), and the `Sw*` tables
   * exist in no artefact of this repository, so the only way to assert what is emitted is to inspect
   * it as a value. This is also what lets the two TRACEABLE regressions stay assertable: the
   * page-record distinctness of `meta/tests/unit/IssuesTest.cfc` shows up as `DISTINCT` in
   * {@link CompiledSmartListQuery.records} together with the page bounds, and the product smart list
   * the second regression exercises compiles without a live database.
   *
   * The order of work matters, and it mirrors the order the consumers call in:
   *   1. Declared joins, in declaration order — `model/service/ProductService.cfc:L347-L349`.
   *   2. Filters, then keyword properties, both of which may auto-join —
   *      `integrationServices/google/controllers/feed.cfc:L68-L72` and
   *      `model/service/ProductService.cfc:L351-L355`.
   *   3. Ordering, which may also auto-join — `model/entity/Product.cfc:L257`.
   *   4. Only then the `FROM` clause, once every alias it must name exists.
   */
  public build(query: SmartListQuery): CompiledSmartListQuery {
    const plan = openPlan(query.entityName);

    for (const join of query.joins ?? []) {
      registerDeclaredJoin(plan, join);
    }

    const where = composeWhereClause(plan, query);
    const order = composeOrderClause(plan, query);
    const from = composeFromClause(plan);

    // `:L59` seeds the flag FALSE, so an unstated flag means a non-distinct record projection.
    const selectDistinct = query.selectDistinctFlag ?? false;
    const paging = resolvePagination(query.pagination);
    const base = requireRegisteredEntity(plan, plan.baseEntityKey);

    // `getHQL()` at `:L748-L750` — select, from, where, order. No bound of any kind.
    const recordsSql = `${composeSelectClause(plan, selectDistinct)}${from}${where.sql}${order}`;

    // `:L762` — the legacy's own offset and maximum-results pair, and the ONLY bound in this file.
    const pageRecordsSql = `${recordsSql} LIMIT ? OFFSET ?`;

    // `:L777` — select, from, where. NO ORDER BY, and no bound: ordering a scalar aggregate would be
    // pointless and limiting it would change the answer.
    const recordsCountSql = `${composeCountSelectClause(plan)}${from}${where.sql}`;

    return {
      entityName: query.entityName,
      baseTable: base.table,
      baseAlias: base.alias,
      records: { sql: recordsSql, params: where.params },
      pageRecords: {
        sql: pageRecordsSql,
        params: [...where.params, paging.pageRecordsShow, paging.pageRecordsStart - 1],
      },
      recordsCount: { sql: recordsCountSql, params: where.params },
      pageRecordsStart: paging.pageRecordsStart,
      pageRecordsShow: paging.pageRecordsShow,
      currentPage: paging.currentPage,
      selectDistinct,
    };
  }

  /**
   * Runs a described query and returns its materialised outcome.
   *
   * THE THREE STATEMENTS RUN SEQUENTIALLY, NOT CONCURRENTLY. The injected executor may be bound to a
   * single transaction-scoped connection (M6), and a connection cannot carry overlapping statements,
   * so issuing them in parallel would be unsafe for the very case the injection exists to serve. The
   * legacy is sequential too, materialising the unpaged collection at `:L751`, the page at `:L759` and
   * the count at `:L771` as each is first read.
   *
   * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L783-L785` — THE LEGACY COUNT IS ORDER-DEPENDENT.
   * `getRecordsCount` runs the dedicated counting statement only when the unpaged collection has NOT
   * already been materialised; if it has, the count degrades to the LENGTH of that collection, which
   * differs from `count(distinct ...)` whenever a fanning join is present and the distinct flag is off
   * (see {@link SMARTLIST_DISTINCT_ASYMMETRY}). So the same query reports two different totals
   * depending on which member a caller happened to read first. `src/ports/SmartListQueryPort.ts`
   * resolves that ambiguity in favour of the dedicated statement, and this member follows the port:
   * the count is always counted, never inferred.
   */
  public async execute<T>(query: SmartListQuery): Promise<SmartListResult<T>> {
    const compiled = this.build(query);
    const mapper = ENTITY_ROW_MAPPERS[query.entityName];

    if (mapper === undefined) {
      throw new DomainError(
        'A smart list was rooted at an entity that this port has no hydration mapping for, so its ' +
          'records could not be materialised. Only the entities the extracted Catalog slice models ' +
          'as domain types may be the base of a smart list.',
        { context: { entityName: query.entityName } },
      );
    }

    const recordRows = await this.executor.execute(compiled.records.sql, compiled.records.params);
    const pageRows = await this.executor.execute(
      compiled.pageRecords.sql,
      compiled.pageRecords.params,
    );
    const countRows = await this.executor.execute(
      compiled.recordsCount.sql,
      compiled.recordsCount.params,
    );

    const recordsCount = readRecordsCount(countRows);

    // `:L800-L803` — the page end, clamped to the total so a short final page reports its real end.
    const pageRecordsEnd = Math.min(
      compiled.pageRecordsStart + compiled.pageRecordsShow - 1,
      recordsCount,
    );

    return {
      records: materialiseRows<T>(recordRows, mapper),
      pageRecords: materialiseRows<T>(pageRows, mapper),
      recordsCount,
      pageRecordsStart: compiled.pageRecordsStart,
      pageRecordsEnd,
      currentPage: compiled.currentPage,
      // `:L812-L813`.
      totalPages: Math.ceil(recordsCount / compiled.pageRecordsShow),
    };
  }
}
