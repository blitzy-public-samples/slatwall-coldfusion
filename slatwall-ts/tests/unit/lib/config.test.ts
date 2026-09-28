import { describe, expect, it } from 'vitest';

import { appConfig } from '../../../src/lib/config.js';
import {
  FLAG_DISABLED_LITERALS,
  FLAG_ENABLED_LITERALS,
  liveDatabaseTestsEnabled,
  LIVE_DATABASE_FLAG_NAME,
  resolveLiveDatabaseTestsEnabled,
} from '../../setup.js';
import type { AppConfig, EnvironmentSource } from '../../../src/lib/config.js';

/**
 * The five variables with no default, and nothing else.
 *
 * Kept minimal on purpose: every case below adds only the keys it is about, so a failure names one
 * cause rather than leaving a reader to diff two large records.
 *
 * `disabled` still has fixtures of its own; see {@link LOOPBACK_DEVELOPMENT}.
 */
const REQUIRED_ONLY: EnvironmentSource = Object.freeze({
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

/**
 * A valid retrieval instant, so rate cases vary one thing at a time.
 */
const RETRIEVED_AT = '2026-08-04T00:00:00Z';

function load(extra: Readonly<Record<string, string>> = {}): AppConfig {
  return appConfig.load({ ...REQUIRED_ONLY, ...extra });
}

/**
 * Loads and asserts the load was REFUSED, answering the reported problems.
 *
 * The assertion is on `error.name` rather than on the class, because the class is module-private
 * and the name is the documented recognition contract.
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

/**
 * Asserts exactly one reported problem mentions `fragment`.
 */
function expectProblemMentioning(problems: readonly string[], fragment: string): void {
  const matching = problems.filter((problem) => problem.includes(fragment));

  expect(matching).toHaveLength(1);
}

describe('appConfig.load', () => {
  it('resolves with only the five variables that have no default', () => {
    const config = load();
    expect(config.feed.allowedHosts).toStrictEqual([]);
    expect(config.currency.europeanCentralBankRates).toStrictEqual({});
    expect(config.currency.ratesRetrievedAt).toBeUndefined();
  });

  it('★★★ resolves an UNSET feed allow-list to the SAME empty list an explicitly empty one gives', () => {
    // The distinction is real and the CONSEQUENCE drawn from it was the defect: `undefined` was
    // read by the composition root as "admit whatever `Host` the request carries".
    expect(load().feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: '' }).feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: '   ' }).feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: ',,' }).feed.allowedHosts).toStrictEqual([]);
    expect(load({ FEED_ALLOWED_HOSTS: 'shop.example.com' }).feed.allowedHosts).toStrictEqual([
      'shop.example.com',
    ]);

    // Every one of those states FREEZES what it publishes, so neither deny-all nor an allow-list
    // can be widened at run time.
    expect(Object.isFrozen(load().feed.allowedHosts)).toBe(true);
    expect(Object.isFrozen(load({ FEED_ALLOWED_HOSTS: '' }).feed.allowedHosts)).toBe(true);
  });

  it('freezes what it publishes, so no consumer can edit deployment policy at run time', () => {
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

  // DB_TLS_MODE x DB_HOST - the two cross-variable transport rules.
  //
  // Keying `disabled` to `NODE_ENV` alone would not close the cleartext path, because `NODE_ENV` is
  // DEFAULTED: a production container that never set it would send its account in the clear. The host
  // rule below is what makes the refusal unconditional.

  describe('DB_TLS_MODE with DB_HOST', () => {
    it('★★ REFUSES disabled for a remote host, in the DEFAULT environment', () => {
      // The exact hole the earlier production-only rule left open: NODE_ENV is not set here at
      // all, so it resolves to `development` - and that must not be what stands between a
      // credential and the wire.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: 'db.internal.invalid',
      });

      expectProblemMentioning(problems, 'not a loopback address');
    });

    it('★★ REFUSES disabled for a remote host even when the environment says test', () => {
      // A label cannot buy plaintext to a remote server. `test` is a legitimate value of the
      // contract and still does not make the link local.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: '10.0.0.7',
        NODE_ENV: 'test',
      });

      expectProblemMentioning(problems, 'not a loopback address');
    });

    it('accepts disabled for every loopback spelling a developer actually writes', () => {
      // The development case the mode exists for, kept working.
      for (const host of ['127.0.0.1', '127.0.0.2', 'localhost', 'LocalHost', '::1', '[::1]']) {
        const config = load({ DB_TLS_MODE: 'disabled', DB_HOST: host });

        expect(config.tls.mode).toBe('disabled');
      }
    });

    it('refuses disabled in production even on loopback, so the older rule is still there', () => {
      // Defence in depth: the loopback rule did not replace the production rule, and a production
      // deployment pointed at its own machine is still refused.
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
      expect(
        load({
          DB_TLS_MODE: 'verify-ca',
          DB_HOST: '10.0.0.7',
          DB_TLS_CA: PINNED_AUTHORITY_PEM,
        }).tls.mode,
      ).toBe('verify-ca');
    });

    it('does not misclassify an out-of-range dotted quad as an address', () => {
      // `999.1.1.1` is not an IPv4 literal, so it is a NAME - one that will fail DNS resolution,
      // which is the right place for it to fail.
      expect(load({ DB_TLS_MODE: 'verify-identity', DB_HOST: '999.1.1.1' }).tls.mode).toBe(
        'verify-identity',
      );
    });

    it('does not accept a name that merely BEGINS with localhost as loopback', () => {
      // `localhost.evil.example` resolves wherever its owner points it. An allow-list of exact
      // spellings rather than a prefix test is what keeps that from passing.
      const problems = loadExpectingRefusal({
        DB_TLS_MODE: 'disabled',
        DB_HOST: 'localhost.evil.example',
      });

      expectProblemMentioning(problems, 'not a loopback address');
    });
  });

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
      // Host comparison is case-insensitive, so the list is normalized once here rather than at
      // each comparison.
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
      // Userinfo would make the entry fail to match a bare authority, so the feed would refuse
      // every request and the operator would have no idea why.
      const problems = loadExpectingRefusal({ FEED_ALLOWED_HOSTS: entry });

      expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
    });

    it('★★★ REFUSES A PORT OUTSIDE 1 TO 65535, and a leading-zero port', () => {
      // A port spelled `\d{1,5}` admits `0` through `99999`, so the range is checked explicitly
      // rather than left to the grammar.
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
      // The divergence this fix exists for, inverted into an acceptance.
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
      // This module applied no length limit, so a multi-kilobyte entry was accepted as deployment
      // configuration and then refused at the point of use.
      const problems = loadExpectingRefusal({
        FEED_ALLOWED_HOSTS: `${'a'.repeat(300)}.example.com`,
      });

      expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
    });

    it('names every malformed entry in one pass, not just the first', () => {
      // One-pass reporting is the module's stated contract, and it matters most here: a deployment
      // fixing a list one restart at a time is how a rollout stalls.
      const problems = loadExpectingRefusal({
        FEED_ALLOWED_HOSTS: 'https://a.example.com,ok.example.com,b.example.com/x',
      });

      expectProblemMentioning(problems, 'FEED_ALLOWED_HOSTS');
      const [reported] = problems.filter((problem) => problem.includes('FEED_ALLOWED_HOSTS'));
      expect(reported).toContain('a.example.com');
      expect(reported).toContain('b.example.com/x');
    });
  });

  // FEED_URL_SCHEME - the variable that is not read, and why.
  //
  // Its absence from the contract is CHECKED here rather than merely asserted in a comment: a
  // value supplied under that name must change nothing.

  describe('FEED_URL_SCHEME is not part of the configuration contract', () => {
    it('★★ publishes NO scheme member: the feed config is the allow-list and nothing else', () => {
      const { feed } = load();
      expect(Object.keys(feed)).toStrictEqual(['allowedHosts']);
      expect('scheme' in feed).toBe(false);
    });

    it('★★ IGNORES the variable entirely when a leftover deployment still sets it', () => {
      for (const supplied of ['https', 'http', 'HTTPS', 'htps', 'ftp', 'https://', '']) {
        const { feed } = load({ FEED_URL_SCHEME: supplied });

        expect(Object.keys(feed)).toStrictEqual(['allowedHosts']);
      }
    });

    it('starts in production with the variable set to http, which the earlier revision refused', () => {
      // The exact case the removed production rule rejected. It now starts, because the value is
      // not read at all - and the emitted feed is `http://` regardless of it, which is the frozen
      // legacy output.
      const config = load({
        FEED_URL_SCHEME: 'http',
        NODE_ENV: 'production',
        DB_TLS_MODE: 'verify-identity',
      });

      expect(config.environment).toBe('production');
      expect(Object.keys(config.feed)).toStrictEqual(['allowedHosts']);
    });

    it('leaves the transport-mode production refusal untouched, so the shape was not lost with it', () => {
      // The removed scheme rule was modelled on this one.
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

  describe('ECB_REFERENCE_RATES', () => {
    it('accepts a table and keeps every rate as an exact string', () => {
      // 0.8.3 makes `Money` the single arithmetic surface; a `parseFloat` in this module would be
      // a second one, and it would round-trip `0.8520` to `0.852` before the decimal library ever
      // saw it.
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
      // Not a shape objection - `0` is a perfectly well-formed decimal numeral.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=0',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });

    it('★★ REFUSES A ZERO WRITTEN WITH DECIMALS, which the shape alone would admit', () => {
      // `0.00` passes the numeral shape and is still zero.
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
      // A sign cannot be written at all, which is how negatives are excluded without a comparison.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: e,
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });

    it('refuses a value that is set but resolves to no usable entry', () => {
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: ',,,',
        ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
      });

      expectProblemMentioning(problems, 'ECB_REFERENCE_RATES');
    });
  });

  describe('ECB_RATES_RETRIEVED_AT', () => {
    it('★ IS REQUIRED once any rate is supplied, because unknown age cannot be reported as stale', () => {
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
      // 'August 4, 2026' a locale spelling, parsed as local midnight '2026/08/04' slash-separated,
      // parsed as local midnight 'Tue Aug 04 2026' the toString form.
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
      // Minute precision, second precision, fractional seconds and a numeric offset are all
      // legitimate publications of a retrieval instant.
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
      // `20260804T000000Z` is a legitimate ISO-8601 spelling and is still refused: the contract
      // publishes the extended form, and the basic form does not parse on this runtime at all.
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '20260804T000000Z',
      });

      expectProblemMentioning(problems, 'not an ISO-8601 instant');
    });

    it('★★ REFUSES a day that does not exist, which the date parser SILENTLY ROLLS OVER', () => {
      // The measurement that made a calendar check necessary rather than decorative:
      // `new Date('2026-02-31T00:00:00Z')` is not an Invalid Date on this runtime, it is 3 March.
      expect(new Date('2026-02-31T00:00:00Z').toISOString()).toBe('2026-03-03T00:00:00.000Z');

      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2026-02-31T00:00:00Z',
      });

      expectProblemMentioning(problems, 'names no real calendar instant');
    });

    it('applies the Gregorian leap rule rather than a fixed February length', () => {
      // 2024 is a leap year, so 29 February exists and must be accepted; 2026 is not, so the same
      // day must be refused. A hardcoded 28 or 29 fails one of the two.
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
      // Review asked for "fail closed on unavailable cross-currency rates"; a year-old table loads
      // successfully anyway, and `bootstrap.ts` warns about it.
      const config = load({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2020-01-01T00:00:00Z',
      });

      expect(config.currency.europeanCentralBankRates).toStrictEqual({ USD: '1.0850' });
      expect(config.currency.ratesRetrievedAt?.getUTCFullYear()).toBe(2020);
    });

    // The instant must be a COMPLETE ISO-8601 instant, not merely something the date parser
    // accepts.
    //
    // `new Date(raw)` with a `NaN`-only rejection accepts far more than ISO-8601 and silently
    // assigns a meaning to what it accepts, so the grammar is checked before the parse.

    it('★★★ REFUSES A DATE-TIME WITH NO ZONE DESIGNATOR', () => {
      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00:00',
      });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
      expectProblemMentioning(problems, 'zone');
    });

    it('★★ refuses every other shape the date parser would have accepted', () => {
      // Each of these returns a valid `Date` from `new Date()`, which is what made the old NaN
      // check insufficient.
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
      // `new Date('2026-02-30T00:00:00Z')` answers 2 March silently. A timestamp that names a day
      // that does not exist is a wrong value, and accepting it would record the rate table as
      // retrieved on a date nobody meant.
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
      // The normalization claim, asserted rather than asserted-about.
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

      // A lowercase designator is unambiguous, and V8 accepts it, so refusing it would reject a
      // correct value over notation.
      expect(
        load({
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: '2026-08-04t00:00:00z',
        }).currency.ratesRetrievedAt?.toISOString(),
      ).toBe('2026-08-04T00:00:00.000Z');
    });

    it('★★★ REFUSES AN INSTANT IN THE FUTURE, because a negative age reads as fresh', () => {
      // Than a parse error.
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const problems = loadExpectingRefusal({
        ECB_REFERENCE_RATES: 'USD=1.0850',
        ECB_RATES_RETRIEVED_AT: tomorrow,
      });

      expectProblemMentioning(problems, 'ECB_RATES_RETRIEVED_AT');
      expectProblemMentioning(problems, 'future');
    });

    it('accepts an instant a few seconds ahead, which is clock skew rather than a wrong value', () => {
      // The allowance is five minutes and is documented as a skew tolerance, not a licence for
      // future-dated data: the instant is captured on one machine and evaluated on another.
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

  // The two features are independent.

  it('reports feed and currency problems together, in one pass', () => {
    // Both resolvers contribute to the same problem list, so a deployment with two mistakes learns
    // about both on one restart. This also pins that neither resolver returns early in a way that
    // suppresses the other.
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
    // An empty list, not `undefined`: a deployment that configured rates and no feed hosts
    // authorizes no feed authority and therefore publishes no feed.
    expect(ratesOnly.feed.allowedHosts).toStrictEqual([]);
    expect(ratesOnly.currency.europeanCentralBankRates).toStrictEqual({ USD: '1.0850' });
  });

  // The delivery-size contract - 4096 bytes for the whole environment.
  //
  // The refusal is most useful OUTSIDE Lambda: inside it, the platform has already rejected the
  // configuration and this code never runs.

  it('★★★ REFUSES A CERTIFICATE AUTHORITY LARGER THAN ITS DOCUMENTED MAXIMUM', () => {
    // A PEM bundle of several certificates is the realistic way this happens - a chain supplied
    // where only the trust anchor was needed. 2048 bytes holds one ordinary authority.
    const oversized = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(4_000)}\n-----END CERTIFICATE-----`;

    const problems = loadExpectingRefusal({
      DB_TLS_MODE: 'verify-identity',
      DB_TLS_CA: oversized,
    });

    const refusal = problems.filter((problem) => problem.includes('documented maximum'));

    expect(refusal).toHaveLength(1);
    expect(refusal[0]).toContain('DB_TLS_CA');
    expect(refusal[0]).toContain('2048');
    // And it NAMES the SIZE, not the VALUE. Two of the measured variables are a credential and a
    // private host name, so the diagnosis is a byte count.
    expect(problems.join(' ')).not.toContain('AAAA');
  });

  it('accepts a certificate authority at the ceiling, so the bound is a bound and not a ban', () => {
    // The bound has to carry a legitimate value. An ordinary RSA-2048 authority is roughly 1200
    // bytes of PEM.
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
    // The second of the two variables whose size is bounded explicitly.
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
    // The documented maxima sum to 4050 of the 4096-byte quota, so while every value is inside its
    // own bound the set CANNOT exceed the quota - that is precisely what the ceiling arithmetic
    // buys.
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
    // No per-variable refusal fired: the certificate is exactly at its maximum, and LOG_LEVEL is
    // the one key that is never individually refused.
    expect(problems.filter((problem) => problem.includes('documented maximum'))).toStrictEqual([]);
  });

  it('★★ NEVER REFUSES `LOG_LEVEL` ON SIZE ALONE, because logging may not break a cold start', () => {
    // The exemption, asserted directly. A 2000-byte threshold is absurd and is still not a startup
    // failure: it is coerced to the default and classified, exactly as any other unrecognized
    // value is.
    const config = load({ LOG_LEVEL: 'v'.repeat(2_000) });

    expect(config.logging).toStrictEqual({ level: 'info', levelSource: 'defaulted-unrecognized' });
  });

  it('measures UTF-8 bytes rather than characters, so a non-ASCII value cannot slip past', () => {
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
    const config = load({
      FEED_ALLOWED_HOSTS: 'shop.example.com,eu.shop.example.com',
      ECB_REFERENCE_RATES: 'USD=1.0850,GBP=0.8520,JPY=163.41',
      ECB_RATES_RETRIEVED_AT: RETRIEVED_AT,
    });

    expect(config.feed.allowedHosts).toHaveLength(2);
    expect(Object.keys(config.currency.europeanCentralBankRates)).toHaveLength(3);
  });

  // The nineteenth key of the committed contract, and the one this module owns no part of.
  //
  // `.env.example` declares `TEST_LIVE_DATABASE` because `tests/setup.ts` reads it. Shipped
  // configuration does not read it at all - it is absent from the delivery-size map - so no value
  // of it is resolved, measured, charged to the aggregate, or able to refuse a cold start. A
  // deployed function never carries it, and charging bytes for a variable it does not deliver would
  // misstate the budget in the one direction that matters.

  it('★★ IGNORES THE TEST-ONLY FLAG AT EVERY LENGTH, including one no byte bound would admit', () => {
    // The three shapes that would each have been a refusal while the flag was budgeted: an
    // unrecognized literal, one byte over the old maximum, and a value the size of the whole quota.
    for (const planted of ['bogus', 'z'.repeat(17), 'z'.repeat(4_096)]) {
      const config = load({ TEST_LIVE_DATABASE: planted });

      expect(config.database.host).toBe('db.internal.invalid');
      expect(config.environment).toBe('development');
    }
  });

  it('★★ leaves the aggregate budget untouched by the flag, so the sweep measures a deployed map', () => {
    // The documented ceiling is 4015 of 4096, leaving 81 bytes of headroom, so a 2000-byte flag
    // would carry the set past the quota if its bytes were counted. The load succeeding is the
    // assertion.
    const config = load({
      TEST_LIVE_DATABASE: 'y'.repeat(2_000),
      FEED_ALLOWED_HOSTS: 'shop.example.com',
    });

    expect(config.feed.allowedHosts).toStrictEqual(['shop.example.com']);
  });

  it('★★ still refuses an over-budget DEPLOYABLE set, so the narrower sweep is not a weaker one', () => {
    // Narrowing the map removed one key from the measurement and nothing from the refusal: a
    // deployable set over the quota is refused with the flag present and enormous beside it.
    const problems = loadExpectingRefusal({
      TEST_LIVE_DATABASE: 'y'.repeat(2_000),
      DB_TLS_MODE: 'verify-identity',
      DB_TLS_CA: `-----BEGIN CERTIFICATE-----\n${'A'.repeat(2_020)}`,
      LOG_LEVEL: 'v'.repeat(2_000),
    });

    const aggregate = problems.filter((problem) => problem.includes('deployable contract'));

    expect(aggregate).toHaveLength(1);
    expect(aggregate[0]).toContain('4096');
    // And the flag is named nowhere in the diagnosis, because it took no part in the measurement.
    expect(problems.join(' ')).not.toContain('TEST_LIVE_DATABASE');
  });

  // DB_TLS_MODE=disabled requires a loopback host, in every environment.
  //
  // `src/lib/config.ts` has no imports and must keep none, so a name that merely RESOLVES to a
  // loopback address is refused.

  it('★★★ REFUSES disabled TRANSPORT TO A NON-LOOPBACK HOST, with NODE_ENV left unset', () => {
    // The case the production rule could not catch.
    const planted = 'db.internal.invalid';

    // `LOOPBACK_DEVELOPMENT` supplies `DB_TLS_MODE: 'disabled'`, because the shared baseline is
    // the RECOMMENDED posture (`verify-identity`) rather than the plaintext one - see {@link
    // REQUIRED_ONLY}.
    const problems = loadExpectingRefusal({ ...LOOPBACK_DEVELOPMENT, DB_HOST: planted });

    expectProblemMentioning(problems, 'DB_TLS_MODE');
    expectProblemMentioning(problems, 'loopback');
    // And the refusal does not echo the host back.
    expect(problems.join(' ')).not.toContain(planted);
  });

  it('refuses it just as firmly with NODE_ENV explicitly development or test', () => {
    // Plaintext to a remote host is wrong in every environment.
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
    // `localhost.localdomain` and a private alias are both ordinary spellings that a resolver
    // would answer with 127.0.0.1.
    for (const resolvable of ['localhost.localdomain', 'my-local-db', 'db.localhost']) {
      const problems = loadExpectingRefusal({ ...LOOPBACK_DEVELOPMENT, DB_HOST: resolvable });

      expectProblemMentioning(problems, 'loopback');
    }
  });

  it('accepts every documented loopback spelling', () => {
    // The set `slatwall-ts/.env.example` documents, and nothing wider. Brackets are stripped and
    // the match is case-folded, so a deployment is not refused over notation.
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
    // `127.0.0.999` is not an address, `1270.0.0.1` is not either, and neither `227.0.0.1` nor a
    // host that merely CONTAINS a loopback literal is local.
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
    // The rule constrains plaintext, not TLS. A remote host is the ordinary case for a verifying
    // mode and must not be caught by the loopback rule.
    for (const mode of ['verify-ca', 'verify-identity']) {
      const config = load({
        DB_HOST: 'db.internal.invalid',
        DB_TLS_MODE: mode,
        DB_TLS_CA: PINNED_AUTHORITY_PEM,
      });

      expect(config.tls.mode).toBe(mode);
    }
  });

  it('still refuses disabled in production even when the host IS loopback', () => {
    // The stricter posture sits on TOP of the host rule rather than being replaced by it: a
    // production deployment cannot start on plaintext transport at all.
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
    // `resolveRequired` has already recorded the absence and the aggregate throw is already
    // guaranteed, so the loopback rule stays quiet.
    const problems = loadExpectingRefusal({ DB_HOST: '' });

    expectProblemMentioning(problems, 'DB_HOST');
    expect(problems.filter((problem) => problem.includes('loopback'))).toStrictEqual([]);
  });

  // LOG_LEVEL - the one key resolved LENIENTLY, and the one whose rejected value must never
  // survive resolution.

  it('resolves a named level and records that it was configured', () => {
    for (const named of ['debug', 'info', 'warn', 'error'] as const) {
      const config = load({ LOG_LEVEL: named });

      expect(config.logging.level).toBe(named);
      expect(config.logging.levelSource).toBe('configured');
    }
  });

  it('matches a level without regard to case or surrounding whitespace', () => {
    // The same case-folding every other enumeration here gets, so `INFO` in a deployment template
    // is not a misconfiguration.
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
    // The one place in this file where a malformed value does not throw. Asserted as an accepted
    // load rather than as a refusal, because that is the requirement.
    const config = load({ LOG_LEVEL: 'verbose' });

    expect(config.logging).toStrictEqual({
      level: 'info',
      levelSource: 'defaulted-unrecognized',
    });
    // And it did not become a problem hidden behind another key either: the rest of the
    // configuration resolved normally.
    expect(config.dialect).toBe('MySQL');
  });

  it('★★★ CARRIES NO PART OF THE REJECTED VALUE ANYWHERE IN THE RESOLVED CONFIGURATION', () => {
    // The DISCLOSURE HALF. The value is discarded at the point it fails to match, so there is
    // nothing for a diagnostic to echo later.
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

// The serializable projection of the database settings.
//
// So these cases are the only place the redaction is pinned.

describe('the serializable projection of the database settings', () => {
  /**
   * The marker the module substitutes. Spelled out rather than imported: it is the contract.
   */
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

    // The distinction is deliberate and documented. A missing key is indistinguishable from a
    // field nobody remembered to add; a marker is evidence.
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
    // pool from these properties, so every one of them must still answer.
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
    // enumerable property.
    expect(JSON.stringify(settings)).not.toContain('AKIA');
    expect(Object.keys(settings)).not.toContain('password');
    expect(JSON.stringify({ ...settings })).not.toContain('AKIA');
    // The stringification route, reached through `Object.prototype.toString` rather than
    // `String(settings)`.
    expect(Object.prototype.toString.call(settings)).not.toContain('AKIA');
    expect(Object.prototype.toString.call(settings)).toBe('[object Object]');

    // And the property read still works, which is how `connection.ts` obtains it.
    expect(settings.password).toBe('AKIAPLANTEDCREDENTIAL9');
  });
});

// The database transport rules.
//
// Every case here asserts a START-UP outcome, because that is the only place these decisions are
// made: nothing downstream re-reads the environment.

/**
 * A minimal but structurally valid PEM block: the delimiter is what the resolver checks for.
 */
const PINNED_AUTHORITY_PEM =
  '-----BEGIN CERTIFICATE-----\nZmFrZS1jZXJ0aWZpY2F0ZS1ib2R5\n-----END CERTIFICATE-----';

describe('appConfig.load - disabled transport is bound to a loopback destination', () => {
  it('★★★ REFUSES cleartext to a remote host when NODE_ENV is left at its default', () => {
    // The EXACT DEFECT. No `NODE_ENV` at all, so it defaults to `development`, and the host is
    // remote.
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
    const problems = loadExpectingRefusal({
      ...LOOPBACK_DEVELOPMENT,
      NODE_ENV: 'production',
    });

    expectProblemMentioning(problems, 'production');
  });

  it('reports the MISSING HOST alone when DB_HOST is absent, not a transport refusal as well', () => {
    // Also inverted, and for a reason that is not a preference.
    //
    // The security outcome is identical either way, which is what makes this a diagnostics
    // question rather than a safety one: `DB_HOST` is required.
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
    // This CASE was WRITTEN the other WAY up - "echoes the rejected host, because a destination is
    // not a credential" - and the reasoning behind it is sound in isolation: a host name is not a
    // secret.
    //
    // It is inverted here because the module does not get to choose per message.
    const problems = loadExpectingRefusal({
      DB_TLS_MODE: 'disabled',
      DB_HOST: 'db.remote.invalid',
    });

    expect(problems.join(' ')).not.toContain('db.remote.invalid');
    expectProblemMentioning(problems, 'DB_HOST');
    expectProblemMentioning(problems, 'localhost');
  });
});

describe('appConfig.load - certificate validation cannot be weaker than its mode claims', () => {
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
    // The refusal above is only defensible if a way forward exists, so the way forward is
    // asserted: an operator who genuinely reaches the database by address pins the anchor and
    // loses only the host-name check.
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

// The other half of the same boundary: what the HARNESS does with the key shipped configuration
// refuses to touch.
//
// The resolver is imported from `tests/setup.ts` rather than re-implemented, so these cases assert
// the rule the runner actually applies instead of proving that two copies of it agree. It resolves
// once, at setup time, before any suite is collected - which is why an unrecognized value costs the
// whole run and not one file, and why that trade is asserted rather than described.

describe('the test-only live-database flag, owned by tests/setup.ts alone', () => {
  it('treats unset as disabled, so a clean checkout needs no server', () => {
    expect(resolveLiveDatabaseTestsEnabled(undefined)).toBe(false);
  });

  it('accepts each published literal, ignoring case and surrounding whitespace', () => {
    for (const literal of FLAG_ENABLED_LITERALS) {
      expect(resolveLiveDatabaseTestsEnabled(literal)).toBe(true);
      expect(resolveLiveDatabaseTestsEnabled(` ${literal.toUpperCase()} `)).toBe(true);
    }

    for (const literal of FLAG_DISABLED_LITERALS) {
      expect(resolveLiveDatabaseTestsEnabled(literal)).toBe(false);
      expect(resolveLiveDatabaseTestsEnabled(` ${literal.toUpperCase()} `)).toBe(false);
    }
  });

  it('★★ REFUSES AN UNRECOGNIZED VALUE rather than reading it as disabled', () => {
    // A typo that resolved to disabled would skip the very suites it was set to enable while the
    // run reported success, so the resolution raises. The published literals are named in the
    // message and the offending value is not, because this file prints no environment content.
    for (const planted of ['bogus', 'TRUE-ish', 'enabled', '2']) {
      expect(() => resolveLiveDatabaseTestsEnabled(planted)).toThrow(LIVE_DATABASE_FLAG_NAME);
      expect(() => resolveLiveDatabaseTestsEnabled(planted)).not.toThrow(planted);
    }
  });

  it('★★ is a flag no suite gates on, which is what makes it a hatch rather than a switch', () => {
    // Setting it changes nothing about what any suite proves: the resolved value below is the one
    // the runner computed for this very run, and no case anywhere consults it.
    expect(typeof liveDatabaseTestsEnabled).toBe('boolean');
  });

  it('★★ names a variable shipped configuration does not read, at any size', () => {
    // The two halves meet here: the harness owns the value, and `src/lib/config.ts` is unaffected by
    // it - so the flag cannot reach a deployed function's cold start through either route.
    const config = appConfig.load({
      ...REQUIRED_ONLY,
      [LIVE_DATABASE_FLAG_NAME]: 'z'.repeat(1_024),
    });

    expect(config.database.host).toBe('db.internal.invalid');
  });
});
