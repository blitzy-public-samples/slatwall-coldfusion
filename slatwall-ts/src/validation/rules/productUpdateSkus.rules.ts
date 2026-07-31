/**
 * `productUpdateSkus.rules.ts` — the typed transliteration of
 * `model/validation/Product_UpdateSkus.json`.
 *
 * PROVENANCE. Source document: `model/validation/Product_UpdateSkus.json`, 13 lines, md5
 * `5265d737f9ff77eac47650f6e0384042` — re-measured against the working tree rather than recalled, and
 * matching byte for byte. That document, like every legacy file cited anywhere below, is
 * REFERENCE-ONLY and is never modified: the CFML tree stays byte-for-byte untouched (AAP §0.4.1.1,
 * TR-6). It is TRANSLITERATED, NOT VENDORED (TR-3) — nothing here imports, requires, copies,
 * symlinks or re-emits a `.json` file, and `resolveJsonModule` stays off.
 *
 * AAP §0.4.1.5 makes this file CREATE against that document: "The two conditional rule groups keyed on
 * the update flags". AAP §0.2.1.5 adds the detail — "Conditional rules — `price` required only when
 * `updatePriceFlag eq 1`, `listPrice` only when `updateListPriceFlag eq 1`".
 *
 * THIS FILE, AND ITS SOURCE DOCUMENT, ARE AN IMPLICIT SCOPE ADDITION (AAP §0.2.1.5). The brief names
 * no validation document at all. All seven enter scope on evidence: they are behaviour rather than
 * configuration, interpreted at run time by the validation service, and they decide which saves and
 * deletes succeed (IR-4). The seven total 75 lines; this one is 13 of them.
 *
 * It is the SEVENTH AND LAST rule file in this folder — and the only structurally unlike the other
 * six. They select rules by CONTEXT; this one selects by CONDITION. See the two blocks below.
 *
 * ==============================================================================================
 * ⭐ THE STRUCTURAL HEART — CONDITION SELECTION AND CONTEXT SELECTION ARE ORTHOGONAL
 * ==============================================================================================
 * Both gates select rules, so a reader may take them for two spellings of one idea. They are not,
 * and collapsing either into the other changes which rules run.
 *
 *   - A CONTEXT LIST answers "which operation is happening?" — save, delete, updateSkus. The legacy
 *     engine matches it with a case-insensitive comma-delimited list search at
 *     `org/Hibachi/HibachiValidationService.cfc:L71`.
 *   - A CONDITION LIST answers "does the subject's own current data satisfy a named predicate?" —
 *     evaluated at `org/Hibachi/HibachiValidationService.cfc:L97-L131` against the subject's property
 *     values, through the very same `validate_*` family the rules themselves use (`:L117`).
 *
 * The selection semantics `../Validator` implements, and which this file must not reimplement:
 *   - a rule's condition list is a comma-delimited LIST of condition names;
 *   - OR ACROSS conditions — any one satisfied condition is enough (`:L124-L126`);
 *   - AND WITHIN a single condition — every predicate inside it must hold (`:L110-L121`), and
 *     evaluation does NOT short-circuit: `:L118` records the failure and keeps looping;
 *   - a name the document does not declare is SKIPPED (`:L108`), and if it was the only name listed
 *     the gate evaluates false (`:L130`).
 *
 * THIS FILE SUPPLIES DATA. `../Validator` SUPPLIES THE ENGINE. Nothing below evaluates anything.
 *
 * ==============================================================================================
 * ⭐ TWO CONTRASTING FAILURE MODES FOR THE SAME MISTAKE — BOTH DELIBERATE
 * ==============================================================================================
 * An unrecognised constraint kind is treated differently depending on where it is found:
 *   - INSIDE A CONDITION it is SILENTLY IGNORED. `org/Hibachi/HibachiValidationService.cfc:L117`
 *     tests for the evaluator's existence FIRST, so the conjunction short-circuits before anything
 *     runs and the all-met flag is never cleared.
 *   - IN THE MAIN RULE PATH it RAISES, at `org/Hibachi/HibachiValidationService.cfc:L202`.
 *
 * ⚠️ STALE-LOCATOR CORRECTION, recorded here because C1.0 forbids editing another module: the
 * `../Validator` specification cites that raise at `L212`. It is at **L202**. `L212-L218` is the
 * persistence branch that chooses between the two class-name prefixes — which, fittingly, is the
 * very branch that gives THIS document its process-object prefix (see the rbKey block below). The
 * separate whitelist raise for an off-list type value is at **L263**. `../Validator`'s implementation
 * cites `:L201-L203` and `:L263` correctly; only its prose carries the stale number.
 *
 * ==============================================================================================
 * ⭐⭐ NO CONTEXT LIST IS DECLARED, AND THAT IS DECISIVE — NOT AN OVERSIGHT
 * ==============================================================================================
 * Neither rule of the source document declares a context list. The legacy gate reads
 *
 *     if(!structKeyExists(rule,"contexts") || listFindNoCase(rule.contexts, arguments.context))
 *
 * at `org/Hibachi/HibachiValidationService.cfc:L71`, so A RULE WITH NO CONTEXT LIST APPLIES IN EVERY
 * CONTEXT. `../Validator` reproduces exactly that at its own context gate, and its documentation of
 * the omitted-field case names this document as the reason the branch exists.
 *
 * Nine contexts are reachable in this slice. Five are declared somewhere in the seven documents —
 * save, delete, addOptionGroup, addOption, addSubscriptionTerm — and FOUR ARE RUNTIME-ONLY, appearing
 * in no document at all:
 *   - the empty default (`org/Hibachi/HibachiValidationService.cfc:L153`, reached through
 *     `org/Hibachi/HibachiTransient.cfc:L408`);
 *   - `edit` (`org/Hibachi/HibachiEntity.cfc:L215`);
 *   - `process` (`org/Hibachi/HibachiEntity.cfc:L224`);
 *   - `updateSkus` (`org/Hibachi/HibachiService.cfc:L114`).
 * Under any of those four, ONLY rules lacking a context list fire — and across all seven documents
 * that means only the two declared here. Every one of the other six files contributes nothing under a
 * runtime-only context. That is the whole reason `../Validator` types its context argument to admit
 * the runtime-only values as well as the declared ones, and the reason a rule's own context list
 * stays an open comma-delimited string rather than a narrowed union.
 *
 * ⛔ DO NOT ADD A CONTEXT LIST "FOR CLARITY". Pinning these rules to `updateSkus` would NARROW them
 * and stop them firing in six of the nine contexts. The omission is transcribed, not inherited by
 * accident.
 *
 * ==============================================================================================
 * ⭐ P-2 — THE TWO-PASS PROCESS FLOW, INVISIBLE FROM THE DOCUMENT ITSELF
 * ==============================================================================================
 * `org/Hibachi/HibachiService.cfc` validates TWICE on a process call:
 *   `:L96`  validates THE ENTITY under the process context;
 *   `:L99`  gates on the entity being free of errors AND having a process object for that context;
 *   `:L108` validates THE PROCESS OBJECT under THE SAME context string.
 *
 * So under `updateSkus`:
 *   - the ENTITY pass validates `Product` with context `updateSkus`, and every rule in
 *     `model/validation/Product.json` declares a context list (save, delete, addOptionGroup,
 *     addOption, addSubscriptionTerm), so ZERO RULES FIRE;
 *   - the PROCESS-OBJECT pass validates `Product_UpdateSkus` with the same string, and because
 *     neither rule here declares a context list BOTH FIRE, gated solely by their conditions.
 *
 * Three different mechanisms produce a context string, which is worth noticing because it explains
 * why the value cannot be derived from the documents alone: `delete` is HARD-CODED at
 * `org/Hibachi/HibachiService.cfc:L55`, `save` is a DEFAULTED PARAMETER at `:L133`, and a process
 * context is INTERPOLATED at `:L114`.
 *
 * ==============================================================================================
 * ⭐⭐⭐ THE ABSENCE CHAIN — THE MOST IMPORTANT BEHAVIOURAL FINDING IN THIS FILE
 * ==============================================================================================
 * Trace it, because the conclusion is stronger than it first looks:
 *   1. `updatePriceFlag` is ABSENT — not supplied at all.
 *   2. Loose equality FAILS on an absent value (`org/Hibachi/HibachiValidationService.cfc:L385-L395`,
 *      whose null guard sits at `:L387-L390`).
 *   3. So the price condition is UNMET.
 *   4. EVERY constraint on `price` carries that condition, because the legacy flattening copies a
 *      rule's condition list onto each of its flattened constraint records (`:L83-L85`).
 *   5. Therefore NEITHER the presence constraint NOR the numeric constraint fires.
 *
 * ⇒ AN ABSENT `updatePriceFlag` MEANS `price` IS NOT MERELY UN-REQUIRED — IT IS ENTIRELY
 *   UNVALIDATED. A non-numeric garbage value in `price` passes validation completely when the flag is
 *   absent. The chain applies symmetrically to `updateListPriceFlag` and `listPrice`.
 *
 * Seen from the reporting side: an unmet condition produces NO ERROR AT ALL — it produces SILENCE.
 * The condition names never appear in the error bag; only property identifiers do.
 *
 * ⛔ FORBIDDEN REPAIRS (AAP §0.8.2 guideline 4, S7). Do not add an unconditional numeric constraint
 * to either price "as a safety net". Do not add any rule to either flag — they carry none in the
 * source and are ONLY condition predicates, so a rule on one is fabrication (S9). Do not default an
 * absent flag to anything. Absence must stay OBSERVABLE, which is precisely why the sibling
 * `../../domain/process/ProductUpdateSkus` models the process object as an INTERFACE WITH
 * ALL-OPTIONAL FIELDS rather than a class: under ES2022 class-field semantics a class would emit
 * undefined-valued own properties and destroy the absent-versus-present distinction this chain
 * depends on.
 *
 * ==============================================================================================
 * ⭐ THE ASYMMETRY WITH THE TWO ABSENT PROCESS DOCUMENTS — REPRODUCE IT, DO NOT HARMONISE IT
 * ==============================================================================================
 * AAP §0.2.1.5 flags a subtlety that must not be mistaken for an omission: THERE IS NO
 * `Product_AddOption.json` AND NO `Product_AddOptionGroup.json`. Verified first-hand rather than
 * assumed — `model/validation/` holds exactly 96 flat `.json` files, and an explicit `ls` of those
 * two paths reports "No such file or directory" for BOTH.
 *
 * The three catalog process objects therefore split two ways, and this file is the odd one out:
 *
 *   | process object            | own document? | where its rules live                              |
 *   |---------------------------|---------------|---------------------------------------------------|
 *   | `Product_AddOptionGroup`  | NO            | context-scoped rules inside `Product.json` — the  |
 *   |                           |               | `:L4` option-list gate (an `inList` constraint on |
 *   |                           |               | `baseProductType`) and the `:L14` collection floor |
 *   |                           |               | (a `minCollection` on unused option GROUPS)       |
 *   | `Product_AddOption`       | NO            | context-scoped rules inside `Product.json` — the  |
 *   |                           |               | same `:L4` `inList` gate, plus the `:L13`         |
 *   |                           |               | `minCollection` on unused OPTIONS                 |
 *   | `Product_UpdateSkus`      | YES           | THIS DOCUMENT                                     |
 *
 * The constraint kinds are named so the cross-reference is greppable: `inList` and `minCollection`
 * are declared in `./product.rules`, NOT here, and this document declares neither.
 *
 * ⛔ SEVEN RULE FILES, NOT NINE. Do not create `productAddOption.rules.ts` or
 * `productAddOptionGroup.rules.ts` — this file is precisely why they are tempting, since a reader who
 * finds one process rule set naturally expects three. Do not move these two rules into
 * `./product.rules` "for consistency", and do not move that document's two process contexts here.
 *
 * ⭐ ALSO OUT OF SCOPE, AND STRUCTURALLY SIMILAR ENOUGH TO BE DOUBLY TEMPTING:
 * `model/validation/Product_AddSubscriptionTerm.json` was read in full — eight lines, three price
 * rules, NO context list anywhere and no conditions block either. It looks like this document and is
 * nonetheless excluded by AAP §0.2.2.4, together with `Product_UploadDefaultImage.json`,
 * `ProductImage.json`, `ProductReview.json` and `SkuCurrency.json`. It gets no rule file; its
 * `addSubscriptionTerm` gate lives in `Product.json` and belongs to `./product.rules`. This is the
 * sharpest instance in the folder of AAP §0.4.4's enumerate-never-wildcard discipline: this file is
 * itself a `Product_*` document sitting beside two excluded `Product_*` siblings, so the seven
 * in-scope documents are referenced by exact name only and never by pattern.
 *
 * ==============================================================================================
 * TWO DOCUMENTED NON-PORTS, AND ONE STRUCTURAL CONSEQUENCE
 * ==============================================================================================
 * Neither is a deferral and neither warrants a parity annotation; both are mechanisms that cannot be
 * reached from these seven documents.
 *
 * 1. THE POPULATED-SUB-PROPERTY CASCADE IS NOT PORTED, AND THERE IS NO CASCADE API.
 *    `org/Hibachi/HibachiTransient.cfc:L412-L453` walks the sub-properties a populate call touched and
 *    validates each under a context chosen by `org/Hibachi/HibachiValidationService.cfc:L133-L151`.
 *    That chooser is gated at `:L137` on a `populatedPropertyValidation` block, and NONE of the seven
 *    in-scope documents declares one — it appears in eight documents elsewhere in the corpus and in
 *    none of these — so the mechanism is unreachable from here.
 *    ⭐ THE FILE-SPECIFIC SHARPENING: this process object holds an INJECTED `product` ENTITY, which is
 *    exactly the shape over which a reader would expect a cascade into `Product.json`'s rules. THERE
 *    IS NONE. The product is validated by the separate entity pass at
 *    `org/Hibachi/HibachiService.cfc:L96`, never by a cascade from here.
 * 2. THE CUSTOM-OVERRIDE MERGE IS NOT PORTED. `org/Hibachi/HibachiValidationService.cfc:L6-L53` reads
 *    a parallel override document and appends its rules. `custom/model/validation/` contains only
 *    `readme.md`, 388 bytes, so ZERO overrides exist; `custom/**` is out of scope in any case.
 *
 * ⭐ THIS FILE'S RULES REFERENCE NO PERSISTENT COLUMN — uniquely among the seven. The subject is a
 * TRANSIENT process object (`model/process/Product_UpdateSkus.cfc:L49` declares no persistence, no
 * entity name and no table), so not one of its properties is a database column. There is therefore no
 * ORM metadata anywhere to cross-check these declarations against, and NO SCHEMA-LEVEL BACKSTOP OF
 * ANY KIND: no unique index, no column length, no not-null attribute, no cascade. THE DECLARATIONS
 * BELOW ARE THE COMPLETE AND SOLE ENFORCEMENT MECHANISM — the strongest form of that pattern anywhere
 * in the folder. Two corollaries: there is no inert delete guard here, because there is no delete
 * guard at all; and this document contributes ZERO of the folder's uniqueness constraints (see the
 * census block at the foot of the file).
 *
 * ==============================================================================================
 * DETERMINISM, AND WHY NOTHING IS CACHED
 * ==============================================================================================
 * Declaration order below is SOURCE ORDER throughout: the conditions in the order the document
 * declares them, then the properties in the order the document declares them, and within each
 * property its constraints in the document's own key order. `../Validator` evaluates in exactly that
 * order, which makes an accumulated error array reproducible and therefore assertable. This is A
 * DELIBERATE DETERMINISM CHOICE WITH NO BEHAVIOURAL COUNTERPART IN THE LEGACY ENGINE, whose CFML
 * struct-key iteration order is unspecified — no legacy behaviour could depend on an order the engine
 * never guaranteed, so fixing it changes nothing observable.
 *
 * NOTHING IS MEMOISED ANYWHERE IN THIS FILE. M7 requires request-scoped rather than module-scoped
 * caching, so that a warm container cannot bleed one invocation's state into the next; caching
 * nothing at all is the simplest way to comply, and it is what this file does. Every value below is
 * FROZEN, IMMUTABLE, REQUEST-INDEPENDENT DECLARATIVE DATA WITH NO SIDE EFFECT AT MODULE LOAD. It
 * holds no connection, no request context, no resolved property value and no accumulated error, and
 * every nested array and object is frozen at its own declaration site because freezing is shallow.
 * Both imports are type-only, so this module has NO RUNTIME IMPORT EDGE AT ALL.
 *
 * @see model/validation/Product_UpdateSkus.json — the transliterated source document
 * @see model/process/Product_UpdateSkus.cfc — the process object whose properties these rules name
 * @see `../Validator` — the evaluation semantics every declaration below relies on
 */

