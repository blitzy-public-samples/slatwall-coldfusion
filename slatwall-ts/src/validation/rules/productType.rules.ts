/**
 * `productType.rules.ts` — the typed transliteration of `model/validation/ProductType.json`.
 *
 * AAP §0.4.1.5 makes this file CREATE against that document: "Name and `urlTitle` requirements, four
 * delete guards including the `systemCode` max-length guard". The seven validation documents are an
 * entirely implicit scope addition (AAP §0.2.1.5) — the prompt names none of them — because they are
 * behavior rather than configuration and "determine which saves and deletes succeed".
 *
 * The generic evaluation semantics every constraint below depends on — the null verdict per constraint,
 * the error key, context selection, the uniqueness polarity, the dry-run pass and the deliberate
 * non-ports of the engine — are stated once in `../Validator` and are not repeated here.
 *
 * WHY PRECISION MATTERS MORE IN THIS DOCUMENT THAN IN ANY OTHER IN THE FOLDER: four of its six rules are
 * DELETE GUARDS, and one of them is the only thing standing between the three seeded product-type
 * discriminators (AAP IR-7) and deletion. Getting this file subtly wrong produces neither a compile error
 * nor a failing test — it produces a service that deletes rows the legacy system protects. See the
 * `systemCode` guard below, which is the most consequential declaration here.
 *
 * THE CONTRACT — SIX PROPERTIES, SIX RULE OBJECTS, SEVEN CONSTRAINTS.
 *
 *     property             context   constraints                       document line
 *     ------------------   -------   -------------------------------   -------------
 *     productTypeName      save      required                          :L3
 *     urlTitle             save      required, unique                  :L4
 *     products             delete    maxCollection 0                   :L5
 *     childProductTypes    delete    maxCollection 0                   :L6
 *     systemCode           delete    maxLength 0                       :L7
 *     physicalCounts       delete    maxCollection 0                   :L8
 *
 * Constraint keys used: `required` twice, `maxCollection` three times, `unique` once, `maxLength` once.
 * Contexts: `save` on two rule objects, `delete` on four. Every per-property value in this particular
 * document holds exactly ONE rule object, but the shape stays an ARRAY regardless, because that is the
 * model rather than a property of this document — `model/validation/Sku.json` gives `options` two rule
 * objects and `model/validation/Product.json` gives `baseProductType` two.
 *
 * THIS DOCUMENT IS THE FOLDER'S ONLY USER OF `maxLength`. Across all seven in-scope documents the key
 * occurs exactly once, at `model/validation/ProductType.json:L7`, with the value 0. Recorded so the single
 * occurrence is not mistaken for a transcription slip.
 *
 * X6 — THE PROPERTY KEY IS `childProductTypes`, NOT `productTypes`. Prose upstream of this file names the
 * third delete guard "child productTypes"; both sides of the actual contract say otherwise, since
 * `model/validation/ProductType.json:L6` keys it `childProductTypes` and
 * `model/entity/ProductType.cfc:L65` declares the property under that name. The upstream COUNT of four
 * delete guards is right; only the NAME was wrong. Stated so the next reader neither hunts for a fifth
 * guard nor "corrects" the key back — see the declaration itself for why the exact key is load-bearing.
 *
 * THE SEVEN REPORTED KEYS, composed by `../Validator` from the general template at
 * `org/Hibachi/HibachiValidationService.cfc:L230`:
 *
 *     validate.save.ProductType.productTypeName.required
 *     validate.save.ProductType.urlTitle.required
 *     validate.save.ProductType.urlTitle.unique
 *     validate.delete.ProductType.products.maxCollection
 *     validate.delete.ProductType.childProductTypes.maxCollection
 *     validate.delete.ProductType.systemCode.maxLength
 *     validate.delete.ProductType.physicalCounts.maxCollection
 *
 * All seven take that general template; the method-rule shape at `:L222` and the data-type shape at
 * `:L226` are unreachable from this document, which declares neither constraint. `ProductType` is a
 * persistent entity (`model/entity/ProductType.cfc:L49`), so the class-name segment resolved through the
 * `entity.` prefix branch at `:L212-L218` rather than the `processObject.` branch
 * `model/validation/Product_UpdateSkus.json` takes. Per DECISION D-1 in `../Validator` the resource-bundle
 * substitution pass is deliberately skipped, so these are KEYS, NOT SENTENCES: nothing here or downstream
 * translates, sentence-cases, normalises, trims or beautifies one, and `../../util/formatting` is
 * consequently not imported, because with the substitution skipped it would be dead code (AAP §0.8.2
 * guideline 4).
 *
 * DETERMINISTIC EVALUATION ORDER — A DETERMINISM CHOICE, NOT A BEHAVIOR CHANGE. Properties are declared in
 * the SOURCE DOCUMENT'S KEY ORDER, and within `urlTitle` the two constraints in the source key order
 * `required` then `unique`. The legacy engine reached a document's properties by iterating a CFML struct
 * (`org/Hibachi/HibachiValidationService.cfc:L63`), whose key order is UNSPECIFIED, so no legacy behaviour
 * can have depended on an order the engine never guaranteed. Errors accumulate and evaluation never
 * short-circuits in either system, so the SET of reported failures is order-independent; what determinism
 * pins down is the ORDER of the accumulated messages, and pinning it is what lets a test assert on the
 * collection at all.
 *
 * TWO DOCUMENTED NON-PORTS, recorded as observations rather than parity annotations:
 *
 *   1. THERE IS NO CASCADING VALIDATION, AND THIS FILE IS EXACTLY WHERE ONE WOULD BE ASSUMED. The legacy
 *      sub-property cascade (`org/Hibachi/HibachiTransient.cfc:L412-L453`, reached through the context
 *      helper at `org/Hibachi/HibachiValidationService.cfc:L133-L151`) is keyed on a document key that
 *      none of the seven in-scope documents declares, which makes the mechanism unreachable from here.
 *      Two of this document's own relationships are precisely the shape over which a reader would expect
 *      recursion: `childProductTypes` is SELF-REFERENCING, and `products` reaches an entity that has a
 *      validation document of its own. NEITHER RECURSES. Both guards below are collection-SIZE checks and
 *      nothing more.
 *   2. THE CUSTOM-OVERRIDE MERGE IS NOT PORTED. The legacy engine merges a per-installation override
 *      document over the base one (`org/Hibachi/HibachiValidationService.cfc:L6-L53`). The override
 *      directory for validation documents contains only a readme stub, so zero catalog overrides exist,
 *      and `custom/**` is out of scope per AAP §0.2.2.2. Building a merge mechanism for an empty directory
 *      would be invention under AAP §0.7.3 S9.
 *
 * REQUIREMENT N1 — THE DRY-RUN PATH, AND WHY IT IS THIS FILE'S CONCERN IN PARTICULAR. `../Validator`
 * supports a non-mutating pass that returns a throwaway error bag, reproducing the legacy third parameter
 * at `org/Hibachi/HibachiValidationService.cfc:L153`; the legacy capability checks use it, with
 * `isDeletable()`, `isEditable()` and `isProcessable()` at `org/Hibachi/HibachiEntity.cfc:L205`, `:L215`
 * and `:L225` each validating with error-setting off and reading `hasErrors()` off the returned bean. The
 * sharpening that matters here: `isDeletable()` ON A PRODUCT TYPE FLOWS THROUGH ALL FOUR OF THIS FILE'S
 * DELETE GUARDS — a reachable, administrator-visible path, since it is how an interface decides whether to
 * offer a delete at all. These declarations may therefore be evaluated repeatedly, speculatively, and
 * against objects that are never written, so they are PURELY DECLARATIVE DATA: no side effects, no
 * mutation, no shared state, and nothing that behaves differently on a second evaluation.
 *
 * ARCHITECTURAL POSITION. This file issues ZERO SQL (AAP §0.7.3 S2, as a negative obligation): no
 * statement, no fragment, no query-shaped string. The physical table names — `SwProductType` for the
 * entity and `SwPhysicalProductType` for the link table behind the collection discussed under
 * `physicalCounts` — appear in prose only, never in a key, a value or a string literal. THE IMPORT EDGE IS
 * STRICTLY ONE-WAY: this file imports from `../Validator`, and `../Validator` never imports a rules file —
 * it RECEIVES a rule set as an argument, which is what keeps the dependency acyclic and is parameter
 * injection per S3. Never invert that edge to make something resolve. Paths are relative with no aliases,
 * per AAP §0.4.3.5, so `tsc` and `esbuild` resolve identically. Uniqueness reaches the database
 * exclusively through the port injected into `../Validator`; this file never calls it (S4). And no
 * memoisation happens here, per M7: a warm Lambda container outlives an invocation, so module-scope
 * caching would bleed state between invocations. Every value below is a frozen literal, every function is
 * pure, and the module performs no work when it is loaded.
 *
 * @see `../Validator` for the evaluation semantics every constraint below depends on
 * @see `model/validation/ProductType.json` — the source document, REFERENCE-ONLY
 * @see `model/entity/ProductType.cfc` — the entity whose properties these rules name
 */

