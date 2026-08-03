/**
 * productHandler — the AWS boundary for the extracted Catalog Product surface.
 *
 * Authority: AAP §0.4.1.9 row 2 — "`slatwall-ts/src/handlers/productHandler.ts` | CREATE |
 * `model/service/ProductService.cfc` | Exposes the product surface; **M1** flagged for the importer
 * entry point." §0.3.1's tree states the same thing more briefly: `productHandler.ts <- ProductService
 * public surface`. The member surface is fixed by AAP §0.4.2.1 (the fifteen declared members) and
 * AAP §0.4.2.5 (the three synthesized members the slice actually uses).
 *
 * WHAT THIS FILE IS
 * -----------------
 * Each routed member below narrows the proxy event, calls ONE service member, and shapes the outcome
 * through ./httpResponse (AAP §0.3.2, quoting AWS's own reference layout: "the handler responsible
 * only for translating AWS-specific input into domain calls"). There is no query, no combination
 * enumeration, no validation rule, no field mapping and no SQL anywhere in this file, because every
 * one of those belongs to a layer beneath it.
 *
 * It is a THIN, INJECTABLE FUNCTION OF THE SERVICE AND TWO COLLABORATORS: {@link createProductHandler}
 * takes the product service, an authorisation resolver and a transactional write runner, and returns
 * the eighteen routed operations. Nothing is constructed by {@link createProductHandler}, nothing is
 * resolved by name, and everything above the LAMBDA ENTRY POINT section at the foot of this file is a pure
 * function of what it was handed — which is what makes it assertable with hand-written doubles, without a
 * database, a network call or an AWS runtime (AAP §0.7.3 S6).
 *
 * That entry section is the one place ../config/container is reached, through a DYNAMIC import evaluated
 * on first invocation, because the bundle built from this file has to carry a `handler` the runtime can
 * address. Module LOAD still touches no configuration and opens no pool; the reasoning is recorded at the
 * section itself. src/handlers/router.ts reaches the same composition root for the aggregate surface.
 *
 * ⚠️ THE SERVICE FILE IS WHAT THIS BOUNDARY IS COMPILED AGAINST; THE PLAN IS WHAT BOTH ANSWER TO
 * -----------------------------------------------------------------------------------------------
 * Every signature this handler calls was read from ../services/ProductService rather than from a table,
 * and {@link ProductHandlerService} is checked against the real class by the compiler so the seam and the
 * service cannot drift. That is a drift guard, NOT a precedence rule: AAP §0.4.2.1's target column is
 * frozen and the service is aligned TO it (§0.1.2.1, D1 precedence 1). An earlier version of this
 * paragraph claimed "where the plan and the file disagree, the file wins", on the strength of three of
 * that file's return types having been corrected against the plan's prose; that claim is WITHDRAWN, and
 * the formatted-option-groups shape it chiefly rested on now matches the plan's array. Defect D25 is
 * still live and still recorded on the service member, but it names a LEGACY-versus-PORT divergence — the
 * CFML body builds a name-keyed struct — rather than a port-versus-plan one. Nothing here "corrects" the
 * service (AAP §0.8.2 Guideline 4), and nothing here reinterprets the plan.
 *
 * EIGHTEEN ROUTED MEMBERS, AND THE COUNT IS DERIVED RATHER THAN CHOSEN
 * -------------------------------------------------------------------
 * model/service/ProductService.cfc declares FIFTEEN public functions across 367 lines, and the port adds
 * exactly three more that the legacy fabricated at run time (IR-1). Both the injected SERVICE seam
 * {@link ProductHandlerService} and the ROUTED surface {@link ProductHandler} are therefore eighteen
 * members — and that is the one place this file departs from the adjudication ./brandHandler and
 * ./skuHandler reached for their own factories, so the departure is argued from evidence rather than
 * asserted:
 *   - ./brandHandler withholds `newBrand` from routing because `admin/views/entity/` contains
 *     `detailbrand.cfm` and `listbrand.cfm` and NO `createbrand.cfm`; ./skuHandler withholds `newSku`
 *     because that directory contains `detailsku.cfm` and `listsku.cfm` and NO `createsku.cfm`. In both
 *     cases no legacy admin action rendered a new-entity form, so a factory route would have been an
 *     invented one (AAP §0.7.3 S9).
 *   - ⭐ FOR THIS ENTITY THE EVIDENCE POINTS THE OTHER WAY: `admin/views/entity/createproduct.cfm`
 *     EXISTS. A legacy `createProduct` item therefore existed, and the ladder resolves its `create`
 *     prefix to a `create` question on `Product` — the entity-controller test at
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L52] followed by the `left(itemName, 6) == "create"`
 *     branch at [:L53]. `newProduct()` is what supplies the entity that item edits:
 *     [model/transient/HibachiScope.cfc:L114-L118] lazily builds the request's working product with
 *     `getService("productService").newProduct()` at [:L116]. ⚠️ THAT LOCATOR IS THE **LOCAL** TRANSIENT
 *     SCOPE, NOT `org/Hibachi/HibachiScope.cfc` — the framework file's nearest equivalent is the generic
 *     `newEntity(entityName)` at [org/Hibachi/HibachiScope.cfc:L89-L92], which dispatches
 *     `new#entityName#` through the same synthesis. The distinction is IR-8's, and conflating the two
 *     would cite framework code for a decision the Slatwall tree actually makes.
 *     Routing it is parity; withholding it would drop an
 *     operation the legacy exposed. The same test is applied and FAILS for the product type — there is
 *     `detailproducttype.cfm` and `listproducttype.cfm` but NO `createproducttype.cfm` — which is
 *     consistent with ../services/ProductService declaring no `newProductType` member at all, and is why
 *     `saveProductType` below requires an addressed identifier.
 *
 * ⛔ AND THE RESTRAINT STOPS THERE (AAP §0.4.2.5: "synthesis is not reproduced wholesale, only where
 * used"). There is deliberately no `countProduct*`, no `listProduct*`, no `exportProduct*`, no
 * `newProductType`, no `deleteProductType` and no `getProductTypeSmartList`, even though
 * org/Hibachi/HibachiService.cfc:L255-L281 would have fabricated every one of them on demand. The slice
 * calls none of them, and adding one because the dispatcher COULD have produced it is precisely the
 * enhancement AAP §0.8.2 Guideline 4 forbids. The private `buildSkuCombinations`
 * [model/service/ProductService.cfc:L82-L97] gets no member and no route either — see judgment (b).
 *
 * EVERY ROUTED MEMBER IS AUTHORISED BEFORE IT DOES ANYTHING
 * --------------------------------------------------------
 * The legacy authorised every request in one place, before any controller method ran —
 * `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203], refusing at [:L188]. That gate is framework code
 * and does not cross the boundary (AAP §0.8.3.2), so its CONTRACT is declared as a port instead and
 * consulted here. Restoring it is PARITY, not invented policy; the only thing that changes is the
 * failure mode, from a browser redirect to a status code. {@link PRODUCT_ACCESS_MATRIX} carries the
 * per-row evidence.
 *
 * EVERY WRITE RUNS INSIDE ONE TRANSACTION, AND THE GATE IS THE COMPLETE PREDICATE
 * ------------------------------------------------------------------------------
 * The legacy committed implicitly at request end, and only when the ORM session carried no errors
 * (AAP §0.6.6 M5). A stateless handler has no request-end hook, so the boundary is made explicit:
 * eleven of the eighteen routes run their work through the injected
 * ../ports/TransactionalWritePort runner, which builds a TRANSACTION-SCOPED service graph and commits or
 * rolls back on one gate. Judgments (k), (l) and (m) record why the graph must be built inside the
 * transaction rather than captured, why the gate must read the SKUs as well as the product, and why
 * `loadDataFromFile` is the one write that is deliberately NOT wrapped.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP §0.8.2 Guideline 6)
 * -----------------------------------------------------------------
 * (a) ⚠️⚠️ **M1 — THE MOST SEVERE EXECUTION-MODEL MISMATCH IN THE SLICE.** Recorded in full on
 *     {@link createProductHandler}'s `loadDataFromFile` route, with the source value, its locator, the
 *     published platform limit it cannot fit inside, and the compounding mismatches M3 and M4. Nothing
 *     is re-timed, capped, chunked or queued here; the resolution is left as a declared decision.
 *
 * (b) **D15 — THE PRIVATE DEAD METHOD IS NOT PORTED, AND THAT IS A DECISION.**
 *     `private any function buildSkuCombinations(Array storage, numeric position, any data, String
 *     currentOption)` is declared at [model/service/ProductService.cfc:L82] with its body at [:L82-L97].
 *     AAP §0.6.7.3 records it as "private and only **self-recursive** — unreachable dead code". No
 *     member and no route exists for it here, and ../services/ProductService omits it for the same
 *     reason. Resurrecting it would add behavior the legacy system does not have, which Guideline 4
 *     forbids. TODO(parity) D15 — carried as an omission, not an oversight.
 *
 * (c) **THE `processProduct_xxx` → `processProductXxx` RENAMING.** AAP §0.8.1 classifies this as IDIOM
 *     rather than behavior, and §0.4.2.1 authorises it; Guideline 6 requires that each legacy identifier
 *     be named so parity stays checkable. Every one of the eight is named verbatim on its own route, and
 *     the mapping is also stated once here:
 *       `processProductAddOptionGroup`              was `processProduct_addOptionGroup`              [:L113]
 *       `processProductAddOption`                   was `processProduct_addOption`                   [:L128]
 *       `processProductAddProductReview`            was `processProduct_addProductReview`            [:L157]
 *       `processProductAddSubscriptionTerm`         was `processProduct_addSubscriptionTerm`         [:L173]
 *       `processProductDeleteDefaultImage`          was `processProduct_deleteDefaultImage`          [:L198]
 *       `processProductUpdateDefaultImageFileNames` was `processProduct_updateDefaultImageFileNames` [:L208]
 *       `processProductUpdateSkus`                  was `processProduct_updateSkus`                  [:L216]
 *       `processProductUploadDefaultImage`          was `processProduct_uploadDefaultImage`          [:L235]
 *     Only the identifier changes. The arity, the argument order and the observable behavior of each are
 *     preserved (TR-1).
 *
 * (d) ⚠️ **T5 — AN EMPTY `selectedOptions` IS A LEGAL, MEANINGFUL INPUT.** Recorded on the
 *     `getProductSkusBySelectedOptions` route, which is the prompt's own worked example (AAP §0.8.3.1)
 *     and the "option-to-SKU resolution edge case" Guideline 6 names by name. It is not rejected, not
 *     defaulted, not normalised and not guarded against, anywhere on this path.
 *
 * (e) **DISCREPANCY 1 — `currentURL` HAD NO DECLARED CFML TYPE.** [model/service/ProductService.cfc:L342]
 *     declares `getProductSmartList(struct data={}, currentURL="")` — `currentURL=""` with NO type
 *     keyword at all, unlike the `struct` on its neighbour. AAP §0.4.2.1 records the tightening to an
 *     optional string. The arity and order are kept (`data` first, `currentURL` second, both optional),
 *     and the route's own note records why the second argument is not supplied.
 *
 * (f) **TR-5 — THE BOUNDARY-STUBBED MEMBERS ARE FLAGGED, NEVER DROPPED.** Six members depend on
 *     collaborators outside the slice. Every one remains PRESENT and ROUTABLE, and each route names the
 *     out-of-scope collaborator responsible: the importer's out-of-band model (`loadDataFromFile`), the
 *     product-review entity and account context (`processProductAddProductReview`),
 *     `SubscriptionTermPort` (`processProductAddSubscriptionTerm`), image handling
 *     (`processProductDeleteDefaultImage`, `processProductUpdateDefaultImageFileNames`) and the temp
 *     directory and tag service (`processProductUploadDefaultImage`). TR-5, verbatim: "The member is
 *     never quietly dropped from the interface."
 *
 * (g) **D6 — CARRIED, NOT REPAIRED.** [model/service/ProductService.cfc:L180-L181] guards on
 *     `arguments.processObject.getListPrice()` and then assigns from `arguments.data.listPrice`, but
 *     `processProduct_addSubscriptionTerm(product, processObject)` declares no `data` argument, so the
 *     assignment reads an undefined scope at run time. ../services/ProductService raises at exactly that
 *     point with the defect named. ⛔ NO THIRD ARGUMENT IS ADDED HERE TO MAKE IT WORK, and the route
 *     does not route around it. TODO(parity) D6.
 *
 * (h) **AN ABSENT `required` ARGUMENT IS ANSWERED HERE; AN ABSENT OPTIONAL ONE IS FORWARDED.** Where the
 *     legacy declares `required`, this boundary answers the absence with a bad request rather than
 *     calling the service with nothing. Where the legacy declares an optional argument or a default,
 *     absence is forwarded as absence and the layer that owns the constraint decides. That keeps the two
 *     arities honest instead of hardening one of them here.
 *
 * (i) **THE PAYLOAD IS FORWARDED AS PARSED.** Every `data` and process-object payload reaches the
 *     service NOT re-keyed, NOT sorted, NOT case-folded, NOT trimmed, NOT filtered, NOT defaulted and
 *     NOT deep-copied. AAP §0.6.7.8 is the reason: `saveProduct` and `processProductAddOption` both
 *     reach `SkuService.createSkus`, whose odometer enumerates option combinations in an order derived
 *     from the payload, and that order "determines both the generated SKU set and … the order in which
 *     uniqueness validation observes its siblings" through the read-back loop AAP §0.6.2 calls "the
 *     single most dangerous thing in the slice". A reshaping here would change what is created WITH NO
 *     ERROR AND NO COMPILE FAILURE.
 *
 * (j) **EVERY ENTITY IS PROJECTED, NEVER SERIALISED WHOLE.** `Product` carries eleven relationship
 *     collections into explicitly excluded domains — promotions, price groups, vendors, physicals,
 *     categories and listing pages among them — and `ProductType` carries nine more. Projection is the
 *     mechanism that keeps §0.2.2's boundary from leaking through a response body, and each projection
 *     is built by NAMING members rather than by removing them, so a future field stays out until
 *     somebody decides otherwise here.
 *
 * (k) **THE TRANSACTION-SCOPED GRAPH IS BUILT INSIDE THE TRANSACTION, NEVER CAPTURED.** A service holds
 *     its repository and a repository holds its executor FROM CONSTRUCTION, so calling the captured
 *     service inside a transaction would run its statements on a DIFFERENT connection — the writes would
 *     succeed, sit outside the unit, and survive a roll-back, with nothing reporting a problem. Every
 *     write route below therefore reads its entity AND performs its work through the `graph` the runner
 *     hands it, and touches the captured service on no write path.
 *
 * (l) ⛔ **THE COMMIT GATE READS THE SKUs AS WELL AS THE PRODUCT.** ../services/SkuService explicitly
 *     forbids merging per-SKU rule findings onto the product, and `createSkus` returns `true`
 *     unconditionally [model/service/SkuService.cfc:L207]. So for the commonest failure there is —
 *     colliding SKU codes — the product's own bag is EMPTY and the return value says success. Nine of
 *     the eleven write routes reach a product graph and gate on `skuBatchHasErrors`, which reads both;
 *     `saveProductType` gates on the product type's own bag because no SKU is in play. Verified per
 *     member rather than assumed: `saveProduct` [:L279] and `processProductAddOption` [:L150] are the
 *     two that reach `createSkus` directly, and they are the two for which a product-only gate would
 *     demonstrably commit an invalid batch.
 *
 * (m) **`loadDataFromFile` IS THE ONE WRITE THAT IS NOT WRAPPED, AND THAT IS MISMATCH M3 BEING
 *     PRESERVED RATHER THAN IGNORED.** [model/dao/ProductDAO.cfc:L177] opens `transaction{` INSIDE the
 *     record loop, so the legacy importer commits ONE TRANSACTION PER ROW. AAP §0.6.6 is explicit that
 *     `UnitOfWork` "must reproduce per-row commit boundaries rather than wrapping the whole import".
 *     Wrapping it here would convert eleven-thousand small commits into one enormous one and would
 *     change what a mid-file failure leaves behind. The per-row boundary belongs to the repository, and
 *     {@link ProductWriteGraph} deliberately does not expose this member, so the compiler prevents it
 *     being called from inside the transaction by accident.
 *
 * (n) **A `boolean` RESULT IS REPORTED, NOT REINTERPRETED.** `deleteProduct` answers a boolean
 *     [model/service/ProductService.cfc:L317], and it is serialised as the boolean it is: not translated
 *     into a status code, not inverted, and not wrapped in an invented envelope.
 *
 * ⛔ WHAT THIS FILE INVENTS: NOTHING (AAP §0.7.3 S9, IR-12). No SLA, latency target, throughput figure,
 * uptime target, capacity number, timeout, page size, chunk size, batch size, retry count, backoff
 * schedule, rate limit, concurrency limit or cache TTL appears anywhere in it. THE ONLY NUMBERS PRESENT
 * ARE: the source-declared 3600 with its locator, the published AWS Lambda 15-minute maximum cited as a
 * platform limit, and HTTP status codes read from ./httpResponse. There is no health endpoint, no
 * readiness endpoint, no metrics endpoint and no invented route. The legacy 60s/45s session locks in
 * `OrderService`/`PaymentService` are noted by AAP §0.8.3.5 and deliberately NOT implemented: those
 * services are out of scope and no session-locking mechanism exists in the target design.
 *
 * ⛔ WHAT THIS FILE HOLDS: NO MODULE-SCOPE MUTABLE STATE. Every module-level binding below is a frozen
 * constant or a pure function. AAP §0.6.6 M7 requires exactly that of everything outside the connection
 * pool, because a warm Lambda container is shared across invocations and therefore potentially across
 * tenants.
 */

import type { CatalogContainer } from '../config/container';
import type { Product } from '../domain/product/Product';
import type { ProductType } from '../domain/product/ProductType';
import type { ProductAddOption } from '../domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../domain/process/ProductAddOptionGroup';
import type { ProductUpdateSkus } from '../domain/process/ProductUpdateSkus';
import type { Sku } from '../domain/sku/Sku';
import type { ExactDecimal } from '../util/formatting';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  RequestAuthorizationContext,
  RequestAuthorizationResolver,
} from '../ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../ports/TransactionalWritePort';
import type { SelectOption } from '../services/OptionService';
import type {
  FormattedOptionGroup,
  ProductService,
  ProductTypeWithErrorState,
} from '../services/ProductService';
/*
 * ⭐ THE ONE VALUE IMPORT FROM A SIBLING SERVICE, AND IT IS THE COMMIT GATE.
 *
 * `skuBatchHasErrors` is declared in ../services/SkuService rather than here because the reason a
 * product-only gate is insufficient lives there: that file records why per-SKU rule findings must NOT be
 * merged onto the product, and the predicate is the companion of that decision. Re-declaring it here
 * would give the subtree two gates that could silently drift apart, and the one that drifted would commit
 * invalid batches. The services layer is the layer this handler is allowed to call (AAP §0.7.3 S4); no
 * adapter, no validation module and no configuration module is imported anywhere in this file.
 */
import { skuBatchHasErrors } from '../services/SkuService';
import type { ProductWithErrorState } from '../services/SkuService';

import {
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  messageResponse,
  notFoundResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  readSmartListInput,
  resolveFailClosedAuthorization,
  unauthorizedResponse,
  createActionDispatcher,
  HTTP_STATUS,
  type ActionRoute,
  type ActionRouteTable,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
} from './httpResponse';

