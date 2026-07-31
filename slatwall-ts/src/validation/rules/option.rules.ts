/**
 * `option.rules.ts` — the typed transliteration of `model/validation/Option.json`.
 *
 * AUTHORITY — AAP §0.4.1.5 Validation Layer table, verbatim row:
 *
 *   | `slatwall-ts/src/validation/rules/option.rules.ts` | CREATE | `model/validation/Option.json` |
 *     Code regex and uniqueness, required option group, SKU delete guard |
 *
 * Corroborated by the AAP §0.3.1 target tree line `option.rules.ts <- model/validation/Option.json`,
 * by the AAP §0.2.1.5 seven-row table row — "`model/validation/Option.json` | 7 | `optionCode`
 * required/unique/regex, `optionName` and `optionGroup` required; delete guard on SKUs" — and by the
 * single AAP §0.4.4 wildcard row `slatwall-ts/src/validation/rules/** | CREATE — the seven rule sets`.
 *
 * PROVENANCE, EXACT. The source document is `model/validation/Option.json`, seven lines, md5
 * `44c0262ac8f4bf8496ed0497fa4626fd` — re-verified against the file on disk rather than recalled. Four
 * properties, six constraints, two contexts. Every declaration below cites the source line it
 * transcribes.
 *
 * =============================================================================================
 * THIS DOCUMENT IS BEHAVIOR, NOT CONFIGURATION
 * =============================================================================================
 * AAP IR-4, verbatim: "Declarative validation is part of the observable behavior. Seven catalog
 * validation files define required fields, uniqueness, regular-expression formats, conditional rules
 * and delete guards. Two `Sku` rules are method-based and execute real queries. These are behavior,
 * not configuration, and are ported as typed rule sets." AAP §0.2.1.5 says the same from the other
 * side: these files "are interpreted at runtime by the validation service and determine which saves
 * and deletes succeed."
 *
 * Treat this document as configuration and the result is a port that COMPILES CLEANLY, saves Options
 * the legacy system would have rejected, and rejects Options the legacy system would have accepted —
 * with no compile error, no exception and no failing test to reveal it. That is why every constraint
 * below is transcribed from the source line rather than paraphrased, and why the census in this header
 * is written down as an assertion target.
 *
 * =============================================================================================
 * WHY THE JSON IS NOT SHIPPED — TR-3
 * =============================================================================================
 * AAP transformation rule TR-3, verbatim: "Replace framework magic with declarations. Every
 * runtime-synthesized method, every string-keyed service lookup and every metadata-driven behavior
 * becomes an explicit, compile-checked declaration."
 *
 * So this module exports TYPED TypeScript values built from the discriminated-union constraint types
 * of `../Validator`. It does not import, require, parse, bundle or interpret a JSON document, and it
 * performs no file access of any kind. `model/validation/Option.json` is REFERENCE-ONLY: it is not
 * copied, moved, symlinked or re-emitted anywhere inside `slatwall-ts/`, and `resolveJsonModule` is
 * not enabled in `slatwall-ts/tsconfig.json`. TR-6 and AAP §0.4.1.1 hold the CFML tree byte-for-byte
 * unchanged, so every target file is CREATE and every legacy file is REFERENCE. The document is
 * TRANSLITERATED, NOT VENDORED.
 *
 * =============================================================================================
 * THE CENSUS — FOUR PROPERTIES, SIX CONSTRAINTS, FIVE OF THE THIRTEEN KEYS
 * =============================================================================================
 * Measured over exactly the seven in-scope documents, which AAP §0.4.4 requires be ENUMERATED AND
 * NEVER WILDCARDED — a pattern such as `model/validation/Product*.json` "would silently pull in
 * out-of-scope material", namely the `Product_AddSubscriptionTerm` and `Product_UploadDefaultImage`
 * documents AAP §0.2.2.4 excludes. This file references `model/validation/Option.json` by its exact
 * path and nothing else.
 *
 *   `model/validation/Option.json:3`   optionCode    save     required + unique + regex   (3)
 *   `model/validation/Option.json:4`   optionName    save     required                    (1)
 *   `model/validation/Option.json:5`   optionGroup   save     required                    (1)
 *   `model/validation/Option.json:6`   skus          delete   maxCollection 0             (1)
 *
 * Five of the thirteen folder-wide keys are used: `contexts` (four uses — `save` three times, `delete`
 * once), `required` (three), `unique` (one), `regex` (one), `maxCollection` (one). The document
 * declares NO `conditions`, NO `method`, NO `inList`, NO `minValue`, NO `minCollection`, NO
 * `maxLength`, NO `dataType` and NO `eq`. Its ONLY numeric literal is the collection ceiling `0` at
 * `model/validation/Option.json:6`.
 *
 * ⚠️ THIS FILE COVERS `Option` ONLY. `OptionGroup` has its own six-line document,
 * `model/validation/OptionGroup.json`, and its own target file
 * `slatwall-ts/src/validation/rules/optionGroup.rules.ts`. The two are separate entities with separate
 * rule sets and separate class names in the emitted message keys, so no `OptionGroup` rule appears
 * here — not even the pattern rule the two documents happen to share.
 *
 * VOCABULARY DELIBERATELY NOT USED (AAP §0.7.3 S9 — invent nothing; IR-12). Each token below occurs
 * elsewhere in the wider validation corpus and in NONE of the seven in-scope documents, so writing one
 * would be fabrication: the `dataType` values email, date and creditCard; the constraint keys
 * minLength, eqProperty, gtProperty, null, maxValue, populatedPropertyValidation, validate and
 * uniqueOrNull; and the evaluators the legacy engine declares but the seven never reach — minList,
 * maxList, lt, lte, gt, gte, gtNow, ltNow, neq, lteProperty, ltProperty, gteProperty and neqProperty.
 * All eighteen measure ZERO occurrences inside the seven. No maximum length is invented, no format is
 * invented for a display name, no numeric floor is invented for an ordering column and no "sensible"
 * default is invented anywhere.
 *
 * =============================================================================================
 * DETERMINISTIC EVALUATION ORDER — A DELIBERATE DETERMINISM CHOICE, NOT A BEHAVIOR CHANGE
 * =============================================================================================
 * The legacy engine iterates a CFML struct to reach a document's properties, and CFML struct-key
 * iteration order is UNSPECIFIED. The flattening loop at
 * `org/Hibachi/HibachiValidationService.cfc:L77-L88` likewise iterates the keys of one rule object, so
 * the order in which `required`, `unique` and `regex` were evaluated for `optionCode` was never
 * guaranteed either.
 *
 * This port fixes both orders in the DATA SHAPE: properties appear in the source document's own key
 * order — `optionCode`, `optionName`, `optionGroup`, `skus` — and within `optionCode` the constraints
 * appear in the source key order `required`, `unique`, `regex`. `../Validator` evaluates arrays in
 * declaration order, so the accumulated message array is reproducible.
 *
 * That determinism is an improvement on an unspecified order rather than a change to behavior, and the
 * reason it cannot alter an outcome is that EVALUATION NEVER SHORT-CIRCUITS: every applicable
 * constraint runs and every failure accumulates, at every level, so the SET of reported failures is
 * order-independent. Only the sequence within the array is now stable — which is what lets a test
 * assert on it at all.
 *
 * =============================================================================================
 * NO MEMOISATION HAPPENS HERE, AND NONE MAY BE ADDED — M7
 * =============================================================================================
 * The legacy engine memoises each resolved rule set under a class-and-context key
 * (`org/Hibachi/HibachiValidationService.cfc:L92`). Execution-model mismatch M7 records that nothing
 * survives between Lambda invocations except module-scope state, so any memoisation in the target must
 * be REQUEST-SCOPED and never module-scoped, on pain of bleeding one request's state into the next on
 * a warm container. For a static rule declaration the simplest compliant choice is NONE AT ALL, and
 * that is the choice made: this module caches nothing and computes nothing on demand.
 *
 * The exported values are nonetheless safe as module-scope state for one specific reason: they are
 * FROZEN, IMMUTABLE, REQUEST-INDEPENDENT DECLARATIVE DATA with no side effect at module load. They
 * hold no connection, no request context, no resolved property values and no accumulated errors — the
 * error bag belongs to `../Validator` and is created per evaluation. Note in particular that the
 * shared pattern is carried as a STRING and is never pre-compiled here: a compiled pattern object
 * carries mutable `lastIndex` state, which is exactly what M7 forbids at module scope.
 *
 * =============================================================================================
 * THE SIX EMITTED MESSAGE KEYS — DECISION D-1
 * =============================================================================================
 * `validateConstraint` composes the key at `org/Hibachi/HibachiValidationService.cfc:L230` for every
 * constraint type that is neither `method` nor `dataType` — which is all six here. This document
 * therefore emits exactly:
 *
 *   validate.save.Option.optionCode.required
 *   validate.save.Option.optionCode.unique
 *   validate.save.Option.optionCode.regex
 *   validate.save.Option.optionName.required
 *   validate.save.Option.optionGroup.required
 *   validate.delete.Option.skus.maxCollection
 *
 * Per RATIFIED DECISION D-1, `../Validator` composes these keys and deliberately SKIPS the
 * resource-bundle substitution pass. The skip is provably a no-op: the substitution collects targets
 * by matching a dollar-brace placeholder pattern (`org/Hibachi/HibachiUtilityService.cfc:L71`) and
 * none of the engine's three key templates can ever emit such a placeholder, so the loop would find
 * zero matches by construction. `../util/formatting` is consequently NOT imported — with the
 * substitution skipped it would be dead code, which AAP §0.8.2 guideline 4 forbids.
 *
 * THESE MESSAGES ARE KEYS, NOT SENTENCES. Nothing here or downstream translates, sentence-cases,
 * normalises, trims, lowercases, pluralises or beautifies one.
 *
 * `Option` is a PERSISTENT entity — `model/entity/Option.cfc:L49` declares `persistent=true` — so the
 * class-name substitution the legacy engine built took the `entity.` branch at
 * `org/Hibachi/HibachiValidationService.cfc:L212` rather than the `processObject.` branch. That
 * distinction is recorded for completeness only: the prefix existed solely as a substitution VALUE and
 * never appeared in the key itself, so with D-1 in force it is never emitted.
 *
 * =============================================================================================
 * A STALE LOCATOR IN A SIBLING SPECIFICATION, CORRECTED HERE AND NOT THERE
 * =============================================================================================
 * The specification for `../Validator` twice places the unknown-constraint raise at L212. Read
 * first-hand, the raise is at `org/Hibachi/HibachiValidationService.cfc:L202`; **L212** is the
 * `isPersistent()` branch that selects the class-name prefix described above; and the separate
 * `dataType` whitelist raise is a third site, at `:L263`. The correction is stated here because the
 * sibling file is not this file's to edit — conform to a sibling, never rewrite one.
 *
 * =============================================================================================
 * TWO DOCUMENTED NON-PORTS
 * =============================================================================================
 * Recorded as translation decisions rather than as deferred work, because neither mechanism is
 * reachable for this slice and building either would violate S9.
 *
 *   1. THE POPULATED-SUB-PROPERTY CASCADE. `getPopulatedPropertyValidationContext`
 *      (`org/Hibachi/HibachiValidationService.cfc:L133-L151`) reads the keys
 *      `populatedPropertyValidation` and `validate`. NEITHER appears in any of the seven in-scope
 *      documents, so the cascade it feeds (`org/Hibachi/HibachiTransient.cfc:L412-L453`) is
 *      unreachable here. No cascade API belongs in this folder, and none is declared.
 *
 *   2. THE CUSTOM-OVERRIDE MERGE. The engine merges per-installation overrides over each core
 *      document (`org/Hibachi/HibachiValidationService.cfc:L6-L53`). `custom/model/validation/`
 *      contains only a readme, so ZERO catalog overrides exist and there is nothing to merge. No merge
 *      mechanism is built.
 *
 * =============================================================================================
 * SCOPE AND CONVENTIONS
 * =============================================================================================
 * The seven validation documents are an ENTIRELY IMPLICIT SCOPE ADDITION (AAP §0.2.1.5) — the user
 * prompt names none of them, and they enter scope because the named services' observable behavior
 * depends on them.
 *
 * This module issues ZERO SQL (AAP §0.7.3 S2, as a negative obligation): no statement, no fragment, no
 * table name and no column name appears in any key, value, constant or string literal. The link table
 * `SwSkuOption` and the entity table `SwOption` are named in prose comments only, where they are
 * provenance rather than data. Uniqueness reaches the database exclusively through the port injected
 * into `../Validator`, and this file never calls it (S3, S4). No error message text from the legacy
 * source is reproduced anywhere, including in comments — the raise sites are cited by locator only:
 * `org/Hibachi/HibachiService.cfc:L117`, `org/Hibachi/HibachiService.cfc:L136` and
 * `org/Hibachi/HibachiErrors.cfc:L50`.
 *
 * @see `../Validator` for the evaluation semantics every constraint below depends on
 * @see `model/validation/Option.json` — the seven-line source document, REFERENCE-ONLY
 * @see `model/entity/Option.cfc` — the property metadata that decides what may be declared here
 */

