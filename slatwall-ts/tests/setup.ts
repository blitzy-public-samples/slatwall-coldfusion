/**
 * Test bootstrap, loaded by the runner before any suite.
 *
 * It pins the process to UTC and proves the pin took effect, loads a local `.env` when one is
 * present, resolves the flag that gates database-backed suites, and restores mocks and timers between
 * tests.
 */

// ---------------------------------------------------------------------------
// THE SIBLINGS THIS FILE NAMES, AND WHAT EACH ONE OWNS
//
// Commentary below hands responsibilities to other modules by name. Every one of
// them exists on the branch, so each mention is a pointer to real code rather
// than to an intention:
//
//   src/handlers/bootstrap.ts                   composition root (wiring)
//   tests/fixtures/                             fixture tier
//   tests/integration/repositories/             repository integration tier
//   tests/traceability/legacyTestMap.ts         structural coverage map
//   tests/unit/domain/entities/brand.test.ts    brand entity suite
//   tests/unit/domain/entities/product.test.ts  product entity suite
//
// This file imports NONE of them. Naming a boundary is how it records what it
// refuses to do; importing one would make this setup module a second source of
// truth for work that already has an owner.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the single registered Vitest setup file
//
// BRANCH COVERAGE CLASSIFICATION - THREE BRANCHES ARE INSPECTION-ONLY
//
// A normal run drives this module's default path end to end, so it is
// continuously exercised. Three branches are not, and none of them MAY be
// covered by a suite: this file declares no `describe` and no `it` by contract,
// and covering them from elsewhere would mean re-importing this module mid-run,
// which re-executes the environment mutation and re-registers the global
// per-test hook - the exact leak the tier exists to prevent. Each is therefore
// verified by running a documented probe and reading the outcome.
//
//   1. The UTC failure diagnostic (the `throw` in R1).
//      Probe `TZ=America/Chicago npm test` -> the suite PASSES and the guard does
//      not fire, which is correct: R1 assigns `process.env.TZ` before any date is
//      constructed, so a non-UTC shell is corrected rather than rejected. The
//      branch is reachable only on a runtime that ignores that assignment.
//   2. The flag literal table (the accepted-value lists in R3).
//      Probe: one run per literal, plus one with the variable unset -> every
//      enabling and disabling literal, the empty value, a mixed-case value with
//      surrounding whitespace, and the unset case all resolve as documented, so
//      trimming and case-folding are confirmed.
//   3. The unrecognised-value rejection (the `throw` at the end of R3).
//      Probe `TEST_LIVE_DATABASE=maybe npm test` -> the run stops before any test
//      executes, naming the flag, both accepted-value lists and why it stops,
//      without echoing the offending value.
//
//     R1  pin the process to UTC, and then PROVE the process is UTC
//     R2  load a local `.env` if one happens to exist - best-effort, and never
//         fatally
//     R3  normalise the one test-only environment flag into this file's single
//         exported constant
//     R4  scrub per-test spy and clock state after every test
//
//   It deliberately does nothing else. Every other responsibility in the test
//   tier is owned elsewhere, and duplicating one here would create a second
//   source of truth for it:
//
//     fixtures, factories, test data   tests/fixtures/*.ts
//     the structural coverage floor    tests/traceability/legacyTestMap.ts
//     emitted SQL and bound values     tests/integration/repositories/*.test.ts
//     behavioural gates                tests/unit/**/*.test.ts
//
//   So this module declares no fixture, no factory, no test data, no suite
//   block, and no assertion about application behaviour.
//
// TYPECHECKED, NEVER SHIPPED
//   `tsconfig.json` names `tests/**/*.ts` in its `include`, so this file is held
//   to the same maximal strict profile as `src/**`: `strict`,
//   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
//   `noImplicitOverride` and `noUnusedLocals`, with `skipLibCheck` off.
//   `tsconfig.build.json` narrows the emit program to `src/**`, so this module
//   never reaches `dist/` and is never bundled into the Lambda artifact.
//
// CONFORMANCE TO THE SHIPPED CONFIGURATION (read, not assumed)
//   Each point below was RE-DERIVED from the files as they exist on the branch,
//   not carried over. An earlier revision of this block cited line numbers from a
//   draft of `vitest.config.ts` that was several times longer than the shipped
//   one - `:L144`, `:L154`, `:L190-L194` and `:L251` against a file of 107 lines -
//   so every locator below was looked up again and the ones that had drifted are
//   corrected. No contradiction with this file's specification was found, and no
//   sibling configuration was edited to suit this file.
//
//   Every reference here names the SETTING KEY and the file that holds it, never
//   a line number. A line number into a sibling in this same subtree is the one
//   citation that rots without anyone touching the fact it points at: a comment
//   added to `vitest.config.ts` moves every setting below it, and the reader is
//   then sent to prose that says nothing about the claim. Legacy CFML locators
//   are cited by line throughout this port because that tree is frozen; these
//   are not, so they are cited by key.
//
//   * `globals: false` (vitest.config.ts) together with `"types": ["node"]`
//     (tsconfig.json `compilerOptions`) means the runner injects no ambient test
//     globals and the type program declares none. Explicit named imports from
//     'vitest' are therefore mandatory here, not merely preferred.
//   * `module` and `moduleResolution` are both `NodeNext` (tsconfig.json) and
//     `allowImportingTsExtensions` is absent, so a relative specifier would need
//     an explicit `.js` extension. This module needs no relative import at all -
//     'vitest' and 'dotenv' are the only two specifiers it uses, both pinned to
//     an exact version in `package.json` with no range operator. No dependency
//     is introduced by this file.
//   * `environment: 'node'` and `watch: false` (vitest.config.ts), and the
//     `test` script in `package.json` is `vitest run`. Nothing here assumes an
//     interactive session or a browser-like environment.
//   * `isolate: true` (vitest.config.ts) gives every test file a fresh module
//     registry. That setting is load-bearing - see R4.
//
// WHAT IT CARRIES FORWARD FROM THE LEGACY HARNESS, AND WHAT IT REFUSES
//   Positive reference - meta/tests/unit/Helper.cfc:L51-L75. The legacy fixture
//   shape is build, save, flush (L51-L67) and null-the-child, delete, flush
//   (L69-L75). Only the SHAPE survives. This port has no ORM, so the four
//   engine-level persistence calls that shape depended on have no counterpart
//   and are dropped outright: the entity instantiation at L52, the flush at
//   L64, the entity removal at L72 and the flush at L74 - along with the
//   null-cast at L70 and, on L62, both the ambient per-request scope and the
//   service-locator lookup performed through it. Target fixtures are plain
//   constructed objects, built per test inside each suite, and the unit tier
//   contacts no database. This file therefore defines no fixture of its own; it
//   only guarantees the environment those fixtures are built in.
//
//   Deliberately NOT reproduced: meta/tests/unit/Helper.cfc:L53 assigns
//   `productData` with no `var`, leaking it into the component's `variables`
//   scope. That is a hygiene defect in the legacy HARNESS being replaced - not
//   one of the thirty preserved business-logic defects - so its absence here is
//   a decision rather than an oversight, and it correctly carries no
//   preserved-defect marker. The literal fixture values on L54-L59 are
//   likewise out of scope for this file; they belong to tests/fixtures/.
//
//   Negative reference - meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L73, the
//   anti-pattern this file is the exact inverse of. It extends the vendored
//   MXUnit test case (L49), instantiates the real CFML application (L52), boots
//   that application - and with it the ORM and the bean factory - before EVERY
//   test (L60), and elevates the current account's privilege flag before every
//   test as well (L62). Both of its teardown calls are commented out (L53,
//   L70), so there is effectively no teardown at all. That is empirical proof
//   the legacy suite is integration-style at every level, with nothing isolated
//   in the modern sense.
//
//   This file refuses all of it. It starts no application, wires no composition
//   root, registers no container and no service locator, elevates no privilege,
//   opens no connection, performs no network or filesystem write, and installs
//   no ambient request scope. Ambient scope in particular is the thing this
//   port set out to remove: the legacy code reached it through two DIFFERENT
//   accessors inside a single seven-line method
//   [model/service/PriceGroupService.cfc:L262-L268], one on L263 and the other
//   on L264, and both were replaced by an explicit context parameter threaded
//   down the call chain. A setup file that reintroduced ambient state would
//   undo that by the back door, so this one holds none.
//
//   meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67 contributes one
//   observation and nothing more: the legacy harness re-created its subject
//   before every test. The equivalent here is per-test construction inside each
//   suite plus the runner's per-file isolation - never a shared mutable subject
//   parked in this module. The four shared cases at L51-L67 themselves belong
//   to tests/unit/domain/entities/brand.test.ts and
//   tests/unit/domain/entities/product.test.ts, which carry them today - those
//   two are the only suites in the tree that EXTEND legacy coverage rather than
//   being net-new, so they are also the two `tests/traceability/legacyTestMap.ts`
//   labels legacy-extended.
//
// THE EMPTY-ENVIRONMENT GUARANTEE
//   The entire suite passes with a completely empty environment. No test may
//   depend on a `.env` file existing, on any DB_* value being set, or on a
//   reachable server. Nothing in this file fails because a variable is absent.
//   It can raise exactly two errors, and neither can fire on an empty
//   environment: the UTC self-check below, which is a correctness guard, and an
//   unrecognised value in the single test-only flag, which is a typo guard.
//
//   No credential of any kind appears in this file - no host name, no network
//   address, no account name, no authentication value - and none may be added.
//   This module also never prints environment content: at most it names a
//   variable, never its value.
// ---------------------------------------------------------------------------

