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
 *     SKUs appear. Its port is `ProductFeedQuery.ts`, which is delivered: it carries the three
 *     related-property joins, the three activity filters and the availability range, and it resolves
 *     the relationships this file's sixteen fields dereference.
 *   - `integrationServices/google/views/feed/product.cfm` (66 lines) — ALL of the data shaping.
 *     Its port is THIS FILE.
 *   - `integrationServices/google/model/dao/FeedDAO.cfc` (76 lines) — orphaned dead code with
 *     syntactically broken SQL and zero callers repository-wide. Deliberately NOT ported; the
 *     evidence is carried in this folder's `README.md` §9 — the home AAP §0.4.1.10 assigns it — and
 *     is not restated here, because a carried-defect entry must be findable in exactly one place.
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
 *      no slash is added or removed, and the host is neither trimmed, normalised nor validated. It is
 *      a plain `string`, XML-ESCAPED at each of the five emission sites but never percent-encoded — see
 *      WITHDRAWN RAW-SINK VALIDATION for the validated-and-branded form an earlier revision used and why
 *      it is withdrawn, and {@link encodeFeedUrlPath} for why an authority is escaped and a path is
 *      encoded.
 *   2. `now()` (`product.cfm:L30`, read twice) becomes {@link ProductFeedRenderContext.renderTime}.
 *      Nothing in this module constructs a date or reads a clock.
 *   3. `getTimeZoneInfo().utcHourOffset` (`product.cfm:L30`, read twice) becomes
 *      {@link ProductFeedRenderContext.utcHourOffset}, emitted UNMODIFIED apart from the XML escape the
 *      finished timestamp receives — see that member for why it is typed as text rather than as a
 *      number.
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
 * therefore an UNRESOLVED DECISION belonging to `src/handlers/googleFeedHandler.ts`, which is
 * delivered and which carries that flagged decision rather than resolving it — publication topology is
 * infrastructure, and AAP §0.2.2.5 puts infrastructure as code out of scope. This builder deliberately
 * sets no budget, no page size, no chunk size, no
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
 * WHERE THIS FILE DIVERGES FROM THE LEGACY, AND WHERE IT DELIBERATELY DOES NOT
 * ------------------------------------------------------------------------------------------------
 * Sixteen fields are emitted per item, thirteen of them carrying a dynamic value, plus two dynamic
 * channel-level fields. THE LEGACY ESCAPES SIX OF THOSE FIFTEEN AND EMITS NINE RAW; THIS FILE ESCAPES ALL
 * FIFTEEN, and additionally percent-encodes the data-derived path of the three URL fields. That is ONE
 * declared divergence, it is a security hardening the code review examining this file classified as MAJOR
 * and directed, and the full argument — including the parity objection it overrules and the byte
 * difference it produces — is recorded at ESCAPING below rather than summarised twice.
 *
 * ⛔ AND THREE OTHER HARDENINGS AN EARLIER REVISION ADDED HERE ARE NOT REINSTATED, BECAUSE ALL THREE
 * REFUSE WHERE THE LEGACY PUBLISHES. It validated the host authority against a character allowlist and a
 * DNS-label ceiling and RAISED on a miss; it validated three URL paths as same-origin relative references
 * and RAISED on a miss; and it scanned every value against the XML 1.0 `Char` production and RAISED on a
 * miss. A refusal returns NO DOCUMENT where `product.cfm` returns one, which is a strictly larger
 * divergence than encoding a character — so escaping stands and refusing does not. AAP §0.8.2
 * guideline 2 requires existing behaviour preserved, and §0.6.7's "preserve and annotate, do not repair"
 * governs everything an authority has not licensed. See WITHDRAWN RAW-SINK VALIDATION and THERE IS NO
 * XML-REPRESENTABILITY GATE below for each one.
 *
 * ⚠️ WHAT THE ESCAPING DOES NOT REACH IS THEREFORE STILL CARRIED: a code point XML 1.0 forbids in any
 * spelling has no escaped form, so it reaches the document as it reaches `product.cfm`, leaving that
 * document with no defined parse. Flagged at THERE IS NO XML-REPRESENTABILITY GATE, not closed (S8).
 *
 * COVERAGE PROVENANCE — NET-NEW, AND THE SUITE IS NAMED
 * This module's suite is `slatwall-ts/test/integrations/ProductFeedBuilder.test.ts`, the exact path AAP
 * §0.4.1.12 assigns it, and that row labels it NET-NEW: it extends no legacy coverage and no parity of
 * coverage is claimed. `meta/tests/` holds no test for
 * `integrationServices/google/views/feed/product.cfm`, for its controller or for its DAO (AAP §0.6.5.2).
 *
 * ⚠️ AND THE LEGACY SIDE OF THAT COMPARISON IS DOCUMENTARY ONLY, WHICH IS A LIMITATION AND NOT A
 * FORMALITY. AAP §0.5.4 records that MXUnit and CFSelenium are NOT VENDORED in this repository and
 * §0.8.4.2 concludes that the legacy suite therefore cannot be executed here at all; §0.8.4.1 adds that
 * the cited `meta/docker/slatwall-local-dev/` does not exist, so no CFML runtime is reproducible either.
 * The "no legacy test exists" statement above was therefore established by READING legacy test source,
 * not by running it and comparing output. Nothing in this file's provenance claim rests on an executed
 * comparison, and saying so is preferable to implying one that never happened (AAP §0.8.3.7).
 *
 * The legacy suite also ships no mocking library and boots the whole framework application per test, so
 * legacy tests are integration tests where the target's are unit tests — a difference by design rather
 * than a gap (AAP §0.4.3.6). What this module owes its suite in return is
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
/* `ImageWebPath` and `SaveImageFileRequest` were imported for the two withdrawn memo decorators, which
 * had to re-declare every member of {@link ImagePathPort} in order to delegate the three they did not
 * wrap. With no wrapper left, this file names only the port it is handed and the one request shape it
 * builds; `ImageWebPath` survives in prose as a `{@link}` only, which needs no import. */
import type { ImagePathPort, ResizedImagePathRequest } from '../../ports/ImagePathPort';
/* `compareExactDecimal` is a RUNTIME import, not a type-only one: `ExactDecimal` is a branded STRING, so
 * `>` between two of them compiles and silently orders lexicographically — `'9.00' > '10.00'` is true. The
 * sale-price guard is ordered digit-wise instead; the full account is on the comparison itself. */
/* `formatDate` is the subtree's port of CFML's `dateFormat`, mask grammar and LOCAL components and
 * all. Both effective-date endpoints go through it with the legacy's own mask; see
 * {@link EFFECTIVE_DATE_MASK}. */
import { compareExactDecimal, formatDate, type ExactDecimal } from '../../util/formatting';
/* Runtime import: DECISION I-1's display tag. See the call site in the additional-image loop. */
import { toImageWebPath } from '../../ports/ImagePathPort';
/* `SalePriceDetailsBySkuId` was the withdrawn pricing decorator's memo value type. The port itself is
 * still named, because it is still a constructor parameter. */
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
 * introduced: the folder is flat, and its six delivered files are exactly the six AAP §0.4.1.10 names
 * — none of them is a shared type bucket.
 * ============================================================================================= */

/* ------------------------------------------------------------------------------------------------
 * WITHDRAWN RAW-SINK VALIDATION — THE TWO FAIL-CLOSED GATES ARE GONE, AND ESCAPING REPLACED THEM
 * ------------------------------------------------------------------------------------------------
 * ⛔ WHAT WAS HERE. Two fail-closed gates and their grammars:
 *   - A module-private `FEED_HOST_AUTHORITY` symbol, a branded `FeedHostAuthority` type, a
 *     `FEED_HOST_AUTHORITY_PATTERN` character allowlist, RFC 1035's 63-octet DNS-label ceiling and a
 *     `validateFeedHostAuthority` function that RAISED on a miss. The brand was unforgeable, so a raw
 *     host became a compile error.
 *   - A `URI_EXCLUDED_CHARACTER_PATTERN` derived from RFC 3986 and a `requireRelativeFeedPath` function
 *     that RAISED when a path was absolute, scheme-relative, or carried an excluded character. It
 *     guarded the item `link`, `g:image_link` and every `g:additional_image_link`.
 *
 * ⛔ WHY BOTH STAY WITHDRAWN, EVEN THOUGH THE EXPOSURE THEY ADDRESSED IS NOW CLOSED BY OTHER MEANS.
 * `integrationServices/google/views/feed/product.cfm` validates NOTHING: `:L14`, `:L15`, `:L22`, `:L23`
 * and `:L24` interpolate `CGI.HTTP_HOST` with no check of any kind, and `:L22`, `:L23` and `:L24` append
 * `getProductURL()` and `getResizedImagePath()` with no check either. The legacy renders the document
 * whatever those values contain, so REFUSING to render is a divergence of a different order from
 * encoding a character: it withholds output entirely. AAP §0.8.2 guideline 2 requires existing behaviour
 * preserved for the in-scope modules, and §0.6.7.7's D18 precedent licenses only a divergence that
 * changes no outcome. A refusal is not one.
 *
 * ⭐ AND A GRAMMAR WAS THE WRONG SHAPE OF REMEDY ANYWAY, WHICH IS THE MORE USEFUL FINDING. Both gates had
 * to decide which values are LEGITIMATE, and neither could: a host allowlist has to anticipate every
 * deployment's authority form, and a path grammar has to anticipate every image adapter's output. Each
 * invented a closed set the repository does not declare, which AAP §0.7.3 S9 forbids independently of the
 * refusal question.
 *
 * ⭐ WHAT CLOSES THE EXPOSURE INSTEAD. Both remedies are now encodings rather than judgments, so neither
 * needs a grammar and neither can refuse a value: every dynamic text node is XML-escaped (see ESCAPING),
 * which keeps hostile markup as DATA; and the data-derived PATH of each of the three URLs is
 * percent-encoded per segment (see {@link encodeFeedUrlPath}), which keeps a stored value from
 * introducing a URL authority — the origin-rebasing route these gates existed for. The host itself is
 * escaped but NOT percent-encoded, because a legitimate authority carries `:` before a port; that
 * asymmetry is deliberate and is recorded at the encoder.
 *
 * ⭐ THE HOST ARRIVES AS A PLAIN `string`, AND THAT IS UNCHANGED. The composition root supplies it from
 * configuration because the target runtime HAS NO `CGI` SCOPE to read — an execution-model adaptation
 * forced by the platform, not a security control. `src/config/env.ts` records the same conclusion on its
 * side. Nothing in this module reads a request header, because nothing in this module reads a request at
 * all.
 * ---------------------------------------------------------------------------------------------- */

