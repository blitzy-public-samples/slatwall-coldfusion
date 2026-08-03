/**
 * `ProductTypeRepository` — the repository port for the Catalog's product-type tree query.
 *
 * Legacy origin: `model/dao/ProductTypeDAO.cfc`, whose entire body is one member. AAP §0.4.1.6
 * mandates this file with a single instruction — "The tree-sorted query's projection typed" — and
 * AAP §0.4.2.6 fixes the target name: `getProductTypeQuery`
 * (`model/dao/ProductTypeDAO.cfc:L52`) becomes {@link ProductTypeRepository.findAllForTree}.
 *
 * WHY A DAO IS IN SCOPE AT ALL. The prompt names no DAOs; AAP §0.2.1.3 adds all four as implicit
 * scope because "this is where the Catalog's business logic actually resides". For THIS DAO the claim
 * is narrower than for its three siblings, and saying so plainly is more useful than implying an
 * algorithm that is not there: the member has no branch, no loop and no business rule. What it has is
 * a PROJECTION — two derived counts that appear nowhere else in the slice — and there is no service
 * layer above it to restate them, because `hb_serviceName="productService"`
 * (`model/entity/ProductType.cfc:L49`) routes product types through `ProductService` and the property
 * that would reach this DAO (`model/service/ProductService.cfc:L54`) is never used. Typing that
 * projection exactly is the whole deliverable of this module.
 *
 * THE ONE HAZARD THIS MODULE EXISTS TO PREVENT: `isAssigned` IS A COUNT, NOT A FLAG. Its name invites
 * a true/false reading, and `model/dao/ProductTypeDAO.cfc:L55-L57` computes
 * `count(SlatwallProduct.productID)` — a value in the range 0..N. Typing it as a two-state flag would
 * compile, lint, bundle and pass every automated gate while silently changing behaviour, because every
 * arithmetic and comparison use of the value would still be syntactically valid. The full reasoning is
 * repeated on {@link ProductTypeTreeRow}, because that is where a reader edits.
 *
 * WHY THIS PORT IMPORTS A DOMAIN TYPE WHERE ITS SIBLINGS IMPORT NOTHING. `OptionRepository.ts` and
 * `ProductRepository.ts` declare their row shapes locally, and the difference is a property of the
 * legacy statements rather than a change of convention. Those DAOs assemble NARROW projections field
 * by field — two-key rows built at `model/dao/OptionDAO.cfc:L87-L89` and `:L112-L114`, and at
 * `model/dao/ProductDAO.cfc:L430-L434` — so their row types have no relationship to any entity.
 * `model/dao/ProductTypeDAO.cfc:L54` instead projects the wildcard over the product type's own table
 * and appends two derived columns, so the row IS an entity row plus two extras. Reusing the declared
 * entity type is the honest encoding of that, and a type-only import is erased before bundling, so
 * this module remains a hexagonal leaf at runtime (AAP §0.7.3 S4). The permitted direction is also the
 * one taken — `ports` depends on `domain`, never the reverse.
 *
 * WHERE THE STATEMENTS LIVE INSTEAD. Statement text, identifier handling, placeholder generation and
 * binding order are the adapter's job (AAP §0.4.1.7, §0.4.3.4 rule R4), so nothing database-shaped
 * crosses this boundary: no fragment, no table or column name as a parameter, no placeholder array
 * (AAP §0.7.3 S2). No driver type is named, the environment is never read — configuration flows one
 * way through `src/config/` (AAP §0.4.3.5) — and no AWS type appears, because that coupling is
 * confined to `src/handlers/` (AAP §0.7.3 S4). What this module does carry is the adapter OBLIGATIONS
 * the type system cannot express, each with its legacy locator, since this is the file the adapter
 * author reads first.
 *
 * THE COMPONENT IS STATELESS, WITH A CONSEQUENCE. `model/dao/ProductTypeDAO.cfc:L49` declares
 * `accessors="true" extends="HibachiDAO"` and no property of any kind, and the file contains no other
 * member. So the caching mismatch M7 does not reach this component and NO cache-bearing or
 * cache-clearing member appears below — unlike `model/dao/SkuDAO.cfc`, which declares
 * `<cfproperty name="nextOptionGroupSortOrder">` at `model/dao/SkuDAO.cfc:L51`, memoizes an
 * option-group sort order, and whose port consequently does carry a cache-clearing member that only
 * defect D7 forces to exist. And because no member hides in tag syntax, the scanning hazard recorded
 * as Discrepancy 7 in AAP §0.4.2.6 does not reach this file.
 *
 * NO EXECUTION-MODEL MISMATCH ARISES HERE, AND THAT IS STATED RATHER THAN LEFT BLANK (AAP 0.7.3,
 * S8). The member is stateless, non-transactional, takes no argument and performs one read: there
 * is no long-running bulk operation, no per-row commit boundary, no request-end flush gate, no
 * background thread and no cross-invocation cache to reconcile with a single Lambda invocation.
 * None of AAP §0.6.6's eight mismatches applies to this module, so no new identifier is minted, and
 * this file mints no defect identifier either — so findings recorded below that carry no register
 * number carry none deliberately. ⚠️ F27: this previously claimed the defect register was "likewise
 * closed at D1 through <a port-minted endpoint beyond D21>", which was not the AAP's range. ⚠️ AND REVIEW
 * FINDING F11 REPORTED WHAT THE CORRECTION LEFT BEHIND: the withdrawn endpoint had been substituted with
 * its own prose description, mid-range, so the sentence read "closed at D1-the logical-versus-physical
 * naming divergence [model/dao/SkuDAO.cfc:L132]" — a description standing where a numeral belonged. No live
 * bound is restated here at all; `src/ports/repositories/SkuRepository.ts` is the one place that states
 * both frozen ranges.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *   - Any paginated or dynamic-query member. The legacy component inherits that surface from
 *     `HibachiDAO`, whose entity-name handling sits at `org/Hibachi/HibachiDAO.cfc:L102-L111`; it
 *     belongs wholly to the paginated dynamic-query port at the root of `src/ports/`, and nothing from
 *     `org/Hibachi/**` is carried across in any case (AAP §0.8.3.2).
 *   - Any caching member, memoization hook, invalidation call or time-to-live. See
 *     {@link ProductTypeRepository.findAllForTree}: the legacy hint advertises caching the legacy does
 *     not perform, and implementing it would be the enhancement AAP §0.8.2 Guideline 4 forbids.
 *   - Any hierarchical-ordering promise. The legacy ordering is flat; the reasoning and both
 *     misleading legacy comments are recorded on the member.
 *   - Any timeout, retry, batch-size, page-size or maximum-results number, and any filter, sort key or
 *     limit argument (AAP §0.7.3 S9, IR-12). `model/dao/ProductTypeDAO.cfc:L52` declares no argument
 *     at all.
 *   - The identifier generator. `model/dao/HibachiDAO.cfc:L51-L53` — the LOCAL base this component
 *     extends, not the framework one (IR-8) — exposes `createSlatwallUUID()`, ported to
 *     `src/util/uuid.ts` and called by the adapter when it writes. This port neither generates nor
 *     validates identifiers.
 */

