/**
 * The module-scope MySQL connection pool for the extracted Catalog slice.
 *
 * The pool is built once, when this module is first evaluated, and exported as a typed value that
 * collaborators receive by constructor injection. This module issues no statement, holds no cache,
 * shapes no result and knows nothing about the domain; every choice it makes is a lifecycle or a
 * boundary choice, and the ones that are not self-evident from the code are recorded below.
 *
 * There is no legacy counterpart to port. config/configApplication.cfm:L2 names a datasource and
 * the ColdFusion/Railo server resolves that name out of band to a driver, a URL, a schema and
 * credentials; AAP §0.5.4 records that no JDBC driver is vendored. Two consequences
 * follow: the construction decisions here are new rather than transliterated, and the behaviour
 * that is carried across is failing fast on an unusable connection target while pinning no capacity
 * figure the source does not state.
 */

import {
  createPool,
  type FieldPacket,
  type Pool,
  type PoolConnection,
  type PoolOptions,
  type QueryResult,
  type SslOptions,
} from 'mysql2/promise';

import { DomainError } from '../errors/DomainError';
import { config } from './env';

import type { StatementPool } from '../adapters/mysql/QueryRunner';

/*
 * Construction and boundary notes for the block below.
 *
 * Pool lifetime is the one documented exception to mismatch M7: state that outlives an invocation is
 * confined to this pool and to nothing else (AAP §0.8.2 Guideline 6). No capacity, timing or
 * concurrency figure is configured, because the legacy source states none (requirement IR-12).
 *
 * The exported surface offers prepared execution and transaction-scoped connection acquisition, and
 * withholds the driver's text-substituting alternative, so an assembled statement string cannot be
 * executed and a bound value cannot be omitted (AAP §0.4.3.4 rule R4). Transaction demarcation is
 * not implemented here: it belongs to src/adapters/mysql/UnitOfWork.ts. The dialect is fixed to
 * MySQL, and that is argued in src/config/env.ts rather than re-argued here.
 *
 * The connection is encrypted with the server certificate chain verified, unless the configured host
 * is a loopback address, which no local server can satisfy. The driver is imported statically
 * because build/esbuild.mjs marks it external and stages it beside the bundle.
 */

/** The placeholder the driver binds a value to. */
const PLACEHOLDER = '?';

/** A value that may be bound to a placeholder. */
export type BoundValue = string | number | bigint | boolean | Date | null;

/** What may appear inside an interpolation of the {@link sql} tag. */
export type StatementInterpolation = BoundValue | PreparedStatement;

/** A statement and the complete, ordered list of values bound to its placeholders. */
export class PreparedStatement {
  /** The statement text, with one `?` placeholder for each entry of {@link values}. */
  public readonly sql: string;

  /** The values bound to the placeholders, in placeholder order. */
  public readonly values: readonly BoundValue[];

  /** The nominal marker that makes this descriptor unsatisfiable by a bare object literal. */
  declare private readonly nominal: undefined;

  private constructor(sql: string, values: readonly BoundValue[]) {
    this.sql = sql;
    this.values = Object.freeze([...values]);
    Object.freeze(this);
  }

