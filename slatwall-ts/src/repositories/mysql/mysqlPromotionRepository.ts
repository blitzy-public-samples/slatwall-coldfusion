/**
 * MySQL adapter for the promotion repository port.
 *
 * Ports `model/dao/PromotionDAO.cfc` - 593 lines, the largest and most intricate DAO in the slice,
 * mixed cfscript and `<cffunction>` tag syntax with embedded `<cfquery>` bodies - plus the single
 * query of `model/dao/RoundingRuleDAO.cfc`, which the port hosts here as its seventh method because
 * the port inventory is locked at thirteen and no `roundingRuleRepository` exists or may be
 * created. The EIGHTH method is a write, `saveRoundingRule` - the persistence half of
 * `super.save(argumentcollection=arguments)` [model/service/RoundingRuleService.cfc:L63] - hosted
 * here for the same reason the lookup is, and it is the only statement in this file that mutates
 * anything. It is named in this opening paragraph deliberately: an adapter header that reads as
 * read-only while the class below issues an INSERT and an UPDATE misdescribes the file.
 *
 * Three things this adapter owns that nothing else does. THE ABSENT RESULT ORDERING of
 * `getActivePromotionRewards` [model/dao/PromotionDAO.cfc:L51-L132], which the whole 593-line DAO
 * never supplies, is load-bearing for the discount math - see the marker on the method. THE THREE
 * COMMA-LISTS - `rewardTypeList`, `promotionCodeList` and the derived `noQualRequiredList` - are
 * each expanded to one bound parameter per element with an explicit empty-list short-circuit,
 * because `IN ()` does not parse. THE ROUNDING-RULE LOOKUP, method 7.
 *
 * LEGACY-NOTE [model/dao/PromotionDAO.cfc:L298-L591]: three locators quoted here disagree with the
 * planning notes and were re-verified against the source. The `model/entity/PromotionReward.cfc`
 * component declaration - and with it the misspelled
 * `hb_permission="promotionPeriod.promtionRewards"` - is at L57, not L49, and `amount` is at L61
 * declaring no `default`. `getSalePricePromotionRewardsQuery` closes at L591 while the component
 * closes at L593, and its inclusive date comparisons are at L317 and L319, not L311 and L313.
 *
 *   1. THE ABSENT RESULT ORDERING of `getActivePromotionRewards`
 *      [model/dao/PromotionDAO.cfc:L51-L132]. A case-insensitive search for "order by" across the
 *      whole 593-line DAO returns nothing. That absence is load-bearing for the discount math and
 *      is preserved verbatim - see the marker on the method.
 *   2. THE THREE COMMA-LISTS - `rewardTypeList`, `promotionCodeList` and the derived
 *      `noQualRequiredList` - each expanded to one bound parameter PER ELEMENT, each with an
 *      explicit empty-list short-circuit because `IN ()` does not parse.
 *   3. THE ROUNDING-RULE LOOKUP, hosted here as method 7.
 *
 * The query-of-queries rewrite, the six-branch union and the only in-scope dialect fragment for
 * materialized-path matching live in the two sibling statement modules this file imports; they are
 * not re-authored here.
 *
 * LOCATOR DRIFT, RECORDED RATHER THAN TRUSTED
 * Every locator quoted in this file was re-verified against the source while porting, because the
 * planning notes carry two drifts:
 *
 *   * `model/entity/PromotionReward.cfc` - the persistent component declaration, and with it the
 *     misspelled `hb_permission="promotionPeriod.promtionRewards"` attribute, is at L57, not the
 *     L49 the plan cites. `amount` is at L61 and declares NO `default`.
 *   * `getSalePricePromotionRewardsQuery` - the plan cites L298-L591. L591 is where the
 *     `</cffunction>` tag closes; L593 is where `</cfcomponent>` closes. Both readings appear in
 *     the planning material, so both are stated here and the function's own span is cited as
 *     L298-L591 throughout.
 *   * the sale-price pre-query's INCLUSIVE date comparisons - the plan cites L311 and L313. Those
 *     two lines hold `promotionPeriodID` and `FROM`; the `<=` and `>=` tests are at L317 and L319,
 *     and the `cf_sql_bit` active-flag bind the plan places at L321 is there. L317 and L319 are
 *     cited throughout, and the offset is +6 lines against the planning note.
 *
 * FETCH SHAPE (T3) - THE SUMMARY; EACH METHOD RESTATES ITS OWN DECISION
 * Hibernate lazy loading has no equivalent in a driver-only stack and is deliberately NOT
 * simulated: there is no proxy, no deferred loader and no on-access fetch anywhere in this file.
 * Associations are materialized at this boundary, and what is materialized is an explicit decision
 * recorded at every one of the seven READ methods. The eighth method, `saveRoundingRule`, is a WRITE
 * and materializes nothing - it has no fetch shape to decide, which is why the count in this
 * sentence is seven where the class implements eight. Materialization here is BOUNDED: the number of
 * statements a call issues is fixed by the call's shape, never by the number of rows it returned,
 * so no method walks a result set issuing one lookup per row.
 *
 * ALL TWENTY-SEVEN LINK COLLECTIONS ARE MATERIALIZED FROM HERE
 * `PromotionReward` declares fourteen many-to-many collections
 * [model/entity/PromotionReward.cfc:L74-L90] and `PromotionQualifier` declares thirteen
 * [model/entity/PromotionQualifier.cfc:L73-L87], hanging off the abbreviated physical bases
 * `SwPromoReward` and `SwPromoQual`. This adapter materializes EVERY one of them by bounded keyed
 * link queries - twenty-seven statements, each keyed by the whole owner set at once - because
 * nothing else populates them on a reward or qualifier that this adapter returns.
 *
 * Six of them hold OUT-OF-SCOPE entities reduced to opaque identifiers: fulfillment methods,
 * shipping methods and shipping address zones, three on each owner. The remaining twenty-one hold
 * `Sku`, `Product`, `ProductType`, `Brand`, `Option` and `PriceGroup` members, and each of those is
 * built as an IDENTITY-COMPLETE PROJECTION - the member's own identifier and nothing else. That is
 * exactly what the eleven membership predicates read, and it needs no collaborator port, so this
 * adapter never has to know how another aggregate's ports are wired. The full argument, including
 * why an earlier revision left the twenty-one empty on ownership grounds and why that was wrong,
 * sits with the link descriptors under "WHY ALL TWENTY-SEVEN".
 *
 * A projection is a membership token, never a substitute for a hydrated aggregate: the catalog and
 * price-group adapters remain the only owners of full `Sku`, `Product`, `ProductType`, `Brand`,
 * `Option` and `PriceGroup` hydration, and the composition root is where the promotion service
 * meets them. `src/repositories/mysql/mysqlProductTypeRepository.ts` reaches its own decision about
 * its own six many-to-many sets, and this file no longer claims to share it.
 *
 * `PromotionCode.orders` is never materialized either [model/entity/PromotionCode.cfc:L68] - see
 * the note on the two code counts for why an aggregate join over it is nonetheless legitimate.
 *
 * TEST COVERAGE IS NET-NEW, AND IS NOT PRESENTED AS PARITY
 * `meta/tests/unit/dao/` holds exactly two components, `AccountDAOTest` and `PaymentDAOTest`;
 * neither is in scope and there is no legacy `PromotionDAOTest` or `RoundingRuleDAOTest` to trace
 * to. Every obligation this file states for a test suite is therefore NET-NEW coverage. The
 * obligations, ONE OF WHICH IS NOW AUTHORED: assert the emitted statement text and the bound
 * parameter array for all eight methods against a capturing executor with no live database - the
 * seven reads remain unauthored, while the eighth, `saveRoundingRule`, IS covered, by
 * `tests/integration/repositories/mysqlPromotionRepositoryRoundingRuleWrite.test.ts`, across both
 * its INSERT and its UPDATE path. The remaining obligations, stated here and not authored here:
 * exercise multi-element, single-element and EMPTY `rewardTypeList` / `promotionCodeList` /
 * `noQualRequiredList`; exercise a PRESENT but empty-string `productID` against the sale-price
 * statement; assert `undefined` rather than a throw for an unknown rounding-rule identifier; and
 * assert that no ordering clause is emitted for the active-reward read and no row limit for the
 * sale-price join-back.
 *
 * `PromotionService.updateOrderAmountsWithPromotions` reads price-group state that
 * `PriceGroupService.updateOrderAmountsWithPriceGroups` produces
 * [model/service/PromotionService.cfc:L241-L254]. Sequencing the two passes is not this
 * repository's job: nothing below orders them, guards their order, or reads price-group state.
 *
 * @see model/dao/PromotionDAO.cfc - the ported DAO; its query bodies are the source of truth
 * @see model/dao/RoundingRuleDAO.cfc - the single-declaration DAO whose lookup is method 7
 * @see slatwall-ts/src/domain/ports/promotionRepository.ts - the contract, authoritative on shape
 */

// The six member entity types the twenty-one catalog link tables project onto. These are VALUE
// imports because this adapter constructs identity-complete membership tokens of each - see the
// fetch-shape block for why all twenty-seven collections are materialized here and why an identity
// projection is the right shape. Every one of these modules imports its own siblings with `import
// type` only, so nothing here introduces a runtime import cycle.
import { Brand } from '../../domain/entities/brand.js';
import { Option } from '../../domain/entities/option.js';
import { PriceGroup } from '../../domain/entities/priceGroup.js';
import { Product } from '../../domain/entities/product.js';
import { ProductType } from '../../domain/entities/productType.js';
import { Sku } from '../../domain/entities/sku.js';
import { Promotion } from '../../domain/entities/promotion.js';
import type { PromotionCode } from '../../domain/entities/promotionCode.js';
import { PromotionPeriod } from '../../domain/entities/promotionPeriod.js';
import { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type { RewardMatchingType } from '../../domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../domain/entities/promotionReward.js';
import type { AmountType, ApplicableTerm } from '../../domain/entities/promotionReward.js';
import { randomUUID } from 'node:crypto';
import { RoundingRule } from '../../domain/entities/roundingRule.js';
import type {
  PromotionRepository,
  SalePricePromotionRewardRow,
} from '../../domain/ports/promotionRepository.js';
import { Money } from '../../domain/valueObjects/money.js';
import { listAppend, listFindNoCase, listToArray } from '../../lib/cfml/list.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from './connection.js';
import { sqlPlaceholderList } from './connection.js';
import type { UseCountStatement } from './sql/promotionUseCounts.sql.js';
import { PROMOTION_USE_COUNT_STATEMENTS } from './sql/promotionUseCounts.sql.js';
import { buildSalePricePromotionRewardsStatement } from './sql/salePricePromotionRewards.sql.js';

// ---------------------------------------------------------------------------
// Collaborator contracts this adapter needs and cannot import
// ---------------------------------------------------------------------------

/**
 * The rounding collaborator a hydrated `RoundingRule` is constructed with.
 *
 * JUDGMENT CALL: declared module-locally and un-exported because
 * `src/domain/entities/roundingRule.ts` declares its second constructor argument's interface
 * module-locally too and does not export it - there is no name to import, and the entity is
 * satisfied STRUCTURALLY. The single method is the SERVICE-tier arithmetic
 * `roundValueByRoundingRule` [model/service/RoundingRuleService.cfc:L84]; this adapter never rounds
 * anything.
 */
interface RoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

// ---------------------------------------------------------------------------
// Failure reporting
//
// Two fault types, each with an explicit `name` and an unexported constructor, following the
// sibling adapters: one says the RESULT SET and this adapter disagree, the other that a caller
// handed in an ENTITY the legacy body would have dereferenced through a null. NO MESSAGE EVER
// ECHOES A REJECTED VALUE - only the column, the statement that produced it and the JavaScript type
// appear.
// ---------------------------------------------------------------------------

/**
 * A result-set column that is absent, or present with a shape this adapter cannot read.
 *
 * The two faults are kept apart by the readers below: an absent column means the statement and this
 * file disagree about the projection, while an unreadable value means the schema or the driver
 * configuration moved underneath the adapter. Both are reported, never absorbed.
 */
class PromotionColumnError extends Error {
  public constructor(columnName: string, statementLabel: string, detail: string) {
    super(`column "${columnName}" of ${statementLabel}: ${detail}`);
    this.name = 'PromotionColumnError';
  }
}

/**
 * An entity argument arrived without an association the legacy body dereferences.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L138,L193]: both period use-count functions bind
 * `arguments.promotionPeriod.getPromotion().getPromotionID()` with no null guard, so a period whose
 * promotion is not loaded raises inside the DAO. That failure is REPRODUCED rather than smoothed:
 * returning `0` would report "never used", which the engine compares against a maximum use count
 * [model/service/PromotionService.cfc:L567] and would read as "the reward may still be applied". A
 * wrong count changes money; a raised fault does not.
 */
class PromotionAssociationError extends Error {
  public constructor(entityName: string, associationName: string, methodName: string) {
    super(
      `${methodName} requires ${entityName}.${associationName} to be materialized, and it is absent`,
    );
    this.name = 'PromotionAssociationError';
  }
}

// ---------------------------------------------------------------------------
// Closed-union narrowers
//
// Three columns feed a narrowed union on an ENTITY and two feed one on the port's row projection,
// and the two groups are treated differently on purpose. `amountType`, `applicableTerm` and
// `rewardMatchingType` are `ormtype="string"` with no constraint and no validation rule narrowing
// them [model/entity/PromotionReward.cfc:L62,L64; model/entity/PromotionQualifier.cfc:L65], so an
// unrecognized value is a REACHABLE persisted state that the legacy discount switch
// [model/service/PromotionService.cfc:L992-L1002] falls through to no discount at all - which
// mapping to `undefined` reproduces. `discountLevel` and `salePriceDiscountType` come from our own
// statement, so an unrecognized value there means the statement changed shape and is REPORTED.
// ---------------------------------------------------------------------------

/**
 * The three `amountType` values, from `getAmountTypeOptions()`
 * [model/entity/PromotionReward.cfc:L120-L133]. All three are listed even though that method
 * returns only the first two when the reward type is `order`
 * [model/entity/PromotionReward.cfc:L121-L125]: the narrowing is over what the COLUMN may hold, and
 * the column is one `ormtype="string"` shared by every reward type.
 */
const AMOUNT_TYPES: readonly AmountType[] = Object.freeze(['percentageOff', 'amountOff', 'amount']);

/** The three `applicableTerm` values [model/entity/PromotionReward.cfc:L112-L118]. */
const APPLICABLE_TERMS: readonly ApplicableTerm[] = Object.freeze(['both', 'initial', 'renewal']);

/** The five `rewardMatchingType` values [model/entity/PromotionQualifier.cfc:L107-L115]. */
const REWARD_MATCHING_TYPES: readonly RewardMatchingType[] = Object.freeze([
  'any',
  'sku',
  'product',
  'productType',
  'brand',
]);

/** The six discount levels the sale-price statement emits, one literal per UNION branch. */
const DISCOUNT_LEVELS: readonly SalePricePromotionRewardRow['discountLevel'][] = Object.freeze([
  'sku',
  'product',
  'brand',
  'option',
  'productType',
  'global',
]);

/** The three amount types the sale-price `CASE` expression can match. */
const SALE_PRICE_DISCOUNT_TYPES: readonly SalePricePromotionRewardRow['salePriceDiscountType'][] =
  Object.freeze(['amount', 'amountOff', 'percentageOff']);

/**
 * Narrow a persisted string against a vocabulary, mapping anything else to absence.
 *
 * CFML parity [model/service/PromotionService.cfc:L992-L1002]: the legacy amount-type switch has no
 * `default` arm, so an unrecognized value produces no discount rather than a failure. Returning
 * `undefined` routes an unrecognized value into exactly the branch the entity already reserves for
 * an absent one.
 *
 * THE MATCH FOLDS CASE; THE RETURNED VALUE DOES NOT. CFML's `switch`/`case` on a string is
 * case-INSENSITIVE, so `'AmountOff'` matches `case 'amountOff'` in the legacy engine, and this
 * function reproduces that: membership is decided through {@link cfEquals}. An earlier revision of
 * this file compared with `===` and justified it on the grounds that the vocabularies come from the
 * admin form's own option lists. That reasoning was wrong, and the correction matters because of
 * what the fall-through costs: `SwPromoReward.amountType` is `ormType="string"` with NO check
 * constraint [model/entity/PromotionReward.cfc:L62], so a differently-cased value CAN sit in the
 * column - written by a data import, a direct SQL fix or an older admin build - and an exact
 * comparison mapped it to absence, which [model/service/PromotionService.cfc:L1003] then turns into
 * a SILENT ZERO DISCOUNT. The customer is charged full price for a promotion that should have
 * applied, and nothing reports it.
 *
 * WHAT IS RETURNED IS THE PERSISTED SPELLING, NOT THE VOCABULARY MEMBER. This is the whole point of
 * the design and it is the reason this function does not simply answer `vocabulary.find(...)`. The
 * value handed back is `value` itself - the exact bytes the column held - so nothing downstream can
 * launder a canonical spelling back over the stored one. Consumers are the ones that fold case; see
 * the module-local matcher in `src/services/promotion/discountAmount.ts` and the fold at
 * `src/domain/entities/promotionReward.ts`. The invariant across the whole slice is a single
 * sentence: AN ENTITY'S DISCRIMINATOR HOLDS EXACTLY WHAT THE COLUMN HELD, AND EVERY COMPARISON
 * AGAINST IT FOLDS CASE.
 *
 * The cast is the price of that invariant and is confined to this one expression. It is sound in the
 * sense the vocabulary establishes - the value has been PROVEN to match a member up to case - and
 * unsound only in the letter, because `'AMOUNTOFF'` is not literally assignable to the union. No
 * alternative avoids it: widening the entity fields to `string` would reopen closed unions across
 * eighteen entities, and returning the member would rewrite stored text.
 *
 * @param value the persisted value, or `undefined` for a NULL column.
 * @param vocabulary the permitted values, in source order.
 * @returns the value AS PERSISTED when it matches a vocabulary member up to case, or `undefined`
 *   when the column is NULL or holds something outside the vocabulary.
 */
function narrowOrAbsent<T extends string>(
  value: string | undefined,
  vocabulary: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  const matches = vocabulary.some((candidate): boolean => cfEquals(candidate, value));

  return matches ? (value as T) : undefined;
}

/**
 * Narrow a value this adapter's own statement produced, reporting anything else.
 *
 * THE MATCH FOLDS CASE, AND FOR ONE OF THE TWO CALLERS THAT IS NOT COSMETIC. The two call sites do
 * not have the same provenance, which is easy to miss:
 *
 * - `discountLevel` really is a literal this module authored. Each UNION branch emits
 *   `'${discountLevel}'` directly [see `discountBranchProjection` in
 *   `./sql/salePricePromotionRewards.sql.ts`], so it is canonical by construction and the fold can
 *   never change its outcome. Folding it anyway costs nothing and keeps ONE helper for both callers.
 * - `salePriceDiscountType` is NOT a literal. The same projection emits
 *   `${rewardAlias}.amountType as salePriceDiscountType` - the RAW PERSISTED TEXT of
 *   `SwPromoReward.amountType`, a column with no check constraint.
 *
 * That second case is a live fault an exact comparison caused, and the shape of it is worth stating
 * precisely because it is the opposite of the usual story. MySQL's default `utf8mb4_unicode_ci`
 * collation is CASE-INSENSITIVE, so the adjacent `CASE ... WHEN 'amountOff' ...` in the very same
 * SELECT list MATCHES a row holding `'AMOUNTOFF'` and computes `salePrice` CORRECTLY. The database
 * got it right; the adapter then threw the answer away. With an exact comparison here a single
 * case-variant row raised `PromotionColumnError` and failed the ENTIRE sale-price read for the
 * product - not one row, all of them - reporting statement drift that had not occurred. Folding case
 * is what lets this adapter accept the correct sale price the database already computed.
 *
 * The throw is RETAINED for a value in no vocabulary member even up to case, because for
 * `discountLevel` that genuinely does mean this file and the statement have drifted apart. As in
 * {@link narrowOrAbsent}, the value returned is the PERSISTED spelling rather than the vocabulary
 * member, so no canonical spelling can be laundered back over stored text.
 *
 * @param value the projected value.
 * @param vocabulary the values the statement can emit.
 * @param columnName the column being narrowed, for the fault message.
 * @param statementLabel which statement produced the row.
 * @returns the value AS PROJECTED, once it has matched a vocabulary member up to case.
 * @throws An error named `PromotionColumnError` when the value matches no vocabulary member even
 *   with case folded, which means the statement and this file have drifted apart.
 */
function narrowOrReport<T extends string>(
  value: string,
  vocabulary: readonly T[],
  columnName: string,
  statementLabel: string,
): T {
  const matches = vocabulary.some((candidate): boolean => cfEquals(candidate, value));

  if (!matches) {
    throw new PromotionColumnError(
      columnName,
      statementLabel,
      'the value is outside the vocabulary this statement emits, so the statement and this adapter have drifted apart',
    );
  }

  return value as T;
}

// ---------------------------------------------------------------------------
// Statement labels
//
// Each label names the statement AND cites the legacy locator it ports, so a fault message points
// at the CFML it came from - the only place here where a locator appears in a runtime string.
// ---------------------------------------------------------------------------

/** Method 1. */
const ACTIVE_REWARDS_STATEMENT_LABEL =
  'the active promotion reward read [model/dao/PromotionDAO.cfc:L51-L132]';

/** The three reward link reads that satisfy method 1's opaque-identifier collections. */
const REWARD_LINK_STATEMENT_LABEL =
  'a promotion reward link read [model/entity/PromotionReward.cfc:L76-L78]';

/** The eleven reward link reads that satisfy method 1's catalog-typed collections. */
const REWARD_CATALOG_LINK_STATEMENT_LABEL =
  'a promotion reward catalog link read [model/entity/PromotionReward.cfc:L74, L80-L90]';

/** The qualifier read that satisfies method 1's period association. */
const PERIOD_QUALIFIER_STATEMENT_LABEL =
  'the promotion qualifier read [model/entity/PromotionPeriod.cfc:L63]';

/** The three qualifier link reads. */
const QUALIFIER_LINK_STATEMENT_LABEL =
  'a promotion qualifier link read [model/entity/PromotionQualifier.cfc:L73-L75]';

/** The ten qualifier link reads that satisfy the catalog-typed collections. */
const QUALIFIER_CATALOG_LINK_STATEMENT_LABEL =
  'a promotion qualifier catalog link read [model/entity/PromotionQualifier.cfc:L77-L87]';

/** Methods 2 and 3. */
const PERIOD_USE_COUNT_STATEMENT_LABEL =
  'a promotion period use-count read [model/dao/PromotionDAO.cfc:L134-L252]';

/** Methods 4 and 5. */
const CODE_USE_COUNT_STATEMENT_LABEL =
  'a promotion code use-count read [model/dao/PromotionDAO.cfc:L254-L296]';

/** Method 6. */
const SALE_PRICE_STATEMENT_LABEL =
  'the sale-price promotion reward read [model/dao/PromotionDAO.cfc:L298-L591]';

/** Method 7. */
const ROUNDING_RULE_STATEMENT_LABEL =
  'the rounding rule read [model/dao/RoundingRuleDAO.cfc:L51-L67]';

// ---------------------------------------------------------------------------
// Column readers
//
// CFML parity [model/entity/PromotionReward.cfc:L65-L66]: CFML identifiers are case-INSENSITIVE,
// which is why those two adjacent lines can declare `ormType="integer"` and `ormtype="integer"` and
// mean the same thing. TypeScript property access is case-SENSITIVE, so every reader below folds
// the LABEL before comparing it; no stored value is ever case-folded.
//
// Every reader takes the row, the column label in any casing, and the label of the statement that
// produced the row for use in fault messages. Each returns the typed value, maps SQL NULL to
// `undefined` where its own note says so, and raises `PromotionColumnError` for an absent column or
// a shape it cannot read. Only decisions NOT implied by that shared contract are documented below.
// ---------------------------------------------------------------------------

/** Either a column of that name was present - possibly holding SQL NULL - or it was not. */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/** Case-fold an identifier for use as a comparison operand only. Never used as a bound value. */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * Look for one column of a row without assuming the driver's casing. Present - including when the
 * cell holds SQL NULL - or absent.
 */
function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  const foldedName = foldIdentifier(columnName);

  for (const [label, value] of Object.entries(row)) {
    if (foldIdentifier(label) === foldedName) {
      return { found: true, value };
    }
  }

  return { found: false };
}

