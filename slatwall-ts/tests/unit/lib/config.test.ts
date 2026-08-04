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
 */
const REQUIRED_ONLY: EnvironmentSource = Object.freeze({
  DB_HOST: 'db.internal.invalid',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'unit-test-password',
  DB_TLS_MODE: 'disabled',
  DB_DIALECT: 'MySQL',
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

    expect(config.feed.allowedHosts).toStrictEqual([]);
    expect(config.currency.europeanCentralBankRates).toStrictEqual({});
    expect(config.currency.ratesRetrievedAt).toBeUndefined();
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
    expect(ratesOnly.feed.allowedHosts).toStrictEqual([]);
    expect(ratesOnly.currency.europeanCentralBankRates).toStrictEqual({ USD: '1.0850' });
  });
});
