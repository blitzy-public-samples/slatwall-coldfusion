/**
 * `optionGroup.rules.ts` — the typed transliteration of `model/validation/OptionGroup.json`.
 *
 * AAP §0.4.1.5 makes this file CREATE against that document: "Name and code requirements, option delete
 * guard". AAP §0.2.1.5 adds the detail — "`optionGroupName` required, `optionGroupCode`
 * required/unique/regex; delete guard on options".
 *
 * The generic evaluation semantics every constraint below depends on — the null verdict per constraint,
 * the error key, context selection, the uniqueness polarity and the deliberate non-ports — are stated once
 * in `../Validator` and are not repeated here.
 *
 * THIS FILE IS AN IMPLICIT SCOPE ADDITION, ON EVIDENCE RATHER THAN INSTRUCTION. `OptionGroup` is not one
 * of the five catalog entities the brief names. AAP §0.2.1.2 adds it because omitting it "would leave the
 * option model unusable", on four pieces of evidence: `Option.optionGroup` is the required many-to-one
 * side of the relationship (`model/entity/Option.cfc:L59`); `ProductService.processProduct_addOptionGroup`
 * resolves an option group through the option service (`model/service/ProductService.cfc:L115`);
 * `Product.getOptionGroups()` queries the entity directly (`model/entity/Product.cfc:L251-L261`); and the
 * sorted-SKU ordering query reads the group's sort order (`model/dao/SkuDAO.cfc:L172-L204`). Its
 * validation document is an implicit addition for the same reason (AAP §0.2.1.5).
 *
 * THE CENSUS — THREE PROPERTIES, FIVE CONSTRAINTS, TWO CONTEXTS. This is the SMALLEST of the seven
 * in-scope documents, and the whole of it is reproduced structurally below.
 *
 *   `model/validation/OptionGroup.json:L3`   optionGroupName   save     required                    (1)
 *   `model/validation/OptionGroup.json:L4`   optionGroupCode   save     required + unique + regex   (3)
 *   `model/validation/OptionGroup.json:L5`   options           delete   maxCollection 0             (1)
 *
 * Of the thirteen constraint keys the seven documents use between them this document reaches exactly
 * four — presence, uniqueness, pattern and collection ceiling — plus the `contexts` selection key. It
 * declares none of the rest, so none appears below; declaring one would be fabrication under AAP §0.7.3
 * S9. Its ONLY numeric literal is the collection ceiling `0` at `model/validation/OptionGroup.json:L5`.
 *
 * THIS FILE COVERS `OptionGroup` ONLY. `Option` has its own document, `model/validation/Option.json`, and
 * its own target file `./option.rules`. The two entities carry separate rule sets and separate class names
 * in their emitted keys, so the near-identical `optionGroupCode` and `optionCode` constraint triples are a
 * genuine parallel in the legacy source rather than a duplication to be factored away — with one
 * exception, the format pattern itself, which is byte-identical across the documents that declare it and
 * is therefore owned by `./product.rules` and imported. Nothing here imports `./option.rules`.
 *
 * THE FIVE EMITTED MESSAGE KEYS. `validateConstraint` composes the key at
 * `org/Hibachi/HibachiValidationService.cfc:L230` for every constraint that is neither `method` nor
 * `dataType`, which is all five here:
 *
 *   validate.save.OptionGroup.optionGroupName.required
 *   validate.save.OptionGroup.optionGroupCode.required
 *   validate.save.OptionGroup.optionGroupCode.unique
 *   validate.save.OptionGroup.optionGroupCode.regex
 *   validate.delete.OptionGroup.options.maxCollection
 *
 * Per DECISION D-1 in `../Validator` the resource-bundle substitution pass is deliberately skipped, so
 * these are KEYS, NOT SENTENCES: nothing here or downstream translates, sentence-cases, normalises, trims
 * or beautifies one, and `../util/formatting` is consequently not imported, because with the substitution
 * skipped it would be dead code (AAP §0.8.2 guideline 4). Note also that the key is always the PROPERTY
 * IDENTIFIER and never the constraint type, so all three `optionGroupCode` constraints report under
 * `optionGroupCode`; two or three failures landing under one key is exactly why the error bag's value is
 * an array.
 *
 * NO CASCADE REACHES THE CHILDREN, and this is the file where a reader is most likely to expect one.
 * `OptionGroup` -> `options` -> `Option` is precisely the parent/child graph over which a cascading
 * validation pass would run — but the engine's cascade
 * (`org/Hibachi/HibachiValidationService.cfc:L133-L151` feeding
 * `org/Hibachi/HibachiTransient.cfc:L412-L453`) is keyed on document keys that none of the seven in-scope
 * documents declares, so it is unreachable for this slice. Saving or deleting a group never re-validates
 * its options through this rule set.
 *
 * DETERMINISTIC EVALUATION ORDER — A DETERMINISM CHOICE, NOT A BEHAVIOR CHANGE. The legacy engine reaches
 * a document's properties by iterating a CFML struct (`org/Hibachi/HibachiValidationService.cfc:L63`),
 * whose key order is UNSPECIFIED. The declaration order below fixes both levels in the DATA SHAPE:
 * properties in the source document's key order — `optionGroupName`, `optionGroupCode`, `options` — and
 * within `optionGroupCode` the source key order `required`, `unique`, `regex`. It is safe precisely
 * BECAUSE evaluation never short-circuits and every failure accumulates, so the SET of reported failures
 * is order-independent and no legacy outcome could have depended on an order the engine never guaranteed.
 * What determinism buys is a reproducible message array, which is what lets a test assert on one at all.
 *
 * ARCHITECTURAL POSITION. This file issues ZERO SQL (AAP §0.7.3 S2, as a negative obligation): no
 * statement text, no fragment, no driver, no connection. The physical tables behind this document,
 * `SwOptionGroup` and its child `SwOption`, are named in this sentence and nowhere else; every string
 * literal below is either a validation CONTEXT name or one of the document's own PROPERTY KEYS. Uniqueness
 * reaches the database exclusively through the port constructor-injected into `../Validator` (S3, S4);
 * this file names the constraint and resolves its target, and never calls the port.
 *
 * @see `../Validator` for the evaluation semantics every constraint below depends on
 * @see `model/validation/OptionGroup.json` — the source document, REFERENCE-ONLY
 * @see `model/entity/OptionGroup.cfc` — the property metadata that decides what may be declared here
 */

