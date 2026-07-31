// ---------------------------------------------------------------------------
// slatwall-ts - ESLint flat configuration
//
// This file carries the single most important mechanical guarantee in the
// subtree. The target architecture is ports-and-adapters (hexagonal) with a
// strictly domain-inward dependency flow, and the `no-restricted-imports`
// block below is what makes that flow a BUILD FAILURE rather than a
// code-review convention: `src/domain/**` may not import from
// `src/repositories/**`, `src/handlers/**` or `src/integrations/**`.
//
// WHY THAT RULE IS NOT THEORETICAL
// The legacy CFML slice violated the boundary constantly, through two
// mechanisms this port removes outright:
//
//   T1 - DI/1 convention scan. Each service declared its collaborators as
//        `property name="xService";` at the top of the component and a runtime
//        bean-factory scan resolved them. `model/service/ProductService.cfc`
//        declares eight of them at L52-L60 (productDAO, skuDAO,
//        productTypeDAO, dataService, contentService, skuService,
//        subscriptionService, optionService). In the target every collaborator
//        is an explicit, compile-checked constructor argument wired once in
//        `src/handlers/bootstrap.ts`. No runtime scan, no service locator.
//
//   T2 - `getService("xService")` locators embedded INSIDE entities. This is
//        precisely a domain file reaching outward. Verified by grep over the
//        legacy tree: 204 such call sites across `model/entity/*.cfc`, 18 of
//        them in `model/entity/Sku.cfc` alone - including
//        [model/entity/Sku.cfc:L258] reaching `promotionService`,
//        [model/entity/Sku.cfc:L371,L418,L422,L425] reaching `currencyService`
//        from inside the currency cascade, [model/entity/Sku.cfc:L262,L266,
//        L437] reaching `priceGroupService`, [model/entity/Sku.cfc:L569,L594]
//        reaching `skuService`, and [model/entity/Product.cfc:L367,L519]
//        reaching `productService` and `promotionService`. Every one of those
//        becomes a constructor-injected port declared in
//        `src/domain/ports/`. The lint rule is what makes the CFML equivalent
//        impossible in TypeScript.
//
// TOOLCHAIN (exact pins; see package.json - no caret ranges anywhere)
//   eslint 10.8.0, typescript-eslint 8.65.0, typescript 5.9.3, prettier 3.9.6
//   Node 20.20.2 (`.nvmrc`). eslint 10 declares an engine requirement on the
//   20.19+ line, which is the specific reason the runtime baseline is 20.20.2
//   rather than an earlier 20.x release.
//
// NO THIRD-PARTY ESLINT PLUGINS. The dependency set is fixed at fourteen
// packages, all exactly pinned. Every guarantee below is therefore expressed
// with ESLint core rules plus the `typescript-eslint` rule sets only - no
// import-resolution plugin, no Prettier bridge preset, no opinionated rule
// pack. Where a guarantee would normally need a plugin (layer boundaries, the
// no-barrel policy) it is expressed with core `no-restricted-imports`
// patterns instead.
//
// Two consequences of that constraint are worth stating, because they explain
// choices that would otherwise look odd:
//   * `@eslint/js` is not a dependency of eslint 10 and is not installed, so
//     the `eslint:recommended` preset is unavailable. The core rules this
//     config wants are therefore enumerated explicitly below.
//   * the `globals` package is not installed either, so the Node global set is
//     declared inline. Only Node globals are declared - never browser or DOM
//     globals: this is a headless backend service and the presentation
//     subsystems (admin/, frontend/, public/, assets/) are out of scope.
//
// CONSUMERS
//   npm run lint         -> `eslint .`            (cwd is this subtree)
//   npm run verify       -> typecheck + lint + format:check + test
//
// ISOLATION INVARIANT
// This is the ONLY ESLint configuration in the repository, and it lives inside
// `slatwall-ts/`. Flat-config `files`/`ignores` resolve relative to this
// file's directory, and `npm run lint` runs with this subtree as its working
// directory, so ESLint never walks the untouched CFML tree (admin/, assets/,
// config/, custom/, frontend/, integrationServices/, meta/, model/, org/,
// public/, tags/, templates/). There is deliberately no root configuration and
// no separate ignore file; ignores are expressed inside this flat config.
// Never run the auto-fixer from the repository root.
//
// FORMATTING IS NOT OWNED HERE. Prettier 3.9.6 owns it, via
// `prettier --check .` against `.prettierrc.json`. This config enables ZERO
// layout rules. If a conflict ever appears, delete the ESLint rule - never
// loosen Prettier.
//
// NOTE ON PROJECT RULES: no user-specified rules were provided for this
// project (the rules source returns "No user rules provided."). Their absence
// is not licence to lower the bar and no rule has been invented to fill the
// gap; the enterprise-standard practices this file implements are listed in
// the block comment above each config object.
// ---------------------------------------------------------------------------