import type { ProductType } from '../../domain/product/ProductType';

/**
 * One row of {@link ProductTypeRepository.findAllForTree} — a product type together with the two
 * counts the legacy query derives for it.
 *
 * `isAssigned` IS A COUNT IN THE RANGE 0..N. IT IS NOT A YES-OR-NO FLAG. This is the single
 * most likely silent behaviour change in the whole module, so it is stated at the declaration and
 * not only in the file header. `model/dao/ProductTypeDAO.cfc:L55-L57` computes
 * `count(SlatwallProduct.productID)` over `SlatwallProduct`, correlated on
 * `SlatwallProduct.productTypeID = SlatwallProductType.productTypeID` at
 * `model/dao/ProductTypeDAO.cfc:L57` — that is, how many products are assigned to this product
 * type. The column alias is what misleads: a two-state type here would satisfy the compiler, the
 * linter, the bundler and every automated gate in this repository, and would still lose the
 * magnitude. Consumers that need a present-or-absent answer derive it from the number; the
 * repository does not derive it for them, because the legacy does not either (AAP 0.7.3, S9).
 *
 * `childCount` COUNTS IMMEDIATE CHILDREN ONLY, NOT DESCENDANTS. `model/dao/ProductTypeDAO.cfc:L58`
 * through `model/dao/ProductTypeDAO.cfc:L60` computes `count(spt.productTypeID)` over a
 * self-reference to the product-type table aliased `spt`, correlated on
 * `spt.parentProductTypeID = SlatwallProductType.productTypeID` at
 * `model/dao/ProductTypeDAO.cfc:L60`. The predicate matches a single generation, so a product type
 * with one child that itself has four children reports one, not five. Nothing in the statement
 * walks the hierarchy transitively, and no consumer should read the value as a subtree size.
 *
 * WHY A FLAT INTERSECTION, AND NOT AN ENUMERATED COLUMN LIST OR A NESTED SHAPE. This is a
 * technology-specific judgment call and AAP 0.8.2 Guideline 6 requires it to be documented where
 * it is made. `model/dao/ProductTypeDAO.cfc:L54` projects the wildcard over the product-type table
 * named at `model/dao/ProductTypeDAO.cfc:L61` and appends the two derived columns above, so the
 * legacy row is FLAT: the entity's own columns and the two extras sit in one namespace, and a
 * consumer reads `isAssigned` directly off the same value it reads the product-type name off.
 * Three encodings were available and two are rejected on evidence:
 *
 *   - Enumerating a column list would mean asserting a set of column names for which this port
 *     has no locator. AAP 0.8.5 requires every behavioural claim to carry one, and AAP 0.7.3 S9
 *     forbids inventing what the source does not state, so the list would be fabrication however
 *     plausible it looked.
 *   - Nesting the entity under a key — a shape carrying the product type as one field and the
 *     counts as siblings of it — would invent a structure the legacy row does not have, and every
 *     consumer would then have to reach through a level that exists only because this file
 *     created it.
 *   - Intersecting the declared entity type with exactly the two derived columns reuses the type
 *     the row mapper already owns, adds precisely what the query adds, invents nothing, and keeps
 *     the flat access shape the legacy produces. It is also self-maintaining: when the entity
 *     gains or loses a field, this row type follows without an edit here.
 *
 * THE RAW-COLUMN-TO-ENTITY MAPPING IS THE ADAPTER'S OBLIGATION, NOT THIS PORT'S. A wildcard
 * projection yields whatever columns the table has, and the declared entity type is not a
 * column-for-column mirror of them — it models relationships as references rather than as the
 * foreign-key scalars a raw row would carry. Reconciling the two is exactly the work AAP 0.4.1.7
 * assigns to `src/adapters/mysql/rowMappers.ts` ("explicit column-to-field mapping replacing
 * Hibernate hydration"), and identifiers stay 32-character strings there per IR-6. This type
 * describes what a CONSUMER receives after that mapping, which is why it can be stated without
 * naming a single column.
 *
 * TODO(parity): the legacy statement at `model/dao/ProductTypeDAO.cfc:L54` through
 * `model/dao/ProductTypeDAO.cfc:L62` names its tables with the STALE LOGICAL entity names, and it
 * is native statement text rather than HQL — the query object is created at
 * `model/dao/ProductTypeDAO.cfc:L53` and executed at `model/dao/ProductTypeDAO.cfc:L64`, with no
 * ORM layer in between to translate a logical name. In release 3.1.39 the physical tables are
 * `SwProductType` and `SwProduct`, declared at `model/entity/ProductType.cfc:L49` and
 * `model/entity/Product.cfc:L49` respectively, and this component contains ZERO physical names
 * anywhere — so the statement is stale from the pre-3.x table rename and unexecutable as written.
 * The root cause is the application-key prefixing at `org/Hibachi/HibachiDAO.cfc:L102-L106`, which
 * makes the ORM and HQL layers legitimately speak the logical names; these native statements were
 * written when the logical and physical names coincided. Discharging it belongs to
 * `src/adapters/mysql/MySqlProductTypeRepository.ts`, which must emit the PHYSICAL names, and the
 * conclusion the adapter author must carry is: never "fix" HQL entity names to the physical form,
 * and never assume a logical name works in native statement text. No signature in this module
 * changes as a result — table and column identifiers never appear in these declarations at all
 * (AAP 0.7.3, S2) — and the finding takes no new register number because this file mints none; the
 * canonical register statement is quoted in this file's header.
 *
 * Both derived fields are `readonly`. They are query-computed values with no column of their own,
 * so nothing downstream has any business assigning to them; the entity's own fields keep whatever
 * mutability the entity declares, because narrowing those here would change a contract this module
 * does not own.
 */
