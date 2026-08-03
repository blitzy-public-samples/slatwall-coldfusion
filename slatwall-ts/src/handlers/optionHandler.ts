/**
 * optionHandler — the AWS Lambda boundary for the Catalog's option surface.
 *
 * Authority: AAP §0.4.1.9 — exposes the `OptionService` surface. The exposed member set is fixed by
 * AAP §0.4.2.4 and CONSTRAINED by AAP §0.4.2.5; the dependency classification is AAP §0.6.3.4.
 *
 * WHAT THIS FILE IS
 * -----------------
 * AAP §0.3.2, quoting AWS's own reference layout for this architecture: "the handler responsible
 * only for translating AWS-specific input into domain calls." Each member below does exactly five
 * things, in order: RUN THE AUTHORISATION GATE, narrow the event, call ONE service member, shape the
 * outcome through `./httpResponse`, return. There is no query, no combination enumeration, no
 * validation rule, no field mapping and no statement text anywhere in this module.
 *
 * ⚠️ THE GATE IS FIRST, NOT LAST, AND THE ORDER IS PART OF THE CONTRACT. It runs before any input is
 * read and before the service is touched, so an unauthorised caller cannot use a member's own
 * bad-request texts to discover the request shape, and cannot distinguish an identifier that exists
 * from one that does not by comparing responses. Judgment (g) records why the gate exists at all, and
 * {@link OPTION_ACCESS_MATRIX} records what each member requires and on what evidence.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 *   ⛔ It is not a router. It declares no route table, no path template, no method matching and no
 *      dispatch of any kind. `./httpResponse` states the division plainly in its own header —
 *      "Routing is router.ts" — and AAP §0.4.1.9 row 1 assigns the FW/1 `slatAction` convention's
 *      replacement to that file. This module correspondingly exports no Lambda entry point: it
 *      exports three request-shaped functions and the factory that binds them to the option service and
 *      the authorization resolver.
 *   ⛔ It is not a second error mapping. `./httpResponse` owns the single error-to-response
 *      mapping, and its header requires that "Nothing else in the folder maps an error to a
 *      response". Every failure path here therefore ends in one of that module's helpers.
 *      Consequently this file does NOT import `../errors/DomainError` or
 *      `../errors/ValidationError`: both were read for contract, and re-testing their types here
 *      would create exactly the duplicate mapping the sibling forbids. `errorResponse` performs
 *      that branching once, correctly, for every handler in the folder.
 *   ⛔ It is not a validator. `model/validation/Option.json` and `model/validation/OptionGroup.json`
 *      declare required members, uniqueness, code patterns and delete guards; all of that is owned
 *      by `src/validation/rules/option.rules.ts` and `src/validation/rules/optionGroup.rules.ts`,
 *      evaluated by `src/validation/Validator.ts`. No pattern, no uniqueness probe and no delete
 *      guard is reproduced or pre-checked below, and nothing from `../validation/` is imported.
 *      A validation failure arrives as an error and is shaped by `errorResponse`, which preserves
 *      the legacy error-key structure unchanged (AAP §0.4.1.11).
 *
 * THE THREE MEMBERS, AND WHY THE SET IS CLOSED AT THREE
 * ----------------------------------------------------
 * `model/service/OptionService.cfc` declares exactly three public functions. TR-1 requires the name,
 * arity and argument order of each to be preserved, and AAP §0.8.3.1 gives the reason: interface parity
 * has to be checkable method-by-method. The correspondence is one-to-one and in the source's own order:
 *
 *   model/service/OptionService.cfc:L55
 *     public array function getOptionsForSelect(required any options)
 *   -> `OptionService.getOptionsForSelect(options: Option[]): SelectOption[]`
 *   -> {@link OptionHandler.getOptionsForSelect}                              SYNCHRONOUS
 *
 *   model/service/OptionService.cfc:L72
 *     public array function getUnusedProductOptions(required string productID,
 *                                                  required string existingOptionGroupIDList)
 *   -> `OptionService.getUnusedProductOptions(productID, existingOptionGroupIDList)`
 *   -> {@link OptionHandler.getUnusedProductOptions}                          PROMISE-RETURNING
 *
 *   model/service/OptionService.cfc:L76
 *     public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList)
 *   -> `OptionService.getUnusedProductOptionGroups(existingOptionGroupIDList)`
 *   -> {@link OptionHandler.getUnusedProductOptionGroups}                     PROMISE-RETURNING
 *
 * THE SYNCHRONOUS-VERSUS-ASYNCHRONOUS ASYMMETRY IS DELIBERATE AND IS MIRRORED HERE. The first service
 * member is synchronous because its legacy body is a pure in-memory projection that touches no
 * collaborator; the other two are promise-returning because they reach the repository. Making all three
 * uniform would be tidier and WRONG: it would change the call shape of a pure transformation and hide
 * the fact that only two of the three can perform data access.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP §0.8.2 Guideline 6)
 * -----------------------------------------------------------------
 * Guideline 6 requires that every technology-specific translation decision be documented where the
 * judgment is made. Seven judgments belong to this file, lettered (a) through (g) and each restated at
 * the member or declaration it governs.
 *
 * (a) THE FOUR SYNTHESIZED MEMBERS ARE DECLARED ON THE SERVICE AND DELIBERATELY NOT ROUTED HERE.
 *     `getOption`, `getOptionGroup`, `getOptionSmartList` and `getOptionGroupSmartList` have no
 *     declaration anywhere in the legacy repository; they resolved at run time only because
 *     `onMissingMethod` (`org/Hibachi/HibachiService.cfc:L255-L281`) fabricated the whole implicit
 *     surface by lower-cased prefix. IR-1 and TR-3 require each USED one to become an explicit typed
 *     method, and `../services/OptionService` duly declares all four. That declaration exists to satisfy
 *     INTERNAL callers and is not a mandate to expose them over HTTP: every call site is inside the
 *     slice — `getOption` from `model/service/SkuService.cfc:L75`, `getOptionGroup` from
 *     `model/service/ProductService.cfc:L115`, `getOptionSmartList` from
 *     `model/entity/Product.cfc:L340-L347` and `getOptionGroupSmartList` from
 *     `model/entity/Product.cfc:L251-L261`. Not one is an external entry point, so giving any of them a
 *     route would invent public surface the legacy never exposed (S9, Guideline 4). None is routed, and
 *     none is even imported here.
 *
 * (b) SYNTHESIS IS REPRODUCED ONLY WHERE IT WAS USED. The retired dispatcher would have answered the
 *     `new*`, `save*`, `delete*`, `count*`, `list*`, `export*` and `process*` prefixes for this entity
 *     just as readily as it answered `get*` (`org/Hibachi/HibachiService.cfc:L264-L277`). None has a
 *     call site anywhere in the slice, so none is declared on the service and none is exposed here —
 *     AAP §0.4.2.5: synthesis is not reproduced wholesale, only where used. "Completing" the option
 *     write surface here would be pure fabrication.
 *
 * (c) THE OPTION-GROUP IDENTIFIER LIST STAYS A SINGLE COMMA-DELIMITED STRING, END TO END. Both
 *     unused-option members take `existingOptionGroupIDList` as one `required string`, and CFML models
 *     it as a comma-delimited list value rather than as a collection. It is read from the request and
 *     handed to the service UNTOUCHED: not split, trimmed, de-duplicated, re-ordered, re-joined or
 *     re-encoded. The decision to parse it belongs to exactly one place —
 *     `src/adapters/mysql/MySqlOptionRepository.ts`, which ports `model/dao/OptionDAO.cfc:L93-L116` and
 *     generates one `?` placeholder per value rather than concatenating the list into the statement
 *     (AAP §0.4.1.7). A second parser here would be a second source of truth for delimiter handling,
 *     whitespace and empty entries, and the two would drift silently.
 *
 * (d) AN EMPTY OPTION-GROUP IDENTIFIER LIST IS A LEGAL INPUT AND IS DELIBERATELY NOT GUARDED. The legacy
 *     queries at `model/dao/OptionDAO.cfc:L51-L91` and `:L93-L116` are driven by whatever the caller
 *     supplies, and an empty list is meaningful on both: the set-membership member resolves to no rows,
 *     and its negated counterpart resolves to every option group — which is correct, because a product
 *     with no groups yet has none used. There is therefore no emptiness test in this file, no substituted
 *     default and no rejection, the same discipline AAP §0.6.1.3 T5 applies to an empty selected-option
 *     list.
 *     ABSENT IS NOT EMPTY, AND THE TWO ARE KEPT DISTINCT. The legacy argument is declared `required`, so
 *     a request that supplies no value at all is a bad request, while a request that supplies an empty
 *     value is honoured verbatim. Substituting an empty string for an absent parameter would feed a real
 *     value into a member that behaves differently for it, so the readers return an absent value as such
 *     and the guards below test ONLY for absence.
 *
 * (e) THE COMPOSED OPTION LABEL IS PRODUCED BELOW THIS LAYER, NEVER IN IT.
 *     {@link OptionHandler.getUnusedProductOptions} returns rows whose display half was already composed
 *     from two names by the data-access layer at `model/dao/OptionDAO.cfc:L88` — the owning group's
 *     name, a space, a hyphen, a space, then the option's own name — whereas
 *     `model/dao/OptionDAO.cfc:L113` emits the group's plain name for the sibling member and
 *     `model/service/OptionService.cfc:L59` emits the option's plain name for the projection member.
 *     Three members, three different label semantics, and this file composes, re-splits, reformats,
 *     trims and re-cases none of them. The service's own `OP-1` note records why: the row shape and the
 *     projection shape are structurally identical BY DESIGN so the rows pass through untouched, which
 *     means a well-meaning re-projection above the repository would silently replace a two-part label
 *     with a bare name and no type check could catch it.
 *
 * (f) THE DEAD `productService` INJECTION IS NOT REINTRODUCED. `model/service/OptionService.cfc:L53`
 *     declares `property name="productService"` and AAP §0.6.3.4 records the call-site count as
 *     ZERO — the component's only two bodies, at [:L73] and [:L77], both reach `getOptionDAO()`.
 *     It is one of the four dead injections the port drops, and AAP §0.6.3.5 records the aggregate
 *     result: "Four dead injections removed, one hidden dynamic dependency surfaced." ⛔ This
 *     handler therefore injects ONE SERVICE collaborator and imports no other service. Reintroducing
 *     the edge for convenience would recreate a cycle for a collaborator nothing ever called, since
 *     the product side already consumes the option side. No parity annotation is needed for it: it is
 *     a service-layer wiring fact, recorded here only so the omission reads as a decision.
 *
 * (g) THE LEGACY'S SINGLE REQUEST-AUTHORISATION GATE IS RESTORED HERE, AND ITS LOGIN REDIRECT BECAME
 *     A STATUS CODE. No legacy controller authorised anything, because `setupRequest()`
 *     [org/Hibachi/Hibachi.cfc:L182-L203] authorised EVERY request before any controller method ran —
 *     its opening comment is "Verify Authentication before anything happens" and it refuses at
 *     [:L188]. That is framework code, which AAP §0.8.3.2 keeps on the far side of the boundary
 *     ("Do not port or depend on anything from `org/Hibachi/`"), so the GATE ITSELF does not cross —
 *     only its contract does, as `EntityAuthorizationPort` and `RequestAuthorizationResolver` on
 *     `../ports/AccountContextPort`. ⚠️ RESTORING IT IS THEREFORE PARITY, NOT INVENTED POLICY: a
 *     handler that answered without it would be strictly MORE permissive than the system it ports,
 *     which Guideline 2 forbids as squarely as inventing new policy would.
 *     ⛔ WHAT IS NOT REPRODUCED IS THE FAILURE MODE. The legacy stored a return URL and redirected the
 *     browser to a login form [org/Hibachi/Hibachi.cfc:L189-L192]; a machine client calling a headless
 *     service cannot follow that, so the outcome is a status code instead — 401 when no principal is
 *     established, 403 when one is but is unauthorised. `./httpResponse` records that translation as
 *     its own judgment (g), and it is the ONLY part of the gate this port changes.
 *     ⛔ AND NO AUTHENTICATION MECHANISM IS INVENTED TO GO WITH IT. This file names no header, no
 *     scheme, no token format and no identity provider; it receives a resolver and asks it. The
 *     classifications it enforces are the legacy's own four names, and the evidence for every row is
 *     recorded at {@link OPTION_ACCESS_MATRIX} rather than chosen by judgment here.
 *
 * THE REQUEST MAPPING, AND WHY NOTHING ABOUT IT IS INVENTED
 * --------------------------------------------------------
 * The legacy has no HTTP surface for any of these members: a request entered through `index.cfm`, the
 * retired FW/1 layer selected a view by convention, and nothing in the component chose a status code, a
 * parameter name or a body shape. Every mapping below is therefore a judgment by this port, made by the
 * least inventive rule available — REQUEST MEMBER NAMES ARE THE LEGACY ARGUMENT NAMES, VERBATIM:
 *
 *   - `options` is read from the JSON request body, because `options` is the argument name at
 *     `model/service/OptionService.cfc:L55`.
 *   - `productID` is read from the route's path parameters, because it identifies the product the
 *     request is about.
 *   - `existingOptionGroupIDList` is read from the query string, because it narrows a result rather than
 *     identifying a resource.
 *
 * Each input has exactly ONE source. No fallback chain is offered — reading a value from the path and
 * then from the query string would invent precedence semantics the source never had, and would make the
 * observable outcome depend on a rule no reader could check against the legacy. A route that binds
 * `productID` as a path parameter is therefore part of this module's contract with `router.ts`, and is
 * stated here rather than papered over with a silent fallback.
 *
 * ARCHITECTURAL POSITION (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------
 * `src/handlers/` is the outermost layer and this module sits at its edge, with exactly four
 * imports: the response and input helpers from `./httpResponse`, the service type it is a function
 * of, the one domain class it must instantiate to satisfy that service's signature, and — TYPE-ONLY —
 * the authorisation contract from `../ports/AccountContextPort`. All four
 * specifiers are relative and extensionless, because `tsconfig.json` declares no `paths` or
 * `baseUrl` and AAP §0.4.3.5 requires relative imports "so `tsc` and `esbuild` resolve identically
 * and no runtime resolver shim is needed" — an alias that type-checks can still fail to resolve at
 * cold start.
 *
 * What is consequently absent, all deliberate:
 *   - No import from `../adapters/`, `../validation/` or `../util/`, and no import of another service.
 *     `../config/container`'s `getOptionSurfaceGraph` is reached from ONE place only — the LAMBDA ENTRY POINT section at
 *     the foot of this file, through a DEFERRED CommonJS require evaluated on first invocation, because the
 *     bundle built from this file has to carry a `handler` the runtime can address; a native dynamic
 *     `import()` was measured to be unusable there and that section records why. That section reaches the
 *     option SURFACE rather than the aggregate `../config/container`, because a review pass (PERF-01)
 *     measured this three-route artifact carrying the whole catalog graph, which the container names in
 *     full. Its type is imported type-only and
 *     is erased. {@link createOptionHandler} still constructs no collaborator and resolves nothing by name,
 *     and module LOAD still touches no configuration and opens no pool (S3).
 *     ⚠️ THE ONE IMPORT FROM `../ports/` IS TYPE-ONLY AND IS THE HEXAGONAL DIRECTION, NOT AN EXCEPTION
 *     TO IT. A handler is an outer layer and may depend on an inner abstraction; what it may not do is
 *     depend on an adapter, and it does not. Every specifier in that import is erased at compile time,
 *     so it contributes no runtime byte, adds no dependency, and cannot be a path by which an
 *     implementation reaches this module (S4). Judgment (g) records why the contract is needed at all.
 *   - No authentication mechanism. No header name, no scheme, no token parsing, no signature check, no
 *     session, no cookie and no identity provider. Judgment (g) records why: inventing one would be
 *     capability the source does not describe (S9), and the legacy mechanism was a form post against a
 *     session rather than anything an HTTP request carries.
 *   - No database driver, no statement text, no bound-parameter array and no table or column
 *     identifier. In this layer the parameterized-data-access standard inverts into a prohibition:
 *     data access has no business being named here at all (S2).
 *   - No dynamic dispatch. No `Proxy`, no `Reflect`, no decorator, no dependency-injection library
 *     and no name-keyed indexer lookup. This matters more in this file than in any other handler,
 *     because four of this service's seven members were themselves fabricated by prefix dispatch:
 *     re-creating that mechanism in a new idiom would defeat the entire exercise (TR-3). Every
 *     member below is declared individually and literally.
 *   - No read of the process environment, and no credential, host, endpoint, account identifier,
 *     region or resource-name literal (AAP §0.8.3.9). `src/config/env.ts` is the only module in the
 *     subtree permitted to read the environment.
 *   - No filesystem or path builtin, and no added dependency of any kind: the manifest gains
 *     nothing because of this file (S5). No web framework, no schema-validation package, no logging,
 *     metrics or tracing library, and no HTTP client. The AWS SDK is intentionally absent from the
 *     whole deliverable because the runtime already provides it (AAP §0.5.2.1).
 *   - No module-scope mutable state, and in particular NO CAPTURED PRINCIPAL. Every module-level
 *     declaration below is a string constant, a frozen requirement, a type, or a pure function;
 *     nothing accumulates across invocations. An account resolved once and held in the factory's
 *     closure would be reused for every request a warm container served, which is why the second
 *     parameter is a resolver invoked per request rather than a value handed in at construction
 *     (judgment (g)). AAP §0.6.6 M7 permits
 *     module-scope state only in `src/config/database.ts` and requires any memoization elsewhere to
 *     be request-scoped "to avoid cross-tenant bleed on a warm container". This module memoizes
 *     nothing at all — and in particular adds no option or option-group cache, which matters by
 *     proximity: M7 cites the memoized option-group sort order at [model/dao/SkuDAO.cfc:L204-L228],
 *     whose clear function carries carried defect D7's inverted guard, and both belong to the
 *     adapter layer (S8).
 *   - No numeric literal. Statuses are named members of `HTTP_STATUS`, so there is no timeout, page
 *     size, batch size, retry count, backoff schedule, concurrency limit or cache lifetime here, and
 *     no service-level objective of any kind (S9, IR-12, AAP §0.8.3.5).
 *   - No session locking. AAP §0.8.3.5 directs that the legacy order and payment session locks be
 *     noted and not implemented; those services are out of scope and no locking mechanism appears
 *     in the target design.
 *   - No execution-model restatement. AAP §0.6.6 M1 (the importer's one-hour request budget) belongs
 *     to `productHandler.ts` and M2 (the feed view's six-minute render budget) to
 *     `googleFeedHandler.ts`; neither is duplicated, resolved or worked around here. M5's implicit
 *     request-end flush is replaced by an explicit unit of work in the adapter layer, which this
 *     module never imports.
 *   - No health, readiness or metrics endpoint, and no route for any excluded domain family. The
 *     excluded families and the four excluded UI trees get no counterpart anywhere in this file
 *     (AAP §0.8.1, §0.2.2).
 *
 * WHY THE AWS TYPES COME FROM `./httpResponse` RATHER THAN FROM THE TYPINGS DIRECTLY. AAP §0.5.5 keeps
 * all AWS coupling inside `src/handlers/**` so a runtime migration is a change to four artifacts plus a
 * `@types/node` bump, with no change to `src/domain/**`, `src/services/**`, `src/ports/**` or
 * `src/adapters/**`. `./httpResponse` re-exports the AWS types the folder needs precisely so the
 * coupling has ONE declaration site in the whole subtree, and this module honours that.
 *
 * TEST PROVENANCE — ENTIRELY NET-NEW. No `OptionServiceTest`, `OptionTest`, `OptionGroupTest` or
 * `OptionDAOTest` exists, and the legacy suite contains no controller test of any kind — the one
 * functional product scaffold, `meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52`, is an empty
 * component with zero test methods (AAP §0.6.5.2). Every behavior here is therefore net-new coverage and
 * no traceable legacy coverage is implied (AAP §0.8.3.7). S6 manifests as testability-by-design: the
 * factory is a plain function of an interface-typed service, each member accepts only the narrow slice
 * of the event it actually reads, and nothing in the module performs a side effect.
 *
 * CARRIED-DEFECT POSITION. The AAP §0.6.7 register records no option-service defect, and none is minted
 * here. The legacy component's one scoping quirk — the unscoped loop counter at
 * `model/service/OptionService.cfc:L58` — belongs to the service, which documents its own block-scoped
 * translation. Any legacy thrown message that reaches a response passes through `errorResponse`
 * verbatim, misspellings included.
 */

