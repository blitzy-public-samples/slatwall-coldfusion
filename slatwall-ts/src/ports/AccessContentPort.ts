/**
 * AccessContentPort — the boundary between the content-access branch of SKU creation and the
 * unconverted Slatwall content subsystem (AAP §0.2.2.7, §0.4.1.6; TR-5).
 *
 * Legacy origin: the third arm of the `getBaseProductType()` discriminator in `createSkus`
 * [model/service/SkuService.cfc:L172-L202, entered at :L173, discriminator at :L58], which reaches
 * the injected `contentService` [:L56] at exactly two call sites, :L187 and :L196.
 * Type-only module: nothing it declares survives compilation, so the domain and service layers can
 * depend on it without a runtime cycle or a bundler ordering hazard.
 * The port name follows AAP §0.4.1.6 (`AccessContentPort`) even though the legacy branch key is
 * `contentAccess`; the SKU-side association really is spelled `singularname="accessContent"`
 * [model/entity/Sku.cfc:L77] with the mutator `addAccessContent` [:L704-L711] both paths call.
 * It resolves a content reference by identifier and nothing else: no entitlement, permission or
 * authorization notion, no content entity type, no file path or media type, no write member.
 */

/*
 * TODO(boundary): the collaborator behind this port is not converted, by design. The content
 * subsystem is out of scope and stays untouched — `model/service/ContentService.cfc`,
 * `model/entity/Content.cfc`, `model/entity/ContentAccess.cfc`, `model/dao/ContentDAO.cfc` and
 * `model/process/Content_CreateSku.cfc`. Per TR-5 the gap is flagged, not filled: this slice ships
 * the interface plus a test double, and nothing under src/domain, src/services or src/adapters
 * changes when a real implementation arrives.
 * Only `model/service/SkuService.cfc:L56` gets this port. The second `contentService` injection at
 * `model/service/ProductService.cfc:L57` has zero call sites and is one of the four dead injections
 * the plan deliberately does not wire (AAP §0.6.3.1).
 */

/*
 * Parity notes for this branch — annotate, do not repair (AAP §0.8.2 Guideline 4). Each is behaviour
 * a competent engineer would tidy up, and none may be tidied; none carries a register number, so each
 * is authoritative by its locator.
 * - Three SKU-code strategies coexist inside one method and must not be unified: bundled content
 * access uses `productCode & "-1"` [model/service/SkuService.cfc:L184], per-content access uses
 * `productCode & "-#c#"` over the 1-based loop counter [:L191, :L194], and the subscription arm
 * uses `productCode & "-#arrayLen(product.getSkus()) + 1#"` [:L159]. A SKU code is externally
 * visible — it is the feed's `g:id` and is uniqueness-validated on save
 * [model/validation/Sku.json:L11] — so harmonising the forms would change emitted identifiers.
 * - Assignment order and the default-SKU guard differ between the two paths. Bundled
 * [:L182-L189] assigns the code before the product association and sets the default SKU
 * unconditionally; per-content [:L190-L201] assigns the default only under `if(c==1)`. both
 * differences are observable — the sibling arms associate before coding [:L128/:L133, :L155/:L159],
 * and the point at which a code becomes visible is what a subsequent uniqueness read observes
 * (M6, resolved in `src/adapters/mysql/UnitOfWork.ts`).
 * - Resource-bundle key prefixes diverge for the same shape of error:
 * `validate.product.accesscontentsrequired` [:L176] against
 * `entity.product.subscriptionbenifitsrequired` [:L143] and
 * `entity.product.subscriptiontermsrequired` [:L148]. Keys are observable output (AAP §0.4.1.11),
 * so neither prefix is normalised. The constants live once in `src/errors/ValidationError.ts`.
 * - `createSkus` returns `true` on every path that does not throw [:L207], including the path where
 * the guard at :L180 short-circuited after the :L176 error, so the boolean carries no success
 * information. This port declares no member for it.
 */

/**
 * A resolved access content, modelled as a minimal opaque reference rather than a content entity:
 * `model/entity/Content.cfc` is out of scope, and the branch needs only something it can hand to
 * `addAccessContent` [model/entity/Sku.cfc:L704-L711].
 *
 * TODO(boundary): the reference stays opaque until the content subsystem is converted, and it widens
 * by adding members so every consumer keeps compiling.
 */
import type { ExactDecimal } from '../util/formatting';

export interface AccessContentReference {
  /**
   * The resolved content's primary-key identifier.
   * Legacy shape [model/entity/Content.cfc:L52]: a 32-character string identifier. It is the
   * same value that was passed to the resolving member, echoed back so a consumer can correlate
   * a resolution with its request without holding the request order.
   */
  readonly contentID: string;
}

/**
 * The two SKU-creation shapes the content-access branch can take. Naming the legacy boolean as a
 * typed discriminant is a permitted idiom change (AAP §0.8.1); collapsing the two shapes into one
 * path would not be, so the union holds a consumer to both arms.
 * - `'bundled'` — one SKU carries all access contents [model/service/SkuService.cfc:L182-L189].
 * - `'skuPerContent'` — one SKU per access content [:L190-L201].
 * The guard at :L181 requires the flag to be both present and truthy for the bundled shape, so every
 * other case takes the per-content shape — which is why the flag below is optional.
 */
