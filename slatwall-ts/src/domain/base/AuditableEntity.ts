/**
 * AuditableEntity — the audit-field block of the Slatwall Catalog, extracted from a retired ORM
 * lifecycle.
 *
 * Four fields — `createdDateTime`, `createdByAccount`, `modifiedDateTime`, `modifiedByAccount` —
 * are declared byte-identically on all six in-scope Catalog entities, and in the legacy system not
 * one of them was ever written by application code. They were stamped by the CFML engine's
 * Hibernate lifecycle hooks `preInsert()` [org/Hibachi/HibachiEntity.cfc:L598-L649] and
 * `preUpdate(struct oldData)` [org/Hibachi/HibachiEntity.cfc:L651-L680], declared on the framework
 * base class that every entity inherited from.
 *
 * A stateless Lambda invocation has no ORM session, no Hibernate and no lifecycle hooks at all, so
 * that behaviour has nowhere left to live. This module is where it lives instead: an explicit type
 * plus explicit, declared functions, invoked deliberately by the code that owns the write.
 *
 * ---------------------------------------------------------------------------------------------
 * AAP AUTHORITY
 * ---------------------------------------------------------------------------------------------
 *   §0.4.1.4 "Domain Layer", row 1 — CREATE, REFERENCE `org/Hibachi/HibachiEntity.cfc`, key
 *     change: "The `createdDateTime` / `createdByAccount` / `modifiedDateTime` /
 *     `modifiedByAccount` block set by the ORM lifecycle hooks becomes an explicit base type".
 *   §0.3.3 — the pattern table replaces "Template-method inheritance (`extends="HibachiService"`,
 *     `super.save()`)" with "Composition over inheritance". This module is therefore a TYPE PLUS
 *     FREE FUNCTIONS and never an abstract base class to `extends`. Nothing declared here is an
 *     inheritance root, and no entity module subclasses it — they satisfy the interface structurally
 *     and pass themselves to the functions below.
 *   IR-1 — behaviour the framework synthesised or triggered implicitly becomes an explicit,
 *     compile-checked declaration. The two hooks were the most implicit machinery in the slice:
 *     Hibernate called them, nothing in the application ever did.
 *
 * ---------------------------------------------------------------------------------------------
 * POSITION IN THE DEPENDENCY GRAPH — THIS IS THE DEEPEST LEAF OF `src/domain/`
 * ---------------------------------------------------------------------------------------------
 * `src/domain/base/populate.ts` imports `AUDIT_PROPERTY_NAMES` from here, and through it every
 * entity module — `domain/product/Product.ts`, `domain/sku/Sku.ts`, `domain/product/ProductType.ts`,
 * `domain/product/Brand.ts`, `domain/option/Option.ts`, `domain/option/OptionGroup.ts` — depends on
 * this file. The direction is never reversed: this module imports no entity, no service, no adapter
 * and no configuration, and it holds exactly one import, which is type-only and therefore erased at
 * compile time. There is consequently no runtime edge out of this file at all, no module cycle and
 * no bundler ordering hazard (S4).
 *
 * THE INTENDED CALLER is `src/adapters/mysql/UnitOfWork.ts`, which owns the explicit transaction
 * boundary that replaced the legacy implicit request-end commit (AAP §0.4.1.7, mismatch M5). That
 * relationship is one-way and stated here only so the stamping functions are not mistaken for
 * something an entity calls on itself: this file names that module, imports nothing from it and
 * reaches toward it in no way.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FOUR ASYMMETRIES — THE WHOLE POINT OF THIS FILE, AND THE ONE WAY TO GET IT WRONG
 * ---------------------------------------------------------------------------------------------
 * Every one of the following is real, verified legacy behaviour. A tidier, more symmetrical version
 * of this module would be a WRONG version of it, and AAP §0.8.2 Guideline 4 forbids "enhancing"
 * any of them (S7 — preserve and annotate, do not repair):
 *
 *   1. TWO of the four getters are overridden, not four. `getCreatedDateTime()`
 *      [org/Hibachi/HibachiEntity.cfc:L291-L297] and `getModifiedDateTime()`
 *      [org/Hibachi/HibachiEntity.cfc:L299-L305] each return the EMPTY STRING when the underlying
 *      value is null. The two account getters have NO override anywhere: a grep for
 *      `function getCreatedByAccount` and `function getModifiedByAccount` across
 *      `org/Hibachi/HibachiEntity.cfc`, `org/Hibachi/HibachiTransient.cfc`,
 *      `org/Hibachi/HibachiObject.cfc` and `model/entity/HibachiEntity.cfc` returns zero hits, and
 *      so does the same grep across every `.cfc` in the repository. They fall through to the
 *      CFML-generated accessors and are genuinely absent when unset, with no sentinel of any kind.
 *      So absence is represented TWO different ways here, deliberately: `Date | ''` for the
 *      timestamps, `string | undefined` for the accounts. See the accessors below.
 *
 *   2. `modifiedDateTime` and `modifiedByAccount` are BOTH written on insert, not only on update
 *      [org/Hibachi/HibachiEntity.cfc:L617-L619 and L632-L635]. This surprises readers who expect
 *      the modified pair to stay untouched until the first real update. It does not.
 *
 *   3. The timestamps are written UNCONDITIONALLY; the account fields are written only behind
 *      gates. The two halves of the block do not share a condition.
 *
 *   4. Attribution is ADMIN-ONLY. A save performed by a non-administrative actor — a storefront
 *      customer — leaves both account fields absent while both timestamps are still stamped. That
 *      is the behaviour, not an oversight; see GATE 3 below.
 *
 * ---------------------------------------------------------------------------------------------
 * THE GATE STACK — FOUR CONDITIONS, TWO OF THEM LIVE (G6 translation decisions)
 * ---------------------------------------------------------------------------------------------
 * The legacy account assignments sit behind four stacked conditions. Two survive translation as
 * executable code, two are satisfied structurally. All four are recorded, because a dropped gate
 * with an explanation is defensible whereas a dropped gate without one is indistinguishable from a
 * bug:
 *
 *   GATE 0 — the application-initialized gate, `hasApplicationValue("initialized") &&
 *     getApplicationValue("initialized")` [org/Hibachi/HibachiEntity.cfc:L622 for the insert hook,
 *     :L670 for the update hook]. Its own source comment reads "These are more complicated options
 *     that should not be called during application setup", which is precisely what it is for: it
 *     suppressed this block while the CFML application was still bootstrapping.
 *     TRANSLATION DECISION — STRUCTURALLY SATISFIED, NOT SILENTLY DROPPED. There is no
 *     application-setup phase inside a Lambda invocation and no application scope to read the flag
 *     out of, so the gate has no counterpart to port. No `isInitialized` flag is invented, no
 *     environment variable is consulted and no parameter is added for it (S9 — invent nothing).
 *     The observable consequence is stated plainly: in the legacy system audit stamping was
 *     silently skipped during application setup, and here it never is, because that phase does not
 *     exist.
 *
 *   GATE 1 — `structKeyExists(this, "setCreatedByAccount")` /
 *     `structKeyExists(this, "setModifiedByAccount")`
 *     [org/Hibachi/HibachiEntity.cfc:L628 and :L633, and again at :L676].
 *     TRANSLATION DECISION — STRUCTURALLY SATISFIED. This asked whether the entity carried a
 *     generated setter at all, because the framework base class was shared by entities that did not
 *     declare the audit properties. A reflective "does a setter exist" test has no analogue in a
 *     statically typed interface, and it needs none: the four fields are declared on the type
 *     below, so the compiler enforces what the reflection test used to check. It was also always
 *     true for every type in this slice — all six in-scope entities declare all four properties, as
 *     recorded on `AUDIT_PROPERTY_NAMES`. Reproducing it with a runtime property probe would
 *     reintroduce exactly the metaprogramming that S3 and IR-1 exist to retire.
 *
 *   GATE 2 — `!getHibachiScope().getAccount().isNew()`: the actor must already be persisted.
 *     LIVE. Implemented in `isAuditAttributableAccount` below, preserving the legacy polarity.
 *
 *   GATE 3 — `getHibachiScope().getAccount().getAdminAccountFlag()`: the actor must carry the
 *     administrative flag. LIVE, and the reason for asymmetry 4 above.
 *
 * The ambient two-step lookup the gates were written around — `getHibachiScope()`
 * [org/Hibachi/HibachiObject.cfc:L73-L76], a literal read out of the CFML `request` struct keyed by
 * an application-scoped string, followed by `getAccount()` [org/Hibachi/HibachiScope.cfc:L134] — is
 * gone entirely. S3 forbids a service locator or any ambient resolution, so the resolved actor
 * arrives as an explicit parameter and this module performs no lookup of its own. It also performs
 * no I/O, no data access and no logging, and it calls no method on any port.
 *
 * ---------------------------------------------------------------------------------------------
 * RULES VERDICT, RECORDED RATHER THAN ASSUMED (UR4)
 * ---------------------------------------------------------------------------------------------
 * `review_rules` returns the single line "No user rules provided." for this project, with no
 * paginated remainder, and a filesystem sweep finds no `.blitzyignore`, `.cursorrules`, `AGENTS.md`,
 * `CLAUDE.md`, `.editorconfig` or `.eslintrc*` anywhere in the repository. Zero files enter scope by
 * rule and no rule-derived constraint applies to this file. That is not permission to lower the bar:
 * the nine enterprise standards of AAP §0.7.3 govern instead, and the ones with teeth here are S1
 * (strict type safety — no `any`, no non-null assertion, no suppression comment, no unsafe cast),
 * S2 (a purely negative obligation: no query, no driver import, no table name, and the foreign-key
 * column names appear only as prose provenance), S3, S4, S5 (add no dependency — the built-in `Date`
 * only), S6 (every export constructible from plain literals, named exports only), S7, S8 and S9.
 *
 * ---------------------------------------------------------------------------------------------
 * EXECUTION-MODEL NOTE (S8 / mismatch M7) — WHY THE CLOCK IS READ INSIDE THE FUNCTIONS
 * ---------------------------------------------------------------------------------------------
 * 111 of the 113 legacy entities declare `cacheuse="transactional"` and memoize derived values in
 * per-request scope; nothing in the target survives between invocations except module-scope state.
 * This module therefore holds NO module-scope mutable binding, no cache, no memoized value, no
 * module-level `let`, no singleton clock and no cached actor. `new Date()` is read inside the
 * function that needs it, and the actor is passed in per call, so nothing can bleed across warm
 * invocations. The one module-scope binding that does exist, `AUDIT_PROPERTY_NAMES`, is an immutable
 * frozen constant with no per-request content — the same documented-safe category as
 * `src/domain/BaseProductType.ts` — rather than an exception to the rule.
 *
 * Loading this module has no side effects whatsoever, so it is usable from any context, tests
 * included.
 */

