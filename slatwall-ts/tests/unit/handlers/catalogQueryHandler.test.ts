// ---------------------------------------------------------------------------
// The catalog-query Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: no legacy test file reaches the handler tier. The two
// legacy-extended suites in this subtree are the brand and product entity suites, and neither is this
// one.
//
// A handler is a primary adapter, so every `describe` below serves exactly one of four concerns:
// request parsing and validation, delegation to the composed services, API Gateway response shaping,
// and domain/error mapping. Nothing here asserts a price, a discount, a rounding outcome or a cascade
// result, and SQL shape and parameter binding are owned by the repository integration tests.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE ASSERTS, AND THE FOUR CONCERNS IT IS ALLOWED TO ASSERT ABOUT
//
// A handler is a PRIMARY ADAPTER and carries no business logic, so every `describe` below serves
// exactly one of four concerns: request parsing and validation, delegation to the composed services,
// API Gateway response shaping, and domain/error mapping. Nothing here asserts a price, a discount,
// a rounding outcome or a cascade result - those belong to the service, entity and value-object
// suites that own them, and duplicating them here would move an assertion away from the code it
// guards.
//
// THE SUBJECT IS BUILT THROUGH THE SHIPPED FACTORY. `createCatalogQueryHandler({ compositionRoot,
// logger })` is the substitution API the module publishes for exactly this purpose, so every test
// below drives a handler whose logger writes to a recording sink and whose composition root is
// assembled over an INJECTED statement executor and an EXPLICIT environment source. No connection pool
// is created, no statement leaves this file, no environment variable is read from the process, no
// `.env` is loaded, no credential exists anywhere here, and no network, filesystem or clock is touched.
// The suite passes with a COMPLETELY EMPTY environment.
//
// ★★ QUOTE-THEN-REVISE. Those two sentences used to say the composition root was "a hand-written
// in-memory double" and that "NO REAL COMPOSITION ROOT IS EVER CALLED". Both were true, and the price
// of them was a `double as unknown as CompositionRoot` cast that a code review found - a crossing that
// "defeats contract-drift detection for every unimplemented member" and leaves an unintended read
// observing `undefined` instead of failing. The root is now the REAL one, built through the documented
// override arm that bypasses both the pool and the module memo, wrapped in a delegating decorator that
// counts the scopes it opened. Nothing is asserted or suppressed anywhere in this file.
//
// NO MOCKING LIBRARY IS USED for the doubles themselves: they are ordinary objects, typed member for
// member against the shipped classes through `Pick<>`, which is what makes a signature change in
// `src/services/productService.ts` or `src/services/optionService.ts` break this file at COMPILE time
// rather than silently pass. `vi` is vitest itself and is used for two things only - restoring in the
// per-suite `afterEach`, and installing those same typed objects on the three service prototypes the
// real request scope's real instances inherit from. There is no `vi.mock`, no `vi.doMock`, no
// `vi.resetModules`, no `vi.stubEnv`, no `vi.stubGlobal` and no global stream is touched.
//
// ★ THE THREE LINES OF THE SUBJECT THIS SUITE DELIBERATELY DOES NOT REACH, named so the gap reads as
// a decision rather than an oversight:
//
//   * the production default `bootstrapCompositionRoot()` inside `createCatalogQueryHandler`, which
//     MUST NOT be invoked: calling it would resolve the real configuration and build a connection
//     pool, which is the one thing this suite exists not to do;
//   * the action-mismatch refusal at `resolution.route.action !== IMPLEMENTED_ACTION`, unreachable
//     while the FROZEN shared route table assigns `queryCatalog` to `catalogQuery`. The shipped module
//     records it as an impossible case that is handled rather than asserted away, and reaching it would
//     mean reshaping the exported table - a hack that would prove nothing about the request path;
//   * the `z.strictObject.parse(undefined)` arm every mutation carries, unreachable because the handler
//     refuses `missingRequestBody` before `planInvocation` is called. The shipped module states its
//     outcome - an ordinary 400 naming the document root - and reaching it would mean calling
//     `planInvocation` directly, which asserts nothing about the request path either.
//
// ★★ QUOTE-THEN-REVISE. That list used to open with a fourth entry: "the `return` guard inside the
// ledger's eviction loop, taken only if the map's iterator were exhausted while the map still reported
// more entries than its bound". It was accurate when written and is now vacuous - security review
// finding F5 removed the per-container response ledger from the shipped module altogether, so there is
// no eviction loop left to leave unreached. The third entry above replaced it, and it is a real
// unreached line rather than a placeholder kept to preserve a count of three.
//
// ---------------------------------------------------------------------------
// TWO PLACES WHERE THIS SUITE ONCE DIFFERED FROM ITS BRIEF, AND WHAT A CODE REVIEW DID TO BOTH
//
// ★★★ QUOTE-THEN-REVISE, AND THE FIRST OF THE TWO IS NOW THE OPPOSITE OF WHAT IT SAID. Both entries
// used to record a difference between the brief and the shipped source and mirror the source as it
// stood. A code review then found the difference itself to be the defect - CRITICAL, one finding
// against the handler and one against this file - so the source changed and these two records change
// with it. They are kept rather than deleted because the reasoning that produced the narrow surface is
// exactly what a reader needs in order to trust the wide one.
//
//  1. THE PUBLISHED SURFACE IS FOURTEEN OPERATIONS. IT USED TO BE THREE, AND THAT WAS THE FINDING.
//     This entry used to read, verbatim:
//
//         "THE PUBLISHED SURFACE IS THREE OPERATIONS, NOT SIXTEEN. The brief lists the whole of
//          `ProductService`, plus `BrandService.saveBrand` and `OptionService.getOptionsForSelect`.
//          The shipped module publishes exactly `findProducts`, `getUnusedProductOptions` and
//          `getUnusedProductOptionGroups`, and documents every other member as a DELIBERATE
//          NON-EXPOSURE in four categories: out of scope by AAP 0.9.5; owned by
//          `skuResolutionHandler`; unreachable because the composition root publishes no entity and
//          no entity loader, so a method whose first parameter is an entity has no admissible
//          argument at this tier; and not this service's to publish at all. This suite therefore
//          EXERCISES the three and asserts NON-EXPOSURE for the rest, at the route and operation
//          level, with a tripwire on every unpublished member proving no service call escapes."
//
//     Three of those four non-exposure categories were sound and still are. AAP 0.9.5 does exclude
//     `processProduct_addProductReview`, `processProduct_addSubscriptionTerm`,
//     `processProduct_uploadDefaultImage` and `loadDataFromFile`; `skuResolutionHandler` does own the
//     SKU reads; and `BrandService`'s framework members are not this capability's to publish. The
//     FOURTH was false at the moment it was written: the composition root DOES publish entity loaders
//     - `RequestScope.entityLoaders` - so "a method whose first parameter is an entity has no
//     admissible argument at this tier" was not true, and eleven AAP-0.4.2-sanctioned actions were
//     unreachable from Lambda on the strength of a premise the same composition root contradicted.
//     Catalog persistence and the whole of `BrandService` had no transport at all.
//
//     The shipped module now publishes FOURTEEN operations: five reads on GET
//     (`findProducts`, `getFormattedOptionGroups`, `getUnusedProductOptions`,
//     `getUnusedProductOptionGroups`, `getOptionsForSelect`) and nine mutations on POST
//     (`processProduct_addOptionGroup`, `processProduct_addOption`, `processProduct_updateSkus`,
//     `processProduct_deleteDefaultImage`, `processProduct_updateDefaultImageFileNames`,
//     `saveProduct`, `saveProductType`, `deleteProduct`, `saveBrand`). Every one is administrative,
//     every mutation names an EXISTING row by identifier, and each identifier is hydrated through
//     `RequestScope.entityLoaders` rather than reconstructed here. This suite therefore EXERCISES all
//     fourteen and asserts NON-EXPOSURE only for the members that remain genuinely unpublished.
//
//  2. THE `Product_UpdateSkus` CONDITIONAL RULES ARE NOW REACHABLE, AND ARE STILL NOT RESTATED HERE.
//     This entry used to read, verbatim: "THE `Product_UpdateSkus` CONDITIONAL RULES ARE NOT
//     REACHABLE FROM HERE, SO THEY ARE NOT ASSERTED HERE ... That operation is not published by this
//     capability ... Asserting the two conditional paths through this entrypoint would require
//     inventing a route the shipped router does not have."
//
//     The premise expired with entry 1: `processProduct_updateSkus` IS published now, so the route
//     exists and nothing needs inventing. The CONCLUSION survives unchanged, for a different and
//     better reason. [model/validation/Product_UpdateSkus.json] gates `price` on
//     `showPrice{updatePriceFlag eq 1}` and `listPrice` on `showListPrice{updateListPriceFlag eq 1}`,
//     and those rules are ported as a module-private zod schema inside
//     `src/services/productService.ts` that `processProduct_updateSkus`
//     [model/service/ProductService.cfc:L216-L233] parses with before any mutation. The handler
//     forwards the submitted payload and restates NOTHING: no second copy of the conditional gate
//     lives at this tier, so there is no second copy to drift. What this suite asserts is the
//     transport fact - the payload arrives at the service unaltered, and a rule the SERVICE refuses
//     surfaces as a refusal rather than as a partial mutation - and the conditional paths themselves
//     stay asserted in `tests/unit/services/productService.test.ts`, which owns them.
//
// IMPORT DISCIPLINE. Explicit relative specifiers carrying the `.js` extension NodeNext resolution
// requires, named imports only, and `import type` on its own statement for every type-only import.
// There is no barrel anywhere in this subtree. Every module below is one this suite is permitted to
// depend on: the subject, its three siblings in `src/handlers/`, the three ported services whose
// surface it forwards to, the money value object, the structured logger, and the two fixture
// factories. Nothing else is imported - in particular NOT `src/lib/config.ts`, which fails fast on
// an unset dialect and would break the empty-environment contract the moment it were loaded, and NOT
// `liveDatabaseTestsEnabled` from `tests/setup.ts`, which exists to gate database suites and would
// only invite the conditional skipping this suite is forbidden to use.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { Money } from '../../../src/domain/valueObjects/money.js';
// ★★★ THE REAL COMPOSITION ROOT, IMPORTED BECAUSE A DOUBLE CANNOT BE ONE WITHOUT A CAST.
//
// A code review found `asCompositionRoot(double)` here - a `double as unknown as CompositionRoot`
// crossing that "defeats contract-drift detection for every unimplemented member", and leaves an
// unintended read observing `undefined` rather than failing loudly. Its own documentation explained why
// the cast existed: `RequestScope` publishes `productService`, `optionService`, `brandService`,
// `skuService` and `roundingRuleService` as the CLASS types, every one of those classes holds
// `private readonly` collaborators, and a TypeScript type with private members can only be satisfied by
// an instance of the declaring class. That reasoning was sound; the conclusion was not the only one
// available.
//
// The way out is to stop hand-writing a root at all: `bootstrapCompositionRoot({ executor, environment })`
// assembles the REAL one over an injected statement executor and an explicit environment source - no
// pool, no socket, no `process.env` - which is the construction `tests/unit/handlers/bootstrap.test.ts`
// is built on. The scope it hands back IS a `RequestScope`, so nothing needs asserting, and the
// programmable answers below are installed on the class PROTOTYPES the real instances inherit from,
// each through one typed `vi.spyOn`. The `Pick<>` service surfaces are unchanged and still fully typed,
// so a signature change in any of the three services still breaks this file at compile time - and now
// the OTHER members of `RequestScope` are checked too rather than suppressed.
import { bootstrapCompositionRoot, resetCompositionRoot } from '../../../src/handlers/bootstrap.js';
import type {
  CompositionRoot,
  InspectableRequestScope,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import { appConfig } from '../../../src/lib/config.js';
import type { EnvironmentSource } from '../../../src/lib/config.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { MAX_PLACEHOLDER_COUNT } from '../../../src/repositories/mysql/connection.js';
import type {
  CatalogProductPageProjection,
  CatalogQueryLambdaHandler,
  CatalogQueryOperation,
  CatalogQueryResultDocument,
  CatalogSelectOptionProjection,
} from '../../../src/handlers/catalogQueryHandler.js';
// ★★ `CATALOG_OPERATION_TRANSPORT` IS A VALUE IMPORT, AND IT IS IMPORTED RATHER THAN RESTATED. The
// subject publishes the retry semantics AS DATA - one frozen record naming, per operation, the single
// method it is served on and whether re-sending it converges - because AAP 0.6.5 asks for stated retry
// semantics on a bulk mutation path and a per-container response ledger was removed from this module by
// security review. Importing the table is what turns that documentation into something a test can pin;
// restating it here would let the two copies disagree silently, which is the failure the whole
// derive-rather-than-restate discipline in this file exists to prevent.
import {
  CATALOG_OPERATION_TRANSPORT,
  createCatalogQueryHandler,
  handler,
} from '../../../src/handlers/catalogQueryHandler.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import type { LogSink } from '../../../src/lib/logger.js';
import { logger } from '../../../src/lib/logger.js';
// VALUE imports, not type-only: the programmable answers are installed on these classes' prototypes,
// which is what the real request scope's real instances inherit from.
import { BrandService } from '../../../src/services/brandService.js';
import { OptionService } from '../../../src/services/optionService.js';
import type {
  FormattedOptionGroup,
  ProductPage,
  ProductQueryCriteria,
} from '../../../src/services/productService.js';
import {
  ProductPagingCriteriaError,
  ProductService,
} from '../../../src/services/productService.js';
import type { SelectOption } from '../../../src/domain/ports/optionRepository.js';
// ★★ TWO REPOSITORY CLASSES, IMPORTED AS VALUES FOR THE SAME REASON THE THREE SERVICES ARE. Two of the
// seven read-only entity loads on `RequestScope.entityLoaders` FORWARD a repository read verbatim, and the
// published loaders object is frozen - so the load is programmed on the prototype the real graph's real
// repository inherits from. Nothing is constructed from either class here.
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
// ★ THE FOUR ENTITY TYPES ARE TYPE-ONLY, and nothing in this suite constructs one: the product comes from
// the fixture factory, the product type off the product's own graph, and the brand and options are
// hydrated by the composition root from the rows the executor answers. They are named because the recorded
// call records are typed by them, which is what makes a delegation assertion checkable rather than `any`.
import type { Brand } from '../../../src/domain/entities/brand.js';
import type { Option } from '../../../src/domain/entities/option.js';
import type { Product } from '../../../src/domain/entities/product.js';
import type { ProductType } from '../../../src/domain/entities/productType.js';
// The subject's own list primitive, so a declared method list and an option-identifier list are parsed
// here exactly as the subject parses them. Re-splitting on a comma by hand would be a second
// implementation of one rule.
import { listToArray } from '../../../src/lib/cfml/list.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// The route this capability owns, read from the shared table rather than restated
// ---------------------------------------------------------------------------

/**
 * The catalog-query row of the shipped route table.
 *
 * READ, NEVER RESTATED. Writing `'/catalog/products'` as a literal here would create a second
 * declaration of the URL surface that could drift from the first, and the point of an explicit route
 * table is that there is exactly one. Every request below is built from this row, so a change to the
 * table moves this suite with it instead of silently orphaning it.
 */
const CATALOG_ROUTE = ROUTE_TABLE.catalogQuery;

/** Another capability's route, used to prove this bundle does not answer for its siblings. */
const SKU_RESOLUTION_ROUTE = ROUTE_TABLE.skuResolution;

/** A third, whose method differs, used to prove the method is part of the match. */
const PROMOTION_APPLICATION_ROUTE = ROUTE_TABLE.promotionApplication;

/**
 * The FIRST method the catalog row declares, as a request would carry it.
 *
 * ★★ `CATALOG_ROUTE.methods` IS A COMMA LIST AND IS NOT A METHOD. The row reads `'GET,POST'` - five reads
 * on the first, nine mutations on the second - so the declaration has to be parsed before it can be sent.
 * Parsed with the subject's own primitive rather than split by hand, so this suite reads the declaration
 * exactly as `./router.js` reads it.
 */
function firstDeclaredCatalogMethod(): string {
  const declared = listToArray(CATALOG_ROUTE.methods)[0];

  if (declared === undefined) {
    throw new Error('the catalog route declares no method at all');
  }

  return declared;
}

/**
 * The method a given catalog operation is served on.
 *
 * READ FROM THE ROW'S DECLARED LIST, never from a literal: the reads take the first declared method and
 * the mutations take the second, so a table that reordered or renamed its methods moves this suite with
 * it. A capability declaring only one method would fail loudly here rather than silently sending `GET`
 * for a write.
 */
function methodForOperation(operation: CatalogQueryOperation): string {
  const declared = listToArray(CATALOG_ROUTE.methods);
  const index = MUTATION_OPERATIONS.includes(operation) ? 1 : 0;
  const method = declared[index];

  if (method === undefined) {
    throw new Error(
      `the catalog route declares ${String(declared.length)} methods; ${operation} needs the ` +
        `one at index ${String(index)}`,
    );
  }

  return method;
}

// ---------------------------------------------------------------------------
// Non-sensitive sentinels
//
// Every value below is invented, obviously synthetic, and carries no credential of any kind, no
// host and no address. Identifier shapes follow [meta/tests/unit/Helper.cfc:L51-L60]:
// a 32-character hexadecimal primary key and a `TESTPRODUCT`-style code.
// ---------------------------------------------------------------------------

/** A saved product's primary key. 32 hexadecimal characters, as the legacy helper's fixture is. */
const FIRST_PRODUCT_ID = 'aaaa1111222233334444555566667777';

/** A second, so ordering assertions can tell two records apart. */
const SECOND_PRODUCT_ID = 'bbbb9999888877776666555544443333';

/** A third, for the unnamed-product case. */
const THIRD_PRODUCT_ID = 'cccc1234123412341234123412341234';

/** A SKU primary key, used to prove no SKU member reaches this capability's surface. */
const SENTINEL_SKU_ID = 'dddd5555666677778888999900001111';

/** A SKU code, in the shape [meta/tests/unit/Helper.cfc:L56] uses. */
const SENTINEL_SKU_CODE = 'TESTPRODUCTXXX-1';

/** The opaque account identifier the default authorizer context establishes. */
const CALLER_ACCOUNT_ID = 'eeee1111222233334444555566667777';

/** A saved brand's primary key, in the same 32-hexadecimal shape. */
const SENTINEL_BRAND_ID = 'ffff1111222233334444555566667777';

/** The brand name the synthetic `SwBrand` row carries. */
const SENTINEL_BRAND_NAME = 'Test Brand';

/** The brand slug the synthetic `SwBrand` row carries. */
const SENTINEL_BRAND_URL_TITLE = 'test-brand';

/** A saved option's primary key. */
const FIRST_OPTION_ID = '1111aaaa2222bbbb3333cccc4444dddd';

/** A second option, so a two-element list can assert the caller's own order is preserved. */
const SECOND_OPTION_ID = '5555eeee6666ffff77778888aaaa9999';

/** The option group both synthetic options belong to. */
const SENTINEL_OPTION_GROUP_ID = '9999ffff8888eeee7777dddd6666cccc';

/**
 * Identifiers that are well-formed and name NO ROW, one per loadable entity.
 *
 * ★★ THE MISS IS DRIVEN BY THE CALLER'S OWN IDENTIFIER, NOT BY EMPTYING A FIXTURE. Every mutation binds
 * an existing row, and "the row is not there" is a domain outcome the subject publishes as `unresolved`
 * in a 200 rather than as a 404 - so the honest way to reach it is to NAME a row that does not exist,
 * exactly as a caller would. Withdrawing the fixture instead would reach the same branch while proving
 * nothing about the identifier the request carried.
 *
 * Each is a well-formed 32-hexadecimal key, so nothing about the refusal can be attributed to a
 * malformed value: the schema admits all four and the load simply answers nothing.
 */
const ABSENT_PRODUCT_ID = '0000dead0000dead0000dead0000dead';
const ABSENT_PRODUCT_TYPE_ID = '1111dead1111dead1111dead1111dead';
const ABSENT_BRAND_ID = '2222dead2222dead2222dead2222dead';
const ABSENT_OPTION_ID = '3333dead3333dead3333dead3333dead';

/**
 * The default authorizer context: an identified caller carrying the ADMINISTRATIVE claim.
 *
 * ★★★ THE DEFAULT USED TO BE `{ accountID: CALLER_ACCOUNT_ID }` ALONE, AND THAT WAS THE DEFECT
 * (F45, CWE-862). Every one of the FOURTEEN operations this capability publishes is administrative in
 * the source - `getUnusedProductOptions`, `getUnusedProductOptionGroups`, `getFormattedOptionGroups` and
 * `getOptionsForSelect` are the option-editing reads consumed only by
 * `admin/views/entity/preprocessproduct_addoption.cfm:L60` and its option-group twin, inside an
 * application whose controllers declare `this.publicMethods=''`; `findProducts` stands in for
 * `searchProductsByProductType` [model/dao/ProductDAO.cfc:L419-L437], which has no caller anywhere in
 * the legacy tree and whose statement carries no `activeFlag`/`publishedFlag` predicate; and the nine
 * MUTATIONS are reached in the legacy through `admin/` alone. A default principal WITHOUT the claim
 * therefore drove 130 cases through a gate that should have refused it, and the suite could not have
 * noticed the missing authorization because it never asserted it.
 *
 * ★★ THE COUNT WENT FROM THREE TO FOURTEEN AFTER THIS DEFAULT WAS FIXED, WHICH MADE THE GATE MATTER
 * MORE RATHER THAN LESS. A later code review found eleven AAP-0.4.2-mapped actions unreachable from
 * Lambda, nine of them writes, and publishing them behind this gate is what makes the widened surface
 * safe - the admission cases loop over all fourteen for exactly that reason.
 *
 * The default now carries the claim, so every operation case exercises a caller the route legitimately
 * serves, and the gate itself is asserted explicitly by the cases that omit or falsify the claim.
 */
const ADMIN_AUTHORIZER_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({
  accountID: CALLER_ACCOUNT_ID,
  adminAccountFlag: true,
});

/**
 * A unit price, as a DECIMAL STRING.
 *
 * [meta/tests/unit/Helper.cfc:L55] writes `price = 100` as a bare number, and that is the
 * anti-pattern this port exists to remove: money is constructed from a decimal string through `Money`
 * and never from a numeric literal. It appears here for ONE purpose - to prove that a product
 * carrying money publishes none of it on this capability's surface.
 */
const SENTINEL_UNIT_PRICE = '19.99';

/** A denormalized sale price, likewise a decimal string and likewise never published. */
const SENTINEL_SALE_PRICE = '17.49';

/** The product-type identifier the legacy helper uses verbatim [meta/tests/unit/Helper.cfc:L58]. */
const MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The product type the product fixture's own graph carries.
 *
 * ALIASED RATHER THAN RESTATED, so the identifier the product-type LOAD is programmed with is provably
 * the same one the fixture's entity answers - which is what makes the delegation assertion mean
 * something rather than comparing two independently written literals.
 */
const SENTINEL_PRODUCT_TYPE_ID = MERCHANDISE_PRODUCT_TYPE_ID;

/** An option-group identifier list, deliberately UNTIDY - see the forwarding assertions. */
const UNTIDY_OPTION_GROUP_ID_LIST = ' Zulu , alpha ,alpha,,BRAVO ';

/** The Lambda invocation identifier every test asserts is echoed back. */
const INVOCATION_ID = 'test-invocation-0f6c1d2e';

/** The API Gateway identifier, used only where the invocation identifier is blank. */
const GATEWAY_REQUEST_ID = 'test-gateway-4b7a9c30';

/**
 * The fixed placeholder the SHARED resolver substitutes when neither identifier carries a value.
 *
 * ★★ THE VALUE MOVED WITH THE RESOLVER. This suite used to assert a per-handler
 * `'unidentified-invocation'`; API review (finding F8) found five different correlation policies
 * across the five entrypoints and collapsed them into `resolveServerRequestId` in
 * `../../../src/handlers/errorMapper.js`, whose placeholder is `'unattributed'`. The literal is
 * restated here rather than imported because the shared module keeps it module-private - a test that
 * imported it could not detect the constant being changed to an empty string, which is exactly the
 * regression the assertion below exists to catch.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/**
 * The request instant, as an explicit UTC ISO-8601 literal.
 *
 * The event type declares `requestTimeEpoch`, so a value is required; deriving it from a written-out
 * UTC literal keeps it deterministic and keeps this file free of `new Date()` and `Date.now()`.
 * NOTHING in this suite asserts on it, and no behaviour of this handler depends on it - the request
 * instant that matters is the one the composition root captures, and this capability supplies none.
 */
const REQUEST_TIME = '2024-06-01T00:00:00.000Z';

/** `requestTimeEpoch` for {@link REQUEST_TIME}. Parsed from the literal rather than hard-coded. */
const REQUEST_TIME_EPOCH = Date.parse(REQUEST_TIME);

/**
 * The value the platform-required `getRemainingTimeInMillis` member answers.
 *
 * The AWS `Context` type declares that member, so a constructed context must have one. It is
 * arbitrary, the handler never calls it, and NO assertion in this suite reads it. It is not a budget,
 * a target, a duration claim or a service level of any kind.
 */
const PLATFORM_REQUIRED_REMAINING_TIME = 30_000;

// ---------------------------------------------------------------------------
// Building an API Gateway event
// ---------------------------------------------------------------------------

/** What a test varies about one request. Everything omitted takes the admissible default. */
interface EventOverrides {
  /** HTTP method as RECEIVED. Defaults to the method the matched route declares. */
  readonly method?: string | undefined;

  /** Request path as RECEIVED. Defaults to the matched route's canonical path. */
  readonly path?: string | undefined;

  /** Single-valued query parameters. `null` models an event API Gateway left unpopulated. */
  readonly query?: Readonly<Record<string, string>> | null | undefined;

  /** Multi-valued query parameters. Defaults to `null`; supply one to repeat a parameter. */
  readonly repeatedQuery?: Readonly<Record<string, readonly string[]>> | null | undefined;

  /**
   * Request headers, with the casing a client chose. Defaults to none.
   *
   * The value type admits `undefined` because the platform's own header type does: a field may be
   * PRESENT with no value, and the subject has to decide what that means. Modelling it here is what
   * lets that decision be asserted rather than assumed.
   */
  readonly headers?: Readonly<Record<string, string | undefined>> | undefined;

  /** The API Gateway correlation identifier. Defaults to {@link GATEWAY_REQUEST_ID}. */
  readonly gatewayRequestId?: string | undefined;

  /**
   * The authorizer context. Omitted means an authenticated caller; `null` means
   * no authorizer context.
   */
  readonly authorizer?: Readonly<Record<string, unknown>> | null | undefined;

  /**
   * The raw request body, exactly as API Gateway would deliver it.
   *
   * ★★ A STRING RATHER THAN AN OBJECT, deliberately. The subject decodes a body with `JSON.parse` and
   * has to decide what an unparsable one, an array one, a base64 one and an oversized one mean; handing
   * it a pre-parsed object would remove every one of those decisions from reach. Defaults to `null`,
   * which is what the platform delivers for a request that carries no body - and is what the five READ
   * operations are driven with.
   */
  readonly body?: string | null | undefined;

  /**
   * Whether the platform base64-encoded the body. Defaults to `false`.
   *
   * Modelled because the subject branches on it: API Gateway sets it for a binary media type, and a
   * caller that does so is not making a different request.
   */
  readonly isBase64Encoded?: boolean | undefined;
}

/**
 * Build one proxy event.
 *
 * Constructed member by member rather than asserted into shape: every field the AWS type declares is
 * present with an admissible value, so the subject is driven through the same surface the runtime
 * hands it. The identity block is entirely null except for a documented loopback source address,
 * because a source address is a required member of the platform type and nothing in this suite reads
 * it.
 */
function makeEvent(overrides: EventOverrides = {}): APIGatewayProxyEvent {
  // ★★★ THE DEFAULT IS THE FIRST METHOD THE ROW DECLARES, NOT THE WHOLE DECLARATION. `CATALOG_ROUTE.methods`
  // is a CFML COMMA LIST and now reads `'GET,POST'`, because the capability serves five reads on `GET`
  // and nine mutations on `POST`. Sending the list verbatim as a method would match nothing -
  // `listFindNoCase('GET,POST', 'GET,POST')` answers 0, since the whole list is not an ELEMENT of itself -
  // and every case that relies on this default would have started asserting against a 404. Parsed with the
  // subject's own list primitive so the two cannot disagree about what a declared method is.
  const method = overrides.method ?? firstDeclaredCatalogMethod();
  const path = overrides.path ?? CATALOG_ROUTE.path;

  const repeated: Record<string, string[]> = {};
  if (overrides.repeatedQuery !== undefined && overrides.repeatedQuery !== null) {
    for (const [name, values] of Object.entries(overrides.repeatedQuery)) {
      repeated[name] = [...values];
    }
  }

  return {
    body: overrides.body === undefined ? null : overrides.body,
    headers: overrides.headers === undefined ? {} : { ...overrides.headers },
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
    path,
    pathParameters: null,
    queryStringParameters:
      overrides.query === undefined ? {} : overrides.query === null ? null : { ...overrides.query },
    multiValueQueryStringParameters:
      overrides.repeatedQuery === undefined || overrides.repeatedQuery === null ? null : repeated,
    stageVariables: null,
    requestContext: {
      accountId: '000000000000',
      apiId: 'catalog-query-test-api',
      authorizer:
        overrides.authorizer === undefined ? { ...ADMIN_AUTHORIZER_CONTEXT } : overrides.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod: method,
      identity: {
        accessKey: null,
        accountId: null,
        // Two required members of the platform identity type, explicitly nulled. Neither ever holds a
        // value in this suite, and nothing reads them.
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        // A required member of the platform type. The loopback address is the least meaningful value
        // that satisfies it, nothing in this suite reads it, and it is not a deployment fact.
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path,
      stage: 'test',
      requestId: overrides.gatewayRequestId ?? GATEWAY_REQUEST_ID,
      requestTime: REQUEST_TIME,
      requestTimeEpoch: REQUEST_TIME_EPOCH,
      resourceId: 'catalog-query-test-resource',
      resourcePath: path,
    },
    resource: path,
  };
}

/**
 * Build one Lambda context.
 *
 * The three deprecated callback members are required by the platform type and are implemented as
 * no-ops taking no parameters, which is assignable and keeps every `any` the platform declares out
 * of this file entirely.
 */
function makeContext(awsRequestId: string = INVOCATION_ID): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'catalogQuery',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:test-region:000000000000:function:catalogQuery',
    memoryLimitInMB: '512',
    awsRequestId,
    logGroupName: '/aws/lambda/catalogQuery',
    logStreamName: 'catalog-query-test-stream',
    getRemainingTimeInMillis: (): number => PLATFORM_REQUIRED_REMAINING_TIME,
    done: (): undefined => undefined,
    fail: (): undefined => undefined,
    succeed: (): undefined => undefined,
  };
}

