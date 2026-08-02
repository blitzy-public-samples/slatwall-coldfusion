/* =====================================================================================================
 * src/config/env.ts — the GOOGLE_FEED_HOST authority rule, exercised through the real module-load path.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — review findings F13 and F1.
 *
 * WHY THIS FILE EXISTS AT ALL. Before it, `GOOGLE_FEED_HOST` appeared NOWHERE under test/ — a grep for
 * the name returned nothing — so the variable that composes every absolute URL in the anonymous public
 * Google feed had no coverage of any kind. Review finding F13 raises that gap in its documentation form:
 * `.env.example` described a trust boundary that no code enforced. Closing the finding therefore needed
 * BOTH the rule in `src/config/env.ts` and this suite, because a rule with no test is exactly how the
 * previous claim came to be false without anyone noticing.
 *
 * WHAT THE RULE IS, AND WHERE IT COMES FROM. RFC 9110 §7.2 defines the HTTP `Host` field as
 * `uri-host [ ":" port ]`, adopting RFC 3986 §3.2.2's `host` production and §3.2.3's `port`, and requires
 * that userinfo and its `@` be excluded. The legacy view composed its URLs from `CGI.HTTP_HOST`
 * (`integrationServices/google/views/feed/product.cfm:L22`), so a value outside that production could
 * never have been the input the legacy was designed to accept. The rule is a TRANSCRIBED GRAMMAR, not an
 * invented policy — which is the distinction AAP §0.8.2 guideline 4 turns on. An allowlist, a DNS-label
 * length ceiling and a membership gate would all be invented policy, and all three stay withdrawn.
 *
 * ⛔ WHAT THIS SUITE DOES NOT ASSERT. That the configured host is the RIGHT host. Shape is checkable
 * against a published production; identity is not, and inventing an identity check here would be the
 * enhancement guideline 4 forbids. The residual origin-rebasing exposure stays flagged in
 * `src/handlers/googleFeedHandler.ts` rather than closed.
 *
 * HOW THE MODULE IS REACHED. `src/config/env.ts` exports one value — `config` — and builds it as a
 * MODULE-LOAD SIDE EFFECT, with no reload, override or reset entry point. That is deliberate in the
 * source, so the suite does not add one: it mutates `process.env`, resets the module registry and
 * `require`s the module inside a `try`/`catch`. Every acceptance and every refusal below is therefore
 * observed through the same path a cold Lambda container takes, not through an exported helper written
 * for the test's convenience.
 *
 * ⚠️ THE TYPE IMPORT MUST STAY TYPE-ONLY. A value import of this module would execute `loadConfig()` at
 * suite load, before any variable is set, and every case in the file would fail on the same error. Only
 * `import type` is used, and it is erased by the transform.
 *
 * PROVENANCE: every case is NET-NEW. AAP §0.6.5.2 records that no legacy test covers configuration
 * loading, and the legacy has no configuration loader to cover — the datasource name is a literal in
 * `config/configApplication.cfm:L2` and the ORM dialect is probed at runtime in `config/configORM.cfm`.
 * ================================================================================================== */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AppConfig } from '../../src/config/env';

/* -----------------------------------------------------------------------------------------------------
 * Harness.
 * -------------------------------------------------------------------------------------------------- */

/** Resolved relative to this file so the suite is invocation-directory independent. */
const ENV_MODULE_PATH = '../../src/config/env';

/** `.env.example` is the operator-facing document review finding F13 is about. */
const ENV_EXAMPLE_PATH = join(__dirname, '..', '..', '.env.example');

/**
 * Every variable the loader reads, required and optional alike.
 *
 * The list is exhaustive on purpose: each case clears ALL of them before applying its own base, so a
 * value left behind by an earlier case cannot make a later one pass. It is also the reason a variable
 * added to the loader without being added here would show up as a surprising cross-case dependency
 * rather than as a silent pass.
 */
const LOADER_VARIABLE_NAMES: readonly string[] = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_TLS_MODE',
  'DB_CONNECTION_LIMIT',
  'DB_QUEUE_LIMIT',
  'DB_CONNECT_TIMEOUT_MS',
  'GOOGLE_FEED_HOST',
  'SETTING_APPLICATION_ROOT_MAPPING_PATH',
  'SETTING_SKU_ELIGIBLE_CURRENCIES',
  'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',
];

