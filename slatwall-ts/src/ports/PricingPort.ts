/**
 * PricingPort — the extracted Catalog slice's single window onto the excluded pricing subsystem.
 *
 * Type-only: it declares an interface and two supporting types, contains no executable statement
 * and imports nothing, so it emits no runtime code. It exists for one reason — so that RETAINED
 * catalog members can read EXCLUDED pricing members without the promotion, price-group and currency
 * subsystems being dragged into the port (TR-5: cross the boundary only through a declared port,
 * and never quietly drop the member from the interface).
 *
 * IR-3 (calculated-property containment) is why it is so small: the pricing, promotion, inventory
 * and currency-derived members among the non-persistent properties at
 * model/entity/Product.cfc:L102-L123 and model/entity/Sku.cfc:L99-L121 reach exclusively into
 * excluded services, so a reader following those getters would pull half the platform in. This port
 * exposes ONE retrieval.
 *
 * THE ONE BOUNDARY CALL, TRACED END TO END (reference only):
 *   1. model/entity/Product.cfc:L517-L522 — `getSalePriceDetailsForSkus()` memoizes into
 *      `variables.salePriceDetailsForSkus` and, on the miss path at
 *      model/entity/Product.cfc:L519, makes the only out-of-scope pricing call in the slice:
 *      `getService("promotionService").getSalePriceDetailsForProductSkus(productID=...)`.
 *   2. model/service/PromotionService.cfc:L1022 — the collaborator. Three facts from its body shape
 *      this file: model/service/PromotionService.cfc:L1023 builds the result with
 *      `queryToStructOfStructures(..., "skuID")`, so the map is KEYED BY skuID; the same line runs a
 *      database query, so the member is asynchronous; and
 *      model/service/PromotionService.cfc:L1024-L1028 applies a rounding rule, so ROUNDING HAPPENS
 *      ON THE FAR SIDE and this port performs no arithmetic and names no rounding mode, precision
 *      or decimal scale.
 *   3. model/entity/Product.cfc:L182-L187 — `getSkuSalePriceDetails(skuID)` slices one SKU out of
 *      that map, guarding at model/entity/Product.cfc:L183 and returning an EMPTY STRUCT on a miss
 *      at model/entity/Product.cfc:L186, which makes every downstream key guard false.
 *   4. model/entity/Sku.cfc:L539-L544 — `getSalePriceDetails()` reaches its own details indirectly
 *      through `getProduct().getSkuSalePriceDetails(getSkuID())`. The SKU never calls the promotion
 *      service itself, which is why this port is shaped around the PRODUCT identifier: a per-SKU
 *      member would change the number of boundary crossings and is deliberately absent.
 *
 * Hops 1, 3 and 4 are in-scope domain behaviour belonging to src/domain/product/Product.ts and
 * src/domain/sku/Sku.ts. Only hop 2 crosses the boundary, so only hop 2 is declared here.
 *
 * The legacy result is cached twice, on the product at model/entity/Product.cfc:L518 and again on
 * the SKU at model/entity/Sku.cfc:L540, both for the lifetime of a request-scoped ORM entity.
 * Mismatch M7 records that only module-scope state survives between Lambda invocations, so
 * memoization of this port's result must be REQUEST-SCOPED and never promoted to module scope, or a
 * warm container would serve one caller's sale prices to the next. M7 is referenced, not owned,
 * here; this port declares no cache, no cache key and no time-to-live.
 *
 * The member returns a `Promise` because hop 2 issues a query. `SettingResolverPort` is by contrast
 * SYNCHRONOUS because mismatch M8 records an out-of-band thread on the setting side and the
 * synchronous signature stops a caller depending on background completion. This port is not subject
 * to M8; the two shapes are intentionally different and must not be harmonised.
 *
 * THE CANONICAL CONSUMER is the Google feed view:
 *   - integrationServices/google/views/feed/product.cfm:L28 gates the pair on
 *     `local.sku.getPrice() gt local.sku.getSalePrice()` — a STRICT greater-than.
 *   - integrationServices/google/views/feed/product.cfm:L29 emits `g:sale_price`.
 *   - integrationServices/google/views/feed/product.cfm:L30 emits `g:sale_price_effective_date`,
 *     passing `getSalePriceExpirationDateTime()` through two format calls.
 * The one other reader, model/entity/Sku.cfc:L488, sits inside `getLivePrice()`, itself on the
 * AAP §0.2.2.6 exclusion list, so `livePrice` gets no member here.
 *
 * As a port this module imports nothing — not a domain type, not a package, not a decimal, money or
 * date library — reads no environment variable, and names no statement text, credential, host or
 * endpoint (AAP §0.7.3 S2, S4, S5).
 */

