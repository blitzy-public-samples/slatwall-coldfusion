/**
 * AccountContextPort — the current-account context for the extracted Slatwall Catalog slice.
 * A type-only module. It declares four interfaces and nothing else: no class, no constructor, no
 * function body, no import statement, and therefore not one runtime byte in a packaged Lambda
 * artifact. Consumers reach it through a type-only import, which the compiler erases, so the
 * `domain` -> `ports` references from `src/domain/base/AuditableEntity.ts` and
 * `src/domain/base/populate.ts` create no runtime edge, no module cycle and no bundle-ordering
 * hazard.
 * Two concerns share one Hibachi scope. {@link AccountReference} and {@link AccountContextPort} carry
 * the current-account context that the audit-stamp block reads. {@link
 * EntityPropertyAuthorizationRequest} and {@link PopulationAuthorizationPort} carry the
 * second and third arms of the population gate. They live together because they are the same
 * legacy lookup: `getHibachiScope()` [org/Hibachi/HibachiObject.cfc:L74-L76] is the accessor for
 * all of them, and AAP §0.4.1.6 row 11 charters this file to replace it. The full argument, and
 * the boundary it does not cross, is recorded above the authorisation declarations below.
 */

/*
 * Scope: the legacy audit guard reads exactly two predicates about the current account, so exactly
 * two are declared below. No authentication scheme, session model, token shape, permission set,
 * role hierarchy, tenant concept, expiry or default identifier is introduced: the edge resolves the
 * caller identity and passes it inwards, which keeps this contract free of the transport it arrived
 * on. Carried legacy behaviour is marked TODO(parity) at the member that carries it, and the
 * execution-model mismatch this file owns is stated immediately below.
 */

/*
 * AAP §0.7.3 — the execution-model mismatch this file owns. Surfaced as a decision, not resolved by
 * guesswork.
 */

/*
 * TODO(boundary) — the excluded collaborator. The legacy account object is
 * `model/entity/Account.cfc`, one of the twenty-one `Account*.cfc` files under `model/entity`,
 * `model/service`, `model/dao` and `model/process` that AAP §0.2.2.1 places explicitly out of
 * scope (counted: exactly 21). No entity type for it is declared in this file, and nothing of it
 * is reached beyond the three facts declared below.
 */

/** A minimal, opaque reference to the account an invocation is acting as. */
export interface AccountReference {
  /** The account identifier — the value of the `accountID` primary key. */
  readonly accountID: string;

  /**
   * Gate 2 of the audit guard — `true` while this account has not been persisted yet.
   *
   * TODO(parity): the audit guard calls a member the framework itself marks obsolete — `isNew()`
   * sits inside the "Deprecated Methods" section at [org/Hibachi/HibachiEntity.cfc:L704-L711].
   * The predicate is carried as observed. It is deliberately not re-pointed at the non-deprecated
   * `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571]: the two yield the same value, so
   * re-pointing would change nothing except to obscure what the legacy code does.
   */
  readonly newFlag: boolean;

  /** Gate 3 of the audit guard — `true` when this account is an administrative account. */
  readonly adminAccountFlag: boolean;
}

/*
 * The guard this port EXISTS to make reproducible — three call sites, one contract.
 *
 * TODO(parity): the block is nested inside an initialized-application gate
 * [org/Hibachi/HibachiEntity.cfc:L622 for the insert hook, L670 for the update hook], so audit
 * stamping is silently skipped whenever the application is not yet flagged as initialized —
 * during application setup most notably. That is observable legacy behaviour and it is carried,
 * not repaired (AAP §0.7.3). It is also a second reason the account below must be permitted to be absent:
 * a consumer that cannot stamp has to be able to say so in types rather than fabricate a stamp.
 */

/**
 * The port. Supplies the current-account context to code that must reproduce the legacy audit
 * guard without reaching for ambient framework state.
 */
export interface AccountContextPort {
  /**
   * Returns the account the current invocation is acting as, or `undefined` when there is none.
   *
   * @returns The current account reference, or `undefined` when no account is in context.
   */
  getCurrentAccount(): AccountReference | undefined;
}

/* Population authorisation — the second and third arms of the legacy population gate. */

/** The question arm 3 asks, as one closed value. */
export interface EntityPropertyAuthorizationRequest {
  /** pinned to the single literal `'update'`. */
  readonly crudType: 'update';

  /** The legacy `this.getClassName()` operand [org/Hibachi/HibachiTransient.cfc:L190]. */
  readonly entityName: string;

  /**
   * The property being written — `currentProperty.name`
   * [org/Hibachi/HibachiTransient.cfc:L190].
   */
  readonly propertyName: string;
}

/**
 * The port. Answers arms 2 and 3 of the population gate without reaching for ambient framework
 * state.
 */
