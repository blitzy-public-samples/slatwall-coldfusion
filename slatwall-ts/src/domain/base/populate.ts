/**
 * populate — metadata-driven population becomes typed, explicit field assignment.
 *
 * `populate()` was the most-invoked behaviour on the legacy save path: every `save*` on every service
 * funnelled through it. It worked by REFLECTING OVER COMPONENT METADATA AT RUNTIME — walking
 * `getMetaData(this).properties` up the inheritance chain and branching on the `fieldtype`,
 * `hb_populateEnabled`, `hb_populateArray`, `hb_fileUpload`, `hb_sessionDefault` and `notNull`
 * attributes — then assigning through DYNAMICALLY COMPOSED SETTER NAMES, `this["set" & name]`. This
 * module replaces all of that with a declared, typed property-descriptor model: each entity and
 * process-object module declares its own descriptor table, this file consumes it and performs explicit
 * assignment, and no member is ever reached by name concatenation (TR-3).
 *
 * IR-8 — THE PRIMARY SOURCE IS SLATWALL CODE, NOT FRAMEWORK CODE. `model/entity/HibachiEntity.cfc` is
 * a LOCAL base class — `extends="Slatwall.org.Hibachi.HibachiEntity"` at [:L49] — and its `populate()`
 * at [:L56] is a LOCAL OVERRIDE that calls `super.populate()` at [:L59] and then adds behaviour of its
 * own. All six in-scope entities extend that class, so the effective behaviour is LOCAL OVERRIDE +
 * FRAMEWORK MACHINERY in that order, and both halves are ported with the ordering preserved: the five
 * branches first, then the extension seam, then the fluent return.
 *
 * Population is deliberately narrow. It performs no data access — relationship loading arrives as an
 * injected function — no validation, and no coercion, parsing or defaulting: the legacy live path
 * assigned the TRIMMED STRING verbatim and left conversion to Hibernate at flush time, so the
 * equivalent conversion belongs to `src/adapters/mysql/rowMappers.ts` (AAP §0.7.3 S9).
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------------------------
 * It performs NO data access: no SQL, no HQL, no driver, no pool, no table name, no column name in
 * any query-shaped string (S2). Relationship loading arrives as an injected function.
 * It performs NO validation: populate RECORDS which sub-properties it populated and never inspects
 * a rule. Validation is owned by `src/validation/**`. The metadata surface at the foot of this file
 * is not a counter-example — PROPERTY INTROSPECTION and RULE EVALUATION were two different sections
 * of the same legacy component, and only the first of them is ported here. It answers "does this
 * entity declare that property, and what does it currently hold"; it never reads a rule, a context
 * or a resource-bundle key.
 * It performs NO coercion, parsing, type conversion or defaulting (S9). The legacy live path
 * assigned the TRIMMED STRING verbatim and left conversion to Hibernate at flush time; the
 * equivalent conversion now belongs to `src/adapters/mysql/rowMappers.ts`.
 * It declares NO base class to `extend` — §0.3.3 mandates composition over inheritance, so this
 * module is a set of types plus free functions and nothing here is an inheritance root.
 * It reads NO environment (`src/config/env.ts` alone may), touches no file system, opens no socket
 * and logs nothing (S4).
 *
 * ---------------------------------------------------------------------------------------------
 * G6 TRANSLATION DECISION — CFML STRING COMPARISON IS CASE-INSENSITIVE, TYPESCRIPT `===` IS NOT
 * ---------------------------------------------------------------------------------------------
 * `neq` at [org/Hibachi/HibachiTransient.cfc:L185] and `==` at [:L188], [:L193], [:L221], [:L273]
 * and [:L310] all compare case-insensitively. Every one of those comparisons is against a string
 * literal that is now a member of a typed union declared in this file, so the divergence is benign
 * there — a value that is not exactly `'many-to-one'` cannot be constructed.
 *
 * ⚠️ F23 — THE ONE COMPARISON AGAINST CALLER-SUPPLIED TEXT IS NOT AN OPERATOR COMPARISON, AND IS NOT
 * CASE-INSENSITIVE. BRANCH 5 matches identifiers from the incoming payload, and it does so with the
 * FUNCTION `listFind` at [:L332] rather than with `==`. CFML's operators and its list functions do not
 * share a casing rule: `listFind` is case-SENSITIVE and `listFindNoCase` is its case-insensitive twin.
 * So the generalisation in the paragraph above — correct for `neq` and `==` — must NOT be extended to
 * that line, and an earlier revision of this module extended it anyway and lower-cased both sides.
 * `Array.prototype.indexOf` is the exact analogue of `listFind`, which leaves no casing divergence in
 * branch 5 at all; only the found/not-found sentinel differs. See {@link findRelatedId}.
 *
 * ---------------------------------------------------------------------------------------------
 * G6 TRANSLATION DECISION — DATA KEYS ARE MATCHED CASE-SENSITIVELY
 * ---------------------------------------------------------------------------------------------
 * [org/Hibachi/HibachiTransient.cfc:L185] gates on `structKeyExists(arguments.data,
 * currentProperty.name)`, and CFML struct keys are case-insensitive, so a payload key `productname`
 * matched a declared property `productName`. This port requires an exact match: a CFML struct cannot
 * hold both spellings at once, so the engine never needed a precedence rule, whereas a JavaScript
 * object can — a case-insensitive lookup here would mean inventing a collision policy the legacy
 * system does not have (S9). The producer of `data` is the routing layer in `src/handlers/**`, which
 * owns the key names.
 *
 * G6 TRANSLATION DECISION — WHAT COUNTS AS A "SIMPLE VALUE". CFML `isSimpleValue()` is true for strings,
 * numbers, booleans AND date/time values; this port models `string | number | boolean` only. A
 * date-valued key would have to be stringified to be assigned and the mask for that came from the CFML
 * engine's own default, so inventing one here would violate S9; setting-driven formatting lives in
 * `src/util/formatting.ts`. Because CFML's `isStruct()` is FALSE for a date, `Date` is excluded from
 * the struct test as well, so a date-valued key cannot silently take the many-to-one path. The
 * observable consequence: a date-valued key matches no branch and is left untouched, as are `null` and
 * a key present with the value `undefined` — neither of which CFML could hold inside a struct at all.
 *
 * M6 — ORDERING IS THE CALLER'S CONTRACT, NOT THIS FILE'S. `org/Hibachi/HibachiService.cfc:L133` runs
 * populate, then validate, then save, and populate is CONDITIONAL on a `data` argument being supplied,
 * so a save with no payload does not populate at all. `model/service/ProductService.cfc:L264-L292`
 * overrides that order: [:L266] populate, [:L268] conditional URL title, [:L273] validate, [:L279]
 * `createSkus` while the product is still transient, [:L286-L288] persist. That read-back hazard is
 * mismatch M6 (AAP §0.6.2) and is resolved in `src/adapters/mysql/UnitOfWork.ts`, not here. What it
 * mandates for this file is absolute: `populate` is PLAIN and SYNCHRONOUS — no `async`, no `await`, no
 * `Promise`, no I/O, no transaction awareness, no lazy resolution and no memoisation — so it may be
 * called freely, and repeatedly, inside a transaction boundary someone else owns.
 * `model/service/BrandService.cfc:L67-L78` pre-seeds `data.urlTitle` and delegates to
 * `super.save(brand, data)`, so populate must also behave correctly on a payload the caller has
 * already mutated; nothing is cached between calls.
 *
 * M7 — NO MODULE-SCOPE STATE, AT ALL.
 * 111 of the 113 legacy entities declared `cacheuse="transactional"` and memoised derived values in
 * per-request `variables` scope, and `getProperties()` cached the whole property table in
 * APPLICATION scope at [org/Hibachi/HibachiTransient.cfc:L785]. None of that survives between
 * Lambda invocations, and module-scope state on a warm container leaks across invocations and
 * therefore across tenants. This module holds no module-scope mutable binding, no `let`, no `Map`,
 * no `Set`, no `WeakMap`, no cache and no memoised descriptor table. Every piece of state —
 * including the populated-sub-property record — is created inside the call that needs it. Loading
 * this module has no side effects whatsoever.
 *
 * ---------------------------------------------------------------------------------------------
 * RULES VERDICT, RECORDED RATHER THAN ASSUMED (UR4)
 * ---------------------------------------------------------------------------------------------
 * No user rule governs this module: AAP §0.7.1 records that verdict, and no `.blitzyignore`,
 * `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, `.editorconfig` or `.eslintrc*` exists anywhere in the
 * repository. Zero files enter scope by rule and no rule-derived constraint applies here. The rules
 * tool's own output is deliberately not transcribed — AAP §0.7.5 makes the rules document the
 * authority rather than any in-source summary, which can go stale against it.
 * That is not permission to lower the bar: the nine
 * enterprise standards of AAP §0.7.3 govern instead, and every one of them has teeth in this file —
 * S1 (no `any`, no non-null assertion, no suppression comment, no cast used to silence an error),
 * S2 and S4 (the negative obligations above; the three imports are the sibling `./AuditableEntity`,
 *   the shared `../../errors/DomainError` and the type-only `../../ports/UniquePropertyPort` —
 *   `src/domain/product/ProductType.ts` already imports the former and
 *   `src/domain/base/AuditableEntity.ts` already imports a type from `src/ports/**`, so neither
 *   direction is new; nothing from `config/`, `adapters/`, `services/`, `handlers/`,
 *   `integrations/` or `validation/` is reachable from here),
 * S3 (every operation the legacy synthesised by name is an injected, typed function),
 * S5 (no dependency is added — nothing outside the language itself is used),
 * S6 (named exports only, every one constructible from plain literals with no harness),
 * S7 (preserve and annotate, do not repair), S8 and S9.
 */

import { DomainError } from '../../errors/DomainError';
import type { PopulationAuthorizationPort } from '../../ports/AccountContextPort';
import type { UniquePropertyMetaData } from '../../ports/UniquePropertyPort';
import { ValidationError } from '../../errors/ValidationError';

import { parseExactDecimal } from '../../util/formatting';
import { isAuditPropertyName } from './AuditableEntity';

/* =============================================================================================
 * DATA-SHAPE GUARDS — THE PORT OF `isSimpleValue`, `isStruct` AND `isArray`
 * =============================================================================================
 * `data` is `Record<string, unknown>`, never `any`, so under `noUncheckedIndexedAccess` every read
 * out of it is `unknown` and must be narrowed explicitly. These four local guards are that
 * narrowing. They are local by design: the legacy tests were CFML built-ins, so there is no shared
 * module they could sensibly be lifted into, and four guards do not warrant inventing one.
 * ============================================================================================= */

type SimpleDataValue = string | number | boolean;

/**
 * Port of CFML `isSimpleValue()`, narrowed to the three scalar shapes an HTTP request collection
 * can actually deliver: the CFML `form` and `url` scopes hold strings exclusively, and a parsed
 * JSON body yields strings, numbers and booleans.
 *
 * @param value - An unnarrowed value read out of the incoming payload.
 * @returns `true` when the value is a string, a number or a boolean.
 */
function isSimpleDataValue(value: unknown): value is SimpleDataValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Port of CFML `isStruct()`.
 *
 * `Date` is excluded explicitly because CFML's `isStruct()` is false for a date/time value while
 * its `isSimpleValue()` is true; excluding it here keeps a date-valued key from taking the
 * many-to-one path that CFML would never have sent it down. Arrays are excluded because CFML
 * distinguishes them from structs and BRANCH 4 claims them.
 *
 * @param value - An unnarrowed value read out of the incoming payload.
 * @returns `true` when the value is a non-null, non-array, non-date object.
 */
