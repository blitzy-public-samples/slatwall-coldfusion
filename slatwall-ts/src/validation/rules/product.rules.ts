/**
 * `product.rules.ts` — the typed transliteration of `model/validation/Product.json`, and the sole owner
 * of the code-format pattern the catalog's three code properties share.
 *
 * AAP 0.4.1.5 Validation Layer row 2 makes this file CREATE against that document: "Required fields, the
 * `productCode` regex and uniqueness, per-context `baseProductType` gates, minimum-collection gates,
 * delete guards".
 *
 * The generic evaluation semantics every constraint below relies on — null verdicts per constraint,
 * CFML loose equality, the error key, context selection, the deliberate non-ports and the absence of any
 * memoisation — are stated once in `../Validator` and are not repeated here. What this header carries is
 * what is specific to THIS document.
 *
 * THE DOCUMENT — ELEVEN PROPERTIES, TWELVE RULE OBJECTS, SIXTEEN CONSTRAINTS. Constraints outnumber rule
 * objects because the legacy engine explodes one rule object into one constraint record per key; see THE
 * FLATTENING below.
 *
 *   line  property                         context(s)               constraints
 *   :L4   baseProductType                  addOptionGroup,addOption  inList merchandise
 *   :L5   baseProductType                  addSubscriptionTerm       inList subscription
 *   :L7   physicalCounts                   delete                    maxCollection 0   <- INERT
 *   :L8   price                            save                      required, dataType numeric
 *   :L9   productName                      save                      required
 *   :L10  productCode                      save                      required, unique, regex
 *   :L11  productType                      save                      required          <- SOLE
 *   :L12  transactionExistsFlag            delete                    eq false
 *   :L13  unusedProductOptions             addOption                 minCollection 1
 *   :L14  unusedProductOptionGroups        addOptionGroup            minCollection 1
 *   :L15  unusedProductSubscriptionTerms   addSubscriptionTerm       minCollection 1
 *   :L16  urlTitle                         save                      required, unique
 *
 * Five distinct context strings appear: `save`, `delete`, `addOption`, `addOptionGroup` and
 * `addSubscriptionTerm`. EVERY rule object declares a context, and that has a consequence worth stating
 * so a silence is not mistaken for an omission: the context gate at
 * `org/Hibachi/HibachiValidationService.cfc:L71` makes a rule with no `contexts` key apply in every
 * context, so under the engine's default empty context THIS FILE CONTRIBUTES NOTHING AT ALL. The
 * property inverts for exactly one of the seven documents — `model/validation/Product_UpdateSkus.json`
 * declares no context on either rule and therefore fires under every context string.
 *
 * THE FLATTENING. `org/Hibachi/HibachiValidationService.cfc:L77-L88` explodes each rule object into one
 * constraint record per key, skipping `contexts` and `conditions` and copying them onto every record it
 * produces, so the rule at `model/validation/Product.json:L10` becomes THREE independent constraints,
 * each able to report its own failure against the same property. Here that explosion is the data shape
 * rather than something derived at evaluation time, which is why a property validation below holds an
 * array of constraints.
 *
 * DETERMINISTIC EVALUATION ORDER — A DELIBERATE IMPROVEMENT ON AN UNSPECIFIED ONE (AAP 0.8.2 guideline
 * 6). The legacy engine iterated a CFML struct to reach a property's constraints, and CFML struct-key
 * iteration order is unspecified. This port fixes an order and says so: properties in the source
 * document's own key order, rules in declaration order within a property, constraints in declaration
 * order within a rule — the order the table above lists and the declarations below appear in. No legacy
 * behavior could have depended on an order the engine never guaranteed, so this is not a behavior
 * change; what it buys is the ability to assert on the accumulated message array at all.
 *
 * THE TWO ABSENT SIBLING DOCUMENTS — DO NOT "RESTORE" THEM. AAP 0.2.1.5: "Note a subtlety that must not
 * be mistaken for an omission: there is no `Product_AddOption.json` and no
 * `Product_AddOptionGroup.json`. Those two process contexts are validated by context-scoped rules
 * declared inside `model/validation/Product.json`." The `addOption` and `addOptionGroup` gating lives at
 * `model/validation/Product.json:L4`, `:L13` and `:L14` — in THIS document and nowhere else. Preserve
 * the asymmetry: `model/validation/Product_UpdateSkus.json` does exist and does get its own rule file,
 * `./productUpdateSkus.rules`. Harmonising the three process objects would invent rules for two
 * contexts that never had their own document, which AAP 0.7.3 S9 forbids.
 *
 * P-2 — THE TWO-PASS PROCESS FLOW, AND WHY IT PROVES THAT ABSENCE. A process runs validation TWICE,
 * against two different subjects, with the SAME context string:
 * `org/Hibachi/HibachiService.cfc:L96` validates THE ENTITY with `context = processContext`; `:L99`
 * gates the next step on the entity having no errors and on the entity actually having a process object
 * for that context; and `:L108` validates THE PROCESS OBJECT with the same context. Under
 * `addOptionGroup` and `addOption` the entity pass fires this document's `inList` gate at
 * `model/validation/Product.json:L4` plus the matching `minCollection` gate at `:L13` or `:L14`, while
 * the process-object pass fires NOTHING, because the two documents that would drive it do not exist.
 * Under `updateSkus` the position reverses: no rule here lists that context, so the entity pass fires
 * nothing from this file and the process-object pass fires exactly the two conditional rules of
 * `./productUpdateSkus.rules`.
 *
 * INVOCATION-SITE ASYMMETRY, which is why the delete guards cannot be bypassed and the save rules can.
 * `delete` is HARD-CODED at the single delete call site, `arguments.entity.validate(context="delete")`
 * at `org/Hibachi/HibachiService.cfc:L55` — no parameter to omit, no default to override. `save` is a
 * DEFAULTED PARAMETER on the save signature at `org/Hibachi/HibachiService.cfc:L133`, so a caller may
 * pass something else and the save rules then do not apply. Treat `save` as just another context string,
 * never as privileged.
 *
 * TRACEABLE LEGACY COVERAGE — `issue_1331`, THE ONE TEST THIS FILE MUST KEEP PORTABLE.
 * `meta/tests/unit/IssuesTest.cfc:L101-L108` is one of the five traceable catalog regressions AAP 0.6.5.1
 * records, and it exercises this document directly: `:L103` creates a product through the service's
 * synthesized `newProduct` member; `:L105` assigns the CONTENT-ACCESS product type, seeded with
 * identifier `444df313ec53a08c32d8ae434af5819a` at `config/dbdata/SlatwallProductType.xml.cfm:L15`; and
 * `:L107` asserts the product is NOT processable for `addOptionGroup`.
 *
 * The mechanism end to end: `isProcessable(context)` at `org/Hibachi/HibachiEntity.cfc:L224-L226` calls
 * the engine in the non-mutating mode and reads `hasErrors()` off the RETURNED THROWAWAY bag, so it is a
 * pure query that leaves the entity's own errors untouched. The engine selects the `addOptionGroup`
 * context, which reaches `model/validation/Product.json:L4` requiring `baseProductType` to be in the
 * list `merchandise`; the content-access discriminator is not in that list, the `inList` evaluator fails
 * on a present non-matching value, the throwaway bag reports an error, and the assertion passes.
 *
 * THIS IS WHY {@link baseProductTypeMerchandiseRule} AND {@link baseProductTypeInListMerchandise} ARE
 * EXPORTED INDIVIDUALLY: a test must be able to import and assert that one gate on its own to reproduce
 * this regression. Fold it into an opaque aggregate and a traceable legacy test becomes unportable. One
 * plausible misreading, for completeness: calling `isProcessable()` with no argument uses its declared
 * default context, which matches no rule in any of the seven documents, so it evaluates NOTHING and
 * answers true.
 *
 * WHAT THIS DOCUMENT DELIBERATELY DOES NOT DECLARE (AAP 0.7.3 S9). Four of the thirteen keys the seven
 * documents use are absent from `model/validation/Product.json` and are therefore absent below:
 * `conditions`, `minValue`, `maxLength` and `method`. In particular there is NO `minValue` on `price`
 * even though the SKU document declares one on its own price, and the optional conditions block of the
 * rule set is OMITTED rather than declared empty. The only numeric literals in this file are the two the
 * document declares: the collection ceiling 0 at `:L7` and the collection floor 1 at `:L13`, `:L14` and
 * `:L15`.
 *
 * @see model/validation/Product.json — the transliterated source document
 * @see model/entity/Product.cfc — the entity whose properties these rules name
 * @see `../Validator` — the evaluation semantics every constraint below relies on
 */