// ---------------------------------------------------------------------------
// Reading a response, and reading the log stream
// ---------------------------------------------------------------------------

/**
 * Whether a parsed JSON value is an object whose members can be read by name.
 *
 * A user-defined type predicate rather than an assertion, so a malformed document narrows honestly
 * instead of being claimed to be something it is not. Arrays are excluded because a JSON array is an
 * object and none of the documents read below is one.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a decoded document is the success envelope the subject publishes.
 *
 * ★ A TYPE PREDICATE, NOT A TYPE ASSERTION, AND THAT DISTINCTION IS THE WHOLE POINT. A wire document
 * arrives as `unknown` - `JSON.parse` is annotated so below rather than left as the `any` its
 * declaration hands back - and it has to re-enter the type system somewhere. Doing it with a checked
 * predicate means the three members the published type declares are actually VERIFIED at run time,
 * so a subject that stopped emitting one would fail here loudly instead of satisfying an assertion
 * against a document that no longer has the shape claimed for it. The nested payload is re-checked
 * where it is read, in {@link readProductPage} and {@link readSelectRows}.
 *
 * ★★★ THE PAYLOAD IS A TWO-ARM UNION NOW, AND BOTH ARMS ARE ADMITTED HERE. This predicate used to
 * require `payload['result'] !== undefined`, which was exactly right while every served document carried
 * a payload. Nine of the fourteen operations bind an EXISTING row by identifier, and an identifier that
 * names no row is a domain outcome the subject publishes as `{operation, unresolved}` in a 200 - a
 * document with no `result` member at all. Requiring one would make this predicate reject a served
 * response the subject legitimately emits, so it now accepts EXACTLY ONE of the two members and rejects
 * a document carrying both or neither.
 */
function isServedBody(value: unknown): value is ServedEnvelope {
  if (
    !isRecord(value) ||
    typeof value['requestId'] !== 'string' ||
    typeof value['capability'] !== 'string' ||
    typeof value['action'] !== 'string'
  ) {
    return false;
  }

  const payload = value['result'];

  if (!isRecord(payload) || typeof payload['operation'] !== 'string') {
    return false;
  }

  const carriesResult = payload['result'] !== undefined;
  const carriesUnresolved = typeof payload['unresolved'] === 'string';

  // EXACTLY ONE, checked as an exclusive or rather than as two independent tests, because a document
  // carrying both would mean the subject had emitted a shape its own union cannot describe.
  return carriesResult !== carriesUnresolved;
}

/**
 * Whether a decoded document is the failure envelope
 * `../../../src/handlers/errorMapper.js` publishes.
 *
 * Checked the same way, one level deeper: the nested `error` member must itself carry a category, a
 * message and the correlation identifier. `fields` is deliberately NOT required - the mapper omits it
 * entirely when there is nothing to report, and requiring it here would make this predicate reject
 * the very envelopes it is meant to read.
 */
function isFailureBody(value: unknown): value is ErrorResponseBody {
  if (!isRecord(value)) {
    return false;
  }
  const failure = value['error'];
  return (
    isRecord(failure) &&
    typeof failure['category'] === 'string' &&
    typeof failure['message'] === 'string' &&
    typeof failure['requestId'] === 'string'
  );
}

/**
 * The SHARED success envelope, with this capability's payload inside it.
 *
 * ★★ THIS USED TO BE `CatalogQueryResponseBody`, a per-handler `{operation, requestId, result}` this
 * file exported for itself. API review (finding F13) found all four JSON entrypoints had each derived
 * their own envelope - two of them without a correlation identifier at all - so the envelope moved to
 * `../../../src/handlers/errorMapper.js` as `SuccessResponseBody`, beside the failure envelope it was
 * modelled on. `operation` travels INSIDE the payload now, because it is a capability-specific
 * selector rather than part of the cross-handler contract.
 */
type ServedEnvelope = SuccessResponseBody<CatalogQueryResultDocument>;

/** The success envelope a served response carries, verified before it is typed. */
function readServedBody(response: APIGatewayProxyResult): ServedEnvelope {
  const parsed: unknown = JSON.parse(response.body);
  if (!isServedBody(parsed)) {
    throw new Error(`a served response body is not the published envelope: ${response.body}`);
  }
  return parsed;
}

/** The failure envelope a mapped response carries, verified before it is typed. */
function readFailureBody(response: APIGatewayProxyResult): ErrorResponseBody {
  const parsed: unknown = JSON.parse(response.body);
  if (!isFailureBody(parsed)) {
    throw new Error(`a failure body is not the published envelope: ${response.body}`);
  }
  return parsed;
}

/** One emitted log line, decoded. `context` is absent from a line that carried none. */
interface RecordedLogLine {
  readonly raw: string;
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * Decode one emitted line.
 *
 * The logger serializes `{ timestamp, level, message, context }`, and each member is narrowed here
 * with `typeof` rather than asserted, so a line that is not what this suite expects fails loudly at
 * the point of reading instead of quietly satisfying an assertion.
 */
function decodeLogLine(raw: string): RecordedLogLine {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`the logger emitted a line that is not a JSON object: ${raw}`);
  }
  const level = parsed['level'];
  const message = parsed['message'];
  const context = parsed['context'];
  if (typeof level !== 'string' || typeof message !== 'string') {
    throw new Error(`the logger emitted a line without a level and a message: ${raw}`);
  }
  return { raw, level, message, context: isRecord(context) ? context : {} };
}

// ---------------------------------------------------------------------------
// The result shapes a double answers with
// ---------------------------------------------------------------------------

/**
 * One matched product, typed from the service's OWN published page shape.
 *
 * Derived rather than imported, exactly as the subject derives it: `src/domain/entities/product.ts`
 * is not among this suite's dependencies, and taking the element type from `ProductPage` keeps the
 * fixtures pinned to whatever `findProducts` actually returns.
 */
type MatchedProduct = ProductPage['records'][number];

/** What a test varies about one page. Everything omitted is derived from the records. */
interface ProductPageOverrides {
  readonly recordsCount?: number | undefined;
  readonly pageRecordsStart?: number | undefined;
  /** ABSENT MEANS THE WHOLE RESULT SET, on the service's contract and therefore here. */
  readonly pageRecordsShow?: number | undefined;
}

/**
 * Build one `ProductPage` the way the ported service publishes one.
 *
 * `entityName`, `joins` and `keywordProperties` are the EXECUTED statement's contract, not the
 * framework smart list's configuration: [model/dao/ProductDAO.cfc:L421] selects from `SwProduct`
 * alone and matches `productName like`, so the join list is empty and there is exactly one keyword
 * property at weight 1. Publishing more here would let this suite pass while the service told callers
 * a brand-name match would work.
 */
/**
 * One matched search row, in the shape the ported statement's own projection carries.
 *
 * ★★★ WHY THIS REPLACED `makeProductFixture` IN EVERY `makeProductPage` CALL (F38). The service used
 * to answer hydrated `Product` entities here, so these cases had to build a whole product graph -
 * priced, SKU-carrying, collaborator-holding - to assert a two-member projection. Code review recorded
 * the hydration behind that as unasked-for work: [model/dao/ProductDAO.cfc:L419-L436] issues ONE
 * statement selecting `productID, productName` and returns `{"id","value"}` per row. `ProductPage`
 * now carries those rows, so the fixture is the row, and the two members are the legacy's own keys.
 *
 * `value` is OMITTED rather than set when no name is given, because that is how the port represents a
 * NULL `SwProduct.productName` [model/entity/Product.cfc:L55] and the omission is what the projection
 * has to carry through.
 */
function matchRow(id: string, value?: string): MatchedProduct {
  return value === undefined ? { id } : { id, value };
}

function makeProductPage(
  records: readonly MatchedProduct[],
  overrides: ProductPageOverrides = {},
): ProductPage {
  return {
    records,
    recordsCount: overrides.recordsCount ?? records.length,
    pageRecordsStart: overrides.pageRecordsStart ?? 0,
    pageRecordsShow: overrides.pageRecordsShow,
    entityName: 'SlatwallProduct',
    joins: [],
    keywordProperties: [{ propertyIdentifier: 'productName', weight: 1 }],
  };
}

/**
 * One select row, in the shape both legacy option queries build.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L88, L113]: neither function hydrates an entity. Both append a
 * TWO-KEY structure per row - a display `name` and an identifier `value` - which is why the ported
 * surface answers `SelectOption[]` and not `Option[]` or `OptionGroup[]`, and why this helper has
 * exactly two parameters.
 */
function selectRow(name: string, value: string): CatalogSelectOptionProjection {
  return { name, value };
}

// ---------------------------------------------------------------------------
// The doubles
//
// ★ WHY THESE ARE `Pick<>` OVER THE SHIPPED CLASSES RATHER THAN HAND-WRITTEN SHAPES. A restated
// signature is a signature that can drift: if `findProducts` gained a parameter or its criteria type
// changed, a hand-copied shape would keep compiling and this suite would keep passing while asserting
// the wrong contract. Taking each member's type from the class itself makes that a compile error.
// It also means the tripwires below are typed too - a non-exposure assertion that would still compile
// if the member were renamed would not be worth much.
// ---------------------------------------------------------------------------

/**
 * Every member of `ProductService` that could conceivably be reached from a catalog request.
 *
 * ONE of them - `findProducts` - is published by the shipped entrypoint. The other fourteen are named
 * here precisely BECAUSE they are not: each is implemented as a tripwire, so a route that ever
 * reached one fails this suite loudly rather than passing unnoticed. The list is the union of the
 * shipped module's four non-exposure categories, so it is checkable against that documentation
 * member for member.
 */
type ProductServiceDouble = Pick<
  ProductService,
  | 'deleteProduct'
  | 'findProducts'
  | 'getFormattedOptionGroups'
  | 'getProductSkusBySelectedOptions'
  | 'loadDataFromFile'
  | 'processProduct_addOption'
  | 'processProduct_addOptionGroup'
  | 'processProduct_addProductReview'
  | 'processProduct_addSubscriptionTerm'
  | 'processProduct_deleteDefaultImage'
  | 'processProduct_updateDefaultImageFileNames'
  | 'processProduct_updateSkus'
  | 'processProduct_uploadDefaultImage'
  | 'saveProduct'
  | 'saveProductType'
>;

/**
 * The whole of `OptionService`.
 *
 * Two of the three are published; `getOptionsForSelect` [model/service/OptionService.cfc:L55] is not,
 * because it takes already-materialised `Option` entities and this tier can obtain none.
 */
type OptionServiceDouble = Pick<
  OptionService,
  'getOptionsForSelect' | 'getUnusedProductOptionGroups' | 'getUnusedProductOptions'
>;

/**
 * The whole of `BrandService`, which is one method.
 *
 * CFML parity [model/service/BrandService.cfc:L49-L89]: `saveBrand` at L67 is the ONLY function the
 * legacy component declares - every brand read a caller might expect arrived by inheritance from the
 * framework base, which is deliberately not ported. So there is no brand QUERY method in existence
 * for a catalog-query capability to publish, and the tripwire below asserts that the one method that
 * does exist stays unreachable.
 */
type BrandServiceDouble = Pick<BrandService, 'saveBrand'>;

// ---------------------------------------------------------------------------
// The nine mutation payload types, DERIVED FROM THE SERVICE SIGNATURES
//
// ★★ NOT RESTATED, on exactly the reasoning the `Pick<>` surfaces above are chosen for. A hand-copied
// payload shape keeps compiling when the service's own input type gains or loses a member, so a body
// fixture built against it would silently stop matching what the handler forwards. Reading each through
// `Parameters<...>` makes a service signature change a compile error in this file, which is where it should
// surface.
// ---------------------------------------------------------------------------

type AddOptionGroupPayload = Parameters<ProductService['processProduct_addOptionGroup']>[1];
type AddOptionPayload = Parameters<ProductService['processProduct_addOption']>[1];
type UpdateSkusPayload = Parameters<ProductService['processProduct_updateSkus']>[1];
type DeleteDefaultImagePayload = Parameters<ProductService['processProduct_deleteDefaultImage']>[1];
type SaveProductPayload = Parameters<ProductService['saveProduct']>[1];
type SaveProductTypePayload = Parameters<ProductService['saveProductType']>[1];
type SaveBrandPayload = Parameters<BrandService['saveBrand']>[1];

/**
 * A configuration source answering the five keys that have no default, and nothing else.
 *
 * NOT A CREDENTIAL. `.invalid` is the reserved never-resolvable TLD [RFC 2606] and both
 * account-shaped values are the literal string that says what they are. No pool is ever built from
 * this: the executor below is injected, so `getPreparedStatementExecutor()` is never reached.
 */
const CATALOG_ENVIRONMENT: EnvironmentSource = Object.freeze({
  // A NAMED host, because `DB_TLS_MODE` below is `verify-identity` and `src/lib/config.ts` refuses
  // that mode against an IP literal (F47) - a certificate binds to host NAMES, so an address would
  // silently reduce the mode to a chain-only check. `.invalid` is the reserved never-resolvable TLD
  // [RFC 2606], and the injected executor means nothing here ever connects.
  DB_HOST: 'slatwall-database.invalid',
  DB_USER: 'unused-by-this-suite',
  DB_PASSWORD: 'unused-by-this-suite',
  // F48: this fixture paired a non-loopback host with `disabled` transport, which the configuration
  // contract refuses outright - cleartext is admitted only for a provable loopback destination, in
  // every environment. The fixture describes a suite that never connects, so the mode is raised to
  // the recommended `verify-identity`, which the NAMED host above satisfies and which needs no
  // trust anchor.
  DB_TLS_MODE: 'verify-identity',
  DB_DIALECT: 'mySql',
});

/**
 * A `SwBrand` row the brand loader can hydrate, or none.
 *
 * ★★★ THE BRAND LOAD IS THE ONE ENTITY BINDING THIS SUITE DRIVES THROUGH REAL SQL, and that is not an
 * accident of convenience. `RequestEntityLoaders.getBrandByBrandID` has NO REPOSITORY BEHIND IT -
 * `BrandService.cfc` declares only `saveBrand` [model/service/BrandService.cfc:L67] and every brand read
 * arrived by framework inheritance, so the statement is hosted in the composition root itself. There is
 * consequently no prototype to programme, and answering the statement is the only way to exercise it -
 * which also means `hydrateBrand` and the projection of {@link BRAND_COLUMNS} are covered rather than
 * assumed.
 *
 * Every value is a synthetic sentinel. `activeFlag` and `publishedFlag` are the CFML `1`/`0` renderings a
 * MySQL `bit` column answers with, which is what the entity's own boolean input union accepts.
 */
function brandRow(brandID: string): SqlRow {
  return {
    brandID,
    activeFlag: 1,
    publishedFlag: 1,
    urlTitle: SENTINEL_BRAND_URL_TITLE,
    brandName: SENTINEL_BRAND_NAME,
    brandWebsite: null,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
  };
}

/**
 * One `SwOption` row joined to its `SwOptionGroup`, in the projection the option load asks for.
 *
 * The group's columns carry the `optionGroup_` alias prefix the statement aliases them with, and
 * `optionGroup_sortOrder` is a NUMBER because the group hydration reads it as a required integer. Both
 * facts are read off the composition root's own projection rather than guessed, which is what keeps this
 * row hydratable if the projection is ever widened.
 */
function optionRow(optionID: string): SqlRow {
  return {
    optionID,
    optionCode: `${optionID}-code`,
    optionName: `${optionID}-name`,
    optionDescription: null,
    sortOrder: 1,
    optionGroupID: SENTINEL_OPTION_GROUP_ID,
    defaultImageID: null,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    optionGroup_optionGroupID: SENTINEL_OPTION_GROUP_ID,
    optionGroup_optionGroupName: 'Colour',
    optionGroup_optionGroupCode: 'colour',
    optionGroup_optionGroupImage: null,
    optionGroup_optionGroupDescription: null,
    optionGroup_imageGroupFlag: 0,
    optionGroup_sortOrder: 1,
    optionGroup_remoteID: null,
    optionGroup_createdDateTime: null,
    optionGroup_createdByAccountID: null,
    optionGroup_modifiedDateTime: null,
    optionGroup_modifiedByAccountID: null,
  };
}

/**
 * The statement executor the real graph is assembled over.
 *
 * ★★ IT ANSWERS EXACTLY TWO STATEMENTS AND NOTHING ELSE, and the two it answers are the two entity loads
 * that have no prototype to programme. Everything else reads NO ROWS: the fourteen published operations
 * are answered from data installed on the service class prototypes, and the product and product-type
 * loads are programmed on their repository prototypes, so the executor exists mainly to keep the
 * composition root away from a connection pool.
 *
 * ★ RECOGNITION IS BY THE TABLE THE STATEMENT NAMES, not by an exact string. An exact match would make
 * this suite fail on a reformatted statement rather than on a changed one, and the projection is asserted
 * anyway - by the row hydrating at all.
 *
 * A MUTATION OR A TRANSACTION REACHING IT IS STILL A FINDING. The nine published mutations reach the
 * SERVICE, whose prototype is programmed here, so no statement of theirs is executed: a write arriving at
 * this executor would mean the handler had bypassed the service that owns the invariants, which is
 * exactly the arrangement `RequestScope` withdrew the six raw repositories to prevent.
 */
class CatalogExecutor implements PreparedStatementExecutor {
  /** Brand identifiers this executor will answer a row for. Empty means every brand is a miss. */
  public readonly knownBrandIDs = new Set<string>();

  /** Option identifiers this executor will answer a row for. Empty means every option is a miss. */
  public readonly knownOptionIDs = new Set<string>();

  /** Every statement it was asked to execute, in order, for a case that wants to assert the shape. */
  public readonly executed: string[] = [];

  public execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.executed.push(sql);

    const bound = params ?? [];

    if (sql.includes('FROM SwBrand')) {
      const brandID = bound[0];

      return Promise.resolve(
        typeof brandID === 'string' && this.knownBrandIDs.has(brandID) ? [brandRow(brandID)] : [],
      );
    }

    if (sql.includes('FROM SwOption swOption')) {
      const rows: SqlRow[] = [];

      for (const optionID of bound) {
        if (typeof optionID === 'string' && this.knownOptionIDs.has(optionID)) {
          rows.push(optionRow(optionID));
        }
      }

      return Promise.resolve(rows);
    }