/* ==============================================================================================
 * IMPORTS — TWO MODULES, BOTH TYPE-ONLY, RELATIVE PATHS ONLY
 *
 * AAP §0.4.3.5 fixes the path style: "All intra-subtree imports are relative paths — deliberately no
 * path aliases — so `tsc` and `esbuild` resolve identically and no runtime resolver shim is needed."
 * `slatwall-ts/tsconfig.json` declares neither `paths` nor `baseUrl`, and an alias that type-checks
 * can still fail to resolve at a Lambda cold start. There is no barrel and no index module.
 *
 * WHAT IS DELIBERATELY NOT IMPORTED, and why each absence is load-bearing rather than incidental:
 *   - `../../ports/UniquePropertyPort` — this document declares NO uniqueness constraint, so the port
 *     would be dead weight. It is the only one of the seven with none, alongside the next line.
 *   - `./product.rules` — the folder's one sanctioned intra-folder import is the shared code pattern,
 *     which `./option.rules` and `./optionGroup.rules` take from `./product.rules`. This document
 *     declares NO pattern constraint, so it does not participate.
 *   - `../../domain/product/Product` — the injected product property carries NO RULE WHATSOEVER (see
 *     the block on what this document does not declare), so there is nothing here to type with it.
 *     Selecting only the four non-product members below is what keeps that type out of this module's
 *     surface entirely.
 *   - `../util/formatting` — dead under DECISION D-1 below, and guideline 4 forbids adding it.
 *   - anything from `adapters/`, `services/`, `config/`, `handlers/`, `integrations/` or `admin/`; the
 *     database driver; any AWS type or identifier; the process environment, whose sole permitted
 *     reader in this subtree is `src/config/env.ts`; the file system; any network client; any logging
 *     framework; and any third-party validation library (S4, S5).
 *
 * THE IMPORT EDGE RUNS ONE WAY ONLY. This module imports FROM `../Validator`; `../Validator` never
 * imports a rule set, it RECEIVES one as an argument. That is what breaks the cycle, and it must never
 * be inverted.
 * ============================================================================================== */