import type { Product, ProductPropertyName } from '../../domain/product/Product';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type { ExactDecimal } from '../../util/formatting';
import type {
  DataTypeConstraint,
  EqualityConstraint,
  InListConstraint,
  MaxCollectionConstraint,
  MinCollectionConstraint,
  PropertyValidation,
  RegexConstraint,
  RequiredConstraint,
  UniqueConstraint,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/* ==============================================================================================
 * SECTION 1 — THE SHARED CODE-FORMAT PATTERN
 *
 * THIS FILE IS THE PATTERN'S SOLE OWNER, BY DOCUMENT ORDER.
 *
 * The literal occurs in exactly three of the seven in-scope documents:
 *   model/validation/Product.json:L10       productCode
 *   model/validation/Option.json:L3         optionCode
 *   model/validation/OptionGroup.json:L4    optionGroupCode
 * and in none of the other four. `model/validation/Product.json:L10` is the first occurrence in
 * document order, so the constant is declared here and `./option.rules` and `./optionGroup.rules`
 * import it from `./product.rules`. The dependency runs one way only; nothing in this file imports a
 * sibling rules file.
 *
 * A fourth "shared constants" module is NOT authorised by the AAP and must not be created — no
 * `common.ts`, no `types.ts`, no `constants.ts`, no helpers folder. One owner, three consumers.
 * ============================================================================================ */

/**
 * The code-format pattern shared by the catalog's three code properties, transcribed character for
 * character from `model/validation/Product.json:L10`.
 *
 * IT IS A PATTERN STRING, NOT A COMPILED PATTERN, AND THAT IS REQUIRED RATHER THAN STYLISTIC.
 * `../Validator` types a format constraint's value as a string and compiles it FRESH on every
 * evaluation, precisely so nothing survives between invocations on a warm container (M7). Handing it a
 * pre-compiled object would both fail to type-check and defeat that guarantee; keeping a compiled
 * pattern at module scope would also introduce mutable engine state, since a compiled pattern carries a
 * `lastIndex`.
 *
 * DO NOT TIDY THE CHARACTER CLASS. Every character is load-bearing and the layout is deliberate:
 *   - the `-` between `0-9` and `_` is a LITERAL HYPHEN, because it sits where a range cannot begin;
 *   - the trailing `^` inside the class is a LITERAL CARET, because a caret only negates in first
 *     position;
 *   - `.` and `|` are literal inside a character class and need no escape;
 *   - both ends are anchored by the pattern itself, so the whole value must match.
 * Reordering the class, escaping the hyphen differently or re-anchoring it changes which product codes
 * are accepted — including `TESTPRODUCTXXX`, the code the legacy fixture at
 * `meta/tests/unit/Helper.cfc:L52-L77` uses.
 *
 * COMPILE IT WITH NO FLAGS. The unicode flag is pointless here, since the class is pure ASCII. The
 * unicode-SETS flag is worse than pointless: this class is invalid under it, so constructing the pattern
 * raises a synchronous `SyntaxError`. Because `../Validator` constructs the pattern at the moment it
 * evaluates the constraint, that raise would surface as a validation-time failure on the invocation
 * path, propagating out of the validate call rather than being reported as a rule failure. It must never
 * be added, here or in `../Validator`.
 *
 * THE END-ANCHOR MICRO-DIVERGENCE, CARRIED NOT REPAIRED (AAP 0.8.2 guideline 6). JavaScript's `$`
 * without the multiline flag matches only at end of input, so a value ending in a line feed does NOT
 * match. Java-flavoured regular expressions, which the legacy CFML engine used, also let `$` match
 * before a single trailing line terminator, so `"ABC\n"` would have matched there and does not here. The
 * divergence is documented and LEFT AS IS: adding the multiline flag to close it would change which
 * codes are accepted, and AAP 0.8.2 guideline 4 forbids enhancing behavior beyond what the migration
 * requires. Its reach is narrow — a line feed is not in the class either way, so only a value whose ONLY
 * offence is a single trailing terminator is affected.
 *
 * THE EMPTY STRING FAILS THIS PATTERN, while an absent value PASSES the format constraint entirely
 * (`org/Hibachi/HibachiValidationService.cfc:L481-L487` short-circuits on absence). Empty and absent are
 * NOT interchangeable, and no absence guard belongs here — `../Validator` owns that branch, and layering
 * another would change which saves succeed.
 *
 * Exported as a named constant so a test can assert a single source of truth across all three consuming
 * documents (AAP 0.7.3 S6).
 */
export const CODE_FORMAT_REGEX = '^[a-zA-Z0-9-_.|:~^]+$';

/**
 * What this rule set requires of the object being validated, and nothing more.
 *
 * STRUCTURAL, NEVER NOMINAL — the established convention of this subtree rather than a choice made
 * here. `../Validator` states that its subject shape is structural so that every ported entity and
 * process object satisfies it without declaring that it does, and so that a hand-written literal
 * satisfies it too; `./productType.rules` and `./brand.rules` compose their contracts the same way.
 * Nothing extends anything, because AAP 0.3.3 replaces the legacy template-method inheritance with
 * composition.
 *
 * The type is an intersection of three parts, each present for a stated reason:
 *
 *   1. {@link ValidationSubject} — the engine's own two members: the class name that forms the third
 *      segment of every reported key, and the property-existence predicate the engine consults at
 *      `org/Hibachi/HibachiValidationService.cfc:L171` before evaluating any rule of a property. That
 *      predicate is not incidental here; it is the ENTIRE mechanism by which the `physicalCounts`
 *      guard below stays inert, exactly as it is inert in the legacy system.
 *
 *   2. {@link UniquePropertyEntity} — the five-accessor shape the uniqueness port needs. Required
 *      because this document declares TWO `unique` constraints, and `../Validator` types a uniqueness
 *      constraint's target resolver as returning this shape. `../Validator` deliberately keeps those
 *      five accessors OFF its own subject contract, so a rule set that needs them must ask, and this
 *      one does. Both `unique` rules here carry a single-segment property identifier, so the resolved
 *      entity is the subject itself and the resolvers below are the identity function.
 *
 *   3. The eleven property values these rules actually READ, and no others.
 *
 * EVERY MEMBER IS OPTIONAL AND READ-ONLY, AND EVERY VALUE IS ALREADY RESOLVED. Two independent
 * constraints force this shape, and both are worth stating because the alternative looks natural:
 *
 *   - `../Validator` requires a property reader to be a PLAIN SYNCHRONOUS accessor. Its own note is
 *     explicit that a reader returning a promise "would be compared as an object and would silently
 *     fail every simple-value predicate" — the promise, not the value, would be measured. So this
 *     contract cannot expose the asynchronous members the domain class uses to DERIVE these values.
 *     Six of the eleven are non-persistent on `model/entity/Product.cfc` and five of those six resolve
 *     asynchronously in the ported entity — `getBaseProductType`, `getTransactionExistsFlag`,
 *     `getUnusedProductOptions`, `getUnusedProductOptionGroups` and
 *     `getUnusedProductSubscriptionTerms`. The agent contract for this file is precise about the
 *     division: the rule REFERENCES the property, it does not perform the resolution; `src/domain/`
 *     owns that. The subject handed to `../Validator` is therefore a validation VIEW whose derived
 *     values the caller has already awaited, which is also how the legacy engine saw them — CFML
 *     accessors returned values, never futures.
 *
 *   - Optionality keeps the engine's absence branches REACHABLE from a plain object literal. Several
 *     evaluators short-circuit on an absent value — a collection floor and a collection ceiling both
 *     PASS, a format check PASSES, a presence check and an equality check both FAIL — so absence is a
 *     specified input, not a defect. The legacy repository contains no mocking library at all (AAP
 *     0.6.5.2), so the net-new suite substitutes hand-written subjects; if these members were required,
 *     half the specified branches could not be reached without a cast, and casts are forbidden here.
 *
 * WHY THE COLLECTIONS AND THE PRODUCT-TYPE REFERENCE ARE TYPED WITH THE UNKNOWN TOP TYPE. A
 * collection floor MEASURES SIZE and never inspects an element, and a presence check on an object only
 * asks whether one is there. Typing them precisely would force imports of
 * `../../domain/product/ProductType` and of the option and subscription shapes, and NONE of those is
 * among this file's declared dependencies — reaching for one would breach AAP 0.7.3 S4. The honest type
 * is the one that says "a value whose interior is none of my business". `./productType.rules` records
 * the same reasoning for the same reason.
 *
 * NOTE WHAT IS ABSENT. `model/entity/Product.cfc` declares far more than these eleven — the
 * identifier, both flags, the description, the sort order, the four persisted calculated columns, the
 * brand and default-SKU references, ten collections, the audit block and twenty non-persistent members.
 * None of them appears here, because no rule in this document reads them. In particular there is NO
 * member for `skus` (see X7 at {@link transactionExistsFlagValidation}) and no member for any pricing,
 * promotion, inventory or currency-derived property, all of which AAP 0.2.2.6 excludes outright.
 */
export type ProductValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /**
     * The derived base product type — `property name="baseProductType" type="string"
     * persistent="false"` [`model/entity/Product.cfc:L103`].
     *
     * Typed as an open string, DELIBERATELY NOT as a three-member union of the seeded discriminators.
     * See {@link baseProductTypeInListMerchandise} for why narrowing it would be wrong.
     */
    readonly baseProductType?: string;

    /**
     * NAMED BY THE DOCUMENT, DECLARED BY NO ENTITY — the inertness finding recorded in full at
     * {@link physicalCountsMaxCollectionConstraint}.
     *
     * Present here as an optional member of the widest type for exactly one reason: the guard's value
     * reader must be expressible WITHOUT a type assertion, and assertions are forbidden. Declaring it
     * does NOT make the guard fire. Whether a rule runs is decided at run time by
     * {@link ValidationSubject.hasProperty}, and for any faithful product subject that predicate
     * answers false for this name — which is precisely why the legacy engine skips the rule and why
     * this port must skip it too.
     */
    readonly physicalCounts?: unknown;

    /**
     * The price delegated to the default SKU — `property name="price" hb_formatType="currency"
     * persistent="false"` [`model/entity/Product.cfc:L118`]. See X1 at
     * {@link priceRequiredConstraint}, including the boundary note about how it is resolved.
     */
    readonly price?: ExactDecimal;

    /** `property name="productName" ormtype="string" notnull="true";` [`model/entity/Product.cfc:L55`] */
    readonly productName?: string;

    /**
     * `property name="productCode" ormtype="string" unique="true";`
     * [`model/entity/Product.cfc:L56`] — carries all three of this document's densest constraints.
     */
    readonly productCode?: string;

    /**
     * The required product-type reference —
     * `property name="productType" cfc="ProductType" fieldtype="many-to-one" fkcolumn="productTypeID"
     * fetch="join";` [`model/entity/Product.cfc:L69`].
     *
     * Typed with the unknown top type: a presence check only asks whether a reference is there, and
     * `../../domain/product/ProductType` is not a declared dependency of this file. See
     * {@link productTypeRequiredConstraint} — this is the SOLE enforcement of the relationship.
     */
    readonly productType?: unknown;

    /**
     * `property name="transactionExistsFlag" type="boolean" persistent="false"`
     * [`model/entity/Product.cfc:L110`] — the delete guard's subject.
     */
    readonly transactionExistsFlag?: boolean;

    /**
     * `property name="unusedProductOptions" type="array" persistent="false"`
     * [`model/entity/Product.cfc:L111`], resolved by the lazily memoised getter at
     * [`model/entity/Product.cfc:L635-L640`]. Measured, never inspected.
     */
    readonly unusedProductOptions?: readonly unknown[];

    /**
     * `property name="unusedProductOptionGroups" type="array" persistent="false"`
     * [`model/entity/Product.cfc:L112`], resolved at [`model/entity/Product.cfc:L642-L647`]. Measured,
     * never inspected.
     */
    readonly unusedProductOptionGroups?: readonly unknown[];

    /**
     * `property name="unusedProductSubscriptionTerms" type="array" persistent="false"`
     * [`model/entity/Product.cfc:L113`], resolved at [`model/entity/Product.cfc:L649-L654`] through the
     * out-of-scope subscription service. Measured, never inspected. See the boundary note at
     * {@link unusedProductSubscriptionTermsMinCollectionConstraint}.
     */
    readonly unusedProductSubscriptionTerms?: readonly unknown[];

    /** `property name="urlTitle" ormtype="string" unique="true";` [`model/entity/Product.cfc:L54`] */
    readonly urlTitle?: string;
  };

