/**
 * populate — metadata-driven population becomes typed, explicit field assignment.
 *
 * `populate()` was the single most-invoked piece of behaviour in the legacy Slatwall save path:
 * every `save*` on every service funnelled through it. It worked by REFLECTING OVER COMPONENT
 * METADATA AT RUNTIME — walking `getMetaData(this).properties` up the inheritance chain and
 * branching on the `fieldtype`, `hb_populateEnabled`, `hb_populateArray`, `hb_fileUpload`,
 * `hb_sessionDefault` and `notNull` attributes — then assigning through DYNAMICALLY COMPOSED SETTER
 * NAMES, `this["set" & name]`.
 *
 * This module replaces all of that with a DECLARED, TYPED PROPERTY-DESCRIPTOR MODEL. Each entity or
 * process-object module declares its own descriptor table; this file consumes those descriptors and
 * performs explicit assignment. Nothing is discovered at runtime, nothing is synthesised, and no
 * member is reached by name concatenation.
 *
 * ---------------------------------------------------------------------------------------------
 * AAP AUTHORITY
 * ---------------------------------------------------------------------------------------------
 *   §0.4.1.4 "Domain Layer", row 2 — CREATE, source `model/entity/HibachiEntity.cfc:L56`, key
 *     change: "Metadata-driven population becomes typed, explicit field assignment honouring the
 *     legacy `hb_populateEnabled="false"` exclusions".
 *   TR-3 — "Replace framework magic with declarations. Every runtime-synthesized method, every
 *     string-keyed service lookup and every metadata-driven behavior becomes an explicit,
 *     compile-checked declaration." TypeScript under `strict` has no reflective equivalent, and
 *     TR-3 would forbid one if it did.
 *   IR-8 — THE PRIMARY SOURCE IS SLATWALL CODE, NOT FRAMEWORK CODE.
 *     `model/entity/HibachiEntity.cfc` is a LOCAL Slatwall base class — [L49] declares
 *     `extends="Slatwall.org.Hibachi.HibachiEntity"` — and its `populate()` at [L56] is a LOCAL
 *     OVERRIDE that calls `super.populate()` at [L59] and then adds its own behaviour. All six
 *     in-scope entities extend THIS class, so the effective behaviour is
 *     LOCAL OVERRIDE + FRAMEWORK MACHINERY, in that order. Both halves are ported here and the
 *     ordering is preserved: the five branches run first, then the extension seam, then the fluent
 *     return.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------------------------
 * It performs NO data access: no SQL, no HQL, no driver, no pool, no table name, no column name in
 * any query-shaped string (S2). Relationship loading arrives as an injected function.
 * It performs NO validation: populate RECORDS which sub-properties it populated and never inspects
 * a rule. Validation is owned by `src/validation/**`.
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
 * there — a value that is not exactly `'many-to-one'` cannot be constructed. It is NOT benign in
 * BRANCH 5, where `listFind` compares caller-supplied identifiers; see the note on that branch.
 *
 * ---------------------------------------------------------------------------------------------
 * G6 TRANSLATION DECISION — DATA KEYS ARE MATCHED CASE-SENSITIVELY
 * ---------------------------------------------------------------------------------------------
 * [org/Hibachi/HibachiTransient.cfc:L185] gates on `structKeyExists(arguments.data,
 * currentProperty.name)`, and CFML struct keys are case-insensitive, so a payload key
 * `productname` matched a declared property `productName`. This port requires an exact match, and
 * that is a deliberate decision rather than an oversight: a CFML struct PHYSICALLY CANNOT hold both
 * `productName` and `productname`, so the engine never needed a precedence rule, whereas a
 * JavaScript object can hold both. Implementing a case-insensitive lookup would therefore require
 * INVENTING a collision-resolution policy that the legacy system does not have, which S9 forbids.
 * The producer of `data` is the routing layer in `src/handlers/**`, which owns the key names.
 *
 * ---------------------------------------------------------------------------------------------
 * G6 TRANSLATION DECISION — WHAT COUNTS AS A "SIMPLE VALUE"
 * ---------------------------------------------------------------------------------------------
 * CFML `isSimpleValue()` answers true for strings, numbers, booleans AND date/time values. This
 * port models a simple value as `string | number | boolean` only. A date-valued key would have to
 * be stringified to be assigned, and the mask for that came from the CFML engine's own default —
 * inventing one here would violate S9, and the setting-driven formatting that would legitimately
 * supply one lives in `src/util/formatting.ts`. Because CFML's `isStruct()` is FALSE for a date,
 * `Date` is also excluded from the struct test below, so a date-valued key does not silently take
 * the many-to-one path instead. The observable consequence, recorded rather than smoothed over: a
 * date-valued key matches no branch and is left untouched. The same is true of `null` and of a key
 * present with the value `undefined`, neither of which CFML could represent inside a struct at all.
 *
 * ---------------------------------------------------------------------------------------------
 * EXECUTION-MODEL NOTES (S8)
 * ---------------------------------------------------------------------------------------------
 * M6 — ORDERING IS THE CALLER'S CONTRACT, NOT THIS FILE'S.
 * `org/Hibachi/HibachiService.cfc:L133` runs populate then validate then save, and populate is
 * CONDITIONAL on a `data` argument being supplied, so a save with no payload does not populate at
 * all. `model/service/ProductService.cfc:L264-L292` overrides that order: [L266] populate, [L268]
 * conditional URL title, [L273] validate, [L279] `createSkus` while the product is still transient,
 * [L286-L288] persist. That read-back hazard is mismatch M6 / AAP §0.6.2 and is resolved in
 * `src/adapters/mysql/UnitOfWork.ts`, NOT here. What it mandates for this file is absolute:
 * `populate` is PLAIN and SYNCHRONOUS — no `async`, no `await`, no `Promise`, no I/O, no
 * transaction awareness, no lazy resolution and no memoisation — so it may be called freely inside
 * a transaction boundary someone else owns, as many times as needed, at negligible cost.
 * `model/service/BrandService.cfc:L67-L78` never calls populate itself; it pre-seeds `data.urlTitle`
 * and delegates to `super.save(brand, data)`, so populate must also behave correctly on a payload
 * the caller has already mutated. It does: nothing is cached between calls.
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
 * `review_rules` returns the single line "No user rules provided." for this project, with no
 * paginated remainder, and no `.blitzyignore`, `.cursorrules`, `AGENTS.md`, `CLAUDE.md`,
 * `.editorconfig` or `.eslintrc*` exists anywhere in the repository. Zero files enter scope by rule
 * and no rule-derived constraint applies here. That is not permission to lower the bar: the nine
 * enterprise standards of AAP §0.7.3 govern instead, and every one of them has teeth in this file —
 * S1 (no `any`, no non-null assertion, no suppression comment, no cast used to silence an error),
 * S2 and S4 (the negative obligations above; the only import is the sibling `./AuditableEntity`),
 * S3 (every operation the legacy synthesised by name is an injected, typed function),
 * S5 (no dependency is added — nothing outside the language itself is used),
 * S6 (named exports only, every one constructible from plain literals with no harness),
 * S7 (preserve and annotate, do not repair), S8 and S9.
 */

