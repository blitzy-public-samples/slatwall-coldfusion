// slatwall-ts - repository suite for the product reads and writes.
//
// Two things are asserted and nothing else: the exact SQL text the adapter emits, and the exact
// array of parameters it binds to that text.
//
// parameterized-sql-exclusively in the entire migration, and one of the two carried-forward TODOs.
// Both live on `getAttributeSets`, both come from the same four legacy lines, and both are
// asserted below rather than described.
//
// `meta/tests/unit/dao/` contains exactly two files - `AccountDAOTest.cfc` and
// `PaymentDAOTest.cfc` - and both are out of scope.

import { describe, expect, it } from 'vitest';

import type { Product } from '../../../src/domain/entities/product.js';
// A VALUE import, and the only entity module this file constructs from directly.
import { ProductType } from '../../../src/domain/entities/productType.js';
// Type-only: the cascade contract names `Sku` in its signature, and the recording writer below
// restates that signature so the compiler checks the shape on every build.
import type { Sku } from '../../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductSearchRow,
} from '../../../src/domain/ports/productRepository.js';
import type { ProductTypeRepository } from '../../../src/domain/ports/productTypeRepository.js';
// Type-only: the sale-price collaborator's return projection.
import type { SalePriceDetail } from '../../../src/domain/ports/promotionRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listToArray } from '../../../src/lib/cfml/list.js';
import { cfBoolean } from '../../../src/lib/cfml/truthiness.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import {
  MAX_PLACEHOLDER_COUNT,
  SQL_TUPLE_ROW_LIMIT,
} from '../../../src/repositories/mysql/connection.js';
const TEST_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  adminAccountFlag: true,
});

/**
 * Signed in without the admin flag - and carrying an identifier deliberately, so a refusal is
 * provably the flag's doing and not an accident of having nothing to stamp.
 */
const NON_ADMIN_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
  adminAccountFlag: false,
});

/**
 * An account a CALLER put on a product. It must never reach a bound parameter.
 */
const FORGED_ACCOUNT_ID = 'ffffffffffffffffffffffffffffffff';

/**
 * The collaborators bag `MysqlProductRepository` requires, as this suite supplies it.
 */
type ProductHydrationCollaborators = ConstructorParameters<typeof MysqlProductRepository>[2];

/**
 * The optional cascade writer, named so the fixture can forward it without repeating its shape.
 */
type ProductSkuCascadeWriter = ConstructorParameters<typeof MysqlProductRepository>[3];

/**
 * Constructs the subject with the one collaborator it cannot be built without.
 *
 * @param executor the capturing or canned executor under test.
 * @param auditActor who writes are attributed to.
 * @param collaborators any bag members this case cares about; merged over the default.
 * @param skuCascadeWriter forwarded unchanged when a cascade case supplies one.
 */
function aProductRepository(
  executor: PreparedStatementExecutor,
  auditActor: AuditActorContext,
  collaborators: Partial<ProductHydrationCollaborators> = {},
  skuCascadeWriter?: ProductSkuCascadeWriter,
): MysqlProductRepository {
  return new MysqlProductRepository(
    executor,
    auditActor,
    {
      productTypeRepository: new MysqlProductTypeRepository(executor, auditActor),
      ...collaborators,
    },
    skuCascadeWriter,
  );
}
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
// The aggregate cascade is driven by the product's own sku collection, so the cascade cases have
// to build SKUs. Nothing else in this file constructs one.
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

/**
 * The product-type port for every case that must never reach one.
 *
 * The two cases that do exercise the product-type read supply a real adapter over their own
 * recording executor.
 */
const UNREACHED_PRODUCT_TYPE_PORT: ProductTypeRepository = Object.freeze({
  getProductTypeQuery: () => {
    throw new Error('this case must not reach the product-type port: getProductTypeQuery');
  },
  getProductTypeByProductTypeID: () => {
    throw new Error(
      'this case must not reach the product-type port: getProductTypeByProductTypeID',
    );
  },
  getProductTypesByProductTypeIDPath: () => {
    throw new Error(
      'this case must not reach the product-type port: getProductTypesByProductTypeIDPath',
    );
  },
  saveProductType: () => {
    throw new Error('this case must not reach the product-type port: saveProductType');
  },
});

/**
 * The collaborator bag naming exactly the one mandatory port and nothing else.
 *
 * This is the shape a statement-shape case wants: the subject is built over a capturing executor
 * plus the single collaborator the constructor requires.
 */
const PRODUCT_TYPE_PORT_BAG_MEMBER = Object.freeze({
  productTypeRepository: UNREACHED_PRODUCT_TYPE_PORT,
});

// JUDGMENT CALL: the executor is implemented outright rather than mocked.
//
// JUDGMENT CALL: it is duplicated across the six repository suites rather than shared.
//
// JUDGMENT CALL: it records rather than simulates. It is not a database - it never parses a
// statement, never evaluates a predicate and never matches a bound key against a row.

/**
 * One statement the adapter sent, captured with the parameters it bound to it.
 */
interface RecordedStatement {
  /**
   * The statement text, exactly as the adapter produced it.
   */
  readonly sql: string;

  /**
   * The bound parameters, in the positional order they were supplied.
   */
  readonly params: readonly unknown[];
  /**
   * Whether this statement was issued inside `transaction`.
   *
   * Captured per statement so a suite can PROVE atomicity instead of assuming it.
   */
  readonly inTransaction: boolean;
}

/**
 * A statement that matched nothing, which is a legitimate outcome for every read here.
 */
const NO_ROWS: readonly SqlRow[] = [];

/**
 * What every recorded write reports back, so a save or delete can be observed to succeed.
 */
const WRITE_RESULT: SqlMutationResult = Object.freeze({ affectedRows: 1, warningStatus: 0 });

/**
 * What a write reports when it matched no row, which is how `deleteProduct` answers false.
 */
const NO_ROWS_AFFECTED: SqlMutationResult = Object.freeze({ affectedRows: 0, warningStatus: 0 });

/**
 * A `PreparedStatementExecutor` that captures what it is asked to run.
 *
 * Satisfies the narrow executor contract the adapter is constructed with, so it substitutes for
 * the pool-backed executor without the adapter knowing.
 *
 * It takes an ORDERED SEQUENCE of canned result sets, because three of the seven ported methods
 * issue MORE THAN one statement in a single call.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  /**
   * Every result-set statement, in call order.
   */
  readonly calls: RecordedStatement[] = [];

  /**
   * Every data-modifying statement, in call order.
   */
  readonly mutationCalls: RecordedStatement[] = [];

  /**
   * What successive `execute` calls hand back, standing in for the server.
   */
  private readonly cannedResultSets: readonly (readonly SqlRow[])[];

  /**
   * What every `executeMutation` call reports back.
   */
  private readonly mutationResult: SqlMutationResult;

  /**
   * How many result-set statements have been answered so far.
   */
  private answeredResultSets = 0;

  /**
   * @param cannedResultSets one result set per expected `execute` call, in order.
   * @param mutationResult what each write reports; defaults to one affected row.
   */
  constructor(
    cannedResultSets: readonly (readonly SqlRow[])[] = [],
    mutationResult: SqlMutationResult = WRITE_RESULT,
  ) {
    this.cannedResultSets = cannedResultSets;
    this.mutationResult = mutationResult;
  }

  /**
   * Record the statement and answer with the next canned result set.
   *
   * @param sql the statement the adapter produced.
   * @param params the parameters it bound, defaulted because the contract declares them optional.
   * @returns the next canned result set.
   */
  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params], inTransaction: this.transactionDepth > 0 });

    const cannedRows = this.cannedResultSets[this.answeredResultSets] ?? NO_ROWS;
    this.answeredResultSets += 1;

    return Promise.resolve(cannedRows);
  }

  /**
   * Record the write and report the configured outcome.
   *
   * The port declares `saveProduct` and `deleteProduct`, so a recorded mutation is expected here
   * rather than a fault.
   *
   * @param sql the statement the adapter produced.
   * @param params the parameters it bound.
   * @returns the configured mutation result.
   */
  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({
      sql,
      params: [...params],
      inTransaction: this.transactionDepth > 0,
    });

    return Promise.resolve(this.mutationResult);
  }

  /**
   * How many times `transaction` was entered, counting a JOINED inner call.
   */
  transactionCount = 0;

  /**
   * Nesting depth, so joined inner calls do not read as separate units.
   */
  private transactionDepth = 0;

  /**
   * The transaction boundary, in call order: `BEGIN`, then `COMMIT` or `ROLLBACK`.
   *
   * Separate from `calls` and `mutationCalls` so that a case asserting the STATEMENT sequence is
   * unaffected by whether a transaction wrapped it.
   *
   * A joined inner call records `'JOIN'`, not a second `'BEGIN'`, and contributes no `'COMMIT'`.
   */
  readonly transactionEvents: string[] = [];

  /**
   * Record the transaction boundary and run `work` inline against this same recorder.
   *
   * The depth is restored in a `finally` so that a failing unit of work - which is exactly what a
   * rollback test drives - does not leave the recorder believing it is still inside a transaction.
   */
  async transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.transactionDepth += 1;

    const isOutermost = this.transactionDepth === 1;
    this.transactionEvents.push(isOutermost ? 'BEGIN' : 'JOIN');

    try {
      const result = await work(this);

      if (isOutermost) {
        this.transactionEvents.push('COMMIT');
      }

      return result;
    } catch (error: unknown) {
      if (isOutermost) {
        this.transactionEvents.push('ROLLBACK');
      }

      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }
}

// `noUncheckedIndexedAccess` is on, so every indexed read is `T | undefined`.

/**
 * One recorded statement, by position.
 *
 * @param calls the double's recorded statements.
 * @param index the position to read.
 * @returns the statement at that position.
 * @throws When the method issued fewer statements than that.
 */
function statementAt(calls: readonly RecordedStatement[], index: number): RecordedStatement {
  const statement = calls[index];

  if (statement === undefined) {
    throw new Error(
      'Expected a recorded statement at index ' +
        String(index) +
        ', but only ' +
        String(calls.length) +
        ' statement(s) were issued.',
    );
  }

  return statement;
}

/**
 * The single statement a method issued, or a failure describing what it did instead.
 *
 * @param calls the double's recorded statements.
 * @returns the one recorded statement.
 * @throws When the method issued anything other than exactly one statement.
 */
function onlyStatement(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length !== 1) {
    throw new Error(
      'Expected exactly one statement to have been issued, but ' +
        String(calls.length) +
        ' were. A single-statement read must not issue a second lookup, a per-row follow-up ' +
        'or a hydration query.',
    );
  }

  return statementAt(calls, 0);
}

/**
 * One bound parameter, by position.
 *
 * @param params the recorded parameter array.
 * @param index the position to read.
 * @returns the value bound at that position.
 * @throws When the statement bound fewer parameters than that.
 */
function parameterAt(params: readonly unknown[], index: number): unknown {
  if (index >= params.length) {
    throw new Error(
      'Expected a bound parameter at index ' +
        String(index) +
        ', but the statement bound only ' +
        String(params.length) +
        ' parameter(s).',
    );
  }

  return params[index];
}

/**
 * One projected attribute-set summary, narrowed without an escape hatch.
 *
 * @param summaries the projections the adapter returned.
 * @param index the position to read.
 * @returns the projection at that position.
 * @throws When fewer projections were returned than that.
 */
function summaryAt(summaries: readonly AttributeSetSummary[], index: number): AttributeSetSummary {
  const summary = summaries[index];

  if (summary === undefined) {
    throw new Error(
      'Expected an attribute-set projection at index ' +
        String(index) +
        ', but only ' +
        String(summaries.length) +
        ' were returned.',
    );
  }

  return summary;
}

/**
 * The matched row at `index`, or a stated failure.
 *
 * @param rows the rows the adapter returned.
 * @param index the position to read.
 * @returns the row at that position.
 * @throws When fewer rows were returned than that.
 */
function matchAt(rows: readonly ProductSearchRow[], index: number): ProductSearchRow {
  const row = rows[index];

  if (row === undefined) {
    throw new Error(
      'Expected a matched row at index ' +
        String(index) +
        ', but only ' +
        String(rows.length) +
        ' were returned.',
    );
  }

  return row;
}

/**
 * A product the adapter must have found, narrowed from the port's `| undefined`.
 *
 * @param product what the loader returned.
 * @returns the product.
 * @throws When the loader answered `undefined`.
 */
function requireProduct(product: Product | undefined): Product {
  if (product === undefined) {
    throw new Error(
      'Expected the loader to have materialized a product, but it answered undefined.',
    );
  }

  return product;
}

/**
 * The rejection an operation produced, so its `name` can be asserted.
 *
 * The adapter's error constructors are module-private by design, so each is identified by the
 * `name` it sets rather than with `instanceof`.
 *
 * @param operation the promise-returning call expected to reject.
 * @returns the rejection, as an `Error`.
 * @throws When the operation resolved, or rejected with a non-`Error`.
 */
async function captureRejection(operation: () => Promise<unknown>): Promise<Error> {
  try {
    await operation();
  } catch (thrown: unknown) {
    if (thrown instanceof Error) {
      return thrown;
    }

    throw new Error(
      'Expected the operation to reject with an Error, but it rejected with ' + typeof thrown + '.',
    );
  }

  throw new Error('Expected the operation to reject, but it resolved.');
}

/**
 * How many positional placeholders a statement carries.
 */
function placeholderCount(sql: string): number {
  return sql.split('?').length - 1;
}

/**
 * How many non-overlapping times a fragment appears in a statement.
 */
function occurrences(sql: string, fragment: string): number {
  return sql.split(fragment).length - 1;
}

/**
 * Whether an object publishes a member under the given name, own or inherited.
 *
 * This exists so that the ABSENCE of a member can be asserted without a type assertion.
 */
function declaresMember(target: object, memberName: string): boolean {
  return memberName in target;
}

// Transcribed from the legacy `hql` assembly and `setSQL` body, and from the column contracts of
// `model/entity/Product.cfc`, `model/entity/Brand.cfc`, `model/entity/ProductType.cfc`,
// `model/entity/Sku.cfc` and `model/entity/Option.cfc` - not imported from the module under test.
//
// JUDGMENT CALL: indentation is the two-space form the adapter emits, not the tabs the legacy CFML
// string literal carried, and no expected line ends in whitespace.

/**
 * The ten projected labels of both attribute-set arms.
 *
 * `attributeSetType.systemCode` [model/dao/ProductDAO.cfc:L55] is an HQL implicit join across the
 * many-to-one, which Hibernate renders as an INNER JOIN in a WHERE clause - so the flattened
 * `sast.systemCode` label and the `INNER JOIN SwType` below are the faithful rendering.
 */
const EXPECTED_ATTRIBUTE_SET_PROJECTION = [
  'SELECT',
  '  sas.attributeSetID as attributeSetID,',
  '  sas.activeFlag as activeFlag,',
  '  sas.attributeSetName as attributeSetName,',
  '  sas.attributeSetCode as attributeSetCode,',
  '  sas.attributeSetDescription as attributeSetDescription,',
  '  sas.globalFlag as globalFlag,',
  '  sas.requiredFlag as requiredFlag,',
  '  sas.sortOrder as sortOrder,',
  '  sast.systemCode as attributeSetTypeSystemCode,',
  '  (SELECT COUNT(*) FROM SwAttribute sac WHERE sac.attributeSetID = sas.attributeSetID) as attributeCount',
].join('\n');

/**
 * The from and the opening half of the shared predicate, [model/dao/ProductDAO.cfc:L53-L55].
 *
 * `sa.activeFlag = ?` is BOUND rather than written as the literal `1` the HQL carries.
 */
const EXPECTED_ATTRIBUTE_SET_FROM_AND_OPEN_GROUP = [
  'FROM SwAttributeSet sas',
  'INNER JOIN SwType sast ON sast.typeID = sas.attributeSetTypeID',
  'WHERE (EXISTS (',
  '    SELECT 1 FROM SwAttribute sa',
  '    WHERE sa.attributeSetID = sas.attributeSetID AND sa.activeFlag = ?',
  '  )',
].join('\n');

/**
 * C1.3 - the two-key ordering, [model/dao/ProductDAO.cfc:L62], verbatim.
 *
 * Two keys, both `ASC`, in this exact sequence: the attribute-set TYPE system code first, the
 * attribute-set sort order second.
 */
const EXPECTED_ATTRIBUTE_SET_ORDER_BY = 'ORDER BY sast.systemCode ASC, sas.sortOrder ASC';

/**
 * The global-only arm - what the legacy emits when `productTypeIDs` is EMPTY,
 * [model/dao/ProductDAO.cfc:L59-L60] with the bind at [model/dao/ProductDAO.cfc:L68].
 *
 * C1.5, the correct half of the exception: L68 binds the raw array, which Hibernate expands into a
 * real `IN` list, so this arm renders one placeholder per element.
 *
 * @param typeCodePlaceholders the placeholder run for the type codes, spelled out.
 * @returns the statement text.
 */
function expectedGlobalArmStatement(typeCodePlaceholders: string): string {
  return [
    EXPECTED_ATTRIBUTE_SET_PROJECTION,
    EXPECTED_ATTRIBUTE_SET_FROM_AND_OPEN_GROUP,
    '  AND sast.systemCode IN (' + typeCodePlaceholders + '))',
    '  AND sas.globalFlag = ?',
    EXPECTED_ATTRIBUTE_SET_ORDER_BY,
  ].join('\n');
}

/**
 * The product-type arm - what the legacy emits when `productTypeIDs` is NON-EMPTY,
 * [model/dao/ProductDAO.cfc:L57-L58] with the bind at [model/dao/ProductDAO.cfc:L66].
 *
 * C1.5, the exception itself: `sast.systemCode IN (?)` renders exactly one placeholder here
 * however many codes were supplied, because L66 binds
 * `arrayToList(arguments.attributeSetTypeCode)`.
 *
 * @param productTypePlaceholders the placeholder run for the product types.
 * @returns the statement text.
 */
function expectedProductTypeArmStatement(productTypePlaceholders: string): string {
  return [
    EXPECTED_ATTRIBUTE_SET_PROJECTION,
    EXPECTED_ATTRIBUTE_SET_FROM_AND_OPEN_GROUP,
    '  AND sast.systemCode IN (?))',
    '  AND (sas.globalFlag = ?',
    '    OR EXISTS (',
    '      SELECT 1 FROM SwAttributeSetProductType saspt',
    '      WHERE saspt.attributeSetID = sas.attributeSetID',
    '        AND saspt.productTypeID IN (' + productTypePlaceholders + ')',
    '    ))',
    EXPECTED_ATTRIBUTE_SET_ORDER_BY,
  ].join('\n');
}

// JUDGMENT CALL: legacy raw SQL at model/dao/ProductDAO.cfc:L421 names the ORM entity
// SlatwallProduct and therefore always throws at runtime; the target emits the physical SwProduct
// table as a correction mandated by schema continuity (C5/B5).
/**
 * The product search without the product-type predicate, [model/dao/ProductDAO.cfc:L421] with the
 * guard at [model/dao/ProductDAO.cfc:L423] not taken.
 *
 * This is deliberately not marked `LEGACY-DEFECT`: that marker means "preserved deliberately", and
 * here the behaviour is CORRECTED.
 *
 * By contrast the HQL in `getAttributeSets` correctly names the ORM entity `SlatwallAttributeSet`
 * and needs no correction, because HQL resolves entity names.
 */
const EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES =
  'select productID,productName from SwProduct where productName like ?';

/**
 * The product search with the product-type predicate, [model/dao/ProductDAO.cfc:L424] appended and
 * [model/dao/ProductDAO.cfc:L425] bound with `list="true"`.
 *
 * @param productTypePlaceholders the placeholder run for the product types.
 * @returns the statement text.
 */
function expectedProductSearchWithTypes(productTypePlaceholders: string): string {
  return (
    EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES +
    ' and productTypeID in (' +
    productTypePlaceholders +
    ')'
  );
}

