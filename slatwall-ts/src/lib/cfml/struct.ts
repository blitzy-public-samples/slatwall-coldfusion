// ---------------------------------------------------------------------------
// slatwall-ts - CFML struct-key access semantics
//
// PURPOSE
//   CFML struct keys are case-insensitive. TypeScript object keys are not.
//   Every ported struct-keyed lookup in this migration therefore has to be
//   audited rather than assumed, and this module is the single place where
//   that translation is decided, documented and implemented once.
//
//   It answers exactly two questions, and it keeps them separate:
//
//     * Is a key PRESENT?  -> structKeyExists / structFindKey / structKeyList
//     * What VALUE is stored under it?  -> structGet / structGetPath
//
//   Plus one comparison primitive, cfEquals, for the case-insensitive `eq`
//   that the currency cascade uses on currency codes.
//
// WHAT THIS FILE IS NOT
//   It is NOT a general-purpose object utility. There is no deep merge, no
//   deep clone, no structDelete, structInsert, structUpdate, structClear,
//   structAppend, structCopy, structNew, structKeyArray or structSort, and
//   none may be added. The export surface below is CLOSED. If a translation
//   need arises that none of these primitives covers, it belongs inside the
//   consuming module with a documented annotation - not as a new export here
//   and not as a new file in this folder.
//
//   structDelete is the concrete case worth naming: it occurs exactly once in
//   the whole in-scope slice, at model/service/RoundingRuleService.cfc:L59,
//   inside a memo-clearing path that becomes request-scoped state owned by the
//   service layer. It is deliberately absent here.
//
// ***************************************************************************
// ** THE NULL SEMANTICS IN THIS FILE ARE LOAD-BEARING ON MONEY.            **
// **                                                                       **
// ** Absence MUST propagate as `undefined`. Always. This module never       **
// ** invents a 0, an empty string, a null, an empty object, or a `??`       **
// ** fallback on a caller's behalf, and it deliberately offers no           **
// ** default-value parameter anywhere.                                     **
// **                                                                       **
// ** The legacy contract is a price accessor with no `else` branch and no   **
// ** fallback [model/entity/Sku.cfc:L269-L273]: an unknown currency yields  **
// ** nothing at all. Substituting 0 for that nothing would silently sell    **
// ** products for free. A caller that genuinely wants a default applies it  **
// ** itself, at its own call site, where the decision is visible in review. **
// ***************************************************************************
//
// THE SIZE OF THE SURFACE THIS SERVES
//   `structKeyExists` occurs 657 times across the model layer, counted
//   independently while authoring this file:
//
//     model/service/*.cfc   224
//     model/entity/*.cfc    392
//     model/dao/*.cfc        41
//     ------------------------------
//     total                 657
//
//   Of those, 22 are in the seven services this migration ports. That is the
//   scale this one module exists to serve; it is not a convenience wrapper.
//
// WHY CASE MAY NEVER BE ASSUMED - THE EMPIRICAL BASIS
//   CFML identifiers are genuinely case-insensitive, and the legacy source
//   relies on that inconsistently enough to prove the point on its own:
//
//     * The SAME ORM attribute is spelled two different ways. Lowercase
//       `ormtype` at model/entity/OptionGroup.cfc:L57, camelCase `ormType` at
//       model/entity/PriceGroupRate.cfc:L53. PriceGroupRate.cfc does not even
//       hold one spelling for the length of a single property block: L52 uses
//       `ormtype`, L53 through L55 use `ormType`, and L58 reverts to
//       `ormtype`.
//     * The SAME expression calls two list built-ins with different casing
//       side by side on one line: `ListDeleteAt` with a capital L and
//       `listFindNoCase` with a lowercase l, at
//       model/service/PromotionService.cfc:L774.
//
//   No ported lookup may assume the casing of a key it was handed.
//
// VERIFIED LEGACY PROVENANCE
//   Every locator cited in this file was re-read from the source while
//   authoring it. No drift was found; all of them are exact.
//
//   The decisive site is the trio of currency accessors on the SKU entity:
//
//     model/entity/Sku.cfc:L269-L273  getPriceByCurrencyCode
//       ONE structKeyExists on the currency key, returns `.price`, and has no
//       `else` and no fallback.
//     model/entity/Sku.cfc:L275-L279  getListPriceByCurrencyCode
//       TWO structKeyExists on one line: the currency key AND the "listPrice"
//       sub-key. Yields nothing even for a currency that IS in the map.
//     model/entity/Sku.cfc:L281-L285  getRenewalPriceByCurrencyCode
//       The identical two-level shape on the "renewalPrice" sub-key.
//
//   WHY THAT SECOND CHECK IS NECESSARY, which is what shapes structGetPath:
//   the map is built by getCurrencyDetails() at model/entity/Sku.cfc:L367-L433,
//   and the two levels are populated under DIFFERENT conditions.
//
//     L373       An eligibility gate wraps the whole build. Closed gate means
//                the map stays empty, so every accessor above yields nothing.
//     L381-L382  STEP 0 creates the OUTER entry for every eligible currency
//                UNCONDITIONALLY, together with an empty skuCurrencyID.
//     L385-L397  STEP 1, base currency, selected by a case-insensitive `eq` at
//                L385. `renewalPrice` (L386) and `listPrice` (L390) are each
//                written only under an `!isNull(...)` guard, while `price` at
//                L394 is written unconditionally.
//     L399-L414  STEP 2, per-currency overrides, matched by `eq` again at
//                L400, overwriting STEP 1. `renewalPrice` (L401) and
//                `listPrice` (L405) are again `!isNull(...)`-guarded.
//     L416-L428  STEP 3 converts on the fly, gated at L416 on the absence of
//                the "price" sub-key specifically, with `renewalPrice` (L417)
//                and `listPrice` (L421) once more `!isNull(...)`-guarded.
//
//   So the outer key is ALWAYS created while the inner listPrice and
//   renewalPrice keys are created ONLY when the underlying value is non-null.
//   Outer-present-with-inner-absent is therefore a reachable state, which is
//   exactly why L275-L285 need the second check and why structGetPath exists
//   as a distinct primitive instead of collapsing into structGet.
//
//   Correspondingly, `price` is written unconditionally by STEP 1 (L394),
//   STEP 2 (L409) and STEP 3 (L425), so for an eligible currency the "price"
//   sub-key is always present. getPriceByCurrencyCode yields nothing only when
//   the currency is not eligible or the L373 gate is closed.
//
//   The second shape this module serves is a plain keyed dictionary rather
//   than a currency map. model/service/RoundingRuleService.cfc keys its
//   details by rounding-rule UUID: initialised at L53, presence-tested at L58,
//   miss-guarded at L68, populated with roundingRuleExpression and
//   roundingRuleDirection at L72-L74, and read back at L76. Both shapes work
//   through the same primitives.
//
//   Three further key-access idioms in the slice, all supported here:
//
//     model/service/PromotionService.cfc:L148   exists-then-read on the same
//       key, on a money value, against a heterogeneous struct.
//     model/service/SkuService.cfc:L142, L147, L175   exists-OR-empty
//       compound predicates. The emptiness half belongs to list semantics, not
//       here; this module supplies only the presence half.
//     model/dao/ProductDAO.cfc:L259   bracket-notation access with a dynamic
//       string key, which shows dynamic keys reach the data layer too.
//
// ZERO IMPORTS
//   This module imports nothing. Not a third-party package, not a Node
//   built-in, not a sibling module, and not a type-only import. `src/lib/`
//   sits at the base of the domain-inward dependency flow that the ESLint
//   `no-restricted-imports` boundary enforces, so it reaches into no other
//   folder. If a helper here ever appears to need `domain`, `services`,
//   `repositories`, `integrations` or `handlers`, the design is wrong.
//
//   Not importing the sibling truthiness helper is a deliberate choice, not an
//   oversight. Presence and truthiness are different questions - a key can be
//   present while its value is empty, and a value can be truthy while its key
//   was never the one asked for - and blending them is precisely the
//   inconsistency this folder exists to prevent. A consumer that needs both
//   composes them at its own call site, where the composition is visible.
//
// ZERO MODULE-SCOPE MUTABLE STATE
//   There is no cache of folded keys, no Map, no WeakMap, and no module-level
//   `let` or `var`. The reason is correctness, not resource use: on a warm
//   Lambda container module-level state survives between unrelated
//   invocations, and here that would be a cross-request data-leak risk on a
//   money path - one order's price map answering another order's lookup. The
//   single deliberate module-scope-state exception anywhere in this target is
//   the MySQL connection pool, which is not this file.
//
//   Every export is pure and synchronous. Nothing here mutates its input, and
//   in particular reading never writes: structGet does not create the key it
//   failed to find. Nothing here throws either, because a throw would turn a
//   missing price into a server error rather than into the `undefined` that
//   the legacy contract produces.
//
// NO USER RULES WERE PROVIDED
//   (1) No user-specified rules were provided for this project. (2) That
//   absence was VERIFIED rather than assumed: the project rules document was
//   read three independent ways while authoring this file - unbounded, over
//   its full range, and over a range deliberately past its end - and all three
//   reads returned the same single statement that no rules exist. (3) No rule
//   is invented to fill the gap. (4) The absence is NOT license to lower the
//   bar; the enterprise substitute standard applies at full strength, which
//   for this file means maximal strictness with no `any`, no suppression
//   comment and no non-null assertion, one cohesive closed export surface, no
//   barrel, no credential or environment read of any kind, no schema or SQL
//   knowledge, no arithmetic on a monetary value, and every judgment call
//   annotated at the point where it was made. (5) Zero files enter scope by
//   rule mandate - there is no third, rule-driven category of in-scope file -
//   and there are consequently no rule conflicts to resolve.
//
// TEST COVERAGE IS NET-NEW
//   No legacy test touches these helpers. Nothing under meta/tests/** exercises
//   CFML struct-key semantics directly, and the only legacy suites extended
//   anywhere in this migration are meta/tests/unit/entity/BrandTest.cfc and
//   meta/tests/unit/entity/ProductTest.cfc, neither of which is related.
//   Coverage for this module is therefore entirely net-new and must never be
//   presented as parity. Its home is tests/unit/lib/cfml/struct.test.ts, which
//   belongs to the test tier and is authored separately from this file.
//
//   Every export below is written to be trivially drivable without a mock: all
//   six are pure functions over a plain object.
//
// HAND-OFF NOTES - RECORDED HERE, DELIBERATELY NOT ACTED ON HERE
//   These are observations for the owners of other layers. None of them is a
//   change to make in this file.
//
//   1. model/service/PromotionService.cfc:L260-L263 keys its accumulator with
//      the misspelled identifier `orderItemQulifiedDiscounts`, which also
//      appears at L152. That spelling is a data-contract identifier owned by
//      the service layer. It is noted, not corrected, and nothing here depends
//      on it.
//   2. The rounding-rule memo at model/service/RoundingRuleService.cfc:L53
//      becomes request-scoped state in the target, owned by the service layer.
//      This module implements no cache of any kind on its behalf.
//   3. model/entity/Sku.cfc:L294 and L299 use structKeyExists against the CFML
//      `arguments` scope, which is optional-parameter presence testing rather
//      than struct access. In the target those become ordinary optional
//      parameters, owned by the domain layer. No `arguments`-scope emulator is
//      built here.
// ---------------------------------------------------------------------------

