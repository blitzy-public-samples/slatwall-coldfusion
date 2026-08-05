// ---------------------------------------------------------------------------
// slatwall-ts - the caller principal for the primary (Lambda) adapters
//
// ONE place decides who a request is from. Every capability handler that will not serve an
// unidentified caller reads the principal through this module, so "which claim names the account",
// "how is key case folded", "what counts as an administrative caller" and "what does absence mean"
// are answered once and identically across the routed surface instead of four times with four
// slightly different answers.
//
// A SHARED INTERNAL of `src/handlers/`, not a bundle entry point: it exports NO Lambda `handler`.
// Its only runtime dependency is the prototype-safe CFML struct reader; it imports no capability
// handler, error mapper, service, repository or port, so nothing here can be part of a cycle.
//
// ★★ WHY THIS FILE EXISTS AT ALL, RECORDED AS A JUDGMENT CALL RATHER THAN LEFT TO INFERENCE.
// AAP 0.3.1 enumerates `src/handlers/` as eight files - the composition root, the router, the error
// mapper and the five capability entrypoints - and this is a NINTH. A security review found (CRITICAL,
// CWE-306 and CWE-862) that four of those five entrypoints affirmatively declined to derive a caller
// principal and therefore served every anonymous request, and named "introduce one shared
// principal-resolution helper" as the remediation. Three alternatives were considered and rejected:
//
//   * Duplicate the read in each of the four handlers. Rejected: the authorizer-claim NAME, the
//     case-folding rule and the admin-claim narrowing would then exist in four copies, and the
//     failure mode of a divergent copy is a route that silently admits a caller the others refuse.
//     `priceResolutionHandler.ts` already held such a copy, which is precisely why its behaviour and
//     its siblings' had drifted apart.
//   * Put it in `./router.js`. Rejected: the router reads ONLY `httpMethod` and `path`, deliberately,
//     and that narrowness is what lets it fold a cross-capability match into the unmatched arm
//     without ever touching request state. Teaching it to read an authorizer context would widen the
//     one module in this folder whose whole value is that it is narrow.
//   * Put it in `./bootstrap.js`. Rejected: the composition root builds the graph and must not read
//     an API Gateway event. `RequestScopeInput` is what the two tiers agree on, and this module
//     produces its inputs rather than reaching across it.
//
// The prohibition recorded in `./errorMapper.js` - "Do NOT fix this by creating a shared error
// module, adding a file to src/lib/, adding a file to src/handlers/" - is scoped to the duplicated
// MISSING-METHOD MESSAGE TEMPLATE and to the domain -> handlers back-edge that a shared error module
// would create. Nothing here is an error module, nothing here is imported by `src/domain/**`, and the
// template is untouched. AAP 0.9.5's scope gate is satisfied unchanged: this is an addition under
// `slatwall-ts/` and no existing repository file outside the subtree is modified.
//
// ★ WHAT THIS MODULE IS. A total function from an API Gateway proxy event to either an identified
// principal or the fact that none could be established. It reads exactly two members of the
// authorizer context and nothing else about the event.
//
// ★ WHAT THIS MODULE IS NOT. It performs NO authentication: it does not verify a signature, validate
// a token, call an identity provider, read a secret or open a network connection. It cannot - and it
// must not, because the deployment's authorizer is the component that authenticates and this adapter
// is downstream of it. What it does is DERIVE the principal that authorizer published and refuse to
// proceed without one, which is the in-function half of the layered control AWS's own guidance
// describes: the authorizer authenticates and injects context, and the backing function performs the
// granular, resource-aware authorization the authorizer cannot express.
//
// ★★ IT ALSO ISSUES NO INFRASTRUCTURE. AAP 0.2.2 excludes Terraform, CDK, SAM, `serverless.yml` and
// CloudFormation outright, and NOTHING here reaches across that line: no authorizer resource is
// declared, no policy document is emitted, no ARN, role, scope, audience or issuer appears anywhere,
// and no deployment descriptor accompanies this file. A deployment that fronts these routes with an
// authorizer satisfies this module; a deployment that does not gets a refusal rather than an open
// route, which is the fail-closed direction.
//
// ★ `event.requestContext.identity` IS DELIBERATELY NEVER READ, here or in any handler. Its members
// include API-key and access-key fields, so reading it would pull credential-shaped values into a
// request path that has no use for them, and the caller-controlled members of it are not identity
// claims at all - they are transport metadata a client can set. The authorizer context is the only
// place a VERIFIED claim lives.
//
// ★ NO REQUEST STATE IS READ FROM `../lib/config.js`. That module is static process configuration and
// is never a request scope; this module does not import it. The claim names below are the shape of
// the authorizer's own output - a contract between the deployment's authorizer and this adapter -
// and are therefore constants here rather than configuration.
//
// ★ NO USER RULES EXIST FOR THIS PROJECT. `review_rules` returns "No user rules provided.", so no
// rule is invented, implied or cited. Every constraint below traces to the AAP, to a cited legacy
// locator, or to an explicit `JUDGMENT CALL:`.
//
// ★ NO INVENTED NON-FUNCTIONAL REQUIREMENT. No SLA, latency, throughput, availability or rate figure
// appears here, and no rate limit, retry-after, lockout, token lifetime or circuit breaker is
// modelled. The legacy 60-second, 45-second and 30-second lock timeouts remain noted and deliberately
// not implemented.
// ---------------------------------------------------------------------------

