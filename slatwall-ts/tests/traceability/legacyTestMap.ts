// ---------------------------------------------------------------------------
// THE MACHINE-READABLE STRUCTURAL COVERAGE FLOOR, AND THE LEGACY-EXTENDED vs
// NET-NEW LEDGER.
//
// This module is the target-side replacement for
// `meta/tests/coverage/EntityCoverageTest.cfc`, mandated by AAP 0.3.1 (the layout
// entry "machine-readable legacy-extended vs net-new map"), AAP 0.4.1 (a REFERENCE
// transformation from that legacy component - "Mirrors the structural coverage
// floor, machine-readably"), AAP 0.6.6 ("the structural floor asserted by
// `EntityCoverageTest.all_entities_have_test_cases()` is mirrored by
// `tests/traceability/legacyTestMap.ts`, which fails when an in-scope module has no
// test") and AAP 0.9.4 (the gate: "fails the suite when an in-scope module has no
// corresponding test", "The legacy-extended versus net-new split is explicit and
// accurate ... Presenting net-new coverage as parity fails this gate", and "The
// empty legacy stub stays acknowledged, not counted").
//
// ★ WHY THE MAP AND THE ASSERTIONS SHARE ONE MODULE. `vitest.config.ts` collects
// three globs, and this folder's is the one WITHOUT the `*.test.ts` infix:
// `tests/traceability/**/*.ts`. So this file is collected under its own fixed name,
// no companion suite is needed, and no configuration change was made or is wanted.
// The same configuration sets `passWithNoTests: false`, which means a file collected
// here that registers no suite is a hard failure - the data and the assertions
// therefore have to live together, and they do.
//
// ★ EVERY NUMBER BELOW IS DERIVED FROM THE WORKING TREE, NEVER RESTATED FROM A
// PLAN. The map declares provenance; the assertions enumerate `src/` and `tests/`
// with Node's own directory reader and compare the two. A mismatch fails and names
// the offending module or suite, rather than reporting a count that a reader has to
// reconcile by hand. Three consequences are deliberate:
//   * a source module added without coverage fails this file, which is the whole
//     point of a floor;
//   * an entry naming a module or suite that does not exist fails too, so the map
//     cannot rot into fiction;
//   * an absent directory raises rather than yielding an empty list, so no
//     assertion here can pass vacuously.
//
// ★ THE LEGACY FLOOR THIS FILE REPLACES COULD NEVER HAVE PASSED HONESTLY, AND THAT
// IS WHY THE ANTI-VACUITY RULE ABOVE IS NOT DECORATIVE:
//
// LEGACY-DEFECT [meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54]: the entity directory is resolved from `expandPath("/Slatwall/com/entity/")`, a path that does not exist in the distribution - the entities live in `model/entity/` - so the enumeration it feeds was always empty.
// Preserved deliberately; do not fix without a product decision.
//
// LEGACY-DEFECT [meta/tests/coverage/EntityCoverageTest.cfc:L69]: the empty-remainder comparison can therefore only ever have succeeded vacuously, because the list it subtracts from was built from that empty enumeration.
// Preserved deliberately; do not fix without a product decision.
//
// Verified first-hand rather than inferred: `model/entity/` holds 113 components,
// `com/entity/` is absent from the checkout, and `meta/tests/unit/entity/` holds
// eleven entity suites plus their shared base. The legacy tier could not have been
// comparing those two sets. Both markers are reproduced above as annotations on
// reference material; neither legacy file is modified, and this module fixes
// nothing in them - it simply does the job they were written to do, against the
// directories that actually exist.
//
// ★ AN ASYMMETRY IN HOW LOCATORS ARE ASSERTED, AND IT IS PRINCIPLED. The legacy
// tree is frozen - zero existing repository files are modified by this migration -
// so a legacy locator is stable and IS asserted by line number: the assertions read
// the cited line and require the cited declaration to be on it. The target tree is
// live and still being extended, so a target locator would rot; target symbols are
// therefore asserted by their DECLARATION TEXT, which survives an edit above it.
// Line numbers for target symbols appear nowhere in this file.
//
// ★ TRACEABILITY HERE MEANS THE SAME ASSERTIONS, NOT THE SAME ARCHITECTURE. Every
// legacy "unit" test boots the whole application: `meta/tests/unit/SlatwallUnitTestBase.cfc:L52`
// constructs the real application component, `:L60` boots the object-relational and
// injection containers before EVERY test, `:L62` elevates the ambient account, and
// the lifecycle teardown at `:L70` is commented out, as is the reload at `:L53`;
// `meta/tests/RemoteFacade.cfc:L53` reloads the entire application inside the run
// hook. Nothing in that tier is isolated and nothing is torn down. The target tier
// is genuinely isolated. So this map records carried ASSERTIONS - the same claim
// about the same behaviour - and never claims the harness was carried.
//
// ★ NO USER-SPECIFIED RULES WERE PROVIDED, and the five consequences hold at full
// strength: (1) none were provided; (2) the absence was verified rather than
// assumed, the rules source returning exactly `No user rules provided.`, matching
// AAP 0.7 independently; (3) no rule may be invented to fill the gap; (4) the
// absence is NOT licence to lower the bar, so the enterprise-standard substitute
// applies in full; (5) zero files enter scope by rule mandate - this file traces to
// AAP 0.3.1, 0.4.1, 0.6.6 and 0.9.4, with no third rule-driven category and no rule
// conflict to resolve.
//
// ★ THIS FILE IS 100% NET-NEW COVERAGE and must never be presented as parity. Its
// legacy antecedent is a component that could not run; what is carried forward is
// its INTENT, recorded at `meta/tests/readme.txt:L14` - a minimal level of testing
// whenever a new component is added.
//
// PLANNED VERSUS ACTUAL, recorded because the difference is material and a reader
// will otherwise trip over it. The layout in AAP 0.3.1 implies eight handler
// modules; THREE exist - `bootstrap.ts`, `router.ts` and `errorMapper.ts` - the five
// capability handlers not having been delivered at this checkpoint. One module
// exists beyond that layout, `src/integrations/europeanCentralBankCurrencyConverter.ts`.
// Coverage runs BOTH ways against that plan. It exceeds it in three places:
// `lib/logger.ts`, `repositories/mysql/connection.ts` and
// `sql/skusBySelectedOptions.sql.ts` each own a dedicated suite that the planned
// layout did not budget for. It falls short of the planned eight handler suites,
// because only three handler modules exist at all - two of them own a suite, and
// the third, `router.ts`, is in the pending register below with its planned path
// named. Because the assertions derive their census from disk, none of that drift
// needs to be reconciled by hand; it is recorded here so the drift itself is
// visible.
//
// The composition root's own promotion is the worked example of how this register is
// meant to move. `src/handlers/bootstrap.ts` sat in `pendingModules` with
// `tests/unit/handlers/bootstrap.test.ts` named as its planned path; that suite now
// exists, so the entry was deleted and the module appears in `coveredModules`
// instead. Authoring the suite WITHOUT making that move fails four assertions - two
// in A9, because a pending module would then own a suite named after it and a
// planned path would exist on disk, and two in A14, because the suite census would
// no longer balance. That coupling is deliberate: it is what stops coverage being
// added without being declared, and stops the register going stale in silence.
//
// JUDGMENT CALL: the module census is partitioned THREE ways - covered, exempt and
// pending - where a two-way split would have been simpler. Folding a module that is
// merely OWED coverage into the "exempt" category is precisely the false-parity
// failure AAP 0.9.4 forbids, and a strict two-way gate would instead fail this
// suite today over work that belongs to a boundary not yet delivered. Separating
// "deliberately not directly tested, because it is exercised through something that
// is" from "not yet covered, with a named owner and a planned path" is the honest
// resolution. The pending register is self-tightening: an assertion requires each
// planned path to be ABSENT, so the moment a boundary lands its suite the entry
// must be removed or this file fails.
//
// What is NOT here: no assertion about any legacy runtime, no database, no network,
// no environment read, no schema statement, and no claim about how long anything
// takes. This module reads files and compares sets.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Dirent } from 'node:fs';

// --- Anchoring -------------------------------------------------------------
//
// Both roots are resolved from this module's own location and then PROVEN, because
// every assertion below reads the tree relative to them. A wrong anchor would make
// each directory listing empty, and an empty listing is exactly how a coverage floor
// stops meaning anything - which is what happened to the legacy component this file
// replaces.

const THIS_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SUBTREE_ROOT = path.resolve(THIS_DIRECTORY, '..', '..');
const REPOSITORY_ROOT = path.resolve(SUBTREE_ROOT, '..');

function requireAnchor(absolute: string, description: string): void {
  if (!existsSync(absolute)) {
    throw new Error(
      `legacyTestMap could not anchor itself: expected ${description} at ${absolute}. The map ` +
        'reads the working tree directly, so a wrong anchor must fail loudly rather than ' +
        'silently enumerate nothing.',
    );
  }
}

requireAnchor(path.join(SUBTREE_ROOT, 'package.json'), 'the subtree manifest');
requireAnchor(path.join(SUBTREE_ROOT, 'vitest.config.ts'), 'the runner configuration');
requireAnchor(path.join(REPOSITORY_ROOT, 'version.txt'), 'the legacy release marker');
requireAnchor(path.join(REPOSITORY_ROOT, 'model', 'entity'), 'the legacy entity directory');

// --- Readers ---------------------------------------------------------------
//
// Node built-ins only: no glob dependency is added, and the fourteen pinned packages
// are untouched. Every reader raises on absence.

function listTypeScriptFiles(relativeDirectory: string): string[] {
  const absolute = path.join(SUBTREE_ROOT, relativeDirectory);
  let entries: Dirent[];
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch (cause) {
    throw new Error(`legacyTestMap expected a directory that is missing: ${relativeDirectory}`, {
      cause,
    });
  }

  const found: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listTypeScriptFiles(relative));
    } else if (entry.name.endsWith('.ts')) {
      found.push(relative);
    }
  }
  return found.sort();
}

function readSubtreeFile(relativePath: string): string {
  try {
    return readFileSync(path.join(SUBTREE_ROOT, relativePath), 'utf8');
  } catch (cause) {
    throw new Error(`legacyTestMap expected a subtree file that is missing: ${relativePath}`, {
      cause,
    });
  }
}

function readRepositoryFile(relativePath: string): string {
  try {
    return readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
  } catch (cause) {
    throw new Error(`legacyTestMap expected a legacy file that is missing: ${relativePath}`, {
      cause,
    });
  }
}

const subtreeFileExists = (relativePath: string): boolean =>
  existsSync(path.join(SUBTREE_ROOT, relativePath));

// Counts lines the way a reader counts them: a file that ends with a line terminator
// has that many lines, not one more. Getting this wrong would make every recorded
// legacy line count off by one and the drift assertions meaningless.
function countLines(contents: string): number {
  const lines = contents.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
}

// Reads one 1-based line out of a file, so a cited legacy locator can be checked
// against what is actually on that line.
function repositoryLine(relativePath: string, oneBasedLine: number): string {
  const lines = readRepositoryFile(relativePath).split('\n');
  return lines[oneBasedLine - 1] ?? '';
}

// --- Derived census --------------------------------------------------------

const SOURCE_MODULES_ON_DISK = listTypeScriptFiles('src');
const TEST_FILES_ON_DISK = listTypeScriptFiles('tests').filter((file) => file.endsWith('.test.ts'));

// A module carries runtime code if it exports at least one VALUE. A module whose
// exports are all `interface` or `type` emits no JavaScript at all, so there is
// nothing in it to execute and a dedicated suite could assert nothing beyond what
// the compiler already proves. That is the mechanical basis for every type-only
// exemption below, and it is re-derived here rather than trusted from the map.
const RUNTIME_VALUE_EXPORT =
  /^export\s+(?:async\s+)?(?:function|class|const|let|var|default|abstract|enum)\b/m;

type ModuleKind = 'runtime' | 'typeOnly';

const derivedKindOf = (module: string): ModuleKind =>
  RUNTIME_VALUE_EXPORT.test(readSubtreeFile(module)) ? 'runtime' : 'typeOnly';

// The specifier a consumer of `module` would write, as its parent directory plus its
// file name with the emitted extension. `tsconfig.json` carries no
// `allowImportingTsExtensions`, so `.js` is the only form that resolves, and two
// segments is enough to be unambiguous across the whole subtree.
function importSpecifierFor(module: string): string {
  const segments = module.split('/');
  const parent = segments[segments.length - 2] ?? '';
  return `${parent}/${path.basename(module, '.ts')}.js`;
}

const expectedSuiteNameFor = (module: string): string => `${path.basename(module, '.ts')}.test.ts`;

// --- The shapes the map declares -------------------------------------------
//
// Declared locally and deliberately NOT exported: this module exports exactly one
// unit, the map itself. There is no barrel here, no default export, and no exported
// helper for another file to lean on.

type Lineage = 'legacy-extended' | 'net-new';

/** A runtime module with a dedicated suite of its own. The floor's positive case. */
interface CoveredModule {
  readonly module: string;
  readonly test: string;
}

/** Where an exempt module is nonetheless exercised, and the text that proves it. */
interface ExerciseProof {
  readonly path: string;
  readonly evidence: string;
}