/**
 * Read one column the statement is required to have selected.
 *
 * The ABSENCE of a column and a NULL VALUE in it are different faults: this raises for the first
 * and hands back `null` for the second, leaving the nullability decision to the typed reader that
 * called it.
 */
function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new PromotionColumnError(
      columnName,
      statementLabel,
      'the result set has no column of that name',
    );
  }

  return lookup.value;
}

/** Names the shape of a rejected column value without revealing the value itself. */
function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'SQL NULL';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  if (value instanceof Date) {
    return 'an invalid Date';
  }

  if (value instanceof Uint8Array) {
    return 'a byte buffer';
  }

  return `a ${typeof value}`;
}

/**
 * Read a column holding an identifier: present, not null, and text.
 *
 * Every in-scope primary key is `ormtype="string" length="32"`
 * [model/entity/PromotionReward.cfc:L60], so a non-string means the statement or the schema moved,
 * and the read says so rather than coercing.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'string') {
    return value;
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `an identifier column must arrive as text and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable text column, mapping SQL NULL to absence.
 *
 * SQL NULL becomes `undefined` and NEVER the empty string, and the distinction is load-bearing:
 * `unsavedvalue=""` gives the empty string the specific meaning "not yet persisted" on every
 * in-scope entity [model/entity/PromotionReward.cfc:L60], and `PromotionCode.preInsert` exists
 * precisely to repair a null code. Substituting `''` for NULL would change entity behaviour.
 */
function readOptionalText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a text column must arrive as text or SQL NULL and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `big_decimal` money column as `Money`.
 *
 * THE VALUE MUST ARRIVE AS A STRING AND IS NEVER COERCED THROUGH `Number`.
 * `src/repositories/mysql/connection.ts` deliberately leaves the driver's `decimalNumbers` option
 * unset, which is what makes a `DECIMAL` column arrive as a decimal string; handing that string
 * straight to `Money` is the whole mechanism by which currency arithmetic here carries no IEEE-754
 * drift. A number means that option was turned on, and surfacing the change beats absorbing it.
 *
 * SQL NULL BECOMES `undefined`, NEVER `Money.zero`. Neither `PromotionReward.amount`
 * [model/entity/PromotionReward.cfc:L61] nor `PromotionApplied.discountAmount`
 * [model/entity/PromotionApplied.cfc:L53] declares a `default`, and a substituted zero would
 * fabricate a real zero discount - a different fact from "no amount was recorded".
 */
function readOptionalMoney(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string') {
    return Money.fromDecimalString(value);
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a big_decimal column must arrive as a decimal string, which leaving decimalNumbers unset guarantees, and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a money column the row contract declares REQUIRED.
 *
 * Only the sale-price projection has such a column, and its requiredness is derived from the query
 * rather than assumed: the final step joins the reduced rows back to the per-SKU minimum on SKU and
 * sale price [model/dao/PromotionDAO.cfc:L584-L587], an equality predicate cannot match a null, and
 * `MIN` skips nulls - so no row whose sale price is null can reach the projection at all. A null
 * arriving here means the statement changed shape, and it is reported rather than mapped to
 * absence.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money {
  const amount = readOptionalMoney(row, columnName, statementLabel);

  if (amount === undefined) {
    throw new PromotionColumnError(
      columnName,
      statementLabel,
      'this projection cannot carry SQL NULL here, because the join-back compares the value for equality',
    );
  }

  return amount;
}

/**
 * Read a nullable `ormtype="integer"` column.
 *
 * `undefined` for SQL NULL, and never `0`. On every use-limit column in this slice - the three on
 * the reward [model/entity/PromotionReward.cfc:L65-L67] and the two on the period
 * [model/entity/PromotionPeriod.cfc:L55-L56] - `hb_nullRBKey="define.unlimited"` says outright that
 * absence means UNLIMITED, where a zero would mean no use is permitted at all. A `bigint` is
 * admitted because the driver may widen an integral column to one, and it is range-checked before
 * conversion; a string is REFUSED, since that would mean `bigNumberStrings` had been enabled, which
 * the pool deliberately does not set.
 */
function readOptionalInteger(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `an integer column must arrive as a finite number or an in-range bigint and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `big_decimal` column that is NOT money.
 *
 * JUDGMENT CALL: the two fulfillment-weight gates are `ormtype="big_decimal"` with
 * `hb_formatType="weight"` [model/entity/PromotionQualifier.cfc:L62-L63] and
 * `src/domain/entities/promotionQualifier.ts` types both `number`. A weight is not a monetary
 * value, so routing it through `Money` would misrepresent it - the single-arithmetic-surface
 * commitment is about CURRENCY - which is why this reader is separate from `readOptionalMoney`. No
 * arithmetic happens here.
 */
function readOptionalNonMonetaryDecimal(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a non-monetary decimal column must arrive as a finite number or a parseable decimal string and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `timestamp` column.
 *
 * The pool leaves `dateStrings` unset and fixes its session timezone, so a `datetime` arrives as a
 * `Date` already interpreted in UTC. A string is therefore REFUSED rather than parsed - a string
 * here means the pool's date handling changed underneath this adapter - and an invalid `Date` is
 * refused for the matching reason, since the pool refuses one at the BINDING boundary.
 *
 * `undefined` for SQL NULL is meaningful and must not become an epoch or the current moment:
 * `hb_nullRBKey="define.forever"` on both period bounds [model/entity/PromotionPeriod.cfc:L53-L54]
 * says absence means "no bound".
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a timestamp column must arrive as a valid Date and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a boolean column WITHOUT deciding its truth.
 *
 * THE RAW VALUE IS CARRIED THROUGH, NARROWED ONLY TO THE INPUT TYPE THE ENTITY ACCEPTS.
 * `cfBoolean()` is deliberately NOT called here: `Promotion` routes the raw persisted column
 * through `cfBoolean()` inside its own constructor, applying the ORM default `default="1"`
 * [model/entity/Promotion.cfc:L56] when the value is absent - so coercing here would collapse
 * absence into `false` before the entity could apply that default, and an active promotion would
 * silently stop matching. The coercion is genuinely ambiguous across the slice: the boolean default
 * literal is spelled `"1"` [model/entity/Promotion.cfc:L56], `"0"`
 * [model/entity/OptionGroup.cfc:L57] and the STRING `"false"` [model/entity/Product.cfc:L58], and
 * twelve of the eighteen in-scope entities declare none at all. NEVER `Boolean(value)`, `!!value`
 * or `value === 1` anywhere in this file.
 *
 * The `Uint8Array` arm is not defensive padding: Hibernate maps `ormtype="boolean"` to `bit(1)` and
 * the driver surfaces that as a one-byte buffer. An empty buffer carries no byte and is absence.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value[0];

    return firstByte === undefined ? undefined : firstByte;
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a boolean column must arrive as text, a number, a boolean or a BIT buffer and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read an aggregate count.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L184,L251,L270,L295]: all four legacy functions declare
 * `returntype="numeric"` and return `results[1]`, the single scalar the aggregate produced. That
 * numeric declaration is honest, and this adapter returns numbers.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L1094-L1100]: the SERVICE methods that forward
 * two of those counts declare `returntype="boolean"` over the same numeric value. The lie is purely
 * in the service tier - the DAO never told it - so it is recorded here and NOT reproduced: a
 * boolean return is not expressible over a count without discarding the value the callers compare
 * against a use limit.
 *
 * Preserved deliberately; do not fix without a product decision.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a count column must arrive as an integer and this one arrived as ${describeColumnType(value)}`,
  );
}

// ---------------------------------------------------------------------------
// Statement text - method 1
//
// The legacy body composes HQL over ENTITY names (`SlatwallPromotionReward`) and lets Hibernate
// resolve them to tables. There is no ORM here, so the text below names the PHYSICAL tables, and
// two of them are ABBREVIATED in the source: `SwPromoReward` [model/entity/PromotionReward.cfc:L57]
// and `SwPromoQual` [model/entity/PromotionQualifier.cfc:L49], NOT `SwPromotionReward` /
// `SwPromotionQualifier`. `SwPromotionPeriod` [model/entity/PromotionPeriod.cfc:L49], `SwPromotion`
// [model/entity/Promotion.cfc:L49], `SwPromotionCode` [model/entity/PromotionCode.cfc:L49] and
// `SwRoundingRule` [model/entity/RoundingRule.cfc:L49] are not. The four legacy HQL aliases are
// carried over verbatim - `spr`, `spp`, `sp`, and `c` inside the subqueries
// [model/dao/PromotionDAO.cfc:L65,L67,L69,L86,L90] - plus `srr` for the rounding-rule join this
// file adds, and every projected column is prefixed with its owning alias because four of the
// tables carry a `remoteID`, a `createdDateTime` and a `modifiedDateTime` apiece.
// ---------------------------------------------------------------------------

/**
 * Every column the reward hydration reads, aliased by owner.
 *
 * FETCH SHAPE for method 1: the two legacy `INNER JOIN FETCH` clauses
 * [model/dao/PromotionDAO.cfc:L66,L68] become two `INNER JOIN` clauses whose columns are projected
 * here, so `promotionPeriod` and `promotion` arrive fully materialized on every returned reward in
 * the SAME statement the rewards came from. `roundingRule` is added as a `LEFT JOIN` - LEFT, not
 * INNER, because `roundingRuleID` is nullable [model/entity/PromotionReward.cfc:L71] and an INNER
 * join would silently drop every reward that has no rounding rule, which is most of them.
 */
const ACTIVE_REWARD_PROJECTION = `SELECT
    spr.promotionRewardID as spr_promotionRewardID,
    spr.amount as spr_amount,
    spr.amountType as spr_amountType,
    spr.rewardType as spr_rewardType,
    spr.applicableTerm as spr_applicableTerm,
    spr.maximumUsePerOrder as spr_maximumUsePerOrder,
    spr.maximumUsePerItem as spr_maximumUsePerItem,
    spr.maximumUsePerQualification as spr_maximumUsePerQualification,
    spr.remoteID as spr_remoteID,
    spr.createdDateTime as spr_createdDateTime,
    spr.createdByAccountID as spr_createdByAccountID,
    spr.modifiedDateTime as spr_modifiedDateTime,
    spr.modifiedByAccountID as spr_modifiedByAccountID,
    spp.promotionPeriodID as spp_promotionPeriodID,
    spp.startDateTime as spp_startDateTime,
    spp.endDateTime as spp_endDateTime,
    spp.maximumUseCount as spp_maximumUseCount,
    spp.maximumAccountUseCount as spp_maximumAccountUseCount,
    spp.promotionID as spp_promotionID,
    spp.remoteID as spp_remoteID,
    spp.createdDateTime as spp_createdDateTime,
    spp.createdByAccountID as spp_createdByAccountID,
    spp.modifiedDateTime as spp_modifiedDateTime,
    spp.modifiedByAccountID as spp_modifiedByAccountID,
    sp.promotionID as sp_promotionID,
    sp.promotionName as sp_promotionName,
    sp.promotionSummary as sp_promotionSummary,
    sp.promotionDescription as sp_promotionDescription,
    sp.activeFlag as sp_activeFlag,
    sp.defaultImageID as sp_defaultImageID,
    sp.remoteID as sp_remoteID,
    sp.createdDateTime as sp_createdDateTime,
    sp.createdByAccountID as sp_createdByAccountID,
    sp.modifiedDateTime as sp_modifiedDateTime,
    sp.modifiedByAccountID as sp_modifiedByAccountID,
    srr.roundingRuleID as srr_roundingRuleID,
    srr.roundingRuleName as srr_roundingRuleName,
    srr.roundingRuleExpression as srr_roundingRuleExpression,
    srr.roundingRuleDirection as srr_roundingRuleDirection,
    srr.createdDateTime as srr_createdDateTime,
    srr.createdByAccountID as srr_createdByAccountID,
    srr.modifiedDateTime as srr_modifiedDateTime,
    srr.modifiedByAccountID as srr_modifiedByAccountID`;

/**
 * The join chain, porting the legacy HQL [model/dao/PromotionDAO.cfc:L64-L69].
 *
 * HQL infers each join condition from the association metadata; SQL does not, so the two foreign
 * keys are written out - `spr.promotionPeriodID` [model/entity/PromotionReward.cfc:L70] and
 * `spp.promotionID` [model/entity/PromotionPeriod.cfc:L59]. Both stay INNER, which is
 * behaviour-preserving: a reward whose period is missing, or whose period's promotion is missing,
 * is excluded by the legacy query too.
 */