import { isAuditPropertyName } from './AuditableEntity';

/* =============================================================================================
 * DATA-SHAPE GUARDS — THE PORT OF `isSimpleValue`, `isStruct` AND `isArray`
 * =============================================================================================
 * `data` is `Record<string, unknown>`, never `any`, so under `noUncheckedIndexedAccess` every read
 * out of it is `unknown` and must be narrowed explicitly. These four local guards are that
 * narrowing. They are local by design: the legacy tests were CFML built-ins, so there is no shared
 * module they could sensibly be lifted into, and PHASE 1's file-scope rule forbids inventing one.
 * ============================================================================================= */

/** A scalar as this port defines one — see the module header for why `Date` is excluded. */
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
 * CFML is dynamically typed, so `trim(100)` yields the STRING `'100'` and the legacy code assigned
 * that string into a `big_decimal` property without complaint, leaving Hibernate to convert it at
 * flush time. This function reproduces that rendering and NOTHING MORE — it is not a coercion layer,
 * it parses nothing, and it never inspects the declared type of the destination (S9). Conversion on
 * the way to the database is owned by `src/adapters/mysql/rowMappers.ts`.
 *
 * A boolean renders as `'true'` or `'false'`, which is what a modern CFML engine produces; older
 * ColdFusion releases rendered `'YES'` and `'NO'` for the same value. The repository pins no engine
 * — [readme.md:L6] says "9.0.1 or Newer" and [readme.md:L8] says Railo "4.1 or Newer" — and no
 * in-scope declaration is a boolean carried through this path from a boolean-typed payload value,
 * because HTTP delivers strings. The divergence is recorded here rather than resolved by picking a
 * rendering the source does not state (S9).
 *
 * @param value - A simple value narrowed by {@link isSimpleDataValue}.
 * @returns The value as a string.
 */