    return Promise.resolve([]);
  }

  public executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    void params;

    throw new Error(
      `a mutation statement reached the catalog capability's executor: ${sql}. Every published ` +
        'mutation goes through the service that owns its invariants, whose prototype this suite ' +
        'programmes, so no statement of its own should arrive here.',
    );
  }

  public transaction<TValue>(
    work: (tx: PreparedStatementExecutor) => Promise<TValue>,
  ): Promise<TValue> {
    void work;

    throw new Error(
      "a transaction was opened against the catalog capability's executor; every published mutation " +
        'is answered by a programmed service prototype, which opens none',
    );
  }
}

/**
 * A composition root that DELEGATES to a real one and counts the scopes it was asked for.
 *
 * ★★ A DELEGATING DECORATOR IN PLACE OF A CAST, AND THE FORWARDING IS TOTAL. The published root is
 * `Object.freeze`d so a spy cannot be installed on it, and a class that `implements CompositionRoot`
 * forwards every member to the real graph - so the compiler checks the WHOLE contract, a member added
 * to `CompositionRoot` breaks this file, and an unintended read reaches the real object rather than
 * observing `undefined`. That is exactly what the cast this replaced gave up.
 */
class RecordingCompositionRoot implements CompositionRoot {
  public constructor(
    private readonly inner: CompositionRoot,
    private readonly counters: { scopesOpened: number },
    private readonly scopeInputs: (RequestScopeInput | undefined)[],
  ) {}

  public get diagnostics(): CompositionRoot['diagnostics'] {
    return this.inner.diagnostics;
  }

  public get dialect(): CompositionRoot['dialect'] {
    return this.inner.dialect;
  }

  public get settingsProvider(): CompositionRoot['settingsProvider'] {
    return this.inner.settingsProvider;
  }

  public get integration(): CompositionRoot['integration'] {
    return this.inner.integration;
  }

  public createRequestScope(input?: RequestScopeInput): Promise<RequestScope> {
    this.counters.scopesOpened += 1;
    this.scopeInputs.push(input);

    return this.inner.createRequestScope(input);
  }

  public createInspectableRequestScope(
    input?: RequestScopeInput,
  ): Promise<InspectableRequestScope> {
    return this.inner.createInspectableRequestScope(input);
  }
}

/**
 * Install one bed's programmed answers on the three service classes the capability reaches.
 *
 * ★ ON THE PROTOTYPES, BECAUSE THAT IS WHAT THE REAL SCOPE'S REAL INSTANCES INHERIT FROM, and one
 * typed `vi.spyOn` per member, so each installation is checked against the shipped signature. Every
 * member of all three surfaces is installed - the fourteen published answers AND the five remaining
 * tripwires - so no call can reach a real implementation and no real implementation can reach a
 * repository.
 *
 * ★★ THE SPLIT USED TO BE "the three published answers AND the fifteen tripwires", and a code review
 * moved eleven names across the line. Nine of the fifteen refusals were AAP-0.4.2-mapped Product and
 * Brand actions this capability was found to be withholding, so they are recording implementations now;
 * the five that stay refusals are the ones the source genuinely puts out of reach.
 *
 * Restored by this file's `afterEach`, by the global hook in `tests/setup.ts` and by
 * `vitest.config.ts`'s `restoreMocks`, three belts for one obligation.
 */
function installServiceAnswers(
  productService: ProductServiceDouble,
  optionService: OptionServiceDouble,
  brandService: BrandServiceDouble,
): void {
  vi.spyOn(ProductService.prototype, 'findProducts').mockImplementation(
    productService.findProducts,
  );
  vi.spyOn(ProductService.prototype, 'deleteProduct').mockImplementation(
    productService.deleteProduct,
  );
  vi.spyOn(ProductService.prototype, 'getFormattedOptionGroups').mockImplementation(
    productService.getFormattedOptionGroups,
  );
  vi.spyOn(ProductService.prototype, 'getProductSkusBySelectedOptions').mockImplementation(
    productService.getProductSkusBySelectedOptions,
  );
  vi.spyOn(ProductService.prototype, 'loadDataFromFile').mockImplementation(
    productService.loadDataFromFile,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addOption').mockImplementation(
    productService.processProduct_addOption,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addOptionGroup').mockImplementation(
    productService.processProduct_addOptionGroup,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addProductReview').mockImplementation(
    productService.processProduct_addProductReview,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addSubscriptionTerm').mockImplementation(
    productService.processProduct_addSubscriptionTerm,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_deleteDefaultImage').mockImplementation(
    productService.processProduct_deleteDefaultImage,
  );
  vi.spyOn(
    ProductService.prototype,
    'processProduct_updateDefaultImageFileNames',
  ).mockImplementation(productService.processProduct_updateDefaultImageFileNames);
  vi.spyOn(ProductService.prototype, 'processProduct_updateSkus').mockImplementation(
    productService.processProduct_updateSkus,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_uploadDefaultImage').mockImplementation(
    productService.processProduct_uploadDefaultImage,
  );
  vi.spyOn(ProductService.prototype, 'saveProduct').mockImplementation(productService.saveProduct);
  vi.spyOn(ProductService.prototype, 'saveProductType').mockImplementation(
    productService.saveProductType,
  );

  vi.spyOn(OptionService.prototype, 'getUnusedProductOptions').mockImplementation(
    optionService.getUnusedProductOptions,
  );
  vi.spyOn(OptionService.prototype, 'getUnusedProductOptionGroups').mockImplementation(
    optionService.getUnusedProductOptionGroups,
  );
  vi.spyOn(OptionService.prototype, 'getOptionsForSelect').mockImplementation(
    optionService.getOptionsForSelect,
  );

  vi.spyOn(BrandService.prototype, 'saveBrand').mockImplementation(brandService.saveBrand);
}

/**
 * The world the two REPOSITORY-BACKED entity loads answer from.
 *
 * ★★★ PROGRAMMED ON THE REPOSITORY PROTOTYPES, WHICH IS THE SAME MECHANISM THE SERVICES USE AND FOR THE
 * SAME REASON. `RequestScope.entityLoaders` is `Object.freeze`d, so a spy cannot be installed on the
 * published object - but two of its seven loads FORWARD a repository read verbatim, and the real graph's
 * real repositories inherit from these prototypes. Programming them is therefore programming the loads
 * without touching the frozen surface, without a cast, and without hand-writing a `RequestScope`.
 *
 * ★★ EACH LOAD MATCHES ON THE IDENTIFIER IT IS GIVEN rather than answering unconditionally. A double that
 * answered any identifier would let a case pass while the subject forwarded the WRONG one, which is
 * precisely the class of defect the loaders were introduced to close. So a mismatch is a MISS, and a miss
 * is `undefined` - never a fabricated entity and never a throw, which is the posture
 * `RequestEntityLoaders` documents.
 *
 * THE OTHER TWO LOADS ARE NOT PROGRAMMED HERE. `getBrandByBrandID` has no repository behind it and
 * `getOptionsByOptionIDList` forwards a module-private collaborator, so both are driven through the
 * injected executor - see {@link CatalogExecutor}, which answers exactly those two statements.
 */
function installEntityLoads(world: LoadableCatalogWorld): void {
  vi.spyOn(MysqlProductRepository.prototype, 'getProductByProductID').mockImplementation(
    (productID: string): Promise<Product | undefined> => {
      world.productLoads.push(productID);

      const held = world.product;

      return Promise.resolve(
        held !== undefined && held.getProductID() === productID ? held : undefined,
      );
    },
  );

  vi.spyOn(
    MysqlProductTypeRepository.prototype,
    'getProductTypeByProductTypeID',
  ).mockImplementation((productTypeID: string): Promise<ProductType | undefined> => {
    world.productTypeLoads.push(productTypeID);

    const held = world.productType;

    return Promise.resolve(
      held !== undefined && held.getProductTypeID() === productTypeID ? held : undefined,
    );
  });
}

/** What the two repository-backed loads hold, and the record of what was asked of them. */
interface LoadableCatalogWorld {
  /** The one product that can be loaded, or none. Mutable, so a case can programme a miss. */
  product: Product | undefined;

  /** The one product type that can be loaded, or none. */
  productType: ProductType | undefined;

  /** Every product identifier the load was asked for, in order. */
  readonly productLoads: string[];

  /** Every product-type identifier the load was asked for, in order. */
  readonly productTypeLoads: string[];
}

/**
 * Record that an unpublished member was invoked, then refuse.
 *
 * Both halves matter. The RECORD is what lets every test assert, unconditionally, that no unpublished
 * service member was touched - including the tests where the handler is expected to refuse long
 * before a service is reached. The REFUSAL is what makes a leak impossible to miss: the thrown error
 * funnels through the shipped error mapper and turns the response into a server-shaped failure, so a
 * test expecting a 400 or a 200 fails on the status as well as on the record.
 */
function refuseUnpublishedCall(touched: string[], member: string): never {
  touched.push(member);
  throw new Error(
    `${member} was invoked, and no route of the catalog-query capability publishes it. ` +
      'The shipped entrypoint documents it as a deliberate non-exposure.',
  );
}

// ---------------------------------------------------------------------------
// The test bed
// ---------------------------------------------------------------------------

/** A promise a test opens by hand, so a call can be held in flight deterministically. */
interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

/**
 * Build a gate.
 *
 * Used only where the point is that a SECOND request arriving
 * while the first is still running must not start a second execution. Holding the first call open
 * explicitly is how that is proven without a timer, a sleep or any dependence on scheduling.
 */
function makeGate(): Gate {
  let open: () => void = (): undefined => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** What each published operation answers with, and where a test programmes a failure instead. */
interface CatalogQueryOutcomes {
  /** What `findProducts` resolves to. */
  productPage: ProductPage;

  /**
   * When set, `findProducts` throws this instead of resolving.
   *
   * Typed `Error` rather than `unknown` deliberately, and it costs nothing: the non-`Error` arm of the
   * mapper is still exercised, by a PLAIN OBJECT that satisfies the `Error` interface structurally
   * while failing `instanceof Error` at run time. That is the exact case the shipped mapper argues
   * about - "a thrown string, or a plain object carrying a `message` member, is a structure the
   * logger's key-based policy would traverse and emit verbatim" - so it is the more valuable fixture
   * as well as the one that keeps this suite free of an escape hatch.
   */
  findProductsRejectsWith: Error | undefined;

  /** What `getUnusedProductOptions` resolves to. */
  unusedOptions: readonly CatalogSelectOptionProjection[];

  /** What `getUnusedProductOptionGroups` resolves to. */
  unusedOptionGroups: readonly CatalogSelectOptionProjection[];

  /** When set, `getUnusedProductOptions` throws this instead of resolving. */
  unusedOptionsRejectsWith: Error | undefined;

  /** What `getFormattedOptionGroups` answers. */
  formattedOptionGroups: readonly FormattedOptionGroup[];

  /** What `deleteProduct` answers. `false` is the ported delete-context refusal, not an error. */
  productDeleted: boolean;

  /** When set, `processProduct_updateSkus` throws this - the SKU batch bound's shape. */
  updateSkusRejectsWith: Error | undefined;

  /**
   * Save-context rules to record on the entity instead of validating, as `[property, message]` pairs.
   *
   * ★★ THE FAILURE IS PROGRAMMED ON THE ENTITY, NOT AS A THROW, because that is the ported contract - the
   * three saves RETURN the entity with its errors and never raise for a failed rule. What a case asserts
   * is therefore that the ADAPTER reads the register and answers 400, which is a transport decision, and
   * that the messages published are the register's own server-authored ones.
   */
  saveProductRuleFailures: readonly (readonly [string, string])[];
  saveProductTypeRuleFailures: readonly (readonly [string, string])[];
  saveBrandRuleFailures: readonly (readonly [string, string])[];

  /** When set, every published operation awaits it before answering. */
  gate: Promise<void> | undefined;
}

/** The two arguments `getUnusedProductOptions` is called with, recorded verbatim. */
interface RecordedUnusedOptionsCall {
  readonly productID: string;
  readonly existingOptionGroupIDList: string;
}

/**
 * One process-method call: the BOUND ENTITY and the payload, both by reference.
 *
 * The entity is what proves the hydration - a case asserts that the instance handed to the service is the
 * one the loader answered for the identifier the request named, which is the whole of what "hydrate IDs
 * through request-scope loaders" means. The payload is what proves the schema forwarded absence AS
 * absence rather than substituting a value.
 */
interface RecordedProductCall<TPayload> {
  readonly product: Product;
  readonly input: TPayload;
}

/**
 * One save call: the bound entity and its payload.
 *
 * Generic over BOTH, because three different entities are saved through this capability and each carries a
 * different payload. The member is named `entity` rather than `product`/`productType`/`brand` so the three
 * records read identically at the assertion site, which is what lets one helper compare all three.
 */
interface RecordedSaveCall<TEntity, TPayload> {
  readonly entity: TEntity;
  readonly data: TPayload;
}

/** One fully wired subject plus everything a test needs to observe about it. */
interface CatalogQueryTestBed {
  /** Invoke the subject with a fresh event and context. */
  readonly invoke: (
    overrides?: EventOverrides,
    awsRequestId?: string,
  ) => Promise<APIGatewayProxyResult>;

  /** The subject itself, for the few tests that drive two invocations concurrently. */
  readonly subject: CatalogQueryLambdaHandler;

  /** Programmable answers. Mutable by design; a fresh bed is built for every test. */
  readonly outcomes: CatalogQueryOutcomes;

  /** Every criteria object `findProducts` was handed, in call order. */
  readonly findProductsCalls: ProductQueryCriteria[];

  /** Every argument pair `getUnusedProductOptions` was handed, in call order. */
  readonly unusedProductOptionsCalls: RecordedUnusedOptionsCall[];

  /** Every list string `getUnusedProductOptionGroups` was handed, in call order. */
  readonly unusedProductOptionGroupsCalls: string[];

  /** Every product `getFormattedOptionGroups` was handed, in call order. */
  readonly formattedOptionGroupsCalls: Product[];

  /** Every option array `getOptionsForSelect` was handed, BY REFERENCE and in order. */
  readonly optionsForSelectCalls: (readonly Option[])[];

  /** The nine mutation call records, each holding the bound entity and the payload verbatim. */
  readonly addOptionGroupCalls: RecordedProductCall<AddOptionGroupPayload>[];
  readonly addOptionCalls: RecordedProductCall<AddOptionPayload>[];
  readonly updateSkusCalls: RecordedProductCall<UpdateSkusPayload>[];
  readonly deleteDefaultImageCalls: RecordedProductCall<DeleteDefaultImagePayload>[];
  readonly updateDefaultImageFileNamesCalls: Product[];
  readonly saveProductCalls: RecordedSaveCall<Product, SaveProductPayload>[];
  readonly saveProductTypeCalls: RecordedSaveCall<ProductType, SaveProductTypePayload>[];
  readonly saveBrandCalls: RecordedSaveCall<Brand, SaveBrandPayload>[];
  readonly deleteProductCalls: Product[];

  /** The statement executor the graph was built over, so a case can programme a load or a miss. */
  readonly executor: CatalogExecutor;

  /** The two repository-backed loads' world, so a case can programme a miss or read what was asked. */
  readonly world: LoadableCatalogWorld;

  /** Any unpublished service member that was reached. Asserted EMPTY by every test. */
  readonly unpublishedTouches: string[];

  /** Every line the subject emitted, raw. */
  readonly logLines: string[];

  /** How many times the composition root was resolved and a request scope opened. */
  readonly counters: { rootsResolved: number; scopesOpened: number };

  /** Every input used to open a request scope, in invocation order. */
  readonly scopeInputs: readonly (RequestScopeInput | undefined)[];
}

/**
 * Wire one subject over hand-written in-memory doubles.
 *
 * A FRESH BED PER TEST, always. The shipped handler is created per INSTANCE
 * rather than at module scope, so building a new subject is the whole of the isolation this suite
 * needs - there is no module state to reset, no global to restore and no cache to clear. Recorded
 * arrays are created here too, so no observation can leak from one test into the next.
 */
function makeTestBed(): CatalogQueryTestBed {
  const findProductsCalls: ProductQueryCriteria[] = [];
  const unusedProductOptionsCalls: RecordedUnusedOptionsCall[] = [];
  const unusedProductOptionGroupsCalls: string[] = [];
  const formattedOptionGroupsCalls: Product[] = [];
  const optionsForSelectCalls: (readonly Option[])[] = [];
  const addOptionGroupCalls: RecordedProductCall<AddOptionGroupPayload>[] = [];
  const addOptionCalls: RecordedProductCall<AddOptionPayload>[] = [];
  const updateSkusCalls: RecordedProductCall<UpdateSkusPayload>[] = [];
  const deleteDefaultImageCalls: RecordedProductCall<DeleteDefaultImagePayload>[] = [];
  const updateDefaultImageFileNamesCalls: Product[] = [];
  const saveProductCalls: RecordedSaveCall<Product, SaveProductPayload>[] = [];
  const saveProductTypeCalls: RecordedSaveCall<ProductType, SaveProductTypePayload>[] = [];
  const saveBrandCalls: RecordedSaveCall<Brand, SaveBrandPayload>[] = [];
  const deleteProductCalls: Product[] = [];
  const unpublishedTouches: string[] = [];
  const logLines: string[] = [];
  const counters = { rootsResolved: 0, scopesOpened: 0 };
  const scopeInputs: (RequestScopeInput | undefined)[] = [];

  // The product fixture is built ONCE per bed and is the entity every product-bound operation binds to.
  // Its identifier is the saved-row sentinel, so `isNew()` is false and the routed contract's "an existing
  // row, named by identifier" policy is exercised rather than sidestepped.
  const loadableProduct = makeProductFixture({ productID: FIRST_PRODUCT_ID });
  const loadableProductType = loadableProduct.getProductType();

  const world: LoadableCatalogWorld = {
    product: loadableProduct,
    productType: loadableProductType,
    productLoads: [],
    productTypeLoads: [],
  };

  const outcomes: CatalogQueryOutcomes = {
    productPage: makeProductPage([]),
    findProductsRejectsWith: undefined,
    unusedOptions: [],
    unusedOptionGroups: [],
    unusedOptionsRejectsWith: undefined,
    formattedOptionGroups: [],
    productDeleted: true,
    updateSkusRejectsWith: undefined,
    saveProductRuleFailures: [],
    saveProductTypeRuleFailures: [],
    saveBrandRuleFailures: [],
    gate: undefined,
  };

  const passThroughGate = async (): Promise<void> => {
    const gate = outcomes.gate;
    if (gate !== undefined) {
      await gate;
    }
  };

  const productService: ProductServiceDouble = {
    findProducts: async (criteria: ProductQueryCriteria): Promise<ProductPage> => {
      // The criteria object is recorded BY REFERENCE deliberately: the subject builds a fresh one per
      // invocation and never retains it, so identity is exactly what a delegation assertion wants.
      findProductsCalls.push(criteria);
      await passThroughGate();
      if (outcomes.findProductsRejectsWith !== undefined) {
        throw outcomes.findProductsRejectsWith;
      }
      return outcomes.productPage;
    },

    // ★★★ NINE OF THE FOURTEEN TRIPWIRES BECAME REAL ANSWERS, AND THAT IS THE CRITICAL FINDING'S FIX.
    // This block used to refuse all fourteen. A code review recorded that eleven of them are AAP 0.4.2
    // mapped actions with "no transport schema, dispatch, DTO or test", so the tripwires were asserting
    // the incompleteness rather than guarding against it. The nine product members below now RECORD what
    // they were handed and answer, so a case can assert the argument the handler bound; the five that
    // remain refusals are the ones the source genuinely puts out of reach, each still naming the legacy
    // locator its non-exposure is argued from.

    getFormattedOptionGroups: (product): FormattedOptionGroup[] => {
      formattedOptionGroupsCalls.push(product);

      return [...outcomes.formattedOptionGroups];
    },

    processProduct_addOptionGroup: async (product, input): Promise<Product> => {
      addOptionGroupCalls.push({ product, input });
      await passThroughGate();

      return product;
    },

    processProduct_addOption: async (product, input): Promise<Product> => {
      addOptionCalls.push({ product, input });
      await passThroughGate();

      return product;
    },

    processProduct_updateSkus: async (product, input): Promise<Product> => {
      updateSkusCalls.push({ product, input });
      await passThroughGate();

      if (outcomes.updateSkusRejectsWith !== undefined) {
        throw outcomes.updateSkusRejectsWith;
      }

      return product;
    },

    processProduct_deleteDefaultImage: async (product, input): Promise<Product> => {
      deleteDefaultImageCalls.push({ product, input });
      await passThroughGate();

      return product;
    },

    processProduct_updateDefaultImageFileNames: async (product): Promise<Product> => {
      updateDefaultImageFileNamesCalls.push(product);
      await passThroughGate();

      return product;
    },

    saveProduct: async (product, data): Promise<Product> => {
      saveProductCalls.push({ entity: product, data });
      await passThroughGate();

      // ★★ A FAILED SAVE-CONTEXT RULE IS RECORDED ON THE ENTITY AND THE ENTITY IS STILL RETURNED, which
      // is the ported contract: the legacy `HibachiService.save` returns the same entity whether it
      // validated or not, and `src/services/productService.ts` records that its two throwing classes were
      // REMOVED for exactly that reason. Programming the failure this way is what lets a case assert that
      // the ADAPTER turns the register into a 400 rather than the service throwing one.
      for (const [propertyIdentifier, message] of outcomes.saveProductRuleFailures) {
        product.addError(propertyIdentifier, message);
      }

      return product;
    },

    saveProductType: async (productType, data): Promise<ProductType> => {
      saveProductTypeCalls.push({ entity: productType, data });
      await passThroughGate();

      for (const [propertyIdentifier, message] of outcomes.saveProductTypeRuleFailures) {
        productType.addError(propertyIdentifier, message);
      }

      return productType;
    },

    deleteProduct: async (product): Promise<boolean> => {
      deleteProductCalls.push(product);
      await passThroughGate();

      return outcomes.productDeleted;
    },

    // --- The five that stay refusals -----------------------------------------
    // Out of scope by AAP 0.9.5 though reachable from an in-scope file, or owned by another capability.
    // Each names the legacy locator its non-exposure is argued from.
    getProductSkusBySelectedOptions: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.getProductSkusBySelectedOptions [L104]',
      ),
    loadDataFromFile: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.loadDataFromFile [L65]'),
    processProduct_addProductReview: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_addProductReview [L157]',
      ),
    processProduct_addSubscriptionTerm: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_addSubscriptionTerm [L173]',
      ),
    processProduct_uploadDefaultImage: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_uploadDefaultImage [L235]',
      ),
  };

  const optionService: OptionServiceDouble = {
    getUnusedProductOptions: async (
      productID: string,
      existingOptionGroupIDList: string,
    ): Promise<readonly CatalogSelectOptionProjection[]> => {
      unusedProductOptionsCalls.push({ productID, existingOptionGroupIDList });
      await passThroughGate();
      if (outcomes.unusedOptionsRejectsWith !== undefined) {
        throw outcomes.unusedOptionsRejectsWith;
      }
      return outcomes.unusedOptions;
    },

    getUnusedProductOptionGroups: async (
      existingOptionGroupIDList: string,
    ): Promise<readonly CatalogSelectOptionProjection[]> => {
      unusedProductOptionGroupsCalls.push(existingOptionGroupIDList);
      await passThroughGate();
      return outcomes.unusedOptionGroups;
    },

    getOptionsForSelect: (options): SelectOption[] => {
      // Recorded BY REFERENCE, and that is the assertion this double exists for: the handler loads the
      // caller's named options and hands the array straight through, so identity - and above all ORDER -
      // is what a delegation case wants to inspect.
      optionsForSelectCalls.push(options);

      return options.map((option): SelectOption => ({
        name: option.getOptionName() ?? '',
        value: option.getOptionID(),
      }));
    },
  };

  const brandService: BrandServiceDouble = {
    saveBrand: async (brand, data): Promise<Brand> => {
      saveBrandCalls.push({ entity: brand, data });
      await passThroughGate();

      for (const [propertyIdentifier, message] of outcomes.saveBrandRuleFailures) {
        brand.addError(propertyIdentifier, message);
      }

      return brand;
    },
  };

  // The programmed answers reach the REAL services through their prototypes. Installed here, once per
  // bed, so a test that never invokes the subject still gets its tripwires armed.
  installServiceAnswers(productService, optionService, brandService);

  // And the two repository-backed entity loads, on the same terms and for the same reason.
  installEntityLoads(world);

  // ONE REAL GRAPH PER BED, built lazily on first resolution and reused, which is what the production
  // memo does per container. `bootstrapCompositionRoot` with overrides bypasses the module memo by
  // design, so nothing is left behind for a sibling file - and `resetCompositionRoot()` in the hooks is
  // a second belt.
  const executor = new CatalogExecutor();

  let rootPromise: Promise<CompositionRoot> | undefined;
  const openRoot = async (): Promise<CompositionRoot> => {
    const inner = await bootstrapCompositionRoot({
      executor,
      environment: CATALOG_ENVIRONMENT,
    });

    return new RecordingCompositionRoot(inner, counters, scopeInputs);
  };

  // The logger is pinned to `debug` AND redirected to a recording sink. Pinning is what makes the
  // suite independent of `LOG_LEVEL`: a pinned threshold is never resolved from the environment, so
  // the emissions asserted below are the same under an empty environment as under any other.
  const sink: LogSink = (line: string): void => {
    logLines.push(line);
  };
  const recordingLogger = logger.withSink(sink).withLevel('debug');

  const subject = createCatalogQueryHandler({
    compositionRoot: (): Promise<CompositionRoot> => {
      counters.rootsResolved += 1;
      rootPromise ??= openRoot();

      return rootPromise;
    },
    logger: recordingLogger,
  });

  return {
    invoke: async (
      overrides: EventOverrides = {},
      awsRequestId: string = INVOCATION_ID,
    ): Promise<APIGatewayProxyResult> =>
      await subject(makeEvent(overrides), makeContext(awsRequestId)),
    subject,
    outcomes,
    findProductsCalls,
    unusedProductOptionsCalls,
    unusedProductOptionGroupsCalls,
    formattedOptionGroupsCalls,
    optionsForSelectCalls,
    addOptionGroupCalls,
    addOptionCalls,
    updateSkusCalls,
    deleteDefaultImageCalls,
    updateDefaultImageFileNamesCalls,
    saveProductCalls,
    saveProductTypeCalls,
    saveBrandCalls,
    deleteProductCalls,
    executor,
    world,
    unpublishedTouches,
    logLines,
    counters,
    scopeInputs,
  };
}