/* ==============================================================================================
 * SECTION 3 — CONTEXTS
 *
 * Five distinct context strings, transcribed verbatim, plus the one two-element list the document
 * declares. Kept as the legacy comma-delimited STRING form rather than becoming arrays, so a rule set
 * transcribes its document literally.
 *
 * MATCHING IS CASE-INSENSITIVE AND COMMA-DELIMITED, because the legacy gate is
 * `listFindNoCase(rule.contexts, arguments.context)` at
 * `org/Hibachi/HibachiValidationService.cfc:L71`. `../Validator` reproduces both halves, and its list
 * splitter deliberately does NOT trim elements — CFML list functions do not, so a space after a comma
 * would become part of an element. The value at `model/validation/Product.json:L4` is written with no
 * space for that reason and is transcribed exactly.
 *
 * The AAP calls the process contexts by name in AAP 0.4.2.1, where the service members that run them
 * appear as `processProductAddOptionGroup`, `processProductAddOption` and
 * `processProductAddSubscriptionTerm`. The context strings below are the legacy suffixes those members
 * are dispatched on, and they are what the traceable regression at
 * `meta/tests/unit/IssuesTest.cfc:L107` passes in.
 * ============================================================================================ */

const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

const ADD_OPTION_CONTEXT = 'addOption';

const ADD_OPTION_GROUP_CONTEXT = 'addOptionGroup';

const ADD_SUBSCRIPTION_TERM_CONTEXT = 'addSubscriptionTerm';

/**
 * The one two-element context list in the document — `"addOptionGroup,addOption"` at
 * `model/validation/Product.json:L4`.
 *
 * TWO ENTRIES, NOT ONE. The gate splits on the comma, so this rule applies under either context
 * independently. Composed from the two single-context constants above so the pair cannot drift from
 * them, and written with NO space after the comma because the splitter does not trim.
 */
const ADD_OPTION_GROUP_OR_ADD_OPTION_CONTEXTS = `${ADD_OPTION_GROUP_CONTEXT},${ADD_OPTION_CONTEXT}`;

/* ==============================================================================================
 * SECTION 4 — PROPERTY IDENTIFIERS
 *
 * The document's eleven keys, transcribed verbatim. Each is the ERROR KEY its failures are reported
 * under: every branch of the legacy reporter records a failure against the FULL property identifier
 * (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`), never against the constraint
 * that produced it. The trailing-segment form derived at `:L208` shapes the message text only.
 *
 * THREE DIFFERENT COMPILE-TIME CHECKS ARE USED, AND THE DISTINCTION IS NOT COSMETIC.
 * `../../domain/product/Product` exports a property-name union that documents itself as the census of
 * what `model/entity/Product.cfc` declares — but it enumerates the PERSISTENT block at
 * [`model/entity/Product.cfc:L52-L99`] plus the audit names, and deliberately not the non-persistent
 * block at [`:L102-L123`]. Six of this document's eleven keys are non-persistent, so that union covers
 * only five of them and a check built on it alone would be WRONG for the other six: it would "prove"
 * that `price` is undeclared, when `model/entity/Product.cfc:L118` plainly declares it. Each key is
 * therefore checked with the strongest claim that is actually TRUE of it:
 *
 *   - four persistent keys are checked against the persistent census;
 *   - five non-persistent keys are checked against the ported class's member census, which does include
 *     the non-persistent backing slots;
 *   - one non-persistent key is checked through the accessor that resolves it, because the ported class
 *     exposes it as a method rather than a slot;
 *   - and the twelfth name — the one no entity declares — is checked NEGATIVELY.
 *
 * The point of all four forms is the same: if a name is ever renamed or removed in the domain layer,
 * this file stops compiling instead of silently declaring a rule against a name that no longer exists.
 * The `physicalCounts` case below is the standing demonstration that the failure mode is otherwise
 * completely silent.
 * ============================================================================================ */

/**
 * `model/validation/Product.json:L9`, `model/entity/Product.cfc:L55`.
 *
 * The only property in the entire in-scope slice whose column carries `notnull="true"`, which changes
 * how a BLANK payload value is applied during population — the empty string is assigned rather than the
 * key deleted. That is `../../domain/base/populate`'s concern, not this file's; noted so the asymmetry
 * is not mistaken for something this document expresses.
 */
const PRODUCT_NAME_PROPERTY = 'productName' satisfies ProductPropertyName;

/** `model/validation/Product.json:L10`, `model/entity/Product.cfc:L56`. */
const PRODUCT_CODE_PROPERTY = 'productCode' satisfies ProductPropertyName;

/** `model/validation/Product.json:L11`, `model/entity/Product.cfc:L69`. */
const PRODUCT_TYPE_PROPERTY = 'productType' satisfies ProductPropertyName;

/** `model/validation/Product.json:L16`, `model/entity/Product.cfc:L54`. */
const URL_TITLE_PROPERTY = 'urlTitle' satisfies ProductPropertyName;

/**
 * `model/validation/Product.json:L8`, `model/entity/Product.cfc:L118`.
 *
 * Checked against the ported class's member census rather than the persistent one, for the reason given
 * in this section's header: the property is real but non-persistent, so it is absent from a union that
 * enumerates only persistent and audit names.
 */
const PRICE_PROPERTY = 'price' satisfies keyof Product;

/** `model/validation/Product.json:L12`, `model/entity/Product.cfc:L110`. Non-persistent. */
const TRANSACTION_EXISTS_FLAG_PROPERTY = 'transactionExistsFlag' satisfies keyof Product;

/** `model/validation/Product.json:L13`, `model/entity/Product.cfc:L111`. Non-persistent. */
const UNUSED_PRODUCT_OPTIONS_PROPERTY = 'unusedProductOptions' satisfies keyof Product;

/** `model/validation/Product.json:L14`, `model/entity/Product.cfc:L112`. Non-persistent. */
const UNUSED_PRODUCT_OPTION_GROUPS_PROPERTY = 'unusedProductOptionGroups' satisfies keyof Product;

/**
 * Resolves to the document's property name while the ported `Product` exposes the accessor that
 * produces that property's value, and to the empty type as soon as it does not.
 *
 * Two of this document's eleven keys name non-persistent properties the ported class exposes as METHODS
 * rather than as backing slots, because resolving either may reach the database. A `satisfies keyof
 * Product` check on the bare property name would therefore fail for a name that is entirely legitimate,
 * while omitting a check altogether would leave the document-to-domain pairing free to rot unnoticed.
 * This alias resolves both: the declaration carries the PROPERTY name, and the check is made against the
 * ACCESSOR that produces it.
 *
 * It is a compile-time claim only. Nothing here invokes an accessor — the resolution is asynchronous and
 * belongs to `src/domain/`, per the subject contract — and the alias is erased by the compiler.
 */
type NameResolvedByProductAccessor<
  TName extends string,
  TAccessor extends keyof Product,
> = TAccessor extends keyof Product ? TName : never;

/**
 * `model/validation/Product.json:L4` and `:L5`, `model/entity/Product.cfc:L103`, resolved by the accessor
 * at [`model/entity/Product.cfc:L493-L495`].
 *
 * See {@link baseProductTypeInListMerchandise} for why the value it yields must not be narrowed to a
 * union of the seeded discriminators.
 */
const BASE_PRODUCT_TYPE_PROPERTY: NameResolvedByProductAccessor<
  'baseProductType',
  'getBaseProductType'
> = 'baseProductType';

/**
 * `model/validation/Product.json:L15`, `model/entity/Product.cfc:L113`, resolved by the accessor at
 * [`model/entity/Product.cfc:L649-L654`] through the out-of-scope subscription service.
 */
const UNUSED_PRODUCT_SUBSCRIPTION_TERMS_PROPERTY: NameResolvedByProductAccessor<
  'unusedProductSubscriptionTerms',
  'getUnusedProductSubscriptionTerms'
> = 'unusedProductSubscriptionTerms';

/**
 * Resolves to the name itself while the ported `Product` declares NO member of that name, and to the
 * empty type as soon as it declares one.
 *
 * This is the type-level guard for the inertness premise recorded in full at
 * {@link physicalCountsMaxCollectionConstraint}. That premise — that the engine's existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule because no such property exists — is a
 * FACT ABOUT ANOTHER FILE, and facts about other files are exactly what drift silently.
 *
 * IT IS DELIBERATELY WRITTEN AGAINST THE CLASS'S MEMBER CENSUS RATHER THAN THE PERSISTENT-PROPERTY
 * UNION, and the difference is the whole reason this alias is trustworthy. The persistent union omits
 * every non-persistent property, so a guard built on it would also report `price` as undeclared and
 * would prove nothing about `physicalCounts` in particular. The class's member census includes the
 * non-persistent backing slots AND the accessors, so the claim it makes is exact: NO member of the
 * ported `Product` — field or method — is named `physicalCounts`.
 *
 * If one were ever added, this alias would collapse to the empty type, the declaration below would fail
 * to compile, and whoever made the change would be told that a guard which has never fired in the
 * legacy system is about to start firing. Without it, the same change would quietly begin blocking
 * deletes the legacy system permits.
 *
 * It constrains no value at run time, evaluates nothing and is erased entirely by the compiler.
 */
type NameNotDeclaredByProduct<TName extends string> = TName extends keyof Product ? never : TName;

/**
 * `model/validation/Product.json:L7` — transcribed verbatim from the document and DELIBERATELY NOT
 * checked against any positive census, because it is in none of them. See
 * {@link physicalCountsMaxCollectionConstraint} for the full finding; the annotation here is what makes
 * the absence enforced rather than merely described.
 */
const PHYSICAL_COUNTS_PROPERTY: NameNotDeclaredByProduct<'physicalCounts'> = 'physicalCounts';

