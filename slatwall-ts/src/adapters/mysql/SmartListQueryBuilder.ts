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
 * page two. Where a query fans rows out, distinctness is what keeps that true, and it fails
 * NUMERICALLY — in the count and every paging figure derived from it — with no exception and no
 * type error. See {@link SMARTLIST_DISTINCT_ASYMMETRY} for how the two distinctness rules this file
 * carries differ, and why that difference is the legacy's rather than this file's.
 *
 * ⚠️ WHICH QUERIES ACTUALLY FAN — A CORRECTION WORTH CARRYING, BECAUSE IT IS EASY TO GET BACKWARDS.
 * An earlier revision of this paragraph said the fan came from `getProductSmartList`'s
 * "related-property joins". It does not. `model/service/ProductService.cfc:L347-L349` joins
 * `productType`, `defaultSku` and `brand`, and `model/entity/Product.cfc:L67-L69` declares all three
 * `many-to-one` — the PRODUCT row holds each foreign key, so each product matches at most one row on
 * the other side. Join DIRECTION fans, not NULL-tolerance: a LEFT join to a many-to-one target
 * multiplies nothing. The joins that fan are the collection ones, `kind: 'childForeignKey'` in
 * `ENTITY_JOIN_SPECIFICATIONS` below — and the two members in this slice that traverse them,
 * `findProductOptionGroups` and `findProductOptionsByOptionGroup` in `../../services/OptionService`,
 * are exactly the two that set the distinct flag, transcribed from `model/entity/Product.cfc:L255`
 * and `:L342`. So the legacy's flag placement is coherent, and this file reproduces it rather than
 * broadening it.
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
 * 360-second render budget, far beyond what a synchronous request-response gateway will generally allow
 * by default. NO FIGURE IS NAMED FOR THAT WINDOW, and that is the same position `../../ports/
 * SmartListQueryPort.ts` takes for this port and `../../handlers/googleFeedHandler.ts` takes as M2's
 * owner: synchronous integration limits vary by gateway type, region and configuration, and this
 * deliverable selects no gateway (AAP §0.2.2.5). That decision belongs to `src/handlers/**`. Nothing
 * here responds to it: no result cap, no streaming mode, no statement timeout and no page size of this
 * file's own invention (S9).
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