export type ProductTypeTreeRow = ProductType & {
  /**
   * How many products are assigned to this product type — `count(SlatwallProduct.productID)` at
   * `model/dao/ProductTypeDAO.cfc:L55-L57`. A count, never a yes-or-no flag; zero when the product
   * type has no products.
   */
  readonly isAssigned: number;

  /**
   * How many product types name this one as their parent — `count(spt.productTypeID)` at
   * `model/dao/ProductTypeDAO.cfc:L58-L60`. Immediate children only, never a transitive subtree
   * size; zero for a leaf.
   */
  readonly childCount: number;
};

/**
 * Port for the one member of `model/dao/ProductTypeDAO.cfc`, implemented against MySQL in
 * `src/adapters/mysql/**`.
 *
 * The implementation is supplied by explicit constructor injection, replacing the DI/1 property
 * declared at `model/service/ProductService.cfc:L54` and the accessor synthesised for it, which
 * resolved by name at run time (AAP §0.4.3.1 rule R1, §0.4.3.2 rule R2; §0.7.3 S3). That property is
 * one of the four dead injections AAP §0.6.3.1 identifies, so no service in this port's own slice
 * wires it today — see {@link ProductTypeRepository.findAllForTree} for why the member is nonetheless
 * declared.
 *
 * The member resolves rather than returning synchronously: the legacy member is synchronous because a
 * CFML query blocks the request thread, whereas the target reaches the database through an
 * asynchronous driver. That is idiom, not behaviour, and squarely the permitted half of the Minimal
 * Change Clause (AAP §0.8.1).
 */