/* ==============================================================================================
 * SECTION 5 — THE SIXTEEN CONSTRAINTS
 *
 * Each is exported individually so a test can import and assert it on its own. That is what the
 * net-new suite at `slatwall-ts/test/validation/rules.test.ts` needs — its contract is to assert each
 * ported rule, and the legacy repository contains NO MOCKING LIBRARY AT ALL (AAP 0.6.5.2), so every
 * declaration here must be trivially constructible and inspectable from plain object literals. That
 * file belongs to the sibling test subtree and is deliberately not created from here.
 *
 * Each is written as `Object.freeze({ … } as const) satisfies …`, which does three things at once and
 * all three are required:
 *   - `as const` keeps the literal values NARROW, so the ceiling below really is the literal 0 in the
 *     type rather than merely a number, and a test can assert on it;
 *   - `satisfies` checks conformance to the discriminated union at the point of declaration, so an
 *     unknown constraint kind or a misspelled discriminant is a COMPILE error — the typed analogue of
 *     the legacy engine's runtime raise at `org/Hibachi/HibachiValidationService.cfc:L202`;
 *   - `Object.freeze` makes the immutability real at RUN TIME rather than only in the type, which is
 *     what lets this module-scope data be safe under M7 on a warm container. Freezing is shallow, so
 *     every nested array and object below is frozen at its own site too.
 *
 * ONE NOTE ON COVERAGE HONESTY, because it must not be implied to be parity: of the four services and
 * six entities in this slice, AAP 0.6.5.2 records that the legacy suite contains no service test at
 * all and no DAO test at all. For THIS document the position is mixed and worth stating precisely:
 * `meta/tests/unit/entity/ProductTest.cfc` exists but asserts URL formatting rather than validation,
 * and the one genuinely traceable assertion that reaches these rules is `issue_1331` — see the module
 * header. Every OTHER assertion written against this file is NET-NEW COVERAGE.
 * ============================================================================================ */

/**
 * GATE 1 of 2 on the derived base product type: the two OPTION contexts require MERCHANDISE.
 *
 * [`model/validation/Product.json:L4`]
 * `{"contexts":"addOptionGroup,addOption","inList":"merchandise"}`
 *
 * This is the single most consequential declaration in the file, because it is the one a traceable
 * legacy test asserts on. See TRACEABLE LEGACY COVERAGE in the module header for the full `issue_1331`
 * chain; the short form is that a content-access product must NOT be processable for `addOptionGroup`,
 * and this gate is what makes that true.
 *
 * =============================================================================================
 * LIST MEMBERSHIP IS WHOLE-ELEMENT AND CASE-INSENSITIVE — NOT A SUBSTRING TEST (guideline 6)
 * =============================================================================================
 * The legacy evaluator is `listFindNoCase(constraintValue, propertyValue)` at
 * `org/Hibachi/HibachiValidationService.cfc:L459-L465`. A TypeScript port written with
 * `String.prototype.includes` or `indexOf` would be WRONG, and wrong in a way no test of the happy path
 * would catch: `"merchandise".includes("merchand")` is true, so a truncated or partial value would be
 * admitted where the legacy engine rejects it. The faithful form is split on the comma, then compare
 * whole elements case-insensitively, and that is what `../Validator` does. CFML list functions do not
 * trim elements either, which is why the list values here carry no incidental whitespace.
 *
 * FAILS ON AN ABSENT VALUE (`:L461` requires the value to be present). That matters here: a product with
 * no product type assigned yet cannot resolve a base type, so it is not processable for either option
 * context — which is the legacy outcome, reached through this constraint rather than through a separate
 * presence rule. No presence rule is declared on `baseProductType`, and none may be added.
 *
 * =============================================================================================
 * THE VALUE IS DERIVED, AND MUST NOT BE NARROWED TO A UNION (guideline 6)
 * =============================================================================================
 * `baseProductType` is non-persistent [`model/entity/Product.cfc:L103`]. Its accessor at
 * [`model/entity/Product.cfc:L493-L495`] is one delegation to the product type, and
 * `ProductType.getBaseProductType()` at [`model/entity/ProductType.cfc:L110-L115`] then does a ROOT
 * LOOKUP: when its own system code is null or empty it walks to the FIRST identifier in the product-type
 * identifier path and returns THAT row's system code.
 *
 * So the value is whatever a database row holds. It can be any string, and it can be absent. The three
 * discriminators seeded at `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` are the only ones the
 * shipped data provides, but nothing in the schema constrains a deployment to them.
 *
 * THEREFORE: `src/domain/BaseProductType.ts` IS NOT IMPORTED HERE, and the two list values below stay
 * PLAIN STRING LITERALS transcribed from the document. Narrowing them to a three-member union would
 * misrepresent an open database value as a closed set, and would couple this file to a module that is not
 * among its declared dependencies (AAP 0.7.3 S4). The literals are written exactly as
 * `model/validation/Product.json` declares them, in lower camel case, which is also how the seeded system
 * codes are written — and the comparison is case-insensitive regardless.
 *
 * Reported as `validate.addOptionGroup.Product.baseProductType.inList`, and as
 * `validate.addOption.Product.baseProductType.inList` under the other context of the same list.
 */
export const baseProductTypeInListMerchandise = Object.freeze({
  constraintType: 'inList',
  constraintValue: 'merchandise',
} as const) satisfies InListConstraint;

/**
 * GATE 2 of 2 on the derived base product type: the term context requires SUBSCRIPTION.
 *
 * [`model/validation/Product.json:L5`]
 * `{"contexts":"addSubscriptionTerm","inList":"subscription"}`
 *
 * THE BOUNDARY NUANCE — THIS RULE IS CARRIED, NOT DROPPED (guideline 6). The process object this gate
 * protects, `model/process/Product_AddSubscriptionTerm.cfc`, and its own validation document
 * `model/validation/Product_AddSubscriptionTerm.json`, are BOTH explicitly out of scope under AAP
 * 0.2.2.4. The gate itself is not: it lives inside the in-scope `model/validation/Product.json` and is
 * part of that document's observable behavior.
 *
 * AAP TR-5 governs: "Where an in-scope member depends on an out-of-scope collaborator, the port interface
 * is declared, the member is implemented against it, and the gap is flagged. The member is never quietly
 * dropped from the interface." So the rule is transcribed faithfully and the gap is stated here rather
 * than papered over: the service member that consumes this context is boundary-stubbed in the port —
 * AAP 0.4.2.1 marks `processProductAddSubscriptionTerm` as such — so the context is reachable and
 * validated even though what follows a successful validation is not implemented in this slice.
 *
 * Independently confirmed, because it is the obvious thing to get wrong: the excluded
 * `model/validation/Product_AddSubscriptionTerm.json` was read in full and contains only price rules with
 * NO `contexts` key at all. The `addSubscriptionTerm` GATE therefore genuinely lives in
 * `model/validation/Product.json` and nowhere else, and NO rule file may be created for that excluded
 * document.
 *
 * Semantics are identical to {@link baseProductTypeInListMerchandise}; see that declaration for the
 * whole-element matching rule, the absence behavior and why the value is not narrowed.
 *
 * Reported as `validate.addSubscriptionTerm.Product.baseProductType.inList`.
 */
export const baseProductTypeInListSubscription = Object.freeze({
  constraintType: 'inList',
  constraintValue: 'subscription',
} as const) satisfies InListConstraint;

/**
 * DELETE GUARD 1 of 2 — AND IT IS INERT AT RUN TIME. DECLARE IT ANYWAY; DO NOT RETARGET IT.
 *
 * [`model/validation/Product.json:L7`] `"physicalCounts": [{"contexts":"delete","maxCollection":0}]`
 *
 * =============================================================================================
 * THE FINDING (guideline 6)
 * =============================================================================================
 * `model/entity/Product.cfc` DECLARES NO `physicalCounts` PROPERTY. A search of the whole file for that
 * name returns zero occurrences. What it declares instead is `physicals`, at
 * [`model/entity/Product.cfc:L90`] — a many-to-many across the physical-product link table.
 *
 * The gate that makes the difference observable is `if(arguments.object.hasProperty(propertyIdentifier))`
 * at `org/Hibachi/HibachiValidationService.cfc:L171`, and its precise semantics matter:
 *   - it keys off whether the property is DECLARED, not whether it is persistent;
 *   - when the answer is false the rule is SILENTLY SKIPPED — not raised, not failed, not logged.
 *
 * So this guard has never fired in the legacy system, and it never will. By contrast `price`,
 * `baseProductType`, `transactionExistsFlag` and the three unused-collection properties ARE declared —
 * as non-persistent, which the gate does not care about — so every one of THEIR rules does fire. The
 * distinction is entirely about declaration, and it is the reason this document's other ten rules are
 * live while this one is not.
 *
 * =============================================================================================
 * DO NOT RETARGET THIS GUARD TO `physicals`. IT IS THE SINGLE LARGEST HAZARD IN THIS FOLDER.
 * =============================================================================================
 * Pointing it at the property the entity actually declares would ACTIVATE a guard that has never been
 * active and would begin REJECTING DELETES THE LEGACY SYSTEM PERMITS. That is a direct violation of AAP
 * 0.8.2 guideline 4 — "Do not enhance or optimize business logic beyond what the migration requires" —
 * and of guideline 2's behavior-preservation requirement. It would also be undetectable from this file
 * alone: the rename compiles, the rule looks more correct than before, and the only symptom is a product
 * that can no longer be deleted.
 *
 * The three prohibitions, stated plainly so none is left to inference:
 *   1. DO NOT rename the identifier to `physicals`.
 *   2. DO NOT ask the domain layer to add a `physicalCounts` member so that the guard starts working.
 *   3. DO NOT drop the rule. AAP 0.7.3 S7 is preserve-and-annotate; a rule present in the document must
 *      be present in the transliteration, whether or not it can fire.
 *
 * The type-level half of this is enforced at {@link PHYSICAL_COUNTS_PROPERTY}, which stops compiling if
 * the premise ever stops being true.
 *
 * =============================================================================================
 * WHY NO PARITY ANNOTATION AND NO REGISTER ENTRY
 * =============================================================================================
 * No entry in the register covers this, and no new one is minted for it — the register is stated
 * canonically, and only once, in the header of `src/ports/repositories/SkuRepository.ts` (BOTH FROZEN AT THE AAP's OWN BOUNDS — AAP 0.6.7's D1-D21 and AAP 0.6.6's M1-M8, over which the port carries exactly five CORRECTION ALIASES for observations those registers do not number: D22-D25 and M9. Nothing in this port mints a sixth; a further source observation is recorded by its `path:Lnnn` locator instead). Inventing one would fabricate a plan artifact, so this finding is documented in prose
 * at the site of the judgment — which is exactly what guideline 6 asks for — and carries no
 * invented identifier of any kind.
 *
 * =============================================================================================
 * COLLECTION-CEILING SEMANTICS, reproduced by `../Validator` from
 * `org/Hibachi/HibachiValidationService.cfc:L309-L315`. Recorded even though the rule cannot fire,
 * because the same evaluator serves other documents and the null branch surprises people:
 *   - absent or null            PASSES — an explicit short-circuit, not an oversight
 *   - an EMPTY array            PASSES a ceiling of 0, since its length is 0
 *   - a non-empty array         FAILS — the delete is blocked
 *   - a non-null SIMPLE value   FAILS — it is neither array nor struct, so neither branch admits it
 *   - a struct                  measured by KEY COUNT
 *
 * Would be reported as `validate.delete.Product.physicalCounts.maxCollection`.
 */