import type { Brand } from '../../domain/product/Brand';
import type { Option } from '../../domain/option/Option';
import type { OptionGroup } from '../../domain/option/OptionGroup';
import type { Product, ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type { ProductType } from '../../domain/product/ProductType';
import type { Sku } from '../../domain/sku/Sku';
import { ConfigurationError, DataIntegrityError, DomainError } from '../../errors/DomainError';
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../domain/BaseProductType';
import { resolveSmartListPropertyIdentifier } from '../../ports/SmartListQueryPort';
import { assertColumnName, assertTableName, toRowCountBinding } from './QueryRunner';
import {
  mapBrandRow,
  mapOptionGroupRow,
  mapOptionRow,
  mapProductRow,
  mapProductTypeRow,
  mapSkuRow,
  mapRows,
  markSkuOwnedLinkLoaded,
} from './rowMappers';

import type { PhysicalTableName, SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type {
  SmartListEntityName,
  SmartListFilter,
  SmartListFilterValue,
  SmartListJoin,
  SmartListJoinType,
  SmartListPagination,
  SmartListQuery,
  SmartListQueryPort,
  SmartListRange,
  SmartListRecord,
  SmartListResult,
  SmartListRootEntityName,
  SmartListWhereGroup,
} from '../../ports/SmartListQueryPort';

/* ================================================================================================
 * TRANSLATION DECISIONS — AAP 0.8.2 Guideline 6 requires that "all technology-specific translation
 * decisions" be documented "with clear comments, especially anywhere legacy behavior ... required an
 * explicit judgment call". AAP 0.8.2 additionally names THIS FOLDER as "the primary site of that
 * requirement". Each judgment is recorded here or at the declaration that makes it, always with a
 * locator.
 *
 * THIS FILE MINTS NO NEW DEFECT OR MISMATCH IDENTIFIER, and no global closure claim is made here:
 * the two registers are stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts`, and BOTH ARE FROZEN AT THE AAP's OWN BOUNDS — AAP
 * 0.6.7's D1-D21 and AAP 0.6.6's M1-M8. Nothing in this port mints an identifier beyond either
 * range; a further source observation is recorded by its `path:Lnnn` locator instead. It CITES the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132], M2, M6 and M7 and records
 * every other finding by `path:Lnnn` locator alone. It does not OWN any of them: the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132]'s home is
 * that same SKU port, and M7 is an AAP mismatch that binds every memoising site rather than
 * belonging to one. D18 is NOT this file's: the single
 * declared parameterization-hardening exception belongs exclusively to `MySqlProductRepository.ts`,
 * and parameterizing here is ordinary compliance rather than a declared exception to behaviour
 * preservation.
 *
 * ------------------------------------------------------------------------------------------------
 * TODO(parity) the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] — TWO TABLE VOCABULARIES, BOTH CORRECT
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
 * (AAP 0.7.3 standard 7), and it is the divergence `issue_1296` was raised against. Both rules are
 * reproduced as declared: {@link composeSelectClause} honours the flag, and
 * {@link composeCountSelectClause} does not consult it. `test/adapters/MySqlOptionRepository.test.ts`'s folded `SmartListQueryBuilder` block
 * executes both directions over genuinely repeated rows, so neither dropping the keyword nor
 * unconditionally adding it can pass.
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
type SmartListRowMappers = {
  readonly [TEntityName in SmartListRootEntityName]: (
    row: MySqlRow,
  ) => SmartListRecord<TEntityName>;
};

const ENTITY_ROW_MAPPERS: SmartListRowMappers = Object.freeze({
  SlatwallProduct: mapProductRow,
  SlatwallSku: mapSkuRow,
  SlatwallProductType: mapProductTypeRow,
  SlatwallBrand: mapBrandRow,
  SlatwallOption: mapOptionRow,
  SlatwallOptionGroup: mapOptionGroupRow,
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
   * Present so the logical-versus-physical name translation recorded in the file header is directly assertable: a caller supplies `SlatwallProduct` and
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
 *
 * ⚠️ THIS PREDICATE IS NON-SARGABLE BY CONSTRUCTION, AND THAT IS WHERE IT MUST STAY. A leading-wildcard
 * `LIKE` cannot use a B-tree index on the column, so every keyword search is a scan of whatever the rest
 * of the where clause leaves. Three responses were available and only one is legitimate here:
 *   1. CHANGE THE SUBSTRING SEMANTICS — drop the leading wildcard, or switch to a full-text match. That
 *      changes which records the legacy would have returned. Refused: `:L699` wraps both sides.
 *   2. ADD A SCHEMA-APPROVED SUBSTRING INDEX. There is nothing to add it to. The `Sw*` tables are
 *      created by the CFML engine's ORM from component metadata, so this repository contains no DDL
 *      artefact for the catalog at all, and authoring one would be inventing a schema (S9).
 *   3. LET THE CALLER BOUND THE READ, which is what happens. Pagination is part of the query
 *      description and bounds the page statement at `:L762`; the unpaged collection is now selected
 *      EXPLICITLY, by calling {@link SmartListQueryBuilder.executeRecords} rather than by getting one
 *      as a side effect of asking for a page. Nothing is silently truncated and no cap is invented —
 *      what changes is that an unbounded read is now something a caller asks for by name.
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
 * ORDERING — A PORT OF org/Hibachi/HibachiSmartList.cfc:L717-L744
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

/**
 * ⛔ THE PIPE GRAMMAR IS NOT PARSED HERE, AND AN EARLIER REVISION PARSED IT TWICE — F12.
 *
 * `org/Hibachi/HibachiSmartList.cfc:L473-L483` declares ONE `addOrder` grammar, and the port owns it
 * in ONE place: `parseOrderStatement` in `src/ports/SmartListQueryPort.ts`. That function reproduces
 * the legacy exactly — `:L474` takes the property from the first list element, `:L475` seeds the
 * direction `ASC`, `:L476` upgrades it to `DESC` only when the statement has more than one element AND
 * the last one is `D` or `DESC`, and `:L480`'s `if(len(aliasedProperty))` DROPS a term whose property
 * does not resolve. Its caller, `applyOrderByEntry`, drops an unparsed term rather than reporting it,
 * which is the same silence one layer up.
 *
 * AN EARLIER REVISION DECLARED A SECOND, STRICTER COPY HERE — `parseOrderDeclaration`, with
 * `ORDER_DIRECTION_DELIMITER`, `DESCENDING_ORDER_TOKENS` and `ASCENDING_ORDER_TOKENS` beside it. It
 * described itself as "A DECLARED DIVERGENCE" and refused three inputs the legacy ACCEPTS:
 *
 *   1. A BARE PROPERTY. `addOrder("sortOrder")` is legal at `:L474` and yields ASC. The copy required
 *      a pipe and refused a statement without one.
 *   2. AN UNRECOGNISED DIRECTION. `addOrder("sortOrder|SIDEWAYS")` yields ASC at `:L475-L478`, because
 *      `listFindNoCase("D,DESC", ...)` simply does not match and the seeded value stands. The copy
 *      refused it — and refused every spelling outside its own `A,ASC,D,DESC` whitelist, which the
 *      legacy does not have at all: the legacy tests for DESCENDING only, and everything else is ASC.
 *   3. AN UNRESOLVABLE PROPERTY. `:L480` drops that one term and composes the rest of the query. The
 *      copy refused the whole query.
 *
 * ⭐ ITS STATED REASON FOR EXISTING WAS NOT TRUE OF THE DELIVERED SUBTREE. It argued the grammar "has
 * to be expressible from here" because two consumers write it as a LITERAL — `model/entity/Product.cfc:L257`
 * and `:L345`, both `addOrder("sortOrder|ASC")`. Both are served by `src/services/OptionService.ts`,
 * and it composes the order STRUCTURALLY, as `{ propertyIdentifier: SORT_ORDER_PROPERTY, direction:
 * 'ASC' }`, so it never needed a parser. `parseOrderDeclaration` had NO CALLER anywhere in `src/**`
 * or `test/**`: it was a divergence that never even ran.
 *
 * ⚠️ AND ITS SELF-JUSTIFICATION WAS A JUDGMENT ABOUT AUTHOR INTENT, NOT A PARITY TEST. It reasoned
 * that a typo in a source literal "is a programming mistake, and the legacy's silence is precisely
 * what makes such a mistake permanent". That may well be true, and it is still not a reason: refusing
 * a statement the legacy composed is a DIFFERENT OUTCOME. D18 (AAP 0.6.7.7) is the SOLE declared
 * behaviour-hardening exception, and it is a precedent only for a divergence that removes a flaw class
 * WITHOUT changing an outcome — parameterised SQL returns exactly the rows interpolated SQL returned,
 * whereas a refusal returns nothing. AAP 0.8.2 Guideline 4 forbids enhancement beyond what the
 * migration requires, and AAP 0.6.7 governs with "preserve and annotate, do not repair".
 *
 * ⚠️ THE RESIDUAL EXPOSURE IS FLAGGED, NOT CLOSED (AAP 0.7.3 S8). A mistyped direction in a
 * developer-authored order literal still sorts ascending silently — in the port exactly as in the
 * legacy — and nothing reports it.
 *
 * ⭐ WHAT DOES STILL PREVENT IT IS THE TYPE SYSTEM RATHER THAN A RUNTIME REFUSAL, WHICH IS PRECISELY
 * WHY THAT GUARANTEE MAY STAND WHERE THE REFUSAL MAY NOT. `SmartListOrder.direction` is the closed
 * union `'ASC' | 'DESC'` and `propertyIdentifier` is a resolved `SmartListPropertyIdentifier`, both
 * declared in `src/ports/SmartListQueryPort.ts`, so a literal written in source cannot spell either one
 * wrongly and still compile. A compile-time guarantee has no runtime behaviour, so it diverges from
 * nothing; the raise had runtime behaviour, and diverged.
 *
 * ⛔ DO NOT REINTRODUCE A LOCAL COPY. The `parseRangeValue` note in `src/ports/SmartListQueryPort.ts`
 * records what happened the last time this grammar family was copied: the two copies drifted in two
 * observable ways before anyone noticed. Acceptance and emission are a single legacy behaviour and
 * belong in a single place.
 */

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
 *
 * ⭐ AND `*` IS WHAT DELIVERS THE FOREIGN-KEY COLUMNS, WHICH IS A SECOND REASON NOT TO ENUMERATE.
 * `src/adapters/mysql/rowMappers.ts`'s RULE 3a reads four of them — `SwSku.productID` and
 * `SwProduct.brandID`, `productTypeID` and `defaultSkuID` — and turns each into an identifier-only
 * association reference, which is the ONLY route by which a smart-list record can name its related
 * rows: {@link SmartListQueryBuilder.execute} hands each row to a mapper and then discards it, so a
 * column this projection omits is unrecoverable downstream. An enumerated column list would therefore
 * have to be kept in step with those four names as well as with every scalar, and the Google product
 * feed — whose sixteen fields traverse all four — would fail silently the first time it fell behind.
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
 * ⭐ THIS IS WHERE the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] BECOMES VISIBLE. The legacy emits the LOGICAL entity name, because HQL names
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
 * ⭐ MIN-01 — THERE IS NO TYPE ASSERTION ON THIS PATH, AND THERE IS NOTHING LEFT FOR ONE TO DO.
 * This function used to end in `mapRows(rows, mapper) as T[]`, and given the shape it was written
 * against the assertion really was unavoidable: `SmartListQueryPort.execute<T>` let the CALLER nominate
 * an element type, {@link ENTITY_ROW_MAPPERS} was typed `(row: MySqlRow) => unknown`, and nothing
 * related the two because the relation lived at the call site. Both halves are now stated in types.
 * `SmartListEntityRecordTypes` pairs each root entity with its record type, the port derives its
 * element type from `query.entityName` through {@link SmartListRecord}, and
 * {@link SmartListRowMappers} ties each mapper's return type to its key — so `mapRows` infers the
 * element type and every step from row to record is checked.
 *
 * ⚠️ THE JUSTIFICATION THAT STOOD HERE WAS ALSO FACTUALLY WRONG, WHICH IS WHY IT IS RECORDED RATHER
 * THAN QUIETLY REPLACED. It argued that fixing the element type would force the port to "name domain
 * types and would then depend on the layer beneath it". `src/ports/SmartListQueryPort.ts` already names
 * all six — it imports every `*PropertyName` union from `../domain/**` because a filter's property
 * identifier is only meaningful against the entity that declares it — and it answers the point in its
 * own words: in a ports-and-adapters arrangement the domain is what the ports are expressed IN, not a
 * layer beneath them. So the assertion was not buying the independence it claimed to protect.
 *
 * THE RESULT IS MUTABLE, AND IT IS THE ONLY ARRAY THIS HYDRATION ALLOCATES. `mapRows` produces one
 * array and that array IS the answer — nothing copies it afterwards, here or in either caller below.
 * The mutability is `mapRows`'s own documented contract, kept because model/entity/Option.cfc:L95,
 * :L102 and :L104 mutate an option collection in place; `SmartListResult`'s own members are declared
 * `readonly`, and a mutable array is assignable to them, so exposing the width here costs the result
 * shape nothing while letting `executeRecords` hand its caller a collection with no defensive copy.
 */
function materialiseRows<TEntityName extends SmartListRootEntityName>(
  rows: readonly MySqlRow[],
  mapper: (row: MySqlRow) => SmartListRecord<TEntityName>,
  entityName?: TEntityName,
  identityMap?: Map<string, SmartListRecord<TEntityName>>,
  /* MUTABLE, as the note above states: both branches allocate a fresh array and nothing copies it
   * afterwards. `SmartListResult`'s members are `readonly`, which a mutable array satisfies, so this
   * width costs the result shape nothing and lets `executeRecords` answer without a defensive copy. */
): SmartListRecord<TEntityName>[] {
  if (entityName === undefined || identityMap === undefined) {
    return mapRows(rows, mapper);
  }

  // The identifier column is read from the ROW rather than from the mapped entity, because the entity
  // is what is being decided and because the primary key is the one column every mapper is guaranteed
  // to have been given (RULE 3 omits foreign keys, never the primary key).
  const primaryKey = ENTITY_PRIMARY_KEY[entityName];
  const materialised: SmartListRecord<TEntityName>[] = [];
  for (const row of rows) {
    const key = row[primaryKey];
    if (typeof key !== 'string' || key === '') {
      // No usable identifier means nothing can be shared, so the row is mapped on its own rather than
      // being silently collapsed onto some other row's instance. The mapper is applied DIRECTLY here
      // rather than through `mapRows([row], mapper)[0]`: `mapRows` is that same call in a loop, so for
      // one row the two are identical, while indexing a one-element array yields a possibly-undefined
      // element under `noUncheckedIndexedAccess` that only an assertion could remove.
      materialised.push(mapper(row));
      continue;
    }
    const existing = identityMap.get(key);
    if (existing !== undefined) {
      materialised.push(existing);
      continue;
    }
    // ⚠️ MAPPED EXACTLY ONCE. `manageEntity` installs a FRESH error bag each time it runs, so mapping a
    // row twice would discard anything already accumulated on the first instance.
    const mapped = mapper(row);
    identityMap.set(key, mapped);
    materialised.push(mapped);
  }
  return materialised;
}

/**
 * The two things every execution member needs before it can run anything: the compiled statements and
 * the mapper their rows hydrate through.
 *
 * Extracted so {@link SmartListQueryBuilder.execute} and {@link SmartListQueryBuilder.executeRecords}
 * cannot drift. Both must compose the SAME statement from the same description — the same joins, the
 * same filters, the same `DISTINCT`, the same ordering — and the surest way to guarantee that is for
 * there to be one code path that composes it.
 */
interface PreparedSmartList<TEntityName extends SmartListRootEntityName> {
  readonly compiled: CompiledSmartListQuery;
  readonly mapper: (row: MySqlRow) => SmartListRecord<TEntityName>;
}

/**
 * Decides whether the page statement can be skipped because it provably cannot return anything other
 * than the unpaged collection already in hand.
 *
 * ⚠️ THIS IS AN IDENTITY, NOT AN APPROXIMATION, AND THE PROOF IS SHORT. The two statements are the
 * same text — `:L748-L750` for the records, and that same text plus `LIMIT ? OFFSET ?` for the page
 * (`:L762`) — bound with the same where-clause values in the same order. So the page is, by
 * construction, the ordered record set with `offset` rows dropped from the front and at most `limit`
 * rows kept. When the offset is zero and the limit is at least as large as the number of records that
 * came back, nothing is dropped and nothing is truncated: the two collections are element-for-element
 * equal. Reusing the hydrated records is then the same answer, reached without a second scan, a second
 * transfer and a second hydration of rows that overlap completely.
 *
 * WHAT IS NOT CHANGED. {@link SmartListQueryBuilder.build} still compiles the bounded page statement
 * and its parameter array in full, unchanged and inspectable — the bound is preserved, it is merely
 * not ISSUED when issuing it cannot change the outcome. The paging figures are unaffected because
 * `:L792-L813` derives every one of them from the resolved pagination and the counted total rather
 * than from the page rows.
 *
 * ONE HONEST CONSEQUENCE, RECORDED RATHER THAN GLOSSED. Because the legacy issues two statements at
 * two moments, a concurrent commit landing between them could make its unpaged collection and its
 * first page disagree; taking the identity means this port cannot observe that divergence. The
 * difference is strictly one of consistency within a single read, no legacy behaviour depends on the
 * divergence, and where the port does run both statements it still runs them exactly as before.
 * `test/support/inMemoryRepositories.ts` already models the two views as the same array in
 * `buildSmartListResult`, so the aliasing this produces is a shape the suite is written against.
 *
 * @param compiled - The compiled query, for its resolved page bounds.
 * @param recordCount - How many rows the unpaged statement actually returned.
 */
function pageWindowCoversEveryRecord(
  compiled: CompiledSmartListQuery,
  recordCount: number,
): boolean {
  // `:L762` binds `pageRecordsStart - 1` as the offset, so a start of one is an offset of zero.
  return compiled.pageRecordsStart === 1 && recordCount <= compiled.pageRecordsShow;
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
 * sort order applied says so, exactly as `model/entity/Product.cfc:L345` does — by placing a typed
 * `SmartListOrder` in `SmartListQuery.orders`, which is what `src/services/OptionService.ts` does for
 * both of that entity's ordered collections. Distinctness is likewise left at the seeded FALSE of
 * `:L59`.
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
 * THE RESOURCE BOUND — SEC-12
 * ============================================================================================== */

/**
 * The resource bound on smart-list materialisation — SEC-12 (CWE-400, uncontrolled resource
 * consumption).
 *
 * =============================================================================================
 * WHAT WAS UNBOUNDED, PRECISELY
 * =============================================================================================
 * Three facts about the legacy compose into the finding, and none of them is a supposition:
 *   1. `getHQL()` at [org/Hibachi/HibachiSmartList.cfc:L748-L750] emits select, from, where and
 *      order and NO BOUND OF ANY KIND — which is why {@link CompiledSmartListQuery.records} carries
 *      none either, and why the comment at its construction says so.
 *   2. `getRecords()` at [:L751] materialises that entire unpaged collection, and this port's
 *      `SmartListResult` hands it back on EVERY call because `src/ports/SmartListQueryPort.ts`
 *      declares `records` as a materialised array — the shape `product.cfm:L16` reads.
 *   3. The page figure is not a bound either. `P:Show=ALL` resolves to 1,000,000,000 in
 *      `src/ports/SmartListQueryPort.ts`, so `LIMIT ? OFFSET ?` can be asked for a billion rows.
 *
 * Together, one request could ask this adapter to read and hydrate the entire catalog twice. That is
 * reachable ANONYMOUSLY: the Google merchant feed is the one publicly published surface in this
 * slice, `integrationServices/google/controllers/feed.cfc:L49-L74` composes its selection with no
 * paging at all, and `src/handlers/googleFeedHandler.ts` consumes `records` rather than
 * `pageRecords` because reading the page there would truncate the feed.
 *
 * =============================================================================================
 * WHY THE NUMBER IS INJECTED AND NOT WRITTEN DOWN HERE
 * =============================================================================================
 * AAP §0.7.3 S9 forbids inventing numbers the source does not state and IR-12 forbids introducing
 * service levels; the legacy states no maximum anywhere, and AAP §0.6.6 confirms the only numeric
 * runtime constants in the codebase are request-scoped safeguards. A literal in this file would
 * therefore be fabrication. It is instead an INJECTED constructor collaborator with NO DEFAULT: the
 * composition root states the number, or states none and gets the legacy's unbounded materialisation.
 *
 * ⚠️ OPTIONAL, NOT REQUIRED — AND AN EARLIER REVISION OF THIS VERY PARAGRAPH SAID OTHERWISE. It read
 * "a REQUIRED constructor collaborator … exactly as `../../services/SkuService`'s
 * `SkuCombinationBudget` is (SEC-11)", which contradicted the constructor two hundred lines below it on
 * both counts: the parameter is optional, and the sibling budget it appealed to is withdrawn. Both
 * changes have the same cause, recorded at {@link SmartListQueryBuilder} — a REQUIRED finite budget
 * converts work the legacy performs into a bounded FAILURE, which AAP §0.6.7.7 permits for D18 alone
 * and §0.8.2 guideline 4 forbids as enhancement beyond the migration's need. The constructor's note is
 * the authoritative statement of the trade; this one is corrected to agree with it rather than left to
 * be discovered as a contradiction.
 *
 * =============================================================================================
 * REFUSE, NEVER TRUNCATE — AND THE GATE RUNS BEFORE ANY ROW IS READ
 * =============================================================================================
 * A ceiling implemented as `LIMIT budget` would be silent truncation, and truncation is expressly
 * NOT acceptable here: feed ORDER and feed MEMBERSHIP are observable behaviour (AAP §0.4.1.10
 * requires every field mapping preserved, and `src/integrations/google/ProductFeedBuilder.ts`
 * reproduces the legacy `cfloop` without re-sorting or filtering), so a quietly shortened feed would
 * publish a catalog that does not exist while reporting success. The bound is therefore enforced by
 * REFUSING an over-budget query, and it is evaluated from the COUNTING statement BEFORE any row
 * statement runs, so an over-budget request materialises nothing at all rather than half of something.
 *
 * ⚠️ ON BOTH EXECUTION MEMBERS, WHICH IS A CORRECTION. The gate first guarded
 * {@link SmartListQueryBuilder.execute} only, leaving {@link SmartListQueryBuilder.executeRecords} —
 * the member the feed reads through, and the one whose statement carries no `LIMIT` at all — entirely
 * unbounded. The bound guarded the smaller materialisation and left the larger one open. Both members
 * now count, gate and re-check through the same two private members, and the counting statement stays
 * CONDITIONAL on a budget being wired so an unbudgeted records-only read still issues exactly one
 * statement (see {@link SmartListQueryBuilder.gateRecordsOnlyRead}).
 *
 * ⛔ WHAT THIS DELIBERATELY DOES NOT DO, FLAGGED RATHER THAN SILENTLY RESOLVED
 * ---------------------------------------------------------------------------
 * The finding's suggested resolution also proposes bounded STREAMING, ASYNCHRONOUS generation or a
 * CACHED ARTEFACT for the feed, and a per-page read that does not materialise the unpaged collection
 * at all. Neither is implemented here, and both are recorded rather than quietly dropped:
 *
 *   • THE DELIVERY MODEL IS AN OPEN DECISION THE AAP RESERVES. AAP §0.6.6 M2 states the mismatch with
 *     the one number the SOURCE declares — `integrationServices/google/views/feed/product.cfm:L9`
 *     requests a 360-second render budget, which fits inside Lambda's published 15-minute maximum
 *     function timeout but far exceeds what a synchronous request-response integration in front of it
 *     will generally allow — and leaves "the choice between an asynchronous or streamed delivery
 *     model … as an explicit decision". No figure is named for that second ceiling here, because
 *     `../../handlers/googleFeedHandler.ts`, which owns M2, records that there is not one to name:
 *     synchronous integration limits vary by gateway type, region and configuration, some are
 *     themselves configurable, and no gateway is selected by this deliverable. AAP §0.8.3.6 and §0.8.2
 *     guideline 4 require that such a mismatch be FLAGGED, not silently resolved. Queues, caches and
 *     object storage are additionally unreachable: infrastructure as code is out of scope (AAP
 *     §0.2.2.5) and the dependency set is frozen at ONE runtime package with no AWS SDK (AAP §0.5.2.1).
 *   • A PER-PAGE READ IS A PORT-CONTRACT CHANGE, NOT AN ADAPTER CHANGE. Skipping the unpaged
 *     statement for a caller that only reads `pageRecords` requires `SmartListResult.records` to
 *     become deferred or asynchronous, which is a change to `src/ports/SmartListQueryPort.ts` and to
 *     every consumer of it — `../../services/ProductService`, `../../services/OptionService`,
 *     `../../services/SkuService`, `../../handlers/skuHandler`,
 *     `../../integrations/google/ProductFeedQuery` and the in-memory test doubles. The port declared
 *     the materialised shape deliberately, and re-opening it is a design decision that belongs with
 *     the delivery-model decision above rather than inside this fix. Until it is taken, the bound
 *     here is what makes the work FINITE, which is the security objective; the per-page efficiency
 *     is not a security property.
 */
export interface SmartListMaterialisationBudget {
  /**
   * Answers the largest number of records one smart-list query may materialise.
   *
   * ⭐ ONE FIGURE BOUNDS EVERY MATERIALISING PATH — BOTH EXECUTION MEMBERS AND ALL THREE STATEMENTS.
   * The unpaged collection is bounded because the query is refused when the count exceeds it; the page
   * statement is bounded as a consequence, since `LIMIT` can never return more rows than exist, so a
   * `P:Show=ALL` page of 1,000,000,000 collapses to at most this many rows without any change to paging
   * semantics for an in-budget query; and {@link SmartListQueryBuilder.executeRecords} — the
   * records-only member the anonymous public feed actually reads through — applies the same gate from
   * the same counting statement.
   *
   * ⛔ THIS USED TO SAY "BOTH ROW STATEMENTS", WHICH WAS TRUE OF `execute` AND SILENT ABOUT THE OTHER
   * MEMBER. Review finding F4 (CWE-400) established that the silence was a real bypass rather than a
   * documentation gap: `executeRecords` issued the same unbounded statement and hydrated its result
   * with no count, no gate and no re-check. The gate now covers it.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   *   `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY`
   */
  readonly resolveMaximumRecordsPerQuery: () => number;

  /**
   * Answers the largest number of QUERY-COMPLEXITY units one compiled statement may carry — review
   * finding SEC-DOS-02's second half.
   *
   * ⭐⭐ WHAT A "UNIT" IS, AND WHY ONE FIGURE COVERS FOUR OF THE FINDING'S FIVE CLAUSES. The unit is
   * one bound parameter plus one `ORDER BY` term plus one registered join, summed over the compiled
   * records statement. Every caller-controlled expansion the finding names contributes at least one:
   *   • KEYWORDS. Each keyword crosses each keyword property, and each crossing binds one wildcard
   *     parameter, so `keywords × keywordProperties` units.
   *   • FILTER LISTS (`FI:`, `FIR:`). Each element of an `IN` list binds its own placeholder —
   *     `../../adapters/mysql/SmartListQueryBuilder.ts` generates one `?` per element rather than
   *     interpolating, per AAP §0.4.3.4 R4 — so an N-element list is N units.
   *   • `OrderBy` CARDINALITY. Ordering terms bind no parameters, so they are counted directly.
   *   • JOINS. A related-property filter or ordering auto-joins, and each join widens the statement.
   *
   * ⭐ AND STATEMENT SIZE IS BOUNDED BY THIS SAME FIGURE, WITHOUT A SECOND ONE — WHICH IS AN ARGUMENT
   * RATHER THAN AN ASSUMPTION. No caller-supplied VALUE ever reaches the emitted text: every one is
   * bound through a `?` placeholder (AAP §0.4.3.4 R4, and the D18 parameterisation of §0.6.7.7), and
   * every identifier is resolved from the closed property vocabulary of a registered entity rather than
   * from the request. So the only way a caller can lengthen the statement is by adding predicate terms,
   * ordering terms or joins — exactly the three things this figure counts. A megabyte-long `keyword`
   * value adds ONE unit and ZERO characters of SQL, and a test pins that.
   *
   * ⛔ IT IS NOT A ROW BOUND AND DOES NOT SUBSTITUTE FOR ONE. This figure bounds the work of COMPILING
   * and PLANNING a statement; {@link SmartListMaterialisationBudget.resolveMaximumRecordsPerQuery}
   * bounds the work of materialising its result. A query with one predicate can match every row in the
   * catalog, and a query with a thousand predicates can match none.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   *   `CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY`
   */
  readonly resolveMaximumPredicatesPerQuery: () => number;
}

/**
 * Builds the fail-closed materialisation-and-complexity budget from whatever figures a deployment stated.
 *
 * ⭐⭐ THIS IS THE SHAPE CHANGE REVIEW FINDING SEC-DOS-02 REQUIRED, AND IT IS WORTH NAMING PRECISELY.
 * The budget used to be a plain `{ maximumRecordsPerQuery: number }` supplied OPTIONALLY, so an
 * authenticated smart-list route ran with no bound at all unless an operator had stated one — the
 * finding's exact words were "Authenticated SmartList requests may run with no materialization budget".
 * Only the anonymous feed refused, through {@link createAnonymousMaterialisationGate}. Two things changed:
 * the collaborator is now REQUIRED on {@link SmartListQueryBuilder}, so no construction site can omit it;
 * and each figure is RESOLVED at the moment it is applied, so an unstated figure is a named
 * `ConfigurationError` from whichever route needed it rather than a router that will not load.
 *
 * ⭐ NO FIGURE IS INVENTED BY EITHER RESOLVER (AAP §0.7.3 S9, IR-12). Given `undefined` a resolver
 * RAISES, reporting the variable to set. Given a figure it validates it once and answers it.
 *
 * ⚠️ VALIDATION HAPPENS HERE, WHEN THE BUDGET IS BUILT, not when a figure is first applied, because a
 * wiring error should present as a wiring error. Zero, a negative, a fraction, `NaN` and `Infinity`
 * would each refuse every query rather than bounding it; zero is the dangerous one to admit silently.
 * `../../config/env.ts` already refuses all five at load for the environment path, and this covers a
 * composition root supplying figures directly.
 *
 * @param maximumRecordsPerQuery the row ceiling this deployment stated, or `undefined` for none
 * @param maximumPredicatesPerQuery the complexity ceiling this deployment stated, or `undefined`
 * @returns the budget to hand {@link SmartListQueryBuilder}
 */
export function createSmartListMaterialisationBudget(
  maximumRecordsPerQuery: number | undefined,
  maximumPredicatesPerQuery: number | undefined,
): SmartListMaterialisationBudget {
  const requirePositiveSafeInteger = (value: number | undefined, member: string): void => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new DomainError(
        `The smart-list ${member} must be a positive safe integer, so the configured value cannot ` +
          `bound a query.`,
        { context: { member, value } },
      );
    }
  };

  requirePositiveSafeInteger(maximumRecordsPerQuery, 'materialisation budget');
  requirePositiveSafeInteger(maximumPredicatesPerQuery, 'complexity budget');

  const resolve = (value: number | undefined, variable: string, refusal: string): number => {
    if (value !== undefined) {
      return value;
    }

    throw new ConfigurationError(
      `${refusal} Set ${variable}, or supply resourceBounds when composing the container.`,
      {
        context: { locator: 'org/Hibachi/HibachiSmartList.cfc:L751-L778', variable },
      },
    );
  };

  return Object.freeze({
    resolveMaximumRecordsPerQuery: (): number =>
      resolve(
        maximumRecordsPerQuery,
        'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY to the largest number of records this deployment ' +
          'permits one smart-list query to hydrate',
        'A smart-list query refuses to materialise an unbounded selection.',
      ),
    resolveMaximumPredicatesPerQuery: (): number =>
      resolve(
        maximumPredicatesPerQuery,
        'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY to the largest number of predicate, ordering ' +
          'and join units this deployment permits one smart-list statement to carry',
        'A smart-list query refuses to compile a statement of unbounded complexity.',
      ),
  });
}

