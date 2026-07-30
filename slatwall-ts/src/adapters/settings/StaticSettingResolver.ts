/**
 * Static setting-resolution adapter — the in-scope implementation of
 * `src/ports/SettingResolverPort.ts` for the extracted Slatwall Catalog slice.
 *
 * It answers the eighteen configuration names the slice reads, from the metadata defaults declared
 * in the legacy source, with no input/output of any kind: no database read, no `SwSetting` query,
 * no filesystem access, no network call, no environment variable and no clock. Every value it
 * returns is a compile-time constant transcribed from a legacy declaration and carries that
 * declaration's `path:Lnnn` locator inline, so a reviewer can diff any answer against the source
 * that produced it without trusting this narrative.
 *
 * LEGACY ORIGINS (reference only; the CFML tree is never modified — AAP §0.4.1.1 / TR-6):
 *   - config/dbdata/SlatwallSetting.xml.cfm — the `SwSetting` seed document, and the reason this
 *     adapter can be static at all. See THE SEED DATA below.
 *   - model/service/SettingService.cfc — the out-of-scope effective-value engine. Its per-name
 *     metadata block (the struct that opens above L150 and closes at L269) is the source of every
 *     default reproduced here, and its `getSettingDetails` at L468-L600 is the source of the
 *     resolution ORDER reproduced here. AAP §0.2.2.1 excludes the whole `Setting*` family — three
 *     files: model/entity/Setting.cfc, model/service/SettingService.cfc, model/dao/SettingDAO.cfc.
 *   - model/entity/HibachiEntity.cfc:L128-L131 — `setting()`, the accessor every in-scope entity
 *     reads through. Its body is one delegation, and both halves of it disappear here rather than
 *     being re-created: the `getService("settingService")` string lookup at L130 becomes a typed
 *     constructor-injected collaborator (AAP §0.4.3.2 rule R2, AAP §0.7.3 S3), and the hierarchical
 *     accessor itself becomes the declared, compile-checked port this class implements.
 *   - model/transient/HibachiScope.cfc:L201 — a second, identically shaped `setting()` declaration
 *     on the request-scope transient, used by model/service/ProductService.cfc:L200, L201 and L240.
 *     It is the evidence that a resolution context is genuinely optional rather than merely
 *     convenient, because those three reads have no entity receiver at all.
 *
 * WHY THIS FILE EXISTS — IR-2, verbatim: "A narrow setting-resolution port is unavoidable. The
 * slice reads eighteen distinct configuration keys through `HibachiEntity.setting()`
 * [model/entity/HibachiEntity.cfc:L129], whose effective-value engine lives in the out-of-scope
 * `SettingService`. A typed `SettingResolverPort` covering exactly those keys — including the
 * interpolated `productImage<size>Width` / `productImage<size>Height` form — is required, rather
 * than porting the platform-wide settings engine." This class is the other half of that sentence:
 * the port declares which names may be asked for, and this adapter declares what they answer.
 *
 * RULES. `review_rules` reports "No user rules provided." for this project — the on-disk rules
 * document was read in full, both with the default window and with an explicit full range, and it
 * returns that single line with no paginated remainder. Zero files therefore enter scope by rule
 * and no rule-derived constraint applies to this file. Per UR4 that is emphatically NOT licence to
 * lower the bar: the nine binding standards of AAP §0.7.3 govern in its place — S1 strict type
 * safety, S2 parameterized SQL, S3 explicit dependency injection, S4 hexagonal separation, S5
 * exact-version pinning, S6 one labelled test per converted method, S7 preserve-and-annotate, S8
 * flag mismatches, S9 invent nothing — together with the prompt-borne constraints of AAP §0.7.4.
 *
 * ---------------------------------------------------------------------------------------------
 * ⭐⭐ SYNCHRONOUS BY DECISION — EXECUTION-MODEL MISMATCH M8 (AAP §0.6.6, §0.8.2 Guideline 6)
 * ---------------------------------------------------------------------------------------------
 * The single member below returns a plain value. It is not declared asynchronous, it returns no
 * promise, it takes no callback and it waits on nothing. That is the port's recorded decision, and
 * this adapter honours it exactly rather than "harmonising" with the six asynchronous sibling ports.
 *
 * THE MISMATCH ITSELF is out of scope and is flagged rather than reimplemented: the out-of-scope
 * `SettingService.updateStockCalculated` at model/service/SettingService.cfc:L717 launches a named
 * out-of-band thread — `thread action="run" name="updateStockThread"` at
 * model/service/SettingService.cfc:L722. A persistent ColdFusion or Railo application server can
 * carry such a thread past the request that started it; a single stateless Lambda invocation
 * cannot. AAP §0.6.6 M8 records the consequence: the port "is declared synchronous so no caller in
 * the slice depends on background completion". Nothing here starts a thread, schedules a refresh,
 * warms a cache or performs any deferred work.
 *
 * WHY SYNCHRONY IS LOAD-BEARING RATHER THAN COSMETIC. The legacy readers are plain synchronous
 * property getters, and several of them would have to become asynchronous if this contract were
 * promise-returning: `Product.getProductURL` [model/entity/Product.cfc:L207-L209],
 * `Product.getTemplate` [model/entity/Product.cfc:L215-L221], `Sku.getCurrencyCode`
 * [model/entity/Sku.cfc:L360-L365] and `Option.getImageDirectory`
 * [model/entity/Option.cfc:L81-L83]. The Google product-feed view would inherit it too, since it
 * reads two settings inline while rendering [integrationServices/google/views/feed/product.cfm:L58].
 * A synchronous contract keeps all of that faithful.
 *
 * ---------------------------------------------------------------------------------------------
 * HEXAGONAL POSITION AND IMPORT DISCIPLINE (AAP §0.7.3 S4)
 * ---------------------------------------------------------------------------------------------
 * This module imports its own port (type-only) and the seeded product-type data it must not
 * duplicate, and nothing else. It does not reach into `services/`, `handlers/`, `integrations/`,
 * `validation/`, `util/`, `errors/`, `config/` or the sibling `adapters/mysql/` — an adapter never
 * depends on a peer adapter implementation, and `adapters/mysql/**` depends on the ABSTRACTION
 * `ports/SettingResolverPort.ts` rather than on this concrete class, which is the correct
 * direction. It introduces no third-party dependency: the MySQL client pinned in `package.json`
 * remains the service's single runtime dependency (AAP §0.7.3 S5), and this file imports no part of
 * it — no client, no pool, no query runner and no row mapper, because it performs no query at all.
 * It reads no environment variable either: `src/config/env.ts` is the only file in the subtree
 * permitted to do that, which is exactly what keeps the apparent `config` ↔ `adapters` relationship
 * acyclic. Every import is relative, extensionless and single-quoted, because `tsconfig.json`
 * declares no `paths` and no `baseUrl`, so an alias that type-checks could still fail to resolve at
 * run time (AAP §0.4.3.5).
 *
 * NO MODULE-SCOPE MUTABLE STATE, AND NO CACHE (M7; see CARRIED, NOT REPAIRED below). The two
 * lookup tables and the seeded-row map are frozen compile-time literals; freezing this module's
 * own freshly created literals is self-contained initialisation with no observable side effect, so
 * the module is safe to load at cold start. Nothing is written after load, nothing is memoized and
 * nothing per-request is held, so a warm container cannot leak one invocation's data into the next.
 *
 * TESTABILITY (AAP §0.7.3 S6). The class has no constructor parameters, so `new
 * StaticSettingResolver()` is the whole construction story: no bootstrap, no container, no
 * registry, no service locator and no decorator. Its single method is deterministic and free of
 * input/output, so a test asserts it directly, and because the port is a structural interface a
 * bare object literal can stand in for this class wherever a collaborator needs one. That matters
 * because the legacy suite vendored no mocking library at all and instead booted the entire FW/1
 * application (AAP §0.4.3.6), and because no CFML runtime exists in this environment to compare
 * against. Coverage here is NET-NEW: AAP §0.6.5.2 verified that no legacy setting test of any kind
 * exists.
 */

