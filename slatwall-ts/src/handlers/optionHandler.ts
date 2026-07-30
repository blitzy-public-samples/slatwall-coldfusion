/**
 * optionHandler — the AWS Lambda boundary for the Catalog's option surface.
 *
 * Authority: AAP §0.4.1.9 row 5 — "slatwall-ts/src/handlers/optionHandler.ts | CREATE |
 * model/service/OptionService.cfc | Exposes the option surface." AAP §0.3.1 lists it in the target
 * tree as `optionHandler.ts <- OptionService public surface`. The exposed member set is fixed by
 * AAP §0.4.2.4 and CONSTRAINED by AAP §0.4.2.5; the dependency classification is AAP §0.6.3.4.
 *
 * WHAT THIS FILE IS
 * -----------------
 * AAP §0.3.2, quoting AWS's own reference layout for this architecture: "the handler responsible
 * only for translating AWS-specific input into domain calls." Each member below does exactly four
 * things, in order: narrow the event, call ONE service member, shape the outcome through
 * `./httpResponse`, return. There is no query, no combination enumeration, no validation rule, no
 * field mapping and no statement text anywhere in this module.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 *   ⛔ It is not a router. It declares no route table, no path template, no method matching and no
 *      dispatch of any kind. `./httpResponse` states the division plainly in its own header —
 *      "Routing is router.ts" — and AAP §0.4.1.9 row 1 assigns the FW/1 `slatAction` convention's
 *      replacement to that file. This module correspondingly exports no Lambda entry point: it
 *      exports three request-shaped functions and the factory that binds them to a service.
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
 * `model/service/OptionService.cfc` is 99 lines and declares exactly three public functions. TR-1
 * requires that the name, arity and argument order of each be preserved, and AAP §0.8.3.1 states
 * the reason: interface parity has to be "checkable method-by-method". The correspondence is
 * therefore one-to-one and in the source's own order:
 *
 *   [model/service/OptionService.cfc:L55]
 *     public array function getOptionsForSelect(required any options)
 *   -> `OptionService.getOptionsForSelect(options: Option[]): SelectOption[]`
 *   -> {@link OptionHandler.getOptionsForSelect}                              SYNCHRONOUS
 *
 *   [model/service/OptionService.cfc:L72]
 *     public array function getUnusedProductOptions(required string productID,
 *                                                  required string existingOptionGroupIDList)
 *   -> `OptionService.getUnusedProductOptions(productID, existingOptionGroupIDList)`
 *   -> {@link OptionHandler.getUnusedProductOptions}                          PROMISE-RETURNING
 *
 *   [model/service/OptionService.cfc:L76]
 *     public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList)
 *   -> `OptionService.getUnusedProductOptionGroups(existingOptionGroupIDList)`
 *   -> {@link OptionHandler.getUnusedProductOptionGroups}                     PROMISE-RETURNING
 *
 * ⭐ THE SYNCHRONOUS-VERSUS-ASYNCHRONOUS ASYMMETRY IS DELIBERATE AND IS MIRRORED HERE. The first
 * service member is synchronous because its legacy body is a pure in-memory projection that touches
 * no collaborator; the other two are promise-returning because they reach the repository. Making
 * all three uniform would be tidier and WRONG: it would change the call shape of a pure
 * transformation and hide the fact that only two of the three can perform data access. The
 * asymmetry is reproduced exactly, so the two files can be read side by side.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP §0.8.2 Guideline 6)
 * -----------------------------------------------------------------
 * Guideline 6 requires that every technology-specific translation decision be documented where the
 * judgment is made. Six judgments belong to this file, lettered (a) through (f) and each restated at
 * the member or declaration it governs.
 *
 * (a) THE FOUR SYNTHESIZED MEMBERS ARE DECLARED ON THE SERVICE AND DELIBERATELY NOT ROUTED HERE.
 *     `getOption`, `getOptionGroup`, `getOptionSmartList` and `getOptionGroupSmartList` have NO
 *     declaration anywhere in `model/service/OptionService.cfc` — or anywhere in the repository.
 *     They resolved at run time only because `onMissingMethod`
 *     [org/Hibachi/HibachiService.cfc:L255-L281] fabricated the whole implicit surface by
 *     lower-cased prefix: the `get` test at [:L258], split on the `smartlist` suffix at
 *     [:L259-L260], then `new` [:L264], `list` [:L266], `save` [:L268], `delete` [:L270], `count`
 *     [:L272], `export` [:L274] and `process` [:L276], throwing at [:L280] for anything else.
 *     IR-1 and TR-3 require each USED one to become an explicit, compile-checked, typed method,
 *     and `../services/OptionService` duly declares all four.
 *     ⛔ That declaration exists to satisfy INTERNAL callers, and it is not a mandate to expose
 *     them over HTTP. Every verified call site is inside the slice: `getOption` from
 *     [model/service/SkuService.cfc:L75], `getOptionGroup` from
 *     [model/service/ProductService.cfc:L115], `getOptionSmartList` from `Product`'s own
 *     `getOptionsByOptionGroup()` [model/entity/Product.cfc:L340-L347], and
 *     `getOptionGroupSmartList` from `Product.getOptionGroups()` [model/entity/Product.cfc:L251-L261].
 *     Not one is an external entry point. Giving any of them a route would invent public surface the
 *     legacy never exposed, which S9 forbids ("invent nothing") and Guideline 4 forbids again ("do
 *     not enhance or optimize business logic beyond what the migration requires"). None is routed,
 *     and none is even imported here.
 *
 * (b) SYNTHESIS IS REPRODUCED ONLY WHERE IT WAS USED. AAP §0.4.2.5 closes the surface in one
 *     sentence: "Not declared — synthesis is not reproduced wholesale, only where used." The
 *     retired dispatcher would have answered the `new*`, `save*`, `delete*`, `count*`, `list*`,
 *     `export*` and `process*` prefixes for this entity just as readily as it answered `get*` —
 *     [org/Hibachi/HibachiService.cfc:L264-L277] routes every one of them. ⛔ NONE has a call site
 *     anywhere in the slice, so NONE is declared on the service and none is exposed here. The five
 *     empty banner pairs in the legacy component — Logical Methods [:L66-L68], Process Methods
 *     [:L82-L84], Save Overrides [:L86-L88], Smart List Overrides [:L90-L92] and Get Overrides
 *     [:L94-L96] — are the source's own confirmation that it overrides nothing in any of those
 *     categories. "Completing" the option write surface here would be pure fabrication.
 *
 * (c) THE OPTION-GROUP IDENTIFIER LIST STAYS A SINGLE COMMA-DELIMITED STRING, END TO END. Both
 *     unused-option members take `existingOptionGroupIDList` as one `required string`, and CFML
 *     models it as a comma-delimited list value rather than as a collection. It is read from the
 *     request and handed to the service UNTOUCHED: not split, not trimmed, not de-duplicated, not
 *     re-ordered, not re-joined and not re-encoded. ⛔ The decision to parse it belongs to exactly
 *     one place — `src/adapters/mysql/MySqlOptionRepository.ts`, which ports
 *     [model/dao/OptionDAO.cfc:L93-L116] and, per AAP §0.4.1.7, "generates the correct number of
 *     `?` placeholders and binds each value, rather than concatenating the list into the statement".
 *     A second parser here would be a second source of truth for delimiter handling, whitespace and
 *     empty entries, and the two would drift silently. One parser, one owner, and it is not this
 *     file.
 *
 * (d) AN EMPTY OPTION-GROUP IDENTIFIER LIST IS A LEGAL INPUT AND IS DELIBERATELY NOT GUARDED. The
 *     legacy queries at [model/dao/OptionDAO.cfc:L51-L91] and [:L93-L116] are driven by whatever the
 *     caller supplies, and an empty list is meaningful on both: the set-membership member resolves
 *     to no rows, and its negated counterpart resolves to every option group — which is correct,
 *     because a product with no groups yet has none used. ⛔ There is therefore NO emptiness test in
 *     this file, no substituted default and no rejection. This is the same discipline AAP §0.6.1.3
 *     T5 applies to an empty selected-option list, where guarding an input the legacy accepts is
 *     recorded as a silent behavior change.
 *     ⚠️ ABSENT IS NOT EMPTY, AND THE TWO ARE KEPT DISTINCT. The legacy argument is declared
 *     `required`, so a request that supplies no value at all is a bad request, while a request that
 *     supplies an empty value is honoured verbatim. `./httpResponse` makes the same point about its
 *     readers and about this exact hazard: substituting an empty string for an absent parameter
 *     "would feed a real value into a member that behaves differently for it. Absent stays absent."
 *     The readers return an absent value as such, and the guards below test ONLY for absence.
 *
 * (e) THE COMPOSED OPTION LABEL IS PRODUCED BELOW THIS LAYER, NEVER IN IT.
 *     {@link OptionHandler.getUnusedProductOptions} returns rows whose display half was already
 *     composed from two names by the data-access layer at [model/dao/OptionDAO.cfc:L88] — the owning
 *     group's name, a space, a hyphen, a space, then the option's own name — whereas
 *     [model/dao/OptionDAO.cfc:L113] emits the group's plain name for the sibling member and
 *     [model/service/OptionService.cfc:L59] emits the option's plain name for the projection member.
 *     ⛔ Three members, three different label semantics, and this file composes, re-splits,
 *     reformats, trims and re-cases NONE of them. The service's own `OP-1` note records why: the
 *     row shape and the projection shape are structurally identical BY DESIGN so the rows pass
 *     through untouched, which means a well-meaning re-projection anywhere above the repository
 *     would silently replace a two-part label with a bare name and no type check could catch it.
 *     Every response body below is the service's return value, serialized and otherwise unaltered.
 *
 * (f) THE DEAD `productService` INJECTION IS NOT REINTRODUCED. `model/service/OptionService.cfc:L53`
 *     declares `property name="productService"` and AAP §0.6.3.4 records the call-site count as
 *     ZERO — the component's only two bodies, at [:L73] and [:L77], both reach `getOptionDAO()`.
 *     It is one of the four dead injections the port drops, and AAP §0.6.3.5 records the aggregate
 *     result: "Four dead injections removed, one hidden dynamic dependency surfaced." ⛔ This
 *     handler therefore injects ONE collaborator and imports no other service. Reintroducing the
 *     edge for convenience would recreate a cycle for a collaborator nothing ever called, since the
 *     product side already consumes the option side. No parity annotation is needed for it: it is a
 *     service-layer wiring fact, recorded here only so the omission reads as a decision.
 *
 * THE REQUEST MAPPING, AND WHY NOTHING ABOUT IT IS INVENTED
 * --------------------------------------------------------
 * The legacy has no HTTP surface for any of these members: a request entered through `index.cfm`,
 * the retired FW/1 layer selected a view by convention, and nothing in the component chose a status
 * code, a parameter name or a body shape. Every mapping below is therefore a judgment by this port,
 * and each is made by the least inventive rule available — REQUEST MEMBER NAMES ARE THE LEGACY
 * ARGUMENT NAMES, VERBATIM:
 *
 *   - `options` is read from the JSON request body, because `options` is the argument name at
 *     [model/service/OptionService.cfc:L55].
 *   - `productID` is read from the route's path parameters, because it identifies the product the
 *     request is about.
 *   - `existingOptionGroupIDList` is read from the query string, because it narrows a result rather
 *     than identifying a resource.
 *
 * Each input has exactly ONE source. ⛔ No fallback chain is offered — reading a value from the path
 * and then from the query string would invent precedence semantics the source never had, and would
 * make the observable outcome depend on a rule no reviewer could check against the legacy. A route
 * that binds `productID` as a path parameter is therefore part of this module's contract with
 * `router.ts`, and is stated here rather than papered over with a silent fallback.
 *
 * ARCHITECTURAL POSITION (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------
 * `src/handlers/` is the outermost layer and this module sits at its edge, with exactly three
 * imports: the response and input helpers from `./httpResponse`, the service type it is a function
 * of, and the one domain class it must instantiate to satisfy that service's signature. All three
 * specifiers are relative and extensionless, because `tsconfig.json` declares no `paths` or
 * `baseUrl` and AAP §0.4.3.5 requires relative imports "so `tsc` and `esbuild` resolve identically
 * and no runtime resolver shim is needed" — an alias that type-checks can still fail to resolve at
 * cold start.
 *
 * What is consequently absent, all deliberate:
 *   - No import from `../adapters/`, `../validation/`, `../config/`, `../ports/` or `../util/`, and
 *     no import of another service. In particular `../config/container` is NOT imported: it is a
 *     memoized factory that `router.ts` calls, and it passes the service in. This module constructs
 *     no collaborator and resolves nothing by name (S3).
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
 *   - No module-scope mutable state. Every module-level declaration below is a string constant, a
 *     type, or a pure function; nothing accumulates across invocations. AAP §0.6.6 M7 permits
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
 * ⭐ WHY THE AWS TYPES COME FROM `./httpResponse` RATHER THAN FROM THE TYPINGS DIRECTLY. AAP §0.5.5,
 * verbatim: "The hexagonal boundary confines all AWS coupling to `src/handlers/**`, so migrating to
 * a newer runtime is a change to those four artifacts plus a `@types/node` bump — with no change to
 * `src/domain/**`, `src/services/**`, `src/ports/**` or `src/adapters/**`." `./httpResponse`
 * re-exports the AWS types the folder needs precisely so the coupling has ONE declaration site in
 * the whole subtree, and this module honours that: it names AWS types, as the only layer permitted
 * to, but it obtains them from the sibling. None of the four version-coupled artifacts AAP §0.5.5
 * enumerates lives in this folder, and no infrastructure definition appears here (AAP §0.2.2.5).
 *
 * ⭐ TEST PROVENANCE — ENTIRELY NET-NEW, WITH NO PARITY IMPLIED ANYWHERE. AAP §0.6.5.2 is decisive:
 * no `OptionServiceTest` exists, no `OptionTest` or `OptionGroupTest` entity test exists, no
 * `OptionDAOTest` exists, and the legacy suite contains no controller test of any kind — the one
 * functional product scaffold, [meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52], is an
 * empty component with zero test methods. Every behavior in this file is therefore NET-NEW coverage
 * and no claim of traceable legacy coverage is made or implied (AAP §0.8.3.7). AAP §0.4.1.12 defines
 * no test directory for this folder, so S6 manifests here as testability-by-design instead: the
 * factory is a plain function of an interface-typed service, each member accepts only the narrow
 * slice of the event it actually reads, and nothing in the module performs a side effect. A test can
 * therefore drive any member with a one-member object literal and a hand-written service stub, which
 * is necessary because the legacy repository vendors no mocking library at all (AAP §0.4.3.6) — and
 * it is why target tests are unit tests where the legacy ones were integration tests.
 *
 * ⭐ CARRIED-DEFECT POSITION. This file surfaces no entry of the AAP §0.6.7 register: the register
 * records no option-service defect, and no new identifier is minted here. The legacy component's
 * one scoping quirk — the unscoped loop counter at [model/service/OptionService.cfc:L58] — belongs
 * to the service, which documents its own block-scoped translation. Any legacy thrown message that
 * reaches a response passes through `errorResponse` verbatim, misspellings included.
 *
 * `model/service/OptionService.cfc`, `org/Hibachi/HibachiService.cfc` and `model/entity/Product.cfc`
 * are REFERENCE-ONLY and are never modified. AAP §0.4.1.1 makes that an invariant of the whole
 * deliverable — every target file is a creation, every legacy file a reference, and there are zero
 * modification rows — and TR-6 keeps the CFML tree byte-for-byte unchanged. Behavior is preserved
 * exactly while the idiom changes freely, which is the two halves of the Minimal Change Clause
 * (AAP §0.8.1): "It does not mean preserving CFML idioms in TypeScript; idiomatic, conventional
 * TypeScript is expected."
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. `review_rules` returns exactly one line, and that line
 * reads, verbatim: "No user rules provided." No ancillary rule-bearing file exists anywhere in the
 * repository either (AAP §0.7.1), so zero files enter scope by rule. Per UR4 that absence is not
 * permission to lower the bar: the nine binding standards of AAP §0.7.3 govern instead, and each is
 * discharged above or at the declaration it constrains.
 */