/**
 * A check an ANONYMOUS caller runs before it materialises anything — review finding SEC-1 (CWE-400).
 *
 * Returns when this deployment has stated a materialisation bound and raises when it has not. It carries no
 * figure of its own, so it can only ever report the absence of one.
 */
export type AnonymousMaterialisationGate = () => void;

/**
 * Builds the gate that refuses an unbounded ANONYMOUS materialisation — review finding SEC-1 (CWE-400).
 *
 * ⭐ WHY IT LIVES HERE, BESIDE {@link SmartListMaterialisationBudget}, AND NOT IN THE COMPOSITION ROOT. Two
 * reasons, and the second is the load-bearing one:
 *   1. This module OWNS the bound. The gate answers one question — "did anybody state the figure this builder
 *      applies?" — and keeping the question with the figure means a rename or a re-scoping of the budget
 *      cannot leave a stale copy of the question somewhere else.
 *   2. `../../handlers/googleFeedHandler.ts` resolves the composition root LAZILY, through a
 *      `typeof import(...)` type position that is erased at emit, precisely so that importing the handler
 *      does not read `process.env`. A factory exported from `../../config/container.ts` would have to be
 *      imported as a VALUE, which reinstates that load-time edge and makes the handler's own test suite
 *      unloadable without a full database configuration. A first attempt did exactly that and the suite
 *      failed to start; the failure is recorded here because the constraint is invisible from the type alone.
 *
 * ⭐ AND IT NAMES NO FIGURE, WHICH IS WHAT KEEPS IT INSIDE AAP §0.7.3 S9 AND IR-12. It does not choose a
 * ceiling, suggest one, or fall back to one. It requires that the OPERATOR have chosen one, and reports the
 * variable to set when they have not — so the refusal is the consequence of an absent decision rather than a
 * substitute for it.
 *
 * ⚠️ IT IS STILL THE EARLIEST REFUSAL, THOUGH IT IS NO LONGER THE ONLY ONE. When this gate was written it
 * WAS the only bound in the service, and its own note said so: "an authenticated route stays
 * unbounded-by-default at legacy parity and only this one declines to serve." Review finding SEC-DOS-02
 * ended that asymmetry — {@link SmartListMaterialisationBudget} is now REQUIRED on the builder, so every
 * route refuses when a figure is unstated. What this gate adds is EARLINESS: it runs before a query is
 * composed and before any port is called, so `google:feed.product` — the one action reachable with no
 * principal, per `integrationServices/google/controllers/feed.cfc:L54-L56` — answers an anonymous caller
 * without doing any work at all.
 *
 * ⭐ AND IT DEMANDS ALL FOUR FIGURES THE FEED PATH APPLIES, WHICH IS A CHANGE. It demanded the
 * materialisation bound alone, on the ground that "the SKU combination bound and the URL-title probe bound
 * guard WRITE paths no anonymous caller can reach" — which remains true, and neither is demanded here. What
 * SEC-DOS-02 added are two bounds the feed path itself applies, on per-record image expansion and on
 * document bytes, plus the complexity bound this builder applies when it compiles. Omitting them from the
 * gate would leave the anonymous route passing an early check and then failing later, after it had already
 * composed a query and resolved image paths.
 *
 * @param bounds the four figures the anonymous feed path applies, each stated or `undefined`
 * @returns a gate that returns when every figure was stated and raises a `ConfigurationError` naming the
 *   FIRST that was not
 */