import type {
  ProductUpdateSkus,
  ProductUpdateSkusPropertyName,
} from '../../domain/process/ProductUpdateSkus';
import type {
  EqualityConstraint,
  NumericDataTypeConstraint,
  PropertyValidation,
  RequiredConstraint,
  ValidationCondition,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/* ==============================================================================================
 * SECTION 1 — WHAT THIS RULE SET REQUIRES OF THE OBJECT BEING VALIDATED
 * ============================================================================================== */

/**
 * The subject shape these rules read: the engine's own two accessors, plus the FOUR data properties
 * this document names — and nothing else.
 *
 * THE FOUR MEMBER TYPES ARE TAKEN FROM THE SIBLING RATHER THAN RESTATED, so they cannot drift from
 * `../../domain/process/ProductUpdateSkus` silently. That matters more here than it would elsewhere,
 * because the exact width of the flag type is load-bearing: both flags and both prices are typed
 * `string | number` on the sibling precisely so that `1`, `"1"`, `true` and `"yes"` all survive to the
 * comparison, and NARROWING ANY OF THEM TO MAKE A PREDICATE TYPE-CHECK WOULD BREAK THE PORT. See the
 * loose-equality block on the flag predicates below.
 *
 * `product` IS DELIBERATELY EXCLUDED. It carries no rule — see the block on what this document does
 * not declare — so selecting it would serve no purpose, and excluding it keeps
 * `../../domain/product/Product` out of this module's type surface altogether, which the import block
 * above requires.
 *
 * THE SELECTION IS READ-ONLY, and that is a statement about this file rather than about the sibling:
 * nothing here writes, defaults, coerces, normalises or deletes a property value. A mutable process
 * object remains assignable to it, so the sibling's deliberate mutability — which the legacy
 * delete-the-key idiom depends on — is entirely unaffected.
 *
 * The two engine accessors come from `ValidationSubject`, whose second one is consequential:
 * `org/Hibachi/HibachiValidationService.cfc:L171` SILENTLY SKIPS a rule whose property the subject
 * does not carry — not failing it, not raising. ⭐ BOTH `price` AND `listPrice` DO EXIST on the
 * process object (`model/process/Product_UpdateSkus.cfc:L56` and `:L58`), so BOTH RULES BELOW ARE
 * LIVE. This file has none of the inertness that affects the delete guards naming a property no
 * entity declares elsewhere in the folder.
 */
export type ProductUpdateSkusValidationSubject = ValidationSubject &
  Readonly<
    Pick<ProductUpdateSkus, 'updatePriceFlag' | 'price' | 'updateListPriceFlag' | 'listPrice'>
  >;

/* ==============================================================================================
 * SECTION 2 — THE TWO RESOURCE-BUNDLE KEYS THE PROCESS OBJECT PINS
 *
 * ⭐⭐ THIS MODULE IS THEIR DESIGNATED OWNER, AND THE OWNERSHIP SPLIT IS EXPLICIT ON BOTH SIDES.
 * `model/process/Product_UpdateSkus.cfc` declares an explicit key override on each of its two price
 * properties and on neither of its flags. The sibling `../../domain/process/ProductUpdateSkus` carries
 * both as DOC-COMMENT ANNOTATIONS ONLY and states in its own source that they are deliberately not
 * exported from there because "the exported form belongs to
 * `src/validation/rules/productUpdateSkus.rules.ts`". Verified: a case-insensitive search of all six
 * peer rule sets finds no key constant of any kind, so nothing else claims them. They are exported
 * here, once, so the net-new suite can assert a single source of truth (S6).
 *
 * ⭐ NOTE THE DELIBERATE ODDITY, AND DO NOT "CORRECT" IT. Both keys point at SKU-facing names even
 * though the properties live on a process object whose class-name substitution resolves under the
 * process-object prefix (`org/Hibachi/HibachiValidationService.cfc:L212-L218`). The legacy author is
 * labelling these fields with the names a user recognises, because the bulk operation ultimately
 * writes SKU prices. The strings are preserved exactly as written.
 *
 * ⛔ A RESOURCE-BUNDLE KEY IS AN IDENTIFIER, NEVER A SENTENCE. It is looked up, not shown. Never
 * translate, sentence-case, normalise, trim, lowercase, pluralise or beautify one, and never add or
 * strip a prefix.
 * ============================================================================================== */

/**
 * The key override on the price property — `hb_rbKey="entity.sku.price"`, declared at
 * [`model/process/Product_UpdateSkus.cfc:L56`] and transcribed byte-exactly.
 */
export const PRODUCT_UPDATE_SKUS_PRICE_RB_KEY = 'entity.sku.price';

/**
 * The key override on the list-price property — `hb_rbKey="entity.sku.listPrice"`, declared at
 * [`model/process/Product_UpdateSkus.cfc:L58`] and transcribed byte-exactly.
 *
 * NEITHER FLAG CARRIES ONE. `model/process/Product_UpdateSkus.cfc:L55` and `:L57` declare no key
 * override, so none is exported for them and none may be invented (S9).
 */
export const PRODUCT_UPDATE_SKUS_LIST_PRICE_RB_KEY = 'entity.sku.listPrice';

/* ==============================================================================================
 * SECTION 3 — THE FOUR REPORTED MESSAGE KEYS
 *
 * ⭐⭐ THE CONTEXT SEGMENT IS MECHANICALLY PROVEN, NOT INFERRED.
 * `org/Hibachi/HibachiService.cfc:L114` composes the process method name as
 * `"process#ClassName#_#processContext#"`, and `model/service/ProductService.cfc:L216` declares
 * `processProduct_updateSkus`. Working that interpolation backwards yields `updateSkus` — proven.
 * All three declared process contexts round-trip perfectly against the same construction:
 * `model/service/ProductService.cfc:L113` yields `addOptionGroup`, `:L128` yields `addOption`, and
 * `:L216` yields `updateSkus`.
 *
 * ⭐ THE CLASS SEGMENT KEEPS ITS UNDERSCORE. `org/Hibachi/HibachiValidationService.cfc:L10` derives
 * the document stem from the subject's class name, so that name is literally `Product_UpdateSkus`.
 * ⛔ Do NOT normalise it — even though this file is named in camel case and the sibling interface is
 * camel-cased too, THE KEY USES THE LEGACY CLASS NAME.
 *
 * ⭐ THE PREFIX WOULD BE THE PROCESS-OBJECT ONE. `model/process/Product_UpdateSkus.cfc:L49` declares
 * no persistence, no entity name and no table, so the persistence test is false and the substitution
 * at `org/Hibachi/HibachiValidationService.cfc:L212-L218` takes the process-object branch rather than
 * the entity branch. THIS IS THE ONLY ONE OF THE SEVEN DOCUMENTS FOR WHICH THAT IS TRUE, and it is a
 * real difference from the other six rather than a detail.
 *
 * TWO OF THE THREE MESSAGE TEMPLATES ARE USED. The type-constraint template at
 * `org/Hibachi/HibachiValidationService.cfc:L226` appends the constraint's VALUE as a further segment;
 * the general template at `:L230` appends the constraint's TYPE. The method template at `:L222`, which
 * appends the method name, is used only by `./sku.rules`. The property segment is the trailing segment
 * of the identifier (`:L208`), which for both identifiers here is the whole identifier.
 *
 * ==============================================================================================
 * ⭐ DECISION D-1 — THE KEY IS CONSTRUCTED, AND THE SUBSTITUTION PASS IS DELIBERATELY SKIPPED
 * ==============================================================================================
 * Each of the three legacy template branches is followed by a template-substitution call. That pass is
 * not reproduced, for three reasons:
 *   1. no resource bundle exists in the target, so there is nothing to resolve against;
 *   2. the pass is a PROVABLE NO-OP against these shapes — it matches a dollar-brace token, and none
 *      of the three templates ever emits one;
 *   3. an unresolved key comes back from the legacy lookup with a missing-marker suffix appended, and
 *      the real legacy regression `issue_1335` asserts that a message does NOT end in that marker. A
 *      raw emitted key never does, so the equivalent assertion still passes.
 * ⛔ THESE ARE KEYS, NOT SENTENCES — the same identifier discipline as the two overrides above. Do NOT
 * import `../util/formatting` to render them; under this decision it would be dead code.
 *
 * WHY THESE ARE DECLARED AS LITERALS RATHER THAN COMPUTED HERE. `../Validator` exports the composer,
 * and it is tempting to call it. Three reasons not to: the dry-run contract requires this file to be
 * purely declarative data with no module-load work and no shared state; a test that calls the composer
 * and compares against a literal declared here is a REAL cross-check, whereas comparing against my own
 * call to the same composer would be tautological; and calling it would introduce the only runtime
 * import edge in the module. The two shared segments are single-sourced below so that the proven
 * context and the underscored class name cannot drift between the four keys.
 * ============================================================================================== */

/**
 * The proven context segment. ⛔ USED ONLY TO COMPOSE THE MESSAGE KEYS BELOW — it is deliberately NOT
 * used as a context gate on either rule, for the reason set out at length in the module header.
 */
const UPDATE_SKUS_MESSAGE_SEGMENT = 'updateSkus';

/** The legacy class name, underscore intact — `model/process/Product_UpdateSkus.cfc`. */
const PROCESS_OBJECT_CLASS_NAME = 'Product_UpdateSkus';

/** `validate.updateSkus.Product_UpdateSkus.price.required` — the general template, `:L230`. */
export const PRICE_REQUIRED_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.price.required` as const;

/**
 * `validate.updateSkus.Product_UpdateSkus.price.dataType.numeric` — the type template, `:L226`, which
 * is the one shape that appends its own constraint value.
 */
export const PRICE_DATA_TYPE_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.price.dataType.numeric` as const;

/** `validate.updateSkus.Product_UpdateSkus.listPrice.required` — the general template, `:L230`. */
export const LIST_PRICE_REQUIRED_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.listPrice.required` as const;

/** `validate.updateSkus.Product_UpdateSkus.listPrice.dataType.numeric` — the type template, `:L226`. */
export const LIST_PRICE_DATA_TYPE_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.listPrice.dataType.numeric` as const;

/* ==============================================================================================
 * SECTION 4 — PROPERTY AND CONDITION NAMES
 *
 * Each property name is checked against the sibling's own name union, so a typo is a COMPILE ERROR
 * rather than a rule that silently matches nothing at run time — which is exactly the failure the
 * legacy metadata walk could not detect, since `org/Hibachi/HibachiValidationService.cfc:L171` skips an
 * unmatched name in silence.
 *
 * The two condition names are single-sourced for the same reason with sharper stakes: a name declared
 * on a condition must match the name a rule selects it by, and a mismatch does not raise. It is
 * skipped at `org/Hibachi/HibachiValidationService.cfc:L108` and, being the only name listed, makes the
 * gate evaluate false at `:L130` — SILENTLY SWITCHING THE RULE OFF ALTOGETHER. Exporting them lets the
 * suite assert the linkage directly. Names resolve case-insensitively, matching CFML struct-key
 * semantics, but they are transcribed in their source casing regardless.
 * ============================================================================================== */

/** `property name="price" hb_rbKey="entity.sku.price";` [`model/process/Product_UpdateSkus.cfc:L56`] */
const PRICE_PROPERTY = 'price' satisfies ProductUpdateSkusPropertyName;

/**
 * `property name="listPrice" hb_rbKey="entity.sku.listPrice";`
 * [`model/process/Product_UpdateSkus.cfc:L58`]
 */
const LIST_PRICE_PROPERTY = 'listPrice' satisfies ProductUpdateSkusPropertyName;

/**
 * `property name="updatePriceFlag";` [`model/process/Product_UpdateSkus.cfc:L55`] — named here ONLY as
 * a condition predicate's subject. It carries no rule of its own.
 */
const UPDATE_PRICE_FLAG_PROPERTY = 'updatePriceFlag' satisfies ProductUpdateSkusPropertyName;

/**
 * `property name="updateListPriceFlag";` [`model/process/Product_UpdateSkus.cfc:L57`] — likewise a
 * predicate subject only.
 */
const UPDATE_LIST_PRICE_FLAG_PROPERTY =
  'updateListPriceFlag' satisfies ProductUpdateSkusPropertyName;

/** The condition gating the price rule — declared at [`model/validation/Product_UpdateSkus.json:L3`]. */
export const SHOW_PRICE_CONDITION_NAME = 'showPrice';

/**
 * The condition gating the list-price rule — declared at
 * [`model/validation/Product_UpdateSkus.json:L6`].
 */
export const SHOW_LIST_PRICE_CONDITION_NAME = 'showListPrice';

/* ==============================================================================================
 * SECTION 5 — THE CONDITIONS BLOCK
 *
 * [`model/validation/Product_UpdateSkus.json:L2-L9`] — the ONLY conditions block in all seven
 * documents, which makes this file the folder's sole user of the mechanism. Two named conditions, each
 * holding exactly one property predicate, each predicate using exactly one constraint.
 *
 * ==============================================================================================
 * ⭐⭐ THE EQUALITY PREDICATE — LOOSE COMPARISON IS LOAD-BEARING. DO NOT PRE-COERCE.
 * ==============================================================================================
 * The constraint value in the source document is THE NUMBER 1, at
 * [`model/validation/Product_UpdateSkus.json:L4`] and [`:L7`]. It is transcribed as the numeric literal
 * exactly as authored, and the loose comparison is left to `../Validator`.
 *
 * WHY LOOSENESS IS NOT OPTIONAL — the evidence chain, in order:
 *   1. `model/process/Product_UpdateSkus.cfc:L52-L58` declares five properties with ZERO type
 *      attributes and zero ORM types. Nothing constrains the runtime shape of a flag.
 *   2. Population assigns a TRIMMED STRING at `org/Hibachi/HibachiTransient.cfc:L207`, so what is
 *      actually stored on the process object for a submitted flag is the STRING "1".
 *   3. The document compares that against THE NUMBER 1.
 *   4. CFML's equality operator bridges the gap. `org/Hibachi/HibachiValidationService.cfc:L385-L395`
 *      declares its constraint value as a string, stringifies it, and compares with an operator that
 *      is both LOOSE and CASE-INSENSITIVE. Strict TypeScript equality would not bridge it.
 *   Corroborating evidence only, never ported: the administrative view that renders both flags posts a
 *   yes/no character form. `admin/**` is out of scope and no design system applies, so that view is
 *   cited here as EVIDENCE IN PROSE and is never imported, ported or otherwise referenced.
 *
 * `../Validator` reproduces the operator as an ordered ladder whose numeric rung comes FIRST, which is
 * what keeps a value of 1 from matching 2 while still matching "1", `true` and "yes". A flag that is
 * ABSENT fails the predicate outright (`:L387-L390` guards the null read before `:L391` compares).
 *
 * ⛔ THE MANDATE. Do NOT tighten the comparison. Do NOT normalise, coerce, parse or truthiness-test a
 * flag in this file. Do NOT rewrite the predicate as a boolean or as the string form. Do NOT narrow the
 * flag's declared type to make anything type-check — the sibling types it as a string-or-number union
 * for precisely this reason.
 *
 * THE FOLDER-WIDE EQUALITY PICTURE, measured across the seven documents: five occurrences in total —
 * THREE comparisons against false, which are delete guards on the product's transaction flag
 * (`model/validation/Product.json:L12`) and on the SKU's default and transaction flags
 * (`model/validation/Sku.json:L3` and `:L12`), and TWO comparisons against 1, BOTH HERE and both inside
 * this conditions block. The false polarity is equally loose — it matches `false`, "false", 0, "0" and
 * "no" — and neither polarity may be tightened.
 *
 * ⭐ AND NOTE WHAT THIS MECHANISM IS NOT. These conditions read ONE property's value in order to gate
 * ANOTHER property's rule, which is superficially close to a cross-property comparison. It is not one:
 * the mechanism is a condition plus an equality check, never a property-to-property comparison
 * constraint. Six documents elsewhere in the corpus use the property-comparison family; NONE of the
 * seven does, so reaching for it here would be fabrication (S9).
 * ============================================================================================== */

/**
 * The price condition's predicate — `"updatePriceFlag":{"eq":1}` at
 * [`model/validation/Product_UpdateSkus.json:L4`].
 *
 * Reported nowhere: a condition never contributes an error. See the absence chain in the module header.
 */
export const updatePriceFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: 1,
} as const) satisfies EqualityConstraint;