import { Option } from '../domain/option/Option';

import {
  HTTP_STATUS,
  errorResponse,
  invalidRequestBodyResponse,
  isJsonObject,
  messageResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
} from './httpResponse';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from './httpResponse';
import type { OptionService } from '../services/OptionService';

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
 * the query string because it narrows a result rather than identifying a resource. ⛔ Its VALUE is
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

/** The body was a JSON object but its options member was absent or was not an array. */
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

/** The route bound no product identifier, and the legacy argument is required. */
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
 * ⭐ WHY THIS WRAPPER EXISTS RATHER THAN A BARE `Array.isArray` TEST. Applied to an unknown value,
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
 * ⭐ WHY A DOMAIN INSTANCE IS CONSTRUCTED HERE AT ALL, AND WHY THAT IS NOT A LAYER VIOLATION. The
 * service member's parameter is an array of `Option`, and `Option` is a CLASS with methods
 * [model/entity/Option.cfc port], so a plain parsed object cannot stand in for one. Translating
 * request input into the shape a domain call requires IS this layer's stated job — AAP §0.3.2: "the
 * handler responsible only for translating AWS-specific input into domain calls." The class is
 * documented as constructible with no argument, with no injected collaborator, no framework
 * bootstrap, no container, no database handle and no input or output, so instantiating it performs no
 * side effect and reaches no other layer. ⛔ No COLLABORATOR is constructed anywhere in this module;
 * this is a data structure, not a dependency.
 *
 * ⭐ EXACTLY TWO MEMBERS ARE HYDRATED, BECAUSE EXACTLY TWO ARE READ. The legacy body at
 * [model/service/OptionService.cfc:L59] reads two accessors off each element and nothing else — the
 * option's name and its identifier — and the ported service reads the same two. Hydrating the code,
 * description, sort order, owning group, SKU links, remote identifier or audit members would invent
 * input surface for values no code path consults, which Guideline 4 forbids. Anything else the caller
 * sends is ignored rather than rejected, which is also what the legacy did: CFML reads the accessors
 * it needs and is indifferent to the rest of the object.
 *
 * ⭐ ONE UNIFORM SUPPLIED-OR-NOT RULE, DERIVED FROM A DOCUMENTED SOURCE FACT. CFML models a null
 * column as a KEY ABSENT FROM the entity's variables scope, which is why every nullable column on the
 * ported class is optional rather than explicitly union-ed with an undefined value. The wire
 * equivalent of that absence is either an omitted member or an explicit null, so BOTH are treated as
 * "not supplied": the identifier keeps the class default of an empty string, exactly as
 * [model/entity/Option.cfc:L52] declares with `unsavedvalue="" default=""`, and the name is left
 * unset so the service's own absent-name judgment applies unchanged. A member that IS supplied but is
 * not a string is a bad request, because no coercion rule exists in the source to justify inventing
 * one — numbers, booleans, arrays and nested objects are all rejected rather than stringified.
 *
 * ⭐ AN EMPTY ENTRY IS LEGAL. An entry that supplies neither member yields a fresh option whose
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

