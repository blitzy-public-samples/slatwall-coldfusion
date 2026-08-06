// ---------------------------------------------------------------------------
// tests/unit/lib/config.test.ts
//
// WHY THIS FILE EXISTS. A security review recorded it as a Test Assurance Gap:
// `src/lib/config.ts` had no suite at all, while being the single module that
// decides what a deployment is permitted to do. Two findings then moved decisions
// INTO it, which turned the gap from untidy into load-bearing:
//
//   - S-15 (CWE-346) moved the product-feed host allow-list here, out of the
//     request scope where a caller supplied both the candidate AND the list it was
//     checked against. The check was vacuous: anyone could allow themselves.
//   - S-20 (CWE-754, CWE-840) gave the European Central Bank rate table a supply
//     route here. Before it, production composition ALWAYS ran with an empty table,
//     so a cross-currency conversion silently returned the amount unchanged and
//     priced a foreign-currency SKU as though the currencies were at parity.
//
// WHAT THE SUITE IS THEREFORE FOR. Both fixes are only worth as much as their
// REFUSALS, and a refusal is the easiest thing in a resolver to lose: delete a
// `problems.push` and every positive case still passes. So the cases below weight
// refusal over acceptance deliberately, and each refusal names the specific
// misconfiguration it exists to catch.
//
// HOW IT REACHES THE RESOLVERS. `resolveFeedAllowedHosts` and `resolveCurrencyRates`
// are module-private, and they stay that way - widening a module's surface to let a
// test poke at its interior is how the surface stops describing the design. They are
// reached through `appConfig.load(source)`, which is the same entry point the
// composition root uses. Passing an explicit source is documented to bypass the
// memo, so every case here is order-independent and leaves no residue.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { appConfig } from '../../../src/lib/config.js';
import type { AppConfig, EnvironmentSource } from '../../../src/lib/config.js';

/**
 * The five variables with no default, and nothing else.
 *
 * Kept minimal on purpose: every case below adds only the keys it is about, so a
 * failure names one cause rather than leaving a reader to diff two large records.
 *
 * ★★★ THE BASELINE PAIRED A REMOTE HOST WITH `DB_TLS_MODE: 'disabled'`, AND THAT COMBINATION IS
 * THE DEFECT F48 NAMES (CWE-319). `db.internal.invalid` does not name the loopback interface, so
 * this baseline described a deployment that sends the account, the credential and every row to a
 * remote database in cleartext - and because `NODE_ENV` is optional and defaults to `development`,
 * the old production-only guard never fired on it. Sixteen cases inherited it. The fixture is
 * CORRECTED rather than the rule relaxed: a baseline the transport rules refuse was never a valid
 * deployment to build assertions on, and the baseline should be the RECOMMENDED posture - a named
 * host verified by identity, which needs no trust anchor because the host name performs the binding.
 *
 * `disabled` still has fixtures of its own; see {@link LOOPBACK_DEVELOPMENT}.
 */
const REQUIRED_ONLY: EnvironmentSource = Object.freeze({
  // A host NAME, which is the other half of the correction above: F47 refuses `verify-identity`
  // against an IP LITERAL (CWE-295), because a certificate binds to names and an address would
  // silently reduce the mode to a chain-only check. So the recommended posture this baseline is
  // meant to describe is a NAMED host - a loopback literal here would be refused by the very rule
  // the mode names. `.invalid` never resolves [RFC 2606] and nothing in this file connects.
  DB_HOST: 'db.internal.invalid',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'unit-test-password',
  DB_TLS_MODE: 'verify-identity',
  DB_DIALECT: 'MySQL',
});

/**
 * The transport overlay a loopback development server legitimately uses.
 *
 * Spread over {@link REQUIRED_ONLY} by every case that is about `disabled`, so the one place the
 * loopback pairing is written is the one place a reader has to check it.
 */
const LOOPBACK_DEVELOPMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_TLS_MODE: 'disabled',
});

/** A valid retrieval instant, so rate cases vary one thing at a time. */
const RETRIEVED_AT = '2026-08-04T00:00:00Z';

function load(extra: Readonly<Record<string, string>> = {}): AppConfig {
  return appConfig.load({ ...REQUIRED_ONLY, ...extra });
}

/**
 * Loads and asserts the load was REFUSED, answering the reported problems.
 *
 * The assertion is on `error.name` rather than on the class, because the class is
 * module-private and the name is the documented recognition contract. Returning the
 * problem list lets each case assert WHICH refusal fired - a case that only checked
 * that something threw would pass on an unrelated failure, which is exactly the
 * mistake that makes a validation suite worthless.
 */
function loadExpectingRefusal(extra: Readonly<Record<string, string>>): readonly string[] {
  try {
    load(extra);
  } catch (thrown: unknown) {
    if (!(thrown instanceof Error)) {
      throw new Error('Expected an Error to be thrown.');
    }
    expect(thrown.name).toBe('ConfigurationError');

    const problems: unknown = (thrown as { problems?: unknown }).problems;
    if (!Array.isArray(problems)) {
      throw new Error('Expected the thrown error to carry a problems array.');
    }
    return problems as readonly string[];
  }

  throw new Error('Expected the configuration load to be refused, but it succeeded.');
}

/** Asserts exactly one reported problem mentions `fragment`. */
function expectProblemMentioning(problems: readonly string[], fragment: string): void {
  const matching = problems.filter((problem) => problem.includes(fragment));

  expect(matching).toHaveLength(1);
}