import type { OptionGroupPropertyName } from '../../domain/option/OptionGroup';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import { CODE_FORMAT_REGEX } from './product.rules';
import type {
  MaxCollectionConstraint,
  PropertyValidation,
  RegexConstraint,
  RequiredConstraint,
  UniqueConstraint,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/**
 * What this rule set requires of the object being validated, and nothing more.
 *
 * STRUCTURAL, NEVER NOMINAL — the established convention of this subtree rather than a choice made
 * here. `../Validator` states that its subject shape is structural so that every ported entity and
 * process object satisfies it without declaring that it does, and so that a hand-written literal
 * satisfies it too; `./product.rules`, `./productType.rules` and `./brand.rules` compose their
 * contracts the same way. Nothing extends anything, because AAP 0.3.3 replaces the legacy
 * template-method inheritance with composition.
 *
 * An intersection of three parts, each present for a stated reason:
 *
 *   1. {@link ValidationSubject} — the engine's own two members: the class name that forms the
 *      third segment of every emitted key, and the property-existence predicate the engine
 *      consults at [`org/Hibachi/HibachiValidationService.cfc:L171`] before evaluating any rule of
 *      a property. See {@link OPTIONS_PROPERTY} for why that predicate answers TRUE for all three
 *      names here, which is what makes every rule in this file LIVE.
 *
 *   2. {@link UniquePropertyEntity} — the five-accessor shape the uniqueness port needs, in the
 *      order [`org/Hibachi/HibachiDAO.cfc:L134-L138`] invokes them. Required because this document
 *      declares ONE `unique` constraint and `../Validator` types a uniqueness constraint's target
 *      resolver as returning this shape. `../Validator` deliberately keeps those five accessors OFF
 *      its own subject contract, so a rule set that needs them must ask; this one does. The ported
 *      `OptionGroup` domain class does not implement them — it is a plain data class with no
 *      framework base — so the subject handed to the evaluator is a validation VIEW composed at the
 *      call site, exactly as the sibling rule sets assume.
 *
 *   3. The three property values these rules actually READ, and no others.
 *
 * EVERY MEMBER IS OPTIONAL AND READ-ONLY, AND EVERY VALUE IS ALREADY RESOLVED. Two independent
 * constraints force that shape:
 *
 *   - `../Validator` requires a property reader to be a PLAIN SYNCHRONOUS accessor; one returning a
 *     promise "would be compared as an object and would silently fail every simple-value
 *     predicate". All three properties here are genuinely synchronous — see
 *     {@link optionsValidation} — so the constraint costs this file nothing, but the contract is
 *     stated in the same shape its siblings use.
 *   - Optionality keeps the engine's ABSENCE branches reachable from a plain object literal. A
 *     collection ceiling PASSES on an absent value while a presence check FAILS on one, so absence
 *     is a SPECIFIED INPUT, not a defect. The legacy repository contains no mocking library at all
 *     (AAP 0.6.5.2), so the net-new suite substitutes hand-written subjects; were these members
 *     required, half the specified branches could not be reached without a type assertion, and
 *     assertions are forbidden here (AAP 0.7.3 S1).
 *
 * NOTE WHAT IS ABSENT, because the absences are load-bearing. `model/entity/OptionGroup.cfc`
 * declares thirteen properties; this contract carries THREE. There is deliberately no member for
 * `optionGroupID`, `optionGroupImage`, `optionGroupDescription`, `imageGroupFlag`, `remoteID`, the
 * four audit properties, or — most pointedly — `sortOrder`. Section 3 records every one of those
 * absences, and the `sortOrder` absence is MANDATED rather than incidental. No rule reads them, so
 * no member exists for them.
 */
export type OptionGroupValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /**
     * `property name="optionGroupName" ormtype="string";`
     * [`model/entity/OptionGroup.cfc:L53`] — read by the presence rule at
     * [`model/validation/OptionGroup.json:L3`].
     *
     * Note the mapping declares NO `required` and NO `length`, which is why that one rule is the
     * only enforcement of this property anywhere in the system. See
     * {@link optionGroupNameRequiredConstraint}.
     */
    readonly optionGroupName?: string;

    /**
     * `property name="optionGroupCode" ormtype="string";`
     * [`model/entity/OptionGroup.cfc:L54`] — read by ALL THREE constraints of
     * [`model/validation/OptionGroup.json:L4`].
     *
     * The mapping declares NO `unique="true"` and NO `length`. See
     * {@link optionGroupCodeUniqueConstraint} for the consequence, which is the most significant
     * finding in this file.
     */
    readonly optionGroupCode?: string;

    /**
     * The one-to-many option collection [`model/entity/OptionGroup.cfc:L70`] — read by the delete
     * guard at [`model/validation/OptionGroup.json:L5`].
     *
     * TYPED WITH THE UNKNOWN ELEMENT TYPE ON PURPOSE. A collection ceiling MEASURES SIZE and never
     * inspects an element [`org/Hibachi/HibachiValidationService.cfc:L311`]. Typing the element
     * precisely would force an import of `../../domain/option/Option`, which is not among this
     * file's declared dependencies — reaching for one would breach AAP 0.7.3 S4. The honest type is
     * the one that says "a value whose interior is none of my business", and `./brand.rules` and
     * `./productType.rules` record the same reasoning for their own collections.
     */
    readonly options?: readonly unknown[];
  };

