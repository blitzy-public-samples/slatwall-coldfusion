/**
 * SubscriptionTermPort - the declared boundary between the extracted Catalog slice and the
 * UNCONVERTED subscription subsystem.
 *
 * Legacy origin: the `subscription` branch of `model/service/SkuService.cfc:L139-L170`, reached from
 * the three-way discriminator on `product.getProductType().getBaseProductType()` at
 * `model/service/SkuService.cfc:L61` (merchandise), `:L139` (subscription) and `:L173`
 * (contentAccess), using the three seeded discriminators of IR-7.
 *
 * AAP 0.4.1.6 row 8 gives this file one job - "Term resolution for the non-merchandise branch". AAP
 * 0.4.1.8 fixes the division of labour: the merchandise combination engine is ported in full into
 * `src/services/SkuService.ts`, while the subscription and contentAccess branches sit behind ports.
 * This is the first of those two. The second, `AccessContentPort`, serves the separate
 * `contentAccess` branch at `model/service/SkuService.cfc:L173`. They are deliberately NOT merged
 * into one "non-merchandise" port: the legacy source has two independent branches reaching two
 * independent subsystems, and collapsing them would be a structural invention (S9).
 *
 * A type-only module - types only, no class, no constructor, no runtime statement and zero imports -
 * so it emits nothing into the bundle and every declaration is satisfiable by a plain object
 * literal, which is what makes it substitutable in a test without a framework.
 *
 * TODO(boundary): the collaborator behind this interface is `model/service/SubscriptionService.cfc`,
 * excluded by AAP 0.2.2.1 along with the rest of the `Subscription*.cfc` family. The two that matter
 * most here are `model/entity/SubscriptionTerm.cfc` and `model/entity/SubscriptionBenefit.cfc`,
 * whose types are therefore NOT declared in this subtree; see the opaque references below.
 * `model/process/Product_AddSubscriptionTerm.cfc` and its validation document are separately
 * excluded by AAP 0.2.2.4 and are not modelled here either. This port is what keeps all of them out
 * of the deliverable, and it is the literal mechanism behind AAP 0.8.3.8 strangler-fig independence:
 * the subscription subsystem stays unconverted and `src/services/SkuService.ts` still type-checks,
 * bundles and ships.
 *
 * WHAT THIS PORT DOES NOT DO. It resolves references and computes nothing. There is no renewal
 * schedule, billing cycle, proration rule, expiry or grace period, trial length, subscription status
 * or currency handling - none of which the legacy branch performs, so all of which would be
 * invention (S9). Neighbouring concerns have their own homes: SKU persistence belongs to
 * `src/ports/repositories/SkuRepository.ts`, price reads to `PricingPort`, the merchandise odometer
 * enumeration to `src/services/SkuService.ts`, and the fallthrough throw at
 * `model/service/SkuService.cfc:L204` to `src/errors/DomainError.ts`.
 *
 * MINIMAL CHANGE, BOTH HALVES (AAP 0.8.1). Minimal in functional scope, explicitly NOT minimal in
 * idiom, and the dividing line is behaviour. So the untyped legacy struct argument becomes a named
 * typed shape, comma-delimited CFML lists become arrays, and two runtime-synthesised methods become
 * explicit declarations. What is NOT permitted is changing which key is optional (see SB-1),
 * accepting a named-argument object where the legacy takes a positional identifier, or repairing the
 * misspelled resource key (see SB-4).
 */