describe('appConfig.load', () => {
  it('resolves with only the five variables that have no default', () => {
    // The baseline every other case builds on. It also pins that neither feature
    // added by S-15 nor by S-20 made itself REQUIRED: a deployment that publishes no
    // feed and quotes one currency must keep starting, and adding a sixth mandatory
    // variable would have broken every existing deployment to fix a defect neither
    // of them had.
    const config = load();

    // QUOTE-THEN-REVISE: this asserted `toStrictEqual([])`, and an empty list is what
    // `assertAllowedFeedHost` refuses everything against - so the baseline case was pinning a
    // deployment that cannot serve the feed the source publishes publicly (F40). UNSET is now
    // `undefined`, which means NO HOST POLICY and admits the request's own authority. An empty
    // list is still reachable, and still deny-all, but only by asking for it.
    expect(config.feed.allowedHosts).toBeUndefined();
    expect(config.currency.europeanCentralBankRates).toStrictEqual({});
    expect(config.currency.ratesRetrievedAt).toBeUndefined();
  });

  it('★★★ distinguishes an UNSET feed allow-list from an explicitly empty one (F40)', () => {
    // The three states, pinned side by side. The middle one is the whole finding: a variable that
    // is PRESENT and names nothing is an operator saying "publish no feed", and a variable that is
    // ABSENT is an operator who never made that decision at all. Folding the second into the first
    // is what disabled the capability by default.
    expect(load().feed.allowedHosts).toBeUndefined();
    expect(load({ FEED_ALLOWED_HOSTS: '' }).feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: '   ' }).feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: ',,' }).feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: 'shop.example.com' }).feed.allowedHosts).toStrictEqual([
      'shop.example.com',
    ]);

    // A present-but-empty value still FREEZES what it publishes, so deny-all cannot be widened at
    // run time any more than an allow-list can.
    expect(Object.isFrozen(load({ FEED_ALLOWED_HOSTS: '' }).feed.allowedHosts)).toBe(true);
  });

  it('freezes what it publishes, so no consumer can edit deployment policy at run time', () => {
    // The property that makes an allow-list an allow-list. If a consumer could push
    // onto `allowedHosts`, moving the list out of the request scope for S-15 would
    // have relocated the vulnerability rather than closed it.
    const config = load({
      FEED_ALLOWED_HOSTS: 'shop.example.com',
      ECB_REFERENCE_RATES: 'USD=1.0850',
      ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
    });

    expect(Object.isFrozen(config.feed)).toBe(true);
    expect(Object.isFrozen(config.feed.allowedHosts)).toBe(true);
    expect(Object.isFrozen(config.currency)).toBe(true);
    expect(Object.isFrozen(config.currency.europeanCentralBankRates)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // DB_TLS_MODE x DB_HOST - the two cross-variable transport rules
  //
  // Both rules exist because a security review found this contract DOCUMENTING
  // protections the resolver did not enforce, which is the worst of the three
  // possible states: a deployment reading the contract believed it had them.
  //
  //   CWE-319  `disabled` was keyed to `NODE_ENV` alone, and `NODE_ENV` is
  //            DEFAULTED - so a production container that never set it sent its
  //            account, credential and every statement over a remote link in clear
  //            text while passing the check. The rule now tests the property that
  //            makes plaintext acceptable at all: the traffic never leaves the host.
  //   CWE-295  `verify-identity` was accepted for an IP-literal host, where the
  //            driver sends no `servername`
  //            [node_modules/mysql2/lib/base/connection.js:L394-L396] and its
  //            identity check is gated on one [L417]. The chain was verified, the
  //            host name was NOT, and the connection reported itself fully verified.
  //
  // Each case below asserts the refusal AND names the pair that caused it, because a
  // case that merely observed "something threw" would pass on an unrelated failure.
  // -------------------------------------------------------------------------

  describe('DB_TLS_MODE with DB_HOST', () => {
    it('★★ REFUSES disabled for a remote host, in the DEFAULT environment', () => {
      // The exact hole the earlier production-only rule left open: NODE_ENV is not set
      // here at all, so it resolves to `development` - and that must not be what stands
      // between a credential and the wire.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: 'db.internal.invalid',
      });

      expectProblemMentioning(problems, 'not a loopback address');
    });

    it('★★ REFUSES disabled for a remote host even when the environment says test', () => {
      // A label cannot buy plaintext to a remote server. `test` is a legitimate value of
      // the contract and still does not make the link local.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: '10.0.0.7',
        NODE_ENV: 'test',
      });

      expectProblemMentioning(problems, 'not a loopback address');
    });

    it('accepts disabled for every loopback spelling a developer actually writes', () => {
      // The development case the mode exists for, kept working. `127.0.0.0/8` is accepted
      // whole because the kernel routes all of it locally, and both IPv6 spellings are
      // accepted because a connection string carries brackets and an environment value
      // usually does not.
      for (const host of ['127.0.0.1', '127.0.0.2', 'localhost', 'LocalHost', '::1', '[::1]']) {
        const config = load({ DB_TLS_MODE: 'disabled', DB_HOST: host });

        expect(config.tls.mode).toBe('disabled');
      }
    });

    it('refuses disabled in production even on loopback, so the older rule is still there', () => {
      // Defence in depth: the loopback rule did not replace the production rule, and a
      // production deployment pointed at its own machine is still refused.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: '127.0.0.1',
        NODE_ENV: 'production',
      });

      expectProblemMentioning(problems, 'NODE_ENV is production');
    });

    it('★★ REFUSES verify-identity for an IPv4 literal, and names verify-ca as the honest choice', () => {
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'verify-identity',
        DB_HOST: '10.0.0.7',
      });

      expectProblemMentioning(problems, 'DB_HOST is an IP literal');
    });

    it('REFUSES verify-identity for an IPv6 literal, bare or bracketed', () => {
      for (const host of ['2001:db8::1', '[2001:db8::1]', '::1']) {
        const problems = loadExpectingRefusal({
          DB_TLS_MODE: 'verify-identity',
          DB_HOST: host,
        });

        expectProblemMentioning(problems, 'DB_HOST is an IP literal');
      }
    });

    it('accepts verify-identity for a host NAME, which is what it can actually verify', () => {
      expect(load({ DB_TLS_MODE: 'verify-identity', DB_HOST: 'db.example.com' }).tls.mode).toBe(
        'verify-identity',
      );
    });

    it('accepts verify-ca for an IP literal, because that is the case it exists for', () => {
      // The sanctioned route for a deployment that cannot use a name: chain verification
      // stays on, and the absence of the identity check is stated in the environment
      // rather than discovered in a handshake. The anchor is part of that route rather than
      // incidental to it - `verify-ca` omits the host-name check, so F47 requires the pinned
      // authority to be what binds the connection to the intended server.
      expect(
        load({
          DB_TLS_MODE: 'verify-ca',
          DB_HOST: '10.0.0.7',
          DB_TLS_CA: PINNED_AUTHORITY_PEM,
        }).tls.mode,
      ).toBe('verify-ca');
    });

    it('does not misclassify an out-of-range dotted quad as an address', () => {
      // `999.1.1.1` is not an IPv4 literal, so it is a NAME - one that will fail DNS
      // resolution, which is the right place for it to fail. Classifying it as an address
      // would refuse `verify-identity` with a message naming the wrong problem.
      expect(load({ DB_TLS_MODE: 'verify-identity', DB_HOST: '999.1.1.1' }).tls.mode).toBe(
        'verify-identity',
      );
    });

    it('does not accept a name that merely BEGINS with localhost as loopback', () => {
      // `localhost.evil.example` resolves wherever its owner points it. An allow-list of
      // exact spellings rather than a prefix test is what keeps that from passing.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: 'localhost.evil.example',
      });

      expectProblemMentioning(problems, 'not a loopback address');
    });
  });

  // -------------------------------------------------------------------------
  // FEED_ALLOWED_HOSTS - finding S-15
  // -------------------------------------------------------------------------

  describe('FEED_ALLOWED_HOSTS', () => {
    it('accepts one bare authority', () => {
      expect(load({ FEED_ALLOWED_HOSTS: 'shop.example.com' }).feed.allowedHosts).toStrictEqual([
        'shop.example.com',
      ]);
    });

    it('accepts a port, because a legitimate non-production origin has one', () => {
      expect(load({ FEED_ALLOWED_HOSTS: 'localhost:3000' }).feed.allowedHosts).toStrictEqual([
        'localhost:3000',
      ]);
    });

    it('folds case and ignores surrounding whitespace, so the list may be written readably', () => {
      // Host comparison is case-insensitive, so the list is normalized ONCE here
      // rather than at each comparison. Normalizing at the point of use instead would
      // put the burden on every future caller and eventually one would forget.
      const config = load({ FEED_ALLOWED_HOSTS: '  Shop.Example.COM ,  EU.shop.example.com  ' });

      expect(config.feed.allowedHosts).toStrictEqual(['shop.example.com', 'eu.shop.example.com']);
    });

    it('de-duplicates, including duplicates that differ only by case', () => {
      const config = load({ FEED_ALLOWED_HOSTS: 'shop.example.com,SHOP.EXAMPLE.COM' });

      expect(config.feed.allowedHosts).toStrictEqual(['shop.example.com']);
    });

    it('tolerates empty members, so a trailing comma is not a start-up failure', () => {
      const config = load({ FEED_ALLOWED_HOSTS: 'shop.example.com,,' });

      expect(config.feed.allowedHosts).toStrictEqual(['shop.example.com']);
    });

    it.each([
      ['a scheme', 'https://shop.example.com'],
      ['userinfo', 'user@shop.example.com'],
      ['a path', 'shop.example.com/feed'],
      ['a query', 'shop.example.com?x=1'],
      ['a wildcard', '*.example.com'],
      ['an embedded space', 'shop example.com'],
    ])('refuses an entry carrying %s', (_label: string, entry: string) => {
      // ★ EACH OF THESE IS A WAY AN ALLOW-LIST STOPS MEANING WHAT IT SAYS. A scheme or
      // userinfo would make the entry fail to match a bare authority, so the feed
      // would refuse every request and the operator would have no idea why - which is
      // exactly why a malformed entry is a START-UP failure rather than a silently
      // dropped member. A wildcard is the sharper one: accepting `*.example.com` as a
      // literal string means it matches nothing, but a future reader would reasonably
      // believe subdomain matching exists. Refusing says plainly that it does not.
      const problems = loadExpectingRefusal({ FEED_ALLOWED_HOSTS: entry });

      expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
    });

    it('★★★ REFUSES A PORT OUTSIDE 1 TO 65535, and a leading-zero port', () => {
      // ★★★ NEITHER GRAMMAR USED TO CHECK THE RANGE. This module's retired pattern and the
      // renderer's both spelled the port `\d{1,5}`, which is `0` through `99999`. `:0` names no
      // port, anything above 65535 names nothing, and `:08443` is a second spelling of a port
      // that would then fail the very membership comparison this list exists for.
      for (const entry of [
        'shop.example.com:0',
        'shop.example.com:00000',
        'shop.example.com:65536',
        'shop.example.com:99999',
        'shop.example.com:08443',
      ]) {
        const problems = loadExpectingRefusal({ FEED_ALLOWED_HOSTS: entry });

        expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
      }
    });

    it('accepts the boundary ports, so the range is a range and not an off-by-one', () => {
      expect(load({ FEED_ALLOWED_HOSTS: 'shop.example.com:1' }).feed.allowedHosts).toStrictEqual([
        'shop.example.com:1',
      ]);
      expect(
        load({ FEED_ALLOWED_HOSTS: 'shop.example.com:65535' }).feed.allowedHosts,
      ).toStrictEqual(['shop.example.com:65535']);
    });

    it('★★★ ACCEPTS WHAT THE RENDERER ACCEPTS, because the two now share one parser', () => {
      // ★★★ THE DIVERGENCE THIS FIX EXISTS FOR, INVERTED INTO AN ACCEPTANCE. The retired pattern
      // here was lowercase-only, admitted no underscore and had no bracketed-IPv6 alternative,
      // while `src/integrations/google/rssFeedRenderer.ts` admitted all three - and the docblock
      // above it claimed "the two patterns are deliberately identical so a value cannot pass one
      // and fail the other". Every entry below was refused as deployment configuration and
      // accepted at the point of use, so a deployment on an internal or IPv6 host could not
      // authorize the very host the renderer would happily publish.
      //
      // Case folding still applies to the STORED value, which is why the expectations are
      // lower-cased: normalization is a separate decision from grammar and is unchanged.
      expect(load({ FEED_ALLOWED_HOSTS: 'SHOP.EXAMPLE.COM' }).feed.allowedHosts).toStrictEqual([
        'shop.example.com',
      ]);
      expect(
        load({ FEED_ALLOWED_HOSTS: 'feed_internal.example.com' }).feed.allowedHosts,
      ).toStrictEqual(['feed_internal.example.com']);
      expect(load({ FEED_ALLOWED_HOSTS: '[2001:DB8::1]' }).feed.allowedHosts).toStrictEqual([
        '[2001:db8::1]',
      ]);
      expect(load({ FEED_ALLOWED_HOSTS: '[::1]:8443' }).feed.allowedHosts).toStrictEqual([
        '[::1]:8443',
      ]);
    });

    it('refuses an entry longer than a host authority can be, which it previously did not bound at all', () => {
      // This module applied NO length limit, so a multi-kilobyte entry was accepted as deployment
      // configuration and then refused at the point of use. The shared parser carries the same
      // 259-character ceiling as the renderer.
      const problems = loadExpectingRefusal({
        FEED_ALLOWED_HOSTS: `${'a'.repeat(300)}.example.com`,
      });

      expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
    });

    it('names every malformed entry in one pass, not just the first', () => {
      // One-pass reporting is the module's stated contract, and it matters most here:
      // a deployment fixing a list one restart at a time is how a rollout stalls.
      const problems = loadExpectingRefusal({
        FEED_ALLOWED_HOSTS: 'https://a.example.com,ok.example.com,b.example.com/x',
      });

      expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
      const [reported] = problems.filter((problem) => problem.includes('FEED_ALLOWED_HOSTS'));
      expect(reported).toContain('a.example.com');
      expect(reported).toContain('b.example.com/x');
    });
  });

  // -------------------------------------------------------------------------
  // FEED_URL_SCHEME - THE VARIABLE THAT IS NOT READ, AND WHY
  //
  // A security review raised S-09 (MEDIUM, CWE-319) against the renderer's hardcoded `http://`,
  // and an intervening revision ACCEPTED it here: this module read a `FEED_URL_SCHEME` variable,
  // published it as `AppConfig.feed.scheme`, defaulted it to `https` and refused `http` outright
  // when `NODE_ENV` was production. A suite of nine cases pinned every one of those behaviours.
  //
  // ALL OF IT IS REMOVED, AND THESE CASES ARE ITS INVERSION rather than its deletion, so the
  // reversal is checked and not merely asserted in a comment. The variable, the `FeedUrlScheme`
  // type, the `https` default, the production refusal and the `feed.scheme` member are gone. AAP
  // 0.1.1 requires preserving "the Google product-feed integration contract exactly", AAP 0.8.1
  // freezes it, and AAP 0.6.7 admits exactly three divergences in this port - the un-`var`'d scope
  // leak, the `amountOff` precision gap and the entity memo bugs - so a scheme change would be a
  // fourth. The earlier argument leaned on AAP 0.4.1 enumerating three preserved hardcodings and
  // "THE SCHEME IS NOT AMONG THEM", but that list enumerates the hardcodings worth ANNOTATING, not
  // an exhaustive licence to change everything absent from it. The scheme is the frozen legacy
  // literal in `src/integrations/google/rssFeedRenderer.ts`.
  //
  // NET-NEW COVERAGE per AAP 0.6.6.
  // -------------------------------------------------------------------------

  describe('FEED_URL_SCHEME is not part of the configuration contract', () => {
    it('★★ publishes NO scheme member: the feed config is the allow-list and nothing else', () => {
      const { feed } = load();

      // Reflected rather than type-asserted. A removed member is invisible to `expect(x).toBe`
      // once the type is gone, so the key set is what proves the surface actually narrowed.
      expect(Object.keys(feed)).toStrictEqual(['allowedHosts']);
      expect('scheme' in feed).toBe(false);
    });

    it('★★ IGNORES the variable entirely when a leftover deployment still sets it', () => {
      // The realistic failure this guards: an operator upgrades a deployment whose environment
      // still carries `FEED_URL_SCHEME=https` from the earlier revision. It must be INERT - not a
      // start-up refusal, which would block the upgrade, and not a silently honoured setting,
      // which would reintroduce the divergence. This module reads only the keys it declares.
      for (const supplied of ['https', 'http', 'HTTPS', 'htps', 'ftp', 'https://', '']) {
        const { feed } = load({ FEED_URL_SCHEME: supplied });

        expect(Object.keys(feed)).toStrictEqual(['allowedHosts']);
      }
    });

    it('starts in production with the variable set to http, which the earlier revision refused', () => {
      // The exact case the removed production rule rejected. It now starts, because the value is
      // not read at all - and the emitted feed is `http://` regardless of it, which is the frozen
      // legacy output. `DB_TLS_MODE` is raised to a valid production value so this case cannot
      // pass or fail on the unrelated transport rule, which DOES still refuse in production.
      const config = load({
        FEED_URL_SCHEME: 'http',
        NODE_ENV: 'production',
        DB_TLS_MODE: 'verify-identity',
      });

      expect(config.environment).toBe('production');
      expect(Object.keys(config.feed)).toStrictEqual(['allowedHosts']);
    });

    it('leaves the transport-mode production refusal untouched, so the shape was not lost with it', () => {
      // The removed scheme rule was modelled on this one. Removing the scheme rule must not have
      // weakened the rule it was modelled on: `DB_TLS_MODE=disabled` is still refused in
      // production, which is a real transport decision rather than a frozen output contract.
      const problems = loadExpectingRefusal({ NODE_ENV: 'production', DB_TLS_MODE: 'disabled' });

      expectProblemMentioning(problems, 'DB_TLS_MODE');
    });

    it('is FROZEN on the resolved config, so nothing can add a scheme back after start-up', () => {
      // The guarantee the allow-list has, retained: a request cannot reach this object, widen it,
      // or graft a `scheme` onto it at run time.
      const config = load({ FEED_ALLOWED_HOSTS: 'shop.example.com' });

      expect(Object.isFrozen(config.feed)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // ECB_REFERENCE_RATES / ECB_RATES_RETRIEVED_AT - finding S-20
  // -------------------------------------------------------------------------

  describe('ECB_REFERENCE_RATES', () => {
    it('accepts a table and keeps every rate as an exact string', () => {
      // ★ THE RATES ARE NEVER PARSED TO A NUMBER HERE, AND THAT IS THE POINT. AAP
      // 0.8.3 makes `Money` the single arithmetic surface; a `parseFloat` in this
      // module would be a second one, and it would round-trip `0.8520` to `0.852`
      // before the decimal library ever saw it. Asserting the trailing zero survives
      // is how that stays true.
      const config = load({
        ECB_REFERENCE_RATES: 'USD=1.0850,GBP=0.8520,JPY=163.41',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expect(config.currency.europeanCentralBankRates).toStrictEqual({
        USD: '1.0850',
        GBP: '0.8520',
        JPY: '163.41',
      });
      expect(config.currency.ratesRetrievedAt?.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    });

    it('upper-cases the currency code and ignores whitespace around each member', () => {
      const config = load({
        ECB_REFERENCE_RATES: ' usd = 1.0850 , gbp=0.8520 ',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expect(config.currency.europeanCentralBankRates).toStrictEqual({
        USD: '1.0850',
        GBP: '0.8520',
      });
    });

    it('accepts an integral rate, which a high-denomination currency legitimately has', () => {
      const config = load({
        ECB_REFERENCE_RATES: 'JPY=163',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expect(config.currency.europeanCentralBankRates).toStrictEqual({ JPY: '163' });
    });

    it.each([
      ['a two-letter code', 'US=1.0850'],
      ['a four-letter code', 'USDX=1.0850'],
      ['a digit in the code', 'US1=1.0850'],
      ['no separator', 'USD1.0850'],
      ['a missing rate', 'USD='],
      ['a non-numeric rate', 'USD=abc'],
      ['a thousands separator', 'JPY=1,63.41'],
    ])('refuses %s', (_label: string, entry: string) => {
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: entry,
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });

    it('★★ REFUSES A ZERO RATE, because conversion DIVIDES by the source rate', () => {
      // Not a shape objection - `0` is a perfectly well-formed decimal numeral. It is
      // refused on ARITHMETIC grounds, and the legacy line is what makes it fatal:
      // `model/service/CurrencyService.cfc:L90` is
      // `var amountInEUR = arguments.amount / cbRates[ original ];`. A zero there is a
      // division by zero on a money path. Refusing at start-up is the only place it
      // can be refused once, rather than at every conversion.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=0',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });

    it('★★ REFUSES A ZERO WRITTEN WITH DECIMALS, which the shape alone would admit', () => {
      // `0.00` passes the numeral shape and is still zero. This case exists because
      // the strict-positivity check is a SEPARATE test from the shape check, and a
      // refactor that folded them into one regex would drop it silently - the case
      // above would keep passing on the bare `0`.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=0.00',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });

    it.each([
      ['a negative rate', 'USD=-1.0850'],
      ['an explicit plus sign', 'USD=+1.0850'],
      ['exponent notation', 'USD=1.085e0'],
    ])('refuses %s, so a rate is only ever a plain positive decimal', (_l: string, e: string) => {
      // A sign cannot be written at all, which is how negatives are excluded without
      // a comparison. Exponent notation is refused deliberately rather than
      // supported: a rate written that way in a deployment variable is far more likely
      // a mistake than an intention, and admitting it would widen what `Money` must
      // later accept.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: e,
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });

    it('refuses a value that is set but resolves to no usable entry', () => {
      // Distinguishes "I publish no rates" from "I meant to publish rates and got the
      // syntax wrong". Silently treating `,,,` as unset would put a deployment into
      // 1:1 pricing while its operator believed rates were configured - the exact
      // outcome S-20 was raised about.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: ',,,',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });
  });

  describe('ECB_RATES_RETRIEVED_AT', () => {
    it('★ IS REQUIRED once any rate is supplied, because unknown age cannot be reported as stale', () => {
      // The freshness half of S-20's required resolution. `bootstrap.ts` compares the
      // age against the one-day window the legacy service refreshed on
      // (`model/service/CurrencyService.cfc:L105`); with no instant there is nothing
      // to compare and staleness becomes unobservable.
      const problems = loadExpectingRefusal({ ECB_REFERENCE_RATES: 'USD=1.0850' });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
    });

    it('refuses an instant supplied with no rates, since it then describes nothing', () => {
      const problems = loadExpectingRefusal({ ECB_RATES_RETRIEVED_AT: RETRIEVED_AT });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
    });

    it('refuses an unparsable instant rather than treating it as absent', () => {
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: 'last Tuesday',
      });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
    });

    it('★★ REFUSES every spelling a date parser would GUESS at, not merely the unparsable ones', () => {
      // The gap a security review recorded as CWE-20: the contract says ISO-8601, and a
      // `NaN` check alone enforces nothing, because every string below PARSES. Each was
      // measured against this runtime before being listed - `new Date` accepts all of
      // them - so without a grammar the age a stale-rate warning is computed from would
      // depend on the parser rather than on the value:
      //
      //   'August 4, 2026'        a locale spelling, parsed as local midnight
      //   '2026/08/04'            slash-separated, parsed as local midnight
      //   'Tue Aug 04 2026'       the toString form, no offset at all
      //   '2026-08-04'            a DATE, not an instant: no time, no offset
      //   '2026-08-04T00:00:00'   ISO-shaped but with NO OFFSET, which a date-time
      //                           parser reads as UTC and a date-only parser as local
      for (const supplied of [
        'August 4, 2026',
        '2026/08/04',
        'Tue Aug 04 2026',
        '2026-08-04',
        '2026-08-04T00:00:00',
      ]) {
        expect(Number.isNaN(new Date(supplied).getTime())).toBe(false);

        const problems = loadExpectingRefusal({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: supplied,
        });

        expectProblemMentioning(problems, 'not an ISO-8601 instant');
      }
    });

    it('accepts the offset forms the contract publishes, and nothing wider', () => {
      // Minute precision, second precision, fractional seconds and a numeric offset are
      // all legitimate publications of a retrieval instant. Each is converted to the same
      // absolute moment, which is the property the age computation depends on.
      const accepted: readonly [string, string][] = [
        ['2026-08-04T00:00Z', '2026-08-04T00:00:00.000Z'],
        ['2026-08-04T00:00:00Z', '2026-08-04T00:00:00.000Z'],
        ['2026-08-04T00:00:00.250Z', '2026-08-04T00:00:00.250Z'],
        ['2026-08-04T02:00:00+02:00', '2026-08-04T00:00:00.000Z'],
        ['2026-08-03T22:00:00-02:00', '2026-08-04T00:00:00.000Z'],
      ];

      for (const [supplied, expected] of accepted) {
        const config = load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: supplied,
        });

        expect(config.currency.ratesRetrievedAt?.toISOString()).toBe(expected);
      }
    });

    it('refuses the basic ISO format, which this contract does not publish', () => {
      // `20260804T000000Z` is a legitimate ISO-8601 spelling and is still refused: the
      // contract publishes the extended form, and the basic form does not parse on this
      // runtime at all, so accepting it would depend on the engine rather than the value.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '20260804T000000Z',
      });

      expectProblemMentioning(problems, 'not an ISO-8601 instant');
    });

    it('★★ REFUSES a day that does not exist, which the date parser SILENTLY ROLLS OVER', () => {
      // The measurement that made a calendar check necessary rather than decorative:
      // `new Date('2026-02-31T00:00:00Z')` is not an Invalid Date on this runtime, it is
      // 3 March. A retrieval instant three days off, accepted silently, is precisely the
      // quiet wrongness the grammar was added to stop.
      expect(new Date('2026-02-31T00:00:00Z').toISOString()).toBe('2026-03-03T00:00:00.000Z');

      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2026-02-31T00:00:00Z',
      });

      expectProblemMentioning(problems, 'names no real calendar instant');
    });

    it('applies the Gregorian leap rule rather than a fixed February length', () => {
      // 2024 is a leap year, so 29 February exists and must be accepted; 2026 is not, so
      // the same day must be refused. A hardcoded 28 or 29 fails one of the two.
      expect(
        load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: '2024-02-29T00:00:00Z',
        }).currency.ratesRetrievedAt?.toISOString(),
      ).toBe('2024-02-29T00:00:00.000Z');

      expectProblemMentioning(
        loadExpectingRefusal({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: '2026-02-29T00:00:00Z',
        }),
        'names no real calendar instant',
      );
    });

    it('accepts a STALE instant, because staleness is reported and never refused here', () => {
      // ★★ THE DELIBERATELY DECLINED HALF OF S-20, PINNED SO IT CANNOT DRIFT. The
      // review asked for "fail closed on unavailable cross-currency rates"; a
      // year-old table loads successfully anyway, and `bootstrap.ts` warns about it.
      //
      // The legacy is why. Its refetch sat in a `try` whose `catch` was EMPTY
      // [model/service/CurrencyService.cfc:L127-L128], so a failed download left the
      // previous table in place and L130 returned it - it served rates of ANY age
      // indefinitely. Refusing here would also diverge in the worse direction: the
      // alternative to a day-old rate is no conversion at all, which returns the
      // amount unchanged and prices at parity. Cents of drift against tens of percent.
      const config = load({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2020-01-01T00:00:00Z',
      });

      expect(config.currency.europeanCentralBankRates).toStrictEqual({ USD: '1.0850' });
      expect(config.currency.ratesRetrievedAt?.getUTCFullYear()).toBe(2020);
    });

    // -----------------------------------------------------------------------
    // The instant must be a COMPLETE ISO-8601 instant, not merely something the
    // date parser accepts
    //
    // ★★ "PARSABLE" WAS THE WRONG STANDARD, AND THESE CASES ARE THE DIFFERENCE.
    // The resolver used to do `new Date(raw)` and reject only `NaN`, which accepts
    // far more than ISO-8601 and silently assigns a meaning to what it accepts. The
    // decisive one is a date-time with NO ZONE: V8 reads it in the host's LOCAL
    // time, so one environment value denotes two different instants on two
    // machines. `tests/setup.ts` pins `TZ=UTC` for this suite, which is exactly why
    // the defect was invisible from here and had to be closed by shape rather than
    // by observation.
    // -----------------------------------------------------------------------

    it('★★★ REFUSES A DATE-TIME WITH NO ZONE DESIGNATOR', () => {
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00:00',
      });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
      expectProblemMentioning(problems, 'zone');
    });

    it('★★ refuses every other shape the date parser would have accepted', () => {
      // Each of these returns a valid `Date` from `new Date()`, which is what made
      // the old NaN check insufficient.
      for (const accepted of [
        '2026-08-04',
        'Aug 4 2026',
        '2026-08-04 00:00:00Z',
        '20260804T000000Z',
        '2026-08-04T00:00:00+0200',
        '1754265600000',
      ]) {
        const problems = loadExpectingRefusal({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: accepted,
        });

        expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
      }
    });

    it('★★ REFUSES AN IMPOSSIBLE CALENDAR DATE rather than rolling it forward', () => {
      // `new Date('2026-02-30T00:00:00Z')` answers 2 March silently. A timestamp that
      // names a day that does not exist is a wrong value, and accepting it would
      // record the rate table as retrieved on a date nobody meant.
      for (const impossible of [
        '2026-02-30T00:00:00Z',
        '2026-04-31T00:00:00Z',
        '2025-02-29T00:00:00Z',
      ]) {
        const problems = loadExpectingRefusal({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: impossible,
        });

        expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
        expectProblemMentioning(problems, 'does not exist');
      }
    });

    it('accepts 29 February in a leap year, so the calendar check is a check and not a ban', () => {
      const config = load({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2024-02-29T12:00:00Z',
      });

      expect(config.currency.ratesRetrievedAt?.toISOString()).toBe('2024-02-29T12:00:00.000Z');
    });

    it('★★ accepts an OFFSET-CARRYING instant and resolves it to the same absolute instant as its Z form', () => {
      // The normalization claim, asserted rather than asserted-about. A `Date` is an
      // absolute instant with no zone of its own, so once a designator is present
      // there is nothing left to convert - and the proof is that the two spellings
      // are indistinguishable afterwards.
      const withOffset = load({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2026-08-04T02:00:00+02:00',
      });
      const withZulu = load({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00:00Z',
      });

      expect(withOffset.currency.ratesRetrievedAt?.getTime()).toBe(
        withZulu.currency.ratesRetrievedAt?.getTime(),
      );
      expect(withOffset.currency.ratesRetrievedAt?.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    });

    it('accepts the optional pieces of the extended form - omitted seconds, and a fraction', () => {
      expect(
        load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00Z',
        }).currency.ratesRetrievedAt?.toISOString(),
      ).toBe('2026-08-04T00:00:00.000Z');

      expect(
        load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00:00.250Z',
        }).currency.ratesRetrievedAt?.toISOString(),
      ).toBe('2026-08-04T00:00:00.250Z');

      // A lowercase designator is unambiguous, and V8 accepts it, so refusing it would
      // reject a correct value over notation.
      expect(
        load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: '2026-08-04t00:00:00z',
        }).currency.ratesRetrievedAt?.toISOString(),
      ).toBe('2026-08-04T00:00:00.000Z');
    });

    it('★★★ REFUSES AN INSTANT IN THE FUTURE, because a negative age reads as fresh', () => {
      // ★★★ THE DEFECT THIS CHECK EXISTS FOR, AND IT IS A REPORTING INVERSION RATHER
      // THAN A PARSE ERROR. `bootstrap.ts` computes the age by subtraction; a future
      // instant makes it NEGATIVE, and a negative age is less than any refresh
      // window - so the table sailed past the staleness branch and was announced as
      // "resolved from configuration". The value collected to make a stale table
      // visible instead guaranteed it looked current.
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: tomorrow,
      });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
      expectProblemMentioning(problems, 'future');
    });

    it('accepts an instant a few seconds ahead, which is clock skew rather than a wrong value', () => {
      // The allowance is five minutes and is documented as a skew tolerance, not a
      // licence for future-dated data: the instant is captured on one machine and
      // evaluated on another, and refusing a deployment over unsynchronized clocks
      // would be a false alarm.
      const slightlyAhead = new Date(Date.now() + 30 * 1000).toISOString();

      const config = load({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: slightlyAhead,
      });

      expect(config.currency.ratesRetrievedAt?.toISOString()).toBe(slightlyAhead);
    });

    it('accepts the present instant, so a freshly captured table is not a false positive', () => {
      const now = new Date().toISOString();

      expect(
        load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: now,
        }).currency.ratesRetrievedAt?.toISOString(),
      ).toBe(now);
    });
  });

  // -------------------------------------------------------------------------
  // The two features are independent
  // -------------------------------------------------------------------------

  it('reports feed and currency problems together, in one pass', () => {
    // Both resolvers contribute to the SAME problem list, so a deployment with two
    // mistakes learns about both on one restart. This also pins that neither resolver
    // returns early in a way that suppresses the other.
    const problems = loadExpectingRefusal({
      FEED_ALLOWED_HOSTS: 'https://shop.example.com',
      ECB_REFERENCE_RATES: 'USD=0',
      ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
    });

    expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
    expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
  });

  it('publishes a feed allow-list and a rate table independently of one another', () => {
    const feedOnly = load({ FEED_ALLOWED_HOSTS: 'shop.example.com' });
    expect(feedOnly.feed.allowedHosts).toStrictEqual(['shop.example.com']);
    expect(feedOnly.currency.europeanCentralBankRates).toStrictEqual({});

    const ratesOnly = load({
      ECB_REFERENCE_RATES: 'USD=1.0850',
      ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
    });
    expect(ratesOnly.feed.allowedHosts).toBeUndefined();
    expect(ratesOnly.currency.europeanCentralBankRates).toStrictEqual({ USD: '1.0850' });
  });

  // -------------------------------------------------------------------------
  // The delivery-size contract - 4096 bytes for the whole environment
  //
  // ★★ THE ONLY REFUSAL IN THIS FILE THAT IS ABOUT DEPLOYABILITY RATHER THAN
  // CORRECTNESS. AWS Lambda caps the entire environment-variable map at 4096 bytes -
  // keys and values together - and does not allow the quota to be raised. Two of the
  // nineteen contract variables had no upper bound of any kind, so a configuration
  // every other check here would accept could be impossible to deploy, and the first
  // anyone would learn of it is a deployment refusal naming a byte count.
  //
  // The refusal is most useful OUTSIDE Lambda: inside it, the platform has already
  // rejected the configuration and this code never runs. Its value is failing locally
  // and in CI, where the value is authored.
  // -------------------------------------------------------------------------

  it('★★★ REFUSES A CERTIFICATE AUTHORITY LARGER THAN ITS DOCUMENTED MAXIMUM', () => {
    // A PEM bundle of several certificates is the realistic way this happens - a chain
    // supplied where only the trust anchor was needed. 2048 bytes holds one ordinary
    // authority; 4000 holds two and does not fit the platform quota beside the other
    // eighteen variables.
    const oversized = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(4_000)}\n-----END CERTIFICATE-----`;

    const problems = loadExpectingRefusal({
      DB_TLS_MODE: 'verify-identity',
      DB_TLS_CA: oversized,
    });

    const refusal = problems.filter((problem) => problem.includes('documented maximum'));

    expect(refusal).toHaveLength(1);
    expect(refusal[0]).toContain('DB_TLS_CA');
    expect(refusal[0]).toContain('2048');
    // ★ AND IT NAMES THE SIZE, NOT THE VALUE. Two of the measured variables are a
    // credential and a private host name, so the diagnosis is a byte count. Asserted over
    // every problem, because the aggregate message is emitted alongside this one - a value
    // this far over its own bound takes the whole set over the quota too.
    expect(problems.join(' ')).not.toContain('AAAA');
  });

  it('accepts a certificate authority at the ceiling, so the bound is a bound and not a ban', () => {
    // The bound has to carry a legitimate value. An ordinary RSA-2048 authority is
    // roughly 1200 bytes of PEM.
    const marker = '-----BEGIN CERTIFICATE-----\n';
    const trailer = '\n-----END CERTIFICATE-----';
    const body = 'A'.repeat(2_048 - marker.length - trailer.length);

    const config = load({
      DB_TLS_MODE: 'verify-identity',
      DB_TLS_CA: `${marker}${body}${trailer}`,
    });

    expect(config.tls.certificateAuthority).toContain('BEGIN CERTIFICATE');
  });

  it('★★ REFUSES A RATE TABLE LARGER THAN ITS DOCUMENTED MAXIMUM', () => {
    // The second previously-unbounded variable. Every entry here is individually
    // well-formed, so this is a SIZE refusal and not a shape one - which is the point:
    // a rate list can be perfectly valid and still undeployable.
    const codes = ['AAA', 'AAB', 'AAC', 'AAD', 'AAE', 'AAF', 'AAG', 'AAH', 'AAI', 'AAJ'];
    const entries: string[] = [];
    for (let repeat = 0; repeat < 6; repeat += 1) {
      for (const code of codes) {
        entries.push(
          `${code}=1.${String(repeat)}${String(repeat)}${String(repeat)}${String(repeat)}${String(repeat)}${String(repeat)}${String(repeat)}`,
        );
      }
    }

    const problems = loadExpectingRefusal({
      ECB_REFERENCE_RATES: entries.join(','),
      ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
    });

    expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    expectProblemMentioning(problems, '512');
  });

  it('★★★ REFUSES A SET THAT IS INDIVIDUALLY LEGAL AND COLLECTIVELY OVER BUDGET', () => {
    // ★★★ THE AGGREGATE REFUSAL, AND THE ONE INPUT THAT CAN ACTUALLY REACH IT, WHICH IS
    // WORTH SPELLING OUT BECAUSE IT EXPLAINS WHY BOTH CHECKS EXIST.
    //
    // The documented maxima sum to 4050 of the 4096-byte quota, so while every value is
    // inside its own bound the set CANNOT exceed the quota - that is precisely what the
    // ceiling arithmetic buys. There is exactly one exception, and it is deliberate:
    // `LOG_LEVEL` carries no per-variable refusal, because an unset or unrecognized
    // threshold must not be able to abort a cold start. Its bytes still count toward the
    // aggregate, and this case is that backstop working - a 2000-byte threshold beside a
    // maximal certificate authority is undeployable, and nothing else would have caught it.
    //
    // The aggregate check also keeps the contract honest if a maximum is ever raised past
    // what the quota can carry, which is the other reason it is not redundant.
    const marker = '-----BEGIN CERTIFICATE-----\n';
    const atMaximumCertificate = `${marker}${'A'.repeat(2_048 - marker.length)}`;

    const problems = loadExpectingRefusal({
      DB_TLS_MODE: 'verify-identity',
      DB_TLS_CA: atMaximumCertificate,
      LOG_LEVEL: 'v'.repeat(2_000),
    });

    const aggregate = problems.filter((problem) => problem.includes('contract variables'));

    expect(aggregate).toHaveLength(1);
    expect(aggregate[0]).toContain('4096');
    // NO per-variable refusal fired: the certificate is exactly at its maximum, and
    // LOG_LEVEL is the one key that is never individually refused. That is what makes this
    // the aggregate case rather than a per-variable one wearing its clothes.
    expect(problems.filter((problem) => problem.includes('documented maximum'))).toStrictEqual([]);
  });

  it('★★ NEVER REFUSES `LOG_LEVEL` ON SIZE ALONE, because logging may not break a cold start', () => {
    // ★★ THE EXEMPTION, ASSERTED DIRECTLY. A 2000-byte threshold is absurd and is still
    // not a startup failure: it is coerced to the default and classified, exactly as any
    // other unrecognized value is. `src/lib/config.ts` reports its own fatal configuration
    // failure THROUGH the logger, so a threshold able to abort would produce a service that
    // can neither start nor say why.
    const config = load({ LOG_LEVEL: 'v'.repeat(2_000) });

    expect(config.logging).toStrictEqual({ level: 'info', levelSource: 'defaulted-unrecognized' });
  });

  it('measures UTF-8 bytes rather than characters, so a non-ASCII value cannot slip past', () => {
    // A budget measured in the wrong unit is a budget that can be exceeded while
    // passing: an internationalized host or a non-ASCII credential costs two to four
    // bytes per character. 100 three-byte characters is 300 bytes against a 253-byte
    // maximum, while being only 100 characters long.
    // A verifying transport mode is used so the loopback rule does not also fire - this
    // case is about the unit of measurement and nothing else.
    const problems = loadExpectingRefusal({
      DB_HOST: '\u4e16'.repeat(100),
      DB_TLS_MODE: 'verify-identity',
    });

    const refusal = problems.filter((problem) => problem.includes('documented maximum'));

    expect(refusal).toHaveLength(1);
    expect(refusal[0]).toContain('DB_HOST');
    expect(refusal[0]).toContain('300 bytes');
  });

  it('leaves an ordinary configuration entirely unaffected, which is every other case in this file', () => {
    // The budget must not become a tax on normal use. The baseline plus a realistic
    // feed list and rate table is a few hundred bytes.
    const config = load({
      FEED_ALLOWED_HOSTS: 'shop.example.com,eu.shop.example.com',
      ECB_REFERENCE_RATES: 'USD=1.0850,GBP=0.8520,JPY=163.41',
      ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
    });

    expect(config.feed.allowedHosts).toHaveLength(2);
    expect(Object.keys(config.currency.europeanCentralBankRates)).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // DB_TLS_MODE=disabled requires a LOOPBACK host, in every environment
  //
  // ★★ THE PRODUCTION RULE WAS NECESSARY AND, ALONE, INSUFFICIENT - AND THESE CASES
  // PIN THE GAP IT LEFT. `NODE_ENV` DEFAULTS to `development`, so a deployment that
  // merely omitted the variable never reached the production refusal, and this module
  // accepted `DB_TLS_MODE=disabled` against a REMOTE host: the account, the credential
  // and every statement in cleartext, with nothing reported at startup.
  // `slatwall-ts/.env.example` had always documented `disabled` as permitted "only for
  // a local server reached over a loopback interface", so the contract and the
  // enforcement disagreed, and the contract was the accurate one.
  //
  // THE TEST IS SYNTACTIC AND RESOLVES NOTHING, WHICH THESE CASES ALSO PIN. This module
  // has no imports and must keep none, so a name that merely resolves to a loopback
  // address is refused. That is the conservative direction and it is deliberate:
  // whether a service starts on plaintext transport must not depend on a resolver's
  // answer at startup.
  // -------------------------------------------------------------------------

  it('★★★ REFUSES disabled TRANSPORT TO A NON-LOOPBACK HOST, with NODE_ENV left unset', () => {
    // ★★★ THE CASE THE PRODUCTION RULE COULD NOT CATCH. No `NODE_ENV` at all, so the
    // resolved environment is the `development` default and the production branch is
    // never entered - and this must still be refused, because the host is remote.
    const planted = 'db.internal.invalid';

    // `LOOPBACK_DEVELOPMENT` supplies `DB_TLS_MODE: 'disabled'`, because the shared baseline is the
    // RECOMMENDED posture (`verify-identity`) rather than the plaintext one - see {@link
    // REQUIRED_ONLY}. Every case in this group is about `disabled`, so each one says so explicitly
    // instead of inheriting it, and the host below then overrides the overlay's loopback default.
    const problems = loadExpectingRefusal({ ...LOOPBACK_DEVELOPMENT, DB_HOST: planted });

    expectProblemMentioning(problems, 'DB_TLS_MODE');
    expectProblemMentioning(problems, 'loopback');
    // ★★ AND THE REFUSAL DOES NOT ECHO THE HOST BACK. `resolveRequired` states that
    // DB_HOST's value "is never echoed here" and `toJSON` redacts it from every
    // serialization, so a diagnostic that quoted it would be the one place this module
    // published it. The message names the variable, the rule and the accepted
    // spellings instead.
    expect(problems.join(' ')).not.toContain(planted);
  });

  it('refuses it just as firmly with NODE_ENV explicitly development or test', () => {
    // Plaintext to a remote host is wrong in EVERY environment. A development machine
    // reaching a shared staging database over the office network is the case the rule
    // exists for, and naming the environment does not license it.
    for (const environment of ['development', 'test']) {
      const problems = loadExpectingRefusal({
        ...LOOPBACK_DEVELOPMENT,
        DB_HOST: 'staging-db.example.com',
        NODE_ENV: environment,
      });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('refuses a name that would merely RESOLVE to loopback, because nothing is resolved here', () => {
    // `localhost.localdomain` and a private alias are both ordinary spellings that a
    // resolver would answer with 127.0.0.1. Accepting them would make the rule depend
    // on a lookup this module deliberately cannot perform.
    for (const resolvable of ['localhost.localdomain', 'my-local-db', 'db.localhost']) {
      const problems = loadExpectingRefusal({ ...LOOPBACK_DEVELOPMENT, DB_HOST: resolvable });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('accepts every documented loopback spelling', () => {
    // The set `slatwall-ts/.env.example` documents, and nothing wider. Brackets are
    // stripped and the match is case-folded, so a deployment is not refused over
    // notation.
    for (const loopback of [
      '127.0.0.1',
      '127.0.0.2',
      '127.1.2.3',
      '127.255.255.255',
      'localhost',
      'LOCALHOST',
      '::1',
      '[::1]',
      '0:0:0:0:0:0:0:1',
    ]) {
      const config = load({ ...LOOPBACK_DEVELOPMENT, DB_HOST: loopback });

      expect(config.tls.mode).toBe('disabled');
    }
  });

  it('refuses a near-miss that only LOOKS like a loopback literal', () => {
    // `127.0.0.999` is not an address, `1270.0.0.1` is not either, and neither
    // `227.0.0.1` nor a host that merely CONTAINS a loopback literal is local. The
    // pattern is anchored and each octet is bounded precisely so these fail.
    for (const nearMiss of [
      '127.0.0.999',
      '1270.0.0.1',
      '227.0.0.1',
      '127.0.0.1.evil.example',
      'evil.example/127.0.0.1',
      '0.0.0.0',
      '::2',
    ]) {
      const problems = loadExpectingRefusal({ ...LOOPBACK_DEVELOPMENT, DB_HOST: nearMiss });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('leaves a VERIFYING mode unaffected by the host, which is the whole point of the split', () => {
    // The rule constrains plaintext, not TLS. A remote host is the ordinary case for a
    // verifying mode and must not be caught by the loopback rule.
    for (const mode of ['verify-ca', 'verify-identity']) {
      // The anchor is supplied because `verify-ca` REQUIRES one (F47) - it omits the host-name
      // check, so the pinned authority is the only thing binding the connection to the intended
      // server. It is harmless under `verify-identity`, where the host name performs that binding,
      // which is what lets one load serve both modes and keeps this case about the HOST rule.
      const config = load({
        DB_HOST: 'db.internal.invalid',
        DB_TLS_MODE: mode,
        DB_TLS_CA: PINNED_AUTHORITY_PEM,
      });

      expect(config.tls.mode).toBe(mode);
    }
  });

  it('still refuses disabled in production even when the host IS loopback', () => {
    // The stricter posture sits ON TOP of the host rule rather than being replaced by
    // it: a production deployment cannot start on plaintext transport at all.
    const problems = loadExpectingRefusal({
      ...LOOPBACK_DEVELOPMENT,
      DB_HOST: '127.0.0.1',
      NODE_ENV: 'production',
    });

    expectProblemMentioning(problems, 'DB_TLS_MODE');
    expectProblemMentioning(problems, 'production');
  });

  it('reports the missing host rather than the transport mode when DB_HOST is absent', () => {
    // Two messages about one omission would point an operator at the wrong variable.
    // `resolveRequired` has already recorded the absence and the aggregate throw is
    // already guaranteed, so the loopback rule stays quiet.
    const problems = loadExpectingRefusal({ DB_HOST: '' });

    expectProblemMentioning(problems, 'DB_HOST');
    expect(problems.filter((problem) => problem.includes('loopback'))).toStrictEqual([]);
  });

  // -------------------------------------------------------------------------
  // LOG_LEVEL - the one key resolved LENIENTLY, and the one whose rejected value
  // must never survive resolution
  //
  // ★★ THE LENIENCY IS STRUCTURAL, NOT A CONCESSION, AND THESE CASES PIN BOTH
  // HALVES OF WHY. This module aborts a cold start on every other malformed value,
  // and it REPORTS that abort through `src/lib/logger.ts`. A threshold able to
  // abort would therefore produce a service that can neither start nor say why -
  // so a mistyped `LOG_LEVEL` is coerced to `info` and CLASSIFIED instead. The
  // classifier is what lets `src/handlers/bootstrap.ts` announce the coercion
  // without the value: an earlier arrangement had the logger echo the rejected
  // token onto the log stream and retain it for the life of the container, and the
  // shape it admitted was also the shape of an access key or a short bearer token.
  // -------------------------------------------------------------------------

  it('resolves a named level and records that it was configured', () => {
    for (const named of ['debug', 'info', 'warn', 'error'] as const) {
      const config = load({ LOG_LEVEL: named });

      expect(config.logging.level).toBe(named);
      expect(config.logging.levelSource).toBe('configured');
    }
  });

  it('matches a level without regard to case or surrounding whitespace', () => {
    // The same case-folding every other enumeration here gets, so `INFO` in a
    // deployment template is not a misconfiguration.
    expect(load({ LOG_LEVEL: 'DEBUG' }).logging).toStrictEqual({
      level: 'debug',
      levelSource: 'configured',
    });
    expect(load({ LOG_LEVEL: '  Warn  ' }).logging).toStrictEqual({
      level: 'warn',
      levelSource: 'configured',
    });
  });

  it('defaults to info when the key is absent, and says the key was unset', () => {
    expect(load().logging).toStrictEqual({ level: 'info', levelSource: 'defaulted-unset' });
  });

  it('treats a blank value as unset, because that is how a shell spells the default', () => {
    for (const blank of ['', '   ']) {
      expect(load({ LOG_LEVEL: blank }).logging).toStrictEqual({
        level: 'info',
        levelSource: 'defaulted-unset',
      });
    }
  });

  it('★★★ COERCES AN UNRECOGNIZED VALUE RATHER THAN REFUSING THE PROCESS', () => {
    // The one place in this file where a malformed value does not throw. Asserted as
    // an accepted load rather than as a refusal, because that IS the requirement.
    const config = load({ LOG_LEVEL: 'verbose' });

    expect(config.logging).toStrictEqual({
      level: 'info',
      levelSource: 'defaulted-unrecognized',
    });
    // And it did not become a problem hidden behind another key either: the rest of
    // the configuration resolved normally.
    expect(config.dialect).toBe('MySQL');
  });

  it('★★★ CARRIES NO PART OF THE REJECTED VALUE ANYWHERE IN THE RESOLVED CONFIGURATION', () => {
    // ★★★ THE DISCLOSURE HALF. The value is discarded at the point it fails to
    // match, so there is nothing for a diagnostic to echo later. Asserted over the
    // WHOLE serialized configuration rather than over `logging` alone, so a future
    // edit that stashed the raw token on some other member would fail here.
    const planted = 'AKIAPLANTEDNOTALEVEL9';

    const config = load({ LOG_LEVEL: planted });

    expect(config.logging.levelSource).toBe('defaulted-unrecognized');
    expect(JSON.stringify(config)).not.toContain(planted);
    expect(JSON.stringify(config.logging)).not.toContain('AKIA');
  });

  it('freezes the logging group like every other resolved group', () => {
    expect(Object.isFrozen(load({ LOG_LEVEL: 'warn' }).logging)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The serializable projection of the database settings
//
// `DatabaseConnectionSettings.toJSON` is the one member of this module whose job is
// to be LESS informative than the object it projects, so it needs its own cases.
// Code review raised the old projection as MINOR / Security - Least Privilege: it
// kept the schema name and the port visible, citing
// `src/repositories/mysql/connection.ts` as logging both - and that file had since
// withdrawn them from its pool-created line as "reconnaissance". The projection
// followed, and `src/handlers/bootstrap.ts` stopped republishing it altogether.
//
// So these cases are the only place the redaction is pinned. They matter more, not
// less, for the projection no longer appearing on the composition root: nothing
// downstream would notice if a member came back.
// ---------------------------------------------------------------------------

describe('the serializable projection of the database settings', () => {
  /** The marker the module substitutes. Spelled out rather than imported: it is the contract. */
  const REDACTED = '[REDACTED]';

  it('★★★ REPLACES ALL FIVE MEMBERS WITH THE MARKER, INCLUDING THE SCHEMA NAME AND THE PORT', () => {
    const projection = load().database.toJSON();

    // Asserted as a whole record rather than field by field, so a member added later is not
    // silently unredacted - the property the projection exists to guarantee.
    expect(projection).toStrictEqual({
      host: REDACTED,
      port: REDACTED,
      database: REDACTED,
      user: REDACTED,
      password: REDACTED,
    });
  });

  it('redacts rather than omits, so the shape still proves a decision was made', () => {
    const projection = load().database.toJSON();

    // ★ THE DISTINCTION IS DELIBERATE AND DOCUMENTED. A missing key is indistinguishable from a
    // field nobody remembered to add; a marker is evidence. `appConfig.load`'s own guarantee is
    // worded "redacted, not merely omitted", so the key set is part of the contract.
    expect(Object.keys(projection).sort()).toStrictEqual([
      'database',
      'host',
      'password',
      'port',
      'user',
    ]);
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('★★ LEAVES THE LIVE SETTINGS FULLY READABLE, because redaction is a projection not a loss', () => {
    // The other half, and the half a redaction can silently break: `connection.ts` builds a real
    // pool from these properties, so every one of them must still answer. The two defaults asserted
    // here are the two the projection used to publish - `Slatwall` from
    // [config/configApplication.cfm:L2] and the registered MySQL port - and this is now the only
    // place they are pinned.
    const settings = load().database;

    expect(settings.host).toBe('db.internal.invalid');
    expect(settings.port).toBe(3306);
    expect(settings.database).toBe('Slatwall');
    expect(settings.user).toBe('slatwall');
    expect(settings.password).toBe('unit-test-password');
  });

  it('★★★ KEEPS THE CREDENTIAL OUT OF EVERY SERIALIZATION AND ENUMERATION ROUTE', () => {
    const settings = load({ DB_PASSWORD: 'AKIAPLANTEDCREDENTIAL9' }).database;

    // `JSON.stringify` consults `toJSON`; the other three routes do not, and they are covered
    // because the credential is a private field behind a PROTOTYPE getter rather than an own
    // enumerable property. Each of the four is a distinct disclosure route, so each is asserted.
    expect(JSON.stringify(settings)).not.toContain('AKIA');
    expect(Object.keys(settings)).not.toContain('password');
    expect(JSON.stringify({ ...settings })).not.toContain('AKIA');
    // ★ THE STRINGIFICATION ROUTE, REACHED THROUGH `Object.prototype.toString` RATHER THAN
    // `String(settings)`. The direct spelling is what a template interpolation does, but
    // `@typescript-eslint/no-base-to-string` refuses it - and the thing the rule warns about, that a
    // class with no `toString` stringifies to `[object Object]`, is the exact property this case
    // relies on. Calling the base method explicitly asserts the same fact without suppressing a rule.
    expect(Object.prototype.toString.call(settings)).not.toContain('AKIA');
    expect(Object.prototype.toString.call(settings)).toBe('[object Object]');

    // And the property read still works, which is how `connection.ts` obtains it.
    expect(settings.password).toBe('AKIAPLANTEDCREDENTIAL9');
  });
});

// ---------------------------------------------------------------------------
// The database transport rules
//
// ★★★ TWO FINDINGS LIVE HERE, AND BOTH WERE ABOUT A GUARD THAT TESTED THE WRONG THING.
//
// F48 (CWE-319): `disabled` was refused only when `NODE_ENV` was explicitly `production`. `NODE_ENV`
// is OPTIONAL and defaults to `development`, so the most likely deployment - one that never set it -
// could send the account, the credential and every row to a REMOTE database in cleartext and the
// guard would not fire. The rule now tests the DESTINATION, in every environment.
//
// F47 (CWE-295): `verify-ca` is DEFINED by omitting the host-name check, so the trust anchor is the
// only thing binding the connection to the intended server - and an absent `DB_TLS_CA` trusted the
// entire public root store, which accepts any certificate signed by any public authority. And
// `verify-identity` against an IP literal cannot check a name it does not have, so it degraded to a
// chain-only check without saying so. Both combinations are now refused at start-up.
//
// Every case here asserts a START-UP outcome, because that is the only place these decisions are
// made: nothing downstream re-reads the environment, so a configuration that starts is one whose
// transport was approved.
// ---------------------------------------------------------------------------

/** A minimal but structurally valid PEM block: the delimiter is what the resolver checks for. */
const PINNED_AUTHORITY_PEM =
  '-----BEGIN CERTIFICATE-----\nZmFrZS1jZXJ0aWZpY2F0ZS1ib2R5\n-----END CERTIFICATE-----';

describe('appConfig.load - disabled transport is bound to a loopback destination (F48)', () => {
  it('★★★ REFUSES cleartext to a remote host when NODE_ENV is left at its default', () => {
    // THE EXACT DEFECT. No `NODE_ENV` at all, so it defaults to `development`, and the host is
    // remote. Under the old production-only rule this started and shipped credentials in the clear.
    const problems = loadExpectingRefusal({ DB_TLS_MODE: 'disabled' });

    expectProblemMentioning(problems, 'DB_TLS_MODE');
    expectProblemMentioning(problems, 'loopback');
    expectProblemMentioning(problems, 'NODE_ENV is not consulted');
  });

  it('refuses cleartext to a remote host in development and in test, not only in production', () => {
    for (const environment of ['development', 'test']) {
      const problems = loadExpectingRefusal({ NODE_ENV: environment, DB_TLS_MODE: 'disabled' });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('admits cleartext for every provable loopback spelling', () => {
    for (const host of ['localhost', 'LOCALHOST', '  localhost  ', '127.0.0.1', '::1', '[::1]']) {
      const config = load({ ...LOOPBACK_DEVELOPMENT, DB_HOST: host });

      expect(config.tls.mode).toBe('disabled');
    }
  });

  it('admits the WHOLE 127.0.0.0/8 block, because all of it is reserved for loopback', () => {
    for (const host of ['127.0.0.1', '127.0.0.2', '127.1.2.3', '127.255.255.254']) {
      expect(load({ ...LOOPBACK_DEVELOPMENT, DB_HOST: host }).tls.mode).toBe('disabled');
    }
  });

  it('refuses a host that is merely PRIVATE or a bind wildcard, which are not loopback', () => {
    // A private address still leaves the machine, and `0.0.0.0` is a bind-to-everything wildcard
    // rather than a destination. Neither is somewhere cleartext is safe.
    for (const host of ['10.0.0.5', '192.168.1.20', '172.16.0.9', '0.0.0.0', '128.0.0.1']) {
      const problems = loadExpectingRefusal({ DB_TLS_MODE: 'disabled', DB_HOST: host });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('refuses a host that merely CONTAINS a loopback name', () => {
    for (const host of ['localhost.attacker.invalid', 'notlocalhost', 'my-localhost-proxy']) {
      const problems = loadExpectingRefusal({ DB_TLS_MODE: 'disabled', DB_HOST: host });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('still refuses cleartext in production even when the destination IS loopback', () => {
    // The second, independent guard, kept rather than replaced: F48 asks that the loopback rule apply
    // regardless of NODE_ENV, not that production stop being refused. Holding both is stronger.
    const problems = loadExpectingRefusal({
      ...LOOPBACK_DEVELOPMENT,
      NODE_ENV: 'production',
    });

    expectProblemMentioning(problems, 'production');
  });

  it('reports the MISSING HOST alone when DB_HOST is absent, not a transport refusal as well', () => {
    // ★ ALSO INVERTED, AND FOR A REASON THAT IS NOT A PREFERENCE. This case asked for both refusals
    // at once - "an unresolved host is not a loopback host" - while the loopback group above asserts
    // the opposite, that the transport rule stays quiet so two messages about ONE omission do not
    // point an operator at two variables. Only one of those can hold.
    //
    // The security outcome is identical either way, which is what makes this a diagnostics question
    // rather than a safety one: `DB_HOST` is required, so the aggregate refusal is already guaranteed
    // and no cleartext connection is opened on either reading. The deciding factor is that the
    // surviving message deliberately does not describe a host it was never given - it is the same
    // branch as the non-disclosure case above, and a clause reading "it is unset or blank" would be
    // this module characterizing a value it does not have.
    //
    // What matters is preserved and asserted: the process still REFUSES, and it names DB_HOST.
    const problems = loadExpectingRefusal({
      DB_TLS_MODE: 'disabled',
      DB_HOST: '',
    });

    expectProblemMentioning(problems, 'DB_HOST');
    expect(problems.filter((problem) => problem.includes('loopback'))).toStrictEqual([]);
  });

  it('does NOT echo the rejected host, because the module states it never does', () => {
    // ★ THIS CASE WAS WRITTEN THE OTHER WAY UP - "echoes the rejected host, because a destination is
    // not a credential" - and the reasoning behind it is sound in isolation: a host name is not a
    // secret, and quoting it is the fastest way for an operator to see their own typo.
    //
    // It is inverted here because the module does not get to choose per message. `buildConfiguration`
    // appends a fixed footer to EVERY aggregate refusal - "No value of DB_HOST, DB_USER or
    // DB_PASSWORD is echoed above, by design" (`src/lib/config.ts`) - and `src/lib/logger.ts` cites
    // that same sentence as the reason it may report a configuration failure at all. A message that
    // quoted the host would print the value and a claim that it had not, in one refusal, and would
    // falsify an invariant a second module depends on. The narrower fix - deleting the footer - would
    // trade a self-consistent guarantee for one diagnostic convenience.
    //
    // The operator is not left without a remedy: the message names the VARIABLE, the RULE and the
    // accepted spellings, which is what the assertions below pin.
    const problems = loadExpectingRefusal({
      DB_TLS_MODE: 'disabled',
      DB_HOST: 'db.remote.invalid',
    });

    expect(problems.join(' ')).not.toContain('db.remote.invalid');
    expectProblemMentioning(problems, 'DB_HOST');
    expectProblemMentioning(problems, 'localhost');
  });
});

describe('appConfig.load - certificate validation cannot be weaker than its mode claims (F47)', () => {
  it('★★★ REFUSES verify-ca with no pinned trust anchor', () => {
    const problems = loadExpectingRefusal({ DB_TLS_MODE: 'verify-ca' });

    expectProblemMentioning(problems, 'DB_TLS_CA');
    expectProblemMentioning(problems, 'omits the host-name check');
  });

  it('admits verify-ca once the anchor is pinned, and carries it through', () => {
    const config = load({ DB_TLS_MODE: 'verify-ca', DB_TLS_CA: PINNED_AUTHORITY_PEM });

    expect(config.tls.mode).toBe('verify-ca');
    expect(config.tls.certificateAuthority).toContain('BEGIN CERTIFICATE');
  });

  it('still admits verify-identity WITHOUT an anchor, because the host name performs the binding', () => {
    // The asymmetry is the whole point and is asserted rather than assumed: the public root store is a
    // sound anchor exactly when something else binds the certificate to the intended server.
    const config = load({ DB_TLS_MODE: 'verify-identity' });

    expect(config.tls.mode).toBe('verify-identity');
    expect(config.tls.certificateAuthority).toBeUndefined();
  });

  it('★★★ REFUSES verify-identity against an IP literal, in every spelling', () => {
    for (const host of ['203.0.113.7', '127.0.0.1', '[2001:db8::1]', '2001:db8::1', '::1']) {
      const problems = loadExpectingRefusal({ DB_TLS_MODE: 'verify-identity', DB_HOST: host });

      expectProblemMentioning(problems, 'IP literal');
    }
  });

  it('offers verify-ca with a pinned anchor as the documented route to an IP-addressed host', () => {
    // The refusal above is only defensible if a way forward exists, so the way forward is asserted:
    // an operator who genuinely reaches the database by address pins the anchor and loses only the
    // host-name check, which an address could not have supplied anyway.
    const config = load({
      DB_TLS_MODE: 'verify-ca',
      DB_HOST: '203.0.113.7',
      DB_TLS_CA: PINNED_AUTHORITY_PEM,
    });

    expect(config.tls.mode).toBe('verify-ca');
    expect(config.tls.certificateAuthority).toContain('BEGIN CERTIFICATE');
  });

  it('leaves the PEM shape check and the protocol floor working under the new rules', () => {
    const malformed = loadExpectingRefusal({ DB_TLS_MODE: 'verify-ca', DB_TLS_CA: 'not-a-pem' });
    expectProblemMentioning(malformed, 'PEM');

    const floored = load({
      DB_TLS_MODE: 'verify-ca',
      DB_TLS_CA: PINNED_AUTHORITY_PEM,
      DB_TLS_MIN_VERSION: 'TLSv1.3',
    });
    expect(floored.tls.minimumVersion).toBe('TLSv1.3');
  });

  it('ignores a leftover anchor under disabled, which has no handshake to use it', () => {
    const config = load({ ...LOOPBACK_DEVELOPMENT, DB_TLS_CA: PINNED_AUTHORITY_PEM });

    expect(config.tls.mode).toBe('disabled');
    expect(config.tls.certificateAuthority).toBeUndefined();
  });
});
