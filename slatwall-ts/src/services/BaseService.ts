/**
 * `BaseService` — the injectable `save` / `delete` collaborator that replaces CFML template-method
 * inheritance for the extracted Catalog slice.
 *
 * Authority: AAP 0.4.1.8 — the LOCAL `save()` and `delete()` overrides at
 * `model/service/HibachiService.cfc:L86` and `:L68` become an injectable collaborator (IR-8, rule R3).
 *
 * =============================================================================================
 * IR-8 — THIS IS THE LOCAL OVERRIDE, NOT THE FRAMEWORK BASE. THE DIFFERENCE IS THE FILE.
 * =============================================================================================
 * The hierarchy is two levels deep. `model/service/HibachiService.cfc:L49` extends the
 * FULLY-QUALIFIED `Slatwall.org.Hibachi.HibachiService`, while all four in-scope services declare
 * `extends="HibachiService"` with NO package prefix — `model/service/ProductService.cfc:L49`,
 * `model/service/SkuService.cfc:L49`, `model/service/BrandService.cfc:L49` and
 * `model/service/OptionService.cfc:L49`. They therefore inherit the LOCAL class, and the local class
 * ADDS behaviour the framework base does not have: the settings and comments cleanup after a
 * successful removal (`model/service/HibachiService.cfc:L76` and `:L79`) and the activeFlag
 * post-processing block (`:L91-L101`). That added behaviour is the whole reason this file exists.
 *
 * =============================================================================================
 * R3 — COMPOSITION, NEVER INHERITANCE. NOTHING IN `src/services/` MAY EXTEND THIS CLASS.
 * =============================================================================================
 * Each converted service takes an instance of this class as a TYPED CONSTRUCTOR PARAMETER and
 * delegates to it (AAP 0.4.3.3). This class extends nothing; the only occurrences of the `extends`
 * keyword here are generic type-parameter CONSTRAINTS, which describe a shape rather than establish an
 * inheritance edge. Two consequences are deliberate:
 *   - The surface is narrowed to exactly the two members the in-scope services actually inherit. The
 *     wider `org/Hibachi/HibachiService` surface — above all the `onMissingMethod` prefix dispatch at
 *     `org/Hibachi/HibachiService.cfc:L255-L281` — is not reproduced; IR-1 replaces that synthesis
 *     with explicit declarations on each service.
 *   - The local class's other three members are not ported — `getSlatwallScope()`
 *     (`model/service/HibachiService.cfc:L51`), `getHasAttributeByEntityNameAndPropertyIdentifier()`
 *     (`:L56`) and `getEntityHasAttributeByEntityName()` (`:L61`) — because all three reach
 *     `getService("attributeService")` (`:L62`), which AAP 0.2.2.1 places out of scope, and no
 *     in-scope member calls any of them.
 *
 * =============================================================================================
 * THE `super.save()` ASYMMETRY — THE MOST MISLEADING THING HERE
 * =============================================================================================
 * A reader will assume the three catalog save paths are uniform. They are NOT, and "harmonising" them
 * would change behaviour (AAP 0.8.2 guideline 4):
 *
 *   model/service/ProductService.cfc:L264-L292  saveProduct      DOES NOT reach this collaborator.
 *       It hand-rolls the whole sequence inline — populate at `:L266`, unique URL title at
 *       `:L268-L270`, validate at `:L273`, SKU creation and image processing at `:L279` and `:L282` —
 *       and then persists with `getHibachiDAO().save(target=arguments.product)` at `:L286-L288`, the
 *       DAO DIRECTLY, bypassing `super.save()`. It therefore NEVER runs the activeFlag and settings
 *       post-processing of `model/service/HibachiService.cfc:L91-L101`.
 *   model/service/ProductService.cfc:L303       saveProductType  `super.save(arguments.productType,
 *       arguments.data)` — positional two-argument, result REASSIGNED onto the argument. Runs the
 *       post-processing.
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
 * The local `save()` at `model/service/HibachiService.cfc:L88` delegates its real work to
 * `org/Hibachi/HibachiService.cfc:L133-L169`. AAP 0.8.3.2 retires that framework outright, so its
 * CONTRACT is reproduced and its CODE is not carried:
 *
 *   org/Hibachi/HibachiService.cfc:L143-L148  populate the entity from `data`
 *   org/Hibachi/HibachiService.cfc:L151       validate it under `context`
 *   org/Hibachi/HibachiService.cfc:L154-L155  when there are no failures, persist through the DAO and
 *                                             REASSIGN the entity from the return value
 *   org/Hibachi/HibachiService.cfc:L168       return the entity
 *
 * Each step becomes an injected, typed collaborator: `populate` from `../domain/base/populate`, the
 * `validate` entry point of `../validation/Validator`, and {@link EntityPersister} for the DAO call.
 *
 * ONE SUBTLETY THAT IS EASY TO INVERT, AND IT IS BEHAVIOUR. The FRAMEWORK signature at
 * `org/Hibachi/HibachiService.cfc:L133` declares `struct data` with NO default, and `:L143` guards
 * population with `structKeyExists(arguments,"data")` — so a framework-level save with no payload does
 * not populate at all. The LOCAL override at `model/service/HibachiService.cfc:L86` declares
 * `struct data={}` and forwards with `argumentcollection=arguments`, so the key ALWAYS exists by the
 * time the guard runs. Through this collaborator population is therefore UNCONDITIONAL, with an empty
 * payload when the caller supplies none, and {@link BaseService.save} always populates. Making
 * population conditional here would apply a framework-level behaviour at the wrong level.
 *
 * The framework's own type guard at `org/Hibachi/HibachiService.cfc:L135-L137` is deliberately NOT
 * reproduced as a run-time raise. Both of its arms are structural here instead: the generic bound
 * admits only object types, and persistence is declared on the descriptor set. Its message text also
 * names the `onMissingMethod` invocation style as the likely cause — a failure mode IR-1 abolishes —
 * and reproducing the raise would mean inventing a message string, which AAP 0.8.2 guideline 2
 * forbids. It is cited so a reader can see it was considered.
 *
 * =============================================================================================
 * WHY THE CLASS IS GENERIC AND THE MEMBERS ARE NOT — THE CENTRAL JUDGMENT CALL (guideline 6)
 * =============================================================================================
 * `save` must accept exactly three parameters with the last two defaulted, so that
 * `model/service/BrandService.cfc:L76` and `model/service/ProductService.cfc:L303` keep working as
 * two-argument positional calls. Two collaborators are irreducibly ENTITY-SPECIFIC: a
 * `ValidationRuleSet` carries typed value readers for one subject type, and a `PropertyDescriptorSet`
 * carries typed accessors for one target type. With only three parameters available they cannot arrive
 * per call, and resolving them from the entity's class name would be exactly the string-keyed dispatch
 * AAP 0.7.3 S3 forbids. Method-level generics are therefore impossible without one of those forbidden
 * routes, and the class is generic instead: collaborators are bound once at construction, so `Brand`
 * in yields `Brand` out and `ProductType` in yields `ProductType` out with no cast at any call site.
 *
 * The consequence is stated plainly rather than left to be discovered: there is ONE instance per
 * entity type. A converted `ProductService` takes a `BaseService<ProductType, …>` for
 * `saveProductType` and a `BaseService<Product, …>` for `deleteProduct`, because those are two
 * different entity types and the legacy base class served both only by being untyped.
 *
 * =============================================================================================
 * HOW A FAILED SAVE IS SURFACED — AND WHY `delete` DOES THE OPPOSITE
 * =============================================================================================
 * In CFML every entity carries its own error bag, so `model/service/HibachiService.cfc:L103` could
 * return an entity that had already failed validation and let the caller ask it. The ported entities
 * carry NO bag — `../validation/Validator` returns the bag instead, so the engine depends on no
 * entity-side error accessor. Something must therefore carry a failure out of `save`, and the subtree
 * already fixes which: `src/handlers/httpResponse.ts` tests `error instanceof ValidationError` as its
 * FIRST branch. So `save` accumulates exactly as the legacy flow did, evaluates the whole
 * post-processing gate, and only then raises the accumulated bag.
 *
 * Nothing is lost by raising rather than returning, because `populate` MUTATES ITS TARGET IN PLACE and
 * hands the same object back: a caller that supplied the entity still holds the populated entity after
 * the raise, which is what the legacy caller inspected. Returning an `{ entity, errors }` pair was
 * rejected — it would force every delegating service to destructure where the legacy line was
 * `return super.save(arguments.brand, arguments.data);`, and it would let a caller ignore a failure
 * silently, which the legacy `hasErrors()` gate never permitted.
 *
 * `delete` is deliberately ASYMMETRIC and must NOT raise. `org/Hibachi/HibachiService.cfc:L79` returns
 * a boolean verdict on validation failure, and `model/service/ProductService.cfc:L326-L333` depends on
 * receiving `false`: it restores the default SKU it had temporarily cleared and returns false. Raising
 * there would strand the product with a null default SKU. The verdict is returned unchanged.
 *
 * ONE CONSEQUENCE, FLAGGED RATHER THAN SMOOTHED OVER. Because `delete` returns only a boolean, the
 * messages produced by the delete-context guards in the seven catalog validation documents are not
 * surfaced through it. That matches the legacy member's own declaration —
 * `model/service/HibachiService.cfc:L68` returns the verdict and nothing else, and the messages were
 * reachable only through the entity's own bag, which the port's entities do not carry. A caller that
 * needs them can run the same rule set under the `delete` context through the validator's dry-run
 * mode. No new surface is invented here to carry them.
 *
 * =============================================================================================
 * THE FOUR OUT-OF-SCOPE CALLS — CROSSED THROUGH TWO DECLARED PORTS (TR-5), NOT LEFT EMPTY
 * =============================================================================================
 * TR-5: "Cross the scope boundary only through a declared port. Where an in-scope member depends on
 * an out-of-scope collaborator, the port interface is declared, THE MEMBER IS IMPLEMENTED AGAINST IT,
 * and the gap is flagged. The member is never quietly dropped from the interface."
 *
 * Both members are fully declared and their in-scope control flow is reproduced exactly. Four points
 * reach collaborators AAP 0.2.2.1 excludes — the `Setting`-prefixed components under `model/` are
 * three files, and no comment family is in scope anywhere:
 *
 * The four effects are observable: three remove or rewrite rows and one invalidates a cache. Omitting
 * them leaves stale setting values pointing at deactivated and deleted entities, and orphaned comment
 * rows behind deleted ones. That is a data-correctness regression, not a documented boundary.
 *
 * ⭐ AAP-4 — ALL FOUR ARE NOW CALLED, THROUGH {@link EntitySettingCleanupPort} and
 * {@link EntityCommentCleanupPort}. This file previously reproduced them as EMPTY branches carrying
 * `TODO(parity)` comments, on the reasoning that declaring a collaborator would be "inventing a
 * stand-in". That inverted TR-5: the rule's second clause REQUIRES the port and requires the member to
 * be implemented against it; what it forbids is porting the out-of-scope SERVICE. AAP 0.2.2.7 already
 * crosses seven boundaries in exactly this way.
 *
 * The empty branches were not merely inert, and this is the part worth stating plainly. Assigning a
 * hard zero at GAP 3 stranded the FIRST ARM of the disjunction at [:L98] permanently false, and since
 * the second arm can never match an in-scope entity either (see the next section), GAP 4 was
 * UNREACHABLE CODE rather than a call that simply did nothing. Two effects the legacy performs were
 * therefore absent: an entity's identifier was never stripped out of stored setting values on
 * deactivation, and its related setting and comment rows were never removed on deletion.
 *
 * No optional "cleanup hook", "settings mutator" or "comment remover" parameter is invented: the three
 * boundary collaborators are REQUIRED fields of {@link BaseServiceCollaborators}, because an optional
 * one could be omitted at a wiring site and would restore the reported behaviour with no error
 * anywhere. And `../ports/SettingResolverPort` is NOT repurposed: that port RESOLVES configuration
 * keys, whereas GAP 3 and GAP 4 write setting values and invalidate a cache, so borrowing it would
 * corrupt a sibling contract.
 *
 * TODO(boundary): both port implementations belong to whoever brings `model/service/SettingService.cfc`
 * and a comment service into scope. Nothing in this subtree implements either, and nothing here may.
 *
 * HOW THIS WAS VERIFIED — FIVE DELIBERATE BREAKS, EACH REVERTED. Every claim above was measured, not
 * argued. The type-level checks and the behavioural checks catch DIFFERENT things, and the gap between
 * the two columns is the point:
 *
 *   break                                                    compiler   behaviour
 *   GAPs 1 and 2 run concurrently via `Promise.all`           clean      2 failures
 *   GAP 3 discards the count and hard-codes zero              clean      1 failure
 *   the cleanup steps escape the `if(deleteOK)` gate          clean      1 failure
 *   the activeFlag guard probes for `getActiveFlag` again      clean      3 failures
 *   `updateAllSettingValuesToRemoveSpecificID` returns void    1 error    n/a
 *
 * Four of the five are invisible to `tsc`: reordering two calls of the same shape, dropping a return
 * value, widening a gate and reverting a run-time predicate are all perfectly well-typed programs. Only
 * the port's `Promise<number>` return is enforceable statically, and it is enforced. The third row is
 * worth singling out: the blocked-delete case was NOT covered by the first draft of the verification and
 * the break passed unnoticed until a test for it was added, which is the whole argument for running the
 * breaks rather than trusting the assertions to be complete.
 *
 * =============================================================================================
 * THE FIVE CLASS NAMES AT L98 ARE ALL OUT OF SCOPE — SO THE DISJUNCTION HAS ONE LIVE ARM
 * =============================================================================================
 * `model/service/HibachiService.cfc:L98` reads
 * `if(settingsRemoved gt 0 || listFindNoCase("Currency,FulfillmentMethod,OrderOrigin,PaymentTerm,PaymentMethod", arguments.entity.getClassName()))`.
 * Every one of those five entity names is excluded by AAP 0.2.2.1 — `Currency*` is two files,
 * `Fulfillment*` two, `Payment*` five, and `OrderOrigin` falls under the eighteen `Order*` files — so
 * for any IN-SCOPE entity the second arm can never match and the branch is reachable only through
 * `settingsRemoved gt 0`.
 *
 * That first arm IS now genuinely live (AAP-4). The counter is supplied by GAP 3, which calls
 * {@link EntitySettingCleanupPort.updateAllSettingValuesToRemoveSpecificID} and takes the count it
 * resolves, so whether the cache-clearing branch fires depends on how many setting values actually
 * referenced the deactivated entity — which is exactly the legacy behaviour. Before this port existed
 * the arm was pinned false and the branch was unreachable.
 *
 * That is recorded, NOT simplified away. The full two-armed disjunction and all five literal names are
 * retained in {@link SETTINGS_CACHE_CLEARING_CLASS_NAMES}, because the rule itself is the observable
 * behaviour and collapsing it would delete a fact about the legacy system (AAP 0.8.2 guideline 4).
 *
 * =============================================================================================
 * PARITY NOTE — THE DUPLICATE `var settingsRemoved`, AND WHY BLOCK SCOPING FORCED ONE DECLARATION
 * =============================================================================================
 * The legacy body declares the counter TWICE: `var settingsRemoved = 0;` at
 * `model/service/HibachiService.cfc:L93` and `var settingsRemoved = …` again inside the if-branch at
 * `:L95`. In CFML a `var` is function-scoped, so the second declaration re-declares the SAME variable
 * and its assignment is visible to the test at `:L98`. In TypeScript a second declaration inside the
 * block would create a DIFFERENT, block-scoped binding, the assignment would be invisible at `:L98`,
 * and the branch's only live arm would be silently dead. The counter is therefore declared ONCE in the
 * outer scope and assigned inside the branch — the legacy duplicate is recorded, not repaired, and the
 * single declaration is the only translation that preserves the observable data flow.
 *
 * =============================================================================================
 * `hasProperty('activeFlag')` — CFML REFLECTION BECOMES A STRUCTURAL NARROWING (guideline 6)
 * =============================================================================================
 * [model/service/HibachiService.cfc:L91] gates on `arguments.entity.hasProperty('activeFlag')`, which
 * is [org/Hibachi/HibachiTransient.cfc:L763] — a key test against the entity's property metadata
 * struct. TypeScript has no metadata to reflect over, so the check becomes
 * {@link entityReadsActiveFlag}, a type-guard predicate that both asks the ported subject contract
 * and confirms the value is a known boolean, so it is readable without a cast under `strict`. The gate
 * at the call site stays exactly TWO-PART, as the legacy line is.
 *
 * ⭐ AAP-4 — THE PREDICATE USED TO CHECK FOR A `getActiveFlag()` METHOD, AND THAT MADE THE WHOLE BLOCK
 * DEAD. The legacy accessor is generated by `accessors=true` on the entity component, so in CFML its
 * existence follows from the property's; the ported entities have no generated accessors and expose the
 * value as a field, so the probe answered `false` for all six and `[:L91-L100]` never executed. See
 * {@link ActiveFlagReader} for the full record and the measurement.
 *
 * WHICH ENTITIES DECLARE IT: `model/entity/Product.cfc:L53`, `model/entity/Sku.cfc:L53` (the only one
 * with `default="1"`), `model/entity/ProductType.cfc:L54` and `model/entity/Brand.cfc:L53`. It is
 * declared NOWHERE in `model/entity/Option.cfc` or `model/entity/OptionGroup.cfc`, so for those two
 * the legacy gate is false and the whole post-processing block is skipped — and the predicate
 * reproduces that. Both entity types that actually reach this collaborator's `save`, `ProductType` and
 * `Brand`, do declare it.
 *
 * `getClassName()` and `getPrimaryIDValue()` are framework members
 * (`org/Hibachi/HibachiObject.cfc:L135`, `org/Hibachi/HibachiEntity.cfc:L244`). Per AAP 0.8.3.2 the
 * contract is read and the code is never carried: both are modelled as DOMAIN-SIDE accessors on the
 * entity shape, `getClassName()` through the ported subject contract and `getPrimaryIDValue()` on
 * {@link BaseServiceEntity}, where `../ports/UniquePropertyPort` already requires it of these same
 * entities.
 *
 * =============================================================================================
 * M7 — STATELESS BY CONSTRUCTION
 * =============================================================================================
 * DI/1 makes services SINGLETONS while entities and process objects are transient, and a singleton on
 * a warm Lambda container is shared across invocations (AAP 0.6.6 M7). This file therefore holds NO
 * mutable state: every field is `readonly` and injected, `settingsRemoved` is a local of one call, and
 * the only module-scope values are frozen constants. Nothing can bleed between invocations or between
 * tenants, and nothing needs clearing between them.
 *
 * =============================================================================================
 * ARCHITECTURAL POSITION — AAP 0.7.3 S4
 * =============================================================================================
 * Every import is drawn from a layer this folder may reach: `../domain/**`, `../validation/**` and
 * `../errors/**`. Nothing comes from `../adapters/**`, `../config/**`, `../handlers/**` or
 * `../integrations/**` — `src/config/container.ts` performs the wiring and is never imported from
 * here. AAP 0.7.3 S2 inverts into a prohibition for `src/services/`: a service never composes a query
 * and never sees a fragment of one, so persistence reaches the database only through the injected
 * {@link EntityPersister} and {@link EntityRemover}. This boundary is what makes AAP 0.8.3.8 real —
 * the extracted services are callable and deployable without converting the rest of Slatwall.
 *
 * =============================================================================================
 * TEST PROVENANCE — NET-NEW (AAP 0.7.3 S6, 0.8.3.7)
 * =============================================================================================
 * No legacy test exists for `model/service/HibachiService.cfc`, nor for any of the four catalog
 * services (AAP 0.6.5.2), so coverage for both members here is entirely NET-NEW rather than a
 * replication of legacy coverage. Every collaborator is an interface or a minimal local function type,
 * never a concrete adapter, which is what lets a test construct this class against in-memory doubles
 * with no mocking library — the legacy suite had none and booted the whole framework application
 * instead (AAP 0.4.3.6).
 */