import type { ProductTypePropertyName } from '../../domain/product/ProductType';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  MaxCollectionConstraint,
  MaxLengthConstraint,
  PropertyValidation,
  RequiredConstraint,
  UniqueConstraint,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/**
 * What this rule set requires of the object being validated, and nothing more.
 *
 * STRUCTURAL, NEVER NOMINAL, which is the established convention of this subtree rather than a
 * choice made here: `../Validator` states that its subject shape is structural "so that every
 * ported domain entity and process object satisfies it without declaring that it does, and a
 * hand-written literal satisfies it too", and `../../services/BaseService` composes its own entity
 * contract the same way. Nothing extends anything — AAP 0.3.3 replaces the legacy
 * template-method inheritance with composition.
 *
 * The type is an intersection of three parts, and each part is here for a stated reason:
 *
 *   1. {@link ValidationSubject} — the engine's own two-member contract: the class name that forms
 *      the third segment of every reported key, and the property-existence predicate the engine
 *      consults at `org/Hibachi/HibachiValidationService.cfc:L171` before evaluating any rule of a
 *      property. That predicate is not incidental here; it is the entire mechanism by which the
 *      `physicalCounts` guard below stays inert, exactly as it is inert in the legacy system.
 *
 *   2. {@link UniquePropertyEntity} — the five-accessor shape the uniqueness port needs. Required
 *      because this document declares a `unique` constraint, and `../Validator` types that
 *      constraint's target resolver as returning this shape. `../Validator` deliberately keeps
 *      these five OFF its own subject contract, so a rule set that needs them must ask for them,
 *      and this one does. For a single-segment property identifier — which is what all seven
 *      `unique` rules in the slice have — the resolved entity is the subject itself, so the
 *      resolver below is the identity function and no lookup is invented.
 *
 *   3. The five property values these rules actually READ, and no others. The names and optionality
 *      mirror `../../domain/product/ProductType` exactly, which declares them as public fields
 *      rather than as accessor methods — idiomatic TypeScript, and expressly sanctioned by the
 *      Minimal Change Clause, which requires functional scope to be minimal while stating that
 *      "it does not mean preserving CFML idioms in TypeScript".
 *
 * WHY THE TWO COLLECTIONS ARE TYPED WITH `unknown` ELEMENTS. `maxCollection` measures SIZE and
 * never inspects an element (`org/Hibachi/HibachiValidationService.cfc:L311`), so the element type
 * is genuinely irrelevant to this rule set — and typing it would force an import of
 * `../../domain/product/Product`, which is NOT among this file's declared dependencies and must not
 * be reached for. The honest type is the one that says "a collection whose contents are none of my
 * business".
 *
 * WHY BOTH COLLECTIONS ARE OPTIONAL when the domain class initialises them to empty arrays: the
 * legacy evaluator has an explicit absent-value branch that PASSES, so an absent collection is a
 * real, specified input even though the ported entity cannot produce one. Declaring them optional
 * keeps that branch reachable from a hand-written test literal — the substitution the ports exist
 * to enable, since the legacy repository contains no mocking library at all — while the real
 * entity, whose fields are required arrays, satisfies the contract unchanged.
 *
 * NOTE WHAT IS ABSENT. Twenty-five properties are declared on `model/entity/ProductType.cfc` and
 * this contract names five of them, because the document names five that exist. In particular there
 * is no member for the identifier or its path, no member for either flag, no member for the
 * description, no member for the parent reference, no member for the attribute, promotion or
 * price-group collections, no member for the audit block, and no member for the single
 * non-persistent property — because no rule in this document reads any of them. That last point has
 * a useful corollary: since nothing here reaches a calculated member, THIS FILE NEEDS NO BOUNDARY
 * PORT to resolve one, and imports none.
 */
export type ProductTypeValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /** `property name="productTypeName" ormtype="string";` [`model/entity/ProductType.cfc:L57`] */
    readonly productTypeName?: string;

    /**
     * `property name="urlTitle" ormtype="string" unique="true" hint="…";`
     * [`model/entity/ProductType.cfc:L56`]
     */
    readonly urlTitle?: string;

    /** `property name="systemCode" ormtype="string";` [`model/entity/ProductType.cfc:L59`] */
    readonly systemCode?: string;

    /**
     * The one-to-many product collection [`model/entity/ProductType.cfc:L66`]. Measured, never
     * inspected — see the note on element typing above.
     */
    readonly products?: readonly unknown[];

    /**
     * The self-referencing child collection [`model/entity/ProductType.cfc:L65`]. The key is
     * `childProductTypes`; see X6 in the module header.
     */
    readonly childProductTypes?: readonly unknown[];

    /**
     * NAMED BY THE DOCUMENT, DECLARED BY NO ENTITY — the whole point of the inertness finding
     * recorded at the `physicalCounts` guard below.
     *
     * Present on this contract as an OPTIONAL member of the widest type for one reason: the guard's
     * value reader must be expressible without a type assertion. Declaring it here does NOT make
     * the guard fire. Whether a rule runs is decided at run time by
     * {@link ValidationSubject.hasProperty}, and for any faithful product-type subject that
     * predicate answers false for this name — which is precisely why the legacy engine skips the
     * rule and why the port must skip it too. The optionality is the type-level statement that no
     * in-scope entity carries it.
     */
    readonly physicalCounts?: unknown;
  };

