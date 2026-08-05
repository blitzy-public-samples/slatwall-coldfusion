// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the shared caller-principal resolver
//
// WHAT THIS PINS
//   src/handlers/requestPrincipal.ts - the ONE place in the TypeScript / AWS
//   Lambda `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing
//   slice (`version.txt` = `3.1.39`) that decides who a request is from.
//
//   The module exists because a security review found (CRITICAL, CWE-306 and
//   CWE-862) that four of the five capability entrypoints affirmatively declined
//   to derive a caller principal and therefore served every anonymous request,
//   and that one of them accepted an `accountID` from the REQUEST BODY (CRITICAL,
//   CWE-639) and threaded it straight into the pricing scope. Both are closed by
//   making one function the only source of a caller identity, and by making its
//   unidentified outcome a REFUSAL rather than a logged-out state.
//
//   Four properties are therefore load-bearing and each has cases below:
//
//     1. FAIL CLOSED. No authorizer context, a `null` one, an array, a missing
//        claim, a blank claim or a non-string claim all yield `identified: false`.
//        Never a principal, and never a principal carrying an empty identifier.
//     2. THE ADMIN BIT IS CONSERVATIVE. API Gateway STRINGIFIES authorizer context
//        values, so `true` arrives as `"true"`; the closed truthy set admits that
//        and `"1"` folding case, and refuses everything else. A permissive reading
//        would hand out administrative reach.
//     3. KEY CASE IS FOLDED, exactly as a CFML struct folds it, so a deployment's
//        claim casing cannot silently decide whether a request is identified.
//     4. NOTHING ELSE ABOUT THE EVENT IS READ - not a header, not a query
//        parameter, not the body, and above all NOT `requestContext.identity`,
//        whose members include API-key and access-key fields.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE
// PRESENTED AS PARITY.
// ---------------------------------------------------------------------------
//   There is no legacy antecedent for this module and none for the handler tier
//   at all. The only legacy suites extended anywhere in this port are
//   [meta/tests/unit/entity/BrandTest.cfc] and
//   [meta/tests/unit/entity/ProductTest.cfc]; the third file touching the slice,
//   [meta/tests/functional/admin/entity/ProductTest.cfc], is an empty stub
//   contributing zero coverage. The legacy CONCEPT this module reproduces is real
//   - FW/1's `secureMethods`/`anyAdminMethods` gating, and the ambient-scope
//   account read at [model/service/PriceGroupService.cfc:L262-L268] - but no
//   legacy TEST asserts anything about it, and no case below is presented as one.
//
// NO USER RULES WERE PROVIDED
//   The project rules source returns exactly that. No rule is invented here and
//   no assertion is attributed to one; each traces to the plan, to a cited legacy
//   locator, or to the module's own documented contract.
// ---------------------------------------------------------------------------

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it } from 'vitest';

import {
  AUTHORIZER_ACCOUNT_CLAIM,
  AUTHORIZER_ADMIN_CLAIM,
  resolveRequestPrincipal,
} from '../../../src/handlers/requestPrincipal.js';
import type { RequestPrincipal } from '../../../src/handlers/requestPrincipal.js';

/** An account identifier shaped like the 32-character `Sw*` keys the schema uses. */
const ACCOUNT_ID = 'aa11bb22cc33dd44ee55ff6677889900';

/**
 * Build an API Gateway proxy event carrying the supplied authorizer context.
 *
 * ★ `requestContext.identity` IS A GETTER THAT THROWS, and that is the most
 * deliberate line in this builder. The subject must never read it: its members
 * include API-key and access-key fields, and its caller-controlled members are
 * transport metadata rather than verified claims. Standing the whole object in
 * with one throwing accessor makes an attempt to read it FAIL a case rather than
 * pass unnoticed, and keeps every credential-shaped identifier out of this file.
 *
 * Everything else is deliberately uninteresting: no body, no headers, no query
 * parameters and no path parameters, because the subject reads none of them and a
 * fixture that supplied them would suggest otherwise.
 */