export function createAnonymousMaterialisationGate(bounds: {
  readonly maximumRecordsPerQuery: number | undefined;
  readonly maximumPredicatesPerQuery: number | undefined;
  readonly maximumImagesPerRecord: number | undefined;
  readonly maximumResponseBytes: number | undefined;
}): AnonymousMaterialisationGate {
  /* The order is the order the figures are APPLIED in, so the variable an operator is told to set first is
   * the one the route would have needed first. */
  const required: readonly (readonly [number | undefined, string, string])[] = Object.freeze([
    [
      bounds.maximumRecordsPerQuery,
      'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
      'materialise an unbounded selection',
    ],
    [
      bounds.maximumPredicatesPerQuery,
      'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
      'compile a statement of unbounded complexity',
    ],
    [
      bounds.maximumImagesPerRecord,
      'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
      'expand a record by an unbounded number of images',
    ],
    [
      bounds.maximumResponseBytes,
      'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
      'buffer a document of unbounded size',
    ],
  ]);

  return () => {
    for (const [value, variable, refusal] of required) {
      if (value === undefined) {
        throw new ConfigurationError(
          `An anonymous route refuses to ${refusal}. Set ${variable}, or supply resourceBounds when ` +
            `composing the container.`,
          {
            context: {
              locator: 'integrationServices/google/controllers/feed.cfc:L54-L56',
              variable,
            },
          },
        );
      }
    }
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
   *
   * @param aggregateLoaders - Resolves the many-to-one associations each root's consumers require, keyed
   * by root entity. REQUIRED, with no default, and the requirement is the point.
   *
   * ⚠️ WHY THIS IS A CONSTRUCTOR PARAMETER RATHER THAN A MODULE CONSTANT. Findings INT-02 and DATA-02
   * were both the same fault: this builder projects `<baseAlias>.*`, so a hydrated record carried its
   * scalar columns and NONE of its associations — `rowMappers.ts` RULE 3 leaves every many-to-one
   * genuinely absent by design. A SKU smart list therefore produced SKUs with no `product`, and the
   * Google feed's `requireProduct` raised on every item; an option smart list produced options with no
   * `optionGroup`, and `SkuService.createSkus` raised on every merchandise product carrying options.
   *
   * The fix belongs here rather than in the mappers because RULE 3 names this layer as the place the
   * decision lives, and it is INJECTED rather than imported because resolving `Product.defaultSku` needs
   * a delegate binder that only the composition root can assemble. Making it required means the
   * compiler, not a comment, enforces that every construction site supplies it.
   * @param materialisationBudget - The row and complexity ceilings of review finding SEC-DOS-02; see
   * {@link SmartListMaterialisationBudget} and {@link createSmartListMaterialisationBudget}.
   *
   * ⭐⭐ REQUIRED, WITH NO DEFAULT, AND THIS PARAMETER HAS NOW BEEN BOTH. The history matters because a
   * reader will otherwise read the current shape as an oversight in one direction or the other:
   *   1. It arrived REQUIRED, as a bare figure.
   *   2. It was made OPTIONAL, on the reasoning that "a REQUIRED finite budget converts work the legacy
   *      performs into a bounded FAILURE, which AAP §0.6.7.7 permits for D18 alone".
   *   3. ⭐ It is REQUIRED again, carrying RESOLVERS rather than figures. This is the current shape.
   *
   * ⛔ WHY STEP 2's REASONING DOES NOT SURVIVE. Review finding SEC-DOS-02 measured what the optional
   * shape actually produced: "Authenticated SmartList requests may run with no materialization budget."
   * That is not a parity default, it is an unbounded materialisation reachable by any authenticated
   * caller, and the anonymous gate below covered exactly one of the thirty-four routes. §0.6.7 is the
   * DEFECT AND TODO CARRY-OVER REGISTER — its twenty-one entries are legacy BUSINESS-LOGIC defects and
   * D18 is the one the port repairs — so it does not license shipping an exhaustible read path. With no
   * user Rules (§0.7.1) the plan binds this port to §0.7.3's enterprise standards, and S8's "flag rather
   * than assume away" is discharged by these notes recording that the LEGACY is unbounded.
   *
   * ⭐ AND REQUIRED NO LONGER MEANS A FABRICATED FIGURE, WHICH IS WHAT STEP 2 WAS RIGHT TO FEAR. The
   * collaborator carries two RESOLVERS. A deployment that stated nothing is not given a default: the
   * resolver raises `ConfigurationError` naming the variable, from the route that needed it. So the
   * required parameter obliges a composition root to supply the SEAM, never the NUMBER.
   *
   * ⚠️ THE PARITY COST, NAMED. A deployment that states no figures now has every smart-list route
   * refuse rather than run unbounded, and every route in this service reads through this builder. That is
   * the fail-closed direction the finding asks for, it names the variable to set in the refusal, and
   * `../../../README.md` §8 and `../../../.env.example` both state it as a deployment requirement rather
   * than leaving an operator to discover it from a 500.
   */
  public constructor(
    private readonly executor: SqlExecutor,
    private readonly aggregateLoaders: Readonly<
      Record<SmartListEntityName, CatalogAggregateLoader | undefined>
    >,
    private readonly materialisationBudget: SmartListMaterialisationBudget,
  ) {}

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

    /* `getHQL()` at `:L748-L750` — select, from, where, order. The emitted TEXT carries no row bound, and
     * that is still deliberate: it stays byte-parallel to the legacy statement, and appending
     * `LIMIT budget` here would be the silent truncation {@link SmartListMaterialisationBudget} rules
     * out. The ROW bound is enforced in {@link SmartListQueryBuilder.execute} and
     * {@link SmartListQueryBuilder.executeRecords}, which count first and REFUSE. */
    const recordsSql = `${composeSelectClause(plan, selectDistinct)}${from}${where.sql}${order}`;

    /* ⭐⭐ THE COMPLEXITY BOUND — REVIEW FINDING SEC-DOS-02's SECOND HALF (CWE-400).
     *
     * ⛔ THIS FUNCTION USED TO SAY IT WAS "NOT WHERE A RESOURCE DECISION CAN BE TAKEN", and that was the
     * gap. The finding measured it: "Very large `keywords`, FI lists or repeated valid `OrderBy`
     * statements expand SQL before the row-count gate." The row gate cannot see any of that, because it
     * runs on the RESULT of a statement this step has already composed — a thousand-term `IN` list is
     * expensive to plan and execute even when it matches nothing.
     *
     * ⚠️ IT IS STILL A PURE STEP: nothing is read, nothing is executed, and nothing is truncated. The
     * only thing added is a REFUSAL, taken after composition and before any caller can run the statement,
     * which is the earliest point at which the complexity is actually known.
     *
     * The unit and the argument that it also bounds statement SIZE are set out on
     * {@link SmartListMaterialisationBudget.resolveMaximumPredicatesPerQuery}.
     *
     * ⚠️ `plan.joinOrder` COUNTS THE BASE ENTITY AS ONE UNIT, and that is deliberate rather than an
     * off-by-one. It is the list of SOURCES the statement names: the base is registered into it at the top
     * of this method, and each entry contributes one `FROM` or `LEFT JOIN` term plus a table alias to every
     * one of the three emitted statements. So a query over one entity with no relations carries a floor of
     * one unit, and the smallest ceiling that admits any query at all is therefore 1. The context field
     * below is named `sources` rather than `joins` for that reason — a reader diagnosing a refusal needs
     * the number that actually went into the sum. */
    const complexityUnits =
      where.params.length + (query.orders ?? []).length + plan.joinOrder.length;
    const maximumPredicatesPerQuery = this.materialisationBudget.resolveMaximumPredicatesPerQuery();

    if (complexityUnits > maximumPredicatesPerQuery) {
      throw new DomainError(
        'A smart-list query composed more predicate, ordering and join units than the configured ' +
          'complexity budget admits, so it was refused before it could be executed rather than ' +
          'planned as an arbitrarily wide statement.',
        {
          context: {
            entityName: query.entityName,
            complexityUnits,
            maximumPredicatesPerQuery,
            boundParameters: where.params.length,
            orderingTerms: (query.orders ?? []).length,
            sources: plan.joinOrder.length,
          },
        },
      );
    }

    /* `:L762` — the legacy's own offset and maximum-results pair, and the only bound in the emitted
     * TEXT. It is not a resource control: the page figure can legitimately be `P:Show=ALL`, which
     * `src/ports/SmartListQueryPort.ts` resolves to 1,000,000,000. SEC-12 caps what that can actually
     * return, because a page cannot be wider than the record set the gate already admitted. */
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
        /*
         * ⚠️ THE TWO PAGING FIGURES ARE BOUND THROUGH {@link toRowCountBinding}, AND BINDING THEM AS
         * PLAIN NUMBERS IS A RUN-TIME FAILURE THAT NOTHING HERE WOULD CATCH. Against the pinned
         * `mysql2@3.23.2` and MySQL 8.4, a true prepared statement answers a NUMBER in a `LIMIT` or
         * `OFFSET` position with ER_WRONG_ARGUMENTS; the same statement with the same values as decimal
         * text returns the expected page. That module documents the measurement and why every
         * alternative was refused. It is applied here — not only in the bounded repository members —
         * because this is the ONLY other row-count placeholder in the port, and the two must agree.
         *
         * The conversion changes nothing observable: `LIMIT '10'` and `LIMIT 10` select the same rows,
         * and both figures have already been validated as non-negative whole numbers by
         * `resolvePagination`. The ARITHMETIC is unchanged and still happens here — `:L762` binds the
         * page size and the zero-based offset derived from the one-based legacy start, in that order.
         */
        params: [
          ...where.params,
          toRowCountBinding(paging.pageRecordsShow),
          toRowCountBinding(paging.pageRecordsStart - 1),
        ],
      },
      recordsCount: { sql: recordsCountSql, params: where.params },
      pageRecordsStart: paging.pageRecordsStart,
      pageRecordsShow: paging.pageRecordsShow,
      currentPage: paging.currentPage,
      selectDistinct,
    };
  }

  /**
   * Runs a described query and returns its materialised outcome — all three legacy views.
   *
   * ⚠️ THIS IS THE ALL-THREE-VIEWS MEMBER, AND A CALLER SHOULD ASK FOR IT ONLY IF IT WANTS ALL THREE.
   * A caller that needs the unpaged collection alone — which is what the two option-collection reads
   * and the Google feed need — must call {@link executeRecords}, which issues ONE statement and
   * hydrates ONE array. `src/ports/SmartListQueryPort.ts` records why the choice belongs to the caller
   * rather than to a lazy result object, and why per-view execution is what the legacy itself does.
   *
   * THE STATEMENTS RUN SEQUENTIALLY, NOT CONCURRENTLY. The injected executor may be bound to a
   * single transaction-scoped connection (M6), and a connection cannot carry overlapping statements,
   * so issuing them in parallel would be unsafe for the very case the injection exists to serve. The
   * legacy is sequential too, materialising the unpaged collection at `:L751`, the page at `:L759` and
   * the count at `:L771` as each is first read.
   *
   * ==============================================================================================
   * F-20 — ALL THREE ARE ISSUED EAGERLY, THE LEGACY ISSUES ONLY WHAT A CALLER READS
   * ==============================================================================================
   * This is the divergence, stated plainly rather than left implicit in the sequencing note above.
   * The legacy members are LAZY: `getRecords` at `org/Hibachi/HibachiSmartList.cfc:L751`,
   * `getPageRecords` at `:L759` and `getRecordsCount` at `:L771` each materialise on FIRST READ and
   * each caches, so a caller that reads only `getPageRecords()` issues ONE statement. This member
   * returns an already-materialised `SmartListResult` whose three members are all populated, so it
   * always issues THREE — and it must, because the AAP-declared service signatures
   * (AAP §0.4.2.1 `getProductSmartList`, §0.4.2.2 `getSkuSmartList`) return the executed result
   * rather than a configurable object, so there is no later moment at which a caller could ask for
   * a member and no way to know which members it will read.
   *
   * ⛔ THIS IS NOT PRESENTED AS AN OPTIMISATION, AND IT IS NOT ONE. Eager execution issues strictly
   * MORE statements than the legacy for a single-member read, and strictly the same number for a
   * caller that reads all three. Whether the eager form should become lazy — by returning thunks, by
   * deriving the count from `records.length` when the unpaged collection was materialised, or by
   * folding the paged and unpaged projections into one windowed statement — is a REVIEW ITEM for the
   * sibling performance pass, not a decision this checkpoint takes. It is recorded here so the pass
   * has the divergence and its cause in one place.
   *
   * ⛔ NO FIGURE IS STATED, AND NONE MAY BE ADDED. AAP §0.1.1.1 classifies this refactoring as
   * explicitly NOT performance refactoring, and IR-12 / AAP §0.7.3 standard 9 forbid inventing a
   * latency, throughput or statement-count target the source does not declare. The source declares
   * none: the only numeric runtime constants in the slice are the two request timeouts of M1 and M2.
   * Any performance pass must therefore MEASURE against a generated schema before choosing, which is
   * the same evidence gap F-21 records — the `Sw*` tables do not exist in this environment.
   *
   * WHERE THIS NOTE IS ACTUALLY ASSERTED, NAMED PRECISELY BECAUSE AN EARLIER REVISION NAMED IT WRONG.
   * That revision claimed the behaviour was covered "under a real fanning join, in
   * `test/services/OptionService.test.ts`", which was not true of any case in that file at the time —
   * the file's own header recorded that this builder sat outside its dependency whitelist. A coverage
   * claim that cannot be checked is worse than none, so the claim now enumerates the cases:
   *   • `test/adapters/MySqlOptionRepository.test.ts`'s folded `SmartListQueryBuilder` block — the three-statement shape against a real
   *     builder, the count-FIRST ordering, the two-statement reuse when
   *     {@link pageWindowCoversEveryRecord} holds, and the budget refusals on BOTH execution members.
   *   • `test/services/OptionService.test.ts` — the same real builder driven THROUGH a service, over a
   *     fanning join whose duplicate rows are produced by the executor rather than pre-collapsed, so
   *     removing `DISTINCT` from {@link composeSelectClause} changes the collection a caller receives
   *     and the assertions fail.
   *   • `test/regression/issues.test.ts` (`issue_1296`) — this builder driven through
   *     `ProductService.getProductSmartList`, the reading the legacy issue was raised against, so the
   *     page window it asserts is this builder's own offset arithmetic rather than a responder's. That
   *     member states no distinct flag and joins only many-to-one properties, so its companion case
   *     feeds it fanning rows to assert what the absent flag WOULD cost — which is how the protection
   *     is pinned to the join set rather than left as a comment.
   * So the three-statement shape and the distinctness asymmetry cannot drift unnoticed while the review
   * item is open.
   * ⚠️ SEC-12 — THE COUNT RUNS FIRST, AND THE BUDGET IS EVALUATED BEFORE EITHER ROW STATEMENT. The
   * order used to be records, page, count, which meant the unbounded collection was materialised
   * before anything could observe how large it was; the bound would then have had nothing left to
   * protect. See {@link SmartListMaterialisationBudget} for the finding, why the figure is injected,
   * and why an over-budget query is REFUSED rather than truncated.
   *
   * ⭐ THE REORDERING STRENGTHENS THE PARITY CLAIM BELOW RATHER THAN WEAKENING IT. The legacy runs its
   * dedicated counting statement precisely when the count is read BEFORE the unpaged collection has
   * been materialised — that is the condition at [org/Hibachi/HibachiSmartList.cfc:L783-L785]. This
   * port already resolved the ambiguity in favour of the dedicated statement, and counting first is
   * the legacy path on which the dedicated statement is the one that runs.
   *
   * RESIDUAL, STATED RATHER THAN LEFT IMPLICIT. The count and the row statements are separate reads.
   * Inside a transaction-scoped executor they observe one snapshot and agree; in autocommit a
   * concurrent insert between them can make a row statement return more rows than the count promised.
   * Each row statement's result is therefore re-checked against the same budget before ANY row is
   * hydrated, so an overshoot is refused rather than served, and it never becomes domain objects or a
   * response. Nothing here locks, retries or waits — this port introduces no such semantics (S9).
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
  public async execute<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListResult<SmartListRecord<TEntityName>>> {
    const { compiled, mapper } = this.prepare(query);

    /* ⭐ SEC-DOS-02, STEP 0 — THE CEILING IS RESOLVED BEFORE THE FIRST STATEMENT, NOT BETWEEN THEM. A
     * deployment that stated no figure learns so without a round trip, so a wiring error presents as a
     * wiring error rather than as a read that succeeds and is then discarded. Resolving once also means the
     * count gate and the two row gates below cannot compare against two different figures. */
    const maximumRecordsPerQuery = this.materialisationBudget.resolveMaximumRecordsPerQuery();

    /*
     * ⚠️ SEC-12, STEP 1 — THE COUNT RUNS FIRST, AND IT IS THE ONLY STATEMENT THAT CAN. It returns
     * exactly one row whatever the catalog holds, so it is safe to issue before any bound is known,
     * and running it here is what lets an over-budget query be refused before the unbounded collection
     * is materialised. The previous order — records, page, count — read the collection first, which
     * left a bound nothing to protect.
     *
     * ⭐ THE HOIST DOES NOT CHANGE THE COUNT'S VALUE, AND THE TODO(parity) ABOVE IS WHY. The legacy
     * count is order-dependent [`org/Hibachi/HibachiSmartList.cfc:L783-L785`]; this port resolved that
     * ambiguity in favour of the dedicated counting statement, which is always issued and never
     * inferred from a materialised length. Counting first is therefore the SAME answer, and it happens
     * to be the legacy branch on which the dedicated statement is the one that runs.
     */
    const countRows = await this.executor.execute(
      compiled.recordsCount.sql,
      compiled.recordsCount.params,
    );
    const recordsCount = readRecordsCount(countRows);

    /*
     * SEC-12, STEP 2 — the gate, fail-closed, before a single record row is read. Never skipped: review
     * finding SEC-DOS-02 made the budget REQUIRED, so there is no unbudgeted path to skip for.
     *
     * ⭐ SHARED WITH THE RECORDS-ONLY MEMBER RATHER THAN INLINED HERE. {@link refuseOverBudgetCount}
     * holds the one refusal both readings raise, so `execute` and {@link executeRecords} cannot drift
     * into two messages, two contexts or two comparison operators for one bound — which is exactly how
     * the records-only path came to have no bound at all.
     */
    this.refuseOverBudgetCount(recordsCount, query.entityName, maximumRecordsPerQuery);

    // `:L751-L755` — the unpaged collection, from the unbounded statement.
    const recordRows = await this.executor.execute(compiled.records.sql, compiled.records.params);

    /*
     * SEC-12, STEP 3 — the residual re-check, stated rather than left implicit. The count and the row
     * statements are separate reads: inside a transaction-scoped executor they observe one snapshot and
     * agree, but in autocommit a concurrent insert between them can return more rows than the count
     * promised. The overshoot is refused rather than served, so it never becomes domain objects or a
     * response. Nothing here locks, retries or waits — this port introduces no such semantics (S9).
     */
    this.refuseOverBudgetRows(
      recordRows.length,
      query.entityName,
      recordsCount,
      maximumRecordsPerQuery,
    );

    /*
     * ⭐ ONE INSTANCE PER ROW ACROSS BOTH COLLECTIONS. `records` is the unpaged collection and
     * `pageRecords` is a window into the same query, so nearly every page record is also a record — but
     * they arrive as two result sets, and mapping them independently produces TWO objects for one
     * database row. Hydrating a collection then sets each member's back-reference to whichever owner
     * instance was processed LAST, so `group.options[0].optionGroup === group` is false for the other
     * instance and one option ends up inside two collections. A shared identity map removes that at its
     * root instead of ordering the hydration passes to hide it, and it is what a single Hibernate
     * session gives. Scoped to this call, never to the module (M7).
     */
    const identityMap = new Map<string, SmartListRecord<TEntityName>>();
    const records = materialiseRows(recordRows, mapper, query.entityName, identityMap);

    /*
     * `:L759-L764` — the page. Issued unless {@link pageWindowCoversEveryRecord} has already proved
     * that this statement's bounds cannot exclude a single row of what is in hand, in which case the
     * records ARE the page and re-reading them would cost a second scan for the same answer.
     */
    const pageReusesRecords = pageWindowCoversEveryRecord(compiled, recordRows.length);
    const pageRows = pageReusesRecords
      ? recordRows
      : await this.executor.execute(compiled.pageRecords.sql, compiled.pageRecords.params);
    if (!pageReusesRecords) {
      this.refuseOverBudgetRows(
        pageRows.length,
        query.entityName,
        recordsCount,
        maximumRecordsPerQuery,
      );
    }

    const pageRecords = pageReusesRecords
      ? records
      : materialiseRows(pageRows, mapper, query.entityName, identityMap);

    // `:L800-L803` — the page end, clamped to the total so a short final page reports its real end.
    const pageRecordsEnd = Math.min(
      compiled.pageRecordsStart + compiled.pageRecordsShow - 1,
      recordsCount,
    );

    /*
     * INT-02 / DATA-02 — RESOLVE THE ASSOCIATIONS THE PROJECTION COULD NOT CARRY.
     *
     * The mappers above hydrate scalar columns only and leave every many-to-one absent, which is
     * `rowMappers.ts` RULE 3 working as specified rather than a gap in it. Without this step a consumer
     * received a structurally valid record whose associations were missing, and every guard downstream —
     * `requireProduct` in the feed, `requireOptionGroupID` in `SkuService.createSkus` — fired correctly
     * on data that should never have reached it.
     *
     * ⚠️ BOTH COLLECTIONS ARE PASSED IN ONE CALL, AND THE BATCH IS DEDUPLICATED FIRST. Loading only one
     * collection would leave the other's associations absent, so both are offered; but one identity map
     * spans both materialisations, so the two arrays SHARE an instance wherever they describe the same
     * primary key — and a fanning join repeats an instance inside one array by itself. A loader mutates
     * what it is handed, so an owner offered twice has its collection-valued associations appended
     * twice. {@link collectDistinctRowPairs} therefore reduces the batch to one pair per distinct
     * entity, which also means each identifier is resolved ONCE for the whole invocation.
     *
     * ⚠️ WHEN THE PAGE REUSES THE RECORDS the two are the SAME array by identity, so only one is
     * offered rather than the array concatenated with itself.
     *
     * ⚠️ ORDER SURVIVES because the loader mutates in place and returns nothing. The arrays handed back
     * below are the same arrays, in the same order the statements produced — which the sorted-SKU
     * odometer and the feed both depend on.
     *
     * A root with nothing to resolve has no loader, and that is a declared decision per root rather than
     * a fallback; see `createCatalogAggregateLoaders`.
     */
    /*
     * ⭐ EXACTLY ONE ASSOCIATION MECHANISM RUNS PER ROOT, AND WHICH ONE IS DECIDED BY THE ROOT.
     * Two mechanisms exist because they were built for different reaches: the INJECTED loader above is
     * supplied per root by the composition root, keeps catalog-specific statements out of this builder,
     * and is the one the Google feed's roots use; {@link SmartListQueryBuilder.hydrateAssociations} is
     * the built-in relationship pass, and it reaches roots no loader is supplied for — `SlatwallOptionGroup`
     * being the live case, whose `options` collection `ProductService.processProductAddOptionGroup`
     * indexes at `options[1]` (the D14 site), so an unhydrated group would make the carried-forward
     * defect unreproducible.
     *
     * ⛔ THEY ARE NOT BOTH RUN. Running both would issue two sets of statements for one root and let two
     * passes assign the same association, so the loader WINS wherever one exists and the built-in pass is
     * reached only when none does. One root, one reading, no drift.
     */
    const loadAggregates = this.aggregateLoaders[query.entityName];
    if (loadAggregates !== undefined) {
      const batch = collectDistinctRowPairs(
        pageReusesRecords ? recordRows : [...recordRows, ...pageRows],
        pageReusesRecords ? records : [...records, ...pageRecords],
      );
      await loadAggregates({
        executor: this.executor,
        rows: batch.rows,
        entities: batch.entities,
      });
    } else {
      await this.hydrateAssociations(query.entityName, records, pageRecords);
    }

    return {
      records,
      pageRecords,
      recordsCount,
      pageRecordsStart: compiled.pageRecordsStart,
      pageRecordsEnd,
      currentPage: compiled.currentPage,
      // `:L812-L813`.
      totalPages: Math.ceil(recordsCount / compiled.pageRecordsShow),
    };
  }

  /**
   * Runs a described query for its unpaged records alone — ONE statement and ONE hydration.
   *
   * This is `getRecords()` on its own: `:L751-L755` materialising the collection from the unbounded
   * statement of `:L748-L750`, with the page of `:L759` and the count of `:L771` never asked for.
   * `src/ports/SmartListQueryPort.ts` states the contract, including why a `pagination` section on the
   * query is not consulted on this path and why the order-dependent legacy count cannot arise on it.
   *
   * IT COMPILES THE SAME QUERY AS {@link execute}, THROUGH THE SAME CODE. {@link prepare} is shared, so
   * the joins, the filters, the keyword expansion, the `DISTINCT` projection and the ordering are not
   * merely equivalent but identical — the very same {@link CompiledSmartListQuery} this class would
   * have produced for the three-view read. The only difference is which of its statements is issued.
   *
   * ==============================================================================================
   * SEC-12 APPLIES HERE TOO, AND THAT IS A FIX — THIS PATH USED TO BE THE UNBOUNDED ONE
   * ==============================================================================================
   * ⚠️ THE MEMBER THE BUDGET WAS LEAST APPLIED TO WAS THE MEMBER THAT NEEDED IT MOST. {@link execute}
   * counted first and refused an over-budget query, while this member issued the UNPAGED statement
   * directly and hydrated every row it returned with no bound consulted at all. That inverted the
   * intent: this is the member the Google product feed reads the whole catalogue through
   * (`../../integrations/google/ProductFeedQuery.ts`), and its result is a collection with no `LIMIT`
   * of any kind, so it is strictly the larger materialisation of the two. A bound that guarded the
   * paged reading and left the unpaged one open guarded the wrong half.
   *
   * ⭐ THE GATE IS THE SAME GATE, IN THE SAME ORDER: count, refuse, read, re-check — see
   * {@link gateRecordsOnlyRead} and {@link refuseOverBudgetCount}. Both refusals are raised from the
   * same two private members `execute` uses, so the two readings cannot diverge in message, context or
   * comparison.
   *
   * ⛔ PARITY WHEN NO BUDGET IS WIRED IS EXACT, AND IT IS WHY THE COUNT IS CONDITIONAL. With no budget
   * this member issues exactly ONE statement, as it always did and as `getRecords()` at
   * `org/Hibachi/HibachiSmartList.cfc:L751-L755` does — the counting statement is issued ONLY when a
   * figure exists for it to be compared against. Counting unconditionally would have added a second
   * statement to every unbudgeted read, which is a behaviour change AAP §0.8.2 guideline 4 forbids,
   * and it would have reintroduced the order-dependent count this path is documented above as being
   * free of. No default budget is introduced and no figure is named (IR-12 / AAP §0.7.3 S9).
   *
   * @typeParam TEntityName - The root entity, inferred from `query.entityName`, exactly as under
   *   {@link execute} (see {@link materialiseRows} for how the element type follows from it rather than
   *   being asserted into place).
   * @param query - The complete, immutable description of the query to run.
   * @returns Every matching record, in the order the query's ordering terms produce, unpaged, in a
   *   freshly hydrated array the caller owns.
   * @throws {DomainError} When a materialisation budget is wired and this query matches, or returns,
   *   more records than it admits. The query is REFUSED, never shortened.
   */
  public async executeRecords<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListRecord<TEntityName>[]> {
    const { compiled, mapper } = this.prepare(query);

    /* SEC-DOS-02, STEP 0 — resolved before the first statement, for the reason given on `execute`. */
    const maximumRecordsPerQuery = this.materialisationBudget.resolveMaximumRecordsPerQuery();

    /*
     * SEC-12, STEP 1 AND 2 — count and gate, before the unbounded statement is issued. Always both:
     * review finding SEC-DOS-02 removed the unbudgeted path that used to issue neither.
     */
    const recordsCount = await this.gateRecordsOnlyRead(
      compiled,
      query.entityName,
      maximumRecordsPerQuery,
    );

    const recordRows = await this.executor.execute(compiled.records.sql, compiled.records.params);

    /*
     * SEC-12, STEP 3 — the residual re-check, for the same reason it exists on the paged path: the
     * count and the row statement are separate reads, so in autocommit a concurrent insert between
     * them can widen the row set after the gate has already passed it. Checked BEFORE hydration, where
     * the per-row cost and the retained memory are.
     */
    this.refuseOverBudgetRows(
      recordRows.length,
      query.entityName,
      recordsCount,
      maximumRecordsPerQuery,
    );

    const records = materialiseRows(
      recordRows,
      mapper,
      query.entityName,
      new Map<string, SmartListRecord<TEntityName>>(),
    );

    /*
     * INT-02 / DATA-02 ON THE RECORDS-ONLY PATH TOO. The Google feed reads the smart list through THIS
     * member, and `ProductFeedBuilder` dereferences `sku.getProduct()` for every field it emits, so
     * omitting the association step here would leave the feed exactly as broken as it was before the
     * fix — with the defect merely relocated to the one path the feed actually uses.
     */
    const loadAggregates = this.aggregateLoaders[query.entityName];
    if (loadAggregates !== undefined) {
      // Deduplicated for the same reason as the paged member: a fanning join repeats one instance.
      const batch = collectDistinctRowPairs(recordRows, records);
      await loadAggregates({ executor: this.executor, rows: batch.rows, entities: batch.entities });
    } else {
      // The same single-mechanism rule as `execute`; see the note there.
      await this.hydrateAssociations(query.entityName, records, records);
    }

    return records;
  }

  /**
   * Compiles the query and selects the mapper its rows hydrate through — the step both execution
   * members share, so neither can compose a different statement from the same description.
   *
   * The mapper is resolved BEFORE anything is executed, deliberately: a query rooted at an entity this
   * port cannot hydrate is a programming error in the caller's pairing of an entity name with an
   * element type, and reporting it costs nothing if it is reported before a statement runs. Reporting
   * it afterwards would mean a scan whose rows are then thrown away.
   */
  private prepare<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): PreparedSmartList<TEntityName> {
    /*
     * ⭐ MIN-01 — THE MAPPER LOOKUP IS TOTAL, SO THERE IS NOTHING LEFT TO GUARD. `ENTITY_ROW_MAPPERS`
     * is keyed by {@link SmartListRootEntityName}, the port constrains `query.entityName` to that same
     * union, and every key holds a mapper — so the lookup cannot answer `undefined` and the run-time
     * refusal that used to stand here has been replaced by a COMPILE error at the call site. Rooting a
     * list at `SlatwallAlternateSkuCode`, the one entity name the slice models no domain type for, no
     * longer type-checks, which is strictly stronger than reporting it once the query has already been
     * composed and issued.
     */
    return { compiled: this.build(query), mapper: ENTITY_ROW_MAPPERS[query.entityName] };
  }

  /**
   * Resolve the associations of a materialised smart list, in a second pass, with one instance per
   * identifier.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════════
   * WHY A SECOND PASS RATHER THAN A WIDER PROJECTION
   * ═══════════════════════════════════════════════════════════════════════════════════════════════
   * {@link composeSelectClause} emits `<baseAlias>.*` and that qualifier is load-bearing: the moment a
   * join is registered, same-named columns from several tables come into scope, and an unqualified `*`
   * would let `activeFlag`, `urlTitle`, `sortOrder`, `remoteID` and all four audit columns resolve to
   * whichever table the driver happened to order first. Widening the projection to carry the joined
   * tables' columns would mean re-implementing that disambiguation inside the base statement and would
   * make the row shape depend on which joins a caller declared — so the base statement keeps projecting
   * exactly one table, and the associations are loaded by identifier afterwards.
   *
   * This is also what keeps `rowMappers.ts` RULE 3 intact rather than bending it. RULE 3 leaves every
   * association UNRESOLVED and states the licence used here in its own words: *"The foreign-key value
   * is not lost either — the repository holds the same row and reads the `*ID` column itself when it
   * needs to resolve the other side."* This member does not even need the row: it re-reads the foreign
   * key from the database by primary key, so no mapper has to start emitting FK columns and RULE 3's
   * invariant is untouched.
   *
   * ⚠️ NO STUBS, EVER. RULE 3 rejects lazy proxies with a concrete case:
   * `option.getOptionGroup().getImageGroupFlag()` at `model/entity/Sku.cfc:L134` would read the class
   * default `false` off a stub and no error would be raised. So an association is either fully loaded
   * or left ABSENT, and absent is what a genuinely NULL foreign key produces.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * WHAT IS HYDRATED, AND WHY EXACTLY THIS SET
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * Every entry below is a relationship some in-scope consumer actually dereferences. The set was
   * taken from a census of the consumers rather than from the relationship registry, because hydrating
   * everything the registry declares would walk `Brand.products` and `ProductType.childProductTypes`
   * and load the catalog transitively.
   *
   *   `SlatwallOption` -> `optionGroup`
   *       `Sku.hasOneOptionPerOptionGroup` reads `option.getOptionGroup().getOptionGroupID()`
   *       [`model/entity/Sku.cfc:L772-L784`], and it is one of the two METHOD-BASED validation rules of
   *       `model/validation/Sku.json`. `SkuService` walks the same chain three times while enumerating
   *       combinations [`model/service/SkuService.cfc:L75`, `:L76`, `:L78`].
   *
   *   `SlatwallOptionGroup` -> `options`
   *       `ProductService.processProductAddOptionGroup` reads `optionGroup.getOptions()` and then
   *       indexes `options[1]` — the D14 site [`model/service/ProductService.cfc:L115-L119`]. With an
   *       empty collection D14 silently adds nothing instead of adding the first option, so the
   *       carried-forward defect would not even be reproducible.
   *
   *   `SlatwallProduct` -> `productType`, `brand`, `defaultSku`
   *       The Google feed reads `product.productType` for `g:product_type` and the description
   *       fallback, `product.brand` for the conditional `g:brand`, and `product.getPrice()` for
   *       `g:price` — and `Product.getPrice` falls through to `defaultSku.getPrice()`
   *       [`model/entity/Product.cfc:L563-L568`], so `g:price` is empty without the default SKU. These
   *       are exactly the three relationships `feed.cfc:L64-L66` joins, which is the independent
   *       confirmation that the legacy needs all three loaded.
   *
   *   `SlatwallSku` -> `product`, and then that product's three
   *       The feed's smart list is rooted at the SKU, so the product is reached through it. The nested
   *       step is what makes `sku.getProduct().getBrand()` resolve.
   *
   * NOT hydrated, deliberately: `Sku.options` on this path, because the SKU repository loads it where
   * the sorted-SKU ordering and the two method rules need it
   * ({@link MySqlSkuRepository.hydrateSkuOptions}); `Option.skus`, `Brand.products`,
   * `ProductType.childProductTypes`, `ProductType.parentProductType`, `Product.skus` and
   * `Sku.alternateSkuCodes`, because no in-scope consumer dereferences them and loading them would
   * build reference cycles and unbounded transitive reads. Each is left ABSENT under RULE 3, which is
   * a state consumers already handle.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * THE IDENTITY MAP IS PER CALL, NOT PER MODULE (M7)
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * One instance per identifier for the duration of this call, then discarded. M7 records that nothing
   * may survive between Lambda invocations except module-scope state, so a module-scope identity map on
   * a warm container would hand one request rows loaded for another. `manageEntity` returns THE SAME
   * OBJECT it was given (RULE 5, `Object.assign`), so reference identity and `instanceof` both survive
   * and the map is coherent.
   *
   * ⚠️ THE STATEMENTS ARE SEQUENTIAL, for the same reason the three base statements are: the injected
   * executor may be bound to ONE transaction-scoped connection (M6), and `mysql2` serialises work on a
   * single connection, so issuing them concurrently would be unsafe for exactly the case the injection
   * exists to serve.
   */
  private async hydrateAssociations(
    entityName: SmartListEntityName,
    records: readonly unknown[],
    pageRecords: readonly unknown[],
  ): Promise<void> {
    const entities = collectDistinctEntities(records, pageRecords);
    if (entities.length === 0) {
      return;
    }

    switch (entityName) {
      case 'SlatwallOption': {
        await this.hydrateOptionGroups(entities as readonly Option[]);
        return;
      }
      case 'SlatwallOptionGroup': {
        await this.hydrateOptionGroupOptions(entities as readonly OptionGroup[]);
        return;
      }
      case 'SlatwallProduct': {
        await this.hydrateProductAssociations(entities as readonly Product[]);
        return;
      }
      case 'SlatwallSku': {
        await this.hydrateSkuProducts(entities as readonly Sku[]);
        return;
      }
      default:
        // `SlatwallBrand`, `SlatwallProductType` and `SlatwallAlternateSkuCode` declare no
        // relationship that an in-scope consumer dereferences, so there is nothing to load. Returning
        // is the correct behaviour rather than a gap: RULE 3 leaves the association absent and every
        // consumer of these three entities reads only their own columns.
        return;
    }
  }

  /**
   * Load rows of the far side of one association, grouped by the near side's identifier.
   *
   * The statement is derived from {@link ENTITY_JOIN_SPECIFICATIONS}, which is the same registry the
   * join emitter reads, so POLARITY IS NOT RE-STATED HERE. That matters: `parentForeignKey` means the
   * near table carries the key and `childForeignKey` means the far table does, and getting it backwards
   * produces a statement that runs and returns the wrong rows. Single-sourcing it means the CFML
   * `fkcolumn` transcription is verified once, next to its `model/entity/*.cfc` locator.
   *
   * ⚠️ THE FAR SIDE IS PROJECTED WITH `<alias>.*` AND THAT IS SAFE HERE, unlike in the base statement,
   * because exactly ONE entity table is projected: the near table contributes only its primary key, and
   * that key is ALIASED to {@link ASSOCIATION_OWNER_KEY}. So no two columns in the result share a name
   * and `rowMappers.ts` RULE 2 cannot be violated — the mapper receives its own table's columns plus one
   * alias no table declares.
   *
   * @param orderColumns - Far-table columns to order by, for a collection whose legacy mapping declares
   *   `orderby`. The near side's key is always prepended, which cannot change the per-owner order and
   *   makes the read reproducible.
   * @returns A map from near-side identifier to the far-side rows for it, in statement order. An owner
   *   with no far-side row is simply absent from the map.
   */
  private async loadAssociationRows(
    nearEntityName: SmartListEntityName,
    relatedProperty: string,
    ownerKeys: readonly string[],
    orderColumns?: readonly string[],
  ): Promise<ReadonlyMap<string, MySqlRow[]>> {
    const specification = ENTITY_JOIN_SPECIFICATIONS[nearEntityName][relatedProperty];
    if (specification === undefined || specification.kind === 'linkTable') {
      throw new DomainError(
        'An association load was requested for a relationship this member cannot compose a statement ' +
          'for. Many-to-many collections are loaded by the repository that owns them, because the link ' +
          'table needs an alias of its own.',
        { context: { nearEntityName, relatedProperty } },
      );
    }

    const nearTable = assertTableName(nearEntityName);
    const nearPrimaryKey = assertColumnName(nearTable, ENTITY_PRIMARY_KEY[nearEntityName]);
    const farTable = assertTableName(specification.childEntityName);
    const farAlias = ASSOCIATION_FAR_ALIAS;

    let sql: string;
    if (specification.kind === 'parentForeignKey') {
      // many-to-one: the NEAR table carries the foreign key, so the near table must be in the
      // statement to supply both the owner key and the key to join on.
      const nearColumn = assertColumnName(nearTable, specification.parentColumn);
      sql =
        `SELECT ${ASSOCIATION_NEAR_ALIAS}.${nearPrimaryKey} AS ${ASSOCIATION_OWNER_KEY}, ${farAlias}.* ` +
        `FROM ${nearTable} ${ASSOCIATION_NEAR_ALIAS} ` +
        `INNER JOIN ${farTable} ${farAlias} ` +
        `ON ${farAlias}.${assertColumnName(farTable, ENTITY_PRIMARY_KEY[specification.childEntityName])} ` +
        `= ${ASSOCIATION_NEAR_ALIAS}.${nearColumn} ` +
        `WHERE ${ASSOCIATION_NEAR_ALIAS}.${nearPrimaryKey} IN (${composeOwnerPlaceholders(ownerKeys)})`;
      // INNER, not LEFT, and deliberately: a NULL foreign key yields no row, the owner is absent from
      // the map, and the association stays ABSENT on the entity. A LEFT join would return a row of all
      // NULLs that the mapper would have to be taught to recognise as "no association", which is how a
      // stub gets built by accident.
    } else {
      // one-to-many inverse: the FAR table carries the foreign key, so the near table is not needed at
      // all and the foreign key doubles as the owner key.
      const farColumn = assertColumnName(farTable, specification.childColumn);
      sql =
        `SELECT ${farAlias}.${farColumn} AS ${ASSOCIATION_OWNER_KEY}, ${farAlias}.* ` +
        `FROM ${farTable} ${farAlias} ` +
        `WHERE ${farAlias}.${farColumn} IN (${composeOwnerPlaceholders(ownerKeys)})`;
    }

    const orderTerms = [`${farAlias}.${ASSOCIATION_OWNER_KEY}`];
    if (orderColumns !== undefined && orderColumns.length > 0) {
      orderTerms.length = 0;
      orderTerms.push(ASSOCIATION_OWNER_KEY);
      for (const column of orderColumns) {
        orderTerms.push(`${farAlias}.${assertColumnName(farTable, column)}`);
      }
      sql += ` ORDER BY ${orderTerms.join(', ')}`;
    }

    const rows = await this.executor.execute(sql, [...ownerKeys]);
    const grouped = new Map<string, MySqlRow[]>();
    for (const row of rows) {
      const ownerKey = row[ASSOCIATION_OWNER_KEY];
      if (typeof ownerKey !== 'string') {
        throw new DataIntegrityError(
          `An association load returned a row whose ${ASSOCIATION_OWNER_KEY} is not a string.`,
        );
      }
      const bucket = grouped.get(ownerKey);
      if (bucket === undefined) {
        grouped.set(ownerKey, [row]);
      } else {
        bucket.push(row);
      }
    }
    return grouped;
  }

  /**
   * Resolve `Option.optionGroup` — `model/entity/Option.cfc:L59`, `many-to-one fkcolumn="optionGroupID"`.
   *
   * The column has no `notnull` in the mapping, so an option whose group is NULL keeps `optionGroup`
   * ABSENT. `model/validation/Option.json` requires the group on save, so such a row is one the legacy
   * would also refuse to re-save; it is loaded as it stands rather than repaired (AAP §0.6.7,
   * "preserve and annotate, do not repair").
   */
  private async hydrateOptionGroups(options: readonly Option[]): Promise<void> {
    const keys = collectIdentifiers(options, (option) => option.optionID);
    if (keys.length === 0) {
      return;
    }
    const grouped = await this.loadAssociationRows('SlatwallOption', 'optionGroup', keys);
    const identityMap = new Map<string, OptionGroup>();
    for (const option of options) {
      const row = grouped.get(option.optionID)?.[0];
      if (row === undefined) {
        continue;
      }
      option.optionGroup = resolveMapped(row, 'optionGroupID', identityMap, mapOptionGroupRow);
    }
  }

  /**
   * Resolve `OptionGroup.options` — `model/entity/OptionGroup.cfc:L70`, `one-to-many`
   * `fkcolumn="optionGroupID" inverse="true" cascade="all-delete-orphan" orderby="sortOrder"`.
   *
   * ⚠️ `orderby="sortOrder"` IS DECLARED HERE, and it is the reason this collection is ordered while
   * `Sku.options` is not: `model/entity/Sku.cfc:L76` declares NO `orderby`, so applying `sortOrder`
   * there would be an invented ordering (S9). The two declarations differ in the source, so neither
   * ordering may be copied onto the other. `optionID` is appended purely to break ties deterministically
   * — `sortOrder` is nullable on `SwOption`, so ties and NULLs are both possible and Hibernate leaves
   * their relative order unspecified.
   *
   * The loaded options have their `optionGroup` set back to the owner from the identity map, so the
   * relationship is consistent in both directions without a second statement — which is what a single
   * Hibernate session would also give.
   *
   * RULE 4: the collection the class initialised is FILLED, never replaced.
   * `model/entity/Option.cfc:L95` mutates the legacy collection in place, so a reference taken before
   * the load must still observe the result.
   */
  private async hydrateOptionGroupOptions(groups: readonly OptionGroup[]): Promise<void> {
    const keys = collectIdentifiers(groups, (group) => group.optionGroupID);
    if (keys.length === 0) {
      return;
    }
    const grouped = await this.loadAssociationRows('SlatwallOptionGroup', 'options', keys, [
      'sortOrder',
      'optionID',
    ]);
    const identityMap = new Map<string, Option>();
    for (const group of groups) {
      const rows = grouped.get(group.optionGroupID);
      if (rows === undefined) {
        continue;
      }
      for (const row of rows) {
        const option = resolveMapped(row, 'optionID', identityMap, mapOptionRow);
        option.optionGroup = group;
        group.options.push(option);
      }
    }
  }

  /**
   * Resolve `Product.productType`, `Product.brand` and `Product.defaultSku` — the three relationships
   * `integrationServices/google/controllers/feed.cfc:L64-L66` joins, declared at
   * `model/entity/Product.cfc:L68`, `:L69` and `:L70`, all `many-to-one`.
   *
   * All three foreign keys are nullable, and all three genuinely are null in practice: a product need
   * not have a brand (which is why `feed.cfc:L66` joins brand with an explicit `left`), and a product
   * has no default SKU until its first SKU is written — see the three-step write order in
   * {@link MySqlProductRepository.saveProduct}. A null key therefore leaves the association ABSENT, and
   * every consumer already handles that: the feed omits `g:brand` entirely when the brand is missing,
   * and `Product.getPrice` returns `undefined` when there is no default SKU.
   *
   * ⚠️ `defaultSku` IS TYPED AS A DELEGATE, AND A MAPPED `Sku` DOES **NOT** SATISFY IT. `Product.defaultSku`
   * is declared `ProductDefaultSkuDelegate`, a nine-member read-only surface that deliberately omits an
   * identifier accessor so the product module need not import the SKU module. Four of those nine members
   * do not line up with `Sku`, and the mismatch is real rather than cosmetic:
   *
   *   - `Sku` DECLARES NO `getImageDirectory` AT ALL. That asymmetry is `Sku.cfc`'s, not this port's, and
   *     is already recorded on {@link Sku} — `model/entity/Sku.cfc` declares `getImagePath` at `:L145`
   *     and no directory member, while `model/entity/Product.cfc` declares one.
   *   - `Sku`'s four other image members are ASYNCHRONOUS and each REQUIRES an injected `ImagePathPort`,
   *     because a SKU image path is resolved through settings and the file system. The delegate declares
   *     them synchronous and zero-argument, as `model/entity/Product.cfc:L320-L338` declares them.
   *   - `Sku.getCurrencyCode` requires an injected setting resolver; the delegate declares it zero-argument.
   *
   * So the mapped SKU is WRAPPED rather than assigned — see {@link resolveDefaultSkuDelegate}. The three
   * monetary members forward to the SKU, and the six that need a port this layer does not hold RAISE.
   */
  private async hydrateProductAssociations(products: readonly Product[]): Promise<void> {
    const keys = collectIdentifiers(products, (product) => product.productID);
    if (keys.length === 0) {
      return;
    }

    const [productTypeRows, brandRows, defaultSkuRows] = [
      await this.loadAssociationRows('SlatwallProduct', 'productType', keys),
      await this.loadAssociationRows('SlatwallProduct', 'brand', keys),
      await this.loadAssociationRows('SlatwallProduct', 'defaultSku', keys),
    ];

    const productTypes = new Map<string, ProductType>();
    const brands = new Map<string, Brand>();
    const defaultSkus = new Map<string, Sku>();
    const delegates = new Map<Sku, ProductDefaultSkuDelegate>();

    for (const product of products) {
      const productTypeRow = productTypeRows.get(product.productID)?.[0];
      if (productTypeRow !== undefined) {
        product.productType = resolveMapped(
          productTypeRow,
          'productTypeID',
          productTypes,
          mapProductTypeRow,
        );
      }
      const brandRow = brandRows.get(product.productID)?.[0];
      if (brandRow !== undefined) {
        product.brand = resolveMapped(brandRow, 'brandID', brands, mapBrandRow);
      }
      const defaultSkuRow = defaultSkuRows.get(product.productID)?.[0];
      if (defaultSkuRow !== undefined) {
        const defaultSku = resolveMapped(defaultSkuRow, 'skuID', defaultSkus, mapSkuRow);
        product.defaultSku = resolveDefaultSkuDelegate(defaultSku, delegates);
      }
    }
  }

  /**
   * Resolve `Sku.product` — `model/entity/Sku.cfc:L65`, `many-to-one fkcolumn="productID"` — and then
   * that product's own three associations.
   *
   * THE NESTED STEP IS WHAT THE FEED ACTUALLY NEEDS. Its smart list is rooted at the SKU
   * (`feed.cfc:L63`), and every product-level field it emits is reached as `sku.getProduct().<...>`.
   * One statement per level, so the number of statements is fixed by the depth of the graph rather than
   * by the number of rows: no per-row query, at either level.
   *
   * The distinct products are collected from the identity map, so two SKUs of the same product share
   * one `Product` instance and its associations are loaded once.
   */
  private async hydrateSkuProducts(skus: readonly Sku[]): Promise<void> {
    const keys = collectIdentifiers(skus, (sku) => sku.skuID);
    if (keys.length === 0) {
      return;
    }
    const grouped = await this.loadAssociationRows('SlatwallSku', 'product', keys);
    const products = new Map<string, Product>();
    for (const sku of skus) {
      const row = grouped.get(sku.skuID)?.[0];
      if (row === undefined) {
        continue;
      }
      sku.product = resolveMapped(row, 'productID', products, mapProductRow);
    }
    await this.hydrateProductAssociations([...products.values()]);
  }

  /**
   * Counts and gates a records-only reading — SEC-12, tightened by review finding SEC-DOS-02.
   *
   * ⛔ THE COUNTING STATEMENT USED TO BE CONDITIONAL, AND THAT CONDITION WAS THE FINDING. This member
   * previously issued NO statement and answered `undefined` whenever no budget was wired, on the argument
   * that "counting unconditionally would double the statement count of every unbudgeted records-only read
   * — a behaviour change beyond the migration's need (AAP §0.8.2 guideline 4)". Guideline 4 forbids
   * enhancing BUSINESS LOGIC, and a count that is read and discarded changes no record this member
   * returns; what the early return actually did was leave every records-only read — including the one the
   * Google feed and every authenticated smart list reach — able to materialise an arbitrarily wide row
   * set. The budget is REQUIRED now, so there is no unbudgeted case and the branch is gone.
   *
   * ⚠️ THE PARITY COST, NAMED RATHER THAN HIDDEN. `getRecords()` at
   * `org/Hibachi/HibachiSmartList.cfc:L751-L755` issues ONE statement; this member issues two. The extra
   * one is a `COUNT`, it returns exactly one row whatever the catalog holds, and it returns the SAME
   * records to the caller. The order-dependent legacy count of the TODO(parity) on {@link execute} is
   * still not reintroduced: this port always counts with the dedicated statement and never infers a total
   * from a materialised length, so there is no second answer for a caller to observe.
   *
   * The count runs FIRST, exactly as in {@link execute}, because refusing after the unpaged collection had
   * been read would leave the bound nothing to protect.
   *
   * @param compiled - the compiled query, for its counting statement and bound parameters.
   * @param entityName - the queried entity, for the refusal's diagnostic context.
   * @param maximumRecordsPerQuery - the ceiling the caller already resolved, so no statement is issued
   *   before a deployment that stated none has been told so.
   * @returns The total the counting statement reported. The `undefined` arm of the return type is
   *   retained because {@link refuseOverBudgetRows} accepts the value as an optional diagnostic and that
   *   contract is shared with the paged path.
   * @throws {DomainError} When the count exceeds the budget. Raised by {@link refuseOverBudgetCount}, so
   *   the message and context are identical to the paged path's.
   */
  private async gateRecordsOnlyRead(
    compiled: CompiledSmartListQuery,
    entityName: SmartListEntityName,
    maximumRecordsPerQuery: number,
  ): Promise<number | undefined> {
    const countRows = await this.executor.execute(
      compiled.recordsCount.sql,
      compiled.recordsCount.params,
    );
    const recordsCount = readRecordsCount(countRows);
    this.refuseOverBudgetCount(recordsCount, entityName, maximumRecordsPerQuery);

    return recordsCount;
  }

  /**
   * Refuses a query whose COUNT exceeds the materialisation budget — SEC-12, the primary gate.
   *
   * Shared by {@link SmartListQueryBuilder.execute} and {@link SmartListQueryBuilder.gateRecordsOnlyRead}
   * so both readings raise one refusal with one message and one context. It ran inline in the paged
   * member first; extracting it is what let the records-only member acquire the SAME bound rather than a
   * second, subtly different one.
   *
   * ⚠️ IT REFUSES BEFORE ANY ROW IS READ, which is the whole value of counting first: an over-budget
   * query never materialises its collection at all, so there is no row set to trim and no partial
   * result to mistake for a complete one. It is never skipped — review finding SEC-DOS-02 made the
   * budget required, so there is no unbudgeted path to skip for.
   *
   * @param recordsCount - the total the counting statement reported.
   * @param entityName - the queried entity, recorded for diagnosis only.
   * @param maximumRecordsPerQuery - the ceiling the calling member resolved BEFORE issuing any statement;
   *   see SEC-DOS-02, step 0 on {@link SmartListQueryBuilder.execute}. Passed in rather than resolved
   *   here so one reading cannot compare its count and its rows against two different figures.
   */
  private refuseOverBudgetCount(
    recordsCount: number,
    entityName: SmartListEntityName,
    maximumRecordsPerQuery: number,
  ): void {
    if (recordsCount > maximumRecordsPerQuery) {
      throw new DomainError(
        'A smart-list query matched more records than the configured materialisation budget admits, ' +
          'so it was refused before any row was read rather than answered with a silently shortened ' +
          'result.',
        { context: { entityName, recordsCount, maximumRecordsPerQuery } },
      );
    }
  }

  /**
   * Refuses a row set that exceeds the materialisation budget — SEC-12, the defence-in-depth half.
   *
   * The primary gate is {@link SmartListQueryBuilder.refuseOverBudgetCount}, reached from both
   * execution members. This one exists only because the count and the row statements are separate
   * reads, so in autocommit a concurrent insert can widen a row set after the gate has already passed
   * it. It is checked BEFORE hydration, which is where the per-row cost and the retained memory
   * actually are.
   *
   * ⚠️ IT REFUSES; IT DOES NOT TRIM. Returning the first `maximumRecordsPerQuery` rows would be the
   * silent truncation {@link SmartListMaterialisationBudget} rules out, and it would do so on exactly
   * the path where a caller has least reason to suspect it.
   *
   * @param rowsRead - how many rows the statement returned.
   * @param entityName - the queried entity, recorded for diagnosis only.
   * @param recordsCount - the total the counting statement reported, recorded so the divergence
   *   between the two reads is visible rather than inferred. Retained as optional in the signature
   *   because it is diagnostic only; every current caller supplies it, since SEC-DOS-02 removed the
   *   unbudgeted path on which no counting statement was issued.
   * @param maximumRecordsPerQuery - the ceiling the calling member resolved before any statement ran.
   */
  private refuseOverBudgetRows(
    rowsRead: number,
    entityName: SmartListEntityName,
    recordsCount: number | undefined,
    maximumRecordsPerQuery: number,
  ): void {
    if (rowsRead > maximumRecordsPerQuery) {
      throw new DomainError(
        'A smart-list statement returned more rows than the configured materialisation budget ' +
          'admits, so the result was refused before any row was hydrated rather than answered with a ' +
          'silently shortened result.',
        { context: { entityName, rowsRead, recordsCount, maximumRecordsPerQuery } },
      );
    }
  }
}