import {
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE,
  type BaseProductType,
} from '../../domain/BaseProductType';
import type {
  CatalogSettingName,
  ProductImageDimensionSettingName,
  SettingName,
  SettingResolutionContext,
  SettingResolverPort,
  SettingValue,
} from '../../ports/SettingResolverPort';

/*
 * =============================================================================================
 * THE SEED DATA — WHAT IS ACTUALLY IN `SwSetting`, AND WHAT IS NOT
 * (config/dbdata/SlatwallSetting.xml.cfm, 98 lines, read in full)
 * =============================================================================================
 *
 * ⭐ BOTH NUMBERS, BECAUSE THE TWO DISAGREE AND A READER WILL RE-DERIVE ONE OF THEM: the document
 * holds SEVEN `<Record>` rows spanning FIVE distinct `settingName` values. AAP §0.4.1.7's phrase
 * "only five setting rows are actually seeded" refers to the five distinct names; anyone who counts
 * rows instead gets seven. Both figures are correct about different things, and both are stated
 * here so nobody has to guess which one was meant:
 *
 *   L12  siteForgotPasswordEmailTemplate                — global scope
 *   L14  skuEligibleFulfillmentMethods                  — scoped to productTypeID (merchandise)
 *   L15  skuEligibleFulfillmentMethods                  — scoped to productTypeID (subscription)
 *   L16  skuEligibleFulfillmentMethods                  — scoped to productTypeID (contentAccess)
 *   L18  subscriptionUsageRenewalReminderEmailTemplate  — global scope
 *   L20  taskFailureEmailTemplate                       — global scope
 *   L21  taskSuccessEmailTemplate                       — global scope
 *
 * ⭐⭐ THE HEADLINE DISCLOSURE — 1 SEEDED, 17 DEFAULT-BACKED. Of the eighteen names this adapter
 * answers, EXACTLY ONE — `skuEligibleFulfillmentMethods` — has any seeded row at all. The other
 * four seeded names above are email and task infrastructure that sit entirely outside the
 * eighteen-name set. SEVENTEEN of the eighteen therefore have no seeded row anywhere, at any
 * scope, and fall back to the metadata defaults declared in the out-of-scope
 * model/service/SettingService.cfc. This is the disclosure AAP §0.4.1.7 asks this file for —
 * "the resolver documents which keys fall back to defaults" — and the per-name breakdown is:
 *
 *   TWELVE answered from a declared literal default (see METADATA_DEFAULTS below):
 *     globalDateFormat L163, globalURLKeyProduct L178, imageAltString L183,
 *     imageMissingImagePath L184, productImageDefaultExtension L191,
 *     productImageOptionCodeDelimiter L192, productTitleString L193,
 *     productAutoApproveReviewsFlag L198, skuAllowBackorderFlag L219, skuCurrency L221,
 *     skuShippingWeight L232, skuShippingWeightUnitCode L233
 *   TWO interpolated forms answered for the three DECLARED sizes only (L261-L266), and a declared
 *     gap for any other size segment: productImage<size>Width, productImage<size>Height
 *   ONE with no `defaultValue` declared at all, whose empty-string result is nonetheless
 *     locator-backed rather than invented: productDisplayTemplate L190
 *   THREE whose declared default is COMPUTED at run time from an out-of-scope collaborator, and
 *     which are therefore declared gaps: globalAssetsImageFolderPath L164,
 *     skuEligibleCurrencies L222, skuEligibleFulfillmentMethods L223
 *   12 + 2 + 1 + 3 = 18, the count IR-2 states.
 *
 * Corollary, verified rather than assumed: none of the five seeded names is an image-sizing name
 * or `globalImageExtension`, so the interpolated pair and that name alike have no seeded row.
 *
 * FOUR FURTHER FIRST-HAND FINDINGS ABOUT THE SEED DOCUMENT, each recorded with its locator:
 *
 *   1. Six columns are declared — settingID L4 (`fieldtype="id"`), settingName L5, settingValue L6,
 *      productTypeID L7, emailTemplateID L8, paymentMethodID L9 — but `emailTemplateID` and
 *      `paymentMethodID` are NEVER POPULATED by any of the seven rows. Only four of the six columns
 *      are ever used, and scoping is expressed exclusively through `productTypeID`.
 *   2. Exactly TWO scoping shapes exist: globally scoped (four rows) and product-type scoped
 *      (three rows). `skuEligibleFulfillmentMethods` is NEVER globally scoped — every one of its
 *      rows carries a `productTypeID`.
 *   3. Each `settingValue` is a SINGLE 32-character identifier, not a comma-delimited list, even
 *      though the metadata declares the name as `fieldType="listingMultiselect"` at
 *      model/service/SettingService.cfc:L223 and the consumer feeds it to a list filter at
 *      model/entity/Sku.cfc:L452. What is stored is carried across as stored: no normalisation, no
 *      splitting and no wrapping into an array (AAP §0.8.2 Guideline 4).
 *   4. A dead comment block opens at L26 — AFTER the closing `</Table>` at L24, so it sits outside
 *      the document root and is definitively inactive. It holds 68 spare identifiers under a
 *      heading telling the reader to delete them once used. None of them is data, none is
 *      referenced anywhere, and none is reproduced in this file or in this comment (AAP §0.7.3 S9).
 *
 * ⚠️ LOCATOR TRAP, stated because the two line sets are one apart and easy to transpose: the three
 * `skuEligibleFulfillmentMethods` rows are at config/dbdata/SlatwallSetting.xml.cfm:L14, L15, L16,
 * whereas the three product-type rows they point at are at
 * config/dbdata/SlatwallProductType.xml.cfm:L13, L14, L15. Each is cited against its own file
 * throughout this module.
 */