const ACTIVE_REWARD_FROM = `FROM
    SwPromoReward spr
  INNER JOIN
    SwPromotionPeriod spp on spr.promotionPeriodID = spp.promotionPeriodID
  INNER JOIN
    SwPromotion sp on spp.promotionID = sp.promotionID
  LEFT JOIN
    SwRoundingRule srr on spr.roundingRuleID = srr.roundingRuleID`;

/**
 * The base predicate: reward type, the two period date bounds, and the promotion's active flag,
 * porting the legacy HQL `WHERE` clause [model/dao/PromotionDAO.cfc:L70-L77].
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L73,L75]: THE DATE COMPARISONS ARE STRICT - `<` and `>`,
 * NOT `<=` and `>=`. A period that starts at exactly the compared instant does not yet apply, and
 * one that ends at exactly that instant no longer does. THE SALE-PRICE PATH USES THE OPPOSITE
 * OPERATORS at [model/dao/PromotionDAO.cfc:L317,L319] and in all six of its UNION branches, so the
 * two paths genuinely disagree about the boundary instant and NEITHER IS NORMALIZED TO THE OTHER.
 *
 * Both bounds are null-tolerant, which is what `hb_nullRBKey="define.forever"`
 * [model/entity/PromotionPeriod.cfc:L53-L54] means: an absent bound is no bound.
 */
function activeRewardBaseWhereClause(rewardTypePlaceholders: string): string {
  return `WHERE
    spr.rewardType IN (${rewardTypePlaceholders})
  and
    (spp.startDateTime is null or spp.startDateTime < ?)
  and
    (spp.endDateTime is null or spp.endDateTime > ?)
  and
    sp.activeFlag = ?`;
}

/**
 * The promotion-qualifier existence test that opens the optional qualification block
 * [model/dao/PromotionDAO.cfc:L86]. The legacy HQL association path
 * `pq.promotionPeriod.promotionPeriodID` is the foreign key column itself, so it becomes
 * `pq.promotionPeriodID` with no join added. Binds nothing.
 */
const QUALIFIER_EXISTS_CLAUSE = ` AND ( EXISTS ( SELECT pq.promotionQualifierID FROM SwPromoQual pq WHERE pq.promotionPeriodID = spp.promotionPeriodID )`;

/**
 * The promotion-code existence test, emitted in TWO different places by the legacy body -
 * [model/dao/PromotionDAO.cfc:L90], and again identically at L110.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L116-L127]: THE LEGACY BINDS ONE NAMED PARAMETER SET FOR
 * BOTH OCCURRENCES. HQL named parameters are bound once by name and reused wherever the name
 * appears, whereas a positional `?` is bound once per occurrence - so when both occurrences are
 * emitted this adapter binds the code list twice and the instant four times where the legacy bound
 * each once. THE MATCHED ROW SET IS IDENTICAL; only the transport differs.
 *
 * The strict date operators are the base clause's. The clause binds the code elements and then the
 * instant twice, in that order.
 */
function promotionCodeExistsClause(codePlaceholders: string): string {
  return ` OR EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID AND c.promotionCode IN (${codePlaceholders}) AND (c.startDateTime is null or c.startDateTime < ?) AND (c.endDateTime is null or c.endDateTime > ?) )`;
}

/**
 * The alternative that lets order-level and fulfillment-level rewards through without a qualifier
 * [model/dao/PromotionDAO.cfc:L95].
 */
function noQualificationRequiredClause(placeholders: string): string {
  return ` OR spr.rewardType IN (${placeholders})`;
}

/**
 * The unconditional promotion-code gate that closes every form of this statement
 * [model/dao/PromotionDAO.cfc:L103-L106]. Read together with the `OR EXISTS` that may follow it:
 * the promotion has no codes at all, or one of the supplied codes is currently valid for it. Binds
 * nothing.
 */
const NO_PROMOTION_CODE_CLAUSE = ` AND ( NOT EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID )`;

/** Closes an opened `AND (` group [model/dao/PromotionDAO.cfc:L99, L114]. */
const CLOSE_GROUP_CLAUSE = ' )';

// ---------------------------------------------------------------------------
// Statement text - the bounded collection reads that complete method 1's graph
//
// FETCH SHAPE, stated once and referenced from method 1. `PromotionReward` declares FOURTEEN
// many-to-many collections [model/entity/PromotionReward.cfc:L74-L90] and `PromotionQualifier`
// declares THIRTEEN [model/entity/PromotionQualifier.cfc:L73-L87]. This adapter materializes ALL
// TWENTY-SEVEN of them, and it does so with TWENTY-SEVEN statements keyed by the whole set of owner
// identifiers at once, so the number of statements per invocation is FIXED by the call's shape and
// does not grow with the number of rows returned. Per-row lookups are not used anywhere in this
// file.
//
// WHY ALL TWENTY-SEVEN, AND NOT JUST THE SIX OPAQUE-IDENTIFIER ONES
// An earlier revision of this adapter materialized only the six collections whose members are
// out-of-scope entities reduced to opaque identifiers - fulfillment methods, shipping methods and
// shipping address zones, three on each owner - and deferred the remaining eleven reward and ten
// qualifier collections to the catalog and price-group adapters on OWNERSHIP grounds. That reasoning
// was wrong, and the way it was wrong changed money:
//
//   * The deferral had no mechanism behind it. Nothing else populates those collections on a reward
//     or qualifier that THIS method returns - the catalog adapters hydrate `Sku`, `Product`,
//     `ProductType`, `Brand`, `Option` and `PriceGroup` as aggregate ROOTS, never as members of a
//     promotion's include/exclude sets - so the entity constructors' `?? []` defaults were the final
//     answer rather than a placeholder.
//   * An empty include set and a configured include set are NOT the same promotion. The engine's
//     membership predicates are `hasBrand`, `hasOption`, `hasSku`, `hasProduct`,
//     `hasProductType` and their five `hasExcluded*` counterparts
//     [src/domain/entities/promotionReward.ts, src/domain/entities/promotionQualifier.ts], consumed
//     from `src/services/promotion/orderItemMembership.ts`. With every collection empty, a
//     brand-targeted or product-targeted promotion QUALIFIES NOTHING and an exclusion EXCLUDES
//     NOTHING - so a reward that should have discounted one brand discounts none, and a reward that
//     should have skipped one SKU discounts it.
//   * `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74] is read on the pricing arm at
//     [model/service/PromotionService.cfc:L241-L252] through `hasEligiblePriceGroup`. Empty there
//     means every price-group-eligible item takes the wrong discount base.
//
// The owning entities already document this adapter as the owner of exactly this work:
// `src/domain/entities/promotionQualifier.ts` assigns it "materializing the ten in-scope collections
// from SwPromoQualBrand ... SwPromoQualExclProductType" by name, and
// `src/domain/entities/promotionReward.ts` assigns it "the fourteen link-table reads". This file now
// agrees with them.
//
// WHAT IS MATERIALIZED IS AN IDENTITY-COMPLETE PROJECTION, NOT A FULL AGGREGATE
// Each member entity is constructed from its link row's identifier and nothing else. That is
// sufficient and it is deliberate:
//
//   * SUFFICIENT - every one of the eleven predicates compares ONE accessor:
//     `held.getBrandID() === candidateID` and its five siblings, plus
//     `configuredProductType.getProductTypeID()` for the materialized-path walk in
//     `productTypeIdPathIntersects`. No predicate reads a name, a price, a flag, a path or any
//     association of a configured member. Fetching more would be fetching what nothing reads.
//   * DELIBERATE - a full `Sku` or `Product` needs injected collaborator ports under transformation
//     rule T2, and this adapter has no business wiring another aggregate's collaborators. The
//     identity projection needs none, so the ownership concern that motivated the earlier deferral
//     is answered without leaving the collections empty. The projections are membership TOKENS, and
//     the accessor each predicate reads is the only thing they promise.
//
// A projection is therefore never a substitute for a hydrated aggregate. Nothing downstream may read
// anything but the identifier off a member of these collections, and each of the six factories
// restates that promise at its own declaration.
//
// AN EMPTY COLLECTION NOW MEANS THE DATABASE HAS NO LINKS
// Before this change an empty array was ambiguous - "not fetched" and "none configured" were
// indistinguishable. They are now distinct: every collection is read, so `[]` means the link table
// held no row for that owner. That is the honest answer and the engine's predicates already treat it
// correctly, matching the CFML, where an unconfigured many-to-many simply yields an empty array.
// ---------------------------------------------------------------------------

/** One many-to-many link table, described by the three names the entity metadata supplies. */
interface LinkTableDescriptor {
  /** The physical link table [model/entity/PromotionReward.cfc:L76 `linktable`]. */
  readonly table: string;

  /** The owning-side foreign key [`fkcolumn`]. */
  readonly ownerColumn: string;

  /** The member-side foreign key [`inversejoincolumn`]. */
  readonly memberColumn: string;
}

/**
 * `fulfillmentMethods` [model/entity/PromotionReward.cfc:L76]. `FulfillmentMethod` is out of scope,
 * so the collection collapses to the identifiers `promotionReward.ts` types it as.
 */
const REWARD_FULFILLMENT_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardFulfillmentMethod',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'fulfillmentMethodID',
});

/** `shippingAddressZones` [model/entity/PromotionReward.cfc:L77]. `AddressZone` is out of scope. */
const REWARD_SHIPPING_ADDRESS_ZONE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardShipAddressZone',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'addressZoneID',
});

/** `shippingMethods` [model/entity/PromotionReward.cfc:L78]. `ShippingMethod` is out of scope. */
const REWARD_SHIPPING_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardShippingMethod',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'shippingMethodID',
});

/** `fulfillmentMethods` [model/entity/PromotionQualifier.cfc:L73]. */
const QUALIFIER_FULFILLMENT_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualFulfillmentMethod',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'fulfillmentMethodID',
});

/** `shippingMethods` [model/entity/PromotionQualifier.cfc:L74]. */
const QUALIFIER_SHIPPING_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualShippingMethod',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'shippingMethodID',
});

/** `shippingAddressZones` [model/entity/PromotionQualifier.cfc:L75]. */
const QUALIFIER_SHIPPING_ADDRESS_ZONE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualShipAddressZone',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'addressZoneID',
});

// ---------------------------------------------------------------------------
// The twenty-one CATALOG-TYPED link tables
//
// Eleven on the reward - `eligiblePriceGroups` plus five includes and five excludes
// [model/entity/PromotionReward.cfc:L74, L80-L90] - and ten on the qualifier, five includes and five
// excludes [model/entity/PromotionQualifier.cfc:L77-L87]. Every table, owner column and member column
// below was read off the CFML `linktable` / `fkcolumn` / `inversejoincolumn` attributes rather than
// inferred from a naming convention, because the physical names are abbreviated inconsistently:
// `SwPromoRewardEligiblePriceGrp` truncates "PriceGroup" to "PriceGrp", and the exclusion tables use
// `Excl` rather than `Excluded`. Guessing either would produce a statement against a table that does
// not exist.
//
// Schema continuity: these tables are READ exactly as they stand. No migration, no rename, no new
// table and no column change.
//
// ★ AN EXCLUSION TABLE'S MEMBER COLUMN IS SPELLED THE SAME AS ITS INCLUSION COUNTERPART'S -
// `SwPromoRewardBrand.brandID` and `SwPromoRewardExclBrand.brandID` - so the pair differs ONLY in the
// table name. Reading one where the other was meant would compile, would run, and would silently
// invert an include into an exclude, which changes the money in the direction hardest to notice. Each
// descriptor below therefore names its own source locator, and B5 forbids tidying a physical name even
// where the abbreviation reads oddly.
// ---------------------------------------------------------------------------

/** `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74]. Note the truncated table name. */
const REWARD_ELIGIBLE_PRICE_GROUP_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardEligiblePriceGrp',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'priceGroupID',
});

/** `brands` [model/entity/PromotionReward.cfc:L80]. */
const REWARD_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardBrand',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'brandID',
});

/** `options` [model/entity/PromotionReward.cfc:L81]. */
const REWARD_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardOption',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'optionID',
});

/** `skus` [model/entity/PromotionReward.cfc:L82]. */
const REWARD_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardSku',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'skuID',
});

/** `products` [model/entity/PromotionReward.cfc:L83]. */
const REWARD_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardProduct',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productID',
});

/** `productTypes` [model/entity/PromotionReward.cfc:L84]. */
const REWARD_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardProductType',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productTypeID',
});

/** `excludedBrands` [model/entity/PromotionReward.cfc:L86]. */
const REWARD_EXCLUDED_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclBrand',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'brandID',
});

/** `excludedOptions` [model/entity/PromotionReward.cfc:L87]. */
const REWARD_EXCLUDED_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclOption',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'optionID',
});

/** `excludedSkus` [model/entity/PromotionReward.cfc:L88]. */
const REWARD_EXCLUDED_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclSku',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'skuID',
});

/** `excludedProducts` [model/entity/PromotionReward.cfc:L89]. */
const REWARD_EXCLUDED_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclProduct',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productID',
});

/** `excludedProductTypes` [model/entity/PromotionReward.cfc:L90]. */
const REWARD_EXCLUDED_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclProductType',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productTypeID',
});

/** `brands` [model/entity/PromotionQualifier.cfc:L77]. */
const QUALIFIER_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualBrand',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'brandID',
});

/** `options` [model/entity/PromotionQualifier.cfc:L78]. */
const QUALIFIER_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualOption',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'optionID',
});

/** `skus` [model/entity/PromotionQualifier.cfc:L79]. */
const QUALIFIER_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualSku',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'skuID',
});

/** `products` [model/entity/PromotionQualifier.cfc:L80]. */
const QUALIFIER_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualProduct',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productID',
});

/** `productTypes` [model/entity/PromotionQualifier.cfc:L81]. */
const QUALIFIER_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualProductType',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productTypeID',
});

/** `excludedBrands` [model/entity/PromotionQualifier.cfc:L83]. */
const QUALIFIER_EXCLUDED_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclBrand',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'brandID',
});

/** `excludedOptions` [model/entity/PromotionQualifier.cfc:L84]. */
const QUALIFIER_EXCLUDED_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclOption',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'optionID',
});

/** `excludedSkus` [model/entity/PromotionQualifier.cfc:L85]. */
const QUALIFIER_EXCLUDED_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclSku',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'skuID',
});

/** `excludedProducts` [model/entity/PromotionQualifier.cfc:L86]. */
const QUALIFIER_EXCLUDED_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclProduct',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productID',
});

/** `excludedProductTypes` [model/entity/PromotionQualifier.cfc:L87]. */
const QUALIFIER_EXCLUDED_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclProductType',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productTypeID',
});

/**
 * Read one link table for a set of owners.
 *
 * The three interpolated fragments are the descriptor's own table and column names, literals this
 * file owns, plus the placeholder list. NO VALUE IS INTERPOLATED: every owner identifier is bound
 * positionally.
 *
 * NO `ORDER BY`. The legacy metadata declares no `orderby` on any of the six collections, so
 * Hibernate imposes none, and adding one here would introduce an ordering the source does not have.
 */
function buildLinkStatement(descriptor: LinkTableDescriptor, ownerPlaceholders: string): string {
  return `SELECT
    ${descriptor.ownerColumn},
    ${descriptor.memberColumn}
FROM
    ${descriptor.table}
WHERE
    ${descriptor.ownerColumn} IN (${ownerPlaceholders})`;
}

/**
 * Read the qualifiers of a set of promotion periods.
 *
 * FETCH SHAPE: the ONE statement that satisfies `PromotionPeriod.promotionQualifiers`
 * [model/entity/PromotionPeriod.cfc:L63], keyed by every period identifier the reward read
 * returned, in one call. The inverse direction is NOT populated -
 * `PromotionPeriod.promotionRewards` and `Promotion.promotionPeriods` stay empty, as they do under
 * the legacy `JOIN FETCH`, and filling them with only the rewards this filtered statement matched
 * would assert something false. NO `ORDER BY`: the source declares none.
 */
function buildPeriodQualifierStatement(periodPlaceholders: string): string {
  return `SELECT
    promotionQualifierID,
    qualifierType,
    minimumOrderQuantity,
    maximumOrderQuantity,
    minimumOrderSubtotal,
    maximumOrderSubtotal,
    minimumItemQuantity,
    maximumItemQuantity,
    minimumItemPrice,
    maximumItemPrice,
    minimumFulfillmentWeight,
    maximumFulfillmentWeight,
    rewardMatchingType,
    promotionPeriodID,
    remoteID,
    createdDateTime,
    createdByAccountID,
    modifiedDateTime,
    modifiedByAccountID
FROM
    SwPromoQual
WHERE
    promotionPeriodID IN (${periodPlaceholders})`;
}

// ---------------------------------------------------------------------------
// Statement text - method 7
// ---------------------------------------------------------------------------

/**
 * Read one rounding rule by identifier, porting [model/dao/RoundingRuleDAO.cfc:L56-L64].
 *
 * JUDGMENT CALL: THE PROJECTION IS WIDENED FROM TWO COLUMNS TO THE WHOLE PERSISTED ROW, and the
 * widening is PORT-MANDATED rather than chosen here. The legacy selects only the expression and the
 * direction, because its caller reads only those two
 * [model/service/RoundingRuleService.cfc:L73-L74]. The port types this method
 *   `Promise<RoundingRule | undefined>` -
 * a whole entity - and that constructor requires the identifier, the name, both legacy columns and
 * the four audit fields, so the projection is exactly what it needs.
 *
 * `priceGroupRates` [model/entity/RoundingRule.cfc:L64] is NOT read. FETCH SHAPE: an empty array is
 * passed, because `PriceGroupRate` is owned by the price-group repository and the rounding
 * arithmetic reads only the expression and the direction.
 */
const ROUNDING_RULE_BY_ID_STATEMENT = `SELECT
    roundingRuleID,
    roundingRuleName,
    roundingRuleExpression,
    roundingRuleDirection,
    createdDateTime,
    createdByAccountID,
    modifiedDateTime,
    modifiedByAccountID
FROM
    SwRoundingRule
WHERE
    roundingRuleID = ?`;

