/**
 * AccessContentPort — the declared boundary between the content-access branch of SKU creation and
 * the unconverted Slatwall content subsystem.
 *
 * A type-only module: two concepts, no executable statement, no imports, so nothing it declares
 * survives compilation and a consumer reaching it through a type-only import drops the module from
 * the bundle. That is what makes it safe for the domain and service layers to depend on, and why it
 * can introduce neither a runtime cycle nor a bundler ordering hazard.
 *
 * Legacy origin — the content-access branch of `createSkus`:
 *   model/service/SkuService.cfc:L172-L202 — the branch itself, entered at
 *     model/service/SkuService.cfc:L173, the third arm of the three-way discriminator on
 *     `product.getProductType().getBaseProductType()` declared at
 *     model/service/SkuService.cfc:L58; the first arm is `merchandise`
 *     (model/service/SkuService.cfc:L61) and the second `subscription`
 *     (model/service/SkuService.cfc:L139).
 *   model/service/SkuService.cfc:L56 — `property name="contentService"`, the injected collaborator
 *     this port replaces, exercised at exactly two call sites, both inside this branch:
 *     model/service/SkuService.cfc:L187 and model/service/SkuService.cfc:L196.
 *   org/Hibachi/HibachiService.cfc:L255-L281 — `onMissingMethod`, read for its contract only.
 *
 * Authority: AAP §0.4.1.6 "Ports" row 9 and AAP §0.2.2.7 row 4 — CREATE, purpose "content resolution
 * for the non-merchandise branch". It exists to satisfy TR-5: cross the scope boundary only through
 * a declared port, and never quietly drop the member from the interface. AAP §0.8.3.8 states the
 * payoff — the content subsystem stays unconverted and the SKU service still compiles and bundles.
 *
 * NAMING — THE PORT NAME INVERTS THE BRANCH KEY, DELIBERATELY. The legacy branch key is
 * `contentAccess` (model/service/SkuService.cfc:L173) and the legacy data key is `accessContents`
 * (model/service/SkuService.cfc:L175), while AAP §0.4.1.6 row 9 fixes this file and its exported
 * interface as `AccessContentPort`. The name is load-bearing at the consuming call site in
 * src/services/SkuService.ts and in src/config/container.ts, so it is NOT "corrected" to
 * `ContentAccessPort`. The SKU-side association really is spelled in this order:
 * `singularname="accessContent"` at model/entity/Sku.cfc:L77, with the mutator `addAccessContent` at
 * model/entity/Sku.cfc:L704-L711 that both branch paths call.
 *
 * MEMBER AUDIT — EXACTLY TWO CONCEPTS. Content resolution by identifier (`AccessContentPort`, one
 * asynchronous member with absence representable, plus the minimal opaque `AccessContentReference`
 * it returns), and the typed shape of the branch's input data (`ContentAccessSkuCreationData`, the
 * three keys the branch reads with the exact optionality the legacy guards imply, plus the
 * `ContentAccessSkuCreationMode` discriminant naming the two verified paths).
 *
 * Deliberately absent, each because it would be an invention or a scope breach: every notion of
 * entitlement, permission, authorization or access granting; a content entity type; a content file
 * path, download address, streaming handle or media type; a creation, save, delete or paginated-list
 * member; a subscription-term member; and an account type. This port resolves a content reference by
 * identifier. It authorises nothing, writes nothing, and yields no file.
 */