export const physicalCountsMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/**
 * X1 — `price` IS REQUIRED ON SAVE, AND IT IS EASY TO MISS.
 *
 * [`model/validation/Product.json:L8`]
 * `{"contexts":"save","required":true,"dataType":"numeric"}`
 *
 * The AAP's own summary prose for this file lists only the name, code, type and URL-title properties for
 * the save context. `price` is ALSO required, and the document is the authority: line 8 is byte-exact
 * above. Omitting it would let a priceless product save where the legacy system rejects it.
 *
 * =============================================================================================
 * NO NUMERIC FLOOR IS DECLARED, AND NONE MAY BE ADDED (guideline 6)
 * =============================================================================================
 * `model/validation/Sku.json` declares a floor of zero on ITS price. `model/validation/Product.json`
 * DOES NOT, on this one or on any property — the key appears zero times in this document. The asymmetry
 * is real and is preserved. Adding a floor here would reject a negative product price that the legacy
 * system accepts, which is a behavior change dressed as a safety improvement, and AAP 0.7.3 S9 forbids
 * inventing a constraint the source does not state.
 *
 * The only numeric literals this file may contain are the two the document declares — the ceiling 0 at
 * `:L7` and the floor 1 at `:L13`, `:L14` and `:L15` — and each carries its locator.
 *
 * =============================================================================================
 * PRESENCE SEMANTICS, reproduced by `../Validator` from
 * `org/Hibachi/HibachiValidationService.cfc:L240-L246`. Do NOT layer an extra guard on top of them;
 * adding one changes which saves succeed:
 *   - absent or null              FAILS
 *   - the number 0                PASSES. CFML measures a simple value's TRIMMED STRING LENGTH, and
 *                                 "0" has length one. There is no falsy check anywhere in the legacy
 *                                 predicate, and adding one is the single easiest way to start rejecting
 *                                 a free product the legacy system accepts.
 *   - the empty string            FAILS
 *   - a whitespace-only string    FAILS — the trim is inside the predicate
 *   - an empty array              FAILS; a non-empty array or struct PASSES; any object PASSES
 *
 * The legacy evaluator declares a constraint value at `:L240` and then never reads it, so presence is
 * enforced whatever the value says. `../Validator` already carries that observation on the constraint
 * type itself, so it is not restated as a parity annotation here; the value is transcribed as the
 * document declares it so the transcription stays faithful.
 *
 * =============================================================================================
 * BOUNDARY NOTE — HOW THIS VALUE IS RESOLVED, AND WHAT THAT IMPLIES (AAP 0.7.3 S8)
 * =============================================================================================
 * `price` is NON-PERSISTENT: `property name="price" hb_formatType="currency" persistent="false"` at
 * [`model/entity/Product.cfc:L118`], delegated to the default SKU. AAP 0.4.1.6 routes price reads for this
 * slice through the pricing boundary port — declared at `slatwall-ts/src/ports/PricingPort.ts`, which this
 * file deliberately does NOT import, because a rule names a property and never resolves it — and AAP 0.4.2
 * marks several price-adjacent members as boundary-stubbed.
 *
 * The consequence, stated and NOT resolved: if the value presented to this rule resolves to absent —
 * because a product has no default SKU yet, or because the boundary is stubbed — then presence FAILS and
 * the save is rejected. That is the faithful outcome of the legacy predicate applied to an absent value,
 * and it is flagged rather than smoothed over, exactly as AAP 0.8.3.6 requires. It must NOT be
 * "fixed" from here: no fallback value, no default, no relaxation of the rule and no absence guard. Any
 * of those would change which products save. Resolution, if any is ever wanted, belongs to whoever
 * assembles the validation subject.
 *
 * Reported as `validate.save.Product.price.required`.
 */
export const priceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `price` must additionally be NUMERIC on save — the second constraint of the same rule object.
 *
 * [`model/validation/Product.json:L8`]
 *
 * PASSES ON AN ABSENT VALUE (`org/Hibachi/HibachiValidationService.cfc:L256-L266` short-circuits on
 * absence), which is exactly why the document pairs it with the presence rule above. Neither constraint
 * alone expresses "a number must be there": the presence rule admits any non-empty simple value including
 * a word, and the type rule admits nothing at all. Both are needed, and both are declared.
 *
 * `numeric` is on the legacy whitelist at `org/Hibachi/HibachiValidationService.cfc:L258`; a value outside
 * that whitelist raises at `:L263`. `../Validator` closes the same door at COMPILE time by narrowing the
 * type value to the only two the seven documents use, which is strictly stronger than a runtime raise.
 *
 * DECLARATION ORDER IS THE DOCUMENT'S KEY ORDER: presence first, then type, exactly as line 8 writes
 * them. Evaluation does not short-circuit, so an absent price reports the presence failure while the type
 * constraint passes, and a non-numeric present value reports the type failure while presence passes. Both
 * accumulate under the single key `price`, which is why the error bag holds an array per key.
 *
 * Reported as `validate.save.Product.price.dataType.numeric` — the type constraint is the one message
 * shape that appends its own value, per `org/Hibachi/HibachiValidationService.cfc:L227`.
 */
export const priceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/**
 * `productName` is REQUIRED on save.
 *
 * [`model/validation/Product.json:L9`] `"productName": [{"contexts":"save","required":true}]`
 *
 * THE APPLICATION RULE CARRIES MORE THAN THE COLUMN DOES. The mapping is
 * `property name="productName" ormtype="string" notnull="true";` at [`model/entity/Product.cfc:L55`]. The
 * column's not-null attribute and this rule are NOT the same guarantee: the column rejects a null, while
 * this rule additionally rejects the empty string and a whitespace-only string, and reports the failure as
 * a validation message keyed by the property rather than as a driver-level integrity error. Dropping the
 * rule on the grounds that the column already covers it would change observable behavior in both respects.
 *
 * NOTHING ELSE IS DECLARED ON THIS PROPERTY. No maximum length — [`model/entity/Product.cfc:L55`] carries
 * no length attribute to derive one from, and `maxLength` appears zero times in this document. No minimum
 * length, which is not among the thirteen keys the seven documents use. No format pattern: the code
 * pattern belongs to `productCode`, and applying it to a human-readable name would reject every product
 * name containing a space. No uniqueness — two products may legitimately share a name, and only the code
 * and the URL title are unique here.
 *
 * Presence semantics are identical to {@link priceRequiredConstraint}; see that declaration.
 *
 * Reported as `validate.save.Product.productName.required`.
 */
export const productNameRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `productCode` is REQUIRED on save — the first of THREE constraints flattened from one rule object.
 *
 * [`model/validation/Product.json:L10`]
 * `{"contexts":"save","required":true,"unique":true,"regex":"…"}`
 *
 * THE DENSEST RULE IN THE DOCUMENT, and the clearest illustration of the flattening described in the
 * module header: `org/Hibachi/HibachiValidationService.cfc:L77-L88` explodes this single line of JSON into
 * three independent constraint records, copies the save-context gate onto each, and evaluates all three
 * without short-circuiting. ALL THREE CAN FAIL IN ONE PASS, and all three report under the SINGLE key
 * `productCode` — which is precisely why the error bag's values are arrays.
 *
 * THE WORKED INTERACTION, because the three constraints disagree about absence and that is the point:
 *   - value ABSENT      presence FAILS · format PASSES (absence short-circuit) · uniqueness PASSES
 *                       (the existence query binds a null, which matches no row, so zero rows come back
 *                       and the checker answers "unique") ⇒ ONE message
 *   - value EMPTY       presence FAILS · format FAILS (the pattern requires one or more characters) ·
 *                       uniqueness queries with the empty string ⇒ TWO messages, possibly three
 *   - value VALID+TAKEN presence PASSES · format PASSES · uniqueness FAILS ⇒ ONE message
 *
 * Presence semantics are identical to {@link priceRequiredConstraint}; see that declaration.
 *
 * Reported as `validate.save.Product.productCode.required`.
 */