/**
 * A base that satisfies every OTHER required variable, so a failure can only be the one under test.
 *
 * `DB_QUEUE_LIMIT` is `'1'` rather than `'0'`: the loader enforces a floor of 1, and `mysql2` reads `0`
 * as its own "no limit" sentinel, so the driver's sentinel is deliberately not expressible. A first draft
 * of this harness used `'0'` and every acceptance case failed on that variable instead of the host — the
 * kind of harness bug that reads as a source bug, which is why the value is called out here.
 */
const REQUIRED_BASE_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'Slatwall',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'slatwall_pw',
  DB_TLS_MODE: 'disabled',
  DB_CONNECTION_LIMIT: '10',
  DB_QUEUE_LIMIT: '1',
  DB_CONNECT_TIMEOUT_MS: '10000',
  GOOGLE_FEED_HOST: 'catalog.example.test',
});

const ORIGINAL_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.freeze({
  ...process.env,
});

/**
 * Load `src/config/env.ts` afresh with `overrides` applied over the valid base.
 *
 * @param overrides values to set; an explicit `undefined` UNSETS the variable rather than blanking it,
 *   which is the distinction the loader's absent-versus-empty handling turns on
 * @returns the freshly built configuration
 * @throws whatever the loader throws, unchanged, so each case can assert on it directly
 */
