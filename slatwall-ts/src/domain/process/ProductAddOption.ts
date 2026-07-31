/**
 * ProductAddOption — the typed input object for the legacy `addOption` process context.
 *
 * Ported from [model/process/Product_AddOption.cfc], whose entire body is nine lines: the component declaration
 * at [:L49], one injected entity at [:L51-L52], one data property at [:L54-L55], and the closing
 * brace at [:L57]. Two facts about that body govern everything here.
 *
 * FACT ONE — THE COMPONENT DECLARES ZERO FUNCTIONS, so THIS MODULE DECLARES ZERO METHODS. There is no
 * behaviour to port because the legacy component has none: it carries two values and does nothing with
 * them. Every rule the `addOption` context obeys lives somewhere else, and each of those places is
 * named below, so a reader who comes here looking for the missing logic learns where it went instead of
 * concluding it was lost.
 *
 * FACT TWO — NEITHER PROPERTY CARRIES A `type=` ATTRIBUTE. `property name="product";` and
 * `property name="option";` are the complete declarations, with no `hb_`-prefixed attribute, no
 * `notNull`, no `fieldtype`, no `cfc` and no `persistent` anywhere in the file. CFML asked for no type
 * and the component volunteered none, so the two types below are RECOVERED FROM THE OBSERVED CONTRACT
 * — the single consumer, the admin form that submits the payload, and the query whose projection feeds
 * that form — rather than guessed. Each recovery is documented at the field it produced.
 *
 * THE STRUCTURAL TWIN. This module and `ProductAddOptionGroup.ts` port two legacy components that are
 * identical line for line apart from a single property name, so the two modules are deliberately
 * parallel in structure, ordering and naming and can be read side by side. They nevertheless remain
 * INDEPENDENT DECLARATIONS: nothing here imports, re-exports or derives from that sibling, not by
 * extension and not through a mapped type, because the legacy components do not derive from each other
 * either — they are two separate files that happen to agree. Coupling them would manufacture a
 * relationship the source does not have and would make a future divergence in one silently change the
 * other. Exactly one substantive difference in commentary exists, and it has its own block below: a
 * loop-scoping parity note that is TRUE of the sibling context's consumer and NOT TRUE of this one.
 * Accuracy outranks symmetry, so it is stated here in the corrected form rather than copied.
 *
 * The legacy tree is REFERENCE-ONLY (AAP §0.4.1.1, TR-6 "Change no existing file"). Nothing under
 * `model/`, `org/`, `config/`, `integrationServices/` or `meta/` is modified, read at runtime or
 * bundled; those paths appear here exclusively as prose citations.
 *
 * SCOPE. AAP §0.4.1.4 states the whole mandate — CREATE from `model/process/Product_AddOption.cfc`, "Injected `product` plus the `option` data
 * property" — and §0.2.1.4 makes this one of exactly
 * three in-scope process objects, the rest of `model/process/` being out of scope including the
 * product-family siblings §0.2.2.4 excludes. TR-3 governs the shape: "Replace framework magic with
 * declarations", so the population metadata this component relied on reflectively at runtime is
 * declared here instead. And per IR-8, `extends="HibachiProcess"` at [:L49] resolves to the LOCAL
 * Slatwall base `model/process/HibachiProcess.cfc`, not the framework one — and that local file is an
 * empty passthrough, its [:L49-L51] being the component declaration and its closing brace with nothing
 * between them. THERE IS NO LOCAL BASE BEHAVIOUR TO PORT, which is why this module declares no base
 * type, extends nothing, and has no sibling base module.
 *
 * WHAT THIS MODULE IS NOT. It is PURE DECLARATION: no data access, no connection, no `Sw*` table in
 * any query-shaped string and no driver import (S2); no environment read, no file system and no
 * logging (S4); synchronous throughout, with no I/O to defer (S6); and NO module-scope mutable binding
 * of any kind, so loading it has no observable effect and nothing can bleed between invocations on a
 * warm container (M7 / S8, expanded below). It imports nothing outside `src/domain/**`, so the
 * hexagonal direction is visible in the import lines themselves (S4). It also generates no identifier:
 * primary keys in this schema are 32-character identifiers minted by the persistence layer (IR-6),
 * never by a domain module, and neither member of this object is a primary key in the first place.
 *
 * Standards citations use the AAP §0.7.3 identifiers S1-S9; the ones with teeth here are S1 (no
 * escape-hatch type, no cast used to silence the compiler, no suppression comment, no non-null
 * assertion), S2 and S4 (the negative obligations above), S3 (no locator, no synthesised member, no
 * string-keyed resolution, no decorator), S5 (no dependency added), S6 (satisfiable by the empty object
 * literal, so a test needs no harness, container or database), S7 (preserve and annotate — the untyped,
 * all-optional, defaultless shape IS the contract), S8 (the one relevant execution-model mismatch is
 * flagged, not solved) and S9 (nothing invented: no third member, no default, no display metadata, no
 * audit field, no branded identifier type). `G6` marks a technology-specific translation decision,
 * which AAP §0.8.2 Guideline 6 requires to be documented where it is made.
 */