/* ==============================================================================================
 * SECTION 2 — THE TWO CONTEXTS
 *
 * P-2 — THE DELETE CONTEXT IS NOT OPTIONAL, AND THE ASYMMETRY IS INVISIBLE FROM THE JSON ALONE.
 *
 * This document declares exactly two context strings, and they are NOT symmetric in how they reach
 * the engine. The difference is what makes this file's single delete guard unconditional:
 *
 *   - `delete` is HARD-CODED at the one delete call site:
 *     `arguments.entity.validate(context="delete")` at [`org/Hibachi/HibachiService.cfc:L55`].
 *     There is no parameter to omit and no default to fall back to, so EVERY delete of an option
 *     group runs the `options` guard. A caller cannot bypass it.
 *   - `save` is a DEFAULTED PARAMETER on the save signature —
 *     `public any function save(required any entity, struct data, string context="save")` at
 *     [`org/Hibachi/HibachiService.cfc:L133`] — so a caller MAY pass something else, and the two
 *     save rules below then do not apply at all.
 *
 * The universal legacy shape either way is VALIDATE, then CHECK for errors, then PERSIST.
 * `../Validator` never persists, and neither does this file.
 *
 * A CONSEQUENCE WORTH STATING BECAUSE IT LOOKS LIKE A BUG. Under the engine's DEFAULT context —
 * the empty string, per the signature at [`org/Hibachi/HibachiValidationService.cfc:L153`] — a rule
 * that CARRIES a `contexts` key can never match, because the list membership test at
 * [`org/Hibachi/HibachiValidationService.cfc:L71`] cannot find anything in an empty string. All
 * three rules of this document carry a `contexts` key, so under the default context THIS FILE
 * CONTRIBUTES NOTHING. That is correct and intended. (The inverse holds only for
 * `./productUpdateSkus.rules`, whose rules carry no `contexts` key and therefore fire in EVERY
 * context.) Note also [`org/Hibachi/HibachiValidationService.cfc:L162`]: a context that is
 * boolean-castable and casts to false skips validation entirely — the empty string is not
 * boolean-castable, so under the default context validation still RUNS, it simply matches no rule
 * here.
 *
 * THE DRY-RUN CONTRACT (requirement N1), and why it matters to the delete guard specifically.
 * `validate` takes a third parameter [`org/Hibachi/HibachiValidationService.cfc:L153`], and
 * [`org/Hibachi/HibachiEntity.cfc:L205`], [`:L215`] and [`:L225`] call it with that parameter set
 * FALSE, reading the error state off the returned throwaway bag — which is how `isDeletable()`,
 * `isEditable()` and `isProcessable()` work. `isDeletable()` on an option group is therefore how
 * the "can this be deleted?" question is answered, and it flows through this file's ONE
 * `delete`-context rule. Everything below is consequently PURELY DECLARATIVE DATA: no side effect,
 * no mutation of the subject, and nothing that assumes errors are being recorded.
 * ============================================================================================ */

/**
 * The save context, as [`model/validation/OptionGroup.json:L3`] and [`:L4`] spell it.
 *
 * A plain string, never a closed literal union: `../Validator` types the context as an open `string`
 * (requirement N2) because the editability and processability checks at
 * [`org/Hibachi/HibachiEntity.cfc:L215`] and [`:L225`] pass context strings that appear in no
 * in-scope document at all, and a closed union would make them unrepresentable.
 */
const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

/* ==============================================================================================
 * SECTION 3 — THE THREE PROPERTY IDENTIFIERS, AND THE TEN NAMES THAT GET NO RULE
 *
 * EVERY RULE IN THIS FILE IS LIVE — AND HERE THAT IS A COMPILE-TIME FACT, NOT A COMMENT.
 *
 * The engine gates every rule at [`org/Hibachi/HibachiValidationService.cfc:L171`] with a
 * property-existence test, and the consequence is consequential: A RULE WHOSE PROPERTY IS NOT
 * DECLARED ON THE OBJECT IS SILENTLY SKIPPED — not failed, not raised, skipped. FOUR of this
 * folder's seven documents exploit that accidentally: `model/validation/Product.json`,
 * `model/validation/Sku.json`, `model/validation/ProductType.json` and
 * `model/validation/Brand.json` each declare a `physicalCounts` collection-ceiling delete guard
 * against a property NO entity declares (the entities declare `physicals`), so all four of those
 * guards are INERT at runtime. Their ports each needed a conditional-type escape hatch to
 * compile-prove an absent name.
 *
 * `model/validation/OptionGroup.json` has NO `physicalCounts` rule, and all three of its keys —
 * `optionGroupName` [`model/entity/OptionGroup.cfc:L53`], `optionGroupCode` [`:L54`] and `options`
 * [`:L70`] — are REAL DECLARED PERSISTENT PROPERTIES. So this file needs no escape hatch: each
 * identifier below is constrained directly against the union `../../domain/option/OptionGroup`
 * exports, which makes "all three rules are live" something the compiler proves rather than
 * something a reader has to take on trust. If any of the three ever ceased to be a declared
 * property, this file would stop compiling.
 *
 * That also corroborates AAP 0.2.2.6 exactly — "`Brand.cfc`, `Option.cfc` and `OptionGroup.cfc`
 * declare no non-persistent properties at all, so they are unaffected". The entity's
 * non-persistent-property region [`model/entity/OptionGroup.cfc:L85-L87`] is EMPTY, as are its
 * overridden-methods region [`:L101-L103`] and its ORM-event-hooks region [`:L105-L107`]. There is
 * therefore no calculated member anywhere in this entity for a rule to reach through, and no
 * boundary port is needed by this file at all beyond the uniqueness one.
 * ============================================================================================ */

/**
 * The error key for the name rule. [`model/validation/OptionGroup.json:L3`]
 *
 * Compile-checked as a real declared property of the entity [`model/entity/OptionGroup.cfc:L53`].
 */
const OPTION_GROUP_NAME_PROPERTY = 'optionGroupName' satisfies OptionGroupPropertyName;

/**
 * The error key shared by all three code constraints. [`model/validation/OptionGroup.json:L4`]
 *
 * Compile-checked as a real declared property of the entity [`model/entity/OptionGroup.cfc:L54`].
 */
const OPTION_GROUP_CODE_PROPERTY = 'optionGroupCode' satisfies OptionGroupPropertyName;

/**
 * The error key for the delete guard. [`model/validation/OptionGroup.json:L5`]
 *
 * Compile-checked as a real declared property of the entity [`model/entity/OptionGroup.cfc:L70`] —
 * the one-to-many option collection, which is what makes this guard live where the four sibling
 * `physicalCounts` guards are inert.
 */
const OPTIONS_PROPERTY = 'options' satisfies OptionGroupPropertyName;

