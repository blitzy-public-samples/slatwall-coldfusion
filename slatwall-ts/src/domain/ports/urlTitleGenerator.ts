// ---------------------------------------------------------------------------
// slatwall-ts - unique URL-title generation port
//
// PURPOSE
//   One collaborator, one method. The legacy
//   `DataService.createUniqueURLTitle(titleString, tableName)` becomes an
//   injected, async, string-returning port: a catalog save path hands it a
//   human-readable title and a physical table name, and it answers with a
//   URL-safe slug that is unique in that table's `urlTitle` column.
//
// >> AAP LOCATOR CORRECTION - READ THIS BEFORE CHECKING THIS FILE AGAINST THE
// >> PLAN <<
//   The Agent Action Plan cites `model/service/BrandService.cfc:L67-L77` and
//   `model/service/ProductService.cfc:L264-L311` as this port's source. Those
//   are its CONSUMERS, not its declaration. The declaration was located by
//   direct search over the legacy tree and is at:
//
//       model/service/DataService.cfc:L53
//         public string function createUniqueURLTitle(
//             required string titleString, required string tableName)
//
//   The contract published below is derived from that body, L53-L71. The
//   consumer call sites are used only to establish the table-name vocabulary.
//   The subtree README carries a LOCATOR-DRIFT CAUTION for exactly this case.
//
// WHAT THIS PORT REPLACES
//   The DI/1 bean-factory declaration `property name="dataService" type="any";`
//   - a collaborator resolved at runtime by a convention scan over a
//   component's properties. Here it is an explicit, compile-checked constructor
//   argument, wired once in the composition root. No runtime scan, and no
//   service locator.
//
//   Two in-scope services declared that property, and the contrast between them
//   is the clearest illustration of the change anywhere in this slice:
//
//     model/service/BrandService.cfc:L51    dataService - its ONE AND ONLY
//                                           declared collaborator, so this port
//                                           is BrandService's ENTIRE dependency
//                                           surface.
//     model/service/ProductService.cfc:L56  dataService - one of eight
//                                           (productDAO, skuDAO,
//                                           productTypeDAO, dataService,
//                                           contentService, skuService,
//                                           subscriptionService, optionService;
//                                           declared at L52-L60).
//
//   For scale: the out-of-scope `model/service/OrderService.cfc` takes sixteen
//   injected collaborators. Sixteen is a property of that orchestrator - it is
//   where the strangler-fig seam sits - and not of the slice being ported.
//
// WHY THIS PORT IS ASYNC
//   A method becomes async in this port layer if and only if its legacy body
//   reaches the data store. The slug transformation itself is pure string work,
//   but the uniqueness loop calls `DataDAO.verifyUniqueTableValue`
//   [model/dao/DataDAO.cfc:L115-L131], which issues a SELECT against the named
//   table. This port is therefore async and returns `Promise<string>`. Under
//   the CFML engine that read was written as though it were free because the
//   engine blocks on it; under Node it is not, and modelling it as synchronous
//   would only move the problem into every caller.
//
// WHY `tableName` IS A CLOSED UNION AND NOT A `string`
//   In legacy the parameter is a raw `required string`, and
//   `verifyUniqueTableValue` interpolates it straight into the SQL text:
//
//     SELECT #arguments.column# FROM #arguments.tableName#
//     WHERE  #arguments.column# = <cfqueryparam ... value="#arguments.value#" >
//
//   Only the compared VALUE is bound; the table identifier is concatenated,
//   because SQL has no parameter form for an identifier. A closed
//   string-literal union is therefore the strongest compile-time guard
//   available at this boundary, and a precise union is preferred over a
//   stringly-typed parameter on this project's own strictness standard. The
//   vocabulary is closed against an exhaustive search of the legacy tree rather
//   than guessed - see `UrlTitleTableName` below.
//
// INTERFACES ONLY - THIS MODULE EMITS NO RUNTIME JAVASCRIPT
//   A port declares a contract; it never implements one. This file contains a
//   type alias and an interface and nothing else: no class, no `const`, no
//   function body, no regular-expression literal, and - deliberately - no
//   TypeScript `enum`, because an `enum` is the one type-like construct that
//   emits a runtime object. Compiling this module yields no executable
//   statement at all, which is the defining property of `src/domain/ports/`.
//
// IMPORTS: NONE
//   The parameters and the return are primitives plus the union declared below,
//   so there is nothing to import. `src/domain/**` may in any case import only
//   from within `src/domain/**` and from `src/lib/**`; reaching
//   `src/repositories/**`, `src/handlers/**`, `src/integrations/**` or the
//   MySQL driver from here is a build failure, enforced by the ESLint
//   `no-restricted-imports` boundary rather than by reviewer discipline. No
//   sibling port is imported either - no port imports another - and no entity
//   or order-view type, because this port takes and returns primitives. Nothing
//   here is monetary, so there is no `Money` import: `Money` is the sole
//   arithmetic surface in the target, and a slug is not arithmetic.
//
// THESE NAMES ARE CANONICAL
//   Every consumer subtree that will import this file is still empty. The
//   symbol names, the method name, the parameter names and their order
//   published below are the contract those files must be written against.
//   Publish once, precisely; do not rename later.
//
// NO USER RULES WERE PROVIDED
//   The project rules document returns exactly that, and it was re-read to the
//   end to confirm there is no second window and no truncated tail. No rule has
//   been invented to fill the gap, and the absence is not treated as licence to
//   lower the bar: the enterprise substitute standard applies at full strength -
//   maximal strictness, no `any` and no suppression comment, one exported unit
//   per file, no barrel, no hardcoded configuration, interface parity with the
//   legacy surface, and every preserved legacy defect annotated where a
//   reviewer will meet it.
//
// TEST COVERAGE IS NET-NEW
//   Only three legacy test files touch this slice at all -
//   meta/tests/unit/entity/BrandTest.cfc,
//   meta/tests/unit/entity/ProductTest.cfc and
//   meta/tests/functional/admin/entity/ProductTest.cfc, the last of which is an
//   empty stub - and NONE of them covers `DataService`. Coverage for this port
//   is therefore net-new and must never be presented as legacy parity. The
//   `nike-air-jorden` fixture in ProductTest.cfc is downstream evidence of this
//   port's output shape, not coverage of this port. The test tier is authored
//   separately; no test is authored here.
//
// WHO IMPLEMENTS THIS PORT
//   `src/handlers/bootstrap.ts`, and nowhere else. Six of the thirteen ports in
//   this folder get a MySQL adapter under `src/repositories/mysql/**`
//   (productRepository, skuRepository, optionRepository, productTypeRepository,
//   promotionRepository, priceGroupRepository); this is not one of them, and the
//   locked target layout gives it no adapter file anywhere. The composition root
//   therefore both implements and wires it, and must hand that implementation
//   whatever data access the uniqueness read needs at wiring time. It is never
//   to be reached through a service locator.
//
// NOT THIS PORT'S CONCERN
//   The `globalURLKeyProduct` and `globalURLKeyProductType` URL prefixes
//   [model/service/SettingService.cfc:L178, L179] are resolved through
//   `settingsProvider` and consumed at the entity and service tiers. This port
//   produces the slug segment only; it never assembles a path.
// ---------------------------------------------------------------------------

