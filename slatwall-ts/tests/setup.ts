// ---------------------------------------------------------------------------
// slatwall-ts - the single registered Vitest setup file
//
// WHAT THIS FILE IS
//   The one and only setup module for the entire test suite of the strict-mode
//   TypeScript port of the Slatwall 3.1.39 catalog + promotions/pricing slice.
//   `vitest.config.ts:L229` wires it in as `setupFiles: ['./tests/setup.ts']`
//   with exactly one entry, so this path and this filename are a contract
//   rather than a convention: never renamed, never relocated, never split into
//   several setup modules, and never joined by a second entry.
//
//   Its whole job is to make every suite deterministic and self-contained:
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
//   `tsconfig.json:L133` includes `tests/**/*.ts`, so this file is held to the
//   same maximal strict profile as `src/**`: `strict`,
//   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
//   `noImplicitOverride` and `noUnusedLocals`, with `skipLibCheck` off.
//   `tsconfig.build.json` narrows the emit program to `src/**`, so this module
//   never reaches `dist/` and is never bundled into the Lambda artifact.
//
// CONFORMANCE TO THE SHIPPED CONFIGURATION (read, not assumed)
//   Each point below was checked against the files as they exist on the branch.
//   No contradiction with this file's specification was found, and no sibling
//   configuration was edited to suit this file.
//
//   * `globals: false` (vitest.config.ts:L144) together with `"types":
//     ["node"]` (tsconfig.json:L65) means the runner injects no ambient test
//     globals and the type program declares none. Explicit named imports from
//     'vitest' are therefore mandatory here, not merely preferred.
//   * `module` and `moduleResolution` are both `NodeNext`
//     (tsconfig.json:L58-L59) and `allowImportingTsExtensions` is absent, so a
//     relative specifier would need an explicit `.js` extension. This module
//     needs no relative import at all - 'vitest' and 'dotenv' are the only two
//     specifiers it uses, both already pinned exactly (package.json:L36, L42).
//     No dependency is introduced by this file.
//   * `environment: 'node'` (vitest.config.ts:L136), `watch: false` (L154) and
//     `npm test` = `vitest run` (package.json:L18). Nothing here assumes an
//     interactive session or a browser-like environment.
//   * `isolate: true` (vitest.config.ts:L251) gives every test file a fresh
//     module registry. That setting is load-bearing - see R4.
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
//   one of the twenty preserved business-logic defects - so its absence here is
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
//   to tests/unit/domain/entities/brand.test.ts and product.test.ts.
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

// ---------------------------------------------------------------------------
// R1 - UTC, enforced and then verified
// ---------------------------------------------------------------------------

/*
 * Pin the process timezone before this module does anything else.
 *
 * WHY THE PORT NEEDS AN EXPLICIT POLICY AT ALL
 *   Legacy date behaviour depended on the CFML server's timezone.
 *   `PromotionPeriod.isCurrent()` [model/entity/PromotionPeriod.cfc:L78-L81]
 *   reads the ambient clock at L79 and compares start inclusively (`<=`) with
 *   end exclusively (`>`), with no date-validity guard;
 *   `isExpired()` [L83-L85] does guard, and reads the ambient clock AGAIN,
 *   independently. Sale-price expiration comparisons behave the same way. The
 *   target's answer is to widen `isCurrent(now: Date)` with an explicit
 *   instant - the single sanctioned entity-layer widening - so that a suite
 *   states the moment it is testing instead of inheriting one.
 *
 *   Two rules follow for every suite, and they are not optional:
 *     * pass an explicit `now` rather than reading the ambient clock, and
 *     * write every date literal in explicit UTC ISO-8601 form, e.g.
 *       '2024-06-01T00:00:00.000Z' - never a locale-dependent string such as
 *       'June 1, 2024', whose parse is implementation-defined.
 *   This assignment is the safety net under those rules, not a substitute for
 *   them.
 *
 * ON ORDERING, precisely
 *   ECMAScript evaluates a module's `import` declarations before any statement
 *   in its body, so 'dotenv' and 'vitest' are unavoidably initialised first and
 *   no statement in this file can literally run before them. "First" here
 *   therefore means the first EXECUTABLE statement of this module, which is
 *   what this is. That is sufficient, for three specific reasons rather than by
 *   assumption:
 *
 *     1. Neither imported module captures a timezone at import time, and Node
 *        20 honours a change to `process.env.TZ` made after start-up: the
 *        assignment triggers a date-configuration change notification, so the
 *        cached zone is dropped rather than kept.
 *     2. Vitest evaluates its setup files BEFORE the test module they serve, so
 *        every `Date` any suite constructs is created after this line.
 *     3. It precedes the `.env` load below, and that ordering is load-bearing
 *        rather than cosmetic: the loader is deliberately non-overriding, so a
 *        stray `TZ=` line in a developer's local `.env` cannot displace UTC.
 *
 *   Placing this statement textually above the imports was considered and
 *   rejected: it would still not execute first, so it would only look
 *   authoritative without being so.
 */