/**
 * Wrap a mapped SKU as the delegate `Product.defaultSku` declares, memoized per SKU instance.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A RAISE IS NOT THE STUB RULE 3 FORBIDS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * `rowMappers.ts` RULE 3 rejects lazy-proxy stubs, and its reason is specific: *"a stub answers
 * non-identifier reads with class defaults instead of failing"* — `option.getOptionGroup().getImageGroupFlag()`
 * would quietly return `false`. The danger is SILENCE, not absence. A member that raises is the opposite
 * of silent: it cannot be mistaken for data, it names the port that is missing, and it fails at the first
 * read rather than corrupting a rendered feed.
 *
 * That is the pattern this subtree already uses for exactly this situation — `MySqlProductRepository`
 * carries `unresolvableProductImportSourceReader` and `unresolvableImportUrlTitleFilter`, each of which
 * raises rather than fabricating a value for a collaborator no composition root has bound yet. These six
 * members follow it.
 *
 * ⚠️ TWO, NOT THREE. A `unresolvableGlobalImageExtensionResolver` briefly stood beside them and is gone,
 * because the collaborator it refused for is gone too: the global image extension is not an injected
 * callback in this port but the frozen source-backed constant
 * `DEPRECATED_SETTING_DEFAULTS.globalImageExtension` in `../settings/StaticSettingResolver`, transcribing
 * the legacy metadata default at `model/service/SettingService.cfc:L247`. A refusing default is the right
 * shape only for a value the legacy genuinely resolved at runtime and this port cannot; that name was
 * never seeded, so every caller gets the same declared default and there is nothing to refuse. The
 * reasoning is recorded on `MySqlProductRepositoryDependencies`, which states the absence explicitly.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE THREE MONETARY MEMBERS ARE THE THREE THAT MATTER
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * `Product.getPrice` falls through to `defaultSku.getPrice()` when the product carries no override
 * [`model/entity/Product.cfc:L563-L568`], and a freshly mapped product NEVER carries one: `price` is a
 * column of `SwSku`, not of `SwProduct`, so nothing in a product row can populate the override slot. The
 * Google feed's `g:price` therefore reads through this delegate on every record
 * [`integrationServices/google/views/feed/product.cfm`], which is why `defaultSku` has to be hydrated at
 * all rather than left absent — and `getPrice`, `getListPrice` and `getRenewalPrice` are all
 * zero-argument and exact on `Sku`, so all three forward with no adaptation.
 *
 * TODO(boundary) — the six raising members become real reads once a composition root can bind
 * `ImagePathPort` and `SettingResolverPort` here (§0.2.2.7). `src/config/container.ts` is not part of this
 * checkpoint's inventory, so no wiring is invented for it; the raise names the gap instead of hiding it.
 *
 * @param sku - The mapped default SKU.
 * @param memo - Per-read memo, so one SKU instance yields one delegate instance. Without it two products
 *   sharing a default SKU would receive two wrappers and `===` between them would be false, which would
 *   defeat the identity map one level up.
 */
