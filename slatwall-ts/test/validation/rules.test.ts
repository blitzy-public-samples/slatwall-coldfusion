/**
 * The seven ported Catalog validation documents and the validation-engine semantics that govern
 * them — the executable specification for `src/validation/**`.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/validation/rules.test.ts` | CREATE |
 * "**NET-NEW** — asserts each ported rule, including both method-based SKU rules", and the AAP §0.4.4
 * wildcard row authorises `slatwall-ts/test/**` | CREATE. The corpus under test is fixed by AAP
 * §0.2.1.5, which lists the seven documents as an IMPLICIT scope addition and records the reason:
 * per IR-4 they are behaviour, not configuration — they decide which saves and deletes succeed.
 *
 * =================================================================================================
 * EVERY CASE IN THIS FILE IS NET-NEW COVERAGE. NOTHING HERE IS A PARITY TEST
 * =================================================================================================
 * AAP §0.6.5.2 verified that the legacy suite contains NO test for any validation document, NO
 * `SkuDAOTest`, and no service test for any of the four in-scope services. AAP §0.6.5.3 states the
 * asymmetry without softening it: the extendable legacy signal for this whole slice is a small set of
 * entity tests, issue regressions and one fixture helper — and **not one of those sources exercises a
 * validation rule**, which is the only part of that inventory this file has any claim on. The size of the
 * issue-regression set is `test/regression/issues.test.ts`'s business, not this header's, so no count of
 * it is repeated here. Every `describe` and every case title below carries the label `NET-NEW` in its own
 * text — per case rather than only on the parent — so the ratio AAP §0.8.3.7 asks for is visible line by
 * line and no parity with a legacy assertion is implied anywhere.
 *
 * =================================================================================================
 * TRACEABILITY IS DOCUMENTARY, NOT EMPIRICAL — AND NO RUNTIME COMPARISON WAS PERFORMED
 * =================================================================================================
 * Every legacy locator cited below was established by READING legacy source, never by running it.
 * Three independent facts make that the only available method, and all three are disclosed rather
 * than glossed:
 *   * MXUnit is NOT VENDORED anywhere in this repository, and neither is CFSelenium.
 *     `meta/tests/readme.txt:L1-L7` states that the suite needs MXUnit installed with a mapping
 *     inside CFIDE, plus CFSelenium likewise mapped for the functional folder. Neither mapping
 *     exists here (AAP §0.5.4).
 *   * The Docker/Compose local-development setup the brief cites at `meta/docker/slatwall-local-dev/`
 *     DOES NOT EXIST in this repository. `meta/` contains only `meta/tests/` and `meta/eclipse/`,
 *     there is no Dockerfile and no Compose file anywhere in the tree, and there is no CFML engine on
 *     this host (AAP §0.8.4.1).
 *   * Consequently THE LEGACY SUITE CANNOT BE EXECUTED IN THIS CHECKOUT, so NO RUNTIME BEHAVIOURAL
 *     COMPARISON AGAINST THE LEGACY SUITE WAS PERFORMED and no output of this file was ever diffed
 *     against observed legacy behaviour (AAP §0.6.5.3, §0.8.4.2).
 * What that costs is stated plainly: these assertions pin the PORT against the legacy SOURCE. A
 * reader who wants a behavioural diff against a running Slatwall must obtain a CFML runtime first.
 *
 * =================================================================================================
 * HOW THIS FILE IS ORGANISED
 * =================================================================================================
 *   A  — the rule corpus: seven documents, seven property containers, thirteen constraint and
 *        selection keys counted against the source documents, the seven `unique` locators, and the
 *        one shared code-format regular expression.
 *   B  — per-document declarations, the four `physicalCounts` guards, and the context-only Product
 *        gates.
 *   C  — context selection, rule flattening, condition evaluation, error accumulation and M7
 *        request scope.
 *   D  — the conditional process document and CFML loose equality.
 *   E  — the eleven-row evaluator and null-semantics matrix.
 *   F  — both SKU method rules, D19, and M6 same-transaction visibility.
 *   G  — uniqueness SQL and port behaviour.
 *   H  — raw message keys, the error bag, and validate-gate-persist.
 *
 * =================================================================================================
 * EVERY CASE BUILDS ITS OWN COLLABORATORS. THERE IS NO MODULE-SCOPE MUTABLE STATE
 * =================================================================================================
 * No repository, uniqueness seed, entity, error bag, map or counter is declared at module scope.
 * Each case calls a factory and gets a fresh graph. The only module-level bindings are immutable
 * literals and pure functions.
 *
 * That discipline answers what the legacy harness did NOT do. Both of its lifecycle hooks are
 * commented out in the source — `//variables.slatwallFW1Application.reloadApplication();` at
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L53` and
 * `//variables.slatwallFW1Application.endSlatwallLifecycle();` at `:L70` — so application and request
 * scope persisted across an entire run and one case could observe what another left behind. AAP
 * §0.6.6 M7 makes the same hazard a production concern: nothing survives a Lambda invocation except
 * module-scope state, and a memo on a warm container is shared across invocations. Section C4 exists
 * to prove this engine carries nothing across.
 *
 * =================================================================================================
 * DEPENDENCIES ARE EXPLICIT AND TYPED. NOTHING IS MOCKED AT THE MODULE LEVEL
 * =================================================================================================
 * `Validator` is the REAL class, constructed with its one real collaborator through its constructor
 * (AAP §0.7.3, explicit dependency injection). `ValidationError` is the REAL error bag. The seven
 * rule modules are the REAL frozen declarations. There is no `jest.mock`, no module replacement, no
 * string-keyed service resolution and no global registry anywhere in this file. Substitution happens
 * only where a genuine boundary exists, through the doubles exported by
 * `test/support/inMemoryRepositories.ts`.
 */

import { MySqlSkuRepository } from '../../src/adapters/mysql/MySqlSkuRepository';
import { createOptionGroupSortOrderMemo } from '../../src/adapters/mysql/MySqlSkuRepository';
import { assertColumnName, assertTableName } from '../../src/adapters/mysql/QueryRunner';
import { UniquePropertyChecker } from '../../src/adapters/mysql/UniquePropertyChecker';
import { BRAND_PROPERTY_DESCRIPTORS } from '../../src/domain/product/Brand';
import { SKU_UNSAVED_ID_VALUE } from '../../src/domain/sku/Sku';
import { ValidationError } from '../../src/errors/ValidationError';
import { BaseService } from '../../src/services/BaseService';
import { Validator, buildValidationMessage } from '../../src/validation/Validator';
import {
  brandValidationRules,
  createBrandValidationRules,
  physicalCountsPropertyValidation as brandPhysicalCountsValidation,
  resolveBrandUniqueTarget,
} from '../../src/validation/rules/brand.rules';
import {
  optionCodeRegexConstraint,
  optionValidationRuleSet,
} from '../../src/validation/rules/option.rules';
import {
  optionGroupCodeRegexConstraint,
  optionGroupValidationRuleSet,
} from '../../src/validation/rules/optionGroup.rules';
import {
  CODE_FORMAT_REGEX,
  physicalCountsValidation as productPhysicalCountsValidation,
  productCodeRegexConstraint,
  productValidationRuleSet,
} from '../../src/validation/rules/product.rules';
import {
  physicalCountsValidation as productTypePhysicalCountsValidation,
  productTypeValidationRuleSet,
  systemCodeMaxLengthConstraint,
} from '../../src/validation/rules/productType.rules';
import {
  LIST_PRICE_DATA_TYPE_MESSAGE_KEY,
  LIST_PRICE_REQUIRED_MESSAGE_KEY,
  PRICE_DATA_TYPE_MESSAGE_KEY,
  PRICE_REQUIRED_MESSAGE_KEY,
  PRODUCT_UPDATE_SKUS_LIST_PRICE_RB_KEY,
  PRODUCT_UPDATE_SKUS_PRICE_RB_KEY,
  SHOW_LIST_PRICE_CONDITION_NAME,
  SHOW_PRICE_CONDITION_NAME,
  productUpdateSkusValidationRuleSet,
} from '../../src/validation/rules/productUpdateSkus.rules';
import {
  createHasUniqueOptionsConstraint,
  createSkuValidationRules,
  hasOneOptionPerOptionGroupMethodConstraint,
  physicalCountsPropertyValidation as skuPhysicalCountsValidation,
  resolveSkuUniqueTarget,
} from '../../src/validation/rules/sku.rules';
import { MERCHANDISE_PRODUCT_TYPE, SUBSCRIPTION_PRODUCT_TYPE } from '../fixtures/productTypes';
import {
  TEST_MERCHANDISE_PRODUCT_CODE,
  TEST_MERCHANDISE_PRODUCT_NAME,
} from '../fixtures/testProduct';
import {
  buildBrand,
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createAbsentAccountContextDouble,
  createBaseServicePersistenceDouble,
  createInMemorySkuRepository,
  createManagedBrand,
  createPopulationAuthorizationDouble,
  createPricingDouble,
  createProductTypeRootResolverDouble,
  createSkusBySelectedOptionsLookup,
  createSqlExecutorDouble,
  createUniquePropertyDouble,
  createUnitOfWorkDouble,
  createValidatorHarness,
  sqlRows,
} from '../support/inMemoryRepositories';

import type { BrandPropertyName } from '../../src/domain/product/Brand';
import type { ManagedBrand } from '../../src/services/BrandService';
import type { UniquePropertyEntity } from '../../src/ports/UniquePropertyPort';
import type { SqlExecutorDouble, UniquePropertyValueSeed } from '../support/inMemoryRepositories';
import type { Product } from '../../src/domain/product/Product';
import type { Sku, SkusBySelectedOptionsLookup } from '../../src/domain/sku/Sku';
import type { BrandValidationSubject } from '../../src/validation/rules/brand.rules';
import type { OptionValidationSubject } from '../../src/validation/rules/option.rules';
import type { OptionGroupValidationSubject } from '../../src/validation/rules/optionGroup.rules';
import type { ProductValidationSubject } from '../../src/validation/rules/product.rules';
import type { ProductTypeValidationSubject } from '../../src/validation/rules/productType.rules';
import type { ProductUpdateSkusValidationSubject } from '../../src/validation/rules/productUpdateSkus.rules';
import type { SkuValidationSubject } from '../../src/validation/rules/sku.rules';
import type {
  Constraint,
  PropertyValidation,
  ValidationCondition,
  ValidationContext,
  ValidationRuleSet,
  ValidationSubject,
} from '../../src/validation/Validator';

/* ================================================================================================
 * LOCAL TEST VOCABULARY
 *
 * Everything below is a pure function or an immutable literal, declared in this file because the
 * brief forbids a helper module and because none of it belongs in production source. Nothing here
 * reimplements the error bag, a repository, a unit of work, a SQL executor, the pricing port or the
 * uniqueness port: those all come from the real implementations or from
 * `test/support/inMemoryRepositories.ts`.
 * ============================================================================================== */

/**
 * Reads the first element of a readonly array without a non-null assertion.
 *
 * `tsconfig.json` sets `noUncheckedIndexedAccess`, so `array[0]` is `T | undefined`, and the brief
 * forbids `!`. Raising on an empty input is deliberate: a rule module that lost its first rule
 * should fail loudly here rather than silently assert against `undefined`.
 */
function first<T>(items: readonly T[]): T {
  const [head] = items;
  if (head === undefined) {
    throw new Error('expected at least one element');
  }
  return head;
}

/**
 * The narrow structural view of a rule set used for census and declaration assertions.
 *
 * Deliberately NOT a second production schema (the brief forbids one). It is a READ-ONLY projection
 * that every `ValidationRuleSet<TSubject>` already satisfies structurally, which is what lets seven
 * rule sets over seven different subject types be traversed by one loop. The value readers and
 * unique-target resolvers each rule set carries are simply not named here, because a census does not
 * read values.
 */
interface CensusConstraint {
  readonly constraintType: string;
  readonly constraintValue: unknown;
}

interface CensusRule {
  readonly contexts?: string;
  readonly conditions?: string;
  readonly constraints: readonly CensusConstraint[];
}

interface CensusProperty {
  readonly propertyIdentifier: string;
  readonly rules: readonly CensusRule[];
}

interface CensusConditionConstraint {
  readonly propertyIdentifier: string;
  readonly constraint: CensusConstraint;
}

interface CensusCondition {
  readonly name: string;
  readonly constraints: readonly CensusConditionConstraint[];
}

interface CensusRuleSet {
  readonly properties: readonly CensusProperty[];
  readonly conditions?: readonly CensusCondition[];
}

/** One normalised rule: its context selector, its condition selector, and its constraint pairs. */
type NormalisedRule = readonly [
  contexts: string | undefined,
  conditions: string | undefined,
  constraints: readonly (readonly [type: string, value: unknown])[],
];

/** One normalised property: its identifier and every rule declared against it, in source order. */
type NormalisedProperty = readonly [propertyIdentifier: string, rules: readonly NormalisedRule[]];

/**
 * Projects a rule set into a plain, comparable literal so a whole document can be asserted in one
 * expression, in the source document's own property and key order.
 *
 * Order is preserved on purpose rather than sorted — see section C2, where the target's deterministic
 * source-order evaluation is pinned as an intentional decision.
 */
function normaliseRuleSet(ruleSet: CensusRuleSet): readonly NormalisedProperty[] {
  return ruleSet.properties.map((property): NormalisedProperty => [
    property.propertyIdentifier,
    property.rules.map((rule): NormalisedRule => [
      rule.contexts,
      rule.conditions,
      rule.constraints.map((constraint) => [constraint.constraintType, constraint.constraintValue]),
    ]),
  ]);
}

/**
 * The five UUID-and-metadata accessors `../../src/ports/UniquePropertyPort` requires of any subject a
 * `unique` constraint can be evaluated against — the port of the five reads
 * `org/Hibachi/HibachiDAO.cfc:L134-L138` performs.
 */
function uniqueEntityAccessors(
  entityName: string,
  primaryIDPropertyName: string,
  primaryIDValue: string,
  values: Readonly<Record<string, unknown>>,
): UniquePropertyEntity {
  return {
    getPropertyMetaData: (propertyName: string) => ({ name: propertyName }),
    getEntityName: () => entityName,
    getPrimaryIDValue: () => primaryIDValue,
    getPrimaryIDPropertyName: () => primaryIDPropertyName,
    getValueByPropertyIdentifier: (propertyIdentifier: string) => values[propertyIdentifier],
  };
}

/**
 * A minimal typed validation subject for exercising generic engine semantics.
 *
 * Permitted by the brief precisely because the eleven-row matrix and the flattening, condition and
 * scope cases are ENGINE behaviour rather than document behaviour, and because the realized
 * `Validator` exports NO per-constraint evaluator — `Validator.validate()` is the only public
 * evaluator seam, so a single-constraint rule set over a single-property subject is the narrowest way
 * to reach one evaluator at a time. It uses only public `Validator` types, declares no `any`, carries
 * no compiler suppression and lives in this file rather than in a helper module.
 */
type MatrixSubject = ValidationSubject &
  UniquePropertyEntity & {
    readonly value?: unknown;
    /** Stands in for a domain method rule; see row 10 of the matrix. */
    probe(...args: readonly unknown[]): unknown;
  };

interface MatrixSubjectOptions {
  /** The value the single property reader returns. */
  readonly value?: unknown;
  /** `false` makes `hasProperty` answer false for every name — the absent-property case. */
  readonly present?: boolean;
  /** What the stand-in method rule resolves to. */
  readonly methodResult?: unknown;
  /** Records the arguments the stand-in method rule was called with. */
  readonly methodCalls?: unknown[][];
  /** The primary identifier the uniqueness accessors report; `''` models an unsaved row. */
  readonly primaryIDValue?: string;
}

const MATRIX_CLASS_NAME = 'MatrixSubject';
const MATRIX_ENTITY_NAME = 'SlatwallMatrixSubject';
const MATRIX_PROPERTY = 'value';

function matrixSubject(options: MatrixSubjectOptions = {}): MatrixSubject {
  const {
    value,
    present = true,
    methodResult = true,
    methodCalls,
    primaryIDValue = 'matrix-id',
  } = options;

  return {
    ...uniqueEntityAccessors(MATRIX_ENTITY_NAME, 'matrixID', primaryIDValue, {
      [MATRIX_PROPERTY]: value,
    }),
    getClassName: () => MATRIX_CLASS_NAME,
    hasProperty: () => present,
    value,
    probe: (...args: readonly unknown[]): unknown => {
      methodCalls?.push([...args]);
      return methodResult;
    },
  };
}

/** A rule set holding exactly one constraint against `value`, selected by the `save` context. */
function matrixRuleSet(constraint: Constraint<MatrixSubject>): ValidationRuleSet<MatrixSubject> {
  return {
    properties: [
      {
        propertyIdentifier: MATRIX_PROPERTY,
        read: (subject) => subject.value,
        rules: [{ contexts: 'save', constraints: [constraint] }],
      },
    ],
  };
}

/**
 * Runs one constraint against one value and answers whether the engine recorded a failure.
 *
 * Every row of the eleven-row matrix funnels through here, so each row asserts the SAME public seam
 * and a row cannot accidentally test a different code path from its neighbour.
 */
async function evaluate(
  constraint: Constraint<MatrixSubject>,
  options: MatrixSubjectOptions,
): Promise<boolean> {
  const harness = createValidatorHarness();
  const errors = await harness.validateDryRun(
    matrixSubject(options),
    matrixRuleSet(constraint),
    'save',
  );
  return !errors.hasError(MATRIX_PROPERTY);
}

/** Convenience wrapper for the common `{ value }`-only shape. */
function passes(constraint: Constraint<MatrixSubject>, value: unknown): Promise<boolean> {
  return evaluate(constraint, { value });
}

/**
 * Builds the Sku rule set, which — alone among the seven — has NO static export.
 *
 * `createSkuValidationRules` is a factory because two of its constraints need collaborators the
 * document cannot supply: the uniqueness target resolver and the selected-options lookup that the
 * `hasUniqueOptions` method rule reads through (AAP §0.6.2, M6).
 */
function skuRuleSetFor<TSubject extends SkuValidationSubject & UniquePropertyEntity = Sku>(
  lookupProductId: string,
): {
  readonly ruleSet: ValidationRuleSet<TSubject>;
  readonly repository: ReturnType<typeof createInMemorySkuRepository>;
} {
  const repository = createInMemorySkuRepository({});
  const lookup = createSkusBySelectedOptionsLookup(repository.repository, lookupProductId);
  return {
    repository,
    ruleSet: createSkuValidationRules<TSubject>(
      (subject) => resolveSkuUniqueTarget(subject),
      lookup,
    ),
  };
}

/** The seven rule sets, keyed by the legacy class stem each document is named for. */
function allRuleSets(): readonly (readonly [className: string, ruleSet: CensusRuleSet])[] {
  const { ruleSet: skuRuleSet } = skuRuleSetFor('census-product');

  return [
    ['Product', productValidationRuleSet],
    ['Sku', skuRuleSet],
    ['Brand', brandValidationRules],
    ['Option', optionValidationRuleSet],
    ['OptionGroup', optionGroupValidationRuleSet],
    ['ProductType', productTypeValidationRuleSet],
    ['Product_UpdateSkus', productUpdateSkusValidationRuleSet],
  ];
}

/**
 * Tallies every constraint key and every selection key across the whole corpus.
 *
 * The counting rule matters and is stated here so the numbers in section A can be checked against the
 * JSON by hand: ONE `contexts` per rule object that declares one; ONE `conditions` per rule object
 * that declares a selector PLUS one for a document's condition-definition block; one entry per
 * constraint inside a rule object; and one entry per constraint inside a condition definition. That
 * is why `eq` counts five — three delete guards plus the two condition predicates of the process
 * document — and why post-flattening duplicates are never counted.
 */
function censusOf(
  ruleSets: readonly (readonly [string, CensusRuleSet])[],
): ReadonlyMap<string, number> {
  const tally = new Map<string, number>();
  const bump = (key: string): void => {
    tally.set(key, (tally.get(key) ?? 0) + 1);
  };

  for (const [, ruleSet] of ruleSets) {
    bump('properties');
    for (const property of ruleSet.properties) {
      for (const rule of property.rules) {
        if (rule.contexts !== undefined) {
          bump('contexts');
        }
        if (rule.conditions !== undefined) {
          bump('conditions');
        }
        for (const constraint of rule.constraints) {
          bump(constraint.constraintType);
        }
      }
    }
    if (ruleSet.conditions !== undefined) {
      bump('conditions');
      for (const condition of ruleSet.conditions) {
        for (const conditionConstraint of condition.constraints) {
          bump(conditionConstraint.constraint.constraintType);
        }
      }
    }
  }

  return tally;
}

/** Every `(className, propertyIdentifier)` pair carrying a `unique` constraint, in corpus order. */
function uniqueConstraintSites(
  ruleSets: readonly (readonly [string, CensusRuleSet])[],
): readonly string[] {
  const sites: string[] = [];
  for (const [className, ruleSet] of ruleSets) {
    for (const property of ruleSet.properties) {
      for (const rule of property.rules) {
        for (const constraint of rule.constraints) {
          if (constraint.constraintType === 'unique') {
            sites.push(`${className}.${property.propertyIdentifier}`);
          }
        }
      }
    }
  }
  return sites;
}

/**
 * The legacy resource-bundle classification token, reproduced here for comparison ONLY.
 *
 * `org/Hibachi/HibachiValidationService.cfc:L212-L218` selects `rbKey('entity.<class>')` for a
 * persistent object and `rbKey('processObject.<class>')` for anything else, and puts the result into
 * the SUBSTITUTION STRUCT — never into the message key. DECISION D-1 skips the substitution pass
 * entirely, so the realized `src/validation/Validator.ts` never emits this token; there is no
 * production API that produces it and inventing one would be capability beyond the migration. The
 * function exists so section H can assert both halves of the separation: the token a legacy resource
 * lookup would have used, and the fact that no emitted message contains it.
 */
function legacyClassificationToken(className: string, persistent: boolean): string {
  return persistent ? `entity.${className}` : `processObject.${className}`;
}

/* ================================================================================================
 * SECTION A — THE DECLARATIVE RULE CORPUS
 * ============================================================================================== */

describe('NET-NEW — A. the declarative rule corpus: seven documents and thirteen keys', () => {
  it('NET-NEW — AAP §0.2.1.5 — represents EXACTLY seven rule modules, one per validation document', () => {
    const ruleSets = allRuleSets();

    expect(ruleSets.map(([className]) => className)).toStrictEqual([
      // `model/validation/Product.json`
      'Product',
      // `model/validation/Sku.json`
      'Sku',
      // `model/validation/Brand.json`
      'Brand',
      // `model/validation/Option.json`
      'Option',
      // `model/validation/OptionGroup.json`
      'OptionGroup',
      // `model/validation/ProductType.json`
      'ProductType',
      // `model/validation/Product_UpdateSkus.json`
      'Product_UpdateSkus',
    ]);
    expect(ruleSets).toHaveLength(7);
  });

  it('NET-NEW — AAP §0.2.1.5 — declares NO eighth document and NO barrel or shared-helper module', () => {
    // AAP §0.2.1.5 records the subtlety that is easiest to mistake for an omission: the two
    // add-option process contexts have NO validation document of their own. Their rules are declared
    // as CONTEXT-SCOPED rules inside `model/validation/Product.json` — `:L4` for the base-type gate
    // and `:L13`/`:L14` for the two minimum-collection gates — which is why section B3 exercises them
    // through the Product rule set and why the corpus stops at seven.
    //
    // AAP §0.2.2.4 additionally excludes five sibling catalog documents that live in the same legacy
    // directory, so `model/validation/` holding more than seven files is expected and is not a gap.
    expect(allRuleSets()).toHaveLength(7);

    // Nothing in the corpus is a re-export of another member: seven distinct object identities.
    const identities = new Set(allRuleSets().map(([, ruleSet]) => ruleSet));
    expect(identities.size).toBe(7);
  });

  it('NET-NEW — every one of the seven rule sets exposes a structural `properties` container', () => {
    for (const [className, ruleSet] of allRuleSets()) {
      expect(Array.isArray(ruleSet.properties)).toBe(true);
      expect(ruleSet.properties.length).toBeGreaterThan(0);
      // Each entry is a property validation carrying an identifier and at least one rule.
      for (const property of ruleSet.properties) {
        expect(typeof property.propertyIdentifier).toBe('string');
        expect(property.propertyIdentifier.length).toBeGreaterThan(0);
        expect(property.rules.length).toBeGreaterThan(0);
      }
      expect(className.length).toBeGreaterThan(0);
    }

    expect(censusOf(allRuleSets()).get('properties')).toBe(7);
  });

  it('NET-NEW — the thirteen verified constraint and selection keys carry their exact source-document counts', () => {
    const census = censusOf(allRuleSets());

    // Counted against the SOURCE DOCUMENTS, one entry per original declaration, never per
    // post-flattening duplicate. Each locator list below was read from the JSON, not recalled.
    expect(Object.fromEntries([...census.entries()].sort())).toStrictEqual({
      // One per rule object that declares a context selector. Twelve in Product.json, nine in
      // Sku.json, five in Brand.json, four in Option.json, three in OptionGroup.json, six in
      // ProductType.json, and zero in Product_UpdateSkus.json.
      contexts: 39,
      // The condition-definition block at `model/validation/Product_UpdateSkus.json:L2` plus the two
      // rule-level selectors at `:L11` and `:L12`.
      conditions: 3,
      // Product 5, Sku 2, Brand 2, Option 3, OptionGroup 2, ProductType 2, Product_UpdateSkus 2.
      required: 18,
      // The seven application-side uniqueness constraints enumerated in the next case.
      unique: 7,
      // Product 1, Sku 1, Brand 2, Option 1, OptionGroup 1, ProductType 3.
      maxCollection: 9,
      // Product 1 (numeric), Sku 3 (numeric), Brand 1 (url), Product_UpdateSkus 2 (numeric).
      dataType: 7,
      // Three delete guards — `Product.json:L12`, `Sku.json:L3`, `Sku.json:L12` — plus the two
      // condition predicates of the process document, which are `eq` constraints too.
      eq: 5,
      // `Product.json:L10`, `Option.json:L3`, `OptionGroup.json:L4`.
      regex: 3,
      // `Sku.json:L4`, `:L9`, `:L10`.
      minValue: 3,
      // `Product.json:L13`, `:L14`, `:L15`.
      minCollection: 3,
      // Both method rules of `Sku.json:L5-L8`.
      method: 2,
      // Both base-type gates of `Product.json:L3-L6`.
      inList: 2,
      // `ProductType.json:L7` — the system-code delete guard, the only one in the corpus.
      maxLength: 1,
      properties: 7,
    });
  });

  it('NET-NEW — introduces NO fourteenth supported constraint anywhere in the corpus', () => {
    const supported = new Set([
      'required',
      'unique',
      'maxCollection',
      'dataType',
      'eq',
      'regex',
      'minValue',
      'minCollection',
      'method',
      'inList',
      'maxLength',
    ]);
    // Eleven constraint kinds plus the two SELECTION keys `contexts` and `conditions` make the
    // thirteen of the previous case. S9 forbids adding a twelfth constraint kind, so the corpus is
    // asserted to contain nothing outside this closed set.
    const observed = new Set(
      [...censusOf(allRuleSets()).keys()].filter(
        (key) => key !== 'contexts' && key !== 'conditions' && key !== 'properties',
      ),
    );

    expect([...observed].sort()).toStrictEqual([...supported].sort());
    expect(observed.size).toBe(11);
  });
});

describe('NET-NEW — A2. the seven application-side `unique` constraints and the IR-5 reconciliation', () => {
  it('NET-NEW — all SEVEN validation-document `unique` locators are declared, and Product_UpdateSkus contributes zero', () => {
    // G6 — WHY SEVEN, AND WHY THE COUNT IS WORTH ASSERTING ON ITS OWN. The corpus is easy to undercount
    // as six by overlooking Product `urlTitle`, so all seven sites are enumerated below with the locator
    // each was read from, and the count is asserted rather than described.
    //
    // IR-5 RECONCILED. AAP IR-5 says "five of the eight unique columns declared in the whole system
    // belong to this slice". That sentence counts ORM COLUMN METADATA — the `unique="true"` attribute
    // on an entity property, enforced by the database. The seven below are APPLICATION-SIDE `unique`
    // constraints declared in the validation documents and enforced by an HQL existence query at
    // `org/Hibachi/HibachiDAO.cfc:L140` during validation. They are two INDEPENDENT enforcement
    // mechanisms with different counts, and both statements are correct about different things.
    // Seven governs here, because this file tests the validation documents.
    expect(uniqueConstraintSites(allRuleSets())).toStrictEqual([
      // `model/validation/Product.json:10`
      'Product.productCode',
      // `model/validation/Product.json:16`
      'Product.urlTitle',
      // `model/validation/Sku.json:11`
      'Sku.skuCode',
      // `model/validation/Brand.json:5`
      'Brand.urlTitle',
      // `model/validation/Option.json:3`
      'Option.optionCode',
      // `model/validation/OptionGroup.json:4`
      'OptionGroup.optionGroupCode',
      // `model/validation/ProductType.json:4`
      'ProductType.urlTitle',
    ]);
  });

  it('NET-NEW — `model/validation/Product_UpdateSkus.json` declares no `unique` constraint at all', () => {
    expect(
      uniqueConstraintSites([['Product_UpdateSkus', productUpdateSkusValidationRuleSet]]),
    ).toStrictEqual([]);
  });

  it.each([
    [
      'Product.productCode — model/validation/Product.json:10',
      'Product',
      'productCode',
      'SlatwallProduct',
      'productID',
    ],
    [
      'Product.urlTitle — model/validation/Product.json:16',
      'Product',
      'urlTitle',
      'SlatwallProduct',
      'productID',
    ],
    ['Sku.skuCode — model/validation/Sku.json:11', 'Sku', 'skuCode', 'SlatwallSku', 'skuID'],
    [
      'Brand.urlTitle — model/validation/Brand.json:5',
      'Brand',
      'urlTitle',
      'SlatwallBrand',
      'brandID',
    ],
    [
      'Option.optionCode — model/validation/Option.json:3',
      'Option',
      'optionCode',
      'SlatwallOption',
      'optionID',
    ],
    [
      'OptionGroup.optionGroupCode — model/validation/OptionGroup.json:4',
      'OptionGroup',
      'optionGroupCode',
      'SlatwallOptionGroup',
      'optionGroupID',
    ],
    [
      'ProductType.urlTitle — model/validation/ProductType.json:4',
      'ProductType',
      'urlTitle',
      'SlatwallProductType',
      'productTypeID',
    ],
  ])(
    'NET-NEW — %s delegates through the injected UniquePropertyPort, and `false` is the failure',
    async (_label, className, propertyName, entityName, primaryIDPropertyName) => {
      // POLARITY, PINNED. `org/Hibachi/HibachiDAO.cfc:L142-L144` returns FALSE when the existence
      // query finds rows and `:L146` returns TRUE when it finds none, and `validate_unique` at
      // `org/Hibachi/HibachiValidationService.cfc:L467-L470` returns that verdict UNMODIFIED. So
      // `true` means unique and therefore SAFE TO SAVE. Inverting it is silent — every uniqueness
      // rule in the slice would pass when it should fail — which is why this case exercises the
      // COLLIDING path: a test that only covered the non-colliding path would pass under either
      // polarity.
      const taken = 'already-taken-value';
      const collidingSubject: ValidationSubject & UniquePropertyEntity = {
        ...uniqueEntityAccessors(entityName, primaryIDPropertyName, 'mine', {
          [propertyName]: taken,
        }),
        getClassName: () => className,
        hasProperty: (identifier: string) => identifier === propertyName,
      };
      const uniqueConstraint: Constraint<ValidationSubject & UniquePropertyEntity> = {
        constraintType: 'unique',
        constraintValue: true,
        uniqueTarget: (subject) => subject,
      };
      const ruleSet: ValidationRuleSet<ValidationSubject & UniquePropertyEntity> = {
        properties: [
          {
            propertyIdentifier: propertyName,
            read: (subject) => subject.getValueByPropertyIdentifier(propertyName),
            rules: [{ contexts: 'save', constraints: [uniqueConstraint] }],
          },
        ],
      };

      // Seeded against a DIFFERENT primary identifier, which is what makes it a genuine collision
      // rather than the row validating itself.
      const colliding = createValidatorHarness([
        { entityName, propertyName, value: taken, entityID: 'someone-else' },
      ]);
      const collidingErrors = await colliding.validateDryRun(collidingSubject, ruleSet, 'save');

      expect(collidingErrors.getError(propertyName)).toStrictEqual([
        `validate.save.${className}.${propertyName}.unique`,
      ]);
      // The port was consulted with the five values `org/Hibachi/HibachiDAO.cfc:L134-L138` reads.
      expect(colliding.uniqueProperty.calls).toStrictEqual([
        {
          propertyName,
          resolvedPropertyName: propertyName,
          entityName,
          entityID: 'mine',
          value: taken,
        },
      ]);

      // And the same subject against an unseeded store: `true` from the port means safe to save.
      const free = createValidatorHarness();
      const freeErrors = await free.validateDryRun(collidingSubject, ruleSet, 'save');
      expect(freeErrors.hasErrors()).toBe(false);
      expect(free.uniqueProperty.calls).toHaveLength(1);
    },
  );
});

