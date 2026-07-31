/**
 * `optionGroup.rules.ts` — the typed `OptionGroup` validation rule set of the extracted Catalog
 * slice.
 *
 * Authority: AAP 0.4.1.5 Validation Layer, verbatim row —
 *   | `slatwall-ts/src/validation/rules/optionGroup.rules.ts` | CREATE |
 *   | `model/validation/OptionGroup.json` | Name and code requirements, option delete guard |
 * Corroborated by the AAP 0.3.1 target tree line `optionGroup.rules.ts <-
 * model/validation/OptionGroup.json`, by the AAP 0.2.1.5 row "`optionGroupName` required,
 * `optionGroupCode` required/unique/regex; delete guard on options", and by the single AAP 0.4.4
 * trailing-wildcard row `slatwall-ts/src/validation/rules/** | CREATE — the seven rule sets`.
 *
 * PROVENANCE, EXACTLY. This file is the transliteration of ONE legacy document:
 * `model/validation/OptionGroup.json`, six lines by `wc -l` (its closing brace carries no trailing
 * newline), md5 `1f68697cfd6ce924640917457b71af47`. Three properties, five constraints, two
 * contexts. It is the SMALLEST of the seven in-scope validation documents, and the whole of it is
 * reproduced structurally below — nothing is summarised away and nothing is added.
 *
 * =============================================================================================
 * WHY THIS FILE EXISTS AT ALL — AN IMPLICIT SCOPE ADDITION, ON EVIDENCE RATHER THAN INSTRUCTION
 * =============================================================================================
 * A reviewer reading the brief will find five catalog entities named — Product, Sku, ProductType,
 * Brand and Option — and `OptionGroup` is NOT one of them. AAP 0.2.1.2 adds it as an IMPLICIT
 * SCOPE ADDITION because omitting it "would leave the option model unusable", on four pieces of
 * evidence:
 *   1. `Option.optionGroup` is the required many-to-one side of the relationship
 *      [`model/entity/Option.cfc:L59`], and its requiredness is declared by
 *      [`model/validation/Option.json`] rather than by the mapping.
 *   2. `ProductService.processProduct_addOptionGroup` resolves an option group through the option
 *      service [`model/service/ProductService.cfc:L115`].
 *   3. `Product.getOptionGroups()` queries the entity directly
 *      [`model/entity/Product.cfc:L251-L261`].
 *   4. The sorted-SKU ordering query reads the option group's sort order
 *      [`model/dao/SkuDAO.cfc:L172-L204`].
 * Its validation document is likewise an implicit addition (AAP 0.2.1.5). So this file is here on
 * evidence, and saying so plainly is cheaper than letting a reviewer wonder.
 *
 * =============================================================================================
 * THIS DOCUMENT IS BEHAVIOR, NOT CONFIGURATION — AND THAT IS THE WHOLE POINT
 * =============================================================================================
 * AAP IR-4: "Declarative validation is part of the observable behavior. Seven catalog validation
 * files define required fields, uniqueness, regular-expression formats, conditional rules and
 * delete guards. Two `Sku` rules are method-based and execute real queries. These are behavior,
 * not configuration, and are ported as typed rule sets." AAP 0.2.1.5 says the same from the other
 * side: these documents "are interpreted at runtime by the validation service and determine which
 * saves and deletes succeed."
 *
 * Treat this document as "just config" and the result is a port that COMPILES CLEANLY, saves
 * option groups the legacy system would have rejected, and rejects option groups the legacy system
 * would have accepted — with no compile error, no exception and no failing test to reveal it. That
 * is the worst available outcome in this subtree. Every locator below is quoted byte-exactly for
 * that reason rather than paraphrased.
 *
 * =============================================================================================
 * WHY THE JSON IS NOT SHIPPED — TR-3, AND THE ABSOLUTE PROHIBITION
 * =============================================================================================
 * AAP transformation rule TR-3: "Replace framework magic with declarations. Every
 * runtime-synthesized method, every string-keyed service lookup and every metadata-driven behavior
 * becomes an explicit, compile-checked declaration."
 *
 * So this file exports TYPED TypeScript VALUES built from the discriminated-union constraint types
 * of `../Validator`. It does not import a JSON document, does not require one, does not parse one
 * and does not rely on `resolveJsonModule` (which `slatwall-ts/tsconfig.json` deliberately does not
 * enable). Nor is `model/validation/OptionGroup.json` — or any other `model/validation/*.json` —
 * copied, moved, symlinked or re-emitted anywhere inside `slatwall-ts/`. TR-6 and AAP 0.4.1.1 hold
 * the CFML tree BYTE-FOR-BYTE UNCHANGED: every target file is CREATE and every legacy file is
 * REFERENCE. The document is TRANSLITERATED, NOT VENDORED.
 *
 * ENUMERATE, NEVER WILDCARD. AAP 0.4.4 makes the enumerated REFERENCE rows a discipline precisely
 * because `model/validation/` holds out-of-scope siblings: a pattern such as
 * `model/validation/Option*.json` would sweep in this document and vice versa, and
 * `model/validation/Product*.json` "would silently pull in out-of-scope material". Exactly one
 * legacy validation document is referenced by this file, by its exact path.
 *
 * THIS FILE COVERS `OptionGroup` ONLY. `Option` has its own document
 * [`model/validation/Option.json`, 7 lines] and its own target file, `./option.rules`. The two
 * entities carry separate rule sets and separate class names in their emitted keys. The
 * near-identical `optionGroupCode` and `optionCode` constraint triples are a genuine parallel in
 * the legacy source, NOT a duplication to be factored into one shared declaration — beyond the
 * single shared pattern constant described below. Nothing here imports `./option.rules`.
 *
 * =============================================================================================
 * THE FIVE EMITTED MESSAGE KEYS, AND DECISION D-1
 * =============================================================================================
 * `validateConstraint` composes the key from context, class name, trailing property-name segment
 * and constraint type at [`org/Hibachi/HibachiValidationService.cfc:L230`] — the branch taken by
 * every constraint that is neither `method` nor `dataType`, which is all five of this document's.
 * The five keys are therefore, exhaustively:
 *
 *   validate.save.OptionGroup.optionGroupName.required
 *   validate.save.OptionGroup.optionGroupCode.required
 *   validate.save.OptionGroup.optionGroupCode.unique
 *   validate.save.OptionGroup.optionGroupCode.regex
 *   validate.delete.OptionGroup.options.maxCollection
 *
 * Per RATIFIED DECISION D-1, `../Validator` composes these keys and DELIBERATELY SKIPS the
 * resource-bundle substitution pass. That pass is a PROVABLE no-op here:
 * `replaceStringTemplate` collects its targets by matching a dollar-brace placeholder pattern
 * [`org/Hibachi/HibachiUtilityService.cfc:L71`], and none of the three key templates can ever emit
 * such a placeholder, so the loop would find zero matches by construction.
 *
 * THESE MESSAGES ARE KEYS, NOT SENTENCES. Nothing here or downstream translates, sentence-cases,
 * normalises, trims, lowercases, pluralises or beautifies one. `OptionGroup` is persistent
 * [`model/entity/OptionGroup.cfc:L49`, `persistent=true`], so the legacy substitution struct would
 * have resolved its class name under the `entity.` prefix rather than the `processObject.` prefix
 * [`org/Hibachi/HibachiValidationService.cfc:L212` selects between them] — recorded because it is a
 * real branch, and unobservable here because D-1 never emits the substitution value it fed.
 * `../util/formatting` is consequently NOT imported: with the substitution skipped it would be dead
 * code, which AAP 0.8.2 guideline 4 forbids.
 *
 * THE KEY IS THE PROPERTY IDENTIFIER, NEVER THE CONSTRAINT TYPE. All three reporting branches
 * [`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`] report against the property
 * identifier with exactly TWO arguments. The three-argument override at
 * [`org/Hibachi/HibachiEntity.cfc:L151`] is an ENTITY concern, never a validation-engine concern.
 * So all three `optionGroupCode` constraints report under the key `optionGroupCode` — never under
 * `required`, `unique` or `regex`. Two or three failures landing under one key is exactly why the
 * error bag's value is an ARRAY.
 *
 * =============================================================================================
 * TWO DOCUMENTED NON-PORTS
 * =============================================================================================
 * Neither is a carried defect, so neither is annotated as one.
 *
 *   1. THE POPULATED-SUB-PROPERTY CASCADE. `getPopulatedPropertyValidationContext`
 *      [`org/Hibachi/HibachiValidationService.cfc:L133-L151`] reads the keys
 *      `populatedPropertyValidation` and `validate`; NEITHER appears in any of the seven in-scope
 *      documents, so the cascade at [`org/Hibachi/HibachiTransient.cfc:L412-L453`] is UNREACHABLE
 *      for this slice and no cascade API belongs anywhere in this folder. Worth stating HERE
 *      specifically, because `OptionGroup` -> `options` -> `Option` is exactly the parent/child
 *      graph over which a reader might expect a cascading validation pass. There is none: deleting
 *      or saving a group never re-validates its options through this rule set.
 *   2. THE CUSTOM-OVERRIDE MERGE. The engine merges per-class overrides from the customisation
 *      tree at [`org/Hibachi/HibachiValidationService.cfc:L6-L53`]. That tree's validation
 *      directory holds nothing but a readme, so ZERO catalog overrides exist. Building a merge
 *      mechanism for an empty input would violate AAP 0.7.3 S9.
 *
 * =============================================================================================
 * A CORRECTION TO A SIBLING SPECIFICATION'S LOCATOR, STATED HERE AND NOT PATCHED THERE
 * =============================================================================================
 * The specification for `../Validator` twice cites the unknown-constraint raise at L212. Read
 * first-hand, it is at [`org/Hibachi/HibachiValidationService.cfc:L202`]; L212 is the
 * `isPersistent()` branch that selects the class-name prefix; and the SEPARATE `dataType`
 * whitelist raise is at [`org/Hibachi/HibachiValidationService.cfc:L263`]. The correction is
 * recorded here rather than by editing the sibling, which stays as its own author left it. This
 * document declares no `dataType` constraint, so only the L202 raise is reachable from it — and
 * only if a constraint type outside the closed union were somehow introduced, which the compiler
 * now prevents outright.
 *
 * =============================================================================================
 * ARCHITECTURAL POSITION (AAP 0.7.3 S2, S3, S4, S5)
 * =============================================================================================
 * S2 IS A NEGATIVE OBLIGATION HERE: THIS FILE ISSUES ZERO SQL. No statement text, no HQL fragment,
 * no driver, no connection. The physical tables behind this document — `SwOptionGroup` and its
 * child `SwOption` — are named in this prose sentence and NOWHERE ELSE; every string literal below
 * is either a validation CONTEXT name or one of the document's own PROPERTY KEYS, which are the
 * error keys the contract requires, not physical column identifiers.
 *
 * S3: no service locator, no dynamic method synthesis, no string-keyed runtime resolution, no
 * container import and no module-scope singleton. The uniqueness port is CONSTRUCTOR-INJECTED into
 * `../Validator`; this file names the constraint and resolves its target, and never calls the port.
 *
 * S4: four imports, all relative, three of them type-only. Deliberately absent: any import from
 * `adapters/`, `services/`, `config/`, `handlers/` or `integrations/`; any database driver; any
 * cloud event, result, context or handler type; any file-system, network or clock access; any
 * logging framework; any read of the process environment (`src/config/env.ts` is the subtree's sole
 * permitted reader); any barrel or index re-export; and any `.json` import. Per AAP 0.4.3.5 all
 * intra-subtree imports are relative paths — "deliberately no path aliases — so `tsc` and `esbuild`
 * resolve identically and no runtime resolver shim is needed" — because an alias that type-checks
 * can still raise a module-resolution failure at cold start.
 *
 * S5: no dependency is added. No schema-validation package appears here or anywhere in the
 * subtree, and `slatwall-ts/package.json` is not edited.
 *
 * =============================================================================================
 * EVALUATION ORDER IS FIXED HERE, DELIBERATELY, AND IT IS AN IMPROVEMENT NOT A CHANGE
 * =============================================================================================
 * The legacy engine iterated a CFML struct [`org/Hibachi/HibachiValidationService.cfc:L63`], whose
 * key order is UNSPECIFIED. The declaration order below is therefore a deterministic choice with no
 * behavioural counterpart in the legacy engine: properties in the source document's key order —
 * `optionGroupName`, then `optionGroupCode`, then `options` — and within `optionGroupCode` the
 * source key order `required`, then `unique`, then `regex`. It is safe precisely BECAUSE errors
 * ACCUMULATE and evaluation NEVER SHORT-CIRCUITS at any level, so no legacy outcome could ever have
 * depended on the order the engine never guaranteed. What determinism buys is a reproducible
 * message array, which is what lets the net-new suite assert on one at all (AAP 0.7.3 S6).
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

/* ==============================================================================================
 * SECTION 1 — THE SUBJECT CONTRACT
 * ============================================================================================ */

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
     * [`model/validation/OptionGroup.json:3`].
     *
     * Note the mapping declares NO `required` and NO `length`, which is why that one rule is the
     * only enforcement of this property anywhere in the system. See
     * {@link optionGroupNameRequiredConstraint}.
     */
    readonly optionGroupName?: string;

    /**
     * `property name="optionGroupCode" ormtype="string";`
     * [`model/entity/OptionGroup.cfc:L54`] — read by ALL THREE constraints of
     * [`model/validation/OptionGroup.json:4`].
     *
     * The mapping declares NO `unique="true"` and NO `length`. See
     * {@link optionGroupCodeUniqueConstraint} for the consequence, which is the most significant
     * finding in this file.
     */
    readonly optionGroupCode?: string;

    /**
     * The one-to-many option collection [`model/entity/OptionGroup.cfc:L70`] — read by the delete
     * guard at [`model/validation/OptionGroup.json:5`].
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
 * The save context, as [`model/validation/OptionGroup.json:3`] and [`:4`] spell it.
 *
 * A plain string, never a closed literal union: `../Validator` types the context as an open `string`
 * (requirement N2) because the editability and processability checks at
 * [`org/Hibachi/HibachiEntity.cfc:L215`] and [`:L225`] pass context strings that appear in no
 * in-scope document at all, and a closed union would make them unrepresentable.
 */
