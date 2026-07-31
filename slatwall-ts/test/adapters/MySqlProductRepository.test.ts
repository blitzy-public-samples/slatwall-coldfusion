/**
 * The product importer's import-source policy gate — SEC-08.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/adapters/MySqlProductRepository.test.ts` | CREATE
 * | "**NET-NEW**", and the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS, AND WHAT IT DELIBERATELY DOES NOT
 * =============================================================================================
 * ⚠️ THE ADAPTER ITSELF DOES NOT EXIST YET, AND THIS FILE DOES NOT PRETEND OTHERWISE.
 * `src/adapters/mysql/MySqlProductRepository.ts` is enumerated by AAP 0.4.1.7 but is absent from this
 * checkpoint — `src/adapters/` currently holds only `mysql/rowMappers.ts` and
 * `settings/StaticSettingResolver.ts`. What exists, and what this file covers, is the POLICY GATE the
 * adapter's `importFromFile` is contracted to receive: `validateProductImportSource` in
 * `src/ports/repositories/ProductRepository.ts`. It lives in this file rather than a new one because
 * this is the AAP-enumerated home for coverage of `model/dao/ProductDAO.cfc`'s importer, and inventing
 * an un-enumerated `test/ports/**` file would be the very scope drift finding 18 objects to.
 *
 * NOT COVERED HERE, because it is impossible here rather than merely omitted: every ADDRESS-level
 * defence the port states as an adapter obligation — resolving the approved host and refusing private,
 * loopback, link-local or instance-metadata addresses; connecting to the address that was vetted rather
 * than re-resolving; re-validating each redirect hop; and enforcing the byte and time bounds while
 * streaming. All four need a resolver or a live socket, so they belong to the adapter, and asserting
 * them against a pure string predicate would misrepresent what the predicate does. The gate closes the
 * NAME half of CWE-918; the adapter must close the ADDRESS half.
 *
 * ALSO NOT COVERED: the importer's own behaviour — the per-row transaction boundary (mismatch M3), the
 * empty spreadsheet branch, the delimiter map and the `void` return contract. Those arrive with the
 * adapter.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 verified that no legacy DAO test exists at
 * all — "**No** `SkuDAOTest` or `OptionDAOTest` exists" — and there is likewise no `ProductDAOTest`.
 * Nothing here extends a legacy assertion, and none is labelled as though it did (AAP 0.8.3.7).
 */
import type { ProductImportSourcePolicy } from '../../src/ports/repositories/ProductRepository';
import { validateProductImportSource } from '../../src/ports/repositories/ProductRepository';

/**
 * A policy that permits exactly one scheme and one host.
 *
 * ⛔ EVERY VALUE HERE IS A TEST FIXTURE, NOT A RECOMMENDED DEFAULT. The port declares no default for any
 * of the five members precisely so that no figure in source can be mistaken for policy (AAP 0.7.3 S9,
 * IR-12), and these numbers exist only so the cases below have something concrete to refuse against.
 */
const POLICY: ProductImportSourcePolicy = {
  allowedSchemes: ['https'],
  allowedHosts: ['feeds.example'],
  maximumResponseBytes: 1_048_576,
  requestTimeoutMs: 30_000,
  maximumRedirects: 2,
};

const APPROVED = 'https://feeds.example/catalog/products.csv';

