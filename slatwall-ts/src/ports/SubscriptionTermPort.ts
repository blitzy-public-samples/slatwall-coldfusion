/**
 * SubscriptionTermPort — the boundary between the extracted catalog slice and the unconverted
 * subscription subsystem (AAP §0.2.2.7, §0.4.1.6: "term resolution for the non-merchandise branch").
 *
 * Legacy origin: the `subscription` branch of `createSkus`
 * [model/service/SkuService.cfc:L139-L170], the second arm of the `getBaseProductType()`
 * discriminator whose arms are :L61 merchandise, :L139 subscription and :L173 contentAccess.
 * The merchandise arm is ported in full into `src/services/SkuService.ts` (AAP §0.4.1.8); the other
 * two sit behind this port and {@link AccessContentPort}. They are not merged, because the legacy
 * source has two independent branches reaching two independent subsystems.
 * Type-only module: it emits nothing, and every declaration is satisfiable by a plain object literal,
 * which is what makes it substitutable in a test without a mocking framework.
 *
 * TODO(boundary): the collaborator is `model/service/SubscriptionService.cfc`, excluded with the rest
 * of the `subscription*.cfc` family (AAP §0.2.2.1), so `subscriptionTerm` and `subscriptionBenefit`
 * are modelled as opaque references below rather than declared. This port resolves references and
 * computes nothing: no renewal schedule, billing cycle, proration, expiry or status, none of which
 * the legacy branch performs.
 */

/**
 * A resolved subscription term, modelled as a minimal opaque reference rather than an entity type:
 * `model/entity/SubscriptionTerm.cfc` is one of the excluded `subscription*` components, so declaring
 * its property surface here would import the excluded subsystem by the back door (TR-5).
 * The identifier is the right minimum because the only thing the in-scope side does with a resolved
 * term is hand it to `Sku.setSubscriptionTerm()` [model/entity/Sku.cfc:L622], and the only thing the
 * `SwSku` row records is the foreign key `fkcolumn="subscriptionTermID"` [model/entity/Sku.cfc:L66].
 * The value is a 32-character identifier string (IR-6). The distinct field name also makes this type
 * and {@link SubscriptionBenefitReference} mutually unassignable under structural typing.
 *
 * TODO(boundary): the term entity stays unconverted; this reference is the one seam to widen.
 */
export interface SubscriptionTermReference {
  readonly subscriptionTermID: string;
}

/**
 * A resolved subscription benefit, on the same terms as {@link SubscriptionTermReference}. The field
 * name is again read from the in-scope side: `model/entity/Sku.cfc:L78` declares the benefits
 * collection and `:L79` the renewal collection, both with
 * `inversejoincolumn="subscriptionBenefitID"` over `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit`.
 * One reference type, not two: the branch feeds benefits into two collections
 * [model/service/SkuService.cfc:L161, :L164] but both resolve through the same collaborator member and
 * land on the same identifier column. Which collection receives the value is the caller's business.
 *
 * TODO(boundary): `model/entity/SubscriptionBenefit.cfc` stays unconverted.
 */
export interface SubscriptionBenefitReference {
  readonly subscriptionBenefitID: string;
}

/**
 * The typed shape of the `data` argument the subscription branch reads
 * [model/service/SkuService.cfc:L58].
 * Exactly three keys, declared in the legacy read order — `subscriptionBenefits` [:L142],
 * `subscriptionTerms` [:L147], `renewalSubscriptionBenefits` [:L163] — so the guard asymmetry below
 * can be checked line by line against the source. `price` is absent deliberately: the branch does
 * read `data.price` at :L156 and :L157, but that is the SKU's own price, applied directly by
 * `src/services/SkuService.ts`, not a crossing of this boundary.
 * All three keys arrive as comma-delimited lists, measured with `listLen()` [:L153, :L160, :L163] and
 * indexed with `listGetAt()` [:L158, :L161, :L164]; arrays are the idiomatic equivalent (AAP §0.8.1),
 * and under `noUncheckedIndexedAccess` an indexed read yields `string | undefined`.
 *
 * TODO(parity) `model/service/SkuService.cfc:L156-L157` — both the SKU price and the renewal price
 * are set from the same `data.price`, so a subscription SKU's renewal price always equals its initial
 * price through this entry point. `model/service/ProductService.cfc:L178-L179` reads two distinct
 * values instead, so the two entry points disagree. Preserved, not reconciled.
 */