/**
 * A module with no dedicated suite BY DESIGN. A type-only module carries no runtime
 * proof because it emits nothing; a runtime module must name at least one proof
 * under `tests/`, or the exemption is an unbacked claim.
 */
interface ExemptModule {
  readonly module: string;
  readonly kind: ModuleKind;
  readonly reason: string;
  readonly exercisedBy: readonly ExerciseProof[];
}

/** A runtime module that is OWED coverage, with the boundary that owes it. */
interface PendingModule {
  readonly module: string;
  readonly owningBoundary: string;
  readonly reason: string;
  readonly plannedCoverage: readonly string[];
}

/** A suite that pins something without being any single module's dedicated suite. */
interface SupplementarySuite {
  readonly test: string;
  readonly subject: string;
  readonly reason: string;
}

/** A target suite that carries assertions forward from a legacy component. */
interface LegacyExtendedSuite {
  readonly test: string;
  readonly module: string;
  readonly legacyAntecedent: string;
  readonly carriedCaseName: string;
  readonly carriedCaseSpan: readonly [number, number];
  readonly totalLegacyCases: number;
  readonly caseArithmetic: string;
  readonly carriedFixtures: readonly string[];
}

/** A legacy test component that bears on this slice, and what it contributes. */
interface LegacyAntecedent {
  readonly file: string;
  readonly lineCount: number;
  readonly declaredCases: readonly { readonly name: string; readonly line: number }[];
  readonly contributesCoverage: boolean;
  readonly note: string;
}

/** A legacy regression case whose claim is recorded somewhere in the target. */
interface RoutedIssueCase {
  readonly caseName: string;
  readonly legacyLine: number;
  readonly recordedIn: readonly string[];
  readonly note: string;
}

/** A legacy TODO carried across as a TODO rather than silently completed. */
interface PreservedTodo {
  readonly reference: string;
  readonly legacyFile: string;
  readonly legacyLine: number;
  readonly legacyEvidence: string;
  readonly recordedIn: readonly string[];
  readonly recordedEvidence: string;
}

/** One entry in a fixed interface-parity budget. */
interface ParityEntry {
  readonly symbol: string;
  readonly module: string;
  readonly declaration: string;
  readonly legacyLocator: string;
}

/** A divergence from the source that was taken deliberately and is owned somewhere. */
interface DivergenceEntry {
  readonly summary: string;
  readonly citation: string;
  readonly owningModule: string;
}

/** A preserved-defect citation that must remain annotated in a named module. */
interface RequiredCitation {
  readonly citation: string;
  readonly owningModule: string;
  readonly summary: string;
}

/** Coverage this migration does NOT have, stated so it is never counted as parity. */
interface AcknowledgedGap {
  readonly subject: string;
  readonly coverageContribution: 0;
  readonly note: string;
}

/** A legacy harness trait deliberately not reproduced. */
interface HarnessTraitNotCarried {
  readonly locator: string;
  readonly trait: string;
  readonly whyNotCarried: string;
}

// --- Shared justifications -------------------------------------------------
//
// Three reasons are shared verbatim by groups of rows below. They are hoisted so the
// wording is written once and cannot drift row to row; the rows themselves stay
// individually enumerated, because an enumeration is what makes the map checkable.
//
// A fourth once stood here, shared by the six promotion-decomposition modules that were
// owed a suite and had none. All nine of the decomposition modules now own a dedicated
// suite, so the reason has no rows left to serve and is gone rather than kept as dead
// prose - which is the register shrinking exactly as it was built to.

const PORT_EXEMPTION =
  'A repository or collaborator port: an interface declaration with no value export, so ' +
  'nothing is emitted to execute. Conformance is proven at every implementation and at ' +
  'every consumer suite that supplies a substitute for it.';

const ENGINE_TYPE_EXEMPTION =
  'A promotion-engine type contract. It types the structures the engine threads through ' +
  'itself and emits nothing; the structures are asserted where the engine builds them.';

const ORDER_VIEW_EXEMPTION =
  'A read-only order-shaped input type. It is the anti-corruption boundary that lets an ' +
  'out-of-scope aggregate drive an in-scope engine, and it emits nothing; the shapes are ' +
  'built and asserted by the order fixtures and the engine suites.';

// --- The map ---------------------------------------------------------------

