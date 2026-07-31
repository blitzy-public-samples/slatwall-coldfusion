/**
 * AccountContextPort — the current-account context for the extracted Slatwall Catalog slice.
 *
 * A TYPE-ONLY module. It declares four interfaces and nothing else: no class, no constructor, no
 * function body, no import statement, and therefore not one runtime byte in a packaged Lambda
 * artifact. Consumers reach it through a type-only import, which the compiler erases, so the
 * `domain` -> `ports` references from `src/domain/base/AuditableEntity.ts` and
 * `src/domain/base/populate.ts` create no runtime edge, no module cycle and no bundle-ordering
 * hazard.
 *
 * TWO CONCERNS, ONE HIBACHI SCOPE. {@link AccountReference} and {@link AccountContextPort} carry
 * the current-account context that the audit-stamp block reads. {@link
 * EntityPropertyAuthorizationRequest} and {@link PopulationAuthorizationPort} carry the
 * second and third arms of the population gate. They live together because they are the same
 * legacy lookup: `getHibachiScope()` [org/Hibachi/HibachiObject.cfc:L74-L76] is the accessor for
 * all of them, and AAP §0.4.1.6 row 11 charters this file to replace it. The full argument, and
 * the boundary it does NOT cross, is recorded above the authorisation declarations below.
 *
 * AAP AUTHORITY
 *   §0.4.1.6 "Ports", row 11 — CREATE from `org/Hibachi/HibachiObject.cfc:L74-L76`, key change
 *     "Replaces the request-scoped Hibachi scope lookup".
 *   §0.2.2.7 "Boundary Ports", row 6 — same origin, purpose "Current-account context".
 *   §0.6.3.1 — `getHibachiScope()` has six call sites in `model/service/ProductService.cfc`
 *     (L166, L167, L200, L201, L240, L253) and is classified a FRAMEWORK ARTIFACT whose treatment
 *     is "Excluded; account context via AccountContextPort". Read that precisely: the scope object
 *     does not cross the boundary. Only the account context does, and this port is what carries it.
 *
 * LEGACY MECHANISM BEING REPLACED — it is two struct reads deep
 *   org/Hibachi/HibachiObject.cfc:L74-L76 — `getHibachiScope()` returns
 *     `request[ "#getApplicationValue("applicationKey")#Scope" ]`.
 *   org/Hibachi/HibachiScope.cfc:L134-L135 — `getAccount()` on that object returns
 *     `getSession().getAccount()`.
 *
 * AUTHORITATIVE CONSUMER — the audit-stamp block of the ORM lifecycle hooks at
 * `org/Hibachi/HibachiEntity.cfc:L622-L648` and `L670-L679`, ported as
 * `src/domain/base/AuditableEntity.ts`. That file imports this one; the direction is never
 * reversed, and this file imports nothing from the domain layer.
 */

/*
 * SCOPE. The legacy audit guard reads exactly two predicates about the current account, so exactly
 * two are declared below. No authentication scheme, session model, token shape, permission set,
 * role hierarchy, tenant concept, expiry or default identifier is introduced: the edge resolves the
 * caller identity and passes it inwards, which keeps this contract free of the transport it arrived
 * on. Carried legacy behaviour is marked TODO(parity) at the member that carries it, and the
 * execution-model mismatch this file owns is stated immediately below.
 */

/*
 * S8 — THE EXECUTION-MODEL MISMATCH THIS FILE OWNS. Surfaced as a decision, not resolved by
 * guesswork.
 *
 * FINDING. `getHibachiScope()` [org/Hibachi/HibachiObject.cfc:L73-L76] is a literal read out of
 * the CFML `request` scope struct, keyed by an application-scoped string — the whole body is
 * `return request[ "#getApplicationValue("applicationKey")#Scope" ];`. It therefore depends on two
 * things at once: (a) a persistent application scope holding `applicationKey`, and (b) a
 * per-request mutable struct that the FW/1 front controller populated earlier in the same request
 * lifecycle.
 *
 * CONSEQUENCE. A stateless Lambda invocation has NEITHER. There is no request scope to read out
 * of and no application scope to key it by, so the mechanism has no equivalent to port. This is
 * precisely why AAP §0.6.3.1 classifies `getHibachiScope()` as a framework artifact to EXCLUDE
 * and narrows the crossing to the account context alone.
 *
 * DECISION RECORDED. The caller identity is resolved once at the edge and injected inwards as an
 * implementation of the interface below, instead of being fetched out of ambient state by the code
 * that needs it. Nothing in this slice reads a request-scoped or application-scoped container.
 *
 * SECOND, RELATED MISMATCH. The whole audit-stamp block is itself nested inside an initialized-
 * application gate — `hasApplicationValue("initialized") && getApplicationValue("initialized")`
 * at [org/Hibachi/HibachiEntity.cfc:L622] for the insert hook and again at [L670] for the update
 * hook. A Lambda invocation has no application-initialization lifecycle either, so that gate has
 * no direct counterpart. Its observable effect is carried under TODO(parity) further down rather
 * than being reasoned away.
 *
 * These are the same CLASS of mismatch as AAP §0.6.6 M5 ("there is no request-end hook in a
 * stateless handler"), which is cross-referenced only: M5 is not this file's item, it belongs to
 * `src/adapters/mysql/UnitOfWork.ts`.
 */