import type { AccountReference } from '../../ports/AccountContextPort';

/**
 * The audit-field block, as an explicit structural contract.
 *
 * PORT OF the four-property declaration that appears byte-identically on all six in-scope entities,
 * under the comment `// Audit properties` in each — [model/entity/Product.cfc:L96-L99],
 * [model/entity/Sku.cfc:L93-L96], [model/entity/ProductType.cfc:L83-L86],
 * [model/entity/Brand.cfc:L77-L80], [model/entity/Option.cfc:L76-L79] and
 * [model/entity/OptionGroup.cfc:L64-L67]:
 *
 *     property name="createdDateTime"   hb_populateEnabled="false" ormtype="timestamp";
 *     property name="createdByAccount"  hb_populateEnabled="false" cfc="Account"
 *                                       fieldtype="many-to-one" fkcolumn="createdByAccountID";
 *     property name="modifiedDateTime"  hb_populateEnabled="false" ormtype="timestamp";
 *     property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
 *                                       fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
 *
 * An entity module satisfies this contract structurally by declaring the four fields; it does not
 * and must not extend anything (AAP §0.3.3, composition over inheritance).
 *
 * TRANSLATION DECISION — WHY THE ACCOUNT FIELDS ARE TYPED `string` AND NOT AN ENTITY.
 * The legacy declaration is a `many-to-one` association to `cfc="Account"`, but the twenty-one
 * `Account*.cfc` files under `model/entity`, `model/service`, `model/dao` and `model/process` are
 * placed explicitly out of scope by AAP §0.2.2.1. No account entity, interface, class or stub is
 * declared here, and none is imported: the field carries the account IDENTIFIER, which per IR-6 is
 * a 32-character identifier string with no dashes — 107 of the 113 legacy entities declare
 * `fieldtype="id" generator="uuid" ormtype="string" length="32"`, so identifiers are neither dashed
 * RFC-4122 values nor auto-increment numbers. TR-5 is satisfied by crossing the boundary through
 * the declared port instead: the stamping functions accept an `AccountReference` and read its
 * `accountID`.
 *
 * TRANSLATION DECISION — WHERE THE COLUMN MAPPING LIVES. The foreign-key columns are
 * `createdByAccountID` and `modifiedByAccountID`, recorded here as verified provenance only. This
 * module performs no persistence and names no table; translating between those columns and these
 * fields is owned by `src/adapters/mysql/rowMappers.ts`, which replaced the Hibernate hydration
 * that CFC property metadata used to drive.
 *
 * TRANSLATION DECISION — WHY THESE FOUR FIELDS ARE MUTABLE AND OPTIONAL.
 * Mutable, because the stamping functions below are the replacement for the ORM's generated setters
 * and must be able to write them; the legacy hooks likewise mutated `this` in place. Optional,
 * because every one is genuinely absent before its first stamp — which is the state the two
 * overridden timestamp getters existed to paper over. `exactOptionalPropertyTypes` is in effect for
 * this subtree, so "unset" means the key is ABSENT: `undefined` is never assigned into any of these
 * properties anywhere in this file.
 *
 * Mutability here is not a hole in the `hb_populateEnabled="false"` guarantee. That guarantee is
 * enforced structurally, one layer up, by `AUDIT_PROPERTY_NAMES` — see the note on it below.
 */