export const productCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `productCode` must be UNIQUE on save — and this declaration carries the X8 correction for the whole
 * folder, because this is where the disputed constraint lives.
 *
 * [`model/validation/Product.json:L10`], [`model/entity/Product.cfc:L56`]
 *
 * =============================================================================================
 * X8 — THE FOLDER-WIDE COUNT IS SEVEN, AND THIS DOCUMENT DECLARES TWO OF THEM
 * =============================================================================================
 * `../Validator` carries all seven locators under DECISION D-2 AND "THE SEVEN". Two are declared by this
 * document: `model/validation/Product.json:L10` here, and `model/validation/Product.json:L16` on the URL
 * title. The second is the one most easily missed, because a reader who expects a URL title to be merely
 * required will not look for a uniqueness rule beside it — and the constraint table in the module header
 * above transcribes that line as declaring both.
 *
 * AAP IR-5's "five of the eight unique columns" counts ENTITY COLUMN METADATA, which IR-5 itself
 * identifies as the separate mechanism, enforcing uniqueness "independently of the `unique="true"`
 * column metadata". The VALIDATION-DOCUMENT count is SEVEN. Both statements are true of different
 * mechanisms, and neither is a ceiling on the other.
 *
 * =============================================================================================
 * POLARITY, PINNED: `true` MEANS UNIQUE, WHICH MEANS SAFE TO SAVE (guideline 6)
 * =============================================================================================
 * At `org/Hibachi/HibachiDAO.cfc:L130-L146` the legacy body runs an
 * existence query and then returns FALSE when it finds matching rows (`:L142-L144`) and TRUE when it finds
 * none (`:L146`). The validation evaluator at `org/Hibachi/HibachiValidationService.cfc:L467-L470` returns
 * that result UNMODIFIED as its own pass-or-fail verdict.
 *
 * INVERTING THIS IS SILENT AND CATASTROPHIC. It compiles, it passes any test that merely checks a boolean
 * came back, and it corrupts the catalog by admitting every duplicate code while rejecting every distinct
 * one. Any test of this constraint MUST exercise the COLLIDING case — a test that covers only the
 * non-colliding path passes under either polarity and proves nothing.
 *
 * =============================================================================================
 * THREE FURTHER FACTS ABOUT THE LEGACY CHECK, each shaping what a correct implementation must do
 * =============================================================================================
 *   - AN ABSENT VALUE ALWAYS PASSES, INDIRECTLY. The predicate compares the property against a bound
 *     value; a null bind matches no row, so zero rows come back and the checker answers true. There is NO
 *     absence guard in the evaluator at `org/Hibachi/HibachiValidationService.cfc:L467-L470` — in
 *     deliberate contrast to its null-tolerant sibling at `:L472-L479`, which has one. THEREFORE the
 *     injected uniqueness port MUST treat an absent value as unique and return true: it must NOT raise, it
 *     must NOT translate the comparison into a null test, and it must NOT report the value as taken. Note
 *     that this constraint is paired with a presence rule on the same property, so an absent code is
 *     reported by THAT rule rather than this one.
 *   - THE SELF-EXCLUSION CLAUSE IS A NO-OP ON INSERT. The query excludes the row being validated by
 *     comparing primary identifiers, binding the entity's own identifier at `org/Hibachi/HibachiDAO.cfc:L136`
 *     and using it at `:L140`. During pre-save validation of a NEW entity there is no identifier to exclude
 *     yet — identifiers are 32-character values assigned at insert time (AAP IR-6) — so on insert the check
 *     degenerates to a plain existence test. On update the clause is live and stops a row colliding with
 *     itself. Recorded because it looks like protection against self-collision and is not, on the path that
 *     matters most.
 *   - THE CONSTRAINT VALUE IS DECLARED BUT NEVER READ (`:L467`). Uniqueness is a flag; there is no
 *     "unique: false" form in any of the seven documents, and a hypothetical one would still enforce. It is
 *     transcribed faithfully anyway.
 *
 * =============================================================================================
 * DUAL ENFORCEMENT, AND WHY THE APPLICATION CHECK IS KEPT (IR-5)
 * =============================================================================================
 * Uniqueness is declared twice for this property, in two independent mechanisms: the column metadata at
 * [`model/entity/Product.cfc:L56`] and the document's own rule. AAP IR-5 requires the application-side check
 * be retained regardless, so the failure surfaces as a VALIDATION MESSAGE KEYED BY THE PROPERTY rather than
 * as a driver-level duplicate-key error escaping the data layer. A port that dropped this constraint and
 * leaned on the column would move the failure and change observable behavior.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — AND THE COLUMN IS NOW A REPORTED BACKSTOP RATHER THAN A SILENT ONE.
 * This constraint is still what produces the keyed message on the ordinary path, and nothing about that
 * changed. What changed is the path this paragraph calls "escaping the data layer": under review finding
 * F6 (CWE-367) a write that loses a concurrency race against `model/entity/Product.cfc:L56` now arrives
 * as a typed `UniqueConstraintViolationError` classified as a request rejection, rather than as an
 * unclassified driver error indistinguishable from a service fault. That is a reporting change only —
 * the same writes succeed and fail, at the same moment — and it does not substitute for this rule,
 * because it carries no property key and therefore cannot tell a caller WHICH value collided.
 *
 * EVALUATION GOES EXCLUSIVELY THROUGH THE INJECTED PORT. This file NAMES the constraint and RESOLVES its
 * target; it never invokes the port, never issues a query, never reaches an adapter and contains no
 * statement of any kind. The port is constructor-injected into `../Validator` (AAP 0.7.3 S3).
 *
 * THE TARGET RESOLVER IS THE IDENTITY FUNCTION, deliberately. The legacy engine resolves the entity to
 * check by walking the property identifier to its last object (`org/Hibachi/HibachiValidationService.cfc:L468`);
 * for a single-segment identifier — which is what all seven uniqueness rules in the slice have — that walk
 * terminates immediately at the subject itself. The indirection is retained because the legacy has it and
 * because a dotted identifier would resolve elsewhere, but no lookup is invented.
 *
 * Reported as `validate.save.Product.productCode.unique`.
 */
export const productCodeUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: ProductValidationSubject): UniquePropertyEntity => subject,
} as const) satisfies UniqueConstraint<ProductValidationSubject>;

/**
 * `productCode` must MATCH THE SHARED CODE FORMAT on save — the third constraint of the same rule object.
 *
 * [`model/validation/Product.json:L10`]
 *
 * The pattern is {@link CODE_FORMAT_REGEX}, owned by this file and shared with the option and option-group
 * code properties. See that declaration for the character-class analysis, the flag prohibitions, the
 * end-anchor micro-divergence and the empirical accept and reject sets.
 *
 * PASSES ON AN ABSENT VALUE (`org/Hibachi/HibachiValidationService.cfc:L481-L487` short-circuits on
 * absence) but FAILS ON THE EMPTY STRING, since the pattern requires one or more characters. Absent and
 * empty are NOT interchangeable, and no absence guard belongs here — `../Validator` owns that branch.
 *
 * DECLARATION ORDER IS THE DOCUMENT'S KEY ORDER: presence, then uniqueness, then format, exactly as line 10
 * writes them. This is the deterministic order described in the module header, replacing an order the legacy
 * engine never guaranteed.
 *
 * Reported as `validate.save.Product.productCode.regex`.
 */
export const productCodeRegexConstraint = Object.freeze({
  constraintType: 'regex',
  constraintValue: CODE_FORMAT_REGEX,
} as const) satisfies RegexConstraint;

/**
 * `productType` is REQUIRED on save — AND THIS DECLARATION IS THE ONLY THING ENFORCING THE
 * RELATIONSHIP ANYWHERE IN THE SYSTEM.
 *
 * [`model/validation/Product.json:L11`] `"productType": [{"contexts":"save","required":true}]`
 *
 * =============================================================================================
 * THE SOLE-ENFORCEMENT FINDING (guideline 6)
 * =============================================================================================
 * The entity mapping is:
 *
 *     property name="productType" cfc="ProductType" fieldtype="many-to-one"
 *     fkcolumn="productTypeID" fetch="join";              [`model/entity/Product.cfc:L69`]
 *
 * There is NO `required="true"` attribute on it. The relationship is therefore not enforced by the mapping,
 * and the schema is unchanged by this refactor — AAP 0.1.1.1 classifies the exercise as logic extraction
 * with the physical tables retained as the shared contract between the legacy application and this service.
 * So the database will accept a product row with no product type quite happily.
 *
 * A reader who assumes mapping-level or schema-level enforcement will judge this rule redundant and drop
 * it. It is not redundant: it is the ENTIRE mechanism. Dropping or weakening it silently permits type-less
 * products, and a type-less product cannot resolve a base product type at all — which would in turn make
 * the two option gates at [`model/validation/Product.json:L4`] unreachable in a way the legacy system never
 * allowed.
 *
 * THE SAME PATTERN HOLDS ELSEWHERE IN THE FOLDER, worth naming so it reads as a pattern rather than an
 * oddity: the brand name at [`model/entity/Brand.cfc:L56`], the product-type name at
 * [`model/entity/ProductType.cfc:L57`] and the required option-group reference at
 * [`model/entity/Option.cfc:L59`] are all enforced by their validation documents alone.
 *
 * AND THE DELIBERATE CONTRAST, so the absence of a matching rule elsewhere is not read as an oversight:
 * the SKU's own product reference at [`model/entity/Sku.cfc:L65`] ALSO lacks a mapping-level requirement AND
 * has no validation rule at all in `model/validation/Sku.json`. That gap is legacy behavior. NO rule may be
 * declared for it — not here, and not in `./sku.rules` (AAP 0.7.3 S9).
 *
 * PRESENCE ON A REFERENCE. The legacy predicate at `org/Hibachi/HibachiValidationService.cfc:L242` admits
 * ANY object outright, without inspecting it, so an assigned product type passes whatever its own state.
 * That is why the subject contract types this member with the unknown top type: the rule asks only whether
 * a reference is there. It does NOT validate the referenced product type — cascading validation into a
 * sub-property would require the populated-sub-property vocabulary, which appears in NONE of the seven
 * documents and is therefore unreachable from these rule sets.
 *
 * Reported as `validate.save.Product.productType.required`.
 */
export const productTypeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * DELETE GUARD 2 of 2 — a product with transaction history cannot be deleted. THIS ONE IS LIVE.
 *
 * [`model/validation/Product.json:L12`] `"transactionExistsFlag": [{"contexts":"delete","eq":false}]`
 *
 * The contrast with the other delete guard is the whole lesson of this document's delete surface:
 * `transactionExistsFlag` IS declared, as non-persistent, at [`model/entity/Product.cfc:L110`], so the
 * existence gate at `org/Hibachi/HibachiValidationService.cfc:L171` admits it and the rule fires on every
 * delete. `physicalCounts` is declared nowhere and is skipped. Same document, same context, opposite fates,
 * and the only difference is declaration.
 *
 * =============================================================================================
 * LOOSE EQUALITY IS LOAD-BEARING, NOT AN OVERSIGHT (guideline 6)
 * =============================================================================================
 * The legacy evaluator at `org/Hibachi/HibachiValidationService.cfc:L385-L395` declares its constraint value
 * as a STRING, so the JSON boolean false arrives as the string "false" before a loose CFML comparison. The
 * practical consequence: this guard matches the boolean false AND the string "false" AND the number 0 AND
 * the string "0" AND the string "no". `../Validator` reproduces that coercion ladder deliberately rather
 * than tightening it to a strict comparison, because tightening would change which deletes are permitted.
 *
 * The value is transcribed here as the document writes it — the boolean — and the looseness lives in the
 * evaluator where the legacy looseness lived.
 *
 * FAILS ON AN ABSENT VALUE (`:L391` requires the value to be present). So a product whose flag has not been
 * resolved cannot be deleted. Note the one place this evaluator is unusually careful: it alone guards
 * against the resolved subject itself being absent, at `:L387-L390`.
 *
 * =============================================================================================
 * X7 — DO NOT FABRICATE A SKU DELETE GUARD (guideline 6)
 * =============================================================================================
 * A summary elsewhere pairs this property with the SKU collection when describing collection ceilings.
 * `model/validation/Product.json` HAS NO `skus` GUARD. Its ONLY two delete rules are the inert
 * `physicalCounts` ceiling at `:L7` and this equality guard at `:L12` — the module header table above is a
 * complete census of the document. Declaring a SKU guard would reject deletes the legacy system permits,
 * which is the same guideline-4 violation as retargeting the inert guard. NONE is declared, here or anywhere
 * in this file, and the subject contract carries no member for that collection so one cannot be added without
 * also widening the contract.
 *
 * RELATED BOUNDARY NOTE, stated and not resolved (AAP 0.7.3 S8): the SKU collection is mapped
 * `cascade="all-delete-orphan" inverse="true"` at [`model/entity/Product.cfc:L73`], so the legacy object-
 * relational layer would happily CASCADE-DELETE a product's SKUs, and NO validation rule blocks it. The
 * tension between a cascade that deletes children and a guard set that does not mention them is real legacy
 * behavior. It is recorded here; it is not resolved, and transaction and flush semantics are the concern of
 * the unit-of-work adapter rather than of this file.
 *
 * Reported as `validate.delete.Product.transactionExistsFlag.eq`.
 */