export const LEGACY_TEST_MAP: {
  readonly coveredModules: readonly CoveredModule[];
  readonly namingExceptions: readonly CoveredModule[];
  readonly exemptModules: readonly ExemptModule[];
  readonly pendingModules: readonly PendingModule[];
  readonly supplementarySuites: readonly SupplementarySuite[];
  readonly legacyExtendedSuites: readonly LegacyExtendedSuite[];
  readonly legacyAntecedents: readonly LegacyAntecedent[];
  readonly routedIssueCases: readonly RoutedIssueCase[];
  readonly preservedTodos: readonly PreservedTodo[];
  readonly visibilityWidenings: readonly ParityEntry[];
  readonly signatureReshapings: readonly ParityEntry[];
  readonly entityLayerWidenings: readonly ParityEntry[];
  readonly deliberateDivergences: readonly DivergenceEntry[];
  readonly requiredDefectCitations: readonly RequiredCitation[];
  readonly acknowledgedGaps: readonly AcknowledgedGap[];
  readonly harnessTraitsNotCarried: readonly HarnessTraitNotCarried[];
  readonly defaultLineage: Lineage;
} = {
  // Every runtime module that owns a suite named after it. Enumerated rather than
  // globbed, because an enumeration is checkable and a glob is not.
  coveredModules: [
    // Both entries below were authored to close the two Test Assurance Gaps a security
    // review recorded. `src/handlers/bootstrap.ts` moved up out of `pendingModules`,
    // where its suite was already named as owed; `src/lib/config.ts` moved up out of
    // `exemptModules`, where it had been recorded as needing no suite of its own.
    //
    // THE SECOND MOVE IS A CORRECTION, NOT JUST AN ADDITION. That exemption read that
    // the module "has no behaviour of its own to pin beyond reading the environment",
    // and it was true when written. Findings S-15 and S-20 then moved two security
    // decisions into it - the product-feed host allow-list and the currency rate
    // table, each with its own validation and refusal paths - so the module acquired
    // exactly the behaviour the exemption denied it had. Leaving the exemption in place
    // would have let a register whose purpose is to find uncovered behaviour assert
    // that none existed.
    { module: 'src/handlers/bootstrap.ts', test: 'tests/unit/handlers/bootstrap.test.ts' },
    { module: 'src/lib/config.ts', test: 'tests/unit/lib/config.test.ts' },
    { module: 'src/domain/entities/brand.ts', test: 'tests/unit/domain/entities/brand.test.ts' },
    {
      module: 'src/domain/entities/category.ts',
      test: 'tests/unit/domain/entities/category.test.ts',
    },
    { module: 'src/domain/entities/option.ts', test: 'tests/unit/domain/entities/option.test.ts' },
    {
      module: 'src/domain/entities/optionGroup.ts',
      test: 'tests/unit/domain/entities/optionGroup.test.ts',
    },
    {
      module: 'src/domain/entities/priceGroup.ts',
      test: 'tests/unit/domain/entities/priceGroup.test.ts',
    },
    {
      module: 'src/domain/entities/priceGroupRate.ts',
      test: 'tests/unit/domain/entities/priceGroupRate.test.ts',
    },
    {
      module: 'src/domain/entities/product.ts',
      test: 'tests/unit/domain/entities/product.test.ts',
    },
    {
      module: 'src/domain/entities/productType.ts',
      test: 'tests/unit/domain/entities/productType.test.ts',
    },
    {
      module: 'src/domain/entities/promotion.ts',
      test: 'tests/unit/domain/entities/promotion.test.ts',
    },
    {
      module: 'src/domain/entities/promotionAccount.ts',
      test: 'tests/unit/domain/entities/promotionAccount.test.ts',
    },
    {
      module: 'src/domain/entities/promotionApplied.ts',
      test: 'tests/unit/domain/entities/promotionApplied.test.ts',
    },
    {
      module: 'src/domain/entities/promotionCode.ts',
      test: 'tests/unit/domain/entities/promotionCode.test.ts',
    },
    {
      module: 'src/domain/entities/promotionPeriod.ts',
      test: 'tests/unit/domain/entities/promotionPeriod.test.ts',
    },
    {
      module: 'src/domain/entities/promotionQualifier.ts',
      test: 'tests/unit/domain/entities/promotionQualifier.test.ts',
    },
    {
      module: 'src/domain/entities/promotionReward.ts',
      test: 'tests/unit/domain/entities/promotionReward.test.ts',
    },
    {
      module: 'src/domain/entities/roundingRule.ts',
      test: 'tests/unit/domain/entities/roundingRule.test.ts',
    },
    { module: 'src/domain/entities/sku.ts', test: 'tests/unit/domain/entities/sku.test.ts' },
    {
      module: 'src/domain/entities/skuCurrency.ts',
      test: 'tests/unit/domain/entities/skuCurrency.test.ts',
    },
    {
      module: 'src/domain/valueObjects/currencyCode.ts',
      test: 'tests/unit/domain/valueObjects/currencyCode.test.ts',
    },
    {
      module: 'src/domain/valueObjects/materializedIdPath.ts',
      test: 'tests/unit/domain/valueObjects/materializedIdPath.test.ts',
    },
    {
      module: 'src/domain/valueObjects/money.ts',
      test: 'tests/unit/domain/valueObjects/money.test.ts',
    },
    { module: 'src/handlers/errorMapper.ts', test: 'tests/unit/handlers/errorMapper.test.ts' },
    {
      module: 'src/integrations/europeanCentralBankCurrencyConverter.ts',
      test: 'tests/unit/integrations/europeanCentralBankCurrencyConverter.test.ts',
    },
    {
      module: 'src/integrations/google/googleFeedRepository.ts',
      test: 'tests/unit/integrations/google/googleFeedRepository.test.ts',
    },
    {
      module: 'src/integrations/google/googleFeedService.ts',
      test: 'tests/unit/integrations/google/googleFeedService.test.ts',
    },
    {
      module: 'src/integrations/google/integration.ts',
      test: 'tests/unit/integrations/google/integration.test.ts',
    },
    {
      module: 'src/integrations/google/rssFeedRenderer.ts',
      test: 'tests/unit/integrations/google/rssFeedRenderer.test.ts',
    },
    { module: 'src/lib/cfml/list.ts', test: 'tests/unit/lib/cfml/list.test.ts' },
    { module: 'src/lib/cfml/numberFormat.ts', test: 'tests/unit/lib/cfml/numberFormat.test.ts' },
    { module: 'src/lib/cfml/precision.ts', test: 'tests/unit/lib/cfml/precision.test.ts' },
    { module: 'src/lib/cfml/struct.ts', test: 'tests/unit/lib/cfml/struct.test.ts' },
    { module: 'src/lib/cfml/truthiness.ts', test: 'tests/unit/lib/cfml/truthiness.test.ts' },
    { module: 'src/lib/logger.ts', test: 'tests/unit/lib/logger.test.ts' },
    {
      module: 'src/repositories/mysql/connection.ts',
      test: 'tests/unit/repositories/connection.test.ts',
    },
    {
      module: 'src/repositories/mysql/mysqlOptionRepository.ts',
      test: 'tests/integration/repositories/mysqlOptionRepository.test.ts',
    },
    {
      module: 'src/repositories/mysql/mysqlPriceGroupRepository.ts',
      test: 'tests/integration/repositories/mysqlPriceGroupRepository.test.ts',
    },
    {
      module: 'src/repositories/mysql/mysqlProductRepository.ts',
      test: 'tests/integration/repositories/mysqlProductRepository.test.ts',
    },
    {
      module: 'src/repositories/mysql/mysqlProductTypeRepository.ts',
      test: 'tests/integration/repositories/mysqlProductTypeRepository.test.ts',
    },
    {
      module: 'src/repositories/mysql/mysqlPromotionRepository.ts',
      test: 'tests/integration/repositories/mysqlPromotionRepository.test.ts',
    },
    {
      module: 'src/repositories/mysql/mysqlSkuRepository.ts',
      test: 'tests/integration/repositories/mysqlSkuRepository.test.ts',
    },
    {
      module: 'src/repositories/mysql/sql/skusBySelectedOptions.sql.ts',
      test: 'tests/integration/repositories/skusBySelectedOptions.test.ts',
    },
    { module: 'src/services/brandService.ts', test: 'tests/unit/services/brandService.test.ts' },
    { module: 'src/services/optionService.ts', test: 'tests/unit/services/optionService.test.ts' },
    {
      module: 'src/services/priceGroupService.ts',
      test: 'tests/unit/services/priceGroupService.test.ts',
    },
    {
      module: 'src/services/productService.ts',
      test: 'tests/unit/services/productService.test.ts',
    },
    {
      module: 'src/services/promotion/discountAmount.ts',
      test: 'tests/unit/services/promotion/discountAmount.test.ts',
    },
    {
      module: 'src/services/promotion/orderItemMembership.ts',
      test: 'tests/unit/services/promotion/orderItemMembership.test.ts',
    },
    {
      module: 'src/services/promotion/overUseStripping.ts',
      test: 'tests/unit/services/promotion/overUseStripping.test.ts',
    },
    {
      module: 'src/services/promotion/promotionApplication.ts',
      test: 'tests/unit/services/promotion/promotionApplication.test.ts',
    },
    {
      module: 'src/services/promotion/promotionPeriodQualification.ts',
      test: 'tests/unit/services/promotion/promotionPeriodQualification.test.ts',
    },
    {
      module: 'src/services/promotion/qualifierQualification.ts',
      test: 'tests/unit/services/promotion/qualifierQualification.test.ts',
    },
    {
      module: 'src/services/promotion/rewardUsageLedger.ts',
      test: 'tests/unit/services/promotion/rewardUsageLedger.test.ts',
    },
    {
      module: 'src/services/promotion/salePriceSeeding.ts',
      test: 'tests/unit/services/promotion/salePriceSeeding.test.ts',
    },
    {
      module: 'src/services/promotion/twoPassRewardIterator.ts',
      test: 'tests/unit/services/promotion/twoPassRewardIterator.test.ts',
    },
    {
      module: 'src/services/promotionService.ts',
      test: 'tests/unit/services/promotionService.test.ts',
    },
    {
      module: 'src/services/roundingRuleService.ts',
      test: 'tests/unit/services/roundingRuleService.test.ts',
    },
    { module: 'src/services/skuService.ts', test: 'tests/unit/services/skuService.test.ts' },
  ],

  // Every covered module's suite is named after it, with exactly ONE declared
  // exception: the SQL module drops its `.sql` infix. Declaring the exception rather
  // than loosening the convention keeps the convention itself assertable.
  namingExceptions: [
    {
      module: 'src/repositories/mysql/sql/skusBySelectedOptions.sql.ts',
      test: 'tests/integration/repositories/skusBySelectedOptions.test.ts',
    },
  ],

  // Modules with no dedicated suite BY DESIGN, in two kinds.
  //
  // The twenty type-only modules are exempt mechanically, not by assertion: a module
  // whose every export is an `interface` or a `type` emits no JavaScript, so there is
  // no behaviour for a suite to pin that the compiler has not already proven. The
  // `kind` recorded on each row is re-derived from the module's own source text below,
  // so mislabelling a module that does carry runtime code fails the gate.
  //
  // The six runtime modules are exempt only because each is exercised THROUGH a suite
  // that owns something else, and each names at least one path plus the text that
  // proves it. An exemption with no proof is an unbacked claim, so the gate rejects it.
  exemptModules: [
    {
      module: 'src/domain/ports/addressZoneEvaluator.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/currencyConverter.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/imageStore.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/optionRepository.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/priceGroupRepository.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/productFeedPort.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/productRepository.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/productTypeRepository.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/promotionRepository.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/settingsProvider.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/skuRepository.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/subscriptionTermProvider.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/ports/urlTitleGenerator.ts',
      kind: 'typeOnly',
      reason: PORT_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/promotionEngine/qualificationTypes.ts',
      kind: 'typeOnly',
      reason: ENGINE_TYPE_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/promotionEngine/qualifiedDiscountTypes.ts',
      kind: 'typeOnly',
      reason: ENGINE_TYPE_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/promotionEngine/rewardUsageTypes.ts',
      kind: 'typeOnly',
      reason: ENGINE_TYPE_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/views/orderFulfillmentView.ts',
      kind: 'typeOnly',
      reason: ORDER_VIEW_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/views/orderItemView.ts',
      kind: 'typeOnly',
      reason: ORDER_VIEW_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/domain/views/orderView.ts',
      kind: 'typeOnly',
      reason: ORDER_VIEW_EXEMPTION,
      exercisedBy: [],
    },
    {
      module: 'src/integrations/integrationInterface.ts',
      kind: 'typeOnly',
      reason:
        'The five-method adapter contract, declared as types only. Conformance is proven ' +
        'where the Google adapter implements it, not here.',
      exercisedBy: [],
    },
    {
      module: 'src/repositories/mysql/dialect.ts',
      kind: 'runtime',
      reason:
        'The explicit replacement for the legacy database-product probe. Its one decision - ' +
        'which dialect fragment a statement receives - is asserted at the statements ' +
        'themselves, where a wrong choice is observable as wrong SQL.',
      exercisedBy: [
        {
          path: 'tests/integration/repositories/mysqlPriceGroupRepository.test.ts',
          evidence: 'mysql/dialect.js',
        },
        {
          path: 'tests/integration/repositories/mysqlPromotionRepository.test.ts',
          evidence: 'mysql/dialect.js',
        },
        {
          path: 'tests/integration/repositories/mysqlSkuRepository.test.ts',
          evidence: 'mysql/dialect.js',
        },
      ],
    },
    {
      module: 'src/repositories/mysql/sql/accountSubscriptionPriceGroups.sql.ts',
      kind: 'runtime',
      reason:
        'An extracted statement module. Its whole content is SQL text plus a dialect ' +
        'choice, and both are asserted verbatim by the repository suite that issues it.',
      exercisedBy: [
        {
          path: 'tests/integration/repositories/mysqlPriceGroupRepository.test.ts',
          evidence: 'sql/accountSubscriptionPriceGroups.sql.js',
        },
      ],
    },
    {
      module: 'src/repositories/mysql/sql/promotionUseCounts.sql.ts',
      kind: 'runtime',
      reason:
        'An extracted statement module carrying the four use-count statements, including ' +
        'the duplicated start-date comparison preserved from the source.',
      exercisedBy: [
        {
          path: 'tests/integration/repositories/mysqlPromotionRepository.test.ts',
          evidence: 'sql/promotionUseCounts.sql.js',
        },
        {
          path: 'tests/unit/domain/entities/promotionPeriod.test.ts',
          evidence: 'sql/promotionUseCounts.sql.js',
        },
      ],
    },
    {
      module: 'src/repositories/mysql/sql/salePricePromotionRewards.sql.ts',
      kind: 'runtime',
      reason:
        'An extracted statement module holding the six-branch union and the common table ' +
        'expressions that replace the legacy in-engine result post-processing.',
      exercisedBy: [
        {
          path: 'tests/integration/repositories/mysqlPromotionRepository.test.ts',
          evidence: 'sql/salePricePromotionRewards.sql.js',
        },
      ],
    },
    {
      module: 'src/repositories/mysql/sql/sortedProductSkus.sql.ts',
      kind: 'runtime',
      reason:
        'An extracted statement module. It is the one exempt module its prover does not ' +
        'import: the SKU repository suite pins its text as an expected-SQL constant and ' +
        'compares the issued statement against it, which proves the same thing more ' +
        'strictly than an import would.',
      exercisedBy: [
        {
          path: 'tests/integration/repositories/mysqlSkuRepository.test.ts',
          evidence: 'EXPECTED_SORTED_PRODUCT_SKUS_SQL',
        },
      ],
    },
  ],

  // Runtime modules that are OWED a dedicated suite and do not have one. Recording
  // them here rather than folding them into the exemptions is the whole reason this
  // map has three categories instead of two: an exemption asserts nothing is owed,
  // and something IS owed here.
  //
  // `plannedCoverage` is asserted ABSENT from disk. The register can therefore only
  // ever shrink: the moment one of these suites is authored, the gate fails until the
  // module moves up into `coveredModules`.
  pendingModules: [
    // `src/handlers/bootstrap.ts` WAS registered here. It has since been promoted
    // into `coveredModules` above, because `tests/unit/handlers/bootstrap.test.ts`
    // now exists and pins the wiring itself: which adapter satisfies which port,
    // the eager `SwCurrency` read and the eligible-currency list it resolves, the
    // dialect refusal, the memo's three exits, per-request instance freshness, and
    // the cross-service ordering constraint the legacy leaves implicit
    // [model/service/PromotionService.cfc:L241-L254 reads what
    // model/service/PriceGroupService.cfc:L364-L375 writes]. This is the shrink
    // direction the register was designed to permit; the entry is not restorable
    // while that suite is on disk, because A9 would then fail.
    {
      module: 'src/handlers/router.ts',
      owningBoundary: 'src/handlers/router.ts',
      reason:
        'The explicit route table that replaces the legacy subsystem routing convention. ' +
        'It carries no business logic, but it does carry dispatch decisions, and dispatch ' +
        'decisions are behaviour.',
      plannedCoverage: ['tests/unit/handlers/router.test.ts'],
    },
  ],

  // Suites that are nobody's dedicated suite. Each exists because one narrow path needed pinning
  // on its own, and each is declared so that the test-file census balances without loosening the
  // one-suite-per-module rule.
  //
  // ★ AN ENTRY HERE IS A SIGNAL, NOT A CONVENIENCE, so the bar for adding one is stated where it
  // will be read. A supplementary suite usually means a module grew a surface the plan did not give
  // it - which is exactly how a rounding-rule WRITE suite came to be listed here, before
  // `PromotionRepository` was restored to the SEVEN READS the plan locks it at. That suite and the
  // eighth port method it exercised are both gone, so its entry is gone with them; the repository
  // integration tier is once again exactly the six adapter suites plus the one SQL-module suite,
  // every one of which IS some module's dedicated suite and is declared above. Adding an entry back
  // is a plan change to be recorded, not something to reach for.
  //
  //
  // ★ THE ENTRY THAT DID NOT SURVIVE, RECORDED RATHER THAN ERASED.
  // `tests/integration/repositories/mysqlPromotionRepositoryRoundingRuleWrite.test.ts` was declared
  // here to pin a rounding-rule WRITE on `src/repositories/mysql/mysqlPromotionRepository.ts`, on
  // the stated reason that the write "is the only place a repository in this slice persists an
  // entity that the discount arithmetic then reads back". The reason was sound for the code as it
  // then stood; the code was not. That write was an eighth method on a port specified as SEVEN
  // READS, so the suite existed to pin behaviour that should not have been there, and a second suite
  // over one module was the visible consequence of the first mistake rather than a coverage need.
  // Port, adapter, service, suite and its entry have all been withdrawn together.
  //
  // The field is KEPT rather than deleted either way, because the census arithmetic below partitions
  // the suites on disk into primary plus supplementary, and the size of the second part - whether
  // zero or one - is a claim worth asserting.
  //
  // The one entry that survives that bar is below, and it survives because its subject is a
  // statement CONSTANT rather than a grown surface.
  supplementarySuites: [
    {
      test: 'tests/unit/handlers/bootstrapStatements.test.ts',
      subject: 'src/handlers/bootstrap.ts',
      reason:
        'Two statement constants in the composition root each port a LEGACY-DECLARED value - ' +
        'the smart list\u2019s default page size [org/Hibachi/HibachiSmartList.cfc:L39] and ' +
        '`OptionGroup.options`\u2019 declared association order ' +
        '[model/entity/OptionGroup.cfc:L70] - and each had diverged from it while no suite ' +
        'could observe either. They are pinned here, through the published executor override, ' +
        'against the statement the graph really emits. It is deliberately SEPARATE from the ' +
        'module\u2019s own suite `tests/unit/handlers/bootstrap.test.ts`, which pins the wiring ' +
        'and the trust boundaries rather than the SQL text: this one would still be the right ' +
        'home for a statement constant even once the wiring is fully covered, which it now is - ' +
        '`src/handlers/bootstrap.ts` sits in `coveredModules` above.',
    },
  ],

  // The ONLY two target suites that carry a legacy assertion forward. Everything else
  // in `tests/` is net-new, and saying so plainly is the point of this file.
  legacyExtendedSuites: [
    {
      test: 'tests/unit/domain/entities/brand.test.ts',
      module: 'src/domain/entities/brand.ts',
      legacyAntecedent: 'meta/tests/unit/entity/BrandTest.cfc',
      carriedCaseName: 'defaults_are_correct',
      carriedCaseSpan: [58, 60],
      totalLegacyCases: 4,
      caseArithmetic:
        'Four, not five: the component declares one case and inherits four from its base, ' +
        'but the case it declares carries the SAME name as one of them, so it replaces ' +
        'that inherited case rather than adding to it. Three inherited plus one declared.',
      carriedFixtures: [],
    },
    {
      test: 'tests/unit/domain/entities/product.test.ts',
      module: 'src/domain/entities/product.ts',
      legacyAntecedent: 'meta/tests/unit/entity/ProductTest.cfc',
      carriedCaseName: 'productUrlIsCorrectlyFormatted',
      carriedCaseSpan: [58, 62],
      totalLegacyCases: 5,
      caseArithmetic:
        'Five: one declared case that overrides nothing, plus the four inherited from the ' +
        'shared entity base.',
      carriedFixtures: ['nike-air-jorden'],
    },
  ],

  // Every legacy test component that bears on this slice, with what it contributes.
  // Line counts are asserted against the files on disk, so a drifted citation fails
  // rather than quietly misdescribing the source.
  legacyAntecedents: [
    {
      file: 'meta/tests/unit/entity/BrandTest.cfc',
      lineCount: 64,
      declaredCases: [{ name: 'defaults_are_correct', line: 58 }],
      contributesCoverage: true,
      note: 'Its one declared case asserts that a fresh brand exposes an empty product collection.',
    },
    {
      file: 'meta/tests/unit/entity/ProductTest.cfc',
      lineCount: 65,
      declaredCases: [{ name: 'productUrlIsCorrectlyFormatted', line: 58 }],
      contributesCoverage: true,
      note:
        'Its one declared case pins the product URL shape, with both the leading and the ' +
        'trailing separator, around a literal URL title that the target suite reuses.',
    },
    {
      file: 'meta/tests/unit/entity/SlatwallEntityTestBase.cfc',
      lineCount: 70,
      declaredCases: [
        { name: 'validate_as_save_for_a_new_instance_doesnt_pass', line: 51 },
        { name: 'simple_representation_exists_and_is_simple', line: 56 },
        { name: 'has_primary_id_property_name', line: 60 },
        { name: 'defaults_are_correct', line: 64 },
      ],
      contributesCoverage: true,
      note:
        'The shared entity base. Its four cases are what each entity component inherits, ' +
        'and they are the reason the two carried counts are four and five rather than one.',
    },
    {
      file: 'meta/tests/unit/IssuesTest.cfc',
      lineCount: 209,
      declaredCases: [
        { name: 'issue_1097', line: 51 },
        { name: 'issue_1296', line: 73 },
        { name: 'issue_1329', line: 91 },
        { name: 'issue_1331', line: 101 },
        { name: 'issue_1335', line: 110 },
        { name: 'issue_1348', line: 126 },
        { name: 'issue_1376', line: 140 },
        { name: 'issue_1604', line: 183 },
        { name: 'issue_1690', line: 192 },
        { name: 'issue_1690_2', line: 203 },
      ],
      contributesCoverage: true,
      note:
        'The legacy regression register. Its naming convention is carried forward; two of ' +
        'its ten cases cannot assert anything on an empty database, which is recorded ' +
        'against them individually rather than averaged away.',
    },
    {
      file: 'meta/tests/functional/admin/entity/ProductTest.cfc',
      lineCount: 53,
      declaredCases: [],
      contributesCoverage: false,
      note:
        'An empty scaffold: it opens a component, holds two blank lines, and closes. It ' +
        'declares no case at all and therefore contributes nothing, which is why it is ' +
        'acknowledged rather than counted.',
    },
    {
      file: 'meta/tests/coverage/EntityCoverageTest.cfc',
      lineCount: 72,
      declaredCases: [{ name: 'all_entities_have_test_cases', line: 51 }],
      contributesCoverage: false,
      note:
        'The structural floor this module replaces. It contributes no coverage OF the ' +
        'slice; it contributes the IDEA of a floor, together with the lesson about what ' +
        'happens when a floor enumerates an empty directory.',
    },
    {
      file: 'meta/tests/coverage/SlatwallCoverageTestBase.cfc',
      lineCount: 59,
      declaredCases: [{ name: 'setUp', line: 52 }],
      contributesCoverage: false,
      note:
        'Supplies the directory the floor walks. That directory does not exist in this ' +
        'checkout, which is the defect annotated at the top of this file.',
    },
  ],

  // Legacy regression cases whose claim is recorded somewhere in the target, under the
  // legacy naming convention so the lineage stays greppable. Recording a claim is NOT
  // the same as carrying an assertion forward: none of these suites is relabelled
  // legacy-extended on the strength of a recorded case name.
  routedIssueCases: [
    {
      caseName: 'issue_1097',
      legacyLine: 51,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/domain/entities/product.test.ts',
        'tests/unit/lib/cfml/truthiness.test.ts',
        'tests/unit/lib/cfml/precision.test.ts',
      ],
      note: 'Routed to the entity and semantic-parity suites that own the behaviour it names.',
    },
    {
      caseName: 'issue_1296',
      legacyLine: 73,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/services/productService.test.ts',
      ],
      note:
        'The legacy case nests its single assertion inside a record-count condition, so on ' +
        'an empty database it passes without asserting. The target records the claim and ' +
        'asserts it unconditionally.',
    },
    {
      caseName: 'issue_1329',
      legacyLine: 91,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/services/productService.test.ts',
      ],
      note: 'The legacy case asserts nothing at all; the target records the claim it describes.',
    },
    {
      caseName: 'issue_1331',
      legacyLine: 101,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/domain/entities/product.test.ts',
      ],
      note: 'Routed to the entity suites that own the behaviour it names.',
    },
    {
      caseName: 'issue_1335',
      legacyLine: 110,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/domain/entities/product.test.ts',
        'tests/unit/domain/entities/skuCurrency.test.ts',
        'tests/unit/domain/valueObjects/money.test.ts',
      ],
      note: 'Touches per-currency pricing, so it is recorded against the currency and money units.',
    },
    {
      caseName: 'issue_1348',
      legacyLine: 126,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/domain/entities/product.test.ts',
        'tests/unit/domain/entities/sku.test.ts',
        'tests/unit/domain/valueObjects/money.test.ts',
      ],
      note: 'Touches SKU pricing, so it is recorded against the SKU entity and the money unit.',
    },
    {
      caseName: 'issue_1376',
      legacyLine: 140,
      recordedIn: ['tests/unit/domain/entities/brand.test.ts'],
      note:
        'Recorded only where the register itself lives. The brand suite carries the whole ' +
        'legacy register because it is one of the two suites with a real legacy antecedent.',
    },
    {
      caseName: 'issue_1604',
      legacyLine: 183,
      recordedIn: ['tests/unit/domain/entities/brand.test.ts'],
      note: 'Recorded only where the register itself lives.',
    },
    {
      caseName: 'issue_1690',
      legacyLine: 192,
      recordedIn: [
        'tests/unit/domain/entities/brand.test.ts',
        'tests/unit/domain/entities/product.test.ts',
      ],
      note: 'Routed to the entity suites that own the behaviour it names.',
    },
    {
      caseName: 'issue_1690_2',
      legacyLine: 203,
      recordedIn: ['tests/unit/domain/entities/product.test.ts'],
      note: 'The second case against the same ticket, routed to the product entity suite.',
    },
  ],

  // Legacy TODOs carried across AS TODOs. Both are gaps in the SOURCE, and closing
  // either one here would be exactly the silent completion the plan forbids.
  preservedTodos: [
    {
      reference: 'issue #1766',
      legacyFile: 'model/service/PromotionService.cfc',
      legacyLine: 543,
      legacyEvidence: 'TODO [issue #1766]',
      recordedIn: [
        'src/services/promotionService.ts',
        'src/domain/promotionEngine/qualifiedDiscountTypes.ts',
        'tests/unit/domain/entities/promotion.test.ts',
      ],
      recordedEvidence: 'issue_1766',
      // The legacy branch for returns and exchanges is empty and carries only this
      // reference. The target keeps the branch empty, keeps the reference, and pins the
      // emptiness with a case named after the ticket - so the gap is visible rather than
      // inferred from an absence.
    },
    {
      reference: 'the empty product-category element in the feed',
      legacyFile: 'integrationServices/google/views/feed/product.cfm',
      legacyLine: 20,
      legacyEvidence: 'g:google_product_category',
      recordedIn: [
        'src/integrations/google/rssFeedRenderer.ts',
        'tests/unit/integrations/google/rssFeedRenderer.test.ts',
      ],
      recordedEvidence: 'google_product_category',
      // The legacy template emits the element with no content. The renderer emits it the
      // same way, and its suite asserts the emptiness, because a feed that suddenly
      // carried a category would be a behaviour change dressed up as a fix.
    },
  ],

  // --- Interface-parity ledger ---------------------------------------------
  //
  // Three fixed budgets. Each row names the symbol, the module that declares it, and
  // the DECLARATION TEXT the gate searches for. Target symbols are asserted by text
  // and never by line number, so ordinary editing above them cannot fail this gate
  // while a rename or a signature change still does.

  // Private in the source, exported here so the arithmetic they carry can be pinned
  // directly. Widening visibility changes what a suite can reach; it changes no
  // behaviour, which is why it is budgeted rather than forbidden.
  visibilityWidenings: [
    {
      symbol: 'getDiscountAmount',
      module: 'src/services/promotionService.ts',
      declaration:
        'public getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money {',
      legacyLocator: 'model/service/PromotionService.cfc:L987',
    },
    {
      symbol: 'getPromotionPeriodQualificationDetails',
      module: 'src/services/promotionService.ts',
      declaration: 'public async getPromotionPeriodQualificationDetails(',
      legacyLocator: 'model/service/PromotionService.cfc:L549',
    },
    {
      symbol: 'getQualifierQualificationDetails',
      module: 'src/services/promotionService.ts',
      declaration: 'public getQualifierQualificationDetails(',
      legacyLocator: 'model/service/PromotionService.cfc:L629',
    },
    {
      symbol: 'getPromotionPeriodQualifiedFulfillmentIDList',
      module: 'src/services/promotionService.ts',
      declaration: 'public getPromotionPeriodQualifiedFulfillmentIDList(',
      legacyLocator: 'model/service/PromotionService.cfc:L752',
    },
    {
      symbol: 'getPromotionPeriodOrderItemQualificationCount',
      module: 'src/services/promotionService.ts',
      declaration: 'public getPromotionPeriodOrderItemQualificationCount(',
      legacyLocator: 'model/service/PromotionService.cfc:L783',
    },
  ],

  // JUDGMENT CALL: the plan budgets THREE reshapings but four symbols carry them,
  // because one of the three - the smart-list replacement - covers a PAIR of methods
  // that were reshaped identically and for the same reason. Four rows enumerating
  // three budgeted reshapings is the honest arithmetic; collapsing the pair into one
  // row would leave one of the two reshaped symbols unasserted, which is worse. The
  // gate asserts the count is four AND that exactly two of the four are the pair.
  signatureReshapings: [
    {
      symbol: 'updateOrderAmountsWithPromotions',
      module: 'src/services/promotionService.ts',
      declaration: 'public async updateOrderAmountsWithPromotions(',
      legacyLocator: 'model/service/PromotionService.cfc:L58',
    },
    {
      symbol: 'findProducts',
      module: 'src/services/productService.ts',
      declaration: 'async findProducts(criteria: ProductQueryCriteria): Promise<ProductPage> {',
      legacyLocator: 'model/service/ProductService.cfc:L342',
    },
    {
      symbol: 'findSkus',
      module: 'src/services/skuService.ts',
      declaration: 'public async findSkus(criteria: SkuQueryCriteria): Promise<SkuPage> {',
      legacyLocator: 'model/service/SkuService.cfc:L309',
    },
    {
      symbol: 'generateProductFeed',
      module: 'src/integrations/google/googleFeedService.ts',
      declaration: 'async generateProductFeed(): Promise<string> {',
      legacyLocator: 'integrationServices/google/controllers/feed.cfc:L58',
    },
  ],

  // Exactly one entity method takes a parameter the source did not: the current
  // moment. It is passed in rather than read from the clock so the comparison has an
  // explicit time policy and a deterministic result.
  entityLayerWidenings: [
    {
      symbol: 'isCurrent',
      module: 'src/domain/entities/promotionPeriod.ts',
      declaration: 'isCurrent(now: Date): boolean {',
      legacyLocator: 'model/entity/PromotionPeriod.cfc:L78',
    },
  ],

  // Exactly three places where the source is NOT reproduced. Each is owned by a named
  // module that carries the citation, so a reviewer can find the reasoning at the
  // site rather than taking this file's word for it.
  deliberateDivergences: [
    {
      summary:
        'The discount accumulator that the source assigns without function-local scoping ' +
        'becomes function-local. Reproducing shared mutable state would let one order ' +
        'observe another order across a warm container.',
      citation: 'model/service/PromotionService.cfc:L1007',
      owningModule: 'src/services/promotionService.ts',
    },
    {
      summary:
        'The fixed-amount discount branch routes through the decimal value object like ' +
        'every other branch, instead of keeping the one raw floating-point multiplication ' +
        'the source performs there. The result is strictly more correct.',
      citation: 'model/service/PromotionService.cfc:L998',
      owningModule: 'src/services/promotionService.ts',
    },
    {
      summary:
        'The entity option-lookup memo defects are corrected: the source populates one ' +
        'key and returns another, so it discards its own work. The returned VALUE is ' +
        'unchanged either way, and the memo is request-scoped here regardless.',
      citation: 'model/entity/Sku.cfc:L512-L522',
      owningModule: 'src/domain/entities/sku.ts',
    },
  ],

  // A curated floor under the preserved-defect register. The register itself is
  // derived open-endedly from the source tree - these are the citations whose removal
  // would mean a must-preserve behaviour had been quietly repaired.
  requiredDefectCitations: [
    {
      citation: 'model/service/PriceGroupService.cfc:L236',
      owningModule: 'src/services/priceGroupService.ts',
      summary: 'A loop reads a scoped name that was never declared, so the loop body throws.',
    },
    {
      citation: 'model/service/PriceGroupService.cfc:L173',
      owningModule: 'src/services/priceGroupService.ts',
      summary:
        'The parent step of the rate cascade recurses into the product variant rather than ' +
        'the SKU variant, breaking the cascade symmetry.',
    },
    {
      citation: 'model/service/PromotionService.cfc:L468-L521',
      owningModule: 'src/domain/promotionEngine/rewardUsageTypes.ts',
      summary:
        'The over-use correction loop indexes the usage ledger by a name left over from ' +
        'the previous loop, so a per-order limit is enforced against the wrong reward.',
    },
    {
      citation: 'model/entity/Sku.cfc:L258',
      owningModule: 'src/domain/entities/sku.ts',
      summary: 'A price accessor calls a collaborator method that does not exist, so it throws.',
    },
    {
      citation: 'model/entity/Product.cfc:L598',
      owningModule: 'src/domain/entities/product.ts',
      summary:
        'A sale-price statement has no return, so execution falls through and the method ' +
        'answers zero.',
    },
    {
      citation: 'model/dao/PromotionDAO.cfc:L51-L132',
      owningModule: 'src/domain/ports/promotionRepository.ts',
      summary:
        'The active-reward query has no ordering clause, which is what makes reward ' +
        'iteration order - and therefore a tied discount outcome - undetermined.',
    },
    {
      citation: 'integrationServices/google/Integration.cfc:L49',
      owningModule: 'src/integrations/google/integration.ts',
      summary:
        'The component declares a display name belonging to an unrelated payment adapter ' +
        'while its accessor answers the correct one.',
    },
  ],

  // Coverage this migration does NOT have. Stated so that no reader can mistake the
  // shape of the suite for parity with a legacy suite that never existed.
  acknowledgedGaps: [
    {
      subject: 'meta/tests/functional/admin/entity/ProductTest.cfc',
      coverageContribution: 0,
      note:
        'An empty scaffold in the source. It is acknowledged, never counted: a file that ' +
        'declares no case cannot be extended, so the browser-driven tier has no ' +
        'antecedent to carry forward and none is claimed.',
    },
    {
      subject: 'the eight runtime modules in the pending register',
      coverageContribution: 0,
      note:
        'Each is exercised indirectly, and none has a dedicated suite. They are listed as ' +
        'owed rather than as exempt precisely so this gap cannot be read as parity.',
    },
    {
      subject: 'legacy service, data-access and integration suites for this slice',
      coverageContribution: 0,
      note:
        'The legacy unit tier holds suites for an account service, a payment service, a ' +
        'framework base service, a resource-bundle utility, and two data-access ' +
        'components - not one of which is in this slice. Every service, repository, ' +
        'handler, adapter and semantic-parity suite in the target is therefore net-new.',
    },
  ],

  // Legacy harness traits deliberately not reproduced. These are properties of HOW
  // the legacy suite ran, not assertions about the system, so carrying them forward
  // would import defects without importing behaviour.
  harnessTraitsNotCarried: [
    {
      locator: 'meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54',
      trait:
        'The floor walks a directory path that this checkout does not contain, so it ' +
        'enumerates nothing and its empty-remainder check can only pass vacuously.',
      whyNotCarried:
        'This module anchors itself against two files it proves exist and raises loudly ' +
        'when a directory is missing, so the same mistake cannot be silent here.',
    },
    {
      locator: 'meta/tests/unit/Helper.cfc:L53',
      trait: 'A shared fixture structure declared without function-local scoping.',
      whyNotCarried:
        'A harness hygiene defect rather than observable behaviour of the system under ' +
        'test. The target fixtures are module-local and returned by value.',
    },
    {
      locator: 'meta/tests/unit/IssuesTest.cfc:L78',
      trait:
        'An assertion nested inside a record-count condition, so an empty database turns ' +
        'the case into a pass that asserts nothing.',
      whyNotCarried:
        'Conditional assertions are how a suite stops meaning anything. Every target case ' +
        'that records this claim asserts unconditionally.',
    },
    {
      locator: 'meta/tests/unit/entity/BrandTest.cfc:L53',
      trait:
        'The fixture hook calls its base with a differently-capitalised name, which the ' +
        'legacy language tolerates because component member names are case-insensitive.',
      whyNotCarried:
        'The target language is case-sensitive, so there is no latitude to reproduce. Hook ' +
        'names are written once and exactly.',
    },
    {
      locator: 'meta/tests/unit/SlatwallUnitTestBase.cfc:L60',
      trait:
        'Every case in the legacy unit tier boots the real application, its object-relational ' +
        'layer and its container before running, and the teardown is commented out.',
      whyNotCarried:
        'Nothing in that tier is isolated in the modern sense. Traceability here means the ' +
        'same assertions about the same behaviour, not the same architecture.',
    },
  ],

  // Everything not named in `legacyExtendedSuites` is this.
  defaultLineage: 'net-new',
};