export interface AuditableEntity {
  /** First-write timestamp. Absent until `applyPreInsertAudit`. Never rewritten afterwards. */
  createdDateTime?: Date;

  /**
   * Identifier of the administrative account that created the record. Absent unless GATE 2 and
   * GATE 3 both held at insert time. Never rewritten afterwards.
   */
  createdByAccount?: string;

  /** Last-write timestamp. Written on insert as well as on update — asymmetry 2. */
  modifiedDateTime?: Date;

  /**
   * Identifier of the administrative account that last wrote the record. Written on insert as well
   * as on update, and absent unless GATE 2 and GATE 3 both held at that moment.
   */
  modifiedByAccount?: string;
}

/**
 * The four legacy audit property names, frozen and closed.
 *
 * WHY THIS EXPORT EXISTS. Every one of the four properties is declared `hb_populateEnabled="false"`
 * on all six in-scope entities — verified byte-identically at [model/entity/Product.cfc:L96-L99],
 * [model/entity/Sku.cfc:L93-L96], [model/entity/ProductType.cfc:L83-L86],
 * [model/entity/Brand.cfc:L77-L80], [model/entity/Option.cfc:L76-L79] and
 * [model/entity/OptionGroup.cfc:L64-L67]. In the legacy system that flag was read by the
 * metadata-driven `populate()` at [model/entity/HibachiEntity.cfc:L56], which used it to refuse to
 * write these fields from incoming request data. The invariant is therefore: THE AUDIT FIELDS ARE
 * NEVER WRITABLE FROM REQUEST DATA — only the lifecycle functions in this module may write them.
 *
 * This tuple is what makes that invariant structural instead of a comment somebody can forget.
 * `src/domain/base/populate.ts` imports it under exactly this name and applies it as an
 * unconditional exclusion set, ahead of any per-property check. The identifier is pinned; do not
 * rename it.
 *
 * `as const` gives compile-time immutability and preserves the tuple so the union below can be
 * derived from it; `Object.freeze` adds run-time immutability so a consumer cannot mutate the shared
 * list. Both, deliberately, because either alone leaves a gap.
 *
 * THE LIST IS CLOSED AT FOUR. It holds the legacy PROPERTY names — the keys that appear in incoming
 * request data and the keys the `hb_populateEnabled="false"` declarations attach to — and nothing
 * else. Three specific non-members, recorded so their absence reads as a decision:
 *   - the foreign-key column names `createdByAccountID` and `modifiedByAccountID` are columns, not
 *     property keys, and belong to `src/adapters/mysql/rowMappers.ts`;
 *   - `remoteID`, declared immediately above the audit block at [model/entity/Brand.cfc:L73], does
 *     NOT carry the flag and is therefore populate-enabled;
 *   - the five extra flagged relationship properties unique to Brand — at
 *     [model/entity/Brand.cfc:L66-L69] and [model/entity/Brand.cfc:L71] — are Brand-specific, which
 *     is why that entity carries nine `hb_populateEnabled="false"` declarations where the other five
 *     carry exactly four. Those belong to `domain/product/Brand.ts`'s own descriptors, never to this
 *     shared list.
 */