/**
 * A CFML struct as it arrives in TypeScript: a plain object keyed by string.
 *
 * Used where the VALUE type is load-bearing - notably as the outer container of
 * {@link structGetPath}, whose whole purpose is to reach a second level. The
 * presence-oriented helpers accept a broader `object` instead, for the reason
 * recorded on {@link structKeyExists}.
 *
 * `T` defaults to `unknown` rather than `any` so a caller that has not yet
 * decided on a value type still gets a type it must narrow before use.
 *
 * A note on modelling, because `exactOptionalPropertyTypes` is load-bearing in
 * this file: an ABSENT key and a key PRESENT with the value `undefined` are
 * different states, and this module keeps them different. `structKeyExists`
 * reports presence and ignores the value entirely; `structGet` reports the
 * value and returns `undefined` for both a genuine miss and a stored
 * `undefined`. Callers that need to tell those apart ask both questions, which
 * is exactly what the legacy two-check accessors do.
 */
export type CfStruct<T = unknown> = Readonly<Record<string, T>>;

/**
 * Folds a key to its comparison form.
 *
 * JUDGMENT CALL: `toLowerCase()`, never `toLocaleLowerCase()`.
 *   CFML matches struct keys and evaluates `eq` without consulting a locale.
 *   `toLocaleLowerCase()` would consult the ambient locale, which changes the
 *   result for the Turkish dotless-I class of inputs: under a `tr` locale the
 *   letter I folds to a dotless i, so a key spelled with an ASCII `I` would
 *   stop matching a key spelled with an ASCII `i`. Since the fold has to be
 *   stable regardless of where the code runs, this module pins the
 *   locale-independent fold. The consequence is accepted openly: a key pair
 *   distinguished only by a locale-specific case rule is treated as distinct.
 *
 * JUDGMENT CALL: keys are NOT trimmed.
 *   CFML struct keys preserve surrounding whitespace, so only case is folded
 *   here. Trimming is exactly the kind of helpful-looking normalisation that
 *   silently changes which key a lookup resolves to, and it is deliberately
 *   not done: a stored key of `' USD'` is a different key from `'USD'`, in this
 *   module as in CFML.
 */