function renderSimpleValue(value: SimpleDataValue): string {
  return String(value);
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
 * REACHABILITY, VERIFIED: `hb_populateEnabled="public"` occurs 68 times repository-wide and ZERO
 * times in scope — the hits are in excluded files such as `model/entity/Order.cfc` [L71], [L74],
 * [L75], [L76] and `model/entity/AccountPhoneNumber.cfc:L53`. Across the six in-scope entities and
 * the three in-scope process objects only `false` and ABSENT occur, in a verified distribution:
 * four declarations each on `Product.cfc`, `Sku.cfc`, `ProductType.cfc`, `Option.cfc` and
 * `OptionGroup.cfc`; NINE on `Brand.cfc`; and none at all on any process object. The tri-value is
 * modelled anyway, because the legacy attribute has three states and collapsing it would be a
 * behavioural narrowing rather than a translation.
 */
export type PopulateEnabled = false | 'public';

/**
 * The field surface `populate` writes into.
 *
 * G6 TRANSLATION DECISION — WHY THIS SHAPE, AND WHY IT IS NOT AN ARBITRARY INDEX SIGNATURE.
 * PHASE 4.5's requirement is that an indexed write be "typed against the declared property-name
 * union — not `any`, not an index signature that accepts arbitrary strings". `TPropertyName` is
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
   * The tri-valued `hb_populateEnabled` attribute. Omit it for the ordinary case; see
   * {@link PopulateEnabled}.
   */
  readonly populateEnabled?: PopulateEnabled;
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
   * [org/Hibachi/HibachiTransient.cfc:L216]. The legacy gate requires the attribute to be present
   * AND truthy, so only `populateArray: true` opens the branch.
   *
   * REACHABILITY, VERIFIED BY GREP: ZERO occurrences across all six in-scope entities and all three
   * in-scope process objects. BRANCH 2 is nevertheless implemented — the descriptor member is what
   * makes its gate expressible at all, and a proven-unreachable branch that is present and
   * documented is stronger than one silently dropped.
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

  /** Resolves the related entity. See {@link RelatedEntityLoader}. */
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

  /** See {@link ManyToOnePropertyDescriptor.relatedPrimaryIdPropertyName}. */
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

  /** Resolves each related entity. See {@link RelatedEntityLoader}. */
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

  /** See {@link ManyToOnePropertyDescriptor.populateRelated}; the legacy call is at [:L300]. */
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

  /** See {@link ManyToOnePropertyDescriptor.relatedPrimaryIdPropertyName}. */
  readonly relatedPrimaryIdPropertyName: string;

  /** See {@link OneToManyPropertyDescriptor.singularName}, including the casing divergence note. */
  readonly singularName: string;

  /** Resolves each related entity. See {@link RelatedEntityLoader}. */
  readonly loader: RelatedEntityLoader<TRelated>;

  /** See {@link OneToManyPropertyDescriptor.addRelated}; the legacy calls are [:L294] and [:L357]. */
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
   * one of the four legacy throw strings `src/errors/DomainError.ts` carries, nor one of the
   * twenty-one carried defects D1-D21.
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
  /** The same object that was passed in, populated in place. */
  readonly target: TTarget;

  /** Which sub-properties were populated. Freshly created per call — never shared (M7). */
  readonly populatedSubProperties: PopulatedSubPropertyRecord<TPropertyName>;
}