import type { OptionPropertyName } from '../../domain/option/Option';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  MaxCollectionConstraint,
  PropertyValidation,
  RegexConstraint,
  RequiredConstraint,
  UniqueConstraint,
  UniqueTargetResolver,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';
import { CODE_FORMAT_REGEX } from './product.rules';

/* ================================================================================================
 * THE SUBJECT SHAPE — WHAT THESE FOUR RULES READ, AND NOTHING MORE
 * ============================================================================================== */

/**
 * The narrowest object shape this rule set can be evaluated against.
 *
 * STRUCTURAL, NEVER NOMINAL — the established convention of this subtree rather than a choice made
 * here. `../Validator` states that its subject shape is structural so that every ported entity and
 * process object satisfies it without declaring that it does, and so that a hand-written literal
 * satisfies it too; `./product.rules`, `./productType.rules` and `./brand.rules` all compose their
 * contracts the same way. Nothing extends a class, because AAP §0.3.3 replaces the legacy
 * template-method inheritance with composition.
 *
 * ⚠️ THE `Option` CLASS ITSELF IS NOT THE SUBJECT, AND CANNOT BE. `src/domain/option/Option.ts`
 * deliberately declares NEITHER of the two members `../Validator` requires — no class-name accessor
 * and no property-existence predicate — and none of the five accessors the uniqueness port needs. Its
 * own mandate lists all of them as framework concerns that the retired framework supplied by
 * inheritance (`org/Hibachi/HibachiEntity.cfc`), so requiring them of the entity would drag the
 * framework base back into the port. Hence a shape, and hence only a TYPE-ONLY import of that module —
 * for {@link OptionPropertyName}, never for the class.
 *
 * THE INTERSECTION HAS THREE PARTS, each present for a stated reason:
 *
 *   1. {@link ValidationSubject} — the engine's own two members. The class name forms the third segment
 *      of every emitted key (so `Option` is what makes them read `validate.save.Option.…`), and the
 *      property-existence predicate is consulted at
 *      `org/Hibachi/HibachiValidationService.cfc:L171` before any rule of a property is evaluated. See
 *      EVERY RULE IN THIS FILE IS LIVE at {@link optionValidationRuleSet} for why that predicate never
 *      suppresses a rule here, in deliberate contrast with four of the six sibling documents.
 *
 *   2. {@link UniquePropertyEntity} — the five-accessor shape the uniqueness port needs, required
 *      because `model/validation/Option.json:3` declares a `unique` constraint and `../Validator` types
 *      a uniqueness target resolver as returning this shape. `../Validator` keeps those five accessors
 *      OFF its own subject contract on the stated ground that requiring them of every validated subject
 *      "would widen the subject contract for the benefit of seven rules", so a rule set that needs them
 *      must ask — and this one does. The identifier `optionCode` is a single segment, so the resolved
 *      entity is the subject itself; see {@link resolveOptionUniqueTarget}.
 *
 *   3. The four property values these rules actually READ, and no others. Fourteen further properties
 *      exist on `model/entity/Option.cfc` and none appears here, because no rule reads them — the
 *      roster is at THE PROPERTIES THIS DOCUMENT DOES NOT CONSTRAIN, below.
 *
 * ⚠️ EVERY READ MEMBER IS OPTIONAL AND READ-ONLY, AND THAT OPTIONALITY IS THE SOURCE'S, NOT A
 * CONVENIENCE. Two independent reasons, both load-bearing:
 *
 *   - `model/entity/Option.cfc` declares no default and no `notnull` for any of the four
 *     (`:L53`, `:L54`, `:L59`, `:L66`), so an unpopulated value is genuinely ABSENT. Under
 *     `exactOptionalPropertyTypes` absent means the key is missing and never present-and-undefined,
 *     which is the exact distinction the presence rules below turn on. `Option.removeOptionGroup`
 *     makes the point concretely: it clears the reference with
 *     `structDelete(variables, "optionGroup")` at `model/entity/Option.cfc:L106` — the key is REMOVED,
 *     not nulled — and the ported analogue is `delete`, never an assignment of undefined.
 *   - Optionality keeps the engine's absence branches REACHABLE FROM A PLAIN OBJECT LITERAL. A presence
 *     check FAILS on absence, a format check PASSES on absence and a collection ceiling PASSES on
 *     absence, so absence is a specified input rather than a defect. The legacy repository contains no
 *     mocking library at all (AAP §0.6.5.2), so the net-new suite substitutes hand-written subjects; if
 *     these members were required, half the specified branches could not be reached without a type
 *     assertion, and assertions are forbidden here (S1).
 *
 * ⚠️ WHY `optionGroup` AND `skus` ARE TYPED WITH THE UNKNOWN TOP TYPE. A presence check on a reference
 * only asks whether one is there, and a collection ceiling MEASURES SIZE and never inspects an element.
 * Typing them precisely would force imports of `../../domain/option/OptionGroup` and of the SKU shape,
 * and neither is among this file's declared dependencies — reaching for one would breach AAP §0.7.3 S4.
 * The honest type is the one that says "a value whose interior is none of my business", and the sibling
 * rule sets record the same reasoning for the same reason.
 */