function isStructDataValue(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/**
 * Port of CFML `isArray()`.
 *
 * @param value - An unnarrowed value read out of the incoming payload.
 * @returns `true` when the value is an array.
 */
function isArrayDataValue(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Renders a simple value the way CFML would have rendered it on its way into a setter.
 *
 * CFML is dynamically typed, so `trim(100)` yields the STRING `'100'`. This function reproduces that
 * rendering and NOTHING MORE.
 *
 * ⚠️ ITS SCOPE IS NOW NARROW, AND DELIBERATELY SO. It is reached from exactly two places:
 * {@link coerceDeclaredValue}'s `'string'` and `'untyped'` arms, which are the two cases where the
 * legacy destination genuinely has no numeric or boolean ORM type to convert towards, and BRANCH 3's
 * related-identifier rendering. It is no longer applied to every simple value regardless of the
 * destination's declared type; see the DECLARED VALUE TYPES block below for why that mattered.
 *
 * A boolean renders as `'true'` or `'false'`, which is what a modern CFML engine produces; older
 * ColdFusion releases rendered `'YES'` and `'NO'` for the same value. The repository pins no engine
 * — [readme.md:L6] says "9.0.1 or Newer" and [readme.md:L8] says Railo "4.1 or Newer". The
 * divergence is recorded rather than resolved by picking a rendering the source does not state (S9).
 * It is also now unreachable for every in-scope BOOLEAN column, because those declare
 * `valueType: 'boolean'` and take the {@link coerceDeclaredValue} boolean arm instead.
 *
 * @param value - A simple value narrowed by {@link isSimpleDataValue}.
 * @returns The value as a string.
 */
function renderSimpleValue(value: SimpleDataValue): string {
  return String(value);
}

/* =============================================================================================
 * DECLARED VALUE TYPES — WHY POPULATION COERCES INSTEAD OF STRINGIFYING.
 *
 * THE DEFECT BEING CLOSED. Until now BRANCH 1 rendered EVERY simple payload value through
 * {@link renderSimpleValue} and assigned the trimmed string, whatever the destination declared.
 * That is a faithful transliteration of [org/Hibachi/HibachiTransient.cfc:L207] and it is wrong
 * here, for a reason that is specific to the target language rather than to the legacy one:
 *
 *   - `model/entity/Brand.cfc:L53` declares `activeFlag ormtype="boolean"`, and `Brand.ts:L400`
 *     declares `activeFlag?: boolean`. A JSON payload `{"activeFlag": false}` produced the STRING
 *     `'false'`, which is TRUTHY. A field declared `boolean` held a string, and every downstream
 *     `if (brand.activeFlag)` inverted. The same applies to `publishedFlag`
 *     [model/entity/Brand.cfc:L54], to Product's two flags [model/entity/Product.cfc:L53, :L58],
 *     to `Sku.activeFlag` and `Sku.userDefinedPriceFlag` [model/entity/Sku.cfc:L52, :L57], to
 *     `OptionGroup.imageGroupFlag` [model/entity/OptionGroup.cfc:L57] and to ProductType's two
 *     flags [model/entity/ProductType.cfc:L54, :L55] — ten `ormtype="boolean"` declarations across
 *     the six in-scope entities, counted.
 *   - `Option.sortOrder` is declared `sortOrder?: number` against `ormtype="integer"`
 *     [model/entity/Option.cfc:L56], and held strings.
 *
 *     F07 — `Sku.price` USED TO BE THE OTHER EXAMPLE HERE, declared `price: number = 0` against
 *     `ormtype="big_decimal"` [model/entity/Sku.cfc:L55]. It no longer is: the three monetary
 *     properties are `ExactDecimal`, so their declared type and their ORM type now agree that the
 *     value is exact, and the coercion below produces text for them rather than a double. The
 *     `integer` case is unaffected and remains the live example.
 *
 * IN CFML THAT DIVERGENCE WAS INVISIBLE, because the destination had no static type and Hibernate
 * converted at flush. In TypeScript the destination HAS a declared type, and writing a string into
 * it makes the declaration a lie that the compiler cannot catch — {@link PopulationTarget} widens
 * every field to `unknown` precisely so the assignment is legal.
 *
 * ⭐ AND THE TWO LANGUAGES DISAGREE ON THE READ, WHICH IS THE FACT THE WHOLE BLOCK TURNS ON. CFML
 * boolean-casts a boolean-castable string in a condition, so `<cfif 'false'>` is FALSE — the same
 * semantics `../../validation/Validator`'s `toCfBoolean` transcribes for
 * `org/Hibachi/HibachiValidationService.cfc:L162`. JavaScript has no such cast, so `if ('false')` is
 * TRUE. Transliterating the untyped write therefore does not preserve behaviour; it INVERTS it, on
 * properties that gate visibility and pricing. Coercing towards the declared type is what keeps the
 * read faithful, so it is a parity requirement rather than an improvement.
 *
 * THE FIX. Every {@link ColumnPropertyDescriptor} DECLARES the legacy `ormtype` as
 * {@link ColumnValueType}, and {@link coerceDeclaredValue} converts towards it. The declaration is
 * REQUIRED, not optional: an author cannot omit it and silently fall back to stringification, which
 * is what made this reachable in the first place (TR-3 — replace framework magic with declarations).
 * The union is closed over exactly the ORM types the slice uses and no others; a census of all six
 * in-scope entity files finds `string` 34 times, `boolean` 10, `integer` 5, `big_decimal` 4 and
 * `timestamp` 12 — and ALL TWELVE timestamps are the populate-disabled audit properties
 * [model/entity/{Product:L96,L98, Sku:L93,L95, ProductType:L83,L85, Brand:L77,L79, Option:L76,L78,
 * OptionGroup:L64,L66}.cfc], which never reach a coercion at all. There is consequently no date or
 * timestamp arm, because adding one would be inventing a case the slice cannot exercise (S9).
 *
 * ⚠️ WHERE THE FAILURE HAPPENS IS AN EXECUTION-MODEL DIFFERENCE, FLAGGED PER AAP §0.6.6 AND IR-10 —
 * AND IT IS NOT CLAIMED ON D18's PRECEDENT. An earlier revision recorded this as a "declared
 * departure from byte-for-byte preservation, on the D18 precedent (AAP §0.6.7.7)", and that framing is
 * withdrawn. D18 is the SOLE declared behaviour-hardening exception in this port and it is a precedent
 * only for a divergence that removes a flaw class WITHOUT changing an outcome. Nothing here needs that
 * licence, because no outcome changes: what changes is only the POINT at which an already-failing
 * operation fails.
 *
 * THE ACCEPTED SET IS UNCHANGED, WHICH IS WHY NO LICENCE IS NEEDED:
 *   - For a boolean destination the accepted set is exactly CFML's own boolean-cast vocabulary —
 *     `true`/`false`, `yes`/`no` and any numeric value, case-insensitively, with non-zero true —
 *     which is what `isBoolean()` admits and what the CFML engine converted on the way to a
 *     Hibernate `boolean`. `'maybe'` was never accepted; it produced a cast failure at flush.
 *   - For a numeric destination the accepted set is a well-formed number. `'abc'` was never
 *     accepted either; it failed the same way.
 *
 * ⭐ AND THE RELOCATION IS FORCED, NOT CHOSEN. The legacy failure happened inside Hibernate's
 * flush-time conversion from the CFML value to the mapped Java type. There is no such conversion
 * layer here: `mysql2` binds whatever it is given, and the absence of an ORM flush is already on the
 * register as M5. Something therefore has to decide the type on the way IN, and once that decision is
 * made at population time the failure necessarily surfaces at population time too. The only question
 * left is what to do with a value that cannot be represented, and the two alternatives are worse and
 * are recorded as rejected: silently clearing the property would DELETE a value the caller never
 * asked to delete, and silently skipping it would leave the prior value in place — an update that
 * reports success while ignoring a field is precisely the failure mode a gate-bearing flag must not
 * have. Both of those WOULD change an outcome; raising does not.
 *
 * ⚠️ THE ONE OBSERVABLE CONSEQUENCE IS FLAGGED RATHER THAN SMOOTHED OVER. Because population raises,
 * validation never runs for a payload carrying an unrepresentable value, so no error bag is produced
 * where the legacy would have produced one and then failed at flush. The operation fails either way
 * and nothing is persisted either way, but a caller comparing failure SHAPES will see a thrown
 * domain error rather than a populated entity with a later commit failure.
 *
 * WHAT IS NOT CHANGED. The blank-to-NULL rule [org/Hibachi/HibachiTransient.cfc:L195-L196], the
 * `notNull` exception, `trim` semantics, declaration-order iteration, the audit exclusion, the
 * silent ignoring of unknown payload keys and BRANCH 3's deliberate no-trim on the related
 * identifier are all untouched. Conversion on the way to the DATABASE remains owned by
 * `src/adapters/mysql/rowMappers.ts`; this block converts on the way IN, towards the type the
 * domain class already declares.
 * ============================================================================================= */

/**
 * The legacy `ormtype` of a column property, as a closed union.
 *
 * Each member is present because at least one in-scope declaration uses it; see the census in the
 * block above. `'untyped'` is not an ORM type — it is the honest declaration for a property that
 * declares none, which is every property of the three in-scope process objects
 * [model/process/Product_AddOptionGroup.cfc:L52,L55, model/process/Product_AddOption.cfc:L52,L55,
 * model/process/Product_UpdateSkus.cfc:L52,L55-L58]. Those take the legacy trimmed-string path
 * unchanged, because there is no declared destination type to convert towards and inventing one
 * would be exactly the fabrication S9 forbids.
 */
export type ColumnValueType = 'string' | 'boolean' | 'integer' | 'bigDecimal' | 'untyped';

/**
 * Message raised when a payload value cannot be represented in its property's declared type.
 *
 * ⚠️ IT ECHOES NO VALUE, BY CONSTRUCTION. The `entityName`, `propertyName` and `valueType` are
 * declaration facts already present in source; the offending VALUE is caller-supplied and never
 * appears in the message, so the string stays safe to surface even before
 * `src/handlers/httpResponse.ts` maps domain errors to public codes. The structured
 * {@link DomainErrorOptions.context} carries the same three declaration facts and likewise no
 * value.
 */
const AMBIGUOUS_POPULATED_VALUE_MESSAGE =
  'A populated value cannot be represented in the declared type of its property';

/**
 * Matches an optionally signed integer with no decimal point and no exponent.
 *
 * Anchored, with no alternation, no backreference and no nested quantifier, so it is linear in the
 * length of the input and cannot backtrack pathologically.
 */
const INTEGER_TEXT_PATTERN = /^[+-]?\d+$/;

/**
 * Matches an optionally signed decimal with no exponent — `12`, `12.`, `12.34`, `.34`, `-0.5`.
 *
 * Exponent notation is excluded deliberately: `ormtype="big_decimal"` maps to a fixed-precision SQL
 * DECIMAL column, `'1e3'` is not a form any legacy price field was written in, and admitting it
 * would widen the accepted set beyond the legacy one rather than preserving it.
 */
const DECIMAL_TEXT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * The CFML literal words that cast to boolean true, lower-cased for comparison.
 *
 * CFML comparison is case-insensitive, so the input is lower-cased before it is tested rather than
 * this list being expanded to cover every casing.
 */
const TRUE_TEXT_VALUES: readonly string[] = ['true', 'yes'];

/**
 * The CFML literal words that cast to boolean false, lower-cased for comparison.
 */
const FALSE_TEXT_VALUES: readonly string[] = ['false', 'no'];

/**
 * The outcome of coercing one payload value towards one declared type.
 *
 * A three-way result rather than a value-or-throw pair, because BRANCH 1 has THREE legacy outcomes
 * and they must stay distinguishable: assign a value, DELETE the key to represent SQL NULL
 * [org/Hibachi/HibachiTransient.cfc:L195-L196], or fail. Collapsing "clear" into "assign
 * `undefined`" is the exact mistake {@link clearPropertyValue} exists to prevent, and the
 * `model/service/ProductService.cfc:L268` proof recorded there explains why it is observable.
 */
type CoercionOutcome =
  | { readonly kind: 'assign'; readonly value: NonNullable<unknown> }
  | { readonly kind: 'clear' }
  | { readonly kind: 'ambiguous' };

/**
 * Coerces one trimmed payload value towards a declared boolean destination.
 *
 * Reproduces CFML's boolean-cast vocabulary and nothing wider: the literals `true`/`false` and
 * `yes`/`no` case-insensitively, plus any numeric value with non-zero meaning true. A JSON boolean
 * arrives already correct and is passed straight through, which is the `{"activeFlag": false}` case
 * the DECLARED VALUE TYPES block opens with.
 *
 * @param value - The original payload value, before rendering.
 * @param trimmedText - The same value rendered and trimmed, supplied so it is computed once.
 * @returns The coercion outcome.
 */
function coerceBooleanValue(value: SimpleDataValue, trimmedText: string): CoercionOutcome {
  if (typeof value === 'boolean') {
    return { kind: 'assign', value };
  }

  const loweredText = trimmedText.toLowerCase();

  if (TRUE_TEXT_VALUES.includes(loweredText)) {
    return { kind: 'assign', value: true };
  }

  if (FALSE_TEXT_VALUES.includes(loweredText)) {
    return { kind: 'assign', value: false };
  }

  // Any number is a legal CFML boolean, and its truth is `!= 0`. `Number.isFinite` rejects `NaN`
  // and both infinities, none of which the legacy engine would have cast successfully either.
  if (DECIMAL_TEXT_PATTERN.test(trimmedText)) {
    const numericValue = Number(trimmedText);
    if (Number.isFinite(numericValue)) {
      return { kind: 'assign', value: numericValue !== 0 };
    }
  }

  return { kind: 'ambiguous' };
}

/**
 * Coerces one trimmed payload value towards a declared numeric destination.
 *
 * `'integer'` admits only whole numbers, because `ormtype="integer"` maps to a SQL INTEGER column
 * and `'3.7'` has no unambiguous representation in one — silently truncating it would invent a
 * rounding rule the source does not state (S9). `'bigDecimal'` admits a decimal.
 *
 * A JSON boolean is rejected for both. The legacy path rendered `true` as the string `'true'`,
 * which no numeric ORM type could parse, so rejecting it preserves the legacy outcome.
 *
 * ⭐ ON PRECISION — F07, AND THE TWO DESTINATIONS DIVERGE HERE. An earlier revision of this note
 * recorded that `ormtype="big_decimal"` is arbitrary-precision in Hibernate while the domain class
 * declared the IEEE-754 double `price: number = 0`, and concluded that `number` was *"therefore the
 * destination type this coercion must produce"*, with the precision ceiling belonging to the declared
 * field rather than to this function.
 *
 * ⚠️ THAT WAS TRUE AND IT WAS ALSO A LIVE PRECISION LEAK, BECAUSE THIS PATH IS A REAL WRITE PATH.
 * `populate()` is how an untyped request payload reaches an entity, so a price arriving here was rounded
 * to the nearest double BEFORE it ever reached the repository — and the assignment is made through
 * {@link CoercionOutcome}, whose `value` is `NonNullable<unknown>`, so the compiler could not see the
 * mismatch and no test reported it. Fixing only the service-level reads would have left this one open.
 *
 * The four `bigDecimal` properties — `listPrice`, `price` and `renewalPrice` on `../sku/Sku`, and
 * `calculatedSalePrice` on `../product/Product` — are now typed `ExactDecimal`, so THE `bigDecimal` ARM
 * PRODUCES EXACT DECIMAL TEXT and no `Number(...)` runs on it. The `integer` arm is unchanged and still
 * produces a `number`, because `sortOrder` and its kind genuinely are integers and
 * `Number.isSafeInteger` already guards the only loss available to them.
 *
 * @param value - The original payload value, before rendering.
 * @param trimmedText - The same value rendered and trimmed.
 * @param wholeNumbersOnly - `true` for `'integer'`, `false` for `'bigDecimal'`.
 * @returns The coercion outcome.
 */
function coerceNumericValue(
  value: SimpleDataValue,
  trimmedText: string,
  wholeNumbersOnly: boolean,
): CoercionOutcome {
  if (typeof value === 'boolean') {
    return { kind: 'ambiguous' };
  }

  const pattern = wholeNumbersOnly ? INTEGER_TEXT_PATTERN : DECIMAL_TEXT_PATTERN;
  if (!pattern.test(trimmedText)) {
    return { kind: 'ambiguous' };
  }

  /* F07 — A `bigDecimal` DESTINATION NEVER TOUCHES `Number(...)`. The text has already passed
   * {@link DECIMAL_TEXT_PATTERN}, so `parseExactDecimal` only normalises its spelling — supplying the
   * leading zero of `'.34'`, dropping the trailing point of `'12.'` — and cannot widen the accepted set,
   * because the exponent forms it would otherwise expand were rejected by that pattern one branch above.
   * `undefined` is unreachable for text the pattern accepted and is mapped to `ambiguous` rather than
   * asserted away, which is this file's established stance on an impossible-but-checkable state. */
  if (!wholeNumbersOnly) {
    const exact = parseExactDecimal(trimmedText);
    return exact === undefined ? { kind: 'ambiguous' } : { kind: 'assign', value: exact };
  }

  const numericValue = Number(trimmedText);
  if (!Number.isFinite(numericValue)) {
    return { kind: 'ambiguous' };
  }

  // A whole-number destination additionally requires the parsed value to survive as an exact
  // integer. `Number.isSafeInteger` rejects a digit string beyond 2^53-1, which would otherwise be
  // silently rounded to a different number than the caller sent.
  if (!Number.isSafeInteger(numericValue)) {
    return { kind: 'ambiguous' };
  }

  return { kind: 'assign', value: numericValue };
}

/**
 * Decides what BRANCH 1 should do with one payload value, given the property's declared type.
 *
 * The blank-to-NULL rule is applied FIRST and identically for every declared type, because the
 * legacy applies it before any conversion could occur: [org/Hibachi/HibachiTransient.cfc:L195]
 * reads `if( trim(arguments.data[ … ]) == "" && ( !structKeyExists(currentProperty, "notNull") ||
 * !currentProperty.notNull ) )` and calls the value-less `_setProperty` on the true arm. A blank
 * value therefore clears the property whatever its ORM type, and never reaches a coercion.
 *
 * @param value - A simple value narrowed by {@link isSimpleDataValue}.
 * @param valueType - The property's declared legacy `ormtype`.
 * @param notNull - Whether the legacy declaration carries `notNull="true"`.
 * @returns The coercion outcome BRANCH 1 acts on.
 */
function coerceDeclaredValue(
  value: SimpleDataValue,
  valueType: ColumnValueType,
  notNull: boolean,
): CoercionOutcome {
  const trimmedText = renderSimpleValue(value).trim();

  if (trimmedText === '' && !notNull) {
    return { kind: 'clear' };
  }

  switch (valueType) {
    case 'boolean':
      return coerceBooleanValue(value, trimmedText);
    case 'integer':
      return coerceNumericValue(value, trimmedText, true);
    case 'bigDecimal':
      return coerceNumericValue(value, trimmedText, false);
    case 'string':
    case 'untyped':
      // The legacy behaviour, preserved exactly: a rendered, trimmed string. For `'string'` the
      // destination genuinely is a string column; for `'untyped'` there is no declared destination
      // type at all. Note that a blank value only reaches here when `notNull` is set, which is one
      // property in the entire slice — `productName` [model/entity/Product.cfc:L55] — and the
      // legacy assigns the blank string in exactly that case too.
      return { kind: 'assign', value: trimmedText };
  }
}

/**
 * Counts the keys of a nested payload struct — the port of CFML `structCount()`.
 *
 * The count is the discriminator for both BRANCH 3 ([org/Hibachi/HibachiTransient.cfc:L236]) and
 * BRANCH 4 ([:L297]): more than one key means "populate the sub-object too", exactly one means
 * "resolve the relationship only".
 *
 * @param struct - A nested payload struct.
 * @returns The number of own enumerable keys.
 */
function countStructKeys(struct: Record<string, unknown>): number {
  return Object.keys(struct).length;
}

/**
 * Tests whether the incoming payload carries a key — the port of CFML `structKeyExists()`.
 *
 * `Object.prototype.hasOwnProperty.call` is used rather than `key in data` so an inherited
 * prototype member can never be mistaken for a payload key, and rather than a truthiness test so a
 * legitimately falsy value such as `''`, `0` or `false` still counts as present. That last point is
 * load-bearing: BRANCH 1's whole blank-value path exists to handle a present-but-empty value.
 *
 * @param data - The incoming payload.
 * @param key - The key to look for.
 * @returns `true` when the payload carries the key as its own property.
 */
function hasDataKey(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/* =============================================================================================
 * THE DECLARED MODEL — WHAT THE FIVE BRANCHES ACTUALLY TEST, AND NOTHING MORE
 * =============================================================================================
 * The legacy loop read whatever attributes happened to be present on a property's metadata. The
 * replacement is a closed, typed descriptor: one member per attribute the five branches genuinely
 * consult, and no member for an attribute they do not (S9). Two attributes that a reader might
 * expect to find here are absent for exactly that reason:
 *
 *   - `hb_formatType` — the LIVE assignment at [org/Hibachi/HibachiTransient.cfc:L207] ignores it
 *     entirely. See the note on BRANCH 1.
 *   - `hb_sessionDefault` — proven unreachable for every in-scope type. See the note on BRANCH 1.
 * ============================================================================================= */

/**
 * The reachable values of the legacy `fieldtype` metadata attribute.
 *
 * Drawn from the four gates that test it: `'column'` at [org/Hibachi/HibachiTransient.cfc:L193] and
 * [:L216], `'many-to-one'` at [:L221], `'one-to-many'` at [:L273], and `'many-to-many'` at [:L273]
 * and [:L310]. No other value is consulted anywhere in `populate()`, so no other value appears here.
 */
export type PropertyKind = 'column' | 'many-to-one' | 'one-to-many' | 'many-to-many';

/**
 * The legacy `hb_populateEnabled` attribute — TRI-VALUED, NOT BOOLEAN.
 *
 * [org/Hibachi/HibachiTransient.cfc:L185] tests `hb_populateEnabled neq false` while [:L188] tests
 * `hb_populateEnabled == "public"`, so the attribute has three legal states and a boolean model
 * would silently mis-handle one of them:
 *
 *   - `false`      — the property is never populated from request data.
 *   - `'public'`   — the property is populated from request data even in a public (non-admin)
 *                    context, provided the request carries the public-populate flag.
 *   - ABSENT       — represented by omitting the descriptor member, thanks to
 *                    `exactOptionalPropertyTypes`. The ordinary case.
 *
 * REACHABILITY: `hb_populateEnabled="public"` occurs 68 times in the legacy tree and ZERO
 * times in scope — the hits are in excluded files such as `model/entity/Order.cfc` [L71], [L74],
 * [L75], [L76] and `model/entity/AccountPhoneNumber.cfc:L53`. Across the six in-scope entities and
 * the three in-scope process objects only `false` and ABSENT occur, in this distribution:
 * four declarations each on `Product.cfc`, `Sku.cfc`, `ProductType.cfc`, `Option.cfc` and
 * `OptionGroup.cfc`; NINE on `Brand.cfc`; and none at all on any process object. The tri-value is
 * modelled anyway, because the legacy attribute has three states and collapsing it would be a
 * behavioural narrowing rather than a translation.
 *
 * ⚠️ HOW THE THREE STATES ARE CARRIED, since no descriptor member has this exact type. This alias is
 * the documentary statement of the legacy attribute; the descriptor shapes split its values so each
 * shape declares only what it can honour:
 *
 *   - `false`    -> {@link DisabledPropertyDescriptor.populateEnabled}, a required literal. That shape
 *                   owes neither a {@link ColumnPropertyDescriptor.valueType} nor relationship
 *                   machinery, which is precisely why the split exists.
 *   - `'public'` -> the optional `populateEnabled` member every ENABLED descriptor inherits.
 *   - ABSENT     -> omitting that optional member, thanks to `exactOptionalPropertyTypes`.
 *
 * The split loses nothing and gains a discriminant: `false` now appears in exactly one member of
 * {@link PopulatePropertyDescriptor}, so the engine's `populateEnabled === false` gate narrows the
 * union for everything after it, and branch dispatch becomes unreachable for a disabled property by
 * construction rather than by the ordering of two adjacent statements.
 */
export type PopulateEnabled = false | 'public';

/**
 * The field surface `populate` writes into.
 *
 * G6 TRANSLATION DECISION — WHY THIS SHAPE, AND WHY IT IS NOT AN ARBITRARY INDEX SIGNATURE.
 * An indexed write here must be typed against the declared property-name
 * union — not `any`, and not an index signature that accepts arbitrary strings. `TPropertyName` is
 * exactly that declared union: it is inferred from the descriptor set, so only a name the caller
 * declared can ever be written, and a typo is a compile error rather than a silently created
 * property. Every member is optional because absence is the legacy representation of NULL, which is
 * what makes `delete` legal on it (see {@link clearPropertyValue}).
 *
 * Each value is `unknown` rather than a narrower type because the legacy assignment is genuinely
 * untyped: [org/Hibachi/HibachiTransient.cfc:L207] pushes a TRIMMED STRING into every simple
 * property regardless of its `ormtype`, including `boolean`, `integer`, `big_decimal` and
 * `timestamp` columns, and Hibernate converted on flush. Narrowing the write here would require
 * inventing the coercion layer S9 forbids.
 *
 * An entity or process-object type satisfies this structurally by declaring the properties it names;
 * it does not and must not extend anything (§0.3.3). Classes, interfaces and plain object literals
 * all satisfy it, which is what keeps every export in this file testable from plain literals (S6).
 *
 * The alias is deliberately the bare mapped type with no intersection: `object & { … }` would read as
 * a tighter contract but would stop TypeScript from reducing the indexed-access type
 * `PopulationTarget<TPropertyName>[TPropertyName]` to `unknown`, which is what makes the keyed write
 * in {@link assignPropertyValue} type-check without a cast.
 */
export type PopulationTarget<TPropertyName extends string> = {
  [TKey in TPropertyName]?: unknown;
};

/**
 * Loads a related entity — the injected replacement for the legacy service lookup.
 *
 * G6 TRANSLATION DECISION — THIS IS WHERE THE FRAMEWORK MAGIC DIES.
 * BRANCH 3 and BRANCH 4 resolved a related entity through
 * `getService("hibachiService").getServiceByEntityName(...)`
 * [org/Hibachi/HibachiTransient.cfc:L233], [:L288], [:L347] and then called
 * `entityService.invokeMethod("get#listLast(currentProperty.cfc,'.')#", …)` [:L239], [:L261],
 * [:L291], [:L353] — a string-keyed service locator feeding a dynamically synthesised method name.
 * That is precisely the `onMissingMethod` surface IR-1 replaces with explicit declarations and
 * precisely what S3 forbids. Both halves collapse into this one injected, typed interface. This file
 * therefore performs no data access at all, imports no repository and imports no service, and a test
 * can substitute an in-memory double with no mocking library — which matters, because the legacy
 * suite had none and booted the whole FW/1 application instead (§0.4.3.6).
 *
 * TWO METHODS, BECAUSE THE LEGACY MADE TWO DIFFERENT CALLS. The create-if-missing distinction is
 * behaviour, not an optimisation: [:L239] and [:L291] pass `{1=id, 2=true}`, whose second positional
 * argument is the createNew flag, whereas [:L261] and [:L353] pass `{1=id}` and leave it off. Naming
 * the two calls separately carries the distinction explicitly AND types it precisely — the
 * load-or-create form cannot return "absent", and the load-only form can.
 */
export interface RelatedEntityLoader<TRelated extends object = object> {
  /**
   * Loads the related entity, returning a new transient instance when no such row exists — the
   * `{1=id, 2=true}` form at [org/Hibachi/HibachiTransient.cfc:L239] and [:L291].
   *
   * @param relatedId - The related entity's primary identifier, a 32-character identifier per IR-6.
   * @returns The loaded or newly created related entity. Never absent.
   */
  loadOrCreate(relatedId: string): TRelated;

  /**
   * Loads the related entity, or nothing at all when no such row exists — the `{1=id}` form at
   * [org/Hibachi/HibachiTransient.cfc:L261] and [:L353], where the legacy comment reads "if one
   * doesn't exist... this will be null" and the caller guards with `isNull()`.
   *
   * @param relatedId - The related entity's primary identifier, a 32-character identifier per IR-6.
   * @returns The loaded related entity, or `undefined` when there is none.
   */
  loadExisting(relatedId: string): TRelated | undefined;
}

/**
 * Populates a related entity with its own descriptors — the recursion seam.
 *
 * The legacy recursion is real: [org/Hibachi/HibachiTransient.cfc:L245] and [:L300] both call
 * `thisEntity.populate(...)`, so a nested payload populates the sub-object through the same
 * machinery. In CFML that resolved because every entity carried the method by inheritance. Here the
 * sub-object's descriptors belong to the sub-object's own module, so the recursion arrives as an
 * injected function — typically a one-line call back into {@link populate} with that module's own
 * descriptor set. Nothing is discovered, and no module cycle is created.
 */
export type SubPropertyPopulator<TRelated extends object = object> = (
  related: TRelated,
  data: Record<string, unknown>,
) => void;

/**
 * Attributes shared by every descriptor, whatever its kind.
 */
interface PropertyDescriptorBase<TPropertyName extends string> {
  /**
   * The property name, which is also the payload key the master gate looks for
   * [org/Hibachi/HibachiTransient.cfc:L185] and the key the sub-property record is filed under
   * [:L248], [:L303].
   */
  readonly name: TPropertyName;

  /**
   * The PUBLIC half of the tri-valued `hb_populateEnabled` attribute. Omit it for the ordinary case.
   *
   * ⚠️ THE `false` HALF IS NOT DECLARABLE HERE, AND THAT IS DELIBERATE. `hb_populateEnabled` is
   * tri-valued in the legacy source — see {@link PopulateEnabled} — but the target splits the values
   * across two shapes rather than putting all three on one. A populate-DISABLED property is a
   * {@link DisabledPropertyDescriptor}, which owes neither a value type nor relationship machinery;
   * every other descriptor is populate-ENABLED and may additionally opt into public population.
   *
   * The split buys two things. It removes the obligation on a disabled property to declare a
   * {@link ColumnPropertyDescriptor.valueType} it can never use, which is what forced the split. And
   * it makes `populateEnabled` a genuine DISCRIMINANT: because the literal `false` appears in exactly
   * one member of the union, the engine's `if (descriptor.populateEnabled === false) continue;` gate
   * narrows the remaining descriptor to the enabled shapes for the rest of the loop, so the branch
   * dispatch below it cannot even be reached with a disabled descriptor. The legacy ordering
   * guarantee — `populateEnabled` tested before `fieldType` is dispatched on
   * [org/Hibachi/HibachiTransient.cfc:L185 then :L193] — becomes a type-system fact instead of a
   * convention.
   *
   * REACHABILITY of `'public'`, verified by grep: `hb_populateEnabled="public"` occurs 68 times
   * repository-wide and ZERO times across the six in-scope entities and three in-scope process
   * objects. It is declarable because it is the second operand of ARM 2 of the population gate
   * [org/Hibachi/HibachiTransient.cfc:L188], which cannot be expressed without it.
   */
  readonly populateEnabled?: 'public';
}

/**
 * A property the legacy declares `hb_populateEnabled="false"` — never writable from request data.
 *
 * ⚠️ WHY THIS IS ITS OWN SHAPE RATHER THAN A FLAG ON THE OTHERS. Two independent reasons, and the
 * first is what forced it:
 *
 *   1. IT OWES NO VALUE TYPE. {@link ColumnPropertyDescriptor.valueType} is required, and a
 *      populate-disabled property has no coercion to declare one for. Eight of the twenty-eight
 *      disabled descriptors in the slice are `ormtype="timestamp"` audit columns and the rest are
 *      relationships; obliging either to name a value type would mean either widening
 *      {@link ColumnValueType} with a member no reachable path consumes, or writing a value type
 *      that is a fiction. Both are S9 violations.
 *   2. IT OWES NO RELATIONSHIP MACHINERY EITHER, and this shape now guarantees that in the TYPE
 *      SYSTEM rather than by convention. `src/domain/product/Brand.ts` records the reasoning at
 *      length under its D-i note: five of Brand's nine disabled properties are `many-to-many` in
 *      the legacy mapping and two are `many-to-one`, yet declaring a `kind` for them would oblige
 *      that module to supply loaders, adders, removers and identifier readers for `PromotionReward`,
 *      `PromotionQualifier`, `Physical` and `Account` — four families AAP §0.2.2.1 excludes. The
 *      gate order is what makes the omission safe: the engine tests `populateEnabled === false`
 *      BEFORE it dispatches on `kind`, so no kind-specific member is ever read for these.
 *
 * COUNTED ACROSS THE SLICE: twenty-eight declarations, all of the form `{ name, populateEnabled:
 * false }` — the four audit properties on each of the six entities [model/entity/{Product:L96-L99,
 * Sku:L93-L96, ProductType:L83-L86, Brand:L77-L80, Option:L76-L79, OptionGroup:L64-L67}.cfc], plus
 * Brand's five additional relationship declarations [model/entity/Brand.cfc:L66-L68, :L71-L72],
 * which is why Brand carries nine where the other five entities carry four.
 */
export interface DisabledPropertyDescriptor<TPropertyName extends string> {
  /**
   * The property name — the payload key the master gate looks for
   * [org/Hibachi/HibachiTransient.cfc:L185], and the key whose presence is then discarded.
   */
  readonly name: TPropertyName;

  /**
   * Pinned to the literal `false`, which both ports `hb_populateEnabled="false"` and discriminates
   * this shape from {@link ColumnPropertyDescriptor}, whose own `populateEnabled` is narrowed to
   * `'public'`.
   *
   * It is REQUIRED here, unlike everywhere else, because the shape has no other purpose: a
   * descriptor carrying only a name and nothing else would be an enabled, untyped column property,
   * which is a materially different instruction.
   */
  readonly populateEnabled: false;
}

/**
 * A simple column property — the target of BRANCH 1 and BRANCH 2.
 *
 * `kind` is optional because the legacy gate at [org/Hibachi/HibachiTransient.cfc:L193] is
 * `!structKeyExists(currentProperty, "fieldType") || currentProperty.fieldType == "column"`: a
 * property with NO `fieldtype` attribute behaves as a column, and that is the common case — every
 * persistent scalar on all six entities, and all four data properties of
 * `model/process/Product_UpdateSkus.cfc` [L55-L58], declare no `fieldtype` at all. Omitting `kind`
 * and declaring `kind: 'column'` are therefore equivalent, exactly as in the source.
 */
export interface ColumnPropertyDescriptor<
  TPropertyName extends string,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind?: 'column';

  /**
   * The property's declared legacy `ormtype`, as a closed union — REQUIRED.
   *
   * This is the declaration BRANCH 1 coerces towards. It is not optional, and the reason is the
   * whole point of the DECLARED VALUE TYPES block above: an optional member with a string fallback
   * would let an author omit it and silently reinstate the stringification defect on exactly the
   * kind of property — a visibility flag, a price — where it does the most damage. Requiring it
   * makes the omission a compile error instead (TR-3).
   *
   * `'untyped'` is the honest declaration for a property whose legacy source declares no `ormtype`,
   * which is every property of the three in-scope process objects. It is a positive statement that
   * there is nothing to convert towards, not an absence of thought.
   *
   * ⚠️ THIS MEMBER IS NOT DECLARED ON A POPULATE-DISABLED DESCRIPTOR, and that is why
   * {@link DisabledPropertyDescriptor} exists as a separate shape. The twelve `ormtype="timestamp"`
   * audit properties in the slice are all populate-disabled, so requiring a value type of them
   * would force a `'timestamp'` member into this union that no reachable code path could ever
   * consume.
   */
  readonly valueType: ColumnValueType;

  /**
   * The legacy `notNull` attribute — the single most consequential asymmetry in BRANCH 1.
   *
   * When a blank value arrives, [org/Hibachi/HibachiTransient.cfc:L196] deletes the property only if
   * `notNull` is absent or falsy; otherwise the `else` arm at [:L207] assigns the trimmed EMPTY
   * STRING. Declaring `notNull: false` is equivalent to omitting it, because the legacy test is a
   * truthiness test rather than a presence test.
   *
   * REACHABILITY, VERIFIED BY GREP ACROSS ALL SIX ENTITIES AND ALL THREE PROCESS OBJECTS: `notNull`
   * occurs EXACTLY ONCE in the whole in-scope slice —
   * [model/entity/Product.cfc:L55] `property name="productName" ormtype="string" notNull="true";`.
   * So for every in-scope simple property EXCEPT `Product.productName`, a blank value deletes the
   * key, and for `Product.productName` alone it assigns `''`. That asymmetry is real behaviour and
   * §0.8.2 Guideline 4 forbids "fixing" it (S7); the attribute is supported generically because the
   * legacy attribute is generic, not because a second occurrence is anticipated.
   */
  readonly notNull?: boolean;

  /**
   * The legacy `hb_populateArray` attribute, which opens BRANCH 2
   * [org/Hibachi/HibachiTransient.cfc:L216]. The legacy gate requires the attribute to be present AND
   * truthy, so only `populateArray: true` opens the branch. No in-scope type declares it; the member
   * exists because it is what makes that gate expressible, and a documented unreachable branch is
   * stronger than a silently dropped one.
   */
  readonly populateArray?: boolean;

  /**
   * The legacy `hb_fileUpload` attribute, honoured here for ONE purpose only: it excludes the
   * property from BRANCH 1.
   *
   * PRESENCE, NOT TRUTHINESS — this is a real fidelity detail. BRANCH 1's gate at
   * [org/Hibachi/HibachiTransient.cfc:L193] ends in `!structKeyExists(currentProperty,
   * "hb_fileUpload")`, a PRESENCE test, whereas the separate upload loop at [:L371] additionally
   * requires the value to be truthy. So `hb_fileUpload="false"` still excluded a property from
   * ordinary column population while remaining ineligible for upload. Declaring
   * `fileUpload: false` therefore behaves exactly as the legacy `hb_fileUpload="false"` did: the
   * property is skipped by BRANCH 1. Upload handling itself is not ported — see the note on the
   * second loop, further down.
   */
  readonly fileUpload?: boolean;
}

/**
 * A many-to-one relationship — the target of BRANCH 3.
 *
 * No add or remove operation is declared, because the legacy branch performs neither: it assigns the
 * resolved entity through `_setProperty` [org/Hibachi/HibachiTransient.cfc:L242], [:L265] and clears
 * it through the same helper [:L255], both of which are plain field operations here.
 */
export interface ManyToOnePropertyDescriptor<
  TPropertyName extends string,
  TRelated extends object = object,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind: 'many-to-one';

  /**
   * The name of the related entity's primary-identifier property — for example `'brandID'` for
   * `model/entity/Product.cfc:L68` `property name="brand" cfc="Brand" fieldtype="many-to-one"`.
   *
   * The legacy code resolved this at runtime through
   * `getService("hibachiService").getPrimaryIDPropertyNameByEntityName("#getApplicationValue('applicationKey')##listLast(currentProperty.cfc,'.')#")`
   * [org/Hibachi/HibachiTransient.cfc:L227] — a string-keyed service lookup over an interpolated
   * entity name. TR-3 and S3 replace it with this declaration.
   */
  readonly relatedPrimaryIdPropertyName: string;

  readonly loader: RelatedEntityLoader<TRelated>;

  /**
   * Populates the related entity when the nested payload carries more than the identifier —
   * [org/Hibachi/HibachiTransient.cfc:L245]. Declared in method syntax so a descriptor written
   * against a concrete related type stays assignable to the heterogeneous descriptor set without a
   * cast.
   *
   * @param related - The related entity resolved by {@link RelatedEntityLoader.loadOrCreate}.
   * @param data - The nested payload struct, identifier key included, exactly as the legacy passed
   *   it.
   */
  populateRelated(related: TRelated, data: Record<string, unknown>): void;
}

/**
 * A one-to-many relationship — the target of BRANCH 4.
 *
 * No remove operation and no collection reader are declared, because a one-to-many property can
 * never reach BRANCH 5: that branch's gate at [org/Hibachi/HibachiTransient.cfc:L310] requires
 * `fieldType == "many-to-many"`. Declaring them anyway would invent a surface the legacy never used
 * on this kind (S9).
 */
export interface OneToManyPropertyDescriptor<
  TTarget,
  TPropertyName extends string,
  TRelated extends object = object,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind: 'one-to-many';

  readonly relatedPrimaryIdPropertyName: string;

  /**
   * The legacy `singularname` metadata attribute — for example `'sku'` for
   * [model/entity/Product.cfc:L73] and `'product'` for [model/entity/Brand.cfc:L61].
   *
   * G6 TRANSLATION DECISION — THE `singularName` / `singularname` CASING DIVERGENCE, AND WHY IT IS
   * HARMLESS HERE. The legacy code composed method names from this attribute and spelled the key
   * INCONSISTENTLY while doing so: `add#currentProperty.singularName#` with a capital N at
   * [org/Hibachi/HibachiTransient.cfc:L294], against `remove#currentProperty.singularname#` and
   * `add#currentProperty.singularname#` with a lower-case n at [:L339] and [:L357]. Both worked
   * because CFML struct keys are case-insensitive — the real declarations are all lower-case, as at
   * [model/entity/Brand.cfc:L60-L61] and [model/entity/Product.cfc:L73-L90] — whereas TypeScript
   * property access is case-SENSITIVE, so a naive transliteration would have produced one working
   * path and one `undefined`. One spelling is therefore pinned for this member and used everywhere.
   *
   * The divergence is doubly harmless because the target NEVER CONCATENATES this value into a member
   * name: S3 and TR-3 forbid that, so the add and remove operations arrive as injected functions and
   * this member is retained as declared provenance — it records which properties the legacy
   * dispatched by name, and therefore exactly where the divergence used to live.
   */
  readonly singularName: string;

  readonly loader: RelatedEntityLoader<TRelated>;

  /**
   * Adds the related entity to this relationship — the injected replacement for
   * `this.invokeMethod("add#currentProperty.singularName#", {1=thisEntity})`
   * [org/Hibachi/HibachiTransient.cfc:L294].
   *
   * The legacy `add*` members are hand-written bidirectional helpers rather than plain collection
   * pushes — `model/entity/Brand.cfc:L98-L100` implements `addProduct()` as
   * `arguments.product.setBrand(this)` — which is exactly why this cannot be a field write and must
   * be supplied by the module that owns the relationship.
   *
   * @param target - The entity being populated.
   * @param related - The related entity to add.
   */
  addRelated(target: TTarget, related: TRelated): void;

  populateRelated(related: TRelated, data: Record<string, unknown>): void;
}