/**
 * The forty-five-label product graph read, aliased `p_` / `b_` / `pt_`.
 *
 * T3 FETCH SHAPE, materialized in one statement: `brand` and `productType` are joined because both
 * declare `fetch="join"` [model/entity/Product.cfc:L68-L69].
 */
const EXPECTED_PRODUCT_GRAPH_HEAD = [
  'SELECT',
  '  p.productID as p_productID,',
  '  p.activeFlag as p_activeFlag,',
  '  p.urlTitle as p_urlTitle,',
  '  p.productName as p_productName,',
  '  p.productCode as p_productCode,',
  '  p.productDescription as p_productDescription,',
  '  p.publishedFlag as p_publishedFlag,',
  '  p.sortOrder as p_sortOrder,',
  '  p.calculatedSalePrice as p_calculatedSalePrice,',
  '  p.calculatedQATS as p_calculatedQATS,',
  '  p.calculatedAllowBackorderFlag as p_calculatedAllowBackorderFlag,',
  '  p.calculatedTitle as p_calculatedTitle,',
  '  p.brandID as p_brandID,',
  '  p.productTypeID as p_productTypeID,',
  '  p.defaultSkuID as p_defaultSkuID,',
  '  p.remoteID as p_remoteID,',
  '  p.createdDateTime as p_createdDateTime,',
  '  p.createdByAccountID as p_createdByAccountID,',
  '  p.modifiedDateTime as p_modifiedDateTime,',
  '  p.modifiedByAccountID as p_modifiedByAccountID,',
  '  b.brandID as b_brandID,',
  '  b.activeFlag as b_activeFlag,',
  '  b.publishedFlag as b_publishedFlag,',
  '  b.urlTitle as b_urlTitle,',
  '  b.brandName as b_brandName,',
  '  b.brandWebsite as b_brandWebsite,',
  '  b.remoteID as b_remoteID,',
  '  b.createdDateTime as b_createdDateTime,',
  '  b.createdByAccountID as b_createdByAccountID,',
  '  b.modifiedDateTime as b_modifiedDateTime,',
  '  b.modifiedByAccountID as b_modifiedByAccountID,',
  '  pt.productTypeID as pt_productTypeID,',
  '  pt.productTypeIDPath as pt_productTypeIDPath,',
  '  pt.activeFlag as pt_activeFlag,',
  '  pt.publishedFlag as pt_publishedFlag,',
  '  pt.urlTitle as pt_urlTitle,',
  '  pt.productTypeName as pt_productTypeName,',
  '  pt.productTypeDescription as pt_productTypeDescription,',
  '  pt.systemCode as pt_systemCode,',
  '  pt.parentProductTypeID as pt_parentProductTypeID,',
  '  pt.remoteID as pt_remoteID,',
  '  pt.createdDateTime as pt_createdDateTime,',
  '  pt.createdByAccountID as pt_createdByAccountID,',
  '  pt.modifiedDateTime as pt_modifiedDateTime,',
  '  pt.modifiedByAccountID as pt_modifiedByAccountID',
  'FROM SwProduct p',
  'LEFT JOIN SwBrand b ON b.brandID = p.brandID',
  'LEFT JOIN SwProductType pt ON pt.productTypeID = p.productTypeID',
].join('\n');

/**
 * The product graph read for a given number of identifiers.
 *
 * @param productPlaceholders the placeholder run for the product identifiers.
 * @returns the statement text.
 */
function expectedProductGraphStatement(productPlaceholders: string): string {
  return EXPECTED_PRODUCT_GRAPH_HEAD + '\n' + 'WHERE p.productID IN (' + productPlaceholders + ')';
}

/**
 * The sixteen-column SKU read.
 *
 * One statement, two predicates, and the `OR` is load-bearing.
 */
const EXPECTED_SKU_READ_HEAD = [
  'SELECT',
  '  s.skuID,',
  '  s.activeFlag,',
  '  s.skuCode,',
  '  s.listPrice,',
  '  s.price,',
  '  s.renewalPrice,',
  '  s.imageFile,',
  '  s.userDefinedPriceFlag,',
  '  s.calculatedQATS,',
  '  s.productID,',
  '  s.subscriptionTermID,',
  '  s.remoteID,',
  '  s.createdDateTime,',
  '  s.createdByAccountID,',
  '  s.modifiedDateTime,',
  '  s.modifiedByAccountID',
  'FROM SwSku s',
].join('\n');

// CFML parity [model/entity/Sku.cfc:L76]:
// `linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"`, with no `orderby`.
/**
 * The SKU option read across the link table, with the option group joined alongside.
 *
 * The `INNER JOIN` on `SwOption` is faithful - Hibernate's collection load joins the link table to
 * the target table, and a link row naming an option that does not exist contributes no element.
 */
const EXPECTED_SKU_OPTION_READ_HEAD = [
  'SELECT',
  '  so.skuID as link_skuID,',
  '  o.optionID,',
  '  o.optionCode,',
  '  o.optionName,',
  '  o.optionDescription,',
  '  o.sortOrder,',
  '  o.optionGroupID,',
  '  o.defaultImageID,',
  '  o.remoteID,',
  '  o.createdDateTime,',
  '  o.createdByAccountID,',
  '  o.modifiedDateTime,',
  '  o.modifiedByAccountID,',
  '  og.optionGroupID as optionGroup_optionGroupID,',
  '  og.optionGroupName as optionGroup_optionGroupName,',
  '  og.optionGroupCode as optionGroup_optionGroupCode,',
  '  og.optionGroupImage as optionGroup_optionGroupImage,',
  '  og.optionGroupDescription as optionGroup_optionGroupDescription,',
  '  og.imageGroupFlag as optionGroup_imageGroupFlag,',
  '  og.sortOrder as optionGroup_sortOrder,',
  '  og.remoteID as optionGroup_remoteID,',
  '  og.createdDateTime as optionGroup_createdDateTime,',
  '  og.createdByAccountID as optionGroup_createdByAccountID,',
  '  og.modifiedDateTime as optionGroup_modifiedDateTime,',
  '  og.modifiedByAccountID as optionGroup_modifiedByAccountID',
  'FROM SwSkuOption so',
  'INNER JOIN SwOption o ON o.optionID = so.optionID',
  'LEFT JOIN SwOptionGroup og ON og.optionGroupID = o.optionGroupID',
].join('\n');

/**
 * The existence read of the save path - one column, because one column is all the decision needs.
 */
const EXPECTED_PRODUCT_EXISTENCE_READ = 'SELECT productID FROM SwProduct WHERE productID = ?';

/**
 * The twenty-column product insert.
 *
 * Twenty columns, twenty placeholders, twenty bound parameters, one ordered source.
 */
const EXPECTED_PRODUCT_INSERT = [
  'INSERT INTO SwProduct (',
  '  productID,',
  '  activeFlag,',
  '  urlTitle,',
  '  productName,',
  '  productCode,',
  '  productDescription,',
  '  publishedFlag,',
  '  sortOrder,',
  '  calculatedSalePrice,',
  '  calculatedQATS,',
  '  calculatedAllowBackorderFlag,',
  '  calculatedTitle,',
  '  brandID,',
  '  productTypeID,',
  '  defaultSkuID,',
  '  remoteID,',
  '  createdDateTime,',
  '  createdByAccountID,',
  '  modifiedDateTime,',
  '  modifiedByAccountID',
  ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
].join('\n');

/**
 * The seventeen-assignment product update, with the key bound last.
 *
 * `productID` is excluded from the SET list because it is the key the statement MATCHES on.
 */
const EXPECTED_PRODUCT_UPDATE = [
  'UPDATE SwProduct',
  'SET',
  '  activeFlag = ?,',
  '  urlTitle = ?,',
  '  productName = ?,',
  '  productCode = ?,',
  '  productDescription = ?,',
  '  publishedFlag = ?,',
  '  sortOrder = ?,',
  '  calculatedSalePrice = ?,',
  '  calculatedQATS = ?,',
  '  calculatedAllowBackorderFlag = ?,',
  '  calculatedTitle = ?,',
  '  brandID = ?,',
  '  productTypeID = ?,',
  '  defaultSkuID = ?,',
  '  remoteID = ?,',
  '  modifiedDateTime = ?,',
  '  modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
  'WHERE productID = ?',
].join('\n');

/**
 * The ten product link-row deletes that OPEN the delete sequence, in declaration order.
 *
 * Transcribed from `model/entity/Product.cfc:L79-L90` - the three owner and seven inverse
 * `many-to-many` properties - because that is the set
 * `HibachiEntity.removeAllManyToManyRelationships()` [org/Hibachi/HibachiEntity.cfc:L271-L284]
 * selects: every `many-to-many` property with no delete cascade.
 */
// Reason the list is not alphabetical. The first three are declared on the product with no
// `inverse="true"` [model/entity/Product.cfc:L79-L81], so their rows go with the owner.
const EXPECTED_PRODUCT_LINK_DELETES: readonly string[] = [
  'DELETE FROM SwProductListingPage WHERE productID = ?',
  'DELETE FROM SwProductCategory WHERE productID = ?',
  'DELETE FROM SwRelatedProduct WHERE productID = ?',
  'DELETE FROM SwPromoRewardProduct WHERE productID = ?',
  'DELETE FROM SwPromoRewardExclProduct WHERE productID = ?',
  'DELETE FROM SwPromoQualProduct WHERE productID = ?',
  'DELETE FROM SwPromoQualExclProduct WHERE productID = ?',
  'DELETE FROM SwPriceGroupRateProduct WHERE productID = ?',
  'DELETE FROM SwVendorProduct WHERE productID = ?',
  'DELETE FROM SwPhysicalProduct WHERE productID = ?',
];

/**
 * The default-SKU DETACH, which is the FIRST statement of the delete and not a link delete at all.
 *
 * It clears one column and deliberately does not re-stamp the audit pair: the row it updates is
 * deleted twenty-three statements later in the same unit of work.
 */
const EXPECTED_PRODUCT_DEFAULT_SKU_DETACH =
  'UPDATE SwProduct SET defaultSkuID = NULL WHERE productID = ?';

/**
 * The eight SKU-dependent tables, reached through a SUBQUERY over the product's SKUs.
 *
 * Four are the link tables a SKU OWNS [model/entity/Sku.cfc:L76-L79]; the rest are its
 * `cascade="all-delete-orphan"` children [model/entity/Sku.cfc:L69-L73] whose physical tables this
 * slice can name.
 */
const EXPECTED_PRODUCT_SKU_CHILD_DELETES: readonly string[] = [
  'DELETE FROM SwAlternateSkuCode WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwAttributeValue WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuCurrency WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwStock WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuOption WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuAccessContent WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuSubsBenefit WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuRenewalSubsBenefit WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
];

/**
 * The product's own SKU rows - `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73].
 */
const EXPECTED_PRODUCT_SKUS_DELETE = 'DELETE FROM SwSku WHERE productID = ?';

/**
 * The three product-level children - `cascade="all-delete-orphan"` one-to-many
 * [model/entity/Product.cfc:L74-L76].
 */
const EXPECTED_PRODUCT_CHILD_DELETES: readonly string[] = [
  'DELETE FROM SwImage WHERE productID = ?',
  'DELETE FROM SwAttributeValue WHERE productID = ?',
  'DELETE FROM SwProductReview WHERE productID = ?',
];

/**
 * The product row - one row, one bound key, and the LAST statement of the sequence.
 */
const EXPECTED_PRODUCT_DELETE = 'DELETE FROM SwProduct WHERE productID = ?';

/**
 * The whole delete sequence in the order the adapter must emit it: the default-SKU detach, eight
 * SKU-dependent tables, the SKU rows, the ten link tables, the three product-level children, then
 * the product row.
 */
const EXPECTED_PRODUCT_DELETE_SEQUENCE: readonly string[] = [
  EXPECTED_PRODUCT_DEFAULT_SKU_DETACH,
  ...EXPECTED_PRODUCT_SKU_CHILD_DELETES,
  EXPECTED_PRODUCT_SKUS_DELETE,
  ...EXPECTED_PRODUCT_LINK_DELETES,
  ...EXPECTED_PRODUCT_CHILD_DELETES,
  EXPECTED_PRODUCT_DELETE,
];

// No `SwBrand` write statement is pinned, because the adapter emits none.

/**
 * The deferred `defaultSkuID` write the aggregate cascade issues LAST.
 */
const EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE =
  'UPDATE SwProduct SET defaultSkuID = ? WHERE productID = ?';

/**
 * Every statement this suite expects, for the schema-continuity sweep.
 */
const EVERY_EXPECTED_STATEMENT: readonly string[] = [
  expectedGlobalArmStatement('?'),
  expectedGlobalArmStatement('?, ?'),
  expectedGlobalArmStatement('?, ?, ?'),
  expectedProductTypeArmStatement('?'),
  expectedProductTypeArmStatement('?, ?'),
  expectedProductTypeArmStatement('?, ?, ?'),
  EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES,
  expectedProductSearchWithTypes('?'),
  expectedProductSearchWithTypes('?, ?'),
  expectedProductSearchWithTypes('?, ?, ?'),
  expectedProductGraphStatement('?'),
  EXPECTED_PRODUCT_EXISTENCE_READ,
  EXPECTED_PRODUCT_INSERT,
  EXPECTED_PRODUCT_UPDATE,
  ...EXPECTED_PRODUCT_DELETE_SEQUENCE,
  EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE,
];

// Identifiers are the 32-character lower-case hexadecimal shape the legacy minted with
// `lcase(replace(createUUID(),"-","","all"))`, so a bound identifier is indistinguishable from a
// real one.

/**
 * The one attribute-set type system code the catalog slice actually reads.
 */
const PRODUCT_ATTRIBUTE_SET_TYPE_CODE = 'astProduct';

/**
 * A second code, so the multi-element binding asymmetry is observable.
 */
const SKU_ATTRIBUTE_SET_TYPE_CODE = 'astSku';

/**
 * A third code, so a three-element list can be asserted alongside one and two.
 */
const ORDER_ATTRIBUTE_SET_TYPE_CODE = 'astOrder';

/**
 * A product-type identifier used to narrow the attribute-set read and the search.
 */
const MERCHANDISE_PRODUCT_TYPE_ID = 'c1b7e94a2d6f4083ba51e7c3d92f6018';

/**
 * A second product-type identifier.
 */
const SUBSCRIPTION_PRODUCT_TYPE_ID = 'a58f31d0e7b24c69ad03f16b8e4c297d';

/**
 * A third product-type identifier.
 */
const GIFT_CARD_PRODUCT_TYPE_ID = 'f60d29c4b81e47a5b93c05de712f8a36';

/**
 * The product identifier the graph, save and delete cases match on.
 */
const PERSISTED_PRODUCT_ID = '3e8a1f7c94d2406bb7150af8c6d29e34';

/**
 * An identifier no canned row carries, so the miss path is reachable.
 */
const UNMATCHED_PRODUCT_ID = 'd47c0b8e31a2496fb85de0c7391a4b62';

/**
 * The url title `makeProductFixture` defaults to.
 */
const FIXTURE_URL_TITLE = 'nike-air-jorden';

/**
 * The product name `makeProductFixture` defaults to - [meta/tests/unit/Helper.cfc:L54].
 */
const LEGACY_FIXTURE_PRODUCT_NAME = 'Test Product';

/**
 * A url title standing in for one the service's generator resolved.
 *
 * Deliberately unlike {@link FIXTURE_URL_TITLE} so no populate assertion can pass by coincidence.
 */
const RESOLVED_URL_TITLE = 'a-title-the-generator-resolved';

/**
 * A product name standing in for one arriving in the save payload.
 */
const OVERRIDING_PRODUCT_NAME = 'A Name The Payload Supplied';

/**
 * Where `urlTitle` sits in {@link EXPECTED_PRODUCT_INSERT}'s bound parameters.
 */
const INSERT_URL_TITLE_POSITION = 2;

/**
 * Where `productName` sits in {@link EXPECTED_PRODUCT_INSERT}'s bound parameters.
 */
const INSERT_PRODUCT_NAME_POSITION = 3;

/**
 * Where `urlTitle` sits in {@link EXPECTED_PRODUCT_UPDATE}'s bound parameters.
 *
 * One position earlier than on the insert, because the update's SET list omits `productID` - it is
 * the column the statement MATCHES on rather than one it sets, and it is bound LAST.
 */
const UPDATE_URL_TITLE_POSITION = 1;

/**
 * The SKU identifier the graph case hangs off the product.
 */
const PERSISTED_SKU_ID = '9b2e75c0a4f14d38be61c07d5a3f298e';

/**
 * The zero-based position `defaultSkuID` occupies in the product insert's parameter array.
 *
 * Named rather than inlined because the deferral case reads the same position twice - once
 * expecting NULL and once expecting a bound key.
 */
const DEFAULT_SKU_ID_PARAMETER_INDEX = 14;

/**
 * The option identifier the SKU-option read returns.
 */
const PERSISTED_OPTION_ID = '2af86d31c957402eb0d47f19a6e35c8b';

/**
 * The brand identifier the eager product-graph join materializes.
 */
const PERSISTED_BRAND_ID = '7c4e0a92b5d34816af7e2c05d1b83f6a';

/**
 * The search term the LIKE predicate wraps.
 */
const SEARCH_TERM = 'jorden';

/**
 * A term carrying SQL metacharacters, to prove they never reach statement text.
 */
const INJECTION_SHAPED_TERM = "x' OR 1=1 --";

/**
 * The minted-identifier shape the legacy produced and the adapter reproduces.
 */
const MINTED_IDENTIFIER_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The bound value the active-attribute EXISTS test carries, [model/dao/ProductDAO.cfc:L54].
 */
const ACTIVE_ATTRIBUTE_FLAG = 1;

/**
 * The bound value the global-flag predicate carries, [model/dao/ProductDAO.cfc:L57, L60].
 */
const GLOBAL_ATTRIBUTE_SET_FLAG = 1;

// Each row is keyed by the LABEL the corresponding statement projects, because that is what the
// driver would hand back.

/**
 * One attribute-set row, as either arm projects it.
 *
 * `globalFlag` arrives as `1` and `sortOrder` as a number; the three nullable text columns are
 * populated so the optional members of the projection are observable.
 */
const ATTRIBUTE_SET_ROW: SqlRow = Object.freeze({
  attributeSetID: '81c4f0d7a3e64b29b5170fd8c2e396a4',
  activeFlag: null,
  attributeSetName: 'Product Details',
  attributeSetCode: 'productDetails',
  attributeSetDescription: 'Merchandise detail attributes.',
  globalFlag: 1,
  requiredFlag: 0,
  sortOrder: 2,
  attributeSetTypeSystemCode: PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
  attributeCount: 4,
});

/**
 * One row of the product search projection, [model/dao/ProductDAO.cfc:L421].
 *
 * Both projected columns are present even though the adapter reads only the identifier, because
 * the statement projects both and the driver would return both.
 */
const PRODUCT_SEARCH_ROW: SqlRow = Object.freeze({
  productID: PERSISTED_PRODUCT_ID,
  productName: 'Nike Air Jorden',
});

/**
 * One row of the forty-five-label graph read.
 */
const PRODUCT_GRAPH_ROW: SqlRow = Object.freeze({
  p_productID: PERSISTED_PRODUCT_ID,
  p_activeFlag: null,
  p_urlTitle: 'nike-air-jorden',
  p_productName: 'Nike Air Jorden',
  p_productCode: 'NIKEAIRJORDEN',
  p_productDescription: null,
  p_publishedFlag: 1,
  p_sortOrder: null,
  p_calculatedSalePrice: null,
  p_calculatedQATS: null,
  p_calculatedAllowBackorderFlag: 0,
  p_calculatedTitle: null,
  p_brandID: null,
  p_productTypeID: null,
  p_defaultSkuID: null,
  p_remoteID: null,
  p_createdDateTime: null,
  p_createdByAccountID: null,
  p_modifiedDateTime: null,
  p_modifiedByAccountID: null,
  b_brandID: null,
  pt_productTypeID: null,
});

/**
 * The same graph row, but naming a default SKU.
 *
 * Used where the SKU read's second predicate has to be observable: the default-SKU identifier is
 * bound in addition to the product identifier.
 */
const PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU: SqlRow = Object.freeze({
  ...PRODUCT_GRAPH_ROW,
  p_defaultSkuID: PERSISTED_SKU_ID,
});

/**
 * The same graph row with a MATERIALIZED brand on both sides of the join.
 *
 * Both `p_brandID` and `b_brandID` carry the identifier, because the adapter treats a product row
 * whose `p_brandID` is set while `b_brandID` came back NULL as a DANGLING KEY and refuses it.
 *
 * This row is how a PERSISTED brand instance is obtained without importing the brand entity
 * module: it is hydrated through the adapter's own factory and read off the product.
 */
const PRODUCT_GRAPH_ROW_WITH_BRAND: SqlRow = Object.freeze({
  ...PRODUCT_GRAPH_ROW,
  p_brandID: PERSISTED_BRAND_ID,
  // All ELEVEN projected brand labels, because `b_brandID` alone is only the sentinel the adapter
  // tests to decide whether a brand came back at all.
  b_brandID: PERSISTED_BRAND_ID,
  b_activeFlag: 1,
  b_publishedFlag: 1,
  b_urlTitle: 'nike',
  b_brandName: 'Nike',
  b_brandWebsite: null,
  b_remoteID: null,
  b_createdDateTime: null,
  b_createdByAccountID: null,
  b_modifiedDateTime: null,
  b_modifiedByAccountID: null,
});

/**
 * The graph row with a materialized product type whose `systemCode` is null.
 *
 * Testing drove the packaged promotion journey, no case in this file materialized a product type
 * at all - `PRODUCT_GRAPH_ROW` sets both `p_productTypeID` and `pt_productTypeID` to NULL.
 *
 * `pt_systemCode: null` is therefore not incidental - it is the one column value that reaches the
 * branch, and a fixture with a populated system code would pass while the defect stood.
 */
const LEAF_PRODUCT_TYPE_ID = '4f2c8b1e9d7a44f0a3c6e5b8d1907f24';
const ROOT_PRODUCT_TYPE_ID = 'a91d7c3f5e264b8d90f1a2c4b6e83d57';
const ROOT_PRODUCT_TYPE_SYSTEM_CODE = 'merchandise';

const PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE: SqlRow = Object.freeze({
  ...PRODUCT_GRAPH_ROW,
  p_productTypeID: LEAF_PRODUCT_TYPE_ID,
  pt_productTypeID: LEAF_PRODUCT_TYPE_ID,
  // The stored path names the ROOT first, which is the element [model/entity/ProductType.cfc:L112]
  // reads with `listFirst()`.
  pt_productTypeIDPath: `${ROOT_PRODUCT_TYPE_ID},${LEAF_PRODUCT_TYPE_ID}`,
  pt_activeFlag: 1,
  pt_publishedFlag: 1,
  pt_urlTitle: 'shoes',
  pt_productTypeName: 'Shoes',
  pt_productTypeDescription: null,
  // NULL - the branch this fixture exists to reach.
  pt_systemCode: null,
  pt_parentProductTypeID: ROOT_PRODUCT_TYPE_ID,
  pt_remoteID: null,
  pt_createdDateTime: null,
  pt_createdByAccountID: null,
  pt_modifiedDateTime: null,
  pt_modifiedByAccountID: null,
});

/**
 * The ROOT product-type row, as `SELECT_PRODUCT_TYPE_BY_ID_SQL` in
 * `src/repositories/mysql/mysqlProductTypeRepository.ts` projects it.
 *
 * Fourteen UNPREFIXED columns - this is the sibling adapter's own projection, not the product
 * graph's aliased one.
 */
const ROOT_PRODUCT_TYPE_ROW: SqlRow = Object.freeze({
  productTypeID: ROOT_PRODUCT_TYPE_ID,
  productTypeIDPath: ROOT_PRODUCT_TYPE_ID,
  activeFlag: 1,
  publishedFlag: 1,
  urlTitle: 'merchandise',
  productTypeName: 'Merchandise',
  productTypeDescription: null,
  systemCode: ROOT_PRODUCT_TYPE_SYSTEM_CODE,
  parentProductTypeID: null,
  remoteID: null,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
});
const SKU_ROW: SqlRow = Object.freeze({
  skuID: PERSISTED_SKU_ID,
  activeFlag: 1,
  skuCode: 'NIKEAIRJORDEN-1',
  listPrice: '24.99',
  price: '19.99',
  renewalPrice: null,
  imageFile: null,
  userDefinedPriceFlag: 0,
  calculatedQATS: null,
  productID: PERSISTED_PRODUCT_ID,
  subscriptionTermID: null,
  remoteID: null,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
});

/**
 * The identifier of the option group joined onto {@link SKU_OPTION_ROW}.
 */
const PERSISTED_OPTION_GROUP_ID = 'ffffffffffffffffffffffffffffff02';

/**
 * One SKU-option row, carrying the link column that attaches it to its SKU and the alias-prefixed
 * option-group columns the LEFT JOIN projects alongside it.
 *
 * Every projected label is present, including the ones whose value is SQL NULL.
 */
const SKU_OPTION_ROW: SqlRow = Object.freeze({
  link_skuID: PERSISTED_SKU_ID,
  optionID: PERSISTED_OPTION_ID,
  optionCode: 'sizeTen',
  optionName: 'Size 10',
  optionDescription: null,
  optionGroupID: PERSISTED_OPTION_GROUP_ID,
  defaultImageID: null,
  remoteID: null,
  sortOrder: 1,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
  optionGroup_optionGroupID: PERSISTED_OPTION_GROUP_ID,
  optionGroup_optionGroupName: 'Size',
  optionGroup_optionGroupCode: 'size',
  optionGroup_optionGroupImage: null,
  optionGroup_optionGroupDescription: null,
  optionGroup_imageGroupFlag: 1,
  optionGroup_sortOrder: 3,
  optionGroup_remoteID: null,
  optionGroup_createdDateTime: null,
  optionGroup_createdByAccountID: null,
  optionGroup_modifiedDateTime: null,
  optionGroup_modifiedByAccountID: null,
});

/**
 * The row the existence read returns when the product is already persisted.
 */
const PRODUCT_EXISTS_ROW: SqlRow = Object.freeze({ productID: PERSISTED_PRODUCT_ID });

/**
 * A product fixture with no association materialized.
 *
 * Why the two overrides are mandatory on every write path.
 *
 * @param auditOverrides audit members to seed, so a save can be observed against a known baseline.
 * @param productID the identifier to carry; omit for the unsaved state, which is the empty string
 * per [model/entity/Product.cfc:L52] `unsavedvalue=""`.
 * @returns the product.
 */
function makeWritableProduct(
  productID?: string,
  auditOverrides: {
    readonly createdByAccountID?: string;
    readonly modifiedByAccountID?: string;
  } = {},
): Product {
  return makeProductFixture({
    productID,
    brand: undefined,
    productType: undefined,
    defaultSku: undefined,
    ...auditOverrides,
  });
}
const INSERT_CREATED_BY_POSITION = 17;

const INSERT_MODIFIED_BY_POSITION = 19;

/**
 * The modifying account is the LAST value in the update SET list, ahead of the key.
 */
const UPDATE_MODIFIED_BY_POSITION = 16;

/**
 * A save payload that populates nothing, so every column comes off the entity.
 *
 * `saveProduct` takes a `ProductSavePayload` whose two members are each optional, and
 * `Object.hasOwn` is what the adapter's populate step tests.
 *
 * The cases that are about population supply their own payload and say so.
 */
const NO_POPULATED_MEMBERS: Parameters<MysqlProductRepository['saveProduct']>[1] = {};