  /**
   * Builds a descriptor from the parts of a tagged template.
   */
  public static compose(
    fragments: TemplateStringsArray,
    interpolations: readonly StatementInterpolation[],
  ): PreparedStatement {
    let text = '';
    const values: BoundValue[] = [];

    fragments.forEach((fragment, index) => {
      // A placeholder written into the template rather than interpolated is always a mistake: the
      // value list is built from the interpolations alone, so a literal one would consume a bound
      // value belonging to a later placeholder and shift the whole sequence. Rule R4 makes that
      // ordering load-bearing, so it is refused at construction rather than mis-bound at execution.
      if (fragment.includes(PLACEHOLDER)) {
        throw new DomainError(
          'A prepared statement template must not contain a literal placeholder character. ' +
            'Every bound value is written as an interpolation, which supplies its own placeholder ' +
            'in the right position.',
          { context: { fragmentIndex: index } },
        );
      }

      text += fragment;

      // The literal portions always outnumber the interpolations by one, so the final fragment has
      // no interpolation after it. Tested against the length rather than against an undefined
      // lookup, so that the end of the template and an out-of-type `undefined` interpolation stay
      // distinguishable: the first is normal and the second is refused below.
      if (index >= interpolations.length) {
        return;
      }

      const interpolation = interpolations[index];

      if (interpolation === undefined) {
        // Unreachable from typed code — {@link BoundValue} excludes `undefined` precisely so this
        // is a compile error at the call site — and refused rather than skipped anyway. Skipping it
        // would drop a placeholder and shift every value after it, which is the ordering rule R4
        // makes load-bearing; the driver rejects an undefined bind for the same reason.
        throw new DomainError(
          'A prepared statement cannot bind an undefined value. A column that holds no value is ' +
            'bound as null, which is what the database stores.',
          { context: { interpolationIndex: index } },
        );
      }

      if (interpolation instanceof PreparedStatement) {
        text += interpolation.sql;
        values.push(...interpolation.values);

        return;
      }

      text += PLACEHOLDER;
      values.push(interpolation);
    });

    return new PreparedStatement(text, values);
  }

  /**
   * Builds a descriptor from a statement that already carries its placeholders, plus the values to
   * bind to them in order.
   */
  public static bind(sql: string, values: readonly BoundValue[]): PreparedStatement {
    // A blank statement can only be a construction fault upstream. Refused here so it cannot reach
    // the driver as an empty query, which MySQL answers with a syntax error naming nothing useful.
    if (sql.trim().length === 0) {
      throw new DomainError(
        'A prepared statement cannot be built from blank statement text.',
        // The counts are safe to report; the statement text and the values are not, and neither is
        // named here or anywhere else in this module (AAP §0.8.3.9).
        { context: { valueCount: values.length } },
      );
    }

    const placeholderCount = sql.split(PLACEHOLDER).length - 1;

    if (placeholderCount !== values.length) {
      throw new DomainError(
        'A prepared statement must write exactly one placeholder for each bound value. ' +
          'The statement and the value list disagree, so binding it positionally would either ' +
          'shift every value after the discrepancy or drop the surplus silently.',
        { context: { placeholderCount, valueCount: values.length } },
      );
    }

    return new PreparedStatement(sql, values);
  }
}

/**
 * Builds a {@link PreparedStatement} from a tagged template.
 *
 * @param fragments the literal portions of the template, supplied by the runtime
 * @param interpolations values to bind, and descriptors to splice, in template order
 * @returns the composed, frozen descriptor
 * @throws DomainError when a literal portion of the template contains a placeholder character
 *
 * @example
 * ```ts
 * // src/adapters/mysql/MySqlSkuRepository.ts — one EXISTS clause per selected option, appended in
 * // list order, then the product last. The bound array therefore comes out as the option
 * // identifiers followed by the product identifier, which is exactly the legacy sequence
 * // (AAP §0.3.3.1, rule R4, TR-4), and the seed mirrors the legacy `where 0 = 0` at
 * ```
 */
export function sql(
  fragments: TemplateStringsArray,
  ...interpolations: StatementInterpolation[]
): PreparedStatement {
  return PreparedStatement.compose(fragments, interpolations);
}

/** A pooled connection checked out for the span of one explicit transaction. */
export interface TransactionalConnection {
  /**
   * Runs one statement on this connection, inside whatever transaction it has begun.
   */
  execute<TResult extends QueryResult = QueryResult>(
    sql: string,
    values: readonly BoundValue[],
  ): Promise<[TResult, FieldPacket[]]>;

  /** Opens a transaction on this connection. */
  beginTransaction(): Promise<void>;

  /** Commits the transaction opened on this connection. */
  commit(): Promise<void>;

  /** Rolls back the transaction opened on this connection. */
  rollback(): Promise<void>;

  /** Returns this connection to the pool. Belongs in a `finally`. */
  release(): void;

  /** Takes this connection permanently out of service instead of returning it to the pool. */
  destroy(): void;
}