/*
 * ⛔ THE HOST-VALIDATION TYPE CLUSTER STOOD HERE AND IS REMOVED ALONG WITH THE VALIDATOR IT SERVED: a
 * module-private `FEED_HOST_AUTHORITY` unique symbol, the branded `FeedHostAuthority` type it keyed, the
 * `FEED_HOST_AUTHORITY_PATTERN` character allowlist and RFC 1035 §2.3.4's 63-octet DNS-label ceiling.
 * Each was referenced ONLY by the BRANDING validator that once stood below, so none of them outlived it;
 * the block immediately above records why they are withdrawn. ⚠️ AND NONE OF THEM COMES BACK WITH THE
 * GATE: a threat-shaped {@link validateFeedHostAuthority} has since been reinstated at that position
 * (findings F7 and SEC-06), but it is a deny check over a forbidden-character set and references not one
 * of these four declarations, which is precisely why they are still absent.
 *
 * ⚠️ AND THE VALIDATOR'S OWN DOC COMMENT OUTLIVED THE VALIDATOR, WHICH IS NOW ALSO GONE. A complete
 * JSDoc block — "Validates a host authority and brands it…", its `@param candidate`, its `@returns the
 * same string, branded and unmodified` and an `@throws` clause pointing at the deleted
 * `FEED_HOST_AUTHORITY_PATTERN` — stood immediately below this note, in the present tense, with no
 * declaration beneath it. It had come to sit directly above the doc comment of the pricing decorator,
 * so the two read as one block and the withdrawn validator read as a live member. Nothing detected it:
 * a comment satisfies no compiler, no lint rule and no test, and a `{@link}` to a removed symbol is
 * only prose. It is deleted rather than rewritten, because the two blocks above already carry the
 * whole account and a third copy would be one more thing to keep true.
 */

/* ------------------------------------------------------------------------------------------------
 * THERE IS NO PORT MEMOISATION IN THIS FILE, AND AN EARLIER REVISION HAD THREE PIECES OF IT
 * ------------------------------------------------------------------------------------------------
 * ⛔ WHAT STOOD HERE. A `memoisePricingByProduct` decorator that resolved each product's sale-price
 * details at most once per document; a `memoiseResizedImagePaths` decorator that resolved each distinct
 * {@link ResizedImagePathRequest} at most once per document, keyed on all six of its fields; and a
 * `FeedDocumentScope` type that carried the two wrapped ports together from
 * {@link ProductFeedBuilder.build} into {@link ProductFeedBuilder.buildItem}. All three are removed and
 * both collaborators are now read straight off `this`.
 *
 * ⛔ WHY. They were port-call optimisations, and this migration is explicitly not a performance
 * refactoring: AAP §0.1.1.1 classifies it as a tech-stack migration and records "Explicitly not:
 * Performance refactoring" as a dimension in its own right, and §0.8.2 guideline 4 forbids enhancing or
 * optimising business logic beyond what the migration requires. The legacy call pattern is therefore the
 * behaviour to port: `integrationServices/google/views/feed/product.cfm:L23` resolves a resized path
 * once per SKU and `:L24` resolves one per PRODUCT IMAGE PER SKU, so a feed of `n` SKUs over a product
 * with `i` images issues `n * (1 + i)` resolutions. That is what this file now issues.
 *
 * ⚠️ AND THE PORTS NEVER PROMISED A STABLE REPEATED ANSWER, WHICH IS THE SHARPER OBJECTION. Neither
 * `../../ports/PricingPort` nor `../../ports/ImagePathPort` declares its reads idempotent, pure or
 * cacheable; the "the answer cannot differ" claim the withdrawn decorators rested on was an assumption
 * about implementations that do not exist yet, made on their behalf. Collapsing `n` reads into one is
 * observable to any adapter that counts them, and an adapter whose second answer legitimately differs
 * would have been silently overruled.
 *
 * ⭐ WHAT IS UNCHANGED. Records are still rendered strictly sequentially, one awaited item at a time, in
 * the order given — the repetition is restored, not the concurrency, because `product.cfm:L16`'s `cfloop`
 * is sequential and feed order is observable. Nothing is prefetched, batched or reordered, and no
 * concurrency limit, batch size or chunk size is introduced (AAP §0.7.3 S9).
 *
 * ⭐ M7 IS SATISFIED MORE SIMPLY THAN BEFORE, NOT LESS. The decorators were invocation-scoped precisely so
 * that a warm container could not serve one tenant's resolved prices or paths into another request's feed.
 * With no memo at all there is no state to scope: the only module-scope values in this file are frozen
 * literal constants and every constructor parameter is `readonly`.
 * ---------------------------------------------------------------------------------------------- */

/*
 * ⛔ THE BRANDING VALIDATOR THAT STOOD HERE IS GONE, AND ⭐ A THREAT-SHAPED GATE HAS TAKEN ITS PLACE
 * BELOW — findings F7 and SEC-06. An earlier revision of this note said the member was removed outright
 * and that five other places agreed; that is no longer the state of the code, and the note is corrected
 * here rather than left to contradict the declaration at {@link validateFeedHostAuthority}.
 *
 * WHAT IS GONE STAYS GONE, AND IT IS THE PART THAT INVENTED POLICY: the `FEED_HOST_AUTHORITY` unique
 * symbol, the branded `FeedHostAuthority` type, the `FEED_HOST_AUTHORITY_PATTERN` positive allowlist,
 * RFC 1035 §2.3.4's 63-octet DNS-label ceiling, and the fail-closed `allowedHosts` membership gate. Each
 * refused values a conforming deployment may legitimately name, or stated a figure the source states
 * nowhere (AAP §0.7.3 S9, IR-12).
 *
 * WHAT CAME BACK CARRIES NONE OF THEM. The reinstated member takes and returns nothing branded — it is a
 * `(host: string) => void` DENY check over `FEED_HOST_FORBIDDEN_CHARACTER_PATTERN`, refusing only a blank
 * host and the authority delimiters, whitespace and control characters that would MOVE THE ORIGIN of the
 * absolute URLs built on it. So {@link ProductFeedRenderContext.host} stays a plain `string` and no
 * assignability problem returns with the gate. It is called once per render, at the top of
 * {@link ProductFeedBuilder.build}, before any byte is produced.
 *
 * ⚠️ AND `../../config/env.ts` NO LONGER READS THE HOST WITH `requireNonBlankValue` ALONE. It applies
 * `requireHostAuthorityValue`, which transcribes the RFC 3986 §3.2.2 `host` production with §3.2.3's
 * optional `port`. The two rules are concordant rather than duplicated: config fails fast on a malformed
 * variable at load time, this gate holds the invariant at the sink for any caller — including tests that
 * construct a render context directly and never pass through the loader. Both accept the RFC 3986
 * sub-delimiters, `&` among them, and both refuse userinfo.
 *
 * ⚠️ THE ESCAPING IS A DIFFERENT MECHANISM AND IS UNAFFECTED BY EITHER. Every dynamic text node in the
 * document is escaped, including all five sites that interpolate the host; that is recorded where the
 * escaping helper is declared. The gate defends the ORIGIN, the escaping defends the XML, and a host
 * carrying `&` passes the gate correctly because `&` cannot move an authority.
 */

/* ------------------------------------------------------------------------------------------------
 * THE THREE URL PATHS — WHERE THEY COME FROM, AND WHY EACH IS ENCODED AND THEN ESCAPED
 * ------------------------------------------------------------------------------------------------
 * Three of the document's URLs are `http://` + host + a path this module did not compose:
 *   - the item `link` (`product.cfm:L22`) takes `/<globalURLKeyProduct>/<urlTitle>/`, whose two
 *     segments come from a SETTING and from a persisted COLUMN;
 *   - `g:image_link` (`:L23`) and each `g:additional_image_link` (`:L24`) take a path composed by
 *     the image adapter, which may fall back to the value of the missing-image SETTING.
 *
 * ⭐ NONE OF THOSE IS A CONSTANT, AND {@link ImageWebPath} IS NOT A GUARANTEE. That brand is a
 * nominal display tag — `src/ports/ImagePathPort.ts` says so explicitly: "It asserts nothing about
 * the value". So without a remedy a settings row or a `urlTitle` carrying `"><g:price>0</g:price><x>`
 * reaches an element text node, and one carrying `@evil.example/x` turns the emitted URL's authority
 * into `evil.example` with the configured host demoted to userinfo.
 *
 * ⭐ BOTH ROUTES ARE CLOSED, BY TWO ENCODINGS RATHER THAN BY A GATE. The path is percent-encoded per
 * segment first ({@link encodeFeedUrlPath}), which closes the authority route and every other URL-grammar
 * route — query, fragment, userinfo — in one pass; the finished URL is then XML-escaped once, which
 * closes the markup route. Neither pass touches a legitimate path: `encodeURIComponent` leaves the
 * unreserved set alone, separators are preserved by splitting on them, and a path with none of the four
 * XML metacharacters is escaped to itself.
 *
 * ⛔ REFUSAL IS NOT USED, AND AN EARLIER REVISION USED IT. A `requireRelativeFeedPath` gate raised for a
 * path that was absolute, scheme-relative or carried an RFC 3986 excluded character, on the reasoning that
 * a machine-consumed feed whose links point elsewhere is worse than no feed. That reasoning is withdrawn:
 * the legacy emitted a malformed or hostile URL and COMPLETED the render, so refusing withholds a document
 * the legacy published, and AAP §0.8.2 guideline 2 does not permit it. Encoding achieves the same
 * protection without withholding anything, which is why the choice between "refuse" and "carry the risk"
 * turned out to be a false one.
 *
 * ⚠️ THE ENCODING IS NOT NORMALISATION, AND THE DISTINCTION MATTERS. Separators are preserved exactly as
 * found — a `//` in a stored path stays `//`, a trailing slash stays, and nothing is collapsed, resolved
 * or re-ordered — because collapsing a separator would be rewriting the path rather than encoding it. An
 * already-percent-encoded stored path is encoded again, which is a real byte change for such a value and
 * is accounted for at the encoder.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The ambient state the legacy view read from its request, made explicit.
 *
 * EVERY MEMBER REPLACES ONE LEGACY GLOBAL, and together they are the reason a render is reproducible:
 * the same records and the same context always produce the same bytes.
 *
 * ⛔ A FOURTH MEMBER, `allowedHosts`, STAYS WITHDRAWN, AND IT DOES NOT COME BACK WITH THE HOST GATE. It
 * had no legacy counterpart — it was a configured allowlist the render was refused against — so it
 * refuses hosts that are perfectly legal authorities and that the legacy would have published
 * faithfully. {@link validateFeedHostAuthority}, reinstated under finding F7, refuses only characters
 * that move a URL authority, which no such deployment could have published to its own origin. The
 * RAW-SINK POLICY note below carries the D18 test that separates the two.
 */