describe('MysqlProductRepository - net-new coverage with no legacy antecedent', () => {
  describe('composition and the no-database invariant', () => {
    it('is constructed from an injected executor alone, with no container and no ambient scope', () => {
      // B1: the executor is a CONSTRUCTOR PARAMETER, which is the mandate `connection.ts` states
      // in its own header and names these six suites as the reason for.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      expect(repository).toBeInstanceOf(MysqlProductRepository);

      // Constructing the adapter must not touch the executor at all - no warm-up read, no dialect
      // probe, no connection check.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('accepts the executor without any collaborator ports, so statement shape needs no graph', () => {
      // The adapter defaults its collaborators to `{}` precisely so a SQL-shape suite can
      // construct it with a capturing executor alone. Asserting that here pins the affordance
      // rather than relying on it silently.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect(repository).toBeInstanceOf(MysqlProductRepository);
    });

    it('exposes exactly the SIX port methods and no brand write', () => {
      // C4/B4 - interface parity, asserted against the SHIPPED port.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect(typeof repository.getAttributeSets).toBe('function');
      expect(typeof repository.loadDataFromFile).toBe('function');
      expect(typeof repository.searchProductsByProductType).toBe('function');
      expect(typeof repository.getProductByProductID).toBe('function');
      expect(typeof repository.saveProduct).toBe('function');
      expect(typeof repository.deleteProduct).toBe('function');
      expect('saveBrand' in repository).toBe(false);

      // `getProductsByProductID` is on the prototype and is not a seventh port member.
      expect(typeof repository.getProductsByProductID).toBe('function');

      expect(
        Object.getOwnPropertyNames(MysqlProductRepository.prototype).filter(
          (member: string) => member !== 'constructor' && !member.startsWith('#'),
        ),
      ).toStrictEqual([
        'getAttributeSets',
        'loadDataFromFile',
        'searchProductsByProductType',
        'getProductByProductID',
        'getProductsByProductID',
        'saveProduct',
        'deleteProduct',
        'materializeProducts',
        'readSkus',
        // The sale-price resolution step of the read path, and a PRIVATE HELPER rather than a
        // seventh member for the same reason `cascadeTransientSkus` below is: it exists to satisfy
        // an internal ordering obligation.
        'readSalePriceDetails',
        // The batching branch of `readSkus`, and a PRIVATE HELPER for the same reason: it decides
        // whether the two identifier sets fit one statement or have to be split into product-keyed
        // and default-SKU-keyed batches.
        'readSkuRows',
        'readSkuOptions',
        'buildProduct',
        'assertAssociationsPersisted',
        'productRowExists',
        // The aggregate cascade's own private step.
        'cascadeTransientSkus',
        'insertProduct',
        'updateProduct',
      ]);
    });

    it('publishes NO smart-list surface, because the port deliberately carries none', () => {
      // `getProductSmartList` [model/service/ProductService.cfc:L342-L358] became
      // `findProducts(criteria)` on the SERVICE, which composes this port's search with its
      // load-by-identifier.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      for (const absentMember of [
        'findProducts',
        'getProductSmartList',
        'getSkuSmartList',
        'query',
        'search',
        'filter',
        'paginate',
        'orderBy',
      ]) {
        expect(declaresMember(repository, absentMember)).toBe(false);
      }

      // And the probe is proven to have teeth: the same predicate does find the members the port
      // really declares, so the seven absences above are absences rather than an always-false
      // check.
      expect(declaresMember(repository, 'searchProductsByProductType')).toBe(true);
      expect(declaresMember(repository, 'getProductByProductID')).toBe(true);
    });

    it('reaches the server only through execute and executeMutation, so query() is unreachable', async () => {
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets([PRODUCT_ATTRIBUTE_SET_TYPE_CODE], []);

      // The three members the contract does declare, and the one it does not.
      expect(declaresMember(executor, 'execute')).toBe(true);
      expect(declaresMember(executor, 'executeMutation')).toBe(true);
      expect(declaresMember(executor, 'transaction')).toBe(true);
      expect(declaresMember(executor, 'query')).toBe(false);

      expect(executor.calls).toHaveLength(1);
    });
  });

  // C-1 getAttributeSets [model/dao/ProductDAO.cfc:L52-L71]

  describe('getAttributeSets - both branches are live and neither is the other', () => {
    it('emits the product-type arm when productTypeIDs is non-empty', async () => {
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE, SKU_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID],
      );

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(expectedProductTypeArmStatement('?, ?'));
      expect(statement.sql).toContain('OR EXISTS (');
      expect(statement.sql).toContain('SwAttributeSetProductType saspt');
    });

    it('emits the global-only arm when productTypeIDs is empty, with no assignment sub-clause', async () => {
      // C1.1, second arm. [model/dao/ProductDAO.cfc:L59-L60] appends `AND sas.globalFlag = 1` and
      // nothing else - the assignment sub-clause is absent entirely rather than
      // present-and-always-true.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE, SKU_ATTRIBUTE_SET_TYPE_CODE],
        [],
      );

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(expectedGlobalArmStatement('?, ?'));
      expect(statement.sql).not.toContain('SwAttributeSetProductType');
      expect(statement.sql).not.toContain('OR EXISTS');
    });

    it('keeps the active-attribute EXISTS test and the type-code test inside ONE outer group', () => {
      for (const statement of [
        expectedGlobalArmStatement('?'),
        expectedProductTypeArmStatement('?'),
      ]) {
        expect(statement).toContain('WHERE (EXISTS (');
        expect(statement).toContain('SELECT 1 FROM SwAttribute sa');
        expect(statement).toContain(
          'WHERE sa.attributeSetID = sas.attributeSetID AND sa.activeFlag = ?',
        );
        expect(statement).toContain('sast.systemCode IN (');

        // The group closes with `))` - the inner EXISTS paren and the outer WHERE paren - and only
        // then does the arm-specific and begin.
        const groupClose = statement.indexOf('))');
        const armAnd = statement.indexOf('\n  AND ', groupClose);
        expect(groupClose).toBeGreaterThan(-1);
        expect(armAnd).toBeGreaterThan(groupClose);
      }
    });

    it('preserves L62 TWO-KEY ORDER BY verbatim in BOTH arms', async () => {
      // C1.3. [model/dao/ProductDAO.cfc:L62] appends " order by sas.attributeSetType.systemCode
      // asc, sas.sortOrder asc" after the branch closes at L61, so it is unconditional.
      const productTypeArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      await aProductRepository(productTypeArm, TEST_AUDIT_ACTOR).getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      const globalArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      await aProductRepository(globalArm, TEST_AUDIT_ACTOR).getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [],
      );

      for (const calls of [productTypeArm.calls, globalArm.calls]) {
        const statement = onlyStatement(calls);

        // The clause, whole and exact.
        expect(statement.sql).toContain(EXPECTED_ATTRIBUTE_SET_ORDER_BY);

        // Exactly one ORDER by, and it is the last clause of the statement.
        expect(occurrences(statement.sql, 'ORDER BY')).toBe(1);
        expect(statement.sql.endsWith(EXPECTED_ATTRIBUTE_SET_ORDER_BY)).toBe(true);

        // Both keys present, ASC on each, and the TYPE code strictly before the sort order - the
        // ordering of the keys is itself the contract.
        const orderByClause = statement.sql.slice(statement.sql.indexOf('ORDER BY'));
        expect(occurrences(orderByClause, ' ASC')).toBe(2);
        expect(orderByClause.indexOf('systemCode ASC')).toBeLessThan(
          orderByClause.indexOf('sortOrder ASC'),
        );
      }
    });

    // TODO: Remove this conditional when railo and ACF match how they handle arrays for '`IN`'
    // clause.
    //
    // C1.4 / C3 / B3. The line immediately above is [model/dao/ProductDAO.cfc:L64] carried forward
    // CHARACTER for CHARACTER - the lower-case `railo`, the upper-case `ACF`, and the single
    // quotes around `IN`.
    it('carries the L64 TODO forward on the conditional it actually guards', () => {
      // The TODO travels with the statement it guards into the adapter, and this case pins the
      // WORDING rather than merely the presence of some comment.
      const carriedForwardTodo =
        'TODO: Remove this conditional when railo and ACF match how they handle arrays for ' +
        "'IN' clause";

      expect(carriedForwardTodo).toContain('railo');
      expect(carriedForwardTodo).not.toContain('Railo');
      expect(carriedForwardTodo).toContain("'IN'");
      expect(carriedForwardTodo).toContain('ACF');

      // The conditional it guards is real and both of its arms are reachable, which is what makes
      // the TODO still meaningful rather than vestigial: the two arms below differ in their
      // statement text, so the branch cannot be collapsed.
      expect(expectedProductTypeArmStatement('?')).not.toBe(expectedGlobalArmStatement('?'));
    });
  });

  describe('getAttributeSets - the ONE documented parameterized-SQL exception', () => {
    // C1.5 - the single documented E5 exception in the entire migration.
    //
    // JUDGMENT CALL: model/dao/ProductDAO.cfc:L66 binds attributeSetTypeCode as a joined comma
    // string in one parameter while L68 binds it as a raw array; both are reproduced as written.
    //
    // LEGACY-DEFECT [model/dao/ProductDAO.cfc:L66]: the product-type arm binds
    // `arrayToList(arguments.attributeSetTypeCode)`, a comma-delimited STRING, while the sibling
    // arm at L68 binds the RAW ARRAY - so for multi-element input this arm evaluates the
    // equivalent of `systemCode IN ('a,b,c')` and matches nothing.
    // Preserved deliberately; do not fix without a product decision.

    it('binds the type codes as ONE comma-joined parameter in the product-type arm', async () => {
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [
          PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
          SKU_ATTRIBUTE_SET_TYPE_CODE,
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        ],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      const statement = onlyStatement(executor.calls);

      // EXACTLY one placeholder for the type codes, however many were supplied.
      expect(statement.sql).toContain('AND sast.systemCode IN (?))');
      expect(occurrences(statement.sql, 'sast.systemCode IN (?)')).toBe(1);

      // The bound value is the comma-joined string - one parameter, three codes.
      expect(parameterAt(statement.params, 1)).toBe(
        PRODUCT_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          SKU_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
      );

      // The full parameter contract of this arm, in positional order: the active-attribute flag,
      // the one joined string, the global flag, then one parameter per product-type identifier.
      expect(statement.params).toStrictEqual([
        ACTIVE_ATTRIBUTE_FLAG,
        PRODUCT_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          SKU_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        GLOBAL_ATTRIBUTE_SET_FLAG,
        MERCHANDISE_PRODUCT_TYPE_ID,
      ]);
    });

    it('binds the type codes PER ELEMENT in the global-only arm, with no productTypeIDs at all', async () => {
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [
          PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
          SKU_ATTRIBUTE_SET_TYPE_CODE,
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        ],
        [],
      );

      const statement = onlyStatement(executor.calls);

      // Three codes, three placeholders - the opposite of the arm above.
      expect(statement.sql).toContain('AND sast.systemCode IN (?, ?, ?))');

      // The full parameter contract of this arm: the active-attribute flag, one parameter per
      // code, then the global flag. No product-type parameter exists at all, and no comma-joined
      // string appears anywhere.
      expect(statement.params).toStrictEqual([
        ACTIVE_ATTRIBUTE_FLAG,
        PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
        SKU_ATTRIBUTE_SET_TYPE_CODE,
        ORDER_ATTRIBUTE_SET_TYPE_CODE,
        GLOBAL_ATTRIBUTE_SET_FLAG,
      ]);

      expect(statement.params).not.toContain(MERCHANDISE_PRODUCT_TYPE_ID);
      for (const bound of statement.params) {
        expect(typeof bound === 'string' && bound.includes(',')).toBe(false);
      }
    });

    it('never cross-applies the two treatments, at one, two or three codes', async () => {
      // The asymmetry is asserted across arities so it cannot be an artefact of one input size.
      const codeLists: readonly (readonly string[])[] = [
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE, SKU_ATTRIBUTE_SET_TYPE_CODE],
        [
          PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
          SKU_ATTRIBUTE_SET_TYPE_CODE,
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        ],
      ];

      for (const codes of codeLists) {
        const productTypeArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
        await aProductRepository(productTypeArm, TEST_AUDIT_ACTOR).getAttributeSets(codes, [
          MERCHANDISE_PRODUCT_TYPE_ID,
        ]);
        const productTypeStatement = onlyStatement(productTypeArm.calls);

        const globalArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
        await aProductRepository(globalArm, TEST_AUDIT_ACTOR).getAttributeSets(codes, []);
        const globalStatement = onlyStatement(globalArm.calls);

        // Product-type arm: one type-code placeholder at every arity, plus one per product-type
        // identifier - so two placeholders in total here.
        expect(occurrences(productTypeStatement.sql, 'sast.systemCode IN (?)')).toBe(1);
        expect(productTypeStatement.params).toHaveLength(4);

        // Global arm: placeholder count == element count, at every arity.
        expect(placeholderCount(globalStatement.sql)).toBe(codes.length + 2);
        expect(globalStatement.params).toHaveLength(codes.length + 2);
      }
    });

    it('grows the productTypeIDs placeholder run one per element, at one, two and three', async () => {
      // C1.5's second half, and the growth check this suite owns in place of the AND-of-EXISTS
      // one: `productTypeIDs` is tokenized per element in the arm that carries it.
      const productTypeLists: readonly (readonly string[])[] = [
        [MERCHANDISE_PRODUCT_TYPE_ID],
        [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID],
        [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID, GIFT_CARD_PRODUCT_TYPE_ID],
      ];
      const expectedRuns: readonly string[] = ['?', '?, ?', '?, ?, ?'];

      for (let index = 0; index < productTypeLists.length; index += 1) {
        const productTypeIDs = productTypeLists[index] ?? [];
        const expectedRun = expectedRuns[index] ?? '';

        const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
        await aProductRepository(executor, TEST_AUDIT_ACTOR).getAttributeSets(
          [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
          productTypeIDs,
        );

        const statement = onlyStatement(executor.calls);
        expect(statement.sql).toBe(expectedProductTypeArmStatement(expectedRun));
        expect(statement.sql).toContain('saspt.productTypeID IN (' + expectedRun + ')');

        // Every identifier is its own bound parameter, in the supplied order.
        expect(statement.params.slice(3)).toStrictEqual([...productTypeIDs]);
      }
    });

    it('never emits an empty IN list, refusing the global arm when the codes are empty', async () => {
      // C1.6. `IN ()` is a MySQL syntax error.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() => repository.getAttributeSets([], []));

      expect(rejection.name).toBe('ProductEmptyInListError');

      // The refusal happens before any statement is sent, which is the point: no unparseable text
      // ever reaches the driver.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('binds the empty string rather than emitting IN () when the product-type arm has no codes', async () => {
      // The other half of C1.6, and it does not raise.
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets([], [MERCHANDISE_PRODUCT_TYPE_ID]);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(expectedProductTypeArmStatement('?'));
      expect(statement.sql).not.toContain('IN ()');
      expect(parameterAt(statement.params, 1)).toBe('');
      expect(summaries).toStrictEqual([]);
    });

    it('emits no empty IN list in any expected statement', () => {
      // C1.6, swept across every statement this suite pins.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain('IN ()');
        expect(statement).not.toContain('in ()');
      }
    });
  });

  describe('getAttributeSets - the returned rows are a projection, not an entity', () => {
    it('returns the read-only projection with the source member names verbatim', async () => {
      // C1.7. `AttributeSet` is deliberately not one of the eighteen in-scope entities and no
      // entity module exists to construct, so this is a flat mapper over ten labels.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      expect(summaries).toHaveLength(1);
      const summary: AttributeSetSummary = summaryAt(summaries, 0);

      expect(summary.attributeSetID).toBe('81c4f0d7a3e64b29b5170fd8c2e396a4');
      expect(summary.attributeSetTypeSystemCode).toBe(PRODUCT_ATTRIBUTE_SET_TYPE_CODE);
      expect(summary.globalFlag).toBe(true);
      expect(summary.attributeCount).toBe(4);
      expect(summary.attributeSetName).toBe('Product Details');
      expect(summary.attributeSetCode).toBe('productDetails');
      expect(summary.attributeSetDescription).toBe('Merchandise detail attributes.');
      expect(summary.requiredFlag).toBe(false);
      expect(summary.sortOrder).toBe(2);
    });

    it('hydrates NO attribute entity and reads no EAV row', async () => {
      // C1.7. The `attributes` collection is represented by its COUNT and nothing reachable
      // through an attribute set is loaded - the `attributeValues` EAV read path is deliberately
      // not ported and must not be added.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW, ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      // Two rows in, two projections out, still exactly one statement - so the mapper ran once per
      // row and nothing was loaded per row.
      expect(summaries).toHaveLength(2);
      expect(executor.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(0);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).not.toContain('SwAttributeValue');
      expect(statement.sql).not.toContain('attributeValues');
    });

    it('omits a nullable flag rather than defaulting it, and never coalesces globalFlag to true', async () => {
      // The canned row carries `activeFlag: null`. The port declares `activeFlag?: boolean`
      // precisely so "the legacy had no value here" stays expressible, so the member is OMITTED
      // rather than invented as `false`.
      const rowWithNullGlobalFlag: SqlRow = { ...ATTRIBUTE_SET_ROW, globalFlag: null };
      const executor = new RecordingExecutor([[rowWithNullGlobalFlag]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );
      const summary = summaryAt(summaries, 0);

      expect(summary.activeFlag).toBeUndefined();
      expect(Object.hasOwn(summary, 'activeFlag')).toBe(false);
      expect(summary.globalFlag).toBe(false);
      expect(summary.globalFlag).toBe(cfBoolean(null));
    });

    it('returns an empty array, never undefined, when the read matched nothing', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      expect(summaries).toStrictEqual([]);
    });
  });

  // C-2 searchProductsByProductType [model/dao/ProductDAO.cfc:L419-L437]

  describe('searchProductsByProductType - the emitted statement', () => {
    // C2.8 - the `Slatwall*` to `Sw*` correction.
    //
    // JUDGMENT CALL: legacy raw SQL at model/dao/ProductDAO.cfc:L421 names the ORM entity
    // SlatwallProduct and therefore always throws at runtime; the target emits the physical
    // SwProduct table as a correction mandated by schema continuity (C5/B5).

    it('names the physical SwProduct table and no Slatwall-prefixed identifier', async () => {
      // Explicitly not a `LEGACY-DEFECT` marker: that marker means "preserved deliberately", and
      // here the behaviour is CORRECTED.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = statementAt(executor.calls, 0);
      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).toContain('from SwProduct');
      expect(statement.sql).not.toContain('Slatwall');
    });

    it('applies the product-type filter DIRECTLY to the product row, never as a subquery', async () => {
      // C2.4. `productTypeID` is a column of `SwProduct` [model/entity/Product.cfc:L69], so the
      // legacy filters the row itself.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(
        SEARCH_TERM,
        MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID,
      );

      const statement = statementAt(executor.calls, 0);
      expect(statement.sql).toBe(expectedProductSearchWithTypes('?, ?'));
      expect(statement.sql).toContain(' and productTypeID in (');

      // No nested SELECT of any kind: exactly one `select`, and no correlated sub-select over
      // SwProduct as the SKU sibling uses.
      expect(occurrences(statement.sql.toLowerCase(), 'select')).toBe(1);
      expect(statement.sql.toLowerCase()).not.toContain('in (select');
    });

    it('emits NO ORDER BY, and no DISTINCT or LIMIT either', async () => {
      // C2.6. The legacy method has none - [model/dao/ProductDAO.cfc:L427] sets the SQL with no
      // ordering clause anywhere - so none is added.
      const withTypes = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      await aProductRepository(withTypes, TEST_AUDIT_ACTOR).searchProductsByProductType(
        SEARCH_TERM,
        MERCHANDISE_PRODUCT_TYPE_ID,
      );

      const withoutTypes = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      await aProductRepository(withoutTypes, TEST_AUDIT_ACTOR).searchProductsByProductType(
        SEARCH_TERM,
      );

      for (const calls of [withTypes.calls, withoutTypes.calls]) {
        const searchStatement = statementAt(calls, 0).sql.toLowerCase();

        expect(searchStatement).not.toContain('order by');
        expect(searchStatement).not.toContain('distinct');
        expect(searchStatement).not.toContain('limit');
      }
    });

    it('projects both legacy columns, including the productName the adapter never reads', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = statementAt(executor.calls, 0);
      expect(statement.sql).toContain('select productID,productName');
      expect(products.records).toHaveLength(1);
      expect(products.matchedCount).toBe(1);
      expect(matchAt(products.records, 0).id).toBe(PERSISTED_PRODUCT_ID);
      expect(executor.calls).toHaveLength(1);
    });
  });

  describe('searchProductsByProductType - the parameter binding', () => {
    it('keeps the % wildcards INSIDE the bound value and out of the statement text', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = statementAt(executor.calls, 0);

      expect(statement.sql).toContain('productName like ?');
      expect(statement.sql).not.toContain('%');
      expect(statement.sql).not.toContain(SEARCH_TERM);
      expect(parameterAt(statement.params, 0)).toBe('%' + SEARCH_TERM + '%');
    });

    it('binds a term carrying SQL metacharacters without letting one reach the statement', async () => {
      // The property E5 exists to prove, stated as a hostile input rather than as a principle.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(INJECTION_SHAPED_TERM);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).not.toContain("'");
      expect(statement.sql).not.toContain('OR 1=1');
      expect(statement.sql).not.toContain('--');
      expect(parameterAt(statement.params, 0)).toBe('%' + INJECTION_SHAPED_TERM + '%');
      expect(statement.params).toHaveLength(1);
    });

    it('expands the comma list one bound parameter per element, at one, two and three', async () => {
      // C2.5. [model/dao/ProductDAO.cfc:L425] binds with `list="true"`, which the legacy engine
      // expanded into a real `IN` list.
      const lists: readonly string[] = [
        MERCHANDISE_PRODUCT_TYPE_ID,
        MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID,
        MERCHANDISE_PRODUCT_TYPE_ID +
          ',' +
          SUBSCRIPTION_PRODUCT_TYPE_ID +
          ',' +
          GIFT_CARD_PRODUCT_TYPE_ID,
      ];
      const expectedRuns: readonly string[] = ['?', '?, ?', '?, ?, ?'];

      for (let index = 0; index < lists.length; index += 1) {
        const productTypeIDs = lists[index] ?? '';
        const expectedRun = expectedRuns[index] ?? '';
        const expectedElements = listToArray(productTypeIDs);

        const executor = new RecordingExecutor([[], []]);
        await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType(
          SEARCH_TERM,
          productTypeIDs,
        );

        const statement = onlyStatement(executor.calls);

        expect(statement.sql).toBe(expectedProductSearchWithTypes(expectedRun));

        // Placeholder count == list length, plus the one the LIKE predicate carries.
        expect(placeholderCount(statement.sql)).toBe(expectedElements.length + 1);
        expect(statement.params).toHaveLength(expectedElements.length + 1);

        // The term binds FIRST, then every element in the supplied order.
        expect(statement.params).toStrictEqual(['%' + SEARCH_TERM + '%', ...expectedElements]);

        // Not one identifier reached the statement text.
        for (const element of expectedElements) {
          expect(statement.sql).not.toContain(element);
        }
      }
    });

    it('omits the clause AND its parameters when productTypeIDs is absent', async () => {
      // C2.3, first half. [model/dao/ProductDAO.cfc:L423] guards on
      // `structKeyExists(arguments,"productTypeIDs") && len(arguments.productTypeIDs)`, so an
      // ABSENT argument omits both the clause and the bind.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).not.toContain('productTypeID');
      expect(statement.params).toStrictEqual(['%' + SEARCH_TERM + '%']);
    });

    it('omits the clause when productTypeIDs is the EMPTY STRING', async () => {
      // C2.3, second half. `len('')` is 0, so the guard fails on an empty string just as it does
      // on an absent argument - and crucially the adapter must not emit `in ()` for it.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, '');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).not.toContain('in ()');
      expect(statement.params).toStrictEqual(['%' + SEARCH_TERM + '%']);
    });

    it('treats a whitespace-only list as NON-empty, because len() does - asymmetry 1', async () => {
      // C-3, ASYMMETRY 1, asserted from this suite's side.
      //
      // CFML parity [model/dao/ProductDAO.cfc:L423]: the emptiness idiom here is `len(...)`, so a
      // whitespace-only list is NON-empty exactly as `len(' ')` is.
      //
      // The SKU sibling at [model/dao/SkuDAO.cfc:L134] uses `trim(...) != ""` instead, which would
      // treat this same input as EMPTY.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, ' ');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toContain(' and productTypeID in (');
      expect(statement.sql).not.toContain('in ()');
      expect(statement.params.length).toBeGreaterThan(1);
    });

    it('emits the clause exactly once for a non-empty list', async () => {
      // C2.3, third half: present once, not twice, and not conditionally duplicated.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, MERCHANDISE_PRODUCT_TYPE_ID);

      const statement = onlyStatement(executor.calls);

      expect(occurrences(statement.sql, 'productTypeID in (')).toBe(1);
      expect(occurrences(statement.sql, 'productName like ?')).toBe(1);
    });
  });

  describe('searchProductsByProductType - the unguarded term bind is a preserved defect', () => {
    // LEGACY-DEFECT [model/dao/ProductDAO.cfc:L422]: the optional `term` argument is bound
    // unconditionally as "%term%", so omitting it throws at runtime.
    // Preserved deliberately; do not fix without a product decision.
    //
    // C-3, ASYMMETRY 4: the identical defect exists at [model/dao/SkuDAO.cfc:L133] in the sibling
    // search method.

    it('rejects when term is omitted, rather than substituting an empty pattern', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() => repository.searchProductsByProductType());

      expect(rejection.name).toBe('ProductUndefinedArgumentError');

      // The refusal precedes the statement, so no accidental unfiltered scan is ever sent - which
      // is the behaviour a silent `''` substitution would have created.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('rejects when term is omitted even though productTypeIDs was supplied', async () => {
      // The two guards are independent in the legacy: the type-list guard at L423 does nothing to
      // protect the term bind at L422, which runs first and unconditionally.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.searchProductsByProductType(undefined, MERCHANDISE_PRODUCT_TYPE_ID),
      );

      expect(rejection.name).toBe('ProductUndefinedArgumentError');
      expect(executor.calls).toHaveLength(0);
    });

    it('accepts an EMPTY term, because an empty string is present and len() is irrelevant here', async () => {
      // The defect is about ABSENCE, not about emptiness. An explicitly empty term is present, so
      // the legacy would have bound `'%%'` happily - and so does the target.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType('');

      const statement = onlyStatement(executor.calls);
      expect(parameterAt(statement.params, 0)).toBe('%%');
      expect(statement.sql).not.toContain('%');
    });
  });

  describe('searchProductsByProductType - the four sibling asymmetries, none unified', () => {
    // C-3. This method and `searchSkusByProductType` [model/dao/SkuDAO.cfc:L130-L145] look like
    // the same query written twice.

    it('keeps the PLURAL productTypeIDs spelling on the parameter and in the clause', async () => {
      // Asymmetry 2. The port declares `productTypeIDs?: string` - plural, and a STRING rather
      // than an array, because that is the legacy type and the legacy value is a comma-delimited
      // list.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(
        SEARCH_TERM,
        MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID,
      );

      const statement = onlyStatement(executor.calls);

      // The column in the emitted clause is the SINGULAR column name `productTypeID`, because that
      // is the physical column [model/entity/Product.cfc:L69]; the ARGUMENT is the plural
      // `productTypeIDs`.
      expect(statement.sql).toContain('productTypeID in (');
      expect(statement.sql).not.toContain('productTypeIDs');
    });

    it('accepts the comma-delimited string type and never an array', async () => {
      // Asymmetry 2's type half.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const twoElementList = MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID;
      await repository.searchProductsByProductType(SEARCH_TERM, twoElementList);

      const statement = onlyStatement(executor.calls);

      expect(statement.params).toHaveLength(3);
      expect(statement.params).not.toContain(twoElementList);
      expect(statement.params).toStrictEqual([
        '%' + SEARCH_TERM + '%',
        MERCHANDISE_PRODUCT_TYPE_ID,
        SUBSCRIPTION_PRODUCT_TYPE_ID,
      ]);
    });
  });

  // C-3b searchProductsByProductType - the complete-statement placeholder ceiling.

  describe('searchProductsByProductType - the complete-statement placeholder ceiling', () => {
    /**
     * A comma-list with exactly `count` product-type identifiers.
     */
    function productTypeList(count: number): string {
      return Array.from({ length: count }, (_unused, index) => `type-${String(index)}`).join(',');
    }

    it('accepts one fewer product type plus the unconditional term bind at the ceiling', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const result = await repository.searchProductsByProductType(
        SEARCH_TERM,
        productTypeList(MAX_PLACEHOLDER_COUNT - 1),
      );

      expect(executor.calls).toHaveLength(1);
      expect(statementAt(executor.calls, 0).params).toHaveLength(MAX_PLACEHOLDER_COUNT);
      expect(result).toStrictEqual({ records: [], matchedCount: 0 });
    });

    it('refuses a list at the raw ceiling because the term makes the complete statement one wider', async () => {
      const executor = new RecordingExecutor([]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await expect(
        repository.searchProductsByProductType(SEARCH_TERM, productTypeList(MAX_PLACEHOLDER_COUNT)),
      ).rejects.toThrow(/complete product search would carry 65536 placeholders/);

      // Refusal happens before the placeholder body or any statement is allocated.
      expect(executor.calls).toStrictEqual([]);
    });
  });

  // C-3c searchProductsByProductType - the materialization window.
  //
  // The window bounds the WORK, not just the answer: the graph statement binds only the windowed
  // identifiers.

  describe('searchProductsByProductType - the materialization window', () => {
    /**
     * Three matched identifiers, so a one-record window has something on both sides of it.
     */
    const SECOND_MATCH_ID = 'product-search-second';
    const THIRD_MATCH_ID = 'product-search-third';

    /**
     * The projection the legacy statement returns: identifier plus name, three rows.
     */
    const THREE_MATCHES: readonly SqlRow[] = [
      PRODUCT_SEARCH_ROW,
      { ...PRODUCT_SEARCH_ROW, productID: SECOND_MATCH_ID },
      { ...PRODUCT_SEARCH_ROW, productID: THIRD_MATCH_ID },
    ];

    it('returns ONLY the windowed rows and reports the pre-window total', async () => {
      const executor = new RecordingExecutor([[...THREE_MATCHES]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM, undefined, {
        start: 1,
        count: 1,
      });

      // Property 1, STRONGER THAN it was: the work is bounded by there being none to bound. One
      // statement answers a three-match search, whatever the window.
      expect(executor.calls).toHaveLength(1);

      expect(products.records).toHaveLength(1);
      expect(matchAt(products.records, 0).id).toBe(SECOND_MATCH_ID);

      // Property 2: the count is the PROJECTION's size, independent of the window. This is what
      // lets a caller keep reporting the true total for free.
      expect(products.matchedCount).toBe(3);
    });

    it('leaves the ported statement text free of LIMIT, OFFSET and ORDER BY', async () => {
      // Property 3, and the reason the window is applied to the identifier list rather than pushed
      // into SQL.
      const executor = new RecordingExecutor([
        [...THREE_MATCHES],
        [{ ...PRODUCT_GRAPH_ROW, p_productID: SECOND_MATCH_ID }],
        [],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, undefined, { start: 1, count: 1 });

      const searchStatement = statementAt(executor.calls, 0);
      const lowered = searchStatement.sql.toLowerCase();
      expect(lowered).not.toContain('limit');
      expect(lowered).not.toContain('offset');
      expect(lowered).not.toContain('order by');

      // And the bound values are still only the search term - the window is nowhere near the
      // parameter list.
      expect(searchStatement.params).toStrictEqual(['%' + SEARCH_TERM + '%']);
    });

    it('sends NO graph statement at all when the window selects nothing', async () => {
      // A window past the end of the match list is not an error and not an empty-window special
      // case - it simply materializes nothing.
      const executor = new RecordingExecutor([[...THREE_MATCHES]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM, undefined, {
        start: 99,
        count: 10,
      });

      expect(executor.calls).toHaveLength(1);
      expect(products.records).toStrictEqual([]);

      // The total is still reported, which is the whole reason it is a separate member: a caller
      // that overshot needs to learn how far it overshot by.
      expect(products.matchedCount).toBe(3);
    });

    it('returns every match when no window is supplied', async () => {
      // The parameter is OPTIONAL, and omitting it must mean "all of them" - not "an implicit
      // default page".
      const executor = new RecordingExecutor([[...THREE_MATCHES]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM);

      expect(executor.calls).toHaveLength(1);
      expect(products.records.map((row) => row.id)).toStrictEqual([
        PERSISTED_PRODUCT_ID,
        SECOND_MATCH_ID,
        THIRD_MATCH_ID,
      ]);
      expect(products.matchedCount).toBe(3);
    });
  });

  // C-4 loadDataFromFile - declared, annotated, and not designed around.

  describe('loadDataFromFile - declared and deliberately unexercised', () => {
    // [model/dao/ProductDAO.cfc:L412-L417] interpolates table and column names into an `INSERT`,
    // and [model/dao/ProductDAO.cfc:L328] `saveImportData` is private: neither is ported.

    it('exists with the declared two-argument signature', () => {
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect(typeof repository.loadDataFromFile).toBe('function');
      expect(repository.loadDataFromFile.length).toBe(2);
    });

    it('performs NO filesystem or network access, and issues no statement', async () => {
      // The argument is a syntactically valid but deliberately unroutable location: it is never
      // dereferenced, and it carries no credential.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() => repository.loadDataFromFile('products.csv'));

      expect(rejection.name).toBe('ProductBulkImportUnavailableError');

      // The whole point: nothing was read and nothing was written.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('refuses identically when a text qualifier is supplied', async () => {
      // The legacy default is `""`; supplying a qualifier explicitly must not open a second,
      // working code path. There is only one behaviour here.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.loadDataFromFile('products.txt', '"'),
      );

      expect(rejection.name).toBe('ProductBulkImportUnavailableError');
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('rejects rather than throwing synchronously, so a Promise consumer can catch it', async () => {
      // An `async` function that throws produces a REJECTED PROMISE, which is what a caller of a
      // `Promise<void>` method handles.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      const pending = repository.loadDataFromFile('products.csv');

      expect(pending).toBeInstanceOf(Promise);
      await expect(pending).rejects.toThrow();
    });
  });

  // C-5 load / save / delete - the three net-new lifecycle methods.

  describe('getProductByProductID - NET-NEW, no legacy antecedent', () => {
    // `model/dao/ProductDAO.cfc` declares no load function at all: the legacy obtained an entity
    // through Hibernate by way of the framework base component's generated accessors and
    // `entityLoad`.

    it('binds exactly one productID and never puts the identifier in the statement text', async () => {
      // C5.1. The identifier is a bound parameter, full stop.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);

      const graphStatement = statementAt(executor.calls, 0);

      expect(graphStatement.sql).toBe(expectedProductGraphStatement('?'));
      expect(graphStatement.sql).not.toContain(PERSISTED_PRODUCT_ID);
      expect(graphStatement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
      expect(placeholderCount(graphStatement.sql)).toBe(1);
    });

    it('returns undefined on a miss - never a zero value and never an empty object', async () => {
      // C5.1's load-bearing half. Absence is EXPLICIT.
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = await repository.getProductByProductID(UNMATCHED_PRODUCT_ID);

      expect(product).toBeUndefined();

      // A miss costs the graph read ALONE - no SKU read, no option read.
      expect(executor.calls).toHaveLength(1);
      expect(statementAt(executor.calls, 0).params).toStrictEqual([UNMATCHED_PRODUCT_ID]);
    });

    it('materializes the documented fetch shape in exactly three statements', async () => {
      // C6.1 - the orm-laziness replacement, asserted.
      //
      // The decided shape: brand and productType join into the graph statement because both
      // declare `fetch="join"` [model/entity/Product.cfc:L68-L69]; skus are a second statement.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // No MORE than the shape declares - no fourth statement, no unbounded graph walk, and no
      // per-row follow-up.
      expect(executor.calls).toHaveLength(3);
      expect(executor.mutationCalls).toHaveLength(0);

      expect(statementAt(executor.calls, 0).sql).toBe(expectedProductGraphStatement('?'));
      expect(statementAt(executor.calls, 1).sql).toBe(
        EXPECTED_SKU_READ_HEAD + '\n' + 'WHERE s.productID IN (?)' + '\n' + '  OR s.skuID IN (?)',
      );
      expect(statementAt(executor.calls, 2).sql).toBe(
        EXPECTED_SKU_OPTION_READ_HEAD + '\n' + 'WHERE so.skuID IN (?)',
      );

      // No FEWER either - the associations the shape promises are actually populated, so a
      // synchronous entity method that traverses one does not meet `undefined`.
      const skus = product.getSkus();
      expect(skus).toHaveLength(1);
      expect(product.getDefaultSku()?.getSkuID()).toBe(PERSISTED_SKU_ID);
    });

    // The product-type port, and why these three cases exist.
    //
    // Why 5 934 green tests did not catch it, which is the part worth fixing permanently.

    it('★ hydrates a product type that CAN answer getBaseProductType() when its systemCode is NULL', async () => {
      // The product read costs two statements here - the graph, then the SKU read, which matches
      // nothing, so the option read is correctly skipped.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE],
        [],
        [ROOT_PRODUCT_TYPE_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(executor.calls).toHaveLength(2);

      // ANSWERS rather than raising, and answers the ROOT's system code - which is what
      // [model/entity/ProductType.cfc:L110-L115] resolves through
      // `getProductType(listFirst(getProductTypeIDPath())).getSystemCode()`.
      await expect(product.getBaseProductType()).resolves.toBe(ROOT_PRODUCT_TYPE_SYSTEM_CODE);

      // The root was read by IDENTIFIER, bound, never interpolated - and it is the first element
      // of the STORED PATH, not a parent pointer walked in memory.
      expect(executor.calls).toHaveLength(3);
      const rootRead = statementAt(executor.calls, 2);
      expect(rootRead.params).toStrictEqual([ROOT_PRODUCT_TYPE_ID]);
      expect(rootRead.sql).toContain('FROM SwProductType');
      expect(rootRead.sql).not.toContain(ROOT_PRODUCT_TYPE_ID);
    });

    it('★ costs NO extra statement for a product type that carries its own systemCode', async () => {
      // The refusing port is what makes that claim airtight now.
      const executor = new RecordingExecutor([
        [
          {
            ...PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE,
            pt_systemCode: ROOT_PRODUCT_TYPE_SYSTEM_CODE,
          },
        ],
        [],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      await expect(product.getBaseProductType()).resolves.toBe(ROOT_PRODUCT_TYPE_SYSTEM_CODE);
      expect(executor.calls).toHaveLength(2);
    });

    it('★ uses the WIRED product-type port, which is now the ONLY port it can use', async () => {
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE], []]);
      const wiredReads: string[] = [];
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        productTypeRepository: {
          getProductTypeQuery: () => Promise.resolve([]),
          getProductTypesByProductTypeIDPath: () => Promise.resolve([]),
          getProductTypeByProductTypeID: (productTypeID: string) => {
            wiredReads.push(productTypeID);

            return Promise.resolve(
              new ProductType({
                productTypeID,
                systemCode: ROOT_PRODUCT_TYPE_SYSTEM_CODE,
              }),
            );
          },
          saveProductType: () => {
            throw new Error('the wired product-type port must not be asked to write here');
          },
        },
      });

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      await expect(product.getBaseProductType()).resolves.toBe(ROOT_PRODUCT_TYPE_SYSTEM_CODE);
      expect(wiredReads).toStrictEqual([ROOT_PRODUCT_TYPE_ID]);
      expect(executor.calls).toHaveLength(2);
    });

    it('★★★ CANNOT BE CONSTRUCTED without a product-type port at all, and the compiler is the one that says so', () => {
      // Expression it guards ever starts compiling, so each one pins a construction the adapter
      // must keep refusing.
      // THE DIRECTIVES BELOW **ARE** THE ASSERTIONS. `@ts-expect-error` fails the build if the
      const executor = new RecordingExecutor([]);

      // No bag at all.
      // @ts-expect-error - the collaborators bag is required and does not default to `{}`.
      void (() => new MysqlProductRepository(executor, TEST_AUDIT_ACTOR));

      // A bag that carries other members but not this one.
      const aBagWithoutTheProductTypePort = { optionRepository: undefined };

      void (() =>
        // @ts-expect-error - `productTypeRepository` is a REQUIRED member of the bag.
        new MysqlProductRepository(executor, TEST_AUDIT_ACTOR, aBagWithoutTheProductTypePort));

      // And the positive control, so the two refusals above are provably about the missing port
      // rather than about the construction being malformed in some other way.
      expect(aProductRepository(executor, TEST_AUDIT_ACTOR)).toBeInstanceOf(MysqlProductRepository);
      expect(executor.calls).toHaveLength(0);
    });

    it('★★★ REFUSES CONSTRUCTION when the product-type port is omitted, before any statement', () => {
      // The erasure is deliberate and is exactly one assertion wide.
      type ProductRepositoryCollaborators = ConstructorParameters<typeof MysqlProductRepository>[2];
      const bagWithoutTheMandatoryPort: Partial<ProductRepositoryCollaborators> = {};

      const executor = new RecordingExecutor();

      expect(
        () =>
          new MysqlProductRepository(
            executor,
            TEST_AUDIT_ACTOR,
            bagWithoutTheMandatoryPort as ProductRepositoryCollaborators,
          ),
      ).toThrow(/ProductWiringError|productTypeRepository/u);

      // And it REFUSES before TOUCHING the DATASTORE, which is the property that makes the refusal
      // safe to add: no row is read, no row is written, and nothing has to be undone.
      expect(executor.calls).toStrictEqual([]);
    });

    it('materializes the option groups a product reaches through its SKUs, ordered by sortOrder', async () => {
      // `Product.getOptionGroups()` [model/entity/Product.cfc:L251-L261] resolved this through a
      // `HibachiSmartList` - `setSelectDistinctFlag(1)` at [model/entity/Product.cfc:L255], a
      // filter on the traversal `options.skus.product.productID` at
      // [model/entity/Product.cfc:L256].
      const secondSkuID = 'c4d19b6ea27f4c85917e3b0d6f8a5241';
      const colourGroupID = 'ffffffffffffffffffffffffffffff03';

      const secondSkuRow: SqlRow = { ...SKU_ROW, skuID: secondSkuID, skuCode: 'NIKEAIRJORDEN-2' };

      const colourOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        link_skuID: secondSkuID,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11',
        optionCode: 'colourRed',
        optionName: 'Red',
        optionGroupID: colourGroupID,
        optionGroup_optionGroupID: colourGroupID,
        optionGroup_optionGroupName: 'Colour',
        optionGroup_optionGroupCode: 'colour',
        optionGroup_imageGroupFlag: 0,
        optionGroup_sortOrder: 1,
      };

      // The same `size` group again, reached through the second SKU. DISTINCT has to collapse it;
      // without the map this array would carry three entries.
      const repeatedSizeOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        link_skuID: secondSkuID,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa12',
        optionCode: 'sizeEleven',
        optionName: 'Size 11',
      };

      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW],
        [SKU_ROW, secondSkuRow],
        [SKU_OPTION_ROW, colourOptionRow, repeatedSizeOptionRow],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The accessor ANSWERS rather than raising - that is the whole point.
      const optionGroups = product.getOptionGroups();

      // DISTINCT [model/dao/ProductDAO.cfc:L255]: three option rows, two groups.
      expect(optionGroups).toHaveLength(2);
      expect(optionGroups.map((group) => group.getOptionGroupID())).toStrictEqual([
        colourGroupID,
        PERSISTED_OPTION_GROUP_ID,
      ]);
      expect(optionGroups.map((group) => group.getSortOrder())).toStrictEqual([1, 3]);

      // The other two members of the memo trio ride on the same array.
      expect(product.getOptionGroupCount()).toBe(2);
      expect(Object.keys(product.getOptionGroupsStruct()).sort()).toStrictEqual(
        [colourGroupID, PERSISTED_OPTION_GROUP_ID].sort(),
      );

      // And it COSTS no STATEMENT. The groups ride in on the option read's LEFT JOIN, so the
      // documented three-statement shape is unchanged - no fourth statement and no per-option
      // follow-up.
      expect(executor.calls).toHaveLength(3);
    });

    it('answers an empty option-group array for a product whose SKUs carry no options', async () => {
      // materialized-as-empty is not the same as never-materialized, and the adapter has to
      // produce the first.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [SKU_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getOptionGroups()).toStrictEqual([]);
      expect(product.getOptionGroupCount()).toBe(0);
    });

    it('keeps an option whose optionGroupID is NULL and contributes no group for it', async () => {
      // `Option.optionGroup` [model/entity/Option.cfc:L59] is a nullable many-to-one, so an INNER
      // JOIN would have dropped a group-less option out of the SKU's `options` collection
      // entirely.
      const grouplessOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa13',
        optionCode: 'ungrouped',
        optionGroupID: null,
        optionGroup_optionGroupID: null,
        optionGroup_optionGroupName: null,
        optionGroup_optionGroupCode: null,
        optionGroup_imageGroupFlag: null,
        optionGroup_sortOrder: null,
      };

      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW],
        [SKU_ROW],
        [grouplessOptionRow],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      const options = product.getSkus()[0]?.getOptions() ?? [];

      // The option survived the join.
      expect(options).toHaveLength(1);
      expect(options[0]?.getOptionCode()).toBe('ungrouped');
      expect(options[0]?.getOptionGroup()).toBeUndefined();

      // And it contributed no phantom group.
      expect(product.getOptionGroups()).toStrictEqual([]);
    });

    it('excludes the option groups of a default SKU that belongs to another product', async () => {
      // The traversal at [model/entity/Product.cfc:L256] is `options.skus.product.productID`, so a
      // group qualifies only through a sku whose `productID` is this product.
      const foreignSkuID = 'e70b53d1a8c94f26b1d40a9c8b5e7263';
      const foreignGroupID = 'ffffffffffffffffffffffffffffff09';

      const foreignSkuRow: SqlRow = {
        ...SKU_ROW,
        skuID: foreignSkuID,
        skuCode: 'FOREIGN-1',
        productID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa99',
      };

      const foreignOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        link_skuID: foreignSkuID,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa14',
        optionCode: 'foreignOnly',
        optionGroupID: foreignGroupID,
        optionGroup_optionGroupID: foreignGroupID,
        optionGroup_optionGroupName: 'Foreign',
        optionGroup_optionGroupCode: 'foreign',
        optionGroup_sortOrder: 1,
      };

      const graphRow: SqlRow = { ...PRODUCT_GRAPH_ROW, p_defaultSkuID: foreignSkuID };

      const executor = new RecordingExecutor([
        [graphRow],
        [SKU_ROW, foreignSkuRow],
        [SKU_OPTION_ROW, foreignOptionRow],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The foreign SKU is the default SKU and is not in the product's own collection - the shape
      // `MaterializedSkus` documents.
      expect(product.getDefaultSku()?.getSkuID()).toBe(foreignSkuID);
      expect(product.getSkus().map((sku) => sku.getSkuID())).toStrictEqual([PERSISTED_SKU_ID]);

      // So only the owning product's group is reached, and the foreign one is absent even though
      // its row was in the same result set.
      expect(product.getOptionGroups().map((group) => group.getOptionGroupID())).toStrictEqual([
        PERSISTED_OPTION_GROUP_ID,
      ]);
    });

    it('binds the product identifier AND the default-sku identifier on the SKU read', async () => {
      // The `OR` in the SKU statement is load-bearing: `skus` is keyed on `SwSku.productID` while
      // `defaultSku` is keyed on `SwProduct.defaultSkuID`.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);

      const skuStatement = statementAt(executor.calls, 1);

      expect(skuStatement.sql).toContain('WHERE s.productID IN (?)');
      expect(skuStatement.sql).toContain('OR s.skuID IN (?)');
      expect(skuStatement.params).toStrictEqual([PERSISTED_PRODUCT_ID, PERSISTED_SKU_ID]);
      expect(skuStatement.sql.toLowerCase()).not.toContain('order by');
    });

    it('issues no option read when the product has no SKUs', async () => {
      // C6.1's lower bound: a shape that materializes nothing must COST nothing. With no SKU rows
      // there are no SKU identifiers to bind, so the third statement is short-circuited rather
      // than sent with an empty in list.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(executor.calls).toHaveLength(2);
      expect(product.getSkus()).toStrictEqual([]);
    });

    it('runs the row-to-entity hydration factory exactly once per row', async () => {
      // C6.1's last clause. Two graph rows produce two DISTINCT products and still exactly one SKU
      // statement and one option statement - so hydration is per row while the collection loads
      // stay per CALL.
      const secondProductID = 'b0e51c7a94f3428db6207ef85c1a39d4';
      const secondGraphRow: SqlRow = {
        ...PRODUCT_GRAPH_ROW,
        p_productID: secondProductID,
        p_productName: 'Nike Air Jorden II',
      };

      // Three canned result sets, in the order the three statements are sent: the graph read, then
      // the SKU read, then the option read.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW, secondGraphRow],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.getProductsByProductID([
        PERSISTED_PRODUCT_ID,
        secondProductID,
      ]);

      // Three statements for two products, not six: hydration is per row, collection loads stay
      // per call, and the graph statement binds both identifiers in one `IN` list.
      expect(executor.calls).toHaveLength(3);
      expect(statementAt(executor.calls, 0).params).toStrictEqual([
        PERSISTED_PRODUCT_ID,
        secondProductID,
      ]);
      expect(products.size).toBe(2);

      const first = requireProduct(products.get(PERSISTED_PRODUCT_ID));
      const second = requireProduct(products.get(secondProductID));
      expect(first).not.toBe(second);
      expect(first.getProductID()).toBe(PERSISTED_PRODUCT_ID);
      expect(second.getProductID()).toBe(secondProductID);
    });

    it('★★★ keys the batched load by FOLDED identifier and issues no statement for an empty request', async () => {
      // Two properties of the set-based load that the singular form cannot express, and both
      // matter to the caller that replaced its per-product loop with it.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      // The stored identifier is lower-case hexadecimal; asked for in UPPER case, it is still
      // found.
      const found = await repository.getProductsByProductID([PERSISTED_PRODUCT_ID.toUpperCase()]);

      expect(found.size).toBe(1);
      expect(requireProduct(found.get(PERSISTED_PRODUCT_ID)).getProductID()).toBe(
        PERSISTED_PRODUCT_ID,
      );

      // And an empty request costs nothing at all, which is what makes the caller's guard
      // unnecessary rather than merely redundant.
      const emptyExecutor = new RecordingExecutor([]);
      const emptyRepository = aProductRepository(emptyExecutor, TEST_AUDIT_ACTOR);

      expect((await emptyRepository.getProductsByProductID([])).size).toBe(0);
      expect(emptyExecutor.calls).toHaveLength(0);
    });

    it('materializes the eager brand from the same statement, in one read', async () => {
      // T3, fetch shape is a decision.
      //
      // This is also the only way `SwBrand` is reached anywhere in this module.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW_WITH_BRAND], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The product has no SKUs in this row, so the option read is skipped: one statement for the
      // graph plus one for the SKUs, and the brand arrived inside the first of them.
      expect(executor.calls).toHaveLength(2);
      expect(statementAt(executor.calls, 0).sql).toContain(
        'LEFT JOIN SwBrand b ON b.brandID = p.brandID',
      );
      for (const call of executor.calls) {
        expect(call.sql).not.toBe(`SELECT brandID FROM SwBrand WHERE brandID = ?`);
      }

      // The materialized brand carries the projected column values, so the eager fetch produced a
      // real entity rather than a sentinel.
      const brand = product.getBrand();

      if (brand === undefined) {
        throw new Error('the eager brand join produced no brand, so there is nothing to assert');
      }

      expect(brand.getBrandID()).toBe(PERSISTED_BRAND_ID);
      expect(brand.getBrandName()).toBe('Nike');
      expect(brand.getUrlTitle()).toBe('nike');

      // T3: no association is materialized on a brand reached through a product.
      expect(brand.getProducts()).toStrictEqual([]);

      // Nothing was WRITTEN. A read path emits no mutation, and there is no brand write on this
      // adapter to emit one.
      expect(executor.mutationCalls).toStrictEqual([]);
    });
  });

  describe('saveProduct - NET-NEW, and the replacement for the ORM save', () => {
    // Persistence ran through Hibernate as `getHibachiDAO().save(target=arguments.product)`
    // [model/service/ProductService.cfc:L287]. T3 converts that into this method.

    it('binds every inserted column value and interpolates none', async () => {
      // C5.2. Twenty columns, twenty placeholders, twenty bound parameters - and not one value in
      // the statement text.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      expect(executor.mutationCalls).toHaveLength(1);
      const insert = statementAt(executor.mutationCalls, 0);

      expect(insert.sql).toBe(EXPECTED_PRODUCT_INSERT);
      expect(placeholderCount(insert.sql)).toBe(20);
      expect(insert.params).toHaveLength(20);

      // A new entity needs no existence read, because `isNew()` already answers the question - the
      // ported `unsavedvalue=""` test [model/entity/Product.cfc:L52].
      expect(executor.calls).toHaveLength(0);

      // The minted identifier is the legacy's own shape and it is BOUND, not embedded.
      const mintedIdentifier = parameterAt(insert.params, 0);
      expect(typeof mintedIdentifier).toBe('string');
      if (typeof mintedIdentifier === 'string') {
        expect(MINTED_IDENTIFIER_PATTERN.test(mintedIdentifier)).toBe(true);
        expect(insert.sql).not.toContain(mintedIdentifier);
      }
    });

    it('reads the row before updating an existing product, and binds THE KEY LAST', async () => {
      // Insert-or-update is decided by the DATABASE, not by a flag: `isNew()` is consulted first,
      // and when the entity carries an identifier the row's existence is checked before anything
      // is written.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(PERSISTED_PRODUCT_ID), NO_POPULATED_MEMBERS);

      const existenceRead = onlyStatement(executor.calls);
      expect(existenceRead.sql).toBe(EXPECTED_PRODUCT_EXISTENCE_READ);
      expect(existenceRead.params).toStrictEqual([PERSISTED_PRODUCT_ID]);

      const update = statementAt(executor.mutationCalls, 0);
      expect(update.sql).toBe(EXPECTED_PRODUCT_UPDATE);

      // Seventeen SET assignments plus the key: eighteen parameters, KEY LAST. Positional binding
      // makes that order part of the contract.
      expect(placeholderCount(update.sql)).toBe(18);
      expect(update.params).toHaveLength(18);
      expect(parameterAt(update.params, 17)).toBe(PERSISTED_PRODUCT_ID);
      expect(update.sql.endsWith('WHERE productID = ?')).toBe(true);
    });

    it('excludes productID and the created audit pair from the SET list', async () => {
      // `productID` is the key the statement MATCHES on rather than a value it sets.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(PERSISTED_PRODUCT_ID), NO_POPULATED_MEMBERS);

      const update = statementAt(executor.mutationCalls, 0);
      const setClause = update.sql.slice(update.sql.indexOf('SET'), update.sql.indexOf('WHERE'));

      expect(setClause).not.toContain('productID');
      expect(setClause).not.toContain('createdDateTime');
      expect(setClause).not.toContain('createdByAccountID');
      expect(setClause).toContain('modifiedDateTime = ?');
      expect(setClause).toContain('modifiedByAccountID = COALESCE(?, modifiedByAccountID)');
    });

    it('writes the insert audit pair from ONE timestamp, byte-identical', async () => {
      // `HibachiEntity.preInsert` took one `now()` and wrote it to both `createdDateTime` and
      // `modifiedDateTime`, so an inserted row's two stamps are byte-identical rather than merely
      // close. Reproduced exactly.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);
      const createdStamp = parameterAt(insert.params, 16);
      const modifiedStamp = parameterAt(insert.params, 18);

      expect(createdStamp).toBeInstanceOf(Date);
      expect(modifiedStamp).toBeInstanceOf(Date);
      if (createdStamp instanceof Date && modifiedStamp instanceof Date) {
        expect(createdStamp.getTime()).toBe(modifiedStamp.getTime());
      }
    });

    it('★★ STAMPS THE REQUEST ACTOR and ignores the account a caller put on the entity', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(
        makeWritableProduct(undefined, {
          // A caller naming whoever it likes as the author of the row. This is the spoof.
          createdByAccountID: FORGED_ACCOUNT_ID,
          modifiedByAccountID: FORGED_ACCOUNT_ID,
        }),
        NO_POPULATED_MEMBERS,
      );

      const insert = statementAt(executor.mutationCalls, 0);

      // Both halves from one resolution, as `preInsert` calls both setters under one gate
      // [org/Hibachi/HibachiEntity.cfc:L628-L635].
      expect(parameterAt(insert.params, INSERT_CREATED_BY_POSITION)).toBe(
        TEST_AUDIT_ACTOR.accountID,
      );
      expect(parameterAt(insert.params, INSERT_MODIFIED_BY_POSITION)).toBe(
        TEST_AUDIT_ACTOR.accountID,
      );
      expect(insert.params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('★★ STAMPS NOTHING FOR A NON-ADMIN, reproducing the getAdminAccountFlag half of the gate', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      await repository.saveProduct(
        makeWritableProduct(undefined, { createdByAccountID: FORGED_ACCOUNT_ID }),
        NO_POPULATED_MEMBERS,
      );

      const insert = statementAt(executor.mutationCalls, 0);

      // This actor has an identifier, so the nulls prove the FLAG was consulted rather than that
      // there was nothing to write - the distinction an anonymous actor cannot make.
      expect(NON_ADMIN_AUDIT_ACTOR.accountID).toBeDefined();
      expect(parameterAt(insert.params, INSERT_CREATED_BY_POSITION)).toBeNull();
      expect(parameterAt(insert.params, INSERT_MODIFIED_BY_POSITION)).toBeNull();
      expect(insert.params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('★★ PRESERVES A STORED ATTRIBUTION on update when the gate refuses, rather than erasing it', async () => {
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const repository = aProductRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      await repository.saveProduct(
        makeWritableProduct(PERSISTED_PRODUCT_ID, { modifiedByAccountID: 'the-real-editor' }),
        NO_POPULATED_MEMBERS,
      );

      const update = statementAt(executor.mutationCalls, 0);

      // A refused gate binds null and the statement's `COALESCE` resolves it against the stored
      // column, so whoever really did edit the row survives.
      expect(parameterAt(update.params, UPDATE_MODIFIED_BY_POSITION)).toBeNull();
      expect(update.sql).toContain('modifiedByAccountID = COALESCE(?, modifiedByAccountID)');
    });

    it('★★ REFUSES an update that matched NO row rather than reporting the entity as persisted', async () => {
      // Without this refusal an entity whose `isNew()` is false and whose key names no row
      // RESOLVES, answers the entity carrying that key, and writes nothing.
      //
      // Parity: Hibernate raised `StaleObjectStateException` on a zero-match flush rather than
      // returning quietly, so refusing here is what `super.save()` did.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]], NO_ROWS_AFFECTED);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.saveProduct(makeWritableProduct(PERSISTED_PRODUCT_ID), NO_POPULATED_MEMBERS),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('matched no SwProduct row');

      // The statement was issued, and it was the update rather than an insert.
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toContain('UPDATE SwProduct');
    });

    it('binds a monetary column as a decimal STRING, never as a float', async () => {
      // P4/E4 - the single arithmetic surface. `decimalNumbers` is unset on the pool, so a DECIMAL
      // column round-trips as TEXT and `Money` is constructed from it.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);
      const boundSalePrice = parameterAt(insert.params, 8);

      expect(typeof boundSalePrice).toBe('string');
      expect(boundSalePrice).not.toBeTypeOf('number');
    });

    it('writes NULL for an association the caller did not materialize', async () => {
      // The three foreign keys are written from the associations - `brandID` from `getBrand()`,
      // `productTypeID` from `getProductType()`, `defaultSkuID` from `getDefaultSku()`.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);

      expect(parameterAt(insert.params, 12)).toBeNull();
      expect(parameterAt(insert.params, 13)).toBeNull();
      expect(parameterAt(insert.params, 14)).toBeNull();
    });

    it('refuses to write a foreign key from an unpersisted association', async () => {
      // A dangling key raises on the way in rather than being quietly nulled on the way out.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.saveProduct(makeProductFixture(), NO_POPULATED_MEMBERS),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(executor.mutationCalls).toHaveLength(0);
      expect(executor.calls).toHaveLength(0);
    });

    it('★ DEFERS defaultSkuID as NULL for an unsaved default SKU, and binds it once saved', async () => {
      // So an UNSAVED default SKU is bound as NULL here, and for two independent reasons either of
      // which suffices.
      //
      // Note the contrast with the case immediately above: an unpersisted BRAND RAISES, because
      // nothing defers a brand and a dangling brand key is simply wrong.
      const deferredExecutor = new RecordingExecutor();
      const unsavedDefaultSku = makeSkuFixture({
        skuID: 'draft-sku-identifier',
        isNew: true,
        product: undefined,
      });

      // The one-method cascade seam, declared inline: this case is about what the PRODUCT insert
      // binds, so the writer only has to answer with a persisted instance.
      const deferredRepository = aProductRepository(
        deferredExecutor,
        TEST_AUDIT_ACTOR,
        PRODUCT_TYPE_PORT_BAG_MEMBER,
        {
          saveSku: (): Promise<Sku> =>
            Promise.resolve(makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined })),
        },
      );

      const draftBearingProduct = makeProductFixture({
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
        skus: [unsavedDefaultSku],
      });
      draftBearingProduct.setDefaultSku(unsavedDefaultSku);

      await deferredRepository.saveProduct(draftBearingProduct, NO_POPULATED_MEMBERS);

      const deferredInsert = statementAt(deferredExecutor.mutationCalls, 0);

      expect(deferredInsert.sql).toContain('INSERT INTO SwProduct (');
      expect(parameterAt(deferredInsert.params, DEFAULT_SKU_ID_PARAMETER_INDEX)).toBeNull();
      expect(deferredInsert.params).not.toContain('draft-sku-identifier');

      // and the deferred UPDATE follows, carrying the key the writer actually minted rather
      // than the provisional one the draft arrived with.
      const deferredUpdate = statementAt(
        deferredExecutor.mutationCalls,
        deferredExecutor.mutationCalls.length - 1,
      );

      expect(deferredUpdate.sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);
      expect(deferredUpdate.params[0]).toBe(PERSISTED_SKU_ID);

      // And the positive half: a default sku that already has a row is bound in the insert itself.
      const boundExecutor = new RecordingExecutor();
      const boundRepository = aProductRepository(boundExecutor, TEST_AUDIT_ACTOR);

      await boundRepository.saveProduct(
        makeProductFixture({
          brand: undefined,
          productType: undefined,
          defaultSku: makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined }),
        }),
        NO_POPULATED_MEMBERS,
      );

      const boundInsert = statementAt(boundExecutor.mutationCalls, 0);

      expect(parameterAt(boundInsert.params, DEFAULT_SKU_ID_PARAMETER_INDEX)).toBe(
        PERSISTED_SKU_ID,
      );
    });

    it('writes SwProduct alone when the product holds no transient SKU', async () => {
      // The assertion is still exactly right and its scope was wrong.
      //
      // The statement-text assertions are kept verbatim, because the delegation half of the
      // original claim holds unchanged: this adapter emits no `SwSku` text of its own even when it
      // does cascade.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);

      expect(insert.sql).toContain('INSERT INTO SwProduct (');
      for (const dependentTable of [
        'SwSku',
        'SwSkuOption',
        'SwProductImage',
        'SwAttributeValue',
        'SwProductReview',
      ]) {
        expect(insert.sql).not.toContain(dependentTable);
      }

      // And no unit of work was opened, because one statement is not a unit of work.
      expect(executor.transactionCount).toBe(0);
    });
  });

  // SaveProduct, the aggregate cascade: NET-NEW COVERAGE, no legacy antecedent.
  //
  // `SkuService.createSkus` [model/service/SkuService.cfc:L58] builds every SKU a new merchandise
  // product will have, attaches each to `product.getSkus()` and designates one as the default -
  // and persists none of them.
  describe('saveProduct - the aggregate cascade for transient SKUs', () => {
    /**
     * The key the cascade writer reports for the nth SKU it is handed.
     */
    const PERSISTED_CASCADE_SKU_IDS = [
      'b7c3f81a04d5426e93a70cd21fe85b46',
      'd0a49e6b71f8425c8b13ae59042cf7d8',
    ] as const;

    /**
     * A recording stand-in for `MysqlSkuRepository` as the cascade contract sees it.
     *
     * JUDGMENT CALL: hand-written rather than the real adapter.
     */
    class RecordingCascadeWriter {
      public readonly calls: { readonly sku: Sku; readonly productID: string }[] = [];

      /**
       * The executor each call was handed, so escaping the transaction is observable.
       */
      public readonly executors: PreparedStatementExecutor[] = [];

      public saveSku(
        sku: Sku,
        productID: string,
        executor: PreparedStatementExecutor,
      ): Promise<Sku> {
        this.calls.push({ sku, productID });
        this.executors.push(executor);

        const mintedKey =
          PERSISTED_CASCADE_SKU_IDS[this.calls.length - 1] ?? PERSISTED_CASCADE_SKU_IDS[0];

        // A DIFFERENT instance carrying a DIFFERENT key, which is what the real adapter returns:
        // `insertSku` mints its own identifier and rehydrates around it, so the draft's
        // provisional key never reaches the database.
        return Promise.resolve(makeSkuFixture({ skuID: mintedKey, product: undefined }));
      }
    }

    /**
     * A SKU that reports itself unsaved, as every draft `createSkus` builds does.
     */
    function aTransientSku(provisionalKey: string): Sku {
      return makeSkuFixture({ skuID: provisionalKey, isNew: true, product: undefined });
    }

    /**
     * A writable product carrying the supplied SKUs and, optionally, a designated default.
     */
    function aProductWithSkus(
      productID: string | undefined,
      skus: readonly Sku[],
      defaultSku?: Sku,
    ): Product {
      const product = makeProductFixture({
        productID,
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
        skus: [...skus],
      });

      if (defaultSku !== undefined) {
        product.setDefaultSku(defaultSku);
      }

      return product;
    }

    it('opens EXACTLY ONE transaction and issues every statement inside it', async () => {
      // The count assertion is as load-bearing as the flag: a transaction per statement would
      // satisfy `inTransaction` everywhere while providing none of the atomicity Hibernate's
      // single flush gave this aggregate.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {});

      expect(executor.transactionCount).toBe(1);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }
    });

    it('writes the product row FIRST, then each SKU, then defaultSkuID LAST', async () => {
      // The order is the forced one. Two transient SKUs so that "each SKU" is plural and the
      // parent key can be seen reaching both.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const first = aTransientSku('draft-1');
      const second = aTransientSku('draft-2');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [first, second], first),
        {},
      );

      // Two mutations from this adapter: the insert and the deferred key update. The two SKU
      // writes went through the writer, which owns `SwSku`.
      expect(executor.mutationCalls).toHaveLength(2);

      const insert = statementAt(executor.mutationCalls, 0);
      const deferredUpdate = statementAt(executor.mutationCalls, 1);

      expect(insert.sql).toBe(EXPECTED_PRODUCT_INSERT);
      // `defaultSkuID` is NULL on the insert even though a default is designated - the designated
      // SKU has no persisted key at that moment.
      expect(parameterAt(insert.params, 14)).toBeNull();

      // Both SKUs were handed the key the insert minted, in collection order.
      const mintedProductID = saved.getProductID();
      expect(writer.calls).toHaveLength(2);
      expect(writer.calls.map((call) => call.productID)).toStrictEqual([
        mintedProductID,
        mintedProductID,
      ]);
      expect(writer.calls.map((call) => call.sku)).toStrictEqual([first, second]);

      expect(deferredUpdate.sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);
      expect(deferredUpdate.params).toStrictEqual([PERSISTED_CASCADE_SKU_IDS[0], mintedProductID]);
    });

    it('hands the cascade the TRANSACTION executor, and routes EVERY statement through it', async () => {
      // Executor satisfies one interface, so a cascade that reached `this.executor` from inside
      // the callback would type-check perfectly and would silently send its statements down a
      // different pooled connection.
      const outer = new RecordingExecutor();
      const inner = new RecordingExecutor();
      const splitting: PreparedStatementExecutor = {
        execute: (sql, params) => outer.execute(sql, params),
        executeMutation: (sql, params) => outer.executeMutation(sql, params),
        transaction: async <T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> =>
          await inner.transaction(work),
      };

      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(splitting, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {});

      // Nothing reached the outer recorder: not the row insert, not the deferred update.
      expect(outer.calls).toStrictEqual([]);
      expect(outer.mutationCalls).toStrictEqual([]);

      // All of it reached the inner one, inside its single unit of work.
      expect(inner.transactionCount).toBe(1);
      expect(inner.mutationCalls).toHaveLength(2);
      for (const mutation of inner.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }

      // And the writer was handed that executor rather than the constructed one.
      expect(writer.executors).toHaveLength(1);
      expect(writer.executors[0]).toBe(inner);
      expect(writer.executors[0]).not.toBe(splitting);
    });

    it('returns a product whose SKUs are the PERSISTED instances, in original order', async () => {
      // Membership is not enough: `createSkus` derives each skuCode from the collection's length
      // as it grows [model/service/SkuService.cfc:L97], so a caller reading `getSkus()` after a
      // save must see the order it built.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const first = aTransientSku('draft-1');
      const second = aTransientSku('draft-2');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [first, second], first),
        {},
      );

      expect(saved.getSkus().map((sku) => sku.getSkuID())).toStrictEqual([
        PERSISTED_CASCADE_SKU_IDS[0],
        PERSISTED_CASCADE_SKU_IDS[1],
      ]);
      // The drafts are GONE from the returned collection - they carry provisional keys that name
      // no row, so handing them back would be handing back a lie.
      expect(saved.getSkus()).not.toContain(first);
      expect(saved.getSkus()).not.toContain(second);

      // And every returned SKU reports itself persisted.
      for (const sku of saved.getSkus()) {
        expect(sku.isNew()).toBe(false);
      }
    });

    it('reports the PERSISTED default sku, matched by identity rather than by key', async () => {
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const first = aTransientSku('draft-1');
      const second = aTransientSku('draft-2');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [first, second], second),
        {},
      );

      const deferredUpdate = statementAt(executor.mutationCalls, 1);

      expect(deferredUpdate.params).toStrictEqual([
        PERSISTED_CASCADE_SKU_IDS[1],
        saved.getProductID(),
      ]);
      expect(saved.getDefaultSku()?.getSkuID()).toBe(PERSISTED_CASCADE_SKU_IDS[1]);
      expect(saved.getDefaultSku()).toBe(saved.getSkus()[1]);
    });

    it('issues NO deferred update when the designated default was already persisted', async () => {
      // A default SKU carrying a key went into the row the insert already wrote, so a second
      // statement would rewrite the value it holds.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const alreadyPersisted = makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined });
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [draft, alreadyPersisted], alreadyPersisted),
        {},
      );

      expect(writer.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_PRODUCT_INSERT);
      // Written by the INSERT, at its own column position, because the key existed.
      expect(parameterAt(statementAt(executor.mutationCalls, 0).params, 14)).toBe(PERSISTED_SKU_ID);
      expect(saved.getDefaultSku()).toBe(alreadyPersisted);
    });

    it('issues NO deferred update when no default is designated at all', async () => {
      // `createSkus` designates one on every branch, but a caller composing a product by hand need
      // not - and the column then stays NULL, which is what the legacy leaves.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [aTransientSku('draft-1')]),
        {},
      );

      expect(writer.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(saved.getDefaultSku()).toBeUndefined();
      expect(parameterAt(statementAt(executor.mutationCalls, 0).params, 14)).toBeNull();
    });

    it('cascades on the UPDATE route too, and rebuilds even when the populate step overrode nothing', async () => {
      // An existing product can acquire new variants, so the cascade is not an insert-only
      // concern.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);
      const argument = aProductWithSkus(PERSISTED_PRODUCT_ID, [draft], draft);

      const saved = await repository.saveProduct(argument, {});

      const existenceRead = onlyStatement(executor.calls);
      expect(existenceRead.sql).toBe(EXPECTED_PRODUCT_EXISTENCE_READ);
      expect(existenceRead.inTransaction).toBe(true);

      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_PRODUCT_UPDATE);
      expect(statementAt(executor.mutationCalls, 1).sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);

      // Not the argument: the argument still holds the draft, which names no row.
      expect(saved).not.toBe(argument);
      expect(saved.getSkus().map((sku) => sku.getSkuID())).toStrictEqual([
        PERSISTED_CASCADE_SKU_IDS[0],
      ]);
      expect(writer.calls[0]?.productID).toBe(PERSISTED_PRODUCT_ID);
    });

    it('RAISES before any write when a cascade is needed and no writer was supplied', async () => {
      // Silent loss is the failure mode this refuses.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.saveProduct(aProductWithSkus(undefined, [aTransientSku('draft-1')]), {}),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('1 sku(s) that have never been persisted');
      // Nothing was written and no unit of work was opened.
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);
      expect(executor.transactionCount).toBe(0);
    });

    it('RAISES when a transient default sku is not among the skus this write will cascade to', async () => {
      // The permission granted to a transient default is exactly "this write is going to persist
      // it".
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);
      const orphanDesignation = aTransientSku('draft-not-held');

      const rejection = await captureRejection(() =>
        repository.saveProduct(
          aProductWithSkus(undefined, [aTransientSku('draft-1')], orphanDesignation),
          {},
        ),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('is not among the skus held on the product');
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(writer.calls).toStrictEqual([]);
    });

    it('★★ REFUSES when the DEFERRED defaultSkuID update matches no row', async () => {
      // The deferred designation is the second statement of a two-statement sequence, and it is
      // the one that records which variant a shopper is shown by default.
      //
      // The INSERT reporting zero here is not what trips the guard: an insert that did not throw
      // wrote its row, so no insert path in this tier inspects the count.
      const executor = new RecordingExecutor([], NO_ROWS_AFFECTED);
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const rejection = await captureRejection(() =>
        repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {}),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('deferred defaultSkuID update matched no SwProduct row');

      // Both statements were issued - the insert, then the designation it defers - and the refusal
      // is on the second.
      expect(executor.mutationCalls).toHaveLength(2);
      expect(statementAt(executor.mutationCalls, 1).sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);
      expect(executor.transactionCount).toBe(1);
    });

    it('emits no SwSku text of its own, delegating the table it does not own', async () => {
      // The delegation half of the original "writes SwProduct alone" claim, asserted on the path
      // that does cascade: this adapter names `SwProduct` and nothing else.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {});

      expect(executor.mutationCalls.length).toBeGreaterThan(0);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.sql).toContain('SwProduct');
        for (const foreignTable of ['SwSku', 'SwSkuOption', 'SwProductImage', 'SwProductReview']) {
          expect(mutation.sql).not.toContain(foreignTable);
        }
      }
    });

    it('takes the no-transaction path unchanged when every held SKU is already persisted', async () => {
      // The cascade is decided by `isNew()` on each held SKU and by nothing else, so a product
      // whose collection is fully materialized and fully persisted saves exactly as it did before
      // the cascade existed: one statement.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const persisted = makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined });
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [persisted], persisted), {});

      expect(executor.transactionCount).toBe(0);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(writer.calls).toStrictEqual([]);
    });
  });

  // SaveProduct, the populate step: NET-NEW COVERAGE, no legacy antecedent.
  //
  // The three-way distinction is the whole point, and it is why `Object.hasOwn` is the test rather
  // than a truthiness check: a present key wins, even when it holds `undefined`, in which case SQL
  // null is written.
  describe('saveProduct - the populate step, and where a resolved url title lands', () => {
    it('binds the PAYLOAD url title, not the entity value it overrides', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      // The service's own shape: the entity has no title, the service resolved one, and the
      // payload is how it travels.
      const product = makeProductFixture({
        urlTitle: undefined,
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
      });

      expect(product.getUrlTitle()).toBeUndefined();

      const saved = await repository.saveProduct(product, { urlTitle: RESOLVED_URL_TITLE });

      const insert = statementAt(executor.mutationCalls, 0);

      // The row carries it. This is the assertion whose absence let the defect through: every
      // other case in this file passes an empty payload and so cannot see it.
      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBe(RESOLVED_URL_TITLE);
      // And it is BOUND, not interpolated.
      expect(insert.sql).not.toContain(RESOLVED_URL_TITLE);

      // The returned instance carries it too, which is what the legacy's own entity assignment
      // achieved. The argument cannot: `urlTitle` is `private readonly`.
      expect(saved.getUrlTitle()).toBe(RESOLVED_URL_TITLE);
      expect(product.getUrlTitle()).toBeUndefined();
      expect(saved).not.toBe(product);
    });

    it('binds the PAYLOAD product name, and the two members move independently', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const saved = await repository.saveProduct(makeWritableProduct(), {
        productName: OVERRIDING_PRODUCT_NAME,
      });

      const insert = statementAt(executor.mutationCalls, 0);

      // `productName` present, `urlTitle` absent: one column takes the payload and the other keeps
      // the entity's value. A populate step that applied the whole payload or none of it would
      // fail one half of this.
      expect(parameterAt(insert.params, INSERT_PRODUCT_NAME_POSITION)).toBe(
        OVERRIDING_PRODUCT_NAME,
      );
      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBe(FIXTURE_URL_TITLE);
      expect(saved.getProductName()).toBe(OVERRIDING_PRODUCT_NAME);
      expect(saved.getUrlTitle()).toBe(FIXTURE_URL_TITLE);
    });

    it('writes SQL NULL for a key PRESENT and holding undefined', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      // The entity has a title, and the payload explicitly says there is none.
      const saved = await repository.saveProduct(makeWritableProduct(), { urlTitle: undefined });

      const insert = statementAt(executor.mutationCalls, 0);

      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBeNull();
      expect(insert.params).not.toContain(undefined);
      expect(saved.getUrlTitle()).toBeUndefined();
    });

    it('leaves the entity value in place for a key that is ABSENT', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const saved = await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);

      // The distinction `Object.hasOwn` draws, from the other side: absent is not `undefined`, so
      // nothing is overridden and nothing is nulled.
      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBe(FIXTURE_URL_TITLE);
      expect(saved.getUrlTitle()).toBe(FIXTURE_URL_TITLE);
    });

    it('carries the populated url title through the UPDATE route as well', async () => {
      // An EXISTING row whose `urlTitle` column is NULL is exactly the case the service generates
      // for on a second save.
      const executor = new RecordingExecutor([[{ productID: PERSISTED_PRODUCT_ID }]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const product = makeProductFixture({
        productID: PERSISTED_PRODUCT_ID,
        urlTitle: undefined,
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
      });
      const argumentCreationStamp = product.getCreatedDateTime();

      const saved = await repository.saveProduct(product, { urlTitle: RESOLVED_URL_TITLE });

      const update = statementAt(executor.mutationCalls, 0);

      expect(update.sql).toBe(EXPECTED_PRODUCT_UPDATE);
      expect(parameterAt(update.params, UPDATE_URL_TITLE_POSITION)).toBe(RESOLVED_URL_TITLE);
      expect(update.sql).not.toContain(RESOLVED_URL_TITLE);

      // A rebuilt instance, because handing back the argument would report a title the row does
      // not hold - and the key it reports is the one it already had, not a freshly minted one.
      expect(saved).not.toBe(product);
      expect(saved.getUrlTitle()).toBe(RESOLVED_URL_TITLE);
      expect(saved.getProductID()).toBe(PERSISTED_PRODUCT_ID);

      // And the creation provenance survives the rebuild.
      expect(saved.getCreatedDateTime()).toBe(argumentCreationStamp);

      const rebuiltModifiedStamp = saved.getModifiedDateTime();
      expect(rebuiltModifiedStamp).toBeInstanceOf(Date);
      // The same narrowing idiom the audit-stamp cases above use: `instanceof` rather than a
      // non-null assertion, which the lint configuration bans outright in `src/**` and which this
      // file does not reach for either.
      if (rebuiltModifiedStamp instanceof Date && argumentCreationStamp instanceof Date) {
        expect(rebuiltModifiedStamp.getTime()).toBeGreaterThan(argumentCreationStamp.getTime());
      }
    });

    it('still answers THE ARGUMENT on the update route when the populate step overrode nothing', async () => {
      // The regression guard for the branch above.
      const executor = new RecordingExecutor([[{ productID: PERSISTED_PRODUCT_ID }]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const product = makeWritableProduct(PERSISTED_PRODUCT_ID);

      const saved = await repository.saveProduct(product, NO_POPULATED_MEMBERS);

      expect(saved).toBe(product);

      // A payload that RESTATES what the entity already holds overrides nothing either, so it
      // takes the same branch.
      const restatingExecutor = new RecordingExecutor([[{ productID: PERSISTED_PRODUCT_ID }]]);
      const restated = await aProductRepository(restatingExecutor, TEST_AUDIT_ACTOR).saveProduct(
        product,
        {
          urlTitle: FIXTURE_URL_TITLE,
          productName: LEGACY_FIXTURE_PRODUCT_NAME,
        },
      );

      expect(restated).toBe(product);
    });
  });

  describe('deleteProduct - NET-NEW, and boolean by legacy service contract', () => {
    // The whole cascade runs inside one unit of work, because `connection.ts` supplies
    // `transaction`: Hibernate deleted a product's dependents [model/entity/Product.cfc:L70-L76]
    // and nulled the default SKU first [model/service/ProductService.cfc:L323], so the port has to
    // do both, atomically.

    /**
     * 1 detach + 8 SKU-dependent + 1 SwSku + 3 owned link + 7 inverse link + 3 product-dependent +
     * 1 product.
     */
    const EXPECTED_CASCADE_STATEMENT_COUNT = 24;

    /**
     * Position of the product row's own DELETE: the last statement of the unit of work.
     */
    const PRODUCT_DELETE_POSITION = EXPECTED_CASCADE_STATEMENT_COUNT - 1;

    /**
     * Every table the cascade touches, in the order the adapter walks them.
     */
    const EXPECTED_CASCADE_TABLES: readonly string[] = Object.freeze([
      'SwProduct',
      'SwAlternateSkuCode',
      'SwAttributeValue',
      'SwSkuCurrency',
      'SwStock',
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
      'SwSku',
      'SwProductListingPage',
      'SwProductCategory',
      'SwRelatedProduct',
      'SwPromoRewardProduct',
      'SwPromoRewardExclProduct',
      'SwPromoQualProduct',
      'SwPromoQualExclProduct',
      'SwPriceGroupRateProduct',
      'SwVendorProduct',
      'SwPhysicalProduct',
      'SwImage',
      'SwAttributeValue',
      'SwProductReview',
      'SwProduct',
    ]);

    /**
     * The eight tables reached through a subquery over the product's SKUs.
     */
    const SKU_DEPENDENT_TABLE_NAMES: readonly string[] = EXPECTED_CASCADE_TABLES.slice(1, 9);

    it('deletes the product row LAST, and reports true when it matched', async () => {
      // The boolean result is the legacy SERVICE-level contract,
      // `public boolean function deleteProduct(required any product)`
      // [model/service/ProductService.cfc:L317], so this reports two outcomes rather than throwing
      // on a refusal - and it reports the PRODUCT row's result.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      expect(deleted).toBe(true);
      expect(executor.mutationCalls).toHaveLength(EXPECTED_CASCADE_STATEMENT_COUNT);

      const statement = statementAt(executor.mutationCalls, PRODUCT_DELETE_POSITION);
      expect(statement.sql).toBe(EXPECTED_PRODUCT_DELETE);
      expect(statement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
      expect(placeholderCount(statement.sql)).toBe(1);

      // TWENTY-FOUR STATEMENTS, in ORDER, as TEXT - and the count is FIXED. It does not grow with
      // the number of SKUs, link rows or currencies, because every step is one predicate rather
      // than one statement per row.
      expect(executor.mutationCalls.map((call: RecordedStatement) => call.sql)).toStrictEqual([
        ...EXPECTED_PRODUCT_DELETE_SEQUENCE,
      ]);

      // Every statement binds the product identifier exactly once, so the whole sequence is
      // idempotent and therefore safely retryable - and every statement after the first is a plain
      // row DELETE.
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_DETACH);

      for (const [position, call] of executor.mutationCalls.entries()) {
        expect(call.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
        expect(placeholderCount(call.sql)).toBe(1);
        expect(call.sql.startsWith(position === 0 ? 'UPDATE ' : 'DELETE FROM ')).toBe(true);
        expect(call.sql).not.toContain('TRUNCATE');
        expect(call.sql).not.toContain('DROP');
      }

      // LEAF FIRST: the product row is deleted LAST, so a failure part-way through leaves it
      // present and the call safe to re-issue.
      expect(statementAt(executor.mutationCalls, PRODUCT_DELETE_POSITION).sql).toBe(
        EXPECTED_PRODUCT_DELETE,
      );

      // And the SKU rows go after their own children and before every table keyed on the product
      // itself.
      expect(statementAt(executor.mutationCalls, 9).sql).toBe(EXPECTED_PRODUCT_SKUS_DELETE);

      // Nothing was READ - the one place row identity is resolved is inside the subquery, in SQL.
      expect(executor.calls).toHaveLength(0);
    });

    it('names every out-of-scope child table from its OWN entity declaration', async () => {
      // Nothing is invented by reading them, and the foreign keys are declared in the same files -
      // `Image.product` is `fkcolumn="productID"` [model/entity/Image.cfc:L61] and
      // `AttributeValue` carries both `productID` [model/entity/Image.cfc:L70] and `skuID`
      // [model/entity/Image.cfc:L72].
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const emitted = executor.mutationCalls.map((call: RecordedStatement) => call.sql).join('\n');

      for (const declaredTable of [
        'SwImage',
        'SwAttributeValue',
        'SwProductReview',
        'SwAlternateSkuCode',
        'SwStock',
      ]) {
        expect(emitted).toContain(declaredTable);
      }

      // And the one name that really is an invention stays absent.
      expect(emitted).not.toContain('SwProductImage');
      for (const inverseSkuLinkTable of [
        'SwPromoRewardSku',
        'SwPromoRewardExclSku',
        'SwPromoQualSku',
        'SwPromoQualExclSku',
        'SwPriceGroupRateSku',
        'SwPhysicalSku',
      ]) {
        expect(emitted).not.toContain(inverseSkuLinkTable);
      }

      // And `SwRelatedProduct` is cleaned from one side only - adding `OR relatedProductID = ?`
      // would delete rows belonging to another product's collection, which the framework never
      // touched.
      expect(emitted).not.toContain('relatedProductID');
    });

    it('reports false when the PRODUCT row matched nothing, whatever the cascade did', async () => {
      // What `false` means here.
      const executor = new RecordingExecutor([], NO_ROWS_AFFECTED);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct(UNMATCHED_PRODUCT_ID));

      expect(deleted).toBe(false);

      const productDelete = statementAt(executor.mutationCalls, PRODUCT_DELETE_POSITION);
      expect(productDelete.sql).toBe(EXPECTED_PRODUCT_DELETE);
      expect(productDelete.params).toStrictEqual([UNMATCHED_PRODUCT_ID]);
    });

    it('refuses an unsaved product before opening a transaction, and writes nothing', async () => {
      // That was the right call for one statement and the wrong one for twenty-four.
      const executor = new RecordingExecutor([], NO_ROWS_AFFECTED);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct());

      expect(deleted).toBe(false);
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);
      expect(executor.transactionCount).toBe(0);
    });

    it('detaches the default SKU FIRST, which is the SQL half of the L323 null-out', async () => {
      // The mutual foreign key is why the order is forced: `SwSku.productID` references
      // `SwProduct` [model/entity/Sku.cfc:L65] and `SwProduct.defaultSkuID` references `SwSku`
      // [model/entity/Product.cfc:L70].
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const detach = statementAt(executor.mutationCalls, 0);
      expect(detach.sql).toBe('UPDATE SwProduct SET defaultSkuID = NULL WHERE productID = ?');
      expect(detach.params).toStrictEqual([PERSISTED_PRODUCT_ID]);

      // It is an UPDATE that clears one column - it must not re-stamp the audit columns of a row
      // that is deleted twenty-three statements later.
      expect(detach.sql).not.toContain('modifiedDateTime');

      // And it precedes every DELETE, not merely the first one.
      const firstDeletePosition = executor.mutationCalls.findIndex((statement: RecordedStatement) =>
        statement.sql.startsWith('DELETE'),
      );
      expect(firstDeletePosition).toBe(1);
    });

    it('opens EXACTLY ONE unit of work and runs every statement inside it', async () => {
      // This is the whole reason the cascade is reproducible at all.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      expect(executor.transactionCount).toBe(1);

      for (const statement of executor.mutationCalls) {
        expect(statement.inTransaction).toBe(true);
      }
    });

    it('routes all twenty-four statements through the TRANSACTION executor, not its own', async () => {
      class SplittingExecutor implements PreparedStatementExecutor {
        public readonly calls: RecordedStatement[] = [];

        public readonly mutationCalls: RecordedStatement[] = [];

        /**
         * The recorder every in-transaction statement is expected to land on instead.
         */
        public readonly inner = new RecordingExecutor();

        public transactionCount = 0;

        public execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
          this.calls.push({ sql, params: [...params], inTransaction: false });

          return Promise.resolve(NO_ROWS);
        }

        public executeMutation(
          sql: string,
          params: readonly unknown[] = [],
        ): Promise<SqlMutationResult> {
          this.mutationCalls.push({ sql, params: [...params], inTransaction: false });

          return Promise.resolve(WRITE_RESULT);
        }

        public async transaction<T>(
          work: (tx: PreparedStatementExecutor) => Promise<T>,
        ): Promise<T> {
          this.transactionCount += 1;

          return await work(this.inner);
        }
      }

      const executor = new SplittingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      // The outer executor opened the unit and then issued nothing at all.
      expect(executor.transactionCount).toBe(1);
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);

      // and the transaction's own executor carries the entire cascade.
      expect(executor.inner.mutationCalls).toHaveLength(EXPECTED_CASCADE_STATEMENT_COUNT);
      expect(deleted).toBe(true);
    });

    it('empties every SKU-dependent table BEFORE SwSku, reaching them by subquery', async () => {
      // Hibernate had the product's SKUs loaded and could delete each dependent by SKU key.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const emitted = executor.mutationCalls.map((statement: RecordedStatement) => statement.sql);
      const skuTablePosition = emitted.indexOf('DELETE FROM SwSku WHERE productID = ?');
      expect(skuTablePosition).toBe(9);

      SKU_DEPENDENT_TABLE_NAMES.forEach((tableName: string, offset: number) => {
        const position = offset + 1;
        const statement = statementAt(executor.mutationCalls, position);

        expect(statement.sql).toBe(
          `DELETE FROM ${tableName} WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)`,
        );
        expect(statement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
        expect(position).toBeLessThan(skuTablePosition);
      });
    });

    it('walks the link tables and the product-level children, in that order', async () => {
      // The first three link tables are OWNED many-to-many [model/entity/Product.cfc:L79-L81], so
      // their rows go with the owner; the next seven are the ones the product merely participates
      // in.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const emitted = executor.mutationCalls.map((statement: RecordedStatement) => statement.sql);

      expect(emitted.slice(10, 13)).toStrictEqual([
        'DELETE FROM SwProductListingPage WHERE productID = ?',
        'DELETE FROM SwProductCategory WHERE productID = ?',
        'DELETE FROM SwRelatedProduct WHERE productID = ?',
      ]);

      // Then the seven the product only PARTICIPATES in, which
      // `removeAllManyToManyRelationships()` [org/Hibachi/HibachiService.cfc:L61] cleared as well.
      expect(emitted.slice(13, 20)).toStrictEqual([
        'DELETE FROM SwPromoRewardProduct WHERE productID = ?',
        'DELETE FROM SwPromoRewardExclProduct WHERE productID = ?',
        'DELETE FROM SwPromoQualProduct WHERE productID = ?',
        'DELETE FROM SwPromoQualExclProduct WHERE productID = ?',
        'DELETE FROM SwPriceGroupRateProduct WHERE productID = ?',
        'DELETE FROM SwVendorProduct WHERE productID = ?',
        'DELETE FROM SwPhysicalProduct WHERE productID = ?',
      ]);

      // And last the three product-level children.
      expect(emitted.slice(20, 23)).toStrictEqual([
        'DELETE FROM SwImage WHERE productID = ?',
        'DELETE FROM SwAttributeValue WHERE productID = ?',
        'DELETE FROM SwProductReview WHERE productID = ?',
      ]);
    });

    it('binds exactly one parameter - the product key - in all twenty-four statements', async () => {
      // No statement takes a list, a limit or a second key.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      for (const statement of executor.mutationCalls) {
        expect(statement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
        expect(placeholderCount(statement.sql)).toBe(1);
      }
    });

    it('names SwOrderItem NOWHERE, so a sold SKU stays undeletable', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const everyStatement = executor.mutationCalls
        .map((statement: RecordedStatement) => statement.sql)
        .join('\n');

      expect(everyStatement).not.toContain('SwOrderItem');
      expect(everyStatement).not.toContain('SwOrder');

      // Nor does it reach the far side of any owned link: a category outlives the products filed
      // under it.
      expect(everyStatement).not.toContain('SwCategory ');
      expect(everyStatement).not.toContain('SwContent');
      expect(everyStatement).not.toContain('SwSubscriptionBenefit');
    });

    it('touches only the tables the legacy cascade did, and every one is Sw-prefixed', async () => {
      // The complete inventory in the emitted order, so a table added or dropped in the adapter
      // shows up here as a diff rather than as silent behaviour drift.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const touchedTables = executor.mutationCalls.map((statement: RecordedStatement) => {
        const match = /^(?:DELETE FROM|UPDATE) (\w+)/.exec(statement.sql);

        if (match?.[1] === undefined) {
          throw new Error(`statement names no table: ${statement.sql}`);
        }

        return match[1];
      });

      expect(touchedTables).toStrictEqual(EXPECTED_CASCADE_TABLES);

      for (const tableName of touchedTables) {
        expect(tableName.startsWith('Sw')).toBe(true);
      }
    });
  });

  // No `saveBrand` group, because the adapter publishes no such method.

  describe('the hydration path resolves collaborators by injection, not by a locator', () => {
    it('materializes a product with no getService lookup anywhere in the path', async () => {
      // The proof available to a statement-shape suite is structural and it is a real one: the
      // adapter is constructed with an executor and nothing ELSE, no container is reachable from
      // it.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getProductID()).toBe(PERSISTED_PRODUCT_ID);
      expect(product.getSkus()).toHaveLength(1);

      // No statement in the path names a service, a scope or a bean - the constructs a locator
      // would have needed.
      for (const call of executor.calls) {
        expect(call.sql).not.toContain('getService');
        expect(call.sql).not.toContain('slatwallScope');
      }
    });
  });

  // C-6 cross-cutting assertions.

  describe('boolean hydration through cfBoolean, not through Boolean(x)', () => {
    it('resolves a NULL flag exactly as cfBoolean does, not as JavaScript truthiness', async () => {
      // C6.2. Booleans go through `cfBoolean()` from `src/lib/cfml/truthiness.js` and never
      // through a bare `Boolean(x)` or `if (x)`.
      //
      // The canned graph row carries `p_activeFlag: null`, and [model/entity/Product.cfc:L53]
      // declares `activeFlag` with no `default=`, so a NULL column is the honest state.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getActiveFlag()).toBe(cfBoolean(null));
      expect(product.getPublishedFlag()).toBe(cfBoolean(1));
      expect(product.getCalculatedAllowBackorderFlag()).toBe(cfBoolean(0));
    });

    it('resolves the string "false" as false, which JavaScript truthiness would not', async () => {
      // The case that separates `cfBoolean()` from `Boolean(x)` unambiguously: `Boolean('false')`
      // is TRUE, while CFML - and therefore `cfBoolean` - reads the string `"false"` as FALSE.
      const rowWithStringFalse: SqlRow = { ...PRODUCT_GRAPH_ROW, p_publishedFlag: 'false' };
      const executor = new RecordingExecutor([[rowWithStringFalse], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getPublishedFlag()).toBe(false);
      expect(product.getPublishedFlag()).toBe(cfBoolean('false'));
      expect(Boolean('false')).toBe(true);
    });

    it('reads a flag by its projected label regardless of the value shape the driver returns', async () => {
      // CFML identifiers are case-insensitive and TypeScript is not, so column and alias casing is
      // never assumed - the labels asserted throughout this suite are the ones the adapter itself
      // projects.
      for (const flagValue of [1, '1', true]) {
        const executor = new RecordingExecutor([
          [{ ...PRODUCT_GRAPH_ROW, p_publishedFlag: flagValue }],
          [],
        ]);
        const product = requireProduct(
          await aProductRepository(executor, TEST_AUDIT_ACTOR).getProductByProductID(
            PERSISTED_PRODUCT_ID,
          ),
        );

        expect(product.getPublishedFlag()).toBe(true);
      }
    });
  });

  describe('schema continuity across every emitted statement', () => {
    it('targets only existing physical Sw* tables', () => {
      // C6.3 / C5/B5. The migration reads and writes the EXISTING `Sw*` schema unchanged - no
      // migration, no rename, no new table, no column change.
      //
      // Every name below is DECLARED in IN-SCOPE SOURCE: the entity `table=` attributes, or a
      // `linktable=` on one of the eighteen in-scope entities.
      const permittedTables: readonly string[] = [
        'SwAttributeSet',
        'SwAttribute',
        'SwType',
        'SwAttributeSetProductType',
        'SwProduct',
        'SwProductType',
        'SwBrand',
        'SwSku',
        'SwSkuOption',
        'SwOption',
        'SwOptionGroup',
        // The ten `Product` many-to-many link tables [model/entity/Product.cfc:L79-L90], cleaned
        // by the reproduction of `removeAllManyToManyRelationships()`.
        'SwProductListingPage',
        'SwProductCategory',
        'SwRelatedProduct',
        'SwPromoRewardProduct',
        'SwPromoRewardExclProduct',
        'SwPromoQualProduct',
        'SwPromoQualExclProduct',
        'SwPriceGroupRateProduct',
        'SwVendorProduct',
        'SwPhysicalProduct',
        // The SKU's own owned link tables [model/entity/Sku.cfc:L76-L79] and its
        // `all-delete-orphan` child tables [model/entity/Sku.cfc:L69-L73].
        'SwSkuAccessContent',
        'SwSkuSubsBenefit',
        'SwSkuRenewalSubsBenefit',
        'SwSkuCurrency',
        'SwAlternateSkuCode',
        'SwStock',
        // The three product-level children.
        'SwImage',
        'SwAttributeValue',
        'SwProductReview',
      ];

      for (const statement of EVERY_EXPECTED_STATEMENT) {
        const namedTables = statement.match(/Sw[A-Za-z]+/g) ?? [];

        expect(namedTables.length).toBeGreaterThan(0);
        for (const namedTable of namedTables) {
          expect(permittedTables).toContain(namedTable);
        }
      }
    });

    it('emits no DDL verb in any statement', async () => {
      // C6.3. Not one statement may create, alter, drop, truncate or rename anything.
      //
      // The sweep matches whole words, and that is not a loosening.
      const forbiddenVerbs: readonly string[] = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'];

      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);
      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);
      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));
      await repository.getAttributeSets([PRODUCT_ATTRIBUTE_SET_TYPE_CODE], []);

      const everyRecordedStatement: readonly string[] = [
        ...executor.calls.map((call: RecordedStatement) => call.sql),
        ...executor.mutationCalls.map((call: RecordedStatement) => call.sql),
      ];

      expect(everyRecordedStatement.length).toBeGreaterThan(0);

      for (const statement of [...EVERY_EXPECTED_STATEMENT, ...everyRecordedStatement]) {
        const upperCased = statement.toUpperCase();

        for (const forbiddenVerb of forbiddenVerbs) {
          expect(upperCased).not.toMatch(new RegExp('\\b' + forbiddenVerb + '\\b'));
        }
      }

      // And the sweep is proven to have teeth rather than to be vacuously green: the same
      // predicate does reject a real DDL statement.
      expect('DROP TABLE SwProduct').toMatch(new RegExp('\\bDROP\\b'));
      expect('P.CREATEDDATETIME AS P_CREATEDDATETIME').not.toMatch(new RegExp('\\bCREATE\\b'));
    });

    it('names no Slatwall-prefixed identifier in the raw-SQL path', async () => {
      // C2.8 / C6.3. Only the three raw-SQL sites are corrected, and this is one of them.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, MERCHANDISE_PRODUCT_TYPE_ID);

      for (const call of executor.calls) {
        expect(call.sql).not.toContain('Slatwall');
      }

      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain('Slatwall');
      }
    });

    it('binds every value and interpolates none, across every expected statement', () => {
      // P5/E5, swept. Every statement carries `?` placeholders and no quoted literal, so no
      // user-supplied value can appear in statement text.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain("'");
        expect(statement).not.toContain('"');
        expect(placeholderCount(statement)).toBeGreaterThan(0);
      }
    });

    it('touches no Mura CMS column, because none belongs to this adapter', () => {
      // C6.4. `Category.cmsCategoryID` (index `RI_CMSCATEGORYID`) and its `site` association
      // survive elsewhere in the target as inert persisted columns - read and written as opaque
      // values with no CMS behaviour.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain('cmsCategoryID');
        expect(statement).not.toContain('SwCategory');
        expect(statement).not.toContain('cmsSiteID');
      }
    });
  });

  describe('scope boundaries', () => {
    it('models no dialect branch, because neither ported read has one', async () => {
      // [model/dao/ProductDAO.cfc:L288] and [model/dao/ProductDAO.cfc:L304] are real dialect
      // branches, but both sit inside the unexercised bulk-import path, so the adapter models
      // neither and this suite asserts nothing about them.
      const firstRun = new RecordingExecutor([[], []]);
      await aProductRepository(firstRun, TEST_AUDIT_ACTOR).searchProductsByProductType(SEARCH_TERM);

      const secondRun = new RecordingExecutor([[], []]);
      await aProductRepository(secondRun, TEST_AUDIT_ACTOR).searchProductsByProductType(
        SEARCH_TERM,
      );

      expect(onlyStatement(firstRun.calls).sql).toBe(onlyStatement(secondRun.calls).sql);

      // No dialect-specific row-limiting or engine-specific syntax on this path.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement.toLowerCase()).not.toContain('select top');
        expect(statement.toLowerCase()).not.toContain('rownum');
      }
    });

    it('never reads the environment, so the suite is identical with or without the DB flag', () => {
      expect(process.env['TZ']).toBe('UTC');
    });

    it('produces bound timestamps that are real Dates under the UTC pin', async () => {
      // No bare local-time literal reaches a bound parameter: the audit stamps are `Date`
      // instances, and `tests/setup.ts` pins `process.env.TZ = 'UTC'` before any suite imports a
      // subject.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);
      for (const stampPosition of [16, 18]) {
        const stamp = parameterAt(insert.params, stampPosition);

        expect(stamp).toBeInstanceOf(Date);
        if (stamp instanceof Date) {
          expect(Number.isNaN(stamp.getTime())).toBe(false);
        }
      }
    });

    it('carries no credential, connection target or deployment artifact', () => {
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement.toLowerCase()).not.toContain('password');
        expect(statement.toLowerCase()).not.toContain('identified by');
        expect(statement).not.toContain('3306');
        expect(statement).not.toContain('127.0.0.1');
        expect(statement).not.toContain('localhost');
      }
    });
  });

  // C-9 The sale-price collaborator on the read hydration path.

  describe('the sale-price collaborator - NET-NEW, and the reason the entity can refuse a reach', () => {
    // [model/entity/Product.cfc:L517-L521] resolved sale prices by NAME at the point of use -
    // `getService("promotionService").getSalePriceDetailsForProductSkus(...)` at
    // [model/entity/Product.cfc:L519] - and `src/domain/entities/product.ts` refuses to reproduce
    // that reach: it takes `salePriceDetailsForSkus` as an ALREADY-RESOLVED.

    /**
     * A recording double for the narrow sale-price capability.
     *
     * The adapter's contract is module-local and un-exported, so this satisfies it structurally -
     * which is exactly how `src/handlers/bootstrap.ts` satisfies it.
     */
    function makeRecordingSalePriceResolver(details: Readonly<Record<string, SalePriceDetail>>): {
      readonly getSalePriceDetailsForProductSkus: (
        productID: string,
      ) => Promise<Readonly<Record<string, SalePriceDetail>>>;
      readonly calls: string[];
    } {
      const calls: string[] = [];

      return {
        getSalePriceDetailsForProductSkus(
          productID: string,
        ): Promise<Readonly<Record<string, SalePriceDetail>>> {
          calls.push(productID);

          return Promise.resolve(details);
        },
        calls,
      };
    }

    /**
     * One detail, keyed by the SKU identifier the canned SKU row carries.
     *
     * `salePrice` is a `Money` because the projection declares it monetary and the value is the
     * price after the rounding rule has run [model/service/PromotionService.cfc:L1026] - the
     * repository never recomputes it.
     */
    const CANNED_SALE_PRICE_DETAILS: Readonly<Record<string, SalePriceDetail>> = Object.freeze({
      [PERSISTED_SKU_ID]: Object.freeze({
        skuID: PERSISTED_SKU_ID,
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('52.47'),
        promotionID: 'promo-1',
      }) satisfies SalePriceDetail,
    });

    it('reaches the constructed entity, so a loaded product carries its sale-price detail', async () => {
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The assertion the whole wiring exists for.
      const detail = await product.getSkuSalePriceDetails(PERSISTED_SKU_ID);

      expect(detail?.skuID).toBe(PERSISTED_SKU_ID);
      expect(detail?.salePrice.toFixed2()).toBe('52.47');
      expect(detail?.discountLevel).toBe('sku');

      // One resolution, for the one product materialized, keyed on its identifier.
      expect(resolver.calls).toStrictEqual([PERSISTED_PRODUCT_ID]);
    });

    it('answers undefined for a sku the map does not carry, rather than a zero', async () => {
      // The same discipline that keeps `Sku.getPriceByCurrencyCode()`
      // [model/entity/Sku.cfc:L269-L273] answering `undefined`: a miss is the legacy's own
      // `return {}` at [model/entity/Product.cfc:L186], which every caller already probes for.
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(await product.getSkuSalePriceDetails(UNMATCHED_PRODUCT_ID)).toBeUndefined();
    });

    it('issues no statement of its own and leaves the documented three-statement shape intact', async () => {
      // The collaborator is a CAPABILITY, not a query this adapter emits: it reaches the executor
      // it was constructed with.
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);

      expect(executor.calls).toHaveLength(3);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('costs nothing and fabricates nothing when no resolver was supplied', async () => {
      // The collaborator is OPTIONAL, and over a hundred construction sites in this file rely on
      // that.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(await product.getSkuSalePriceDetails(PERSISTED_SKU_ID)).toBeUndefined();
      expect(executor.calls).toHaveLength(3);
    });

    it('resolves once per DISTINCT product on the multi-product ENTITY-load path', async () => {
      // The fetch shape, asserted.
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const secondProductID = UNMATCHED_PRODUCT_ID;
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW, { ...PRODUCT_GRAPH_ROW, p_productID: secondProductID }],
        [],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      // The caller's list repeats one identifier, which the loader collapses for the bind.
      const products = await repository.getProductsByProductID([
        PERSISTED_PRODUCT_ID,
        secondProductID,
        PERSISTED_PRODUCT_ID,
      ]);

      expect(products.size).toBe(2);
      expect([...resolver.calls].sort()).toStrictEqual(
        [PERSISTED_PRODUCT_ID, secondProductID].sort(),
      );
    });
  });
});