import type { CatalogContainer } from '../config/container';
import { Option } from '../domain/option/Option';

import {
  HTTP_STATUS,
  createActionDispatcher,
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  isJsonObject,
  messageResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  resolveRequestAuthorization,
  unauthorizedResponse,
} from './httpResponse';

import type {
  ActionRoute,
  ActionRouteTable,
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from './httpResponse';
import type { OptionService } from '../services/OptionService';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  RequestAuthorizationContext,
  RequestAuthorizationResolver,
} from '../ports/AccountContextPort';

/* ================================================================================================
 * REQUEST MEMBER NAMES — the legacy argument names, verbatim.
 *
 * Judgment (see THE REQUEST MAPPING in the module header). The legacy component has no HTTP surface,
 * so the wire names are chosen by this port. They are taken from the source's own argument
 * declarations rather than coined, which makes each one checkable against a single locator and keeps
 * the invention to zero (S9). Declared as named constants rather than repeated as literals so the
 * name a request must use, the name a message quotes and the name a reader looks up can never drift
 * apart.
 * ============================================================================================== */

/**
 * The request-body member carrying the options to project.
 *
 * From the argument name at [model/service/OptionService.cfc:L55],
 * `getOptionsForSelect(required any options)`.
 */
const OPTIONS_BODY_MEMBER = 'options';