function resolveDefaultSkuDelegate(
  sku: Sku,
  memo: Map<Sku, ProductDefaultSkuDelegate>,
): ProductDefaultSkuDelegate {
  const existing = memo.get(sku);
  if (existing !== undefined) {
    return existing;
  }

  const unresolvable = (member: string, port: string): never => {
    throw new DomainError(
      `A product's default SKU was read through '${member}', which needs ${port} to answer. A default ` +
        'SKU hydrated by the smart-list adapter carries only the columns of its own row, so this read ' +
        'was refused rather than answered with a fabricated value.',
      { context: { member, port, skuID: sku.skuID } },
    );
  };

  const delegate: ProductDefaultSkuDelegate = {
    getPrice: () => sku.getPrice(),
    getListPrice: () => sku.getListPrice(),
    getRenewalPrice: () => sku.getRenewalPrice(),
    getCurrencyCode: () => unresolvable('getCurrencyCode', 'SettingResolverPort'),
    getImageDirectory: () => unresolvable('getImageDirectory', 'ImagePathPort'),
    getImagePath: () => unresolvable('getImagePath', 'ImagePathPort'),
    getImage: () => unresolvable('getImage', 'ImagePathPort'),
    getResizedImagePath: () => unresolvable('getResizedImagePath', 'ImagePathPort'),
    getImageExistsFlag: () => unresolvable('getImageExistsFlag', 'ImagePathPort'),
  };
  memo.set(sku, delegate);
  return delegate;
}

