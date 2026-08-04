/**
 * The ratified database surface — review finding SEC-SQL-SCOPE-01 (CWE-284, CWE-250).
 *
 * ⭐⭐ WHY THIS SUITE EXISTS AS ITS OWN FILE. The finding's resolution asks that the schema surface be
 * "ratified", that least-privilege credentials be provisioned from it, and that "every emitted table/column
 * pass one auditable registry". A registry nobody can enumerate cannot be ratified, and a classification
 * nothing asserts is a comment. These cases are the audit: they census the registry, prove each gate admits
 * exactly what its class permits, and pin the two names whose correct treatment is counter-intuitive.
 *
 * ⚠️ EVERY CASE HERE IS **NET-NEW**. AAP §0.6.5.2 records that no `SkuDAOTest`, `OptionDAOTest` or any other
 * legacy DAO test exists, so there is no legacy coverage of identifier validation to extend — the legacy has
 * no identifier validation to cover, which is the point: `model/dao/ProductDAO.cfc` interpolates 21
 * statements directly (defect D18). Labelled per AAP §0.8.3.7 rather than implying parity.
 *
 * ⚠️ THESE CASES TOUCH NO DATABASE. Every function under test refuses or resolves before any statement text
 * exists, which is precisely the property being asserted: a refusal must happen at composition, before a
 * connection is involved and before an over-granted deployment could let it through.
 */

import { DomainError } from '../../src/errors/DomainError';
import {
  assertColumnName,
  assertRegisteredColumnName,
  assertRegisteredTableName,
  assertTableName,
  assertWriteTableName,
  columnsForTable,
  registeredTableScopes,
  tableScope,
} from '../../src/adapters/mysql/QueryRunner';

import type {
  PhysicalTableName,
  RegisteredTableName,
  TableScope,
} from '../../src/adapters/mysql/QueryRunner';

/* ================================================================================================
 * THE CENSUS THIS SUITE RATIFIES
 * ==============================================================================================
 * Written out here INDEPENDENTLY of the implementation — as literal strings, not derived from
 * `registeredTableScopes()` — because a census computed from the thing it audits proves nothing. Adding a
 * table to `TABLE_SCOPES` without amending this block fails the first case below, which is the whole
 * mechanism by which the surface cannot grow unremarked.
 *
 * Each entry cites the legacy declaration it was read from and the statement that reaches it, so a reviewer
 * can re-verify necessity rather than take the list on trust.
 * ============================================================================================== */

/** AAP §0.2.1.2 names exactly these seven as the Catalog boundary. Fully writeable. */
const CATALOG_CORE: readonly string[] = [
  'SwProduct',
  'SwSku',
  'SwProductType',
  'SwBrand',
  'SwOption',
  'SwOptionGroup',
  'SwSkuOption',
];

/**
 * Link tables whose OWNING side is an in-scope entity even though the far side is not.
 *
 * `model/entity/Sku.cfc:L77-L79` declares the first three; `model/entity/Product.cfc:L81` declares the
 * fourth, the one of that entity's ten many-to-many collections with `SwProduct` on both sides.
 */
const CATALOG_OWNED_LINK: readonly string[] = [
  'SwSkuAccessContent',
  'SwSkuSubsBenefit',
  'SwSkuRenewalSubsBenefit',
  'SwRelatedProduct',
];

/**
 * The ONE cross-domain table this service writes.
 *
 * `model/dao/ProductDAO.cfc:L244` UPDATEs it and `:L250` INSERTs it, from the importer's custom-attribute
 * step. AAP §0.4.1.7 keeps the importer's behaviour, so the write is required rather than incidental.
 */
const CROSS_DOMAIN_WRITE: readonly string[] = ['SwAttributeValue'];

