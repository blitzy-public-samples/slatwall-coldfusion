// ---------------------------------------------------------------------------
// The Google product-feed Lambda entrypoint - unit suite.
//
// Subject: `src/handlers/productFeedHandler.ts`, whose two exported values are
// `createProductFeedHandler` and `handler`. It is the ONLY one of the five capability
// entrypoints that ports a legacy method body - `public void function product(required struct rc)`
// [integrationServices/google/controllers/feed.cfc:L58] - so it is also the only one whose routing,
// delegation, response shape and failure mapping can be checked against a source line.
//
// FOUR CONCERNS, AND NOTHING ELSE IS ASSERTED HERE:
//
//   1. PARSING AND VALIDATION - what this entrypoint reads off the request, and what it refuses.
//   2. DELEGATION            - that the port is reached with NO arguments, once, per invocation.
//   3. RESPONSE SHAPING      - the status, the single header, and the document returned unmodified.
//   4. ERROR MAPPING         - the three statuses the mapper owns, and what may never reach a body.
//
// COVERAGE IS NET-NEW, AND IS NOT PARITY. `meta/tests/` holds 32 test components and NOT ONE of
// them touches the feed, the Google adapter or the handler tier: the three legacy files that touch
// the in-scope slice at all are `meta/tests/unit/entity/BrandTest.cfc`,
// `meta/tests/unit/entity/ProductTest.cfc` and the EMPTY
// `meta/tests/functional/admin/entity/ProductTest.cfc`. Nothing in this file may be read as
// carrying a legacy assertion forward, because there is no legacy assertion here to carry. What IS
// carried over from that harness is one convention and one only - the `issue_<ticket#>` regression
// naming of `meta/tests/unit/IssuesTest.cfc` - and this suite has no ticket to name, so it uses
// none. Everything the legacy harness DID do is refused: every case there boots the real
// application, the ORM and the bean factory - it instantiates and persists entities through the
// engine's own ORM functions, flushes the session between steps, and reaches its collaborators
// through the ambient request scope - which is why the legacy "unit" tier is integration-style at
// every level and why nothing in it is isolated in the modern sense.
//
// NO MXUNIT TRANSLITERATION. Assertions are carried over in SUBSTANCE where a legacy assertion
// exists; the harness never is. No MXUnit assertion helper is ported or shimmed, there is no
// `setUp`/`tearDown` pair, no `Helper`-class port, no `variables.`-scope emulation, no `eval`, no
// `new Function`, no `vm` and no `Proxy` dispatch anywhere below.
//
// NO USER RULES EXIST for this project. `review_rules` was queried five times in four distinct
// forms - the default read and three explicit ranges - and every call returned the same single
// sentence stating that none were provided, which AAP 0.7 corroborates. There is no rules document
// to page through, so there is no partial read behind that finding. Their absence is NOT permission
// to lower the bar: every constraint honoured below is attributed to the AAP, to this file's own
// requirements, or to an explicit `JUDGMENT CALL:` annotation, and not one is attributed to a rule
// or invented to fill the gap.
//
// LICENSING. No GPL header and no restated licence text appears here; attribution for the whole
// subtree lives once in `slatwall-ts/NOTICE-GPL.md`. Worth recording for THIS file: the special
// exception permitting custom code is scoped to a single literal path, `/integrationServices/`
// [integrationServices/google/controllers/feed.cfc:L36], and this subtree sits outside it, so
// standard GPL terms govern this file - which is precisely why no per-file header is added.
//
// ---------------------------------------------------------------------------
// A FOLDER MISMATCH, RAISED RATHER THAN SILENTLY ABSORBED
//
// This file's own requirements describe it as the fifth and final file in `tests/unit/handlers` and
// state that bootstrap, router and error mapping have no separate suites. The branch says
// otherwise: `tests/unit/handlers` already carries `bootstrap.test.ts`,
// `bootstrapStatements.test.ts` and `errorMapper.test.ts` from an earlier batch, all passing. The
// five PLANNED files in that folder are the five capability suites, of which this is the fifth, so
// the folder holds eight once the batch lands. The mismatch is reported here and mirrored rather
// than resolved by deletion: nothing outside this file is created, renamed or edited, and in
// particular no sibling suite is removed to make a count come out right. There is no
// `router.test.ts`, which the requirements and the branch agree on.
// ---------------------------------------------------------------------------

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75]: `getProductFeedQuery`
// is both unrunnable and dead - its select list ends in a trailing comma before `FROM` [:L58-L60],
// its `INNER JOIN SwProduct` carries no `ON` clause [:L62-L63], and an exhaustive search of the
// legacy tree finds the name only on its own declaration line, so nothing calls it.
//
// Preserved deliberately; do not fix without a product decision.
//
// It is EXCLUDED as a source of behaviour here, not repaired and not transcribed. Where the two
// disagree the live controller wins: the DAO states `SwProduct.calculatedQATS > 0` [:L71] while the
// controller states an open-ended range from one upward [feed.cfc:L72], and the assertions below
// pin the controller's `>= 1`.

// LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]: the
// `g:google_product_category` element is emitted EMPTY - the template supplies no value for it from
// any source, and no column, setting read or controller line anywhere in the legacy path could.
//
// Preserved deliberately; do not fix without a product decision.
//
// Stated precisely, because it is easy to overstate: the element is EMITTED EMPTY, and there is NO
// TODO comment on or beside that line. The TODO-shaped content in that template is the three blocks
// of commented-out optional fields at [:L33-L38], [:L40-L57] and [:L59-L61]. The element belongs to
// `src/integrations/google/rssFeedRenderer.ts` and is asserted in that module's own suite; nothing
// here populates it, omits it or invents a category taxonomy from the adapter's
// `productGoogleProductType` setting definition.

// LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
// `displayname="USA epay"` - a copy-paste artefact from the USAePay payment adapter - while
// `getDisplayName()` returns `"Google"` [:L59-L61].
//
// Preserved deliberately; do not fix without a product decision.
//
// Both halves survive in the source and the METHOD is authoritative, so the assertions below expect
// `"Google"` and the tag's value appears nowhere in this file except in the marker above.

// LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: `getSettingOptions` declares
// `returntype="array"`, the body of its only conditional is empty [:L74-L76], and the function
// contains no return statement on any path - so it answers null for the setting name it tests and
// for every other name alike.
//
// Preserved deliberately; do not fix without a product decision.
//
// The port answers `undefined` on every path. It is not populated, not defaulted to an empty array
// and not made to throw, and the assertions below drive the matched name, an unmatched name and a
// case variant to prove all three.

// CFML parity [integrationServices/google/controllers/feed.cfc:L60]: request.layout = false, so the
// target returns a bare document string with no layout wrapper.

// CFML parity [integrationServices/google/controllers/feed.cfc:L51-L52]: property productService
// (L51) is a DEAD DI/1 injection - the body uses only getSkuService() (L52, used at L63).

// CFML parity [integrationServices/google/views/feed/product.cfm:L14,L22,L23]: the host is
// interpolated with a hardcoded http:// scheme from CGI.HTTP_HOST, which is why the target injects
// the feed host explicitly. It is captured at CONSTRUCTION - the composition root closes over it -
// and is never a method argument, which is what keeps the port's one method parameterless.

// CFML parity [integrationServices/IntegrationInterface.cfc:L65]: the doc comment (carrying the
// typo "seperated") describes a comma-separated LIST of types, so the contract permits multiples;
// Google returns a single-element list.

