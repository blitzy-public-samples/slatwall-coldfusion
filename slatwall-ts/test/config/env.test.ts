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
 * `instanceof ConfigurationError` is deliberately NOT used. `jest.resetModules()` gives the re-required
 * module a fresh registry, so the class the loader throws is a DIFFERENT class object from one this file
 * could import — an identity check would fail for a reason that has nothing to do with the rule. The
 * `name` and `context` assertions carry the same information without that trap.
 *
 * ⭐ THE NAME IS `ConfigurationError` AND THAT IS ITSELF THE ASSERTION. `../../src/errors/DomainError.ts`
 * declares `ConfigurationError` for this category and presents it as `SERVICE_CONFIGURATION`, while the
 * base `DomainError` presents as `SERVICE_FAULT`; `../../src/handlers/httpResponse.ts` reads the
 * difference. The loader used to throw the base class, which classified the CANONICAL configuration
 * failures as generic faults while `StaticSettingResolver` already threw the specific one for the
 * analogous failure. Pinning the name here is what stops that drifting back.
 */
function expectVariableRejection(failure: unknown, variableName: string): void {
  expect(failure).toBeInstanceOf(Error);
  const error = failure as Error & { readonly context?: Readonly<Record<string, unknown>> };
  expect(error.name).toBe('ConfigurationError');
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

  it('[NET-NEW] DB_HOST is held to its own MySQL-host grammar, which differs in three stated ways', () => {
    /*
     * ⭐ WHY THIS CASE CHANGED. It used to assert the OPPOSITE — that `DB_HOST` was read through
     * `requireNonBlankValue` and that applying a grammar to it "would be an invented policy with no
     * defect behind it". A QA pass then demonstrated the defect: `mysql://10.0.0.1`,
     * `user:pw@10.0.0.1`, a trailing newline and a non-ASCII name all LOADED, in the one module whose
     * purpose is typed validation with descriptive errors, and surfaced later as an opaque driver
     * connect failure. The grammar is now applied, and the two shapes the old rationale correctly
     * identified as legitimate are both still accepted — one of them by an explicit branch written for
     * it.
     *
     * `DB_TLS_MODE` is set to `verified` wherever the host is not a loopback literal, because the
     * loader refuses cleartext to a non-loopback host — an unrelated rule that would otherwise mask
     * this one.
     */

    /* (1) A registered name, which is the ordinary case. */
    expect(
      loadConfigWith({ DB_HOST: 'db.internal.example', DB_TLS_MODE: 'verified' }).database.host,
    ).toBe('db.internal.example');

    /* (2) A BARE, bracket-free IPv6 address — a legitimate `mysql2` host, outside RFC 3986 §3.2.2, and
     * accepted here by the explicit `isIPv6` branch. Refusing it would break the loopback transport
     * rule for `::1`, which is the one arrangement that rule exists to serve. */
    expect(loadConfigWith({ DB_HOST: '::1', DB_TLS_MODE: 'disabled' }).database.host).toBe('::1');
    expect(loadConfigWith({ DB_HOST: '2001:db8::1', DB_TLS_MODE: 'verified' }).database.host).toBe(
      '2001:db8::1',
    );

    /* (3) And the bracketed form, so an operator who writes the URI-style literal is not penalised. */
    expect(loadConfigWith({ DB_HOST: '[::1]', DB_TLS_MODE: 'disabled' }).database.host).toBe(
      '[::1]',
    );
  });

  it.each([
    ['a scheme prefix', 'mysql://10.255.255.1'],
    ['a userinfo prefix', 'user:pw@10.255.255.1'],
    ['a port suffix, which belongs in DB_PORT', 'db.internal.example:3306'],
    ['a trailing newline', '10.255.255.1\n'],
    ['a leading space', ' 10.255.255.1'],
    ['a non-ASCII registered name', 'dörterbank.qa000.invalid'],
    ['a path', 'db.internal.example/schema'],
    ['a filesystem socket path', '/var/run/mysqld/mysqld.sock'],
    ['embedded markup', 'db<script>.example'],
  ])('[NET-NEW] DB_HOST refuses %s', (_situation, host) => {
    /* Every one of the first four and the sixth was accepted before the rule existed; the QA pass that
     * found them lists the first, second, fourth and sixth by name. The socket path is refused with a
     * message that explains why: `src/config/database.ts` configures no socket option, so a path would
     * be resolved as a hostname and fail to connect — it could never have worked. */
    expectVariableRejection(
      captureLoadFailure({ DB_HOST: host, DB_TLS_MODE: 'verified' }),
      'DB_HOST',
    );
  });

  it('[NET-NEW] the six TLS-guard bypass shapes are still refused, grammar or no grammar', () => {
    /* A QA pass probed each of these against the loopback exemption and found no path to an unencrypted
     * non-loopback session. The new host grammar must not open one: `0.0.0.0` and `127.0.0.999` are
     * syntactically fine registered names and are refused by the LOOPBACK rule instead, while
     * `127.0.0.1@evil.invalid` is now refused by the grammar. Either refusal is acceptable; being
     * accepted is not. */
    for (const host of [
      '0.0.0.0',
      '127.0.0.1.evil.invalid',
      '127.0.0.1@evil.invalid',
      'localhost.evil.invalid',
      '127.0.0.999',
      '127.1',
    ]) {
      expect(captureLoadFailure({ DB_HOST: host, DB_TLS_MODE: 'disabled' })).toBeInstanceOf(Error);
    }

    /* And the genuine loopback literals still pass, which is the other half of the same guarantee. */
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
      expect(loadConfigWith({ DB_HOST: host, DB_TLS_MODE: 'disabled' }).database.host).toBe(host);
    }
  });

  it('[NET-NEW] a valid environment yields a frozen configuration with the feed host in place', () => {
    const config = loadConfigWith();

    expect(config.googleFeed.host).toBe('catalog.example.test');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.googleFeed)).toBe(true);
  });

  it('[NET-NEW] DB_NAME is bounded by the MySQL identifier limit, the other half of the same finding', () => {
    /*
     * ⭐ THE SAME QA EDGE CASE THAT PRODUCED THE DB_HOST GRAMMAR ABOVE ALSO RECORDED A `DB_NAME` OF 4096
     * CHARACTERS AS ACCEPTED. Both halves came from one root cause — this module validated the feed host
     * carefully and its neighbouring connection coordinates barely at all — so both are pinned here.
     *
     * MySQL documents 64 characters as the maximum length of a database identifier, so a longer value
     * cannot name a schema on ANY server. The bound is therefore the server's, not one chosen here: it
     * refuses only values that provably cannot be what they claim to be, which is what keeps it clear of
     * IR-12. Accepting them instead deferred the failure to the first query, where the driver reports an
     * unknown-database error naming neither this variable nor the environment.
     */
    const atTheLimit = 'a'.repeat(64);
    expect(loadConfigWith({ DB_NAME: atTheLimit }).database.database).toBe(atTheLimit);

    /* One character past it is refused, and the message names DB_NAME rather than the value. */
    expectVariableRejection(captureLoadFailure({ DB_NAME: 'a'.repeat(65) }), 'DB_NAME');
    expectVariableRejection(captureLoadFailure({ DB_NAME: 'a'.repeat(4096) }), 'DB_NAME');

    /*
     * ⛔ AND THE CHECK IS LENGTH-ONLY, DELIBERATELY. The `Sw*` schema is the fixed contract both systems
     * share and this port neither creates nor migrates it, while MySQL permits a wide character range in
     * a quoted identifier — so a name that genuinely exists must still load, however unusual it looks.
     * Screening characters here would risk refusing a real schema, which is the worse failure.
     */
    for (const unusualButLegal of [
      'slatwall-prod',
      'slatwall.v2',
      'Slatwall 3',
      '_slatwall',
      'sw$1',
    ]) {
      expect(loadConfigWith({ DB_NAME: unusualButLegal }).database.database).toBe(unusualButLegal);
    }

    /* The pre-existing non-blank rule is unchanged: absence and blankness still fail on their own terms. */
    expectVariableRejection(captureLoadFailure({ DB_NAME: undefined }), 'DB_NAME');
    expectVariableRejection(captureLoadFailure({ DB_NAME: '   ' }), 'DB_NAME');
  });
});