import type { AuditableEntity } from '../domain/base/AuditableEntity';
import {
  populate,
  type PopulationTarget,
  type PropertyDescriptorSet,
} from '../domain/base/populate';
import type { ValidationError } from '../errors/ValidationError';
import type { PopulationAuthorizationPort } from '../ports/AccountContextPort';
import type {
  ValidationContext,
  ValidationRuleSet,
  ValidationSubject,
  Validator,
} from '../validation/Validator';

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
const DEFAULT_SAVE_CONTEXT: ValidationContext = 'save';

/**
 * The context the inherited removal path validates under, from
 * [org/Hibachi/HibachiService.cfc:L55] — `arguments.entity.validate(context="delete")`.
 *
 * Hard-coded there, and therefore hard-coded here: `delete` takes no context parameter, exactly as
 * [model/service/HibachiService.cfc:L68] declares only `required any entity`.
 */
const DELETE_VALIDATION_CONTEXT: ValidationContext = 'delete';

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
 * The two setting-side effects the LOCAL override reaches out of scope for, declared as one port.
 *
 * ⭐ AAP-4 — WHY THIS EXISTS, AND WHY LEAVING THE CALL POINTS EMPTY WAS THE WRONG READING OF TR-5.
 * `model/service/HibachiService.cfc` makes three calls into `settingService`, and every one of them
 * has an observable effect on stored data:
 *
 *   `:L76`      `removeAllEntityRelatedSettings( entity=arguments.entity )`
 *   `:L94-L96`  `updateAllSettingValuesToRemoveSpecificID( arguments.entity.getPrimaryIDValue() )`
 *   `:L98-L100` `clearAllSettingsCache()`
 *
 * This file previously reproduced all three as EMPTY branches behind `TODO(parity)` comments, on the
 * reasoning that declaring a collaborator would be "inventing a stand-in" forbidden by TR-5. That
 * inverted the rule. TR-5 reads: "Cross the scope boundary only through a declared port. Where an
 * in-scope member depends on an out-of-scope collaborator, THE PORT INTERFACE IS DECLARED, THE MEMBER
 * IS IMPLEMENTED AGAINST IT, and the gap is flagged. The member is never quietly dropped from the
 * interface." The port is the REQUIRED mechanism; what TR-5 forbids is porting the out-of-scope
 * SERVICE. AAP 0.2.2.7 already crosses seven boundaries in exactly this way, so this is the subtree's
 * established pattern rather than a new liberty.
 *
 * ⛔ `../ports/SettingResolverPort` IS NOT REPURPOSED, AND THE DISTINCTION IS NOT COSMETIC. That port
 * READS effective configuration values for the eighteen keys IR-2 enumerates. These three members
 * WRITE setting rows and invalidate a cache. Borrowing the resolver would corrupt a sibling contract
 * by widening a read-only port into a mutating one.
 *
 * ⚠️ THE RETURN VALUE OF `updateAllSettingValuesToRemoveSpecificID` IS LOAD-BEARING, NOT INCIDENTAL.
 * `model/service/HibachiService.cfc:L95` assigns it to `settingsRemoved` and `:L98` then tests
 * `settingsRemoved gt 0` as the FIRST ARM of the disjunction that decides whether the cache is
 * cleared. A `Promise<void>` signature here would strand that arm permanently false and make the
 * cache-clearing branch unreachable — which is precisely what the empty branch did.
 *
 * One port per legacy service, rather than one combined "cleanup" port, so the boundary stays legible:
 * a reader can see at the wiring site that two distinct out-of-scope components are being stood in
 * for. See also {@link EntityCommentCleanupPort}.
 *
 * TODO(boundary): the implementation belongs to the SettingService port family under AAP 0.2.2.7 and
 * is written by whoever brings `model/service/SettingService.cfc` into scope. Nothing in this subtree
 * implements it, and nothing here may.
 */