/**
 * A resolved subscription term, modelled as a MINIMAL OPAQUE REFERENCE.
 *
 * This is deliberately not an entity type. `model/entity/SubscriptionTerm.cfc` is one of the 11
 * excluded `Subscription*` components, so declaring its property surface here would import the
 * excluded subsystem into the deliverable by the back door - precisely what AAP 0.8.2 Guideline 3
 * forbids and what TR-5 exists to prevent. TR-5 requires the gap be FLAGGED, not filled.
 *
 * TODO(boundary): the full term entity lives at `model/entity/SubscriptionTerm.cfc` and stays
 * unconverted. Should a later iteration bring the subscription subsystem into scope, this
 * reference is the single seam to widen, and widening it is additive.
 *
 * WHY THE IDENTIFIER IS THE RIGHT MINIMUM, and why it is not invented. The only thing the
 * in-scope side does with a resolved term is hand it to `Sku.setSubscriptionTerm()` at
 * `model/entity/Sku.cfc:L622`, and the only thing the in-scope `SwSku` row records is the foreign
 * key declared at `model/entity/Sku.cfc:L66`: `property name="subscriptionTerm"
 * cfc="SubscriptionTerm" fieldtype="many-to-one" fkcolumn="subscriptionTermID"`. The field name
 * below is that column name, read from an in-scope entity - not a guess about the excluded one.
 * Per IR-6 the value is a 32-character identifier string with no dashes, generated in
 * application code rather than by the database.
 *
 * The distinct field name also does real work under structural typing: it makes this reference
 * and {@link SubscriptionBenefitReference} mutually unassignable, so a benefit cannot be passed
 * where a term belongs. That separation costs nothing at runtime and needs no branding cast,
 * which matters because S1 forbids the assertion syntax a branded type would otherwise invite.
 */
export interface SubscriptionTermReference {
  readonly subscriptionTermID: string;
}

/**
 * A resolved subscription benefit, modelled as a MINIMAL OPAQUE REFERENCE on the same terms as
 * {@link SubscriptionTermReference}.
 *
 * TODO(boundary): the full benefit entity lives at `model/entity/SubscriptionBenefit.cfc`, also
 * among the 11 excluded `Subscription*` components, and also stays unconverted.
 *
 * The field name is again read from the in-scope side of the relationship rather than from the
 * excluded entity. `model/entity/Sku.cfc:L78` declares the benefits collection with
 * `inversejoincolumn="subscriptionBenefitID"` over link table `SwSkuSubsBenefit`, and
 * `model/entity/Sku.cfc:L79` declares the renewal collection with the same
 * `inversejoincolumn="subscriptionBenefitID"` over link table `SwSkuRenewalSubsBenefit`.
 *
 * ONE REFERENCE TYPE, NOT TWO, AND THAT IS DELIBERATE. The branch feeds benefits into two
 * different collections - `addSubscriptionBenefit` at `model/service/SkuService.cfc:L161` and
 * `addRenewalSubscriptionBenefit` at `:L164` - but both resolve through the same collaborator
 * member and both land on the same identifier column, per the two `Sku.cfc` declarations above.
 * Splitting this into separate "benefit" and "renewal benefit" types would assert a distinction
 * the source does not make (S9). The distinction lives in which collection receives the value,
 * which is the caller's business, not this port's.
 */
export interface SubscriptionBenefitReference {
  readonly subscriptionBenefitID: string;
}

/**
 * The typed shape of the input data the subscription branch reads.
 *
 * This replaces the untyped struct that `createSkus` declares as its second parameter at
 * `model/service/SkuService.cfc:L58`. Narrowing it to a named shape is an idiom change AAP 0.8.1
 * expressly permits; what follows below is the part that is NOT an idiom change, because it
 * encodes observable behaviour.
 *
 * EXACTLY THREE KEYS, AND THE ORDER IS THE LEGACY READ ORDER. The branch reads
 * `subscriptionBenefits` first (`model/service/SkuService.cfc:L142`), `subscriptionTerms` second
 * (`:L147`) and `renewalSubscriptionBenefits` third (`:L163`), and the declarations below follow
 * that sequence so the guard asymmetry can be checked line by line against the source. No fourth
 * key is added; keeping the shape exactly as wide as the branch actually reads is what stops this
 * type from drifting into a general-purpose product-creation payload (S9).
 *
 * WHY `price` IS ABSENT, stated rather than left as a silent omission. The branch does also read
 * `data.price`, at `model/service/SkuService.cfc:L156` and `:L157`. It is nonetheless not a key
 * here, because it is not a crossing of the subscription boundary: those two statements assign
 * the SKU's own price and renewal price, which `src/services/SkuService.ts` performs directly.
 * This port covers only what the branch needs from OUTSIDE the slice. Price reads that genuinely
 * do leave the slice are the business of `PricingPort`, a separate file.
 *
 * TODO(parity): SB-3. Those two statements are fed from the SAME source value -
 * `thisSku.setPrice(arguments.data.price)` at `model/service/SkuService.cfc:L156` and
 * `thisSku.setRenewalPrice(arguments.data.price)` at `:L157`. A subscription SKU's renewal price
 * is therefore always identical to its initial price, with no way for a caller to differentiate
 * them through this entry point. It has the shape of a copy-paste slip and may well be one, but
 * it is observable behaviour either way, so it is recorded and left alone. Note the contrast with
 * `model/service/ProductService.cfc:L178-L179`, which does read two distinct values
 * (`getPrice()` and `getRenewalPrice()`) - so the two entry points disagree with each other.
 * Preserved, not reconciled (AAP 0.8.2, Guidelines 2 and 4).
 *
 * CFML lists become arrays. All three keys arrive in the legacy branch as comma-delimited list
 * strings, which is why the source measures them with `listLen()` at
 * `model/service/SkuService.cfc:L153`, `:L160` and `:L163`, and indexes them with `listGetAt()` at
 * `:L158`, `:L161` and `:L164`. Arrays of identifier
 * strings are the idiomatic TypeScript equivalent (AAP 0.8.1). Under `noUncheckedIndexedAccess`
 * an indexed read of one of these arrays yields `string | undefined`, so a caller iterating them
 * has to confront a gap rather than assume an element is present - which is the intended effect,
 * and it must not be defeated with a non-null assertion (S1).
 */