/* ==============================================================================================
 * SECTION 2 — CONTEXTS
 *
 * P-2 — THE DELETE CONTEXT IS NOT OPTIONAL, AND THE ASYMMETRY IS INVISIBLE FROM THE JSON ALONE
 * (guideline 6).
 *
 * The two context strings are not symmetric in how they reach the engine, and the difference is
 * what makes this document's four delete guards unconditional:
 *
 *   - `delete` is HARD-CODED at the single delete call site:
 *     `arguments.entity.validate(context="delete")` at `org/Hibachi/HibachiService.cfc:L55`. There
 *     is no parameter to omit and no default to fall back to, so every delete of a product type
 *     runs all four guards below. They cannot be bypassed by a caller.
 *   - `save` is a DEFAULTED PARAMETER on the save signature —
 *     `public any function save(required any entity, struct data, string context="save")` at
 *     `org/Hibachi/HibachiService.cfc:L133` — so a caller may pass something else, and the two save
 *     rules below then do not apply.
 *
 * The universal legacy shape either way is VALIDATE, then CHECK for errors, then PERSIST. Note the
 * ordering consequence for this port: `../Validator` NEVER PERSISTS. It evaluates and reports; the
 * decision to proceed belongs to the service layer, exactly as `org/Hibachi/HibachiService.cfc:L58`
 * gates the delete on the absence of errors.
 *
 * BOTH CONTEXT VALUES ARE MATCHED CASE-INSENSITIVELY AND COMMA-DELIMITED, because the legacy gate is
 * `listFindNoCase(rule.contexts, arguments.context)` at
 * `org/Hibachi/HibachiValidationService.cfc:L71`. Neither rule here needs a two-context list, but
 * the type keeps the legacy delimited-string form so a rule set transcribes its document literally.
 *
 * EVERY RULE OBJECT IN THIS DOCUMENT DECLARES A CONTEXT, which has a consequence worth stating so
 * that a silence is not mistaken for an omission. The first half of the same gate — `if(!
 * structKeyExists(rule,"contexts") || …)` — means a rule with NO context key applies in EVERY
 * context. All six rule objects here declare one, so under the engine's default empty context, and
 * under each of the three runtime-only contexts the slice uses elsewhere, THIS FILE CONTRIBUTES
 * NOTHING AT ALL. That property inverts for exactly one of the seven documents:
 * `model/validation/Product_UpdateSkus.json` declares no context on either of its rules and
 * therefore fires in every context.
 * ============================================================================================ */

const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

/* ==============================================================================================
 * SECTION 3 — PROPERTY IDENTIFIERS
 *
 * The document's six keys, transcribed verbatim. Five are checked against the entity's declared
 * property-name union at compile time; the sixth deliberately is not, and that asymmetry is the
 * machine-checked half of the inertness finding.
 *
 * IR-1, AND WHY THIS FILE NAMES PROPERTIES RATHER THAN ACCESSORS (guideline 6).
 * `model/entity/ProductType.cfc:L49` declares neither `accessors="true"` nor `output="false"` —
 * uniquely among the six in-scope entities — and yet `getSystemCode()` is called at
 * `model/entity/ProductType.cfc:L111`. The accessor surface is therefore SYNTHESIZED BY THE
 * FRAMEWORK rather than declared in the source, which is exactly the IR-1 pattern: "every
 * dynamically synthesized method must be declared explicitly". The port's response is to declare
 * fields explicitly in `../../domain/product/ProductType`, and this file's response is to reference
 * PROPERTY NAMES only and never to depend on a synthesized accessor. The reader functions below go
 * through the declared field surface of the subject contract, so nothing here relies on a method
 * that no source file declares.
 * ============================================================================================ */

/**
 * A property name this document constrains that the entity genuinely declares.
 *
 * The `satisfies` checks below turn the five live keys into a compile-time claim: each must be a
 * member of the union `../../domain/product/ProductType` exports for its own declared properties. If
 * a property were ever renamed or removed there, this file would stop compiling instead of silently
 * declaring a rule against a name that no longer exists — which is the failure mode the sixth key
 * demonstrates is otherwise entirely silent.
 */
const PRODUCT_TYPE_NAME_PROPERTY = 'productTypeName' satisfies ProductTypePropertyName;

/** [`model/validation/ProductType.json:L4`], [`model/entity/ProductType.cfc:L56`] */
const URL_TITLE_PROPERTY = 'urlTitle' satisfies ProductTypePropertyName;

/** [`model/validation/ProductType.json:L5`], [`model/entity/ProductType.cfc:L66`] */
const PRODUCTS_PROPERTY = 'products' satisfies ProductTypePropertyName;

/**
 * [`model/validation/ProductType.json:L6`], [`model/entity/ProductType.cfc:L65`] — and the correction
 * X6 records: the key is `childProductTypes`, never `productTypes`. The `satisfies` check is what
 * makes that claim machine-verified rather than asserted, since `productTypes` is NOT a member of
 * the entity's property union and would not compile here.
 */
const CHILD_PRODUCT_TYPES_PROPERTY = 'childProductTypes' satisfies ProductTypePropertyName;

/** [`model/validation/ProductType.json:L7`], [`model/entity/ProductType.cfc:L59`] */
const SYSTEM_CODE_PROPERTY = 'systemCode' satisfies ProductTypePropertyName;

/**
 * Resolves to the name itself while the name is NOT a declared property of the entity, and to the
 * empty type as soon as it becomes one.
 *
 * This is the type-level guard for the inertness premise recorded at the `physicalCounts`
 * declaration below. That premise — that the engine's existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule because no such property exists —
 * is a FACT ABOUT THE ENTITY, and facts about other files are exactly what drifts silently. If
 * `physicalCounts` were ever added to `../../domain/product/ProductType`, this alias would collapse
 * to `never`, the assignment below would fail to compile, and whoever made that change would be
 * told that a guard which has never fired in the legacy system is about to start firing. Without
 * this, the same change would quietly begin blocking deletes the legacy system permits.
 *
 * It is a compile-time assertion only: it constrains no value, evaluates nothing at run time and is
 * erased entirely by the compiler.
 */
type NameNotDeclaredByProductType<TName extends string> = TName extends ProductTypePropertyName
  ? never
  : TName;

/**
 * [`model/validation/ProductType.json:L8`] — transcribed verbatim from the document and DELIBERATELY
 * NOT checked against the entity's property union, because it is not in it. See the guard's own
 * declaration for the full finding; the annotation here is what makes the absence enforced rather
 * than merely described.
 */
const PHYSICAL_COUNTS_PROPERTY: NameNotDeclaredByProductType<'physicalCounts'> = 'physicalCounts';

