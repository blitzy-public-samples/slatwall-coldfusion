// @ts-check
/* ==================================================================================================
 * ESLint flat configuration for the extracted Slatwall Catalog slice.
 *
 * The compiler is the primary safety net — tsconfig.json pins `strict`,
 * `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — and this configuration reinforces it
 * with type-aware lint rules rather than duplicating it. The relationship is one-directional and must
 * stay that way: when lint or the compiler rejects a source file, THE SOURCE FILE IS FIXED. Neither
 * tsconfig.json nor this file is ever weakened to let code through.
 *
 * SCOPE — NOTHING OUTSIDE THIS SUBTREE IS EVER LINTED
 * Every glob below is subtree-relative, with no `../` segment, no absolute path and no `basePath`
 * override, and the lint script is a bare `eslint .` executed from this directory. The CFML tree is
 * reference-only, so it is never linted and never auto-fixed.
 *
 * WHY THE FILE EXTENSION IS `.mjs`
 * package.json declares `"type": "commonjs"`, which is load-bearing: tsconfig.json sets NodeNext
 * module resolution so the nearest package `type` decides each file's format, the bundler emits
 * CommonJS because that is what the Node 20 Lambda runtime loads, and ts-jest runs CommonJS. An
 * `eslint.config.js` in this package would therefore be parsed as CommonJS and its `import`
 * statements would fail. The `.mjs` extension makes this file unambiguously ESM regardless of the
 * package `type` field. Do not rename it.
 *
 * WHY ONE IMPORT, AND WHY THAT IMPORT
 * `typescript-eslint` is the single unified package rather than the older split pair of parser and
 * plugin. It supplies the parser, the plugin, the shareable presets and the `config()` helper
 * together, so one import wires all four and the versions cannot drift apart.
 *
 * Nothing else is imported, because the dependency set is exact-pinned and closed and this
 * configuration must not require a package outside package.json. Two packages a conventional flat
 * config would reach for are outside that set and are therefore not used: @eslint/js, whose
 * `configs.recommended` layer is replaced below by `tseslint.configs.recommended`; and `globals`,
 * which would be inert here anyway because `no-undef` is switched off for TypeScript by
 * typescript-eslint's eslint-recommended layer and is never switched on for JavaScript.
 *
 * WHY NO STYLISTIC RULES AND NO PRETTIER PLUGIN
 * .prettierrc.json is the formatting baseline and `prettier --check .` is a separate command, so
 * formatting is owned entirely by Prettier. This file declares no layout rule at all and does not
 * extend typescript-eslint's stylistic presets. Because no stylistic rule is enabled there is
 * nothing for a formatter-compatibility layer to turn off, so eslint-config-prettier and
 * eslint-plugin-prettier are unnecessary. The two tools have disjoint responsibilities.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * No auto-fix gate, no coverage or quality threshold, no `--max-warnings` policy and no severity
 * escalation invented for its own sake. ESLint's own default handling of unused disable directives —
 * reported, not fatal — is left alone for the same reason: it keeps stale suppressions visible
 * without inventing a gate.
 * ================================================================================================ */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /* ------------------------------------------------------------------------------------------------
   * [1] Ignores.
   *
   * These mirror the lintable paths of slatwall-ts/.gitignore (`node_modules/`, `dist/`, `coverage/`),
   * so the three tools agree on what is generated output. Prettier needs no ignore file of its own:
   * version 3 honours .gitignore directly, which is why that one file is the single declaration of
   * generated output for all three tools and why no .prettierignore exists here — the plan's file
   * inventory names .prettierrc.json and .gitignore and nothing else. The remaining .gitignore
   * entries — *.tsbuildinfo, .env files, npm/yarn logs, .eslintcache — contain no JavaScript or
   * TypeScript and need no ignore entry here.
   *
   * `node_modules/**` is redundant with ESLint's built-in default and is listed anyway, because an
   * explicit list is auditable against .gitignore line by line whereas an implicit default is not.
   * ---------------------------------------------------------------------------------------------- */
  {
    name: 'slatwall-ts/ignores',
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },

  /* ------------------------------------------------------------------------------------------------
   * [2] TypeScript sources — type-aware linting.
   *
   * The `files` entry below is not decorative. typescript-eslint's `base` preset declares no `files`
   * key, and ESLint's flat config only discovers the extensions that some config object names, so
   * without an entry naming the .ts extension a bare `eslint .` would silently lint nothing but the
   * tooling files and still exit 0 — a green result that proves nothing. (Globs are written only in
   * the code below, never inside these block comments, because the star-slash sequence a recursive
   * glob begins with would close the comment.)
   *
   * `projectService: true` resolves each file through the TypeScript project service against
   * tsconfig.json, so every linted .ts file is inside the program and the type-aware rules that make
   * this pass worth running — no-floating-promises, no-misused-promises, await-thenable, the
   * no-unsafe-* family — have the type information they need to fire at all. `tsconfigRootDir` is
   * anchored to this file's own directory, so resolution is identical no matter which directory
   * ESLint is invoked from. If a file ever reports "not found by the project service", the fix is to
   * correct the file selection here; it is never to loosen tsconfig.json.
   *
   * PRESET CHOICE — `recommendedTypeChecked`, and specifically NOT `strictTypeChecked`.
   * This looks like a free upgrade and is not, because `strictTypeChecked` adds two rules that
   * contradict the requirement to carry legacy defects across as flagged annotations rather than
   * repair them:
   *
   *   @typescript-eslint/no-deprecated would error on the three deliberately deprecated members of
   *   defect D16 (model/entity/Sku.cfc:L893-L910), which are ported with their deprecation hints
   *   intact and still reachable.
   *
   *   @typescript-eslint/no-unnecessary-condition would demand deleting carried defensive guards
   *   whose redundancy is itself the observed legacy behaviour — the zero-option branch of defect D19
   *   and the zero-index read of defect D13 (model/service/SkuService.cfc:L223-L269) being the
   *   clearest cases.
   *
   * A preset that forces a choice between passing lint and preserving behaviour is the wrong preset.
   * `recommendedTypeChecked` includes neither rule, so strictness and parity coexist.
   * ---------------------------------------------------------------------------------------------- */
  {
    name: 'slatwall-ts/typescript',
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* `no-explicit-any` is already an error inside `recommended`; it is restated here because it
       * is the one rule this port cannot afford to lose, and an explicit line is harder to weaken by
       * accident than an inherited default.
       *
       * The legacy source is saturated with `any`: every CFML service signature in the slice is
       * written as `required any product` / `required struct data`, and
       * org/Hibachi/HibachiService.cfc:L255-L281 fabricates the entire implicit CRUD surface at
       * runtime by prefix dispatch through onMissingMethod. Those synthesised members are declared
       * and typed explicitly here instead, and tolerating blanket `any` would let that be satisfied
       * on paper by a transliteration of the CFML idiom.
       *
       * Where a legacy signature is genuinely loose the target type is `unknown` or
       * `Record<string, unknown>`. Both satisfy this rule; `any` does not, and that is the point.
       *
       * The no-unsafe-* family inherited from `recommendedTypeChecked` is likewise left at full
       * strength and must not be relaxed here. When a genuine escape is required, the sanctioned
       * mechanism is a narrowly scoped `eslint-disable-next-line` carrying a justification, authored
       * in the file that needs it — never a global relaxation in this one. */
      '@typescript-eslint/no-explicit-any': 'error',

      /* Severity stays at `error`; only the escape hatch is named. The `^_` prefix convention is
       * required by the shape of the port rather than by taste: several retained members reach
       * collaborators that are out of scope and are implemented as boundary stubs behind a port, so
       * they must keep the legacy parameter name, arity and order while legitimately not consuming
       * every parameter. Underscore-prefixing states "intentionally unused" in the signature itself,
       * which is more honest than an inline suppression and cannot hide a genuine mistake: any unused
       * binding that is not underscore-prefixed is still an error. */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  /* ------------------------------------------------------------------------------------------------
   * [3] Test sources — one rule relaxed, and only one.
   *
   * `@typescript-eslint/unbound-method` conflicts with an unavoidable Jest idiom: passing a method
   * reference to an assertion deliberately unbinds `this`, which is the rule's entire subject.
   * typescript-eslint's documented remedy is eslint-plugin-jest's drop-in `jest/unbound-method`;
   * that plugin is outside this project's closed dependency set, so the rule is switched off for the
   * test glob alone. Production sources keep it at full strength.
   *
   * Nothing else is relaxed. In particular the no-unsafe-* family stays on for tests, because the
   * target suites are unit tests constructed directly against typed test doubles rather than
   * integration tests that boot an application and resolve services dynamically. A double that
   * satisfies a typed port needs no `any`, so a blanket relaxation here would buy nothing and would
   * quietly readmit the untyped idiom this port exists to retire.
   * ---------------------------------------------------------------------------------------------- */
  {
    name: 'slatwall-ts/typescript-tests',
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  /* ------------------------------------------------------------------------------------------------
   * [4] JavaScript tooling files — parsed and linted, but never type-checked.
   *
   * The tooling files in this subtree are deliberately outside every TypeScript program, since
   * tsconfig.json's `include` lists only .ts sources. Type-aware rules therefore cannot resolve them,
   * and `disableTypeChecked` switches that whole family off along with the parser's project
   * resolution. Applying type-aware rules to a file the project service cannot see would fail
   * resolution rather than find bugs.
   *
   * `tseslint.configs.recommended` is layered underneath so these files receive real coverage. Without
   * it the only object matching them would be `disableTypeChecked`, whose every entry is `off`,
   * leaving the packaging script effectively unlinted. The preset restores the non-type-aware checks
   * — prefer-const, no-var, no-unused-vars, no-unused-expressions, ban-ts-comment and the rest —
   * which are unaffected by the layer above. It also stands in for @eslint/js's `configs.recommended`,
   * which this install does not resolve, so the dependency set stays closed and the rule list stays a
   * published preset rather than an inventory invented here.
   *
   * Order matters: `disableTypeChecked` comes second so it wins for the rules the two overlap on.
   *
   * The glob covers .cjs and .js as well as .mjs so no JavaScript file added to this subtree can be
   * silently unlinted. `sourceType: 'module'`, inherited from typescript-eslint's `base` preset, is
   * exact for .mjs; a CommonJS file would still parse, since `require` and `module.exports` are
   * ordinary expressions, and would simply warrant its own object with `sourceType: 'commonjs'`.
   * ---------------------------------------------------------------------------------------------- */
  {
    name: 'slatwall-ts/javascript-tooling',
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.recommended, tseslint.configs.disableTypeChecked],
  },

  /* ------------------------------------------------------------------------------------------------
   * [5] Parity annotations — `no-warning-comments` is OFF, deliberately and permanently.
   *
   * This is the single most consequential line in the file, so it is stated explicitly rather than
   * left to ESLint's default, and it is placed last, in an object with no `files` key, so that it
   * applies to every linted file and cannot be overridden by anything above it.
   *
   * Legacy defects are preserved and annotated rather than repaired, so the ported source carries
   * `TODO(parity)` markers naming the defect and its legacy locator — including the three literal
   * legacy comments reproduced verbatim from model/dao/SkuDAO.cfc:L177,
   * model/dao/ProductDAO.cfc:L64 and model/entity/ProductType.cfc:L92-L98. A lint gate that rejected
   * those markers would make the carry-over requirement unbuildable, leaving only two ways out:
   * deleting the annotations, which loses the documented decision, or repairing the defects, which
   * loses behavioural parity. Both are forbidden, so this rule is off and must stay off.
   *
   * The equivalent trap in the other direction is closed too: raising it to `warn` while running the
   * linter with `--max-warnings 0` is the same failure in different clothing, which is why the lint
   * script is a bare `eslint .`.
   *
   * Note what this does NOT license. No entry in this configuration is a placeholder and no work is
   * deferred anywhere in it; the marker is named here solely because this configuration must not
   * reject a marker parity requires. Annotations that are genuinely the port's own are still
   * reviewed on their merits, where a human rather than a regex over comment text is the right judge.
   * ---------------------------------------------------------------------------------------------- */
  {
    name: 'slatwall-ts/parity-annotations',
    rules: {
      'no-warning-comments': 'off',
    },
  },
);