// --- Derived views over the map --------------------------------------------
//
// Flattened once so every assertion below reads the same lists, and so a failure can
// print NAMES. A floor that reports "expected 84, received 83" tells a reader nothing
// about which module slipped out; every check here reports the offenders themselves.

const MAPPED = LEGACY_TEST_MAP.coveredModules;
const MAPPED_MODULES = MAPPED.map((entry) => entry.module);
const MAPPED_TESTS = MAPPED.map((entry) => entry.test);
const EXEMPT_MODULES = LEGACY_TEST_MAP.exemptModules.map((entry) => entry.module);
const PENDING_MODULES = LEGACY_TEST_MAP.pendingModules.map((entry) => entry.module);
const SUPPLEMENTARY_TESTS = LEGACY_TEST_MAP.supplementarySuites.map((entry) => entry.test);
const DECLARED_MODULES = [...MAPPED_MODULES, ...EXEMPT_MODULES, ...PENDING_MODULES];
const DECLARED_TESTS = [...MAPPED_TESTS, ...SUPPLEMENTARY_TESTS];
const EXTENDED_SUITES = LEGACY_TEST_MAP.legacyExtendedSuites.map((entry) => entry.test);

function duplicatesIn(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...repeated].sort();
}

/** Members of `candidates` that `present` does not contain, as names, sorted. */
function missingFrom(candidates: readonly string[], present: readonly string[]): string[] {
  const known = new Set(present);
  return candidates.filter((candidate) => !known.has(candidate)).sort();
}