process.env.TZ = 'UTC';

/*
 * Two instants, deliberately - one in January and one in July.
 *
 * A single winter probe is not enough. `getTimezoneOffset()` is evaluated for
 * the instant it is called on, so a zone that observes summer time while
 * sitting at UTC+00:00 in winter - Europe/London and Atlantic/Canary are the
 * obvious cases - would satisfy a January-only check and then silently shift
 * the local reading of every summer date. Probing both ends of the year closes
 * that gap.
 *
 * `getHours()` is checked alongside the offset because the offset alone proves
 * only the arithmetic; the hour proves that the local calendar reading a suite
 * would actually assert on lands where UTC says it should.
 */
const UTC_WINTER_INSTANT = new Date('2024-01-01T00:00:00.000Z');
const UTC_SUMMER_INSTANT = new Date('2024-07-01T00:00:00.000Z');

if (
  UTC_WINTER_INSTANT.getTimezoneOffset() !== 0 ||
  UTC_SUMMER_INSTANT.getTimezoneOffset() !== 0 ||
  UTC_WINTER_INSTANT.getHours() !== 0 ||
  UTC_SUMMER_INSTANT.getHours() !== 0
) {
  /*
   * A correctness guard, and the only failure this file can raise that is not
   * caused by a malformed variable. Running outside UTC would make every
   * date-sensitive assertion in the suite pass or fail by accident depending on
   * the machine, which is worse than a red run: it is a green run that means
   * nothing.
   *
   * WHEN THIS ACTUALLY FIRES, stated plainly so nobody misreads it as a check
   * on the launching shell. A non-UTC `TZ` in the shell, container or job
   * definition is CORRECTED by the assignment above, because Node 20 honours
   * the change - verified directly: a process started as America/Chicago
   * reports a 360-minute offset before the assignment and 0 after it. So this
   * branch is reached only where the assignment does not take effect, i.e. a
   * runtime that ignores it or an environment object detached from the
   * date-configuration layer. It is a guard against a broken runtime, not
   * against an operator's shell, and it is worth keeping precisely because that
   * failure would otherwise be silent.
   */
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

// ---------------------------------------------------------------------------
// R2 - a local `.env`, loaded best-effort and never fatally
// ---------------------------------------------------------------------------

/*
 * `dotenv` is pinned at 17.4.2 as a devDependency (package.json:L36) precisely
 * because it is a development-time and test-time concern only: the AWS Lambda
 * `nodejs20.x` runtime injects environment variables natively, so this code
 * path never executes in a deployed run. Loading is unambiguously this file's
 * job - `.env.example:L22-L24` records the single test-only key as consumed by
 * `tests/setup.ts`, `src/lib/config.ts:L58-L59` records the same exclusion from
 * the other side, and `vitest.config.ts:L91-L99` states that the runner config
 * deliberately does not reference the loader either.
 *
 * Four properties of this call are chosen, not incidental:
 *
 *   * `quiet: true` suppresses the informational banner that dotenv 17.x prints
 *     otherwise, so a normal run stays clean. A missing `.env` is the NORMAL
 *     case in a fresh checkout and must not look like a problem.
 *   * `override` is deliberately not passed, so it stays at its default of
 *     false and a value already present in the real environment always wins.
 *     That is what makes the UTC pin above unassailable and what keeps values
 *     supplied by an automated environment authoritative over a stale local
 *     file.
 *   * The return value is deliberately ignored. `config()` reports a missing
 *     file by RETURNING an error property rather than throwing, and that is a
 *     normal outcome here, so inspecting it could only lead to reporting a
 *     non-problem.
 *   * Neither the parsed result nor any variable value is read, printed or
 *     serialised. At most this file names a variable.
 */
try {
  config({ quiet: true });
} catch {
  /*
   * Deliberately swallowed, and deliberately silent. This is the complete and
   * intended behaviour, not a deferred one.
   *
   * This is not dead code, and that was established by experiment rather than
   * assumed. Ordinary file trouble does NOT reach here: a missing `.env`, and
   * even a `.env` path that is a directory, are REPORTED through the returned
   * error property (ENOENT and EISDIR respectively). What does reach here is
   * the loader's own validation - a malformed `DOTENV_KEY` alongside a vault
   * file raises INVALID_DOTENV_KEY as a thrown error, confirmed directly - and
   * without this guard that input would abort the entire suite over a load that
   * is optional by contract. The suite is required to pass with a completely
   * empty environment, so a failed OPTIONAL load must never be a failure.
   *
   * Nothing is logged either. The only diagnostic available at this point is
   * the environment itself, and this file never prints environment content.
   * The binding is omitted (`catch` with no parameter) so no unused error
   * variable is introduced.
   */
}

// ---------------------------------------------------------------------------
// R3 - the one test-only flag, normalised into this file's single export
// ---------------------------------------------------------------------------

/**
 * Name of the only environment variable this file interprets.
 *
 * Held as a constant so the lookup below and the diagnostic message share one
 * source of truth. Taken verbatim from `.env.example:L214`, the sole entry in
 * that file's fifth group ("Test-only", L199-L214), which records at L202-L203
 * that it is read only by `tests/setup.ts` and by nothing under `src/**`.
 */
const LIVE_DATABASE_FLAG_NAME = 'TEST_LIVE_DATABASE';

/**
 * Values that ENABLE the flag. Compared case-insensitively, after trimming.
 */
const FLAG_ENABLED_LITERALS: readonly string[] = ['true', '1', 'yes'];

/**
 * Values that DISABLE the flag.
 *
 * The empty string is a member on purpose: `TEST_LIVE_DATABASE=` in a `.env`
 * file is a perfectly ordinary way to write "off", and so is a value that is
 * nothing but whitespace once trimmed. An absent variable is handled separately
 * below, because absence is not a value.
 */
const FLAG_DISABLED_LITERALS: readonly string[] = ['false', '0', 'no', ''];

/**
 * Resolve the test-only live-database flag into a boolean.
 *
 * OPTIONAL, WITH A DOCUMENTED DEFAULT OF DISABLED. Absent means disabled, which
 * is what lets a fresh checkout with no `.env` at all run green.
 *
 * That is deliberately UNLIKE production configuration, and the two must not be
 * conflated. The legacy host chose its ORM dialect with a three-branch
 * case-insensitive substring chain [config/configORM.cfm:L9-L15] - the opening
 * test on L9 and the two alternatives on L11 and L13 - and that chain closes on
 * L15 with NO final else branch of any kind. A database product that matched
 * none of the three therefore left the dialect NEVER ASSIGNED and start-up
 * failed. `.env.example:L121-L125` carries that behaviour forward by giving
 * `DB_DIALECT` no default at all: production configuration is REQUIRED, with a
 * hard error and no silent fallback. This flag is the opposite by design -
 * test-only, optional, and explicitly defaulted.
 *
 * A PRESENT BUT UNRECOGNISED value throws rather than degrading to disabled. A
 * typo must not silently skip the very suites it was set to enable; that would
 * be a green run that proves less than it appears to.
 *
 * WHAT THE FLAG IS FOR, stated plainly so it is not misread as an invitation:
 * the six suites under `tests/integration/repositories/` must not require a
 * live MySQL server at all. They assert generated SQL text and bound parameters
 * against a recording test double substituted for the pool or executor, which
 * is exactly what `vitest.config.ts:L190-L194` and `.env.example:L205-L209`
 * both state. This flag exists as a documented escape hatch for any suite that
 * would ever genuinely need a real database - it is not a licence to write one,
 * and it is never a substitute for gating on a connection written into source.
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

/**
 * Whether suites that would need a real MySQL server may run.
 *
 * The ONLY export of this module, and an immutable binding computed once at
 * setup time from the environment. A suite that genuinely needs a live server
 * imports this and skips itself when it is `false`; it never reaches for a
 * connection detail of its own.
 *
 * `false` in every default checkout, because the variable is absent or `false`
 * there. The integration tier does not consult it at all - that tier needs no
 * server.
 */
export const liveDatabaseTestsEnabled: boolean = resolveLiveDatabaseTestsEnabled(
  process.env[LIVE_DATABASE_FLAG_NAME],
);

// ---------------------------------------------------------------------------
// R4 - per-test hygiene: nothing survives a test that should not
// ---------------------------------------------------------------------------

/*
 * WHY THIS HOOK EXISTS AT ALL
 *   State that outlives its test is the failure mode this port was designed
 *   against. Four legacy component-level caches become request-scoped here
 *   rather than module-scoped, because module-level state survives between
 *   unrelated invocations on a warm Lambda container:
 *
 *     [model/dao/SkuDAO.cfc:L204-L220]  a next-sort-order value seeded from
 *       `SELECT max(SwOptionGroup.sortOrder) as max FROM SwOptionGroup` and
 *       then never cleared, because the clearing method at L222-L226 guards
 *       its own removal with an inverted existence test and so can never fire.
 *     [model/service/RoundingRuleService.cfc:L67-L77]  a rounding-rule detail
 *       memo, which becomes request-scoped.
 *     [model/service/PromotionService.cfc:L1007, L1009]  a discount accumulator
 *       assigned without `var` on both lines, leaking into component scope.
 *       This is deliberate divergence (a): it is made function-local, because
 *       shared mutable state persisting across warm invocations could leak one
 *       customer's discount into another's order.
 *     every entity memo, including the currency-details, live-price and
 *       brand-name caches.
 *
 *   A test tier that let spies or a fake clock cross a test boundary would mask
 *   exactly that class of bug.
 *
 * WHAT IS AND IS NOT ALREADY COVERED BY CONFIGURATION - stated honestly
 *   `vitest.config.ts:L287-L290` already sets `clearMocks`, `restoreMocks`,
 *   `unstubEnvs` and `unstubGlobals`, so the restore half below is
 *   belt-and-braces and is kept as an explicit, local statement of intent. The
 *   timer half is NOT covered by any configuration option, which is the hook's
 *   real justification: a suite that opts into a fake clock must not be able to
 *   leak it into the next test.
 *
 *   No fake timer is installed here. Timer control is a per-suite decision;
 *   this only guarantees the clock is real again once a test ends.
 *
 * NO MUTABLE MODULE STATE IN THIS FILE
 *   There is no cache, no counter, no shared subject and no registry here. The
 *   sole export is an immutable binding computed once, and the three constants
 *   above it are immutable too. Per-test subjects are constructed inside each
 *   suite, exactly as the legacy harness re-created its subject before every
 *   test [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67].
 *
 * PER-FILE ISOLATION MUST STAY ON
 *   `vitest.config.ts:L251` sets `isolate: true`, giving every test file a
 *   fresh module registry. It must never be switched off, and no suite may rely
 *   on state surviving between test files. The assertion that makes deliberate
 *   divergence (a) meaningful is a suite proving that a second, independent
 *   invocation does not observe the first invocation's memo. This file enables
 *   that assertion by keeping isolation intact; it does not implement it.
 */
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
//     service reads and writes the EXISTING `Sw*` tables unchanged, with no
//     migration, rename, new table or column change, and there is no
//     schema-management tooling in the dependency set to perform one with.
// ---------------------------------------------------------------------------