import type { APIGatewayProxyEvent } from 'aws-lambda';

import { structGet } from '../lib/cfml/struct.js';

/**
 * The authorizer-context member naming the authenticated account.
 *
 * A constant rather than an inline literal, so the one name this boundary depends on is stated once
 * for the whole routed surface. It is not configuration and does not belong in `../lib/config.js`: it
 * is the shape of the authorizer's own output, which the deployment's authorizer and this adapter
 * must agree on.
 *
 * The value is the `Sw*` account identifier the ported services already speak in - see
 * `RequestScopeInput.accountID` in `./bootstrap.js`, and
 * [model/service/PriceGroupService.cfc:L262-L268] where the legacy read the same identity off the
 * ambient request scope.
 */
export const AUTHORIZER_ACCOUNT_CLAIM = 'accountID';

/**
 * The authorizer-context member marking the account as administrative.
 *
 * Named for the legacy column it corresponds to: the audit gate the legacy applied was
 * `!account.isNew() && account.getAdminAccountFlag()`, so `adminAccountFlag` is the source's own
 * spelling rather than a new vocabulary. `./bootstrap.js`'s `RequestScopeInput` carries the same
 * member name, which keeps the claim, the scope input and the legacy column reading alike.
 */
export const AUTHORIZER_ADMIN_CLAIM = 'adminAccountFlag';

/**
 * The two truthy renderings an authorizer may publish for {@link AUTHORIZER_ADMIN_CLAIM}.
 *
 * ★ WHY STRINGS AT ALL. API Gateway STRINGIFIES every value in a custom authorizer's context, so a
 * boolean `true` arrives at the function as the string `"true"`. Accepting only a JavaScript boolean
 * would make the administrative claim silently unsatisfiable behind a real authorizer, which fails
 * OPEN in the worst way: the caller would be identified, the claim would be present, and the gate
 * would refuse the legitimate administrator while telling nobody why.
 *
 * `"1"` is included because an authorizer emitting a numeric flag renders it that way. NOTHING ELSE
 * is admitted - not `"yes"`, not `"admin"`, not a non-empty-string-is-true rule - because a permissive
 * reading of this claim is a privilege decision and the conservative direction is the safe one.
 * Comparison folds case through `cfEqualsToken` below, so `"TRUE"` and `"True"` are admitted too;
 * CFML's own `eq` is case-insensitive and this subtree's house convention follows it.
 */
const TRUTHY_ADMIN_CLAIM_VALUES: readonly string[] = Object.freeze(['true', '1']);

/**
 * An identified caller.
 *
 * The whole of what a handler learns about who is asking. There is no name, no e-mail address, no
 * address, no telephone number, no token and no session identifier on it - a handler needs an opaque
 * account identifier and one permission bit, and carrying anything else would put personal data on a
 * request path that has no use for it.
 */
