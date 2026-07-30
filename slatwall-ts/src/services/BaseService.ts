/**
 * `BaseService` — the injectable `save` / `delete` collaborator that replaces CFML template-method
 * inheritance for the extracted Catalog slice.
 *
 * Authority: AAP 0.4.1.8 row 1 — `slatwall-ts/src/services/BaseService.ts` | CREATE |
 * `model/service/HibachiService.cfc:L68, L86` | "The **local** `save()` and `delete()` overrides —
 * the ones the in-scope services actually inherit — become an injectable collaborator (IR-8)".
 * Corroborated by the AAP 0.3.1 target tree, by IR-8, and by rule R3 in AAP 0.4.3.3.
 *
 * =============================================================================================
 * IR-8 — THIS IS THE LOCAL OVERRIDE, NOT THE FRAMEWORK BASE. THE DIFFERENCE IS THE FILE.
 * =============================================================================================
 * AAP IR-8: "Four local base classes sit inside the extraction path. `model/entity/HibachiEntity.cfc`,
 * `model/service/HibachiService.cfc`, `model/dao/HibachiDAO.cfc` and `model/process/HibachiProcess.cfc`
 * are Slatwall code, not `org/Hibachi/` framework code, and the in-scope classes extend *these*.
 * `BrandService`'s `super.save()` [model/service/BrandService.cfc:L76] resolves to the local override
 * at [model/service/HibachiService.cfc:L86], not to the framework base."
 *
 * The hierarchy is two levels deep and both levels were read first-hand.
 * [model/service/HibachiService.cfc:L49] declares
 * `component accessors="true" output="false" extends="Slatwall.org.Hibachi.HibachiService"` — a
 * FULLY-QUALIFIED parent — while all four in-scope services declare `extends="HibachiService"` with
 * NO package prefix: [model/service/ProductService.cfc:L49], [model/service/SkuService.cfc:L49],
 * [model/service/BrandService.cfc:L49] and [model/service/OptionService.cfc:L49]. They therefore
 * inherit the LOCAL class, and the local class ADDS behaviour the framework base does not have —
 * the settings and comments cleanup after a successful removal [model/service/HibachiService.cfc:L76]
 * and [:L79], and the activeFlag post-processing block [:L91-L101]. That added behaviour is the whole
 * reason this file exists.
 *
 * =============================================================================================
 * R3 — COMPOSITION, NEVER INHERITANCE. NOTHING IN `src/services/` MAY EXTEND THIS CLASS.
 * =============================================================================================
 * AAP 0.4.3.3: "The target injects a `BaseService` collaborator and delegates explicitly, which also
 * means the framework members the slice never uses are never inherited into the port."
 *
 * So each converted service takes an instance of this class as a TYPED CONSTRUCTOR PARAMETER and
 * delegates to it. This class extends nothing, no sibling in this folder may extend it, and the only
 * occurrences of the `extends` keyword in this file are generic type-parameter CONSTRAINTS, which
 * describe a shape rather than establish an inheritance edge. Two consequences follow, and both are
 * deliberate:
 *   - The surface is narrowed to exactly the two members the in-scope services actually inherit.
 *     The wider `org/Hibachi/HibachiService` surface — `new`, `count`, `process`, `export`, and above
 *     all the `onMissingMethod` prefix dispatch at [org/Hibachi/HibachiService.cfc:L255-L281] — is
 *     NOT reproduced here. IR-1 replaces that synthesis with explicit declarations on each service.
 *   - The other three members of the local class are NOT ported: `getSlatwallScope()`
 *     [model/service/HibachiService.cfc:L51], `getHasAttributeByEntityNameAndPropertyIdentifier()`
 *     [:L56] and `getEntityHasAttributeByEntityName()` [:L61]. All three reach
 *     `getService("attributeService")` [:L62], and AAP 0.2.2.1 places the six `Attribute`-prefixed
 *     components out of scope. No in-scope member calls any of them.
 *
 * =============================================================================================
 * THE `super.save()` ASYMMETRY — VERIFIED IN SOURCE, AND THE MOST MISLEADING THING HERE
 * =============================================================================================
 * A reader will assume the three catalog save paths are uniform. They are NOT, and "harmonising"
 * them would change behaviour (AAP 0.8.2 guideline 4). All three were read line by line:
 *
 *   model/service/ProductService.cfc:L264-L292  saveProduct      DOES NOT reach this collaborator.
 *       It hand-rolls the whole sequence inline: populate at [:L266], unique URL title at
 *       [:L268-L270], validate at [:L273], SKU creation and image processing at [:L279] and [:L282],
 *       and then persists with `getHibachiDAO().save(target=arguments.product)` at [:L286-L288] —
 *       the DAO DIRECTLY, bypassing `super.save()` entirely. It therefore NEVER runs the activeFlag
 *       and settings post-processing of [model/service/HibachiService.cfc:L91-L101].
 *   model/service/ProductService.cfc:L303       saveProductType  `super.save(arguments.productType,
 *       arguments.data)` — positional two-argument, and the result is REASSIGNED onto the argument.
 *       Runs the post-processing.
 *   model/service/BrandService.cfc:L76          saveBrand        `super.save(arguments.brand,
 *       arguments.data)` — positional two-argument, returned directly. Runs the post-processing.
 *
 * The two-argument positional shape of the latter two is why {@link BaseService.save} declares three
 * parameters with the last two DEFAULTED rather than an options bag: a caller written as a literal
 * translation of the legacy line has to keep type-checking.
 *
 * =============================================================================================
 * HOW THE INHERITED populate -> validate -> persist SEQUENCE IS EXPRESSED
 * =============================================================================================
 * The local `save()` at [model/service/HibachiService.cfc:L88] delegates its real work to
 * `super.save(argumentcollection=arguments)`, which is [org/Hibachi/HibachiService.cfc:L133-L169].
 * AAP 0.8.3.2 retires that framework outright — "Do not port or depend on anything from
 * `org/Hibachi/` (DI/1, FW/1)" — so its CONTRACT was read and its CODE was not carried. The
 * observable sequence, with the locator of every step:
 *
 *   [org/Hibachi/HibachiService.cfc:L143-L148]  populate the entity from `data`
 *   [org/Hibachi/HibachiService.cfc:L151]       validate it under `context`
 *   [org/Hibachi/HibachiService.cfc:L154-L155]  when there are no failures, persist through the DAO
 *                                               and REASSIGN the entity from the return value
 *   [org/Hibachi/HibachiService.cfc:L168]       return the entity
 *
 * Each step becomes an injected, typed collaborator: `populate` from `../domain/base/populate`, the
 * `validate` entry point of `../validation/Validator`, and {@link EntityPersister} for the DAO call.
 *
 * ONE SUBTLETY THAT IS EASY TO INVERT, AND IT IS BEHAVIOUR. The FRAMEWORK signature at
 * [org/Hibachi/HibachiService.cfc:L133] declares `struct data` with NO default, and [:L143] guards
 * population with `structKeyExists(arguments,"data")` — so a framework-level save with no payload
 * does not populate at all. The LOCAL override at [model/service/HibachiService.cfc:L86] declares
 * `struct data={}`, and it forwards with `argumentcollection=arguments`, so the key ALWAYS exists by
 * the time the guard runs. Through this collaborator population is therefore UNCONDITIONAL, with an
 * empty payload when the caller supplies none. That is reproduced exactly: {@link BaseService.save}
 * always populates. Making population conditional here would be a framework-level behaviour applied
 * at the wrong level.
 *
 * The framework's own type guard at [org/Hibachi/HibachiService.cfc:L135-L137] is deliberately NOT
 * reproduced. It raises when the argument is not an object or is not persistent, and its message text
 * names the `onMissingMethod` invocation style as the likely cause — a failure mode IR-1 abolishes,
 * since nothing in the port is invoked by a synthesised name. Both of its arms are also structural
 * here rather than run-time: the generic bound admits only object types, and persistence is declared
 * on the descriptor set (`PropertyDescriptorSet.persistent` is documented in
 * `../domain/base/populate` as the port of `isPersistent()`). Its message string is additionally not
 * available to import — `../errors/DomainError` closes its inventory at the four catalog strings —
 * and AAP 0.8.2 guideline 2 forbids re-declaring a legacy throw string inline, so reproducing the
 * raise would mean inventing a message. It is cited so a reader can see it was considered.
 *
 * =============================================================================================
 * WHY THE CLASS IS GENERIC AND THE MEMBERS ARE NOT — THE CENTRAL JUDGMENT CALL (guideline 6)
 * =============================================================================================
 * `save` must accept exactly three parameters with the last two defaulted, so that
 * [model/service/BrandService.cfc:L76] and [model/service/ProductService.cfc:L303] keep working as
 * two-argument positional calls. Two of the collaborators are irreducibly ENTITY-SPECIFIC: a
 * `ValidationRuleSet` carries typed value readers for one subject type, and a
 * `PropertyDescriptorSet` carries typed accessors for one target type. With only three parameters
 * available they cannot arrive per call, and resolving them from the entity's class name would be
 * exactly the string-keyed dispatch AAP 0.7.3 S3 forbids. Method-level generics are therefore
 * IMPOSSIBLE without one of those two forbidden routes, and the class is generic instead: the
 * collaborators are bound once at construction, so `Brand` in yields `Brand` out and `ProductType`
 * in yields `ProductType` out with no cast at any call site.
 *
 * The consequence is stated plainly rather than left to be discovered: there is ONE instance per
 * entity type. A converted `ProductService` takes a `BaseService<ProductType, …>` for
 * `saveProductType` and a `BaseService<Product, …>` for `deleteProduct`, because those are two
 * different entity types and the legacy base class was able to serve both only by being untyped.
 *
 * =============================================================================================
 * HOW A FAILED SAVE IS SURFACED — AND WHY `delete` DOES THE OPPOSITE
 * =============================================================================================
 * In CFML every entity carries its own error bag, so [model/service/HibachiService.cfc:L103] could
 * return an entity that had already failed validation and let the caller ask it. The ported domain
 * entities carry NO bag: `../validation/Validator` deliberately RETURNS the bag instead, precisely so
 * the engine depends on no entity-side error accessor. Something therefore has to carry a failure out
 * of `save`, and the subtree already fixes which: `src/handlers/httpResponse.ts` tests
 * `error instanceof ValidationError` as its FIRST branch and serialises the keyed structure the bag
 * exposes. So `save` accumulates exactly as the legacy flow did, evaluates the whole post-processing
 * gate, and only then raises the accumulated bag.
 *
 * Nothing is lost by raising rather than returning, because `populate` MUTATES ITS TARGET IN PLACE and
 * hands the same object back: a caller that supplied the entity still holds the populated entity after
 * the raise, which is exactly what the legacy caller inspected. The alternative — returning an
 * `{ entity, errors }` pair — was considered and rejected: it would force every delegating service to
 * destructure where the legacy line was `return super.save(arguments.brand, arguments.data);`, and it
 * would let a caller ignore a failure silently, which the legacy `hasErrors()` gate never permitted.
 *
 * `delete` is deliberately ASYMMETRIC and must NOT raise. The framework member at
 * [org/Hibachi/HibachiService.cfc:L79] already returns a boolean verdict on validation failure, and
 * [model/service/ProductService.cfc:L326-L333] depends on receiving `false`: it restores the default
 * SKU it had temporarily cleared and returns false. Raising there would strand the product with a
 * null default SKU. The verdict is returned unchanged.
 *
 * ONE HONEST CONSEQUENCE, FLAGGED RATHER THAN SMOOTHED OVER. Because `delete` returns only a boolean,
 * the messages produced by the delete-context guards in `model/validation/Product.json`,
 * `model/validation/Sku.json`, `model/validation/ProductType.json`, `model/validation/Brand.json`,
 * `model/validation/Option.json` and `model/validation/OptionGroup.json` are not surfaced through it.
 * That matches the legacy member's own declaration — `public boolean function delete(required any
 * entity)` at [model/service/HibachiService.cfc:L68] returns the verdict and nothing else, and the
 * messages were reachable only through the entity's own bag, which the port's entities do not carry.
 * A caller that needs them can run the same rule set under the `delete` context through the
 * validator's dry-run mode, which `../validation/Validator` already provides. No new surface is
 * invented here to carry them.
 *
 * =============================================================================================
 * THE FOUR TR-5 GAP POINTS — DECLARED AND FLAGGED, NEVER DROPPED
 * =============================================================================================
 * TR-5: "Cross the scope boundary only through a declared port. Where an in-scope member depends on
 * an out-of-scope collaborator, the port interface is declared, the member is implemented against it,
 * and the gap is flagged. The member is never quietly dropped from the interface."
 *
 * Both members are fully declared and their in-scope control flow is reproduced exactly. Four points
 * reach collaborators AAP 0.2.2.1 excludes — the `Setting`-prefixed components under `model/` are
 * three files, and no comment family is in scope anywhere — and each carries a `TODO(parity)` at the
 * line where it belongs:
 *
 *   GAP 1  model/service/HibachiService.cfc:L76      settingService.removeAllEntityRelatedSettings
 *   GAP 2  model/service/HibachiService.cfc:L79      commentService.removeAllEntityRelatedComments
 *   GAP 3  model/service/HibachiService.cfc:L94-L96  settingService.updateAllSettingValuesToRemoveSpecificID
 *   GAP 4  model/service/HibachiService.cfc:L98-L100 settingService.clearAllSettingsCache
 *
 * No optional "cleanup hook", "settings mutator" or "comment remover" parameter is invented to stand
 * in for them, and `../ports/SettingResolverPort` is NOT repurposed: that port RESOLVES configuration
 * keys, whereas GAP 3 and GAP 4 write setting values and invalidate a cache, so borrowing it would
 * corrupt a sibling contract.
 *
 * =============================================================================================
 * THE FIVE CLASS NAMES AT L98 ARE ALL OUT OF SCOPE — SO THE DISJUNCTION HAS ONE LIVE ARM
 * =============================================================================================
 * [model/service/HibachiService.cfc:L98] reads
 * `if(settingsRemoved gt 0 || listFindNoCase("Currency,FulfillmentMethod,OrderOrigin,PaymentTerm,PaymentMethod", arguments.entity.getClassName()))`.
 * Every one of those five entity names is excluded by AAP 0.2.2.1 — `Currency*` is two files,
 * `Fulfillment*` two, `Payment*` five, and `OrderOrigin` falls under the eighteen `Order*` files — so
 * for any IN-SCOPE entity the second arm can never match and the branch is reachable only through
 * `settingsRemoved gt 0`. Since the counter is supplied by GAP 3, whose collaborator is out of scope,
 * its only reachable value here is `0`, and the branch consequently never fires in the port.
 *
 * That is recorded, NOT simplified away. The full two-armed disjunction and all five literal names are
 * retained in {@link SETTINGS_CACHE_CLEARING_CLASS_NAMES}, because the rule itself is the observable
 * behaviour and collapsing it would delete a fact about the legacy system (AAP 0.8.2 guideline 4).
 *
 * =============================================================================================
 * PARITY NOTE — THE DUPLICATE `var settingsRemoved`, AND WHY BLOCK SCOPING FORCED ONE DECLARATION
 * =============================================================================================
 * The legacy body declares the counter TWICE: `var settingsRemoved = 0;` at
 * [model/service/HibachiService.cfc:L93] and `var settingsRemoved = …` again inside the if-branch at
 * [:L95]. In CFML a `var` is function-scoped, so the second declaration is a redundant re-declaration
 * of the SAME variable and the assignment is visible to the test at [:L98]. This is the same
 * declaration-hygiene smell class as the unscoped variables recorded as D9 and D10 in AAP 0.6.7.
 *
 * In TypeScript a second declaration inside the block would create a DIFFERENT, block-scoped binding,
 * the assignment would be invisible at [:L98], and the branch's only live arm would be silently dead.
 * The counter is therefore declared ONCE in the outer scope and assigned inside the branch. The
 * legacy duplicate is not "fixed" — it is recorded here, and the single declaration is the only
 * translation that preserves the observable data flow. No D-number is minted for it: AAP 0.6.7 closes
 * its register, and the `services/` folder's three numbers belong to other files.
 *
 * =============================================================================================
 * `hasProperty('activeFlag')` — CFML REFLECTION BECOMES A STRUCTURAL NARROWING (guideline 6)
 * =============================================================================================
 * [model/service/HibachiService.cfc:L91] gates on `arguments.entity.hasProperty('activeFlag')`, which
 * is [org/Hibachi/HibachiTransient.cfc:L763] — a key test against the entity's property metadata
 * struct. TypeScript has no metadata to reflect over, so the check becomes
 * {@link entityReadsActiveFlag}, a type-guard predicate that both asks the ported subject contract
 * and confirms the accessor is really there, so `getActiveFlag()` is callable without a cast under
 * `strict`. The gate at the call site stays exactly TWO-PART, as the legacy line is.
 *
 * WHICH ENTITIES ACTUALLY CARRY IT, measured rather than assumed: `activeFlag` is declared at
 * [model/entity/Product.cfc:L53], [model/entity/Sku.cfc:L53] (the only one with `default="1"`),
 * [model/entity/ProductType.cfc:L54] and [model/entity/Brand.cfc:L53]. It is declared NOWHERE in
 * `model/entity/Option.cfc` or `model/entity/OptionGroup.cfc`, so for those two the legacy gate is
 * false and the whole post-processing block is skipped — and the predicate reproduces that. Both
 * entity types that actually reach this collaborator's `save`, `ProductType` and `Brand`, do carry it.
 *
 * `getClassName()` and `getPrimaryIDValue()` are framework members —
 * [org/Hibachi/HibachiObject.cfc:L135] and [org/Hibachi/HibachiEntity.cfc:L244]. Per AAP 0.8.3.2 the
 * contract is read and the code is never carried: both are modelled as DOMAIN-SIDE accessors on the
 * entity shape, `getClassName()` through the ported subject contract and `getPrimaryIDValue()` on
 * {@link BaseServiceEntity}, where `../ports/UniquePropertyPort` already requires it of these same
 * entities. Neither is imported from anywhere near the framework.
 *
 * =============================================================================================
 * M7 — STATELESS BY CONSTRUCTION
 * =============================================================================================
 * AAP 0.6.6 M7 records that nothing survives between Lambda invocations except module-scope state,
 * and the DI/1 lifecycle at `org/Hibachi/Hibachi.cfc:~L289` makes services SINGLETONS while entities
 * and process objects are transient. A singleton on a warm container is shared across invocations, so
 * this file holds NO mutable state of any kind: no cache, no counter, no memo, no request context.
 * Every field is `readonly` and is an injected collaborator; `settingsRemoved` is a local of one call;
 * the only module-scope values are frozen constants. Nothing can bleed between invocations or between
 * tenants, and nothing needs clearing between them.
 *
 * =============================================================================================
 * ARCHITECTURAL POSITION — AAP 0.7.3 S4, AND THE PROHIBITIONS THAT GO WITH IT
 * =============================================================================================
 * Four imports, all of them relative, extensionless and single-quoted, and every one drawn from a
 * layer this folder is permitted to reach: `../domain/**`, `../validation/**` and `../errors/**`.
 * Nothing is imported from `../adapters/**`, `../config/**`, `../handlers/**` or `../integrations/**`;
 * `src/config/container.ts` performs the wiring and is never imported from here. There is no `mysql2`
 * import, no statement text, no bound-parameter array and no `Sw*` table name anywhere in this file —
 * AAP 0.7.3 S2 inverts into a prohibition for `src/services/`: a service never composes a query and
 * never sees a fragment of one. No AWS type is named; `src/handlers/**` is the only layer permitted to
 * name one. No environment variable is read; `src/config/env.ts` is the only file in the subtree
 * permitted to read one. No credential, host, endpoint or account identifier appears here
 * (AAP 0.8.3.9). No dependency is added: `mysql2` 3.23.2 is the sole runtime dependency of the whole
 * subtree and this folder does not consume it. And no service locator, dynamic proxy, reflective
 * lookup or string-keyed dispatch table exists here, because reproducing `onMissingMethod` in any form
 * is precisely what TR-3 and AAP 0.7.3 S3 abolish.
 *
 * This boundary is what makes AAP 0.8.3.8 real: the extracted services are "callable and deployable
 * without requiring the rest of Slatwall to be converted".
 *
 * =============================================================================================
 * TEST PROVENANCE — NET-NEW, STATED SO NO PARITY IS IMPLIED (AAP 0.7.3 S6, 0.8.3.7)
 * =============================================================================================
 * AAP 0.6.5.2: no `ProductServiceTest`, `SkuServiceTest`, `BrandServiceTest` or `OptionServiceTest`
 * exists in `meta/tests/`, and there is no legacy test for `model/service/HibachiService.cfc` either.
 * Coverage for both members of this file is therefore entirely NET-NEW. The legacy suite additionally
 * cannot be executed in this environment at all — AAP 0.5.4 records that MXUnit and CFSelenium are not
 * vendored — so no comparison against a legacy run was performed for anything here.
 *
 * Every collaborator is an interface or a minimal local function type, never a concrete adapter, which
 * is what lets a test construct this class against in-memory doubles with no mocking library — the
 * legacy suite had none and booted the whole framework application instead (AAP 0.4.3.6).
 *
 * =============================================================================================
 * RULES PROVENANCE
 * =============================================================================================
 * No user rules were provided. The project's rules document was read in full and returns exactly that
 * single line, so ZERO files enter scope by rule and no rule-derived constraint shaped this file. Per
 * AAP 0.7.2 that is not permission to lower the bar: the nine binding standards of AAP 0.7.3 govern
 * instead — S1 strict type safety, S2 parameterized SQL (inverted here into a no-query prohibition),
 * S3 explicit dependency injection, S4 hexagonal separation, S5 exact-version pinning and add nothing,
 * S6 one labelled test per converted method, S7 preserve and annotate, S8 flag mismatches, S9 invent
 * nothing — and each is cited inline where it bites.
 */