import type { ColumnPropertyDescriptor, PropertyDescriptorSet } from '../base/populate';
import type { Product } from '../product/Product';

/* =================================================================================================
 * G6 TRANSLATION DECISION — AN `interface`, NOT A `class`, AND THE REASON IS TECHNICAL
 * =================================================================================================
 * Guideline 6 requires every technology-specific judgment call to be documented, and this is the
 * first of them. Three arguments point the same way, and the third is decisive.
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
 * 3. A CLASS FIELD WOULD DESTROY THE ABSENT-VERSUS-UNDEFINED DISTINCTION. This is the decisive
 *    argument and it is a real emit hazard rather than a stylistic preference. `tsconfig.json`
 *    targets ES2022, which makes `useDefineForClassFields` true by default, so a
 *    declared-but-uninitialised field is emitted as a genuine `Object.defineProperty` with the
 *    value `undefined` — THE KEY WOULD EXIST ON EVERY INSTANCE. The legacy null representation is
 *    the opposite of that: [org/Hibachi/HibachiTransient.cfc:L196] routes a blank value to the
 *    private population helper with no value argument, and that helper at [:L806-L819] implements
 *    it as `structDelete(variables, arguments.name)` — NULL BY DELETION. Its TypeScript analogue is
 *    `delete target[name]`, whose whole point is that the key stops existing, and whose effect is
 *    observed with a presence test rather than an equality test, exactly as the legacy code used
 *    `structKeyExists`. An eagerly defined `undefined`-valued key would make that presence test
 *    answer true for a property nobody ever set, silently changing what the population and
 *    validation layers observe.
 *
 *    An interface has no emit at all: it is erased completely, the runtime value is a plain object
 *    carrying only the keys actually assigned, and `'option' in candidate` and
 *    `delete candidate.option` behave precisely like the legacy `structKeyExists` and
 *    `structDelete` pair. (The sibling entity modules reach the same destination by a different
 *    road: they are classes because they DO carry behaviour, so they declare their optional fields
 *    with `declare` to suppress the same emit. Two shapes, one semantics.)
 *
 * BOTH MEMBERS ARE THEREFORE OPTIONAL, and that is load-bearing twice over. It is how "satisfiable
 * with zero arguments" is expressed, so the empty object literal is a legal value of this type. And
 * because `exactOptionalPropertyTypes` is on, optional here means genuinely ABSENT: a key present
 * with the value `undefined` is rejected by the compiler rather than being quietly accepted as an
 * equivalent of omission. That is the type-level statement of null-by-deletion.
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
 * exactly the kind of silent divergence this port exists to avoid. The name is byte-exact against
 * [model/process/Product_AddOption.cfc:L52], as is `option` against [:L55], and the declaration
 * ORDER of the two is preserved because declaration order is population order (see the descriptor
 * set at the foot of this file).
 *
 * THE SAME LINE FORBIDS A CONSTRUCTOR PARAMETER. [L175] is unconditional and runs immediately after
 * [L174] constructs the object, so the entity is assigned to an already-constructed instance. An
 * ordinary assignable optional field is therefore the faithful shape, and a required constructor
 * parameter would be a fabrication. This is not a dependency-injection concession either: `product`
 * is DATA that the framework pushes in, not a service collaborator, so post-construction assignment
 * leaves S3 untouched — no collaborator of any kind is resolved by this module. The happy
 * side effect is total testability (S6): an instance is an object literal, with no bootstrap, no
 * bean factory, no container and no database.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — `option` IS AN IDENTIFIER STRING, NOT AN `Option` ENTITY
 * =================================================================================================
 * This is the load-bearing judgment call of the file. The member is named `option` and the legacy
 * declaration gives no type, so typing it as the entity of the same name is the obvious reading —
 * and it is wrong. Three independent lines of evidence establish
 * that the value is the option's 32-character IDENTIFIER.
 *
 * 1. THE SINGLE CONSUMER TREATS IT AS A LOOKUP ARGUMENT, AND THEN PROVES IT BY A ROUND TRIP. The
 *    accessor has EXACTLY ONE call site in the legacy tree,
 *    [model/service/ProductService.cfc:L130]:
 *
 *        var newOption = getOptionService().getOption(arguments.processObject.getOption());
 *
 *    The value is handed straight to an identifier-keyed `get<Entity>(id)` resolver, so it is the
 *    ARGUMENT to the resolution, not its result. What settles the question beyond argument is the
 *    very next statement, [:L132], which reads `newOption.getOptionID()` off the RESOLVED entity in
 *    order to obtain the identifier. Had this accessor already returned an entity, that whole round
 *    trip — resolve an entity from the value, then ask the entity for its identifier — would be
 *    pointless: the code would simply have read the identifier from the value it already held. The
 *    round trip exists precisely because the value entering it is not an entity.
 *
 * 2. THE ADMIN FORM SUBMITS A SCALAR. `admin/views/entity/preprocessproduct_addoption.cfm:L60`
 *    renders this very property against the process object itself —
 *    `property="option" fieldType="select"` — with its choices supplied by
 *    `rc.product.getUnusedProductOptions()`. An HTML select submits its chosen option's VALUE,
 *    which is a scalar; a form post cannot deliver an object graph. Note in passing that the form
 *    field type is declared BY THE VIEW, not by any attribute on the component, which is why no
 *    display or form metadata is invented in the descriptor set below (S9).
 *
 * 3. THE VALUE CHAIN RESOLVES TO IDENTIFIERS, END TO END. `getUnusedProductOptions()` at
 *    [model/entity/Product.cfc:L635-L640] delegates to [model/service/OptionService.cfc:L72-L74],
 *    which is a pure passthrough to `OptionDAO.getUnusedProductOptions`
 *    [model/dao/OptionDAO.cfc:L51-L92]. That query reads exactly three columns —
 *    `SwOption.optionID`, `SwOption.optionName` and `SwOptionGroup.optionGroupName` [:L59-L62] —
 *    and projects each row INLINE at [:L88] as
 *    `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}`. The label is the
 *    group-then-option composite; THE VALUE IS THE IDENTIFIER. A second, independent projection
 *    helper in the same service agrees: `getOptionsForSelect` at
 *    [model/service/OptionService.cfc:L55-L63] pairs `getOptionName()` with `getOptionID()` for
 *    option entities it is handed directly. Different route, identical conclusion.
 *
 * THE CONSEQUENCE FOR THIS MODULE'S IMPORTS IS STRUCTURAL, NOT INCIDENTAL. Because the member is a
 * string, this file needs nothing from `src/domain/option/**`, and it imports nothing from there.
 * Typing it as an entity would have manufactured a dependency the legacy component does not have,
 * and it would have handed the population layer a shape no producer in the system can deliver:
 * [org/Hibachi/HibachiTransient.cfc:L193] admits a value to the column branch only when
 * `isSimpleValue()` answers true for it, and an entity would fail that test and fall through to the
 * relationship branches — which require `cfc` and `fieldtype` metadata this component never
 * declares, and would therefore match nothing at all.
 *
 * PRESERVED AS FOUND, NOT TIGHTENED (S7). The string is not narrowed to a branded or nominal
 * identifier type, and no format, length or character-set check is attached to it. The legacy
 * property is a plain untyped value with no such guard, IR-6 places identifier minting in the
 * persistence layer, and an invented guard could reject an input the legacy system accepts.
 * ============================================================================================== */