describe('NET-NEW — A3. the one shared code-format regular expression', () => {
  it('NET-NEW — the shared source is byte-exact `^[a-zA-Z0-9-_.|:~^]+$`', () => {
    // Read from `model/validation/Product.json:10`, `model/validation/Option.json:3` and
    // `model/validation/OptionGroup.json:4` — the same seventeen characters in all three.
    expect(CODE_FORMAT_REGEX).toBe('^[a-zA-Z0-9-_.|:~^]+$');
  });

  it('NET-NEW — Product, Option and OptionGroup share ONE value, not three similar copies', () => {
    // Identity, not equality. Three separately-authored string literals would satisfy `toBe` on the
    // pattern text while still being able to drift apart later; sharing one binding cannot.
    expect(productCodeRegexConstraint.constraintValue).toBe(CODE_FORMAT_REGEX);
    expect(optionCodeRegexConstraint.constraintValue).toBe(CODE_FORMAT_REGEX);
    expect(optionGroupCodeRegexConstraint.constraintValue).toBe(CODE_FORMAT_REGEX);

    const distinctPatterns = new Set([
      productCodeRegexConstraint.constraintValue,
      optionCodeRegexConstraint.constraintValue,
      optionGroupCodeRegexConstraint.constraintValue,
    ]);
    expect(distinctPatterns.size).toBe(1);
  });

  it('NET-NEW — the pattern is carried as a string and the engine compiles it with NO flags', async () => {
    // G6 — THE NO-FLAG END-ANCHOR BEHAVIOUR IS THE DELIBERATE TARGET CHOICE.
    //
    // `validate_regex` at `org/Hibachi/HibachiValidationService.cfc:L481-L487` delegates to CFML's
    // `isValid("regex", value, pattern)`, whose anchors bind to the whole subject. The port compiles
    // the same pattern with `new RegExp(pattern)` and NO flags, so in JavaScript `$` matches only at
    // the very end of the input — NOT before a trailing newline and NOT at every line end. Adding
    // `m` would let a multi-line payload smuggle an invalid second line past a `$` anchor, and the two
    // newline cases below are what would break if it were added.
    //
    // The Unicode flags are a different matter and are worth stating precisely rather than lumping in
    // with `m`: `u` leaves this pattern's observable result UNCHANGED on every input, because the class
    // contains no surrogate pair, no `\p{…}` escape and no case-folding dependency — so adding it would
    // be inert rather than wrong. `v` is not inert, and it does not merely change which characters the
    // class lists — it makes the class ILLEGAL: the bare `-` sitting immediately after the `0-9` range is
    // rejected, so `new RegExp(pattern, 'v')` THROWS `SyntaxError: Invalid character class`, and escaping
    // only the `-` then throws `Invalid character in character class` because `v` reserves `|` inside a
    // class too. Compiling under `v` would require `^[a-zA-Z0-9\-_.\|:~^]+$` — a rewritten pattern.
    // Neither flag is added: `u` because it buys nothing, `v` because the pattern is carried verbatim from
    // `model/validation/Product.json:L10` and re-escaping it to satisfy a flag would edit the ported value.
    expect(typeof CODE_FORMAT_REGEX).toBe('string');
    expect(new RegExp(CODE_FORMAT_REGEX).flags).toBe('');
    expect(new RegExp(CODE_FORMAT_REGEX).source).toBe('^[a-zA-Z0-9-_.|:~^]+$');

    const regex: Constraint<MatrixSubject> = {
      constraintType: 'regex',
      constraintValue: CODE_FORMAT_REGEX,
    };
    // Every literal member of the class, plus the alphanumerics.
    expect(await passes(regex, 'AB-1_.|:~^')).toBe(true);
    expect(await passes(regex, TEST_MERCHANDISE_PRODUCT_CODE)).toBe(true);
    expect(await passes(regex, 'has space')).toBe(false);
    // The two cases that pin the absence of the `m` flag.
    expect(await passes(regex, 'ok\nBAD!')).toBe(false);
    expect(await passes(regex, 'a\nb')).toBe(false);
    // `+` means the empty string cannot match, which is why a blank code fails BOTH `required` and
    // `regex` — the accumulation case in section C2 depends on exactly that.
    expect(await passes(regex, '')).toBe(false);
  });
});

/* ================================================================================================
 * SECTION B — EXACT PER-DOCUMENT DECLARATIONS
 *
 * Each document gets one whole-shape assertion, in the source document's own property order and key
 * order, followed by targeted cases for the declarations that are easiest to get wrong. The
 * whole-shape assertion is what makes an accidental EXTRA rule fail as loudly as a missing one, which
 * a rule-by-rule check alone cannot do.
 * ============================================================================================== */

describe('NET-NEW — B1. `model/validation/Product.json` — eleven properties, twelve rules', () => {
  it('NET-NEW — Product.json in full: the whole document, in source property and key order', () => {
    expect(normaliseRuleSet(productValidationRuleSet)).toStrictEqual([
      // `:L3-L6` — TWO INDEPENDENT rule objects against one property, each with its own context list.
      [
        'baseProductType',
        [
          [
            'addOptionGroup,addOption',
            undefined,
            [['inList', MERCHANDISE_PRODUCT_TYPE.systemCode]],
          ],
          ['addSubscriptionTerm', undefined, [['inList', SUBSCRIPTION_PRODUCT_TYPE.systemCode]]],
        ],
      ],
      // `:L7`
      ['physicalCounts', [['delete', undefined, [['maxCollection', 0]]]]],
      // `:L8` — required AND numeric, and carrying NO numeric floor. See X10a.
      [
        'price',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['dataType', 'numeric'],
            ],
          ],
        ],
      ],
      // `:L9`
      ['productName', [['save', undefined, [['required', true]]]]],
      // `:L10` — three constraints in one rule object, in the document's own key order.
      [
        'productCode',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
              ['regex', CODE_FORMAT_REGEX],
            ],
          ],
        ],
      ],
      // `:L11`
      ['productType', [['save', undefined, [['required', true]]]]],
      // `:L12`
      ['transactionExistsFlag', [['delete', undefined, [['eq', false]]]]],
      // `:L13`, `:L14`, `:L15` — three minimum-collection gates, one per process context.
      ['unusedProductOptions', [['addOption', undefined, [['minCollection', 1]]]]],
      ['unusedProductOptionGroups', [['addOptionGroup', undefined, [['minCollection', 1]]]]],
      [
        'unusedProductSubscriptionTerms',
        [['addSubscriptionTerm', undefined, [['minCollection', 1]]]],
      ],
      // `:L16`
      [
        'urlTitle',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
            ],
          ],
        ],
      ],
    ]);
  });

  it('NET-NEW — `model/validation/Product.json:L8` declares NO `minValue` for `price` (S9, invent nothing)', () => {
    const price = productValidationRuleSet.properties.find(
      (property) => property.propertyIdentifier === 'price',
    );
    expect(price).toBeDefined();
    const declared = (price?.rules ?? []).flatMap((rule) =>
      rule.constraints.map((constraint) => constraint.constraintType),
    );
    // Sku price DOES carry `minValue: 0` (`model/validation/Sku.json:L9`). Product price does not,
    // and the asymmetry is the source document's, not an omission here. Adding a floor would reject
    // saves the legacy system permits.
    expect(declared).toStrictEqual(['required', 'dataType']);
    expect(declared).not.toContain('minValue');
  });

  it('NET-NEW — `model/validation/Product.json:L3-L6` declares TWO independent context rules, not one merged rule', () => {
    const baseProductType = first(
      productValidationRuleSet.properties.filter(
        (property) => property.propertyIdentifier === 'baseProductType',
      ),
    );
    expect(baseProductType.rules).toHaveLength(2);
    // Two rule objects means two INDEPENDENT context selectors: the merchandise gate never applies in
    // the subscription context and vice versa, which section B3 exercises behaviourally.
    expect(first(baseProductType.rules).contexts).toBe('addOptionGroup,addOption');
    expect(baseProductType.rules[1]?.contexts).toBe('addSubscriptionTerm');
  });
});

describe('NET-NEW — B2. `model/validation/Sku.json` — eight properties, nine rules', () => {
  it('NET-NEW — Sku.json in full: the whole document, in source property and key order', () => {
    const { ruleSet } = skuRuleSetFor('sku-document-product');

    expect(normaliseRuleSet(ruleSet)).toStrictEqual([
      // `:L3`
      ['defaultFlag', [['delete', undefined, [['eq', false]]]]],
      // `:L4` — optional but constrained: numeric with a floor, and NO `required`.
      [
        'listPrice',
        [
          [
            'save',
            undefined,
            [
              ['dataType', 'numeric'],
              ['minValue', 0],
            ],
          ],
        ],
      ],
      // `:L5-L8` — TWO method rules against one property, each its own rule object.
      [
        'options',
        [
          ['save', undefined, [['method', 'hasUniqueOptions']]],
          ['save', undefined, [['method', 'hasOneOptionPerOptionGroup']]],
        ],
      ],
      // `:L9` — the only price in the corpus carrying all three of presence, type and floor.
      [
        'price',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['dataType', 'numeric'],
              ['minValue', 0],
            ],
          ],
        ],
      ],
      // `:L10` — optional but constrained, exactly like `listPrice`.
      [
        'renewalPrice',
        [
          [
            'save',
            undefined,
            [
              ['dataType', 'numeric'],
              ['minValue', 0],
            ],
          ],
        ],
      ],
      // `:L11`
      [
        'skuCode',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
            ],
          ],
        ],
      ],
      // `:L12`
      ['transactionExistsFlag', [['delete', undefined, [['eq', false]]]]],
      // `:L13`
      ['physicalCounts', [['delete', undefined, [['maxCollection', 0]]]]],
    ]);
  });

  it('NET-NEW — `model/validation/Sku.json:L5-L8` binds BOTH method rules to real domain methods, not to string dispatch', () => {
    const lookupRepository = createInMemorySkuRepository({});
    const lookup = createSkusBySelectedOptionsLookup(lookupRepository.repository, 'bind-product');

    // The constraint VALUE is the legacy method name, which is what the message key embeds
    // (`org/Hibachi/HibachiValidationService.cfc:L222`). The INVOCATION is a typed closure over the
    // domain method — IR-1 and rule R2: no `getService("…")`, no `invokeMethod(name)`, nothing
    // resolved from a string at run time.
    expect(createHasUniqueOptionsConstraint(lookup).constraintValue).toBe('hasUniqueOptions');
    expect(hasOneOptionPerOptionGroupMethodConstraint.constraintValue).toBe(
      'hasOneOptionPerOptionGroup',
    );
    expect(typeof createHasUniqueOptionsConstraint(lookup).invoke).toBe('function');
    expect(typeof hasOneOptionPerOptionGroupMethodConstraint.invoke).toBe('function');
  });

  it.each([
    ['listPrice — model/validation/Sku.json:L4', 'listPrice'],
    ['renewalPrice — model/validation/Sku.json:L10', 'renewalPrice'],
  ])(
    'NET-NEW — X10b — %s is optional-but-constrained: no `required`, and null passes both records',
    async (_label, propertyName) => {
      const { ruleSet, repository } = skuRuleSetFor('x10b-product');
      const product = buildProduct({ productID: 'x10b-product' });
      const harness = createValidatorHarness();

      const declared = first(
        ruleSet.properties.filter((property) => property.propertyIdentifier === propertyName),
      );
      // Two constraints, and NEITHER is `required`. Absence of the presence rule is the whole point:
      // an unpriced renewal is legal.
      expect(
        declared.rules.flatMap((rule) => rule.constraints.map((c) => c.constraintType)),
      ).toStrictEqual(['dataType', 'minValue']);

      // ABSENT value: `validate_dataType` at `org/Hibachi/HibachiValidationService.cfc:L257` and
      // `validate_minValue` at `:L271` both return true for a null, so an unset optional passes both.
      const absent = buildSku({ skuID: 'x10b-absent', skuCode: 'X10B', price: 1, product });
      const absentErrors = await harness.validateDryRun(absent, ruleSet, 'save');
      expect(absentErrors.getError(propertyName)).toStrictEqual([]);

      // NON-NULL NONNUMERIC value: `minValue` fails because `:L273` requires the value to be numeric
      // BEFORE comparing, and `dataType` fails independently. Both records are appended.
      const nonnumeric = buildSku({
        skuID: 'x10b-bad',
        skuCode: 'X10BBAD',
        price: 1,
        product,
        [propertyName]: 'not-a-number',
      });
      const nonnumericErrors = await harness.validateDryRun(nonnumeric, ruleSet, 'save');
      expect(nonnumericErrors.getError(propertyName)).toStrictEqual([
        `validate.save.Sku.${propertyName}.dataType.numeric`,
        `validate.save.Sku.${propertyName}.minValue`,
      ]);

      // NEGATIVE numeric: numeric, so `dataType` passes; below the floor, so `minValue` alone fails.
      const negative = buildSku({
        skuID: 'x10b-negative',
        skuCode: 'X10BNEG',
        price: 1,
        product,
        [propertyName]: -1,
      });
      const negativeErrors = await harness.validateDryRun(negative, ruleSet, 'save');
      expect(negativeErrors.getError(propertyName)).toStrictEqual([
        `validate.save.Sku.${propertyName}.minValue`,
      ]);

      expect(repository.persisted).toStrictEqual([]);
    },
  );
});

describe('NET-NEW — B3. `model/validation/Brand.json` — X10c, all five declarations', () => {
  it('NET-NEW — Brand.json in full: the whole document, in source property and key order', () => {
    expect(normaliseRuleSet(brandValidationRules)).toStrictEqual([
      // `:L3`
      ['brandName', [['save', undefined, [['required', true]]]]],
      // `:L4` — a URL data type, the only `dataType: url` in the whole corpus.
      ['brandWebsite', [['save', undefined, [['dataType', 'url']]]]],
      // `:L5` — required AND unique. AAP §0.4.1.5 abbreviates this to "`urlTitle` unique"; the
      // document declares both constraints, and both are asserted.
      [
        'urlTitle',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
            ],
          ],
        ],
      ],
      // `:L6` — the live delete guard.
      ['products', [['delete', undefined, [['maxCollection', 0]]]]],
      // `:L7` — the inert delete guard; see B6.
      ['physicalCounts', [['delete', undefined, [['maxCollection', 0]]]]],
    ]);
  });

  it('NET-NEW — X10c — `brandName` required, `brandWebsite` typed url, `urlTitle` required AND unique', async () => {
    const harness = createValidatorHarness([
      { entityName: 'SlatwallBrand', propertyName: 'urlTitle', value: 'taken', entityID: 'other' },
    ]);

    // Nothing set at all: both presence rules fire, the url rule does not (absent passes dataType).
    const blank = await harness.validateDryRun(buildBrand({}), brandValidationRules, 'save');
    expect(blank.getError('brandName')).toStrictEqual(['validate.save.Brand.brandName.required']);
    expect(blank.getError('urlTitle')).toStrictEqual(['validate.save.Brand.urlTitle.required']);
    expect(blank.getError('brandWebsite')).toStrictEqual([]);

    // A malformed website fails the url data type; a well-formed one passes.
    const malformed = await harness.validateDryRun(
      buildBrand({ brandName: 'Acme', urlTitle: 'acme', brandWebsite: 'not a url' }),
      brandValidationRules,
      'save',
    );
    expect(malformed.getError('brandWebsite')).toStrictEqual([
      'validate.save.Brand.brandWebsite.dataType.url',
    ]);

    const wellFormed = await harness.validateDryRun(
      buildBrand({ brandName: 'Acme', urlTitle: 'acme', brandWebsite: 'https://example.test/x' }),
      brandValidationRules,
      'save',
    );
    expect(wellFormed.hasErrors()).toBe(false);

    // A taken url title fails uniqueness while satisfying presence — two independent records against
    // one property, only one of which fires.
    const collision = await harness.validateDryRun(
      buildBrand({ brandID: 'mine', brandName: 'Acme', urlTitle: 'taken' }),
      brandValidationRules,
      'save',
    );
    expect(collision.getError('urlTitle')).toStrictEqual(['validate.save.Brand.urlTitle.unique']);
  });

  it('NET-NEW — X10c — both Brand delete guards are maxCollection 0, and `products` is the live one', async () => {
    const harness = createValidatorHarness();

    const empty = buildBrand({ brandID: 'empty-brand' });
    expect(empty.products).toStrictEqual([]);
    const emptyErrors = await harness.validateDryRun(empty, brandValidationRules, 'delete');
    expect(emptyErrors.hasErrors()).toBe(false);

    const occupied = buildBrand({ brandID: 'occupied-brand' });
    occupied.products.push(buildProduct({ productID: 'held-product' }));
    const occupiedErrors = await harness.validateDryRun(occupied, brandValidationRules, 'delete');
    expect(occupiedErrors.getError('products')).toStrictEqual([
      'validate.delete.Brand.products.maxCollection',
    ]);
  });
});

describe('NET-NEW — B4. `model/validation/Option.json` and `model/validation/OptionGroup.json`', () => {
  it('NET-NEW — Option: the whole document, in source property and key order', () => {
    expect(normaliseRuleSet(optionValidationRuleSet)).toStrictEqual([
      // `:L3`
      [
        'optionCode',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
              ['regex', CODE_FORMAT_REGEX],
            ],
          ],
        ],
      ],
      // `:L4`
      ['optionName', [['save', undefined, [['required', true]]]]],
      // `:L5` — the required many-to-one the option model depends on
      // (`model/entity/Option.cfc:L59`).
      ['optionGroup', [['save', undefined, [['required', true]]]]],
      // `:L6`
      ['skus', [['delete', undefined, [['maxCollection', 0]]]]],
    ]);
  });

  it('NET-NEW — Option: all three save rules fire on a blank option, and the SKU delete guard is live', async () => {
    const harness = createValidatorHarness();

    const blank = await harness.validateDryRun(buildOption({}), optionValidationRuleSet, 'save');
    expect(blank.getError('optionCode')).toStrictEqual([
      'validate.save.Option.optionCode.required',
    ]);
    expect(blank.getError('optionName')).toStrictEqual([
      'validate.save.Option.optionName.required',
    ]);
    expect(blank.getError('optionGroup')).toStrictEqual([
      'validate.save.Option.optionGroup.required',
    ]);

    const held = buildOption({
      optionID: 'held-option',
      optionGroup: buildOptionGroup({ optionGroupID: 'holding-group' }),
    });
    const beforeAttachment = await harness.validateDryRun(held, optionValidationRuleSet, 'delete');
    expect(beforeAttachment.hasErrors()).toBe(false);

    held.skus.push(buildSku({ skuID: 'holding-sku' }));
    const afterAttachment = await harness.validateDryRun(held, optionValidationRuleSet, 'delete');
    expect(afterAttachment.getError('skus')).toStrictEqual([
      'validate.delete.Option.skus.maxCollection',
    ]);
  });

  it('NET-NEW — OptionGroup: the whole document, and NO rule is invented for the ORM-required sort order', () => {
    expect(normaliseRuleSet(optionGroupValidationRuleSet)).toStrictEqual([
      // `:L3`
      ['optionGroupName', [['save', undefined, [['required', true]]]]],
      // `:L4`
      [
        'optionGroupCode',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
              ['regex', CODE_FORMAT_REGEX],
            ],
          ],
        ],
      ],
      // `:L5`
      ['options', [['delete', undefined, [['maxCollection', 0]]]]],
    ]);

    // S9, invent nothing. `model/entity/OptionGroup.cfc` declares `sortOrder` as ORM metadata, and
    // `model/dao/SkuDAO.cfc:L172-L204` orders by it, but `model/validation/OptionGroup.json` declares
    // NO rule for it. A presence rule inferred from ORM metadata would reject saves the legacy system
    // permits.
    expect(
      optionGroupValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).not.toContain('sortOrder');
  });

  it('NET-NEW — OptionGroup: both save rules fire on a blank group, and the option delete guard is live', async () => {
    const harness = createValidatorHarness();

    const blank = await harness.validateDryRun(
      buildOptionGroup({}),
      optionGroupValidationRuleSet,
      'save',
    );
    expect(blank.getError('optionGroupName')).toStrictEqual([
      'validate.save.OptionGroup.optionGroupName.required',
    ]);
    expect(blank.getError('optionGroupCode')).toStrictEqual([
      'validate.save.OptionGroup.optionGroupCode.required',
    ]);

    const group = buildOptionGroup({ optionGroupID: 'guarded-group' });
    const beforeOption = await harness.validateDryRun(
      group,
      optionGroupValidationRuleSet,
      'delete',
    );
    expect(beforeOption.hasErrors()).toBe(false);

    // `buildOption` wires the inverse side, so attaching an option populates the group's collection.
    buildOption({ optionID: 'held', optionGroup: group });
    const afterOption = await harness.validateDryRun(group, optionGroupValidationRuleSet, 'delete');
    expect(afterOption.getError('options')).toStrictEqual([
      'validate.delete.OptionGroup.options.maxCollection',
    ]);
  });
});

describe('NET-NEW — B5. `model/validation/ProductType.json` — X10d, four delete guards and two save rules', () => {
  it('NET-NEW — X10d — the whole document: `childProductTypes` (never `productTypes`) and a length-zero system-code guard', () => {
    expect(normaliseRuleSet(productTypeValidationRuleSet)).toStrictEqual([
      // `:L3`
      ['productTypeName', [['save', undefined, [['required', true]]]]],
      // `:L4`
      [
        'urlTitle',
        [
          [
            'save',
            undefined,
            [
              ['required', true],
              ['unique', true],
            ],
          ],
        ],
      ],
      // `:L5`
      ['products', [['delete', undefined, [['maxCollection', 0]]]]],
      // `:L6` — the key is `childProductTypes`. The self-referencing child collection is declared at
      // `model/entity/ProductType.cfc:L65`, and a rule keyed `productTypes` would silently never fire.
      ['childProductTypes', [['delete', undefined, [['maxCollection', 0]]]]],
      // `:L7` — `maxLength: 0`, a LENGTH guard on any nonempty string. It is NOT an in-list
      // membership test against the three seeded discriminators, and reading it as one would let a
      // seeded product type be deleted.
      ['systemCode', [['delete', undefined, [['maxLength', 0]]]]],
      // `:L8`
      ['physicalCounts', [['delete', undefined, [['maxCollection', 0]]]]],
    ]);

    expect(systemCodeMaxLengthConstraint).toStrictEqual({
      constraintType: 'maxLength',
      constraintValue: 0,
    });
    expect(
      productTypeValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).not.toContain('productTypes');
  });

  it('NET-NEW — X10d — exactly FOUR delete guards and exactly TWO save rules', () => {
    const byContext = new Map<string, string[]>();
    for (const property of productTypeValidationRuleSet.properties) {
      for (const rule of property.rules) {
        const key = rule.contexts ?? '(none)';
        byContext.set(key, [...(byContext.get(key) ?? []), property.propertyIdentifier]);
      }
    }

    expect(byContext.get('save')).toStrictEqual(['productTypeName', 'urlTitle']);
    expect(byContext.get('delete')).toStrictEqual([
      'products',
      'childProductTypes',
      'systemCode',
      'physicalCounts',
    ]);
    expect(byContext.size).toBe(2);
  });

  it('NET-NEW — X10d — the system-code guard rejects a seeded discriminator and permits an empty one', async () => {
    const harness = createValidatorHarness();
    const subject = (systemCode: string | undefined): ProductTypeValidationSubject => ({
      ...uniqueEntityAccessors('SlatwallProductType', 'productTypeID', 'pt-under-test', {}),
      getClassName: () => 'ProductType',
      hasProperty: () => true,
      ...(systemCode === undefined ? {} : { systemCode }),
      products: [],
      childProductTypes: [],
      physicalCounts: [],
    });

    // `validate_maxLength` at `org/Hibachi/HibachiValidationService.cfc:L293-L299` passes a null and
    // measures `len(trim(value))`, so an unset or blank system code is deletable.
    for (const permitted of [undefined, '', '   ']) {
      const errors = await harness.validateDryRun(
        subject(permitted),
        productTypeValidationRuleSet,
        'delete',
      );
      expect(errors.getError('systemCode')).toStrictEqual([]);
    }

    // A seeded discriminator is a nonempty string, so the guard fires and the row cannot be deleted.
    // The literal comes from `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` by way of the shared
    // fixture, so the same value the legacy seed inserts is the value under test (IR-7).
    const seeded = await harness.validateDryRun(
      subject(MERCHANDISE_PRODUCT_TYPE.systemCode),
      productTypeValidationRuleSet,
      'delete',
    );
    expect(seeded.getError('systemCode')).toStrictEqual([
      'validate.delete.ProductType.systemCode.maxLength',
    ]);
  });
});

describe('NET-NEW — B6. `model/validation/Product_UpdateSkus.json` — two properties, two named conditions', () => {
  it('NET-NEW — the whole document: two properties, each numeric-and-required behind its own condition, with NO contexts', () => {
    expect(normaliseRuleSet(productUpdateSkusValidationRuleSet)).toStrictEqual([
      // `:L11` — `contexts` is UNDEFINED, which is what makes the rule context-independent (section
      // C1), and the constraint order is the document's own: `dataType` then `required`.
      [
        'price',
        [
          [
            undefined,
            SHOW_PRICE_CONDITION_NAME,
            [
              ['dataType', 'numeric'],
              ['required', true],
            ],
          ],
        ],
      ],
      // `:L12`
      [
        'listPrice',
        [
          [
            undefined,
            SHOW_LIST_PRICE_CONDITION_NAME,
            [
              ['dataType', 'numeric'],
              ['required', true],
            ],
          ],
        ],
      ],
    ]);

    // S9 — and NO `minValue`, unlike the Sku prices. A negative update price is legal here.
    const declared = normaliseRuleSet(productUpdateSkusValidationRuleSet)
      .flatMap(([, rules]) => rules)
      .flatMap(([, , constraints]) => constraints.map(([type]) => type));
    expect(declared).not.toContain('minValue');
  });

  it('NET-NEW — `:L2-L9` declares the two named conditions as `eq 1` predicates on the update flags', () => {
    expect(SHOW_PRICE_CONDITION_NAME).toBe('showPrice');
    expect(SHOW_LIST_PRICE_CONDITION_NAME).toBe('showListPrice');
    expect(
      (productUpdateSkusValidationRuleSet.conditions ?? []).map((condition) => [
        condition.name,
        condition.constraints.map((conditionConstraint) => [
          conditionConstraint.propertyIdentifier,
          conditionConstraint.constraint.constraintType,
          conditionConstraint.constraint.constraintValue,
        ]),
      ]),
    ).toStrictEqual([
      // `:L3-L5`
      [SHOW_PRICE_CONDITION_NAME, [['updatePriceFlag', 'eq', 1]]],
      // `:L6-L8`
      [SHOW_LIST_PRICE_CONDITION_NAME, [['updateListPriceFlag', 'eq', 1]]],
    ]);
  });

  it('NET-NEW — both `hb_rbKey` constants are ANNOTATIONS carried from the process object, not generated messages', () => {
    // `model/process/Product_UpdateSkus.cfc` annotates its two data properties with
    // `hb_rbKey="entity.sku.price"` and `hb_rbKey="entity.sku.listPrice"` — a resource-bundle LABEL
    // for a form field, borrowed from the Sku entity because the process object edits Sku values.
    expect(PRODUCT_UPDATE_SKUS_PRICE_RB_KEY).toBe('entity.sku.price');
    expect(PRODUCT_UPDATE_SKUS_LIST_PRICE_RB_KEY).toBe('entity.sku.listPrice');

    // They are NOT validation messages, and nothing generates them. The four keys this document can
    // actually emit are built by the message templates instead, and none of them mentions `sku`.
    for (const generated of [
      PRICE_REQUIRED_MESSAGE_KEY,
      PRICE_DATA_TYPE_MESSAGE_KEY,
      LIST_PRICE_REQUIRED_MESSAGE_KEY,
      LIST_PRICE_DATA_TYPE_MESSAGE_KEY,
    ]) {
      expect(generated).not.toBe(PRODUCT_UPDATE_SKUS_PRICE_RB_KEY);
      expect(generated).not.toBe(PRODUCT_UPDATE_SKUS_LIST_PRICE_RB_KEY);
      expect(generated.startsWith('validate.updateSkus.Product_UpdateSkus.')).toBe(true);
    }
  });
});

describe('NET-NEW — B7. X10a — Product `price` is in scope, and its value never crosses the pricing port', () => {
  it('NET-NEW — `model/validation/Product.json:L8` — required and numeric on save, isolated from every other rule', async () => {
    // TR-5 / G6 — WHY THIS RULE IS IN SCOPE THOUGH ITS VALUE IS CALCULATED.
    //
    // `price` is a NON-PERSISTENT property (`model/entity/Product.cfc:L118`) and its getter at
    // `:L561-L568` returns its own value or delegates to the default SKU, which reads the PERSISTENT
    // `Sku.price` column (`model/entity/Sku.cfc:L56`). So the value is calculated but it is resolved
    // ENTIRELY INSIDE the slice — it crosses no boundary — and the realized
    // `src/ports/PricingPort.ts` deliberately declares NO member for it, exposing only the sale-price
    // details the excluded promotion engine owns. AAP §0.2.2.6 excludes those calculated members
    // outright and this file touches none of them.
    //
    // The assertion that carries the point is the last one: a `PricingPort` double is wired in and its
    // request log stays EMPTY, which is executable evidence that validating Product `price` reaches no
    // out-of-scope collaborator. Had the rule been implemented by reaching through the port, the log
    // would be non-empty.
    const pricing = createPricingDouble();
    const harness = createValidatorHarness();
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE.productTypeID,
      systemCode: MERCHANDISE_PRODUCT_TYPE.systemCode,
    });

    // Every other required Product field is satisfied and no uniqueness collision is seeded, so the
    // only rule that can speak is `price`.
    const unpriced = buildProduct({
      productID: 'x10a-product',
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      urlTitle: 'x10a-product',
      productType,
    });
    const unpricedSubject: ProductValidationSubject = unpriced;
    expect(unpriced.hasProperty('price')).toBe(true);
    expect(unpriced.getPrice()).toBeUndefined();

    const missing = await harness.validateDryRun(unpricedSubject, productValidationRuleSet, 'save');
    // ISOLATION: `price` is the ONLY property carrying an error, so nothing below is inherited from a
    // neighbouring rule.
    expect(Object.keys(missing.getErrors())).toStrictEqual(['price']);
    expect(missing.getError('price')).toStrictEqual(['validate.save.Product.price.required']);

    // A numeric price satisfies both constraints and the whole document falls silent.
    const priced = buildProduct({
      productID: 'x10a-priced',
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      urlTitle: 'x10a-priced',
      productType,
    });
    const defaultSku = buildSku({
      skuID: 'x10a-default-sku',
      skuCode: 'X10ADEFAULT',
      price: 100,
      product: priced,
    });
    priced.skus.push(defaultSku);
    priced.price = defaultSku.price;
    const pricedSubject: ProductValidationSubject = priced;

    const satisfied = await harness.validateDryRun(pricedSubject, productValidationRuleSet, 'save');
    expect(satisfied.hasErrors()).toBe(false);

    // THE BOUNDARY EVIDENCE: no product identifier was ever handed to the pricing port.
    expect(pricing.requestedProductIds).toStrictEqual([]);
  });

  it.each([
    [
      'a nonnumeric price fails `dataType`',
      'not-a-number',
      ['validate.save.Product.price.dataType.numeric'],
    ],
    // NEGATIVE is legal, because `model/validation/Product.json:L8` declares no `minValue` (S9).
    ['a negative price is accepted, because the document declares no floor', -5, []],
    // ZERO satisfies presence: `validate_required` at
    // `org/Hibachi/HibachiValidationService.cfc:L240-L246` measures `len(trim())` on a simple value
    // rather than testing truthiness, so `0` is PRESENT.
    ['a zero price satisfies presence and type', 0, []],
  ])('NET-NEW — X10a — %s', async (_label, seededPrice, expected) => {
    const pricing = createPricingDouble();
    const harness = createValidatorHarness();
    const product = buildProduct({
      productID: 'x10a-typed',
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      urlTitle: 'x10a-typed',
      productType: buildProductType({
        productTypeID: MERCHANDISE_PRODUCT_TYPE.productTypeID,
        systemCode: MERCHANDISE_PRODUCT_TYPE.systemCode,
      }),
    });
    // The value is sourced through the real Sku decimal coercion rather than cast, so the property
    // keeps the exact type `model/entity/Product.cfc:L118` resolves to by way of
    // `model/entity/Sku.cfc:L56`.
    product.price = buildSku({ skuID: 'x10a-typed-sku', price: seededPrice }).price;
    const subject: ProductValidationSubject = product;

    const errors = await harness.validateDryRun(subject, productValidationRuleSet, 'save');
    expect(errors.getError('price')).toStrictEqual(expected);
    expect(pricing.requestedProductIds).toStrictEqual([]);
  });
});

/* ================================================================================================
 * SECTION B8 — THE FOUR `physicalCounts` DELETE GUARDS, WITHOUT CROSSING THE PHYSICAL BOUNDARY
 *
 * S7 / G6 — THE INERTNESS FINDING, STATED ONCE AND ASSERTED IN BOTH DIRECTIONS.
 *
 * Four documents declare a delete guard keyed `physicalCounts`:
 * `model/validation/Product.json:L7`, `model/validation/Sku.json:L13`,
 * `model/validation/Brand.json:L7` and `model/validation/ProductType.json:L8`.
 *
 * NO IN-SCOPE ENTITY DECLARES A PROPERTY BY THAT NAME. What the four entities declare is
 * `physicals` — `model/entity/Product.cfc:L90`, `model/entity/Sku.cfc:L87`,
 * `model/entity/Brand.cfc:L71` and `model/entity/ProductType.cfc:L77`. Because
 * `org/Hibachi/HibachiValidationService.cfc:L171` guards every property with
 * `if(arguments.object.hasProperty(propertyIdentifier))`, all four guards are SILENTLY SKIPPED against
 * a production-shaped subject. They never fire in the legacy system and they must never fire here.
 *
 * The rule is therefore PRESERVED AND ANNOTATED, not repaired and not deleted:
 *   * it is NOT retargeted to `physicals`, because that would make four inert guards live and start
 *     rejecting deletes the legacy system permits;
 *   * it is NOT dropped, because the document declares it and the corpus census counts it;
 *   * `physicalCounts` is NOT added to any domain class, and no real PhysicalService is reached — the
 *     whole `Physical*` family is excluded by AAP §0.2.2.1.
 *
 * Both halves are asserted below: the constraint's own polarity against a subject that deliberately
 * exposes the name, and the silence against every real domain-shaped subject.
 * ============================================================================================== */