import type { AuditableEntity } from '../domain/base/AuditableEntity';
import {
  populate,
  type PopulationTarget,
  type PropertyDescriptorSet,
} from '../domain/base/populate';
import type { ValidationError } from '../errors/ValidationError';
import type { ValidationRuleSet, ValidationSubject, Validator } from '../validation/Validator';

/**
 * The default validation context of the local override, from
 * [model/service/HibachiService.cfc:L86] — `string context="save"`.
 *
 * Held as a constant rather than written twice so the parameter default and the documentation cannot
 * drift apart. It is NOT exported and NOT narrowed to a union: `../validation/Validator` documents the
 * context as an OPEN string, and the observed values across the slice are `save`, `delete` and the
 * process contexts `addOptionGroup`, `addOption`, `addSubscriptionTerm` and `updateSkus`. A union here
 * would reject a context a rule set legitimately declares.
 */
const DEFAULT_SAVE_CONTEXT = 'save';

/**
 * The context the inherited removal path validates under, from
 * [org/Hibachi/HibachiService.cfc:L55] — `arguments.entity.validate(context="delete")`.
 *
 * Hard-coded there, and therefore hard-coded here: `delete` takes no context parameter, exactly as
 * [model/service/HibachiService.cfc:L68] declares only `required any entity`.
 */