/**
 * Inserts one rounding rule.
 *
 * NO VERBATIM LEGACY SQL EXISTS TO QUOTE, and that is the point worth recording.
 * `RoundingRuleService.saveRoundingRule` ends in `super.save(argumentcollection=arguments)`
 * [model/service/RoundingRuleService.cfc:L63], which is framework-inherited CRUD from
 * `HibachiService`; the statement was generated by Hibernate from the entity's persistent-property
 * metadata, so the AUTHORITY FOR THIS STATEMENT IS THAT METADATA rather than any hand-written query.
 * Having no query to copy is exactly why this write was easy to omit, so the mapping is spelled out:
 *
 *     roundingRuleID          [model/entity/RoundingRule.cfc:L52]  fieldtype="id" generator="uuid"
 *     roundingRuleName        [model/entity/RoundingRule.cfc:L53]
 *     roundingRuleExpression  [model/entity/RoundingRule.cfc:L54]
 *     roundingRuleDirection   [model/entity/RoundingRule.cfc:L55]
 *     createdDateTime         [model/entity/RoundingRule.cfc:L58]  hb_populateEnabled="false"
 *     modifiedDateTime        [model/entity/RoundingRule.cfc:L60]  hb_populateEnabled="false"
 *
 * THE IDENTIFIER IS SUPPLIED, NOT GENERATED BY THE SERVER. `generator="uuid"` means the application
 * produced it, which is why `SqlMutationResult` carries no `insertId` - see the judgment call on that
 * type in `src/repositories/mysql/connection.ts`.
 *
 * THE TWO ACCOUNT AUDIT COLUMNS ARE NOT WRITTEN. `createdByAccountID` and `modifiedByAccountID`
 * [model/entity/RoundingRule.cfc:L59, L61] are many-to-one keys into `Account`, which is explicitly
 * out of scope, and the target entity carries them as opaque values it never resolves. Writing an
 * account identifier this slice cannot legitimately obtain would be inventing data; leaving the
 * columns to their schema default preserves the contract without fabricating a reference. They are
 * READ back by `ROUNDING_RULE_BY_ID_STATEMENT` above, so a row written elsewhere keeps its values.
 */
/**
 * Probes whether a row already answers to an identifier.
 *
 * The select half of Hibernate's detached-entity reconciliation - see `saveRoundingRule`. The
 * projection is the identifier column alone because existence is the whole question.
 */
const ROUNDING_RULE_EXISTS_STATEMENT = `SELECT
    roundingRuleID
FROM
    SwRoundingRule
WHERE
    roundingRuleID = ?`;

/**
 * Mints a persisted identifier.
 *
 * FOLLOWS THE FRAMEWORK'S OWN SHAPE, not a preference: `generator="uuid"`
 * [model/entity/RoundingRule.cfc:L52] on a `length="32"` string column is Hibernate's 32-character
 * hex form, so the canonical dashed rendering is stripped to match what the column has always held.
 *
 * DECLARED MODULE-LOCALLY, mirroring the identical helper in
 * `src/repositories/mysql/mysqlProductRepository.ts`. That is this folder's established convention -
 * the same one that keeps `RoundingRuleValueRounder` local to this file rather than shared - and
 * there are no barrel files to import through. One line duplicated is cheaper than a cross-adapter
 * dependency between two secondary adapters.
 */
function generatePersistedIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

const ROUNDING_RULE_INSERT_STATEMENT = `INSERT INTO SwRoundingRule (
    roundingRuleID,
    roundingRuleName,
    roundingRuleExpression,
    roundingRuleDirection,
    createdDateTime,
    modifiedDateTime
) VALUES (?, ?, ?, ?, ?, ?)`;

/**
 * Updates one rounding rule.
 *
 * WRITES EVERY POPULATABLE COLUMN, not a computed delta. Hibernate flushed the whole dirty entity and
 * the target holds no per-field dirty tracking, so writing all three populatable columns reproduces
 * the legacy outcome; writing a subset would silently preserve a stale value the legacy would have
 * replaced.
 *
 * `createdDateTime` is deliberately absent from the SET list. It is `hb_populateEnabled="false"`
 * [model/entity/RoundingRule.cfc:L58] and describes when the row came into existence, so an update
 * that rewrote it would destroy audit history. `modifiedDateTime` is the column an update owns.
 */
const ROUNDING_RULE_UPDATE_STATEMENT = `UPDATE SwRoundingRule SET
    roundingRuleName = ?,
    roundingRuleExpression = ?,
    roundingRuleDirection = ?,
    modifiedDateTime = ?
WHERE
    roundingRuleID = ?`;

// ---------------------------------------------------------------------------
// List tokenization and the empty-list short-circuits
//
// E5 mechanics, stated once. `mysql2` does NOT expand an array into an `IN` list - handing it one
// value produces a single bound scalar - so every comma-list is TOKENIZED and rendered as one `?`
// per element, which preserves the legacy semantics, because HQL's `IN (:list)` binds a COLLECTION
// and matches element by element. THIS TREATMENT IS DELIBERATELY NOT GENERALISED FROM THE ONE
// DOCUMENTED EXCEPTION ELSEWHERE IN THE FOLDER: `model/dao/ProductDAO.cfc:L64-L69` binds a whole
// joined comma STRING as a single parameter, where per-element binding would change which rows
// match. AN EMPTY LIST CANNOT BE RENDERED, so every list is short-circuited BEFORE a placeholder
// list is asked for, per list, from the legacy body, at its own call site.
// ---------------------------------------------------------------------------

/**
 * Tokenize a CFML comma-list into its elements.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L122,L126,L129]: the legacy converts each list with
 * `listToArray`, which drops empty elements - `'a,,b'` yields two elements and `''` yields none -
 * and `src/lib/cfml/list.ts` reproduces that, including the default delimiter set.
 */
function tokenizeList(list: string): readonly string[] {
  return listToArray(list);
}

/**
 * Derive the reward types that are exempt from the qualifier requirement, porting
 * [model/dao/PromotionDAO.cfc:L56-L62].
 *
 * Reproduced through the CFML list helpers rather than through TypeScript string work, so the
 * semantics carry over intact: `listFindNoCase` is an ELEMENT match and not a substring match - a
 * list of `'fulfillmentBonus'` does not contain `'fulfillment'` - and it is case-INSENSITIVE, so
 * `'Order'` in the caller's list does select the `'order'` element. `listAppend` builds the result
 * in the legacy's own order, `fulfillment` before `order`, which is preserved because the elements
 * become positional binds.
 *
 * NOTE WHICH VALUE IS APPENDED: the legacy appends the LITERAL `'fulfillment'` and `'order'`, not
 * the caller's spelling, so a caller passing `'Order'` produces and binds `'order'`.
 */
function deriveNoQualificationRequiredList(rewardTypeList: string): string {
  let noQualRequiredList = '';

  if (listFindNoCase(rewardTypeList, 'fulfillment') > 0) {
    noQualRequiredList = listAppend(noQualRequiredList, 'fulfillment');
  }

  if (listFindNoCase(rewardTypeList, 'order') > 0) {
    noQualRequiredList = listAppend(noQualRequiredList, 'order');
  }

  return noQualRequiredList;
}

// ---------------------------------------------------------------------------
// Hydration
//
// ONE row-to-entity factory for `PromotionReward`, plus the helpers that assemble the associations
// it needs, so there is no second site that knows how to build a reward. Four other shapes have
// small mappers and none is entity hydration: the four use-count results are a single scalar each;
// the sale-price rows are the PORT'S OWN FLAT ROW PROJECTION, fixed deliberately because the legacy
// returns a CFML query object [model/dao/PromotionDAO.cfc:L590]; and the rounding-rule and
// qualifier rows go through the same mappers the reward factory uses.
//
// INSTANCE SHARING WITHIN ONE INVOCATION. Two rewards on one promotion period arrive as two rows
// carrying the same period columns and are hydrated into ONE shared `PromotionPeriod` instance,
// keyed by folded identifier, as are the promotion and the rounding rule - the identity Hibernate's
// session gave the legacy, which matters because the promotion engine keys its qualification cache
// on `getPromotionPeriodID()` [model/service/PromotionService.cfc:L192-L222]. See
// `hydrateActiveRewards` for the scoping.
// ---------------------------------------------------------------------------

/** The three opaque-identifier collections a reward or a qualifier carries. */
interface OpaqueLinkSets {
  readonly fulfillmentMethodIDs: readonly string[];
  readonly shippingMethodIDs: readonly string[];
  readonly shippingAddressZoneIDs: readonly string[];
}

/**
 * The five catalog-typed include collections and the five exclude collections both owners carry.
 *
 * `PromotionQualifier` carries exactly these ten [model/entity/PromotionQualifier.cfc:L77-L87];
 * `PromotionReward` carries the same ten [model/entity/PromotionReward.cfc:L80-L90] plus
 * `eligiblePriceGroups`, which `RewardCatalogLinkSets` adds.
 *
 * Every member is an IDENTITY-COMPLETE PROJECTION - see the fetch-shape block above for why that is
 * both sufficient for the eleven membership predicates and deliberate. The arrays are mutable
 * `Entity[]` rather than `readonly Entity[]` because the entity constructors adopt them by reference
 * and the entities' own bidirectional `add*`/`remove*` helpers mutate them in place, which is the
 * shipped convention for every in-scope collection.
 */
interface CatalogLinkSets {
  readonly brands: Brand[];
  readonly options: Option[];
  readonly skus: Sku[];
  readonly products: Product[];
  readonly productTypes: ProductType[];
  readonly excludedBrands: Brand[];
  readonly excludedOptions: Option[];
  readonly excludedSkus: Sku[];
  readonly excludedProducts: Product[];
  readonly excludedProductTypes: ProductType[];
}

/**
 * The reward's eleven catalog-typed collections: the shared ten plus `eligiblePriceGroups`.
 *
 * `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74] has no qualifier counterpart, which is
 * the whole reason the reward set is separate. It is read on the pricing arm at
 * [model/service/PromotionService.cfc:L241-L252] through `hasEligiblePriceGroup`, so leaving it empty
 * changes the discount base of every price-group-eligible order item.
 */
interface RewardCatalogLinkSets extends CatalogLinkSets {
  readonly eligiblePriceGroups: PriceGroup[];
}

/** Nothing linked. Frozen and shared, so an owner with no links allocates no arrays. */
const NO_LINK_MEMBERS: readonly string[] = Object.freeze([]);

/**
 * Group link rows by their owner.
 *
 * The map key is the FOLDED owner identifier, because CFML struct keys are case-insensitive and
 * MySQL's default collation is too, so folding keeps the grouping and the later lookup agreeing
 * with both. The stored member values are NOT folded - they are handed on exactly as the column
 * holds them, in row order within each owner.
 */
function groupLinkMembers(
  rows: readonly SqlRow[],
  descriptor: LinkTableDescriptor,
  statementLabel: string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const ownerID = readIdentifier(row, descriptor.ownerColumn, statementLabel);
    const memberID = readIdentifier(row, descriptor.memberColumn, statementLabel);
    const key = foldIdentifier(ownerID);
    const members = grouped.get(key);

    if (members === undefined) {
      grouped.set(key, [memberID]);
    } else {
      members.push(memberID);
    }
  }

  return grouped;
}

/**
 * Read one owner's members out of a grouping.
 *
 * An owner with no link rows gets the shared frozen empty array, which is the same value the entity
 * constructors would have defaulted to. An empty collection is a legitimate state, never a fault.
 */
function linkMembersOf(grouped: Map<string, string[]>, ownerID: string): readonly string[] {
  return grouped.get(foldIdentifier(ownerID)) ?? NO_LINK_MEMBERS;
}

// ---------------------------------------------------------------------------
// The six IDENTITY-PROJECTION factories
//
// Each turns one owner's link-row identifiers into membership tokens of the corresponding in-scope
// entity type. The identifier is carried VERBATIM, with its stored casing intact: the predicates that
// read it compare with `===` on the raw accessor, so folding here would break a comparison against a
// candidate the catalog adapter hydrated unfolded.
//
// WHAT EACH FACTORY PROMISES, AND WHAT IT DOES NOT
// It promises the identifier accessor - `getBrandID()`, `getOptionID()`, `getSkuID()`,
// `getProductID()`, `getProductTypeID()`, `getPriceGroupID()` - and nothing else. Every other accessor
// on a projected member answers from its constructor's own default, which for the collection accessors
// is an empty array and for the scalar accessors is `undefined`. That is the correct answer to "what
// did the link table say about this member", which is all a link table can say.
//
// NO COLLABORATOR PORT IS INJECTED into any projection, and none is needed: `Sku` and `Product` take
// their ports through optional constructor members under transformation rule T2, and no predicate
// reaches a port-backed accessor on a configured member. This is the specific reason the identity
// projection resolves the ownership objection that previously left these collections empty - this
// adapter never has to know how another aggregate's collaborators are wired.
//
// A FRESH ARRAY PER OWNER, NEVER A SHARED ONE. The entity constructors ADOPT these arrays by
// reference so their `add*`/`remove*` helpers stay live, so two owners must never share one array -
// mutating one reward's include set would otherwise mutate another's. `NO_LINK_MEMBERS` is safe to
// share because it holds identifiers, not entities, and is frozen; the arrays these factories return
// are not shared even when empty.
// ---------------------------------------------------------------------------

/** Identity-only `Brand` tokens, for `brands` and `excludedBrands`. */
function toBrandProjections(brandIDs: readonly string[]): Brand[] {
  return brandIDs.map((brandID: string): Brand => new Brand({ brandID }));
}

/**
 * Identity-only `Option` tokens, for `options` and `excludedOptions`.
 *
 * `Option`'s constructor declares its twelve scalar members REQUIRED-BUT-NULLABLE rather than
 * optional, so each must be passed explicitly as `undefined`. That is the entity's shipped shape, not
 * something this file chooses, and writing them out is what `exactOptionalPropertyTypes` demands.
 */
function toOptionProjections(optionIDs: readonly string[]): Option[] {
  return optionIDs.map(
    (optionID: string): Option =>
      new Option({
        optionID,
        optionCode: undefined,
        optionName: undefined,
        optionDescription: undefined,
        sortOrder: undefined,
        optionGroup: undefined,
        defaultImageID: undefined,
        remoteID: undefined,
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      }),
  );
}

/** Identity-only `Sku` tokens, for `skus` and `excludedSkus`. */
function toSkuProjections(skuIDs: readonly string[]): Sku[] {
  return skuIDs.map((skuID: string): Sku => new Sku({ skuID }));
}

/** Identity-only `Product` tokens, for `products` and `excludedProducts`. */
function toProductProjections(productIDs: readonly string[]): Product[] {
  return productIDs.map((productID: string): Product => new Product({ productID }));
}

/**
 * Identity-only `ProductType` tokens, for `productTypes` and `excludedProductTypes`.
 *
 * `productTypeIDPath` is deliberately left absent. The materialized-path walk in
 * `src/services/promotion/orderItemMembership.ts` reads the path off the ORDER ITEM's product type -
 * which the catalog adapter hydrated in full - and reads only `getProductTypeID()` off each configured
 * member, so a path here would be unread state pretending to be authoritative.
 */
function toProductTypeProjections(productTypeIDs: readonly string[]): ProductType[] {
  return productTypeIDs.map(
    (productTypeID: string): ProductType => new ProductType({ productTypeID }),
  );
}

/**
 * Identity-only `PriceGroup` tokens, for the reward's `eligiblePriceGroups`.
 *
 * `PriceGroup`'s constructor declares its scalars and its three collections REQUIRED, so all of them
 * are passed explicitly. The three collections get FRESH empty arrays per member for the
 * adopt-by-reference reason stated above; `priceGroupIDPath` is absent because
 * `hasEligiblePriceGroup` compares `getPriceGroupID()` and never walks the path.
 */
function toPriceGroupProjections(priceGroupIDs: readonly string[]): PriceGroup[] {
  return priceGroupIDs.map(
    (priceGroupID: string): PriceGroup =>
      new PriceGroup({
        priceGroupID,
        priceGroupIDPath: undefined,
        activeFlag: undefined,
        priceGroupName: undefined,
        priceGroupCode: undefined,
        parentPriceGroup: undefined,
        childPriceGroups: [],
        priceGroupRates: [],
        promotionRewards: [],
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      }),
  );
}

/**
 * Hydrate one `SwRoundingRule` row, shared by method 1's `LEFT JOIN` - through a column-prefix
 * indirection - and by method 7, so the entity is constructed identically either way.
 *
 * `roundingRuleExpression` IS PASSED THROUGH UNTOUCHED. CFML parity
 * [model/entity/RoundingRule.cfc:L54]: the column is declared `ormtype="string"` with no length, no
 * format constraint, no validation rule and no normalization anywhere in the legacy tree - so it is
 * not trimmed, case-folded, defaulted or rejected here, however odd it looks. What the rounding
 * algorithm does with an odd expression is a SERVICE concern
 * [model/service/RoundingRuleService.cfc:L88-L175], characterized by that tier's own tests.
 *
 * @param columnPrefix `''` for method 7's unprefixed projection, or `'srr_'` for method 1's joined
 *   one.
 */
function toRoundingRule(
  row: SqlRow,
  columnPrefix: string,
  statementLabel: string,
  valueRounder: RoundingRuleValueRounder,
): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID: readIdentifier(row, `${columnPrefix}roundingRuleID`, statementLabel),
      roundingRuleName: readOptionalText(row, `${columnPrefix}roundingRuleName`, statementLabel),
      roundingRuleExpression: readOptionalText(
        row,
        `${columnPrefix}roundingRuleExpression`,
        statementLabel,
      ),
      roundingRuleDirection: readOptionalText(
        row,
        `${columnPrefix}roundingRuleDirection`,
        statementLabel,
      ),
      createdDateTime: readTimestamp(row, `${columnPrefix}createdDateTime`, statementLabel),
      createdByAccountID: readOptionalText(
        row,
        `${columnPrefix}createdByAccountID`,
        statementLabel,
      ),
      modifiedDateTime: readTimestamp(row, `${columnPrefix}modifiedDateTime`, statementLabel),
      modifiedByAccountID: readOptionalText(
        row,
        `${columnPrefix}modifiedByAccountID`,
        statementLabel,
      ),

      // FETCH SHAPE: not read. `priceGroupRates` [model/entity/RoundingRule.cfc:L64] is an inverse
      // one-to-many owned by the price-group side, and no consumer of a rounding rule reached from
      // here traverses it.
      priceGroupRates: [],
    },
    valueRounder,
  );
}