export const AUDIT_PROPERTY_NAMES = Object.freeze([
  'createdDateTime',
  'createdByAccount',
  'modifiedDateTime',
  'modifiedByAccount',
] as const);

/**
 * The name of one audit property.
 *
 * Derived from `AUDIT_PROPERTY_NAMES` by indexed access over the tuple's element type rather than
 * written out a second time, so the union and the runtime list cannot drift apart. Adding or
 * removing an entry above changes this type automatically, and every exhaustive consumer of it
 * fails to compile until it is updated.
 */
export type AuditPropertyName = (typeof AUDIT_PROPERTY_NAMES)[number];

/**
 * Narrows an arbitrary property key to one of the four audit property names.
 *
 * `src/domain/base/populate.ts` uses this as its unconditional exclusion test: a key that satisfies
 * this predicate is never written from request data, reproducing `hb_populateEnabled="false"`.
 *
 * Implemented with a comparison over the frozen tuple rather than a cast, so the predicate is
 * type-safe end to end: there is no assertion, no widening cast and no suppression comment anywhere
 * in it (S1). The parameter is `string` because the caller is iterating string keys of incoming
 * data.
 *
 * @param value - A candidate property key.
 * @returns `true` when `value` is one of the four audit property names.
 */
export function isAuditPropertyName(value: string): value is AuditPropertyName {
  return AUDIT_PROPERTY_NAMES.some((auditPropertyName) => auditPropertyName === value);
}