/*
 * TODO(boundary): the collaborator behind this port is not converted, by design.
 *
 * The content subsystem is explicitly out of scope, and it is exactly five files — every one of
 * which stays byte-for-byte untouched and unported:
 *   model/service/ContentService.cfc      the collaborator injected at
 *                                         model/service/SkuService.cfc:L56
 *   model/entity/Content.cfc              the entity `getContent` resolves
 *   model/entity/ContentAccess.cfc
 *   model/dao/ContentDAO.cfc
 *   model/process/Content_CreateSku.cfc
 *
 * Per TR-5 the gap is FLAGGED, not filled. A real implementation of this interface belongs to a
 * later strangler-fig iteration, or to an adapter that calls whatever system owns content by
 * then; the deliverable for this slice ships the interface plus a hand-written test double.
 * Nothing in `src/domain/**`, `src/services/**` or `src/adapters/**` needs to change when that
 * implementation eventually arrives, which is the whole point of declaring the boundary here.
 *
 * TWO INJECTIONS, ONLY ONE OF THEM REAL — evidence, and a trap worth naming:
 *   model/service/SkuService.cfc:L56    `contentService`, TWO call sites
 *                                       [model/service/SkuService.cfc:L187 and :L196].
 *                                       Genuine but out of scope. It gets this port.
 *   model/service/ProductService.cfc:L57 `contentService` declared again — with ZERO call sites
 *                                       anywhere in that file. A dead injection, one of four the
 *                                       plan deliberately does not carry (AAP 0.6.3.1,
 *                                       AAP 0.4.3.1). It is cited here as evidence and is NOT
 *                                       wired: handing `ProductService` this port would create a
 *                                       dependency the legacy system never exercises.
 */