/* =================================================================================================
 * G6 PARITY NOTE, IN ITS CORRECTED FORM — THE LOOP-SCOPING DEFECT IS NOT IN THIS PATH
 * =================================================================================================
 * This is the one block whose content deliberately does NOT mirror `ProductAddOptionGroup.ts`, because
 * copying the obvious parallel would put a FALSE statement in the codebase. AAP §0.8.2 Guideline 4
 * forbids "fixing" a defect that does exist just as firmly as accuracy forbids asserting one that does
 * not.
 *
 * TWO CONSUMERS IN [model/service/ProductService.cfc] LEAK A LOOP COUNTER INTO THE COMPONENT'S SHARED
 * SCOPE: [:L118] in `processProduct_addOptionGroup` writes `for(i=1; i <= arrayLen(skus); i++)` and
 * [:L220] in `processProduct_updateSkus` writes the identical unscoped form. In CFML an assignment with
 * no `var` lands in the component's own `variables` scope, and because services are SINGLETONS — only
 * entities, process objects, transients and reports are registered as transients at
 * [org/Hibachi/Hibachi.cfc:L289-L292] — that counter is shared across every concurrent request.
 *
 * THIS CONTEXT'S CONSUMER DOES NOT HAVE THAT FLAW. `processProduct_addOption`
 * [model/service/ProductService.cfc:L128-L155] declares both of its loop counters correctly, [:L140]
 * as `for(var s=1; …)` and the inner [:L142] as `for(var o=1; …)`, so nothing leaks and no
 * unscoped-counter defect is attributable to the `addOption` path.
 *
 * NOR DOES THIS CONTEXT OWN THE OTHER `addOptionGroup` PARITY ITEM. AAP §0.6.7 records against
 * `processProduct_addOptionGroup` that only the FIRST option of the newly added group is applied to the
 * existing SKUs, visible at [:L119] as `skus[i].addOption(options[1])`. That entry belongs to that
 * method alone; `processProduct_addOption` applies no such first-element narrowing, accumulating across
 * every existing SKU and every existing option [:L140-L148]. This module therefore carries no register
 * entry, mints no new one, and needs no parity marker.
 *
 * Both differences are differences in the CONSUMER rather than in this input object, and the consumer
 * belongs to `src/services/ProductService.ts`. Stating them keeps the two parallel modules diffable
 * without a reader concluding that a missing note is an oversight or that a copied note is a fact.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THIS OBJECT HAS NO VALIDATION RULE OF ITS OWN, AND THAT IS CORRECT
 * =================================================================================================
 * There is NO `model/validation/Product_AddOption.json`. A directory listing filtered for the
 * add-option contexts matches nothing, and the complete product-family set is `Product.json`,
 * `ProductImage.json`, `ProductReview.json`, `ProductType.json`, `Product_AddSubscriptionTerm.json`,
 * `Product_UpdateSkus.json` and `Product_UploadDefaultImage.json`. The AAP flags this in §0.2.1.5
 * as "a subtlety that must not be mistaken for an omission", and it is not one: the sibling
 * `Product_UpdateSkus.cfc` DOES have its own rules document, so the legacy authors wrote one where
 * they wanted one and pointedly did not here.
 *
 * The `addOption` context is nonetheless validated — by CONTEXT-SCOPED RULES DECLARED INSIDE
 * `model/validation/Product.json`, whose entries are keyed by PRODUCT's own property names:
 *
 *     "baseProductType":      [{"contexts":"addOptionGroup,addOption","inList":"merchandise"}, …]
 *     "unusedProductOptions": [{"contexts":"addOption","minCollection":1}]
 *
 * Both rules therefore constrain the PRODUCT, not this object: the first, at
 * [model/validation/Product.json:L4], gates the context on the product's base type, and the second,
 * at [:L13], requires the product to have at least one option still unused — which is the same
 * collection the admin select above draws its choices from, so the gate and the form agree by
 * construction. Neither `product` nor `option` is named by any rule anywhere.
 *
 * TWO THINGS FOLLOW. No rules module is created for this type, and none is invented — inventing one
 * would fabricate behaviour (S9). And this file imports nothing from the validation layer: those
 * rules belong to the product rule set, which is where a reader should look for them, and the
 * hexagonal direction forbids the import in any case (S4).
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
 * allocating an object literal.
 *
 * THE MISMATCH, FLAGGED RATHER THAN SOLVED. The legacy producer MEMOISES: [org/Hibachi/
 * HibachiEntity.cfc:L173] only builds the object when the owning entity has no cached one for that
 * context, [:L181] returns the cached instance, and [:L199-L201] exists solely so a caller can
 * evict it. That cache lives on the OWNING ENTITY, keyed by context — it is the entity's state, not
 * this type's — and in a stateless single-invocation execution model it has no equivalent (M7):
 * nothing survives between invocations except module scope, and per-request state held in module
 * scope on a warm container leaks across invocations and therefore across tenants. So the
 * memoisation is deliberately NOT reproduced here, in any form, and the decision is recorded rather
 * than resolved: if a caller needs the same instance twice it must hold the reference itself, which
 * is what the entity did. Reproducing the cache in this module would be strictly worse than the
 * legacy behaviour, because the legacy cache was at least per-entity and per-request.
 * ============================================================================================== */

