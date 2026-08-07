// This module is the target-side replacement for `meta/tests/coverage/EntityCoverageTest.cfc`,
// mandated by AAP 0.3.1 (the layout entry "machine-readable legacy-extended vs net-new map").
//
// LEGACY-NOTE [meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54]: the entity directory is
// resolved from `expandPath("/Slatwall/com/entity/")`, a path absent from the distribution - the
// entities live in `model/entity/`.
//
// LEGACY-NOTE [meta/tests/coverage/EntityCoverageTest.cfc:L69]: its empty-remainder comparison
// could therefore only ever succeed vacuously.
//
// Neither is preserved: this module enumerates the directories that exist, so the floor it
// provides is real.

// Nothing was deleted in either move and no coverage was thinned.
//
// JUDGMENT CALL: the module census keeps three categories - covered, exempt and pending - even
// where the third holds no entries, so a module owed a suite has a category to be filed under.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Dirent } from 'node:fs';

// Both roots are resolved from this module's own location and then PROVEN, because every assertion
// below reads the tree relative to them.

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

// Node built-ins only: no glob dependency is added, and the pinned package set is untouched.

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

// Lists the FILES sitting directly in the subtree root, which is where the plan's twelve root
// artifacts live.
//
// A developer's local `.env`, an `.eslintcache` or a stray `*.tsbuildinfo` is not a scope addition
// and must not be reported as one.
//
// This list stays all the same, and its job has not changed.
const UNTRACKED_ROOT_NAMES: readonly string[] = [
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.env',
  '*.tsbuildinfo',
  '*.eslintcache',
  '*.log',
];

function listSubtreeRootFiles(): string[] {
  const isIgnored = (name: string): boolean =>
    UNTRACKED_ROOT_NAMES.some((rule) =>
      rule.startsWith('*') ? name.endsWith(rule.slice(1)) : name === rule.replace(/\/$/, ''),
    );

  return readdirSync(SUBTREE_ROOT, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && !isIgnored(entry.name))
    .map((entry) => entry.name)
    .sort();
}

// Counts lines the way a reader counts them: a file that ends with a line terminator has that many
// lines, not one more.
function countLines(contents: string): number {
  const lines = contents.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
}

// Reads one 1-based line out of a file, so a cited legacy locator can be checked against what is
// actually on that line.
function repositoryLine(relativePath: string, oneBasedLine: number): string {
  const lines = readRepositoryFile(relativePath).split('\n');
  return lines[oneBasedLine - 1] ?? '';
}

const SOURCE_MODULES_ON_DISK = listTypeScriptFiles('src');
const TEST_FILES_ON_DISK = listTypeScriptFiles('tests').filter((file) => file.endsWith('.test.ts'));
const RUNTIME_VALUE_EXPORT =
  /^export\s+(?:async\s+)?(?:function|class|const|let|var|default|abstract|enum)\b/m;

type ModuleKind = 'runtime' | 'typeOnly';

const derivedKindOf = (module: string): ModuleKind =>
  RUNTIME_VALUE_EXPORT.test(readSubtreeFile(module)) ? 'runtime' : 'typeOnly';

// The specifier a consumer of `module` would write, as its parent directory plus its file name
// with the emitted extension.
function importSpecifierFor(module: string): string {
  const segments = module.split('/');
  const parent = segments[segments.length - 2] ?? '';
  return `${parent}/${path.basename(module, '.ts')}.js`;
}

const expectedSuiteNameFor = (module: string): string => `${path.basename(module, '.ts')}.test.ts`;

/**
 * A legacy locator in the shape the annotations write it: a path ending `.cfc`, `.cfm` or `.txt`
 * followed by one or more `L<n>` members joined by `-` or `,`.
 *
 * It exists so a citation can be compared by the SITES it names rather than by its text.
 */
const LEGACY_LOCATOR_PATTERN = /([\w./-]+\.(?:cfc|cfm|txt)):((?:L\d+)(?:\s*[-,]\s*L\d+)*)/g;

/**
 * A span of this many lines or fewer names one site, so it expands to its interior when locators
 * are compared.
 */
const EXPANDABLE_CITATION_SPAN = 10;

/**
 * The legacy SITES a piece of text cites, as `<path>:<line>` keys.
 *
 * Comparing sites rather than citation text is what lets the same locator be written several ways
 * without breaking a mapping: `model/dao/PromotionDAO.cfc:L177, L244` and `...:L244` name a common
 * line.
 */
function legacyCitationSites(text: string): Set<string> {
  const sites = new Set<string>();
  for (const match of text.matchAll(LEGACY_LOCATOR_PATTERN)) {
    const file = match[1] ?? '';
    for (const member of (match[2] ?? '').split(',')) {
      const numbers = [...member.matchAll(/L(\d+)/g)].map((found) =>
        Number.parseInt(found[1] ?? '', 10),
      );
      const [first, second] = numbers;
      if (
        numbers.length === 2 &&
        first !== undefined &&
        second !== undefined &&
        second > first &&
        second - first <= EXPANDABLE_CITATION_SPAN
      ) {
        for (let line = first; line <= second; line += 1) {
          sites.add(`${file}:${String(line)}`);
        }
      } else {
        for (const line of numbers) {
          sites.add(`${file}:${String(line)}`);
        }
      }
    }
  }
  return sites;
}

/**
 * True when `text` cites at least one of the legacy sites `citation` names.
 */
function citesAnySiteOf(text: string, citation: string): boolean {
  const wanted = legacyCitationSites(citation);
  const found = legacyCitationSites(text);
  return [...wanted].some((site) => found.has(site));
}

/**
 * Characters after which a `/` opens a REGULAR EXPRESSION rather than dividing.
 *
 * A regex literal may contain a quote, a double quote, a backtick, a `/` inside a character class,
 * and a `//`. Without recognising one the scanner mistakes those for a string or a comment and drifts
 * for the rest of the file - a real hazard here, because a suite asserting that emitted SQL carries
 * no quoted run writes exactly `/'[^']*'/gu`.
 */
const REGEX_MAY_FOLLOW = new Set('([{,;:=!&|?+-*%~^<>'.split(''));

/**
 * Keywords after which a `/` opens a regular expression, for the same reason.
 */
const REGEX_MAY_FOLLOW_KEYWORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'case',
  'in',
  'of',
  'do',
  'else',
  'yield',
  'await',
  'new',
  'delete',
  'void',
  'throw',
]);

// Stripping comments correctly requires knowing where the strings are.
//
// Why a scanner rather than a parser, and rather than an import.

interface ScannedSource {
  /**
   * Comments replaced by spaces; string, template and interpolated-code text left intact.
   */
  readonly executable: string;
  /**
   * As `executable`, but with the interior of every string and template blanked as well, so that
   * delimiters balance and a `{` inside a message cannot terminate a function body early.
   */
  readonly masked: string;
  /**
   * The exact complement of `executable`: every comment character survives, everything else becomes
   * a space. A marker word here is a real annotation rather than a mention inside a string.
   */
  readonly comments: string;
}

/**
 * Splits a JavaScript or TypeScript source file into its executable half and a brace-safe mask.
 *
 * Both outputs are exactly as long as the input, and every newline survives in both, so an offset
 * or a line number means the same thing in all three texts.
 */
function scanSource(text: string): ScannedSource {
  const executable: string[] = [];
  const masked: string[] = [];
  const comments: string[] = [];
  const push = (visible: string, hidden: string, commented?: string): void => {
    executable.push(visible);
    masked.push(hidden);
    comments.push(commented ?? (visible === '\n' ? '\n' : ' '));
  };

  /**
   * One entry per open `${`, counting the unclosed `{` inside it, so nesting closes in order.
   */
  const interpolation: number[] = [];
  let mode: 'code' | 'line' | 'block' | 'quote' | 'template' | 'regex' = 'code';
  let quote = '';
  let index = 0;
  /** Whether the regex being consumed is inside a `[...]` character class, where `/` is literal. */
  let inCharacterClass = false;
  /** The last significant code character, and the identifier ending at it, for the heuristic above. */
  let lastSignificant = '';
  let trailingWord = '';

  while (index < text.length) {
    const character = text[index] ?? '';
    const next = text[index + 1] ?? '';

    if (mode === 'line') {
      if (character === '\n') {
        mode = 'code';
        push('\n', '\n');
      } else {
        push(' ', ' ', character);
      }
      index += 1;
      continue;
    }

    if (mode === 'block') {
      if (character === '*' && next === '/') {
        mode = 'code';
        push(' ', ' ', '*');
        push(' ', ' ', '/');
        index += 2;
        continue;
      }
      const replacement = character === '\n' ? '\n' : ' ';
      push(replacement, replacement, character);
      index += 1;
      continue;
    }

    if (mode === 'quote') {
      if (character === '\\') {
        push(character, ' ');
        push(next, ' ');
        index += 2;
        continue;
      }
      const closing = character === quote;
      push(character, closing ? character : ' ');
      if (closing) {
        mode = 'code';
        quote = '';
      }
      index += 1;
      continue;
    }

    if (mode === 'template') {
      if (character === '\\') {
        push(character, ' ');
        push(next, ' ');
        index += 2;
        continue;
      }
      if (character === '$' && next === '{') {
        // Interpolated code is code, so it returns to `code` mode; the braces stay in the mask on
        // both sides, which is what keeps an enclosing function body balanced across an
        // interpolation.
        interpolation.push(0);
        mode = 'code';
        push('$', ' ');
        push('{', '{');
        index += 2;
        continue;
      }
      if (character === '`') {
        mode = 'code';
        push('`', '`');
        index += 1;
        continue;
      }
      push(character, character === '\n' ? '\n' : ' ');
      index += 1;
      continue;
    }

    if (mode === 'regex') {
      if (character === '\\') {
        push(character, ' ');
        push(next, ' ');
        index += 2;
        continue;
      }
      if (character === '[') {
        inCharacterClass = true;
      } else if (character === ']') {
        inCharacterClass = false;
      } else if (character === '/' && !inCharacterClass) {
        mode = 'code';
        lastSignificant = '/';
        trailingWord = '';
        push(character, character);
        index += 1;
        continue;
      }
      push(character, ' ');
      index += 1;
      continue;
    }

    if (
      character === '/' &&
      next !== '/' &&
      next !== '*' &&
      (lastSignificant === '' ||
        REGEX_MAY_FOLLOW.has(lastSignificant) ||
        REGEX_MAY_FOLLOW_KEYWORD.has(trailingWord))
    ) {
      mode = 'regex';
      inCharacterClass = false;
      push(character, character);
      index += 1;
      continue;
    }

    if (character === '/' && next === '/') {
      mode = 'line';
      push(' ', ' ', '/');
      push(' ', ' ', '/');
      index += 2;
      continue;
    }
    if (character === '/' && next === '*') {
      mode = 'block';
      push(' ', ' ', '/');
      push(' ', ' ', '*');
      index += 2;
      continue;
    }
    if (character === "'" || character === '"') {
      mode = 'quote';
      quote = character;
      push(character, character);
      index += 1;
      continue;
    }
    if (character === '`') {
      mode = 'template';
      push('`', '`');
      index += 1;
      continue;
    }
    if (interpolation.length > 0 && (character === '{' || character === '}')) {
      const depth = interpolation[interpolation.length - 1] ?? 0;
      if (character === '{') {
        interpolation[interpolation.length - 1] = depth + 1;
      } else if (depth === 0) {
        interpolation.pop();
        mode = 'template';
      } else {
        interpolation[interpolation.length - 1] = depth - 1;
      }
      push(character, character);
      index += 1;
      continue;
    }

    if (!/\s/u.test(character)) {
      lastSignificant = character;
      trailingWord = /[A-Za-z_$0-9]/u.test(character) ? `${trailingWord}${character}` : '';
    }
    push(character, character);
    index += 1;
  }

  return {
    executable: executable.join(''),
    masked: masked.join(''),
    comments: comments.join(''),
  };
}

/**
 * The balanced span that follows `anchor`, read out of executable code.
 *
 * Returns `''` when the anchor is absent or its delimiter never closes, which every caller asserts
 * against rather than tolerating - an empty body would make a `toContain` assertion vacuous.
 */
function balancedSpanAfter(scanned: ScannedSource, anchor: string): string {
  const start = scanned.masked.indexOf(anchor);
  if (start < 0 || anchor.length === 0) {
    return '';
  }

  const openIndex = start + anchor.length - 1;
  const open = scanned.masked[openIndex] ?? '';
  const close = open === '{' ? '}' : open === '[' ? ']' : open === '(' ? ')' : '';
  if (close === '') {
    return '';
  }

  let depth = 0;
  for (let index = openIndex; index < scanned.masked.length; index += 1) {
    const character = scanned.masked[index];
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return scanned.executable.slice(openIndex + 1, index);
      }
    }
  }

  return '';
}

type Lineage = 'legacy-extended' | 'net-new';

/**
 * A runtime module with a dedicated suite of its own. The floor's positive case.
 */
interface CoveredModule {
  readonly module: string;
  readonly test: string;
}
interface ExerciseProof {
  readonly path: string;
  readonly evidence: string;
}

/**
 * A module with no dedicated suite by DESIGN.
 */
interface ExemptModule {
  readonly module: string;
  readonly kind: ModuleKind;
  readonly reason: string;
  readonly exercisedBy: readonly ExerciseProof[];
}

/**
 * A runtime module that is OWED coverage, with the boundary that owes it.
 */
interface PendingModule {
  readonly module: string;
  readonly owningBoundary: string;
  readonly reason: string;
  readonly plannedCoverage: readonly string[];
}

/**
 * A suite that pins something without being any single module's dedicated suite.
 */
interface SupplementarySuite {
  readonly test: string;
  readonly subject: string;
  readonly reason: string;
}

/**
 * A target suite that carries assertions forward from a legacy component.
 */
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

/**
 * A legacy test component that bears on this slice, and what it contributes.
 */
interface LegacyAntecedent {
  readonly file: string;
  readonly lineCount: number;
  readonly declaredCases: readonly { readonly name: string; readonly line: number }[];
  readonly contributesCoverage: boolean;
  readonly note: string;
}

/**
 * A legacy regression case whose claim is recorded somewhere in the target.
 */
interface RoutedIssueCase {
  readonly caseName: string;
  readonly legacyLine: number;
  readonly recordedIn: readonly string[];
  readonly note: string;
}

/**
 * A legacy TODO carried across as a TODO rather than silently completed.
 */
interface PreservedTodo {
  readonly reference: string;
  readonly legacyFile: string;
  readonly legacyLine: number;
  readonly legacyEvidence: string;
  readonly recordedIn: readonly string[];
  readonly recordedEvidence: string;
}

/**
 * One entry in a fixed interface-parity budget.
 */
interface ParityEntry {
  readonly symbol: string;
  readonly module: string;
  readonly declaration: string;
  readonly legacyLocator: string;
}

/**
 * A divergence from the source that was taken deliberately and is owned somewhere.
 */
interface DivergenceEntry {
  readonly summary: string;
  readonly citation: string;
  readonly owningModule: string;
}

/**
 * A refusal this port adds on a path AAP 0.2.2 places out of SCOPE, on security grounds.
 */
interface OutOfScopeSecurityRefusal {
  readonly summary: string;
  readonly citation: string;
  readonly owningModule: string;
  /**
   * A phrase the owning module must still carry, so the reasoning cannot quietly disappear.
   */
  readonly siteEvidence: string;
}

/**
 * An OBSERVABLE REFINEMENT in a ported tier: behaviour a caller can tell apart from the legacy, in
 * the domain/service/repository layers, that is not one of the three budgeted defect divergences.
 */
interface ObservableRefinement {
  /**
   * What a caller can observe as different.
   */
  readonly summary: string;
  /**
   * The ported module where it happens.
   */
  readonly owningModule: string;
  /**
   * The suite that asserts it.
   */
  readonly assertedBy: string;
  /**
   * The AAP section that authorizes it. Must name a section, not a rationale.
   */
  readonly aapAuthority: string;
}

/**
 * A TRANSPORT-TIER policy on the net-new adapter surface, and the proof it changed no service.
 */
interface AdapterTransportPolicy {
  /**
   * What the transport does that the service tier does not ask for.
   */
  readonly summary: string;
  /**
   * The adapter module that owns the policy.
   */
  readonly owningModule: string;
  /**
   * The suite that asserts it.
   */
  readonly assertedBy: string;
  /**
   * The service-tier contract that is unchanged, and how that is known.
   */
  readonly unchangedServiceContract: string;
}

/**
 * A preserved-defect citation that must remain annotated in a named module.
 */
interface RequiredCitation {
  readonly citation: string;
  readonly owningModule: string;
  readonly summary: string;
  readonly owningSuite: string;
  readonly assertedObservable: string;
}

/**
 * A preserved-defect citation with no behavioural owner under `tests/`, and the ground on which it
 * has none.
 *
 * An entry is a claim that gets checked, not an escape hatch: the citation must still be annotated
 * on disk, `carriedBy` must match the modules that actually annotate it.
 */
interface DefectCitationExemption {
  readonly citation: string;
  readonly carriedBy: readonly string[];
  readonly ground: 'typeOnly' | 'noTargetObservable';
  readonly reason: string;
}

/**
 * Coverage this migration does not have, stated so it is never counted as parity.
 */
interface AcknowledgedGap {
  readonly subject: string;
  readonly coverageContribution: 0;
  readonly note: string;
}

/**
 * A legacy harness trait deliberately not reproduced.
 */
interface HarnessTraitNotCarried {
  readonly locator: string;
  readonly trait: string;
  readonly whyNotCarried: string;
}

/**
 * A legacy identifier whose spelling is carried into the target UNCHANGED, misspelling and all,
 * because the spelling is part of a contract rather than a private choice.
 *
 * `legacyLine` is asserted against the frozen legacy tree: the gate reads that line and requires
 * the identifier to still be on it.
 */
interface VerbatimIdentifier {
  readonly identifier: string;
  readonly legacyFile: string;
  readonly legacyLine: number;
  readonly owningModule: string;
  readonly contract:
    'structKey' | 'metadataAttribute' | 'argumentName' | 'methodName' | 'resourceBundleKey';
  readonly note: string;
}
interface LocatorCorrection {
  readonly legacyFile: string;
  readonly verifiedLine: number;
  readonly evidence: string;
  readonly asPlanned: string;
  readonly note: string;
}

/**
 * One directory of the frozen layout, with the module or suite count the plan gives it.
 */
interface FrozenDirectoryCount {
  readonly directory: string;
  readonly files: number;
}

/**
 * The frozen scope contract, as data.
 *
 * Every number here is read off the enumerated layout in AAP 0.3.1 and the census AAP 0.6.6 and
 * 0.9.4 gate against.
 */
interface FrozenScopeContract {
  readonly totalFiles: number;
  readonly rootArtifacts: readonly string[];
  readonly sourceModules: number;
  readonly mappedModules: number;
  readonly exemptModules: number;
  readonly unitSuites: number;
  readonly integrationSuites: number;
  readonly fixtures: number;
  readonly supportFiles: readonly string[];
  readonly sourceDirectories: readonly FrozenDirectoryCount[];
  readonly suiteCategories: readonly FrozenDirectoryCount[];
}

/**
 * A path this tree carries that the frozen enumeration does not, recorded rather than absorbed.
 *
 * Two kinds of authority, and exactly one per row, which is why this is a union rather than one
 * string field.
 *
 * `rootScopeException` is therefore what a root artifact claims instead, and it is not a pattern.
 */
interface RecordedScopeAddition {
  readonly path: string;
  readonly kind: 'rootArtifact' | 'sourceModule' | 'unitSuite' | 'integrationSuite';
  /**
   * Present for the four directory kinds, and absent for a root artifact.
   */
  readonly sanctioningPattern?: string;
  /**
   * Present only for a root artifact: the exact recorded exception that admits this one filename.
   */
  readonly rootScopeException?: string;
  readonly reason: string;
}

/**
 * The CLOSED set of root-artifact scope exceptions, keyed by the EXACT filename each admits.
 *
 * It remains an open item for the PLAN OWNER, and this comment is the record of that: the
 * exception is stated, its security ground is stated, and ratifying it into AAP 0.3.1.
 */
const ROOT_SCOPE_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  '.gitignore':
    'a committed ignore mechanism, required to keep a credential and the generated artifacts out of the index',
});

/**
 * A module the frozen plan classified as EXEMPT that has since earned a dedicated suite, with the
 * frozen classification preserved rather than overwritten.
 *
 * `frozenZeroContribution` records whether the plan also listed the module as contributing zero
 * coverage.
 */
interface FrozenExemptPromotion {
  readonly module: string;
  readonly frozenZeroContribution: boolean;
  readonly supersededBy: string;
  readonly reason: string;
}

/**
 * A legacy path this subtree CITES and that does not exist, recorded as deliberate.
 *
 * The register is CLOSED in practice: a new absence has to be added deliberately, which is a
 * visible edit, and the gate names any unregistered one by path.
 */
interface DeliberateLegacyAbsence {
  readonly path: string;
  readonly reason: string;
}

// Three reasons are shared verbatim by groups of rows below.
//
// A fourth once stood here, shared by the six promotion-decomposition modules that were owed a
// suite and had none.

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