export interface PopulationAuthorizationPort {
  /**
   * Arm 2, first operand — `getHibachiScope().getPublicPopulateFlag`
   * [org/Hibachi/HibachiTransient.cfc:L188].
   *
   * @returns `true` when this invocation arrived on a route the legacy treated as public.
   */
  getPublicPopulateFlag(): boolean;

  /**
   * Arm 3 — `getHibachiScope().authenticateEntityProperty(...)`
   * [org/Hibachi/HibachiTransient.cfc:L190], resolved to a single boolean.
   *
   * @param request - The closed question, as declared above.
   * @returns `true` only when the acting principal is permitted to update that property of that
   * entity. `false` whenever permission is absent, unknown or undeterminable.
   */
  authenticateEntityProperty(request: EntityPropertyAuthorizationRequest): boolean;
}

/*
 * What this port is not. Each of the following was weighed against the evidence and rejected;
 * Recorded so the omissions read as decisions rather than oversights (AAP §0.8.2 Guideline 6).
 */

/* Route-level authorisation — the gate the retired framework ran before any controller. */

/** The four operations the legacy entity-authorisation ladder distinguishes. */
export type EntityCrudType = 'create' | 'read' | 'update' | 'delete';

/** One entity-level authorisation question, mirroring the legacy call signature exactly. */
export interface EntityAuthorizationRequest {
  /** The operation being attempted, as the legacy names it. See {@link EntityCrudType}. */
  readonly crudType: EntityCrudType;

  /**
   * The entity the operation targets, spelled as the legacy component name — `Brand`, `Option`,
   * `Product`, `Sku` — because that is the string the legacy substring arithmetic produces and the
   * string the permission tables behind the boundary are keyed on.
   */
  readonly entityName: string;

  /** The identifier of the resource the request addresses, when it addresses one. */
  readonly entityID?: string;
}

/** The resolved entity-level authoriser: the handler layer's half of the legacy request gate. */
export interface EntityAuthorizationPort {
  /**
   * Answers whether the current invocation may perform `crudType` on `entityName`.
   *
   * @param request the question, as {@link EntityAuthorizationRequest} declares it
   * @returns `true` only when authorisation was positively established; `false` otherwise, and in
   * particular `false` — never a throw and never `undefined` — when it could not be established.
   */
  authenticateEntity(request: EntityAuthorizationRequest): boolean;
}

/** The two collaborators the legacy request gate resolved from the framework scope, together. */
export interface RequestAuthorizationContext {
  /** Supplies the account this invocation is acting as, or `undefined` when there is none. */
  readonly accountContext: AccountContextPort;

  /** Supplies the resolved entity-level verdict. */
  readonly entityAuthorization: EntityAuthorizationPort;

  /** Supplies the property-level verdict population runs under. */
  readonly populationAuthorization: PopulationAuthorizationPort;
}

/**
 * Resolves the per-invocation authorisation context from the incoming request.
 * @typeParam TRequest the request shape the resolver reads; a handler supplies the narrow slice it
 * already accepts, so no handler widens its own event contract to obtain a principal.
 */
export type RequestAuthorizationResolver<TRequest> = (
  request: TRequest,
) => RequestAuthorizationContext;

/** Everything a resolver is told about one invocation, in one immutable value. */
export interface InvocationSecurityRequest {
  /**
   * The routed action being invoked, as the routing layer addresses it — `product.saveProduct`,
   * `sku.createSkus`, `google:feed.product`.
   */
  readonly action: string;

  /** The operation being attempted on {@link entityName}. See {@link EntityCrudType}. */
  readonly crudType: EntityCrudType;

  /**
   * The entity the operation targets, from the handler's own declaration — never from the request.
   * See {@link EntityAuthorizationRequest.entityName}.
   */
  readonly entityName: string;

  /**
   * The addressed resource, when one is addressed. Absent means a creation.
   * See {@link EntityAuthorizationRequest.entityID} for the full contract, which is the same one.
   */
  readonly entityID?: string;

  /** The request's HTTP method, when the invocation carries one. */
  readonly httpMethod?: string;

  /** The request headers, exactly as received and entirely unverified. */
  readonly headers: Readonly<Record<string, string | undefined>>;

  /**
   * Claims a gateway authoriser the deployment TRUSTS has already established for this invocation.
   */
  readonly authorizerClaims?: Readonly<Record<string, unknown>>;
}

/** The resolver every routed member of this deliverable gates on, for one invocation. */
export type InvocationSecurityResolver = RequestAuthorizationResolver<InvocationSecurityRequest>;

/** The four access classifications the legacy declared on a controller, as a closed union. */
export type HandlerAccessClassification = 'public' | 'anyLogin' | 'anyAdmin' | 'secure';