/**
 * The list-price condition's predicate — `"updateListPriceFlag":{"eq":1}` at
 * [`model/validation/Product_UpdateSkus.json:L7`].
 *
 * The source line carries three trailing spaces after the closing brace. That is a cosmetic legacy
 * artifact in a whitespace-insensitive format, so it is noted and NOT reproduced — there is nothing in
 * a typed declaration for it to be reproduced as.
 */
export const updateListPriceFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: 1,
} as const) satisfies EqualityConstraint;

/**
 * `showPrice` — met when the update-price flag equals one.
 * [`model/validation/Product_UpdateSkus.json:L3-L5`]
 *
 * ONE PREDICATE, so the and-within rule at `org/Hibachi/HibachiValidationService.cfc:L110-L121` has
 * nothing to conjoin and the condition is met exactly when this predicate holds. The or-across rule at
 * `:L124-L126` likewise has nothing to disjoin, since the rule that selects this condition names only
 * it. Both semantics are still the engine's, and neither is reimplemented here.
 */
export const showPriceCondition = Object.freeze({
  name: SHOW_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    Object.freeze({
      propertyIdentifier: UPDATE_PRICE_FLAG_PROPERTY,
      read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.updatePriceFlag,
      constraint: updatePriceFlagEqualityConstraint,
    } as const),
  ] as const),
} as const) satisfies ValidationCondition<ProductUpdateSkusValidationSubject>;