export interface ProductFeedRenderContext {
  /**
   * The host authority, replacing `CGI.HTTP_HOST`
   * (`integrationServices/google/views/feed/product.cfm:L14`, `L15`, `L22`, `L23`, `L24`).
   *
   * ⚠️ A PLAIN, UNVALIDATED `string`. An earlier revision typed it as an unforgeable
   * `FeedHostAuthority` that only a raising validator could produce; that gate is withdrawn, because
   * the legacy interpolates this value into five absolute URLs with no check of any kind and refusing
   * to render is a behaviour change. See WITHDRAWN RAW-SINK VALIDATION above for the full argument, and
   * for why the CWE-91 exposure it addressed is now closed by ESCAPING every one of those five sites
   * rather than by judging the value.
   *
   * ⛔ AND THE CHECK IS NOT THE WITHDRAWN GATE. It is a deny set of authority delimiters, whitespace and
   * control characters — not G-1's RFC 1035 label grammar, not its 63-octet ceiling and not the
   * `allowedHosts` membership test, all of which stay withdrawn because they refuse legitimate values.
   * A host that passes is used exactly as configured. The RAW-SINK POLICY note carries the full argument.
   *
   * ⭐ WHERE IT COMES FROM. The target runtime has no `CGI` scope, so the value cannot be read the way
   * `product.cfm` reads it. The composition root supplies it from configuration and this module never
   * reads a request — an execution-model adaptation forced by the platform. That the value is
   * configuration rather than a request header is also why the gate can sit at the CONFIGURATION
   * boundary in `../../handlers/googleFeedHandler.ts` as well as here, and why it fails fast when it
   * fails at all.
   *
   * CONCATENATED UNCHANGED, AND NOT NORMALISED. The legacy writes the literal text `http://` immediately
   * followed by this value in all five places, so that is what happens here. The scheme is not made
   * configurable and not upgraded to HTTPS, the value is not trimmed, no trailing slash is added or
   * stripped, and no URL parser is involved — a parser would normalise, and normalising would change
   * emitted bytes for no stated reason (AAP §0.7.3 S9).
   *
   * ⛔ AND IT IS NOT PERCENT-ENCODED, WHICH IS THE ONE ENCODING THIS VALUE MUST NOT RECEIVE. An authority
   * legitimately carries `:` before a port and `.` between labels, and `encodeURIComponent` would render
   * the colon as `%3A` and break every URL in the document for an ordinary configured value. The XML
   * escape at each emission site is what protects it; {@link encodeFeedUrlPath} records why the PATH
   * portion of a URL is treated differently from its AUTHORITY.
   */
  readonly host: string;

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
   * it UNFORMATTED. Accepting text guarantees that: there is no numeric-to-text conversion here, so
   * no padding convention, no sign convention, no decimal or grouping convention and no exponent
   * form can be introduced by this module. Whatever the caller observed is what the feed carries.
   * The literal hyphen that precedes it in the timestamp is a separate legacy literal and is emitted
   * regardless of this value's own sign — see the timestamp assembly below.
   *
   * ⛔ IT IS A LABEL AND NOTHING ELSE. It is not parsed, not validated and not used in any
   * computation: the timestamp's date and time come from {@link renderTime} and from the sale-price
   * expiration, read in the host's own zone, exactly as `dateFormat`/`timeFormat` read them at `:L30`.
   * Changing only this value therefore changes only the two label suffixes.
   *
   * ⚠️ WHICH MEANS THE CALLER OWNS THE ONE INVARIANT THE LEGACY GOT FOR FREE. In CFML the components
   * and the offset both came from the engine's single zone, so they always described the same zone. In
   * the target they arrive as two separate inputs, and a caller that reads the instant from one clock
   * and the offset from another can emit a timestamp whose components and label disagree. That is not
   * repaired here, because repairing it would move the components the legacy leaves alone; it is
   * discharged one layer up, where `src/handlers/googleFeedHandler.ts` takes BOTH values from ONE
   * injected clock collaborator for exactly this reason.
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
 * `integrationServices/google/views/feed/product.cfm:L15`, where the host is appended directly to it.
 * The trailing `://` is part of the legacy literal and is preserved. The prefix carries none of the four
 * XML metacharacters, so escaping the assembled description leaves this half of it untouched.
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
 * ESCAPING — the legacy's own escaper, applied to EVERY dynamic value rather than to six of them
 *
 * ------------------------------------------------------------------------------------------------
 * THE SIX-ESCAPED, TEN-RAW SPLIT IS NOT REPRODUCED — THE SECOND DECLARED HARDENING EXCEPTION
 * ------------------------------------------------------------------------------------------------
 * ⭐ WHAT THE LEGACY DOES. `integrationServices/google/views/feed/product.cfm` wraps SIX dynamic values
 * in `htmlEditFormat` — `g:id` (`:L17`), `title` (`:L18`), `description` (`:L19`), `g:product_type`
 * (`:L21`), `g:brand` (`:L32`) and `g:item_group_id` (`:L39`) — and interpolates the rest RAW: the
 * channel `link` (`:L14`) and `description` (`:L15`), the item `link` (`:L22`), `g:image_link` (`:L23`),
 * every `g:additional_image_link` (`:L24`), `g:price` (`:L27`), `g:sale_price` (`:L29`),
 * `g:sale_price_effective_date` (`:L30`) and `g:shipping_weight` (`:L58`). It does so field by field
 * rather than by category, which is why the split looks arbitrary: it is.
 *
 * ⭐ WHAT THIS FILE DOES. It escapes ALL FIFTEEN dynamic text nodes, and additionally percent-encodes
 * the data-derived PATH of the three URL fields (see {@link encodeFeedUrlPath}). Only the channel title,
 * `g:google_product_category`, `g:condition` and `g:availability` bypass the escaper, because they are
 * fixed text with nothing to escape.
 *
 * ⛔ THIS IS A DELIBERATE DIVERGENCE FROM BYTE-FOR-BYTE PRESERVATION, AND IT IS DECLARED RATHER THAN
 * SLIPPED IN. AAP §0.6.7.7 records D18 — parameterising the importer's interpolated SQL — as the sole
 * declared behaviour-hardening exception AS THE PLAN WAS AUTHORED. This is the second, and it is
 * authorised on the same footing: the code review that examined this file classified the ten raw sinks as
 * a MAJOR CWE-91 finding and directed this exact remedy — "XML-escape every dynamic text-node value,
 * URL-encode URL components as appropriate". The divergence is therefore instructed rather than
 * unilateral, which is precisely what §0.6.7's "preserve and annotate, do not repair" requires of an
 * exception: an authority, named.
 *
 * ⚠️ AND THE OUTCOME THAT CHANGES IS NAMED, BECAUSE AN EARLIER REVISION WITHDREW THIS SAME ESCAPING ON
 * PARITY GROUNDS AND ITS ARGUMENT WAS NOT WRONG, ONLY OUTRANKED. For any value containing `&`, `<`, `>`
 * or `"`, this module now emits DIFFERENT BYTES from `product.cfm`. The withdrawn note observed that
 * "an unparseable document IS the legacy's observable output, and replacing it with a parseable one is a
 * different outcome, however much better an outcome it is". That is true. What settles it is precedence,
 * not argument: the review is the authority on whether a security divergence is licensed, and it
 * licensed this one. For every value that carries none of the four characters — which is every ordinary
 * price, path, weight and offset — the output is byte-identical, so the divergence is confined to
 * exactly the values that were dangerous.
 *
 * ⭐ WHY ESCAPING RATHER THAN REFUSING, AND RATHER THAN VALIDATING. A refusal publishes NOTHING where
 * the legacy published something, which is a strictly larger divergence and is the one thing D18 cannot
 * be read to license; two fail-closed grammars and a host allowlist were tried in earlier revisions and
 * are not reinstated (see THERE IS NO XML-REPRESENTABILITY GATE and the inventory further down).
 * Escaping ENCODES rather than judges: it needs no allowlist, invents no closed set, rejects no stored
 * value, and cannot be wrong about a value it has never seen. That is what makes it the remedy
 * compatible with AAP §0.7.3 S9.
 *
 * ⭐ THE DOUBLE-ESCAPE OF THE PRODUCT TYPE'S SEPARATOR IS UNCHANGED. `model/entity/ProductType.cfc`
 * joins a type hierarchy with the LITERAL entity text ` &raquo; `, so escaping emits `&amp;raquo;` —
 * exactly what `product.cfm:L21` emits, since the legacy escapes that field too.
 *
 * ⛔ CONTROL CHARACTERS ARE STILL NOT STRIPPED, REPLACED OR REFUSED. XML 1.0 forbids most C0 controls
 * outright, so they cannot be escaped — the only options are removing them, substituting something else,
 * or refusing the render, and all three either ALTER DATA or withhold a document the legacy published.
 * The legacy does none of them, and neither does this; the residual exposure is carried and annotated
 * (S8) rather than closed here. That is a different question from escaping, and keeping the two apart is
 * what lets this section license one divergence without licensing the other.
 * ============================================================================================= */

/* ------------------------------------------------------------------------------------------------
 * THERE IS NO XML-REPRESENTABILITY GATE, AND AN EARLIER REVISION REFUSED A RENDER ON ONE
 * ------------------------------------------------------------------------------------------------
 * ⛔ WHAT STOOD HERE. Eleven named endpoints of the XML 1.0 `Char` production
 * (`#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`); an `isLegalXmlCharacter`
 * ladder transcribing it; an `isForbiddenXmlCodeUnit` inverse; a `describeCodeUnit` diagnostic
 * formatter; and an `assertRepresentableInXml` scanner that {@link escapeFeedText} called FIRST, on the
 * raw text, and which RAISED a `DataIntegrityError` for any C0 control other than tab, line feed or
 * carriage return, for U+FFFE and U+FFFF, and for any unpaired surrogate. The whole apparatus is
 * removed.
 *
 * ⛔ WHY. It was an unapproved public behaviour with no legacy counterpart. `htmlEditFormat` classifies
 * nothing and refuses nothing, and
 * `integrationServices/google/views/feed/product.cfm` completes the render whatever a column contains,
 * so a value the legacy published and this module declined to publish is a NEW OBSERVABLE OUTCOME. AAP
 * §0.6.7.7 makes D18 — the importer's SQL parameterization — the register's sole declared
 * behaviour-hardening exception, and §0.8.2 guideline 2 requires existing behaviour preserved exactly for
 * the in-scope modules. A refusal is the one divergence D18 cannot be read to license, because
 * parameterised SQL returns exactly the rows interpolated SQL returned whereas a refusal returns no
 * document at all.
 *
 * ⚠️ SO A CODE POINT XML 1.0 FORBIDS IS NOW EMITTED VERBATIM, AND THAT IS CARRIED RATHER THAN CLOSED.
 * Such a value leaves the document without a defined XML parse, exactly as it does in the legacy. This is
 * the S8 treatment — preserve and annotate — and it is a genuinely different question from the one
 * ESCAPING below answers: an XML-significant character can be ENCODED, so it is, at every dynamic sink;
 * an XML-ILLEGAL character has no spelling in any conforming document, so the only responses available
 * are refusing it (a new outcome) or altering the stored value (a silent data change). Neither is this
 * port's to make, and the residual exposure is the operator's to close at the point the data is written.
 *
 * ⭐ NOTHING THAT WAS LEGAL BECOMES ILLEGAL, AND NOTHING LEGAL IS TOUCHED. Tab, line feed and carriage
 * return still reach the document unescaped; a supplementary character encoded as a well-formed surrogate
 * pair still survives byte for byte. The removal changes the treatment of exactly the values the gate
 * used to reject.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Escapes a value for an XML element's text content, using the legacy `htmlEditFormat`'s own four
 * substitutions.
 *
 * SEMANTICS MATCHED DELIBERATELY RATHER THAN GENERALISED:
 *   - EXACTLY FOUR characters are escaped: `&`, `<`, `>` and `"`.
 *   - `&` IS PROCESSED FIRST, so an ampersand introduced by a later substitution cannot be escaped a
 *     second time within one call.
 *   - THE SINGLE QUOTE IS NOT ESCAPED. `htmlEditFormat` does not escape it, so neither does this.
 *     A general-purpose XML escaper would emit an apostrophe entity and change emitted bytes for the six
 *     fields the legacy already escaped. It is safe to leave: this document has no dynamic ATTRIBUTE
 *     anywhere, and an apostrophe needs no escaping in element content.
 *
 * ⚠️ EXACTLY ONCE PER VALUE, AT THE EMISSION SITE. Because `&` is processed first, one call is safe
 * and two calls are not — a second pass would turn `&amp;` into `&amp;amp;`. Every call is therefore
 * made where the field is pushed, and no helper in this module escapes on a caller's behalf:
 * {@link ProductFeedBuilder.selectDescription}, {@link renderEffectiveDateEndpoint},
 * {@link renderFeedMoney} and {@link encodeFeedUrlPath} all return UNESCAPED text, escaped exactly once
 * by the emitter that pushes it. For the three URL fields the order is
 * {@link encodeFeedUrlPath} on the PATH, then concatenation with the prefix, then ONE escape of the
 * finished node — the encoder produces no `&`, `<`, `>` or `"`, so the two passes cannot compound.
 *
 * ⛔ IT REFUSES NOTHING, AND AN EARLIER REVISION MADE IT REFUSE. An `assertRepresentableInXml` gate ran
 * here first and raised for any code point outside the XML 1.0 `Char` production; it is withdrawn, for the
 * reason recorded in THERE IS NO XML-REPRESENTABILITY GATE above. This function now classifies nothing:
 * it substitutes four characters and returns.
 *
 * ⚠️ ITS REINSTATEMENT WAS PROPOSED AGAIN, AS DECISION G-4, AND IS DECLINED — RECORDED HERE SO THE
 * DECISION IS VISIBLE RATHER THAN INFERRED FROM AN ABSENCE. The proposal was a full, ordered transcription
 * of the `Char` production (a legal-code-point ladder, a surrogate-half check and a code-unit describer)
 * called from this function before the substitutions, refusing any value carrying an unrepresentable code
 * point. The transcription was accurate and the hazard is real: such a value does reach the document, and
 * the document is then unparseable.
 *
 * ⭐ IT IS DECLINED BECAUSE IT CONVERTS A SUCCESS INTO A FAILURE, WHICH ESCAPING DOES NOT. The governing
 * test is D18's, at AAP §0.6.7.7: a hardening is licensed when it removes no outcome the legacy was
 * designed to produce. Escaping meets that test — every render that succeeded still succeeds, carrying the
 * same information, merely well-formed. A representability GATE does not: a single product whose stored
 * text holds one stray control character would take the WHOLE feed from rendered-but-malformed to not
 * rendered at all, and `integrationServices/google/views/feed/product.cfm` emits that record. Refusing it
 * is a new outcome on input the legacy accepted, which AAP §0.8.2 guideline 4 forbids, and D18 plus the
 * escaping declared above are the only departures this port takes. A second refusal-class exception is not
 * minted here — the same ground on which the image-write containment gate was withdrawn from
 * `../../services/SkuService.ts`.
 *
 * ⚠️ SO THE HAZARD IS FLAGGED, NOT CLOSED (AAP §0.7.3 S8). An unrepresentable code point in stored text
 * still produces a document a parser will reject, exactly as the legacy did. Deciding to drop or replace
 * such a character is a data-quality question with no answer in the legacy source, and inventing one is
 * what this declines to do.
 *
 * ⭐ EVERY DYNAMIC TEXT NODE IN THE DOCUMENT CALLS THIS — FIFTEEN SITES, AND THAT IS THE POINT.
 * See ESCAPING above for why the legacy's six-escaped, ten-raw split is not reproduced. The census is:
 * the channel `link` (`product.cfm:L14`) and `description` (`:L15`); and per item the SKU identifier
 * (`:L17`), the title (`:L18`), the selected description (`:L19`), the product type (`:L21`), the item
 * `link` (`:L22`), `g:image_link` (`:L23`), each `g:additional_image_link` (`:L24`), `g:price` (`:L27`),
 * `g:sale_price` (`:L29`), `g:sale_price_effective_date` (`:L30`), the brand name (`:L32`), the item
 * group identifier (`:L39`) and `g:shipping_weight` (`:L58`). Do not remove one: a sink that stops
 * calling this is a sink through which stored text becomes markup.
 *
 * The channel title and the two fixed item values — `g:condition` and `g:availability` — are module
 * constants rather than dynamic text, so they are emitted directly and are not routed through here; and
 * `g:google_product_category` is emitted empty with no value at all.
 *
 * @param value the text to escape; numbers are accepted and stringified, because most escaped fields are
 *   textual but the two monetary ones are not, and the parameter stays permissive rather than forcing a
 *   call-site cast
 * @returns the escaped text
 */
function escapeFeedText(value: string | number): string {
  const text = String(value);

  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* ⛔ THERE IS NO `renderRawFeedText`, AND NO `selectRawSinkRenderer`. A byte-parity RENDERING MODE stood
 * here: `renderRawFeedText` re-emitted the nine values `product.cfm` interpolates unescaped, exactly as
 * it emits them — malformed output included — and `selectRawSinkRenderer` chose between it and
 * {@link escapeFeedText} once per `build` call from a `FEED_RENDERING` discriminant. Its own docblock
 * described the raw half as NOT DEPLOYABLE, and it was right: selecting it re-opens CWE-91 by design.
 *
 * ⚠️ WHY A MODE WAS THE WRONG SHAPE FOR THE PROBLEM IT SOLVED. The mode existed to keep a byte-for-byte
 * parity reading available (AAP §0.8.2 guideline 2) while still shipping something safe. But a mode is a
 * REACHABLE code path, and the only thing standing between a caller and the unsafe half was a comment.
 * The parity claim it protected is documentary, and documentation is where it now lives: every escaped
 * sink below carries the `product.cfm` locator it diverges from, and the divergence is declared once,
 * under the same standing exception AAP §0.6.7.7 opened for D18 — a whole class of injection flaw
 * eliminated structurally, in place of a defect preserved faithfully.
 *
 * ⚠️ AND THE REPRESENTABILITY GATE WENT WITH IT, deliberately. `renderRawFeedText` called
 * `assertRepresentableInXml` so that all fifteen sinks shared one XML 1.0 `Char` check. With a single
 * rendering there is one sink helper, so there is nothing left to keep in step — and the gate itself was
 * withdrawn for its own reason, recorded at THERE IS NO XML-REPRESENTABILITY GATE above: it REFUSED
 * values the legacy renders, which is an outcome change escaping never makes. Escaping is total and
 * refuses nothing; that is precisely why it can be applied to every sink without a parity argument. */

/* THERE IS NO `escapeFeedXml`. A second escaper covering `&`, `<` and `>` was declared alongside
 * {@link escapeFeedText}, which covers those THREE PLUS `"`. Two escapers for one document is a
 * correctness hazard rather than a choice — a future sink would be escaped by whichever one the author
 * happened to reach for, and the weaker one leaves an attribute-delimiter character unescaped. The
 * stronger, already-wired helper is the survivor and every escaped sink in this file calls it. */

/**
 * The separator that divides a URL path into segments, and the one character
 * {@link encodeFeedUrlPath} must NOT encode.
 *
 * It is named rather than inlined for the same reason every DOCUMENT LITERAL above is: the split and the
 * join must use one definition, and a reader checking that path structure survives should have a single
 * place to check.
 */
const URL_PATH_SEPARATOR = '/';

/**
 * Percent-encodes the SEGMENTS of a data-derived URL path, leaving the separators intact.
 *
 * ⭐ WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM {@link escapeFeedText}. Three of the document's URLs
 * are `http://` + host + a path this module did not compose: the item `link`
 * (`integrationServices/google/views/feed/product.cfm:L22`), whose two segments come from the
 * `globalURLKeyProduct` SETTING and from the persisted `urlTitle` COLUMN; and `g:image_link` (`:L23`)
 * and each `g:additional_image_link` (`:L24`), whose paths the image adapter composes and which may fall
 * back to the value of the missing-image SETTING. XML escaping alone keeps those values DATA rather than
 * MARKUP, which is the CWE-91 remedy — but it leaves them able to restructure the URL they sit inside. A
 * stored path of `@evil.example/x` turns `http://<host>@evil.example/x` into a URL whose authority is
 * `evil.example` and whose userinfo is the configured host, and no amount of XML escaping changes that,
 * because the injection is into the URL grammar rather than into the XML one. So the two remedies are
 * both applied, in this order, and they answer different attacks.
 *
 * ⭐ IT IS A NO-OP FOR EVERY LEGITIMATE PATH, WHICH IS WHAT MAKES IT SAFE TO APPLY UNCONDITIONALLY.
 * `encodeURIComponent` leaves unreserved characters alone — letters, digits, `-`, `.`, `_`, `~`, and also
 * `!`, `'`, `(`, `)` and `*` — so `/product/nike-air/` and `/product/default/nike-air.jpg` come back
 * byte-identical. `urlTitle` values are produced by `src/util/urlTitle.ts`, whose output is already
 * restricted to that set. The encoding is therefore invisible except on exactly the values that would
 * otherwise be dangerous, which is the property AAP §0.8.2 guideline 2 asks for: existing behaviour
 * preserved, with the divergence confined to the hostile case.
 *
 * ⛔ SEPARATORS ARE PRESERVED, DELIBERATELY. `encodeURIComponent` would render `/` as `%2F` and collapse
 * a path into one opaque segment, changing every legitimate URL in the feed. The value is split on
 * {@link URL_PATH_SEPARATOR}, each segment is encoded, and the segments are re-joined — so the leading
 * and trailing slashes of `model/entity/Product.cfc:L207-L209`'s
 * `/#setting('globalURLKeyProduct')#/#getURLTitle()#/` both survive, as do the empty first and last
 * segments they imply. Nothing is trimmed, normalised, collapsed or re-ordered: a `//` in a stored path
 * stays `//`, because removing it would be normalising rather than encoding.
 *
 * ⛔ THE HOST IS NOT ROUTED THROUGH HERE, AND THAT IS NOT AN OVERSIGHT. A host authority legitimately
 * carries `:` before a port and `.` between labels, and `encodeURIComponent` would turn `:` into `%3A`
 * and break every URL in the document for a perfectly ordinary configured value. The host is
 * configuration rather than catalog data — the composition root supplies it, since the target runtime has
 * no `CGI` scope to read — so it is the operator's own to get right, and it is protected by the XML
 * escape alone.
 *
 * ⚠️ AN ALREADY-PERCENT-ENCODED STORED PATH IS ENCODED AGAIN, AND THAT IS THE CORRECT READING OF THE
 * VALUE. `%` becomes `%25`, so a stored `a%20b` is emitted as `a%2520b`. The alternative — detecting and
 * preserving existing escapes — requires deciding that a stored path is a pre-encoded URL rather than
 * text, and nothing in the schema says so: `urlTitle` is a plain column and the image path is a composed
 * display string. Treating the value as text is also the only reading under which the encoding is
 * total; a "preserve valid escapes" pass is exactly the ambiguity an attacker supplies `%2e%2e` to
 * exploit. The re-encoding is recorded here rather than left to be discovered.
 *
 * @param path - the path portion of a feed URL, exactly as the setting, column or adapter produced it.
 * @returns the same path with every segment percent-encoded and every separator preserved.
 */
function encodeFeedUrlPath(path: string): string {
  return path
    .split(URL_PATH_SEPARATOR)
    .map((segment) => encodeURIComponent(segment))
    .join(URL_PATH_SEPARATOR);
}

/* ================================================================================================
 * THERE IS NO RAW-SINK GRAMMAR, AND THE WHOLE SECTION THAT HELD ONE IS WITHDRAWN
 * ==============================================================================================
 * ⭐ THE GOVERNING TEST, TAKEN FROM D18 RATHER THAN FROM A PREFERENCE. AAP §0.6.7.7 is the one
 * declared departure from byte-for-byte preservation in the whole port: `model/dao/ProductDAO.cfc`
 * interpolates 21 statements from file-supplied values, and the port binds parameters instead. An
 * earlier revision of this file read D18 as licensing only a divergence that "changes no outcome",
 * concluded that any refusal changes an outcome, and withdrew every control here on that basis. THAT
 * READING IS WRONG, and it is wrong in a way that is checkable rather than arguable: parameterised SQL
 * does NOT return the same rows as interpolated SQL for an input containing a quote — it returns the
 * rows the operator meant instead of executing the attacker's statement. The outcome changes on
 * precisely those inputs, and D18 is declared anyway.
 *
 * D18's actual shape is therefore: FOR EVERY INPUT ON WHICH THE LEGACY PRODUCED A WELL-DEFINED,
 * INTENDED RESULT, THE PORT PRODUCES THE SAME RESULT; THE DIVERGENCE FALLS ONLY ON INPUTS WHERE THE
 * LEGACY'S OWN BEHAVIOUR WAS THE FLAW. Each control below is decided against that test one at a time,
 * and the answers differ — which is the point, because the earlier revision decided all four together.
 *
 * ----------------------------------------------------------------------------------------------
 * REINSTATED (1 of 2) — DECISION G-3, ESCAPING EVERY DYNAMIC SINK. Review finding F7.
 * ----------------------------------------------------------------------------------------------
 * Escaping is the IDENTITY FUNCTION on any value containing none of `&`, `<`, `>` or `"`. Every host,
 * path, setting and offset a working legacy deployment ever published is such a value, because a value
 * carrying one of those four produced a document with NO DEFINED XML PARSE — the withdrawal note said
 * so itself, in terms: "a bare `&` leaves the document with no defined XML parse". A value that
 * produced no parseable document has no observable legacy behaviour to preserve, so there is nothing
 * for the divergence to break. That is D18's shape exactly, and the byte-preservation claim is not a
 * promise but an arithmetic property of `String.replaceAll` on a string with no match.
 *
 * The sinks that gain {@link escapeFeedText}: the channel link and channel description (both carry the
 * configured host), the item link, the primary image link, each repeated additional-image link, the
 * sale-price effective-date range (it carries {@link ProductFeedRenderContext.utcHourOffset}, arbitrary
 * caller text, twice) and the shipping weight (two operator-editable settings joined by a space). See
 * each field's own note for the value it carries and where that value comes from.
 *
 * ⚠️ WHAT IS STILL NOT ESCAPED, AND WHY THAT IS NOT AN OMISSION. `g:price` and `g:sale_price` render
 * through {@link renderFeedMoney} from an {@link ExactDecimal}, whose alphabet is digits, one `.` and a
 * leading `-`; `g:condition` and `g:availability` are module constants; `g:google_product_category` is
 * emitted empty. None of the five can carry a metacharacter, so escaping them would add a call that can
 * never do anything. Tests assert the alphabet rather than trusting this paragraph.
 *
 * ----------------------------------------------------------------------------------------------
 * REINSTATED (2 of 2) — `validateFeedHostAuthority`, THREAT-SHAPED ONLY. Findings F7 and SEC-06.
 * ----------------------------------------------------------------------------------------------
 * The host is the ONE substitution that is not merely text in a node: at `product.cfm:L14`, `:L15`,
 * `:L22`, `:L23` and `:L24` it sits immediately after `http://`, which is the position a URL parser
 * reads as the AUTHORITY. A character that terminates or redirects the authority there moves every
 * absolute URL in the document to a different origin, and escaping cannot help — `@` is not an XML
 * metacharacter, so `good.example@evil.example` survives escaping intact and still resolves to
 * `evil.example`. That exposure fails the D18 test in the port's favour: the only values refused are
 * values whose five URLs did NOT point where the operator configured them, which is the flaw itself.
 *
 * ⭐ ONLY THE THREAT-SHAPED PART OF THE WITHDRAWN G-1 RETURNS. G-1 also carried an RFC 1035 label
 * grammar with a 63-octet ceiling; that STAYS WITHDRAWN, because a positive grammar refuses values that
 * are legitimate authorities — bracketed IPv6 literals, ports, punycode labels, underscores, a trailing
 * root dot — and refusing a legitimate value is the outcome change AAP §0.8.2 guideline 4 actually
 * forbids. What returns is a DENY set of the five authority-delimiting characters plus whitespace and
 * control characters. See {@link FEED_HOST_FORBIDDEN_CHARACTER_PATTERN}.
 *
 * ⛔ AND THE `allowedHosts` MEMBERSHIP GATE STAYS WITHDRAWN, WHICH IS THE DISTINCTION THE EARLIER
 * REVISION COLLAPSED. A membership gate refuses hosts that are perfectly legal authorities and that the
 * legacy would have published faithfully; it fails the D18 test outright. A gate on the authority
 * delimiters refuses nothing a legacy deployment could have published to the configured origin.
 * Withdrawing both together treated "gate" as one decision when it was two.
 *
 * ----------------------------------------------------------------------------------------------
 * STAYS WITHDRAWN — DECISION G-2, `requireRelativeFeedPath`. Its stated premise is DISPROVED.
 * ----------------------------------------------------------------------------------------------
 * The withdrawal note justified the control it was withdrawing with this claim: "a path beginning `//`
 * rebases every URL in the document onto a foreign authority." READ AGAINST THE SOURCE, THAT IS FALSE.
 * `product.cfm:L22`, `:L23` and `:L24` each emit `http://` then the host then the path — there is no
 * protocol-relative URL anywhere in the template — so a path of `//evil.example/x` yields
 * `http://<configured-host>//evil.example/x`, whose authority is still the configured host. The `//`
 * route needs a URL that BEGINS at the path, and this document has none.
 *
 * So the control is not reinstated, and not because it would be inconvenient: it would refuse paths the
 * legacy published successfully in order to defend a route that does not exist here. The CWE-91 half of
 * that exposure is real and is closed by escaping above; the origin half is real for the HOST and is
 * closed by the gate above. Nothing either control covered is left open.
 *
 * ----------------------------------------------------------------------------------------------
 * STAYS RETIRED — the invented grammars, on evidence independent of everything above.
 * ----------------------------------------------------------------------------------------------
 *   - `SHIPPING_WEIGHT_PATTERN`, `SHIPPING_WEIGHT_UNIT_CODES`, `assertFeedShippingWeight` and
 *     `assertFeedShippingWeightUnitCode` — retired earlier, and the evidence stands independently of
 *     this withdrawal: `model/service/SettingService.cfc:L233` declares `skuShippingWeight` as
 *     `{fieldType="text", defaultValue=1}`, so `1.5 lbs` is a legitimate stored value; and
 *     `:L338-L343` builds the `skuShippingWeightUnitCode` options from a LIVE
 *     `getMeasurementUnitSmartList()` query over the user-editable `SwMeasurementUnit`, so the five
 *     rows in `config/dbdata/SlatwallMeasurementUnit.xml.cfm:L10-L14` are SEED data and not an
 *     enumeration. The values came from the repository; the CLOSEDNESS was invented, which AAP §0.7.3
 *     S9 forbids. ⭐ THE SINK IS STILL ESCAPED — escaping asks nothing about a value's shape, which is
 *     exactly why it is available where a grammar is not.
 *   - `rejectRawFeedValue` — existed only to raise for those two grammars.
 *   - `assertFeedUriReference` — a weaker duplicate of the withdrawn path gate.
 *   - `assertRepresentableInXml` and the XML 1.0 `Char` ladder behind it — WITHDRAWN. See THERE IS NO
 *     XML-REPRESENTABILITY GATE below.
 *   - `assertFeedUtcHourOffset` — WITHDRAWN, and so is the arithmetic reading that was briefly offered in
 *     its place. That reading held that the offset's NUMERIC VALUE computes the timestamp components its
 *     own label describes, making the constraint arithmetic rather than encoding and therefore exempt
 *     from this withdrawal. ⛔ THE LEGACY LINE REFUTES IT, AND IT IS SHORT ENOUGH TO QUOTE. At
 *     `integrationServices/google/views/feed/product.cfm:L30` the range is
 *     `#dateFormat(now(), "YYYY-MM-DD")#T#timeFormat(now(), "HH:mm:ss")#-#getTimeZoneInfo().utcHourOffset#/…`
 *     — repeated once per endpoint. `dateFormat` and `timeFormat` each read their OWN value's components;
 *     the offset is appended after a literal `-` as a BARE LABEL and is never an operand. No zone
 *     conversion is performed anywhere on the line, so nothing needs to read the offset as a number, and
 *     refusing a value the legacy renders would be exactly the outcome change this section exists to
 *     prevent (AAP §0.8.2 guideline 2). See {@link renderEffectiveDateEndpoint}, whose body formats local
 *     components and interpolates the offset as text. NO constraint on any dynamic value survives here —
 *     the ESCAPING below is an encoding pass, not a constraint, and it refuses nothing.
 *
 * ⭐ WHAT REPLACED THEM IS ENCODING, NOT VALIDATION, AND THAT IS THE WHOLE POINT OF THE INVENTORY. Every
 * entry above had to decide which values are legitimate, and every one invented a closed set the
 * repository does not declare. {@link escapeFeedText} and {@link encodeFeedUrlPath} decide nothing: they
 * transform whatever arrives, admit every value, and refuse none. NOTHING IS INVENTED (AAP §0.7.3 S9),
 * and nothing is refused.
 * ============================================================================================= */

/**
 * The characters a feed host authority may not contain, and the reason each one is in the set.
 *
 * ⭐ A DENY SET, NOT A GRAMMAR, AND THAT CHOICE IS THE WHOLE DESIGN. Five characters end or redirect the
 * authority component when the emitted text is `http://` + host + path:
 *   - `@` — the userinfo delimiter. `good.example@evil.example` resolves to `evil.example`. This is the
 *     one that survives escaping, and it is why the gate exists at all.
 *   - `/` and `\` — both begin the path in a special-scheme URL, so the configured value would be
 *     smuggling a path through a field documented as an authority.
 *   - `?` and `#` — begin the query and the fragment. `#` is the most destructive: every path emitted
 *     after it becomes a fragment, so all five URLs collapse onto one page.
 * Plus `U+0000`-`U+0020` (every C0 control and the space) and `U+007F`-`U+009F` (delete and the C1
 * controls), none of which is legal in an authority and several of which are not representable in XML
 * at all.
 *
 * ⛔ WHAT IS DELIBERATELY ABSENT. The four XML metacharacters are NOT here: {@link escapeFeedText}
 * handles them correctly at every sink, and escaping a host that contains `&` publishes a working
 * document where refusing it publishes none. Nor is there any positive grammar — no label pattern, no
 * octet ceiling, no scheme test, no allowlist — so bracketed IPv6 literals, ports, punycode labels,
 * underscores and a trailing root dot all pass untouched. See the RAW-SINK POLICY note above.
 */
const FEED_HOST_FORBIDDEN_CHARACTER_PATTERN = /[@/\\?#\u0000-\u0020\u007f-\u009f]/u;

/**
 * Refuses a configured feed host that could move the origin of the document's absolute URLs.
 *
 * Reinstates the threat-shaped half of the withdrawn DECISION G-1, answering review findings F7 and
 * SEC-06. The full argument — including why G-1's RFC 1035 grammar and the `allowedHosts` membership
 * gate stay withdrawn — is in the RAW-SINK POLICY note above this declaration.
 *
 * ⭐ CALLED AT BOTH BOUNDARIES, ON PURPOSE. {@link ProductFeedBuilder.build} calls it once per render,
 * before it composes the `http://<host>` prefix, so every caller of the serializer is covered including
 * a test harness. `src/handlers/googleFeedHandler.ts` calls it once at construction, so a
 * misconfiguration is refused while the container initialises rather than midway through a document.
 * Neither call normalises anything: a host that passes is used exactly as configured — not trimmed, not
 * case-folded, not punycoded, not stripped of a default port and not upgraded to a secure scheme.
 *
 * ⚠️ IT VALIDATES AND RETURNS NOTHING. There is no branded return type, because
 * `GoogleFeedHostConfiguration` is declared structurally so that `config.googleFeed` satisfies it
 * directly, and a brand would break that (S4). The type stays `string` and the CHECK is the contract.
 *
 * @param host the configured host authority, exactly as the composition root supplied it
 * @throws {DataIntegrityError} when the host is blank, or carries an authority delimiter, whitespace or
 *   a control character. The diagnostic reports the offending offset and code point and NEVER the value
 *   itself, so a misconfiguration is diagnosable without echoing configuration into a log.
 */
export function validateFeedHostAuthority(host: string): void {
  if (host.trim() === '') {
    throw new DataIntegrityError(
      'The Google product feed host is blank, so no absolute URL in the document can be built.',
      { context: { locator: 'integrationServices/google/views/feed/product.cfm:L14' } },
    );
  }

  const offendingIndex = host.search(FEED_HOST_FORBIDDEN_CHARACTER_PATTERN);
  if (offendingIndex !== -1) {
    /* Read through a local and narrowed below rather than asserted: `codePointAt` is typed as possibly
     * undefined and S1 forbids the non-null assertion that would silence it. */
    const offendingCodePoint = host.codePointAt(offendingIndex);
    throw new DataIntegrityError(
      'The Google product feed host carries a character that would move the origin of every absolute ' +
        'URL in the document, so the feed is refused rather than published against an unintended host.',
      {
        context: {
          locator: 'integrationServices/google/views/feed/product.cfm:L14',
          offendingIndex,
          offendingCodePoint:
            offendingCodePoint === undefined
              ? 'unknown'
              : `U+${offendingCodePoint.toString(16).toUpperCase().padStart(4, '0')}`,
        },
      },
    );
  }
}

/* ================================================================================================
 * TIME OF DAY — hand-built, because it is this file's responsibility and nobody else's.
 * The calendar-date half is NOT hand-built: it goes through the shared `dateFormat` port under
 * {@link EFFECTIVE_DATE_MASK}, declared with the endpoint renderer further down.
 * ============================================================================================= */

/**
 * Renders a 24-hour zero-padded `HH:mm:ss`, reproducing the legacy `timeFormat(value, "HH:mm:ss")`
 * calls at `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * WHY IT IS IMPLEMENTED HERE AND NOT IN THE SHARED FORMATTER. `src/util/formatting.ts` implements
 * date-component mask tokens only, and deliberately implements no hour, minute, second or meridiem
 * token at all (see that module's own note on `globalTimeFormat`). The timestamp's time-of-day
 * portion, its `T` separator, its literal hyphen, its raw offset and its `/` range separator all
 * belong to this file, so the shared formatter is not extended to serve them. The DATE half is a
 * plain `dateFormat` mask, so it IS delegated — see {@link EFFECTIVE_DATE_MASK}.
 *
 * ⛔ LOCAL-TIME ACCESSORS ONLY, NEVER UTC ACCESSORS, AND NEVER AN OFFSET CORRECTION. `timeFormat`
 * renders the components of the value it is handed, in the engine's own zone; it performs no
 * conversion of any kind. So `getHours`/`getMinutes`/`getSeconds` are the exact counterparts, and
 * `getUTCHours` and friends are not. This also keeps the time half consistent with the date half,
 * which goes through the shared `formatDate` and reads local components too — pairing a local date
 * with a UTC time could otherwise emit a timestamp that never existed.
 *
 * ⚠️ AN EARLIER REVISION READ UTC ACCESSORS OFF AN INSTANT SHIFTED BY THE SUPPLIED OFFSET, AND THAT
 * IS WITHDRAWN. Its reasoning was that the components and the offset LABEL must describe one zone: in
 * the legacy they do so automatically because both come from the engine's single zone, whereas in the
 * port the components come from the host clock while the label arrives as caller-supplied text, so a
 * UTC host handed an offset of `5` emits UTC components labelled `-5`. The observation is accurate,
 * and it is still recorded — at {@link ProductFeedRenderContext.utcHourOffset} and at
 * `src/handlers/googleFeedHandler.ts`, which is why that handler reads BOTH values from ONE clock
 * collaborator and so reproduces the legacy's single-zone invariant at the layer that owns it.
 *
 * BUT THE CONCLUSION WAS A REPAIR, NOT A TRANSLATION. `product.cfm:L30` does not shift: it formats
 * the value as it stands and then appends the offset as a bare label. Subtracting the offset first
 * moves every emitted date and time — five hours, for the offset the legacy hosts typically report —
 * so it changes the document for exactly the records that carry it. AAP §0.8.2 guideline 4 forbids
 * enhancement beyond what the migration requires, §0.6.7 governs the register with "preserve and
 * annotate, do not repair", and D18 (§0.6.7.7) is the SOLE declared hardening exception and licenses
 * only a divergence that changes no outcome. A timestamp correction is not that. The malformed
 * bare-offset label is therefore carried as-is, unmoved components and all.
 *
 * @param value the instant to render, read in the host's own zone exactly as `timeFormat` reads it
 * @returns the zero-padded time of day
 */
function formatTimeOfDay(value: Date): string {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/* ================================================================================================
 * MONETARY RENDERING (F21)
 * ============================================================================================== */

/* F07 — the exponential-form pattern that used to live here is gone with the expansion it served; see
 * {@link renderFeedMoney}. Its remaining home is `../../util/formatting`, at the coercion boundary where
 * a value can still arrive in that form. */

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
 * ⭐ F07 CLOSED THE TRAILING-ZERO HALF OF F21, WHICH AN EARLIER REVISION OF THIS BLOCK RECORDED AS
 * UNFIXABLE HERE — AND IT WAS RIGHT ABOUT THAT. It said a stored `100.00` had already become the
 * JavaScript number `100` by the time it arrived, because the scale was lost at HYDRATION, and that
 * restoring it *"would mean carrying exact decimal TEXT on the entity itself — a change to
 * `src/domain/sku/Sku.ts`, `src/domain/product/Product.ts` and every price consumer in the port"*.
 *
 * That is exactly the change F07 required, and it has been made. The monetary members of both entities
 * are now `ExactDecimal`: the stored digits, at the stored scale, unconverted. So `100.00` arrives here
 * as `'100.00'` and is emitted as `100.00`, and the residue is gone rather than merely disclosed.
 *
 * ⚠️ THE EXPONENTIAL-EXPANSION MACHINERY IS GONE TOO, BECAUSE ITS INPUT CANNOT OCCUR ANY MORE. It
 * existed because `String(1e-7)` yields `"1e-7"`, which is not legal feed money. An `ExactDecimal` is
 * plain decimal text by construction — its grammar admits an optional minus, digits and at most one
 * point — so there is no exponent left to expand. The expansion itself was not deleted, only moved to
 * where a value can still arrive in that form: `../../util/formatting`'s coercion path.
 *
 * ⛔ NO SCALE IS STILL IMPOSED, AND THE REASON IS UNCHANGED — see the block above. Emitting the STORED
 * scale is not the same as choosing one: the database supplied it, this function did not invent it.
 *
 * @param value the monetary value, as exact decimal text
 * @returns the same digits, at the same scale, never exponential
 */
function renderFeedMoney(value: ExactDecimal): string {
  return value;
}

/* ================================================================================================
 * THE SALE-PRICE EFFECTIVE DATE — two endpoints, each a value's own components plus a bare label
 * ============================================================================================= */

/**
 * The `dateFormat` mask both effective-date endpoints are rendered with, carried verbatim from
 * `integrationServices/google/views/feed/product.cfm:L30`, which writes it twice.
 *
 * ⭐ DELEGATED TO `src/util/formatting`'s `formatDate` RATHER THAN HAND-BUILT, because that module IS
 * the port of CFML's `dateFormat` and it reads LOCAL components — which is exactly what the legacy
 * call does. Passing the legacy's own mask text through the legacy mask interpreter is a closer
 * translation than re-deriving `YYYY-MM-DD` from date accessors here, and it keeps one implementation
 * of the mask grammar in the subtree instead of two.
 *
 * ⛔ THE MASK IS UPPER-CASE BECAUSE THE SOURCE IS. `formatDate` matches tokens case-insensitively, so
 * the case carries no behaviour; it is preserved so this constant diffs against `:L30` character for
 * character.
 */
const EFFECTIVE_DATE_MASK = 'YYYY-MM-DD';

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
  /* ⛔ THE OFFSET IS A LABEL, NOT AN OPERAND. `product.cfm:L30` formats the value with `dateFormat`
   * and `timeFormat` — neither of which converts a zone — and only then appends the literal hyphen and
   * the raw offset text. So the components below are the value's OWN components and the offset takes
   * no part in computing them: an endpoint's date and time are identical whatever the offset says.
   *
   * ⛔ AND IT IS NEITHER PARSED NOR VALIDATED. An earlier revision read it as a number of hours,
   * shifted the instant by it and REFUSED a render when the text was not finite. Both are withdrawn.
   * The shift is a repair (see {@link formatTimeOfDay}); the refusal is a hardening with no licence,
   * because `:L30` interpolates whatever `getTimeZoneInfo().utcHourOffset` answers with no test of any
   * kind and never fails on it, so raising forecloses a legacy outcome — precisely the WITHDRAWN
   * RAW-SINK VALIDATION argument this file applies to its other raw sinks, and not something D18
   * (§0.6.7.7) licenses. With no arithmetic left there is nothing a numeric reading could serve.
   *
   * ⚠️ SO THE TEXT LEAVES THIS FUNCTION UNMODIFIED, TWICE PER RANGE, exactly as `:L30` interpolates it —
   * but it does NOT reach the document that way. The caller joins the two endpoints and escapes the WHOLE
   * range in one pass, so both embedded offsets are covered; the escape is deliberately not applied here,
   * because escaping each endpoint separately would then have to escape the `/` separator too and would
   * double-escape nothing but still split one obligation across two places. The exposure this function
   * leaves open is therefore closed at the emission site, which is where it is documented, and at
   * {@link ProductFeedRenderContext.utcHourOffset}. */
  const datePart = value === '' ? '' : formatDate(value, EFFECTIVE_DATE_MASK);
  const timePart = value === '' ? '' : formatTimeOfDay(value);
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
 *   // From `config.googleFeed.host`, NEVER from a request header — see the member's own note.
 *   host: config.googleFeed.host,
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
   * ⭐ THE HOST AUTHORITY IS GATED ONCE PER RENDER, BEFORE ANY BYTE IS PRODUCED — findings F7/SEC-06.
   * {@link validateFeedHostAuthority} refuses a host carrying a character that would move the origin of
   * the five absolute URLs `product.cfm:L14`, `:L15`, `:L22`, `:L23` and `:L24` build on it. It is NOT
   * the withdrawn `allowedHosts` membership gate — that one refused legal authorities for not being on a
   * list and stays withdrawn along with its member. See the RAW-SINK POLICY note for the D18 test that
   * separates the two.
   *
   * ⭐ THE `http://<host>` PREFIX IS COMPOSED EXACTLY ONCE, HERE, AFTER THE GATE AND BEFORE ANY BYTE IS
   * PRODUCED. That is a de-duplication, not a second gate: one document can never assemble the prefix
   * two different ways, and {@link ProductFeedBuilder.buildItem} receives it finished, which is why that
   * method never reads {@link ProductFeedRenderContext.host} itself. The prefix is carried RAW and each
   * sink escapes its own finished URL, so no value is escaped twice — see {@link escapeFeedText}.
   *
   * @param records the already-materialised SmartList records, rendered in the order given
   * @param context the render-time replacements for the legacy request globals
   * @returns the complete RSS document
   * @throws {DomainError} when a record's SKU carries no product, reproducing the legacy null
   *   dereference — see {@link ProductFeedBuilder.buildItem}
   */
  public async build(
    records: readonly ProductFeedRecord[],
    context: ProductFeedRenderContext,
  ): Promise<string> {
    /* ⭐ THE AUTHORITY GATE RUNS HERE, FIRST, BEFORE ANY BYTE IS PRODUCED — findings F7 and SEC-06.
     * {@link validateFeedHostAuthority} refuses a host that would move the origin of the five absolute
     * URLs `product.cfm:L14`, `:L15`, `:L22`, `:L23` and `:L24` build on it. Running it before the
     * prefix is composed is what makes a rejection ATOMIC: no line is pushed, `buildItem` is never
     * entered, and no port is called, so a refused render emits no partial document at all.
     *
     * ⛔ IT IS NOT THE WITHDRAWN `allowedHosts` GATE, AND THE DIFFERENCE IS THE WHOLE JUSTIFICATION.
     * That one refused hosts that were legal authorities but absent from a configured list, which is an
     * outcome change on legitimate input. This one refuses only the five authority-delimiting
     * characters plus whitespace and controls, none of which a legacy deployment could have published
     * to the origin it configured. `allowedHosts` stays withdrawn and its member stays gone. The
     * separation of the two, and the D18 test that decides each, is in the RAW-SINK POLICY note.
     *
     * ⚠️ AND THE TWO CHANNEL VALUES ARE NOW ESCAPED, WHICH THE GATE DOES NOT MAKE REDUNDANT. The gate
     * defends the ORIGIN; the escaping defends the XML. A host carrying `&` passes the gate — correctly,
     * because `&` cannot move an authority — and would leave `:L14`'s and `:L15`'s text nodes
     * unparseable if it were emitted raw. The channel title is a module constant and needs neither. */
    validateFeedHostAuthority(context.host);

    const absoluteUrlPrefix = `${HTTP_SCHEME_PREFIX}${context.host}`;
    const channelLink = absoluteUrlPrefix;
    /* ⚠️ COMPOSED RAW AND ESCAPED ONCE, AT THE PUSH SITE BELOW — NOT HERE. An intermediate revision
     * rendered the host through the sink helper during composition AND escaped the composed string when
     * pushing it, which double-escapes: a host carrying `&` reaches the document as `&amp;amp;`, and an
     * XML parser then hands a consumer back the literal text `&amp;`. The prefix is a document literal
     * with nothing to escape, so escaping the assembled value once is both sufficient and correct. */
    const channelDescription = `${CHANNEL_DESCRIPTION_PREFIX}${context.host}`;

    const lines: string[] = [
      XML_DECLARATION,
      RSS_OPEN_TAG,
      `${INDENT_UNIT}<channel>`,
      `${INDENT_UNIT.repeat(2)}<title>${CHANNEL_TITLE}</title>`,
      /* ⭐ CWE-91 — BOTH CHANNEL VALUES ARE ESCAPED, THOUGH `:L14` AND `:L15` EMIT THEM RAW. Each
       * interpolates the configured host into an element's text content, so XML markup in that value
       * would close `<link>` or `<description>` and open elements of its own — and at CHANNEL level a
       * single bad configured value corrupts the whole document rather than one item. The host is not
       * percent-encoded, because a legitimate authority carries `:` before a port; see
       * {@link encodeFeedUrlPath} for why the two remedies are applied to different parts of a URL. */
      `${INDENT_UNIT.repeat(2)}<link>${escapeFeedText(channelLink)}</link>`,
      `${INDENT_UNIT.repeat(2)}<description>${escapeFeedText(channelDescription)}</description>`,
    ];

    /*
     * ⛔ NEITHER COLLABORATOR IS WRAPPED, AND AN EARLIER REVISION WRAPPED BOTH HERE. A
     * `memoisePricingByProduct` decorator and a `memoiseResizedImagePaths` decorator were built at this
     * point, bundled into a `FeedDocumentScope` and handed to every record so that a product-wide
     * sale-price read and a repeated resized-path resolution were each paid for once per document. Both
     * are withdrawn, and {@link ProductFeedBuilder.buildItem} now reads `this.pricing` and
     * `this.imagePaths` directly — see THERE IS NO PORT MEMOISATION IN THIS FILE above for the full
     * argument. The repetition `integrationServices/google/views/feed/product.cfm:L23-L24` performs is
     * behaviour, and removing it was a performance refactoring this migration is explicitly not
     * (AAP §0.1.1.1, §0.8.2 guideline 4).
     *
     * ⛔ AND THERE IS NO CANCELLATION CHECK, WHICH AN EARLIER REVISION RAN AT EVERY RECORD BOUNDARY. A
     * `ProductFeedRenderOptions.signal` was read here into a `throwIfCancelled` closure that raised a
     * {@link DomainError} carrying the count of records already rendered. Both the option type and the
     * check are withdrawn: the legacy view has no cancellation concept of any kind, so a render that
     * REFUSES where the legacy completed is a new observable outcome with no counterpart, and D18
     * (AAP §0.6.7.7) is the register's sole declared behaviour-hardening exception. AAP §0.6.6 M2 is also
     * explicit that the delivery-model mismatch behind `product.cfm:L9`'s 360-second budget is to remain
     * an UNRESOLVED decision belonging to `../../handlers/googleFeedHandler.ts`; supplying a stop
     * mechanism here would have settled half of it by accident.
     */

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
   * ⭐ EVERY DYNAMIC TEXT NODE IS ESCAPED, AND THE THREE URL PATHS ARE ENCODED FIRST. Thirteen of the
   * sixteen fields carry a dynamic value and every one of them passes through {@link escapeFeedText};
   * the remaining three — `g:google_product_category`, `g:condition` and `g:availability` — are fixed
   * text with nothing to escape. The item `link`, `g:image_link` and every `g:additional_image_link`
   * additionally pass their DATA-DERIVED PATH through {@link encodeFeedUrlPath} before the escape, so a
   * stored path cannot introduce a URL authority. See ESCAPING for why the legacy's six-escaped,
   * ten-raw split is not reproduced.
   *
   * @param record the SKU and its product's images
   * @param context the render-time replacements for the legacy request globals
   * @param absoluteUrlPrefix the `http://<host>` prefix, composed once per render by
   *   {@link ProductFeedBuilder.build} from {@link ProductFeedRenderContext.host}
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
    /* `absoluteUrlPrefix` is composed once by {@link ProductFeedBuilder.build}, this method's only
     * caller, and passed in — so the `http://<host>` text is assembled in exactly one place. Nothing
     * here VALIDATES it and nothing validates the per-record paths appended to it, because
     * `product.cfm:L22-L24` validates neither; each finished URL is ENCODED and ESCAPED instead, which
     * admits every value and judges none. The distinction is the subject of WITHDRAWN RAW-SINK
     * VALIDATION. */
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

    /* ---- 6. item `link` — ENCODED + ESCAPED; RAW at `product.cfm:L22`. ---------------------
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
     * ⭐ CWE-91 — ENCODED THEN ESCAPED, THOUGH `:L22` DOES NEITHER. One of the path's two segments is a
     * SETTING value and the other is the persisted `urlTitle` COLUMN, so both are operator- or
     * database-supplied text reaching an element's text content. The path is percent-encoded per segment
     * first, so a stored value cannot introduce a URL authority, a query or a fragment; the finished URL
     * is then escaped once, so it cannot introduce markup. Neither pass touches a legitimate path: the
     * leading and trailing slashes of `/#setting('globalURLKeyProduct')#/#getURLTitle()#/` both survive,
     * and `urlTitle` characters are already inside `encodeURIComponent`'s unreserved set. Refusal is NOT
     * used — an earlier revision validated the path as a same-origin relative reference and RAISED on a
     * miss, and refusing to render is the one divergence D18 does not license. */
    fields.push(
      `<link>${escapeFeedText(
        `${absoluteUrlPrefix}${encodeFeedUrlPath(product.getProductURL(this.settings))}`,
      )}</link>`,
    );

    /* ---- 7. `g:image_link` — ENCODED + ESCAPED; RAW at `product.cfm:L23`. -------------------
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
    /* ⭐ CWE-91 — ENCODED THEN ESCAPED, ON THE SAME TERMS AS THE ITEM LINK ABOVE. The path is whatever the
     * image adapter composed, and it may be the value of the missing-image SETTING, so it is data rather
     * than a constant: `src/ports/ImagePathPort.ts` is explicit that {@link ImageWebPath} is a purely
     * NOMINAL label which "asserts nothing about the value". The brand is therefore no substitute for
     * encoding, which is exactly why both passes are applied here.
     *
     * ⭐ THE READ IS `this.imagePaths` DIRECTLY, ONCE PER SKU. An earlier revision routed it through a
     * per-document memo wrapper; that is withdrawn, so `:L23`'s one-resolution-per-SKU pattern is what
     * this line performs. See THERE IS NO PORT MEMOISATION IN THIS FILE. */
    const resizedImagePath = await sku.getResizedImagePath(this.imagePaths, this.settings);
    fields.push(
      `<g:image_link>${escapeFeedText(
        `${absoluteUrlPrefix}${encodeFeedUrlPath(resizedImagePath)}`,
      )}</g:image_link>`,
    );

    /* ---- 8. repeated `g:additional_image_link` — ENCODED + ESCAPED; RAW at `product.cfm:L24`. -
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
       * `ImageWebPath`, so a raw `string` cannot be handed to it and the URL-versus-file-system
       * distinction is carried in the type rather than in prose.
       *
       * ⭐ TAGGING IS CORRECT HERE, AND IT IS THE ONLY PLACE IN THIS FILE THAT TAGS. The value is an
       * ALREADY-COMPOSED display URL — `model/entity/Image.cfc:L79-L81` builds it from the image's own
       * `directory` column and `:L123` assigns it before delegating — so this is exactly the
       * "composed path being labelled" case {@link toImageWebPath} exists for. It asserts nothing about
       * the value.
       *
       * ⚠️ AN EARLIER FORM OF THIS NOTE ADDED "and it cannot widen this builder's reach: the tag produces
       * only the DISPLAY brand, and no file-system member of the port accepts one." THAT WAS FALSE. There
       * is one brand, not two, and BOTH file-system members of `ImagePathPort` accept it — the tag confers
       * no isolation whatsoever. What actually bounds this builder is that it holds no reference to either
       * of those members: {@link FeedDocumentScope} hands it `imagePaths` for path resolution only, and it
       * never writes an image nor probes for one. The bound is the call graph, not the type. */
      const request: ResizedImagePathRequest = {
        imagePath: toImageWebPath(image.imagePath),
        missingImagePath: image.missingImagePath ?? this.settings.setting('imageMissingImagePath'),
      };
      /* ⭐ CWE-91 — ENCODED THEN ESCAPED, exactly as the primary image above. The missing-image SETTING
       * can be the value that ends up here, so this path is no more trusted than the primary one and is
       * treated identically.
       *
       * ⭐ ONE RESOLUTION PER IMAGE PER SKU, READ FROM `this.imagePaths`. `:L24` loops the PRODUCT's image
       * collection inside the per-SKU loop, so a feed of `n` SKUs over a product with `i` images issues
       * `n * i` resolutions here. An earlier revision collapsed the repeats behind a per-document memo;
       * that is withdrawn, and the legacy call pattern is restored. */
      const additionalImagePath = await this.imagePaths.getResizedImagePath(request);
      /* The encode-then-escape composition is written INLINE here, exactly as it is at the item `link` and
       * `g:image_link` sinks above, rather than hoisted into a local. The three URL fields are the only
       * places in this file where two transformations compose, and keeping them character-for-character
       * alike is what lets the source-level census in the test suite state "every URL sink encodes before
       * it escapes" as one uniform check rather than three special cases. */
      fields.push(
        `<g:additional_image_link>${escapeFeedText(
          `${absoluteUrlPrefix}${encodeFeedUrlPath(additionalImagePath)}`,
        )}</g:additional_image_link>`,
      );
    }

    /* ---- 9 and 10. fixed `g:condition` and `g:availability` (`:L25`, `:L26`). ----------------
     * Module constants, not dynamic text, so there is nothing to escape and nothing to flag. A test
     * asserts they hold no metacharacter rather than trusting the reading. */
    fields.push(`<g:condition>${CONDITION_VALUE}</g:condition>`);
    fields.push(`<g:availability>${AVAILABILITY_VALUE}</g:availability>`);

    /* ---- 11. `g:price` — ESCAPED; RAW at `product.cfm:L27`. ---------------------------------
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
    /* ⭐ CWE-91 — ESCAPED, THOUGH `:L27` EMITS IT RAW, AND THE REASON IS THE BRAND'S OWN ESCAPE HATCH.
     * `ExactDecimal` is a branded STRING whose grammar admits only digits, an optional leading minus and
     * at most one point, so for every value produced through `toExactDecimal` the escape is a NO-OP and
     * emits byte-identical output. It is applied anyway because the brand is a compile-time claim, not a
     * runtime one: an assertion at a hydration boundary, a hand-written test double or a future adapter
     * that mints the brand without validating would put arbitrary text here, and this element would then
     * be the one dynamic sink in the document with no defence. Escaping a value that needs no escaping
     * costs nothing; discovering that a branded string was not what the brand promised costs a document. */
    const productPrice = product.getPrice();
    /* F21 / F07 — RENDERED THROUGH {@link renderFeedMoney}, which now emits the STORED digits at the
     * STORED scale and rounds, pads and truncates nothing. Exponential notation was the original
     * defect here — `String(1e-7)` yields `"1e-7"`, which no feed consumer parses as a price — and it
     * is now structurally impossible rather than repaired, because an `ExactDecimal` cannot be in that
     * form. The empty case stays empty: the legacy emits `<g:price></g:price>` when the price is
     * absent. */
    fields.push(
      `<g:price>${escapeFeedText(
        productPrice === undefined ? '' : renderFeedMoney(productPrice),
      )}</g:price>`,
    );

    /* ---- 12 and 13. conditional `g:sale_price` and `g:sale_price_effective_date`, both ESCAPED;
     * both RAW at `product.cfm:L28-L31`. ------------------------------------------------------
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
    /* ⚠️⚠️ F07 — THE COMPARISON GOES THROUGH `compareExactDecimal`, AND WRITING IT AS `skuPrice >
     * salePrice` WOULD NOW BE A SILENT DEFECT RATHER THAN A COMPILE ERROR. Both operands became
     * `ExactDecimal`, which is a branded STRING, and `>` between two strings is perfectly legal
     * TypeScript — it just compares them LEXICALLY. Lexically `'9'` is greater than `'10'`, so a
     * nine-unit SKU discounted to ten would have been advertised as on sale and a `'100.00'` price
     * would not have compared equal to a `'100'` sale price. The typechecker cannot catch it, so the
     * comparison is named instead: `compareExactDecimal` orders digit-wise — sign, then integer-digit
     * count, then digits, then the fraction over the longer scale — and is exact at every magnitude.
     *
     * `=== 1` PRESERVES THE STRICTNESS the legacy `gt` at `product.cfm:L28` requires, and it preserves
     * the omit-on-equal behaviour the block above explains at length.
     *
     * AN UNORDERABLE OPERAND OMITS THE PAIR. `compareExactDecimal` returns `undefined` rather than a
     * silent `false` when either side is non-numeric, and `=== 1` therefore omits — which is the same
     * choice this file makes for every other absent or unresolvable value in the render, and which
     * cannot advertise a bogus sale. It is unreachable in practice: `rowMappers.ts` guarantees
     * well-formed digits on the way in and the `numeric` rule gates the way out. */
    const skuPrice = sku.getPrice();
    const salePrice = await sku.getSalePrice(this.pricing);
    if (compareExactDecimal(skuPrice, salePrice) === 1) {
      /* ⭐ CWE-91 — ESCAPED, THOUGH `:L29` EMITS IT RAW, for exactly the reason `g:price` above is
       * escaped: a no-op for every value the brand's grammar admits, and the only defence if a value ever
       * reaches the brand without having satisfied it.
       * F21 — the same plain-decimal rendering as `g:price` above; see the note there. */
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
      /* ⭐ CWE-91 — ESCAPED, THOUGH `:L30` EMITS IT RAW, AND HERE THE ESCAPE IS NOT A NO-OP.
       * {@link ProductFeedRenderContext.utcHourOffset} is arbitrary TEXT emitted unmodified, and it
       * appears TWICE in this range, so an XML-significant character in the configured offset would reach
       * the document twice over. The WHOLE assembled range is escaped once, after the two endpoints are
       * joined, so the single `/` separator and both embedded offsets are covered by one pass — which is
       * why no endpoint escapes itself. ⚠️ THE ESCAPE IS THE DECLARED HARDENING, NOT A PARITY CLAIM:
       * `product.cfm:L30` interpolates every part of this range with no `htmlEditFormat` call, so the
       * escape changes bytes the legacy does not change, and it is carried under the same declared
       * exception as every other dynamic sink in this file rather than as preservation.
       *
       * ⛔ AND THE ESCAPE IS THE ONLY GATE. There is no numeric test on the offset, so a hostile value is
       * not refused — it is neutralised. A revision that reinstated a `Number.isFinite` refusal here would
       * make the escape unreachable defence in depth and would foreclose a legacy outcome, since `:L30`
       * tests the offset in no way at all and never fails on it.
       *
       * The COMPONENTS, by contrast, are strict parity. The two date parts come from the shared
       * {@link formatDate} under {@link EFFECTIVE_DATE_MASK} and the two time parts from
       * {@link formatTimeOfDay}, each reading its own value's LOCAL components exactly as
       * `dateFormat`/`timeFormat` do — no zone conversion, matching the legacy. The offset is
       * interpolated as a bare label and is never parsed; the hyphens, `T` and `/` around all of it are
       * literals with nothing to escape. */
      const effectiveDate = `${effectiveFrom}/${effectiveTo}`;
      /* The legacy leaves a single TAB after this element's closing tag at
       * `product.cfm:L30`, and it is reproduced — see {@link SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB}
       * for why a dropped byte is a departure from byte-for-byte preservation even when it is only
       * whitespace. This is the ONLY element that carries one. */
      fields.push(
        `<g:sale_price_effective_date>${escapeFeedText(
          effectiveDate,
        )}</g:sale_price_effective_date>` + SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB,
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

    /* ---- 16. `g:shipping_weight` — ESCAPED; RAW at `product.cfm:L58`. -----------------------
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
     * layer may not import. Whatever the resolver returns is emitted verbatim and otherwise untouched —
     * including the empty string, which is why the unseeded case keeps rendering
     * `<g:shipping_weight> </g:shipping_weight>`, the lone separator space and nothing else.
     *
     * ⛔ THE TWO GRAMMARS THAT USED TO GUARD THIS SITE ARE GONE ON PURPOSE, AND THE ESCAPE IS NOT ONE OF
     * THEM. `skuShippingWeight` is declared `fieldType="text"` and the unit code's options are a LIVE
     * query over a user-editable table, so neither value is a closed set and any allowlist would have
     * invented one; the full evidence is in the THERE IS NO RAW-SINK GRAMMAR inventory above. Escaping
     * needs no set: it accepts whatever the resolver returns, which is why it can close this sink where
     * a grammar could not. */
    const settingContext: SettingResolutionContext = { entityName: 'Sku', entityId: sku.skuID };
    const shippingWeight = this.settings.setting('skuShippingWeight', settingContext);
    const shippingWeightUnitCode = this.settings.setting(
      'skuShippingWeightUnitCode',
      settingContext,
    );
    /* ⭐ CWE-91 — ESCAPED, THOUGH `:L58` EMITS IT RAW, AND HERE TOO THE ESCAPE IS NOT A NO-OP. Both
     * values come from the settings store, which is operator- and database-supplied text with no
     * allowlist: `model/service/SettingService.cfc:L233` declares `skuShippingWeight` as
     * `fieldType="text"`, and `:L338-L343` builds the unit code's options from a LIVE query over the
     * user-editable `SwMeasurementUnit`. So neither value is a closed set and an XML-significant character
     * in either would reach the document. The JOINED text is escaped once, so the single literal space
     * between the two values — the legacy's own separator at `:L58`, which survives on its own when one
     * value resolves empty — is inside the same pass and is left untouched by it.
     *
     * ⛔ STILL NO GRAMMAR AND NO REFUSAL. The two withdrawn allowlist validators are not reinstated: the
     * evidence above is precisely why a closed set would have been invented (AAP §0.7.3 S9), and escaping
     * needs no grammar because it encodes rather than judges. */
    const shippingWeightText = `${shippingWeight} ${shippingWeightUnitCode}`;
    fields.push(`<g:shipping_weight>${escapeFeedText(shippingWeightText)}</g:shipping_weight>`);

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
   * The UNESCAPED text is returned and escaped once by the caller, so the escaper is invoked exactly
   * once per field and the escaping census recorded at {@link escapeFeedText} stays auditable.
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
   * Naming the subject is also this file's dominant idiom: {@link ProductFeedBuilder.requireProductType}
   * does it too, and the inconsistency was this member's.
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