/**
 * True when `needle` appears in `text` as a whole reference rather than as the prefix
 * of a longer one.
 *
 * A plain substring check is not strong enough for what this file guards, and the gap
 * is not hypothetical: renaming the deferred `issue_1766` to `issue_1766_done` would
 * satisfy a substring check while silently completing the very deferral the map exists
 * to keep open, and `issue_1690` is itself a prefix of the legacy component's
 * `issue_1690_2`. The boundary is strict only about word characters - a reference may
 * legitimately sit against a quote, a bracket, a slash or a colon - because a word
 * character is exactly where such an evasion hides.
 */
function mentions(text: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(text);
}

/** Splits a `<path>:L<line>` citation. Returns an empty path when it is not one. */
function splitCitation(citation: string): { file: string; line: number } {
  const [file, rest] = citation.split(':L');
  return { file: file ?? '', line: Number.parseInt(rest ?? '', 10) };
}

function requireExtendedSuite(module: string): LegacyExtendedSuite {
  const found = LEGACY_TEST_MAP.legacyExtendedSuites.find((entry) => entry.module === module);
  if (!found) {
    throw new Error(
      `the map no longer records a legacy-extended suite for ${module}. The two suites with a ` +
        'real legacy antecedent are the whole basis of the lineage claim; losing one silently ' +
        'would turn net-new coverage into asserted parity.',
    );
  }
  return found;
}

function requireAntecedent(file: string): LegacyAntecedent {
  const found = LEGACY_TEST_MAP.legacyAntecedents.find((entry) => entry.file === file);
  if (!found) {
    throw new Error(`the map no longer records the legacy antecedent ${file}`);
  }
  return found;
}

// --- A0: the floor proves itself before it judges anything else -------------

describe('A0 anti-vacuity: the map is anchored, populated, and loud on absence', () => {
  it('anchors on files that must exist in both trees', () => {
    expect(readSubtreeFile('package.json')).toContain('"name"');
    expect(readSubtreeFile('vitest.config.ts')).toContain('tests/traceability');
    expect(readRepositoryFile('version.txt').trim()).toBe('3.1.39');
    expect(existsSync(path.join(REPOSITORY_ROOT, 'model', 'entity', 'Product.cfc'))).toBe(true);
    expect(existsSync(path.join(REPOSITORY_ROOT, 'model', 'service', 'PromotionService.cfc'))).toBe(
      true,
    );
  });

  it('records why the legacy floor it replaces could only ever pass vacuously', () => {
    // The legacy base points its directory walk at a path this checkout does not
    // contain, so the collection it compares against is always empty.
    expect(repositoryLine('meta/tests/coverage/SlatwallCoverageTestBase.cfc', 54)).toContain(
      'com/entity',
    );
    expect(existsSync(path.join(REPOSITORY_ROOT, 'com', 'entity'))).toBe(false);
    expect(existsSync(path.join(REPOSITORY_ROOT, 'model', 'entity'))).toBe(true);
  });

  it('enumerates a census large enough to be real', () => {
    expect(SOURCE_MODULES_ON_DISK.length).toBeGreaterThan(50);
    expect(TEST_FILES_ON_DISK.length).toBeGreaterThan(40);
    expect(SOURCE_MODULES_ON_DISK.filter((module) => !module.startsWith('src/'))).toEqual([]);
    expect(TEST_FILES_ON_DISK.filter((test) => !test.startsWith('tests/'))).toEqual([]);
  });

  it('raises loudly rather than enumerating nothing when a path is wrong', () => {
    expect(() => listTypeScriptFiles('src/no-such-directory')).toThrow(/missing/);
    expect(() => readSubtreeFile('src/no-such-file.ts')).toThrow(/missing/);
    expect(() => readRepositoryFile('model/no-such-file.cfc')).toThrow(/missing/);
    expect(() =>
      requireAnchor(path.join(SUBTREE_ROOT, 'no-such-anchor'), 'a missing anchor'),
    ).toThrow(/could not anchor itself/);
  });

  it('holds itself to the annotation convention it reports on', () => {
    const own = readSubtreeFile('tests/traceability/legacyTestMap.ts');
    expect(own).toContain('meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54');
    expect(own).toContain('meta/tests/coverage/EntityCoverageTest.cfc:L69');
    const preservationSentences =
      own.split('Preserved deliberately; do not fix without a product decision.').length - 1;
    expect(preservationSentences).toBeGreaterThanOrEqual(2);
  });
});

// --- A1: the empty remainder, the one idea worth carrying forward -----------

describe('A1 empty remainder: every covered module really has the suite it claims', () => {
  it('has that suite on disk', () => {
    const missing = MAPPED.filter((entry) => !subtreeFileExists(entry.test)).map(
      (entry) => `${entry.module} claims ${entry.test}, which is not on disk`,
    );
    expect(missing.sort()).toEqual([]);
  });

  it('and that suite really references the module, so the pairing is not nominal', () => {
    const unreferenced: string[] = [];
    for (const entry of MAPPED) {
      if (!subtreeFileExists(entry.test)) {
        continue;
      }
      const specifier = importSpecifierFor(entry.module);
      if (!mentions(readSubtreeFile(entry.test), specifier)) {
        unreferenced.push(`${entry.test} never mentions ${specifier}`);
      }
    }
    expect(unreferenced.sort()).toEqual([]);
  });
});

// --- A2 to A5: the census balances, in both directions ----------------------

describe('A2 totality: the three categories partition the source census exactly', () => {
  it('names every module that is on disk', () => {
    expect(missingFrom(SOURCE_MODULES_ON_DISK, DECLARED_MODULES)).toEqual([]);
  });

  it('and names nothing that is not on disk', () => {
    expect(missingFrom(DECLARED_MODULES, SOURCE_MODULES_ON_DISK)).toEqual([]);
  });

  it('so the two lists are the same list', () => {
    expect([...DECLARED_MODULES].sort()).toEqual(SOURCE_MODULES_ON_DISK);
    expect(MAPPED_MODULES.length + EXEMPT_MODULES.length + PENDING_MODULES.length).toBe(
      SOURCE_MODULES_ON_DISK.length,
    );
  });
});

describe('A3 disjointness: no module is filed under two categories', () => {
  it('reports any module claimed twice', () => {
    const exempt = new Set(EXEMPT_MODULES);
    const pending = new Set(PENDING_MODULES);
    const overlaps: string[] = [];
    for (const module of MAPPED_MODULES) {
      if (exempt.has(module)) {
        overlaps.push(`${module}: covered and exempt at once`);
      }
      if (pending.has(module)) {
        overlaps.push(`${module}: covered and pending at once`);
      }
    }
    for (const module of EXEMPT_MODULES) {
      if (pending.has(module)) {
        overlaps.push(`${module}: exempt and pending at once`);
      }
    }
    expect(overlaps.sort()).toEqual([]);
  });
});

describe('A4 no duplicates: nothing is listed twice', () => {
  it('no module path repeats across the three categories', () => {
    expect(duplicatesIn(DECLARED_MODULES)).toEqual([]);
  });

  it('no suite path repeats across the primary and supplementary lists', () => {
    expect(duplicatesIn(DECLARED_TESTS)).toEqual([]);
  });
});

describe('A5 no orphans: every path the map names exists', () => {
  it('every declared module is a file', () => {
    expect(DECLARED_MODULES.filter((module) => !subtreeFileExists(module)).sort()).toEqual([]);
  });

  it('every declared suite is a file', () => {
    expect(DECLARED_TESTS.filter((test) => !subtreeFileExists(test)).sort()).toEqual([]);
  });
});

// --- A6: the recorded kind is re-derived, never trusted ---------------------