/*
 * ============================================================================================
 * PARITY REGISTER — ANNOTATE, DO NOT REPAIR (AAP 0.7.3 standard 7)
 * ============================================================================================
 * Four findings about the branch. Each is recorded here with its
 * locator because each is behavior a competent engineer would instinctively tidy up, and AAP
 * 0.8.2 Guideline 4 forbids exactly that: do not enhance or optimize business logic beyond what
 * the migration requires. None of them is assigned a defect or mismatch number, and inventing an entry
 * would misrepresent the artifact trail: the register is stated canonically, and only once, in the
 * header of `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus
 * BOTH FROZEN AT THE AAP's OWN BOUNDS — AAP 0.6.7's D1-D21 and AAP 0.6.6's M1-M8. Nothing in this port mints an identifier beyond either range; a further source observation is recorded by its `path:Lnnn` locator instead).
 *
 * --------------------------------------------------------------------------------------------
 * TODO(parity) AC-1 — THREE DISTINCT SKU-CODE STRATEGIES LIVE INSIDE ONE METHOD
 * --------------------------------------------------------------------------------------------
 * All three build on `product.getProductCode()` and then diverge:
 *   model/service/SkuService.cfc:L184  bundled content access:   productCode & "-1"
 *   model/service/SkuService.cfc:L194  per-content access:       productCode & "-#c#"
 *                                        where `c` is the 1-based loop counter opened at
 *                                        model/service/SkuService.cfc:L191
 *   model/service/SkuService.cfc:L159  subscription branch:
 *                                        productCode & "-#arrayLen(product.getSkus()) + 1#"
 * For completeness, the merchandise arm reuses two of the same three forms rather than adding a
 * fourth: the counted form at model/service/SkuService.cfc:L97 and the literal "-1" at
 * model/service/SkuService.cfc:L133.
 *
 * These MUST NOT be unified. A SKU code is an externally visible identifier — it is the feed's
 * `g:id` and it is uniqueness-validated on save [model/validation/Sku.json:L11 declares `skuCode`
 * required and unique] — so harmonising the three strategies would change the identifiers the
 * system emits. That is an observable behavior change wearing the costume of a cleanup, and it
 * is precisely what Guideline 4 exists to prevent. The three forms are also not
 * interchangeable in effect: the counted form is positional within one invocation, while the
 * `arrayLen` form depends on how many SKUs the product already carries.
 *
 * --------------------------------------------------------------------------------------------
 * TODO(parity) AC-2 — ASSIGNMENT ORDER, AND AN ASYMMETRIC DEFAULT-SKU GUARD
 * --------------------------------------------------------------------------------------------
 * Bundled path [model/service/SkuService.cfc:L182-L189], in source order:
 *   L182 construct the SKU, L183 set the price, L184 set the SKU code,
 *   L185 associate the product, L186-L188 attach every access content,
 *   L189 set the product's default SKU — UNCONDITIONALLY.
 * Per-content path [model/service/SkuService.cfc:L190-L201], in source order:
 *   L192 construct, L193 price, L194 SKU code, L195 associate the product,
 *   L196 attach the one access content,
 *   L197-L199 set the default SKU ONLY under `if(c==1)` — CONDITIONALLY.
 *
 * Two properties are being preserved, and both are observable.
 *
 * First, the code is assigned BEFORE the product association in this branch, which is the
 * inverse of both sibling arms: merchandise associates at
 * model/service/SkuService.cfc:L128 and only then codes at
 * model/service/SkuService.cfc:L133, and subscription associates at
 * model/service/SkuService.cfc:L155 and codes at model/service/SkuService.cfc:L159. Ordering is
 * not cosmetic here. AAP 0.6.2 documents that SKU validation reads rows back through a
 * database query while the same operation is still writing them, so the point in the sequence
 * at which a code becomes visible relative to its product association is part of what a
 * subsequent uniqueness read observes. Resolving that visibility is owned by
 * `src/adapters/mysql/UnitOfWork.ts`, which must make each insert visible to the next read
 * inside one transaction; it is NOT resolved here, and no mismatch number is claimed for it —
 * the plan's read-back mismatch is already allocated to the loop described in AAP 0.6.2.
 *
 * Second, the default-SKU guard genuinely differs between the two paths, and the difference is
 * not redundant: the bundled path creates exactly one SKU so an unconditional assignment is
 * total, whereas the per-content path creates one per content and assigns only on the first.
 * Making the guard uniform in either direction would change which SKU ends up default whenever
 * the bundled path is taken alongside pre-existing SKUs. Neither the order nor the guard is
 * harmonised by this port, and neither may be harmonised by its consumer.
 *
 * --------------------------------------------------------------------------------------------
 * TODO(parity) AC-3 — THE RESOURCE-BUNDLE KEY PREFIX DIVERGES BETWEEN THE TWO BRANCHES
 * --------------------------------------------------------------------------------------------
 * When the access-content collection is missing or empty, this branch raises an error against
 * the `accessContents` property using the key
 *   validate.product.accesscontentsrequired
 * at model/service/SkuService.cfc:L176. The sibling subscription arm, raising the same shape of
 * error for the same shape of reason from the same method, uses a DIFFERENT leading namespace:
 *   entity.product.subscriptionbenifitsrequired
 * at model/service/SkuService.cfc:L143, alongside `entity.product.subscriptiontermsrequired` at
 * model/service/SkuService.cfc:L148.
 *
 * The `validate.` versus `entity.` asymmetry is legacy behavior and MUST NOT be normalised in
 * either direction. Resource-bundle keys are observable output, and AAP 0.4.1.11 requires the
 * error-key structure be preserved so validation failures stay comparable to legacy output —
 * normalising the prefixes would break the very comparison this port exists to enable.
 *
 * Ownership, so this file adds no duplicate: the executable constants already exist and are
 * declared once each in `src/errors/ValidationError.ts` — `ACCESS_CONTENTS_REQUIRED_RBKEY` for
 * the key above and `SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY` for its sibling, each carrying the
 * prefix and casing warnings in place. This port therefore carries the key in prose only, for
 * traceability, and declares no constant of its own. Raising the error is the service's job, not
 * the port's: the port is only reached after the guard at model/service/SkuService.cfc:L180
 * confirms the product has no errors.
 *
 * --------------------------------------------------------------------------------------------
 * TODO(parity) AC-4 — THE METHOD RETURNS TRUE UNCONDITIONALLY
 * --------------------------------------------------------------------------------------------
 * `createSkus` returns `true` at model/service/SkuService.cfc:L207 on every path that does not
 * throw. It returns `true` when the branch created SKUs, and equally when the guard at
 * model/service/SkuService.cfc:L180 short-circuited because the error at
 * model/service/SkuService.cfc:L176 had been raised and nothing was created. The boolean
 * therefore carries no success information. Recorded here as context for whoever ports the
 * service; this port declares NO member for it, because a return value the caller cannot learn
 * anything from is not part of this boundary.
 */