/** Excluded families reached only to answer a question. */
const CROSS_DOMAIN_READ_ONLY: readonly string[] = [
  /* `model/dao/SkuDAO.cfc:L103` — the SKU-code fallback. */
  'SwAlternateSkuCode',
  /* `model/dao/SkuDAO.cfc:L159` — the non-fetching join. */
  'SwSubscriptionTerm',
  /* `model/dao/SkuDAO.cfc:L53-L98` — the ten-way existence chain. */
  'SwStock',
  'SwOrderItem',
  'SwInventory',
  'SwOrderDeliveryItem',
  'SwPhysicalCountItem',
  'SwStockAdjustmentDeliveryItem',
  'SwStockAdjustmentItem',
  'SwStockHold',
  'SwStockReceiverItem',
  'SwVendorOrderItem',
  /* `model/dao/ProductDAO.cfc:L52-L62` — the attribute-set selection. */
  'SwAttributeSet',
  'SwAttribute',
  'SwAttributeSetProductType',
  'SwType',
];

/** Every writeable name, of any class. */
const WRITEABLE: readonly string[] = [
  ...CATALOG_CORE,
  ...CATALOG_OWNED_LINK,
  ...CROSS_DOMAIN_WRITE,
];

/** The whole ratified surface. */
const ALL_REGISTERED: readonly string[] = [...WRITEABLE, ...CROSS_DOMAIN_READ_ONLY];

/**
 * Runs a call expected to be refused and returns the error it threw.
 *
 * Returns rather than asserts so each caller can additionally inspect the `context`, which is where the
 * classification that justifies a refusal is reported.
 *
 * @param act - the call under test.
 * @returns the {@link DomainError} it threw.
 */
function refusalOf(act: () => unknown): DomainError {
  let captured: unknown;

  try {
    act();
  } catch (error: unknown) {
    captured = error;
  }

  expect(captured).toBeInstanceOf(DomainError);

  return captured as DomainError;
}