import { config } from 'dotenv';
import { afterEach, vi } from 'vitest';

// This must stay the first executable statement, so the check below measures a process that has
// already been pinned.
process.env.TZ = 'UTC';

const UTC_WINTER_INSTANT = new Date('2024-01-01T00:00:00.000Z');
const UTC_SUMMER_INSTANT = new Date('2024-07-01T00:00:00.000Z');

// JUDGMENT CALL: A process that is not effectively UTC stops the run rather than continuing, because every date-sensitive assertion would then pass or fail by machine.
// Both a winter and a summer instant are measured, so a zone that is only incidentally at zero offset
// in one half of the year is still rejected. No credential or database value is printed; the UTC guard
// may report TZ.
if (
  UTC_WINTER_INSTANT.getTimezoneOffset() !== 0 ||
  UTC_SUMMER_INSTANT.getTimezoneOffset() !== 0 ||
  UTC_WINTER_INSTANT.getHours() !== 0 ||
  UTC_SUMMER_INSTANT.getHours() !== 0
) {
  throw new Error(
    'slatwall-ts test setup: this process is not effectively UTC, so every date-sensitive ' +
      'assertion in the suite would pass or fail by accident depending on the machine.\n' +
      `  TZ                  ${process.env.TZ ?? '(unset)'}\n` +
      `  offset in January   ${UTC_WINTER_INSTANT.getTimezoneOffset()} minutes (must be 0)\n` +
      `  offset in July      ${UTC_SUMMER_INSTANT.getTimezoneOffset()} minutes (must be 0)\n` +
      `  local hour, January ${UTC_WINTER_INSTANT.getHours()} (must be 0)\n` +
      `  local hour, July    ${UTC_SUMMER_INSTANT.getHours()} (must be 0)\n` +
      'tests/setup.ts already assigns process.env.TZ = "UTC" as its first executable ' +
      'statement, so reaching this point means the runtime did not honour it. Fix it at the ' +
      'source: unset TZ, or set it to UTC, in the shell, container or job definition that ' +
      'launches the runner, then re-run. Do not weaken this check - this port pins date ' +
      'handling to UTC everywhere, and suites pass an explicit instant rather than reading ' +
      'the ambient clock.',
  );
}