import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// Layer-boundary vocabulary
// ---------------------------------------------------------------------------

/**
 * The three outward layers `src/domain/**` may never reach.
 *
 *   src/repositories/**  - implements the ports over mysql2 prepared statements
 *   src/handlers/**      - primary adapters: the composition root, the router,
 *                          the error mapper and the capability handlers
 *   src/integrations/**  - the integration contract and the Google adapter
 *
 * Everything the domain legitimately depends on is inward or lateral and is
 * therefore absent from this list: `src/domain/ports/**` (the interfaces the
 * outward layers implement), `src/domain/valueObjects/**`,
 * `src/domain/views/**`, `src/domain/promotionEngine/**` and
 * `src/lib/**` (config, logger and the `src/lib/cfml/**` semantic-parity
 * helpers that back the Money value object).
 *
 * This list is exactly the boundary the project's validation gate names. It is
 * deliberately not widened to `src/services/**`: widening it is a product
 * decision, not a lint tweak.
 */
const OUTWARD_LAYERS = ['repositories', 'handlers', 'integrations'];

/**
 * Build the specifier patterns that catch one outward layer.
 *
 * ESLint 10 matches `no-restricted-imports` pattern groups with the `ignore`
 * package using gitignore semantics, constructed as
 * `ignore({ allowRelativePaths: true, ignorecase: true }).add(group)`. Two
 * properties of that matcher drive the shape below and were verified against
 * the matcher directly rather than assumed:
 *
 *   * A pattern containing a slash before its last segment is ANCHORED. So
 *     `../repositories/*` matches `../repositories/x.js` but NOT
 *     `../../repositories/mysql/connection.js`, and `*` never crosses a `/`.
 *   * `**` does cross `/` and is unanchored, so `**\/<layer>/**` catches every
 *     relative-traversal depth (`../`, `../../`, `../../../src/...`), the
 *     rooted form (`src/<layer>/...`) and, because matching is
 *     case-insensitive by default, casing variants too.
 *
 * The bare `**\/<layer>` entry catches a directory-only specifier such as
 * `'../../repositories'`. The two explicit relative forms are redundant
 * against the `**` patterns but are kept because they document the exact
 * shapes a domain module would most plausibly be tempted to write.
 */
const outwardLayerPatterns = (layer) => [
  `**/${layer}`,
  `**/${layer}/**`,
  `../${layer}/*`,
  `../../${layer}/*`,
];

const OUTWARD_LAYER_PATTERNS = OUTWARD_LAYERS.flatMap(outwardLayerPatterns);

/**
 * Packages the domain must not know about either. A layer boundary that only
 * policed first-party paths would still let an entity import the MySQL driver
 * directly, which is the same violation by another route.
 *
 *   mysql2            - the database driver; belongs to src/repositories/**
 *   dotenv            - environment loading; belongs to src/lib/config.ts and
 *                       the test tier. Lambda injects env vars natively.
 *   aws-lambda        - the runtime's event and handler types; these belong to
 *   @types/aws-lambda   src/handlers/**. The bare `aws-lambda` entry already
 *                       matches the scoped types package, but both are listed
 *                       so the intent survives a future refactor.
 *   @aws-sdk/**       - no AWS SDK client belongs in the domain.
 *
 * `decimal.js` and `zod` are deliberately NOT restricted: `decimal.js` backs
 * the Money value object, which is the sole arithmetic surface in the target,
 * and `zod` backs the ported declarative validation schemas. Node builtins are
 * not restricted either - the parity helpers may legitimately use them.
 */