const DELETE_VALIDATION_CONTEXT = 'delete';

/**
 * The property name the post-processing gate reflects over, from
 * [model/service/HibachiService.cfc:L91] — `arguments.entity.hasProperty('activeFlag')`.
 */
const ACTIVE_FLAG_PROPERTY_NAME = 'activeFlag';

/**
 * The initial value of the removed-settings counter, from
 * [model/service/HibachiService.cfc:L93] — `var settingsRemoved = 0;`.
 *
 * The only numeric literal in this file, and it is source-declared with the locator above. AAP 0.7.3
 * S9 forbids inventing any other number here: there is no retry count, no timeout, no page size, no
 * batch size and no cache lifetime anywhere in this file, because the legacy source declares none.
 */
const NO_SETTINGS_REMOVED = 0;

/**
 * The five class names whose save clears the whole settings cache, from the `listFindNoCase` list at
 * [model/service/HibachiService.cfc:L98], in the legacy order.
 *
 * ALL FIVE ARE OUT-OF-SCOPE ENTITIES, so this arm of the disjunction can never match an in-scope
 * entity — see THE FIVE CLASS NAMES in the module header for the count behind that claim, and for why
 * the list is retained in full rather than collapsed.
 *
 * Frozen and `as const` together: the tuple type stops a name being added or misspelled at compile
 * time, and the freeze stops a consumer mutating a shared array at run time. Immutable by
 * construction, so it is not the mutable module-scope state M7 forbids.
 */