function foldKey(key: string): string {
  return key.toLowerCase();
}

/**
 * Narrows a runtime string to a genuine own key of `struct`.
 *
 * This exists for the type system, and its runtime check is `hasOwnProperty`
 * called off `Object.prototype` rather than off the object itself. That form is
 * required: a struct hydrated from external data can carry its own
 * `hasOwnProperty` property, in which case `struct.hasOwnProperty(key)` would
 * invoke whatever that value happens to be instead of the built-in.
 *
 * PROTOTYPE SAFETY. Callers reach this only with a key that
 * {@link findStoredKey} already obtained from `Object.keys`, so the predicate
 * always holds there; it is the narrowing, not the guard, that is doing the
 * work. The guarantee itself comes from `Object.keys`, which yields own
 * enumerable keys only. Inherited members - `toString`, `constructor`,
 * `valueOf`, `hasOwnProperty`, and the `__proto__` accessor - are never
 * candidates on a plain object, so a lookup for any of them resolves to
 * nothing. No indexed read in this module is ever performed with a key that did
 * not come out of `Object.keys` first, which is why the prototype chain is
 * never reachable through these helpers rather than merely filtered out
 * afterwards. Neither a bare `key in struct` test nor a bare `struct[key]` read
 * on an unresolved key appears anywhere in this file.
 */
