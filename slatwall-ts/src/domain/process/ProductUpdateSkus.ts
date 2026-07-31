/**
 * ProductUpdateSkus — the typed input object for the legacy `updateSkus` process context.
 *
 * Ported from [model/process/Product_UpdateSkus.cfc], a 60-line file whose entire body is twelve
 * lines following a 48-line licence header: the component declaration at [:L49], one injected entity
 * at [:L51-L52], four data properties at [:L54-L58], and the closing brace at [:L60]. Two facts about
 * that body govern everything here.
 *
 * FACT ONE — THE COMPONENT DECLARES ZERO FUNCTIONS, so THIS MODULE DECLARES ZERO METHODS. A scan of
 * the file for a function declaration returns nothing at all. There is no behaviour to port because
 * the legacy component has none: it carries five values and does nothing with them. Every rule the
 * `updateSkus` context obeys lives somewhere else, and each of those places is named below, so a
 * reader who comes here looking for the missing logic learns where it went instead of concluding it
 * was lost.
 *
 * FACT TWO — NOT ONE OF THE FIVE PROPERTIES CARRIES A `type=` ATTRIBUTE. `property name="product";`,
 * `property name="updatePriceFlag";`, `property name="price" hb_rbKey="entity.sku.price";`,
 * `property name="updateListPriceFlag";` and
 * `property name="listPrice" hb_rbKey="entity.sku.listPrice";` are the complete declarations. Beyond
 * the two resource-bundle keys there is no `hb_`-prefixed attribute anywhere in the file, and no
 * `notNull`, no `fieldtype`, no `cfc` and no `persistent` either — every one of those was checked
 * against the file and every one is absent. CFML asked for no type and the component volunteered
 * none, so the five types below are RECOVERED FROM THE OBSERVED CONTRACT — the single consumer, the
 * component's own rules document, the validation engine that interprets it, and the framework code
 * that constructs and populates the object — rather than guessed. Each recovery is documented at the
 * field it produced.
 *
 * THE ODD ONE OUT OF THREE. The two structural twins in this folder, ProductAddOptionGroup.ts and
 * ProductAddOption.ts, port components that are identical line for line apart from a single property
 * name, and they are deliberately parallel to each other. This module follows the same skeleton, and
 * it should be read alongside them, but it diverges from both in exactly four ways — every one of
 * which is a fact about the source rather than a stylistic choice:
 *
 *   1. FIVE PROPERTIES, NOT TWO. One injected entity plus FOUR data properties, and the four are
 *      declared as two INTERLEAVED FLAG-AND-VALUE PAIRS rather than as two flags followed by two
 *      values. That interleaving is the source's own grouping and it is preserved.
 *   2. IT IS THE ONLY ONE OF THE THREE WITH A RULES DOCUMENT OF ITS OWN.
 *      `model/validation/Product_UpdateSkus.json` exists; there is no equivalent for either sibling
 *      context. See the dedicated block below, because the asymmetry is easy to misread as an
 *      omission in the siblings and is not one.
 *   3. TWO OF ITS PROPERTIES CARRY A RESOURCE-BUNDLE KEY. Those keys are the only `hb_`-prefixed
 *      metadata in any of the three legacy sources, they are carried VERBATIM as annotations on the
 *      fields that declare them, and they are deliberately not exported from this module.
 *   4. ITS SEMANTICS ARE CONDITIONAL, AND THE CONDITION TURNS ON ABSENCE. `price` and `listPrice` are
 *      required only while their paired flag is met, which is why the difference between a key that
 *      is ABSENT and a key that is present holding `undefined` cannot be collapsed here.
 *
 * The three legacy components nevertheless remain INDEPENDENT DECLARATIONS, and so do their ports:
 * nothing here imports, re-exports or derives from either sibling module, not by extension and not
 * through a mapped type, because the legacy components do not derive from each other either — they
 * are three separate files that happen to agree on their first property. Coupling them would
 * manufacture a relationship the source does not have and would make a future divergence in one
 * silently change the others.
 *
 * The legacy tree is REFERENCE-ONLY (AAP §0.4.1.1, TR-6 "Change no existing file"). Nothing under
 * `model/`, `org/`, `config/`, `integrationServices/`, `admin/` or `meta/` is modified, read at
 * runtime or bundled; those paths appear here exclusively as prose citations.
 *
 * SCOPE. AAP §0.4.1.4 states the whole mandate — CREATE from `model/process/Product_UpdateSkus.cfc`,
 * "The four data properties with their conditional semantics preserved for the validation rule set" —
 * and §0.2.1.4 makes this one of exactly three in-scope process objects, the rest of
 * `model/process/` being out of scope including the product-family siblings §0.2.2.4 excludes. TR-3
 * governs the shape: "Replace framework magic with declarations", so the population metadata this
 * component relied on reflectively at runtime is declared here instead. And per IR-8,
 * `extends="HibachiProcess"` at [:L49] resolves to the LOCAL Slatwall base
 * `model/process/HibachiProcess.cfc`, not the framework one — and that local file is an empty
 * passthrough, its [:L49-L51] being the component declaration and its closing brace with nothing
 * between them. THERE IS NO LOCAL BASE BEHAVIOUR TO PORT, which is why this module declares no base
 * type, extends nothing, and has no sibling base module.
 *
 * WHAT THIS MODULE IS NOT. It is PURE DECLARATION: no data access, no connection, no `Sw*` table in
 * any query-shaped string and no driver import (S2); no environment read, no file system and no
 * logging (S4); synchronous throughout, with no I/O to defer and therefore nothing to make deferred
 * (S6); and NO module-scope mutable binding of any kind, so loading it has no observable effect and
 * nothing can bleed between invocations on a warm container (M7 / S8, expanded below). It imports
 * nothing outside `src/domain/**`, so the hexagonal direction is visible in the import lines
 * themselves (S4). It also generates no identifier: primary keys in this schema are 32-character
 * identifiers minted by the persistence layer (IR-6), never by a domain module, and none of the five
 * members of this object is a primary key in the first place. And although its subject matter is
 * conditional validation, it pulls in no schema-validation library and adds no dependency: the
 * dependency set is closed (S5), the rules themselves belong to `src/validation/rules/**`, and this
 * module encodes not one of them at runtime.
 *
 * Standards citations use the AAP §0.7.3 identifiers S1-S9; the ones with teeth here are S1 (no
 * escape-hatch type, no cast used to silence the compiler, no suppression comment, no non-null
 * assertion), S2 and S4 (the negative obligations above), S3 (no locator, no synthesised member, no
 * string-keyed resolution, no decorator), S5 (no dependency added), S6 (satisfiable by the empty
 * object literal, so a test needs no harness, container or database), S7 (preserve and annotate — the
 * untyped, all-optional, defaultless, flag-conditional shape IS the contract, and tightening any part
 * of it would change what the rules layer observes), S8 (two mismatches are flagged rather than
 * solved) and S9 (nothing invented: no sixth member, no default, no third resource-bundle key, no
 * display metadata, no audit field, no branded numeric type, no narrowed literal union). `G6` marks a
 * technology-specific translation decision, which AAP §0.8.2 Guideline 6 requires to be documented
 * where it is made — and this file carries more of them than either sibling, by design.
 */