/**
 * The path parameter carrying the product identifier.
 *
 * From the FIRST argument name at [model/service/OptionService.cfc:L72],
 * `getUnusedProductOptions(required string productID, ...)`. It is read from the path rather than the
 * query string because it identifies the product the request is about; see THE REQUEST MAPPING for
 * why no second source is consulted.
 */
const PRODUCT_ID_PATH_PARAMETER = 'productID';

/**
 * The query-string parameter carrying the already-present option-group identifiers.
 *
 * From the argument name shared by [model/service/OptionService.cfc:L72] and [:L76]. It is read from
 * the query string because it narrows a result rather than identifying a resource. Its VALUE is
 * never inspected, split or normalised here; see judgments (c) and (d) in the module header.
 */
const EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER = 'existingOptionGroupIDList';

/**
 * The identifier member read from one entry of the request body's options array.
 *
 * Matches `Option.optionID`, the property [model/entity/Option.cfc:L52] declares as the primary
 * identifier and which [model/service/OptionService.cfc:L59] projects as the submitted half of each
 * select entry.
 */
const OPTION_ID_ENTRY_MEMBER = 'optionID';

/**
 * The display-name member read from one entry of the request body's options array.
 *
 * Matches `Option.optionName`, the property [model/entity/Option.cfc:L54] declares and which
 * [model/service/OptionService.cfc:L59] projects as the label half of each select entry.
 */
const OPTION_NAME_ENTRY_MEMBER = 'optionName';

/**
 * The entity name the authorisation gate asks about.
 *
 * `authenticateEntity( required string crudType, required string entityName )`
 * [org/Hibachi/HibachiScope.cfc:L203-L205] takes the entity name as a string, and the legacy derived
 * it from an item name by substring arithmetic — `right(itemName, len(itemName)-6)` and its siblings
 * across [org/Hibachi/HibachiAuthenticationService.cfc:L53-L77]. `'Option'` is the name
 * `model/entity/Option.cfc` declares, and it matches the permission vocabulary the same ladder reads.
 *
 * ⭐ IT IS A MODULE CONSTANT, NEVER A REQUEST VALUE, AND THAT IS THE POINT.
 * `../ports/AccountContextPort` records why `EntityAuthorizationRequest.entityName` is typed `string`
 * rather than as a closed union — the framework enumerates no entity names anywhere, so there is
 * nothing to port — and states the compensating discipline: the value is CLOSED BY THE CALLER. This is
 * that closure. Every gated member below passes this one constant, so no value from a request can
 * ever reach that member, and no caller can ask the permission model about a different entity by
 * choosing a different input.
 *
 * ⛔ THERE IS DELIBERATELY NO SECOND ENTITY NAME HERE. Two of the three members read option GROUPS
 * rather than options — [model/dao/OptionDAO.cfc:L113] selects `SwOptionGroup` rows — but neither is
 * gated on an entity question at all: both are `'anyLogin'`, for the reasons
 * {@link OPTION_ACCESS_MATRIX} records. Declaring an `'OptionGroup'` constant that nothing passes
 * would be an unused declaration (S9), so it is absent.
 */
const OPTION_ENTITY_NAME = 'Option';

/* ================================================================================================
 * NEUTRAL FAILURE TEXTS
 *
 * Deliberately NOT exported, following the convention `./httpResponse` establishes for its own
 * module-private texts: the legacy system has no equivalent string for any of these situations, so
 * none of them carries a parity obligation, and keeping them private means no consumer or test can
 * mistake one for legacy behavior. Assert on the status code instead.
 *
 * Each names only the request member at fault — the caller's own input contract — and discloses
 * nothing about the service's internals: no identifier, no collaborator, no statement, no route and
 * no environment value. Each is interpolated from the constants above so the quoted name and the
 * name actually read cannot diverge.
 * ============================================================================================== */

const OPTIONS_MEMBER_MESSAGE = `The request body must carry an "${OPTIONS_BODY_MEMBER}" array`;

/**
 * An entry of the options array was not usable.
 *
 * One text covers all three entry-level faults — not an object, a non-string identifier, a non-string
 * name — because they are one class of fault and S9 rules out inventing a finer taxonomy. It states
 * the accepted shape positively, including that an absent member is accepted, which is the rule
 * {@link readOptionEntry} implements.
 */
const OPTION_ENTRY_MESSAGE =
  `Every "${OPTIONS_BODY_MEMBER}" entry must be an object whose ` +
  `"${OPTION_ID_ENTRY_MEMBER}" and "${OPTION_NAME_ENTRY_MEMBER}" members are strings when present`;

const PRODUCT_ID_MESSAGE = `A "${PRODUCT_ID_PATH_PARAMETER}" path parameter is required`;

/**
 * No option-group identifier list was supplied at all.
 *
 * The second clause is documentation rather than a guard: it tells a caller that an EMPTY value is
 * accepted, which is judgment (d), while absence remains a bad request because the legacy argument is
 * declared `required`.
 */
const EXISTING_OPTION_GROUP_ID_LIST_MESSAGE =
  `An "${EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER}" query parameter is required; ` +
  'an empty value is accepted';

/* ================================================================================================
 * INPUT NARROWING
 *
 * Every read below starts from an untyped value and is narrowed by hand. `tsconfig.json` enables
 * `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, and that configuration is
 * parent-owned (AAP §0.4.1.2): where the checker objects, THIS FILE CHANGES. There is accordingly no
 * escape hatch anywhere in this module — no non-null assertion, no shape-forcing cast, no explicit
 * `any`, no compiler-directive comment and no lint suppression.
 *
 * No schema-validation package is introduced to do the narrowing, because S5 freezes the dependency
 * set at one runtime package. The two guards below are hand-written for exactly that reason, which is
 * the same decision `./httpResponse` records for its own `isJsonObject`.
 * ============================================================================================== */

/**
 * Narrows an unknown value to an array whose elements are themselves unknown.
 *
 * WHY THIS WRAPPER EXISTS RATHER THAN A BARE `Array.isArray` TEST. Applied to an unknown value,
 * the built-in predicate narrows to an array of unrestricted elements, so every element read
 * downstream would be unrestricted too — which the lint configuration rejects and which would defeat
 * the point of the strict settings, since an unchecked element could then be passed anywhere without
 * complaint. Declaring the guard's result as an array of unknowns keeps each element unusable until
 * it is narrowed on its own, which is what {@link readOptionEntry} then does.
 *
 * The element type is `readonly` because nothing here mutates the caller's array: the request body is
 * read, never written back.
 *
 * @param value - Any value, typically a member read from a parsed request body.
 * @returns True when the value is an array, with its elements left unnarrowed.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Hydrates one entry of the request body's options array into a domain option.
 *
 * WHY A DOMAIN INSTANCE IS CONSTRUCTED HERE AT ALL, AND WHY THAT IS NOT A LAYER VIOLATION. The
 * service member's parameter is an array of `Option`, and `Option` is a CLASS with methods
 * [model/entity/Option.cfc port], so a plain parsed object cannot stand in for one. Translating
 * request input into the shape a domain call requires IS this layer's stated job — AAP §0.3.2: "the
 * handler responsible only for translating AWS-specific input into domain calls." The class is
 * documented as constructible with no argument, with no injected collaborator, no framework
 * bootstrap, no container, no database handle and no input or output, so instantiating it performs no
 * side effect and reaches no other layer. No COLLABORATOR is constructed anywhere in this module;
 * this is a data structure, not a dependency.
 *
 * EXACTLY TWO MEMBERS ARE HYDRATED, BECAUSE EXACTLY TWO ARE READ. The legacy body at
 * [model/service/OptionService.cfc:L59] reads two accessors off each element and nothing else — the
 * option's name and its identifier — and the ported service reads the same two. Hydrating the code,
 * description, sort order, owning group, SKU links, remote identifier or audit members would invent
 * input surface for values no code path consults, which Guideline 4 forbids. Anything else the caller
 * sends is ignored rather than rejected, which is also what the legacy did: CFML reads the accessors
 * it needs and is indifferent to the rest of the object.
 *
 * ONE UNIFORM SUPPLIED-OR-NOT RULE, DERIVED FROM A DOCUMENTED SOURCE FACT. CFML models a null
 * column as a KEY ABSENT FROM the entity's variables scope, which is why every nullable column on the
 * ported class is optional rather than explicitly union-ed with an undefined value. The wire
 * equivalent of that absence is either an omitted member or an explicit null, so BOTH are treated as
 * "not supplied": the identifier keeps the class default of an empty string, exactly as
 * [model/entity/Option.cfc:L52] declares with `unsavedvalue="" default=""`, and the name is left
 * unset so the service's own absent-name judgment applies unchanged. A member that IS supplied but is
 * not a string is a bad request, because no coercion rule exists in the source to justify inventing
 * one — numbers, booleans, arrays and nested objects are all rejected rather than stringified.
 *
 * AN EMPTY ENTRY IS LEGAL. An entry that supplies neither member yields a fresh option whose
 * identifier is the empty string and whose name is unset, which the service projects as an entry with
 * an empty label and an empty submitted value. That is precisely what the legacy produced for a new,
 * unsaved option, so it is accepted rather than guarded — the same discipline as judgment (d).
 * Cardinality and order are preserved: one entry in yields one option out, duplicates included.
 *
 * @param entry - One element of the request body's options array, unnarrowed.
 * @returns The hydrated option, or nothing when the entry is not usable.
 */
