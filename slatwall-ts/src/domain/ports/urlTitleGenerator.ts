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
//   src/handlers/bootstrap.ts  composition root (wiring)
// ---------------------------------------------------------------------------

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
//   The correction is recorded HERE, at the point of use, and nowhere else: the
//   subtree `README.md` is itself a planned file that does not exist at this
//   checkpoint, so no reader is directed to it for the caution.
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
//   `src/handlers/bootstrap.ts` (planned), and nowhere else. Six of the thirteen ports in
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
 * The tables a URL title is made unique within.
 *
 * Uniqueness is scoped per table, so the same title may exist once for a brand and once for a
 * product. The three values are the ones the ported save paths pass:
 * [model/service/BrandService.cfc:L70], [model/service/ProductService.cfc:L269] and
 * [model/service/ProductService.cfc:L297].
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
 * The implementation is supplied and wired by `src/handlers/bootstrap.ts` (planned); see
 * WHO IMPLEMENTS THIS PORT in the file header.
 */
export interface UrlTitleGenerator {
  // LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the product save path tests only for null, so a product already holding an empty urlTitle keeps it, unlike the brand and product-type paths which also test length.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Derive a URL title from a display string and make it unique within one table.
   *
   * CFML parity [model/service/DataService.cfc:L57-L68]: the title is lowercased and trimmed, every
   * character other than a letter, digit, space or hyphen is removed, runs of spaces collapse to a
   * single hyphen, and a colliding title is suffixed with an incrementing number starting at `-2`
   * until the value is unique for the table.
   *
   * @param titleString the display string to derive the title from.
   * @param tableName the table the result must be unique within.
   * @returns the unique URL title.
   */
  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string>;
}