/* ================================================================================================
 * REQUEST PARAMETER NAMES
 *
 * Declared once each, so a route and the bad-request text that describes it cannot drift apart. Each
 * name is the legacy property name it addresses, unchanged: the legacy admin URLs carried
 * `productID` and `productTypeID` exactly, and renaming either at this boundary would break the
 * method-by-method checkability AAP §0.8.3.1 asks for.
 * ============================================================================================== */

/** The addressed product's primary identifier — `model/entity/Product.cfc:L52`. */
const PRODUCT_ID_PATH_PARAMETER = 'productID';

/** The addressed product type's primary identifier — `model/entity/ProductType.cfc:L52`. */
const PRODUCT_TYPE_ID_PATH_PARAMETER = 'productTypeID';

/**
 * The selected option identifiers, as the legacy's own delimited list.
 *
 * ⚠️ A QUERY PARAMETER RATHER THAN A PATH SEGMENT, AND THE REASON IS T5. An empty selection is a LEGAL,
 * MEANINGFUL input (judgment (d)), and a path segment cannot express "supplied but empty" — a route
 * template either binds a non-empty segment or does not match at all. A query parameter can, which is
 * what keeps the degenerate form reachable through this boundary exactly as it is reachable from
 * [model/entity/Product.cfc:L367].
 */
const SELECTED_OPTIONS_QUERY_PARAMETER = 'selectedOptions';

/**
 * The importer's source location — `model/service/ProductService.cfc:L65` argument 1, `required`.
 *
 * A query parameter, not a body member, because the legacy declares it a `required string` positional
 * argument rather than part of a populated struct, and because the member takes no `data` payload at all.
 */
const FILE_URL_QUERY_PARAMETER = 'fileURL';

/**
 * The importer's text qualifier — `model/service/ProductService.cfc:L65` argument 2, optional with a
 * default of the empty string.
 *
 * ⚠️ ABSENCE IS FORWARDED AS ABSENCE (judgment (h)), so the SERVICE's own default applies rather than one
 * restated here. An empty string supplied explicitly is a VALUE and is forwarded as one: the legacy
 * default is that same empty string, so the two are indistinguishable to the DAO, and collapsing them
 * here would still be a second declaration of the same default.
 */
const TEXT_QUALIFIER_QUERY_PARAMETER = 'textQualifier';

/* ================================================================================================
 * SENTINELS AND ENTITY NAMES
 * ============================================================================================== */

/**
 * The identifier value that identifies nothing.
 *
 * The legacy `unsavedvalue=""` declared on both primary keys — [model/entity/Product.cfc:L52] and
 * [model/entity/ProductType.cfc:L52] — which is why an addressed empty identifier is reported as ABSENCE
 * rather than looked up: it can never match a persisted row, and treating it as a value would turn a
 * malformed request into a guaranteed miss.
 */
const UNSAVED_IDENTIFIER = '';

/**
 * The entity name the authorisation gate asks about for product operations.
 *
 * `'Product'` is the legacy entity name the ladder derives from an item name, not a coined string:
 * [org/Hibachi/HibachiAuthenticationService.cfc:L52] takes `right(itemName, len(itemName)-6)` of
 * `createProduct`, and [:L75] takes `right(itemName, len(itemName)-4)` of `saveProduct`. Both yield
 * exactly this.
 */
const PRODUCT_ENTITY_NAME = 'Product';

/**
 * The entity name the gate asks about for product-type operations.
 *
 * Derived the same way, from `detailProductType` [:L54] and `saveProductType` [:L75].
 */
const PRODUCT_TYPE_ENTITY_NAME = 'ProductType';

/**
 * The entity name the gate asks about for the one member that reads SKUs.
 *
 * `getProductSkusBySelectedOptions` returns SKUs, and the legacy ladder names the entity being addressed
 * rather than the service that owns the member. Recorded on
 * {@link SECURE_SKU_READ_REQUIREMENT}.
 */
const SKU_ENTITY_NAME = 'Sku';

/*
 * ⚠️ THERE IS DELIBERATELY NO LIST-DELIMITER CONSTANT IN THIS FILE.
 *
 * The selected-option list is a CFML list, and `listLen()` and `listToArray()` default to a COMMA — but
 * naming that delimiter here as a constant would imply this boundary applies it, and it does not.
 * [model/entity/Product.cfc:L367] passes the raw list through untouched, the legacy signature at
 * [model/service/ProductService.cfc:L104] declares a single `required string`, and
 * ../services/ProductService is where the comma-separated list is split. The list therefore crosses this
 * boundary as the one string it is declared to be; see {@link readSelectedOptions}, where the T5
 * consequences of that are recorded.
 */

/* ================================================================================================
 * ⛔ THE SMART-LIST DATA VOCABULARY IS NOT DECLARED HERE.
 *
 * `SMART_LIST_NAMED_KEYS` and `SMART_LIST_KEY_PREFIXES` — the exact-name and prefixed key sets
 * `org/Hibachi/HibachiSmartList.cfc`'s `applyData` [:L85-L136] acted on — stood here as byte-identical
 * copies of the pair in `./httpResponse.ts`, serving a reader this file also declared twice. Both they
 * and that reader are gone; the record of what was removed and why is with the reader's own removal
 * note, further down this file.
 * ============================================================================================== */

/* ================================================================================================
 * PROCESS-OBJECT PAYLOAD KEYS
 *
 * The data-property names the three TYPED process objects declare, read from the process components
 * themselves rather than invented. Each is the exact legacy property name, so a payload that worked
 * against the legacy admin form works against this boundary unchanged.
 * ============================================================================================== */

/** `model/process/Product_AddOptionGroup.cfc:L55` — the option group IDENTIFIER, a string. */
const OPTION_GROUP_DATA_KEY = 'optionGroup';

/** `model/process/Product_AddOption.cfc:L55` — the option IDENTIFIER, a string. */
const OPTION_DATA_KEY = 'option';

/** `model/process/Product_UpdateSkus.cfc:L55` — the first of two interleaved flag-and-value pairs. */
const UPDATE_PRICE_FLAG_DATA_KEY = 'updatePriceFlag';

/** `model/process/Product_UpdateSkus.cfc:L56`, resource-bundle key `entity.sku.price`. */
const PRICE_DATA_KEY = 'price';

/** `model/process/Product_UpdateSkus.cfc:L57` — the second flag, gating its own condition independently. */
const UPDATE_LIST_PRICE_FLAG_DATA_KEY = 'updateListPriceFlag';

/** `model/process/Product_UpdateSkus.cfc:L58`, resource-bundle key `entity.sku.listPrice`. */
const LIST_PRICE_DATA_KEY = 'listPrice';

/* ================================================================================================
 * BAD-REQUEST TEXTS
 *
 * Each names the input it is about and nothing else — no route, no identifier, no collaborator, no
 * internal detail — following the disclosure rules ./httpResponse sets for this layer. They are
 * module-private because the legacy system has no counterpart for any of them, so none carries a parity
 * obligation: assert on the status code, never on these strings.
 *
 * Each is composed from the parameter-name constant above rather than repeating the literal, so a text
 * cannot drift away from the name it describes.
 * ============================================================================================== */

const PRODUCT_ID_REQUIRED_MESSAGE = `A "${PRODUCT_ID_PATH_PARAMETER}" path parameter is required`;

const PRODUCT_TYPE_ID_REQUIRED_MESSAGE = `A "${PRODUCT_TYPE_ID_PATH_PARAMETER}" path parameter is required`;

const SELECTED_OPTIONS_REQUIRED_MESSAGE = `A "${SELECTED_OPTIONS_QUERY_PARAMETER}" query parameter is required`;

const FILE_URL_REQUIRED_MESSAGE = `A "${FILE_URL_QUERY_PARAMETER}" query parameter is required`;

/* ================================================================================================
 * THE INJECTED SERVICE SEAM
 * ============================================================================================== */

/**
 * The eighteen product-service members this boundary depends on — the parity contract, in one place.
 *
 * ⭐ THIS INTERFACE IS THE METHOD-BY-METHOD PARITY CHECK AAP §0.8.3.1 ASKS FOR. Every member below
 * carries the name, arity and argument order of the legacy declaration it ports (TR-1), and the legacy
 * line number is cited on each so the check can be performed by reading this block against
 * `model/service/ProductService.cfc` side by side. Fifteen come from AAP §0.4.2.1; three —
 * {@link ProductHandlerService.newProduct}, {@link ProductHandlerService.getProduct} and
 * {@link ProductHandlerService.getProductType} — come from AAP §0.4.2.5 and had NO source declaration
 * anywhere, existing only because `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281] fabricated
 * the implicit CRUD surface by lower-cased prefix. IR-1 requires each to be declared explicitly.
 *
 * ⭐ AN INTERFACE RATHER THAN THE CLASS, SO THE BOUNDARY DEPENDS ON A SHAPE AND NOT ON A CONSTRUCTION.
 * The real `ProductService` takes a fourteen-collaborator object; a test that had to build one to assert a
 * status code would be an integration test wearing a unit test's name. Declaring the shape lets a route be
 * exercised with a hand-written double — which is how AAP §0.7.3 S6 manifests for this file, given that
 * the legacy repository contains no mocking library at all (AAP §0.4.3.6).
 *
 * ARROW-TYPED PROPERTIES RATHER THAN METHOD SYNTAX, WHICH IS THE WHOLE POINT OF THE TIGHTENING.
 * TypeScript compares METHOD parameters bivariantly, so had these stayed methods a service declaring a
 * WIDER parameter type would still have satisfied this interface. Written as properties the parameters are
 * checked contravariantly under `strictFunctionTypes`, so a drift in either direction is a compile error.
 * `readonly` additionally states that the frozen object at the end of {@link createProductHandler} is not
 * reassigned through.
 */
export interface ProductHandlerService {
  /* ---- The fifteen declared members, in legacy declaration order (AAP §0.4.2.1) ---- */

  /**
   * `model/service/ProductService.cfc:L65` —
   * `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`.
   *
   * ⚠️ THE MEMBER MISMATCH M1 OWNS. Argument 1 is `required`; argument 2 carries a default and is
   * therefore optional here. Nothing about the timeout is expressed in the type — see the route.
   */
  readonly loadDataFromFile: (fileURL: string, textQualifier?: string) => Promise<void>;

  /**
   * `model/service/ProductService.cfc:L70` — `public any function getFormattedOptionGroups(required any
   * product)`.
   *
   * ⚠️ AN ARRAY OF NAME-AND-OPTIONS ENTRIES, WHICH IS WHAT AAP §0.4.2.1 TABULATES. The legacy body builds
   * a CFML STRUCT — [:L71] initialises `{}` and [:L76] keys it by the option group's NAME — and that
   * divergence is defect D25, annotated on the service member. An earlier revision of this seam typed the
   * result `Promise<Record<string, SelectOption[]>>` to mirror the struct; the service withdrew that
   * reading, and this seam follows the service because {@link ProductHandlerService} is compiler-checked
   * against the real class. The promise is real — the domain's option-group and option reads are
   * asynchronous where the legacy's lazy ORM relationships only looked synchronous.
   */
  readonly getFormattedOptionGroups: (product: Product) => Promise<readonly FormattedOptionGroup[]>;

  /**
   * `model/service/ProductService.cfc:L104` —
   * `public any function getProductSkusBySelectedOptions(required string selectedOptions, required string
   * productID)`.
   *
   * ⭐ THE PROMPT'S OWN WORKED EXAMPLE (AAP §0.8.3.1): "must have a TypeScript equivalent of the same name
   * and behavior". Both arguments are `required`, `selectedOptions` FIRST and `productID` SECOND — the
   * order [model/entity/Product.cfc:L367] and [model/process/Order_AddOrderItem.cfc:L238] both pass
   * positionally, and two out-of-scope callers depend on it.
   */
  readonly getProductSkusBySelectedOptions: (
    selectedOptions: string,
    productID: string,
  ) => Promise<Sku[]>;