/* ==============================================================================================
 * SECTION 4 — THE SEVEN CONSTRAINTS
 *
 * Each is exported individually so a test can import and assert it on its own, which is what the
 * net-new suite at `slatwall-ts/test/validation/rules.test.ts` needs: its contract is to assert
 * each ported rule, and the legacy repository contains no mocking library, so every declaration
 * here must be trivially constructible and inspectable from plain object literals.
 *
 * Each is written as `as const satisfies …` rather than with a type annotation, so the literal
 * values stay NARROW — the ceiling below really is the literal 0 in the type, not merely a number —
 * while conformance to the discriminated union is still checked at the point of declaration.
 *
 * ONE NOTE ON COVERAGE HONESTY, because it must not be implied to be parity: NO LEGACY
 * `ProductTypeTest` EXISTS. AAP 0.6.5.2 records that the legacy suite has no entity test for
 * `ProductType`, no service test for any of the four services and no test for any DAO, so every
 * assertion written against this file is NET-NEW COVERAGE, not a re-run of an existing signal. The
 * extendable legacy signal for the whole slice is two entity test files, five issue regressions and
 * one fixture helper, and none of the two entity files is this entity.
 * ============================================================================================ */

/**
 * `productTypeName` is REQUIRED on save — and this declaration is the ONLY thing enforcing it.
 *
 * [`model/validation/ProductType.json:L3`] `"productTypeName": [{"contexts":"save","required":true}]`
 *
 * THE APPLICATION RULE IS THE SOLE ENFORCEMENT (guideline 6). The entity mapping is bare:
 *
 *     property name="productTypeName" ormtype="string";   [`model/entity/ProductType.cfc:L57`]
 *
 * No `required`, no `length`, no `unique`. The database will therefore accept a product-type row
 * with a null name quite happily, and the schema is unchanged by this refactor — AAP 0.1.1.1
 * classifies the exercise as logic extraction with the `Sw*` tables retained as the shared contract.
 * A reader who assumes schema-level enforcement will judge this rule redundant and drop it; it is
 * not redundant, it is the entire mechanism.
 *
 * The same pattern holds elsewhere in the folder and is worth naming so it reads as a pattern rather
 * than an oddity: `brandName` at `model/entity/Brand.cfc:L56`, the required option-group reference at
 * `model/entity/Option.cfc:L59` and the required product-type reference at
 * `model/entity/Product.cfc:L69` are all enforced by their validation documents alone.
 *
 * PRESENCE SEMANTICS, reproduced by `../Validator` from
 * `org/Hibachi/HibachiValidationService.cfc:L240-L246`. Do NOT layer an extra guard on top of them
 * here; adding one would change which saves succeed:
 *   - absent or null                 FAILS
 *   - the empty string               FAILS
 *   - a whitespace-only string       FAILS — the trim is inside the predicate
 *   - the string "0", and the number 0   PASS. Both are non-empty simple values. There is no
 *     falsy check anywhere in the legacy predicate, and adding one is the single easiest way to
 *     start rejecting a name the legacy system accepts.
 *   - an object                      PASSES; an array or struct passes only when non-empty
 *
 * NO PARITY ANNOTATION is recorded for the unread constraint value: `../Validator` already carries
 * that observation on the constraint type itself, where the legacy evaluator declares a value at
 * `org/Hibachi/HibachiValidationService.cfc:L240` and never reads it. The value is transcribed as
 * the document declares it so the transcription stays faithful.
 *
 * NOTHING ELSE IS DECLARED ON THIS PROPERTY. No `maxLength` — `model/entity/ProductType.cfc:L57`
 * carries no `length` attribute to derive one from. No `minLength`, which is not among the thirteen
 * keys the seven documents use. No format pattern, and no uniqueness.
 *
 * Reported as `validate.save.ProductType.productTypeName.required`.
 */
export const productTypeNameRequiredConstraint = {
  constraintType: 'required',
  constraintValue: true,
} as const satisfies RequiredConstraint;

/**
 * `urlTitle` is REQUIRED on save.
 *
 * [`model/validation/ProductType.json:L4`]
 * `"urlTitle": [{"contexts":"save","required":true,"unique":true}]`
 *
 * TWO CONSTRAINTS FROM ONE RULE OBJECT — THE FLATTENING (guideline 6). The legacy engine explodes a
 * rule object into one constraint record per key, copying the context and condition gates onto each
 * (`org/Hibachi/HibachiValidationService.cfc:L77-L88`), so this single line of JSON yields TWO
 * INDEPENDENT CONSTRAINTS. Here that explosion is the data shape rather than something derived at
 * evaluation time: the property's rule below lists both, they are evaluated in declaration order,
 * evaluation does NOT short-circuit, and BOTH CAN FAIL IN THE SAME PASS and add their own message.
 *
 * Both messages are keyed by the PROPERTY IDENTIFIER — `urlTitle` — and not by the constraint that
 * produced them, because every branch of the legacy reporter calls its error sink with exactly two
 * arguments, the full property identifier and the message
 * (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`). Two failures under one key is
 * precisely why the error bag holds an array per key. The trailing-segment form derived at `:L208`
 * shapes the MESSAGE only and never replaces the key.
 *
 * Presence semantics are identical to `productTypeName` above; see that declaration.
 *
 * Reported as `validate.save.ProductType.urlTitle.required`.
 *
 * CONTEXT, NOT THIS FILE'S JOB: the save path assigns a unique URL title before validation ever
 * runs — `model/service/ProductService.cfc:L294` derives one from the product-type name for table
 * `SwProductType` when none was supplied, using the generator ported as `src/util/urlTitle.ts`. That
 * is service behaviour; this file neither imports that utility nor generates anything. Note in
 * passing that `model/entity/ProductType.cfc:L49` declares `hb_serviceName="productService"` — there
 * is NO `ProductTypeService` in the legacy tree at all, which is why the save member for this entity
 * lives on the product service.
 */
export const urlTitleRequiredConstraint = {
  constraintType: 'required',
  constraintValue: true,
} as const satisfies RequiredConstraint;