/** A deliberately non-production validation object that DOES expose `physicalCounts`. */
interface PhysicalCountsSubject extends ValidationSubject {
  readonly physicalCounts?: unknown;
}

/**
 * Re-points a document's OWN frozen `physicalCounts` rule at a reader that can see the property.
 *
 * The rules array is the module's, not a copy: the same frozen rule objects and the same frozen
 * `maxCollection: 0` constraint the corpus census counted. Only the value reader differs, and it has
 * to, because the realized Brand reader is hard-coded to `undefined` (a stronger statement of the same
 * inertness) and the other three read a member no real entity has. Substituting the reader is what
 * makes the declared constraint OBSERVABLE without changing what is declared.
 */
function exposedPhysicalCountsProperty(
  declared: CensusProperty,
): PropertyValidation<PhysicalCountsSubject> {
  return {
    propertyIdentifier: declared.propertyIdentifier,
    read: (subject) => subject.physicalCounts,
    rules: declared.rules.map((rule) => ({
      ...(rule.contexts === undefined ? {} : { contexts: rule.contexts }),
      constraints: rule.constraints.map((constraint): Constraint<PhysicalCountsSubject> => ({
        constraintType: 'maxCollection',
        constraintValue: Number(constraint.constraintValue),
      })),
    })),
  };
}

describe('NET-NEW — B8. the four `physicalCounts` delete guards and their legacy inertness', () => {
  it.each([
    ['Product — model/validation/Product.json:L7', 'Product', productPhysicalCountsValidation],
    ['Sku — model/validation/Sku.json:L13', 'Sku', skuPhysicalCountsValidation],
    ['Brand — model/validation/Brand.json:L7', 'Brand', brandPhysicalCountsValidation],
    [
      'ProductType — model/validation/ProductType.json:L8',
      'ProductType',
      productTypePhysicalCountsValidation,
    ],
  ])(
    'NET-NEW — %s declares `physicalCounts` delete/maxCollection 0: empty passes, one element fails',
    async (_label, className, declared) => {
      // The declaration itself, straight from the module: one rule, delete context, one constraint.
      expect(declared.propertyIdentifier).toBe('physicalCounts');
      expect(declared.rules).toHaveLength(1);
      expect(first(declared.rules).contexts).toBe('delete');
      expect(first(first(declared.rules).constraints)).toStrictEqual({
        constraintType: 'maxCollection',
        constraintValue: 0,
      });

      const harness = createValidatorHarness();
      const ruleSet: ValidationRuleSet<PhysicalCountsSubject> = {
        properties: [exposedPhysicalCountsProperty(declared)],
      };
      const subject = (physicalCounts: unknown): PhysicalCountsSubject => ({
        getClassName: () => className,
        hasProperty: () => true,
        physicalCounts,
      });

      // `validate_maxCollection` at `org/Hibachi/HibachiValidationService.cfc:L309-L315` measures
      // `arrayLen` or `structCount` and compares against the ceiling, so an empty collection is at the
      // ceiling and passes.
      const empty = await harness.validateDryRun(subject([]), ruleSet, 'delete');
      expect(empty.getError('physicalCounts')).toStrictEqual([]);

      // One element exceeds a ceiling of zero, so the guard fires.
      const occupied = await harness.validateDryRun(subject(['one-count']), ruleSet, 'delete');
      expect(occupied.getError('physicalCounts')).toStrictEqual([
        `validate.delete.${className}.physicalCounts.maxCollection`,
      ]);
    },
  );

  it.each([
    ['Product — model/entity/Product.cfc:L90 declares `physicals`', 'Product'],
    ['Sku — model/entity/Sku.cfc:L87 declares `physicals`', 'Sku'],
    ['Brand — model/entity/Brand.cfc:L71 declares `physicals`', 'Brand'],
    ['ProductType — model/entity/ProductType.cfc:L77 declares `physicals`', 'ProductType'],
  ])(
    'NET-NEW — %s, so `hasProperty("physicalCounts")` answers false and the guard is skipped in silence',
    (_label, className) => {
      // S7 / G6 — the inertness evidence, one entity at a time.
      // `org/Hibachi/HibachiValidationService.cfc:L171` decides at RUN TIME whether a property is
      // validated, and for every faithful in-scope subject the answer for this name is false. The
      // legacy engine skips the rule, so the port skips it too — no throw, no failure, no error entry.
      const subjects: Readonly<Record<string, ValidationSubject>> = {
        Product: buildProduct({ productID: 'inert-product' }),
        Sku: buildSku({ skuID: 'inert-sku' }),
        Brand: buildBrand({ brandID: 'inert-brand' }),
        // `ProductType` does not implement the validation-subject contract at all, which is a
        // stronger form of the same finding: it exposes no `hasProperty` to answer with.
        ProductType: {
          getClassName: () => 'ProductType',
          hasProperty: (identifier: string) => identifier !== 'physicalCounts',
        },
      };
      const subject = subjects[className];
      expect(subject).toBeDefined();
      expect(subject?.hasProperty('physicalCounts')).toBe(false);
    },
  );

  it('NET-NEW — a real Product on delete, with every other guard satisfied, reports NO `physicalCounts` error', async () => {
    const harness = createValidatorHarness();
    // `model/validation/Product.json` declares exactly two delete rules: the transaction guard at
    // `:L12` and the inert count guard at `:L7`. Satisfying the first isolates the second.
    const product = buildProduct({ productID: 'deletable-product' });
    const subject: ProductValidationSubject = product;
    expect(product.hasProperty('physicalCounts')).toBe(false);
    expect(product.hasProperty('transactionExistsFlag')).toBe(true);

    const errors = await harness.validateDryRun(subject, productValidationRuleSet, 'delete');
    // The transaction guard speaks (an unset flag fails `eq`; see section E row 8) and the count guard
    // does not exist as far as the subject is concerned.
    expect(Object.keys(errors.getErrors())).toStrictEqual(['transactionExistsFlag']);
    expect(errors.getError('physicalCounts')).toStrictEqual([]);
    expect(errors.hasError('physicalCounts')).toBe(false);
  });

  it('NET-NEW — a real Sku on delete, with both flag guards satisfied, reports NO `physicalCounts` error', async () => {
    const harness = createValidatorHarness();
    const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>(
      'deletable-product',
    );
    // `model/validation/Sku.json` declares three delete rules: `:L3`, `:L12` and the inert `:L13`.
    // A resolved delete subject satisfies the two live ones so only the inert one could speak.
    const resolved: SkuValidationSubject & UniquePropertyEntity = {
      ...uniqueEntityAccessors('SlatwallSku', 'skuID', 'deletable-sku', {}),
      getClassName: () => 'Sku',
      hasProperty: (identifier: string) => identifier !== 'physicalCounts',
      defaultFlag: false,
      transactionExistsFlag: false,
      hasUniqueOptions: () => Promise.resolve(true),
      hasOneOptionPerOptionGroup: () => true,
    };

    const errors = await harness.validateDryRun(resolved, ruleSet, 'delete');
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getError('physicalCounts')).toStrictEqual([]);
  });

  it('NET-NEW — a real Brand on delete, with `products` empty, reports NO `physicalCounts` error', async () => {
    const harness = createValidatorHarness();
    const brand = buildBrand({ brandID: 'deletable-brand' });
    const subject: BrandValidationSubject & UniquePropertyEntity = brand;
    expect(brand.hasProperty('physicalCounts')).toBe(false);

    const errors = await harness.validateDryRun(subject, brandValidationRules, 'delete');
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getError('physicalCounts')).toStrictEqual([]);
  });

  it('NET-NEW — a ProductType-shaped subject on delete, with the three live guards satisfied, reports NO `physicalCounts` error', async () => {
    const harness = createValidatorHarness();
    const subject: ProductTypeValidationSubject = {
      ...uniqueEntityAccessors('SlatwallProductType', 'productTypeID', 'deletable-pt', {}),
      getClassName: () => 'ProductType',
      // The production-shaped answer: everything the entity declares, and NOT the count collection.
      hasProperty: (identifier: string) => identifier !== 'physicalCounts',
      products: [],
      childProductTypes: [],
    };

    const errors = await harness.validateDryRun(subject, productTypeValidationRuleSet, 'delete');
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getError('physicalCounts')).toStrictEqual([]);
  });
});

/* ================================================================================================
 * SECTION B9 — THE CONTEXT-ONLY PRODUCT GATES
 * ============================================================================================== */

describe('NET-NEW — B9. Product context gates: selection only, no process round-trip', () => {
  it('NET-NEW — `model/validation/Product.json:L5` and `:L15` are selected ONLY in the subscription-term context', () => {
    // Selection-level assertion by design. Constructing or round-tripping an add-subscription process
    // object would reach the excluded `Subscription*` family (AAP §0.2.2.1) and the excluded
    // `Product_AddSubscriptionTerm` document (AAP §0.2.2.4); neither is touched here.
    const selectedIn = (context: string): readonly string[] =>
      productValidationRuleSet.properties
        .filter((property) =>
          property.rules.some((rule) => (rule.contexts ?? '').split(',').includes(context)),
        )
        .map((property) => property.propertyIdentifier);

    expect(selectedIn('addSubscriptionTerm')).toStrictEqual([
      'baseProductType',
      'unusedProductSubscriptionTerms',
    ]);
    expect(selectedIn('addOptionGroup')).toStrictEqual([
      'baseProductType',
      'unusedProductOptionGroups',
    ]);
    expect(selectedIn('addOption')).toStrictEqual(['baseProductType', 'unusedProductOptions']);
  });

  it('NET-NEW — the subscription gate demands the subscription discriminator, and the merchandise gate demands merchandise', async () => {
    const harness = createValidatorHarness();
    const subject = (baseProductType: string): ProductValidationSubject => ({
      ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'gated-product', {}),
      getClassName: () => 'Product',
      hasProperty: (identifier: string) => identifier === 'baseProductType',
      baseProductType,
    });

    // The three literals come from `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` by way of the
    // shared fixture, so the discriminators under test are the seeded ones (IR-7).
    const merchandiseInSubscriptionContext = await harness.validateDryRun(
      subject(MERCHANDISE_PRODUCT_TYPE.systemCode),
      productValidationRuleSet,
      'addSubscriptionTerm',
    );
    expect(merchandiseInSubscriptionContext.getError('baseProductType')).toStrictEqual([
      'validate.addSubscriptionTerm.Product.baseProductType.inList',
    ]);

    const subscriptionInSubscriptionContext = await harness.validateDryRun(
      subject(SUBSCRIPTION_PRODUCT_TYPE.systemCode),
      productValidationRuleSet,
      'addSubscriptionTerm',
    );
    expect(subscriptionInSubscriptionContext.getError('baseProductType')).toStrictEqual([]);

    const subscriptionInOptionGroupContext = await harness.validateDryRun(
      subject(SUBSCRIPTION_PRODUCT_TYPE.systemCode),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(subscriptionInOptionGroupContext.getError('baseProductType')).toStrictEqual([
      'validate.addOptionGroup.Product.baseProductType.inList',
    ]);
  });

  it.each([
    ['addOptionGroup — the first element of the list', 'addOptionGroup', true],
    ['addOption — the second element of the list', 'addOption', true],
    ['ADDOPTIONGROUP — matched case-insensitively', 'ADDOPTIONGROUP', true],
    ['AddOption — matched case-insensitively', 'AddOption', true],
    // A context outside the list selects nothing at all.
    ['save — not in the list', 'save', false],
  ])(
    'NET-NEW — `model/validation/Product.json:L4` context list `addOptionGroup,addOption` — %s',
    async (_label, context, shouldSelect) => {
      // G6 — the list is SPLIT ON COMMAS and each element is compared WHOLE and
      // CASE-INSENSITIVELY, because `org/Hibachi/HibachiValidationService.cfc:L71` selects with
      // `listFindNoCase(rule.contexts, arguments.context)`. `listFindNoCase` is an element search, not
      // a substring search, so a prefix or infix of an element never matches — and casing never
      // matters.
      //
      // THE CASE-INSENSITIVE ROWS ARE LOAD-BEARING TWICE OVER. They pin `listFindNoCase` here, and
      // they also pin that the engine's runtime context guard is itself case-insensitive: a
      // case-SENSITIVE guard would refuse `ADDOPTIONGROUP` outright and this case would raise instead
      // of selecting, which is precisely the behavioural change AAP §0.8.2 g2 forbids.
      //
      // THE ELEMENT-NOT-SUBSTRING HALF MOVED to the two cases below, which prove it with contexts that
      // are real members of the union — `addOption` is a proper prefix of `addOptionGroup`, so the
      // property is fully expressible without a context the engine refuses. Two rows that used
      // fabricated near-misses (`addOptionGrou`, `ption`) were replaced by that pair plus an explicit
      // refusal assertion, so nothing the original rows proved has been given up.
      const harness = createValidatorHarness();
      const subject: ProductValidationSubject = {
        ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'ctx-product', {}),
        getClassName: () => 'Product',
        hasProperty: (identifier: string) => identifier === 'baseProductType',
        // A value the merchandise gate rejects, so selection is observable as a failure.
        baseProductType: SUBSCRIPTION_PRODUCT_TYPE.systemCode,
      };

      const errors = await harness.validateDryRun(
        subject,
        productValidationRuleSet,
        context as ValidationContext,
      );
      expect(errors.hasError('baseProductType')).toBe(shouldSelect);
      if (shouldSelect) {
        // The RAW context the caller supplied is what the message embeds, uppercase and all: the
        // engine matches case-insensitively but does not normalise the key.
        expect(errors.getError('baseProductType')).toStrictEqual([
          `validate.${context}.Product.baseProductType.inList`,
        ]);
      }
    },
  );

  it.each<readonly [string, ValidationContext]>([
    // `addOption` is a proper PREFIX of `addOptionGroup`, and the rule on
    // `unusedProductOptionGroups` declares the single-element list `addOptionGroup`. A naive
    // `contexts.includes(context)` port selects it; `listFindNoCase` does not.
    ['addOption is a prefix of addOptionGroup, not an element of `addOptionGroup`', 'addOption'],
    // And the converse direction, so neither ordering of the substring relation slips through.
    ['addOptionGroup is not an element of `addOption`', 'addOptionGroup'],
  ])(
    'NET-NEW — element search, not substring search, proven with real union members — %s',
    async (_label, context) => {
      // `org/Hibachi/HibachiValidationService.cfc:L71` uses `listFindNoCase`, an ELEMENT search. The
      // two single-context rules in `model/validation/Product.json` make the property observable with
      // no fabricated context at all: `unusedProductOptionGroups` is gated on `addOptionGroup` alone
      // and `unusedProductOptions` on `addOption` alone, and each context must reach exactly one of
      // them even though one string is a prefix of the other.
      const harness = createValidatorHarness();
      const subject: ProductValidationSubject = {
        ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'substring-product', {}),
        getClassName: () => 'Product',
        // Both collection properties are present and both are EMPTY, so whichever rule is selected
        // records a failure and the selection is observable per property.
        hasProperty: (identifier: string) =>
          identifier === 'unusedProductOptionGroups' || identifier === 'unusedProductOptions',
        unusedProductOptionGroups: [],
        unusedProductOptions: [],
      };

      const errors = await harness.validateDryRun(subject, productValidationRuleSet, context);

      const selected = context === 'addOptionGroup';
      expect(errors.hasError('unusedProductOptionGroups')).toBe(selected);
      expect(errors.hasError('unusedProductOptions')).toBe(!selected);
    },
  );

  it.each([
    ['addOptionGrou — a prefix of an element', 'addOptionGrou'],
    ['ption — an infix of an element', 'ption'],
    ['addOptionGroups — a superstring of an element', 'addOptionGroups'],
  ])('NET-NEW — %s selects no context-scoped rule at all', async (_label, nearMiss) => {
    // `listFindNoCase` is an ELEMENT search rather than a substring search, so a prefix, an infix and
    // a superstring of `addOptionGroup` each match nothing at
    // `org/Hibachi/HibachiValidationService.cfc:L71`. The engine runs, selects only the rules that
    // declare no `contexts` key, and records nothing for a context-scoped property.
    //
    // ⛔ AND IT IS NOT REFUSED. A revision asserted a `TypeError` here, produced by a runtime
    // membership guard that has since been withdrawn — refusing a context the legacy engine merely
    // fails to match is a behaviour change, and AAP §0.6.7.7 licenses exactly one (D18). The widening
    // cast is retained because the value is deliberately outside the closed union.
    const harness = createValidatorHarness();
    const subject: ProductValidationSubject = {
      ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'near-miss-product', {}),
      getClassName: () => 'Product',
      hasProperty: (identifier: string) => identifier === 'baseProductType',
      baseProductType: SUBSCRIPTION_PRODUCT_TYPE.systemCode,
    };

    const errors = await harness.validateDryRun(
      subject,
      productValidationRuleSet,
      nearMiss as never,
    );

    expect(errors.hasErrors()).toBe(false);
  });
});

/* ================================================================================================
 * SECTION C — CONTEXT SELECTION, FLATTENING, CONDITIONS, ACCUMULATION AND CACHE SCOPE
 * ============================================================================================== */

/**
 * Every member of the closed `ValidationContext` union, so "every context" can be asserted.
 *
 * Restated here rather than imported, because the engine exports no runtime inventory to import: the
 * union is a compile-time declaration only, and the membership guard that once backed it with a
 * runtime list has been withdrawn (see THE RUNTIME CONTEXT-MEMBERSHIP GUARD IS WITHDRAWN in
 * `src/validation/Validator.ts`). The list cannot drift silently all the same — the annotation is the
 * union itself, so a tenth member added to the union without being added here leaves the `satisfies`
 * check below unsatisfied and a member removed from the union makes this list uncompilable.
 *
 * The order is the union's own declaration order, with the empty string first because it is the
 * engine's default at `org/Hibachi/HibachiValidationService.cfc:L153`.
 */
const EVERY_CONTEXT = [
  '',
  'save',
  'delete',
  'edit',
  'process',
  'addOptionGroup',
  'addOption',
  'addSubscriptionTerm',
  'updateSkus',
] as const satisfies readonly ValidationContext[];

/**
 * Proves at COMPILE TIME that {@link EVERY_CONTEXT} covers every member of `ValidationContext`.
 *
 * `Exclude` is `never` only when the union is fully covered, and `never` is the only type the
 * parameter accepts, so an uncovered member is a compile error rather than a silently short list. The
 * alias is never used as a value.
 */
type EveryContextCoverage<
  TUncovered extends never = Exclude<ValidationContext, (typeof EVERY_CONTEXT)[number]>,
> = TUncovered;

/** The coverage proof above, referenced once so the alias is not reported as unused. */
type _AssertEveryContextCovered = EveryContextCoverage;

/**
 * The five values that cast to CFML boolean false, and therefore the five that
 * `org/Hibachi/HibachiValidationService.cfc:L162` would treat as "switch validation off".
 *
 * None is a member of `ValidationContext`, so reaching the engine with one requires a deliberate
 * widening — which is exactly what the refusal cases below perform.
 */
const DISABLING_CONTEXT_TOKENS: readonly (readonly [string, unknown])[] = [
  ['the boolean false', false],
  ['the string "false"', 'false'],
  ['the string "FALSE"', 'FALSE'],
  ['the string "no"', 'no'],
  ['the number 0', 0],
];

describe('NET-NEW — C1. context selection semantics', () => {
  it.each(EVERY_CONTEXT.map((context) => [context === '' ? '(empty string)' : context, context]))(
    'NET-NEW — a rule with NO `contexts` key applies in the %s context',
    async (_label, context) => {
      // `org/Hibachi/HibachiValidationService.cfc:L71` selects a rule when
      // `!structKeyExists(rule, "contexts")` OR the list matches, so an absent selector means
      // UNCONDITIONAL selection. `model/validation/Product_UpdateSkus.json` is the decisive real
      // example: neither of its two rule objects declares `contexts`, and section B6 asserts that.
      //
      // Conditions may still suppress EXECUTION — the flag is off in this subject, so no error is
      // recorded — but that is a different mechanism. What is proved here is that SELECTION never
      // filters these rules out, which is why the next case can make them fire in every context too.
      const harness = createValidatorHarness();
      const flagOff: ProductUpdateSkusValidationSubject = {
        getClassName: () => 'Product_UpdateSkus',
        hasProperty: () => true,
        updatePriceFlag: 0,
        price: 'garbage',
      };
      const suppressed = await harness.validateDryRun(
        flagOff,
        productUpdateSkusValidationRuleSet,
        context,
      );
      expect(suppressed.hasErrors()).toBe(false);

      // Same rule, same context, flag ON: it fires. Selection was never the thing stopping it.
      const flagOn: ProductUpdateSkusValidationSubject = {
        getClassName: () => 'Product_UpdateSkus',
        hasProperty: () => true,
        updatePriceFlag: 1,
        price: 'garbage',
      };
      const fired = await harness.validateDryRun(
        flagOn,
        productUpdateSkusValidationRuleSet,
        context,
      );
      expect(fired.getError('price')).toStrictEqual([
        `validate.${context}.Product_UpdateSkus.price.dataType.numeric`,
      ]);
    },
  );

  it.each(DISABLING_CONTEXT_TOKENS.map(([label, token]) => [label, token]))(
    'NET-NEW TODO(parity) — %s as the context DISABLES validation entirely, and the bypass is carried',
    async (_label, disablingContext) => {
      // `org/Hibachi/HibachiValidationService.cfc:L162` wraps the whole legacy pass in
      // `if(!isBoolean(arguments.context) || arguments.context)`, so a context that CASTS to boolean
      // false disables validation altogether — no rule selected, no collaborator consulted, an empty
      // bag returned and a caller reading `hasErrors()` as false. CFML's boolean casting accepts
      // "false", "no" and 0 as well as the boolean, so all five rows are the same bypass.
      //
      // ⛔ THIS IS ASSERTED AS IT BEHAVES, NOT AS IT SHOULD BEHAVE. A revision of this suite asserted a
      // `TypeError` here instead, produced by a runtime membership guard in `Validator.validate`. Both
      // the guard and that expectation are withdrawn: refusing a value `:L162` accepts is a behaviour
      // change, and AAP §0.6.7.7 declares exactly ONE departure in this port (D18, the importer's
      // parameterised SQL) while AAP §0.8.2 guideline 4 forbids the rest outright. The defect is
      // therefore CARRIED and flagged — see THE RUNTIME CONTEXT-MEMBERSHIP GUARD IS WITHDRAWN in
      // `src/validation/Validator.ts`.
      //
      // The widening cast is what makes the case reachable at all: `ValidationContext` is a closed
      // nine-member union, so no compiler-checked caller in this subtree can write a disabling token
      // down. The cast reproduces the three crossings on which one arrives anyway — a parsed request
      // body, an `as ValidationContext` assertion, and a JavaScript consumer of the emitted bundle.
      const uniqueProperty = createUniquePropertyDouble([
        {
          entityName: 'SlatwallProduct',
          propertyName: 'productCode',
          value: 'taken',
          entityID: 'other',
        },
      ]);
      const validator = new Validator(uniqueProperty.uniqueProperty);
      const subject: ProductValidationSubject = {
        ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'mine', {
          productCode: 'taken',
        }),
        getClassName: () => 'Product',
        hasProperty: () => true,
        productCode: 'taken',
      };

      // A caller-supplied bag, so the bypass can be shown to hand back that very bag, unmodified.
      const suppliedBag = new ValidationError();

      const returned = await validator.validate(
        subject,
        productValidationRuleSet,
        disablingContext as never,
        { errors: suppliedBag },
      );

      // The caller's own bag comes back, empty, even though `productCode` is both taken and required.
      expect(returned).toBe(suppliedBag);
      expect(suppliedBag.hasErrors()).toBe(false);
      expect(Object.keys(suppliedBag.getErrors())).toStrictEqual([]);
      // And no collaborator was consulted, because the gate returns before the property loop.
      expect(uniqueProperty.calls).toStrictEqual([]);
    },
  );

  it.each(DISABLING_CONTEXT_TOKENS.map(([label, token]) => [label, token]))(
    'NET-NEW TODO(parity) — %s disables BOTH passes of validateProcess, and neither bag is touched',
    async (_label, disablingContext) => {
      // `validateProcess` forwards one context into two `validate` passes
      // (`org/Hibachi/HibachiService.cfc:L96` and `:L108`), so the `:L162` gate suppresses both. This
      // row exists so the two-object flow is not mistaken for a path that escapes the carried defect.
      const uniqueProperty = createUniquePropertyDouble([]);
      const validator = new Validator(uniqueProperty.uniqueProperty);
      const entity: ProductValidationSubject = {
        ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'mine', { productCode: '' }),
        getClassName: () => 'Product',
        hasProperty: () => true,
        productCode: '',
      };
      const processObject: ProductUpdateSkusValidationSubject = {
        getClassName: () => 'Product_UpdateSkus',
        hasProperty: () => true,
        updatePriceFlag: 1,
        price: 'garbage',
      };
      const entityErrors = new ValidationError();
      const processObjectErrors = new ValidationError();

      await validator.validateProcess({
        entity,
        entityRuleSet: productValidationRuleSet,
        processContext: disablingContext as never,
        entityErrors,
        processObject: {
          subject: processObject,
          ruleSet: productUpdateSkusValidationRuleSet,
          errors: processObjectErrors,
        },
      });

      // Both bags are untouched: the required `productCode` and the numeric `price` both go unchecked.
      expect(entityErrors.hasErrors()).toBe(false);
      expect(processObjectErrors.hasErrors()).toBe(false);
      expect(uniqueProperty.calls).toStrictEqual([]);
    },
  );

  it('NET-NEW — the empty-string context is NOT a disabling token, and rules without a selector still run', async () => {
    // `''` does not cast to a CFML boolean, so `isBoolean("")` is false and the guard at
    // `org/Hibachi/HibachiValidationService.cfc:L162` lets the pass proceed. The distinction matters:
    // an over-eager falsy test in the port would treat `''` as disabling and silently skip every rule.
    const harness = createValidatorHarness();
    const subject: ProductUpdateSkusValidationSubject = {
      getClassName: () => 'Product_UpdateSkus',
      hasProperty: () => true,
      updatePriceFlag: 1,
    };

    const errors = await harness.validateDryRun(subject, productUpdateSkusValidationRuleSet, '');
    // The message key carries the empty context verbatim, producing the doubled separator. That is
    // the composed key, not a defect: `:L222`-`:L230` interpolate the context without normalising it.
    expect(errors.getError('price')).toStrictEqual(['validate..Product_UpdateSkus.price.required']);
  });

  it('NET-NEW — a property absent from the subject is skipped in silence: no throw and no failure', async () => {
    // S7 — PRESERVED, NOT REPAIRED. `org/Hibachi/HibachiValidationService.cfc:L171` guards every
    // property with `if(arguments.object.hasProperty(propertyIdentifier))`. A subject that does not
    // carry the property is not a validation failure and is not an error either; the rule simply does
    // not run. Section B8 is the whole family of real cases this behaviour produces.
    const required: Constraint<MatrixSubject> = {
      constraintType: 'required',
      constraintValue: true,
    };
    const harness = createValidatorHarness();

    // Same missing value, twice, differing only in what `hasProperty` answers.
    const present = await harness.validateDryRun(
      matrixSubject({ value: null, present: true }),
      matrixRuleSet(required),
      'save',
    );
    expect(present.getError(MATRIX_PROPERTY)).toStrictEqual([
      'validate.save.MatrixSubject.value.required',
    ]);

    const absent = await harness.validateDryRun(
      matrixSubject({ value: null, present: false }),
      matrixRuleSet(required),
      'save',
    );
    expect(absent.hasErrors()).toBe(false);
    expect(absent.getError(MATRIX_PROPERTY)).toStrictEqual([]);
  });
});

describe('NET-NEW — C2. flattening into independent constraint records, and deterministic order', () => {
  it('NET-NEW — `model/validation/Product.json:L10` becomes THREE independent constraint records', () => {
    // `org/Hibachi/HibachiValidationService.cfc:L77-L88` walks a rule object's keys, SKIPS `contexts`
    // and `conditions` as selectors, and appends one `{constraintType, constraintValue}` record per
    // remaining key. One rule object with three constraint keys therefore yields three records, each
    // able to append its own error.
    const productCode = first(
      productValidationRuleSet.properties.filter(
        (property) => property.propertyIdentifier === 'productCode',
      ),
    );
    const rule = first(productCode.rules);

    expect(rule.constraints.map((constraint) => constraint.constraintType)).toStrictEqual([
      'required',
      'unique',
      'regex',
    ]);
    // The selectors are carried as SELECTORS, not as constraints: `contexts` survives on the rule and
    // never appears among the constraint records.
    expect(rule.contexts).toBe('save');
    expect(rule.constraints.map((constraint) => constraint.constraintType)).not.toContain(
      'contexts',
    );
    expect(rule.constraints.map((constraint) => constraint.constraintType)).not.toContain(
      'conditions',
    );
  });

  it('NET-NEW — all three `productCode` constraints fail together and accumulate under ONE property key', async () => {
    // The engine must NOT short-circuit. `org/Hibachi/HibachiValidationService.cfc:L177-L232` runs
    // every constraint of every selected rule and calls `addError(propertyIdentifier, message)` at
    // `:L224`/`:L228`/`:L232` for each failure, keyed by the FULL PROPERTY IDENTIFIER — never by the
    // constraint type. A blank code fails presence, fails the regular expression (because `+` cannot
    // match an empty string) and — with a collision seeded against a different row — fails uniqueness.
    const harness = createValidatorHarness([
      { entityName: 'SlatwallProduct', propertyName: 'productCode', value: '', entityID: 'other' },
    ]);
    const subject: ProductValidationSubject = {
      ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'mine', { productCode: '' }),
      getClassName: () => 'Product',
      hasProperty: (identifier: string) => identifier === 'productCode',
      productCode: '',
    };

    const errors = await harness.validateDryRun(subject, productValidationRuleSet, 'save');

    // G6 — DETERMINISTIC SOURCE ORDER IS AN INTENTIONAL TARGET DECISION, NOT A CLAIM ABOUT LEGACY
    // ORDER. The legacy engine iterates CFML STRUCT KEYS at
    // `org/Hibachi/HibachiValidationService.cfc:L78`, and CFML never specified struct-key iteration
    // order, so the legacy sequence of these three messages was UNSPECIFIED and could differ between
    // engines and even between requests. The port replaces the struct with an ORDERED ARRAY declared in
    // the source document's own key order, which makes the sequence reproducible. That reproducibility
    // is a deliberate improvement in determinism only; it changes WHICH ORDER the same three messages
    // appear in, never WHETHER all three appear. The set is the behaviour; the order is the decision,
    // and it is pinned here so a future reordering of a rule module is caught rather than absorbed.
    expect(errors.getError('productCode')).toStrictEqual([
      'validate.save.Product.productCode.required',
      'validate.save.Product.productCode.unique',
      'validate.save.Product.productCode.regex',
    ]);
    // Three messages, ONE key. The bag is keyed by property, which is why its values are arrays.
    expect(Object.keys(errors.getErrors())).toStrictEqual(['productCode']);
    expect(errors.getError('productCode')).toHaveLength(3);
    // Evaluation reached the uniqueness constraint even though the presence constraint before it had
    // already failed — direct evidence that nothing short-circuits.
    expect(harness.uniqueProperty.calls).toHaveLength(1);
  });

  it('NET-NEW — properties are evaluated in the source document order, and each keeps its own bucket', async () => {
    const harness = createValidatorHarness();
    // Nothing set at all, so every unconditional `save` presence rule of the document speaks at once.
    const errors = await harness.validateDryRun(buildProduct({}), productValidationRuleSet, 'save');

    // The order of the keys follows `productValidationRuleSet.properties`, which follows
    // `model/validation/Product.json` from `:L8` down to `:L16`. `baseProductType` and the three
    // `unused*` gates are absent because their contexts do not include `save`; `physicalCounts` is
    // absent for the reason section B8 documents.
    expect(Object.keys(errors.getErrors())).toStrictEqual([
      'price',
      'productName',
      'productCode',
      'productType',
      'urlTitle',
    ]);
    for (const key of Object.keys(errors.getErrors())) {
      expect(errors.getError(key)).toStrictEqual([`validate.save.Product.${key}.required`]);
    }
  });
});

/* ------------------------------------------------------------------------------------------------
 * Local condition fixtures for section C3. Typed against the public `Validator` surface, declared
 * here rather than in a helper module, and never mutated.
 * ---------------------------------------------------------------------------------------------- */

interface ConditionSubject extends ValidationSubject {
  readonly value?: unknown;
  readonly flagA?: unknown;
  readonly flagB?: unknown;
}

const CONDITION_CLASS_NAME = 'ConditionSubject';

function conditionSubject(
  overrides: Omit<ConditionSubject, 'getClassName' | 'hasProperty'>,
): ConditionSubject {
  return {
    getClassName: () => CONDITION_CLASS_NAME,
    hasProperty: () => true,
    ...overrides,
  };
}

/** `flagA eq 1` — one predicate, one condition. */
const CONDITION_A: ValidationCondition<ConditionSubject> = {
  name: 'onFlagA',
  constraints: [
    {
      propertyIdentifier: 'flagA',
      read: (subject) => subject.flagA,
      constraint: { constraintType: 'eq', constraintValue: 1 },
    },
  ],
};

/** `flagB eq 1` — the second alternative for the OR case. */
const CONDITION_B: ValidationCondition<ConditionSubject> = {
  name: 'onFlagB',
  constraints: [
    {
      propertyIdentifier: 'flagB',
      read: (subject) => subject.flagB,
      constraint: { constraintType: 'eq', constraintValue: 1 },
    },
  ],
};

