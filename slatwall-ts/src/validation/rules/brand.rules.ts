/**
 * `brand.rules.ts` — the typed `Brand` rule set of the extracted Catalog slice.
 *
 * AAP 0.4.1.5 makes this file CREATE against `model/validation/Brand.json`: "brandName, URL data type on
 * brandWebsite, urlTitle uniqueness, delete guards". The seven catalog validation documents are an
 * IMPLICIT SCOPE ADDITION — AAP 0.2.1.5 records that the prompt names none of them and that they are
 * behavior rather than configuration, "interpreted at runtime by the validation service" and determining
 * "which saves and deletes succeed".
 *
 * The generic evaluation semantics every constraint below relies on — the null verdict per constraint,
 * the error key, context selection, the two deliberate non-ports and the absence of any memoisation — are
 * stated once in `../Validator` and are not repeated here.
 *
 * THE CENSUS — what this document declares, in its own key order:
 *
 *   line 3  brandName       contexts save    required
 *   line 4  brandWebsite    contexts save    dataType url
 *   line 5  urlTitle        contexts save    required + unique
 *   line 6  products        contexts delete  maxCollection 0
 *   line 7  physicalCounts  contexts delete  maxCollection 0   <- INERT
 *
 * Five properties, five rule objects — one per property, so every rule array here has length one, which
 * is a property of this document rather than of the model, since `Sku.options` carries two rule objects
 * and `Product.baseProductType` carries two — and six constraints: `required` twice, `maxCollection`
 * twice, `dataType` once, `unique` once. Two contexts and no others: `save` on three rule objects,
 * `delete` on two. Four of the thirteen keys are used; the rest are absent from the document and
 * therefore from this file, and declaring a rule the document does not declare would be fabrication under
 * AAP 0.7.3 S9.
 *
 * THE SIX MESSAGE KEYS THIS DOCUMENT EMITS, one per constraint, composed by `buildValidationMessage` in
 * `../Validator`:
 *
 *     validate.save.Brand.brandName.required
 *     validate.save.Brand.brandWebsite.dataType.url
 *     validate.save.Brand.urlTitle.required
 *     validate.save.Brand.urlTitle.unique
 *     validate.delete.Brand.products.maxCollection
 *     validate.delete.Brand.physicalCounts.maxCollection
 *
 * The second uses the `dataType` template at `org/Hibachi/HibachiValidationService.cfc:L226`, which
 * appends the constraint value; the other five use the general template at `:L230`, which does not. A
 * third template exists at `:L222` for `method` constraints and this document reaches none.
 *
 * THE CLASS-NAME SEGMENT IS THE BARE ENTITY NAME, and that needs saying precisely, because a plausible
 * misreading puts an `entity.` prefix into the key. `Brand` is persistent
 * (`model/entity/Brand.cfc:L49`), so the branch at `org/Hibachi/HibachiValidationService.cfc:L212` takes
 * its first arm and resolves the class name through `getLastEntityNameInPropertyIdentifier` at `:L213`;
 * that helper, at `org/Hibachi/HibachiService.cfc:L764-L775`, returns the entity name UNCHANGED whenever
 * the property identifier is a single segment, and all five identifiers here are single segments. The
 * `entity.` and `processObject.` prefixes at `:L214` and `:L217` are assigned to the template-substitution
 * structure, NOT to the key, so neither reaches the emitted string. Per DECISION D-1 in `../Validator`
 * that substitution pass is skipped, so these are KEYS, not sentences: nothing here or downstream
 * translates, sentence-cases, trims, normalises or beautifies one, and `../util/formatting` is
 * consequently not imported, because with the substitution skipped it would be dead code (AAP 0.8.2
 * guideline 4).
 *
 * X5 — THERE ARE TWO DELETE GUARDS IN THIS DOCUMENT, NOT ONE. `model/validation/Brand.json:L6` declares
 * one on `products` and `:L7` declares a second on `physicalCounts`, both `maxCollection` zero, both on
 * context `delete`, and both are transcribed below. They are not equivalent — the first is LIVE and the
 * second is INERT — and that difference is recorded at each declaration rather than averaged into one
 * statement. Neither fact is grounds for omitting either declaration; see B2b at the `physicalCounts`
 * declaration.
 *
 * P-2 — `delete` IS HARD-CODED WHERE `save` IS A DEFAULTED PARAMETER, a structural asymmetry that governs
 * which of the five rules below can fire and when. `org/Hibachi/HibachiService.cfc:L55` validates under
 * the literal context `delete`, so no caller can pass a different one or opt out, and the two delete
 * guards below are UNCONDITIONAL on the delete path. `org/Hibachi/HibachiService.cfc:L133` declares the
 * save context with a DEFAULT of `save`, so a caller may supply something else — which is how the
 * runtime-only contexts reach the engine.
 *
 * ALL FIVE RULE OBJECTS CARRY A CONTEXT LIST, and that has a consequence worth stating so a reader does
 * not mistake silence for omission: the gate at `org/Hibachi/HibachiValidationService.cfc:L71` applies a
 * rule in EVERY context when the rule declares no context list, and none of these five is such a rule. So
 * under the engine's own default empty context and under `edit`, `process` and `updateSkus`, THIS FILE
 * CONTRIBUTES NOTHING AT ALL. Exactly one of the seven documents inverts that property:
 * `model/validation/Product_UpdateSkus.json` declares both of its rules without a context list.
 *
 * DETERMINISTIC EVALUATION ORDER — A CHOICE WITH NO LEGACY COUNTERPART. The legacy engine iterated a CFML
 * structure to reach both properties and constraints (`org/Hibachi/HibachiValidationService.cfc:L156` and
 * `:L174`), and CFML structure key order is unspecified. This file fixes an order the legacy engine never
 * guaranteed: properties in the source document's key order, and inside the one rule object carrying two
 * constraints the source key order `required` then `unique`. It is a determinism choice rather than a
 * behaviour change, and the distinction rests on one fact — evaluation NEVER short-circuits and failures
 * ACCUMULATE, so visit order cannot change WHICH failures occur, only the sequence an accumulated list
 * reports them in. Fixing it is what makes that list reproducible, and therefore assertable at all.
 *
 * ONE BRAND-SPECIFIC NOTE ON THE CASCADE `../Validator` documents as a non-port: `Brand` to `products` to
 * `Product` is exactly the graph over which a reader might expect a cascading validation pass, and there
 * is none. The `products` guard below is a COLLECTION-SIZE CHECK AND NOTHING MORE; it never recursively
 * validates the products it counts.
 *
 * BRAND DECLARES NO NON-PERSISTENT PROPERTIES — `model/entity/Brand.cfc:L83-L85` is an empty block, which
 * corroborates AAP 0.2.2.6: "`Brand.cfc`, `Option.cfc` and `OptionGroup.cfc` declare no non-persistent
 * properties at all, so they are unaffected." That distinguishes this rule set from two of its siblings:
 * BRAND REACHES NO OUT-OF-SCOPE SERVICE THROUGH A CALCULATED PROPERTY, so unlike the Product and Sku rule
 * sets this file needs no boundary port to reach a calculated member. `UniquePropertyPort` is referenced
 * for the uniqueness contract alone and is never invoked from here. Note also that `physicals`
 * (`model/entity/Brand.cfc:L71`) is a DIFFERENT identifier from the document's `physicalCounts` — see
 * B2b at that declaration, where renaming is forbidden. The only numeric literals in this file are the
 * two source-declared `maxCollection` ceilings of zero at `model/validation/Brand.json:L6` and `:L7`.
 *
 * ARCHITECTURAL POSITION. AAP 0.7.3 S4 places this file in the innermost layer: it declares, it does not
 * execute. It imports from `../Validator`, `../../domain/product/Brand` and
 * `../../ports/UniquePropertyPort`, all three by relative path because AAP 0.4.3.5 fixes that —
 * "deliberately no path aliases — so `tsc` and `esbuild` resolve identically and no runtime resolver shim
 * is needed". Nothing is imported from the adapter, service, configuration, handler or integration
 * layers; no database driver; no environment read, `src/config/env.ts` being the subtree's sole permitted
 * reader; no third-party validation library, the runtime dependency set being closed (AAP 0.7.3 S5); and
 * no statement, table name or column name appears in a key, a value or any string literal, `SwBrand` and
 * `SwPhysicalBrand` appearing in prose only, which is the one place AAP 0.7.3 S2 permits them.
 *
 * NO CARRIED DEFECT CROSSES THIS DOCUMENT'S BOUNDARY, so this file carries no parity annotation. The
 * inertness recorded at the `physicalCounts` declaration is faithfully reproduced legacy behaviour rather
 * than a defect, and the register of carried defects is closed, so no identifier is invented for it. The
 * same applies to execution-model mismatches: this file carries none, the read-back loop belonging to the
 * Sku rule set. Legacy raise messages are cited by locator and never reproduced, not even inside a
 * comment: `org/Hibachi/HibachiService.cfc:L117`, `:L136` and `org/Hibachi/HibachiErrors.cfc:L50`.
 *
 * @see `../Validator` for the evaluation semantics every constraint below relies on.
 */