/* =====================================================================================================
 * §4a — The boot contract: five variables required, four optional with stated fallbacks.
 *
 * A QA pass found the loader requiring NINE `DB_*` variables where AAP §0.4.1.3 documents five and says
 * pool settings are "not carried over", so a deployment configured exactly to the plan failed closed at
 * cold start. These cases pin the contract as it now stands, in both directions: the five that must be
 * supplied, and the four whose absence resolves to something safe rather than to a boot failure.
 * ================================================================================================== */

describe('NET-NEW env — the five-variable boot contract', () => {
  /** Exactly the keys AAP §0.4.1.3 documents, and nothing else. */
  const FIVE_KEY_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.freeze({
    DB_TLS_MODE: undefined,
    DB_CONNECTION_LIMIT: undefined,
    DB_QUEUE_LIMIT: undefined,
    DB_CONNECT_TIMEOUT_MS: undefined,
  });

  it('[NET-NEW] loads with only DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and the feed host', () => {
    const config = loadConfigWith(FIVE_KEY_ENVIRONMENT);

    /* The five stated values arrive verbatim — nothing is defaulted for a connection target or an
     * identity, which is the half of the contract that must NOT relax. */
    expect(config.database.host).toBe('localhost');
    expect(config.database.port).toBe(3306);
    expect(config.database.database).toBe('Slatwall');
    expect(config.database.user).toBe('slatwall');
    expect(config.database.password).toBe('slatwall_pw');
  });

  it('[NET-NEW] an unset transport mode resolves to the verified one, never to cleartext', () => {
    /* The fail-safe direction. `localhost` IS a loopback literal, so `disabled` would have been legal
     * here — the point is that absence does not choose it. */
    expect(loadConfigWith(FIVE_KEY_ENVIRONMENT).database.tlsMode).toBe('verified');

    /* And for a remote host, where cleartext is refused outright, absence is still `verified` rather
     * than a boot failure. */
    expect(
      loadConfigWith({ ...FIVE_KEY_ENVIRONMENT, DB_HOST: 'db.internal.example' }).database.tlsMode,
    ).toBe('verified');
  });

  it('[NET-NEW] an unset queue bound resolves to the declared floor, never to the unbounded sentinel', () => {
    /* This is the one bound that cannot be delegated: `mysql2` reads zero as "no limit" AND zero is its
     * default, so omitting the option would select an unbounded queue of waiting requests. The fallback
     * is the floor the loader already enforces for a supplied value — no new figure. */
    expect(loadConfigWith(FIVE_KEY_ENVIRONMENT).database.queueLimit).toBe(1);
    expect(loadConfigWith(FIVE_KEY_ENVIRONMENT).database.queueLimit).not.toBe(0);
  });

  it('[NET-NEW] an unset connection limit and connect timeout are OMITTED, not defaulted', () => {
    const database = loadConfigWith(FIVE_KEY_ENVIRONMENT).database;

    /* Absent members, not members holding `undefined`: `src/config/database.ts` spreads them, so an
     * absent member means the driver option is left off entirely and the driver's own bounded default
     * applies. That is what lets this port state no number at all (IR-12). */
    expect(Object.hasOwn(database, 'connectionLimit')).toBe(false);
    expect(Object.hasOwn(database, 'connectTimeoutMs')).toBe(false);
  });

  it('[NET-NEW] a supplied optional value is still honoured verbatim and still validated', () => {
    const database = loadConfigWith({
      DB_CONNECTION_LIMIT: '7',
      DB_QUEUE_LIMIT: '9',
      DB_CONNECT_TIMEOUT_MS: '4321',
      DB_TLS_MODE: 'disabled',
    }).database;

    expect(database.connectionLimit).toBe(7);
    expect(database.queueLimit).toBe(9);
    expect(database.connectTimeoutMs).toBe(4321);
    expect(database.tlsMode).toBe('disabled');

    /* Optional does not mean lenient: a present-but-bad value is still refused, and the zero sentinel is
     * still rejected rather than quietly replaced by the floor. */
    expectVariableRejection(captureLoadFailure({ DB_QUEUE_LIMIT: '0' }), 'DB_QUEUE_LIMIT');
    expectVariableRejection(
      captureLoadFailure({ DB_CONNECTION_LIMIT: 'ten' }),
      'DB_CONNECTION_LIMIT',
    );
    expectVariableRejection(captureLoadFailure({ DB_TLS_MODE: 'require' }), 'DB_TLS_MODE');
    /* Blank is a misconfiguration rather than a way to say "unset", for an optional key as much as a
     * required one. */
    expectVariableRejection(
      captureLoadFailure({ DB_CONNECT_TIMEOUT_MS: '   ' }),
      'DB_CONNECT_TIMEOUT_MS',
    );
  });

  it.each([
    ['DB_HOST'],
    ['DB_PORT'],
    ['DB_NAME'],
    ['DB_USER'],
    ['DB_PASSWORD'],
    ['GOOGLE_FEED_HOST'],
  ])('[NET-NEW] %s is still required, and its absence names it', (variableName) => {
    /* The other half of the contract. Relaxing the four optional keys must not relax these six, and each
     * failure still names the variable and leaks no value. */
    expectVariableRejection(
      captureLoadFailure({ ...FIVE_KEY_ENVIRONMENT, [variableName]: undefined }),
      variableName,
    );
  });

  it('[NET-NEW] no configuration failure leaks a supplied value into message, context or stack', () => {
    const failure = captureLoadFailure({
      ...FIVE_KEY_ENVIRONMENT,
      DB_PASSWORD: undefined,
      DB_USER: 'sentinel-user-value',
      DB_NAME: 'sentinel-schema-value',
    }) as Error & { readonly context?: unknown };

    const surface = `${failure.message} ${JSON.stringify(failure.context)} ${String(failure.stack)}`;

    expect(surface).toContain('DB_PASSWORD');
    expect(surface).not.toContain('sentinel-user-value');
    expect(surface).not.toContain('sentinel-schema-value');
    expect(surface).not.toContain('slatwall_pw');
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
  /*
   * ⚠️ THE DOCUMENT IS READ INSIDE EACH CASE, NEVER AT DESCRIBE-REGISTRATION SCOPE.
   *
   * An earlier revision bound `readFileSync(ENV_EXAMPLE_PATH, 'utf8')` to a constant right here, in the
   * describe factory body. Jest evaluates that body during COLLECTION, before any case runs, so a missing
   * or unreadable `.env.example` — a checkout without dotfiles, a rename, a packaging step that drops
   * them — surfaced as `Test suite failed to run` and took EVERY case in this file down with it, including
   * the thirty-odd that never touch the filesystem and could not have been affected. The blast radius of a
   * documentation-file problem was the whole loader suite.
   *
   * Reading lazily narrows that to the three cases that genuinely depend on the document: they fail with
   * the real ENOENT, and every other case in the file still reports its own verdict. This is also the
   * corpus convention rather than a local invention — `ProductFeedBuilder.test.ts`,
   * `IntegrationContract.test.ts`, `googleFeedHandler.test.ts` and `MySqlProductRepository.test.ts` all
   * read their reference files inside the test body already, and this suite was the lone deviation.
   */
  const readEnvExample = (): string => readFileSync(ENV_EXAMPLE_PATH, 'utf8');

  it('[NET-NEW] states the enforced grammar and where it runs', () => {
    const envExample = readEnvExample();

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
    const envExample = readEnvExample();

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
    const envExample = readEnvExample();

    expect(envExample).toContain('NOT ENFORCED');
  });
});