/*
 * =============================================================================================
 * THE FOUR ACCESSORS — TWO OVERRIDDEN IN THE LEGACY SOURCE, TWO NOT (asymmetry 1)
 * =============================================================================================
 * These reproduce the read side of the audit block exactly as the legacy source exposed it, and the
 * difference between the two pairs is the single most important thing in this module not to tidy up.
 *
 * TRANSLATION DECISION — WHY THE TIMESTAMP ACCESSORS RETURN `Date | ''`.
 * The framework overrode precisely two getters, and only to keep a null out of the caller's hands:
 *
 *     // @hint public method that overrides the standard getter so that null values won't be an issue
 *     public any function getCreatedDateTime() {
 *         if(isNull(variables.createdDateTime)) {
 *             return "";
 *         }
 *         return variables.createdDateTime;
 *     }
 *
 * [org/Hibachi/HibachiEntity.cfc:L291-L297, and the identical `getModifiedDateTime()` at
 * :L299-L305]. That empty string is not a placeholder chosen here — it is the legacy return value,
 * and it was observable: CFML callers concatenated and date-formatted the result directly, so a
 * `""` flowed onward as an empty rendering rather than raising. The union is therefore the faithful
 * contract, and the compiler now forces callers to acknowledge the case that the legacy code let
 * pass silently. Collapsing it to `Date | undefined` would be tidier and would change behaviour.
 *
 * The account fields get NO such treatment, because the framework gave them none: grep proves there
 * is no override of `getCreatedByAccount` or `getModifiedByAccount` anywhere in the repository, so
 * they were genuinely null-when-unset. They are modelled as `string | undefined`, and no empty-string
 * sentinel appears on either of them anywhere in this file.
 */

/**
 * Reads `createdDateTime`, reproducing the legacy overridden getter.
 *
 * @param entity - The entity to read.
 * @returns The creation timestamp, or the empty string when it has never been stamped —
 *   [org/Hibachi/HibachiEntity.cfc:L291-L297].
 */
export function getCreatedDateTime(entity: AuditableEntity): Date | '' {
  if (entity.createdDateTime === undefined) {
    return '';
  }
  return entity.createdDateTime;
}

/**
 * Reads `modifiedDateTime`, reproducing the legacy overridden getter.
 *
 * @param entity - The entity to read.
 * @returns The last-modified timestamp, or the empty string when it has never been stamped —
 *   [org/Hibachi/HibachiEntity.cfc:L299-L305].
 */
export function getModifiedDateTime(entity: AuditableEntity): Date | '' {
  if (entity.modifiedDateTime === undefined) {
    return '';
  }
  return entity.modifiedDateTime;
}

/**
 * Reads `createdByAccount`.
 *
 * Deliberately asymmetric with the timestamp accessors above: there is no legacy override for this
 * property, so absence stays absence and is NOT mapped to an empty string.
 *
 * @param entity - The entity to read.
 * @returns The creating administrative account's identifier, or `undefined` when unattributed.
 */
export function getCreatedByAccount(entity: AuditableEntity): string | undefined {
  return entity.createdByAccount;
}