/* ----------------------------------------------------------------------------------------------
 * THE `sortOrder` NON-DECLARATION — A MANDATED OMISSION, AND THE SHARPEST TRAP IN THIS FILE
 *
 * [`model/entity/OptionGroup.cfc:L58`], byte-exact:
 *
 *     property name="sortOrder" ormtype="integer" required="true";
 *
 * `required="true"` — AND `sortOrder` IS ABSENT FROM `model/validation/OptionGroup.json` ENTIRELY.
 * There is deliberately NO identifier constant for it above, NO member for it on
 * {@link OptionGroupValidationSubject}, and NO rule for it anywhere below: not `required`, not a
 * numeric data type, not a minimum value.
 *
 * THIS IS THE EXACT MIRROR IMAGE of the finding recorded at
 * {@link optionGroupCodeUniqueConstraint}, and the two are worth reading together because together
 * they show the two enforcement mechanisms diverging in BOTH directions on the same entity:
 *   - there, the VALIDATION DOCUMENT enforces something the ORM MAPPING DOES NOT
 *     (`optionGroupCode` uniqueness, with no `unique="true"` column behind it);
 *   - here, the ORM MAPPING enforces something the VALIDATION DOCUMENT DOES NOT (`sortOrder`
 *     presence, with no rule in front of it).
 *
 * WHY NOT JUST ADD IT? Because the observable contract being preserved is the VALIDATION LAYER's,
 * and adding a presence rule would REJECT SAVES THE LEGACY VALIDATION LAYER ACCEPTS — precisely the
 * silent behavioural drift AAP 0.2.1.5 warns about. AAP 0.8.2 guideline 4 is explicit: "Do not
 * enhance or optimize business logic beyond what the migration requires." AAP 0.7.3 S9 says the
 * same as "invent nothing". A competent engineer's instinct on reading `required="true"` is to add
 * the rule; that instinct is wrong here, and naming it converts an invisible temptation into a
 * documented decision.
 *
 * THE FIELD IS NOT DEAD, WHICH IS WHY THIS IS WORTH RECORDING RATHER THAN SHRUGGING AT. `sortOrder`
 * is genuinely load-bearing downstream: the sorted-SKU ordering query reads the option group's sort
 * order [`model/dao/SkuDAO.cfc:L172-L204`], and the option collection itself is ordered by it
 * [`model/entity/OptionGroup.cfc:L70`, `orderby="sortOrder"`]. A row that reaches the database
 * without one is a real problem — it is simply a problem the MAPPING catches and this layer does
 * not, and reproducing that division is the job.
 *
 * CARRIED, NOT RESOLVED. Recorded as a plain divergence note under AAP 0.7.3 S8 ("flag mismatches
 * rather than assume them away"). AAP 0.7.3 S7 ("preserve and annotate, do not repair") is honoured
 * by carrying it, but it is NOT a carried DEFECT — the legacy behaviour here is coherent, just
 * split across two layers — so it carries no parity annotation and claims no entry in the plan's
 * defect register, which is closed. It is NOT an execution-model mismatch either, so it claims no
 * new mismatch number; those are fully allocated.
 * -------------------------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------------------------
 * THE OTHER NINE UNCONSTRAINED PROPERTIES — AAP 0.7.3 S9, INVENT NOTHING.
 *
 * `model/entity/OptionGroup.cfc` declares thirteen properties; this document constrains THREE. Each
 * name below is real in the entity and carries NO rule whatsoever. Declaring one would be
 * fabrication, and each is listed with the specific fabrication it invites:
 *
 *   `optionGroupID`          [:L52]  `fieldtype="id" generator="uuid" length="32" unsavedvalue=""
 *                                   default=""`. NO presence rule, NO maximum length of 32, NO
 *                                   identifier-format pattern. Identifier generation belongs to
 *                                   `../../util/uuid` (IR-6: 32 hex characters, no dashes).
 *   `optionGroupImage`       [:L55]  NO path, extension or address constraint. For scale: the
 *                                   address data type appears exactly ONCE across all seven
 *                                   documents, on `Brand.brandWebsite`, and nowhere else.
 *   `optionGroupDescription` [:L56]  `length="4000"`. NO maximum length of 4000 is derived from it.
 *                                   The maximum-length constraint appears exactly ONCE folder-wide,
 *                                   on `ProductType.systemCode`, where its value is 0.
 *   `imageGroupFlag`         [:L57]  `ormtype="boolean" default="0"`. NO data-type rule and
 *                                   specifically NO equality rule: the folder's five equality uses
 *                                   are three delete-guard flags compared against false and two
 *                                   `Product_UpdateSkus` conditions compared against 1 — none of
 *                                   them here.
 *   `sortOrder`              [:L58]  NO rule, despite ORM `required="true"`. See the mandate above.
 *   `remoteID`               [:L61]  NO rule.
 *   the four audit properties [:L64-L67], each `hb_populateEnabled="false"` — NO rules. They belong
 *                                   to `../../domain/base/AuditableEntity`.
 *
 * Two entity METHODS are likewise not rule-bearing and get nothing here:
 *   `getOptionsSmartList()`  [:L81-L83] — the paginated-query surface is reached through the
 *                                   subtree's own query port elsewhere in the port and is not a
 *                                   validation concern. That port is deliberately not imported.
 *   `addOption()` / `removeOption()` [:L92-L97] — bidirectional helpers that delegate to the child
 *                                   entity, which owns the many-to-one side
 *                                   [`model/entity/Option.cfc:L59`]. Not rule-bearing.
 *
 * No maximum length, no address format, no positive-integer check, no "sensible" default and no
 * cross-property comparison is invented anywhere in this file. THE ONLY NUMERIC LITERAL IN IT is
 * the collection ceiling of 0 at [`model/validation/OptionGroup.json:L5`], transcribed below.
 * -------------------------------------------------------------------------------------------- */

/* ==============================================================================================
 * SECTION 4 — THE FIVE CONSTRAINTS
 *
 * Five, exhaustively, and each is exported so the net-new suite can assert it on its own
 * (AAP 0.7.3 S6). Of the thirteen constraint keys the seven in-scope documents use between them,
 * this document reaches exactly FOUR — presence, uniqueness, pattern and collection ceiling — plus
 * the `contexts` selection key of Section 2. It declares NO conditions, NO method rule, NO data
 * type, NO minimum value, NO maximum length, NO collection floor, NO equality and NO list
 * membership. `../Validator` models the constraint kinds as a closed discriminated union, so writing
 * one of the absent kinds — or a key that exists nowhere in the seven — is a COMPILE ERROR here,
 * which is strictly stronger than the legacy engine's runtime raise at
 * [`org/Hibachi/HibachiValidationService.cfc:L202`].
 *
 * Every literal is frozen at its own declaration site. Freezing is SHALLOW, so each nested array and
 * rule object below is frozen individually rather than relying on an outer freeze to reach it. The
 * reason is M7: module-scope state is the ONLY thing that survives between invocations on a warm
 * container, so the one piece of module-scope state this file has must be provably immutable. It
 * qualifies because it is frozen, request-independent declarative data with no side effect at module
 * load — it holds no connection, no request context, no resolved property value and no accumulated
 * error.
 * ============================================================================================ */