describe('SEC-SQL-SCOPE-01 — the ratified surface is enumerable, which is what makes it ratifiable', () => {
  it('[NET-NEW] registeredTableScopes() reports exactly the twenty-eight ratified names', () => {
    const reported = registeredTableScopes().map(([name]) => name);

    /* Compared as SETS, so a reordering of the declaration is not a failure while an ADDITION or a REMOVAL
     * is. The order `TABLE_SCOPES` declares is documentation for a reader, not a contract. */
    expect([...reported].sort()).toEqual([...ALL_REGISTERED].sort());
    expect(reported).toHaveLength(28);
  });

  it('[NET-NEW] the four classes partition the surface — 7 + 4 + 1 + 16, with no name in two', () => {
    const byScope = new Map<TableScope, string[]>();

    for (const [name, scope] of registeredTableScopes()) {
      byScope.set(scope, [...(byScope.get(scope) ?? []), name]);
    }

    expect([...(byScope.get('catalog-core') ?? [])].sort()).toEqual([...CATALOG_CORE].sort());
    expect([...(byScope.get('catalog-owned-link') ?? [])].sort()).toEqual(
      [...CATALOG_OWNED_LINK].sort(),
    );
    expect([...(byScope.get('cross-domain-write') ?? [])].sort()).toEqual(
      [...CROSS_DOMAIN_WRITE].sort(),
    );
    expect([...(byScope.get('cross-domain-read-only') ?? [])].sort()).toEqual(
      [...CROSS_DOMAIN_READ_ONLY].sort(),
    );

    /* Totality: the four classes account for every reported name and for nothing else. */
    expect(byScope.size).toBe(4);
    expect([...byScope.values()].reduce((total, names) => total + names.length, 0)).toBe(28);
  });

  it('[NET-NEW] the census is frozen, so a caller cannot mutate the registry through it', () => {
    const reported = registeredTableScopes();

    expect(Object.isFrozen(reported)).toBe(true);
    for (const entry of reported) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it('[NET-NEW] tableScope() agrees with the census for every name', () => {
    for (const [name, scope] of registeredTableScopes()) {
      expect(tableScope(name)).toBe(scope);
    }
  });
});

describe('SEC-SQL-SCOPE-01 — the READ gate admits the whole ratified surface', () => {
  it('[NET-NEW] assertRegisteredTableName resolves every one of the twenty-eight names', () => {
    for (const name of ALL_REGISTERED) {
      expect(assertRegisteredTableName(name)).toBe(name);
    }
  });

  it('[NET-NEW] it refuses a name outside the surface, before any statement text exists', () => {
    /* `SwAccount` is a real Slatwall table and belongs to the largest excluded family (AAP §0.2.2.1, 21
     * files). Refusing it is the boundary holding — not a spelling check. */
    const error = refusalOf(() => assertRegisteredTableName('SwAccount'));

    expect(error.message).toContain('neither the extracted Catalog schema nor the ratified');
    expect(error.context).toEqual({ candidate: 'SwAccount' });
  });

  it('[NET-NEW] it refuses a plausible near-miss rather than resolving it loosely', () => {
    /* `SwOrder` is the parent of the registered `SwOrderItem`. A prefix or fuzzy match would admit it. */
    refusalOf(() => assertRegisteredTableName('SwOrder'));
    refusalOf(() => assertRegisteredTableName('SwProducts'));
    refusalOf(() => assertRegisteredTableName(''));
  });

  it('[NET-NEW] it accepts all three vocabularies for a column-mapped name, and only the physical spelling for the rest', () => {
    /* The logical and bare forms exist because `org/Hibachi/HibachiDAO.cfc` SYNTHESISES them for entities
     * this port models. It models none of the excluded families, so no caller holds a `SlatwallOrderItem`
     * spelling to pass — there is no order entity here to name. */
    expect(assertRegisteredTableName('SlatwallSku')).toBe('SwSku');
    expect(assertRegisteredTableName('Sku')).toBe('SwSku');
    expect(assertRegisteredTableName('SwSku')).toBe('SwSku');

    refusalOf(() => assertRegisteredTableName('SlatwallOrderItem'));
    refusalOf(() => assertRegisteredTableName('OrderItem'));
  });
});

describe('SEC-SQL-SCOPE-01 — the WRITE gate refuses every read-only name', () => {
  it('[NET-NEW] assertWriteTableName admits the eleven Catalog tables', () => {
    for (const name of [...CATALOG_CORE, ...CATALOG_OWNED_LINK]) {
      expect(assertWriteTableName(name)).toBe(name);
    }
  });

  it('[NET-NEW] it admits SwAttributeValue, the one cross-domain table the importer writes', () => {
    /* If this refused, the importer's custom-attribute step of `model/dao/ProductDAO.cfc:L244`/`:L250`
     * could not be composed and behaviour AAP §0.4.1.7 requires would be dropped. */
    expect(assertWriteTableName('SwAttributeValue')).toBe('SwAttributeValue');
    expect(tableScope('SwAttributeValue')).toBe('cross-domain-write');
  });

  it('[NET-NEW] it refuses each of the sixteen read-only names, naming the classification', () => {
    for (const name of CROSS_DOMAIN_READ_ONLY) {
      const error = refusalOf(() => assertWriteTableName(name));

      expect(error.message).toContain('ratified cross-domain READ surface');
      /* The context carries the SCOPE, so an operator reading a log learns why rather than only what. */
      expect(error.context).toEqual({ table: name, scope: 'cross-domain-read-only' });
    }
  });

  it('[NET-NEW] ⭐ it refuses SwAlternateSkuCode even though that name IS column-mapped', () => {
    /* THE CASE THAT PROVES THE GATE READS SCOPES AND NOT THE COLUMN MAP. `SwAlternateSkuCode` is in
     * `PHYSICAL_TABLE_NAMES`, so `assertTableName` resolves it and `assertColumnName` knows its columns —
     * the SKU-code fallback of `model/dao/SkuDAO.cfc:L103` JOINS it. It nonetheless belongs to an excluded
     * family and must never be written. A write gate implemented against the column map would admit it. */
    expect(assertTableName('SwAlternateSkuCode')).toBe('SwAlternateSkuCode');
    expect(columnsForTable('SwAlternateSkuCode')).toContain('alternateSkuCode');

    const error = refusalOf(() => assertWriteTableName('SwAlternateSkuCode'));

    expect(error.context).toEqual({
      table: 'SwAlternateSkuCode',
      scope: 'cross-domain-read-only',
    });
  });

  it('[NET-NEW] ⭐ SwAttributeSetProductType is a LINK table and is still refused for writes', () => {
    /* THE CASE THAT PROVES THE MIDDLE CLASS IS A TEST, NOT A SHAPE. The four `catalog-owned-link` members
     * qualify because their owning side is an in-scope entity. This one's owning side is `AttributeSet`
     * (`model/entity/AttributeSet.cfc:L70`), an excluded entity, and `SwProductType` appears only as the far
     * column — so writing it would be writing a relationship the Catalog does not own. */
    expect(tableScope('SwAttributeSetProductType')).toBe('cross-domain-read-only');
    refusalOf(() => assertWriteTableName('SwAttributeSetProductType'));

    for (const owned of CATALOG_OWNED_LINK) {
      expect(assertWriteTableName(owned)).toBe(owned);
    }
  });

  it('[NET-NEW] the writeable set and the column-mapped set are both twelve and differ in exactly two', () => {
    /* ⚠️ THE DISTINCTION THAT MADE THE ORIGINAL PREDICATE WRONG, pinned so a future simplification that
     * collapses the two sets fails here. `PhysicalTableName` is what `TABLE_COLUMNS` maps;
     * `WriteableTableName` is what the scopes permit writing; they are near-identical and not identical. */
    const columnMapped = ALL_REGISTERED.filter((name) => {
      try {
        assertTableName(name);

        return true;
      } catch {
        return false;
      }
    });
    const writeable = ALL_REGISTERED.filter((name) => {
      try {
        assertWriteTableName(name);

        return true;
      } catch {
        return false;
      }
    });

    expect(columnMapped).toHaveLength(12);
    expect(writeable).toHaveLength(12);
    expect([...writeable].sort()).toEqual([...WRITEABLE].sort());

    /* The symmetric difference is exactly the two names the classification exists to separate. */
    const onlyColumnMapped = columnMapped.filter((name) => !writeable.includes(name));
    const onlyWriteable = writeable.filter((name) => !columnMapped.includes(name));

    expect(onlyColumnMapped).toEqual(['SwAlternateSkuCode']);
    expect(onlyWriteable).toEqual(['SwAttributeValue']);
  });

  it('[NET-NEW] assertTableName still refuses every cross-domain name, so the older gate did not widen', () => {
    /* The fix classified the registry rather than loosening the existing whitelist. Every write path in the
     * subtree resolves through `assertTableName`, so this case is what proves those paths were not widened
     * as a side effect of admitting the reads. */
    for (const name of CROSS_DOMAIN_READ_ONLY.filter((n) => n !== 'SwAlternateSkuCode')) {
      refusalOf(() => assertTableName(name));
    }

    refusalOf(() => assertTableName('SwAttributeValue'));
  });
});

describe('SEC-SQL-SCOPE-01 — the COLUMN gate covers both halves of the registry', () => {
  it('[NET-NEW] assertRegisteredColumnName dispatches to the column-mapped half', () => {
    /* For a name `TABLE_COLUMNS` maps, the unified gate must answer exactly what the original gate answers,
     * so routing a call site through it is not a behaviour change. */
    for (const table of [...CATALOG_CORE, 'SwAlternateSkuCode']) {
      const resolved = assertRegisteredTableName(table);

      for (const column of columnsForTable(resolved as PhysicalTableName)) {
        expect(assertRegisteredColumnName(resolved, column)).toBe(
          assertColumnName(resolved as PhysicalTableName, column),
        );
      }
    }
  });

  it('[NET-NEW] it resolves the cross-domain columns the existence chain and the importer emit', () => {
    const cases: readonly (readonly [RegisteredTableName, string])[] = [
      /* the ten-way chain of `model/dao/SkuDAO.cfc:L53-L98` */
      ['SwStock', 'stockID'],
      ['SwStock', 'skuID'],
      ['SwOrderItem', 'skuID'],
      ['SwInventory', 'stockID'],
      ['SwOrderDeliveryItem', 'stockID'],
      ['SwPhysicalCountItem', 'stockID'],
      ['SwStockAdjustmentDeliveryItem', 'stockID'],
      ['SwStockAdjustmentItem', 'fromStockID'],
      ['SwStockAdjustmentItem', 'toStockID'],
      ['SwStockHold', 'stockID'],
      ['SwStockReceiverItem', 'stockID'],
      ['SwVendorOrderItem', 'skuID'],
      /* the non-fetching join of `:L159` */
      ['SwSubscriptionTerm', 'subscriptionTermID'],
      /* the attribute-set selection of `model/dao/ProductDAO.cfc:L52-L62` */
      ['SwAttributeSet', 'attributeSetID'],
      ['SwAttributeSet', 'globalFlag'],
      ['SwAttributeSet', 'sortOrder'],
      ['SwAttributeSet', 'attributeSetTypeID'],
      ['SwAttribute', 'activeFlag'],
      ['SwAttributeSetProductType', 'productTypeID'],
      ['SwType', 'typeID'],
      ['SwType', 'systemCode'],
      /* the importer's custom-attribute step, `:L244` and `:L250` */
      ['SwAttributeValue', 'attributeValueID'],
      ['SwAttributeValue', 'attributeValue'],
      ['SwAttributeValue', 'attributeValueType'],
      ['SwAttributeValue', 'attributeID'],
      ['SwAttributeValue', 'productID'],
    ];

    for (const [table, column] of cases) {
      expect(assertRegisteredColumnName(table, column)).toBe(column);
    }
  });

  it('[NET-NEW] ⭐ it refuses a real column PAIRED WITH THE WRONG TABLE', () => {
    /* THE RISK THE COLUMN GATE ACTUALLY ADDRESSES. Spelling was never the hazard: `skuID` is declared on
     * nine of the twenty-eight registered tables and `stockID` on seven, so a mis-paired name is still a
     * real column and still composes SQL that parses — it simply answers the wrong question. */
    const error = refusalOf(() => assertRegisteredColumnName('SwOrderItem', 'stockID'));

    expect(error.message).toContain('ratified cross-domain table');
    expect(error.context).toEqual({
      table: 'SwOrderItem',
      candidate: 'stockID',
      scope: 'cross-domain-read-only',
    });

    /* And the converse pairing, to show the refusal is not one-directional. */
    refusalOf(() => assertRegisteredColumnName('SwInventory', 'skuID'));
    refusalOf(() => assertRegisteredColumnName('SwAttributeValue', 'globalFlag'));
  });

  it('[NET-NEW] it matches case-insensitively but answers the DECLARED spelling', () => {
    /* The legacy interpolates these names with inconsistent casing — `modifiedDatetime` at
     * `model/dao/ProductDAO.cfc:L363` beside `CreatedByAccountID` at `:L365` — and got away with it because
     * SQL identifiers are case-insensitive on the engines it targeted. Resolving to the declaration removes
     * the dependency on that leniency. */
    expect(assertRegisteredColumnName('SwStock', 'STOCKID')).toBe('stockID');
    expect(assertRegisteredColumnName('SwAttributeValue', '  attributevalueid  ')).toBe(
      'attributeValueID',
    );
  });

  it('[NET-NEW] it refuses a column no registered table declares', () => {
    refusalOf(() => assertRegisteredColumnName('SwStock', 'accountID'));
    refusalOf(() => assertRegisteredColumnName('SwType', ''));
  });

  it('[NET-NEW] every cross-domain table declares at least one column, so no entry is a stub', () => {
    /* `EXTENDED_TABLE_COLUMNS` is annotated as a TOTAL `Record`, so adding a table to the registry without
     * declaring its columns fails the build. This case adds the run-time half: a declared-but-empty set
     * would satisfy the compiler and would make every column on that table unusable. */
    for (const table of ALL_REGISTERED.filter((name) => {
      try {
        assertTableName(name);

        return false;
      } catch {
        return true;
      }
    })) {
      const registered = assertRegisteredTableName(table);
      const anyColumnResolves = [
        'stockID',
        'skuID',
        'fromStockID',
        'toStockID',
        'subscriptionTermID',
        'attributeSetID',
        'attributeID',
        'attributeValueID',
        'typeID',
        'productTypeID',
      ].some((candidate) => {
        try {
          assertRegisteredColumnName(registered, candidate);

          return true;
        } catch {
          return false;
        }
      });

      expect(anyColumnResolves).toBe(true);
    }
  });
});