/**
 * The alias under which an association load returns the NEAR side's identifier.
 *
 * Chosen so that no in-scope table declares a column of this name: the far side is projected with
 * `<alias>.*`, so an owner key sharing a real column name would be overwritten by it and the grouping
 * would silently key on the wrong value.
 */
const ASSOCIATION_OWNER_KEY = 'smartListAssociationOwnerKey';

/** Statement aliases for an association load. Structure, never bound. */
const ASSOCIATION_NEAR_ALIAS = 'associationNear';
const ASSOCIATION_FAR_ALIAS = 'associationFar';

/** One `?` per owner key. Values only — `?` cannot substitute an identifier (TR-4, S2). */
function composeOwnerPlaceholders(ownerKeys: readonly string[]): string {
  return ownerKeys.map(() => '?').join(', ');
}

/**
 * Collect the entities of both smart-list collections, once each, preserving first-seen order.
 *
 * `records` is the unpaged collection and `pageRecords` is a window into the same query, so the two
 * overlap heavily — and because {@link materialiseRows} shares one identity map across both, an
 * overlapping row is THE SAME OBJECT in both collections. Deduplication is therefore BY REFERENCE, and
 * that is sufficient rather than merely convenient: reference equality and identifier equality coincide
 * for anything these two collections contain.
 *
 * ⚠️ VISITING AN OBJECT TWICE IS NOT HARMLESS, which is why this exists at all. A collection loader
 * PUSHES into the live array, so a second visit would append every member again — and a back-reference
 * would be re-pointed at the second owner instance. Both failures were observed before the base
 * identity map was introduced; this set is the second half of that guarantee.
 */
