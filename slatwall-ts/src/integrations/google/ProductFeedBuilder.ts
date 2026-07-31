/**
 * ProductFeedBuilder — the RSS 2.0 serializer for the Google merchant product feed, translated from
 * `integrationServices/google/views/feed/product.cfm:L1-L66`.
 *
 * WHERE THE REAL WORK LANDS
 * A view template being the primary source for a serializer class looks wrong until the folder split
 * is understood, so it is recorded before the code. Four legacy files were candidate homes for the
 * Google feed logic (AAP §0.6.4), and the shaping lives in none of the places a service-oriented
 * reading would predict:
 *
 *   - `integrationServices/google/Integration.cfc` (79 lines) — the interface-conformant component,
 *     carrying NO feed logic whatsoever. Its port, `GoogleIntegration.ts`, is therefore nearly
 *     empty BY FAITHFULNESS, not by neglect.
 *   - `integrationServices/google/controllers/feed.cfc` (74 lines) — RECORD SELECTION only: which
 *     SKUs appear. Its port is `ProductFeedQuery.ts` — ⚠️ NOT DELIVERED AT THIS CHECKPOINT (F19);
 *     planned in AAP §0.4.1.10.
 *   - `integrationServices/google/views/feed/product.cfm` (66 lines) — ALL of the data shaping.
 *     Its port is THIS FILE.
 *   - `integrationServices/google/model/dao/FeedDAO.cfc` (76 lines) — orphaned dead code with
 *     syntactically broken SQL and zero callers repository-wide. Deliberately NOT ported; the
 *     evidence is carried in `IntegrationContract.ts` and is not restated here, because that finding
 *     is owned there. ⚠️ F19: this previously named an undelivered `README.md`.
 *
 * A SERIALIZER, NOT A USER-INTERFACE COMPONENT
 * The output is RSS 2.0 XML in the `g:` namespace, consumed by a merchant feed processor rather than
 * rendered for a human (AAP §0.3.4). There is no user interface anywhere in this slice, no component
 * library and no design system to align to, so no component, template-engine or markup-helper idiom
 * is reached for: the class emits a string. The feed was built against the merchant specification
 * cited in the legacy view's own header at
 * `integrationServices/google/views/feed/product.cfm:L2-L7`,
 * http://support.google.com/merchants/bin/answer.py?hl=en&answer=188494&topic=2473824&ctx=topic#US —
 * a CFML server-side comment, so never part of the rendered feed. This builder emits no markup
 * comment of its own.
 *
 * EXPLICIT-INPUT TRANSLATION — three legacy globals become build-call data
 * The legacy view reads three pieces of ambient state, and each becomes an explicit member of
 * {@link ProductFeedRenderContext} so that a render is deterministic and testable with no database,
 * network, live SmartList, process environment, request scope or file system:
 *
 *   1. `CGI.HTTP_HOST` (`product.cfm:L14`, `L15`, `L22`, `L23`, `L24`) becomes
 *      {@link ProductFeedRenderContext.host} — a host authority, not a pre-normalised URL. The
 *      literal `http://` concatenation is reproduced exactly: the scheme is not upgraded to HTTPS,
 *      no slash is added or removed, and the host is neither trimmed nor normalised. It is however
 *      VALIDATED and BRANDED rather than raw — see DECISION G-1, which explains why the legacy's
 *      request-supplied host is the one input that could not be carried across unchanged.
 *   2. `now()` (`product.cfm:L30`, read twice) becomes {@link ProductFeedRenderContext.renderTime}.
 *      Nothing in this module constructs a date or reads a clock.
 *   3. `getTimeZoneInfo().utcHourOffset` (`product.cfm:L30`, read twice) becomes
 *      {@link ProductFeedRenderContext.utcHourOffset}, emitted RAW — see that member for why it is
 *      typed as text rather than as a number.
 *
 * And the loop subject: `rc.skuSmartList.getRecords()` (`product.cfm:L16`) becomes an already
 * materialised array of {@link ProductFeedRecord}. The builder never sees a SmartList, so it needs no
 * pagination, no query and no data-access dependency of any kind.
 *
 * THE THREE PORT SEAMS — TR-5 AT EVERY ONE OF THEM
 * TR-5 (AAP §0.1.2.2) requires that the scope boundary be crossed only through a declared port, with
 * the gap flagged at the member that crosses it. Three collaborators arrive by constructor injection
 * (AAP §0.7.3 S3 — no service locator, no dynamic lookup, no string-keyed resolution), and each is
 * flagged at the exact line that uses it:
 *
 *   - {@link PricingPort} — sale price and sale-price expiration cross the excluded
 *     calculated-property boundary of AAP §0.2.2.6 into the out-of-scope promotion subsystem.
 *   - {@link ImagePathPort} — the ONLY route to the primary resized image and to every additional
 *     resized image. Nothing here touches a file system, a path built-in or an object store.
 *   - {@link SettingResolverPort} — the only route to the two shipping-weight keys, to the product-URL
 *     key and to the missing-image key.
 *
 * M8 (AAP §0.6.6) — {@link SettingResolverPort} IS SYNCHRONOUS AND MUST NOT BE AWAITED. The legacy
 * setting engine launches a named out-of-band `cfthread`, and the port contract is declared
 * synchronous precisely so that no caller in this slice can come to depend on background completion.
 * The two asynchronous ports are asynchronous for a different and genuine reason: each performs real
 * I/O. The three shapes differ on purpose and are not harmonised.
 *
 * M2 (AAP §0.6.6) — `integrationServices/google/views/feed/product.cfm:L9` asks the CFML engine for a
 * 360-second request budget. That fits inside the target platform's function ceiling but exceeds what
 * a synchronous HTTP integration in front of it will generally allow, and those integration limits
 * vary by gateway type, region and configuration, so the effective ceiling has to be established
 * where the feed is actually published. Whether the feed is delivered asynchronously or streamed is
 * therefore an UNRESOLVED DECISION belonging to the planned Google feed handler under
 * `src/handlers/`. This builder deliberately sets no budget, no page size, no chunk size, no
 * re-attempt policy and no streaming policy: inventing one would breach AAP §0.7.3 S9, so M2 is CITED
 * here rather than resolved.
 *
 * M7 (AAP §0.6.6) — STATELESSNESS IS ABSOLUTE HERE. The legacy cached derived values in CFC
 * `variables` scope and leaned on `cacheuse="transactional"`. Nothing survives between invocations of
 * the target serverless runtime except module scope, so a warm container that held a rendered feed, a
 * resolved setting or a resolved image path could serve one tenant's catalogue to the next. This
 * module therefore holds NO mutable state: the only module-scope values are frozen literal constants
 * and every constructor parameter is `readonly`. Any memoization in this subtree is request-scoped and
 * lives elsewhere by design.
 *
 * TWO CONTRACTS THAT SIT WHERE A READER MAY NOT EXPECT
 *   1. THE SALE-PRICE MEMBERS LIVE ON THE DOMAIN ENTITY, AND ARE CALLED THERE. `src/domain/sku/Sku.ts`
 *      declares `getSalePrice` and `getSalePriceExpirationDateTime` as collaborator-injected
 *      asynchronous members taking the pricing lookup as a parameter, and names this file as the
 *      reason they were retained under TR-5. Calling them is strictly better than re-deriving them
 *      here: the legacy fallback of `model/entity/Sku.cfc:L546-L551` — sale price IF PRESENT, ELSE the
 *      ordinary price — already lives in the domain, so it is applied before the comparison below by
 *      construction; the boundary is still crossed only through {@link PricingPort}, since the injected
 *      lookup IS the port; and re-deriving would put two copies of the most drift-prone rule in the
 *      slice on either side of a layer boundary.
 *   2. `sku.setting(...)` IS NOT A MEMBER OF THE DOMAIN ENTITY, and is not used. The legacy
 *      `product.cfm:L58` calls it, and `model/entity/HibachiEntity.cfc:L129-L131` shows why it
 *      resolves: it forwards to the setting service with `object=this`, giving per-object hierarchical
 *      resolution. Here the two shipping-weight keys are read from {@link SettingResolverPort}
 *      directly, with an explicit SKU receiver context that reproduces that `object=this` behaviour.
 *
 * `Product` is imported as a type because two private members name it in their signatures.
 * `ProductType` and `Brand` are reached transitively through the product's own typed members and are
 * never named here, so they are deliberately NOT imported.
 *
 * ------------------------------------------------------------------------------------------------
 * THE ONE PLACE THIS FILE IS STRICTER THAN THE LEGACY, AND WHY THAT IS NOT A BEHAVIOUR CHANGE
 * ------------------------------------------------------------------------------------------------
 * Sixteen fields are emitted per item and only six of them are escaped, because only six are escaped
 * by the legacy view. That asymmetry is preserved exactly — see {@link escapeFeedText}, which explains
 * why blanket-escaping the document would corrupt every URL in it — but preservation alone left the
 * ten unescaped substitutions with NO grammar of any kind, and a `<` or `&` in any of them ends the
 * enclosing element and turns the rest of the value into markup. The legacy shared that exposure, and
 * the most reachable of the values is the host authority, which `product.cfm` takes from
 * `CGI.HTTP_HOST` — a client-supplied header — and feeds into FIVE separate sinks.
 *
 * Each raw sink therefore gets a POSITIVE, CONTEXT-SPECIFIC GRAMMAR that is enforced FAIL-CLOSED: a
 * conforming value is emitted byte-for-byte untouched, and a non-conforming one raises instead of
 * being escaped, sanitised or truncated. That choice is what keeps the hardening compatible with
 * AAP §0.6.7.7, under which D18 is the ONLY sanctioned departure from byte-for-byte preservation —
 * validating changes no valid byte, whereas escaping would change many. Every grammar is derived from
 * a standard or from repository source rather than chosen here, so AAP §0.7.3 S9 is satisfied and the
 * defect register of AAP §0.6.7 gains no entry. The grammars, their derivations and the reasoning are
 * in RAW-SINK VALIDATION below.
 *
 * COVERAGE PROVENANCE — NET-NEW
 * The planned suite for this module extends no legacy coverage, and no parity of coverage is claimed:
 * `meta/tests/` holds no test for `integrationServices/google/views/feed/product.cfm`, for its
 * controller or for its DAO. The legacy suite also ships no mocking library and boots the whole
 * framework application per test, so legacy tests are integration tests where the target's are unit
 * tests — a difference by design rather than a gap. What this module owes its suite in return is
 * testability without a database, a network, a live paginated query, a process environment, a request
 * scope or a filesystem, which is why every collaborator is a narrow interface satisfiable by a plain
 * object and every ambient legacy global is an explicit input.
 *
 * ARCHITECTURAL POSITION (AAP §0.7.3 S2, S4, S5)
 * `src/integrations/` may import downward into `ports/`, `domain/`, `util/` and `errors/`, and
 * nowhere else; this file imports from exactly those four. `src/adapters/settings/` in particular is
 * NOT reachable from here — setting DEFAULTS belong to that adapter, so this file emits precisely
 * what the resolver returns and invents no default of its own. No statement text, table name or
 * column name appears (S2); no platform-specific event or context type appears, since that coupling
 * is confined to `src/handlers/`; the process environment is never read, because configuration flows
 * one way through `src/config/`. The RSS document, the escaping and the time-of-day rendering are all
 * hand-built: the dependency set is frozen at one runtime package and this file adds nothing to it.
 */

import type { Product } from '../../domain/product/Product';
import type { ProductType } from '../../domain/product/ProductType';
import type { Sku } from '../../domain/sku/Sku';
import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import type { ImagePathPort, ResizedImagePathRequest } from '../../ports/ImagePathPort';
/* Runtime import: DECISION I-1's display tag. See the call site in the additional-image loop. */
import { toImageWebPath } from '../../ports/ImagePathPort';
import type { PricingPort } from '../../ports/PricingPort';
import type {
  SettingResolutionContext,
  SettingResolverPort,
} from '../../ports/SettingResolverPort';

/* ================================================================================================
 * INPUT TYPES — declared here, and deliberately only here
 *
 * The ports inventory is closed, so no new port file is created for any of these. Each is a narrow
 * local structural type in the established idiom of this subtree — `util/urlTitle.ts`'s
 * `UniqueValueProbe`, `services/BaseService.ts`'s `EntityPersister` and `OptionService.ts`'s
 * `SelectOption` are the precedents. No barrel, no shared `types` module and no options bag is
 * introduced: the folder is flat, holding four files at this checkpoint and six in AAP §0.4.1.10's
 * plan (F19), and none of them is a shared type bucket.
 * ============================================================================================= */