export type OptionValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /**
     * `property name="optionCode" ormtype="string";` [`model/entity/Option.cfc:L53`] — read by ALL
     * THREE constraints of `model/validation/Option.json:3`.
     *
     * Note what the mapping does NOT declare: no `unique="true"` and no `length`. See
     * {@link optionCodeUniqueConstraint} — for this property the validation rule is the only
     * uniqueness enforcement anywhere in the system.
     */
    readonly optionCode?: string;

    /**
     * `property name="optionName" ormtype="string";` [`model/entity/Option.cfc:L54`] — read by the
     * presence rule at `model/validation/Option.json:4`.
     */
    readonly optionName?: string;

    /**
     * `property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one"
     * fkcolumn="optionGroupID";` [`model/entity/Option.cfc:L59`] — read by the presence rule at
     * `model/validation/Option.json:5`, which is its SOLE enforcement. See
     * {@link optionGroupRequiredConstraint}.
     */
    readonly optionGroup?: unknown;

    /**
     * `property name="skus" singularname="sku" cfc="Sku" fieldtype="many-to-many"
     * linktable="SwSkuOption" fkcolumn="optionID" inversejoincolumn="skuID" inverse="true";`
     * [`model/entity/Option.cfc:L66`] — read by the delete guard at `model/validation/Option.json:6`.
     *
     * Optional here for one reason only: the collection ceiling at
     * `org/Hibachi/HibachiValidationService.cfc:L309-L315` PASSES on an absent value, so a subject that
     * omits it is a legitimate input with specified behaviour. The concrete entity never omits it —
     * `src/domain/option/Option.ts` initialises the collection to an empty array — and the difference
     * between those two routes to the same verdict is recorded at {@link skusMaxCollectionConstraint}.
     */
    readonly skus?: readonly unknown[];
  };

/**
 * Resolves the entity an `optionCode` uniqueness check runs against: the subject itself.
 *
 * THE FAITHFUL TRANSLITERATION OF A SINGLE-SEGMENT IDENTIFIER LOOKUP. `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L470` resolves the last object along the property
 * identifier before handing it to the port. `optionCode` is a single segment containing neither a dot
 * nor an underscore, so that walk terminates immediately and the resolved object IS the subject.
 * `../Validator` reaches the same conclusion for all seven uniqueness rules of the slice. The
 * indirection is retained because the legacy engine has it and because a dotted identifier would
 * resolve elsewhere — no lookup is invented.
 *
 * IT PERFORMS NO CHECK. It selects a target. `../Validator` calls the injected port and
 * `src/adapters/mysql` runs the statement; nothing in this file queries anything (S2, S3).
 *
 * ANNOTATED WITH THE ENGINE-OWNED ALIAS RATHER THAN LEFT STRUCTURALLY COMPATIBLE. Declaring this against
 * {@link UniqueTargetResolver} makes conformance to `../Validator`'s contract a COMPILE-CHECKED fact: were
 * that alias to change shape — a second parameter, a different return type — this declaration would fail
 * here rather than fail silently at the one place the constraint is consumed. The alias is imported
 * type-only, so no run-time edge is created.
 *
 * @param subject the Option-shaped subject being validated, which is also the entity the port checks
 * @returns that same subject, as the port's entity shape
 */
export const resolveOptionUniqueTarget: UniqueTargetResolver<OptionValidationSubject> = (
  subject: OptionValidationSubject,
): UniquePropertyEntity => subject;

/* ================================================================================================
 * THE FOUR PROPERTY IDENTIFIERS — ALL FOUR COMPILE-CHECKED AS REAL
 *
 * `src/domain/option/Option.ts` exports the union of every property name `model/entity/Option.cfc`
 * declares within the port's scope. Constraining each identifier against that union turns a central
 * finding of this file into a COMPILE ERROR rather than a comment somebody has to remember: all four of
 * this document's keys name REAL declared properties of the entity.
 *
 * `Extract` of a name that is a member of the union yields that name, so each assignment below
 * type-checks. Were one of these properties renamed or removed in the entity, `Extract` would yield the
 * empty type and the assignment would fail — which is the point, because a rule keyed on a property the
 * entity does not declare is SILENTLY SKIPPED at run time
 * (`org/Hibachi/HibachiValidationService.cfc:L171`) rather than raised.
 *
 * ⭐ THAT SILENT SKIP NEVER FIRES IN THIS FILE, and the contrast is deliberate: four of the seven
 * in-scope documents declare a `physicalCounts` delete guard against a property NO entity declares —
 * the entities declare `physicals` — so those four guards are inert at run time, and their rule sets
 * make the inertness compile-checked with the inverse `Exclude` idiom. `model/validation/Option.json`
 * has NO `physicalCounts` rule, measured directly: the token appears in exactly four of the seven
 * documents and not in this one. So every identifier here is checked to be INSIDE the union, and there
 * is no inverse assertion to make.
 * ============================================================================================== */