/*
 * TODO(boundary) — THE EXCLUDED COLLABORATOR. The legacy account object is
 * `model/entity/Account.cfc`, one of the twenty-one `Account*.cfc` files under `model/entity`,
 * `model/service`, `model/dao` and `model/process` that AAP §0.2.2.1 places explicitly out of
 * scope (counted: exactly 21). No entity type for it is declared in this file, and nothing of it
 * is reached beyond the three facts declared below.
 *
 * TR-5, verbatim: "Cross the scope boundary only through a declared port. Where an in-scope
 * member depends on an out-of-scope collaborator, the port interface is declared, the member is
 * implemented against it, and the gap is flagged. The member is never quietly dropped from the
 * interface." This declaration is that port and this comment is that flag. It is also what keeps
 * AAP §0.8.2 Guideline 3 satisfiable: without it, stamping a single audit column would drag the
 * whole excluded account family into the slice.
 *
 * WHAT STAYS BEHIND THE BOUNDARY, and must not be re-modelled here: the admin predicate is
 * DERIVED inside the excluded entity from `getSuperUserFlag()` and the length of its
 * `permissionGroups` collection [model/entity/Account.cfc:L173-L178]. This port carries the
 * RESOLVED boolean only. Reproducing that derivation would mean inventing the permission and role
 * model that S9 forbids and that the Catalog slice has no business owning.
 */

/**
 * A minimal, opaque reference to the account an invocation is acting as.
 *
 * Deliberately NOT an entity. `model/entity/Account.cfc:L49` is out of scope (see the
 * TODO(boundary) note above), so this declares the identifier plus the only two predicates the
 * legacy audit guard actually reads [org/Hibachi/HibachiEntity.cfc:L628 and L633] — nothing more.
 * It is a plain data shape with no behaviour, which makes it trivially constructible in a
 * hand-written test double.
 *
 * The three members below are the complete set of facts that cross this boundary. Each one is
 * present because a legacy expression reads it, and each carries the locator of that expression.
 */
export interface AccountReference {
  /**
   * The account identifier — the value of the `accountID` primary key.
   *
   * Declared in the excluded entity as
   * `property name="accountID" ormtype="string" length="32" fieldtype="id" generator="uuid"`
   * [model/entity/Account.cfc:L52], so it is a 32-character identifier string (IR-6) belonging to
   * the `SwAccount` table [model/entity/Account.cfc:L49].
   *
   * It is opaque to this slice: nothing here parses it, ranges over it or derives meaning from it.
   * It exists so a consumer can record WHICH account a stamp refers to, which is what
   * `setCreatedByAccount(...)` [org/Hibachi/HibachiEntity.cfc:L629] and `setModifiedByAccount(...)`
   * [org/Hibachi/HibachiEntity.cfc:L634] persisted.
   */
  readonly accountID: string;

  /**
   * GATE 2 of the audit guard — `true` while this account has not been persisted yet.
   *
   * The legacy predicate is the NEGATION of this flag: `!getHibachiScope().getAccount().isNew()`
   * at [org/Hibachi/HibachiEntity.cfc:L628] and again at [org/Hibachi/HibachiEntity.cfc:L633].
   *
   * TRANSLATION DECISION (AAP §0.8.2 Guideline 6). The legacy polarity is preserved exactly, so
   * the guard translates to `!account.newFlag` and no inversion defect is possible at the call
   * site. Inverting the flag here to read more fluently would silently swap which accounts get
   * stamped — a behaviour change, which AAP §0.8.1 forbids even while it invites idiom changes.
   *
   * The type is pinned by the legacy source rather than chosen: `isNew()` is declared
   * `public boolean function` at [org/Hibachi/HibachiEntity.cfc:L707], and the `getNewFlag()` it
   * delegates to is declared `public boolean function` at [org/Hibachi/HibachiEntity.cfc:L571],
   * returning `true` exactly when the primary identifier is the empty string.
   *
   * TODO(parity): the audit guard calls a member the framework itself marks obsolete — `isNew()`
   * sits inside the "Deprecated Methods" section at [org/Hibachi/HibachiEntity.cfc:L704-L711].
   * The predicate is carried as observed. It is deliberately not re-pointed at the non-deprecated
   * `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571]: the two yield the same value, so
   * re-pointing would change nothing except to obscure what the legacy code does.
   */
  readonly newFlag: boolean;

  /**
   * GATE 3 of the audit guard — `true` when this account is an administrative account.
   *
   * Read as `getHibachiScope().getAccount().getAdminAccountFlag()` at
   * [org/Hibachi/HibachiEntity.cfc:L628] and again at [org/Hibachi/HibachiEntity.cfc:L633], AND-ed
   * with GATE 2 in both places.
   *
   * `boolean` is pinned by the legacy source, not inferred: the accessor is declared
   * `public boolean function getAdminAccountFlag()` at [model/entity/Account.cfc:L173], and its
   * non-persistent property declaration is at [model/entity/Account.cfc:L106]. Widening it to a
   * truthy value, a string flag or an optional would be a behaviour change rather than an idiom
   * change. How the flag is computed stays behind the boundary — see the TODO(boundary) note.
   */
  readonly adminAccountFlag: boolean;
}