import type { ColumnPropertyDescriptor, PropertyDescriptorSet } from '../base/populate';
import type { Product } from '../product/Product';

/* =================================================================================================
 * G6 TRANSLATION DECISION — AN `interface`, NOT A `class`, AND THE REASON IS TECHNICAL
 * =================================================================================================
 * Guideline 6 requires every technology-specific judgment call to be documented, and this is the
 * first of them. Three arguments point the same way, and the third is decisive — and it is more
 * decisive here than in either sibling, because this is the one process object whose validation
 * genuinely turns on absence.
 *
 * 1. THERE IS NO BEHAVIOUR TO CARRY. The legacy component declares zero functions, so a `class`
 *    would have a body containing nothing but field declarations. §0.8.1 asks for "idiomatic,
 *    conventional TypeScript", and the idiomatic shape for a pure data carrier with no invariants
 *    and no methods is an interface.
 *
 * 2. THE PRODUCER CANNOT USE A CONSTRUCTOR. See the note on `product` below: the injected entity
 *    is assigned immediately AFTER construction, so the type has to be satisfiable with no
 *    arguments at all. An interface expresses that natively; a constructor would misdescribe it.
 *
 * 3. A CLASS FIELD WOULD DESTROY THE ABSENT-VERSUS-UNDEFINED DISTINCTION, AND IN THIS FILE THAT
 *    DISTINCTION IS THE WHOLE CONTRACT. This is a real emit hazard rather than a stylistic
 *    preference. `tsconfig.json` targets ES2022, which makes `useDefineForClassFields` true by
 *    default, so a declared-but-uninitialised field is emitted as a genuine `Object.defineProperty`
 *    with the value `undefined` — THE KEY WOULD EXIST ON EVERY INSTANCE. The legacy null
 *    representation is the opposite of that: [org/Hibachi/HibachiTransient.cfc:L196] routes a blank
 *    value to the private property helper with no value argument, and that helper at [:L806-L819]
 *    implements it as `structDelete(variables, arguments.name)` — NULL BY DELETION. Its TypeScript
 *    analogue is `delete target[name]`, whose whole point is that the key stops existing, and whose
 *    effect is observed with a presence test rather than an equality test, exactly as the legacy
 *    code used `structKeyExists`.
 *
 *    WHY THAT IS FATAL SPECIFICALLY HERE. An eagerly defined `undefined`-valued key would make the
 *    two flags of this object look PRESENT-BUT-NULL rather than ABSENT. As the absence block below
 *    sets out, the equality constraint that gates each price reads the flag and answers false when
 *    it is null — so a present-but-null flag and an absent flag happen to agree on that one
 *    comparison, but nothing guarantees they agree on the next one a rule author writes, and the
 *    population layer's own blank-value path distinguishes them absolutely. Emitting a key nobody
 *    ever set is a silent divergence in the one direction this module exists to protect.
 *
 *    An interface has no emit at all: it is erased completely, the runtime value is a plain object
 *    carrying only the keys actually assigned, and `'price' in candidate` and `delete
 *    candidate.price` behave precisely like the legacy `structKeyExists` and `structDelete` pair.
 *    (The sibling entity modules reach the same destination by a different road: they are classes
 *    because they DO carry behaviour, so they declare their optional fields with `declare` to
 *    suppress the same emit. Two shapes, one semantics.)
 *
 * ALL FIVE MEMBERS ARE THEREFORE OPTIONAL, and that is load-bearing twice over. It is how
 * "satisfiable with zero arguments" is expressed, so the empty object literal is a legal value of
 * this type. And because `exactOptionalPropertyTypes` is on, optional here means genuinely ABSENT: a
 * key present with the value `undefined` is rejected by the compiler rather than being quietly
 * accepted as an equivalent of omission. That is the type-level statement of null-by-deletion.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THE MEMBER NAMES ARE DERIVED FROM THE FRAMEWORK, NOT CHOSEN
 * =================================================================================================
 * `product` reads like an ordinary field name that a translator might improve — `productEntity`,
 * `target`, `owner`, `parent`, `subject`. It cannot be renamed, because it is not a name anybody
 * picked. It is a mechanical consequence of the producer.
 *
 * [org/Hibachi/HibachiEntity.cfc:L172-L182] is the only way an instance of this component ever
 * comes into existence. It resolves the transient by composing its bean name from the owning
 * entity's own class-name and the requested context at [L174], and then, at [L175], assigns the
 * owning entity into it through a SYNTHESISED SETTER CALL:
 *
 *     variables.processObjects[ arguments.context ].invokeMethod("set#getClassName()#", {1=this});
 *
 * For a `Product` that expression IS `setProduct(this)`. The property is called `product` because
 * the owning entity's class-name is `Product`, full stop. Renaming the field would break the
 * derivation, and with it the observable contract, while leaving the code compiling — which is
 * exactly the kind of silent divergence this port exists to avoid.
 *
 * The same holds for the four data property names, which are byte-exact against the source:
 * `product` from [model/process/Product_UpdateSkus.cfc:L52], `updatePriceFlag` from [:L55], `price`
 * from [:L56], `updateListPriceFlag` from [:L57] and `listPrice` from [:L58], camel casing included.
 * They are not merely labels either: each is the payload key the population loop looks for
 * [org/Hibachi/HibachiTransient.cfc:L185] and the property identifier the rules document names, so a
 * renamed member would silently match no payload key and no rule. The declaration ORDER of all five
 * is preserved because declaration order is population order (see the descriptor set at the foot of
 * this file), and the source's own interleaving of each flag with the value it gates is preserved
 * with it.
 *
 * THE SAME LINE FORBIDS A CONSTRUCTOR PARAMETER. [L175] is unconditional and runs immediately after
 * [L174] constructs the object, so the entity is assigned to an already-constructed instance. An
 * ordinary assignable optional field is therefore the faithful shape, and a required constructor
 * parameter would be a fabrication. This is not a dependency-injection concession either: `product`
 * is DATA that the framework pushes in, not a service collaborator, so post-construction assignment
 * leaves S3 untouched — no collaborator of any kind is resolved by this module. The happy side effect
 * is total testability (S6): an instance is an object literal, with no bootstrap, no bean factory,
 * no container and no database.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THE FOUR DATA PROPERTIES ARE `string | number`, AND SIX NARROWER TYPES
 * WERE REJECTED
 * =================================================================================================
 * This is the load-bearing judgment call of the file. The legacy declarations give no type at all,
 * so every one of the four is typed as the UNION OF THE SHAPES THE SYSTEM ACTUALLY DELIVERS. Two
 * shapes are inhabited, both demonstrably:
 *
 *   THE TRIMMED-STRING SHAPE IS REAL AND REACHABLE. Population BRANCH 1 assigns request data through
 *   the private property helper at [org/Hibachi/HibachiTransient.cfc:L207], and what it assigns is
 *   `trim(arguments.data[ currentProperty.name ])` — A TRIMMED STRING, never a converted number.
 *   (`trim` is applied twice on that path: once at [:L196] for the blank test and again at [:L207]
 *   for the value.) The admin form that submits this payload,
 *   `admin/views/entity/preprocessproduct_updateskus.cfm`, renders each flag with a yes/no field
 *   type and wraps each price in a display toggle keyed on that input, and an HTML control posts a
 *   string. So a flag arriving from a form is the STRING `'1'`.
 *
 *   THE NUMERIC SHAPE IS EQUALLY REAL, BUT IT ARRIVES BY A DIFFERENT MECHANISM. `model/validation/
 *   Product_UpdateSkus.json` states each condition as an equality against the NUMBER `1`, and the
 *   numeric data-type constraint accepts anything the engine's numeric test accepts, which includes
 *   numeric strings. The number itself is supplied by DIRECT ASSIGNMENT rather than by population:
 *   service code sets the property through the generated accessor, which — because the legacy
 *   declaration carries no type attribute — assigned whatever it was handed, with no conversion. The
 *   consumer at [model/service/ProductService.cfc:L223] then hands `price` straight to a SKU price
 *   setter, again untouched.
 *
 *   ⚠️ THE TWO SHAPES ARE SEPARATED BY MECHANISM, NOT BY PAYLOAD TYPE — a distinction worth stating
 *   precisely, because it is easy to assume a numeric payload stays numeric. It does not. CFML is
 *   dynamically typed, so `trim(100)` yields the STRING `'100'`, and population applies `trim` to
 *   whatever it receives. A NUMERIC payload travelling the population path therefore arrives as a
 *   STRING too. The population path can only ever produce the string arm; the number arm is inhabited
 *   solely by direct assignment. Both are reachable, which is precisely why neither may be dropped.
 *
 * CFML NEVER HAD TO CHOOSE, WHICH IS WHY THE SOURCE RECORDS NO TYPE. Its `==` is loose, so the two
 * shapes were indistinguishable at every comparison the legacy code performs. TypeScript does have
 * to choose, and the honest choice is to admit both rather than to pick one and lose the other. That
 * is exactly what S7 requires: preserve and annotate.
 *
 * SIX ALTERNATIVES, EACH REJECTED FOR A STATED REASON:
 *
 *   `boolean` for the flags — WRONG. Nothing in the legacy ever stores a true/false value in either
 *     flag. The flag is compared for equality with a numeric literal, and the form posts a numeric
 *     string. Typing it boolean would invent a shape no producer in the system emits and would force
 *     the rules layer to fabricate a coercion (S9).
 *   A two-literal union for the flags — WRONG, and an invented constraint. The equality constraint
 *     merely tests the flag against one value; any OTHER value simply leaves the condition unmet,
 *     which is legal, reachable and meaningful — an unmet condition is how the paired price escapes
 *     validation entirely. Narrowing to two literals would reject inputs the legacy accepts (S7, and
 *     §0.8.2 Guideline 2).
 *   Bare `number` for the flags or the prices — WRONG. It erases the form-posted string shape and
 *     thereby re-creates precisely the silent failure described in the next block.
 *   Bare `string` — WRONG in the other direction. It erases the programmatic numeric shape and would
 *     break service code assigning a computed price.
 *   `unknown` — WRONG. It would push the entire decision downstream and defeat the purpose of typing
 *     the contract at all.
 *   A branded or nominal price type — WRONG, and invented (S9). Nothing in the source distinguishes
 *     these values nominally, and no format, range or precision guard is attached to them either;
 *     the minimum-value and numeric rules that DO exist belong to the SKU rule set, not to this
 *     input object.
 *
 * ⚠️ THE UNION IS NOT TO BE "IMPROVED" AWAY. It is the honest expression of an untyped legacy
 * property whose two inhabited shapes were made invisible by CFML's coercion rules. Surfacing them is
 * the point (S7, S8, Guideline 6). Nor is any conversion performed here: population assigned the
 * trimmed string verbatim and left conversion to the ORM at flush time, so the equivalent conversion
 * belongs to `src/adapters/mysql/rowMappers.ts`, and this module — like the descriptor set at the
 * foot of it, which declares these properties as carrying no ORM type to convert towards — states
 * only what the source states.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THE FLAGS ARRIVE AS A STRING AND ARE COMPARED AGAINST A NUMBER
 * =================================================================================================
 * This is the subtlest hazard in the file, and it is the reason the union above must not be
 * collapsed. The chain has four verified links:
 *
 *   1. The admin form renders both flags with a yes/no field type, so an HTTP request carries the
 *      character `1`, not the integer.
 *   2. Population assigns the TRIMMED STRING [org/Hibachi/HibachiTransient.cfc:L207], so the value
 *      the object holds after a form submission is the string `'1'`.
 *   3. `model/validation/Product_UpdateSkus.json` writes each condition as an equality against the
 *      NUMBER `1`.
 *   4. The equality constraint at [org/Hibachi/HibachiValidationService.cfc:L385-L395] compares with
 *      CFML's `==` at [:L391] — an operator that is BOTH LOOSE AND CASE-INSENSITIVE. Under it the
 *      string form and the numeric form of the same digit compare EQUAL, so the legacy system never
 *      noticed the discrepancy. (The engine widens the gap further and hides it just as effectively:
 *      that function declares its constraint argument as a STRING, so the numeric literal from the
 *      document is coerced to text before the comparison even happens.)
 *
 * ⚠️ THE FAILURE MODE THIS PREVENTS. A port that typed the flags as a number and then had the rules
 * layer compare them with strict equality against the numeric literal would NEVER FIRE on form
 * input: the runtime value is a string, strict equality across types is false, the condition would be
 * permanently unmet, and both prices would silently go unvalidated. No compile error, no runtime
 * error, no test failure unless somebody wrote the test for exactly this — precisely the kind of
 * silent drift this migration exists to expose.
 *
 * WHAT THIS MODULE DOES ABOUT IT, AND WHAT IT DELIBERATELY DOES NOT. It makes the discrepancy VISIBLE
 * IN THE TYPE — a reader of `updatePriceFlag?: string | number` cannot write a strict numeric
 * comparison without the compiler reminding them the string arm exists — and it documents the chain
 * here. It does NOT resolve the comparison semantics, because that is not this layer's decision: the
 * condition evaluation belongs to `src/validation/rules/productUpdateSkus.rules.ts` and the
 * consumer's own flag test belongs to `src/services/ProductService.ts`. Deciding it here would mean
 * either coercing on assignment or narrowing the type, and both would hide the very thing that needs
 * to be seen.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — ABSENCE IS BEHAVIOUR: AN ABSENT FLAG LEAVES ITS PRICE UNVALIDATED
 * =================================================================================================
 * `model/validation/Product_UpdateSkus.json` is fourteen lines and its shape matters more than its
 * size. It declares two CONDITIONS, each testing exactly one flag for equality with a single value,
 * and then attaches to each price a single rule GATED ON ITS OWN CONDITION — required, and numeric
 * when present. Neither flag carries a rule of its own; each appears only as a condition input.
 *
 * FOUR ENGINE BEHAVIOURS CHAIN TOGETHER TO MAKE ABSENCE MEANINGFUL, and all four were read from
 * source rather than assumed:
 *
 *   1. CONDITION EVALUATION [org/Hibachi/HibachiValidationService.cfc:L97-L131]. The `conditions`
 *      value is treated as a LIST [:L100], so one rule may name several; a condition name the
 *      metadata does not define is silently SKIPPED [:L108]; constraints within a single condition
 *      are ANDed [:L110-L121], starting from a true flag that any failure falsifies; conditions are
 *      ORed across each other, returning on the first fully-met one [:L124-L126]; and the default
 *      when nothing is met is FALSE [:L130]. Each condition in this document names one property with
 *      one constraint, so each reduces to a single equality test on its flag.
 *   2. THE EQUALITY CONSTRAINT RETURNS FALSE FOR AN UNSET PROPERTY [:L385-L395]. It resolves the
 *      value and requires it to be non-null before comparing, so AN ABSENT FLAG LEAVES ITS CONDITION
 *      UNMET.
 *   3. THEREFORE AN ABSENT FLAG SWITCHES OFF ITS PRICE'S RULE ENTIRELY. Not merely "the price is not
 *      required" — the price is not validated at all, because the same gate carries both the required
 *      constraint and the numeric one.
 *   4. THE NUMERIC CONSTRAINT ITSELF PASSES ON NULL [:L256-L266]: its test is
 *      `if(isNull(propertyValue) || isValid(...))`. So a numeric data type means "if present, must be
 *      numeric" — which is exactly optional-property semantics, expressed in the engine.
 *
 * ⚠️ WHAT THAT MANDATES FOR THIS FILE. All four data properties are genuinely OPTIONAL and frequently
 * ABSENT, and they are declared with `?` rather than as a union with `undefined`. Under
 * `exactOptionalPropertyTypes` those two spellings are DIFFERENT TYPES and the difference is the
 * behaviour above: `delete candidate.price` stays legal, and an explicit `{ price: undefined }` is
 * REJECTED by the compiler instead of being quietly treated as equivalent to omission. Collapsing
 * them would erase the distinction the whole rules document is built on.
 *
 * ONE FURTHER ENGINE FACT, RECORDED SO NOBODY LATER SIMPLIFIES THE OPTIONALITY AWAY. The required
 * constraint [:L240-L245] tests a simple value with `len(trim(...))`, so an empty string FAILS while
 * a zero PASSES — the trimmed zero has length one. A JavaScript falsiness test would therefore
 * wrongly reject a legitimate price of zero. That test is not this module's to write; it is noted
 * here because it is the second reason a reader must not "tidy" these fields into something that
 * treats empty and zero alike.
 *
 * OWNERSHIP, STATED PLAINLY. The rules document is ported by
 * `src/validation/rules/productUpdateSkus.rules.ts` (AAP §0.4.1.5). This module neither implements it
 * nor imports from `src/validation/**` — the hexagonal direction forbids the import (S4) and the
 * ownership boundary forbids the duplication. Nothing here encodes a condition, a required marker, a
 * data-type marker or a rule array at runtime. The document is quoted above as CONTEXT ONLY, so that
 * a reader can see why the shape below is what it is.
 * ============================================================================================== */