/**
 * One SKU's sale-price details, as returned by the boundary call for a single SKU identifier.
 *
 * EXACTLY THREE KEYS, EACH INDEPENDENTLY OPTIONAL — read off the three guarded getters at
 * model/entity/Sku.cfc:L546-L565, each of which tests for its own key with `structKeyExists` before
 * reading it and falls back when the key is absent:
 *
 *   model/entity/Sku.cfc:L546-L551 — `getSalePrice()` guards `salePrice`
 *   model/entity/Sku.cfc:L553-L558 — `getSalePriceDiscountType()` guards `salePriceDiscountType`
 *   model/entity/Sku.cfc:L560-L565 — `getSalePriceExpirationDateTime()` guards
 *                                    `salePriceExpirationDateTime`
 *
 * The guards at model/entity/Sku.cfc:L547, :L554 and :L561 each test one key only, so "one key
 * present while another is absent" is a reachable legacy state. Hence optional properties rather
 * than a discriminated union of "sale" and "no sale": a union would forbid a state the legacy system
 * can produce.
 *
 * `exactOptionalPropertyTypes` is what keeps that honest. Under it "key absent" and "key present
 * holding `undefined`" are different types, which is exactly the distinction `structKeyExists`
 * draws. Implementations must express "no value" by OMITTING the property, never by assigning
 * `undefined`, and must clear an already-set optional with `delete` rather than by assignment.
 *
 * TIGHTENING RECORDED (TR-1): the legacy return types are loose and inconsistently so — `struct` at
 * model/entity/Product.cfc:L517 against `returntype="any"` at model/entity/Sku.cfc:L539. Both are
 * tightened to this one named shape. The three property types come from the non-persistent
 * declarations themselves: `type="numeric"` at model/entity/Sku.cfc:L115, `type="string"` at
 * model/entity/Sku.cfc:L116 and `type="date"` at model/entity/Sku.cfc:L118.
 *
 * The far side may be wider — model/service/PromotionService.cfc:L1025 reads a `roundingRuleID` off
 * the same row — but no retained member in this slice reads such a column, so declaring one would be
 * an invention. Structural typing already accepts a wider object wherever this type is expected.
 *
 * TODO(parity): `salePriceDiscountAmount` is declared as a non-persistent property at
 * model/entity/Sku.cfc:L117 and appears on the AAP §0.2.2.6 exclusion list, so a reader arriving
 * from that list expects a FOURTH key here. There is none: the property has no getter, reader or
 * writer anywhere in the legacy tree, so it is deliberately absent. (The AAP cites the declaration
 * as L118; L118 is `salePriceExpirationDateTime`, and the verified locator is L117.)
 */