const SETTINGS_CACHE_CLEARING_CLASS_NAMES = Object.freeze([
  'Currency',
  'FulfillmentMethod',
  'OrderOrigin',
  'PaymentTerm',
  'PaymentMethod',
] as const);

/**
 * Persists an entity and hands back the persisted instance.
 *
 * THE PORT OF ONE LINE: `arguments.entity = getHibachiDAO().save(target=arguments.entity);` at
 * [org/Hibachi/HibachiService.cfc:L155]. The return value matters as much as the call — the legacy
 * line REASSIGNS the entity from it, which is why this is not a `Promise<void>` collaborator.
 *
 * Declared locally rather than in `../ports/**` on purpose, and the precedent is in the subtree
 * already: `src/util/urlTitle.ts` declares its own `UniqueValueProbe` function type and imports
 * nothing from `ports/`. AAP 0.4.1.6 closes the ports inventory at thirteen files, none of which is a
 * generic entity persister, and `src/services/` is not `src/ports/`. Adding a fourteenth port would
 * change an inventory this file does not own; declaring the narrowest possible collaborator here does
 * not.
 *
 * ONE FUNCTION, NO OPTIONS BAG, NO INVENTED CAPABILITY. There is no flush flag, no transaction
 * handle, no retry policy and no batch form, because the legacy call has none of those things. The
 * transaction boundary that used to be implicit at request end is owned by
 * `src/adapters/mysql/UnitOfWork.ts` (AAP 0.6.6 M5), not by this collaborator, and audit stamping is
 * owned by the flush that runs behind it — `../domain/base/AuditableEntity` exposes the stamping
 * functions and they require an account reference this layer does not hold.
 *
 * A caller supplies the concrete repository member, for example a brand repository's save.
 *
 * @typeParam TEntity - The entity type this persister handles.
 */