/* ================================================================================================
 * THE INJECTED SURFACE
 * ============================================================================================== */

/**
 * The part of the option service this handler is a function of: its three DECLARED members, and only
 * those.
 *
 * ⭐⭐ THIS TYPE MAKES JUDGMENTS (a) AND (b) COMPILE-ENFORCED RATHER THAN MERELY DOCUMENTED, AND THAT
 * IS THE ENTIRE REASON IT EXISTS. `../services/OptionService` declares SEVEN public members: the three
 * `model/service/OptionService.cfc` declares, plus the four `onMissingMethod` fabricated at run time
 * [org/Hibachi/HibachiService.cfc:L255-L281]. IR-1 requires all seven to be explicit there, because
 * internal collaborators call the four; but every verified call site of those four is INSIDE the slice,
 * so none may be given a route here. Narrowing the injected type to the three declared members means
 * `getOption`, `getOptionGroup`, `getOptionSmartList` and `getOptionGroupSmartList` are not merely
 * unrouted by convention — they are NOT REACHABLE from this module at all, and an attempt to route one
 * fails to compile. The same holds for the `new*`, `save*`, `delete*`, `count*`, `list*`, `export*` and
 * `process*` prefixes of judgment (b): none is in this type, so none can be exposed by accident.
 * A discipline the compiler checks is worth more than a discipline a comment asserts.
 *
 * ⭐ PARITY IS STRENGTHENED, NOT WEAKENED, BY DERIVING THE TYPE. Each member's signature is taken
 * FROM the service declaration rather than restated, so the name, the arity, the argument order and
 * the synchronous-versus-promise distinction are the service's own — there is no second copy to drift.
 * Rename or re-shape a member there and this file stops compiling, which is precisely the
 * "checkable method-by-method" property AAP §0.8.3.1 asks for.
 *
 * ⭐ ROUTER.TS IS UNAFFECTED. A full service instance satisfies this type, so the composition root can
 * keep handing over the service it builds; nothing about the wiring changes. What changes is only what
 * this module is ABLE to call.
 *
 * ⭐ AND IT IS WHAT MAKES THE NET-NEW COVERAGE PRACTICAL (S6). The service class holds its two
 * collaborators as private fields, so its type is nominal and a plain object cannot stand in for it. A
 * narrowed structural type can be satisfied by a three-member literal, so a test drives this handler
 * without a repository, a query port, a database, a network call or an AWS runtime — which matters
 * because the legacy repository vendors no mocking library at all (AAP §0.4.3.6). ⛔ No cast is used to
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
 * a full proxy event satisfies every one of these types, so `router.ts` passes the event straight
 * through unchanged; and a test constructs a one-member or two-member literal instead of fabricating
 * an entire AWS event, which is how S6 manifests in a folder for which AAP §0.4.1.12 defines no test
 * directory.
 *
 * The slices also make the request contract legible in the type system rather than only in prose: the
 * projection member reads a body and nothing else, and neither unused-option member reads a body at
 * all. ⛔ No member reads a header, and none is declared, because nothing in the observed contract
 * depends on one and declaring an unread input would be capability beyond what the migration requires.
 * ============================================================================================== */