/**
 * `optionGroupName` must be PRESENT on save.
 *
 * [`model/validation/OptionGroup.json:L3`] `"optionGroupName": [{"contexts":"save","required":true}]`
 *
 * =============================================================================================
 * THIS RULE IS THE ONLY ENFORCEMENT OF THE NAME ANYWHERE IN THE SYSTEM
 * =============================================================================================
 * The mapping is `property name="optionGroupName" ormtype="string";`
 * [`model/entity/OptionGroup.cfc:L53`] — NO `required`, NO `notnull`, NO `length`. The schema is
 * unchanged by this refactor (AAP 0.1.1.1 classifies the exercise as logic extraction with the
 * physical tables retained as the shared contract), so the database will accept a nameless option
 * group quite happily. A reader who assumes mapping-level enforcement will judge this rule redundant
 * and drop it; it is not redundant, it is the ENTIRE mechanism.
 *
 * Two AAP 0.7.3 S9 consequences follow from that same mapping line, and both are omissions:
 *   - NO maximum length is invented. There is no `length` attribute to derive one from.
 *   - NO pattern is invented. `optionGroupName` carries no format rule, UNLIKE `optionGroupCode` —
 *     and the asymmetry between the two properties one line apart in the document is real legacy
 *     structure, not an oversight to be tidied into symmetry.
 *
 * =============================================================================================
 * PRESENCE EDGE CASES, REPRODUCED SO NO DEFENSIVE GUARD IS ADDED ON TOP
 * =============================================================================================
 * From `validate_required` [`org/Hibachi/HibachiValidationService.cfc:L240-L245`], which passes only
 * when the value is not null AND is an object, OR a non-empty array, OR a non-empty struct, OR a
 * simple value whose TRIMMED STRING LENGTH exceeds zero:
 *
 *   absent or null            FAILS
 *   the empty string          FAILS
 *   a whitespace-only string  FAILS  — trimmed first, so "   " is as bad as ""
 *   an empty array            FAILS
 *   the number 0              PASSES — a genuine surprise, and it is not a typo: CFML measures the
 *                                     trimmed string form, and "0" has length 1. The same holds for
 *                                     the boolean false, whose string form is "false".
 *   any object reference      PASSES
 *
 * The constraint value is declared by the legacy evaluator and then NEVER READ
 * [`org/Hibachi/HibachiValidationService.cfc:L240`], so presence is enforced whatever it says. All
 * eighteen presence rules across the seven documents declare true, so the quirk is unobservable
 * here; the field is transcribed faithfully rather than dropped, and `../Validator` records the same
 * observation on its own declaration.
 *
 * Reported as `validate.save.OptionGroup.optionGroupName.required`.
 */
export const optionGroupNameRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `optionGroupCode` must be PRESENT on save — the FIRST of three constraints on one rule object.
 *
 * [`model/validation/OptionGroup.json:L4`]
 *
 * Presence semantics are identical to {@link optionGroupNameRequiredConstraint}; see there for the
 * full edge-case table, including the number 0 passing.
 *
 * HOW THE THREE INTERACT, WORKED THROUGH, because it is the single most common misreading of this
 * document. Evaluation NEVER SHORT-CIRCUITS, so a blank code that is also already taken produces
 * MORE THAN ONE message under the one key:
 *   - `""`            -> presence FAILS; uniqueness is still evaluated; the pattern FAILS too,
 *                        because the pattern requires one or more characters. Up to three messages.
 *   - absent / null   -> presence FAILS; uniqueness PASSES indirectly (see
 *                        {@link optionGroupCodeUniqueConstraint}); the pattern PASSES on absence.
 *                        Exactly one message.
 *   - `"A B"`         -> presence PASSES; the pattern FAILS on the space. One message, or two if the
 *                        value also collides.
 * ABSENT AND EMPTY ARE NOT INTERCHANGEABLE, which is exactly why all three constraints are declared
 * rather than one being assumed to imply another.
 *
 * Reported as `validate.save.OptionGroup.optionGroupCode.required`.
 */