export interface SubscriptionSkuCreationData {
  /**
   * Identifiers of the benefits to attach to every SKU the branch creates.
   *
   * GUARDED, therefore OPTIONAL. `model/service/SkuService.cfc:L142` tests this key with
   * `structKeyExists(arguments.data, "subscriptionBenefits")` before measuring it, so an absent
   * key is a legal input that produces a validation error rather than a runtime failure.
   *
   * Under `exactOptionalPropertyTypes` the optional marker means exactly what `structKeyExists`
   * means: the property may be ABSENT, but if present it may not be explicitly `undefined`.
   * That correspondence is the reason the flag is load-bearing for this type rather than
   * incidental (AAP 0.7.3, S1).
   *
   * TODO(parity): SB-4. When this key is missing or empty, `model/service/SkuService.cfc:L143`
   * reports the error under resource key `entity.product.subscriptionbenifitsrequired`. The
   * final segment is MISSPELLED in the legacy source - an "i" stands where the second "e" of
   * "benefits" belongs - and the misspelling is reproduced byte-exactly because the key is
   * observable output: correcting it would make validation results incomparable to the legacy
   * system. The typo is isolated to this one key, which is worth stating because it is what
   * makes an accidental repair so easy: the sibling key emitted two lines later at
   * `model/service/SkuService.cfc:L148`, `entity.product.subscriptiontermsrequired`, is spelled
   * correctly. Do not harmonise them in either direction. The runtime constant carrying this
   * literal is owned by `src/errors/ValidationError.ts`; it is named here for traceability only,
   * so that one observable error key keeps exactly one source of truth.
   */
  readonly subscriptionBenefits?: readonly string[];

  /**
   * Identifiers of the terms to create one SKU for - this list drives the branch's outer loop.
   *
   * GUARDED, therefore OPTIONAL, on the same basis as `subscriptionBenefits`:
   * `model/service/SkuService.cfc:L147` tests it with `structKeyExists` before measuring it, and
   * reports `entity.product.subscriptiontermsrequired` at `:L148` when it is missing or empty.
   *
   * One SKU is created per element by the loop at `model/service/SkuService.cfc:L153`, and the
   * FIRST element is privileged: `:L166-L167` makes that SKU the product's default. Element
   * order is therefore observable, so implementations must preserve the caller's ordering.
   *
   * TODO(parity): SB-2, a read-back-ordering hazard of exactly the class AAP 0.6.2 identifies as
   * the single most dangerous thing in this slice. Inside that same loop,
   * `model/service/SkuService.cfc:L159` sets each SKU's code from
   * `product.getProductCode() & "-#arrayLen(product.getSkus()) + 1#"` - a count of the SKUs the
   * product already holds, re-evaluated on EVERY iteration. The generated codes are consequently
   * a function of enumeration order and of how much of the batch is already visible when each
   * one is computed. Under Hibernate that count reflects ORM session state; under the target's
   * prepared-statement driver there is no ORM session and no automatic flush, so a naive port
   * yields different SKU codes with no error and no compile failure. Resolving it is NOT this
   * file's job and NOT this file's right:
   * the owner is `src/adapters/mysql/UnitOfWork.ts`, which has to make each insert visible to the
   * next iteration's count within one transaction. Flagged here, decided there. No
   * execution-model mismatch number is claimed for it - the M-numbers of AAP 0.6.6 are already
   * allocated, and inventing another would be exactly the fabrication S9 forbids.
   */
  readonly subscriptionTerms?: readonly string[];