export type EntityPersister<TEntity> = (entity: TEntity) => Promise<TEntity>;

/**
 * Removes an entity's row and its many-to-many link rows.
 *
 * THE PORT OF TWO LINES, and both belong to the implementation rather than to this signature:
 * `arguments.entity.removeAllManyToManyRelationships();` at [org/Hibachi/HibachiService.cfc:L61] and
 * `getHibachiDAO().delete(target=arguments.entity);` at [:L64]. The link-row clearing is stated as an
 * obligation of the implementation because it is a data-access concern — AAP 0.7.3 S2 inverted keeps
 * every statement out of `src/services/`, so an implementation in `src/adapters/mysql/**` is the only
 * layer that can perform it. It is recorded here rather than modelled as a second injected hook,
 * because inventing a hook for it would add a surface the legacy code does not have.
 *
 * REQUIRED, NOT INVENTED. Without it `delete` could not remove anything and would have to fabricate
 * its verdict, which the zero-placeholder standard forbids outright. It returns nothing because the
 * legacy DAO call returns nothing: the boolean verdict is derived by the flow around it, at
 * [org/Hibachi/HibachiService.cfc:L71] and [:L79].
 *
 * @typeParam TEntity - The entity type this remover handles.
 */
export type EntityRemover<TEntity> = (entity: TEntity) => Promise<void>;

/**
 * What this collaborator requires of a persistent catalog entity, and nothing more.
 *
 * An intersection of three already-declared contracts plus one accessor, so no member is re-typed here
 * that a sibling already owns:
 *
 *   - `ValidationSubject` from `../validation/Validator` supplies `getClassName()`, read by the
 *     disjunction at [model/service/HibachiService.cfc:L98], and `hasProperty()`, read by the gate at
 *     [:L91].
 *   - `AuditableEntity` from `../domain/base/AuditableEntity` is the four-field audit block declared
 *     byte-identically on all six in-scope entities. It is the right shape constraint for this
 *     collaborator because `save` is the write path, and the audit fields are exactly what the legacy
 *     ORM lifecycle hooks stamped on that path. This file does NOT stamp them: the hooks fired during
 *     flush, which sits behind {@link EntityPersister}, and the stamping functions need an account
 *     reference that only the port supplying it can provide.
 *   - `PopulationTarget<TPropertyName>` from `../domain/base/populate` is the field surface `populate`
 *     writes into, keyed by the entity's own declared property-name union rather than by an arbitrary
 *     index signature.
 *   - `getPrimaryIDValue()` is the argument GAP 3 would pass. Declared so the gap is TYPED rather than
 *     merely commented, per TR-5.
 *
 * Structural, never nominal: an entity satisfies this by declaring the members, and must not extend
 * anything (AAP 0.3.3, composition over inheritance). A hand-written literal satisfies it too, which
 * is what keeps this class unit-testable without a mocking library.
 *
 * @typeParam TPropertyName - The union of the entity's declared property names.
 */
export type BaseServiceEntity<TPropertyName extends string> = ValidationSubject &
  AuditableEntity &
  PopulationTarget<TPropertyName> & {
    /**
     * The entity's primary identifier value — the port of
     * [org/Hibachi/HibachiEntity.cfc:L244], and the argument
     * `settingService.updateAllSettingValuesToRemoveSpecificID( … )` receives at
     * [model/service/HibachiService.cfc:L95].
     *
     * Per IR-6 this is a 32-character identifier string generated in application code, with no
     * dashes: 107 of the 113 legacy entities declare `fieldtype="id" generator="uuid"
     * ormtype="string" length="32"`. `../ports/UniquePropertyPort` requires the same accessor of the
     * same entities, so this is the subtree's established shape rather than a new demand.
     */
    getPrimaryIDValue(): string;
  };

/**
 * The `activeFlag` accessor, narrowed to at run time rather than required of every entity.
 *
 * Module-private on purpose: it must NOT be part of {@link BaseServiceEntity}, because two of the six
 * in-scope entities genuinely do not declare `activeFlag` — see the measured list in the module
 * header — and requiring it would exclude them from a collaborator the legacy base class served.
 *
 * `boolean` is the declared ORM type on all four entities that do carry it, for example
 * `property name="activeFlag" ormtype="boolean";` at [model/entity/Product.cfc:L53]. No coercion
 * policy is invented for a stored null: AAP 0.8.4.1 records that no CFML runtime exists in this
 * environment, so CFML's own treatment of a null in that negation could not be compared against, and
 * AAP 0.7.3 S9 forbids guessing one.
 */
interface ActiveFlagReader {
  getActiveFlag(): boolean;
}

/**
 * Reports whether `entity` carries the `activeFlag` property, and narrows it so the accessor can be
 * called.
 *
 * The translation of `arguments.entity.hasProperty('activeFlag')` at
 * [model/service/HibachiService.cfc:L91] — see the reflection-to-guard note in the module header.
 * Two tests, deliberately, and they agree for every one of the six in-scope entities:
 *   - the ported property-presence contract, which is the direct analogue of the metadata key test at
 *     [org/Hibachi/HibachiTransient.cfc:L763];
 *   - the presence of the accessor itself, which is what makes the subsequent call type-safe under
 *     `strict` without a cast to a wider type. The probe reads through a `Partial` view, so nothing is
 *     widened and no suppression comment is needed.
 *
 * Pure and synchronous: it performs no data access and holds no state.
 *
 * @typeParam TSubject - The subject type being narrowed.
 * @param entity - The entity the gate is being evaluated for.
 * @returns `true` when the property is declared and its accessor is present.
 */