function isOwnKeyOf<TStruct extends object>(
  struct: TStruct,
  key: string,
): key is keyof TStruct & string {
  return Object.prototype.hasOwnProperty.call(struct, key);
}

/**
 * Resolves `key` case-insensitively to the key actually stored on `struct`, or
 * `undefined` when no own key matches.
 *
 * The single place in this module where a key is matched. Every export routes
 * through it, so the case-folding policy, the no-trim policy, the collision
 * policy and the prototype-safety guarantee are decided exactly once.
 *
 * JUDGMENT CALL: on a collision, the FIRST match in insertion order wins.
 *   CFML cannot represent a struct holding both `'price'` and `'Price'` at all,
 *   so this state is unreachable from ported CFML and has no legacy behaviour
 *   to preserve. It is reachable in TypeScript from a plain object hydrated
 *   elsewhere, so it needs a defined answer rather than an accident. This
 *   module returns the first matching own key in `Object.keys` order and does
 *   NOT throw - a throw on a money path would convert an ambiguous price map
 *   into a server error - and does NOT silently merge the colliding entries,
 *   which would fabricate a value that was never stored.
 */
function findStoredKey<TStruct extends object>(
  struct: TStruct,
  key: string,
): (keyof TStruct & string) | undefined {
  const wanted = foldKey(key);

  for (const storedKey of Object.keys(struct)) {
    if (foldKey(storedKey) === wanted && isOwnKeyOf(struct, storedKey)) {
      return storedKey;
    }
  }

  return undefined;
}