export interface EntitySettingCleanupPort {
  /**
   * Removes every setting row related to one entity — `model/service/HibachiService.cfc:L76`, inside
   * the `if(deleteOK)` gate at `:L73`.
   *
   * `unknown` rather than `TEntity`, deliberately: the legacy call passes the entity by NAMED argument
   * `entity=arguments.entity` and the receiving component is generic over every entity in the
   * platform, so narrowing the parameter here would claim knowledge of a contract this side of the
   * boundary does not own.
   */
  removeAllEntityRelatedSettings(entity: MaintenanceEntityRef): Promise<void>;

  /**
   * Strips one primary identifier out of every stored setting value and resolves HOW MANY setting
   * values were changed — `model/service/HibachiService.cfc:L94-L96`.
   *
   * The count is the contract, not a convenience: `:L98` reads it. An implementation that cannot
   * count must still resolve a truthful number rather than a placeholder.
   */
  updateAllSettingValuesToRemoveSpecificID(primaryIDValue: string): Promise<number>;

  /**
   * Invalidates the whole settings cache — `model/service/HibachiService.cfc:L98-L100`.
   *
   * ⚠️ The cache being invalidated lives inside `settingService`, on the FAR side of the boundary. M7
   * makes this collaborator itself stateless, so there is nothing in THIS layer to clear; that is
   * exactly why the notification must still be sent rather than skipped. Skipping it would silently
   * decide, on the owner's behalf, that its cache does not need invalidating.
   */
  clearAllSettingsCache(): Promise<void>;
}