export const transactionExistsFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: false,
} as const) satisfies EqualityConstraint;

/**
 * The add-option context requires AT LEAST ONE UNUSED OPTION — gate 1 of the three collection floors.
 *
 * [`model/validation/Product.json:L13`] `"unusedProductOptions": [{"contexts":"addOption","minCollection":1}]`
 *
 * A product with no options left to add is not processable for `addOption`. Together with the base-type gate
 * at `:L4`, this is the whole of the `addOption` entity-pass validation — and, per P-2 in the module header,
 * the whole of that context's validation altogether, since the process object has no document of its own.
 *
 * =============================================================================================
 * THE ASYMMETRY THAT CATCHES PEOPLE: AN ABSENT VALUE PASSES, AN EMPTY COLLECTION FAILS
 * =============================================================================================
 * From `org/Hibachi/HibachiValidationService.cfc:L301-L307`, reproduced by `../Validator`:
 *   - absent or null            PASSES — an explicit short-circuit, so the gate does NOT fire
 *   - an EMPTY array            FAILS a floor of 1 — the gate fires and blocks the process
 *   - a non-empty array         PASSES
 *   - a struct                  measured by KEY COUNT, so a non-empty one passes
 *   - a non-null SIMPLE value   FAILS — it is neither array nor struct, so neither branch admits it
 *
 * This is the single most counter-intuitive row in the engine's null table, and it has a concrete
 * consequence for how a validation subject is assembled: presenting an unresolved collection as absent
 * SILENTLY DISABLES the gate, while presenting it as an empty array blocks the process. The two are not
 * interchangeable and the difference is not detectable from this file.
 *
 * VALUE RESOLUTION IS THE DOMAIN LAYER'S JOB. The legacy getter at [`model/entity/Product.cfc:L635-L640`]
 * memoises into the entity's own scope and delegates to the option service. The ported entity keeps that
 * member for exactly this gate's benefit; this rule only names the property. No memoisation happens here
 * (M7) and nothing is invoked.
 *
 * Reported as `validate.addOption.Product.unusedProductOptions.minCollection`.
 */
export const unusedProductOptionsMinCollectionConstraint = Object.freeze({
  constraintType: 'minCollection',
  constraintValue: 1,
} as const) satisfies MinCollectionConstraint;

/**
 * The add-option-group context requires AT LEAST ONE UNUSED OPTION GROUP — gate 2 of three.
 *
 * [`model/validation/Product.json:L14`]
 * `"unusedProductOptionGroups": [{"contexts":"addOptionGroup","minCollection":1}]`
 *
 * Semantics are identical to {@link unusedProductOptionsMinCollectionConstraint}; see that declaration for
 * the absence-versus-empty asymmetry. The legacy getter is at [`model/entity/Product.cfc:L642-L647`].
 *
 * This gate and the base-type gate at `:L4` are the two rules the `issue_1331` regression path traverses; the
 * regression fails on the base-type gate specifically, because the product it builds has no options at all
 * and so never reaches a meaningful collection state. See TRACEABLE LEGACY COVERAGE in the module header.
 *
 * Reported as `validate.addOptionGroup.Product.unusedProductOptionGroups.minCollection`.
 */
export const unusedProductOptionGroupsMinCollectionConstraint = Object.freeze({
  constraintType: 'minCollection',
  constraintValue: 1,
} as const) satisfies MinCollectionConstraint;

/**
 * The add-subscription-term context requires AT LEAST ONE UNUSED TERM — gate 3 of three.
 *
 * [`model/validation/Product.json:L15`]
 * `"unusedProductSubscriptionTerms": [{"contexts":"addSubscriptionTerm","minCollection":1}]`
 *
 * BOUNDARY NOTE — THIS GATE'S OUTCOME AGAINST A STUBBED COLLABORATOR (AAP 0.7.3 S8, guideline 6)
 * The legacy getter at [`model/entity/Product.cfc:L649-L654`] delegates to the SUBSCRIPTION SERVICE, and the
 * whole subscription family is out of scope under AAP 0.2.2.1. Where the ported value therefore resolves to
 * an EMPTY collection rather than to an absent one, the asymmetry recorded at
 * {@link unusedProductOptionsMinCollectionConstraint} applies with full force: an empty array FAILS a floor
 * of one, so this gate would then fail for every product and the `addSubscriptionTerm` context would never
 * be processable.
 *
 * That outcome is STATED, NOT RESOLVED, exactly as AAP 0.8.3.6 requires of an execution-model or boundary
 * mismatch. It must NOT be "fixed" from here: do not special-case the property, do not weaken the floor,
 * do not add an absence guard, and above all do NOT arrange for the value to be presented as absent in order
 * to make the gate pass — that would silently disable a live rule. The rule is transcribed exactly as the
 * document declares it, and the gap belongs to whoever assembles the subject.
 *
 * The gate is carried at all — rather than dropped along with the out-of-scope process object — because AAP
 * TR-5 forbids quietly dropping a member that crosses the scope boundary, and because the rule is part of
 * the in-scope document's observable behavior. See {@link baseProductTypeInListSubscription} for the same
 * reasoning applied to the context gate that accompanies it.
 *
 * Reported as `validate.addSubscriptionTerm.Product.unusedProductSubscriptionTerms.minCollection`.
 */
export const unusedProductSubscriptionTermsMinCollectionConstraint = Object.freeze({
  constraintType: 'minCollection',
  constraintValue: 1,
} as const) satisfies MinCollectionConstraint;

/**
 * `urlTitle` is REQUIRED on save — the first of two constraints flattened from one rule object.
 *
 * [`model/validation/Product.json:L16`] `{"contexts":"save","required":true,"unique":true}`
 *
 * Presence semantics are identical to {@link priceRequiredConstraint}; see that declaration.
 *
 * CONTEXT, AND EXPLICITLY NOT THIS FILE'S JOB: the save path assigns a unique URL title BEFORE validation
 * ever runs. AAP 0.4.2.1 records that the product save member derives one when none was supplied, using the
 * generator ported as `src/util/urlTitle.ts` — whose own first-collision suffix behavior AAP 0.4.1.11
 * documents. This file neither imports that utility nor generates anything: it declares that a value must be
 * present and distinct, and nothing more.
 *
 * NOTHING ELSE IS DECLARED ON THIS PROPERTY. No format pattern — the code pattern belongs to the three code
 * properties and `model/validation/Product.json` declares no format rule here. No maximum length:
 * [`model/entity/Product.cfc:L54`] carries no length attribute, and `maxLength` appears zero times in this
 * document. Both absences are recorded positively so that a reader comparing this
 * property with the code property above does not conclude a rule was forgotten.
 *
 * Reported as `validate.save.Product.urlTitle.required`.
 */
export const urlTitleRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `urlTitle` must be UNIQUE on save — the second of the document's two uniqueness rules, and the one the
 * sibling port's brief wrongly denies exists.
 *
 * [`model/validation/Product.json:L16`], [`model/entity/Product.cfc:L54`]
 *
 * SEE {@link productCodeUniqueConstraint} FOR THE COMPLETE X8 CORRECTION with all seven locators, for the
 * polarity pin, for the absence behavior the injected port must implement, for the self-exclusion no-op on
 * insert, and for why the application-side check is retained alongside the column metadata. That block is
 * the single authority for this file and is not repeated here.
 *
 * The two declarations are separate values rather than one shared constant because each carries its own
 * target resolver typed against this file's subject, and because the net-new suite must be able to assert
 * each property's uniqueness rule independently.
 *
 * Reported as `validate.save.Product.urlTitle.unique`.
 */
export const urlTitleUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: ProductValidationSubject): UniquePropertyEntity => subject,
} as const) satisfies UniqueConstraint<ProductValidationSubject>;

/* ==============================================================================================
 * SECTION 6 — THE TWO BASE-PRODUCT-TYPE RULE OBJECTS
 *
 * EXPORTED INDIVIDUALLY, AND THAT IS A REQUIREMENT RATHER THAN A CONVENIENCE.
 *
 * `baseProductType` is the ONLY property in this document carrying more than one rule object — the ten
 * others carry exactly one each — and its first rule is the one the traceable legacy regression
 * `issue_1331` asserts on. The net-new suite at `slatwall-ts/test/validation/rules.test.ts` must be able to
 * import that single gate and drive it in isolation, so it is exported as a named value here rather than
 * being inlined into the property validation below. Fold it into an opaque aggregate and a traceable legacy
 * test becomes unportable — see TRACEABLE LEGACY COVERAGE in the module header.
 *
 * A SINGLE-RULE-PER-PROPERTY MODEL WOULD BE UNREPRESENTABLE HERE. `model/validation/Product.json:L3-L6`
 * declares an ARRAY of two rule objects under one key, and the two differ in BOTH their context gate and
 * their list value. `../Validator` models a property's rules as an array for exactly this case.
 *
 * The two are declared in the document's own order — the option contexts first at `:L4`, the term context
 * second at `:L5` — which is the deterministic evaluation order described in the module header. Under any
 * one context at most one of them can match, since no context appears in both lists.
 * ============================================================================================ */

/**
 * The `Product.json:L4` gate: under either option context, the base product type must be merchandise.
 *
 * THE RULE OBJECT THE `issue_1331` REGRESSION EXERCISES. Its context list is the one two-element list in the
 * document, so this single rule serves both `addOptionGroup` and `addOption`. See
 * {@link baseProductTypeInListMerchandise} for the constraint's full semantics and for why its value is not
 * narrowed to a union.
 */