/** The query string for one operation, with the selector in place. */
function queryFor(
  operation: string,
  parameters: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  // ★★ `pageRecordsShow` IS SUPPLIED FOR EVERY `findProducts` REQUEST THAT DOES NOT NAME ITS OWN.
  // Static-performance review (finding F10) made the page size a REQUIRED member of the routed
  // contract, because omitting it means THE WHOLE PRODUCT RESULT SET to `ProductService.findProducts`
  // and this handler then projects and stringifies it into one body. Folding a default in here keeps
  // the cases that are ABOUT something else from having to restate it; the cases that are about the
  // bound name it explicitly and are unaffected by this line.
  const pageDefault =
    operation === 'findProducts' && parameters['pageRecordsShow'] === undefined
      ? { pageRecordsShow: '25' }
      : {};

  return { operation, ...pageDefault, ...parameters };
}

/**
 * The five operations served on the first declared method, with their criteria in the query string.
 *
 * ★★★ THIS LIST WAS THREE, AND THE TWO ADDITIONS ARE PART OF THE CRITICAL FINDING'S FIX.
 * `getFormattedOptionGroups` [model/service/ProductService.cfc:L70] and `getOptionsForSelect`
 * [model/service/OptionService.cfc:L55] are reads - both are SYNCHRONOUS pure transformations in the
 * services tier - and both were previously asserted UNREACHABLE on the ground that this tier could obtain
 * no entity to hand them. That ground was false: `RequestScope.entityLoaders` publishes read-only loads by
 * identifier, so each is now named by identifier and bound behind the composition root.
 */
const READ_OPERATIONS: readonly CatalogQueryOperation[] = [
  'findProducts',
  'getFormattedOptionGroups',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
  'getOptionsForSelect',
];

/**
 * The nine operations served on the second declared method, with their payload in the request body.
 *
 * ★★★ EVERY ONE OF THESE WAS A NON-EXPOSURE TRIPWIRE, and the review that found them recorded the
 * consequence precisely: "catalog persistence and all `BrandService` functionality" were unreachable from
 * Lambda. Nine of the eleven omitted actions are writes; the remaining two are the reads above.
 */
const MUTATION_OPERATIONS: readonly CatalogQueryOperation[] = [
  'processProduct_addOptionGroup',
  'processProduct_addOption',
  'processProduct_updateSkus',
  'processProduct_deleteDefaultImage',
  'processProduct_updateDefaultImageFileNames',
  'saveProduct',
  'saveProductType',
  'deleteProduct',
  'saveBrand',
];

/**
 * All fourteen published operations, in the order the subject documents them.
 *
 * ASSEMBLED FROM THE TWO LISTS rather than written a third time, so the split and the whole cannot
 * disagree - and a case that loops over "every published operation" provably covers both halves.
 */
const PUBLISHED_OPERATIONS: readonly CatalogQueryOperation[] = [
  ...READ_OPERATIONS,
  ...MUTATION_OPERATIONS,
];

/**
 * A minimal, valid QUERY-STRING parameter set for each published operation.
 *
 * The nine mutations map to the EMPTY set, and that is asserted behaviour rather than a filler: every
 * mutation publishes no query parameter at all, so anything beyond the selector is refused rather than
 * ignored. Their payloads live in {@link VALID_BODIES}.
 */
const VALID_PARAMETERS: Readonly<Record<CatalogQueryOperation, Readonly<Record<string, string>>>> =
  {
    findProducts: { keyword: 'jorden', pageRecordsShow: '25' },
    getFormattedOptionGroups: { productID: FIRST_PRODUCT_ID },
    getUnusedProductOptions: {
      productID: FIRST_PRODUCT_ID,
      existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST,
    },
    getUnusedProductOptionGroups: { existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST },
    getOptionsForSelect: { optionIDs: `${FIRST_OPTION_ID},${SECOND_OPTION_ID}` },
    processProduct_addOptionGroup: {},
    processProduct_addOption: {},
    processProduct_updateSkus: {},
    processProduct_deleteDefaultImage: {},
    processProduct_updateDefaultImageFileNames: {},
    saveProduct: {},
    saveProductType: {},
    deleteProduct: {},
    saveBrand: {},
  };

/**
 * A minimal, valid JSON BODY for each published operation, or `undefined` for the five reads.
 *
 * ★★ EVERY MUTATION BODY NAMES AN EXISTING ROW BY IDENTIFIER, which is the routed transport policy the
 * subject documents: row CREATION is not published, because a routed creation protocol is an
 * entity-construction concern the AAP describes nowhere. Each identifier is a saved-row sentinel, so
 * `isNew()` is false on every entity these bodies reach.
 *
 * ★ NO BODY CARRIES AN `operation` MEMBER. The selector is the query-string parameter for all fourteen,
 * and the mutation schemas are strict objects with no such member - so a body that tried to name one would
 * be refused as an unrecognized member. That is asserted directly rather than left implicit.
 */
const VALID_BODIES: Readonly<
  Record<CatalogQueryOperation, Readonly<Record<string, unknown>> | undefined>
> = {
  findProducts: undefined,
  getFormattedOptionGroups: undefined,
  getUnusedProductOptions: undefined,
  getUnusedProductOptionGroups: undefined,
  getOptionsForSelect: undefined,
  processProduct_addOptionGroup: {
    productID: FIRST_PRODUCT_ID,
    optionGroup: SENTINEL_OPTION_GROUP_ID,
  },
  processProduct_addOption: { productID: FIRST_PRODUCT_ID, option: FIRST_OPTION_ID },
  processProduct_updateSkus: {
    productID: FIRST_PRODUCT_ID,
    updatePriceFlag: 1,
    price: SENTINEL_UNIT_PRICE,
  },
  processProduct_deleteDefaultImage: { productID: FIRST_PRODUCT_ID },
  processProduct_updateDefaultImageFileNames: { productID: FIRST_PRODUCT_ID },
  saveProduct: { productID: FIRST_PRODUCT_ID, productName: 'Renamed Product' },
  saveProductType: { productTypeID: SENTINEL_PRODUCT_TYPE_ID, productTypeName: 'Merchandise' },
  deleteProduct: { productID: FIRST_PRODUCT_ID },
  saveBrand: { brandID: SENTINEL_BRAND_ID, brandName: 'Renamed Brand' },
};

/**
 * Invoke one published operation the way a caller would have to.
 *
 * ★★★ ONE ENTRY POINT FOR ALL FOURTEEN, so a loop over the published surface drives each on the method it
 * is served on, with its criteria in the place that operation carries them. Without it, every such loop
 * would have to branch - and a loop that branched would be a loop that could get the branch wrong and
 * still pass.
 *
 * The two prerequisites the mutations need are established here as well: the brand and the two options are
 * made loadable, because nine of the fourteen bind an entity and a case about SOMETHING ELSE should not
 * have to know that. A case that is ABOUT a miss programmes the miss explicitly and is unaffected, since
 * this only ADDS to the known sets.
 */
async function invokeOperation(
  bed: CatalogQueryTestBed,
  operation: CatalogQueryOperation,
  overrides: EventOverrides = {},
): Promise<APIGatewayProxyResult> {
  bed.executor.knownBrandIDs.add(SENTINEL_BRAND_ID);
  bed.executor.knownOptionIDs.add(FIRST_OPTION_ID);
  bed.executor.knownOptionIDs.add(SECOND_OPTION_ID);

  const body = VALID_BODIES[operation];

  return await bed.invoke({
    method: methodForOperation(operation),
    query: queryFor(operation, VALID_PARAMETERS[operation]),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...overrides,
  });
}

/**
 * The `result` payload of a served document, or a failure naming what it carried instead.
 *
 * ★ NEEDED BECAUSE THE DOCUMENT IS A UNION NOW. A served response can carry `result` OR `unresolved`, and
 * the two are separate arms so neither can be read off the other without narrowing. Reading through this
 * helper means a case asserting a payload fails with "it was unresolved" rather than with a property
 * access on a type that does not have it.
 */
function readServedPayload(response: APIGatewayProxyResult): unknown {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than a payload`,
    );
  }

  return document.result;
}

/** The `unresolved` reason of a served document, or a failure naming what it carried instead. */
function readUnresolvedReason(response: APIGatewayProxyResult): string {
  const document = readServedBody(response).result;

  if (!('unresolved' in document)) {
    throw new Error('the response carried a payload rather than an unresolved outcome');
  }

  return document.unresolved;
}

// ---------------------------------------------------------------------------
// Reading one element, one page, one row set, one field report
//
// `noUncheckedIndexedAccess` is on and a postfix `!` is not used anywhere in this file, so each
// reader below narrows explicitly and fails with a described error rather than asserting an index is
// populated.
// ---------------------------------------------------------------------------

/** The element at `index`, or a described failure. */
function atIndex<TElement>(items: readonly TElement[], index: number): TElement {
  const found = items[index];
  if (found === undefined) {
    throw new Error(`expected an element at index ${String(index)}, found none`);
  }
  return found;
}

/**
 * The product page a served response carries.
 *
 * ★ NARROWED TWICE NOW, AND BOTH NARROWINGS ARE STRUCTURAL - no cast and no assertion. The DOCUMENT is a
 * union of a payload arm and an `unresolved` arm, and the PAYLOAD is then a union of seven projections of
 * which only the page declares `records`. Both steps are `in` tests, which the compiler narrows on, so a
 * response carrying the wrong shape fails with a described error rather than with an unchecked access.
 */
function readProductPage(response: APIGatewayProxyResult): CatalogProductPageProjection {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than a page`,
    );
  }

  const payload = document.result;

  if (!('records' in payload)) {
    throw new Error('expected a product page, and the response carried another projection');
  }

  return payload;
}

/** The select rows a served response carries, narrowed the same structural way. */
function readSelectRows(response: APIGatewayProxyResult): readonly CatalogSelectOptionProjection[] {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than rows`,
    );
  }

  const payload = document.result;

  if (!Array.isArray(payload)) {
    throw new Error('expected an array of select rows, and the response carried an object');
  }

  // ★ THE ELEMENT TYPE IS NARROWED BY THE OPERATION, NOT BY INSPECTION. Three operations answer
  // `SelectOption` rows and one answers `FormattedOptionGroup` rows, and the two shapes are distinguishable
  // - a group declares `options`. Asserting that here is what keeps this reader honest for the three it is
  // used by without silently accepting the fourth.
  for (const row of payload) {
    if (isRecord(row) && 'options' in row) {
      throw new Error(
        'expected select rows, and the response carried formatted option GROUPS; read those with ' +
          'readFormattedOptionGroups instead',
      );
    }
  }

  return payload as readonly CatalogSelectOptionProjection[];
}

/** The formatted option groups a served response carries. */
function readFormattedOptionGroups(
  response: APIGatewayProxyResult,
): readonly FormattedOptionGroup[] {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than groups`,
    );
  }

  const payload = document.result;

  if (!Array.isArray(payload)) {
    throw new Error(
      'expected an array of formatted option groups, and the response carried an object',
    );
  }

  return payload as readonly FormattedOptionGroup[];
}

/** The field-level report a client-shaped failure carries, or a described failure. */
function readFieldIssues(
  response: APIGatewayProxyResult,
): readonly { readonly path: string; readonly message: string }[] {
  const fields = readFailureBody(response).error.fields;
  if (fields === undefined) {
    throw new Error(`expected a field-level report, and the body carried none: ${response.body}`);
  }
  return fields;
}

/** Every decoded line the subject emitted. */
function decodedLines(bed: CatalogQueryTestBed): readonly RecordedLogLine[] {
  return bed.logLines.map(decodeLogLine);
}

/**
 * A driver-shaped failure: an `Error` whose message embeds a statement AND a value bound into it.
 *
 * THE FIXTURE IS THE WHOLE ARGUMENT for why the mapper is selective rather than a pass-through, so it
 * is built to be maximally leaky: a `SELECT`, a physical table name and a bound literal in one
 * message, plus a machine code of the shape a driver reports. Nothing in it is a real credential, a
 * real host or a real value from anywhere - `sentinel-bound-value` is invented for this file. Built by
 * `Object.assign` so the returned type is the intersection the assertions need, with no cast.
 */