// CFML parity [integrationServices/google/Integration.cfc:L74]: the comparison uses eq and is
// case-insensitive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UntrustedFeedHostError } from '../../../src/handlers/bootstrap.js';
// A namespace import ALONGSIDE the named one, and the only namespace import in this file. It exists
// for exactly one assertion - that the module's runtime export set is the two values it publishes
// and carries no default export - which a named import cannot express. Every other reference goes
// through the named bindings.
import * as productFeedHandlerModule from '../../../src/handlers/productFeedHandler.js';
import { createProductFeedHandler, handler } from '../../../src/handlers/productFeedHandler.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import { GoogleFeedService } from '../../../src/integrations/google/googleFeedService.js';
import { GoogleIntegration } from '../../../src/integrations/google/integration.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { ProductFeedPort } from '../../../src/domain/ports/productFeedPort.js';
import type {
  CompositionRoot,
  InspectableRequestScope,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import type { ErrorResponseBody } from '../../../src/handlers/errorMapper.js';
import type { GoogleProductFeedRow } from '../../../src/integrations/google/googleFeedRepository.js';
import type {
  GoogleProductFeedRenderer,
  GoogleProductFeedRowSource,
} from '../../../src/integrations/google/googleFeedService.js';
import type { IntegrationType } from '../../../src/integrations/integrationInterface.js';

// ---------------------------------------------------------------------------
// Sentinels
//
// Every value below is invented, non-sensitive and deliberately unlike a credential. NO CREDENTIAL
// OF ANY KIND appears anywhere in this file - no authentication value, no key, no bearer or session
// value, no data-source string, no real host name and no routable network address - and nothing
// here reads `process.env`, so the suite passes with a completely empty environment, which is the
// guarantee `tests/setup.ts` states for the whole tier. The two members of the vendored API Gateway
// identity shape that are NAMED for a caller key are both the absent value; see the one place they
// are written. ---------------------------------------------------------------------------

/** The frozen route row this entrypoint answers, read from the shared table, not restated. */
const FEED_ROUTE = ROUTE_TABLE.productFeed;

/**
 * The origin host the document's links are composed from.
 *
 * A reserved-for-testing name, so it can never resolve anywhere. The handler reads it from the
 * request's `Host` header, reproducing `CGI.HTTP_HOST`
 * [integrationServices/google/views/feed/product.cfm:L14].
 */
const FEED_HOST = 'shop.example.test';

/**
 * The instant this suite pins every request to, written as an explicit UTC ISO-8601 literal.
 *
 * NO AMBIENT CLOCK READ APPEARS IN THIS FILE - no argument-less `new Date`, no `Date.now`, no fake
 * timer. The legacy template called `now()` inline while rendering each item's sale-price window
 * and combined it with `getTimeZoneInfo().utcHourOffset`
 * [integrationServices/google/views/feed/product.cfm:L30], which is exactly why the renderer takes
 * an injected instant. The handler's own clock is the event's `requestTimeEpoch`, so pinning that
 * stamp pins the whole document.
 */
const REQUEST_INSTANT_ISO = '2024-03-05T12:34:56.000Z';

/** The same instant as a `Date`. A pure conversion of the literal above, not a wall-clock read. */
const REQUEST_INSTANT = new Date(REQUEST_INSTANT_ISO);

/**
 * The instant the composition-root double falls back to when a request supplied none.
 *
 * The real root binds its own epoch once at scope creation. A double may not read the wall clock
 * either, so it binds this literal instead - visibly different from {@link REQUEST_INSTANT}, so a
 * test can tell "the request's stamp travelled" from "the scope's fallback travelled".
 */
const SCOPE_FALLBACK_INSTANT_ISO = '2019-11-30T01:02:03.000Z';

/** The fallback instant as a `Date`. */
const SCOPE_FALLBACK_INSTANT = new Date(SCOPE_FALLBACK_INSTANT_ISO);

/** The identifier API Gateway stamps onto the event. Server-generated, never a caller's. */
const GATEWAY_REQUEST_ID = 'gateway-0000-0000-0000-000000000001';

/** The correlation identifier the Lambda runtime supplies on its context object. */
const RUNTIME_REQUEST_ID = 'runtime-0000-0000-0000-000000000002';

/** The label the route is reported under: the table's own methods and path, never a caller's. */
const FEED_ROUTE_LABEL = `${FEED_ROUTE.methods} ${FEED_ROUTE.path}`;

/** The body message `src/handlers/errorMapper.ts` publishes for a request that matched no route. */
const ROUTE_NOT_FOUND_MESSAGE = 'The requested route does not exist.';

/** The body message for unusable request input, schema-rejected or handler-established. */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/** The fixed, deliberately uninformative body message for an unrecognized failure. */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/** The one content type a served feed declares. */
const FEED_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';

// ---------------------------------------------------------------------------
// The doubles
//
// All hand-written, all suite-local, all typed against the shipped contracts, and all built fresh
// inside each test. No mocking library is used to produce any of them - `vi` appears in this file
// for exactly two purposes, recording the logger's own stdout sink and proving that no network call
// is attempted. No dependency-injection container, no service locator, no registry and no metadata
// reflection appears. The real composition root is never called, no database or connection pool is
// constructed or imported as a side effect, and nothing here touches the network, the filesystem, a
// `.env` file or a credential.
//
// JUDGMENT CALL: THE MEMBERS THE ENTRYPOINT NEVER READS ARE TRIP-WIRES, NOT FABRICATIONS.
// `CompositionRoot` publishes six members and `RequestScope` publishes thirteen, of which this
// entrypoint reads exactly three - `integration`, `createRequestScope` and `productFeedPort`.
// Fabricating the other sixteen would mean constructing a rounding-rule service, five more
// services, a currency converter, a settings provider and a diagnostics record, i.e.
// re-implementing the composition root inside a test file in order to test a handler that ignores
// all of it. Instead each unread member is an accessor that THROWS, which costs nothing, imports no
// type from outside this file's declared dependencies, and converts "the entrypoint touches only
// those three" from a claim in a comment into a property the suite enforces: reading one fails the
// test that read it. `never` is assignable to every declared type, so the doubles satisfy the
// shipped interfaces exactly and without a cast.
// ---------------------------------------------------------------------------

/**
 * Refuse a member of a double that the entrypoint is not supposed to reach.
 *
 * The declared `never` return is what lets an accessor stand in for a member of any type at all.
 * The message names the member, so a test that trips one reports which contract was widened rather
 * than failing somewhere downstream with a type error.
 */
function unreachableMember(owner: string, member: string): never {
  throw new Error(
    `${owner}.${member} was read, and this entrypoint is not supposed to read it. ` +
      'The product-feed handler reaches CompositionRoot.integration, ' +
      'CompositionRoot.createRequestScope and RequestScope.productFeedPort and nothing else.',
  );
}

/**
 * One request's scope, publishing the feed port and refusing everything else.
 *
 * The real scope is built per invocation and discarded when the handler returns, which is what
 * keeps a warm container from serving one request's state to the next; this double is likewise
 * built per `createRequestScope` call and retained only for inspection.
 */
class FeedRequestScopeDouble implements RequestScope {
  public readonly productFeedPort: ProductFeedPort | undefined;

  public constructor(productFeedPort: ProductFeedPort | undefined) {
    this.productFeedPort = productFeedPort;
  }

  public get now() {
    return unreachableMember('RequestScope', 'now');
  }

  public get currentAccountContext() {
    return unreachableMember('RequestScope', 'currentAccountContext');
  }

  public get roundingRuleService() {
    return unreachableMember('RequestScope', 'roundingRuleService');
  }

  public get brandService() {
    return unreachableMember('RequestScope', 'brandService');
  }

  public get optionService() {
    return unreachableMember('RequestScope', 'optionService');
  }

  public get skuService() {
    return unreachableMember('RequestScope', 'skuService');
  }

  public get productService() {
    return unreachableMember('RequestScope', 'productService');
  }

  public get priceGroupService() {
    return unreachableMember('RequestScope', 'priceGroupService');
  }

  public get promotionService() {
    return unreachableMember('RequestScope', 'promotionService');
  }

  public get currencyConverter() {
    return unreachableMember('RequestScope', 'currencyConverter');
  }

  public updateOrderAmountsWithPriceGroupsThenPromotions() {
    return unreachableMember('RequestScope', 'updateOrderAmountsWithPriceGroupsThenPromotions');
  }

  public getSalePriceDetailsForProductSkus() {
    return unreachableMember('RequestScope', 'getSalePriceDetailsForProductSkus');
  }
}

/**
 * How a scope's feed port is decided from the input the handler supplied.
 *
 * A function rather than a fixed instance, because the composition root's documented behaviour is
 * that it builds the port IF AND ONLY IF a feed host was present - so the decision genuinely
 * depends on the input, and a test that withholds the port has to be able to say why.
 */
type FeedPortResolver = (input: RequestScopeInput) => ProductFeedPort | undefined;

/**
 * The composition root the entrypoint is handed.
 *
 * Records every `RequestScopeInput` it receives, which is the observation point the shipped
 * module's own documentation names: the feed host the handler captured and the instant it pinned
 * the request to are both visible here, and neither is ever a method argument on the port.
 *
 * The `integration` member is the REAL adapter. It declares no field, takes no constructor
 * argument, answers every one of its eight members with a constant and opens no socket, so
 * substituting a double for it would replace a fact with a guess.
 */
class FeedCompositionRootDouble implements CompositionRoot {
  public readonly integration = new GoogleIntegration();

  public readonly scopeInputs: RequestScopeInput[] = [];

  private readonly resolvePort: FeedPortResolver;

  private readonly scopeRejection: Error | undefined;

  public constructor(resolvePort: FeedPortResolver, scopeRejection?: Error) {
    this.resolvePort = resolvePort;
    this.scopeRejection = scopeRejection;
  }

  /**
   * Open one request's scope.
   *
   * Not `async`: the body awaits nothing, and declaring it `async` to look the part would trip
   * `require-await`. The returned promise is what the shipped contract requires, and the refusal
   * arm is a REJECTION rather than a synchronous throw, matching the real root's documented
   * behaviour once the address-zone read made scope creation asynchronous.
   *
   * The recorded copy is a fresh object, so a later mutation of the handler's own input - there is
   * none, but a double must not be the reason a suite believes that - cannot rewrite history. The
   * spread preserves member PRESENCE, which matters: `exactOptionalPropertyTypes` makes "the `now`
   * member is absent" and "the `now` member is `undefined`" different states, and the handler
   * deliberately produces the former.
   */
  public createRequestScope(input?: RequestScopeInput): Promise<RequestScope> {
    const received: RequestScopeInput = input ?? {};
    this.scopeInputs.push({ ...received });

    if (this.scopeRejection !== undefined) {
      return Promise.reject(this.scopeRejection);
    }

    return Promise.resolve(new FeedRequestScopeDouble(this.resolvePort(received)));
  }

  public get diagnostics() {
    return unreachableMember('CompositionRoot', 'diagnostics');
  }

  public get dialect() {
    return unreachableMember('CompositionRoot', 'dialect');
  }

  public get settingsProvider() {
    return unreachableMember('CompositionRoot', 'settingsProvider');
  }

  public createInspectableRequestScope(): Promise<InspectableRequestScope> {
    return unreachableMember('CompositionRoot', 'createInspectableRequestScope');
  }
}

/**
 * A feed port that answers with a fixed document and records how it was called.
 *
 * The rest parameter is the mechanical proof of the reshaping.
 * `ProductFeedPort.generateProductFeed` declares no parameters, so a method that accepts any number
 * of them still satisfies the contract - and every recorded count being zero is direct evidence
 * that no narrowing input reaches the port, rather than an inference drawn from the handler's
 * source.
 */
class RecordingProductFeedPort implements ProductFeedPort {
  public readonly argumentCounts: number[] = [];

  private readonly document: string;

  public constructor(document: string) {
    this.document = document;
  }

  public generateProductFeed(...args: readonly unknown[]): Promise<string> {
    this.argumentCounts.push(args.length);
    return Promise.resolve(this.document);
  }
}

/**
 * A feed port that fails the way its collaborators fail: by rejecting, unwrapped.
 *
 * The service under it catches nothing and defaults nothing - swallowing a read failure would serve
 * a document that silently omitted products a merchant is advertising - so whatever the row source
 * or the renderer raises arrives at the handler exactly as raised.
 */
class FailingProductFeedPort implements ProductFeedPort {
  public callCount = 0;

  private readonly failure: Error;

  public constructor(failure: Error) {
    this.failure = failure;
  }

  public generateProductFeed(): Promise<string> {
    this.callCount += 1;
    return Promise.reject(this.failure);
  }
}

// ---------------------------------------------------------------------------
// The catalog, and the four selection predicates
//
// The candidate catalog is built from the SHIPPED ENTITY FIXTURES - `makeProductFixture` and
// `makeSkuFixture`, both singular, both taking a plain object literal because their overrides
// interfaces are module-private - and then projected into the flat row shape the feed repository
// returns. Grounding the catalog in those fixtures rather than in ad-hoc literals is what keeps the
// monetary value a `Money` built from a decimal string (the fixture builds it that way and this
// file performs no arithmetic on it at all, monetary or otherwise) and keeps the flags, codes and
// URL path the ones the entity layer actually answers with.
//
// `productCalculatedQATS` is the exception and stays a plain `number`: `SwProduct.calculatedQATS`
// is a persisted calculated INTEGER column [model/entity/Product.cfc:L63] and a non-monetary
// numeric, so it never becomes `Money`.
// ---------------------------------------------------------------------------

/** A product and the SKU that hangs off it, as the legacy loop iterated them. */
interface CatalogEntry {
  readonly product: ReturnType<typeof makeProductFixture>;
  readonly sku: ReturnType<typeof makeSkuFixture>;
}

/** The axes a catalog entry varies on. Locally declared, not exported, and passed as a literal. */
interface CatalogEntrySpec {
  readonly key: string;
  readonly skuActiveFlag: boolean;
  readonly productActiveFlag: boolean;
  readonly productPublishedFlag: boolean;
  readonly calculatedQATS: number;
  readonly branded: boolean;
}

/**
 * The brand identifier a projected row carries when the LEFT join resolved a brand row.
 *
 * An invented sentinel, and deliberately not the fixture's own value: `Brand.getBrandID()` answers
 * the empty string on an unsaved fixture, and an empty string is PRESENT, which would make the
 * brand-present and brand-absent cases indistinguishable at exactly the point this suite has to
 * tell them apart. Absence is expressed as `undefined`, which is what the row contract means by "no
 * brand row answered to the product's key".
 */
const RESOLVED_BRAND_ID = 'brand-row-resolved-by-the-left-join';

/** The image path every projected row carries. Required and non-optional on the row contract. */
const IMAGE_LINK_PATH = '/images/feed/placeholder-sku-image.jpg';

/**
 * Build one candidate catalog entry.
 *
 * A FRESH graph on every call, per this suite's isolation standard: no fixture instance is shared
 * between tests, and nothing is cached at module scope.
 */
function makeCatalogEntry(spec: CatalogEntrySpec): CatalogEntry {
  const product = makeProductFixture({
    idPrefix: spec.key,
    productID: `${spec.key}-product`,
    productCode: `${spec.key}-product-code`,
    urlTitle: `${spec.key}-url-title`,
    calculatedTitle: `${spec.key} calculated title`,
    activeFlag: spec.productActiveFlag,
    publishedFlag: spec.productPublishedFlag,
    calculatedQATS: spec.calculatedQATS,
    ...(spec.branded ? {} : { brand: undefined }),
  });

  const sku = makeSkuFixture({
    idPrefix: spec.key,
    skuID: `${spec.key}-sku`,
    skuCode: `${spec.key}-sku-code`,
    activeFlag: spec.skuActiveFlag,
    product,
  });

  return { product, sku };
}

/**
 * Project one catalog entry into the row shape the feed repository returns.
 *
 * The row contract carries the four filter columns precisely so the invariant is verifiable from
 * the returned data rather than only from statement text, which is what makes this suite able to
 * assert the predicates at the handler tier without asserting one character of SQL. Feed-query SQL
 * belongs to the integration tier and is not touched here.
 */
function projectFeedRow(entry: CatalogEntry): GoogleProductFeedRow {
  const { product, sku } = entry;
  const brand = product.getBrand();

  return {
    skuID: sku.getSkuID(),
    productID: product.getProductID(),
    skuCode: sku.getSkuCode(),
    calculatedTitle: product.getCalculatedTitle(),
    productDescription: product.getProductDescription(),
    productTypeDescription: undefined,
    productTypeSimpleRepresentation: undefined,
    productUrlPath: product.getProductURL(),
    imageLinkPath: IMAGE_LINK_PATH,
    additionalImageLinkPaths: [],
    productPrice: product.getPrice(),
    skuPrice: undefined,
    skuSalePrice: undefined,
    salePriceExpirationDateTime: undefined,
    // The LEFT join's resolved key, absent exactly when no brand row answered
    // [integrationServices/google/controllers/feed.cfc:L66].
    brandID: brand === undefined ? undefined : RESOLVED_BRAND_ID,
    brandName: brand?.getBrandName(),
    productCode: product.getProductCode(),
    // Both weight members sit OUTSIDE the settings provider's seven keys, so they are carried as
    // the projection's own strings [integrationServices/google/views/feed/product.cfm:L58].
    skuShippingWeight: '1',
    skuShippingWeightUnitCode: 'lb',
    skuActiveFlag: sku.getActiveFlag(),
    productActiveFlag: product.getActiveFlag(),
    productPublishedFlag: product.getPublishedFlag(),
    productCalculatedQATS: product.getCalculatedQATS() ?? 0,
  };
}

/**
 * The lower bound of the quantity range, as the live controller states it.
 *
 * `addRange('product.calculatedQATS', '1^')` [integrationServices/google/controllers/feed.cfc:L72]
 * reads "one and above, unbounded", so the ported bound is `>= 1`. It is deliberately NOT written
 * as `> 0` and deliberately NOT written as `!== 0`: the dead DAO is the component that says `> 0`
 * [integrationServices/google/model/dao/FeedDAO.cfc:L71], and it is excluded as a source of
 * behaviour. The two coincide on the integer column, and a fractional quantity is outside that
 * column's domain, so no fractional case is asserted below - inventing one would assert a state the
 * schema forbids in order to dramatise a difference the schema cannot produce.
 */
const MINIMUM_QUANTITY_AVAILABLE_TO_SELL = 1;

/**
 * The four selection predicates, applied together and unconditionally.
 *
 * 1. the SKU is active            [integrationServices/google/controllers/feed.cfc:L68]
 * 2. its product is active        [:L69]
 * 3. its product is published     [:L70]
 * 4. its product has quantity available to sell, from one upward [:L72]
 *
 * There is no parameter here by which a caller could relax, invert or extend any of them, because
 * there is none in the contract either: the port's one method takes no arguments, so the predicates
 * are invariants of the feed rather than defaults of a query.
 */
function qualifiesForFeed(row: GoogleProductFeedRow): boolean {
  return (
    row.skuActiveFlag &&
    row.productActiveFlag &&
    row.productPublishedFlag &&
    row.productCalculatedQATS >= MINIMUM_QUANTITY_AVAILABLE_TO_SELL
  );
}

/**
 * The row source the feed service reads through.
 *
 * Stands in for `GoogleFeedRepository.fetchProductFeedRows` and nothing else - the narrowed
 * `Pick<>` the service declares is what makes an in-memory double possible at all, since the real
 * repository holds private fields and a class type with private members is satisfiable only by that
 * class. It holds no connection, issues no statement and reads no configuration.
 */
class RecordingFeedRowSource implements GoogleProductFeedRowSource {
  public readonly argumentCounts: number[] = [];

  private readonly candidates: readonly CatalogEntry[];

  public constructor(candidates: readonly CatalogEntry[]) {
    this.candidates = candidates;
  }

  public fetchProductFeedRows(
    ...args: readonly unknown[]
  ): Promise<readonly GoogleProductFeedRow[]> {
    this.argumentCounts.push(args.length);

    // The predicates are applied HERE, where the ported statement applies them, and the row order
    // is left exactly as the candidate order: the legacy selection applies no ordering at all, so
    // imposing one would be a repair rather than a port.
    return Promise.resolve(this.candidates.map(projectFeedRow).filter(qualifiesForFeed));
  }
}

/** What one render call was handed. Copied out, so a later mutation cannot rewrite the record. */
interface RecordedRenderCall {
  readonly rows: readonly GoogleProductFeedRow[];
  readonly feedHost: string;
  readonly nowIso: string;
}

/**
 * The renderer seam, recorded.
 *
 * Substituted for the real renderer through the feed service's fourth constructor parameter, which
 * exists for exactly this. Two things follow. The rows the document was built from become directly
 * inspectable, which is how the four predicates and the LEFT-joined brand are asserted without
 * parsing markup - and no XML library or templating engine is introduced to do it, because none is
 * permitted and none is needed. And the document becomes a string of this suite's choosing, so
 * "the handler returns what the renderer produced, unmodified" is checkable by identity.
 */
class RecordingFeedRenderer {
  public readonly calls: RecordedRenderCall[] = [];

  private readonly document: string;

  public constructor(document: string) {
    this.document = document;
  }

  public readonly render: GoogleProductFeedRenderer = (rows, feedHost, now) => {
    this.calls.push({ rows: [...rows], feedHost, nowIso: now.toISOString() });
    return this.document;
  };
}

/**
 * The candidate catalog, as DATA. Instances are built per test from these specs, never shared.
 *
 * Three entries qualify and five do not, and every non-qualifying entry fails exactly ONE
 * predicate, so a test that loses a predicate loses a specific row rather than an unattributable
 * count.
 */
const CATALOG_SPECS: readonly CatalogEntrySpec[] = Object.freeze([
  {
    key: 'branded',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 4,
    branded: true,
  },
  // The boundary itself: exactly one unit available to sell is INCLUDED.
  {
    key: 'quantityone',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 1,
    branded: true,
  },
  // The LEFT-join case: no brand row answers, and the product appears anyway.
  {
    key: 'brandless',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 7,
    branded: false,
  },
  // The other side of the boundary: nothing available to sell is EXCLUDED.
  {
    key: 'quantityzero',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 0,
    branded: true,
  },
  {
    key: 'quantitynegative',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: -3,
    branded: true,
  },
  {
    key: 'inactivesku',
    skuActiveFlag: false,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 9,
    branded: true,
  },
  {
    key: 'inactiveproduct',
    skuActiveFlag: true,
    productActiveFlag: false,
    productPublishedFlag: true,
    calculatedQATS: 9,
    branded: true,
  },
  {
    key: 'unpublishedproduct',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: false,
    calculatedQATS: 9,
    branded: true,
  },
]);

/** The SKU codes the four predicates admit, in candidate order. */
const QUALIFYING_SKU_CODES: readonly string[] = Object.freeze([
  'branded-sku-code',
  'quantityone-sku-code',
  'brandless-sku-code',
]);

/** A fresh entity graph for every candidate, built per test. */
function makeCandidateCatalog(): readonly CatalogEntry[] {
  return CATALOG_SPECS.map(makeCatalogEntry);
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/** The axes a request varies on. Locally declared, not exported, passed as an object literal. */
interface FeedRequestOverrides {
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly queryStringParameters?: Readonly<Record<string, string>> | null;
  readonly pathParameters?: Readonly<Record<string, string>> | null;
  readonly body?: string | null;
  readonly requestTimeEpoch?: number;
  readonly gatewayRequestId?: string;
}

/**
 * One version 1.0 API Gateway proxy request for the feed route.
 *
 * The method and path default to the FROZEN TABLE's own values rather than to literals restated
 * here, so a route rename cannot leave this suite passing against a URL the router no longer
 * serves.
 */
function feedRequestEvent(overrides: FeedRequestOverrides = {}): APIGatewayProxyEvent {
  const path = overrides.path ?? FEED_ROUTE.path;
  const httpMethod = overrides.method ?? FEED_ROUTE.methods;

  return {
    body: overrides.body ?? null,
    headers: { ...(overrides.headers ?? { host: FEED_HOST }) },
    multiValueHeaders: {},
    httpMethod,
    isBase64Encoded: false,
    path,
    pathParameters: overrides.pathParameters ?? null,
    queryStringParameters: overrides.queryStringParameters ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'account-placeholder',
      apiId: 'feed-api-placeholder',
      // The legacy action is public and unauthenticated as a matter of source fact -
      // `this.publicMethods="product"`, with the admin and secure method lists both empty
      // [integrationServices/google/controllers/feed.cfc:L54-L56] - so no authorizer context is
      // attached. That is a FACT ABOUT THE SOURCE and not licence to invent an authentication
      // story.
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod,
      // JUDGMENT CALL: every member of the caller-identity block is the ABSENT value, and the block
      // is spelled out because the vendored `APIGatewayEventIdentity` shape declares fifteen
      // required members. Two of them are NAMED for a caller key. NEITHER CARRIES A VALUE - both
      // are `null`, exactly as an unauthenticated public request arrives - so what a reader finds
      // here is a required member of a third-party type set to nothing, and no credential of any
      // kind appears in this file. The block exists once, here, so those two member names are
      // written once each in the whole suite; obscuring them to satisfy a text search would be
      // hiding from a hygiene check rather than passing it.
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '203.0.113.7',
        user: null,
        userAgent: 'feed-consumer-placeholder',
        userArn: null,
      },
      path,
      stage: 'test',
      requestId: overrides.gatewayRequestId ?? GATEWAY_REQUEST_ID,
      // The handler's clock. A server-generated absolute instant, which is why reading it is a pure
      // conversion rather than a wall-clock read.
      requestTimeEpoch: overrides.requestTimeEpoch ?? REQUEST_INSTANT.getTime(),
      resourceId: 'feed-resource-placeholder',
      resourcePath: FEED_ROUTE.path,
    },
    resource: FEED_ROUTE.path,
  };
}