function eventWithAuthorizer(authorizer: unknown): APIGatewayProxyEvent {
  const requestContext = {
    accountId: '',
    apiId: 'request-principal-suite',
    authorizer,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',

    get identity(): APIGatewayProxyEvent['requestContext']['identity'] {
      throw new Error(
        'event.requestContext.identity was read. The caller principal is derived from the ' +
          'authorizer context and from nothing else; identity carries credential-shaped members ' +
          'and caller-controlled transport metadata, neither of which is a verified claim.',
      );
    },

    path: '/catalog/products',
    stage: 'suite',
    requestId: 'c0ffee00-1111-2222-3333-444455556666',
    requestTimeEpoch: 1_700_000_000_000,
    resourceId: 'request-principal-suite-resource',
    resourcePath: '/catalog/products',
  } as unknown as APIGatewayProxyEvent['requestContext'];

  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/catalog/products',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/catalog/products',
    requestContext,
  };
}

/** Read the principal a case expects to have been established. */
function principalOf(event: APIGatewayProxyEvent): RequestPrincipal {
  const resolution = resolveRequestPrincipal(event);
  if (!resolution.identified) {
    throw new Error(`expected an identified caller, got ${resolution.reason}`);
  }
  return resolution.principal;
}

describe('an identified caller', () => {
  it('establishes the account from the authorizer claim', () => {
    const principal = principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID }));

    expect(principal.accountID).toBe(ACCOUNT_ID);
    expect(principal.adminAccountFlag).toBe(false);
  });

  it('trims the claim, so a padded value cannot reach a keyed account read as-is', () => {
    expect(
      principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: `  ${ACCOUNT_ID}\t` }))
        .accountID,
    ).toBe(ACCOUNT_ID);
  });

  it('folds claim-name case exactly as a CFML struct does', () => {
    // An authorizer emitting `accountId` and one emitting `accountID` name the
    // same claim. A case-sensitive index would let a deployment's key casing
    // decide whether a request is treated as identified.
    for (const spelling of ['accountId', 'ACCOUNTID', 'AccountID']) {
      expect(principalOf(eventWithAuthorizer({ [spelling]: ACCOUNT_ID })).accountID).toBe(
        ACCOUNT_ID,
      );
    }
  });

  it('freezes what it publishes, so a handler cannot substitute the account it was given', () => {
    const resolution = resolveRequestPrincipal(
      eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID }),
    );

    expect(Object.isFrozen(resolution)).toBe(true);
    expect(resolution.identified).toBe(true);
    if (resolution.identified) {
      expect(Object.isFrozen(resolution.principal)).toBe(true);
    }
  });
});

describe('the fail-closed direction', () => {
  it('refuses when the event carries no authorizer context at all', () => {
    const resolution = resolveRequestPrincipal(eventWithAuthorizer(undefined));

    expect(resolution.identified).toBe(false);
    if (!resolution.identified) {
      expect(resolution.reason).toBe('noAuthorizerContext');
    }
  });

  it('treats a null context as no context, because null is not an identity', () => {
    expect(resolveRequestPrincipal(eventWithAuthorizer(null)).identified).toBe(false);
  });

  it('refuses an array rather than indexing into it', () => {
    // An array is an `object` to `typeof` and is not a claim set.
    expect(resolveRequestPrincipal(eventWithAuthorizer([ACCOUNT_ID])).identified).toBe(false);
  });

  it('distinguishes a missing context from a context naming no usable account', () => {
    const resolution = resolveRequestPrincipal(eventWithAuthorizer({ unrelated: 'value' }));

    expect(resolution.identified).toBe(false);
    if (!resolution.identified) {
      // The distinction is DIAGNOSTIC only: a route deployed with no authorizer
      // in front of it is an operator problem, not a caller mistake. Neither
      // reason is ever published - the refusal builders accept no detail.
      expect(resolution.reason).toBe('noAccountClaim');
    }
  });

  it('refuses a blank or whitespace-only account claim', () => {
    for (const blank of ['', '   ', '\t\n']) {
      expect(
        resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: blank }))
          .identified,
      ).toBe(false);
    }
  });

  it('refuses a non-string account claim rather than coercing it', () => {
    for (const wrongKind of [42, true, {}, [], null]) {
      expect(
        resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: wrongKind }))
          .identified,
      ).toBe(false);
    }
  });

  it('cannot be satisfied through the prototype chain', () => {
    // The keyed read resolves a stored key through `Object.keys` narrowed by
    // `hasOwnProperty`, so the prototype chain is unreachable rather than merely
    // filtered. A context whose PROTOTYPE carries the claim identifies nobody.
    const inherited = Object.create({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID }) as object;

    expect(resolveRequestPrincipal(eventWithAuthorizer(inherited)).identified).toBe(false);
  });

  it('does not treat a claim literally named __proto__ as an identity', () => {
    const resolution = resolveRequestPrincipal(eventWithAuthorizer({ ['__proto__']: ACCOUNT_ID }));

    expect(resolution.identified).toBe(false);
  });
});

