// slatwall-ts - the single registered Vitest setup file, loaded by the runner before any suite.
//
// It does two things: it pins the process to UTC and then proves the pin took, and it loads a local
// `.env` if one happens to exist, best-effort. A normal run drives both paths end to end.

import { config } from 'dotenv';
import { afterEach, vi } from 'vitest';

// This must stay the first executable statement, so the check below measures a process that has
// already been pinned.
process.env.TZ = 'UTC';

const UTC_WINTER_INSTANT = new Date('2024-01-01T00:00:00.000Z');
const UTC_SUMMER_INSTANT = new Date('2024-07-01T00:00:00.000Z');

// JUDGMENT CALL: A process that is not effectively UTC stops the run rather than continuing,
// because every date-sensitive assertion would then pass or fail by machine.
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

// A local `.env` is optional: its absence is not a failure, and Lambda supplies environment
// variables directly, so this load has no production counterpart.
try {
  config({ quiet: true });
} catch {}

// The flag that enables suites needing a reachable database. It is the only test-only key in the
// committed environment contract, and it is the only key in that contract `src/lib/config.ts` does
// not read - not to resolve it, and not to measure its length either.

/**
 * The environment variable this file owns, exported so a suite can name it without spelling it.
 */
export const LIVE_DATABASE_FLAG_NAME = 'TEST_LIVE_DATABASE';

/**
 * The values that enable the flag, exported so a suite asserts the published set rather than a copy
 * of it.
 */
export const FLAG_ENABLED_LITERALS: readonly string[] = ['true', '1', 'yes'];

/**
 * The values that disable it, the empty string among them.
 */
export const FLAG_DISABLED_LITERALS: readonly string[] = ['false', '0', 'no', ''];

/**
 * Interpret the live-database flag.
 *
 * An unrecognized value raises rather than defaulting to disabled, so a typo cannot silently skip
 * the suites it was set to enable while the run still reports success. The cost is the whole run
 * rather than one suite, because this resolution happens once at setup time and before any suite is
 * collected - stated so the trade is visible where it is made.
 *
 * That is deliberately UNLIKE production configuration, and the two must not be conflated:
 * `src/lib/config.ts` never reads this variable, so no value of it reaches a deployed function's
 * cold start.
 *
 * Exported so the contract above is asserted directly rather than re-implemented by a suite, which
 * would prove only that two copies of the rule agree.
 *
 * @param raw the unnormalised environment value, or `undefined` when unset.
 * @returns `true` only for an explicitly enabling value.
 */
export function resolveLiveDatabaseTestsEnabled(raw: string | undefined): boolean {
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

// Mock and timer hygiene: spies are restored and the clock is returned to real time after each
// test, so neither can leak into the next one.
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// R5 - what this file refuses to reach for, and why.
