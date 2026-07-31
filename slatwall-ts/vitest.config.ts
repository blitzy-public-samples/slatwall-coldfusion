import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// `tests/setup.ts` is patterned on meta/tests/unit/Helper.cfc and is authored as
// part of the test tier. Referencing it unconditionally would hard-fail the
// runner before the file exists, so the reference is resolved at config load.
const setupFile = path.join(rootDir, 'tests', 'setup.ts');
const setupFiles = existsSync(setupFile) ? ['./tests/setup.ts'] : [];

export default defineConfig({
  test: {
    root: rootDir,
    environment: 'node',
    globals: false,
    watch: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
    setupFiles,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      // Enforced only by `npm run test:coverage`, so that `npm test` reports
      // test outcomes and never fails purely on a coverage percentage.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