  /**
   * Identifiers of the benefits to attach as RENEWAL benefits, consumed at
   * `model/service/SkuService.cfc:L163-L164`.
   *
   * TODO(parity): SB-1, and this required marker is the whole point of the annotation. This key
   * is read at `model/service/SkuService.cfc:L163` with NO `structKeyExists` guard anywhere in
   * the component, while its two siblings above ARE guarded, at `:L142` and `:L147`
   * respectively. The branch therefore FAILS when this key is absent - and it fails at `:L163`,
   * after the guarded checks have already passed and after SKUs have begun to be built by the
   * loop opened at `:L153`. So the asymmetry is not cosmetic: it decides whether a caller who
   * omits one key gets a validation error or a runtime failure part-way through a batch.
   *
   * It is declared REQUIRED for that reason and no other. Marking it optional to match its
   * siblings would smooth away a real defect, which AAP 0.7.3 S7 forbids; adding the missing
   * guard would change observable behaviour, which AAP 0.8.2 Guidelines 2 and 4 forbid. S7's
   * only declared exception anywhere in the plan is D18, and it belongs to
   * `src/adapters/mysql/MySqlProductRepository.ts` - this file claims no exception.
   *
   * The happy consequence is that under `exactOptionalPropertyTypes` the compiler now documents
   * the defect: required-versus-optional in this one type is a faithful, machine-checked
   * transcription of guarded-versus-unguarded in the legacy source. The defect is preserved AND
   * surfaced, rather than preserved and hidden.
   */
  readonly renewalSubscriptionBenefits: readonly string[];
}