export interface ProductTypeRepository {
  /**
   * Returns every product type, each carrying its assigned-product count and its immediate-child
   * count.
   *
   * Legacy origin: `model/dao/ProductTypeDAO.cfc:L52`, whose statement is assembled at
   * `model/dao/ProductTypeDAO.cfc:L54-L62` and executed at `model/dao/ProductTypeDAO.cfc:L64`.
   *
   * NO ARGUMENT, BY PRESERVATION. `model/dao/ProductTypeDAO.cfc:L52` declares none, and the
   * statement carries no predicate on the outer query at all — there is no active-flag filter, no
   * published-flag filter, no parent restriction and no row limit anywhere in
   * `model/dao/ProductTypeDAO.cfc:L54-L62`. The member therefore returns EVERY row of the
   * product-type table, and no filter, sort key, page size or maximum-results argument is offered
   * here, because offering one would invent a capability the source does not have (AAP 0.7.3, S9
   * and IR-12). A caller that wants a subset filters the resolved array.
   *
   * ROW ORDER IS OBSERVABLE, AND IT IS FLAT — DESPITE TWO LEGACY COMMENTS THAT SAY OTHERWISE.
   * The ordering clause at `model/dao/ProductTypeDAO.cfc:L62` sorts on the product-type name
   * ascending, alphabetically, across the whole table. It is a SINGLE sort term over a flat row
   * set: nothing groups a child beneath its parent, and the identifier-path property that could
   * express a hierarchy — `productTypeIDPath`, declared at `model/entity/ProductType.cfc:L53` and
   * computed at `model/entity/ProductType.cfc:L251-L253` — is not referenced by this statement at
   * any point.
   *
   * TODO(parity): the two legacy comments MISDESCRIBE that ordering, and the divergence is recorded
   * rather than resolved. The hint at `model/dao/ProductTypeDAO.cfc:L51` calls the result a
   * "tree-sorted query" and the trailing comment at `model/dao/ProductTypeDAO.cfc:L63` calls it a
   * "sorted Product Type tree", yet `model/dao/ProductTypeDAO.cfc:L62` performs a flat alphabetical
   * sort and nothing else. AAP 0.4.1.6's own phrase "the tree-sorted query" inherits that same
   * legacy vocabulary; the ordering is in fact flat. This method name, its return type and this
   * documentation therefore promise no hierarchical ordering, and none must be introduced: adding a
   * tree sort would change observable output, which AAP 0.7.3 S7 ("preserve and annotate, do not
   * repair") and AAP 0.8.2 Guideline 4 both forbid. Callers needing a hierarchy build it from the
   * parent references on the returned rows. Carried as observed, with no new register number.
   *
   * TODO(parity): the same hint at `model/dao/ProductTypeDAO.cfc:L51` also advertises caching —
   * "for caching product types as a tree-sorted query" — and NOTHING IN THE COMPONENT CACHES
   * ANYTHING. A fresh query object is created at `model/dao/ProductTypeDAO.cfc:L53` and executed at
   * `model/dao/ProductTypeDAO.cfc:L64` on every single call, and the component declares no property
   * to hold a result in (`model/dao/ProductTypeDAO.cfc:L49`). Contrast `model/dao/SkuDAO.cfc:L51`,
   * which declares exactly such a property and genuinely memoizes. Implementations MUST NOT add
   * caching, memoization, invalidation or a time-to-live to satisfy the hint: it would be inventing
   * behaviour (AAP 0.7.3, S9) and enhancing beyond what the migration requires (AAP 0.8.2,
   * Guideline 4). It would also be unsound in the target execution model, since module-scope state
   * survives between warm Lambda invocations and would bleed across them (mismatch M7). Carried as
   * observed, with no new register number.
   *
   * TR-1 TIGHTENING, RECORDED. `model/dao/ProductTypeDAO.cfc:L52` declares `returntype="query"` and
   * `model/dao/ProductTypeDAO.cfc:L64` returns the CFML query object that
   * `model/dao/ProductTypeDAO.cfc:L53` created — an untyped, column-oriented, row-indexed structure
   * with no compile-time shape whatsoever. The target narrows that to
   * `Promise<ProductTypeTreeRow[]>`: a row-oriented array of typed rows. Transformation rule TR-1
   * sanctions exactly this — "Where a legacy signature is loose (untyped `any`, optional arguments
   * that callers always supply), the target signature is tightened to the observed contract and the
   * tightening is recorded" — and this note is that record. Two consequences of the narrowing are
   * worth being explicit about, since they are the parts a reader might otherwise take for granted:
   * the row-oriented shape is a genuine change of access idiom rather than a change of content
   * (same rows, same values, same order), and the two derived columns become named fields with
   * declared types instead of untyped columns, which is what makes the `isAssigned` hazard a
   * decision recorded in {@link ProductTypeTreeRow} rather than a mistake waiting at every use.
   *
   * DECLARED DESPITE HAVING NO CALLER — AND THAT IS AN INSTRUCTION, NOT AN OVERSIGHT. Searching the
   * whole repository for this member's legacy name returns exactly one line: its own declaration at
   * `model/dao/ProductTypeDAO.cfc:L52`. The accessor that would reach it has zero call sites too,
   * which corroborates the finding from the other side — `model/service/ProductService.cfc:L54`
   * declares the DI/1 property and nothing in the tree ever reads it (AAP 0.6.3.1, "dead
   * injection"). The member is nonetheless declared, because two authorities converge: AAP 0.4.2.6
   * maps the legacy member explicitly to this named target method, and transformation rule TR-5 is
   * unambiguous — "The member is never quietly dropped from the interface." The asymmetry with the
   * one dead member the plan DOES omit is deliberate and worth naming, since it is the difference
   * between following instructions and improvising: the private, only-self-recursive method at
   * `model/service/ProductService.cfc:L82-L97` (defect D15) is omitted SOLELY because AAP 0.4.1.8
   * instructs it. Dead code is dropped on explicit instruction, never on a port author's own
   * reachability analysis.
   *
   * @returns Every product type in the flat alphabetical order described above, each row carrying
   *   the two derived counts. Possibly empty; never null or undefined. The array is a snapshot of
   *   one read — nothing here caches it, and nothing here promises that two calls agree.
   */
  findAllForTree(): Promise<ProductTypeTreeRow[]>;

