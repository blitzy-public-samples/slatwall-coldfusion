/**
 * AccountContextPort — the current-account context for the extracted Slatwall Catalog slice.
 *
 * A TYPE-ONLY module. It declares two interfaces and nothing else: no class, no constructor, no
 * function body, no import statement, and therefore not one runtime byte in a packaged Lambda
 * artifact. Consumers reach it through a type-only import, which the compiler erases, so the
 * `domain` -> `ports` reference from `src/domain/base/AuditableEntity.ts` creates no runtime edge,
 * no module cycle and no bundle-ordering hazard.
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
 * RULES VERDICT, recorded per UR4 rather than assumed. `review_rules` returns the single line
 * "No user rules provided." for this project, with no paginated remainder, so zero files enter
 * scope by rule and no rule-derived constraint applies here. That is not permission to lower the
 * bar. The nine binding standards of AAP §0.7.3 govern instead, and the ones with teeth in a
 * type-only port file are:
 *
 *   S1 strict type safety — every member is explicitly typed against a legacy-pinned type where
 *      one exists; there is no escape hatch, no assertion and no suppression comment in this file.
 *   S2 parameterized data access — a pure prohibition here: this file contains no query, no
 *      placeholder list and no driver import. `SwAccount` [model/entity/Account.cfc:L49] appears
 *      only inside this prose, as the table the identifier below belongs to.
 *   S3 explicit dependency injection — this interface IS the replacement for a string-keyed
 *      runtime lookup. Consumers receive an implementation as a typed constructor parameter; there
 *      is no container import, no module-scope singleton and no ambient declaration.
 *   S4 hexagonal separation — a port sits beneath `services`, `adapters`, `handlers`,
 *      `validation`, `config` and `integrations` and imports from none of them. It holds no
 *      persistence detail and carries no cloud-provider event shape: the edge resolves the caller
 *      identity and passes it inwards, so this contract stays free of the transport it arrived on.
 *   S6 test coverage — the surface is kept small enough to hand-implement, because the legacy
 *      repository vendored no mocking library at all (AAP §0.4.3.6). Coverage of the audit guard
 *      is NET-NEW: AAP §0.6.5.2 verified that no legacy test exercises the framework scope or the
 *      audit-stamp block.
 *   S7 preserve and annotate, do not repair — the carried legacy behaviours below are marked with
 *      TODO(parity) and left as observed. This file claims no S7 exception; the plan's only
 *      declared exception is D18, and it belongs to `src/adapters/mysql/MySqlProductRepository.ts`.
 *   S8 flag mismatches rather than assume them away — the execution-model mismatch this file owns
 *      is stated in full immediately below.
 *   S9 invent nothing — the legacy guard reads exactly two predicates about the account, so
 *      exactly two predicates are declared. No authentication scheme, session model, token shape,
 *      permission set, role hierarchy, tenant concept, expiry or default identifier is introduced.
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
 *   `getTableTopSortOrder(...)`, the neighbour inside the very same gated block
 *     [org/Hibachi/HibachiEntity.cfc:L637-L647] — that belongs to
 *     `src/adapters/mysql/UnitOfWork.ts`. Cited, not carried.
 *   An account class, an entity type, a base class or a re-declaration of the auditable entity —
 *     `src/domain/base/AuditableEntity.ts` imports this file, never the reverse.
 */
