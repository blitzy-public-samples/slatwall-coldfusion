import type { JestConfigWithTsJest } from 'ts-jest';

/**
 * Jest configuration for the slatwall-ts Catalog extraction.
 *
 * Suite organisation mirrors the intent of the legacy MXUnit layout documented in
 * meta/tests/readme.txt (unit / functional / coverage, with entity, service and dao
 * sub-folders) as: test/domain, test/services, test/adapters, test/validation,
 * test/integrations and test/regression.
 *
 * Note the structural difference recorded in AAP 0.4.3.6: legacy tests boot the whole
 * FW/1 application and resolve collaborators through DI/1, so they are integration
 * tests. Target tests construct the class under test directly against the in-memory
 * repository doubles in test/support, so they are true unit tests. No browser
 * (CFSelenium) or external test-runner mapping (MXUnit) is required.
 *
 * testMatch is used instead of `roots` on purpose: `roots` fails hard when a listed
 * directory does not exist, whereas testMatch simply resolves to nothing while the
 * source tree is still being generated.
 */
const config: JestConfigWithTsJest = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  verbose: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};

export default config;