function entityReadsActiveFlag<TSubject extends ValidationSubject>(
  entity: TSubject,
): entity is TSubject & ActiveFlagReader {
  if (!entity.hasProperty(ACTIVE_FLAG_PROPERTY_NAME)) {
    return false;
  }

  const accessor: unknown = (entity as TSubject & Partial<ActiveFlagReader>).getActiveFlag;

  return typeof accessor === 'function';
}

/**
 * Reports whether a class name appears in the settings-cache allow-list at
 * [model/service/HibachiService.cfc:L98].
 *
 * The port of `listFindNoCase("Currency,FulfillmentMethod,OrderOrigin,PaymentTerm,PaymentMethod",
 * arguments.entity.getClassName())`. Case-insensitivity is the whole point of that legacy function and
 * is reproduced by folding both sides, rather than by assuming the caller's casing. Membership is
 * tested against the frozen tuple; there is no string-keyed lookup table and no dynamic dispatch of
 * any kind, since the result is a boolean and never a method to call.
 *
 * @param className - The subject's class name, from its own accessor.
 * @returns `true` when the name is one of the five listed by the legacy line.
 */
function clearsAllSettingsCacheForClassName(className: string): boolean {
  const normalizedClassName = className.toLowerCase();

  return SETTINGS_CACHE_CLEARING_CLASS_NAMES.some(
    (candidateClassName) => candidateClassName.toLowerCase() === normalizedClassName,
  );
}

/**
 * Everything {@link BaseService} needs, supplied once as typed constructor parameters.
 *
 * This is rule R1 applied to a base class: AAP 0.4.3.1 replaces DI/1 property injection and the
 * generated accessors that read it with explicit constructor parameters, and rule R2 replaces
 * `getService("name")` string lookup with typed references. The legacy body reached all five of the
 * concerns below implicitly — two through inheritance and three through the framework's own scope —
 * and every one of them is now named, typed and wired in exactly one place,
 * `src/config/container.ts`, which this file never imports.
 *
 * Every member is `readonly` and none is optional: an absent rule set or an absent persister would
 * turn a save into a silent no-op, which is worse than a compile error.
 *
 * @typeParam TEntity - The entity type this instance serves.
 * @typeParam TPropertyName - The union of that entity's declared property names.
 */
export interface BaseServiceCollaborators<
  TEntity extends BaseServiceEntity<TPropertyName>,
  TPropertyName extends string,
> {
  /**
   * The rule-set evaluation engine, whose `validate` entry point replaces
   * `arguments.entity.validate(context=…)` at [org/Hibachi/HibachiService.cfc:L151] and [:L55].
   *
   * The engine itself, not a re-typed function of it, so the context string and the returned bag keep
   * exactly the semantics `../validation/Validator` documents.
   */
  readonly validator: Validator;

  /**
   * This entity's transliterated validation document, from `src/validation/rules/`.
   *
   * One rule set serves both members: the legacy documents select by context inside a single file, so
   * `save` and `delete` differ in the context they pass, not in the document they consult.
   */
  readonly ruleSet: ValidationRuleSet<TEntity>;

  /**
   * This entity's declared population contract, the typed replacement for the metadata-driven
   * `getProperties()` walk the legacy `populate()` performed.
   *
   * Its `persistent` member is the port of `isPersistent()`, which is the first arm of the framework
   * guard at [org/Hibachi/HibachiService.cfc:L135] — see the module header for why that guard is not
   * reproduced as a run-time raise.
   */
  readonly propertyDescriptors: PropertyDescriptorSet<TEntity, TPropertyName>;

  /** The persistence step of [org/Hibachi/HibachiService.cfc:L155]. See {@link EntityPersister}. */
  readonly persist: EntityPersister<TEntity>;

  /**
   * The removal step of [org/Hibachi/HibachiService.cfc:L61] and [:L64]. See {@link EntityRemover}.
   */
  readonly remove: EntityRemover<TEntity>;
}

/**
 * The two local base-class overrides the in-scope catalog services inherit, as an injectable
 * collaborator.
 *
 * Ported from [model/service/HibachiService.cfc:L68-L84] and [:L86-L104]. Consumers take an instance
 * as a typed constructor parameter and delegate to it; NOTHING extends it (rule R3 — see the module
 * header). It is generic over the entity type so a delegating service keeps its concrete type with no
 * cast, and it is generic at the CLASS level for the reason set out under WHY THE CLASS IS GENERIC in
 * the module header.
 *
 * Exactly two public members, matching the two the legacy services actually inherit. The other three
 * members of the local class are not ported, and the wider framework surface — including
 * `onMissingMethod` — is not reproduced.
 *
 * @typeParam TEntity - The persistent entity type this instance serves.
 * @typeParam TPropertyName - The union of that entity's declared property names.
 *
 * @example
 * ```ts
 * // Wiring, in src/config/container.ts — one instance per entity type.
 * const brandBaseService = new BaseService({
 *   validator,
 *   ruleSet: brandValidationRules,
 *   propertyDescriptors: brandPropertyDescriptors,
 *   persist: (brand) => brandRepository.saveBrand(brand),
 *   remove: (brand) => brandRepository.removeBrand(brand),
 * });
 *
 * // Delegation, in BrandService.saveBrand — the literal translation of
 * // `return super.save(arguments.brand, arguments.data);` at model/service/BrandService.cfc:L76.
 * return this.baseService.save(brand, data);
 * ```
 */
export class BaseService<
  TEntity extends BaseServiceEntity<TPropertyName>,
  TPropertyName extends string,