export interface SalePriceDetails {
  /**
   * The promotional sale price for this SKU, already rounded by the collaborator
   * (model/service/PromotionService.cfc:L1024-L1028).
   *
   * ABSENT MEANS "NO SALE IS IN EFFECT", AND ABSENT IS NOT ZERO. This is the single most
   * consequential detail in this file, because getting it wrong produces silent, compile-clean,
   * test-passing behavioural drift.
   *
   * When the key is absent, `getSalePrice()` returns `getPrice()` — the SKU's ordinary price — at
   * model/entity/Sku.cfc:L550. Not zero, not null, not an error. The Google feed then gates its
   * sale-price output on a STRICT greater-than at
   * integrationServices/google/views/feed/product.cfm:L28,
   * `local.sku.getPrice() gt local.sku.getSalePrice()`. With no sale in effect the two sides are
   * EQUAL, the comparison is FALSE, and the `g:sale_price` and `g:sale_price_effective_date` pair
   * at integrationServices/google/views/feed/product.cfm:L29-L30 is correctly OMITTED from the
   * feed.
   *
   * So an implementation that reports "no sale" as `0`, or as `null`, inverts that comparison: the
   * ordinary price becomes strictly greater than the reported sale price for every SKU, and every
   * product in the merchant feed acquires a bogus sale price. There is no compile error and no test
   * failure unless a test covers the no-sale branch, which is why
   * the planned `test/integrations/ProductFeedBuilder.test.ts` is required to assert BOTH branches.
   *
   * The rule for implementations is therefore: OMIT this property when no sale applies. Do not
   * substitute a sentinel, and do not let the ordinary price be read from this type — the fallback
   * to the ordinary price is the domain's behaviour at model/entity/Sku.cfc:L550, expressed against
   * the persistent `price` column declared at model/entity/Sku.cfc:L56, and it stays there.
   *
   * TODO(parity): the product-side counterpart diverges and the divergence is carried, not
   * reconciled. `Product.getSalePrice()` at model/entity/Product.cfc:L594-L601 returns a literal
   * `0` at model/entity/Product.cfc:L600, and its second branch at
   * model/entity/Product.cfc:L598 calls the first SKU's accessor but DISCARDS the result — there is
   * no `return` on that line — so the literal `0` is what a product with no default SKU yields. The
   * feed reads the SKU-side accessor, so the SKU-side fallback is the one that governs the
   * comparison above; both behaviours are preserved as observed.
   */
  readonly salePrice?: number;

  /**
   * The kind of discount that produced `salePrice`.
   *
   * ABSENT is distinct from "no discount". When the key is absent, `getSalePriceDiscountType()`
   * returns an EMPTY STRING at model/entity/Sku.cfc:L557 — not null and not a named "none" value.
   *
   * TODO(parity): the product-side counterpart seeds a different default. `Product`'s accessor at
   * model/entity/Product.cfc:L604-L612 memoizes the literal string `none` at
   * model/entity/Product.cfc:L606 before delegating, whereas the SKU-side fallback is the empty
   * string at model/entity/Sku.cfc:L557. Two different "no discount" representations coexist in the
   * legacy source. Both are carried; neither is normalised, and this port supplies no default of
   * its own for either.
   *
   * No retained member of this slice reads this key — the census above found only the feed, and the
   * feed does not emit a discount type. It is declared regardless, because it is one of the three
   * keys the boundary call's result genuinely carries and TR-5 forbids quietly dropping a member
   * from a port interface.
   */
  readonly salePriceDiscountType?: string;

  /**
   * When the sale price stops applying. Consumed by the feed's `g:sale_price_effective_date` range
   * at integrationServices/google/views/feed/product.cfm:L30.
   *
   * Typed as a `Date` and OPTIONAL, which is the honest translation of a legacy accessor that is
   * declared to return a date at model/entity/Product.cfc:L614 but does not always do so
   * (model/entity/Sku.cfc:L564).
   *
   * TODO(parity): there is a real latent TYPE VIOLATION in the legacy source here, and it is
   * annotated rather than repaired (standard 7). The SKU-side accessor returns an EMPTY STRING when
   * the key is absent — model/entity/Sku.cfc:L563 is the closing brace of the guard and the
   * `return "";` is at model/entity/Sku.cfc:L564 — while the product-side counterpart is declared
   * `public date function getSalePriceExpirationDateTime()` at model/entity/Product.cfc:L614. An
   * empty string is not a date. This port does not inherit the empty-string lie: absence is
   * modelled by the property being absent, so a consumer is forced by the compiler to handle the
   * missing case explicitly instead of receiving a value that claims to be a date and is not.
   *
   * TODO(parity): two further defects on the product-side accessor are carried unchanged.
   * model/entity/Product.cfc:L616 seeds the CURRENT time as its default rather than reporting
   * absence, and model/entity/Product.cfc:L618 delegates to a MISSPELLED SKU accessor —
   * `getSalePricExpirationDateTime`, missing a letter — where the member actually declared on the
   * SKU is `getSalePriceExpirationDateTime` at model/entity/Sku.cfc:L560. Neither is fixed here.
   *
   * WHY INDEPENDENT OPTIONALITY MATTERS, CONCRETELY: because this key is guarded separately from
   * `salePrice` (model/entity/Sku.cfc:L561 versus model/entity/Sku.cfc:L547), the state "sale price
   * present, expiration absent" is reachable. In that state the feed's gate at
   * integrationServices/google/views/feed/product.cfm:L28 is TRUE, so
   * integrationServices/google/views/feed/product.cfm:L30 formats the empty string from
   * model/entity/Sku.cfc:L564 as though it were a date. Collapsing the three keys into a single
   * "sale" object would hide that state; keeping them independently optional keeps it visible to
   * whoever ports the feed builder.
   */
  readonly salePriceExpirationDateTime?: Date;
}