/* ------------------------------------------------------------------------------------------------
 * DECISION G-1 — THE FEED HOST IS A VALIDATED CONFIGURATION FACT, NOT A REQUEST VALUE
 * ------------------------------------------------------------------------------------------------
 * ⚠️ THIS IS A DECLARED HARDENING EXCEPTION, ON THE PRECEDENT OF DEFECT D18 (AAP §0.6.7.7), AND IT
 * IS THE FIRST OF THREE IN THIS FILE. It is recorded here rather than slipped in, so a reviewer
 * diffing this module against `integrationServices/google/views/feed/product.cfm` knows the
 * divergence is intended.
 *
 * WHAT THE LEGACY DID. `product.cfm` interpolates `CGI.HTTP_HOST` into all five of its absolute
 * URLs — `:L14`, `:L15`, `:L22`, `:L23` and `:L24` — with no validation of any kind. On the target
 * platform the equivalent value is the request's own `Host` header, which is supplied by whoever
 * calls the endpoint. Three consequences follow, and none of them needs an unusual deployment:
 *   1. XML STRUCTURE INJECTION. A `Host` header carrying `<`, `>` or `&` lands inside four element
 *      text nodes and can close an element and open new ones, so a caller can add or replace feed
 *      fields. That is the CWE-91 half of the finding.
 *   2. HOST ABUSE. Every product link, image link and additional-image link in the document is
 *      rebased onto whatever authority the caller names, so one request can produce an entire
 *      merchant feed pointing at somebody else's origin.
 *   3. A MALFORMED DOCUMENT. A bare `&` in a text node is not well-formed XML at all, so a single
 *      ampersand in the header makes the whole feed unparseable.
 *
 * WHAT HAPPENS INSTEAD. Two mechanisms, and they answer two different questions:
 *   - {@link FeedHostAuthority} answers "can this value break out of its element or change the
 *     origin?" — enforced by the compiler, because {@link validateFeedHostAuthority} is the only
 *     producer of the brand and the branding symbol is module-private and never exported.
 *   - The PROVENANCE obligation below answers "where did the value come from?" — which no type can
 *     enforce, and which is therefore stated as a contract on the caller.
 *
 * ⭐ THE PROVENANCE OBLIGATION, STATED ONCE AND OWED BY THE HANDLER LAYER. `GOOGLE_FEED_HOST` is
 * read and validated by `src/config/env.ts` (its DECISION F) and surfaces as
 * `config.googleFeed.host`. The deferred `src/handlers/googleFeedHandler.ts` MUST obtain the host
 * from there, pass it through {@link validateFeedHostAuthority}, and MUST NOT read the request's
 * `Host`, `X-Forwarded-Host` or `:authority` header, nor any other request-supplied value. This
 * module cannot check that — a `string` carries no provenance — so the obligation is recorded here
 * and is the reason the configuration variable exists at all.
 *
 * ⛔ NOT NORMALISED, AND NOT DEFAULTED. The value is emitted exactly as supplied: no case folding,
 * no trimming, no punycode conversion, no default port removal, no scheme upgrade to HTTPS and no
 * fallback host. Normalising would change emitted bytes for a legitimate value, and inventing a
 * default host would be exactly the fabrication AAP §0.7.3 S9 forbids. The `http://` literal stays
 * hardcoded in {@link HTTP_SCHEME_PREFIX} because that is what the legacy hardcodes
 * (AAP §0.8.2 guideline 4).
 * ---------------------------------------------------------------------------------------------- */

declare const FEED_HOST_AUTHORITY: unique symbol;

/**
 * A validated host authority — `host`, `host:port`, an IPv4 literal or a bracketed IPv6 literal —
 * safe to concatenate after `http://` and safe to place in an XML text node.
 *
 * ⛔ UNFORGEABLE. `FEED_HOST_AUTHORITY` is a module-private `unique symbol` that is never exported,
 * so no plain `string` is assignable here and {@link validateFeedHostAuthority} is the only route in.
 * That is what makes the raw request-header path a COMPILE error rather than a review finding.
 */
export type FeedHostAuthority = string & { readonly [FEED_HOST_AUTHORITY]: 'authority' };

/**
 * The complete set of characters a host authority may contain.
 *
 * An ALLOWLIST rather than a denylist, because a denylist has to anticipate every hostile character
 * and this has to anticipate none. The set is the union of what the three legal authority forms
 * need: letters and digits and the hyphen for DNS labels, the dot as the label separator, the colon
 * for the port separator and for IPv6 groups, the square brackets that delimit an IPv6 literal, and
 * the underscore, which appears in real internal host names even though it is not a legal DNS
 * hostname character.
 *
 * ⭐ WHAT THE SET EXCLUDES IS THE SECURITY SUBSTANCE, and every exclusion closes a specific route:
 *   - `<`, `>`, `&` and `"` — XML structure injection into four element text nodes.
 *   - `/` — a path, a scheme-relative authority, or a second URL smuggled in behind the first.
 *   - `@` — userinfo, which relocates the effective host to whatever follows it.
 *   - `?` and `#` — a query string or a fragment appended to every URL in the document.
 *   - `%` — a percent-encoded form of any of the above, decoded later by a consumer.
 *   - `\` — a Windows-style separator some parsers treat as `/`.
 *   - every whitespace and control character, including CR and LF.
 *   - `'` — not XML-significant in a text node, and excluded anyway because no authority form
 *     needs it. This is the one exclusion that is not closing an attack route; it costs nothing and
 *     keeps the set to exactly what the three legal forms require.
 */
const FEED_HOST_AUTHORITY_PATTERN = /^[A-Za-z0-9._:[\]-]+$/;

/** RFC 1035 §2.3.4 — the per-label octet ceiling {@link validateFeedHostAuthority} enforces. */
const MAXIMUM_DNS_LABEL_OCTETS = 63;

/**
 * Validates a host authority and brands it for use as {@link ProductFeedRenderContext.host}.
 *
 * ⛔ IT VALIDATES SYNTAX, NOT PROVENANCE. A caller that hands it the request's `Host` header will
 * get a branded value back whenever that header happens to be syntactically ordinary. The brand
 * closes the injection and origin-rebasing routes; it does NOT and cannot certify that the value
 * came from configuration. See the PROVENANCE OBLIGATION in DECISION G-1 above — that half is owed
 * by `src/handlers/googleFeedHandler.ts`.
 *
 * ⚠️ THE MESSAGE NAMES THE RULE AND NEVER ECHOES THE CANDIDATE, matching the reporting discipline
 * `src/config/env.ts` applies to every environment value it rejects: a diagnostic that quotes a
 * rejected value back into a log is a disclosure channel, and the rule is what an operator needs in
 * order to fix the configuration.
 *
 * @param candidate the configured host authority, unvalidated
 * @returns the same string, branded and unmodified
 * @throws {DomainError} when the value is empty, or contains any character outside
 *   {@link FEED_HOST_AUTHORITY_PATTERN}
 */
export function validateFeedHostAuthority(candidate: string): FeedHostAuthority {
  if (candidate.length === 0) {
    throw new DomainError(
      'The Google product feed host is empty. It must name the host authority the feed URLs are ' +
        'built on, supplied by configuration through GOOGLE_FEED_HOST.',
    );
  }

  if (!FEED_HOST_AUTHORITY_PATTERN.test(candidate)) {
    throw new DomainError(
      'The Google product feed host contains a character that is not permitted in a host ' +
        'authority. Letters, digits, the dot, the hyphen, the underscore, the colon and square ' +
        'brackets are accepted; a scheme, a path, userinfo, a query, a fragment, a percent ' +
        'escape, whitespace and any XML markup character are all refused.',
    );
  }

  /* THE DNS LABEL CEILING, CARRIED OVER FROM THE VALIDATOR THIS ONE REPLACED.
   *
   * A second host validator was declared beside this one, reasoning identically but expressed as a
   * single regular expression over DNS labels. This gate is the survivor because it is BRANDED:
   * `FeedHostAuthority` is unforgeable, so the compiler — not a convention — guarantees every host
   * reaching a sink came through here. The withdrawn pattern was nonetheless stronger on exactly one
   * count, the 63-octet per-label limit of RFC 1035 §2.3.4, and that check is reproduced here rather
   * than lost with it.
   *
   * ⛔ IT IS REPRODUCED AS A LENGTH TEST, NOT BY ADOPTING THE WITHDRAWN PATTERN, BECAUSE THAT PATTERN
   * ALSO REJECTED THE UNDERSCORE. An underscore is illegal in a hostname under RFC 1123 but is
   * routine in internal DNS, and `internal_store.example.com` is a host this gate accepts on purpose.
   * Swapping the grammars wholesale would have narrowed the accepted set and failed a render on such a
   * deployment, so the two properties are kept separately: the character set here, the length ceiling
   * below. Verified against both the accepted and the hostile host sets: no hostile value passes
   * either form, and no accepted value is newly refused.
   *
   * A bracketed IPv6 literal carries no DNS labels and is skipped; the grammar above has already
   * confined what may appear inside the brackets. */
  if (!candidate.startsWith('[')) {
    const [hostWithoutPort = ''] = candidate.split(':');

    for (const label of hostWithoutPort.split('.')) {
      if (label.length === 0 || label.length > MAXIMUM_DNS_LABEL_OCTETS) {
        throw new DomainError(
          'The Google product feed host has a label that is empty or longer than the ' +
            '63-octet limit RFC 1035 places on a DNS label, so it cannot name a reachable host.',
        );
      }
    }
  }

  return candidate as FeedHostAuthority;
}

/* ------------------------------------------------------------------------------------------------
 * DECISION G-2 — A URL PATH MAY NOT INTRODUCE AN AUTHORITY OR BREAK OUT OF ITS ELEMENT
 * ------------------------------------------------------------------------------------------------
 * ⚠️ THE SECOND DECLARED HARDENING EXCEPTION, same D18 precedent (AAP §0.6.7.7).
 *
 * Three of the document's URLs are `http://` + host + a path this module did not compose:
 *   - the item `link` (`product.cfm:L22`) takes `/<globalURLKeyProduct>/<urlTitle>/`, whose two
 *     segments come from a SETTING and from a persisted COLUMN;
 *   - `g:image_link` (`:L23`) and each `g:additional_image_link` (`:L24`) take a path composed by
 *     the image adapter, which may fall back to the value of the missing-image SETTING.
 *
 * ⭐ NONE OF THOSE IS A CONSTANT, AND {@link ImageWebPath} IS NOT A GUARANTEE. That brand is a
 * nominal display tag — `src/ports/ImagePathPort.ts` says so explicitly: "It asserts nothing about
 * the value". So a settings row or a `urlTitle` carrying `"><g:price>0</g:price><x>` reaches an
 * element text node, and a path beginning `//` rebases the whole URL onto a foreign authority even
 * though the host itself is validated. Both are closed here.
 *
 * ⛔ VALIDATION MEANS REFUSAL, AND REFUSAL IS A REAL DIVERGENCE. The legacy emitted a malformed or
 * hostile URL and completed the render; this module raises instead. That is deliberate: a merchant
 * feed is consumed by machine, so publishing a document whose links point somewhere else is worse
 * than publishing none. The alternative — escape it and emit it anyway — would leave the
 * origin-rebasing route open, and the report's remediation says to validate.
 *
 * ⛔ NO PERCENT-ENCODING IS PERFORMED. Encoding would rewrite the path separators, and a
 * conservative "encode everything except `/`" pass would still change bytes for legitimate values
 * that already contain a valid escape. The path is validated and emitted, never rewritten.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The characters RFC 3986 excludes from a URI outright, in the range this module can test for.
 *
 * `\u0000-\u0020` covers every C0 control character and the space; `\u007F` is DELETE. The named
 * characters are the specification's own excluded set: the double quote, the angle brackets, the
 * backslash, the caret, the grave accent and the three brace-and-bar characters.
 *
 * ⭐ IT IS A PUBLISHED STANDARD'S SET, NOT AN INVENTED ONE, which is what keeps it clear of
 * AAP §0.7.3 S9 — the same latitude `src/config/env.ts` takes for the TCP port field width.
 *
 * ⚠️ `&`, `?`, `#`, `%` AND `'` ARE DELIBERATELY ABSENT FROM THIS SET. All five are legal in a URI
 * reference, and a query string legitimately contains `&`, so refusing them would break real links.
 * They are handled by escaping at the emission site instead (DECISION G-3), which is the correct
 * treatment: `&amp;` is the well-formed XML spelling of a literal ampersand and a conforming
 * consumer hands `&` back.
 *
 * ⚠️ NON-ASCII CHARACTERS ARE NOT REFUSED EITHER. The specification requires them percent-encoded,
 * but an internationalised path is a legitimate deployment and this module does not rewrite paths
 * (see DECISION G-2). None of them is XML-significant, and each is escaped at emission like any
 * other text.
 */