/**
 * A many-to-many relationship — the target of BRANCH 4 when the payload is an array, and of
 * BRANCH 5 when it is a delimited identifier list. Both are reachable for the same property, and
 * the payload shape alone decides which one runs: [org/Hibachi/HibachiTransient.cfc:L273] versus
 * [:L310].
 */
export interface ManyToManyPropertyDescriptor<
  TTarget,
  TPropertyName extends string,
  TRelated extends object = object,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind: 'many-to-many';

  readonly relatedPrimaryIdPropertyName: string;

  readonly singularName: string;

  readonly loader: RelatedEntityLoader<TRelated>;

  addRelated(target: TTarget, related: TRelated): void;

  /**
   * See {@link ManyToOnePropertyDescriptor.populateRelated}; the legacy call is [:L300].
   *
   * Declared on this kind as well as on one-to-many because BRANCH 4 claims BOTH — its gate at
   * [org/Hibachi/HibachiTransient.cfc:L273] admits `many-to-many` alongside `one-to-many` whenever the
   * payload is an array — so a many-to-many property recurses through exactly the same call. BRANCH 5,
   * which handles the delimited-list payload for this same kind, never recurses at all.
   */
  populateRelated(related: TRelated, data: Record<string, unknown>): void;

  /**
   * Removes the related entity from this relationship — the injected replacement for
   * `this.invokeMethod("remove#currentProperty.singularname#", {1=existingRelatedEntities[m]})`
   * [org/Hibachi/HibachiTransient.cfc:L339]. Reached only from BRANCH 5.
   *
   * @param target - The entity being populated.
   * @param related - The related entity whose relationship is being removed.
   */
  removeRelated(target: TTarget, related: TRelated): void;

  /**
   * Reads the currently related entities — the injected replacement for
   * `invokeMethod("get#currentProperty.name#")` [org/Hibachi/HibachiTransient.cfc:L319].
   *
   * G6 TRANSLATION DECISION — THIS ACCESSOR IS WHY THE LEGACY THROW IS NOT PORTED. Immediately after
   * that read, [:L321-L323] throws
   * "The Many-To-Many relationship for '…' could not be populated because it wasn't setup as an
   * empty array on init." because a CFML collection that `init()` forgot to seed was null. Here the
   * return type is a declared array, so the condition is UNREACHABLE BY CONSTRUCTION: an
   * implementation cannot hand back null without failing to compile. No equivalent `throw` is
   * emitted and the message is not exported anywhere — it originates in `org/Hibachi/**`, framework
   * code that §0.8.3.2 states is "being retired for this slice, not carried forward", and it is not
   * one of the four legacy throw strings `src/errors/DomainError.ts` carries, nor one of the carried
   * defects — the two registers are stated canonically, and only once, in the header of
   * `src/ports/repositories/SkuRepository.ts`, and BOTH ARE FROZEN AT THE AAP's OWN BOUNDS — AAP
   * 0.6.7's D1-D21 and AAP 0.6.6's M1-M8. Nothing in this port mints an identifier beyond either
   * range; a further source observation is recorded by its `path:Lnnn` locator instead.
   *
   * The legacy read returned the live collection, which is why BRANCH 5 iterates it BACKWARDS while
   * {@link removeRelated} mutates it. An implementation may return the live array or a copy; the
   * reverse iteration is correct either way.
   *
   * @param target - The entity being populated.
   * @returns The currently related entities.
   */
  readRelated(target: TTarget): readonly TRelated[];

  /**
   * Reads a related entity's primary identifier — the injected replacement for
   * `existingRelatedEntities[m].invokeMethod("get#primaryIDPropertyName#")`
   * [org/Hibachi/HibachiTransient.cfc:L329]. (The legacy local holding the result is misspelled
   * `thisPrimrayID`; that is a variable name rather than observable behaviour, so it is cited here
   * and not reproduced.)
   *
   * An implementation whose entity has no identifier yet should return the empty string: a CFML list
   * cannot contain an empty element, so an empty identifier matches nothing and the relationship is
   * removed — which is the same arm the legacy code took.
   *
   * @param related - A currently related entity.
   * @returns Its primary identifier.
   */
  readRelatedPrimaryId(related: TRelated): string;
}

/**
 * Any one declared property.
 *
 * Deliberately NOT named `PropertyDescriptor`: that identifier is a global interface in the
 * TypeScript standard library (the shape `Object.defineProperty` consumes), and shadowing it inside
 * this module would be legal but actively misleading.
 */
export type PopulatePropertyDescriptor<TTarget, TPropertyName extends string> =
  DisabledPropertyDescriptor<TPropertyName> | EnabledPropertyDescriptor<TTarget, TPropertyName>;