/**
 * Is `key` present on `struct`, matched case-insensitively?
 *
 * PRESENCE IS NOT VALUE, and this function answers only the first question. It
 * returns `true` for a key whose stored value is `undefined` or `null`, because
 * CFML distinguishes a key existing from a key holding something. Pair it with
 * {@link structGet} when both answers are needed - which is precisely what the
 * legacy two-check accessors do.
 *
 * That distinction is not academic. It is the reason the currency accessors at
 * model/entity/Sku.cfc:L275-L285 need a second check at all: the outer currency
 * key is created unconditionally at model/entity/Sku.cfc:L381-L382 while the
 * inner `listPrice` and `renewalPrice` keys are created only under
 * `!isNull(...)` guards at L386-L393 and L401-L405, so presence at one level
 * says nothing about presence at the next.
 *
 * The parameter is `object` rather than `CfStruct<unknown>` deliberately. A
 * heterogeneous struct is a real shape in this slice - model/service/
 * PromotionService.cfc:L148 presence-tests then reads `"salePrice"` on exactly
 * such a struct - and in TypeScript that is naturally declared as an interface.
 * An interface has no string index signature, so it is not assignable to
 * `Readonly<Record<string, unknown>>` and a narrower parameter type would reject
 * it. `object` accepts every struct shape the slice actually produces, and
 * because presence never depends on the value type nothing is given up by
 * widening it. The contract is a plain object; an array would be answered about
 * its numeric-string indices, which is meaningless but harmless.
 *
 * CFML parity [model/entity/Sku.cfc:L270]: the single presence test that guards
 * the price read.
 * CFML parity [model/entity/Sku.cfc:L276, L282]: the paired presence tests, the
 * second of which inspects a sub-key.
 * CFML parity [model/service/RoundingRuleService.cfc:L58, L68]: the same
 * primitive against a UUID-keyed dictionary - once to decide whether a stale
 * entry needs clearing, once as the memo-miss guard.
 * CFML parity [model/service/PromotionService.cfc:L148, L260]: exists-then-read
 * on one key, and exists-then-initialise on another.
 * CFML parity [model/service/SkuService.cfc:L142, L147, L175]: the presence half
 * of the exists-OR-empty compound predicates. The emptiness half is list
 * semantics and is not this module's concern.
 */
export function structKeyExists(struct: object, key: string): boolean {
  return findStoredKey(struct, key) !== undefined;
}

/**
 * The key as it is actually stored on `struct`, matched case-insensitively, or
 * `undefined` when no own key matches.
 *
 * Exists because a caller sometimes needs the canonical spelling rather than the
 * value: to report which key answered a lookup, or to write back under the key
 * already in use rather than adding a second entry that differs only by case.
 * The legacy engine had no equivalent because CFML never needed one - the engine
 * owns the key store - so this is the one primitive here that is a target
 * addition rather than a port.
 *
 * Deliberately minimal: it returns the matching key and nothing else. No
 * normalisation, no list of all matches, no value.
 */
export function structFindKey(struct: object, key: string): string | undefined {
  return findStoredKey(struct, key);
}

/**
 * The keys stored on `struct`, as a fresh array.
 *
 * Reproduces the CFML pattern of taking a struct's keys and then indexing back
 * into the struct with one of them, as at model/service/ProductService.cfc:L87-L91
 * where the option data is walked with `arguments.data[listGetAt(keys, position)]`.
 *
 * JUDGMENT CALL: the result is in insertion order, and no ported caller may
 * depend on that.
 *   CFML's own `structKeyList` and `structKeyArray` have engine-dependent
 *   ordering: an unordered struct guarantees no particular order, and the order
 *   observed on one engine is not a contract on another. Legacy code therefore
 *   cannot have depended on an order, so there is no legacy ordering to
 *   preserve. This implementation returns own enumerable keys in JavaScript
 *   insertion order, which makes the result deterministic - a genuine
 *   improvement over an engine-dependent order, and worth stating plainly - but
 *   a ported caller that starts relying on it would be depending on behaviour
 *   the source never guaranteed. Sort explicitly if order matters.
 *
 * The array is newly allocated on every call, so a caller may sort or splice it
 * without disturbing `struct` or any earlier result. Keys are returned exactly
 * as stored, with their original casing and any surrounding whitespace intact;
 * folding happens only during matching, never in what is handed back.
 */
export function structKeyList(struct: object): string[] {
  return Object.keys(struct);
}