/**
 * The comment-side effect the LOCAL override reaches out of scope for.
 *
 * ⭐ AAP-4. `model/service/HibachiService.cfc:L79` calls
 * `getService("commentService").removeAllEntityRelatedComments( entity=arguments.entity )` inside the
 * same `if(deleteOK)` gate as {@link EntitySettingCleanupPort.removeAllEntityRelatedSettings}. No
 * comment family is in scope anywhere in this slice — AAP 0.2.2.1 lists no `Comment*` group because
 * there is none to list — so this is a boundary crossing with no in-scope counterpart at all, which
 * makes declaring it MORE important rather than less: nothing else in the subtree records that the
 * legacy delete path had a second cleanup step.
 *
 * Separate from the setting port because it stands for a DIFFERENT out-of-scope component. Folding
 * both into one interface would let a wiring site satisfy the comment obligation with a setting
 * adapter and lose the distinction the legacy source draws.
 *
 * TODO(boundary): the implementation belongs to whoever brings a comment service into scope. Nothing
 * in this subtree implements it, and nothing here may.
 */
export interface EntityCommentCleanupPort {
  /**
   * Removes every comment row related to one entity — `model/service/HibachiService.cfc:L79`.
   *
   * `unknown` for the same reason as the setting equivalent: the legacy call passes the entity by
   * named argument to a component generic over every entity in the platform.
   */
  removeAllEntityRelatedComments(entity: MaintenanceEntityRef): Promise<void>;
}

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
 *   - `getPrimaryIDValue()` is the argument GAP 3 passes to
 *     {@link EntitySettingCleanupPort.updateAllSettingValuesToRemoveSpecificID}, which is why the
 *     accessor is declared here rather than merely mentioned in a comment (TR-5).
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
 * The `activeFlag` value, narrowed to at run time rather than required of every entity.
 *
 * Module-private on purpose: it must NOT be part of {@link BaseServiceEntity}, because two of the six
 * in-scope entities genuinely do not declare `activeFlag` — see the declaration list in the module
 * header — and requiring it would exclude them from a collaborator the legacy base class served.
 *
 * ⭐ AAP-4 — A FIELD, NOT AN ACCESSOR, AND THE CORRECTION IS LOAD-BEARING. This was previously
 * declared as `getActiveFlag(): boolean`, transliterating the legacy call shape at
 * [model/service/HibachiService.cfc:L94]. That accessor exists in the legacy only because the entity
 * components declare `accessors=true` — [model/entity/Brand.cfc:L49] does, and CFML then generates
 * `getActiveFlag()` for [model/entity/Brand.cfc:L53]'s `property name="activeFlag"` automatically. The
 * ported entities carry no generated accessors at all: they expose the value as a FIELD, and NOT ONE of
 * the six declares a `getActiveFlag` method. Requiring the accessor therefore made
 * {@link entityReadsActiveFlag} return `false` for EVERY in-scope entity, which made the whole
 * `[:L91-L100]` post-processing block — including both setting-side effects — unreachable code. It was
 * measured, not reasoned about: a `BaseService` driven with a real `Brand` whose `activeFlag` was
 * `false` reached neither call.
 *
 * `boolean` is the declared ORM type on all four entities that do carry it, for example
 * `property name="activeFlag" ormtype="boolean";` at [model/entity/Product.cfc:L53]. Optional here
 * because the legacy default is asymmetric and the port reproduces that asymmetry exactly: only
 * [model/entity/Sku.cfc:L53] declares `default="1"`, so a new SKU is active, while
 * [model/entity/Brand.cfc:L53], [model/entity/Product.cfc:L53] and [model/entity/ProductType.cfc:L54]
 * declare no default and leave the property null. No coercion policy is invented for that null: AAP
 * 0.8.4.1 records that no CFML runtime exists in this environment, so CFML's own treatment of a null in
 * `!getActiveFlag()` could not be compared against, and AAP 0.7.3 S9 forbids guessing one.
 */