/* =================================================================================================
 * G6 AMBIGUITY, FLAGGED AND DELIBERATELY NOT RESOLVED (S8)
 * =================================================================================================
 * The consumer tests each flag with a BARE truth test:
 * [model/service/ProductService.cfc:L222] `if(arguments.processObject.getUpdatePriceFlag())` and
 * [:L226] the identical form for the list-price flag. With the property unset the generated accessor
 * returns null, and CFML's behaviour for a null condition expression is ENGINE-DEPENDENT — Railo and
 * Lucee do not agree with Adobe ColdFusion on it. The unset case is genuinely reachable, because
 * nothing in `model/validation/Product_UpdateSkus.json` makes either flag required; as the block
 * above shows, an absent flag is not a validation failure but simply an unmet condition.
 *
 * Per S8 and prompt requirement §0.8.3.6 — "Flag, rather than silently resolve, any case where a
 * CFML method's execution model doesn't map cleanly" — this is RECORDED AND LEFT OPEN. No default is
 * added, the type is not narrowed to exclude absence, and no engine's semantics is adopted on the
 * legacy system's behalf. Choosing one here would bake a guess into the data contract, where it would
 * be invisible to the layer that actually performs the test.
 *
 * It is worth being precise about what kind of finding this is: a LANGUAGE-SEMANTICS gap, not a coding
 * defect. It is therefore not an entry in the AAP §0.6.7 register — which is CLOSED at its existing
 * entries and gains no new one from this file — and it carries a plain explanatory comment rather than
 * the plan's parity annotation. This module owns no register entry at all.
 * ============================================================================================== */