const OUTWARD_PACKAGE_PATTERNS = [
  'mysql2',
  'dotenv',
  'aws-lambda',
  '@types/aws-lambda',
  '@aws-sdk/**',
];

/**
 * Barrel / index re-export specifiers, forbidden subtree-wide.
 *
 * The project standard is one exported unit per file and no barrel files, so
 * that each regenerated file's diff stays minimal and reviewable during the
 * refine loop. Making the import side mechanical is what stops a barrel from
 * appearing by accident: if nothing may import `.../index.*`, nothing has a
 * reason to create it.
 */
const BARREL_PATTERNS = [
  '**/index.ts',
  '**/index.js',
  '**/index.mts',
  '**/index.mjs',
  '**/index.cts',
  '**/index.cjs',
];

const DOMAIN_LAYER_MESSAGE =
  'Domain layer must not import outward. src/domain/** may not import from ' +
  'src/repositories/**, src/handlers/** or src/integrations/**. Dependency flow is strictly ' +
  'domain-inward and this is a build failure, not a convention. Declare an interface in ' +
  'src/domain/ports/ and let the outward layer implement it; the composition root in ' +
  'src/handlers/bootstrap.ts wires the concrete instance. This replaces the legacy ' +
  'getService("xService") locator calls embedded inside entities (204 such call sites across ' +
  'model/entity/*.cfc, e.g. model/entity/Sku.cfc:L258 and model/entity/Product.cfc:L519).';

const DOMAIN_PACKAGE_MESSAGE =
  'Domain layer must not depend on the driver, the runtime or environment loading. Keep mysql2 ' +
  'in src/repositories/**, the aws-lambda types in src/handlers/**, and dotenv in ' +
  'src/lib/config.ts and the test tier. decimal.js and zod are permitted here: decimal.js backs ' +
  'the Money value object and zod backs the ported validation schemas.';

const BARREL_MESSAGE =
  'No barrel files. Import the exact module that declares the symbol. This project keeps one ' +
  'exported unit per file and no index re-exports so that each regenerated file stays a small, ' +
  'reviewable diff.';

/**
 * Compose `no-restricted-imports` from pattern groups.
 *
 * Rule options do NOT merge across flat-config blocks - the last matching
 * block wins outright. Every block that sets this rule must therefore restate
 * every group it wants, and composing them through this one helper is what
 * guarantees the domain block can never silently drop the barrel policy.
 *
 * Severity is `'error'`. Never `'warn'`: a warning is a convention, and the
 * whole point of this file is that the boundary is not a convention.
 */
const restrictedImports = (...groups) => ['error', { patterns: groups }];

const BARREL_GROUP = { group: BARREL_PATTERNS, message: BARREL_MESSAGE };
const DOMAIN_LAYER_GROUP = { group: OUTWARD_LAYER_PATTERNS, message: DOMAIN_LAYER_MESSAGE };
const DOMAIN_PACKAGE_GROUP = { group: OUTWARD_PACKAGE_PATTERNS, message: DOMAIN_PACKAGE_MESSAGE };

// ---------------------------------------------------------------------------
// Node 20 global set
//
// Declared inline because the `globals` package is not part of the fixed
// dependency set and adding it would breach the exact-pinning standard.
//
// ONLY Node globals. No browser or DOM global is declared: the target is a
// headless backend service, `tsconfig.json` sets `lib: ["ES2022"]` with no
// "DOM" entry, and the presentation subsystems are out of scope.
//
// CommonJS pseudo-globals (`require`, `module`, `exports`, `__dirname`,
// `__filename`) are deliberately absent: package.json declares
// `"type": "module"` and tsconfig uses NodeNext, so source is ESM and those
// identifiers genuinely do not exist at runtime. The Lambda ARTIFACT is
// CommonJS, but that is an esbuild output format, not a source dialect.
// ---------------------------------------------------------------------------