/*
 * THE GUARD THIS PORT EXISTS TO MAKE REPRODUCIBLE — three call sites, one contract.
 *
 *   org/Hibachi/HibachiEntity.cfc:L628 — createdByAccount, inside the insert hook `preInsert()`
 *     [declared at L598], with the stamp applied at L629.
 *   org/Hibachi/HibachiEntity.cfc:L633 — modifiedByAccount, in the same hook, stamp at L634.
 *   org/Hibachi/HibachiEntity.cfc:L675-L678 — modifiedByAccount AGAIN, on a second and distinct
 *     code path: the update hook `preUpdate()` [declared at L651], whose own initialized gate is
 *     at L670, whose condition is at L676 and whose stamp is at L677.
 *
 * The account portion of the condition — `!( ... ).isNew()` AND `( ... ).getAdminAccountFlag()`
 * — is BYTE-IDENTICAL at all three of those locators. The only operand that differs is the
 * `structKeyExists(this, "setCreatedByAccount")` versus `structKeyExists(this,
 * "setModifiedByAccount")` test, and that one asks whether the ENTITY carries a setter, not
 * anything about the account. Three sites, one duplicated pair of account predicates, is exactly
 * why this belongs in a declared port instead of being inlined three times.
 *
 * Modelling the paths is `src/domain/base/AuditableEntity.ts`'s job; this file models the facts
 * once. The second path is recorded here only so that the implementer of that file knows two of
 * them exist.
 *
 * TODO(parity): the block is nested inside an initialized-application gate
 * [org/Hibachi/HibachiEntity.cfc:L622 for the insert hook, L670 for the update hook], so audit
 * stamping is SILENTLY SKIPPED whenever the application is not yet flagged as initialized —
 * during application setup most notably. That is observable legacy behaviour and it is carried,
 * not repaired (S7). It is also a second reason the account below must be permitted to be absent:
 * a consumer that cannot stamp has to be able to say so in types rather than fabricate a stamp.
 *
 * TRANSLATION DECISION, not a carried behaviour, so deliberately NOT marked TODO(parity): the
 * legacy expression re-reads the scope and the account up to four times across a single
 * condition-and-stamp pair [org/Hibachi/HibachiEntity.cfc:L628-L629] and again at
 * [org/Hibachi/HibachiEntity.cfc:L633-L634]. That repetition is an artifact of reaching into
 * ambient state and carries no behaviour of its own, so this port exposes one accessor and a
 * consumer is free to call it once. Idiom changed, behaviour preserved (AAP §0.8.1).
 */

/**
 * The port. Supplies the current-account context to code that must reproduce the legacy audit
 * guard without reaching for ambient framework state.
 *
 * An implementation is received as a typed constructor parameter (S3, AAP §0.4.3.1): the DI/1
 * property injection and the string-keyed `request[...]` read the legacy code relied on are both
 * replaced by one explicit, compile-checked dependency. A port declares a contract and resolves
 * nothing, so there is no lookup helper, no container reference and no singleton in this file.
 *
 * Every member is synchronous, because the legacy path performs no input or output at all: it is
 * one struct read [org/Hibachi/HibachiObject.cfc:L74-L76] followed by a delegating accessor
 * [org/Hibachi/HibachiScope.cfc:L134-L135] and two in-memory property reads
 * [org/Hibachi/HibachiEntity.cfc:L571, model/entity/Account.cfc:L173]. Returning a promise would
 * force awaiting into the audit-stamping path of `src/domain/base/AuditableEntity.ts`, which
 * performs no input or output either.
 *
 * The interface is satisfiable by a plain object literal, deliberately: test doubles here are
 * written by hand because the legacy repository vendored no mocking library at all and its suite
 * booted the entire FW/1 application instead (AAP §0.4.3.6).
 *
 *     const unauthenticated: AccountContextPort = { getCurrentAccount: () => undefined };
 *
 *     const stampable: AccountContextPort = {
 *       getCurrentAccount: () => ({ accountID, newFlag: false, adminAccountFlag: true }),
 *     };
 */
export interface AccountContextPort {
  /**
   * Returns the account the current invocation is acting as, or `undefined` when there is none.
   *
   * This replaces the two-step ambient read `getHibachiScope().getAccount()`
   * [org/Hibachi/HibachiObject.cfc:L74-L76, then org/Hibachi/HibachiScope.cfc:L134-L135] with one
   * injected call. The framework member names are deliberately not carried across (AAP §0.8.3.2:
   * the framework is a boundary to extract from, so its contract is read and none of its code or
   * naming is): the legacy accessor is also declared with an unconstrained CFML return type, and
   * this one is typed.
   *
   * ABSENCE IS EXPLICIT AND MEANINGFUL. `undefined` means there is no current account at all — an
   * unauthenticated or system context — and that is a DIFFERENT state from an account which is
   * present but has `adminAccountFlag: false`. Both stay distinguishable because that is exactly
   * the distinction the legacy three-part guard turns on [org/Hibachi/HibachiEntity.cfc:L628 and
   * L633]: not stamping because nobody is acting, and not stamping because the actor is not an
   * administrator, are different reasons that happen to share an outcome. Collapsing them — by
   * making the account non-optional, or by handing back a fabricated placeholder — would make the
   * guard unreachable and the reason unrecoverable.
   *
   * `exactOptionalPropertyTypes` is in effect for this subtree (`slatwall-ts/tsconfig.json`), and
   * it is what makes the distinction hold at the consumer too. A caller that keeps the reference
   * in an optional property — `createdByAccount?: AccountReference`, the shape columns stamped at
   * [org/Hibachi/HibachiEntity.cfc:L629] and [org/Hibachi/HibachiEntity.cfc:L634] need — cannot
   * assign `undefined` into that property. It must leave the property off, or `delete` it. That
   * pressure is intended: it forces the GATE 2 and GATE 3 conjunction to be written out before a
   * stamp is applied, instead of an absent account quietly becoming a present-but-empty one.
   *
   * Reproducing the guard is then mechanical, and it is the consumer's job rather than this port's:
   * apply a stamp only when an account is returned, AND its `newFlag` is `false`, AND its
   * `adminAccountFlag` is `true` — the same conjunction, in the same order, as
   * [org/Hibachi/HibachiEntity.cfc:L628] and [org/Hibachi/HibachiEntity.cfc:L633].
   *
   * @returns The current account reference, or `undefined` when no account is in context.
   */
  getCurrentAccount(): AccountReference | undefined;
}