function loadConfigWith(overrides: Readonly<Record<string, string | undefined>> = {}): AppConfig {
  for (const name of LOADER_VARIABLE_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, REQUIRED_BASE_ENVIRONMENT);
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  jest.resetModules();

  /*
   * The module builds `config` as a load-time side effect and exposes no reload entry point, so a fresh
   * `require` after `jest.resetModules()` is the only way to observe a different environment. A static
   * import would bind one snapshot for the whole file, which is precisely the property this suite has to
   * defeat. The rule is disabled for this one expression and nowhere else.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(ENV_MODULE_PATH) as { readonly config: AppConfig };
  return loaded.config;
}

/** The rejection a case produced, or `undefined` when the loader accepted the value. */
function captureLoadFailure(overrides: Readonly<Record<string, string | undefined>>): unknown {
  try {
    loadConfigWith(overrides);
    return undefined;
  } catch (failure: unknown) {
    return failure;
  }
}

/**
 * Assert a rejection is the loader's own typed failure, naming the variable.
 *
 * `instanceof DomainError` is deliberately NOT used. `jest.resetModules()` gives the re-required module a
 * fresh registry, so the `DomainError` class the loader throws is a DIFFERENT class object from one this
 * file could import — an identity check would fail for a reason that has nothing to do with the rule. The
 * `name` and `context` assertions carry the same information without that trap.
 */
function expectVariableRejection(failure: unknown, variableName: string): void {
  expect(failure).toBeInstanceOf(Error);
  const error = failure as Error & { readonly context?: Readonly<Record<string, unknown>> };
  expect(error.name).toBe('DomainError');
  expect(error.message).toContain(variableName);
  expect(error.context).toMatchObject({ variable: variableName });
}

beforeEach(() => {
  jest.resetModules();
});

afterAll(() => {
  for (const name of LOADER_VARIABLE_NAMES) {
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(ORIGINAL_ENVIRONMENT)) {
    if (value !== undefined) {
      process.env[name] = value;
    }
  }
  jest.resetModules();
});

/* =====================================================================================================
 * §1 — Values inside the RFC 3986 §3.2.2 production are accepted, VERBATIM.
 * ================================================================================================== */

describe('NET-NEW env — GOOGLE_FEED_HOST accepts the host production', () => {
  it.each([
    ['a registered name', 'store.example.com'],
    ['a registered name with a port', 'store.example.com:8080'],
    ['an IPv4 literal', '192.0.2.10'],
    ['an IPv4 literal with a port', '192.0.2.10:80'],
    ['a bracketed IPv6 loopback', '[::1]'],
    ['a bracketed IPv6 literal with a port', '[2001:db8::1]:8443'],
    ['a fully expanded bracketed IPv6 literal', '[0:0:0:0:0:0:0:1]'],
    ['a single-label name', 'localhost'],
    ['an IDNA A-label', 'xn--bcher-kva.example'],
    ['a percent-encoded octet', 'store%20a.example'],
    ['sub-delimiters a reg-name admits', "a&b'c.example"],
  ])('[NET-NEW] accepts %s and stores it unchanged', (_description: string, host: string) => {
    /*
     * ⭐ STORED UNCHANGED IS PART OF THE CONTRACT, NOT AN INCIDENTAL DETAIL.
     *
     * No trim, no lowercase, no bracket stripping and no percent-decoding. The value is composed
     * verbatim into `http://<host>` by `src/integrations/google/ProductFeedBuilder.ts`, so any
     * normalisation here would silently change every URL the feed publishes. Whitespace does not need
     * trimming because space is outside `reg-name` and is refused in §2 instead.
     */
    expect(loadConfigWith({ GOOGLE_FEED_HOST: host }).googleFeed.host).toBe(host);
  });

  it('[NET-NEW] accepts sub-delimiters here precisely because the serializer encodes them', () => {
    /*
     * ⭐ THE TWO-LAYER SPLIT, ASSERTED RATHER THAN DESCRIBED.
     *
     * `&` and `'` are legal in an RFC 3986 `reg-name`, so refusing them here would reject a CONFORMING
     * host — an invented policy. They are also XML metacharacters, so emitting them raw would break the
     * document. Both facts are true at once, and the resolution is that GRAMMAR is owned here while
     * ENCODING is owned by the serializer. This case pins the first half; the second half is pinned by
     * `test/integrations/ProductFeedBuilder.test.ts`'s hostile-host block, which renders this exact value
     * and requires it escaped at all five sites that compose it.
     */
    expect(loadConfigWith({ GOOGLE_FEED_HOST: "a&b'c.example" }).googleFeed.host).toBe(
      "a&b'c.example",
    );
  });
});

/* =====================================================================================================
 * §2 — Values outside the production are refused, at module load.
 * ================================================================================================== */

describe('NET-NEW env — GOOGLE_FEED_HOST refuses everything outside the host production', () => {
  it.each([
    ['a scheme prefix', 'http://store.example.com'],
    ['a path', 'store.example.com/feed'],
    ['a userinfo prefix', 'user:pass@store.example.com'],
    ['a query', 'store.example.com?a=b'],
    ['a fragment', 'store.example.com#frag'],
    ['embedded whitespace and markup', 'store.example.com </channel>'],
    ['a bare markup payload', '"><script>'],
    ['leading whitespace', ' store.example.com'],
    ['trailing whitespace', 'store.example.com '],
    ['an unbracketed IPv6 literal', '::1'],
    ['an unterminated bracket', '[::1'],
    ['trailing text after the bracket', '[::1]extra:80'],
    ['a truncated percent-encoding', 'store.example.com%2'],
    ['an RFC 6874 zone identifier', '[fe80::1%eth0]'],
  ])('[NET-NEW] refuses %s', (_description: string, host: string) => {
    expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: host }), 'GOOGLE_FEED_HOST');
  });

  it('[NET-NEW] refuses a zone identifier even though node accepts it as an IPv6 address', () => {
    /*
     * ⭐ MEASURED, NOT ASSUMED — and the reason the rule pairs a character-class test with the parser.
     *
     * `node:net`'s `isIPv6('fe80::1%eth0')` answers TRUE: it accepts RFC 6874's `IPv6addrz` form, which
     * RFC 3986 §3.2.2 does not admit. Had the rule delegated to the parser alone, a zone identifier —
     * `%` and arbitrary following text — would have passed into the URL composition. This case exists
     * because the empirical probe contradicted the obvious implementation.
     */
    expectVariableRejection(
      captureLoadFailure({ GOOGLE_FEED_HOST: '[fe80::1%eth0]' }),
      'GOOGLE_FEED_HOST',
    );
    /* The same address WITHOUT the zone identifier is accepted, so the refusal is the `%eth0`, not IPv6. */
    expect(loadConfigWith({ GOOGLE_FEED_HOST: '[fe80::1]' }).googleFeed.host).toBe('[fe80::1]');
  });

  it('[NET-NEW] refuses an absent variable and a blank one, separately', () => {
    /* Absent and empty are distinct states, and the loader must refuse both — an empty host would
     * compose `http://` followed by nothing and publish a feed of unusable links. */
    expectVariableRejection(
      captureLoadFailure({ GOOGLE_FEED_HOST: undefined }),
      'GOOGLE_FEED_HOST',
    );
    expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: '' }), 'GOOGLE_FEED_HOST');
    expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: '   ' }), 'GOOGLE_FEED_HOST');
  });
});