/**
 * `urlTitle` must be UNIQUE on save — the seventh of the slice's seven uniqueness rules, and the one
 * every upstream count of them misses.
 *
 * [`model/validation/ProductType.json:L4`], [`model/entity/ProductType.cfc:L56`]
 *
 * =============================================================================================
 * DUAL ENFORCEMENT, AND WHY THE APPLICATION CHECK IS KEPT ANYWAY (guideline 6)
 * =============================================================================================
 * Uniqueness is declared TWICE for this property, in two independent mechanisms:
 *
 *     property name="urlTitle" ormtype="string" unique="true" hint="This is the name that is
 *     used in the URL string";                              [`model/entity/ProductType.cfc:L56`]
 *
 * and the `unique: true` of the validation document. The same pairing holds for
 * `model/entity/Brand.cfc:L55` and `model/entity/Sku.cfc:L54`, and stands in deliberate contrast to
 * `model/entity/Option.cfc:L53` and `model/entity/OptionGroup.cfc:L54`, whose code columns carry NO
 * `unique="true"` at all and are therefore enforced by their validation documents alone.
 *
 * IR-5 is why the application-side check is retained rather than delegated to the column: "
 * Application-side uniqueness checking is required in addition to database constraints.
 * `HibachiDAO.isUniqueProperty()` [org/Hibachi/HibachiDAO.cfc:L130-L146] enforces uniqueness with an
 * HQL existence query during validation, independently of the `unique="true"` column metadata." A
 * port that dropped this constraint and leaned on the column would move the failure from a
 * validation message to a driver-level integrity error, changing observable behaviour.
 *
 * =============================================================================================
 * THE ABSENT CEILING, STATED POSITIVELY (guideline 6)
 * =============================================================================================
 * `model/entity/ProductType.cfc:L56` carries NO `length` attribute — the mirror image of
 * `model/entity/Sku.cfc:L54`, which carries `length="50"`. In BOTH cases the correct action is
 * identical: DECLARE NO `maxLength`. The ceiling is a validation-document concern, and across all
 * seven documents `maxLength` appears exactly once, on `systemCode`, with the value 0. The absence is
 * recorded so that a reader comparing the two files does not conclude otherwise and "restore" a rule
 * that never existed.
 *
 * =============================================================================================
 * X8 — THE SEVENTH `unique` RULE OF THE SLICE, AND THE ONE MOST EASILY MISSED
 * =============================================================================================
 * `model/validation/ProductType.json:L4` is the seventh of the slice's seven uniqueness rules;
 * `../Validator` carries all seven locators under DECISION D-2 AND "THE SEVEN", and
 * `model/validation/Product_UpdateSkus.json` contributes none. It is the invisible one because a
 * summary that enumerates the code properties and the brand URL title reaches six and stops — this
 * constraint lives on a URL title in the document a reader is least likely to open.
 *
 * AAP IR-5's "five of the eight unique columns declared in the whole system belong to this slice"
 * counts ENTITY COLUMN METADATA, which IR-5 itself distinguishes from the validation documents in the
 * very same sentence. The VALIDATION-DOCUMENT count is seven. BOTH NUMBERS ARE CORRECT; THEY MEASURE
 * DIFFERENT MECHANISMS. Do not "fix" either into the other.
 *
 * =============================================================================================
 * DECISION D-2 AND THE POLARITY PIN (guideline 6)
 * =============================================================================================
 * Evaluation goes EXCLUSIVELY through the uniqueness port that `../Validator` receives by
 * constructor injection (IR-5, AAP 0.7.3 S3). This file names the constraint and resolves its
 * target; it never invokes the port, never issues a query and never reaches an adapter.
 *
 * POLARITY: `true` MEANS UNIQUE, WHICH MEANS SAFE TO SAVE. At
 * `org/Hibachi/HibachiDAO.cfc:L142-L146` the legacy body returns false when the existence query
 * finds matching rows and true when it does not. INVERTING THIS SILENTLY INVERTS EVERY UNIQUENESS
 * RULE IN THE SLICE: it compiles, it passes a naive test that only checks a boolean came back, and
 * it corrupts the catalog by rejecting every distinct value while admitting every duplicate.
 *
 * Three further details of that legacy body, carried because each shapes what a correct
 * implementation must do:
 *   - THE SELF-EXCLUSION CLAUSE IS A NO-OP ON INSERT. The query excludes the entity's own row by
 *     primary identifier (`org/Hibachi/HibachiDAO.cfc:L136`, bound at `:L140`), but a row being
 *     inserted has not been assigned an identifier yet, so on insert the check degenerates to a
 *     plain existence test. On update the clause is live and stops a row colliding with itself.
 *   - A NULL VALUE PASSES, indirectly. The legacy evaluator at
 *     `org/Hibachi/HibachiValidationService.cfc:L467-L470` applies NO null guard before delegating,
 *     so the port must not throw on an absent value, must not turn it into a null-comparison
 *     predicate, and must not report it as taken. Note that this constraint is paired with a
 *     presence rule on the same property, so a null is reported by THAT rule rather than this one.
 *   - THE CONSTRAINT VALUE IS DECLARED BUT NEVER READ (`:L467`). `unique: true` is a flag; there is
 *     no `unique: false` form in any of the seven documents. It is transcribed faithfully anyway.
 *
 * THE TARGET RESOLVER IS THE IDENTITY FUNCTION, and deliberately so. The legacy engine resolves the
 * entity to check by walking the property identifier to its last object
 * (`org/Hibachi/HibachiValidationService.cfc:L468`); for a single-segment identifier — which is what
 * all seven uniqueness rules in the slice have — that walk terminates immediately at the subject
 * itself. The indirection is retained because the legacy has it and because a dotted identifier
 * would resolve elsewhere, but no lookup is invented here.
 *
 * Reported as `validate.save.ProductType.urlTitle.unique`.
 */
export const urlTitleUniqueConstraint = {
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: ProductTypeValidationSubject): UniquePropertyEntity => subject,
} as const satisfies UniqueConstraint<ProductTypeValidationSubject>;

/**
 * DELETE GUARD 1 of 4 — a product type that still has PRODUCTS cannot be deleted.
 *
 * [`model/validation/ProductType.json:L5`] `"products": [{"contexts":"delete","maxCollection":0}]`
 *
 * COLLECTION-CEILING SEMANTICS, reproduced by `../Validator` from
 * `org/Hibachi/HibachiValidationService.cfc:L309-L315`. These apply to all three `maxCollection`
 * guards in this file, and the null branch is the one that surprises people:
 *   - absent or null            PASSES — an explicit null short-circuit, not an oversight
 *   - an EMPTY array            PASSES a ceiling of 0, since its length is 0
 *   - a non-empty array         FAILS  — the delete is blocked
 *   - a non-null SIMPLE value   FAILS  — it is neither array nor struct, so neither branch admits it
 *   - a struct                  measured by KEY COUNT
 *
 * =============================================================================================
 * CASCADE VERSUS GUARD — TENSION 1 OF 2 IN THIS FILE. NOTE IT; RESOLVE NOTHING (guideline 6, S8)
 * =============================================================================================
 *     property name="products" singularname="product" cfc="Product" fieldtype="one-to-many"
 *     inverse="true" fkcolumn="productTypeID" lazy="extra" cascade="all";
 *                                                        [`model/entity/ProductType.cfc:L66`]
 *
 * The mapping declares `cascade="all"`, which would propagate a delete into the collection. The
 * document simultaneously guards it with a ceiling of zero, which BLOCKS the delete outright whenever
 * the collection is non-empty. The cascade can therefore only ever fire on an already-empty
 * collection, making it effectively unreachable for this relationship.
 *
 * That is a genuine unresolved tension in the legacy design, and it is left exactly as found. AAP
 * 0.8.2 guideline 4 forbids enhancing or optimising business logic beyond what the migration
 * requires, and "resolving" this would mean choosing one of the two behaviours the legacy declares.
 * Four instances of the pattern exist across the seven documents, and TWO OF THEM ARE IN THIS FILE:
 *
 *     relationship                                          cascade              tension?
 *     ---------------------------------------------------   ------------------   --------
 *     Brand.products         [`model/entity/Brand.cfc:L61`]  none                 No
 *     OptionGroup.options    [`model/entity/OptionGroup.cfc:L70`]
 *                                                           all-delete-orphan    Yes
 *     ProductType.childProductTypes [`model/entity/ProductType.cfc:L65`]
 *                                                           all                  Yes
 *     ProductType.products   [`model/entity/ProductType.cfc:L66`]
 *                                                           all + lazy="extra"   Yes
 *
 * This is recorded as a plain observation, NOT as a parity annotation and NOT as a new defect
 * identifier: it is faithfully reproduced legacy behaviour rather than a carried defect, and the
 * plan's defect register is closed — no entry may be invented. For the same reason it is not a new
 * execution-model mismatch either; the plan's mismatch inventory is likewise closed, and this file
 * carries none of them.
 *
 * =============================================================================================
 * THE `lazy="extra"` OBSERVATION (guideline 6)
 * =============================================================================================
 * `products` is the ONLY relationship in this entity that carries `lazy="extra"` — the extra-lazy
 * collection mode in which a size query can be issued WITHOUT hydrating the collection. That is
 * directly relevant to this guard, because a ceiling of zero needs only the SIZE and never the
 * elements, so the legacy author chose extra-lazy on precisely the collection that is only ever
 * measured.
 *
 * And then it stops there, because that is where this file's remit stops: THIS FILE ONLY DECLARES THE
 * CONSTRAINT. How the size is obtained — the length of a hydrated array, or a counting query — is
 * owned by `../Validator` and, beneath it, by the adapters layer. THIS FOLDER ISSUES ZERO QUERIES
 * (AAP 0.7.3 S2). No optimisation is attempted here, no counting hint is passed, and no adapter is
 * imported.
 *
 * Reported as `validate.delete.ProductType.products.maxCollection`.
 */