interface ActiveFlagReader {
  readonly activeFlag: boolean;
}

/**
 * Reports whether `entity` carries a KNOWN `activeFlag` value, and narrows it so the value can be read.
 *
 * The translation of `arguments.entity.hasProperty('activeFlag')` at
 * [model/service/HibachiService.cfc:L91] — see the reflection-to-guard note in the module header.
 * Two tests, deliberately:
 *   - the ported property-presence contract, which is the direct analogue of the metadata key test at
 *     [org/Hibachi/HibachiTransient.cfc:L763]. This is the legacy gate itself, and for an entity
 *     declaring `accessors=true` it is the ONLY gate, because the accessor's existence follows from the
 *     property's;
 *   - that the value is actually a boolean. This is what makes the subsequent read type-safe under
 *     `strict` without a cast to a wider type, and it is also where the undecidable case is parked
 *     rather than decided. A null `activeFlag` — legal on three of the four entities, per
 *     {@link ActiveFlagReader} — leaves the block unentered instead of being coerced to "inactive" and
 *     silently stripping the entity's identifier out of every stored setting value. Declining to
 *     coerce is the recorded S9 position; it is NOT an accident of the guard, which is exactly what the
 *     previous accessor test was.
 *
 * The probe reads through a `Partial` view, so nothing is widened and no suppression comment is needed.
 *
 * Pure and synchronous: it performs no data access and holds no state.
 *
 * @typeParam TSubject - The subject type being narrowed.
 * @param entity - The entity the gate is being evaluated for.
 * @returns `true` when the property is declared and its value is a known boolean.
 */