/**
 * Every SKU's sale-price details for one product, keyed by SKU identifier.
 *
 * The key shape is not a guess. model/service/PromotionService.cfc:L1023 constructs the result with
 * `queryToStructOfStructures( ..., "skuID" )`, so the map's keys are SKU identifiers: the
 * 32-character identifier strings the schema uses throughout (implicit requirement IR-6 — the
 * identifiers are application-generated 32-character values, not auto-increment numbers and not
 * dashed RFC-4122 strings). `string` is therefore the correct key type, and no key format is
 * validated or asserted here.
 *
 * A LOOKUP CAN MISS, AND THE TYPE SAYS SO. `noUncheckedIndexedAccess` types every indexed read off
 * this map as `SalePriceDetails | undefined`, which is exactly the legacy shape: the product-side
 * slicer guards the map with `structKeyExists` at model/entity/Product.cfc:L183 and, when the SKU
 * is not present, returns an EMPTY STRUCT at model/entity/Product.cfc:L186 rather than throwing. An
 * empty struct then fails all three key guards at model/entity/Sku.cfc:L547,
 * model/entity/Sku.cfc:L554 and model/entity/Sku.cfc:L561, so the SKU falls back to its ordinary
 * price at model/entity/Sku.cfc:L550. The compiler forcing consumers to handle the `undefined` case
 * is what keeps that fallback path from being skipped by accident.
 *
 * A SKU WITH NO SALE IS ABSENT FROM THE MAP ENTIRELY. That is what the legacy collaborator
 * produces: the map is built out of the rows a sale-price promotional-reward query returns
 * (model/service/PromotionService.cfc:L1023), so a SKU with no matching reward contributes no key.
 * A present-but-empty record would behave identically through the guards above and is therefore
 * also acceptable; a present record carrying zeroed values would NOT, for the reason set out under
 * `salePrice`. Absence — at either level — is the only correct way to say "no sale".
 *
 * `Readonly` is a compile-time tightening with no runtime counterpart. It records that this map is
 * a snapshot handed across the boundary for reading and is never mutated in place by a consumer.
 */
export type SalePriceDetailsBySkuId = Readonly<Record<string, SalePriceDetails>>;

/**
 * The Catalog slice's read-only window onto the excluded pricing subsystem.
 *
 * ONE MEMBER. That is the whole boundary. Everything else the slice does with sale prices is a
 * guarded read of the record this member returns, performed by in-scope domain code. If this
 * interface ever grows a second retrieval, the promotion engine has started to be ported.
 *
 * The port READS prices; it never computes them. There is deliberately no discount calculator, no
 * promotion evaluator, no price-group resolver, no currency converter, no rounding helper and no
 * formatter — rounding already happened on the far side
 * (model/service/PromotionService.cfc:L1024-L1028), and setting-driven formatting belongs to
 * `src/util/formatting.ts`.
 *
 * IMPLEMENTED BY CONSTRUCTOR INJECTION, NOT BY LOOKUP (standard 3, rule R2). The legacy call site
 * resolves its collaborator through a case-insensitive string-keyed factory lookup,
 * `getService("promotionService")` at model/entity/Product.cfc:L519. This interface is the
 * compile-checked replacement: an implementation is constructed once in the composition root and
 * handed to its consumers as a typed constructor parameter, so a missing or misnamed collaborator
 * is a compile error instead of a runtime failure. Consumers depend on this file with a TYPE-ONLY
 * import, which is erased at compile time — no runtime cycle between `domain/` and `ports/`, no
 * bundler ordering problem and no runtime bytes.
 *
 * DELIBERATELY NOT A CLASS. No abstract base and no constructor, so a test double is a plain object
 * literal — which is how the planned `test/support/inMemoryRepositories.ts` is to supply one. That matters because
 * the legacy repository contains no mocking library at all: its tests extend an MXUnit base that
 * boots the whole application to obtain collaborators (meta/tests/unit/SlatwallUnitTestBase.cfc:L49
 * and meta/tests/unit/SlatwallUnitTestBase.cfc:L52). The ports are what make direct substitution
 * possible instead. Coverage of this
 * port is NET-NEW: no legacy test exercises the sale-price surface, and
 * The planned `test/integrations/ProductFeedBuilder.test.ts` must drive both branches of the feed's conditional
 * by returning a record with and then without the `salePrice` key.
 */