  /**
   * `model/service/ProductService.cfc:L113` — was `processProduct_addOptionGroup(required any product,
   * required any processObject)`. Judgment (c) records the renaming.
   */
  readonly processProductAddOptionGroup: (
    product: Product,
    processObject: ProductAddOptionGroup,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L128` — was `processProduct_addOption(required any product,
   * required any processObject)`.
   */
  readonly processProductAddOption: (
    product: Product,
    processObject: ProductAddOption,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L157` — was `processProduct_addProductReview(required any product,
   * required any processObject)`. BOUNDARY-STUBBED: the product-review entity and the account context are
   * both outside the slice, so the service narrows the process object STRUCTURALLY and the parameter is
   * `unknown` rather than a typed process object (judgment (f)).
   */
  readonly processProductAddProductReview: (
    product: Product,
    processObject: unknown,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L173` — was `processProduct_addSubscriptionTerm(required any
   * product, required any processObject)`. BOUNDARY-STUBBED behind `SubscriptionTermPort`, and the member
   * that carries defect D6 (judgment (g)).
   */
  readonly processProductAddSubscriptionTerm: (
    product: Product,
    processObject: unknown,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L198` — was `processProduct_deleteDefaultImage(required any
   * product, required struct data)`. BOUNDARY-STUBBED: image handling is outside the slice.
   *
   * ⚠️ THE SECOND ARGUMENT IS A `struct data`, NOT A PROCESS OBJECT — the only one of the eight declared
   * that way, and the difference is preserved rather than smoothed over.
   */
  readonly processProductDeleteDefaultImage: (
    product: Product,
    data: Record<string, unknown>,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L208` — was `processProduct_updateDefaultImageFileNames( required
   * any product )`. BOUNDARY-STUBBED: image handling. ⚠️ ONE ARGUMENT ONLY — it is the single process
   * member that takes no payload at all, and no second argument is added to make it uniform with its
   * siblings.
   */
  readonly processProductUpdateDefaultImageFileNames: (product: Product) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L216` — was `processProduct_updateSkus(required any product,
   * required any processObject)`. FULLY PORTED, and the one process member with its own validation rule
   * set (`model/validation/Product_UpdateSkus.json`, two conditional groups keyed on the flags).
   */
  readonly processProductUpdateSkus: (
    product: Product,
    processObject: ProductUpdateSkus,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L235` — was `processProduct_uploadDefaultImage(required any
   * product, required any processObject)`. BOUNDARY-STUBBED: the temp directory and the tag service.
   */
  readonly processProductUploadDefaultImage: (
    product: Product,
    processObject: unknown,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L264` — `public any function saveProduct(required any product,
   * required struct data)`. Entity FIRST, payload SECOND, both `required`.
   */
  readonly saveProduct: (product: Product, data: Record<string, unknown>) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L294` — `public any function saveProductType(required any
   * productType, required struct data)`.
   *
   * ⭐ IT LIVES ON THE PRODUCT SERVICE, WHICH IS WHY THERE IS NO SEPARATE PRODUCT-TYPE HANDLER. There is
   * no `ProductTypeService` in the repository at all, so a `productTypeHandler` would have nothing behind
   * it (AAP §0.8.1's functional-scope half).
   *
   * ⚠️ THE RETURN TYPE CARRIES THE ERROR SURFACE, AND IT MUST. `model/service/ProductService.cfc:L310`
   * returns `arguments.productType` on EVERY path, so a failed save arrives as a product type carrying
   * findings rather than as a thrown value. Declaring this member's result as a bare `ProductType` would
   * WIDEN that surface away and leave the boundary unable to tell a failed save from a successful one —
   * which is exactly the gap the commit gate on {@link saveProductType} closes. The service already
   * resolves `ProductTypeWithErrorState`; this declaration stops the graph from discarding it.
   */
  readonly saveProductType: (
    productType: ProductType,
    data: Record<string, unknown>,
  ) => Promise<ProductTypeWithErrorState>;

  /**
   * `model/service/ProductService.cfc:L317` — `public boolean function deleteProduct(required any
   * product)`. A BOOLEAN, and it is reported as one (judgment (n)).
   */
  readonly deleteProduct: (product: Product) => Promise<boolean>;

  /**
   * `model/service/ProductService.cfc:L342` — `public any function getProductSmartList(struct data={},
   * currentURL="")`.
   *
   * ⚠️ DISCREPANCY 1 (judgment (e)): `currentURL` is declared with NO CFML TYPE — `currentURL=""`, not
   * `string currentURL=""` — and AAP §0.4.2.1 records the tightening to an optional string. Arity and
   * order are kept: `data` first, `currentURL` second, both optional.
   */
  readonly getProductSmartList: (
    data?: SmartListInput,
    currentURL?: string,
  ) => Promise<SmartListResult<Product>>;

  /* ---- The three IR-1 synthesized members (AAP §0.4.2.5) ---- */

  /**
   * The `new` prefix branch [org/Hibachi/HibachiService.cfc:L264-L265]. No source declaration exists.
   *
   * SYNCHRONOUS, and deliberately so: it constructs an in-memory instance and touches no repository.
   * [model/transient/HibachiScope.cfc:L116] is a real legacy call site — the LOCAL transient scope, not the
   * framework one (IR-8) — and `admin/views/entity/createproduct.cfm` is the legacy action that reached it.
   */
  readonly newProduct: () => Product;

  /**
   * The `get` prefix branch [org/Hibachi/HibachiService.cfc:L258], whose handler reads the identifier as
   * positional argument 1 at [:L325]. AAP §0.4.2.5 declares the target as
   * `getProduct(productID: string): Promise<Product | null>`.
   *
   * `null` MEANS "NO SUCH ROW" AND IS NOT AN EXCEPTION.
   */
  readonly getProduct: (productID: string) => Promise<Product | null>;

  /**
   * The same `get` branch, for the product type. AAP §0.4.2.5 declares the target as
   * `getProductType(productTypeID: string): Promise<ProductType | null>`, and
   * [model/service/ProductService.cfc]'s own save path is one of its legacy call sites.
   */
  readonly getProductType: (productTypeID: string) => Promise<ProductType | null>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and fails the
 * build otherwise. Type-only, so it contributes nothing to the bundle. The same helper
 * ../services/ProductService and ./brandHandler use for their own guards, spelled identically so the
 * pattern is recognisable across the subtree.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * THE PARITY GUARD — the real `ProductService` really does satisfy {@link ProductHandlerService}.
 *
 * ⭐ THIS IS THE MECHANISM BEHIND AAP §0.8.3.1, NOT A COMMENT ABOUT IT. Any drift in any of the eighteen
 * members' names, arity, argument order or return types breaks the build in THIS file rather than silently
 * at the composition root, and the compiler performs the check on every typecheck run. The import is
 * type-only and therefore erased, so proving the relationship costs the bundle nothing and introduces no
 * runtime coupling to the service module.
 *
 * ⚠️ WHAT IT CANNOT CATCH, STATED SO NOBODY RELIES ON IT FOR MORE THAN IT DOES: it proves the SHAPES
 * agree, not that a route passes the right VALUES in the right SLOTS. Both of
 * `getProductSkusBySelectedOptions`' parameters are `string`, so a route that swapped them would type-check
 * perfectly. That inversion is covered by assertion instead — see the route's own ⛔ note.
 */
type _ProductServiceSatisfiesProductHandlerService = AssertAssignable<
  ProductService,
  ProductHandlerService
>;

/**
 * The transaction-scoped capabilities a WRITE route is allowed to reach.
 *
 * ⭐ IT IS A NARROWING, AND THE NARROWING IS THE POINT (judgment (m)). Four members of
 * {@link ProductHandlerService} are deliberately ABSENT: `loadDataFromFile`, because
 * [model/dao/ProductDAO.cfc:L177] opens its `transaction{` INSIDE the record loop and AAP §0.6.6 M3
 * requires those per-row boundaries be reproduced rather than replaced by one enormous unit; and the three
 * pure reads `getFormattedOptionGroups`, `getProductSkusBySelectedOptions` and `getProductSmartList`,
 * which have no write to enclose. Because the graph is typed, calling any of the four from inside a
 * transaction does not compile — a stronger statement than a comment asking a future reader not to.
 *
 * ⭐ WHY IT INCLUDES THE READS IT DOES INCLUDE. `getProduct`, `getProductType` and `newProduct` are here
 * because every write route must resolve its entity INSIDE the transaction: AAP §0.6.2's `hasUniqueOptions`
 * QUERIES the sibling SKUs the same operation is writing, and AAP §0.6.6 M6 records that as the highest-risk
 * behaviour in the slice. Reading through the captured service would read on a different connection and
 * would not see them.
 */
export type ProductWriteGraph = Pick<
  ProductHandlerService,
  | 'newProduct'
  | 'getProduct'
  | 'getProductType'
  | 'processProductAddOptionGroup'
  | 'processProductAddOption'
  | 'processProductAddProductReview'
  | 'processProductAddSubscriptionTerm'
  | 'processProductDeleteDefaultImage'
  | 'processProductUpdateDefaultImageFileNames'
  | 'processProductUpdateSkus'
  | 'processProductUploadDefaultImage'
  | 'saveProduct'
  | 'saveProductType'
  | 'deleteProduct'
>;

/* ================================================================================================
 * EVENT SLICES
 *
 * Each route declares the SMALLEST slice of the proxy event it reads, with `Pick`. Two consequences,
 * both deliberate: a route cannot quietly start reading a container it never declared, and a test can
 * construct a valid input without fabricating an entire `APIGatewayProxyEvent`. `headers` appears on
 * every one of them because the authorisation gate consults it on every routed member.
 * ============================================================================================== */

/** The slice the authorisation gate itself reads. Every event slice below is assignable to it. */
export type ProductAuthorizationEvent = Pick<APIGatewayProxyEvent, 'headers'>;

/** A route that addresses one product by identifier and reads no payload. */
export type ProductIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/** A route that addresses one product and carries a JSON payload. */
export type ProductPayloadEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/**
 * The product SAVE route — an OPTIONAL identifier plus a payload.
 *
 * The identifier is optional because absence means creation: `newProduct()` supplies the entity, exactly
 * as [model/service/ProductService.cfc:L264]'s callers do.
 */
export type ProductSaveEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/** A route that addresses one product type by identifier and carries a JSON payload. */
export type ProductTypePayloadEvent = Pick<
  APIGatewayProxyEvent,
  'body' | 'pathParameters' | 'headers'
>;

/** A route that addresses one product type by identifier and reads no payload. */
export type ProductTypeIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The option-to-SKU resolution route — a product identifier in the path, the selected options in the
 * query string.
 *
 * Both containers are declared because both are read, and the selection lives in the query string for
 * the T5 reason recorded on {@link SELECTED_OPTIONS_QUERY_PARAMETER}.
 */
export type SelectedOptionsEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters' | 'headers'
>;

/** The importer route — both of its arguments arrive in the query string. */
export type LoadDataFromFileEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/** The smart list route — the recognised query-string vocabulary, and nothing else. */
export type ProductSmartListEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/** The `newProduct` route reads nothing but the headers the gate needs. */
export type NewProductEvent = Pick<APIGatewayProxyEvent, 'headers'>;

/* ================================================================================================
 * RESPONSE CONTRACTS
 *
 * ⛔ EVERY ENTITY IS PROJECTED, NEVER SERIALISED WHOLE — judgment (j), and it is a scope boundary rather
 * than a style preference. `model/entity/Product.cfc` declares relationship collections into
 * `promotionRewards`, `promotionRewardExclusions`, `promotionQualifiers`,
 * `promotionQualifierExclusions`, `priceGroupRates`, `vendors`, `physicals`, `categories` and
 * `listingPages` — every one of those domains explicitly excluded by AAP §0.2.2.1 — and
 * `model/entity/ProductType.cfc` declares nine more of the same kind. Handing an entity to
 * `JSON.stringify` would publish whatever is loaded on those collections, so each response type below
 * NAMES the members it carries and a future field stays out until somebody decides otherwise here.
 *
 * ⛔ AND NEITHER THE AUDIT BLOCK NOR `remoteID` IS PUBLISHED — ONE WITHHELD SET, NOT TWO DECISIONS.
 * `model/entity/Product.cfc` and `model/entity/ProductType.cfc` each declare the same five-member tail
 * every in-scope entity declares: `remoteID` and then `createdDateTime`, `createdByAccount`,
 * `modifiedDateTime`, `modifiedByAccount`. The audit four identify ACCOUNTS, and `remoteID` is an
 * external system's key for the row — an integration control value, which is exactly how this subtree
 * already classifies it on the way IN: `../adapters/mysql/MySqlProductRepository`'s importable-column
 * allowlist refuses `remoteID` alongside the primary keys and the audit columns, so an uploaded file
 * cannot write it. Publishing it on the way out while refusing it on the way in would be the same
 * value governed by two different rules.
 *
 * ⭐ THE SIBLING BOUNDARY PINS THIS, SO IT IS A PROPERTY RATHER THAN A CONVENTION.
 * `test/services/BrandService.test.ts` asserts "remoteID and the audit members never reach the body"
 * against `model/entity/Brand.cfc:L75-L80` — the identical tail — and checks the serialised body does
 * not contain the values at all. `./brandHandler`'s and `./skuHandler`'s projections withhold the same
 * set, and the SKU shape below is byte-identical to `./skuHandler`'s for that reason.
 *
 * ⚠️ AN EARLIER REVISION OF THIS FILE PUBLISHED `remoteID` ON THE PRODUCT AND PRODUCT-TYPE SHAPES, AND
 * THE CORRECTION IS RECORDED RATHER THAN QUIETLY MADE. It followed a defensible local rule — "the
 * scalar persistent members" — and `remoteID` is one. What settles it against that rule is that the
 * shape is not parity-constrained in either direction: as {@link ProductResponse.calculatedSalePrice}
 * records, the legacy exposes no JSON response for these entities at all, so withholding a member costs
 * no fidelity, while publishing one that three sibling projections withhold costs consistency.
 *
 * ⛔ AND NO CALCULATED PRICING, PROMOTION OR INVENTORY MEMBER IS PUBLISHED. AAP §0.2.2.6 lists sixteen
 * non-persistent members that reach out-of-scope services — `salePrice`, `livePrice`,
 * `currentAccountPrice`, `qats`, `eligibleFulfillmentMethods` and the rest — and none of them appears in
 * any projection below. The three `calculated*` members that DO appear are PERSISTENT columns of
 * `SwProduct`, stored values the port reads and writes like any other column, not derived reads.
 *
 * Values are copied exactly as the entity holds them — never trimmed, re-cased, formatted, rounded,
 * localised or defaulted — following the pass-through rule ./httpResponse sets for this layer. An absent
 * optional member is OMITTED rather than emitted as a null, which `exactOptionalPropertyTypes` makes the
 * compiler check: the in-scope entities declare no default for most of these, so "absent" and "empty" are
 * genuinely different states and collapsing them would invent behaviour (AAP §0.7.3 S9).
 * ============================================================================================== */

/**
 * The minimal representation of a product a route returns.
 *
 * The scalar persistent members of `SwProduct` EXCEPT the withheld tail the section note above sets out
 * — `remoteID` and the four audit members — plus the IDENTIFIERS of the two relationships whose targets
 * are themselves in scope.
 *
 * ⚠️ THERE IS DELIBERATELY NO `defaultSkuID`, AND ITS ABSENCE IS EVIDENCE RATHER THAN AN OVERSIGHT.
 * `Product.defaultSku` is typed `ProductDefaultSkuDelegate` — a nine-member price-and-image delegate that
 * exposes no identifier at all — because the default SKU's identity is read through an injected
 * `DefaultSkuIdReader` in the persistence layer, not off the domain object. Publishing a price or an image
 * path off that delegate instead would cross the AAP §0.2.2.6 boundary this projection exists to hold.
 */
export interface ProductResponse {
  readonly productID: string;
  readonly activeFlag?: boolean;
  readonly urlTitle?: string;
  readonly productName?: string;
  readonly productCode?: string;
  readonly productDescription?: string;
  readonly publishedFlag?: boolean;
  readonly sortOrder?: number;
  /* ⚠️ EXACT DECIMAL, SO IT SERIALIZES AS A JSON STRING RATHER THAN A NUMBER, AND THAT IS DELIBERATE.
   * `Product.calculatedSalePrice` is an `ExactDecimal` — the stored digits at the stored scale — because
   * `SwProduct.calculatedSalePrice` holds values no IEEE-754 double can represent exactly (F07). Coercing
   * it to `number` here would reintroduce, at the very last step, the precision loss the domain type
   * exists to prevent, and would do it silently. There is no parity cost: the legacy exposes no JSON
   * response for this entity at all — `index.cfm` and the FW/1 `slatAction` convention render views — so
   * this shape owes nothing to a legacy counterpart and is free to be the correct one. */
  readonly calculatedSalePrice?: ExactDecimal;
  readonly calculatedQATS?: number;
  readonly calculatedAllowBackorderFlag?: boolean;
  readonly calculatedTitle?: string;
  readonly brandID?: string;
  readonly productTypeID?: string;
}

/**
 * The minimal representation of a product type a route returns.
 *
 * The scalar persistent members of `SwProductType` EXCEPT the withheld tail the section note above sets
 * out — `remoteID` and the four audit members — plus the parent identifier that makes the
 * self-referencing hierarchy legible. `productTypeIDPath` is included because it is a stored column the
 * legacy reads directly, not a derived value.
 */
export interface ProductTypeResponse {
  readonly productTypeID: string;
  readonly productTypeIDPath?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
  readonly urlTitle?: string;
  readonly productTypeName?: string;
  readonly productTypeDescription?: string;
  readonly systemCode?: string;
  readonly parentProductTypeID?: string;
}

/**
 * The minimal representation of a SKU the one SKU-returning product route emits.
 *
 * ⚠️ DECLARED HERE RATHER THAN IMPORTED FROM ./skuHandler, DELIBERATELY. Two handler modules importing each
 * other's response types would couple two independently mounted boundaries, so that when one changed what
 * it publishes the other's contract would move underneath it. The member set is the same one ./skuHandler
 * projects because the same reasoning produces it, and the duplication is the price of keeping the two
 * boundaries independent.
 *
 * ⛔ NO `calculatedQATS` AND NO OPTION COLLECTION. `Sku` carries twelve relationship collections into
 * out-of-scope domains and a calculated availability member; none is published, and the SKU's options are
 * not expanded either — a caller that needs them addresses ./skuHandler.
 */
export interface ProductSkuResponse {
  readonly skuID: string;
  readonly skuCode?: string;
  /* The three monetary members are `ExactDecimal` for the reason given on
   * {@link ProductResponse.calculatedSalePrice}: they serialize as digit-exact JSON strings. */
  readonly price: ExactDecimal;
  readonly listPrice: ExactDecimal;
  readonly renewalPrice: ExactDecimal;
  readonly activeFlag: boolean;
  readonly userDefinedPriceFlag: boolean;
  readonly imageFile?: string;
}

/**
 * One selectable option, as `OptionService.getOptionsForSelect` shapes it.
 *
 * The `{name, value}` projection is the SIBLING service's, not this file's — ../services/OptionService owns
 * it and `SelectOption` is imported type-only from there rather than re-declared (AAP §0.7.3 S5). This type
 * exists only so the response contract is stated in the same explicit, member-by-member form as its
 * neighbours; it is structurally the same shape.
 */
export interface ProductSelectOptionResponse {
  readonly name: string;
  readonly value: string;
}

/**
 * One formatted option group in a response — the option-group NAME and its projected options.
 *
 * The two member names are the service's, not this file's: {@link FormattedOptionGroup} declares
 * `optionGroupName` and `options`, and renaming either here would make the wire disagree with the member
 * it projects. `optionGroupID` is absent for the same reason it is absent on the service type — the legacy
 * struct entry cannot carry it (AAP §0.7.3 S9).
 */
export interface FormattedOptionGroupResponse {
  readonly optionGroupName: string;
  readonly options: readonly ProductSelectOptionResponse[];
}

/**
 * The formatted option groups a product exposes, one entry per distinct option-group NAME.
 *
 * ⚠️ AN ARRAY, AND THE LABEL IS THE NAME (defect D25 — the legacy body builds a name-keyed struct, and the
 * port answers the array AAP §0.4.2.1 tabulates). Three behaviours travel through this contract untouched:
 * the label is the group name and never the group ID; same-named groups COLLAPSE TO ONE ENTRY, because
 * [model/service/ProductService.cfc:L76] is a plain struct assignment and the LAST one wins; and NOTHING IS
 * SORTED, because the legacy sorts neither the groups nor the options within a group. A response that
 * de-duplicated differently, suffixed a repeated name or ordered the entries would change what the caller
 * sees.
 *
 * ⭐ AND AN ARRAY IS THE SHAPE THAT CAN CARRY THE ORDER ACROSS THE WIRE. A JSON object's member order is
 * not part of the value a client is entitled to rely on, so serializing these as an object would silently
 * drop the first-seen order recorded as M9 on {@link FormattedOptionGroup}.
 */
export type FormattedOptionGroupsResponse = readonly FormattedOptionGroupResponse[];

/**
 * A page of products, with the smart list's own seven members.
 *
 * ⛔ THE FIVE PAGING NUMBERS ARE COPIED EXACTLY AS THE SMART LIST COMPUTED THEM — never recomputed,
 * clamped, re-based or defaulted. They are the port's output, and re-deriving any of them here would put a
 * second, divergent pagination implementation at the boundary.
 */
export interface ProductSmartListResponse {
  readonly records: readonly ProductResponse[];
  readonly pageRecords: readonly ProductResponse[];
  readonly recordsCount: number;
  readonly pageRecordsStart: number;
  readonly pageRecordsEnd: number;
  readonly currentPage: number;
  readonly totalPages: number;
}

/* ================================================================================================
 * THE ACCESS MATRIX
 * ============================================================================================== */

/**
 * What one routed member requires of its caller.
 *
 * A DISCRIMINATED UNION rather than one record with optional members, so a `'secure'` row cannot omit the
 * entity it asks about and an `'anyLogin'` row cannot carry a permission question it never asks. The
 * classification vocabulary is the port's own, and only the two arms the evidence supports are constructed:
 * ⛔ NO `'public'` ARM AND NO `'anyAdmin'` ARM EXISTS HERE. A `'public'` arm in particular would put
 * "reachable with no account at all" one keystroke away from a row that has no evidence for it — and the
 * only public action anywhere in this slice is `this.publicMethods="product"` at
 * [integrationServices/google/controllers/feed.cfc:L54], which belongs to ./googleFeedHandler.
 */
type ProductAccessRequirement =
  | { readonly classification: Extract<HandlerAccessClassification, 'anyLogin'> }
  | {
      readonly classification: Extract<HandlerAccessClassification, 'secure'>;
      readonly entityName: string;
      readonly crudTypes: ProductCrudQuestions;
    };

/**
 * The ordered, non-empty list of CRUD questions one `'secure'` row asks, first grant winning.
 *
 * ⭐ ORDERED, BECAUSE THE LEGACY ORDER IS BEHAVIOR. The `save`-prefix branch
 * [org/Hibachi/HibachiAuthenticationService.cfc:L71-L77] asks for `create` FIRST, returns true if that is
 * granted, and only then asks for `update` — so a row can legitimately carry two questions, and which one
 * is asked first decides which single permission grant is sufficient on its own.
 *
 * ⭐ NON-EMPTY, ENFORCED BY THE TYPE RATHER THAN BY A RUN-TIME CHECK. A row with an empty list would
 * authorise nothing, which — because the gate refuses after exhausting the list — means it would refuse
 * EVERYTHING, silently and only at run time. `readonly [EntityCrudType, ...EntityCrudType[]]` makes that
 * row fail to compile instead, so the gate needs no defensive branch for a state that cannot exist.
 */
type ProductCrudQuestions = readonly [EntityCrudType, ...EntityCrudType[]];

/**
 * The one question a READ asks: `read`.
 *
 * `'read'` is the legacy CRUD value, not a coined one — it is what both the `detail` prefix
 * [org/Hibachi/HibachiAuthenticationService.cfc:L54-L55] and the `list` prefix [:L60-L61] resolve to.
 */
const READ_CRUD_QUESTIONS = Object.freeze<ProductCrudQuestions>(['read']);

/**
 * The one question a CREATION asks: `create`.
 *
 * The `create` prefix at [org/Hibachi/HibachiAuthenticationService.cfc:L52-L53], which is the branch a
 * legacy `createProduct` item took — and `admin/views/entity/createproduct.cfm` is the view that item
 * rendered.
 */
const CREATE_CRUD_QUESTIONS = Object.freeze<ProductCrudQuestions>(['create']);

/** The one question a DELETE asks: `delete`. The `delete` prefix at [:L56-L57]. */
const DELETE_CRUD_QUESTIONS = Object.freeze<ProductCrudQuestions>(['delete']);

/**
 * The ordered pair a SAVE asks: `create` first, then `update`.
 *
 * Both the pair and its order come from [org/Hibachi/HibachiAuthenticationService.cfc:L71-L77]. Reversing
 * them would change which single grant suffices, so the order is carried rather than tidied.
 */
const SAVE_CRUD_QUESTIONS = Object.freeze<ProductCrudQuestions>(['create', 'update']);

/**
 * The requirement `'anyLogin'` states: a logged-in account, and nothing further.
 *
 * `'anyLogin'` is not a word chosen here: it names the `this.anyLoginMethods` declaration a legacy
 * controller writes and the ladder reads at [org/Hibachi/HibachiAuthenticationService.cfc:L32-L34].
 */
const ANY_LOGIN_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'anyLogin',
});

/** A logged-in account whose permission groups grant `read` on `Product`. */
const SECURE_PRODUCT_READ_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudTypes: READ_CRUD_QUESTIONS,
});

/** A logged-in account whose permission groups grant `create` on `Product`. */
const SECURE_PRODUCT_CREATE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudTypes: CREATE_CRUD_QUESTIONS,
});

/** A logged-in account granted `create` on `Product`, or failing that `update` on `Product`. */
const SECURE_PRODUCT_SAVE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudTypes: SAVE_CRUD_QUESTIONS,
});

/** A logged-in account whose permission groups grant `delete` on `Product`. */
const SECURE_PRODUCT_DELETE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudTypes: DELETE_CRUD_QUESTIONS,
});

/** A logged-in account whose permission groups grant `read` on `ProductType`. */
const SECURE_PRODUCT_TYPE_READ_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_TYPE_ENTITY_NAME,
  crudTypes: READ_CRUD_QUESTIONS,
});

/** A logged-in account granted `create` on `ProductType`, or failing that `update` on `ProductType`. */
const SECURE_PRODUCT_TYPE_SAVE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_TYPE_ENTITY_NAME,
  crudTypes: SAVE_CRUD_QUESTIONS,
});

/**
 * A logged-in account whose permission groups grant `read` on `Sku`.
 *
 * The ENTITY is `Sku` rather than `Product` because the legacy ladder derives the entity name from the ITEM
 * name — the resource being addressed — and this member returns SKUs. ./skuHandler asks the identical
 * question for its own seven read rows, which is what keeps one resource governed by one permission
 * wherever it is reached from.
 */
const SECURE_SKU_READ_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: SKU_ENTITY_NAME,
  crudTypes: READ_CRUD_QUESTIONS,
});

/**
 * The access classification of every routed product operation, and the evidence for each row.
 *
 * ⭐ WHY THIS EXISTS AT ALL. The legacy application authorised EVERY request in one place, before any
 * controller method ran: `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203] opens with the comment
 * "Verify Authentication before anything happens" and refuses at [:L188]. No legacy controller repeated
 * that check because none needed to. That gate is framework code and does not cross the boundary
 * (AAP §0.8.3.2), so its CONTRACT had to be declared instead — see ../ports/AccountContextPort. Restoring
 * the gate here is PARITY, not invented policy; the only thing that changes is the failure mode, from a
 * browser redirect to a status code.
 *
 * ⭐ THE MATRIX IS WIRED INTO THE GATE, NOT MERELY DOCUMENTED BESIDE IT. {@link createProductHandler}'s
 * `refuseUnauthorized` takes a MEMBER NAME and reads its requirement from here, so a member cannot be
 * enforced as something other than what this table declares. Because the key type is
 * `keyof ProductHandler`, a member added to the routed surface without a row here does not compile, and a
 * member removed from that surface takes its row and its call site down with it.
 *
 * ⭐ WHY NO ROW IS `'public'`, ESTABLISHED BY EVIDENCE RATHER THAN BY CAUTION. Every legacy administrative
 * product item lives on the admin entity controller, and [admin/controllers/entity.cfc:L66-L68] declares
 * `this.publicMethods=''`, `this.anyAdminMethods=''` AND `this.secureMethods=''` — all three EMPTY. Not one
 * product operation is public, and none is named in an explicit list either, so every product item falls
 * through to the entity-CRUD branch at [org/Hibachi/HibachiAuthenticationService.cfc:L50-L79], which is the
 * permission-checked path.
 *
 * THE ROWS, AND THE EVIDENCE FOR EACH
 * -----------------------------------
 *   THE EIGHT `processProductXxx` ROWS — ANY LOGIN. This is the group a reader is most likely to expect to
 *     be `'secure'`, and the evidence says otherwise, so it is spelled out. Each member's legacy name begins
 *     with `process`, and the ladder's `process` branch
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L68-L69] is a bare `return true` — it asks NO permission
 *     question and names NO entity. That branch sits INSIDE the logged-in gate at [:L30], so a principal is
 *     still required; what is not required is a CRUD grant. Independent confirmation that these items really
 *     existed and really took that branch: `admin/views/entity/` contains
 *     `preprocessproduct_addoption.cfm`, `preprocessproduct_addoptiongroup.cfm`,
 *     `preprocessproduct_addsubscriptionterm.cfm`, `preprocessproduct_updateskus.cfm` and
 *     `preprocessproduct_uploaddefaultimage.cfm` — five rendered pre-process forms, whose `preProcess`
 *     prefix [:L66-L67] is also a bare `return true`. Asking an entity question here would REFUSE callers
 *     the legacy admitted, which is a behavior change dressed up as caution (AAP §0.8.2 Guideline 4).
 *
 *   `saveProduct` — SECURE, `create` then `update` on `Product`; see
 *     {@link SECURE_PRODUCT_SAVE_REQUIREMENT}. ⚠️ IT DOES NOT DEPEND ON WHETHER AN IDENTIFIER WAS
 *     ADDRESSED. The legacy action name carried no such information, so the legacy asked both questions
 *     regardless. Deriving the CRUD type from the presence of a path parameter would be tidier and would be
 *     a DIFFERENT policy: an account permitted only to create could no longer save an addressed product it
 *     would previously have been allowed to.
 *
 *   `saveProductType` — SECURE, `create` then `update` on `ProductType`. The same branch, over the entity
 *     name `saveProductType` yields at [:L75].
 *
 *   `deleteProduct` — SECURE, `delete` on `Product`; the `delete` prefix at [:L56-L57].
 *
 *   `newProduct` — SECURE, `create` on `Product`. ⭐ THE ROW THAT MAKES THIS FILE'S EIGHTEENTH MEMBER
 *     DEFENSIBLE: `admin/views/entity/createproduct.cfm` EXISTS, so a legacy `createProduct` item existed,
 *     and the `create` prefix at [:L52-L53] is the branch it took. A single question, not the save pair —
 *     the `create` branch asks one and returns its answer.
 *
 *   `getProduct`, `getProductSmartList` — SECURE, `read` on `Product`, from the `detail` prefix [:L54-L55]
 *     and the `list` prefix [:L60-L61]. The views that exist on disk are exactly `detailproduct.cfm` and
 *     `listproduct.cfm`. ⭐ AND THE SMART-LIST ROW IS CORROBORATED BY A SECOND, INDEPENDENT SITE:
 *     [admin/controllers/ajax.cfc:L201] guards its `getProductSmartList` call with
 *     `rc.$.slatwall.authenticateEntity("Read", "Product")` — the legacy asking this row's exact question
 *     in its own words, at the call site, rather than the answer being inferred from a naming convention.
 *
 *   `getProductType` — SECURE, `read` on `ProductType`, from the same `detail` prefix.
 *     `detailproducttype.cfm` and `listproducttype.cfm` both exist; there is NO `createproducttype.cfm`,
 *     which is why no product-type creation route exists.
 *
 *   `getFormattedOptionGroups` — SECURE, `read` on `Product`. ⚠️ NO LEGACY ITEM EXISTS FOR IT: a repository
 *     scan finds the member declared at [model/service/ProductService.cfc:L70] and called from NOWHERE, so
 *     no controller ever routed to it and no prefix branch applies directly. The closest evidence is used
 *     rather than invented around: the member takes a product and describes that product's own option
 *     structure, which is a `read` of the product it was handed.
 *
 *   `getProductSkusBySelectedOptions` — SECURE, `read` on `Sku`; see
 *     {@link SECURE_SKU_READ_REQUIREMENT}. Its only legacy callers are internal
 *     ([model/entity/Product.cfc:L367] and [model/process/Order_AddOrderItem.cfc:L238]), so again no item
 *     existed; the entity it RETURNS decides the question, exactly as the ladder decides it from the item
 *     name.
 *
 *   `loadDataFromFile` — SECURE, `create` then `update` on `Product`, and this row deserves its reasoning
 *     stated in full because it is the widest write in the file. ⚠️ NO LEGACY ITEM EXISTS FOR IT EITHER: the
 *     member at [model/service/ProductService.cfc:L65] has no caller anywhere in the repository, and its
 *     name begins with `load`, which matches NO branch of the ladder — an item so named would have fallen
 *     through every test to the terminal `return false` at
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L83] and been refused outright. Refusing outright is not
 *     expressible as a routed member: it would make the member unreachable, which is exactly the quiet drop
 *     TR-5 forbids. So the closest EXPRESSIBLE evidence is applied — the importer writes `SwProduct` rows,
 *     which is precisely what a `save` item does, so it asks the `save` branch's own pair. It is therefore
 *     never less protected than `saveProduct`, which is the property that matters.
 *
 * ⛔ THERE IS NO ROW FOR `countProduct*`, `listProduct*`, `exportProduct*`, `newProductType` OR
 * `buildSkuCombinations`, BECAUSE THERE IS NO MEMBER FOR ANY OF THEM. See the module header and
 * judgment (b).
 *
 * The object is frozen, so the matrix is provably immutable at run time as well as in the type system —
 * the same requirement AAP §0.6.6 M7 places on everything outside the connection pool, because a warm
 * Lambda container is shared across invocations and therefore potentially across tenants.
 */
export const PRODUCT_ACCESS_MATRIX: Readonly<
  Record<keyof ProductHandler, ProductAccessRequirement>
> = Object.freeze({
  loadDataFromFile: SECURE_PRODUCT_SAVE_REQUIREMENT,
  getFormattedOptionGroups: SECURE_PRODUCT_READ_REQUIREMENT,
  getProductSkusBySelectedOptions: SECURE_SKU_READ_REQUIREMENT,
  processProductAddOptionGroup: ANY_LOGIN_REQUIREMENT,
  processProductAddOption: ANY_LOGIN_REQUIREMENT,
  processProductAddProductReview: ANY_LOGIN_REQUIREMENT,
  processProductAddSubscriptionTerm: ANY_LOGIN_REQUIREMENT,
  processProductDeleteDefaultImage: ANY_LOGIN_REQUIREMENT,
  processProductUpdateDefaultImageFileNames: ANY_LOGIN_REQUIREMENT,
  processProductUpdateSkus: ANY_LOGIN_REQUIREMENT,
  processProductUploadDefaultImage: ANY_LOGIN_REQUIREMENT,
  saveProduct: SECURE_PRODUCT_SAVE_REQUIREMENT,
  saveProductType: SECURE_PRODUCT_TYPE_SAVE_REQUIREMENT,
  deleteProduct: SECURE_PRODUCT_DELETE_REQUIREMENT,
  getProductSmartList: SECURE_PRODUCT_READ_REQUIREMENT,
  newProduct: SECURE_PRODUCT_CREATE_REQUIREMENT,
  getProductType: SECURE_PRODUCT_TYPE_READ_REQUIREMENT,
  getProduct: SECURE_PRODUCT_READ_REQUIREMENT,
});

/* ================================================================================================
 * THE ROUTED SURFACE
 * ============================================================================================== */

/**
 * The routed product operations, ready to be mounted by src/handlers/router.ts.
 *
 * EVERY MEMBER IS NAMED FOR THE SERVICE MEMBER IT EXPOSES — the naming is what makes the mapping from
 * AAP §0.4.2.1 and AAP §0.4.2.5 to this file checkable by inspection, and it is the same one-to-one
 * discipline ./brandHandler, ./optionHandler and ./skuHandler follow. THIS INTERFACE IS ALSO THE DEFINITION
 * OF "MOUNTED": {@link PRODUCT_ACCESS_MATRIX} is keyed on `keyof ProductHandler`, so every routed member is
 * required to carry a classification and no member can be added here without one.
 *
 * EXACTLY EIGHTEEN MEMBERS, listed in the same order as {@link ProductHandlerService} — the fifteen in
 * legacy declaration order, then the three synthesized. The module header records why the count is
 * eighteen and not seventeen, and why that differs from the adjudication its two sibling factories reached.
 *
 * ALL EIGHTEEN RESOLVE A PROMISE, INCLUDING `newProduct`. The service member it exposes is synchronous, but
 * a router awaits every route uniformly, and a boundary that returned a bare value for one of eighteen
 * members would make the router's own dispatch conditional on which member it mounted.
 */
export interface ProductHandler {
  readonly loadDataFromFile: (event: LoadDataFromFileEvent) => Promise<APIGatewayProxyResult>;
  readonly getFormattedOptionGroups: (
    event: ProductIdentifierEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly getProductSkusBySelectedOptions: (
    event: SelectedOptionsEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductAddOptionGroup: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductAddOption: (event: ProductPayloadEvent) => Promise<APIGatewayProxyResult>;
  readonly processProductAddProductReview: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductAddSubscriptionTerm: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductDeleteDefaultImage: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductUpdateDefaultImageFileNames: (
    event: ProductIdentifierEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductUpdateSkus: (event: ProductPayloadEvent) => Promise<APIGatewayProxyResult>;
  readonly processProductUploadDefaultImage: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly saveProduct: (event: ProductSaveEvent) => Promise<APIGatewayProxyResult>;
  readonly saveProductType: (event: ProductTypePayloadEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteProduct: (event: ProductIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly getProductSmartList: (event: ProductSmartListEvent) => Promise<APIGatewayProxyResult>;
  readonly newProduct: (event: NewProductEvent) => Promise<APIGatewayProxyResult>;
  readonly getProductType: (event: ProductTypeIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly getProduct: (event: ProductIdentifierEvent) => Promise<APIGatewayProxyResult>;
}

/**
 * A `Product` really does carry the error surface the commit gate reads.
 *
 * ⭐ NOT DECORATION. `skuBatchHasErrors` accepts `ProductWithErrorState`, which is `Product` intersected
 * with the six-member error surface. `Product` implements those six directly
 * (unlike `Sku`, whose bag arrives through `manageEntity`), so a plain product may be handed to the gate —
 * and this assertion is what proves it here rather than at whichever write route happens to be edited
 * first. ../services/ProductService states the same relationship from its own side.
 */
type _ProductCarriesErrorState = AssertAssignable<Product, ProductWithErrorState>;

/* ================================================================================================
 * REQUEST READERS
 *
 * Each answers one question about the event and nothing else. Values are returned exactly as received —
 * never trimmed, case-folded, padded or validated against a format — because ./httpResponse's
 * pass-through rule holds for inputs as well as for messages, and because a 32-character-identifier check
 * belongs to the persistence layer that owns the column.
 * ============================================================================================== */

/**
 * Reads the addressed product identifier, or reports that none was addressed.
 *
 * An empty identifier is reported as ABSENCE rather than as a value, for the reason recorded on
 * {@link UNSAVED_IDENTIFIER}: it is the legacy `unsavedvalue=""` and can never identify a persisted row.
 *
 * @param event the proxy event, or any object carrying its path-parameters member
 * @returns the addressed product identifier, or nothing when no product was addressed
 */
function readProductIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const productID: string | undefined = readPathParameter(event, PRODUCT_ID_PATH_PARAMETER);

  if (productID === undefined || productID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return productID;
}

/**
 * Reads the addressed product-type identifier, or reports that none was addressed.
 *
 * Identical in shape and reasoning to {@link readProductIdentifier}; the sentinel is the same
 * `unsavedvalue=""` declared on this entity's own primary key at [model/entity/ProductType.cfc:L52].
 *
 * @param event the proxy event, or any object carrying its path-parameters member
 * @returns the addressed product-type identifier, or nothing when none was addressed
 */
function readProductTypeIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const productTypeID: string | undefined = readPathParameter(
    event,
    PRODUCT_TYPE_ID_PATH_PARAMETER,
  );

  if (productTypeID === undefined || productTypeID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return productTypeID;
}

/**
 * Reads the selected-option list, distinguishing "not supplied" from "supplied and empty".
 *
 * ⚠️⚠️ THE EMPTY-STRING CASE IS TREATED DIFFERENTLY HERE THAN FOR THE TWO IDENTIFIERS, AND THAT IS THE
 * WHOLE OF T5 (judgment (d)). `selectedOptions` is not a primary key and has no `unsavedvalue`; an empty
 * list is a LEGAL, MEANINGFUL input. [model/entity/Product.cfc:L366] defaults it to `""`, `listLen("")` is
 * zero, the DAO appends zero `EXISTS` clauses, and the query legitimately degenerates to "all
 * option-bearing SKUs of this product". AAP §0.6.1.3 records that both `Product.getSkuBySelectedOptions`
 * and `Sku.hasUniqueOptions` DEPEND on that degenerate form, so:
 *
 * ⛔ IT IS NOT REJECTED, NOT DEFAULTED, NOT NORMALISED AND NOT GUARDED AGAINST. Only genuine ABSENCE is
 * reported as "none", and an empty list is forwarded as the value it is. Collapsing the two would suppress
 * a real query the legacy runs and would break two in-repository callers.
 *
 * ⛔ THE LIST IS NOT SPLIT HERE EITHER. The legacy signature declares a single `required string`, and
 * ../services/ProductService performs the split, on the comma a CFML list defaults to. Splitting at the boundary
 * would put a second, divergent parser in front of the one that owns the behaviour.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member
 * @returns the list exactly as supplied — including the empty string — or nothing when it was not supplied
 */
function readSelectedOptions(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
): string | undefined {
  return readQueryStringParameter(event, SELECTED_OPTIONS_QUERY_PARAMETER);
}

/* ================================================================================================
 * ⛔ THE SMART-LIST INPUT READER AND ITS FIVE SUPPORTING DECLARATIONS WERE REMOVED FROM THIS FILE.
 *
 * This boundary declared `SmartListInputMember`, `SmartListInputKey`, `MutableSmartListInput`,
 * `isSmartListInputKey` and `readSmartListInput` privately, together with the two vocabulary constants
 * further up. All seven were BYTE-IDENTICAL to declarations in `./httpResponse.ts` — same bodies, same
 * key lists, same mapped types — and this file now imports that module's exported `readSmartListInput`
 * instead, exactly as `./skuHandler.ts` already did.
 *
 * ⭐ WHY THE CLONE EXISTED, AND WHY THE REASON NO LONGER HOLDS. The removed doc argued the case for
 * declaring it here: "adding an enumerating reader to ./httpResponse is not this file's to do — that
 * module is parent-owned (AAP §0.4.1.2) and is neither edited nor extended from here." That was a sound
 * scope argument when written, and it stopped being true the moment `./httpResponse.ts` gained exactly
 * that member, exported. Importing from a module is not extending it — this file already takes thirteen
 * other names from it — so the clone had no remaining justification, only a drift hazard: two copies of
 * one vocabulary, and a key added to one would silently leave this file's two smart-list routes reading
 * the older set. Nothing detected it. The declarations were private, so no name collided; they were used,
 * so no unused-symbol rule fired; and they were identical, so no test disagreed.
 *
 * ✅ NOTHING WAS BEHAVIOURALLY CHANGED BY THE REMOVAL, and that follows from the identity rather than
 * from testing afterwards: the imported function is the same source text this file was running.
 *
 * THE LEGACY EVIDENCE THE REMOVED DOC CARRIED IS KEPT, because it was not duplicated in the survivor.
 * `getProductSmartList(struct data={}, currentURL="")` [model/service/ProductService.cfc:L342] received
 * the FW/1 request context — the whole bag of query and form values — and `applyData`
 * [org/Hibachi/HibachiSmartList.cfc:L85-L136] walked that bag acting on recognised keys only. Four
 * in-repository call sites pass the bag that way: [admin/controllers/ajax.cfc:L202] (`data=rc`),
 * [model/transient/HibachiScope.cfc:L142] (`data=url`, the LOCAL transient scope rather than the
 * framework one, IR-8), [admin/controllers/main.cfc:L92] and [model/entity/ProductType.cfc:L263].
 * The authorization corroboration the same doc carried is recorded on this file's access matrix, where
 * the classification it corroborates is decided.
 * ============================================================================================== */

/* ================================================================================================
 * PROCESS-OBJECT ASSEMBLY
 *
 * The three TYPED process objects are plain data shapes — `model/process/Product_AddOptionGroup.cfc`,
 * `Product_AddOption.cfc` and `Product_UpdateSkus.cfc` declare an injected entity and a handful of data
 * properties, and ../services/ProductService reads them as FIELDS. This boundary assembles them, which is
 * the job the framework's own populator did.
 *
 * ⚠️ AND IT ASSEMBLES THEM WITH ABSENCE-PRESERVING SEMANTICS, WHICH IS THE SUBTLE PART. The legacy
 * populator DELETED a key whose incoming value was blank rather than storing an empty string —
 * [org/Hibachi/HibachiTransient.cfc:L196] and [:L806-L819] — because none of these properties declares
 * `notNull`. An absent flag then leaves its validation condition UNMET, and the mechanism is exact:
 * `model/validation/Product_UpdateSkus.json` declares each condition as `{"eq":1}`,
 * `getConditionsMeetFlag` [org/Hibachi/HibachiValidationService.cfc:L97-L130] dispatches that constraint,
 * and `validate_eq` [:L385-L395] returns FALSE when the property value is null. So the paired price's rule
 * is switched OFF entirely rather than merely made un-required. Storing `''` instead would MEET the
 * condition and turn a switched-off rule into a failing one, so the distinction is behavior, not tidiness.
 * ============================================================================================== */

/**
 * Reads one data property that the legacy declares as text.
 *
 * A non-empty string is a value; anything else — absent, blank, or of another JSON type — is reported as
 * absence, so the caller omits the key rather than assigning it. The blank case is the populator's
 * null-by-deletion rule recorded above; a non-string is reported as absence rather than coerced, because
 * coercing `{"optionGroup": 42}` into `"42"` would accept a payload the legacy select could not have
 * produced.
 *
 * @param data the parsed request payload
 * @param key the legacy property name
 * @returns the text, or nothing when the key carries no usable text
 */
function readProcessText(data: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = data[key];

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

/**
 * Reads one data property that the legacy declares as `string | number`.
 *
 * ⚠️ ZERO IS A VALUE AND MUST SURVIVE. ../domain/process/ProductUpdateSkus records that "a price of zero is
 * a legitimate value the legacy required-constraint accepts
 * [org/Hibachi/HibachiValidationService.cfc:L240-L245], so no falsiness test may stand in for a presence
 * test on this member" — which is why the test below is on the TYPE and, for strings, on the LENGTH, never
 * on truthiness.
 *
 * BOTH JSON TYPES ARE ACCEPTED BECAUSE THE PROPERTY DECLARES BOTH. The legacy received these as form values
 * — always strings — and the ported process object widened the type to `string | number` so a JSON caller
 * need not stringify a number it already has. Neither is converted into the other: the value crosses
 * unchanged and the service's own coercion decides, exactly as [model/service/ProductService.cfc:L222-L228]
 * does. `NaN` and `Infinity` are unreachable here because JSON has no literal for either.
 *
 * @param data the parsed request payload
 * @param key the legacy property name
 * @returns the scalar, or nothing when the key carries no usable scalar
 */
function readProcessScalar(
  data: Record<string, unknown>,
  key: string,
): string | number | undefined {
  const value: unknown = data[key];

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return undefined;
}

/**
 * Assembles the `addOptionGroup` process object.
 *
 * `model/process/Product_AddOptionGroup.cfc` declares the injected entity `product` at [:L52] and the single
 * data property `optionGroup` at [:L55]. The entity is assigned exactly as the framework assigned it —
 * [org/Hibachi/HibachiEntity.cfc:L175]'s synthesised `setProduct(this)` — and the data property carries the
 * option group's IDENTIFIER, a string rather than an entity, because
 * [model/service/ProductService.cfc:L115] passes it as the argument of an identifier-keyed
 * `getOptionGroup(id)` resolver.
 *
 * @param product the resolved product, read inside the transaction
 * @param data the parsed request payload
 * @returns the process object, with an unusable `optionGroup` OMITTED rather than blanked
 */
function buildAddOptionGroupProcessObject(
  product: Product,
  data: Record<string, unknown>,
): ProductAddOptionGroup {
  const optionGroup: string | undefined = readProcessText(data, OPTION_GROUP_DATA_KEY);

  return {
    product,
    ...(optionGroup !== undefined ? { [OPTION_GROUP_DATA_KEY]: optionGroup } : {}),
  };
}

/**
 * Assembles the `addOption` process object.
 *
 * `model/process/Product_AddOption.cfc` declares the injected entity `product` at [:L52] and the single data
 * property `option` at [:L55], read as an identifier by [model/service/ProductService.cfc:L130].
 *
 * @param product the resolved product, read inside the transaction
 * @param data the parsed request payload
 * @returns the process object, with an unusable `option` OMITTED rather than blanked
 */
function buildAddOptionProcessObject(
  product: Product,
  data: Record<string, unknown>,
): ProductAddOption {
  const option: string | undefined = readProcessText(data, OPTION_DATA_KEY);

  return {
    product,
    ...(option !== undefined ? { [OPTION_DATA_KEY]: option } : {}),
  };
}

/**
 * Assembles the `updateSkus` process object.
 *
 * `model/process/Product_UpdateSkus.cfc` declares the injected entity at [:L52] and FOUR data properties at
 * [:L55-L58], as TWO INTERLEAVED FLAG-AND-VALUE PAIRS — `updatePriceFlag`, `price`,
 * `updateListPriceFlag`, `listPrice` — and that declaration order is preserved below because
 * `model/validation/Product_UpdateSkus.json` keys each conditional rule group off its own flag.
 *
 * ⚠️ THE TWO PAIRS ARE INDEPENDENT. ../domain/process/ProductUpdateSkus records that "one flag being met has
 * no effect whatsoever on the other price's rule", so each of the four keys is read and omitted on its own;
 * no pair is completed, defaulted or inferred from its sibling.
 *
 * @param product the resolved product, read inside the transaction
 * @param data the parsed request payload
 * @returns the process object, with every unusable key OMITTED rather than blanked
 */
function buildUpdateSkusProcessObject(
  product: Product,
  data: Record<string, unknown>,
): ProductUpdateSkus {
  const updatePriceFlag: string | number | undefined = readProcessScalar(
    data,
    UPDATE_PRICE_FLAG_DATA_KEY,
  );
  const price: string | number | undefined = readProcessScalar(data, PRICE_DATA_KEY);
  const updateListPriceFlag: string | number | undefined = readProcessScalar(
    data,
    UPDATE_LIST_PRICE_FLAG_DATA_KEY,
  );
  const listPrice: string | number | undefined = readProcessScalar(data, LIST_PRICE_DATA_KEY);

  return {
    product,
    ...(updatePriceFlag !== undefined ? { updatePriceFlag } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(updateListPriceFlag !== undefined ? { updateListPriceFlag } : {}),
    ...(listPrice !== undefined ? { listPrice } : {}),
  };
}

/* ================================================================================================
 * RESPONSE PROJECTION
 * ============================================================================================== */

/**
 * Projects a product onto the minimal representation a route returns.
 *
 * The whole of {@link ProductResponse}'s reasoning applies here; this function is its enforcement. It is
 * written as an explicit member-by-member construction rather than as a spread-and-delete or a key filter,
 * deliberately: a projection built by REMOVING members silently republishes anything a future field adds to
 * the entity, whereas one built by NAMING members cannot. That matters more for this entity than for most,
 * because `Product` carries nine relationship collections into explicitly excluded domains.
 *
 * The two relationships are reduced to their IDENTIFIERS rather than nested, which keeps a brand's or a
 * product type's own graph — and the product type's nine excluded-domain collections — out of a product
 * response entirely.
 *
 * @param product the domain instance, which is not mutated
 * @returns the minimal representation, with absent members omitted
 */
function toProductResponse(product: Product): ProductResponse {
  const response: ProductResponse = {
    productID: product.productID,
    ...(product.activeFlag !== undefined ? { activeFlag: product.activeFlag } : {}),
    ...(product.urlTitle !== undefined ? { urlTitle: product.urlTitle } : {}),
    ...(product.productName !== undefined ? { productName: product.productName } : {}),
    ...(product.productCode !== undefined ? { productCode: product.productCode } : {}),
    ...(product.productDescription !== undefined
      ? { productDescription: product.productDescription }
      : {}),
    ...(product.publishedFlag !== undefined ? { publishedFlag: product.publishedFlag } : {}),
    ...(product.sortOrder !== undefined ? { sortOrder: product.sortOrder } : {}),
    ...(product.calculatedSalePrice !== undefined
      ? { calculatedSalePrice: product.calculatedSalePrice }
      : {}),
    ...(product.calculatedQATS !== undefined ? { calculatedQATS: product.calculatedQATS } : {}),
    ...(product.calculatedAllowBackorderFlag !== undefined
      ? { calculatedAllowBackorderFlag: product.calculatedAllowBackorderFlag }
      : {}),
    ...(product.calculatedTitle !== undefined ? { calculatedTitle: product.calculatedTitle } : {}),
    ...(product.brand !== undefined ? { brandID: product.brand.brandID } : {}),
    ...(product.productType !== undefined
      ? { productTypeID: product.productType.productTypeID }
      : {}),
  };

  return response;
}

/**
 * Projects a collection of products, preserving order and cardinality exactly.
 *
 * ⚠️ NOTHING IS SORTED, FILTERED, DE-DUPLICATED OR COMPACTED HERE. The ORDER a smart list produces IS its
 * behavior — it is what the `OrderBy` key and the port's own ordering exist to produce — so a projection
 * that reordered or dropped an element would silently undo the computation the caller asked for. The mapping
 * is positional and total.
 *
 * @param products the domain instances, which are not mutated
 * @returns the projections, in the same order and of the same length
 */
function toProductResponses(products: readonly Product[]): readonly ProductResponse[] {
  return products.map(toProductResponse);
}

/**
 * Projects a smart list page, carrying its five paging numbers across untouched.
 *
 * The reasoning is recorded on {@link ProductSmartListResponse}: the seven members are the smart list's own
 * seven, and the only change is that the two record collections carry projections instead of entities.
 *
 * @param result the smart list page the service produced
 * @returns the same page, with both record collections projected
 */
function toProductSmartListResponse(result: SmartListResult<Product>): ProductSmartListResponse {
  return {
    records: toProductResponses(result.records),
    pageRecords: toProductResponses(result.pageRecords),
    recordsCount: result.recordsCount,
    pageRecordsStart: result.pageRecordsStart,
    pageRecordsEnd: result.pageRecordsEnd,
    currentPage: result.currentPage,
    totalPages: result.totalPages,
  };
}

/**
 * Projects a product type onto the minimal representation a route returns.
 *
 * Built by naming members, for the reason recorded on {@link toProductResponse}. The parent is reduced to
 * its identifier, which is what keeps a self-referencing hierarchy from serialising an unbounded ancestor
 * chain — and `childProductTypes` and `products` are omitted entirely for the same reason.
 *
 * @param productType the domain instance, which is not mutated
 * @returns the minimal representation, with absent members omitted
 */
function toProductTypeResponse(productType: ProductType): ProductTypeResponse {
  const response: ProductTypeResponse = {
    productTypeID: productType.productTypeID,
    ...(productType.productTypeIDPath !== undefined
      ? { productTypeIDPath: productType.productTypeIDPath }
      : {}),
    ...(productType.activeFlag !== undefined ? { activeFlag: productType.activeFlag } : {}),
    ...(productType.publishedFlag !== undefined
      ? { publishedFlag: productType.publishedFlag }
      : {}),
    ...(productType.urlTitle !== undefined ? { urlTitle: productType.urlTitle } : {}),
    ...(productType.productTypeName !== undefined
      ? { productTypeName: productType.productTypeName }
      : {}),
    ...(productType.productTypeDescription !== undefined
      ? { productTypeDescription: productType.productTypeDescription }
      : {}),
    ...(productType.systemCode !== undefined ? { systemCode: productType.systemCode } : {}),
    ...(productType.parentProductType !== undefined
      ? { parentProductTypeID: productType.parentProductType.productTypeID }
      : {}),
  };

  return response;
}

/**
 * Projects one SKU onto the minimal representation the option-resolution route returns.
 *
 * Built by naming members, for the reason recorded on {@link toProductResponse}; `Sku` carries twelve
 * relationship collections into out-of-scope domains, so the naming discipline matters here too. The three
 * price members are the STORED numbers and no currency formatting is applied: that is ../util/formatting's
 * and the feed serializer's business, and the settings it would need reach an out-of-scope resolver.
 *
 * @param sku the domain instance, which is not mutated
 * @returns the minimal representation, with absent members omitted
 */
function toProductSkuResponse(sku: Sku): ProductSkuResponse {
  const response: ProductSkuResponse = {
    skuID: sku.skuID,
    ...(sku.skuCode !== undefined ? { skuCode: sku.skuCode } : {}),
    price: sku.price,
    listPrice: sku.listPrice,
    renewalPrice: sku.renewalPrice,
    activeFlag: sku.activeFlag,
    userDefinedPriceFlag: sku.userDefinedPriceFlag,
    ...(sku.imageFile !== undefined ? { imageFile: sku.imageFile } : {}),
  };

  return response;
}

/**
 * Projects the SKUs the option-resolution route returns, preserving order and cardinality exactly.
 *
 * ⚠️ THE CARDINALITY IS PART OF THE ANSWER ON THIS PATH, MORE THAN ANYWHERE ELSE IN THE FILE.
 * `Product.getSkuBySelectedOptions` [model/entity/Product.cfc:L349-L364] raises on "more than one" and on
 * "none", and `Sku.hasUniqueOptions` [model/entity/Sku.cfc:L756-L769] tests the length of this very result.
 * A projection that de-duplicated would answer "one" where the query answered "two" and would silently
 * defeat both callers — which is also why AAP §0.6.1.3's T4 keeps distinct-row selection inside the
 * repository rather than compensating for a join fan-out here. ⛔ NO STATEMENT TEXT, DISTINCT CLAUSE OR
 * PARAMETER ARRAY IS NAMED, CONSTRUCTED OR FORWARDED ANYWHERE IN THIS FILE: a boundary that mentioned one
 * would be a boundary that could be persuaded to build one (AAP §0.7.3 S2, inverted into a prohibition).
 *
 * @param skus the domain instances, which are not mutated
 * @returns the projections, in the same order and of the same length
 */
function toProductSkuResponses(skus: readonly Sku[]): readonly ProductSkuResponse[] {
  return skus.map(toProductSkuResponse);
}

/**
 * Projects the formatted option groups, preserving entry order and collapse semantics.
 *
 * ⚠️ THE ARRAY IS REBUILT ENTRY BY ENTRY RATHER THAN COPIED WHOLESALE, AND THAT IS WHAT PRESERVES THE
 * BEHAVIOUR. `map` keeps position, which is the first-seen order
 * [model/service/ProductService.cfc:L75-L77] built the groups in, and the array arrives with same-named
 * groups ALREADY collapsed — because [:L76] is a plain struct assignment and the last one wins. Nothing
 * here de-duplicates, suffixes, sorts or reorders; the two option members are copied exactly as the sibling
 * service projected them, and the label is copied verbatim.
 *
 * @param groups the entries the service produced, in first-seen option-group order
 * @returns the same entries, in the same order, with each option projected member by member
 */
function toFormattedOptionGroupsResponse(
  groups: readonly FormattedOptionGroup[],
): FormattedOptionGroupsResponse {
  return groups.map((group) => ({
    optionGroupName: group.optionGroupName,
    options: group.options.map((option: SelectOption) => ({
      name: option.name,
      value: option.value,
    })),
  }));
}

/* ================================================================================================
 * THE FACTORY
 * ============================================================================================== */

/**
 * Builds the routed product boundary over an already-constructed service.
 *
 * ⭐ IT CONSTRUCTS NOTHING AND RESOLVES NOTHING BY NAME, WHICH IS THE WHOLE OF AAP §0.7.3 S3 —
 * "Constructor injection only. No service locator, no dynamic method synthesis, no string-keyed runtime
 * resolution." All three collaborators arrive as parameters, from src/handlers/router.ts, which obtains
 * them from the memoized composition root. There is no `new` in this file, no `getService("name")`, no
 * `Proxy`, no `Reflect`, no decorator, no container import and no indexer dispatch over a name — because
 * re-creating `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281] in a new idiom would defeat the
 * exercise rather than complete it (TR-3).
 *
 * ⭐ EVERY COLLABORATOR IS REQUIRED, SO "MOUNTED WITHOUT A POLICY" IS NOT A REACHABLE STATE. None of the
 * three parameters is optional and none has a default, so a caller cannot omit the authorisation resolver
 * and silently get an open boundary, nor omit the write runner and silently get untransacted writes. That
 * is the structural default-deny discipline ../ports/AccountContextPort states for its own ports, and it is
 * what will force the composition root to wire both when it is written — the compiler will not let it be
 * forgotten.
 *
 * @param productService the eighteen-member product surface, already constructed
 * @param resolveAuthorization the request's authorisation context, per invocation
 * @param writeRunner the transaction boundary, which builds a transaction-scoped graph per write
 * @returns the eighteen routed operations, frozen
 */
export function createProductHandler(
  productService: ProductHandlerService,
  resolveAuthorization: RequestAuthorizationResolver<ProductAuthorizationEvent>,
  writeRunner: TransactionalWriteRunner<ProductWriteGraph>,
): ProductHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one routed member.
   *
   * The ladder is reproduced in the legacy's own order, and each step cites the line it comes from:
   *
   *   1. NO PRINCIPAL AT ALL -> unauthorised. The legacy read the account off the framework scope and,
   *      with no logged-in session, fell through every classification test to the terminal
   *      `return false` at [org/Hibachi/HibachiAuthenticationService.cfc:L83].
   *   2. A PRINCIPAL THAT IS NOT LOGGED IN -> unauthorised. [:L30] gates every remaining test on
   *      `getHibachiScope().getLoggedInFlag()`, whose body is `if(!getSession().getAccount().isNew())`
   *      [org/Hibachi/HibachiScope.cfc:L40-L45]. ⚠️ THE LEGACY PREDICATE IS THE NEGATION OF "NEW", so the
   *      test below is on `newFlag` being TRUE rather than false — `AccountReference.newFlag` carries
   *      `isNew()` itself, not the logged-in flag derived from it. Inverting that would admit exactly the
   *      callers the legacy refused.
   *   3. AN `'anyLogin'` MEMBER IS ALREADY DECIDED HERE. The branch that authorises its legacy item
   *      [:L32-L34] `return true`s outright, asking no permission question and naming no entity, so this
   *      gate must stop for those rows. Asking an entity question there would REFUSE callers the legacy
   *      admitted — a behavior change dressed up as caution (AAP §0.8.2 Guideline 4). The eight
   *      `processProductXxx` rows take this path; {@link PRODUCT_ACCESS_MATRIX} carries the evidence.
   *   4. A `'secure'` MEMBER CONTINUES TO THE ENTITY QUESTION at [:L50-L79], whose verdict comes from the
   *      injected port. That port resolves the super-user bypass at [:L86-L88] and the permission-group
   *      walk at [:L91-L97] behind the boundary and returns one boolean.
   *
   * ⭐ THE CRUD TYPES ARE ASKED IN ORDER AND THE FIRST GRANT WINS, WHICH IS THE `save` BRANCH'S OWN SHAPE.
   * [:L71-L77] asks for `create` first, returns true if that is granted, and only then asks for `update`.
   * The loop below is that behaviour generalised over a non-empty tuple, so the single-question rows and
   * the two-question rows take the same path. Because the tuple type forbids an empty list, a row cannot
   * silently authorise nothing.
   *
   * ⭐ THE ENTITY NAME COMES FROM THE MATRIX ROW, NEVER FROM THE REQUEST. ../ports/AccountContextPort
   * requires exactly that of every call site. The three names it can be are the module constants
   * {@link PRODUCT_ENTITY_NAME}, {@link PRODUCT_TYPE_ENTITY_NAME} and {@link SKU_ENTITY_NAME}.
   *
   * Steps 1 and 2 answer 401 and step 4 answers 403, and the distinction is about the PRINCIPAL rather
   * than the resource: see {@link unauthorizedResponse} and {@link forbiddenResponse}, where the
   * translation from the legacy login redirect is recorded.
   *
   * ⭐ IT TAKES THE MEMBER NAME, NOT A REQUIREMENT, SO A CALL SITE CANNOT DISAGREE WITH THE MATRIX. Because
   * the parameter is `keyof ProductHandler`, a name that is not a routed member does not compile, and a
   * member removed from the surface takes its call site down with it.
   *
   * ⭐ IT RETURNS THE REFUSAL, NOT A BOOLEAN, AND CALLERS RETURN IT IMMEDIATELY. A boolean would let a
   * member forget to return and fall through into the operation it was supposed to guard; a response value
   * cannot be ignored without the compiler noticing that a branch produces nothing.
   *
   * SYNCHRONOUS, because both port members are — ../ports/AccountContextPort records why — so no member's
   * declared return type changes on its account.
   *
   * @param event the invocation's event, or any object carrying its headers member
   * @param member the routed member being invoked, whose requirement is read from the matrix
   * @returns the refusal to return to the caller, or nothing when the invocation is authorised
   */
  const refuseUnauthorized = (
    event: ProductAuthorizationEvent,
    member: keyof ProductHandler,
  ): APIGatewayProxyResult | undefined => {
    const requirement: ProductAccessRequirement = PRODUCT_ACCESS_MATRIX[member];
    const authorization: RequestAuthorizationContext = resolveAuthorization(event);
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2. `newFlag` is `isNew()`, so TRUE means "not logged in".
    if (account === undefined || account.newFlag) {
      return unauthorizedResponse();
    }

    // Step 3. Nothing below this line runs for the eight 'anyLogin' rows.
    if (requirement.classification === 'anyLogin') {
      return undefined;
    }

    // Step 4. Asked in the matrix row's own order; the first grant authorises the invocation.
    for (const crudType of requirement.crudTypes) {
      if (
        authorization.entityAuthorization.authenticateEntity({
          crudType,
          entityName: requirement.entityName,
        })
      ) {
        return undefined;
      }
    }

    return forbiddenResponse();
  };

  /**
   * Runs one write against an ADDRESSED product, inside one transaction, behind the complete commit gate.
   *
   * ⭐ THE GATE LIVES HERE, IN ONE PLACE, SO NO ROUTE CAN FORGET IT. Ten of the eleven write routes address
   * an existing product and differ only in which service member they call, so factoring the transaction,
   * the in-transaction read and the gate into one helper is what makes "every product write is gated" a
   * property of the code rather than a claim about ten separate copies of it. The member each route calls
   * is supplied as `work`, and nothing else varies.
   *
   * ⭐ THE PRODUCT IS READ THROUGH THE GRAPH, NOT THROUGH THE CAPTURED SERVICE — judgment (k). A service
   * holds its repository and a repository holds its executor FROM CONSTRUCTION, so reading through the
   * captured service would read on a DIFFERENT connection and would not see the rows this transaction is
   * writing. That matters concretely and not theoretically: AAP §0.6.2 records that
   * `Sku.hasUniqueOptions` QUERIES the sibling SKUs the same operation is writing, and AAP §0.6.6 M6 calls
   * that the highest-risk behaviour in the slice.
   *
   * ⛔ THE GATE IS `skuBatchHasErrors`, THE COMPLETE PREDICATE, AND A PRODUCT-ONLY READING WOULD COMMIT
   * INVALID WORK — judgment (l), verified against the service rather than assumed:
   *   - Every `processProductXxx` member opens with the ported validation pipeline and then
   *     `if (product.hasErrors()) return product;`, so its own findings land on the PRODUCT's bag.
   *   - `saveProduct` and `processProductAddOption` additionally reach `SkuService.createSkus`, whose
   *     per-SKU rule findings land on the SKU that produced them and are DELIBERATELY not merged upward —
   *     ../services/SkuService forbids reinstating that merge, because it would re-key a SKU's `skuCode`
   *     finding onto the product and lose which SKU failed.
   *   - `saveProduct` then persists on `if (!product.hasErrors())` and RETURNS THE PRODUCT either way, so
   *     a batch whose SKUs all failed validation is indistinguishable from a clean one by return value.
   * A gate reading only the product's bag would therefore commit exactly that case. This one reads both.
   *
   * ⚠️ `null` MEANS "NO SUCH PRODUCT" AND NOTHING ELSE. It is safe to overload the return this way only
   * because every `TResult` in use here is a `Product` or a `boolean`, neither of which can be `null`; a
   * future caller whose result type includes `null` must not use this helper.
   *
   * THE EMPTY TRANSACTION ON THE MISSING-PRODUCT PATH IS COMMITTED, NOT ROLLED BACK, because nothing was
   * written and a roll-back would report a failure the caller did not cause.
   *
   * @param productID the addressed product identifier
   * @param work the service member to run, given the transaction-scoped graph and the resolved product
   * @returns the member's result, or `null` when the addressed product does not exist
   */
  const runProductWrite = async <TResult>(
    productID: string,
    work: (graph: ProductWriteGraph, product: Product) => Promise<TResult>,
  ): Promise<TResult | null> => {
    let subject: Product | null = null;

    return writeRunner.runWrite<TResult | null>(
      async (graph) => {
        const product: Product | null = await graph.getProduct(productID);

        if (product === null) {
          return null;
        }

        subject = product;

        return work(graph, product);
      },
      () => subject !== null && skuBatchHasErrors(subject),
    );
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 1 OF 15
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L65]
   * `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`.
   *
   * ==============================================================================================
   * ⚠️⚠️ MISMATCH M1 — A ONE-HOUR REQUEST BUDGET, WHICH A SINGLE LAMBDA INVOCATION CANNOT EXPRESS
   * ==============================================================================================
   * The legacy member's SECOND statement, verbatim from [model/service/ProductService.cfc:L66]:
   *
   *     getHibachiTagService().cfSetting(requesttimeout="3600");
   *
   * The declared budget is therefore **3600 seconds**, at
   * [model/service/ProductService.cfc:L65-L68]. AWS Lambda's **maximum function timeout is 15 minutes**
   * — a published platform limit, cited as such — so a 3600-second budget is **UNREPRESENTABLE** in a
   * single invocation. AAP §0.6.6 states the consequence and the required treatment in its own words:
   * "The importer's handler is documented as requiring an out-of-band model (chunked or queued), **not**
   * silently re-timed to fit."
   *
   * ⛔ THIS BOUNDARY THEREFORE DOES NOT RESOLVE THE MISMATCH, AND THE NON-RESOLUTION IS THE DELIVERABLE.
   * Nothing here invents a chunk size, a page size, a batch size, a queue name, a retry count, a backoff
   * schedule, a concurrency limit or a replacement timeout. The budget is not silently re-timed to 900
   * seconds and it is not capped. Choosing between a chunked model and a queued one is a decision left
   * declared and open, because either choice would change what a caller observes and neither is derivable
   * from the source (AAP §0.7.3 S9, IR-12).
   *
   * ⛔ AND THE ENTRY POINT IS NOT DELETED OR HIDDEN. TR-5 is explicit: "The member is never quietly
   * dropped from the interface." It is routed, gated and callable; what it cannot do is complete a
   * one-hour import inside a fifteen-minute invocation, and that is stated rather than papered over.
   *
   * TWO MISMATCHES COMPOUND M1, AND BOTH ARE NAMED HERE RATHER THAN LEFT TO BE REDISCOVERED:
   *
   *   **M3 — PER-ROW TRANSACTIONS.** [model/dao/ProductDAO.cfc:L177] opens `transaction{` INSIDE the
   *   record loop, so the importer commits ONE TRANSACTION PER ROW, not one per import. AAP §0.6.6:
   *   "Each row commits independently, so a mid-file failure leaves a **partially imported catalog**."
   *   ⭐ THIS IS WHY THIS ROUTE IS THE ONE WRITE THAT DOES NOT GO THROUGH {@link runProductWrite} OR
   *   ANY OTHER TRANSACTION OPENED HERE — judgment (m). Wrapping the import in a single unit would
   *   replace many small commits with one enormous one and would change what a mid-file failure leaves
   *   behind. The per-row boundary belongs to the repository, which owns it, and
   *   {@link ProductWriteGraph} deliberately omits this member so the compiler prevents it being called
   *   from inside a transaction by accident.
   *
   *   **M4 — REMOTE FETCH INSIDE THE REQUEST.** [model/dao/ProductDAO.cfc:L87] performs
   *   `getService("utilityTagService").cfhttp(method="get", url=arguments.fileURL, delimiter=delimiter,
   *   textQualifier=arguments.textQualifier)`. ⚠️ THE `var http = new http();` ALTERNATIVE AT [:L90] IS
   *   COMMENTED OUT — the block comment opens at [:L89] — under the note at [:L88] that "script based
   *   http method doens't work for tab delimiter" [sic]. It is recorded here as the DISABLED path it is,
   *   not as a live fallback, because a reader told it were live would look for a branch that does not
   *   execute. Network I/O inside the transaction-bearing request, compounding both M1 and M3. Not
   *   resolved here either: the fetch is the repository's, and so is the gate that guards it.
   *
   * ⭐ SEC-HARDENING (D18-CLASS) — REVIEW FINDING F9 (CWE-918). THE LOCATION READ AT
   * {@link FILE_URL_QUERY_PARAMETER} IS CALLER-CONTROLLED AND IS DEREFERENCED SERVER-SIDE, WHICH IS THE
   * FINDING. This route forwards it unexamined, on purpose, and an earlier revision of this note placed
   * the guarding policy in "the service's" hands, which was wrong: `ProductService.loadDataFromFile` is a
   * positional delegation that opens no socket either. The refusal belongs at the SINK, so
   * `ProductImportSourcePolicy` is declared on `../ports/repositories/ProductRepository` and enforced in
   * `../adapters/mysql/MySqlProductRepository` before any reader is invoked. A gate placed HERE would
   * protect only callers that arrive through this route, while the composition root reaches the adapter
   * directly.
   *
   * ⚠️ WHAT THAT MEANS FOR THIS RESPONSE. A refused location arrives as an `ImportSourceRejectedError`,
   * whose public presentation is `CATALOG_REQUEST_REJECTED` — a 400, because the caller can name a
   * permitted location — carrying a message that names neither the location nor the policy. It travels the
   * ordinary classified-error path below; nothing here re-wraps it, and re-wrapping it would drop the
   * presentation and turn a configured refusal into an unclassified 500.
   *
   * TWO ARGUMENTS, IN THE LEGACY'S ORDER AND WITH THE LEGACY'S OPTIONALITY — judgment (h). `fileURL` is
   * `required`, so its absence is answered here rather than forwarded. `textQualifier` carries a default,
   * so its absence is FORWARDED AS ABSENCE and the service's own default applies; restating `""` here
   * would put a second declaration of the same default at the boundary.
   *
   * THE MEMBER DECLARES `void`, SO THERE IS NOTHING TO PROJECT. A successful attempt answers 200 with a
   * `null` body — the honest report that the operation was performed and returned nothing. No status code
   * is invented for it, no synthesised envelope is wrapped around it, and no row count or summary is
   * fabricated: the legacy member returns nothing, so nothing is what this boundary has to report.
   *
   * ⛔ THE GATE RUNS BEFORE EITHER ARGUMENT IS READ. This is the widest write in the file, and
   * {@link PRODUCT_ACCESS_MATRIX} records why it asks the `save` branch's own `create`-then-`update` pair
   * on `Product` despite no legacy item having existed for it.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its query-string-parameters and headers members
   * @returns 200 with a null body when the import was attempted, or the response describing why not
   */
  const loadDataFromFile = async (event: LoadDataFromFileEvent): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'loadDataFromFile');

    if (refusal !== undefined) {
      return refusal;
    }

    const fileURL: string | undefined = readQueryStringParameter(event, FILE_URL_QUERY_PARAMETER);

    if (fileURL === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, FILE_URL_REQUIRED_MESSAGE);
    }

    /* Optional at [:L65], so absence is forwarded as absence and the service's default applies. */
    const textQualifier: string | undefined = readQueryStringParameter(
      event,
      TEXT_QUALIFIER_QUERY_PARAMETER,
    );

    try {
      /* The two call forms are distinguished rather than collapsed, because passing `undefined`
       * explicitly is NOT the same as omitting the argument under `exactOptionalPropertyTypes`, and
       * omitting it is what lets the service's own default apply. */
      if (textQualifier === undefined) {
        await productService.loadDataFromFile(fileURL);
      } else {
        await productService.loadDataFromFile(fileURL, textQualifier);
      }

      return okResponse(null);
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 2 OF 15
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L70]
   * `public any function getFormattedOptionGroups(required any product)`.
   *
   * ONE ARGUMENT, AND IT IS AN ENTITY RATHER THAN AN IDENTIFIER, so the product is resolved first — the
   * same adjudication ./brandHandler records for its own entity-taking members. The read is NOT
   * transactional: nothing is written, and enclosing a pure read in a transaction would invent a boundary
   * the legacy did not have.
   *
   * ⚠️ THE RESULT IS AN ARRAY OF NAME-AND-OPTIONS ENTRIES, WHICH IS WHAT AAP §0.4.2.1 TABULATES (defect
   * D25 — the legacy body builds a name-keyed struct instead). Three behaviours travel through untouched,
   * and {@link toFormattedOptionGroupsResponse} is where they are enforced: the label is the group NAME and
   * never the group ID; same-named groups COLLAPSE TO ONE ENTRY, because
   * [model/service/ProductService.cfc:L76] is a plain struct assignment; and NOTHING IS SORTED, because
   * the legacy sorts neither the groups nor the options within a group.
   *
   * ⛔ THE GATE RUNS BEFORE THE IDENTIFIER IS READ, WHICH IS THE ANTI-ENUMERATION PROPERTY. Because the
   * refusal is decided without consulting the identifier or the repository, an unauthorised caller
   * receives the SAME response for a product that exists and one that does not.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the option-group entries in first-seen order, or the response describing why they could not
   *   be returned
   */
  const getFormattedOptionGroups = async (
    event: ProductIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getFormattedOptionGroups');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const product: Product | null = await productService.getProduct(productID);

      if (product === null) {
        return notFoundResponse();
      }

      return okResponse(
        toFormattedOptionGroupsResponse(await productService.getFormattedOptionGroups(product)),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 3 OF 15 — THE PROMPT'S OWN WORKED EXAMPLE
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L104]
   * `public any function getProductSkusBySelectedOptions(required string selectedOptions, required string
   * productID)`.
   *
   * ⭐ AAP §0.8.3.1 CITES THIS MEMBER BY NAME: "`ProductService.getProductSkusBySelectedOptions()` must
   * have a TypeScript equivalent of the same name and behavior." The name is identical at every layer —
   * boundary, service and legacy — which is what makes the parity check possible by inspection.
   *
   * ⛔⛔ BOTH ARGUMENTS ARE FORWARDED POSITIONALLY AND UNCHANGED, `selectedOptions` FIRST AND `productID`
   * SECOND. Both are `string`, so an inverted call would TYPE-CHECK PERFECTLY and then ask for the SKUs
   * of a product whose identifier is an option list — returning an empty result with no error anywhere.
   * The order is the one two in-repository callers already pass positionally and depend on:
   * [model/entity/Product.cfc:L367] passes `(arguments.selectedOptions, this.getProductID())`, and the
   * out-of-scope [model/process/Order_AddOrderItem.cfc:L238] passes
   * `(getSelectedOptionIDList(), getProduct().getProductID())`. AAP §0.2's preservation goal names both as
   * callers that must not be broken.
   *
   * ⚠️⚠️ T5 — AN EMPTY `selectedOptions` IS A LEGAL, MEANINGFUL INPUT, AND THIS IS THE "option-to-SKU
   * resolution edge case" GUIDELINE 6 NAMES BY NAME (judgment (d)). `Product.getSkusBySelectedOptions`
   * defaults it to `""`, `listLen("")` is zero, the repository appends ZERO `EXISTS` clauses, and the query
   * legitimately degenerates to "all option-bearing SKUs of this product". AAP §0.6.1.3 records that both
   * `Product.getSkuBySelectedOptions` and `Sku.hasUniqueOptions` DEPEND on that degenerate form. So it is
   * NOT rejected, NOT defaulted, NOT normalised, NOT trimmed and NOT guarded against anywhere on this path
   * — {@link readSelectedOptions} distinguishes "not supplied" from "supplied and empty" precisely so the
   * second can reach the service.
   *
   * ⚠️ THE LIST IS NOT SPLIT HERE. The legacy declares one `required string` and the service performs the
   * split; a second parser at the boundary could diverge from the one that owns the behaviour.
   *
   * BOTH ARGUMENTS ARE `required`, so both absences are answered here rather than forwarded — judgment
   * (h). "Supplied and empty" is not an absence and is forwarded.
   *
   * ⛔ THE GATE ASKS ABOUT `Sku`, NOT `Product`, because SKUs are what this member returns; see
   * {@link SECURE_SKU_READ_REQUIREMENT}. It runs before either input is read, so an unauthorised caller
   * cannot use the two distinct bad-request texts to discover the request shape.
   *
   * NET-NEW coverage (AAP §0.6.5.2). AAP §0.6.5.2 records that no `SkuDAOTest` exists either, so the
   * option-resolution semantics are net-new at every layer.
   *
   * @param event the proxy event, or any object carrying its path-parameters, query-string-parameters and
   *   headers members
   * @returns the matching SKUs, projected, or the response describing why they could not be returned
   */
  const getProductSkusBySelectedOptions = async (
    event: SelectedOptionsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getProductSkusBySelectedOptions');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    /* Absence is answered because [:L104] declares it `required`; an EMPTY list is a value, not an
     * absence, and travels on untouched (T5). */
    const selectedOptions: string | undefined = readSelectedOptions(event);

    if (selectedOptions === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SELECTED_OPTIONS_REQUIRED_MESSAGE);
    }

    try {
      // OPTIONS FIRST, PRODUCT SECOND — the legacy order, and an inversion here would type-check.
      return okResponse(
        toProductSkuResponses(
          await productService.getProductSkusBySelectedOptions(selectedOptions, productID),
        ),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBERS 4 THROUGH 11 OF 15 — THE PROCESS PIPELINE
   *
   * All eight share one shape: authorise, read the addressed product identifier, parse the payload where
   * the legacy declares one, then run the member through {@link runProductWrite} — which opens the
   * transaction, resolves the product INSIDE it, and gates the commit on the complete predicate. Each
   * route's own notes record what is specific to it: its verbatim legacy identifier (judgment (c)), its
   * argument shape, and, where it is boundary-stubbed, the out-of-scope collaborator responsible
   * (judgment (f)).
   *
   * ALL EIGHT ARE `'anyLogin'`, AND THAT IS EVIDENCE RATHER THAN LENIENCE — see
   * {@link PRODUCT_ACCESS_MATRIX}, where the `process` branch's bare `return true` at
   * [org/Hibachi/HibachiAuthenticationService.cfc:L68-L69] and the five rendered `preprocessproduct_*.cfm`
   * views are both cited.
   *
   * EVERY ONE RETURNS THE PRODUCT, PROJECTED, because every legacy member returns
   * `arguments.product` — including on the paths where it recorded findings instead of doing the work.
   * That is deliberate parity: a caller learns what happened from the product it gets back, exactly as the
   * legacy caller did. A member that recorded findings does not commit, so the response describes work
   * that was attempted and discarded.
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L113] — was
   * `public any function processProduct_addOptionGroup(required any product, required any processObject)`
   * (judgment (c)).
   *
   * TWO ARGUMENTS, BOTH `required`: the PRODUCT first, the PROCESS OBJECT second. The process object is a
   * TYPED data shape — `model/process/Product_AddOptionGroup.cfc` declares the injected `product` at [:L52]
   * and the single data property `optionGroup` at [:L55] — so it is assembled here by
   * {@link buildAddOptionGroupProcessObject}, which is the job the framework's populator did.
   *
   * ⚠️ TODO(parity) D14 — [model/service/ProductService.cfc:L113-L126] adds only `options[1]`, the FIRST
   * option of the new group, to every existing SKU. AAP §0.6.7.4 registers that as observed behaviour;
   * ../services/ProductService carries it unrepaired, and this boundary neither compensates for it nor
   * exposes a second call form that would work around it (AAP §0.8.2 Guideline 4).
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductAddOptionGroup = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductAddOptionGroup');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductAddOptionGroup(
          product,
          buildAddOptionGroupProcessObject(product, body.value),
        ),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L128] — was
   * `public any function processProduct_addOption(required any product, required any processObject)`
   * (judgment (c)).
   *
   * TWO ARGUMENTS, BOTH `required`. The process object is the typed data shape
   * `model/process/Product_AddOption.cfc` declares — the injected `product` at [:L52] and the data property
   * `option` at [:L55], read as an IDENTIFIER by [model/service/ProductService.cfc:L130].
   *
   * ⭐ ONE OF THE TWO MEMBERS THAT REACHES `SkuService.createSkus` [:L150], WHICH IS WHY THE COMPLETE
   * COMMIT GATE MATTERS HERE. Per-SKU rule findings land on the SKU rather than on the product, so a gate
   * reading only `product.hasErrors()` would commit a batch of invalid SKUs. {@link runProductWrite}
   * records the evidence.
   *
   * ⚠️ THE PAYLOAD REACHES `createSkus` UNRESHAPED — judgment (i). AAP §0.6.7.8 records that the odometer's
   * enumeration order derives from the payload and "determines both the generated SKU set and … the order in
   * which uniqueness validation observes its siblings".
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductAddOption = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductAddOption');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductAddOption(product, buildAddOptionProcessObject(product, body.value)),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L157] — was
   * `public any function processProduct_addProductReview(required any product, required any processObject)`
   * (judgment (c)).
   *
   * ⛔ BOUNDARY-STUBBED (TR-5, judgment (f)). THE OUT-OF-SCOPE COLLABORATORS ARE THE PRODUCT-REVIEW ENTITY
   * AND THE ACCOUNT CONTEXT: the `Content*.cfc` family under `model/` and the review entity fall outside AAP §0.2.2.1's
   * boundary, and the legacy member reads the current account off the framework scope. The member is
   * therefore PRESENT AND ROUTABLE — TR-5: "The member is never quietly dropped from the interface" — and
   * ../services/ProductService narrows the process object STRUCTURALLY, raising when the members it calls
   * are absent. That failure surfaces through {@link errorResponse}, which is where the not-implemented and
   * domain-failure branches decide the status; this route does not pre-empt it with a hardcoded refusal,
   * because the layer that owns the gap owns the message.
   *
   * ⚠️ THE PAYLOAD IS FORWARDED AS THE PARSED OBJECT, AND NO GETTERS ARE SYNTHESISED FOR IT. The service
   * narrows `unknown` by testing for CALLABLE members, which the legacy CFC's generated accessors provided
   * and a JSON body cannot. Manufacturing an accessor-bearing adapter here would be inventing a
   * process-object factory for a member whose collaborators are out of scope — capability beyond what the
   * migration requires (AAP §0.8.2 Guideline 4).
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductAddProductReview = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductAddProductReview');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductAddProductReview(product, body.value),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L173] — was
   * `public any function processProduct_addSubscriptionTerm(required any product, required any
   * processObject)` (judgment (c)).
   *
   * ⛔ BOUNDARY-STUBBED (TR-5, judgment (f)). THE OUT-OF-SCOPE COLLABORATOR IS `SubscriptionTermPort`:
   * the `Subscription*.cfc` family under `model/` is eleven files, all outside AAP §0.2.2.1's boundary, so the term is
   * resolved through the declared port rather than a converted service.
   *
   * ==============================================================================================
   * ⚠️ TODO(parity) D6 — THE MEMBER CANNOT COMPLETE, AND IT IS CARRIED UNREPAIRED (judgment (g))
   * ==============================================================================================
   * [model/service/ProductService.cfc:L180-L181], verbatim:
   *
   *     if( arguments.processObject.getListPrice() != "" && isNumeric(arguments.processObject.getListPrice() )) {
   *         newSku.setListPrice( arguments.data.listPrice );
   *     }
   *
   * The GUARD reads `arguments.processObject.getListPrice()` and the ASSIGNMENT reads
   * `arguments.data.listPrice` — but `processProduct_addSubscriptionTerm(product, processObject)` declares
   * NO `data` argument, so `data` is undefined at run time and the legacy raises there too.
   * ../services/ProductService raises at exactly that point with the defect named.
   *
   * ⛔ NO THIRD ARGUMENT IS ADDED TO THIS ROUTE TO MAKE IT WORK, the payload is not copied into a
   * fabricated `data` slot, and the guarded branch is not skipped to route around the raise. AAP §0.8.2
   * Guideline 4 forbids the repair, and AAP §0.6.7 records the governing rule as "preserve and annotate, do
   * not repair" with exactly one declared exception elsewhere in the port. This is not that exception.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductAddSubscriptionTerm = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductAddSubscriptionTerm');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductAddSubscriptionTerm(product, body.value),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L198] — was
   * `public any function processProduct_deleteDefaultImage(required any product, required struct data)`
   * (judgment (c)).
   *
   * ⚠️ THE SECOND ARGUMENT IS A `struct data`, NOT A PROCESS OBJECT — the only one of the eight declared
   * that way, and the difference is preserved rather than smoothed over: the parsed payload is forwarded as
   * the struct it is, with no process object assembled around it and no property names invented for it.
   *
   * ⛔ BOUNDARY-STUBBED (TR-5, judgment (f)). THE OUT-OF-SCOPE COLLABORATOR IS IMAGE HANDLING — the image
   * file, its directory and its deletion all live behind `ImagePathPort` and the file system the legacy
   * reached through the framework. ../services/ProductService performs the correctly scoped presence test
   * [:L199] and treats absence as a no-op exactly as written, raising only when an image file IS named.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductDeleteDefaultImage = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductDeleteDefaultImage');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductDeleteDefaultImage(product, body.value),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L208] — was
   * `public any function processProduct_updateDefaultImageFileNames( required any product )`
   * (judgment (c)).
   *
   * ⚠️ ONE ARGUMENT ONLY, AND NO SECOND ONE IS ADDED TO MAKE IT UNIFORM WITH ITS SEVEN SIBLINGS. It is the
   * single process member that takes no payload at all, so this route reads no body and declares an event
   * slice without one — which means a request carrying a body is neither rejected nor consulted, exactly as
   * the legacy member ignored anything but its product.
   *
   * ⛔ BOUNDARY-STUBBED (TR-5, judgment (f)). THE OUT-OF-SCOPE COLLABORATOR IS IMAGE HANDLING: [:L209-L211]
   * recomputes each SKU's image file name from members that reach `ImagePathPort`.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductUpdateDefaultImageFileNames = async (
    event: ProductIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductUpdateDefaultImageFileNames');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductUpdateDefaultImageFileNames(product),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L216] — was
   * `public any function processProduct_updateSkus(required any product, required any processObject)`
   * (judgment (c)).
   *
   * ⭐ FULLY PORTED, AND THE ONE PROCESS MEMBER WITH ITS OWN RULE SET.
   * `model/validation/Product_UpdateSkus.json` declares two CONDITIONAL groups — `price` is required only
   * when `updatePriceFlag eq 1`, `listPrice` only when `updateListPriceFlag eq 1` — which is why
   * {@link buildUpdateSkusProcessObject} omits an unusable key rather than blanking it: an ABSENT flag
   * leaves its `{"eq":1}` condition unmet — `getConditionsMeetFlag`
   * [org/Hibachi/HibachiValidationService.cfc:L97-L130] dispatching to `validate_eq` [:L385-L395], which
   * answers FALSE for a null value — and that switches the paired price's rule OFF, whereas an empty string
   * would MEET the condition and turn a switched-off rule into a failing one.
   *
   * FOUR DATA PROPERTIES, AS TWO INTERLEAVED AND INDEPENDENT PAIRS — `updatePriceFlag`, `price`,
   * `updateListPriceFlag`, `listPrice` at [model/process/Product_UpdateSkus.cfc:L55-L58]. Neither pair is
   * completed, defaulted or inferred from the other.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductUpdateSkus = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductUpdateSkus');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductUpdateSkus(product, buildUpdateSkusProcessObject(product, body.value)),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L235] — was
   * `public any function processProduct_uploadDefaultImage(required any product, required any
   * processObject)` (judgment (c)).
   *
   * ⛔ BOUNDARY-STUBBED (TR-5, judgment (f)). THE OUT-OF-SCOPE COLLABORATORS ARE THE HIBACHI TEMP DIRECTORY
   * AND THE TAG SERVICE — `getHibachiTempDirectory()` and `getHibachiTagService()` are framework facilities
   * that do not cross the boundary (AAP §0.8.3.2), and the uploaded file itself never reaches this port.
   * ../services/ProductService narrows the process object structurally on its three observed members and
   * raises when they are absent.
   *
   * ⚠️ NO MULTIPART DECODING, NO FILE BUFFER AND NO STORAGE TARGET IS INTRODUCED HERE. Adding any of them
   * would be capability beyond what the migration requires (AAP §0.8.2 Guideline 4), and there is no
   * in-scope collaborator to hand a file to.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the product after the attempt, projected, or the response describing why it was not attempted
   */
  const processProductUploadDefaultImage = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'processProductUploadDefaultImage');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      const updated: Product | null = await runProductWrite(productID, (graph, product) =>
        graph.processProductUploadDefaultImage(product, body.value),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 12 OF 15
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L264]
   * `public any function saveProduct(required any product, required struct data)`.
   *
   * TWO ARGUMENTS, BOTH `required`: the PRODUCT first, the `struct data` second. The payload is forwarded
   * as the parsed object (judgment (i)) because the service populates from it AND passes the same struct on
   * to `SkuService.createSkus` at [:L279], where AAP §0.6.7.8 records that its shape "determines both the
   * generated SKU set and … the order in which uniqueness validation observes its siblings". Reshaping it
   * here would change the SKUs a save produces.
   *
   * ⭐ THE IDENTIFIER IS OPTIONAL, AND ITS ABSENCE MEANS CREATION. That adjudication is the reason the
   * eighteenth member exists: `admin/views/entity/createproduct.cfm` EXISTS, so the legacy had a rendered
   * create item for this entity, and `newProduct()` is the factory that item's save posted into. An absent
   * identifier therefore resolves the subject through {@link ProductWriteGraph.newProduct} rather than
   * answering 400 — the same create-versus-update adjudication ./brandHandler makes for `saveBrand`. A
   * PRESENT identifier that resolves to nothing is a different answer: 404, because the caller named a
   * product that does not exist rather than declining to name one.
   *
   * ⭐⭐ THIS ROUTE HAS ITS OWN TRANSACTION RATHER THAN USING {@link runProductWrite}, FOR EXACTLY ONE
   * REASON: `runProductWrite` resolves its subject with `getProduct` and reports `null` as "no such
   * product", which cannot express creation. Everything else about the boundary is identical — the graph is
   * built inside the transaction, the subject is resolved inside it, and the gate is the same complete
   * predicate — so the duplication is confined to how the subject is obtained.
   *
   * ==============================================================================================
   * ⭐⭐ THE COMMIT GATE READS THE PRE-SAVE SUBJECT AS WELL AS THE RETURNED PRODUCT, AND BOTH ARE NEEDED
   * ==============================================================================================
   * [model/service/ProductService.cfc:L276-L288] and ../services/ProductService both run four steps in
   * order: validate the product, then — only when it is new AND carries no findings — `createSkus`, then
   * persist only when the product carries no findings, then `return product` EITHER WAY.
   *
   * Two consequences make a single naive gate wrong:
   *
   *   1. `createSkus` records per-SKU rule findings ON THE SKUs, not on the product. The persist test at
   *      STEP 5 reads only the product's own bag, so A BATCH OF INVALID SKUs DOES NOT PREVENT THE PERSIST
   *      and the member still returns a product. A gate reading `product.hasErrors()` alone would commit
   *      that batch. {@link skuBatchHasErrors} is the complete predicate and it is what is asked here.
   *   2. The persister may answer with a DIFFERENT INSTANCE — `EntityPersister<Product>` is free to, and
   *      STEP 5 rebinds the local — so the findings accumulated during steps 3 and 4 may live on the
   *      instance that went IN rather than the one that came out. Both references are therefore captured
   *      and both are asked, because asking only the returned one could miss findings and asking only the
   *      subject could miss findings the persister itself recorded.
   *
   * ⚠️ A ROLLED-BACK SAVE DOES NOT RETURN A PRODUCT. The runner raises when the gate reports findings, and
   * that raise reaches {@link errorResponse} — which is correct and is the point: the legacy caller that
   * received a findings-bearing product from a request whose flush was skipped had nothing persisted, and a
   * `200` carrying a product would tell this caller the opposite.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the saved product, projected, or the response describing why it was not saved
   */
  const saveProduct = async (event: ProductSaveEvent): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'saveProduct');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);
    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    let subject: Product | null = null;
    let outcome: Product | null = null;

    try {
      const saved: Product | null = await writeRunner.runWrite<Product | null>(
        async (graph) => {
          const product: Product | null =
            productID === undefined ? graph.newProduct() : await graph.getProduct(productID);

          if (product === null) {
            return null;
          }

          subject = product;
          outcome = await graph.saveProduct(product, body.value);

          return outcome;
        },
        () =>
          (subject !== null && skuBatchHasErrors(subject)) ||
          (outcome !== null && skuBatchHasErrors(outcome)),
      );

      return saved === null ? notFoundResponse() : okResponse(toProductResponse(saved));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 13 OF 15
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L294]
   * `public any function saveProductType(required any productType, required struct data)`.
   *
   * TWO ARGUMENTS, BOTH `required`: the PRODUCT TYPE first, the `struct data` second.
   *
   * ⭐ THE IDENTIFIER IS REQUIRED HERE, WHERE `saveProduct`'S IS OPTIONAL, AND THE ASYMMETRY IS EVIDENCE
   * RATHER THAN INCONSISTENCY. `admin/views/entity/` contains `createproduct.cfm` but NO
   * `createproducttype.cfm` — the legacy rendered a create item for the product and none for the product
   * type — and ../services/ProductService correspondingly declares `newProduct()` and NO `newProductType()`.
   * There is therefore no factory to resolve an unaddressed subject with, and inventing one would add a
   * capability the legacy did not have (AAP §0.8.2 Guideline 4, AAP §0.4.2.5's "reproduce synthesis ONLY
   * where used"). An unaddressed request is answered 400.
   *
   * ==============================================================================================
   * ⭐⭐ THE COMMIT GATE ASKS THE SAVED PRODUCT TYPE, AND TWO EARLIER REVISIONS GOT IT WRONG
   * ==============================================================================================
   * The gate exists to reproduce the legacy's request-end flush condition (AAP §0.6.6 M5), which asked
   * whether findings had ACCUMULATED — `if(!getORMHasErrors())`. Here that question is asked of the
   * product type the work resolved, which is the entity `model/service/ProductService.cfc:L306` asks it of.
   *
   * ⚠️ AN EARLIER REVISION HARDCODED IT TO `() => false` ON TWO GROUNDS, AND BOTH HAVE SINCE BEEN
   * FALSIFIED — recorded rather than quietly deleted, because a reader who remembers the constant deserves
   * to know why it is gone:
   *
   *   1. It claimed `ProductType` HAS NO ERROR SURFACE AT ALL. The CLASS still declares none, and is
   *      forbidden to — but ../services/ProductService composes one onto the instance with `manageEntity`
   *      and resolves `ProductTypeWithErrorState`, so there has been a bag to interrogate ever since. What
   *      blocked the gate here was this graph declaring the member's result as a bare `ProductType` and
   *      widening the surface away; that declaration is now the precise one.
   *   2. It claimed ../services/BaseService's `save` RAISES on failure, so the raise was itself the
   *      roll-back. That was true of the port and never true of the legacy: the local override at
   *      `model/service/HibachiService.cfc:L103` returns the entity on every path. The base service was
   *      corrected to that single exit, so a validation failure now returns NORMALLY — and a constant
   *      `false` would have committed the transaction and answered 200 with a projection of a product type
   *      that was never written. That is the failure mode this gate exists to prevent.
   *
   * ⛔ IT IS STILL NOT `skuBatchHasErrors`, AND MUST NOT BE "STRENGTHENED" TO IT. There is no product in
   * this route to ask about; passing an unrelated one would make the answer depend on an entity the member
   * never touched. The subject is the product type, and only the product type.
   *
   * ⭐ THE ROLL-BACK IS WHAT REPORTS THE FAILURE, so nothing is lifted into a carrier here.
   * ../adapters/mysql/UnitOfWork rolls back and RAISES a `DomainError` when the gate answers `true`, and
   * that raise reaches {@link errorResponse}. The findings themselves stay on the entity, exactly as the
   * legacy left them on `arguments.productType`.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the saved product type, projected, or the response describing why it was not saved
   */
  const saveProductType = async (
    event: ProductTypePayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'saveProductType');

    if (refusal !== undefined) {
      return refusal;
    }

    const productTypeID: string | undefined = readProductTypeIdentifier(event);

    if (productTypeID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_TYPE_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    /*
     * Captured rather than read from the resolved value, for the same reason `saveProduct` captures its
     * two references: the gate is a zero-argument predicate the transaction boundary evaluates BEFORE it
     * decides to commit, so it cannot be handed the work's result.
     */
    let outcome: ProductTypeWithErrorState | null = null;

    try {
      const saved: ProductTypeWithErrorState | null =
        await writeRunner.runWrite<ProductTypeWithErrorState | null>(
          async (graph) => {
            const productType: ProductType | null = await graph.getProductType(productTypeID);

            if (productType === null) {
              return null;
            }

            outcome = await graph.saveProductType(productType, body.value);

            return outcome;
          },
          () => outcome !== null && outcome.hasErrors(),
        );

      return saved === null ? notFoundResponse() : okResponse(toProductTypeResponse(saved));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 14 OF 15
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L317]
   * `public boolean function deleteProduct(required any product)`.
   *
   * ONE ARGUMENT, `required`, AND A BOOLEAN RESULT.
   *
   * ⭐⭐ THE BOOLEAN IS REPORTED, NOT REINTERPRETED — judgment (n), and it is the same adjudication
   * ./brandHandler records for `deleteBrand`. A `false` is the member's ANSWER, not a failure of the
   * request: the legacy `deleteProduct` returns `false` when the delete guards in
   * `model/validation/Product.json` refuse — `transactionExistsFlag`, `physicalCounts` — and the caller
   * that received `false` had made a well-formed, authorised call that was answered. So:
   *
   *   ⛔ `false` IS NOT MAPPED TO 400, 403, 409 OR ANY OTHER STATUS. Inventing a status for it would
   *   invent a refusal vocabulary the legacy does not have (AAP §0.7.3 S9), and it would hide which of
   *   the guards refused — information the caller can only get by asking again.
   *   ⛔ AND THE VALUE IS NOT INVERTED. `okResponse(false)` means "asked, answered, refused".
   *
   * ⚠️ THE `null` TEST IS AGAINST `null` EXPLICITLY, NEVER AGAINST FALSINESS. {@link runProductWrite}
   * answers `null` for "no such product", and the member's own legitimate answer is `false` — two values
   * that a truthiness test would merge, turning every refusal into a 404.
   *
   * ⚠️ A REFUSAL COMMITS AN EMPTY TRANSACTION, AND THAT IS LEGACY BEHAVIOUR. ../services/BaseService's
   * `delete` validates into a LOCAL error bag and only removes when that bag is empty, so nothing
   * accumulates onto the product on the refusal path and the gate correctly reports no findings. The legacy
   * behaved identically: a refused delete wrote nothing, so its request-end flush had nothing to discard.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the member's own boolean answer, or the response describing why it was not asked
   */
  const deleteProduct = async (event: ProductIdentifierEvent): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'deleteProduct');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const deleted: boolean | null = await runProductWrite(productID, (graph, product) =>
        graph.deleteProduct(product),
      );

      return deleted === null ? notFoundResponse() : okResponse(deleted);
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * DECLARED MEMBER 15 OF 15
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L342]
   * `public any function getProductSmartList(struct data={}, currentURL="")`.
   *
   * ==============================================================================================
   * ⚠️ DISCREPANCY 1 — `currentURL` IS DECLARED WITH NO CFML TYPE AT ALL (judgment (e))
   * ==============================================================================================
   * The legacy declaration is `currentURL=""`, NOT `string currentURL=""`. AAP §0.4.2.1 records the
   * tightening to an optional string as a decision made in the open rather than a silent correction, and
   * ../services/ProductService carries the tightened signature. BOTH PARAMETERS ARE OPTIONAL AND THEIR
   * ORDER IS PRESERVED: `data` first, `currentURL` second.
   *
   * ⛔ THIS ROUTE SUPPLIES ONLY `data`, AND THE OMISSION IS DELIBERATE. `currentURL` was the CFML request's
   * own URL, used by `HibachiSmartList` for URL-persisted paging state — a framework facility that does not
   * cross the boundary (AAP §0.8.3.2), and ../services/ProductService accordingly names the parameter with
   * a leading underscore because it reads it nowhere. There is no request-side value to supply: an API
   * Gateway event carries a path and a query string, not the legacy's rendered admin URL, so assembling one
   * would be manufacturing a value the source never had (AAP §0.7.3 S9). The parameter stays DECLARED and
   * callable on the service, which is what parity requires; what this route declines to do is invent an
   * argument for it.
   *
   * ⛔ AND THE ENTITY NAME IS NOT SET HERE. [model/service/ProductService.cfc:L343] assigns
   * `arguments.entityName = "SlatwallProduct"` before delegating — that belongs to the service, which owns
   * it, and a handler that also set it would put the same decision in two places.
   *
   * THE INPUT IS THE RECOGNISED SUBSET OF THE QUERY STRING, AND NOTHING ELSE — see
   * {@link readSmartListInput}, where the vocabulary and the reason for filtering it are recorded. An empty
   * input is legal and is exactly the `data={}` default the legacy declares.
   *
   * NON-TRANSACTIONAL, because it is a pure read: it opens no transaction, and there is nothing for a
   * commit gate to decide.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its query-string-parameters and headers members
   * @returns the smart list page with both record collections projected, or the refusal
   */
  const getProductSmartList = async (
    event: ProductSmartListEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getProductSmartList');

    if (refusal !== undefined) {
      return refusal;
    }

    try {
      const result: SmartListResult<Product> = await productService.getProductSmartList(
        readSmartListInput(event),
      );

      return okResponse(toProductSmartListResponse(result));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* --------------------------------------------------------------------------------------------
   * THE THREE SYNTHESIZED MEMBERS — IR-1
   *
   * None of the three has a source declaration anywhere in the legacy tree. They existed only because
   * `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281] fabricated the implicit CRUD surface by
   * lower-cased prefix, throwing at [:L280] for a prefix it did not recognise. AAP §0.4.2.5 declares
   * exactly these three for this service and requires that synthesis be reproduced ONLY where the slice
   * uses it — which is why there is no `countProduct*`, `listProduct*` or `exportProduct*` member here and
   * no route for one.
   * ------------------------------------------------------------------------------------------ */

  /**
   * Ports the boundary for the synthesized `newProduct()` — the `new` prefix branch
   * [org/Hibachi/HibachiService.cfc:L262], whose handler at [:L318] took no argument.
   *
   * ⭐ THE EIGHTEENTH MEMBER, AND THE ONE THAT MAKES THIS SURFACE DIFFER FROM ./brandHandler'S AND
   * ./skuHandler'S ADJUDICATIONS. `admin/views/entity/createproduct.cfm` EXISTS, so the legacy rendered a
   * create item for this entity and a caller could obtain an unsaved product before saving it. That is the
   * evidence; the absence of a `createproducttype.cfm` is the evidence for the opposite decision one member
   * up, and the two are recorded together in the module header.
   *
   * NO ARGUMENTS, AND NONE IS ADDED. The synthesized factory took none, so this route reads no path
   * parameter, no query parameter and no body — only the headers its gate consults.
   *
   * ⚠️ NON-TRANSACTIONAL, BECAUSE IT PERSISTS NOTHING. The member returns a TRANSIENT: its identifier is
   * the `unsavedvalue=""` sentinel that {@link readProductIdentifier} treats as "not addressed", and the
   * next call — `saveProduct` with no identifier — is what writes. Opening a transaction to construct an
   * object in memory would commit an empty one on every call.
   *
   * ⚠️ IT IS SYNCHRONOUS UNDERNEATH AND STILL RESOLVES A PROMISE. {@link ProductHandler} records why every
   * one of the eighteen resolves a promise: a router that awaited seventeen routes and read one directly
   * would make its own dispatch conditional on which member it mounted. The arrow is deliberately NOT
   * `async` — there is nothing to await, and marking it so would state that there is.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its headers member
   * @returns the unsaved product, projected, or the refusal
   */
  const newProduct = (event: NewProductEvent): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'newProduct');

    if (refusal !== undefined) {
      return Promise.resolve(refusal);
    }

    try {
      return Promise.resolve(okResponse(toProductResponse(productService.newProduct())));
    } catch (error) {
      return Promise.resolve(errorResponse(error));
    }
  };

  /**
   * Ports the boundary for the synthesized `getProductType(productTypeID)` — the `get` prefix branch
   * [org/Hibachi/HibachiService.cfc:L258], whose handler read the identifier as positional argument 1 at
   * [:L325].
   *
   * ONE ARGUMENT, THE IDENTIFIER, AND IT IS REQUIRED HERE. The synthesized reader answered with a NEW
   * entity when given no identifier, which is the factory behaviour this surface deliberately does not
   * expose for the product type: there is no `createproducttype.cfm` and ../services/ProductService
   * declares no `newProductType()`, so an unaddressed request is answered 400 rather than silently becoming
   * a construction. `saveProductType` records the same adjudication and the same evidence.
   *
   * `null` IS "NO SUCH PRODUCT TYPE" AND IS ANSWERED 404. The service member's declared return is
   * `Promise<ProductType | null>` (AAP §0.4.2.5), so absence is a value rather than a raise.
   *
   * NON-TRANSACTIONAL — a pure read.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the product type, projected, or the response describing why it was not returned
   */
  const getProductType = async (
    event: ProductTypeIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getProductType');

    if (refusal !== undefined) {
      return refusal;
    }

    const productTypeID: string | undefined = readProductTypeIdentifier(event);

    if (productTypeID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_TYPE_ID_REQUIRED_MESSAGE);
    }

    try {
      const productType: ProductType | null = await productService.getProductType(productTypeID);

      return productType === null
        ? notFoundResponse()
        : okResponse(toProductTypeResponse(productType));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for the synthesized `getProduct(productID)` — the same `get` prefix branch
   * [org/Hibachi/HibachiService.cfc:L258], reading the identifier as positional argument 1 at [:L325].
   *
   * ONE ARGUMENT, THE IDENTIFIER, REQUIRED. An unaddressed request is answered 400 rather than becoming a
   * construction: `newProduct` is the member that constructs, it is routed separately, and its own
   * classification is `create` where this one's is `read`. Collapsing the two would let a caller authorised
   * only to read obtain an entity through a factory.
   *
   * `null` IS "NO SUCH PRODUCT" AND IS ANSWERED 404 (AAP §0.4.2.5).
   *
   * ⚠️ NON-TRANSACTIONAL, WHICH IS WHY THE WRITE ROUTES DO NOT USE IT. Every write route resolves its own
   * subject through {@link ProductWriteGraph} INSIDE its transaction — see {@link runProductWrite}, where
   * the M6 read-back reason is recorded. This route is the read-only boundary for a caller that just wants
   * the product, and a write path that reused it would read outside the transaction it then writes in.
   *
   * NET-NEW coverage (AAP §0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the product, projected, or the response describing why it was not returned
   */
  const getProduct = async (event: ProductIdentifierEvent): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getProduct');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const product: Product | null = await productService.getProduct(productID);

      return product === null ? notFoundResponse() : okResponse(toProductResponse(product));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /*
   * EXACTLY THE EIGHTEEN APPROVED OPERATIONS, IN THE SAME ORDER AS {@link ProductHandler} AND
   * {@link PRODUCT_ACCESS_MATRIX} — the fifteen declared members in legacy declaration order, then the
   * three synthesized. Because the returned object is typed by the interface and the matrix is keyed on
   * `keyof ProductHandler`, ALL THREE LISTS ARE THE SAME LIST BY CONSTRUCTION: a member added to one
   * without the others does not compile, which is how "no additional synthesized method is routed" stops
   * being a promise and becomes a property.
   *
   * FROZEN, for the reason AAP §0.6.6 M7 gives: a warm Lambda container is shared across invocations and
   * therefore potentially across tenants, so nothing that outlives an invocation may be mutable. This
   * object is the whole of what a router holds, and no member of it closes over mutable module state — the
   * only mutable bindings in this factory are the transaction-scoped locals inside a single write, which
   * are created and discarded within one invocation.
   */
  return Object.freeze({
    loadDataFromFile,
    getFormattedOptionGroups,
    getProductSkusBySelectedOptions,
    processProductAddOptionGroup,
    processProductAddOption,
    processProductAddProductReview,
    processProductAddSubscriptionTerm,
    processProductDeleteDefaultImage,
    processProductUpdateDefaultImageFileNames,
    processProductUpdateSkus,
    processProductUploadDefaultImage,
    saveProduct,
    saveProductType,
    deleteProduct,
    getProductSmartList,
    newProduct,
    getProductType,
    getProduct,
  });
}

/* =====================================================================================================
 * THE LAMBDA ENTRY POINT
 *
 * Everything above this line is a pure function of its dependencies and stays that way: it constructs
 * nothing, resolves nothing by name, and is assertable with hand-written doubles and no database
 * (AAP §0.7.3 S6). Everything below is the boundary that makes the emitted artifact invocable — one
 * `handler` export built from the composition root, for the bundle `build/esbuild.mjs` writes from this
 * file. The AAP declares six Lambda entry artifacts and this file is one of them, so the artifact has
 * to carry an entry symbol the runtime can address.
 *
 * ⭐ THE COMPOSITION ROOT IS REACHED THROUGH A DYNAMIC IMPORT, and that is the one subtle thing here.
 * `../config/container` reaches `../config/database`, whose `mysql2` pool is created at module scope,
 * and `../config/env`, which validates the environment as a module-load side effect. A STATIC import
 * would run both when this module is loaded — including by `test/handlers/productHandler.test.ts`, which
 * has neither an environment nor a database. Deferring it to the first invocation keeps module load free
 * of side effects while the pool still lives at module scope of the module that owns it, created once
 * and reused across warm invocations exactly as AAP §0.3.2 requires. The specifier carries the `.js`
 * extension because a dynamic import inside a CommonJS module is a real ECMAScript import and
 * `moduleResolution: NodeNext` requires the extension there; both `tsc` and esbuild resolve it to this
 * subtree's TypeScript source.
 *
 * ⚠️ M1 IS NOT RESOLVED BY THIS SECTION, AND MUST NOT APPEAR TO BE. `product.loadDataFromFile` is the
 * importer, and `model/service/ProductService.cfc:L66` requests a 3600-second budget for it — which is
 * unrepresentable against the platform's 15-minute function ceiling. Declaring the route makes the
 * member addressable; it does not give it an hour, and the mismatch stays flagged where the member is
 * implemented rather than being silently re-timed here (AAP §0.6.6, §0.7.3 S8).
 *
 * ⛔ THE ROUTE NAMES ARE DECLARED HERE, ONCE. `./router.ts` composes {@link createProductRoutes} into
 * the aggregate surface rather than restating these eighteen keys.
 * ================================================================================================== */

/**
 * The actions this entry point serves, in the legacy `slatAction` vocabulary.
 *
 * `product.` is the surface prefix and the suffix is the member name. All eighteen members of
 * {@link ProductHandler} are routed: the fifteen public members of AAP §0.4.2.1 minus the private dead
 * `buildSkuCombinations` (defect D15, not ported), plus the three synthesized members `newProduct`,
 * `getProductType` and `getProduct` that AAP §0.4.2.5 requires to be declared explicitly.
 */
export type ProductRouteKey =
  | 'product.loadDataFromFile'
  | 'product.getFormattedOptionGroups'
  | 'product.getProductSkusBySelectedOptions'
  | 'product.processProductAddOptionGroup'
  | 'product.processProductAddOption'
  | 'product.processProductAddProductReview'
  | 'product.processProductAddSubscriptionTerm'
  | 'product.processProductDeleteDefaultImage'
  | 'product.processProductUpdateDefaultImageFileNames'
  | 'product.processProductUpdateSkus'
  | 'product.processProductUploadDefaultImage'
  | 'product.saveProduct'
  | 'product.saveProductType'
  | 'product.deleteProduct'
  | 'product.getProductSmartList'
  | 'product.newProduct'
  | 'product.getProductType'
  | 'product.getProduct';

/**
 * Builds the product handler from the composition root.
 *
 * The wiring lives here rather than in `./router.ts` because this file knows which collaborators the
 * product surface needs — the service, the per-invocation authorisation resolver, and the transactional
 * write runner whose scope the write members are expressed against.
 *
 * @param container the memoized service graph
 * @returns the eighteen routed product operations
 */
export function createProductHandlerFromContainer(container: CatalogContainer): ProductHandler {
  return createProductHandler(
    container.productService,
    resolveFailClosedAuthorization,
    container.productWriteRunner,
  );
}

/**
 * Maps each served action name onto the member that answers it.
 *
 * Each entry is an arrow rather than a method reference, so the receiver cannot be lost and a member
 * that narrows the event to a subset of the proxy shape still type-checks against the full event.
 *
 * @param handlers the product handler whose members the actions resolve to
 * @returns the frozen action table for the product surface
 */
export function createProductRoutes(handlers: ProductHandler): ActionRouteTable<ProductRouteKey> {
  /*
   * ⚠️ THE LITERAL IS ANNOTATED BEFORE IT IS FROZEN, AND THE ORDER IS LOAD-BEARING. `Object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<ProductRouteKey, ActionRoute> = {
    'product.loadDataFromFile': (event: APIGatewayProxyEvent) => handlers.loadDataFromFile(event),
    'product.getFormattedOptionGroups': (event: APIGatewayProxyEvent) =>
      handlers.getFormattedOptionGroups(event),
    'product.getProductSkusBySelectedOptions': (event: APIGatewayProxyEvent) =>
      handlers.getProductSkusBySelectedOptions(event),
    'product.processProductAddOptionGroup': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddOptionGroup(event),
    'product.processProductAddOption': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddOption(event),
    'product.processProductAddProductReview': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddProductReview(event),
    'product.processProductAddSubscriptionTerm': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddSubscriptionTerm(event),
    'product.processProductDeleteDefaultImage': (event: APIGatewayProxyEvent) =>
      handlers.processProductDeleteDefaultImage(event),
    'product.processProductUpdateDefaultImageFileNames': (event: APIGatewayProxyEvent) =>
      handlers.processProductUpdateDefaultImageFileNames(event),
    'product.processProductUpdateSkus': (event: APIGatewayProxyEvent) =>
      handlers.processProductUpdateSkus(event),
    'product.processProductUploadDefaultImage': (event: APIGatewayProxyEvent) =>
      handlers.processProductUploadDefaultImage(event),
    'product.saveProduct': (event: APIGatewayProxyEvent) => handlers.saveProduct(event),
    'product.saveProductType': (event: APIGatewayProxyEvent) => handlers.saveProductType(event),
    'product.deleteProduct': (event: APIGatewayProxyEvent) => handlers.deleteProduct(event),
    'product.getProductSmartList': (event: APIGatewayProxyEvent) =>
      handlers.getProductSmartList(event),
    'product.newProduct': (event: APIGatewayProxyEvent) => handlers.newProduct(event),
    'product.getProductType': (event: APIGatewayProxyEvent) => handlers.getProductType(event),
    'product.getProduct': (event: APIGatewayProxyEvent) => handlers.getProduct(event),
  };

  return Object.freeze(routes);
}

/**
 * The dispatcher, built once per container and reused for every later invocation.
 *
 * The only mutable module-scope binding in this file. It holds the wiring and nothing else — no
 * account, no request, no query result and no setting — so a warm container sharing it cannot leak
 * anything from one invocation into the next, which is the boundary mismatch M7 is about.
 */
let dispatchProductAction: ActionRoute | undefined;

/**
 * The Lambda entry point for the product surface.
 *
 * A configuration failure surfaces through {@link errorResponse} rather than escaping as an unhandled
 * rejection. `./router.ts` deliberately differs — it resolves the graph at module load, so a
 * misconfiguration fails its cold start outright — and the two behaviours are complementary: the
 * router is the primary entry and fails loudest, while each per-surface entry stays loadable and
 * answerable.
 *
 * @param event the proxy event, carrying the action in its query string
 * @returns the response for the addressed action, or a not-found for one this surface does not serve
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchProductAction === undefined) {
      const { getCatalogContainer } = await import('../config/container.js');
      const container = getCatalogContainer();

      dispatchProductAction = createActionDispatcher<ProductRouteKey>({
        routes: createProductRoutes(createProductHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchProductAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/**
 * Compile-time proof that the export above satisfies the runtime's handler contract.
 *
 * Assignability is asserted rather than annotating `handler` with `APIGatewayProxyHandler`, because
 * that type permits a callback-style signature and a void return; asserting keeps the narrower
 * promise-returning shape while still proving the artifact is invocable.
 */
type _ProductHandlerSatisfiesLambdaContract = AssertAssignable<
  typeof handler,
  APIGatewayProxyHandler
>;