function readOptionEntry(entry: unknown): Option | undefined {
  if (!isJsonObject(entry)) {
    return undefined;
  }

  const option = new Option();

  const identifier: unknown = entry[OPTION_ID_ENTRY_MEMBER];

  if (typeof identifier === 'string') {
    option.optionID = identifier;
  } else if (identifier !== undefined && identifier !== null) {
    return undefined;
  }

  const name: unknown = entry[OPTION_NAME_ENTRY_MEMBER];

  if (typeof name === 'string') {
    option.optionName = name;
  } else if (name !== undefined && name !== null) {
    return undefined;
  }

  return option;
}

/**
 * The part of the option service this handler is a function of: its three DECLARED members, and only
 * those.
 *
 * THIS TYPE MAKES JUDGMENTS (a) AND (b) COMPILE-ENFORCED RATHER THAN MERELY DOCUMENTED, AND THAT
 * IS THE ENTIRE REASON IT EXISTS. `../services/OptionService` declares SEVEN public members: the three
 * `model/service/OptionService.cfc` declares and the four `onMissingMethod` fabricated at run time
 * [org/Hibachi/HibachiService.cfc:L255-L281]. IR-1 requires the four synthesized ones to be explicit
 * there, because internal collaborators call them; but every verified call site of all four is INSIDE the
 * slice, so none may be given a route here. Narrowing the injected type to the three declared members
 * means `getOption`, `getOptionGroup`, `getOptionSmartList` and `getOptionGroupSmartList` are not merely
 * unrouted by convention — they are NOT REACHABLE from this module at all, and an attempt to route one
 * fails to compile. The narrowing is by
 * ENUMERATION of what is admitted rather than exclusion of what is not, so a member added to the service
 * later is excluded automatically and this paragraph cannot go stale in the direction that matters. The same holds for the `new*`, `save*`, `delete*`, `count*`, `list*`, `export*` and
 * `process*` prefixes of judgment (b): none is in this type, so none can be exposed by accident.
 * A discipline the compiler checks is worth more than a discipline a comment asserts.
 *
 * PARITY IS STRENGTHENED, NOT WEAKENED, BY DERIVING THE TYPE. Each member's signature is taken
 * FROM the service declaration rather than restated, so the name, the arity, the argument order and
 * the synchronous-versus-promise distinction are the service's own — there is no second copy to drift.
 * Rename or re-shape a member there and this file stops compiling, which is precisely the
 * "checkable method-by-method" property AAP §0.8.3.1 asks for.
 *
 * ROUTER.TS IS UNAFFECTED. A full service instance satisfies this type, so the composition root can
 * keep handing over the service it builds; nothing about the wiring changes. What changes is only what
 * this module is ABLE to call.
 *
 * AND IT IS WHAT MAKES THE NET-NEW COVERAGE PRACTICAL (S6). The service class holds its two
 * collaborators as private fields, so its type is nominal and a plain object cannot stand in for it. A
 * narrowed structural type can be satisfied by a three-member literal, so a test drives this handler
 * without a repository, a query port, a database, a network call or an AWS runtime — which matters
 * because the legacy repository vendors no mocking library at all (AAP §0.4.3.6). No cast is used to
 * achieve that, here or in any consumer: the narrowing is the type, not a bypass of it.
 */
export type OptionSurface = Pick<
  OptionService,
  'getOptionsForSelect' | 'getUnusedProductOptions' | 'getUnusedProductOptionGroups'
>;

/* ================================================================================================
 * EVENT SLICES
 *
 * Each member declares only the part of the proxy event it actually reads, following the convention
 * `./httpResponse` established for its own readers. Two properties follow, and both are deliberate:
 * a full proxy event satisfies every one of these types, so `router.ts` passes it straight
 * through unchanged; and a test constructs a one-member or two-member literal instead of fabricating
 * an entire AWS event, which is how S6 manifests in a folder for which AAP §0.4.1.12 defines no test
 * directory.
 *
 * The slices also make the request contract legible in the type system rather than only in prose: the
 * projection member reads a body and neither unused-option member reads a body at all.
 *
 * ⚠️ EVERY SLICE ALSO CARRIES `headers`, AND NO MEMBER READS IT. It is present for one reason only —
 * the injected authorisation resolver is given the event, and a function parameter is contravariant,
 * so each member's own slice has to be assignable to what the resolver accepts. The reasoning, and the
 * reason `headers` rather than another container was chosen, is recorded once at
 * {@link OptionAuthorizationEvent}; it is not repeated on the three slices below.
 * ============================================================================================== */

/**
 * The event slice {@link OptionHandler.getOptionsForSelect} reads: the request body, plus the headers
 * the authorisation resolver is given.
 */
export type OptionsForSelectEvent = Pick<APIGatewayProxyEvent, 'body' | 'headers'>;

/**
 * The event slice {@link OptionHandler.getUnusedProductOptions} reads: the path parameters, which
 * carry the product identifier, and the query string, which carries the option-group identifier list —
 * plus the headers the authorisation resolver is given.
 */
export type UnusedProductOptionsEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters' | 'headers'
>;

/**
 * The event slice {@link OptionHandler.getUnusedProductOptionGroups} reads: the query string, plus the
 * headers the authorisation resolver is given.
 */
export type UnusedProductOptionGroupsEvent = Pick<
  APIGatewayProxyEvent,
  'queryStringParameters' | 'headers'
>;

/**
 * The slice of the proxy event the injected authorisation resolver is given.
 *
 * ⭐ WHY A PRINCIPAL HAS TO ARRIVE WITH THE REQUEST. The legacy read it off the framework scope —
 * `getAccount()` [org/Hibachi/HibachiScope.cfc:L134-L135] returns the SESSION's account — and a
 * stateless invocation has neither a session nor an application scope (AAP §0.6.6 M7, M8). The
 * principal must therefore be resolved at the edge, per invocation, from something the request
 * carries. This handler must be able to hand the resolver something, and because a function parameter
 * is contravariant, every member's own event slice has to be assignable to whatever the resolver
 * accepts — which is the only reason `headers` appears on the three slices above.
 *
 * `headers` is the container chosen because it is the only one the platform typings declare ALWAYS
 * PRESENT — both parameter containers are declared nullable — so no member is forced to narrow a null
 * before it can even ask the authorisation question, and a hand-written double stays a one-member
 * literal.
 *
 * ⛔ AND THIS FILE NEVER READS IT. It does not call `readHeader`, name a header, name a scheme, parse
 * a token or implement authentication of any kind. Doing any of those would invent an authentication
 * mechanism the source does not describe — the legacy mechanism was a form post and a session, not an
 * HTTP scheme — which AAP §0.7.3 S9 forbids. The resolver decides how a principal is ESTABLISHED; this
 * handler decides only what happens when there is none, or when there is one without permission.
 *
 * A deployment that carries its principal somewhere else — an authorizer context, for instance —
 * widens THIS single declaration, and the three members widen with it.
 */
export type OptionAuthorizationEvent = Pick<APIGatewayProxyEvent, 'headers'>;

/**
 * What one routed option operation requires of a principal, in the legacy's own vocabulary.
 *
 * ⭐ A DISCRIMINATED UNION, BECAUSE THE TWO CLASSIFICATIONS ASK DIFFERENT NUMBERS OF QUESTIONS. An
 * `'anyLogin'` item is decided by the logged-in gate alone: the legacy branch that authorises it
 * [org/Hibachi/HibachiAuthenticationService.cfc:L67-L68] returns true without ever naming a CRUD type.
 * A `'secure'` item is decided by a per-permission-group verdict, which needs one. Expressing that as
 * a union rather than as an optional member makes the mismatch inexpressible: `'anyLogin'` cannot
 * carry a CRUD type, and `'secure'` cannot omit one — neither compiles.
 *
 * ⭐ THE TWO LITERALS ARE TIED TO THE PORT'S UNION RATHER THAN RE-TYPED. `Extract` resolves against
 * {@link HandlerAccessClassification}, so if a classification is ever renamed there the extraction
 * yields `never` and every literal below stops compiling. Restating `'anyLogin'` as a bare literal
 * would let the two vocabularies drift silently in opposite directions.
 *
 * ⛔ NO `'public'` ARM AND NO `'anyAdmin'` ARM EXIST, BECAUSE NO ROW NEEDS ONE. The union is exactly
 * as wide as the evidence in {@link OPTION_ACCESS_MATRIX}; a third arm nothing constructs would be an
 * unused declaration and, worse, a `'public'` arm would put "reachable with no account" one keystroke
 * away from a row that has no evidence for it.
 */
type OptionAccessRequirement =
  | { readonly classification: Extract<HandlerAccessClassification, 'anyLogin'> }
  | {
      readonly classification: Extract<HandlerAccessClassification, 'secure'>;
      readonly crudType: EntityCrudType;
    };

/**
 * The requirement `'anyLogin'` states: a logged-in account, and nothing further.
 *
 * Shared by both unused-option rows because both carry the identical requirement; see
 * {@link OPTION_ACCESS_MATRIX} for the evidence.
 */
const ANY_LOGIN_REQUIREMENT: OptionAccessRequirement = Object.freeze({
  classification: 'anyLogin',
});