const NODE_ESM_GLOBALS = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  atob: 'readonly',
  Blob: 'readonly',
  btoa: 'readonly',
  BroadcastChannel: 'readonly',
  Buffer: 'readonly',
  ByteLengthQueuingStrategy: 'readonly',
  clearImmediate: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  CompressionStream: 'readonly',
  console: 'readonly',
  CountQueuingStrategy: 'readonly',
  crypto: 'readonly',
  Crypto: 'readonly',
  CryptoKey: 'readonly',
  CustomEvent: 'readonly',
  DecompressionStream: 'readonly',
  DOMException: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
  fetch: 'readonly',
  File: 'readonly',
  FormData: 'readonly',
  global: 'readonly',
  globalThis: 'readonly',
  Headers: 'readonly',
  MessageChannel: 'readonly',
  MessageEvent: 'readonly',
  MessagePort: 'readonly',
  performance: 'readonly',
  process: 'readonly',
  queueMicrotask: 'readonly',
  ReadableStream: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  structuredClone: 'readonly',
  SubtleCrypto: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  TransformStream: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  WebAssembly: 'readonly',
  WritableStream: 'readonly',
};

// ---------------------------------------------------------------------------
// Curated ESLint core rules
//
// `eslint:recommended` ships in `@eslint/js`, which is not a dependency of
// eslint 10 and is not installed, so the core rules this project wants are
// enumerated here. Every entry is a correctness or safety rule that survives
// two filters:
//
//   1. It does not duplicate something the strict `tsc` profile already
//      rejects, and it does not contradict a compiler option
//      `tsconfig.json` deliberately leaves off.
//   2. It cannot fire on a legacy defect that this port reproduces on purpose.
//      Behaviour preservation extends to defects: a method that throws today
//      throws in the target, and a discount limit enforced against the wrong
//      key stays enforced against the wrong key. A lint rule that forces such
//      a site to be rewritten would change money.
//
// The rules that failed filter 2 are named, with the site that disqualifies
// them, in the "RULES DELIBERATELY NOT ENABLED" register further down.
// ---------------------------------------------------------------------------

const CORE_CORRECTNESS_RULES = {
  // CFML `eq` comparisons are case-insensitive and loosely typed; TypeScript is
  // neither. Every ported comparison and every struct-keyed lookup must be
  // audited rather than assumed, and strict equality is what makes that audit
  // visible at each site instead of invisible.
  eqeqeq: ['error', 'always'],

  // --- Real defects the compiler does not catch ---------------------------
  'no-cond-assign': ['error', 'always'],
  'no-compare-neg-zero': 'error',
  'no-constant-binary-expression': 'error',
  'no-constant-condition': 'error',
  'no-debugger': 'error',
  'no-empty-character-class': 'error',
  'no-ex-assign': 'error',
  'no-invalid-regexp': 'error',
  'no-irregular-whitespace': 'error',
  'no-misleading-character-class': 'error',
  'no-prototype-builtins': 'error',
  'no-regex-spaces': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-sparse-arrays': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-unused-private-class-members': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',

  // --- Constructs with no legitimate use anywhere in this port ------------
  'no-async-promise-executor': 'error',
  'no-caller': 'error',
  'no-eval': 'error',
  'no-extend-native': 'error',
  'no-iterator': 'error',
  'no-new-func': 'error',
  'no-object-constructor': 'error',
  'no-octal-escape': 'error',
  'no-promise-executor-return': 'error',
  'no-proto': 'error',
  'no-return-assign': ['error', 'always'],
  'no-script-url': 'error',
  'no-sequences': 'error',
  // The rounding algorithm is decimal-STRING manipulation, so string-to-number
  // conversion is on a hot path there. An implicit radix is a real hazard.
  radix: 'error',
  'symbol-description': 'error',
};