/* =============================================================================================
 * POPULATION AUTHORISATION — THE SECOND AND THIRD ARMS OF THE LEGACY POPULATION GATE.
 *
 * WHY THIS BELONGS IN THIS FILE AND NOT A NEW ONE. Both facts declared below are members of
 * `org/Hibachi/HibachiScope.cfc` — `publicPopulateFlag` is its property at
 * [org/Hibachi/HibachiScope.cfc:L8] and `authenticateEntityProperty()` is its method at
 * [org/Hibachi/HibachiScope.cfc:L207-L209]. AAP §0.4.1.6 row 11 charters THIS port to replace
 * "the request-scoped Hibachi scope lookup", and AAP §0.2.2.7 row 6 gives its origin as
 * `org/Hibachi/HibachiObject.cfc:L74-L76` — which is `getHibachiScope()` itself, the accessor
 * every one of these reads goes through. They are the same lookup, reached from the same
 * accessor, so they are declared alongside the account context rather than in a file the AAP
 * does not enumerate.
 *
 * THE GATE BEING REPRODUCED — [org/Hibachi/HibachiTransient.cfc:L186-L190], verbatim:
 *
 *     !isPersistent()
 *     ||
 *     (getHibachiScope().getPublicPopulateFlag() && structKeyExists(currentProperty,
 *          "hb_populateEnabled") && currentProperty.hb_populateEnabled == "public")
 *     ||
 *     getHibachiScope().authenticateEntityProperty( crudType="update",
 *          entityName=this.getClassName(), propertyName=currentProperty.name)
 *
 * ARM 1 is `PropertyDescriptorSet.persistent` in `../domain/base/populate` and needs nothing from
 * this port. ARMS 2 AND 3 need exactly the two members declared below, and nothing else.
 *
 * WHY THIS IS PARITY RESTORATION AND NOT AN INVENTED CONTROL. The gate is legacy code on the live
 * population path, read here rather than recalled. Its omission was recorded in
 * `../domain/base/populate` as a TR-5 boundary gap; closing it re-establishes behaviour AAP
 * §0.8.2 Guideline 2 requires be preserved, so declaring these two members is the S7-compliant
 * action and leaving them out was the divergence.
 *
 * S9 — WHAT DOES *NOT* CROSS, AND WHY THE "WHAT THIS PORT IS NOT" NOTE BELOW STILL HOLDS. The
 * decision procedure behind ARM 3 stays entirely behind the boundary. Traced in full it is
 * [org/Hibachi/HibachiScope.cfc:L207] -> `authenticateEntityPropertyCrudByAccount`
 * [org/Hibachi/HibachiAuthenticationService.cfc:L104-L119] -> a `getSuperUserFlag()` bypass at
 * [L106], then a loop over `getPermissionGroups()` at [L111] into
 * `authenticateEntityPropertyByPermissionGroup` [L372-L390], which reads
 * `getPermissionsByDetails()`, consults a property-level allow flag, falls back to an
 * entity-level one at [L389], and follows `inheritPermissionEntityName` recursively at
 * [L360-L362]. Permission groups, permission records, allow flags, inheritance chains and the
 * super-user bypass are ALL out of scope: `model/**\/Account*.cfc` is 21 excluded files (AAP
 * §0.2.2.1) and `org/Hibachi/**` is 938 reference-only files (AAP §0.8.3.2). Only the RESOLVED
 * boolean crosses, exactly as `AccountReference.adminAccountFlag` above carries a resolved
 * boolean instead of re-deriving it. No permission, group, role, scheme, token, session or
 * tenant model is declared anywhere in this file.
 *
 * DEFAULT DENY IS STRUCTURAL, NOT A DEFAULT VALUE. The legacy ladder ends in `return false` twice
 * over — [org/Hibachi/HibachiAuthenticationService.cfc:L118] for the account-level walk and
 * [org/Hibachi/HibachiAuthenticationService.cfc:L389] by falling through to an entity-level check
 * that itself ends `return false` at [L369]. There is no permissive fallback anywhere in it. The
 * target expresses that by making an implementation of {@link PopulationAuthorizationPort} a
 * REQUIRED argument of population: no policy means no call compiles, so "populate without a
 * policy" is not a state a caller can reach. That is deliberately stronger than a default-deny
 * default value, which a caller could still forget to consider.
 * ============================================================================================= */

/**
 * The question ARM 3 asks, as one closed value.
 *
 * Every member is present because the legacy call at
 * [org/Hibachi/HibachiTransient.cfc:L190] passes it, and no member is present that it does not.
 */
export interface EntityPropertyAuthorizationRequest {
  /**
   * Pinned to the single literal `'update'`.
   *
   * [org/Hibachi/HibachiTransient.cfc:L190] passes `crudType="update"` and nothing else, and the
   * population path is the only caller this slice ports. The legacy parameter is an
   * unconstrained `required string` [org/Hibachi/HibachiScope.cfc:L207] whose value is
   * concatenated into an accessor name — `invokeMethod("getAllow#arguments.crudType#Flag")` at
   * [org/Hibachi/HibachiAuthenticationService.cfc:L379] — so an unexpected value there produced a
   * missing-method failure rather than a denial.
   *
   * Declaring the literal instead of `string` therefore does two things at once: it records which
   * value the population gate actually uses, and it makes a different value a COMPILE error
   * rather than a runtime one. Widening it to a CRUD vocabulary this slice never exercises would
   * be invention (S9).
   */
  readonly crudType: 'update';

  /**
   * The legacy `this.getClassName()` operand [org/Hibachi/HibachiTransient.cfc:L190].
   *
   * `getClassName()` [org/Hibachi/HibachiObject.cfc:L135-L137] returns
   * `listLast(getClassFullname(), ".")` — the bare component name, so `Brand`, `Product`, `Sku`,
   * `Option`, `OptionGroup`, `ProductType`, and for a process object `Product_AddOption`. It is
   * supplied by the caller from its declared descriptor set rather than derived by reflection,
   * because reflection is the framework machinery TR-3 retires.
   */
  readonly entityName: string;

  /**
   * The property being written — `currentProperty.name`
   * [org/Hibachi/HibachiTransient.cfc:L190].
   *
   * Typed `string` rather than a per-entity union deliberately: an implementation of this port
   * lives outside the slice and cannot depend on the in-scope property-name unions without
   * inverting the dependency direction a port exists to keep one-way (S4). The CALLER supplies it
   * from its own declared union, so the value is closed at the point it is produced.
   */
  readonly propertyName: string;
}