/** `model/validation/Option.json:3` against `model/entity/Option.cfc:L53`. */
const OPTION_CODE_PROPERTY: Extract<OptionPropertyName, 'optionCode'> = 'optionCode';

/** `model/validation/Option.json:4` against `model/entity/Option.cfc:L54`. */
const OPTION_NAME_PROPERTY: Extract<OptionPropertyName, 'optionName'> = 'optionName';

/** `model/validation/Option.json:5` against `model/entity/Option.cfc:L59`. */
const OPTION_GROUP_PROPERTY: Extract<OptionPropertyName, 'optionGroup'> = 'optionGroup';

/** `model/validation/Option.json:6` against `model/entity/Option.cfc:L66`. */
const SKUS_PROPERTY: Extract<OptionPropertyName, 'skus'> = 'skus';

/* ================================================================================================
 * THE TWO CONTEXTS
 *
 * Transcribed verbatim, and kept as the legacy comma-delimited STRING form rather than becoming arrays,
 * so each rule transcribes its source line literally. This document uses only these two, and neither is
 * a list: the one multi-element context value in the seven documents belongs to
 * `model/validation/Product.json:4`, not here.
 *
 * MATCHING IS CASE-INSENSITIVE AND COMMA-DELIMITED, because the legacy gate is
 * `listFindNoCase(rule.contexts, arguments.context)` at
 * `org/Hibachi/HibachiValidationService.cfc:L71`. `../Validator` reproduces both halves, and its list
 * splitter deliberately does NOT trim elements — CFML list functions do not, so a space after a comma
 * would become part of an element. Neither value below carries a space, exactly as the source has them.
 *
 * ⚠️ UNDER THE DEFAULT CONTEXT THIS FILE CONTRIBUTES NOTHING, AND THAT IS CORRECT. The engine's
 * signature defaults the context to the empty string (`org/Hibachi/HibachiValidationService.cfc:L153`),
 * and a rule that HAS a `contexts` key can never match it, because `listFindNoCase('save', '')` cannot
 * succeed. All four rules here carry a `contexts` key, so a default-context pass over an Option reports
 * nothing. Note that validation still RUNS: the skip-everything branch at `:L162` triggers only for a
 * boolean-castable context, and the empty string is not boolean-castable. (The inverse holds for
 * `./productUpdateSkus.rules`, whose rules carry no `contexts` key and therefore fire in every context.)
 * ============================================================================================== */

/** `model/validation/Option.json:3`, `:4` and `:5`. */
const SAVE_CONTEXT = 'save';

/** `model/validation/Option.json:6`. */
const DELETE_CONTEXT = 'delete';

/* ================================================================================================
 * RULE 1 OF 4 — `model/validation/Option.json:3`
 *
 *     "optionCode": [{"contexts":"save","required":true,"unique":true,"regex":"^[a-zA-Z0-9-_.|:~^]+$"}]
 *
 * ⭐ ONE RULE OBJECT, THREE INDEPENDENT CONSTRAINTS, ONE ERROR KEY
 * ------------------------------------------------------------------------------------------------
 * `getValidationsByContext` at `org/Hibachi/HibachiValidationService.cfc:L77-L88` explodes each rule
 * object into ONE CONSTRAINT RECORD PER KEY, skipping `contexts` and `conditions` (`:L78`) and copying
 * `conditions` onto every record it produces (`:L83-L85`). So this line is NOT one constraint with three
 * facets — it is THREE INDEPENDENT CONSTRAINTS, each evaluated separately, each able to add its OWN
 * error, all three sharing the single `save` gate and all three reported under the SAME property
 * identifier `optionCode`.
 *
 * Here that explosion is the data shape: the three constraints below are three entries in one rule's
 * constraint array, which both preserves the source document's grouping (one rule object, one context
 * gate) and matches the shape `../Validator` consumes.
 *
 * EVALUATION NEVER SHORT-CIRCUITS. A blank `optionCode` that is also a duplicate legitimately produces
 * TWO failures, and one that is blank, duplicated and malformed produces THREE — all under the one key.
 * No "stop after the first failure" logic is added, at any level. That accumulation is precisely why the
 * error bag holds an ARRAY of messages per key rather than a single message.
 *
 * THE ERROR KEY IS THE PROPERTY IDENTIFIER, NEVER THE CONSTRAINT NAME. Every branch of
 * `validateConstraint` calls `addError` with exactly two arguments — the property identifier and the
 * message — at `org/Hibachi/HibachiValidationService.cfc:L224`, `:L228` and `:L232`. The
 * three-argument `addError` override at `org/Hibachi/HibachiEntity.cfc:L151` is an ENTITY concern and
 * never a validation-engine one. The engine does derive a trailing-segment property name at `:L208`
 * (`listLast(propertyIdentifier, '._')`), but only to compose the message — never as the key.
 *
 * The three emitted keys are `validate.save.Option.optionCode.required`,
 * `validate.save.Option.optionCode.unique` and `validate.save.Option.optionCode.regex`. Each of the
 * three constraints is exported separately so the net-new suite can assert them individually (S6).
 * ============================================================================================== */

/**
 * `optionCode` must be present when an Option is saved.
 *
 * PRESENCE SEMANTICS, from `org/Hibachi/HibachiValidationService.cfc:L240-L245`, are not a truthiness
 * test and the differences are observable:
 *   - absent           FAILS
 *   - the empty string FAILS
 *   - whitespace only  FAILS — the predicate trims before measuring length
 *   - the string "0"   PASSES, being a non-empty simple value; no falsy check is added
 *   - an empty array   FAILS, though that shape cannot arise for this string property
 * `../Validator` implements those semantics. This file must not layer a defensive guard on top of them,
 * because an extra constraint changes which saves succeed.
 *
 * NO PARITY ANNOTATION IS RECORDED for the fact that the legacy evaluator declares a constraint value at
 * `org/Hibachi/HibachiValidationService.cfc:L240` and never reads it: `../Validator` already carries that
 * observation on the constraint type itself, and duplicating it here would fork one finding into two. The
 * field is kept and set to the source's `true` so this constraint transcribes its line faithfully.
 *
 * Emits `validate.save.Option.optionCode.required`.
 */