  /**
   * Write one product type — insert when it is transient, update when it is not.
   *
   * ==================================================================================================
   * THE MEMBER THAT MAKES `ProductService.saveProductType` REACH THE DATABASE (F03)
   * ==================================================================================================
   * ⭐ THIS PORT PREVIOUSLY DECLARED NO WRITE AT ALL, AND THAT WAS A GAP RATHER THAN A BOUNDARY.
   * `src/services/ProductService.ts` requires a `ProductTypeBaseService` — a `Pick<…, 'save'>` of the
   * base service — whose construction needs an `EntityPersister<ProductType>`. Nothing in the adapter
   * layer supplied one: the only `SwProductType` statements anywhere were the tree projection on this
   * port and the importer's lookup-and-insert composers, and an import-time composer is not generic
   * entity persistence — it writes the two columns a spreadsheet row supplies and cannot express an
   * update, an audit stamp or the parent reference. So `saveProductType` had no way to persist anything.
   *
   * WHY THE LEGACY DECLARES NO SUCH DAO MEMBER, AND WHY THAT IS NOT AN ARGUMENT AGAINST THIS ONE.
   * `model/dao/ProductTypeDAO.cfc` declares one member, the tree query. It needs no write member
   * because the mapping layer performed every insert and update implicitly at flush time from the
   * property metadata at `model/entity/ProductType.cfc:L52-L86`. AAP §0.4.1.7 assigns that vanished
   * behaviour to the adapter layer — "explicit column-to-field mapping replacing Hibernate hydration" —
   * and hydration's counterpart is dehydration. Declaring it here is therefore the port of a real legacy
   * behaviour, not an addition to the legacy surface: the alternative is a service whose save path
   * cannot be wired at all.
   *
   * ⛔ IT DOES NOT COMMIT. Demarcation belongs to the caller, exactly as
   * `src/ports/repositories/SkuRepository.ts` records for `persistSku`: the legacy committed once,
   * implicitly, at request end and only when the ORM reported no errors (mismatch M5). An
   * implementation that committed here would make a validation-failing graph permanent.
   *
   * ⛔ THE DELETE AND UNIQUENESS GUARDS RUN ABOVE THIS MEMBER. `model/validation/ProductType.json`
   * declares the required fields and the four delete guards; they are ported as a typed rule set under
   * `src/validation/rules/**` and evaluated by the service before it ever reaches a repository, exactly
   * as `model/service/HibachiService.cfc:L86` gates its own save. Nothing here re-checks them.
   *
   * ⚠️ `productTypeIDPath` IS WRITTEN AS THE ENTITY CARRIES IT, NOT RECOMPUTED. The path is a
   * persistent column at `model/entity/ProductType.cfc:L53`, and the legacy maintained it in the entity
   * lifecycle rather than in the DAO. Recomputing it during the write would put a second, disagreeing
   * implementation of one rule in the layer least able to see the hierarchy.
   *
   * @param productType - The product type to write. MUTATED when transient: it receives its
   *   32-character identifier, because `model/entity/ProductType.cfc:L52` declares
   *   `fieldtype="id" generator="uuid"` — an instruction to the mapping layer to produce the value at
   *   save time — and the legacy generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`.
   * @returns The same product type, so the member satisfies `EntityPersister<ProductType>` directly.
   */
  saveProductType(productType: ProductType): Promise<ProductType>;

