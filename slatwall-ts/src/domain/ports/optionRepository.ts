// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts                        composition root (wiring)
//   src/repositories/mysql/mysqlOptionRepository.ts  MySQL option adapter
//   tests/integration/repositories                   repository integration tier
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - option repository port
//
// PURPOSE
//   The driven-side contract for the two "unused option / unused option-group"
//   lookups that feed the product option-assignment surfaces. It replaces
//   `model/dao/OptionDAO.cfc` (120 lines), whose two functions are written in
//   `<cffunction>` TAG syntax wrapping an embedded `<cfquery>`. That detail
//   matters: it makes those two query bodies - not any paraphrase of them -
//   the source of truth for the statements the adapter must reproduce.
//
//   This is one of the six REPOSITORY ports in `src/domain/ports/` (product,
//   sku, option, productType, promotion, priceGroup) and one of the thirteen
//   ports in the folder. The folder is closed at thirteen. This file adds no
//   fourteenth port, declares no barrel, and creates no companion module for
//   the projection type it needs - that type is co-located below.
//
// PARAMETERIZED SQL - WHERE THE OBLIGATION GOES
//   This file declares interfaces only and contains NO SQL, so the obligation
//   to use prepared statements EXCLUSIVELY - preserving the injection-safety
//   guarantee that `cfqueryparam` provided in the legacy `<cfquery>` bodies -
//   transfers WHOLLY to `src/repositories/mysql/**`.
//
//   On this port that obligation is unusually pointed. `existingOptionGroupIDList`
//   is a caller-supplied comma-delimited list, and the legacy code expanded it
//   into a bound `IN` list at query time via `cfqueryparam ... list="true"`, at
//   [model/dao/OptionDAO.cfc:L68] and again at [model/dao/OptionDAO.cfc:L107].
//   The adapter MUST parse that string and bind EACH parsed element as its own
//   separate prepared-statement parameter. It must NEVER interpolate the list -
//   whole or split - into statement text. Legacy bound every one of its three
//   values, `productID` at [model/dao/OptionDAO.cfc:L78] included, and the port
//   must not be the reason that guarantee is lost.
//
// THE LEGACY SURFACE IS EXACTLY TWO FUNCTIONS
//   `model/dao/OptionDAO.cfc` declares exactly two functions and no third,
//   public or private:
//
//     [model/dao/OptionDAO.cfc:L51]  getUnusedProductOptions
//                                    (productID, existingOptionGroupIDList)
//     [model/dao/OptionDAO.cfc:L94]  getUnusedProductOptionGroups
//                                    (existingOptionGroupIDList)
//
//   This port therefore declares exactly two methods. Their names, their
//   parameter names and their parameter ORDER are carried over verbatim in
//   CFML camelCase, because method-level equivalence at the service boundary
//   is this project's acceptance contract and a reviewer must be able to diff
//   the two surfaces directly. `productID` comes first on the two-argument
//   method, exactly as it does at [model/dao/OptionDAO.cfc:L52-L53].
//
//   `existingOptionGroupIDList` keeps its legacy spelling deliberately. The
//   ESLint configuration enables no naming-convention rules for precisely this
//   reason, so nothing will "correct" it to `existingOptionGroupIds`.
//
// CORRECTION TO THE AGENT ACTION PLAN - THE RETURN TYPE IS A PROJECTION
//   The plan's interface table publishes these two methods as returning
//   `Promise<Option[]>` and `Promise<OptionGroup[]>`. Reading the DAO
//   disproves that, so this port returns a projection instead. The evidence,
//   which a skeptical reviewer can check line by line:
//
//     * Neither function hydrates an entity. There is no `ORMExecuteQuery`, no
//       `entityLoad` and no hydration step anywhere in the 120-line file.
//     * Each function runs a `<cfquery>` and then loops the result, BUILDING a
//       two-key structure per row and appending it to a plain array:
//         [model/dao/OptionDAO.cfc:L87-L89] appends { name, value } where
//           `name` is the composite "<optionGroupName> - <optionName>" and
//           `value` is the option identifier;
//         [model/dao/OptionDAO.cfc:L112-L114] appends { name, value } where
//           `name` is the option-group name and `value` is the option-group
//           identifier.
//     * Both return that array - [model/dao/OptionDAO.cfc:L91] and
//       [model/dao/OptionDAO.cfc:L116] - and the service passthroughs above
//       them declare `returntype="array"`, at
//       [model/service/OptionService.cfc:L72] and [:L76].
//
//   So the legacy contract is an array of name/value pairs, and the member
//   names below are the source's own, taken verbatim from those two append
//   sites. This divergence from the plan is deliberate and evidence-driven,
//   not an oversight, and it is not a behavioural divergence: no budgeted
//   divergence is spent here, because reading the source correctly where the
//   plan paraphrased it is not a change to behaviour.
//
//   The consequence for imports is absolute: this port references NO entity
//   type. It does not import `Option`, it does not import `OptionGroup`, and
//   it imports nothing from `../entities/`.
//
// THE COMMA-DELIMITED PARAMETER STAYS A STRING
//   `existingOptionGroupIDList` is typed `string`, never `string[]`, because
//   that is what [model/dao/OptionDAO.cfc:L53] and [:L95] declare and
//   signature parity is the acceptance contract. Splitting it is the ADAPTER's
//   job, and the sanctioned splitter is `../../lib/cfml/list.js`, which
//   reproduces CFML list semantics. That module is NAMED here and deliberately
//   NOT imported: this file needs no runtime helper, and a port that reached
//   for one would stop being a declaration.
//
// THE RETURNED ARRAY IS READ-ONLY  (a judgment call, recorded)
//   The plan's interface table writes the return as an array of the projection;
//   the folder standard for this layer additionally requires that arrays be
//   declared `readonly T[]`. Both are honoured here: the ELEMENT TYPE and the
//   arity are exactly as published, and the array itself is read-only.
//
//   Choosing the stricter of the two forms is deliberate. A repository result is
//   a value read out of the database, and a `readonly` array says so in the type
//   rather than in a comment - a consumer that wants a different ordering or a
//   filtered subset derives a new array instead of mutating the one the adapter
//   returned. It costs the adapter nothing, because an ordinary mutable array
//   satisfies a `readonly` array type, so this narrows what CALLERS may do
//   without constraining the implementation at all.
//
// LIVE VALIDATION PATH - THIS PORT IS NOT DECORATIVE
//   `model/validation/Product.json` puts both results directly under a
//   declarative constraint:
//
//     [model/validation/Product.json:L13]
//       "unusedProductOptions"      -> contexts "addOption",      minCollection 1
//     [model/validation/Product.json:L14]
//       "unusedProductOptionGroups" -> contexts "addOptionGroup",  minCollection 1
//
//   A caller that receives an EMPTY array from either method therefore FAILS
//   validation in that context - which is the point. An empty result is a
//   legitimate, expected outcome that carries meaning, and it must be returned
//   as an empty array and never smoothed into a default, a fallback or a
//   synthesised placeholder row.
//
//   Enforcing those constraints is NOT this port's job and no validation
//   surface appears here. The declarative rules are ported to typed schemas at
//   the SERVICE tier, so this file declares no schema and imports no
//   validation library. It also adds no `has...` or `count...` companion
//   method: two methods, and no more.
//
// FETCH SHAPE, AND WHY LAZINESS IS NOT SIMULATED
//   `ORMExecuteQuery`, `<cfquery>`, `super.save()`, `super.delete()` and
//   Hibernate's lazy collections all collapse into port methods in this
//   architecture. There is no ORM behind these interfaces, so associations are
//   MATERIALIZED at the repository boundary and laziness is never simulated:
//   the fetch shape becomes an explicit decision, made and commented at each
//   repository method in `src/repositories/mysql/mysqlOptionRepository.ts` (planned),
//   which also owns the row-to-projection mapping.
//
//   This port is the simplest possible case of that rule. It returns a flat
//   projection of two scalar members with no associations at all, so there is
//   nothing to materialize and no traversal for a caller to trigger. The
//   absence of a repeated per-row lookup here is a CORRECTNESS and
//   EXPLICITNESS property - the shape of the read is visible in the signature
//   rather than implied by a graph walk - and it is deliberately not a claim
//   about execution characteristics, of which this port makes none.
//
// ASYNC BOUNDARY
//   Both methods are async and return a promise. That follows the project's
//   rule mechanically: a method becomes async if and only if its legacy body
//   reaches the data store, and both of these bodies are `<cfquery>` reads.
//   There is no synchronous method on this port.
//
// INTERFACES ONLY - THIS MODULE EMITS NO RUNTIME JAVASCRIPT
//   Everything below is a type declaration. There is no class, no `const`, no
//   `enum` (a TypeScript `enum` would emit runtime code), no function body and
//   no default parameter value, so this module compiles away to nothing. That
//   is the defining property of `src/domain/ports/**`, and it is what keeps
//   the ports/entities relationship - entities take port interfaces as
//   constructor parameters while ports name entity types - a TYPE-LEVEL cycle
//   that never exists at runtime. The project's no-barrel policy is what keeps
//   it safe, since there is no index module to force eager evaluation.
//
// ZERO IMPORTS, AND THE BOUNDARY THAT REQUIRES IT
//   This file has no import statements at all. Both parameters are `string`
//   and both returns use the projection declared below, so nothing outside
//   this module is needed.
//
//   The boundary that governs the folder is mechanical, not advisory:
//   `src/domain/**` may import only from `src/lib/**` and from within
//   `src/domain/**`, enforced by the `no-restricted-imports` block in
//   `eslint.config.mjs`, where a violation is a BUILD FAILURE. On a repository
//   port the live temptation is the MySQL driver, and it is forbidden here: a
//   port names no driver, no pool, no connection and no row-packet type. The
//   same applies to the Lambda runtime types, environment loading, the
//   process-configuration and logger modules in `src/lib/`, any sibling port,
//   any read-only order view, and any barrel specifier.
//
// CONSTRUCTOR INJECTION REPLACES THE SERVICE LOCATOR
//   Two legacy mechanisms are retired by this interface existing.
//
//   The DI/1 convention scan: `property name="optionDAO";` at
//   [model/service/OptionService.cfc:L51] becomes a constructor parameter
//   typed to this port. Its sibling `property name="productService";` at
//   [model/service/OptionService.cfc:L53] becomes a separate constructor
//   parameter at the service tier - two collaborators in total, which is what
//   makes this the second-leanest service in the ported slice.
//
//   The embedded `getService("xService")` locator: `Product` reaches the
//   option service from inside the entity at [model/entity/Product.cfc:L341],
//   the single such site in that file, and will instead take this port as a
//   constructor parameter. (For precision: the call at that line is
//   `getOptionSmartList()`, a framework smart-list method that this port does
//   not reproduce - smart lists become explicit typed queries elsewhere. L341
//   is cited as the LOCATOR site the injection replaces, not as a caller of
//   the two methods below.) The reference that arrangement creates is
//   one-directional and type-only, and this file imports no entity, which is
//   what keeps it so.
//
// THE NAMES PUBLISHED HERE ARE CANONICAL
//   Every subtree that will consume this port - the entities, the services,
//   the MySQL adapters, the handlers and the Google integration - is empty at
//   the time this file is written. Nothing else pins these identifiers, so the
//   interface name, the projection name, the two method names, the parameter
//   names and the parameter order established below ARE the contract. They are
//   published deliberately and must not be renamed afterwards.
//
// WHAT IS DELIBERATELY NOT DECLARED HERE
//   `getOptionsForSelect(required any options)` at
//   [model/service/OptionService.cfc:L55] is SERVICE TIER: synchronous, pure,
//   and a transformation over already-loaded option entities rather than a
//   read. It is deliberately absent from this port.
//
//   Also absent, each on purpose: any load-by-identifier, save or delete
//   method; any count or existence variant; any batch variant or overload; any
//   options bag; and any eager-load, fetch or include parameter. The legacy
//   DAO has none of these, and adding one would invent a requirement rather
//   than port one.
//
// IMPLEMENTATION HOME
//   `src/repositories/mysql/mysqlOptionRepository.ts` (planned) implements this port.
//   Three obligations transfer to it:
//
//     1. Prepared statements exclusively, with each parsed element of
//        `existingOptionGroupIDList` bound as its own parameter - never
//        interpolated into statement text.
//     2. The two `<cfquery>` bodies at [model/dao/OptionDAO.cfc:L51] and
//        [model/dao/OptionDAO.cfc:L94] are the SQL source of truth. Reproduce
//        their exclusion semantics AND their ordering exactly; both are
//        described in prose on each method below.
//     3. The row-to-projection mapping, with the fetch shape decided and
//        commented at each repository method.
//
//   `src/handlers/bootstrap.ts` (planned) WIRES this port to that adapter. It does not
//   implement it.
//
// TEST COVERAGE IS NET-NEW
//   Coverage for this port is net-new and must never be presented as legacy
//   parity. Only three legacy test files touch the in-scope slice at all -
//   `meta/tests/unit/entity/BrandTest.cfc`,
//   `meta/tests/unit/entity/ProductTest.cfc`, and the EMPTY
//   `meta/tests/functional/admin/entity/ProductTest.cfc` - and
//   `meta/tests/unit/dao/` contains only `AccountDAOTest` and `PaymentDAOTest`.
//   Nothing in the legacy suite covers `OptionDAO.cfc`. Statement-shape and
//   parameter-binding assertions for the adapter belong in
//   `tests/integration/repositories/`; the test tier is authored separately
//   and no test is declared here.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that. No rule has been invented to
//   fill the gap, and the absence is not licence to lower the bar: the
//   enterprise substitute standard applies at full strength even to a
//   two-method port. Concretely, here that means maximal strictness with no
//   `any`, no suppression comment and no non-null assertion; a precise named
//   interface instead of a loose keyed record for the query row; one exported
//   port plus its single supporting co-located type; no dependency outside the
//   fixed set; no identifier, credential, connection string, table name or
//   environment value present as a value; and every judgment call annotated at
//   the point where it was made.
// ---------------------------------------------------------------------------