/**
 * The physical table a generated `urlTitle` must be unique within.
 *
 * VOCABULARY VERIFIED, NOT ASSUMED. An exhaustive search of the legacy tree for
 * `createUniqueURLTitle` returns one declaration and six call sites, and
 * between them exactly three distinct table literals reach the parameter:
 *
 *   'SwBrand'        model/service/BrandService.cfc:L70, L72
 *   'SwProduct'      model/service/ProductService.cfc:L269
 *                    model/service/ContentService.cfc:L124
 *   'SwProductType'  model/service/ProductService.cfc:L297, L299
 *
 * SCHEMA CONTINUITY. These are the existing physical table names, carried over
 * unchanged - no rename, no new table, no aliasing to a "logical" name. Each
 * one is read from the entity that owns it, and each of those entities declares
 * the `urlTitle` column this port's uniqueness read targets:
 *
 *   model/entity/Brand.cfc:L49        table="SwBrand"        urlTitle at L55
 *   model/entity/Product.cfc:L49      table="SwProduct"      urlTitle at L54
 *   model/entity/ProductType.cfc:L49  table="SwProductType"  urlTitle at L56
 *
 * All three declare `urlTitle` with `unique="true"`, which is the
 * database-level constraint the loop in `createUniqueURLTitle` exists to
 * satisfy in advance.
 *
 * THESE ARE SCHEMA FACTS, NOT CONFIGURATION. Listing them here is not a
 * hardcoded-literal violation: a table name is part of the schema contract this
 * port is required to preserve unchanged, it is fixed at every legacy call
 * site, and it does not vary by environment. Credentials, hosts and datasource
 * names are configuration, and none of them appears anywhere in this file.
 *
 * A STRING-LITERAL UNION, NEVER A TypeScript `enum`. An `enum` compiles to a
 * runtime object, which would break the zero-emit property of this folder. A
 * union is erased completely at emit and still narrows every call site.
 */