> {
  /** See {@link BaseServiceCollaborators.validator}. */
  private readonly validator: Validator;

  /** See {@link BaseServiceCollaborators.ruleSet}. */
  private readonly ruleSet: ValidationRuleSet<TEntity>;

  /** See {@link BaseServiceCollaborators.propertyDescriptors}. */
  private readonly propertyDescriptors: PropertyDescriptorSet<TEntity, TPropertyName>;

  /** See {@link BaseServiceCollaborators.persist}. */
  private readonly persist: EntityPersister<TEntity>;

  /** See {@link BaseServiceCollaborators.remove}. */
  private readonly remove: EntityRemover<TEntity>;

  /**
   * Binds the collaborators once.
   *
   * A single parameter object rather than five positional parameters, because five same-shaped
   * arguments are trivially transposable at a wiring site and a transposition would still compile for
   * the two function-typed ones. Every field is copied into a `readonly` field, so the instance is
   * immutable after construction — which is what M7 requires of a singleton on a warm container.
   *
   * @param collaborators - The validator, rule set, property descriptors, persister and remover.
   */
  public constructor(collaborators: BaseServiceCollaborators<TEntity, TPropertyName>) {
    this.validator = collaborators.validator;
    this.ruleSet = collaborators.ruleSet;
    this.propertyDescriptors = collaborators.propertyDescriptors;
    this.persist = collaborators.persist;
    this.remove = collaborators.remove;
  }

  /**
   * Populates, validates and persists an entity, then runs the local activeFlag post-processing.
   *
   * The port of `public any function save(required any entity, struct data={}, string context="save")`
   * at [model/service/HibachiService.cfc:L86-L104]. Three parameters with the last two defaulted, in
   * the legacy order, so the two positional two-argument call sites —
   * [model/service/BrandService.cfc:L76] and [model/service/ProductService.cfc:L303] — translate
   * literally. Note that [model/service/ProductService.cfc:L264-L292] does NOT come through here at
   * all; see THE `super.save()` ASYMMETRY in the module header.
   *
   * THE SEQUENCE, each step against its locator:
   *   1. [:L88] `arguments.entity = super.save(argumentcollection=arguments);` — the inherited
   *      populate, validate and gated persist, with the entity REASSIGNED from the return value.
   *   2. [:L91] the two-part gate: no failures, AND the entity declares `activeFlag`.
   *   3. [:L93-L96] the removed-settings counter, declared once and assigned inside the branch.
   *   4. [:L98-L100] the cache-clearing disjunction, retained in full.
   *   5. [:L103] `return arguments.entity;` — the persisted instance, with an accumulated failure
   *      raised instead when validation did not pass. See HOW A FAILED SAVE IS SURFACED in the module
   *      header for why raising is the faithful translation and what was rejected.
   *
   * @param entity - The entity to save. Populated IN PLACE, so the caller's reference stays valid
   *   even when this method raises.
   * @param data - The incoming payload. Defaults to an empty payload exactly as [:L86] does, and
   *   population runs unconditionally as a result — see the subtlety recorded in the module header.
   *   Keys matching no declared property are silently ignored, as they were in CFML.
   * @param context - The validation context. Defaults to the literal `'save'` from [:L86] and is
   *   passed through UNCHANGED, so a caller may select any context the rule set declares.
   * @returns The persisted entity — the value produced by the persistence step, never merely the
   *   argument that was handed in.
   * @throws {ValidationError} the accumulated failure bag, keyed by property identifier, when the
   *   entity did not pass validation. Nothing is persisted in that case.
   */
  public async save(
    entity: TEntity,
    data: Record<string, unknown> = {},
    context: string = DEFAULT_SAVE_CONTEXT,
  ): Promise<TEntity> {
    /*
     * [model/service/HibachiService.cfc:L88] — the inherited path, whose contract is
     * [org/Hibachi/HibachiService.cfc:L133-L169]. Expressed as its three observable steps.
     *
     * STEP 1 — populate, [org/Hibachi/HibachiService.cfc:L143-L148]. Unconditional here because the
     * local override defaults `data` to an empty struct, so the framework's `structKeyExists` guard is
     * always satisfied through this path. `populate` mutates the target in place and returns it, which
     * is what keeps the caller's reference usable after a raise.
     *
     * No populate seam is supplied. The legacy local `populate()` override at
     * [model/entity/HibachiEntity.cfc:L56] assigned custom attribute values in the after-populate
     * position, and that omission is a flagged boundary gap already owned and documented by
     * `../domain/base/populate`. It is not re-flagged here, and no attribute collaborator is invented
     * to fill it.
     */
    const populatedEntity: TEntity = populate(entity, data, this.propertyDescriptors);

    /*
     * STEP 2 — validate, [org/Hibachi/HibachiService.cfc:L151]. The context is forwarded verbatim.
     *
     * The bag is RETURNED rather than written onto the entity, which is the contract
     * `../validation/Validator` documents; the legacy `hasErrors()` reads at
     * [org/Hibachi/HibachiService.cfc:L154] and [model/service/HibachiService.cfc:L91] are therefore
     * both asked of this bag. It is awaited: two of the ported constraints reach the database, so
     * validation is genuinely asynchronous here where it was synchronous in CFML.
     */
    const errors: ValidationError = await this.validator.validate(
      populatedEntity,
      this.ruleSet,
      context,
    );

    /*
     * STEP 3 — persist, gated, [org/Hibachi/HibachiService.cfc:L154-L155]. The gate is the reason a
     * failing entity is never written, and the reassignment is the reason this method can return the
     * persisted instance rather than the argument.
     */
    let savedEntity: TEntity = populatedEntity;

    if (!errors.hasErrors()) {
      savedEntity = await this.persist(populatedEntity);
    }

    /*
     * [model/service/HibachiService.cfc:L91] — back in the LOCAL override. The gate is TWO-PART and
     * stays two-part: no failures, and the entity declares `activeFlag`. The second conjunct is the
     * CFML reflection call translated to a structural narrowing; for `Option` and `OptionGroup`, which
     * declare no `activeFlag` at all, it is false and this whole block is skipped exactly as the
     * legacy line skips it.
     */
    if (!errors.hasErrors() && entityReadsActiveFlag(savedEntity)) {
      /*
       * [:L93] `var settingsRemoved = 0;` — and [:L95] declares `var settingsRemoved` a SECOND time
       * inside the branch below. In CFML both declarations name the same function-scoped variable, so
       * the inner assignment is visible to the test at [:L98]; in TypeScript a second declaration
       * would create a different block-scoped binding and silently break that data flow. Declared
       * ONCE here for that reason, and the legacy duplicate is recorded rather than repaired — see the
       * parity note in the module header. No D-number is minted for it.
       */
      let settingsRemoved = NO_SETTINGS_REMOVED;

      // [:L94] `if(!arguments.entity.getActiveFlag())`
      if (!savedEntity.getActiveFlag()) {
        /*
         * TODO(parity): GAP 3 — [model/service/HibachiService.cfc:L94-L96] called
         * `getService("settingService").updateAllSettingValuesToRemoveSpecificID(
         * arguments.entity.getPrimaryIDValue() )` here and assigned its COUNT of removed setting
         * values to the counter, which then feeds the gate at [:L98]. `settingService` is out of scope
         * — AAP 0.2.2.1 excludes `Setting`-prefixed components — and TR-5 forbids inventing a
         * stand-in: no cleanup hook, no settings mutator, and not `../ports/SettingResolverPort`,
         * which resolves configuration keys and does not write setting values.
         *
         * The branch is kept reachable and the assignment is kept, with the only count this port can
         * honestly report: with no collaborator to remove anything, nothing is removed, so the counter
         * is zero. The consequence is stated at GAP 4 below rather than used to simplify it.
         */
        settingsRemoved = NO_SETTINGS_REMOVED;
      }

      /*
       * [:L98] the disjunction, retained in FULL — both arms, and all five literal class names inside
       * {@link SETTINGS_CACHE_CLEARING_CLASS_NAMES}. For an in-scope entity the second arm can never
       * match, because every one of those five names is an excluded entity, and the first arm can
       * never be true either, because GAP 3 leaves the counter at zero. The rule is nevertheless the
       * observable behaviour, so it is reproduced rather than collapsed (AAP 0.8.2 guideline 4).
       */
      if (
        settingsRemoved > NO_SETTINGS_REMOVED ||
        clearsAllSettingsCacheForClassName(savedEntity.getClassName())
      ) {
        /*
         * TODO(parity): GAP 4 — [model/service/HibachiService.cfc:L98-L100] called
         * `getService("settingService").clearAllSettingsCache()` here. `settingService` is out of
         * scope, so the cache invalidation is not performed and no replacement is invented. There is
         * no cache in this layer to invalidate in any case: M7 makes this collaborator stateless by
         * construction, and any memoisation elsewhere in the subtree is request-scoped.
         */
      }
    }

    /*
     * [:L103] `return arguments.entity;`
     *
     * The legacy line returned the entity whether or not it had failed, because the entity carried its
     * own bag for the caller to inspect. The ported entities carry none, so an accumulated failure is
     * raised here instead — after the post-processing gate has been evaluated, so the two-part gate at
     * [:L91] keeps both of its arms live. The bag is raised as-is, with its keys and message keys
     * untouched, so `src/handlers/httpResponse.ts` can serialise it exactly as it expects.
     */
    if (errors.hasErrors()) {
      throw errors;
    }

    return savedEntity;
  }

  /**
   * Removes an entity when its delete-context validation passes, then runs the local cleanup gate.
   *
   * The port of `public boolean function delete(required any entity)` at
   * [model/service/HibachiService.cfc:L68-L84]. One parameter, matching the legacy arity and the
   * positional one-argument call at [model/service/ProductService.cfc:L326].
   *
   * THE SEQUENCE, each step against its locator:
   *   1. [:L70] `var deleteOK = super.delete(argumentcollection=arguments);` — the inherited path at
   *      [org/Hibachi/HibachiService.cfc:L49-L80]: validate under the `delete` context [:L55], and on
   *      success clear the many-to-many link rows [:L61], remove the row [:L64] and report `true`
   *      [:L71]; otherwise report `false` [:L79].
   *   2. [:L73] `if(deleteOK) { … }` — the cleanup gate, holding the two out-of-scope steps.
   *   3. [:L83] `return deleteOK;` — the verdict, returned UNCHANGED.
   *
   * THIS MEMBER NEVER RAISES ON A VALIDATION FAILURE, and that asymmetry against `save` is deliberate:
   * [model/service/ProductService.cfc:L326-L333] clears the product's default SKU before calling this,
   * and restores it only when it receives `false`. Raising would leave the product without its default
   * SKU. The failure messages are consequently not surfaced through this boolean — the legacy member's
   * own `boolean` return type did not surface them either. See the honest consequence recorded in the
   * module header.
   *
   * @param entity - The entity to remove.
   * @returns `true` when the entity passed delete-context validation and was removed, `false`
   *   otherwise. Never anything else, and never a raised error for a validation failure.
   */
  public async delete(entity: TEntity): Promise<boolean> {
    /*
     * [model/service/HibachiService.cfc:L70] — the inherited path. Its first step is
     * `arguments.entity.validate(context="delete")` at [org/Hibachi/HibachiService.cfc:L55], where the
     * context is hard-coded, which is why this member takes no context parameter.
     *
     * The same rule set serves both members: the ported documents select by context internally, and
     * the delete-context guards — a transaction-existence check, a default-SKU check, dependent
     * collection checks and a system-code check — live in the same rule set as the save-context rules.
     */
    const errors: ValidationError = await this.validator.validate(
      entity,
      this.ruleSet,
      DELETE_VALIDATION_CONTEXT,
    );

    /*
     * [org/Hibachi/HibachiService.cfc:L58] the gate, [:L61] and [:L64] the removal, [:L71] `true`,
     * [:L79] `false`. The verdict is computed here and then read by the cleanup gate below, exactly as
     * the legacy local variable is.
     *
     * Clearing the many-to-many link rows is part of {@link EntityRemover}'s documented obligation
     * rather than a second injected step, because it is a data-access concern and this layer composes
     * no statements at all.
     */
    let deleteOK = false;

    if (!errors.hasErrors()) {
      await this.remove(entity);
      deleteOK = true;
    }

    // [model/service/HibachiService.cfc:L73] `if(deleteOK)` — the cleanup gate, reproduced exactly:
    // both steps sit inside it, so neither can run for an entity that was not removed.
    if (deleteOK) {
      /*
       * TODO(parity): GAP 1 — [model/service/HibachiService.cfc:L76] called
       * `getService("settingService").removeAllEntityRelatedSettings( entity=arguments.entity )` here.
       * `settingService` is out of scope (AAP 0.2.2.1), so the entity's related setting rows are not
       * removed and no stand-in collaborator is invented for them (TR-5).
       *
       * TODO(parity): GAP 2 — [model/service/HibachiService.cfc:L79] called
       * `getService("commentService").removeAllEntityRelatedComments( entity=arguments.entity )` here.
       * No comment family is in scope anywhere in this slice, so the entity's related comment rows are
       * not removed and, again, nothing is invented to stand in.
       */
    }

    // [model/service/HibachiService.cfc:L83] — the boolean, unchanged.
    return deleteOK;
  }
}