export const LEGACY_TEST_MAP: {
  readonly frozenScope: FrozenScopeContract;
  readonly recordedScopeAdditions: readonly RecordedScopeAddition[];
  readonly frozenExemptPromotions: readonly FrozenExemptPromotion[];
  readonly deliberateLegacyAbsences: readonly DeliberateLegacyAbsence[];
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
  readonly outOfScopeSecurityRefusals: readonly OutOfScopeSecurityRefusal[];
  readonly verbatimIdentifiers: readonly VerbatimIdentifier[];
  readonly locatorCorrections: readonly LocatorCorrection[];
  readonly requiredDefectCitations: readonly RequiredCitation[];
  readonly defectCitationExemptions: readonly DefectCitationExemption[];
  readonly observableRefinements: readonly ObservableRefinement[];
  readonly adapterTransportPolicies: readonly AdapterTransportPolicy[];
  readonly acknowledgedGaps: readonly AcknowledgedGap[];
  readonly harnessTraitsNotCarried: readonly HarnessTraitNotCarried[];
  readonly defaultLineage: Lineage;
} = {
  // The frozen census, stated as the exact numbers the plan gives.
  //
  // AAP 0.3.1 enumerates the layout file by file: twelve root artifacts, eighty-nine source
  // modules, fifty-seven suites in eight categories, five fixtures, the setup file and this map.
  frozenScope: {
    totalFiles: 165,
    rootArtifacts: [
      '.env.example',
      '.nvmrc',
      '.prettierrc.json',
      'NOTICE-GPL.md',
      'README.md',
      'esbuild.config.mjs',
      'eslint.config.mjs',
      'package-lock.json',
      'package.json',
      'tsconfig.build.json',
      'tsconfig.json',
      'vitest.config.ts',
    ],
    sourceModules: 89,
    mappedModules: 57,
    exemptModules: 32,
    unitSuites: 51,
    integrationSuites: 6,
    fixtures: 5,
    supportFiles: ['tests/setup.ts', 'tests/traceability/legacyTestMap.ts'],
    sourceDirectories: [
      { directory: 'src/domain/entities', files: 18 },
      { directory: 'src/domain/valueObjects', files: 3 },
      { directory: 'src/domain/views', files: 3 },
      { directory: 'src/domain/promotionEngine', files: 3 },
      { directory: 'src/domain/ports', files: 13 },
      { directory: 'src/services', files: 7 },
      { directory: 'src/services/promotion', files: 9 },
      { directory: 'src/repositories/mysql', files: 8 },
      { directory: 'src/repositories/mysql/sql', files: 5 },
      { directory: 'src/handlers', files: 8 },
      { directory: 'src/integrations', files: 1 },
      { directory: 'src/integrations/google', files: 4 },
      { directory: 'src/lib', files: 2 },
      { directory: 'src/lib/cfml', files: 5 },
    ],
    suiteCategories: [
      { directory: 'tests/unit/domain/entities', files: 18 },
      { directory: 'tests/unit/domain/valueObjects', files: 3 },
      { directory: 'tests/unit/services', files: 7 },
      { directory: 'tests/unit/services/promotion', files: 9 },
      { directory: 'tests/unit/lib/cfml', files: 5 },
      { directory: 'tests/unit/handlers', files: 5 },
      { directory: 'tests/unit/integrations/google', files: 4 },
      { directory: 'tests/integration/repositories', files: 6 },
    ],
  },
  recordedScopeAdditions: [
    // Withdrawal belongs here rather than in a commit message.
    {
      path: '.gitignore',
      kind: 'rootArtifact',
      rootScopeException:
        'a committed ignore mechanism, required to keep a credential and the generated artifacts out of the index',
      reason:
        'The committed ignore mechanism. AAP 0.8.3 commits this port ' +
        'to "environment-driven configuration with no hardcoded credentials, accompanied by a ' +
        'committed `.env.example`", and AAP 0.9.5 gates on "no credential is hardcoded" and on ' +
        '`git status` showing only additions under `slatwall-ts/`. Neither survives in a FRESH ' +
        'CLONE without a tracked ignore file: rules kept in a per-clone `.git/info/exclude` ' +
        'never travel, so a developer following ' +
        'README.md could create a real `.env` holding DB_PASSWORD and stage it, or stage ' +
        "dist/'s bundles and source maps. The root `.gitignore` is a CFML-era file this port " +
        'may not modify (AAP 0.4.1), and it ignores none of the four artefact classes a Node ' +
        'build produces, so the rules have to live here. `!.env.example` keeps the committed ' +
        'contract tracked while `.env` and `.env.*` stay out of the index.',
    },
    {
      path: 'tests/integration/repositories/skusBySelectedOptions.test.ts',
      kind: 'integrationSuite',
      sanctioningPattern: 'slatwall-ts/tests/integration/**/*.test.ts',
      reason:
        'A dedicated suite over the statement module behind a MUST-PRESERVE behaviour: the ' +
        'AND-of-EXISTS option matching at [model/dao/SkuDAO.cfc:L107-L128]. AAP 0.9.3 gates ' +
        'that matching semantics explicitly, and pinning the statement text apart from the ' +
        'adapter that issues it is what makes a change to either one visible on its own.',
    },
    {
      path: 'tests/unit/handlers/bootstrap.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'The composition root owns the wiring AAP 0.3.3 makes statically verifiable - which ' +
        'adapter satisfies which port, and the cross-service ordering constraint that decides ' +
        'money [model/service/PromotionService.cfc:L241-L254 reads what ' +
        'model/service/PriceGroupService.cfc:L364-L375 writes]. None of that is observable ' +
        'from a capability suite.',
    },
    {
      path: 'tests/unit/handlers/bootstrapStatements.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'Two statement constants in the composition root each port a legacy-declared value - ' +
        'the smart list default page size [org/Hibachi/HibachiSmartList.cfc:L39] and ' +
        'OptionGroup.options\u2019 declared association order [model/entity/OptionGroup.cfc:L70] ' +
        '- and each had drifted from it while no suite could observe either.',
    },
    {
      path: 'tests/unit/handlers/errorMapper.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'The one module with no legacy antecedent at all: it maps domain failures onto ' +
        'gateway responses, so its whole content is a decision about what a caller sees. A ' +
        'wrong status or a leaked internal message is observable nowhere else.',
    },
    {
      path: 'tests/unit/handlers/router.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'The suite for the request router. AAP 0.3.1 budgets five handler suites, one per ' +
        'capability entrypoint, and names none for the router - but AAP 0.9.4 requires a test ' +
        'per converted module and router dispatch IS behaviour: it decides which capability a ' +
        'method and path reach and refuses everything else. The five capability suites drive ' +
        'that dispatch incidentally; this one asserts the route table itself.',
    },
    {
      path: 'tests/unit/lib/config.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'Environment validation is the hard-failure boundary AAP 0.8.3 requires - no ' +
        'hardcoded credential, every value from the environment - and the legacy analogue was ' +
        'a fatal abort [config/configORM.cfm:L4-L7]. A refusal that silently becomes a ' +
        'default is exactly the failure this suite exists to catch.',
    },
    {
      path: 'tests/unit/lib/logger.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'The never-log policy is a security contract: a credential or a personal-data field ' +
        'reaching stdout is unrecoverable once emitted. The suite plants synthetic secrets ' +
        'and proves the redaction, which no other suite is positioned to do.',
    },
    {
      path: 'tests/unit/repositories/connection.test.ts',
      kind: 'unitSuite',
      sanctioningPattern: 'slatwall-ts/tests/unit/**/*.test.ts',
      reason:
        'Every exported member of the one module that owns the pool: the transactional ' +
        'executor, the audit-actor gate with its COALESCE assignment and its stamp mirror, ' +
        'placeholder admission, tuple batching, and pool acquisition asserted through its ' +
        'refusals so no pool is built. AAP 0.6.5 records that Lambda has no ambient ' +
        'transaction, so commit, rollback and connection release are behaviour this port ' +
        'decides and a statement-recording repository suite cannot observe any of it.',
    },
  ],

  // The frozen-exempt modules that have since earned suites, with the plan's own classification
  // preserved.
  //
  // The plan put each of these among the thirty-two exemptions, and for two of them it went
  // further and recorded them as contributing ZERO coverage.
  frozenExemptPromotions: [
    {
      module: 'src/handlers/router.ts',
      frozenZeroContribution: false,
      supersededBy: 'tests/unit/handlers/router.test.ts',
      reason:
        'Exempt as a SHARED INTERNAL of the handler tier: AAP 0.3.1 budgets five handler suites, ' +
        'one per capability entrypoint, and names no router suite, so the route table was read as ' +
        'behaviour the five capability suites drive end to end through it. That held only while no ' +
        'router suite existed. The recorded addition now pins dispatch decisions NO capability ' +
        'suite can observe - that the table publishes five capabilities and no sixth, that a method ' +
        'mismatch is an ordinary miss with no Allow header inviting a retry, that percent-encoded ' +
        'and dot-segment paths stay unmatched rather than decoded, and a full five-by-five matrix ' +
        'proving no capability URL reaches another capability action - so the exemption is ' +
        'superseded rather than merely outvoted, and the module is classified covered.',
    },
    {
      module: 'src/lib/config.ts',
      frozenZeroContribution: true,
      supersededBy: 'tests/unit/lib/config.test.ts',
      reason:
        'AAP 0.6.6 lists no suite under tests/unit/lib/ other than the five semantic-parity ' +
        'ones, so configuration was exempt-with-reason and recorded as a zero-contribution ' +
        'gap. A security review then required the environment contract to be gated directly, ' +
        'and the suite that closed it is recorded addition nine.',
    },
    {
      module: 'src/lib/logger.ts',
      frozenZeroContribution: true,
      supersededBy: 'tests/unit/lib/logger.test.ts',
      reason:
        'Exempt and zero-contribution for the same reason as configuration. The never-log ' +
        'policy is a security contract rather than ported behaviour, so it is gated directly ' +
        'by recorded addition eleven instead of being inferred from a handler suite.',
    },
    {
      module: 'src/repositories/mysql/connection.ts',
      frozenZeroContribution: false,
      supersededBy: 'tests/unit/repositories/connection.test.ts',
      reason:
        'Exempt as shared infrastructure the repository suites reach through. Transaction, ' +
        'audit-stamp, placeholder-admission and pool-lifecycle decisions turned out to be ' +
        'behaviour no statement-recording suite can observe, so recorded addition twelve pins ' +
        'them - the executor, the actor gate, both placeholder builders, batching, and the ' +
        'acquisition refusals that prove no pool is constructed. The entry names what is pinned ' +
        'rather than claiming the module, because the transactional and tuple helpers are only part ' +
        'of what that suite covers.',
    },
    {
      module: 'src/repositories/mysql/sql/skusBySelectedOptions.sql.ts',
      frozenZeroContribution: false,
      supersededBy: 'tests/integration/repositories/skusBySelectedOptions.test.ts',
      reason:
        'Exempt as an extracted statement module, asserted through the adapter that issues ' +
        'it. It backs a must-preserve behaviour AAP 0.9.3 gates by name, so recorded addition ' +
        'four gives the statement its own suite.',
    },
    {
      module: 'src/handlers/bootstrap.ts',
      frozenZeroContribution: false,
      supersededBy: 'tests/unit/handlers/bootstrap.test.ts',
      reason:
        'AAP 0.3.1 budgets five handler suites, one per capability entrypoint, so the ' +
        'composition root was exempt as a shared internal. The wiring it decides is ' +
        'statically verifiable by design and is now pinned by recorded addition five.',
    },
    {
      module: 'src/handlers/errorMapper.ts',
      frozenZeroContribution: false,
      supersededBy: 'tests/unit/handlers/errorMapper.test.ts',
      reason:
        'Exempt as a shared internal of the handler tier under the same five-suite budget. ' +
        'It has no legacy antecedent, so every response contract it decides is net-new ' +
        'behaviour, pinned by recorded addition seven.',
    },
  ],

  // The identifier strings that more than one review has used.

  // The legacy paths this subtree cites that do not exist, and why each is cited anyway.
  //
  // Read alongside `A27`, which requires every other cited legacy path to be on disk.
  deliberateLegacyAbsences: [
    {
      path: 'model/validation/Category.json',
      reason:
        'AAP 0.2.1 names it among the six validation files that are "absent by design, not to be ' +
        'invented". Cited by src/domain/entities/category.ts and two suites precisely to record that ' +
        'Category contributes no declaratively-invoked validator.',
    },
    {
      path: 'model/validation/PromotionQualifier.json',
      reason:
        'The same AAP 0.2.1 absence. Cited by src/domain/entities/promotionQualifier.ts and the ' +
        'promotion fixtures so the entity\u2019s lack of a declared validator is stated rather than ' +
        'inferred from silence.',
    },
    {
      path: 'model/validation/PromotionApplied.json',
      reason:
        'The same AAP 0.2.1 absence, cited by the write-side entity and its suite. PromotionApplied ' +
        'is the engine\u2019s output and validates nothing declaratively, which is worth stating at the ' +
        'one entity a reader would expect a schema for.',
    },
    {
      path: 'model/validation/PromotionAccount.json',
      reason:
        'The same AAP 0.2.1 absence. Cited where PromotionAccount is recorded as INERT in this slice: ' +
        'no validation file, no service reference, no engine path.',
    },
    {
      path: 'model/service/CategoryService.cfc',
      reason:
        'Cited to record that it does not exist. Category.cfc declares hb_serviceName="contentService", ' +
        'so category operations live in ContentService by design - AAP 0.1.1 resolves this as an ' +
        'ambiguity, and the citation is the proof that no CategoryService was omitted.',
    },
    {
      path: 'model/no-such-file.cfc',
      reason:
        'A SYNTHETIC path, used by this file only, to prove `readRepositoryFile` raises on absence ' +
        'rather than answering an empty string. It must never exist; if it ever did, the case ' +
        'asserting the refusal would pass vacuously.',
    },
  ],

  // Every runtime module that owns a suite named after it. Enumerated rather than globbed, because
  // an enumeration is checkable and a glob is not.
  coveredModules: [
    // Both entries below were authored to close the two Test Assurance Gaps a security review
    // recorded.
    { module: 'src/handlers/bootstrap.ts', test: 'tests/unit/handlers/bootstrap.test.ts' },
    { module: 'src/lib/config.ts', test: 'tests/unit/lib/config.test.ts' },
    {
      module: 'src/handlers/catalogQueryHandler.ts',
      test: 'tests/unit/handlers/catalogQueryHandler.test.ts',
    },
    {
      module: 'src/handlers/skuResolutionHandler.ts',
      test: 'tests/unit/handlers/skuResolutionHandler.test.ts',
    },

    // Promoted out of `pendingModules` below, following the worked example the header describes:
    // the price-resolution entrypoint's suite now exists.
    {
      module: 'src/handlers/priceResolutionHandler.ts',
      test: 'tests/unit/handlers/priceResolutionHandler.test.ts',
    },

    // The register shrinking exactly as it was built to, for the third time.
    {
      module: 'src/handlers/promotionApplicationHandler.ts',
      test: 'tests/unit/handlers/promotionApplicationHandler.test.ts',
    },

    // 'The explicit route table that replaces the legacy subsystem routing convention.
    //
    // The suite discharges that debt by pinning the dispatch decisions themselves, none of which
    // is observable from any other module: that the table publishes five capabilities and no
    // sixth.
    //
    // Its coverage is net-new in full and is not claimed as parity.
    { module: 'src/handlers/router.ts', test: 'tests/unit/handlers/router.test.ts' },
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
    // `src/lib/jsonDocumentKeys.ts` and its suite are gone from this register because they are
    // gone from disk, and the deletion is the record rather than a note about one - the same
    // treatment `src/handlers/requestPrincipal.ts` received above.
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

    // PROMOTED out of `pendingModules`, and the second worked example of the shrink direction this
    // register was designed for - the first being `src/handlers/bootstrap.ts`.
    //
    // It said the suite pins "the observed host and the request instant the feed port CLOSES
    // over", and it called the reshaping "the reshaped ZERO-PARAMETER contract".
    {
      module: 'src/handlers/productFeedHandler.ts',
      test: 'tests/unit/handlers/productFeedHandler.test.ts',
    },
  ],

  // Every covered module's suite is named after it, with exactly one declared exception: the SQL
  // module drops its `.sql` infix.
  namingExceptions: [
    {
      module: 'src/repositories/mysql/sql/skusBySelectedOptions.sql.ts',
      test: 'tests/integration/repositories/skusBySelectedOptions.test.ts',
    },
  ],

  // Modules with no dedicated suite by DESIGN, in two kinds.
  //
  // The twenty type-only modules are exempt mechanically, not by assertion: a module whose every
  // export is an `interface` or a `type` emits no JavaScript.
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
    // Kind: 'runtime' - 'The explicit route table that replaces the legacy subsystem-routing
    // convention, and a SHARED INTERNAL of the handler tier rather than a capability of its own.
    //
    // ExercisedBy named all five capability suites, each with `handlers/router.js` as its
    // evidence.
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

  // Runtime modules that are OWED a dedicated suite and do not have one.
  pendingModules: [],

  // Suites that are nobody's dedicated suite.
  //
  // An entry here is a signal, not a convenience, so the bar for adding one is stated where it
  // will be read.
  //
  // The field is KEPT rather than deleted either way, because the census arithmetic below
  // partitions the suites on disk into primary plus supplementary, and the size of the second
  // part.
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

  // The only two target suites that carry a legacy assertion forward. Everything else in `tests/`
  // is net-new, and saying so plainly is the point of this file.
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

  // Every legacy test component that bears on this slice, with what it contributes. Line counts
  // are asserted against the files on disk, so a drifted citation fails rather than quietly
  // misdescribing the source.
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

  // Legacy regression cases whose claim is recorded somewhere in the target, under the legacy
  // naming convention so the lineage stays greppable.
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

  // Legacy TODOs carried across as TODOs. Both are gaps in the SOURCE, and closing either one here
  // would be exactly the silent completion the plan forbids.
  preservedTodos: [
    {
      reference: 'issue #1766',
      legacyFile: 'model/service/PromotionService.cfc',
      legacyLine: 543,
      legacyEvidence: 'TODO [issue #1766]',
      recordedIn: [
        'src/services/promotionService.ts',
        // The suite that DECLARES the regression cases, rather than a sibling suite that only
        // mentioned the ticket while excluding it from its own scope.
        'tests/unit/services/promotionService.test.ts',
      ],
      recordedEvidence: 'issue_1766',
      // The legacy branch for returns and exchanges is empty and carries only this reference.
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
      // The legacy template emits the element with no content.
    },
  ],

  // Private in the source, exported here so the arithmetic they carry can be pinned directly.
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

  // JUDGMENT CALL: the plan budgets three reshapings but five symbols carry them, because two of
  // the three each cover a PAIR of methods reshaped identically and for the same reason.
  //
  // Reason 1 - the anti-corruption inversion: `updateOrderAmountsWithPromotions` and
  // `updateOrderAmountsWithPriceGroups`.
  signatureReshapings: [
    {
      symbol: 'updateOrderAmountsWithPromotions',
      module: 'src/services/promotionService.ts',
      declaration: 'public async updateOrderAmountsWithPromotions(',
      legacyLocator: 'model/service/PromotionService.cfc:L58',
    },
    {
      symbol: 'updateOrderAmountsWithPriceGroups',
      module: 'src/services/priceGroupService.ts',
      declaration:
        'async updateOrderAmountsWithPriceGroups(order: OrderView): Promise<PriceGroupAppliedIntent[]> {',
      legacyLocator: 'model/service/PriceGroupService.cfc:L364',
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
      declaration: 'async generateProductFeed(criteria: FeedCriteria): Promise<string> {',
      legacyLocator: 'integrationServices/google/controllers/feed.cfc:L58',
    },
  ],

  // Exactly one entity method takes a parameter the source did not: the current moment.
  entityLayerWidenings: [
    {
      symbol: 'isCurrent',
      module: 'src/domain/entities/promotionPeriod.ts',
      declaration: 'isCurrent(now?: Date): boolean {',
      legacyLocator: 'model/entity/PromotionPeriod.cfc:L78',
    },
  ],
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

  // Transport-tier policy on the net-new adapter surface. Not divergences; see the interface.
  observableRefinements: [
    {
      summary:
        'A sorted-SKU placement whose query returns more rows than the supplied SKU array covers ' +
        'is REFUSED through SkuSortOrderError, rather than returning an array with unfilled ' +
        'positions. The legacy arrayResize sizes the result to the query row count independent of ' +
        'how many SKUs the caller supplied, so those positions were reachable as nulls.',
      owningModule: 'src/services/skuService.ts',
      assertedBy: 'tests/unit/services/skuService.test.ts',
      aapAuthority:
        'AAP 0.8.3 makes maximal strictness including noUncheckedIndexedAccess a standard this port ' +
        'is held to, so a published Sku[] must be true of the value returned; the sorted-SKU walk is ' +
        'not among the three must-preserve behaviours of AAP 0.8.1 and carries no AAP 0.6.7 defect.',
    },
    {
      summary:
        'A malformed or zero conversion rate is NOT validated when the rate table is built, so a ' +
        'rate that is never consulted is harmless exactly as it was in the legacy; only a rate ' +
        'actually used has to parse.',
      owningModule: 'src/handlers/bootstrap.ts',
      assertedBy: 'tests/unit/handlers/bootstrap.test.ts',
      aapAuthority:
        'AAP 0.4.2 freezes convertCurrency to the legacy behaviour, and the legacy ' +
        'model/service/CurrencyService.cfc:L104-L130 swallows every fetch and parse failure rather ' +
        'than refusing the table, so validating eagerly would be the divergence.',
    },
    {
      summary:
        'An unavailable rate table does NOT RAISE as the legacy does. Both unavailable-rate states - ' +
        'no table at all, and a table that does not list one of the two codes - take the ' +
        'model/service/CurrencyService.cfc:L100-L101 pass-through and answer the amount unchanged, ' +
        'because the port publishes convertCurrency as a total function. The event is never silent: ' +
        'every pass-through notifies the pass-through observer with the two currency codes, and the ' +
        'composition root logs once when it wires a converter over an empty table.',
      owningModule: 'src/handlers/bootstrap.ts',
      assertedBy: 'tests/unit/handlers/bootstrap.test.ts',
      aapAuthority:
        'AAP 0.4.2 freezes the convertCurrency SIGNATURE, and it returns Money rather than Money or ' +
        'an error, so totality is the mapped contract. The legacy distinguishes the two states - ' +
        'model/service/CurrencyService.cfc:L100-L101 returns the amount for an unlisted code, while ' +
        'L104-L131 swallows the fetch failure and then reads an unassigned variable, which CFML ' +
        'refuses at runtime - so answering the L100-L101 arm for both is the refinement, and it is ' +
        'the one the mapped signature permits. Reporting rather than refusing also keeps AAP 0.8.1 ' +
        'intact: a refusal on unavailable rates would be an invented failure mode, not a preserved one.',
    },
    {
      summary:
        'On CORRUPT data only - a cyclic parentProductTypeID - the product-type breadcrumb ' +
        'terminates at a depth ceiling and renders the acyclic prefix, where the unbounded ' +
        'recursion previously ran to MySQL cte_max_recursion_depth and failed the whole feed. No ' +
        'acyclic hierarchy observes any difference, and the ceiling sits above the deepest path the ' +
        'length="4000" column can physically record.',
      owningModule: 'src/integrations/google/googleFeedRepository.ts',
      assertedBy: 'tests/unit/integrations/google/googleFeedRepository.test.ts',
      aapAuthority:
        'AAP 0.6.5 positively REQUIRES resource bounds under the Lambda execution model; the ' +
        'ancestry walk is not among the three must-preserve behaviours of AAP 0.8.1; and the AAP ' +
        '0.6.7 register does not carry cyclic-ancestry failure as a defect to reproduce.',
    },
    {
      summary:
        'Bulk SKU creation and SKU batch writes are bounded by an explicit batch size, and a ' +
        'misconfigured bound is refused rather than silently bounding nothing.',
      owningModule: 'src/services/skuService.ts',
      assertedBy: 'tests/unit/services/skuService.test.ts',
      aapAuthority:
        'AAP 0.6.5 names the unbounded cartesian-product odometer at ' +
        'model/service/SkuService.cfc:L109-L121 as an execution-model mismatch and requires ' +
        'explicit batch limits, idempotency on retry and a documented compensation story, because ' +
        'there is no ambient cftransaction to fall back on.',
    },
    {
      summary:
        'A SKU code that already exists is refused before a write, on every creation path rather ' +
        'than only where a caller opted in, so a retried invocation reconciles against what is ' +
        'already persisted instead of duplicating it.',
      owningModule: 'src/services/skuService.ts',
      assertedBy: 'tests/unit/services/skuService.test.ts',
      aapAuthority:
        'AAP 0.6.5 requires idempotency on retry for the bulk mutation paths under Lambda, where a ' +
        'partially applied batch can be re-invoked with no ambient transaction to roll it back.',
    },
    {
      summary:
        'getOptionsForSelect returns a SelectOption[] projection rather than the Option[] the legacy ' +
        'array held, so the shape a caller receives names the two fields the select actually uses.',
      owningModule: 'src/services/optionService.ts',
      assertedBy: 'tests/unit/services/optionService.test.ts',
      aapAuthority:
        'AAP 0.4.2 maps the method as getOptionsForSelect(options: Option[]): SelectOption[], so the ' +
        'projection is the frozen mapping rather than a departure from it.',
    },
    {
      summary:
        'Product search returns a lightweight two-column row projection instead of fully hydrated ' +
        'product graphs, so one statement answers the search exactly as the legacy query did.',
      owningModule: 'src/repositories/mysql/mysqlProductRepository.ts',
      assertedBy: 'tests/integration/repositories/mysqlProductRepository.test.ts',
      aapAuthority:
        'AAP 0.4.1 makes fetch shape an explicit documented decision per repository method under ' +
        'transformation rule T3, and model/dao/ProductDAO.cfc:L419-L437 selects exactly ' +
        'productID and productName and returns one {id,value} pair per row.',
    },
    {
      summary:
        'An image path whose stored components are absent OR blank falls back to the missing-image ' +
        'path, rather than only when the component is absent.',
      owningModule: 'src/integrations/google/rssFeedRenderer.ts',
      assertedBy: 'tests/unit/integrations/google/rssFeedRenderer.test.ts',
      aapAuthority:
        'AAP 0.4.1 ports the feed against model/service/ImageService.cfc:L81-L89, whose trigger is ' +
        '!fileExists(expandPath(imagePath)) - a condition a blank component always satisfies - so ' +
        'substituting on blankness is closer to the source than substituting only on absence.',
    },
    {
      summary:
        'A sale price is emitted whenever the price comparison alone selects it, and the effective ' +
        'date interval is emitted only when an expiration exists - so an endless sale publishes the ' +
        'sale price rather than withdrawing it.',
      owningModule: 'src/integrations/google/rssFeedRenderer.ts',
      assertedBy: 'tests/unit/integrations/google/rssFeedRenderer.test.ts',
      aapAuthority:
        'AAP 0.4.1 ports integrationServices/google/views/feed/product.cfm, whose gate at L28 is ' +
        'getPrice() gt getSalePrice() and nothing else; model/entity/Sku.cfc:L560-L565 returns "" ' +
        'when no expiration is recorded, and the two engines readme.md:L1-L14 supports format that ' +
        'differently, which is recorded as an acknowledged gap rather than resolved by guessing.',
    },
  ],

  adapterTransportPolicies: [
    {
      summary:
        'The selected-options parameter carries TWO admission bounds at the routed boundary and none ' +
        'anywhere else: a byte length this adapter will read, and a ceiling on the correlated ' +
        'subqueries one invocation may commission - counted with the same list helper the statement ' +
        'builder parses the list with, so the number bounded is exactly the number of `exists` clauses ' +
        'the statement would carry. Over either bound the route answers 400 naming only the member, ' +
        'never the submitted value, and it REFUSES rather than truncating, trimming, re-ordering, ' +
        'case-folding or de-duplicating what it admits. The subquery ceiling sits four times above the ' +
        'largest list of well-formed 32-character option identifiers the byte bound can carry, so no ' +
        'selection the catalog can express reaches it.',
      owningModule: 'src/handlers/skuResolutionHandler.ts',
      assertedBy: 'tests/unit/handlers/skuResolutionHandler.test.ts',
      unchangedServiceContract:
        'ProductService.getProductSkusBySelectedOptions [model/service/ProductService.cfc:L104], ' +
        'MysqlSkuRepository and the AND-of-EXISTS statement in ' +
        'src/repositories/mysql/sql/skusBySelectedOptions.sql.ts are untouched and still answer a list ' +
        'of ANY length up to the only bound that is true of them - MAX_PLACEHOLDER_COUNT, which is ' +
        '65535 because MySQL encodes a prepared statement placeholder count in two bytes. ' +
        'tests/integration/repositories/skusBySelectedOptions.test.ts continues to pin acceptance at ' +
        'exactly that figure, which is how the service-tier contract is known to be unchanged, and an ' +
        'in-process caller holding its own admission [AAP 0.1.1] reaches the service without passing ' +
        'through this schema at all. AAP 0.4.1 lists this handler as CREATE with no source file, so ' +
        'there is no legacy HTTP admission behaviour either bound could contradict, and the ' +
        'must-preserve behaviour AAP 0.8.1 names is the SERVICE\u2019S.',
    },
    {
      summary:
        'A routed request FORWARDS an optional parameter\u2019s absence AS absence rather than ' +
        'narrowing it into a required field: `skuCode` is declared optional at the transport because ' +
        'the mapped signature declares it optional, so an omission reaches the service exactly as an ' +
        'in-process call does and receives whatever the service does with an absent argument. ' +
        'Present-but-empty is admitted unchanged too, so this tier draws NEITHER distinction - which ' +
        'is what interface parity at the mapped surface requires.',
      owningModule: 'src/handlers/skuResolutionHandler.ts',
      assertedBy: 'tests/unit/handlers/skuResolutionHandler.test.ts',
      unchangedServiceContract:
        'SkuService.getSkuBySkuCode declares skuCode optional - the legacy is ' +
        '`public any function getSkuBySkuCode( string skuCode )` with no `required` attribute, and AAP ' +
        '0.4.2 carries that verbatim as getSkuBySkuCode(skuCode?: string). The service and repository ' +
        'tiers retain responsibility for the raise an absent DAO argument reaches at ' +
        'model/dao/SkuDAO.cfc:L102, and this transport neither anticipates it nor suppresses it.',
    },
    {
      summary:
        'A malformed or unroutable request is mapped to a 4xx with a machine-readable category, ' +
        'rather than surfacing as a 5xx. The response publishes field paths and constraint ' +
        'descriptions and never the submitted value.',
      owningModule: 'src/handlers/errorMapper.ts',
      assertedBy: 'tests/unit/handlers/errorMapper.test.ts',
      unchangedServiceContract:
        'No service method observes the status code. Mapping happens strictly after a service ' +
        'either returned or threw, so the value a service computes is untouched; AAP 0.4.1 records ' +
        'this module as having no legacy equivalent at all.',
    },
    {
      summary:
        'A parsed request document carrying an own `__proto__` key is refused with a fixed, ' +
        'server-authored field issue naming the offending key and nothing else - no ancestor path, ' +
        'and no depth. This closes an asymmetry in zod strict-object validation, under which ' +
        '`constructor` is refused as unrecognized while `__proto__` is silently dropped.',
      owningModule: 'src/handlers/errorMapper.ts',
      assertedBy: 'tests/unit/handlers/errorMapper.test.ts',
      unchangedServiceContract:
        'Measured against zod 4.4.3, Object.prototype was verified UNMODIFIED in every case, so ' +
        'this closes an inconsistency rather than an active vulnerability, and no legacy request ' +
        'shape is refused - the legacy exposed no JSON body for these capabilities. No service ' +
        'method observes the check: it runs on the parsed body before any service is called, and a ' +
        'document that passes reaches the service byte-for-byte as before. Defence in depth against ' +
        'a future merge-style consumer.',
    },
    {
      summary:
        'Successful responses carry a fixed header set. The headers are a frozen constant so the ' +
        'suite asserts the exact set rather than a subset.',
      owningModule: 'src/handlers/priceResolutionHandler.ts',
      assertedBy: 'tests/unit/handlers/priceResolutionHandler.test.ts',
      unchangedServiceContract:
        'Headers are added around a payload the service already produced. No service method reads ' +
        'or writes a transport header; the legacy emitted none for these capabilities because it ' +
        'had no such endpoint.',
    },
    {
      summary:
        'The promotion-application route admits a caller only when the authorizer publishes a ' +
        'DEDICATED service grant naming this route\u2019s own capability - not merely an identified ' +
        'account, and not the general administrative claim, which admits human catalog administrators ' +
        'elsewhere in this tier. An identified caller without the grant receives a fixed 403 that names ' +
        'neither claim, refused before the body is parsed, so it costs no decode, no composition root, ' +
        'no request scope and no statement.',
      owningModule: 'src/handlers/promotionApplicationHandler.ts',
      assertedBy: 'tests/unit/handlers/promotionApplicationHandler.test.ts',
      unchangedServiceContract:
        'PromotionService.updateOrderAmountsWithPromotions and the nine decomposition modules behind ' +
        'it observe no principal, no claim and no status code: the gate runs before the envelope is ' +
        'decoded and before a composition root or request scope exists, so an admitted document reaches ' +
        'the engine byte-for-byte as it did before. The blanket removal of every applied promotion at ' +
        'the head of the pass is AAP-mandated [AAP 0.6.1] and is untouched. The legacy had no HTTP ' +
        'surface for this capability at all - AAP 0.4.1 lists this handler as CREATE with no source ' +
        'file - and its in-process caller, OrderService [model/service/OrderService.cfc:L60-L61], was ' +
        'trusted by construction because it could not be reached from outside the process; the grant is ' +
        'the strangler-fig stand-in for exactly that, so no legacy call shape is refused.',
    },
    {
      summary:
        'Administrative catalog operations require the caller principal to carry the admin claim, ' +
        'answering a non-admin caller with a fixed 403 that publishes nothing about the claim.',
      owningModule: 'src/handlers/catalogQueryHandler.ts',
      assertedBy: 'tests/unit/handlers/catalogQueryHandler.test.ts',
      unchangedServiceContract:
        'All FOURTEEN published operations are administrative in the source too. The five reads: ' +
        'getUnusedProductOptions, getUnusedProductOptionGroups, getFormattedOptionGroups and ' +
        'getOptionsForSelect are consumed only by admin/views/entity/preprocessproduct_addoption.cfm:L60 ' +
        "and its optiongroup sibling, under controllers declaring this.publicMethods='', and " +
        'searchProductsByProductType has no legacy caller at all. The nine mutations - the six in-scope ' +
        'processProduct/save Product actions plus saveProductType, deleteProduct and saveBrand - are ' +
        'reached in the legacy through admin/ alone, so publishing them strengthens the gate rather ' +
        'than reopening the question. No service method inspects the principal.',
    },
    {
      summary:
        'Each catalog operation is served on exactly one HTTP method, checked inside the handler with ' +
        'listFindNoCase after the router has matched the row\u2019s GET,POST comma list - so a read named ' +
        'on POST and a mutation named on GET are both refused with a 400 that names the selector and ' +
        'neither the method sent nor the method that would have worked.',
      owningModule: 'src/handlers/catalogQueryHandler.ts',
      assertedBy: 'tests/unit/handlers/catalogQueryHandler.test.ts',
      unchangedServiceContract:
        'The legacy slice has no HTTP vocabulary at all to preserve: the in-scope services are invoked ' +
        'by CFML method call from admin/ controllers, and FW/1 routed by subsystem convention rather ' +
        'than by verb. Pairing an operation with a method is therefore a transport decision this port ' +
        'makes, and it changes no service signature, no argument and no result - the same method is ' +
        'called with the same arguments whichever verb carried the request.',
    },
    {
      summary:
        'Every catalog mutation names an EXISTING row by identifier, which the handler hydrates through ' +
        'RequestScope.entityLoaders before calling the service; an identifier naming no row is served as ' +
        'a 200 carrying a closed unresolved reason rather than as a 404, and a ported save rule that ' +
        'failed is a 400 built from the entity\u2019s own error register rather than a throw.',
      owningModule: 'src/handlers/catalogQueryHandler.ts',
      assertedBy: 'tests/unit/handlers/catalogQueryHandler.test.ts',
      unchangedServiceContract:
        'Each ported service method keeps its legacy signature exactly: the entity is the first ' +
        'parameter, as model/service/ProductService.cfc:L113, L128, L216, L198, L208, L264, L294, L317 ' +
        'and model/service/BrandService.cfc:L67 all declare it. The three saves already returned the ' +
        'same entity whether it validated or not - org/Hibachi/HibachiService.cfc:L151-L167 - and ' +
        'deleteProduct already answered false rather than raising when its delete-context rule refused, ' +
        'so reading the returned value is transport work over an unchanged contract.',
    },
  ],
  outOfScopeSecurityRefusals: [
    {
      summary:
        'The default-image path is refused when a caller supplies a value that is not a ' +
        'single segment inside the image directory - a separator, a dot segment, a percent ' +
        'escape, a control character or an absolute path. The legacy composed its ' +
        'destination from the same caller-supplied value and moved the uploaded file with ' +
        'no check at all, but the method is out of scope, its port is a stub that touches ' +
        'no filesystem, and no name the legacy image-name generator can produce trips the ' +
        'check, so nothing an in-scope path exercises changes.',
      citation: 'model/service/ProductService.cfc:L241-L250',
      owningModule: 'src/services/productService.ts',
      siteEvidence: 'security refusal on an out-of-scope stub path',
    },
  ],

  // Every sentence in `src/**` that reads as a claim about a divergence, classified.
  //
  // The distribution is worth reading before the rows: fourteen are DENIALS, eight describe a
  // divergence between legacy components, seven record a divergence that has been REMOVED.

  // These five rows pin the harder half of the same rule: identifiers the source MISSPELLS.
  //
  // CFML parity [model/service/PromotionService.cfc:L142]: a struct key is matched
  // case-insensitively by the engine but exactly by TypeScript, so a key's spelling stops being
  // cosmetic the moment it crosses into the target.
  verbatimIdentifiers: [
    {
      identifier: 'subscriptionbenifitsrequired',
      legacyFile: 'model/service/SkuService.cfc',
      legacyLine: 143,
      owningModule: 'src/services/skuService.ts',
      contract: 'resourceBundleKey',
      note:
        'The resource-bundle identifier for a missing subscription-benefits list, misspelling ' +
        '"benefits" as "benifits". It is a DATA CONTRACT rather than prose: the legacy admin ' +
        'resolves it against its own bundles, so correcting the spelling would break every bundle ' +
        'keyed on it while the target compiled cleanly. JavaRB is deliberately not ported (AAP ' +
        '0.5.3), so the identifier survives as a plain string constant and nothing in the target ' +
        'resolves it.',
    },
    {
      identifier: 'orderItemQulifiedDiscounts',
      legacyFile: 'model/service/PromotionService.cfc',
      legacyLine: 142,
      owningModule: 'src/domain/promotionEngine/qualifiedDiscountTypes.ts',
      contract: 'structKey',
      note:
        'The qualified-discount accumulator, missing its first "a". It is the key the ' +
        'engine indexes while insert-sorting candidate discounts descending and then ' +
        'applying only the largest, so the spelling is load-bearing for the must-preserve ' +
        'discount math. The target records the original spelling alongside the symbol it ' +
        'uses rather than pretending the source spelled it correctly.',
    },
    {
      identifier: 'promtionRewards',
      legacyFile: 'model/entity/PromotionReward.cfc',
      legacyLine: 57,
      owningModule: 'src/domain/entities/promotionReward.ts',
      contract: 'metadataAttribute',
      note:
        'A permission attribute on the component declaration, missing its "o". The legacy ' +
        'administration resolves permissions by this exact string, so it is a data ' +
        'contract with something outside the ported slice and is preserved letter for ' +
        'letter. Note the locator: this sits on L57, not on the L49 the plan cites.',
    },
    {
      identifier: 'singlularname',
      legacyFile: 'model/entity/Product.cfc',
      legacyLine: 76,
      owningModule: 'src/domain/entities/product.ts',
      contract: 'metadataAttribute',
      note:
        'The singular-name attribute on the product-review association, with an extra ' +
        '"l". Because the mapper reads the attribute by name, the misspelling means the ' +
        'declared singular name is silently NOT applied - so reproducing the spelling is ' +
        'what reproduces the behaviour. The association itself belongs to a review feature ' +
        'outside this slice, which is why only the spelling is carried.',
    },
    {
      identifier: 'subsciptionUsageBenefit',
      legacyFile: 'model/entity/PriceGroup.cfc',
      legacyLine: 168,
      owningModule: 'src/domain/entities/priceGroup.ts',
      contract: 'argumentName',
      note:
        'The argument name on the add-side of a bidirectional helper, missing its "r". ' +
        'CFML resolves named arguments by this string, so a caller passing the correctly ' +
        'spelled name would not bind. Carried verbatim for that reason.',
    },
    {
      identifier: 'getSalePricExpirationDateTime',
      legacyFile: 'model/entity/Product.cfc',
      legacyLine: 618,
      owningModule: 'src/domain/entities/product.ts',
      contract: 'methodName',
      note:
        'The sharpest of the five, and verified rather than assumed: this misspelled name ' +
        'is CALLED on the default SKU but is DECLARED nowhere - the correctly spelled ' +
        'accessor two lines above is a method on the product, and the SKU entity has no ' +
        'such member under either spelling. So the branch throws whenever a default SKU is ' +
        'present, in the same way the promotion-priced accessor does. It is preserved as a ' +
        'throwing path, not quietly bound to the correctly spelled neighbour.',
    },
  ],

  // Where the plan and the source disagree about WHERE something is, the source wins and the
  // disagreement is recorded rather than silently corrected.
  //
  // These are corrections to a PLAN, not defects in the source.
  locatorCorrections: [
    {
      legacyFile: 'model/service/PromotionService.cfc',
      verifiedLine: 1006,
      evidence: 'precisionEvaluate',
      asPlanned: 'omitted from the plan\u2019s list of precision-guarded sites',
      note:
        'Inside the discount calculation the precision guard is applied at five sites, not ' +
        'four: this one wraps the subtraction handed to the rounding rule. Missing it would ' +
        'understate how much of that method is precision-guarded, and it is precisely the ' +
        'site that feeds the rounding step.',
    },
    {
      legacyFile: 'model/service/PromotionService.cfc',
      verifiedLine: 252,
      evidence: 'precisionEvaluate',
      asPlanned: 'cited four lines earlier in the plan',
      note:
        'The price-group correction term for an eligible order item. This is the site that ' +
        'makes the promotion pass depend on the price-group pass having already run, so its ' +
        'locator matters more than most.',
    },
    {
      legacyFile: 'model/entity/PromotionReward.cfc',
      verifiedLine: 57,
      evidence: 'promtionRewards',
      asPlanned: 'cited eight lines earlier in the plan',
      note:
        'The component declaration carrying both the physical table name and the ' +
        'misspelled permission attribute. Its sibling qualifier component IS declared on ' +
        'the line the plan cites, which is likely how the two came to be conflated.',
    },
    {
      legacyFile: 'model/entity/Sku.cfc',
      verifiedLine: 569,
      evidence: 'getSkuStocksDeletableFlag',
      asPlanned: 'cited one line earlier in the plan',
      note:
        'The locator-service call behind the stock-deletability memo. Recorded because the ' +
        'call is one of the service-locator sites the port injection replaces, and an ' +
        'off-by-one there sends a reader to the wrong statement.',
    },
  ],

  // A curated floor under the preserved-defect register.
  requiredDefectCitations: [
    {
      citation: 'model/service/PriceGroupService.cfc:L236',
      owningModule: 'src/services/priceGroupService.ts',
      summary:
        'The paged loop indexes its records through the implicit function scope, `local.i`, ' +
        'while the counter it declares is `i`. The spelling is preserved verbatim; on every ' +
        'supported engine both name the same variable, so the observable is unchanged.',
      owningSuite: 'tests/unit/services/priceGroupService.test.ts',
      assertedObservable: 'serialises EVERY page record',
    },
    {
      citation: 'model/service/PriceGroupService.cfc:L173',
      owningModule: 'src/services/priceGroupService.ts',
      summary:
        'The parent step of the rate cascade recurses into the product variant rather than ' +
        'the SKU variant, breaking the cascade symmetry.',
      owningSuite: 'tests/unit/services/priceGroupService.test.ts',
      assertedObservable: 'NEVER consults a SKU-level rate defined on a PARENT price group',
    },
    {
      citation: 'model/service/PromotionService.cfc:L468-L521',
      owningModule: 'src/domain/promotionEngine/rewardUsageTypes.ts',
      summary:
        'The over-use correction loop indexes the usage ledger by a name left over from ' +
        'the previous loop, so a per-order limit is enforced against the wrong reward.',
      owningSuite: 'tests/unit/services/promotion/overUseStripping.test.ts',
      assertedObservable: 'subtracts the LEAKED limit, not the examined reward',
    },
    {
      citation: 'model/entity/Sku.cfc:L258',
      owningModule: 'src/domain/entities/sku.ts',
      summary: 'A price accessor calls a collaborator method that does not exist, so it throws.',
      owningSuite: 'tests/unit/domain/entities/sku.test.ts',
      assertedObservable:
        'THROWS, because the method it calls does not exist anywhere in the source',
    },
    {
      citation: 'model/entity/Product.cfc:L598',
      owningModule: 'src/domain/entities/product.ts',
      summary:
        'A sale-price statement has no return, so execution falls through and the method ' +
        'answers zero.',
      owningSuite: 'tests/unit/domain/entities/product.test.ts',
      assertedObservable: 'branch 2 returns ZERO, not the sku sale price and not undefined',
    },
    {
      citation: 'model/dao/PromotionDAO.cfc:L51-L132',
      owningModule: 'src/domain/ports/promotionRepository.ts',
      summary:
        'The active-reward query has no ordering clause, which is what makes reward ' +
        'iteration order - and therefore a tied discount outcome - undetermined.',
      owningSuite: 'tests/integration/repositories/mysqlPromotionRepository.test.ts',
      assertedObservable: 'emits no ORDER BY clause in any of the four conditional shapes',
    },
    {
      citation: 'integrationServices/google/Integration.cfc:L49',
      owningModule: 'src/integrations/google/integration.ts',
      summary:
        'The component declares a display name belonging to an unrelated payment adapter ' +
        'while its accessor answers the correct one.',
      owningSuite: 'tests/unit/integrations/google/integration.test.ts',
      assertedObservable: "answers exactly 'Google'",
    },
  ],

  // The four preserved-defect citations with no behavioural owner, and why each has none.
  //
  // `A13` derives every `LEGACY-DEFECT [...]` citation from `src/` and requires a collected suite
  // to cite the same legacy locator, so a defect whose regression case is deleted stops being
  // covered by its comment alone.
  defectCitationExemptions: [
    {
      citation: 'integrationServices/IntegrationInterface.cfc:L76-L79',
      carriedBy: ['src/integrations/integrationInterface.ts'],
      ground: 'typeOnly',
      reason:
        'A documentation-versus-declaration contradiction on the interface itself: the member\u2019s ' +
        'comment describes returning a boolean while [L75] declares a struct. The module is a type ' +
        'declaration that emits nothing, so there is no behaviour to assert - what the adapter DOES ' +
        'return is pinned by the Google integration suite.',
    },
    {
      citation: 'integrationServices/IntegrationInterface.cfc:L82',
      carriedBy: ['src/integrations/integrationInterface.ts'],
      ground: 'typeOnly',
      reason:
        'The one interface member declared with no `access` attribute, so it is not stated to be ' +
        'public as its four siblings are. An access modifier on a CFML interface member has no ' +
        'TypeScript counterpart to observe: every member of an exported interface is visible.',
    },
    {
      citation: 'integrationServices/IntegrationInterface.cfc:L82-L87',
      carriedBy: ['src/integrations/integrationInterface.ts'],
      ground: 'typeOnly',
      reason:
        'The same member\u2019s documentation describes returning ColdSpring XML while the ' +
        'declaration says array. Again a contradiction inside a declaration that emits nothing; the ' +
        'array the adapter really answers is asserted where the adapter is.',
    },
    {
      citation: 'model/service/ProductService.cfc:L220',
      carriedBy: ['src/handlers/catalogQueryHandler.ts'],
      ground: 'noTargetObservable',
      reason:
        'The repricing loop declares its counter without `var`, so it leaks into the component ' +
        'variables scope. TypeScript has no form of that defect - a `let` in a `for` header is ' +
        'block-scoped and cannot escape - so it is unreproducible rather than unwanted, and AAP ' +
        '0.6.5 additionally requires component-level mutable state to become request-scoped. The ' +
        'loop\u2019s observable behaviour is covered by the productService suite; only the leak is not.',
    },
  ],

  // Coverage this migration does not have. Stated so that no reader can mistake the shape of the
  // suite for parity with a legacy suite that never existed.
  acknowledgedGaps: [
    {
      subject: 'meta/tests/functional/admin/entity/ProductTest.cfc',
      coverageContribution: 0,
      note:
        'An empty scaffold in the source. It is acknowledged, never counted: a file that ' +
        'declares no case cannot be extended, so the browser-driven tier has no ' +
        'antecedent to carry forward and none is claimed.',
    },
    // An entry stood here for 'the runtime modules in the pending register', reading that 'one
    // module is owed a suite of its own: the request router'.
    //
    // The two entries below are not replacements chosen to keep a count above a threshold.
    {
      subject: 'differential execution against a running legacy engine',
      coverageContribution: 0,
      note:
        'No assertion in this suite has ever been compared against CFML output produced ' +
        'by a running Lucee or ColdFusion engine. The local development environment the ' +
        'plan cites at meta/docker/slatwall-local-dev/ is not present in this checkout - ' +
        'meta/ holds only eclipse/ and tests/ - so no legacy runtime was stood up and no ' +
        'differential run exists. Every behavioural claim here rests on reading the ' +
        'cited source and, where behaviour could not be safely inferred, on reimplementing ' +
        'the algorithm and executing THAT. This bounds what parity means in this tree: ' +
        'it is agreement with the source as read, never agreement observed between two ' +
        'running systems.',
    },
    {
      subject: 'execution of any statement against a live MySQL server',
      coverageContribution: 0,
      note:
        'The repository tier under tests/integration/ drives every adapter through a ' +
        'recording executor. It pins statement text, parameter binding, binding ORDER and ' +
        'row-to-entity hydration - and it never opens a socket. No test proves a ported ' +
        'statement parses in MySQL, that a named Sw* column exists, or that a join ' +
        'resolves, because this repository carries no DDL for that schema to check against ' +
        '(the legacy application relied on Hibernate to create it). The tier is named ' +
        '"integration" for the seam it spans between adapter and statement, not for a ' +
        'database it reaches.',
    },
    {
      subject: "the frozen plan's zero-contribution record for configuration and logging",
      coverageContribution: 0,
      note:
        'AAP 0.6.6 and 0.9.4 record src/lib/config.ts and src/lib/logger.ts as exempt-with-' +
        'reason AND as contributing zero coverage, on the premise that tests/unit/lib/ holds ' +
        'only the five semantic-parity suites. That is the plan\u2019s accounting and it is kept ' +
        'here unaltered. This tree supersedes it with two RECORDED scope additions, and both ' +
        'the frozen classification and the addition that displaced it are rows in ' +
        'frozenExemptPromotions, so the movement is reportable rather than invisible. Nothing ' +
        'in the frozen plan is counted as coverage on the strength of an addition to it.',
    },
    {
      subject:
        'a dedicated suite for the request router and the two other shared handler internals',
      coverageContribution: 0,
      note:
        'AAP 0.3.1 budgets five handler suites, one per capability entrypoint, so no suite is ' +
        'planned for src/handlers/router.ts and none is claimed. It is exempt with five ' +
        'proofs - every capability suite drives its dispatch - and that is deliberately NOT ' +
        'presented as parity with a legacy router test, because the legacy tier reaches no ' +
        'handler at all. bootstrap.ts and errorMapper.ts sat under the same budget until ' +
        'recorded additions five and seven gave each one a suite.',
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
    {
      subject:
        'the option-group traversal order in createSkus [model/service/SkuService.cfc:L82, L106]',
      coverageContribution: 0,
      note:
        'UNVERIFIED PARITY, recorded rather than claimed. Both legacy sites iterate an ' +
        'UNORDERED CFML struct with for(var key in optionGroups), and CFML specifies no ' +
        'iteration order for one, so the legacy order was its engine\u2019s hashing. The port ' +
        'uses insertion order, which is the order the groups first appear in data.options. ' +
        'Order-FREE and therefore safe: the set of combinations created, their count ' +
        '(totalCombos is a product), and each SKU\u2019s option set. Order-DEPENDENT and ' +
        'therefore at risk: which sequence number [L97] stamps on which combination, and ' +
        'hence which combination [L101-L103] designates as the default SKU. It is not closed ' +
        'by measurement because no CFML engine is available - the local development ' +
        'environment the plan references does not exist in this repository - and because a ' +
        'measurement would capture one engine\u2019s hash order, which the source does not ' +
        'promise either, so pinning it would manufacture a contract rather than preserve one. ' +
        'What is owed instead is delivered: the target order is pinned exactly by ' +
        'tests/unit/services/skuService.test.ts, describe "createSkus - the option-group ' +
        'traversal order, pinned rather than assumed (F44)", six cases covering the ' +
        'code-to-combination mapping, the order-freedom of the combination set, the default-SKU ' +
        'exposure, first-appearance group order, within-group option order, and the agreement ' +
        'between the [L82] snapshot and the [L106] assignment walk that the carry loop requires.',
    },
    {
      subject:
        'the product-feed missing-image existence probe [model/service/ImageService.cfc:L81]',
      coverageContribution: 0,
      note:
        'PARTIAL PARITY, and the boundary is stated rather than implied. The legacy substitutes a ' +
        'missing-image path whenever !fileExists(expandPath(imagePath)) - a FILESYSTEM PROBE. The ' +
        'port reproduces that decision for every input where its answer is determinable from data ' +
        'alone: a path component that is SQL NULL, empty, or whitespace only interpolates to a ' +
        'path ending in a separator, which no file can satisfy, so those rows take the fallback - ' +
        'and the test now covers both components of an additional-image path, not just the SKU ' +
        'file, and covers stored-but-blank values and not just NULL ones. What remains OUT OF ' +
        'REACH is a WELL-FORMED path naming an asset that has since been deleted: answering that ' +
        'requires interrogating the asset store, and there is none to interrogate - the images sit ' +
        'behind an asset host, a Lambda has no expandPath filesystem, and a per-row HTTP probe ' +
        'would issue one network call per SKU and make feed generation depend on the storefront ' +
        'being reachable. Such a row is published with its stored path. The three-level fallback ' +
        'CHAIN [model/service/ImageService.cfc:L82-L88] is fully reproduced, resolved once by the ' +
        'composition root and handed in as ResolvedFeedSettingValues.missingImagePath, so the ' +
        'unconditional final else still means every row carries some path. Pinned by ' +
        'tests/unit/integrations/google/googleFeedRepository.test.ts, including one case that ' +
        'asserts the residual itself so the limit is visible in the suite.',
    },
    {
      subject:
        'g:sale_price_effective_date for an ENDLESS sale ' +
        '[integrationServices/google/views/feed/product.cfm:L30]',
      coverageContribution: 0,
      note:
        'ONE ELEMENT OMITTED, DECLARED RATHER THAN DEFENDED AS PARITY, and recorded here because the ' +
        'source behaviour is genuinely indeterminate. A promotion period with a null end date ' +
        'qualifies as current [model/dao/PromotionDAO.cfc:L319] and projects a null expiration ' +
        '[:L344], so an endless sale is reachable; the view then interpolates ' +
        'dateFormat(getSalePriceExpirationDateTime(), "YYYY-MM-DD") over the EMPTY STRING that ' +
        'accessor returns for it [model/entity/Sku.cfc:L560-L565]. What happens next depends on the ' +
        'engine, and the readme supports two [readme.md:L1-L14]: one formats an empty string to an ' +
        'empty string and emits the malformed interval tail "T-0", the other raises and fails the ' +
        'whole feed request. Neither is a valid ISO 8601 interval and the port will not present one ' +
        'engine’s answer as the source’s, so the element is omitted for that row. The SALE ' +
        'ITSELF is emitted, on the price comparison alone, exactly as the source gates it - an ' +
        'earlier revision withdrew the sale too, which is the wider divergence this replaces. Pinned ' +
        'by tests/unit/integrations/google/rssFeedRenderer.test.ts, which asserts the sale survives ' +
        'an absent expiration, an unrenderable expiration and an unrenderable request instant, and ' +
        'that both elements still appear in order when the whole window is renderable.',
    },
  ],

  // Legacy harness traits deliberately not reproduced. These are properties of how the legacy
  // suite ran, not assertions about the system, so carrying them forward would import defects
  // without importing behaviour.
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

// Flattened once so every assertion below reads the same lists, and so a failure can print NAMES.

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

/**
 * Members of `candidates` that `present` does not contain, as names, sorted.
 */
function missingFrom(candidates: readonly string[], present: readonly string[]): string[] {
  const known = new Set(present);
  return candidates.filter((candidate) => !known.has(candidate)).sort();
}

/**
 * True when `needle` appears in `text` as a whole reference rather than as the prefix of a longer
 * one.
 *
 * A plain substring check is not strong enough for what this file guards.
 */
function mentions(text: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(text);
}

/**
 * Splits a `<path>:L<line>` citation. Returns an empty path when it is not one.
 */
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

/**
 * Every comment line in `text` where a marker carries a bracketed locator without opening the
 * line.
 *
 * Comment lines only, with backticked spans removed first, so a module that QUOTES the marker
 * syntax while documenting it is not reported as using it.
 */
function embeddedMarkerLines(text: string): string[] {
  const MARKER_WORDS = ['LEGACY-DEFECT', 'LEGACY-NOTE', 'DELIBERATE DIVERGENCE'] as const;
  const offenders: string[] = [];
  for (const raw of text.split('\n')) {
    if (!/^\s*(?:\/\/|\*)/u.test(raw)) continue;
    const line = raw.replace(/\x60[^\x60]*\x60/gu, '``');
    for (const word of MARKER_WORDS) {
      if (!line.includes(`${word} [`)) continue;
      if (!new RegExp(`^\\s*(?://+|\\*)\\s*${word} \\[`, 'u').test(line)) {
        offenders.push(raw.trim().slice(0, 90));
      }
    }
  }
  return offenders;
}

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
    // The legacy base points its directory walk at a path this checkout does not contain, so the
    // collection it compares against is always empty.
    expect(repositoryLine('meta/tests/coverage/SlatwallCoverageTestBase.cfc', 54)).toContain(
      'com/entity',
    );
    expect(existsSync(path.join(REPOSITORY_ROOT, 'com', 'entity'))).toBe(false);
    expect(existsSync(path.join(REPOSITORY_ROOT, 'model', 'entity'))).toBe(true);
  });

  it('reads the legacy tier\u2019s stated purpose off the legacy file it lives in', () => {
    // The one sentence in the legacy tree that says out loud what the coverage tier was for. It is
    // checked against the frozen file rather than against a copy of it in this module's prose.
    const stated =
      '/Coverage - This is a series of tests that are designed to make sure there is at ' +
      'least a minimal level of testing in place when new components / files get added to ' +
      'the project';
    expect(repositoryLine('meta/tests/readme.txt', 14).trim()).toBe(stated);
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

    // The two legacy coverage locators this module's header explains are cited exactly, so the
    // explanation can be checked against the CFML tree.
    expect(own).toContain('meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54');
    expect(own).toContain('meta/tests/coverage/EntityCoverageTest.cfc:L69');

    // Every marker in this file opens a comment line and carries a bracketed locator, and the
    // preservation trailer is only ever written under a LEGACY-DEFECT.
    expect(embeddedMarkerLines(own).sort()).toEqual([]);
  });
});

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

  it('and holds src/integrations to exactly the modules AAP 0.3.1 enumerates for it', () => {
    expect(
      SOURCE_MODULES_ON_DISK.filter((module) => module.startsWith('src/integrations/')).sort(),
      'src/integrations holds exactly the modules AAP 0.3.1 enumerates for it: the interface and ' +
        'the four Google modules. A sixth is scope drift, not an addition to be recorded.',
    ).toEqual([
      'src/integrations/google/googleFeedRepository.ts',
      'src/integrations/google/googleFeedService.ts',
      'src/integrations/google/integration.ts',
      'src/integrations/google/rssFeedRenderer.ts',
      'src/integrations/integrationInterface.ts',
    ]);
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

    // A component's own case ADDS to the inherited set unless it carries the same name as one of
    // them, in which case it replaces it.
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

describe('A12 interface parity: three fixed budgets, checked by declaration text', () => {
  const ledger: readonly ParityEntry[] = [
    ...LEGACY_TEST_MAP.visibilityWidenings,
    ...LEGACY_TEST_MAP.signatureReshapings,
    ...LEGACY_TEST_MAP.entityLayerWidenings,
  ];

  it('budgets five visibility widenings, five reshaping rows, one entity widening', () => {
    expect(LEGACY_TEST_MAP.visibilityWidenings.length).toBe(5);
    expect(LEGACY_TEST_MAP.signatureReshapings.length).toBe(5);
    expect(LEGACY_TEST_MAP.entityLayerWidenings.length).toBe(1);
  });

  it('and the five reshaping rows enumerate the three budgeted reshapings, as two pairs and a single', () => {
    // Reason 2: the smart-list replacement, which AAP 0.9.2 itself groups as one of its three.
    const smartListPair = LEGACY_TEST_MAP.signatureReshapings.filter(
      (entry) => entry.symbol === 'findProducts' || entry.symbol === 'findSkus',
    );
    expect(smartListPair.length).toBe(2);

    // Reason 1: the anti-corruption inversion.
    const antiCorruptionPair = LEGACY_TEST_MAP.signatureReshapings.filter((entry) =>
      entry.symbol.startsWith('updateOrderAmountsWith'),
    );
    expect(antiCorruptionPair.length).toBe(2);
    expect(antiCorruptionPair.map((entry) => entry.symbol).sort()).toEqual([
      'updateOrderAmountsWithPriceGroups',
      'updateOrderAmountsWithPromotions',
    ]);

    // Reason 3: the feed. One symbol, so the arithmetic closes at three reasons over five symbols.
    const remaining = LEGACY_TEST_MAP.signatureReshapings.filter(
      (entry) => !smartListPair.includes(entry) && !antiCorruptionPair.includes(entry),
    );
    expect(remaining.map((entry) => entry.symbol)).toEqual(['generateProductFeed']);

    // Two pairs collapse to two reasons, plus the single: three budgeted reshapings, no fourth.
    expect(
      LEGACY_TEST_MAP.signatureReshapings.length -
        smartListPair.length -
        antiCorruptionPair.length +
        2,
    ).toBe(3);
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

  it('and exactly one out-of-scope security refusal, still reasoned at its own site', () => {
    expect(LEGACY_TEST_MAP.outOfScopeSecurityRefusals.length).toBe(1);

    const offenders: string[] = [];
    for (const refusal of LEGACY_TEST_MAP.outOfScopeSecurityRefusals) {
      if (!subtreeFileExists(refusal.owningModule)) {
        offenders.push(`${refusal.citation}: ${refusal.owningModule} is missing`);
        continue;
      }

      const contents = readSubtreeFile(refusal.owningModule);

      if (!mentions(contents, refusal.citation)) {
        offenders.push(
          `${refusal.citation}: not cited in ${refusal.owningModule}, so the refusal is ` +
            'unreasoned at the site',
        );
      }

      // Case-insensitively: the classification is what must be at the site, not its casing.
      if (!mentions(contents.toLowerCase(), refusal.siteEvidence.toLowerCase())) {
        offenders.push(
          `${refusal.citation}: ${refusal.owningModule} no longer classifies the refusal as ` +
            `"${refusal.siteEvidence}"`,
        );
      }

      if (refusal.summary.trim().length < 40) {
        offenders.push(`${refusal.citation}: refusal recorded without a justification`);
      }

      const { file } = splitCitation(refusal.citation);
      if (!existsSync(path.join(REPOSITORY_ROOT, file))) {
        offenders.push(`${refusal.citation}: legacy file is missing`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});

describe('A12b verbatim naming: misspelled legacy identifiers are carried, not corrected', () => {
  it('records every identifier whose legacy spelling is part of a contract', () => {
    expect(LEGACY_TEST_MAP.verbatimIdentifiers.length).toBe(6);
    const misspelled = LEGACY_TEST_MAP.verbatimIdentifiers.map((entry) => entry.identifier).sort();
    expect(misspelled).toEqual([
      'getSalePricExpirationDateTime',
      'orderItemQulifiedDiscounts',
      'promtionRewards',
      'singlularname',
      'subsciptionUsageBenefit',
      'subscriptionbenifitsrequired',
    ]);
  });

  it('and all THREE shipped resource-bundle keys are held to the legacy source, not to a copy', () => {
    const shipped = readSubtreeFile('src/services/skuService.ts');
    const keysByLegacyLine: readonly { readonly line: number; readonly key: string }[] = [
      { line: 143, key: 'entity.product.subscriptionbenifitsrequired' },
      { line: 148, key: 'entity.product.subscriptiontermsrequired' },
      { line: 176, key: 'validate.product.accesscontentsrequired' },
    ];
    const offenders: string[] = [];

    for (const { line, key } of keysByLegacyLine) {
      // The legacy line still passes this exact identifier to `rbKey(...)`.
      if (!repositoryLine('model/service/SkuService.cfc', line).includes(`'${key}'`)) {
        offenders.push(`${key}: no longer on model/service/SkuService.cfc:L${String(line)}`);
      }

      // And the target still ships it, character for character.
      if (!shipped.includes(`'${key}'`)) {
        offenders.push(`${key}: no longer shipped by src/services/skuService.ts`);
      }
    }

    expect(
      offenders.sort(),
      'A resource-bundle identifier is a data contract the legacy admin resolves against its own ' +
        'bundles, so it may not drift on either side. Change it in neither, or change it in both ' +
        'with a product decision.',
    ).toEqual([]);

    // The prefix asymmetry is derived from the shipped text, not restated: two `entity.` keys and
    // one `validate.` key for the same kind of failure.
    const prefixes = keysByLegacyLine
      .filter(({ key }) => shipped.includes(`'${key}'`))
      .map(({ key }) => key.split('.')[0] ?? '');

    expect(prefixes).toEqual(['entity', 'entity', 'validate']);
  });

  it('and each one is still spelled that way on the legacy line it cites', () => {
    const offenders: string[] = [];
    for (const entry of LEGACY_TEST_MAP.verbatimIdentifiers) {
      if (!existsSync(path.join(REPOSITORY_ROOT, entry.legacyFile))) {
        offenders.push(`${entry.identifier}: ${entry.legacyFile} is missing`);
        continue;
      }
      if (!repositoryLine(entry.legacyFile, entry.legacyLine).includes(entry.identifier)) {
        offenders.push(
          `${entry.identifier}: not on ${entry.legacyFile}:L${String(entry.legacyLine)}, so the ` +
            'cited locator has drifted',
        );
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and the target module that owns it still spells it the legacy way', () => {
    const offenders: string[] = [];
    for (const entry of LEGACY_TEST_MAP.verbatimIdentifiers) {
      if (!subtreeFileExists(entry.owningModule)) {
        offenders.push(`${entry.identifier}: ${entry.owningModule} is missing`);
        continue;
      }
      if (!mentions(readSubtreeFile(entry.owningModule), entry.identifier)) {
        offenders.push(
          `${entry.identifier}: no longer recorded in ${entry.owningModule}, which would mean a ` +
            'contract spelling had been silently corrected',
        );
      }
      if (entry.note.trim().length < 40) {
        offenders.push(`${entry.identifier}: carried without a stated reason`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and correctly spelled legacy method names are carried verbatim too', () => {
    const verbatimMethodName = 'getProductSkusBySelectedOptions';
    expect(readRepositoryFile('model/service/ProductService.cfc')).toContain(verbatimMethodName);
    const carriers = SOURCE_MODULES_ON_DISK.filter((module) =>
      mentions(readSubtreeFile(module), verbatimMethodName),
    );
    expect(carriers.length).toBeGreaterThan(0);
  });

  it('and the sibling control proves the reward permission really is a typo', () => {
    const qualifier = repositoryLine('model/entity/PromotionQualifier.cfc', 49);
    const reward = repositoryLine('model/entity/PromotionReward.cfc', 57);

    expect(qualifier).toContain('hb_permission="promotionPeriod.promotionQualifiers"');
    expect(qualifier).not.toContain('promtion');

    expect(reward).toContain('hb_permission="promotionPeriod.promtionRewards"');
    expect(reward).not.toContain('promotionRewards');

    // Both are CFML admin metadata with no target analogue, so neither spelling is published as a
    // member anywhere in the port - the typo is recorded, not carried into an API.
    const publishing = SOURCE_MODULES_ON_DISK.filter((module) =>
      mentions(readSubtreeFile(module), 'getPermission()'),
    );
    expect(publishing).toEqual([]);
  });
});

describe('A12c locator corrections: the source wins, and the correction is auditable', () => {
  it('records each place the plan and the source disagree about a locator', () => {
    expect(LEGACY_TEST_MAP.locatorCorrections.length).toBeGreaterThanOrEqual(4);
  });

  it('and every corrected locator really carries its evidence in the frozen legacy tree', () => {
    const offenders: string[] = [];
    for (const correction of LEGACY_TEST_MAP.locatorCorrections) {
      if (!existsSync(path.join(REPOSITORY_ROOT, correction.legacyFile))) {
        offenders.push(`${correction.legacyFile}: missing`);
        continue;
      }
      const cited = repositoryLine(correction.legacyFile, correction.verifiedLine);
      if (!cited.includes(correction.evidence)) {
        offenders.push(
          `${correction.legacyFile}:L${String(correction.verifiedLine)}: does not carry ` +
            `"${correction.evidence}", so the correction is itself wrong`,
        );
      }
      if (correction.asPlanned.trim().length === 0 || correction.note.trim().length < 40) {
        offenders.push(
          `${correction.legacyFile}:L${String(correction.verifiedLine)}: recorded without ` +
            'stating what the plan said or why the difference matters',
        );
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and the precision guard really is applied at five sites in the discount calculation', () => {
    // The correction that matters most, because it is a COUNT rather than an offset: the plan
    // lists four precision-guarded sites inside the discount calculation and the source has five.
    const contents = readRepositoryFile('model/service/PromotionService.cfc');
    const lines = contents.split(/\r?\n/);
    const guarded: number[] = [];
    for (const [index, line] of lines.entries()) {
      if (line.includes('precisionEvaluate')) {
        guarded.push(index + 1);
      }
    }
    const withinDiscountCalculation = guarded.filter((line) => line >= 987 && line <= 1018);
    expect(withinDiscountCalculation).toEqual([990, 995, 1001, 1006, 1007]);

    // And the fixed-amount branch between them is the one site with no guard, which is the second
    // of the three deliberate divergences.
    expect(repositoryLine('model/service/PromotionService.cfc', 998)).not.toContain(
      'precisionEvaluate',
    );
  });
});

describe('A13 preserved-defect register: derived from the source tree', () => {
  // Only an occurrence immediately followed by a bracket is a marker; the subtree also discusses
  // markers in prose.
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
    expect(markerCount).toBeGreaterThanOrEqual(100);
    expect(modulesByCitation.size).toBeGreaterThanOrEqual(80);
    const carrying = new Set([...modulesByCitation.values()].flat());
    expect(carrying.size).toBeGreaterThanOrEqual(30);
  });

  it('and every citation it finds really is a citation', () => {
    // Loose on shape, strict on substance: a few citations legitimately name two spans or compare
    // one against another, so the check requires a line locator and nothing more rigid than that.
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

  it('and every curated citation names a CASE that pins it, not merely a comment that cites it', () => {
    const offenders: string[] = [];
    for (const required of LEGACY_TEST_MAP.requiredDefectCitations) {
      if (!TEST_FILES_ON_DISK.includes(required.owningSuite)) {
        offenders.push(`${required.citation}: ${required.owningSuite} is not a collected suite`);
        continue;
      }
      const suite = readSubtreeFile(required.owningSuite);
      // Compared by SITE rather than by text: a 53-line span is legitimately cited line by line in
      // the suite that walks it, and demanding the identical string would be a spelling gate
      // again.
      if (!citesAnySiteOf(suite, required.citation)) {
        offenders.push(
          `${required.citation}: ${required.owningSuite} no longer cites any line of it, so the ` +
            'case and the register have come apart',
        );
      }
      // The observable is asserted as a CASE NAME, so the row cannot be satisfied by prose: the
      // fragment has to appear inside an `it(...)` declaration.
      const declaresCase = suite
        .split('\n')
        .some((line) => line.includes('it(') && line.includes(required.assertedObservable));
      if (!declaresCase) {
        offenders.push(
          `${required.citation}: ${required.owningSuite} declares no case named ` +
            `"${required.assertedObservable}", so the register promises an observable nothing runs`,
        );
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and the DEFECT-5 register row matches what the frozen legacy source actually says', () => {
    // The CONTRADICTION this CASE EXISTS to CLOSE. This row read "so the loop body throws", while
    // the owning suite asserts successful serialisation and explains at length why no throw is
    // reproducible.
    const row = LEGACY_TEST_MAP.requiredDefectCitations.find(
      (candidate) => candidate.citation === 'model/service/PriceGroupService.cfc:L236',
    );
    expect(row).toBeDefined();

    // [model/entity/Sku.cfc:L231] DECLARES the name the loop body reads through, so nothing is
    // undeclared.
    expect(repositoryLine('model/service/PriceGroupService.cfc', 231)).toContain('var local = {}');
    // [model/entity/Sku.cfc:L235] declares the counter with `var`, which on every supported engine
    // is `local.i`.
    expect(repositoryLine('model/service/PriceGroupService.cfc', 235)).toContain('var i=1');
    // [model/entity/Sku.cfc:L236] is the read the defect is named for.
    expect(repositoryLine('model/service/PriceGroupService.cfc', 236)).toContain(
      'getPageRecords()[local.i]',
    );
    // The engines the release supports are stated in the legacy readme, which is what makes "the
    // implicit local scope" a fact about this port rather than an assumption.
    expect(repositoryLine('readme.md', 6)).toContain('Coldfusion 9.0.1');
    expect(repositoryLine('readme.md', 8)).toContain('Railo 4.1');

    // And the row may no longer claim a failure the source does not produce.
    expect(row?.summary ?? '').not.toContain('throws');
  });

  it('and every citation on disk has a behavioural owner or a recorded exemption', () => {
    // The mapping, derived in both directions.
    //
    // A citation is MAPPED when a collected suite cites the same legacy locator.
    //
    // This file is excluded from the owner set on purpose: the map may not satisfy its own gate.
    const ownedPairs = new Set<string>();
    for (const suite of TEST_FILES_ON_DISK) {
      for (const pair of legacyCitationSites(readSubtreeFile(suite))) {
        ownedPairs.add(pair);
      }
    }

    // ANTI-VACUITY: the owner set has to be large before any subset check below means anything.
    expect(ownedPairs.size).toBeGreaterThan(200);

    const exemptions = new Map(
      LEGACY_TEST_MAP.defectCitationExemptions.map((entry) => [entry.citation, entry]),
    );
    const unowned: string[] = [];
    for (const [citation, holders] of modulesByCitation) {
      const pairs = [...legacyCitationSites(citation)];
      if (pairs.length === 0) {
        unowned.push(
          `${citation}: is not a parseable legacy locator (carried by ${holders.join(', ')})`,
        );
        continue;
      }
      if (pairs.some((pair) => ownedPairs.has(pair))) {
        if (exemptions.has(citation)) {
          unowned.push(
            `${citation}: recorded as having no behavioural owner, but a suite now cites it - ` +
              'delete the exemption rather than keeping a stale one',
          );
        }
        continue;
      }
      const exemption = exemptions.get(citation);
      if (exemption === undefined) {
        unowned.push(
          `${citation}: no collected suite cites this locator, so the defect is preserved by ` +
            `comment alone (carried by ${holders.join(', ')})`,
        );
        continue;
      }
      if ([...holders].sort().join(', ') !== [...exemption.carriedBy].sort().join(', ')) {
        unowned.push(
          `${citation}: the exemption records ${exemption.carriedBy.join(', ')} but the tree ` +
            `annotates it in ${holders.join(', ')}`,
        );
      }
      if (exemption.reason.trim().length < 40) {
        unowned.push(`${citation}: exempted without a reason worth reading`);
      }
      if (
        exemption.ground === 'typeOnly' &&
        holders.some((holder) => derivedKindOf(holder) !== 'runtime') === false
      ) {
        unowned.push(
          `${citation}: exempted as type-only while every module carrying it emits runtime code`,
        );
      }
    }
    expect(unowned.sort()).toEqual([]);
    expect(LEGACY_TEST_MAP.defectCitationExemptions).toHaveLength(4);
  });

  it('and the curated list is a subset of what the tree actually annotates', () => {
    const derived = [...modulesByCitation.keys()];
    const notDerived = LEGACY_TEST_MAP.requiredDefectCitations
      .filter((required) => !derived.some((citation) => mentions(citation, required.citation)))
      .map((required) => `${required.citation} is curated but no marker on disk cites it`);
    expect(notDerived.sort()).toEqual([]);
  });
});

describe('A13b deliberate-divergence budget: derived from the source tree', () => {
  const MARKER_OPENING = 'DELIBERATE DIVERGENCE [';
  const CITATION_PATTERN = /DELIBERATE DIVERGENCE \[([^\]]+)\]/g;

  // The five citations the three budgeted divergences are allowed to name.
  const AUTHORIZED_CITATIONS: readonly string[] = [
    'model/entity/Product.cfc:L524-L532',
    'model/entity/Sku.cfc:L500-L510',
    'model/entity/Sku.cfc:L512-L522',
    'model/service/PromotionService.cfc:L998',
    'model/service/PromotionService.cfc:L1007',
  ];

  // The only modules permitted to carry a marker.
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
    // ANTI-VACUITY. If the source tree were missing, empty, or stripped of markers, every subset
    // check below would pass trivially against nothing.
    expect(SOURCE_MODULES_ON_DISK.length).toBeGreaterThanOrEqual(80);
    expect(markerCount).toBeGreaterThanOrEqual(5);
    expect(modulesByCitation.size).toBeGreaterThanOrEqual(5);
  });

  it('and every citation it finds is one the budget authorizes', () => {
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
    // The companion check, in case a future divergence reuses an authorized citation from an
    // unauthorized file - which is exactly how a fourth divergence would try to hide behind the
    // reasoning of an approved one.
    const carrying = [...new Set([...modulesByCitation.values()].flat())].sort();
    const unauthorized = carrying
      .filter((module) => !AUTHORIZED_OWNERS.includes(module))
      .map((module) => `${module} carries a deliberate-divergence marker but does not own one`);
    expect(unauthorized).toEqual([]);
  });

  it('and each of the three declared groups is really annotated on disk', () => {
    // The reverse direction: the declared budget must not drift into fiction either. A group that
    // no marker cites has been silently abandoned rather than spent.
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

  it('accepts one spelling only: the marker at line start with a bracketed citation', () => {
    const offenders: string[] = [];
    for (const module of SOURCE_MODULES_ON_DISK) {
      for (const line of embeddedMarkerLines(readSubtreeFile(module))) {
        if (line.includes('DELIBERATE DIVERGENCE')) offenders.push(`${module}: ${line}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('and no module admits in prose to spending a divergence outside the budget', () => {
    // The vocabulary a self-aware fourth divergence reaches for.
    //
    // "fourth divergence" is likewise not on this list: it is used legitimately in prohibition
    // form - "no fourth divergence may ever be spent anywhere" - at eight sites.
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

  // And the tier counts published in `README.md` are derived from this same census.
  //
  // The traceability row counts `.ts` rather than `.test.ts` deliberately.
  it('and the tier counts published in README.md are derived from that census, not maintained by hand', () => {
    const unitSuites = listTypeScriptFiles('tests/unit').filter((file) =>
      file.endsWith('.test.ts'),
    );
    const integrationSuites = listTypeScriptFiles('tests/integration').filter((file) =>
      file.endsWith('.test.ts'),
    );
    const traceabilityModules = listTypeScriptFiles('tests/traceability');

    // The tiers partition the collected census: no suite is counted twice and none is missed, so a
    // published row can only be wrong by being out of date.
    expect(unitSuites.length + integrationSuites.length).toBe(TEST_FILES_ON_DISK.length);
    expect(traceabilityModules).toEqual(['tests/traceability/legacyTestMap.ts']);

    // The integration row names `tests/integration/repositories` specifically, so its label stops
    // being true the moment a suite in that tier lands anywhere else.
    expect(
      integrationSuites.filter((file) => !file.startsWith('tests/integration/repositories/')),
    ).toEqual([]);

    const readmeLines = readSubtreeFile('README.md').split('\n');
    const statedTierCount = (label: string): number => {
      const rows = readmeLines.filter(
        (line) => line.startsWith('|') && line.includes(`\`${label}\``),
      );
      expect(rows.length, `README.md must state exactly one tier row for ${label}`).toBe(1);
      const cells = (rows[0] ?? '').split('|').map((cell) => cell.trim());
      const stated = cells[2] ?? '';
      expect(stated, `README.md tier row for ${label} states no count`).toMatch(/^[0-9]+$/);
      return Number.parseInt(stated, 10);
    };

    expect(statedTierCount('tests/unit/**')).toBe(unitSuites.length);
    expect(statedTierCount('tests/integration/repositories')).toBe(integrationSuites.length);
    expect(statedTierCount('tests/traceability')).toBe(traceabilityModules.length);
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

// AAP 0.1.1, AAP 0.5.1 and AAP 0.9.1 each fix the target runtime independently: the objective is a
// slice that runs on the `nodejs20.x` Lambda runtime, Node is pinned to an exact verified version.
//
// `esbuild.config.mjs` runs its build at module scope, so importing it from a test would execute a
// bundle.

describe('A16 runtime platform pin: the frozen Node line, across every artifact stating it', () => {
  const FROZEN_NODE_VERSION = '20.20.2';
  const FROZEN_MAJOR = 20;

  type Manifest = {
    readonly engines?: { readonly node?: string };
    readonly scripts?: Readonly<Record<string, string>>;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  };

  const manifest = (): Manifest => JSON.parse(readSubtreeFile('package.json')) as Manifest;

  const asTuple = (version: string): readonly number[] =>
    version.split('.').map((piece) => Number.parseInt(piece, 10));

  /**
   * True when `candidate` is greater than or equal to `floor`, compared piecewise.
   */
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
      '.nvmrc drifted off the AAP-frozen Node line: changing it is a plan-owner decision that has to ' +
        'move .nvmrc, package.json engines, @types/node and the esbuild target together.',
    ).toBe(FROZEN_NODE_VERSION);
  });

  it('and bounds package.json engines to that same major line', () => {
    const declared = manifest().engines?.node ?? '';
    // The UPPER bound is the load-bearing half. Without `<21` the range would silently admit a
    // successor runtime, and adopting one is a plan-owner choice rather than a side effect.
    expect(
      declared,
      'package.json engines lost its upper bound, so it now admits a successor runtime: adopting one ' +
        'is a plan-owner decision, not a side effect of a code change.',
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

  it('reads the build script as executable code, so prose can never satisfy a build-option gate', () => {
    const raw = readSubtreeFile('esbuild.config.mjs');
    const scanned = scanSource(raw);

    // Character-for-character, so an offset or a line number means the same thing in all three
    // texts.
    expect(scanned.executable.length).toBe(raw.length);
    expect(scanned.masked.length).toBe(raw.length);
    expect(countLines(scanned.executable)).toBe(countLines(raw));

    // Asserted first so it is the diagnostic a maintainer sees.
    const REGEX_LITERAL_CONTEXT = /(?:[=(,:[!&|?+\-*%^~]|return|typeof|case)\s*\/(?![*/])/u;
    expect(
      REGEX_LITERAL_CONTEXT.test(scanned.masked),
      'esbuild.config.mjs now appears to hold a regular-expression literal, which scanSource does not ' +
        'model: extend the scanner before relying on the build-option assertions in A16 and A17.',
    ).toBe(false);
    // The comment strip is proven on a constructed probe rather than on this script's own prose, so
    // the guarantee survives any edit to that prose. Both comment shapes are covered.
    const probe = [
      '// Dynamic require of "node:buffer"',
      '/* --format=esm */',
      'const kept = 1;',
    ].join('\n');
    const probeScan = scanSource(probe);

    expect(probeScan.executable).not.toContain('Dynamic require of');
    expect(probeScan.executable).not.toContain('--format=esm');
    expect(probeScan.executable).toContain('const kept = 1;');

    // CODE-ONLY SENTINELS, so the strip cannot have taken the executable half away with it.
    for (const code of [
      "const ARTIFACT_EXTENSION = '.cjs';",
      "const SOURCE_MAP_EXTENSION = '.cjs.map';",
      'function buildOptions(entryPoints) {',
      "import { crc32, deflateRawSync } from 'node:zlib';",
    ]) {
      expect(scanned.executable, `${code} is executable code and must survive the scan`).toContain(
        code,
      );
    }
  });

  it('and holds the esbuild target on that line, in the format AAP 0.5.2 proved by experiment', () => {
    const scanned = scanSource(readSubtreeFile('esbuild.config.mjs'));
    const options = balancedSpanAfter(scanned, 'function buildOptions(entryPoints) {');

    // The span is proved before it is trusted.
    expect(
      options.length,
      'the buildOptions body was not located in executable code, so the assertions below would be ' +
        'reading an empty string rather than the build configuration.',
    ).toBeGreaterThan(500);
    expect(options.trimStart().startsWith('return {')).toBe(true);

    expect(
      options,
      'the esbuild target drifted off the AAP-frozen Node line: it has to move together with .nvmrc, ' +
        'package.json engines and @types/node.',
    ).toContain(`target: 'node${String(FROZEN_MAJOR)}'`);

    // CJS is not a style preference and this is no longer a text search.
    expect(
      options,
      'the emitted bundle format is no longer configured as CommonJS in buildOptions: AAP 0.5.2 proved ' +
        'by experiment that an ESM bundle builds and then dies at runtime on a dynamic require.',
    ).toContain("format: 'cjs'");

    // And the rejected alternative is selected nowhere in executable code, however it is spelled.
    // The file's prose discusses Option B at length; that discussion is not a configuration
    // change.
    expect(scanned.executable).not.toContain("format: 'esm'");
    expect(scanned.executable).not.toContain('format: "esm"');
  });

  it('and types the runtime, and TypeScript itself, against the majors AAP 0.9.1 names', () => {
    const development = manifest().devDependencies ?? {};
    expect(development['@types/node'] ?? '').toMatch(
      new RegExp(`^${String(FROZEN_MAJOR)}\\.`, 'u'),
    );
    // AAP 0.5.1 records why this one cannot float: the registry's `latest` tag now resolves to a
    // 7.x release, which would violate the plan's TypeScript 5.x bound.
    expect(development['typescript'] ?? '').toMatch(/^5\./u);
  });

  it('so no dependency is left on a caret range or a floating tag', () => {
    const declared = { ...(manifest().dependencies ?? {}), ...(manifest().devDependencies ?? {}) };
    const offenders = Object.entries(declared)
      .filter(([, specifier]) => !/^\d+\.\d+\.\d+$/u.test(specifier))
      .map(([name, specifier]) => `${name}@${specifier}`);
    // AAP 0.9.1's pass condition is "no caret ranges, no `latest`", so an exact triple is the only
    // acceptable specifier shape for every direct dependency.
    expect(
      offenders.sort(),
      'AAP 0.9.1 requires an exact version triple for every direct dependency - ' +
        'no caret ranges, no `latest` - so each name listed here has drifted.',
    ).toEqual([]);
    expect(Object.keys(declared).length).toBeGreaterThan(10);
  });

  it('and keeps the build script free of embedded security-review dispositions', () => {
    const config = readSubtreeFile('esbuild.config.mjs');
    expect(config).not.toContain('SECURITY REVIEW DISPOSITION');
    expect(config).not.toContain('CWE-');
    expect(config).not.toContain('npm audit');
    const readme = readSubtreeFile('README.md');
    expect(readme).not.toContain('Verified 2026-08-05');
    expect(readme).not.toContain('Block function _create_');
  });
});

// Search the script's RAW TEXT, which is why they had to be written around the script's own prose:
// the header explains at length why `child_process` is absent and why a `readdirSync(OUT_DIR)`
// would have picked the maps up.

describe('A17 package shape: one archive per capability, recoverable annotations, no host archive tool', () => {
  /**
   * The build script's executable half, with a brace-safe mask beside it. Never its raw text.
   */
  const buildScript = (): ScannedSource => scanSource(readSubtreeFile('esbuild.config.mjs'));

  it('makes package a real archive gate and still shells out to nothing', () => {
    type PackageManifest = {
      readonly scripts?: Readonly<Record<string, string>>;
    };

    const manifest = JSON.parse(readSubtreeFile('package.json')) as PackageManifest;
    const { executable } = buildScript();

    // The gate typechecks and then archives; it is not an alias of `build`, which emits no
    // archive.
    expect(manifest.scripts?.['package']).toBe(
      'npm run typecheck && node esbuild.config.mjs --zip',
    );
    expect(manifest.scripts?.['build']).toBe('npm run typecheck && npm run bundle');
    expect(executable).toContain('function archiveArtifacts');
    expect(executable).toContain('function buildZipArchive');
    expect(executable).toContain("import { crc32, deflateRawSync } from 'node:zlib';");
    expect(
      executable,
      'esbuild.config.mjs now reaches for a subprocess: the archive is written in-process from ' +
        'node:zlib precisely so npm run package needs no host executable.',
    ).not.toContain('child_process');
    expect(executable).not.toContain('execFileSync');
    expect(executable).not.toContain('execSync');
    expect(executable).not.toContain('spawnSync');
    expect(executable).not.toContain('spawn(');
  });

  it('emits .cjs artifacts with .cjs.map siblings, for exactly the five declared capabilities', () => {
    const scanned = buildScript();
    const { executable } = scanned;
    expect(executable).toContain("const ARTIFACT_EXTENSION = '.cjs';");
    expect(executable).toContain("const SOURCE_MAP_EXTENSION = '.cjs.map';");

    const options = balancedSpanAfter(scanned, 'function buildOptions(entryPoints) {');
    expect(options.length).toBeGreaterThan(500);
    // Esbuild names the artifact from this mapping, so the constant above only reaches `dist/`
    // through it. Asserted inside the options object, where the bundler actually reads it.
    expect(options).toContain("outExtension: { '.js': ARTIFACT_EXTENSION }");
    expect(options).toContain('sourcemap: true');
    expect(options).toContain('bundle: true');
    expect(options).toContain("platform: 'node'");
    expect(options).toContain('metafile: true');
    // Self-contained by construction: no `external` entry, so no artifact depends on a shipped
    // node_modules tree or a runtime layer.
    expect(options).not.toContain('external');

    // The entrypoint set, exactly and in ORDER. Read as data out of the frozen list rather than as
    // a substring search, so a sixth capability, a dropped one or a reordering is named here.
    const entrypointList = balancedSpanAfter(scanned, 'LAMBDA_ENTRYPOINT_FILES = Object.freeze([');
    expect(entrypointList.length).toBeGreaterThan(50);
    const declaredEntrypoints = [...entrypointList.matchAll(/'([^']+)'/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(
      declaredEntrypoints,
      'the Lambda entrypoint set changed: AAP 0.3.1 budgets exactly five capability handlers, and a ' +
        'bundle that silently omits one leaves that capability undeployable while the build reports ' +
        'success.',
    ).toEqual([
      'catalogQueryHandler.ts',
      'skuResolutionHandler.ts',
      'promotionApplicationHandler.ts',
      'priceResolutionHandler.ts',
      'productFeedHandler.ts',
    ]);
    for (const entrypoint of declaredEntrypoints) {
      expect(entrypoint.endsWith('.test.ts')).toBe(false);
      expect(entrypoint).not.toContain('/');
    }

    // And the ARTIFACT NAMES the build will derive from THEM, stated here so the deployable set is
    // named rather than implied: esbuild takes the basename from each entrypoint and the extension
    // from `outExtension`.
    expect(
      declaredEntrypoints.map((entrypoint) => entrypoint.replace(/\.ts$/u, '') + '.cjs'),
    ).toEqual([
      'catalogQueryHandler.cjs',
      'skuResolutionHandler.cjs',
      'promotionApplicationHandler.cjs',
      'priceResolutionHandler.cjs',
      'productFeedHandler.cjs',
    ]);
  });

  it('archives the artifact and the licence, and NEVER the source map', () => {
    const scanned = buildScript();
    const { executable } = scanned;

    // The entry list is stated as data in one function, so the exclusion is a decision rather than
    // a property of a directory listing - a `readdirSync(OUT_DIR)` would pick the maps up again.
    expect(executable).toContain('function archiveEntrySources');
    expect(executable).toContain("path.join(SUBTREE_DIR, 'NOTICE-GPL.md')");
    const entryBuilder = balancedSpanAfter(scanned, 'function archiveEntrySources(artifact) {');
    expect(entryBuilder.length).toBeGreaterThan(100);
    expect(entryBuilder).toContain("path.join(SUBTREE_DIR, 'NOTICE-GPL.md')");
    expect(entryBuilder).toContain('path.basename(artifact)');
    expect(
      entryBuilder,
      'archiveEntrySources now reaches for the source map: a .cjs.map inside a deployable ships the ' +
        'embedded sources to a production host, which is the second of the two earlier build findings.',
    ).not.toContain('SOURCE_MAP_EXTENSION');
    expect(entryBuilder).not.toContain('readdirSync');
    expect(entryBuilder).not.toContain('.map');

    // The exact `node:fs` surface the script imports, which is how "no directory listing feeds the
    // archive" is pinned - and `readdirSync` is absent from the whole executable half, not merely
    // from the import line.
    expect(executable).toContain(
      "import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';",
    );
    expect(executable).not.toContain('readdirSync');

    // Deterministic entries: a fixed DOS timestamp rather than the wall clock, so two builds of
    // identical inputs produce byte-identical archives.
    expect(executable).toContain('DOS_EPOCH_TIME');
    expect(executable).toContain('DOS_EPOCH_DATE');
    expect(executable).not.toContain('Date.now()');
  });

  it('embeds annotated sources in maps and fails the build when either marker family is absent', () => {
    const scanned = buildScript();
    const { executable } = scanned;

    // The audit-trail option, read out of the options object. `sourcesContent: true` embeds the
    // annotated source text in the emitted map, which is what lets a reader recover annotations
    // from the artifact set instead of from a checkout.
    const options = balancedSpanAfter(scanned, 'function buildOptions(entryPoints) {');
    expect(options.length).toBeGreaterThan(500);
    expect(
      options,
      'sourcesContent is no longer configured true in buildOptions, so the preserved-defect ' +
        'annotations stop being recoverable from the artifact set.',
    ).toContain('sourcesContent: true');
    // No identifier-renaming transform, so the exported `handler` symbol the runtime resolves
    // survives verbatim in every artifact.
    expect(options).toContain('minify: false');
    expect(options).toContain("legalComments: 'inline'");

    // And the build refuses to ship an artifact set that has stopped carrying the trail: both
    // marker families are named as data and checked on every build.
    const markers = balancedSpanAfter(scanned, 'REQUIRED_ANNOTATION_MARKERS = Object.freeze([');
    expect(markers).toContain("'LEGACY-DEFECT ['");
    expect(markers).toContain("'DELIBERATE DIVERGENCE ['");
    expect(executable).toContain('function assertAnnotationsRecoverable');
    expect(executable).toContain('function readSourceMapFor');
  });

  it('reproduces the legacy feed scheme literally, and validates the authority it is glued to', () => {
    // Derived from the code and from the frozen legacy template rather than from either record's
    // prose: a gate that pins wording has to turn every time the wording is edited, and the
    // property that matters here is what the renderer emits and what it refuses.
    const renderer = readSubtreeFile('src/integrations/google/rssFeedRenderer.ts');
    const legacyTemplate = readRepositoryFile('integrationServices/google/views/feed/product.cfm');

    // The legacy template writes a cleartext scheme, so the port does too - that is parity, not a
    // choice this subtree gets to make.
    expect(legacyTemplate).toContain('http://');
    expect(legacyTemplate).not.toContain('https://');
    expect(renderer).toContain("const FEED_ORIGIN_SCHEME_PREFIX = 'http://';");
    expect(scanSource(renderer).executable).not.toContain('https://');

    // And the authority the scheme is glued to is parsed rather than trusted: the renderer reaches
    // the shared host-authority parser, and refuses what it rejects.
    expect(renderer).toContain('parseHostAuthority');
    expect(scanSource(renderer).executable).toMatch(/throw new [A-Za-z]*Error/u);
  });

  it('leaves the feed route unbounded and free of invented response headers', () => {
    const handlerModule = readSubtreeFile('src/handlers/productFeedHandler.ts');
    const feedRepository = readSubtreeFile('src/integrations/google/googleFeedRepository.ts');

    // No row ceiling: the legacy feed is whole-catalog, and a truncation constant would silently
    // change what Merchant Center receives.
    expect(feedRepository).not.toMatch(/const MAX_FEED_SELECTION_ROWS\b/u);
    expect(scanSource(feedRepository).executable).not.toMatch(/\bLIMIT\b/iu);

    // And no validator, cache or throttle vocabulary reached the served response: AAP 0.8.1 forbids
    // inventing a non-functional requirement, and each of these would be one.
    for (const invention of ['etag:', 'last-modified:', 'cache-control:', 'retry-after:']) {
      expect(
        handlerModule.toLowerCase().includes(`'${invention}`),
        `${invention} must not be emitted by the feed route: AAP 0.8.1 forbids inventing one`,
      ).toBe(false);
    }
  });
});

/**
 * A module that exports more than one runtime unit, and the AAP ground that authorizes it.
 *
 * Four grounds are used, and no fifth is permitted without a plan citation: - `enumerated` 0.3.1
 * lists this file with plural named responsibilities. - `errors` one unit plus the error class(es)
 * it raises.
 */
const MULTI_UNIT_MODULE_GROUNDS: Readonly<Record<string, string>> = Object.freeze({
  'src/domain/entities/optionGroup.ts': 'shared',
  'src/domain/entities/product.ts': 'shared',
  'src/domain/valueObjects/currencyCode.ts': 'enumerated',
  'src/domain/valueObjects/materializedIdPath.ts': 'enumerated',
  'src/handlers/bootstrap.ts': 'enumerated',
  'src/handlers/catalogQueryHandler.ts': 'entrypoint',
  'src/handlers/errorMapper.ts': 'enumerated',
  'src/handlers/priceResolutionHandler.ts': 'entrypoint',
  'src/handlers/productFeedHandler.ts': 'entrypoint',
  'src/handlers/promotionApplicationHandler.ts': 'entrypoint',
  'src/handlers/router.ts': 'enumerated',
  'src/handlers/skuResolutionHandler.ts': 'entrypoint',
  'src/lib/cfml/list.ts': 'enumerated',
  'src/lib/cfml/numberFormat.ts': 'enumerated',
  'src/lib/cfml/precision.ts': 'enumerated',
  'src/lib/cfml/struct.ts': 'enumerated',
  'src/lib/cfml/truthiness.ts': 'enumerated',
  // `appConfig` plus `parseHostAuthority`.
  'src/lib/config.ts': 'shared',
  'src/repositories/mysql/connection.ts': 'enumerated',
  'src/repositories/mysql/dialect.ts': 'enumerated',
  'src/services/productService.ts': 'errors',
});

/**
 * Exports that survive type erasure. A type or interface does not.
 */
const RUNTIME_EXPORT =
  /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/u;

function runtimeExportsOf(relativePath: string): string[] {
  const found: string[] = [];
  for (const line of readSubtreeFile(relativePath).split('\n')) {
    const matched = RUNTIME_EXPORT.exec(line.trimStart());
    if (matched?.[1] !== undefined) {
      found.push(matched[1]);
    }
  }
  return found;
}

describe('A20 source census and the one-runtime-unit rule, as AAP 0.3.1 states it', () => {
  it('keeps the production census at the plan\u2019s own eighty-nine modules', () => {
    // The prose claim "the census is back to the plan's own eighty-nine" stood in this file's
    // header while the real count was NINETY - the extra being `src/lib/jsonDocumentKeys.ts`.
    expect(
      listTypeScriptFiles('src').length,
      'the production module count left AAP 0.3.1\u2019s enumerated layout; add the file to the plan ' +
        'or fold it into a module the plan already names.',
    ).toBe(89);
  });

  it('admits a second runtime export only where it is named and grounded', () => {
    const offenders = listTypeScriptFiles('src')
      .filter((file) => runtimeExportsOf(file).length > 1)
      .filter((file) => MULTI_UNIT_MODULE_GROUNDS[file] === undefined)
      .sort();

    expect(
      offenders,
      'each module here exports a second runtime unit with no recorded AAP ground. Either split it, ' +
        'fold the extra export into the unit that owns it, or record the ground in ' +
        'MULTI_UNIT_MODULE_GROUNDS with the 0.3.1 citation that authorizes it.',
    ).toEqual([]);
  });

  it('and keeps that list honest, so it cannot decay into blanket permission', () => {
    // A name that no longer multiplies is a name that would silently authorize a FUTURE second
    // export. Removing it is the maintenance this case forces.
    const stale = Object.keys(MULTI_UNIT_MODULE_GROUNDS)
      .filter((file) => runtimeExportsOf(file).length <= 1)
      .sort();

    expect(
      stale,
      'each module here is recorded as multi-unit but is no longer; delete the entry so the ' +
        'exemption cannot be inherited by a later change.',
    ).toEqual([]);

    const grounds = new Set(Object.values(MULTI_UNIT_MODULE_GROUNDS));
    expect([...grounds].sort()).toEqual(['entrypoint', 'enumerated', 'errors', 'shared']);
  });

  it('and holds the half of the rule that is absolute: no barrel, and no default export', () => {
    // This half admits no exemption at all.
    const defaults: string[] = [];
    const barrels: string[] = [];

    for (const file of listTypeScriptFiles('src')) {
      const text = readSubtreeFile(file);
      if (/^export\s+default\b/mu.test(text)) {
        defaults.push(file);
      }
      if (/^export\s+(?:\*|\{[^}]*\})\s+from\s+/mu.test(text)) {
        barrels.push(file);
      }
      if (file.endsWith('/index.ts')) {
        barrels.push(file);
      }
    }

    expect(defaults, 'AAP 0.5.2 requires named imports; a default export is not one.').toEqual([]);
    expect(
      barrels.sort(),
      'AAP 0.8.3 forbids barrel files outright: "one exported unit per file and no barrel files".',
    ).toEqual([]);
  });
});

describe('A21 adapter transport policy: enumerated, evidenced, and budget-separate', () => {
  it('names a real module and a real suite for every transport policy', () => {
    const offenders = LEGACY_TEST_MAP.adapterTransportPolicies
      .filter(
        (policy) =>
          !subtreeFileExists(policy.owningModule) || !subtreeFileExists(policy.assertedBy),
      )
      .map((policy) => policy.owningModule);

    expect(
      offenders.sort(),
      'a transport policy must name the adapter module that owns it and the suite that asserts it; ' +
        'each path here is not on disk.',
    ).toEqual([]);
    expect(LEGACY_TEST_MAP.adapterTransportPolicies.length).toBeGreaterThanOrEqual(4);
  });

  it('requires each one to state the service contract it left unchanged', () => {
    const unevidenced = LEGACY_TEST_MAP.adapterTransportPolicies
      .filter((policy) => policy.unchangedServiceContract.trim().length < 80)
      .map((policy) => policy.owningModule);

    expect(
      unevidenced.sort(),
      'each policy here does not say which service-tier contract remains unchanged, or how that is ' +
        'known. Record it, or reclassify the change as a divergence and account for it in the budget.',
    ).toEqual([]);
  });

  it('and keeps the two registers disjoint, so neither can absorb the other', () => {
    const divergenceModules = new Set(
      LEGACY_TEST_MAP.deliberateDivergences.map((entry) => entry.owningModule),
    );
    const overlap = LEGACY_TEST_MAP.adapterTransportPolicies
      .filter((policy) => divergenceModules.has(policy.owningModule))
      .map((policy) => policy.owningModule);

    expect(
      overlap.sort(),
      'a module cannot own both a deliberate divergence and a transport policy for the same change; ' +
        'one of the two classifications is wrong.',
    ).toEqual([]);
    expect(LEGACY_TEST_MAP.deliberateDivergences.length).toBe(3);

    // Every divergence cites a legacy artefact; no transport policy does.
    for (const entry of LEGACY_TEST_MAP.deliberateDivergences) {
      expect(entry.citation).toMatch(/\.cfc:L\d+/u);
    }
  });
});

/**
 * Lines that state `phrase` as this project's own claim, rather than quoting it to refute it.
 *
 * What actually has to hold is narrower and is what this checks: the phrase may appear only inside
 * a Markdown blockquote.
 */
function linesAssertingPhrase(markdown: string, phrase: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => line.includes(phrase))
    .filter((line) => !line.trimStart().startsWith('>'));
}

describe('A22 README accuracy: the overstated claims, corrected and pinned', () => {
  it('claims config.ts is the ONLY reader of process.env, because it now is', () => {
    // The reader is `config.ts` and nothing else.
    const readers = listTypeScriptFiles('src').filter((file) =>
      readSubtreeFile(file)
        .split('\n')
        .some((line) => {
          const code = line.trimStart();
          const isComment = code.startsWith('//') || code.startsWith('*') || code.startsWith('/*');
          // An expression use, not a mention.
          return !isComment && /process\.env\s*[[)]/u.test(code);
        }),
    );
    expect(
      readers.sort(),
      'exactly ONE module may read process.env: config.ts, which takes it as a whole object. A ' +
        'second reader means the README claim is overstated again - and if the logger is what ' +
        'acquires it, the adopted-threshold seam has been undone.',
    ).toEqual(['src/lib/config.ts']);
  });

  it('counts the module-scope mutable memos honestly, at five rather than one', () => {
    const readme = readSubtreeFile('README.md');

    expect(
      linesAssertingPhrase(readme, 'no module-scope mutable state anywhere except'),
      'the README still asserts the single-memo claim outside a quotation.',
    ).toEqual([]);

    // Re-derived from source, so the table in the README cannot drift from the code it describes.
    const bindings: string[] = [];
    for (const file of listTypeScriptFiles('src')) {
      for (const line of readSubtreeFile(file).split('\n')) {
        if (/^(?:export\s+)?(?:let|var)\s+[A-Za-z_$]/u.test(line)) {
          bindings.push(file);
        }
      }
    }
    // Five, and the fifth is the logger's.
    expect(bindings.sort()).toEqual([
      'src/handlers/bootstrap.ts',
      'src/lib/config.ts',
      'src/lib/logger.ts',
      'src/repositories/mysql/connection.ts',
      'src/repositories/mysql/connection.ts',
    ]);

    // Every one of them must be named in the README's table.
    for (const module of new Set(bindings)) {
      expect(readme).toContain(module);
    }
  });

  it('explains why the euro-pivot converter is not the excluded non-Google adapter', () => {
    expect(subtreeFileExists('src/integrations/europeanCentralBankCurrencyConverter.ts')).toBe(
      false,
    );
    expect(listTypeScriptFiles('src/integrations').sort()).toEqual([
      'src/integrations/google/googleFeedRepository.ts',
      'src/integrations/google/googleFeedService.ts',
      'src/integrations/google/integration.ts',
      'src/integrations/google/rssFeedRenderer.ts',
      'src/integrations/integrationInterface.ts',
    ]);
  });
});

describe('A23 observable refinements: enumerated, authorized, and budget-separate', () => {
  it('names a real module and a real suite for every refinement', () => {
    const offenders = LEGACY_TEST_MAP.observableRefinements
      .filter(
        (entry) => !subtreeFileExists(entry.owningModule) || !subtreeFileExists(entry.assertedBy),
      )
      .map((entry) => entry.owningModule);

    expect(
      offenders.sort(),
      'a refinement must name the ported module where it happens and the suite that asserts it.',
    ).toEqual([]);
    expect(LEGACY_TEST_MAP.observableRefinements.length).toBeGreaterThanOrEqual(8);
  });

  it('requires every refinement to cite the AAP section that authorizes it', () => {
    const unauthorized = LEGACY_TEST_MAP.observableRefinements
      .filter((entry) => !/AAP \d\.\d/u.test(entry.aapAuthority))
      .map((entry) => entry.owningModule);

    expect(
      unauthorized.sort(),
      'each refinement here cites no AAP section. Either cite the section that permits it, or revert ' +
        'the behaviour - an observable change with no authority is not a documented refinement.',
    ).toEqual([]);
  });

  it('and never cites the defect budget as its authority, because that budget is closed at three', () => {
    const budgetClaimers = LEGACY_TEST_MAP.observableRefinements
      .filter((entry) => /AAP 0\.6\.7 (?:permits|allows|authorizes)/u.test(entry.aapAuthority))
      .map((entry) => entry.owningModule);

    expect(
      budgetClaimers.sort(),
      'a refinement may CITE 0.6.7 to show a defect register does NOT cover it, but may not claim ' +
        '0.6.7 as permission - that would spend a budget the plan closed at three.',
    ).toEqual([]);

    expect(LEGACY_TEST_MAP.deliberateDivergences.length).toBe(3);
  });

  it('and keeps the three registers disjoint, so no change is counted twice or lost between them', () => {
    // Each register answers a different question, so a single change belongs to exactly one.
    // Overlap would either double-count a change or let one hide in the register with the weaker
    // obligation.
    const refinementModules = new Set(
      LEGACY_TEST_MAP.observableRefinements.map((entry) => entry.owningModule),
    );
    const transportModules = new Set(
      LEGACY_TEST_MAP.adapterTransportPolicies.map((entry) => entry.owningModule),
    );
    const divergenceModules = new Set(
      LEGACY_TEST_MAP.deliberateDivergences.map((entry) => entry.owningModule),
    );

    // A divergence module may never appear in either other register.
    for (const module of divergenceModules) {
      expect(refinementModules.has(module), `${module}: divergence and refinement`).toBe(false);
      expect(transportModules.has(module), `${module}: divergence and transport policy`).toBe(
        false,
      );
    }

    // The two non-defect registers are allowed to touch the same MODULE only where the tiers
    // genuinely meet - the composition root both wires adapters and hosts the currency converter.
    const shared = [...refinementModules].filter((module) => transportModules.has(module)).sort();
    expect(
      shared,
      'an unexpected module carries both a transport policy and a refinement.',
    ).toEqual([]);
  });
});

// Everything else is in: every service method, and every entity method that computes, resolves,
// traverses or reads a persisted column.

/**
 * Method families AAP 0.4.2 explicitly declines to enumerate one by one.
 */
const UNENUMERATED_METHOD_FAMILIES = /^(?:add|remove|has|set)[A-Z]/u;

/**
 * Public method names declared in the body of an exported class.
 */
function publicClassMethods(relativePath: string): string[] {
  const names = new Set<string>();
  let insideClass = false;
  let braceDepth = 0;

  for (const line of readSubtreeFile(relativePath).split('\n')) {
    if (/^export class /u.test(line)) {
      insideClass = true;
      braceDepth = 0;
    }
    if (!insideClass) {
      continue;
    }
    for (const character of line) {
      if (character === '{') {
        braceDepth += 1;
      } else if (character === '}') {
        braceDepth -= 1;
      }
    }
    if (braceDepth <= 0 && /^\}/u.test(line)) {
      insideClass = false;
      continue;
    }
    // Two-space indent is a member of the class body; deeper indentation is inside a method.
    const declared = /^ {2}(?:public\s+)?(?:async\s+)?([a-z][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\(/u.exec(
      line,
    );
    if (declared?.[1] !== undefined && declared[1] !== 'constructor') {
      names.add(declared[1]);
    }
  }

  return [...names].filter((name) => !UNENUMERATED_METHOD_FAMILIES.test(name));
}

describe('A24 per-method inventory: every public method is named by its own suite', () => {
  const inventory = LEGACY_TEST_MAP.coveredModules
    .filter(
      (pairing) =>
        pairing.module.startsWith('src/services/') ||
        pairing.module.startsWith('src/domain/entities/'),
    )
    .map((pairing) => ({
      module: pairing.module,
      suite: pairing.test,
      declaresClass: /^export class /mu.test(readSubtreeFile(pairing.module)),
      methods: publicClassMethods(pairing.module),
    }));

  it('leaves no public service or entity method UNCALLED by the suite that covers it', () => {
    // A call is the name followed by optional type arguments and an open parenthesis.
    const offenders: string[] = [];
    for (const entry of inventory) {
      const suiteText = readSubtreeFile(entry.suite);
      for (const method of entry.methods) {
        if (!new RegExp(`\\b${method}\\s*(?:<[^>]*>)?\\s*\\(`, 'u').test(suiteText)) {
          offenders.push(`${entry.module}#${method} is never called by ${entry.suite}`);
        }
      }
    }

    expect(
      offenders.sort(),
      'each public method here is never invoked by its own suite. AAP 0.9.4 requires every converted ' +
        'method to have at least one test, and a method named only in a comment has none - add the ' +
        'call rather than an exemption.',
    ).toEqual([]);
  });

  it('and derives an inventory large enough to be a real check rather than a formality', () => {
    // Non-vacuity in both directions: the walk must find the modules and find methods inside them.
    // A regex that silently stopped matching would otherwise turn this whole block green and
    // empty.
    const total = inventory.reduce((running, entry) => running + entry.methods.length, 0);

    expect(inventory.length).toBeGreaterThanOrEqual(24);
    expect(total).toBeGreaterThanOrEqual(400);

    // Only a module that DECLARES a class owes detected methods. A class whose members all went
    // undetected is a broken regex; a function module legitimately has none.
    const brokenDerivations = inventory
      .filter((entry) => entry.declaresClass && entry.methods.length === 0)
      .map((entry) => entry.module);
    expect(
      brokenDerivations.sort(),
      'each module here declares an exported class yet yielded no public method, which means the ' +
        'derivation broke rather than that the class is empty.',
    ).toEqual([]);

    // And the function modules are a small, known minority - if this grew, the class-based
    // inventory would be quietly covering less than it appears to.
    const functionModules = inventory.filter((entry) => !entry.declaresClass).map((e) => e.module);
    expect(functionModules.sort()).toEqual([
      'src/services/promotion/overUseStripping.ts',
      'src/services/promotion/promotionApplication.ts',
    ]);
  });

  it('and the excluded families really are the generated-shaped ones AAP 0.4.2 names', () => {
    // Guard on the exclusion itself: if it ever widened to swallow a behaviour-carrying method,
    // the check above would pass while proving less. `getCurrencyDetails` and the cascade
    // accessors must never be excludable.
    for (const name of [
      'getCurrencyDetails',
      'getPriceByCurrencyCode',
      'getSkusBySelectedOptions',
      'updateOrderAmountsWithPromotions',
      'roundValue',
    ]) {
      expect(UNENUMERATED_METHOD_FAMILIES.test(name), `${name} must not be excludable`).toBe(false);
    }
    for (const name of ['addSku', 'removeSku', 'hasPromotionReward', 'setProductName']) {
      expect(UNENUMERATED_METHOD_FAMILIES.test(name), `${name} is a generated-shaped family`).toBe(
        true,
      );
    }
  });
});

// So this block enumerates the preservation authority and requires each entry to be provably
// annotated.
//
// Marker kind is deliberately not constrained. Five entries (12, 13, 17, 18, 19) are the port's
// three sanctioned divergences and carry `DELIBERATE DIVERGENCE`; the rest carry `LEGACY-DEFECT`;
// several carry both.

interface DefectRegisterEntry {
  readonly id: string;
  readonly legacyFile: string;
  /**
   * Inclusive line span. `undefined` for a whole-file entry.
   */
  readonly span?: readonly [number, number];
  /**
   * A SECOND disjoint span the same entry covers, proven independently of the first.
   */
  readonly companionSpan?: readonly [number, number];
  /**
   * For the four preserved misspellings, proven through `verbatimIdentifiers` instead of a
   * locator.
   */
  readonly identifier?: string;
}

/**
 * `subject` is what the discovery is, in a phrase, because these have no number to be cited by.
 */
interface SupplementalDiscovery extends DefectRegisterEntry {
  readonly subject: string;
}

const AAP_NUMBERED_DEFECTS: readonly DefectRegisterEntry[] = Object.freeze([
  { id: '1', legacyFile: 'integrationServices/google/Integration.cfc', span: [49, 49] },
  { id: '2', legacyFile: 'integrationServices/google/Integration.cfc', span: [73, 77] },
  { id: '3', legacyFile: 'integrationServices/google/model/dao/FeedDAO.cfc', span: [52, 75] },
  { id: '4', legacyFile: 'integrationServices/google/views/feed/product.cfm' },
  { id: '5', legacyFile: 'model/service/PriceGroupService.cfc', span: [236, 236] },
  { id: '6', legacyFile: 'model/service/PriceGroupService.cfc', span: [461, 470] },
  { id: '7', legacyFile: 'model/service/PriceGroupService.cfc', span: [174, 174] },
  { id: '8', legacyFile: 'model/service/PriceGroupService.cfc', span: [316, 340] },
  { id: '9', legacyFile: 'model/service/PromotionService.cfc', span: [468, 521] },
  { id: '10', legacyFile: 'model/service/PromotionService.cfc', span: [621, 623] },
  { id: '11', legacyFile: 'model/service/PromotionService.cfc', span: [703, 703] },
  { id: '12', legacyFile: 'model/service/PromotionService.cfc', span: [998, 998] },
  { id: '13', legacyFile: 'model/service/PromotionService.cfc', span: [1007, 1014] },
  { id: '14', legacyFile: 'model/service/PromotionService.cfc', span: [1013, 1015] },
  { id: '15', legacyFile: 'model/service/PromotionService.cfc', span: [1094, 1100] },
  { id: '16', legacyFile: 'model/entity/Sku.cfc', span: [258, 258] },
  { id: '17', legacyFile: 'model/entity/Sku.cfc', span: [500, 510] },
  { id: '18', legacyFile: 'model/entity/Sku.cfc', span: [512, 522] },
  { id: '19', legacyFile: 'model/entity/Product.cfc', span: [524, 532] },
  { id: '20', legacyFile: 'model/entity/Product.cfc', span: [598, 598] },
  // 21-30: found by the port, reading the in-scope source line by line. Ordered by legacy path,
  // then by line, exactly as the number-to-locator index publishes them.
  { id: '21', legacyFile: 'model/entity/ProductType.cfc', span: [117, 119] },
  { id: '22', legacyFile: 'model/entity/PromotionAccount.cfc', span: [90, 95] },
  { id: '23', legacyFile: 'model/entity/PromotionAccount.cfc', span: [101, 101] },
  { id: '24', legacyFile: 'model/entity/PromotionAccount.cfc', span: [103, 103] },
  // 25 is the promoted secondary item, and it is numbered here rather than carried as a secondary
  // row: the plan named nine secondary items, this one became numbered, and eight remain below.
  { id: '25', legacyFile: 'model/entity/Product.cfc', span: [614, 622] },
  { id: '26', legacyFile: 'model/entity/PromotionPeriod.cfc', span: [110, 110] },
  { id: '27', legacyFile: 'model/entity/PromotionPeriod.cfc', span: [116, 130] },
  { id: '28', legacyFile: 'model/entity/Sku.cfc', span: [569, 569] },
  { id: '29', legacyFile: 'model/service/PriceGroupService.cfc', span: [243, 243] },
  { id: '30', legacyFile: 'model/service/PriceGroupService.cfc', span: [400, 400] },
]);

const AAP_SECONDARY_DEFECTS: readonly DefectRegisterEntry[] = Object.freeze([
  { id: 'duplicate var hql', legacyFile: 'model/dao/SkuDAO.cfc', span: [163, 163] },
  { id: 'inverted cache clear', legacyFile: 'model/dao/SkuDAO.cfc', span: [222, 226] },
  // One item, two sites - see `companionSpan`. One row, both sites proven.
  {
    id: 'duplicated getStartDateTime',
    legacyFile: 'model/dao/PromotionDAO.cfc',
    span: [177, 177],
    companionSpan: [244, 244],
  },
  {
    id: 'roundValue returntype',
    legacyFile: 'model/service/RoundingRuleService.cfc',
    span: [88, 88],
  },
  {
    id: 'orderItemQulifiedDiscounts',
    legacyFile: 'model/service/PromotionService.cfc',
    span: [82, 142],
    identifier: 'orderItemQulifiedDiscounts',
  },
  {
    id: 'promtionRewards',
    legacyFile: 'model/entity/PromotionReward.cfc',
    identifier: 'promtionRewards',
  },
  { id: 'singlularname', legacyFile: 'model/entity/Product.cfc', identifier: 'singlularname' },
  {
    id: 'subsciptionUsageBenefit',
    legacyFile: 'model/entity/PriceGroup.cfc',
    identifier: 'subsciptionUsageBenefit',
  },
]);

/**
 * The port's own discoveries, kept out of the closed numbered set and free to grow.
 *
 * Each row is a behaviour the port found while building fixtures or reading a graph through,
 * recorded where it was found.
 */
const SUPPLEMENTAL_TARGET_DISCOVERIES: readonly SupplementalDiscovery[] = Object.freeze([
  {
    id: 'isCurrent vs getCurrentFlag',
    subject:
      'isCurrent() and getCurrentFlag() answer the same question with opposite end-boundary ' +
      'semantics, so they disagree at exactly the endDateTime instant',
    legacyFile: 'model/entity/PromotionPeriod.cfc',
    span: [78, 81],
  },
  {
    id: 'getPromotionCodesDeletableFlag memo',
    subject:
      'three distinct spellings across five sites mean the memo can never hit, and the accessor ' +
      'is the delete-validation gate model/validation/Promotion.json wires',
    legacyFile: 'model/entity/Promotion.cfc',
    span: [123, 133],
  },
  {
    id: 'hasUniqueOptions on an option-less sku',
    subject:
      'the option-list comparison is built from a query returning every OPTIONED sku of the ' +
      'product, so an option-less sku fails hasUniqueOptions spuriously',
    legacyFile: 'model/entity/Sku.cfc',
    span: [756, 769],
  },
  {
    id: 'sorted versus unsorted defensive check',
    subject:
      'getSortedProductSkus applies a defensive option-count check that getProductSkus does not, ' +
      'so the two answer different sets for the same product',
    legacyFile: 'model/service/SkuService.cfc',
    span: [236, 237],
  },
]);

describe('A25 defect register: every entry of the preservation authority, proven individually', () => {
  const MARKER_CITATION = /(?:LEGACY-DEFECT|DELIBERATE DIVERGENCE|LEGACY-NOTE)\s+\[([^\]]+)\]/gu;

  interface Citation {
    readonly module: string;
    readonly citation: string;
  }

  const collectCitations = (modules: readonly string[]): Citation[] => {
    const found: Citation[] = [];
    for (const module of modules) {
      for (const match of readSubtreeFile(module).matchAll(MARKER_CITATION)) {
        found.push({ module, citation: (match[1] ?? '').trim() });
      }
    }
    return found;
  };

  /**
   * The shipped code. The thirty-eight base entries must be annotated here.
   */
  const citations = collectCitations(SOURCE_MODULES_ON_DISK);

  /**
   * Shipped code plus every suite and fixture. The supplemental discoveries live across both.
   */
  const allCitations = [
    ...citations,
    ...collectCitations([
      ...TEST_FILES_ON_DISK,
      ...listTypeScriptFiles('tests').filter((file) => !file.endsWith('.test.ts')),
    ]),
  ];

  const BASE_ENTRIES: readonly DefectRegisterEntry[] = [
    ...AAP_NUMBERED_DEFECTS,
    ...AAP_SECONDARY_DEFECTS,
  ];

  /**
   * Is one span of one entry cited by at least one marker in `where`?
   */
  const spanIsProven = (
    where: readonly Citation[],
    legacyFile: string,
    span: readonly [number, number] | undefined,
  ): boolean =>
    where.some(({ citation }) => {
      if (!citation.includes(legacyFile)) {
        return false;
      }
      if (span === undefined) {
        return true; // a whole-file entry: the .cfm view carries no line locator
      }
      const [low, high] = span;
      return [...citation.matchAll(/L(\d+)/gu)].some((line) => {
        const value = Number(line[1]);
        return value >= low && value <= high;
      });
    });

  const describeSpan = (span: readonly [number, number] | undefined): string =>
    span === undefined ? '' : `:L${String(span[0])}-L${String(span[1])}`;

  /**
   * Every span an entry claims, unproven ones reported by name.
   *
   * `companionSpan` is checked as its own obligation, so an entry covering two disjoint sites
   * cannot be discharged by annotating one of them.
   */
  const unprovenSpansOf = (
    where: readonly Citation[],
    entry: DefectRegisterEntry,
    tree: string,
  ): string[] => {
    const failures: string[] = [];
    if (entry.identifier !== undefined && entry.span === undefined) {
      return failures; // proven by verbatimIdentifiers, asserted below
    }
    if (!spanIsProven(where, entry.legacyFile, entry.span)) {
      failures.push(
        `defect ${entry.id} (${entry.legacyFile}${describeSpan(entry.span)}) is annotated nowhere in ${tree}`,
      );
    }
    if (
      entry.companionSpan !== undefined &&
      !spanIsProven(where, entry.legacyFile, entry.companionSpan)
    ) {
      failures.push(
        `defect ${entry.id} (${entry.legacyFile}${describeSpan(entry.companionSpan)}, its second site) is annotated nowhere in ${tree}`,
      );
    }
    return failures;
  };

  it('carries the numbered set at THIRTY and the secondary set at EIGHT, as two inventories', () => {
    // The two inventories are asserted separately AND their sum is asserted, because a thirty-row
    // array can agree with a total while leaving numbered entries unrepresented.
    expect(AAP_NUMBERED_DEFECTS.length).toBe(30);
    expect(AAP_SECONDARY_DEFECTS.length).toBe(8);
    expect(BASE_ENTRIES.length).toBe(38);

    // The numbered ids are EXACTLY '1'..'30' - no gap, no duplicate, no renumbering. This is what
    // makes "defect 22" mean one thing forever, and it is why 25 is numbered rather than carried
    // as a secondary row.
    expect(AAP_NUMBERED_DEFECTS.map((entry) => entry.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => String(index + 1)),
    );

    // Every id across both inventories is distinct, so neither can silently absorb the other.
    expect(duplicatesIn(BASE_ENTRIES.map((entry) => entry.id))).toEqual([]);
  });

  it('leaves the supplemental discovery inventory OPEN-ENDED, with no length to break', () => {
    // This is the half the flat register made impossible.
    expect(SUPPLEMENTAL_TARGET_DISCOVERIES.length).toBeGreaterThanOrEqual(4);
    expect(duplicatesIn(SUPPLEMENTAL_TARGET_DISCOVERIES.map((entry) => entry.id))).toEqual([]);

    // A discovery may never claim a number: that set is closed at thirty, and an id that looks
    // like one would put a supplemental row into the numbered namespace.
    expect(
      SUPPLEMENTAL_TARGET_DISCOVERIES.filter((entry) => /^\d+$/u.test(entry.id)).map(
        (entry) => entry.id,
      ),
    ).toEqual([]);

    // And each one says what it is, because it has no number to be cited by.
    expect(
      SUPPLEMENTAL_TARGET_DISCOVERIES.filter((entry) => entry.subject.trim().length < 40).map(
        (entry) => entry.id,
      ),
    ).toEqual([]);
  });

  it('proves every one of the thirty-eight base entries with a marker citing a line inside its span', () => {
    const unproven = BASE_ENTRIES.flatMap((entry) => unprovenSpansOf(citations, entry, 'src/'));

    expect(
      unproven.sort(),
      'each base register entry here has no annotation in the source tree. An un-annotated defect ' +
        'is a defect somebody repaired, which for these is a money change: reproduce it and ' +
        'annotate it, or record it among the three sanctioned divergences.',
    ).toEqual([]);
  });

  it('proves every supplemental discovery too, across src/ and tests/', () => {
    // Three of the four were found while authoring fixtures and are annotated there, which is
    // where the behaviour is reachable.
    const unproven = SUPPLEMENTAL_TARGET_DISCOVERIES.flatMap((entry) =>
      unprovenSpansOf(allCitations, entry, 'src/ or tests/'),
    );

    expect(
      unproven.sort(),
      'each supplemental discovery here is annotated nowhere. A discovery nobody annotated is a ' +
        'discovery the next reader cannot check, which is the whole reason this inventory exists.',
    ).toEqual([]);
  });

  it('proves each preserved misspelling through the identifier register, not through a locator', () => {
    // A misspelling is proven by the spelling surviving.
    const registered = new Set(
      LEGACY_TEST_MAP.verbatimIdentifiers.map((entry) => entry.identifier),
    );

    const unregistered = BASE_ENTRIES.filter(
      (entry) => entry.identifier !== undefined && !registered.has(entry.identifier),
    ).map((entry) => entry.id);

    expect(
      unregistered.sort(),
      'each preserved misspelling here is absent from verbatimIdentifiers, so nothing proves the ' +
        'source spelling survived.',
    ).toEqual([]);

    // Four identifier entries, matching the four source identifier typos the authority enumerates
    // - and all four sit in the SECONDARY inventory, because a typo is not a behavioural fault.
    expect(BASE_ENTRIES.filter((entry) => entry.identifier !== undefined).length).toBe(4);
    expect(AAP_NUMBERED_DEFECTS.filter((entry) => entry.identifier !== undefined)).toEqual([]);
  });

  it('and the derivation itself is non-vacuous, so a broken matcher fails instead of passing', () => {
    // If the citation walk ever stopped matching, every entry above would be "unproven" and the
    // block would fail loudly - but a subtler break is a walk that finds citations in only one
    // module.
    expect(citations.length).toBeGreaterThanOrEqual(300);
    expect(new Set(citations.map((entry) => entry.module)).size).toBeGreaterThanOrEqual(30);
    expect(allCitations.length).toBeGreaterThan(citations.length);
    expect(BASE_ENTRIES.length).toBeGreaterThan(LEGACY_TEST_MAP.requiredDefectCitations.length);
  });
});

describe('A27 locator integrity: every cited locator resolves to a line that exists', () => {
  // The legacy top-level directories a citation may name, spelled inside the expression below
  // rather than as a separate list joined into it.
  //
  // A legacy path, optionally followed by one or more `L<n>` references.
  const LEGACY_CITATION =
    /(?<![A-Za-z0-9_./-])((?:model|integrationServices|org|config|meta|admin|frontend|public|custom|tags|templates|assets)\/[A-Za-z0-9_./-]+?\.(?:cfc|cfm|json|txt|xml))((?:\s*:?\s*L\d+(?:\s*-\s*L?\d+)?[,;]?)*)/gu;

  /**
   * A locator into this subtree's own source, in either the bare or `slatwall-ts/`-prefixed form.
   */
  const SUBTREE_CITATION =
    /(?:slatwall-ts\/)?((?:src|tests)\/[A-Za-z0-9_./-]+?\.(?:ts|mjs))((?:\s*:?\s*L\d+(?:\s*-\s*L?\d+)?[,;]?)+)/gu;

  /**
   * Every artifact that carries citations: the shipped code, every suite and fixture, and the root
   * documents. The generated trees are not read at all.
   */
  const CITING_ARTIFACTS = [
    ...SOURCE_MODULES_ON_DISK,
    ...listTypeScriptFiles('tests'),
    'README.md',
    'NOTICE-GPL.md',
    '.env.example',
    'esbuild.config.mjs',
    'eslint.config.mjs',
    'vitest.config.ts',
  ];

  const legacyLineCounts = new Map<string, number | undefined>();
  const legacyLineCount = (relativePath: string): number | undefined => {
    if (!legacyLineCounts.has(relativePath)) {
      legacyLineCounts.set(
        relativePath,
        existsSync(path.join(REPOSITORY_ROOT, relativePath))
          ? countLines(readRepositoryFile(relativePath))
          : undefined,
      );
    }
    return legacyLineCounts.get(relativePath);
  };

  const subtreeLineCounts = new Map<string, number | undefined>();
  const subtreeLineCount = (relativePath: string): number | undefined => {
    if (!subtreeLineCounts.has(relativePath)) {
      subtreeLineCounts.set(
        relativePath,
        subtreeFileExists(relativePath) ? countLines(readSubtreeFile(relativePath)) : undefined,
      );
    }
    return subtreeLineCounts.get(relativePath);
  };

  const linesIn = (tail: string): number[] =>
    [...tail.matchAll(/L(\d+)/gu)].map((match) => Number(match[1]));

  interface CitedLocator {
    readonly citingArtifact: string;
    readonly citedPath: string;
    readonly lines: readonly number[];
  }

  const collect = (expression: RegExp): CitedLocator[] => {
    const found: CitedLocator[] = [];
    for (const artifact of CITING_ARTIFACTS) {
      const text = readSubtreeFile(artifact);
      for (const match of text.matchAll(expression)) {
        found.push({
          citingArtifact: artifact,
          citedPath: match[1] ?? '',
          lines: linesIn(match[2] ?? ''),
        });
      }
    }
    return found;
  };

  const legacyLocators = collect(LEGACY_CITATION);
  const subtreeLocators = collect(SUBTREE_CITATION);

  it('cites no legacy path that is absent, unless the absence is registered and explained', () => {
    const registered = new Map(
      LEGACY_TEST_MAP.deliberateLegacyAbsences.map((absence) => [absence.path, absence.reason]),
    );

    const offenders = new Set<string>();
    for (const locator of legacyLocators) {
      if (legacyLineCount(locator.citedPath) === undefined && !registered.has(locator.citedPath)) {
        offenders.add(
          `${locator.citingArtifact} cites ${locator.citedPath}, which is not in the legacy tree`,
        );
      }
    }

    expect(
      [...offenders].sort(),
      'each citation here names a legacy file that does not exist, so a reader following it finds ' +
        'nothing. Correct the path, or register the absence as deliberate with the reason it is cited.',
    ).toEqual([]);

    // The register must not rot in the other direction either: an entry naming a path that has
    // since appeared, or that nothing cites, is a stale exemption.
    const cited = new Set(legacyLocators.map((locator) => locator.citedPath));
    const stale: string[] = [];
    for (const [absentPath, reason] of registered) {
      if (existsSync(path.join(REPOSITORY_ROOT, absentPath))) {
        stale.push(`${absentPath}: registered as absent and it exists`);
      }
      if (!cited.has(absentPath)) {
        stale.push(`${absentPath}: registered as a cited absence and nothing cites it`);
      }
      if (reason.trim().length < 40) {
        stale.push(`${absentPath}: registered without a reason worth reading`);
      }
    }
    expect(stale.sort()).toEqual([]);
  });

  it('cites no legacy LINE beyond the end of the file it names', () => {
    const offenders = new Set<string>();
    for (const locator of legacyLocators) {
      const lineCount = legacyLineCount(locator.citedPath);
      if (lineCount === undefined) {
        continue; // absence is the case above's business, and it is registered or already failing
      }
      for (const line of locator.lines) {
        if (line < 1 || line > lineCount) {
          offenders.add(
            `${locator.citingArtifact} cites ${locator.citedPath}:L${String(line)}, and that file ` +
              `has ${String(lineCount)} lines`,
          );
        }
      }
    }

    expect(
      [...offenders].sort(),
      'each locator here points past the end of the legacy file it names. Re-derive it from the ' +
        'file rather than adjusting the prose around it.',
    ).toEqual([]);
  });

  it('cites no line of its OWN source beyond the end of that file', () => {
    const offenders = new Set<string>();
    for (const locator of subtreeLocators) {
      const lineCount = subtreeLineCount(locator.citedPath);
      if (lineCount === undefined) {
        offenders.add(
          `${locator.citingArtifact} cites ${locator.citedPath}, which is not in this subtree`,
        );
        continue;
      }
      for (const line of locator.lines) {
        if (line < 1 || line > lineCount) {
          offenders.add(
            `${locator.citingArtifact} cites ${locator.citedPath}:L${String(line)}, and that file ` +
              `has ${String(lineCount)} lines`,
          );
        }
      }
    }

    expect(
      [...offenders].sort(),
      'each locator here points past the end of a file in this subtree. Prefer naming the SYMBOL ' +
        'and giving the line, so a reader can still find it when the line moves.',
    ).toEqual([]);
  });

  it('and the walk is non-vacuous, so a broken matcher fails instead of passing silently', () => {
    expect(CITING_ARTIFACTS.length).toBeGreaterThanOrEqual(150);
    expect(legacyLocators.length).toBeGreaterThanOrEqual(2_000);

    // The subtree walk is proved by construction rather than by a floor on how many target-file
    // line locators this tree happens to carry. A line number inside this subtree is unstable by
    // construction - it moves whenever the file above it changes - so the count is expected to
    // fall towards zero as citations name the symbol instead, and a floor would then force the
    // very practice the locator-integrity case above exists to catch.
    const probe = 'see src/domain/entities/sku.ts:L12-L14 and tests/setup.ts:L7';
    const probed = [...probe.matchAll(SUBTREE_CITATION)].map((match) => ({
      citedPath: match[1] ?? '',
      lines: linesIn(match[2] ?? ''),
    }));
    expect(probed.map((locator) => locator.citedPath)).toEqual([
      'src/domain/entities/sku.ts',
      'tests/setup.ts',
    ]);
    expect(probed.flatMap((locator) => locator.lines)).toEqual([12, 14, 7]);

    // Every locator yields at least one line, and a multi-line citation yields each of them. Stated
    // as a relation and proved by a probe rather than as a raw floor: the number of citations in this
    // tree falls whenever redundant commentary is removed, so a fixed floor would eventually demand
    // bulk rather than provenance.
    const legacyLineReferences = legacyLocators.reduce(
      (total, locator) => total + locator.lines.length,
      0,
    );
    expect(legacyLineReferences).toBeGreaterThanOrEqual(legacyLocators.length);
    expect(linesIn('[model/entity/Sku.cfc:L269-L273, L275, L281]')).toEqual([269, 273, 275, 281]);

    // And the spread matters as much as the count: a walk that found citations in one file only
    // would satisfy every figure above.
    expect(
      new Set(legacyLocators.map((locator) => locator.citingArtifact)).size,
    ).toBeGreaterThanOrEqual(100);
    expect(new Set(legacyLocators.map((locator) => locator.citedPath)).size).toBeGreaterThanOrEqual(
      100,
    );
  });
});

// What an entry in `recordedScopeAdditions` is and is not.

describe('A18 frozen scope: the plan\u2019s census is stated exactly, and drift is itemised', () => {
  const FROZEN = LEGACY_TEST_MAP.frozenScope;
  const ADDITIONS = LEGACY_TEST_MAP.recordedScopeAdditions;
  const ADDED_PATHS = ADDITIONS.map((addition) => addition.path);

  const ROOT_FILES_ON_DISK = listSubtreeRootFiles();
  const TEST_TREE_ON_DISK = listTypeScriptFiles('tests');
  const SUPPORT_FILES_ON_DISK = TEST_TREE_ON_DISK.filter(
    (file) => !file.endsWith('.test.ts') && !file.startsWith('tests/fixtures/'),
  );
  const FIXTURES_ON_DISK = TEST_TREE_ON_DISK.filter((file) => file.startsWith('tests/fixtures/'));

  /**
   * The directory a path sits in DIRECTLY, so a nested category cannot absorb a sibling.
   */
  const parentDirectoryOf = (file: string): string => path.posix.dirname(file);

  const countIn = (files: readonly string[], directory: string): number =>
    files.filter((file) => parentDirectoryOf(file) === directory).length;

  const additionsIn = (directory: string): number =>
    ADDED_PATHS.filter((added) => parentDirectoryOf(added) === directory).length;

  /**
   * A trailing plan pattern as a matcher. Leading wildcards are refused, never translated.
   */
  const patternMatches = (pattern: string, candidate: string): boolean => {
    const withoutSubtree = pattern.replace(/^slatwall-ts\//, '');
    const expression = withoutSubtree
      .split('**/')
      .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
      .join('(?:.*/)?');
    return new RegExp(`^${expression}$`).test(candidate);
  };

  it('states an internally consistent census, so the contract cannot be self-contradictory', () => {
    expect(
      FROZEN.rootArtifacts.length +
        FROZEN.sourceModules +
        FROZEN.unitSuites +
        FROZEN.integrationSuites +
        FROZEN.fixtures +
        FROZEN.supportFiles.length,
    ).toBe(FROZEN.totalFiles);

    // AAP 0.6.6 / 0.9.4: the source census partitions as mapped plus exempt, with nothing
    // outstanding.
    expect(FROZEN.mappedModules + FROZEN.exemptModules).toBe(FROZEN.sourceModules);

    // The per-directory and per-category breakdowns have to add up to the same totals.
    expect(FROZEN.sourceDirectories.reduce((total, entry) => total + entry.files, 0)).toBe(
      FROZEN.sourceModules,
    );
    expect(FROZEN.suiteCategories.reduce((total, entry) => total + entry.files, 0)).toBe(
      FROZEN.unitSuites + FROZEN.integrationSuites,
    );

    // The exact figures the plan gives, written out so this file states them rather than implying
    // them.
    expect(FROZEN.totalFiles).toBe(165);
    expect(FROZEN.sourceModules).toBe(89);
    expect(FROZEN.mappedModules).toBe(57);
    expect(FROZEN.exemptModules).toBe(32);
    expect(FROZEN.unitSuites).toBe(51);
    expect(FROZEN.integrationSuites).toBe(6);
    expect(FROZEN.suiteCategories).toHaveLength(8);
  });

  it('records every addition once, with a plan pattern that really admits its path', () => {
    expect(duplicatesIn(ADDED_PATHS)).toEqual([]);

    // `'slatwall-ts/<root artifact>'` and it was not a pattern the plan states - it was a
    // placeholder written to give the `.gitignore` row something to name.
    const PLAN_PATTERNS: readonly string[] = [
      'slatwall-ts/src/domain/entities/*.ts',
      'slatwall-ts/src/domain/valueObjects/*.ts',
      'slatwall-ts/src/domain/views/*.ts',
      'slatwall-ts/src/domain/promotionEngine/*.ts',
      'slatwall-ts/src/domain/ports/*.ts',
      'slatwall-ts/src/services/*.ts',
      'slatwall-ts/src/services/promotion/*.ts',
      'slatwall-ts/src/repositories/mysql/*.ts',
      'slatwall-ts/src/repositories/mysql/sql/*.sql.ts',
      'slatwall-ts/src/handlers/*.ts',
      'slatwall-ts/src/integrations/*.ts',
      'slatwall-ts/src/integrations/google/*.ts',
      'slatwall-ts/src/lib/*.ts',
      'slatwall-ts/src/lib/cfml/*.ts',
      'slatwall-ts/tests/unit/**/*.test.ts',
      'slatwall-ts/tests/integration/**/*.test.ts',
      'slatwall-ts/tests/fixtures/*.ts',
    ];

    // No placeholder may return. Every legitimate pattern is a literal path with `*` wildcards, so
    // a `<...>` bracket is the signature of an invented one and is refused by shape rather than by
    // name.
    expect(PLAN_PATTERNS.filter((pattern) => /[<>]/u.test(pattern))).toEqual([]);

    // And the root exception table is exactly one key.
    expect(Object.keys(ROOT_SCOPE_EXCEPTIONS).sort()).toEqual(['.gitignore']);

    const offenders: string[] = [];
    for (const addition of ADDITIONS) {
      if (!subtreeFileExists(addition.path)) {
        offenders.push(`${addition.path}: recorded as an addition but not on disk`);
      }
      if (addition.reason.trim().length < 40) {
        offenders.push(`${addition.path}: recorded without a reason worth reading`);
      }
      if (addition.kind === 'rootArtifact') {
        if (addition.path.includes('/')) {
          offenders.push(`${addition.path}: a root artifact cannot sit in a directory`);
        }
        if (addition.sanctioningPattern !== undefined) {
          offenders.push(
            `${addition.path}: claims a plan pattern, and the plan publishes no root pattern at all`,
          );
        }
        const recognized = ROOT_SCOPE_EXCEPTIONS[addition.path];
        if (recognized === undefined) {
          offenders.push(
            `${addition.path}: no recorded root scope exception names this filename, so nothing ` +
              'admits it - a thirteenth root artifact needs plan-owner authority, not a register row',
          );
        } else if (addition.rootScopeException !== recognized) {
          offenders.push(
            `${addition.path}: its recorded exception does not match the one this filename is ` +
              'admitted by',
          );
        }
      } else {
        if (addition.rootScopeException !== undefined) {
          offenders.push(
            `${addition.path}: claims a root scope exception while sitting in a directory`,
          );
        }
        const claimed = addition.sanctioningPattern;
        if (claimed === undefined) {
          offenders.push(`${addition.path}: recorded without the plan pattern that admits it`);
        } else if (!PLAN_PATTERNS.includes(claimed)) {
          offenders.push(
            `${addition.path}: claims ${claimed}, which is not a pattern the plan states`,
          );
        } else if (!patternMatches(claimed, addition.path)) {
          offenders.push(
            `${addition.path}: is not admitted by ${claimed}, so no plan pattern sanctions it`,
          );
        }
      }
      const expectedPrefix = {
        rootArtifact: '',
        sourceModule: 'src/',
        unitSuite: 'tests/unit/',
        integrationSuite: 'tests/integration/',
      }[addition.kind];
      if (!addition.path.startsWith(expectedPrefix)) {
        offenders.push(`${addition.path}: recorded as ${addition.kind}, which its path denies`);
      }
    }
    expect(offenders.sort()).toEqual([]);

    // ANTI-VACUITY: the itemisation is only meaningful while it has rows.
    expect(ADDITIONS.length).toBe(9);
  });

  it('holds the frozen root-artifact set exactly, once the recorded addition is removed', () => {
    const recordedRootAdditions = ADDITIONS.filter(
      (addition) => addition.kind === 'rootArtifact',
    ).map((addition) => addition.path);

    expect(missingFrom(FROZEN.rootArtifacts, ROOT_FILES_ON_DISK)).toEqual([]);
    expect(
      missingFrom(ROOT_FILES_ON_DISK, [...FROZEN.rootArtifacts, ...recordedRootAdditions]),
    ).toEqual([]);
    expect(ROOT_FILES_ON_DISK.length - recordedRootAdditions.length).toBe(
      FROZEN.rootArtifacts.length,
    );
  });

  it('commits the ignore mechanism, and keeps it agreeing with this census', () => {
    const ignoreRules = readSubtreeFile('.gitignore');

    // What stops a build product being reported as scope drift; if the two ever disagree, one of
    // them is wrong about what "generated" means and `git status` and this file stop describing
    // the same tree.
    const ruleLines = ignoreRules
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    expect(missingFrom(UNTRACKED_ROOT_NAMES, ruleLines).sort()).toEqual([]);

    // And the committed contract stays tracked. `.env` is ignored, `.env.*` with it, and
    // `.env.example` is re-included - the one negation in the file.
    expect(ruleLines).toContain('.env');
    expect(ruleLines).toContain('.env.*');
    expect(ruleLines).toContain('!.env.example');
    expect(subtreeFileExists('.env.example')).toBe(true);

    // Nothing OUTSIDE this SUBTREE is AFFECTED. A rule is relative to its own directory, so a
    // leading `/` or a `..` segment would be the only way to reach past it - and neither appears.
    expect(ruleLines.filter((line) => line.includes('..'))).toEqual([]);
    expect(ruleLines.filter((line) => line.startsWith('/'))).toEqual([]);
    expect(ADDED_PATHS).toContain('.gitignore');
    expect(Object.keys(ROOT_SCOPE_EXCEPTIONS)).toContain('.gitignore');
  });

  it('holds every frozen source directory at its planned size, addition by addition', () => {
    const offenders: string[] = [];
    for (const entry of FROZEN.sourceDirectories) {
      const frozenOnDisk =
        countIn(SOURCE_MODULES_ON_DISK, entry.directory) - additionsIn(entry.directory);
      if (frozenOnDisk !== entry.files) {
        offenders.push(
          `${entry.directory}: the plan freezes ${String(entry.files)} modules and this tree ` +
            `holds ${String(frozenOnDisk)} that are not recorded additions`,
        );
      }
    }
    expect(offenders.sort()).toEqual([]);

    // And no module sits outside every frozen directory unless it is a recorded addition - which
    // is what makes a whole new directory as loud as a new file in an existing one.
    const frozenDirectories = new Set(FROZEN.sourceDirectories.map((entry) => entry.directory));
    const stray = SOURCE_MODULES_ON_DISK.filter(
      (module) =>
        !frozenDirectories.has(parentDirectoryOf(module)) && !ADDED_PATHS.includes(module),
    );
    expect(stray.sort()).toEqual([]);
  });

  it('holds every frozen suite category at its planned size, addition by addition', () => {
    const offenders: string[] = [];
    for (const entry of FROZEN.suiteCategories) {
      const frozenOnDisk =
        countIn(TEST_FILES_ON_DISK, entry.directory) - additionsIn(entry.directory);
      if (frozenOnDisk !== entry.files) {
        offenders.push(
          `${entry.directory}: the plan freezes ${String(entry.files)} suites and this tree ` +
            `holds ${String(frozenOnDisk)} that are not recorded additions`,
        );
      }
    }
    expect(offenders.sort()).toEqual([]);

    const frozenCategories = new Set(FROZEN.suiteCategories.map((entry) => entry.directory));
    const stray = TEST_FILES_ON_DISK.filter(
      (suite) => !frozenCategories.has(parentDirectoryOf(suite)) && !ADDED_PATHS.includes(suite),
    );
    expect(stray.sort()).toEqual([]);
  });

  it('holds the fixture tier and the two support files exactly as frozen', () => {
    expect(FIXTURES_ON_DISK).toHaveLength(FROZEN.fixtures);
    expect([...SUPPORT_FILES_ON_DISK].sort()).toEqual([...FROZEN.supportFiles].sort());
  });

  it('reconciles the whole tree: 165 frozen plus 9 recorded equals what is on disk', () => {
    const onDisk =
      ROOT_FILES_ON_DISK.length +
      SOURCE_MODULES_ON_DISK.length +
      TEST_FILES_ON_DISK.length +
      FIXTURES_ON_DISK.length +
      SUPPORT_FILES_ON_DISK.length;
    expect(onDisk).toBe(FROZEN.totalFiles + ADDITIONS.length);
    expect(onDisk).toBe(174);
  });

  it('reconciles the register: 57 mapped and 32 exempt, moved only by recorded rows', () => {
    const promotions = LEGACY_TEST_MAP.frozenExemptPromotions;
    const addedModules = ADDITIONS.filter((addition) => addition.kind === 'sourceModule');

    // Frozen-exempt modules that earned suites, plus any recorded module additions that arrived
    // already covered. Nothing else may move a module between categories.
    expect(FROZEN.mappedModules + promotions.length + addedModules.length).toBe(
      MAPPED_MODULES.length,
    );
    expect(FROZEN.exemptModules - promotions.length).toBe(EXEMPT_MODULES.length);

    // And the two inventories are pinned at what they actually hold, so a promotion appearing or a
    // module addition returning is a visible change to this file rather than an absorbed one.
    expect(promotions.length).toBe(7);
    expect(addedModules).toEqual([]);

    // The frozen contract has no pending category at all, and this tree has nothing in it.
    expect(PENDING_MODULES).toEqual([]);

    // Every promoted module really is covered now, really was exempt before, and names the
    // recorded addition that displaced its exemption.
    const offenders: string[] = [];
    for (const promotion of promotions) {
      if (!MAPPED_MODULES.includes(promotion.module)) {
        offenders.push(`${promotion.module}: recorded as promoted but is not in coveredModules`);
      }
      if (EXEMPT_MODULES.includes(promotion.module)) {
        offenders.push(`${promotion.module}: recorded as promoted while still exempt`);
      }
      if (!ADDED_PATHS.includes(promotion.supersededBy)) {
        offenders.push(
          `${promotion.module}: ${promotion.supersededBy} is not a recorded scope addition, so ` +
            'the promotion has no accounted-for cause',
        );
      }
      if (!subtreeFileExists(promotion.supersededBy)) {
        offenders.push(`${promotion.module}: ${promotion.supersededBy} is not on disk`);
      }
      if (promotion.reason.trim().length < 40) {
        offenders.push(`${promotion.module}: promoted without a stated reason`);
      }
    }
    expect(offenders.sort()).toEqual([]);

    // Both recorded MODULE additions carry their own suite, which is why neither one moves the
    // exempt count.
    expect(
      missingFrom(
        addedModules.map((addition) => addition.path),
        MAPPED_MODULES,
      ),
    ).toEqual([]);
  });

  it('keeps the plan\u2019s zero-contribution record readable next to the current census', () => {
    const zeroContribution = LEGACY_TEST_MAP.frozenExemptPromotions
      .filter((promotion) => promotion.frozenZeroContribution)
      .map((promotion) => promotion.module);

    expect(zeroContribution.sort()).toEqual(['src/lib/config.ts', 'src/lib/logger.ts']);
    const gapSubjects = LEGACY_TEST_MAP.acknowledgedGaps.map((gap) => gap.subject).join(' | ');
    expect(gapSubjects).toContain('zero-contribution record');
  });
});

// Read as executable code, which is why the records of the removals survive.

describe('A19 no invented non-functional requirement, and no sampled entropy, in any suite', () => {
  /**
   * Every suite on disk, as executable code with its comments blanked.
   */
  const executableSuites = (): readonly { readonly file: string; readonly code: string }[] =>
    TEST_FILES_ON_DISK.map((file) => ({
      file,
      code: scanSource(readSubtreeFile(file)).executable,
    }));

  it('reads every suite on disk as code, so neither ban below can pass vacuously', () => {
    const suites = executableSuites();

    // The census this block runs over is the same one `A14` partitions, and the volume is stated
    // so that a reader mangling `scanSource` into returning empty strings fails here first.
    expect(suites).toHaveLength(TEST_FILES_ON_DISK.length);
    expect(suites.length).toBeGreaterThan(50);
    expect(suites.reduce((total, suite) => total + suite.code.length, 0)).toBeGreaterThan(
      1_000_000,
    );
    // The scanner is proven on a constructed probe rather than on this module's own prose, so the
    // guarantee holds no matter how the surrounding commentary is edited. The needle is composed at
    // runtime so it cannot satisfy the search it performs.
    const bannedShape = 'Date.now()' + ' - started';
    const probe = `// ${bannedShape}\nconst kept = 1;\n`;

    expect(probe).toContain(bannedShape);
    expect(scanSource(probe).executable).not.toContain(bannedShape);
    expect(scanSource(probe).executable).toContain('const kept = 1;');
  });

  it('asserts no wall-clock bound anywhere, because AAP 0.8.1 forbids inventing one', () => {
    // A clock read inside an assertion is the shape being banned - not clock reads as such.
    const CLOCK_READS = ['Date.now()', 'performance.now()', 'hrtime'];
    const offenders: string[] = [];

    for (const { file, code } of executableSuites()) {
      const lines = code.split('\n');

      lines.forEach((line, index) => {
        if (!line.includes('expect(')) {
          return;
        }

        for (const clock of CLOCK_READS) {
          if (line.includes(clock)) {
            offenders.push(`${file}:${String(index + 1)} asserts on ${clock}`);
          }
        }
      });
    }

    expect(
      offenders.sort(),
      'A committed test may not assert a duration: AAP 0.8.1 records that the legacy system states ' +
        'no latency, throughput or uptime requirement and that none may be invented, and a ' +
        'wall-clock assertion also fails on a loaded host with nothing wrong. Prove guard ORDER ' +
        'structurally instead - boundary values, which limit a refusal names, or a tripwire that ' +
        'fires when a value is traversed - as tests/unit/repositories/connection.test.ts and ' +
        'tests/unit/services/roundingRuleService.test.ts now do.',
    ).toEqual([]);
  });

  it('and samples no entropy, because a scripted source proves what the code did with it', () => {
    // `Math.random(` is the CALL. Scripting it - `vi.spyOn(Math, 'random')` - does not match,
    // which is the whole point: the deterministic route stays open and the sampling route closes.
    const offenders: string[] = [];

    for (const { file, code } of executableSuites()) {
      if (code.includes('Math.random(')) {
        offenders.push(file);
      }
    }

    expect(
      offenders.sort(),
      'A committed test may not draw from an unscripted random source: the outcome is then a claim ' +
        'about the platform rather than about this port, it can fail with nothing wrong, and it ' +
        'cannot say WHICH outcomes are possible. Script the source instead - ' +
        "`vi.spyOn(Math, 'random')` for the option-group tie-breaker, or a mocked `randomUUID` for " +
        'an identifier generator - and assert the exact outcomes, as ' +
        'tests/unit/domain/entities/optionGroup.test.ts and ' +
        'tests/unit/domain/entities/promotionCode.test.ts now do.',
    ).toEqual([]);
  });

  it('and the two suites the review named prove their guards without either shape', () => {
    // Named explicitly, so the two fixes cannot be reverted while the general bans above stay
    // green on a technicality - a reverted case would trip the bans.
    const connection = readSubtreeFile('tests/unit/repositories/connection.test.ts');
    const rounding = readSubtreeFile('tests/unit/services/roundingRuleService.test.ts');

    // Magnitude independence, which is the signature of a comparison rather than a traversal.
    expect(connection).toContain('SqlTupleShapeError');
    expect(connection).toContain('Number.MAX_SAFE_INTEGER');
    expect(connection).toContain('REFUSES BY COMPARISON RATHER THAN BY TRAVERSAL');

    // The tripwire, which fires if anything reaches the characters of an over-long expression.
    expect(rounding).toContain('TRAVERSED:');
    expect(rounding).toContain('WITHOUT TRAVERSING THE VALUE AT ALL');
    expect(rounding).toContain('CHEAPEST-FIRST');

    // And the 50 MB allocation the duration was measured against is gone from the code.
    expect(scanSource(rounding).executable).not.toContain("'9'.repeat(50_000_000)");
  });
});

describe('A20 schema continuity: abbreviated link-table names, held to the legacy declarations', () => {
  /**
   * AAP 0.8.1 "Schema Continuity" binds this port to the existing `Sw*` MySQL tables: no
   * migration, no rename, no column change.
   */
  const ABBREVIATION_EXPANSIONS: readonly (readonly [string, string])[] = [
    ['Promo', 'Promotion'],
    ['Qual', 'Qualifier'],
    ['Excl', 'Exclusion'],
    ['Grp', 'Group'],
    ['Subs', 'Subscription'],
  ];

  /**
   * Every `linktable="..."` value declared by the 18 in-scope entities, with its legacy file.
   */
  function declaredLinkTables(): ReadonlyMap<string, string[]> {
    const declared = new Map<string, string[]>();
    for (const module of SOURCE_MODULES_ON_DISK.filter((file) =>
      file.startsWith('src/domain/entities/'),
    )) {
      const base = path.posix.basename(module, '.ts');
      const legacyFile = `model/entity/${base.charAt(0).toUpperCase()}${base.slice(1)}.cfc`;
      const declarations = readRepositoryFile(legacyFile).matchAll(
        /linktable="(?<table>[A-Za-z]+)"/gu,
      );
      for (const declaration of declarations) {
        const table = declaration.groups?.['table'];
        if (table === undefined) {
          continue;
        }
        const owners = declared.get(table) ?? [];
        if (!owners.includes(legacyFile)) {
          owners.push(legacyFile);
        }
        declared.set(table, owners);
      }
    }
    return declared;
  }

  /**
   * The shipped source, split into the code that runs and the commentary that explains it.
   */
  function shippedSource(): { readonly executable: string; readonly whole: string } {
    let executable = '';
    let whole = '';
    for (const module of SOURCE_MODULES_ON_DISK) {
      const contents = readSubtreeFile(module);
      whole += `\n${contents}`;
      executable += `\n${scanSource(contents).executable}`;
    }
    return { executable, whole };
  }

  function names(text: string, table: string): boolean {
    return new RegExp(`\\b${table}\\b`, 'u').test(text);
  }
  const DOCUMENTED_NOT_QUERIED: readonly string[] = [
    'SwContentCategory',
    'SwPhysicalBrand',
    'SwPhysicalProductType',
    'SwPhysicalSku',
    'SwPromotionCodeAccount',
    'SwVendorBrand',
  ];

  it('derives its subject from the legacy declarations, and finds a populated one', () => {
    const declared = declaredLinkTables();

    // Non-vacuity: a silent read failure or a changed attribute spelling would empty this map, and
    // every assertion below would then pass by having nothing to check.
    expect(declared.size).toBe(53);
    expect([...declared.keys()].filter((table) => /^Sw[A-Za-z]+$/u.test(table))).toHaveLength(53);

    // The two AAP 0.2.1 names, on the entities that own the wide link-table sets.
    expect(declared.get('SwPromoQualProduct')).toContain('model/entity/PromotionQualifier.cfc');
    expect(declared.get('SwPromoRewardProduct')).toContain('model/entity/PromotionReward.cfc');

    // Inverse collections mean a table is declared twice, once from each side.
    expect(declared.get('SwPromoRewardBrand')).toEqual([
      'model/entity/Brand.cfc',
      'model/entity/PromotionReward.cfc',
    ]);
  });

  it('names every declared table verbatim, and queries all but the six out-of-scope ones', () => {
    const declared = [...declaredLinkTables().keys()].sort();
    const { executable, whole } = shippedSource();

    // Tier 1: present SOMEWHERE in the source of the port.
    const absent = declared.filter((table) => !names(whole, table));
    expect(absent).toEqual([]);
    const documentedOnly = declared.filter((table) => !names(executable, table));
    expect(documentedOnly).toEqual([...DOCUMENTED_NOT_QUERIED].sort());
    expect(declared.length - documentedOnly.length).toBe(47);

    // And each exception really is only commentary - a stale entry here would be a table the port
    // silently started querying while still claiming it does not.
    for (const table of DOCUMENTED_NOT_QUERIED) {
      expect(names(whole, table)).toBe(true);
      expect(names(executable, table)).toBe(false);
    }
  });

  it('never expands an abbreviation, in code or in commentary', () => {
    const declared = [...declaredLinkTables().keys()].sort();
    const { whole } = shippedSource();

    const abbreviated = declared.filter((table) =>
      ABBREVIATION_EXPANSIONS.some(([short]) => table.includes(short)),
    );

    // All five families are represented, so no family is checked vacuously.
    expect(abbreviated).toHaveLength(36);
    const families = ABBREVIATION_EXPANSIONS.filter(([short]) =>
      abbreviated.some((table) => table.includes(short)),
    ).map(([short]) => short);
    expect(families).toEqual(['Promo', 'Qual', 'Excl', 'Grp', 'Subs']);

    const expansions: string[] = [];
    for (const table of abbreviated) {
      for (const [short, long] of ABBREVIATION_EXPANSIONS) {
        if (!table.includes(short)) {
          continue;
        }
        const expanded = table.replaceAll(short, long);
        if (expanded !== table && names(whole, expanded)) {
          expansions.push(`${table} was expanded to ${expanded}`);
        }
      }
    }
    expect(expansions).toEqual([]);
  });

  it('carries every entity table and ORM entity name across, verbatim', () => {
    // The same substitution, one level up: a suite that restates `SwBrand` / `SlatwallBrand` as
    // local constants ends up comparing them with themselves, so both are read from the source.
    const { executable, whole } = shippedSource();
    const tables: string[] = [];
    const entityNames: string[] = [];
    const documentedOnly: string[] = [];

    for (const module of SOURCE_MODULES_ON_DISK.filter((file) =>
      file.startsWith('src/domain/entities/'),
    )) {
      const base = path.posix.basename(module, '.ts');
      const legacy = readRepositoryFile(
        `model/entity/${base.charAt(0).toUpperCase()}${base.slice(1)}.cfc`,
      );
      const table = /\btable="(?<table>Sw[A-Za-z]+)"/u.exec(legacy)?.groups?.['table'];
      const entityName = /\bentityname="(?<name>Slatwall[A-Za-z]+)"/u.exec(legacy)?.groups?.[
        'name'
      ];
      expect(table).toBeDefined();
      expect(entityName).toBeDefined();
      tables.push(table ?? '');
      entityNames.push(entityName ?? '');

      expect(names(whole, table ?? '')).toBe(true);
      expect(names(whole, entityName ?? '')).toBe(true);
      if (!names(executable, table ?? '')) {
        documentedOnly.push(table ?? '');
      }
    }

    expect(tables).toHaveLength(18);
    expect(new Set(entityNames).size).toBe(18);
    expect(documentedOnly.sort()).toEqual(['SwCategory', 'SwPromotionAccount']);
  });

  it("counts the reward's fourteen link tables against the qualifier's thirteen", () => {
    // The census the entity suites navigate, derived from the frozen components instead of from a
    // fixture array compared with a second array in the same file.
    const DECLARATION = /name="(?<property>[a-zA-Z]+)"[^;]*linktable="(?<table>[A-Za-z]+)"/gu;
    function census(legacyFile: string): Map<string, string> {
      const found = new Map<string, string>();
      for (const declaration of readRepositoryFile(legacyFile).matchAll(DECLARATION)) {
        const property = declaration.groups?.['property'];
        const table = declaration.groups?.['table'];
        if (property !== undefined && table !== undefined) {
          found.set(property, table);
        }
      }
      return found;
    }

    const reward = census('model/entity/PromotionReward.cfc');
    const qualifier = census('model/entity/PromotionQualifier.cfc');

    expect(reward.size).toBe(14);
    expect(qualifier.size).toBe(13);

    const differentiator = [...reward.keys()].filter((property) => !qualifier.has(property));
    expect(differentiator).toEqual(['eligiblePriceGroups']);
    expect(reward.get('eligiblePriceGroups')).toBe('SwPromoRewardEligiblePriceGrp');
    expect(reward.get('eligiblePriceGroups')).not.toBe('SwPromoRewardEligiblePriceGroup');

    // Every other property is shared, and every shared property's table differs only by the
    // owner's own abbreviated prefix - `SwPromoReward…` against `SwPromoQual…`.
    for (const [property, table] of qualifier) {
      expect(reward.has(property)).toBe(true);
      expect(table.startsWith('SwPromoQual')).toBe(true);
      expect(reward.get(property)?.startsWith('SwPromoReward')).toBe(true);
      expect(reward.get(property)).toBe(table.replace('SwPromoQual', 'SwPromoReward'));
    }

    // And all fourteen reach the shipped source.
    const { whole } = shippedSource();
    expect([...reward.values()].filter((table) => !names(whole, table))).toEqual([]);

    // The `type="array"` wart, also derived: three of the reward's fourteen declare it and two of
    // the qualifier's thirteen do, which is what makes it copy-paste drift rather than intent.
    function declaringTypeArray(legacyFile: string): string[] {
      return readRepositoryFile(legacyFile)
        .split(/\r?\n/)
        .filter((line) => line.includes('linktable="') && line.includes('type="array"'))
        .map((line) => /name="(?<property>[a-zA-Z]+)"/u.exec(line)?.groups?.['property'] ?? '');
    }
    expect(declaringTypeArray('model/entity/PromotionReward.cfc')).toEqual([
      'eligiblePriceGroups',
      'excludedBrands',
      'excludedOptions',
    ]);
    expect(declaringTypeArray('model/entity/PromotionQualifier.cfc')).toEqual([
      'excludedBrands',
      'excludedOptions',
    ]);
  });

  it("keeps PriceGroupRate's one abbreviated exclude table abbreviated, and only that one", () => {
    // Of the three exclude tables, only `excludedProductTypes` at [model/entity/Sku.cfc:L75]
    // shortens `Group` to `Grp`; [model/entity/Sku.cfc:L76] and [model/entity/Sku.cfc:L77] spell
    // it in full.
    const declarations: readonly (readonly [number, string, string])[] = [
      [71, 'productTypes', 'SwPriceGroupRateProductType'],
      [72, 'products', 'SwPriceGroupRateProduct'],
      [73, 'skus', 'SwPriceGroupRateSku'],
      [75, 'excludedProductTypes', 'SwPriceGrpRateExclProductType'],
      [76, 'excludedProducts', 'SwPriceGroupRateExclProduct'],
      [77, 'excludedSkus', 'SwPriceGroupRateExclSku'],
    ];
    const shipped = readSubtreeFile('src/domain/entities/priceGroupRate.ts');
    const { whole } = shippedSource();

    for (const [line, property, table] of declarations) {
      const declared = repositoryLine('model/entity/PriceGroupRate.cfc', line);
      expect(declared).toContain(`name="${property}"`);
      expect(declared).toContain(`linktable="${table}"`);

      // Every collection is published, and every table name reaches the port.
      const accessor = `get${property.charAt(0).toUpperCase()}${property.slice(1)}`;
      expect(shipped).toContain(accessor);
      expect(names(whole, table)).toBe(true);
    }

    // Exactly one abbreviates, and the include tables never carry the exclusion marker.
    const abbreviated = declarations
      .filter(([, , table]) => table.startsWith('SwPriceGrpRate'))
      .map(([, , table]) => table);
    expect(abbreviated).toEqual(['SwPriceGrpRateExclProductType']);

    const marked = declarations
      .filter(([, , table]) => table.includes('Excl'))
      .map(([, property]) => property);
    expect(marked).toEqual(['excludedProductTypes', 'excludedProducts', 'excludedSkus']);
  });

  it('joins on the lowercase-f orderfulfillmentID column the legacy actually declares', () => {
    // The sharpest schema-continuity case in the slice, and one a documentary assertion cannot
    // reach.
    const declaration = repositoryLine('model/entity/PromotionApplied.cfc', 60);
    const owningColumn = /fkcolumn="(?<column>[A-Za-z]+)"/u.exec(declaration)?.groups?.['column'];

    expect(owningColumn).toBe('orderfulfillmentID');
    expect(owningColumn).not.toBe('orderFulfillmentID');

    // Its three siblings capitalise, which is what makes L60 the outlier rather than the
    // convention.
    for (const [line, expected] of [
      [58, 'promotionID'],
      [59, 'orderItemID'],
      [61, 'orderID'],
    ] as const) {
      expect(repositoryLine('model/entity/PromotionApplied.cfc', line)).toContain(
        `fkcolumn="${expected}"`,
      );
    }

    // And the shipped statement carries both spellings across the same join, in executable code.
    const emitted = scanSource(
      readSubtreeFile('src/repositories/mysql/sql/promotionUseCounts.sql.ts'),
    ).executable;
    const joins = emitted.split(`pa.${owningColumn ?? ''} = orderf.orderFulfillmentID`).length - 1;
    expect(joins).toBe(2);
  });

  it("holds Brand's six inverse link tables to their frozen legacy lines", () => {
    // The substance rescued from a documentary case that compared a literal with itself.
    const BRAND_DECLARATIONS: readonly (readonly [number, string])[] = [
      [66, 'SwPromoRewardBrand'],
      [67, 'SwPromoRewardExclBrand'],
      [68, 'SwPromoQualBrand'],
      [69, 'SwPromoQualExclBrand'],
      [70, 'SwVendorBrand'],
      [71, 'SwPhysicalBrand'],
    ];
    const { executable, whole } = shippedSource();

    for (const [line, table] of BRAND_DECLARATIONS) {
      expect(repositoryLine('model/entity/Brand.cfc', line)).toContain(`linktable="${table}"`);
      expect(names(whole, table)).toBe(true);
    }

    const queried = BRAND_DECLARATIONS.filter(([, table]) => names(executable, table)).map(
      ([, table]) => table,
    );
    expect(queried).toEqual([
      'SwPromoRewardBrand',
      'SwPromoRewardExclBrand',
      'SwPromoQualBrand',
      'SwPromoQualExclBrand',
    ]);
  });
});

// Two of the nineteen contract variables carry a length bound of their own - `DB_TLS_CA` accepts
// inline PEM and `ECB_REFERENCE_RATES` accepts a long rate list, and both are bounded explicitly.
//
// The arithmetic is recomputed from the source rather than restated, so the assertion cannot agree
// with a comment while disagreeing with the code.

describe('A18 the environment delivery-size contract fits the platform quota', () => {
  const LAMBDA_ENVIRONMENT_QUOTA_BYTES = 4_096;

  /**
   * The documented maxima, parsed out of `src/lib/config.ts` rather than duplicated here.
   */
  const documentedMaxima = (): ReadonlyMap<string, number> => {
    const source = readSubtreeFile('src/lib/config.ts');
    const block =
      /CONTRACT_KEY_MAX_VALUE_BYTES:\s*Readonly<Record<string, number>>\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/.exec(
        source,
      );

    if (block === null) {
      throw new Error(
        'legacyTestMap could not find CONTRACT_KEY_MAX_VALUE_BYTES in src/lib/config.ts',
      );
    }

    const parsed = new Map<string, number>();

    for (const [, key, value] of (block[1] ?? '').matchAll(
      /^\s*([A-Z][A-Z0-9_]*):\s*([\d_]+),/gm,
    )) {
      parsed.set(key ?? '', Number((value ?? '').replaceAll('_', '')));
    }

    return parsed;
  };

  it('DOCUMENTS A MAXIMUM FOR EVERY CONTRACT VARIABLE, and only for those', () => {
    // The contract is the nineteen keys `.env.example` publishes. A variable with no documented
    // maximum is a variable that can grow without limit, which is the defect.
    const maxima = documentedMaxima();
    const template = readSubtreeFile('.env.example');

    // The optional `#` is FLUSH-ONLY, which is the file's own convention and is what keeps this
    // precise: a declaration is written hard against the margin - live (`FEED_ALLOWED_HOSTS=`) or.
    const declared = [...template.matchAll(/^#?([A-Z][A-Z0-9_]*)=/gm)].map(([, key]) => key ?? '');

    expect(maxima.size).toBe(19);
    expect([...maxima.keys()].sort()).toStrictEqual([...declared].sort());
  });

  it('KEEPS THE SUM OF THE MAXIMA, PLUS KEY NAMES, INSIDE THE 4,096-BYTE QUOTA', () => {
    // The pre-deploy check.
    const maxima = documentedMaxima();

    let ceiling = 0;
    for (const [key, maxValueBytes] of maxima) {
      ceiling += key.length + maxValueBytes + 1;
    }

    expect(ceiling).toBeLessThanOrEqual(LAMBDA_ENVIRONMENT_QUOTA_BYTES);

    // Pinned exactly, so a change to any maximum is visible in the diff rather than absorbed
    // silently by the headroom. The value is the arithmetic written out in the docblock on
    // `CONTRACT_KEY_MAX_VALUE_BYTES`.
    expect(ceiling).toBe(4_050);
  });

  it('bounds the two variables that used to be unbounded, and bounds them to something usable', () => {
    // `DB_TLS_CA` has to hold one ordinary PEM certificate authority, and `ECB_REFERENCE_RATES`
    // has to hold the roughly thirty currencies the ECB publishes.
    const maxima = documentedMaxima();

    expect(maxima.get('DB_TLS_CA')).toBeGreaterThanOrEqual(1_024);
    expect(maxima.get('ECB_REFERENCE_RATES')).toBeGreaterThanOrEqual(360);
  });

  it('enforces the budget in configuration, not only in documentation', () => {
    // The bound is worth nothing if it is only prose. These are the two refusals - one
    // per-variable, one aggregate - and the measurement unit that makes them correct for a
    // non-ASCII value.
    const source = readSubtreeFile('src/lib/config.ts');

    expect(source).toContain('MAX_DELIVERABLE_ENVIRONMENT_BYTES');
    expect(source).toContain('assertDeliverableEnvironment');
    expect(source).toContain('new TextEncoder().encode(value).length');
  });

  it('publishes the contract in the committed template and the README', () => {
    // An operator hitting the bound needs to read the maxima and the alternatives somewhere other
    // than the source.
    const template = readSubtreeFile('.env.example');

    expect(template).toContain('DELIVERY-SIZE CONTRACT');
    expect(template).toContain('4096');
  });
});

/**
 * Every hand-authored TypeScript artifact in the subtree, plus the two `.mjs` tooling configs.
 *
 * The `.mjs` files are outside `tsconfig.json`'s `include`, so nothing else in this suite reads
 * them as source - which is exactly why the comment gate has to.
 */
const COMMENT_GOVERNED_ARTIFACTS: readonly string[] = Object.freeze([
  ...SOURCE_MODULES_ON_DISK,
  ...listTypeScriptFiles('tests'),
  'vitest.config.ts',
  'eslint.config.mjs',
  'esbuild.config.mjs',
]);

/**
 * One run of adjacent comment lines, with the file and first line it starts at.
 */
interface CommentBlock {
  readonly file: string;
  readonly line: number;
  /** The comment's own characters only, `//`, `/*`, `*` and `*\/` delimiters already stripped. */
  readonly text: string;
}

/**
 * Splits a file into comment blocks, reading the comment half of the scan so that a marker word
 * inside a string literal or a URL inside code can never be mistaken for a comment.
 *
 * Blocks break on any line carrying no comment, and on a comment line whose content is empty, so a
 * paragraph break inside one `/** *\/` docblock yields two blocks. That is deliberate: the size
 * budget is a budget on how much a reader must absorb before the next breath, not on how many
 * delimiters an author used.
 */
function commentBlocksOf(file: string): CommentBlock[] {
  const lines = scanSource(readSubtreeFile(file)).comments.split('\n');
  const blocks: CommentBlock[] = [];
  let current: string[] = [];
  let startLine = 0;

  const flush = (): void => {
    if (current.length > 0) {
      blocks.push(Object.freeze({ file, line: startLine, text: current.join('\n') }));
      current = [];
    }
  };

  lines.forEach((raw, index) => {
    // Strip the delimiters, keeping the interior verbatim so an offset inside a sentence survives.
    const content = raw
      .replace(/^\s*\/\*\*?/u, '')
      .replace(/^\s*\/\//u, '')
      .replace(/^\s*\*(?!\/)/u, '')
      .replace(/\*\/\s*$/u, '')
      .trim();
    if (content.length === 0) {
      flush();
      return;
    }
    if (current.length === 0) {
      startLine = index + 1;
    }
    current.push(content);
  });
  flush();
  return blocks;
}

const ALL_COMMENT_BLOCKS: readonly CommentBlock[] = Object.freeze(
  COMMENT_GOVERNED_ARTIFACTS.flatMap((file) => commentBlocksOf(file)),
);

/**
 * The four annotation keywords AAP 0.6.7 and this port's doctrine define, and the one trailer.
 */
const MARKER_KEYWORDS = Object.freeze([
  'LEGACY-DEFECT',
  'DELIBERATE DIVERGENCE',
  'LEGACY-NOTE',
  'JUDGMENT CALL',
] as const);
const PRESERVED_DEFECT_TRAILER = 'Preserved deliberately; do not fix without a product decision.';

describe('A28 comment discipline: the doctrine, enforced against the tree rather than described', () => {
  it('reads real comment blocks out of every governed artifact, so no ban below can pass vacuously', () => {
    // A scan that returned nothing would satisfy every prohibition at once, so prove it returns
    // something first, and that it returns comments rather than code.
    expect(COMMENT_GOVERNED_ARTIFACTS.length).toBeGreaterThan(150);
    expect(ALL_COMMENT_BLOCKS.length).toBeGreaterThan(5_000);
    expect(new Set(ALL_COMMENT_BLOCKS.map((block) => block.file)).size).toBe(
      COMMENT_GOVERNED_ARTIFACTS.length,
    );

    // The two halves of the scan are complements: a marker word lives in one and never the other.
    const probe = scanSource(
      ['const legend = "LEGACY-DEFECT [x.cfc:L1]";', '// LEGACY-DEFECT [y.cfc:L2]: real.'].join(
        '\n',
      ),
    );
    expect(probe.executable).toContain('"LEGACY-DEFECT [x.cfc:L1]"');
    expect(probe.executable).not.toContain('y.cfc');
    expect(probe.comments).toContain('LEGACY-DEFECT [y.cfc:L2]');
    expect(probe.comments).not.toContain('x.cfc');
    // Every half is the same length as the input, so a line number means one thing in all three.
    expect(probe.comments.length).toBe(probe.executable.length);
  });

  it('keeps every comment block inside the size budget', () => {
    // 1000 characters is roughly a dense paragraph. Past that a block stops being read.
    const BUDGET = 1_000;
    const offenders = ALL_COMMENT_BLOCKS.filter((block) => block.text.length > BUDGET).map(
      (block) => `${block.file}:${String(block.line)} (${String(block.text.length)})`,
    );
    expect(
      offenders,
      'a comment block over the budget is documentation nobody finishes: condense it to the legacy ' +
        'locator plus the non-obvious WHY, or split it into paragraphs.',
    ).toEqual([]);
  });

  it('narrates the implementation rather than the reviews that shaped it', () => {
    // Each pattern is process residue rather than a fact about the code. A reader needs the final
    // constraint, not the sequence of revisions that arrived at it.
    const banned: readonly [RegExp, string][] = [
      [/QUOTE-THEN-REVISE/iu, 'quote-then-revise history'],
      [/\b(?:an|the) earlier revision\b/iu, 'earlier-revision narration'],
      [
        /\bthis (?:file|paragraph|section|bullet|record) (?:previously|used to)\b/iu,
        'self-quotation',
      ],
      [/\ba code review\b/iu, 'review narration'],
      [/\breview (?:found|measured|recorded|withdrew|raised)\b/iu, 'review narration'],
      [/\bre-?raised as\b/iu, 'escalation narration'],
      [/\braised (?:again|a (?:second|third|fourth|fifth) time)\b/iu, 'escalation narration'],
      [/\b(?:withdrawn|superseded) (?:text|wording|sentence|claim)\b/iu, 'superseded text'],
      [/\bSEC-[A-Z]\b/u, 'security-review finding id'],
      [/\bCWE-\d+/u, 'weakness-catalogue id'],
      [/\b[FSV]-?\d{1,2}\b(?=\s*\(|\s*:|,)/u, 'review finding id'],
      [/\(F\d{1,2}\)/u, 'review finding id'],
      [/\bQA[ -](?:testing|Issue|found|I\d)/iu, 'test-cycle narration'],
      [/\bINFO-\d/u, 'test-cycle finding id'],
      [/\b(?:header|shipped-surface)? ?correction \d/iu, 'correction-sequence narration'],
      [/\ban intervening revision\b/iu, 'intervening-revision narration'],
      [/\bthis paragraph (?:once|used to)\b/iu, 'self-quotation'],
      [/\bthe (?:accepted|previous) revision\b/iu, 'revision narration'],
      [/\bstruck-down\b/iu, 'revision narration'],
      [/\b(?:that|the|this|earlier|its) reversal\b/iu, 'revision narration'],
      // `used to` is instrumental far more often than narrative - "used to prove", "used to bound".
      // Only the narrative verbs are banned, so the innocent form stays available.
      [
        /\bused to (?:stand|read|say|claim|reject|pool|index|return|run|consume|make|emit|mean|count|forge|serve|appear|restate|sit|hold|produce|apply|be|have|do|refuse|throw|leave|swallow|stub|echo)\b/iu,
        'revision narration',
      ],
    ];
    const offenders: string[] = [];
    for (const block of ALL_COMMENT_BLOCKS) {
      for (const [pattern, label] of banned) {
        if (pattern.test(block.text)) {
          offenders.push(`${block.file}:${String(block.line)} :: ${label}`);
        }
      }
    }
    expect(
      offenders,
      'comments record what the code does and why, never how a review arrived at it.',
    ).toEqual([]);
  });

  it('paraphrases legacy behaviour instead of pasting bodies into comments', () => {
    // A pasted body drifts silently against the source it copies, and the locator already points
    // at the authority. One illustrative line is fine; a reproduced body is not.
    const CODE_LINE =
      /^(?:\s*(?:public|private|component|property|var|function|if\s*\(|for\s*\(|while\s*\(|<cf|SELECT\s|INSERT\s|UPDATE\s|return\s)|.*\)\s*\{\s*$|.*;\s*$)/u;
    const offenders: string[] = [];
    for (const block of ALL_COMMENT_BLOCKS) {
      const codeLines = block.text
        .split('\n')
        .filter((line) => CODE_LINE.test(line) && !line.startsWith('@'));
      if (codeLines.length >= 3) {
        offenders.push(
          `${block.file}:${String(block.line)} (${String(codeLines.length)} code lines)`,
        );
      }
    }
    expect(
      offenders,
      'cite the verified locator and paraphrase the semantic distinction instead of reproducing a body.',
    ).toEqual([]);
  });

  it('writes every annotation in the canonical form, at the start of its own comment line', () => {
    // A keyword buried mid-sentence is unfindable by grep, and the bundler's recoverability audit
    // matches the bracketed form specifically, so the bracket is not decoration.
    const offenders: string[] = [];
    for (const file of COMMENT_GOVERNED_ARTIFACTS) {
      const { comments } = scanSource(readSubtreeFile(file));
      comments.split('\n').forEach((raw, index) => {
        const stripped = raw.replace(/\x60[^\x60]*\x60/gu, '``');
        for (const keyword of MARKER_KEYWORDS) {
          // An annotation is a keyword carrying a bracketed legacy locator - the shape
          // `esbuild.config.mjs` matches when it proves the markers survive into a source map, and
          // the shape AAP 0.6.7 mandates. A keyword without one is prose naming the vocabulary,
          // which is legitimate mid-sentence.
          const annotationForms =
            keyword === 'JUDGMENT CALL' ? [`${keyword} [`, `${keyword}:`] : [`${keyword} [`];
          if (!annotationForms.some((form) => stripped.includes(form))) {
            continue;
          }
          const opensTheLine = new RegExp(
            `^\\s*(?:/[/*]+|\\*)?\\s*${keyword.replace(' ', '\\s')}(?:\\s\\[|:)`,
            'u',
          );
          if (opensTheLine.test(stripped)) {
            continue;
          }
          offenders.push(`${file}:${String(index + 1)} :: ${keyword} is embedded, not opening`);
        }
      });
    }
    expect(
      offenders,
      'an annotation opens its comment line and carries a bracketed legacy locator.',
    ).toEqual([]);
  });

  it('gives every preserved defect exactly one do-not-fix trailer', () => {
    // The trailer separates "reproduced knowingly" from "not noticed yet". Two trailers on one
    // defect reads as two defects; none reads as an unexamined bug. A defect CLOSED by a
    // DELIBERATE DIVERGENCE in the same block is the one shape that carries no trailer, because it
    // was not preserved - the divergence states what happened to it instead.
    const offenders: string[] = [];
    for (const block of ALL_COMMENT_BLOCKS) {
      const defects = block.text
        .split('\n')
        .filter((line) => /^\s*LEGACY-DEFECT\s\[/u.test(line)).length;
      const closed = block.text
        .split('\n')
        .some((line) => /^\s*DELIBERATE DIVERGENCE\s\[/u.test(line));
      const trailers = block.text.split(PRESERVED_DEFECT_TRAILER).length - 1;
      if (defects === 0 && trailers > 0) {
        offenders.push(`${block.file}:${String(block.line)} :: trailer with no LEGACY-DEFECT`);
      }
      if (closed && trailers > 0) {
        offenders.push(`${block.file}:${String(block.line)} :: trailer on a closed defect`);
      }
      if (defects > 0 && !closed && trailers !== 1) {
        offenders.push(
          `${block.file}:${String(block.line)} :: ${String(defects)} LEGACY-DEFECT, ${String(trailers)} trailer`,
        );
      }
    }
    expect(offenders, 'one preserved LEGACY-DEFECT block, one trailer.').toEqual([]);

    // And the trailer is used somewhere, so the check above is not asserting over nothing.
    expect(
      ALL_COMMENT_BLOCKS.filter((block) => block.text.includes(PRESERVED_DEFECT_TRAILER)).length,
    ).toBeGreaterThan(50);
  });

  it('cites a named legacy file rather than a bare line or a placeholder', () => {
    // A line number with no file beside it is unresolvable the moment the sentence around it is
    // edited, and a placeholder citation is a citation that was never made. Backticked spans are
    // masked first: they quote legacy expressions, where a subscript is code and not a locator.
    const BARE = /\[\s*L\d/u;
    const PLACEHOLDER = /\[<[a-z]|<locator>|\[TBD|\[XXX/iu;
    const offenders: string[] = [];
    for (const block of ALL_COMMENT_BLOCKS) {
      const prose = block.text.replace(/\x60[^\x60]*\x60/gu, '``');
      if (BARE.test(prose)) {
        offenders.push(`${block.file}:${String(block.line)} :: bare line locator`);
      }
      if (PLACEHOLDER.test(prose)) {
        offenders.push(`${block.file}:${String(block.line)} :: placeholder citation`);
      }
    }
    expect(offenders, 'name the legacy file and a verified line, or drop the citation.').toEqual(
      [],
    );
  });

  it('carries no decorative glyph or rule in a comment', () => {
    // Emphasis by glyph does not survive a grep and does not tell a reader anything the sentence
    // cannot. A run of rules is navigation the section heading already provides.
    const GLYPH = /[\u2605\u2606\u25B2\u25CF\u25C6\u2666\u00BB\u2726\u2727\u279C\u2794]/u;
    const RULE = /={3,}|-{5,}|\*{4,}|_{5,}|~{4,}/u;
    const offenders: string[] = [];
    for (const block of ALL_COMMENT_BLOCKS) {
      const withoutCode = block.text.replace(/\x60[^\x60]*\x60/gu, '``');
      if (GLYPH.test(withoutCode)) {
        offenders.push(`${block.file}:${String(block.line)} :: decorative glyph`);
      }
      if (RULE.test(withoutCode)) {
        offenders.push(`${block.file}:${String(block.line)} :: separator rule`);
      }
    }
    expect(
      offenders,
      'delete the glyph or rule; a short heading is the whole of what it bought.',
    ).toEqual([]);
  });

  it('states behaviour without a floating temporal claim', () => {
    // A floating tense dates a sentence the moment it is written, and the words below are the ones
    // that carry one. The single exception is a legacy TODO carried over verbatim: that is quoted
    // source text rather than a claim this port is making.
    const TEMPORAL =
      /\b(?:as of (?:today|now)|today|currently|at present|right now|for now|no longer receives)\b/iu;
    const offenders = ALL_COMMENT_BLOCKS.filter(
      (block) => TEMPORAL.test(block.text) && !block.text.includes('TODO [issue #1766]'),
    ).map((block) => `${block.file}:${String(block.line)}`);
    expect(
      offenders,
      'use timeless language or an absolute date; a floating tense becomes false without an edit.',
    ).toEqual([]);
  });
});