export const optionCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `optionCode` must not already be in use when an Option is saved.
 *
 * ⭐ FOR THIS PROPERTY THE RULE IS THE **ONLY** UNIQUENESS ENFORCEMENT IN THE ENTIRE SYSTEM
 * ------------------------------------------------------------------------------------------------
 * `model/entity/Option.cfc:L53` reads, byte-exactly:
 *
 *     property name="optionCode" ormtype="string";
 *
 * No `unique="true"`, no `length`, no `notnull`. A repository-wide search for `unique="true"` under
 * `model/entity/` returns exactly EIGHT hits — `Currency.cfc:52`, `Product.cfc:54` (urlTitle),
 * `Product.cfc:56` (productCode), `ProductType.cfc:56`, `MeasurementUnit.cfc:58`, `Integration.cfc:53`,
 * `Brand.cfc:55` and `Sku.cfc:54` — and `Option.optionCode` IS NOT AMONG THEM. There is therefore no
 * database-level constraint behind this rule and no second mechanism to fall back on. Dropping it as
 * redundant — the reflex a reader who assumes the schema enforces uniqueness will have — would make
 * duplicate option codes saveable.
 *
 * That makes AAP IR-5 binding here in its strongest form. IR-5, verbatim: "Application-side uniqueness
 * checking is required in addition to database constraints. `HibachiDAO.isUniqueProperty()`
 * [org/Hibachi/HibachiDAO.cfc:L130-L146] enforces uniqueness with an HQL existence query during
 * validation, independently of the `unique=\"true\"` column metadata."
 *
 * ⭐⭐ X8 — THERE ARE **SEVEN** `unique` CONSTRAINTS ACROSS THE SEVEN DOCUMENTS
 * ------------------------------------------------------------------------------------------------
 * Measured directly over exactly the seven enumerated in-scope documents, twice:
 *
 *   model/validation/Product.json:10       productCode        (also carries the format rule)
 *   model/validation/Product.json:16       urlTitle
 *   model/validation/Sku.json:11           skuCode
 *   model/validation/Brand.json:5          urlTitle
 *   model/validation/Option.json:3         optionCode         <-- THIS FILE
 *   model/validation/OptionGroup.json:4    optionGroupCode    (also carries the format rule)
 *   model/validation/ProductType.json:4    urlTitle
 *
 * `model/validation/Product_UpdateSkus.json` contributes NONE.
 *
 * Two upstream documents undercount this, and both are corrected here rather than by editing them. The
 * specification for `../ports/UniquePropertyPort` names SIX and asserts that
 * `model/validation/Product.json` declares `urlTitle` as required but not unique; that assertion is
 * FALSE — `model/validation/Product.json:16` declares both, verified first-hand — and the root cause is
 * that its mandated reads cover five documents and omit `model/validation/ProductType.json` entirely, so
 * the seventh locator was invisible to it. The AAP's own five-column figure counts something else again.
 *
 * RECONCILING THE THREE NUMBERS, so nobody later "fixes" one into another:
 *   - SEVEN is the count of `unique` RULES in the validation documents. That is the number that governs
 *     this file, because it is how many uniqueness rules an evaluator can be handed.
 *   - EIGHT is the count of entity `unique="true"` COLUMN METADATA declarations system-wide, of which
 *     FIVE belong to this slice. That is the number IR-5 refers to.
 * They measure DIFFERENT, INDEPENDENT mechanisms — IR-5 says so itself, "independently of the
 * `unique=\"true\"` column metadata" — and all of them are true about their own subject. `Option` is the
 * cleanest demonstration of the independence: it has a uniqueness RULE and no unique COLUMN.
 *
 * ⭐ RATIFIED DECISION D-2 — POLARITY, PINNED: `true` MEANS UNIQUE, WHICH MEANS SAFE TO SAVE
 * ------------------------------------------------------------------------------------------------
 * Read first-hand rather than inferred: `org/Hibachi/HibachiDAO.cfc:L142-L144` returns FALSE when the
 * existence query finds rows, and `:L146` returns TRUE when it finds none. `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L470` then returns that result UNMODIFIED as its own
 * pass-or-fail verdict. Inverting this is SILENT — every uniqueness rule in the slice would pass when it
 * should fail, with no compile error and no lint finding — so the accompanying test must exercise the
 * COLLIDING case; one that only covers the non-colliding path passes under either polarity.
 *
 * THREE FURTHER ENGINE FACTS, recorded because each looks like something to improve and none may be:
 *   - THE SELF-EXCLUSION TERM IS A NO-OP ON INSERT. The existence query excludes the row under
 *     validation by comparing primary identifiers — `org/Hibachi/HibachiDAO.cfc:L136-L140`, where
 *     `:L136-L138` read the identifier property name and its current value and `:L140` appends the
 *     exclusion term to the HQL. A row being inserted has no assigned identifier yet, so the term excludes
 *     nothing and the check degenerates to a plain existence test. It is live and load-bearing on update,
 *     where it stops a row colliding with itself. Noted, not special-cased.
 *   - AN ABSENT VALUE PASSES, INDIRECTLY. `validate_unique` (`:L467-L470`) contains NO absence guard: it
 *     delegates straight to the port. Contrast `validate_uniqueOrNull` at `:L472-L479`, which DOES guard
 *     — the two evaluators differ precisely there, which is what proves the omission is real rather than
 *     an artefact of reading. With an absent value the existence query matches nothing, so the port must
 *     return true; it must not raise, must not rewrite the check as a null comparison and must not report
 *     the value as taken. On the save path the presence constraint above already fails for an absent
 *     value, so both failures accumulate under the one key.
 *   - THE CONSTRAINT VALUE IS DECLARED BUT UNREAD by that evaluator (`:L467`), so the check always runs.
 *     All seven in-scope rules declare `true` and no `false` form exists. The field is kept so this
 *     constraint transcribes its source line faithfully.
 *
 * EVALUATED EXCLUSIVELY THROUGH THE INJECTED PORT. `../Validator` reaches `UniquePropertyPort`, which
 * `src/adapters/mysql/UniquePropertyChecker.ts` implements. The port is injected into the VALIDATOR, not
 * into this file: it is imported here TYPE-ONLY, purely for the target-resolver's return type, so no
 * run-time edge is created from this layer to an adapter (S3, S4). There is no ad-hoc query in this file
 * and no reliance on a database constraint that, for this property, does not exist. The physical tables
 * involved — `SwOption` for the entity and `SwSkuOption` for the link — are named in prose here and
 * nowhere else: never in a key, a value, a constant or a string literal (S2).
 *
 * Emits `validate.save.Option.optionCode.unique`.
 */
export const optionCodeUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: resolveOptionUniqueTarget,
} as const) satisfies UniqueConstraint<OptionValidationSubject>;

/**
 * `optionCode` must match the catalog code format when an Option is saved.
 *
 * ⭐ THE PATTERN IS IMPORTED, NEVER REDECLARED — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------------------------------------------------
 * The literal occurs in exactly THREE of the seven in-scope documents, measured directly:
 * `model/validation/Product.json:10` (productCode), `model/validation/Option.json:3` (this rule) and
 * `model/validation/OptionGroup.json:4` (optionGroupCode). Structural decision M-0(a) forbids a fourth
 * "shared constants" module — no `common.ts`, no `types.ts`, no `constants.ts`, no `shared.ts`, no
 * helpers folder — and places the constant in one of the three consumers, from which the other two import
 * it relatively. By document order that owner is `./product.rules`, which exports it as
 * {@link CODE_FORMAT_REGEX} and names this file among its intended importers.
 *
 * So this file IMPORTS the pattern and does not copy it. A second copy is exactly the drift the
 * single-source-of-truth decision exists to prevent, and S6 requires the net-new suite be able to assert
 * ONE source of truth across all three consuming documents. For a reader's convenience the literal is
 * `^[a-zA-Z0-9-_.|:~^]+$`, quoted here in prose only — the authoritative copy is the exported constant.
 * `./product.rules` is also the right place to read WHY every character of that class is load-bearing:
 * the hyphen after `0-9` is a literal because it sits where a range cannot begin, and the trailing caret
 * inside the class is a literal because a caret only negates in first position.
 *
 * ⚠️ IT IS A PATTERN STRING, NOT A COMPILED PATTERN, AND THAT IS REQUIRED RATHER THAN STYLISTIC.
 * `../Validator` types a format constraint's value as a `string` and compiles it FRESH on every
 * evaluation, precisely so nothing survives between invocations on a warm container (M7). Handing it a
 * pre-compiled object would fail to type-check AND defeat that guarantee, since a compiled pattern
 * carries mutable `lastIndex` state. Nothing is compiled in this file.
 *
 * ⚠️ NO FLAGS, AND ONE OF THEM IS A COLD-START CRASH RATHER THAN A TEST FAILURE. The unicode-sets flag
 * raises `SyntaxError: Invalid character class` on this class at PATTERN CONSTRUCTION — under Lambda that
 * is a cold-start crash, not a rejected save. The unicode flag compiles but is pointless here, the class
 * being pure ASCII, and it changes escape semantics. None of `i`, `g`, `m`, `s`, `u` or `v` may ever be
 * added, here or in `../Validator`.
 *
 * ⚠️ THE END-ANCHOR MICRO-DIVERGENCE, CARRIED NOT REPAIRED (guideline 6). The legacy evaluator is
 * `isValid("regex", value, pattern)` at `org/Hibachi/HibachiValidationService.cfc:L481-L487`, over a
 * Java-flavoured engine in which `$` also matches before a single trailing line terminator. JavaScript's
 * `$` without the multiline flag matches only at end of input, so a value whose sole offence is one
 * trailing line feed would have matched there and does not here. The two behaviours otherwise COINCIDE
 * for every realistic option code, because the pattern anchors BOTH ends itself — so the
 * partial-match question that arises for an unanchored pattern cannot arise for this one — and because a
 * line feed is not in the character class, so any code actually containing one is rejected by the legacy
 * pattern too. NO COMPENSATING LOGIC IS ADDED: adding the multiline flag to close the gap would change
 * which codes are accepted, and AAP §0.8.2 guideline 4 forbids enhancing behavior beyond what the
 * migration requires.
 *
 * ⚠️ A FORMAT CHECK PASSES ON AN ABSENT VALUE (`org/Hibachi/HibachiValidationService.cfc:L483`), while
 * the EMPTY STRING FAILS it, the quantifier requiring at least one character. Absent and empty are NOT
 * interchangeable. No absence guard, no `required`-implying fallback and no trim belongs here —
 * `../Validator` owns that branch, and the presence constraint above does the presence job
 * independently.
 *
 * Emits `validate.save.Option.optionCode.regex`.
 */