/**
 * The requirement `'secure'` states for a read: a logged-in account whose permission groups grant
 * `read` on the entity {@link OPTION_ENTITY_NAME} names.
 *
 * `'read'` is the legacy CRUD value, not a coined one: it is what both the `detail` prefix
 * [org/Hibachi/HibachiAuthenticationService.cfc:L55-L56] and the `list` prefix [:L61-L62] resolve to.
 */
const SECURE_READ_REQUIREMENT: OptionAccessRequirement = Object.freeze({
  classification: 'secure',
  crudType: 'read',
});

/**
 * The access classification of every routed option operation, and the evidence for each row.
 *
 * ⭐ WHY THIS EXISTS AT ALL. The legacy application authorised EVERY request in one place, before any
 * controller method ran: `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203] opens with the comment
 * "Verify Authentication before anything happens" and refuses at [:L188]. No legacy controller repeated
 * that check because none needed to. That gate is framework code and does not cross the boundary
 * (AAP §0.8.3.2), so its CONTRACT had to be declared instead — see `../ports/AccountContextPort`.
 * Restoring the gate here is PARITY, not invented policy; the only thing that changes is the failure
 * mode, from a browser redirect to a status code.
 *
 * ⭐ THE VOCABULARY IS THE LEGACY'S, VERBATIM. `'anyLogin'` and `'secure'` are not words chosen here:
 * each names a `this.<name>Methods` declaration a legacy controller writes and the ladder reads by
 * name at [org/Hibachi/HibachiAuthenticationService.cfc:L33-L35] and [:L43-L49] respectively. See
 * {@link HandlerAccessClassification} for all four and their locators.
 *
 * ⭐ THE MATRIX IS WIRED INTO THE GATE, NOT MERELY DOCUMENTED BESIDE IT. {@link createOptionHandler}'s
 * `refuseUnauthorized` is given a MEMBER NAME and reads its requirement from here, so a member cannot
 * be enforced as something other than what this table declares. That is a deliberate difference from
 * `./brandHandler`, whose three rows are uniformly `'secure'` and whose gate therefore implements
 * `'secure'` unconditionally — there, classification cannot select behavior, and here it does.
 *
 * THE ROWS, AND THE EVIDENCE FOR EACH
 * -----------------------------------
 *
 * `getUnusedProductOptions` and `getUnusedProductOptionGroups` -> `'anyLogin'`. Traced end to end,
 * their ONLY reachability in the legacy is through a `preProcess` item:
 *
 *   1. [model/entity/Product.cfc:L635-L640] `getUnusedProductOptions()` calls
 *      `getService('optionService').getUnusedProductOptions(...)` at [:L637], and
 *      [model/entity/Product.cfc:L642-L647] does the same for the groups at [:L644].
 *   2. Those entity members are consumed by exactly two views —
 *      [admin/views/entity/preprocessproduct_addoption.cfm:L60] and
 *      [admin/views/entity/preprocessproduct_addoptiongroup.cfm:L60] — each rendering the select whose
 *      choices the member supplies.
 *   3. Those views belong to the `preprocess<EntityName>` items the entity controller composes at
 *      [org/Hibachi/HibachiControllerEntity.cfc:L79], on the `entity` section of the `admin`
 *      subsystem.
 *   4. Walking the ladder for such an item: it is not public, because
 *      [admin/controllers/entity.cfc:L66] declares `this.publicMethods=''` — an EMPTY list, in
 *      contrast to the only public action anywhere in this slice,
 *      [integrationServices/google/controllers/feed.cfc:L54] `this.publicMethods="product"`. It then
 *      passes the logged-in gate at [org/Hibachi/HibachiAuthenticationService.cfc:L30], fails
 *      `anyLoginMethods` [:L33-L35], fails `anyAdminMethods` [:L38-L40] and fails `secureMethods`
 *      [:L43-L49] — [admin/controllers/entity.cfc:L67-L68] declares both of the latter two empty —
 *      reaches the entity-controller branch at [:L52], which is entered because
 *      [org/Hibachi/HibachiControllerEntity.cfc:L5] sets `this.entityController = true`, and is
 *      granted by the `preProcess` prefix test at [:L67-L68], which `return true`s outright.
 *
 * ⚠️ SO THE EFFECTIVE REQUIREMENT IS "LOGGED IN, AND NOTHING MORE" — WHICH IS PRECISELY WHAT
 * `anyLoginMethods` PRODUCES [:L33-L35] — BUT IT IS REACHED BY A DIFFERENT ROUTE, AND THE DIFFERENCE
 * IS RECORDED RATHER THAN GLOSSED. There is no `anyLoginMethods` declaration to point at: the
 * permission-detail builder defaults the list to `""` at [:L241] and overwrites it only when a
 * controller declares one [:L252-L254], and NO controller anywhere in the repository declares it — so
 * that list is empty application-wide. `'anyLogin'` is therefore chosen because it is the member of
 * the legacy's own four-name vocabulary whose requirement is IDENTICAL to the one the `preProcess`
 * branch imposes, and because both branches sit BELOW the same [:L30] gate. ⛔ Minting a fifth
 * classification named after the prefix would invent vocabulary the framework does not have, which
 * AAP §0.7.3 S9 forbids; and classifying these rows `'secure'` would REFUSE callers the legacy
 * admitted, which Guideline 2 forbids just as firmly. Neither error is silently preferable to the
 * other, so the requirement is matched and the route is documented.
 *
 * `getOptionsForSelect` -> `'secure'`, BY DEFAULT DENY, BECAUSE IT HAS NO LEGACY ACTION AT ALL. A
 * repository-wide search for the member finds exactly one call site,
 * [model/service/ProductService.cfc:L76], inside `getFormattedOptionGroups` — an INTERNAL service-to-
 * service call. No view renders it, no controller item maps to it, and no `slatAction` reaches it, so
 * there is no ladder outcome to reproduce and no evidence for a weaker classification. Absent evidence
 * the strictest available requirement is declared, and the entity question asked is `read` on
 * `Option`, which is what the member does: it projects `Option` instances into select entries
 * [model/service/OptionService.cfc:L55-L63].
 *
 * ⚠️ WHY IT IS STILL MOUNTED, WHERE `./brandHandler` UNMOUNTED ITS EVIDENCE-LESS MEMBER. The
 * difference is the SOURCE DECLARATION, not the route. `newBrand` has no declaration anywhere in the
 * repository — it existed only because `onMissingMethod`
 * [org/Hibachi/HibachiService.cfc:L255-L281] fabricated it — so declining to route it removes nothing
 * the legacy declared. `getOptionsForSelect` is declared `public` at
 * [model/service/OptionService.cfc:L55], is one of the exactly three public members AAP §0.4.2.4
 * enumerates, and AAP §0.4.1.9 row 5 mandates that this file expose the option surface. Unmounting it
 * would breach the AAP; so it is exposed, and gated at the strictest level the evidence permits.
 *
 * The table and every requirement in it are frozen, so the matrix is provably immutable at runtime as
 * well as in the type system — the same requirement AAP §0.6.6 M7 places on everything outside the
 * connection pool.
 */
export const OPTION_ACCESS_MATRIX: Readonly<Record<keyof OptionHandler, OptionAccessRequirement>> =
  Object.freeze({
    getOptionsForSelect: SECURE_READ_REQUIREMENT,
    getUnusedProductOptions: ANY_LOGIN_REQUIREMENT,
    getUnusedProductOptionGroups: ANY_LOGIN_REQUIREMENT,
  });

/**
 * The option surface exposed at the Lambda boundary — three members, one per declared service member.
 *
 * THE SET IS CLOSED AT THREE. It corresponds one-to-one with the three public functions
 * `model/service/OptionService.cfc` declares, in the source's own order, so parity is checkable
 * member by member (AAP §0.8.3.1). The four members the legacy fabricated at run time are absent by
 * design — judgment (a) — and the write and enumeration prefixes the same dispatcher would have
 * answered are absent too — judgment (b).
 *
 * ⭐ THIS INTERFACE IS ALSO THE DEFINITION OF "MOUNTED", AND THAT MAKES A CLASSIFICATION MANDATORY.
 * {@link OPTION_ACCESS_MATRIX} is keyed on `keyof OptionHandler`, so every member declared here is
 * REQUIRED to carry an access requirement — adding a fourth member without classifying it does not
 * compile — and `refuseUnauthorized` is given a `keyof OptionHandler`, so an unclassified member could
 * not be gated even if one existed. "Routed" and "classified" are therefore the same set by
 * construction rather than by review. Judgment (g).
 *
 * ⭐ WHY THE MEMBERS ARE FUNCTION-TYPED READONLY PROPERTIES RATHER THAN METHODS. A route table is the
 * natural consumer of this interface, and a route table holds DETACHED function references. Declaring
 * the members as properties makes each one provably free of any dependence on a receiver — the
 * implementations close over the injected service instead — so a reference can be stored, passed and
 * invoked anywhere without binding, and a consumer never has to reason about, or lint around, a lost
 * receiver. `readonly` states the other half: a bound handler is not reconfigurable after
 * construction.
 *
 * THE RETURN TYPES ARE NOT UNIFORM, AND MUST NOT BE MADE SO. The first member is synchronous
 * because the service member it calls is synchronous; the other two return promises because theirs do.
 * A caller that wants to treat all three alike can simply await each, since awaiting a plain value is
 * well defined — but the DECLARATIONS keep the distinction the service draws, because that distinction
 * is the visible evidence that only two of the three can reach the repository.
 */
export interface OptionHandler {
  /**
   * Projects options supplied in the request body into select entries.
   *
   * Reads the array named by the options member of a JSON object body, hydrates each entry, and
   * returns the service's projection unaltered. Synchronous, and the only member here that is.
   *
   * Responses: the projection at an OK status; unauthorised when no logged-in principal is
   * established and forbidden when one is established without `read` on `Option`, both decided BEFORE
   * the body is read; a bad request when the body is absent, is not valid JSON, is not a JSON object,
   * carries no options array, or carries an entry that is not usable.
   */
  readonly getOptionsForSelect: (event: OptionsForSelectEvent) => APIGatewayProxyResult;