/* =================================================================================================
 * G6 TRANSLATION DECISION — THE POST-CONSTRUCTION DEFAULTS HOOK IS A NO-OP HERE
 * =================================================================================================
 * [org/Hibachi/HibachiEntity.cfc:L179] invokes a defaults hook on the freshly built process object,
 * immediately after the entity injection at [:L175]. It would be reasonable to assume that hook seeds
 * something; for this component it does not. The hook is declared at
 * [org/Hibachi/HibachiProcess.cfc:L10-L12] with an empty body whose entire content is the comment
 * "Left Blank To Be Done By Each Process Object", and the only two overrides anywhere under `model/`
 * are [model/process/Order_AddOrderPayment.cfc:L81] and [model/process/Order_CreateReturn.cfc:L64],
 * both in the out-of-scope order domain. `Product_AddOption.cfc` does not override it.
 *
 * THEREFORE NEITHER MEMBER HAS A DEFAULT, and none is invented (S9). The contrast is instructive: the
 * excluded [model/process/Product_AddSubscriptionTerm.cfc] DOES declare product-derived lazy defaults,
 * so the legacy authors added defaults where they wanted them and deliberately did not here. A freshly
 * produced instance carries the injected `product` and nothing else, and `option` stays ABSENT
 * until a payload supplies it.
 *
 * The same reasoning excludes the framework's own process-object members. The base component at
 * [org/Hibachi/HibachiProcess.cfc:L3-L4] declares two flag properties with lazy readers at [:L14-L26]
 * and a type predicate at [:L6-L8]. None is ported: nothing outside `org/Hibachi/` consumes the
 * population flag or the predicate, the display flag's only consumer is an out-of-scope order process
 * object, and AAP §0.8.3.2 forbids carrying framework code forward in any case. Nor are the four audit
 * members ported — those belong to persistent entities, and a transient has none.
 * ============================================================================================== */