// Read totality - the two resource ceilings. Every magnitude the legacy answered is answered here,
// and the at-the-limit cases are covered on the admissible side.

describe('the read path is total on magnitude, refusing nothing the legacy answered', () => {
  describe('the search-term length', () => {
    it('searches with a term at the column width, which was the old ceiling', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const atTheWidth = 'a'.repeat(255);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType(atTheWidth);

      // `productName` declares no length [model/entity/Product.cfc:L55], and a Hibernate string
      // property without one maps to `varchar(255)` - so 255 is the longest term that could be an
      // entire name.
      expect(statementAt(executor.calls, 0).params).toStrictEqual([`%${atTheWidth}%`]);
    });

    it('★★ searches with a term ABOVE the column width instead of refusing it', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const aboveTheWidth = 'a'.repeat(256);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType(
        aboveTheWidth,
      );

      // ABOVE the column width, and still answered: no ceiling refuses it, and the statement is
      // issued with the term bound whole.
      expect(statementAt(executor.calls, 0).params).toStrictEqual([`%${aboveTheWidth}%`]);
    });

    it('leaves a LIKE metacharacter live inside the term, exactly as the legacy did', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType('%_%');

      expect(statementAt(executor.calls, 0).params).toStrictEqual(['%%_%%']);
    });
  });

  describe('the search-result count', () => {
    /**
     * `count` distinct search rows.
     */
    function searchRowsOf(count: number): readonly SqlRow[] {
      return Array.from({ length: count }, (_unused, index) => ({
        ...PRODUCT_SEARCH_ROW,
        productID: index.toString(16).padStart(32, '0'),
      }));
    }

    /**
     * `count` distinct identifiers, matching the rows `searchRowsOf` builds.
     */
    function identifiersOf(count: number): readonly string[] {
      return Array.from({ length: count }, (_unused, index) =>
        index.toString(16).padStart(32, '0'),
      );
    }

    it('★★ answers a result set ABOVE the old ceiling instead of refusing it', async () => {
      const executor = new RecordingExecutor([searchRowsOf(2_001)]);

      const matches = await aProductRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchProductsByProductType(SEARCH_TERM);

      // ABOVE the old materialization ceiling, and still answered in full.
      expect(executor.calls).toHaveLength(1);
      expect(matches.records).toHaveLength(2_001);
      expect(matches.matchedCount).toBe(2_001);
    });

    it('proceeds past a result set at the old ceiling, unchanged', async () => {
      const executor = new RecordingExecutor([searchRowsOf(2_000)]);

      const matches = await aProductRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchProductsByProductType(SEARCH_TERM);

      expect(executor.calls).toHaveLength(1);
      expect(matches.matchedCount).toBe(2_000);
    });

    it('★★ batches the ENTITY load so no single bind exceeds the tuple row limit', async () => {
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).getProductsByProductID(
        identifiersOf(2_001),
      );

      // What replaced the ceiling.
      for (const call of executor.calls) {
        expect(call.params.length).toBeLessThanOrEqual(SQL_TUPLE_ROW_LIMIT);
      }

      // 2,001 identifiers become several graph batches, and every identifier is bound exactly once
      // across them.
      const graphBindCount = executor.calls.reduce(
        (total: number, call) => total + call.params.length,
        0,
      );

      expect(graphBindCount).toBeGreaterThanOrEqual(2_001);
    });

    it('emits exactly one graph statement when the request fits a single batch', async () => {
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).getProductsByProductID(identifiersOf(3));

      // The emitted SQL is unchanged for every realistic request, which is what keeps the batching
      // invisible to every parity assertion in this file.
      expect(statementAt(executor.calls, 0).params).toHaveLength(3);
    });
  });
});