/**
 * The port. Answers ARMS 2 and 3 of the population gate without reaching for ambient framework
 * state.
 *
 * An implementation is received as a typed constructor parameter (S3, AAP §0.4.3.1) and is
 * satisfiable by a plain object literal, for the same reason the account port above is: the legacy
 * repository vendored no mocking library at all (AAP §0.4.3.6).
 *
 *     const denyAll: PopulationAuthorizationPort = {
 *       getPublicPopulateFlag: () => false,
 *       authenticateEntityProperty: () => false,
 *     };
 *
 * Both members are synchronous. The legacy path performs no input or output: the flag is a struct
 * read [org/Hibachi/HibachiScope.cfc:L8] and the authorisation walk reads an already-hydrated
 * permission-group collection [org/Hibachi/HibachiAuthenticationService.cfc:L111]. Returning a
 * promise would force `await` into a population loop that performs none.
 *
 * ⛔ THIS IS THE ONE DECLARATION OF THIS PORT, AND IT LIVES IN THE PORTS LAYER. Equivalent
 * interfaces were briefly declared inside `../domain/base/populate.ts` as well — semantically
 * identical, differing only in member spelling — and a domain module declaring a port inverts the
 * hexagonal layering the plan sets out (AAP §0.3.1, §0.7.3 "hexagonal separation"): the domain
 * CONSUMES ports, the ports layer DECLARES them. Those declarations are gone and `populate.ts` now
 * imports this one, so a caller cannot accidentally satisfy one shape and be rejected by the other.
 *
 * THE MEMBER NAMES MIRROR THE LEGACY ACCESSORS DELIBERATELY. `getPublicPopulateFlag` is the name of
 * the accessor at [org/Hibachi/HibachiTransient.cfc:L188] and `authenticateEntityProperty` the name
 * of the call at [:L190]. More idiomatic spellings were considered and rejected: the correspondence
 * to the legacy names is what lets a reviewer check this gate against the source by search, which
 * the plan's provenance discipline asks for and which reads more clearly here than TypeScript
 * convention would.
 *
 * ⚠️⚠️ ABSENT MEANS DENY, NOT ALLOW, AND THAT ASYMMETRY IS THE POINT. The legacy default at
 * [org/Hibachi/HibachiTransient.cfc:L186] is `false`, so a population with NO authoriser wired must
 * refuse to write persistent properties. A port treated as permissive when unwired would be
 * strictly more permissive than the system it replaces — which is why the consumer's option is
 * declared, and checked, as fail-closed rather than defaulted.
 */
export interface PopulationAuthorizationPort {
  /**
   * ARM 2, FIRST OPERAND — `getHibachiScope().getPublicPopulateFlag()`
   * [org/Hibachi/HibachiTransient.cfc:L188].
   *
   * WHAT THE FLAG MEANS, read from its writers rather than from its name. It is initialised
   * `false` at [org/Hibachi/HibachiScope.cfc:L22] and is set `true` in exactly two places
   * repository-wide: [Application.cfc:L59-L63], whose whole body is
   * `if(listFindNoCase("public,frontend", getSubsystem(request.context.slatAction))) {
   * getHibachiScope().setPublicPopulateFlag( true ); }`, and [admin/controllers/main.cfc:L213].
   * So it answers one question — "did this invocation arrive on a public or frontend route?" — and
   * it is a property of the ROUTE, not of the account. It is declared here rather than on
   * {@link AccountReference} for that reason.
   *
   * It is a method rather than a readonly field because the legacy operand is an accessor call
   * evaluated at gate time, and because ARM 2 short-circuits on it: a property that is not
   * declared public never causes the flag to be consulted at all when the caller evaluates the
   * operands in legacy order.
   *
   * @returns `true` when this invocation arrived on a route the legacy treated as public.
   */
  getPublicPopulateFlag(): boolean;

  /**
   * ARM 3 — `getHibachiScope().authenticateEntityProperty(...)`
   * [org/Hibachi/HibachiTransient.cfc:L190], resolved to a single boolean.
   *
   * The implementation MUST default to denial. Every terminal branch of the legacy ladder returns
   * false — [org/Hibachi/HibachiAuthenticationService.cfc:L118] after the permission-group walk
   * finds nothing, [L369] when no entity-level allow flag is found, and [L383-L386] when an
   * explicit property record exists and its allow flag is off — so an implementation that cannot
   * reach a decision returns `false`, never `true`.
   *
   * @param request - The closed question, as declared above.
   * @returns `true` only when the acting principal is permitted to update that property of that
   *   entity. `false` whenever permission is absent, unknown or undeterminable.
   */
  authenticateEntityProperty(request: EntityPropertyAuthorizationRequest): boolean;
}