/**
 * Reads `modifiedByAccount`.
 *
 * Deliberately asymmetric with the timestamp accessors above, for the same reason: no legacy
 * override exists, so absence stays absence.
 *
 * @param entity - The entity to read.
 * @returns The last-writing administrative account's identifier, or `undefined` when unattributed.
 */
export function getModifiedByAccount(entity: AuditableEntity): string | undefined {
  return entity.modifiedByAccount;
}

/**
 * GATE 2 and GATE 3 — whether an actor may be recorded as an audit attribution.
 *
 * PORT OF the account half of the legacy condition, which is byte-identical at all three of its
 * call sites — [org/Hibachi/HibachiEntity.cfc:L628] (createdByAccount, insert hook),
 * [org/Hibachi/HibachiEntity.cfc:L633] (modifiedByAccount, insert hook) and
 * [org/Hibachi/HibachiEntity.cfc:L676] (modifiedByAccount, update hook):
 *
 *     !getHibachiScope().getAccount().isNew() && getHibachiScope().getAccount().getAdminAccountFlag()
 *
 * BOTH conditions must hold, and the legacy conjunction order is preserved. GATE 2 requires the
 * actor to be persisted; GATE 3 requires it to be administrative.
 *
 * TRANSLATION DECISION — LEGACY POLARITY IS PRESERVED, NOT "READ MORE FLUENTLY".
 * `AccountReference.newFlag` keeps the sense of the legacy `isNew()` predicate, so the guard reads
 * `!auditActor.newFlag` exactly as the source reads `!(...).isNew()`. Inverting the flag to name it
 * something like "persisted" would silently swap which actors get stamped if the inversion were ever
 * mis-transcribed — a behaviour change, which AAP §0.8.1 forbids even while it invites idiom changes.
 *
 * TRANSLATION DECISION — THE CONJUNCTION IS NAMED ONCE INSTEAD OF WRITTEN THREE TIMES.
 * The legacy expression re-reads the ambient scope and the account up to four times per
 * condition-and-stamp pair, and repeats the whole conjunction at three separate locators. That
 * repetition is an artifact of reaching into ambient state and carries no behaviour of its own, so it
 * is expressed once here and called from both stamping functions. Idiom changed, behaviour preserved.
 *
 * ABSENCE IS A DISTINCT, MEANINGFUL INPUT. `undefined` means no actor is in context at all, which is
 * a different state from an actor present with `adminAccountFlag: false`. Both correctly yield "do
 * not stamp", but they are different reasons and stay distinguishable — collapsing them, or
 * fabricating a placeholder actor, would make the gate unreachable. No fallback or default actor is
 * invented when the gates fail (S7, S9).
 *
 * GATE 0 and GATE 1 are not represented here: both are satisfied structurally, for the reasons
 * documented in the module header.
 *
 * @param auditActor - The resolved current-account context, or `undefined` when there is none.
 * @returns `true` when the actor is present, persisted (GATE 2) and administrative (GATE 3).
 */
export function isAuditAttributableAccount(
  auditActor: AccountReference | undefined,
): auditActor is AccountReference {
  return auditActor !== undefined && !auditActor.newFlag && auditActor.adminAccountFlag;
}