/*
 * =============================================================================================
 * ⭐ THE RESOLUTION ORDER — DEFAULT FIRST, ROW OVERRIDES. THIS IS THE FILE'S DESIGN JUSTIFICATION
 * =============================================================================================
 *
 * A reader meeting a "static" resolver reasonably suspects that metadata defaults are being used
 * as a last-resort fallback where the real engine would have consulted the database first. The
 * opposite is true, and it is verifiable line by line in `SettingService.getSettingDetails`
 * [model/service/SettingService.cfc:L468-L600]:
 *
 *   1. L473-L479 — the result struct is initialised with `settingValue = ""` (L474). The engine's
 *      own representation of "nothing found" is therefore the EMPTY STRING, not null.
 *   2. L481-L486 — `if(structKeyExists(getSettingMetaData(settingName), "defaultValue"))` assigns
 *      that default into `settingValue` immediately, BEFORE any database lookup has happened. The
 *      metadata default is the BASE value, not a fallback. (L483-L485 additionally flips a
 *      `settingInherited` flag when a persistent object was passed; that flag is metadata about the
 *      value, and `getSettingValue` returns only `.settingValue` at L459 and L465, so it cannot
 *      change what a caller receives.)
 *   3. L489-L499 — for a name beginning `global` or `integration`, ONE UNSCOPED record lookup runs
 *      and overrides the value only `if(settingRecord.recordCount)` (L494-L498). L488's own comment
 *      explains why nothing else is needed: such a name has no relationships.
 *   4. L502-L514 — for any other name, the prefix is matched against `getSettingPrefixInOrder()` in
 *      a loop at L505-L510, and an unmatched prefix throws at model/service/SettingService.cfc:L513
 *      (cited by locator only — that message string is not reproduced here). Nothing is asserted
 *      about the contents of that prefix list; all eighteen names demonstrably resolve on live
 *      paths, so their prefixes are evidently registered, and that is recorded as a mechanism with
 *      a locator rather than as an enumerated claim (AAP §0.7.3 S9).
 *   5. L517-L531 — an object-explicit row lookup, guarded by
 *      `structKeyExists(arguments, "object") && arguments.object.isPersistent()` (L517), again
 *      overriding only on `recordCount` (L524-L528).
 *   6. L534-L591 — the hierarchical walk, dispatched on `arguments.object.getClassName()` (L534)
 *      against the lookup-order table declared as data at L102-L112, walking any `*path`
 *      relationship BACKWARD (`nextPathListIndex--` at L558) and stopping at the first match
 *      (L591). A final relationship-free retry follows at L596.
 *
 * ⭐ WHY OBJECT-INDEPENDENT ANSWERS ARE FAITHFUL HERE, NOT A SIMPLIFICATION. Steps 3, 5 and 6 can
 * only change the answer if a matching `SwSetting` row EXISTS. Seventeen of the eighteen names have
 * no row at any scope (see THE SEED DATA above), so for those seventeen every lookup misses, every
 * override is skipped, and the value assigned at step 2 survives to be returned. The resolution
 * context consequently cannot affect the result, which is why this adapter answers those names the
 * same way whether a context is supplied or not — a source-derived consequence rather than a
 * shortcut. The eighteenth name is the one with rows, and it is the one this adapter declines to
 * answer; see the gap note on it below.
 *
 * Consequence for the three `global`-prefixed names among the eighteen —
 * `globalAssetsImageFolderPath`, `globalDateFormat` and `globalURLKeyProduct`: no `global*` row is
 * seeded anywhere in config/dbdata/SlatwallSetting.xml.cfm, so step 3's single unscoped lookup
 * misses and all three resolve to their metadata defaults unconditionally.
 */