describe('A6 module kind: re-derived from each module\u2019s own source text', () => {
  it('every covered module carries runtime code worth a suite', () => {
    const notRuntime = MAPPED_MODULES.filter((module) => derivedKindOf(module) !== 'runtime');
    expect(notRuntime.sort()).toEqual([]);
  });

  it('every pending module carries runtime code, so the debt is real', () => {
    const notRuntime = PENDING_MODULES.filter((module) => derivedKindOf(module) !== 'runtime');
    expect(notRuntime.sort()).toEqual([]);
  });

  it('every exemption declares the kind its source text proves', () => {
    const mislabelled = LEGACY_TEST_MAP.exemptModules
      .filter((entry) => entry.kind !== derivedKindOf(entry.module))
      .map(
        (entry) =>
          `${entry.module}: declared ${entry.kind}, source says ${derivedKindOf(entry.module)}`,
      );
    expect(mislabelled.sort()).toEqual([]);
  });

  it('and every type-only module on disk is accounted for as an exemption', () => {
    const typeOnly = SOURCE_MODULES_ON_DISK.filter(
      (module) => derivedKindOf(module) === 'typeOnly',
    );
    expect(typeOnly.length).toBeGreaterThan(0);
    expect(missingFrom(typeOnly, EXEMPT_MODULES)).toEqual([]);
  });
});

describe('A6b naming: suites are named after the modules they cover', () => {
  const declaredExceptions = LEGACY_TEST_MAP.namingExceptions.map((entry) => entry.module);

  it('declares its exceptions instead of loosening the rule', () => {
    expect(LEGACY_TEST_MAP.namingExceptions.length).toBe(1);
    expect(missingFrom(declaredExceptions, MAPPED_MODULES)).toEqual([]);
    const inconsistent = LEGACY_TEST_MAP.namingExceptions
      .filter(
        (entry) =>
          !MAPPED.some((covered) => covered.module === entry.module && covered.test === entry.test),
      )
      .map((entry) => `${entry.module}: the exception contradicts the covered pairing`);
    expect(inconsistent).toEqual([]);
  });

  it('holds for every module that is not a declared exception', () => {
    const exceptions = new Set(declaredExceptions);
    const offenders = MAPPED.filter(
      (entry) =>
        !exceptions.has(entry.module) &&
        path.basename(entry.test) !== expectedSuiteNameFor(entry.module),
    ).map((entry) => `${entry.test} should be named ${expectedSuiteNameFor(entry.module)}`);
    expect(offenders.sort()).toEqual([]);
  });

  it('and the declared exception really is exceptional', () => {
    const notExceptional = LEGACY_TEST_MAP.namingExceptions
      .filter((entry) => path.basename(entry.test) === expectedSuiteNameFor(entry.module))
      .map((entry) => `${entry.module} follows the convention and needs no exception`);
    expect(notExceptional).toEqual([]);
  });
});

// --- A7 and A8: lineage, and the arithmetic behind the carried counts -------

describe('A7 lineage: exactly two suites carry a legacy assertion forward', () => {
  it('names two, and names which two', () => {
    expect([...EXTENDED_SUITES].sort()).toEqual([
      'tests/unit/domain/entities/brand.test.ts',
      'tests/unit/domain/entities/product.test.ts',
    ]);
  });

  it('labels every other suite net-new', () => {
    expect(LEGACY_TEST_MAP.defaultLineage).toBe('net-new');
    const netNew = TEST_FILES_ON_DISK.filter((test) => !EXTENDED_SUITES.includes(test));
    expect(netNew.length).toBe(TEST_FILES_ON_DISK.length - 2);
    expect(netNew.length).toBeGreaterThan(40);
  });

  it('and each extended suite is the dedicated suite of the module it names', () => {
    const wrong = LEGACY_TEST_MAP.legacyExtendedSuites
      .filter(
        (entry) =>
          !MAPPED.some((covered) => covered.module === entry.module && covered.test === entry.test),
      )
      .map((entry) => `${entry.test} is not the declared suite of ${entry.module}`);
    expect(wrong).toEqual([]);
  });
});