export const productsMaxCollectionConstraint = {
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const satisfies MaxCollectionConstraint;

/**
 * DELETE GUARD 2 of 4 — a product type that still has CHILD PRODUCT TYPES cannot be deleted.
 *
 * [`model/validation/ProductType.json:L6`]
 * `"childProductTypes": [{"contexts":"delete","maxCollection":0}]`
 *
 * =============================================================================================
 * X6 — THE KEY IS `childProductTypes`, NOT `productTypes` (guideline 6)
 * =============================================================================================
 * Prose upstream of this file calls this guard "child productTypes". Both sides of the real contract
 * disagree, and they agree with each other:
 *
 *     "childProductTypes":  [{"contexts":"delete","maxCollection":0}],
 *                                                  [`model/validation/ProductType.json:L6`]
 *
 *     property name="childProductTypes" singularname="childProductType" cfc="ProductType"
 *     fieldtype="one-to-many" inverse="true" fkcolumn="parentProductTypeID" cascade="all";
 *                                                  [`model/entity/ProductType.cfc:L65`]
 *
 * The document key and the entity property match EXACTLY, so the engine's existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` passes and THIS GUARD IS LIVE. That exactness is
 * load-bearing in both directions: had the document said `productTypes`, this guard would be as inert
 * as the `physicalCounts` one below, and a port that "corrected" the key to `productTypes` would
 * silently disable a guard the legacy system enforces. The `satisfies` check on the identifier
 * constant above is what makes the correct spelling machine-verified rather than merely asserted.
 *
 * THE UPSTREAM COUNT OF FOUR DELETE GUARDS IS CORRECT; ONLY THE NAME WAS WRONG. Stated so the next
 * reader neither goes hunting for a fifth guard nor reverts the key.
 *
 * THE SELF-REFERENCING SIDE OF THE HIERARCHY. This is the `inverse="true"` one-to-many whose owning
 * many-to-one is `parentProductType` at `model/entity/ProductType.cfc:L62`. The guard therefore reads:
 * a product type with children cannot be deleted. Combined with the `cascade="all"` on the same line
 * — tension 2 of the 2 tabulated at the `products` guard above — the arrangement is deliberately
 * belt-and-braces: the cascade would delete the children, and the guard refuses to let it try.
 *
 * NO RECURSION IS IMPLIED. This is a size check on the immediate child collection, not a recursive
 * validation of each child; see the first of the two documented non-ports in the module header, where
 * the self-referencing shape is exactly the case a reader might expect to cascade and does not.
 *
 * Collection-ceiling semantics are shared with the `products` guard above; see that declaration.
 *
 * Reported as `validate.delete.ProductType.childProductTypes.maxCollection`.
 */
export const childProductTypesMaxCollectionConstraint = {
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const satisfies MaxCollectionConstraint;

/**
 * DELETE GUARD 3 of 4 — **THE GUARD RAIL. THE MOST CONSEQUENTIAL DECLARATION IN THIS FILE.**
 *
 * A product type that carries a SYSTEM CODE cannot be deleted.
 *
 * [`model/validation/ProductType.json:L7`] `"systemCode": [{"contexts":"delete","maxLength":0}]`
 * [`model/entity/ProductType.cfc:L59`]   `property name="systemCode" ormtype="string";`
 *
 * A maximum length of zero on a string column looks at first glance like a curiosity, or like a
 * transcription slip for some other value. IT IS NEITHER. IT IS A GUARD RAIL, and it is the only
 * thing in the entire slice that protects the three seeded product-type discriminators from
 * deletion.
 *
 * =============================================================================================
 * THE MECHANISM
 * =============================================================================================
 * The property is a plain string — no `length`, no `unique`, no `required`. Because it genuinely
 * EXISTS on the entity, the engine's existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` passes and THIS RULE ACTUALLY FIRES, unlike the
 * `physicalCounts` guard below.
 *
 * The ceiling evaluator (`org/Hibachi/HibachiValidationService.cfc:L293-L299`) admits a value when it
 * is absent, or when it is a simple value whose TRIMMED length is within the ceiling. With a ceiling
 * of zero that resolves to:
 *   - absent or null                     PASSES  -> the product type is deletable
 *   - the empty string                   PASSES  -> length 0
 *   - a whitespace-only string           PASSES  -> the trim is INSIDE the predicate
 *   - any other non-empty simple value   FAILS   -> THE DELETE IS BLOCKED
 *   - a non-simple, non-null value       FAILS   -> neither branch of the predicate admits it
 *
 * In plain English: A PRODUCT TYPE THAT CARRIES A SYSTEM CODE CANNOT BE DELETED. An ordinary,
 * merchant-created product type has no system code and deletes normally. A SEEDED product type has
 * one, and is therefore permanently protected. The null and blank cases passing is not a hole in the
 * guard — it is the guard working exactly as intended.
 *
 * =============================================================================================
 * WHAT IT PROTECTS, PART ONE: THE THREE COMBINATION-ENGINE BRANCH KEYS
 * =============================================================================================
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` seeds exactly three rows. Their system-code and
 * identifier pairs, reproduced here IN A COMMENT AND NOWHERE ELSE:
 *
 *     merchandise     444df2f7ea9c87e60051f3cd87b435a1
 *     subscription    444df2f9c7deaa1582e021e894c0e299
 *     contentAccess   444df313ec53a08c32d8ae434af5819a
 *
 * IR-7: "The seeded product-type discriminators are fixed data, not test data. Three
 * `systemCode`/UUID pairs are seeded at [config/dbdata/SlatwallProductType.xml.cfm:L13-L15] and are
 * the literal branch keys of `SkuService.createSkus`."
 *
 * The combination engine discriminates three ways on the base product type at
 * `model/service/SkuService.cfc:L58-L61`, with a fall-through raise at
 * `model/service/SkuService.cfc:L204` for anything else. DELETING ONE OF THESE THREE ROWS WOULD BREAK
 * THAT ENGINE OUTRIGHT — the largest single business rule in the slice.
 *
 * =============================================================================================
 * WHAT IT PROTECTS, PART TWO: THE BASE-TYPE RESOLUTION OF EVERY DESCENDANT
 * =============================================================================================
 * This is the half a casual reading misses, and it is why the guard matters far beyond the three rows
 * themselves. `model/entity/ProductType.cfc:L110-L115`:
 *
 *     public any function getBaseProductType() {
 *         if(isNull(getSystemCode()) || getSystemCode() == ""){
 *             return getService("ProductService")
 *                 .getProductType(listFirst(getProductTypeIDPath())).getSystemCode();
 *         }
 *         return getSystemCode();
 *     }
 *
 * Read `:L111-L112` carefully. When a product type has NO system code of its own — the normal case for
 * every merchant-created type — the method takes the FIRST element of the identifier path, which is
 * the ROOT of that branch of the hierarchy, loads that product type, and returns THE ROOT'S system
 * code.
 *
 * All three seeded rows ARE roots: each is seeded with a null parent and an identifier path equal to
 * its own identifier (`config/dbdata/SlatwallProductType.xml.cfm:L13-L15`). Therefore:
 *
 *     EVERY DESCENDANT PRODUCT TYPE IN THE SYSTEM RESOLVES ITS BASE TYPE BY READING A SEEDED ROOT'S
 *     SYSTEM CODE. If a seeded root were deleted, the first element of every descendant's path would
 *     dangle, the lookup would return nothing, and reading a system code off that nothing would fail
 *     at run time — FOR EVERY DESCENDANT, not merely for the deleted row.
 *
 * So this one ceiling protects TWO things at once: the three literal branch keys of the combination
 * engine, and the base-type resolution of the entire product-type tree beneath them. The same
 * resolution chain is what the sibling product rule set's membership rules depend on
 * (`model/validation/Product.json:L4` and `:L5`), and therefore what makes the option-group process
 * gate that the traceable legacy regression `issue_1331` asserts against meaningful at all.
 *
 * =============================================================================================
 * IT IS A LENGTH CHECK ON AN ARBITRARY STRING, NOT A MEMBERSHIP TEST (guideline 6)
 * =============================================================================================
 * This is the likeliest way to get this declaration wrong while believing it right. Having understood
 * that the guard protects three specific seeded rows, the instinct is to say so in code — to block the
 * delete when the system code is ONE OF THE THREE, perhaps by reaching for
 * `../../domain/BaseProductType`, which holds those three values as a typed union.
 *
 * DO NOT. It is a behavioural change wearing the costume of a clarification:
 *   - The legacy rule blocks the delete for ANY non-empty system code, not only the three seeded
 *     values. A future seeded row, a hand-entered value, a partially migrated record — all are
 *     protected by the legacy rule and ALL WOULD BE LEFT UNPROTECTED by a membership test.
 *   - A membership test NARROWS a delete guard, and narrowing a delete guard means permitting deletes
 *     the legacy system forbids. That is the precise failure mode this whole file exists to avoid,
 *     and it is the one that produces no compile error and no failing test.
 *
 * Concretely, and all four of these are deliberate:
 *   - The ceiling is declared as exactly 0, on the delete context, and nothing else is declared.
 *   - The three values appear ABOVE, IN A COMMENT, to explain why the guard exists. They appear
 *     nowhere in this file as a value, a key or a constant, and this file's ONLY numeric literals are
 *     the three zero ceilings of the collection guards and the one zero ceiling here.
 *   - `../../domain/BaseProductType` IS NOT IMPORTED. It is deliberately absent from this file's
 *     declared dependencies, and importing it would be the first step of exactly the narrowing above.
 *   - No membership constraint is added. Across the seven documents, list membership is declared
 *     exactly twice, both times on the product's base type, and NEVER on this property; adding one
 *     would be fabrication under AAP 0.7.3 S9. Nor is the rule "improved" into an equality check
 *     against the empty string or into a null constraint: those are different constraint kinds with
 *     different null semantics, and one of them is not among the thirteen keys at all.
 *
 * Reported as `validate.delete.ProductType.systemCode.maxLength` — the key the acceptance bar names
 * explicitly, and the only `maxLength` key the whole slice can produce.
 */
export const systemCodeMaxLengthConstraint = {
  constraintType: 'maxLength',
  constraintValue: 0,
} as const satisfies MaxLengthConstraint;

/**
 * DELETE GUARD 4 of 4 — declared verbatim from the document, and INERT. It never fires in the legacy
 * system, and it must not fire here either.
 *
 * [`model/validation/ProductType.json:L8`]
 * `"physicalCounts": [{"contexts":"delete","maxCollection":0}]`
 *
 * =============================================================================================
 * THE FINDING: THERE IS NO SUCH PROPERTY (guideline 6)
 * =============================================================================================
 * The document guards `physicalCounts`. The entity declares no such thing. What it declares is:
 *
 *     property name="physicals" singularname="physical" cfc="Physical" type="array"
 *     fieldtype="many-to-many" linktable="SwPhysicalProductType" fkcolumn="productTypeID"
 *     inversejoincolumn="physicalID" inverse="true";      [`model/entity/ProductType.cfc:L77`]
 *
 * The property is `physicals`. Across the component's declarations
 * (`model/entity/ProductType.cfc:L49-L120`) `physicalCounts` appears nowhere in the entity, and the
 * entity's own declared property-name union in `../../domain/product/ProductType`
 * confirms it independently — which is what the compile-time assertion on the identifier constant
 * above enforces.
 *
 * The consequence is exact: the engine's existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` answers false, so THE RULE IS SILENTLY SKIPPED — not
 * failed, not raised, not logged. IT HAS NEVER FIRED IN THE LEGACY SYSTEM.
 *
 * =============================================================================================
 * WHY IT IS DECLARED ANYWAY
 * =============================================================================================
 * AAP 0.7.3 S7 is preserve-and-annotate, and AAP 0.8.2 guideline 2 is "preserve existing functionality
 * and behavior exactly as-is for the in-scope modules". An inert rule faithfully preserved is
 * BEHAVIOURALLY IDENTICAL to the legacy system, because the port's own existence gate skips it for the
 * same reason the legacy engine does. A rule dropped, by contrast, is a divergence in the declaration
 * surface: the transliteration would no longer be a transliteration, the document's six properties
 * would become five, and the next reader comparing the two would have no way to tell a deliberate
 * omission from an oversight.
 *
 * RENAMING IT TO `physicals` IS THE SINGLE MOST TEMPTING AND MOST DAMAGING EDIT AVAILABLE IN THIS FILE.
 * It would ACTIVATE A GUARD THE LEGACY SYSTEM HAS NEVER RUN, blocking deletes the legacy system
 * permits — and it would do so silently, with no compile error and no failing test. It is forbidden,
 * as is dropping the rule. The physical-count domain is out of scope in any case
 * (AAP 0.2.2.1 excludes the whole `Physical*` family), so there is nothing on the far side of that
 * rename to validate against.
 *
 * =============================================================================================
 * THE FOURTH AND FINAL INSTANCE OF A FOLDER-WIDE PATTERN
 * =============================================================================================
 * Four of the seven in-scope documents guard a physical-count property that no entity declares, and
 * all four entities declare `physicals` instead:
 *
 *     document                          entity property that actually exists
 *     -------------------------------   -----------------------------------------------
 *     model/validation/Product.json:L7   physicals — model/entity/Product.cfc:L90
 *     model/validation/Sku.json:L13      physicals — model/entity/Sku.cfc:L87
 *     model/validation/Brand.json:L7     physicals — model/entity/Brand.cfc:L71
 *     model/validation/ProductType.json:L8   physicals — model/entity/ProductType.cfc:L77
 *
 * Seen once it looks like a typo; seen four times across four documents it is a consistent, deliberate
 * property of the legacy corpus, and the right response is to reproduce it four times rather than to
 * "fix" it four times.
 *
 * NO PARITY ANNOTATION IS RECORDED FOR THIS, and that is a considered decision rather than an
 * omission: a parity annotation marks a carried DEFECT, and this is faithfully reproduced legacy
 * behaviour that the port reproduces exactly. The plan's register is closed and no entry may be invented
 * for it. For completeness, the one defect that genuinely touches this entity — the unfiltered
 * inherited attribute-set assignment at `model/entity/ProductType.cfc:L92-L99`, whose own Todo sits at
 * `:L93` — is PROVEN UNREACHABLE FROM THIS FILE: this document constrains six properties and not one
 * of them is the attribute-set collection that method reads, nor does any other of the seven documents
 * touch it. It is annotated by `../../domain/product/ProductType`, which owns that member. THIS FILE
 * REQUIRES NO PARITY ANNOTATION OF ANY KIND.
 *
 * The key is constructed even though the rule cannot fire:
 * `validate.delete.ProductType.physicalCounts.maxCollection`.
 *
 * Collection-ceiling semantics are shared with the `products` guard above; see that declaration.
 */
export const physicalCountsMaxCollectionConstraint = {
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const satisfies MaxCollectionConstraint;

/* ==============================================================================================
 * SECTION 5 — THE SIX PROPERTY RULE SETS
 *
 * One per property key of the document, in the document's own key order, each pairing the error key
 * with the reader that gets the value and the rules that gate and constrain it.
 *
 * THE PROPERTY IDENTIFIER IS THE ERROR KEY. Every branch of the legacy reporter records a failure
 * against the full property identifier (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`,
 * `:L232`), never against the constraint that produced it. The trailing-segment form derived at
 * `:L208` shapes the message text only.
 *
 * EVERY READER IS A PURE, SYNCHRONOUS FIELD READ. Nothing here awaits, queries, formats or mutates.
 * The parameter and return types are annotated explicitly rather than inferred, so each reader states
 * its own contract and none of them depends on a synthesized accessor (see IR-1 in section 3).
 * ============================================================================================ */

/** `productTypeName` — required on save. See {@link productTypeNameRequiredConstraint}. */
export const productTypeNameValidation = {
  propertyIdentifier: PRODUCT_TYPE_NAME_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.productTypeName,
  rules: [
    {
      contexts: SAVE_CONTEXT,
      constraints: [productTypeNameRequiredConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/**
 * `urlTitle` — required AND unique on save.
 *
 * ONE RULE OBJECT, TWO CONSTRAINTS, declared in the source document's own key order: presence first,
 * then uniqueness. Both share this rule's single context gate, exactly as the legacy flattening copies
 * the gate onto each constraint record (`org/Hibachi/HibachiValidationService.cfc:L77-L88`), and both
 * report under the key `urlTitle`. See {@link urlTitleRequiredConstraint} and
 * {@link urlTitleUniqueConstraint}.
 */
export const urlTitleValidation = {
  propertyIdentifier: URL_TITLE_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.urlTitle,
  rules: [
    {
      contexts: SAVE_CONTEXT,
      constraints: [urlTitleRequiredConstraint, urlTitleUniqueConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `products` — delete guard. See {@link productsMaxCollectionConstraint}. */
export const productsValidation = {
  propertyIdentifier: PRODUCTS_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.products,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [productsMaxCollectionConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `childProductTypes` — delete guard. See {@link childProductTypesMaxCollectionConstraint}. */
export const childProductTypesValidation = {
  propertyIdentifier: CHILD_PRODUCT_TYPES_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.childProductTypes,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [childProductTypesMaxCollectionConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `systemCode` — the guard rail. See {@link systemCodeMaxLengthConstraint}. */
export const systemCodeValidation = {
  propertyIdentifier: SYSTEM_CODE_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.systemCode,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [systemCodeMaxLengthConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/**
 * `physicalCounts` — declared verbatim, inert by construction. See
 * {@link physicalCountsMaxCollectionConstraint} for the full finding.
 *
 * The reader exists because the shape requires one, and it reads the name the DOCUMENT declares rather
 * than the name the entity declares — which is the whole point. For any faithful product-type subject
 * the engine's existence gate answers false and this reader is NEVER INVOKED, exactly as the legacy
 * evaluator is never invoked for this rule. It is written as an honest read rather than as a hard-coded
 * absent value so that the behaviour stays governed by the gate rather than by an assumption baked in
 * here.
 */
export const physicalCountsValidation = {
  propertyIdentifier: PHYSICAL_COUNTS_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.physicalCounts,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [physicalCountsMaxCollectionConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/**
 * The transliterated `model/validation/ProductType.json`, ready to be handed to `../Validator`.
 *
 * SIX PROPERTIES, SIX RULE OBJECTS, SEVEN CONSTRAINTS — in the source document's key order, which is
 * also the deterministic evaluation order this port fixes. See the module header for the constraint
 * table and for why that determinism has no behavioural counterpart in the legacy engine.
 *
 * THE OPTIONAL CONDITIONS BLOCK IS OMITTED, NOT SET TO AN ABSENT VALUE. `model/validation/
 * ProductType.json` declares no conditions — only `model/validation/Product_UpdateSkus.json` does —
 * and under the compiler's `exactOptionalPropertyTypes` setting an optional member may be left out but
 * may NOT be assigned an explicit undefined. Omission is therefore both the faithful transcription and
 * the only form that compiles.
 *
 * USAGE: this value is passed as an argument, never imported by the engine —
 * `validator.validate(productType, productTypeValidationRuleSet, 'save')` on the save path and the
 * same call with the delete context on the delete path. One document serves both, because the legacy
 * documents select by context inside a single file rather than by having one file per context. The
 * caller is the service layer; nothing in this file invokes anything.
 */
export const productTypeValidationRuleSet = {
  properties: [
    productTypeNameValidation,
    urlTitleValidation,
    productsValidation,
    childProductTypesValidation,
    systemCodeValidation,
    physicalCountsValidation,
  ],
} as const satisfies ValidationRuleSet<ProductTypeValidationSubject>;