/*
 * =============================================================================================
 * CARRIED, NOT REPAIRED — the observations this file owns (AAP §0.7.3 S7 / S8, §0.8.2 Guideline 4)
 * =============================================================================================
 *
 * The defect and mismatch registers of AAP §0.6.7 and §0.6.6 are CLOSED at D1-D21 and M1-M8. Every
 * finding below is therefore recorded with a `path:Lnnn` locator and no new identifier is minted.
 * Nothing below is repaired: preserving legacy behaviour and annotating it is the standard, and the
 * plan's single declared exception to it (D18, SQL parameterization) belongs to
 * `src/adapters/mysql/MySqlProductRepository.ts`, not to this file. This file claims no exception.
 *
 * ---------------------------------------------------------------------------------------------
 * 1. THE SERVICE-LEVEL CACHE IS REAL, AND IS DELIBERATELY NOT CARRIED
 * ---------------------------------------------------------------------------------------------
 * Two layers behave differently in the legacy source, and both are stated so the omission below
 * reads as a decision rather than an oversight:
 *   - `HibachiEntity.setting()` [model/entity/HibachiEntity.cfc:L129-L131] does NOT memoize. It
 *     delegates afresh on every call, unlike its immediate neighbours `getComments()`
 *     [model/entity/HibachiEntity.cfc:L119-L126] and `getAttributeValuesForEntity()`, both of which
 *     guard on `structKeyExists(variables, ...)` first.
 *   - `SettingService.getSettingValue()` [model/service/SettingService.cfc:L443-L466] DOES. A
 *     service-instance struct `variables.settingDetailsCache` — declared at
 *     model/service/SettingService.cfc:L71, initialised at L79 and emptied at L435 — is populated
 *     lazily at L453-L455 and read at L457/L459. Its key is derived at L446-L451: the bare setting
 *     name when the name begins `global` or the object is non-persistent (L447-L448), otherwise
 *     `settingName_primaryIDValue` when no filter entities were supplied (L449-L451); when neither
 *     branch applies the key stays empty and the call bypasses the cache entirely (L462-L465).
 *
 * WHY THIS ADAPTER IMPLEMENTS NEITHER. DI/1 registers services as singletons
 * [org/Hibachi/Hibachi.cfc:L289 onward], so that cache lives for the life of the application — which
 * is precisely the warm-container hazard execution-model mismatch M7 warns about, recording that
 * memoization must be "scoped to the request object rather than the module". Independently of that,
 * this adapter performs no input/output, so there is nothing to amortise: a cache here would be a
 * pure enhancement, which AAP §0.8.2 Guideline 4 forbids. Hence no cache, no memoization and no
 * module-scope mutable state of any kind.
 *
 * ---------------------------------------------------------------------------------------------
 * 2. TODO(parity): AN UNGUARDED DEREFERENCE MAKES THE LEGACY CONTEXT ARGUMENT ONLY HALF-OPTIONAL
 * ---------------------------------------------------------------------------------------------
 * `getSettingValue` declares `any object` WITHOUT `required`
 * [model/service/SettingService.cfc:L443], yet L447 evaluates `!arguments.object.isPersistent()`
 * with no `structKeyExists(arguments, "object")` guard in front of it. CFML's `||` short-circuits,
 * so the call survives an omitted object only while the left operand — `left(settingName, 6) eq
 * "global"` — is true. The contrast is what makes this an oversight rather than a convention: the
 * very next method guards the identical expression three times, at
 * model/service/SettingService.cfc:L483, L517 and L534, each written as
 * `structKeyExists(arguments, "object") && arguments.object.isPersistent()`.
 *
 * The resulting legacy contract is uneven: three of the eighteen names begin `global`
 * (`globalAssetsImageFolderPath`, `globalDateFormat`, `globalURLKeyProduct`) and may legitimately be
 * read with no receiver — which model/service/ProductService.cfc:L200, L201 and L240 do through the
 * request-scope transient — while the other fifteen effectively require one at run time despite the
 * optional declaration. Carried, not repaired: this adapter accepts the port's optional context
 * exactly as declared, never widens it and never makes it required on its own authority.
 *
 * ---------------------------------------------------------------------------------------------
 * 3. `globalImageExtension` IS NOT A NINETEENTH NAME — FOUR INDEPENDENT REASONS
 * ---------------------------------------------------------------------------------------------
 * `model/dao/ProductDAO.cfc` interpolates `setting("globalImageExtension")` into SQL at L307, L313
 * and L320 — the three arms of a dialect branch whose conditions sit at L304, L310 and L317. It is
 * deliberately absent from the port's closed union and from this adapter, and it must stay absent:
 *   (a) IR-2 enumerates EIGHTEEN names; adding a nineteenth would be invented surface
 *       (AAP §0.7.3 S9).
 *   (b) It is not read through `HibachiEntity.setting()`, so it falls outside the mechanism IR-2
 *       describes.
 *   (c) Its only three call sites are provably unresolvable. The receiver's inheritance chain is
 *       model/dao/ProductDAO.cfc:L49 `extends="HibachiDAO"` → model/dao/HibachiDAO.cfc:L49
 *       `extends="Slatwall.org.Hibachi.HibachiDAO"` → org/Hibachi/HibachiDAO.cfc:L1
 *       `extends="HibachiObject"` → org/Hibachi/HibachiObject.cfc:L1, which is terminal. No file on
 *       that chain declares `setting()`, and the `onMissingMethod` fabrication that rescues such
 *       calls elsewhere exists only on the service base at org/Hibachi/HibachiService.cfc:L255 —
 *       not on the DAO chain. Porting them as working behaviour would ADD behaviour the legacy
 *       system never had, which is the same reasoning that leaves D12 (`FeedDAO`) and D15
 *       (`buildSkuCombinations`) documented and unported.
 *   (d) It is marked deprecated in source: its declaration at
 *       model/service/SettingService.cfc:L247 sits inside the `// DEPRECATED***` block opened at
 *       model/service/SettingService.cfc:L246.
 * ⚠️ `globalImageExtension` [model/service/SettingService.cfc:L247] and the in-scope
 * `productImageDefaultExtension` [model/service/SettingService.cfc:L191] happen to share the
 * default value `'jpg'`. They are distinct names and are never aliased or merged.
 *
 * ---------------------------------------------------------------------------------------------
 * 4. THE SETTING IS IN SCOPE; THE CALCULATED PROPERTY DERIVED FROM IT IS NOT
 * ---------------------------------------------------------------------------------------------
 * Two of the eighteen names read like excluded members and are not:
 *   - `skuEligibleFulfillmentMethods` is the SETTING. `eligibleFulfillmentMethods` is the calculated
 *     property that consumes it at model/entity/Sku.cfc:L449-L455, and that property is on the
 *     sixteen-member excluded list of AAP §0.2.2.6 — it memoizes into `variables` and reaches the
 *     excluded `fulfillmentService` at model/entity/Sku.cfc:L451.
 *   - `skuAllowBackorderFlag` is the SETTING; the excluded calculated property is
 *     `allowBackorderFlag` [model/entity/Product.cfc:L551-L552].
 * This adapter supplies setting values only. It computes no derived property, reaches no excluded
 * collaborator and imports nothing from `domain/` beyond the seeded product-type identifiers.
 *
 * ---------------------------------------------------------------------------------------------
 * 5. TR-1: WHERE THE LEGACY VALUE SHAPES AND THE TYPED SHAPE DIVERGE
 * ---------------------------------------------------------------------------------------------
 * CFML is loosely typed and the metadata struct mixes shapes freely. Three of the twelve declared
 * defaults are written as UNQUOTED NUMBERS in source — `productAutoApproveReviewsFlag` = 0
 * [model/service/SettingService.cfc:L198], `skuAllowBackorderFlag` = 0 [L219] and
 * `skuShippingWeight` = 1 [L232] — while the six pixel sizes are written as QUOTED STRINGS
 * [L261-L266]. The port declares one normalised text shape, `SettingValue = string`, and assigns
 * the normalisation to this adapter [src/ports/SettingResolverPort.ts:L263-L264]. The three numeric
 * defaults are therefore carried as `'0'`, `'0'` and `'1'`: a deliberate TR-1 tightening, recorded
 * here rather than performed silently, and applied only to the representation — never to the value.
 *
 * ⚠️ THE COERCION THIS ADAPTER DOES NOT PERFORM, AND WHICH CONSUMERS MUST NOT ASSUME AWAY. CFML
 * applies its own coercion at each point of use: `Product.getAllowBackorderFlag()` is declared
 * `numeric` and returns the value directly [model/entity/Product.cfc:L551-L552], and
 * `ProductService` uses one in a boolean condition, `if(arguments.product.setting(
 * 'productAutoApproveReviewsFlag'))` [model/service/ProductService.cfc:L159]. CFML treats the
 * string "0" as boolean FALSE; JavaScript truthiness treats every non-empty string as TRUE. The
 * text `'0'` returned here is therefore NOT a drop-in for that condition, and a consumer must
 * compare explicitly rather than rely on truthiness. The port places that coercion at the consumer
 * [src/ports/SettingResolverPort.ts:L239-L261], which is exactly where CFML placed it; this note
 * exists so the divergence is visible at the point the value is produced.
 *
 * ---------------------------------------------------------------------------------------------
 * 6. NEAR-NEIGHBOUR NAMES THAT ARE NOT AMONG THE EIGHTEEN AND ARE NOT ANSWERED HERE
 * ---------------------------------------------------------------------------------------------
 * Read and confirmed adjacent in the same metadata struct, and deliberately absent from this file:
 * `globalURLKeyBrand` [model/service/SettingService.cfc:L177] and `globalURLKeyProductType` [L179],
 * the neighbours of `globalURLKeyProduct` [L178]; `globalWeightUnitCode` [L180], which shares the
 * value `'lb'` with `skuShippingWeightUnitCode` [L233] and is never aliased to it;
 * `productMissingImagePath` [L267], whose value differs from the in-scope `imageMissingImagePath`
 * [L184] despite the similar name; the computed siblings `globalAssetsFileFolderPath` [L165] and
 * `globalMissingImagePath` [L172]; the flag siblings `skuAllowPreorderFlag` [L220],
 * `skuQATSIncludesQNROROFlag` [L229], `skuQATSIncludesQNROVOFlag` [L230],
 * `skuQATSIncludesQNROSAFlag` [L231] and `skuTrackInventoryFlag` [L235]; and the three further
 * `${...}` template strings `productHTMLTitleString` [L194], `productMetaDescriptionString` [L195]
 * and `productMetaKeywordsString` [L196].
 *
 * ---------------------------------------------------------------------------------------------
 * 7. MEMBERS NOT PORTED, RECORDED SO THEIR ABSENCE READS AS A DECISION
 * ---------------------------------------------------------------------------------------------
 *   - `filterEntities` and `formatValue`. The legacy accessor declares
 *     `setting(required string settingName, array filterEntities=[], formatValue=false)`
 *     [model/entity/HibachiEntity.cfc:L129] — note that `formatValue` carries no type annotation at
 *     all, while `settingName` is `required string` and `filterEntities` is `array`. Neither
 *     optional parameter is supplied by ANY of the in-scope call sites, so neither appears in the
 *     port and neither appears here; typing the untyped third parameter would have been a TR-1
 *     decision, and it is moot because the parameter is not modelled.
 *   - `getSettingDetails`. The entity wrapper is at model/entity/HibachiEntity.cfc:L134-L136 and the
 *     service member at model/service/SettingService.cfc:L468 (which additionally takes
 *     `boolean disableFormatting=false`, a parameter the wrapper never supplies). It has zero
 *     in-scope call sites and returns metadata about a setting rather than a value, so it is
 *     deliberately not ported.
 *   - A path-to-URL helper. Two reads feed their result straight into `getURLFromPath`
 *     [model/entity/Product.cfc:L224 and model/entity/Option.cfc:L82], which makes it look like a
 *     settings concern. It is not, and it could not live here in any case: it calls
 *     `expandPath('/')` at org/Hibachi/HibachiObject.cfc:L88, a servlet-context lookup, so it is not
 *     input/output-free. This adapter implements the setting-read half only.
 *   - A generic string-keyed accessor. There is deliberately no `setting(key: string)` overload, no
 *     index signature and no `Record<string, …>` escape hatch anywhere in this module. The port's
 *     closed union is the requirement: an out-of-slice name or a typo is a compile error rather
 *     than a silent run-time miss.
 */