/**
 * Stamps the audit block for a first write — the port of `preInsert()`
 * [org/Hibachi/HibachiEntity.cfc:L598-L649].
 *
 * Behaviour reproduced exactly, in the legacy order:
 *
 *   1. ONE timestamp is read and shared by BOTH timestamp fields. The legacy hook captures a single
 *      `var timestamp = now()` at [org/Hibachi/HibachiEntity.cfc:L609] and consumes that same local
 *      at :L613 and again at :L618, so on insert `createdDateTime` and `modifiedDateTime` denote the
 *      identical instant. The clock is therefore read exactly once here, and the invariant
 *      `getTime()` equality between the two fields holds by construction rather than by luck.
 *   2. `createdDateTime` is written unconditionally [:L611-L614].
 *   3. `modifiedDateTime` is written unconditionally, on this insert path [:L616-L619] — asymmetry 2.
 *   4. `createdByAccount` is written only when GATE 2 and GATE 3 both hold [:L627-L630].
 *   5. `modifiedByAccount` is ALSO written on this insert path, behind the same gates [:L632-L635].
 *
 * TRANSLATION DECISION — JAVASCRIPT `Date` IS MUTABLE WHERE THE CFML VALUE WAS NOT. The single
 * instant is assigned to both fields, so the two properties reference THE SAME `Date` object. CFML's
 * date value had no in-place mutators, so this aliasing was unobservable there; in TypeScript a
 * caller that invoked a setter such as `setTime` on either field would move both. Treat the stamped
 * value as read-only. It is deliberately not defensively copied: two distinct objects would be a
 * quiet departure from "the identical instant", and freezing a `Date` does not prevent its mutators
 * from working anyway.
 *
 * TRANSLATION DECISION — `void` BECOMES A FLUENT RETURN. The legacy hook is declared
 * `public void function preInsert()` and mutated `this`. This function likewise mutates the entity in
 * place — same observable effect — and additionally returns it so callers can compose. The generic
 * parameter preserves the caller's concrete entity type rather than widening it to the interface.
 *
 * @param entity - The entity being written for the first time. Mutated in place.
 * @param auditActor - The resolved current-account context, or `undefined`/omitted when there is
 *   none. When it is absent, or fails GATE 2 or GATE 3, both timestamps are still stamped and both
 *   account fields are left absent — matching the legacy behaviour for a new or non-administrative
 *   actor.
 * @returns The same entity instance that was passed in.
 */
export function applyPreInsertAudit<TEntity extends AuditableEntity>(
  entity: TEntity,
  auditActor?: AccountReference,
): TEntity {
  // [org/Hibachi/HibachiEntity.cfc:L609] — one clock read, shared by both fields below.
  const timestamp = new Date();

  // [org/Hibachi/HibachiEntity.cfc:L611-L614] — unconditional.
  entity.createdDateTime = timestamp;

  // [org/Hibachi/HibachiEntity.cfc:L616-L619] — unconditional, and on the INSERT path (asymmetry 2).
  entity.modifiedDateTime = timestamp;

  if (isAuditAttributableAccount(auditActor)) {
    // [org/Hibachi/HibachiEntity.cfc:L627-L630]
    entity.createdByAccount = auditActor.accountID;

    // [org/Hibachi/HibachiEntity.cfc:L632-L635] — modifiedByAccount is stamped on insert too.
    entity.modifiedByAccount = auditActor.accountID;
  }

  return entity;
}

/**
 * Stamps the audit block for a subsequent write — the port of `preUpdate(struct oldData)`
 * [org/Hibachi/HibachiEntity.cfc:L651-L680].
 *
 * Behaviour reproduced exactly:
 *
 *   1. `modifiedDateTime` is written unconditionally from a freshly read timestamp
 *      [org/Hibachi/HibachiEntity.cfc:L662 and :L664-L667].
 *   2. `modifiedByAccount` is written only when GATE 2 and GATE 3 both hold [:L675-L678].
 *   3. `createdDateTime` is NEVER touched. There is no `setCreatedDateTime` call anywhere in the
 *      legacy hook — verified by reading the whole body, :L651-L680.
 *   4. `createdByAccount` is NEVER touched, for the same reason. The created pair is written once,
 *      on insert, and never rewritten.
 *
 * TRANSLATION DECISION — THE `oldData` PARAMETER IS DROPPED. The legacy signature is
 * `preUpdate(struct oldData)` [org/Hibachi/HibachiEntity.cfc:L651], and Hibernate supplied the
 * pre-image of the row in it, but the body NEVER READS IT — verified across the full hook,
 * :L651-L680. Carrying a parameter no code consumes would imply a change-detection capability this
 * function does not have and the legacy hook never used. The omission is recorded here so a reviewer
 * diffing the two signatures sees it as deliberate.
 *
 * TRANSLATION DECISION — `void` BECOMES A FLUENT RETURN, exactly as on the insert path above.
 *
 * @param entity - The entity being updated. Mutated in place.
 * @param auditActor - The resolved current-account context, or `undefined`/omitted when there is
 *   none. When it is absent, or fails GATE 2 or GATE 3, `modifiedDateTime` is still stamped and
 *   `modifiedByAccount` is left exactly as it was.
 * @returns The same entity instance that was passed in.
 */