/**
 * `showListPrice` — met when the update-list-price flag equals one.
 * [`model/validation/Product_UpdateSkus.json:L6-L8`]
 *
 * INDEPENDENT OF ITS SIBLING. The two conditions share no state and neither influences the other: the
 * engine evaluates each rule's own condition list, so one flag being met has no effect whatsoever on
 * the other price's rule.
 */
export const showListPriceCondition = Object.freeze({
  name: SHOW_LIST_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    Object.freeze({
      propertyIdentifier: UPDATE_LIST_PRICE_FLAG_PROPERTY,
      read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.updateListPriceFlag,
      constraint: updateListPriceFlagEqualityConstraint,
    } as const),
  ] as const),
} as const) satisfies ValidationCondition<ProductUpdateSkusValidationSubject>;

/**
 * The document's conditions block, in source declaration order — the price condition first, at
 * [`model/validation/Product_UpdateSkus.json:L3`], then the list-price condition at [`:L6`].
 *
 * Exported separately from the rule set so a test can assert the absence chain directly against the
 * predicates, without going through a whole validation pass.
 */
export const productUpdateSkusConditions = Object.freeze([
  showPriceCondition,
  showListPriceCondition,
] as const);

/* ==============================================================================================
 * SECTION 6 — THE FOUR CONSTRAINTS
 *
 * [`model/validation/Product_UpdateSkus.json:L11-L12`] — two properties, one rule object each, two
 * constraints per rule object.
 *
 * ==============================================================================================
 * ⭐⭐ X3 — THERE IS NO NUMERIC FLOOR ON EITHER PRICE. THE ABSENCE WAS MEASURED.
 * ==============================================================================================
 * A floor is easy to assume here, because three of the folder's price declarations carry one and
 * because the AAP's own prose describes these two rules as having one. THE SOURCE DOCUMENT DOES NOT.
 * Re-measured across the seven documents rather than recalled: the floor constraint occurs exactly
 * THREE times folder-wide, ALL THREE inside `model/validation/Sku.json`, and NONE here.
 *
 * The comparison that makes the mistake so easy — five price declarations, four documents:
 *
 *   | property                          | locator                              | present | numeric | floor |
 *   |-----------------------------------|--------------------------------------|---------|---------|-------|
 *   | `Sku.listPrice`                   | `model/validation/Sku.json:L4`        | no      | yes     | 0     |
 *   | `Sku.price`                       | `model/validation/Sku.json:L9`        | yes     | yes     | 0     |
 *   | `Sku.renewalPrice`                | `model/validation/Sku.json:L10`       | yes     | yes     | 0     |
 *   | `Product.price`                   | `model/validation/Product.json:L8`     | yes     | yes     | NONE  |
 *   | `Product_UpdateSkus.price`        | `:L11` — HERE                         | yes     | yes     | NONE  |
 *   | `Product_UpdateSkus.listPrice`    | `:L12` — HERE                         | yes     | yes     | NONE  |
 *
 * ⚠️ STALE-LOCATOR CORRECTION, recorded rather than propagated: the AAP prose places the SKU price rule
 * at line 10 of its document. Measured, `Sku.price` is at `model/validation/Sku.json:L9` and line 10 is
 * `renewalPrice`. `../Validator` independently cites lines 4, 9 and 10 as the SKU document's three
 * numeric rules, which agrees with the measurement.
 *
 * ⛔ ADDING A FLOOR WOULD REJECT LEGACY-VALID INPUT. A bulk price update to a negative value succeeds
 * in the legacy system and must succeed here (S9, guideline 4). No floor, no ceiling, no
 * greater-than family, no positivity constraint of any kind.
 * ============================================================================================== */

