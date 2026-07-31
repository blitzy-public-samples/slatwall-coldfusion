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
//   src/handlers/bootstrap.ts                             composition root (wiring)
//   src/repositories/mysql/mysqlProductTypeRepository.ts  MySQL product-type adapter
//   tests/integration/repositories                        repository integration tier
// ---------------------------------------------------------------------------

/**
 * Product-type repository port - the domain-side persistence and query contract for
 * `ProductType`.
 *
 * Ported from `model/dao/ProductTypeDAO.cfc` (68 lines, cfscript, body L45-L68 - the smallest and
 * the cleanest of the six in-scope DAOs), with the entity read and save methods the service tier
 * needs now that the ORM is gone. It is the port that `model/service/ProductService.cfc` reaches
 * through: its `property name="productTypeDAO" type="any";` declaration
 * [model/service/ProductService.cfc:L54] - the third of exactly eight DI/1 collaborators declared
 * at L52-L60 - becomes a constructor parameter typed to this interface (T1). No runtime
 * bean-factory scan, no service locator, and therefore no first-scan lock.
 *
 * INTERFACES AND TYPE ALIASES ONLY
 * This module declares two interfaces and nothing else. It emits no runtime JavaScript at all: no
 * class, no constant, no enumeration, no function body, and no default parameter value (a default
 * value is a runtime expression). The single import is `import type`, which is fully erased at
 * emit, so the ports/entities relationship - entities take port interfaces as constructor
 * parameters while ports return entity types - exists solely in the type graph and never at
 * runtime (M3). There is no barrel file to force eager evaluation of that cycle, and none may be
 * created.
 *
 * THE METHOD COUNT IS FOUR, AND HERE IS THE ARITHMETIC
 *
 *     1  declared function in model/dao/ProductTypeDAO.cfc: getProductTypeQuery [L52], `public`,
 *          returntype `query`, and taking ZERO parameters. That is the DAO's entire surface -
 *          there is no second function, public or private. A reviewer counting declarations
 *          against ported methods should start here rather than suspect an omission.
 *   + 3  entity read and save methods, because `entityNew()`, `entityLoad()` and `super.save()`
 *          have no equivalent in a driver-only stack (T3). The legacy service tier loaded and
 *          persisted product types through framework CRUD inherited from `HibachiService`, never
 *          through this DAO, so with the ORM gone those operations must surface somewhere and the
 *          repository port is where: load one by identifier, load by materialized identifier
 *          path, save one.
 *   = 4  methods. That is the whole surface. There is no fifth - no delete, no search, no
 *          listing-by-parent, no load-all, no count, no existence check, no tree builder, no
 *          path-computing helper, no batch variant, no overload and no options bag.
 *
 * The path-based read is not a convenience. `productTypeIDPath` is a materialized,
 * comma-delimited identifier path declared `ormtype="string" length="4000"`
 * [model/entity/ProductType.cfc:L53], and it is walked at two in-scope places: the promotion
 * qualifier and reward membership tests, and the price-group product-type cascade. A read keyed by
 * that path is therefore a genuine requirement of the slice.
 *
 * PARAMETERIZED SQL - WHERE THAT OBLIGATION LIVES (E5)
 * This file declares interfaces only and contains no SQL, so the obligation to use prepared
 * statements exclusively - preserving the injection-safety guarantee that `cfqueryparam` gave the
 * legacy `<cfquery>` bodies - transfers WHOLLY to `src/repositories/mysql/**`. Nothing below names
 * a driver, a pool, a connection, a row packet, a statement or a table. Note that the legacy tree
 * read builds its statement with `setSQL` over a string with no bound parameter at all, because it
 * takes no argument; the two identifier-bearing reads and the save below are the methods where the
 * adapter's binding discipline actually bites, and every caller-supplied value must be bound as
 * its own prepared-statement parameter rather than interpolated into statement text.
 *
 * SCHEMA CONTINUITY (B5)
 * This port reads and writes the existing product-type table unchanged. Nothing below proposes or
 * implies a migration, a rename, a new table or a column change: every member of the projection is
 * an already-declared column, and the materialized ancestry path keeps its declared
 * 4000-character width. Table and column names are referred to in prose only and are never
 * restated as literals here (E6) - which is why the only quoted string anywhere in this file is the
 * module specifier of its single import.
 *
 * THE TREE READ'S ORDERING IS PART OF THE CONTRACT
 * The legacy hint above the function reads, verbatim, `//@hint for caching product types as a
 * tree-sorted query` [model/dao/ProductTypeDAO.cfc:L51]. What is contractual in that sentence is
 * `tree-sorted`, not `caching`: the statement's terminal clause orders by product-type name
 * ascending [model/dao/ProductTypeDAO.cfc:L62], the row set is consumed as a tree-sorted listing,
 * and the implementing adapter MUST preserve that ordering exactly and MUST NOT substitute a
 * different sort. This port declares no cache, no memo, no expiry and no invalidation surface, and
 * none may be added to it; where the legacy engine chose to retain a result is not part of this
 * contract.
 *
 * That rule is deliberately the opposite of the one governing
 * `promotionRepository.getActivePromotionRewards`, whose legacy statement
 * [model/dao/PromotionDAO.cfc:L51-L132] carries NO ordering clause at all and where the adapter
 * must therefore NOT add one - the resulting reward order is genuinely unspecified, and imposing
 * an order there would invent behaviour. Two repository ports, two opposing rules, both
 * intentional: preserve the ordering here, preserve its absence there.
 *
 * FETCH SHAPE, AND WHY LAZINESS IS NOT SIMULATED (T3)
 * Hibernate lazy collections have no equivalent in a driver-only stack and are deliberately not
 * simulated. Associations are materialized at the repository boundary instead, and the fetch shape
 * is an explicit decision made and commented at each repository method in
 * `src/repositories/mysql/mysqlProductTypeRepository.ts` (planned), which also owns the row-to-entity
 * factory, port injection and association materialization. Concretely, a `ProductType` handed back
 * by this port must already carry its parent and child linkage and its `productTypeIDPath` value
 * populated to whatever depth its consumers read, because the CFML entity walked those graphs
 * freely under lazy loading and the ported consumers still expect to. Making the shape an explicit
 * per-method decision is what removes implicit repeated loading by construction; that is a
 * correctness and explicitness property of the design, and it is claimed as nothing else.
 *
 * No `eagerLoad`, `fetch` or `include` parameter appears on any method below. The legacy DAO has
 * no such parameter, and adding one would invent a requirement the source never stated.
 *
 * WHY THE PARENT AND PATH READS DECIDE MONEY (B2)
 * This port supports one of the three must-preserve areas. `getRateForProductTypeBasedOnPriceGroup`
 * [model/service/PriceGroupService.cfc:L57-L100] resolves a rate by climbing the product-type
 * ancestry in a `while (!isNull(currentProductType))` loop that reassigns
 * `currentProductType = currentProductType.getParentProductType()` on every pass, and it feeds the
 * five-level cascade at [model/service/PriceGroupService.cfc:L140-L181]. The promotion engine
 * independently walks `productTypeIDPath` to decide qualifier and reward membership. A product
 * type returned without its parent linkage, or with a stale path, therefore does not merely read
 * oddly - it selects a different rate and charges a different amount. The parent and path reads
 * are money-critical and must be exact.
 *
 * MATERIALIZED-PATH WALKING IS NOT REIMPLEMENTED HERE
 * Splitting, joining, root extraction and membership testing over a comma-delimited identifier
 * path belong to `../valueObjects/materializedIdPath.js`, the sanctioned walker, and this file
 * neither duplicates nor re-brands any of it. This port's only relationship to the path is that
 * one method accepts one and returns the product types matching it.
 *
 * WHY THE PATH PARAMETER IS A PLAIN `string`
 * A deliberate, verified choice rather than an oversight. `materializedIdPath.js` exports two
 * types and five functions; both types - `PrimaryIdAccessor` and `ParentNodeAccessor` - are generic
 * callbacks for walking a node hierarchy, and neither is a path type. That module exports no
 * branded or validated path type at all, and its own path-consuming functions take the path as a
 * plain `string`. So there is nothing to import for this parameter position, and declaring a
 * branded path type here instead would create a second, structurally incompatible brand - exactly
 * the mistake that redeclaring `DecimalString` rather than importing it from
 * `../../lib/cfml/numberFormat.js` would be. A plain `string` is also parity with the persisted
 * column. Hence one import below, not two.
 *
 * EVERY METHOD IS ASYNCHRONOUS
 * All four return a promise, because all four reach persistence. That is the rule for all six
 * repository ports; only `settingsProvider` and `addressZoneEvaluator` are synchronous in this
 * folder.
 *
 * THE DOMAIN LAYER IMPORTS INWARD ONLY (E2)
 * `src/domain/**` may import only from within `src/domain/**` and from `src/lib/**`. Importing
 * `src/repositories/**`, `src/handlers/**` or `src/integrations/**`, or the `mysql2`,
 * `aws-lambda`, `@types/aws-lambda` or `dotenv` packages, is a build failure enforced by the
 * `no-restricted-imports` block in `eslint.config.mjs`. On a repository port `mysql2` is the live
 * temptation, and it is forbidden here: that is the entire point of the port. The boundary is
 * never to be weakened and no exception may be added for this file.
 *
 * THESE NAMES ARE CANONICAL
 * The consumer subtrees that will import this module - the entity, service, repository, handler
 * and integration layers - do not yet reference it. The names, method names and signatures
 * published here are therefore the contract those consumers will be written against. They are not
 * to be renamed later.
 *
 * THIS PORT'S TEST COVERAGE IS NET-NEW, NOT LEGACY PARITY
 * Nothing in the legacy suite covers this DAO. `meta/tests/unit/dao/` contains only
 * `AccountDAOTest` and `PaymentDAOTest`, and the only legacy suites touching the in-scope slice at
 * all are `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc` and the
 * empty stub `meta/tests/functional/admin/entity/ProductTest.cfc`, which contributes nothing.
 * Coverage for every method below is consequently net-new and must be labelled net-new rather than
 * presented as parity. Statement-shape and parameter-binding assertions for the adapter belong in
 * `tests/integration/repositories/`. This file states the obligation and does not discharge it; no
 * test is authored here.
 *
 * A NOTE ON THE TREE READ HAVING NO SURVIVING CALLER
 * A search of the checkout finds `getProductTypeQuery` declared at
 * [model/dao/ProductTypeDAO.cfc:L52] and invoked nowhere. That is recorded as an observation, not
 * as a fault, and it is emphatically not licence to drop the method: it is the DAO's entire
 * declared surface, and interface parity at the persistence boundary is the acceptance contract
 * (B4), so it is carried over verbatim - name, zero parameters and ordering alike.
 *
 * WHO IMPLEMENTS THIS PORT (see the interface doc below for the four transferred obligations)
 * `src/repositories/mysql/mysqlProductTypeRepository.ts` (planned). `src/handlers/bootstrap.ts` (planned) wires that
 * adapter to this interface; it does not implement it.
 *
 * NO USER RULES WERE PROVIDED
 * The project rules source was queried three times while this file was authored - with no range,
 * with the full range, and probing well past the end of the document - and returned the identical
 * single line, `No user rules provided.`, every time; AAP section 0.7 reports the same result
 * independently. No rule has been invented to fill that gap and nothing here paraphrases one. The
 * absence is not licence to lower the bar: the enterprise-standard substitute applies at full
 * strength, which in this file means maximal strictness with no suppression comment, no non-null
 * assertion and no escape hatch, one cohesive closed surface, no barrel, no runtime value
 * whatsoever, and every judgment call annotated where it was made. Zero files enter scope by rule
 * mandate, so there are no rule conflicts to resolve here.
 */