/**
 * The declared property names of {@link ProductAddOption}, in source declaration order.
 *
 * Matching the sibling domain modules, the names are a UNION OF LITERALS rather than a bare
 * `string`. That is what makes the descriptor set at the foot of this file typo-proof: a descriptor
 * naming a property this type does not declare is a compile error rather than an entry that
 * silently matches nothing at runtime, which is precisely the failure mode the legacy metadata walk
 * could not detect.
 *
 * Both names are byte-exact against the source — `product` from
 * [model/process/Product_AddOption.cfc:L52] and `option` from [:L55] — including their camel
 * casing, and the union lists them in the order the file declares them.
 */
export type ProductAddOptionPropertyName = 'product' | 'option';

/**
 * The input object for the `addOption` process context — a product plus the identifier of the single
 * option to add to it.
 *
 * A PURE CARRIER, BY FIDELITY. Two optional members, zero methods, no defaults, no invariants and
 * no validation, because the legacy component at [model/process/Product_AddOption.cfc:L49-L57] is
 * exactly that and nothing more. The reasoning behind the shape — why an interface rather than a
 * class, why the members are named as they are, why `option` is a string, and why nothing is
 * memoised or defaulted — is documented in the decision blocks above.
 *
 * IT DELIBERATELY CARRIES NO OPTION LIST, AND THAT ABSENCE IS THE DESIGN. Reading the consumer
 * invites a plausible mistake. [model/service/ProductService.cfc:L131-L137] builds a working
 * structure whose keys are an option list, a price and — conditionally — a list price, then
 * [:L140-L148] walks every existing SKU and every option on it, appending each option that belongs
 * to a different option group and is not already present. That accumulator is a COMMA-DELIMITED
 * STRING: it is seeded at [:L132] from one identifier and grown by `listAppend` at [:L145], with
 * membership tested by the deliberately case-insensitive `listFindNoCase` at [:L144]. The finished
 * structure is handed to the SKU combination engine at [:L150].
 *
 * NONE OF THAT BELONGS HERE. The delimited-string idiom, its case-insensitive membership test, and
 * the question of whether to preserve or re-express it are the business of
 * `src/services/ProductService.ts` and of the SKU service it calls — they are working data
 * assembled BY the consumer, not input supplied TO it. So this type declares no option collection,
 * no array, no delimited-list member, and no price or list-price member either: the legacy
 * component declares exactly two properties, and adding a third would invent behaviour (S9) while
 * duplicating another module's scope. What the negative obligation buys is that nothing about this
 * input presumes any particular accumulation strategy downstream.
 *
 * @example
 * ```ts
 * // Satisfiable with no arguments at all — the producer at
 * // [org/Hibachi/HibachiEntity.cfc:L174-L175] constructs first and assigns second.
 * const processObject: ProductAddOption = {};
 * processObject.product = product;
 * processObject.option = selectedOptionId;
 *
 * // Null by deletion, as the legacy `structDelete` did — the key stops existing, so a presence
 * // test answers false. Assigning `undefined` instead is rejected by the compiler.
 * delete processObject.option;
 * ```
 */