  /**
   * Remove one product type.
   *
   * Replaces the `delete` branch at `org/Hibachi/HibachiService.cfc:L270`, which reached `delete()` at
   * `org/Hibachi/HibachiDAO.cfc:L69-L77`. Declared because constructing a `BaseService<ProductType>`
   * requires an `EntityRemover<ProductType>` alongside its persister — the base service's collaborator
   * set takes both — so a port offering only the write would still leave the graph unwireable.
   *
   * ⛔ THE FOUR DELETE GUARDS RUN ABOVE THIS MEMBER, NOT INSIDE IT. `model/validation/ProductType.json`
   * bounds products and child product types at zero and guards `systemCode`; a blocked removal never
   * arrives here. That is why the result carries no validation outcome.
   *
   * ⚠️ NO CASCADE IS EXPRESSED HERE. `model/entity/ProductType.cfc:L65-L66` declares `cascade="all"` on
   * both `childProductTypes` and `products`, but the delete guards make a product type with either one
   * non-empty unreachable, so the cascade the mapping layer would have run has nothing to act on by the
   * time a removal is permitted. Emitting child deletes anyway would delete rows the guards exist to
   * protect.
   *
   * @param productType - The product type to remove. Must carry a persistent identifier.
   * @returns Nothing, so the member satisfies `EntityRemover<ProductType>` directly.
   */
  removeProductType(productType: ProductType): Promise<void>;
}