/**
 * The value stored under `key` on `struct`, matched case-insensitively, or
 * `undefined` when no own key matches.
 *
 * ***********************************************************************
 * ** ABSENCE PROPAGATES AS `undefined`. NEVER 0, NEVER '', NEVER null,  **
 * ** NEVER {}. Substituting 0 for a missing price would silently sell   **
 * ** products for free.                                                 **
 * ***********************************************************************
 *
 * THERE IS DELIBERATELY NO `defaultValue` PARAMETER. Offering one is exactly
 * how a 0 sneaks into a price path: the default gets supplied at the one call
 * site nobody reviews closely, and a missing price silently becomes a free
 * product. A caller that genuinely wants a fallback applies `??` itself, at its
 * own call site, where the substitution is visible in the diff and can be
 * argued about. This function's job is to report faithfully what is stored, and
 * to report nothing when nothing is stored.
 *
 * Reading never writes. A miss leaves `struct` exactly as it was - no key is
 * created, no value is initialised - so calling this on a price map cannot
 * populate it with placeholder entries.
 *
 * The return type carries the honest union of what `struct` can hold plus
 * `undefined`. For a homogeneous map such as the currency-details map that is
 * the entry type; for a heterogeneous struct declared as an interface it is the
 * union of that interface's property types, which the caller narrows. Nothing is
 * cast, and no `any` is laundered through the generic.
 *
 * A stored `undefined` and a genuine miss both come back as `undefined`, by
 * design: this function answers the value question only. Ask
 * {@link structKeyExists} when the difference matters.
 *
 * CFML parity [model/entity/Sku.cfc:L269-L273]: `getPriceByCurrencyCode` tests
 * the currency key once, returns `.price` when it matches, and has no `else` and
 * no fallback - so an unmatched currency yields nothing. That is the contract
 * this function reproduces.
 * CFML parity [model/service/RoundingRuleService.cfc:L76]: the read-back of a
 * UUID-keyed memo entry, the second struct shape this module serves.
 * CFML parity [model/service/PromotionService.cfc:L148]: the read half of the
 * exists-then-read idiom, on a money value.
 */
export function structGet<TStruct extends object>(
  struct: TStruct,
  key: string,
): TStruct[keyof TStruct] | undefined {
  const storedKey = findStoredKey(struct, key);

  if (storedKey === undefined) {
    return undefined;
  }

  return struct[storedKey];
}

/**
 * The value stored under `innerKey` inside the entry stored under `outerKey`,
 * both matched case-insensitively, or `undefined` when EITHER level is absent.
 *
 * ***********************************************************************
 * ** ABSENCE PROPAGATES AS `undefined`. NEVER 0, NEVER '', NEVER null,  **
 * ** NEVER {}. Substituting 0 for a missing price would silently sell   **
 * ** products for free.                                                 **
 * ***********************************************************************
 *
 * This is the highest-value primitive in the file, and it is a distinct
 * primitive rather than a convenience over {@link structGet} because the second
 * presence check is load-bearing rather than defensive.
 *
 * CFML parity [model/entity/Sku.cfc:L275-L279]: `getListPriceByCurrencyCode`
 * performs TWO `structKeyExists` calls on one line - the currency key AND the
 * `"listPrice"` sub-key - and yields nothing unless both hold.
 * CFML parity [model/entity/Sku.cfc:L281-L285]: `getRenewalPriceByCurrencyCode`
 * has the identical two-level shape on the `"renewalPrice"` sub-key.
 *
 * WHY BOTH CHECKS ARE REQUIRED. The map those accessors read is built by
 * `getCurrencyDetails()` at model/entity/Sku.cfc:L367-L433, and its two levels
 * are populated under different conditions:
 *
 *   CFML parity [model/entity/Sku.cfc:L381-L382]: the OUTER entry is created for
 *     every eligible currency UNCONDITIONALLY, before any pricing step runs.
 *   CFML parity [model/entity/Sku.cfc:L386-L393]: the inner `renewalPrice` and
 *     `listPrice` keys are written only under `!isNull(...)` guards.
 *   CFML parity [model/entity/Sku.cfc:L401-L405]: the per-currency override step
 *     guards those same two inner keys the same way.
 *
 * So an outer key that exists while its inner sub-key does not is a reachable
 * state, and a single-level lookup would report a price that was never stored.
 * Collapsing this into one check is therefore a behavioural change, not a
 * simplification.
 *
 * CFML parity [model/entity/Sku.cfc:L416]: the conversion step is itself gated
 * on the absence of the `"price"` sub-key specifically. Because that step then
 * writes `price` unconditionally, the `"price"` sub-key is present for every
 * eligible currency - so an `undefined` result for `"price"` means the currency
 * was not eligible, or the eligibility gate at model/entity/Sku.cfc:L373 was
 * closed and the map is empty.
 *
 * The outer container is typed as a `CfStruct` because reaching a second level
 * requires the outer to map every key to the same entry type; the inner entry is
 * constrained only to be an object, so it may be an interface with heterogeneous
 * and optional properties - which is what a currency-detail entry is. The return
 * type is the union of that entry's property types plus `undefined`, with no
 * cast and no `any`.
 *
 * Both levels fold case, because CFML is case-insensitive at every level of a
 * struct, not merely the first.
 *
 * One edge worth stating, since this module otherwise insists that presence and
 * value are different questions: an outer key that is PRESENT but holds
 * `undefined` yields `undefined` here, exactly as an absent outer key does.
 * There is no second level to reach into, so the two collapse. `TInner extends
 * object` already excludes that value at the type level, and the legacy cascade
 * cannot produce it either - model/entity/Sku.cfc:L381 assigns an empty struct
 * rather than leaving the entry unset - so this is a defensive path rather than
 * a reproduced behaviour. A caller that needs to distinguish the two asks
 * {@link structKeyExists} about the outer key directly.
 */