/*
 * WHAT THIS PORT IS NOT. Each of the following was weighed against the evidence and rejected;
 * recorded so the omissions read as decisions rather than oversights (AAP §0.8.2 Guideline 6).
 *
 *   The scope object itself. `getHibachiScope()` [org/Hibachi/HibachiObject.cfc:L74-L76] is
 *     classified a framework artifact to exclude (AAP §0.6.3.1). No port stands in for it; only
 *     the account context crosses.
 *   `getBaseURL()` [org/Hibachi/HibachiObject.cfc:L79-L81] — not account context.
 *   `getURLFromPath()` [org/Hibachi/HibachiObject.cfc:L83-L92] — not account context, and not a
 *     port of its own either: it is a pure string transform over `expandPath('/')` with no setting
 *     read, no account and no input or output. Tested and rejected as a new port.
 *   The base image URL accessor on the framework scope, read at [model/entity/Sku.cfc:L145-L146]
 *     for `getImagePath()` — that belongs to `src/ports/ImagePathPort.ts` and is cited there.
 *   `getAccountContentAccessesSmartList()` [model/entity/Account.cfc:L491] — content access is
 *     `src/ports/AccessContentPort.ts`'s concern, and the entity declaring it is excluded anyway.
 *   The logged-in session predicate. Of the six framework-scope call sites in
 *     `model/service/ProductService.cfc`, only [L167] reads the account; [L166] reads
 *     `getLoggedInFlag()` [org/Hibachi/HibachiScope.cfc:L40] on the product-review path, which AAP
 *     §0.4.2.1 boundary-stubs; [L200], [L201] and [L240] read `setting(...)`, which is
 *     `src/ports/SettingResolverPort.ts`; and [L253] reads a resource-bundle key. A session flag is
 *     not an account fact, and modelling sessions, tokens, permissions or roles here would be
 *     invention (S9).
 *   The permission model behind ARM 3, which is a DIFFERENT thing from the boolean ARM 3 returns
 *     and is the distinction the bullet above turns on. `PermissionGroup`, `Permission`, the
 *     `getAllow<crudType>Flag` accessors, `getPermissionsByDetails()`, the
 *     `inheritPermissionEntityName` recursion at
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L360-L362] and the `getSuperUserFlag()` bypass
 *     at [L106] are NONE of them declared here. {@link PopulationAuthorizationPort} declares the
 *     QUESTION and receives an ANSWER; the procedure that produces the answer stays behind the
 *     boundary, exactly as `AccountReference.adminAccountFlag` keeps its own derivation
 *     [model/entity/Account.cfc:L173-L178] behind it.
 *   A route-level or entity-level authorisation member ON {@link PopulationAuthorizationPort}.
 *     `authenticateAction( action )` [org/Hibachi/HibachiScope.cfc:L199-L201] and
 *     `authenticateEntity( crudType, entityName )` [org/Hibachi/HibachiScope.cfc:L203-L205] are
 *     real members of the same framework scope, but the population gate calls NEITHER —
 *     [org/Hibachi/HibachiTransient.cfc:L190] calls only `authenticateEntityProperty`. Adding
 *     either to the population port would put an unused member on it (S9). The entity-level
 *     authoriser is declared instead as its OWN port, {@link EntityAuthorizationPort}, below,
 *     because its caller is a different layer: the legacy request gate `setupRequest()`
 *     [org/Hibachi/Hibachi.cfc:L182-L203], whose target in this port is `src/handlers/**`.
 *   `getTableTopSortOrder(...)`, the neighbour inside the very same gated block
 *     [org/Hibachi/HibachiEntity.cfc:L637-L647] — that belongs to
 *     `src/adapters/mysql/UnitOfWork.ts`. Cited, not carried.
 *   An account class, an entity type, a base class or a re-declaration of the auditable entity —
 *     `src/domain/base/AuditableEntity.ts` imports this file, never the reverse.
 */

/* ==========================================================================================
 * ROUTE-LEVEL AUTHORISATION — the gate the retired framework ran before any controller
 * ==========================================================================================
 *
 * WHY THIS SECTION EXISTS
 * -----------------------
 * The legacy application authenticated EVERY request before a controller method ran, in one
 * place. `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203] opens with the comment "Verify
 * Authentication before anything happens" and then, at [:L188]:
 *
 *     if(!getHibachiScope().authenticateAction( action=request.context[ getAction() ] )) { ... }
 *
 * — redirecting an unauthorised caller to the configured login action [:L197-L200]. Nothing in a
 * legacy controller repeated that check, because nothing needed to: no controller method was
 * reachable without it. That gate is framework code (AAP §0.8.3.2 — `org/Hibachi/**` is a
 * boundary to extract from, never carried forward), so its CODE does not cross over; its
 * CONTRACT does, and this section is where the contract is declared.
 *
 * Restoring an authorisation gate in `src/handlers/**` is therefore PARITY, not invented policy.
 * The only thing that genuinely changes is the failure MODE: a headless service cannot redirect
 * a machine client to an HTML login form, so `src/handlers/httpResponse.ts` reports the refusal
 * with a status code instead. That translation is recorded there (AAP §0.8.2 Guideline 6).
 *
 * WHAT IS DECLARED HERE, AND WHAT DELIBERATELY IS NOT
 * --------------------------------------------------
 * `authenticateActionByAccount` [org/Hibachi/HibachiAuthenticationService.cfc:L7-L84] is a
 * five-step ladder, and only its shape is portable — its machinery is not:
 *
 *   1. [:L10-L12]  `getSuperUserFlag()` bypass.
 *   2. [:L20-L22]  an unregistered subsystem, or one with no secure methods, is ADMITTED.
 *   3. [:L25-L27]  the item appears in the section's `publicMethods` list.
 *   4. [:L30]      every remaining path first requires a logged-in account whose identifier
 *                  matches the framework scope's, then tests `anyLoginMethods` [:L33-L35],
 *                  `anyAdminMethods` [:L38-L40], `secureMethods` [:L43-L49] and — for an entity
 *                  or REST controller — the prefix-derived entity CRUD branch [:L52-L80].
 *   5. [:L83]      terminal `return false`.
 *
 * Steps 1, 2, the `secureMethods` permission-group walk and the whole permission model behind it
 * stay BEHIND the boundary, for the same reason `AccountReference.adminAccountFlag` keeps its own
 * derivation [model/entity/Account.cfc:L173-L178] behind it: the twenty-one `Account*` components
 * are explicitly out of scope (AAP §0.2.2.1), and `PermissionGroup` and `Permission` are not
 * declared anywhere in this deliverable. {@link EntityAuthorizationPort} therefore declares the
 * QUESTION and receives an ANSWER — a single resolved boolean — exactly as
 * {@link PopulationAuthorizationPort} does for ARM 3.
 *
 * ONE PORT MEMBER, NOT TWO. `authenticateAction( action )` is deliberately NOT declared, and the
 * reason is evidence rather than economy. Both in-scope handler surfaces are entity surfaces, and
 * for an entity controller the legacy action-level check DELEGATES to the entity-level check by
 * item-name prefix [org/Hibachi/HibachiAuthenticationService.cfc:L52-L80] — `detail` and `list`
 * to `read` [:L56, :L66], `create` to `create` [:L54], `delete` to `delete` [:L58], `edit` to
 * `update` [:L60], and `save` to `create` first and then `update` [:L71-L77]. Declaring an
 * action-level member as well would require this deliverable to mint `subsystem:section.item`
 * action strings that no in-scope file contains, which is invention (S9). If a future surface is
 * NOT an entity surface, the action-level member is added then, with its own evidence.
 *
 * NO ROLE, NO PERMISSION, NO TOKEN, NO SESSION AND NO ROUTE TABLE is declared here. This file
 * stays what its header says it is: a type-only module of interfaces, contributing not one
 * runtime byte to a packaged artifact.
 */

