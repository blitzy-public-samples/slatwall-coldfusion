// @ts-check
/* ==================================================================================================
 * slatwall-ts — ESLint flat configuration for the extracted Slatwall Catalog slice.
 *
 * This file has no legacy counterpart, and it has no in-repository precedent either: the Slatwall
 * tree contains zero Node or TypeScript artifacts (AAP 0.3.1), and a repository scan found no
 * .eslintrc, no .eslintrc.js, no .editorconfig and no other rule-bearing or lint-bearing file
 * anywhere. `review_rules` reports "No user rules provided." for this project, so no user rule
 * mandates any entry below. That absence is not licence to lower the bar — it shifts the burden onto
 * this file to name its standards explicitly, which is what the comments here do (AAP 0.8.2
 * guideline 6: document technology-specific translation decisions, especially the judgment calls).
 *
 * WHAT THIS CONFIGURATION IS FOR
 * The deliverable replaces a CFML/Hibachi monolith's metaprogramming with explicit declarations
 * (AAP 0.1.2.2 transformation rule TR-3). The compiler is the primary safety net — tsconfig.json
 * pins `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — and this
 * configuration reinforces that net with type-aware lint rules rather than duplicating it. The
 * relationship is one-directional and must stay that way: when lint or the compiler rejects a
 * source file, THE SOURCE FILE IS FIXED. Neither tsconfig.json nor this file is ever weakened to
 * let code through.
 *
 * SCOPE — NOTHING OUTSIDE slatwall-ts/ IS EVER LINTED
 * Every glob below is subtree-relative. There is no `../` segment, no absolute path and no
 * `basePath` override, so this configuration cannot reach model/, org/ (938 framework files),
 * integrationServices/, admin/, frontend/, public/, config/ or meta/. `package.json`'s lint script
 * is a bare `eslint .` executed from this directory, which bounds discovery to this subtree as
 * well. That is the mechanical enforcement of AAP 0.8.2 guideline 5 (isolate the new implementation
 * in dedicated files and modules), of the additive-only invariant of AAP 0.4.1.1 and of
 * transformation rule TR-6: every target file is CREATE, every legacy file is REFERENCE, and the
 * CFML tree stays byte-for-byte unchanged — including by never being linted or auto-fixed.
 *
 * WHY THE FILE EXTENSION IS `.mjs`
 * `package.json` declares `"type": "commonjs"`, which is load-bearing rather than incidental:
 * tsconfig.json sets `module`/`moduleResolution` to NodeNext (so the nearest package `type` decides
 * each file's format), build/esbuild.mjs emits `--format=cjs` because that is what the Node 20
 * Lambda runtime loads, and ts-jest runs CommonJS. An `eslint.config.js` in this package would
 * therefore be parsed as CommonJS and its `import` statements would fail. The `.mjs` extension
 * makes this file unambiguously ESM regardless of the package `type` field, which is exactly why
 * AAP 0.3.1 and 0.4.1.2 name it `eslint.config.mjs`. Do not rename it.
 *
 * WHY ONE IMPORT, AND WHY THAT IMPORT
 * `typescript-eslint` is the single unified package (pinned at 8.65.0), not the older split pair
 * @typescript-eslint/parser + @typescript-eslint/eslint-plugin. It supplies the parser, the plugin,
 * the shareable presets and the `config()` helper together, so one import wires all four and the
 * versions cannot drift apart.
 *
 * Nothing else is imported, because the dependency set is exact-pinned and closed (AAP 0.7.3
 * standard 5) and this configuration must not require a package outside `package.json`. Two
 * packages a conventional flat config would reach for were checked against the installed tree and
 * are genuinely absent, so they are deliberately not used:
 *
 *   @eslint/js — not resolvable from this install (node_modules/@eslint/ holds only config-array,
 *   config-helpers, core, object-schema and plugin-kit; eslint 10 does not re-export it). Its
 *   `configs.recommended` layer is replaced below by `tseslint.configs.recommended`, which is a
 *   preset this project already depends on.
 *
 *   globals — also not resolvable. No environment globals map is declared, and that costs nothing
 *   here: `no-undef` is switched off for TypeScript by typescript-eslint's eslint-recommended layer
 *   (TypeScript itself reports undefined identifiers, and does it more accurately), and it is never
 *   switched on for JavaScript, so a globals map would be inert. Stating this is better than
 *   shipping a hand-written partial list that implies coverage it does not provide.
 *
 * WHY NO STYLISTIC RULES AND NO PRETTIER PLUGIN
 * .prettierrc.json is the formatting baseline (printWidth 100, 2-space indent, single quotes,
 * trailing commas, semicolons, LF) and `prettier --check .` is a separate command. Formatting is
 * therefore owned entirely by Prettier and this file declares no layout rule at all — no `indent`,
 * `quotes`, `semi`, `comma-dangle`, `max-len` or `object-curly-spacing` — and does not extend
 * typescript-eslint's `stylistic*` presets. Because no stylistic rule is enabled, there is nothing
 * for a formatter-compatibility layer to turn off: eslint-config-prettier and eslint-plugin-prettier
 * are not installed, would each be an extra dependency, and are not needed. The two tools have
 * disjoint responsibilities and never disagree.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * No auto-fix gate, no coverage or quality threshold, no `--max-warnings` policy and no severity
 * escalation invented for its own sake (AAP 0.7.3 standard 9 / IR-12: invent nothing the source does
 * not state; AAP 0.8.2 guideline 4: do not enhance beyond what the migration requires). ESLint's own
 * default handling of unused disable directives — reported, not fatal — is left alone for the same
 * reason: it keeps stale suppressions visible without inventing a gate the plan never asked for.
 * ================================================================================================ */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /* ------------------------------------------------------------------------------------------------
   * [1] Ignores.
   *
   * These mirror the lintable paths of slatwall-ts/.gitignore (`node_modules/`, `dist/`, `coverage/`)
   * and of .prettierignore, so the three tools agree on what is generated output. The remaining
   * .gitignore entries — *.tsbuildinfo, .env files, npm/yarn logs, .eslintcache — contain no
   * JavaScript or TypeScript and need no ignore entry here.
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
   * two .mjs tooling files and still exit 0 — a green result that proves nothing. (Globs are written
   * only in the code below, never inside these block comments, because the star-slash sequence a
   * recursive glob begins with would close the comment.)
   *
   * `projectService: true` resolves each file through the TypeScript project service against
   * tsconfig.json, whose `include` covers the TypeScript sources under src and test plus
   * jest.config.ts. Every linted .ts file is therefore inside the program, and the type-aware rules
   * that make this pass worth running — no-floating-promises, no-misused-promises, await-thenable,
   * the no-unsafe-* family — have the type information they need to fire at all. `tsconfigRootDir`
   * is anchored to this file's own directory, so resolution is identical no matter which directory
   * ESLint is invoked from. If a file ever reports "not found by the project service", the fix is to
   * correct the file selection here; it is never to loosen tsconfig.json (AAP 0.7.3 standard 1).
   *
   * PRESET CHOICE — `recommendedTypeChecked`, and specifically NOT `strictTypeChecked`.
   * This looked like a free upgrade and is not, because `strictTypeChecked` adds two rules that
   * contradict a binding requirement of the plan. AAP 0.7.3 standard 7 ("preserve and annotate, do
   * not repair") and AAP 0.8.2 guideline 4 require the twenty-one catalogued legacy defects of AAP
   * 0.6.7 to be carried across as flagged annotations rather than fixed:
   *
   *   @typescript-eslint/no-deprecated would error on the three deliberately deprecated members of
   *   defect D16 (model/entity/Sku.cfc:L893-L910 — getOptionsByGroupIDStruct, getOptionsValueStruct
   *   and isNotDefaultSku), which AAP 0.4.1.4 requires to be ported WITH their deprecation hints
   *   intact and still reachable.
   *
   *   @typescript-eslint/no-unnecessary-condition would demand deleting carried defensive guards
   *   whose redundancy is itself the observed legacy behaviour — the zero-option branch of defect
   *   D19 (AAP 0.6.2) and the zero-index read of defect D13 (model/service/SkuService.cfc:L223-L269)
   *   being the clearest cases.
   *
   * A preset that forces a choice between passing lint and preserving behaviour is the wrong preset.
   * `recommendedTypeChecked` — the preset AAP 0.4.1.2 names — includes neither rule, so strictness
   * and parity coexist. Verified against typescript-eslint 8.65.0 with `eslint --print-config`.
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
       * The legacy source is saturated with `any`. Every CFML service signature in the slice is
       * written as `required any product` / `required struct data`, and
       * org/Hibachi/HibachiService.cfc:L255-L281 fabricates the entire implicit CRUD surface at
       * runtime by prefix dispatch (get*, get*SmartList, new*, list*, save*, delete*, count*,
       * export*, process*) through onMissingMethod. IR-1 requires the eighteen members that
       * mechanism synthesised — optionService.getOption, optionService.getOptionGroup,
       * optionService.getOptionSmartList, optionService.getOptionGroupSmartList, skuService.newSku,
       * productService.newProduct, productService.getProductType, productService.getProduct,
       * brandService.newBrand, brandService.getBrand, brandService.deleteBrand and the rest
       * enumerated in AAP 0.4.2.5 — to be declared and typed explicitly instead. Tolerating blanket
       * `any` would let that requirement be satisfied on paper by a transliteration of the CFML
       * idiom, which is precisely the failure mode AAP 0.1.1 warns against.
       *
       * Where a legacy signature is genuinely loose, AAP 0.4.2 already prescribes the target type:
       * `unknown` (processProductAddProductReview's processObject) or `Record<string, unknown>`
       * (saveProduct's data). Both satisfy this rule. `any` does not, and that is the point.
       *
       * The no-unsafe-* family inherited from `recommendedTypeChecked` is likewise left at full
       * strength and must not be relaxed here. When a genuine escape is required — a mysql2
       * RowDataPacket cast inside src/adapters/mysql/rowMappers.ts is the anticipated case — the
       * sanctioned mechanism is a narrowly scoped `eslint-disable-next-line` carrying a
       * justification, authored in that file, never a global relaxation in this one. */
      '@typescript-eslint/no-explicit-any': 'error',

      /* Severity stays at `error`; only the escape hatch is named. The `^_` prefix convention is
       * required by the shape of the port rather than by taste: AAP 0.4.1.8 and 0.4.2 deliberately
       * retain members whose collaborators are out of scope and implement them as boundary stubs
       * behind the ports of AAP 0.2.2.7 — five in ProductService (processProduct_addProductReview,
       * processProduct_addSubscriptionTerm, processProduct_deleteDefaultImage,
       * processProduct_updateDefaultImageFileNames, processProduct_uploadDefaultImage), plus
       * SkuService.processImageUpload and getSkuStocksDeletableFlag. Those members must keep the
       * legacy parameter name, arity and order (transformation rule TR-1) while legitimately not
       * consuming every parameter. Underscore-prefixing states "intentionally unused" in the
       * signature itself, which is more honest than an inline suppression and cannot hide a genuine
       * mistake: any unused binding that is not underscore-prefixed is still an error. */
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
   * reference to an assertion (`expect(repository.findBySkuCode).toHaveBeenCalledWith(...)`)
   * deliberately unbinds `this`, which is the rule's entire subject. typescript-eslint's documented
   * remedy is eslint-plugin-jest's drop-in `jest/unbound-method`; that plugin is not installed and
   * adding it would breach the closed dependency set, so the rule is switched off for the test glob
   * alone. Production sources keep it at full strength.
   *
   * Nothing else is relaxed. In particular the no-unsafe-* family stays on for tests, because AAP
   * 0.4.3.6 makes the target suite unit tests constructed directly against the in-memory doubles of
   * test/support/inMemoryRepositories.ts — the substitution the ports exist to enable — rather than
   * integration tests that boot an application and resolve services dynamically. Test doubles that
   * satisfy a typed port need no `any`, so a blanket relaxation here would buy nothing and would
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
   * Two files match today: this configuration and build/esbuild.mjs, the packaging script that
   * produces the Lambda artifact and so satisfies half of the deployability bar of AAP 0.8.3.10.
   * Both are deliberately outside every TypeScript program — tsconfig.json's `include` lists only
   * .ts sources — so type-aware rules cannot resolve them and `disableTypeChecked` switches that
   * whole family off, along with the parser's project resolution (`project: false`,
   * `projectService: false`). Applying type-aware rules to a file the project service cannot see
   * would fail resolution, not find bugs.
   *
   * `tseslint.configs.recommended` is layered underneath so these files receive real coverage rather
   * than an empty rule set. Without it the only object matching them would be `disableTypeChecked`,
   * whose every entry is `off`, leaving the packaging script effectively unlinted — a silent gap
   * confirmed by `eslint --print-config build/esbuild.mjs` reporting zero active rules. The preset
   * restores twenty-four real checks (prefer-const, no-var, no-unused-vars, no-unused-expressions,
   * ban-ts-comment and the rest), all non-type-aware and therefore unaffected by the layer above.
   * This is the substitute for @eslint/js's `configs.recommended`, which is not resolvable from this
   * install; using a preset the project already depends on keeps the dependency set closed and keeps
   * the rule list a published preset rather than an inventory invented here.
   *
   * Order matters: `disableTypeChecked` comes second so it wins for the rules the two overlap on.
   *
   * The glob covers .cjs and .js as well as .mjs so that no JavaScript file added to this subtree
   * can ever be silently unlinted. Only .mjs exists today, and `sourceType: 'module'` — inherited
   * from typescript-eslint's `base` preset — is exact for it. Were a CommonJS .cjs or .js file ever
   * added, module-mode parsing would treat it as strict mode; `require` and `module.exports` are
   * ordinary expressions and still parse, so the glob is safe as written, and a genuinely CommonJS
   * tooling file would simply warrant its own object with `sourceType: 'commonjs'`.
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
   * AAP 0.7.3 standard 7 governs: "preserve and annotate, do not repair" — legacy defects are
   * carried across as flagged annotations rather than silently fixed, with any exception declared.
   * AAP 0.8.2 guideline 4 forbids repairing them at all. The ported source therefore carries one
   * `TODO(parity)` marker per register entry D1 through D21 of AAP 0.6.7, plus the three literal
   * legacy comments reproduced verbatim from model/dao/SkuDAO.cfc:L177 (D8),
   * model/dao/ProductDAO.cfc:L64 (D20) and model/entity/ProductType.cfc:L92-L98 (D21). AAP 0.6.7
   * explains why the register is enumerated at all: it "converts an invisible temptation into a
   * documented decision."
   *
   * A lint gate that rejected those markers would make the plan's own carry-over requirement
   * literally unbuildable, and the only ways to satisfy both would be to delete the annotations
   * (losing the documented decision) or to repair the defects (losing behavioural parity). Both are
   * forbidden. So this rule is off, and it must stay off. The equivalent trap in the other direction
   * is closed too: raising it to `warn` while running the linter with `--max-warnings 0` is the same
   * failure in different clothing, which is why `package.json`'s lint script is a bare `eslint .`.
   *
   * Note what this does NOT license. No entry in this configuration is a placeholder, and no work is
   * deferred anywhere in it; the marker is named here solely because this configuration must not
   * reject a marker the plan mandates. Annotations that are genuinely the port's own — as opposed to
   * carried parity findings — are still reviewed on their merits at code review, where a human, not
   * a regex over comment text, is the right judge.
   * ---------------------------------------------------------------------------------------------- */
  {
    name: 'slatwall-ts/parity-annotations',
    rules: {
      'no-warning-comments': 'off',
    },
  },
);