export interface PricingPort {
  /**
   * Retrieves the sale-price details for every SKU of one product, in a single boundary crossing.
   *
   * The name, arity and argument are preserved verbatim from the collaborator this replaces,
   * `public struct function getSalePriceDetailsForProductSkus(required string productID)` at
   * model/service/PromotionService.cfc:L1022, so interface parity stays checkable member by member.
   * The in-scope caller keeps its own name and its own no-argument shape —
   * `getSalePriceDetailsForSkus()` at model/entity/Product.cfc:L517 — and belongs to
   * `src/domain/product/Product.ts`, not here.
   *
   * PER PRODUCT, NEVER PER SKU. There is no `getSalePriceDetailsForSku` member and there must not
   * be one: the legacy code fetches the whole product's details in one call
   * (model/entity/Product.cfc:L519) and slices per SKU afterwards
   * (model/entity/Product.cfc:L182-L187). A per-SKU member would multiply boundary crossings and
   * change behaviour under the read-back ordering the slice depends on.
   *
   * ASYNCHRONOUS because the collaborator issues a database query
   * (model/service/PromotionService.cfc:L1023).
   *
   * Returns an empty map for a product with no promotional sale prices. That is not an error
   * condition: the guards at model/entity/Product.cfc:L183 and model/entity/Sku.cfc:L547 turn an
   * empty map into the ordinary-price fallback at model/entity/Sku.cfc:L550, which is the correct
   * "no sale" outcome for the feed.
   *
   * TODO(boundary): `model/service/PromotionService.cfc:L1022` is an UNCONVERTED COLLABORATOR.
   * It is excluded from this slice along with the other 8 `Promotion*` components under
   * `model/entity/`, `model/service/`, `model/dao/` and `model/process/` (9 in total), and with the
   * neighbouring 4 `PriceGroup*` and 2 `Currency*` components in those same directories. This
   * interface is the flagged gap, declared per TR-5 so the dependency is visible and finite rather
   * than followed; the member is not dropped, and the excluded components stay out of the
   * deliverable. An implementation of this port that reaches real promotional data must live in the
   * adapter layer and remains outside the converted slice.
   *
   * @param productId The product whose SKUs are being priced — the identifier passed as `productID`
   *   at model/entity/Product.cfc:L519. Required, because the legacy parameter is declared
   *   `required` at model/service/PromotionService.cfc:L1022 and the only call site always supplies
   *   it.
   * @returns The product's details map, keyed by SKU identifier. Absent keys mean "no sale for that
   *   SKU"; see `SalePriceDetailsBySkuId`.
   */
  getSalePriceDetailsForProductSkus(productId: string): Promise<SalePriceDetailsBySkuId>;
}