/**
 * Hydrate one `SwPromotion` row from method 1's prefixed projection.
 *
 * `activeFlag` is handed over RAW, exactly as `readFlag` produced it: `Promotion`'s own constructor
 * applies the ORM default `default="1"` [model/entity/Promotion.cfc:L56] for an absent value and
 * then routes the result through `cfBoolean()`, so coercing here would pre-empt that default.
 *
 * FETCH SHAPE: `promotionPeriods`, `promotionCodes` and `appliedPromotions`
 * [model/entity/Promotion.cfc:L62-L64] are left empty - all three are inverse one-to-many
 * collections the legacy `JOIN FETCH` does not populate either, and filling `promotionPeriods` with
 * only the one period this row came through would assert something false. `defaultImageID` is
 * carried as an opaque identifier because `Image` is out of scope.
 */
function toPromotion(row: SqlRow): Promotion {
  return new Promotion({
    promotionID: readIdentifier(row, 'sp_promotionID', ACTIVE_REWARDS_STATEMENT_LABEL),
    promotionName: readOptionalText(row, 'sp_promotionName', ACTIVE_REWARDS_STATEMENT_LABEL),
    promotionSummary: readOptionalText(row, 'sp_promotionSummary', ACTIVE_REWARDS_STATEMENT_LABEL),
    promotionDescription: readOptionalText(
      row,
      'sp_promotionDescription',
      ACTIVE_REWARDS_STATEMENT_LABEL,
    ),
    activeFlag: readFlag(row, 'sp_activeFlag', ACTIVE_REWARDS_STATEMENT_LABEL),
    defaultImageID: readOptionalText(row, 'sp_defaultImageID', ACTIVE_REWARDS_STATEMENT_LABEL),
    remoteID: readOptionalText(row, 'sp_remoteID', ACTIVE_REWARDS_STATEMENT_LABEL),
    createdDateTime: readTimestamp(row, 'sp_createdDateTime', ACTIVE_REWARDS_STATEMENT_LABEL),
    createdByAccountID: readOptionalText(
      row,
      'sp_createdByAccountID',
      ACTIVE_REWARDS_STATEMENT_LABEL,
    ),
    modifiedDateTime: readTimestamp(row, 'sp_modifiedDateTime', ACTIVE_REWARDS_STATEMENT_LABEL),
    modifiedByAccountID: readOptionalText(
      row,
      'sp_modifiedByAccountID',
      ACTIVE_REWARDS_STATEMENT_LABEL,
    ),
  });
}

/**
 * Hydrate one `SwPromoQual` row.
 *
 * The two fulfillment-weight gates go through the NON-MONETARY decimal reader: they are
 * `ormtype="big_decimal"` with `hb_formatType="weight"`
 * [model/entity/PromotionQualifier.cfc:L63-L64] and the entity types them `number`, so routing them
 * through `Money` would misrepresent a weight as currency. The four subtotal and price gates ARE
 * money and go through `Money`.
 *
 * Not one of the ten gates is defaulted: `undefined` is the value that means "no bound", which
 * `hb_nullRBKey="define.0"` and `hb_nullRBKey="define.unlimited"` say outright
 * [model/entity/PromotionQualifier.cfc:L55-L64] - substituting `0` for a maximum would turn
 * "unlimited" into "nothing qualifies".
 *
 * FETCH SHAPE: `promotionPeriod` is left absent, deliberately. The qualifier is reached only THROUGH
 * its period in this graph, so setting the back-reference would create a cycle the hydration would
 * have to break by construction order rather than by design, and no consumer of a qualifier reached
 * from a period asks it for its period. The ten catalog collections ARE materialized, as
 * identity-complete projections - see "WHY ALL TWENTY-SEVEN" above the link descriptors.
 *
 * @param row the row to hydrate.
 * @param links the three opaque-identifier collections for this qualifier.
 * @param catalogLinks the ten catalog-typed collections for this qualifier, already projected.
 * @returns the qualifier.
 */
function toPromotionQualifier(
  row: SqlRow,
  links: OpaqueLinkSets,
  catalogLinks: CatalogLinkSets,
): PromotionQualifier {
  const label = PERIOD_QUALIFIER_STATEMENT_LABEL;

  return new PromotionQualifier({
    promotionQualifierID: readIdentifier(row, 'promotionQualifierID', label),
    qualifierType: readOptionalText(row, 'qualifierType', label),
    minimumOrderQuantity: readOptionalInteger(row, 'minimumOrderQuantity', label),
    maximumOrderQuantity: readOptionalInteger(row, 'maximumOrderQuantity', label),
    minimumOrderSubtotal: readOptionalMoney(row, 'minimumOrderSubtotal', label),
    maximumOrderSubtotal: readOptionalMoney(row, 'maximumOrderSubtotal', label),
    minimumItemQuantity: readOptionalInteger(row, 'minimumItemQuantity', label),
    maximumItemQuantity: readOptionalInteger(row, 'maximumItemQuantity', label),
    minimumItemPrice: readOptionalMoney(row, 'minimumItemPrice', label),
    maximumItemPrice: readOptionalMoney(row, 'maximumItemPrice', label),
    minimumFulfillmentWeight: readOptionalNonMonetaryDecimal(
      row,
      'minimumFulfillmentWeight',
      label,
    ),
    maximumFulfillmentWeight: readOptionalNonMonetaryDecimal(
      row,
      'maximumFulfillmentWeight',
      label,
    ),
    rewardMatchingType: narrowOrAbsent(
      readOptionalText(row, 'rewardMatchingType', label),
      REWARD_MATCHING_TYPES,
    ),
    fulfillmentMethodIDs: links.fulfillmentMethodIDs,
    shippingMethodIDs: links.shippingMethodIDs,
    shippingAddressZoneIDs: links.shippingAddressZoneIDs,

    // The ten catalog-typed collections [model/entity/PromotionQualifier.cfc:L77-L87], materialized as
    // identity-complete projections. Passed through in the entity's own declaration order so a
    // reviewer can diff the two lists directly.
    brands: catalogLinks.brands,
    options: catalogLinks.options,
    skus: catalogLinks.skus,
    products: catalogLinks.products,
    productTypes: catalogLinks.productTypes,
    excludedBrands: catalogLinks.excludedBrands,
    excludedOptions: catalogLinks.excludedOptions,
    excludedSkus: catalogLinks.excludedSkus,
    excludedProducts: catalogLinks.excludedProducts,
    excludedProductTypes: catalogLinks.excludedProductTypes,

    remoteID: readOptionalText(row, 'remoteID', label),
    createdDateTime: readTimestamp(row, 'createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', label),
  });
}

/**
 * Hydrate one `SwPromotionPeriod` row from method 1's prefixed projection, taking the shared
 * promotion instance, the period's already-assembled qualifiers, and the invocation's single
 * captured instant as the provider the entity requires.
 */