export interface ProductAddOption {
  /*
   * Injected Entity — the grouping comment at [model/process/Product_AddOption.cfc:L51],
   * reproduced because it records the framework's own distinction between the entity the producer
   * pushes in and the data a request payload supplies.
   */

  /**
   * The product the option is being added to.
   *
   * Assigned by the producer at [org/Hibachi/HibachiEntity.cfc:L175] through the synthesised
   * `setProduct(this)` call, which is why the member is named `product` and why it is an ordinary
   * optional field rather than a constructor parameter. The real sibling type is imported rather
   * than restated: a locally declared structural stand-in would drift from `Product` silently, and
   * the type-only import keeps the reference free of any runtime edge.
   *
   * Optional because the object exists, however briefly, before [L175] runs — and because the
   * legacy component states no obligation for it to be present.
   */
  product?: Product;

  /*
   * Data Properties — the grouping comment at [model/process/Product_AddOption.cfc:L54].
   */

  /**
   * The IDENTIFIER of the option to add — a string, not an entity.
   *
   * Established three ways in the decision block above: the sole consumer at
   * [model/service/ProductService.cfc:L130] passes it as the argument of an identifier-keyed
   * `getOption(id)` resolver and then reads the identifier back off the RESOLVED entity at [:L132],
   * which is a round trip that only makes sense if the incoming value is not itself an entity; the
   * admin form renders it as a select, which submits a scalar; and the query behind that select
   * projects `SwOption.optionID` as the submitted value.
   *
   * Optional, and left ABSENT rather than defaulted, so that the population layer's null-by-deletion
   * semantics remain expressible: a blank incoming value deletes the key
   * ([org/Hibachi/HibachiTransient.cfc:L196] and [:L806-L819]) rather than storing an empty string,
   * because this property declares no `notNull` attribute.
   */
  option?: string;
}

/*
 * The two declared properties, in source declaration order, as column descriptors.
 *
 * WHY BOTH ARE COLUMNS. The population branch that claims a property is gated at
 * [org/Hibachi/HibachiTransient.cfc:L193] on `!structKeyExists(currentProperty, "fieldType") ||
 * currentProperty.fieldType == "column"`. Neither property declares a `fieldtype` attribute — nor a
 * `cfc` attribute, which the relationship branches also require — so both take the column branch.
 * `kind` is omitted here for exactly that reason: an ABSENT `fieldtype` and an explicit
 * `fieldtype="column"` are equivalent in the source, and omission is the more faithful of the two
 * renderings. Note the consequence for `product`, recorded rather than smoothed over: the legacy
 * gate would accept a SIMPLE value straight into the injected-entity slot.
 *
 * WHY EVERY OPTIONAL MEMBER IS OMITTED — FIVE ABSENCES, EACH VERIFIED BY SCANNING THE SOURCE FILE
 * AND EACH MEANINGFUL RATHER THAN LAZY:
 *
 *   populateEnabled — ABSENT. The master gate at [:L185] reads `!structKeyExists(currentProperty,
 *     "hb_populateEnabled") || currentProperty.hb_populateEnabled neq false`, so a property with no
 *     such attribute is POPULATE-ENABLED BY OMISSION. Neither property declares one; a scan of the
 *     source file for `hb_`-prefixed attributes returns zero hits of any kind. It is omitted here
 *     and NOT written as `false`, because writing `false` would disable population and thereby
 *     INVENT a protection the legacy component does not have (S9) — changing what the population and
 *     validation layers observe, including for the injected entity slot. The omission is recorded,
 *     not corrected (S7).
 *
 *   notNull — ABSENT, so a blank incoming value DELETES the key rather than assigning an empty
 *     string ([:L196] versus [:L207]). The attribute occurs exactly once in the whole in-scope
 *     slice, on a persistent property of another type, and never here.
 *
 *   populateArray — ABSENT, so the array branch at [:L216], which requires the attribute to be
 *     present and truthy, cannot be reached by either property.
 *
 *   fileUpload — ABSENT. The column gate at [:L193] ends in a PRESENCE test for it, so declaring it
 *     at all — even as `false` — would exclude the property from ordinary population. Neither
 *     property declares it, and neither is an upload.
 *
 *   sessionDefault — has no descriptor member to omit, and would have nothing to record if it did:
 *     the attribute that drives [:L210-L211] does not occur in this file either.
 *
 * The declared ORDER is preserved because it is population order: the legacy loop at [:L178]
 * iterates DECLARED PROPERTIES rather than payload keys, never the reverse, so a payload key
 * matching no declared property is silently ignored — and that iteration direction is exactly why
 * this two-entry table is the complete contract.
 */