function driverShapedFailure(): Error {
  return Object.assign(
    new Error(
      "select productID, productName from SwProduct where productName like 'sentinel-bound-value'",
    ),
    { name: 'DriverError', code: 'ER_BAD_FIELD_ERROR' },
  );
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('catalogQueryHandler', () => {
  let bed: CatalogQueryTestBed;

  beforeEach(() => {
    resetCompositionRoot();
    appConfig.reset();
    bed = makeTestBed();
  });

  // A PER-SUITE `afterEach`, KEPT DELIBERATELY ALONGSIDE THE GLOBAL ONE. `tests/setup.ts` already
  // registers a global hook that restores mocks and real timers, and `vitest.config.ts` sets
  // `restoreMocks` and `clearMocks`. This one is complementary rather than redundant: it states the
  // obligation locally, so a spy added to this file later is restored by this file's own contract
  // instead of depending on configuration two directories away. It also empties the recorded log
  // lines, which no global hook knows about.
  afterEach(() => {
    vi.restoreAllMocks();
    bed.logLines.length = 0;
    // The composition memo and `appConfig` are module state. Every bed builds its graph through the
    // override arm, which bypasses the memo by design, and clearing both here means this file leaves
    // neither behind for a sibling suite in the same worker.
    resetCompositionRoot();
    appConfig.reset();
  });

  it('publishes a Lambda entry point, without any test invoking it', () => {
    // The module-level `handler` is created when the container loads the module. Asserting only that
    // it EXISTS is deliberate: invoking it would reach the real composition root, the real
    // configuration and therefore a connection pool, which this suite must never do. The factory
    // below is what every other test drives, and it is a DIFFERENT instance - each handler owns its
    // own composition-root resolver, which is why building one per test is the whole of the isolation.
    expect(typeof handler).toBe('function');
    expect(bed.subject).not.toBe(handler);
    expect(bed.counters.rootsResolved).toBe(0);
    expect(bed.counters.scopesOpened).toBe(0);
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: route admission
  // =========================================================================

  describe('concern 1, request parsing: admission through the shipped route table', () => {
    it('serves the canonical route this capability owns', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      expect(CATALOG_ROUTE.path).toBe('/catalog/products');
      // ★★★ THIS LITERAL WAS `'GET'`, AND WIDENING IT IS PART OF THE CRITICAL FINDING'S FIX. The row now
      // declares a COMMA LIST: the five reads answer on the first method and the nine mutations on the
      // second. Pinned verbatim here, in declaration order, because the order is load-bearing -
      // `methodForOperation` reads index 0 for a read and index 1 for a mutation.
      expect(CATALOG_ROUTE.methods).toBe('GET,POST');
      expect(CATALOG_ROUTE.action).toBe('queryCatalog');
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('matches the path case-insensitively', async () => {
      // CFML parity [Application.cfc:L130, L133]: the routing convention being replaced compared
      // subsystem names with `eq` and with `listFindNoCase`, both case-insensitive. The router folds
      // case for that reason, and the casing written in the route table is therefore a readability
      // choice rather than part of the contract.
      const response = await bed.invoke({
        path: CATALOG_ROUTE.path.toUpperCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('matches the method case-insensitively', async () => {
      // ONE method is sent, not the row's whole comma list: `listFindNoCase('GET,POST','GET,POST')`
      // answers 0, so a request whose method literally WERE the declaration would be unmatched. Taking
      // the first declared method reads the table the way the router reads it.
      const response = await bed.invoke({
        method: firstDeclaredCatalogMethod().toLowerCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('canonicalizes a path carrying a trailing, doubled or absent leading separator', async () => {
      const untidy = `${CATALOG_ROUTE.path.replace('/catalog', '//catalog')}/`;
      const response = await bed.invoke({
        path: untidy,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('answers a sibling capability\u2019s route as an unmatched route', async () => {
      const response = await bed.invoke({
        path: SKU_RESOLUTION_ROUTE.path,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
      expect(readFailureBody(response).error.category).toBe('routeNotFound');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('answers another capability\u2019s method and path as an unmatched route', async () => {
      const response = await bed.invoke({
        method: PROMOTION_APPLICATION_ROUTE.methods,
        path: PROMOTION_APPLICATION_ROUTE.path,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('refuses a method the owned route does not declare', async () => {
      // ★★ THE EXAMPLE USED TO BE `POST`, AND `POST` IS NOW DECLARED. `DELETE` is chosen instead
      // because the row declares `GET,POST` and nothing else, and because the deletion this capability
      // DOES publish travels as a POST operation rather than as an HTTP verb - see the transport policy
      // on the subject. Asserting the row does not carry it keeps that policy checkable.
      expect(listToArray(CATALOG_ROUTE.methods)).not.toContain('DELETE');

      const response = await bed.invoke({
        method: 'DELETE',
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
      expect(readFailureBody(response).error.category).toBe('routeNotFound');
    });

    it('refuses a path no row of the table declares', async () => {
      const response = await bed.invoke({
        path: '/catalog/products/extra',
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
    });

    it('publishes the unmatched-route envelope without echoing the requested path', async () => {
      const requested = '/catalog/products/unknown-segment';
      const response = await bed.invoke({ path: requested });
      const failure = readFailureBody(response).error;

      expect(failure.category).toBe('routeNotFound');
      expect(failure.message).toBe('The requested route does not exist.');
      expect(failure.requestId).toBe(INVOCATION_ID);
      expect(failure.fields).toBeUndefined();
      expect(response.body).not.toContain('unknown-segment');
    });

    it('opens no request scope and resolves no composition root for an unmatched route', async () => {
      await bed.invoke({ path: '/nothing/here' });

      // The bound this proves is a CORRECTNESS one: nothing is constructed for a request that was
      // never this capability's to serve, so a refused request cannot reach a service or a statement.
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.unpublishedTouches).toEqual([]);
    });
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: the admission gate
  // =========================================================================

  describe('concern 1, request parsing: the admission gate', () => {
    it('refuses a request carrying no authorizer context', async () => {
      const response = await bed.invoke({
        authorizer: null,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(401);
      expect(readFailureBody(response).error.category).toBe('unauthenticated');
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('refuses every context that names no usable account', async () => {
      for (const authorizer of [
        {},
        { unrelated: 'x' },
        { accountID: '' },
        { accountID: '   ' },
        { accountID: 42 },
      ]) {
        const fresh = makeTestBed();

        const response = await fresh.invoke({
          authorizer,
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(401);
        expect(fresh.counters.rootsResolved).toBe(0);
        expect(fresh.findProductsCalls).toEqual([]);
      }
    });

    it('refuses before the selector, parameter closure and schema are evaluated', async () => {
      for (const query of [
        {},
        { operation: 'nonsense' },
        queryFor('findProducts', { keyword: 'jorden', nosuchparameter: 'x' }),
        queryFor('findProducts'),
      ]) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({ authorizer: null, query });

        expect(response.statusCode).toBe(401);
        expect(fresh.counters.rootsResolved).toBe(0);
      }
    });

    it('still resolves the route first, so a wrong path is a 404 rather than a 401', async () => {
      const unmatched = await bed.invoke({ authorizer: null, path: '/nothing/here' });
      const sibling = await bed.invoke({
        authorizer: null,
        path: SKU_RESOLUTION_ROUTE.path,
      });

      expect(unmatched.statusCode).toBe(404);
      expect(sibling.statusCode).toBe(404);
    });

    it('publishes no claim name, internal reason or field detail in the refusal', async () => {
      const response = await bed.invoke({ authorizer: null });
      const failure = readFailureBody(response).error;

      expect(failure.message).toBe('The request was not served.');
      expect(failure.fields).toBeUndefined();
      expect(response.body).not.toContain('accountID');
      expect(response.body).not.toContain('authoriz');
      expect(response.body).not.toContain('noAuthorizerContext');
      expect(response.body).not.toContain('noAccountClaim');
      expect(failure.requestId).toBe(INVOCATION_ID);
    });

    it('emits no authentication challenge because no scheme is declared', async () => {
      const response = await bed.invoke({ authorizer: null });

      // ★ TWO HEADERS, STILL CLOSED. `x-content-type-options: nosniff` briefly joined the shared
      // response set and a code review removed it as an invented HTTP semantic (AAP 0.8.1); what this
      // case asserts is unchanged - no `www-authenticate`, because this route declares no challenge
      // scheme.
      expect(
        Object.keys(response.headers ?? {})
          .map((name): string => name.toLowerCase())
          .sort(),
      ).toEqual(['cache-control', 'content-type']);
    });

    it('logs only the closed refusal category and no caller-authored claim text', async () => {
      await bed.invoke({ authorizer: null });

      const warnings = decodedLines(bed).filter((line) => line.level === 'warn');
      expect(warnings).toHaveLength(2);
      expect(atIndex(warnings, 0).message).toContain('no caller principal');
      expect(atIndex(warnings, 0).message).toContain('noAuthorizerContext');
      expect(atIndex(warnings, 1).message).toContain('serves no unidentified caller');
      for (const warning of warnings) {
        expect(warning.raw).not.toContain('accountID');
      }
    });

    it('opens the request scope with the account AND the administrative claim the gate established', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);

      // ★★★ `adminAccountFlag` IS PART OF THIS ASSERTION NOW (SEC-D, CWE-223/CWE-778). The call
      // used to pass `{ accountID }` alone, and this case used to assert exactly that. The omission
      // was not inert: the composition root builds the audit actor as
      // `adminAccountFlag: input.adminAccountFlag ?? false`, and that flag is the second half of the
      // stamping gate `HibachiEntity` applies [org/Hibachi/HibachiEntity.cfc:L628, L633] - so with it
      // absent, the nine mutations this route publishes wrote no attribution at all. The claim is
      // available right here, already resolved from the authorizer, which is what made the gap a
      // wiring omission rather than a missing capability.
      expect(bed.scopeInputs).toStrictEqual([
        { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
      ]);
    });

    it('reads the account claim case-insensitively', async () => {
      const response = await bed.invoke({
        authorizer: { accountId: CALLER_ACCOUNT_ID, ADMINACCOUNTFLAG: true },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      // BOTH claims are read case-insensitively, which is CFML struct-key semantics and the reason
      // `structGet` is used for each. An authorizer that spells either differently is the same caller.
      // The scope therefore receives the RESOLVED claim, not the key the authorizer happened to use.
      expect(response.statusCode).toBe(200);
      expect(bed.scopeInputs).toStrictEqual([
        { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
      ]);
    });

    it.each([['true'], ['1'], [' TRUE '], ['True']])(
      '★★ carries the RESOLVED boolean into the scope for the string rendering %s, never the raw claim',
      async (rendering) => {
        // The authorizer can carry the flag as one of several truthy strings, and the scope member is
        // typed `boolean`. What travels must therefore be the value `errorMapper` resolved - so a
        // downstream audit stamp records a decided permission rather than re-deciding a string, and
        // `?? false` can never see a truthy string it would have to interpret a second time.
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: rendering },
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(200);
        expect(fresh.scopeInputs).toStrictEqual([
          { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
        ]);
      },
    );

    it('★★★ cannot be told the actor by the REQUEST - the claim comes only from the authorizer (SEC-D)', async () => {
      // The stamped actor must be server-established, or the audit trail records whatever the caller
      // asserted about itself. Every caller-authored surface is loaded here with a contradicting
      // administrative claim - query string, headers, and a body - while the authorizer carries a
      // NON-administrative identity. The route must refuse on the authorizer's claim alone.
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: {
          ...queryFor('findProducts', { keyword: 'jorden' }),
          adminAccountFlag: 'true',
        },
        headers: {
          adminAccountFlag: 'true',
          'x-admin-account-flag': 'true',
        },
        body: JSON.stringify({ adminAccountFlag: true, accountID: 'acct-somebody-else' }),
      });

      expect(response.statusCode).toBe(403);
      expect(readFailureBody(response).error.category).toBe('forbidden');

      // Refused BEFORE any scope was opened, so no spoofed actor could reach the audit stamp even
      // transiently, and the response never names the claim it read.
      expect(bed.scopeInputs).toStrictEqual([]);
      expect(bed.findProductsCalls).toHaveLength(0);
      expect(response.body).not.toContain('adminAccountFlag');
    });

    it('serves the administrative default caller past the gate', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ refuses an IDENTIFIED caller carrying no administrative claim, with 403 (F45)', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: '' }),
      });

      // AN EMPTY KEYWORD MATCHES EVERY ROW and the statement carries no `activeFlag`/`publishedFlag`
      // predicate, so this is the exact request that enumerated inactive and unpublished catalog data
      // for any identified account. 403, not 401 - an identity WAS established and is insufficient -
      // and not 400, because nothing about the input was malformed.
      expect(response.statusCode).toBe(403);
      expect(readFailureBody(response).error.category).toBe('forbidden');
      expect(bed.findProductsCalls).toHaveLength(0);
      expect(bed.scopeInputs).toStrictEqual([]);
    });

    it('refuses every non-admitted rendering of the administrative claim, and admits the closed two', async () => {
      // The vocabulary is `errorMapper`'s and is not widened here: a real `boolean true`, or one of
      // the two truthy STRINGS API Gateway can carry. A NUMBER is refused - including `1`, which is
      // admitted as the string `'1'` and refused as the numeral - because a claim that arrives
      // untyped is not a claim this route will guess at. Fail-closed is the direction for a
      // permission bit.
      for (const refused of [
        false,
        'false',
        '0',
        0,
        1,
        '',
        ' ',
        'no',
        'yes',
        null,
        undefined,
        {},
        [],
      ]) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: refused },
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(403);
        expect(fresh.findProductsCalls).toHaveLength(0);
      }

      for (const admitted of [true, 'true', '1', ' TRUE ', 'True']) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: admitted },
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(200);
        expect(fresh.findProductsCalls).toHaveLength(1);
      }
    });

    it('refuses a non-administrative caller on EVERY published operation, not just the search', async () => {
      // The finding names the two option operations as "admin-only" explicitly, so the gate is
      // asserted on all of them rather than on the one that happens to be listed first.
      //
      // ★★★ THIS LOOP NAMED THREE QUERIES AND NOW COVERS ALL FOURTEEN OPERATIONS, INCLUDING THE NINE
      // MUTATIONS. It is the case that matters most about the widened surface: publishing nine writes
      // behind a gate that had only ever been asserted on three reads would leave the gate's coverage
      // trailing the surface it guards. Each operation is driven on its own method with its own payload,
      // and every one of the fourteen must answer 403 - no mutation, no service call and no statement.
      for (const operation of PUBLISHED_OPERATIONS) {
        const fresh = makeTestBed();
        const response = await invokeOperation(fresh, operation, {
          authorizer: { accountID: CALLER_ACCOUNT_ID },
        });

        expect(response.statusCode).toBe(403);
        expect(fresh.counters.scopesOpened).toBe(0);
        expect(fresh.executor.executed).toEqual([]);
        expect(fresh.world.productLoads).toEqual([]);
        expect(fresh.unpublishedTouches).toEqual([]);
      }
    });

    it('publishes nothing about the claim in the 403, and costs no statement', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });
      const failure = readFailureBody(response).error;

      // The 403 sentence is the 401 sentence: an attacker learns WHICH refusal occurred from the
      // status and nothing else from the body. No claim name, no account identifier, no field path.
      expect(failure.message).toBe('The request was not served.');
      expect(failure.fields).toBeUndefined();
      expect(response.body).not.toContain('adminAccountFlag');
      expect(response.body).not.toContain('admin');
      expect(response.body).not.toContain(CALLER_ACCOUNT_ID);
      expect(bed.scopeInputs).toStrictEqual([]);
    });

    it('logs the administrative refusal without the account identifier or the claim name', async () => {
      await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      const warnings = decodedLines(bed).filter((line) => line.level === 'warn');

      expect(warnings).toHaveLength(2);
      expect(atIndex(warnings, 0).message).toContain('no administrative claim');
      expect(atIndex(warnings, 1).message).toContain('not permitted the operation');
      for (const warning of warnings) {
        expect(warning.raw).not.toContain(CALLER_ACCOUNT_ID);
      }
    });
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: the operation selector
  // =========================================================================

  describe('concern 1, request parsing: the operation selector', () => {
    it('requires the selector, and names all FOURTEEN published operations when it is absent', async () => {
      const response = await bed.invoke({ query: {} });
      const failure = readFailureBody(response).error;
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(failure.category).toBe('invalidRequest');
      expect(failure.message).toBe('A required query parameter is missing.');
      expect(issue.path).toBe('operation');
      for (const operation of PUBLISHED_OPERATIONS) {
        expect(issue.message).toContain(operation);
      }
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('treats a blank selector as absent rather than unrecognized', async () => {
      const response = await bed.invoke({ query: { operation: '' } });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
    });

    it('treats a whitespace-only selector as absent', async () => {
      const response = await bed.invoke({ query: { operation: '   ' } });

      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
    });

    it('treats an unpopulated query-string map as no selector at all', async () => {
      const response = await bed.invoke({ query: null });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
    });

    it('refuses an operation it does not publish, without echoing what was submitted', async () => {
      const response = await bed.invoke({ query: { operation: 'getProductSmartList' } });
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(400);
      expect(failure.category).toBe('invalidRequest');
      expect(failure.message).toBe('The request input is not valid.');
      expect(response.body).not.toContain('getProductSmartList');
      expect(atIndex(readFieldIssues(response), 0).path).toBe('operation');
    });

    it('compares the selector CASE-SENSITIVELY', async () => {
      // JUDGMENT CALL: the selector is compared case-sensitively while the PATH is not, and the
      // asymmetry is asserted rather than smoothed over. The path comparison folds case because it
      // reproduces two CFML comparisons that fold case [Application.cfc:L130, L133]; this selector has
      // no legacy antecedent at all - it exists to BE the ported method's name character for
      // character, which is what makes the interface-parity diff mechanical. Admitting `FINDPRODUCTS`
      // would loosen the one thing the selector exists to pin.
      const response = await bed.invoke({
        query: { operation: 'findProducts'.toUpperCase(), keyword: 'jorden' },
      });

      expect(response.statusCode).toBe(400);
      expect(bed.findProductsCalls).toEqual([]);
    });

    // ★★★ THIS LOOP USED TO RUN THREE TIMES AND NOW RUNS FOURTEEN, THROUGH ONE ENTRY POINT.
    // {@link invokeOperation} drives each operation on the method it is served on and puts its criteria
    // where that operation carries them - the query string for the five reads, a JSON body for the nine
    // mutations - so the loop stays a loop rather than becoming a branch that could get the branch wrong
    // and still pass.
    it.each(PUBLISHED_OPERATIONS)('recognizes the published operation %s', async (operation) => {
      const response = await invokeOperation(bed, operation);

      expect(response.statusCode).toBe(200);
      expect(readServedBody(response).result.operation).toBe(operation);
    });

    it('reads the selector from the multi-value map when the single-valued map lacks it', async () => {
      const response = await bed.invoke({
        // The page size is named here rather than left to `queryFor`, because this case assembles the
        // single-valued map directly in order to leave `operation` out of it.
        query: { keyword: 'jorden', pageRecordsShow: '25' },
        repeatedQuery: { operation: ['findProducts'] },
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: the closed criteria shape
  // =========================================================================

  describe('concern 1, request parsing: the closed, typed criteria shape', () => {
    it('requires the keyword, because the statement binds it unconditionally', async () => {
      // CFML parity [model/dao/ProductDAO.cfc:L422]: the term is bound as `%<term>%` BEFORE the
      // `structKeyExists` guard that protects the product-type list at [L423], so omitting it in CFML
      // reached an undefined-variable raise rather than a broader search. The ported criteria type
      // declares it required for that reason, and a request omitting it is refused here rather than
      // one layer down.
      const response = await bed.invoke({ query: queryFor('findProducts') });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request input is not valid.');
      expect(issue.path).toBe('keyword');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('accepts a keyword that is present and EMPTY, which is a search matching every row', async () => {
      // An empty value is not a missing value. [model/dao/ProductDAO.cfc:L422] binds `%%` for an
      // empty term, which matches every row - an outcome that belongs to the caller, not an error.
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: '' }) });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).keyword).toBe('');
    });

    it('refuses a parameter the named operation does not publish, without echoing the key', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', unpublishedKnob: 'true' }),
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('queryStringParameters');
      // The refusal names the CONTAINER, never the key: a key name is caller-authored text, and a
      // response body that echoed it would be a hole through the no-echo guarantee.
      expect(response.body).not.toContain('unpublishedKnob');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it.each([['__proto__'], ['constructor'], ['prototype']])(
      'refuses the reserved key %s, so the closed grammar has no inherited-property bypass',
      async (reservedKey) => {
        const response = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [reservedKey]: 'injected' }),
        });

        expect(response.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
        expect(response.body).not.toContain(reservedKey);
        expect(response.body).not.toContain('injected');
        expect(bed.findProductsCalls).toEqual([]);
        expect(bed.counters.scopesOpened).toBe(0);
      },
    );

    it('leaves Object.prototype untouched after a reserved-key request', async () => {
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', ['__proto__']: 'polluted' }),
      });

      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(Object.keys({})).toHaveLength(0);
    });

    it('does not reopen the framework smart list\u2019s dynamic filter surface', async () => {
      // AAP 0.6.2: `getProductSmartList` [model/service/ProductService.cfc:L342-L358] interpreted a
      // `struct data={}` at run time as filters, ranges, orders and page bounds. Its replacement is a
      // CLOSED typed shape, and this is what that means on the wire: a string-keyed filter is refused
      // rather than ignored, so a caller is told instead of silently receiving an unfiltered result.
      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          'filter[brand.brandName]': 'nike',
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('carries currentURL, which is part of the surface being diffed and is not interpreted', async () => {
      // CFML parity [model/service/ProductService.cfc:L342]: the legacy signature declares
      // `currentURL=""`, so the member survives for signature parity. Nothing derives behaviour from
      // it, and this asserts exactly that: it is forwarded unchanged and changes nothing.
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', currentURL: '/sp/nike-air-jorden/' }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).currentURL).toBe('/sp/nike-air-jorden/');
    });

    it.each([
      ['a non-numeral', 'twelve'],
      ['a signed numeral', '-1'],
      ['a fractional numeral', '1.5'],
      ['an exponent', '1e3'],
      ['a padded numeral', ' 4 '],
    ])('refuses %s as a paging bound', async (_description, supplied) => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsStart: supplied }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsStart');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('converts a wire numeral to a number rather than forwarding the string', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          pageRecordsStart: '20',
          pageRecordsShow: '5',
        }),
      });
      const criteria = atIndex(bed.findProductsCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(criteria.pageRecordsStart).toBe(20);
      expect(criteria.pageRecordsShow).toBe(5);
    });

    it.each([
      ['just above the safe-integer ceiling', '9007199254740992'],
      ['far above it', '99999999999999999999'],
      ['absurdly long', '1'.repeat(400)],
    ])('refuses %s as a paging bound at the boundary', async (_description, supplied) => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: supplied }),
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('pageRecordsShow');
      expect(issue.message).toContain('largest integer this runtime can represent exactly');
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('admits the largest exactly-representable integer', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          pageRecordsStart: String(Number.MAX_SAFE_INTEGER),
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).pageRecordsStart).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('forwards a supplied window of ZERO as zero, never as absence', async () => {
      // The distinction is load-bearing on the service's contract, where the member remains OPTIONAL:
      // an absent `pageRecordsShow` reaching `ProductService.findProducts` means the whole result set,
      // so a `0` that decayed into absence on the way through would return everything to a caller that
      // asked for nothing. The routed contract refuses absence (see the paging-bound block below), but
      // it does so by REJECTING the request rather than by substituting a window, which is what keeps
      // this case and that one from contradicting each other.
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '0' }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).pageRecordsShow).toBe(0);
    });

    it('requires both parameters of getUnusedProductOptions', async () => {
      // CFML parity [model/service/OptionService.cfc:L72]: both arguments are declared `required`.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', { productID: FIRST_PRODUCT_ID }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
      expect(bed.unusedProductOptionsCalls).toEqual([]);
    });

    it('publishes NO product identifier on getUnusedProductOptionGroups', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L94-L95] against [model/dao/OptionDAO.cfc:L51-L53]: the
      // group query takes ONE argument and the option query takes two. The asymmetry is the source's
      // own, and admitting an optional `productID` here would invent a requirement and quietly change
      // the result set.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST,
          productID: FIRST_PRODUCT_ID,
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });

    it('accepts an EMPTY option-group list, which the legacy queries never guarded', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L68, L107]: neither query guards an empty list, so an
      // empty value leaves one of them excluding nothing while it leaves the other matching nothing.
      // Both outcomes belong to the caller, so the parameter must be PRESENT and may be empty.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: '' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.unusedProductOptionGroupsCalls).toEqual(['']);
    });

    it('restates none of the Product_UpdateSkus conditional rules at this tier', async () => {
      // The rules of [model/validation/Product_UpdateSkus.json] - `price` required under
      // `showPrice{updatePriceFlag eq 1}` and `listPrice` required under
      // `showListPrice{updateListPriceFlag eq 1}` - are ported as a module-private schema inside
      // `src/services/productService.ts`, which `processProduct_updateSkus`
      // [model/service/ProductService.cfc:L216-L233] parses with before any mutation. That operation
      // is not published here, so there is no path through this entrypoint on which either
      // conditional could be exercised, and duplicating the schema is exactly how two tiers drift.
      // What is asserted instead is that neither condition name is admitted as a parameter of any
      // published operation, and that the operation itself is refused.
      const refusedOperation = await bed.invoke({
        query: queryFor('processProduct_updateSkus', { updatePriceFlag: '1', price: '19.99' }),
      });
      expect(refusedOperation.statusCode).toBe(400);
      expect(readFailureBody(refusedOperation).error.message).toBe(
        'The request input is not valid.',
      );

      for (const conditionalMember of [
        'price',
        'listPrice',
        'updatePriceFlag',
        'updateListPriceFlag',
      ]) {
        const refusedParameter = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [conditionalMember]: '1' }),
        });
        expect(refusedParameter.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(refusedParameter), 0).path).toBe('queryStringParameters');
      }

      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('reads no operation parameter when only the multi-value map was populated', async () => {
      // An event whose single-valued query map is unpopulated is admissible: the selector is then read
      // from the multi-value map, and the operation's parameters are simply ABSENT. The schema refuses
      // the request on the missing keyword rather than the handler inventing one from the repeated map,
      // which would silently accept a parameter the closed shape never agreed to read from there.
      const response = await bed.invoke({
        query: null,
        repeatedQuery: { operation: ['findProducts'] },
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('keyword');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('invents no schema for the six entities that have no validation file by design', async () => {
      // `Category`, `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption`
      // and `Product_AddOptionGroup` carry NO validation file, and those absences are deliberate.
      // Nothing named after one of them is admitted here, so no rule is invented where the legacy
      // declares none.
      for (const invented of [
        'category',
        'promotionQualifier',
        'promotionApplied',
        'promotionAccount',
        'productAddOption',
        'productAddOptionGroup',
      ]) {
        const response = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [invented]: 'anything' }),
        });

        expect(response.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
      }
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION TO THE COMPOSED SERVICES
  // =========================================================================

  // -------------------------------------------------------------------------
  // Concern 1, continued: the two admission bounds a routed request must clear
  //
  // ★★ BOTH BOUNDS ARE NEW, AND NEITHER IS A STYLE PREFERENCE. Review found two ways one caller could
  // ask this entrypoint for unbounded work:
  //
  //   * FINDING F10 - the page size was OPTIONAL on the routed contract, and an absent one means THE
  //     WHOLE `SwProduct` MATCH SET to `ProductService.findProducts`, which this handler then projects
  //     and JSON-stringifies into a single API Gateway body. The service member stays optional, so no
  //     in-process caller was truncated; the REQUEST is what now has to name a window.
  //   * FINDING F17 - a comma-delimited identifier list becomes one SQL predicate and one placeholder
  //     PER ELEMENT, and the MySQL wire protocol cannot carry more than 65535 placeholders in one
  //     prepared statement.
  //
  // Both are enforced at ADMISSION, so the answer is a client-shaped 400 naming the member rather than
  // the generic 500 an unrecognized throw from the statement builder would produce. Both REFUSE rather
  // than clamp or shorten: answering a narrower question than the one asked, silently, is the failure
  // mode these cases exist to prevent.
  // -------------------------------------------------------------------------
  describe('concern 1, request parsing: the two admission bounds (F10, F17)', () => {
    it('REFUSES a findProducts request that names no page size at all', async () => {
      const response = await bed.invoke({
        query: { operation: 'findProducts', keyword: 'jorden' },
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsShow');
      // The refusal happens BEFORE any service work, so the unbounded query is never issued.
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('accepts a page size AT the ceiling and forwards it unchanged', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '500' }),
      });

      // AT the bound is accepted, not rejected: the boundary is inclusive, and pinning it here is what
      // stops a later off-by-one from narrowing the surface without a failing test.
      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).pageRecordsShow).toBe(500);
    });

    it('REFUSES a page size one record above the ceiling, and does not clamp it', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '501' }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsShow');
      expect(bed.findProductsCalls).toEqual([]);
      // NOT clamped to the ceiling: a 200 carrying 500 records would answer a different question than
      // the one asked and would tell the caller nothing about why.
      expect(response.statusCode).not.toBe(200);
    });

    it('names the constraint without echoing the submitted value back', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '999999' }),
      });

      const issue = atIndex(readFieldIssues(response), 0);
      expect(issue.path).toBe('pageRecordsShow');
      expect(issue.message).toContain('500');
      expect(response.body).not.toContain('999999');
    });

    it('admits a comma list well inside the protocol ceiling', async () => {
      const groups = Array.from(
        { length: 64 },
        (unused, index) => `${MERCHANDISE_PRODUCT_TYPE_ID}-${String(index)}`,
      );
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: groups.join(','),
        }),
      });

      expect(response.statusCode).toBe(200);
      // Forwarded as the COMMA-DELIMITED STRING the ported signature declares, byte for byte: not
      // split, not trimmed, not sorted, not de-duplicated and not re-joined.
      expect(atIndex(bed.unusedProductOptionGroupsCalls, 0)).toBe(groups.join(','));
    });

    it('REFUSES a comma list the wire protocol could not bind, naming the member', async () => {
      const overWide = Array.from({ length: MAX_PLACEHOLDER_COUNT + 1 }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: overWide }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
      expect(atIndex(readFieldIssues(response), 0).message).toContain('65535');
      // Refused before the service is reached, so no statement is built and no scope is opened.
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('admits a group-only list exactly at the protocol ceiling', async () => {
      const atCeiling = Array.from({ length: MAX_PLACEHOLDER_COUNT }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: atCeiling,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.unusedProductOptionGroupsCalls, 0)).toBe(atCeiling);
    });

    it('counts the keyword bind in the findProducts placeholder ceiling', async () => {
      const overWide = Array.from({ length: MAX_PLACEHOLDER_COUNT }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', productTypeIDs: overWide }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('productTypeIDs');
      expect(atIndex(readFieldIssues(response), 0).message).toContain(
        String(MAX_PLACEHOLDER_COUNT - 1),
      );
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('counts the trailing productID bind in the unused-options placeholder ceiling', async () => {
      const overWide = Array.from({ length: MAX_PLACEHOLDER_COUNT }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', {
          productID: FIRST_PRODUCT_ID,
          existingOptionGroupIDList: overWide,
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
      expect(atIndex(readFieldIssues(response), 0).message).toContain(
        String(MAX_PLACEHOLDER_COUNT - 1),
      );
      expect(bed.unusedProductOptionsCalls).toEqual([]);
    });

    it('does not let the refusal reach the caller as a 500', async () => {
      // The point of asking at admission rather than letting the statement builder raise: the same
      // refusal arriving from `src/repositories/mysql/sql/**` is an unrecognized throw, and
      // `./errorMapper.js` maps an unrecognized throw to a generic 500 with no field report at all.
      const overWide = Array.from({ length: 70000 }, (unused, index) => String(index)).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', {
          productID: FIRST_PRODUCT_ID,
          existingOptionGroupIDList: overWide,
        }),
      });

      expect(response.statusCode).toBe(400);
      // The mapper's own client-shaped category, the same one every schema rejection carries - NOT the
      // `unrecognized` category an escaped statement-builder throw would have been given.
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
    });
  });

  describe('concern 2, delegation: one ported service method per invocation', () => {
    it('resolves the composition root once, opens one scope, and calls findProducts once', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      expect(bed.counters.rootsResolved).toBe(1);
      expect(bed.counters.scopesOpened).toBe(1);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });

    it('forwards every supplied criteria member unchanged', async () => {
      await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          productTypeIDs: `${MERCHANDISE_PRODUCT_TYPE_ID},${MERCHANDISE_PRODUCT_TYPE_ID}`,
          pageRecordsStart: '10',
          pageRecordsShow: '25',
          currentURL: '/sp/',
        }),
      });

      expect(atIndex(bed.findProductsCalls, 0)).toEqual({
        keyword: 'jorden',
        productTypeIDs: `${MERCHANDISE_PRODUCT_TYPE_ID},${MERCHANDISE_PRODUCT_TYPE_ID}`,
        pageRecordsStart: 10,
        pageRecordsShow: 25,
        currentURL: '/sp/',
      });
    });

    it('forwards ABSENCE as absence on every member that is still optional', async () => {
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '25' }),
      });
      const criteria = atIndex(bed.findProductsCalls, 0);

      // Absence is forwarded as `undefined`, never as a substituted value: an absent `productTypeIDs`
      // means "do not restrict", so a `0` or an `''` in its place would silently ask a different
      // question.
      expect(criteria.productTypeIDs).toBeUndefined();
      expect(criteria.pageRecordsStart).toBeUndefined();
      expect(criteria.currentURL).toBeUndefined();

      // ★★ `pageRecordsShow` IS NO LONGER ONE OF THEM, AND THAT IS THE FIX RATHER THAN AN OVERSIGHT.
      // Static-performance review (finding F10) established that forwarding an absent page size means
      // THE WHOLE `SwProduct` RESULT SET to `ProductService.findProducts`, which this handler then
      // projects and stringifies into a single API Gateway body under a fixed response-size ceiling.
      // The bound therefore lives on the ROUTED contract - a request that names no page size is
      // refused at 400, which the paging-bound block below pins - and the value the caller supplied
      // is what reaches the service, unchanged and unsubstituted. `ProductQueryCriteria` still
      // declares the member optional, so no service caller was truncated by this.
      expect(criteria.pageRecordsShow).toBe(25);
    });

    it('keeps productTypeIDs a COMMA-DELIMITED STRING rather than modernising it', async () => {
      // CFML parity [model/dao/ProductDAO.cfc:L419, L424]: the adapter binds it as a CFML list, so
      // the string form is what signature parity preserves. The plural spelling is the repository's
      // own and is not harmonised with the SKU repository's singular one.
      const supplied = `${MERCHANDISE_PRODUCT_TYPE_ID},dddd,,eeee`;
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', productTypeIDs: supplied }),
      });

      expect(atIndex(bed.findProductsCalls, 0).productTypeIDs).toBe(supplied);
    });

    it('forwards the option list to getUnusedProductOptions exactly as received', async () => {
      // `existingOptionGroupIDList` STAYS A STRING for signature parity
      // [model/service/OptionService.cfc:L72], and comma-list expansion belongs to the binding layer:
      // [model/dao/OptionDAO.cfc:L68] binds it with `cfqueryparam ... list="true"`. So the handler
      // must forward it UNMODIFIED - untrimmed, unsorted, uncase-folded and undeduplicated.
      await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });
      const call = atIndex(bed.unusedProductOptionsCalls, 0);

      expect(call.productID).toBe(FIRST_PRODUCT_ID);
      expect(call.existingOptionGroupIDList).toBe(UNTIDY_OPTION_GROUP_ID_LIST);
      expect(call.existingOptionGroupIDList).not.toBe(UNTIDY_OPTION_GROUP_ID_LIST.trim());
      expect(call.existingOptionGroupIDList).not.toBe(UNTIDY_OPTION_GROUP_ID_LIST.toLowerCase());
      expect(call.existingOptionGroupIDList).not.toBe(
        UNTIDY_OPTION_GROUP_ID_LIST.split(',')
          .map((entry) => entry.trim())
          .sort()
          .join(','),
      );
    });

    it('forwards the option list to getUnusedProductOptionGroups exactly as received', async () => {
      await bed.invoke({
        query: queryFor(
          'getUnusedProductOptionGroups',
          VALID_PARAMETERS.getUnusedProductOptionGroups,
        ),
      });

      expect(bed.unusedProductOptionGroupsCalls).toEqual([UNTIDY_OPTION_GROUP_ID_LIST]);
    });

    it('publishes option rows in repository order, without re-sorting them', async () => {
      // Ordering is established in SQL - `ORDER BY SwOptionGroup.optionGroupName, SwOption.optionName`
      // [model/dao/OptionDAO.cfc:L82-L84] - so a handler that re-sorted would be making a decision the
      // statement already made. The rows below are deliberately NOT in alphabetical order, and the
      // response must carry them exactly as the service answered.
      bed.outcomes.unusedOptions = [
        selectRow('Size - Large', 'opt-large'),
        selectRow('Colour - Zulu Blue', 'opt-zulu'),
        selectRow('Colour - alpha Red', 'opt-alpha'),
      ];

      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });

      expect(readSelectRows(response).map((row) => row.value)).toEqual([
        'opt-large',
        'opt-zulu',
        'opt-alpha',
      ]);
    });

    it('leaves the composite option name unsplit, unreformatted and unre-derived', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L88]: the row's `name` is built in the DAO as
      // `"#rs.optionGroupName# - #rs.optionName#"` - a space, a hyphen and a space. The handler
      // publishes that one string; it does not split it back into two members, re-join it with a
      // different separator, or re-derive it from anything.
      const composite = 'Colour - Zulu Blue';
      bed.outcomes.unusedOptions = [selectRow(composite, 'opt-zulu')];

      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });
      const row = atIndex(readSelectRows(response), 0);

      expect(row).toEqual({ name: composite, value: 'opt-zulu' });
      expect(Object.keys(row).sort()).toEqual(['name', 'value']);
      expect(response.body).toContain(composite);
    });

    it('publishes group rows keyed on the option-group identifier', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L113]: the group query appends
      // `{name=rs.optionGroupName, value=rs.optionGroupID}`, so `value` is a GROUP identifier here
      // while it is an OPTION identifier in the sibling query. Same row shape, different key.
      bed.outcomes.unusedOptionGroups = [selectRow('Colour', 'group-colour')];

      const response = await bed.invoke({
        query: queryFor(
          'getUnusedProductOptionGroups',
          VALID_PARAMETERS.getUnusedProductOptionGroups,
        ),
      });

      expect(readSelectRows(response)).toEqual([{ name: 'Colour', value: 'group-colour' }]);
    });

    it('opens exactly one scope per invocation across repeated, distinct requests', async () => {
      await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: 'group-colour',
        }),
      });

      expect(bed.counters.scopesOpened).toBe(2);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionGroupsCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION: the eleven operations a code review restored
  //
  // ★★★ THIS WHOLE BLOCK IS THE POSITIVE SIDE OF THE CRITICAL FINDING. It replaces an `it.each` over a
  // list named `entityArgumentOperations`, which asserted that eleven AAP-0.4.2-mapped actions were
  // UNREACHABLE and gave the ground as "the composition root publishes no entity and no loader". That
  // ground was false when it was written - `RequestScope.entityLoaders` publishes read-only loads by
  // identifier - and the consequence the review recorded was that "catalog persistence and all
  // `BrandService` functionality" had no transport at all.
  //
  // Eleven operations therefore need positive coverage, and each needs it on five counts: it is
  // recognized, it is served on exactly one method, it is admitted only for an administrator, its
  // identifier is hydrated into the entity the service is handed, and its result is projected onto a
  // named payload. The cases below are grouped by that reasoning rather than by operation, so a property
  // is asserted once across every operation that has it instead of fourteen times in fourteen shapes.
  // =========================================================================

  describe('concern 2, delegation: the eleven operations a code review restored', () => {
    it('publishes exactly fourteen operations, of which nine are mutations', () => {
      // The three lists are assembled rather than restated - see `PUBLISHED_OPERATIONS` - so this case
      // pins the SHAPE of the surface and nothing else. A fifteenth operation added to the subject
      // without being added here fails the recognition loop, not this assertion.
      expect(READ_OPERATIONS).toHaveLength(5);
      expect(MUTATION_OPERATIONS).toHaveLength(9);
      expect(PUBLISHED_OPERATIONS).toHaveLength(14);
      expect(new Set(PUBLISHED_OPERATIONS).size).toBe(14);
    });

    it.each(MUTATION_OPERATIONS)(
      'refuses %s on the read method, before any body is read',
      async (operation) => {
        // ★★ THE OPERATION IS NOT PART OF THE PATH, SO ONLY THE SUBJECT KNOWS WHICH VERB SERVES IT. The
        // router matched `GET` against the row's comma list and could not have done otherwise; the pairing
        // is checked one layer in. A body is sent as well as the wrong method, and the refusal must name
        // the SELECTOR rather than the body - which is what proves the check runs before the body is read.
        const body = VALID_BODIES[operation];
        const response = await bed.invoke({
          method: firstDeclaredCatalogMethod(),
          query: queryFor(operation, VALID_PARAMETERS[operation]),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const issue = atIndex(readFieldIssues(response), 0);

        expect(response.statusCode).toBe(400);
        expect(readFailureBody(response).error.category).toBe('invalidRequest');
        expect(issue.path).toBe('operation');
        expect(issue.message).toContain('does not serve on the request method');
        expect(bed.counters.scopesOpened).toBe(0);
      },
    );

    it.each(READ_OPERATIONS)('refuses %s on the mutation method', async (operation) => {
      const response = await bed.invoke({
        method: methodForOperation('saveProduct'),
        query: queryFor(operation, VALID_PARAMETERS[operation]),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('operation');
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('names neither the method sent nor the method that would have worked', async () => {
      // Both are withheld for the reasons the subject states: `httpMethod` is caller-controlled text
      // and may not be echoed, and disclosing the correct verb would let a caller map the surface by
      // probing it. The refusal says an operation is served on one method and nothing more.
      const response = await bed.invoke({
        method: firstDeclaredCatalogMethod(),
        query: queryFor('saveBrand'),
        body: JSON.stringify(VALID_BODIES.saveBrand),
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('saveBrand');
      expect(response.body).not.toContain('POST');
      expect(response.body).not.toContain('GET');
    });

    it('admits a lower-case rendering of the mutation method, as the router does', async () => {
      // Checked with `listFindNoCase` over a single-member list, which is the same primitive and the
      // same case-folding the router applies [Application.cfc:L133] - so the two tiers cannot disagree
      // about what a method name means.
      const response = await invokeOperation(bed, 'saveProduct', {
        method: methodForOperation('saveProduct').toLowerCase(),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.saveProductCalls).toHaveLength(1);
    });

    it.each(MUTATION_OPERATIONS)(
      'publishes NO query parameter on %s beyond the selector',
      async (operation) => {
        // The nine mutations map to the empty parameter set, so the body is provably the only payload
        // location. Sending a parameter a READ publishes is the sharper probe: it would be a legitimate
        // member somewhere else on this surface, and it is still refused here.
        const body = VALID_BODIES[operation];
        const response = await bed.invoke({
          method: methodForOperation(operation),
          query: { operation, keyword: 'jorden' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const issue = atIndex(readFieldIssues(response), 0);

        expect(response.statusCode).toBe(400);
        expect(issue.path).toBe('queryStringParameters');
        expect(response.body).not.toContain('jorden');
        expect(bed.counters.scopesOpened).toBe(0);
      },
    );

    // ---------------------------------------------------------------------
    // Hydration: the entity the service is handed IS the one the loader answered
    // ---------------------------------------------------------------------

    it('hands processProduct_addOptionGroup the loaded product and the payload verbatim', async () => {
      const response = await invokeOperation(bed, 'processProduct_addOptionGroup');
      const call = atIndex(bed.addOptionGroupCalls, 0);

      expect(response.statusCode).toBe(200);
      // ★★★ IDENTITY, NOT EQUALITY. This is the whole of what "hydrate identifiers through request-scope
      // loaders" means: the instance the service received is the very object the loader answered for the
      // identifier the request named, not a reconstruction of it and not a fresh entity.
      expect(call.product).toBe(bed.world.product);
      expect(bed.world.productLoads).toEqual([FIRST_PRODUCT_ID]);
      expect(call.input).toEqual({ optionGroup: SENTINEL_OPTION_GROUP_ID });
    });

    it('hands processProduct_addOption the loaded product and the payload verbatim', async () => {
      const response = await invokeOperation(bed, 'processProduct_addOption');
      const call = atIndex(bed.addOptionCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.product).toBe(bed.world.product);
      expect(call.input).toEqual({ option: FIRST_OPTION_ID });
    });

    it('forwards the updateSkus payload unaltered, and restates none of its conditional rules', async () => {
      // ★★ THE CONDITIONAL GATE IS THE SERVICE'S. [model/validation/Product_UpdateSkus.json] makes
      // `price` required when `updatePriceFlag eq 1`, and that rule is a module-private schema inside
      // `src/services/productService.ts`. What this tier owes is FORWARDING: the two flags and the two
      // amounts arrive exactly as sent, so there is no second copy of the rule here to drift from the
      // one that owns it. `price` stays a DECIMAL STRING - no `Money` is minted in the transport tier.
      const response = await invokeOperation(bed, 'processProduct_updateSkus');
      const call = atIndex(bed.updateSkusCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.product).toBe(bed.world.product);
      expect(call.input).toEqual({ updatePriceFlag: 1, price: SENTINEL_UNIT_PRICE });
      expect(typeof call.input.price).toBe('string');
    });

    it('forwards an OMITTED updateSkus member as absence rather than as a substituted value', async () => {
      const response = await invokeOperation(bed, 'processProduct_updateSkus', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID }),
      });
      const call = atIndex(bed.updateSkusCalls, 0);

      expect(response.statusCode).toBe(200);
      // `exactOptionalPropertyTypes` is on, so absence is forwarded AS absence: the key is not present
      // at all rather than present carrying `undefined`, and no `0`, `''` or `false` is invented.
      expect(Object.keys(call.input)).toEqual([]);
    });

    it('forwards the optional deleteDefaultImage member only when it was supplied', async () => {
      // The asymmetry against the sibling process objects is the SOURCE'S: the legacy body gates every
      // use of `imageFile` behind `structKeyExists(arguments.data, "imageFile")`
      // [model/service/ProductService.cfc:L199], so the member is optional here and its absence is a
      // distinct input from an empty one.
      const withoutMember = await invokeOperation(bed, 'processProduct_deleteDefaultImage');
      expect(withoutMember.statusCode).toBe(200);
      expect(Object.keys(atIndex(bed.deleteDefaultImageCalls, 0).input)).toEqual([]);

      const withMember = await invokeOperation(bed, 'processProduct_deleteDefaultImage', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, imageFile: 'red-large.jpg' }),
      });
      expect(withMember.statusCode).toBe(200);
      expect(atIndex(bed.deleteDefaultImageCalls, 1).input).toEqual({ imageFile: 'red-large.jpg' });
    });

    it('hands processProduct_updateDefaultImageFileNames the product and nothing else', async () => {
      // [model/service/ProductService.cfc:L208] takes the product alone, so the ported signature is
      // unary and the body carries only the identifier that names it.
      const response = await invokeOperation(bed, 'processProduct_updateDefaultImageFileNames');

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.updateDefaultImageFileNamesCalls, 0)).toBe(bed.world.product);
    });

    it('hands saveProduct the loaded product and the eight-member scalar payload', async () => {
      const response = await invokeOperation(bed, 'saveProduct', {
        body: JSON.stringify({
          productID: FIRST_PRODUCT_ID,
          productName: 'Renamed Product',
          productCode: 'TESTPRODUCTXXX',
          activeFlag: false,
          sortOrder: 7,
        }),
      });
      const call = atIndex(bed.saveProductCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.entity).toBe(bed.world.product);
      expect(call.data).toEqual({
        productName: 'Renamed Product',
        productCode: 'TESTPRODUCTXXX',
        activeFlag: false,
        sortOrder: 7,
      });
    });

    it.each([['options'], ['price'], ['listPrice']])(
      'refuses the SKU-collaboration member %s on saveProduct',
      async (member) => {
        // ★★★ THE THREE OMITTED MEMBERS ARE OMITTED ON PRINCIPLE, AND THE REFUSAL IS WHAT MAKES THAT
        // CHECKABLE. Two of `ProductSaveInput`'s eleven members are typed `Money`, and this tier mints
        // no `Money` at all; the third drives SKU creation through a method whose name says it saves a
        // product. `z.strictObject` refuses each as an unrecognized member, and the response names the
        // container rather than echoing the member - see `mapZodErrorFields`.
        const response = await invokeOperation(bed, 'saveProduct', {
          body: JSON.stringify({ productID: FIRST_PRODUCT_ID, [member]: '19.99' }),
        });

        expect(response.statusCode).toBe(400);
        expect(response.body).not.toContain(member);
        expect(bed.saveProductCalls).toEqual([]);
      },
    );

    it('hands saveProductType the loaded product type, resolved off the product fixture', async () => {
      const response = await invokeOperation(bed, 'saveProductType');
      const call = atIndex(bed.saveProductTypeCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.entity).toBe(bed.world.productType);
      expect(bed.world.productTypeLoads).toEqual([SENTINEL_PRODUCT_TYPE_ID]);
      expect(call.data).toEqual({ productTypeName: 'Merchandise' });
    });

    it('hands saveBrand a brand HYDRATED FROM THE STATEMENT, since no brand repository exists', async () => {
      // ★★ THE ONLY LOAD IN THIS CAPABILITY WITH NO REPOSITORY BEHIND IT. `BrandService` declares one
      // method [model/service/BrandService.cfc:L67] and everything else it had arrived by framework
      // inheritance, so there is no brand repository port to programme: the composition root hosts the
      // statement itself. Answering it is therefore the only way to reach `saveBrand` at all, which
      // means `hydrateBrand` and the projection of `BRAND_COLUMNS` are exercised here rather than
      // assumed.
      const response = await invokeOperation(bed, 'saveBrand');
      const call = atIndex(bed.saveBrandCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.entity.getBrandID()).toBe(SENTINEL_BRAND_ID);
      expect(call.entity.getBrandName()).toBe(SENTINEL_BRAND_NAME);
      expect(call.data).toEqual({ brandName: 'Renamed Brand' });
      expect(bed.executor.executed.some((sql) => sql.includes('FROM SwBrand'))).toBe(true);
    });

    it('admits the CFML flag union on saveBrand, and the resolved boolean on saveProductType', async () => {
      // Neither schema is harmonised with the other: each admits exactly what its SERVICE declares.
      // `BrandSaveInput` takes the CFML input union because the legacy `populate` passed `trim(value)` -
      // a string - and left coercion to the engine [org/Hibachi/HibachiTransient.cfc:L194], while
      // `ProductTypeSaveInput` declares resolved booleans.
      const brandResponse = await invokeOperation(bed, 'saveBrand', {
        body: JSON.stringify({ brandID: SENTINEL_BRAND_ID, activeFlag: '1' }),
      });
      expect(brandResponse.statusCode).toBe(200);
      expect(atIndex(bed.saveBrandCalls, 0).data).toEqual({ activeFlag: '1' });

      const typeResponse = await invokeOperation(bed, 'saveProductType', {
        body: JSON.stringify({ productTypeID: SENTINEL_PRODUCT_TYPE_ID, activeFlag: '1' }),
      });
      expect(typeResponse.statusCode).toBe(400);
      expect(bed.saveProductTypeCalls).toEqual([]);
    });

    it('hands deleteProduct the loaded product and publishes the boolean it answered', async () => {
      const response = await invokeOperation(bed, 'deleteProduct');

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.deleteProductCalls, 0)).toBe(bed.world.product);
      expect(readServedPayload(response)).toEqual({ deleted: true });
    });

    it('★★★ publishes a REFUSED delete as a 200 carrying false, not as an error', async () => {
      // [model/service/ProductService.cfc:L317-L339] returns `false` when the delete-context rule
      // refuses - a transaction exists against one of the product's SKUs - and it does NOT raise. The
      // ported service reproduces that, so the honest transport of it is a served answer to the question
      // that was asked. Mapping it to a 4xx would invent a failure the source does not have, and mapping
      // it to a 500 would report an internal fault for a business rule working correctly.
      bed.outcomes.productDeleted = false;

      const response = await invokeOperation(bed, 'deleteProduct');

      expect(response.statusCode).toBe(200);
      expect(readServedPayload(response)).toEqual({ deleted: false });
      expect(
        atIndex(
          decodedLines(bed).filter((line) => line.level === 'info'),
          0,
        ).context['resultCount'],
      ).toBe(1);
    });

    // ---------------------------------------------------------------------
    // The two synchronous reads the false rationale had ruled out
    // ---------------------------------------------------------------------

    it('serves getFormattedOptionGroups from the loaded product, without awaiting it', async () => {
      // SYNCHRONOUS in the services tier: the ported body traverses the product's already-materialized
      // option groups and reaches nothing [model/service/ProductService.cfc:L70]. The double is declared
      // synchronous for that reason, so a subject that awaited it would still pass - what this case pins
      // is that the PRODUCT it traverses is the loaded one.
      bed.outcomes.formattedOptionGroups = [
        {
          optionGroupName: 'Colour',
          options: [{ name: 'Red', value: FIRST_OPTION_ID }],
        },
      ];

      const response = await invokeOperation(bed, 'getFormattedOptionGroups');

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.formattedOptionGroupsCalls, 0)).toBe(bed.world.product);
      expect(readFormattedOptionGroups(response)).toEqual(bed.outcomes.formattedOptionGroups);
    });

    it('serves getOptionsForSelect from options loaded IN THE CALLER\u2019S OWN ORDER', async () => {
      // ★★★ THE ORDER IS THE CALLER'S, AND THAT IS A DECISION RATHER THAN AN ACCIDENT. The load answers
      // an unordered map keyed by case-folded identifier, so the subject walks the caller's LIST instead
      // of the map. `getOptionsForSelect`'s "in repository order" promise therefore means the caller's
      // order here, because it is the caller that supplies the sequence and not a query.
      const response = await invokeOperation(bed, 'getOptionsForSelect', {
        body: null,
        query: queryFor('getOptionsForSelect', {
          optionIDs: `${SECOND_OPTION_ID},${FIRST_OPTION_ID}`,
        }),
      });
      const handed = atIndex(bed.optionsForSelectCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(handed.map((option) => option.getOptionID())).toEqual([
        SECOND_OPTION_ID,
        FIRST_OPTION_ID,
      ]);
      expect(readSelectRows(response).map((row) => row.value)).toEqual([
        SECOND_OPTION_ID,
        FIRST_OPTION_ID,
      ]);
    });

    it('parses the option list with CFML list semantics, dropping empty elements only', async () => {
      // The SAME parse the option adapters apply, so an untidy list is read here exactly as it would be
      // read there: empty elements are dropped and nothing is trimmed, sorted, deduplicated or
      // case-folded. A duplicated identifier is therefore loaded once and PUBLISHED TWICE, because the
      // caller named it twice.
      const response = await invokeOperation(bed, 'getOptionsForSelect', {
        query: queryFor('getOptionsForSelect', {
          optionIDs: `${FIRST_OPTION_ID},,${FIRST_OPTION_ID}`,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.optionsForSelectCalls, 0)).toHaveLength(2);
    });

    // ---------------------------------------------------------------------
    // An identifier that names no row: a served `unresolved`, never a 404
    // ---------------------------------------------------------------------

    it.each([
      [
        'processProduct_addOptionGroup',
        { productID: ABSENT_PRODUCT_ID, optionGroup: SENTINEL_OPTION_GROUP_ID },
      ],
      ['processProduct_addOption', { productID: ABSENT_PRODUCT_ID, option: FIRST_OPTION_ID }],
      ['processProduct_updateSkus', { productID: ABSENT_PRODUCT_ID }],
      ['processProduct_deleteDefaultImage', { productID: ABSENT_PRODUCT_ID }],
      ['processProduct_updateDefaultImageFileNames', { productID: ABSENT_PRODUCT_ID }],
      ['saveProduct', { productID: ABSENT_PRODUCT_ID }],
      ['deleteProduct', { productID: ABSENT_PRODUCT_ID }],
    ] as const)(
      'answers %s naming an absent product with a served productNotFound',
      async (operation, body) => {
        const response = await bed.invoke({
          method: methodForOperation(operation),
          query: queryFor(operation),
          body: JSON.stringify(body),
        });

        // ★★★ A 200, AND THE GROUND IS STRUCTURAL RATHER THAN AESTHETIC. `./errorMapper.js` reaches 404
        // on exactly one category - `routeNotFound` - and the router already answers 404 for a path no
        // row declares. Reusing it for "this identifier names no row" would collapse two different
        // facts onto one status, and the caller asked a question the service answered.
        expect(response.statusCode).toBe(200);
        expect(readUnresolvedReason(response)).toBe('productNotFound');
        expect(bed.world.productLoads).toEqual([ABSENT_PRODUCT_ID]);
      },
    );

    it('answers saveProductType naming an absent product type with productTypeNotFound', async () => {
      const response = await bed.invoke({
        method: methodForOperation('saveProductType'),
        query: queryFor('saveProductType'),
        body: JSON.stringify({ productTypeID: ABSENT_PRODUCT_TYPE_ID }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('productTypeNotFound');
      expect(bed.saveProductTypeCalls).toEqual([]);
    });

    it('answers saveBrand naming an absent brand with brandNotFound', async () => {
      const response = await bed.invoke({
        method: methodForOperation('saveBrand'),
        query: queryFor('saveBrand'),
        body: JSON.stringify({ brandID: ABSENT_BRAND_ID }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('brandNotFound');
      expect(bed.saveBrandCalls).toEqual([]);
    });

    it('answers getFormattedOptionGroups naming an absent product with productNotFound', async () => {
      const response = await bed.invoke({
        query: queryFor('getFormattedOptionGroups', { productID: ABSENT_PRODUCT_ID }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('productNotFound');
      expect(bed.formattedOptionGroupsCalls).toEqual([]);
    });

    it('★★ refuses the WHOLE getOptionsForSelect request when ONE named option is absent', async () => {
      // A single miss is one outcome for the request rather than a silently shorter array, because a
      // shorter array cannot be aligned with the list that was asked for - the caller would have no way
      // to tell which of its identifiers went missing.
      bed.executor.knownOptionIDs.add(FIRST_OPTION_ID);

      const response = await bed.invoke({
        query: queryFor('getOptionsForSelect', {
          optionIDs: `${FIRST_OPTION_ID},${ABSENT_OPTION_ID}`,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('optionNotFound');
      expect(bed.optionsForSelectCalls).toEqual([]);
    });

    it('reports an unresolved outcome as ZERO records on the served log line', async () => {
      const response = await bed.invoke({
        method: methodForOperation('deleteProduct'),
        query: queryFor('deleteProduct'),
        body: JSON.stringify({ productID: ABSENT_PRODUCT_ID }),
      });
      const served = atIndex(
        decodedLines(bed).filter((line) => line.level === 'info'),
        0,
      );

      expect(response.statusCode).toBe(200);
      expect(served.message).toContain('deleteProduct');
      expect(served.context['resultCount']).toBe(0);
    });

    it('publishes no identifier back to the caller in an unresolved outcome', async () => {
      // The reason is one of a closed set of four literals of this subtree, so the document names WHAT
      // was not found without echoing the value that was submitted.
      const response = await bed.invoke({
        method: methodForOperation('saveBrand'),
        query: queryFor('saveBrand'),
        body: JSON.stringify({ brandID: ABSENT_BRAND_ID, brandName: 'Submitted Name' }),
      });

      expect(response.body).not.toContain(ABSENT_BRAND_ID);
      expect(response.body).not.toContain('Submitted Name');
    });

    // ---------------------------------------------------------------------
    // A ported save rule that failed: a 400 built from the entity's own register
    // ---------------------------------------------------------------------

    it('★★★ answers 400 when a ported saveProduct rule fails, reading the entity error register', async () => {
      // The three saves do NOT throw for a failed save-context rule: the legacy `HibachiService.save`
      // [org/Hibachi/HibachiService.cfc:L151-L167] returns the SAME entity whether it validated or not,
      // and `src/services/productService.ts` records that its two throwing classes were removed for
      // exactly that reason. Deciding a status from a returned value is transport work, so the adapter
      // reads `hasErrors()`/`getErrors()` afterwards.
      bed.outcomes.saveProductRuleFailures = [['productName', 'is required']];

      const response = await invokeOperation(bed, 'saveProduct');
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      // ★★ EVERYTHING PUBLISHED IS SERVER-AUTHORED. The path is a PROPERTY IDENTIFIER declared in
      // `model/validation/*.json` and ported into the services, and the message is the RULE that failed
      // - never the value that failed it.
      expect(issue.path).toBe('productName');
      expect(issue.message).toBe('is required');
      expect(bed.saveProductCalls).toHaveLength(1);
    });

    it('joins several rule messages for one property into one issue', async () => {
      bed.outcomes.saveProductTypeRuleFailures = [
        ['urlTitle', 'is required'],
        ['urlTitle', 'must be unique'],
      ];

      const response = await invokeOperation(bed, 'saveProductType');
      const issues = readFieldIssues(response);

      expect(response.statusCode).toBe(400);
      expect(issues).toHaveLength(1);
      expect(atIndex(issues, 0).path).toBe('urlTitle');
      expect(atIndex(issues, 0).message).toBe('is required; must be unique');
    });

    it('answers 400 when a ported saveBrand rule fails, on the same terms', async () => {
      bed.outcomes.saveBrandRuleFailures = [['brandName', 'is required']];

      const response = await invokeOperation(bed, 'saveBrand');

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('brandName');
    });

    it('publishes no submitted value alongside a failed save rule', async () => {
      bed.outcomes.saveProductRuleFailures = [['productCode', 'must be unique']];

      const response = await invokeOperation(bed, 'saveProduct', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, productCode: 'SUBMITTEDCODE' }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('SUBMITTEDCODE');
      expect(response.body).not.toContain(FIRST_PRODUCT_ID);
    });

    // ---------------------------------------------------------------------
    // The request body: five refusal shapes, each with its own stated reason
    // ---------------------------------------------------------------------

    it.each(MUTATION_OPERATIONS)('requires a body on %s', async (operation) => {
      const response = await bed.invoke({
        method: methodForOperation(operation),
        query: queryFor(operation),
        body: null,
      });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A request body is required and was not supplied.',
      );
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('treats a whitespace-only body as no body at all', async () => {
      const response = await invokeOperation(bed, 'deleteProduct', { body: '   \n  ' });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A request body is required and was not supplied.',
      );
    });

    it('refuses an unparsable body with the JSON reason, not a generic failure', async () => {
      // Stated as a REASON rather than inferred from a caught `SyntaxError`, because this service's own
      // code can produce that shape too - so the classification is chosen by the handler that knows.
      const response = await invokeOperation(bed, 'deleteProduct', { body: '{"productID":' });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request body is not valid JSON.');
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it.each([['[]'], ['"a string"'], ['42'], ['null']])(
      'refuses the well-formed but non-document body %s',
      async (body) => {
        // Each is valid JSON and none is a request document. The schemas would reject them, but naming
        // the SHAPE here produces the more precise reason.
        const response = await invokeOperation(bed, 'deleteProduct', { body });

        expect(response.statusCode).toBe(400);
        expect(readFailureBody(response).error.message).toBe(
          'The request body is not the expected shape.',
        );
      },
    );

    it('refuses a body above the byte ceiling, without echoing any of it', async () => {
      // A target-chosen SAFETY bound on how much text one invocation will parse, stated as one. The
      // largest legitimate payload is `saveProduct`'s eight scalar columns, one of which is a
      // 4000-character `wysiwyg` description [model/entity/Product.cfc:L57].
      const oversized = JSON.stringify({
        productID: FIRST_PRODUCT_ID,
        productDescription: 'x'.repeat(9 * 1024),
      });

      const response = await invokeOperation(bed, 'saveProduct', { body: oversized });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request input is not valid.');
      expect(response.body).not.toContain('xxxx');
      expect(bed.saveProductCalls).toEqual([]);
    });

    it('decodes a base64 body, because a binary media type is not a different request', async () => {
      const response = await invokeOperation(bed, 'deleteProduct', {
        body: Buffer.from(JSON.stringify({ productID: FIRST_PRODUCT_ID }), 'utf8').toString(
          'base64',
        ),
        isBase64Encoded: true,
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.deleteProductCalls, 0)).toBe(bed.world.product);
    });

    it('refuses a base64 body too long to decode within the ceiling', async () => {
      const response = await invokeOperation(bed, 'saveProduct', {
        body: 'A'.repeat(20 * 1024),
        isBase64Encoded: true,
      });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request input is not valid.');
    });

    it('★★★ refuses a body carrying __proto__, which the pinned validator would silently drop', async () => {
      // The ONE unrecognized key `z.strictObject` does not refuse: the pinned validator ACCEPTS it and
      // drops it at every nesting level. The guard closes that inconsistency, and the refusal publishes
      // a FROZEN constant naming the key itself - the only name involved the caller did not choose -
      // because a security review found (CWE-209/CWE-532) that reporting the key's ancestor path let a
      // caller choose what reached a 400 body and the log stream.
      const before = Object.getPrototypeOf({}) as object;

      const response = await invokeOperation(bed, 'saveProduct', {
        body: '{"productID":"' + FIRST_PRODUCT_ID + '","nested":{"__proto__":{"polluted":true}}}',
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('__proto__');
      expect(issue.message).toBe('is not a member this request accepts');
      expect(response.body).not.toContain('nested');
      expect(response.body).not.toContain('polluted');
      expect(Object.getPrototypeOf({})).toBe(before);
      expect('polluted' in ({} as Record<string, unknown>)).toBe(false);
      expect(bed.saveProductCalls).toEqual([]);
    });

    it.each(MUTATION_OPERATIONS)(
      'refuses an unrecognized member in the %s body',
      async (operation) => {
        const body = { ...(VALID_BODIES[operation] ?? {}), unrecognizedMember: 'sentinel' };
        const response = await invokeOperation(bed, operation, { body: JSON.stringify(body) });

        expect(response.statusCode).toBe(400);
        // `mapZodErrorFields` recognizes an unrecognized-key issue BY ISSUE CODE, keeps only the
        // schema-authored container path and substitutes a fixed sentence - so neither the member name nor
        // its value is echoed.
        expect(response.body).not.toContain('unrecognizedMember');
        expect(response.body).not.toContain('sentinel');
      },
    );

    it.each(MUTATION_OPERATIONS)(
      'refuses a %s body that tries to name the operation itself',
      async (operation) => {
        // ★★ THE SELECTOR HAS EXACTLY ONE LOCATION, AND THE SCHEMAS ENFORCE IT. Discriminating the body on
        // an `operation` member was rejected because the query-string selector is already bounded at one
        // per invocation: a second location would give a caller two places to name an operation and this
        // file a disagreement to resolve. The mutation schemas therefore declare no such member.
        const body = { ...(VALID_BODIES[operation] ?? {}), operation };
        const response = await invokeOperation(bed, operation, { body: JSON.stringify(body) });

        expect(response.statusCode).toBe(400);
        // AND THE REFUSAL COSTS NOTHING. The schema runs at step 4 and the scope is opened at step 6, so a
        // body that fails validation never reaches a connection, a statement or a service.
        expect(bed.counters.scopesOpened).toBe(0);
        expect(bed.executor.executed).toEqual([]);
      },
    );

    it.each(MUTATION_OPERATIONS)('requires the row identifier on %s', async (operation) => {
      const supplied = VALID_BODIES[operation] ?? {};
      const identifierName = atIndex(Object.keys(supplied), 0);
      const withoutIdentifier = Object.fromEntries(
        Object.entries(supplied).filter(([name]) => name !== identifierName),
      );

      const response = await invokeOperation(bed, operation, {
        body: JSON.stringify(withoutIdentifier),
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe(identifierName);
      expect(issue.message).toContain('must name an existing row');
    });

    it.each(MUTATION_OPERATIONS)('refuses an EMPTY row identifier on %s', async (operation) => {
      // An empty identifier is not an absent one, and neither is admissible: the transport policy is
      // that every mutation names an EXISTING row, so row creation is not published at all.
      const supplied = VALID_BODIES[operation] ?? {};
      const identifierName = atIndex(Object.keys(supplied), 0);

      const response = await invokeOperation(bed, operation, {
        body: JSON.stringify({ ...supplied, [identifierName]: '' }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe(identifierName);
    });

    it('IGNORES a body sent with a read rather than refusing it', async () => {
      // No read schema could describe a body, and refusing one would invent a rule the source has no
      // counterpart for. The body is not read at all on a read arm, which is what this asserts.
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        body: '{"this":"is not read"}',
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('does not let an unparsable body break a read', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        body: '{{{',
      });

      expect(response.statusCode).toBe(200);
    });

    // ---------------------------------------------------------------------
    // Mutation safety: what a mutation does NOT reach
    // ---------------------------------------------------------------------

    it.each(MUTATION_OPERATIONS)('executes no statement of its own for %s', async (operation) => {
      // ★★ EVERY PUBLISHED MUTATION GOES THROUGH THE SERVICE THAT OWNS ITS INVARIANTS. The executor
      // raises on `executeMutation` and on `transaction`, so a write arriving there would fail loudly:
      // it would mean this adapter had bypassed the service, which is exactly the arrangement
      // `RequestScope` withdrew the six raw repositories to prevent. The only statements admissible are
      // the two entity LOADS.
      const response = await invokeOperation(bed, operation);

      expect(response.statusCode).toBe(200);
      expect(bed.unpublishedTouches).toEqual([]);
      for (const sql of bed.executor.executed) {
        expect(sql.toLowerCase()).toContain('select');
      }
    });

    it.each(MUTATION_OPERATIONS)('opens exactly one request scope for %s', async (operation) => {
      const response = await invokeOperation(bed, operation);

      expect(response.statusCode).toBe(200);
      expect(bed.counters.scopesOpened).toBe(1);

      // The default authorizer for this suite is administrative, so BOTH members travel. The
      // administrative half used to be missing here and everywhere else (SEC-D): the audit actor is
      // assembled as `adminAccountFlag: input.adminAccountFlag ?? false`, so omitting it silently
      // disabled the stamping gate [org/Hibachi/HibachiEntity.cfc:L628, L633] for every one of the
      // nine mutations this route publishes.
      expect(atIndex(bed.scopeInputs, 0)).toEqual({
        accountID: CALLER_ACCOUNT_ID,
        adminAccountFlag: true,
      });
    });

    it('maps the SKU batch bound the service raises rather than swallowing it', async () => {
      // The bound is the SERVICE'S - a transactional-integrity limit on one unit of work, supplied by
      // the composition root and defaulting to 1000 - and no second bound is applied at this tier. What
      // the adapter owes is that the refusal funnels through the shared mapper like any other throw.
      bed.outcomes.updateSkusRejectsWith = new Error('the SKU update batch exceeds its bound');

      const response = await invokeOperation(bed, 'processProduct_updateSkus');

      expect(response.statusCode).toBe(500);
      expect(readFailureBody(response).error.message).toBe('The request could not be completed.');
      expect(response.body).not.toContain('bound');
    });

    it('publishes the transport policy for every operation, resendable or not', () => {
      // ★★★ RETRY SEMANTICS ARE STATED PER OPERATION AS DATA, NOT AS A MECHANISM. AAP 0.6.5 asks for
      // batch limits, retry semantics and a compensation story on a bulk mutation path; the limits are
      // the services' own, compensation is the repository's transaction, and this is the retry half.
      // Telling a caller which mutations converge is more useful than a per-container response ledger
      // claiming to make the rest safe - and a ledger keyed on a raw caller header is precisely what a
      // security review removed from this module.
      expect(CATALOG_OPERATION_TRANSPORT.processProduct_updateSkus.resendable).toBe(true);
      expect(
        CATALOG_OPERATION_TRANSPORT.processProduct_updateDefaultImageFileNames.resendable,
      ).toBe(true);

      const nonResendable = MUTATION_OPERATIONS.filter(
        (operation) => !CATALOG_OPERATION_TRANSPORT[operation].resendable,
      );
      expect(nonResendable).toHaveLength(7);

      for (const operation of READ_OPERATIONS) {
        expect(CATALOG_OPERATION_TRANSPORT[operation].resendable).toBe(true);
        expect(CATALOG_OPERATION_TRANSPORT[operation].method).toBe(firstDeclaredCatalogMethod());
      }
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION: what is NOT routable, and the tripwires proving it
  //
  // Every operation named below is refused at the selector, and the tripwire on the corresponding
  // service member is asserted untouched. The two halves matter together: a refusal alone would not
  // prove that some other path reached the member, and a silent tripwire alone would not prove the
  // caller was told.
  //
  // ★★★ ONE OF THE THREE LISTS THAT USED TO LIVE HERE IS GONE, AND ITS REMOVAL IS THE CRITICAL FIX.
  // A third list named `entityArgumentOperations` sat between the two below and held eleven names -
  // `getFormattedOptionGroups`, the six in-scope `processProduct_*` and `save*` Product actions,
  // `saveProductType`, `deleteProduct`, `getOptionsForSelect` and `saveBrand`. Its documentation read
  // "Unreachable at this tier because the composition root publishes no entity and no loader", and a
  // code review found that premise FALSE: `RequestScope.entityLoaders` publishes read-only loads by
  // identifier, so an entity-first method has a perfectly admissible argument here. All eleven are
  // published now and every one of them is exercised positively, in the block titled "the eleven
  // operations a code review restored" further down. The two lists that remain are the ones whose
  // grounds survived review - AAP 0.9.5 exclusions, and members another capability or another
  // subsystem owns.
  // =========================================================================

  describe('concern 2, delegation: the deliberate non-exposures', () => {
    /** Out of scope by AAP 0.9.5, though reachable from an in-scope file. */
    const outOfScopeOperations: readonly string[] = [
      'processProduct_addProductReview',
      'processProduct_addSubscriptionTerm',
      'processProduct_uploadDefaultImage',
      'loadDataFromFile',
    ];

    /** Owned by a different capability, or by a subsystem this migration excludes outright. */
    const otherOwnersOperations: readonly string[] = [
      'getProductSkusBySelectedOptions',
      'createSkus',
      'getProductSmartList',
      'getSkuSmartList',
      'updateOrderAmountsWithPromotions',
      'updateOrderAmountsWithPriceGroups',
      'processOrder',
      'processPayment',
      'processShipping',
      'processFulfillment',
      'saveAccount',
      'saveSubscriptionUsage',
      'saveVendorOrder',
      'calculateTaxAmount',
      'generateProductFeed',
    ];

    it.each(outOfScopeOperations)('publishes no route reaching %s', async (operation) => {
      const response = await bed.invoke({ query: { operation } });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it.each(otherOwnersOperations)('publishes no route reaching %s', async (operation) => {
      const response = await bed.invoke({ query: { operation } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('publishes no route to the hour-long bulk import, which no route could carry', async () => {
      // `loadDataFromFile` [model/service/ProductService.cfc:L65-L68] opens by raising the CFML
      // request timeout to 3600 seconds through `cfSetting(requesttimeout="3600")` at [L66]. The
      // Lambda runtime's maximum invocation duration is 900 seconds, so an hour-long budget cannot be
      // carried onto it at all - a fact about the runtime, not a service level, not a target and not a
      // claim about how long any import takes. It is therefore not published, and NO substitute is
      // invented for it: no job queue, no state machine, no queue hop and no chunked-upload protocol,
      // because the source had none. This assertion is about ROUTABILITY only and measures nothing.
      const response = await bed.invoke({ query: { operation: 'loadDataFromFile' } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
      expect(Object.keys(ROUTE_TABLE)).not.toContain('bulkImport');
    });

    it('publishes no route to createSkus, whose subscription branches are internal to it', async () => {
      // A nuance worth stating exactly: those branches are NOT separate methods. The next function
      // declared after `createSkus` [model/service/SkuService.cfc:L58] is `processImageUpload` at
      // [L210], so [L139-L202] is an INTERNAL BRANCH of `createSkus` reached on the product type. They
      // therefore cannot be "not ported" - only not EXPOSED, which is what is asserted here.
      //
      // ★★★ QUOTE-THEN-REVISE, AND THE REVISION NARROWS THIS CASE RATHER THAN WIDENING IT. It used to
      // loop over three names and close with "The creation path is reachable in the service tier
      // through `processProduct_addOptionGroup` and `processProduct_addOption`, and neither of those is
      // published either." The first clause was and is exactly right - both of those DO reach SKU
      // creation, because each calls `createSkus` after attaching its association
      // [model/service/ProductService.cfc:L113-L126, L128-L141]. The second clause is what a code
      // review overturned: both ARE published now. So the honest remaining assertion is narrower and
      // truer - `createSkus` has no route of its OWN, and the two operations that reach it do so
      // through the ported service method rather than by exposing the SKU-creation surface directly.
      const response = await bed.invoke({ query: { operation: 'createSkus' } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);

      // And the two that DO reach it are published, on POST, which is the fact that replaced the
      // sentence quoted above. Naming both here keeps the correction adjacent to the claim it corrects.
      expect(PUBLISHED_OPERATIONS).toContain('processProduct_addOptionGroup');
      expect(PUBLISHED_OPERATIONS).toContain('processProduct_addOption');
    });

    it('answers for its own capability only, across every other row of the table', async () => {
      // `org/Hibachi/**` is a boundary to extract FROM and never to port, the Taffy REST layer under
      // `frontend/api/` is out of scope, the Mura CMS bridge is not ported, and no integration adapter
      // other than Google exists. None of them has a route, so none of them is reachable: the table is
      // the whole URL surface, and this capability admits exactly one row of it.
      const foreignRoutes = Object.values(ROUTE_TABLE).filter(
        (route) => route.capability !== CATALOG_ROUTE.capability,
      );
      expect(foreignRoutes).toHaveLength(4);

      for (const route of foreignRoutes) {
        const response = await bed.invoke({
          method: route.methods,
          path: route.path,
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(404);
        expect(readFailureBody(response).error.category).toBe('routeNotFound');
      }

      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });
  });

  // =========================================================================
  // CONCERN 3 - API GATEWAY RESPONSE SHAPING
  // =========================================================================

  describe('concern 3, response shaping: the served envelope', () => {
    it('answers 200 with a JSON content type and a no-store cache directive', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      // ★ AN EXACT SET OF TWO, so an invented third fails - which is how the `nosniff` header a code
      // review withdrew stays withdrawn.
      expect(response.headers).toEqual({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
    });

    it('carries the shared envelope members, with the operation inside the payload', async () => {
      // ★★ THE SHAPE THIS ASSERTS IS THE CROSS-HANDLER ONE, NOT THIS FILE'S OWN. Finding F13 found
      // four entrypoints each publishing a differently-shaped success - two with no correlation
      // identifier at all - so `jsonSuccessResponse` now owns the outer document for all of them:
      // `requestId`, `capability`, `action`, `result`. The capability-specific selector travels
      // INSIDE `result`, which is why `operation` is asserted one level down. Both key sets are
      // pinned exactly so an added member is a failure rather than a silent widening.
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const body = readServedBody(response);

      expect(body.requestId).toBe(INVOCATION_ID);
      expect(body.capability).toBe('catalogQuery');
      // The ROUTE action, which is fixed for this entrypoint - not the operation selector, which is
      // per-request and travels inside the payload. The two are asserted separately on purpose.
      expect(body.action).toBe('queryCatalog');
      expect(Object.keys(body).sort()).toEqual(['action', 'capability', 'requestId', 'result']);

      expect(body.result.operation).toBe('findProducts');
      expect(Object.keys(body.result).sort()).toEqual(['operation', 'result']);
    });

    it('projects a product onto exactly the two columns the statement selects', async () => {
      // [model/dao/ProductDAO.cfc:L421] selects `productID, productName` from `SwProduct` and joins
      // nothing. Publishing a brand or a product-type member would tell a caller that a value was
      // selected when it was not, so the projection is closed at two.
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(record).toEqual({ productID: FIRST_PRODUCT_ID, productName: 'Nike Air Jorden' });
      expect(Object.keys(record).sort()).toEqual(['productID', 'productName']);
    });

    it('OMITS an absent product name rather than substituting a value for it', async () => {
      // Absence survives as absence. `Product.getProductName()` answers `string | undefined` because
      // the column is nullable, and the member is omitted from the JSON document - never `null`, never
      // `''`, never `0`. That discipline is not cosmetic in this subtree: `getPriceByCurrencyCode`
      // [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, and substituting a zero for
      // that absence would silently sell products for free.
      bed.outcomes.productPage = makeProductPage([matchRow(THIRD_PRODUCT_ID)]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: '' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(record).toEqual({ productID: THIRD_PRODUCT_ID });
      expect('productName' in record).toBe(false);
      // Asserted against the serialized RECORD rather than the whole body, deliberately: the body
      // legitimately names `productName` once more, as the keyword property the executed statement
      // matches on. Reading the wider document would have made this assertion pass for the wrong
      // reason on a page whose metadata happened to change.
      expect(JSON.stringify(record)).not.toContain('productName');
      expect(JSON.stringify(record)).not.toContain('null');
      expect(JSON.stringify(record)).not.toContain('""');
    });

    it('★★★ publishes NO monetary value and NO SKU member, and can no longer even be handed one (F38)', async () => {
      // ★★★ QUOTE-THEN-REVISE. This case used to seed the page with a FULLY HYDRATED product - priced,
      // sale-priced and carrying a priced SKU - under a note reading "The fixture is deliberately
      // fully priced and carries a SKU, so the assertion is about the projection being closed rather
      // than about the data happening to be empty." That fixture was possible because the service
      // answered entities from its search path, which is exactly what code review recorded as
      // unasked-for work: [model/dao/ProductDAO.cfc:L421] selects two columns and
      // [L429-L436] returns them. `ProductPage.records` now carries those rows, so a monetary value
      // cannot be put into the page AT ALL - the seeding this case used to perform does not compile.
      //
      // The property is therefore proven twice over now, and the stronger half is the directives:
      // seeding money is a TYPE error, so the projection is closed by construction rather than by a
      // mapping function that remembers to leave things out. The run-time assertions are kept because
      // they are what a reader checks, and the two sentinels are still asserted absent from the body.
      const priced = makeProductFixture({
        productID: FIRST_PRODUCT_ID,
        productName: 'Nike Air Jorden',
        price: Money.fromDecimalString(SENTINEL_UNIT_PRICE),
        calculatedSalePrice: Money.fromDecimalString(SENTINEL_SALE_PRICE),
        skus: [
          makeSkuFixture({
            skuID: SENTINEL_SKU_ID,
            skuCode: SENTINEL_SKU_CODE,
            price: Money.fromDecimalString(SENTINEL_UNIT_PRICE),
          }),
        ],
      });

      // @ts-expect-error - a page cannot carry an ENTITY any more; `records` is a row list (F38).
      void (() => makeProductPage([priced]));

      // @ts-expect-error - and a row cannot carry a price, a sale price or a SKU either.
      void (() => matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden', priced.getPrice()));

      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(Object.keys(record).sort()).toEqual(['productID', 'productName']);
      expect(response.body).not.toContain(SENTINEL_UNIT_PRICE);
      expect(response.body).not.toContain(SENTINEL_SALE_PRICE);
      expect(response.body).not.toContain(SENTINEL_SKU_ID);
      expect(response.body).not.toContain(SENTINEL_SKU_CODE);
    });

    it('serializes no entity, so no collaborator can be walked into the document', async () => {
      // The ported entities are classes whose fields are TypeScript-private only - enumerable at run
      // time - and they hold injected collaborators, so handing one to `JSON.stringify` would walk
      // from a product into a repository. Every response is an EXPLICIT projection, and this asserts
      // the observable consequence: none of the entity's own field names appears in the document.
      //
      // ★ IT IS NOW TRUE FOR A SECOND, INDEPENDENT REASON (F38), and the case is kept for the first.
      // The search path answers rows rather than entities, so on THIS route there is no entity in the
      // service's result to serialize even by accident. The projection discipline is still what the
      // case pins, because the other arms of this capability do return entities.
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      for (const internal of [
        'settingsProvider',
        'skuRepository',
        'optionRepository',
        'productRepository',
        'salePriceResolver',
        'urlTitle',
        'productCode',
        'calculatedTitle',
      ]) {
        expect(response.body).not.toContain(internal);
      }
    });

    it('preserves repository order and never reorders, filters or de-duplicates records', async () => {
      bed.outcomes.productPage = makeProductPage([
        matchRow(SECOND_PRODUCT_ID, 'Zulu Trainer'),
        matchRow(FIRST_PRODUCT_ID, 'Alpha Trainer'),
        matchRow(SECOND_PRODUCT_ID, 'Zulu Trainer'),
      ]);

      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'trainer' }),
      });

      expect(readProductPage(response).records.map((record) => record.productID)).toEqual([
        SECOND_PRODUCT_ID,
        FIRST_PRODUCT_ID,
        SECOND_PRODUCT_ID,
      ]);
    });

    it('OMITS the paging window when the service returned the whole result set', async () => {
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID)], { recordsCount: 7 });

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const page = readProductPage(response);

      expect('pageRecordsShow' in page).toBe(false);
      expect(page.recordsCount).toBe(7);
      expect(page.pageRecordsStart).toBe(0);
    });

    it('publishes the paging window the service actually applied when there was one', async () => {
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID)], {
        recordsCount: 42,
        pageRecordsStart: 20,
        pageRecordsShow: 1,
      });

      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          pageRecordsStart: '20',
          pageRecordsShow: '1',
        }),
      });
      const page = readProductPage(response);

      expect(page.pageRecordsShow).toBe(1);
      expect(page.pageRecordsStart).toBe(20);
      expect(page.recordsCount).toBe(42);
    });

    it('carries the executed statement\u2019s query contract, not the smart list\u2019s configuration', async () => {
      // AAP 0.6.2 again, on the way out this time: the executed statement joins NOTHING and matches
      // ONE property, so `joins` is empty and `keywordProperties` has a single entry. An empty join
      // list is a fact worth publishing - it is what tells a caller that a product with no brand, no
      // product type and no default SKU is still returned.
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const page = readProductPage(response);

      expect(page.entityName).toBe('SlatwallProduct');
      expect(page.joins).toEqual([]);
      expect(page.keywordProperties).toEqual([{ propertyIdentifier: 'productName', weight: 1 }]);
    });

    it('publishes an empty match as an empty record list, inventing no default', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'nothing' }),
      });
      const page = readProductPage(response);

      expect(page.records).toEqual([]);
      expect(page.recordsCount).toBe(0);
    });

    it('publishes an empty option result as an empty array', async () => {
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });

      expect(readSelectRows(response)).toEqual([]);
    });

    it('falls back to the gateway identifier when the invocation identifier is blank', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'x' }) }, '');

      expect(readServedBody(response).requestId).toBe(GATEWAY_REQUEST_ID);
    });

    it('falls back to a fixed placeholder when neither identifier carries a value', async () => {
      const response = await bed.invoke(
        { query: queryFor('findProducts', { keyword: 'x' }), gatewayRequestId: '   ' },
        '   ',
      );

      // An unjoinable log line is worse than an obviously synthetic identifier, which is why the
      // placeholder exists and why it is never an empty string.
      expect(readServedBody(response).requestId).toBe(UNATTRIBUTED_REQUEST_ID);
    });

    it('emits a body that is valid JSON on every published operation', async () => {
      for (const operation of PUBLISHED_OPERATIONS) {
        const response = await invokeOperation(bed, operation);

        expect(response.statusCode).toBe(200);
        // A block body rather than a concise one, so the parsed value is discarded rather than
        // returned: returning it would hand an `any` back out of the assertion callback.
        expect(() => {
          JSON.parse(response.body);
        }).not.toThrow();
      }
    });
  });

  // =========================================================================
  // CONCERN 4 - DOMAIN AND ERROR MAPPING
  // =========================================================================

  describe('concern 4, error mapping: what reaches a caller and what reaches the log', () => {
    it('maps an unrecognized service failure to a server-shaped generic response', async () => {
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsShow', 9);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(500);
      expect(failure.category).toBe('unrecognized');
      expect(failure.message).toBe('The request could not be completed.');
      expect(failure.requestId).toBe(INVOCATION_ID);
      // No stack, no cause, no error class and no member of the failure's own state: the envelope
      // carries exactly three members, and `fields` is omitted rather than present and empty.
      expect(Object.keys(failure).sort()).toEqual(['category', 'message', 'requestId']);
      expect(response.body).not.toContain('Paging criterion');
      expect(response.body).not.toContain('ProductPagingCriteriaError');
    });

    it('routes the classification of that failure to the log instead', async () => {
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsStart', 3);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const emitted = decodedLines(bed);
      const mapped = emitted.filter((line) => line.level === 'error');
      const line = atIndex(mapped, 0);

      // THE SPLIT IS THE POINT: the caller receives a fixed sentence and a correlation identifier,
      // while the operator receives the classification under the SAME identifier. The class name
      // reaches the line and not the body, and the correlation identifier is what joins the two.
      expect(line.context['thrownShape']).toBe('ProductPagingCriteriaError');
      expect(line.context['category']).toBe('unrecognized');
      expect(line.context['statusCode']).toBe(500);
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(response.body).not.toContain('ProductPagingCriteriaError');
      expect(response.body).not.toContain(CATALOG_ROUTE.path);

      // ★★ THE ROUTE NOW REACHES THIS LINE, AND THE INVERSION IS THE FIX. This assertion used to read
      // `toBe(false)` under a comment recording it as a judgment call - the shipped handler held the
      // routed diagnostic in a block its single `catch` funnel sat outside, so every mapped failure
      // was logged through the UNROUTED context and an operator investigating a 500 could not tell
      // WHICH endpoint had failed without correlating by hand. Observability review (finding F8)
      // named that as the defect rather than as intended behaviour, and the handler now carries ONE
      // mapping context that GAINS the route once it is resolved and is the same object the `catch`
      // reads. The label is the shared `METHOD /path` form, so it is comparable across all five
      // entrypoints, and it still reaches the LOG only - the body assertion above is unchanged.
      expect(line.context['route']).toBe(`${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`);
    });

    it('labels the route from the TABLE, never from the method the caller sent', async () => {
      // The router matches the method with `listFindNoCase`, so a lower-case `get` is admitted. The
      // logged label must still be the table's own declaration: it is one of a closed set of five, so
      // an operator can group by it, and a caller cannot steer what appears on the line.
      //
      // ★★★ AND THE DECLARATION IS A COMMA LIST NOW, WHICH THE LOG-LABEL SANITIZER HAD TO BE TAUGHT.
      // `sanitizeRouteDiagnostic` cut at the first character outside `[A-Za-z0-9/_. -]`, so widening
      // this row to `GET,POST` made every catalog line read `GET[trailing content dropped]` - a
      // reduction that never happened, reported in place of the route that was served. The comma is
      // admitted now; the four cut markers `?`, `#`, `&` and `=` are not. Asserting the WHOLE
      // declaration survives is what pins that fix from this side of the boundary.
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsStart', 3);

      const response = await bed.invoke({
        method: firstDeclaredCatalogMethod().toLowerCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });
      const line = atIndex(
        decodedLines(bed).filter((emitted) => emitted.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(line.context['route']).toBe(`${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`);
      expect(line.context['route']).not.toContain('[trailing content dropped]');
      expect(line.context['route']).not.toContain(firstDeclaredCatalogMethod().toLowerCase());
    });

    it('reports the requested route rather than a canonical row for a pre-resolution miss', async () => {
      const response = await bed.invoke({ method: 'DELETE' });
      const line = atIndex(
        decodedLines(bed).filter((entry) => entry.level === 'warn'),
        0,
      );

      expect(response.statusCode).toBe(404);
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(String(line.context['route'])).toContain('DELETE');
      expect(String(line.context['route'])).not.toBe(
        `${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`,
      );
    });

    it('lets NEITHER a statement nor a bound value out, in the body or on the log', async () => {
      // This split exists because a driver failure's text can embed the statement it was executing
      // together with the values bound into it. The mapper publishes a classification rather than the
      // failure, so the statement reaches neither destination - and the machine code, which carries no
      // narrative at all, reaches the log alone.
      bed.outcomes.unusedOptionsRejectsWith = driverShapedFailure();

      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });
      const line = atIndex(
        decodedLines(bed).filter((entry) => entry.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(readFailureBody(response).error.message).toBe('The request could not be completed.');
      for (const leak of ['SwProduct', 'sentinel-bound-value', 'select productID']) {
        expect(response.body).not.toContain(leak);
        expect(line.raw).not.toContain(leak);
      }
      expect(line.context['errorCode']).toBe('ER_BAD_FIELD_ERROR');
      expect(line.context['thrownShape']).toBe('DriverError');
    });

    it('reproduces the framework dead-call-target contract byte for byte', async () => {
      // This is the ONE case where a failure's own message is published, and it is safe because the
      // recognizing pattern enforces both of its slots as identifiers. Withholding it would lose an
      // observable behavioural contract: the framework's terminal `onMissingMethod` throw is the same
      // sentence at [org/Hibachi/HibachiEntity.cfc:L565] and [org/Hibachi/HibachiService.cfc:L280],
      // and the method name below is the legacy typo at [model/entity/Product.cfc:L614] so the fixture
      // is a real call target rather than an invented one. It must NOT be conflated with the different,
      // grammatically correct variant at [org/Hibachi/HibachiObject.cfc:L126].
      const contract =
        'You have called a method getSalePricExpirationDateTime() which does not exists in the ' +
        'Product entity.';
      bed.outcomes.findProductsRejectsWith = new Error(contract);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const failure = readFailureBody(response).error;

      // LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565]: "does not exists" is ungrammatical.
      // Preserved deliberately; do not fix without a product decision.
      expect(failure.message).toBe(contract);
      expect(failure.message).toContain('does not exists');
      expect(failure.category).toBe('missingMethod');
      // Server-shaped, because a call target that does not exist is this service's defect and not the
      // caller's mistake.
      expect(response.statusCode).toBe(500);
    });

    it('maps a thrown value that is not an Error INSTANCE at all', async () => {
      // A plain object carrying `name` and `message`: it satisfies the `Error` interface structurally
      // and fails `instanceof Error` at run time, which is precisely the shape the shipped mapper
      // singles out - a structure the logger's key-based policy would otherwise traverse and emit
      // verbatim. Classifying at the call site is what closes that case, and this asserts it does.
      bed.outcomes.findProductsRejectsWith = {
        name: 'PlainObjectFailure',
        message: 'select productID from SwProduct where productName like\u0020\u0027leaky\u0027',
      };

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const line = atIndex(
        decodedLines(bed).filter((entry) => entry.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(readFailureBody(response).error.message).toBe('The request could not be completed.');
      expect(response.body).not.toContain('SwProduct');
      expect(response.body).not.toContain('PlainObjectFailure');
      expect(line.raw).not.toContain('SwProduct');
      // `typeof`, not the object's own `name`: the shape description is derived rather than read off a
      // value the thrower controls, so a caller-authored `name` cannot reach a log line through it.
      expect(line.context['thrownShape']).toBe('object');
    });

    it('always answers with a response, never rethrowing out of the invocation', async () => {
      bed.outcomes.findProductsRejectsWith = driverShapedFailure();

      // A Lambda invocation that threw would surface as an unhandled failure with no envelope at all,
      // so the funnel returning a response is itself the assertion.
      await expect(
        bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) }),
      ).resolves.toMatchObject({ statusCode: 500 });
    });

    it('publishes the closed status set this authenticated route can reach', async () => {
      const served = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const unmatched = await bed.invoke({ path: '/nothing/here' });
      const unusable = await bed.invoke({ query: {} });
      const unidentified = await bed.invoke({
        authorizer: null,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      bed.outcomes.findProductsRejectsWith = driverShapedFailure();
      const failed = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      // Authentication adds the one 401 arm. There is no administrative operation, conflict,
      // semantic-validation tier or request quota, and none of their accompanying headers.
      expect([
        served.statusCode,
        unmatched.statusCode,
        unusable.statusCode,
        unidentified.statusCode,
        failed.statusCode,
      ]).toEqual([200, 404, 400, 401, 500]);
      for (const response of [served, unmatched, unusable, unidentified, failed]) {
        expect(Object.keys(response.headers ?? {}).sort()).toEqual([
          'cache-control',
          'content-type',
        ]);
      }
    });

    it('emits one served line carrying the correlation identifier, route and record count', async () => {
      bed.outcomes.productPage = makeProductPage([
        matchRow(FIRST_PRODUCT_ID),
        matchRow(SECOND_PRODUCT_ID),
      ]);

      await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const emitted = decodedLines(bed);
      const line = atIndex(emitted, 0);

      expect(emitted).toHaveLength(1);
      expect(line.level).toBe('info');
      expect(line.message).toBe('catalog query served: findProducts');
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(line.context['resultCount']).toBe(2);
      // No duration, no rate and no size is measured or reported on this line, and nothing here asks
      // for one: the three keys above are the whole of its structured context.
      expect(Object.keys(line.context).sort()).toEqual(['requestId', 'resultCount', 'route']);
    });

    it('reports the CANONICAL matched route on the log line, not the path as received', async () => {
      await bed.invoke({
        path: '//CATALOG/products/',
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(atIndex(decodedLines(bed), 0).context['route']).toBe(
        `${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`,
      );
    });

    it('counts the rows it served when the payload is a select-row array', async () => {
      bed.outcomes.unusedOptionGroups = [
        selectRow('Colour', 'group-colour'),
        selectRow('Size', 'group-size'),
        selectRow('Fit', 'group-fit'),
      ];

      await bed.invoke({
        query: queryFor(
          'getUnusedProductOptionGroups',
          VALID_PARAMETERS.getUnusedProductOptionGroups,
        ),
      });

      expect(atIndex(decodedLines(bed), 0).context['resultCount']).toBe(3);
    });

    it('emits a warning, not a served line, for input it refuses before the services', async () => {
      await bed.invoke({ query: { operation: 'notAnOperation' } });
      const line = atIndex(decodedLines(bed), 0);

      expect(line.level).toBe('warn');
      expect(line.context['invalidRequestReason']).toBe('unusableRequestInput');
      // ★★ A COUNT RATHER THAN THE PATHS, AND THIS ASSERTION WAS REVISED TO REQUIRE IT. The shared
      // refusal builder used to copy every published field path onto the log stream under `fieldPaths`,
      // and a security review found (MAJOR, CWE-209/CWE-532) that one producer of those paths assembled
      // them out of the CALLER's own key names. The paths are still published to the caller in the
      // response body - which the refusal cases above assert - while the line carries only a closed
      // reason and a number. `operation` is a member name this handler wrote, so nothing was lost HERE;
      // the change is that no caller can put its own text on the stream through this member.
      expect(line.context['fieldIssueCount']).toBe(1);
      expect(line.context['fieldPaths']).toBeUndefined();
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION: the per-invocation bound and duplicate-request replay
  //
  // Every operation this capability publishes is a READ. The assertions below are about the bound on
  // how many operations one invocation may name, and about the container-local replay cache that
  // answers a repeated key from the first attempt. None of them is a capacity, rate, duration or
  // availability claim, and none of them measures anything.
  // =========================================================================

  describe('concern 2, delegation: the invocation bound and duplicate-request replay', () => {
    /** A valid findProducts request, used wherever the request itself is not what varies. */
    const validRequest: EventOverrides = { query: queryFor('findProducts', { keyword: 'jorden' }) };

    /**
     * Build a valid request carrying an `idempotency-key` header.
     *
     * ★ THE HEADER IS INERT NOW, and these cases exist to prove it. Finding F5 withdrew the ledger
     * that read it; the helper is kept so the proofs are written against the same request shape the
     * removed mechanism consumed.
     */
    function keyedRequest(key: string, headerName = 'idempotency-key'): EventOverrides {
      return {
        query: queryFor('findProducts', { keyword: 'jorden' }),
        headers: { [headerName]: key },
      };
    }

    it('bounds one invocation at ONE operation and refuses the whole request rather than truncating', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        repeatedQuery: { operation: ['findProducts', 'getUnusedProductOptionGroups'] },
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('operation');
      expect(issue.message).toContain('at most 1 time per request');
      expect(issue.message).toContain('never truncated');
      // NEITHER operation ran. Truncating to the first would have executed one of the two operations
      // the caller asked for, which is the outcome the bound exists to prevent.
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('bounds the count and not the distinctness, so a repeated selector is refused too', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        repeatedQuery: { operation: ['findProducts', 'findProducts'] },
      });

      expect(response.statusCode).toBe(400);
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('exposes no parameter by which a caller could raise a bound the deployment owns', async () => {
      // The two service-tier bounds live on `ProductService`'s and `SkuService`'s constructors, both
      // supplied by the composition root. Neither is reachable from a request: the criteria shape is
      // closed, so a parameter named after either is refused rather than forwarded.
      for (const knob of [
        'maximumSkuUpdateBatchSize',
        'maximumSkuCreationBatchSize',
        'batchSize',
        'limit',
      ]) {
        const response = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [knob]: '1000000' }),
        });

        expect(response.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
        expect(bed.findProductsCalls).toEqual([]);
      }
    });

    it('maps a service-tier bound refusal rather than swallowing it', async () => {
      // `findProducts` independently refuses a supplied paging bound that is not a non-negative safe
      // integer, and that refusal is the service's to make. What this tier owes is that the refusal
      // becomes a response and a log line instead of disappearing.
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsShow', 12);

      const response = await bed.invoke(validRequest);

      expect(response.statusCode).toBe(500);
      expect(decodedLines(bed).filter((line) => line.level === 'error')).toHaveLength(1);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ HONOURS NO IDEMPOTENCY KEY, because the route no longer carries a ledger', async () => {
      // ★★★ SECURITY / API FINDING F5 (CWE-400, cache confusion). THIRTEEN CASES USED TO SIT HERE,
      // pinning a per-container ledger: replay under one key, in-flight sharing, key trimming,
      // case-insensitive header matching, oldest-first eviction at 256 entries, and a 256-character
      // key bound. Every one of them described a mechanism that has been REMOVED, and their removal
      // is the fix rather than a loss of coverage.
      //
      // WHAT WAS WRONG WITH IT. The ledger was keyed on the RAW CALLER KEY and nothing else - no
      // operation, no parameters, no caller identity, no request digest - so a caller reusing one key
      // for a DIFFERENT action received the FIRST action's body, complete with the first request's
      // correlation identifier. The 256-entry bound was a COUNT bound that retained 256 COMPLETE
      // response bodies.
      //
      // WHY REMOVAL RATHER THAN REPAIR. Quoted as it stood, because the conclusion is unchanged and half
      // of the reasoning is not: "The route is `GET /catalog/products` and all three published operations
      // are READS, so re-running one cannot double-write anything [...] AAP 0.6.5's idempotency
      // obligation is stated for BULK MUTATION paths and this capability publishes none."
      //
      // ★★★ THAT SECOND CLAUSE EXPIRED, AND THE SUBJECT SAYS SO AT THE SITE. A later code review found
      // eleven AAP-0.4.2-mapped actions unreachable from Lambda; nine are writes and two of those rebuild
      // a product's SKUs, so the capability DOES publish bulk mutation paths now and the 0.6.5 obligation
      // genuinely applies. It is met without restoring this mechanism: the batch limits are the SERVICES'
      // own - `maximumSkuUpdateBatchSize` and `maximumSkuCreationBatchSize`, both defaulting to 1000 -
      // compensation is the repository's transaction, and retry semantics are stated PER OPERATION as
      // data on `CATALOG_OPERATION_TRANSPORT`, which the transport-policy case above pins. The
      // alternative review offered - a durable record keyed by caller plus canonical request digest -
      // still means new infrastructure this migration excludes outright (AAP 0.2.2), and publishing nine
      // mutations changes which operations are non-idempotent rather than what infrastructure is
      // permitted.
      //
      // The two cases below are what replaces thirteen: the key is inert, and a retry re-executes.
      const first = await bed.invoke(keyedRequest('idem-0001'));
      const second = await bed.invoke(keyedRequest('idem-0001'), 'a-different-invocation');

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      // TWO executions and TWO scopes: nothing is recorded and nothing is replayed.
      expect(bed.findProductsCalls).toHaveLength(2);
      expect(bed.counters.scopesOpened).toBe(2);
      expect(second).not.toBe(first);
    });

    it("★★ answers every response with THIS invocation's correlation identifier, never a recorded one", async () => {
      // The sharpest consequence of the old ledger: a replayed response carried the FIRST request's
      // correlation identifier, so an operator joining a caller's response to the log stream landed on
      // a different invocation. Each response now carries its own.
      const first = await bed.invoke(keyedRequest('idem-0002'));
      const second = await bed.invoke(keyedRequest('idem-0002'), 'a-different-invocation');

      expect(readServedBody(first).requestId).toBe(INVOCATION_ID);
      expect(readServedBody(second).requestId).toBe('a-different-invocation');
    });

    it("★★★ CANNOT REPLAY ONE OPERATION'S BODY FOR ANOTHER, which was the defect itself", async () => {
      // The wrong-operation replay, reproduced as a positive assertion. Under the old ledger the
      // second call - a DIFFERENT operation under the SAME key - was answered with the first
      // operation's body. Each operation now answers for itself.
      const products = await bed.invoke(keyedRequest('idem-0003'));
      const optionGroups = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: '' }),
        headers: { 'idempotency-key': 'idem-0003' },
      });

      expect(readServedBody(products).result.operation).toBe('findProducts');
      expect(readServedBody(optionGroups).result.operation).toBe('getUnusedProductOptionGroups');
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionGroupsCalls).toHaveLength(1);
    });

    it('★★ retains NO response body across invocations, so a warm container holds no caller data', async () => {
      // The count bound retained 256 complete bodies; nothing is retained now. A distinct key per
      // call proves the point without depending on the removed eviction order.
      for (let index = 0; index < 8; index += 1) {
        const response = await bed.invoke(keyedRequest(`idem-retain-${String(index)}`));
        expect(response.statusCode).toBe(200);
      }

      // Every one executed: there is no record to answer from.
      expect(bed.findProductsCalls).toHaveLength(8);
      expect(bed.counters.scopesOpened).toBe(8);
    });

    it('★★ imposes NO length bound on the inert key, because nothing keys anything on it', async () => {
      // A 257-character key used to be a 400 naming that header path. The header is no longer
      // read at all, so it cannot make a valid request invalid - which is the right outcome for a
      // field this route does not consume.
      const response = await bed.invoke(keyedRequest('k'.repeat(1024)));

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★ SHARES NO IN-FLIGHT CALL between two concurrent requests carrying one key', async () => {
      // The last of the removed mechanisms, and the one that needed a held call to prove either way:
      // the old ledger recorded the PROMISE, so a second request arriving under the same key while the
      // first was still running was handed the first's eventual body. Two callers therefore shared one
      // execution AND one correlation identifier.
      //
      // Held open explicitly rather than raced on a timer: the gate keeps both calls inside
      // `ProductService.findProducts` until the assertion below has observed BOTH arrivals, so this
      // proves independence without depending on scheduling.
      const gate = makeGate();
      bed.outcomes.gate = gate.promise;

      const first = bed.invoke(keyedRequest('idem-inflight'));
      const second = bed.invoke(keyedRequest('idem-inflight'), 'a-second-invocation');

      // Both are inside the service before either has returned: no sharing, no coalescing.
      await vi.waitFor(() => {
        expect(bed.findProductsCalls).toHaveLength(2);
      });

      gate.open();
      const [firstResponse, secondResponse] = await Promise.all([first, second]);

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(bed.counters.scopesOpened).toBe(2);
      // Each answered under its OWN identifier, which a shared in-flight promise could not have done.
      expect(readServedBody(firstResponse).requestId).toBe(INVOCATION_ID);
      expect(readServedBody(secondResponse).requestId).toBe('a-second-invocation');
    });

    it('reaches nothing at all when it refuses', async () => {
      await bed.invoke({ query: {} });
      await bed.invoke({ query: { operation: 'processProduct_updateSkus' } });
      await bed.invoke({ path: SKU_RESOLUTION_ROUTE.path });
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', unknownKnob: '1' }),
      });

      // Every refusal above is decided BEFORE anything is constructed: no composition root resolved,
      // no request scope opened, no service member reached.
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('introduces no thread, worker or timer of its own', async () => {
      // The `cfthread`-to-`worker_threads` translation rule is recorded in the plan and is
      // UNEXERCISED: a sweep of the in-scope slice finds zero `cfthread` usages, so there is nothing
      // to translate. One invocation therefore performs exactly one unit of work, sequentially, and
      // that is observable as one scope and one service call.
      await bed.invoke(validRequest);

      expect(bed.counters.scopesOpened).toBe(1);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });
  });
});