const URI_EXCLUDED_CHARACTER_PATTERN = /["<>\\^`{|}]|[\u0000-\u0020\u007F]/;

/**
 * Validates that a path is a same-origin relative reference, and returns it unmodified.
 *
 * THE THREE CLAUSES, in the order they are applied:
 *   1. THE EMPTY PATH IS LEGAL AND IS RETURNED UNCHANGED. It yields `http://<host>` with nothing
 *      appended, which is exactly what the legacy emits when the underlying accessor resolves
 *      empty — the missing-image setting is unseeded, so this is a reachable state rather than a
 *      theoretical one.
 *   2. A NON-EMPTY PATH MUST BEGIN WITH EXACTLY ONE SLASH. `model/entity/Product.cfc:L207-L209`
 *      composes a leading slash and the image constructions do too, so this refuses nothing the
 *      legacy produced. Beginning with two slashes is the origin-rebasing route and is refused;
 *      beginning with no slash would silently graft the path onto the host authority.
 *   3. NO CHARACTER MAY COME FROM {@link URI_EXCLUDED_CHARACTER_PATTERN}.
 *
 * @param fieldName the feed element being built, named verbatim in the failure message so the
 *   offending field is identifiable without echoing the value
 * @param skuId the SKU being rendered, for the same reason — the diagnostic idiom
 *   {@link ProductFeedBuilder.requireProduct} already uses
 * @param candidate the path, exactly as the domain or the image adapter produced it
 * @returns the same string, unmodified
 * @throws {DomainError} when the path is relative, scheme-relative, or carries an excluded
 *   character
 */
function requireRelativeFeedPath(fieldName: string, skuId: string, candidate: string): string {
  if (candidate.length === 0) {
    return candidate;
  }

  const skuLabel = skuId === '' ? '(unsaved)' : skuId;

  if (!candidate.startsWith('/')) {
    throw new DomainError(
      `The ${fieldName} path for sku ${skuLabel} is not an absolute path within this origin, so ` +
        `the Google product feed will not publish it. A feed path must begin with a single slash.`,
    );
  }

  if (candidate.startsWith('//')) {
    throw new DomainError(
      `The ${fieldName} path for sku ${skuLabel} begins with two slashes, which would rebase the ` +
        `URL onto a different host, so the Google product feed will not publish it.`,
    );
  }

  if (URI_EXCLUDED_CHARACTER_PATTERN.test(candidate)) {
    throw new DomainError(
      `The ${fieldName} path for sku ${skuLabel} contains a character RFC 3986 excludes from a ` +
        `URI, so the Google product feed will not publish it.`,
    );
  }

  return candidate;
}

/**
 * The ambient state the legacy view read from its request, made explicit.
 *
 * THREE OF THE FOUR MEMBERS REPLACE ONE LEGACY GLOBAL EACH, and together they are the reason a
 * render is reproducible: the same records and the same context always produce the same bytes. The
 * fourth, {@link ProductFeedRenderContext.allowedHosts}, has NO legacy counterpart — it is the
 * configured-host half of the declared security divergence in this file's header, and it is present
 * precisely because the legacy trusted its host global unconditionally. That asymmetry is stated
 * here rather than left for a reader to notice.
 */
export interface ProductFeedRenderContext {
  /**
   * The VALIDATED host authority, replacing `CGI.HTTP_HOST`
   * (`integrationServices/google/views/feed/product.cfm:L14`, `L15`, `L22`, `L23`, `L24`).
   *
   * ⚠️ NO LONGER A PLAIN `string` — SEE DECISION G-1. The legacy interpolated the request's own host
   * header into five absolute URLs with no validation, which on the target platform is a
   * caller-supplied value: it could inject XML markup into four text nodes, rebase every link in
   * the document onto a foreign origin, or make the document unparseable with a single ampersand.
   * {@link FeedHostAuthority} is unforgeable, so the only way to populate this member is
   * {@link validateFeedHostAuthority}, and the value must come from `config.googleFeed.host`.
   *
   * CONCATENATED RAW, AND STILL NOT NORMALISED. The legacy writes the literal text `http://`
   * immediately followed by this value in all five places, so that is what happens here. The scheme
   * is not made configurable and not upgraded to HTTPS, the value is not trimmed, no trailing slash
   * is added or stripped, and no URL parser is involved — a parser would normalise, and normalising
   * would change emitted bytes for no stated reason (AAP §0.7.3 S9).
   */
  readonly host: FeedHostAuthority;

  /**
   * The canonical host authorities this deployment is permitted to advertise — the "configured
   * canonical host" half of the declared security divergence documented in this file's header.
   *
   * ⚠️ REQUIRED, AND DEFAULT-DENY WHEN EMPTY. It is not optional, for the same reason
   * `BaseServiceCollaborators.populationAuthorization` in `src/services/BaseService.ts` is not
   * optional: an omittable security control is a control that gets omitted. An empty array admits no
   * host at all, so a caller that has nothing configured renders nothing rather than rendering an
   * unvalidated header.
   *
   * Membership is tested case-insensitively, because DNS names are case-insensitive and the grammar
   * gate has already restricted both sides to ASCII by the time the comparison runs. Every entry is
   * itself validated against {@link HOST_AUTHORITY_PATTERN}, so a mis-configured entry cannot
   * smuggle markup into the feed through configuration either.
   *
   * MEASURED: omitting this member raises `TS2741 Property 'allowedHosts' is missing`, and supplying
   * it as an explicit `undefined` raises `TS2322 Type 'undefined' is not assignable to type
   * 'readonly string[]'` under `exactOptionalPropertyTypes`. Both were produced from a throwaway probe
   * and read from the compiler rather than assumed, so "required" is a compile-enforced fact and not a
   * comment. No structural guard type is added for it, because there is no cross-file relation to
   * assert — the required property IS the enforcement.
   *
   * This member has NO legacy counterpart. The legacy view trusted `CGI.HTTP_HOST` unconditionally;
   * that trust is the flaw, and this is the control that removes it. Configuration flows in from
   * `src/config/` through the handler layer, which is why it arrives as render-call data rather
   * than being read here — this file reads no process environment (AAP §0.7.3 S4).
   */
  readonly allowedHosts: readonly string[];

  /**
   * The render instant, replacing `now()`
   * (`integrationServices/google/views/feed/product.cfm:L30`, which reads it twice).
   *
   * INJECTED RATHER THAN READ. The legacy evaluated `now()` inside the render, so a long feed could
   * in principle straddle a second boundary and emit two different start timestamps. Taking the
   * instant once as an input removes that non-determinism, makes the timestamp assertable, and is
   * what lets this module contain no clock read at all.
   */
  readonly renderTime: Date;

  /**
   * The UTC hour offset, replacing `getTimeZoneInfo().utcHourOffset`
   * (`integrationServices/google/views/feed/product.cfm:L30`, which reads it twice).
   *
   * TYPED AS TEXT ON PURPOSE, even though the CFML facility yields a number. The legacy interpolates
   * the value straight into the timestamp with no formatting, and this file's obligation is to emit
   * it UNMODIFIED. Accepting text guarantees that: there is no numeric-to-text conversion here, so
   * no padding convention, no sign convention, no decimal or grouping convention and no exponent
   * form can be introduced by this module. Whatever the caller observed is what the feed carries.
   * The literal hyphen that precedes it in the timestamp is a separate legacy literal and is emitted
   * regardless of this value's own sign — see the timestamp assembly below.
   */
  readonly utcHourOffset: string;
}

/**
 * One of a product's images, reduced to what the feed actually needs.
 *
 * WHY A LOCAL TYPE IS NECESSARY HERE — three facts, none of them avoidable:
 *   1. `model/entity/Image.cfc` is NOT one of the six in-scope entities of AAP §0.2.1.2, so there
 *      is no `src/domain/**` image entity to import.
 *   2. It is not among {@link ImagePathPort}'s source files either, so the port declares no image
 *      record shape.
 *   3. `Product.productImages` is typed with a narrow structural association interface that exposes
 *      only the owning-side mutators, and `src/domain/product/Product.ts` exports no product-image
 *      type. Reading an image path off that element type is therefore impossible without an unsafe
 *      assertion, which AAP §0.7.3 S1 forbids outright.
 *
 * So the shape is declared here, minimally, and routed through {@link ImagePathPort} — TR-5.
 *
 * TWO DISTINCT IMAGE PATH CONSTRUCTIONS EXIST, AND BOTH ARE PRESERVED. `model/entity/Sku.cfc`
 * `:L145-L147` builds a SKU image path with a HARDCODED `/product/default/` segment, whereas
 * `model/entity/Image.cfc:L79-L81` builds an image's path from that image's own `directory` column.
 * The two therefore traverse different constructions on their way to the same image service, and
 * they are NOT unified: {@link ImagePathPort.getImagePath} owns the SKU construction and hardcodes
 * the SKU segment, so it cannot express the directory-driven form. That is exactly why this type
 * carries an already-constructed path rather than a file name.
 */
export interface ProductFeedImage {
  /**
   * This image's own path, as `model/entity/Image.cfc:L79-L81` constructs it from the image's
   * `directory` column — the value the legacy assigns at `model/entity/Image.cfc:L123` before
   * delegating to the image service.
   */
  readonly imagePath: string;

  /**
   * An optional per-image override for the missing-image path.
   *
   * `model/entity/Image.cfc:L126-L128` resolves the missing-image setting ONLY when the caller did
   * not supply one, so the override branch is real legacy behaviour and is representable here. It
   * is unreachable on the feed path itself, because `product.cfm:L24` passes no arguments at all;
   * when it is absent the setting is resolved instead, exactly as the legacy does.
   */
  readonly missingImagePath?: string;
}

/**
 * One materialised feed record: a SKU together with its product's images.
 *
 * The legacy loop subject is `rc.skuSmartList.getRecords()` (`product.cfm:L16`), whose elements are
 * SKUs, and the view then reaches `local.sku.getProduct().getProductImages()` at `product.cfm:L24`.
 * That second hop cannot be typed through the domain — see {@link ProductFeedImage} — so the images
 * travel alongside the SKU instead. This is honest rather than convenient: the feed's own record
 * selection in `integrationServices/google/controllers/feed.cfc:L49-L74` already joins SKU to
 * product, so whoever produces the records is the layer that can produce the images too, and doing
 * it there keeps this builder free of data access (AAP §0.7.3 S2).
 */
export interface ProductFeedRecord {
  readonly sku: Sku;

  /**
   * The product's images, IN THEIR EXISTING ARRAY ORDER.
   *
   * Emitted one `g:additional_image_link` per element, with no sorting, no de-duplication, no
   * filtering and no existence probe — `product.cfm:L24` performs none of those, and adding any of
   * them would change the emitted feed (AAP §0.7.3 S9). An empty array yields no elements.
   */
  readonly productImages: readonly ProductFeedImage[];
}

/* ================================================================================================
 * DOCUMENT LITERALS
 *
 * Every binding below is a `const` holding a primitive transcribed character for character from
 * `integrationServices/google/views/feed/product.cfm`, and any value whose transcription required a
 * judgment records that judgment at the value itself. They are named rather than inlined so that a
 * single definition cannot drift between the envelope and a test, and being immutable primitives
 * they carry nothing across invocations (M7).
 * ============================================================================================= */

/**
 * The XML declaration, byte-exact from
 * `integrationServices/google/views/feed/product.cfm:L1`.
 *
 * NO `encoding` ATTRIBUTE. The legacy declaration carries only the version, and adding an
 * encoding — however conventional, and however much a merchant processor might prefer one — would
 * emit bytes the legacy never emitted (AAP §0.7.3 S9).
 */
const XML_DECLARATION = '<?xml version="1.0"?>';

/**
 * The root element, byte-exact from `integrationServices/google/views/feed/product.cfm:L11`,
 * including the RSS version and the Google namespace binding that every `g:` element depends on.
 */
const RSS_OPEN_TAG = '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">';

const CHANNEL_TITLE = 'Slatwall Product Feed';

/**
 * The channel description prefix, byte-exact from
 * `integrationServices/google/views/feed/product.cfm:L15`, where the raw host is appended directly
 * to it. The trailing `://` is part of the legacy literal and is preserved.
 */
const CHANNEL_DESCRIPTION_PREFIX = 'Google Product Feed for http://';

/**
 * The scheme literal the legacy writes ahead of the host in all five of its absolute URLs
 * (`integrationServices/google/views/feed/product.cfm:L14`, `:L15`, `:L22`, `:L23`, `:L24`).
 *
 * Reproduced for byte parity: changing it would alter the emitted feed, and behavior change is
 * outside what this migration does (AAP §0.8.2 guideline 4). This records what the legacy emits and
 * is not guidance about transport security — a deployment that needs the feed served over TLS should
 * address that where the feed is published and where the host is supplied, not by having this
 * serializer diverge from the source it is compared against.
 */
const HTTP_SCHEME_PREFIX = 'http://';

/** Fixed condition value from `integrationServices/google/views/feed/product.cfm:L25`. */
const CONDITION_VALUE = 'new';

/**
 * Fixed availability value from `integrationServices/google/views/feed/product.cfm:L26`, INCLUDING
 * the single interior space. Both values are constants in the legacy: the feed reports every SKU as
 * new and in stock unconditionally, and no inventory member is consulted — which is consistent with
 * every inventory service being out of scope (AAP §0.2.2.1).
 */
const AVAILABILITY_VALUE = 'in stock';

const INDENT_UNIT = '\t';

/**
 * The single tab the legacy template leaves AFTER `</g:sale_price_effective_date>`, on that element's
 * own line, at `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * ⚠️ THIS IS TRAILING CONTENT, NOT AN INDENT, WHICH IS WHY IT IS ITS OWN CONSTANT. `cat -A` on the
 * legacy view shows that line terminating `</g:sale_price_effective_date>^I$` — the tab sits between
 * the closing tag and the newline. Every other element line in the template ends at its closing tag.
 * Reusing {@link INDENT_UNIT} here would read as leading indentation of the next line and invite a
 * later "cleanup" to delete it, so the two roles are given two names.
 *
 * It is emitted because AAP §0.4.1.10 requires "every field mapping preserved" and AAP §0.6.7.7 makes
 * D18 the ONLY sanctioned departure from byte-for-byte preservation — a dropped byte is a departure
 * even when it is only whitespace, and this one is observable to any consumer that diffs or hashes the
 * document. It is NOT emitted for the unconditional fields, because the legacy leaves no tab there.
 */
const SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB = '\t';

/* ================================================================================================
 * ESCAPING — the legacy's own escaper, extended to the fields the legacy forgot
 *
 * ------------------------------------------------------------------------------------------------
 * DECISION G-3 — EVERY DYNAMIC TEXT NODE IS ESCAPED, EXACTLY ONCE, AT ITS EMISSION SITE
 * ------------------------------------------------------------------------------------------------
 * ⚠️ THE THIRD AND LAST DECLARED HARDENING EXCEPTION IN THIS FILE, same D18 precedent
 * (AAP §0.6.7.7). It replaces an earlier reading of this file that treated the legacy's UNESCAPED
 * fields as behaviour to preserve. They are not: they are the CWE-91/CWE-79 defect, and a runtime
 * probe confirmed both halves of it — a crafted value inserted new XML elements, and a bare
 * ampersand made the document unparseable.
 *
 * ⭐ NO NEW ESCAPING SEMANTICS ARE INVENTED. {@link escapeFeedText} is unchanged, character for
 * character and in ordering; the hardening is simply that the legacy's OWN escaper is now applied to
 * the nine dynamic values the legacy omitted it from. That is the smallest possible change that
 * closes the finding, and it is why there is exactly one escaper in this module rather than a second
 * one with a different character set.
 *
 * ⭐ THE SIX LEGACY FIELDS ARE BYTE-IDENTICAL TO BEFORE. Nothing about their escaping changed, so no
 * parity claim about them is weakened — including the deliberate double-escape of the product type's
 * `&raquo;` separator, which still emits `&amp;raquo;`.
 *
 * WHERE BYTES NOW DIFFER FROM THE LEGACY, STATED PRECISELY. For any value containing none of the
 * four escaped characters — which is every legitimate host, path, price, offset and setting — the
 * emitted bytes are unchanged. They differ only for a value that contains one of the four, and then:
 *   - for `&` and `<`, the legacy document was NOT WELL-FORMED XML at all, so no conforming consumer
 *     could read it; the escaped form is the only spelling a parser accepts;
 *   - for `>` and `"`, the legacy document was well-formed, and the escaped form is EQUIVALENT after
 *     parsing — a consumer receives the identical characters.
 * So no consumer that could previously read a field reads anything different now.
 *
 * ⛔ THE OLD WARNING ABOUT URLS WAS WRONG, AND IS RETRACTED HERE RATHER THAN QUIETLY DELETED. This
 * file previously argued that escaping a URL "rewrites every `&` in its query string and corrupts
 * every link in the feed". It does not: `&amp;` IS the well-formed XML spelling of a literal
 * ampersand inside a text node, and every conforming XML consumer unescapes it back to `&` before
 * the URL is ever used. Leaving the ampersand bare is what corrupts the feed, because the document
 * then has no defined parse at all.
 *
 * ⛔ WHAT IS STILL NOT DONE, AND WHY. Control characters are NOT stripped or replaced. XML 1.0
 * forbids most C0 controls outright, so they cannot be escaped — the only options are removing them
 * or substituting something else, and both ALTER DATA rather than encode it. The finding's
 * remediation is to encode every dynamic text node, which is discharged in full; silently mangling
 * a stored value goes beyond it and beyond AAP §0.8.2 guideline 4. The residual is recorded here
 * rather than left implicit. Note that the two paths and the host cannot carry a control character
 * at all — DECISION G-1's allowlist and DECISION G-2's excluded set both refuse them — so the
 * residual is confined to the six legacy text fields and the three setting-derived values, exactly
 * where the legacy also carried it.
 * ============================================================================================= */

/**
 * Escapes a value for element content, character-for-character compatibly with the legacy
 * `htmlEditFormat`.
 *
 * SEMANTICS, MATCHED DELIBERATELY RATHER THAN IMPROVED:
 *   - EXACTLY FOUR characters are escaped: `&`, `<`, `>` and `"`.
 *   - `&` IS PROCESSED FIRST, so an ampersand introduced by a later substitution cannot be escaped a
 *     second time within one call.
 *   - THE SINGLE QUOTE IS NOT ESCAPED. `htmlEditFormat` does not escape it, so neither does this.
 *     A general-purpose XML escaper would emit an apostrophe entity and change emitted bytes. It is
 *     safe to leave: this document has no dynamic ATTRIBUTE anywhere, and an apostrophe needs no
 *     escaping in element content.
 *
 * ⚠️ EXACTLY ONCE PER VALUE, AT THE EMISSION SITE. Because `&` is processed first, one call is safe
 * and two calls are not — a second pass would turn `&amp;` into `&amp;amp;`. Every call is therefore
 * made where the field is pushed, and no helper in this module escapes on a caller's behalf:
 * {@link ProductFeedBuilder.selectDescription} returns RAW text and
 * {@link renderEffectiveDateEndpoint} returns a RAW endpoint, each escaped once by its emitter.
 *
 * THE SIX LEGACY CALL SITES, unchanged: the SKU identifier (`product.cfm:L17`), the title (`:L18`),
 * the selected description (`:L19`), the product type (`:L21`), the brand name (`:L32`) and the item
 * group identifier (`:L39`).
 *
 * THE NINE HARDENED CALL SITES, added by DECISION G-3 above: the channel link and the channel
 * description (`:L14`, `:L15`), the item link (`:L22`), the primary image link (`:L23`), each
 * additional image link (`:L24`), the price (`:L27`), the sale price (`:L29`), the sale-price
 * effective-date range (`:L30`) and the shipping weight (`:L58`).
 *
 * The two fixed values — `g:condition` and `g:availability` — are module constants rather than
 * dynamic text, so they are emitted directly and are not routed through here; and
 * `g:google_product_category` is emitted empty with no value at all.
 *
 * THE NINE HARDENED CALL SITES, added by DECISION G-3 above: the channel link and the channel
 * description (`:L14`, `:L15`), the item link (`:L22`), the primary image link (`:L23`), each
 * additional image link (`:L24`), the price (`:L27`), the sale price (`:L29`), the sale-price
 * effective-date range (`:L30`) and the shipping weight (`:L58`).
 *
 * The two fixed values — `g:condition` and `g:availability` — are module constants rather than
 * dynamic text, so they are emitted directly and are not routed through here; and
 * `g:google_product_category` is emitted empty with no value at all.
 *
 * ONCE, NOT TWICE. Escaping is applied to the fully composed text of an element, never to a fragment
 * that is then composed with another escaped fragment. Escaping a value that already contains
 * `&amp;` would produce `&amp;amp;`, and because `&` is processed first within a single call there is
 * no way for one call to double-escape itself — so the invariant to protect is simply "one call per
 * element", which is why the URL prefix and the path are joined BEFORE the call and not after.
 *
 * WHY THIS IS UNIFORM RATHER THAN LEGACY-SHAPED. The legacy escaped six of its values and
 * interpolated the rest raw; that asymmetry was not a design, it was the injection and
 * well-formedness flaw declared in this file's header. For the six values the legacy did escape, this
 * helper is byte-identical to it, so those fields are unchanged. For the rest, output differs from
 * the legacy only when the value actually contains one of the four characters.
 *
 * @param value the text to escape; numbers are accepted and stringified, because several feed fields
 *   are numeric and a uniform rule must not require the call site to convert first
 * @returns the escaped text
 */
function escapeFeedText(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* THERE IS NO `escapeFeedXml`. A second escaper covering `&`, `<` and `>` was declared alongside
 * {@link escapeFeedText}, which covers those THREE PLUS `"`. Two escapers for one document is a
 * correctness hazard rather than a choice — a future sink would be escaped by whichever one the author
 * happened to reach for, and the weaker one leaves an attribute-delimiter character unescaped. The
 * stronger, already-wired helper is the survivor and every sink in this file calls it. */

/* THERE IS EXACTLY ONE HOST VALIDATOR, AND IT IS {@link validateFeedHostAuthority} ABOVE.
 *
 * Two were declared at one point, reasoning identically — `CGI.HTTP_HOST` is the caller-supplied
 * `Host` header, so escaping alone would keep the document well formed while still publishing an
 * attacker-chosen authority inside every `link` and `g:image_link`; validation is what closes the
 * redirect surface, and the value must be rejected rather than repaired. One had to go, and the
 * BRANDED one is the survivor: `FeedHostAuthority` is unforgeable, so the compiler guarantees every
 * host reaching a sink was validated, where a plain-string helper relied on every call site
 * remembering to call it.
 *
 * ⭐ THE WITHDRAWN VALIDATOR'S ONE GENUINELY STRONGER PROPERTY WAS CARRIED ACROSS RATHER THAN LOST:
 * its 63-octet DNS label ceiling now lives in `validateFeedHostAuthority` as an explicit length gate.
 * It was NOT adopted wholesale, because its DNS-label grammar also rejected the underscore, and
 * `internal_store.example.com` is a host this feed accepts on purpose. Both grammars were checked
 * against the accepted and the hostile host sets before the merge: neither admitted any hostile
 * value, so the choice cost no coverage. Neither validator normalised, trimmed, lower-cased or
 * defaulted the value, and neither disclosed it: a rejected authority is recorded internally only. */

/* ================================================================================================
 * RAW-SINK VALIDATION — the two defences ESCAPING CANNOT PROVIDE
 * ============================================================================================= */

/**
 * WHY THIS SECTION STILL EXISTS NOW THAT EVERY TEXT NODE IS ESCAPED.
 *
 * This section once held a fail-closed grammar for EVERY substitution the legacy emitted raw — the
 * host, the three URI references, the UTC offset, the shipping weight and the weight unit code — and
 * its stated premise was that "ESCAPING THESE VALUES IS THE WRONG FIX, AND IS DELIBERATELY NOT DONE",
 * on the ground that escaping rewrites bytes for valid data.
 *
 * ⚠️ THAT PREMISE WAS WRONG ON ITS OWN TERMS, AND IS WITHDRAWN. Escaping only changes bytes for a value
 * that contains `&`, `<`, `>` or `"` — and for exactly those values the legacy emitted a document with
 * no defined parse, so there was no valid feed whose bytes could change. For every value the legacy
 * rendered as well-formed XML, {@link escapeFeedText} is the identity. The byte-parity concern the
 * grammars were built to protect is therefore protected by escaping too, and the reason to prefer a
 * grammar had to be something else.
 *
 * ✅ WHAT SURVIVED, AND THE TEST THAT DECIDED IT. A grammar earns its place only where escaping leaves a
 * real hole. Two do:
 *
 *   1. {@link validateFeedHostAuthority} — DECISION G-1. Escaping the host would keep the document
 *      well-formed while still letting a request header REBASE every absolute URL in the feed onto a
 *      foreign origin. Well-formedness is not the property at risk; the origin is. The value is also
 *      genuinely closed: it is deployment CONFIGURATION, not catalogue data.
 *   2. {@link requireRelativeFeedPath} — DECISION G-2. A path is concatenated after `http://<host>`,
 *      so `//evil.example.com/x` relocates the origin and a scheme-bearing value replaces it outright.
 *      Escaping cannot see either problem, because neither needs an XML metacharacter.
 *
 * ⛔ WHAT WAS RETIRED, AND WHY IT WAS NOT MERELY REDUNDANT BUT WRONG. The shipping-weight grammar and
 * the weight-unit allowlist are gone, and the evidence is in the legacy settings engine rather than in
 * a preference:
 *
 *   - `model/service/SettingService.cfc:L233` declares `skuShippingWeight` as `{fieldType="text",
 *     defaultValue=1}`. It is FREE TEXT by design, so an operator may legitimately store `1.5 lbs` or
 *     `approx 2`. A "non-negative decimal or empty" grammar refuses values the legacy settings UI
 *     accepts and the legacy view renders.
 *   - `model/service/SettingService.cfc:L338-L343` builds the `skuShippingWeightUnitCode` options with
 *     a LIVE query — `getMeasurementUnitSmartList()` filtered to `measurementType = 'weight'` — over
 *     `SwMeasurementUnit`, a user-editable table. The five rows in
 *     `config/dbdata/SlatwallMeasurementUnit.xml.cfm:L10-L14` are SEED data, not an enumeration. The
 *     retired constant restated those five codes as a closed set, which would refuse a unit an operator
 *     had legitimately added: the VALUES came from the repository, but the CLOSEDNESS was invented, and
 *     inventing a closed set is exactly what AAP §0.7.3 S9 forbids.
 *   - Availability matters here in a way it does not for the host: a single operator-typed setting must
 *     not be able to suppress the entire catalogue's feed, and escaping neutralises the injection vector
 *     (the whole of the finding) without that consequence.
 *
 * ⛔ AND WHAT IS NOT A GRAMMAR EVEN THOUGH IT LOOKS LIKE ONE. The UTC offset is constrained — see
 * {@link readUtcHourOffset} — but not for encoding reasons: its NUMERIC VALUE computes the wall clock
 * its own label describes (F15), so a value that cannot be read as hours cannot be rendered at all. The
 * constraint is arithmetic, and escaping is applied on top of it at the emission site regardless.
 *
 * NOTHING IS INVENTED (AAP §0.7.3 S9). The surviving grammars derive from the DNS label rules and the
 * bracketed-literal form a `Host` header may carry, and from RFC 3986's excluded characters. No length
 * limit, rate, budget or threshold is introduced, and the register of AAP §0.6.7 gains no entry.
 */

/* THERE IS NO `SHIPPING_WEIGHT_PATTERN` and NO `SHIPPING_WEIGHT_UNIT_CODES`, and no
 * `assertFeedShippingWeight` or `assertFeedShippingWeightUnitCode` that consumed them. Both settings are
 * escaped at their single emission site instead, for the reasons recorded above. They must not be
 * reinstated on the argument that a feed field "should" be numeric: Google's own rejection of a
 * malformed weight is a merchant-visible outcome, whereas refusing to render the catalogue is not, and
 * the legacy imposed no such constraint at any layer. */

/* THERE IS NO `rejectRawFeedValue`. It existed only to raise for the two retired shipping grammars; the
 * two surviving grammars each raise with a message naming their own rule, and neither echoes the
 * rejected value into the message. */

/* THERE IS NO `assertFeedUriReference`. It validated the three URI references this document emits
 * unescaped; {@link requireRelativeFeedPath} now guards all three and is strictly stronger, because it
 * also refuses an ABSOLUTE reference and names the offending sku in its internal context. The three
 * call sites moved to it and the weaker helper is gone rather than left beside it. */

/* THERE IS NO `assertFeedUtcHourOffset`. Its signed-numeric pattern was a SECOND, weaker statement of a
 * constraint {@link readUtcHourOffset} already enforces for a stronger reason — the offset's numeric
 * value computes the timestamp components the label describes (F15) — so the shape check now lives with
 * the arithmetic that depends on it, and the emission site escapes the text as well. Two independent
 * gates on one value is how they drift apart. */

/* ================================================================================================
 * TIME OF DAY — hand-built, because it is this file's responsibility and nobody else's
 * ============================================================================================= */

/**
 * Renders a 24-hour zero-padded `HH:mm:ss`, reproducing the legacy `timeFormat(value, "HH:mm:ss")`
 * calls at `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * WHY IT IS IMPLEMENTED HERE AND NOT IN THE SHARED FORMATTER. `src/util/formatting.ts` implements
 * date-component mask tokens only, and deliberately implements no hour, minute, second or meridiem
 * token at all. The timestamp's time-of-day portion, its `T` separator, its literal hyphen, its raw
 * offset and its `/` range separator all belong to this file, so the shared formatter is not
 * extended to serve them.
 *
 * ⚠️ F15 — A CLAIM WITHDRAWN, AND THE REQUIREMENT IT MISSED. This said "LOCAL-TIME ACCESSORS ONLY,
 * NEVER UTC ACCESSORS", reasoning that the shared `formatDate` reads local components so a
 * UTC-based time "would pair a local date with a UTC time and could emit a timestamp that never
 * existed", and that local accessors "matches the legacy, where `timeFormat` renders in the engine's
 * own zone — the very zone whose offset is then appended".
 *
 * THE INTERNAL-CONSISTENCY ARGUMENT WAS RIGHT; THE CONCLUSION DID NOT FOLLOW. Pairing the date and
 * the time is necessary but not sufficient, because the OFFSET LABEL must agree with them too. In the
 * legacy the three agree automatically: the components and the offset both come from the engine's one
 * zone. In the port they do not, because the components came from the HOST clock while the label came
 * from {@link ProductFeedRenderContext.utcHourOffset} — a value the caller supplies. On a UTC host
 * (which is what a Lambda container is) a context offset of `5` produced UTC components labelled
 * `-5`, i.e. a timestamp five hours wrong, and the output changed with the host's timezone
 * configuration rather than with anything the caller asked for.
 *
 * SO THE COMPONENTS ARE NOW COMPUTED FOR THE SUPPLIED OFFSET, which restores the legacy's invariant —
 * components and label describing one zone — WITHOUT depending on how the host clock is configured.
 * UTC accessors are read from an instant shifted by that offset, so neither the host's zone nor its
 * DST rules can influence the result. See {@link shiftToOffsetWallClock}.
 *
 * @param value the instant to render, already shifted to the target wall clock
 * @returns the zero-padded time of day
 */
function formatTimeOfDay(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, '0');
  const minutes = String(value.getUTCMinutes()).padStart(2, '0');
  const seconds = String(value.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/* ================================================================================================
 * MONETARY RENDERING (F21)
 * ============================================================================================== */

/**
 * Matches JavaScript's exponential number form, so it can be expanded into plain decimal text.
 */
const EXPONENTIAL_NUMBER_PATTERN = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * Renders a monetary value as PLAIN decimal text for `g:price` and `g:sale_price` (F21).
 *
 * ⭐ THE DEFECT THIS FIXES IS EXPONENTIAL NOTATION, AND IT IS REAL RATHER THAN THEORETICAL. The two
 * fields were interpolated straight into the document, so they carried whatever
 * `String(number)` produced — and that is `"1e+21"` for 1e21 and `"1e-7"` for 0.0000001. Neither is a
 * number Google's feed specification accepts, so such a record is rejected or mis-parsed, and nothing
 * in the port or the feed reveals it. Plain decimal text is emitted instead, for every magnitude.
 *
 * ⛔ NO SCALE IS IMPOSED, AND NONE IS INVENTED. The review asks for the "declared decimal scale", and
 * the honest finding is that THIS REPOSITORY DECLARES NONE. `model/entity/Sku.cfc:L55-L57` and
 * `model/entity/Product.cfc:L62` declare `ormtype="big_decimal"` and stop there; the `Sw*` DDL that
 * would carry a `DECIMAL(p,s)` is not in the repository at all (the mapping layer generates it from
 * component metadata, per AAP §0.8.4.1); no setting key in `src/ports/SettingResolverPort.ts` supplies
 * a decimal-places value; and the legacy view applies no `numberFormat`, `decimalFormat` or mask to
 * either field. Choosing two decimal places would be a fabricated constant, which AAP §0.7.3 S9
 * forbids — so this function rounds nothing, pads nothing and truncates nothing.
 *
 * ⚠️ AND THE TRAILING-ZERO HALF OF F21 CANNOT BE FIXED HERE, WHICH IS STATED RATHER THAN GLOSSED. A
 * stored `100.00` is already the JavaScript number `100` by the time it reaches this function: the
 * scale was lost at HYDRATION, because the entity's price members are typed `number`. Restoring it
 * would mean carrying exact decimal TEXT on the entity itself — a change to
 * `src/domain/sku/Sku.ts`, `src/domain/product/Product.ts` and every price consumer in the port, well
 * beyond this field pair. `src/adapters/mysql/rowMappers.ts` already reads those columns EXACTLY and
 * refuses any lossy conversion, so no precision is silently corrupted on the way in; what is lost is
 * only the presentational scale, and `canonicaliseDecimalText` there records that same
 * scale-is-presentation split. Recorded here so the residue is visible rather than implied.
 *
 * @param value the monetary value
 * @returns plain decimal text, never exponential
 */
function renderFeedMoney(value: number): string {
  const text = String(value);
  const match = EXPONENTIAL_NUMBER_PATTERN.exec(text);
  if (match === null) {
    return text;
  }

  const sign = match[1] ?? '';
  const integerDigits = match[2] ?? '';
  const fractionDigits = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');
  const digits = `${integerDigits}${fractionDigits}`;
  const pointPosition = integerDigits.length + exponent;

  if (pointPosition <= 0) {
    return `${sign}0.${'0'.repeat(-pointPosition)}${digits}`;
  }
  if (pointPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/**
 * The offset text, as a number of hours, for computing the wall clock the label describes (F15).
 *
 * ⛔ THE PARSED VALUE IS USED ONLY FOR THE SHIFT. The text itself is still emitted UNMODIFIED, exactly
 * as {@link ProductFeedRenderContext.utcHourOffset} promises — nothing here re-formats it, pads it,
 * signs it or round-trips it through a number. Parsing is a read, not a rewrite.
 *
 * ⭐ THE SIGN CONVENTION IS THE LEGACY'S, AND IT IS FIXED BY THE LITERAL HYPHEN. `product.cfm:L30`
 * writes `-#getTimeZoneInfo().utcHourOffset#`, so the emitted label is always a MINUS followed by this
 * value. CFML's `utcHourOffset` is positive for zones west of UTC, which is what makes `-5` correct for
 * US Eastern. The wall clock the label denotes is therefore `UTC - offset`, and that is the shift
 * applied.
 *
 * @param utcHourOffset the raw offset text from the render context
 * @returns the offset in hours
 * @throws {DataIntegrityError} when the text is not a finite number of hours
 */
function readUtcHourOffset(utcHourOffset: string): number {
  const parsed = Number(utcHourOffset);
  if (utcHourOffset.trim().length === 0 || !Number.isFinite(parsed)) {
    throw new DataIntegrityError(
      'The Google product feed cannot render its sale-price effective date because the supplied UTC ' +
        'hour offset is not a finite number of hours. The offset determines both the emitted ' +
        'timestamp components and the offset label, so a value that cannot be interpreted would ' +
        'produce a timestamp whose components and label disagree.',
      {
        context: {
          locator: 'integrationServices/google/views/feed/product.cfm:L30',
          finding: 'F15',
        },
      },
    );
  }
  return parsed;
}

/**
 * Shifts an instant so that its UTC components read as the wall clock at the supplied offset (F15).
 *
 * ⛔ THE RETURNED `Date` IS A COMPONENT CARRIER, NOT AN INSTANT. It deliberately denotes a different
 * moment from its input; its only purpose is that `getUTC*` accessors read the target wall clock off
 * it. It must never be compared with, subtracted from or persisted alongside a real instant, and it
 * never leaves this module — {@link formatTimeOfDay} and {@link formatOffsetWallClockDate} are its
 * only consumers.
 *
 * ⛔ UTC ACCESSORS ARE WHAT MAKE THIS HOST-INDEPENDENT. Reading local accessors off the shifted value
 * would re-apply the host's own zone on top of the shift and reintroduce exactly the F15 defect.
 *
 * @param value the real instant
 * @param offsetHours the offset in hours west of UTC
 * @returns a carrier whose UTC components are the wall clock at that offset
 */
function shiftToOffsetWallClock(value: Date, offsetHours: number): Date {
  const millisecondsPerHour = 3_600_000;
  return new Date(value.getTime() - offsetHours * millisecondsPerHour);
}

/**
 * Renders `YYYY-MM-DD` from a wall-clock carrier's UTC components (F15).
 *
 * ⛔ HAND-BUILT RATHER THAN DELEGATED TO `src/util/formatting`'s `formatDate`, and for the same reason
 * {@link formatTimeOfDay} is hand-built: the shared formatter reads LOCAL components, which is
 * precisely what must not happen here. The mask this replaces was the literal `'YYYY-MM-DD'` at the
 * single call site, so no mask interpretation is lost — the shape is now stated directly.
 *
 * @param value a carrier produced by {@link shiftToOffsetWallClock}
 * @returns the zero-padded calendar date
 */
function formatOffsetWallClockDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Renders one endpoint of the `g:sale_price_effective_date` range: date, `T`, time of day, a literal
 * hyphen, then the raw offset — five of the eleven parts the legacy assembles at
 * `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * THE EXPIRATION MAY BE ABSENT, AND ABSENT IS THE EMPTY STRING. `model/entity/Sku.cfc:L560-L565`
 * returns the empty string when the sale-price detail carries no expiration key, even though
 * `model/entity/Product.cfc:L614` declares the counterpart as returning a date. The domain entity
 * types that honestly, so this function accepts it and PASSES IT THROUGH: an absent expiration
 * renders as an empty date and an empty time, leaving the `T`, the hyphen and the offset in place —
 * which is what a lenient CFML engine emits for `dateFormat("")` and `timeFormat("")`.
 *
 * TODO(parity): CFML engines DISAGREE about that call. The legacy accessor's empty-string return is
 * fed straight into two format functions, and where one engine renders nothing another raises a
 * conversion failure, so the legacy behaviour for a sale with no expiration is engine-dependent. The
 * lenient branch is reproduced because it is the branch that produces output at all; no date is
 * invented, the render instant is NOT substituted for the missing expiration, no new error is
 * raised, and no defect number is minted for it.
 *
 * @param value the endpoint instant, or the empty string when absent
 * @param utcHourOffset the raw offset text, emitted unmodified
 * @returns the rendered endpoint
 */
function renderEffectiveDateEndpoint(value: Date | '', utcHourOffset: string): string {
  /* F15 — the components are computed for the offset the label reports, so the two always describe
   * one zone. The offset text is emitted verbatim; only its numeric reading drives the shift.
   *
   * ⛔ THE OFFSET IS READ UNCONDITIONALLY, BEFORE THE ABSENT-VALUE BRANCH, and that is deliberate on
   * two counts. It makes the check STRUCTURAL rather than order-dependent: the offset is emitted on
   * BOTH endpoints, including the absent one whose date and time collapse to empty, so validating it
   * only on the branch that needs it for arithmetic would leave the empty endpoint publishing an
   * unchecked context value. And it is what keeps the offset F13-safe without a second escaper — a
   * string `Number()` converts to a finite value cannot contain `&`, `<` or `>`, so validation alone
   * establishes that the verbatim text is legal XML character data. {@link readUtcHourOffset} is pure,
   * so calling it on both endpoints costs nothing and can raise nothing the first call would not. */
  const offsetHours = readUtcHourOffset(utcHourOffset);
  const wallClock = value === '' ? '' : shiftToOffsetWallClock(value, offsetHours);
  const datePart = wallClock === '' ? '' : formatOffsetWallClockDate(wallClock);
  const timePart = wallClock === '' ? '' : formatTimeOfDay(wallClock);
  return `${datePart}T${timePart}-${utcHourOffset}`;
}

/* ================================================================================================
 * THE BUILDER
 * ============================================================================================= */

/**
 * Serializes catalogue records into the Google merchant product feed.
 *
 * Construct once and reuse: the instance is immutable and holds no per-render state, so it is safe
 * to build in a composition root and keep for the lifetime of a warm container (M7).
 *
 * @example
 * ```ts
 * const builder = new ProductFeedBuilder(imagePaths, pricing, settings);
 * const xml = await builder.build(records, {
 *   // DECISION G-1: from `config.googleFeed.host`, NEVER from a request header.
 *   host: validateFeedHostAuthority(config.googleFeed.host),
 *   renderTime: requestStartedAt,
 *   utcHourOffset: '5',
 * });
 * ```
 */
export class ProductFeedBuilder {
  /**
   * @param imagePaths resolves the primary and additional resized image paths — the ONLY route to
   *   the out-of-scope image service (TR-5)
   * @param pricing resolves sale-price detail across the excluded pricing boundary (TR-5); handed
   *   straight to the domain entity's sale-price members, which is where the legacy fallback lives
   * @param settings resolves configuration keys SYNCHRONOUSLY (M8) — never awaited (TR-5)
   */
  public constructor(
    private readonly imagePaths: ImagePathPort,
    private readonly pricing: PricingPort,
    private readonly settings: SettingResolverPort,
  ) {}

  /**
   * Renders the complete feed document.
   *
   * ENVELOPE ORDER, reproducing `integrationServices/google/views/feed/product.cfm` exactly: the XML
   * declaration (`:L1`), the root element with its namespace binding (`:L11`), the channel (`:L12`),
   * the channel title (`:L13`), the channel link (`:L14`), the channel description (`:L15`), then one
   * `item` per record (`:L16-L62`), then the channel and root closing tags (`:L64-L65`).
   *
   * RECORDS ARE RENDERED SEQUENTIALLY, ONE AWAITED ITEM AT A TIME. Two of the three collaborators
   * are asynchronous, so a concurrent map would be the obvious optimisation and is deliberately not
   * used: it would interleave port calls and make the emitted order depend on resolution timing,
   * whereas the legacy `cfloop` at `product.cfm:L16` renders strictly in record order. Feed order is
   * observable behaviour — a merchant processor reads the document top to bottom — so determinism
   * wins. This is also why no concurrency limit, batch size or chunk size appears anywhere: none is
   * needed, and inventing one would breach AAP §0.7.3 S9 (see M2 in the file header, whose delivery
   * decision belongs to the handler layer).
   *
   * INTER-ELEMENT WHITESPACE. Elements are emitted one per line, indented with tabs to mirror the
   * legacy template's own nesting depth. XML is insensitive to whitespace between elements, and no
   * field's CONTENT is padded, trimmed or reflowed — the legacy view's exact interior whitespace is a
   * template artifact, whereas every element's text is byte-exact.
   *
   * ⭐ THE HOST GATE RUNS ONCE PER RENDER, BEFORE ANY BYTE IS PRODUCED. {@link resolveCanonicalHost}
   * is called here rather than per item so that one document can never mix an accepted host into some
   * elements and a rejected one into others, and so that a refused render produces NO partial feed at
   * all. The accepted, configured spelling is then the only host value that exists downstream: it is
   * handed to {@link ProductFeedBuilder.buildItem} as a finished prefix, which is why that method
   * never reads {@link ProductFeedRenderContext.host} itself.
   *
   * @param records the already-materialised SmartList records, rendered in the order given
   * @param context the render-time replacements for the legacy request globals
   * @returns the complete RSS document
   * @throws {DomainError} when the requested host is not a canonical, configured feed host — see
   *   {@link resolveCanonicalHost}
   * @throws {DomainError} when a record's SKU carries no product, reproducing the legacy null
   *   dereference — see {@link ProductFeedBuilder.buildItem}
   */
  public async build(
    records: readonly ProductFeedRecord[],
    context: ProductFeedRenderContext,
  ): Promise<string> {
    /* DECISION G-3: the two channel-level dynamic values, each escaped exactly once here. The host
     * is already unforgeable by DECISION G-1, so for any value that reaches this point these two
     * calls are provably no-ops — they are made anyway, because "every dynamic text node is escaped
     * at its emission site" is an invariant a reviewer can check by reading the emission sites,
     * whereas "escaped except where a brand makes it unnecessary" is one that has to be reasoned
     * about at every one of them. The channel title is a module constant and is not routed through
     * the escaper. */
    /* THE CONFIGURED-HOST MEMBERSHIP GATE, ENFORCED BEFORE THE HOST REACHES ANY SINK.
     *
     * {@link ProductFeedRenderContext.allowedHosts} documents itself as the control that removes the
     * legacy's unconditional trust in `CGI.HTTP_HOST`, and it is REQUIRED rather than optional
     * precisely so a wiring site cannot omit it. It was declared and documented but never actually
     * read — every caller had to supply it and nothing consulted it — which is the one failure mode
     * worse than not having the control at all, because the type implied a guarantee that did not
     * exist. It is consulted here.
     *
     * FAIL CLOSED. An empty list admits no host, so a deployment with nothing configured renders
     * nothing rather than rendering an unvalidated authority. Comparison is case-insensitive because
     * DNS names are, and the grammar gate has already confined both sides to ASCII by the time this
     * runs; each configured entry is trimmed on the configuration side of the comparison only, so a
     * stray space in configuration cannot silently admit a host, and the incoming value is never
     * rewritten. The rejected authority is NOT echoed, matching every other refusal in this file. */
    const requestedHost = context.host.toLowerCase();

    if (!context.allowedHosts.some((allowed) => allowed.trim().toLowerCase() === requestedHost)) {
      throw new DomainError(
        'The Google product feed refused to render: the requested host authority is not among the ' +
          'hosts this deployment is configured to publish feed URLs for.',
      );
    }

    /* Composed ONCE per render from the already-gated host, then reused: `buildItem` takes the RAW
     * prefix because it escapes each URL itself at the point of emission, while the channel link is
     * escaped here. Deriving both from this one expression is what keeps them from drifting. */
    const absoluteUrlPrefix = `${HTTP_SCHEME_PREFIX}${context.host}`;
    const channelLink = escapeFeedText(absoluteUrlPrefix);
    const channelDescription = escapeFeedText(`${CHANNEL_DESCRIPTION_PREFIX}${context.host}`);

    const lines: string[] = [
      XML_DECLARATION,
      RSS_OPEN_TAG,
      `${INDENT_UNIT}<channel>`,
      `${INDENT_UNIT.repeat(2)}<title>${CHANNEL_TITLE}</title>`,
      `${INDENT_UNIT.repeat(2)}<link>${channelLink}</link>`,
      `${INDENT_UNIT.repeat(2)}<description>${channelDescription}</description>`,
    ];

    /* `for...of` rather than an index loop: it needs no bounds arithmetic and yields a defined
     * element on every iteration, so `noUncheckedIndexedAccess` is satisfied without narrowing. */
    for (const record of records) {
      lines.push(await this.buildItem(record, context, absoluteUrlPrefix));
    }

    lines.push(`${INDENT_UNIT}</channel>`, '</rss>');

    return lines.join('\n');
  }

  /**
   * Renders one `item` element — the sixteen fields of
   * `integrationServices/google/views/feed/product.cfm:L16-L62`, in the legacy's own source order.
   *
   * The order is preserved field for field because a merchant processor reads a positional document
   * and because it is the only way a reader can diff this method against the view line by line.
   *
   * EVERY DYNAMIC TEXT BELOW IS ESCAPED EXACTLY ONCE, at its own `fields.push` call — see
   * {@link escapeFeedText} for the single rule and why there is no exemption list. The per-field
   * comments say which values the LEGACY escaped, because that is the parity fact worth recording;
   * they no longer describe this file's own behaviour as asymmetric, because it is not.
   *
   * @param record the SKU and its product's images
   * @param context the render-time replacements for the legacy request globals
   * @param absoluteUrlPrefix the already-gated `http://<configured host>` prefix, produced once per
   *   render by {@link ProductFeedBuilder.build}; this method never reads the untrusted
   *   {@link ProductFeedRenderContext.host} itself
   * @returns the rendered `item` element
   * @throws {DomainError} when the SKU carries no product
   */
  private async buildItem(
    record: ProductFeedRecord,
    context: ProductFeedRenderContext,
    absoluteUrlPrefix: string,
  ): Promise<string> {
    const sku = record.sku;
    const product = this.requireProduct(sku);
    /* The host was validated once by {@link ProductFeedBuilder.build}, this method's only caller, which
     * also composed `absoluteUrlPrefix` from the gated value and passes it in — so this method never
     * reads the untrusted `context.host`. The PER-RECORD values below are validated individually at
     * each sink, because each one comes from different data. */
    const fields: string[] = [];

    /* ---- 1. `g:id` — ESCAPED (`product.cfm:L17`). ------------------------------------------- */
    fields.push(`<g:id>${escapeFeedText(sku.skuCode ?? '')}</g:id>`);

    /* ---- 2. `title` — ESCAPED (`product.cfm:L18`). -------------------------------------------
     * THE PERSISTED `calculatedTitle`, NOT `getTitle()`. The two are different members and the
     * distinction is easy to lose: `calculatedTitle` is a persisted column the legacy ORM exposed
     * through a synthesized accessor, whereas `model/entity/Product.cfc:L540-L545`'s `getTitle()` is
     * a template-driven member that interpolates the `productTitleString` setting at render time.
     * The feed reads the persisted column, so this file never calls `getTitle()` and never touches
     * the string-template expander that serves it. Do not "upgrade" this to the live title. */
    fields.push(`<title>${escapeFeedText(product.calculatedTitle ?? '')}</title>`);

    /* ---- 3. `description` — ESCAPED, three-way (`product.cfm:L19`). -------------------------- */
    fields.push(`<description>${escapeFeedText(this.selectDescription(product))}</description>`);

    /* ---- 4. `g:google_product_category` — ALWAYS PRESENT, ALWAYS EMPTY (`product.cfm:L20`). ---
     * THE CATEGORY DRIFT TRAP, and the single most tempting "obvious improvement" in this folder.
     * `integrationServices/google/Integration.cfc:L68` declares a `productGoogleProductType` setting,
     * and `integrationServices/google/views/feed/product.cfm:L20` emits this element EMPTY regardless
     * — the two are simply NOT connected in the legacy system. A reader who sees a Google
     * product-type setting and an empty category element will want to wire them together; doing so
     * would invent behaviour (AAP §0.7.3 S9) and would change the emitted feed. The element is
     * emitted, and it is emitted empty. This builder consequently has no relationship at all to the
     * integration adapter and does not import, reference or reach toward it. */
    fields.push('<g:google_product_category></g:google_product_category>');

    /* ---- 5. `g:product_type` — ESCAPED (`product.cfm:L21`). ---------------------------------
     * THE DOUBLE-ESCAPE IS REAL AND IS PRESERVED. `model/entity/ProductType.cfc:L273-L278` joins a
     * type hierarchy with the LITERAL HTML ENTITY TEXT ` &raquo; ` — that separator lives in
     * `src/domain/product/ProductType.ts`, which is why the hierarchy walk is not re-implemented here
     * and only the finished string is read. Passing it through the escaper turns its `&` into
     * `&amp;`, so the emitted feed carries `&amp;raquo;` rather than `&raquo;`. That is exactly what
     * the legacy emits at `product.cfm:L21`, so it is neither special-cased nor exempted from
     * escaping nor "fixed". */
    fields.push(
      `<g:product_type>` +
        `${escapeFeedText(
          /* The TYPE is required (F14); its simple representation may still be absent, and an absent
           * representation renders as empty exactly as `htmlEditFormat()` of an empty value does. The
           * distinction matters: `:L21` dereferences the ASSOCIATION unguarded, not the string. */
          this.requireProductType(
            product,
            'integrationServices/google/views/feed/product.cfm:L21',
          ).getSimpleRepresentation() ?? '',
        )}` +
        `</g:product_type>`,
    );

    /* ---- 6. item `link` — RAW IN THE LEGACY, ESCAPED HERE (`product.cfm:L22`). ---------------
     * `model/entity/Product.cfc:L207-L209` builds the path as `"/#setting('globalURLKeyProduct')#/`
     * `#getURLTitle()#/"`, carrying BOTH a leading and a trailing slash, so the emitted URL is
     * `http://<host>/<globalURLKeyProduct>/<urlTitle>/`. NEITHER SLASH IS TRIMMED and the two
     * segments are not re-joined by a path helper.
     *
     * The domain member takes the setting resolver as an explicit parameter, so the key is resolved
     * SYNCHRONOUSLY through {@link SettingResolverPort} (M8 — never awaited). TR-5: that port is the
     * only route to the key.
     *
     * `model/entity/Product.cfc:L211-L213`'s `getListingProductURL()` is the no-leading-slash sibling
     * and is NOT what the feed uses.
     *
     * SEC-06 / DECISION G-2 and G-3: the composed path is validated as a same-origin relative
     * reference before it is concatenated, then the finished URL is escaped once. Both are needed and
     * neither substitutes for the other — one of the path's two segments is a SETTING value and the
     * other is a persisted COLUMN, so it is neither a constant nor trusted. */
    const itemLinkPath = requireRelativeFeedPath(
      'link',
      sku.skuID,
      product.getProductURL(this.settings),
    );
    fields.push(`<link>${escapeFeedText(`${absoluteUrlPrefix}${itemLinkPath}`)}</link>`);

    /* ---- 7. `g:image_link` — RAW IN THE LEGACY, ESCAPED HERE (`product.cfm:L23`). ------------
     * TR-5: {@link ImagePathPort} is the ONLY route to a resized image path. Nothing here imports a
     * file-system, path or URL built-in, probes for existence, reconstructs the hardcoded SKU image
     * segment or reads the image-folder setting directly.
     *
     * TODO(parity): THE DEPRECATED SIZE GATE IS DEAD ON THIS PATH, and calling the domain member with
     * no size argument is what reproduces that. `product.cfm:L23` calls the resized-path member with
     * ZERO arguments, so the four-part gate at `model/entity/Sku.cfc:L203` never fires: NO width, NO
     * height and NO `scaleBest` resize method ever reach the image service from the feed. Only the
     * image path (`:L195`) and the missing-image path (`:L198-L199`) do, which means the image
     * service's own zero-argument defaults govern — `model/service/ImageService.cfc:L78` declares
     * them as a `scale` resize method, a `center` crop location and an empty canvas colour. No size
     * token is invented to fill the gap: the size segment is an open string rather than a closed set,
     * and fabricating a value would change which setting keys are read. */
    /* SEC-06 / DECISION G-2 and G-3. {@link ImageWebPath} is a nominal DISPLAY tag that
     * `src/ports/ImagePathPort.ts` says "asserts nothing about the value", so the resolved path is
     * validated here exactly like the item link's, then escaped once. */
    const resizedImagePath = requireRelativeFeedPath(
      'g:image_link',
      sku.skuID,
      await sku.getResizedImagePath(this.imagePaths, this.settings),
    );
    fields.push(
      `<g:image_link>${escapeFeedText(`${absoluteUrlPrefix}${resizedImagePath}`)}</g:image_link>`,
    );

    /* ---- 8. repeated `g:additional_image_link` — RAW IN THE LEGACY, ESCAPED HERE (`:L24`). ----
     * One element per product image, IN THE EXISTING ARRAY ORDER: no sort, no de-duplication, no
     * filtering, no existence probe. Zero images yields zero elements.
     *
     * These take a DIFFERENT ROUTE to the same port than field 7 does, and that asymmetry is
     * faithful. `model/entity/Image.cfc:L120-L146` sets the image path from the image's own
     * `directory` column (`:L79-L81`) and resolves the missing-image setting only when the caller
     * supplied none (`:L126-L128`), whereas the SKU form hardcodes a `/product/default/` segment.
     * The port's file-name-based member owns the SKU construction, so it cannot express the
     * directory-driven form — hence the request is assembled here from the image's own path. TR-5.
     *
     * The missing-image key is resolved with NO receiver context, because the resolver's entity union
     * covers products, SKUs and options only — an image is not one of the in-scope entities, so there
     * is no image receiver to name. That is an adaptation to the contract that exists, recorded here
     * rather than papered over.
     *
     * Two further parity notes, neither harmonised. First, the size gate at
     * `model/entity/Image.cfc:L131-L143` is as dead here as the SKU one is, for the same reason: the
     * feed passes no arguments. Second, `model/entity/Image.cfc`'s two resized members — `:L87-L118`
     * and `:L120-L146` — set NO resize method at all, where `model/entity/Sku.cfc:L186` and `:L214`
     * both set `scaleBest`. The divergence is preserved: the request built below carries no resize
     * method, so the image service's own default applies, exactly as it does for the legacy image. */
    for (const image of record.productImages) {
      /* SEC-07 / ImagePathPort DECISION I-1: the port's request now types `imagePath` as
       * {@link ImageWebPath}, so a raw `string` cannot be handed to it and the URL-versus-file-system
       * distinction is carried in the type rather than in prose.
       *
       * ⭐ TAGGING IS CORRECT HERE, AND IT IS THE ONLY PLACE IN THIS FILE THAT TAGS. The value is an
       * ALREADY-COMPOSED display URL — `model/entity/Image.cfc:L79-L81` builds it from the image's own
       * `directory` column and `:L123` assigns it before delegating — so this is exactly the
       * "composed path being labelled" case {@link toImageWebPath} exists for. It asserts nothing about
       * the value, and it cannot widen this builder's reach: the tag produces only the DISPLAY brand,
       * and no file-system member of the port accepts one. This file writes no image and probes for
       * none, which is why it needs no validated basename. */
      const request: ResizedImagePathRequest = {
        imagePath: toImageWebPath(image.imagePath),
        missingImagePath: image.missingImagePath ?? this.settings.setting('imageMissingImagePath'),
      };
      /* SEC-06 / DECISION G-2 and G-3, per image. The missing-image SETTING can be the value that
       * ends up here, so this path is no more trusted than the primary one. */
      const additionalImagePath = requireRelativeFeedPath(
        'g:additional_image_link',
        sku.skuID,
        await this.imagePaths.getResizedImagePath(request),
      );
      const additionalImageUrl = escapeFeedText(`${absoluteUrlPrefix}${additionalImagePath}`);
      fields.push(`<g:additional_image_link>${additionalImageUrl}</g:additional_image_link>`);
    }

    /* ---- 9 and 10. fixed `g:condition` and `g:availability` (`:L25`, `:L26`). ----------------
     * The only two element texts in this method that are NOT escaped, because both are module
     * constants holding no metacharacter — see {@link escapeFeedText} for why compile-time literals
     * are the one exception and why a test asserts that property instead of trusting the reading. */
    fields.push(`<g:condition>${CONDITION_VALUE}</g:condition>`);
    fields.push(`<g:availability>${AVAILABILITY_VALUE}</g:availability>`);

    /* ---- 11. `g:price` — UNESCAPED (`product.cfm:L27`). -------------------------------------
     * THE PRODUCT PRICE, NOT THE SKU PRICE. `product.cfm:L27` reads the product's price while
     * `:L28` reads the SKU's, and substituting one for the other would silently change the advertised
     * price of every variant.
     *
     * AN ABSENT PRICE RENDERS AN EMPTY ELEMENT, AND THAT IS THE PARITY BEHAVIOUR.
     * `model/entity/Product.cfc:L561-L568` returns the overridden price when set, otherwise the
     * default SKU's price, and otherwise FALLS OFF THE END WITH NO RETURN — so CFML interpolates
     * nothing and emits `<g:price></g:price>`. The domain member types that honestly as a
     * possibly-absent number, and the empty case is reproduced here. Substituting zero would
     * advertise every unpriced product as free; omitting the element would drop a field the legacy
     * always emits; raising would abort a render the legacy completes. None of those is done. */
    /* SEC-06 / DECISION G-3. A `number` cannot render an XML-significant character, so this call is
     * provably a no-op for every well-typed value — it is made so that the emission-site invariant
     * holds without exception and so that a future widening of the member's return type cannot
     * silently reopen the finding. */
    const productPrice = product.getPrice();
    /* F21 — RENDERED THROUGH {@link renderFeedMoney}, NOT `String(...)`. `String(1e-7)` yields
     * `"1e-7"`, which is not legal feed money and which no consumer will parse as a price. The helper
     * expands exponential notation to plain decimal text and rounds, pads and truncates nothing. The
     * empty case stays empty: the legacy emits `<g:price></g:price>` when the price is absent. */
    fields.push(
      `<g:price>${escapeFeedText(productPrice === undefined ? '' : renderFeedMoney(productPrice))}</g:price>`,
    );

    /* ---- 12 and 13. conditional `g:sale_price` and `g:sale_price_effective_date` (`:L28-L31`). -
     * THE SALE-PRICE DRIFT TRAP — the most dangerous field in this file.
     *
     * `model/entity/Sku.cfc:L546-L551` returns the promotional sale price IF the detail carries one,
     * ELSE the SKU's ordinary price. NOT null, and NOT zero. So with no promotion in effect the two
     * sides of the legacy comparison at `product.cfm:L28` are EQUAL, the strict greater-than is
     * FALSE, and the pair is correctly OMITTED.
     *
     * Reporting "no sale" as zero or as an absent value would invert that comparison and put EVERY
     * product in the catalogue on sale, emitting a bogus sale price and a bogus effective date for
     * each — with no compile error and no runtime failure to reveal it. That is why the fallback is
     * applied BEFORE the comparison and why the comparison is STRICT.
     *
     * The fallback is applied by the domain member itself, which is where the legacy keeps it, so it
     * cannot be forgotten here. TODO(boundary): both values cross the excluded calculated-property
     * boundary of AAP §0.2.2.6 into the out-of-scope promotion subsystem; TR-5 — {@link PricingPort}
     * is the declared crossing and is handed to the domain member as its lookup collaborator. */
    const skuPrice = sku.getPrice();
    const salePrice = await sku.getSalePrice(this.pricing);
    if (skuPrice > salePrice) {
      /* SEC-06 / DECISION G-3 — a `number`, so provably a no-op, escaped for the same reason the
       * product price is. */
      // F21 — the same plain-decimal rendering as `g:price` above; see the note there.
      fields.push(`<g:sale_price>${escapeFeedText(renderFeedMoney(salePrice))}</g:sale_price>`);

      /* The eleven-part range of `product.cfm:L30`, in the legacy's own order: render date, `T`,
       * render time, `-`, raw offset, `/`, expiration date, `T`, expiration time, `-`, the SAME raw
       * offset. Nothing is normalised to a zulu designator, no minutes are appended to the offset,
       * the offset is neither padded nor re-signed, and the literal hyphen is emitted regardless of
       * the offset's own sign. TODO(boundary): the expiration crosses the same excluded boundary as
       * the sale price and arrives through the same port (TR-5); it may legitimately be absent, and
       * {@link renderEffectiveDateEndpoint} documents how that is carried. */
      const expiration = await sku.getSalePriceExpirationDateTime(this.pricing);
      const effectiveFrom = renderEffectiveDateEndpoint(context.renderTime, context.utcHourOffset);
      const effectiveTo = renderEffectiveDateEndpoint(expiration, context.utcHourOffset);
      /* SEC-06 / DECISION G-3 — NOT a no-op, and the reason this field is on the hardened list.
       * {@link ProductFeedRenderContext.utcHourOffset} is deliberately typed as arbitrary TEXT so
       * that it can be emitted unmodified, and it appears TWICE in this range. It is the one
       * caller-supplied string in the item that carries no brand and no allowlist, so escaping is
       * the whole of its defence. The two date parts come from {@link formatDate} and the digits,
       * hyphens, `T` and `/` around them are literals. */
      const effectiveDate = escapeFeedText(`${effectiveFrom}/${effectiveTo}`);
      /* The legacy leaves a single TAB after this element's closing tag at
       * `product.cfm:L30`, and it is reproduced — see {@link SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB}
       * for why a dropped byte is a departure from byte-for-byte preservation even when it is only
       * whitespace. This is the ONLY element that carries one. */
      fields.push(
        `<g:sale_price_effective_date>${effectiveDate}</g:sale_price_effective_date>` +
          SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB,
      );
    }

    /* ---- 14. conditional `g:brand` — ESCAPED (`product.cfm:L32`). ----------------------------
     * THE CONDITION TESTS THE BRAND OBJECT, NOT THE BRAND NAME. `product.cfm:L32` guards on the
     * association being present, so a product associated with a brand whose name is empty EMITS AN
     * EMPTY `g:brand` ELEMENT. Guarding on the name instead would drop the element in that case and
     * change the document's field census.
     *
     * The name is read from the BRAND'S OWN accessor, exactly as `product.cfm:L32` does. That
     * deliberately bypasses `model/entity/Product.cfc:L524-L532`'s product-side `getBrandName()`,
     * whose memoization defect stores an empty string and then returns it on the second call. The
     * defect belongs to `src/domain/product/Product.ts`, is carried there, and is neither touched,
     * reproduced nor worked around from here — the feed simply never took that path. */
    const brand = product.brand;
    if (brand !== undefined) {
      fields.push(`<g:brand>${escapeFeedText(brand.brandName ?? '')}</g:brand>`);
    }

    /* Fields disabled in the legacy source between `:L32` and `:L39` — `g:gtin`, `g:mpn`,
     * `g:gender`, `g:age_group` (`product.cfm:L33-L38`). They sit inside a CFML server-side comment
     * block, so they were NEVER emitted. Their names are retained here as source comments because
     * they document the intended future surface and deleting them would lose information; they are
     * not emitted, not populated, and not turned into markup comments. */

    /* ---- 15. `g:item_group_id` — ESCAPED (`product.cfm:L39`). -------------------------------- */
    fields.push(`<g:item_group_id>${escapeFeedText(product.productCode ?? '')}</g:item_group_id>`);

    /* Fields disabled in the legacy source between `:L39` and `:L58` (`product.cfm:L40-L57`), all
     * inside a CFML server-side comment block and therefore never emitted: `g:color`, `g:size`,
     * `g:material`, `g:pattern`; `g:tax` wrapping `g:country`, `g:region`, `g:rate` and `g:tax_ship`;
     * and `g:shipping` wrapping `g:country`, `g:region`, `g:service` and `g:price`. Names retained,
     * nothing emitted. */

    /* ---- 16. `g:shipping_weight` — RAW IN THE LEGACY, ESCAPED HERE (`product.cfm:L58`). ------
     * TWO SETTINGS JOINED BY EXACTLY ONE LITERAL SPACE. Neither value is trimmed and the result is
     * not trimmed, so a value that resolves empty still leaves the space in place — precisely what
     * CFML interpolation produces.
     *
     * Both keys are read SYNCHRONOUSLY (M8 — never awaited, never typed as a promise), with an
     * explicit SKU receiver context that reproduces `model/entity/HibachiEntity.cfc:L129-L131`
     * passing `object=this` for per-object hierarchical resolution. The legacy `sku.setting(...)`
     * member is not part of the domain entity's surface and is not used. TR-5:
     * {@link SettingResolverPort} is the only route to these keys, and this file is their only
     * in-scope reader.
     *
     * NO DEFAULT IS INVENTED, AND NO GRAMMAR IS IMPOSED. Neither key is seeded in
     * `config/dbdata/SlatwallSetting.xml.cfm`, and defaults belong to the settings adapter, which this
     * layer may not import. Whatever the resolver returns is emitted, escaped and otherwise untouched —
     * including the empty string, which is why the unseeded case keeps rendering
     * `<g:shipping_weight> </g:shipping_weight>`, the lone separator space and nothing else.
     *
     * ⛔ THE TWO GRAMMARS THAT USED TO GUARD THIS SITE ARE GONE ON PURPOSE. `skuShippingWeight` is
     * declared `fieldType="text"` and the unit code's options are a LIVE query over a user-editable
     * table, so neither value is a closed set; the full evidence is in the RAW-SINK VALIDATION note
     * above. Escaping is the whole of the defence here, and it is sufficient because the risk at this
     * sink is document corruption rather than origin relocation. */
    const settingContext: SettingResolutionContext = { entityName: 'Sku', entityId: sku.skuID };
    const shippingWeight = this.settings.setting('skuShippingWeight', settingContext);
    const shippingWeightUnitCode = this.settings.setting(
      'skuShippingWeightUnitCode',
      settingContext,
    );
    /* SEC-06 / DECISION G-3 — NOT a no-op either. Both values come from the settings store, which is
     * operator- and database-supplied text with no allowlist, so both are escaped. The join is
     * escaped once rather than each value separately: the single literal space between them is not in
     * the escaped set, so one call preserves the exact legacy spacing — including the case where one
     * value resolves empty and the space survives on its own. */
    const shippingWeightText = escapeFeedText(`${shippingWeight} ${shippingWeightUnitCode}`);
    fields.push(`<g:shipping_weight>${shippingWeightText}</g:shipping_weight>`);

    /* Field disabled in the legacy source after `:L58` — `g:online_only` (`product.cfm:L59-L61`),
     * inside a CFML server-side comment block and therefore never emitted. Name retained. */

    const itemIndent = INDENT_UNIT.repeat(3);
    return [
      `${INDENT_UNIT.repeat(2)}<item>`,
      ...fields.map((field) => `${itemIndent}${field}`),
      `${INDENT_UNIT.repeat(2)}</item>`,
    ].join('\n');
  }

  /**
   * Chooses the description text, reproducing the three-way selection of
   * `integrationServices/google/views/feed/product.cfm:L19`.
   *
   * The product's own description wins when it is non-empty; otherwise the product type's
   * description is used when IT is non-empty; otherwise the element is emitted EMPTY. "Non-empty"
   * means a length greater than zero, mirroring CFML's own length test rather than a truthiness
   * check — a description of `"0"` is non-empty in both languages and must select the first branch.
   *
   * NEITHER VALUE IS TRIMMED, NORMALISED OR TRUNCATED. A whitespace-only description is non-empty by
   * this test, exactly as it is in CFML, and it therefore wins over the product type's description.
   * Trimming would flip that branch.
   *
   * The RAW text is returned and escaped once by the caller, so the escaper is invoked exactly once
   * per field and the six-call-site escaping scope stays auditable.
   *
   * ⚠️ F14 — A CLAIM WITHDRAWN. This said "a product with no product type is treated as contributing
   * no description", reasoning that because the legacy dereferences the association without a guard
   * at `:L19` and the association is optional under strict typing, "falling through to the empty
   * element keeps the three-way selection total without inventing a value". The premise defeats the
   * conclusion: an UNGUARDED dereference is precisely what does NOT tolerate absence, so the lenient
   * fallthrough was the invented behaviour. The selection is still total — it now has two outcomes
   * rather than three, the second being a raised fault, which is what the legacy produces.
   *
   * @param product the product being described
   * @returns the selected description, or the empty string when neither source has content
   */
  private selectDescription(product: Product): string {
    const productDescription = product.productDescription ?? '';
    if (productDescription.length > 0) {
      return productDescription;
    }

    /* F14 — the product type is REQUIRED here, exactly as `product.cfm:L19` requires it. The previous
     * optional chain let an absent product type mean "contributes no description", which silently
     * emitted an empty description for a product that had none of its own. */
    const productType = this.requireProductType(
      product,
      'integrationServices/google/views/feed/product.cfm:L19',
    );
    const productTypeDescription = productType.productTypeDescription ?? '';
    if (productTypeDescription.length > 0) {
      return productTypeDescription;
    }

    return '';
  }

  /**
   * Reads a SKU's product, raising where the legacy would have raised.
   *
   * `integrationServices/google/views/feed/product.cfm` dereferences the product association without
   * a guard EIGHT times — `:L18`, `:L19`, `:L21`, `:L22`, `:L24`, `:L27`, `:L32` and `:L39` — and
   * CFML raises on a null reference at the first of them. The association is genuinely optional in
   * the domain, so strict typing forces the question to be answered here, and AAP §0.7.3 S1 forbids
   * answering it with a non-null assertion.
   *
   * THIS FOLLOWS THE SUBTREE'S ESTABLISHED UNGUARDED-DEREFERENCE POLICY: where the legacy would have
   * raised, the port raises too, naming the member and its locator so the failure is diagnosable
   * rather than opaque. The alternative — emitting an item full of empty fields — would INVENT a
   * lenient behaviour the legacy does not have, and would publish a malformed product to a merchant
   * feed rather than reporting a data problem.
   *
   * The genuinely lenient legacy path, an absent sale-price expiration, is carried leniently and
   * invents no error — see {@link renderEffectiveDateEndpoint}. The message below is this file's own;
   * no error string owned by `src/errors/` is reproduced anywhere in this module.
   *
   * ⭐ THE DIAGNOSTIC IS SPLIT: STABLE TEXT IN THE MESSAGE, DETAIL IN STRUCTURED CONTEXT. The legacy
   * source locator and the SKU identifier used to sit in the message text, and `errorResponse` in
   * `src/handlers/httpResponse.ts` would have carried them to a client. Neither belongs there: a
   * locator discloses the internal provenance of the port and an identifier discloses catalogue data.
   * They are therefore passed as context, which that boundary LOGS and WITHHOLDS, while the message
   * itself stays stable and says only what went wrong.
   *
   * NO `publicMessage` IS CLASSIFIED. This is an internal data-integrity failure, not a legacy
   * behaviour a caller is entitled to read, so it deliberately falls to the default-deny arm of the
   * disclosure gate and is answered with a neutral response. Only the four verbatim legacy strings
   * owned by `src/errors/DomainError.ts` are classified as client-safe, and none of them is this.
   *
   * ⚠️ THE SKU IS NAMED IN THE MESSAGE AGAIN, AND THE REASON IT WAS REMOVED NO LONGER HOLDS. It was
   * taken out on the ground that `errorResponse` in `src/handlers/httpResponse.ts` "would have carried
   * it to a client" — true of a disclosure gate that inspected message CONTENT, false of the gate that
   * is now in force, which discloses by TYPE and publishes nothing from a plain `DomainError` at all.
   * With the message unreachable from a response, redacting it bought no security and cost the only
   * thing a log reader needs: a render walks thousands of records, and a refusal that names none of
   * them is undiagnosable in any log that prints `error.message` without the context object. The
   * identifier stays in the structured context as well — RAW there, because context is machine-read
   * and the empty string is the more precise statement — so nothing was traded away to restore it.
   * Naming the subject is also this file's dominant idiom: {@link requireRelativeFeedPath} and
   * {@link ProductFeedBuilder.requireProductType} both do it, and the inconsistency was this member's.
   *
   * @param sku the SKU whose product is required
   * @returns the associated product
   * @throws {DomainError} when the SKU carries no product
   */
  private requireProduct(sku: Sku): Product {
    const product = sku.product;
    if (product === undefined) {
      throw new DomainError(
        `Sku ${sku.skuID === '' ? '(unsaved)' : sku.skuID} selected for the Google product feed ` +
          `carries no product, so no item could be rendered for it.`,
        {
          context: {
            skuID: sku.skuID,
            skuCode: sku.skuCode,
            locator: 'integrationServices/google/views/feed/product.cfm:L18',
          },
        },
      );
    }
    return product;
  }

  /**
   * Returns a product's product type, raising when it is absent (F14).
   *
   * ⭐ THE LEGACY DEREFERENCES THIS ASSOCIATION TWICE, BOTH TIMES WITHOUT A GUARD, and the contrast
   * with its neighbours is what makes the requirement certain rather than inferred.
   * `integrationServices/google/views/feed/product.cfm:L19` reads
   * `...getProduct().getProductType().getProductTypeDescription()` inside the description fallback and
   * `:L21` reads `...getProductType().getSimpleRepresentation()` for `g:product_type`. Neither is
   * wrapped. Meanwhile `:L32` DOES guard its association — `<cfif not isNull(...getBrand())>` — so
   * the view demonstrably knows how to make a relationship optional and deliberately does not do it
   * for the product type. An absent product type therefore FAILS the legacy render.
   *
   * ⚠️ WHAT THIS REPLACES, AND WHY IT WAS WRONG. Both call sites previously used optional chaining and
   * a `?? ''` fallback, so a product with no product type silently published an item with an EMPTY
   * `g:product_type` and, when the product also had no description of its own, an EMPTY
   * `description`. Those are two of the fields Google matches on, so the record would be accepted and
   * mis-categorised rather than rejected — a data-quality failure that is invisible in the feed
   * itself. Reporting the problem is both the faithful behaviour and the safe one.
   *
   * ⛔ RAISED AS A `DataIntegrityError`, not a `DomainError`. The condition is a broken row in the
   * catalogue rather than a service defect, so it presents as a neutral `SERVICE_DATA` fault; the
   * product identifier is recorded in the internal context and is not disclosed.
   *
   * @param product the product whose product type is required
   * @param locator the legacy line whose unguarded dereference this reproduces
   * @returns the associated product type
   * @throws {DataIntegrityError} when the product carries no product type
   */
  private requireProductType(product: Product, locator: string): ProductType {
    const productType = product.productType;
    if (productType === undefined) {
      throw new DataIntegrityError(
        `Product ${product.productID === '' ? '(unsaved)' : product.productID} carries no product ` +
          `type, so the Google product feed cannot render an item for it. The legacy view ` +
          `dereferences the product-type association without a guard at ${locator}, while guarding ` +
          `the brand association at product.cfm:L32 — so an absent product type fails the legacy ` +
          `render rather than producing an empty element.`,
        {
          context: {
            productID: product.productID,
            locator,
            finding: 'F14',
          },
        },
      );
    }
    return productType;
  }
}