export const optionGroupCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `optionGroupCode` must be UNIQUE on save — the second of three constraints on the same rule object.
 *
 * Transcribed from `model/validation/OptionGroup.json:L4`.
 *
 * FOR THIS PROPERTY THE RULE IS THE ONLY UNIQUENESS ENFORCEMENT IN THE ENTIRE SYSTEM.
 * `model/entity/OptionGroup.cfc:L54` declares the property with an ORM type and nothing else — no
 * `unique="true"`, no `length`. So there is NO database-level constraint behind this rule and no second
 * mechanism to fall back on; drop it as redundant, which is the reflex of a reader who assumes the schema
 * enforces uniqueness, and duplicate option-group codes simply save. `Option.optionCode`
 * (`model/entity/Option.cfc:L53`) is in the same position, so the option model as a whole depends entirely
 * on application-side checking for code uniqueness. That makes AAP IR-5 binding here in its strongest
 * form: "Application-side uniqueness checking is required in addition to database constraints."
 *
 * ⭐ THIS RULE IS SERIALIZED INSIDE A TRANSACTION AND UNPROTECTED OUTSIDE ONE — review finding SEC-RACE-01
 * (CWE-367). This rule and its `Option.optionCode` twin are the two with no `unique="true"` column behind
 * them, so the check is a read followed by a write with no constraint on `SwOptionGroup.optionGroupCode` to
 * refuse a second write. Two things changed, and neither claims the gap is closed:
 *
 *   • `../../adapters/mysql/UniquePropertyChecker.ts` appends `FOR UPDATE` when it has adopted a
 *     boundary's executor, so a save inside a transaction asks the database to make the second concurrent
 *     asker WAIT — and under REPEATABLE READ a no-match read takes a GAP lock, which is what protects the
 *     insert case. It is gated on transaction scope because a lock on a pool-bound autocommit connection is
 *     released at statement end and would protect nothing.
 *   • A lost race that a constraint DOES convict now arrives typed, and a deadlock or lock-wait timeout
 *     arrives classified `retryable: true`.
 *
 * ⛔ AN INTERVENING REVISION WITHDREW THE LOCK "on the COUNT rather than the merits: AAP §0.6.7.7 authorises
 * exactly ONE departure from behavioural preservation in this port, D18, and AAP §0.8.2 Guideline 4 admits
 * no proportionality test." §0.6.7 is the DEFECT AND TODO CARRY-OVER REGISTER of legacy BUSINESS-LOGIC
 * defects — it never spoke to concurrent data integrity in the extracted service — and the lock changes no
 * verdict this rule reaches.
 *
 * ⚠️ AND IT IS STILL ONLY PARTIAL. A lock binds writers that take it, not a legacy CFML request against the
 * same schema or an administrative INSERT. The remedy that binds every writer is
 *     ALTER TABLE SwOptionGroup ADD UNIQUE INDEX uq_SwOptionGroup_optionGroupCode (optionGroupCode);
 * and AUTHORING it is forbidden rather than forgotten: AAP §0.2.2.5 places schema migration outside this
 * refactoring, so the `Sw*` tables are read and written as they are. Flagged with the exact remedy, not
 * claimed closed (AAP §0.7.3 S8); the same residue is recorded on
 * `../../ports/UniquePropertyPort.ts`.
 *
 * See DECISION D-2 AND "THE SEVEN" in `../Validator` for the pinned polarity, for why the self-exclusion
 * term is a no-op on insert, and for all seven uniqueness locators. One entity-specific detail belongs
 * here: the mapping declares `unsavedvalue=""` and `default=""` (`model/entity/OptionGroup.cfc:L52`), so a
 * new group carries no identifier and the self-exclusion term excludes nothing. On UPDATE that same term
 * is live and does real work — it is what stops a row colliding with ITSELF and reporting its own
 * unchanged code as already taken.
 *
 * AN ABSENT VALUE PASSES UNIQUENESS, INDIRECTLY. `validate_unique`
 * (`org/Hibachi/HibachiValidationService.cfc:L467-L470`) has NO absence guard — unlike its sibling
 * `validate_uniqueOrNull` at `:L472-L479`, which does, and which none of the seven documents uses. The two
 * evaluators differ precisely there, which is what proves the omission is real rather than an artefact of
 * reading. With an absent value the existence query matches nothing, so the port must answer `true`: it
 * must not raise, must not rewrite the comparison into a null test and must not report the value as taken.
 * The presence constraint declared alongside on the same rule object is what actually rejects an absent
 * code, and it does that job independently. The constraint's own declared value is never read (`:L467`),
 * so the check always runs.
 *
 * THE TARGET RESOLVER IS THE IDENTITY FUNCTION, deliberately. The legacy engine resolves the entity to
 * check by walking the property identifier to its last object (`:L468`); `optionGroupCode` is a SINGLE
 * SEGMENT containing neither a dot nor an underscore, so that walk terminates immediately at the subject.
 * The indirection is retained because the legacy has it and because a dotted identifier would resolve
 * elsewhere, but no lookup is invented.
 *
 * Emits `validate.save.OptionGroup.optionGroupCode.unique`.
 */
export const optionGroupCodeUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: OptionGroupValidationSubject): UniquePropertyEntity => subject,
} as const) satisfies UniqueConstraint<OptionGroupValidationSubject>;

/**
 * `optionGroupCode` must MATCH THE SHARED CODE FORMAT on save — the THIRD constraint of the same
 * rule object.
 *
 * [`model/validation/OptionGroup.json:L4`], whose fourth key is the pattern. The pattern TEXT is
 * deliberately NOT reproduced in this comment either: it is transcribed character for character,
 * once, at {@link CODE_FORMAT_REGEX} in `./product.rules`, together with the character-class
 * analysis and the empirical accept and reject sets. A second copy in prose would be a second thing
 * that can drift, which is the very failure the single-owner decision below exists to prevent.
 *
 * =============================================================================================
 * THE PATTERN IS IMPORTED, NOT REDECLARED — AND THAT IS A SINGLE-SOURCE-OF-TRUTH DECISION
 * =============================================================================================
 * The literal occurs in exactly THREE of the seven in-scope documents and nowhere else in them:
 * `Product.productCode` [`model/validation/Product.json:L10`], `Option.optionCode`
 * [`model/validation/Option.json:L3`] and `OptionGroup.optionGroupCode`
 * [`model/validation/OptionGroup.json:L4`]. Its authoritative home is `./product.rules`, which owns
 * it by document order — `model/validation/Product.json:L10` is the first occurrence — and which
 * names this file as one of its two intended importers. `./option.rules` imports it from the same
 * place.
 *
 * So {@link CODE_FORMAT_REGEX} is IMPORTED here and the literal is NOT restated. A third copy is
 * exactly the drift the single-owner decision exists to prevent, and AAP 0.7.3 S6 requires the
 * net-new suite be able to assert ONE source of truth across all three consuming documents. A fourth
 * "shared constants" module is NOT authorised by the AAP and is not created: no `common.ts`, no
 * `types.ts`, no `constants.ts`, no helpers folder. One owner, three consumers. Note also that this
 * file imports NOTHING ELSE from `./product.rules` and nothing at all from `./option.rules` — the
 * documents are independent, and their similarity is not a dependency.
 *
 * IT IS A PATTERN STRING, NOT A COMPILED PATTERN, and that is required rather than stylistic.
 * `../Validator` types a pattern constraint's value as a string and compiles it FRESH on every
 * evaluation, precisely so nothing survives between invocations on a warm container (M7). Handing it
 * a pre-compiled object would fail to type-check AND defeat that guarantee, since a compiled pattern
 * carries mutable match state. Nothing is compiled here.
 *
 * NO FLAGS, EVER. `./product.rules` records the reasoning in full: `../Validator` compiles the pattern
 * with no flags; the unicode flag compiles but is pointless on a pure-ASCII class; and THE UNICODE-SETS
 * FLAG RAISES A SYNCHRONOUS `SyntaxError` WHEN THE PATTERN IS CONSTRUCTED on this character class — which,
 * because construction happens at the moment the constraint is evaluated, surfaces as a validation-time
 * failure on the invocation path rather than as a reported rule failure. Case-insensitive, global,
 * multiline and dot-all are equally unwelcome: the class already spells both letter cases out, and the
 * pattern anchors both ends itself.
 *
 * PATTERN SEMANTICS, so no guard is layered on top. `validate_regex`
 * [`org/Hibachi/HibachiValidationService.cfc:L481-L487`] PASSES ON AN ABSENT VALUE and otherwise
 * defers wholly to the pattern. It FAILS on the empty string, because the pattern requires one or
 * more characters. No absence guard, no presence-implying fallback and no trim belongs here — the
 * presence constraint on the same rule object does that job independently.
 *
 * Reported as `validate.save.OptionGroup.optionGroupCode.regex`.
 */