describe('the administrative claim', () => {
  function adminFlagFor(value: unknown): boolean {
    return principalOf(
      eventWithAuthorizer({
        [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
        [AUTHORIZER_ADMIN_CLAIM]: value,
      }),
    ).adminAccountFlag;
  }

  it('accepts the STRING renderings API Gateway actually delivers', () => {
    // ★ API Gateway stringifies every authorizer context value, so a boolean
    // `true` arrives as `"true"`. Accepting only a JavaScript boolean would make
    // the claim unsatisfiable behind a real authorizer and would refuse the
    // legitimate administrator while telling nobody why.
    for (const rendering of ['true', 'TRUE', 'True', '1', ' true ']) {
      expect(adminFlagFor(rendering)).toBe(true);
    }
  });

  it('accepts a real boolean, which a direct invoker or a suite can supply', () => {
    expect(adminFlagFor(true)).toBe(true);
    expect(adminFlagFor(false)).toBe(false);
  });

  it('refuses every other rendering, because a permissive read is a privilege decision', () => {
    for (const rejected of ['yes', 'admin', 'y', 'on', '2', '0', 'false', '', '   ']) {
      expect(adminFlagFor(rejected)).toBe(false);
    }
  });

  it('refuses a non-string, non-boolean claim', () => {
    for (const rejected of [1, {}, [], null, undefined]) {
      expect(adminFlagFor(rejected)).toBe(false);
    }
  });

  it('defaults to false when the claim is absent entirely', () => {
    expect(
      principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID })).adminAccountFlag,
    ).toBe(false);
  });

  it('never establishes an administrative principal without an account', () => {
    // The admin bit is meaningless on its own: an unidentified caller cannot be
    // an administrator, so the account claim gates the whole principal.
    expect(
      resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ADMIN_CLAIM]: 'true' })).identified,
    ).toBe(false);
  });
});

describe('what the resolver deliberately does not read', () => {
  it('never touches requestContext.identity', () => {
    // The fixture's `identity` throws. Both the identified and the unidentified
    // path must complete without it being read.
    expect(() =>
      resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID })),
    ).not.toThrow();
    expect(() => resolveRequestPrincipal(eventWithAuthorizer(undefined))).not.toThrow();
  });

  it('ignores an account identifier supplied anywhere a CALLER can write one', () => {
    // ★★ THE CROSS-ACCOUNT DISCLOSURE CASE. A body, a header and a query string
    // are all caller-authored. None of them may establish an identity, however
    // plausibly it is spelled.
    const forged = 'ffffffffffffffffffffffffffffffff';
    const event = eventWithAuthorizer(undefined);
    const tampered: APIGatewayProxyEvent = {
      ...event,
      body: JSON.stringify({ accountID: forged }),
      headers: { 'x-account-id': forged, accountID: forged },
      queryStringParameters: { accountID: forged },
      pathParameters: { accountID: forged },
    };

    expect(resolveRequestPrincipal(tampered).identified).toBe(false);
  });

  it('is total: no shape of authorizer context makes it throw', () => {
    for (const shape of [undefined, null, '', 'a string', 0, false, [], {}, new Date()]) {
      expect(() => resolveRequestPrincipal(eventWithAuthorizer(shape))).not.toThrow();
    }
  });
});