describe('product import source — SEC-08 policy gate', () => {
  it('NET-NEW — approves an allowlisted host on an allowlisted scheme', () => {
    expect(validateProductImportSource(APPROVED, POLICY)).toBe(APPROVED);
  });

  it('NET-NEW — returns the candidate BYTE-FOR-BYTE, normalising nothing', () => {
    /*
     * The WHATWG parse lower-cases the scheme and host internally, and a normalising validator would
     * hand back that rewritten form. It must not: the value that was checked has to be the value that
     * gets fetched, or the check applies to a different URL than the request does.
     */
    const asTyped = 'HTTPS://Feeds.Example/Catalog/Products.csv';
    expect(validateProductImportSource(asTyped, POLICY)).toBe(asTyped);
  });

  it('NET-NEW — matches scheme and host case-insensitively and tolerates padded policy entries', () => {
    const padded: ProductImportSourcePolicy = {
      ...POLICY,
      allowedSchemes: [' HTTPS '],
      allowedHosts: [' Feeds.Example '],
    };
    expect(validateProductImportSource(APPROVED, padded)).toBe(APPROVED);
  });

  it('NET-NEW — refuses every scheme outside the policy, including the non-HTTP SSRF reach', () => {
    for (const candidate of [
      'file:///etc/passwd',
      'ftp://feeds.example/products.csv',
      'gopher://feeds.example/1',
      'dict://feeds.example:2628/show',
      'sftp://feeds.example/products.csv',
      'data:text/csv,productCode',
      'http://feeds.example/products.csv',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses embedded credentials, whose visible host is NOT the parsed host', () => {
    /*
     * `https://feeds.example@evil.test/x` reads as the approved host to a human and parses to
     * `evil.test`. The userinfo form is refused outright rather than parsed and trusted — the assertion
     * below pins the parse so the reason stays visible to a future reader.
     */
    expect(new URL('https://feeds.example@evil.test/x').hostname).toBe('evil.test');

    for (const candidate of [
      'https://feeds.example@evil.test/x.csv',
      'https://feeds.example:secret@evil.test/x.csv',
      'https://user:pass@feeds.example/x.csv',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses suffix-confusion and sibling-subdomain hosts', () => {
    // Exactly the failures a wildcard or suffix rule would have admitted, which is why
    // `allowedHosts` offers neither.
    for (const candidate of [
      'https://feeds.example.attacker.test/x.csv',
      'https://notfeeds.example/x.csv',
      'https://evil.feeds.example/x.csv',
      'https://feeds.example./x.csv',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses the internal targets an unbounded fetch would have reached', () => {
    /*
     * These are refused HERE only because they are not allowlisted names. That is NOT the same as an
     * address check: an approved name that RESOLVES to one of these addresses still reaches the adapter,
     * which is why the port makes address vetting an adapter obligation rather than implying this case
     * closed it.
     */
    for (const candidate of [
      'https://169.254.169.254/latest/meta-data/',
      'http://169.254.169.254/latest/meta-data/',
      'https://127.0.0.1/admin',
      'https://localhost/admin',
      'https://[::1]/admin',
      'https://10.0.0.5/internal',
      'https://metadata.google.internal/computeMetadata/v1/',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses a candidate that is not an absolute URL, rather than resolving it', () => {
    for (const candidate of [
      '',
      '   ',
      '/catalog/products.csv',
      'products.csv',
      'https://',
      '://x',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — an empty scheme or host allowlist refuses everything', () => {
    // Treated as a deliberate "imports disabled" policy, not as a misconfiguration to second-guess:
    // guessing would mean inventing a fallback scheme or host.
    expect(
      validateProductImportSource(APPROVED, { ...POLICY, allowedSchemes: [] }),
    ).toBeUndefined();
    expect(validateProductImportSource(APPROVED, { ...POLICY, allowedHosts: [] })).toBeUndefined();
  });

  it('NET-NEW — refuses to approve anything when a bound is not a positive safe integer', () => {
    /*
     * A `NaN`, `Infinity`, zero or negative bound degrades silently to "no bound at all", so an
     * unbounded policy must approve nothing however sound the URL is. The bounds are checked BEFORE the
     * URL for exactly that reason.
     */
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
      expect(
        validateProductImportSource(APPROVED, { ...POLICY, maximumResponseBytes: bad }),
      ).toBeUndefined();
      expect(
        validateProductImportSource(APPROVED, { ...POLICY, requestTimeoutMs: bad }),
      ).toBeUndefined();
    }
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(
        validateProductImportSource(APPROVED, { ...POLICY, maximumRedirects: bad }),
      ).toBeUndefined();
    }
  });

  it('NET-NEW — a host-less URL is refused even if its scheme is misguidedly allowlisted', () => {
    /*
     * DEFENCE IN DEPTH, and the only way to reach the empty-host guard. `file:` URLs parse with an empty
     * host, so an operator who allowlisted `file` would otherwise have a candidate that satisfies the
     * scheme clause and then vacuously "matches" no host at all. The guard refuses it outright: a URL
     * with no host can never be a member of a host allowlist, so approving one would mean approving a
     * location the policy never named. This is deliberately not reachable through the fixture policy —
     * it is asserted against a policy no operator should write, precisely because they might.
     */
    expect(new URL('file:///etc/passwd').hostname).toBe('');

    const misguided: ProductImportSourcePolicy = {
      ...POLICY,
      allowedSchemes: ['file'],
      allowedHosts: ['feeds.example', ''],
    };
    expect(validateProductImportSource('file:///etc/passwd', misguided)).toBeUndefined();
  });

  it('NET-NEW — zero redirects is a valid policy, not an unset one', () => {
    expect(validateProductImportSource(APPROVED, { ...POLICY, maximumRedirects: 0 })).toBe(
      APPROVED,
    );
  });

  it('NET-NEW — refusal carries no reason, so no caller can use it as a policy oracle', () => {
    /*
     * Every refusal is the same single `undefined`. A per-clause reason code would tell a remote caller
     * which schemes and hosts are configured — the reconnaissance half of the SSRF this gate closes.
     */
    const refusals = [
      validateProductImportSource('file:///etc/passwd', POLICY),
      validateProductImportSource('https://evil.test/x.csv', POLICY),
      validateProductImportSource('https://feeds.example@evil.test/x.csv', POLICY),
      validateProductImportSource('not a url', POLICY),
    ];
    expect(new Set(refusals)).toEqual(new Set([undefined]));
  });
});