/**
 * The twelve names whose effective value is a literal `defaultValue` declared in the legacy
 * metadata struct, transcribed byte-exactly with the locator of the declaration that produced each.
 *
 * Ordered by locator so the table can be diffed straight down against
 * model/service/SettingService.cfc rather than compared entry by entry.
 *
 * `as const` pins the literal types and makes the values readonly to the type checker; `Object.freeze`
 * makes the object immutable at run time as well, which is what guarantees the no-module-scope-
 * mutable-state property M7 requires. The `satisfies` clause is what keeps the table honest: a name
 * that is not one of the port's sixteen literals is a compile error, as is a non-text value, while
 * `Partial` allows the six names that are deliberately absent — the three computed-default gaps, the
 * one name with no declared default, and the two interpolated forms, all handled explicitly below.
 */
const METADATA_DEFAULTS = Object.freeze({
  /** model/service/SettingService.cfc:L163 — `{fieldType="text", defaultValue="mmm dd, yyyy"}`. */
  globalDateFormat: 'mmm dd, yyyy',
  /** model/service/SettingService.cfc:L178 — `{fieldType="text", defaultValue="sp"}`. */
  globalURLKeyProduct: 'sp',
  /**
   * model/service/SettingService.cfc:L183 — `{fieldType="text", defaultValue=""}`.
   *
   * A DECLARED empty string, and not to be confused with the engine's "nothing found" empty string
   * (model/service/SettingService.cfc:L474) that `productDisplayTemplate` yields below. The
   * consumer measures it before using it — `len(setting('imageAltString'))` at
   * model/entity/Sku.cfc:L159 — so the empty default is a meaningful "no alt text" signal.
   */
  imageAltString: '',
  /**
   * model/service/SettingService.cfc:L184 —
   * `{fieldType="text", defaultValue="/assets/images/missingimage.jpg"}`.
   */
  imageMissingImagePath: '/assets/images/missingimage.jpg',
  /** model/service/SettingService.cfc:L191 — `{fieldType="text", defaultValue="jpg"}`. */
  productImageDefaultExtension: 'jpg',
  /** model/service/SettingService.cfc:L192 — `{fieldType="select", defaultValue="-"}`. */
  productImageOptionCodeDelimiter: '-',
  /**
   * model/service/SettingService.cfc:L193 —
   * `{fieldType="text", defaultValue="${brand.brandName} ${productName}"}`.
   *
   * ⚠️ WRITTEN WITH SINGLE QUOTES ON PURPOSE, AND NEVER WITH A BACKTICK. The value contains two
   * `${...}` tokens which a TypeScript template literal would interpolate away, silently replacing
   * the tokens the consumer is supposed to receive. They are substituted downstream by
   * `replaceStringTemplate` [model/entity/Product.cfc:L542 →
   * org/Hibachi/HibachiUtilityService.cfc:L70-L101], so they must survive this module untouched.
   */
  productTitleString: '${brand.brandName} ${productName}',
  /**
   * model/service/SettingService.cfc:L198 — `{fieldType="yesno", defaultValue=0}`, an UNQUOTED
   * NUMBER in source, carried as text per the TR-1 note above. See also the truthiness warning
   * there: the consumer at model/service/ProductService.cfc:L159 uses it as a boolean.
   */
  productAutoApproveReviewsFlag: '0',
  /**
   * model/service/SettingService.cfc:L219 — `{fieldType="yesno", defaultValue=0}`, an UNQUOTED
   * NUMBER in source, carried as text per the TR-1 note above.
   */
  skuAllowBackorderFlag: '0',
  /** model/service/SettingService.cfc:L221 — `{fieldType="select", defaultValue="USD"}`. */
  skuCurrency: 'USD',
  /**
   * model/service/SettingService.cfc:L232 — `{fieldType="text", defaultValue=1}`, an UNQUOTED
   * NUMBER in source, carried as text per the TR-1 note above. Read by the Google product feed at
   * integrationServices/google/views/feed/product.cfm:L58.
   */
  skuShippingWeight: '1',
  /**
   * model/service/SettingService.cfc:L233 — `{fieldType="select", defaultValue="lb"}`. Read on the
   * same feed line as the weight itself, integrationServices/google/views/feed/product.cfm:L58.
   */
  skuShippingWeightUnitCode: 'lb',
} as const satisfies Readonly<Partial<Record<CatalogSettingName, SettingValue>>>);

/** The subset of the port's literal names this module answers from {@link METADATA_DEFAULTS}. */
type MetadataDefaultedSettingName = keyof typeof METADATA_DEFAULTS;