/* =================================================================================================
 * G6 PARITY NOTE — TWO CONSUMER FACTS THAT BELONG TO THE SERVICE LAYER, STATED HERE FOR ACCURACY
 * =================================================================================================
 * The sole consumer is `processProduct_updateSkus` at [model/service/ProductService.cfc:L216-L233],
 * and AAP §0.4.2.1 marks it "Fully ported" rather than boundary-stubbed — unlike five of that
 * service's fifteen members. So this input object sits on a live path and its typing has real
 * consequences. Two peculiarities of that consumer are recorded here because a reader comparing the
 * three process-object modules will look for them, and because assuming symmetry that has not been
 * verified is how a port goes quietly wrong. NEITHER IS IMPLEMENTED HERE.
 *
 *   1. THE LOOP COUNTER LEAKS. [:L220] writes `for(i=1; i <= arrayLen(skus); i++)` with no `var`, so
 *      in CFML the counter lands in the component's own shared scope. Because services are
 *      SINGLETONS — only entities, process objects, transients and reports are registered as
 *      transients at [org/Hibachi/Hibachi.cfc:L289-L292] — that counter is shared across concurrent
 *      requests. This is the SECOND of exactly two sites in the product process methods; the first is
 *      [:L118] in `processProduct_addOptionGroup`. It is NOT present in `processProduct_addOption`,
 *      whose two counters at [:L140] and [:L142] are both correctly declared with `var`. The defect
 *      belongs to `src/services/ProductService.ts` (AAP §0.4.1.8) and is that module's to carry: this
 *      module neither reproduces it, claims it, nor marks it.
 *   2. THIS METHOD UNIQUELY DOES NOT CHAIN ONWARD. Both siblings finish by re-entering the process
 *      dispatcher for the default-image-filename context — `processProduct_addOptionGroup` at [:L123]
 *      and `processProduct_addOption` at [:L152]. `processProduct_updateSkus` does not: it returns the
 *      product directly at [:L232]. That is an asymmetry in the consumers, and it is stated because a
 *      reader who assumed the parallel would look for a chain here and find none.
 *
 * Both are differences in the CONSUMER rather than in this input object. Stating them keeps the three
 * parallel modules diffable without a reader concluding that a missing note is an oversight or that a
 * copied note is a fact.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THIS IS THE ONLY ONE OF THE THREE PROCESS OBJECTS WITH ITS OWN RULES
 * DOCUMENT, AND THE ASYMMETRY IS NOT AN OMISSION IN THE OTHER TWO
 * =================================================================================================
 * Stated here because it is easy to misread from either direction, and because the AAP flags it in
 * §0.2.1.5 as "a subtlety that must not be mistaken for an omission".
 *
 * `model/validation/Product_UpdateSkus.json` EXISTS. There is no `Product_AddOptionGroup.json` and no
 * `Product_AddOption.json`: a directory listing filtered for the add-option contexts matches nothing,
 * and the complete product-family set is `Product.json`, `ProductImage.json`, `ProductReview.json`,
 * `ProductType.json`, `Product_AddSubscriptionTerm.json`, `Product_UpdateSkus.json` and
 * `Product_UploadDefaultImage.json`. So the legacy authors wrote a dedicated document exactly once
 * across the three in-scope contexts, and they wrote it for THIS one.
 *
 * THE OTHER TWO CONTEXTS ARE STILL VALIDATED — by CONTEXT-SCOPED RULES DECLARED INSIDE
 * `model/validation/Product.json`, keyed by PRODUCT's own property names rather than by any property
 * of a process object: a base-type rule scoped to both add-option contexts, and two
 * minimum-collection rules requiring the product to have at least one unused option group or option
 * respectively. Those rules constrain the PRODUCT, so they belong to the product rule set, which is
 * where a reader should look for them.
 *
 * THREE THINGS FOLLOW FOR THIS MODULE. The document that does exist is quoted in the absence block
 * above as context only and is ported by `src/validation/rules/productUpdateSkus.rules.ts`, not here
 * (§0.4.1.5, and folder convention: validation JSON is comment-only in this folder). This module
 * imports nothing from `src/validation/**` (S4). And the shape declared below is designed so that
 * every rule in that document remains faithfully expressible against it — which is the whole of this
 * module's obligation to the rules layer, and the reason the four data properties are optional rather
 * than merely nullable.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THE TRANSIENT LIFECYCLE, AND WHY NOTHING HERE IS MEMOISED (S8 / M7)
 * =================================================================================================
 * [org/Hibachi/Hibachi.cfc:L289-L292] configures the legacy container:
 *
 *     var coreBF = new DI1.ioc("/#variables.framework.applicationKey#/model", {
 *       transients=["entity", "process", "transient", "report"],
 *       transientPattern="Bean$"
 *     });
 *
 * `"process"` is in that list, so process objects — like entities, and unlike services and DAOs —
 * are TRANSIENTS: a fresh instance per resolution. This module honours that literally. Its exported
 * value is frozen and stateless, it holds no instance registry, and constructing an instance is
 * allocating an object literal. There is no module-scope `let`, no map, no set, no weak map and no
 * memoised table of any kind, so importing this module is observably inert.
 *
 * THE MISMATCH, FLAGGED RATHER THAN SOLVED. The legacy producer MEMOISES:
 * [org/Hibachi/HibachiEntity.cfc:L173] only builds the object when the owning entity has no cached one
 * for that context, [:L181] returns the cached instance, and [:L199-L201] exists solely so a caller
 * can evict it. That cache lives on the OWNING ENTITY, keyed by context — it is the entity's state,
 * not this type's — and in a stateless single-invocation execution model it has no equivalent (M7):
 * nothing survives between invocations except module scope, and per-request state held in module scope
 * on a warm container leaks across invocations and therefore across tenants. So the memoisation is
 * deliberately NOT reproduced here, in any form, and the decision is recorded rather than resolved: if
 * a caller needs the same instance twice it must hold the reference itself, which is what the entity
 * did. Reproducing the cache in this module would be strictly worse than the legacy behaviour, because
 * the legacy cache was at least per-entity and per-request.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THE POST-CONSTRUCTION DEFAULTS HOOK IS A NO-OP HERE, SO NOTHING IS
 * DEFAULTED (CONTRAST PROOF 1)
 * =================================================================================================
 * [org/Hibachi/HibachiEntity.cfc:L179] invokes a defaults hook on the freshly built process object,
 * immediately after the entity injection at [:L175]. It would be entirely reasonable to assume that
 * hook seeds a price; for this component it does not. The hook is declared at
 * [org/Hibachi/HibachiProcess.cfc:L10-L12] with an empty body whose entire content is the comment
 * "Left Blank To Be Done By Each Process Object", and the only two overrides anywhere under `model/`
 * are [model/process/Order_AddOrderPayment.cfc:L81] and [model/process/Order_CreateReturn.cfc:L64],
 * both in the out-of-scope order domain. `Product_UpdateSkus.cfc` does not override it — it declares
 * no function at all.
 *
 * ⚠️ THE CONTRAST IS THE PROOF, AND IT IS UNUSUALLY DIRECT HERE. The EXCLUDED
 * [model/process/Product_AddSubscriptionTerm.cfc] — out of scope per AAP §0.2.2.4 — DOES declare lazy
 * product-derived defaults, and it declares them for a property of exactly this name, in the shape
 * "if the value has not been set, read it from the product". `Product_UpdateSkus.cfc` sits in the same
 * directory, was written by the same authors, and pointedly does not. So NO FALLBACK DEFAULT IS
 * INVENTED for `price` or `listPrice` — not from the product, not from its default SKU, not from
 * anywhere (S9). A freshly produced instance carries the injected `product` and nothing else, and all
 * four data properties stay ABSENT until a payload supplies them. That is not an oversight in the
 * port; it is the observable behaviour, and inventing a default would silently make prices valid that
 * the legacy system would have left unvalidated.
 *
 * THE SAME REASONING EXCLUDES THE FRAMEWORK'S OWN PROCESS-OBJECT MEMBERS. The base component at
 * [org/Hibachi/HibachiProcess.cfc:L3-L4] declares two flag properties with lazy readers at [:L14-L26]
 * and a type predicate at [:L6-L8]. None is ported: nothing outside `org/Hibachi/` consumes the
 * population flag or the predicate, the display flag's only consumer is an out-of-scope order process
 * object, and AAP §0.8.3.2 forbids carrying framework code forward in any case. Nor are the four audit
 * members ported — those belong to persistent entities, and a transient has none.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — NO PRESENTATION METADATA IS ADDED (CONTRAST PROOF 2)
 * =================================================================================================
 * The yes/no field type on the two flags, cited above as evidence about the SHAPE OF POSTED VALUES,
 * is supplied by the admin view — not by any attribute on any property of this component. The
 * component declares exactly two `hb_`-prefixed attributes and both are resource-bundle keys; there is
 * no form-field-type attribute anywhere in the file.
 *
 * ⚠️ AGAIN THE CONTRAST IS THE PROOF. The EXCLUDED [model/process/Product_UploadDefaultImage.cfc] —
 * out of scope per AAP §0.2.2.4 — DOES carry a form-field-type attribute together with accepted MIME
 * types and extensions. The authors declared presentation metadata on a property when they wanted it.
 * They did not here.
 *
 * SO NO FIELD TYPE, WIDGET, CONTROL, LABEL, PLACEHOLDER, ORDERING WEIGHT OR OTHER PRESENTATION HINT IS
 * ATTACHED TO ANY MEMBER BELOW, AND NONE APPEARS IN THE DESCRIPTOR SET (S9). There is no user
 * interface in scope at all (AAP §0.3.4): the target is a headless service, and `admin/`, `frontend/`
 * and `public/` are out of scope, so the admin view is read here purely as evidence and is never
 * ported, imported or reproduced.
 * ============================================================================================== */