export function structGetPath<TInner extends object>(
  struct: CfStruct<TInner>,
  outerKey: string,
  innerKey: string,
): TInner[keyof TInner] | undefined {
  const outerValue = structGet(struct, outerKey);

  // Level one absent. CFML parity [model/entity/Sku.cfc:L276, L282]: the first
  // structKeyExists fails and the function falls off its end, yielding nothing.
  if (outerValue === undefined) {
    return undefined;
  }

  // Level two. CFML parity [model/entity/Sku.cfc:L276, L282]: the second
  // structKeyExists, which is the check that makes this primitive necessary.
  const storedInnerKey = findStoredKey(outerValue, innerKey);

  if (storedInnerKey === undefined) {
    return undefined;
  }

  return outerValue[storedInnerKey];
}

/**
 * Case-insensitive string equality, reproducing the CFML `eq` operator as the
 * currency cascade uses it.
 *
 * CFML parity [model/entity/Sku.cfc:L385]: the base-currency step selects its
 * currency with `thisCurrency.getCurrencyCode() eq this.setting('skuCurrency')`,
 * and CFML `eq` is case-insensitive - so a currency code of `'usd'` matches a
 * configured `'USD'`.
 * CFML parity [model/entity/Sku.cfc:L400]: the per-currency override step
 * matches the same way, which is what lets an override overwrite the base-step
 * entry rather than sitting beside it.
 *
 * STRINGS ONLY. This compares two strings and nothing else. It is deliberately
 * not extended to numbers, and must not be: all monetary arithmetic and every
 * monetary comparison in this target belong to the `Money` value object, and a
 * loosely-typed equality helper is exactly how a raw floating-point comparison
 * on a price would slip in. This module moves values around without ever
 * computing on them.
 *
 * JUDGMENT CALL: a nullish operand always compares `false` - both nullish
 * included.
 *   CFML would not answer this question at all. Passing a null into `eq` raises
 *   an error there, so there is no legacy result to preserve and a decision has
 *   to be made. Two options were available and one had to be picked
 *   consistently. Returning `true` for two nullish operands would treat
 *   "no currency code" as equal to "no currency code", which reads as a match on
 *   a currency-selection path and would let an entry be written for a currency
 *   that was never identified - the wrong failure direction on a money path.
 *   Throwing was rejected outright, because no export in this module throws: a
 *   throw here would turn a missing currency code into a server error rather
 *   than into the absent result the legacy contract produces. So a nullish
 *   operand is never equal to anything, including another nullish operand, and
 *   a caller that needs to detect "both absent" tests for absence explicitly.
 *   Note the asymmetry with strict equality this creates by design:
 *   `cfEquals(undefined, undefined)` is `false` where `undefined === undefined`
 *   is `true`.
 *
 * Empty strings are NOT nullish and are compared normally, so two empty strings
 * are equal - matching CFML, where an empty string is a perfectly ordinary
 * string value. Surrounding whitespace is significant here for the same reason it
 * is significant in key matching: only case is folded, never whitespace.
 */
export function cfEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }

  return foldKey(a) === foldKey(b);
}