/*
 * ============================================================================================
 * EXECUTION-MODEL NOTES (AAP 0.7.3 standard 8 — flag, do not assume away)
 * ============================================================================================
 * THIS PORT IS ASYNCHRONOUS, AND THAT IS NOT A HOUSE STYLE — IT IS A CONSEQUENCE.
 * Resolution by identifier is a genuine database read. In the legacy system it reaches
 * `entityLoadByPK` through org/Hibachi/HibachiDAO.cfc:L6, which the CFML engine served
 * synchronously from a request-scoped Hibernate session. The Node driver has no such facility,
 * so the member returns a promise.
 *
 * Deliberate contrast, so the two are not mistakenly harmonised: `src/ports/SettingResolverPort.ts`
 * is declared SYNCHRONOUS, and it has to be — a background thread in the legacy setting
 * subsystem means no caller in this slice may depend on out-of-band completion, so its contract
 * is narrowed to a synchronous read. That constraint applies to setting resolution. It does NOT
 * apply to content resolution, which no caller in this slice reaches through a thread. The two
 * ports differ because their legacy execution models differ, and neither should be reshaped to
 * match the other.
 *
 * ABSENCE IS REPRESENTABLE BECAUSE THE LEGACY PATH GENUINELY RETURNS NOTHING ON A MISS.
 * The `| null` in the signature below is a faithful port, not defensive padding. The chain is:
 * the synthesized `getContent(id)` dispatches through
 * org/Hibachi/HibachiService.cfc:L255-L281 to the get handler, which reads the positional
 * identifier and calls org/Hibachi/HibachiService.cfc:L22, which delegates to
 * org/Hibachi/HibachiDAO.cfc:L6. There, a hit returns the entity and a miss falls through the
 * `isReturnNewOnNotFound` guard without returning anything at all. Both live call sites
 * [model/service/SkuService.cfc:L187 and :L196] pass the identifier alone, so that flag takes
 * its declared default of false and a miss really is nothing. Modelling the miss keeps the
 * hazard visible: under the strict indexed-access rule the consumer cannot attach an unresolved
 * reference to a SKU without first handling the absent case, and it must not defeat that check
 * with an assertion.
 */

/**
 * A resolved access-content record, modelled as a MINIMAL OPAQUE REFERENCE.
 *
 * This is deliberately not a content entity type. `model/entity/Content.cfc` is one of the five
 * excluded content files named in the boundary note above, so declaring its property surface
 * here would drag an out-of-scope subsystem into the deliverable and defeat the boundary this
 * file exists to draw. What the branch actually needs of a resolved content is only that it can
 * be handed to `addAccessContent` [model/entity/Sku.cfc:L704-L711], which appends it to the SKU
 * side of a many-to-many association and maintains the inverse side.
 *
 * The single member is the identifier, and it is grounded rather than guessed:
 *   model/entity/Content.cfc:L52 declares
 *     `property name="contentID" ormtype="string" length="32" fieldtype="id" generator="uuid"`
 *   model/entity/Sku.cfc:L77 declares the association
 *     `property name="accessContents" singularname="accessContent" cfc="Content"
 *      fieldtype="many-to-many" linktable="SwSkuAccessContent" inversejoincolumn="contentID"`
 * so the identifier that names a content is `contentID`, and per IR-6 its value is a
 * 32-character identifier string generated in application code — not a database sequence and
 * not a dashed form. The link table `SwSkuAccessContent` is named here only as prose evidence
 * of the relationship; this module contains no data access and no statement text whatsoever.
 *
 * TODO(boundary): the reference stays opaque until the content subsystem is converted. When it
 * is, this type is the one place that widens, and it widens by adding members rather than by
 * changing the member below — so every consumer keeps compiling.
 */
import type { ExactDecimal } from '../util/formatting';

export interface AccessContentReference {
  /**
   * The resolved content's primary-key identifier.
   *
   * Legacy shape [model/entity/Content.cfc:L52]: a 32-character string identifier. It is the
   * same value that was passed to the resolving member, echoed back so a consumer can correlate
   * a resolution with its request without holding the request order.
   */
  readonly contentID: string;
}