describe('A8 carried assertions: checked against the legacy files, not asserted', () => {
  it('every legacy antecedent exists with the line count recorded for it', () => {
    const drifted = LEGACY_TEST_MAP.legacyAntecedents
      .map((entry) => ({ entry, actual: countLines(readRepositoryFile(entry.file)) }))
      .filter(({ entry, actual }) => actual !== entry.lineCount)
      .map(({ entry, actual }) => `${entry.file}: recorded ${entry.lineCount}, on disk ${actual}`);
    expect(drifted.sort()).toEqual([]);
  });

  it('every recorded case line really declares the case named on it', () => {
    const offenders: string[] = [];
    for (const antecedent of LEGACY_TEST_MAP.legacyAntecedents) {
      for (const declared of antecedent.declaredCases) {
        if (!mentions(repositoryLine(antecedent.file, declared.line), declared.name)) {
          offenders.push(`${antecedent.file}:L${declared.line} does not declare ${declared.name}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('derives the carried counts of four and five instead of stating them', () => {
    const base = requireAntecedent('meta/tests/unit/entity/SlatwallEntityTestBase.cfc');
    const brand = requireExtendedSuite('src/domain/entities/brand.ts');
    const product = requireExtendedSuite('src/domain/entities/product.ts');
    const inherited = base.declaredCases.length;
    expect(inherited).toBe(4);

    // A component's own case ADDS to the inherited set unless it carries the same name
    // as one of them, in which case it replaces it. That single rule is the whole
    // difference between four and five, and it is applied here rather than asserted.
    const totalFor = (carriedCaseName: string): number =>
      inherited + (base.declaredCases.some((entry) => entry.name === carriedCaseName) ? 0 : 1);

    expect(totalFor(brand.carriedCaseName)).toBe(brand.totalLegacyCases);
    expect(totalFor(product.carriedCaseName)).toBe(product.totalLegacyCases);
    expect(brand.totalLegacyCases).toBe(4);
    expect(product.totalLegacyCases).toBe(5);
    expect(brand.caseArithmetic.trim().length).toBeGreaterThan(40);
    expect(product.caseArithmetic.trim().length).toBeGreaterThan(40);
  });

  it('and the target suites carry the case name and every named fixture verbatim', () => {
    const offenders: string[] = [];
    for (const suite of LEGACY_TEST_MAP.legacyExtendedSuites) {
      const contents = readSubtreeFile(suite.test);
      if (!mentions(contents, suite.carriedCaseName)) {
        offenders.push(`${suite.test} no longer names ${suite.carriedCaseName}`);
      }
      for (const fixture of suite.carriedFixtures) {
        if (!mentions(contents, fixture)) {
          offenders.push(`${suite.test} no longer carries the fixture ${fixture}`);
        }
      }
      const [from, to] = suite.carriedCaseSpan;
      if (to < from) {
        offenders.push(`${suite.test} records an inverted span`);
      }
      if (!mentions(repositoryLine(suite.legacyAntecedent, from), suite.carriedCaseName)) {
        offenders.push(`${suite.legacyAntecedent}:L${from} does not open ${suite.carriedCaseName}`);
      }
      if (to > countLines(readRepositoryFile(suite.legacyAntecedent))) {
        offenders.push(`${suite.legacyAntecedent}:L${to} is past the end of the file`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and the empty legacy scaffold is proven to declare nothing at all', () => {
    const stub = requireAntecedent('meta/tests/functional/admin/entity/ProductTest.cfc');
    expect(stub.declaredCases).toEqual([]);
    expect(stub.contributesCoverage).toBe(false);
    expect(/function\s+[A-Za-z_]\w*\s*\(/.test(readRepositoryFile(stub.file))).toBe(false);
  });
});

// --- A9: exemptions are backed, and the debt register can only shrink -------

describe('A9 exemptions and pending debt', () => {
  it('every exemption states a reason worth reading', () => {
    const unexplained = LEGACY_TEST_MAP.exemptModules
      .filter((entry) => entry.reason.trim().length < 40)
      .map((entry) => `${entry.module}: no stated reason`);
    expect(unexplained.sort()).toEqual([]);
  });

  it('every runtime exemption names a suite that exists and really contains its evidence', () => {
    const offenders: string[] = [];
    for (const entry of LEGACY_TEST_MAP.exemptModules) {
      if (entry.kind !== 'runtime') {
        if (entry.exercisedBy.length !== 0) {
          offenders.push(`${entry.module}: a type-only exemption needs no runtime proof`);
        }
        continue;
      }
      if (entry.exercisedBy.length === 0) {
        offenders.push(`${entry.module}: exempt with no proof that anything exercises it`);
        continue;
      }
      for (const proof of entry.exercisedBy) {
        if (!proof.path.startsWith('tests/')) {
          offenders.push(`${entry.module}: proof lies outside the suite tree (${proof.path})`);
        } else if (!subtreeFileExists(proof.path)) {
          offenders.push(`${entry.module}: proof file is missing (${proof.path})`);
        } else if (!mentions(readSubtreeFile(proof.path), proof.evidence)) {
          offenders.push(`${entry.module}: ${proof.path} no longer contains ${proof.evidence}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('no exempt or pending module quietly owns a suite named after it', () => {
    const suiteNames = new Set(TEST_FILES_ON_DISK.map((test) => path.basename(test)));
    const promotable = [...EXEMPT_MODULES, ...PENDING_MODULES]
      .filter((module) => suiteNames.has(expectedSuiteNameFor(module)))
      .map(
        (module) =>
          `${module} now has ${expectedSuiteNameFor(module)} and belongs in coveredModules`,
      );
    expect(promotable.sort()).toEqual([]);
  });

  it('every pending entry names an owning boundary that exists and carries runtime code', () => {
    const offenders: string[] = [];
    for (const entry of LEGACY_TEST_MAP.pendingModules) {
      if (!subtreeFileExists(entry.owningBoundary)) {
        offenders.push(`${entry.module}: owning boundary is missing (${entry.owningBoundary})`);
      } else if (derivedKindOf(entry.owningBoundary) !== 'runtime') {
        offenders.push(`${entry.module}: owning boundary emits nothing to own the debt`);
      }
      if (entry.reason.trim().length < 40) {
        offenders.push(`${entry.module}: no stated reason`);
      }
      if (entry.plannedCoverage.length === 0) {
        offenders.push(`${entry.module}: no planned coverage, so the debt names no remedy`);
      }
      for (const planned of entry.plannedCoverage) {
        if (!planned.startsWith('tests/') || !planned.endsWith('.test.ts')) {
          offenders.push(`${entry.module}: planned coverage is not a suite path (${planned})`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and no planned suite exists yet, so the register can only ever shrink', () => {
    const arrived: string[] = [];
    for (const entry of LEGACY_TEST_MAP.pendingModules) {
      for (const planned of entry.plannedCoverage) {
        if (subtreeFileExists(planned)) {
          arrived.push(`${planned} now exists: move ${entry.module} into coveredModules`);
        }
      }
    }
    expect(arrived.sort()).toEqual([]);
  });
});

// --- A10: gaps stay gaps ---------------------------------------------------

describe('A10 acknowledged gaps contribute zero and are never counted as parity', () => {
  it('each contributes nothing and says why', () => {
    expect(LEGACY_TEST_MAP.acknowledgedGaps.length).toBeGreaterThanOrEqual(3);
    const offenders = LEGACY_TEST_MAP.acknowledgedGaps
      .filter(
        (gap) =>
          gap.coverageContribution !== 0 ||
          gap.subject.trim().length === 0 ||
          gap.note.trim().length < 40,
      )
      .map((gap) => `${gap.subject}: an acknowledged gap must contribute zero and explain itself`);
    expect(offenders.sort()).toEqual([]);
  });

  it('and none of them is something the map elsewhere claims as coverage', () => {
    const claimed = new Set([...MAPPED_MODULES, ...MAPPED_TESTS]);
    const contradictions = LEGACY_TEST_MAP.acknowledgedGaps
      .filter((gap) => claimed.has(gap.subject))
      .map((gap) => `${gap.subject} is both a gap and a covered path`);
    expect(contradictions).toEqual([]);
  });

  it('and every harness trait left behind cites a real line of a real legacy file', () => {
    expect(LEGACY_TEST_MAP.harnessTraitsNotCarried.length).toBeGreaterThanOrEqual(4);
    const offenders: string[] = [];
    for (const trait of LEGACY_TEST_MAP.harnessTraitsNotCarried) {
      const { file, line } = splitCitation(trait.locator);
      if (!existsSync(path.join(REPOSITORY_ROOT, file))) {
        offenders.push(`${trait.locator}: legacy file is missing`);
        continue;
      }
      if (!(line >= 1 && line <= countLines(readRepositoryFile(file)))) {
        offenders.push(`${trait.locator}: cited line is outside the file`);
      }
      if (trait.trait.trim().length < 30 || trait.whyNotCarried.trim().length < 30) {
        offenders.push(`${trait.locator}: trait recorded without a reason`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});

// --- A11: preserved TODOs on both sides ------------------------------------

describe('A11 preserved TODOs are still TODOs in the source and in the target', () => {
  it('each cited legacy line still carries the reference recorded for it', () => {
    const offenders = LEGACY_TEST_MAP.preservedTodos
      .filter(
        (todo) => !mentions(repositoryLine(todo.legacyFile, todo.legacyLine), todo.legacyEvidence),
      )
      .map(
        (todo) => `${todo.legacyFile}:L${todo.legacyLine} no longer carries ${todo.legacyEvidence}`,
      );
    expect(offenders.sort()).toEqual([]);
  });

  it('and every recording target exists and still records it', () => {
    const offenders: string[] = [];
    for (const todo of LEGACY_TEST_MAP.preservedTodos) {
      if (todo.recordedIn.length === 0) {
        offenders.push(`${todo.reference}: recorded nowhere in the target`);
        continue;
      }
      for (const target of todo.recordedIn) {
        if (!subtreeFileExists(target)) {
          offenders.push(`${todo.reference}: ${target} is missing`);
        } else if (!mentions(readSubtreeFile(target), todo.recordedEvidence)) {
          offenders.push(`${todo.reference}: ${target} no longer records ${todo.recordedEvidence}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and the ticket the plan names by number is one of them, still deferred', () => {
    const ticket = LEGACY_TEST_MAP.preservedTodos.find(
      (todo) => todo.recordedEvidence === 'issue_1766',
    );
    if (!ticket) {
      throw new Error(
        'the preserved return-and-exchange deferral is no longer recorded. Completing it ' +
          'silently is exactly what the carry-forward directive forbids.',
      );
    }
    expect(ticket.legacyFile).toBe('model/service/PromotionService.cfc');
    expect(repositoryLine(ticket.legacyFile, ticket.legacyLine)).toContain('TODO');
    expect(mentions(readSubtreeFile('src/services/promotionService.ts'), 'issue_1766')).toBe(true);
  });
});

// --- A12: the interface-parity ledger -------------------------------------

describe('A12 interface parity: three fixed budgets, checked by declaration text', () => {
  const ledger: readonly ParityEntry[] = [
    ...LEGACY_TEST_MAP.visibilityWidenings,
    ...LEGACY_TEST_MAP.signatureReshapings,
    ...LEGACY_TEST_MAP.entityLayerWidenings,
  ];

  it('budgets five visibility widenings, four reshaping rows, one entity widening', () => {
    expect(LEGACY_TEST_MAP.visibilityWidenings.length).toBe(5);
    expect(LEGACY_TEST_MAP.signatureReshapings.length).toBe(4);
    expect(LEGACY_TEST_MAP.entityLayerWidenings.length).toBe(1);
  });

  it('and the four reshaping rows enumerate the three budgeted reshapings', () => {
    const smartListPair = LEGACY_TEST_MAP.signatureReshapings.filter(
      (entry) => entry.symbol === 'findProducts' || entry.symbol === 'findSkus',
    );
    expect(smartListPair.length).toBe(2);
    expect(LEGACY_TEST_MAP.signatureReshapings.length - smartListPair.length + 1).toBe(3);
  });

  it('every widening is a widening of visibility, declared in one service', () => {
    const offenders = LEGACY_TEST_MAP.visibilityWidenings
      .filter(
        (entry) =>
          entry.module !== 'src/services/promotionService.ts' ||
          !entry.declaration.startsWith('public '),
      )
      .map((entry) => `${entry.symbol}: a visibility widening must be declared public`);
    expect(offenders.sort()).toEqual([]);
  });

  it('every ledger row is declared exactly as recorded, in the module recorded', () => {
    const offenders: string[] = [];
    for (const entry of ledger) {
      if (!subtreeFileExists(entry.module)) {
        offenders.push(`${entry.symbol}: ${entry.module} is missing`);
        continue;
      }
      const contents = readSubtreeFile(entry.module);
      if (!mentions(contents, entry.declaration)) {
        offenders.push(`${entry.symbol}: ${entry.module} no longer declares it as recorded`);
      }
      if (!entry.declaration.includes(entry.symbol)) {
        offenders.push(`${entry.symbol}: the recorded declaration does not name the symbol`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and every legacy locator points inside a legacy file that exists', () => {
    const offenders: string[] = [];
    for (const entry of ledger) {
      const { file, line } = splitCitation(entry.legacyLocator);
      if (!existsSync(path.join(REPOSITORY_ROOT, file))) {
        offenders.push(`${entry.symbol}: legacy file is missing (${entry.legacyLocator})`);
        continue;
      }
      if (!(line >= 1 && line <= countLines(readRepositoryFile(file)))) {
        offenders.push(`${entry.symbol}: cited line is outside the file (${entry.legacyLocator})`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and exactly three divergences, each owned by a module that carries its citation', () => {
    expect(LEGACY_TEST_MAP.deliberateDivergences.length).toBe(3);
    const offenders: string[] = [];
    for (const divergence of LEGACY_TEST_MAP.deliberateDivergences) {
      if (!subtreeFileExists(divergence.owningModule)) {
        offenders.push(`${divergence.citation}: ${divergence.owningModule} is missing`);
        continue;
      }
      if (!mentions(readSubtreeFile(divergence.owningModule), divergence.citation)) {
        offenders.push(
          `${divergence.citation}: not annotated in ${divergence.owningModule}, so the ` +
            'divergence is undocumented at the site',
        );
      }
      if (divergence.summary.trim().length < 40) {
        offenders.push(`${divergence.citation}: divergence recorded without a justification`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});

// --- A13: the preserved-defect register, derived rather than declared ------

describe('A13 preserved-defect register: derived from the source tree', () => {
  // Only an occurrence immediately followed by a bracket is a marker; the subtree also
  // discusses markers in prose, and counting those would inflate the register with
  // sentences ABOUT annotations instead of annotations.
  const MARKER_OPENING = 'LEGACY-DEFECT [';
  const CITATION_PATTERN = /LEGACY-DEFECT \[([^\]]+)\]/g;

  const modulesByCitation = new Map<string, string[]>();
  let markerCount = 0;
  for (const module of SOURCE_MODULES_ON_DISK) {
    const contents = readSubtreeFile(module);
    markerCount += contents.split(MARKER_OPENING).length - 1;
    for (const match of contents.matchAll(CITATION_PATTERN)) {
      const citation = (match[1] ?? '').trim();
      const holders = modulesByCitation.get(citation) ?? [];
      holders.push(module);
      modulesByCitation.set(citation, holders);
    }
  }

  it('finds a register on disk, comfortably above a conservative floor', () => {
    // The floors sit well below today's figures on purpose: they exist to catch a
    // wholesale disappearance of the register, not to freeze its exact size.
    expect(markerCount).toBeGreaterThanOrEqual(100);
    expect(modulesByCitation.size).toBeGreaterThanOrEqual(80);
    const carrying = new Set([...modulesByCitation.values()].flat());
    expect(carrying.size).toBeGreaterThanOrEqual(30);
  });

  it('and every citation it finds really is a citation', () => {
    // Loose on shape, strict on substance: a few citations legitimately name two spans
    // or compare one against another, so the check requires a line locator and nothing
    // more rigid than that.
    const malformed = [...modulesByCitation.keys()]
      .filter((citation) => citation.length === 0 || !/L\d+/.test(citation))
      .sort();
    expect(malformed).toEqual([]);
  });

  it('and every curated citation is still annotated in the module that owns it', () => {
    expect(LEGACY_TEST_MAP.requiredDefectCitations.length).toBeGreaterThanOrEqual(7);
    const offenders: string[] = [];
    for (const required of LEGACY_TEST_MAP.requiredDefectCitations) {
      if (!subtreeFileExists(required.owningModule)) {
        offenders.push(`${required.citation}: ${required.owningModule} is missing`);
        continue;
      }
      if (!mentions(readSubtreeFile(required.owningModule), required.citation)) {
        offenders.push(
          `${required.citation}: no longer annotated in ${required.owningModule}, which would ` +
            'mean a must-preserve behaviour had been quietly repaired',
        );
      }
      if (required.summary.trim().length < 30) {
        offenders.push(`${required.citation}: recorded without a summary`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and the curated list is a subset of what the tree actually annotates', () => {
    const derived = [...modulesByCitation.keys()];
    const notDerived = LEGACY_TEST_MAP.requiredDefectCitations
      .filter((required) => !derived.some((citation) => mentions(citation, required.citation)))
      .map((required) => `${required.citation} is curated but no marker on disk cites it`);
    expect(notDerived.sort()).toEqual([]);
  });
});

// --- A13b: the divergence budget, derived rather than declared -------------

describe('A13b deliberate-divergence budget: derived from the source tree', () => {
  // WHY THIS GATE EXISTS, stated plainly because it was added in response to a real
  // escape. The budget assertion in A12 above reads only THIS FILE's own
  // `deliberateDivergences` array, so a module could add a fourth divergence, announce
  // it in its own comments, and the suite would still pass - the array simply never
  // mentioned it. That happened: a cycle guard was added to
  // `src/domain/valueObjects/materializedIdPath.ts` and consumed by three entity
  // setters, each labelling itself a divergence outside the budgeted three, and every
  // gate stayed green. This block closes that hole by deriving the census FROM DISK and
  // checking it against an authorized allow-list, so an undeclared divergence fails the
  // suite wherever it is written.
  //
  // ONE CANONICAL MARKER SYNTAX, WHICH IS WHAT MAKES DERIVATION POSSIBLE. A divergence
  // is annotated `DELIBERATE DIVERGENCE [<legacy path>:<locator>]`, exactly as a
  // preserved defect is annotated `LEGACY-DEFECT [...]`. Only an occurrence immediately
  // followed by a bracket counts as a marker, so prose discussing divergences - and
  // there is a lot of it, including the record-of-removal notes left where the cycle
  // guard used to be - cannot inflate the count.
  const MARKER_OPENING = 'DELIBERATE DIVERGENCE [';
  const CITATION_PATTERN = /DELIBERATE DIVERGENCE \[([^\]]+)\]/g;

  // The five citations the three budgeted divergences are allowed to name. It is five
  // rather than three because group (c) - the entity memo defects - spans three legacy
  // sites across two modules, which is why this file's declared array carries one
  // representative citation per GROUP while the tree annotates every SITE.
  const AUTHORIZED_CITATIONS: readonly string[] = [
    'model/entity/Product.cfc:L524-L532',
    'model/entity/Sku.cfc:L500-L510',
    'model/entity/Sku.cfc:L512-L522',
    'model/service/PromotionService.cfc:L998',
    'model/service/PromotionService.cfc:L1007',
  ];

  // The only modules permitted to carry a marker. `discountAmount.ts` appears alongside
  // `promotionService.ts` because groups (a) and (b) are IMPLEMENTED in the decomposed
  // module and RECORDED at the service surface, so both sites annotate the same two
  // citations on purpose.
  const AUTHORIZED_OWNERS: readonly string[] = [
    'src/domain/entities/product.ts',
    'src/domain/entities/sku.ts',
    'src/services/promotion/discountAmount.ts',
    'src/services/promotionService.ts',
  ];

  const modulesByCitation = new Map<string, string[]>();
  let markerCount = 0;
  for (const module of SOURCE_MODULES_ON_DISK) {
    const contents = readSubtreeFile(module);
    markerCount += contents.split(MARKER_OPENING).length - 1;
    for (const match of contents.matchAll(CITATION_PATTERN)) {
      const citation = (match[1] ?? '').trim();
      const holders = modulesByCitation.get(citation) ?? [];
      holders.push(module);
      modulesByCitation.set(citation, holders);
    }
  }

  it('finds the markers on disk at all, so this block can never pass vacuously', () => {
    // ANTI-VACUITY. If the source tree were missing, empty, or stripped of markers,
    // every subset check below would pass trivially against nothing. These floors are
    // what make the rest of the block meaningful, and they are floors rather than exact
    // counts so that re-wording an annotation is not a test failure.
    expect(SOURCE_MODULES_ON_DISK.length).toBeGreaterThanOrEqual(80);
    expect(markerCount).toBeGreaterThanOrEqual(5);
    expect(modulesByCitation.size).toBeGreaterThanOrEqual(5);
  });

  it('and every citation it finds is one the budget authorizes', () => {
    // THE GATE THAT WOULD HAVE CAUGHT THE CYCLE GUARD. Any new divergence names a
    // legacy site the budget does not cover, so it lands here as an unauthorized
    // citation and fails by name.
    const unauthorized = [...modulesByCitation.keys()]
      .filter((citation) => !AUTHORIZED_CITATIONS.includes(citation))
      .map(
        (citation) =>
          `${citation} is annotated as a deliberate divergence but is not one of the three ` +
          `budgeted groups (carried by ${(modulesByCitation.get(citation) ?? []).join(', ')})`,
      );
    expect(unauthorized.sort()).toEqual([]);
  });

  it('and every module carrying a marker is one the budget authorizes', () => {
    // The companion check, in case a future divergence reuses an authorized citation
    // from an unauthorized file - which is exactly how a fourth divergence would try to
    // hide behind the reasoning of an approved one.
    const carrying = [...new Set([...modulesByCitation.values()].flat())].sort();
    const unauthorized = carrying
      .filter((module) => !AUTHORIZED_OWNERS.includes(module))
      .map((module) => `${module} carries a deliberate-divergence marker but does not own one`);
    expect(unauthorized).toEqual([]);
  });

  it('and each of the three declared groups is really annotated on disk', () => {
    // The reverse direction: the declared budget must not drift into fiction either. A
    // group that no marker cites has been silently abandoned rather than spent.
    expect(LEGACY_TEST_MAP.deliberateDivergences.length).toBe(3);
    const derived = [...modulesByCitation.keys()];
    const missing = LEGACY_TEST_MAP.deliberateDivergences
      .filter((divergence) => !derived.includes(divergence.citation))
      .map(
        (divergence) =>
          `${divergence.citation} is declared as a spent divergence but no marker on disk cites it`,
      );
    expect(missing.sort()).toEqual([]);
  });

  it('and the loose banner form is gone, so there is exactly one way to declare one', () => {
    // A three-star `DELIBERATE DIVERGENCE` banner carrying NO bracketed citation was the
    // form the cycle guard used, and it is precisely the form that evades a
    // citation-derived census. It is therefore banned outright: a divergence declares
    // itself with a citation or it does not declare itself at all. Note that the
    // three-star glyph on its own is ordinary emphasis, used widely for security and
    // atomicity boundaries, so only this two-token combination is forbidden.
    const offenders = SOURCE_MODULES_ON_DISK.filter((module) =>
      readSubtreeFile(module).includes('\u2605\u2605\u2605 DELIBERATE DIVERGENCE'),
    ).map((module) => `${module} uses the uncitable three-star divergence banner`);
    expect(offenders.sort()).toEqual([]);
  });

  it('and no module admits in prose to spending a divergence outside the budget', () => {
    // The vocabulary a self-aware fourth divergence reaches for. Every phrase below was
    // present in the shipped tree while all four preceding gates were green, which is
    // what makes them worth banning rather than a hypothetical: between them they cover
    // all four modules that carried the unbudgeted cycle guard - `materializedIdPath.ts`,
    // `priceGroup.ts`, `productType.ts` and `category.ts`. Matched case-insensitively so
    // a re-capitalisation does not slip through.
    //
    // EACH PHRASE IS AN ADMISSION AND CANNOT BE A DENIAL, and that precision is the
    // point rather than pedantry. The bare phrase "NOT ONE OF THE THREE" was tried first
    // and rejected: `src/services/optionService.ts` legitimately writes "This is a
    // secondary-register item, NOT one of the three deliberate divergences", which is a
    // correct DISCLAIMER, so banning the bare phrase would have punished an annotation
    // for being accurate. The longer form banned here - "divergence that is not one of
    // the three" - can only be an admission, because it asserts a divergence and then
    // places it outside the budget.
    //
    // "FOURTH DIVERGENCE" is likewise NOT on this list: it is used legitimately in
    // prohibition form - "NO FOURTH DIVERGENCE MAY EVER BE SPENT ANYWHERE" - at eight
    // sites, and banning it would punish the annotation that states the rule.
    const BANNED_ADMISSIONS: readonly string[] = [
      'NON-BUDGETED',
      'DIVERGENCE THAT IS NOT ONE OF THE THREE',
      'FOURTH, PROJECT-LOCAL',
      'RATHER THAN A SPEND AGAINST THE BUDGETED',
    ];
    const offenders: string[] = [];
    for (const module of SOURCE_MODULES_ON_DISK) {
      const upperCased = readSubtreeFile(module).toUpperCase();
      for (const admission of BANNED_ADMISSIONS) {
        if (upperCased.includes(admission)) {
          offenders.push(`${module} describes a divergence as "${admission}"`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});

// --- A14: the suite census balances too -----------------------------------

describe('A14 suite completeness: every test file is accounted for exactly once', () => {
  it('names every suite on disk', () => {
    expect(missingFrom(TEST_FILES_ON_DISK, DECLARED_TESTS)).toEqual([]);
  });

  it('and names no suite that is not on disk', () => {
    expect(missingFrom(DECLARED_TESTS, TEST_FILES_ON_DISK)).toEqual([]);
  });

  it('so the primary and supplementary lists partition the suite census', () => {
    expect([...DECLARED_TESTS].sort()).toEqual(TEST_FILES_ON_DISK);
    expect(MAPPED_TESTS.length + SUPPLEMENTARY_TESTS.length).toBe(TEST_FILES_ON_DISK.length);
  });

  it('and every supplementary suite names a subject it really references', () => {
    const offenders: string[] = [];
    for (const suite of LEGACY_TEST_MAP.supplementarySuites) {
      if (MAPPED_TESTS.includes(suite.test)) {
        offenders.push(`${suite.test} is already a dedicated suite`);
      }
      if (!subtreeFileExists(suite.subject)) {
        offenders.push(`${suite.test}: subject ${suite.subject} is missing`);
      } else if (!mentions(readSubtreeFile(suite.test), importSpecifierFor(suite.subject))) {
        offenders.push(`${suite.test} never references ${suite.subject}`);
      }
      if (suite.reason.trim().length < 40) {
        offenders.push(`${suite.test}: no stated reason to stand apart`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});

// --- A15: the legacy regression register is routed, not relabelled ---------

describe('A15 routed regression cases', () => {
  const ISSUES_COMPONENT = 'meta/tests/unit/IssuesTest.cfc';

  it('records exactly as many cases as the legacy component declares', () => {
    const declared = readRepositoryFile(ISSUES_COMPONENT).match(
      /function\s+issue_[A-Za-z0-9_]+\s*\(/g,
    );
    const declaredCount = declared?.length ?? 0;
    expect(declaredCount).toBeGreaterThan(0);
    expect(LEGACY_TEST_MAP.routedIssueCases.length).toBe(declaredCount);
  });

  it('each at the legacy line recorded for it', () => {
    const offenders = LEGACY_TEST_MAP.routedIssueCases
      .filter(
        (routed) => !mentions(repositoryLine(ISSUES_COMPONENT, routed.legacyLine), routed.caseName),
      )
      .map((routed) => `${routed.caseName} is not declared at L${routed.legacyLine}`);
    expect(offenders.sort()).toEqual([]);
  });

  it('and recorded somewhere in the target that exists and really names it', () => {
    const offenders: string[] = [];
    for (const routed of LEGACY_TEST_MAP.routedIssueCases) {
      if (routed.recordedIn.length === 0) {
        offenders.push(`${routed.caseName}: recorded nowhere`);
        continue;
      }
      for (const target of routed.recordedIn) {
        if (!subtreeFileExists(target)) {
          offenders.push(`${routed.caseName}: ${target} is missing`);
        } else if (!mentions(readSubtreeFile(target), routed.caseName)) {
          offenders.push(`${routed.caseName}: ${target} does not name it`);
        }
      }
      if (routed.note.trim().length < 30) {
        offenders.push(`${routed.caseName}: routed without a note`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('without any suite being relabelled as carrying a legacy assertion on that basis', () => {
    const routedSuites = new Set(
      LEGACY_TEST_MAP.routedIssueCases.flatMap((routed) => routed.recordedIn),
    );
    const alsoExtended = [...routedSuites].filter((test) => EXTENDED_SUITES.includes(test)).sort();
    expect(alsoExtended).toEqual([
      'tests/unit/domain/entities/brand.test.ts',
      'tests/unit/domain/entities/product.test.ts',
    ]);
    expect(routedSuites.size).toBeGreaterThan(alsoExtended.length);
  });
});

// --- A16: the runtime platform pin the S-17 declination rests on -----------
//
// Finding S-17 (HIGH/MAJOR, CWE-1104) reports that Node 20 and the `nodejs20.x` Lambda
// runtime are out of maintenance, and asks for a successor-runtime migration. That
// upgrade is DECLINED, because AAP 0.1.1, AAP 0.5.1 and AAP 0.9.1 each freeze the
// runtime independently and the AAP is to be aligned to rather than edited. The full
// reasoning, including why the AWS block dates are deliberately not restated as fact,
// is recorded at `esbuild.config.mjs`.
//
// A DECLINATION THAT LIVES ONLY IN PROSE IS ONE A LATER EDIT CAN QUIETLY FALSIFY, in
// either direction: by drifting off the frozen line without authorization, or by
// deleting the disposition that explains why the line is frozen at all. This block
// makes both failure modes fail the suite.
//
// It reads files only, in keeping with this module's stated contract. That costs
// nothing here, because all three artifacts the finding cites - `.nvmrc`,
// `package.json` engines, and `esbuild.config.mjs` - are files, and the invariant that
// actually matters is that they AGREE WITH EACH OTHER. A partial bump - `.nvmrc` moved
// but `engines` left behind, or an esbuild target raised without the runtime under it -
// is how a pin decays in practice, and is exactly what a single-file assertion misses.

describe('A16 runtime platform pin (S-17): the frozen Node line, across every artifact stating it', () => {
  const FROZEN_NODE_VERSION = '20.20.2';
  const FROZEN_MAJOR = 20;

  type Manifest = {
    readonly engines?: { readonly node?: string };
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  };

  const manifest = (): Manifest => JSON.parse(readSubtreeFile('package.json')) as Manifest;

  const asTuple = (version: string): readonly number[] =>
    version.split('.').map((piece) => Number.parseInt(piece, 10));

  /** True when `candidate` is greater than or equal to `floor`, compared piecewise. */
  const atLeast = (candidate: readonly number[], floor: readonly number[]): boolean => {
    for (let index = 0; index < Math.max(candidate.length, floor.length); index += 1) {
      const left = candidate[index] ?? 0;
      const right = floor[index] ?? 0;
      if (left !== right) {
        return left > right;
      }
    }
    return true;
  };

  it('pins .nvmrc to the exact version AAP 0.5.1 verified', () => {
    expect(
      readSubtreeFile('.nvmrc').trim(),
      '.nvmrc drifted off the AAP-frozen Node line: ' +
        'the S-17 declination in esbuild.config.mjs explains why this line is frozen; changing it is a plan-owner decision, not a code fix.',
    ).toBe(FROZEN_NODE_VERSION);
  });

  it('and bounds package.json engines to that same major line', () => {
    const declared = manifest().engines?.node ?? '';
    // The UPPER bound is the load-bearing half. Without `<21` the range would admit the
    // successor runtimes S-17 asks for, and admitting them silently is the one outcome
    // this declination exists to prevent - the choice belongs to the plan owner.
    expect(
      declared,
      'package.json engines lost its upper bound, so it now admits a successor runtime: ' +
        'the S-17 declination in esbuild.config.mjs explains why this line is frozen; changing it is a plan-owner decision, not a code fix.',
    ).toContain(`<${String(FROZEN_MAJOR + 1)}`);
    expect(declared).toContain(`>=${String(FROZEN_MAJOR)}.`);
  });

  it('and keeps the pinned version inside the range the manifest declares', () => {
    const declared = manifest().engines?.node ?? '';
    const floor = /> *= *(\d+\.\d+\.\d+)/.exec(declared);
    const ceiling = /< *(\d+)/.exec(declared);
    expect(floor).not.toBeNull();
    expect(ceiling).not.toBeNull();
    const pinned = asTuple(FROZEN_NODE_VERSION);
    expect(atLeast(pinned, asTuple(floor?.[1] ?? ''))).toBe(true);
    expect(pinned[0] ?? 0).toBeLessThan(Number.parseInt(ceiling?.[1] ?? '', 10));
  });

  it('and holds the esbuild target on that line, in the format AAP 0.5.2 proved by experiment', () => {
    const config = readSubtreeFile('esbuild.config.mjs');
    expect(
      config,
      'the esbuild target drifted off the AAP-frozen Node line: ' +
        'the S-17 declination in esbuild.config.mjs explains why this line is frozen; changing it is a plan-owner decision, not a code fix.',
    ).toContain(`target: 'node${String(FROZEN_MAJOR)}'`);
    // CJS is not a style preference: AAP 0.5.2 records that the ESM bundle builds and
    // then fails at runtime on `Dynamic require of "node:buffer"` from the MySQL driver.
    expect(config).toContain("format: 'cjs'");
  });

  it('and types the runtime, and TypeScript itself, against the majors AAP 0.9.1 names', () => {
    const development = manifest().devDependencies ?? {};
    expect(development['@types/node'] ?? '').toMatch(
      new RegExp(`^${String(FROZEN_MAJOR)}\\.`, 'u'),
    );
    // AAP 0.5.1 records why this one cannot float: the registry's `latest` tag now
    // resolves to a 7.x release, which would violate the plan's TypeScript 5.x bound.
    expect(development['typescript'] ?? '').toMatch(/^5\./u);
  });

  it('so no dependency is left on a caret range or a floating tag', () => {
    const declared = { ...(manifest().dependencies ?? {}), ...(manifest().devDependencies ?? {}) };
    const offenders = Object.entries(declared)
      .filter(([, specifier]) => !/^\d+\.\d+\.\d+$/u.test(specifier))
      .map(([name, specifier]) => `${name}@${specifier}`);
    // AAP 0.9.1's pass condition is "no caret ranges, no `latest`", so an exact triple
    // is the only acceptable specifier shape for every direct dependency.
    expect(
      offenders.sort(),
      'AAP 0.9.1 requires an exact version triple for every direct dependency - ' +
        'no caret ranges, no `latest` - so each name listed here has drifted.',
    ).toEqual([]);
    expect(Object.keys(declared).length).toBeGreaterThan(10);
  });

  it('and keeps the S-17 declination present, and attributed to S-17 rather than S-09', () => {
    const config = readSubtreeFile('esbuild.config.mjs');
    expect(config).toContain('RAISED AS S-17, DECLINED ON A CITED MANDATE');
    expect(config).toContain('CWE-1104');
    // S-09 in this review is a DIFFERENT finding - the product-feed URL scheme, CWE-319,
    // resolved in the renderer and feed service, each carrying its own S-09 block. This
    // file wore that label until the ids were reconciled; asserting the collision stays
    // fixed is cheaper than rediscovering which disposition answered which finding.
    expect(config).not.toContain('RAISED AS S-09');
  });
});