/**
 * The legacy "nothing found" value, reproduced for the one name that has no declared default.
 *
 * This is a READ CONSEQUENCE, not a fabricated fallback, and both halves of the derivation are
 * locator-backed: `productDisplayTemplate` is declared `{fieldType="select"}` with no
 * `defaultValue` key at all [model/service/SettingService.cfc:L190], and the engine initialises
 * `settingValue = ""` at model/service/SettingService.cfc:L474 before testing
 * `structKeyExists(getSettingMetaData(settingName), "defaultValue")` at L481 — a test that fails for
 * this name, so the assignment is skipped and the empty string survives. With no seeded row either
 * (see THE SEED DATA above), the empty string is what the legacy engine observably yields.
 *
 * WHY THE DECLARATION OMITS A DEFAULT, for completeness: the option list for this name is populated
 * dynamically at run time by a dedicated branch, `case "productDisplayTemplate":` at
 * model/service/SettingService.cfc:L296, which delegates to the out-of-scope content service at
 * L298-L300. A static default would have nothing meaningful to point at.
 *
 * The empty string is also the single unresolved-value convention this module uses, held
 * consistently: the port's return type is `SettingValue` — a plain, non-optional `string` — so
 * `undefined` and `null` are not representable, and a name that genuinely cannot be answered raises
 * an error rather than returning a stand-in value.
 */
const PRODUCT_DISPLAY_TEMPLATE_UNRESOLVED_VALUE: SettingValue = '';

/**
 * The six declared image-dimension defaults — the only locator-backed answers that exist for the
 * two interpolated forms.
 *
 * Exactly three sizes and six declarations, all six carrying `formatType="pixels"` and
 * `validate={dataType="numeric", required=true}`, and all six with QUOTED string defaults in source
 * (contrast the unquoted numeric defaults noted under TR-1 above). No XL and no other size is
 * declared anywhere in the legacy source, which is what makes an unrecognised size segment a
 * declared gap rather than a lookup miss.
 *
 * TODO(parity): these six declarations sit INSIDE a deprecated section of the metadata struct. The
 * comment `// DEPRECATED***` opens at model/service/SettingService.cfc:L246 and the struct does not
 * close until L269, so L261-L266 are enclosed by it — and yet the names are read by live,
 * non-deprecated code at model/entity/Sku.cfc:L184, L185, L212 and L213. (The second of those
 * readers even carries its own `// DEPRECATED SIZE LOGIC` comment at model/entity/Sku.cfc:L202.)
 * The tension is recorded and carried: the defaults are not removed, not modernised, and the names
 * are not marked deprecated in this module's types, because the port does not mark them so
 * (AAP §0.7.3 S7).
 *
 * The `satisfies` clause is checked against the port's template-literal union, so a key that does
 * not match `productImage<size>Width` or `productImage<size>Height` is a compile error here.
 */
const PRODUCT_IMAGE_DIMENSION_DEFAULTS = Object.freeze({
  /** model/service/SettingService.cfc:L261 — `defaultValue="150"`. */
  productImageSmallWidth: '150',
  /** model/service/SettingService.cfc:L262 — `defaultValue="150"`. */
  productImageSmallHeight: '150',
  /** model/service/SettingService.cfc:L263 — `defaultValue="300"`. */
  productImageMediumWidth: '300',
  /** model/service/SettingService.cfc:L264 — `defaultValue="300"`. */
  productImageMediumHeight: '300',
  /** model/service/SettingService.cfc:L265 — `defaultValue="600"`. */
  productImageLargeWidth: '600',
  /** model/service/SettingService.cfc:L266 — `defaultValue="600"`. */
  productImageLargeHeight: '600',
} as const satisfies Readonly<Record<ProductImageDimensionSettingName, SettingValue>>);

/** The six interpolated names that have a declared default; every other size segment is a gap. */
type DeclaredProductImageDimensionSettingName = keyof typeof PRODUCT_IMAGE_DIMENSION_DEFAULTS;

/**
 * One seeded `SwSetting` row for `skuEligibleFulfillmentMethods`, reduced to the two columns the row
 * actually populates for this name.
 *
 * `settingID` is deliberately not modelled: it identifies the row rather than the effective value,
 * and no in-scope consumer reads it — `getSettingValue` returns only `.settingValue`
 * [model/service/SettingService.cfc:L459, L465]. `emailTemplateID` and `paymentMethodID` are not
 * modelled either, because no row populates them (see finding 1 under THE SEED DATA).
 */
interface SeededProductTypeScopedSetting {
  /**
   * The `productTypeID` the row is scoped to — the `SwSetting.productTypeID` column declared at
   * config/dbdata/SlatwallSetting.xml.cfm:L7.
   *
   * Never written as a literal in this module. It is read from
   * {@link SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE}, where each of the three identifiers is declared
   * exactly once, so there is only ever one copy of each to diff against
   * config/dbdata/SlatwallProductType.xml.cfm:L13-L15 (IR-7).
   */
  readonly productTypeID: string;
  /**
   * The seeded `settingValue` — a single `fulfillmentMethodID`, carried across exactly as stored and
   * never split, wrapped or normalised (see finding 3 under THE SEED DATA).
   */
  readonly settingValue: SettingValue;
}

/**
 * The three seeded, product-type-scoped rows for `skuEligibleFulfillmentMethods` — the ONE name of
 * the eighteen that has any seeded row at all.
 *
 * Keyed by `systemCode` for readability, though the legacy scoping column is `productTypeID`; both
 * appear in every entry, so neither reading is lost. Because the mapping is total over
 * {@link BaseProductType}, a missing or extra discriminator is a compile error and reads of a
 * narrowed code need no non-null assertion under `noUncheckedIndexedAccess`.
 *
 * ⚠️ THE ASYMMETRY IS THE DATA AND MUST NOT BE TIDIED: `subscription` and `contentAccess` SHARE the
 * same fulfillment method, while `merchandise` differs. Both values are confirmed
 * `fulfillmentMethodID` foreign keys against config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L10
 * (`Shipping`) and L11 (`Auto`).
 *
 * ⭐ WHY A STATIC ANSWER IS LEGITIMATE FOR THESE THREE, AND ONLY THESE THREE. All three seeded
 * product types declare `productTypeIDPath` EQUAL to their own `productTypeID`
 * [config/dbdata/SlatwallProductType.xml.cfm:L13-L15], so for them the engine's backward path walk
 * [model/service/SettingService.cfc:L534-L591, stepping with `nextPathListIndex--` at L558]
 * degenerates to a direct `productTypeID` match. There is no hierarchy to walk and nothing to
 * infer, which is what separates transcription from guesswork here.
 *
 * TODO(boundary): no CHILD product type can be answered, and none is guessed at. A child's
 * `productTypeIDPath` is a multi-element list, so resolving it requires the out-of-scope
 * hierarchical engine — the lookup-order table at model/service/SettingService.cfc:L102-L112 and
 * the walk at L534-L591 — plus a database read to obtain the path in the first place, which
 * execution-model mismatch M8 bars from this synchronous, input/output-free adapter. The gap is
 * flagged per TR-5 rather than filled (AAP §0.2.2.7, IR-2).
 *
 * TODO(boundary): these rows are exposed as data because the port's resolution context cannot
 * select among them. `SettingResolutionContext` carries an entity KIND and an entity ID
 * [src/ports/SettingResolverPort.ts:L380-L389], never a `productTypeID`, and mapping a `Product`,
 * `Sku` or `Option` identifier to its product type is precisely the database read M8 bars. A
 * consumer that already holds a base product type can therefore read the seeded answer from here
 * directly, while `setting('skuEligibleFulfillmentMethods')` declines — see the gap note on that
 * name in {@link StaticSettingResolver.setting}. The legacy consumer is in any case the excluded
 * calculated property `eligibleFulfillmentMethods` [model/entity/Sku.cfc:L449-L455], so no in-scope
 * caller is left without a value it previously had.
 */