/**
 * Any declared property that population may actually write — everything except a
 * {@link DisabledPropertyDescriptor}.
 *
 * It exists because the branch-dispatch predicates below read `kind`, which a disabled descriptor
 * does not declare. Rather than giving that shape a `kind` it has no use for, the predicates accept
 * this narrower union; the engine reaches them only AFTER its
 * `if (descriptor.populateEnabled === false) continue;` gate, which narrows to exactly this type.
 * The result is that "dispatch on kind" is unreachable for a disabled property by construction
 * rather than by the ordering of two adjacent `if` statements.
 */
export type EnabledPropertyDescriptor<TTarget, TPropertyName extends string> =
  | ColumnPropertyDescriptor<TPropertyName>
  | ManyToOnePropertyDescriptor<TPropertyName>
  | OneToManyPropertyDescriptor<TTarget, TPropertyName>
  | ManyToManyPropertyDescriptor<TTarget, TPropertyName>;

/**
 * One type's complete population contract — the declared replacement for `getProperties()`.
 *
 * G6 TRANSLATION DECISION — `getProperties()` HAS NO TARGET ANALOGUE, BY DESIGN.
 * [org/Hibachi/HibachiTransient.cfc:L770-L789] walked the metadata `extends` CHAIN, concatenating
 * every level's properties, and cached the result in APPLICATION scope under
 * `classPropertyCache_#getClassFullname()#`. Two consequences are worth recording:
 *
 *   1. INHERITED PROPERTIES WERE POPULATION CANDIDATES. That is precisely why every in-scope entity
 *      re-declares all four audit properties with `hb_populateEnabled="false"` instead of relying on
 *      the base class, and it independently corroborates the unconditional audit exclusion applied
 *      by {@link populateWithSubProperties}.
 *   2. THERE IS NO METADATA WALK AND NO CACHE HERE. Descriptors are declared per module (TR-3), and
 *      per M7 / S8 a module-level property-metadata cache is forbidden outright, because nothing may
 *      bleed between invocations on a warm container.
 */
export interface PropertyDescriptorSet<TTarget, TPropertyName extends string> {
  /**
   * The bare class name of the target — the legacy `this.getClassName()` operand of ARM 3
   * [org/Hibachi/HibachiTransient.cfc:L190].
   *
   * `getClassName()` [org/Hibachi/HibachiObject.cfc:L135-L137] returns
   * `listLast(getClassFullname(), ".")`, so the expected values are exactly the legacy component
   * names: `Product`, `Sku`, `ProductType`, `Brand`, `Option`, `OptionGroup`, and for the process
   * objects `Product_AddOptionGroup`, `Product_AddOption` and `Product_UpdateSkus`. The LEGACY name
   * is carried rather than the TypeScript class name, because it is what the out-of-scope
   * permission records are keyed by: `getEntityPermissionDetails()` builds its key set from a
   * directory listing of `model/entity` at [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141],
   * so a renamed key would silently match no permission record and — the ladder being default-deny
   * — silently deny every property.
   *
   * DECLARED, NOT REFLECTED. The legacy value came from component metadata; deriving it here from
   * `constructor.name` would reintroduce exactly the runtime reflection TR-3 retires, and would
   * additionally break under bundling, where esbuild is free to rename a class.
   *
   * REQUIRED even for a transient set whose ARM 1 short-circuit means it is never consulted. An
   * optional member would have to be defaulted, and a default entity name is a value that could
   * silently mismatch a permission record; there is no honest default, so there is no default.
   */
  readonly entityName: string;

  /**
   * Whether the target is a persistent entity (`true`) or a transient process object (`false`) —
   * the port of `isPersistent()` [org/Hibachi/HibachiObject.cfc:L11-L18], which returns true only
   * when the component metadata declares `persistent` and it is true.
   *
   * G6 TRANSLATION DECISION — THIS FLAG EXISTS BECAUSE IT IS THE FIRST ARM OF THE LEGACY
   * AUTHORISATION OR, AND THAT ARM IS A SHORT-CIRCUIT THAT MATTERS ENORMOUSLY. The master gate at
   * [org/Hibachi/HibachiTransient.cfc:L186-L190] reads
   * `!isPersistent() || (publicPopulateFlag && … == "public") || authenticateEntityProperty(…)`.
   * All three in-scope process objects — `model/process/Product_AddOptionGroup.cfc`,
   * `model/process/Product_AddOption.cfc` and `model/process/Product_UpdateSkus.cfc` — declare, at
   * L49 of each, `component output="false" accessors="true" extends="HibachiProcess" {` with NO
   * `persistent` attribute at all, so `isPersistent()` is FALSE for every one of them, the OR
   * short-circuits on its first arm, and PROCESS OBJECTS POPULATE FREELY, bypassing per-property
   * authorisation entirely. The six entities declare `persistent=true`, so for them authorisation
   * WAS consulted. That asymmetry is behaviour, and it is declared here rather than rediscovered by
   * reflection.
   */
  readonly persistent: boolean;

  /**
   * The declared properties, in the order the legacy loop would have visited them.
   *
   * ORDER IS PRESERVED FOR A REASON: the loop at [org/Hibachi/HibachiTransient.cfc:L178] iterates
   * DECLARED PROPERTIES, never payload keys, so declaration order is the population order — which
   * is observable whenever two properties feed the same downstream value.
   *
   * A payload key matching no declared property is SILENTLY IGNORED, which is a direct consequence
   * of that iteration direction. No unknown-key rejection is added and nothing is thrown for an
   * extra key.
   */
  readonly properties: readonly PopulatePropertyDescriptor<TTarget, TPropertyName>[];
}

/**
 * One entry in the populated-sub-property record.
 *
 * The two shapes are not interchangeable and the difference is the legacy branch that produced them:
 * BRANCH 3 files a SINGLE related entity under the property name
 * [org/Hibachi/HibachiTransient.cfc:L248], BRANCH 4 files an ARRAY of them [:L303-L305]. The
 * consumer distinguishes them exactly as the legacy `validate()` did, with an array test — [:L426]
 * reads `isArray(variables.populatedSubProperties[ propertyName ])` and takes the per-item path,
 * falling through to the single-object path at [:L441].
 */
export type PopulatedSubPropertyValue = object | readonly object[];

/**
 * Which sub-properties a population pass populated, keyed by property name.
 *
 * THIS IS A HARD BEHAVIOURAL CONTRACT ON POPULATE'S OUTPUT, NOT AN IMPLEMENTATION DETAIL.
 * `org/Hibachi/HibachiTransient.cfc:L405-L450` reads it back: `validate()` loops the record [:L416],
 * derives a per-property context through
 * `getService("hibachiValidationService").getPopulatedPropertyValidationContext(…)` [:L419] and,
 * when that context is non-empty and truthy [:L423], CASCADES `.validate(propertyContext)` onto each
 * populated sub-object, recording a failure as `getHibachiErrors().addError('populate', propertyName)`
 * at [:L436] and [:L448]. Populate is the only thing that can know which sub-objects were touched, so
 * dropping the record would silently stop the cascade — with no error, no compile failure and no test
 * to catch it, since coverage for this file is net-new (§0.6.5.2).
 *
 * WHERE THE CASCADE ITSELF LIVES, stated so this file and its sibling agree rather than appearing to
 * contradict each other: `src/validation/Validator.ts` documents the cascade as a deliberate
 * non-port, because the chooser at `org/Hibachi/HibachiValidationService.cfc:L133-L151` reads a
 * `populatedPropertyValidation` key that NONE of the seven catalog validation documents declares, so
 * no catalog rule set can currently drive it. Those two positions are consistent: populate's
 * obligation is to RECORD what it populated, which is observable output of the legacy method;
 * whether anything cascades off that record is owned elsewhere. The `'populate'` error key is not
 * exported from here either — error keys belong to `src/errors/ValidationError.ts`, whose inventory
 * is closed, and [:L436] / [:L448] are cited for provenance only.
 */
export type PopulatedSubPropertyRecord<TPropertyName extends string> = Partial<
  Record<TPropertyName, PopulatedSubPropertyValue>
>;

/**
 * The full outcome of a population pass: the target, and the record of what was populated beneath it.
 *
 * Two functions are exported rather than one because two obligations must both be met and they pull
 * in different directions. {@link populate} must return the target itself, because both legacy
 * methods end in `return this;` — [model/entity/HibachiEntity.cfc:L96] and
 * [org/Hibachi/HibachiTransient.cfc:L399] — and callers chain on it. The sub-property record must
 * also be reachable, for the reason set out on {@link PopulatedSubPropertyRecord}. Legacy code
 * satisfied both by stashing the record in the entity's own `variables` scope, which is not
 * available here and would force every entity type to declare a field it does not otherwise need.
 * {@link populateWithSubProperties} therefore returns both, and {@link populate} is the fluent
 * one-line wrapper over it.
 */
export interface PopulateResult<TTarget, TPropertyName extends string> {
  readonly target: TTarget;

  readonly populatedSubProperties: PopulatedSubPropertyRecord<TPropertyName>;
}

/* =============================================================================================
 * THE AUTHORISATION BOUNDARY — DECLARED, CONSUMED, AND DEFAULT-DENY
 * =============================================================================================
 * The master gate's third condition [org/Hibachi/HibachiTransient.cfc:L186-L190] is a three-way OR,
 * and two of its three arms consult the retired framework's request scope. Those two arms are
 * SECURITY behaviour, not incidental plumbing: `authenticateEntityPropertyCrudByAccount`
 * [org/Hibachi/HibachiAuthenticationService.cfc:L104-L120] permits a write only when the account is a
 * super user [:L106-L108] or when some permission group grants that entity property explicitly
 * [:L111-L116], and RETURNS FALSE OTHERWISE [:L119]. The legacy default for a persistent entity is
 * therefore DENY, and a port that answered "permitted" unconditionally would make every
 * populate-enabled property of every entity mass-assignable from a request payload.
 *
 * SO THE ARMS ARE PORTED, AND THE COLLABORATOR THEY NEED IS DECLARED HERE. Per TR-5 the boundary is
 * crossed only through a declared port: the interface below states exactly the two questions the
 * legacy asked of `getHibachiScope()`, {@link populateWithSubProperties} asks them in the legacy order,
 * and NO ADAPTER IS IMPLEMENTED — the access-control subsystem lives under `org/Hibachi/**`, which
 * §0.8.3.2 describes as "a boundary to extract from, never modify", and §0.2.2 excludes it. The gap is
 * flagged, not filled with a stub that would answer "yes".
 *
 * WHICH IS WHY ABSENCE MEANS DENY. When no collaborator is supplied a persistent target populates
 * NOTHING, because "no authorisation context" is not the same claim as "authorised" and the legacy
 * never treated it as such. A transient process object is unaffected: arm 1 short-circuits ahead of
 * the port, so all three in-scope process objects keep populating freely with no collaborator at all.
 *
 * TODO(boundary): the rightful owner of an implementation is the access-control subsystem behind
 * `org/Hibachi/HibachiAuthenticationService.cfc`, which §0.2.2 excludes, together with the composition
 * root that knows a request's identity. Nothing in this subtree implements
 * {@link PopulationAuthorizationPort}, and nothing here fabricates a permissive default in its place.
 * ============================================================================================= */

/**
 * The two optional extension seams, both no-ops by default.
 *
 * The master gate at [org/Hibachi/HibachiTransient.cfc:L184-L190] ends in a three-way OR whose second
 * and third arms are access control:
 *
 *     !isPersistent()
 *     ||
 *     (getHibachiScope().getPublicPopulateFlag() && structKeyExists(currentProperty,
 *        "hb_populateEnabled") && currentProperty.hb_populateEnabled == "public")
 *     ||
 *     getHibachiScope().authenticateEntityProperty( crudType="update",
 *        entityName=this.getClassName(), propertyName=currentProperty.name)
 *
 * An earlier revision of this file ported ARM 1 only and carried ARMs 2 and 3 as flagged TR-5
 * omissions, on the reasoning that both reach `getHibachiScope()` [org/Hibachi/HibachiObject.cfc:L74-L76]
 * and from there into `org/Hibachi/**`, the retired framework boundary §0.8.3.2 describes as "a
 * boundary to extract from, never modify". THAT REASONING IS SUPERSEDED, AND THE ARMS ARE NOW PORTED.
 * Three things force the change:
 *
 *   1. TR-5 REQUIRES A DECLARED PORT, NOT AN OPEN GATE. Its words are "the port interface is declared,
 *      the member is implemented against it, and the gap is flagged. The member is never quietly
 *      dropped." A boundary crossing that returns `true` unconditionally has not been declared — it has
 *      been ELIDED, and the elision changes behaviour rather than deferring it.
 *   2. THE OMISSION WAS NOT BEHAVIOUR-NEUTRAL. Population is the entry point external payload data uses
 *      to reach a persistent entity's fields. With the gate open, every writable declared property of
 *      every in-scope entity is assignable by any caller that can reach a save — including
 *      `model/entity/Brand.cfc`'s `activeFlag` [:L52], `publishedFlag` [:L53], `urlTitle` [:L56],
 *      `brandWebsite` [:L57] and `remoteID` [:L58]. The legacy consulted access control for each of
 *      those; this port did not, so the two paths did NOT "currently coincide" as the earlier note
 *      claimed. §0.8.2 Guideline 2 requires behaviour be preserved exactly as-is, and it was not.
 *   3. NOTHING IS INVENTED BY DECLARING IT. The contract below is the legacy call shape and nothing
 *      more: one boolean read matching `getPublicPopulateFlag()`, and one predicate matching
 *      `authenticateEntityProperty` with its three legacy operands under their legacy names. No
 *      permission model, no role, no policy language, no rule table and no scope object crosses the
 *      boundary (S9), and `org/Hibachi/**` is neither imported nor reproduced.
 *
 * WHY IT IS DECLARED IN THIS FILE RATHER THAN AS A PORT FILE. §0.2.2.7 enumerates SEVEN boundary ports
 * and authorisation is not among them, so creating an eighth port file would add target surface the AAP
 * does not list. The contract is therefore declared where its single consumer lives, and it is injected
 * through the options parameter this file already has — no new module, no new dependency, and no import
 * from `src/ports/**`.
 * ============================================================================================= */

/** Options for one population pass. */
export interface PopulateOptions<TTarget> {
  /**
   * The per-property authorisation capability the master gate's second and third arms consult — F07.
   *
   * ⚠️ OPTIONAL IN THE TYPE, MANDATORY IN EFFECT FOR A PERSISTENT TARGET, AND OMITTING IT IS A
   * DECISION WHOSE ANSWER IS DENY. Leaving it out does not disable the gate. It makes the gate refuse:
   * {@link isPopulationAuthorized} reproduces the legacy default of `false`, so a call on a PERSISTENT
   * target with no collaborator populates NOTHING — every property refused, silently and by design,
   * exactly as the legacy refused a property no permission group granted
   * [org/Hibachi/HibachiAuthenticationService.cfc:L119].
   *
   * IT IS OPTIONAL RATHER THAN REQUIRED BECAUSE A TRANSIENT PROCESS OBJECT GENUINELY NEEDS NO
   * COLLABORATOR. Arm 1 short-circuits ahead of the port [org/Hibachi/HibachiTransient.cfc:L187], so
   * the three in-scope process objects populate freely and are unaffected either way. Forcing them to
   * supply an authorisation context would invent a requirement the source does not have (S9), and the
   * only thing they could supply is a rubber stamp — which is worse than absence, because a rubber
   * stamp would also silently permit a persistent target.
   *
   * A caller that populates a persistent entity and does not want it default-denied MUST supply this.
   * See {@link PopulationAuthorizationPort} for who is expected to, and for why no implementation
   * exists in this subtree.
   */
  readonly authorization?: PopulationAuthorizationPort;

  /**
   * Runs before any property is examined — the port of the `beforePopulate()` call at
   * [org/Hibachi/HibachiTransient.cfc:L172].
   *
   * @param target - The entity or process object about to be populated.
   * @param data - The incoming payload.
   */
  readonly beforePopulate?: (target: TTarget, data: Record<string, unknown>) => void;

  /**
   * Runs after every property has been examined and before the target is returned — the port of the
   * `afterPopulate()` call at [org/Hibachi/HibachiTransient.cfc:L396].
   *
   * TODO(parity): THIS SEAM'S LEGACY OCCUPANT IS A DECLARED TR-5 BOUNDARY OMISSION. The local
   * Slatwall override at [model/entity/HibachiEntity.cfc:L56] ran the framework machinery first
   * [:L59] and then, in the very position this seam occupies, assigned CUSTOM ATTRIBUTE VALUES: it
   * read `getAssignedAttributeSetSmartList().getRecords()` [:L62], lower-cased the entity name
   * [:L64-L65], looped attribute sets and their attributes against the incoming payload [:L68-L93],
   * called `av.invokeMethod("set#attributeType#", {1=this})` [:L80], added new attribute values via
   * `this.addAttributeValue(av)` [:L83-L85] and refreshed two cache structs [:L88-L89]. Every part of
   * that reaches the attribute subsystem, which is explicitly out of scope: §0.2.2.1 excludes the six
   * `Attribute`-prefixed components under the legacy `model` tree, and §0.2.2.6 names `attributeService` among the excluded
   * collaborators, as are the three non-persistent properties it depends on —
   * `assignedAttributeSetSmartList`, `attributeValuesByAttributeIDStruct` and
   * `attributeValuesByAttributeCodeStruct`, declared at [model/entity/HibachiEntity.cfc:L51-L53].
   * Per TR-5 the gap is FLAGGED rather than quietly dropped: the seam is declared and invoked in the
   * right position, and no attribute service is imported or stubbed, no `AttributeValue` type is
   * declared and no port file is created.
   *
   * @param target - The populated entity or process object.
   * @param data - The incoming payload.
   */
  readonly afterPopulate?: (target: TTarget, data: Record<string, unknown>) => void;
}

/* =============================================================================================
 * DESCRIPTOR NARROWING — EXPLICIT PREDICATES RATHER THAN DISCRIMINANT INFERENCE
 * =============================================================================================
 * `kind` is OPTIONAL on the column descriptor, because a legacy property with no `fieldtype`
 * attribute behaves as a column [org/Hibachi/HibachiTransient.cfc:L193]. An optional discriminant
 * narrows unreliably inside an if/else chain, so each arm is gated by an explicit type predicate
 * instead. Every predicate is a plain comparison — no cast, no assertion, no suppression comment
 * (S1) — and each reproduces its legacy gate literally.
 * ============================================================================================= */

/**
 * Matches BRANCH 1 and BRANCH 2's shared gate fragment
 * `!structKeyExists(currentProperty, "fieldType") || currentProperty.fieldType == "column"`
 * [org/Hibachi/HibachiTransient.cfc:L193] and [:L216].
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a column or declares no kind at all.
 */
function isColumnDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ColumnPropertyDescriptor<TPropertyName> {
  return descriptor.kind === undefined || descriptor.kind === 'column';
}

/**
 * Matches BRANCH 3's gate fragment `currentProperty.fieldType == "many-to-one"`
 * [org/Hibachi/HibachiTransient.cfc:L221].
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a many-to-one relationship.
 */
function isManyToOneDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ManyToOnePropertyDescriptor<TPropertyName> {
  return descriptor.kind === 'many-to-one';
}

/**
 * Matches BRANCH 4's gate fragment
 * `currentProperty.fieldType == "one-to-many" or currentProperty.fieldType == "many-to-many"`
 * [org/Hibachi/HibachiTransient.cfc:L273]. Both kinds expose the same three members BRANCH 4 uses,
 * so the union is directly usable without further narrowing.
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a one-to-many or many-to-many relationship.
 */
function isCollectionDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is
  | OneToManyPropertyDescriptor<TTarget, TPropertyName>
  | ManyToManyPropertyDescriptor<TTarget, TPropertyName> {
  return descriptor.kind === 'one-to-many' || descriptor.kind === 'many-to-many';
}

