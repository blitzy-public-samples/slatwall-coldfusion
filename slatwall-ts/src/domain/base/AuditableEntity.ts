/**
 * AuditableEntity — the audit-field block of the Catalog, extracted from a retired ORM lifecycle.
 *
 * Four fields — `createdDateTime`, `createdByAccount`, `modifiedDateTime`, `modifiedByAccount` — are
 * declared identically on all six in-scope Catalog entities, and none was ever written by application
 * code: the CFML engine's Hibernate hooks `preInsert()` [org/Hibachi/HibachiEntity.cfc:L598-L649] and
 * `preUpdate(struct oldData)` [org/Hibachi/HibachiEntity.cfc:L651-L680] stamped them. A stateless
 * invocation has no ORM session and no lifecycle hooks, so that behaviour lives here instead: an
 * explicit type plus explicit functions, invoked by whoever owns the write — in practice
 * `src/adapters/mysql/UnitOfWork.ts`, which owns the transaction boundary that replaced the implicit
 * request-end commit (M5).
 *
 * This module is a type plus free functions and never an inheritance root: entities satisfy the
 * interface structurally and pass themselves to the functions (AAP §0.3.3, composition over
 * inheritance). It performs no lookup, no data access and no logging, and the resolved actor arrives
 * as a parameter rather than through the ambient `getHibachiScope()`
 * [org/Hibachi/HibachiObject.cfc:L73-L76] plus `getAccount()` [org/Hibachi/HibachiScope.cfc:L134] pair
 * the legacy gates were written around (AAP §0.7.3 S3).
 *
 * FOUR ASYMMETRIES ARE PRESERVED DELIBERATELY. A more symmetrical version of this module would be a
 * wrong one, and AAP §0.8.2 Guideline 4 forbids repairing any of them:
 *
 *   1. Only the two TIMESTAMP getters are overridden. `getCreatedDateTime()`
 *      [org/Hibachi/HibachiEntity.cfc:L291-L297] and `getModifiedDateTime()` [:L299-L305] return the
 *      EMPTY STRING when the value is null; the account getters have no override, so they are simply
 *      absent when unset. Absence is therefore represented two ways on purpose — `Date | ''` for the
 *      timestamps, `string | undefined` for the accounts. See the accessor block below.
 *   2. `modifiedDateTime` and `modifiedByAccount` are written on INSERT as well as on update
 *      [org/Hibachi/HibachiEntity.cfc:L617-L619 and :L632-L635].
 *   3. The timestamps are written unconditionally while the account fields are written only behind
 *      gates; the two halves of the block share no condition.
 *   4. Attribution is ADMIN-ONLY, so a save by a non-administrative actor leaves both account fields
 *      absent while both timestamps are still stamped — see GATE 3.
 *
 * THE GATE STACK. Four legacy conditions guard the account assignments: two survive as executable
 * code, two are satisfied structurally. All four are recorded, because a dropped gate without a
 * reason is indistinguishable from a bug.
 *
 *   GATE 0 — `hasApplicationValue("initialized") && getApplicationValue("initialized")`
 *     [org/Hibachi/HibachiEntity.cfc:L622, and :L670 on the update hook]; its own source comment
 *     records that it suppressed this block while the CFML application was still bootstrapping.
 *     STRUCTURALLY SATISFIED: an invocation has no setup phase and no application scope to read the
 *     flag out of, so no `isInitialized` flag, environment variable or parameter is invented for it
 *     (AAP §0.7.3 S9). Observable consequence: legacy stamping was skipped during application setup,
 *     and here it never is.
 *   GATE 1 — `structKeyExists(this, "setCreatedByAccount")` / `..."setModifiedByAccount")`
 *     [org/Hibachi/HibachiEntity.cfc:L628, :L633 and :L676]. STRUCTURALLY SATISFIED: it asked whether
 *     the entity carried the generated setter at all, because the framework base class was shared by
 *     entities that did not declare the audit properties. All four fields are declared on the type
 *     below, so the compiler enforces what the reflective test checked, and reproducing it with a
 *     runtime property probe would reintroduce the metaprogramming IR-1 exists to retire.
 *   GATE 2 — `!getHibachiScope().getAccount().isNew()`: the actor must already be persisted. LIVE, in
 *     `isAuditAttributableAccount` below, with the legacy polarity preserved.
 *   GATE 3 — `getHibachiScope().getAccount().getAdminAccountFlag()`: the actor must carry the
 *     administrative flag. LIVE, and the reason for asymmetry 4.
 *
 * M7 — WHY THE CLOCK IS READ INSIDE THE FUNCTIONS. Module-scope state survives on a warm container
 * and would bleed across invocations, so this module holds no mutable module-scope binding, no cache,
 * no singleton clock and no cached actor: `new Date()` is read inside the function that needs it and
 * the actor is passed per call. The one module-scope binding, `AUDIT_PROPERTY_NAMES`, is an immutable
 * frozen constant with no per-request content.
 */

import { DomainError } from '../../errors/DomainError';

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
  const timestamp = new Date();

  entity.createdDateTime = timestamp;

  entity.modifiedDateTime = timestamp;

  if (isAuditAttributableAccount(auditActor)) {
    entity.createdByAccount = auditActor.accountID;

    entity.modifiedByAccount = auditActor.accountID;
  }

  return entity;
}