// ---------------------------------------------------------------------------
// Escape-hatch policy
//
// The type gate is absolute: `tsc --noEmit` under the maximal strict profile
// must report zero errors, with no `any`, no `@ts-ignore`, and no
// `@ts-expect-error` outside a test that deliberately asserts a type failure.
// ---------------------------------------------------------------------------

/** Production posture: suppression comments are documented or forbidden. */
const BAN_TS_COMMENT_PRODUCTION = [
  'error',
  {
    'ts-check': false,
    'ts-expect-error': 'allow-with-description',
    'ts-ignore': true,
    'ts-nocheck': true,
    minimumDescriptionLength: 10,
  },
];

/**
 * Test posture: `@ts-expect-error` is permitted outright, because a suite whose
 * job is to assert that an invalid call does not type-check needs it. Whole-file
 * suppression (`@ts-nocheck`) and undocumented suppression (`@ts-ignore`) stay
 * forbidden even here - those hide errors rather than assert them.
 */
const BAN_TS_COMMENT_TESTS = [
  'error',
  {
    'ts-check': false,
    'ts-expect-error': false,
    'ts-ignore': true,
    'ts-nocheck': true,
  },
];

/**
 * Unused-variable posture.
 *
 * `args: 'none'` is load-bearing, not laziness. Interface parity is this
 * project's acceptance contract: public method signatures are carried over from
 * CFML verbatim, parameter names included, so that a reviewer can diff the two
 * surfaces method by method. That guarantees genuinely unused parameters -
 * `Sku.getPriceByPromotion(promotion)` is ported as a throwing stub because the
 * legacy body calls a method that does not exist [model/entity/Sku.cfc:L258],
 * and the stub ports standing in for out-of-scope branches accept arguments
 * they never read. Renaming those parameters to `_promotion` to satisfy a lint
 * rule would break the parity contract, so parameters are exempt outright.
 *
 * `tsconfig.json` omits `noUnusedParameters` for exactly this reason; this
 * setting keeps ESLint aligned with that decision instead of re-imposing it.
 * Unused *locals* remain errors here and under `noUnusedLocals` in tsc, which
 * is what catches the legacy defect class where a value is computed and then
 * discarded [model/entity/Sku.cfc:L512-L522].
 */
const NO_UNUSED_VARS_TS = [
  'error',
  {
    args: 'none',
    caughtErrors: 'all',
    caughtErrorsIgnorePattern: '^_',
    destructuredArrayIgnorePattern: '^_',
    ignoreRestSiblings: true,
    vars: 'all',
    varsIgnorePattern: '^_',
  },
];