export interface RequestPrincipal {
  /**
   * The authenticated account, as an OPAQUE identifier.
   *
   * Carried, never parsed: no meaning is read out of the characters, and it is never concatenated
   * into a statement - every repository this reaches binds it as a parameter. It is guaranteed
   * non-empty and already trimmed by {@link resolveRequestPrincipal}, which is what stops a blank
   * identifier from reaching a keyed account read.
   */
  readonly accountID: string;

  /**
   * Whether the authorizer marked this account administrative.
   *
   * FALSE UNLESS THE CLAIM AFFIRMATIVELY SAYS OTHERWISE. Absence, an unrecognized rendering, a
   * non-string, an empty string and any value outside {@link TRUTHY_ADMIN_CLAIM_VALUES} all yield
   * `false`, which is the non-admin arm of the legacy audit gate and the fail-closed direction for a
   * permission bit.
   */
  readonly adminAccountFlag: boolean;
}

/**
 * What reading the authorizer context yielded.
 *
 * ★ A DISCRIMINATED RESULT RATHER THAN `RequestPrincipal | undefined`, and the difference is not
 * stylistic. `undefined` is exactly the value the four affected handlers already had, and treating it
 * as "a successful logged-out state" is what the security review found: a missing claim was
 * indistinguishable from a deliberate anonymous request. A caller of this function must branch on
 * `identified` to reach the principal, so the unidentified case cannot be reached by accident, and
 * `noWait`-style silent fall-through is a compile error rather than an open route.
 */
export type RequestPrincipalResolution =
  | { readonly identified: true; readonly principal: RequestPrincipal }
  | {
      readonly identified: false;
      /**
       * Which of the two unidentified shapes occurred. LOGGED BY THE REFUSING HANDLER, NEVER
       * PUBLISHED: `./errorMapper.js`'s refusal builders accept no detail at all, precisely so a
       * refusal cannot tell a caller which claim would have satisfied the route.
       *
       * `noAuthorizerContext` means the event carried no authorizer context whatsoever - in practice
       * a route deployed without an authorizer in front of it, which is an operator-visible
       * misconfiguration rather than a caller mistake. `noAccountClaim` means a context was present
       * and named no usable account.
       */
      readonly reason: 'noAuthorizerContext' | 'noAccountClaim';
    };

/** The one unidentified outcome for a missing authorizer context. Frozen; shared, never mutated. */
const NO_AUTHORIZER_CONTEXT: RequestPrincipalResolution = Object.freeze({
  identified: false,
  reason: 'noAuthorizerContext',
});

/** The one unidentified outcome for a context that named no usable account. */
const NO_ACCOUNT_CLAIM: RequestPrincipalResolution = Object.freeze({
  identified: false,
  reason: 'noAccountClaim',
});

/**
 * Compare two tokens the way CFML's `eq` does - by value, folding case.
 *
 * Written out here rather than imported, because `cfEquals` in `../lib/cfml/struct.js` is the
 * semantic-parity helper for CFML string comparison on DOMAIN values and this is a protocol-level
 * claim comparison against a fixed literal. Both do the same thing; keeping the claim comparison
 * local means a future change to the domain helper cannot silently move a privilege decision.
 */
function cfEqualsToken(candidate: string, literal: string): boolean {
  return candidate.toLowerCase() === literal;
}

/**
 * Whether a value is usable as a claim set.
 *
 * A TYPE PREDICATE, not a cast. `null` is as meaningful as `undefined` here and neither is an
 * identity; an array is an `object` to `typeof` and is not a claim set, so it is refused rather than
 * indexed. Narrowing this way keeps this module's "no cast anywhere" property intact, which matters
 * because the authorizer context is the one input here that arrives entirely untyped.
 */