export const SEEDED_SKU_ELIGIBLE_FULFILLMENT_METHODS: {
  readonly [Code in BaseProductType]: SeededProductTypeScopedSetting;
} = Object.freeze({
  /**
   * config/dbdata/SlatwallSetting.xml.cfm:L14 — scoped to the `merchandise` product type
   * [config/dbdata/SlatwallProductType.xml.cfm:L13], resolving to `Shipping`
   * [config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L10].
   */
  merchandise: Object.freeze({
    productTypeID: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.productTypeID,
    settingValue: '444df2fb93d5fa960ba2966ba2017953',
  }),
  /**
   * config/dbdata/SlatwallSetting.xml.cfm:L15 — scoped to the `subscription` product type
   * [config/dbdata/SlatwallProductType.xml.cfm:L14], resolving to `Auto`
   * [config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L11].
   */
  subscription: Object.freeze({
    productTypeID: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.productTypeID,
    settingValue: '444df2ffeca081dc22f69c807d2bd8fe',
  }),
  /**
   * config/dbdata/SlatwallSetting.xml.cfm:L16 — scoped to the `contentAccess` product type
   * [config/dbdata/SlatwallProductType.xml.cfm:L15], resolving to `Auto` — the SAME value as
   * `subscription` above, exactly as seeded [config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L11].
   */
  contentAccess: Object.freeze({
    productTypeID: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.productTypeID,
    settingValue: '444df2ffeca081dc22f69c807d2bd8fe',
  }),
});

/**
 * Narrows a port-declared name to one this module answers from {@link METADATA_DEFAULTS}.
 *
 * `Object.hasOwn` is used rather than the `in` operator on purpose: `in` also walks the prototype
 * chain, so it would report inherited members such as `'toString'` as matches and quietly widen the
 * guard. The same choice is made in `src/domain/BaseProductType.ts` for the same reason.
 *
 * The predicate is derived from the table's own keys, so guard and data cannot drift apart.
 */
function isMetadataDefaultedSettingName(
  settingName: SettingName,
): settingName is MetadataDefaultedSettingName {
  return Object.hasOwn(METADATA_DEFAULTS, settingName);
}

/**
 * Narrows an interpolated name to one of the six that has a declared default.
 *
 * This is where `noUncheckedIndexedAccess` earns its place rather than being worked around: the
 * port's name type is a template literal with an open size segment, so membership of the six
 * declared names is a run-time question, and the guard is what turns an unrecognised size into an
 * explicit, flagged gap instead of a silent `undefined`.
 */
function isDeclaredProductImageDimensionSettingName(
  settingName: SettingName,
): settingName is DeclaredProductImageDimensionSettingName {
  return Object.hasOwn(PRODUCT_IMAGE_DIMENSION_DEFAULTS, settingName);
}

/**
 * Renders the resolution context for a diagnostic message.
 *
 * The context is otherwise unused when resolving, and provably so: seventeen of the eighteen names
 * have no seeded row at any scope, so no override can fire and the metadata default assigned at
 * model/service/SettingService.cfc:L481-L486 is what the engine returns regardless of the receiver
 * (see THE RESOLUTION ORDER above). Reporting it when a name cannot be answered is what makes a
 * flagged gap actionable — the caller can see which receiver asked.
 */
function describeResolutionContext(context: SettingResolutionContext | undefined): string {
  if (context === undefined) {
    return 'no resolution context';
  }
  return `${context.entityName} ${context.entityId}`;
}

/**
 * The static setting-resolution adapter: the in-scope implementation of {@link SettingResolverPort}.
 *
 * Construction is deliberately trivial — `new StaticSettingResolver()` — because the class holds no
 * state, needs no collaborator and performs no input/output. Any collaborator it might one day need
 * would arrive as a typed constructor parameter wired once in `src/config/container.ts`
 * (AAP §0.7.3 S3); it imports no container, exposes no singleton and has no default export, so
 * there is no service-locator path into it.
 *
 * DI/1 registers services and DAOs as singletons and entities as transients
 * [org/Hibachi/Hibachi.cfc:L289 onward]. The target container honours that distinction, so a single
 * instance of this class may be shared across warm invocations — which is safe precisely because it
 * is stateless and its tables are frozen (M7).
 *
 * @example
 * ```ts
 * const settings: SettingResolverPort = new StaticSettingResolver();
 *
 * // A global-prefixed name needs no receiver — the form used at
 * // model/service/ProductService.cfc:L200, L201 and L240.
 * settings.setting('globalURLKeyProduct'); // -> 'sp'
 *
 * // A Sku reading an image dimension resolves against its PRODUCT, not itself, mirroring
 * // getProduct().setting(...) at model/entity/Sku.cfc:L184.
 * settings.setting('productImageMediumWidth', { entityName: 'Product', entityId: productId });
 *
 * // Consumers wanting the callable `SettingResolver` form wrap the bound call in an arrow:
 * const resolve = (name: SettingName, context?: SettingResolutionContext) =>
 *   settings.setting(name, context);
 * ```
 */