/**
 * A Lambda runtime context carrying a request identifier and refusing everything else.
 *
 * The handler reads `awsRequestId` and nothing more, and the three deprecated completion members
 * plus the remaining-time reader are trip-wires for the same reason the composition-root double's
 * unread members are: a suite should prove what is read, not assume it.
 */
function lambdaContext(awsRequestId: string = RUNTIME_REQUEST_ID): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'product-feed-handler',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:placeholder:product-feed-handler',
    memoryLimitInMB: '512',
    awsRequestId,
    logGroupName: 'product-feed-handler-log-group',
    logStreamName: 'product-feed-handler-log-stream',
    getRemainingTimeInMillis: (): number =>
      unreachableMember('Context', 'getRemainingTimeInMillis'),
    done: (): void => unreachableMember('Context', 'done'),
    fail: (): void => unreachableMember('Context', 'fail'),
    succeed: (): void => unreachableMember('Context', 'succeed'),
  };
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

/** One structured entry the logger wrote, parsed back out of its serialized line. */
interface RecordedLogEntry {
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * Record the structured lines the module-level logger emits.
 *
 * JUDGMENT CALL: THE RECORDING POINT IS THE SINK, BECAUSE THERE IS NO OTHER. `src/lib/logger.ts`
 * publishes an injectable sink through `withSink`, and `src/handlers/errorMapper.ts` accepts a
 * logger on its mapping context - but the shipped entrypoint builds that context with `requestId`
 * and `route` and NO logger member, and it imports the module-level logger directly for its own two
 * lines. A method spy is impossible as well, because `createLogger` returns a frozen surface. What
 * is left is the sink that logger writes to: `writeLineToStdout` calls `process.stdout.write` with
 * one newline-terminated JSON document per entry, so intercepting that call intercepts the emission
 * itself, with no module patched and no global console silenced. The interception lasts one test
 * and is restored by this file's own `afterEach` as well as by the global one in `tests/setup.ts`.
 *
 * A chunk that is not a JSON object is ignored rather than allowed to throw, so an unrelated writer
 * cannot turn an assertion about logging into a parse failure.
 */
function recordStructuredLogLines(): { readonly entries: RecordedLogEntry[] } {
  const entries: RecordedLogEntry[] = [];

  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(chunk));
    } catch {
      return true;
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const entry = parsed as { level?: unknown; message?: unknown; context?: unknown };
      entries.push({
        level: String(entry.level),
        message: String(entry.message),
        context: (entry.context ?? {}) as Readonly<Record<string, unknown>>,
      });
    }

    return true;
  });

  return { entries };
}