/**
 * The declared property names of {@link ProductUpdateSkus}, in source declaration order.
 *
 * Matching the sibling domain modules, the names are a UNION OF LITERALS rather than a bare `string`.
 * That is what makes the descriptor set at the foot of this file typo-proof: a descriptor naming a
 * property this type does not declare is a compile error rather than an entry that silently matches
 * nothing at runtime, which is precisely the failure mode the legacy metadata walk could not detect.
 *
 * All five names are byte-exact against the source — `product` from
 * [model/process/Product_UpdateSkus.cfc:L52], `updatePriceFlag` from [:L55], `price` from [:L56],
 * `updateListPriceFlag` from [:L57] and `listPrice` from [:L58] — including their camel casing, and
 * the union lists them in the order the file declares them: THE INJECTED ENTITY FIRST, THEN EACH FLAG
 * IMMEDIATELY FOLLOWED BY THE VALUE IT GATES. The source interleaves the two pairs rather than
 * grouping both flags together, and that grouping is preserved rather than tidied, because declaration
 * order is population order.
 */
export type ProductUpdateSkusPropertyName =
  'product' | 'updatePriceFlag' | 'price' | 'updateListPriceFlag' | 'listPrice';

/**
 * The input object for the `updateSkus` process context — a product, plus a flag-and-value pair for
 * each of the two prices that may be applied across every one of its SKUs.
 *
 * A PURE CARRIER, BY FIDELITY. Five optional members, zero methods, no defaults, no invariants and no
 * validation, because the legacy component at [model/process/Product_UpdateSkus.cfc:L49-L60] is
 * exactly that and nothing more. The reasoning behind the shape — why an interface rather than a
 * class, why the members are named and ordered as they are, why the four data properties admit both a
 * string and a number, why absence is load-bearing, and why nothing is memoised or defaulted — is
 * documented in the decision blocks above.
 *
 * THE FLAG-AND-VALUE PAIRING IS PRESERVED, NOT HARMONISED. It would be tempting to model each pair as
 * one nullable price and let presence stand in for the flag, and it would be wrong twice over: the
 * rules document names the flag and the price as SEPARATE property identifiers, and the consumer reads
 * them separately too, so collapsing them would leave the conditions unexpressible and would invent a
 * meaning for a present price with an absent flag that the legacy system does not have (S7).
 *
 * IT DELIBERATELY DOES NOT MODEL THE SKUS. The consumer at
 * [model/service/ProductService.cfc:L218-L230] reads the product's SKUs and applies each price to
 * every one of them; how it iterates, and the loop-scoping fact recorded in the parity note above,
 * belong to `src/services/ProductService.ts`. What matters here is the negative design obligation:
 * this type stays a FLAT FIVE-MEMBER CARRIER, with no SKU collection, no default-SKU member and no
 * derived summary of what would change, so that nothing about the input presumes any particular
 * application semantics. Adding such a member would silently take a decision that is not this layer's
 * to take.
 *
 * @example
 * ```ts
 * // Satisfiable with no arguments at all — the producer at
 * // [org/Hibachi/HibachiEntity.cfc:L174-L175] constructs first and assigns second.
 * const processObject: ProductUpdateSkus = {};
 * processObject.product = product;
 *
 * // A form submission delivers the trimmed string form; service code assigns numbers. Both are
 * // legal, and that is the point of the union.
 * processObject.updatePriceFlag = '1';
 * processObject.price = '19.99';
 * processObject.updateListPriceFlag = submittedListPriceFlag;
 * processObject.listPrice = computedListPrice;
 *
 * // Null by deletion, as the legacy `structDelete` did — the key stops existing, so a presence test
 * // answers false and the paired condition is left unmet. Assigning `undefined` instead is rejected
 * // by the compiler.
 * delete processObject.listPrice;
 * delete processObject.updateListPriceFlag;
 * ```
 */