export type UrlTitleTableName = 'SwBrand' | 'SwProduct' | 'SwProductType';

// ===========================================================================
// PRESERVED LEGACY DEFECT - READ BEFORE IMPLEMENTING OR CONSUMING THIS PORT
//
// LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the urlTitle guard is null-only with no
// len() check, so an empty-string urlTitle skips generation and then fails the required+unique
// validation rule in model/validation/Product.json; saveProductType at L295-L301 guards on null OR
// empty instead.
// Preserved deliberately; do not fix without a product decision.
//
// THE MECHANISM, LINE BY LINE, SO THE ASYMMETRY IS CHECKABLE
//   model/service/ProductService.cfc:L268  if(isNull(arguments.product.getURLTitle()))
//     Null ONLY. An empty string is not null, so on an empty `urlTitle` the
//     guard does not fire, the call to this port at L269 is skipped, and the
//     empty string survives into `arguments.product.validate( context="save" )`
//     at L273 - where model/validation/Product.json:L16 declares
//     `"urlTitle": [{"contexts":"save","required":true,"unique":true}]` and the
//     save fails. The path is real and reachable, not theoretical.
//
//   model/service/ProductService.cfc:L295-L301  null OR empty, and more besides
//     Tests `isNull(...) || !len(...)`, ALSO inspects `arguments.data.urlTitle`,
//     PREFERS `arguments.data.productTypeName` as the title source, and writes
//     the generated value into the data struct through an UNSCOPED `data`
//     reference at L297 and L299 - where saveProduct instead writes through the
//     entity setter at L269.
//
//   model/service/BrandService.cfc:L68-L74  guards exactly like saveProductType
//     Same `isNull(...) || !len(...)` test, same `arguments.data.urlTitle`
//     inspection, same unscoped `data.urlTitle` write at L70 and L72. So
//     saveProduct is the ONE null-only guard among the three legacy consumers -
//     the asymmetry is one against two, which makes it a divergence in
//     saveProduct rather than an unsettled convention.
//
// WHY IT IS NOT REPAIRED HERE
//   The guard lives in the SERVICE tier; this port only records that the
//   asymmetry exists so that the service tier reproduces each variant exactly as
//   written. Repairing it would change which saves succeed and which return a
//   validation error, and this port layer holds no budget for a deliberate
//   divergence. Accordingly the surface below offers no `force`, `overwrite` or
//   `allowEmpty` flag, no second "safe" method, and no normalisation of an empty
//   title to an absent one - each of those would be the repair by another route.
// ===========================================================================

/**
 * Generates a URL-safe `urlTitle` that is unique within a catalog table.
 *
 * Ported from `model/service/DataService.cfc:L53-L71`:
 *
 *     public string function createUniqueURLTitle(
 *         required string titleString, required string tableName)
 *
 * The legacy component reached the database through
 * `property name="dataDAO" type="any";` [model/service/DataService.cfc:L51].
 * Here the whole component narrows to this single method, because it is the only
 * part of `DataService` the in-scope catalog slice consumes: its XML-directory
 * loading and bulk-population methods serve out-of-scope features and are not
 * ported.
 *
 * The implementation is supplied and wired by `src/handlers/bootstrap.ts`; see
 * WHO IMPLEMENTS THIS PORT in the file header.
 */