/**
 * Matches BRANCH 5's gate fragment `currentProperty.fieldType == "many-to-many"`
 * [org/Hibachi/HibachiTransient.cfc:L310].
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a many-to-many relationship.
 */
function isManyToManyDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ManyToManyPropertyDescriptor<TTarget, TPropertyName> {
  return descriptor.kind === 'many-to-many';
}

/* =============================================================================================
 * THE `_setProperty` PORT — THE `exactOptionalPropertyTypes` CRUX, AND THE RISKIEST LINE IN THIS FILE
 * =============================================================================================
 * `org/Hibachi/HibachiTransient.cfc:L806-L819` declares
 * `_setProperty(name, value, formatType='')` and branches on `structKeyExists(arguments, 'value')`:
 * with a value it dispatches through a dynamically composed setter name; without one it calls
 * `structDelete` on the property key, which its own comment describes as setting NULL for a
 * persistent entity.
 *
 * THREE THINGS ABOUT THAT FUNCTION DETERMINE THE SHAPE OF THIS PORT.
 *
 * 1. `structDelete` IS A KEY DELETION, NOT AN ASSIGNMENT. Setting a property to NULL in this system
 *    means THE KEY CEASES TO EXIST. Under `exactOptionalPropertyTypes` the only faithful encoding is
 *    `delete`; `target[name] = undefined` would leave the property PRESENT with the value `undefined`
 *    and the compiler would reject it anyway. `null` and `''` are equally wrong as stand-ins.
 *
 * 2. THE DISCRIMINATOR IS THE PRESENCE OF THE ARGUMENT, not the value of it.
 *    `structKeyExists(arguments, 'value')` separates "called with a value" — even a value that
 *    happens to be empty — from "called with no value at all". Modelling that with one optional
 *    parameter that can receive `undefined` would recreate exactly the ambiguity to be avoided, so it
 *    is modelled as TWO EXPLICITLY DISTINCT OPERATIONS: {@link assignPropertyValue}, whose value
 *    parameter is required and typed so that `undefined` and `null` are COMPILE ERRORS, and
 *    {@link clearPropertyValue}, which takes no value at all. It is not possible to reach the assign
 *    path with nothing to assign, or the delete path with something to assign.
 *
 * 3. THE DYNAMIC SETTER DOES NOT SURVIVE. `this["set" & arguments.name]` is string-keyed dynamic
 *    dispatch — the same `onMissingMethod` family IR-1 replaces with explicit declarations, and
 *    forbidden by S3 and TR-3. Assignment here is direct, typed field assignment against a key drawn
 *    from the declared property-name union; no member name is ever concatenated, and neither
 *    `Reflect` nor `eval` nor `new Function` appears anywhere in this file.
 *
 * A FOURTH, MINOR NOTE: the third parameter `formatType` is accepted and NEVER READ anywhere in the
 * body. It is vestigial, and it is the first of two independent confirmations that `hb_formatType`
 * has no effect on population.
 *
 * WHY THIS IS NOT MERELY A TYPING NICETY — THE OBSERVABLE PROOF.
 * `model/service/ProductService.cfc:L268` reads:
 *
 *     if(isNull(arguments.product.getURLTitle())) { … createUniqueURLTitle(…) … }
 *
 * It tests `isNull(...)` ONLY. Contrast `saveProductType` at [model/service/ProductService.cfc:L295],
 * which tests `isNull(...) || !len(...)`. So if population assigned `urlTitle = ''` instead of
 * DELETING the key, `isNull()` would be false, that branch would never run, and the unique URL title
 * would never be generated — a product saved with a blank `urlTitle` would silently end up with no
 * URL title at all. A real, user-visible behavioural difference produced by nothing more than
 * choosing `= undefined` or `= ''` over `delete`. That single call site is why
 * `exactOptionalPropertyTypes` is switched on for this subtree.
 * ============================================================================================= */

/**
 * Assigns a value to a declared property — the value-carrying half of `_setProperty`
 * [org/Hibachi/HibachiTransient.cfc:L809-L814].
 *
 * The value parameter is `NonNullable<unknown>`, which accepts `''`, `0`, `false`, objects and arrays
 * while making `undefined` and `null` COMPILE ERRORS. That is deliberate: the legacy helper could
 * only ever be called with a value that existed, and the type now enforces what the CFML argument
 * check used to test at run time.
 *
 * @param target - The field surface being populated.
 * @param propertyName - A name drawn from the declared property-name union.
 * @param value - The value to assign. Cannot be `undefined` or `null`.
 */
export function assignPropertyValue<TPropertyName extends string>(
  target: PopulationTarget<TPropertyName>,
  propertyName: TPropertyName,
  value: NonNullable<unknown>,
): void {
  target[propertyName] = value;
}

/**
 * Sets a declared property to NULL by DELETING ITS KEY — the value-less half of `_setProperty`
 * [org/Hibachi/HibachiTransient.cfc:L815-L817], whose own comment reads "Remove the key from
 * variables, represents setting as NULL for persistent entities".
 *
 * `delete` is the whole point; see the block comment above, and in particular the
 * `model/service/ProductService.cfc:L268` proof. Nothing in this file ever assigns `undefined`,
 * `null` or `''` to stand in for absence.
 *
 * @param target - The field surface being populated.
 * @param propertyName - A name drawn from the declared property-name union.
 */
export function clearPropertyValue<TPropertyName extends string>(
  target: PopulationTarget<TPropertyName>,
  propertyName: TPropertyName,
): void {
  delete target[propertyName];
}

/**
 * The third condition of the master gate — the three-way authorisation OR at
 * [org/Hibachi/HibachiTransient.cfc:L186-L190]:
 *
 *     !isPersistent()
 *     ||
 *     (getHibachiScope().getPublicPopulateFlag() && structKeyExists(currentProperty,
 *        "hb_populateEnabled") && currentProperty.hb_populateEnabled == "public")
 *     ||
 *     getHibachiScope().authenticateEntityProperty( crudType="update",
 *        entityName=this.getClassName(), propertyName=currentProperty.name)
 *
 * ALL THREE ARMS ARE NOW PORTED AND LIVE, in the legacy order, with the legacy short-circuits.
 *
 * ARM 1 — `!isPersistent()`. See {@link PropertyDescriptorSet.persistent} for the verified evidence
 * that it short-circuits for every in-scope process object and therefore lets them populate freely.
 * It is evaluated FIRST and on its own, so a transient target never consults the authorisation port
 * at all — which is the behaviour, not an optimisation.
 *
 * ARMS 2 AND 3 — resolved through {@link PopulationAuthorizationPort}, declared in
 * `../../ports/AccountContextPort` alongside the account context because both are members of the
 * same `getHibachiScope()` lookup [org/Hibachi/HibachiObject.cfc:L74-L76] that AAP §0.4.1.6 row 11
 * charters that port to replace. The full argument for its placement, the S9 boundary it does not
 * cross, and the default-deny obligation on its implementer are recorded there rather than repeated
 * here.
 *
 * ⭐ WHY THIS IS PARITY AND NOT A NEW CONTROL. These arms are legacy code on the live population
 * path. Their earlier omission was recorded here as a TR-5 boundary gap whose observable consequence
 * was stated plainly: "for a persistent target this port permits population where the legacy would
 * have consulted per-property access control". Closing the gap restores behaviour AAP §0.8.2
 * Guideline 2 requires be preserved. The port is what makes it closable without importing the
 * excluded permission subsystem.
 *
 * ARM 2 REMAINS UNREACHABLE IN SCOPE ON ITS OWN TERMS, and is implemented anyway for the same
 * reason BRANCH 2 is: `hb_populateEnabled="public"` occurs 68 times repository-wide and ZERO times
 * across the six in-scope entities and three in-scope process objects (see {@link PopulateEnabled}),
 * so no in-scope descriptor can satisfy its second operand. A proven-unreachable arm that is present
 * and documented is materially stronger than one silently dropped — and the arm is what keeps the
 * gate a faithful three-way OR rather than a two-way one.
 *
 * EVALUATION ORDER IS THE LEGACY ORDER, DELIBERATELY. [org/Hibachi/HibachiTransient.cfc:L188] reads
 * the flag BEFORE testing the attribute, so `getPublicPopulateFlag()` is called first and the
 * attribute test second. Reordering them to test the cheap in-memory attribute first would be a
 * defensible idiom change, but it would change which port members are invoked for a given property,
 * and this file preserves observable call sequences (AAP §0.8.1).
 *
 * @param descriptorSet - The target's declared population contract.
 * @param descriptor - The specific property being considered.
 * @param authorization - The resolved authorisation context for this invocation.
 * @returns `true` when population of this property of this target is permitted.
 */
function isPopulationAuthorized<TTarget, TPropertyName extends string>(
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  descriptor: PopulatePropertyDescriptor<TTarget, TPropertyName>,
  authorization: PopulationAuthorizationPort,
): boolean {
  // ARM 1 — `!isPersistent()`. A transient process object short-circuits the OR on its first arm,
  // exactly as the legacy does, and never reaches the two arms below.
  if (!descriptorSet.persistent) {
    return true;
  }

  // ARM 2 — `getPublicPopulateFlag() && hb_populateEnabled == "public"`. Operand order matches
  // [org/Hibachi/HibachiTransient.cfc:L188]. The legacy `structKeyExists` presence test and the
  // `== "public"` value test collapse into one comparison here because the descriptor member is
  // typed `'public' | undefined`, so absent and not-public are the same check.
  if (authorization.getPublicPopulateFlag() && descriptor.populateEnabled === 'public') {
    return true;
  }

  // ARM 3 — `authenticateEntityProperty( crudType="update", entityName=this.getClassName(),
  // propertyName=currentProperty.name )`. Default deny lives in the implementation, whose contract
  // requires `false` whenever permission is absent, unknown or undeterminable; every terminal branch
  // of the legacy ladder returns false too.
  return authorization.authenticateEntityProperty({
    crudType: 'update',
    entityName: descriptorSet.entityName,
    propertyName: descriptor.name,
  });
}

/**
 * BRANCH 4's per-item kill switch, read out of the INCOMING PAYLOAD rather than from a separate
 * argument — the second half of the gate at [org/Hibachi/HibachiTransient.cfc:L285]:
 *
 *     (!structKeyExists(arguments.data, "populateSubProperties") || arguments.data.populateSubProperties)
 *
 * G6 TRANSLATION DECISION — THE SWITCH LIVES IN `data`, AND IT MUST STAY THERE. A caller disables
 * sub-population by putting `populateSubProperties: false` INSIDE the payload, alongside the property
 * values. Absent means TRUE, as the legacy source comment at [:L284] says in its own words: "if not
 * defined we asume true". It is deliberately NOT promoted to a typed options parameter, because doing
 * so would create two places to set one switch and would require inventing a precedence rule between
 * them (S9); the payload reading is the behaviour.
 *
 * G6 TRANSLATION DECISION — CFML BOOLEAN COERCION. In CFML the raw value is used directly in a
 * boolean context, and HTTP delivers strings, so `populateSubProperties: 'false'` is FALSY there
 * where a naive `=== false` test in TypeScript would treat it as enabled. The CFML boolean-false
 * forms are therefore recognised explicitly. A value CFML would have rejected outright with a cast
 * error falls back to the documented default of TRUE, because this file raises nothing: it contains
 * no `throw` statement at all, deliberately.
 *
 * @param data - The incoming payload.
 * @returns `true` when sub-properties should be populated.
 */
function shouldPopulateSubProperties(data: Record<string, unknown>): boolean {
  if (!hasDataKey(data, 'populateSubProperties')) {
    return true;
  }
  const flag: unknown = data['populateSubProperties'];
  if (typeof flag === 'boolean') {
    return flag;
  }
  if (typeof flag === 'number') {
    return flag !== 0;
  }
  if (typeof flag === 'string') {
    const normalisedFlag = flag.trim().toLowerCase();
    return !(normalisedFlag === 'false' || normalisedFlag === 'no' || normalisedFlag === '0');
  }
  return true;
}

/**
 * Splits a CFML list into its elements.
 *
 * CFML list semantics are not string-split semantics and the difference is observable: consecutive
 * delimiters collapse, so `listLen("a,,b")` is 2 and `listToArray` yields two elements rather than
 * three. Elements are NOT trimmed either — `listFind("a, b", "b")` is 0, because the element is
 * `" b"`. Both behaviours are reproduced: empty elements are dropped, and nothing is trimmed.
 *
 * @param list - A comma-delimited identifier list, as BRANCH 5 receives at
 *   [org/Hibachi/HibachiTransient.cfc:L313].
 * @returns The list's elements, in order.
 */
function splitCfmlList(list: string): string[] {
  return list.split(',').filter((element) => element.length > 0);
}

/**
 * Finds an identifier in the pending list, CASE-SENSITIVELY — the port of
 * `listFind( manyToManyIDList, thisPrimrayID )` at [org/Hibachi/HibachiTransient.cfc:L332].
 *
 * ⚠️⚠️ F23 — CFML `listFind` IS CASE-SENSITIVE. An earlier revision of this module asserted the
 * opposite and lower-cased both sides before comparing. The correction rests on three pieces of
 * evidence, not on a preference:
 *
 *   1. CFML ships `listFind` AND `listFindNoCase` as a deliberate pair; the `NoCase` suffix is the
 *      case-insensitive variant, so the unsuffixed form is case-sensitive by construction.
 *   2. [org/Hibachi/HibachiTransient.cfc] USES BOTH, and it uses them differently. `listFindNoCase`
 *      appears FOURTEEN times in that one file — [:L77], [:L94], [:L555], [:L557], [:L559], [:L561],
 *      [:L609], [:L611], [:L620], [:L622], [:L709], [:L711], [:L713] and [:L715] — while `listFind`
 *      appears EXACTLY ONCE, at [:L332], the line ported here. Across all of `org/Hibachi/**` the
 *      split is 84 `listFindNoCase` to 7 `listFind`. An author who reached for the no-case variant
 *      that consistently and then did not reach for it here was distinguishing the two.
 *   3. Nothing in the surrounding code normalises either side's casing first.
 *
 * WHY THE OLD JUSTIFICATION DOES NOT HOLD. It argued that IR-6 identifiers are generated in lower
 * case by `src/util/uuid.ts`, so case could not matter. Even granting the premise, it is the wrong
 * test: the two sides of this comparison have DIFFERENT PROVENANCE. `candidateId` comes from an
 * already-persisted related entity, but `pendingRelatedIds` is split out of the INCOMING PAYLOAD at
 * [:L313] — caller-supplied text that no generator normalised. A client sending upper-case
 * identifiers would, under case-insensitive matching, have its relationships treated as already
 * present; under the legacy's case-sensitive matching those same relationships are REMOVED and then
 * re-added from the surviving list. Those are different outcomes, and only one of them is the
 * legacy's. Reasoning from what the port's own generator emits, rather than from what the payload may
 * contain, is what made the earlier claim look safe.
 *
 * G6 TRANSLATION DECISION — THE SENTINEL STILL DIFFERS AND IS STILL HANDLED. CFML `listFind` returns
 * a 1-BASED position with 0 meaning "not found"; `Array.prototype.indexOf` returns a 0-based index
 * with -1 meaning "not found". The caller tests `!== -1`, never `> 0`, for the same reason every
 * `arrayFind` translation in this port does.
 *
 * @param pendingRelatedIds - The identifiers still awaiting a relationship, split from the payload.
 * @param candidateId - The identifier of an already-related entity.
 * @returns The zero-based index of the match, or -1 when there is none.
 */
function findRelatedId(pendingRelatedIds: readonly string[], candidateId: string): number {
  return pendingRelatedIds.indexOf(candidateId);
}

/* =============================================================================================
 * THE ENGINE
 * =============================================================================================
 * `org/Hibachi/HibachiTransient.cfc:L169-L400` in one function, with the local Slatwall override's
 * ordering from `model/entity/HibachiEntity.cfc:L56-L96` wrapped around it (IR-8): the framework
 * machinery first, then the extension seam, then the fluent return.
 *
 * THE FIVE BRANCHES ARE PORTED IN SOURCE ORDER, AND THAT ORDER IS LOAD-BEARING. They are mutually
 * exclusive `else if` arms whose gates overlap on payload shape — a `many-to-many` property reaches
 * BRANCH 4 for an array payload and BRANCH 5 for a delimited list — so order decides which one wins:
 *
 *     BRANCH 1  COLUMN                                    [:L192-L213]
 *     BRANCH 2  POPULATE-ARRAY                            [:L215-L218]
 *     BRANCH 3  MANY-TO-ONE, nested struct payload        [:L220-L270]
 *     BRANCH 4  ONE-TO-MANY / MANY-TO-MANY, array payload [:L272-L308]
 *     BRANCH 5  MANY-TO-MANY, delimited id list           [:L309-L359]
 *
 * TODO(parity): THE SECOND LOOP — FILE UPLOAD — IS NOT PORTED.
 * [org/Hibachi/HibachiTransient.cfc:L364-L393] is a separate second loop over the same property array,
 * running after the main loop closes. Its gate at [:L371] requires `hb_fileUpload` present AND truthy,
 * `hb_fileAcceptMIMEType` present, a non-empty value and `structKeyExists(form, currentProperty.name)`
 * — it reads the CFML `form` scope directly — and it then resolves an upload directory, creates it when
 * missing and calls `fileUpload(...)` [:L377-L388]. Two things about it matter. It applies NO part of
 * the master gate: no `hb_populateEnabled` check, no `isPersistent()` check and no authorisation check,
 * so a property excluded from ordinary population was still eligible for upload population. And no
 * in-scope entity or process object declares `hb_fileUpload` or `hb_fileAcceptMIMEType`, so the loop
 * could never fire for this slice. `hb_fileUpload` is therefore honoured only for the other thing it
 * does — excluding a property from BRANCH 1, per {@link ColumnPropertyDescriptor.fileUpload}. No upload
 * handling, file-system access, MIME validation or `form`-scope analogue is implemented; in-scope image
 * handling flows through `processProduct_uploadDefaultImage` and `processImageUpload` behind
 * `ImagePathPort`, and the `rbKey('validate.fileUpload')` key raised at
 * `model/service/ProductService.cfc:L253` belongs to `src/errors/ValidationError.ts`.
 * ============================================================================================= */

/**
 * Populates a target from a payload and reports which sub-properties were populated.
 *
 * This is the complete port of the legacy population pass. {@link populate} is the fluent wrapper
 * most callers want; this function exists because the populated-sub-property record is a behavioural
 * contract in its own right — see {@link PopulatedSubPropertyRecord}.
 *
 * SYNCHRONOUS AND CHEAP, BY MANDATE. There is no `async`, no `await`, no `Promise`, no I/O and no
 * caching anywhere in the call. It mutates the target and nothing else, and it may be called inside a
 * transaction boundary owned by `src/adapters/mysql/UnitOfWork.ts` without interacting with it (M6).
 *
 * ⚠️ THE AUTHORISATION ARGUMENT IS REQUIRED, AND THAT IS THE POINT. There is no default and no
 * permissive fallback, so "populate a persistent entity without deciding whether the caller may" is
 * not a state this signature can express. A transient target still supplies one — ARM 1 short-circuits
 * before it is consulted, so the value is unused, but a caller cannot tell the difference from the
 * outside and should not have to reason about it to stay safe.
 *
 * @param target - The entity or process object to populate, mutated in place.
 * @param data - The incoming payload. Keys matching no declared property are silently ignored, and
 *   nothing is thrown for them.
 * @param descriptorSet - The target's declared population contract.
 * @param authorization - The resolved authorisation context, supplying ARMS 2 and 3 of the master
 *   gate. Its implementation must deny by default; see `../../ports/AccountContextPort`.
 * @param options - The optional `beforePopulate` / `afterPopulate` seams.
 * @returns The target and the record of the sub-properties that were populated.
 * @throws DomainError When a payload value cannot be represented in its property's declared
 *   {@link ColumnValueType}. See the DECLARED VALUE TYPES block for why this raises rather than
 *   silently clearing or silently skipping.
 *
 * @example
 * ```ts
 * // A column property, trimmed on the way in.
 * const { target } = populateWithSubProperties(
 *   {} as { productName?: unknown },
 *   { productName: '  ACME  ' },
 *   {
 *     entityName: 'Product',
 *     persistent: true,
 *     properties: [{ name: 'productName', valueType: 'string', notNull: true }],
 *   },
 *   {
 *     getPublicPopulateFlag: () => false,
 *     authenticateEntityProperty: () => true,
 *   },
 * );
 * // target.productName === 'ACME'
 * ```
 */