export class StaticSettingResolver implements SettingResolverPort {
  /**
   * Resolves the effective value of one of the eighteen names the Catalog slice reads.
   *
   * Synchronous, by the decision recorded under M8 above: a plain value, never a promise.
   *
   * The order of the three steps below mirrors the legacy engine's own order rather than being an
   * implementation convenience — the metadata default is the BASE value
   * [model/service/SettingService.cfc:L481-L486], applied before any row lookup, and the only name
   * with rows to override it is the one this adapter declines. The two families never overlap: no
   * literal name matches `productImage<size>Width` or `productImage<size>Height`, and
   * `productImageOptionCodeDelimiter` and `productImageDefaultExtension` share the prefix but
   * neither suffix.
   *
   * @param settingName One of the port's eighteen names. Closed on purpose, so a typo or an
   *   out-of-slice name is a compile error rather than a silent run-time miss.
   * @param context The object being resolved against — the port's stand-in for the legacy
   *   `object=this` argument [model/entity/HibachiEntity.cfc:L130]. Optional exactly as the port
   *   declares it, and accepted as absent for the no-receiver form the slice really uses
   *   [model/service/ProductService.cfc:L200]. It cannot change any value this adapter returns, for
   *   the reason given under THE RESOLUTION ORDER, and is reported in the diagnostics below.
   * @returns The resolved value in the port's normalised text shape.
   * @throws {Error} When the requested name has no locator-backed static answer: the three names
   *   whose only declared default is COMPUTED from an out-of-scope collaborator, and any
   *   interpolated name whose size segment has no declaration. Failing loudly with the locator is
   *   deliberate — AAP §0.7.3 S9 forbids inventing a value, and a fabricated default here would be
   *   indistinguishable at the call site from a real one. A plain `Error` is raised rather than a
   *   `src/errors/**` type because this folder's hexagonal import discipline (S4) confines it to its
   *   own port and the seeded domain data, and because an unanswerable name is a wiring fault to be
   *   surfaced to a developer, not a domain outcome to be handled.
   */
  public setting(settingName: SettingName, context?: SettingResolutionContext): SettingValue {
    if (isMetadataDefaultedSettingName(settingName)) {
      return METADATA_DEFAULTS[settingName];
    }

    if (isDeclaredProductImageDimensionSettingName(settingName)) {
      return PRODUCT_IMAGE_DIMENSION_DEFAULTS[settingName];
    }

    switch (settingName) {
      case 'productDisplayTemplate':
        // Locator-backed, not fabricated: no `defaultValue` is declared
        // [model/service/SettingService.cfc:L190] and the engine's initialised empty string
        // [L474] therefore survives the default test at [L481]. See the constant's own note.
        return PRODUCT_DISPLAY_TEMPLATE_UNRESOLVED_VALUE;

      case 'globalAssetsImageFolderPath':
        // TODO(boundary): the only declared default is COMPUTED at
        // model/service/SettingService.cfc:L164 as
        // `getApplicationValue('applicationRootMappingPath') & '/custom/assets/images'`, reading the
        // CFML application scope of a running ColdFusion or Railo server. There is no static
        // equivalent, and no plausible substitute is supplied — not an empty string, and above all
        // not a hard-coded path, which would look authoritative while being wrong on every
        // deployment (AAP §0.7.3 S9). The in-scope readers are
        // model/entity/Product.cfc:L224 and model/entity/Option.cfc:L82, both of which wrap the
        // result in `getURLFromPath` [org/Hibachi/HibachiObject.cfc:L83-L91]; a deployment that
        // needs them supplies a different implementation of this same port.
        throw new Error(
          `Setting 'globalAssetsImageFolderPath' has no static answer: its only declared default is` +
            ` computed at model/service/SettingService.cfc:L164 from the CFML application scope,` +
            ` which this input/output-free adapter cannot read (requested for` +
            ` ${describeResolutionContext(context)}).`,
        );

      case 'skuEligibleCurrencies':
        // TODO(boundary): the only declared default is COMPUTED at
        // model/service/SettingService.cfc:L222 as
        // `getCurrencyService().getAllActiveCurrencyIDList()`. `currencyService` is out of scope —
        // AAP §0.2.2.1 excludes the `Currency*` family, two files — and reaching it would require a
        // database read that M8 bars. The in-scope readers are model/entity/Sku.cfc:L373 and L375,
        // inside the excluded calculated property `currencyDetails` (AAP §0.2.2.6). No substitute
        // is invented: not an empty string, not an empty list, and not `'USD'` borrowed from the
        // distinct `skuCurrency` default at model/service/SettingService.cfc:L221.
        throw new Error(
          `Setting 'skuEligibleCurrencies' has no static answer: its only declared default is` +
            ` computed at model/service/SettingService.cfc:L222 by the out-of-scope currencyService` +
            ` (requested for ${describeResolutionContext(context)}).`,
        );

      case 'skuEligibleFulfillmentMethods':
        // TODO(boundary): this is the ONE name of the eighteen with seeded rows, and it still cannot
        // be answered through this member. Two independent reasons, both source-backed:
        //   (a) its declared default is COMPUTED at model/service/SettingService.cfc:L223 by
        //       `getFulfillmentService().getAllActiveFulfillmentMethodIDList()`, and the
        //       `Fulfillment*` family — two files — is excluded by AAP §0.2.2.1;
        //   (b) the three seeded rows are scoped by `productTypeID`
        //       [config/dbdata/SlatwallSetting.xml.cfm:L14-L16], while the port's resolution context
        //       carries an entity kind and entity ID only
        //       [src/ports/SettingResolverPort.ts:L380-L389]. Mapping a Product, Sku or Option
        //       identifier to its product type means walking
        //       model/service/SettingService.cfc:L534-L591 against the database, which M8 bars.
        // The seeded answers themselves are preserved verbatim and remain readable, by base product
        // type, from SEEDED_SKU_ELIGIBLE_FULFILLMENT_METHODS above. The legacy consumer is the
        // excluded calculated property `eligibleFulfillmentMethods`
        // [model/entity/Sku.cfc:L449-L455], so nothing in scope loses a value it had.
        throw new Error(
          `Setting 'skuEligibleFulfillmentMethods' has no static answer: its declared default is` +
            ` computed at model/service/SettingService.cfc:L223 by the out-of-scope` +
            ` fulfillmentService, and its three seeded rows are scoped by productTypeID` +
            ` (config/dbdata/SlatwallSetting.xml.cfm:L14-L16), which a resolution context of` +
            ` ${describeResolutionContext(context)} cannot select among. The seeded values are` +
            ` exposed as SEEDED_SKU_ELIGIBLE_FULFILLMENT_METHODS.`,
        );

      default:
        // TODO(parity): an interpolated name whose size segment is not one of the three declared
        // sizes. This is reachable in the legacy source, which is exactly why the port leaves the
        // segment open: `getResizedImage` lower-cases the incoming size
        // [model/entity/Sku.cfc:L171, L174] and then maps only "l", "m" and "s"
        // [model/entity/Sku.cfc:L177-L183] with NO final `else`, so an unmapped size reaches
        // model/entity/Sku.cfc:L184-L185 unchanged and asks for a name that was never declared. Its
        // sibling `getResizedImagePath` [model/entity/Sku.cfc:L203-L215] DOES have a final `else`
        // mapping everything to "Small", so the same input yields two different names depending on
        // which method was called. Closing the size segment to the three declared sizes would make
        // the first method's behaviour unrepresentable — a behaviour change forbidden by the Minimal
        // Change Clause (AAP §0.8.1) — so the divergence is carried and flagged here instead.
        // Declared defaults exist for Small, Medium and Large only
        // [model/service/SettingService.cfc:L261-L266]; any other segment has no locator-backed
        // default anywhere in the legacy source, so it is reported as the declared gap it is rather
        // than defaulted to a size the caller did not ask for.
        throw new Error(
          `Setting '${settingName}' has no static answer: image dimensions are declared only for` +
            ` the Small, Medium and Large sizes (model/service/SettingService.cfc:L261-L266), and` +
            ` an unmapped size segment reaches model/entity/Sku.cfc:L184-L185 unchanged (requested` +
            ` for ${describeResolutionContext(context)}).`,
        );
    }
  }
}