// ---------------------------------------------------------------------------
// RULES DELIBERATELY NOT ENABLED
//
// This register is as load-bearing as the boundary rule itself. Each entry is
// something a reviewer might expect to find here, absent for a specific and
// binding reason. Enabling any of them converts a deliberate, documented
// porting decision into a lint error.
//
//  1. IDENTIFIER-SHAPE RULES - the typescript-eslint identifier naming rule,
//     the core camel-case rule and the core identifier-pattern rules.
//     Interface parity is the acceptance contract, so public method names are
//     the legacy CFML names verbatim. Several preserved identifiers read as
//     typos and MUST lint clean:
//       orderItemQulifiedDiscounts      [model/service/PromotionService.cfc:L82-L133]
//       promotionPeriod.promtionRewards [model/entity/PromotionReward.cfc:L49]
//       singlularname on productReviews [model/entity/Product.cfc:L76]
//       subsciptionUsageBenefit         [model/entity/PriceGroup.cfc:L168]
//       getSalePricExpirationDateTime() [model/entity/Product.cfc:L614-L622]
//     The `hb_*`-prefixed metadata strings and the `rbKey` / `hb_rbKey` /
//     `hb_nullRBKey` resource-bundle identifiers are likewise preserved
//     verbatim as string constants so the legacy admin can still resolve them.
//
//  2. THE CORE RULE THAT FLAGS TODO AND FIXME COMMENTS. Carrying source TODOs
//     forward is binding: known legacy TODOs are ported as explicitly flagged
//     TODOs and are never silently completed. The return/exchange branch at
//     [model/service/PromotionService.cfc:L542-L544] is ported verbatim, still
//     does nothing, and keeps its `issue #1766` reference; the empty
//     `g:google_product_category` element in the feed stays empty and stays
//     flagged. The uniform preserved-defect marker must also lint clean:
//         // LEGACY-DEFECT [<path>:<locator>]: <description>.
//         // Preserved deliberately; do not fix without a product decision.
//
//  3. `no-empty` AND `no-empty-function` AT ERROR SEVERITY. Preserved no-ops
//     are legitimate: the issue #1766 branch does nothing by design, and
//     `getSettingOptions` in the Google adapter has an empty conditional body
//     that is precisely why it returns null while declaring an array return
//     type [integrationServices/google/Integration.cfc:L73-L77].
//
//  4. SIZE AND SHAPE LIMITS - no `max-` family rule and no branch-count rule.
//     The ported promotion engine reproduces the behaviour of a 489-line legacy
//     function [model/service/PromotionService.cfc:L58-L546] across nine
//     modules, and it deliberately contains loop constructs whose ordering is
//     load-bearing: two insertion sorts running in opposite directions (one
//     descending by discount amount, one ascending by discount-per-use) and a
//     two-pass ordered iteration that must reproduce the legacy behaviour on an
//     empty reward collection. An arbitrary size limit would force
//     restructuring that changes money.
//
//  5. `no-restricted-syntax`. Two reasons. First, a syntax ban on `throw`
//     inside an apparently unreachable stub would reject
//     `Sku.getPriceByPromotion()`, which is ported as a throwing stub because
//     the legacy body calls `calculateSkuPriceBasedOnPromotion` and that method
//     does not exist [model/entity/Sku.cfc:L258] - reproduced as a throwing
//     stub with its TODO, not invented. Second, a syntax guard against raw
//     float arithmetic on monetary values would also reject the legitimate
//     integer arithmetic in the SKU cartesian-product odometer
//     [model/service/SkuService.cfc:L109-L121] and the string-length arithmetic
//     the rounding algorithm depends on
//     [model/service/RoundingRuleService.cfc:L88-L175]. The single-arithmetic-
//     surface standard is enforced by the Money value object and decimal.js
//     themselves, plus review - not by pattern-matching syntax.
//
//  6. EVERY FORMATTING RULE, and every `stylistic` preset from
//     typescript-eslint. Prettier 3.9.6 owns formatting through
//     `prettier --check .`. That covers indentation, quote style, statement
//     terminators and trailing separators. If a conflict ever surfaces, remove
//     the ESLint rule; never loosen Prettier.
//
//  7. ANY BLANKET BAN ON DEFAULT EXPORTS. The import standard is named imports
//     only, with no default export except where a third-party module mandates
//     one - and `eslint.config.mjs`, `esbuild.config.mjs` and
//     `vitest.config.ts` all mandate one. A blanket ban would reject this very
//     file. The standard is upheld by review, not by a rule that would have to
//     carve out its own configuration.
//
//  8. ANY RULE THAT REQUIRES OR REWARDS BARREL FILES. The opposite is
//     configured: `BARREL_PATTERNS` forbids importing `.../index.*` anywhere in
//     the subtree, which makes "one exported unit per file, no barrels"
//     mechanical from the import side.
//
//  9. `no-fallthrough`. `tsconfig.json` deliberately omits
//     `noFallthroughCasesInSwitch` because legacy defects are reproduced rather
//     than repaired; enabling the lint equivalent would re-impose exactly the
//     check that was deliberately declined. `no-unreachable` stays off for the
//     same reason - the missing `return` at [model/entity/Product.cfc:L598]
//     lets execution fall through to `return 0`, and that is the preserved
//     behaviour.
//
// 10. `no-await-in-loop`. The ported bulk paths await per item by design:
//     `processProduct_updateSkus` iterates and saves per SKU
//     [model/service/ProductService.cfc:L216-L233], and `createSkus` runs an
//     odometer over the full cartesian product of option groups
//     [model/service/SkuService.cfc:L109-L121]. Sequencing is intentional
//     there, not an oversight.
//
// 11. `no-unmodified-loop-condition` and `no-dupe-else-if`. Each would fire on
//     a preserved defect: `deletePriceGroup` loops over a collection snapshot
//     that is never re-read [model/service/PriceGroupService.cfc:L461-L470],
//     and the shipping-address-zones clause re-tests `hasShippingMethod`
//     instead of testing the zone condition
//     [model/service/PromotionService.cfc:L703]. Both are reproduced with a
//     `LEGACY-DEFECT` annotation rather than repaired.
//
// 12. `@typescript-eslint/no-unnecessary-condition`, and therefore the
//     `strictTypeChecked` preset that enables it. The port keeps defensive
//     checks that the type system can prove redundant because the legacy
//     checks are observable behaviour - `getListPriceByCurrencyCode` performs a
//     SECOND key-existence test and returns null even for a currency present in
//     the map [model/entity/Sku.cfc:L275-L285]. Deleting that test would change
//     what the method returns. The base is `recommendedTypeChecked`, with the
//     strict rules that carry no preservation risk added individually.
//
// 13. `no-console`. `src/lib/logger.ts` writes structured JSON to stdout, which
//     Lambda captures natively - that is the logging design, chosen so no
//     logging dependency is needed - and `esbuild.config.mjs` reports build
//     results the same way.
// ---------------------------------------------------------------------------