/**
 * `price` must be PRESENT — when, and only when, its condition is met.
 *
 * [`model/validation/Product_UpdateSkus.json:L11`]
 * `"price": [{"conditions":"showPrice","dataType":"numeric","required":true}]`
 *
 * PRESENCE SEMANTICS (`org/Hibachi/HibachiValidationService.cfc:L240-L246`), with the two edges that
 * matter most on a money field:
 *   - absent FAILS;
 *   - the EMPTY STRING FAILS — an empty submitted price is a validation failure, not a skip, because
 *     the trimmed-length test sits inside the predicate;
 *   - a whitespace-only string FAILS, for the same reason;
 *   - ⭐ ZERO PASSES, in both its numeric and its string form. They are non-empty simple values. A
 *     PRICE OF ZERO IS VALID.
 *
 * ⛔ Do NOT add a falsy check, a positivity check or a truthiness guard. On a price field that is the
 * single most tempting "improvement" available and it would reject legitimate zero-priced SKUs.
 *
 * Reported as {@link PRICE_REQUIRED_MESSAGE_KEY}.
 */
export const updateSkusPriceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `price` must additionally be NUMERIC — the second constraint of the same rule object.
 *
 * [`model/validation/Product_UpdateSkus.json:L11`]
 *
 * ⭐ IT PASSES ON AN ABSENT VALUE (`org/Hibachi/HibachiValidationService.cfc:L256-L266` short-circuits
 * on absence at `:L259`), SO THE NULL PATH IS GUARDED BY THE PRESENCE CONSTRAINT ALONE. That division
 * of labour is exactly why the document pairs the two on one property: neither alone expresses "a
 * number must be there", since presence admits any non-empty simple value including a word, and the
 * type check admits nothing at all when the value is missing.
 *
 * An off-whitelist type value raises at `:L263` — a DIFFERENT raise from the unknown-constraint one at
 * `:L202`. `../Validator` closes the same door at COMPILE time by narrowing the type value to the only
 * two the seven documents use, which is strictly stronger than a runtime raise. This declaration is
 * checked against the NUMERIC ARM SPECIFICALLY rather than against the two-arm union, so a change to
 * the other value would be a compile error at this line rather than at the engine.
 *
 * The numeric value is one of only TWO type values used anywhere in the folder; the other is the single
 * address check on the brand website at `model/validation/Brand.json:L4`. The payment-card, calendar
 * and address-of-correspondent values that appear in ten, six and two OTHER documents of the wider
 * corpus appear in NONE of the seven and must never appear here (S9).
 *
 * Reported as {@link PRICE_DATA_TYPE_MESSAGE_KEY} — the type constraint is the one message shape that
 * appends its own value.
 */