export const baseProductTypeMerchandiseRule = Object.freeze({
  contexts: ADD_OPTION_GROUP_OR_ADD_OPTION_CONTEXTS,
  constraints: Object.freeze([baseProductTypeInListMerchandise] as const),
} as const) satisfies ValidationRule<ProductValidationSubject>;

/**
 * The `Product.json:L5` gate: under the term context, the base product type must be subscription.
 *
 * See {@link baseProductTypeInListSubscription} for the constraint's semantics and for the boundary note on
 * the out-of-scope process object this context leads to.
 */
export const baseProductTypeSubscriptionRule = Object.freeze({
  contexts: ADD_SUBSCRIPTION_TERM_CONTEXT,
  constraints: Object.freeze([baseProductTypeInListSubscription] as const),
} as const) satisfies ValidationRule<ProductValidationSubject>;

/* ==============================================================================================
 * SECTION 7 — THE ELEVEN PROPERTY RULE SETS
 *
 * One per property key of the document, IN THE DOCUMENT'S OWN KEY ORDER, each pairing the error key with the
 * reader that gets the value and the rules that gate and constrain it.
 *
 * THE PROPERTY IDENTIFIER IS THE ERROR KEY. Every branch of the legacy reporter records a failure against the
 * full property identifier (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`), never against
 * the constraint that produced it. Two or three failures on one property therefore accumulate under ONE key,
 * which is why the error bag holds an array per key. The trailing-segment form derived at `:L208` shapes the
 * message text only and never replaces the key.
 *
 * EVERY READER IS A PURE, SYNCHRONOUS FIELD READ. Nothing here awaits, queries, formats, memoises or
 * mutates, and nothing reads the environment or a clock. `../Validator` requires a synchronous reader — a
 * promise would be measured instead of the value it wraps, silently failing every simple-value predicate — so
 * derived values arrive already resolved on the subject. See the subject contract for the full reasoning and
 * for why that division is also what the legacy engine saw.
 *
 * Parameter and return types are annotated explicitly rather than inferred, so each reader states its own
 * contract, and each returns the unknown top type because that is what the reader contract is: narrowing is
 * the evaluator's job, and every evaluator narrows before it reads.
 * ============================================================================================ */

/**
 * `baseProductType` — TWO context gates, the only multi-rule property in the document.
 *
 * See {@link baseProductTypeMerchandiseRule} and {@link baseProductTypeSubscriptionRule}. No presence rule is
 * declared on this property and none may be added: the list constraint already fails on an absent value.
 */
export const baseProductTypeValidation = Object.freeze({
  propertyIdentifier: BASE_PRODUCT_TYPE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.baseProductType,
  rules: Object.freeze([baseProductTypeMerchandiseRule, baseProductTypeSubscriptionRule] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `physicalCounts` — declared verbatim, INERT BY CONSTRUCTION. See
 * {@link physicalCountsMaxCollectionConstraint} for the full finding and the three prohibitions.
 *
 * The reader exists because the shape requires one, and it reads the name THE DOCUMENT declares rather than
 * the name the entity declares — which is the whole point. For any faithful product subject the engine's
 * existence gate answers false and this reader is NEVER INVOKED, exactly as the legacy evaluator is never
 * invoked for this rule. It is written as an honest read rather than as a hard-coded absent value so that the
 * behavior stays governed by the gate rather than by an assumption baked in here.
 */
export const physicalCountsValidation = Object.freeze({
  propertyIdentifier: PHYSICAL_COUNTS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.physicalCounts,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([physicalCountsMaxCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `price` — required AND numeric on save. X1: the easily-missed rule, and it carries NO numeric floor.
 *
 * ONE RULE OBJECT, TWO CONSTRAINTS, in the document's own key order: presence first, then type. Both share
 * this rule's single context gate, exactly as the legacy flattening copies the gate onto each constraint
 * record. See {@link priceRequiredConstraint} and {@link priceDataTypeConstraint}.
 */
export const priceValidation = Object.freeze({
  propertyIdentifier: PRICE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.price,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([priceRequiredConstraint, priceDataTypeConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/** `productName` — required on save. See {@link productNameRequiredConstraint}. */
export const productNameValidation = Object.freeze({
  propertyIdentifier: PRODUCT_NAME_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.productName,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([productNameRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `productCode` — the densest property in the document: ONE RULE OBJECT, THREE CONSTRAINTS.
 *
 * Declared in the document's own key order — presence, uniqueness, format — all three sharing the single save
 * context gate and all three reporting under the key `productCode`. Evaluation does not short-circuit, so
 * more than one can fail in the same pass; see the worked interaction at
 * {@link productCodeRequiredConstraint}.
 */
export const productCodeValidation = Object.freeze({
  propertyIdentifier: PRODUCT_CODE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.productCode,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([
        productCodeRequiredConstraint,
        productCodeUniqueConstraint,
        productCodeRegexConstraint,
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `productType` — required on save, and the SOLE enforcement of the relationship. See
 * {@link productTypeRequiredConstraint}.
 */
export const productTypeValidation = Object.freeze({
  propertyIdentifier: PRODUCT_TYPE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.productType,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([productTypeRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `transactionExistsFlag` — the document's one LIVE delete guard. See
 * {@link transactionExistsFlagEqualityConstraint}, which also carries X7: there is deliberately no SKU delete
 * guard anywhere in this file.
 */
export const transactionExistsFlagValidation = Object.freeze({
  propertyIdentifier: TRANSACTION_EXISTS_FLAG_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.transactionExistsFlag,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([transactionExistsFlagEqualityConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `unusedProductOptions` — the add-option collection floor. See
 * {@link unusedProductOptionsMinCollectionConstraint} for the absence-versus-empty asymmetry.
 */
export const unusedProductOptionsValidation = Object.freeze({
  propertyIdentifier: UNUSED_PRODUCT_OPTIONS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.unusedProductOptions,
  rules: Object.freeze([
    Object.freeze({
      contexts: ADD_OPTION_CONTEXT,
      constraints: Object.freeze([unusedProductOptionsMinCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `unusedProductOptionGroups` — the add-option-group collection floor. See
 * {@link unusedProductOptionGroupsMinCollectionConstraint}.
 */
export const unusedProductOptionGroupsValidation = Object.freeze({
  propertyIdentifier: UNUSED_PRODUCT_OPTION_GROUPS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.unusedProductOptionGroups,
  rules: Object.freeze([
    Object.freeze({
      contexts: ADD_OPTION_GROUP_CONTEXT,
      constraints: Object.freeze([unusedProductOptionGroupsMinCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `unusedProductSubscriptionTerms` — the add-subscription-term collection floor, carried across the scope
 * boundary under TR-5. See {@link unusedProductSubscriptionTermsMinCollectionConstraint} for the boundary
 * note, which is stated and deliberately not resolved.
 */
export const unusedProductSubscriptionTermsValidation = Object.freeze({
  propertyIdentifier: UNUSED_PRODUCT_SUBSCRIPTION_TERMS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.unusedProductSubscriptionTerms,
  rules: Object.freeze([
    Object.freeze({
      contexts: ADD_SUBSCRIPTION_TERM_CONTEXT,
      constraints: Object.freeze([unusedProductSubscriptionTermsMinCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `urlTitle` — required AND unique on save.
 *
 * ONE RULE OBJECT, TWO CONSTRAINTS, in the document's own key order: presence then uniqueness. Both share the
 * single save context gate and both report under the key `urlTitle`. See
 * {@link urlTitleRequiredConstraint} and {@link urlTitleUniqueConstraint}.
 */
export const urlTitleValidation = Object.freeze({
  propertyIdentifier: URL_TITLE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.urlTitle,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([urlTitleRequiredConstraint, urlTitleUniqueConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * The transliterated `model/validation/Product.json`, ready to be handed to `../Validator`.
 *
 * ELEVEN PROPERTIES, TWELVE RULE OBJECTS, SIXTEEN CONSTRAINTS — in the source document's key order, which is
 * also the deterministic evaluation order this port fixes. See the module header for the constraint table and
 * for why that determinism has no behavioral counterpart in the legacy engine.
 *
 * THE OPTIONAL CONDITIONS BLOCK IS OMITTED, NOT SET TO AN ABSENT VALUE. `model/validation/Product.json`
 * declares no conditions — the key occurs zero times in it, and only `model/validation/Product_UpdateSkus.json`
 * uses conditions at all — so the member is left out entirely. Under the compiler's
 * `exactOptionalPropertyTypes` setting an optional member may be omitted but may NOT be assigned an explicit
 * undefined, so omission is both the faithful transcription and the only form that compiles.
 *
 * USAGE: this value is PASSED AS AN ARGUMENT, never imported by the engine. The dependency edge runs one way
 * only — a rules file may reference `../Validator` for its types, and `../Validator` never references a rules
 * file — which is what keeps the graph acyclic. One document serves every context, because the legacy
 * documents select by context inside a single file rather than having one file per context: the same value
 * drives the save path, the delete path and all three process contexts.
 *
 * NOTHING IN THIS FILE INVOKES ANYTHING. It declares data. The caller is the service layer, the evaluator is
 * `../Validator`, and the uniqueness port is injected into that evaluator rather than reached from here.
 *
 * MODULE-SCOPE SAFETY UNDER M7. This value is safe as module-scope state for one reason, and it is worth
 * being explicit about it: it is FROZEN, IMMUTABLE, REQUEST-INDEPENDENT DECLARATIVE DATA WITH NO SIDE EFFECT
 * AT MODULE LOAD. It holds no connection, no request context, no resolved property value and no accumulated
 * error. Every nested array and rule object is frozen at its own declaration site, because freezing is
 * shallow. The error bag belongs to the evaluator and is created per evaluation, so a warm container cannot
 * carry one invocation's failures into the next.
 */
export const productValidationRuleSet = Object.freeze({
  properties: Object.freeze([
    baseProductTypeValidation,
    physicalCountsValidation,
    priceValidation,
    productNameValidation,
    productCodeValidation,
    productTypeValidation,
    transactionExistsFlagValidation,
    unusedProductOptionsValidation,
    unusedProductOptionGroupsValidation,
    unusedProductSubscriptionTermsValidation,
    urlTitleValidation,
  ] as const),
} as const) satisfies ValidationRuleSet<ProductValidationSubject>;