/**
 * Stamps the audit block for a subsequent write — the port of `preUpdate(struct oldData)`
 * [org/Hibachi/HibachiEntity.cfc:L651-L680]. `modifiedDateTime` is written unconditionally from a
 * freshly read timestamp [:L662 and :L664-L667]; `modifiedByAccount` only when GATE 2 and GATE 3 both
 * hold [:L675-L678]. The created pair is written once, on insert, and is never touched on this path.
 *
 * TRANSLATION DECISION — THE `oldData` PARAMETER IS DROPPED. Hibernate supplied the row's pre-image in
 * it and the legacy body never reads it, so carrying it would imply a change-detection capability
 * neither the legacy hook nor this function has.
 *
 * @param entity - The entity being updated. Mutated in place.
 * @param auditActor - The resolved current-account context, or `undefined`/omitted when there is none.
 *   When it is absent, or fails GATE 2 or GATE 3, `modifiedDateTime` is still stamped and
 *   `modifiedByAccount` is left exactly as it was.
 * @returns The same entity instance that was passed in.
 */
export function applyPreUpdateAudit<TEntity extends AuditableEntity>(
  entity: TEntity,
  auditActor?: AccountReference,
): TEntity {
  const timestamp = new Date();

  entity.modifiedDateTime = timestamp;

  if (isAuditAttributableAccount(auditActor)) {
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
 *    boundary to extract from rather than to modify, and it is not one of the carried defects, so
 *    adding it would be inventing an artifact the plan does not list. No register identifier is
 *    minted here either: the register is stated canonically, and only once, in the header of
 *    `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus the
 *    source extension D22 and the three contract corrections D23, D24 and D25, with no D26 or
 *    beyond; and AAP 0.6.6's M1-M8 plus M9, with no M10 or beyond). Neither audit lifecycle
 *    function above raises anything at all, and no framework logging or response-dumping facility
 *    is reproduced. The one error this module does raise belongs to the unrelated concern added
 *    below — the property-metadata guard of {@link requireDeclaredPropertyMetaData}, which
 *    reproduces a specific legacy throw at [org/Hibachi/HibachiTransient.cfc:L746] rather than the
 *    framework's flush-time abort.
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

/* =============================================================================================
 * THE MANAGED-ENTITY CONTRACT — SEVEN MEMBERS EVERY LEGACY ENTITY HAD BY INHERITANCE
 * =============================================================================================
 *
 * WHY THIS SECTION EXISTS AT ALL
 * ------------------------------
 * Every in-scope entity extends `model/entity/HibachiEntity.cfc`, which extends
 * `org/Hibachi/HibachiEntity.cfc`, which extends `org/Hibachi/HibachiTransient.cfc`, which extends
 * `org/Hibachi/HibachiObject.cfc`. Seven members that the Catalog slice genuinely depends on are
 * declared nowhere in `model/**` because they arrive down that chain:
 *
 *   1. `getClassName()`                — [org/Hibachi/HibachiObject.cfc:L135-L137]
 *   2. `getEntityName()`               — [org/Hibachi/HibachiEntity.cfc:L287-L289]
 *   3. `getPrimaryIDValue()`           — [org/Hibachi/HibachiEntity.cfc:L244-L246]
 *   4. `getPrimaryIDPropertyName()`    — [org/Hibachi/HibachiEntity.cfc:L249-L251]
 *   5. `getPropertyMetaData(name)`     — [org/Hibachi/HibachiTransient.cfc:L738-L747]
 *   6. `hasProperty(name)`             — [org/Hibachi/HibachiTransient.cfc:L763-L765]
 *   7. `getValueByPropertyIdentifier()`— [org/Hibachi/HibachiTransient.cfc:L466-L481]
 *
 * AAP IR-1 and TR-3 govern exactly this situation: "TypeScript under `strict` has no equivalent
 * facility, so each such call site becomes an explicitly declared, typed method on the target
 * service" — and the same applies verbatim to an entity. AAP §0.4.2.5 makes the obligation concrete
 * by enumerating the synthesised members the slice depends on and requiring each be declared.
 *
 * WHAT DEPENDS ON THEM, CONCRETELY
 * --------------------------------
 * These are not speculative additions. Two already-delivered contracts require them by name, and
 * neither can be satisfied by a plain data class:
 *   - `src/validation/Validator.ts`'s `ValidationSubject` requires members 1 and 6. It reads
 *     `getClassName()` to compose every reported message
 *     [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216] and guards every rule with
 *     `hasProperty()` [:L171], where a false answer SILENTLY SKIPS the rule.
 *   - `src/ports/UniquePropertyPort.ts`'s `UniquePropertyEntity` requires members 2, 3, 4, 5 and 7,
 *     in the order the legacy body reads them [org/Hibachi/HibachiDAO.cfc:L134-L138].
 *
 * WHY THE SHARED HALF LIVES HERE
 * ------------------------------
 * This module is already the home of the members the in-scope entities inherit from those same
 * retired framework bases — the audit block above is inherited from
 * [org/Hibachi/HibachiEntity.cfc]'s lifecycle hooks in exactly the same way. Putting the rest of
 * that inherited surface anywhere else would split one concern across two files, and creating a new
 * module for it would add a file the AAP's target tree does not list. Every entity module already
 * imports from here, so no new dependency edge is introduced in either direction: this module still
 * imports no entity, no service and no adapter.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - `getClassFullname()`, `getIdentifierColumnNames()`, `getIdentifierValue()`,
 *     `getPropertyFormatType()`, `getPropertySessionDefault()`, `getFormattedValue()`,
 *     `getProperties()`, `getPropertiesStruct()` and `removeAllManyToManyRelationships()`. Each is
 *     reachable down the same inheritance chain and none is called by the Catalog slice. AAP §0.4.2.5
 *     is explicit that synthesis is "not reproduced wholesale, only where used", and the same
 *     restraint applies to inherited members: adding an unused one would be capability beyond what
 *     the migration requires, which AAP §0.8.2 Guideline 4 forbids.
 *   - Anything that resolved a collaborator by string. The legacy `getPrimaryIDPropertyName()` at
 *     [org/Hibachi/HibachiEntity.cfc:L249-L251] reaches `getService("hibachiService")` and asks it
 *     for the name by entity name; `getEntityName()` at [:L287-L289] reflects over live component
 *     metadata. Both are the DI/1 service-locator and metadata-reflection machinery AAP §0.7.3 S3
 *     replaces with declarations, so each entity states its own two constants instead. That is the
 *     whole substance of TR-3 applied here.
 *   - A base class. AAP §0.3.3 replaces `extends="HibachiService"`-style template-method reuse with
 *     composition, and the same choice is made here deliberately: these are free functions plus an
 *     interface, and each entity implements the seven members as thin delegations. An abstract base
 *     would reintroduce exactly the inheritance chain this port exists to dismantle, and would force
 *     every entity to surrender its own constructor and field-initialiser shape to it.
 * ============================================================================================= */

/**
 * The metadata this port carries for one declared property.
 *
 * PORT OF the struct entry [org/Hibachi/HibachiTransient.cfc:L741-L743] returns out of the entity's
 * property structure. The legacy entry is the whole CFML property declaration — every attribute of
 * `<cfproperty>`, including `ormtype`, `fieldtype`, `cfc`, `hb_populateEnabled` and the rest.
 *
 * ⚠️ ONLY `name` IS CARRIED, AND THAT IS A DELIBERATE NARROWING RATHER THAN AN OMISSION. Exactly one
 * consumer of this metadata exists in the whole slice: the uniqueness check reads the resolved
 * metadata at [org/Hibachi/HibachiDAO.cfc:L134] and then uses precisely one member of it, `name`, in
 * identifier position at [:L140]. Reproducing the remaining attributes would be inventing surface no
 * in-scope caller reads, which AAP §0.8.2 Guideline 4 forbids — and it would also duplicate,
 * unreliably, information the port already states in a compile-checked form: `ormtype` and
 * `fieldtype` are carried by the descriptor types in `./populate.ts`, which is where population
 * actually consults them.
 *
 * It is structurally identical to `UniquePropertyMetaData` in `src/ports/UniquePropertyPort.ts`, so
 * an entity implementing the contract below satisfies that port with no nominal coupling in either
 * direction. That is intentional: the domain does not import a port type in order to describe its
 * own inherited surface.
 */
export interface EntityPropertyMetaData {
  /** The property's declared name, exactly as the entity declares it. */
  readonly name: string;
}

/**
 * An entity's complete set of declared property names, as a keyed set.
 *
 * PORT OF `getPropertiesStruct()`, the structure [org/Hibachi/HibachiTransient.cfc:L739] resolves
 * and both `hasProperty` [:L764] and `getPropertyMetaData` [:L741] then key into. A STRUCT keyed by
 * property name is what the legacy held, and a keyed object is what this port holds — the
 * correspondence is one to one, and membership is an own-key test in both.
 *
 * ⚠️ `Record<TPropertyName, true>` IS LOAD BEARING, AND CHECKS EXHAUSTIVENESS IN BOTH DIRECTIONS.
 * Every entity declares a `XxxPropertyName` union enumerating its complete legacy property surface,
 * and annotating the set with this type makes two mistakes compile errors rather than silent
 * behaviour changes:
 *
 *   1. A MISSING NAME fails to compile — "Property 'x' is missing in type". Silently omitting a name
 *      would make `hasProperty` answer false for it, and because
 *      [org/Hibachi/HibachiValidationService.cfc:L171] SKIPS a rule whose property is absent, a
 *      validation rule would then stop running with no error anywhere. That is the single most
 *      dangerous failure mode in this area, and it is why the set is checked rather than trusted.
 *   2. AN EXTRA NAME fails to compile — the object is not assignable. Inventing a property the
 *      entity does not declare would make `hasProperty` answer true for it and START running a rule
 *      the legacy never ran, which is the mirror-image behaviour change.
 *
 * ⚠️⚠️ THE SECOND CHECK CATCHES A REAL LEGACY ASYMMETRY THAT MUST NOT BE "FIXED".
 * `model/validation/Sku.json` and `model/validation/Brand.json` both declare a delete rule against
 * `physicalCounts`, yet NEITHER entity declares a property of that name: `model/entity/Sku.cfc:L87`
 * and `model/entity/Brand.cfc:L71` both declare `physicals`. The legacy `hasProperty('physicalCounts')`
 * therefore answers FALSE and the guard at [org/Hibachi/HibachiValidationService.cfc:L171] SKIPS
 * that rule entirely — the delete guard has never run in the legacy system. Adding `physicalCounts`
 * to either entity's set to "make the rule work" would ENABLE a guard the legacy never enforced,
 * changing behaviour in the name of fixing it. TODO(parity): the asymmetry is carried as observed and
 * is intentionally NOT repaired (AAP §0.7.3 S7, §0.8.2 Guidelines 2 and 4).
 *
 * The value type is `true` rather than the metadata itself because {@link EntityPropertyMetaData}
 * carries only the name, which the key already is; storing a second copy of the key as a value would
 * create two places for one fact to live.
 */
export type DeclaredPropertyNameSet<TPropertyName extends string> = Readonly<
  Record<TPropertyName, true>
>;

/**
 * The seven inherited members, as one explicit structural contract.
 *
 * An entity that implements this is a MANAGED entity: it can be validated, uniqueness-checked and
 * persisted through the shared service, adapter and validation layers. A plain data class cannot,
 * which is the gap this interface closes.
 *
 * It is declared as one interface rather than as several narrow ones because all seven arrive
 * together in the legacy — an entity either extends the framework bases or it does not — and because
 * each consuming contract already states its own narrower requirement. `ValidationSubject` and
 * `UniquePropertyEntity` are both structurally satisfied by anything implementing this, so a service
 * can accept the narrow shape it actually needs while an entity declares the whole inherited surface
 * once. That is deliberately the opposite of a marker interface: every member is called by real
 * in-scope code, enumerated in the section header above.
 *
 * ⚠️ THE MEMBER NAMES AND ARITIES ARE THE LEGACY ONES AND ARE NOT MODERNISED. `getClassName` is not
 * renamed to `className`, `getPrimaryIDValue` is not collapsed into a getter, and the two
 * ID-related members stay SEPARATE — one yields the property's NAME and the other its VALUE, and
 * [org/Hibachi/HibachiDAO.cfc:L140] uses both, the name in identifier position and the value in
 * bound position. Conflating them produces a statement that parses and then matches the wrong rows.
 * AAP TR-1 preserves the observed contract; AAP §0.8.1 permits idiom to change freely, but a member
 * name an out-of-scope caller already depends on is contract, not idiom.
 *
 * ⭐ WHO DECLARES THESE SEVEN AND WHO HAS THEM COMPOSED ON. The answer is not uniform, and it is
 * stated here ONCE because this is where the contract is declared and "which classes implement it" is
 * the question a reader arrives with. Every other file's note on the subject is deliberately LOCAL —
 * what that class does — with a pointer here for the whole picture.
 *
 *   FIVE ENTITY MODULES DECLARE `implements ManagedEntity` AND HAND-WRITE ALL SEVEN as prototype
 *   methods over their own module constants: `src/domain/sku/Sku.ts`,
 *   `src/domain/product/Product.ts`, `src/domain/product/Brand.ts`, `src/domain/option/Option.ts` and
 *   `src/domain/option/OptionGroup.ts`.
 *
 *   `src/domain/product/ProductType.ts` ALONE DECLARES NEITHER — no `implements` clause and none of
 *   the seven methods — so `manageEntity` from `src/domain/base/populate.ts` is the only thing that
 *   gives a ProductType this surface. That divergence is intentional and its reasoning and revision
 *   history are recorded in that file; the six are not to be harmonised without deciding to.
 *
 *   THE ERROR SURFACE IS UNIFORM, WHICH IS THE CONTRAST WORTH DRAWING: no entity module hand-writes
 *   any of the six members of `src/domain/base/populate.ts`'s `EntityErrorSurface` — measured, zero
 *   occurrences in all six classes — so that half arrives by composition for every entity, including
 *   the five that hand-write this one.
 *
 * ⚠️ THE PREVIOUS ACCOUNT SAID NO ENTITY DECLARED THESE SEVEN, AND IT WAS FALSE FOR FIVE OF THE SIX.
 * It appeared as "the runtime answer to the seven framework introspection members this class
 * deliberately does not declare" in all six metadata-declaration docs, and in three of them also as
 * "composed onto an instance by `../base/manageEntity` rather than hand-written here" — which named a
 * module that does not exist, `manageEntity` being a FUNCTION exported by
 * `src/domain/base/populate.ts`. That file then generalised the same error a second time, describing
 * the members as "forbidden as hand-written instance methods by every entity module's own mandate".
 * All of those are corrected and the correction is recorded rather than quietly applied, because a
 * claim about WHERE behaviour lives is exactly the kind a reader cannot check by reading the file that
 * makes it.
 */
export interface ManagedEntity {
  /**
   * The entity's bare class name — [org/Hibachi/HibachiObject.cfc:L135-L137], which returns the last
   * dot-delimited segment of the fully qualified component name.
   *
   * For the six in-scope entities that is `Product`, `Sku`, `ProductType`, `Brand`, `Option` and
   * `OptionGroup`. It is read to compose every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216] and interpolated into the
   * property-metadata failure at [org/Hibachi/HibachiTransient.cfc:L746].
   *
   * ⚠️ DISTINCT FROM {@link getEntityName}, and the two differ by more than formatting: the class
   * name is unprefixed while the entity name carries the `Slatwall` prefix. Using one where the other
   * belongs produces a wrong message or, worse, a wrong table.
   */
  getClassName(): string;

  /**
   * The entity's mapped ORM entity name — [org/Hibachi/HibachiEntity.cfc:L287-L289], which reads it
   * from live component metadata.
   *
   * For the six in-scope entities that is `SlatwallProduct`, `SlatwallSku`, `SlatwallProductType`,
   * `SlatwallBrand`, `SlatwallOption` and `SlatwallOptionGroup`, each declared by the `entityname`
   * attribute on the component itself.
   *
   * ⚠️ THIS IS THE LOGICAL ENTITY NAME, NOT THE PHYSICAL `Sw*` TABLE NAME. The legacy uniqueness
   * statement at [org/Hibachi/HibachiDAO.cfc:L140] is expressed over the mapped object graph, so the
   * prefixed form is correct there and is not a defect to correct. Translating it to the physical
   * table is the adapter's responsibility, as `src/ports/UniquePropertyPort.ts` states.
   *
   * Metadata reflection is replaced by a declared constant on each entity, per TR-3.
   */
  getEntityName(): string;

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765], an own-key test over the property structure.
   *
   * ⚠️ A FALSE ANSWER SILENTLY SKIPS A VALIDATION RULE rather than failing it
   * [org/Hibachi/HibachiValidationService.cfc:L171]. See the `physicalCounts` warning on
   * {@link DeclaredPropertyNameSet}: this is exactly why the declared set is exhaustiveness-checked
   * against the entity's own property-name union instead of hand-maintained.
   */
  hasProperty(propertyIdentifier: string): boolean;

  /**
   * Resolves the metadata for a declared property, raising when the name is not declared —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747].
   *
   * ⚠️ AN UNDECLARED NAME IS AN ERROR, NOT A SILENT MISS. The legacy returns the struct entry when
   * the key is present [:L741-L743] and THROWS when it is absent [:L746], which is why the return
   * type here is not optional. `src/ports/UniquePropertyPort.ts` states the same obligation from the
   * consuming side and warns that the tempting alternatives under `noUncheckedIndexedAccess` — a
   * non-null assertion, or quietly reporting the value as unique — both diverge from the legacy.
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData;

  /**
   * The VALUE currently held by the entity's primary identifier —
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to the generated getter for whichever
   * property {@link getPrimaryIDPropertyName} names.
   *
   * ⚠️ AN UNSAVED ENTITY RETURNS THE EMPTY STRING, NOT AN ABSENT VALUE. Every in-scope entity
   * declares `unsavedvalue=""` on its identifier and every port class initialises it to `''`, so a
   * new instance yields `''` here. That is what makes the self-exclusion term of the uniqueness
   * query a no-op on insert — an observation AAP §0.4.1.7 requires be reproduced rather than tidied
   * away, and which `src/ports/UniquePropertyPort.ts` carries as a `TODO(parity)`. It is also what
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts on a fresh instance.
   */
  getPrimaryIDValue(): string;

  /**
   * The NAME of the entity's primary identifier property —
   * [org/Hibachi/HibachiEntity.cfc:L249-L251].
   *
   * For the six in-scope entities that is `productID`, `skuID`, `productTypeID`, `brandID`,
   * `optionID` and `optionGroupID`. The legacy resolved it through `getService("hibachiService")`;
   * each entity declares it as a constant instead, per TR-3.
   *
   * AAP IR-6 records that 107 of 113 entities declare a 32-character application-generated string
   * identifier, so this name always comes from entity metadata and never from caller input — which
   * is what makes it safe to place in identifier position after the adapter validates it.
   */
  getPrimaryIDPropertyName(): string;

  /**
   * Reads a value by property identifier, walking a dotted or underscored path —
   * [org/Hibachi/HibachiTransient.cfc:L466-L481].
   *
   * Typed `unknown` because the legacy accessor is declared with the widest CFML return type and the
   * values genuinely vary; narrowing it here would invent a constraint the source does not state.
   * See {@link readValueByPropertyIdentifier} for the traversal rules, all four of which are
   * behaviour rather than convenience.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown;
}

/**
 * PORT OF `hasProperty` — [org/Hibachi/HibachiTransient.cfc:L763-L765].
 *
 * The legacy body is one `structKeyExists` call, and this is one own-key test, which is the exact
 * structural analogue: a CFML struct has no prototype chain, so its key test resolves own keys only.
 * `Object.hasOwn` is used rather than the `in` operator or an indexed read precisely to preserve
 * that — an inherited-member name such as `toString` or `constructor` must answer FALSE, and a bare
 * `in` test would answer true for both and silently enable a validation rule against a member that
 * is not a property at all.
 *
 * Case-SENSITIVE, deliberately. CFML struct keys are case-insensitive, so a legacy lookup for
 * `SKUCODE` would have matched `skuCode`; this port does not reproduce that, because every property
 * name reaching this function originates in a ported rule set, a ported port contract or entity
 * metadata — never in caller input — and every one of those states the name in its declared casing.
 * Folding case here would additionally make it possible for two distinct declared names to collide,
 * which the compile-checked set above otherwise makes impossible.
 *
 * @param declaredProperties - The entity's declared-property set.
 * @param propertyIdentifier - The name to test, in its declared casing.
 * @returns `true` when the entity declares a property of that name.
 */
export function hasDeclaredProperty<TPropertyName extends string>(
  declaredProperties: DeclaredPropertyNameSet<TPropertyName>,
  propertyIdentifier: string,
): boolean {
  return Object.hasOwn(declaredProperties, propertyIdentifier);
}

/*
 * The failure text of `getPropertyMetaData` — [org/Hibachi/HibachiTransient.cfc:L746].
 *
 * Reproduced with its legacy wording and its legacy interpolation order, because a maintainer
 * reading a log should see the string the legacy would have shown. It is composed here, once, rather
 * than at six entity call sites.
 *
 * WHY IT IS NOT IN `src/errors/DomainError.ts`'s VERBATIM INVENTORY, stated so its absence reads as
 * a decision rather than an oversight. That inventory is closed at exactly four strings, all
 * originating in `model/entity/Product.cfc` and `model/service/SkuService.cfc`, and the module says
 * so in terms: "The mandated inventory is exactly four strings — not three, not five." This string
 * originates in `org/Hibachi/**`, which AAP §0.8.3.2 describes as a framework being retired for this
 * slice rather than carried forward. It is also not observable behaviour of the Catalog: it fires
 * only when ported code names a property the entity does not declare, which is a programming fault
 * in the port itself, never something a caller can provoke. It is consequently raised as a plain
 * `DomainError`, whose deny-by-default presentation withholds it from any response and keeps it in
 * the internal account where it belongs.
 */
function missingPropertyMessage(propertyName: string, className: string): string {
  return `No property found with name ${propertyName} in ${className}`;
}

/**
 * PORT OF `getPropertyMetaData` — [org/Hibachi/HibachiTransient.cfc:L738-L747].
 *
 * Resolves the metadata for a declared property and RAISES for an undeclared one, reproducing the
 * legacy control flow exactly: present-key branch at [:L741-L743], throw at [:L746].
 *
 * The returned value is constructed from the confirmed key rather than read out of a stored map,
 * which is what lets the declared set hold `true` as its value type; see the note on
 * {@link DeclaredPropertyNameSet} for why one fact should not live in two places.
 *
 * @param declaredProperties - The entity's declared-property set.
 * @param propertyName - The name to resolve.
 * @param className - The entity's class name, interpolated into the failure exactly as the legacy
 *   interpolates `getClassName()`.
 * @returns The metadata for the named property.
 * @throws DomainError - When the entity declares no property of that name. Withheld from every
 *   response by the deny-by-default presentation; see {@link missingPropertyMessage}.
 */
export function requireDeclaredPropertyMetaData<TPropertyName extends string>(
  declaredProperties: DeclaredPropertyNameSet<TPropertyName>,
  propertyName: string,
  className: string,
): EntityPropertyMetaData {
  if (!hasDeclaredProperty(declaredProperties, propertyName)) {
    throw new DomainError(missingPropertyMessage(propertyName, className), {
      context: { propertyName, className },
    });
  }

  return { name: propertyName };
}

/**
 * Narrows an arbitrary value to something whose string keys can be read.
 *
 * Hand-written rather than drawn from a library, exactly as `src/handlers/httpResponse.ts` writes
 * its own single structural guard: AAP §0.7.3 S5 freezes the dependency set, so narrowing is
 * explicit. A user-defined type guard is used in preference to a cast so that nothing in this module
 * needs a non-null assertion, a shape-forcing cast, an explicit `any` or a suppression comment
 * (AAP §0.7.3 S1).
 *
 * Arrays are NOT excluded, and that is deliberate rather than an oversight. A one-to-many or
 * many-to-many property holds an array, and CFML's `isObject` answers false for one, so an array
 * encountered mid-path terminates the walk at the same point the legacy `isObject` test terminates
 * it — see rule 3 on {@link readValueByPropertyIdentifier}. Excluding arrays here would move that
 * decision to the wrong place.
 *
 * @param value - Any value.
 * @returns `true` when the value is a non-null object.
 */
function isPropertyBag(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads one member of an object the way the legacy `invokeMethod("get#name#")` did.
 *
 * G6 TRANSLATION DECISION — TWO ACCESS FORMS, BECAUSE THE PORT HAS TWO SHAPES WHERE CFML HAD ONE.
 * Every CFML property came with a generated `get<Name>()` accessor, so the legacy always invoked a
 * method. This port declares most properties as public fields and a minority — the members with
 * ported legacy bodies, such as `getProducts()` or `getOptions()` — as methods. Reading the field
 * first and falling back to the accessor covers both without either shape having to change: the
 * field read is the idiomatic analogue of a generated accessor (AAP §0.8.1), and the accessor
 * fallback reaches the members that genuinely have behaviour.
 *
 * The field read is restricted to OWN keys, for the reason given on {@link hasDeclaredProperty}: an
 * identifier colliding with an inherited member must not resolve. The accessor lookup is
 * deliberately NOT so restricted, because a class's methods live on its prototype and an own-key
 * test would reject every one of them.
 *
 * A no-argument accessor only. The legacy call passes no arguments, so a member requiring one is not
 * reachable this way in either system.
 *
 * @param subject - The object to read from.
 * @param name - The member name in its declared casing.
 * @returns The value, or `undefined` when neither form resolves.
 */
function readEntityMember(subject: Readonly<Record<string, unknown>>, name: string): unknown {
  if (Object.hasOwn(subject, name)) {
    return subject[name];
  }

  const accessorName = `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const accessor = subject[accessorName];

  if (typeof accessor === 'function') {
    const invoke = accessor as () => unknown;

    return invoke.call(subject);
  }

  return undefined;
}

/**
 * PORT OF `getValueByPropertyIdentifier` — [org/Hibachi/HibachiTransient.cfc:L466-L481], together
 * with the recursive walk it delegates to at [:L483-L491].
 *
 * The legacy pair reads as one algorithm and is ported as one function: `getLastObjectByPropertyIdentifier`
 * has no caller outside this member in the whole in-scope slice, so splitting it out would create a
 * public member the port does not need (AAP §0.8.2 Guideline 4).
 *
 * FOUR TRAVERSAL RULES, EVERY ONE OF THEM BEHAVIOUR RATHER THAN CONVENIENCE
 * ------------------------------------------------------------------------
 *   1. ⚠️ BOTH `.` AND `_` ARE DELIMITERS. Every legacy list call in this algorithm passes the
 *      TWO-CHARACTER delimiter list `"._"` — [:L468], [:L484], [:L486], [:L488] — and CFML treats
 *      each character in that argument as a separate delimiter. So `productType_productTypeName` and
 *      `productType.productTypeName` split identically into two segments. Reading `"._"` as a single
 *      two-character delimiter is the natural misreading and would collapse every underscored
 *      identifier into one segment, silently turning a relationship hop into a failed member read.
 *   2. ⚠️ EMPTY SEGMENTS ARE DISCARDED. CFML list functions ignore empty elements, so
 *      `brand..brandName` has two elements, not three. Filtering empties reproduces that; treating
 *      one as a segment would terminate the walk on a name no entity declares.
 *   3. THE WALK STOPS AT A NON-OBJECT. [:L487] recurses only when the intermediate value is present
 *      and `isObject`, and falls off the end otherwise, returning null. A simple value or an array
 *      part-way along the path therefore ends the traversal. [:L470] then requires the resolved
 *      object be present and NOT a simple value before reading the final member.
 *   4. ⚠️ AN UNRESOLVABLE PATH RETURNS THE EMPTY STRING, NOT AN ABSENT VALUE. [:L480] returns `""`
 *      for every failure — a missing intermediate, a simple intermediate, and a final member whose
 *      value is null [:L474-L476]. That is observable: a consumer distinguishing "absent" from
 *      "empty" would behave differently from the legacy, and the uniqueness check in particular
 *      binds this value straight into a query parameter. The empty string is returned deliberately
 *      and is not softened to `undefined`.
 *
 * NOT PORTED: the optional format flag. [:L466] declares `boolean formatValue=false` and [:L471-L473]
 * routes through `getFormattedValue` when it is set. No in-scope call site passes it — the uniqueness
 * check at [org/Hibachi/HibachiDAO.cfc:L138] omits it, and it compares stored values rather than
 * formatted ones — so the parameter is absent here. Declaring a parameter no caller supplies would
 * widen the contract beyond the observed behaviour, and the formatting concern already has a home in
 * `src/util/formatting.ts`.
 *
 * @param subject - The entity to read from, normally `this`.
 * @param propertyIdentifier - A single property name, or a path delimited by `.` or `_`.
 * @returns The resolved value, or `''` when the path cannot be resolved.
 */
export function readValueByPropertyIdentifier(
  subject: object,
  propertyIdentifier: string,
): unknown {
  // Rules 1 and 2: split on either delimiter, then discard empties as CFML list functions do.
  const segments = propertyIdentifier.split(/[._]/).filter((segment) => segment.length > 0);

  const finalSegment = segments[segments.length - 1];

  if (finalSegment === undefined) {
    // An identifier consisting only of delimiters, or none at all, names nothing. Rule 4.
    return '';
  }

  let current: unknown = subject;

  // Rule 3: hop through every segment but the last, stopping at anything that is not an object.
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (segment === undefined || !isPropertyBag(current)) {
      return '';
    }

    current = readEntityMember(current, segment);
  }

  if (!isPropertyBag(current)) {
    // [:L470] — the resolved object must be present and must not be a simple value.
    return '';
  }

  const value = readEntityMember(current, finalSegment);

  // Rule 4: [:L474-L476] returns the raw value only when it is non-null; otherwise [:L480] wins.
  return value ?? '';
}

/**
 * The FRAMEWORK-DEFAULT simple-representation property name —
 * [org/Hibachi/HibachiEntity.cfc:L74-L88].
 *
 * The legacy body walks the entity's property metadata in declaration order and returns the first
 * property whose name equals the class name with `name` appended [:L81-L82]; when nothing matches it
 * THROWS [:L87]. Three entities in the slice override the pair rather than inheriting it, so this
 * helper exists for the ones that do not: `Product.ts` and `Sku.ts` override
 * `getSimpleRepresentationPropertyName()` and `ProductType.ts` overrides `getSimpleRepresentation()`
 * outright, matching their legacy classes, while `model/entity/Brand.cfc:L157-L159` is an empty
 * override section and Brand therefore inherited this default. Under IR-1 an inherited member has to
 * be declared explicitly, which is why the default itself is ported instead of being reproduced
 * inside a test.
 *
 * ⚠️ THE COMPARISON IS CASE-INSENSITIVE, AND THAT IS THE OPERATOR'S RULE RATHER THAN A CONVENIENCE.
 * [:L81] compares with CFML `==`, which is case-insensitive for strings, so `Brand` + `name` yields
 * the target `Brandname` and still matches the declared `brandName`. Making this comparison
 * case-SENSITIVE would raise for every entity in the slice, because not one declares a property in
 * the exact concatenated casing.
 *
 * ⚠️ CONTRAST WITH THE `listFind` CASING RULE. `src/domain/base/populate.ts` matches many-to-many
 * identifiers case-SENSITIVELY because [org/Hibachi/HibachiTransient.cfc:L332] calls `listFind` and
 * not `listFindNoCase`. Different legacy operator, opposite rule. Neither casing decision may be
 * copied from the other.
 *
 * DECLARATION ORDER IS PRESERVED because `Object.keys` on the declared-property set enumerates
 * string keys in insertion order, and each entity's set is written in source-declaration order. The
 * legacy returns the FIRST match [:L82], so order is observable whenever an entity declares two
 * properties differing only in case — none does today, and reproducing the ordering keeps that from
 * mattering later.
 *
 * @param className - The entity's bare class name, from {@link ManagedEntity.getClassName}.
 * @param declaredProperties - The entity's declared property-name set.
 * @returns The name of the property whose value represents the entity.
 * @throws DomainError when no declared property satisfies the convention, reproducing [:L87].
 */
export function resolveSimpleRepresentationPropertyName<TPropertyName extends string>(
  className: string,
  declaredProperties: DeclaredPropertyNameSet<TPropertyName>,
): string {
  const conventionalName = `${className}name`.toLowerCase();

  for (const propertyName of Object.keys(declaredProperties)) {
    if (propertyName.toLowerCase() === conventionalName) {
      return propertyName;
    }
  }

  // [:L87] — carried verbatim, including the three source typos ("propety", "simpleRepresentaition",
  // "iside", "sectin"), because a throw message is observable behaviour and AAP §0.8.2 Guideline 4
  // forbids repairing it.
  throw new DomainError(
    `There is no Simple Representation Property Name for ${className}.  You can either override ` +
      `getSimpleRepresentation() or override getSimpleRepresentationPropertyName() in the entity, ` +
      `but be sure to do it at the bottom iside of commented sectin for overrides.`,
    { context: { className, conventionalName } },
  );
}

/**
 * The FRAMEWORK-DEFAULT simple representation of an entity — [org/Hibachi/HibachiEntity.cfc:L59-L71].
 *
 * The legacy body invokes the getter named by {@link resolveSimpleRepresentationPropertyName}
 * [:L62], returns the value when it is non-null AND simple [:L65-L66], and otherwise falls through
 * to the EMPTY STRING [:L70].
 *
 * ⚠️ THE BLANK FALLTHROUGH IS THE BEHAVIOUR, NOT A MISSING VALUE. A freshly constructed entity has
 * no name yet, so [:L70] wins and the representation is `''` — a simple value. That is precisely what
 * makes the inherited legacy assertion
 * `assert(isSimpleValue(entity.getSimpleRepresentation()))`
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] pass on a new instance. Returning
 * `undefined` here would be the natural TypeScript instinct and would break that assertion, so the
 * return type is `string` and the empty string is deliberate.
 *
 * `typeof value === 'string'` is the faithful analogue of `isSimpleValue` for this slice: every
 * property the convention can select is declared `ormtype="string"`, so a non-string value can only
 * arise from an unset property or a relationship — both of which the legacy `isSimpleValue` test
 * rejects in the same way.
 *
 * @param subject - The entity to represent, normally `this`.
 * @param propertyName - The property resolved by {@link resolveSimpleRepresentationPropertyName}.
 * @returns The property's value when it is a simple value, otherwise the legacy blank fallthrough.
 */
export function readSimpleRepresentation(subject: object, propertyName: string): string {
  if (!isPropertyBag(subject)) {
    return '';
  }

  const value = subject[propertyName];

  return typeof value === 'string' ? value : '';
}