/**
 * The two optional extension seams, both no-ops by default.
 *
 * THE SEAMS ARE REAL, NOT INVENTED. `org/Hibachi/HibachiTransient.cfc` declares `beforePopulate()`
 * at [L160-L162] and `afterPopulate()` at [L164-L166], both with empty bodies and the comment "Left
 * Blank to be overridden by objects", and invokes them at [:L172] and [:L396] — the latter
 * immediately before `return this;` at [:L399]. A repository-wide grep for `function beforePopulate`
 * and `function afterPopulate` across `model/entity/*.cfc` and `model/process/*.cfc` finds EXACTLY
 * ONE override, `model/entity/OrderPayment.cfc:L591`, which is out of scope. For every in-scope type
 * both hooks are therefore genuine no-ops — which is why they default to doing nothing, and why that
 * single locator is cited: it proves the seam was used, so keeping it is preservation rather than
 * speculation.
 *
 * WHY THE SEAMS TAKE ARGUMENTS WHERE THE LEGACY HOOKS TOOK NONE. The CFML hooks needed no parameters
 * because they ran inside the object and could read `this` and the enclosing `arguments`. Neither
 * implicit scope exists here, so the target and the payload are passed explicitly (S3).
 */
export interface PopulateOptions<TTarget> {
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
  descriptor: PopulatePropertyDescriptor<TTarget, TPropertyName>,
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
  descriptor: PopulatePropertyDescriptor<TTarget, TPropertyName>,
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
  descriptor: PopulatePropertyDescriptor<TTarget, TPropertyName>,
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
  descriptor: PopulatePropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ManyToManyPropertyDescriptor<TTarget, TPropertyName> {
  return descriptor.kind === 'many-to-many';
}

/* =============================================================================================
 * THE `_setProperty` PORT — THE `exactOptionalPropertyTypes` CRUX, AND THE RISKIEST LINE IN THIS FILE
 * =============================================================================================
 * Verbatim, `org/Hibachi/HibachiTransient.cfc:L806-L819`:
 *
 *     private void function _setProperty( required any name, any value, any formatType='' ) {
 *         if( structKeyExists(arguments, 'value') ) {
 *             var theMethod = this["set" & arguments.name];
 *             theMethod(arguments.value);
 *         } else {
 *             // Remove the key from variables, represents setting as NULL for persistent entities
 *             structDelete(variables, arguments.name);
 *         }
 *     }
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
 * ⭐ WHY THIS IS NOT MERELY A TYPING NICETY — THE OBSERVABLE PROOF.
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

/* =============================================================================================
 * MASTER GATE HELPERS
 * ============================================================================================= */

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
 * ARM 1 is ported and live: see {@link PropertyDescriptorSet.persistent} for the verified evidence
 * that it short-circuits for every in-scope process object and therefore lets them populate freely.
 *
 * TODO(parity): ARM 2 AND ARM 3 ARE DECLARED BOUNDARY OMISSIONS (TR-5), FLAGGED HERE RATHER THAN
 * QUIETLY DROPPED. Both reach `getHibachiScope()` [org/Hibachi/HibachiObject.cfc:L74-L76], a read out
 * of the CFML `request` struct keyed by an application-scoped string, and from there
 * `getPublicPopulateFlag()` and `authenticateEntityProperty(…)`, the latter declared at
 * `org/Hibachi/HibachiScope.cfc:L207`. All of it lives under `org/Hibachi/**`, the retired framework
 * boundary §0.8.3.2 describes as "a boundary to extract from, never modify", and the access-control
 * subsystem is no part of the catalog slice. Per the governing instruction no authorisation interface
 * is invented, nothing is imported from `src/ports/**` and no port file is created. THE OBSERVABLE
 * CONSEQUENCE, STATED PLAINLY: for a persistent target this port permits population where the legacy
 * would have consulted per-property access control, so the two paths currently coincide. ARM 2 is
 * additionally unreachable in scope on its own terms — `hb_populateEnabled="public"` occurs ZERO
 * times across the six in-scope entities and the three in-scope process objects (see
 * {@link PopulateEnabled}).
 *
 * @param descriptorSet - The target's declared population contract.
 * @returns `true` when population is permitted for this target.
 */
function isPopulationAuthorized<TTarget, TPropertyName extends string>(
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
): boolean {
  // ARM 1 — `!isPersistent()`. Ported and live. A transient process object short-circuits the OR on
  // its first arm, exactly as the legacy does, and never reaches the two framework arms below.
  if (!descriptorSet.persistent) {
    return true;
  }

  // ARMS 2 AND 3 — deliberately, not accidentally, the same answer. The arms are the flagged TR-5
  // boundary omissions documented above, so for a persistent target this port permits population
  // where the legacy would have consulted `getPublicPopulateFlag()` and `authenticateEntityProperty`.
  // The two returns are kept SEPARATE rather than collapsed to a single `return true` so that the
  // ported arm and the omitted arms remain visibly distinct, and so that supplying the omitted
  // collaborators later is a change to this branch alone. This redundancy is intentional; it is not a
  // dead branch left behind by mistake.
  return true;
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

/* =============================================================================================
 * BRANCH 5 HELPERS — CFML LIST SEMANTICS
 * ============================================================================================= */

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
 * Finds an identifier in the pending list, IGNORING CASE — the port of
 * `listFind( manyToManyIDList, thisPrimrayID )` at [org/Hibachi/HibachiTransient.cfc:L332].
 *
 * G6 TRANSLATION DECISION — TWO DIFFERENCES, BOTH HANDLED DELIBERATELY.
 * CFML's `listFind` is CASE-INSENSITIVE and returns a 1-BASED position, with 0 meaning "not found";
 * `Array.prototype.indexOf` is case-SENSITIVE and 0-based, with -1 meaning "not found". Substituting
 * `indexOf` would silently change which relationships survive a population pass. The identifiers
 * compared here are the 32-character identifiers of IR-6, which `src/util/uuid.ts` generates in
 * lower case, so case-insensitive matching is the faithful behaviour — and, because the values are
 * hexadecimal, `toLowerCase()` carries no locale hazard.
 *
 * @param pendingRelatedIds - The identifiers still awaiting a relationship.
 * @param candidateId - The identifier of an already-related entity.
 * @returns The zero-based index of the match, or -1 when there is none.
 */
function findRelatedIdIgnoringCase(
  pendingRelatedIds: readonly string[],
  candidateId: string,
): number {
  const normalisedCandidateId = candidateId.toLowerCase();
  return pendingRelatedIds.findIndex(
    (pendingRelatedId) => pendingRelatedId.toLowerCase() === normalisedCandidateId,
  );
}

/* =============================================================================================
 * THE ENGINE
 * =============================================================================================
 * `org/Hibachi/HibachiTransient.cfc:L169-L400` in one function, with the local Slatwall override's
 * ordering from `model/entity/HibachiEntity.cfc:L56-L96` wrapped around it (IR-8): the framework
 * machinery first, then the extension seam, then the fluent return.
 *
 * THE FIVE BRANCHES ARE PORTED IN SOURCE ORDER, AND THAT ORDER IS LOAD-BEARING. They are mutually
 * exclusive `else if` arms in the legacy source, their gates overlap on payload shape — a
 * `many-to-many` property reaches BRANCH 4 for an array payload and BRANCH 5 for a delimited list —
 * and order decides which one wins:
 *
 *     BRANCH 1  COLUMN                                    [:L192-L213]
 *     BRANCH 2  POPULATE-ARRAY                            [:L215-L218]
 *     BRANCH 3  MANY-TO-ONE, nested struct payload        [:L220-L270]
 *     BRANCH 4  ONE-TO-MANY / MANY-TO-MANY, array payload [:L272-L308]
 *     BRANCH 5  MANY-TO-MANY, delimited id list           [:L309-L359]
 *
 * TODO(parity): THE SECOND LOOP — FILE UPLOAD — IS NOT PORTED, AND TWO FINDINGS ABOUT IT MATTER.
 * [org/Hibachi/HibachiTransient.cfc:L364-L393] is an entirely separate second loop over the same
 * property array, running after the main loop closes. Its gate at [:L371] additionally requires
 * `hb_fileUpload` present AND truthy, `hb_fileAcceptMIMEType` present, a non-empty value, and
 * `structKeyExists(form, currentProperty.name)` — it reads the CFML `form` scope directly. Inside, it
 * resolves `get#currentProperty.name#UploadDirectory` [:L377], creates the directory if missing
 * [:L380-L382], calls `fileUpload( uploadDirectory, currentProperty.name,
 * currentProperty.hb_fileAcceptMIMEType, 'makeUnique' )` [:L385], assigns `uploadData.serverFile`
 * [:L388] and, on any failure, adds `rbKey('validate.fileUpload')` against the property
 * [:L389-L391].
 *   FINDING 1 — IT DOES NOT APPLY THE MASTER GATE AT ALL. No `hb_populateEnabled` check, no
 *   `isPersistent()` check, no authorisation check. A property excluded from ordinary population was
 *   still eligible for file-upload population. That is a genuine, verified quirk of the retired
 *   framework, recorded here rather than smoothed over (§0.8.2 Guideline 6).
 *   FINDING 2 — IT IS UNREACHABLE FOR EVERY IN-SCOPE TYPE. Verified by grep: `hb_fileUpload` and
 *   `hb_fileAcceptMIMEType` each occur ZERO times across `Product.cfc`, `Sku.cfc`, `ProductType.cfc`,
 *   `Brand.cfc`, `Option.cfc`, `OptionGroup.cfc` and all three process objects. So this is a
 *   documented no-op with proof it can never fire, not a missing feature.
 * `hb_fileUpload` is therefore honoured for the one thing it also does — excluding a property from
 * BRANCH 1, per {@link ColumnPropertyDescriptor.fileUpload}. No upload handling is implemented: no
 * file system access, no directory creation, no MIME validation, no `form`-scope analogue and no
 * multipart parsing. In-scope image handling flows instead through
 * `model/service/ProductService.cfc` `processProduct_uploadDefaultImage` and
 * `model/service/SkuService.cfc` `processImageUpload`, behind `ImagePathPort`; and
 * `rbKey('validate.fileUpload')` is actually raised at `model/service/ProductService.cfc:L253`, whose
 * error key belongs to `src/errors/ValidationError.ts` and is deliberately not re-exported here.
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
 * @param target - The entity or process object to populate, mutated in place.
 * @param data - The incoming payload. Keys matching no declared property are silently ignored, and
 *   nothing is thrown for them.
 * @param descriptorSet - The target's declared population contract.
 * @param options - The optional `beforePopulate` / `afterPopulate` seams.
 * @returns The target and the record of the sub-properties that were populated.
 *
 * @example
 * ```ts
 * // A column property, trimmed on the way in.
 * const { target } = populateWithSubProperties(
 *   {} as { productName?: unknown },
 *   { productName: '  ACME  ' },
 *   { persistent: true, properties: [{ name: 'productName', notNull: true }] },
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
  options: PopulateOptions<TTarget> = {},
): PopulateResult<TTarget, TPropertyName> {
  /*
   * PER-CALL STATE ONLY (M7 / S8). Both of these are created here, inside the invocation, and neither
   * is ever hoisted to module scope: warm-container state would leak across invocations and therefore
   * across tenants.
   *
   * `populatedSubProperties` IS INITIALISED EXPLICITLY AND UNCONDITIONALLY, which is a deliberate
   * divergence from the framework rather than a repaired in-scope defect. The legacy struct is
   * declared at [org/Hibachi/HibachiTransient.cfc:L5] as
   * `property name="populatedSubProperties" type="struct" persistent="false";` and a repository-wide
   * search finds NO initialisation to `{}` anywhere — not in `init()`, not in
   * `model/entity/HibachiEntity.cfc`, not in `org/Hibachi/HibachiObject.cfc`. As a result BRANCH 3's
   * write at [:L248] is UNGUARDED and depends on the key already existing, while BRANCH 4 guards for
   * it at [:L302-L305]. That is a latent defect in `org/Hibachi/**`, retired framework code, and it is
   * NOT among the twenty-one carried defects D1-D21; S7's treatment for a framework quirk is to
   * document the divergence and its reason rather than reproduce the bug, which is what this comment
   * does.
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
     *   CONDITION 3 — the authorisation OR; see {@link isPopulationAuthorized}, where ARM 1 is live
     *     and ARMs 2 and 3 are flagged boundary omissions.
     */
    if (!hasDataKey(data, propertyName)) {
      continue;
    }
    if (descriptor.populateEnabled === false) {
      continue;
    }
    if (!isPopulationAuthorized(descriptorSet)) {
      continue;
    }

    const rawValue: unknown = data[propertyName];

    if (
      isColumnDescriptor(descriptor) &&
      isSimpleDataValue(rawValue) &&
      descriptor.fileUpload === undefined
    ) {
      /*
       * ── BRANCH 1 ( COLUMN ) — [:L192-L213]. The workhorse. ──────────────────────────────────
       * The gate is all three of: `fieldType` absent or `'column'`; the value is a simple value; and
       * `hb_fileUpload` is ABSENT — a presence test, not a truthiness test, per
       * {@link ColumnPropertyDescriptor.fileUpload}.
       *
       * `trim()` IS APPLIED, TWICE OVER, IN THE SOURCE: once for the blank test at [:L196] and again
       * for the assignment at [:L207]. `"  ACME  "` is therefore stored as `"ACME"`, and a
       * whitespace-only value counts as blank. Both uses read the one trimmed value below; `trim` is
       * pure, so evaluating it once is identical to evaluating it twice, and the local is named for
       * exactly what the source computes.
       *
       * BLANK MEANS NULL BY DELETION, UNLESS `notNull`. [:L196-L197] calls `_setProperty(name)` with
       * NO value argument, which deletes the key; [:L200-L207] takes the `else` arm and assigns the
       * trimmed EMPTY STRING when the property is `notNull`. Verified by grep, `notNull` occurs
       * EXACTLY ONCE in the entire in-scope slice — [model/entity/Product.cfc:L55]
       * `property name="productName" ormtype="string" notNull="true";` — so for every in-scope simple
       * property EXCEPT `Product.productName` a blank value deletes the key, and for
       * `Product.productName` alone it assigns `''`. §0.8.2 Guideline 4 forbids "fixing" that
       * asymmetry (S7).
       *
       * TWO LEGACY PATHS DELIBERATELY NOT IMPLEMENTED HERE, BOTH FLAGGED RATHER THAN DROPPED:
       *
       *   `hb_sessionDefault` — [:L209-L212] reads
       *       // if this property has a sessionDefault defined for it, then we should update that
       *       // value with what was used
       *       if(structKeyExists(currentProperty, "hb_sessionDefault")) {
       *           setPropertySessionDefault(currentProperty.name, trim(arguments.data[ currentProperty.name ]));
       *       }
       *     Verified by grep: ZERO occurrences across all six in-scope entities and all three in-scope
       *     process objects. `setPropertySessionDefault` also writes the CFML session scope, which does
       *     not exist in a stateless invocation. No session abstraction is stubbed and no session port
       *     is invented (S9); this is a documented, proven-unreachable omission.
       *
       *   `hb_formatType` — [:L201-L206] is COMMENTED OUT in the legacy source and is carried across
       *     here as a comment with its names intact, per the §0.6.4.2 precedent for commented-out
       *     legacy content:
       *
       *         [begin CFML block comment, [:L201-L206]]
       *         if( !structKeyExists(currentProperty,'hb_formatType') ){
       *             currentProperty.hb_formatType = '';
       *         }
       *         _setProperty(currentProperty.name, trim(arguments.data[ currentProperty.name ]), currentProperty.hb_formatType);
       *         [end CFML block comment]
       *
       *     THE LIVE PATH AT [:L207] IGNORES `hb_formatType` ENTIRELY, so the attribute has NO effect
       *     on population. This is worth stating because [model/entity/Brand.cfc:L57] declares
       *     `property name="brandWebsite" ormtype="string" hb_formatType="url";` and a reader might
       *     reasonably expect population to honour it. It does not. The second, independent
       *     confirmation is the commented-out `_setProperty` override at
       *     [model/entity/HibachiEntity.cfc:L99-L116], whose `@help` reads "overwrite parents
       *     _setProperty to enable formatType parsing" and which parsed `formatType='dateTime'` values
       *     against `setting("globalDateFormat")` and `setting("globalTimeFormat")` using
       *     `java.text.SimpleDateFormat` and `java.text.ParsePosition` inside a `try` with an empty
       *     `catch(any e){}`. It too is commented out, therefore dead, and nothing is implemented from
       *     it. The third confirmation is the vestigial, never-read `formatType` parameter of
       *     `_setProperty` itself at [:L806]. No formatType behaviour is invented here (S9).
       */
      const trimmedValue = renderSimpleValue(rawValue).trim();
      if (trimmedValue === '' && descriptor.notNull !== true) {
        clearPropertyValue(fields, propertyName);
      } else {
        assignPropertyValue(fields, propertyName, trimmedValue);
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
         * ⚠️ [:L294] THE ENTITY IS ADDED UNCONDITIONALLY, BEFORE THE KEY-COUNT TEST AT [:L297].
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
       * ⚠️ [:L326] A BACKWARD LOOP: `for(var m=arrayLen(existingRelatedEntities); m>=1; m--)`.
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

        // [:L332] `listFind` — case-insensitive; see {@link findRelatedIdIgnoringCase}.
        const matchIndex = findRelatedIdIgnoringCase(pendingRelatedIds, existingRelatedId);

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
 * @param options - The optional `beforePopulate` / `afterPopulate` seams.
 * @returns The same target that was passed in, populated in place.
 *
 * @example
 * ```ts
 * const populatedBrand = populate(
 *   brand,
 *   { brandName: '  ACME  ', urlTitle: '' },
 *   brandDescriptorSet,
 * );
 * // brandName === 'ACME'; urlTitle's key has been DELETED, so `'urlTitle' in populatedBrand` is
 * // false — which is what keeps the unique-URL-title generation at
 * // model/service/ProductService.cfc:L268 reachable.
 * ```
 */
export function populate<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(
  target: TTarget,
  data: Record<string, unknown>,
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  options?: PopulateOptions<TTarget>,
): TTarget {
  return populateWithSubProperties(target, data, descriptorSet, options).target;
}