const PRODUCT_ADD_OPTION_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<ProductAddOptionPropertyName>[] =
  Object.freeze([
    { name: 'product', valueType: 'untyped' },
    { name: 'option', valueType: 'untyped' },
  ]);

/**
 * The complete population contract for {@link ProductAddOption} — the declared replacement for the
 * legacy runtime metadata walk.
 *
 * `persistent: false` IS THE CONSEQUENTIAL MEMBER, and it is behaviour rather than bookkeeping. It
 * ports the absence of a `persistent` attribute on the component declaration at
 * [model/process/Product_AddOption.cfc:L49], which makes the legacy persistence predicate answer
 * false for this type. That answer is the FIRST ARM of the authorisation disjunction at
 * [org/Hibachi/HibachiTransient.cfc:L186-L190] —
 * `!isPersistent() || (publicPopulateFlag && … == "public") || authenticateEntityProperty(…)` —
 * so the whole expression SHORT-CIRCUITS immediately and PROCESS OBJECTS POPULATE FREELY, bypassing
 * per-property authorisation entirely. The six persistent catalog entities declare
 * `persistent=true`, so for them the third arm really is consulted. That asymmetry is observable
 * behaviour, and it is DECLARED here as a flag rather than rediscovered by reflection — reflection
 * being the framework machinery TR-3 retires, and something `strict` TypeScript has no equivalent
 * for in any case.
 *
 * THE MODEL IS CLOSED (S9). Two descriptors, one flag, nothing else: no display metadata, no
 * resource-bundle label, no default, no audit property, no rule and no relationship. Every member
 * the descriptor contract offers is either used above or omitted for a documented reason.
 *
 * Frozen at both levels — the set and its property list — so the contract cannot be mutated at
 * runtime by a caller that receives it. Freezing is the only statement this module makes at load
 * time, and it is not a side effect: it touches nothing but the object literals declared here, so
 * importing this module remains observably inert (M7).
 */
export const PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<
  ProductAddOption,
  ProductAddOptionPropertyName
> = Object.freeze({
  /*
   * The legacy `getClassName()` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
   * [model/process/Product_AddOption.cfc:L49] — the bare component name, UNDERSCORE AND ALL. The CFML file name is
   * `Product_AddOption.cfc`, so `listLast(getClassFullname(), ".")` yields `Product_AddOption` and
   * NOT the TypeScript class name `ProductAddOption`. The legacy spelling is carried because it is
   * what ARM 3 of the population gate would have been keyed by
   * [org/Hibachi/HibachiTransient.cfc:L190].
   *
   * ⚠️ IT IS NEVER CONSULTED FOR THIS TYPE, and is declared anyway. `persistent: false` below
   * short-circuits the authorisation OR on its first arm, so no authorisation question is ever
   * asked about a process object. The member is required rather than optional precisely so that
   * this fact is stated per type instead of being inferred from an omission — and so that a type
   * which later becomes persistent cannot silently acquire a defaulted, mismatched key.
   */
  entityName: 'Product_AddOption',

  persistent: false,
  properties: PRODUCT_ADD_OPTION_COLUMN_DESCRIPTORS,
});
