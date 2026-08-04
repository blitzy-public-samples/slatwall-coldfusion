// @ts-check
/* ESLint flat configuration for the extracted Slatwall Catalog slice. */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /* [1] Ignores. */
  {
    name: 'slatwall-ts/ignores',
    ignores: ['node_modules/**', 'dist/**', 'build-meta/**', 'coverage/**'],
  },

  /*
   * [2] TypeScript sources — type-aware linting.
   *
   * @typescript-eslint/no-deprecated would error on the three deliberately deprecated members of
   * defect D16 (model/entity/Sku.cfc:L893-L910), which are ported with their deprecation hints
   * intact and still reachable.
   *
   * @typescript-eslint/no-unnecessary-condition would demand deleting carried defensive guards
   * whose redundancy is itself the observed legacy behaviour — the zero-option branch of defect D19
   * and the zero-index read of defect D13 (model/service/SkuService.cfc:L223-L269) being the
   * clearest cases.
   */
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
      /*
       * `no-explicit-any` is already an error inside `recommended`; it is restated here because it
       * is the one rule this port cannot afford to lose, and an explicit line is harder to weaken by
       * accident than an inherited default.
       */
      '@typescript-eslint/no-explicit-any': 'error',

      /*
       * Severity stays at `error`; only the escape hatch is named. The `^_` prefix convention is
       * required by the shape of the port rather than by taste: several retained members reach
       * collaborators that are out of scope and are implemented as boundary stubs behind a port, so
       * they must keep the legacy parameter name, arity and order while legitimately not consuming
       * every parameter. Underscore-prefixing states "intentionally unused" in the signature itself,
       * which is more honest than an inline suppression and cannot hide a genuine mistake: any unused
       * binding that is not underscore-prefixed is still an error.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  /* [3] Test sources — one rule relaxed, and only one. */
  {
    name: 'slatwall-ts/typescript-tests',
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  /* [4] JavaScript tooling files — parsed and linted, but never type-checked. */
  {
    name: 'slatwall-ts/javascript-tooling',
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.recommended, tseslint.configs.disableTypeChecked],
  },

  /* [5] Parity annotations — `no-warning-comments` is off, deliberately and permanently. */
  {
    name: 'slatwall-ts/parity-annotations',
    rules: {
      'no-warning-comments': 'off',
    },
  },
);