/* =====================================================================================================
 * §3 — The port sub-rule, from RFC 3986 §3.2.3 narrowed to the addressable range.
 * ================================================================================================== */

describe('NET-NEW env — GOOGLE_FEED_HOST port sub-rule', () => {
  it.each([
    ['the lowest addressable port', 'store.example.com:1'],
    ['the highest addressable port', 'store.example.com:65535'],
  ])('[NET-NEW] accepts %s', (_description: string, host: string) => {
    expect(loadConfigWith({ GOOGLE_FEED_HOST: host }).googleFeed.host).toBe(host);
  });

  it.each([
    ['zero', 'store.example.com:0'],
    ['one past the 16-bit ceiling', 'store.example.com:65536'],
    ['a trailing non-digit', 'store.example.com:80x'],
    ['an empty port', 'store.example.com:'],
    ['two ports', 'store.example.com:8080:9090'],
    ['a signed port', 'store.example.com:+80'],
    ['a hexadecimal port', 'store.example.com:0x50'],
  ])('[NET-NEW] refuses %s', (_description: string, host: string) => {
    /*
     * RFC 3986 §3.2.3 writes `port = *DIGIT`, which admits both an empty port and numbers no transport
     * can address. The narrowing to 1–65535 is the same published 16-bit protocol limit the loader
     * already applies to `DB_PORT` — a standard, not a figure invented here (AAP §0.7.3 S9, IR-12).
     *
     * The digit-pattern test runs BEFORE `Number()` because JavaScript's numeric coercion is far too
     * permissive for a port: `Number('+80')` is 80 and `Number('0x50')` is 80, so a pattern-free
     * implementation would accept both of these as port 80.
     */
    expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: host }), 'GOOGLE_FEED_HOST');
  });

  it('[NET-NEW] reports a scheme prefix and a userinfo prefix through the port rule, by design', () => {
    /*
     * The FIRST colon of an unbracketed value is the port separator, so `http://store.example.com` and
     * `user:pass@store.example.com` are both diagnosed as an unaddressable port rather than as a bad
     * host. That is a consequence of the grammar rather than a shortcoming, so the port message names
     * both cases explicitly instead of leaving an operator to work out why a scheme is "a port".
     */
    const schemeFailure = captureLoadFailure({ GOOGLE_FEED_HOST: 'http://store.example.com' });
    expectVariableRejection(schemeFailure, 'GOOGLE_FEED_HOST');
    expect((schemeFailure as Error).message).toContain('http://');

    const userinfoFailure = captureLoadFailure({
      GOOGLE_FEED_HOST: 'user:pass@store.example.com',
    });
    expectVariableRejection(userinfoFailure, 'GOOGLE_FEED_HOST');
    expect((userinfoFailure as Error).message).toContain('user:password@');
  });
});

/* =====================================================================================================
 * §4 — A platform fact worth recording, and the rule's blast radius.
 * ================================================================================================== */