export const optionCodeRegexConstraint = Object.freeze({
  constraintType: 'regex',
  constraintValue: CODE_FORMAT_REGEX,
} as const) satisfies RegexConstraint;

/* ================================================================================================
 * RULE 2 OF 4 — `model/validation/Option.json:4`
 * ============================================================================================== */

/**
 * `optionName` must be present when an Option is saved.
 *
 * Transcribed from `model/validation/Option.json:4`:
 *
 *     "optionName": [{"contexts":"save","required":true}]
 *
 * THIS RULE IS THE SOLE ENFORCEMENT OF AN OPTION HAVING A NAME. `model/entity/Option.cfc:L54` reads,
 * byte-exactly:
 *
 *     property name="optionName" ormtype="string";
 *
 * No `required`, no `notnull`, no `length`, no `unique`. As with `optionGroup` below, the validation
 * document is the only mechanism, and the slice repeats the pattern elsewhere — `Brand.brandName` at
 * `model/entity/Brand.cfc:L56` and `Product.productType` at `model/entity/Product.cfc:L69` are likewise
 * required by their validation documents alone.
 *
 * TWO S9 ABSENCES, STATED SO THEY READ AS DECISIONS:
 *   - NO LENGTH CEILING IS DECLARED, and there is nothing to derive one from: the mapping declares no
 *     `length` attribute at all. Folder-wide `maxLength` occurs exactly ONCE, on
 *     `model/validation/ProductType.json:7`, and inventing a second would be fabrication.
 *   - NO FORMAT RULE IS DECLARED. The three pattern rules across the seven documents all sit on CODE
 *     properties; none sits on a display name, and `model/validation/Option.json:4` carries no `regex`
 *     key — unlike `:3` immediately above it, which does. The asymmetry is the source's and is preserved.
 *
 * Presence semantics are those recorded at {@link optionCodeRequiredConstraint}.
 *
 * Emits `validate.save.Option.optionName.required`.
 */
export const optionNameRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/* ================================================================================================
 * RULE 3 OF 4 — `model/validation/Option.json:5`
 * ============================================================================================== */

/**
 * `optionGroup` must be present when an Option is saved.
 *
 * Transcribed from `model/validation/Option.json:5`:
 *
 *     "optionGroup": [{"contexts":"save","required":true}]
 *
 * ⭐⭐ THIS RULE IS THE **SOLE** LIVE ENFORCEMENT OF THE REQUIRED OPTION-GROUP RELATIONSHIP
 * ------------------------------------------------------------------------------------------------
 * This is the single most consequential finding for this file, and it is easy to get wrong in exactly one
 * direction: a reader who trusts the mapping will conclude the rule is redundant and drop it.
 *
 * `model/entity/Option.cfc:L59` reads, byte-exactly:
 *
 *     property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one" fkcolumn="optionGroupID";
 *
 * THERE IS NO `required` ATTRIBUTE ON THAT DECLARATION, and no `notnull` either. AAP §0.2.1.2 describes
 * `Option.optionGroup` as "a required many-to-one relationship [model/entity/Option.cfc:L59]" — and that
 * requiredness is entirely real, but it is enforced by `model/validation/Option.json:5` in the `save`
 * context, NOT by the ORM mapping. Locating it correctly is the whole point: it is a validation rule, not
 * a mapping constraint. `src/domain/option/Option.ts` reaches the same conclusion independently and
 * declares its own field OPTIONAL for exactly this reason.
 *
 * THE SIBLING ENTITY PROVES THE OMISSION IS REAL RATHER THAN AN ARTEFACT OF READING.
 * `model/entity/OptionGroup.cfc:L58` declares `property name="sortOrder" ormtype="integer"
 * required="true";` — so the attribute was available and understood in this very entity family, and
 * simply is not used on any property of `Option`.
 *
 * REINFORCING EVIDENCE THAT THE FIELD CAN GENUINELY BE ABSENT: `Option.removeOptionGroup()` at
 * `model/entity/Option.cfc:L98-L107` ends with `structDelete(variables, "optionGroup")` at
 * **`:L106`** — it does not null the reference, it REMOVES THE KEY ENTIRELY. Under
 * `exactOptionalPropertyTypes` the faithful analogue is `delete target.optionGroup`, never an assignment
 * of undefined, which is exactly how `src/domain/base/populate.ts` implements CFML null semantics. A
 * field the entity's own code deletes cannot honestly be typed non-optional one layer down, which is why
 * {@link OptionValidationSubject} declares it optional and why this rule — not the type — carries the
 * requirement.
 *
 * SO THIS RULE IS NEITHER WEAKENED NOR DROPPED. Dropping it would make group-less Options saveable, with
 * nothing anywhere to stop them. Nor is the entity asked to grow an ORM-style required flag to
 * compensate: that would move behavior the legacy put in the document, and AAP §0.8.2 guideline 2
 * requires the in-scope behavior be preserved exactly as-is.
 *
 * NULL SEMANTICS THAT MAKE THE RULE BITE, from `org/Hibachi/HibachiValidationService.cfc:L240-L245`:
 * the predicate passes only when the value is not null AND is an object, OR a non-empty array, OR a
 * non-empty struct, OR a simple value with non-zero trimmed length. A missing option group is absent and
 * therefore FAILS; a present option-group reference is an object and therefore PASSES. That "any object
 * passes" branch is what makes the rule a pure presence check on a relationship: it inspects nothing
 * inside the referenced entity, which is why {@link OptionValidationSubject} types the member with the
 * unknown top type and imports no `OptionGroup`.
 *
 * Emits `validate.save.Option.optionGroup.required`.
 */
export const optionGroupRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/* ================================================================================================
 * RULE 4 OF 4 — `model/validation/Option.json:6`   (the document's only delete guard)
 * ============================================================================================== */