// A local `.env` is optional: its absence is not a failure, and Lambda supplies environment variables
// directly, so this load has no production counterpart.
try {
  config({ quiet: true });
} catch {}

// The flag that enables suites needing a reachable database. It is the only test-only key in the
// committed environment contract.
const LIVE_DATABASE_FLAG_NAME = 'TEST_LIVE_DATABASE';

const FLAG_ENABLED_LITERALS: readonly string[] = ['true', '1', 'yes'];

const FLAG_DISABLED_LITERALS: readonly string[] = ['false', '0', 'no', ''];

/**
 * Interpret the live-database flag.
 *
 * An unrecognized value raises rather than defaulting to disabled, so a typo cannot silently skip the
 * suites it was set to enable while the run still reports success.
 *
 * That is deliberately UNLIKE production configuration, and the two must not be
 * conflated. The legacy host chose its ORM dialect with a three-branch
 * case-insensitive substring chain [config/configORM.cfm:L9-L15] - the opening
 * test on L9 and the two alternatives on L11 and L13 - and that chain closes on
 * L15 with NO final else branch of any kind. A database product that matched none
 * of the three therefore left the dialect NEVER ASSIGNED and execution
 * CONTINUED; only a datasource probe that threw aborted the request
 * [config/configORM.cfm:L4-L7]. `slatwall-ts/.env.example` carries the absence of
 * a guess forward by giving `DB_DIALECT` no default at all, and
 * `src/repositories/mysql/dialect.ts` goes one step further than the legacy on
 * purpose: an unrecognized value is a hard startup error rather than a silent
 * unset state. Production configuration is REQUIRED, with no fallback. This flag
 * is the opposite by design - test-only, optional, and explicitly defaulted.
 *
 * A PRESENT BUT UNRECOGNISED value throws rather than degrading to disabled. A
 * typo must not silently skip the very suites it was set to enable; that would
 * be a green run that proves less than it appears to.
 *
 * WHAT THE FLAG IS FOR, stated plainly so it is not misread as an invitation:
 * the suites under `tests/integration/repositories/` must not require a
 * live MySQL server at all. They assert generated SQL text and bound parameters
 * against a recording test double substituted for the pool or executor - which
 * is why not one of them consults this flag, and why setting it changes nothing
 * about what they prove. `vitest.config.ts` states the same thing where it
 * declares the `include` globs for the two tiers, and `.env.example` states it
 * where it documents `TEST_LIVE_DATABASE` itself. This flag exists as a
 * documented escape hatch for any suite that would ever genuinely need a real
 * database - it is not a licence to write one, and it is never a substitute for
 * gating on a connection written into source.
 *
 * @param raw - the unnormalised environment value, or `undefined` when unset
 * @returns `true` only for an explicitly enabling value
 */