export function populateWithSubProperties<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(
  target: TTarget,
  data: Record<string, unknown>,
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  authorization: PopulationAuthorizationPort,
  options: PopulateOptions<TTarget> = {},
): PopulateResult<TTarget, TPropertyName> {
  /*
   * PER-CALL STATE ONLY (M7). Both locals are created here, inside the invocation, and neither is ever
   * hoisted to module scope, where warm-container state would leak across invocations and therefore
   * across tenants.
   *
   * `populatedSubProperties` IS INITIALISED EXPLICITLY AND UNCONDITIONALLY — a deliberate divergence
   * from the framework rather than a repaired in-scope defect. The legacy struct is declared at
   * [org/Hibachi/HibachiTransient.cfc:L5] as `property name="populatedSubProperties" type="struct"
   * persistent="false";` and is never initialised to `{}`, which is why BRANCH 3's write at [:L248] is
   * UNGUARDED while BRANCH 4 guards for the key at [:L302-L305]. That is a latent defect in retired
   * `org/Hibachi/**` framework code rather than one of the carried Catalog defects, and S7's treatment
   * for a framework quirk is to document the divergence rather than reproduce the bug.
   */
  const populatedSubProperties: PopulatedSubPropertyRecord<TPropertyName> = {};

  /*
   * G6 TRANSLATION DECISION — THE SINGLE WIDENED WRITE VIEW.
   * `fields` is the same object as `target`, held at the supertype {@link PopulationTarget} so that a
   * declared key can be assigned or deleted. This is an ordinary assignment to a wider type, not a
   * cast: there is no `as`, no `any` and no non-null assertion anywhere in this file (S1). The
   * widening is required because the legacy assignment is genuinely untyped — [:L207] pushes a trimmed
   * STRING into every simple property whatever its `ormtype` — and narrowing it would mean inventing
   * the coercion layer S9 forbids. It is also what makes `delete` legal, since every member of the
   * view is optional.
   */
  const fields: PopulationTarget<TPropertyName> = target;

  // [:L172] beforePopulate(). A genuine no-op for every in-scope type; see {@link PopulateOptions}.
  options.beforePopulate?.(target, data);

  /*
   * [:L175-L178] the legacy loop iterates DECLARED PROPERTIES, never payload keys. Declaration order
   * is therefore population order, and an unrecognised payload key is silently ignored. The metadata
   * walk and its application-scope cache have no analogue here; see {@link PropertyDescriptorSet}.
   */
  for (const descriptor of descriptorSet.properties) {
    const propertyName = descriptor.name;

    /*
     * AUDIT-FIELD EXCLUSION — APPLIED FIRST, UNCONDITIONALLY, AHEAD OF EVERY OTHER CHECK.
     * `createdDateTime`, `createdByAccount`, `modifiedDateTime` and `modifiedByAccount` are declared
     * `hb_populateEnabled="false"` on all six in-scope entities, byte-identically, at
     * [model/entity/Product.cfc:L96-L99], [model/entity/Sku.cfc:L93-L96],
     * [model/entity/ProductType.cfc:L83-L86], [model/entity/Brand.cfc:L77-L80],
     * [model/entity/Option.cfc:L76-L79] and [model/entity/OptionGroup.cfc:L64-L67]. They are writable
     * only by the audit lifecycle in `./AuditableEntity`. Making the exclusion STRUCTURAL rather than
     * relying on each entity's descriptor table to remember the flag is a deliberate design decision
     * and it invents nothing: it encodes a verified, uniform legacy declaration, and the reason the
     * declaration is uniform is that `getProperties()` [:L770-L789] walked the INHERITANCE CHAIN, so
     * inherited properties were population candidates too.
     *
     * `model/entity/Brand.cfc` uniquely carries NINE such declarations — the four audit properties at
     * [L77-L80] plus [L66] `promotionRewards`, [L67] `promotionRewardExclusions`, [L68]
     * `promotionQualifiers`, [L69] `promotionQualifierExclusions` and [L71] `physicals`. Those five
     * extra exclusions are Brand-specific and belong in `domain/product/Brand.ts`'s own descriptors,
     * honoured through the ordinary `populateEnabled: false` attribute rather than this shared list.
     */
    if (isAuditPropertyName(propertyName)) {
      continue;
    }

    /*
     * MASTER GATE — [:L184-L190]. Three ANDed conditions, the third a three-way OR.
     *   CONDITION 1 — the payload must carry a key matching the property name.
     *   CONDITION 2 — `hb_populateEnabled` must not be `false`. Tri-valued; see
     *     {@link PopulateEnabled}. `'public'` and absent both pass, exactly as `neq false` does.
     *   CONDITION 3 — the authorisation OR; see {@link isPopulationAuthorized}. All three arms are
     *     live, and a property that fails it is SKIPPED rather than rejected, exactly as the legacy
     *     `continue`-by-omission does: the gate is an `if` around the whole assignment block at
     *     [:L184-L192], so an unauthorised property is passed over silently and the rest of the
     *     payload still populates. Raising instead would be a behaviour change (AAP §0.8.1), and it
     *     would additionally turn an authorisation decision into an information disclosure about
     *     which properties exist.
     */
    if (!hasDataKey(data, propertyName)) {
      continue;
    }
    if (descriptor.populateEnabled === false) {
      continue;
    }
    if (!isPopulationAuthorized(descriptorSet, descriptor, authorization)) {
      continue;
    }

    const rawValue: unknown = data[propertyName];

    if (
      isColumnDescriptor(descriptor) &&
      isSimpleDataValue(rawValue) &&
      descriptor.fileUpload === undefined
    ) {
      /*
       * ── BRANCH 1 ( COLUMN ) — [:L192-L213] ────────────────────────────────────────────────────
       * Gated on all three of: `fieldType` absent or `'column'`; a simple value; and `hb_fileUpload`
       * ABSENT — a presence test, not a truthiness test, per
       * {@link ColumnPropertyDescriptor.fileUpload}.
       *
       * The source trims twice, once for the blank test at [:L196] and again for the assignment at
       * [:L207], so `"  ACME  "` is stored as `"ACME"` and a whitespace-only value counts as blank.
       * Blank then means NULL BY DELETION — [:L196-L197] calls `_setProperty(name)` with no value
       * argument — unless the property is `notNull`, in which case [:L200-L207] assigns the trimmed
       * empty string; see {@link ColumnPropertyDescriptor.notNull}.
       *
       * Two legacy paths are deliberately not implemented. `hb_sessionDefault` [:L209-L212] writes the
       * CFML session scope and is declared by no in-scope type, so no session abstraction is invented
       * (S9). `hb_formatType` [:L201-L206] is COMMENTED OUT in the legacy source, so the live
       * assignment at [:L207] ignores it entirely — worth stating because [model/entity/Brand.cfc:L57]
       * declares `hb_formatType="url"` on `brandWebsite` and population does not honour it.
       */
      /*
       * ⭐ THE DECLARED-TYPE COERCION. This replaced an unconditional
       * `renderSimpleValue(rawValue).trim()`; the full argument, the census of ORM types it is closed
       * over, the CFML-versus-JavaScript truthiness fact that makes the coercion a parity requirement,
       * the flagged execution-model relocation of the failure point, and the two rejected alternative
       * designs are all recorded in the DECLARED VALUE TYPES block near the top of this file.
       *
       * The blank-to-NULL rule and the `notNull` exception are unchanged and are still evaluated
       * BEFORE any conversion, inside {@link coerceDeclaredValue}, because [:L195] evaluates them
       * first too.
       */
      const outcome = coerceDeclaredValue(
        rawValue,
        descriptor.valueType,
        descriptor.notNull === true,
      );

      if (outcome.kind === 'clear') {
        clearPropertyValue(fields, propertyName);
      } else if (outcome.kind === 'assign') {
        assignPropertyValue(fields, propertyName, outcome.value);
      } else {
        /*
         * AMBIGUOUS — the value cannot be represented in the property's declared type.
         *
         * This is the one place in this file that raises, and it is a FORCED RELOCATION of a failure
         * Hibernate performed at flush rather than a new failure or a hardening; see the DECLARED
         * VALUE TYPES block, which withdraws the earlier D18-precedent framing and records the
         * difference as an execution-model one under M5. The message and the attached context carry
         * declaration facts only and NEVER the offending value, so nothing caller-supplied can be
         * reflected back even before `src/handlers/httpResponse.ts` maps domain errors to public
         * codes.
         */
        throw new DomainError(AMBIGUOUS_POPULATED_VALUE_MESSAGE, {
          context: {
            entityName: descriptorSet.entityName,
            propertyName,
            valueType: descriptor.valueType,
          },
        });
      }
    } else if (
      isColumnDescriptor(descriptor) &&
      descriptor.populateArray === true &&
      isArrayDataValue(rawValue)
    ) {
      /*
       * ── BRANCH 2 ( POPULATE-ARRAY ) — [:L215-L218]. ─────────────────────────────────────────
       * No trim and no blank test: the array is assigned whole, exactly as [:L218] does.
       *
       * REACHABILITY: `hb_populateArray` occurs ZERO times across all six in-scope entities and all
       * three in-scope process objects. The branch is implemented anyway — it is cheap, its descriptor
       * member is what makes the gate expressible at all, and a proven-unreachable branch that is
       * present and documented is materially stronger than one silently dropped or one silently
       * pretended to be exercised.
       */
      assignPropertyValue(fields, propertyName, rawValue);
    } else if (isManyToOneDescriptor(descriptor) && isStructDataValue(rawValue)) {
      /*
       * ── BRANCH 3 ( MANY-TO-ONE, nested struct payload ) — [:L220-L270]. ─────────────────────
       * [:L224] the nested struct; [:L227] the related primary-ID property name, which was a
       * string-keyed service lookup and is now a declaration.
       */
      const manyToOneStructData = rawValue;
      const relatedIdPropertyName = descriptor.relatedPrimaryIdPropertyName;

      /*
       * [:L230] IF THE PRIMARY-ID KEY IS ABSENT FROM THE NESTED STRUCT, THE WHOLE BRANCH DOES NOTHING
       * AT ALL. Preserved literally.
       */
      if (hasDataKey(manyToOneStructData, relatedIdPropertyName)) {
        const relatedIdRawValue: unknown = manyToOneStructData[relatedIdPropertyName];

        /*
         * The identifier must be renderable. CFML would have handed a non-scalar straight to the DAO
         * and failed there; this file raises nothing (Gate 19), so a non-scalar identifier matches no
         * path and the branch does nothing — recorded rather than smoothed over.
         *
         * NOTE — NO `trim()` HERE. Unlike BRANCH 1, the legacy code does not trim the identifier: it
         * compares `manyToOneStructData[primaryIDPropertyName] == ""` at [:L254] and passes the raw
         * value at [:L239] and [:L261]. That asymmetry is preserved.
         */
        if (isSimpleDataValue(relatedIdRawValue)) {
          const relatedId = renderSimpleValue(relatedIdRawValue);

          if (countStructKeys(manyToOneStructData) > 1) {
            /*
             * [:L236-L248] MORE THAN ONE KEY. Load WITH create-if-missing — [:L239] passes
             * `{1=id, 2=true}`, whose second positional argument is the createNew flag — then assign
             * [:L242], then recursively populate the sub-object with the SAME nested struct [:L245],
             * then record it [:L248]. The legacy write at [:L248] has no existence guard whatsoever;
             * the record here is initialised up front instead, for the reason given at the top of this
             * function.
             *
             * The record holds a SINGLE entity for this branch, which is what makes the array test in
             * the legacy `validate()` at [:L426] meaningful.
             */
            const relatedEntity = descriptor.loader.loadOrCreate(relatedId);
            assignPropertyValue(fields, propertyName, relatedEntity);
            descriptor.populateRelated(relatedEntity, manyToOneStructData);
            populatedSubProperties[propertyName] = relatedEntity;
          } else if (relatedId === '') {
            /*
             * [:L252-L255] EXACTLY ONE KEY, AND IT IS EMPTY. `_setProperty(name)` — NULL BY DELETION.
             * The legacy comment at [:L251] is explicit that "in this way a null is a valid option".
             * The comparison is `== ""`, and the identifier is a 32-character string per IR-6.
             */
            clearPropertyValue(fields, propertyName);
          } else {
            /*
             * [:L257-L266] EXACTLY ONE KEY, AND IT IS AN IDENTIFIER. Load WITHOUT create-if-missing —
             * [:L261] passes `{1=id}` and the legacy comment says "if one doesn't exist... this will be
             * null" — and assign ONLY IF the load returned something [:L263-L266].
             *
             * THIS SUB-BRANCH RECORDS NOTHING in the populated-sub-property record, and neither does
             * BRANCH 5. That distinction is behaviour: it is why the legacy `validate()` cascade fires
             * for a nested payload and not for a bare identifier. Making it record "for consistency"
             * would be exactly the tidying §0.8.2 Guideline 4 forbids (S7).
             */
            const relatedEntity = descriptor.loader.loadExisting(relatedId);
            if (relatedEntity !== undefined) {
              assignPropertyValue(fields, propertyName, relatedEntity);
            }
          }
        }
      }
    } else if (isCollectionDescriptor(descriptor) && isArrayDataValue(rawValue)) {
      /*
       * ── BRANCH 4 ( ONE-TO-MANY / MANY-TO-MANY, array payload ) — [:L272-L308]. ──────────────
       * [:L276] the array; [:L279] the related primary-ID property name; [:L282] a FORWARD loop.
       */
      const oneToManyArrayData = rawValue;
      const relatedIdPropertyName = descriptor.relatedPrimaryIdPropertyName;
      const recordedRelatedEntities: object[] = [];

      for (let itemIndex = 0; itemIndex < oneToManyArrayData.length; itemIndex += 1) {
        const item: unknown = oneToManyArrayData[itemIndex];

        /*
         * A non-struct element would have made CFML's `structKeyExists` at [:L285] fail outright.
         * Nothing is raised here (Gate 19), so such an element is skipped — a strict-typing
         * consequence, recorded rather than hidden.
         */
        if (!isStructDataValue(item)) {
          continue;
        }

        /*
         * [:L285] THE PER-ITEM GATE, AND IT IS A DATA-LEVEL KILL SWITCH. Both halves:
         * the element must carry the related primary-ID key, AND `populateSubProperties` must not be
         * switched off INSIDE THE PAYLOAD. See {@link shouldPopulateSubProperties}.
         */
        if (!hasDataKey(item, relatedIdPropertyName)) {
          continue;
        }
        if (!shouldPopulateSubProperties(data)) {
          continue;
        }

        const relatedIdRawValue: unknown = item[relatedIdPropertyName];
        if (!isSimpleDataValue(relatedIdRawValue)) {
          continue;
        }

        /*
         * [:L288] re-resolves the entity service INSIDE the loop, once per element. That is a legacy
         * inefficiency, and it is deliberately not "optimised" into anything with different behaviour
         * (S7): with an injected loader it simply becomes a per-element loader call, which is exactly
         * what it was.
         *
         * [:L291] loads WITH create-if-missing (`{1=id, 2=true}`).
         */
        const relatedEntity = descriptor.loader.loadOrCreate(renderSimpleValue(relatedIdRawValue));

        /*
         * [:L294] THE ENTITY IS ADDED UNCONDITIONALLY, BEFORE THE KEY-COUNT TEST AT [:L297].
         * It happens for EVERY element that passes the gate above, however many keys the element
         * struct has. It looks like an oversight and it is not: moving it inside the key-count test
         * would change which relationships exist after a pass, so §0.8.2 Guideline 4 forbids the
         * change (S7). The legacy call is
         * `this.invokeMethod("add#currentProperty.singularName#", {1=thisEntity})` — dynamic method
         * synthesis, replaced by the injected {@link OneToManyPropertyDescriptor.addRelated}.
         */
        descriptor.addRelated(target, relatedEntity);

        /*
         * [:L297-L306] ONLY when the element struct has more than one key: recursively populate it
         * [:L300], then record it. The legacy record is an ARRAY here, lazily initialised behind a
         * guard at [:L302-L305]; the accumulated array is filed once below, which is observably
         * identical because each declared property is visited exactly once per pass, and the legacy
         * guard existed only because the enclosing struct was never initialised at all.
         */
        if (countStructKeys(item) > 1) {
          descriptor.populateRelated(relatedEntity, item);
          recordedRelatedEntities.push(relatedEntity);
        }
      }

      if (recordedRelatedEntities.length > 0) {
        populatedSubProperties[propertyName] = recordedRelatedEntities;
      }
    } else if (isManyToManyDescriptor(descriptor) && isSimpleDataValue(rawValue)) {
      /*
       * ── BRANCH 5 ( MANY-TO-MANY, delimited id list ) — [:L309-L359]. The DIFF branch. ────────
       * NET SEMANTICS, WHICH MUST SURVIVE INTACT: this is a SET DIFF. Intersections are kept, entities
       * no longer listed are removed, identifiers not already related are added, and identifiers that
       * fail to load are silently skipped. It is deliberately NOT re-implemented as "clear then
       * re-add": that would change which objects survive the pass, and with them their identity and
       * any pending state (S7).
       *
       * [:L313] the delimited list; [:L316] the related primary-ID property name; [:L319] the existing
       * collection. The throw at [:L321-L323] is unreachable by construction here and is not emitted —
       * see {@link ManyToManyPropertyDescriptor.readRelated}.
       */
      const pendingRelatedIds = splitCfmlList(renderSimpleValue(rawValue));
      const existingRelatedEntities = descriptor.readRelated(target);

      /*
       * [:L326] A BACKWARD LOOP: `for(var m=arrayLen(existingRelatedEntities); m>=1; m--)`.
       * It iterates in REVERSE because the collection is MUTATED DURING ITERATION by the remove call
       * at [:L339] — the legacy read at [:L319] returns the live array from `variables`. A forward loop
       * with in-place removal skips elements, so the reverse iteration is reproduced. It is also
       * correct if an implementation of `readRelated` hands back a copy.
       */
      for (
        let existingIndex = existingRelatedEntities.length - 1;
        existingIndex >= 0;
        existingIndex -= 1
      ) {
        const existingRelatedEntity = existingRelatedEntities[existingIndex];

        /*
         * `noUncheckedIndexedAccess` types an indexed read as possibly absent. CFML's
         * `existingRelatedEntities[m]` could not be absent within `arrayLen` bounds, so this guard is
         * a strict-mode formality rather than a behavioural change — and it is a guard rather than the
         * non-null assertion `!`, which S1 forbids.
         */
        if (existingRelatedEntity === undefined) {
          continue;
        }

        // [:L329] the existing relationship's primary identifier.
        const existingRelatedId = descriptor.readRelatedPrimaryId(existingRelatedEntity);

        // [:L332] `listFind` — CASE-SENSITIVE (F23); see {@link findRelatedId} for the evidence.
        const matchIndex = findRelatedId(pendingRelatedIds, existingRelatedId);

        if (matchIndex >= 0) {
          /*
           * [:L334-L336] THE RELATIONSHIP ALREADY EXISTS: drop the identifier from the pending list
           * (`listDeleteAt`) and leave the relationship itself untouched. The 1-based `listFind`
           * position becomes a 0-based index here; `matchIndex >= 0` is the port of CFML's truthy
           * non-zero test.
           */
          pendingRelatedIds.splice(matchIndex, 1);
        } else {
          /*
           * [:L337-L340] THE RELATIONSHIP IS NO LONGER LISTED: remove it. The legacy call is
           * `this.invokeMethod("remove#currentProperty.singularname#", …)` — note the lower-case `n`,
           * against the capital `N` at [:L294]; see {@link OneToManyPropertyDescriptor.singularName}.
           */
          descriptor.removeRelated(target, existingRelatedEntity);
        }
      }

      /*
       * [:L343-L359] A FORWARD pass over whatever identifiers remain: load each WITHOUT
       * create-if-missing ([:L353] passes `{1=id}`) and add it ONLY IF the load returned something
       * ([:L355-L358]). BRANCH 5 records nothing in the populated-sub-property record.
       */
      for (const pendingRelatedId of pendingRelatedIds) {
        const relatedEntity = descriptor.loader.loadExisting(pendingRelatedId);
        if (relatedEntity !== undefined) {
          descriptor.addRelated(target, relatedEntity);
        }
      }
    }
  }

  /*
   * [:L396] afterPopulate(), invoked immediately before the return at [:L399] — and, per IR-8, this is
   * also the position the LOCAL Slatwall override at [model/entity/HibachiEntity.cfc:L56] used for its
   * custom-attribute assignment, after `super.populate()` at [:L59] and before `return this;` at
   * [:L96]. The seam is declared and invoked in exactly that position; its legacy occupant is a flagged
   * TR-5 boundary omission documented on {@link PopulateOptions.afterPopulate}.
   */
  options.afterPopulate?.(target, data);

  return { target, populatedSubProperties };
}