export interface ProductUpdateSkus {
  /*
   * Injected Entity — the grouping comment at [model/process/Product_UpdateSkus.cfc:L51], reproduced
   * because it records the framework's own distinction between the entity the producer pushes in and
   * the data a request payload supplies.
   */

  /**
   * The product whose SKUs are being repriced.
   *
   * Assigned by the producer at [org/Hibachi/HibachiEntity.cfc:L175] through the synthesised
   * `setProduct(this)` call, which is why the member is named `product` and why it is an ordinary
   * optional field rather than a constructor parameter. The real sibling type is imported rather than
   * restated: a locally declared structural stand-in would drift from `Product` silently, and the
   * type-only import keeps the reference free of any runtime edge.
   *
   * Optional because the object exists, however briefly, before [L175] runs — and because the legacy
   * component states no obligation for it to be present.
   */
  product?: Product;

  /*
   * Data Properties — the grouping comment at [model/process/Product_UpdateSkus.cfc:L54]. The four
   * that follow are declared in the source as two interleaved flag-and-value pairs, and that order is
   * preserved exactly.
   */

  /**
   * Whether the price should be applied to every SKU of the product.
   *
   * `string | number` because both shapes are inhabited: population assigns the TRIMMED STRING from
   * request data [org/Hibachi/HibachiTransient.cfc:L207] and the admin control posts the character
   * form, while the rules document states its condition against the numeric form and programmatic
   * callers pass numbers. It is NOT a boolean and NOT a two-literal union — see the type-mandate block
   * above for why each of those, and four others, was rejected.
   *
   * Optional, and frequently ABSENT. An absent flag leaves its condition unmet
   * [org/Hibachi/HibachiValidationService.cfc:L385-L395], which switches off the paired price's rule
   * entirely rather than merely making it un-required. No default is supplied, and a blank incoming
   * value deletes the key rather than storing an empty string ([:L196] and [:L806-L819] of
   * `HibachiTransient`), because this property declares no `notNull` attribute.
   */
  updatePriceFlag?: string | number;