import type { BrandPropertyName } from '../../domain/product/Brand';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  PropertyValidation,
  UniqueTargetResolver,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/* ================================================================================================
 * THE SUBJECT SHAPE — WHAT THESE FIVE RULES READ, AND NOTHING MORE
 * ============================================================================================== */

/**
 * The narrowest object shape these five rules can be evaluated against.
 *
 * WHY A SHAPE AND NOT THE `Brand` CLASS ITSELF. `../Validator` evaluates a rule set against a
 * subject that must expose two members — a class-name accessor and a property-existence test — and
 * `src/domain/product/Brand.ts` DELIBERATELY DECLARES NEITHER. Its own negative mandate lists both
 * among the framework members it refuses to carry, on the grounds that AAP 0.8.3.2 retires
 * `org/Hibachi/**` rather than porting it. A rule set typed against the entity class would
 * therefore not type-check at all, and forcing those two members onto the entity to make it fit
 * would push framework machinery back into the domain layer that just finished shedding it.
 *
 * So the shape is structural and minimal: the two subject members `../Validator` requires, plus
 * EXACTLY the four members these rules read. Structural typing means the eventual Brand-shaped
 * subject satisfies it without declaring that it does, and a hand-written object literal in a test
 * satisfies it too — which matters, because AAP 0.4.3.6 records that the legacy repository ships no
 * mocking library and the target suite substitutes plain doubles instead.
 *
 * THE FOUR READ MEMBERS MIRROR `model/entity/Brand.cfc` EXACTLY, and their optionality is that
 * file's, not a convenience:
 *   - `brandName` (`:L56`), `brandWebsite` (`:L57`) and `urlTitle` (`:L55`) are string columns with
 *     no declared default, so an unpopulated one is genuinely ABSENT. Under
 *     `exactOptionalPropertyTypes` absent means the key is missing and never present-and-undefined,
 *     which is the distinction the presence and data-type rules below actually turn on.
 *   - `products` (`:L61`) is a collection and is optional here for one reason only: the collection
 *     ceiling at `org/Hibachi/HibachiValidationService.cfc:L309-L315` PASSES on an absent value, so
 *     a subject that omits it is a legitimate input whose behaviour is specified. The concrete
 *     entity never omits it — `src/domain/product/Brand.ts` initialises it to an empty array — and
 *     the difference between those two routes to the same verdict is recorded at the `products`
 *     declaration below.
 * The element type is left at the unknown top type because the ceiling rule reads a LENGTH and
 * nothing else; narrowing it would couple this file to the product entity for no gain, and widening
 * the property itself past a collection would discard the one fact about it that is documented.
 *
 * `physicalCounts` IS DELIBERATELY ABSENT FROM THIS SHAPE. That absence is load-bearing rather than
 * an omission, and it is what makes the fifth rule below inert exactly as the legacy system leaves
 * it. See B2b at that declaration.
 */
export interface BrandValidationSubject extends ValidationSubject {
  /** `model/entity/Brand.cfc:L56` — read by the presence rule at `model/validation/Brand.json:L3`. */
  readonly brandName?: string;