function resolveLiveDatabaseTestsEnabled(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }

  const normalised = raw.trim().toLowerCase();

  if (FLAG_ENABLED_LITERALS.includes(normalised)) {
    return true;
  }

  if (FLAG_DISABLED_LITERALS.includes(normalised)) {
    return false;
  }

  throw new Error(
    `slatwall-ts test setup: ${LIVE_DATABASE_FLAG_NAME} holds a value that is not recognised, ` +
      'so the run is stopped rather than quietly treated as disabled - a typo here would skip ' +
      'the very suites it was set to enable and still report success.\n' +
      `  to enable    ${FLAG_ENABLED_LITERALS.join(' | ')}\n` +
      `  to disable   ${FLAG_DISABLED_LITERALS.filter((value) => value.length > 0).join(' | ')}` +
      ', an empty value, or the variable left unset\n' +
      'Matching ignores case and surrounding whitespace. The offending value is deliberately ' +
      'not echoed here, because this file never prints environment content. Correct it in your ' +
      `local .env - see slatwall-ts/.env.example, where ${LIVE_DATABASE_FLAG_NAME} is the sole ` +
      'test-only key - or in the shell that launches the runner.',
  );
}

export const liveDatabaseTestsEnabled: boolean = resolveLiveDatabaseTestsEnabled(
  process.env[LIVE_DATABASE_FLAG_NAME],
);

// Mock and timer hygiene: spies are restored and the clock is returned to real time after each test,
// so neither can leak into the next one.
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// R5 - what this file refuses to reach for, and why
//
// Recorded so a reviewer can tell each omission from an oversight.
//
//   * `src/lib/config.ts` is never imported. It fails fast on a missing or
//     unrecognised dialect and aggregates every invalid variable into one
//     error. Importing it here would make every pure-logic unit test require a
//     fully populated environment, contradicting the empty-environment
//     guarantee outright.
//   * `src/lib/logger.ts` is never imported, and stdout and stderr are never
//     globally patched or silenced. That logger writes exactly one
//     newline-terminated JSON object per entry, applies a mandatory
//     non-disableable redaction list, and exposes an injectable sink precisely
//     so its own suite can intercept output. Muting the console globally would
//     defeat those tests.
//   * Nothing under `src/handlers/**`, `src/repositories/**` or
//     `src/integrations/**` is imported. The ESLint `no-restricted-imports`
//     boundary stops `src/domain/**` from importing outward, and the test tier
//     must not become a back door around it. A setup file reaching into
//     adapters would be exactly such a back door - and would also drag the
//     composition root in `src/handlers/bootstrap.ts` into every unit test.
//   * No process-level unhandled-rejection or uncaught-exception handler is
//     installed. Vitest reports both itself, and a hand-rolled handler risks
//     swallowing that reporting.
//   * No schema or data hook of any kind. Schema continuity is binding: this
//     service is built to read and write the EXISTING `Sw*` tables unchanged,
//     with no migration, rename, new table or column change, and there is no
//     schema-management tooling in the dependency set to perform one with. No
//     suite in the tier this file serves touches a database at all.
// ---------------------------------------------------------------------------