/**
 * The four operations the legacy entity-authorisation ladder distinguishes.
 *
 * Read verbatim off the prefix-derived branch of `authenticateActionByAccount`
 * [org/Hibachi/HibachiAuthenticationService.cfc:L52-L80], which is the only place the framework
 * names a CRUD type as a value. Each literal below is the exact string the legacy passes as
 * `crudType`:
 *
 *   - `'create'` — from the `create` item prefix [:L53-L54] and from the first half of the `save`
 *     branch [:L69-L71].
 *   - `'read'`   — from the `detail` prefix [:L55-L56] and from the `list` prefix [:L61-L62].
 *     ⚠️ NOTE THE ASYMMETRY: the legacy value is `read`, not `detail` and not `list`. Two distinct
 *     item prefixes collapse onto one CRUD type, so a port that carried the prefix names instead
 *     would invent two values the framework never uses.
 *   - `'update'` — from the `edit` prefix [:L59-L60] and from the second half of `save` [:L74-L76].
 *   - `'delete'` — from the `delete` prefix [:L57-L58].
 *
 * The union is closed at exactly four members because the legacy vocabulary has exactly four. The
 * process-family prefixes on the same ladder — `multiPreProcess` [:L63-L64], `multiProcess`
 * [:L65-L66], `preProcess` [:L67-L68] and `process` [:L69-L70] — are NOT CRUD types: each of them
 * `return true` outright once the logged-in gate at [:L30] has passed, so they authorise without
 * ever naming a CRUD type. That distinction is load-bearing for `src/handlers/optionHandler.ts`,
 * whose two repository-backed members are reachable in the legacy only through a `preProcess`
 * item; see the access matrix in that file.
 *
 * `'update'` is also the single literal {@link EntityPropertyAuthorizationRequest.crudType}
 * pins, because the population gate hard-codes it [org/Hibachi/HibachiTransient.cfc:L190]. The two
 * declarations are deliberately not merged: the property-level request can only ever be an update,
 * and widening it to this union would let a caller ask a question the legacy never asks.
 */
export type EntityCrudType = 'create' | 'read' | 'update' | 'delete';

/**
 * One entity-level authorisation question, mirroring the legacy call signature exactly.
 *
 * `authenticateEntity( required string crudType, required string entityName )`
 * [org/Hibachi/HibachiScope.cfc:L203-L205] takes both arguments as required, in that order, and
 * forwards them to `authenticateEntityCrudByAccount` [org/Hibachi/HibachiAuthenticationService.cfc
 * :L85-L101]. Both members are therefore required here, and both are readonly because a request is
 * a question rather than a mutable accumulator.
 *
 * WHY `entityName` IS `string` AND NOT A CLOSED UNION. The legacy declares it `required string`
 * and derives it from an item name by substring arithmetic [:L54, :L56, :L58, :L60, :L66, :L70,
 * :L75], so no enumeration of entity names exists anywhere in the framework to port. This mirrors
 * the decision already recorded on {@link EntityPropertyAuthorizationRequest.propertyName}:
 * the value is CLOSED BY THE CALLER, not by this type. Each handler passes a module-level constant
 * naming exactly one entity, so no request-supplied value ever reaches this member — the same
 * discipline `src/ports/SmartListQueryPort.ts` applies to identifiers that reach a query.
 */
export interface EntityAuthorizationRequest {
  /** The operation being attempted, as the legacy names it. See {@link EntityCrudType}. */
  readonly crudType: EntityCrudType;

  /**
   * The entity the operation targets, spelled as the legacy component name — `Brand`, `Option`,
   * `Product`, `Sku` — because that is the string the legacy substring arithmetic produces and the
   * string the permission tables behind the boundary are keyed on.
   */
  readonly entityName: string;
}

/**
 * The resolved entity-level authoriser: the handler layer's half of the legacy request gate.
 *
 * DEFAULT DENY IS STRUCTURAL, NOT A DEFAULT VALUE. Every terminal branch of the legacy ladder
 * returns false — [org/Hibachi/HibachiAuthenticationService.cfc:L101] after the permission-group
 * walk finds nothing, and [:L83] when no classification matched — so an implementation that cannot
 * establish authorisation MUST return `false`. This deliverable expresses that the same way
 * {@link PopulationAuthorizationPort} does: an implementation of this interface is a REQUIRED
 * argument of every handler factory that needs one, so "route without a policy" is not a state a
 * caller can reach, and no call compiles without one. That is deliberately stronger than a
 * default-deny default value, which a caller could still forget to consider.
 *
 * The member is synchronous, matching the legacy accessor, which performs no input or output: it
 * walks an in-memory permission-group collection [org/Hibachi/HibachiAuthenticationService.cfc
 * :L93-L98]. Returning a promise would force awaiting into every handler entry point for a
 * decision the legacy made synchronously.
 *
 * The interface is satisfiable by a plain object literal, deliberately — the legacy repository
 * vendored no mocking library at all (AAP §0.4.3.6):
 *
 *     const denyAll: EntityAuthorizationPort = { authenticateEntity: () => false };
 *
 *     const readOnly: EntityAuthorizationPort = {
 *       authenticateEntity: ({ crudType }) => crudType === 'read',
 *     };
 */