  /** `model/entity/Brand.cfc:L57` — read by the data-type rule at `model/validation/Brand.json:L4`. */
  readonly brandWebsite?: string;

  /**
   * `model/entity/Brand.cfc:L55` — read by BOTH constraints of
   * `model/validation/Brand.json:L5`.
   */
  readonly urlTitle?: string;

  /**
   * `model/entity/Brand.cfc:L61` — read by the live delete guard at
   * `model/validation/Brand.json:L6`.
   */
  readonly products?: readonly unknown[];
}

/**
 * Resolves the entity a `Brand` uniqueness check runs against: the subject itself.
 *
 * THE FAITHFUL TRANSLITERATION OF A SINGLE-SEGMENT IDENTIFIER LOOKUP. `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L469` resolves the last object along the property
 * identifier before handing it to the port. `urlTitle` is a single segment containing neither a dot
 * nor an underscore, so that walk terminates immediately and the resolved object IS the subject.
 * `../Validator` documents the same conclusion for all seven uniqueness rules of the slice.
 *
 * WHY IT IS A SEPARATE FUNCTION RATHER THAN AN ASSUMPTION BAKED INTO THE RULE. The port needs FIVE
 * accessors of its own — the ones `org/Hibachi/HibachiDAO.cfc:L134-L138` invokes, in that order —
 * and `../Validator` states explicitly that requiring them of every validated subject "would widen
 * the subject contract for the benefit of seven rules". {@link BrandValidationSubject} consequently
 * does NOT demand them, and the parameter type here is the intersection that does: a caller whose
 * subject satisfies both shapes passes this function straight into
 * {@link createBrandValidationRules}, and a caller whose subject reaches the port some other way
 * injects its own resolver instead. Either way the choice is made at the composition root, which is
 * what AAP 0.7.3 S3 requires — "Constructor injection only. No service locator, no dynamic method
 * synthesis, no string-keyed runtime resolution."
 *
 * IT PERFORMS NO CHECK. It selects a target; `../Validator` calls the port and `src/adapters/mysql`
 * runs the statement. Nothing in this file queries anything.
 *
 * @param subject the Brand-shaped subject being validated, which is also the entity the port checks
 * @returns that same subject, as the port's entity shape
 */
export function resolveBrandUniqueTarget(
  subject: BrandValidationSubject & UniquePropertyEntity,
): UniquePropertyEntity {
  return subject;
}

/* ================================================================================================
 * THE FIVE PROPERTY IDENTIFIERS — FOUR COMPILE-CHECKED AS REAL, ONE COMPILE-CHECKED AS ABSENT
 *
 * `src/domain/product/Brand.ts` exports the union of every property name
 * `model/entity/Brand.cfc` declares. Constraining each identifier against that union turns the
 * central finding of this file into a COMPILE ERROR rather than a comment somebody has to remember:
 * four of this document's five keys name real Brand properties, and the fifth does not.
 *
 * `Extract` of a name that is a member yields that name, so the four assignments below type-check.
 * Were one of those properties renamed or removed in the entity, `Extract` would yield the empty
 * type and the assignment would fail — which is the point. `Exclude` of a name that is NOT a member
 * likewise yields that name, so the fifth assignment type-checks precisely BECAUSE the property is
 * absent; if `physicalCounts` were ever added to the entity, that assignment would fail and force a
 * reader back to B2b before the guard could silently come alive.
 * ============================================================================================== */

/** `model/validation/Brand.json:L3` against `model/entity/Brand.cfc:L56`. */
const BRAND_NAME_IDENTIFIER: Extract<BrandPropertyName, 'brandName'> = 'brandName';

/** `model/validation/Brand.json:L4` against `model/entity/Brand.cfc:L57`. */
const BRAND_WEBSITE_IDENTIFIER: Extract<BrandPropertyName, 'brandWebsite'> = 'brandWebsite';

/** `model/validation/Brand.json:L5` against `model/entity/Brand.cfc:L55`. */
const URL_TITLE_IDENTIFIER: Extract<BrandPropertyName, 'urlTitle'> = 'urlTitle';

/** `model/validation/Brand.json:L6` against `model/entity/Brand.cfc:L61`. */
const PRODUCTS_IDENTIFIER: Extract<BrandPropertyName, 'products'> = 'products';

/**
 * `model/validation/Brand.json:L7` against an entity that declares NO SUCH PROPERTY.
 *
 * The empty-type outcome is inverted here on purpose: this identifier is checked to be OUTSIDE the
 * entity's property-name union, which is the compile-checked form of the B2b finding below.
 */
const PHYSICAL_COUNTS_IDENTIFIER: Exclude<'physicalCounts', BrandPropertyName> = 'physicalCounts';

/**
 * `brandName` must be present when a Brand is saved.
 *
 * Transcribed from `model/validation/Brand.json:L3`:
 *
 *     "brandName": [{"contexts":"save","required":true}]
 *
 * THIS RULE IS THE SOLE ENFORCEMENT OF A BRAND HAVING A NAME. `model/entity/Brand.cfc:L56` reads,
 * byte-exactly:
 *
 *     property name="brandName" ormtype="string" hint="This is the common name that the brand
 *              goes by.";
 *
 * No `required` attribute, no `length` attribute, no `unique` attribute. There is consequently NO
 * database-level constraint behind this rule and no second mechanism to fall back on, so dropping it
 * as redundant — the reflex a reader who assumes the schema enforces presence will have — would make
 * unnamed Brands saveable. The slice repeats the pattern twice more: `Option.optionGroup` at
 * `model/entity/Option.cfc:L59` and `Product.productType` at `model/entity/Product.cfc:L69` are both
 * required by their validation document alone.
 *
 * THE PRESENCE PREDICATE, from `org/Hibachi/HibachiValidationService.cfc:L240-L245`, is not a simple
 * truthiness test and the differences are observable:
 *   - absent          FAILS
 *   - the empty text  FAILS
 *   - whitespace only FAILS — the predicate trims before measuring length
 *   - the text "0"    PASSES, being a non-empty simple value. No falsy check is added here.
 * `../Validator` implements those semantics; this file must not layer a defensive guard on top,
 * because an extra constraint changes which saves succeed.
 *
 * NO LENGTH CEILING IS DECLARED, and there is nothing to derive one from — see the note at
 * {@link createUrlTitlePropertyValidation}. No pattern rule either: the three pattern rules across
 * the seven documents all sit on code properties, never on a display name.
 *
 * Emits `validate.save.Brand.brandName.required`.
 */