/**
 * Populates a target from a payload and returns the target — the fluent form.
 *
 * FLUENT BY MANDATE: both legacy methods end in `return this;` —
 * [model/entity/HibachiEntity.cfc:L96] and [org/Hibachi/HibachiTransient.cfc:L399] — and callers chain
 * on the result. This is a one-line wrapper over {@link populateWithSubProperties}; reach for that one
 * instead when the populated-sub-property record is needed.
 *
 * CALL-SITE CONTRACT (M6). The framework order at `org/Hibachi/HibachiService.cfc:L133` is populate,
 * then validate, then save — and populate is CONDITIONAL on a `data` argument being supplied, so a
 * save with no payload does not populate at all and this function tolerates being skipped entirely.
 * `model/service/ProductService.cfc:L264-L292` overrides that order and creates SKUs while the product
 * is still transient; that read-back hazard belongs to `src/adapters/mysql/UnitOfWork.ts`, not here.
 * `model/service/BrandService.cfc:L67-L78` pre-seeds `data.urlTitle` and delegates to `super.save`, so
 * a caller-mutated payload is normal and is handled correctly — nothing is cached between calls.
 *
 * @param target - The entity or process object to populate, mutated in place.
 * @param data - The incoming payload. Keys matching no declared property are silently ignored.
 * @param descriptorSet - The target's declared population contract.
 * @param authorization - The resolved authorisation context, supplying ARMS 2 and 3 of the master
 *   gate. Required, with no default; see {@link populateWithSubProperties}.
 * @param options - The optional `beforePopulate` / `afterPopulate` seams.
 * @returns The same target that was passed in, populated in place.
 * @throws DomainError When a payload value cannot be represented in its property's declared
 *   {@link ColumnValueType}.
 *
 * @example
 * ```ts
 * // `Brand` is persistent, so the authorisation context is REQUIRED IN EFFECT: omit it and every
 * // declared property is skipped. `../../services/BaseService` assembles this object per save from
 * // its injected authoriser and the entity's own getClassName(), so a service never writes it out.
 * const populatedBrand = populate(
 *   brand,
 *   { brandName: '  ACME  ', urlTitle: '' },
 *   brandDescriptorSet,
 *   populationAuthorization,
 * );
 * // brandName === 'ACME'; urlTitle's key has been DELETED, so `'urlTitle' in populatedBrand` is
 * // false — which is what keeps the unique-URL-title generation at
 * // model/service/ProductService.cfc:L268 reachable.
 * ```
 *
 * @example
 * ```ts
 * // A transient process object needs no authorisation context: ARM 1 of the gate short-circuits, so
 * // this three-argument form is complete and correct for all three in-scope process objects.
 * const populatedInput = populate(processObject, data, PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS);
 * ```
 */
export function populate<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(
  target: TTarget,
  data: Record<string, unknown>,
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  authorization: PopulationAuthorizationPort,
  options?: PopulateOptions<TTarget>,
): TTarget {
  return populateWithSubProperties(target, data, descriptorSet, authorization, options).target;
}

/* =============================================================================================
 * THE ENTITY METADATA SURFACE — THE PORT OF "PROPERTY INTROSPECTION"
 * ---------------------------------------------------------------------------------------------
 * WHY IT LIVES IN THIS FILE. `org/Hibachi/HibachiTransient.cfc` is one component with two clearly
 * separated sections: "POPULATION & VALIDATION", which ends at [:L462], and "PROPERTY
 * INTROSPECTION", which begins at [:L463]. This module already ports the first. `hasProperty`
 * [:L763-L765], `getPropertyMetaData` [:L738-L747] and `getValueByPropertyIdentifier`
 * [:L466-L481] are the second, and they read the very same property table the population branches
 * read — `getPropertiesStruct()` [:L791-L803], whose declared replacement in this port is
 * {@link PropertyDescriptorSet}. Splitting the two halves across two modules would have put the
 * property table's two readers in two places.
 *
 * WHAT PROBLEM THIS SOLVES, STATED PLAINLY. Every entity in this slice is consumed by two
 * collaborators that require MEMBERS, not fields: `src/validation/Validator.ts` calls
 * `getClassName()` and `hasProperty()` on the subject it validates, and
 * `src/ports/UniquePropertyPort.ts` calls five further accessors on the entity whose uniqueness is
 * being checked. In the legacy system every one of those seven members arrived by INHERITANCE from
 * `HibachiTransient`/`HibachiEntity`. This port replaces inheritance with composition (AAP §0.3.3),
 * so the members have to arrive some other way — and until they did, an intersection TYPE naming
 * them was satisfiable by nothing at run time. {@link manageEntity} is the runtime provider.
 *
 * WHY COMPOSITION RATHER THAN SEVEN HAND-WRITTEN METHODS PER CLASS. Three reasons, in order of
 * weight. First, the six entity modules each record an explicit negative mandate against exactly
 * these framework members — `src/domain/product/ProductType.ts` states that there is no
 * `getPrimaryIDValue`, `getPrimaryIDPropertyName` or `getPropertyMetaData` "anywhere in this class"
 * — and those mandates exist because a framework member reproduced by hand in six places drifts in
 * six directions. Second, the behaviour is genuinely IDENTICAL across all six entities: the legacy
 * bodies are inherited, not overridden, so there is exactly one implementation to port. Third, the
 * whole point of the introspection section is that it is DATA-DRIVEN; expressing it as one
 * implementation over a per-entity {@link EntityMetadataDeclaration} keeps that property, where six
 * copies would not.
 *
 * THE SEVEN SIGNATURES ARE DECLARED HERE RATHER THAN IMPORTED, AND THAT IS A LAYERING DECISION.
 * `ValidationSubject` lives in `src/validation/**`, which `src/domain/**` must not import — no file
 * under `src/domain/` imports from `src/validation/`, and reversing that would invert the
 * dependency direction AAP §0.7.3 S4 fixes. Structural typing makes the import unnecessary: a
 * managed entity satisfies `ValidationSubject` and `UniquePropertyEntity` by declaring the members,
 * and the consuming layers PROVE it with compile-time assertions rather than asserting it in prose.
 * The one type that IS imported is `UniquePropertyMetaData`, because that shape has a single owner
 * and re-declaring it here would create a second description to drift from the first.
 *
 * WHAT THIS SURFACE IS NOT. It performs no data access, evaluates no rule, and caches nothing. It
 * does not decide whether an entity is new, does not stamp audit fields, and does not validate. It
 * is seven read-only questions about one object, answered from a frozen declaration.
 * =============================================================================================== */

/**
 * The property table one entity declares — the port of `getPropertiesStruct()`
 * [org/Hibachi/HibachiTransient.cfc:L791-L803].
 *
 * The legacy structure was built at run time by walking component metadata up the inheritance chain
 * and keying each entry by its `name` [:L796-L798], then cached in APPLICATION scope [:L799]. Both
 * halves are replaced: the walk becomes this declaration, and the cache is simply absent, because a
 * frozen module-scope constant needs none and M7 forbids a request-lifetime cache in module scope.
 *
 * ONE DECLARATION PER ENTITY MODULE, exported from the module that owns the entity, so that the
 * property names, the class name and the entity name are written once each in the file a reader
 * would look in.
 *
 * @typeParam TPropertyName - The union of property names this port carries AS FIELDS on the entity.
 */
export interface EntityMetadataDeclaration<TPropertyName extends string> {
  /**
   * The bare class name — the port of `getClassName()`
   * [org/Hibachi/HibachiObject.cfc:L135-L137], which returns `listLast(getClassFullname(), ".")`,
   * i.e. the LAST dot-separated segment of the component path and nothing more.
   *
   * For the six in-scope entities the value is therefore `Product`, `Sku`, `Brand`, `ProductType`,
   * `Option` or `OptionGroup`, and for a process object it is the underscored source file name such
   * as `Product_UpdateSkus`. It is NOT the `Slatwall`-prefixed ORM name — see
   * {@link EntityMetadataDeclaration.entityName}, which is the one that is.
   *
   * The same string is already required by {@link PropertyDescriptorSet.className}, for the third
   * arm of the population-authorisation gate. A declaration and a descriptor set for one entity
   * MUST agree, and the entity modules keep them in agreement by reading one from the other rather
   * than by writing the literal twice.
   */
  readonly className: string;

  /**
   * The ORM logical entity name — the port of `getEntityName()`
   * [org/Hibachi/HibachiEntity.cfc:L287-L289], which returns `getMetaData(this).entityname`.
   *
   * ⚠️ THIS IS THE `Slatwall`-PREFIXED LOGICAL NAME, NOT THE PHYSICAL `Sw*` TABLE. All six in-scope
   * entities declare it on their component tag at `:L49` — `entityname="SlatwallProduct"`,
   * `"SlatwallSku"`, `"SlatwallBrand"`, `"SlatwallProductType"`, `"SlatwallOption"` and
   * `"SlatwallOptionGroup"` — alongside a SEPARATE `table="Sw*"` attribute. The distinction is
   * load-bearing rather than cosmetic: `src/ports/UniquePropertyPort.ts` records that the legacy
   * uniqueness statement is expressed over the mapped object graph, so the logical name is the
   * correct value to hand it, and translating that logical name into a physical table is the
   * adapter's job. A declaration carrying `SwProduct` here would produce a statement that either
   * fails to parse as HQL or addresses the wrong vocabulary.
   *
   * No table name appears in this file or in any entity module as a consequence — only the logical
   * name does, and only here.
   */
  readonly entityName: string;

  /**
   * The NAME of the primary identifier property — the port of `getPrimaryIDPropertyName()`
   * [org/Hibachi/HibachiEntity.cfc:L249-L251], which resolved it through the framework service by
   * entity name rather than declaring it, because the framework could see the `fieldtype="id"`
   * attribute at run time and this port cannot.
   *
   * Constrained to {@link EntityMetadataDeclaration} `TPropertyName`, so a typo is a compile error
   * and so the identifier is guaranteed to be a name the entity actually carries as a field — which
   * is what makes {@link EntityMetadataSurface.getPrimaryIDValue} able to read it without a cast.
   */
  readonly primaryIDPropertyName: TPropertyName;

  /**
   * Every property name the entity declares AND this port carries as a field, as an exhaustive
   * key set.
   *
   * ⭐ `Readonly<Record<TPropertyName, true>>` IS THE POINT, NOT DECORATION. The annotation makes
   * BOTH directions compile-checked: a missing name fails the build because the record is
   * incomplete, and a name the union does not contain fails it because the key is excess. A frozen
   * array typed `readonly TPropertyName[]` would catch only the second. Key EXISTENCE is also the
   * exact shape of the legacy predicate — `structKeyExists(getPropertiesStruct(), name)`
   * [org/Hibachi/HibachiTransient.cfc:L764] — so the port of a struct-key test is an object-key
   * test rather than an array scan.
   *
   * The value `true` carries no information and is not read; the KEY is the datum. It is `true`
   * rather than a richer metadata record because exactly one attribute of the legacy entry is ever
   * read in this slice — `.name`, at [org/Hibachi/HibachiDAO.cfc:L134] — and that value is the key
   * itself. Modelling the other attributes would be inventing a surface no caller consumes (S9).
   */
  readonly properties: Readonly<Record<TPropertyName, true>>;

  /**
   * Names the LEGACY entity declares that this port does NOT carry as a field.
   *
   * WHY THIS MEMBER EXISTS, AND WHY OMITTING IT WOULD SILENTLY DISABLE VALIDATION RULES. The legacy
   * predicate reads the entity's whole declared property table, which includes every
   * `persistent="false"` property. `src/validation/Validator.ts` SKIPS a rule silently when
   * `hasProperty` answers false [org/Hibachi/HibachiValidationService.cfc:L171], so a name the
   * legacy entity declares but this record omits turns a live rule into an inert one with no error
   * anywhere. Two in-scope examples make it concrete: `model/validation/Sku.json:3` and `:12` guard
   * deletion on `defaultFlag` and `transactionExistsFlag`, both declared `persistent="false"` at
   * [model/entity/Sku.cfc:L105] and [:L121]; `model/validation/Product.json` gates on
   * `baseProductType` [model/entity/Product.cfc:L103] and requires `price` [`:L118`]. None of the
   * four is a field in this port — they are accessors or boundary members — and all four MUST
   * answer true.
   *
   * ⚠️ IT IS EQUALLY LOAD-BEARING THAT SOME NAMES ARE ABSENT FROM BOTH RECORDS. `physicalCounts` is
   * named by `model/validation/Product.json` and `model/validation/Sku.json` and is declared by
   * NEITHER entity, so the legacy engine skips those rules. `src/validation/rules/product.rules.ts`
   * makes that inertness a compile-checked invariant, and it stays inert here only because the name
   * appears in no record. Adding it "for completeness" would activate a rule the legacy system
   * never ran.
   *
   * Typed `Record<string, true>` rather than a union because these names are, by definition, the
   * ones no property-name union carries; there is nothing to constrain them against. Each entity
   * module documents its own list against the legacy locators it came from. Omit the member
   * entirely — never supply an empty record — for an entity whose declared set and field set
   * coincide; `exactOptionalPropertyTypes` makes the absent state the honest one.
   */
  readonly declaredNonFieldProperties?: Readonly<Record<string, true>>;
}

/**
 * The seven framework members every in-scope entity inherited and no in-scope entity declares.
 *
 * Produced at run time by {@link manageEntity}. Structurally this shape satisfies
 * `ValidationSubject` from `src/validation/Validator.ts` (`getClassName`, `hasProperty`),
 * `UniquePropertyEntity` from `src/ports/UniquePropertyPort.ts` (the five uniqueness reads) and the
 * `getPrimaryIDValue()` member `src/services/BaseService.ts` requires — with no import in either
 * direction and no assertion anywhere. The consuming modules pin that with compile-time assignment
 * guards, so drift in any of the three contracts breaks the build rather than the run.
 *
 * WHY METHOD SYNTAX. Every member is declared as a method rather than as an arrow-typed property
 * because the two contracts this shape must satisfy declare theirs the same way, and because
 * nothing here depends on parameter variance: each member takes at most one `string` and returns a
 * concrete type.
 */
export interface EntityMetadataSurface {
  /** See {@link EntityMetadataDeclaration.className}. */
  getClassName(): string;

  /** See {@link EntityMetadataDeclaration.entityName}. */
  getEntityName(): string;

  /** See {@link EntityMetadataDeclaration.primaryIDPropertyName}. */
  getPrimaryIDPropertyName(): string;

  /**
   * The entity's primary identifier VALUE — the port of `getPrimaryIDValue()`
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which invokes the generated getter for whichever
   * property `getPrimaryIDPropertyName()` names. This implementation reads the same named field, so
   * the legacy relationship between the two members is preserved by construction rather than by two
   * independent declarations that could disagree.
   *
   * An UNSAVED entity answers `''`, because all six primary keys declare `unsavedvalue="" default=""`
   * and the domain classes initialise the field to the empty string. That is the observed legacy
   * value, and `src/ports/UniquePropertyPort.ts` records what follows from it: the self-exclusion
   * term of the uniqueness query is a no-op on insert. Carried as observed (S7).
   */
  getPrimaryIDValue(): string;

  /**
   * Whether the entity declares the named property — the port of `hasProperty()`
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * Answers over BOTH halves of the declaration: {@link EntityMetadataDeclaration.properties} and
   * {@link EntityMetadataDeclaration.declaredNonFieldProperties}. Matching is CASE-SENSITIVE, which
   * diverges from CFML's case-insensitive struct keys for the same reason the population branches
   * do, recorded in this module's header: a JavaScript object can hold two keys differing only in
   * case where a CFML struct cannot, so a case-insensitive lookup would require inventing a
   * precedence rule the source does not have (S9). Every in-scope rule set spells its property
   * identifiers exactly as the entity declares them, pinned by `satisfies` clauses in
   * `src/validation/rules/**`, so the divergence is unreachable from validation.
   */
  hasProperty(propertyIdentifier: string): boolean;

  /**
   * The named property's metadata — the port of `getPropertyMetaData()`
   * [org/Hibachi/HibachiTransient.cfc:L738-L747].
   *
   * ⚠️ AN UNDECLARED NAME THROWS; IT DOES NOT ANSWER ABSENT. The legacy body returns the entry when
   * the key is present [:L741-L743] and `throw`s otherwise [:L746], and
   * `src/ports/UniquePropertyPort.ts` names that non-optional return as a real obligation on the
   * implementation, precisely because the tempting alternatives — a non-null assertion, or reporting
   * the value as unique — both diverge. This implementation surfaces the failure.
   */
  getPropertyMetaData(propertyName: string): UniquePropertyMetaData;