/**
 * An Option still carried by any SKU cannot be deleted.
 *
 * Transcribed from `model/validation/Option.json:6`:
 *
 *     "skus": [{"contexts":"delete","maxCollection":0}]
 *
 * This is the document's one `maxCollection` site — one of the nine across the seven in-scope documents —
 * and its one numeric literal.
 *
 * COLLECTION-CEILING SEMANTICS, reproduced by `../Validator` from
 * `org/Hibachi/HibachiValidationService.cfc:L309-L315`. The null branch is the one that surprises people:
 *   - absent                   PASSES — an explicit short-circuit, not an oversight
 *   - an EMPTY array           PASSES a ceiling of 0, its length being 0
 *   - a non-empty array        FAILS  — the delete is blocked, which is the guard doing its job
 *   - a struct                 measured by KEY COUNT, not by array length
 *   - a non-null SIMPLE value  FAILS  — it is neither array nor struct, so neither branch admits it
 * Absent and empty therefore reach the same verdict by two different routes. `src/domain/option/Option.ts`
 * initialises its collection to an empty array, so a concrete entity takes the empty-array route; a
 * hand-written subject may legitimately omit the member and take the absence route. Both are specified,
 * and no guard is added to collapse them.
 *
 * ⭐ P-2 — THE `delete` CONTEXT'S INVOCATION ASYMMETRY
 * ------------------------------------------------------------------------------------------------
 * The delete context is HARD-CODED: `org/Hibachi/HibachiService.cfc:L55` calls
 * `arguments.entity.validate(context="delete")` with a literal. The save context, by contrast, is a
 * DEFAULTED PARAMETER at `:L133` — `save(required any entity, struct data, string context="save")` — and
 * a caller may therefore override it. So a save context can be redirected while a delete guard cannot:
 * on the delete path this rule is unconditional.
 *
 * The universal legacy shape around both is VALIDATE, THEN CHECK FOR ERRORS, THEN PERSIST. `../Validator`
 * never persists, and neither does this file — it declares data. The same guard is additionally reachable
 * WITHOUT any delete happening at all, through the non-mutating dry-run path: the deletability predicate
 * at `org/Hibachi/HibachiEntity.cfc:L205` validates against the delete context with error recording
 * switched OFF and reads the verdict off the returned throwaway bag. That is a real code path for this
 * rule specifically, which is why every declaration in this file is pure declarative data that mutates
 * nothing and assumes nothing about whether errors are being recorded.
 *
 * THE COLLECTION READ IS THE **INVERSE** SIDE OF THE MANY-TO-MANY. `model/entity/Option.cfc:L66` carries
 * `inverse="true"`; the OWNING side is `model/entity/Sku.cfc:L76`, which declares the same link table
 * with the join columns reversed and no `inverse` attribute. The guard simply reads the property, so its
 * value depends on how the target hydrates that link table — a `src/adapters/mysql` concern, named here
 * only so the dependency is visible. The table name appears in this sentence and in the subject shape's
 * provenance comment, and nowhere else (S2).
 *
 * ⚠️ A CASCADE-VERSUS-GUARD TENSION, NOTED AND DELIBERATELY NOT RESOLVED (S8, guideline 4). The entity's
 * image collection at `model/entity/Option.cfc:L63` declares `cascade="all-delete-orphan"`, while the
 * document's only delete guard blocks on `skus`. So deleting an Option is BLOCKED by SKU membership yet
 * SILENTLY CASCADES its images away. That is a genuine unresolved tension in the legacy design and it is
 * left exactly as found — resolving it would mean choosing one of two behaviours the legacy declares. The
 * folder contains several more of the same shape: `model/entity/OptionGroup.cfc:L70` options
 * `cascade="all-delete-orphan"` against a blocking ceiling, `model/entity/ProductType.cfc:L65`
 * `childProductTypes` `cascade="all"` and `:L66` `products` `cascade="all" lazy="extra"` both against
 * blocking guards, and `model/entity/Product.cfc:L73` `skus` `cascade="all-delete-orphan" inverse="true"`.
 * This is a plain note: no new execution-model number is opened for it — M1 through M8 are all allocated
 * — and no defect register entry is invented, the register being closed at D1 through D22.
 *
 * Emits `validate.delete.Option.skus.maxCollection`.
 */
export const skusMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/* ================================================================================================
 * THE FOUR PROPERTY VALIDATIONS
 *
 * Each pairs the error key with an explicit reader and the rules that apply. The reader replaces the
 * legacy engine's runtime accessor-name composition and dynamic invocation — the
 * `invokeMethod("get" & listLast(...))` pattern visible in every `validate_*` body, for example at
 * `org/Hibachi/HibachiValidationService.cfc:L241` — with a typed function, per TR-3 and AAP §0.7.3 S3.
 * Each reader is a PLAIN SYNCHRONOUS accessor returning the unknown top type, as `../Validator`
 * requires: a reader returning a promise would have the promise measured instead of the value, and would
 * silently pass every simple-value predicate.
 *
 * Exported individually so the net-new suite can import and assert any one of them in isolation (S6),
 * and frozen at every level so the declarations cannot drift at run time.
 * ============================================================================================== */

/**
 * `optionCode` — presence, uniqueness and format, in the source document's own key order.
 *
 * ONE RULE OBJECT, THREE CONSTRAINTS, ONE CONTEXT GATE, ONE ERROR KEY. The gate is declared once on the
 * rule, exactly as the legacy flattening copies it onto each constraint record it produces
 * (`org/Hibachi/HibachiValidationService.cfc:L77-L88`). See {@link optionCodeRequiredConstraint},
 * {@link optionCodeUniqueConstraint} and {@link optionCodeRegexConstraint}.
 */