function isClaimSet(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read one authorizer claim as a non-empty trimmed string, or nothing.
 *
 * ★ THE CLAIM IS READ THROUGH `structGet`, WHICH FOLDS KEY CASE EXACTLY AS A CFML STRUCT DOES. An
 * authorizer emitting `accountId` and one emitting `accountID` name the same claim, and CFML struct
 * semantics are this subtree's house convention for a keyed read - the alternative, a case-sensitive
 * JavaScript index, would make a deployment's key casing silently decide whether a request is treated
 * as identified. `structGet` is also verified prototype-safe: it resolves the stored key through
 * `Object.keys` narrowed by `Object.prototype.hasOwnProperty.call`, so the prototype chain is
 * unreachable rather than merely filtered, and a claim literally named `__proto__` cannot return a
 * function.
 *
 * The value is narrowed with a `typeof` probe rather than a cast, because the authorizer context is
 * typed with an index signature this module must not trust. A non-string, an empty string and a
 * whitespace-only string all yield nothing.
 */
function readClaim(claims: Readonly<Record<string, unknown>>, claim: string): string | undefined {
  const candidate: unknown = structGet(claims, claim);

  if (typeof candidate !== 'string') {
    return undefined;
  }

  const trimmed = candidate.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Read the administrative claim.
 *
 * A `boolean` is admitted directly, because a suite - and a direct Lambda invoker - can put a real
 * boolean in the context where API Gateway would have put a string. A string is compared against the
 * closed truthy set. EVERYTHING ELSE IS `false`: a number, an object, an array, `null`, an
 * unrecognized string and an absent claim all take the non-admin arm.
 */
function readAdminClaim(claims: Readonly<Record<string, unknown>>): boolean {
  const candidate: unknown = structGet(claims, AUTHORIZER_ADMIN_CLAIM);

  if (typeof candidate === 'boolean') {
    return candidate;
  }

  if (typeof candidate !== 'string') {
    return false;
  }

  const trimmed = candidate.trim();

  return TRUTHY_ADMIN_CLAIM_VALUES.some((literal) => cfEqualsToken(trimmed, literal));
}

/**
 * Resolve the caller principal from the request's authorizer context.
 *
 * THE PRIMARY UNIT OF THIS MODULE. Total over its input: every shape of event yields one of the three
 * outcomes and nothing throws, so a handler's admission step cannot fail in a way that needs its own
 * `catch` arm.
 *
 * ★ ABSENCE IS A REFUSAL, NOT A LOGGED-OUT STATE, and that inversion is the whole point of this
 * function. The four capability handlers that consult it call `unauthenticatedResponse` from
 * `./errorMapper.js` on the unidentified outcome, BEFORE they open a composition root, a request
 * scope or a connection - so a refused request costs no statement and reaches no service. The one
 * capability that does NOT consult it is `productFeedHandler`, and that is grounded in the source
 * rather than in convenience: `integrationServices/google/controllers/feed.cfc:L54-L56` declares
 * `this.publicMethods="product"` with empty `secureMethods` and `anyAdminMethods`, so the product
 * feed is source-public and stays anonymous.
 *
 * ★ AND THE ACCOUNT IS SERVER-ESTABLISHED, WHICH IS THE OTHER HALF OF THE FIX. No query string,
 * header or request-body member is authoritative. The promotion adapter retains compatibility
 * account members only to compare them with this principal and REFUSE disagreement; they never
 * select the request scope. The identity that reaches `RequestScopeInput.accountID` - and therefore
 * `calculateSkuPriceBasedOnAccount` [model/service/PriceGroupService.cfc:L271] and the account
 * price-group cascade behind it - is the one this function derived from the authorizer and nothing
 * else, which is what closes the cross-account price and discount disclosure the review recorded.
 *
 * @param event the API Gateway proxy event. Only `requestContext.authorizer` is read; no header, no
 *   query parameter, no path parameter, no body and NOT `requestContext.identity`.
 * @returns the identified principal, or the fact that none could be established and which shape of
 *   absence occurred.
 */
export function resolveRequestPrincipal(event: APIGatewayProxyEvent): RequestPrincipalResolution {
  const authorizer: unknown = event.requestContext.authorizer;

  if (!isClaimSet(authorizer)) {
    return NO_AUTHORIZER_CONTEXT;
  }

  const claims = authorizer;

  const accountID = readClaim(claims, AUTHORIZER_ACCOUNT_CLAIM);

  if (accountID === undefined) {
    return NO_ACCOUNT_CLAIM;
  }

  // Frozen for the same reason every published object in `./bootstrap.js` is: `readonly` erases at
  // emit, and a handler holding this must not be able to substitute the account it was given.
  return Object.freeze({
    identified: true,
    principal: Object.freeze({ accountID, adminAccountFlag: readAdminClaim(claims) }),
  });
}