/**
 * The event slice {@link OptionHandler.getOptionsForSelect} reads: the request body alone.
 */
export type OptionsForSelectEvent = Pick<APIGatewayProxyEvent, 'body'>;

/**
 * The event slice {@link OptionHandler.getUnusedProductOptions} reads: the path parameters, which
 * carry the product identifier, and the query string, which carries the option-group identifier list.
 */
export type UnusedProductOptionsEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters'
>;

/**
 * The event slice {@link OptionHandler.getUnusedProductOptionGroups} reads: the query string alone.
 */
export type UnusedProductOptionGroupsEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters'>;

/**
 * The option surface exposed at the Lambda boundary — three members, one per declared service member.
 *
 * ⭐ THE SET IS CLOSED AT THREE. It corresponds one-to-one with the three public functions
 * `model/service/OptionService.cfc` declares, in the source's own order, so parity is checkable
 * member by member (AAP §0.8.3.1). The four members the legacy fabricated at run time are absent by
 * design — judgment (a) — and the write and enumeration prefixes the same dispatcher would have
 * answered are absent too — judgment (b).
 *
 * ⭐ WHY THE MEMBERS ARE FUNCTION-TYPED READONLY PROPERTIES RATHER THAN METHODS. A route table is the
 * natural consumer of this interface, and a route table holds DETACHED function references. Declaring
 * the members as properties makes each one provably free of any dependence on a receiver — the
 * implementations close over the injected service instead — so a reference can be stored, passed and
 * invoked anywhere without binding, and a consumer never has to reason about, or lint around, a lost
 * receiver. `readonly` states the other half: a bound handler is not reconfigurable after
 * construction.
 *
 * ⭐ THE RETURN TYPES ARE NOT UNIFORM, AND MUST NOT BE MADE SO. The first member is synchronous
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
   * Responses: the projection at an OK status; a bad request when the body is absent, is not valid
   * JSON, is not a JSON object, carries no options array, or carries an entry that is not usable.
   */
  readonly getOptionsForSelect: (event: OptionsForSelectEvent) => APIGatewayProxyResult;

  /**
   * Lists the options a product may still be offered, as select entries.
   *
   * Reads the product identifier from the path and the already-present option-group identifiers from
   * the query string, then calls the service with the identifier FIRST and the list SECOND.
   *
   * Responses: the rows at an OK status; a bad request when either input is absent.
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
   * Responses: the rows at an OK status; a bad request when the input is absent.
   */
  readonly getUnusedProductOptionGroups: (
    event: UnusedProductOptionGroupsEvent,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Binds the option surface to a service instance.
 *
 * ⭐ EXPLICIT INJECTION, AND NOTHING ELSE (S3). The single parameter is the collaborator, supplied by
 * the caller. The composition root — `src/config/container.ts`, a memoized factory that replaces the
 * DI/1 bean scan of [org/Hibachi/Hibachi.cfc:L289-L345] — is called by `router.ts`, which passes the
 * service in. ⛔ This function therefore imports no container, constructs no service, reads no
 * registry and resolves nothing by name. There is no service locator, no dynamic method synthesis, no
 * string-keyed lookup, no decorator and no dependency-injection library, and the retired
 * `getService("optionService")` string lookup — which the legacy used case-inconsistently, as both
 * [model/entity/Product.cfc:L254] and [:L341] show — has no analogue here.
 *
 * ⭐ ONE COLLABORATOR, BY EVIDENCE. The legacy component declares two injected properties and only one
 * is real: `optionDAO` [model/service/OptionService.cfc:L51] is live with two call sites, and
 * `productService` [:L53] has zero. Judgment (f) records why the dead edge is not reinstated. The
 * repository the live property became is the SERVICE's constructor parameter, not this function's:
 * a handler depends on the service and never on a repository, which is what keeps the hexagonal
 * direction one-way (S4).
 *
 * ⭐ THE PARAMETER IS A TYPE, AND THE SERVICE IS IMPORTED TYPE-ONLY. Nothing here calls the
 * constructor, so the import is erased at compile time and the class cannot be reached from this
 * module at run time — which is the mechanical guarantee behind "construct nothing". It also keeps the
 * bundled artifact free of any service code this entry point does not itself execute. The parameter is
 * narrowed to {@link OptionSurface}, so the four members the legacy fabricated at run time are
 * unreachable from here by construction rather than by convention.
 *
 * ⭐ NO STATE, AT EITHER SCOPE (M7). The returned object is created per call and frozen; the three
 * closures capture only the injected service. Nothing is memoized, counted, cached or carried between
 * invocations, so a warm container cannot leak one request's data into another's. The module scope
 * holds only string constants, types and pure functions.
 *
 * ⭐ STRANGLER-FIG INDEPENDENCE (AAP §0.8.3.8). The parameter is a type, so this module builds,
 * type-checks, bundles and can be exercised without any unconverted Slatwall code being present. This
 * folder is where "callable" is realised: "new TypeScript services must be callable and deployable
 * without requiring the rest of Slatwall to be converted."
 *
 * TEST PROVENANCE: NET-NEW. No legacy controller test of any kind exists (AAP §0.6.5.2).
 *
 * @param optionService - The option service to delegate to, narrowed to its three declared members. A
 *        full service instance satisfies it, and so does a three-member literal — which is what makes
 *        the members assertable without a repository, a database, a network call or an AWS runtime.
 * @returns The three request-shaped members, frozen.
 *
 * @example
 * ```ts
 * // In router.ts, which owns every route:
 * const optionHandler = createOptionHandler(container.optionService);
 * const result = await optionHandler.getUnusedProductOptionGroups(event);
 * ```
 */
export function createOptionHandler(optionService: OptionSurface): OptionHandler {
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
   * ⭐ SYNCHRONOUS, DELIBERATELY. The service member is synchronous, so this one is too; see the
   * asymmetry note on {@link OptionHandler}. Its failure path is still covered: a synchronous throw is
   * caught and shaped by the same single mapping every other member uses.
   */
  const getOptionsForSelect = (event: OptionsForSelectEvent): APIGatewayProxyResult => {
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
   * ⚠️ THE ARGUMENT ORDER IS THE CONTRACT, AND BOTH ARGUMENTS ARE STRINGS. `productID` is passed
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
   * ⛔ The list value is forwarded byte for byte: judgment (c). ⛔ An empty list is forwarded too, and
   * only ABSENCE is rejected: judgment (d). ⛔ The composed label on each returned row is never
   * touched: judgment (e).
   */
  const getUnusedProductOptions = async (
    event: UnusedProductOptionsEvent,
  ): Promise<APIGatewayProxyResult> => {
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
   * One required argument, read from the query string and forwarded unchanged. ⛔ Judgments (c), (d)
   * and (e) apply here identically.
   *
   * ⭐ ITS SET POLARITY IS THE INVERSE OF THE SIBLING MEMBER'S, WHICH IS WHY AN EMPTY LIST MATTERS SO
   * MUCH HERE. Both members receive the same list and filter on it with opposite predicates
   * [model/dao/OptionDAO.cfc:L68] against [:L107], so an empty list resolves to NO rows for the sibling
   * and to EVERY option group for this member. A guard that rejected or defaulted an empty value would
   * therefore not merely narrow an input, it would suppress the single most useful call this member
   * has: listing every assignable group for a product that has none yet. The asymmetry is carried, not
   * reconciled; the reasoning belongs to the repository port and is not duplicated here.
   */
  const getUnusedProductOptionGroups = async (
    event: UnusedProductOptionGroupsEvent,
  ): Promise<APIGatewayProxyResult> => {
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