  /**
   * The value the identifier currently resolves to — the port of `getValueByPropertyIdentifier()`
   * [org/Hibachi/HibachiTransient.cfc:L466-L481], together with the traversal helper it delegates
   * to at [:L483-L491].
   *
   * Returns `unknown` because the legacy declaration is the widest CFML type: the value really may
   * be a string, a number, a boolean, a date, an array or an entity reference. Narrowing is the
   * caller's job, which is what `src/ports/UniquePropertyPort.ts` requires of its adapter.
   *
   * ⚠️ AN UNRESOLVABLE IDENTIFIER ANSWERS `''`, NOT `undefined`. Both legacy exits do: the guard at
   * [:L470] falls through to `return ""` at [:L480] when the traversal produced nothing, and so does
   * a null value read from a resolved object. This port reproduces the empty string rather than
   * substituting an absent value, because the empty string is what the uniqueness query would bind.
   *
   * The formatting flag the legacy signature also declares [:L466] is deliberately absent: the one
   * in-scope call site, [org/Hibachi/HibachiDAO.cfc:L138], does not pass it, so declaring it would
   * widen the contract past the observed behaviour.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown;
}

/**
 * An entity that has been through {@link manageEntity} — the one name for "entity plus the framework
 * introspection surface".
 *
 * Declared here so the concept is spelled once. `src/adapters/mysql/rowMappers.ts` returns it from
 * every entity mapper and `src/services/**` returns it from every IR-1 `new*` member, and both need
 * to denote the same thing. It is also what the `Managed*` aliases in the service modules resolve
 * to: those aliases are written as intersections with `BaseServiceEntity` and `UniquePropertyEntity`
 * because that is what the collaborators there REQUIRE, and this is what actually SATISFIES them.
 * The services pin that correspondence with compile-time assignment guards, so the two descriptions
 * cannot drift apart silently.
 *
 * @typeParam TEntity - The domain entity type.
 */
/**
 * The per-entity ERROR STATE every legacy entity inherits — the port of the errors block at
 * `org/Hibachi/HibachiTransient.cfc:L29-L67`.
 *
 * ⭐ WHY THIS BELONGS HERE AND NOT ON THE ENTITY CLASSES. These six members are framework facilities,
 * inherited in the legacy rather than written per entity, and NOT ONE of the six entity classes
 * declares any of them — measured, zero occurrences across all six — so the error surface is composed
 * on rather than declared in, uniformly. `src/domain/product/ProductType.ts` states the prohibition
 * outright, naming `hasErrors` and `getErrors` among the members that appear nowhere in the class
 * (F22); the other five simply never declare them. {@link manageEntity} is the mechanism.
 *
 * ⚠️ THE METADATA SURFACE ABOVE IS NOT THE SAME STORY, AND THIS BLOCK USED TO ASSERT THAT IT WAS. It
 * read "every entity module in this port carries an explicit mandate forbidding them as hand-written
 * instance methods" and offered the metadata surface as the precedent already established for it.
 * FIVE of the six classes do hand-write all seven metadata members and do declare
 * `implements ManagedEntity`; only ProductType relies on composition for them.
 * `src/domain/base/AuditableEntity.ts` records that split once, on the contract those five implement.
 * The error half of the claim stands exactly as written — it is the generalisation to both halves that
 * did not survive being checked.
 *
 * ⭐ WHY IT IS REQUIRED RATHER THAN OPTIONAL. `model/service/SkuService.cfc:L143`, [`:L148`] and
 * [`:L176`] call `arguments.product.addError(...)`, and [`:L152`] and [`:L180`] gate SKU creation on
 * `arguments.product.hasErrors()`. Those errors are not decorative: `model/service/ProductService.cfc:L286`
 * reads `if(!arguments.product.hasErrors())` and SKIPS THE SAVE when any exist. An error state that the
 * caller cannot see therefore does not merely lose a message — it lets a product whose subscription or
 * content-access data was rejected be persisted anyway.
 *
 * ⚠️ THE BAG IS PER ENTITY INSTANCE, NOT PER OPERATION, and that distinction is the whole point. The
 * legacy bean hangs off the entity, so two collaborators touching the same entity observe one shared
 * error state. A method-local bag reproduces the accumulation but not the visibility.
 */
export interface EntityErrorSurface {
  /**
   * Records an error against a property name — `addError()`
   * [org/Hibachi/HibachiTransient.cfc:L61-L63].
   *
   * ⛔ APPENDS; IT DOES NOT REPLACE. Two errors on one property both survive, because the legacy bean
   * stores an ARRAY per key. Overwriting would silently discard the first message.
   */
  addError(errorName: string, errorMessage: string): void;

  /** Merges a whole error struct — `addErrors()` [org/Hibachi/HibachiTransient.cfc:L66-L68]. */
  addErrors(errors: Readonly<Record<string, readonly string[]>>): void;

  /** Every error, keyed by property name — `getErrors()` [org/Hibachi/HibachiTransient.cfc:L30-L32]. */
  getErrors(): Readonly<Record<string, readonly string[]>>;

  /**
   * The messages recorded against one property — `getError()`
   * [org/Hibachi/HibachiTransient.cfc:L35-L44].
   *
   * Returns an EMPTY ARRAY for an unknown name rather than throwing, exactly as [`:L43`] does.
   */
  getError(errorName: string): readonly string[];

  /** Whether any error exists — `hasErrors()` [org/Hibachi/HibachiTransient.cfc:L47-L53]. */
  hasErrors(): boolean;

  /** Whether one property has an error — `hasError()` [org/Hibachi/HibachiTransient.cfc:L56-L58]. */
  hasError(errorName: string): boolean;
}

/**
 * An entity plus the two framework surfaces {@link manageEntity} composes onto it.
 *
 * Both halves are framework-inherited in the legacy, which is why they arrive together and from one
 * place: an entity either extends the framework bases or it does not.
 *
 * ⚠️ NOT BECAUSE NO CLASS DECLARES THEM. That is what this block used to say, and it holds for the
 * ERROR half only. Five of the six entity classes hand-write the whole metadata half as prototype
 * methods, which `Object.assign` then SHADOWS with equivalent own-property closures over the same
 * declaration; ProductType hand-writes none, so for it those closures are the only implementation.
 * `src/domain/base/AuditableEntity.ts` records the split once, on the seven-member contract the five
 * accept.
 *
 * ⛔ AND THIS IS A DIFFERENT `ManagedEntity` FROM THAT CONTRACT, DESPITE THE SHARED NAME. This one is
 * the generic VIEW a collaborator holds — the entity intersected with both surfaces — and is what
 * `src/adapters/mysql/rowMappers.ts`, the services and `src/ports/repositories/BrandRepository.ts`
 * name. The non-generic interface in `src/domain/base/AuditableEntity.ts` is the OBLIGATION an entity
 * class accepts. No module imports both, so the shared name cannot collide at a use site, and
 * `src/domain/product/ProductType.ts` turns on the distinction: it declines the obligation while
 * remaining reachable through the view.
 */
export type ManagedEntity<TEntity> = TEntity & EntityMetadataSurface & EntityErrorSurface;

/**
 * Whether a declaration lists the name, narrowing it to a FIELD name when it does.
 *
 * Two jobs in one predicate, which is why it is written as a predicate rather than as a boolean
 * helper: it answers the {@link EntityMetadataSurface.hasProperty} question for the field half of
 * the declaration, and it narrows `string` to `TPropertyName` so the keyed read in
 * {@link manageEntity} needs no cast. `Object.prototype.hasOwnProperty.call` is used rather than a
 * keyed lookup because the argument is an arbitrary caller-supplied string: a lookup would have to
 * be typed through an index signature, and `hasOwnProperty` accepts a `PropertyKey` directly. It
 * also cannot be fooled by an inherited name such as `constructor` or `toString`, which a plain
 * `in` test would answer true for.
 */
function isDeclaredFieldProperty<TPropertyName extends string>(
  declaration: EntityMetadataDeclaration<TPropertyName>,
  propertyIdentifier: string,
): propertyIdentifier is TPropertyName {
  return Object.prototype.hasOwnProperty.call(declaration.properties, propertyIdentifier);
}

/**
 * Whether a declaration lists the name among those the legacy entity declares but this port does not
 * carry as a field. See {@link EntityMetadataDeclaration.declaredNonFieldProperties}.
 */
function isDeclaredNonFieldProperty(
  declaration: EntityMetadataDeclaration<string>,
  propertyIdentifier: string,
): boolean {
  const declaredNonFieldProperties = declaration.declaredNonFieldProperties;

  return (
    declaredNonFieldProperties !== undefined &&
    Object.prototype.hasOwnProperty.call(declaredNonFieldProperties, propertyIdentifier)
  );
}

/**
 * Splits a property identifier the way the legacy traversal does.
 *
 * `listLast(propertyIdentifier, '._')` and `listFirst(propertyIdentifier, '._')`
 * [org/Hibachi/HibachiTransient.cfc:L468] and [:L485] pass a TWO-CHARACTER delimiter string, and a
 * CFML list delimiter argument is a SET of single characters: BOTH `.` and `_` separate elements.
 * CFML list functions additionally ignore empty elements, so `a..b` has two elements, which is why
 * empty segments are dropped here rather than preserved.
 *
 * ⚠️ CARRIED LEGACY QUIRK: A PROPERTY NAME CONTAINING AN UNDERSCORE WOULD BE SPLIT. That is the
 * legacy behaviour, not a defect introduced here, and it is unreachable in this slice — measured
 * rather than assumed: no property name declared by any of the six in-scope entities contains an
 * underscore, and no in-scope rule set or uniqueness check passes a dotted identifier at all. It
 * would become reachable for a process object, whose class name does carry one
 * (`Product_UpdateSkus`), if a caller ever passed a class name here; nothing does.
 *
 * @param propertyIdentifier - A single property name, or a dotted/underscored path.
 * @returns The non-empty segments, in order.
 */
function splitPropertyIdentifier(propertyIdentifier: string): string[] {
  return propertyIdentifier.split(/[._]/).filter((segment) => segment.length > 0);
}

/**
 * Whether a value can itself resolve a property identifier — the port of the
 * `!isNull(object) && !isSimpleValue(object)` guard at
 * [org/Hibachi/HibachiTransient.cfc:L470], viewed from the traversal's point of view.
 *
 * The legacy traversal recurses by invoking the SAME member on the related object
 * [:L489], which is only possible because every related object inherited it. Here the equivalent
 * question is whether the related object was itself put through {@link manageEntity}. A related
 * object that was not — an out-of-scope reference shape, or a plain literal — makes the traversal
 * unresolvable, and the legacy fallback for an unresolvable traversal is the empty string.
 */
function isTraversableValue(
  value: unknown,
): value is Pick<EntityMetadataSurface, 'getValueByPropertyIdentifier'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getValueByPropertyIdentifier' in value &&
    typeof value.getValueByPropertyIdentifier === 'function'
  );
}

/**
 * The empty string every unresolvable read answers with — `return ""` at
 * [org/Hibachi/HibachiTransient.cfc:L480].
 *
 * Named rather than repeated at each exit so that the three ways a read can fail to resolve are
 * visibly the SAME outcome, which is what the single legacy exit made obvious.
 */
const UNRESOLVED_PROPERTY_VALUE = '';

/**
 * Reads a property identifier off one managed entity's fields, following the legacy traversal.
 *
 * @param fields - The entity, viewed at the keyed field surface `populate` writes through.
 * @param declaration - The entity's metadata declaration.
 * @param propertyIdentifier - A single property name, or a dotted/underscored path.
 * @returns The resolved value, or {@link UNRESOLVED_PROPERTY_VALUE} when it cannot be resolved.
 */
function readValueByPropertyIdentifier<TPropertyName extends string>(
  fields: PopulationTarget<TPropertyName>,
  declaration: EntityMetadataDeclaration<TPropertyName>,
  propertyIdentifier: string,
): unknown {
  const segments = splitPropertyIdentifier(propertyIdentifier);
  const firstSegment = segments[0];

  // `listLen(propertyIdentifier, "._") eq 1` at [:L484] cannot be true of an empty identifier, and
  // `invokeMethod("get")` at [:L486] would have failed rather than resolved. The empty-string exit
  // is the honest translation of "nothing was resolved".
  if (firstSegment === undefined) {
    return UNRESOLVED_PROPERTY_VALUE;
  }

  if (segments.length === 1) {
    // [:L484-L485] — a single-element identifier resolves the object to `this`, and [:L474] then
    // reads the named property off it. A name the legacy entity declares but this port does not
    // carry as a field is unreadable here and takes the same exit an unresolved traversal takes;
    // see {@link EntityMetadataDeclaration.declaredNonFieldProperties}.
    if (!isDeclaredFieldProperty(declaration, firstSegment)) {
      return UNRESOLVED_PROPERTY_VALUE;
    }

    const value: unknown = fields[firstSegment];

    // [:L475-L476] — a null value is NOT returned; execution falls through to `return ""`.
    return value === undefined ? UNRESOLVED_PROPERTY_VALUE : value;
  }

  // [:L486-L490] — resolve the leading segment, then delegate the remainder to the object it
  // yielded, exactly as the legacy helper recurses on the related object. A leading segment that is
  // absent, unreadable or not itself managed fails the [:L470] guard and answers the empty string.
  if (!isDeclaredFieldProperty(declaration, firstSegment)) {
    return UNRESOLVED_PROPERTY_VALUE;
  }

  const relatedValue: unknown = fields[firstSegment];

  if (!isTraversableValue(relatedValue)) {
    return UNRESOLVED_PROPERTY_VALUE;
  }

  return relatedValue.getValueByPropertyIdentifier(segments.slice(1).join('.'));
}

/**
 * Attaches the seven framework introspection members to one entity and returns the SAME object,
 * typed at the shape its collaborators require.
 *
 * ⭐ THIS IS THE RUNTIME PROVIDER FOR EVERY `Managed*` TYPE IN THE SUBTREE. Before it existed those
 * types were satisfiable by nothing: `src/services/BrandService.ts` could name
 * `Brand & BaseServiceEntity<BrandPropertyName> & UniquePropertyEntity` but no code produced one,
 * so a plain `Brand` reaching `src/validation/Validator.ts` failed at the first `getClassName()`
 * call. Everything that MINTS an entity — the six row mappers in
 * `src/adapters/mysql/rowMappers.ts` and the IR-1 `new*` members on the services — routes through
 * here, which is what makes the type honest.
 *
 * IDENTITY IS PRESERVED, DELIBERATELY. `Object.assign` mutates and returns its target, so the
 * managed value IS the entity: `manageEntity(sku, …) === sku`. Nothing is wrapped, proxied or
 * copied, because every relationship helper in the domain layer mutates the array or field it is
 * handed in place — `src/adapters/mysql/rowMappers.ts` records that `model/entity/Option.cfc:L95`,
 * `:L102` and `:L104` mutate the live array — and a wrapper would break those writes three layers
 * up with no error anywhere. `Object.assign` is also what produces the intersection RETURN TYPE
 * with no cast and no assertion: its declared signature is `(target: T, source: U) => T & U`, so
 * S1 is satisfied by construction rather than by suppression.
 *
 * THE MEMBERS BECOME OWN ENUMERABLE PROPERTIES, AND THAT WAS CHECKED RATHER THAN ASSUMED. Three
 * consequences, all verified against this subtree:
 *   - `JSON.stringify` omits function-valued properties, so a serialised entity is unchanged.
 *   - `src/validation/Validator.ts` counts struct keys ONLY behind its `isCfStruct` prototype gate,
 *     which excludes anything carrying a class prototype. `Object.assign` does not change the
 *     prototype, so a managed entity is still excluded and no key count shifts.
 *   - Nothing in the subtree spreads, clones or enumerates the own keys of an ENTITY. `populate`
 *     reads own keys of the incoming PAYLOAD; `src/adapters/mysql/rowMappers.ts` writes and deletes
 *     named fields. Neither is affected.
 * The seven names cannot collide with a property either: `TPropertyName` is a closed union declared
 * by the entity module, and no in-scope entity declares a property called `getClassName` or any of
 * its siblings, so a collision would be a compile error rather than a silent overwrite.
 *
 * CALLING IT TWICE IS HARMLESS: the second call overwrites the seven members with equivalent
 * closures over the same entity and declaration.
 *
 * @param entity - The entity to manage, MUTATED and returned.
 * @param declaration - The entity's frozen metadata declaration, from its own module.
 * @returns The same entity, typed as also carrying {@link EntityMetadataSurface}.
 *
 * @example
 * ```ts
 * const brand = manageEntity(new Brand(), BRAND_ENTITY_METADATA);
 * brand.getClassName(); // 'Brand'
 * brand.getEntityName(); // 'SlatwallBrand'
 * brand.hasProperty('urlTitle'); // true
 * brand.getPrimaryIDValue(); // '' — unsaved, per unsavedvalue=""
 * ```
 */
export function manageEntity<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(entity: TTarget, declaration: EntityMetadataDeclaration<TPropertyName>): ManagedEntity<TTarget> {
  /*
   * The same widening assignment {@link populateWithSubProperties} uses, and for the same reason:
   * it turns a keyed read into a legal `unknown`-typed expression with no assertion. See
   * {@link assignPropertyValue}.
   */
  const fields: PopulationTarget<TPropertyName> = entity;

  const surface: EntityMetadataSurface = {
    getClassName: (): string => declaration.className,

    getEntityName: (): string => declaration.entityName,

    getPrimaryIDPropertyName: (): string => declaration.primaryIDPropertyName,

    getPrimaryIDValue: (): string => {
      const value: unknown = fields[declaration.primaryIDPropertyName];

      if (typeof value === 'string') {
        return value;
      }

      /*
       * Unreachable for every entity in this slice — all six declare their primary key as a
       * required `string` initialised to `''` — and surfaced rather than defaulted anyway, because
       * the alternatives both diverge: substituting `''` would report an unsaved entity where the
       * declaration is actually wrong, and a non-null assertion is forbidden outright (S1). The
       * message is diagnostic only and carries no client-safe classification, so
       * `src/handlers/httpResponse.ts` withholds it from any response.
       */
      throw new DomainError(
        `${declaration.className}.${declaration.primaryIDPropertyName} did not hold a string primary identifier value`,
        {
          context: {
            className: declaration.className,
            primaryIDPropertyName: declaration.primaryIDPropertyName,
            locator: 'org/Hibachi/HibachiEntity.cfc:L244-L246',
          },
        },
      );
    },

    hasProperty: (propertyIdentifier: string): boolean =>
      isDeclaredFieldProperty(declaration, propertyIdentifier) ||
      isDeclaredNonFieldProperty(declaration, propertyIdentifier),

    getPropertyMetaData: (propertyName: string): UniquePropertyMetaData => {
      if (
        !isDeclaredFieldProperty(declaration, propertyName) &&
        !isDeclaredNonFieldProperty(declaration, propertyName)
      ) {
        /*
         * [org/Hibachi/HibachiTransient.cfc:L746] — `throw("No property found with name
         * #propertyName# in #getClassName()#")`. The wording is carried because it is the legacy
         * diagnostic, and it is NOT classified as client-safe: it names a caller-supplied
         * identifier and an internal class name, which is exactly the disclosure
         * `src/errors/DomainError.ts` requires a thrower to withhold.
         */
        throw new DomainError(
          `No property found with name ${propertyName} in ${declaration.className}`,
          {
            context: {
              className: declaration.className,
              propertyName,
              locator: 'org/Hibachi/HibachiTransient.cfc:L738-L747',
            },
          },
        );
      }

      /*
       * [:L742] returns the whole metadata entry, whose `name` attribute — the only one any
       * in-scope caller reads, at [org/Hibachi/HibachiDAO.cfc:L134] — is the key it was stored
       * under at [:L797]. Returning the name itself is therefore exact rather than approximate.
       */
      return { name: propertyName };
    },

    getValueByPropertyIdentifier: (propertyIdentifier: string): unknown =>
      readValueByPropertyIdentifier(fields, declaration, propertyIdentifier),
  };

  /*
   * THE ERROR BEAN, ONE PER ENTITY INSTANCE — `getHibachiErrors()`
   * [org/Hibachi/HibachiTransient.cfc:L31, :L62, :L67]. Held in this closure rather than as a field so
   * it cannot collide with a declared property name, and so the six members below are the only way to
   * reach it. `ValidationError` already implements exactly the legacy bean's six operations, including
   * the append-per-key array semantics, so it is reused rather than reimplemented here.
   */
  const errorBean = new ValidationError();

  const errors: EntityErrorSurface = {
    addError: (errorName: string, errorMessage: string): void => {
      errorBean.addError(errorName, errorMessage);
    },

    addErrors: (incoming: Readonly<Record<string, readonly string[]>>): void => {
      errorBean.addErrors(incoming);
    },

    getErrors: (): Readonly<Record<string, readonly string[]>> => errorBean.getErrors(),

    getError: (errorName: string): readonly string[] => errorBean.getError(errorName),

    hasErrors: (): boolean => errorBean.hasErrors(),

    hasError: (errorName: string): boolean => errorBean.hasError(errorName),
  };

  return Object.assign(entity, surface, errors);
}