export default tseslint.config(
  // -------------------------------------------------------------------------
  // Never linted. Dependencies, the esbuild bundle output, the tsc declaration
  // output, coverage reports, tooling caches, and generated declaration files.
  // Mirrors `tsconfig.json`'s `exclude` and this subtree's `.gitignore`.
  // -------------------------------------------------------------------------
  globalIgnores([
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.vitest/**',
    '**/*.d.ts',
  ]),

  // -------------------------------------------------------------------------
  // Universal linter options. A stale or unnecessary suppression comment is
  // itself an escape hatch, so both forms are errors rather than warnings.
  // -------------------------------------------------------------------------
  {
    name: 'slatwall-ts/linter-options',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },

  // -------------------------------------------------------------------------
  // TypeScript, type-aware.
  //
  // `projectService: true` hands parsing to the TypeScript project service,
  // which resolves each file against the nearest `tsconfig.json`. That is this
  // subtree's base config, whose `include` spans `src/**/*.ts`,
  // `tests/**/*.ts` and `vitest.config.ts` - so type-aware linting covers the
  // whole subtree, application code and test tier alike.
  //
  // Type information is not optional here. The rules that depend on it are the
  // ones that matter most to this port: the `no-unsafe-*` family keeps
  // untyped data from leaking out of the driver boundary, and
  // `no-floating-promises` / `await-thenable` / `require-await` police the
  // async boundary, which is a documented contract - a method becomes async if
  // and only if its legacy body reached the DAO or the ORM, while methods that
  // only traverse already-materialised associations or perform pure arithmetic
  // stay synchronous. Without type information those rules simply do not run.
  //
  // One consequence is deliberate and must not be "fixed" by loosening this
  // block: a `.ts` file that the base `tsconfig.json` does not include fails to
  // parse here, with "was not found by the project service". That is the
  // intended outcome, because a source file the typecheck gate never sees is a
  // hole in the type gate. The remedy is to add the file to `include` in
  // `tsconfig.json` so `tsc --noEmit` covers it too - never to add an
  // `allowDefaultProject` escape hatch, and never to drop `projectService`.
  // -------------------------------------------------------------------------
  {
    name: 'slatwall-ts/typescript',
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: NODE_ESM_GLOBALS,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...CORE_CORRECTNESS_RULES,

      // --- Escape-hatch policy -------------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': BAN_TS_COMMENT_PRODUCTION,
      '@typescript-eslint/no-unused-vars': NO_UNUSED_VARS_TS,

      // --- Import discipline ---------------------------------------------
      // Type-only imports must be marked so nothing type-only survives into
      // the Lambda bundle. `separate-type-imports` keeps the type import on
      // its own statement, and `no-import-type-side-effects` rejects the
      // inline `{ type X }` form, which still emits a runtime import.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',

      // No barrel imports anywhere. The domain block below restates this
      // group alongside the layer boundary, because rule options do not merge
      // across flat-config blocks.
      'no-restricted-imports': restrictedImports(BARREL_GROUP),
    },
  },

  // -------------------------------------------------------------------------
  // Application source: no non-null assertions.
  //
  // `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess` and
  // `exactOptionalPropertyTypes`, and those are load-bearing rather than
  // decorative. Null semantics decide money: `getPriceByCurrencyCode` has no
  // `else` and no fallback, so an unknown currency yields nothing
  // [model/entity/Sku.cfc:L269-L273], and substituting 0 for that would
  // silently sell products for free. A `!` assertion is the one construct that
  // silences precisely those compiler checks, so it is banned in `src/**`.
  // Handle the absent case explicitly instead.
  // -------------------------------------------------------------------------
  {
    name: 'slatwall-ts/no-escape-hatches',
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // -------------------------------------------------------------------------
  // THE DOMAIN LAYER BOUNDARY. This is the reason this file exists.
  //
  // `src/domain/**` holds the entity classes, the Money / CurrencyCode /
  // MaterializedIdPath value objects, the read-only order views that form the
  // anti-corruption boundary, the promotion-engine type contracts, and the
  // port interfaces. It imports NOTHING outward.
  //
  // Severity is `error`, never `warn`: domain-inward dependency flow is a
  // build failure, not a code-review convention. Do not relax this block, do
  // not narrow its patterns, and do not add a path alias to `tsconfig.json`
  // that would let a specifier slip past it - that is exactly why the base
  // config declares no `paths` or `baseUrl`.
  //
  // Both groups are restated here, together with the barrel group, because
  // ESLint resolves a rule from the LAST matching config block only; options
  // from earlier blocks are replaced rather than merged.
  // -------------------------------------------------------------------------
  {
    name: 'slatwall-ts/domain-layer-boundary',
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        DOMAIN_LAYER_GROUP,
        DOMAIN_PACKAGE_GROUP,
        BARREL_GROUP,
      ),
    },
  },

  // -------------------------------------------------------------------------
  // Test tier. The only relaxations in this config, both narrow and both
  // justified:
  //
  //   * `@ts-expect-error` is permitted, which is the carve-out the type gate
  //     itself names: a suite may deliberately assert that an invalid call
  //     fails to type-check. `@ts-ignore` and `@ts-nocheck` stay forbidden.
  //   * non-null assertions are permitted, because fixture builders assert
  //     against literal data they construct in the same file.
  //
  // Nothing else is relaxed. The characterisation suites that pin legacy
  // behaviour - the verified `roundValue` cases, the promotion decomposition,
  // the five-level price-group cascade, the four-step currency cascade - are
  // held to the same strictness as the code they guard.
  // -------------------------------------------------------------------------
  {
    name: 'slatwall-ts/tests',
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': BAN_TS_COMMENT_TESTS,
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // -------------------------------------------------------------------------
  // Build tooling (`eslint.config.mjs`, `esbuild.config.mjs`).
  //
  // These are plain Node ESM scripts, not compiled input - `tsconfig.json`
  // leaves `allowJs` off and does not include them - so they are deliberately
  // NOT matched by the type-aware block above, and no type-aware rule is
  // registered for them. They still get the curated core rules and the
  // no-barrel policy.
  // -------------------------------------------------------------------------
  {
    name: 'slatwall-ts/tooling',
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: NODE_ESM_GLOBALS,
    },
    rules: {
      ...CORE_CORRECTNESS_RULES,
      'no-restricted-imports': restrictedImports(BARREL_GROUP),
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
);
