/**
 * UniquePropertyPort — application-side uniqueness checking for the extracted Catalog slice.
 *
 * Legacy origin: `isUniqueProperty` at org/Hibachi/HibachiDAO.cfc:L130-L146, which enforces
 * uniqueness with an existence query during validation. Its contract was read here; no framework
 * code is carried across (AAP §0.8.3.2). AAP §0.6.3.1 narrows the whole `getHibachiDAO()`
 * framework dependency to this one predicate.
 * IR-5 requires that check in addition to the `unique="true"` column metadata, so the constraints
 * stay the schema's concern and nothing here redeclares them. Five of the eight unique columns in
 * the system are in slice: model/entity/Product.cfc:L54 (`urlTitle`), model/entity/Product.cfc:L56
 * (`productCode`), model/entity/Sku.cfc:L54 (`skuCode`), model/entity/ProductType.cfc:L56
 * (`urlTitle`) and model/entity/Brand.cfc:L55 (`urlTitle`).
 *
 * TODO(parity) divergence 1: model/validation/Option.json:L3 (`optionCode`) and
 * model/validation/OptionGroup.json:L4 (`optionGroupCode`) each carry a save-context `unique` rule
 * while neither model/entity/Option.cfc nor model/entity/OptionGroup.cfc declares `unique="true"`.
 * For those two properties this port is the only uniqueness enforcement in the system — delete it
 * and the constraints vanish rather than degrading to a database guarantee. Carried as observed:
 * no `unique="true"` is proposed and no compensating behaviour is invented (AAP §0.7.3).
 *
 * TODO(parity): uniqueness runs inside the validation pass, which AAP §0.6.2 (mismatch M6)
 * identifies as the slice's most dangerous behaviour, because validation reads back rows the same
 * operation is still writing. When a batch is saved in one operation — the combination engine at
 * model/service/SkuService.cfc:L58-L211 being the case that matters — whether row N's check
 * observes rows 1..N-1 depends on transaction visibility, and the legacy answer is that it does.
 * Flagged, not solved: resolution belongs to src/adapters/mysql/UnitOfWork.ts (AAP §0.4.1.7), and
 * no transaction handle, session object or unit-of-work parameter is added to the signature below.
 */

/*
 * The one type-only import in this file; see the fold's own note for why it exists and why it is safe.
 */
import type { RequestAuthorizationContext } from './AccountContextPort';

/** The single field of a property's metadata that the uniqueness check consumes. */
export interface UniquePropertyMetaData {
  /** The property's declared name, as resolved from the entity's own metadata. */
  readonly name: string;
}

/** The minimal structural shape a uniqueness check needs from the entity being validated. */
export interface UniquePropertyEntity {
  /** resolves the metadata for `propertyName` on this entity. */
  getPropertyMetaData(propertyName: string): UniquePropertyMetaData;

  /** The entity's logical name. */
  getEntityName(): string;

  /**
   * The entity's primary identifier value.
   *
   * TODO(parity): A new row carries no assigned identifier here, which makes the self-exclusion
   * term a no-op. A row being inserted has not been assigned its identifier yet — the legacy
   * accessor at `org/Hibachi/HibachiEntity.cfc:L244-L246` simply forwards to the generated getter
   * for whichever property `getPrimaryIDPropertyName` names, and for an unsaved instance there is
   * nothing there to forward. The self-exclusion term consequently excludes nothing on insert, and
   * the check degenerates to a plain existence test over the whole set. On update the same term is
   * live and does real work: it is what stops a row colliding with itself and reporting its own
   * unchanged value as already taken.
   */
  getPrimaryIDValue(): string;

  /** The name of the entity's primary identifier property. */
  getPrimaryIDPropertyName(): string;

  /**
   * The current value held by `propertyIdentifier` on this entity — the value whose uniqueness is
   * in question.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown;
}

/**
 * Application-side uniqueness checking — the boundary this whole file exists to declare.
 *
 * TODO(boundary): the legacy collaborator on the far side of this boundary is framework code under
 * `org/Hibachi/**`, which AAP §0.8.3.2 places out of scope permanently — the framework "is being
 * retired for this slice, not carried forward". This declaration is the whole of the crossing, and
 * it is what lets the extracted services build, test and package without the rest of Slatwall
 * being converted (AAP §0.8.3.8). No implementation is provided in this file, and none is imported
 * into it.
 */
export interface UniquePropertyPort {
  /**
   * Reports whether `propertyName` on `entity` still holds a value no other row has taken.
   *
   * @param propertyName The property to check, named as the validation rule names it. Resolved
   * through the entity's metadata before use, exactly as at `org/Hibachi/HibachiDAO.cfc:L134`.
   *
   * @param entity The entity carrying the candidate value and its own identifier, which the
   * existence query excludes so an update does not collide with itself.
   */
  isUniqueProperty(propertyName: string, entity: UniquePropertyEntity): Promise<boolean>;
}

/*
 * This module also declares the transaction-boundary port, which is what lets `src/handlers/**` reach
 * a transaction without importing an adapter. AAP §0.4.1 freezes the subtree at 102 files, so it is
 * declared beside the uniqueness probe, whose own subject is what a transaction most often encloses.
 */

/**
 * The transaction boundary a write path runs inside — the port that replaces the legacy's request-end
 * commit.
 */

/**
 * Runs one unit of work inside one transaction, against a graph built for that transaction.
 * @typeParam TGraph - The transaction-scoped capabilities the work needs. Declared by the caller, so a
 * write path depends on nothing wider than it uses.
 */
export interface TransactionalWriteRunner<TGraph> {
  /**
   * @param security - The invocation's resolved security context, from the route gate that authorised
   * this write. Required, and first, so that property population and audit stamping run under the
   * invocation's own principal — `RequestAuthorizationContext.accountContext` and
   * `.populationAuthorization` — rather than under any collaborator a composition root memoised at
   * build time. Without it a deployment could authenticate one principal at the route while the write
   * executed with another's authority (CWE-863, CWE-269).
   */
  runWrite<TResult>(
    security: RequestAuthorizationContext,
    work: (graph: TGraph) => Promise<TResult>,
    hasErrors: () => boolean,
  ): Promise<TResult>;
}