  /**
   * Lists the options a product may still be offered, as select entries.
   *
   * Reads the product identifier from the path and the already-present option-group identifiers from
   * the query string, then calls the service with the identifier FIRST and the list SECOND.
   *
   * Responses: the rows at an OK status; unauthorised when no logged-in principal is established,
   * decided BEFORE the product identifier is read; a bad request when either input is absent.
   */
  readonly getUnusedProductOptions: (
    event: UnusedProductOptionsEvent,
  ) => Promise<APIGatewayProxyResult>;

  /**
   * Lists the option groups not yet present on a product, as select entries.
   *
   * Reads the already-present option-group identifiers from the query string and calls the service
   * with that single argument.
   *
   * Responses: the rows at an OK status; unauthorised when no logged-in principal is established,
   * decided BEFORE the query string is read; a bad request when the input is absent.
   */
  readonly getUnusedProductOptionGroups: (
    event: UnusedProductOptionGroupsEvent,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Binds the option surface to a service instance.
 *
 * ⭐ EXPLICIT INJECTION, AND NOTHING ELSE (S3). Both parameters are collaborators, supplied by
 * the caller. The composition root — `src/config/container.ts`, a memoized factory that replaces the
 * DI/1 bean scan of [org/Hibachi/Hibachi.cfc:L289-L345] — is called by `router.ts`, which passes the
 * service in. This function therefore imports no container, constructs no service, reads no
 * registry and resolves nothing by name. There is no service locator, no dynamic method synthesis, no
 * string-keyed lookup, no decorator and no dependency-injection library, and the retired
 * `getService("optionService")` string lookup — which the legacy used case-inconsistently, as both
 * [model/entity/Product.cfc:L254] and [:L341] show — has no analogue here.
 *
 * ⭐ ONE SERVICE COLLABORATOR, BY EVIDENCE. The legacy component declares two injected properties and
 * only one is real: `optionDAO` [model/service/OptionService.cfc:L51] is live with two call sites, and
 * `productService` [:L53] has zero. Judgment (f) records why the dead edge is not reinstated. The
 * repository the live property became is the SERVICE's constructor parameter, not this function's:
 * a handler depends on the service and never on a repository, which is what keeps the hexagonal
 * direction one-way (S4).
 *
 * ⭐ AND ONE AUTHORISATION COLLABORATOR, WHICH IS REQUIRED RATHER THAN OPTIONAL. The second parameter
 * resolves this invocation's principal and its entity-authorisation verdict; judgment (g) records the
 * gate it restores. ⛔ IT IS NOT OPTIONAL AND HAS NO DEFAULT, DELIBERATELY. An optional policy would
 * make "a routed option operation with no policy" a state a caller can reach by simply not passing
 * one — exactly the default-allow shape the population gate was faulted for — whereas a required
 * parameter makes that state fail to compile. This is the same structural default-deny discipline
 * `../ports/AccountContextPort` states for {@link PopulationAuthorizationPort} and `./brandHandler`
 * applies to its own factory.
 *
 * ⛔ IT IS A RESOLVER, NOT A RESOLVED PRINCIPAL, AND THAT DISTINCTION IS A CORRECTNESS ONE. A
 * principal handed in at construction time would be captured in this closure and reused for every
 * invocation the warm container serves — precisely the cross-invocation bleed AAP §0.6.6 M7 forbids
 * outside the connection pool. The resolver is invoked per request, with that request's event.
 *
 * ⭐ THE PARAMETER IS A TYPE, AND THE SERVICE IS IMPORTED TYPE-ONLY. Nothing here calls the
 * constructor, so the import is erased at compile time and the class cannot be reached from this
 * module at run time — which is the mechanical guarantee behind "construct nothing". It also keeps the
 * bundled artifact free of any service code this entry point does not itself execute. The parameter is
 * narrowed to {@link OptionSurface}, so the four members the legacy fabricated at run time are
 * unreachable from here by construction rather than by convention.
 *
 * NO STATE, AT EITHER SCOPE (M7). The returned object is created per call and frozen; the three
 * closures capture only the injected service. Nothing is memoized, counted, cached or carried between
 * invocations, so a warm container cannot leak one request's data into another's. The module scope
 * holds only string constants, types and pure functions.
 *
 * STRANGLER-FIG INDEPENDENCE (AAP §0.8.3.8). The parameter is a type, so this module builds,
 * type-checks, bundles and can be exercised without any unconverted Slatwall code being present. This
 * folder is where "callable" is realised: "new TypeScript services must be callable and deployable
 * without requiring the rest of Slatwall to be converted."
 *
 * TEST PROVENANCE: NET-NEW. No legacy controller test of any kind exists (AAP §0.6.5.2).
 *
 * @param optionService - The option service to delegate to, narrowed to its three declared members. A
 *        full service instance satisfies it, and so does a three-member literal — which is what makes
 *        the members assertable without a repository, a database, a network call or an AWS runtime.
 * @param resolveAuthorization - Resolves this invocation's principal and its entity-authorisation
 *        verdict from the request. Required: there is no unauthorised construction of this handler.
 * @returns The three request-shaped members, frozen.
 *
 * @example
 * ```ts
 * // In router.ts, which owns every route:
 * const optionHandler = createOptionHandler(container.optionService, resolveAuthorization);
 * const result = await optionHandler.getUnusedProductOptionGroups(event);
 * ```
 */
export function createOptionHandler(
  optionService: OptionSurface,
  resolveAuthorization: RequestAuthorizationResolver<OptionAuthorizationEvent>,
): OptionHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one routed member.
   *
   * The ladder is reproduced in the legacy's own order, and each step cites the line it comes from:
   *
   *   1. NO PRINCIPAL AT ALL -> unauthorised. The legacy read the account off the framework scope
   *      [org/Hibachi/HibachiScope.cfc:L134-L135] and, with no logged-in session, fell through every
   *      classification test to the terminal `return false` at
   *      [org/Hibachi/HibachiAuthenticationService.cfc:L83].
   *   2. A PRINCIPAL THAT IS NOT LOGGED IN -> unauthorised. [:L30] gates every remaining test on
   *      `getHibachiScope().getLoggedInFlag()`, whose body is `if(!getSession().getAccount().isNew())`
   *      [org/Hibachi/HibachiScope.cfc:L40-L45]. ⚠️ THE LEGACY PREDICATE IS THE NEGATION OF "NEW",
   *      which is why the test below is on `newFlag` being true rather than false —
   *      `AccountReference.newFlag` carries `isNew()` itself, not the logged-in flag derived from it.
   *      Getting that inversion wrong would admit exactly the callers the legacy refused.
   *   3. AND THEN THE TWO CLASSIFICATIONS PART COMPANY, WHICH IS WHY THIS GATE IS NOT `./brandHandler`'s
   *      COPIED OVER. An `'anyLogin'` member is already decided: the `preProcess` branch that
   *      authorises its legacy item [:L67-L68] `return true`s outright, asking no permission question
   *      and naming no CRUD type, so this gate must stop at step 2 for those rows. Asking an entity
   *      question there would REFUSE callers the legacy admitted — a behavior change dressed up as
   *      caution. A `'secure'` member continues to the entity question at [:L43-L49], whose verdict
   *      comes from the injected port; that port resolves the super-user bypass at [:L88-L90] and the
   *      permission-group walk at [:L93-L98] behind the boundary and returns one boolean.
   *
   * Steps 1 and 2 answer 401 and step 3 answers 403, and the distinction is about the PRINCIPAL rather
   * than about the resource: see {@link unauthorizedResponse} and {@link forbiddenResponse}, where the
   * translation from the legacy login redirect is recorded.
   *
   * ⭐ IT TAKES THE MEMBER NAME, NOT A REQUIREMENT, SO A CALL SITE CANNOT DISAGREE WITH THE MATRIX.
   * The requirement is read from {@link OPTION_ACCESS_MATRIX} here, which makes that table the single
   * source of truth for what each member enforces rather than a comment beside the code that enforces
   * it. Because the parameter is `keyof OptionHandler`, a name that is not a routed member does not
   * compile, and a member removed from the surface takes its call sites down with it.
   *
   * ⭐ IT RETURNS THE REFUSAL, NOT A BOOLEAN, AND CALLERS RETURN IT IMMEDIATELY. A boolean would let a
   * member forget to return and fall through into the operation it was supposed to guard; a response
   * value cannot be ignored without the compiler noticing that a branch produces nothing.
   *
   * ⭐ SYNCHRONOUS, SO IT SERVES ALL THREE MEMBERS ALIKE. The resolver and the port member are both
   * synchronous — `../ports/AccountContextPort` records why — so this gate can be used unchanged by
   * {@link OptionHandler.getOptionsForSelect}, which is itself synchronous, as well as by the two
   * promise-returning members. No member's declared return type changes because of it.
   *
   * @param event the invocation's event, or any object carrying its headers member
   * @param member the routed member being invoked, whose requirement is read from the matrix
   * @returns the refusal to return to the caller, or nothing when the invocation is authorised
   */
  const refuseUnauthorized = (
    event: OptionAuthorizationEvent,
    member: keyof OptionHandler,
  ): APIGatewayProxyResult | undefined => {
    const requirement: OptionAccessRequirement = OPTION_ACCESS_MATRIX[member];
    const authorization: RequestAuthorizationContext = resolveAuthorization(event);
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2 of the ladder. `newFlag` is `isNew()`, so TRUE means "not logged in".
    if (account === undefined || account.newFlag) {
      return unauthorizedResponse();
    }

    // An 'anyLogin' row is decided here, because the legacy branch that authorises it returns true
    // without asking anything further. Nothing below this line runs for those two members.
    if (requirement.classification === 'anyLogin') {
      return undefined;
    }

    // Step 3, for the one 'secure' row. The port answers; the permission model stays behind the
    // boundary, and the entity name is the module constant, never a request value.
    if (
      authorization.entityAuthorization.authenticateEntity({
        crudType: requirement.crudType,
        entityName: OPTION_ENTITY_NAME,
      })
    ) {
      return undefined;
    }

    return forbiddenResponse();
  };

  /**
   * Ports the boundary for [model/service/OptionService.cfc:L55]
   * `public array function getOptionsForSelect(required any options)`.
   *
   * The one required argument arrives as the options member of a JSON object body. A body that is a
   * bare array is rejected by the shared reader as "not an object" rather than being accepted as the
   * array itself: the reader's contract is a JSON object, and admitting a second body shape would
   * invent an alternative request form the source cannot justify.
   *
   * Order and cardinality are preserved end to end. Entries are hydrated in the order received, no
   * entry is skipped, none is de-duplicated, none is sorted, and the projection the service returns is
   * serialized exactly as given — judgment (e). The first unusable entry stops the request, so a
   * partially projected result is never returned.
   *
   * SYNCHRONOUS, DELIBERATELY. The service member is synchronous, so this one is too; see the
   * asymmetry note on {@link OptionHandler}. Its failure path is still covered: a synchronous throw is
   * caught and shaped by the same single mapping every other member uses.
   *
   * ⛔ THE GATE RUNS BEFORE THE BODY IS EVEN READ. This is the one `'secure'` row
   * ({@link OPTION_ACCESS_MATRIX}), and refusing before any parsing means an unauthorised caller
   * cannot use the four distinct bad-request texts below to discover the request shape. It also means
   * the refusal is identical whatever the body contains, including when there is none.
   */
  const getOptionsForSelect = (event: OptionsForSelectEvent): APIGatewayProxyResult => {
    const refusal = refuseUnauthorized(event, 'getOptionsForSelect');

    if (refusal !== undefined) {
      return refusal;
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    const entries: unknown = body.value[OPTIONS_BODY_MEMBER];

    if (!isUnknownArray(entries)) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, OPTIONS_MEMBER_MESSAGE);
    }

    const options: Option[] = [];

    for (const entry of entries) {
      const option = readOptionEntry(entry);

      if (option === undefined) {
        return messageResponse(HTTP_STATUS.BAD_REQUEST, OPTION_ENTRY_MESSAGE);
      }

      options.push(option);
    }

    try {
      return okResponse(optionService.getOptionsForSelect(options));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/OptionService.cfc:L72]
   * `public array function getUnusedProductOptions(required string productID, required string
   * existingOptionGroupIDList)`.
   *
   * THE ARGUMENT ORDER IS THE CONTRACT, AND BOTH ARGUMENTS ARE STRINGS. `productID` is passed
   * FIRST and `existingOptionGroupIDList` SECOND, exactly as declared at
   * [model/service/OptionService.cfc:L72] and again at [model/dao/OptionDAO.cfc:L52-L53]. Because the
   * two are same-typed, swapping them would compile cleanly and return wrong rows with no error
   * anywhere, which is why the order is called out rather than assumed. The service's own note records
   * that the underlying statement binds the two in the OPPOSITE order and that reconciling them is the
   * adapter's obligation; nothing about that reaches this layer.
   *
   * The two inputs are read in the same order they are passed, so a request supplying neither reports
   * the product identifier first — which mirrors the order CFML would have evaluated its required
   * arguments in.
   *
   * The list value is forwarded byte for byte: judgment (c). An empty list is forwarded too, and
   * only ABSENCE is rejected: judgment (d). The composed label on each returned row is never
   * touched: judgment (e).
   *
   * ⛔ THE GATE RUNS BEFORE THE PRODUCT IDENTIFIER IS EVEN READ, AND THAT ORDER MATTERS HERE MORE THAN
   * ANYWHERE ELSE IN THE FILE. This member takes an attacker-selectable product identifier and answers
   * with data derived from it, so gating after the read would let an unauthorised caller distinguish a
   * product that exists from one that does not by comparing responses. Refusing first makes every
   * unauthorised request produce the same answer regardless of the identifier supplied. Judgment (g).
   */
  const getUnusedProductOptions = async (
    event: UnusedProductOptionsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getUnusedProductOptions');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID = readPathParameter(event, PRODUCT_ID_PATH_PARAMETER);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_MESSAGE);
    }

    const existingOptionGroupIDList = readQueryStringParameter(
      event,
      EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER,
    );

    if (existingOptionGroupIDList === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, EXISTING_OPTION_GROUP_ID_LIST_MESSAGE);
    }