export const brandNamePropertyValidation = Object.freeze({
  propertyIdentifier: BRAND_NAME_IDENTIFIER,
  read: (subject: BrandValidationSubject): unknown => subject.brandName,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'save',
      constraints: Object.freeze([
        Object.freeze({ constraintType: 'required', constraintValue: true } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/**
 * `brandWebsite` must read as a URL when a Brand is saved — and may be absent.
 *
 * Transcribed from `model/validation/Brand.json:L4`:
 *
 *     "brandWebsite": [{"contexts":"save","dataType":"url"}]
 *
 * TWO DIFFERENT `url` MENTIONS EXIST FOR THIS ONE PROPERTY, AND THEY ARE DIFFERENT MECHANISMS.
 * Conflating them is the mistake this comment exists to prevent, because it leads either to
 * implementing the check twice or to assuming the ORM metadata already supplies it.
 * `model/entity/Brand.cfc:L57` reads, byte-exactly:
 *
 *     property name="brandWebsite" ormtype="string" hb_formatType="url" hint="This is the Website
 *              of the brand";
 *
 *   - `hb_formatType="url"` is a DISPLAY AND FORMATTING HINT, consumed by the retired framework's
 *     administrative rendering layer. That tree is explicitly out of scope (AAP 0.2.2.2) and the
 *     target is a headless service with no rendering layer of its own (AAP 0.3.4). THE HINT IS
 *     THEREFORE DEAD FOR THIS PORT — it drives nothing and is not carried across in form.
 *   - `dataType: "url"` at `model/validation/Brand.json:L4` is the LIVE VALIDATION CONSTRAINT, and in
 *     the port it is the only URL-related mechanism that survives.
 *
 * THIS IS THE FOLDER'S ONLY NON-NUMERIC DATA TYPE. Across the seven in-scope documents,
 * `dataType` occurs seven times with only two distinct values: `numeric` six times — at
 * `model/validation/Product.json:L8`, `model/validation/Sku.json:L4`, `:L9` and `:L10`, and both rules of
 * `model/validation/Product_UpdateSkus.json` — and `url` exactly once, here.
 *
 * ENGINE SEMANTICS, from `org/Hibachi/HibachiValidationService.cfc:L256-L266`:
 *   - it PASSES ON AN ABSENT VALUE (`:L259`), so an unset website is valid;
 *   - the permitted values are a twenty-six-value whitelist at `:L258`, of which `url` is a member;
 *   - an off-whitelist value RAISES at `:L263` rather than reporting a failure. The typed analogue
 *     is stronger: `../Validator` closes the data-type values to a two-member union, so an
 *     off-whitelist value is a COMPILE error and can never reach run time.
 * THE URL PREDICATE ITSELF BELONGS TO `../Validator`. This file only declares the constraint; it
 * does not implement, inline, approximate or supplement the check.
 *
 * ⛔ THIS DECLARATION SELECTS NO POLICY, BECAUSE THERE IS NO POLICY TO SELECT — SEC-15's POLICY SPLIT
 * STAYS WITHDRAWN. An earlier revision split `../Validator`'s `url` data type into two policies,
 * required every declaration to name one, and had this declaration name `'webAddress'`: a normalised
 * HTTP(S) address admitting only `http` and `https` and additionally rejecting embedded credentials and
 * ASCII control characters. It was declared as a departure from byte-for-byte preservation on the D18
 * precedent.
 *
 * The PROTOCOL NARROWING half of that departure is withdrawn and stays withdrawn. D18 (AAP 0.6.7.7) is
 * a precedent for a divergence that removes a flaw class without refusing a value the legacy accepted
 * AND MEANT, and the engine's six documented `url` protocols include FTP, FILE, MAILTO and NEWS — so a
 * brand carrying `file:///etc/passwd` or a contact `mailto:` SAVED under `:L259` and failed validation
 * under the withdrawn policy. AAP 0.8.2 guideline 4 forbids enhancement beyond what the migration
 * requires, AAP 0.6.7 mandates "preserve and annotate, do not repair", and AAP 0.2.1.5 states this
 * document's contract as `brandWebsite` "typed as a URL" with no narrowing to web schemes.
 *
 * ⭐ TWO SYNTACTIC RULES DID COME BACK, AND DELIBERATELY NOT AS A POLICY MEMBER. `../Validator`'s single
 * predicate now also refuses any value carrying an ASCII control character (a parity CORRECTION — RFC
 * 3986 §2 admits no raw control character in a URI, so `isValid(…, "url")` was never accepting one as
 * valid) and any value whose AUTHORITY carries userinfo credentials (a narrow DECLARED departure —
 * CWE-601 deceptive authority, and RFC 3986 §3.2.1 deprecates the form). Neither rejects a protocol, so
 * all six still pass here. They are unconditional inside the predicate rather than selectable from this
 * declaration, which is both simpler and stricter than a policy union: there is no member a future
 * declaration could set to opt out. THE SIX-PROTOCOL URL CHECK IS STILL THE WHOLE CHECK in
 * `../Validator` carries the full record, including the residual non-web-scheme exposure that remains
 * flagged and the reason this slice's own output does not reach it.
 *
 * THE MESSAGE KEY IS UNAFFECTED BY ANY OF THESE STATES. It is composed from `constraintValue`, which is
 * `'url'`, so this rule emits `validate.save.Brand.brandWebsite.dataType.url` byte-for-byte before the
 * split, after its withdrawal, and after the two reinstated rules. Introducing a new `constraintValue`
 * such as `'webUrl'` would have changed that key and broken comparability with legacy output, and was
 * rejected for that reason at the time.
 *
 * NOTHING ELSE IS INFERRED FROM THE PROPERTY. `model/entity/Brand.cfc:L57` carries no `required`, no
 * pattern and no `length`, so no presence rule is added — an unset website is legal and the data-type
 * check passes on absence — no URL pattern is added "to be safe", and no length ceiling is added. The
 * value is likewise never normalised, trimmed, lowercased or canonicalised: this file declares
 * constraints, it does not transform values.
 *
 * Emits `validate.save.Brand.brandWebsite.dataType.url` — the one key of the six that uses the
 * data-type template at `org/Hibachi/HibachiValidationService.cfc:L226` and therefore carries the
 * constraint value as its final segment.
 */
export const brandWebsitePropertyValidation = Object.freeze({
  propertyIdentifier: BRAND_WEBSITE_IDENTIFIER,
  read: (subject: BrandValidationSubject): unknown => subject.brandWebsite,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'save',
      constraints: Object.freeze([
        Object.freeze({
          constraintType: 'dataType',
          constraintValue: 'url',
        } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/**
 * `urlTitle` must be present AND unique when a Brand is saved.
 *
 * Transcribed from `model/validation/Brand.json:L5`:
 *
 *     "urlTitle": [{"contexts":"save","required":true,"unique":true}]
 *
 * ONE RULE OBJECT CARRYING TWO CONSTRAINTS, AND THE FLATTENING MATTERS.
 * `org/Hibachi/HibachiValidationService.cfc:L77-L88` explodes a rule object into ONE CONSTRAINT
 * RECORD PER KEY, copying the selection keys onto each record. The two below are therefore INDEPENDENT
 * constraints, each able to contribute its OWN failure under the SAME error key `urlTitle`:
 *
 *     validate.save.Brand.urlTitle.required
 *     validate.save.Brand.urlTitle.unique
 *
 * Evaluation NEVER SHORT-CIRCUITS and failures ACCUMULATE, which is precisely why the error bag holds
 * an array per key rather than one message. Both are declared here; the flattening and the
 * accumulation belong to `../Validator`. They are declared in the source document's own key order,
 * `required` then `unique`, per the determinism note in the module header.
 *
 * THE ERROR KEY IS THE PROPERTY IDENTIFIER, NEVER THE CONSTRAINT NAME. All three reporting branches
 * — `org/Hibachi/HibachiValidationService.cfc:L224`, `:L228` and `:L232` — pass exactly two
 * arguments, the FULL property identifier and the message. The trailing-segment form computed at
 * `:L208` is used to build the message only and never as the key; the three-argument reporting
 * override at `org/Hibachi/HibachiEntity.cfc:L151` is an entity concern that the validation engine
 * never reaches for.
 *
 * ---------------------------------------------------------------------------------------------
 * DUAL ENFORCEMENT — AND WHY THE APPLICATION RULE IS STILL MANDATORY
 * ---------------------------------------------------------------------------------------------
 * `model/entity/Brand.cfc:L55` reads, byte-exactly:
 *
 *     property name="urlTitle" ormtype="string" unique="true" hint="This is the name that is used
 *              in the URL string";
 *
 * So this property is guarded TWICE and by two independent mechanisms: `unique="true"` in the column
 * metadata, and `unique: true` in the validation document. IR-5 is explicit that the second does not
 * become redundant because of the first: "Application-side uniqueness checking is required in
 * addition to database constraints. `HibachiDAO.isUniqueProperty()`
 * [org/Hibachi/HibachiDAO.cfc:L130-L146] enforces uniqueness with an HQL existence query during
 * validation, independently of the `unique=\"true\"` column metadata. Five of the eight unique
 * columns declared in the whole system belong to this slice, so the same pre-save check must exist in
 * the port." The application-side check is retained IN ADDITION TO the database constraint — not as a
 * substitute for it, and not as an optimisation to be removed later.
 *
 * `Sku.skuCode` at `model/entity/Sku.cfc:L54` is the only other dually enforced property in the
 * slice. The contrast with `Option.optionCode` at `model/entity/Option.cfc:L53` and
 * `OptionGroup.optionGroupCode` at `model/entity/OptionGroup.cfc:L54` is deliberate and worth
 * recording: NEITHER of those carries `unique="true"`, so for them the validation document is the
 * ONLY uniqueness mechanism in the system.
 *
 * ---------------------------------------------------------------------------------------------
 * NO LENGTH CEILING IS DECLARED, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------------
 * `model/entity/Brand.cfc:L55` carries NO `length` attribute, and neither does `:L56`. This is the
 * mirror image of the sharpest temptation in the Sku rule set, where `model/entity/Sku.cfc:L54`
 * declares `length="50"` while `model/validation/Sku.json` declares no length ceiling at all, so a
 * reader is tempted to invent one from the column width. Here there is no column width to be tempted
 * by — and the correct action is identical: DECLARE NONE. Across the seven documents a length ceiling
 * occurs EXACTLY ONCE, on `systemCode` at `model/validation/ProductType.json:L7`, with a value of
 * zero. Stated positively here so a reader comparing the two files does not read the absence as an
 * oversight.
 *
 * ---------------------------------------------------------------------------------------------
 * ONE OF THE SEVEN `unique` RULES IN THE SLICE
 * ---------------------------------------------------------------------------------------------
 * `model/validation/Brand.json:L5` is one of seven; `../Validator` carries all seven locators under
 * DECISION D-2 AND "THE SEVEN", and `model/validation/Product_UpdateSkus.json` contributes none.
 * AAP IR-5's "five of the eight unique columns" counts entity COLUMN METADATA, which IR-5 itself
 * identifies as the separate mechanism — "independently of the `unique="true"` column metadata" — so
 * the two numbers are correct about different things and neither should be "fixed" into the other.
 *
 * ---------------------------------------------------------------------------------------------
 * RATIFIED DECISION D-2 — UNIQUENESS GOES THROUGH THE PORT, AND ONLY THROUGH THE PORT
 * ---------------------------------------------------------------------------------------------
 * The constraint is evaluated exclusively through the injected `UniquePropertyPort`, reached from
 * `../Validator` and imported here type-only so no run-time edge is created from this layer to an
 * adapter. There is no ad-hoc query in this file, and the database constraint alone is explicitly not
 * relied upon (IR-5). The target selector is a value on the constraint rather than a lookup: see
 * {@link resolveBrandUniqueTarget}.
 *
 * POLARITY, PINNED — `true` MEANS UNIQUE, WHICH MEANS SAFE TO SAVE:
 * `org/Hibachi/HibachiDAO.cfc:L142-L144` returns false when the existence query finds
 * rows, and `:L146` returns true when it finds none. Inverting this is SILENT — every uniqueness rule
 * in the slice would pass when it should fail, with no compile error and no lint finding — so a test
 * must exercise the COLLIDING case; one that only covers the non-colliding path passes under either
 * polarity.
 *
 * THREE FURTHER ENGINE FACTS, recorded because each looks like something to improve and none may be:
 *   - THE SELF-EXCLUSION TERM IS A NO-OP ON INSERT. The existence query excludes the row under
 *     validation by comparing primary identifiers (`org/Hibachi/HibachiDAO.cfc:L140`, using the
 *     values read at `:L136-L137`). A row being inserted has no assigned identifier yet, so the term
 *     excludes nothing and the check degenerates to a plain existence test. It is live and load-
 *     bearing on update, where it stops a row colliding with itself. Noted, not special-cased.
 *   - AN ABSENT VALUE PASSES INDIRECTLY. `validate_unique` at
 *     `org/Hibachi/HibachiValidationService.cfc:L467-L470` contains NO absence guard: it delegates
 *     straight to the port. The port must therefore not raise on an absent value, not translate it
 *     into a null-comparison predicate, and not report it as taken. On the save path the presence
 *     constraint above already fails for an absent value, so both failures accumulate under the one
 *     key.
 *   - THE CONSTRAINT VALUE IS DECLARED BUT UNREAD by that evaluator, so the check always runs. A
 *     flag of `true` is the only form these documents use and there is no `false` form. The field is
 *     kept so this rule transcribes its source line faithfully.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE THE UNIQUE TITLE COMES FROM — CONTEXT ONLY, NOT THIS FILE'S CONCERN
 * ---------------------------------------------------------------------------------------------
 * `model/service/BrandService.cfc:L67-L77` assigns a unique URL title before delegating to the
 * inherited save, calling the generator at `:L70` and `:L72` against the `SwBrand` table. The
 * generator itself is `model/service/DataService.cfc:L53-L71`, ported verbatim to
 * `src/util/urlTitle.ts` — including the detail that the first collision suffix is `-2` rather than
 * `-1`, because the counter is pre-incremented. Generator and constraint therefore operate on the
 * same physical table. That table name appears in this sentence and nowhere else: never in a key,
 * a value, a constant or a string literal, per AAP 0.7.3 S2. `src/util/urlTitle.ts` is NOT imported —
 * this file declares a constraint, it does not generate values.
 *
 * @param resolveUniqueTarget selects the entity the port checks. Pass
 *   {@link resolveBrandUniqueTarget} when the subject is itself that entity, which is the shape all
 *   seven single-segment uniqueness rules of the slice take.
 * @returns the `urlTitle` property validation, carrying both constraints in source key order
 */
export function createUrlTitlePropertyValidation<TSubject extends BrandValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): PropertyValidation<TSubject> {
  return Object.freeze({
    propertyIdentifier: URL_TITLE_IDENTIFIER,
    read: (subject: BrandValidationSubject): unknown => subject.urlTitle,
    rules: Object.freeze([
      Object.freeze({
        contexts: 'save',
        constraints: Object.freeze([
          Object.freeze({ constraintType: 'required', constraintValue: true } as const),
          Object.freeze({
            constraintType: 'unique',
            constraintValue: true,
            uniqueTarget: resolveUniqueTarget,
          } as const),
        ] as const),
      } as const),
    ] as const),
  } as const);
}

/**
 * A Brand carrying any Product cannot be deleted.
 *
 * Transcribed from `model/validation/Brand.json:L6`:
 *
 *     "products": [{"contexts":"delete","maxCollection":0}]
 *
 * THIS IS THE FIRST OF THE TWO DELETE GUARDS THIS DOCUMENT DECLARES. See the X5 note in the module
 * header: prose summaries of this document name only this one, but `:L7` declares a second.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS GUARD IS LIVE, AND IT READS A REAL PERSISTENT RELATIONSHIP
 * ---------------------------------------------------------------------------------------------
 * `model/entity/Brand.cfc:L61` reads, byte-exactly:
 *
 *     property name="products" singularname="product" cfc="Product" type="array"
 *              fieldtype="one-to-many" fkcolumn="brandID" inverse="true";
 *
 * The property EXISTS, so the property-presence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` passes and the rule FIRES. Effect: a Brand with any
 * Product attached cannot be deleted.
 *
 * WORTH CONTRASTING WITH THE SKU RULE SET, because the folder is not uniform. In
 * `model/validation/Sku.json` NONE of the three delete guards reads a persistent column — two read
 * non-persistent calculated flags and one names a property the entity does not declare at all. Here
 * the guarded member is a real persistent relationship. A reader who generalises from the Sku file
 * would misread this one.
 *
 * ---------------------------------------------------------------------------------------------
 * `Brand.products` CARRIES NO CASCADE AT ALL
 * ---------------------------------------------------------------------------------------------
 * `model/entity/Brand.cfc:L61` declares `fieldtype`, `fkcolumn`, `inverse` and `type` and NO cascade
 * attribute whatsoever. That distinguishes it from every other
 * collection delete guard across these seven documents:
 *
 *     Brand.products                  model/entity/Brand.cfc:L61        none
 *     OptionGroup.options             model/entity/OptionGroup.cfc:L70  all-delete-orphan
 *     ProductType.childProductTypes   model/entity/ProductType.cfc:L65  all
 *     ProductType.products            model/entity/ProductType.cfc:L66  all  (with lazy="extra")
 *
 * Consequence: the cascade-versus-guard tension that has to be flagged for the OptionGroup and
 * ProductType rule sets — where a configured cascade would remove children while the validation rule
 * blocks the parent removal outright, so the two directives disagree about what a delete means — DOES
 * NOT EXIST HERE. This `maxCollection` guard is the sole mechanism, and there is no competing ORM
 * directive to reconcile it against. Recorded because a reader who has met
 * the tension in the sibling files would otherwise assume it applies here too.
 *
 * Note also that no cascade means no ORM-driven removal of the Products, which is consistent with the
 * guard's intent — the legacy system refuses the delete rather than propagating it.
 *
 * ---------------------------------------------------------------------------------------------
 * COLLECTION-CEILING SEMANTICS — `org/Hibachi/HibachiValidationService.cfc:L309-L315`
 * ---------------------------------------------------------------------------------------------
 *   - AN ABSENT COLLECTION PASSES. An unset member does not block the delete.
 *   - AN EMPTY ARRAY PASSES A CEILING OF ZERO, because the length comparison is `<=`.
 *   - A STRUCT IS ACCEPTED as a collection and compared by key count.
 *   - A PRESENT NON-COLLECTION SIMPLE VALUE FAILS. The evaluator expects a collection, and a scalar
 *     satisfies none of its three accepted forms.
 *
 * THE EMPTY-ARRAY AND ABSENT CASES REACH THE SAME OUTCOME BY DIFFERENT PATHS, and the distinction is
 * pinned by the one piece of traceable legacy coverage this entity has.
 * `meta/tests/unit/entity/BrandTest.cfc:L49-L62` overrides the inherited defaults assertion for the
 * sole purpose of requiring that the products accessor on a new instance yields an EMPTY ARRAY, and
 * the sibling `../../domain/product/Brand` correspondingly mandates that the member initialise to an
 * empty array and never be left unset. So in practice this guard always takes the EVALUATION path
 * (length zero satisfies the ceiling), never the ABSENCE short-circuit. Both permit the delete, so the
 * observable outcome coincides — but only the empty-array path is what the legacy test pins, and
 * `Brand.test.ts` is one of only TWO traceable domain tests in the entire port, so this rule is kept
 * individually importable and individually assertable rather than being reachable only through the
 * assembled rule set (AAP 0.7.3 S6).
 *
 * Emits `validate.delete.Brand.products.maxCollection`.
 */
export const productsPropertyValidation = Object.freeze({
  propertyIdentifier: PRODUCTS_IDENTIFIER,
  read: (subject: BrandValidationSubject): unknown => subject.products,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'delete',
      constraints: Object.freeze([
        Object.freeze({ constraintType: 'maxCollection', constraintValue: 0 } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/**
 * The second delete guard — transcribed verbatim, and INERT in the legacy system.
 *
 * Transcribed from `model/validation/Brand.json:L7`:
 *
 *     "physicalCounts": [{"contexts":"delete","maxCollection":0}]
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS RULE NEVER FIRES
 * ---------------------------------------------------------------------------------------------
 * The document guards a member named `physicalCounts`. THE ENTITY DECLARES NO SUCH MEMBER. What it
 * declares is `physicals`, at `model/entity/Brand.cfc:L71`:
 *
 *     property name="physicals" hb_populateEnabled="false" singularname="physical" cfc="Physical"
 *              type="array" fieldtype="many-to-many" linktable="SwPhysicalBrand" fkcolumn="brandID"
 *              inversejoincolumn="physicalID" inverse="true";
 *
 * `model/entity/Brand.cfc:L49-L85` — every persistent property, every relationship property, the
 * remote identifier, the four audit properties and the empty non-persistent block — contains no
 * `physicalCounts` anywhere. The only entity that declares a member of
 * that name is `model/entity/Physical.cfc:L59`, which is why this line reads as a transcription
 * artefact carried from the Physical document rather than a rule authored for Brand.
 *
 * The gate at `org/Hibachi/HibachiValidationService.cfc:L171` is a property-presence test, and a rule
 * whose property is absent from the object is SILENTLY SKIPPED — no error, no warning, no log. SO
 * THIS RULE NEVER FIRES IN THE LEGACY SYSTEM.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THAT DOES AND DOES NOT LICENCE
 * ---------------------------------------------------------------------------------------------
 *   - IT IS DECLARED VERBATIM ANYWAY. Refactor Discipline Guideline 2 requires that existing
 *     behaviour be preserved exactly as-is for the in-scope modules, and AAP 0.7.3 S7 is
 *     preserve-and-annotate. An inert rule preserved is behaviourally identical to the legacy system;
 *     an inert rule dropped is a divergence in the document's content, and a reader diffing this file
 *     against its 8-line source would find a line missing with no explanation.
 *   - IT IS NOT RENAMED to `physicals`. That is the single most tempting and most damaging edit
 *     available in this file: it would ACTIVATE A GUARD THE LEGACY SYSTEM NEVER RUNS, blocking
 *     deletes the legacy system permits, and it would do so silently — the rename compiles, reads as
 *     a bug fix, and changes which Brands can be deleted. Guideline 4 forbids it.
 *   - IT IS NOT ANNOTATED AS A CARRIED DEFECT. This is faithfully reproduced legacy behaviour, not a
 *     defect crossing into the port, so it belongs in this comment rather than in a parity marker.
 *   - NO MEMBER IS ADDED ANYWHERE TO MAKE IT FIRE. Nothing in the plan calls for one, the Physical
 *     domain is explicitly out of scope, and the inertness is instead made a COMPILE-CHECKED
 *     INVARIANT by {@link PHYSICAL_COUNTS_IDENTIFIER}, whose type resolves only while the identifier
 *     is absent from the entity's property-name union.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SAME INERT GUARD APPEARS IN FOUR OF THE SEVEN DOCUMENTS
 * ---------------------------------------------------------------------------------------------
 * Recorded so that a reader meeting the second, third or fourth instance recognises the pattern
 * instead of re-diagnosing it from scratch. In every case the document names `physicalCounts` and the
 * entity declares `physicals`:
 *
 *     model/validation/Product.json:L7      vs  model/entity/Product.cfc:L90
 *     model/validation/Sku.json:L13         vs  model/entity/Sku.cfc:L87
 *     model/validation/Brand.json:L7        vs  model/entity/Brand.cfc:L71     <- THIS RULE
 *     model/validation/ProductType.json:L8  vs  model/entity/ProductType.cfc:L77
 *
 * The reader here is deliberately total rather than reaching for a member that cannot exist: the
 * subject contract omits the identifier by design, so there is nothing to read, and the value it
 * yields is the absent value that the collection ceiling passes on
 * (`org/Hibachi/HibachiValidationService.cfc:L309-L315`). It is unreachable in any case, because the
 * presence gate at `:L171` rejects the property before any reader is consulted — the reader exists
 * only to satisfy the shape the sibling requires of every property validation.
 *
 * Emits `validate.delete.Brand.physicalCounts.maxCollection` — the key this rule WOULD produce, and
 * one of the six the module header enumerates. It is transcribed and assertable, but the legacy system
 * never reaches it.
 */
export const physicalCountsPropertyValidation = Object.freeze({
  propertyIdentifier: PHYSICAL_COUNTS_IDENTIFIER,
  read: (): unknown => undefined,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'delete',
      constraints: Object.freeze([
        Object.freeze({ constraintType: 'maxCollection', constraintValue: 0 } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/**
 * The complete `Brand` rule set — the typed equivalent of the whole of
 * `model/validation/Brand.json`.
 *
 * FIVE PROPERTY VALIDATIONS, IN THE SOURCE DOCUMENT'S OWN KEY ORDER: `brandName` (`:L3`),
 * `brandWebsite` (`:L4`), `urlTitle` (`:L5`), `products` (`:L6`), `physicalCounts` (`:L7`). Five rule
 * objects, six constraints, four of the thirteen constraint keys. Nothing is added and nothing is
 * dropped; the census in the module header is the assertion target.
 *
 * THE CONDITION LIST IS OMITTED RATHER THAN SET EMPTY. `model/validation/Brand.json` declares no
 * conditional block — across the seven documents conditions occur only in
 * `model/validation/Product_UpdateSkus.json` — so the optional member is left off the object
 * entirely. Under `exactOptionalPropertyTypes` an explicitly-undefined optional member is NOT the
 * same type as an absent one, so writing it out as undefined would not compile against the sibling's
 * declaration. Absence is both the correct transcription and the only form that type-checks.
 *
 * THE RESULT IS FROZEN AT EVERY LEVEL and contains no behaviour beyond the pure readers. That is what
 * makes the non-mutating evaluation contract satisfiable: the sibling evaluator returns its error bag
 * and supports a mode that records nothing — proven three ways in the legacy engine, by the
 * error-recording switch in the signature at `org/Hibachi/HibachiValidationService.cfc:L153`, by the
 * bag being returned at `org/Hibachi/HibachiTransient.cfc:L459`, and by the three predicate accessors
 * at `org/Hibachi/HibachiEntity.cfc:L205`, `:L215` and `:L225` each passing that switch off and
 * reading the result off the returned throwaway. THAT IS A REACHABLE PATH FOR THIS FILE
 * SPECIFICALLY: the deletability predicate on a Brand flows through exactly the two delete-context
 * guards declared above — one live, one inert — so these declarations must stay pure declarative data
 * that neither mutates anything nor assumes a failure has already been recorded. They do.
 *
 * A FACTORY RATHER THAN A CONSTANT, and the reason is a dependency's documented design rather than
 * preference. The uniqueness constraint needs a selector that yields the entity the port interrogates,
 * and the port's entity contract requires five accessors that the sibling base service's entity
 * contract deliberately does not include. The sibling `../Validator` records that requiring them of
 * every subject "would widen the subject contract for the benefit of seven rules". Injecting the
 * selector honours both contracts at once and keeps this file free of any run-time dependency on the
 * port (AAP 0.7.3 S3, S4). Callers whose subject IS that entity pass
 * {@link resolveBrandUniqueTarget}.
 *
 * @param resolveUniqueTarget selects the entity the uniqueness port interrogates for `urlTitle`
 * @returns the frozen five-property rule set for `Brand`
 */
export function createBrandValidationRules<TSubject extends BrandValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): ValidationRuleSet<TSubject> {
  return Object.freeze({
    properties: Object.freeze([
      brandNamePropertyValidation,
      brandWebsitePropertyValidation,
      createUrlTitlePropertyValidation(resolveUniqueTarget),
      productsPropertyValidation,
      physicalCountsPropertyValidation,
    ] as const),
  } as const);
}

/**
 * The `Brand` rule set for the common case: a subject that is itself the entity the uniqueness port
 * interrogates.
 *
 * This is the form the sibling service layer wires — its collaborator bundle takes a rule set typed
 * over an entity that already satisfies the subject contract, the population contract, the audit
 * contract and the primary-identifier accessor. Exposing it as a value keeps that wiring a plain
 * reference rather than a call, while {@link createBrandValidationRules} remains available for any
 * subject that reaches its uniqueness target by another route.
 *
 * NO CACHING HAPPENS HERE, AND NONE MAY BE ADDED. The legacy engine memoises resolved rule sets under
 * a class-and-context key (`org/Hibachi/HibachiValidationService.cfc:L92`), but per M7 nothing
 * survives between invocations except module-scope state, and any memoisation in the target must be
 * request-scoped to avoid bleeding one request's state into the next on a warm container. This value
 * is safe as module-scope state for exactly one reason: IT IS FROZEN, IMMUTABLE, REQUEST-INDEPENDENT
 * DECLARATIVE DATA WITH NO SIDE EFFECT AT MODULE LOAD. It holds no connection, no request context, no
 * resolved values and no accumulated errors — the error bag belongs to the evaluator and is created
 * per evaluation.
 */
export const brandValidationRules: ValidationRuleSet<
  BrandValidationSubject & UniquePropertyEntity
> = createBrandValidationRules<BrandValidationSubject & UniquePropertyEntity>(
  resolveBrandUniqueTarget,
);
