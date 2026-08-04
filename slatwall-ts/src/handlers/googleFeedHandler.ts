/**
 * googleFeedHandler — the AWS-facing entry point for the Google merchant product feed, translated
 * from `integrationServices/google/controllers/feed.cfc:L49-L74`.
 *
 * The feed's logic is deliberately split three ways, because that is how the legacy split it: record
 * selection lives in `../integrations/google/ProductFeedQuery` (from the controller), field mapping in
 * `../integrations/google/ProductFeedBuilder` (from `views/feed/product.cfm`), and the interface stub in
 * `../integrations/google/GoogleIntegration` — which carries no feed logic, exactly as
 * `integrationServices/google/Integration.cfc` carries none (AAP §0.6.4). This file composes those
 * parts and translates the platform envelope; it emits no XML element and composes no query.
 *
 * This route is the one anonymous action in the slice: `feed.cfc:L54` declares
 * `this.publicMethods="product"`, so the port grants no principal and gates nothing behind one.
 *
 * M2 (AAP §0.6.6) — the render-budget mismatch is flagged here and left open. This file owns M2.
 * `integrationServices/google/views/feed/product.cfm:L9` asks the CFML engine for a 360-second request
 * budget with `<cfsetting requesttimeout="360" />`. 360 seconds sits inside the target platform's
 * published 15-minute maximum function timeout, so the work is expressible as one invocation, but it far
 * exceeds what a synchronous HTTP integration in front of that function generally allows, so a
 * synchronously delivered feed of any real catalogue size can be cut off in front of the function while
 * the function still runs. No single number is asserted for that second ceiling, because there is not
 * one: synchronous integration limits vary by gateway type, region and configuration, this deliverable
 * selects no gateway (infrastructure as code is out of scope, AAP §0.2.2.5), and naming one figure would
 * state as settled a fact the deployment decides. The choice between an asynchronous and a streamed
 * delivery model is therefore left open — flagging the mismatch is the required response (AAP §0.8.3.6)
 * and resolving it here is the forbidden one (AAP §0.8.2 guideline 4) — so this file sets, caps, re-times
 * or invents no budget, page size, chunk size, cursor, streaming threshold, concurrency limit, retry
 * count, queue or cache lifetime. M1, the importer's one-hour budget at
 * `model/service/ProductService.cfc:L65-L68`, belongs to `./productHandler` and is not restated here.
 */

/* Imports — three modules, all relative and extensionless. */
import type { CatalogContainer } from '../config/container';
import type { AnonymousMaterialisationGate } from '../adapters/mysql/SmartListQueryBuilder';
import type {
  ProductFeedBuilder,
  ProductFeedImage,
  ProductFeedRecord,
  ProductFeedRenderContext,
} from '../integrations/google/ProductFeedBuilder';
/*
 * A value import, not a type one: the host gate is executed at construction. It is the only runtime symbol
 * this handler takes from the serializer module, which is why it is imported on its own line.
 */