    try {
      return okResponse(
        await optionService.getUnusedProductOptions(productID, existingOptionGroupIDList),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/OptionService.cfc:L76]
   * `public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList)`.
   *
   * One required argument, read from the query string and forwarded unchanged. Judgments (c), (d)
   * and (e) apply here identically.
   *
   * ITS SET POLARITY IS THE INVERSE OF THE SIBLING MEMBER'S, WHICH IS WHY AN EMPTY LIST MATTERS SO
   * MUCH HERE. Both members receive the same list and filter on it with opposite predicates
   * [model/dao/OptionDAO.cfc:L68] against [:L107], so an empty list resolves to NO rows for the sibling
   * and to EVERY option group for this member. A guard that rejected or defaulted an empty value would
   * therefore not merely narrow an input, it would suppress the single most useful call this member
   * has: listing every assignable group for a product that has none yet. The asymmetry is carried, not
   * reconciled; the reasoning belongs to the repository port and is not duplicated here.
   *
   * ⛔ THE GATE RUNS FIRST HERE TOO, AND IT IS WHAT MAKES JUDGMENT (d) SAFE TO KEEP. Because an empty
   * list legitimately resolves to EVERY option group, this member is the widest read in the file — so
   * the one thing that must not be reachable without a principal is precisely the call the judgment
   * protects. The classification is `'anyLogin'` ({@link OPTION_ACCESS_MATRIX}), so a logged-in
   * account is required and nothing further is asked; judgment (g).
   */
  const getUnusedProductOptionGroups = async (
    event: UnusedProductOptionGroupsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getUnusedProductOptionGroups');

    if (refusal !== undefined) {
      return refusal;
    }

    const existingOptionGroupIDList = readQueryStringParameter(
      event,
      EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER,
    );

    if (existingOptionGroupIDList === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, EXISTING_OPTION_GROUP_ID_LIST_MESSAGE);
    }

    try {
      return okResponse(
        await optionService.getUnusedProductOptionGroups(existingOptionGroupIDList),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  return Object.freeze({
    getOptionsForSelect,
    getUnusedProductOptions,
    getUnusedProductOptionGroups,
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
 * ⭐ THE COMPOSITION ROOT IS REACHED THROUGH A DEFERRED REQUIRE, and that is the one subtle thing here.
 * `../config/container` reaches `../config/database`, whose `mysql2` pool is created at module scope,
 * and `../config/env`, which validates the environment as a module-load side effect. A STATIC import
 * would run both when this module is loaded — including by `test/handlers/optionHandler.test.ts`, which
 * has neither an environment nor a database. Deferring it to the first invocation keeps module load
 * free of side effects while the pool still lives at module scope of the module that owns it, created
 * once and reused across warm invocations exactly as AAP §0.3.2 requires.
 *
 * ⚠️ THE DEFERRAL IS EXPRESSED AS A CommonJS `require`, AND AN EARLIER REVISION GOT THIS WRONG. It read
 * `await import('../config/container.js')`, on the reasoning that a dynamic import inside a CommonJS
 * module is a real ECMAScript import, that `moduleResolution: NodeNext` requires the extension there,
 * and that `tsc` and esbuild both resolve it to this subtree's TypeScript source. The last clause held
 * for type-checking and for the packaged artifact, and failed at runtime for the sources: NodeNext
 * PRESERVES the native `import()` in CommonJS output, so the ESM resolver demanded an on-disk
 * `src/config/container.js` that only an emit produces — so running the source answered `500` for every
 * action while the artifact answered correctly. The measurement and the rejected alternatives are
 * recorded at the require itself.
 *
 * ⛔ THE ROUTE NAMES ARE DECLARED HERE, ONCE. `./router.ts` composes {@link createOptionRoutes} into
 * the aggregate surface rather than restating these keys.
 * ================================================================================================== */

/**
 * The actions this entry point serves, in the legacy `slatAction` vocabulary.
 *
 * `option.` is the surface prefix and the suffix is the member name. The three keys are the three
 * declared members of AAP §0.4.2.4; the four synthesized members of §0.4.2.5 that the option service
 * also carries are not routed, for the reasons the module header records.
 */
export type OptionRouteKey =
  | 'option.getOptionsForSelect'
  | 'option.getUnusedProductOptions'
  | 'option.getUnusedProductOptionGroups';

/**
 * Builds the option handler from the composition root.
 *
 * The wiring lives here rather than in `./router.ts` because this file knows which collaborators the
 * option surface needs.
 *
 * ⭐ THE RESOLVER IS A PARAMETER, AND AN EARLIER REVISION HARD-WIRED IT. It passed
 * `resolveFailClosedAuthorization` as a literal argument, so no deployment could supply a principal
 * through anything it can reach and every option action answered `401` permanently. A code review
 * classified that as a CRITICAL callable-boundary defect; the remedy it directed is this parameter plus
 * the registration seam in `./httpResponse.ts` §8.1, which the default consults on EVERY invocation
 * rather than capturing a context when this factory runs.
 *
 * ⚠️ THE PARAMETER IS NARROWED TO THE MEMBERS THIS SURFACE READS, AND THE NARROWING IS LOAD-BEARING.
 * It used to be the whole `CatalogContainer`, which meant only the aggregate graph could satisfy it — and
 * the aggregate graph is every collaborator of the slice. Asking for just these members lets BOTH the
 * aggregate root (`../config/container.ts`, which `./router.ts` passes) and this entry's own narrow graph
 * (`../config/container.ts`'s `getOptionSurfaceGraph`) satisfy it, which is what keeps this factory
 * exercisable with an object literal instead of a whole graph (PERF-01). The type import of the container
 * stays: a `type` position is erased at emit, so it adds no load-time edge.
 *
 * ⚠️ WHAT THE NARROWING NO LONGER BUYS, STATED SO THE CLAIM MATCHES THE TREE. An earlier revision put the
 * narrow graph in its own module, `src/config/surfaces/optionSurface.ts`, and this note said the narrowing
 * removed this artifact's module EDGE to collaborators no route here can reach. AAP §0.3.1 enumerates 102
 * files and that module was not among them, so it is folded into the composition root: requiring the root
 * now reaches the whole of it, and the bundler can no longer drop the unreached half per artifact. That is a
 * package-SIZE consequence and nothing more — the finding itself labelled the figure a disclosure rather
 * than a budget, and IR-12 forbids restating it as a threshold. What survives is the load-bearing half: the
 * accessor still composes and memoises only this surface's collaborators, so a warm invocation constructs
 * exactly what this entry can reach, and this parameter still accepts a literal.
 *
 * @param container the memoized service graph
 * @param resolveAuthorization the per-invocation authorisation resolver. Defaults to
 *   `./httpResponse.ts`'s registered-resolver reader — the deployment's resolver when one is
 *   registered, the constant deny-all context otherwise, so the default remains fail-closed.
 * @returns the three routed option operations
 */
export function createOptionHandlerFromContainer(
  container: Pick<CatalogContainer, 'optionService'>,
  resolveAuthorization: RequestAuthorizationResolver<OptionAuthorizationEvent> = resolveRequestAuthorization,
): OptionHandler {
  return createOptionHandler(container.optionService, resolveAuthorization);
}

/**
 * Maps each served action name onto the member that answers it.
 *
 * `getOptionsForSelect` is SYNCHRONOUS — the projection it performs needs no data access, which the
 * module header explains — so it is adapted with `Promise.resolve` here rather than being made async in
 * the handler. Adapting at the route declaration keeps the member's own contract honest about the fact
 * that it awaits nothing.
 *
 * @param handlers the option handler whose members the actions resolve to
 * @returns the frozen action table for the option surface
 */
export function createOptionRoutes(handlers: OptionHandler): ActionRouteTable<OptionRouteKey> {
  /*
   * ⚠️ THE LITERAL IS ANNOTATED BEFORE IT IS FROZEN, AND THE ORDER IS LOAD-BEARING. `Object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<OptionRouteKey, ActionRoute> = {
    'option.getOptionsForSelect': (event: APIGatewayProxyEvent) =>
      Promise.resolve(handlers.getOptionsForSelect(event)),
    'option.getUnusedProductOptions': (event: APIGatewayProxyEvent) =>
      handlers.getUnusedProductOptions(event),
    'option.getUnusedProductOptionGroups': (event: APIGatewayProxyEvent) =>
      handlers.getUnusedProductOptionGroups(event),
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
let dispatchOptionAction: ActionRoute | undefined;

/**
 * The shape `../config/container`'s `getOptionSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 *
 * `typeof import(...)` is a TYPE position only. It is erased at emit, so it adds no load-time edge from
 * this file to the composition root — which is the entire point of resolving the graph lazily.
 *
 * ⭐ IT NAMES THIS SURFACE, NOT THE AGGREGATE ROOT, AND THAT ONE SPECIFIER IS THE WHOLE OF PERF-01 ON THIS
 * ENTRY. `../config/container.ts` names all thirty-one collaborators of the slice, so a `require` of it
 * made every one of them reachable from this artifact and constructed every one of them on the first
 * invocation. `../config/container.ts`'s folded option-surface section composes only what these routes can reach — and it does so
 * by calling the SAME `compose*Surface` function the aggregate root calls, so the two cannot diverge on how
 * any service is assembled.
 */
type OptionSurfaceModule = typeof import('../config/container');

/**
 * The Lambda entry point for the option surface.
 *
 * A configuration failure surfaces through {@link errorResponse} rather than escaping as an unhandled
 * rejection. `./router.ts` deliberately differs — it resolves the graph at module load, so a
 * misconfiguration fails its cold start outright — and the two behaviours are complementary: the
 * router is the primary entry and fails loudest, while each per-surface entry stays loadable and
 * answerable — a missing or malformed variable answers `500 "The service is not correctly configured"`
 * on every invocation, classified rather than opaque, and the offending variable is published nowhere —
 * the server-side diagnostic carries the failure class, the classification code and a correlation ID, and
 * nothing else. The full decision, and why the asymmetry is deliberate on both sides, is recorded in
 * `./router.ts` and in README §4.
 *
 * @param event the proxy event, carrying the action in its query string
 * @returns the response for the addressed action, or a not-found for one this surface does not serve
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchOptionAction === undefined) {
      /*
       * ⭐ A DEFERRED CommonJS `require`, DELIBERATELY NOT A DYNAMIC `import()`. The difference was
       * MEASURED, not assumed, and it decided this line.
       *
       * This expression read `await import('../config/container.js')` until a QA pass invoked the five
       * per-surface entries from their TypeScript sources. TypeScript's NodeNext emit PRESERVES a native
       * `import()` inside a CommonJS output file — deliberately, so a CJS module can load ESM — which
       * hands the specifier to Node's ESM resolver. That resolver takes a relative specifier literally
       * and requires an on-disk `.js`: the packaged bundle has one and a plain `tsc` emit has one, but
       * the `.ts` source tree has not. Running the source therefore failed with ERR_MODULE_NOT_FOUND,
       * the catch below classified it as an unclassified fault, and EVERY action on this entry —
       * including the ones that need no container at all — answered `500` where the artifact answered
       * `404`. Under ts-jest it failed one step earlier still, with "A dynamic import callback was
       * invoked without --experimental-vm-modules", because a native `import()` is executed by the host
       * and never reaches Jest's module registry. That is why no `moduleNameMapper` entry could have
       * repaired it and why none is declared: jest.config.ts §6 records the same measurement, and a
       * resolver alias understood by one tool and not the others is the exact failure mode AAP §0.4.3.5
       * rules out.
       *
       * A `require` is resolved by the CommonJS algorithm instead, from an EXTENSIONLESS specifier
       * matching every other relative import in this subtree, so esbuild, `tsc` emit, ts-node and
       * ts-jest all reach the same module and the source and the artifact answer identically.
       *
       * ⚠️ THE DEFERRAL ITSELF IS UNCHANGED, AND IT IS LOAD-BEARING. The call sits inside this one-time
       * initialisation branch, so importing this module still constructs no container and reads no
       * environment — the property `test/handlers/entrySurface.test.ts` asserts, and the reason
       * `./router.ts`, which resolves the graph at module load, fails a misconfigured deployment at cold
       * start while this entry stays loadable and answers the classified configuration failure per
       * invocation.
       */
      const { getOptionSurfaceGraph } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above
        require('../config/container') as OptionSurfaceModule;
      const container = getOptionSurfaceGraph();

      dispatchOptionAction = createActionDispatcher<OptionRouteKey>({
        routes: createOptionRoutes(createOptionHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchOptionAction(event);
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
type AssertHandlerAssignable<TActual extends TExpected, TExpected> = TActual;
type _OptionHandlerSatisfiesLambdaContract = AssertHandlerAssignable<
  typeof handler,
  APIGatewayProxyHandler
>;

/* ================================================================================================
 * THE DEPLOYMENT REGISTRATION SEAM, RE-EXPORTED SO IT IS REACHABLE FROM THE PACKAGED ARTIFACT
 * ============================================================================================== */

/*
 * ⭐ THIS ARTIFACT SERVES THE GATED OPTION SURFACE, so a deployment that mounts `handler` above — rather
 * than `./router.ts`'s aggregate — needs the registration seam on THIS module. Every option route is
 * gated, so without a registered resolver this artifact answers `401` and nothing else.
 */
/*
 * ⛔ WHY A RE-EXPORT IS NECESSARY AND NOT MERELY TIDY. `registerRequestAuthorizationResolver` is declared
 * in `./httpResponse.ts` §8.1, which is NOT a build entry point — `build/esbuild.mjs` lists it under
 * `NON_ENTRY_HANDLER_MODULES` precisely because it is a shared helper. esbuild therefore INLINES it into
 * every entry it bundles, and an inlined module's exports do not survive: a deployment that requires the
 * emitted artifact sees only what the ENTRY module exports. Measured before this block existed,
 * `Object.keys(require('./dist/handlers/router.js'))` was exactly `['createRouter', 'handler']`, and the
 * registration function appeared nowhere in any of the five gated bundles.
 *
 * ⛔ THAT IS THE SAME DEFECT SHAPE THE REVIEW RAISED, ONE LAYER OUT. CQ-1's first remedy — the optional
 * `resolveAuthorization` parameter this module already accepts — serves a deployment that compiles its own
 * entry module against the SOURCE. It does nothing for one that takes a packaged bundle as it stands, and
 * `README.md` §7.2 promises that second route in as many words. A seam documented as callable that no
 * caller can reach is what CQ-1 was about; leaving the registrar unexported would have reproduced it.
 *
 * ⭐ WHAT THE RE-EXPORT MAKES REACHABLE IS A REGISTRAR, NOT A PRINCIPAL. §8.1 holds one module-scope cell
 * containing the deployment's resolver FUNCTION, read inside every invocation's call rather than when the
 * graph was composed, so nothing is memoized across invocations and AAP §0.6.6 M7 is untouched. The four
 * gated factories already default their resolver to §8.1's `resolveRequestAuthorization`, which is the
 * reader of that cell — so a resolver registered during initialisation is honoured by this artifact even
 * though its dispatcher was built at module load.
 *
 * ⚠️ AND IT CHANGES NO ANSWER BY ITSELF. Nothing in this subtree calls either function, so a graph built
 * by this port alone still resolves no principal and every gated route still answers `401`. Re-exporting a
 * registrar is not registering one, and this module still parses no header, decodes no token and verifies
 * no signature — AAP §0.2.2.3 excludes the legacy authentication adapters and §0.8.3.2 forbids carrying
 * `org/Hibachi/**` forward, so the identity itself remains the deployment's to supply.
 *
 * `clearRequestAuthorizationResolver` travels with it because the only thing it can do is take a gate
 * AWAY: it resets the cell to absent, which is the fail-closed state, so exposing it cannot relax
 * anything. A deployment able to register must be able to unwind that registration — in a harness, or
 * between two configuration attempts — without discarding the module registry.
 *
 * The two types are re-exported for the same reason the functions are: a deployment writing a resolver
 * against a packaged artifact needs the shape it must satisfy, and `CatalogAuthorizationRequest` is the
 * one request slice — `Pick<APIGatewayProxyEvent, 'headers'>` — that serves all four gated surfaces.
 */
export {
  clearRequestAuthorizationResolver,
  registerRequestAuthorizationResolver,
} from './httpResponse';

export type { CatalogAuthorizationRequest, CatalogAuthorizationResolver } from './httpResponse';