export interface SubscriptionSkuCreationData {
  /**
   * Identifiers of the benefits to attach to every SKU the branch creates. Guarded, therefore
   * optional: `model/service/SkuService.cfc:L142` tests the key with `structKeyExists` before
   * measuring it, so an absent key is a legal input that yields a validation error rather than a
   * runtime failure — and under `exactOptionalPropertyTypes` the optional marker means exactly what
   * `structKeyExists` means.
   *
   * TODO(parity) `model/service/SkuService.cfc:L143` — the error is reported under
   * `entity.product.subscriptionbenifitsrequired`, misspelled in the legacy source, and reproduced
   * byte-exactly because the key is observable output. Its sibling five lines later,
   * `entity.product.subscriptiontermsrequired` [:L148], is spelled correctly; do not harmonise them.
   * The runtime constant carrying the literal is owned by `src/errors/ValidationError.ts`.
   */
  readonly subscriptionBenefits?: readonly string[];

  /**
   * Identifiers of the terms to create one SKU for — this list drives the branch's outer loop.
   * Guarded, therefore optional: `model/service/SkuService.cfc:L147` tests it with `structKeyExists`
   * and reports `entity.product.subscriptiontermsrequired` at :L148 when it is missing or empty.
   * One SKU is created per element [:L153] and the first element's SKU becomes the product's default
   * [:L166-L167], so element order is observable and implementations preserve the caller's ordering.
   *
   * TODO(parity) `model/service/SkuService.cfc:L159` — each SKU's code is built from
   * `product.getProductCode() & "-#arrayLen(product.getSkus()) + 1#"`, a count re-evaluated on every
   * iteration, so the generated codes depend on how much of the batch is already visible. That is the
   * read-back hazard of M6: under Hibernate the count reflects ORM session state, and with a
   * prepared-statement driver there is no session and no automatic flush. Flagged here, resolved in
   * `src/adapters/mysql/UnitOfWork.ts`, which makes each insert visible to the next iteration inside
   * one transaction.
   */
  readonly subscriptionTerms?: readonly string[];

  /**
   * Identifiers of the benefits to attach as renewal benefits, consumed at
   * `model/service/SkuService.cfc:L163-L164`.
   *
   * TODO(parity) `model/service/SkuService.cfc:L163` — this key is read with no `structKeyExists`
   * guard while both siblings are guarded [:L142, :L147], so an omitted key fails at :L163, after the
   * guarded checks have passed and after the loop at :L153 has begun building SKUs. It is declared
   * required to transcribe that asymmetry: marking it optional would smooth the defect away and
   * adding the missing guard would change observable behaviour. Under
   * `exactOptionalPropertyTypes` the compiler now documents the defect instead of hiding it.
   */
  readonly renewalSubscriptionBenefits: readonly string[];
}