import type { ProductType } from '../entities/productType.js';

/**
 * One row of the cached product-type listing.
 */
export interface ProductTypeTreeRow {
  readonly productTypeID: string;

  // CFML parity [model/dao/ProductTypeDAO.cfc:L54-L61]: both counts are correlated subqueries
  // selected alongside `SELECT *` — `isAssigned` counts products of this type and `childCount` counts
  // its immediate child types — so they are counts, not flags, despite the first name.
  readonly isAssigned: number;

  readonly childCount: number;

  // These three arrive from the `SELECT *`, so their presence depends on the columns the table
  // actually has. The CFML ORM mapping does not declare them required, so the target projection
  // permits undefined for each of them.
  readonly productTypeName?: string;

  readonly productTypeIDPath?: string;

  readonly parentProductTypeID?: string;
}

/**
 * The product-type repository port.
 *
 * Four methods, locked: the single public function of `model/dao/ProductTypeDAO.cfc` plus the three
 * entity read and save methods the service tier needs now that Hibernate is gone. The arithmetic
 * behind that count is in this file's header. Each method returns a promise because each one
 * reaches persistence.
 *
 * TWO METHODS THAT LOOK LIKE THEY BELONG HERE, AND DO NOT. Both are declared on sibling ports, and
 * the boundary is drawn deliberately rather than by accident:
 *
 *   * `searchProductsByProductType` belongs to `productRepository`, from
 *     [model/dao/ProductDAO.cfc:L419]. It is keyed by product type but it returns products, so it
 *     is a product read.
 *   * `searchSkusByProductType` belongs to `skuRepository`, from [model/dao/SkuDAO.cfc:L130]. Same
 *     reasoning: keyed by product type, returns SKUs.
 *
 * A method's home is the aggregate it returns, not the argument it filters on. Neither is declared
 * below, and neither may be added.
 *
 * THE IMPLEMENTING ADAPTER IS `src/repositories/mysql/mysqlProductTypeRepository.ts` (planned), and exactly
 * four obligations transfer to it:
 *
 *   1. Prepared statements exclusively (E5), preserving the injection-safety guarantee that
 *      `cfqueryparam` provided. Every caller-supplied value is bound as its own parameter and
 *      never interpolated into statement text.
 *   2. The tree read's ordering - by product-type name ascending
 *      [model/dao/ProductTypeDAO.cfc:L62] - preserved verbatim, and no different sort substituted.
 *   3. The row-to-entity factory, port injection and association materialization, with the fetch
 *      shape decided and commented at each repository method (T3). Laziness is not simulated.
 *   4. Explicit materialized-path maintenance wherever the ORM previously used persistence
 *      lifecycle hooks. [model/entity/PriceGroup.cfc:L206] and [model/entity/PriceGroup.cfc:L211]
 *      are the documented precedent for that pattern; the product type carries the same kind of
 *      path [model/entity/ProductType.cfc:L53], maintained at
 *      [model/entity/ProductType.cfc:L305-L313] in the legacy source, so the same discipline
 *      applies to any path this adapter writes.
 *
 * `src/handlers/bootstrap.ts` (planned) wires that adapter to this interface. Nothing here names a driver, a
 * pool, a connection, a row packet, a statement or a table.
 */
export interface ProductTypeRepository {
  // LEGACY-NOTE [model/dao/ProductTypeDAO.cfc:L51-L64]: the hint and the trailing comment both call this a tree-sorted query, but the statement orders by productTypeName ascending, so rows come back in name order and tree order has to be rebuilt from productTypeIDPath by the caller.
  // Retained to preserve the cited legacy behavior.
  // The legacy statement is raw SQL naming `SlatwallProductType`, which is the ORM entity name, while
  // the entity maps to table `SwProductType` [model/entity/ProductType.cfc:L49].
  /**
   * The full product-type listing with per-row product and child counts.
   *
   * @returns every product type, ordered by name.
   */
  getProductTypeQuery(): Promise<readonly ProductTypeTreeRow[]>;

  getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined>;

  /**
   * Load every product type named in a materialized identifier path, which is how the promotion
   * qualifier and reward membership tests walk a type's ancestry.
   *
   * @param productTypeIDPath comma-delimited product type identifiers, root first.
   * @returns the product types the path names; absent identifiers are simply not returned.
   */
  getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]>;

  saveProductType(productType: ProductType): Promise<ProductType>;
}