export const updateSkusPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies NumericDataTypeConstraint;

/**
 * `listPrice` must be PRESENT — when, and only when, its own condition is met.
 *
 * [`model/validation/Product_UpdateSkus.json:L12`]
 * `"listPrice": [{"conditions":"showListPrice","dataType":"numeric","required":true}]`
 *
 * Semantics identical to {@link updateSkusPriceRequiredConstraint}; see that declaration for the edges.
 *
 * ⭐ WORTH CONTRASTING WITH THE SKU DOCUMENT: the SKU list price is NOT required
 * (`model/validation/Sku.json:L4` declares only a numeric check and a floor), whereas this one IS. The
 * two are different rules on differently-named properties of different subjects, and the divergence is
 * transcribed rather than harmonised.
 *
 * Reported as {@link LIST_PRICE_REQUIRED_MESSAGE_KEY}.
 */
export const updateSkusListPriceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `listPrice` must additionally be NUMERIC — the second constraint of its rule object.
 *
 * [`model/validation/Product_UpdateSkus.json:L12`]
 *
 * Semantics identical to {@link updateSkusPriceDataTypeConstraint}, including that it passes on an
 * absent value and is therefore inert on the null path.
 *
 * Reported as {@link LIST_PRICE_DATA_TYPE_MESSAGE_KEY}.
 */
export const updateSkusListPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies NumericDataTypeConstraint;

/* ==============================================================================================
 * SECTION 7 — THE TWO RULE OBJECTS
 *
 * Each is one rule object of one property: A CONDITION GATE AND NO CONTEXT GATE, carrying the two
 * constraints declared above in the document's own key order — the type check first, then the presence
 * check, exactly as lines 11 and 12 write them.
 *
 * ⭐ THE CONDITION GATE IS RE-EVALUATED PER CONSTRAINT, AND THAT IS LEGACY BEHAVIOUR TO PRESERVE.
 * The legacy flattening at `org/Hibachi/HibachiValidationService.cfc:L83-L85` copies a rule's condition
 * list onto EVERY flattened constraint record, and `:L178-L179` then tests it once per record. Since
 * each property here carries two constraints, THE GATE IS EVALUATED TWICE PER PROPERTY — twice for the
 * price and twice for the list price. `../Validator` reproduces that faithfully and says so in its own
 * source, noting that hoisting the check out of the constraint loop would be a caching decision that M7
 * forbids. ⛔ Do NOT optimise it away (guideline 4).
 *
 * A second consequence of the same flattening: THE TWO CONSTRAINTS OF ONE PROPERTY PASS OR FAIL
 * INDEPENDENTLY. Evaluation never short-circuits, so an absent price reports its presence failure while
 * its type check passes, and a present non-numeric price reports its type failure while presence passes.
 * Both accumulate UNDER THE SAME KEY, which is exactly why the error bag holds an array per key.
 *
 * These are exported individually so a test can assert the negative directly — that neither rule object
 * carries a context gate at all.
 * ============================================================================================== */

/**
 * The price rule — gated on `showPrice`, ungated by context.
 * [`model/validation/Product_UpdateSkus.json:L11`]
 */
export const priceConditionalRule = Object.freeze({
  conditions: SHOW_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    updateSkusPriceDataTypeConstraint,
    updateSkusPriceRequiredConstraint,
  ] as const),
} as const) satisfies ValidationRule<ProductUpdateSkusValidationSubject>;

/**
 * The list-price rule — gated on `showListPrice`, ungated by context.
 * [`model/validation/Product_UpdateSkus.json:L12`]
 */
export const listPriceConditionalRule = Object.freeze({
  conditions: SHOW_LIST_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    updateSkusListPriceDataTypeConstraint,
    updateSkusListPriceRequiredConstraint,
  ] as const),
} as const) satisfies ValidationRule<ProductUpdateSkusValidationSubject>;

/* ==============================================================================================
 * SECTION 8 — THE TWO PROPERTY RULE SETS
 *
 * ⚠️ THE ERROR KEY IS THE PROPERTY IDENTIFIER, ALWAYS. Every reporting branch of the legacy engine
 * (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`) adds its error with EXACTLY TWO
 * arguments — the property identifier and the message. So a price failure is keyed `price`, never by the
 * constraint kind and never by the condition name. The trailing-segment form derived at `:L208` builds
 * the MESSAGE only and never replaces the key. The three-argument reporting override on entities is an
 * entity concern and is never a validation-engine concern.
 *
 * ⭐ AND NOTE WHAT IS NEVER AN ERROR KEY: the two condition names. An unmet condition produces no error
 * at all — see the absence chain in the module header.
 * ============================================================================================== */

/**
 * `price` — numeric and required, but ONLY when the update-price flag equals one.
 *
 * ONE RULE OBJECT, TWO CONSTRAINTS, ONE CONDITION GATE, NO CONTEXT GATE. See
 * {@link priceConditionalRule} for the gate and {@link updateSkusPriceRequiredConstraint} and
 * {@link updateSkusPriceDataTypeConstraint} for the constraints.
 */
export const updateSkusPriceValidation = Object.freeze({
  propertyIdentifier: PRICE_PROPERTY,
  read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.price,
  rules: Object.freeze([priceConditionalRule] as const),
} as const) satisfies PropertyValidation<ProductUpdateSkusValidationSubject>;

/**
 * `listPrice` — numeric and required, but ONLY when the update-list-price flag equals one.
 *
 * The same shape as {@link updateSkusPriceValidation}, gated by its own independent condition.
 */
export const updateSkusListPriceValidation = Object.freeze({
  propertyIdentifier: LIST_PRICE_PROPERTY,
  read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.listPrice,
  rules: Object.freeze([listPriceConditionalRule] as const),
} as const) satisfies PropertyValidation<ProductUpdateSkusValidationSubject>;