export const optionGroupCodeRegexConstraint = Object.freeze({
  constraintType: 'regex',
  constraintValue: CODE_FORMAT_REGEX,
} as const) satisfies RegexConstraint;

/**
 * THE DELETE GUARD — an option group that still has OPTIONS cannot be deleted.
 *
 * [`model/validation/OptionGroup.json:L5`] `"options": [{"contexts":"delete","maxCollection":0}]`
 *
 * This is the document's only `delete`-context rule, one of nine collection-ceiling guards across
 * the seven documents, and — per Section 2's P-2 note — UNCONDITIONAL, because the delete context is
 * hard-coded at its call site [`org/Hibachi/HibachiService.cfc:L55`] rather than defaulted.
 *
 * =============================================================================================
 * THE CASCADE-VERSUS-GUARD TENSION — RECORDED, AND DELIBERATELY NOT RESOLVED
 * =============================================================================================
 * The mapping, byte-exact [`model/entity/OptionGroup.cfc:L70`]:
 *
 *     property name="options" singularname="option" cfc="Option" fieldtype="one-to-many"
 *     fkcolumn="optionGroupID" inverse="true" cascade="all-delete-orphan" orderby="sortOrder";
 *
 * `cascade="all-delete-orphan"` instructs the ORM to delete the child options ALONG WITH their
 * group. The rule at [`model/validation/OptionGroup.json:L5`] BLOCKS THE DELETE ENTIRELY whenever any
 * child exists. So the cascade can NEVER FIRE for a non-empty group, because validation refuses the
 * delete first — and it has nothing to do for an empty one. This is a genuine, unresolved
 * inconsistency in the legacy source, and it is carried across as-is.
 *
 * NOTHING HERE RESOLVES IT. The guard is not relaxed to let the cascade work, the cascade is not
 * quietly forgotten, and no override or force-delete path is introduced. AAP 0.8.2 guideline 4
 * forbids enhancing behavior beyond what the migration requires, and AAP 0.7.3 S8 asks that such
 * mismatches be FLAGGED rather than silently resolved. It is a plain divergence note: not a carried
 * defect, so no parity annotation and no register entry, and not an execution-model mismatch, so no
 * new mismatch number.
 *
 * IT IS ONE OF FOUR SUCH INSTANCES IN THIS FOLDER, named for context: `ProductType.cfc:L65`
 * (`childProductTypes`, `cascade="all"`) and `ProductType.cfc:L66` (`products`, `cascade="all"
 * lazy="extra"`), both likewise sitting against blocking guards, and `Product.cfc:L73` (`skus`,
 * `cascade="all-delete-orphan" inverse="true"`). THIS one is the only instance where an
 * orphan-deleting cascade sits on the INVERSE side of a one-to-many whose owning side is the child's
 * many-to-one [`model/entity/Option.cfc:L59`] — which is precisely why the child, not the group,
 * governs the association in the ported domain classes.
 *
 * =============================================================================================
 * COLLECTION-CEILING SEMANTICS, REPRODUCED EXACTLY
 * =============================================================================================
 * From `validate_maxCollection` [`org/Hibachi/HibachiValidationService.cfc:L309-L315`]:
 *
 *   absent or null        PASSES — an explicit short-circuit, not an oversight
 *   an EMPTY array        PASSES a ceiling of 0, since its length is 0 and 0 <= 0
 *   a non-empty array     FAILS  — the delete is blocked, which is the guard doing its job
 *   a struct              ACCEPTED, and measured by key count rather than length
 *   a non-null SIMPLE value FAILS — neither array nor struct, so no branch admits it
 *
 * The ceiling of 0 is the document's ONLY numeric literal, transcribed rather than chosen.
 *
 * Reported as `validate.delete.OptionGroup.options.maxCollection`.
 */
export const optionsMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/* ==============================================================================================
 * SECTION 5 — THE THREE PROPERTY RULE SETS
 *
 * Declared in the SOURCE DOCUMENT'S KEY ORDER: `optionGroupName`, then `optionGroupCode`, then
 * `options`. Each per-property value is an ARRAY of rule objects, faithful to the document's own
 * shape, even where — as in all three cases here — the array holds exactly ONE rule object.
 *
 * Each is exported separately so the net-new suite `slatwall-ts/test/validation/rules.test.ts` can
 * import and assert one property at a time (AAP 0.7.3 S6). That suite is NOT created by this file: it
 * lives in the sibling test subtree and is registered there.
 * ============================================================================================ */

/**
 * `optionGroupName` — presence on save. See {@link optionGroupNameRequiredConstraint}.
 *
 * [`model/validation/OptionGroup.json:L3`]
 */