/**
 * The two SKU-creation shapes the content-access branch can take, named.
 *
 * This is the typed discriminant the legacy boolean flag becomes. AAP 0.8.1 permits exactly this
 * kind of idiom change — a CFML boolean flag may become a typed discriminant on the input shape —
 * while forbidding the corresponding behavior change, which would be collapsing the two shapes
 * into one path. Naming them makes that collapse impossible to perform by accident: a consumer
 * that switches over this union is held to both arms by the compiler, whereas a bare boolean can
 * be quietly ignored. It declares no additional data key.
 *
 * - `'bundled'`         ONE SKU carries ALL of the access contents.
 *                       [model/service/SkuService.cfc:L182-L189] — a single SKU is constructed
 *                       at :L182 and the loop at :L186-L188 attaches every access content to
 *                       that same SKU.
 * - `'skuPerContent'`   ONE SKU PER access content.
 *                       [model/service/SkuService.cfc:L190-L201] — the loop at :L191 constructs
 *                       a fresh SKU at :L192 on each iteration and attaches exactly one access
 *                       content to it at :L196.
 *
 * The mode is decided by the guard at model/service/SkuService.cfc:L181, which requires the flag
 * to be BOTH present and truthy for the bundled shape; every other case — flag absent, or
 * present and falsy — takes the per-content shape. That is why the flag below is optional rather
 * than required, and why absence and `false` are equivalent in effect here even though the type
 * system keeps them distinct.
 */
export type ContentAccessSkuCreationMode = 'bundled' | 'skuPerContent';

/**
 * The typed shape of the input data the content-access branch reads.
 *
 * Legacy origin: the `data` argument of `createSkus`
 * [model/service/SkuService.cfc:L58], which is an untyped CFML structure populated from request
 * scope. Replacing it with a named type is a permitted idiom change under AAP 0.8.1; the
 * behavior being preserved is WHICH keys are read and WHETHER each read is guarded.
 *
 * The shape is exactly as wide as the branch reads — three keys, no more. In particular
 * `listPrice` is absent on purpose: it is read only by the merchandise arm
 * [model/service/SkuService.cfc:L94 and :L130] and never by this branch, so admitting it here
 * would be a speculative key.
 *
 * OPTIONALITY IS DERIVED FROM THE LEGACY GUARDS, NOT CHOSEN. Under the strict exact-optional
 * rule the compiler distinguishes "key absent" from "key present and undefined", which is what
 * lets the legacy guard pattern stay visible in the type instead of being smoothed away:
 *   - `price` is read WITHOUT an existence guard, at model/service/SkuService.cfc:L183 in the
 *     bundled path and model/service/SkuService.cfc:L193 in the per-content path, so it is
 *     REQUIRED here. Reading it unguarded is the legacy contract: an absent price is a runtime
 *     failure in CFML, and typing it required turns that same mistake into a compile error.
 *   - `accessContents` is existence-guarded at model/service/SkuService.cfc:L175, so it is
 *     OPTIONAL.
 *   - `bundleContentAccess` is existence-guarded at model/service/SkuService.cfc:L181, so it is
 *     OPTIONAL.
 */
export interface ContentAccessSkuCreationData {
  /**
   * The price applied to every SKU this branch creates.
   *
   * Read unguarded at model/service/SkuService.cfc:L183 (bundled) and
   * model/service/SkuService.cfc:L193 (per content), hence required.
   *
   * TIGHTENING RECORDED (TR-1): the legacy value arrives inside an untyped structure and is
   * typed here. The tightening is evidenced, not assumed — `model/validation/Sku.json:L9`
   * declares `price` required with data type numeric and a minimum of 0 for the save context, so
   * a non-numeric price could never have survived validation. Enforcing the numeric contract at
   * the boundary is an idiom change; the validation rule itself remains owned by
   * `src/validation/rules/sku.rules.ts`, and this type neither duplicates nor relaxes it.
   *
   * ⭐ F07 — THE TYPE IS {@link ExactDecimal}, NOT `number`, AND THE DIRECTION OF FLOW IS WHY. This value
   * is OUTBOUND: this slice reads it from creation data, hands it here, and persists it to
   * `SwSku.price`, which is `ormtype="big_decimal"` [model/entity/Sku.cfc:L56]. A double could not
   * represent every value that column accepts, so binding one would round a legacy-valid price silently.
   *
   * Contrast `../ports/PricingPort`'s `salePrice`, which stays `number` and is flagged where it is read
   * in `../domain/sku/Sku.ts`: that value is INBOUND from the excluded promotion subsystem
   * (AAP §0.2.2.1), it is never bound to a column, and this slice cannot observe the representation its
   * producer uses. Tightening an inbound type this port cannot implement would assert a contract nothing
   * here can honour; tightening this outbound one removes a real loss on a real write.
   */
  readonly price: ExactDecimal;