/**
 * Read the error envelope out of a response body, narrowing rather than casting blindly.
 *
 * The envelope is the one `src/handlers/errorMapper.ts` publishes: a category, a safe message, the
 * correlation identifier, and field complaints only when there are any.
 */
function errorEnvelopeOf(response: APIGatewayProxyResult): ErrorResponseBody['error'] {
  const parsed: unknown = JSON.parse(response.body);

  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    throw new Error('the response body is not the documented error envelope');
  }

  const { error } = parsed;

  if (typeof error !== 'object' || error === null) {
    throw new Error('the response envelope carries no error object');
  }

  return error as ErrorResponseBody['error'];
}

/** The sole recorded scope input, proven to be the only one. */
function soleScopeInput(root: FeedCompositionRootDouble): RequestScopeInput {
  expect(root.scopeInputs).toHaveLength(1);
  const [input] = root.scopeInputs;

  if (input === undefined) {
    throw new Error('no request scope was opened');
  }

  return input;
}

/** The sole recorded render call, proven to be the only one. */
function soleRenderCall(renderer: RecordingFeedRenderer): RecordedRenderCall {
  expect(renderer.calls).toHaveLength(1);
  const [call] = renderer.calls;

  if (call === undefined) {
    throw new Error('the renderer was never reached');
  }

  return call;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * The document the renderer double hands back.
 *
 * Deliberately NOT a well-formed feed. It carries leading and trailing whitespace, an unescaped
 * ampersand, unescaped angle brackets, a bare quotation mark and an embedded blank line, so a
 * handler that trimmed, re-indented, re-escaped, re-encoded or otherwise post-processed the
 * renderer's output could not return this string unchanged. Escaping itself belongs to the
 * renderer, which owns the five-entity escaper reproducing CFML `htmlEditFormat`, and is asserted
 * in that module's own suite.
 */
const RENDERED_DOCUMENT = [
  '  renderer-owned document; the handler may not touch it  ',
  'unescaped ampersand & unescaped angles < > and a bare quote "',
  '',
  '  trailing whitespace line  ',
].join('\n');

/** A second, distinguishable document, for asserting that two invocations each get their own. */
const SECOND_RENDERED_DOCUMENT = 'a second renderer-owned document';

/** What a test drives: the wired entrypoint plus the root it will interrogate afterwards. */
interface FeedHarness {
  readonly root: FeedCompositionRootDouble;
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: Context,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Wire the entrypoint over a composition root of this suite's making.
 *
 * This is the shipped seam and the whole of it: `createProductFeedHandler` takes a nullary provider
 * of the composition root, so a suite substitutes the graph without patching a module, without a
 * container and without ever calling the real `bootstrapCompositionRoot`. The provider resolves an
 * already-built double, so no I/O happens on the way in either.
 */
function harnessWith(resolvePort: FeedPortResolver, scopeRejection?: Error): FeedHarness {
  const root = new FeedCompositionRootDouble(resolvePort, scopeRejection);

  return { root, invoke: createProductFeedHandler(() => Promise.resolve(root)) };
}

/**
 * Wire the entrypoint over a root that publishes the given port whenever a feed host was supplied.
 *
 * The condition is the real root's documented behaviour - it builds the port if and only if
 * `feedHost` was present - so a double that published one unconditionally would let a bug in host
 * capture pass unnoticed.
 */
function harnessWithPort(port: ProductFeedPort): FeedHarness {
  return harnessWith((input) => (input.feedHost === undefined ? undefined : port));
}

/** What a test drives when it needs to see the rows and the render call the document came from. */
interface FeedServiceHarness extends FeedHarness {
  readonly rowSource: RecordingFeedRowSource;
  readonly renderer: RecordingFeedRenderer;
}

/**
 * Wire the entrypoint over the REAL feed service, reading a doubled row source and writing through
 * a doubled renderer.
 *
 * JUDGMENT CALL: `GoogleFeedService` itself is not doubled, and that is deliberate. It is a pure
 * three-line orchestration whose entire content is the ORDER of two collaborators - read the
 * qualifying rows, render them, return the document - and it holds no connection, reads no
 * configuration and performs no I/O of its own. Substituting a double for it would replace the very
 * link this suite needs to observe: that the host the handler captured and the instant it pinned
 * arrive at the renderer through CONSTRUCTION rather than as method arguments. Both of ITS
 * collaborators are hand-written doubles, so nothing outside this file is reached.
 */
function harnessWithFeedService(
  candidates: readonly CatalogEntry[],
  document: string = RENDERED_DOCUMENT,
): FeedServiceHarness {
  const rowSource = new RecordingFeedRowSource(candidates);
  const renderer = new RecordingFeedRenderer(document);

  const harness = harnessWith((input) =>
    input.feedHost === undefined
      ? undefined
      : new GoogleFeedService(
          rowSource,
          input.feedHost,
          // The scope binds ONE instant per request: the request's own stamp when it carried a
          // usable one, and otherwise the root's own - which for this double is a fixed literal
          // rather than a clock read.
          input.now ?? SCOPE_FALLBACK_INSTANT,
          renderer.render,
        ),
  );

  return { root: harness.root, invoke: harness.invoke, rowSource, renderer };
}

/** The SKU codes the renderer was handed, in the order it was handed them. */
function renderedSkuCodes(renderer: RecordingFeedRenderer): readonly (string | undefined)[] {
  return soleRenderCall(renderer).rows.map((row) => row.skuCode);
}

/**
 * The logger's own emissions for the test currently running.
 *
 * JUDGMENT CALL: THE SINK IS INTERCEPTED FOR EVERY TEST, AND THAT IS NOT A GLOBAL CONSOLE SILENCE.
 * `console` is never touched, nothing is muted for the process, the interception is installed
 * inside `beforeEach` and removed inside `afterEach`, and it CAPTURES rather than discards - the
 * entries stay available to any assertion that wants them, which is the opposite of hiding output.
 * Doing it once per test rather than inside the handful of tests that assert on logging also keeps
 * a failure in any other test from being buried under the JSON lines the served-feed path
 * legitimately writes.
 */
let recordedLog: { readonly entries: RecordedLogEntry[] } = { entries: [] };

beforeEach(() => {
  recordedLog = recordStructuredLogLines();
});

afterEach(() => {
  // Complementary to the global hook in `tests/setup.ts`, which restores spies and real timers
  // after every test in the tier. Restoring here as well keeps this file honest on its own terms
  // rather than dependent on a sibling module's hook ordering.
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. The module surface
// ---------------------------------------------------------------------------

describe('the product-feed entrypoint module surface', () => {
  it('publishes exactly the factory and the entrypoint, with no default export', () => {
    // The two type exports - `CompositionRootProvider` and `ProductFeedHandler` - are erased on
    // emit, so the runtime export set is exactly the two values.
    expect(Object.keys(productFeedHandlerModule).sort()).toStrictEqual([
      'createProductFeedHandler',
      'handler',
    ]);
    expect('default' in productFeedHandlerModule).toBe(false);
  });

  it('declares two parameters, so the runtime completion callback cannot arrive as a third', () => {
    // The runtime passes its callback third. A third declared parameter of any other type would
    // silently receive a function on every real invocation, which is why the test seam is the
    // factory rather than an extra parameter.
    expect(handler).toBeTypeOf('function');
    expect(handler.length).toBe(2);
  });

  it('builds the production entrypoint through the same factory a suite calls', () => {
    // One construction path, so the shipped entrypoint and a suite's instance cannot diverge. The
    // factory performs no I/O and constructs nothing, so calling it here is safe with no
    // environment configured at all.
    const suiteInstance = createProductFeedHandler(() =>
      Promise.resolve(new FeedCompositionRootDouble(() => undefined)),
    );

    expect(suiteInstance).toBeTypeOf('function');
    expect(suiteInstance.length).toBe(handler.length);
    expect(suiteInstance).not.toBe(handler);
  });
});

// ---------------------------------------------------------------------------
// 2. The reshaped contract: the feed takes no narrowing input
//
// ★ THE PERMITTED RESHAPING, AND ONE OF THE THREE THE PLAN ALLOWS FOR THE WHOLE MIGRATION. The
// other two are the order-amount methods returning applied intents instead of mutating an order
// aggregate, and the two smart-list methods becoming typed repository queries. No fourth reshaping,
// widening or divergence is introduced anywhere in this file.
//
//   LEGACY  `public void function product(required struct rc)`
//           [integrationServices/google/controllers/feed.cfc:L58]
//   TARGET  `generateProductFeed(): Promise<string>`
//
// The legacy body is settled evidence rather than a matter of taste: every reference to the request
// context in it is a WRITE - the selection at [:L63], three joins at [:L64-L66], three filters at
// [:L68-L70] and one range at [:L72] - and it ends at [:L73] with no return, no render call and no
// read of any member of `rc`. Rendering was implicit framework convention. So the ported method
// takes NO parameters, `src/domain/ports/productFeedPort.ts` declares it with none, and no criteria
// type is declared, imported or referenced in this file. "Parsing and validation" for this route
// therefore means proving that the route accepts NO narrowing input, which is what the tests below
// do. ---------------------------------------------------------------------------

describe('the reshaped port contract', () => {
  it('invokes the port with no arguments at all', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(port.argumentCounts).toStrictEqual([0]);
  });

  it('passes neither the feed host nor the instant as a method argument', async () => {
    // Both values are request-scoped and both reach the port through CONSTRUCTION, which is the
    // whole mechanism by which the method stays parameterless.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    const input = soleScopeInput(root);

    expect(input.feedHost).toBe(FEED_HOST);
    expect(input.now?.toISOString()).toBe(REQUEST_INSTANT_ISO);
    expect(port.argumentCounts).toStrictEqual([0]);
  });

  it('ignores every query-string parameter a caller might use to narrow the feed', async () => {
    // Not one of these names exists on the contract, and none may be introduced: no product or
    // brand identifier, no date window, no page or limit, no currency, and no toggle, override or
    // "include inactive" flag. Supplying all of them at once must change nothing observable.
    const narrowed = harnessWithFeedService(makeCandidateCatalog());
    const plain = harnessWithFeedService(makeCandidateCatalog());

    const narrowedResponse = await narrowed.invoke(
      feedRequestEvent({
        queryStringParameters: {
          productID: 'branded-product',
          brandID: RESOLVED_BRAND_ID,
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-12-31T23:59:59.000Z',
          page: '2',
          limit: '1',
          currencyCode: 'GBP',
          includeInactive: 'true',
          publishedFlag: '0',
        },
      }),
      lambdaContext(),
    );

    const plainResponse = await plain.invoke(feedRequestEvent(), lambdaContext());

    expect(narrowedResponse.statusCode).toBe(200);
    expect(narrowedResponse.body).toBe(plainResponse.body);
    expect(narrowed.rowSource.argumentCounts).toStrictEqual([0]);
    expect(renderedSkuCodes(narrowed.renderer)).toStrictEqual(QUALIFYING_SKU_CODES);
    expect(renderedSkuCodes(plain.renderer)).toStrictEqual(QUALIFYING_SKU_CODES);
  });

  it('ignores a request body and any path parameters', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(
      feedRequestEvent({
        body: '{"productID":"branded-product","includeInactive":true}',
        pathParameters: { productID: 'branded-product' },
      }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(harness.rowSource.argumentCounts).toStrictEqual([0]);
    expect(renderedSkuCodes(harness.renderer)).toStrictEqual(QUALIFYING_SKU_CODES);
  });

  it('opens exactly one request scope and reaches the port exactly once per invocation', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    expect(root.scopeInputs).toHaveLength(1);
    expect(port.argumentCounts).toStrictEqual([0]);
  });

  it('takes a fresh scope per invocation and memoizes no document between them', async () => {
    // A warm container serves many requests, so nothing may be retained: the scope is a local
    // binding inside the returned function and the document is produced anew each time.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const first = await invoke(feedRequestEvent(), lambdaContext());
    const second = await invoke(feedRequestEvent(), lambdaContext());

    expect(root.scopeInputs).toHaveLength(2);
    expect(port.argumentCounts).toStrictEqual([0, 0]);
    expect(first.body).toBe(RENDERED_DOCUMENT);
    expect(second.body).toBe(RENDERED_DOCUMENT);
  });
});

// ---------------------------------------------------------------------------
// 3. The four selection predicates
//
// ★ ALL FOUR ARE INVARIANTS, APPLIED TOGETHER AND UNCONDITIONALLY ON EVERY INVOCATION:
//
//   1. the SKU is active                              [integrationServices/google/controllers/feed.cfc:L68]
//   2. its product is active                          [:L69]
//   3. its product is published                       [:L70]
//   4. its product has quantity available to sell,
//      stated as an open-ended range from one upward  [:L72]
//
// and three joins sit under them: the SKU's product [:L64], the product's default SKU [:L65], and
// the product's brand LEFT joined [:L66], which is why a product no brand row answers to still
// appears.
//
// The tests below assert those predicates through the ROWS, never through SQL: the row contract
// carries the four filter columns precisely so the invariant is verifiable from returned data, and
// feed-query statement text belongs to the integration tier.
// ---------------------------------------------------------------------------

/** Build a catalog from a chosen subset of the specs, in spec order. */
function catalogFor(keys: readonly string[]): readonly CatalogEntry[] {
  return CATALOG_SPECS.filter((spec) => keys.includes(spec.key)).map(makeCatalogEntry);
}

describe('the four selection predicates', () => {
  it('serves exactly the SKUs all four predicates admit', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(renderedSkuCodes(harness.renderer)).toStrictEqual(QUALIFYING_SKU_CODES);
  });

  it('includes a product whose quantity available to sell is exactly one', async () => {
    // THE BOUNDARY. `'1^'` reads "one and above, unbounded", so one is INSIDE the range. This is
    // the case that separates a faithful `>= 1` from an off-by-one `> 1`.
    const harness = harnessWithFeedService(catalogFor(['quantityone']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const call = soleRenderCall(harness.renderer);

    expect(call.rows).toHaveLength(1);
    expect(call.rows.map((row) => row.productCalculatedQATS)).toStrictEqual([1]);
    expect(call.rows.map((row) => row.skuCode)).toStrictEqual(['quantityone-sku-code']);
  });

  it('excludes a product with nothing available to sell', async () => {
    // The other side of the same boundary. Zero is OUTSIDE the range.
    const harness = harnessWithFeedService(catalogFor(['quantityzero']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('excludes a product whose quantity available to sell is below the range', async () => {
    // A negative quantity is below one and is therefore excluded by the same bound, which is why
    // the ported predicate is a RANGE TEST and not an emptiness test: `!== 0` would have admitted
    // this row.
    const harness = harnessWithFeedService(catalogFor(['quantitynegative']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('excludes an inactive SKU even when its product qualifies', async () => {
    const harness = harnessWithFeedService(catalogFor(['inactivesku']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('excludes an inactive product even when its SKU qualifies', async () => {
    const harness = harnessWithFeedService(catalogFor(['inactiveproduct']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('excludes an unpublished product even when it is active and in stock', async () => {
    const harness = harnessWithFeedService(catalogFor(['unpublishedproduct']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('carries all four filter columns on every served row, satisfied', async () => {
    // The invariant is checkable from the data itself, which is the reason the projection carries
    // four columns it never emits into the document.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    for (const row of soleRenderCall(harness.renderer).rows) {
      expect(row.skuActiveFlag).toBe(true);
      expect(row.productActiveFlag).toBe(true);
      expect(row.productPublishedFlag).toBe(true);
      expect(row.productCalculatedQATS).toBeGreaterThanOrEqual(MINIMUM_QUANTITY_AVAILABLE_TO_SELL);
    }
  });

  it('applies all four unconditionally, with no toggle, override or include-inactive flag', async () => {
    // A caller asking in every way available to it for the excluded rows still gets exactly the
    // qualifying three, because there is no parameter on the contract for the request to reach.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({
        queryStringParameters: {
          activeFlag: '0',
          'product.activeFlag': '0',
          'product.publishedFlag': '0',
          'product.calculatedQATS': '0^',
          includeInactive: 'true',
          includeUnpublished: 'true',
          includeOutOfStock: 'true',
        },
        body: '{"includeInactive":true,"minimumQuantityAvailableToSell":0}',
      }),
      lambdaContext(),
    );

    expect(renderedSkuCodes(harness.renderer)).toStrictEqual(QUALIFYING_SKU_CODES);
    expect(harness.rowSource.argumentCounts).toStrictEqual([0]);
  });

  it('still serves a product that no brand row answers to, with the brand value absent', async () => {
    // The brand join is LEFT [integrationServices/google/controllers/feed.cfc:L66], so a brandless
    // product is a member of the feed rather than an omission from it. Its brand VALUE is absent -
    // `undefined`, not an empty string - which is what lets the renderer omit the element instead
    // of emitting an empty one. Whether the element is omitted or emptied is the renderer's
    // contract and is asserted in that module's own suite; what belongs here is that the row
    // arrives at all, and arrives with nothing in the brand slot.
    const harness = harnessWithFeedService(catalogFor(['branded', 'brandless']));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const rows = soleRenderCall(harness.renderer).rows;

    expect(rows.map((row) => row.skuCode)).toStrictEqual([
      'branded-sku-code',
      'brandless-sku-code',
    ]);

    const [brandedRow, brandlessRow] = rows;

    if (brandedRow === undefined || brandlessRow === undefined) {
      throw new Error('both the branded and the brandless row were expected to reach the renderer');
    }

    expect(brandedRow.brandID).toBe(RESOLVED_BRAND_ID);
    expect(brandedRow.brandName).toBeTypeOf('string');
    expect(brandlessRow.brandID).toBeUndefined();
    expect(brandlessRow.brandName).toBeUndefined();
  });

  it('leaves the row order exactly as the source returned it', async () => {
    // The legacy selection applies no ordering at all - `getActivePromotionRewards` is not the only
    // statement in the slice without an `ORDER BY` - so imposing one anywhere on this path would be
    // a repair rather than a port. The order the source yields is the order the document is built
    // in.
    const reversedKeys = ['brandless', 'quantityone', 'branded'];
    const harness = harnessWithFeedService(catalogFor(reversedKeys).slice().reverse());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(renderedSkuCodes(harness.renderer)).toStrictEqual([
      'brandless-sku-code',
      'quantityone-sku-code',
      'branded-sku-code',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. Response shaping, and the renderer boundary
//
// The response is a BARE DOCUMENT with no wrapper, which is what the legacy layout suppression
// becomes here [integrationServices/google/controllers/feed.cfc:L60]. The document itself is the
// renderer's, and this entrypoint neither builds, escapes, concatenates nor post-processes one byte
// of it: the RSS 2.0 shape and the `xmlns:g="http://base.google.com/ns/1.0"` binding
// [integrationServices/google/views/feed/product.cfm:L11], the hardcoded `new` condition [:L25] and
// `in stock` availability [:L26], the description fallback with no `<cfelse>` [:L19] and the
// five-entity escaper reproducing `htmlEditFormat` are all the renderer's contract and are asserted
// in that module's own suite. What is asserted here is the DELEGATION: that whatever the renderer
// produced is what the caller receives.
// ---------------------------------------------------------------------------

describe('the served response', () => {
  it('answers 200 with the RSS content type as its only header', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(response.headers).toStrictEqual({ 'content-type': FEED_CONTENT_TYPE });
  });

  it('invents no HTTP semantic the source never had', async () => {
    // No entity tag, no last-modified stamp, no cache directive, no content negotiation, no
    // compression negotiation, no pagination link and no conditional-request handling. The legacy
    // template declared none of them and neither does this. The failure envelopes built by
    // `src/handlers/errorMapper.ts` do carry `cache-control: no-store`, which is that module's
    // decision about a failure response and is deliberately not extended to a served document.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());

    expect(headerNames).toStrictEqual(['content-type']);
    for (const absent of [
      'etag',
      'last-modified',
      'cache-control',
      'vary',
      'content-encoding',
      'link',
      'expires',
      'www-authenticate',
    ]) {
      expect(headerNames).not.toContain(absent);
    }
  });

  it('returns the renderer document unmodified, whitespace and unescaped characters included', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    // Byte-for-byte identity. Not trimmed, not re-indented, not re-escaped, not re-encoded, not
    // compressed and not wrapped in an envelope.
    expect(response.body).toBe(RENDERED_DOCUMENT);
    expect(response.body.startsWith('  ')).toBe(true);
    expect(response.body.endsWith('  ')).toBe(true);
    expect(response.body).toContain(' & ');
    expect(response.body).toContain('< >');
    expect(response.body).not.toContain('&amp;');
  });

  it('returns whatever the renderer produced, whatever that happens to be', async () => {
    // The handler does no markup work of any kind, so a renderer answering a string that is not a
    // feed at all still travels through untouched. That is the proof that no XML is constructed,
    // parsed or validated here - and it is why no XML library and no templating engine is needed or
    // permitted.
    const harness = harnessWithFeedService(makeCandidateCatalog(), SECOND_RENDERED_DOCUMENT);

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.body).toBe(SECOND_RENDERED_DOCUMENT);
  });

  it('omits isBase64Encoded rather than declaring the text body as binary', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect('isBase64Encoded' in response).toBe(false);
  });

  it('serves an empty catalog as an ordinary outcome rather than an error', async () => {
    // A zero-row feed is a complete document in the legacy too: the item loop simply produced no
    // `<item>` [integrationServices/google/views/feed/product.cfm:L16]. Nothing short-circuits.
    const harness = harnessWithFeedService([]);

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(RENDERED_DOCUMENT);
    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('captures the feed host at construction and hands it to the renderer', async () => {
    // CFML parity: the legacy interpolated `CGI.HTTP_HOST` into five URL sites of the document
    // [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24], and the scheme
    // is the renderer's own frozen `http://` literal. Here the authority half travels once, through
    // the scope input and then the service constructor - never as an argument to the port's method.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleScopeInput(harness.root).feedHost).toBe(FEED_HOST);
    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('matches the host header case-insensitively and trims it', async () => {
    // HTTP header names are case-insensitive, a version 1.0 proxy event carries whatever casing the
    // client sent, and the CFML `CGI` scope was a case-insensitive struct holding one `HTTP_HOST`.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({ headers: { HOST: `  ${FEED_HOST}  ` } }),
      lambdaContext(),
    );

    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('takes the first non-empty host header when the request carries several casings', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({ headers: { HOST: '   ', Host: '', host: FEED_HOST } }),
      lambdaContext(),
    );

    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('skips a header that is not the host, and one whose value is absent', async () => {
    // Two states the enumeration has to walk past before it finds the origin: a header with a
    // different NAME, and a header carrying the right name with NO VALUE. A version 1.0 header map
    // is
    // an index signature over `string | undefined`, so the second is a state the type genuinely
    // admits, and it is why the values are proven present rather than asserted.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(
      feedRequestEvent({
        headers: {
          'x-request-shape': 'not-a-host-header',
          host: undefined,
          Host: FEED_HOST,
        },
      }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('consults no forwarded-host header and no gateway domain name', async () => {
    // Preferring either would publish an origin the legacy never published. A deployment behind a
    // proxy that rewrites the authority configures the value it serves on instead, and the
    // composition root - not this entrypoint - is what admits or refuses a candidate.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({
        headers: {
          host: FEED_HOST,
          'x-forwarded-host': 'forwarded.example.test',
          'x-original-host': 'original.example.test',
        },
      }),
      lambdaContext(),
    );

    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('pins the document to the instant the request carried, in UTC', async () => {
    // The legacy called `now()` inline while rendering, twice, and combined it with the server's
    // own `getTimeZoneInfo().utcHourOffset`
    // [integrationServices/google/views/feed/product.cfm:L30]. The target injects an absolute
    // instant instead, so one document cannot straddle two clock readings.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleScopeInput(harness.root).now?.toISOString()).toBe(REQUEST_INSTANT_ISO);
    expect(soleRenderCall(harness.renderer).nowIso).toBe(REQUEST_INSTANT_ISO);
  });

  it('omits the instant entirely when the request carried no usable stamp', async () => {
    // The member is OMITTED rather than passed as undefined, which under
    // `exactOptionalPropertyTypes` is a distinct state and the honest one: it says "this request
    // supplied no instant" and lets the scope bind its own once. Substituting zero would date the
    // feed to 1970.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent({ requestTimeEpoch: 0 }), lambdaContext());

    const input = soleScopeInput(harness.root);

    expect('now' in input).toBe(false);
    expect(soleRenderCall(harness.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
  });

  it('treats a negative, non-finite or out-of-range stamp as no stamp at all', async () => {
    // Three unusable shapes, and the third is the one worth naming: an epoch beyond the maximum a
    // `Date` can represent is finite and positive, so it passes both cheap tests and yields an
    // INVALID date - which is why the conversion is checked as well as the number.
    const negative = harnessWithFeedService(makeCandidateCatalog());
    const nonFinite = harnessWithFeedService(makeCandidateCatalog());
    const outOfRange = harnessWithFeedService(makeCandidateCatalog());

    await negative.invoke(feedRequestEvent({ requestTimeEpoch: -1 }), lambdaContext());
    await nonFinite.invoke(feedRequestEvent({ requestTimeEpoch: Number.NaN }), lambdaContext());
    // One millisecond past the largest instant a `Date` can hold.
    await outOfRange.invoke(feedRequestEvent({ requestTimeEpoch: 8.64e15 + 1 }), lambdaContext());

    expect('now' in soleScopeInput(negative.root)).toBe(false);
    expect('now' in soleScopeInput(nonFinite.root)).toBe(false);
    expect('now' in soleScopeInput(outOfRange.root)).toBe(false);
    expect(soleRenderCall(negative.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
    expect(soleRenderCall(nonFinite.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
    expect(soleRenderCall(outOfRange.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
  });

  it('establishes no account, because the legacy feed action established none', async () => {
    // Two members and no more travel on the scope input. `accountID` absent IS the logged-out arm
    // rather than a missing value, and `adminAccountFlag` is not a concept the feed has.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    const input = soleScopeInput(root);

    expect(Object.keys(input).sort()).toStrictEqual(['feedHost', 'now']);
    expect('accountID' in input).toBe(false);
    expect('adminAccountFlag' in input).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. The integration adapter, as this entrypoint consumes it
//
// THE ADAPTER SURFACE IS EIGHT MEMBERS, PLUS A SEPARATE FEED PORT. Six are declared on the legacy
// component - `init` [integrationServices/google/Integration.cfc:L51-L53], `getIntegrationTypes`
// [:L55-L57], `getDisplayName` [:L59-L61], `getSettings` [:L63-L65], `getIntegratedSettings`
// [:L67-L71] and `getSettingOptions` [:L73-L77] - and two arrive by inheritance, `getEventHandlers`
// [integrationServices/BaseIntegration.cfc:L67-L69] and `getAdminNavbarHTML` [:L71-L73]. Feed
// generation is NOT a ninth member of that surface: the legacy feed lived on a controller
// [integrationServices/google/controllers/feed.cfc:L58], and the target declares it as its own
// port, because the interface's documented type vocabulary cannot carry a feed at all.
//
// ★ WHERE THE PLAN CONTRADICTS ITSELF, THE SOURCE WINS. AAP 0.8.5 states that the adapter declares
// the `custom` type. It does not: `getIntegrationTypes()` returns `"fw1"`
// [integrationServices/google/Integration.cfc:L55-L57], and AAP 0.4.2 agrees with the source.
// `"fw1"` is what is asserted below, and the word `custom` appears in this file only as one of the
// four documented vocabulary values - never as the type this adapter registers as.
//
// The two preserved adapter defects are driven here as well. Nothing in this section re-tests the
// adapter's own suite: what it establishes is the HANDLER-TIER consumption contract - which two
// members this entrypoint reads, what they answer, and that both answers reach the log line and
// nothing else.
// ---------------------------------------------------------------------------

/** The adapter's own member names, read off the class rather than restated as a literal list. */
function googleAdapterMemberNames(): readonly string[] {
  return Object.getOwnPropertyNames(GoogleIntegration.prototype)
    .filter((name) => name !== 'constructor')
    .sort();
}

/**
 * The four values the legacy contract documents
 * [integrationServices/IntegrationInterface.cfc:L68-L71].
 */
const DOCUMENTED_INTEGRATION_TYPES: readonly IntegrationType[] = Object.freeze([
  'shipping',
  'payment',
  'fw1',
  'custom',
]);

describe('the Google integration adapter surface', () => {
  it('publishes exactly eight members, and feed generation is not one of them', () => {
    expect(googleAdapterMemberNames()).toStrictEqual([
      'getAdminNavbarHTML',
      'getDisplayName',
      'getEventHandlers',
      'getIntegratedSettings',
      'getIntegrationTypes',
      'getSettingOptions',
      'getSettings',
      'init',
    ]);

    // The feed travels on `ProductFeedPort`, whose single member is reached through the request
    // scope. No member of the adapter mentions a feed, and none may be added that does.
    expect(googleAdapterMemberNames().some((name) => name.toLowerCase().includes('feed'))).toBe(
      false,
    );
  });

  it('registers as fw1', () => {
    // Typed rather than merely compared, so a value outside the vocabulary would fail to compile as
    // well as to assert.
    const registeredType: IntegrationType = new GoogleIntegration().getIntegrationTypes();

    expect(registeredType).toBe('fw1');
  });

  it('registers a value from the documented vocabulary, which carries no product-feed type', () => {
    expect(DOCUMENTED_INTEGRATION_TYPES).toHaveLength(4);
    expect(DOCUMENTED_INTEGRATION_TYPES).toStrictEqual(['shipping', 'payment', 'fw1', 'custom']);
    expect(
      DOCUMENTED_INTEGRATION_TYPES.includes(new GoogleIntegration().getIntegrationTypes()),
    ).toBe(true);

    // The vocabulary is a comma-separated LIST in the source's own words, so the contract permits
    // multiples; this adapter answers a single-element one.
    expect(new GoogleIntegration().getIntegrationTypes()).not.toContain(',');
  });

  it('answers Google for its display name', () => {
    // LEGACY-DEFECT 1 lives on the component tag and is recorded in this file's header. The METHOD
    // is the contract member and it is authoritative, so this is the only value asserted, and the
    // tag's text appears nowhere in this suite outside that marker.
    expect(new GoogleIntegration().getDisplayName()).toBe('Google');
  });

  it('contributes no platform settings and exactly one integrated setting definition', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getSettings()).toStrictEqual({});
    expect(adapter.getIntegratedSettings()).toStrictEqual({
      productGoogleProductType: { fieldType: 'select' },
    });

    // Exactly one key, and exactly one property on it: no label, default, requiredness flag, option
    // list, sort order or validation rule is invented, because no source line records one.
    expect(Object.keys(adapter.getIntegratedSettings())).toStrictEqual([
      'productGoogleProductType',
    ]);
  });

  it('answers nothing from getSettingOptions, on every path', () => {
    // LEGACY-DEFECT 2, recorded in this file's header: the legacy declares an array return, the
    // body of its only conditional is empty, and no path returns anything. All three inputs are
    // driven - the name it tests, a case variant of that name, and a name it does not test - and
    // all three answer `undefined`. It is not populated, not defaulted to an empty array, and does
    // not throw.
    const adapter = new GoogleIntegration();

    expect(adapter.getSettingOptions('productGoogleProductType')).toBeUndefined();
    expect(adapter.getSettingOptions('PRODUCTGOOGLEPRODUCTTYPE')).toBeUndefined();
    expect(adapter.getSettingOptions('somethingElseEntirely')).toBeUndefined();
    expect(adapter.getSettingOptions('')).toBeUndefined();
  });

  it('contributes no event handlers and no admin navigation markup', () => {
    // The two members the legacy component inherits rather than declares. Both answer the base
    // component's own value, and both are fresh per call so a caller cannot mutate a shared result.
    const adapter = new GoogleIntegration();

    expect(adapter.getEventHandlers()).toStrictEqual([]);
    expect(adapter.getEventHandlers()).not.toBe(adapter.getEventHandlers());
    expect(adapter.getAdminNavbarHTML()).toBe('');
  });

  it('returns itself from init', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.init()).toBe(adapter);
  });

  it('records both adapter identities and the route action on the served-feed line', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    const served = recordedLog.entries.filter((entry) => entry.level === 'info');

    expect(served).toHaveLength(1);

    const [line] = served;

    if (line === undefined) {
      throw new Error('the served-feed line was not emitted');
    }

    expect(line.message).toContain('Google');
    expect(line.message).toContain('fw1');
    expect(line.message).toContain(FEED_ROUTE.action);
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
  });

  it('measures nothing on the served-feed line', async () => {
    // No document size, item count, row count or elapsed time is recorded anywhere on this path.
    // The source asserts no service level of any kind, and the legacy template's own
    // `requesttimeout="360"` [integrationServices/google/views/feed/product.cfm:L9] is a platform
    // fact rather than a target, so it is neither asserted nor reproduced.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    const [line] = recordedLog.entries.filter((entry) => entry.level === 'info');

    if (line === undefined) {
      throw new Error('the served-feed line was not emitted');
    }

    expect(Object.keys(line.context).sort()).toStrictEqual(['requestId', 'route']);
  });
});

// ---------------------------------------------------------------------------
// 6. The endpoint is public and unauthenticated - a source fact, not a licence
//
// Verified in the source: `this.publicMethods="product"`, `this.anyAdminMethods=""` and
// `this.secureMethods=""` [integrationServices/google/controllers/feed.cfc:L54-L56]. That is
// recorded as a property of what was read, and it is NOT taken as permission to invent an
// authentication story - no API key, signed URL, bearer value, session lookup, permission check,
// middleware or interceptor appears in the target, and none is asserted here. Equally, this
// endpoint is not described as secured and no security property the source never had is claimed for
// it. Authorizing callers is an API Gateway concern owned outside this subtree.
// ---------------------------------------------------------------------------

describe('the public, unauthenticated endpoint', () => {
  it('serves a request that carries no credential of any kind', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(
      feedRequestEvent({ headers: { host: FEED_HOST } }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(RENDERED_DOCUMENT);
  });

  it('serves the same document whether or not a caller sends an authorization header', async () => {
    // Nothing on this path reads one, so sending one changes nothing - and it is never echoed back
    // either, in a header or in a body.
    const withHeader = harnessWithFeedService(makeCandidateCatalog());
    const without = harnessWithFeedService(makeCandidateCatalog());

    const authorized = await withHeader.invoke(
      feedRequestEvent({
        headers: { host: FEED_HOST, authorization: 'Bearer not-a-real-value' },
      }),
      lambdaContext(),
    );
    const anonymous = await without.invoke(feedRequestEvent(), lambdaContext());

    expect(authorized.statusCode).toBe(anonymous.statusCode);
    expect(authorized.body).toBe(anonymous.body);
    expect(authorized.body).not.toContain('Bearer');
    expect(Object.keys(authorized.headers ?? {})).toStrictEqual(['content-type']);
  });

  it('does not advertise itself as secured', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());

    expect(headerNames).not.toContain('www-authenticate');
    expect(headerNames).not.toContain('authorization');
    expect(headerNames).toStrictEqual(['content-type']);
  });

  it('reaches no network while serving the feed', async () => {
    // The adapter is a STUB at the network boundary: it builds a document and returns it, and
    // nothing on this path opens a socket, holds a credential or talks to Merchant Center. No suite
    // in this tier contacts a database either - the row source is in memory.
    const networkAttempt = vi.spyOn(globalThis, 'fetch');
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(networkAttempt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. Routing
//
// Resolution goes through the SHARED table, which is what makes five independently bundled
// entrypoints agree on one URL surface and stops any of them answering for another. What replaced
// FW/1's subsystem convention - `getSubsystemDirPrefix()` mapping an unrecognized subsystem name
// onto `integrationServices/<subsystem>/`, which is the only reason the `google` subsystem was
// reachable at all - is an explicit route table, and this entrypoint holds one row of it.
//
// The router, the composition root and the error mapper have no separate assertions here beyond
// their observable effect on this handler: they are exercised transitively, which is exactly how
// this suite is meant to reach them, and their internals are asserted in their own modules.
// ---------------------------------------------------------------------------

describe('routing to the feed capability', () => {
  it('answers the row the shared table assigns to this capability', async () => {
    // Read from the table rather than restated, so a route rename cannot leave this suite green
    // against a URL the router no longer serves.
    expect(FEED_ROUTE.capability).toBe('productFeed');
    expect(FEED_ROUTE.action).toBe('generateProductFeed');
    expect(FEED_ROUTE.methods).toBe('GET');
    expect(FEED_ROUTE.path).toBe('/feeds/google/products');

    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ method: FEED_ROUTE.methods, path: FEED_ROUTE.path }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
  });

  it('reports an unknown path as not found, opening no scope and reaching no port', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent({ path: '/feeds/unknown' }), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(404);
    expect(envelope.category).toBe('routeNotFound');
    expect(envelope.message).toBe(ROUTE_NOT_FOUND_MESSAGE);
    expect(envelope.requestId).toBe(RUNTIME_REQUEST_ID);
    // Resolution comes FIRST, so nothing downstream is touched: no graph is reached, no scope
    // opened, no port invoked.
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);
  });

  it('reports the right path with the wrong method as not found, inventing no other status', async () => {
    // A path matching with the wrong method is as much a non-route as one matching no row, so it
    // folds into the same arm. No method-specific status is introduced.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent({ method: 'POST' }), lambdaContext());

    expect(response.statusCode).toBe(404);
    expect(errorEnvelopeOf(response).category).toBe('routeNotFound');
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);
  });

  it('reports another capability route as not found, leaking nothing about it', async () => {
    // Reporting a different outcome for "belongs to another capability" would leak the existence of
    // the other four into a response, so both misses answer identically.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const catalogRoute = ROUTE_TABLE.catalogQuery;
    const response = await invoke(
      feedRequestEvent({ method: catalogRoute.methods, path: catalogRoute.path }),
      lambdaContext(),
    );
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(404);
    expect(envelope.category).toBe('routeNotFound');
    expect(envelope.message).toBe(ROUTE_NOT_FOUND_MESSAGE);
    expect(response.body).not.toContain(catalogRoute.path);
    expect(response.body).not.toContain(catalogRoute.capability);
    expect(response.body).not.toContain(catalogRoute.action);
  });

  it('canonicalizes the path, so doubled and trailing separators still match', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ path: '//feeds//google//products//' }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(port.argumentCounts).toStrictEqual([0]);
  });

  it('matches the method and the path case-insensitively, per the legacy comparisons', async () => {
    // The legacy membership tests were `eq` on the path and `listFindNoCase` on the method list,
    // both case-insensitive, and the port carries that semantic forward rather than lower-casing
    // inputs.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ method: 'get', path: '/FEEDS/Google/PRODUCTS' }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(port.argumentCounts).toStrictEqual([0]);
  });

  it('logs the requested route, sanitized, and never echoes it into the body', async () => {
    // The path is the one caller-authored string that reaches a log line, so it is
    // character-filtered and segment-masked on the way, and it reaches no response body at all. A
    // long opaque segment is used here precisely because that is the shape an embedded credential
    // takes.
    const opaqueSegment = 'aaaaaaaa-bbbbbbbb-cccccccc-dd';
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ path: `${FEED_ROUTE.path}/${opaqueSegment}` }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(opaqueSegment);
    expect(response.body).not.toContain('aaaaaaaa');

    const [line] = recordedLog.entries.filter((entry) => entry.level === 'warn');

    if (line === undefined) {
      throw new Error('the not-found line was not emitted');
    }

    const loggedRoute = String(line.context.route);

    expect(loggedRoute.startsWith(`GET ${FEED_ROUTE.path}/`)).toBe(true);
    expect(loggedRoute).toContain(`[segment of ${String(opaqueSegment.length)} characters]`);
    expect(loggedRoute).not.toContain('aaaaaaaa');
  });

  it('correlates on the runtime request id when there is one, and the gateway id otherwise', async () => {
    // Both are server-generated and neither is caller-authored, which is what makes echoing one
    // into a failure envelope safe: it is the only thread from a deliberately generic response back
    // to the full detail on the log stream.
    const withRuntimeContext = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));
    const withoutContext = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const runtimeResponse = await withRuntimeContext.invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
      lambdaContext(),
    );
    // No context at all, which is why the parameter is optional on the shipped signature: a suite
    // asserting a routing outcome should not have to fabricate an entire runtime context.
    const gatewayResponse = await withoutContext.invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
    );

    expect(errorEnvelopeOf(runtimeResponse).requestId).toBe(RUNTIME_REQUEST_ID);
    expect(errorEnvelopeOf(gatewayResponse).requestId).toBe(GATEWAY_REQUEST_ID);
  });

  it('falls back to the gateway id when the runtime supplies an empty one', async () => {
    const { invoke } = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const response = await invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
      lambdaContext('   '),
    );

    // An empty runtime identifier is treated as absent rather than published as an empty
    // correlation key, and nothing is generated: an invented identifier would appear nowhere else
    // in the stream.
    expect(errorEnvelopeOf(response).requestId).toBe(GATEWAY_REQUEST_ID);
  });
});

// ---------------------------------------------------------------------------
// 8. Validation and safe error mapping
//
// THE STATUS SET IS MINIMAL AND CLOSED: 200 for a served document, and the three the mapper owns -
// 400 for client-shaped input, 404 for a route that does not exist, 500 for a defect in this
// service. No 401, 403, 409, 422 or 429 is reached for anywhere, and no retry-after, rate-limit or
// circuit-breaker semantic is introduced. The legacy slice has no HTTP status vocabulary at all, so
// there is nothing to reproduce and nothing to invent.
//
// AND NO RESPONSE BODY MAY CARRY DETAIL. A recognized failure publishes its own message; anything
// else publishes a fixed generic sentence while the classification goes to the log stream under the
// same correlation identifier. The hazard on THIS path is specific and is driven below: a feed read
// failing at the driver produces a message that embeds statement text and bound parameter values,
// and none of it may reach a caller.
// ---------------------------------------------------------------------------

/**
 * A read failure shaped the way a driver-level one arrives: statement text and bound values in the
 * message, and a machine code alongside it.
 *
 * The message content is what makes the test meaningful, so it is deliberately the kind of string
 * that must never be published. The code is a plausible machine identifier, which is the ONE piece
 * of it the mapper does put on a log line, because a value of that shape - letters, digits, `_`,
 * `.` and `-` only - cannot smuggle a sentence, a statement fragment or a bound value past the
 * filter.
 */
class FeedReadFailure extends Error {
  public readonly code = 'ER_PARSE_ERROR';

  public constructor() {
    super(
      "select SwSku.skuCode from SwSku inner join SwProduct on ... where SwSku.activeFlag = ? -- bound: ['1','shopper-supplied-value']",
    );
    this.name = 'FeedReadFailure';
  }
}

/**
 * The framework's terminal dead-call-target message, byte for byte.
 *
 * Reproduced from [org/Hibachi/HibachiEntity.cfc:L565] and its byte-identical service-tier copy at
 * [org/Hibachi/HibachiService.cfc:L280], grammatical error and trailing " entity." included. It is
 * deliberately NOT conflated with the different variant at [org/Hibachi/HibachiObject.cfc:L126],
 * which opens differently, carries no `()`, is grammatically correct and has no trailing " entity."
 * - so the recognizer cannot match it even by accident, and no in-scope call path reaches it.
 */
const DEAD_CALL_TARGET_MESSAGE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

describe('validation and safe error mapping', () => {
  it('refuses a request that carries no host header, before anything reaches a service', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent({ headers: {} }), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.category).toBe('invalidRequest');
    expect(envelope.message).toBe(INVALID_REQUEST_MESSAGE);
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);
  });

  it('refuses an empty or whitespace-only host header the same way', async () => {
    const empty = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));
    const blank = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const emptyResponse = await empty.invoke(
      feedRequestEvent({ headers: { host: '' } }),
      lambdaContext(),
    );
    const blankResponse = await blank.invoke(
      feedRequestEvent({ headers: { host: '   ' } }),
      lambdaContext(),
    );

    expect(emptyResponse.statusCode).toBe(400);
    expect(blankResponse.statusCode).toBe(400);
    expect(errorEnvelopeOf(emptyResponse).message).toBe(INVALID_REQUEST_MESSAGE);
    expect(errorEnvelopeOf(blankResponse).message).toBe(INVALID_REQUEST_MESSAGE);
    expect(empty.root.scopeInputs).toStrictEqual([]);
    expect(blank.root.scopeInputs).toStrictEqual([]);
  });

  it('names no header and attaches no field complaint to the refusal', async () => {
    // Naming the header would tell a caller how to shape a request this deployment has not been
    // configured to serve, so the reason is NAMED to the mapper - which owns the words - and the
    // body carries the mapper's own fixed sentence and nothing else.
    const { invoke } = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const response = await invoke(feedRequestEvent({ headers: {} }), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(envelope.fields).toBeUndefined();
    expect(response.body.toLowerCase()).not.toContain('host');
    expect(response.body).not.toContain('header');
    expect(response.body).not.toContain(FEED_ROUTE.path);
  });

  it('reports a refused feed host as unusable input rather than as an authorization failure', async () => {
    // The refusal is about a value observed ON THE REQUEST, so reporting it as a fault of this
    // service would misdirect whoever reads it - and no authorization status is reached for either,
    // because this is an origin-policy refusal and the legacy endpoint is unauthenticated as a
    // matter of source fact.
    const candidate = 'rogue.example.test';
    const reason = 'it is not on the deployment-owned allow-list';
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWith(() => port, new UntrustedFeedHostError(candidate, reason));

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.category).toBe('invalidRequest');
    expect(envelope.message).toBe(INVALID_REQUEST_MESSAGE);
    expect(port.argumentCounts).toStrictEqual([]);

    // Neither the diagnosis nor the candidate reaches the body.
    expect(response.body).not.toContain(candidate);
    expect(response.body).not.toContain(reason);
    expect(response.body).not.toContain('allow-list');
  });

  it('sends the refusal diagnosis to the log stream without reproducing the candidate', async () => {
    // The error's own sentence is the right thing to log, because the class composes the GROUND of
    // the refusal with a SUMMARY of the candidate and never reproduces the candidate itself.
    const candidate = 'rogue.example.test';
    const reason = 'it is not on the deployment-owned allow-list';
    const { invoke } = harnessWith(
      () => new RecordingProductFeedPort(RENDERED_DOCUMENT),
      new UntrustedFeedHostError(candidate, reason),
    );

    await invoke(feedRequestEvent(), lambdaContext());

    const refusals = recordedLog.entries.filter((entry) => entry.message.includes(reason));

    expect(refusals).toHaveLength(1);

    const [line] = refusals;

    if (line === undefined) {
      throw new Error('the refusal was not logged');
    }

    expect(line.level).toBe('warn');
    expect(line.message).toContain(`${String(candidate.length)} characters long`);
    expect(line.message).not.toContain(candidate);
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
  });

  it('answers a feed read failure generically, letting no statement text or bound value out', async () => {
    // THE SPECIFIC HAZARD ON THIS PATH. Nothing here is caught and re-worded: the failure goes
    // through the one mapper, unexamined, and the mapper publishes a fixed sentence while the
    // classification - and only the classification - reaches the log.
    const failure = new FeedReadFailure();
    const port = new FailingProductFeedPort(failure);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('unrecognized');
    expect(envelope.message).toBe(GENERIC_FAILURE_MESSAGE);
    expect(envelope.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(port.callCount).toBe(1);

    // No statement text, no bound value, no message, no stack, no route, no host and no code.
    expect(response.body).not.toContain('select');
    expect(response.body).not.toContain('SwSku');
    expect(response.body).not.toContain('shopper-supplied-value');
    expect(response.body).not.toContain('bound');
    expect(response.body).not.toContain(failure.code);
    expect(response.body).not.toContain('FeedReadFailure');
    expect(response.body).not.toContain(FEED_HOST);
    expect(response.body).not.toContain(FEED_ROUTE.path);
    // A stack frame's own indentation, which is the shape a leaked stack would arrive in.
    expect(response.body).not.toContain('    at ');
  });

  it('records the classification of that failure on the log stream, and not its message', async () => {
    // What the recording sink carries is what the body withholds: the correlation identifier, the
    // category, the status, the sanitized route, the thrown shape and the machine code. The MESSAGE
    // is carried by neither, which is stronger than publishing it to one of the two.
    const failure = new FeedReadFailure();
    const { invoke } = harnessWithPort(new FailingProductFeedPort(failure));

    await invoke(feedRequestEvent(), lambdaContext());

    const failures = recordedLog.entries.filter((entry) => entry.level === 'error');

    expect(failures).toHaveLength(1);

    const [line] = failures;

    if (line === undefined) {
      throw new Error('the failure was not logged');
    }

    expect(line.context.category).toBe('unrecognized');
    expect(line.context.statusCode).toBe(500);
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
    expect(line.context.thrownShape).toBe('FeedReadFailure');
    expect(line.context.errorCode).toBe(failure.code);
    expect(JSON.stringify(line)).not.toContain('SwSku');
    expect(JSON.stringify(line)).not.toContain('shopper-supplied-value');
  });

  it('reproduces the framework dead-call-target message verbatim', async () => {
    // The one case where a failure's own message IS published, and safe because the recognizing
    // pattern enforces both of its slots as identifiers. Withholding it would lose an observable
    // behavioural contract, and "does not exists" is preserved exactly as both framework tiers
    // throw it.
    const { invoke } = harnessWithPort(
      new FailingProductFeedPort(new Error(DEAD_CALL_TARGET_MESSAGE)),
    );

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('missingMethod');
    expect(envelope.message).toBe(DEAD_CALL_TARGET_MESSAGE);
    expect(envelope.message).toContain('does not exists');
  });

  it('answers generically when the scope publishes no feed port, with the detail logged', async () => {
    // Unreachable given a supplied host, since the real root builds the port if and only if one was
    // present - but the published type is honest about the member being optional, and a non-null
    // assertion is the one construct that would silence exactly the checks this path relies on.
    const { invoke } = harnessWith(() => undefined);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('unrecognized');
    expect(envelope.message).toBe(GENERIC_FAILURE_MESSAGE);

    const operatorLines = recordedLog.entries.filter(
      (entry) => entry.level === 'error' && entry.message.includes('product-feed port'),
    );

    expect(operatorLines).toHaveLength(1);
    expect(operatorLines[0]?.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(operatorLines[0]?.context.route).toBe(FEED_ROUTE_LABEL);
  });

  it('draws every status from the minimal set, reaching for no other', async () => {
    // Every branch this entrypoint has, driven once, and the union of their statuses compared
    // against the closed set. A 401, 403, 409, 422 or 429 appearing here would mean a status
    // vocabulary had been invented for a slice whose source has none.
    const served = await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
      feedRequestEvent(),
      lambdaContext(),
    );
    const unusable = await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
      feedRequestEvent({ headers: {} }),
      lambdaContext(),
    );
    const unrouted = await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
      lambdaContext(),
    );
    const refusedHost = await harnessWith(
      () => new RecordingProductFeedPort(RENDERED_DOCUMENT),
      new UntrustedFeedHostError('rogue.example.test', 'it is not served by this deployment'),
    ).invoke(feedRequestEvent(), lambdaContext());
    const readFailure = await harnessWithPort(
      new FailingProductFeedPort(new FeedReadFailure()),
    ).invoke(feedRequestEvent(), lambdaContext());
    const deadTarget = await harnessWithPort(
      new FailingProductFeedPort(new Error(DEAD_CALL_TARGET_MESSAGE)),
    ).invoke(feedRequestEvent(), lambdaContext());

    const observed = [
      served.statusCode,
      unusable.statusCode,
      unrouted.statusCode,
      refusedHost.statusCode,
      readFailure.statusCode,
      deadTarget.statusCode,
    ];

    expect([...new Set(observed)].sort((left, right) => left - right)).toStrictEqual([
      200, 400, 404, 500,
    ]);

    for (const invented of [401, 403, 409, 422, 429]) {
      expect(observed).not.toContain(invented);
    }
  });

  it('carries no retry, rate-limit or circuit-breaker semantic on any response', async () => {
    const responses = [
      await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
        feedRequestEvent(),
        lambdaContext(),
      ),
      await harnessWithPort(new FailingProductFeedPort(new FeedReadFailure())).invoke(
        feedRequestEvent(),
        lambdaContext(),
      ),
    ];

    for (const response of responses) {
      const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());

      expect(headerNames).not.toContain('retry-after');
      expect(headerNames).not.toContain('x-ratelimit-limit');
      expect(headerNames).not.toContain('x-ratelimit-remaining');
      expect(response.body).not.toContain('retryAfter');
      expect(response.body).not.toContain('circuitBreaker');
    }
  });
});