/* ------------------------------------------------------------------------------------------------
 * Read but deliberately NOT ported — recorded so each omission reads as a decision
 *
 * TR-5's "never quietly dropped" cuts both ways: a gap must be flagged rather than silently filled,
 * and an omission must be stated rather than left implicit. Everything below was read in full and
 * excluded on purpose. Nothing here is a placeholder for later work.
 *
 * 1. `Product.price` — NO MEMBER, because it crosses no boundary. AAP 0.2.2.7 names it as this
 *    port's ORIGIN, which is easily misread as naming it a member. The Google feed does read it:
 *    integrationServices/google/views/feed/product.cfm:L27 emits `g:price` from
 *    `local.sku.getProduct().getPrice()`. But that read resolves entirely inside the in-scope
 *    slice. `Product.price` is a NON-PERSISTENT property declared at
 *    model/entity/Product.cfc:L118, inside the block headed
 *    "Non-Persistent Properties - Delegated to default sku" at
 *    model/entity/Product.cfc:L115, and `Product.getPrice()` at
 *    model/entity/Product.cfc:L561-L568 either returns its own already-populated value
 *    (model/entity/Product.cfc:L562-L563) or delegates to the default SKU
 *    (model/entity/Product.cfc:L566), which reads the PERSISTENT `price` column declared at
 *    model/entity/Sku.cfc:L56. Both endpoints are in-scope entities over the retained schema, so a
 *    port member would be pure over-building — and this is the port most likely to be over-built.
 *
 * 2. The six price and currency delegators of model/entity/Sku.cfc:L255-L287 — NO MEMBERS. They
 *    are, in declaration order: `getPriceByPromotion` (model/entity/Sku.cfc:L257),
 *    `getPriceByPriceGroup` (model/entity/Sku.cfc:L261),
 *    `getAppliedPriceGroupRateByPriceGroup` (model/entity/Sku.cfc:L265),
 *    `getPriceByCurrencyCode` (model/entity/Sku.cfc:L269),
 *    `getListPriceByCurrencyCode` (model/entity/Sku.cfc:L275) and
 *    `getRenewalPriceByCurrencyCode` (model/entity/Sku.cfc:L281). The first three delegate straight
 *    into the excluded promotion and price-group services; the last three read
 *    `getCurrencyDetails()` (declared at model/entity/Sku.cfc:L367), which is itself on the
 *    AAP 0.2.2.6 exclusion list and reaches the excluded currency service. The retained-consumer
 *    census found NO retained member in this slice that reads a currency-scoped price, so adding
 *    members for them would extend the port into excluded subsystems for no caller. Recorded here,
 *    with locators, exactly as AAP 0.4.1.8 records the omission of a dead private helper.
 *
 *    TODO(parity): those last three siblings do not guard alike, and the asymmetry is preserved
 *    rather than tidied. model/entity/Sku.cfc:L269's guard tests ONLY the outer currency key
 *    (model/entity/Sku.cfc:L270) and then reads the inner `price` member at
 *    model/entity/Sku.cfc:L271, so it can fail where its neighbours return cleanly, whereas
 *    model/entity/Sku.cfc:L275 and model/entity/Sku.cfc:L281 each test BOTH the outer key and the
 *    inner member (model/entity/Sku.cfc:L276 and model/entity/Sku.cfc:L282). Whoever ports those
 *    delegators must carry the one-guard-short shape, not harmonise the three.
 *
 * 3. Excluded calculated members, none of which gets a member here: `livePrice` and
 *    `currentAccountPrice` (both on the AAP 0.2.2.6 exclusion list; `getLivePrice()` at
 *    model/entity/Sku.cfc:L482-L498 is itself excluded), `currencyDetails`,
 *    `eligibleFulfillmentMethods`, `assignedOrderItemAttributeSetSmartList` and `adminIcon`.
 *
 * 4. Inventory is not pricing. `qats` and `nextEstimatedAvailableDate` belong to the excluded
 *    inventory and stock families, and the feed's availability gate — the quantity range filter its
 *    controller applies at integrationServices/google/controllers/feed.cfc:L72, over the SKU list
 *    it builds at integrationServices/google/controllers/feed.cfc:L63 — is `SmartListQueryPort`
 *    work, not pricing work.
 *
 * 5. THREE EXCLUSION-LIST MEMBERS THAT READ LIKE SKU CONCERNS ARE DECLARED ON THE PRODUCT, and the
 *    correct owner is recorded here because a reader scanning the SKU's exclusion list will
 *    misattribute them: `salePriceDetailsForSkus` at model/entity/Product.cfc:L108,
 *    `estimatedReceivalDetails` at model/entity/Product.cfc:L106 (accessor at
 *    model/entity/Product.cfc:L399) and `allowBackorderFlag` at model/entity/Product.cfc:L102
 *    (accessor at model/entity/Product.cfc:L551). No member is added for them. The first is simply
 *    the product-side cache of this port's result; the other two are receival and inventory
 *    concerns.
 * --------------------------------------------------------------------------------------------- */