const SAVE_CONTEXT = 'save';

/** The delete context, as [`model/validation/OptionGroup.json:5`] spells it. See P-2 above. */
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
 * The error key for the name rule. [`model/validation/OptionGroup.json:3`]
 *
 * Compile-checked as a real declared property of the entity [`model/entity/OptionGroup.cfc:L53`].
 */
const OPTION_GROUP_NAME_PROPERTY = 'optionGroupName' satisfies OptionGroupPropertyName;

/**
 * The error key shared by all three code constraints. [`model/validation/OptionGroup.json:4`]
 *
 * Compile-checked as a real declared property of the entity [`model/entity/OptionGroup.cfc:L54`].
 */
const OPTION_GROUP_CODE_PROPERTY = 'optionGroupCode' satisfies OptionGroupPropertyName;

/**
 * The error key for the delete guard. [`model/validation/OptionGroup.json:5`]
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
 * the collection ceiling of 0 at [`model/validation/OptionGroup.json:5`], transcribed below.
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
 * [`model/validation/OptionGroup.json:3`] `"optionGroupName": [{"contexts":"save","required":true}]`
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
 * [`model/validation/OptionGroup.json:4`]
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
 * `optionGroupCode` must be UNIQUE on save — the SECOND of three constraints on the same rule
 * object, and the most consequential declaration in this file.
 *
 * [`model/validation/OptionGroup.json:4`]
 *
 * =============================================================================================
 * THIS UNIQUENESS IS APPLICATION-ONLY. THERE IS NO DATABASE CONSTRAINT BEHIND IT.
 * =============================================================================================
 * The mapping, byte-exact [`model/entity/OptionGroup.cfc:L54`]:
 *
 *     property name="optionGroupCode" ormtype="string";
 *
 * NO `unique="true"`. NO `length`. A repository-wide search for `unique="true"` across
 * `model/entity/` returns exactly EIGHT hits — `Currency.cfc:52`, `Product.cfc:54` (`urlTitle`),
 * `Product.cfc:56` (`productCode`), `ProductType.cfc:56`, `MeasurementUnit.cfc:58`,
 * `Integration.cfc:53`, `Brand.cfc:55` and `Sku.cfc:54` — and `OptionGroup.optionGroupCode` IS NOT
 * AMONG THEM. Verified first-hand, not inferred.
 *
 * So for this property THIS RULE IS THE ONLY UNIQUENESS ENFORCEMENT IN THE ENTIRE SYSTEM. Drop it,
 * or lean on a column constraint that does not exist, and duplicate option-group codes simply save.
 * The same is true of `Option.optionCode` [`model/entity/Option.cfc:L53`], so the option model as a
 * whole depends entirely on application-side checking for code uniqueness. That makes AAP IR-5
 * binding here in its strongest form: "Application-side uniqueness checking is required in addition
 * to database constraints. `HibachiDAO.isUniqueProperty()` [org/Hibachi/HibachiDAO.cfc:L130-L146]
 * enforces uniqueness with an HQL existence query during validation, independently of the
 * `unique=\"true\"` column metadata."
 *
 * =============================================================================================
 * X8 — THERE ARE SEVEN `unique` CONSTRAINTS ACROSS THE SEVEN DOCUMENTS. NOT SIX, AND NOT FIVE.
 * =============================================================================================
 * A direct search for the `unique` key over exactly the seven in-scope documents returns seven
 * hits, and these locators were re-verified first-hand for this file:
 *
 *   model/validation/Product.json:10       productCode      (also carries the pattern rule)
 *   model/validation/Product.json:16       urlTitle
 *   model/validation/Sku.json:11           skuCode
 *   model/validation/Brand.json:5          urlTitle
 *   model/validation/Option.json:3         optionCode       (also carries the pattern rule)
 *   model/validation/OptionGroup.json:4    optionGroupCode  <-- THIS CONSTRAINT
 *   model/validation/ProductType.json:4    urlTitle
 *
 * `model/validation/Product_UpdateSkus.json` contributes ZERO.
 *
 * TWO UPSTREAM DOCUMENTS UNDERCOUNT THIS, and the correction is stated here rather than by editing
 * either of them:
 *   - Prose upstream of this folder names FIVE columns.
 *   - The specification for `../../ports/UniquePropertyPort` claims SIX and asserts that
 *     `model/validation/Product.json` declares `urlTitle` as required but NOT unique. THAT CLAIM IS
 *     FALSE — see `model/validation/Product.json:16` above — and that specification is internally
 *     self-contradictory, since its own table lists `Product.urlTitle` among its six. The root cause
 *     is that its mandated reads span only five validation documents and omit
 *     `model/validation/ProductType.json` entirely, which is why the seventh is invisible to it.
 *     `../Validator` independently carries the same seven-locator correction, so no cross-folder
 *     disagreement remains — only the one stale port document, which is left exactly as its author
 *     wrote it.
 *
 * RECONCILING THE COUNTS, so they stop appearing to fight. IR-5's "five of the eight unique columns
 * declared in the whole system belong to this slice" counts entity `unique="true"` COLUMN METADATA —
 * a DIFFERENT, INDEPENDENT mechanism, as IR-5 itself says. Eight exist system-wide and five of them
 * (`Product.cfc:54`, `Product.cfc:56`, `ProductType.cfc:56`, `Brand.cfc:55`, `Sku.cfc:54`) are
 * in-slice, which matches exactly. The VALIDATION-DOCUMENT count is SEVEN. Both statements are true;
 * they measure different things. Stated so the next reader does not "fix" one number into the other.
 *
 * =============================================================================================
 * THE EVALUATION CONTRACT — RATIFIED DECISION D-2
 * =============================================================================================
 * PIN THE POLARITY: `true` MEANS UNIQUE, AND THEREFORE SAFE TO SAVE. `false` means the value is
 * already taken and the save must be rejected. Read first-hand rather than inferred: the existence
 * query returns FALSE when it finds matching rows [`org/Hibachi/HibachiDAO.cfc:L142-L144`] and TRUE
 * when it finds none [`:L146`]; `validate_unique`
 * [`org/Hibachi/HibachiValidationService.cfc:L467-L470`] then returns that result UNMODIFIED as its
 * own pass-or-fail verdict. INVERTING THIS IS SILENT — every uniqueness rule in the slice would pass
 * when it should fail, with no compile error and no lint finding — so the accompanying test must
 * exercise the COLLIDING case, because a test covering only the non-colliding path passes under
 * either polarity.
 *
 * EVALUATION GOES EXCLUSIVELY THROUGH THE INJECTED PORT. This file NAMES the constraint and RESOLVES
 * its target. It never invokes the port, never issues a query, never reaches an adapter and contains
 * no statement text of any kind. The port is constructor-injected into `../Validator` (AAP 0.7.3
 * S3), and here that is not a stylistic nicety — it is what stops this declaration from needing a
 * database at all, which is what makes it unit-testable against a hand-written double.
 *
 * THE TARGET RESOLVER IS THE IDENTITY FUNCTION, deliberately. The legacy engine resolves the entity
 * to check by walking the property identifier to its last object
 * [`org/Hibachi/HibachiValidationService.cfc:L468`]; `optionGroupCode` is a SINGLE SEGMENT
 * containing neither a dot nor an underscore, so that walk terminates immediately at the subject
 * itself. The indirection is retained because the legacy has it and because a dotted identifier
 * would resolve elsewhere, but no lookup is invented. `../Validator` reaches the same conclusion for
 * all seven uniqueness rules of the slice.
 *
 * SELF-EXCLUSION IS A NO-OP ON INSERT. The legacy existence query excludes the row being validated
 * by comparing primary identifiers [`org/Hibachi/HibachiDAO.cfc:L136-L140`]. A NEW option group has
 * not been assigned an identifier yet — the mapping declares `unsavedvalue=""` and `default=""`
 * [`model/entity/OptionGroup.cfc:L52`] — so on insert that term excludes nothing and the check
 * degenerates to a plain existence test. On UPDATE the same term is live and does real work: it is
 * what stops a row colliding with ITSELF and reporting its own unchanged code as already taken.
 * Recorded because it LOOKS like protection against self-collision and is not, on the path that
 * matters most.
 *
 * AN ABSENT VALUE ALWAYS PASSES UNIQUENESS, INDIRECTLY. `validate_unique`
 * [`org/Hibachi/HibachiValidationService.cfc:L467-L470`] has NO null guard — unlike its sibling
 * `validate_uniqueOrNull` [`:L472-L479`], which does, and which none of the seven documents uses. So
 * with an absent value the existence query matches nothing and the port must answer `true`. The port
 * must NOT raise, must NOT rewrite the comparison into a null test, and must NOT answer `false`. The
 * presence constraint declared alongside on the same rule object is what actually rejects an absent
 * code, and it does that job independently.
 *
 * The legacy evaluator resolves the property name it hands the port as the trailing segment of the
 * identifier [`org/Hibachi/HibachiValidationService.cfc:L208`] — used ONLY to compose the message,
 * NEVER as the error key. As with presence, its declared constraint value is never read
 * [`:L467`], so the check always runs; all seven in-scope uniqueness rules declare true.
 *
 * Reported as `validate.save.OptionGroup.optionGroupCode.unique`.
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
 * [`model/validation/OptionGroup.json:4`], whose fourth key is the pattern. The pattern TEXT is
 * deliberately NOT reproduced in this comment either: it is transcribed character for character,
 * once, at {@link CODE_FORMAT_REGEX} in `./product.rules`, together with the character-class
 * analysis and the empirical accept and reject sets. A second copy in prose would be a second thing
 * that can drift, which is the very failure the single-owner decision below exists to prevent.
 *
 * =============================================================================================
 * THE PATTERN IS IMPORTED, NOT REDECLARED — AND THAT IS A SINGLE-SOURCE-OF-TRUTH DECISION
 * =============================================================================================
 * The literal occurs in exactly THREE of the seven in-scope documents and nowhere else in them:
 * `Product.productCode` [`model/validation/Product.json:10`], `Option.optionCode`
 * [`model/validation/Option.json:3`] and `OptionGroup.optionGroupCode`
 * [`model/validation/OptionGroup.json:4`]. Its authoritative home is `./product.rules`, which owns
 * it by document order — `model/validation/Product.json:10` is the first occurrence — and which
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
 * NO FLAGS, EVER. `./product.rules` records the empirical result: no flags compiles and is what
 * `../Validator` does; the unicode flag compiles but is pointless on a pure-ASCII class; and THE
 * UNICODE-SETS FLAG RAISES A SYNTAX ERROR AT PATTERN CONSTRUCTION on this character class, which
 * under Lambda is a COLD-START CRASH rather than a failed validation. Case-insensitive, global,
 * multiline and dot-all are equally unwelcome: the class already spells both letter cases out, and
 * the pattern anchors both ends itself.
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
 * [`model/validation/OptionGroup.json:5`] `"options": [{"contexts":"delete","maxCollection":0}]`
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
 * group. The rule at [`model/validation/OptionGroup.json:5`] BLOCKS THE DELETE ENTIRELY whenever any
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
 * [`model/validation/OptionGroup.json:3`]
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
 * [`model/validation/OptionGroup.json:4`]
 *
 * =============================================================================================
 * THE THREE-WAY FLATTENING — WHY THIS IS NOT ONE CONSTRAINT WITH THREE FACETS
 * =============================================================================================
 * `getValidationsByContext` [`org/Hibachi/HibachiValidationService.cfc:L77-L88`] explodes each rule
 * object into ONE CONSTRAINT RECORD PER KEY, excluding `contexts` and `conditions` [`:L78`] and
 * copying `conditions` onto every record it produces [`:L83-L85`]. So the single rule object at
 * `model/validation/OptionGroup.json:4` is not one composite check — it is THREE INDEPENDENT
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
 * [`model/validation/OptionGroup.json:5`]
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

/* ==============================================================================================
 * SECTION 6 — THE DOCUMENT
 * ============================================================================================ */

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