function entityReadsActiveFlag<TSubject extends ValidationSubject>(
  entity: TSubject,
): entity is TSubject & ActiveFlagReader {
  if (!entity.hasProperty(ACTIVE_FLAG_PROPERTY_NAME)) {
    return false;
  }

  const value: unknown = (entity as TSubject & Partial<ActiveFlagReader>).activeFlag;

  return typeof value === 'boolean';
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
/**
 * The narrow identity surface the two maintenance ports need in order to act on an entity.
 *
 * Deliberately two members rather than the whole entity type. The legacy calls pass `entity=` and the
 * out-of-scope services then read the entity's class name and primary identifier to locate the rows
 * they own — so those two reads ARE the dependency, and declaring only them keeps an implementation of
 * either port from reaching into catalog fields it has no business seeing (S4). Every
 * {@link BaseServiceEntity} satisfies this structurally, so no adapter is needed at the call sites.
 */
export interface MaintenanceEntityRef {
  /** [org/Hibachi/HibachiObject.cfc:L135] — the bare class name. */
  getClassName(): string;

  /** [org/Hibachi/HibachiEntity.cfc:L244] — the primary identifier's value. */
  getPrimaryIDValue(): string;
}

/* THERE IS NO `EntitySettingMaintenancePort`. It was declared as a same-shape rival of
 * {@link EntitySettingCleanupPort} — identical members, identical legacy locators, a different
 * noun — and two port interfaces for one collaborator is a drift hazard, not a choice: a
 * wiring site satisfying one of them would leave the other unimplemented with nothing
 * reporting it. EntitySettingCleanupPort is the surviving declaration and it KEPT the stronger
 * typing the rival introduced: its entity parameter is {@link MaintenanceEntityRef} rather
 * than `unknown`, so an implementation can read `getClassName()` and `getPrimaryIDValue()`
 * off it without a cast, which is exactly what the legacy call site does. */

/* THERE IS NO `EntityCommentMaintenancePort`. It was declared as a same-shape rival of
 * {@link EntityCommentCleanupPort} — identical members, identical legacy locators, a different
 * noun — and two port interfaces for one collaborator is a drift hazard, not a choice: a
 * wiring site satisfying one of them would leave the other unimplemented with nothing
 * reporting it. EntityCommentCleanupPort is the surviving declaration and it KEPT the stronger
 * typing the rival introduced: its entity parameter is {@link MaintenanceEntityRef} rather
 * than `unknown`, so an implementation can read `getClassName()` and `getPrimaryIDValue()`
 * off it without a cast, which is exactly what the legacy call site does. */

/**
 * Resolves an entity into the subject its DELETE-context rules can actually evaluate.
 *
 * ⚠️⚠️ F09 — WHY A RESOLUTION STEP IS NEEDED AT ALL. Delete guards in this domain do not read stored
 * columns; they read DERIVED values. `model/validation/Sku.json` gates deletion on `defaultFlag`,
 * `transactionExistsFlag` and `physicalCounts`, and the middle one is a database existence check
 * ([model/dao/SkuDAO.cfc:L53]) while the first is calculated. Handing the raw entity to the validator
 * therefore asked the rules to read values that were simply not present.
 *
 * AND THE ABSENT-VALUE SEMANTICS MAKE THAT WORSE, NOT HARMLESS. `eq` is one of only two constraints
 * that FAIL on a missing value ([org/Hibachi/HibachiValidationService.cfc:L387-L390]), so an unresolved
 * flag does not skip the guard — it REFUSES THE DELETE. Both `eq` guards in `Sku.json` are therefore
 * unconditionally hostile until the values are resolved. Those semantics are correct and are left
 * exactly as they are; what was missing is a required opportunity to supply the values, which is what
 * this seam provides. The safe direction is preserved: resolve first, then let a genuinely absent value
 * refuse.
 *
 * @param entity - The entity being deleted.
 * @returns The subject to validate. It may be the entity itself once enriched, or a distinct view of
 *   it; `delete` uses whatever comes back and never re-reads the argument for validation.
 */
export type DeleteSubjectResolver<TEntity> = (entity: TEntity) => Promise<TEntity>;

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

  /**
   * The resolved authorisation context for population — ARMS 2 AND 3 of the legacy population gate
   * [org/Hibachi/HibachiTransient.cfc:L186-L190], declared in `../ports/AccountContextPort`.
   *
   * ⚠️ REQUIRED, WITH NO DEFAULT, AND THAT IS THE WHOLE MECHANISM. This service is the ONLY
   * production caller of `populate` in the subtree, so requiring the policy here is what makes
   * "mutate a persistent entity's declared properties from a request payload without deciding
   * whether the caller may" unreachable rather than merely discouraged. A wiring site that forgets it
   * does not fall back to permissive behaviour; it fails to compile.
   *
   * WHY IT IS A CONSTRUCTOR COLLABORATOR RATHER THAN A `save` PARAMETER. Rule R1 (AAP §0.4.3.1)
   * replaces DI/1 property injection with constructor injection, and the legacy gate read the policy
   * out of ambient request state rather than taking it as an argument — so no legacy signature gains
   * a parameter, and TR-1's preservation of `save`'s three-parameter shape
   * [model/service/HibachiService.cfc:L86] is untouched. The two positional two-argument call sites
   * that AAP §0.4.2.3 pins, [model/service/BrandService.cfc:L76] and
   * [model/service/ProductService.cfc:L303], still translate literally.
   *
   * ITS IMPLEMENTATION MUST DENY BY DEFAULT. Every terminal branch of the legacy ladder returns
   * false — [org/Hibachi/HibachiAuthenticationService.cfc:L118], [:L369] and [:L383-L386] — and the
   * port documents that obligation on the member itself.
   *
   * AAP-5 — REQUIRED, NOT OPTIONAL, AND THAT IS THE WHOLE POINT. `../domain/base/populate`
   * default-denies a persistent property when no collaborator is supplied. Were this field optional a
   * wiring site could omit it and every persistent property would silently stop populating — a
   * failure mode that produces no error, only an entity that quietly ignored its payload. Declaring
   * it required makes the omission a compile error instead. The three authorization arms it feeds are
   * ported from `org/Hibachi/HibachiTransient.cfc:L186-L190`.
   */
  readonly populationAuthorization: PopulationAuthorizationPort;

  /** The persistence step of [org/Hibachi/HibachiService.cfc:L155]. See {@link EntityPersister}. */
  readonly persist: EntityPersister<TEntity>;

  /** The removal step of `org/Hibachi/HibachiService.cfc:L61` and `:L64`. */
  readonly remove: EntityRemover<TEntity>;

  /**
   * The out-of-scope setting cleanup the LOCAL override performs — see
   * {@link EntitySettingCleanupPort}.
   *
   * AAP-4 — REQUIRED, NOT OPTIONAL, for the same reason as
   * {@link BaseServiceCollaborators.populationAuthorization}. An optional collaborator would let a
   * wiring site omit it and restore exactly the reported behaviour — deactivation not stripping the
   * entity's identifier out of stored setting values, deletion not removing the entity's setting
   * rows — with nothing anywhere reporting the omission.
   */
  readonly settingCleanup: EntitySettingCleanupPort;

  /**
   * The out-of-scope comment cleanup the LOCAL override performs — see
   * {@link EntityCommentCleanupPort}.
   *
   * AAP-4 — REQUIRED for the same reason as {@link BaseServiceCollaborators.settingCleanup}.
   */
  readonly commentCleanup: EntityCommentCleanupPort;

  /**
   * The delete-context resolution step; see {@link DeleteSubjectResolver}.
   *
   * Optional in the TYPE, and required in effect for any entity whose delete guards read derived
   * values. `Sku` is the case in point: `../validation/rules/sku.rules.ts` exports
   * `ResolvedSkuDeleteSubject`, whose three guard properties are NON-optional, so a SKU wiring cannot
   * produce a valid delete subject without going through a resolver. Entities whose delete guards read
   * only owned collections — `Brand`, `Option`, `OptionGroup` — need none and omit it.
   *
   * ⚠️ THE ONE OPTIONAL MEMBER OF THIS INTERFACE, AND THE ASYMMETRY WITH THE THREE ABOVE IS
   * DELIBERATE. `populationAuthorization`, `settingCleanup` and `commentCleanup` are REQUIRED because
   * omitting any of them silently RESTORES a reported defect — a payload quietly ignored, or rows
   * quietly left behind — and nothing reports the omission. Omitting this one restores nothing: the
   * delete still runs, the guards still evaluate, and for the three entities whose guards read only
   * owned collections the raw entity IS the correct subject. Where it is NOT correct the compiler says
   * so, because `ResolvedSkuDeleteSubject` cannot be produced without it. So the safety here is
   * carried by the SUBJECT type rather than by requiredness, which is why requiredness would buy
   * nothing but three wiring sites obliged to pass a resolver they have no use for.
   */
  readonly resolveDeleteSubject?: DeleteSubjectResolver<TEntity>;
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
 * // Wiring, in src/config/container.ts — one instance per entity type. The `authorization`
 * // collaborator is REQUIRED: it supplies ARMs 2 and 3 of the population master gate at
 * // [org/Hibachi/HibachiTransient.cfc:L186-L190], and omitting it is a compile error rather than a
 * // save that silently populates nothing. See BaseServiceCollaborators.authorization.
 * const brandBaseService = new BaseService({
 *   validator,
 *   ruleSet: brandValidationRules,
 *   propertyDescriptors: brandPropertyDescriptors,
 *   persist: (brand) => brandRepository.saveBrand(brand),
 *   remove: (brand) => brandRepository.removeBrand(brand),
 *   authorization: propertyUpdateAuthorizer,
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
  private readonly validator: Validator;

  private readonly ruleSet: ValidationRuleSet<TEntity>;

  private readonly propertyDescriptors: PropertyDescriptorSet<TEntity, TPropertyName>;

  /** See {@link BaseServiceCollaborators.populationAuthorization}. */
  private readonly populationAuthorization: PopulationAuthorizationPort;

  /** See {@link BaseServiceCollaborators.persist}. */
  private readonly persist: EntityPersister<TEntity>;

  private readonly remove: EntityRemover<TEntity>;

  private readonly settingCleanup: EntitySettingCleanupPort;

  private readonly commentCleanup: EntityCommentCleanupPort;

  /* THE THREE COLLABORATOR FIELDS ARE DECLARED ONCE, DIRECTLY ABOVE, AND THEY ARE NOT OPTIONAL.
   *
   * A second declaration of them widened to `| undefined` was withdrawn. The widening looked like a
   * concession to `exactOptionalPropertyTypes` and was in fact a downgrade of AAP-5: `../domain/base/populate`
   * DEFAULT-DENIES a persistent property when no authorisation collaborator is supplied
   * [org/Hibachi/HibachiAuthenticationService.cfc:L104-L120], so an omittable field lets a wiring site
   * silently stop every persistent property from populating, and an omittable cleanup port lets a
   * wiring site silently restore the two reported defects — deactivation not stripping the entity's
   * identifier out of stored setting values, deletion not removing its setting and comment rows. All
   * three failures produce NO error: only an entity that quietly ignored its payload, or rows that
   * quietly stayed behind. Required fields make each omission a compile error instead, which is the
   * entire point of declaring them. `exactOptionalPropertyTypes` is satisfied without widening,
   * because the constructor assigns all three unconditionally. */

  /** See {@link BaseServiceCollaborators.resolveDeleteSubject}. */
  private readonly resolveDeleteSubject: DeleteSubjectResolver<TEntity> | undefined;

  /**
   * Binds the collaborators once.
   *
   * A single parameter object rather than six positional parameters, because six same-shaped
   * arguments are trivially transposable at a wiring site and a transposition would still compile for
   * the two function-typed ones. Every field is copied into a `readonly` field, so the instance is
   * immutable after construction — which is what M7 requires of a singleton on a warm container.
   *
   * @param collaborators - Eight REQUIRED members — validator, rule set, property descriptors,
   *   population authorisation, persister, remover, setting cleanup and comment cleanup — plus ONE
   *   optional crossing, {@link BaseServiceCollaborators.resolveDeleteSubject}, whose absence changes
   *   behaviour rather than failing loudly: `delete` then validates the raw entity, which is correct
   *   only for entities whose guards read owned collections. Its own field documents the asymmetry.
   */
  public constructor(collaborators: BaseServiceCollaborators<TEntity, TPropertyName>) {
    this.validator = collaborators.validator;
    this.ruleSet = collaborators.ruleSet;
    this.propertyDescriptors = collaborators.propertyDescriptors;
    this.populationAuthorization = collaborators.populationAuthorization;
    this.persist = collaborators.persist;
    this.remove = collaborators.remove;
    this.settingCleanup = collaborators.settingCleanup;
    this.commentCleanup = collaborators.commentCleanup;
    this.resolveDeleteSubject = collaborators.resolveDeleteSubject;
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
   *   passed through UNCHANGED, so a caller may select any context the rule set declares — but only
   *   from the closed {@link ValidationContext} union.
   *
   *   ⚠️ WHY THIS PARAMETER IS NOT A `string`. It was, and that made the validation bypass at
   *   [org/Hibachi/HibachiValidationService.cfc:L162] reachable from every save: a context of
   *   `'false'`, `'no'` or `'0'` skips every required, uniqueness, format, method and delete-guard
   *   rule and returns an EMPTY bag, after which STEP 3 below sees a clean entity and PERSISTS IT.
   *   This method is the one production path from a use case to `Validator.validate`, so closing the
   *   parameter here is what stops a request-supplied value from selecting the bypass. DECISION V-1
   *   on {@link ValidationContext} carries the enumeration proving no legacy call site selected it
   *   either, so this is behaviour preservation rather than a behavioural change.
   * @returns The persisted entity — the value produced by the persistence step, never merely the
   *   argument that was handed in.
   * @throws {ValidationError} the accumulated failure bag, keyed by property identifier, when the
   *   entity did not pass validation. Nothing is persisted in that case.
   */
  public async save(
    entity: TEntity,
    data: Record<string, unknown> = {},
    context: ValidationContext = DEFAULT_SAVE_CONTEXT,
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
     *
     * ⭐ THE INJECTED AUTHORISATION IS PASSED THROUGH. It supplies ARMS 2 and 3 of the master gate
     * [org/Hibachi/HibachiTransient.cfc:L186-L190]; ARM 1 is the descriptor set's own `persistent`
     * flag and short-circuits ahead of both. An unauthorised property is SKIPPED, not rejected —
     * `../domain/base/populate` records why that matches the legacy `if`-around-the-block shape and
     * why raising instead would leak which properties exist.
     *
     * IT CAN NOW RAISE, AND THE RAISE PROPAGATES DELIBERATELY. `populate` throws a `DomainError` when
     * a payload value cannot be represented in its property's declared value type. Nothing is caught
     * here: a value that has no representation must not reach validation, because a validation bag
     * would present it as a recoverable field error when the request is malformed at a level the rule
     * sets do not model. Nothing has been persisted at this point, and the caller's entity reference
     * is unmodified for every property the loop had not yet reached.
     */
    const populatedEntity: TEntity = populate(
      entity,
      data,
      this.propertyDescriptors,
      this.populationAuthorization,
    );

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
     * legacy line skips it. It also reads the FIELD rather than probing for a generated accessor — see
     * {@link ActiveFlagReader}, without which correction this block was unreachable for every entity.
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

      /*
       * [:L94] `if(!arguments.entity.getActiveFlag())` — the generated accessor read as a field, for
       * the reason recorded on {@link ActiveFlagReader}. {@link entityReadsActiveFlag} has already
       * established that the value is a known boolean, so this negation is total.
       */
      if (!savedEntity.activeFlag) {
        /*
         * [model/service/HibachiService.cfc:L94-L96] — `var settingsRemoved =
         * getService("settingService").updateAllSettingValuesToRemoveSpecificID(
         * arguments.entity.getPrimaryIDValue() )`, reproduced through
         * {@link EntitySettingCleanupPort} (AAP-4, TR-5).
         *
         * The identifier passed is `getPrimaryIDValue()`, exactly the legacy argument, and the COUNT
         * it resolves is assigned to the counter the gate at [:L98] reads — which is why the port
         * member returns `Promise<number>` rather than `Promise<void>`. Awaited rather than
         * fire-and-forget: the legacy call is synchronous and its result is consumed on the very next
         * line, so the gate must not be evaluated before it has resolved.
         */
        settingsRemoved = await this.settingCleanup.updateAllSettingValuesToRemoveSpecificID(
          savedEntity.getPrimaryIDValue(),
        );
      }

      /*
       * [:L98] the disjunction, retained in FULL — both arms, and all five literal class names inside
       * {@link SETTINGS_CACHE_CLEARING_CLASS_NAMES}. For an in-scope entity the second arm can never
       * match, because every one of those five names is an excluded entity; the FIRST arm is live,
       * carrying the real count GAP 3 above resolved. The five names are reproduced rather than
       * collapsed because the rule itself is the observable behaviour (AAP 0.8.2 guideline 4).
       */
      if (
        settingsRemoved > NO_SETTINGS_REMOVED ||
        clearsAllSettingsCacheForClassName(savedEntity.getClassName())
      ) {
        /*
         * [model/service/HibachiService.cfc:L98-L100] — `getService("settingService")
         * .clearAllSettingsCache()`, reproduced through {@link EntitySettingCleanupPort} (AAP-4,
         * TR-5).
         *
         * ⚠️ THE CACHE INVALIDATED HERE IS NOT THIS LAYER'S CACHE, WHICH IS WHY THE CALL CANNOT BE
         * SKIPPED. M7 makes this collaborator stateless on a warm container and every memoisation
         * elsewhere in the subtree is request-scoped, so there is nothing local to clear. The cache
         * belongs to `settingService`, on the far side of the boundary. Omitting the notification
         * would silently decide, on the owner's behalf, that its cache does not need invalidating —
         * a decision this layer has no standing to make.
         */
        await this.settingCleanup.clearAllSettingsCache();
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
   * own `boolean` return type did not surface them either. See the consequence recorded in the
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
    /*
     * ⚠️⚠️ F09 — RESOLVE BEFORE VALIDATING. See {@link DeleteSubjectResolver} for why the raw entity is
     * not a usable delete subject: this domain's delete guards read DERIVED values, and `eq` is one of
     * only two constraints that FAIL rather than pass on an absent value
     * ([org/Hibachi/HibachiValidationService.cfc:L387-L390]), so an unresolved flag actively refuses the
     * delete instead of ignoring it.
     *
     * The legacy needed no such step because CFML called the calculated getter during validation and it
     * hit the database then and there. This port's validator receives a subject rather than invoking
     * getters, so the equivalent work has to happen HERE — before the rules run, and inside the same
     * member, so no caller can forget it.
     *
     * When no resolver is wired the entity is validated as-is, which is correct for the entities whose
     * delete guards read only owned collections. It is NOT silently correct for `Sku`, and that is
     * enforced by types rather than by trust: `ResolvedSkuDeleteSubject` declares the three guard
     * properties non-optional, so a SKU wiring that omits the resolver does not compile.
     */
    const deleteSubject: TEntity =
      this.resolveDeleteSubject === undefined ? entity : await this.resolveDeleteSubject(entity);

    const errors: ValidationError = await this.validator.validate(
      deleteSubject,
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

    if (deleteOK) {
      /*
       * [model/service/HibachiService.cfc:L76] then [:L79] — the two cleanup steps, reproduced through
       * {@link EntitySettingCleanupPort} and {@link EntityCommentCleanupPort} (AAP-4, TR-5). Both sit
       * inside the `if(deleteOK)` gate and both run AFTER {@link EntityRemover}, exactly as the legacy
       * lines do relative to `super.delete()` at [:L70].
       *
       * ⚠️ AWAITED SEQUENTIALLY, IN SOURCE ORDER, AND NOT THROUGH `Promise.all`. The legacy calls are
       * two consecutive synchronous statements, so settings are gone before comments are touched.
       * Running them concurrently would be an invention (AAP 0.7.3, S9) and would also be unsafe in a
       * way the type system cannot see: a comment-cleanup implementation is free to read the setting
       * rows the first call removes, and interleaving the two would make the outcome depend on
       * scheduling.
       */
      await this.settingCleanup.removeAllEntityRelatedSettings(entity);
      await this.commentCleanup.removeAllEntityRelatedComments(entity);
    }

    return deleteOK;
  }
}