  /**
   * The price to apply to every SKU of the product, when its flag is met.
   *
   * RESOURCE-BUNDLE KEY, CARRIED VERBATIM: `entity.sku.price`, declared on this property at
   * [model/process/Product_UpdateSkus.cfc:L56]. It is an IDENTIFIER, not display text — it is looked
   * up, never shown — so it is neither translated into a human-readable label nor paraphrased. It is
   * recorded here, on the property that declares it, and it is deliberately NOT exported from this
   * module in any form: the exported form belongs to
   * `src/validation/rules/productUpdateSkus.rules.ts`, which is the module whose two conditional
   * groups key off the flags, and duplicating it here would leave two folders claiming ownership of
   * the same constant.
   *
   * `string | number` for the reasons given on the flag above and in the type-mandate block. No
   * numeric guard, minimum, precision or currency type is attached: none exists on this property in
   * the source, and the numeric and minimum-value rules that DO exist belong to the SKU rule set
   * (S9). Note in particular that a price of zero is a legitimate value the legacy required-constraint
   * accepts [org/Hibachi/HibachiValidationService.cfc:L240-L245], so no falsiness test may stand in
   * for a presence test on this member.
   *
   * Optional, and left ABSENT rather than defaulted — see Contrast Proof 1 above, where the excluded
   * subscription-term process object supplies a product-derived default for a property of this very
   * name and this component pointedly does not.
   */
  price?: string | number;

  /**
   * Whether the list price should be applied to every SKU of the product.
   *
   * The second flag, declared at [model/process/Product_UpdateSkus.cfc:L57] and gating its own
   * condition independently of the first. Same type, same optionality and same absence semantics as
   * `updatePriceFlag`: the two conditions are ORed only in the sense that the engine evaluates each
   * rule's own condition list, so one flag being met has no effect whatsoever on the other price's
   * rule.
   */
  updateListPriceFlag?: string | number;

  /**
   * The list price to apply to every SKU of the product, when its flag is met.
   *
   * RESOURCE-BUNDLE KEY, CARRIED VERBATIM: `entity.sku.listPrice`, declared on this property at
   * [model/process/Product_UpdateSkus.cfc:L58]. As with the key on `price`, it is an identifier rather
   * than display text, it is not translated or paraphrased, and it is not exported from this module —
   * only annotated on the property that declares it.
   *
   * `string | number`, optional, no default, no numeric guard: identical treatment to `price`, and for
   * identical reasons. The consumer reads it only inside its own flag's branch
   * [model/service/ProductService.cfc:L226-L228].
   */
  listPrice?: string | number;
}