/**
 * The injectable database surface: prepared execution, plus checkout of a connection for an
 * explicit transaction.
 */
export interface DatabasePool {
  /**
   * Runs one statement on a connection drawn from the pool.
   */
  execute<TResult extends QueryResult = QueryResult>(
    sql: string,
    values: readonly BoundValue[],
  ): Promise<[TResult, FieldPacket[]]>;

  /**
   * Checks out a connection for the caller to run one explicit transaction on.
   */
  getConnection(): Promise<TransactionalConnection>;

  /**
   * Describes a statement that already carries its placeholders, so it can be executed through
   * {@link execute} or through {@link TransactionalConnection.execute}.
   */
  bind(this: void, sql: string, values: readonly BoundValue[]): PreparedStatement;
}

/**
 * Builds the transport options applied in the verified mode, and only there.
 *
 * @returns transport options requiring a verified, identity-checked TLS session.
 */
function verifiedTransportOptions(): SslOptions {
  return { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
}

/** The options the pool is built with, assembled from validated configuration alone. */
const poolOptions: PoolOptions = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  queueLimit: config.database.queueLimit,
  waitForConnections: true,

  /*
   * The two optional bounds are spread in, for the same reason the transport option is. When the
   * operator states no connection limit or no connect timeout, src/config/env.ts leaves the member off
   * the configuration entirely, and this spread leaves the driver option off too — so the driver's own
   * bounded default applies and this subtree states no figure of its own, which is what AAP §0.4.1.3
   * requires when it records that pool sizing "is not carried over". Assigning `undefined` instead
   * would be a different statement and would not type-check under `exactOptionalPropertyTypes`.
   */
  ...(config.database.connectionLimit === undefined
    ? {}
    : { connectionLimit: config.database.connectionLimit }),
  ...(config.database.connectTimeoutMs === undefined
    ? {}
    : { connectTimeout: config.database.connectTimeoutMs }),
  ...(config.database.tlsMode === 'verified' ? { ssl: verifiedTransportOptions() } : {}),

  /*
   * — exact numeric transport. These three options are not tuning; they are a
   * correctness contract that `../adapters/mysql/rowMappers.ts` depends on, and two of them fix a
   * loss that happens inside the driver where no amount of mapper-side validation could ever
   * detect it.
   */
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: false,
};

/** The driver's own pool, created once when this module is first evaluated. */
const driverPool: Pool = createPool(poolOptions);

/**
 * Narrows a pooled connection to the transaction surface, and to prepared-only execution.
 */
function asTransactionalConnection(connection: PoolConnection): TransactionalConnection {
  return Object.freeze({
    execute: <TResult extends QueryResult = QueryResult>(
      sql: string,
      values: readonly BoundValue[],
    ) => connection.execute<TResult>(sql, [...values]),
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => {
      connection.release();
    },
    destroy: () => {
      connection.destroy();
    },
  });
}

/**
 * The connection pool for this service, built once when this module is first evaluated.
 *
 * @example
 * ```ts
 * // src/config/container.ts — wired once, then injected downwards.
 * Import { pool } from './database';
 * ```
 */
export const pool: DatabasePool = Object.freeze({
  execute: <TResult extends QueryResult = QueryResult>(
    sql: string,
    values: readonly BoundValue[],
  ) => driverPool.execute<TResult>(sql, [...values]),
  getConnection: async (): Promise<TransactionalConnection> =>
    asTransactionalConnection(await driverPool.getConnection()),
  // Construction is published as data rather than imported, for the reason recorded on
  // {@link DatabasePool}. It touches neither the driver nor the pool: it is a pure function of its
  // arguments that validates arity and returns a frozen descriptor.
  bind: (sql: string, values: readonly BoundValue[]): PreparedStatement =>
    PreparedStatement.bind(sql, values),
});

/** Compile-time proof that {@link pool} satisfies the adapter layer's driver port. */
type PoolSatisfiesAdapterDriverPort<TPool extends StatementPool> = TPool;
export type ExportedPoolShape = PoolSatisfiesAdapterDriverPort<typeof pool>;