describe('NET-NEW env — platform behaviour and blast radius', () => {
  it('[NET-NEW] refuses a NUL byte on its own terms, without relying on the platform to strip it', () => {
    /*
     * ⚠️ TWO DIFFERENT `process.env` OBJECTS, MEASURED RATHER THAN ASSUMED — and the reason this case is
     * phrased as a refusal instead of as a truncation.
     *
     * On a real Node runtime `process.env` is libuv-backed and coerces on assignment: `'a\u0000b'` is
     * stored as `'a'`, length 1, so a NUL-bearing host could never reach the rule in production. A first
     * draft of this case asserted exactly that and expected the load to SUCCEED with the truncated value.
     * It failed, because under Jest `process.env` is an ordinary object inside the module sandbox and the
     * NUL survives with length 3 — verified by direct probe in both environments.
     *
     * That divergence is what makes the refusal the right thing to pin. The rule does not depend on either
     * platform behaviour: `\u0000` is outside `reg-name`, so the value is refused wherever it arrives
     * intact. Asserting the truncation would have pinned the harness's environment rather than the rule's
     * contract, and would have quietly passed had the character-class test been removed.
     */
    process.env['GOOGLE_FEED_HOST'] = 'store\u0000.example.com';
    /* The sandbox preserved it, so the rule is genuinely being asked about a NUL rather than about a
     * value the platform already shortened. On a real runtime this length would be 5. */
    expect(process.env['GOOGLE_FEED_HOST']).toHaveLength('store\u0000.example.com'.length);

    expectVariableRejection(
      captureLoadFailure({ GOOGLE_FEED_HOST: 'store\u0000.example.com' }),
      'GOOGLE_FEED_HOST',
    );
    /* Every other C0 control character is refused for the same reason, including the two a naive
     * whitespace trim would have removed before any grammar test could see them. */
    for (const control of ['\u0000', '\u0009', '\u000a', '\u000d', '\u001f', '\u007f']) {
      expectVariableRejection(
        captureLoadFailure({ GOOGLE_FEED_HOST: `store${control}.example.com` }),
        'GOOGLE_FEED_HOST',
      );
    }
  });

  it('[NET-NEW] the rule is scoped to GOOGLE_FEED_HOST and does not touch DB_HOST', () => {
    /*
     * ⛔ BLAST RADIUS, STATED AS A CASE. `DB_HOST` is read through `requireNonBlankValue` and reaches a
     * driver that connects to it, never a document that renders it, so applying an authority grammar to
     * it would be an invented policy with no defect behind it. A unix socket path and a bracket-free IPv6
     * address are both legitimate `mysql2` hosts and both fall outside RFC 3986 §3.2.2.
     *
     * `DB_TLS_MODE` moves to `verified` here because neither value is a loopback literal and the loader
     * refuses cleartext to a non-loopback host — an unrelated rule that would otherwise mask this one.
     */
    expect(
      loadConfigWith({ DB_HOST: '/var/run/mysqld/mysqld.sock', DB_TLS_MODE: 'verified' }).database
        .host,
    ).toBe('/var/run/mysqld/mysqld.sock');
    expect(
      loadConfigWith({ DB_HOST: 'db.internal.example', DB_TLS_MODE: 'verified' }).database.host,
    ).toBe('db.internal.example');
  });

  it('[NET-NEW] a valid environment yields a frozen configuration with the feed host in place', () => {
    const config = loadConfigWith();

    expect(config.googleFeed.host).toBe('catalog.example.test');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.googleFeed)).toBe(true);
  });
});

/* =====================================================================================================
 * §5 — Documentation parity — the operator-facing half of review finding F13.
 *
 * Finding F13 is a DOCUMENTATION defect: `.env.example` asserted a trust boundary the code did not
 * enforce, and the review's AAP requirement 7 ("security translation documentation must match
 * implementation") failed on it. Fixing the prose is not enough on its own, because prose drifts back.
 * These cases make the agreement machine-checked, in both directions: the document must cite the rule
 * that now exists, and must no longer carry the two claims that were false.
 * ================================================================================================== */

describe('NET-NEW env — .env.example matches what GOOGLE_FEED_HOST actually enforces', () => {
  const envExample = readFileSync(ENV_EXAMPLE_PATH, 'utf8');

  it('[NET-NEW] states the enforced grammar and where it runs', () => {
    expect(envExample).toContain('GOOGLE_FEED_HOST');
    /* The published productions the rule transcribes, named so an operator can check it. */
    expect(envExample).toContain('RFC 3986');
    expect(envExample).toContain('3.2.2');
    expect(envExample).toContain('3.2.3');
    /* And where it runs, which is module load rather than the render path. */
    expect(envExample).toContain('src/config/env.ts');
  });

  it('[NET-NEW] no longer claims the feed builder validates the host', () => {
    /*
     * The two false claims review finding F13 quotes. The first attributed a validator to the builder
     * that does not exist there; the second cited a withdrawn decision block as the authority for a
     * refusal nothing performed. Neither may reappear.
     */
    expect(envExample).not.toContain('validator refuses');
    expect(envExample).not.toContain('DECISION G-1');
  });

  it('[NET-NEW] still says plainly that host IDENTITY is not checked anywhere', () => {
    /*
     * ⚠️ The residual exposure must stay documented. A rule that checks SHAPE is not a rule that checks
     * WHICH host, and an operator who reads the new grammar paragraph as "the host is verified" would be
     * misled in the opposite direction from the original defect. Overclaiming is the same class of
     * documentation failure as underclaiming.
     */
    expect(envExample).toContain('NOT ENFORCED');
  });
});