export const optionGroupNameValidation = Object.freeze({
  propertyIdentifier: OPTION_GROUP_NAME_PROPERTY,
  read: (subject: OptionGroupValidationSubject): unknown => subject.optionGroupName,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([optionGroupNameRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionGroupValidationSubject>;

/**
 * `optionGroupCode` — the densest property in the document: ONE RULE OBJECT, THREE INDEPENDENT
 * CONSTRAINTS, ONE ERROR KEY.
 *
 * [`model/validation/OptionGroup.json:L4`]
 *
 * =============================================================================================
 * THE THREE-WAY FLATTENING — WHY THIS IS NOT ONE CONSTRAINT WITH THREE FACETS
 * =============================================================================================
 * `getValidationsByContext` [`org/Hibachi/HibachiValidationService.cfc:L77-L88`] explodes each rule
 * object into ONE CONSTRAINT RECORD PER KEY, excluding `contexts` and `conditions` [`:L78`] and
 * copying `conditions` onto every record it produces [`:L83-L85`]. So the single rule object at
 * `model/validation/OptionGroup.json:L4` is not one composite check — it is THREE INDEPENDENT
 * CONSTRAINTS, each evaluated separately, each able to add its OWN message, all under the SAME
 * property identifier `optionGroupCode`.
 *
 * Here that explosion IS THE DATA SHAPE: `../Validator` types a rule's constraints as an array, so
 * the three appear as three entries rather than being derived at evaluation time. That is also what
 * fixes their order — the document's own key order, presence then uniqueness then pattern — where the
 * legacy engine iterated a struct whose key order was unspecified.
 *
 * EVALUATION NEVER SHORT-CIRCUITS. A blank code that is also already taken can legitimately produce
 * TWO OR THREE messages in one pass, all keyed `optionGroupCode`, which is exactly why the error
 * bag's value per key is an ARRAY. No "stop after the first failure" logic is added here or in
 * `../Validator`. The worked interaction table is at {@link optionGroupCodeRequiredConstraint}.
 *
 * The three keys this property can emit, exhaustively — see
 * [`org/Hibachi/HibachiValidationService.cfc:L230`]:
 *   validate.save.OptionGroup.optionGroupCode.required
 *   validate.save.OptionGroup.optionGroupCode.unique
 *   validate.save.OptionGroup.optionGroupCode.regex
 */
export const optionGroupCodeValidation = Object.freeze({
  propertyIdentifier: OPTION_GROUP_CODE_PROPERTY,
  read: (subject: OptionGroupValidationSubject): unknown => subject.optionGroupCode,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([
        optionGroupCodeRequiredConstraint,
        optionGroupCodeUniqueConstraint,
        optionGroupCodeRegexConstraint,
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionGroupValidationSubject>;

/**
 * `options` — the delete guard. See {@link optionsMaxCollectionConstraint}.
 *
 * [`model/validation/OptionGroup.json:L5`]
 *
 * =============================================================================================
 * THIS READ IS SYNCHRONOUS, AND THAT IS A PROPERTY OF THE LEGACY SOURCE RATHER THAN A SHORTCUT
 * =============================================================================================
 * `OptionGroup.getOptions()` [`model/entity/OptionGroup.cfc:L73-L79`] returns `variables.Options`
 * BY REFERENCE when no ordering argument is supplied, and only delegates to a sorting utility when
 * one is. The guard supplies none. So it reads a LIVE IN-MEMORY ARRAY, synchronously, with NO SERVICE
 * ROUND-TRIP and no database access — in deliberate contrast with several rules in
 * `./product.rules`, whose properties are non-persistent members resolved through service-backed
 * getters.
 *
 * That matters for three reasons, all of them consequences rather than conveniences:
 *   1. `../Validator` requires a property reader to be a PLAIN SYNCHRONOUS accessor, since a reader
 *      returning a promise would have the promise measured instead of the array — and a promise is
 *      neither array nor struct, so the ceiling would FAIL every time. The reader below is a plain
 *      field read and cannot fall into that trap.
 *   2. A DEFENSIVE COPY IS FORBIDDEN, and not only here. The ported
 *      `../../domain/option/OptionGroup` states the same contract on its own accessor: the child
 *      entity mutates the parent's array in place through it
 *      [`model/entity/Option.cfc:L95`, `:L102`, `:L104`], so returning a copy or a read-only view
 *      would silently break the bidirectional association. Reading the field directly here is
 *      observationally IDENTICAL to invoking that accessor, because the accessor returns the very
 *      same reference.
 *   3. Nothing is memoised. The array is re-read on every evaluation, so a delete attempted
 *      immediately after the last option is removed sees the emptied array.
 */
export const optionsValidation = Object.freeze({
  propertyIdentifier: OPTIONS_PROPERTY,
  read: (subject: OptionGroupValidationSubject): unknown => subject.options,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([optionsMaxCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionGroupValidationSubject>;

/**
 * The whole of `model/validation/OptionGroup.json`, as one typed value.
 *
 * THREE PROPERTIES, FIVE CONSTRAINTS, TWO CONTEXTS — the complete document, in its own key order,
 * with nothing added and nothing dropped. This is the value the service layer hands to
 * `../Validator`; nothing in this file invokes anything, and the uniqueness port is injected into
 * that evaluator rather than reached from here.
 *
 * NO `conditions` BLOCK. `../Validator` types it optional because exactly one of the seven documents
 * declares one, and that document is `model/validation/Product_UpdateSkus.json`, not this one.
 * Omitting the field is therefore faithful, and per `exactOptionalPropertyTypes` the field is left
 * ABSENT rather than being written as an explicit undefined.
 *
 * =============================================================================================
 * NO MEMOISATION, ANYWHERE — M7
 * =============================================================================================
 * The legacy engine memoised each resolved rule set under a class-and-context key
 * [`org/Hibachi/HibachiValidationService.cfc:L92` writes it, `:L94` reads it back], and would have
 * held TWO entries for this document, one per context. Nothing equivalent exists here, for a reason
 * that is architectural rather than aesthetic: per M7, NOTHING SURVIVES BETWEEN LAMBDA INVOCATIONS
 * EXCEPT MODULE-SCOPE STATE, so any memoisation in the target would have to be REQUEST-SCOPED, never
 * module-scoped, or one invocation's state would bleed into the next on a warm container. For a
 * static rule declaration the simplest compliant choice is NONE AT ALL, and that is the choice taken:
 * this file performs no caching of any kind.
 *
 * WHY THIS ONE PIECE OF MODULE-SCOPE STATE IS NEVERTHELESS SAFE, stated explicitly because the M7
 * rule above would otherwise seem to forbid it: this value is FROZEN, IMMUTABLE, REQUEST-INDEPENDENT
 * DECLARATIVE DATA WITH NO SIDE EFFECT AT MODULE LOAD. It holds no connection, no request context, no
 * resolved property value and no accumulated error. Every nested array and rule object is frozen at
 * its own declaration site, because freezing is shallow. The error bag belongs to the evaluator and
 * is created per evaluation [`org/Hibachi/HibachiValidationService.cfc:L156` and `:L158` are the two
 * legacy branches], so a warm container cannot carry one invocation's failures into the next.
 *
 * ONE FILE COVERS BOTH CONTEXTS, deliberately. The save rules and the delete guard live in the same
 * value because the legacy document put them there and selects between them by context at
 * [`org/Hibachi/HibachiValidationService.cfc:L71`]. Splitting them into a save file and a delete file
 * would be a structural invention with no counterpart in the source.
 */
export const optionGroupValidationRuleSet = Object.freeze({
  properties: Object.freeze([
    optionGroupNameValidation,
    optionGroupCodeValidation,
    optionsValidation,
  ] as const),
} as const) satisfies ValidationRuleSet<OptionGroupValidationSubject>;
