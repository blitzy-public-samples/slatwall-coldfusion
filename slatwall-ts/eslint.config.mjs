// ESLint flat configuration for slatwall-ts.
//
// The rule that matters architecturally is the `no-restricted-imports` layer
// boundary: `src/domain/**` must not import from `src/repositories/**`,
// `src/handlers/**`, or `src/integrations/**`. Domain-inward dependency flow is
// therefore a build failure rather than a code-review convention.
//
// Type-aware linting (typescript-eslint `recommendedTypeChecked` /
// `strictTypeChecked`) is intentionally NOT enabled here: it requires a
// TypeScript program with resolvable inputs, and `src/**` is authored
// incrementally. Type correctness is already gated separately and maximally by
// `npm run typecheck` (tsc, maximal strict profile). Enable the type-checked
// preset once `src/**` is fully populated if additional coverage is wanted.

import tseslint from 'typescript-eslint';

/** Directories the domain layer is forbidden to reach into. */
const OUTWARD_LAYERS = ['repositories', 'handlers', 'integrations'];

/** Build minimatch groups that catch relative and rooted specifiers alike. */
const outwardPatterns = OUTWARD_LAYERS.flatMap((layer) => [
  `**/${layer}/**`,
  `**/src/${layer}/**`,
  `../${layer}/*`,
  `../../${layer}/*`,
]);

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '**/*.d.ts'],
  },

  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },

  {
    // Domain layer: no outward imports. Enforces the hexagonal dependency rule.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: outwardPatterns,
              message:
                'Layer violation: src/domain/** must not import from src/repositories/**, src/handlers/** or src/integrations/**. Depend on a port in src/domain/ports/ instead.',
            },
          ],
        },
      ],
    },
  },

  {
    // Config files at the subtree root are plain Node ESM tooling scripts.
    files: ['*.mjs', '*.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