export type ContentAccessSkuCreationMode = 'bundled' | 'skuPerContent';

/**
 * The typed shape of the `data` argument the content-access branch reads
 * [model/service/SkuService.cfc:L58]. Exactly three keys, because that is what the branch reads:
 * `listPrice` belongs to the merchandise arm only [:L94, :L130].
 * Optionality is derived from the legacy guards, not chosen: `price` is read unguarded [:L183, :L193]
 * so it is required, while `accessContents` [:L175] and `bundleContentAccess` [:L181] are existence-
 * guarded so they are optional. Under `exactOptionalPropertyTypes` that distinction stays visible.
 */
export interface ContentAccessSkuCreationData {
  /**
   * The price applied to every SKU this branch creates; read unguarded at
   * `model/service/SkuService.cfc:L183` and `:L193`, hence required.
   * Tightening recorded (TR-1): the legacy value arrives untyped, and `model/validation/Sku.json:L9`
   * already required it numeric with a minimum of 0, so typing it here relaxes nothing. The type is
   * {@link ExactDecimal} rather than `number` because this value is outbound — it is persisted to
   * `SwSku.price`, declared `ormtype="big_decimal"` [model/entity/Sku.cfc:L56] — and a double cannot
   * represent every value that column accepts. `PricingPort.salePrice` stays `number` for the
   * opposite reason: it is inbound from the excluded promotion subsystem and is never bound.
   */
  readonly price: ExactDecimal;

  /**
   * The access-content identifiers to attach, in the order supplied. The legacy value is a
   * comma-delimited list read with `listLen`/`listGetAt` [model/service/SkuService.cfc:L175, :L186,
   * L187, :L191, :L196]; an array is a permitted idiom change, but order is behaviour — under the
   * per-content shape the first element becomes the product's default SKU [:L197-L199] and each
   * element's 1-based position is interpolated into its SKU code [:L194].
   * Optional because :L175 guards existence and treats absent and empty alike. Reaching this port
   * implies the collection was present and non-empty, since the guard at :L180 stops the branch first.
   */
  readonly accessContents?: readonly string[];

  /**
   * Whether one SKU should carry all of the access contents. The guard at
   * `model/service/SkuService.cfc:L181` requires the key to be both present and truthy for the
   * bundled shape, so it is optional here and absence behaves as `false`. It is the branch key, not a
   * decoration: the two shapes differ in how many SKUs are created, how each code is built and how
   * the default SKU is assigned. See {@link ContentAccessSkuCreationMode}.
   */
  readonly bundleContentAccess?: boolean;
}

/**
 * Resolve an access content by identifier — the entire contract. Both call sites
 * [model/service/SkuService.cfc:L187, :L196] do the same thing: turn one identifier from the
 * access-content collection into something attachable to a SKU.
 * IR-1: `getContent` has no legacy declaration anywhere. It is fabricated by prefix dispatch
 * [org/Hibachi/HibachiService.cfc:L255-L281], so TR-3 applies and it is declared explicitly here.
 * The synthesis is not reproduced wholesale — this slice calls no create, save, delete, count, list,
 * export or paginated-list member on the content collaborator, so none is declared.
 */
export interface AccessContentPort {
  /**
   * Resolves the access content identified by `contentID`, porting
   * `getContentService().getContent( … )` [model/service/SkuService.cfc:L187, :L196].
   * Positional single argument, not an options object: the synthesized member accepts ordered
   * arguments only [org/Hibachi/HibachiService.cfc:L253, :L303] and both call sites pass a bare
   * identifier from `listGetAt`. The legacy return-new-on-miss flag is not exposed, because neither
   * call site supplies it.
   *
   * @param contentID A content primary key [model/entity/Content.cfc:L52] — 32 characters (IR-6).
   * @returns The resolved reference, or `null` when nothing carries that identifier — faithful to
   * `org/Hibachi/HibachiDAO.cfc:L6`, where a primary-key miss returns nothing once the
   * return-new flag is left at its default. The legacy branch does not check the outcome and
   * passes the result straight into `addAccessContent` [model/entity/Sku.cfc:L704-L711], so
   * modelling the miss forces the consumer to decide what an unresolvable identifier means.
   */
  getContent(contentID: string): Promise<AccessContentReference | null>;

  /**
   * Resolves many access contents in one boundary call, keyed by identifier. Both shapes cross this
   * boundary once per identifier — the bundled path attaches every row to one SKU, the per-content
   * path creates one SKU per row — so a product with `k` rows otherwise asks one question `k` times.
   * {@link AccessContentPort.getContent} keeps its single-identifier contract.
   * An identifier matching no row is absent from the map rather than an error, mirroring the `null`
   * arm above and for the same reason: the consumer owns that decision. The map answers one call and
   * is not cached (M7).
   *
   * @param contentIDs The identifiers to resolve; duplicates are permitted and resolve once.
   * @returns a map holding an entry only for identifiers that matched a row.
   */
  getContentsByIDs(contentIDs: readonly string[]): Promise<Map<string, AccessContentReference>>;
}
