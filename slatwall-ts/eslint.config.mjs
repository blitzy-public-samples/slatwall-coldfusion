// @ts-check
import tseslint from 'typescript-eslint';

/**
 * ESLint flat configuration (ESLint 10 + typescript-eslint 8).
 *
 * TypeScript sources are linted with the type-aware rule set, which is what makes the
 * lint pass meaningful for a strict-mode port: rules such as no-unsafe-assignment and
 * no-floating-promises need type information to fire at all. The project service is
 * used so every file listed in tsconfig.json (src/**, test/** and jest.config.ts) is
 * resolved without maintaining a second file list here.
 *
 * The .mjs build/config files are parsed but not type-checked: they are not part of any
 * TypeScript program, so applying type-aware rules to them would fail resolution.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '**/*.d.ts'],
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
);