/**
 * The two collaborator members the subscription branch reaches outside the slice. All four legacy
 * call sites — `model/service/SkuService.cfc:L158`, `:L161`, `:L164` and
 * `model/service/ProductService.cfc:L175` — are covered by these two members, and nothing beyond
 * them is declared. `getSubscriptionBenefit` appears in no AAP summary table yet is called twice, so
 * a port built from the summaries alone would compile and then fail at the second collaborator call.
 * IR-1 / TR-3: neither member is declared anywhere in the legacy tree; both are fabricated by the
 * prefix dispatcher [org/Hibachi/HibachiService.cfc:L255, get-arm at :L258-L263]. Only the
 * synthesized members this slice calls are declared (AAP §0.4.2.5).
 * Positional arguments only — the dispatcher supports no named arguments
 * [org/Hibachi/HibachiService.cfc:L253] and all four call sites pass one bare identifier. Both
 * members are asynchronous because each is a real database read, and both resolve `null` on a miss so
 * the not-found path must be handled at the call site.
 * Two context notes, neither of which adds a member. `createSkus` returns `true` on every
 * non-throwing path [:L207], including when the guards at :L142 and :L147 added validation errors and
 * the creation loop was skipped by the `hasErrors()` gate at :L152, so callers inspect the product's
 * errors rather than the return value. And D6 sits at the fourth call site:
 * `processProduct_addSubscriptionTerm` is declared with only a product and a process object
 * [model/service/ProductService.cfc:L173] yet reads `arguments.data.listPrice` at :L181, so that
 * reference is undefined at runtime; the member is boundary-stubbed and D6 is carried, not repaired.
 */
export interface SubscriptionTermPort {
  /**
   * Resolves a subscription term by identifier, or `null` when no term matches. Both call sites pass a
   * single positional identifier: `model/service/SkuService.cfc:L158`, where the term is handed to
   * `thisSku.setSubscriptionTerm(…)` [model/entity/Sku.cfc:L622], and
   * `model/service/ProductService.cfc:L175`, where the identifier comes from the process object.
   */
  getSubscriptionTerm(subscriptionTermID: string): Promise<SubscriptionTermReference | null>;

  /**
   * Resolves a subscription benefit by identifier, or `null` when no benefit matches. Called twice in
   * the branch, once per benefit collection, each with a single positional identifier:
   * `model/service/SkuService.cfc:L161` inside the loop opened at :L160, feeding
   * `addSubscriptionBenefit` [model/entity/Sku.cfc:L724], and `:L164` inside the loop opened at :L163,
   * feeding `addRenewalSubscriptionBenefit`. One member covers both because the legacy source calls one
   * collaborator member from both sites and both target the same identifier column
   * [model/entity/Sku.cfc:L78, :L79].
   */
  getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitReference | null>;

  /**
   * Resolves many subscription terms in one boundary call, keyed by identifier. The legacy loop
   * [model/service/SkuService.cfc:L157-L158] calls the single-identifier member once per element, so a
   * product created with `k` terms otherwise crosses this boundary `k` times;
   * {@link SubscriptionTermPort.getSubscriptionTerm} keeps its contract for
   * `model/service/ProductService.cfc:L175`, which really does resolve one identifier.
   * An unmatched identifier is absent from the map rather than an error, and that is a correctness
   * requirement: in the legacy loop the term is resolved after that element's price is read, so a batch
   * that threw would surface the wrong error, from the wrong element, before the loop had begun. The
   * map answers one call and is not cached (M7).
   *
   * @param subscriptionTermIDs The identifiers to resolve; duplicates are permitted and resolve once.
   * @returns a map holding an entry only for identifiers that matched a row.
   */
  getSubscriptionTermsByIDs(
    subscriptionTermIDs: readonly string[],
  ): Promise<Map<string, SubscriptionTermReference>>;

  /**
   * Resolves many subscription benefits in one boundary call, keyed by identifier — the batch
   * counterpart of {@link SubscriptionTermPort.getSubscriptionBenefit}, serving both collections for
   * the same reason. The caller resolves the two lists separately even so, because
   * `model/entity/Sku.cfc:L78` and `:L79` are different relationships and merging the reads would blur
   * which collection asked. Absence, non-rejection and non-caching are governed as for
   * {@link SubscriptionTermPort.getSubscriptionTermsByIDs}.
   *
   * @param subscriptionBenefitIDs The identifiers to resolve; duplicates are permitted.
   * @returns a map holding an entry only for identifiers that matched a row.
   */
  getSubscriptionBenefitsByIDs(
    subscriptionBenefitIDs: readonly string[],
  ): Promise<Map<string, SubscriptionBenefitReference>>;
}