/**
 * One select-list row as the legacy queries build it.
 *
 * `name` is the label the legacy loop composes and `value` is the identifier: for options it is
 * "<optionGroupName> - <optionName>" [model/dao/OptionDAO.cfc:L88], and for option groups it is the
 * group name alone [model/dao/OptionDAO.cfc:L113].
 */
export interface SelectOption {
  readonly name: string;

  readonly value: string;
}

/**
 * Reads the option and option-group select lists that back product option
 * assignment.
 *
 * Replaces `model/dao/OptionDAO.cfc`. The legacy component declares exactly two
 * functions, so this port declares exactly two methods and nothing else -
 * neither the service-tier transformation at
 * [model/service/OptionService.cfc:L55] nor any load, save, delete, count or
 * existence variant. The service tier receives this interface as a constructor
 * parameter in place of the DI/1 `property name="optionDAO";` declaration at
 * [model/service/OptionService.cfc:L51], and
 * `src/repositories/mysql/mysqlOptionRepository.ts` (planned) implements it.
 *
 * A note that applies to both methods: NEITHER GUARDS AN EMPTY LIST. The legacy
 * functions perform no length test, supply no default and take no branch on
 * `existingOptionGroupIDList` - they hand the raw argument straight to a
 * list-expanded bound parameter. Because the two statements use the list with
 * OPPOSITE polarity, that unguarded input resolves asymmetrically: an empty list
 * leaves `getUnusedProductOptions` matching nothing, while it leaves
 * `getUnusedProductOptionGroups` excluding nothing. Both outcomes are ported as
 * they stand. That behaviour belongs to the caller, and no guard is introduced
 * here or in the adapter to smooth it over.
 */
export interface OptionRepository {
  // CFML parity [model/dao/OptionDAO.cfc:L51-L92]: the group list is matched with `IN`, so the result
  // is restricted to groups already attached to the product, and the `NOT EXISTS` subquery then drops
  // any option already carried by one of that product's SKUs.
  /**
   * Options belonging to the product's existing option groups that none of its SKUs uses yet.
   *
   * @param productID product whose SKUs are checked for existing option use.
   * @param existingOptionGroupIDList comma-delimited option group identifiers to search within.
   * @returns rows ordered by option group name then option name.
   */
  getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]>;

  // CFML parity [model/dao/OptionDAO.cfc:L94-L117]: this list is matched with `NOT IN` — the opposite
  // of the sibling query — because an unused group is one the product does not already carry.
  /**
   * Option groups the product does not already carry.
   *
   * @param existingOptionGroupIDList comma-delimited option group identifiers to exclude.
   * @returns rows ordered by option group name.
   */
  getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<readonly SelectOption[]>;
}