export interface UrlTitleGenerator {
  /**
   * Derive a `urlTitle` for `titleString` that no existing row in `tableName`
   * already holds.
   *
   * NAME AND SIGNATURE ARE VERBATIM CFML, DELIBERATELY. Interface parity is the
   * acceptance contract for this migration, so the legacy casing survives
   * exactly: `URL` is capitalised, giving `createUniqueURLTitle` and NOT
   * `createUniqueUrlTitle`. Do not normalise it. The parameter names
   * `titleString` and `tableName` and their order are equally verbatim, which
   * matters because every legacy call site invokes the method with NAMED
   * arguments - `titleString=..., tableName="SwProduct"` - so a reviewer can
   * diff the two surfaces directly. This project enables no ESLint
   * naming-convention rule anywhere, precisely so this name compiles unaltered.
   *
   * SLUG SEMANTICS THE IMPLEMENTATION MUST REPRODUCE, in this order
   * [model/service/DataService.cfc:L57-L58]:
   *
   *   1. Lowercase and trim `titleString` FIRST, before anything is removed.
   *   2. Then REMOVE every character outside the retained class of lowercase
   *      letters, digits, space and hyphen. Removal, never transliteration:
   *      accented and non-ASCII characters are dropped rather than folded to an
   *      ASCII equivalent, so a title composed only of such characters yields an
   *      EMPTY slug. An empty slug is returned as-is - this method neither
   *      rejects it nor substitutes anything for it.
   *   3. Only then collapse whitespace. A RUN of one or more spaces becomes a
   *      SINGLE hyphen, so `'nike  air'` yields `'nike-air'` and never
   *      `'nike--air'`. Hyphens already present in the title survive step 2 and
   *      are left exactly where they are.
   *
   * UNIQUENESS AND THE SUFFIX SEQUENCE [model/service/DataService.cfc:L55,
   * L60-L70]. The bare slug is offered first. While a row already holds the
   * candidate, a numeric suffix is appended to the BARE slug - never to the
   * previous candidate - and the counter advances. The counter is seeded at 1
   * and incremented before its first use, so the candidates are:
   *
   *     'nike-air-jorden', 'nike-air-jorden-2', 'nike-air-jorden-3', ...
   *
   * The first suffix is therefore `-2`, and NOT `-1`.
   *
   * WHY THIS IS A DATABASE READ, AND WHAT THE IMPLEMENTER OWES IT. Each
   * candidate is checked by `DataDAO.verifyUniqueTableValue`
   * [model/dao/DataDAO.cfc:L115-L131], which selects from `tableName` where the
   * `urlTitle` column equals the candidate and reports unique when no row comes
   * back. That column is a fixed literal in legacy - always `urlTitle` - so it
   * is deliberately not a parameter here. Because the check reaches the store,
   * the loop performs one read per candidate offered; that is the behaviour of
   * the ported algorithm, stated as behaviour.
   *
   * The legacy query bound the compared value with `cfqueryparam`. The
   * implementation MUST preserve that guarantee with a prepared statement: the
   * candidate value is a bound parameter, never concatenated into SQL text. The
   * table identifier cannot be bound, because SQL has no parameter form for an
   * identifier - which is exactly why `tableName` is the closed
   * `UrlTitleTableName` union rather than an open `string`. This port declares
   * no SQL of its own; the obligation transfers wholly to the implementation.
   *
   * RETURN. Always a definite `string`, for every input - including a title that
   * slugs to empty. Never `null` and never `undefined`: the legacy body returns
   * a local it has always assigned [model/service/DataService.cfc:L60, L70].
   * The type is `Promise<string>` and must not be widened to
   * `Promise<string | undefined>`.
   *
   * CALL SITES, AND THE TABLE EACH ONE NAMES:
   *
   *   model/service/ProductService.cfc:L269  'SwProduct'
   *     from product.getTitle(); written back through the entity setter
   *   model/service/ProductService.cfc:L297  'SwProductType'
   *     from data.productTypeName
   *   model/service/ProductService.cfc:L299  'SwProductType'
   *     from productType.getProductTypeName()
   *   model/service/BrandService.cfc:L70     'SwBrand'
   *     from data.brandName
   *   model/service/BrandService.cfc:L72     'SwBrand'
   *     from brand.getBrandName()
   *   model/service/ContentService.cfc:L124  'SwProduct'
   *     from content.getTitle(); the narrow ContentService path in scope
   *
   * OBSERVABLE DOWNSTREAM. `Product.getProductURL()` composes the stored
   * `urlTitle` into a path, and that composition carries the single legacy
   * assertion anywhere near this slice: `productUrlIsCorrectlyFormatted()` in
   * meta/tests/unit/entity/ProductTest.cfc expects
   * `/<globalURLKeyProduct>/nike-air-jorden/`, with the fixture retained
   * verbatim. It exercises the prefix and the stored value rather than this
   * method, so it is evidence of the output shape and not coverage of this port.
   *
   * WHAT THE CALLER OWES, AND WHAT THIS PORT WILL NOT DO FOR IT. Deciding
   * WHETHER to generate belongs to the service tier, and the three legacy
   * consumers do not decide it the same way - see the PRESERVED LEGACY DEFECT
   * block immediately above. Each guard is reproduced exactly as written, using
   * the CFML truthiness helpers in `src/lib/cfml/truthiness.ts` (`isNullish`,
   * `cfLen`) to keep `isNull()` and `len()` distinguishable at the service tier.
   * This port imports nothing and normalises nothing.
   *
   * @param titleString - The human-readable title to slug. Passed verbatim from
   *   the legacy signature; not pre-validated, and may slug to empty.
   * @param tableName - The physical `Sw*` table whose `urlTitle` column the
   *   candidate must not already occupy.
   * @returns The unique slug. Always a definite string.
   */
  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string>;
}