  /**
   * The access-content identifiers to attach, in the order supplied.
   *
   * Legacy shape: a comma-delimited CFML list, consumed with `listLen` at
   * model/service/SkuService.cfc:L175 and :L186 and :L191, and with `listGetAt` at
   * model/service/SkuService.cfc:L187 and :L196. Converting the list to an array is a permitted
   * idiom change under AAP 0.8.1; ORDER IS PRESERVED because it is behavior — under the
   * per-content shape the first element becomes the product's default SKU
   * [model/service/SkuService.cfc:L197-L199] and each element's 1-based position is interpolated
   * into that SKU's code [model/service/SkuService.cfc:L194, AC-1].
   *
   * Optional because model/service/SkuService.cfc:L175 guards its existence. Absent and empty are
   * treated alike there — the same condition rejects both — and that is the case which raises the
   * key recorded under AC-3 above. Reaching this port at all therefore implies the collection was
   * present and non-empty, because the guard at model/service/SkuService.cfc:L180 stops the
   * branch before resolution is ever attempted otherwise.
   *
   * Declared readonly, and element access remains checked: under the strict indexed-access rule a
   * read yields a possibly-undefined value, so the consumer must narrow before passing an element
   * to the resolving member below rather than asserting the element away.
   */
  readonly accessContents?: readonly string[];

  /**
   * Whether one SKU should carry all of the access contents.
   *
   * Legacy guard: model/service/SkuService.cfc:L181 requires this key to be BOTH present and
   * truthy to take the bundled shape; anything else takes the per-content shape. Optional here
   * for that reason, and typed `boolean` as a permitted tightening of a CFML truthiness test.
   *
   * This flag is the branch key, not a decoration — the two shapes it selects differ in how many
   * SKUs are created, in how each SKU code is built (AC-1) and in how the default SKU is assigned
   * (AC-2). See `ContentAccessSkuCreationMode` for both shapes with their locators. Neither shape
   * may be collapsed into the other.
   */
  readonly bundleContentAccess?: boolean;
}

/**
 * AccessContentPort — resolve an access content by its identifier.
 *
 * This is the entire contract. The content-access branch reaches the out-of-scope content
 * subsystem for exactly one purpose, at exactly two call sites
 * [model/service/SkuService.cfc:L187 and model/service/SkuService.cfc:L196], and both do the same
 * thing: turn one identifier taken from the access-content collection into something that can be
 * attached to a SKU.
 *
 * IR-1 — THIS MEMBER HAS NO LEGACY DECLARATION ANYWHERE. `getContent` appears in no source file
 * as a declaration. It is fabricated at runtime by prefix dispatch in
 * org/Hibachi/HibachiService.cfc:L255-L281: a call beginning with `get` is routed to the dynamic
 * get handler, which derives the entity name from the remainder of the method name and loads by
 * primary key. TypeScript under strict mode has no equivalent facility and wants none, so TR-3
 * applies — replace framework magic with declarations — and the member is declared explicitly
 * here, compile-checked at both call sites. This also discharges rule R2 (AAP 0.4.3.2): the
 * legacy case-insensitive string lookup of a service by name becomes a typed constructor
 * dependency, injected once in `src/config/container.ts`.
 *
 * SYNTHESIS IS NOT REPRODUCED WHOLESALE. The dispatcher at
 * org/Hibachi/HibachiService.cfc:L255-L281 also fabricates creation, save, delete, count, list,
 * export, process and paginated-list members by prefix. This slice calls none of them on the
 * content collaborator, so none is declared. Declaring the unused surface would manufacture a
 * dependency the legacy system never exercises and would widen the boundary this port exists to
 * narrow. The one member below is the whole of it.
 *
 * The member name is held at `getContent` so the port stays traceable to the legacy call text.
 */