/**
 * The port itself: the two collaborator members the subscription branch reaches outside the slice.
 *
 * THREE CONCEPTS, TWO MEMBERS. A port built from the AAP's summary tables alone would declare term
 * resolution only, compile perfectly, and then fail at the branch's second collaborator call:
 * `getSubscriptionBenefit` is invoked TWICE and appears in no summary table. The call-site
 * arithmetic reconciles with AAP 0.6.3.1 and 0.6.3.2, which classify `subscriptionService` as
 * "genuine but out of scope" with four call sites - `model/service/SkuService.cfc:L158`, `:L161`,
 * `:L164` and `model/service/ProductService.cfc:L175`. All four are covered by the two members
 * declared here, and nothing beyond them is declared.
 *
 * IR-1 AND TR-3 - THESE MEMBERS HAVE NO SOURCE DECLARATION AT ALL. Neither `getSubscriptionTerm`
 * nor `getSubscriptionBenefit` is written anywhere in the legacy tree; both are fabricated at
 * runtime by the prefix dispatcher at `org/Hibachi/HibachiService.cfc:L255`, whose `get`-prefix arm
 * at `:L258-L263` routes them to the implicit entity getter. TR-3 requires framework magic be
 * replaced with declarations, and this is where that happens for these two. Synthesis is NOT
 * reproduced wholesale: AAP 0.4.2.5 declares only the synthesised members the slice actually calls,
 * so the dispatcher's other prefixes are absent here by design.
 *
 * POSITIONAL ARGUMENTS ONLY, AND THIS IS A HARD CONSTRAINT. The dispatcher's own docblock states it
 * at `org/Hibachi/HibachiService.cfc:L253`: "NOTE: Ordered arguments only--named arguments not
 * supported." All four legacy call sites obey it, passing a single bare identifier, so each member
 * below takes one positional string parameter. Accepting an options object instead would look like a
 * harmless modernisation but would land on the wrong side of the AAP 0.8.1 line.
 *
 * Both members resolve an entity by identifier, which is a real database read, so both return a
 * promise. `SettingResolverPort` is SYNCHRONOUS instead because mismatch M8 forces it to be - a
 * background thread in the settings subsystem means no caller in the slice may depend on
 * asynchronous completion there. This port is not subject to M8, and the difference is load-bearing:
 * do not harmonise them in either direction.
 *
 * A MISS IS REPRESENTABLE: both members resolve `null` when no row matches, following the convention
 * AAP 0.4.2.5 sets for every synthesised get-by-identifier member in the slice. It forces the
 * not-found path to be handled at the call site and must not be defeated with a non-null assertion
 * (S1).
 *
 * NO INHERITANCE, NO CONTAINER, NO LOOKUP (S3). The legacy component obtained this collaborator from
 * the DI/1 property at `model/service/SkuService.cfc:L55` and its synthesised accessor, resolved by
 * name at runtime. R1 and R2 (AAP 0.4.3.1, AAP 0.4.3.2) replace that with a constructor parameter
 * and typed references, so an implementation is injected into `src/services/SkuService.ts` by
 * `src/config/container.ts` and nothing here reaches out to find it.
 *
 * TWO CONTEXT NOTES THAT SHAPE HOW THIS PORT IS USED, WITH NO MEMBER ADDED FOR EITHER. First,
 * `createSkus` returns `true` unconditionally on every non-throwing path at
 * `model/service/SkuService.cfc:L207` - including when the guarded checks at `:L142` and `:L147`
 * added validation errors and the branch consequently created no SKU at all, because the creation
 * loop is gated on `hasErrors()` at `:L152`. Callers must inspect the product's errors rather than
 * trust the return value. Second, defect D6 sits at the fourth call site:
 * `processProduct_addSubscriptionTerm` is declared at `model/service/ProductService.cfc:L173` with
 * only a product and a process object, yet `:L181` reads `arguments.data.listPrice`, so the
 * reference is undefined at runtime whenever the guard at `:L180` admits it. That member is
 * boundary-stubbed in `src/services/ProductService.ts`; D6 is carried, not repaired.
 */
export interface SubscriptionTermPort {
  /**
   * Resolves a subscription term by identifier. Resolves `null` when no term matches.
   *
   * Legacy call sites, both passing a single positional identifier:
   * - `model/service/SkuService.cfc:L158` - the resolved term is handed to
   *   `thisSku.setSubscriptionTerm(...)`, whose in-scope implementation is at
   *   `model/entity/Sku.cfc:L622`. The identifier is the current element of the
   *   `subscriptionTerms` list.
   * - `model/service/ProductService.cfc:L175` - the identifier comes from the process object's
   *   `getSubscriptionTermID()`. That member is boundary-stubbed, but the call shape is
   *   identical, which is why one declaration serves both.
   */
  getSubscriptionTerm(subscriptionTermID: string): Promise<SubscriptionTermReference | null>;

  /**
   * Resolves a subscription benefit by identifier. Resolves `null` when no benefit matches.
   *
   * THE MEMBER THE SUMMARY TABLES OMIT. It is called TWICE in the branch, once for each of the
   * two benefit collections, and both call sites pass a single positional identifier:
   * - `model/service/SkuService.cfc:L161` - inside the loop over `subscriptionBenefits` opened
   *   at `:L160`; the result is handed to `thisSku.addSubscriptionBenefit(...)`, whose in-scope
   *   implementation is at `model/entity/Sku.cfc:L724`.
   * - `model/service/SkuService.cfc:L164` - inside the loop over `renewalSubscriptionBenefits`
   *   opened at `:L163`; the result is handed to `thisSku.addRenewalSubscriptionBenefit(...)`.
   *
   * One member covers both because the legacy source calls one collaborator member from both
   * sites, and both target the same identifier column per `model/entity/Sku.cfc:L78` and `:L79`.
   * Which collection receives the resolved value is the caller's decision, not this port's.
   */
  getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitReference | null>;
}