/** `flagA eq 1` AND `flagB eq 1` — two predicates inside ONE condition. */
const CONDITION_BOTH: ValidationCondition<ConditionSubject> = {
  name: 'onBothFlags',
  constraints: [...CONDITION_A.constraints, ...CONDITION_B.constraints],
};

function conditionRuleSet(
  conditionSelector: string,
  declared: readonly ValidationCondition<ConditionSubject>[],
): ValidationRuleSet<ConditionSubject> {
  return {
    properties: [
      {
        propertyIdentifier: 'value',
        read: (subject) => subject.value,
        rules: [
          {
            conditions: conditionSelector,
            constraints: [{ constraintType: 'required', constraintValue: true }],
          },
        ],
      },
    ],
    conditions: declared,
  };
}

describe('NET-NEW — C3. condition evaluation: OR across names, AND within one, and unsupported kinds', () => {
  it.each([
    ['the first alternative is met', { flagA: 1 }, true],
    ['the second alternative is met', { flagB: 1 }, true],
    ['both alternatives are met', { flagA: 1, flagB: 1 }, true],
    ['neither alternative is met', {}, false],
    ['both flags are present but wrong', { flagA: 0, flagB: 2 }, false],
  ])(
    'NET-NEW — OR across a comma-delimited condition list: %s',
    async (_label, flags, gateOpen) => {
      // `getConditionsMeetFlag` at `org/Hibachi/HibachiValidationService.cfc:L97-L131` loops the
      // comma-delimited list and RETURNS TRUE on the first condition whose predicates all hold
      // (`:L124-L126`), falling through to false only when none did (`:L130`). That is a disjunction
      // across names.
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        conditionSubject({ value: null, ...flags }),
        conditionRuleSet(`${CONDITION_A.name},${CONDITION_B.name}`, [CONDITION_A, CONDITION_B]),
        'save',
      );
      expect(errors.hasError('value')).toBe(gateOpen);
    },
  );

  it.each([
    ['both predicates hold', { flagA: 1, flagB: 1 }, true],
    ['only the first holds', { flagA: 1 }, false],
    ['only the second holds', { flagB: 1 }, false],
    ['neither holds', {}, false],
  ])(
    'NET-NEW — AND across the predicates inside one condition: %s',
    async (_label, flags, gateOpen) => {
      // Inside a single condition the loop at `:L114-L122` clears an all-met flag on any failure and
      // deliberately does NOT break (`:L118`), so every predicate is evaluated and every one must hold.
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        conditionSubject({ value: null, ...flags }),
        conditionRuleSet(CONDITION_BOTH.name, [CONDITION_BOTH]),
        'save',
      );
      expect(errors.hasError('value')).toBe(gateOpen);
    },
  );

  it('NET-NEW — a condition name absent from the declarations is SKIPPED, and alone it leaves the gate shut', async () => {
    // `:L108` tests `structKeyExists(conditionsMetaData, thisCondition)` and moves on when the name is
    // unknown, so an unknown name contributes nothing — neither a met condition nor a failure.
    const harness = createValidatorHarness();

    const onlyUnknown = await harness.validateDryRun(
      conditionSubject({ value: null, flagA: 1 }),
      conditionRuleSet('noSuchCondition', [CONDITION_A]),
      'save',
    );
    // The list had exactly one name, it was skipped, so nothing was met and `:L130` returns false.
    expect(onlyUnknown.hasErrors()).toBe(false);

    // With a known name alongside it, the known one still decides.
    const unknownThenKnown = await harness.validateDryRun(
      conditionSubject({ value: null, flagA: 1 }),
      conditionRuleSet(`noSuchCondition,${CONDITION_A.name}`, [CONDITION_A]),
      'save',
    );
    expect(unknownThenKnown.getError('value')).toStrictEqual([
      'validate.save.ConditionSubject.value.required',
    ]);
  });

  it.each([
    ['exactly as declared', CONDITION_A.name],
    ['upper-cased', CONDITION_A.name.toUpperCase()],
    ['lower-cased', CONDITION_A.name.toLowerCase()],
  ])('NET-NEW — a condition name is matched case-insensitively: %s', async (_label, selector) => {
    // CFML struct keys are case-insensitive, so the lookup at `:L108` is too.
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      conditionSubject({ value: null, flagA: 1 }),
      conditionRuleSet(selector, [CONDITION_A]),
      'save',
    );
    expect(errors.hasError('value')).toBe(true);
  });

  it('NET-NEW — an unsupported constraint INSIDE a condition block is silently ignored, and the gate stays open', async () => {
    // S7 — PRESERVED, NOT HARMONISED. `:L117` reads
    // `if(structKeyExists(variables, "validate_#constraint#") && !invokeMethod(...))`. The EXISTENCE
    // TEST COMES FIRST, so an unrecognised constraint kind short-circuits the conjunction before any
    // evaluator runs and never clears the all-met flag. The result is that an unknown kind inside a
    // condition block contributes nothing and the condition is judged on its remaining predicates —
    // here, on none at all, so it is judged MET.
    //
    // The cast is the only way to hand the engine a token the closed `Constraint` union forbids; it
    // uses `unknown` as the bridge rather than `any` and carries no compiler suppression.
    const harness = createValidatorHarness();
    const unsupportedOnly: ValidationCondition<ConditionSubject> = {
      name: 'unsupportedOnly',
      constraints: [
        {
          propertyIdentifier: 'flagA',
          read: (subject) => subject.flagA,
          constraint: {
            constraintType: 'notAConstraintKind',
            constraintValue: 1,
          } as unknown as Constraint<ConditionSubject>,
        },
      ],
    };

    const errors = await harness.validateDryRun(
      conditionSubject({ value: null, flagA: 'irrelevant' }),
      conditionRuleSet(unsupportedOnly.name, [unsupportedOnly]),
      'save',
    );
    expect(errors.getError('value')).toStrictEqual([
      'validate.save.ConditionSubject.value.required',
    ]);
  });

  it('NET-NEW — an unsupported constraint alongside a real one does NOT rescue a failing condition', async () => {
    // The other half of `:L117`: what is skipped is the UNKNOWN kind, not the conjunction. A real
    // predicate that fails still shuts the gate, so the silent skip cannot be mistaken for
    // "conditions containing an unknown kind always pass".
    const harness = createValidatorHarness();
    const mixed: ValidationCondition<ConditionSubject> = {
      name: 'mixedKinds',
      constraints: [
        {
          propertyIdentifier: 'flagB',
          read: (subject) => subject.flagB,
          constraint: {
            constraintType: 'notAConstraintKind',
            constraintValue: 1,
          } as unknown as Constraint<ConditionSubject>,
        },
        ...CONDITION_A.constraints,
      ],
    };

    const met = await harness.validateDryRun(
      conditionSubject({ value: null, flagA: 1 }),
      conditionRuleSet(mixed.name, [mixed]),
      'save',
    );
    expect(met.hasError('value')).toBe(true);

    const unmet = await harness.validateDryRun(
      conditionSubject({ value: null, flagA: 9 }),
      conditionRuleSet(mixed.name, [mixed]),
      'save',
    );
    expect(unmet.hasErrors()).toBe(false);
  });

  it('NET-NEW — an unsupported constraint in the MAIN validation path THROWS, and the contrast with conditions is deliberate', async () => {
    // `:L201-L203` raises for an unrecognised constraint kind on the ordinary path, because there the
    // existence test is absent and the dispatch has nowhere to go. That asymmetry against `:L117` is
    // carried across UNHARMONISED: it is the legacy behaviour, and making both paths agree would be a
    // repair rather than a port.
    //
    // The legacy message text is deliberately NOT asserted. Only the raise is behaviour a caller can
    // observe; the wording is not, and reproducing a legacy `throw()` string here would pin a detail
    // the port does not owe.
    const harness = createValidatorHarness();
    const unsupported = {
      constraintType: 'notAConstraintKind',
      constraintValue: 1,
    } as unknown as Constraint<MatrixSubject>;

    await expect(
      harness.validateDryRun(
        matrixSubject({ value: 'anything' }),
        matrixRuleSet(unsupported),
        'save',
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('NET-NEW — conditions are copied onto EVERY flattened constraint, so each is gated independently', async () => {
    // `:L83-L85` copies `rule.conditions` onto each flattened record, and `:L177-L180` re-evaluates
    // the gate PER CONSTRAINT. `model/validation/Product_UpdateSkus.json:L11` is the real proof: its
    // one rule object carries two constraints behind one condition, and both must be independently
    // capable of firing.
    const harness = createValidatorHarness();

    // Flag on, value missing: the presence record fires and the type record passes (null passes
    // `dataType`). Only ONE of the two gated records spoke.
    const missing = await harness.validateDryRun(
      {
        getClassName: () => 'Product_UpdateSkus',
        hasProperty: () => true,
        updatePriceFlag: 1,
      },
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(missing.getError('price')).toStrictEqual([PRICE_REQUIRED_MESSAGE_KEY]);

    // Flag on, value present but nonnumeric: the type record fires and the presence record passes.
    // The OTHER of the two gated records spoke, which is what "independently capable" means.
    const nonnumeric = await harness.validateDryRun(
      {
        getClassName: () => 'Product_UpdateSkus',
        hasProperty: () => true,
        updatePriceFlag: 1,
        price: 'garbage',
      },
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(nonnumeric.getError('price')).toStrictEqual([PRICE_DATA_TYPE_MESSAGE_KEY]);
  });
});

describe('NET-NEW — C4. M7 — memoisation must be request-scoped, never module-scoped', () => {
  it('NET-NEW — M7 — two invocations sharing a class-and-context key do not inherit each other rules', async () => {
    // M7 — THE DECISION, RECORDED. `org/Hibachi/HibachiValidationService.cfc:L92` memoises the
    // selected-and-flattened rule collection under the key `"#className#-#context#"`. In a persistent
    // ColdFusion application that cache lived for the life of the application. In a Lambda, nothing
    // survives an invocation EXCEPT module-scope state, and a warm container is shared across
    // invocations and therefore potentially across tenants (AAP §0.6.6 M7). The decision this file
    // pins is that any such memoisation MUST BE REQUEST-SCOPED, and that the simplest compliant
    // implementation is NO CACHE AT ALL — which is what the realized engine does.
    //
    // The two invocations below share the class name AND the context, so a module-scope cache keyed the
    // legacy way would serve invocation one's rules to invocation two.
    const sharedClassName = 'SharedKey';
    const sharedContext: ValidationContext = 'save';
    const subject = (value: unknown): ConditionSubject => ({
      getClassName: () => sharedClassName,
      hasProperty: () => true,
      value,
    });
    const presenceOnly: ValidationRuleSet<ConditionSubject> = {
      properties: [
        {
          propertyIdentifier: 'value',
          read: (candidate) => candidate.value,
          rules: [
            {
              contexts: sharedContext,
              constraints: [{ constraintType: 'required', constraintValue: true }],
            },
          ],
        },
      ],
    };
    const floorOnly: ValidationRuleSet<ConditionSubject> = {
      properties: [
        {
          propertyIdentifier: 'value',
          read: (candidate) => candidate.value,
          rules: [
            {
              contexts: sharedContext,
              constraints: [{ constraintType: 'minValue', constraintValue: 10 }],
            },
          ],
        },
      ],
    };

    const harness = createValidatorHarness();

    // Invocation 1 — presence rules, a missing value.
    const firstErrors = await harness.validateDryRun(subject(null), presenceOnly, sharedContext);
    expect(firstErrors.getError('value')).toStrictEqual(['validate.save.SharedKey.value.required']);

    // Invocation 2 — SAME key, DIFFERENT rule set. If invocation 1's flattened rules had been cached,
    // this would report a presence failure instead of a floor failure.
    const secondErrors = await harness.validateDryRun(subject(5), floorOnly, sharedContext);
    expect(secondErrors.getError('value')).toStrictEqual([
      'validate.save.SharedKey.value.minValue',
    ]);

    // Invocation 3 — back to the first rule set, proving the second did not poison it either.
    const thirdErrors = await harness.validateDryRun(subject(null), presenceOnly, sharedContext);
    expect(thirdErrors.getError('value')).toStrictEqual(['validate.save.SharedKey.value.required']);
  });

  it('NET-NEW — M7 — no error bag survives an invocation: each call returns a fresh, independent bag', async () => {
    const harness = createValidatorHarness();
    const failing = matrixRuleSet({ constraintType: 'required', constraintValue: true });

    const firstBag = await harness.validateDryRun(matrixSubject({ value: null }), failing, 'save');
    const secondBag = await harness.validateDryRun(matrixSubject({ value: 'ok' }), failing, 'save');

    expect(firstBag).not.toBe(secondBag);
    expect(firstBag.hasErrors()).toBe(true);
    // The second invocation neither inherited nor accumulated the first invocation's failure.
    expect(secondBag.hasErrors()).toBe(false);
    expect(secondBag.getError(MATRIX_PROPERTY)).toStrictEqual([]);
    // And the first bag was not retroactively emptied.
    expect(firstBag.getError(MATRIX_PROPERTY)).toStrictEqual([
      'validate.save.MatrixSubject.value.required',
    ]);
  });

  it('NET-NEW — M7 — the exported rule modules are frozen, and no case in this file mutates one', () => {
    // The other half of the M7 argument. Module-scope declarative data is safe on a warm container
    // ONLY while it is immutable and request-independent: it holds no connection, no request context,
    // no resolved value and no accumulated error. Freezing is what makes that structural rather than
    // conventional, so it is asserted rather than assumed.
    expect(Object.isFrozen(productValidationRuleSet)).toBe(true);
    expect(Object.isFrozen(productValidationRuleSet.properties)).toBe(true);
    expect(Object.isFrozen(brandValidationRules)).toBe(true);
    expect(Object.isFrozen(optionValidationRuleSet)).toBe(true);
    expect(Object.isFrozen(optionGroupValidationRuleSet)).toBe(true);
    expect(Object.isFrozen(first(productValidationRuleSet.properties))).toBe(true);
    // Freezing reaches the individual rule objects too, not merely the outer containers.
    const everyProductRule = productValidationRuleSet.properties.flatMap((property) => [
      ...property.rules,
    ]);
    expect(everyProductRule.length).toBeGreaterThan(0);
    for (const rule of everyProductRule) {
      expect(Object.isFrozen(rule)).toBe(true);
      expect(Object.isFrozen(rule.constraints)).toBe(true);
    }
  });
});

/* ================================================================================================
 * SECTION D — `Product_UpdateSkus` CONDITIONS AND LOOSE CFML EQUALITY
 * ==============================================================================================
 *
 * G6 — CONTEXTS AND CONDITIONS ARE ORTHOGONAL SELECTION MECHANISMS, AND BOTH MUST BE MODELLED.
 * `contexts` selects WHICH rules take part in a pass, comparing the caller's context against a
 * comma-delimited list at `org/Hibachi/HibachiValidationService.cfc:L71`. `conditions` decides
 * WHETHER an already-selected constraint executes, evaluating predicates against the subject at
 * `:L97-L131` and re-checking them per constraint at `:L177-L180`. They are independent axes:
 * `model/validation/Product_UpdateSkus.json` uses conditions with NO contexts (section C1 proves the
 * rules therefore apply in every context), while `model/validation/Product.json` uses contexts with
 * no conditions. A port that collapsed the two into one gate would be wrong in both directions —
 * it would either run the update-SKU rules unconditionally or suppress them everywhere.
 *
 * G6 — LOOSE EQUALITY IS REQUIRED, AND THE REASON IS THE PROCESS OBJECT'S OWN TYPING. The flags this
 * section gates on originate in `model/process/Product_UpdateSkus.cfc`, whose properties are declared
 * without a CFML type, and they arrive from an HTTP form post where EVERY value is a string. A form
 * checkbox therefore delivers `"1"`, a programmatic caller delivers the number `1`, and a CFML
 * caller could deliver the boolean `true` — all three meaning the same thing. `validate_eq` at
 * `:L385-L395` compares with CFML `==`, which coerces before comparing, so all three satisfy
 * `eq 1`. Tightening this to `===` would silently disable the price rules for every form post, which
 * is the ONLY way this slice is actually driven. The loose comparison is behaviour, not laxity.
 * ---------------------------------------------------------------------------------------------- */

/** A `Product_UpdateSkus` process-object-shaped validation subject, built per case. */
function updateSkusSubject(
  overrides: Omit<ProductUpdateSkusValidationSubject, 'getClassName' | 'hasProperty'>,
): ProductUpdateSkusValidationSubject {
  return {
    getClassName: () => 'Product_UpdateSkus',
    hasProperty: () => true,
    ...overrides,
  };
}

describe('NET-NEW — D1. `Product_UpdateSkus` — each flag gates only its own property', () => {
  it('NET-NEW — `updatePriceFlag` on and `updateListPriceFlag` off validates ONLY price', async () => {
    // `model/validation/Product_UpdateSkus.json:L11` gates `price` behind `showPrice`, whose sole
    // predicate is `updatePriceFlag eq 1` (`:L3-L5`). `:L12` gates `listPrice` behind
    // `showListPrice` / `updateListPriceFlag eq 1` (`:L6-L8`). The two gates share nothing.
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      updateSkusSubject({ updatePriceFlag: 1, updateListPriceFlag: 0 }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );

    expect(Object.keys(errors.getErrors())).toStrictEqual(['price']);
    expect(errors.getError('price')).toStrictEqual([PRICE_REQUIRED_MESSAGE_KEY]);
    expect(errors.getError('listPrice')).toStrictEqual([]);
  });

  it('NET-NEW — `updateListPriceFlag` on and `updatePriceFlag` off validates ONLY listPrice', async () => {
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      updateSkusSubject({ updatePriceFlag: 0, updateListPriceFlag: 1 }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );

    expect(Object.keys(errors.getErrors())).toStrictEqual(['listPrice']);
    expect(errors.getError('listPrice')).toStrictEqual([LIST_PRICE_REQUIRED_MESSAGE_KEY]);
    expect(errors.getError('price')).toStrictEqual([]);
  });

  it('NET-NEW — BOTH flags on validates both properties, and both buckets fill independently', async () => {
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      updateSkusSubject({ updatePriceFlag: 1, updateListPriceFlag: 1 }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );

    // Source document property order: `price` at `:L11`, then `listPrice` at `:L12`.
    expect(Object.keys(errors.getErrors())).toStrictEqual(['price', 'listPrice']);
    expect(errors.getError('price')).toStrictEqual([PRICE_REQUIRED_MESSAGE_KEY]);
    expect(errors.getError('listPrice')).toStrictEqual([LIST_PRICE_REQUIRED_MESSAGE_KEY]);
  });

  it.each([
    ['both flags explicitly off', { updatePriceFlag: 0, updateListPriceFlag: 0 }],
    ['both flags absent from the subject entirely', {}],
    ['both flags present but a non-matching value', { updatePriceFlag: 2, updateListPriceFlag: 9 }],
  ])('NET-NEW — %s validates NOTHING at all', async (_label, flags) => {
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      updateSkusSubject({ ...flags }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(errors.hasErrors()).toBe(false);
    expect(Object.keys(errors.getErrors())).toStrictEqual([]);
  });

  it.each([
    ['a nonnumeric string', 'total garbage'],
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['a negative number', -9999],
  ])(
    'NET-NEW — with its flag OFF, the price value is ENTIRELY unvalidated even when it is %s',
    async (_label, price) => {
      // The point of the conditional design: a caller that is not updating the price must be free to
      // leave whatever is in the field alone. There is deliberately NO unconditional safety-net rule,
      // and adding one would reject saves the legacy system accepts (S9 — invent nothing).
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        updateSkusSubject({ updatePriceFlag: 0, price, listPrice: price }),
        productUpdateSkusValidationRuleSet,
        'updateSkus',
      );
      expect(errors.hasErrors()).toBe(false);
    },
  );
});

describe('NET-NEW — D2. `Product_UpdateSkus` — what the gated constraints actually enforce', () => {
  it.each([
    // Absent: `dataType` PASSES a null (`:L258-L260`), so only presence speaks.
    ['absent from the subject entirely', undefined, [PRICE_REQUIRED_MESSAGE_KEY]],
    // Blank: NOT null, so `dataType` evaluates it — and `isNumeric('')` is FALSE in CFML — while
    // presence also rejects it. BOTH constraints fire, which is why the bag's values are arrays.
    ['an empty string', '', [PRICE_DATA_TYPE_MESSAGE_KEY, PRICE_REQUIRED_MESSAGE_KEY]],
    ['a whitespace-only string', '   ', [PRICE_DATA_TYPE_MESSAGE_KEY, PRICE_REQUIRED_MESSAGE_KEY]],
    ['a tab-and-newline string', '\t\n', [PRICE_DATA_TYPE_MESSAGE_KEY, PRICE_REQUIRED_MESSAGE_KEY]],
    // Nonnumeric but nonblank: presence is satisfied, only the type constraint speaks.
    ['a nonnumeric string', 'abc', [PRICE_DATA_TYPE_MESSAGE_KEY]],
    ['a nonnumeric string with digits inside', '12abc', [PRICE_DATA_TYPE_MESSAGE_KEY]],
    ['a currency-formatted string', '$19.99', [PRICE_DATA_TYPE_MESSAGE_KEY]],
  ])('NET-NEW — with the flag ON, a price of %s fails', async (_label, price, expected) => {
    // `validate_required` at `:L240-L246` treats null and a blank simple value as absent.
    // `validate_dataType` at `:L256-L267` returns true for a null but otherwise evaluates the value,
    // and `isNumeric('')` is FALSE in CFML — so a BLANK string fails BOTH constraints while an ABSENT
    // one fails only presence. A port that short-circuited on the presence failure, or that treated
    // blank as null inside the type check, would emit one message where the legacy engine emits two.
    // Section E rows 1 and 2 pin both evaluators in isolation.
    //
    // The realized `ProductUpdateSkusValidationSubject` derives its four members from
    // `ProductUpdateSkus` via `Pick`, and the process object types `price` as `string | number` — so an
    // explicit `null` is not expressible on this subject and the ABSENT case is what a real caller
    // produces. Section E row 1 covers the explicit-null presence failure through the generic seam.
    //
    // The two-message order is `dataType` then `required`, following the source key order of
    // `model/validation/Product_UpdateSkus.json:L11` (`conditions`, `dataType`, `required`) with the
    // selector skipped — the same deterministic-order decision section C2 documents.
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      updateSkusSubject({ updatePriceFlag: 1, ...(price === undefined ? {} : { price }) }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(errors.getError('price')).toStrictEqual(expected);
  });

  it.each([
    ['the number 0', 0],
    ['the string "0"', '0'],
    ['the string "0.00"', '0.00'],
  ])(
    'NET-NEW — with the flag ON, a price of %s PASSES presence: zero is a value',
    async (_label, price) => {
      // A truthiness test instead of `:L240-L246`'s "non-null and nonblank" predicate would reject zero
      // and make a free SKU unsavable. This row is the guard against that drift.
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        updateSkusSubject({ updatePriceFlag: 1, price }),
        productUpdateSkusValidationRuleSet,
        'updateSkus',
      );
      expect(errors.hasErrors()).toBe(false);
    },
  );

  it.each([
    ['a negative number', -5],
    ['a negative numeric string', '-0.01'],
    ['a very large negative number', -1_000_000],
  ])(
    'NET-NEW — with the flag ON, a price of %s is ACCEPTED because there is NO minValue constraint',
    async (_label, price) => {
      // S9 — INVENT NOTHING. `model/validation/Product_UpdateSkus.json:L11` declares exactly
      // `conditions`, `dataType` and `required`. `model/validation/Sku.json:L9` DOES declare
      // `minValue: 0` for the persistent SKU price, and section B2 asserts it — but this process
      // object does not, so the bulk-update path accepts a negative price that a direct SKU save would
      // reject. That asymmetry is the source document's, and it is carried, not smoothed over.
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        updateSkusSubject({ updatePriceFlag: 1, updateListPriceFlag: 1, price, listPrice: price }),
        productUpdateSkusValidationRuleSet,
        'updateSkus',
      );
      expect(errors.hasErrors()).toBe(false);
    },
  );

  it('NET-NEW — the two gated constraints of one property are independently capable of firing', async () => {
    const harness = createValidatorHarness();

    // Presence fails ALONE — the absent value is exactly the input that satisfies `dataType`.
    const absent = await harness.validateDryRun(
      updateSkusSubject({ updateListPriceFlag: 1 }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(absent.getError('listPrice')).toStrictEqual([LIST_PRICE_REQUIRED_MESSAGE_KEY]);

    // Type fails ALONE — a nonblank nonnumeric value satisfies presence.
    const nonnumeric = await harness.validateDryRun(
      updateSkusSubject({ updateListPriceFlag: 1, listPrice: 'nope' }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(nonnumeric.getError('listPrice')).toStrictEqual([LIST_PRICE_DATA_TYPE_MESSAGE_KEY]);

    // BOTH fail together for a blank string, and both messages accumulate under the one key.
    const blank = await harness.validateDryRun(
      updateSkusSubject({ updateListPriceFlag: 1, listPrice: '' }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(blank.getError('listPrice')).toStrictEqual([
      LIST_PRICE_DATA_TYPE_MESSAGE_KEY,
      LIST_PRICE_REQUIRED_MESSAGE_KEY,
    ]);

    // NEITHER fails for a well-formed value.
    const valid = await harness.validateDryRun(
      updateSkusSubject({ updateListPriceFlag: 1, listPrice: '24.95' }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );
    expect(valid.hasErrors()).toBe(false);
  });
});

describe('NET-NEW — D3. the loose `eq 1` truth table that opens a condition gate', () => {
  it.each([
    ['the number 1', 1, true],
    ['the string "1"', '1', true],
    ['the string "1.0"', '1.0', true],
    ['the string "yes"', 'yes', true],
    ['the string "YES"', 'YES', true],
    ['the string "true"', 'true', true],
    ['the number 0', 0, false],
    ['the string "0"', '0', false],
    ['the string "no"', 'no', false],
    ['the string "false"', 'false', false],
    ['the number 2', 2, false],
    ['the string "one"', 'one', false],
    ['an empty string', '', false],
    ['null', null, false],
  ])(
    'NET-NEW — `updatePriceFlag` of %s opens the gate: %s',
    async (_label, flagValue, gateOpen) => {
      // `validate_eq` at `:L385-L395` compares with CFML `==`. `"1"` equals `1` numerically;
      // `"yes"` and `"true"` are boolean-castable and compare true against a boolean-castable `1`;
      // `"one"` is neither numeric nor boolean-castable and falls through to a string comparison
      // against `"1"`, which fails. `null` fails outright — see section E row 8.
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        updateSkusSubject({ updatePriceFlag: flagValue as string | number }),
        productUpdateSkusValidationRuleSet,
        'updateSkus',
      );
      expect(errors.hasError('price')).toBe(gateOpen);
    },
  );

  it('NET-NEW — the BOOLEAN `true` also opens an `eq 1` gate, exercised through the generic subject seam', async () => {
    // The realized `ProductUpdateSkusValidationSubject` derives its flags from `ProductUpdateSkus`,
    // which types them `string | number` — a deliberate narrowing to what an HTTP form post and a
    // programmatic caller can actually deliver. Widening that production interface to admit a boolean
    // purely so a test could pass one would be a sibling edit made for the test's convenience, so the
    // boolean row goes through the generic `MatrixSubject` seam instead: the same `Validator`, the same
    // `eq` evaluator, and no production type touched.
    const eqOne: Constraint<MatrixSubject> = { constraintType: 'eq', constraintValue: 1 };

    await expect(passes(eqOne, true)).resolves.toBe(true);
    await expect(passes(eqOne, false)).resolves.toBe(false);
  });
});

describe('NET-NEW — D4. the loose `eq false` truth table that guards a delete', () => {
  /**
   * Three real sites declare this constraint: `model/validation/Sku.json:L3` (`defaultFlag`),
   * `model/validation/Sku.json:L12` (`transactionExistsFlag`) and
   * `model/validation/Product.json:L12` (`transactionExistsFlag`). All three mean "refuse the delete
   * unless this flag reads false".
   *
   * The loose truth table is exercised against the SKU rules because the realized
   * `SkuValidationSubject` types every constrained member as `unknown` — it is the honest shape for a
   * legacy flag that arrives untyped — so every row of the table is expressible without widening or
   * casting anything. The Product site is then asserted separately to prove the evaluator, not the
   * property, owns the semantics; its subject types `transactionExistsFlag?: boolean`, which is a
   * deliberate sibling narrowing this file adapts to rather than edits.
   */
  function skuDeleteSubject(
    property: 'defaultFlag' | 'transactionExistsFlag',
    flagValue: unknown,
  ): SkuValidationSubject & UniquePropertyEntity {
    return {
      ...uniqueEntityAccessors('SlatwallSku', 'skuID', 'guard-sku', {}),
      getClassName: () => 'Sku',
      hasProperty: (identifier: string) => identifier === property,
      hasUniqueOptions: () => Promise.resolve(true),
      hasOneOptionPerOptionGroup: () => true,
      [property]: flagValue,
    };
  }

  it.each([
    ['the boolean false', false, true],
    ['the string "false"', 'false', true],
    ['the string "FALSE"', 'FALSE', true],
    ['the number 0', 0, true],
    ['the string "0"', '0', true],
    ['the string "no"', 'no', true],
    ['the string "NO"', 'NO', true],
    ['the boolean true', true, false],
    ['the string "true"', 'true', false],
    ['the number 1', 1, false],
    ['the string "1"', '1', false],
    ['the string "yes"', 'yes', false],
  ])(
    'NET-NEW — a SKU `transactionExistsFlag` of %s satisfies `eq false`: %s',
    async (_label, flagValue, satisfied) => {
      // Both operands are boolean-castable, so `validate_eq` at
      // `org/Hibachi/HibachiValidationService.cfc:L385-L395` compares them AS BOOLEANS. `0`, `"0"`,
      // `"no"` and `"false"` all cast to false and therefore all permit the delete; `1`, `"1"`, `"yes"`
      // and `"true"` all cast to true and therefore all block it. A `=== false` port would block every
      // delete driven by a form post, because the flag arrives there as the string `"0"`.
      const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>(
        'guard-product',
      );
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        skuDeleteSubject('transactionExistsFlag', flagValue),
        ruleSet,
        'delete',
      );

      expect(errors.hasError('transactionExistsFlag')).toBe(!satisfied);
      if (!satisfied) {
        expect(errors.getError('transactionExistsFlag')).toStrictEqual([
          'validate.delete.Sku.transactionExistsFlag.eq',
        ]);
      }
    },
  );

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a whitespace-only string', '  '],
    ['a non-castable string', 'maybe'],
    ['an empty array', []],
    ['an object', {}],
  ])(
    'NET-NEW — a SKU `transactionExistsFlag` of %s FAILS `eq false` and blocks the delete',
    async (_label, flagValue) => {
      // `:L386-L388` returns FALSE for a null before any comparison — `eq` is the one evaluator in the
      // engine that treats absence as a FAILURE rather than a pass (contrast `dataType`, `minValue`,
      // `maxLength`, `regex` and the collection constraints, all of which pass a null; section E pins
      // each of them individually). A non-castable, non-numeric value falls through to the string
      // comparison against `"false"` and loses. The safe direction is the one chosen: an unresolvable
      // flag BLOCKS the delete rather than permitting it.
      const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>(
        'guard-product',
      );
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        skuDeleteSubject('transactionExistsFlag', flagValue),
        ruleSet,
        'delete',
      );
      expect(errors.getError('transactionExistsFlag')).toStrictEqual([
        'validate.delete.Sku.transactionExistsFlag.eq',
      ]);
    },
  );

  it('NET-NEW — no operand is pre-coerced: the raw subject value reaches the evaluator untouched', async () => {
    // A port that normalised with `Boolean(value)`, `Number(value)` or a bare truthiness test before
    // calling the evaluator would agree with the table above on most rows and diverge exactly on the
    // ones that matter. `Boolean('false')` is TRUE in JavaScript, so a `Boolean`-normalising port would
    // BLOCK a delete the legacy engine PERMITS. `Number('no')` is `NaN`, so a numeric-normalising port
    // would diverge there too. Both divergences are pinned as single decisive rows, each stating what
    // the naive port would have concluded alongside what the engine actually concludes.
    const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>('guard-product');
    const harness = createValidatorHarness();

    const stringFalse = await harness.validateDryRun(
      skuDeleteSubject('transactionExistsFlag', 'false'),
      ruleSet,
      'delete',
    );
    expect(Boolean('false')).toBe(true); // what a `Boolean`-normalising port would have concluded
    expect(stringFalse.hasError('transactionExistsFlag')).toBe(false); // what the engine concludes

    const stringNo = await harness.validateDryRun(
      skuDeleteSubject('transactionExistsFlag', 'no'),
      ruleSet,
      'delete',
    );
    expect(Number.isNaN(Number('no'))).toBe(true); // what a numeric-normalising port would have seen
    expect(stringNo.hasError('transactionExistsFlag')).toBe(false); // what the engine concludes

    // And the converse: a truthiness test would PERMIT a delete on `0`, which it should — but it would
    // also permit one on the empty string, which the engine BLOCKS because `''` is not castable.
    const emptyString = await harness.validateDryRun(
      skuDeleteSubject('transactionExistsFlag', ''),
      ruleSet,
      'delete',
    );
    expect(Boolean('')).toBe(false); // a truthiness port would have permitted the delete
    expect(emptyString.hasError('transactionExistsFlag')).toBe(true); // the engine blocks it
  });

  it.each([
    ['the boolean false', false, true],
    ['the string "0"', '0', true],
    ['the string "no"', 'no', true],
    ['the boolean true', true, false],
    ['the string "1"', '1', false],
    ['absent', undefined, false],
  ])(
    'NET-NEW — the SAME loose semantics govern the SKU `defaultFlag` guard at `Sku.json:L3`: %s satisfies it: %s',
    async (_label, flagValue, satisfied) => {
      // The truth table belongs to the evaluator, not to the property. Two distinct properties in the
      // same document, both `eq false`, must behave identically.
      const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>(
        'guard-product',
      );
      const harness = createValidatorHarness();
      const errors = await harness.validateDryRun(
        skuDeleteSubject('defaultFlag', flagValue),
        ruleSet,
        'delete',
      );
      expect(errors.hasError('defaultFlag')).toBe(!satisfied);
      if (!satisfied) {
        expect(errors.getError('defaultFlag')).toStrictEqual([
          'validate.delete.Sku.defaultFlag.eq',
        ]);
      }
    },
  );

  it.each([
    ['false', false, true],
    ['true', true, false],
    ['absent', undefined, false],
  ])(
    'NET-NEW — `Product.json:L12` is the third real site, and a boolean flag of %s satisfies it: %s',
    async (_label, flagValue, satisfied) => {
      // The realized `ProductValidationSubject` types `transactionExistsFlag?: boolean`, a narrowing
      // the Product entity's own calculated flag can honour. Only the expressible rows are asserted
      // here; the loose table above already proved the evaluator, and casting a string through this
      // narrower interface would test the cast rather than the engine.
      const harness = createValidatorHarness();
      const subject: ProductValidationSubject = {
        ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'guard-product', {}),
        getClassName: () => 'Product',
        hasProperty: (identifier: string) => identifier === 'transactionExistsFlag',
        ...(flagValue === undefined ? {} : { transactionExistsFlag: flagValue }),
      };

      const errors = await harness.validateDryRun(subject, productValidationRuleSet, 'delete');
      expect(errors.hasError('transactionExistsFlag')).toBe(!satisfied);
      if (!satisfied) {
        expect(errors.getError('transactionExistsFlag')).toStrictEqual([
          'validate.delete.Product.transactionExistsFlag.eq',
        ]);
      }
    },
  );
});

/* ================================================================================================
 * SECTION E — THE ELEVEN-ROW EVALUATOR AND NULL-SEMANTICS MATRIX
 * ==============================================================================================
 *
 * One case per constraint kind the engine supports, each reaching exactly one evaluator through the
 * only public evaluator seam the realized `Validator` exposes: `validate()` over a one-constraint
 * rule set. Eleven kinds, eleven cases, no snapshot.
 *
 * The single most consequential fact in this section is that the eleven evaluators DISAGREE about
 * absence, and the disagreement is deliberate legacy behaviour rather than an oversight. Nine of them
 * PASS a null — `dataType`, `minValue`, `maxLength`, `minCollection`, `maxCollection` and `regex`
 * explicitly return true before doing anything else — while `required`, `eq` and `inList` FAIL one.
 * A port that normalised absence to a single policy would silently change five documents' behaviour:
 * `model/validation/Sku.json:L4` and `:L10` rely on the passing direction so an unset `listPrice` or
 * `renewalPrice` is legal (section B2/X10b), and `model/validation/Sku.json:L3`/`:L12` and
 * `model/validation/Product.json:L12` rely on the failing direction so an unresolvable delete guard
 * blocks rather than permits (section D4).
 * ---------------------------------------------------------------------------------------------- */

describe('NET-NEW — E. the eleven-row evaluator and null-semantics matrix', () => {
  it('NET-NEW — matrix row 1 of 11 — `required`: null and blank and empty collections fail; zero passes', async () => {
    // G6 — `validate_required` at `org/Hibachi/HibachiValidationService.cfc:L240-L246` is a four-way
    // predicate, not a truthiness test. It passes when the value is non-null AND
    // (isObject OR arrayLen>0 OR structCount>0 OR (isSimpleValue AND len(trim())>0)). Every clause is
    // load-bearing, and each is asserted below.
    const required: Constraint<MatrixSubject> = {
      constraintType: 'required',
      constraintValue: true,
    };

    // Null and undefined FAIL. `required` is one of only three evaluators that reject absence.
    await expect(passes(required, null)).resolves.toBe(false);
    await expect(passes(required, undefined)).resolves.toBe(false);

    // An EMPTY ARRAY fails — `arrayLen > 0` is required, so a present-but-empty collection is absent
    // for validation purposes.
    await expect(passes(required, [])).resolves.toBe(false);

    // A WHITESPACE-ONLY string fails, because the simple-value clause trims before measuring.
    await expect(passes(required, '')).resolves.toBe(false);
    await expect(passes(required, '   ')).resolves.toBe(false);
    await expect(passes(required, '\t')).resolves.toBe(false);
    await expect(passes(required, '\n')).resolves.toBe(false);
    await expect(passes(required, ' \t\n ')).resolves.toBe(false);

    // An EMPTY STRUCT fails — `structCount > 0`.
    await expect(passes(required, {})).resolves.toBe(false);

    // ZERO PASSES, in both its numeric and its string form. This is the guard against truthiness
    // drift: `Boolean(0)` and `Boolean('0')` are false in JavaScript, so a port that tested
    // truthiness would reject a free product and make it unsavable.
    await expect(passes(required, 0)).resolves.toBe(true);
    await expect(passes(required, '0')).resolves.toBe(true);
    await expect(passes(required, 0.0)).resolves.toBe(true);

    // `false` also passes: it is a nonblank simple value, so the presence test is satisfied even
    // though the value is falsy. Another truthiness-drift guard.
    await expect(passes(required, false)).resolves.toBe(true);

    // Ordinary present values pass through every clause.
    await expect(passes(required, 'a')).resolves.toBe(true);
    await expect(passes(required, ' x ')).resolves.toBe(true);
    await expect(passes(required, ['one'])).resolves.toBe(true);
    await expect(passes(required, { key: 'value' })).resolves.toBe(true);
  });

  it('NET-NEW — matrix row 2 of 11 — `dataType`: null PASSES; a non-null invalid value fails the requested type', async () => {
    // G6 — `validate_dataType` at `:L256-L267` returns TRUE for a null at `:L258-L260` and only then
    // switches on the requested type. That early pass is what makes `model/validation/Sku.json:L4`
    // and `:L10` "optional but constrained": an unset `listPrice` is legal, a set one must be numeric.
    const numeric: Constraint<MatrixSubject> = {
      constraintType: 'dataType',
      constraintValue: 'numeric',
    };
    const url: Constraint<MatrixSubject> = { constraintType: 'dataType', constraintValue: 'url' };

    // NULL PASSES — for both requested types.
    await expect(passes(numeric, null)).resolves.toBe(true);
    await expect(passes(numeric, undefined)).resolves.toBe(true);
    await expect(passes(url, null)).resolves.toBe(true);
    await expect(passes(url, undefined)).resolves.toBe(true);

    // A non-null invalid value FAILS the requested type. Blank is NOT null, so it is judged — and
    // `isNumeric('')` is false in CFML, which is the nuance section D2 pins at a real document site.
    await expect(passes(numeric, '')).resolves.toBe(false);
    await expect(passes(numeric, '  ')).resolves.toBe(false);
    await expect(passes(numeric, 'abc')).resolves.toBe(false);
    await expect(passes(numeric, '12abc')).resolves.toBe(false);
    await expect(passes(numeric, '$19.99')).resolves.toBe(false);
    await expect(passes(numeric, [])).resolves.toBe(false);
    await expect(passes(numeric, {})).resolves.toBe(false);

    // Valid numeric forms pass, including negatives and zero — `dataType` judges FORM, never RANGE.
    await expect(passes(numeric, 0)).resolves.toBe(true);
    await expect(passes(numeric, '0')).resolves.toBe(true);
    await expect(passes(numeric, -12.5)).resolves.toBe(true);
    await expect(passes(numeric, '-12.5')).resolves.toBe(true);
    await expect(passes(numeric, '1000')).resolves.toBe(true);

    // The `url` type is the second and only other supported type, declared once in the corpus at
    // `model/validation/Brand.json:L4`.
    await expect(passes(url, 'https://example.com')).resolves.toBe(true);
    await expect(passes(url, 'http://example.com/path?query=1')).resolves.toBe(true);
    await expect(passes(url, 'not a url')).resolves.toBe(false);
    await expect(passes(url, '')).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 3 of 11 — `minValue`: null PASSES; a non-null nonnumeric value fails; the boundary passes', async () => {
    // G6 — `validate_minValue` at `:L269-L275` passes a null and then requires the value to be BOTH
    // numeric AND at or above the floor. A nonnumeric value therefore fails the FLOOR constraint in
    // its own right, independently of any `dataType` constraint that may sit beside it — which is why
    // `model/validation/Sku.json:L4` can emit two messages for one bad value (section B2/X10b).
    const floorZero: Constraint<MatrixSubject> = { constraintType: 'minValue', constraintValue: 0 };
    const floorTen: Constraint<MatrixSubject> = { constraintType: 'minValue', constraintValue: 10 };

    // NULL PASSES.
    await expect(passes(floorZero, null)).resolves.toBe(true);
    await expect(passes(floorZero, undefined)).resolves.toBe(true);

    // A non-null NONNUMERIC value FAILS the floor.
    await expect(passes(floorZero, 'abc')).resolves.toBe(false);
    await expect(passes(floorZero, '')).resolves.toBe(false);
    await expect(passes(floorZero, [])).resolves.toBe(false);
    await expect(passes(floorZero, {})).resolves.toBe(false);

    // THE BOUNDARY PASSES — the comparison is `>=`, not `>`. A floor of zero must admit a free SKU.
    await expect(passes(floorZero, 0)).resolves.toBe(true);
    await expect(passes(floorZero, '0')).resolves.toBe(true);
    await expect(passes(floorZero, '0.00')).resolves.toBe(true);
    await expect(passes(floorTen, 10)).resolves.toBe(true);
    await expect(passes(floorTen, '10')).resolves.toBe(true);

    // Above the floor passes; below it fails.
    await expect(passes(floorZero, 0.01)).resolves.toBe(true);
    await expect(passes(floorZero, 1000)).resolves.toBe(true);
    await expect(passes(floorZero, -0.01)).resolves.toBe(false);
    await expect(passes(floorZero, -1)).resolves.toBe(false);
    await expect(passes(floorTen, 9.99)).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 4 of 11 — `maxLength`: null PASSES; for a ceiling of 0, blank passes and nonblank fails', async () => {
    // G6 — `validate_maxLength` at `:L293-L299` passes a null and otherwise measures `len(value)`.
    // The corpus declares this constraint EXACTLY ONCE, at `model/validation/ProductType.json:L7`,
    // with a ceiling of ZERO — which turns a length constraint into a "must be empty" delete guard on
    // `systemCode`. Section B5/X10d asserts that real site. A ceiling of zero is emphatically NOT a
    // membership test against the seeded system codes, and reading it as one would let a seeded
    // product type be deleted.
    const ceilingZero: Constraint<MatrixSubject> = {
      constraintType: 'maxLength',
      constraintValue: 0,
    };
    const ceilingFive: Constraint<MatrixSubject> = {
      constraintType: 'maxLength',
      constraintValue: 5,
    };

    // NULL PASSES — an unseeded product type carries no system code, so the guard must not fire.
    await expect(passes(ceilingZero, null)).resolves.toBe(true);
    await expect(passes(ceilingZero, undefined)).resolves.toBe(true);

    // For a ceiling of 0, an EMPTY string passes.
    await expect(passes(ceilingZero, '')).resolves.toBe(true);

    // WHITESPACE-ONLY also passes: the engine trims before measuring, so a blank-but-present system
    // code is treated as empty. This is the behaviour, and it is asserted rather than assumed.
    await expect(passes(ceilingZero, ' ')).resolves.toBe(true);
    await expect(passes(ceilingZero, '   ')).resolves.toBe(true);
    await expect(passes(ceilingZero, '\t\n')).resolves.toBe(true);

    // Any NONBLANK value FAILS a ceiling of zero — which is exactly how the seeded discriminators of
    // `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` become undeletable.
    await expect(passes(ceilingZero, 'merchandise')).resolves.toBe(false);
    await expect(passes(ceilingZero, 'a')).resolves.toBe(false);
    await expect(passes(ceilingZero, '0')).resolves.toBe(false);

    // A nonzero ceiling behaves as an ordinary length limit, boundary inclusive.
    await expect(passes(ceilingFive, 'abcde')).resolves.toBe(true);
    await expect(passes(ceilingFive, 'abcdef')).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 5 of 11 — `minCollection`: null PASSES but an empty array FAILS for a floor of 1', async () => {
    // G6 — `validate_minCollection` at `:L301-L307` passes a null and otherwise requires
    // `arrayLen(value) >= floor`. The asymmetry between null and `[]` is the whole point: it is what
    // makes the three `unused*` gates of `model/validation/Product.json:L13-L15` fire when a product
    // has genuinely run out of options to add (an empty array) while staying silent when the gate is
    // not applicable at all (an absent property).
    const floorOne: Constraint<MatrixSubject> = {
      constraintType: 'minCollection',
      constraintValue: 1,
    };
    const floorTwo: Constraint<MatrixSubject> = {
      constraintType: 'minCollection',
      constraintValue: 2,
    };

    // NULL PASSES.
    await expect(passes(floorOne, null)).resolves.toBe(true);
    await expect(passes(floorOne, undefined)).resolves.toBe(true);

    // AN EMPTY ARRAY FAILS a floor of one.
    await expect(passes(floorOne, [])).resolves.toBe(false);

    // A ONE-ITEM array passes the floor of one, and fails a floor of two.
    await expect(passes(floorOne, ['only'])).resolves.toBe(true);
    await expect(passes(floorTwo, ['only'])).resolves.toBe(false);
    await expect(passes(floorTwo, ['one', 'two'])).resolves.toBe(true);

    // A non-collection simple value has no length to measure and fails.
    await expect(passes(floorOne, 'not a collection')).resolves.toBe(false);
    await expect(passes(floorOne, 7)).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 6 of 11 — `maxCollection`: null PASSES; empty passes a ceiling of 0; a simple value fails', async () => {
    // G6 — `validate_maxCollection` at `:L309-L315` passes a null and otherwise requires
    // `arrayLen(value) <= ceiling`. This is the most-declared constraint in the corpus with NINE
    // sites, every one of them a delete guard with a ceiling of ZERO: `Product.json:L7`,
    // `Sku.json:L13`, `Brand.json:L6` and `:L7`, `Option.json:L6`, `OptionGroup.json:L5`, and
    // `ProductType.json:L5`, `:L6` and `:L8`. Null passing is what makes the four `physicalCounts`
    // guards inert against a production-shaped subject (section B8).
    const ceilingZero: Constraint<MatrixSubject> = {
      constraintType: 'maxCollection',
      constraintValue: 0,
    };
    const ceilingTwo: Constraint<MatrixSubject> = {
      constraintType: 'maxCollection',
      constraintValue: 2,
    };

    // NULL PASSES.
    await expect(passes(ceilingZero, null)).resolves.toBe(true);
    await expect(passes(ceilingZero, undefined)).resolves.toBe(true);

    // AN EMPTY ARRAY PASSES a ceiling of zero — nothing depends on the row, so the delete proceeds.
    await expect(passes(ceilingZero, [])).resolves.toBe(true);

    // A ONE-ITEM collection FAILS a ceiling of zero — a single dependent row blocks the delete.
    await expect(passes(ceilingZero, ['one'])).resolves.toBe(false);
    await expect(passes(ceilingZero, ['one', 'two'])).resolves.toBe(false);

    // A NON-NULL SIMPLE VALUE FAILS: it is present but has no measurable collection length, so the
    // engine cannot conclude the collection is empty and refuses the delete. The conservative
    // direction again.
    await expect(passes(ceilingZero, 'not a collection')).resolves.toBe(false);
    await expect(passes(ceilingZero, 0)).resolves.toBe(false);
    await expect(passes(ceilingZero, '')).resolves.toBe(false);
    await expect(passes(ceilingZero, false)).resolves.toBe(false);

    // A nonzero ceiling behaves as an ordinary limit, boundary inclusive.
    await expect(passes(ceilingTwo, ['one', 'two'])).resolves.toBe(true);
    await expect(passes(ceilingTwo, ['one', 'two', 'three'])).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 7 of 11 — `regex`: null PASSES; a nonmatching non-null string fails', async () => {
    // G6 — `validate_regex` at `:L481-L487` passes a null and otherwise tests the pattern. Section A3
    // pins the one shared pattern the corpus declares three times; this row pins the EVALUATOR, and
    // in particular that the pattern is compiled with NO FLAGS, so `^` and `$` anchor the whole
    // string rather than each line. An `m` flag would let a multi-line payload smuggle an illegal
    // character past a code-format guard.
    const pattern: Constraint<MatrixSubject> = {
      constraintType: 'regex',
      constraintValue: CODE_FORMAT_REGEX,
    };

    // NULL PASSES — presence is `required`'s job, never the pattern's.
    await expect(passes(pattern, null)).resolves.toBe(true);
    await expect(passes(pattern, undefined)).resolves.toBe(true);

    // A NONMATCHING non-null string FAILS.
    await expect(passes(pattern, 'has space')).resolves.toBe(false);
    await expect(passes(pattern, 'bad/slash')).resolves.toBe(false);
    await expect(passes(pattern, 'bad\\backslash')).resolves.toBe(false);
    await expect(passes(pattern, 'bad#hash')).resolves.toBe(false);
    // `+` requires at least one character, so a blank string cannot match.
    await expect(passes(pattern, '')).resolves.toBe(false);

    // Matching strings pass, including every permitted punctuation mark of the character class.
    await expect(passes(pattern, 'PLAIN123')).resolves.toBe(true);
    await expect(passes(pattern, 'a-b_c.d|e:f~g^h')).resolves.toBe(true);

    // The no-flag end-anchor decision, asserted rather than described: an embedded newline followed by
    // an otherwise-valid line does NOT match, because `$` anchors the string and not the line.
    await expect(passes(pattern, 'GOOD\nbad space')).resolves.toBe(false);
    await expect(passes(pattern, 'bad space\nGOOD')).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 8 of 11 — `eq`: null FAILS, and the comparison follows the loose CFML truth table', async () => {
    // G6 — `validate_eq` at `:L385-L395` returns FALSE for a null at `:L386-L388` and otherwise
    // compares with CFML `==`, which coerces. It is one of only three evaluators that reject absence,
    // and the rejection is what makes the delete guards of `Sku.json:L3`/`:L12` and `Product.json:L12`
    // fail safe. Section D3 and D4 exercise the same truth table at the real document sites; this row
    // pins the evaluator itself.
    const eqFalse: Constraint<MatrixSubject> = { constraintType: 'eq', constraintValue: false };
    const eqOne: Constraint<MatrixSubject> = { constraintType: 'eq', constraintValue: 1 };
    const eqText: Constraint<MatrixSubject> = { constraintType: 'eq', constraintValue: 'active' };

    // NULL FAILS.
    await expect(passes(eqFalse, null)).resolves.toBe(false);
    await expect(passes(eqFalse, undefined)).resolves.toBe(false);
    await expect(passes(eqOne, null)).resolves.toBe(false);
    await expect(passes(eqText, null)).resolves.toBe(false);

    // Boolean-castable pairs compare AS BOOLEANS.
    await expect(passes(eqFalse, false)).resolves.toBe(true);
    await expect(passes(eqFalse, 'false')).resolves.toBe(true);
    await expect(passes(eqFalse, 'FALSE')).resolves.toBe(true);
    await expect(passes(eqFalse, 0)).resolves.toBe(true);
    await expect(passes(eqFalse, '0')).resolves.toBe(true);
    await expect(passes(eqFalse, 'no')).resolves.toBe(true);
    await expect(passes(eqFalse, true)).resolves.toBe(false);
    await expect(passes(eqFalse, 'yes')).resolves.toBe(false);
    await expect(passes(eqFalse, 1)).resolves.toBe(false);

    // Numeric pairs compare NUMERICALLY, so representation does not matter.
    await expect(passes(eqOne, 1)).resolves.toBe(true);
    await expect(passes(eqOne, '1')).resolves.toBe(true);
    await expect(passes(eqOne, '1.0')).resolves.toBe(true);
    await expect(passes(eqOne, 2)).resolves.toBe(false);

    // Everything else falls through to a CASE-INSENSITIVE string comparison.
    await expect(passes(eqText, 'active')).resolves.toBe(true);
    await expect(passes(eqText, 'ACTIVE')).resolves.toBe(true);
    await expect(passes(eqText, 'AcTiVe')).resolves.toBe(true);
    await expect(passes(eqText, 'inactive')).resolves.toBe(false);
    // Trailing space is NOT trimmed by the comparison — only `required` and `maxLength` trim.
    await expect(passes(eqText, 'active ')).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 9 of 11 — `inList`: null FAILS; matching is case-insensitive and whole-element', async () => {
    // G6 — `validate_inList` at `:L459-L465` returns FALSE for a null and otherwise uses
    // `listFindNoCase`, which splits on commas and compares WHOLE ELEMENTS case-insensitively. It is
    // NOT a substring test. The corpus declares this constraint twice, both at
    // `model/validation/Product.json:L4` and `:L5`, and section B9 exercises those real sites.
    const inList: Constraint<MatrixSubject> = {
      constraintType: 'inList',
      constraintValue: 'merchandise',
    };
    const multi: Constraint<MatrixSubject> = {
      constraintType: 'inList',
      constraintValue: 'merchandise,subscription,contentAccess',
    };

    // NULL FAILS — a product with no resolvable base product type cannot satisfy the gate.
    await expect(passes(inList, null)).resolves.toBe(false);
    await expect(passes(inList, undefined)).resolves.toBe(false);

    // CASE-INSENSITIVE whole-element matching.
    await expect(passes(inList, 'merchandise')).resolves.toBe(true);
    await expect(passes(inList, 'MERCHANDISE')).resolves.toBe(true);
    await expect(passes(inList, 'Merchandise')).resolves.toBe(true);
    await expect(passes(multi, 'contentaccess')).resolves.toBe(true);
    await expect(passes(multi, 'subscription')).resolves.toBe(true);

    // NOT A SUBSTRING TEST, in either direction. A value that merely contains a member fails, and a
    // value that is merely contained BY a member fails too.
    await expect(passes(inList, 'merchandises')).resolves.toBe(false);
    await expect(passes(inList, 'premerchandise')).resolves.toBe(false);
    await expect(passes(inList, 'merch')).resolves.toBe(false);
    await expect(passes(inList, '')).resolves.toBe(false);

    // A comma-bearing VALUE is not a way to satisfy a single-element list: the comparison is against
    // the whole value, so it matches no single element.
    await expect(passes(inList, 'x,merchandise')).resolves.toBe(false);
    await expect(passes(multi, 'merchandise,subscription')).resolves.toBe(false);
  });

  it('NET-NEW — matrix row 10 of 11 — `method`: the bound method is called with ZERO arguments and its result is coerced', async () => {
    // G6 — `validate_method` at `:L333-L335` is `invokeMethod(constraintValue)` with NO argument
    // collection, so the bound method receives NOTHING and must derive everything it needs from the
    // subject it lives on. The port replaces the legacy STRING-KEYED DISPATCH — a method name looked up
    // by name at runtime — with a typed `invoke` callback on the constraint itself, so the binding is
    // compile-checked; what is preserved is the zero-argument call and the boolean coercion of the
    // result. Section F exercises the two real method rules of `model/validation/Sku.json:L6-L7`.
    /** Reaches the subject's own method, so the arguments it receives can be observed. */
    const boundToSubject: Constraint<MatrixSubject> = {
      constraintType: 'method',
      constraintValue: 'probe',
      invoke: (subject) => subject.probe(),
    };
    /** Returns a fixed result, so the coercion table can express `undefined` unambiguously. */
    const resolvingTo = (result: unknown): Constraint<MatrixSubject> => ({
      constraintType: 'method',
      constraintValue: 'probe',
      invoke: () => result,
    });

    // ZERO ARGUMENTS. The recorded call log holds exactly one entry, and that entry is EMPTY.
    const calls: unknown[][] = [];
    await evaluate(boundToSubject, {
      value: 'irrelevant',
      methodResult: true,
      methodCalls: calls,
    });
    expect(calls).toStrictEqual([[]]);
    expect(calls).toHaveLength(1);
    expect(first(calls)).toStrictEqual([]);

    // The method's verdict, NOT the property value, decides the outcome — the property value is never
    // read on this path, which is why row 10 has no null-semantics row of its own.
    const failingCalls: unknown[][] = [];
    await expect(
      evaluate(boundToSubject, {
        value: 'a perfectly good value',
        methodResult: false,
        methodCalls: failingCalls,
      }),
    ).resolves.toBe(false);
    expect(failingCalls).toStrictEqual([[]]);

    // The RESULT IS COERCED to a boolean with CFML rules, so a method may legally answer with a
    // boolean, a number or a boolean-castable string and all behave alike.
    for (const truthy of [true, 1, '1', 'yes', 'true', 'YES', 'TRUE', ' 1 ', 2, -1]) {
      await expect(evaluate(resolvingTo(truthy), { value: 'v' })).resolves.toBe(true);
    }
    for (const falsy of [false, 0, '0', 'no', 'false', 'NO', 'FALSE', ' 0 ']) {
      await expect(evaluate(resolvingTo(falsy), { value: 'v' })).resolves.toBe(false);
    }

    // A result that is NOT boolean-castable is a programming error, not a validation failure, and the
    // engine RAISES rather than guessing a direction. Guessing would either block every save or
    // silently disable the rule, and both failure modes would be invisible.
    for (const uncoercible of [null, undefined, {}, [], 'maybe', '', Number.NaN, Infinity]) {
      await expect(evaluate(resolvingTo(uncoercible), { value: 'v' })).rejects.toBeInstanceOf(
        TypeError,
      );
    }

    // A method rule may be asynchronous: the engine awaits the result before coercing it, which is
    // what lets `model/validation/Sku.json:L6`'s `hasUniqueOptions` perform a real lookup (section F).
    await expect(evaluate(resolvingTo(Promise.resolve(true)), { value: 'v' })).resolves.toBe(true);
    await expect(evaluate(resolvingTo(Promise.resolve(false)), { value: 'v' })).resolves.toBe(
      false,
    );
  });

  it('NET-NEW — matrix row 11 of 11 — `unique`: delegates to the injected port, and `true` means SAFE', async () => {
    // G6 — `validate_unique` at `:L467-L470` returns the DAO verdict UNMODIFIED, and the DAO in
    // question is `isUniqueProperty` at `org/Hibachi/HibachiDAO.cfc:L130-L147`, which answers FALSE
    // when a conflicting row exists (`:L142-L144`) and TRUE when none does (`:L146`). The polarity is
    // therefore `true = unique = safe to save`, and inverting it would let every colliding save
    // through while rejecting every clean one. Section A2 asserts all seven real sites delegate this
    // way; section G asserts the SQL the adapter emits.
    const uniqueConstraint: Constraint<MatrixSubject> = {
      constraintType: 'unique',
      constraintValue: true,
      uniqueTarget: (subject) => subject,
    };

    // NO conflicting row seeded: the port answers true and the constraint PASSES.
    const clean = createValidatorHarness();
    const cleanErrors = await clean.validateDryRun(
      matrixSubject({ value: 'free-value' }),
      matrixRuleSet(uniqueConstraint),
      'save',
    );
    expect(cleanErrors.hasError(MATRIX_PROPERTY)).toBe(false);
    // Delegation is real, not short-circuited: the port WAS consulted, with the full five-field call.
    expect(clean.uniqueProperty.calls).toStrictEqual([
      {
        propertyName: MATRIX_PROPERTY,
        resolvedPropertyName: MATRIX_PROPERTY,
        entityName: MATRIX_ENTITY_NAME,
        entityID: 'matrix-id',
        value: 'free-value',
      },
    ]);

    // A conflicting row on a DIFFERENT primary key: the port answers false and the constraint FAILS.
    const colliding = createValidatorHarness([
      {
        entityName: MATRIX_ENTITY_NAME,
        propertyName: MATRIX_PROPERTY,
        value: 'taken-value',
        entityID: 'some-other-row',
      },
    ]);
    const collidingErrors = await colliding.validateDryRun(
      matrixSubject({ value: 'taken-value' }),
      matrixRuleSet(uniqueConstraint),
      'save',
    );
    expect(collidingErrors.getError(MATRIX_PROPERTY)).toStrictEqual([
      'validate.save.MatrixSubject.value.unique',
    ]);

    // The SAME primary key holding the same value is SELF, not a conflict — the self-exclusion clause
    // of `:L140` at work, which is what lets an unchanged row be re-saved.
    const self = createValidatorHarness([
      {
        entityName: MATRIX_ENTITY_NAME,
        propertyName: MATRIX_PROPERTY,
        value: 'taken-value',
        entityID: 'matrix-id',
      },
    ]);
    const selfErrors = await self.validateDryRun(
      matrixSubject({ value: 'taken-value', primaryIDValue: 'matrix-id' }),
      matrixRuleSet(uniqueConstraint),
      'save',
    );
    expect(selfErrors.hasError(MATRIX_PROPERTY)).toBe(false);
  });

  it('NET-NEW — the matrix is complete: exactly eleven constraint kinds, and absence splits nine-to-two-plus-one', async () => {
    // A guard against the matrix silently falling out of step with the engine. If a twelfth kind were
    // ever added to the `Constraint` union, this roll-call would still pass — so it is paired with the
    // corpus census of section A, which asserts the DOCUMENTS declare no fourteenth key. Together the
    // two bracket the supported surface from both directions.
    const nullPasses: readonly Constraint<MatrixSubject>[] = [
      { constraintType: 'dataType', constraintValue: 'numeric' },
      { constraintType: 'dataType', constraintValue: 'url' },
      { constraintType: 'minValue', constraintValue: 0 },
      { constraintType: 'maxLength', constraintValue: 0 },
      { constraintType: 'minCollection', constraintValue: 1 },
      { constraintType: 'maxCollection', constraintValue: 0 },
      { constraintType: 'regex', constraintValue: CODE_FORMAT_REGEX },
    ];
    for (const constraint of nullPasses) {
      await expect(passes(constraint, null)).resolves.toBe(true);
      await expect(passes(constraint, undefined)).resolves.toBe(true);
    }

    const nullFails: readonly Constraint<MatrixSubject>[] = [
      { constraintType: 'required', constraintValue: true },
      { constraintType: 'eq', constraintValue: false },
      { constraintType: 'inList', constraintValue: 'merchandise' },
    ];
    for (const constraint of nullFails) {
      await expect(passes(constraint, null)).resolves.toBe(false);
      await expect(passes(constraint, undefined)).resolves.toBe(false);
    }

    // The remaining two kinds — `method` and `unique` — do not consult the property value at all, so
    // absence has no meaning for them. `method` derives its verdict from the subject (row 10) and
    // `unique` from the injected port (row 11). Eleven kinds in total across the three groups.
    const kinds = new Set([
      ...nullPasses.map((constraint) => constraint.constraintType),
      ...nullFails.map((constraint) => constraint.constraintType),
      'method',
      'unique',
    ]);
    expect([...kinds].sort()).toStrictEqual([
      'dataType',
      'eq',
      'inList',
      'maxCollection',
      'maxLength',
      'method',
      'minCollection',
      'minValue',
      'regex',
      'required',
      'unique',
    ]);
    expect(kinds.size).toBe(11);
  });
});

/* ================================================================================================
 * SECTION F — THE TWO SKU METHOD RULES, D19, AND M6 TRANSACTION VISIBILITY
 * ==============================================================================================
 *
 * `model/validation/Sku.json:L5-L8` registers the ONLY two method-based rules in the whole corpus,
 * and they are the reason IR-4 insists declarative validation is behaviour rather than configuration:
 * one of them executes a DATABASE QUERY from inside a validation pass.
 *
 *   [:6]  options  save  method  hasUniqueOptions            -> asynchronous, performs a real lookup
 *   [:7]  options  save  method  hasOneOptionPerOptionGroup  -> pure, in-memory, synchronous
 *
 * Both are exercised through the `Validator` at their real document site, and the domain methods are
 * additionally called directly where a claim is about the method's own algorithm rather than about
 * the engine's dispatch. Nothing is resolved by string, and no module is mocked.
 * ---------------------------------------------------------------------------------------------- */

/** Records the raw comma-delimited string the domain method hands the lookup, then delegates. */
interface RecordingLookup {
  readonly selectedOptionsArguments: readonly string[];
  readonly argumentCounts: readonly number[];
  getSkusBySelectedOptions(...args: readonly [string]): Promise<readonly Sku[]>;
}

function recordingLookup(delegate: SkusBySelectedOptionsLookup): RecordingLookup {
  const selectedOptionsArguments: string[] = [];
  const argumentCounts: number[] = [];
  return {
    selectedOptionsArguments,
    argumentCounts,
    getSkusBySelectedOptions: (...args: readonly [string]): Promise<readonly Sku[]> => {
      argumentCounts.push(args.length);
      const [selectedOptions] = args;
      selectedOptionsArguments.push(selectedOptions);
      return delegate.getSkusBySelectedOptions(selectedOptions);
    },
  };
}

/**
 * A product plus a SKU repository scoped to it, with a recording lookup in front.
 *
 * `createSkusBySelectedOptionsLookup(repository, productId)` CLOSES OVER the product identifier,
 * which is the structural evidence for the claim below that the domain method supplies no product
 * argument of its own.
 */
function optionResolutionFixture(productID: string): {
  readonly product: Product;
  readonly repository: ReturnType<typeof createInMemorySkuRepository>;
  readonly lookup: RecordingLookup;
} {
  const product = buildProduct({ productID, productCode: 'OPTRES', productName: 'Option Res' });
  const repository = createInMemorySkuRepository({});
  const lookup = recordingLookup(
    createSkusBySelectedOptionsLookup(repository.repository, productID),
  );
  return { product, repository, lookup };
}

describe('NET-NEW — F1. `hasUniqueOptions` — the selected-options string it builds', () => {
  // @hint this method validates that this skus has a unique option combination that no other sku has
  //
  // ^ The line above is the source annotation from `model/entity/Sku.cfc:L755`, reproduced BYTE FOR
  // BYTE including its grammatical errors ("this skus has"). It is preserved rather than corrected
  // because the copy of it at `:L771` is what identifies the second method rule's hint as a
  // copy-paste artifact (section F4), and silently repairing the grammar here would erase the only
  // evidence that the two hints are the same text.

  it('NET-NEW — option identifiers are appended IN EXISTING OPTION ORDER into one comma-delimited string', async () => {
    // `model/entity/Sku.cfc:L757-L761` opens `var optionsList = ""`, iterates `getOptions()` and
    // appends `getOptionID()` with `listAppend`. There is no sort, no de-duplication and no
    // normalisation, so the string mirrors the collection's own order exactly — and order matters,
    // because T1 emits one `EXISTS` clause per element in that order (AAP §0.6.1.3).
    const { product, lookup } = optionResolutionFixture('order-product');
    const groupOne = buildOptionGroup({ optionGroupID: 'group-one' });
    const groupTwo = buildOptionGroup({ optionGroupID: 'group-two' });
    const groupThree = buildOptionGroup({ optionGroupID: 'group-three' });

    const sku = buildSku({
      skuID: 'order-sku',
      skuCode: 'ORDER',
      product,
      // Deliberately NOT in alphabetical order, so a hidden sort would be visible.
      options: [
        buildOption({ optionID: 'zeta', optionGroup: groupThree }),
        buildOption({ optionID: 'alpha', optionGroup: groupOne }),
        buildOption({ optionID: 'mid', optionGroup: groupTwo }),
      ],
    });

    await sku.hasUniqueOptions(lookup);

    expect(lookup.selectedOptionsArguments).toStrictEqual(['zeta,alpha,mid']);
  });

  it('NET-NEW — a SKU with ZERO options produces EXACTLY the empty string, never a null and never a placeholder', async () => {
    // T5 (AAP §0.6.1.3) — an empty selection is a LEGAL, MEANINGFUL input. `listLen("")` is zero in
    // CFML, so no `EXISTS` clause is appended and the query legitimately degenerates to "every
    // option-bearing SKU of this product". Section F2 is the consequence.
    const { product, lookup } = optionResolutionFixture('empty-product');
    const sku = buildSku({ skuID: 'empty-sku', skuCode: 'EMPTY', product, options: [] });

    await sku.hasUniqueOptions(lookup);

    expect(lookup.selectedOptionsArguments).toStrictEqual(['']);
    expect(first(lookup.selectedOptionsArguments)).toBe('');
    expect(first(lookup.selectedOptionsArguments)).not.toBeNull();
  });

  it('NET-NEW — a single option produces a bare identifier with NO leading or trailing delimiter', async () => {
    const { product, lookup } = optionResolutionFixture('single-product');
    const sku = buildSku({
      skuID: 'single-sku',
      skuCode: 'SINGLE',
      product,
      options: [
        buildOption({ optionID: 'solo', optionGroup: buildOptionGroup({ optionGroupID: 'g' }) }),
      ],
    });

    await sku.hasUniqueOptions(lookup);

    expect(lookup.selectedOptionsArguments).toStrictEqual(['solo']);
  });

  it('NET-NEW — the lookup is called with ONE argument: the method supplies NO productID of its own', async () => {
    // AAP §0.6.1.1 — the legacy chain is
    // `Sku.hasUniqueOptions()` -> `Product.getSkusBySelectedOptions(selectedOptions=optionsList)` at
    // `model/entity/Sku.cfc:L763` -> `ProductService.getProductSkusBySelectedOptions(...)` ->
    // `SkuDAO.getSkusBySelectedOptions(...)`. The SKU passes ONLY the options list; the product
    // identifier is contributed by the PRODUCT it is walking through, at
    // `model/entity/Product.cfc:L367`, where `this.getProductID()` is supplied positionally.
    //
    // The port keeps that division of knowledge: `SkusBySelectedOptionsLookup` declares a
    // ONE-PARAMETER member, and `createSkusBySelectedOptionsLookup(repository, productId)` closes over
    // the identifier at wiring time. Two independent facts prove it — the recorded ARITY of every call,
    // and the fact that the repository nonetheless receives the correct product scope.
    const { product, repository, lookup } = optionResolutionFixture('scope-product');
    const sku = buildSku({
      skuID: 'scope-sku',
      skuCode: 'SCOPE',
      product,
      options: [
        buildOption({ optionID: 'opt-a', optionGroup: buildOptionGroup({ optionGroupID: 'ga' }) }),
        buildOption({ optionID: 'opt-b', optionGroup: buildOptionGroup({ optionGroupID: 'gb' }) }),
      ],
    });

    await sku.hasUniqueOptions(lookup);

    // ONE argument reached the lookup, and it was the options list.
    expect(lookup.argumentCounts).toStrictEqual([1]);
    expect(lookup.selectedOptionsArguments).toStrictEqual(['opt-a,opt-b']);

    // T2 (AAP §0.6.1.3) — the product scope IS applied, and it came from the closure rather than from
    // the method call. The recorded repository call carries both the split option list and the product.
    expect(repository.calls).toStrictEqual([
      {
        member: 'findSkusBySelectedOptions',
        optionIds: ['opt-a', 'opt-b'],
        productId: 'scope-product',
      },
    ]);
  });
});

describe('NET-NEW — F2. `hasUniqueOptions` — candidate polarity and APPLICATION-SIDE self-exclusion', () => {
  /** Builds a SKU on the fixture product with the given options, and registers it in the repository. */
  function registeredSku(
    fixture: ReturnType<typeof optionResolutionFixture>,
    skuID: string,
    optionIDs: readonly string[],
  ): Sku {
    const sku = buildSku({
      skuID,
      skuCode: skuID.toUpperCase(),
      product: fixture.product,
      options: optionIDs.map((optionID) =>
        buildOption({
          optionID,
          optionGroup: buildOptionGroup({ optionGroupID: `group-${optionID}` }),
        }),
      ),
    });
    fixture.repository.add(sku);
    return sku;
  }

  it('NET-NEW — ZERO candidate SKUs PASSES', async () => {
    // `model/entity/Sku.cfc:L764` — `!arrayLen(skus)` is the first of the two passing conditions.
    const fixture = optionResolutionFixture('zero-product');
    const candidate = buildSku({
      skuID: 'lonely-sku',
      skuCode: 'LONELY',
      product: fixture.product,
      options: [
        buildOption({ optionID: 'only', optionGroup: buildOptionGroup({ optionGroupID: 'g' }) }),
      ],
    });

    await expect(candidate.hasUniqueOptions(fixture.lookup)).resolves.toBe(true);
  });

  it('NET-NEW — EXACTLY ONE candidate whose skuID is THIS sku PASSES by application-side self-exclusion', async () => {
    // `:L764` — `arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()`. CFML arrays are 1-based, so
    // the legacy `skus[1]` is the port's `skus[0]`. This is what lets an already-saved SKU be re-saved
    // without tripping its own uniqueness rule.
    const fixture = optionResolutionFixture('self-product');
    const sku = registeredSku(fixture, 'self-sku', ['opt-x']);

    await expect(sku.hasUniqueOptions(fixture.lookup)).resolves.toBe(true);
  });

  it('NET-NEW — a candidate with a DIFFERENT skuID FAILS', async () => {
    // `:L768` — the fall-through. A different row already owns this exact option combination.
    const fixture = optionResolutionFixture('collide-product');
    registeredSku(fixture, 'incumbent-sku', ['opt-x']);
    const challenger = buildSku({
      skuID: 'challenger-sku',
      skuCode: 'CHALLENGER',
      product: fixture.product,
      options: [
        buildOption({ optionID: 'opt-x', optionGroup: buildOptionGroup({ optionGroupID: 'gx' }) }),
      ],
    });

    await expect(challenger.hasUniqueOptions(fixture.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — TWO candidates FAIL even when one of them is THIS sku: the self-exclusion is arity-one only', async () => {
    // `:L764` guards self-exclusion behind `arrayLen(skus) == 1`. With two rows returned, the
    // conjunction is false regardless of which row is self, so the method fails. A port that filtered
    // self out of the result BEFORE counting would pass here and diverge.
    const fixture = optionResolutionFixture('pair-product');
    const mine = registeredSku(fixture, 'mine-sku', ['shared']);
    registeredSku(fixture, 'theirs-sku', ['shared']);

    await expect(mine.hasUniqueOptions(fixture.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — self-exclusion is APPLICATION code, not SQL: the query returns self and the method decides', async () => {
    // AAP §0.6.1.4 and §0.3.3.1 — the translated statement carries the conjunctive `EXISTS` clauses,
    // the option-bearing guard and the product predicate, and NOTHING ELSE. There is no
    // `AND s.skuID != ?` in it. That is deliberate: the legacy HQL at
    // `model/dao/SkuDAO.cfc:L107-L128` has no such clause either, and the current-SKU decision is made
    // in the entity at `model/entity/Sku.cfc:L764`.
    //
    // This is asserted from BOTH sides. The repository DID return the current SKU as a candidate, and
    // the method nonetheless answered true — so the exclusion demonstrably happened above the query.
    const fixture = optionResolutionFixture('layer-product');
    const sku = registeredSku(fixture, 'layer-sku', ['opt-y']);

    const candidates = await fixture.lookup.getSkusBySelectedOptions('opt-y');
    expect(candidates.map((candidate) => candidate.skuID)).toStrictEqual(['layer-sku']);

    await expect(sku.hasUniqueOptions(fixture.lookup)).resolves.toBe(true);

    // The recorded repository calls carry no exclusion parameter of any kind — only the option list
    // and the product. Section G asserts the emitted SQL text itself.
    for (const call of fixture.repository.calls) {
      if (call.member === 'findSkusBySelectedOptions') {
        expect(Object.keys(call).sort()).toStrictEqual(['member', 'optionIds', 'productId']);
      }
    }
  });

  it('NET-NEW — at INSERT time the skuID is unset, so no candidate can be self-excluded', async () => {
    // An unsaved SKU reports `SKU_UNSAVED_ID_VALUE`. With no candidates it still passes, but a single
    // candidate CANNOT be self — a saved row's identifier can never equal the unsaved sentinel — so the
    // combination is correctly rejected. This is the same observation the port records for
    // `UniquePropertyChecker`: the self-exclusion clause is a NO-OP on insert (section G).
    const cleanFixture = optionResolutionFixture('insert-clean-product');
    const unsavedClean = buildSku({
      skuCode: 'UNSAVED',
      product: cleanFixture.product,
      options: [
        buildOption({ optionID: 'opt-z', optionGroup: buildOptionGroup({ optionGroupID: 'gz' }) }),
      ],
    });
    expect(unsavedClean.skuID).toBe(SKU_UNSAVED_ID_VALUE);
    await expect(unsavedClean.hasUniqueOptions(cleanFixture.lookup)).resolves.toBe(true);

    const takenFixture = optionResolutionFixture('insert-taken-product');
    registeredSku(takenFixture, 'incumbent-sku', ['opt-z']);
    const unsavedTaken = buildSku({
      skuCode: 'UNSAVED2',
      product: takenFixture.product,
      options: [
        buildOption({ optionID: 'opt-z', optionGroup: buildOptionGroup({ optionGroupID: 'gz' }) }),
      ],
    });
    await expect(unsavedTaken.hasUniqueOptions(takenFixture.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — the identifier comparison is CASE-SENSITIVE in the target, and the divergence is carried not repaired', async () => {
    // G6 — A DELIBERATE, DOCUMENTED DIVERGENCE. The legacy comparison at
    // `model/entity/Sku.cfc:L764` is CFML `==` on two strings, which is CASE-INSENSITIVE, so a legacy
    // engine would have self-excluded a row whose identifier differed from this SKU's only by letter
    // case. The port compares with TypeScript `===`, which is case-sensitive.
    //
    // The divergence is unreachable for every value that can actually occur: primary keys in this
    // schema are 32-character lowercase hexadecimal UUIDs generated by
    // `model/dao/HibachiDAO.cfc`'s `createSlatwallUUID()` (AAP IR-6), so two identifiers can never
    // differ by case alone. Every other test in this file therefore uses canonical lowercase
    // identifiers; this one case deliberately does not, purely to pin the divergence so it is a
    // recorded decision rather than an accident waiting to be "tidied up".
    const fixture = optionResolutionFixture('case-product');
    const incumbent = registeredSku(fixture, 'abcdef', ['opt-c']);
    expect(incumbent.skuID).toBe('abcdef');

    const differingByCaseOnly = buildSku({
      skuID: 'ABCDEF',
      skuCode: 'CASE',
      product: fixture.product,
      options: [
        buildOption({ optionID: 'opt-c', optionGroup: buildOptionGroup({ optionGroupID: 'gc' }) }),
      ],
    });

    // Legacy `==` would have judged these the same row and PASSED. The port judges them distinct and
    // FAILS. Both halves are asserted so the divergence cannot be mistaken for a coincidence.
    const incumbentID: string = incumbent.skuID;
    const challengerID: string = differingByCaseOnly.skuID;
    expect(challengerID.toLowerCase() === incumbentID.toLowerCase()).toBe(true);
    expect(challengerID === incumbentID).toBe(false);
    await expect(differingByCaseOnly.hasUniqueOptions(fixture.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — the rule reaches the same verdict through the Validator at its real document site `Sku.json:L6`', async () => {
    // Everything above calls the domain method directly, because the claims are about the method's own
    // algorithm. This case closes the loop: the rule is REGISTERED, the engine dispatches to it, and a
    // failure lands in the bag under the `options` key with the method message template.
    const fixture = optionResolutionFixture('registered-product');
    const incumbent = buildSku({
      skuID: 'registered-incumbent',
      skuCode: 'INC',
      product: fixture.product,
      options: [
        buildOption({ optionID: 'opt-r', optionGroup: buildOptionGroup({ optionGroupID: 'gr' }) }),
      ],
    });
    fixture.repository.add(incumbent);

    const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>(
      'registered-product',
    );
    const harness = createValidatorHarness();
    const colliding: SkuValidationSubject & UniquePropertyEntity = {
      ...uniqueEntityAccessors('SlatwallSku', 'skuID', 'registered-challenger', {}),
      getClassName: () => 'Sku',
      hasProperty: (identifier: string) => identifier === 'options',
      hasUniqueOptions: () => Promise.resolve(false),
      hasOneOptionPerOptionGroup: () => true,
      options: [],
    };

    const errors = await harness.validateDryRun(colliding, ruleSet, 'save');
    expect(errors.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
    ]);
  });
});

describe('NET-NEW — F3. D19 — an option-less SKU fails uniqueness beside option-bearing siblings', () => {
  it('NET-NEW — TODO(parity) D19 — an option-less SKU FAILS when its product already has option-bearing SKUs', async () => {
    // TODO(parity) D19
    //
    // AAP §0.6.2 and §0.6.7.4 record this as defect D19, and it is CARRIED, NOT REPAIRED.
    //
    // The mechanism, end to end. An option-less SKU builds `optionsList = ''` at
    // `model/entity/Sku.cfc:L757-L761` (section F1 asserts exactly that). By T5 the selected-options
    // query then appends ZERO `EXISTS` clauses, so it degenerates to "every option-bearing SKU of this
    // product" — the option-bearing guard of T3 being the only surviving predicate besides the product
    // scope. The guard at `:L764` can then only pass when that degenerate result is empty or is
    // exactly this SKU, and an option-less SKU can never BE one of the option-bearing rows. So an
    // option-less default SKU on a product that already carries option-bearing SKUs FAILS its own
    // uniqueness rule and cannot be saved.
    //
    // Three repairs suggest themselves and all three are FORBIDDEN here: an early return when the
    // options collection is empty, an exception for the product's default SKU, and filtering the
    // degenerate result down to option-less rows. Each would make the port accept a save the legacy
    // system rejects, which is precisely the kind of silent behavioural drift behaviour preservation
    // exists to prevent (AAP Guideline 4).
    const fixture = optionResolutionFixture('d19-product');
    const optionBearingSibling = buildSku({
      skuID: 'd19-sibling',
      skuCode: 'D19SIB',
      product: fixture.product,
      options: [
        buildOption({
          optionID: 'opt-d19',
          optionGroup: buildOptionGroup({ optionGroupID: 'gd' }),
        }),
      ],
    });
    fixture.repository.add(optionBearingSibling);

    const optionLess = buildSku({
      skuID: 'd19-default',
      skuCode: 'D19DEF',
      product: fixture.product,
      options: [],
    });

    // The degenerate query really does return the option-bearing sibling for an EMPTY selection.
    const degenerate = await fixture.lookup.getSkusBySelectedOptions('');
    expect(degenerate.map((candidate) => candidate.skuID)).toStrictEqual(['d19-sibling']);

    // And so the option-less SKU fails. This is the defect, asserted as behaviour.
    await expect(optionLess.hasUniqueOptions(fixture.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — D19 — the SAME option-less SKU PASSES when the product has NO option-bearing SKUs', async () => {
    // The other side of the defect, which is what makes it a defect rather than a rule: the verdict on
    // an option-less SKU depends entirely on whether OTHER, unrelated SKUs exist. The T3 option-bearing
    // guard is what makes the degenerate result empty here.
    const fixture = optionResolutionFixture('d19-clean-product');
    const anotherOptionLess = buildSku({
      skuID: 'd19-other-default',
      skuCode: 'D19OTH',
      product: fixture.product,
      options: [],
    });
    fixture.repository.add(anotherOptionLess);

    const optionLess = buildSku({
      skuID: 'd19-clean-default',
      skuCode: 'D19CLN',
      product: fixture.product,
      options: [],
    });

    // T3 — the option-bearing guard excludes the registered option-less SKU from the result, so the
    // degenerate query returns nothing at all even though a sibling row exists.
    const degenerate = await fixture.lookup.getSkusBySelectedOptions('');
    expect(degenerate).toStrictEqual([]);

    await expect(optionLess.hasUniqueOptions(fixture.lookup)).resolves.toBe(true);
  });
});

describe('NET-NEW — F4. M6 — an in-flight sibling insert must be visible to the next validation', () => {
  it('NET-NEW — M6 — a SKU inserted inside the transaction IS observed by the following uniqueness read', async () => {
    // M6 — THE DECISION, RECORDED. AAP §0.6.2 names this the highest-risk item in the slice, because a
    // faithful-LOOKING port produces different results with no error and no compile failure.
    //
    // Under CFML and Hibernate, `hasUniqueOptions` observed sibling SKUs already visible to the ORM
    // SESSION, so `SkuService.createSkus` generating a combination batch had each new SKU validated
    // against the ones the same operation had just created. Under TypeScript with `mysql2` there is NO
    // session and NO automatic flush. A port that inserted every combination and then validated, or
    // that validated everything up front against a prefetched snapshot, would silently disagree with
    // the legacy system.
    //
    // The decision: `UnitOfWork` must make each insert visible to the next read WITHIN THE SAME
    // TRANSACTION. What is asserted here is the visibility property itself. The full combination-batch
    // test — the one that fails under either naive ordering — is jointly owned by
    // `test/services/SkuService.test.ts`, which owns the enumeration order that decides which sibling
    // is written when; this file neither imports nor edits that sibling test and does not attempt to
    // solve the whole service-ordering concern here.
    const unitOfWork = createUnitOfWorkDouble();
    const fixture = optionResolutionFixture('m6-product');
    const combination = ['opt-m6'];
    const buildCombinationSku = (skuID: string): Sku =>
      buildSku({
        skuID,
        skuCode: skuID.toUpperCase(),
        product: fixture.product,
        options: combination.map((optionID) =>
          buildOption({
            optionID,
            optionGroup: buildOptionGroup({ optionGroupID: 'gm6' }),
          }),
        ),
      });

    const firstSku = buildCombinationSku('m6-first');
    const secondSku = buildCombinationSku('m6-second');
    const observed: boolean[] = [];

    await unitOfWork.unitOfWork.run(
      async () => {
        // The FIRST SKU validates against an empty product and passes.
        observed.push(await firstSku.hasUniqueOptions(fixture.lookup));

        // It is then inserted INSIDE the same transaction.
        fixture.repository.add(firstSku);

        // The SECOND SKU, carrying the same combination, must now SEE the first one and fail. If the
        // insert were invisible until commit, this would wrongly pass and the batch would produce two
        // identical combinations.
        observed.push(await secondSku.hasUniqueOptions(fixture.lookup));
        return undefined;
      },
      () => false,
    );

    expect(observed).toStrictEqual([true, false]);

    // The transaction really was opened and committed around both reads, in the expected order.
    expect(unitOfWork.eventKinds()).toStrictEqual(['acquire', 'begin', 'commit', 'release']);
    expect(unitOfWork.transactionsStarted()).toBe(1);
    expect(unitOfWork.transactionsCommitted()).toBe(1);
    expect(unitOfWork.transactionsRolledBack()).toBe(0);
  });

  it('NET-NEW — M6 — there is NO snapshot and NO cache: reads before and after the insert differ', async () => {
    // The negative half of the same decision. Two lookups with identical arguments must return
    // DIFFERENT results across an intervening insert. A memoised or prefetched result would make them
    // agree, and every SKU in a combination batch would then be validated against stale state.
    const fixture = optionResolutionFixture('m6-nocache-product');
    const sibling = buildSku({
      skuID: 'm6-sibling',
      skuCode: 'M6SIB',
      product: fixture.product,
      options: [
        buildOption({
          optionID: 'opt-nc',
          optionGroup: buildOptionGroup({ optionGroupID: 'gnc' }),
        }),
      ],
    });

    const before = await fixture.lookup.getSkusBySelectedOptions('opt-nc');
    expect(before).toStrictEqual([]);

    fixture.repository.add(sibling);

    const after = await fixture.lookup.getSkusBySelectedOptions('opt-nc');
    expect(after.map((candidate) => candidate.skuID)).toStrictEqual(['m6-sibling']);

    // Both reads reached the repository — neither was served from anything.
    const finderCalls = fixture.repository.calls.filter(
      (call) => call.member === 'findSkusBySelectedOptions',
    );
    expect(finderCalls).toHaveLength(2);
  });

  it('NET-NEW — M6 — a rolled-back transaction is still exercised through the real UnitOfWork contract', async () => {
    // The commit gate is the legacy `getORMHasErrors()` test (AAP §0.6.6 M5) made explicit: work that
    // reports errors must ROLL BACK rather than commit. Asserting both directions keeps the visibility
    // claim above from resting on a transaction shape that only ever commits.
    const unitOfWork = createUnitOfWorkDouble();
    const fixture = optionResolutionFixture('m6-rollback-product');
    const sku = buildSku({
      skuID: 'm6-rollback-sku',
      skuCode: 'M6RB',
      product: fixture.product,
      options: [
        buildOption({
          optionID: 'opt-rb',
          optionGroup: buildOptionGroup({ optionGroupID: 'grb' }),
        }),
      ],
    });

    // The verdict is computed inside the boundary and captured, because the boundary itself RAISES on
    // rollback rather than returning — the work must not appear to have succeeded when nothing was kept.
    let verdict: boolean | undefined;
    await expect(
      unitOfWork.unitOfWork.run(
        async () => {
          verdict = await sku.hasUniqueOptions(fixture.lookup);
          return verdict;
        },
        () => true,
      ),
    ).rejects.toThrow(/rolled back/);

    expect(verdict).toBe(true);
    expect(unitOfWork.eventKinds()).toStrictEqual(['acquire', 'begin', 'rollback', 'release']);
    expect(unitOfWork.transactionsCommitted()).toBe(0);
    expect(unitOfWork.transactionsRolledBack()).toBe(1);
  });
});

describe('NET-NEW — F5. `hasOneOptionPerOptionGroup` — the pure in-memory duplicate-group rule', () => {
  // @hint this method validates that this skus has a unique option combination that no other sku has
  //
  // ^ S7 — PRESERVED, NOT REPAIRED, AND DELIBERATELY UNNUMBERED. The line above is the annotation
  // above `hasOneOptionPerOptionGroup` at `model/entity/Sku.cfc:L771`, and it is BYTE-IDENTICAL to the
  // one above `hasUniqueOptions` at `:L755` (reproduced in section F1). It is a COPY-PASTE ERROR: this
  // method has nothing to do with other SKUs and performs no lookup at all — it checks that this one
  // SKU carries at most one option per option group. The hint is carried across verbatim, wrong text
  // and wrong grammar included, and it is recorded as an unnumbered annotation rather than assigned a
  // D-number.
  //
  // THE REASON IS LOCAL, AND IS DELIBERATELY NOT A CLAIM ABOUT THE REGISTER'S BOUND: nothing in this
  // file mints a defect or mismatch identifier, so this hint receives no additional number here. The
  // register is stated canonically, and only once, in the header of
  // `src/ports/repositories/SkuRepository.ts` (AAP §0.6.7's frozen source range D1-D21, plus the source
  // extension the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] and the three contract BOTH FROZEN AT THE AAP's OWN BOUNDS — AAP 0.6.7's D1-D21 and AAP 0.6.6's M1-M8. Nothing in this port mints an identifier beyond either range; a further source observation is recorded by its `path:Lnnn` locator instead).
  //
  // ⛔ AN EARLIER REVISION OF THIS COMMENT READ "AAP §0.6.7 fixes the register at D1-D21 and inventing a
  // the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] would corrupt it", and it was wrong in both halves. the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] EXISTS — it is the naming-convention
  // defect minted in that same header, where `model/dao/SkuDAO.cfc` mixes logical entity names with
  // physical table names — so the number this comment warned against inventing had already been
  // assigned. And the FROZEN range AAP §0.6.7 fixes is not the LIVE bound: the live one moves whenever
  // an entry is minted, which is why citing the frozen range as a ceiling is a category error rather
  // than merely out of date. That header records earlier instances of exactly this drift, which is why
  // no file but that one may state the live bound and why this comment now makes only a local claim.

  /** A SKU whose options are described as `[optionID, optionGroupID]` pairs. */
  function skuWithGroups(pairs: readonly (readonly [string, string])[]): Sku {
    return buildSku({
      skuID: 'group-rule-sku',
      skuCode: 'GRPRULE',
      options: pairs.map(([optionID, optionGroupID]) =>
        buildOption({ optionID, optionGroup: buildOptionGroup({ optionGroupID }) }),
      ),
    });
  }

  it('NET-NEW — ZERO options returns TRUE', () => {
    // `model/entity/Sku.cfc:L772-L784` — the loop never runs and `:L783` returns true. Note this is the
    // exact input for which `hasUniqueOptions` may FAIL (section F3, D19): the two registered rules
    // disagree about an option-less SKU, and both verdicts are carried.
    expect(skuWithGroups([]).hasOneOptionPerOptionGroup()).toBe(true);
  });

  it('NET-NEW — ONE option returns TRUE', () => {
    expect(skuWithGroups([['opt-a', 'group-a']]).hasOneOptionPerOptionGroup()).toBe(true);
  });

  it('NET-NEW — several options in DISTINCT groups return TRUE', () => {
    expect(
      skuWithGroups([
        ['opt-a', 'group-a'],
        ['opt-b', 'group-b'],
        ['opt-c', 'group-c'],
      ]).hasOneOptionPerOptionGroup(),
    ).toBe(true);
  });

  it.each([
    [
      'the first two options repeat',
      [
        ['opt-a', 'group-a'],
        ['opt-b', 'group-a'],
        ['opt-c', 'group-c'],
      ] as const,
    ],
    [
      'a later pair repeats',
      [
        ['opt-a', 'group-a'],
        ['opt-b', 'group-b'],
        ['opt-c', 'group-b'],
      ] as const,
    ],
    [
      'the repeat is separated by an unrelated group',
      [
        ['opt-a', 'group-a'],
        ['opt-b', 'group-b'],
        ['opt-c', 'group-a'],
      ] as const,
    ],
    [
      'the SAME option group appears three times',
      [
        ['opt-a', 'group-a'],
        ['opt-b', 'group-a'],
        ['opt-c', 'group-a'],
      ] as const,
    ],
  ])('NET-NEW — a repeated optionGroupID returns FALSE when %s', (_label, pairs) => {
    expect(skuWithGroups(pairs).hasOneOptionPerOptionGroup()).toBe(false);
  });

  it('NET-NEW — the method returns on the FIRST repeat and examines no further option', () => {
    // `:L776-L777` returns false the moment a group is seen twice, BEFORE the loop advances. The proof
    // is a third option with NO option group at all: reaching it would dereference an undefined group
    // and raise — the legacy code dereferences it without a guard at `:L776` and the port raises at the
    // same point. Because the repeat at index 1 short-circuits, the raise never happens.
    const earlyReturn = buildSku({
      skuID: 'early-return-sku',
      skuCode: 'EARLY',
      options: [
        buildOption({ optionID: 'opt-a', optionGroup: buildOptionGroup({ optionGroupID: 'dup' }) }),
        buildOption({ optionID: 'opt-b', optionGroup: buildOptionGroup({ optionGroupID: 'dup' }) }),
        // No option group — a landmine that only detonates if the loop keeps going.
        buildOption({ optionID: 'opt-groupless' }),
      ],
    });

    expect(earlyReturn.hasOneOptionPerOptionGroup()).toBe(false);

    // And the landmine is real: without the preceding repeat, the same groupless option DOES raise.
    const noEarlyReturn = buildSku({
      skuID: 'no-early-return-sku',
      skuCode: 'NOEARLY',
      options: [
        buildOption({ optionID: 'opt-a', optionGroup: buildOptionGroup({ optionGroupID: 'one' }) }),
        buildOption({ optionID: 'opt-groupless' }),
      ],
    });
    expect(() => noEarlyReturn.hasOneOptionPerOptionGroup()).toThrow(/no option group/);
  });

  it('NET-NEW — the group comparison is CASE-SENSITIVE, unlike the context and inList comparisons', () => {
    // G6 — TWO COMPARISON POLICIES COEXIST IN THE LEGACY ENGINE AND ARE NOT HARMONISED.
    //
    // `model/entity/Sku.cfc:L776` uses `listFind`, the CASE-SENSITIVE list search, so two option
    // groups differing only by letter case count as DISTINCT and the SKU passes. Meanwhile
    // `org/Hibachi/HibachiValidationService.cfc:L71` selects contexts with `listFindNoCase` and
    // `:L459-L465` matches `inList` with `listFindNoCase` — both CASE-INSENSITIVE, as sections B9 and
    // E row 9 assert.
    //
    // The two policies are carried across exactly as found. Harmonising them would be a repair, and it
    // would change behaviour in whichever direction it was applied. As with the identifier comparison
    // in section F2, the divergence is unreachable for real data: option-group identifiers are
    // 32-character lowercase hexadecimal UUIDs (AAP IR-6).
    expect(
      skuWithGroups([
        ['opt-a', 'group-a'],
        ['opt-b', 'GROUP-A'],
      ]).hasOneOptionPerOptionGroup(),
    ).toBe(true);

    // The case-INSENSITIVE reading, stated explicitly so the contrast is visible rather than implied.
    expect('GROUP-A'.toLowerCase()).toBe('group-a');
  });

  it('NET-NEW — BOTH method failures are stored under the ONE property key `options`, each with its own message', async () => {
    // `model/validation/Sku.json:L5-L8` declares both method rules on the SAME property, and
    // `org/Hibachi/HibachiValidationService.cfc:L224` keys every error by the PROPERTY IDENTIFIER. Two
    // failures therefore accumulate in one bucket, in source key order — `:L6` before `:L7`.
    const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>('both-product');
    const harness = createValidatorHarness();
    const subject = (
      unique: boolean,
      onePerGroup: boolean,
    ): SkuValidationSubject & UniquePropertyEntity => ({
      ...uniqueEntityAccessors('SlatwallSku', 'skuID', 'both-sku', {}),
      getClassName: () => 'Sku',
      hasProperty: (identifier: string) => identifier === 'options',
      hasUniqueOptions: () => Promise.resolve(unique),
      hasOneOptionPerOptionGroup: () => onePerGroup,
      options: [],
    });

    const both = await harness.validateDryRun(subject(false, false), ruleSet, 'save');
    expect(Object.keys(both.getErrors())).toStrictEqual(['options']);
    expect(both.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
      'validate.save.Sku.options.hasOneOptionPerOptionGroup',
    ]);

    // Each rule is independently capable of failing alone — neither masks the other.
    const uniqueOnly = await harness.validateDryRun(subject(false, true), ruleSet, 'save');
    expect(uniqueOnly.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
    ]);

    const groupsOnly = await harness.validateDryRun(subject(true, false), ruleSet, 'save');
    expect(groupsOnly.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasOneOptionPerOptionGroup',
    ]);

    const clean = await harness.validateDryRun(subject(true, true), ruleSet, 'save');
    expect(clean.hasError('options')).toBe(false);
  });
});

/* ================================================================================================
 * SECTION G — UNIQUENESS SQL, IDENTIFIER WHITELISTING, AND S2 PARAMETER BINDING
 * ==============================================================================================
 *
 * IR-5 — application-side uniqueness checking exists IN ADDITION to any database constraint.
 * `org/Hibachi/HibachiDAO.cfc:L130-L147` runs an existence query during validation and answers the
 * `unique` constraint with its verdict, entirely independently of the `unique="true"` column metadata
 * the ORM emits. The port keeps both mechanisms: `UniquePropertyChecker` is the ported query.
 *
 * S2 — every statement asserted below binds VALUES through `?` placeholders and composes IDENTIFIERS
 * only from a validated whitelist. `?` binds values and cannot substitute an identifier (AAP §0.3.2),
 * which is precisely why the two are separated rather than interpolated together. Nothing in this
 * section opens a `mysql2` connection, reaches a real database, reads `process.env`, or names a
 * credential, host, endpoint, ARN or account: the executor is the support double and every call it
 * receives is recorded verbatim for inspection.
 *
 * A boundary note, because the two are easy to confuse. `UniquePropertyPort` is the VALIDATION-time
 * uniqueness check of `org/Hibachi/HibachiDAO.cfc:L130-L147`. It is NOT the URL-title utility's
 * availability callback — `model/service/DataService.cfc:L53-L71` probes with
 * `getDataDAO().verifyUniqueTableValue(...)`, a different query with a different polarity convention
 * and a different set of tables. That utility is out of this file's scope and is neither imported nor
 * exercised here; only the validation-time port is.
 * ---------------------------------------------------------------------------------------------- */

/** The twelve physical tables the extracted Catalog schema declares, as the adapter resolves them. */
const APPROVED_CATALOG_TABLES: readonly string[] = [
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
];

describe('NET-NEW — G1. identifiers come only from the validated whitelist', () => {
  it.each(APPROVED_CATALOG_TABLES.map((table) => [table]))(
    'NET-NEW — the approved physical table %s resolves',
    (table) => {
      expect(assertTableName(table)).toBe(table);
    },
  );

  it('NET-NEW — the LOGICAL entity names the validation subjects report resolve to their physical tables', () => {
    // `org/Hibachi/HibachiDAO.cfc` composes its HQL against the LOGICAL entity name — the application
    // key prefixed onto the bare name — while SQL must name the PHYSICAL table. The resolver bridges
    // the two, which is why `UniquePropertyEntity.getEntityName()` may keep returning the legacy form.
    expect(assertTableName('SlatwallProduct')).toBe('SwProduct');
    expect(assertTableName('SlatwallSku')).toBe('SwSku');
    expect(assertTableName('SlatwallBrand')).toBe('SwBrand');
    expect(assertTableName('SlatwallOption')).toBe('SwOption');
    expect(assertTableName('SlatwallOptionGroup')).toBe('SwOptionGroup');
    expect(assertTableName('SlatwallProductType')).toBe('SwProductType');
    // The bare name resolves too, and resolution is case-insensitive — but the RESULT is always the
    // canonical physical spelling, so the emitted statement text never varies with caller casing.
    expect(assertTableName('Product')).toBe('SwProduct');
    expect(assertTableName('swproduct')).toBe('SwProduct');
    expect(assertTableName('  SwProduct  ')).toBe('SwProduct');
  });

  it.each([
    ['a table outside the extracted schema', 'SwNope'],
    ['an out-of-scope Slatwall table', 'SwOrder'],
    ['an empty name', ''],
    ['a statement fragment', 'SwProduct; DROP TABLE SwProduct'],
    ['a comment-terminated name', 'SwProduct--'],
    ['a quoted name', '`SwProduct`'],
    ['a wildcard', '*'],
    ['a union attempt', 'SwProduct UNION SELECT 1'],
  ])('NET-NEW — %s is REFUSED before any statement text is assembled', (_label, candidate) => {
    // The refusal happens in the identifier resolver, so it cannot reach the executor at all. The
    // legacy throw text is deliberately NOT asserted: only the refusal is behaviour a caller can
    // observe, and pinning the wording would pin a detail the port does not owe.
    expect(() => assertTableName(candidate)).toThrow();
  });

  it.each([
    ['a column absent from the table', 'SwBrand', 'nonExistentColumn'],
    ['a column belonging to a DIFFERENT table', 'SwBrand', 'skuCode'],
    ['a statement fragment', 'SwProduct', 'productCode = 1 OR 1=1'],
    ['a comment-terminated column', 'SwProduct', 'productCode--'],
    ['an empty name', 'SwProduct', ''],
    ['a wildcard', 'SwProduct', '*'],
  ])('NET-NEW — %s is REFUSED by the column resolver', (_label, table, candidate) => {
    const resolvedTable = assertTableName(table);
    expect(() => assertColumnName(resolvedTable, candidate)).toThrow();
  });

  it('NET-NEW — the seven real uniqueness columns all resolve on their own tables', () => {
    // The same seven sites section A2 enumerates, checked at the SQL layer this time: every column a
    // uniqueness probe will ever name is in the whitelist, so no real rule can be refused.
    expect(assertColumnName(assertTableName('SlatwallProduct'), 'productCode')).toBe('productCode');
    expect(assertColumnName(assertTableName('SlatwallProduct'), 'urlTitle')).toBe('urlTitle');
    expect(assertColumnName(assertTableName('SlatwallSku'), 'skuCode')).toBe('skuCode');
    expect(assertColumnName(assertTableName('SlatwallBrand'), 'urlTitle')).toBe('urlTitle');
    expect(assertColumnName(assertTableName('SlatwallOption'), 'optionCode')).toBe('optionCode');
    expect(assertColumnName(assertTableName('SlatwallOptionGroup'), 'optionGroupCode')).toBe(
      'optionGroupCode',
    );
    expect(assertColumnName(assertTableName('SlatwallProductType'), 'urlTitle')).toBe('urlTitle');
  });
});

describe('NET-NEW — G2. `UniquePropertyChecker` — the ported existence query', () => {
  it('NET-NEW — values are bound as `?` parameters and NEVER interpolated into the statement text', async () => {
    // S2 and TR-4. `org/Hibachi/HibachiDAO.cfc:L140` binds two NAMED parameters, `:propertyValue` and
    // `:entityID`, in that order. `mysql2` has no named parameters, so the port binds them
    // POSITIONALLY in the same order — value first, entity identifier second — which is the direct
    // analogue of the legacy call and the reason the ordering is asserted rather than assumed.
    const sql = createSqlExecutorDouble();
    const checker = new UniquePropertyChecker(sql.executor);
    const entity = uniqueEntityAccessors('SlatwallBrand', 'brandID', 'brand-1', {
      urlTitle: 'the-title',
    });

    await checker.isUniqueProperty('urlTitle', entity);

    expect(sql.calls).toHaveLength(1);
    const call = first(sql.calls);
    expect(call.sql).toBe(
      'SELECT 1 FROM SwBrand e WHERE e.urlTitle = ? AND e.brandID != ? LIMIT 1',
    );
    // Exactly two placeholders, and exactly two bound values in the legacy order.
    expect(call.sql.split('?')).toHaveLength(3);
    expect(call.params).toStrictEqual(['the-title', 'brand-1']);
    // Neither value appears anywhere in the statement text.
    expect(call.sql).not.toContain('the-title');
    expect(call.sql).not.toContain('brand-1');
  });

  it.each([
    ['a quote-bearing value', "o'brien"],
    ['a statement terminator', "x'; DROP TABLE SwBrand; --"],
    ['a tautology', "' OR '1'='1"],
    ['a comment', 'value -- comment'],
    ['a backslash', 'back\\slash'],
    ['a null byte', 'nul\u0000byte'],
    ['a newline', 'two\nlines'],
  ])(
    'NET-NEW — %s travels as a BOUND PARAMETER and leaves the statement text byte-identical',
    async (_label, hostileValue) => {
      // The structural argument for S2: because the statement text is assembled from whitelisted
      // identifiers alone and every value is bound, NO value can alter the statement — which is what
      // eliminates the entire class of flaw catalogued as defect D18 for the importer's interpolated
      // statements (AAP §0.6.7.7).
      const sql = createSqlExecutorDouble();
      const checker = new UniquePropertyChecker(sql.executor);
      const entity = uniqueEntityAccessors('SlatwallProduct', 'productID', 'product-1', {
        productCode: hostileValue,
      });

      await checker.isUniqueProperty('productCode', entity);

      const call = first(sql.calls);
      expect(call.sql).toBe(
        'SELECT 1 FROM SwProduct e WHERE e.productCode = ? AND e.productID != ? LIMIT 1',
      );
      expect(call.params).toStrictEqual([hostileValue, 'product-1']);
    },
  );

  it('NET-NEW — the polarity matches the DAO exactly: a matching row means NOT unique', async () => {
    // `org/Hibachi/HibachiDAO.cfc:L142-L144` returns FALSE when the existence query finds anything, and
    // `:L146` returns TRUE when it does not. `validate_unique` at
    // `org/Hibachi/HibachiValidationService.cfc:L467-L470` passes that verdict through UNMODIFIED, so
    // `true = unique = safe to save`. Inverting it would admit every collision and reject every clean
    // value — a failure mode that no compiler and no type would catch.
    const entity = uniqueEntityAccessors('SlatwallSku', 'skuID', 'sku-1', { skuCode: 'TAKEN' });

    const noRow = createSqlExecutorDouble();
    const cleanChecker = new UniquePropertyChecker(noRow.executor);
    await expect(cleanChecker.isUniqueProperty('skuCode', entity)).resolves.toBe(true);

    const oneRow = createSqlExecutorDouble({ outcomes: [sqlRows([{ 1: 1 }])] });
    const takenChecker = new UniquePropertyChecker(oneRow.executor);
    await expect(takenChecker.isUniqueProperty('skuCode', entity)).resolves.toBe(false);

    const manyRows = createSqlExecutorDouble({ outcomes: [sqlRows([{ 1: 1 }, { 1: 1 }])] });
    const manyChecker = new UniquePropertyChecker(manyRows.executor);
    await expect(manyChecker.isUniqueProperty('skuCode', entity)).resolves.toBe(false);
  });

  it('NET-NEW — the self-exclusion clause is emitted UNCONDITIONALLY, and is a NO-OP on insert', async () => {
    // `org/Hibachi/HibachiDAO.cfc:L140` always appends `and e.#entityIDproperty# != :entityID`. There
    // is no branch on whether the entity has been saved, so on an INSERT the clause compares against an
    // empty identifier and excludes nothing — it is inert rather than absent.
    //
    // This is parity evidence and must NOT be "optimised" away. Dropping the clause when the identifier
    // is empty would change the emitted statement text for every insert, and adding a branch that
    // skipped the comparison would change it again. The legacy statement has one shape; so does this one.
    const sql = createSqlExecutorDouble();
    const checker = new UniquePropertyChecker(sql.executor);

    // A SAVED row: the clause excludes self, which is what lets an unchanged row be re-saved.
    const saved = uniqueEntityAccessors('SlatwallOption', 'optionID', 'option-1', {
      optionCode: 'RED',
    });
    await checker.isUniqueProperty('optionCode', saved);

    // An UNSAVED row: the identical clause is emitted, bound to the empty identifier.
    const unsaved = uniqueEntityAccessors('SlatwallOption', 'optionID', '', { optionCode: 'RED' });
    await checker.isUniqueProperty('optionCode', unsaved);

    expect(sql.calls).toHaveLength(2);
    const savedCall = first(sql.calls);
    const unsavedCall = first(sql.calls.slice(1));

    // BYTE-IDENTICAL statement text in both cases.
    expect(savedCall.sql).toBe(unsavedCall.sql);
    expect(savedCall.sql).toContain('AND e.optionID != ?');
    // Only the bound identifier differs, and on insert it is the empty string.
    expect(savedCall.params).toStrictEqual(['RED', 'option-1']);
    expect(unsavedCall.params).toStrictEqual(['RED', '']);
  });

  it('NET-NEW — the property NAME is resolved through the entity metadata, as the legacy DAO does', async () => {
    // `:L134` reads `getPropertyMetaData(propertyName).name` rather than trusting the caller's spelling,
    // so an alias resolves to the real column. The port preserves that indirection, then passes the
    // RESOLVED name through the column whitelist — two independent gates before the identifier is used.
    const sql = createSqlExecutorDouble();
    const checker = new UniquePropertyChecker(sql.executor);
    const aliasing: UniquePropertyEntity = {
      // The caller asks about `code`; the metadata says the real property is `optionGroupCode`.
      getPropertyMetaData: () => ({ name: 'optionGroupCode' }),
      getEntityName: () => 'SlatwallOptionGroup',
      getPrimaryIDValue: () => 'group-1',
      getPrimaryIDPropertyName: () => 'optionGroupID',
      getValueByPropertyIdentifier: () => 'SIZE',
    };

    await checker.isUniqueProperty('code', aliasing);

    expect(first(sql.calls).sql).toBe(
      'SELECT 1 FROM SwOptionGroup e WHERE e.optionGroupCode = ? AND e.optionGroupID != ? LIMIT 1',
    );
  });

  it('NET-NEW — an entity whose metadata names an unapproved column is refused WITHOUT executing SQL', async () => {
    // The gate runs before the statement is assembled, so the executor is never reached. Asserting the
    // empty call log is what makes "refused before execution" a fact rather than a claim.
    const sql = createSqlExecutorDouble();
    const checker = new UniquePropertyChecker(sql.executor);
    const hostile: UniquePropertyEntity = {
      getPropertyMetaData: () => ({ name: 'urlTitle = 1 OR 1=1' }),
      getEntityName: () => 'SlatwallBrand',
      getPrimaryIDValue: () => 'brand-1',
      getPrimaryIDPropertyName: () => 'brandID',
      getValueByPropertyIdentifier: () => 'anything',
    };

    await expect(checker.isUniqueProperty('urlTitle', hostile)).rejects.toThrow();
    expect(sql.calls).toStrictEqual([]);
  });

  it('NET-NEW — `withExecutor` rebinds the transaction-scoped executor without mutating the original', async () => {
    // The mechanism that lets a uniqueness probe run INSIDE the caller's transaction — which is what
    // M6 depends on (section F4). Rebinding returns a NEW checker, so the module-scope instance holds
    // no per-request state and a warm container cannot leak one invocation's connection into another.
    const outer = createSqlExecutorDouble();
    const inner = createSqlExecutorDouble();
    const checker = new UniquePropertyChecker(outer.executor);
    const rebound = checker.withExecutor(inner.executor);
    const entity = uniqueEntityAccessors('SlatwallProductType', 'productTypeID', 'pt-1', {
      urlTitle: 'shirts',
    });

    expect(rebound).not.toBe(checker);

    await rebound.isUniqueProperty('urlTitle', entity);
    expect(inner.calls).toHaveLength(1);
    expect(outer.calls).toStrictEqual([]);

    await checker.isUniqueProperty('urlTitle', entity);
    expect(outer.calls).toHaveLength(1);
    expect(inner.calls).toHaveLength(1);
  });

  /* ==============================================================================================
   * NET-NEW TODO(parity) — F6 WITHDRAWAL. NEITHER PROBE LOCKS, AND THE CWE-367 RACE IS CARRIED
   * ==============================================================================================
   * A revision of this port appended ` FOR UPDATE` to both uniqueness probes whenever the checker had
   * adopted a boundary's executor, and licensed it on the D18 footing (AAP §0.6.7.7) on the ground that
   * a locking read returns the same rows and therefore the same verdict. THAT IS WITHDRAWN IN FULL. The
   * ground was sound as far as it went, but AAP §0.6.7.7 authorises exactly ONE departure from
   * behavioural preservation in this port — D18, the importer's parameterised SQL — and it does so
   * precisely so that a reviewer diffing behaviour has exactly one entry to check. Statement text is
   * observable, a lock-wait is observable under concurrency, and AAP §0.8.2 Guideline 4 admits no
   * proportionality test. Both probes are therefore byte-identical to `org/Hibachi/HibachiDAO.cfc:L140`
   * and `model/dao/DataDAO.cfc:L122-L124` on EVERY path, bound or unbound.
   *
   * ⚠️ THE EXPOSURE THAT IS CARRIED, STATED PLAINLY (CWE-367, TOCTOU). Each probe is the READ half of a
   * check-then-write. Two concurrent savers can both be told a value is free and both write it. Five of
   * the seven ported uniqueness rules have a `unique="true"` column behind them, so the database
   * convicts the second write there; `optionCode` (`model/validation/Option.json:L3`) and
   * `optionGroupCode` (`model/validation/OptionGroup.json:L3`) do NOT, so on those two the duplicate
   * simply persists. The repair is a unique index, and AAP §0.2.2.5 places schema migration outside this
   * refactoring entirely — so it is the operator's decision, arriving as a stated requirement rather
   * than smuggled in as a statement suffix. The legacy system has the same exposure for the same reason.
   *
   * ⭐ `withExecutor` ITSELF IS NOT WITHDRAWN. Adopting a boundary's executor is M6 visibility — it is
   * what lets a uniqueness probe observe rows the same transaction has already written, which
   * `SkuService.createSkus` depends on (§0.6.2). It changes WHICH connection runs the statement and
   * never the statement. The tests below pin exactly that split.
   * ============================================================================================ */

  /** Both probe forms, so each assertion below runs against the same instance twice over. */
  async function probeBothForms(checker: UniquePropertyChecker): Promise<void> {
    await checker.isUniqueProperty(
      'urlTitle',
      uniqueEntityAccessors('SlatwallBrand', 'brandID', 'brand-1', { urlTitle: 'acme' }),
    );
    await checker.isUrlTitleAvailable('SwBrand', 'acme');
  }

  it('NET-NEW — the POOL-BOUND instance emits the ported statement, with no clause after the limit', async () => {
    const sql = createSqlExecutorDouble();

    await probeBothForms(new UniquePropertyChecker(sql.executor));

    expect(sql.calls.map((call) => call.sql)).toStrictEqual([
      'SELECT 1 FROM SwBrand e WHERE e.urlTitle = ? AND e.brandID != ? LIMIT 1',
      'SELECT 1 FROM SwBrand WHERE urlTitle = ? LIMIT 1',
    ]);
  });

  it('NET-NEW TODO(parity) — WITHDRAWAL REGRESSION: the BOUNDARY-SCOPED instance emits the SAME text', async () => {
    /*
     * The withdrawal, pinned where the hardening used to live. This is the one instance for which a
     * locking read would have been meaningful, and it is byte-identical to the pool-bound instance —
     * `withExecutor` changes the connection and nothing else. A re-added suffix fails here first.
     */
    const sql = createSqlExecutorDouble();

    await probeBothForms(
      new UniquePropertyChecker(createSqlExecutorDouble().executor).withExecutor(sql.executor),
    );

    expect(sql.calls.map((call) => call.sql)).toStrictEqual([
      'SELECT 1 FROM SwBrand e WHERE e.urlTitle = ? AND e.brandID != ? LIMIT 1',
      'SELECT 1 FROM SwBrand WHERE urlTitle = ? LIMIT 1',
    ]);
  });

  it('NET-NEW TODO(parity) — every probe statement ENDS at the row limit, on both paths', async () => {
    // Positional rather than textual, so it also catches a suffix appended under a different spelling
    // (`LOCK IN SHARE MODE`, `FOR SHARE`, a hint comment) rather than only the one that was withdrawn.
    const pool = createSqlExecutorDouble();
    const boundary = createSqlExecutorDouble();

    await probeBothForms(new UniquePropertyChecker(pool.executor));
    await probeBothForms(new UniquePropertyChecker(pool.executor).withExecutor(boundary.executor));

    for (const call of [...pool.calls, ...boundary.calls]) {
      expect(call.sql.endsWith(' LIMIT 1')).toBe(true);
      expect(call.sql).not.toContain('FOR UPDATE');
      expect(call.sql).not.toContain('FOR SHARE');
      expect(call.sql).not.toContain('LOCK IN SHARE MODE');
    }
  });

  it('NET-NEW — the verdict is the same on both paths, for either answer', async () => {
    /*
     * Re-binding must not disturb the boolean, for the collision case AND the free case, because a test
     * that only exercised one would pass under a polarity inversion. This is the assertion that survived
     * the withdrawal intact: it was the D18 argument's evidence, and it is now simply the parity
     * evidence that adopting an executor changes nothing observable but the connection.
     */
    const collision = [{ 1: 1 }];
    const entity = uniqueEntityAccessors('SlatwallOption', 'optionID', 'option-1', {
      optionCode: 'RED',
    });

    /* Both construction routes onto the SAME recording executor: straight through the constructor, and
     * adopted from a boundary by `withExecutor` over an unrelated pool. */
    const routes: readonly ((executor: SqlExecutorDouble['executor']) => UniquePropertyChecker)[] =
      [
        (executor) => new UniquePropertyChecker(executor),
        (executor) =>
          new UniquePropertyChecker(createSqlExecutorDouble().executor).withExecutor(executor),
      ];

    for (const route of routes) {
      const taken = createSqlExecutorDouble({ outcomes: [sqlRows(collision), sqlRows(collision)] });
      const free = createSqlExecutorDouble();

      await expect(route(taken.executor).isUniqueProperty('optionCode', entity)).resolves.toBe(
        false,
      );
      await expect(route(taken.executor).isUrlTitleAvailable('SwBrand', 'acme')).resolves.toBe(
        false,
      );

      await expect(route(free.executor).isUniqueProperty('optionCode', entity)).resolves.toBe(true);
      await expect(route(free.executor).isUrlTitleAvailable('SwBrand', 'acme')).resolves.toBe(true);
    }
  });

  it('NET-NEW — bound values, placeholder counts and the identifier gate on the re-bound path', async () => {
    // The rest of the statement's contract, asserted on the boundary-scoped instance because that is the
    // path the withdrawn hardening touched: two placeholders and the legacy bind order for the
    // self-excluding probe, one for the availability probe, and neither value ever interpolated (S2, TR-4).
    const sql = createSqlExecutorDouble();

    await probeBothForms(
      new UniquePropertyChecker(createSqlExecutorDouble().executor).withExecutor(sql.executor),
    );

    const [selfExcluding, availability] = [first(sql.calls), sql.calls[1]];
    expect(selfExcluding.params).toStrictEqual(['acme', 'brand-1']);
    expect(selfExcluding.sql.split('?')).toHaveLength(3);
    expect(availability?.params).toStrictEqual(['acme']);
    expect(availability?.sql.split('?')).toHaveLength(2);
    expect(selfExcluding.sql).not.toContain('acme');
  });

  it('NET-NEW — a re-bound instance still refuses an unapproved identifier WITHOUT executing SQL', async () => {
    // The whitelist runs before composition on the boundary path too. Order matters: a gate that moved
    // after composition would still pass a text assertion while sending the statement.
    const sql = createSqlExecutorDouble();
    const checker = new UniquePropertyChecker(createSqlExecutorDouble().executor).withExecutor(
      sql.executor,
    );

    await expect(
      checker.isUniqueProperty(
        'urlTitle',
        uniqueEntityAccessors('SlatwallBrand', 'brandID', 'brand-1', { urlTitle: 'x' }),
      ),
    ).resolves.toBe(true);
    await expect(checker.isUrlTitleAvailable('SwSku', 'acme')).rejects.toThrow();

    // Exactly one statement ran — the legal one. The refused table never reached the executor.
    expect(sql.calls).toHaveLength(1);
  });

  it('NET-NEW — re-binding returns a NEW instance, so a warm container leaks no connection', async () => {
    /*
     * M7. `withExecutor` does not mutate, so a module-scope checker held across warm invocations cannot
     * have another invocation's boundary connection substituted into it — and both instances emit the
     * identical ported statement, which is the withdrawal restated from the other direction.
     */
    const pool = createSqlExecutorDouble();
    const boundary = createSqlExecutorDouble();
    const poolBound = new UniquePropertyChecker(pool.executor);
    const reBound = poolBound.withExecutor(boundary.executor);

    expect(reBound).not.toBe(poolBound);

    await reBound.isUrlTitleAvailable('SwProduct', 'shirts');
    await poolBound.isUrlTitleAvailable('SwProduct', 'shirts');

    expect(first(boundary.calls).sql).toBe('SELECT 1 FROM SwProduct WHERE urlTitle = ? LIMIT 1');
    expect(first(pool.calls).sql).toBe(first(boundary.calls).sql);
  });

  it('NET-NEW TODO(parity) — the UNSERIALIZED interleaving is carried on EVERY path (CWE-367)', async () => {
    /*
     * The carried defect, demonstrated rather than described. Two would-be savers probe the same code
     * against a store that neither has written yet. Both are told it is free, and for `optionCode` —
     * which per DIVERGENCE 1 has NO `unique="true"` column behind it — nothing downstream refuses the
     * second write. The boundary-scoped instance behaves identically, which is the whole point of the
     * withdrawal: the port asks the database to serialize nothing, exactly as the legacy does not.
     */
    const store = createSqlExecutorDouble();
    const boundary = createSqlExecutorDouble();
    const entity = uniqueEntityAccessors('SlatwallOption', 'optionID', '', { optionCode: 'RED' });

    for (const probe of [
      new UniquePropertyChecker(store.executor),
      new UniquePropertyChecker(store.executor).withExecutor(boundary.executor),
    ]) {
      const [firstSaver, secondSaver] = await Promise.all([
        probe.isUniqueProperty('optionCode', entity),
        probe.isUniqueProperty('optionCode', entity),
      ]);

      expect(firstSaver).toBe(true);
      expect(secondSaver).toBe(true);
    }

    // Four probes ran, and not one asked the database to serialize them.
    expect([...store.calls, ...boundary.calls]).toHaveLength(4);
    for (const call of [...store.calls, ...boundary.calls]) {
      expect(call.sql).not.toContain('FOR UPDATE');
    }
  });
});

describe('NET-NEW — G3. the selected-options statement binds values and whitelists identifiers', () => {
  /** The real adapter over a recording executor; no connection, no pool, no environment. */
  function skuRepositoryOverDouble(): {
    readonly repository: MySqlSkuRepository;
    readonly sql: ReturnType<typeof createSqlExecutorDouble>;
  } {
    const sql = createSqlExecutorDouble();
    const repository = new MySqlSkuRepository(
      sql.executor,
      createOptionGroupSortOrderMemo(),
      createProductTypeRootResolverDouble().resolver,
      createAbsentAccountContextDouble().accountContext,
    );
    return { repository, sql };
  }

  it('NET-NEW — one `EXISTS` clause per selected option, plus the T3 guard, plus the T2 product scope', async () => {
    // AAP §0.3.3.1 and §0.6.1.3. T1 — the conjunction is expressed as N SEPARATE correlated `EXISTS`
    // clauses ANDed together, never as an `IN` list (which would become a disjunction) and never as a
    // `GROUP BY ... HAVING COUNT` rewrite (which would diverge on a duplicated option). T3 — the
    // option-bearing guard is retained, so option-less SKUs stay excluded exactly as the legacy
    // vestigial `inner join sku.options` causes them to be. T4 — `SELECT DISTINCT` guards against the
    // join fan-out. T2 — the product predicate is emitted LAST, so the bound parameter array is in
    // exactly the legacy order of `model/dao/SkuDAO.cfc:L107-L128`.
    const { repository, sql } = skuRepositoryOverDouble();

    await repository.findSkusBySelectedOptions(['opt-a', 'opt-b'], 'product-1');

    const call = first(sql.calls);
    expect(call.sql.startsWith('SELECT DISTINCT ')).toBe(true);
    expect(call.sql).toContain(' FROM SwSku s ');
    // The T3 guard, correlated and unparameterised.
    expect(call.sql).toContain('EXISTS( SELECT 1 FROM SwSkuOption sob WHERE sob.skuID = s.skuID )');
    // Exactly two option clauses for two options, and each binds its identifier.
    const optionClause =
      'EXISTS( SELECT 1 FROM SwSkuOption so WHERE so.skuID = s.skuID AND so.optionID = ? )';
    expect(call.sql.split(optionClause)).toHaveLength(3);
    // The product predicate is last.
    expect(call.sql.endsWith('AND s.productID = ?')).toBe(true);
    // Three placeholders, three values, in the legacy order: options first, product last.
    expect(call.sql.split('?')).toHaveLength(4);
    expect(call.params).toStrictEqual(['opt-a', 'opt-b', 'product-1']);
  });

  it.each([
    ['no options at all', [] as readonly string[], 0],
    ['one option', ['solo'] as readonly string[], 1],
    ['three options', ['a', 'b', 'c'] as readonly string[], 3],
    ['a DUPLICATED option', ['dup', 'dup'] as readonly string[], 2],
  ])(
    'NET-NEW — the clause count tracks the option list exactly when there is %s',
    async (_label, optionIds, expectedClauses) => {
      // T1's duplicate rule made executable: a repeated element produces a REPEATED clause rather than
      // being collapsed, because the legacy loop at `model/dao/SkuDAO.cfc:L113` iterates list positions
      // and never de-duplicates. T5 — an EMPTY list is legal and produces zero option clauses, leaving
      // the guard and the product scope, which is the degenerate form D19 depends on (section F3).
      const { repository, sql } = skuRepositoryOverDouble();

      await repository.findSkusBySelectedOptions([...optionIds], 'product-1');

      const call = first(sql.calls);
      const optionClause =
        'EXISTS( SELECT 1 FROM SwSkuOption so WHERE so.skuID = s.skuID AND so.optionID = ? )';
      expect(call.sql.split(optionClause)).toHaveLength(expectedClauses + 1);
      expect(call.params).toStrictEqual([...optionIds, 'product-1']);
      // The guard and the product scope survive every list length, including the empty one.
      expect(call.sql).toContain('sob.skuID = s.skuID');
      expect(call.sql.endsWith('AND s.productID = ?')).toBe(true);
    },
  );

  it('NET-NEW — there is NO self-exclusion predicate in the selected-options statement', async () => {
    // The SQL-side half of the section F2 claim. `model/dao/SkuDAO.cfc:L107-L128` has no current-SKU
    // exclusion, and neither does this statement: the decision belongs to
    // `model/entity/Sku.cfc:L764`. A port that pushed the exclusion into SQL would make
    // `hasUniqueOptions` return true for a SKU that legacy code rejects, because the arity-one guard
    // would then see zero rows instead of one.
    const { repository, sql } = skuRepositoryOverDouble();

    await repository.findSkusBySelectedOptions(['opt-a'], 'product-1');

    const call = first(sql.calls);
    expect(call.sql).not.toContain('skuID !=');
    expect(call.sql).not.toContain('skuID <>');
    // Two bound values only — the option and the product. No third parameter for an excluded row.
    expect(call.params).toHaveLength(2);
  });

  it.each([
    ['a tautology', "' OR '1'='1"],
    ['a statement terminator', "x'; DROP TABLE SwSku; --"],
    ['a comment', 'opt -- rest'],
    ['a placeholder character', '?'],
    ['a comma, which would split a legacy list', 'opt-a,opt-b'],
  ])(
    'NET-NEW — a hostile option identifier of %s cannot change the statement text',
    async (_label, hostileOptionId) => {
      const { repository, sql } = skuRepositoryOverDouble();
      const control = skuRepositoryOverDouble();

      await repository.findSkusBySelectedOptions([hostileOptionId], 'product-1');
      await control.repository.findSkusBySelectedOptions(['benign'], 'product-1');

      // Byte-identical statements; only the bound values differ.
      expect(first(sql.calls).sql).toBe(first(control.sql.calls).sql);
      expect(first(sql.calls).params).toStrictEqual([hostileOptionId, 'product-1']);
    },
  );

  it('NET-NEW — a hostile product identifier is bound, not interpolated', async () => {
    const { repository, sql } = skuRepositoryOverDouble();
    const hostileProductId = "p'; DELETE FROM SwSku; --";

    await repository.findSkusBySelectedOptions(['opt-a'], hostileProductId);

    const call = first(sql.calls);
    expect(call.sql).not.toContain('DELETE');
    expect(call.sql.endsWith('AND s.productID = ?')).toBe(true);
    expect(call.params).toStrictEqual(['opt-a', hostileProductId]);
  });

  it('NET-NEW — every identifier in the statement is a whitelisted table or column, and none is caller-supplied', async () => {
    // The positive form of S2: the only identifiers appearing in the emitted text are ones the schema
    // whitelist can resolve, so caller data can never reach the identifier position at all.
    const { repository, sql } = skuRepositoryOverDouble();

    await repository.findSkusBySelectedOptions(['opt-a'], 'product-1');
    const emitted = first(sql.calls).sql;

    // The two tables named are both approved, and both are Catalog tables.
    expect(assertTableName('SwSku')).toBe('SwSku');
    expect(assertTableName('SwSkuOption')).toBe('SwSkuOption');
    expect(emitted).toContain('FROM SwSku s');
    expect(emitted).toContain('FROM SwSkuOption');
    // No table outside the whitelist is mentioned anywhere.
    for (const token of emitted.split(/[^A-Za-z0-9_]+/)) {
      if (token.startsWith('Sw')) {
        expect(APPROVED_CATALOG_TABLES).toContain(token);
      }
    }
    // The columns the statement names resolve on the tables it names.
    expect(assertColumnName(assertTableName('SwSku'), 'productID')).toBe('productID');
    expect(assertColumnName(assertTableName('SwSkuOption'), 'skuID')).toBe('skuID');
    expect(assertColumnName(assertTableName('SwSkuOption'), 'optionID')).toBe('optionID');
  });
});

/* ================================================================================================
 * SECTION H — RAW MESSAGE KEYS, THE ERROR BAG, AND VALIDATE-GATE-PERSIST
 * ============================================================================================== */

describe('NET-NEW — H1. the three raw message-key templates', () => {
  /*
   * G6 / DECISION D-1 — RESOURCE-BUNDLE SUBSTITUTION IS DELIBERATELY SKIPPED, AND THE RAW KEY IS THE
   * OBSERVABLE OUTPUT. Three independent reasons, each verified rather than assumed:
   *
   *   1. NO RESOURCE BUNDLE EXISTS IN THE TARGET. The legacy engine composes a key and hands it to
   *      `rbKey(...)` for lookup. The extracted subtree carries no bundle, no locale file and no
   *      translation table, so there is nothing to look a key up in. Emitting a raw key is the honest
   *      output; inventing English sentences would be fabricating message text the source never had
   *      (S9 — invent nothing).
   *
   *   2. THE PLACEHOLDER SUBSTITUTION COULD NEVER HAVE FIRED ON THESE KEYS ANYWAY. The legacy
   *      interpolator at `org/Hibachi/HibachiUtilityService.cfc:L71` collects `${...}` tokens, and NONE
   *      of the three templates below emits such a token — they are dot-delimited identifiers, start to
   *      finish. So even with a bundle present, substitution would have been a no-op on this corpus.
   *
   *   3. RAW KEYS STAY STABLE AND COMPARABLE, WHEREAS UNRESOLVED LEGACY LOOKUPS DID NOT. When the
   *      legacy bundle had no entry for a key, the lookup appended `_missing` to it — evidence visible
   *      in the `issue_1335` expectations in `meta/tests/unit/IssuesTest.cfc`. A raw key carries no such
   *      suffix and no locale dependency, so a target message is comparable against a legacy key
   *      directly. The final case in this block asserts the absence of that suffix.
   *
   * No formatting utility is imported here and no legacy `throw()` string is reproduced.
   */

  it('NET-NEW — the METHOD template is `validate.{context}.{className}.{propertyName}.{constraintValue}`', async () => {
    // `org/Hibachi/HibachiValidationService.cfc:L222` — the method template is the only one of the
    // three that inlines the CONSTRAINT VALUE rather than the constraint type, because the value is the
    // method name and is what distinguishes the two rules on one property.
    const { ruleSet } = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>('h1-product');
    const harness = createValidatorHarness();
    const failing: SkuValidationSubject & UniquePropertyEntity = {
      ...uniqueEntityAccessors('SlatwallSku', 'skuID', 'h1-sku', {}),
      getClassName: () => 'Sku',
      hasProperty: (identifier: string) => identifier === 'options',
      hasUniqueOptions: () => Promise.resolve(false),
      hasOneOptionPerOptionGroup: () => false,
      options: [],
    };

    const errors = await harness.validateDryRun(failing, ruleSet, 'save');
    expect(errors.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
      'validate.save.Sku.options.hasOneOptionPerOptionGroup',
    ]);

    // The same two keys through the exported composer, so the template is pinned independently of the
    // rule modules that happen to use it.
    expect(
      buildValidationMessage<SkuValidationSubject>('save', 'Sku', 'options', {
        constraintType: 'method',
        constraintValue: 'hasUniqueOptions',
        invoke: (subject) => subject.hasOneOptionPerOptionGroup(),
      }),
    ).toBe('validate.save.Sku.options.hasUniqueOptions');
    expect(
      buildValidationMessage<SkuValidationSubject>('save', 'Sku', 'options', {
        constraintType: 'method',
        constraintValue: 'hasOneOptionPerOptionGroup',
        invoke: (subject) => subject.hasOneOptionPerOptionGroup(),
      }),
    ).toBe('validate.save.Sku.options.hasOneOptionPerOptionGroup');
  });

  it('NET-NEW — the DATATYPE template inserts `dataType` AND the requested type', async () => {
    // `:L226` — `validate.{context}.{className}.{propertyName}.dataType.{constraintValue}`. This is the
    // one template with TWO trailing segments, so a port that reused the generic template would emit
    // `...price.dataType` and lose which type was demanded.
    const harness = createValidatorHarness();

    const skuRules = skuRuleSetFor<SkuValidationSubject & UniquePropertyEntity>('h1-dt-product');
    const badPrice: SkuValidationSubject & UniquePropertyEntity = {
      ...uniqueEntityAccessors('SlatwallSku', 'skuID', 'h1-dt-sku', {}),
      getClassName: () => 'Sku',
      hasProperty: (identifier: string) => identifier === 'price',
      hasUniqueOptions: () => Promise.resolve(true),
      hasOneOptionPerOptionGroup: () => true,
      price: 'not numeric',
    };
    const priceErrors = await harness.validateDryRun(badPrice, skuRules.ruleSet, 'save');
    expect(priceErrors.getError('price')).toContain('validate.save.Sku.price.dataType.numeric');

    const badWebsite: BrandValidationSubject & UniquePropertyEntity = {
      ...uniqueEntityAccessors('SlatwallBrand', 'brandID', 'h1-dt-brand', {}),
      getClassName: () => 'Brand',
      hasProperty: (identifier: string) => identifier === 'brandWebsite',
      brandWebsite: 'not a url',
    };
    const websiteErrors = await harness.validateDryRun(
      badWebsite,
      createBrandValidationRules<BrandValidationSubject & UniquePropertyEntity>(
        resolveBrandUniqueTarget,
      ),
      'save',
    );
    expect(websiteErrors.getError('brandWebsite')).toStrictEqual([
      'validate.save.Brand.brandWebsite.dataType.url',
    ]);
  });

  it('NET-NEW — the GENERIC template ends in the CONSTRAINT TYPE for every remaining kind', () => {
    // `:L230` — `validate.{context}.{className}.{propertyName}.{constraintType}`. Asserted through the
    // exported composer across every non-method, non-dataType kind, so no kind can silently fall back
    // to a different template.
    expect(
      buildValidationMessage<ProductValidationSubject>('save', 'Product', 'productCode', {
        constraintType: 'required',
        constraintValue: true,
      }),
    ).toBe('validate.save.Product.productCode.required');
    expect(
      buildValidationMessage<ProductValidationSubject>('save', 'Product', 'productCode', {
        constraintType: 'unique',
        constraintValue: true,
        uniqueTarget: (subject) => subject,
      }),
    ).toBe('validate.save.Product.productCode.unique');
    expect(
      buildValidationMessage<ProductValidationSubject>('save', 'Product', 'productCode', {
        constraintType: 'regex',
        constraintValue: CODE_FORMAT_REGEX,
      }),
    ).toBe('validate.save.Product.productCode.regex');
    expect(
      buildValidationMessage<ProductTypeValidationSubject>('delete', 'ProductType', 'systemCode', {
        constraintType: 'maxLength',
        constraintValue: 0,
      }),
    ).toBe('validate.delete.ProductType.systemCode.maxLength');
    expect(
      buildValidationMessage<ProductValidationSubject>(
        'addOptionGroup',
        'Product',
        'baseProductType',
        { constraintType: 'inList', constraintValue: 'merchandise' },
      ),
    ).toBe('validate.addOptionGroup.Product.baseProductType.inList');
    expect(
      buildValidationMessage<ProductValidationSubject>('delete', 'Product', 'physicalCounts', {
        constraintType: 'maxCollection',
        constraintValue: 0,
      }),
    ).toBe('validate.delete.Product.physicalCounts.maxCollection');
    expect(
      buildValidationMessage<ProductValidationSubject>(
        'addOption',
        'Product',
        'unusedProductOptions',
        {
          constraintType: 'minCollection',
          constraintValue: 1,
        },
      ),
    ).toBe('validate.addOption.Product.unusedProductOptions.minCollection');
    expect(
      buildValidationMessage<SkuValidationSubject>('save', 'Sku', 'price', {
        constraintType: 'minValue',
        constraintValue: 0,
      }),
    ).toBe('validate.save.Sku.price.minValue');
    expect(
      buildValidationMessage<SkuValidationSubject>('delete', 'Sku', 'defaultFlag', {
        constraintType: 'eq',
        constraintValue: false,
      }),
    ).toBe('validate.delete.Sku.defaultFlag.eq');
  });

  it('NET-NEW — the class stem comes from the SUBJECT `getClassName()`, once per class in the corpus', async () => {
    // `org/Hibachi/HibachiValidationService.cfc:L222`, `:L226` and `:L230` all interpolate the subject's
    // OWN class name — never the rule module's file name and never a constant baked into the engine.
    // Every one of the seven classes in the corpus is exercised here with a TYPED subject literal, so a
    // regression that hard-coded a stem, or that derived it from the rule set instead of the subject,
    // fails on six of the seven rows rather than passing silently on all of them.
    const harness = createValidatorHarness();

    // Option — `model/validation/Option.json:L3`.
    const option: OptionValidationSubject = {
      ...uniqueEntityAccessors('SlatwallOption', 'optionID', 'stem-option', {}),
      getClassName: () => 'Option',
      hasProperty: (identifier: string) => identifier === 'optionCode',
    };
    const optionErrors = await harness.validateDryRun(option, optionValidationRuleSet, 'save');
    expect(optionErrors.getError('optionCode')).toStrictEqual([
      'validate.save.Option.optionCode.required',
    ]);

    // OptionGroup — `model/validation/OptionGroup.json:L4`.
    const optionGroup: OptionGroupValidationSubject = {
      ...uniqueEntityAccessors('SlatwallOptionGroup', 'optionGroupID', 'stem-group', {}),
      getClassName: () => 'OptionGroup',
      hasProperty: (identifier: string) => identifier === 'optionGroupCode',
    };
    const optionGroupErrors = await harness.validateDryRun(
      optionGroup,
      optionGroupValidationRuleSet,
      'save',
    );
    expect(optionGroupErrors.getError('optionGroupCode')).toStrictEqual([
      'validate.save.OptionGroup.optionGroupCode.required',
    ]);

    // ProductType — `model/validation/ProductType.json:L3`.
    const productType: ProductTypeValidationSubject = {
      ...uniqueEntityAccessors('SlatwallProductType', 'productTypeID', 'stem-type', {}),
      getClassName: () => 'ProductType',
      hasProperty: (identifier: string) => identifier === 'productTypeName',
    };
    const productTypeErrors = await harness.validateDryRun(
      productType,
      productTypeValidationRuleSet,
      'save',
    );
    expect(productTypeErrors.getError('productTypeName')).toStrictEqual([
      'validate.save.ProductType.productTypeName.required',
    ]);

    // Product, Sku, Brand and Product_UpdateSkus are covered by the surrounding cases in this block;
    // the four stems are restated here so all seven appear together and none can drift unnoticed.
    expect(
      buildValidationMessage<ProductValidationSubject>('save', 'Product', 'productName', {
        constraintType: 'required',
        constraintValue: true,
      }),
    ).toBe('validate.save.Product.productName.required');
    expect(
      buildValidationMessage<SkuValidationSubject>('save', 'Sku', 'skuCode', {
        constraintType: 'required',
        constraintValue: true,
      }),
    ).toBe('validate.save.Sku.skuCode.required');
    expect(
      buildValidationMessage<BrandValidationSubject>('save', 'Brand', 'brandName', {
        constraintType: 'required',
        constraintValue: true,
      }),
    ).toBe('validate.save.Brand.brandName.required');
    expect(
      buildValidationMessage<ProductUpdateSkusValidationSubject>(
        'updateSkus',
        'Product_UpdateSkus',
        'price',
        { constraintType: 'required', constraintValue: true },
      ),
    ).toBe(PRICE_REQUIRED_MESSAGE_KEY);
  });

  it('NET-NEW — a dotted property identifier contributes only its LAST segment to the key', () => {
    // `:L208` — `listLast(propertyIdentifier, '._')`. The bag is keyed by the FULL identifier while the
    // MESSAGE names only the leaf, and the two must not be conflated.
    expect(
      buildValidationMessage<ProductValidationSubject>('save', 'Product', 'brand.brandName', {
        constraintType: 'required',
        constraintValue: true,
      }),
    ).toBe('validate.save.Product.brandName.required');
    // An underscore is a delimiter too, which is why the leaf of an underscored identifier is its tail.
    expect(
      buildValidationMessage<ProductValidationSubject>('save', 'Product', 'some_nested_leaf', {
        constraintType: 'required',
        constraintValue: true,
      }),
    ).toBe('validate.save.Product.leaf.required');
  });

  it('NET-NEW — `Product_UpdateSkus` keeps its UNDERSCORED class stem in the raw key', async () => {
    // The class stem is inserted verbatim, so the process object's own underscored name survives into
    // the key — which is what keeps a process-object message distinguishable from the persistent SKU
    // messages that constrain the same two property names.
    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      updateSkusSubject({ updatePriceFlag: 1, updateListPriceFlag: 1, price: 'x', listPrice: 'y' }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );

    expect(errors.getError('price')).toStrictEqual([
      'validate.updateSkus.Product_UpdateSkus.price.dataType.numeric',
    ]);
    expect(errors.getError('listPrice')).toStrictEqual([
      'validate.updateSkus.Product_UpdateSkus.listPrice.dataType.numeric',
    ]);

    // The four exported constants agree with the four keys the engine composes, presence included.
    expect(PRICE_REQUIRED_MESSAGE_KEY).toBe(
      'validate.updateSkus.Product_UpdateSkus.price.required',
    );
    expect(PRICE_DATA_TYPE_MESSAGE_KEY).toBe(
      'validate.updateSkus.Product_UpdateSkus.price.dataType.numeric',
    );
    expect(LIST_PRICE_REQUIRED_MESSAGE_KEY).toBe(
      'validate.updateSkus.Product_UpdateSkus.listPrice.required',
    );
    expect(LIST_PRICE_DATA_TYPE_MESSAGE_KEY).toBe(
      'validate.updateSkus.Product_UpdateSkus.listPrice.dataType.numeric',
    );
    // The class stem in the key is the BARE underscored name — never the `processObject.` classification
    // token, which is a separate concern asserted next.
    expect(PRICE_REQUIRED_MESSAGE_KEY).toContain('.Product_UpdateSkus.');
    expect(PRICE_REQUIRED_MESSAGE_KEY).not.toContain('processObject.');
  });

  it('NET-NEW — the classification token is a SEPARATE concern and is never emitted into a validation key', async () => {
    // `org/Hibachi/HibachiValidationService.cfc:L212-L218` resolves a SECOND, independent token for the
    // subject's own name: `rbKey('entity.#class#')` for a persistent entity and
    // `rbKey('processObject.#class#')` for a transient process object. In the legacy engine that token
    // was substituted INTO the human message; with substitution skipped per D-1, it has no emission
    // point at all, and the realized `Validator` provides no API that produces one.
    //
    // So the classification is derived HERE, locally, purely to assert what the two forms WOULD have
    // been and to prove that neither leaks into the raw keys. Deriving it locally rather than expecting
    // it from the engine is the honest encoding of a member that does not exist.
    expect(legacyClassificationToken('Product', true)).toBe('entity.Product');
    expect(legacyClassificationToken('Sku', true)).toBe('entity.Sku');
    expect(legacyClassificationToken('Brand', true)).toBe('entity.Brand');
    expect(legacyClassificationToken('Option', true)).toBe('entity.Option');
    expect(legacyClassificationToken('OptionGroup', true)).toBe('entity.OptionGroup');
    expect(legacyClassificationToken('ProductType', true)).toBe('entity.ProductType');
    expect(legacyClassificationToken('Product_UpdateSkus', false)).toBe(
      'processObject.Product_UpdateSkus',
    );

    // And no emitted key carries either prefix, for a persistent subject or a transient one.
    const harness = createValidatorHarness();
    const persistent = await harness.validateDryRun(
      buildProduct({}),
      productValidationRuleSet,
      'save',
    );
    const transient = await harness.validateDryRun(
      updateSkusSubject({ updatePriceFlag: 1 }),
      productUpdateSkusValidationRuleSet,
      'updateSkus',
    );

    for (const bag of [persistent, transient]) {
      for (const key of Object.keys(bag.getErrors())) {
        for (const message of bag.getError(key)) {
          expect(message.startsWith('validate.')).toBe(true);
          expect(message).not.toContain('entity.');
          expect(message).not.toContain('processObject.');
        }
      }
    }
  });

  it('NET-NEW — no emitted message ends in `_missing`, and none is a translated sentence', async () => {
    // D-1 reason 3, asserted. The `_missing` suffix is the legacy signal that a bundle lookup FAILED;
    // a raw key must never carry it, because the key is the intended output rather than a failed
    // lookup. A sentence-cased or space-bearing message would mean substitution had been reintroduced.
    const harness = createValidatorHarness([
      { entityName: 'SlatwallProduct', propertyName: 'productCode', value: '', entityID: 'other' },
    ]);
    const bags = [
      await harness.validateDryRun(buildProduct({}), productValidationRuleSet, 'save'),
      await harness.validateDryRun(
        {
          ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'mine', { productCode: '' }),
          getClassName: () => 'Product',
          hasProperty: () => true,
          productCode: '',
        },
        productValidationRuleSet,
        'save',
      ),
      await harness.validateDryRun(
        updateSkusSubject({ updatePriceFlag: 1, updateListPriceFlag: 1 }),
        productUpdateSkusValidationRuleSet,
        'updateSkus',
      ),
      await harness.validateDryRun(buildOption({}), optionValidationRuleSet, 'save'),
      await harness.validateDryRun(buildOptionGroup({}), optionGroupValidationRuleSet, 'save'),
    ];

    let inspected = 0;
    for (const bag of bags) {
      for (const key of Object.keys(bag.getErrors())) {
        for (const message of bag.getError(key)) {
          inspected += 1;
          expect(message.endsWith('_missing')).toBe(false);
          expect(message).not.toContain('_missing');
          // A raw key is dot-delimited with no whitespace and no sentence punctuation.
          expect(message).not.toMatch(/\s/);
          expect(message).not.toMatch(/[.!?]$/);
          expect(message.split('.').length).toBeGreaterThanOrEqual(4);
        }
      }
    }
    // The sweep really did look at messages rather than passing vacuously.
    expect(inspected).toBeGreaterThan(10);
  });
});

describe('NET-NEW — H2. the error bag contract', () => {
  it('NET-NEW — `addError` takes exactly TWO arguments and stores every value as an array', () => {
    // `org/Hibachi/HibachiTransient.cfc:L29-L68` is the BINDING contract for the error bag — the one the
    // validation service actually calls through at `:L224`, `:L228` and `:L232`, always with two
    // arguments. The three-argument override at `org/Hibachi/HibachiEntity.cfc:L151`, which adds a
    // `persistableError` flag, is NEVER reached from a validation path, and the last case in this block
    // proves the port never supplies a third argument either.
    //
    // The buggy direct accessor at `org/Hibachi/HibachiErrors.cfc:L45-L51` is deliberately NOT modelled:
    // it raises where the transient contract returns an empty array, and the transient contract is what
    // the engine binds to.
    const errors = new ValidationError();

    expect(errors.addError).toHaveLength(2);

    errors.addError('productCode', 'validate.save.Product.productCode.required');
    expect(errors.getError('productCode')).toStrictEqual([
      'validate.save.Product.productCode.required',
    ]);
    expect(Array.isArray(errors.getError('productCode'))).toBe(true);
    for (const key of Object.keys(errors.getErrors())) {
      expect(Array.isArray(errors.getError(key))).toBe(true);
    }
  });

  it('NET-NEW — a repeated property key APPENDS rather than replacing', () => {
    // `:L43` — `arrayAppend(variables.errors[propertyName], message)`. This is what lets one property
    // accumulate three findings (section C2) and one property accumulate two method failures
    // (section F5).
    const errors = new ValidationError();
    errors.addError('productCode', 'validate.save.Product.productCode.required');
    errors.addError('productCode', 'validate.save.Product.productCode.unique');
    errors.addError('productCode', 'validate.save.Product.productCode.regex');

    expect(errors.getError('productCode')).toStrictEqual([
      'validate.save.Product.productCode.required',
      'validate.save.Product.productCode.unique',
      'validate.save.Product.productCode.regex',
    ]);
    expect(Object.keys(errors.getErrors())).toStrictEqual(['productCode']);

    // A duplicate message is appended too — the bag is a log, not a set.
    errors.addError('productCode', 'validate.save.Product.productCode.required');
    expect(errors.getError('productCode')).toHaveLength(4);
  });

  it('NET-NEW — `addErrors` merges a whole bag, appending to keys that already hold findings', () => {
    const errors = new ValidationError();
    errors.addError('productCode', 'first');
    errors.addErrors({
      productCode: ['second'],
      urlTitle: ['third', 'fourth'],
    });

    expect(errors.getError('productCode')).toStrictEqual(['first', 'second']);
    expect(errors.getError('urlTitle')).toStrictEqual(['third', 'fourth']);
    expect(Object.keys(errors.getErrors())).toStrictEqual(['productCode', 'urlTitle']);
  });

  it('NET-NEW — `getError` on a MISS returns an empty array and never raises', () => {
    // `:L35-L44` returns an empty array for an unknown property. This is exactly where
    // `org/Hibachi/HibachiErrors.cfc:L45-L51` differs by raising, and the transient behaviour is the
    // one preserved — a caller asking about a clean property must get a usable answer.
    const errors = new ValidationError();

    expect(errors.getError('neverTouched')).toStrictEqual([]);
    expect(() => errors.getError('neverTouched')).not.toThrow();
    expect(errors.hasError('neverTouched')).toBe(false);
    expect(errors.hasErrors()).toBe(false);
    expect(Object.keys(errors.getErrors())).toStrictEqual([]);
  });

  it('NET-NEW — `hasError` is per property while `hasErrors` is the whole bag', () => {
    const errors = new ValidationError();
    expect(errors.hasErrors()).toBe(false);

    errors.addError('price', 'validate.save.Sku.price.required');
    expect(errors.hasError('price')).toBe(true);
    expect(errors.hasError('listPrice')).toBe(false);
    expect(errors.hasErrors()).toBe(true);
  });

  it('NET-NEW — the bag is a real `Error`, so a raising caller can propagate it unchanged', () => {
    // The port's one structural addition, and it is a CAPABILITY rather than a control-flow decision:
    // `BaseService.save` does NOT raise the bag — it attaches the findings to the entity and returns it
    // (section H3, `model/service/HibachiService.cfc:L103`). But a caller that must convert entity-carried
    // findings back into a raise or a serialisable payload can carry the same object across the boundary
    // unchanged, which is exactly what `src/handlers/brandHandler.ts` does when a save comes back with
    // findings. One shape serves as the accumulator, the transport and, at a caller's choosing, the throw.
    const errors = new ValidationError();
    errors.addError('brandName', 'validate.save.Brand.brandName.required');

    expect(errors).toBeInstanceOf(Error);
    expect(errors).toBeInstanceOf(ValidationError);
  });

  it('NET-NEW — no Validator code path ever supplies the entity-only THIRD `persistableError` argument', async () => {
    // `org/Hibachi/HibachiEntity.cfc:L151` widens `addError` with a third flag, and it is used by
    // entity-level persistence bookkeeping rather than by validation. The proof that the engine never
    // reaches it: a recording bag that captures the arity of every call the engine makes.
    const recorded: number[] = [];
    const recording = new ValidationError();
    const realAddError = recording.addError.bind(recording);
    Object.defineProperty(recording, 'addError', {
      value: (...args: readonly [string, string]): void => {
        recorded.push(args.length);
        realAddError(args[0], args[1]);
      },
    });

    const harness = createValidatorHarness([
      { entityName: 'SlatwallProduct', propertyName: 'productCode', value: '', entityID: 'other' },
    ]);
    await harness.validateInto(
      {
        ...uniqueEntityAccessors('SlatwallProduct', 'productID', 'mine', { productCode: '' }),
        getClassName: () => 'Product',
        hasProperty: () => true,
        productCode: '',
      },
      productValidationRuleSet,
      'save',
      recording,
    );

    // Several calls were made, and EVERY one of them passed exactly two arguments.
    expect(recorded.length).toBeGreaterThan(0);
    expect(new Set(recorded)).toStrictEqual(new Set([2]));
    expect(recording.getError('productCode')).toHaveLength(3);
  });

  it('NET-NEW — a caller-supplied bag ACCUMULATES across successive validations of different subjects', async () => {
    // The legacy engine appends into the OBJECT'S OWN bag rather than returning a fresh one, which is
    // what lets a service validate a whole graph and report every finding at once. The port keeps that
    // capability as an explicit caller-supplied bag, so accumulation is a choice at the call site
    // instead of an ambient side effect — and section C4 asserts the default is a fresh, independent bag.
    const shared = new ValidationError();
    shared.addError('preexisting', 'from an earlier pass');

    const harness = createValidatorHarness();

    // First subject: an Option missing every required field.
    await harness.validateInto(buildOption({}), optionValidationRuleSet, 'save', shared);
    expect(shared.getError('optionCode')).toStrictEqual([
      'validate.save.Option.optionCode.required',
    ]);

    // Second subject, SAME bag: an OptionGroup, whose `optionGroupCode` findings land beside them and
    // whose `optionGroupName` opens a new bucket.
    await harness.validateInto(buildOptionGroup({}), optionGroupValidationRuleSet, 'save', shared);
    expect(shared.getError('optionGroupName')).toStrictEqual([
      'validate.save.OptionGroup.optionGroupName.required',
    ]);

    // The earlier finding survived both passes, and the two subjects' findings coexist.
    expect(shared.getError('preexisting')).toStrictEqual(['from an earlier pass']);
    expect(Object.keys(shared.getErrors())).toStrictEqual([
      'preexisting',
      'optionCode',
      'optionName',
      'optionGroup',
      'optionGroupName',
      'optionGroupCode',
    ]);

    // Re-validating the FIRST subject into the same bag APPENDS rather than replacing, because the bag
    // is a log — the same property-level append behaviour asserted above, now at engine level.
    await harness.validateInto(buildOption({}), optionValidationRuleSet, 'save', shared);
    expect(shared.getError('optionCode')).toStrictEqual([
      'validate.save.Option.optionCode.required',
      'validate.save.Option.optionCode.required',
    ]);
  });
});

describe('NET-NEW — H3. validate, gate, then persist', () => {
  /**
   * A `BaseService` over a MANAGED brand, wired entirely from constructor arguments.
   *
   * ⚠️ THE SUBJECT IS `ManagedBrand` AND NOT A BARE `Brand`, WHICH IS A CONTRACT FACT RATHER THAN A TEST
   * CONVENIENCE. `BaseServiceEntity` intersects `EntityErrorSurface`, because
   * `model/service/HibachiService.cfc:L103` returns the entity on every path and the caller then asks it
   * `hasErrors()` — a save with a single exit cannot report a failure unless the entity can carry one.
   * `../../src/domain/product/Brand` is forbidden to declare those six members, so the surface is composed
   * onto the instance, exactly as `../../src/adapters/mysql/rowMappers` and
   * `../../src/ports/repositories/BrandRepository`'s factory do in production. `createManagedBrand` is the
   * whitelisted composition available to this file and it MUTATES AND RETURNS THE SAME OBJECT, so every
   * identity assertion below still compares the reference the caller supplied.
   */
  function brandServiceFixture(uniqueSeeds: readonly UniquePropertyValueSeed[] = []): {
    readonly service: BaseService<ManagedBrand, BrandPropertyName>;
    readonly persistence: ReturnType<typeof createBaseServicePersistenceDouble<ManagedBrand>>;
    readonly unique: ReturnType<typeof createUniquePropertyDouble>;
  } {
    const unique = createUniquePropertyDouble(uniqueSeeds);
    const persistence = createBaseServicePersistenceDouble<ManagedBrand>();
    const service = new BaseService<ManagedBrand, BrandPropertyName>({
      validator: new Validator(unique.uniqueProperty),
      ruleSet: createBrandValidationRules<ManagedBrand>(resolveBrandUniqueTarget),
      propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble({ publicPopulateFlag: true })
        .populationAuthorization,
      ...persistence.seams,
    });
    return { service, persistence, unique };
  }

  /** A brand that satisfies every `Brand.json` save rule. */
  function validBrand(): ManagedBrand {
    return createManagedBrand({
      brandID: 'h3-brand',
      brandName: 'Acme',
      brandWebsite: 'https://acme.example.com',
      urlTitle: 'acme',
    }).brand;
  }

  it('NET-NEW — the Validator ALONE never persists anything', async () => {
    // The separation of concerns, asserted directly: validation is a pure read that produces findings,
    // and the decision to write belongs to the caller. An explicit persistence recorder proves it —
    // validating a subject that WOULD be perfectly savable still causes zero writes.
    const persistence = createBaseServicePersistenceDouble<ManagedBrand>();
    const harness = createValidatorHarness();

    const clean = await harness.validateDryRun(
      validBrand(),
      createBrandValidationRules<ManagedBrand>(resolveBrandUniqueTarget),
      'save',
    );

    expect(clean.hasErrors()).toBe(false);
    expect(persistence.persisted).toStrictEqual([]);
    expect(persistence.removed).toStrictEqual([]);
  });

  it('NET-NEW — an INVALID entity is validated, found wanting, and NOT persisted', async () => {
    // `meta/tests/unit/IssuesTest.cfc:L192-L201` (`issue_1690`) is the documentary precedent for this
    // sequence: construct, `validate(context="save")`, then save ONLY `if(!product.hasErrors())`. That
    // test was read from source and is cited as precedent — it was NOT executed here, because MXUnit is
    // not vendered in this checkout and no CFML runtime exists (see the file header).
    const { service, persistence } = brandServiceFixture();
    const invalid = createManagedBrand({ brandID: 'h3-invalid' }).brand;

    // ⭐ THE MEMBER RESOLVES, IT DOES NOT REJECT, AND IT HANDS BACK THE SAME ENTITY.
    // `model/service/HibachiService.cfc:L103` is the single exit of the local override and it returns
    // `arguments.entity` whether validation passed or failed, because
    // `org/Hibachi/HibachiTransient.cfc:L408-L459` wrote the findings into the entity's own bag and never
    // cleared them. So the findings are read OFF THE RETURNED BRAND, which is the same question
    // `issue_1690`'s `if(!product.hasErrors())` asks.
    //
    // ⚠️ AN EARLIER REVISION OF THIS CASE ASSERTED A REJECTION AND CALLED IT "ADAPTED TO THE REALIZED
    // CONTRACT". The realized contract was the thing that was wrong: `BaseService.save` raised, which
    // inverted the polarity of the only failure signal the legacy offered and changed the published
    // contract of `BrandService.saveBrand`. Certifying the divergence in a test is what let it survive, so
    // this case now pins the legacy shape instead.
    const saved = await service.save(invalid);

    expect(saved).toBe(invalid);
    expect(saved.hasErrors()).toBe(true);
    expect(saved.getError('brandName')).toStrictEqual(['validate.save.Brand.brandName.required']);
    expect(saved.getError('urlTitle')).toStrictEqual(['validate.save.Brand.urlTitle.required']);

    // NOTHING was persisted. This is the gate.
    expect(persistence.persisted).toStrictEqual([]);
  });

  it('NET-NEW — a VALID entity is persisted, and the SAME reference comes back', async () => {
    const { service, persistence } = brandServiceFixture();
    const brand = validBrand();

    const saved = await service.save(brand);

    expect(persistence.persisted).toHaveLength(1);
    expect(first(persistence.persisted)).toBe(brand);
    expect(saved).toBe(brand);
  });

  it('NET-NEW — persistence happens only AFTER the bag reports clean, proved by a uniqueness collision', async () => {
    // A subject that passes every presence and type rule but collides on `urlTitle` still must not be
    // written. The gate is `!hasErrors()`, not "the shape looked right".
    const { service, persistence } = brandServiceFixture([
      {
        entityName: 'SlatwallBrand',
        propertyName: 'urlTitle',
        value: 'acme',
        entityID: 'some-other-brand',
      },
    ]);

    const saved = await service.save(validBrand());

    expect(saved.hasErrors()).toBe(true);
    expect(saved.getError('urlTitle')).toStrictEqual(['validate.save.Brand.urlTitle.unique']);
    expect(persistence.persisted).toStrictEqual([]);
  });

  it('NET-NEW — `save` defaults its context to `save` and FORWARDS an explicit caller override', async () => {
    // The default is what makes `Brand.json`'s `save`-context rules fire for a plain `save(entity)`
    // call. The forwarding is what lets a process-driven caller validate under its own context — and it
    // is observable in the emitted key, which carries the context verbatim.
    const defaulted = brandServiceFixture();
    const defaultedBrand = await defaulted.service.save(
      createManagedBrand({ brandID: 'h3-default' }).brand,
    );
    expect(defaultedBrand.getError('brandName')).toStrictEqual([
      'validate.save.Brand.brandName.required',
    ]);

    // Under an override the `save`-context rules are NOT selected, so a brand that would fail on save
    // passes — and is persisted, because the bag is genuinely clean under that context.
    const overridden = brandServiceFixture();
    const bare = createManagedBrand({ brandID: 'h3-override' }).brand;
    const savedBare = await overridden.service.save(bare, {}, 'edit');
    expect(savedBare).toBe(bare);
    expect(savedBare.hasErrors()).toBe(false);
    expect(overridden.persistence.persisted).toStrictEqual([bare]);
  });

  it('NET-NEW — `delete` validates under the HARD-CODED `delete` context and returns a boolean', async () => {
    // The realized `delete(entity)` takes NO context parameter — the context is fixed, which is the
    // right shape because a delete can only ever be a delete. It also NEVER raises: it answers `false`
    // and leaves the row alone, which is a second deliberate divergence from `save` and is asserted
    // rather than assumed.
    const clean = brandServiceFixture();
    const deletable = createManagedBrand({
      brandID: 'h3-deletable',
      brandName: 'Gone',
      urlTitle: 'gone',
    }).brand;

    await expect(clean.service.delete(deletable)).resolves.toBe(true);
    expect(clean.persistence.removed).toStrictEqual([deletable]);

    // A brand holding a product trips the `Brand.json:L6` delete guard.
    const guarded = brandServiceFixture();
    const held = createManagedBrand({
      brandID: 'h3-held',
      brandName: 'Held',
      urlTitle: 'held',
    }).brand;
    held.getProducts().push(buildProduct({ productID: 'h3-held-product' }));

    await expect(guarded.service.delete(held)).resolves.toBe(false);
    expect(guarded.persistence.removed).toStrictEqual([]);
  });

  it('NET-NEW — the delete gate consults the `delete` rules and NOT the `save` rules', async () => {
    // A brand missing every required save field is still DELETABLE, because `Brand.json` scopes those
    // presence rules to `save`. If `delete` reused the save context, no incomplete row could ever be
    // removed — a real operational trap that the hard-coded context avoids.
    const { service, persistence } = brandServiceFixture();
    const incomplete = createManagedBrand({ brandID: 'h3-incomplete' }).brand;

    await expect(service.delete(incomplete)).resolves.toBe(true);
    expect(persistence.removed).toStrictEqual([incomplete]);
  });
});