export function applyPreUpdateAudit<TEntity extends AuditableEntity>(
  entity: TEntity,
  auditActor?: AccountReference,
): TEntity {
  // [org/Hibachi/HibachiEntity.cfc:L662] — the update hook reads its own timestamp.
  const timestamp = new Date();

  // [org/Hibachi/HibachiEntity.cfc:L664-L667] — unconditional. Only the MODIFIED pair is in play on
  // this path; createdDateTime and createdByAccount are deliberately untouched (asymmetry 2's
  // counterpart).
  entity.modifiedDateTime = timestamp;

  if (isAuditAttributableAccount(auditActor)) {
    // [org/Hibachi/HibachiEntity.cfc:L675-L678]
    entity.modifiedByAccount = auditActor.accountID;
  }

  return entity;
}

/*
 * =============================================================================================
 * WHAT THIS MODULE DELIBERATELY DOES NOT PORT
 * =============================================================================================
 * The two legacy hooks contain three further blocks. None is an audit concern, and each is omitted
 * for a stated reason rather than overlooked. AAP §0.4.1.4 scopes this file precisely to "the
 * `createdDateTime` / `createdByAccount` / `modifiedDateTime` / `modifiedByAccount` block".
 *
 * 1. THE FLUSH GUARD — [org/Hibachi/HibachiEntity.cfc:L599-L607] in the insert hook and
 *    [org/Hibachi/HibachiEntity.cfc:L652-L660] in the update hook, the two differing only in their
 *    log wording. Both open by testing `isPersistable()` and, when it fails, iterate the entity's
 *    accumulated validation errors, write them to the framework log and to the response, and then
 *    abort the operation with a hard error.
 *    NOT PORTED, and nothing of it is re-exported. It is a Hibernate-session-flush concern — it
 *    existed because the ORM could flush an invalid entity at request end — and that concern now
 *    belongs to `src/adapters/mysql/UnitOfWork.ts`, which owns the explicit transaction boundary
 *    that replaced the implicit request-end commit (mismatch M5). Its error message is likewise not
 *    carried: `src/errors/DomainError.ts` holds a closed inventory of the legacy message strings
 *    that are genuinely observable Catalog behaviour, all originating in `model/entity/Product.cfc`
 *    and `model/service/SkuService.cfc`. This message originates in `org/Hibachi/**`, which AAP
 *    §0.8.3.2 describes as a framework "being retired for this slice, not carried forward" and as a
 *    boundary to extract from rather than to modify, and it is not one of the twenty-one carried
 *    defects D1-D21. Adding it would be inventing an artifact
 *    the plan does not list. No error is raised anywhere in this module, and no framework logging or
 *    response-dumping facility is reproduced.
 *
 * 2. THE CALCULATED-PROPERTY RECALCULATION CALL — invoked inside GATE 0 on both paths, at
 *    [org/Hibachi/HibachiEntity.cfc:L625] and [org/Hibachi/HibachiEntity.cfc:L673], and defined at
 *    [org/Hibachi/HibachiEntity.cfc:L31].
 *    NOT PORTED, NOT STUBBED, AND NO HOOK IS DECLARED FOR IT — flagged here as a TR-5 boundary
 *    omission. It recomputes non-persistent calculated properties, which AAP §0.2.2.6 calls "the
 *    exclusion most likely to be violated by accident": sixteen named calculated members reach
 *    exclusively into `priceGroupService`, `currencyService`, `stockService`, `inventoryService`,
 *    `promotionService`, `locationService`, `fulfillmentService` and `attributeService`, every one of
 *    which is explicitly out of scope. Following it from here would drag half the platform into the
 *    port. Recalculation of the calculated members that ARE retained is owned by the individual
 *    entity modules, not by this shared audit type.
 *
 * 3. THE SORT-ORDER INITIALISATION BLOCK — [org/Hibachi/HibachiEntity.cfc:L637-L647], present on the
 *    insert path only and absent from the update hook entirely.
 *    NOT PORTED and not referenced by the type above. It is not an audit field, so it falls outside
 *    this file's stated scope; it also reads entity property metadata reflectively and resolves a
 *    collaborator through a string-keyed service locator, which S3 forbids outright, and it issues a
 *    table-wide maximum read, which S2 forbids in this layer.
 *
 * Also recorded, because it bounds the whole surface: the six remaining ORM hooks — the pre-delete,
 * pre-load, post-insert, post-update, post-delete and post-load stubs at
 * [org/Hibachi/HibachiEntity.cfc:L682-L700] — are COMMENTED OUT in the legacy source and have empty
 * bodies. Nothing else in the entity lifecycle was live, so the two functions above are the complete
 * behaviour of that lifecycle as it applied to this slice.
 */