import { validateFeedHostAuthority } from '../integrations/google/ProductFeedBuilder';
import type { ProductFeedQuery } from '../integrations/google/ProductFeedQuery';
import { createActionDispatcher, errorResponse, xmlResponse } from './httpResponse';
import type {
  ActionRoute,
  ActionRouteTable,
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from './httpResponse';

/* The collaborator seams. */

/**
 * The record-selection seam: the one member of `../integrations/google/ProductFeedQuery` this file
 * calls.
 */
export type ProductFeedRecordSource = Pick<ProductFeedQuery, 'getFeedSkus'>;

/**
 * The serialization seam: the one member of `../integrations/google/ProductFeedBuilder` this file
 * calls.
 */
export type ProductFeedSerializer = Pick<ProductFeedBuilder, 'build'>;

/** The deployment's feed-host configuration, as the handler needs it. */
export interface GoogleFeedHostConfiguration {
  /**
   * The host authority every absolute URL in the feed is built on — the canonical replacement for the
   * five `CGI.HTTP_HOST` reads at `integrationServices/google/views/feed/product.cfm:L14`, `:L15`,
   * `:L22`, `:L23` and `:L24`.
   */
  readonly host: string;
}

/**
 * Reads one SKU's product images for the feed.
 *
 * TODO(boundary): the rightful owner is the image subsystem behind `../ports/ImagePathPort`, which is
 * outside this slice. A deployment that has no implementation to supply gets a refusal — the shipped
 * default on `../config/container.ts` raises a `NotImplementedError`, published as `501` — rather than an
 * empty list: an empty answer would make an image-less catalogue and an unwired boundary
 * indistinguishable, publishing an incomplete document as a success. No defect number is minted for this
 * observation — AAP §0.6.7 is frozen at D1-D21 and none of its entries covers it.
 */
export type ProductFeedImageReader = (sku: ProductFeedRecord['sku']) => readonly ProductFeedImage[];

/** The two ambient values the legacy view read from its own request while rendering. */
export interface ProductFeedRenderClock {
  /** The render instant, replacing `now` at `product.cfm:L30`. */
  now(): Date;

  /** The UTC hour offset, replacing `getTimeZoneInfo().utcHourOffset` at `product.cfm:L30`. */
  utcHourOffset(): string;
}

/** Everything {@link createGoogleFeedHandler} needs, named rather than positional. */
export interface GoogleFeedHandlerCollaborators {
  /** Selects the SKUs the feed contains. See {@link ProductFeedRecordSource}. */
  readonly feedQuery: ProductFeedRecordSource;

  /** Serializes the RSS document. See {@link ProductFeedSerializer}. */
  readonly feedSerializer: ProductFeedSerializer;

  /**
   * The configured feed host. Checked for shape — never for identity, and never normalised. See
   * {@link GoogleFeedHostConfiguration}.
   */
  readonly hostConfiguration: GoogleFeedHostConfiguration;

  /**
   * Reads a SKU's product images — a declared boundary gap, bound by the container rather than by this
   * file. See {@link ProductFeedImageReader} for the contract, including the rule that `[]` is
   * answerable only for a product that genuinely has no images.
   */
  readonly readProductImages: ProductFeedImageReader;

  /** Supplies the two ambient render values. See {@link ProductFeedRenderClock}. */
  readonly clock: ProductFeedRenderClock;

  /** The bound check this anonymous route runs before it materialises anything. */
  readonly assertMaterialisationBounded: AnonymousMaterialisationGate;
}

/** The routed feed operation — one member, named exactly as the legacy controller names it. */
/** Optional invocation-scoped controls for one {@link GoogleFeedHandler.product} call. */
export interface GoogleFeedInvocationOptions {
  /** A cancellation signal owned by the caller. */
  readonly signal?: AbortSignal;
}

export interface GoogleFeedHandler {
  readonly product: (options?: GoogleFeedInvocationOptions) => Promise<APIGatewayProxyResult>;
}

/**
 * Binds the feed collaborators to the one platform-facing operation they back.
 *
 * @param collaborators the wiring, named rather than positional; see
 * {@link GoogleFeedHandlerCollaborators}
 *
 * @returns the one routed operation, frozen
 *
 * @example
 * ```ts
 * // src/handlers/router.ts wires it once, from the composition root:
 * ```
 */
export function createGoogleFeedHandler(
  collaborators: GoogleFeedHandlerCollaborators,
): GoogleFeedHandler {
  const {
    feedQuery,
    feedSerializer,
    hostConfiguration,
    readProductImages,
    clock,
    assertMaterialisationBounded,
  } = collaborators;

  /*
   * Judgment (c). Read once and passed to the render context unmodified — not branded, not trimmed, not
   * case-folded, not punycoded and not stripped of a default port. It is bound here rather than inside the
   * operation because it cannot vary between invocations of one container (M7), and because binding it once
   * means the `http://<host>` text is sourced from exactly one place.
   */
  const host = hostConfiguration.host;

  validateFeedHostAuthority(host);

  /**
   * Renders and returns the Google product feed — the port of `product(rc)` at feed.cfc:L58.
   *
   * @param options optional invocation-scoped controls; see {@link GoogleFeedInvocationOptions}.
   * Nothing in it changes a single emitted byte, and omitting it renders exactly what this
   * operation rendered before it existed.
   */
  const product = async (options?: GoogleFeedInvocationOptions): Promise<APIGatewayProxyResult> => {
    try {
      /*
       * The cancellation is forwarded to the two layers that own a boundary, and this file
       * honours none of it itself. The selection owns one boundary — the single catalog-wide read —
       * and the serializer owns the other — the record boundary between two complete `item` elements.
       * Both raise their own refusal, which reaches the one catch below like every other failure, so
       * this module still inspects no error and constructs none.
       */
      const cancellation = options?.signal;

      /*
       * Step 0 — the materialisation bound (CWE-400) is checked before any work and inside the `try`.
       * Both placements matter: checking first means an unbounded configuration cannot start a
       * catalog-wide read, and checking inside means the refusal is mapped like every other failure.
       */
      assertMaterialisationBounded();

      /*
       * Step 1. read per invocation, and read from the injected clock so this module
       * contains no clock access of its own. Both values are taken before any work begins, so the two
       * endpoints of the sale-price effective-date range are computed against one instant and one
       * offset and cannot describe two different zones.
       */
      const renderTime = clock.now();
      const utcHourOffset = clock.utcHourOffset();

      /* Step 2. One call, no arguments, and no selection composed here. */
      const selection = await feedQuery.getFeedSkus(
        cancellation === undefined ? undefined : { signal: cancellation },
      );

      /*
       * Step 3 — the unpaged collection, which is the one the feed consumes: `product.cfm:L16` loops
       * the smart list's records rather than its page records, and the record source hands exactly that
       * collection back untouched. Reading a page here would silently truncate the feed to one page.
       */
      const records: readonly ProductFeedRecord[] = selection.map((sku) => ({
        sku,
        productImages: readProductImages(sku),
      }));

      /*
       * The image reader is deliberately not memoised by product, and the reason is the seam's
       * own type. {@link ProductFeedImageReader} takes a SKU, so keying a memo on the SKU's product
       * would assume the supplied reader is a pure function of the product — an assumption the contract
       * does not make and that this file is not entitled to make on an implementor's behalf. The
       * assumption would also buy almost nothing: the reader is synchronous by contract and performs no
       * I/O, so a repeat is an in-memory collection read. The product-wide cost that actually mattered
       * is the resized-path resolution for each of those images, and the serializer removes that repeat
       * at its own port wrapper, where the memo key is the resolved path request rather than the product.
       */

      /*
       * Step 4. every element name, every field mapping and both conditional branches
       * belong to the serializer; this call contributes only the four render-context values, and the
       * annotation is written out so the compiler checks the shape at this call site rather than
       * inside the argument.
       */
      const renderContext: ProductFeedRenderContext = {
        host,
        renderTime,
        utcHourOffset,
      };

      /*
       * The cancellation is not forwarded, because the serializer accepts none: M2 requires the
       * delivery-model mismatch behind `product.cfm:L9`'s 360-second budget to stay an unresolved
       * decision, and a stop mechanism on the render would settle half of it. `cancellation` still
       * governs step 2's record selection, where `../integrations/google/ProductFeedQuery` declares its
       * own options member, so nothing about this handler's own contract changes. Serialization is
       * in-memory string assembly over records already materialised, so the only work that can run long
       * is the read that step 0 has already bounded.
       */
      const feed = await feedSerializer.build(records, renderContext);

      /*
       * Step 5. The document becomes the body verbatim: no layout, no envelope, no
       * wrapper, no encoding step and nothing prepended or trimmed, so the XML declaration stays the
       * literal first bytes exactly as at `product.cfm:L1`. The content type, the reason no charset
       * parameter is attached, and the status all belong to ./httpResponse.
       */
      return xmlResponse(feed);
    } catch (error) {
      /* every failure funnels through one mapping, and this file inspects nothing. */
      return errorResponse(error);
    }
  };

  return Object.freeze({ product });
}

/* The Lambda entry point. */

/** The single action this entry point serves, spelled exactly as the legacy addressed it. */
export type GoogleFeedRouteKey = 'google:feed.product';

/** Minutes in an hour. */
const MINUTES_PER_HOUR = 60;

/**
 * The two ambient values `integrationServices/google/views/feed/product.cfm:L30` read while rendering.
 */
const FEED_RENDER_CLOCK: ProductFeedRenderClock = Object.freeze({
  now: (): Date => new Date(),

  utcHourOffset: (): string =>
    String(Math.trunc(new Date().getTimezoneOffset() / MINUTES_PER_HOUR)),
});

/*
 * This file declares no default image reader. The composition root owns the boundary and the refusal
 * that stands in for it, so an unwired image subsystem answers `501` in exactly one place rather than
 * quietly reporting an empty image list from here.
 */

/** Substitutions a deployment may supply when it has an implementation for a declared boundary. */
export interface GoogleFeedHandlerOverrides {
  /**
   * A reader for a SKU's product images. Omit it to keep the declared out-of-scope boundary, which
   * refuses with `501` rather than reporting an empty image list.
   */
  readonly readProductImages?: ProductFeedImageReader;
}

/**
 * The container members the feed's wiring actually reads — five of them, two carrying a boundary.
 */
export interface GoogleFeedContainerSlice {
  /** The record source the container owns. See {@link ProductFeedRecordSource}. */
  readonly productFeedQuery: ProductFeedRecordSource;

  /** The serializer the container owns. See {@link ProductFeedSerializer}. */
  readonly productFeedBuilder: ProductFeedSerializer;

  /** Only the feed's own configuration section is read; nothing else in `config` is touched. */
  readonly config: { readonly googleFeed: GoogleFeedHostConfiguration };

  /** Refuses an unbounded anonymous materialisation (CWE-400). */
  readonly assertAnonymousMaterialisationBounded: AnonymousMaterialisationGate;

  /** The container's product-image reader. */
  readonly productFeedImages: ProductFeedImageReader;
}

/** Compile-time proof that the real graph still satisfies the narrowing above. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

type _CatalogContainerSatisfiesFeedSlice = AssertAssignable<
  CatalogContainer,
  GoogleFeedContainerSlice
>;

/**
 * Builds the feed handler from the composition root.
 */
export function createGoogleFeedHandlerFromContainer(
  container: GoogleFeedContainerSlice,
  overrides?: GoogleFeedHandlerOverrides,
): GoogleFeedHandler {
  return createGoogleFeedHandler({
    feedQuery: container.productFeedQuery,
    feedSerializer: container.productFeedBuilder,
    hostConfiguration: container.config.googleFeed,
    /*
     * From the graph, not from a default declared here. The composition root owns the reader and the
     * refusal that stands in for it, so there is exactly one place a deployment injects an image
     * subsystem and exactly one behaviour when it does not. This file used to declare its own
     * empty-list reader and wire it, which is how a silently incomplete feed came to be the shipped
     * default.
     */
    readProductImages: overrides?.readProductImages ?? container.productFeedImages,
    clock: FEED_RENDER_CLOCK,
    /*
     * Taken from the graph, already built from the effective bounds — not from
     * `container.config.resourceBounds`, which disagrees with them exactly when a caller has overridden the
     * section, and not from a factory imported here, which would reinstate the load-time edge to the
     * composition root this file exists to avoid.
     */
    assertMaterialisationBounded: container.assertAnonymousMaterialisationBounded,
  });
}

/**
 * Maps the served action name onto the member that answers it.
 */
export function createGoogleFeedRoutes(
  handlers: GoogleFeedHandler,
): ActionRouteTable<GoogleFeedRouteKey> {
  /*
   * The literal is annotated before it is frozen, and the order is load-bearing. `object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<GoogleFeedRouteKey, ActionRoute> = {
    'google:feed.product': () => handlers.product(),
  };

  return Object.freeze(routes);
}

/** The dispatcher, built once per container and reused for every later invocation. */
let dispatchGoogleFeedAction: ActionRoute | undefined;

/**
 * The shape `../config/container`'s `getFeedSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 */
type FeedSurfaceModule = typeof import('../config/container');

/**
 * The Lambda entry point for the Google product feed.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchGoogleFeedAction === undefined) {
      /*
       * A deferred CommonJS `require`, deliberately not a dynamic `import`. The difference was
       * measured, not assumed, and it decided this line.
       */
      const { getFeedSurfaceGraph } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above.
        require('../config/container') as FeedSurfaceModule;
      const container = getFeedSurfaceGraph();

      dispatchGoogleFeedAction = createActionDispatcher<GoogleFeedRouteKey>({
        routes: createGoogleFeedRoutes(createGoogleFeedHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchGoogleFeedAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/** Compile-time proof that the export above satisfies the runtime's handler contract. */
type AssertHandlerAssignable<TActual extends TExpected, TExpected> = TActual;
type _GoogleFeedHandlerSatisfiesLambdaContract = AssertHandlerAssignable<
  typeof handler,
  APIGatewayProxyHandler
>;