/*
 * The five declared properties, in source declaration order, as column descriptors.
 *
 * WHY ALL FIVE ARE COLUMNS. The population branch that claims a property is gated at
 * [org/Hibachi/HibachiTransient.cfc:L193] on `!structKeyExists(currentProperty, "fieldType") ||
 * currentProperty.fieldType == "column"`. Not one of the five properties declares a `fieldtype`
 * attribute — nor a `cfc` attribute, which the relationship branches also require — so all five take
 * the column branch, which is why {@link ColumnPropertyDescriptor} is the descriptor shape and why its
 * `kind` is pinned to the column literal. The `kind` MEMBER is omitted from each entry for exactly
 * that reason: an ABSENT `fieldtype` and an explicit `fieldtype="column"` are equivalent in the
 * source, so omission is the more faithful of the two renderings, and the type already records the
 * kind. Note the consequence for `product`, recorded rather than smoothed over: the legacy gate would
 * accept a SIMPLE value straight into the injected-entity slot.
 *
 * WHY EVERY VALUE TYPE IS DECLARED AS CARRYING NONE. `valueType` is a REQUIRED member — deliberately,
 * so that an author cannot omit it and silently reinstate a stringification defect — and the honest
 * declaration for a property whose legacy source declares no ORM type is the one that says so. Not one
 * of these five declares a `type=` attribute, verified by scanning the file, so there is nothing to
 * convert towards and none is invented (S9). This is a POSITIVE STATEMENT that no conversion is owed,
 * not an absence of thought, and it is the same declaration both sibling process modules make.
 *
 * ⚠️ AND THAT IS NOT IN TENSION WITH THE FIELD TYPES ABOVE, though the pairing invites the question:
 * why do the four data properties read as a string-or-number union while every entry here declares no
 * value type at all? Because the two members answer DIFFERENT QUESTIONS. `valueType` describes what
 * the LEGACY DECLARATION said — and it said nothing, so the faithful record is that it said nothing.
 * The TypeScript field type describes which SHAPES ARE ACTUALLY INHABITED at run time, which is a
 * question the legacy declaration never answered and which had to be settled from the producers
 * instead. Declaring a concrete value type here to "match" the union would be the invented conversion
 * the required member exists to prevent; narrowing the union to match this member would erase a shape
 * the system really delivers. Both stay as they are, and the divergence is the honest one.
 *
 * This also explains the one legitimate divergence from the sibling modules, whose corresponding
 * properties are typed as plain strings while these four are not: their two data properties hold
 * IDENTIFIERS, for which only the string shape is ever inhabited, so a union would be invented there.
 * These four hold a numeric flag and a price, for which both shapes are inhabited — so the union is
 * required here and forbidden there, from the same rule applied to different evidence. The descriptor
 * member, by contrast, is identical in all three modules, because all three legacy sources are
 * identically silent about type.
 *
 * WHY EVERY OPTIONAL MEMBER IS OMITTED — FIVE ABSENCES, EACH VERIFIED BY SCANNING THE SOURCE FILE AND
 * EACH MEANINGFUL RATHER THAN LAZY:
 *
 *   populateEnabled — ABSENT. The master gate at [:L185] reads `!structKeyExists(currentProperty,
 *     "hb_populateEnabled") || currentProperty.hb_populateEnabled neq false`, so a property with no
 *     such attribute is POPULATE-ENABLED BY OMISSION. None of the five declares one; the attribute
 *     does not occur in the file at all. It is omitted here and NOT written as the disabling value,
 *     because writing that would disable population and thereby INVENT a protection the legacy
 *     component does not have (S9) — changing what the population and validation layers observe. ⚠️
 *     That applies to `product` too, tempting though it is to "protect" an injected entity from being
 *     overwritten by request data: no such metadata exists in the source, so the omission is RECORDED,
 *     NOT CORRECTED (S7).
 *
 *   notNull — ABSENT, so a blank incoming value DELETES the key rather than assigning an empty string
 *     ([:L196] versus [:L207]). That is precisely what keeps the absence semantics of the conditional
 *     rule set reachable: a cleared flag becomes unset rather than empty, and an unset flag leaves its
 *     condition unmet. The attribute occurs exactly once in the whole in-scope slice, on a persistent
 *     property of another type, and never here.
 *
 *   populateArray — ABSENT, so the array branch at [:L216], which requires the attribute to be present
 *     and truthy, cannot be reached by any of the five.
 *
 *   fileUpload — ABSENT. The column gate at [:L193] ends in a PRESENCE test for it, so declaring it at
 *     all — even with a falsy value — would exclude the property from ordinary population. None of the
 *     five declares it, and none is an upload. (The excluded upload process object cited in Contrast
 *     Proof 2 is where that attribute family actually lives.)
 *
 *   sessionDefault — has no descriptor member to omit, and would have nothing to record if it did: the
 *     attribute that drives [:L210-L211] does not occur in this file either.
 *
 * The declared ORDER is preserved because it is population order: the legacy loop at [:L178] iterates
 * DECLARED PROPERTIES rather than payload keys, never the reverse, so a payload key matching no
 * declared property is silently ignored — and that iteration direction is exactly why this five-entry
 * table is the complete contract.
 *
 * ⚠️ AND NOTHING ELSE IS RECORDED. Neither resource-bundle key appears in this table, and neither does
 * a condition name, a required marker, a data-type marker, a form-field hint or a label. The
 * descriptor model is CLOSED to exactly the attributes the population branches test, and a
 * resource-bundle key is not one of them (S9); it is annotated on its property above, where it belongs,
 * and exported from nowhere in this module.
 */
const PRODUCT_UPDATE_SKUS_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<ProductUpdateSkusPropertyName>[] =
  Object.freeze([
    { name: 'product', valueType: 'untyped' },
    { name: 'updatePriceFlag', valueType: 'untyped' },
    { name: 'price', valueType: 'untyped' },
    { name: 'updateListPriceFlag', valueType: 'untyped' },
    { name: 'listPrice', valueType: 'untyped' },
  ]);

/**
 * The complete population contract for {@link ProductUpdateSkus} — the declared replacement for the
 * legacy runtime metadata walk.
 *
 * `persistent: false` IS THE CONSEQUENTIAL MEMBER, and it is behaviour rather than bookkeeping. It
 * ports the absence of a `persistent` attribute on the component declaration at
 * [model/process/Product_UpdateSkus.cfc:L49], which makes the legacy persistence predicate answer
 * false for this type. That answer is the FIRST ARM of the authorisation disjunction at
 * [org/Hibachi/HibachiTransient.cfc:L186-L190] —
 * `!isPersistent() || (publicPopulateFlag && … == "public") || authenticateEntityProperty(…)` —
 * so the whole expression SHORT-CIRCUITS immediately and PROCESS OBJECTS POPULATE FREELY, bypassing
 * per-property authorisation entirely. The six persistent catalog entities declare `persistent=true`,
 * so for them the third arm really is consulted. That asymmetry is observable behaviour, and it is
 * DECLARED here as a flag rather than rediscovered by reflection — reflection being the framework
 * machinery TR-3 retires, and something `strict` TypeScript has no equivalent for in any case.
 *
 * THE MODEL IS CLOSED (S9). Five descriptors, one flag, one name, nothing else: no display metadata,
 * no resource-bundle key, no default, no audit property, no rule, no condition and no relationship.
 * Every member the descriptor contract offers is either used above or omitted for a documented reason.
 *
 * Frozen at both levels — the set and its property list — so the contract cannot be mutated at runtime
 * by a caller that receives it. Freezing is the only statement this module makes at load time, and it
 * is not a side effect: it touches nothing but the object literals declared here, so importing this
 * module remains observably inert (M7).
 */
export const PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<
  ProductUpdateSkus,
  ProductUpdateSkusPropertyName
> = Object.freeze({
  /*
   * The legacy `getClassName()` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
   * [model/process/Product_UpdateSkus.cfc:L49] — the bare component name, UNDERSCORE AND ALL. The CFML
   * file name is `Product_UpdateSkus.cfc`, so `listLast(getClassFullname(), ".")` yields
   * `Product_UpdateSkus` and NOT the TypeScript class name `ProductUpdateSkus`. The legacy spelling is
   * carried because it is what ARM 3 of the population gate would have been keyed by
   * [org/Hibachi/HibachiTransient.cfc:L190].
   *
   * ⚠️ IT IS NEVER CONSULTED FOR THIS TYPE, and is declared anyway. `persistent: false` below
   * short-circuits the authorisation OR on its first arm, so no authorisation question is ever asked
   * about a process object. The member is required rather than optional precisely so that this fact is
   * stated per type instead of being inferred from an omission — and so that a type which later
   * becomes persistent cannot silently acquire a defaulted, mismatched key.
   */
  entityName: 'Product_UpdateSkus',

  persistent: false,
  properties: PRODUCT_UPDATE_SKUS_COLUMN_DESCRIPTORS,
});