export const optionCodeValidation = Object.freeze({
  propertyIdentifier: OPTION_CODE_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.optionCode,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([
        optionCodeRequiredConstraint,
        optionCodeUniqueConstraint,
        optionCodeRegexConstraint,
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/** `optionName` — presence only. See {@link optionNameRequiredConstraint}. */
export const optionNameValidation = Object.freeze({
  propertyIdentifier: OPTION_NAME_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.optionName,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([optionNameRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/**
 * `optionGroup` — presence only, and the sole live enforcement of the required relationship. See
 * {@link optionGroupRequiredConstraint}.
 */
export const optionGroupValidation = Object.freeze({
  propertyIdentifier: OPTION_GROUP_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.optionGroup,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([optionGroupRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/**
 * `skus` — the delete guard, and the document's only rule outside the save context. See
 * {@link skusMaxCollectionConstraint}.
 */
export const skusValidation = Object.freeze({
  propertyIdentifier: SKUS_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.skus,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([skusMaxCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/* ================================================================================================
 * THE ASSEMBLED RULE SET
 * ============================================================================================== */

/**
 * The complete `Option` rule set — the typed equivalent of the whole of `model/validation/Option.json`.
 *
 * FOUR PROPERTY VALIDATIONS, IN THE SOURCE DOCUMENT'S OWN KEY ORDER: `optionCode` (`:3`), `optionName`
 * (`:4`), `optionGroup` (`:5`), `skus` (`:6`). Four rule objects, SIX constraints, five of the thirteen
 * constraint keys. Nothing is added and nothing is dropped; the census in the module header is the
 * assertion target.
 *
 * ⭐ EVERY RULE IN THIS FILE IS LIVE — IN DELIBERATE CONTRAST WITH FOUR OF ITS SIX SIBLINGS
 * ------------------------------------------------------------------------------------------------
 * The engine gates every rule at `org/Hibachi/HibachiValidationService.cfc:L171` with
 * `if(arguments.object.hasProperty(propertyIdentifier))`, so A RULE WHOSE PROPERTY THE OBJECT DOES NOT
 * DECLARE IS SILENTLY SKIPPED — not failed, not raised. Four of the seven in-scope documents exploit that
 * unintentionally: `model/validation/Product.json`, `model/validation/Sku.json`,
 * `model/validation/Brand.json` and `model/validation/ProductType.json` each declare a `physicalCounts`
 * delete guard against a property NO entity declares — the entities declare `physicals` — so all four of
 * those guards are inert at run time.
 *
 * `model/validation/Option.json` HAS NO SUCH RULE, measured directly: the token occurs in exactly four of
 * the seven documents and not in this one. All four of this document's keys name real declared persistent
 * properties — `optionCode` (`model/entity/Option.cfc:L53`), `optionName` (`:L54`), `optionGroup` (`:L59`)
 * and `skus` (`:L66`) — and the compile-checked identifiers above make that a type-level invariant rather
 * than a claim. THEREFORE EVERY RULE HERE FIRES. A reader who assumes symmetry with the four
 * inert-guard files would be wrong about this document, which is why the contrast is written down.
 *
 * A RELATED FACT, worth stating because it looks like a gap: `model/entity/Option.cfc:L85-L87` contains an
 * EMPTY non-persistent property region. AAP §0.2.2.6 records the same from the other side — "`Brand.cfc`,
 * `Option.cfc` and `OptionGroup.cfc` declare no non-persistent properties at all, so they are
 * unaffected" — so unlike `Product` and `Sku` this entity has no calculated members reaching out-of-scope
 * services, and no rule here needs a boundary port to be evaluable.
 *
 * THE CONDITION LIST IS OMITTED RATHER THAN SET EMPTY. `model/validation/Option.json` declares no
 * conditional block; across the seven documents `conditions` occurs only in
 * `model/validation/Product_UpdateSkus.json`. Under `exactOptionalPropertyTypes` an explicitly-undefined
 * optional member is not the same type as an absent one, so writing it out as undefined would not compile
 * against `../Validator`'s declaration. Absence is both the correct transcription and the only form that
 * type-checks.
 *
 * THE RESULT IS FROZEN AT EVERY LEVEL and contains no behaviour beyond the four pure readers. That is what
 * makes it safe as module-scope state under M7 — see NO MEMOISATION in the module header — and what makes
 * the non-mutating evaluation contract satisfiable: `../Validator` returns its error bag and supports a
 * mode that records nothing, which the three predicate accessors at `org/Hibachi/HibachiEntity.cfc:L205`,
 * `:L215` and `:L225` each rely on. The deletability predicate on an Option flows through the delete guard
 * above by exactly that route.
 *
 * A CONSTANT RATHER THAN A FACTORY, and the reason is worth stating because `./brand.rules` publishes a
 * factory for its own rule set and the asymmetry is deliberate. Every type parameter in `../Validator`'s
 * rule model appears only in PARAMETER position — a property reader is `(subject: T) => unknown` and a
 * uniqueness target resolver is `(subject: T) => UniquePropertyEntity` — so a rule set typed over the wide
 * {@link OptionValidationSubject} is assignable to one typed over any narrower subject that satisfies it.
 * A caller holding a concrete Option-shaped entity therefore passes this value directly, with no
 * injection step and no re-typing. And there is nothing for an injected resolver to vary: `optionCode` is
 * a SINGLE-SEGMENT identifier, so the legacy last-object walk terminates at the subject itself for the one
 * uniqueness rule this document declares — see {@link resolveOptionUniqueTarget}. Publishing a factory
 * would mean re-declaring the `optionCode` rule a second time to thread a resolver through it, and a
 * second copy of a rule is precisely the drift this file argues against elsewhere. The selector is
 * exported on its own instead, so a caller that genuinely resolves its target another way composes the
 * two exported pieces rather than calling a builder.
 *
 * USAGE: this value is passed as an ARGUMENT, never imported by the engine — one rule set serves both
 * paths, because the legacy documents select by context inside a single file rather than by having one
 * file per context. The caller is the service layer; nothing in this file invokes anything.
 */
export const optionValidationRuleSet = Object.freeze({
  properties: Object.freeze([
    optionCodeValidation,
    optionNameValidation,
    optionGroupValidation,
    skusValidation,
  ] as const),
} as const) satisfies ValidationRuleSet<OptionValidationSubject>;

/* ================================================================================================
 * THE PROPERTIES THIS DOCUMENT DOES NOT CONSTRAIN — S9 / IR-12
 *
 * `model/entity/Option.cfc` declares EIGHTEEN properties. `model/validation/Option.json` constrains FOUR.
 * Every property below is real in the entity and carries NO rule whatsoever, so declaring one here would
 * be fabrication — and each is listed because each is something a competent engineer's instinct would
 * reach for. AAP §0.8.2 guideline 4 forbids exactly that: "Do not enhance or optimize business logic
 * beyond what the migration requires."
 *
 *   `optionID`          [:L52] `fieldtype="id" generator="uuid" length="32" unsavedvalue="" default=""`.
 *                       NO presence rule, NO 32-character ceiling and NO identifier-format pattern.
 *                       Identifier generation belongs to `src/util/uuid.ts` (IR-6: 32 hex characters, no
 *                       dashes), not to validation.
 *   `optionDescription` [:L55] `length="4000" hb_formFieldType="wysiwyg"`. NO ceiling of 4000 is derived
 *                       from that attribute. A mapping length is a column width, and the form-field hint
 *                       is a DISPLAY hint; neither is a validation rule. Folder-wide `maxLength` occurs
 *                       exactly once, on `model/validation/ProductType.json:7`.
 *   `sortOrder`         [:L56] `ormtype="integer" sortContext="optionGroup"`. NO presence rule, NO numeric
 *                       data type and NO floor. ⭐ This is the ONLY `sortContext` in the whole in-scope
 *                       slice; it is an ordering hint consumed elsewhere and never a constraint. Note the
 *                       contrast with `model/entity/OptionGroup.cfc:L58`, where the sibling's `sortOrder`
 *                       IS `required="true"` at the mapping level — a difference that is the source's and
 *                       is not harmonised.
 *   `defaultImage`      [:L60] many-to-one to `Image`, which is out of scope. No rule.
 *   `images`            [:L63] one-to-many, `cascade="all-delete-orphan" inverse="true"`. NO DELETE
 *                       GUARD. Deleting an Option cascades its images away and the document does not
 *                       block it; see the tension note at {@link skusMaxCollectionConstraint}. No guard is
 *                       invented to close it.
 *   the four `Promotion*` collections [:L67, :L68, :L69, :L70] — `promotionRewards`,
 *                       `promotionRewardExclusions`, `promotionQualifiers` and
 *                       `promotionQualifierExclusions`, all many-to-many inverse into the explicitly
 *                       out-of-scope `Promotion*` family — AAP §0.2.2.1 excludes every `Promotion*.cfc`
 *                       component beneath `model/`, nine files in all. NO rule and NO delete guard, even
 *                       though deleting a
 *                       promotion-referenced option is plainly hazardous. That absence is legacy behavior
 *                       and it is PRESERVED (guidelines 2 and 4), not repaired.
 *   `remoteID`          [:L73] a real persisted column with no rule of any kind.
 *   the four audit properties [:L76-L79] `createdDateTime`, `createdByAccount`, `modifiedDateTime` and
 *                       `modifiedByAccount`, each `hb_populateEnabled="false"`. No rules; they belong to
 *                       `src/domain/base/AuditableEntity.ts`.
 *
 * `getImageDirectory()` [:L81-L83] reads `setting('globalAssetsImageFolderPath')` and is NOT rule-bearing,
 * so this file imports no settings-resolution port and no declaration below reaches one. That key's
 * resolver is owned by `src/ports/SettingResolverPort.ts`, which sits deliberately outside this file's
 * import set (§3) — naming it here is documentation of the boundary, never a dependency on it.
 *
 * NO PARITY ANNOTATION APPEARS IN THIS FILE, and that is a finding rather than an omission: no
 * entry in the defect register crosses `model/validation/Option.json`'s boundary. The register is CLOSED
 * at D1 through D22 and no D-number is invented here; the plan's one declared exception to
 * preserve-and-annotate is D18, which belongs to `src/adapters/mysql`, and this file claims none.
 * ============================================================================================== */