export interface EntityAuthorizationPort {
  /**
   * Answers whether the current invocation may perform `crudType` on `entityName`.
   *
   * @param request the question, as {@link EntityAuthorizationRequest} declares it
   * @returns `true` only when authorisation was positively established; `false` otherwise, and in
   *   particular `false` — never a throw and never `undefined` — when it could not be established
   */
  authenticateEntity(request: EntityAuthorizationRequest): boolean;
}

/**
 * The two collaborators the legacy request gate resolved from the framework scope, together.
 *
 * `setupRequest()` reached both through one ambient object: `getHibachiScope()` supplied the
 * current account [org/Hibachi/HibachiScope.cfc:L134-L135] AND the authorisation verdict
 * [:L203-L205], and `authenticateActionByAccount` reads both in the same ladder — the account at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L10] and [:L30], the verdict at [:L52-L80]. They
 * travel together here for that reason, not for convenience: a handler that received only one of
 * them could not reproduce the ladder, because step [:L30] gates every permission test on the
 * account being logged in first.
 *
 * AAP §0.6.6 M8 is why this is a per-invocation value rather than a constructor singleton. A
 * stateless invocation has no request scope and no application scope; the caller identity is
 * resolved once at the edge and injected inwards. A memoised handler factory therefore cannot
 * capture it — see {@link RequestAuthorizationResolver}.
 */
export interface RequestAuthorizationContext {
  /** Supplies the account this invocation is acting as, or `undefined` when there is none. */
  readonly accountContext: AccountContextPort;

  /** Supplies the resolved entity-level verdict. */
  readonly entityAuthorization: EntityAuthorizationPort;
}

/**
 * Resolves the per-invocation authorisation context from the incoming request.
 *
 * WHY A RESOLVER AND NOT A PLAIN INJECTED VALUE. `src/config/container.ts` is a memoised factory
 * (AAP §0.4.1.3), so anything captured when a handler is built survives across warm invocations.
 * AAP §0.6.6 M7 is explicit that this is exactly what must not happen: memoisation is
 * request-scoped, never module-scope, "to avoid cross-tenant bleed on a warm container", and the
 * only module-scope mutable state permitted anywhere in the subtree is the connection pool in
 * `src/config/database.ts`. A principal captured at build time would be precisely such bleed. The
 * handler therefore receives a FUNCTION, evaluated once per invocation against that invocation's
 * own request, and holds no principal of its own.
 *
 * WHY IT IS GENERIC OVER THE REQUEST TYPE. AAP §0.5.5 confines every cloud-provider type to
 * `src/handlers/**`, and this file is a port: naming a provider event type here would break the
 * property that a runtime migration touches four artifacts and no layer below the handlers. The
 * type parameter lets each handler instantiate it with the narrow slice of the event it actually
 * reads, and lets a test instantiate it with a plain object.
 *
 * The resolver is synchronous for the same reason both port members are: the legacy gate resolved
 * its scope with no input or output at all.
 *
 * @typeParam TRequest the request shape the resolver reads; a handler supplies the narrow slice it
 *   already accepts, so no handler widens its own event contract to obtain a principal
 */
export type RequestAuthorizationResolver<TRequest> = (
  request: TRequest,
) => RequestAuthorizationContext;

/**
 * The four access classifications the legacy declared on a controller, as a closed union.
 *
 * These are NOT invented names. Each is the exact declaration a legacy controller writes as a
 * component-scope property, and each is read back by name in `authenticateActionByAccount`:
 *
 *   - `'public'`   — `this.publicMethods`, tested at
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L25-L27] BEFORE any logged-in requirement, so
 *     a public item is reachable with no account at all.
 *   - `'anyLogin'` — `this.anyLoginMethods`, tested at [:L33-L35]; requires only that an account is
 *     logged in.
 *   - `'anyAdmin'` — `this.anyAdminMethods`, tested at [:L38-L40]; requires
 *     `getLoggedInAsAdminFlag()` [org/Hibachi/HibachiScope.cfc:L47-L52], which resolves to
 *     `Account.getAdminAccountFlag()` [model/entity/Account.cfc:L173-L178] and is carried across as
 *     {@link AccountReference.adminAccountFlag}.
 *   - `'secure'`   — `this.secureMethods`, tested at [:L43-L49]; requires a per-permission-group
 *     verdict, which is what {@link EntityAuthorizationPort} resolves.
 *
 * THE VOCABULARY IS DECLARED HERE; THE CLASSIFICATION IS DECLARED BY THE HANDLER. That split
 * mirrors the legacy exactly: the ladder that interprets the four lists lives in the framework
 * (this port's side of the boundary), while WHICH items fall in WHICH list is written on the
 * controller itself — `this.publicMethods="product"` at
 * [integrationServices/google/controllers/feed.cfc:L54], `this.publicMethods=''` at
 * [admin/controllers/entity.cfc:L66]. Each handler therefore declares its own matrix over this
 * union, with the legacy evidence for every row.
 *
 * There is no `'internal'` member, deliberately. An operation with no legacy action is not given a
 * fifth classification — it is not routed at all, which is a stronger statement and one the
 * compiler can check. See `src/handlers/brandHandler.ts`, where the routed surface simply does not
 * declare it.
 */
export type HandlerAccessClassification = 'public' | 'anyLogin' | 'anyAdmin' | 'secure';