/* ==============================================================================================
 * SECTION 9 — THE COMPLETE RULE SET
 *
 * ⛔ WHAT THIS DOCUMENT DOES NOT DECLARE. Only TWO of the process object's five properties carry rules.
 * Nothing is declared for the other three, and nothing may be added for them:
 *   - `product` [`model/process/Product_UpdateSkus.cfc:L52`] — the INJECTED ENTITY. NO RULE WHATSOEVER,
 *     not even a presence check, although the whole operation is meaningless without it. Do not add one.
 *   - `updatePriceFlag` [`:L55`] — appears ONLY as a condition predicate, at
 *     [`model/validation/Product_UpdateSkus.json:L4`]. No presence check, no type check, no rule-level
 *     equality check.
 *   - `updateListPriceFlag` [`:L57`] — likewise, a predicate subject only, at [`:L7`].
 * And there is nothing else to constrain: the component has no further property, no method, no
 * initialiser, no default and no validation hook. `model/process/Product_UpdateSkus.cfc:L49-L60` is the
 * component in its entirety.
 *
 * ==============================================================================================
 * THE CENSUS — THIS DOCUMENT'S SHARE OF THE THIRTEEN KEYS
 * ==============================================================================================
 * Measured across the seven in-scope documents, and every figure re-counted rather than recalled:
 *
 *   | key                     | kind      | folder-wide | HERE                                   |
 *   |-------------------------|-----------|-------------|----------------------------------------|
 *   | context list            | selection | 39          | 0 — ⭐ the ONLY document with none      |
 *   | condition list + block  | selection | 3           | 3 — ⭐ the SOLE user, all three         |
 *   | presence                | constraint| 18          | 2                                      |
 *   | collection ceiling      | constraint| 9           | 0                                      |
 *   | uniqueness              | constraint| 7           | 0                                      |
 *   | type check              | constraint| 7           | 2, both numeric                        |
 *   | equality                | constraint| 5           | 2, both against 1, both in conditions  |
 *   | pattern                 | constraint| 3           | 0                                      |
 *   | numeric floor           | constraint| 3           | 0 — ⭐ X3                               |
 *   | collection floor        | constraint| 3           | 0                                      |
 *   | method rule             | constraint| 2           | 0                                      |
 *   | list membership         | constraint| 2           | 0                                      |
 *   | trimmed-length ceiling  | constraint| 1           | 0                                      |
 *
 * So this document uses exactly THREE of the eleven constraint kinds — presence, type and equality —
 * plus the condition selection key, of which it is the folder's only user. The kinds are a discriminated
 * union in `../Validator`, so anything else is a compile error: the typed analogue of the legacy engine's
 * runtime raise at `org/Hibachi/HibachiValidationService.cfc:L202`.
 *
 * ⭐ X8, RECORDED FOR CROSS-FILE CONSISTENCY EVEN THOUGH THIS DOCUMENT CONTRIBUTES NOTHING TO IT. There
 * are SEVEN uniqueness constraints across the seven documents — not six and not five — distributed two
 * in `model/validation/Product.json` and one each in the SKU, brand, option, option-group and
 * product-type documents, with ZERO here. Measured directly. The `../../ports/UniquePropertyPort`
 * specification undercounts at six, denies the product URL-title constraint that
 * `model/validation/Product.json:L16` plainly declares, and omits the product-type document altogether;
 * `../Validator` independently carries the same correction, so the two agree and there is no cross-folder
 * conflict. C1.0 forbids editing either sibling, so the correction is recorded here and nowhere else.
 *
 * ==============================================================================================
 * ⭐ S8 — THE ACTION GATE DISAGREES WITH THE VALIDATION GATE
 * ==============================================================================================
 * The consumer decides whether to WRITE each price with a bare truthiness test on the accessor —
 * `if(arguments.processObject.getUpdatePriceFlag())` at `model/service/ProductService.cfc:L222` and the
 * list-price equivalent at `:L226` — whereas validation decides whether the price was CHECKED with the
 * equality predicate declared above. With the property unset the generated accessor returns null, and a
 * CFML truthiness test on null is ENGINE-DEPENDENT. So whether the price is written and whether the price
 * was validated are settled by TWO DIFFERENT PREDICATES that can disagree.
 *
 * This is recorded as an observation, deliberately NOT reconciled (guideline 4) and deliberately NOT
 * annotated as a parity defect: the defect register is closed and no identifier is invented for it. Also
 * noted in passing, and equally not given a NEW identifier: the loop counter at
 * `model/service/ProductService.cfc:L220` is UNSCOPED — the second such site, the first being `:L118` —
 * and TypeScript block scoping removes that hazard by construction. That is not a fresh finding but the
 * SAME deliberate translation decision the register ALREADY carries as D10 against
 * `ProductService.getFormattedOptionGroups`, so D10 is cited rather than duplicated under a new number.
 * Both observations belong to `src/services/ProductService.ts` to act on, if anything is ever to be acted
 * on; this file only records them where the disagreeing predicate is declared.
 *
 * NO EXECUTION-MODEL MISMATCH ARISES HERE. These rules are pure, synchronous, in-memory predicate
 * evaluation with no data access whatsoever — no query, no transaction, no flush awareness, no timeout
 * and no retry. The mismatch inventory is fully allocated and none of it belongs to this file.
 *
 * ==============================================================================================
 * ⭐ WHY THIS FILE MATTERS ON A LIVE PATH
 * ==============================================================================================
 * AAP §0.4.2.1 records the update-skus process member as "Fully ported" — the ONLY process member in the
 * slice that is not boundary-stubbed. So unlike some rules in this folder, these two genuinely execute.
 * Getting them wrong does not fail loudly: the port would compile cleanly and then either demand a price
 * the legacy system never asked for, or silently accept a bulk SKU price update with no price at all.
 * ============================================================================================== */

/**
 * The complete transliterated document — the typed replacement for
 * `model/validation/Product_UpdateSkus.json`.
 *
 * Both halves of the document's own top-level structure are preserved: the properties container, and —
 * uniquely among the seven — the conditions block. Properties appear in source order, the price rule at
 * [`model/validation/Product_UpdateSkus.json:L11`] before the list-price rule at [`:L12`].
 *
 * NOTHING IN THIS FILE INVOKES ANYTHING. It declares data. The caller is the service layer and the
 * evaluator is `../Validator`, which is handed this value rather than loading it — the separation AAP
 * §0.3.3 describes as a rule set "evaluated by `Validator.ts`". It is safe as module-scope state for the
 * reasons given in the module header: frozen, immutable, request-independent, side-effect-free, with
 * every nested array and object frozen at its own declaration site.
 */
export const productUpdateSkusValidationRuleSet = Object.freeze({
  conditions: productUpdateSkusConditions,
  properties: Object.freeze([updateSkusPriceValidation, updateSkusListPriceValidation] as const),
} as const) satisfies ValidationRuleSet<ProductUpdateSkusValidationSubject>;