export interface AccessContentPort {
  /**
   * Resolves the access content identified by `contentID`.
   *
   * Ports `getContentService().getContent( ... )` as called at
   * model/service/SkuService.cfc:L187 (bundled) and model/service/SkuService.cfc:L196
   * (per content).
   *
   * POSITIONAL, SINGLE ARGUMENT — NOT AN OPTIONS OBJECT. The synthesized member accepts ordered
   * arguments only: org/Hibachi/HibachiService.cfc:L253 and org/Hibachi/HibachiService.cfc:L303
   * both state that named arguments are not supported, and the dynamic get handler reads its
   * identifier from the first positional slot. Both live call sites pass a bare identifier
   * obtained from `listGetAt`, and nothing else. Accepting a named-argument object here would
   * change the shape of the call the legacy system makes, so the argument stays a bare
   * identifier. The declared trailing flag of the legacy dynamic getter — which would return a
   * newly constructed entity instead of nothing when the identifier misses — is likewise NOT
   * exposed, because neither call site supplies it and it therefore always took its default.
   *
   * @param contentID A content primary-key identifier, as declared at
   *                  model/entity/Content.cfc:L52 — a 32-character identifier string (IR-6).
   *                  Under the per-content shape this is one element of
   *                  `ContentAccessSkuCreationData.accessContents`, read at
   *                  model/service/SkuService.cfc:L196; under the bundled shape it is one element
   *                  read at model/service/SkuService.cfc:L187.
   * @returns The resolved reference, or `null` when no content carries that identifier. The null
   *          arm is a faithful port of org/Hibachi/HibachiDAO.cfc:L6, where a primary-key load
   *          that finds nothing returns nothing at all once the return-new flag is left at its
   *          default — which is the case at both call sites. The legacy branch does NOT check for
   *          that outcome; it passes the result straight into `addAccessContent`
   *          [model/entity/Sku.cfc:L704-L711]. Making the miss part of the type is how the
   *          consumer is forced to decide what an unresolvable identifier means, rather than
   *          discovering it during a SKU write.
   */
  getContent(contentID: string): Promise<AccessContentReference | null>;

  /**
   * Resolves MANY access-content rows in one boundary call, keyed by identifier.
   *
   * ⭐ WHY THIS IS THE SAME QUESTION, NOT A NEW ONE. Both content-access shapes cross this boundary once
   * PER IDENTIFIER: the bundled path loops the whole `contentAccess` list attaching every row to a
   * single SKU, and the unbundled path creates one SKU per row. A product published against `k` content
   * rows therefore crosses the boundary `k` times to ask `k` variations of one question, and this member
   * asks it once. {@link AccessContentPort.getContent} keeps its single-identifier contract.
   *
   * ⚠️ IT MUST NOT REJECT FOR A MISSING IDENTIFIER. An identifier matching no row is ABSENT from the
   * returned map, mirroring the `null` arm above — and for the same reason that arm exists: the legacy
   * branch does not check the outcome, so the CONSUMER must decide what an unresolvable identifier
   * means and at what point in its own walk. A batch that rejected would move that decision earlier and
   * change which element is reported.
   *
   * ⚠️ AND IT MUST NOT CACHE (M7). The map answers one call and is owned by the caller.
   *
   * @param contentIDs - The identifiers to resolve. Duplicates are permitted and resolve once.
   * @returns A map holding an entry ONLY for identifiers that matched a row.
   */
  getContentsByIDs(contentIDs: readonly string[]): Promise<Map<string, AccessContentReference>>;
}