function toPromotionPeriod(
  row: SqlRow,
  promotion: Promotion,
  promotionQualifiers: PromotionQualifier[],
  now: () => Date,
): PromotionPeriod {
  const label = ACTIVE_REWARDS_STATEMENT_LABEL;

  return new PromotionPeriod({
    promotionPeriodID: readIdentifier(row, 'spp_promotionPeriodID', label),
    startDateTime: readTimestamp(row, 'spp_startDateTime', label),
    endDateTime: readTimestamp(row, 'spp_endDateTime', label),
    maximumUseCount: readOptionalInteger(row, 'spp_maximumUseCount', label),
    maximumAccountUseCount: readOptionalInteger(row, 'spp_maximumAccountUseCount', label),
    promotion,
    promotionID: readOptionalText(row, 'spp_promotionID', label),
    remoteID: readOptionalText(row, 'spp_remoteID', label),
    createdDateTime: readTimestamp(row, 'spp_createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'spp_createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'spp_modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'spp_modifiedByAccountID', label),
    now,

    // FETCH SHAPE: the inverse reward collection stays empty - see `toPromotion`. The qualifier
    // collection IS populated, because the promotion engine walks it and there is no lazy loader to
    // fall back on.
    promotionQualifiers,
  });
}

/**
 * THE row-to-entity factory for `PromotionReward`. Every reward this file returns is built here,
 * and nowhere else. The period, promotion and rounding rule handed in are the SHARED instances the
 * invocation resolved.
 *
 * `amount` is `Money | undefined` from the `big_decimal` column, which declares NO `default`
 * [model/entity/PromotionReward.cfc:L61] - so a NULL amount stays absent and is never `Money.zero`.
 * `amountType` and `applicableTerm` are narrowed permissively, mapping an unrecognized persisted
 * value to absence, which reproduces the legacy discount switch's missing `default` arm. The three
 * use limits are `number | undefined`, where absence means UNLIMITED
 * [model/entity/PromotionReward.cfc:L65-L67] and never zero uses.
 *
 * LEGACY-DEFECT [model/entity/PromotionReward.cfc:L57]: the component declares
 * `hb_permission="promotionPeriod.promtionRewards"` - `promtionRewards` is missing its `o`. The
 * misspelling is part of the persisted permission vocabulary the legacy admin resolves against, so
 * `src/domain/entities/promotionReward.ts` carries it verbatim in its entity metadata and this
 * factory does not touch, rewrite or normalize that metadata.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
 * @param row the reward row, carrying the prefixed projection.
 * @param promotionPeriod the shared period instance.
 * @param roundingRule the shared rule instance, or `undefined` when the `LEFT JOIN` matched nothing.
 * @param links the three opaque-identifier collections for this reward.
 * @param catalogLinks the eleven catalog-typed collections for this reward, already projected.
 * @returns the reward.
 */
function toPromotionReward(
  row: SqlRow,
  promotionPeriod: PromotionPeriod,
  roundingRule: RoundingRule | undefined,
  links: OpaqueLinkSets,
  catalogLinks: RewardCatalogLinkSets,
): PromotionReward {
  const label = ACTIVE_REWARDS_STATEMENT_LABEL;

  return new PromotionReward({
    promotionRewardID: readIdentifier(row, 'spr_promotionRewardID', label),
    amount: readOptionalMoney(row, 'spr_amount', label),
    amountType: narrowOrAbsent(readOptionalText(row, 'spr_amountType', label), AMOUNT_TYPES),
    rewardType: readOptionalText(row, 'spr_rewardType', label),
    applicableTerm: narrowOrAbsent(
      readOptionalText(row, 'spr_applicableTerm', label),
      APPLICABLE_TERMS,
    ),
    maximumUsePerOrder: readOptionalInteger(row, 'spr_maximumUsePerOrder', label),
    maximumUsePerItem: readOptionalInteger(row, 'spr_maximumUsePerItem', label),
    maximumUsePerQualification: readOptionalInteger(row, 'spr_maximumUsePerQualification', label),
    promotionPeriod,
    roundingRule,
    fulfillmentMethodIDs: links.fulfillmentMethodIDs,
    shippingAddressZoneIDs: links.shippingAddressZoneIDs,
    shippingMethodIDs: links.shippingMethodIDs,

    // The ten catalog collections, spread as one unit - see the matching note in
    // `toPromotionQualifier` for why they are spread rather than named one at a time.
    ...catalogLinks,
    remoteID: readOptionalText(row, 'spr_remoteID', label),
    createdDateTime: readTimestamp(row, 'spr_createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'spr_createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'spr_modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'spr_modifiedByAccountID', label),

    // FETCH SHAPE: `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74] and the ten catalog
    // collections [model/entity/PromotionReward.cfc:L80-L90] are MATERIALIZED as identity-complete
    // projections - see the fetch-shape block above the link descriptors for why all eleven are read
    // and why an identity projection is both sufficient and deliberate. Passed through in the entity's
    // own declaration order so a reviewer can diff the two lists directly.
    eligiblePriceGroups: catalogLinks.eligiblePriceGroups,
    brands: catalogLinks.brands,
    options: catalogLinks.options,
    skus: catalogLinks.skus,
    products: catalogLinks.products,
    productTypes: catalogLinks.productTypes,
    excludedBrands: catalogLinks.excludedBrands,
    excludedOptions: catalogLinks.excludedOptions,
    excludedSkus: catalogLinks.excludedSkus,
    excludedProducts: catalogLinks.excludedProducts,
    excludedProductTypes: catalogLinks.excludedProductTypes,
  });
}

/**
 * Map one sale-price row onto the port's row projection.
 *
 * NOT ENTITY HYDRATION, and that is the port's decision rather than a shortcut: the legacy returns
 * a CFML query object [model/dao/PromotionDAO.cfc:L590], and the eight projected columns come from
 * a reduction across six UNION branches rather than from any one table.
 *
 * `originalPrice` and `salePrice` both arrive as DECIMAL STRINGS and go straight into `Money` - no
 * `Number()` and no arithmetic here. The rounding rule is NOT applied, only its identifier carried,
 * because rounding is the service tier's step [model/service/PromotionService.cfc:L1024-L1028].
 * `originalPrice` maps a NULL to absence rather than to a zero; `salePrice` is required, and why it
 * can be is structural - see `readMoney`.
 */
function toSalePricePromotionRewardRow(row: SqlRow): SalePricePromotionRewardRow {
  const label = SALE_PRICE_STATEMENT_LABEL;
  const originalPrice = readOptionalMoney(row, 'originalPrice', label);
  const roundingRuleID = readOptionalText(row, 'roundingRuleID', label);
  const salePriceExpirationDateTime = readTimestamp(row, 'salePriceExpirationDateTime', label);

  // Under `exactOptionalPropertyTypes` the three optional members must be ABSENT to mean absent, so
  // each is spread in only when it has a value. Assigning `undefined` to them would not compile,
  // and that strictness is doing real work here: it keeps "no expiration recorded" distinguishable
  // from "expiration explicitly unset" at the type level.
  return {
    skuID: readIdentifier(row, 'skuID', label),
    ...(originalPrice === undefined ? {} : { originalPrice }),
    discountLevel: narrowOrReport(
      readIdentifier(row, 'discountLevel', label),
      DISCOUNT_LEVELS,
      'discountLevel',
      label,
    ),
    salePriceDiscountType: narrowOrReport(
      readIdentifier(row, 'salePriceDiscountType', label),
      SALE_PRICE_DISCOUNT_TYPES,
      'salePriceDiscountType',
      label,
    ),
    salePrice: readMoney(row, 'salePrice', label),
    ...(roundingRuleID === undefined ? {} : { roundingRuleID }),
    ...(salePriceExpirationDateTime === undefined ? {} : { salePriceExpirationDateTime }),
    promotionID: readIdentifier(row, 'promotionID', label),
  };
}

/**
 * Resolve the promotion identifier the two period use-count statements bind:
 * `arguments.promotionPeriod.getPromotion().getPromotionID()` [model/dao/PromotionDAO.cfc:L138, and
 * identically at L193].
 *
 * The count is taken for the period's PROMOTION rather than for the period itself, so every period
 * of a promotion shares one use count. CFML has no null guard on that chain, and that failure is
 * reproduced rather than smoothed - see `PromotionAssociationError`.
 */
function requirePromotionID(promotionPeriod: PromotionPeriod, methodName: string): string {
  const promotion = promotionPeriod.getPromotion();

  if (promotion === undefined) {
    throw new PromotionAssociationError('PromotionPeriod', 'promotion', methodName);
  }

  return promotion.getPromotionID();
}

/**
 * The names of the link sets one owner kind carries.
 *
 * THIRTEEN: the three whose members are out-of-scope and collapse to opaque identifiers, then the ten
 * catalog sets. `eligiblePriceGroups` is absent by the decision recorded above the descriptors.
 *
 * Declared as a tuple of literal names, and the descriptor and grouping records are keyed BY it, so a
 * set added to one and forgotten in the other does not compile. That matters here more than it would
 * elsewhere: the twenty catalog tables differ by one word each, and a silently missing set reads as an
 * empty collection rather than as an error.
 */
const LINK_SET_NAMES = [
  'fulfillmentMethods',
  'shippingMethods',
  'shippingAddressZones',
  'brands',
  'options',
  'skus',
  'products',
  'productTypes',
  'excludedBrands',
  'excludedOptions',
  'excludedSkus',
  'excludedProducts',
  'excludedProductTypes',
] as const;

/** One of the thirteen link-set names. */
type LinkSetName = (typeof LINK_SET_NAMES)[number];

/** The thirteen link tables that serve one owner kind. */
type LinkDescriptorSet = Readonly<Record<LinkSetName, LinkTableDescriptor>>;

/**
 * The reward's thirteen [model/entity/PromotionReward.cfc:L76-L78, L80-L84, L86-L90].
 *
 * FETCH SHAPE: thirteen statements, each keyed by every reward identifier the invocation resolved at
 * once. The count is FIXED - it does not grow with the number of rewards, the number of periods or
 * the number of link rows - which is the property the association-materialization rule asks for. The
 * alternative it rules out is a lookup per reward, and that is what "unbounded per-row lookups are
 * not acceptable" names.
 */
const REWARD_LINK_DESCRIPTORS: LinkDescriptorSet = Object.freeze({
  fulfillmentMethods: REWARD_FULFILLMENT_METHOD_LINK,
  shippingMethods: REWARD_SHIPPING_METHOD_LINK,
  shippingAddressZones: REWARD_SHIPPING_ADDRESS_ZONE_LINK,
  brands: REWARD_BRAND_LINK,
  options: REWARD_OPTION_LINK,
  skus: REWARD_SKU_LINK,
  products: REWARD_PRODUCT_LINK,
  productTypes: REWARD_PRODUCT_TYPE_LINK,
  excludedBrands: REWARD_EXCLUDED_BRAND_LINK,
  excludedOptions: REWARD_EXCLUDED_OPTION_LINK,
  excludedSkus: REWARD_EXCLUDED_SKU_LINK,
  excludedProducts: REWARD_EXCLUDED_PRODUCT_LINK,
  excludedProductTypes: REWARD_EXCLUDED_PRODUCT_TYPE_LINK,
});

/** The qualifier's thirteen [model/entity/PromotionQualifier.cfc:L73-L75, L77-L81, L83-L87]. */
const QUALIFIER_LINK_DESCRIPTORS: LinkDescriptorSet = Object.freeze({
  fulfillmentMethods: QUALIFIER_FULFILLMENT_METHOD_LINK,
  shippingMethods: QUALIFIER_SHIPPING_METHOD_LINK,
  shippingAddressZones: QUALIFIER_SHIPPING_ADDRESS_ZONE_LINK,
  brands: QUALIFIER_BRAND_LINK,
  options: QUALIFIER_OPTION_LINK,
  skus: QUALIFIER_SKU_LINK,
  products: QUALIFIER_PRODUCT_LINK,
  productTypes: QUALIFIER_PRODUCT_TYPE_LINK,
  excludedBrands: QUALIFIER_EXCLUDED_BRAND_LINK,
  excludedOptions: QUALIFIER_EXCLUDED_OPTION_LINK,
  excludedSkus: QUALIFIER_EXCLUDED_SKU_LINK,
  excludedProducts: QUALIFIER_EXCLUDED_PRODUCT_LINK,
  excludedProductTypes: QUALIFIER_EXCLUDED_PRODUCT_TYPE_LINK,
});

/** The thirteen groupings one link read produces, keyed by folded owner identifier. */
type LinkGrouping = Readonly<Record<LinkSetName, Map<string, string[]>>>;

/**
 * The ten catalog-typed link tables that serve one owner kind.
 *
 * Declared as a keyed set rather than a positional tuple so the read loop can name each collection it
 * is filling, and so adding a table would be a compile error at every site that consumes the set
 * rather than a silently skipped read.
 */
interface CatalogLinkDescriptorSet {
  readonly brands: LinkTableDescriptor;
  readonly options: LinkTableDescriptor;
  readonly skus: LinkTableDescriptor;
  readonly products: LinkTableDescriptor;
  readonly productTypes: LinkTableDescriptor;
  readonly excludedBrands: LinkTableDescriptor;
  readonly excludedOptions: LinkTableDescriptor;
  readonly excludedSkus: LinkTableDescriptor;
  readonly excludedProducts: LinkTableDescriptor;
  readonly excludedProductTypes: LinkTableDescriptor;
}

/** The reward's ten shared catalog tables [model/entity/PromotionReward.cfc:L80-L90]. */
const REWARD_CATALOG_LINK_DESCRIPTORS: CatalogLinkDescriptorSet = Object.freeze({
  brands: REWARD_BRAND_LINK,
  options: REWARD_OPTION_LINK,
  skus: REWARD_SKU_LINK,
  products: REWARD_PRODUCT_LINK,
  productTypes: REWARD_PRODUCT_TYPE_LINK,
  excludedBrands: REWARD_EXCLUDED_BRAND_LINK,
  excludedOptions: REWARD_EXCLUDED_OPTION_LINK,
  excludedSkus: REWARD_EXCLUDED_SKU_LINK,
  excludedProducts: REWARD_EXCLUDED_PRODUCT_LINK,
  excludedProductTypes: REWARD_EXCLUDED_PRODUCT_TYPE_LINK,
});

/** The qualifier's ten [model/entity/PromotionQualifier.cfc:L77-L87]. */
const QUALIFIER_CATALOG_LINK_DESCRIPTORS: CatalogLinkDescriptorSet = Object.freeze({
  brands: QUALIFIER_BRAND_LINK,
  options: QUALIFIER_OPTION_LINK,
  skus: QUALIFIER_SKU_LINK,
  products: QUALIFIER_PRODUCT_LINK,
  productTypes: QUALIFIER_PRODUCT_TYPE_LINK,
  excludedBrands: QUALIFIER_EXCLUDED_BRAND_LINK,
  excludedOptions: QUALIFIER_EXCLUDED_OPTION_LINK,
  excludedSkus: QUALIFIER_EXCLUDED_SKU_LINK,
  excludedProducts: QUALIFIER_EXCLUDED_PRODUCT_LINK,
  excludedProductTypes: QUALIFIER_EXCLUDED_PRODUCT_TYPE_LINK,
});

/** The ten groupings the catalog link reads produce, keyed by folded owner identifier. */
type CatalogLinkGrouping = {
  readonly [Collection in keyof CatalogLinkDescriptorSet]: Map<string, string[]>;
};

/** The eleventh grouping, the reward's alone [model/entity/PromotionReward.cfc:L74]. */
interface RewardCatalogLinkGrouping extends CatalogLinkGrouping {
  readonly eligiblePriceGroups: Map<string, string[]>;
}

/**
 * The order the ten catalog link tables are read in, and therefore the order their statements are
 * emitted in.
 *
 * Fixed and frozen so the emitted statement sequence is a deterministic function of the call rather
 * than of object-key iteration order, which is what lets a suite assert it. The order mirrors the
 * entity's own declaration order - five includes, then five excludes.
 */
const CATALOG_LINK_READ_ORDER: readonly (keyof CatalogLinkDescriptorSet)[] = Object.freeze([
  'brands',
  'options',
  'skus',
  'products',
  'productTypes',
  'excludedBrands',
  'excludedOptions',
  'excludedSkus',
  'excludedProducts',
  'excludedProductTypes',
]);

/**
 * Turn one owner's slice of a catalog grouping into the ten identity-projected collections the entity
 * constructor adopts.
 *
 * A FRESH ARRAY PER COLLECTION PER OWNER, always - the entities adopt by reference and mutate through
 * their `add*`/`remove*` helpers, so sharing one array between two owners would let a mutation on one
 * promotion leak into another.
 *
 * @param grouping the ten groupings, keyed by folded owner identifier.
 * @param ownerID the reward or qualifier identifier, in any casing.
 * @returns the ten collections, each holding identity-complete membership tokens.
 */
function toCatalogLinkSets(grouping: CatalogLinkGrouping, ownerID: string): CatalogLinkSets {
  return {
    brands: toBrandProjections(linkMembersOf(grouping.brands, ownerID)),
    options: toOptionProjections(linkMembersOf(grouping.options, ownerID)),
    skus: toSkuProjections(linkMembersOf(grouping.skus, ownerID)),
    products: toProductProjections(linkMembersOf(grouping.products, ownerID)),
    productTypes: toProductTypeProjections(linkMembersOf(grouping.productTypes, ownerID)),
    excludedBrands: toBrandProjections(linkMembersOf(grouping.excludedBrands, ownerID)),
    excludedOptions: toOptionProjections(linkMembersOf(grouping.excludedOptions, ownerID)),
    excludedSkus: toSkuProjections(linkMembersOf(grouping.excludedSkus, ownerID)),
    excludedProducts: toProductProjections(linkMembersOf(grouping.excludedProducts, ownerID)),
    excludedProductTypes: toProductTypeProjections(
      linkMembersOf(grouping.excludedProductTypes, ownerID),
    ),
  };
}

/**
 * The reward variant: the ten shared collections plus `eligiblePriceGroups`.
 *
 * @param grouping the eleven groupings, keyed by folded owner identifier.
 * @param rewardID the reward identifier, in any casing.
 * @returns the eleven collections, each holding identity-complete membership tokens.
 */
function toRewardCatalogLinkSets(
  grouping: RewardCatalogLinkGrouping,
  rewardID: string,
): RewardCatalogLinkSets {
  return {
    ...toCatalogLinkSets(grouping, rewardID),
    eligiblePriceGroups: toPriceGroupProjections(
      linkMembersOf(grouping.eligiblePriceGroups, rewardID),
    ),
  };
}

/** Ten empty groupings, for the case where there is no owner to key a read by. */
function emptyCatalogLinkGrouping(): CatalogLinkGrouping {
  return {
    brands: new Map<string, string[]>(),
    options: new Map<string, string[]>(),
    skus: new Map<string, string[]>(),
    products: new Map<string, string[]>(),
    productTypes: new Map<string, string[]>(),
    excludedBrands: new Map<string, string[]>(),
    excludedOptions: new Map<string, string[]>(),
    excludedSkus: new Map<string, string[]>(),
    excludedProducts: new Map<string, string[]>(),
    excludedProductTypes: new Map<string, string[]>(),
  };
}

/**
 * Reduce identifiers to the distinct ones, comparing case-insensitively and keeping first-seen
 * order.
 *
 * CFML parity [model/service/PromotionService.cfc:L192-L222]: CFML struct keys are case-insensitive
 * and the promotion engine keys its per-period cache with them, so two identifiers differing only
 * in case are ONE key there and are folded to one key here. Order is preserved so the bound
 * parameter array is a deterministic function of the rows, which is what lets a suite assert it.
 */
function dedupeIdentifiers(identifiers: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];

  for (const identifier of identifiers) {
    const key = foldIdentifier(identifier);

    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(identifier);
    }
  }

  return distinct;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

/**
 * The MySQL implementation of `PromotionRepository`.
 *
 * Eight methods, exactly the eight the port declares, all of them `async` because all eight reach
 * the database. Seven are reads; the eighth, `saveRoundingRule`, is the only write in this file. No
 * NINTH public member exists, and no `roundingRuleRepository` accompanies this file: the port
 * inventory is thirteen, and `getRoundingRuleQuery` together with `saveRoundingRule` are hosted here
 * precisely so it stays thirteen.
 *
 * ★ QUOTE-THEN-REVISE. This read "Seven methods, exactly the seven the port declares ... No eighth
 * public member exists." The port has since gained `saveRoundingRule`, so this class implements
 * eight; the invariant the sentence was protecting - that this class publishes exactly what the port
 * declares and not one member more - is unchanged, and it is the count that had to be re-read off
 * the interface rather than restated from memory. The port's own header carries the full record of
 * why the write was admitted.
 */
export class MysqlPromotionRepository implements PromotionRepository {
  /**
   * The narrow prepared-statement surface every read goes through.
   *
   * JUDGMENT CALL: the executor is a CONSTRUCTOR PARAMETER and never a module singleton, and that is
   * a mandatory design constraint rather than a convenience. It is what makes the emitted statement
   * text and the bound parameter array assertable WITH NO LIVE DATABASE - a suite can implement the
   * three-method interface outright, record each `sql` string and each `params` array and return canned
   * rows. That matters more for this file than for any of its siblings: the statement text IS the
   * behaviour here, because the absent `ORDER BY`, the strict date operators, the four-table
   * exclusion list and the missing tiebreaker are all facts about the text.
   *
   * It also keeps the one sanctioned module-scope pool in `src/repositories/mysql/connection.ts` from
   * leaking into this file. Nothing here imports a pool, builds one, or reads an environment
   * variable, and the single wiring point is the composition root that replaces DI/1's runtime
   * convention scan.
   *
   * The interface exposes no `query` method at all, so parameterization is structural rather than a
   * habit a reviewer has to police. That is the guarantee `<cfqueryparam>` gave the legacy `<cfquery>`
   * bodies, preserved exactly.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * The rounding collaborator every hydrated `RoundingRule` is constructed with.
   *
   * JUDGMENT CALL: injected here rather than resolved inside the hydration, for the same reason as
   * the executor. THIS ADAPTER NEVER ROUNDS ANYTHING: it hands the collaborator to the entity and
   * does nothing else with it. The arithmetic lives in `roundValue` and its two wrappers
   * [model/service/RoundingRuleService.cfc:L79,L84,L88], and the composition root resolves the
   * apparent cycle - the rounding-rule service consumes method 7 of this same port - by wiring that
   * dependency lazily.
   */
  private readonly valueRounder: RoundingRuleValueRounder;

  /**
   * @param executor the prepared-statement executor this repository reads through.
   * @param valueRounder the rounding arithmetic a hydrated `RoundingRule` delegates to.
   */
  constructor(executor: PreparedStatementExecutor, valueRounder: RoundingRuleValueRounder) {
    this.executor = executor;
    this.valueRounder = valueRounder;
  }

  /**
   * Active promotion rewards of the requested types, within their period and promotion windows.
   *
   * Ports [model/dao/PromotionDAO.cfc:L51-L132].
   *
   * THERE IS NO `ORDER BY`, AND THAT ABSENCE IS THE BEHAVIOUR. CFML parity
   * [model/dao/PromotionDAO.cfc:L51-L132]: the legacy applies no `ORDER BY`, no `DISTINCT`, no
   * `LIMIT` and no tiebreaker of any kind, so the order rewards come back in is whatever the ORM
   * produces - and that is not incidental. The promotion engine threads a MUTABLE usage ledger
   * through its whole loop and increments `promotionRewardUsageDetails[rewardID].usedInOrder` in
   * place [model/service/PromotionService.cfc:L297], so whether a later reward is allowed depends
   * on which earlier rewards ran, and the two insertion sorts downstream
   * [model/service/PromotionService.cfc:L266-L294, L301-L329] run in OPPOSITE directions over the
   * results. ADDING AN ORDERING HERE WOULD CHANGE WHICH REWARDS WIN AND THEREFORE CHANGE THE AMOUNT
   * A CUSTOMER IS CHARGED. JUDGMENT CALL: the resulting non-determinism at the boundary of a tie is
   * reproduced deliberately.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L117]: `now()` is CFML SERVER-LOCAL time. ONE instant
   * is captured per invocation and BOUND to every date placeholder, because the legacy captures one
   * value into `params.now` and reuses it across every clause; emitting a SQL `NOW()` per clause
   * would let the clauses disagree. That instant is also what the hydrated period's date predicates
   * read, so the whole invocation agrees on one moment.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L118,L321]: the legacy binds the promotion's active
   * flag TWO DIFFERENT WAYS in this one component - the numeric `1` here and a `cf_sql_bit` `1` in
   * the sale-price statement. Both match the same rows, since Hibernate maps `ormtype="boolean"`
   * [model/entity/Promotion.cfc:L56] to `bit(1)`. Reconciled here to the numeric `1`.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L89,L109,L125,L126]: the legacy reads its own
   * `promotionCodeList` argument unqualified at three of those sites and as
   * `arguments.promotionCodeList` at the fourth; both resolve to the same value.
   *
   * FETCH SHAPE, in full. `promotionPeriod` and `promotion` are materialized by the two
   *   `INNER JOIN`
   * clauses that replace the legacy's two `INNER JOIN FETCH` clauses
   * [model/dao/PromotionDAO.cfc:L66,L68], in the same statement. `roundingRule` is materialized by a
   * `LEFT JOIN` in that statement too. The period's `promotionQualifiers` are materialized by ONE
   * further statement keyed by every period identifier at once. All TWENTY-SEVEN many-to-many
   * collections - three opaque plus eleven catalog on the reward, three opaque plus ten catalog on the
   * qualifier - are materialized by TWENTY-SEVEN further statements, each keyed by every owner
   * identifier at once. That is at most TWENTY-NINE statements per invocation, FIXED, regardless of how
   * many rewards match; there is no per-row lookup anywhere. Only the INVERSE collections are left to
   * the entities' own empty-collection defaults, and the note on `toPromotion` says why. No lazy
   * loading is simulated.
   *
   * @param rewardTypeList comma-delimited reward types to match. An EMPTY list matches nothing and
   *   is short-circuited before any statement is built.
   * @param promotionCodeList comma-delimited promotion codes the caller supplied. An empty list
   *   means "no code was supplied", not "match every code", and it removes two clauses rather than
   *   emptying them.
   * @param qualificationRequired legacy default `false` [model/dao/PromotionDAO.cfc:L54]; when
   *   true, an additional alternation requires a qualifier, a valid supplied code, or an exempt
   *   reward type.
   * @returns The matching rewards, in the engine's own unspecified order.
   */
  async getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]> {
    // The port makes the parameter optional, so the legacy default `false`
    // [model/dao/PromotionDAO.cfc:L54] is applied here explicitly rather than inherited.
    const qualificationIsRequired = qualificationRequired ?? false;

    const noQualRequiredList = deriveNoQualificationRequiredList(rewardTypeList);
    const rewardTypes = tokenizeList(rewardTypeList);
    const promotionCodes = tokenizeList(promotionCodeList);
    const noQualRequiredTypes = tokenizeList(noQualRequiredList);

    // JUDGMENT CALL: an empty `rewardTypeList` returns no rewards WITHOUT issuing a statement, a
    // documented normalization rather than a faithful reproduction. The legacy binds
    // `listToArray('')` into HQL's `IN (:rewardTypeList)`, Hibernate renders that as an
    // unsatisfiable predicate and nothing comes back; positional SQL cannot render the same thing
    // at all, because `IN ()` does not parse, so the OUTCOME is reproduced instead of the
    // mechanism. Nothing else in the method runs, which also means no timestamp is captured for a
    // call that cannot match.
    if (rewardTypes.length < 1) {
      return [];
    }

    // CFML parity [model/dao/PromotionDAO.cfc:L117]: THE SINGLE CAPTURED INSTANT. Read once, here,
    // and bound everywhere a date is compared. `new Date()` appears exactly once in this method.
    const capturedInstant = new Date();

    // The provider the period entity's constructor requires. It reads no clock: it hands back a
    // copy of the instant already captured, so a caller cannot mutate the value the statement was
    // bound with, and every date predicate on every hydrated period agrees with the statement.
    const now = (): Date => new Date(capturedInstant.getTime());

    const clauses: string[] = [
      ACTIVE_REWARD_PROJECTION,
      ACTIVE_REWARD_FROM,
      activeRewardBaseWhereClause(sqlPlaceholderList(rewardTypes.length)),
    ];

    // Text and binds move together, in the legacy's own clause order: the reward types, then the
    // instant twice for the two period bounds [model/dao/PromotionDAO.cfc:L73,L75], then the active
    // flag [model/dao/PromotionDAO.cfc:L118]. Positional binding makes that order load-bearing.
    const params: (string | number | Date)[] = [
      ...rewardTypes,
      capturedInstant,
      capturedInstant,
      1,
    ];

    // The whole alternation [model/dao/PromotionDAO.cfc:L80-L100] is emitted only when
    // qualification is required, and the two `OR` arms inside it only when their list is non-empty:
    // `<cfif len(promotionCodeList)>` at L89 and `<cfif len(noQualRequiredList)>` at L94,
    // reproduced with `cfLen` rather than a TypeScript truthiness check.
    if (qualificationIsRequired) {
      clauses.push(QUALIFIER_EXISTS_CLAUSE);

      // An EMPTY promotion-code list REMOVES this clause rather than emptying it, exactly what the
      // legacy `<cfif len(...)>` does: an emptied `IN ()` would be unparseable, and a clause that
      // matched every code would let coded promotions through unconditionally.
      if (cfLen(promotionCodeList) > 0 && promotionCodes.length > 0) {
        clauses.push(promotionCodeExistsClause(sqlPlaceholderList(promotionCodes.length)));
        params.push(...promotionCodes, capturedInstant, capturedInstant);
      }

      // CFML parity [model/dao/PromotionDAO.cfc:L94,L121]: the emission test and the BIND test are
      // written differently - `len(noQualRequiredList)` guards the clause, and its conjunction with
      // `arguments.qualificationRequired` guards the bind - and they agree because the clause only
      // exists inside that block, which is what nesting this test preserves.
      if (cfLen(noQualRequiredList) > 0 && noQualRequiredTypes.length > 0) {
        clauses.push(noQualificationRequiredClause(sqlPlaceholderList(noQualRequiredTypes.length)));
        params.push(...noQualRequiredTypes);
      }

      clauses.push(CLOSE_GROUP_CLAUSE);
    }

    // Emitted unconditionally [model/dao/PromotionDAO.cfc:L102-L114], whatever the qualification
    // setting: the reward must belong to a promotion with no codes at all, or to one whose code the
    // caller supplied and which is currently valid.
    clauses.push(NO_PROMOTION_CODE_CLAUSE);

    if (cfLen(promotionCodeList) > 0 && promotionCodes.length > 0) {
      clauses.push(promotionCodeExistsClause(sqlPlaceholderList(promotionCodes.length)));
      params.push(...promotionCodes, capturedInstant, capturedInstant);
    }

    clauses.push(CLOSE_GROUP_CLAUSE);

    const rows = await this.executor.execute(clauses.join('\n'), params);

    if (rows.length < 1) {
      return [];
    }

    return this.hydrateActiveRewards(rows, now);
  }

  /**
   * How many times any account has used the promotion behind a promotion period.
   *
   * Ports [model/dao/PromotionDAO.cfc:L134-L185]. The statement itself lives in
   * `sql/promotionUseCounts.sql.ts`; this method resolves the identifiers, executes it and reads
   * the scalar out.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177]: the clause that applies the counted window's
   * UPPER bound is guarded by `not isNull(arguments.promotionPeriod.getStartDateTime())` - a
   * duplicated test of the START date where an END-date test is plainly intended, sitting
   * immediately after the correct start/end pair at L173-L174. A period with a start date but no
   * end date therefore binds a NULL upper bound, and one with an end date but no start date never
   * applies its upper bound at all. The engine compares the resulting count against the period's
   * maximum use count [model/service/PromotionService.cfc:L567], so this decides whether a discount
   * applies. The statement module reproduces it exactly, binding the end value whenever the START
   * value is present.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L134-L296]: THE FOUR USE-COUNT QUERIES ARE ASYMMETRIC
   * IN THREE INDEPENDENT WAYS, none of them harmonized. NULL TOLERANCE: the two PERIOD queries wrap
   * every order-status test in a null-tolerant disjunction while the two CODE queries use a bare
   * `!=`. JOIN SHAPE: see the marker on `getPromotionPeriodAccountUseCount`. DATE WINDOW: only the
   * two period queries narrow by date at all.
   *
   * FETCH SHAPE: NOTHING IS MATERIALIZED - one aggregate scalar.
   *
   * @param promotionPeriod The period whose promotion is counted, which must already be
   *   materialized because the legacy body reaches through it [model/dao/PromotionDAO.cfc:L138].
   * @returns The count. A number, not a boolean.
   * @throws `PromotionAssociationError` when the period's promotion is absent, where the legacy
   *   body raises too.
   */
  async getPromotionPeriodUseCount(promotionPeriod: PromotionPeriod): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: requirePromotionID(promotionPeriod, 'getPromotionPeriodUseCount'),

      // CFML parity [model/dao/PromotionDAO.cfc:L173-L178]: the entity's `undefined` for an absent
      // bound becomes the statement module's `null`, the single spelling it uses for "no date" and
      // the same single state CFML's `isNull()` tests.
      startDateTime: promotionPeriod.getStartDateTime() ?? null,
      endDateTime: promotionPeriod.getEndDateTime() ?? null,
    });

    return await this.executeUseCount(statement, PERIOD_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many times ONE account has used the promotion behind a promotion period.
   *
   * Ports [model/dao/PromotionDAO.cfc:L187-L252].
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L244]: the SAME duplicated `getStartDateTime()` guard
   * as its sibling, in this method's own body, immediately after its own correct start/end pair at
   * L240-L241. BOTH SITES ARE PERIOD METHODS and both are reproduced exactly, with the same
   * consequence for use-limit enforcement.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L134-L252]: THE TWO PERIOD QUERIES JOIN THE PROMOTION
   * DIFFERENTLY. `getPromotionPeriodUseCount` declares an explicit `LEFT JOIN pa.promotion pap` at
   * L144-L145 and filters `pap.promotionID` at L171; THIS one uses the implicit association path
   * `pa.promotion.promotionID` at L238, which Hibernate resolves as an INNER join, so an
   * applied-promotion row whose promotion reference is null is counted by the sibling and silently
   * excluded here. The two join types are NOT unified.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param promotionPeriod The period whose promotion is counted, with its promotion materialized.
   * @param accountID Opaque identifier of the account, which is what the legacy bound after
   *   reducing `required any account` to `getAccountID()` [model/dao/PromotionDAO.cfc:L193].
   * @returns The count. A number, not a boolean.
   * @throws `PromotionAssociationError` when the period's promotion is absent.
   */
  async getPromotionPeriodAccountUseCount(
    promotionPeriod: PromotionPeriod,
    accountID: string,
  ): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: requirePromotionID(promotionPeriod, 'getPromotionPeriodAccountUseCount'),
      startDateTime: promotionPeriod.getStartDateTime() ?? null,
      endDateTime: promotionPeriod.getEndDateTime() ?? null,
      accountID,
    });

    return await this.executeUseCount(statement, PERIOD_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many placed orders have used a promotion code.
   *
   * Ports [model/dao/PromotionDAO.cfc:L254-L272].
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L262]: THE ORDER-STATUS TEST IS A BARE `!=` WITH NO
   * NULL TOLERANCE, unlike either period query. In HQL - and in SQL - a comparison against NULL is
   * UNKNOWN rather than true, so an order whose status system code is null is NOT counted here even
   * though the period queries would count it. Preserved as written.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L259-L260]: the legacy joins `pc.orders`, which
   * `model/entity/PromotionCode.cfc:L68` declares `lazy="extra"`. THAT IS NOT A COLLECTION
   * MATERIALIZATION AND NOT A VIOLATION OF THE STANDING RULE AGAINST MATERIALIZING ONE: the
   * association is an `INNER JOIN` inside an aggregate, no order row is built, and the count is all
   * that crosses the boundary.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L254-L272]: THERE IS NO DATE WINDOW. The code queries
   * count every qualifying order regardless of when it was placed, while both period queries narrow
   * by the period's dates - the third of the three asymmetries.
   *
   * @param promotionCode The code whose use is counted [model/dao/PromotionDAO.cfc:L267].
   * @returns The count. A NUMBER, not a boolean - see the note on `readCount`.
   */
  async getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: promotionCode.getPromotionCodeID(),
    });

    return await this.executeUseCount(statement, CODE_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many placed orders belonging to ONE account have used a promotion code.
   *
   * Ports [model/dao/PromotionDAO.cfc:L274-L296]. Identical in every respect to its sibling above -
   * the same bare `!=` at [model/dao/PromotionDAO.cfc:L284], the same legitimate aggregate join on
   * `pc.orders`, the same absent date window - with the account predicate added
   * [model/dao/PromotionDAO.cfc:L288]. Nothing is materialized; one aggregate scalar.
   *
   * @param accountID Opaque identifier of the account [model/dao/PromotionDAO.cfc:L292].
   * @returns The count. A number, not a boolean.
   */
  async getPromotionCodeAccountUseCount(
    promotionCode: PromotionCode,
    accountID: string,
  ): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: promotionCode.getPromotionCodeID(),
      accountID,
    });

    return await this.executeUseCount(statement, CODE_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * The winning sale-price rows: the lowest sale price per SKU across every unconditional reward.
   *
   * Ports [model/dao/PromotionDAO.cfc:L298-L591]. The statement lives in
   * `sql/salePricePromotionRewards.sql.ts`; this method captures the instant and maps the rows.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L306]: ONE instant, captured once into `timeNow` and
   * reused by the preliminary query and by all six UNION branches. Reproduced exactly -
   *   `new Date()`
   * appears once here and no SQL `NOW()` is emitted.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L317,L319]: THE DATE COMPARISONS HERE ARE INCLUSIVE -
   * `<=` and `>=` - in the preliminary query and in every branch, while THE HQL PATH IN
   * `getActivePromotionRewards` USES STRICT `<` AND `>` [model/dao/PromotionDAO.cfc:L73,L75]. The
   * two paths disagree about the boundary instant and NEITHER IS NORMALIZED.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L359,L390,L423,L456,L497,L538]: all six branches
   * guard the product filter with `structKeyExists(arguments,"productID")` and NO `len()` check, so
   * a PRESENT BUT EMPTY identifier is bound and every branch matches nothing. That behaviour is
   * preserved: no `len()` guard, no default, no early return. The identical wart appears in
   * `model/dao/SkuDAO.cfc:L107-L128`, which makes it a house pattern rather than a slip. In
   * TypeScript, passing `''` reaches the same state.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L527-L533]: THE `'global'` BRANCH'S `NOT EXISTS` LIST
   * COVERS ONLY FOUR OF THE FIVE REWARD LINK TABLES - `SwPromoRewardProduct`, `SwPromoRewardBrand`,
   * `SwPromoRewardOption` and `SwPromoRewardProductType` - AND OMITS `SwPromoRewardSku`. The
   * consequence is observable and money-affecting: a reward linked ONLY to a SKU satisfies the
   * `'sku'` branch AND the `'global'` branch, so a SKU-specific reward is emitted a second time as
   * a global discount against EVERY SKU row, and the per-SKU minimum can then be won by a discount
   * that was never meant to reach that SKU. The four-table list is reproduced EXACTLY by the
   * statement module, which carries the full marker beside the branch it belongs to; NO fifth
   *   `NOT EXISTS`
   * is added here or there.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L307,L328-L330]: the legacy declares a local
   * `salePromotionPeriodIDs`, populates it inside the `<cfloop>`, and then NEVER READS IT AGAIN. It
   * is not declared here, and that is NOT a divergence; it must not be confused with
   * `noQualifierCurrentActivePromotionPeriods`, a DIFFERENT local that IS consumed by the first of
   * the three post-processing steps [model/dao/PromotionDAO.cfc:L556,L558].
   *
   * The three chained in-engine `dbtype="query"` steps [model/dao/PromotionDAO.cfc:L544-L559,
   * L561-L569, L571-L588] become SQL common table expressions in the statement module, which sets
   * both formulations side by side because Node has no query-of-queries equivalent.
   *
   * TIES ARE NOT DISAMBIGUATED. The final step joins the reduced rows back to the per-SKU minimum
   * on SKU and sale price, and [model/dao/PromotionDAO.cfc:L571-L588] carries NO `LIMIT`, NO
   *   `ORDER BY`
   * and NO `DISTINCT` - so two rewards yielding the same minimum both survive and one SKU can
   * legitimately appear more than once. JUDGMENT CALL: no tiebreaker is added, the same
   * load-bearing family as the absent ordering on method 1.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the `productType` branch matches the
   * comma-delimited `productTypeIDPath` with a DIALECT-SPECIFIC concatenation whose MySQL arm is an
   * UNANCHORED substring `LIKE` - `concat('%', <idColumn>, '%')` - with no comma anchoring and no
   * `FIND_IN_SET`, the same idiom as `model/dao/PhysicalDAO.cfc:L121`. The statement module
   * composes it through the fragment accessor in `./dialect.js`, from there rather than from here
   * so that one module owns both the statement and its fragment. NOTE THE MECHANISM DIVERGENCE FROM
   * `materializedIdPath.ts`, which does DELIMITER-AWARE membership in TypeScript: THEY ARE NOT
   * UNIFIED, because that module supplies computation only.
   *
   * FETCH SHAPE: NO ASSOCIATION IS MATERIALIZED and no entity is built - eight flat columns become
   * the port's row projection. `roundingRuleID` is PROJECTED BUT THE RULE IS NOT JOINED and NOT
   * APPLIED: rounding happens downstream [model/service/PromotionService.cfc:L1024-L1028], and a
   * join would widen a reduction whose grouping and join-back are behaviour.
   *
   * @param productID Optional product identifier narrowing every branch. OMIT it for every product;
   *   passing `''` is a real, reachable state that matches nothing.
   * @returns The winning rows, UNROUNDED, with ties left unresolved.
   */
  async getSalePricePromotionRewardsQuery(
    productID?: string,
  ): Promise<SalePricePromotionRewardRow[]> {
    // CFML parity [model/dao/PromotionDAO.cfc:L306]: `var timeNow = now()`, captured once.
    const capturedInstant = new Date();

    // JUDGMENT CALL: KEY PRESENCE IS PRESERVED THROUGH THE CALL. The statement module tests
    // `'productID' in input`, mirroring the legacy `structKeyExists`, and under
    // `exactOptionalPropertyTypes` assigning `undefined` to an optional member does not compile -
    // so the two calls below are how "absent" and "present, possibly empty" stay distinguishable
    // across the boundary. One call with a spread would work and would hide the very distinction
    // the six preserved guards depend on.
    const statement =
      productID === undefined
        ? buildSalePricePromotionRewardsStatement({ now: capturedInstant })
        : buildSalePricePromotionRewardsStatement({ now: capturedInstant, productID });

    const rows = await this.executor.execute(statement.sql, statement.params);

    return rows.map(toSalePricePromotionRewardRow);
  }

  /**
   * Load one rounding rule by its identifier.
   *
   * Ports [model/dao/RoundingRuleDAO.cfc:L51-L67], hosted on this port by design - see the
   * statement constant for the projection-widening decision.
   *
   * JUDGMENT CALL: `undefined` ON A MISS IS A PORT-MANDATED NORMALIZATION. The legacy returns the
   * QUERY OBJECT ITSELF [model/dao/RoundingRuleDAO.cfc:L66], and for an unknown identifier that
   * object is EMPTY rather than null - so the caller's very next line, which reads a column off it
   * [model/service/RoundingRuleService.cfc:L73-L74], RAISES. The port types the method
   * `Promise<RoundingRule | undefined>`, so the raise is NOT reproduced; absence is returned
   * instead, never substituted with a zero value, an empty object or a default rule.
   *
   * FETCH SHAPE: the whole persisted row, no associations - see the statement constant.
   *
   * @param roundingRuleID Identifier of the rule to load; required in the legacy signature
   *   [model/dao/RoundingRuleDAO.cfc:L52].
   * @returns The rule, or `undefined` when there is none.
   */
  async getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined> {
    const rows = await this.executor.execute(ROUNDING_RULE_BY_ID_STATEMENT, [roundingRuleID]);

    // `noUncheckedIndexedAccess` makes this `SqlRow | undefined` and it is narrowed explicitly; a
    // non-null assertion is never used anywhere in this file. An empty result is the documented
    // miss, not a fault.
    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    return toRoundingRule(row, '', ROUNDING_RULE_STATEMENT_LABEL, this.valueRounder);
  }

  /**
   * Method 8. Persists one rounding rule to `SwRoundingRule`.
   *
   * This is the `super.save(argumentcollection=arguments)` half of `saveRoundingRule`
   * [model/service/RoundingRuleService.cfc:L63]. The port records why the write is hosted on this
   * contract rather than on a fourteenth port, and the two statement constants record the
   * entity-metadata authority for their column lists.
   *
   * INSERT, UPDATE OR BOTH-PATHS is decided exactly as the sibling `saveBrand`
   * [src/repositories/mysql/mysqlProductRepository.ts] decides it, and the shape is deliberately
   * copied rather than reinvented: an entity with NO identifier is new and is inserted under a minted
   * one; an entity WITH an identifier is probed, then inserted if no row answers and updated if one
   * does. The probe is not defensive padding - it is what `super.save` did. Hibachi's save reaches
   * the ORM, and Hibernate reconciling a DETACHED entity that carries an identifier issues a select
   * and then an insert or an update depending on what it finds. An adapter that trusted `isNew()`
   * alone would silently update zero rows whenever a caller constructed a rule with a chosen
   * identifier that had never been persisted, and report success.
   *
   * A NEW INSTANCE IS RETURNED, NOT THE ARGUMENT. `roundingRuleID` is immutable on the entity - there
   * is no setter, by design - so a rule that arrived new cannot be told its minted identifier by
   * mutation. It is rebuilt from the values actually written, which is also what makes the returned
   * value trustworthy: every field on it is a field that reached the database.
   *
   * ONE STATEMENT PER PATH, SO NO TRANSACTION IS OPENED HERE. `transaction` exists on the executor
   * now, and wrapping a single atomic statement in one would be cargo cult. Note that this method
   * deliberately does not reach for `this.executor.transaction` even when it is part of a larger unit
   * of work: a caller that needs this write inside one constructs the repository over its `tx`
   * executor, which is why the executor is a constructor parameter.
   *
   * @param rule the rule to persist. Its identifier may be empty, in which case one is minted.
   * @returns a rule carrying the identifier and audit stamps that were actually written.
   */
  async saveRoundingRule(rule: RoundingRule): Promise<RoundingRule> {
    const rowExists = rule.isNew()
      ? false
      : await this.roundingRuleRowExists(rule.getRoundingRuleID());

    if (!rowExists) {
      // [org/Hibachi/HibachiEntity.cfc:L609] ONE timestamp, written to both audit stamps. Two
      // `new Date()` reads would let the pair disagree with itself, which is worse than a coarse
      // value.
      const auditTimestamp = new Date();
      const roundingRuleID = rule.isNew()
        ? generatePersistedIdentifier()
        : rule.getRoundingRuleID();

      // `?? null` on all three populatable columns, deliberately. `ormtype="string"` with no
      // `notnull="true"` [model/entity/RoundingRule.cfc:L53-L55] means the schema admits NULL, and
      // the getters return `string | undefined` to model exactly that. Binding `undefined` is not an
      // option - it is not a `SqlParameter`, and the executor rejects it before the statement is sent
      // - while substituting `''` would write an empty string where the legacy wrote NULL, which
      // `getRoundingRuleDetailsByID` [model/service/RoundingRuleService.cfc:L73-L74] would then hand
      // to `roundValue` as a rounding expression.
      await this.executor.executeMutation(ROUNDING_RULE_INSERT_STATEMENT, [
        roundingRuleID,
        rule.getRoundingRuleName() ?? null,
        rule.getRoundingRuleExpression() ?? null,
        rule.getRoundingRuleDirection() ?? null,
        auditTimestamp,
        auditTimestamp,
      ]);

      return this.rebuildRoundingRule(rule, roundingRuleID, auditTimestamp, auditTimestamp);
    }

    // [org/Hibachi/HibachiEntity.cfc:L662-L667] the modified stamp only. `createdDateTime` is absent
    // from the SET list, so the row keeps the value it already has and the entity keeps reporting it.
    const modifiedDateTime = new Date();

    await this.executor.executeMutation(ROUNDING_RULE_UPDATE_STATEMENT, [
      rule.getRoundingRuleName() ?? null,
      rule.getRoundingRuleExpression() ?? null,
      rule.getRoundingRuleDirection() ?? null,
      modifiedDateTime,
      rule.getRoundingRuleID(),
    ]);

    return this.rebuildRoundingRule(
      rule,
      rule.getRoundingRuleID(),
      rule.getCreatedDateTime(),
      modifiedDateTime,
    );
  }

  /**
   * Does a row already answer to this identifier?
   *
   * The select half of Hibernate's detached-entity reconciliation. It reads the identifier column
   * only: the caller needs existence, not content, and widening the projection would invite a reader
   * to think the row's values matter here.
   *
   * @param roundingRuleID the identifier to probe. Never empty - `isNew()` short-circuits first.
   * @returns whether a row exists.
   */
  private async roundingRuleRowExists(roundingRuleID: string): Promise<boolean> {
    const rows = await this.executor.execute(ROUNDING_RULE_EXISTS_STATEMENT, [roundingRuleID]);

    return rows.length > 0;
  }

  /**
   * Rebuild a rule around the identifier and audit stamps that were written.
   *
   * A NEW INSTANCE, because `roundingRuleID` and both audit stamps are immutable on the entity. Every
   * other field is carried across unchanged - including `priceGroupRates`, whose fetch shape is the
   * empty array the read path documents, since a rounding rule's rates are owned by the price-group
   * repository and reach it from the other direction.
   *
   * @param rule the rule as supplied by the caller, the source of every unwritten field.
   * @param roundingRuleID the identifier that was written - minted for an insert, carried otherwise.
   * @param createdDateTime the creation stamp the row now holds.
   * @param modifiedDateTime the modification stamp that was just written.
   * @returns the persisted rule.
   */
  private rebuildRoundingRule(
    rule: RoundingRule,
    roundingRuleID: string,
    createdDateTime: Date | undefined,
    modifiedDateTime: Date,
  ): RoundingRule {
    return new RoundingRule(
      {
        roundingRuleID,
        roundingRuleName: rule.getRoundingRuleName(),
        roundingRuleExpression: rule.getRoundingRuleExpression(),
        roundingRuleDirection: rule.getRoundingRuleDirection(),
        createdDateTime,
        createdByAccountID: rule.getCreatedByAccountID(),
        modifiedDateTime,
        modifiedByAccountID: rule.getModifiedByAccountID(),
        priceGroupRates: [],
      },
      this.valueRounder,
    );
  }

  /**
   * Hydrate the rows `getActivePromotionRewards` produced into rewards, materializing exactly the
   * associations that method's fetch-shape decision names.
   *
   * FETCH SHAPE - the reward statement, then thirteen reward link statements, then the period
   * qualifier statement and its own thirteen link statements: TWENTY-EIGHT statements, and fixed at
   * twenty-eight however many rewards came back. Each is keyed by the whole deduped owner set, so no
   * statement count anywhere in this method is a function of the row count.
   *
   * INSTANCE SHARING: the three maps below are INVOCATION-SCOPED locals, created here and discarded
   * when the call returns. Two rewards on one period get ONE `PromotionPeriod` object, mirroring the
   * identity Hibernate's session gave the legacy. Nothing is memoized beyond the call - module state
   * on a warm Lambda container would outlive the request. The CATALOG members are the one exception
   * to the sharing, and deliberately: each reward gets its own instances, because the entity adopts
   * each collection by reference for its bidirectional helpers to mutate.
   *
   * @param rows the reward rows `getActivePromotionRewards` read, in the order the database
   *   produced them - deliberately not an order this file imposes.
   * @param now that method's single captured instant, as the provider the period entity requires.
   * @returns the hydrated rewards, in row order.
   */
  private async hydrateActiveRewards(
    rows: readonly SqlRow[],
    now: () => Date,
  ): Promise<PromotionReward[]> {
    const label = ACTIVE_REWARDS_STATEMENT_LABEL;

    // Both key sets are collected in ONE pass and deduped, so every follow-up statement binds each
    // owner exactly once. Reward identifiers are distinct already - every join in the statement is
    // many-to-one, so a reward cannot be duplicated - and they are deduped anyway rather than assumed,
    // because the cost of the assumption being wrong is a mis-keyed collection.
    const rewardIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'spr_promotionRewardID', label)),
    );
    const periodIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'spp_promotionPeriodID', label)),
    );

    // Read sequentially rather than concurrently. The statements are independent, so either would
    // work; sequential emission makes the order a suite observes a deterministic function of the
    // input, which is what lets `tests/integration/repositories` assert the emitted text and the
    // bound arrays in a fixed order against a capturing fake.
    const rewardLinks = await this.readLinkGrouping(
      rewardIDs,
      REWARD_LINK_DESCRIPTORS,
      REWARD_LINK_STATEMENT_LABEL,
    );
    const rewardCatalogLinks = await this.readRewardCatalogLinkGrouping(rewardIDs);
    const qualifiersByPeriod = await this.readPeriodQualifiers(periodIDs);

    const promotions = new Map<string, Promotion>();
    const promotionPeriods = new Map<string, PromotionPeriod>();
    const roundingRules = new Map<string, RoundingRule>();
    const rewards: PromotionReward[] = [];

    for (const row of rows) {
      const promotionKey = foldIdentifier(readIdentifier(row, 'sp_promotionID', label));
      let promotion = promotions.get(promotionKey);

      if (promotion === undefined) {
        promotion = toPromotion(row);
        promotions.set(promotionKey, promotion);
      }

      const periodKey = foldIdentifier(readIdentifier(row, 'spp_promotionPeriodID', label));
      let promotionPeriod = promotionPeriods.get(periodKey);

      if (promotionPeriod === undefined) {
        // A period with no qualifier rows gets a FRESH empty array rather than a shared one: the
        // entity adopts the array by reference so its bidirectional helpers can mutate it, and two
        // periods sharing one array would let a write to either appear on both.
        promotionPeriod = toPromotionPeriod(
          row,
          promotion,
          qualifiersByPeriod.get(periodKey) ?? [],
          now,
        );
        promotionPeriods.set(periodKey, promotionPeriod);
      }

      // The rounding rule arrives through a `LEFT JOIN`, so its identifier column is NULL for every
      // reward that has no rule - the common case. Absence stays absence, no default rule is
      // substituted, and `readOptionalText` distinguishes a null cell from a missing column.
      const roundingRuleID = readOptionalText(row, 'srr_roundingRuleID', label);
      let roundingRule: RoundingRule | undefined;

      if (roundingRuleID !== undefined) {
        const ruleKey = foldIdentifier(roundingRuleID);
        roundingRule = roundingRules.get(ruleKey);

        if (roundingRule === undefined) {
          roundingRule = toRoundingRule(row, 'srr_', label, this.valueRounder);
          roundingRules.set(ruleKey, roundingRule);
        }
      }

      const rewardID = readIdentifier(row, 'spr_promotionRewardID', label);

      rewards.push(
        toPromotionReward(
          row,
          promotionPeriod,
          roundingRule,
          {
            fulfillmentMethodIDs: linkMembersOf(rewardLinks.fulfillmentMethods, rewardID),
            shippingMethodIDs: linkMembersOf(rewardLinks.shippingMethods, rewardID),
            shippingAddressZoneIDs: linkMembersOf(rewardLinks.shippingAddressZones, rewardID),
          },
          toRewardCatalogLinkSets(rewardCatalogLinks, rewardID),
        ),
      );
    }

    return rewards;
  }

  /**
   * Read the thirteen link tables for one set of owners.
   *
   * FETCH SHAPE - THIRTEEN statements, each keyed by EVERY owner identifier at once. The count is a
   * CONSTANT of the method rather than a function of how many owners or how many members there are:
   * one hundred rewards linking one thousand brands between them read in the same thirteen statements
   * one reward linking nothing does. That property is the reason the reads are keyed by the whole
   * owner set instead of being issued per owner, and it is what `mysqlPromotionRepository`'s
   * authoring contract requires of an association materialized at this boundary - a bounded set of
   * collection queries, never an unbounded per-row lookup.
   *
   * Shared by the reward owners and the qualifier owners, which differ only in their descriptors and
   * their label. Both descriptor sets are keyed by `LINK_SET_NAMES`, so both read all thirteen and
   * neither can quietly read twelve.
   *
   * NO `ORDER BY` on any of the thirteen, matching the legacy exactly: not one of the twenty catalog
   * collections declares an `orderby` in its metadata [model/entity/PromotionReward.cfc:L80-L90,
   * model/entity/PromotionQualifier.cfc:L77-L87], so Hibernate imposed none and neither does this.
   * Members arrive in whatever order the database produced them, which is the order the legacy's
   * membership tests saw - and since every one of those tests is an existence check rather than a
   * positional read, the order is not something any behaviour depends on.
   *
   * An empty owner set issues NOTHING and returns empty groupings - `IN ()` is unparseable and
   * `sqlPlaceholderList` refuses a count of zero, so the guard is where the decision has to live.
   * Fresh maps are constructed rather than a shared module-level constant returned.
   *
   * @param ownerIDs the distinct owner identifiers.
   * @param descriptors which thirteen link tables to read - the reward set or the qualifier set.
   * @param statementLabel which family of statement it is, for fault messages.
   * @returns the thirteen groupings, keyed by folded owner identifier.
   */
  private async readLinkGrouping(
    ownerIDs: readonly string[],
    descriptors: LinkDescriptorSet,
    statementLabel: string,
  ): Promise<LinkGrouping> {
    // Built by iterating the name tuple rather than by naming thirteen members thirteen times, which
    // is what keeps the empty-owner branch and the reading branch provably in step: both produce a
    // map for every name in `LINK_SET_NAMES` and neither can produce one for a name the other
    // forgets. `Object.fromEntries` widens its result, so the record is assembled explicitly.
    const grouping: Record<LinkSetName, Map<string, string[]>> = {
      fulfillmentMethods: new Map<string, string[]>(),
      shippingMethods: new Map<string, string[]>(),
      shippingAddressZones: new Map<string, string[]>(),
      brands: new Map<string, string[]>(),
      options: new Map<string, string[]>(),
      skus: new Map<string, string[]>(),
      products: new Map<string, string[]>(),
      productTypes: new Map<string, string[]>(),
      excludedBrands: new Map<string, string[]>(),
      excludedOptions: new Map<string, string[]>(),
      excludedSkus: new Map<string, string[]>(),
      excludedProducts: new Map<string, string[]>(),
      excludedProductTypes: new Map<string, string[]>(),
    };

    if (ownerIDs.length < 1) {
      return grouping;
    }

    const placeholders = sqlPlaceholderList(ownerIDs.length);

    // SEQUENTIAL, and deliberately so. The reads are independent of one another, but issuing them one
    // at a time keeps the emitted statement ORDER deterministic - which is what a suite asserting
    // statement text and bound parameters observes, and what makes a fault attributable to the read
    // that produced it. `LINK_SET_NAMES` fixes that order.
    for (const name of LINK_SET_NAMES) {
      const descriptor = descriptors[name];
      const rows = await this.executor.execute(
        buildLinkStatement(descriptor, placeholders),
        ownerIDs,
      );

      grouping[name] = groupLinkMembers(rows, descriptor, statementLabel);
    }

    return grouping;
  }

  /**
   * Read the ten catalog-typed link tables for one set of owners.
   *
   * TEN statements, each keyed by EVERY owner identifier at once, in the frozen
   * `CATALOG_LINK_READ_ORDER`. The count is fixed by the call's shape - ten - and does not grow with
   * the number of owners or the number of rows any of them returns. No statement is issued per row and
   * no statement is issued per member.
   *
   * WHY SEQUENTIAL AND NOT CONCURRENT. The same reason the three opaque reads are sequential: the
   * executor contract makes no concurrency promise, and sequential emission makes the statement order a
   * suite observes a deterministic function of the input. No performance claim is intended or implied.
   *
   * An empty owner set issues NOTHING and returns ten empty groupings, for the same reason
   * `readLinkGrouping` guards - `IN ()` is unparseable and `sqlPlaceholderList` refuses a count of
   * zero.
   *
   * @param ownerIDs the distinct owner identifiers.
   * @param descriptors which ten link tables to read.
   * @param statementLabel which family of statement it is, for fault messages.
   * @returns the ten groupings, keyed by folded owner identifier.
   */
  private async readCatalogLinkGrouping(
    ownerIDs: readonly string[],
    descriptors: CatalogLinkDescriptorSet,
    statementLabel: string,
  ): Promise<CatalogLinkGrouping> {
    const grouping = emptyCatalogLinkGrouping();

    if (ownerIDs.length < 1) {
      return grouping;
    }

    const placeholders = sqlPlaceholderList(ownerIDs.length);

    for (const collection of CATALOG_LINK_READ_ORDER) {
      const descriptor = descriptors[collection];
      const rows = await this.executor.execute(
        buildLinkStatement(descriptor, placeholders),
        ownerIDs,
      );
      const readMembers = groupLinkMembers(rows, descriptor, statementLabel);

      // The target map is the one `emptyCatalogLinkGrouping` created for this collection, so the
      // members are copied into it rather than the map being replaced - `CatalogLinkGrouping` declares
      // every member `readonly`, and copying keeps that promise while still filling the grouping in
      // one pass.
      for (const [ownerKey, members] of readMembers) {
        grouping[collection].set(ownerKey, members);
      }
    }

    return grouping;
  }

  /**
   * Read the reward's eleven catalog-typed link tables: the shared ten plus `eligiblePriceGroups`.
   *
   * ELEVEN statements, fixed. `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74] is read last
   * so the ten shared statements keep the exact order a qualifier read emits them in, which is what
   * lets one suite assert both owner kinds against the same expected sequence.
   *
   * @param rewardIDs the distinct reward identifiers.
   * @returns the eleven groupings, keyed by folded owner identifier.
   */
  private async readRewardCatalogLinkGrouping(
    rewardIDs: readonly string[],
  ): Promise<RewardCatalogLinkGrouping> {
    const shared = await this.readCatalogLinkGrouping(
      rewardIDs,
      REWARD_CATALOG_LINK_DESCRIPTORS,
      REWARD_CATALOG_LINK_STATEMENT_LABEL,
    );

    if (rewardIDs.length < 1) {
      return { ...shared, eligiblePriceGroups: new Map<string, string[]>() };
    }

    const priceGroupRows = await this.executor.execute(
      buildLinkStatement(REWARD_ELIGIBLE_PRICE_GROUP_LINK, sqlPlaceholderList(rewardIDs.length)),
      rewardIDs,
    );

    return {
      ...shared,
      eligiblePriceGroups: groupLinkMembers(
        priceGroupRows,
        REWARD_ELIGIBLE_PRICE_GROUP_LINK,
        REWARD_CATALOG_LINK_STATEMENT_LABEL,
      ),
    };
  }

  /**
   * Read and assemble the qualifiers of a set of promotion periods.
   *
   * ONE statement for every period at once, plus the three opaque qualifier link reads and the ten
   * catalog qualifier link reads - FOURTEEN statements, fixed. The legacy leaves this collection to
   * Hibernate's lazy loader
   * [model/entity/PromotionPeriod.cfc:L63]; the target does not simulate lazy loading, so it is
   * materialized here where the decision is visible. The promotion engine walks it
   * [model/service/PromotionService.cfc:L549-L627], so a period without it would not qualify at
   * all.
   *
   * @returns period identifier, folded, to its qualifiers in row order. A period with no qualifiers
   *   is simply absent from the map.
   */
  private async readPeriodQualifiers(
    periodIDs: readonly string[],
  ): Promise<Map<string, PromotionQualifier[]>> {
    const grouped = new Map<string, PromotionQualifier[]>();

    if (periodIDs.length < 1) {
      return grouped;
    }

    const rows = await this.executor.execute(
      buildPeriodQualifierStatement(sqlPlaceholderList(periodIDs.length)),
      periodIDs,
    );

    if (rows.length < 1) {
      return grouped;
    }

    const label = PERIOD_QUALIFIER_STATEMENT_LABEL;
    const qualifierIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'promotionQualifierID', label)),
    );
    const qualifierLinks = await this.readLinkGrouping(
      qualifierIDs,
      QUALIFIER_LINK_DESCRIPTORS,
      QUALIFIER_LINK_STATEMENT_LABEL,
    );
    const qualifierCatalogLinks = await this.readCatalogLinkGrouping(
      qualifierIDs,
      QUALIFIER_CATALOG_LINK_DESCRIPTORS,
      QUALIFIER_CATALOG_LINK_STATEMENT_LABEL,
    );

    for (const row of rows) {
      const qualifierID = readIdentifier(row, 'promotionQualifierID', label);
      const qualifier = toPromotionQualifier(
        row,
        {
          fulfillmentMethodIDs: linkMembersOf(qualifierLinks.fulfillmentMethods, qualifierID),
          shippingMethodIDs: linkMembersOf(qualifierLinks.shippingMethods, qualifierID),
          shippingAddressZoneIDs: linkMembersOf(qualifierLinks.shippingAddressZones, qualifierID),
        },
        toCatalogLinkSets(qualifierCatalogLinks, qualifierID),
      );

      const key = foldIdentifier(readIdentifier(row, 'promotionPeriodID', label));
      const existing = grouped.get(key);

      if (existing === undefined) {
        grouped.set(key, [qualifier]);
      } else {
        existing.push(qualifier);
      }
    }

    return grouped;
  }

  /**
   * Execute one use-count statement and read its scalar.
   *
   * Shared by all four count methods, which differ only in the statement and in what they bind.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L184,L251,L270,L295]: the legacy returns `results[1]`,
   * the first row's single column. The equivalent 0-based access is narrowed EXPLICITLY rather than
   * asserted, and the empty case is a decided outcome: an aggregate `COUNT(...)` with no `GROUP BY`
   * always returns exactly one row, so an empty result set means the statement is no longer an
   * unconditional aggregate. That is REPORTED rather than smoothed to zero, because a fabricated
   * zero would tell the engine this promotion has never been used and let a use-limited discount
   * through [model/service/PromotionService.cfc:L567].
   *
   * @throws An error named `PromotionColumnError` when the result set is empty or the count column
   *   is missing or unreadable.
   */
  private async executeUseCount(
    statement: UseCountStatement,
    statementLabel: string,
  ): Promise<number> {
    const rows = await this.executor.execute(statement.sql, statement.params);
    const row = rows[0];

    if (row === undefined) {
      throw new PromotionColumnError(
        'count',
        statementLabel,
        'the result set is empty, and an unconditional aggregate always returns exactly one row',
      );
    }

    return readCount(row, 'count', statementLabel);
  }
}