/**
 * Pair each row with the entity it hydrated into, keeping ONE pair per DISTINCT entity.
 *
 * ⚠️ THIS EXISTS BECAUSE THE IDENTITY MAP MADE THE OBVIOUS THING WRONG. An injected loader reads
 * `rows[index]` for `entities[index]` — it needs the pair — and it MUTATES the entity, appending to
 * collection-valued associations. Since one identity map now spans the unpaged and paged
 * materialisations, both collections hand back the SAME instance for the same primary key, and a
 * fanning join repeats one instance inside a single collection as well. Passing those repeats through
 * would append every child a second and third time: the product whose `skus` held two SKUs came back
 * holding four. Deduplicating by entity identity resolves each owner exactly once.
 *
 * Order is preserved, and so is alignment: the first row that produced an entity is the one kept, which
 * is the row every loader reads its foreign keys from.
 *
 * @param rows - the result rows, index-aligned with `entities`.
 * @param entities - the hydrated entities.
 * @returns The deduplicated, still index-aligned pair of arrays.
 */
function collectDistinctRowPairs<T>(
  rows: readonly MySqlRow[],
  entities: readonly T[],
): { readonly rows: readonly MySqlRow[]; readonly entities: readonly T[] } {
  const seen = new Set<T>();
  const pairedRows: MySqlRow[] = [];
  const pairedEntities: T[] = [];
  entities.forEach((entity, index) => {
    const row = rows[index];
    if (row === undefined || seen.has(entity)) {
      return;
    }
    seen.add(entity);
    pairedRows.push(row);
    pairedEntities.push(entity);
  });
  return { rows: pairedRows, entities: pairedEntities };
}

function collectDistinctEntities(
  records: readonly unknown[],
  pageRecords: readonly unknown[],
): readonly object[] {
  const seen = new Set<object>();
  const collected: object[] = [];
  for (const candidate of [...records, ...pageRecords]) {
    if (typeof candidate !== 'object' || candidate === null || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    collected.push(candidate);
  }
  return collected;
}

/**
 * Collect the distinct, non-empty identifiers of a batch, preserving order.
 *
 * A transient entity has no identifier to load an association by, so it is skipped rather than bound as
 * an empty string — binding `''` would match no row anyway, but it would also make the `IN` list longer
 * than the number of owners and obscure that fact.
 */
function collectIdentifiers<TEntity>(
  entities: readonly TEntity[],
  readIdentifier: (entity: TEntity) => string,
): readonly string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    const key = readIdentifier(entity);
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * Map a row to an entity, returning the instance already mapped for that identifier when there is one.
 *
 * THIS IS THE IDENTITY MAP. One instance per identifier per read, which is what a single Hibernate
 * session gives and what makes `===` between two references to the same row meaningful. `manageEntity`
 * returns THE SAME OBJECT it was handed (`rowMappers.ts` RULE 5, `Object.assign`), so a mapped entity is
 * not a copy or a proxy and caching it is sound.
 *
 * ⚠️ CALLING A MAPPER TWICE FOR ONE ROW IS NOT HARMLESS — `manageEntity` installs a FRESH error bag and
 * discards anything already accumulated. Routing every mapping through this function is what guarantees
 * a row is mapped exactly once.
 */
function resolveMapped<TEntity>(
  row: MySqlRow,
  identifierColumn: string,
  identityMap: Map<string, TEntity>,
  mapper: (row: MySqlRow) => TEntity,
): TEntity {
  const key = row[identifierColumn];
  if (typeof key !== 'string' || key === '') {
    throw new DataIntegrityError(
      `An association load returned a row whose ${identifierColumn} is not a non-empty string, so it ` +
        'could not be identity-mapped.',
    );
  }
  const existing = identityMap.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const mapped = mapper(row);
  identityMap.set(key, mapped);
  return mapped;
}

/* ================================================================================================
 * THE AGGREGATE LOADERS — RESOLVING THE MANY-TO-ONE ASSOCIATIONS A HYDRATED RECORD NEEDS
 * ------------------------------------------------------------------------------------------------
 * Resolves the many-to-one associations a hydrated Catalog record needs before business logic reads it.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/src/adapters/mysql/**` | CREATE. This section is the
 * "aggregate loader" half of the Data Mapper pattern AAP 0.3.3 assigns to this layer; the scalar half
 * is `./rowMappers` and stays exactly as it is.
 *
 * ⭐ WHY IT LIVES IN THIS MODULE RATHER THAN IN ONE OF ITS OWN — REVIEW FINDING F5. It stood in
 * the aggregate-loader section of `src/adapters/mysql/SmartListQueryBuilder.ts`, which is not one of the files AAP 0.3.1 enumerates, and the
 * finding required the production graph to consist only of AAP-listed files. The two candidate owners were
 * `./rowMappers` — conceptually the closer of the two, since AAP 0.4.1.7 describes it as the hydration
 * file — and THIS module, which AAP 0.4.1.7 describes as the port of `org/Hibachi/HibachiSmartList.cfc`.
 * `./rowMappers` was REJECTED on a mechanical ground rather than a stylistic one: `./QueryRunner` imports
 * the runtime value `toRows` FROM `./rowMappers`, and these loaders need `assertTableName` and
 * `assertColumnName` FROM `./QueryRunner`, so folding them there would create a runtime import CYCLE
 * where none exists today. This module already imports both sides, so nothing new is coupled — and the
 * placement is defensible on its own terms: {@link SmartListQueryBuilder.execute} is the caller of every
 * loader below, and eager association loading is precisely what the Hibernate-backed smart list did for
 * the legacy.
 *
 * ⚠️ ONE RENAME WAS FORCED BY THE MOVE, AND NOTHING ELSE CHANGED. The moved module declared a
 * `collectIdentifiers(rows, column)` helper and this module already declares an unrelated
 * `collectIdentifiers<TEntity>(...)`; the moved one is now `collectRowIdentifiers`. Every other
 * declaration, comment and statement is carried across verbatim.
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
 * ============================================================================================== */

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
function collectRowIdentifiers(rows: readonly MySqlRow[], column: string): readonly string[] {
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
    collectRowIdentifiers(productRows, COLUMN.productProductTypeID),
    mapProductTypeRow,
  );

  const brands = await loadByIdentifiers(
    request,
    BRAND_TABLE,
    BRAND_PROJECTION,
    COLUMN.brandID,
    collectRowIdentifiers(productRows, COLUMN.productBrandID),
    mapBrandRow,
  );

  const defaultSkus = await loadByIdentifiers(
    request,
    SKU_TABLE,
    SKU_PROJECTION,
    COLUMN.skuID,
    collectRowIdentifiers(productRows, COLUMN.productDefaultSkuID),
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
    const productIdentifiers = collectRowIdentifiers(request.rows, COLUMN.skuProductID);

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
    collectRowIdentifiers(request.rows, COLUMN.optionOptionGroupID),
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

    const productIdentifiers = collectRowIdentifiers(request.rows, COLUMN.productID);
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
     * {@link SmartListQueryBuilder.execute}. A SKU can back-reference exactly ONE product, so pushing a single
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

    const hydratedSkus: Sku[] = [];
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
        hydratedSkus.push(sku);
      }
    });

    /*
     * ⭐ F7 — EVERY HYDRATED SKU GETS ITS OPTIONS, AND THIS IS THE STATEMENT THAT MAKES THE PRODUCT
     * MUTATION MEMBERS CORRECT AGAIN.
     *
     * THE DEFECT. `ProductService.processProductAddOption` walks `product.getSkus()` and reads
     * `existingSku.getOptions()` to compose the selected-option list
     * (`model/service/ProductService.cfc:L140-L148`), and `processProductAddOptionGroup` calls
     * `sku.addOption(options[1])` on each existing SKU (`:L117-L121`). Without this load both members saw
     * EMPTY option collections: the first composed its list from the new option alone — a silently wrong
     * answer, with no error — and the second then handed a SKU whose collection held one option to
     * `persistSku`, which replaced the link table with it and deleted the rest.
     *
     * WHY LOADING HERE IS THE FAITHFUL TRANSLATION RATHER THAN AN ADDITION. `Product.skus` is a lazy
     * Hibernate collection of SKUs whose own `options` collection is also lazy, so in the legacy the two
     * members above triggered a lazy load per SKU as they iterated. This port has no session and no lazy
     * proxy, so the same rows have to be fetched deliberately; batching them into ONE statement for the
     * whole page is the same translation {@link attachProductAssociations} already applies to the
     * many-to-ones above, and it resolves the same collection the legacy resolved.
     *
     * ⛔ AND ONLY `options`. The three remaining owned collections at `model/entity/Sku.cfc:L77-L79` are
     * NOT loaded here: no in-scope member reads them, so the legacy never lazily loaded them on this path
     * either, and issuing three more statements per product read would be work Hibernate never did. They
     * stay marked NOT LOADED by RULE 3c, which is what makes `persistSku` preserve their stored rows
     * instead of deleting them — the other half of finding F7, closed at the write rather than the read.
     */
    if (hydratedSkus.length > 0) {
      await attachSkuOptions(request.executor, hydratedSkus);
    }
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
    collectRowIdentifiers(rows, COLUMN.optionOptionGroupID),
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
    /* ⭐ F7 / RULE 3c — MARKED BEFORE THE BUCKET CHECK, AND THE ORDER MATTERS. This statement runs for
     * every SKU in the batch, including one the link table returned no rows for: the read established
     * that such a SKU has NO options, which is a fact worth recording, and recording it is what lets
     * `MySqlSkuRepository.persistSku` clear stale rows for a SKU whose options were genuinely removed.
     * Marking only the SKUs with rows would leave an emptied collection indistinguishable from an
     * unloaded one, and removal would stop working. */
    markSkuOwnedLinkLoaded(sku, 'options');

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
      /* F7 / RULE 3c — the fetch read this collection's rows, so it is authoritative from here on. Marked
       * for every SKU in the batch, rows or none; see {@link attachSkuOptions} for why. */
      markSkuOwnedLinkLoaded(sku, 'accessContents');

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
      /* F7 / RULE 3c — as above. Only `subscriptionBenefits` is promoted: `model/dao/SkuDAO.cfc:L160`
       * fetches that collection alone, and `renewalSubscriptionBenefits` at `model/entity/Sku.cfc:L79` is
       * not fetched by any legacy branch — so it stays UNLOADED, and `persistSku` preserves its rows. */
      markSkuOwnedLinkLoaded(sku, 'subscriptionBenefits');

      for (const subscriptionBenefitID of grouped.get(sku.skuID) ?? []) {
        sku.subscriptionBenefits.push({ subscriptionBenefitID });
      }
    }
  }
}
