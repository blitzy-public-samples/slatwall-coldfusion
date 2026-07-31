/**
 * `BrandService` — the port of `model/service/BrandService.cfc`: the smallest and cleanest of the four
 * in-scope Catalog services.
 *
 * Authority: AAP 0.4.1.8. The method contract is fixed by AAP 0.4.2.3, the three synthesized members by
 * AAP 0.4.2.5, and the dependency classification by AAP 0.6.3.3.
 *
 * =============================================================================================
 * WHAT THE LEGACY COMPONENT ACTUALLY CONTAINS — ONE MEMBER, ONE DEPENDENCY, ZERO DAO
 * =============================================================================================
 * Between `model/service/BrandService.cfc:L49` and the closing brace at `:L89` there is exactly ONE
 * function — `saveBrand` at `:L67-L77` — and exactly ONE injected property, `dataService` at `:L51`.
 * Everything else in the file is section banners.
 *
 * `dataService` is reached twice, at `model/service/BrandService.cfc:L70` and `:L72`, and BOTH call
 * sites use the single member `createUniqueURLTitle`; `super.save()` at `:L76` is the only other
 * outbound edge. There are ZERO dead injections — the only one of the four in-scope services with none
 * — so nothing here exists to accommodate an unused dependency, and nothing is dropped (AAP 0.6.3.3).
 *
 * DELIBERATELY ABSENT: A `DataService` CLASS. AAP 0.4.1.8 narrows that dependency to the ported
 * `urlTitle` utility rather than a whole service, and AAP 0.4.1.11 gives `createUniqueURLTitle` its own
 * home at `src/util/urlTitle.ts`. AAP 0.2.1.8 lists `model/service/DataService.cfc` reference-only with
 * exactly that one member carried across, so this service imports the utility and no `DataService.ts`
 * is created (AAP 0.7.3 S5 — add no file).
 *
 * DELIBERATELY ABSENT: A `BrandDAO`. No such component exists anywhere in the legacy repository, and
 * `BrandService` never declares one, because the CRUD it needs was fabricated at call time. See the
 * IR-1 section below.
 *
 * =============================================================================================
 * IR-8 / R3 — `super.save()` RESOLVES TO SLATWALL CODE, AND BECOMES COMPOSITION, NOT INHERITANCE
 * =============================================================================================
 * IR-8 names this exact line as its worked example: `super.save()` at
 * `model/service/BrandService.cfc:L76` resolves to the LOCAL override at
 * `model/service/HibachiService.cfc:L86`, not to the framework base. `model/service/BrandService.cfc:L49`
 * says `extends="HibachiService"` with NO package prefix, so it binds to the sibling
 * `model/service/HibachiService.cfc`, whose own `:L49` then declares the fully-qualified
 * `extends="Slatwall.org.Hibachi.HibachiService"`. The local override at
 * `model/service/HibachiService.cfc:L86-L104` adds behaviour the framework base does not have — the
 * `activeFlag` and settings post-processing block at `:L91-L101` — which is why the distinction is
 * load-bearing rather than trivia.
 *
 * R3 (AAP 0.4.3.3) replaces that template-method inheritance with composition, so this class `extends`
 * NOTHING: it takes the base collaborator as a typed constructor parameter and calls it, and the
 * framework surface the slice never touched is never inherited into the port.
 *
 * =============================================================================================
 * IR-1 / TR-3 — THREE MEMBERS THAT EXIST IN NO SOURCE FILE MUST BE DECLARED HERE
 * =============================================================================================
 * `org/Hibachi/HibachiService.cfc:L255-L281` manufactures a service's entire implicit persistence
 * surface at call time by matching a lower-cased method-name prefix: `get` at `:L258`, `new` at `:L264`,
 * `list` at `:L266`, `save` at `:L268`, `delete` at `:L270`, `count` at `:L272`, `export` at `:L274` and
 * `process` at `:L276`. That mechanism is why `brandService.newBrand()`, `brandService.getBrand(id)` and
 * `brandService.deleteBrand(entity)` resolve at runtime while appearing in no source file as a
 * declaration — AAP 0.4.2.5 lists all three, with `newBrand()` additionally exercised by the legacy
 * fixture at `meta/tests/unit/entity/BrandTest.cfc:L55`.
 *
 * Under IR-1 and TR-3 each such call site becomes an explicitly declared, typed method. The restraint
 * is as binding as the declaration: AAP 0.4.2.5 ends with "synthesis is not reproduced wholesale, only
 * where used", so no counting, listing, exporting, processing, smart-list or compound `getBrandByXxx`
 * member is declared, because the slice calls none of them. The dispatcher itself is emulated by
 * nothing, and every member below is a plain method the compiler checks (AAP 0.7.3 S3).
 *
 * POSITIONAL ARGUMENTS ONLY. `org/Hibachi/HibachiService.cfc:L253` and `:L303` both state "Ordered
 * arguments only--named arguments not supported", and the dispatcher proves it structurally: the delete
 * branch at `:L286-L288` reads its argument by NUMERIC index and the read branch at `:L306` probes for
 * the string key `'2'`. No member below takes a named-argument struct or an options bag (TR-1).
 *
 * =============================================================================================
 * R1 / R2 — DI/1 PROPERTY INJECTION AND STRING LOOKUP BECOME CONSTRUCTOR PARAMETERS
 * =============================================================================================
 * `model/service/BrandService.cfc:L51` declares `property name="dataService" type="any";`, which DI/1
 * populated by NAME during a runtime bean scan and exposed through a generated `getDataService()`
 * accessor. R1 (AAP 0.4.3.1) replaces both halves with one explicit typed constructor parameter, and R2
 * (AAP 0.4.3.2) replaces dynamic `getService("name")` resolution with typed references. No container is
 * consulted and no name is resolved at runtime.
 *
 * =============================================================================================
 * THE ONE STRUCTURAL JUDGMENT CALL — WHY EVERY BRAND HERE IS A MANAGED ENTITY
 * =============================================================================================
 * This is the only technology-specific judgment in the file (AAP 0.8.2 Guideline 6), and it is forced
 * rather than chosen.
 *
 * `BaseService` is generic over `TEntity extends BaseServiceEntity<TPropertyName>`, and
 * `BaseServiceEntity` demands `getClassName()`, `hasProperty()` and `getPrimaryIDValue()` in addition to
 * the audit and population contracts. `../domain/product/Brand` deliberately declares none of those
 * three, because they lived on the framework base classes AAP 0.8.3.2 retires for this slice. So
 * `BaseService<Brand, BrandPropertyName>` is a constraint violation, and no type argument can rescue it:
 * if `Brand` were assignable to some `T extends BaseServiceEntity`, `Brand` would have to carry those
 * members after all.
 *
 * THE RESOLUTION IS TO SUPPLY THE MISSING SURFACE, NOT TO HIDE THE GAP. Those members were inherited
 * in the legacy — observably so: `model/entity/Sku.cfc:L843-L855` overrides `getPropertyMetaData` and
 * falls through to `super.getPropertyMetaData( argumentCollection=arguments )` at `:L854`, a call that
 * can only resolve because the base class supplies the member. `../domain/base/populate` ports that
 * inheritance as composition: `EntityMetadataSurface` declares the seven introspection members,
 * `EntityErrorSurface` the six error members, and `manageEntity` attaches both to an entity with
 * `Object.assign`, which mutates and returns the SAME object so identity survives. Everything in this
 * subtree that mints a brand routes through it — `../adapters/mysql/rowMappers`'s `mapBrandRow` and,
 * beneath this service, `../ports/repositories/BrandRepository`'s `newBrand` and `getBrand`. So
 * {@link ManagedBrand} is now defined AS that runtime shape, `ManagedEntity<Brand>`, and this
 * service's four public signatures are expressed in it.
 *
 * WHAT THAT REPLACED, STATED PLAINLY BECAUSE IT WAS A REAL DEFECT AND NOT A STYLE PREFERENCE. This
 * file previously injected {@link BrandBaseService} as a two-member view written over the bare
 * `Brand` in METHOD syntax, precisely because TypeScript compares method parameters BIVARIANTLY: that
 * made a real `BaseService<ManagedBrand, BrandPropertyName>` assignable to the view while leaving a
 * plain `Brand` a legal argument at every call site. The type-checker was therefore accepting a value
 * that `../validation/Validator` would have called `getClassName()` on at run time, and no code
 * anywhere produced a value satisfying {@link ManagedBrand} at all. The view survives — narrowing the
 * injected surface to the two members actually used is still what keeps a hand-written double small —
 * but it is now written as ARROW-TYPED PROPERTIES over {@link ManagedBrand}, so its parameters are
 * checked contravariantly under `strictFunctionTypes` and the substitution that hid the gap is
 * rejected. Nothing is re-implemented either way: `save` and `delete` are delegated to, never
 * reproduced, so there is exactly one owner of the populate/validate/persist sequence.
 *
 * THE TIGHTENING IS RECORDED, NOT SILENT (TR-1). AAP 0.4.2.3 fixes this service's contract as
 * `saveBrand(brand: Brand, data)` and AAP 0.4.2.5 declares `newBrand`, `getBrand` and `deleteBrand`
 * over `Brand` likewise. `ManagedBrand` is an intersection WITH `Brand`, so no name, arity or argument
 * order changes and every legacy call shape still type-checks; what narrows is the set of values
 * admitted, from "any brand" to "a brand carrying the surface a Hibachi entity always carried". AAP
 * 0.4.2 sanctions exactly this — the legacy declaration is `required any brand` at
 * `model/service/BrandService.cfc:L67`, and a loose legacy signature is tightened to the observed
 * contract and recorded rather than tightened silently. The observed contract is not in doubt here:
 * the local override this service delegates to reads `hasErrors()`, `hasProperty('activeFlag')`,
 * `getPrimaryIDValue()` and `getClassName()` off its argument at
 * `model/service/HibachiService.cfc:L91-L98`, so the legacy brand demonstrably carried all four.
 *
 * {@link ManagedBrand} stays exported so the composition root knows precisely what to instantiate,
 * and it now names something constructible rather than something merely describable. The requirement
 * it must meet keeps its own name, {@link BrandBaseServiceRequirement}, and the three type-level
 * guards below fail the build if any of those relationships ever drifts.
 *
 * =============================================================================================
 * BR-2 — A SOURCE-LAYOUT ARTEFACT THAT IS DELIBERATELY NOT REPRODUCED
 * =============================================================================================
 * `model/service/BrandService.cfc:L57` and `:L59` carry the SAME banner twice —
 * `// ===================== START: DAO Passthrough ===========================` — with no matching
 * END banner, in a file whose other five sections are correctly paired. It is a copy-paste artefact
 * of the component template, it delimits nothing (the section is empty), and it has no behaviour.
 * It is recorded here and NOT reproduced. No register identifier is minted for it: AAP 0.6.7
 * catalogues D1-D21, the port's register is closed at D1-D24, and none of those numbers belongs to
 * this file.
 *
 * =============================================================================================
 * M7 — STATELESS BY CONSTRUCTION
 * =============================================================================================
 * Nothing survives between Lambda invocations except module-scope state (AAP 0.6.6 M7), while the DI/1
 * lifecycle made services SINGLETONS. A singleton on a warm container is shared across invocations and
 * therefore potentially across tenants, so this file holds NO mutable state: the only instance fields
 * are the two `readonly` collaborators, the module constants are immutable string primitives, and every
 * value a method needs is derived from its arguments on each call. The uniqueness probe is likewise
 * re-created per derivation and never memoised, which the brand repository's own contract requires — a
 * cached probe would make the collision loop in `../util/urlTitle` non-terminating.
 *
 * =============================================================================================
 * TEST PROVENANCE (AAP 0.6.5, S6) — ALL FOUR MEMBERS ARE NET-NEW COVERAGE
 * =============================================================================================
 * No `BrandServiceTest` exists anywhere under `meta/tests/` (AAP 0.6.5.2), so all four members below are
 * NET-NEW service coverage and no parity with a legacy service test is implied. The one TRACEABLE thread
 * is an ENTITY assertion, not a service one: `meta/tests/unit/entity/BrandTest.cfc:L58-L60` builds its
 * subject with `getService("brandService").newBrand()` at `:L55` and then asserts `getProducts()` equals
 * `[]`. {@link BrandService.newBrand} keeps that reachable, and the empty-array default itself lives in
 * `../domain/product/Brand` as a field initialiser.
 *
 * This class is directly constructible with hand-written doubles — the legacy repository vendors no
 * mocking library at all (AAP 0.4.3.6) — because both collaborators are interfaces satisfiable by a
 * plain object literal. No concrete adapter is imported or required.
 *
 * =============================================================================================
 * LAYERING (S2, S4)
 * =============================================================================================
 * No SQL is composed, received or inspected here. The single `SwBrand` literal below is the
 * source-declared TABLE DISCRIMINATOR that `model/service/BrandService.cfc:L70` and `:L72` pass to
 * `createUniqueURLTitle`, and it travels no further than that utility's `tableName` parameter. Imports
 * reach only `../domain/**`, `../ports/**`, `../util/**`, `../validation/**` and the sibling
 * `./BaseService`.
 */

import type { ManagedEntity } from '../domain/base/populate';
import type { Brand, BrandPropertyName } from '../domain/product/Brand';
import type { UniquePropertyEntity } from '../ports/UniquePropertyPort';
import type {
  BrandRepository,
  ManagedBrand as PortManagedBrand,
} from '../ports/repositories/BrandRepository';
import { createUniqueURLTitle } from '../util/urlTitle';
import type { UrlTitleAttemptBudget } from '../util/urlTitle';
import type { ValidationContext } from '../validation/Validator';
import type { BrandValidationSubject } from '../validation/rules/brand.rules';
import type { BaseService, BaseServiceEntity } from './BaseService';

/**
 * The physical table the brand URL title must be unique on — the literal passed at
 * `model/service/BrandService.cfc:L70` and `:L72` as `tableName="SwBrand"`, matching
 * `table="SwBrand"` on `model/entity/Brand.cfc:L49`.
 *
 * This is a discriminator, not SQL (AAP 0.7.3 S2). It is handed to `createUniqueURLTitle` as data
 * and never reaches an identifier position in a statement: the brand repository's uniqueness member
 * has the table baked into its meaning and accepts only the candidate value, and identifier handling
 * belongs to `src/adapters/mysql/**` (AAP 0.4.3.4).
 */
const BRAND_TABLE_NAME = 'SwBrand';

/**
 * The payload key read by the guard at `model/service/BrandService.cfc:L68` and WRITTEN at `:L70`
 * and `:L72`. It matches `property name="urlTitle"` on `model/entity/Brand.cfc:L55`, which is the
 * `unique="true"` column the derivation exists to keep unique.
 */
const URL_TITLE_DATA_KEY = 'urlTitle';

/**
 * The payload key read by the preferred branch at `model/service/BrandService.cfc:L69-L70`,
 * matching `property name="brandName"` on `model/entity/Brand.cfc:L56`.
 */
const BRAND_NAME_DATA_KEY = 'brandName';

/**
 * A brand as the base collaborator has to see it: the domain entity plus the three contracts the
 * retired framework base classes used to supply for it.
 *
 * Exported because it is the composition root's instruction sheet, not decoration. Wiring this
 * service means constructing `new BaseService<ManagedBrand, BrandPropertyName>({ validator,
 * ruleSet: brandValidationRules, propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
 * populationAuthorization, persist: brandRepository.saveBrand, remove:
 * brandRepository.deleteBrand })` — five of those six collaborators are existing exports of
 * `../validation/rules/brand.rules`, `../domain/product/Brand` and
 * `../ports/repositories/BrandRepository`, and each was checked to fit at this exact type argument.
 * Naming the requirement here is what makes that assembly verifiable instead of guessed.
 *
 * ⚠️ THE SIXTH IS `populationAuthorization`, AND IT HAS NO IN-SCOPE PROVIDER, DELIBERATELY. It is a
 * `PopulationAuthorizationPort` from `../ports/AccountContextPort`, carrying ARMS 2 and 3 of the
 * legacy population gate [org/Hibachi/HibachiTransient.cfc:L186-L190]. The composition root supplies
 * it from the same edge that resolves the caller identity, because the decision procedure behind it —
 * permission groups, allow flags, the super-user bypass — lives in the excluded `Account*` family
 * (AAP §0.2.2.1) and the retired `org/Hibachi/**` tree (AAP §0.8.3.2). It is REQUIRED rather than
 * optional so that a wiring site which has no policy to supply fails to compile instead of silently
 * populating a persistent entity unchecked; `../services/BaseService` records that reasoning on the
 * collaborator itself, and the port records the default-deny obligation on its implementer.
 *
 * ⚠️ THIS SERVICE'S OWN THIRD CONSTRUCTOR ARGUMENT IS `urlTitleAttemptBudget`, AND IT HAS NO IN-SCOPE
 * PROVIDER EITHER — for a different reason, worth distinguishing. `populationAuthorization` replaces a
 * legacy facility that exists and is out of scope; this one replaces a legacy safeguard that DOES NOT
 * EXIST AT ALL. `model/service/DataService.cfc:L64` probes for a free `urlTitle` in an unbounded
 * `while(!unique)` loop, so there is no legacy number to carry across, and AAP 0.7.3 S9 forbids
 * inventing one. The composition root must therefore state the maximum, and a wiring site that states
 * none does not compile. `../util/urlTitle` records the parity decision behind the bound and why an
 * atomic-uniqueness rewrite was rejected in favour of bounding the existing algorithm.
 *
 * `Brand` supplies the persistent property surface, the audit block it declares through
 * `AuditableEntity`, and the population target every `BrandPropertyName` key needs.
 * `BaseServiceEntity` adds the validation subject (`getClassName`, `hasProperty`) and
 * `getPrimaryIDValue`. `UniquePropertyEntity` adds the remaining application-side uniqueness reads of
 * IR-5 — `getPropertyMetaData`, `getEntityName`, `getPrimaryIDPropertyName` and
 * `getValueByPropertyIdentifier` — which the `urlTitle` unique constraint declared in
 * `model/validation/Brand.json:L5` and ported in `../validation/rules/brand.rules` resolves through.
 *
 * Module-private deliberately. Nothing outside this file needs to name the requirement, because
 * {@link ManagedBrand} is what everything outside this file actually handles, and Guard 3 below is
 * what keeps the one satisfying the other.
 */
type BrandBaseServiceRequirement = Brand &
  BaseServiceEntity<BrandPropertyName> &
  UniquePropertyEntity;

/**
 * What every caller of this service actually handles: a `Brand` plus the error-surface members
 * `manageEntity` supplies.
 *
 * ⛔ DECLARED HERE AND NOT IMPORTED FROM THE PORT, AND THAT IS THE POINT OF GUARD 4. The port
 * declares an identically-shaped alias for the values it hands back; this one is the SERVICE's
 * statement about what it handles. Two independent statements plus the bidirectional assertion in
 * Guard 4 make the agreement CHECKABLE, so the day either side widens or narrows, the build fails in
 * this file rather than at a composition root or inside the validator at run time. Collapsing the two
 * into a single import would make the agreement true by definition and silently untestable — which is
 * why the duplication here is deliberate and is the one place in this subtree where a second
 * declaration of the same shape is correct.
 */
export type ManagedBrand = ManagedEntity<Brand>;

/**
 * The two members of `BaseService` this service delegates to, viewed over {@link ManagedBrand}.
 *
 * ARROW-TYPED PROPERTIES ARE DELIBERATE AND LOAD-BEARING — see "THE ONE STRUCTURAL JUDGMENT CALL" in
 * the module header. TypeScript compares METHOD parameters bivariantly, so had these two been written
 * as methods a collaborator declaring `save(brand: Brand, …)` would satisfy this interface and a brand
 * with none of the introspection surface would remain a legal argument at the call sites below — which
 * is exactly how this file previously admitted a value `../validation/Validator` would have failed on.
 * As properties the parameters are checked contravariantly under `strictFunctionTypes`, so that
 * substitution is rejected, and a real `BaseService<`{@link ManagedBrand}`, BrandPropertyName>` still
 * satisfies the view with no cast anywhere — Guard 1 below is that assignment, checked.
 *
 * Both signatures mirror the LOCAL override they stand for, `model/service/HibachiService.cfc:L86`
 * (`save(required any entity, struct data={}, string context="save")`) and `:L68`
 * (`delete(required any entity)`), so the two-argument positional call at
 * `model/service/BrandService.cfc:L76` and the boolean verdict of the delete path both keep their
 * legacy shape. The remaining two parameters of `save` are optional here because the override
 * defaults them; this file always passes `data` and never passes `context`, exactly as `:L76` does.
 *
 * Declaring the view rather than importing `BaseService` directly duplicates no sibling-owned TYPE:
 * `BaseServiceEntity` is imported and reused by {@link BrandBaseServiceRequirement} above,
 * `ManagedEntity` is imported from `../domain/base/populate` rather than re-spelled, the
 * populate/validate/persist sequence stays in `./BaseService` and is only delegated to, and the three
 * guards below tie them all together at compile time. Narrowing the injected surface to the two members actually used is also what keeps a
 * hand-written test double small (AAP 0.7.3 S6).
 *
 * ⚠️ `context` IS THE CLOSED `ValidationContext` UNION, NOT A `string`, AND THAT MATTERS EVEN THOUGH
 * THIS FILE NEVER PASSES IT. A narrow structural view is a RE-DECLARATION of the contract, and method
 * syntax makes its parameters bivariant, so a real `BaseService` would satisfy this interface either
 * way — which is exactly the trap. Declaring `string` here would re-open the validation bypass at
 * [org/Hibachi/HibachiValidationService.cfc:L162] for anything invoking `save` THROUGH this view, no
 * matter how tightly `./BaseService` closes its own signature. `./SkuService`'s `SkuSaveValidator`
 * carries the identical note for the identical reason; DECISION V-1 in `../validation/Validator` holds
 * the argument. The parameter stays OPTIONAL, because the local override defaults it at
 * `model/service/HibachiService.cfc:L86` and `model/service/BrandService.cfc:L76` omits it.
 */
export interface BrandBaseService {
  readonly save: (
    brand: ManagedBrand,
    data?: Record<string, unknown>,
    context?: ValidationContext,
  ) => Promise<ManagedBrand>;
  readonly delete: (brand: ManagedBrand) => Promise<boolean>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and
 * fails the build otherwise. Type-only, so it contributes nothing to the bundle.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * Guard 1 — a real `BaseService` instantiated at {@link ManagedBrand} really does satisfy
 * {@link BrandBaseService}. This is the assignment the composition root performs, checked here so
 * that any drift in `./BaseService`'s `save` or `delete` signature breaks the build in the file that
 * depends on it rather than silently at the wiring site.
 */
type _BaseServiceSatisfiesBrandBaseService = AssertAssignable<
  BaseService<ManagedBrand, BrandPropertyName>,
  BrandBaseService
>;

/**
 * Guard 2 — {@link ManagedBrand} really is a legal subject for the ported brand rule set, which
 * `../validation/rules/brand.rules` exports as
 * `ValidationRuleSet<BrandValidationSubject & UniquePropertyEntity>`. This is what makes
 * `brandValidationRules` a valid `ruleSet` for the base collaborator, and therefore what makes the
 * save-context rules of `model/validation/Brand.json:L3-L5` and the delete guards at `:L6-L7` reach
 * every brand this service saves or removes.
 */
type _ManagedBrandIsBrandValidationSubject = AssertAssignable<
  ManagedBrand,
  BrandValidationSubject & UniquePropertyEntity
>;

/**
 * Guard 3 — the managed runtime shape really does satisfy everything the base collaborator demands.
 *
 * This is the guard that makes the other two mean something. {@link ManagedBrand} is now defined as
 * the shape `manageEntity` actually produces rather than as a wish-list intersection, so it is no
 * longer true BY CONSTRUCTION that it carries `getClassName`, `hasProperty`, `getPrimaryIDValue` and
 * the four IR-5 uniqueness reads: it carries them only because
 * `../domain/base/populate`'s `EntityMetadataSurface` declares those seven members and `Brand` itself
 * declares the audit and population surface. Should either side drift — a member renamed in
 * `EntityMetadataSurface`, an audit field dropped from `Brand`, a new demand added to
 * `BaseServiceEntity` — this line fails the build here, in the file that depends on the
 * correspondence, rather than at a wiring site that does not yet exist.
 */
type _ManagedBrandSatisfiesBaseServiceRequirement = AssertAssignable<
  ManagedBrand,
  BrandBaseServiceRequirement
>;

/**
 * Guard 4 — the PORT's managed alias and this service's own are the same shape, in both directions.
 *
 * ⭐ WHY A FOURTH GUARD, AND WHY IT IS BIDIRECTIONAL. `../ports/repositories/BrandRepository` declares
 * its own `ManagedBrand` for the values it hands back, and this file declares {@link ManagedBrand} for
 * what it handles. Two aliases for one shape is exactly the arrangement that drifts silently: the port
 * could widen its return type, or this file could narrow its view, and every call site would keep
 * compiling because a wider value is still assignable where a narrower one is expected in ONE
 * direction. Asserting BOTH directions makes the two aliases provably interchangeable, so the day
 * either side changes the build fails HERE — in the file that assumes they agree — rather than at a
 * composition root or inside the validator at run time.
 *
 * The two names are deliberately NOT collapsed into one import. The port's alias is the port's
 * statement about its own contract and this one is the service's; keeping them separate is what makes
 * the agreement checkable instead of true by definition.
 */
type _PortManagedBrandMatchesServiceManagedBrand = AssertAssignable<PortManagedBrand, ManagedBrand>;
type _ServiceManagedBrandMatchesPortManagedBrand = AssertAssignable<ManagedBrand, PortManagedBrand>;

/**
 * CFML `structKeyExists(struct, key)` for an inbound payload.
 *
 * `Object.prototype.hasOwnProperty.call` rather than `key in data` or `data[key] !== undefined`,
 * because the guard at `model/service/BrandService.cfc:L68` asks whether the KEY is present and
 * must answer the same way for a key holding an empty value as CFML does. It also cannot be fooled
 * by an inherited or overridden `hasOwnProperty` on a payload parsed from untrusted input.
 */
function dataKeyExists(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/**
 * Renders a CFML simple value the way it reaches a `string`-typed parameter.
 *
 * TODO(parity): a `Date` renders here through `toISOString()`, whereas CFML would render it with the
 * engine's own date-time mask. The two differ in FORMAT for the single pathological case of a
 * date-valued `brandName` or `urlTitle` in the payload; no in-scope caller supplies one, and picking
 * a mask would mean inventing one the source does not state (AAP 0.7.3 S9). Recorded rather than
 * guessed, per AAP 0.8.3.6.
 */
function renderSimpleDataValue(value: string | number | boolean | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * CFML `len()` as the two guards at `model/service/BrandService.cfc:L68-L69` use it, with a missing
 * key folded in as zero so `!structKeyExists(...) || !len(...)` becomes one reading.
 *
 * The branches mirror what CFML `len()` accepts. A string yields its character count and is NOT
 * trimmed first — `len(" ")` is 1, so a payload of a single space counts as supplied, and the trim
 * happens later inside `createUniqueURLTitle` exactly as `model/service/DataService.cfc:L57` does.
 * Numbers, booleans and dates are rendered and measured, as CFML measures the string form. Arrays
 * and structs yield their element and key counts, which `Object.keys` gives for both.
 *
 * TODO(parity): CFML raises on `len()` of a value that is none of those shapes; this returns zero,
 * reading it as "not supplied". Reproducing the raise would mean inventing a message string, and
 * `../errors/DomainError` closes its inventory at the four catalog strings the slice actually
 * declares. The divergence is confined to `null`, `undefined` and function-valued payload entries.
 */
function dataValueLength(data: Record<string, unknown>, key: string): number {
  if (!dataKeyExists(data, key)) {
    return 0;
  }

  const value: unknown = data[key];

  if (typeof value === 'string') {
    return value.length;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return renderSimpleDataValue(value).length;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length;
  }

  return 0;
}

/**
 * Reads a payload entry as the `required string titleString` parameter at
 * `model/service/DataService.cfc:L53` would receive it.
 *
 * Returns `undefined` when the key is absent or when the value is not a CFML simple value. The
 * second case is where CFML would raise while coercing an array or struct into a `string` argument;
 * as with {@link dataValueLength}, no message string is invented for it, and the caller below
 * consequently derives no title in that case rather than falling through to a different source —
 * which keeps the if / else-if structure of `:L69-L73` intact.
 *
 * No explicit {@link dataKeyExists} test is needed here, and adding one would only create an
 * unreachable branch. Reading an absent key yields `undefined`, which is not a CFML simple value and
 * therefore takes the same exit; and the one call site reaches this function only after
 * {@link dataValueLength} has already reported a non-zero length for the same key, which an absent
 * key never does. `structKeyExists` is load-bearing in {@link dataValueLength} alone.
 */
function dataValueText(data: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = data[key];

  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return renderSimpleDataValue(value);
  }

  return undefined;
}

/**
 * Reproduces CFML's `!isNull(x) && len(x)` for a typed entity string property, and narrows.
 *
 * One helper covers both entity reads in `saveBrand`, in each of the two polarities the legacy uses:
 * negated it is the `isNull(getURLTitle()) || !len(getURLTitle())` half of the guard at
 * `model/service/BrandService.cfc:L68`, and asserted it is the
 * `!isNull(getBrandName()) && len(getBrandName())` test at `:L71`. Declaring it as a type predicate
 * is what lets the second call site hand a `string` to the derivation with no non-null assertion and
 * no cast (AAP 0.7.3 S1).
 *
 * `../domain/product/Brand` declares `urlTitle` and `brandName` as optional FIELDS rather than the
 * `getURLTitle()` / `getBrandName()` accessors the legacy calls — its module header records that
 * generated accessors become field reads — so an unset ORM property arrives as `undefined` and
 * CFML's `isNull` becomes a comparison the compiler checks. No trim is applied, for the reason given
 * on {@link dataValueLength}.
 */
function hasEntityText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/**
 * The extracted Catalog brand service — the port of `model/service/BrandService.cfc`.
 *
 * `extends` NOTHING, by mandate. R3 (AAP 0.4.3.3) and AAP 0.3.3 replace the legacy
 * `extends="HibachiService"` template-method reuse with composition against an injected base
 * collaborator, so the inherited surface the slice never used never enters the port. See IR-8 in the
 * module header for what `super.save()` actually resolved to.
 *
 * FOUR MEMBERS, AND THE COUNT IS THE POINT. One is declared in the legacy source —
 * {@link BrandService.saveBrand} at `model/service/BrandService.cfc:L67` — and three existed only as
 * emergent behaviour of the prefix dispatcher at `org/Hibachi/HibachiService.cfc:L255-L281`, which
 * IR-1 requires to become explicit declarations. Nothing else is added: no smart-list member, no
 * count, list, export or process member, and no second uniqueness algorithm.
 *
 * Stateless by construction (M7) — see the module header.
 *
 * @example
 * ```ts
 * const brandService = new BrandService(brandRepository, baseService);
 *
 * const brand = brandService.newBrand();                    // products === []
 * const saved = await brandService.saveBrand(brand, { brandName: 'ACME Widgets' });
 * // saved.urlTitle === 'acme-widgets', or 'acme-widgets-2' on the first collision
 * ```
 */
export class BrandService {
  /**
   * @param brandRepository - The brand persistence port. Replaces both legacy resolution
   * mechanisms at once: the DI/1 property at `model/service/BrandService.cfc:L51` (R1) and the
   * prefix synthesis of `org/Hibachi/HibachiService.cfc:L255-L281` (R2, IR-1). It backs the three
   * synthesized members below and supplies the uniqueness read the save path performs. No
   * `BrandDAO` exists in the legacy repository to correspond to it.
   * @param baseService - The injected stand-in for `super.save()` at
   * `model/service/BrandService.cfc:L76` and for the synthesized delete dispatch, both of which
   * resolve to the LOCAL overrides at `model/service/HibachiService.cfc:L86` and `:L68` (IR-8). It
   * is INJECTED, never extended (R3), and it owns the populate/validate/persist sequence and the
   * rule sets ported from `model/validation/Brand.json`; this service reproduces none of that.
   */
  public constructor(
    private readonly brandRepository: BrandRepository,
    private readonly baseService: BrandBaseService,
    private readonly urlTitleAttemptBudget: UrlTitleAttemptBudget,
  ) {}

  /**
   * Assigns a unique URL title when none was supplied, then delegates the save.
   *
   * The port of `model/service/BrandService.cfc:L67-L77`, the component's ONE declared public
   * member. AAP 0.4.2.3 fixes the contract as `saveBrand(brand: Brand, data: Record<string,
   * unknown>): Promise<Brand>`, preserving the name, the arity and the argument order of
   * `public any function saveBrand(required any brand, required struct data)`; both parameters stay
   * required, as `required` declares them. The untyped `any` return is tightened to the entity the
   * legacy demonstrably yields — a TR-1 tightening, recorded here rather than made silently.
   *
   * The legacy body is reproduced step for step, and the ORDER is behaviour:
   *
   *   `:L68`  a TWO-PART guard. The derivation runs only when the ENTITY has no URL title AND the
   *           PAYLOAD supplies none. Either half alone is not enough: a caller re-saving a brand
   *           that already has a title must not have it silently re-derived, and an explicit
   *           `data.urlTitle` must win over any derivation.
   *   `:L69`  the payload name is PREFERRED over the entity's. This matters on a rename: the new
   *           name arrives in the payload and has not yet been populated onto the entity, so reading
   *           the entity first would derive the title from the OLD name.
   *   `:L71`  the entity name is the fallback, guarded by its own null-and-length test.
   *   `:L73`  when neither source has a usable name, NO title is derived and nothing is written.
   *           The save still proceeds, and `urlTitle` being `required` in
   *           `model/validation/Brand.json:L5` means the base collaborator's validation is what
   *           reports the failure — exactly as the legacy did.
   *
   * THE MUTATION AT `:L70` AND `:L72` IS LOAD-BEARING AND IS PRESERVED EXACTLY. Both lines write
   * `data.urlTitle = ...` — unscoped, so CFML resolves it to `arguments.data`, and CFML structs are
   * passed BY REFERENCE. The derived title therefore reaches the entity through the base
   * collaborator's POPULATION step, not through any setter, which is why this method mutates the
   * caller's `data` object in place instead of copying it. Replacing the mutation with a spread, a
   * local clone or a `brand.urlTitle = …` assignment would each change observable behaviour: a
   * clone would leave the caller's payload without the key it holds after the legacy call, and a
   * direct field write would bypass the descriptor-driven population path.
   *
   * THE CONTRAST WITH `ProductService.saveProduct` IS DELIBERATE AND MUST NOT BE HARMONISED.
   * `model/service/ProductService.cfc:L264-L292` populates FIRST at `:L266` and then assigns the
   * derived title with an ENTITY SETTER at `:L268-L270`, before persisting through the DAO directly
   * at `:L286-L288` — so it never reaches `super.save()` at all. `saveProduct` and `saveBrand` are
   * two genuinely different sequences in the legacy system, and AAP 0.8.2 Guideline 4 forbids
   * tidying one into the other.
   *
   * Uniqueness is delegated, never re-implemented: `../util/urlTitle` owns the slug transformation
   * and the collision loop, including the pre-incremented counter that makes the first collision
   * suffix `-2` (`model/service/DataService.cfc:L55`, `:L65-L66`). No second algorithm exists here,
   * and no string is trimmed, lower-cased or normalised before it is handed over — that is the
   * utility's job, in the order `model/service/DataService.cfc:L57-L58` fixes.
   *
   * `return super.save(arguments.brand, arguments.data)` at `:L76` becomes a TWO-ARGUMENT POSITIONAL
   * delegation to the injected collaborator, with `context` left to the `"save"` default declared at
   * `model/service/HibachiService.cfc:L86`. The result is returned unchanged and uncast.
   *
   * A validation failure surfaces as the `ValidationError` the base collaborator raises once it has
   * evaluated the whole rule set; the legacy returned an entity carrying its own error bag, and
   * `./BaseService` documents that translation. Nothing is caught or reshaped here.
   *
   * NET-NEW coverage (AAP 0.6.5.2): no legacy `BrandServiceTest` exists.
   *
   * @param brand - The brand to save. Required and positional, per `:L67`.
   * @param data - The inbound payload. Required and positional, per `:L67`. MUTATED in place when a
   * URL title is derived, reproducing the by-reference write at `:L70` and `:L72`.
   * @returns The saved brand, as returned by the base collaborator.
   */
  public async saveBrand(
    brand: ManagedBrand,
    data: Record<string, unknown>,
  ): Promise<ManagedBrand> {
    // `:L68` — the two-part guard, both halves evaluated exactly as declared.
    if (!hasEntityText(brand.urlTitle) && dataValueLength(data, URL_TITLE_DATA_KEY) === 0) {
      // `:L69` — `structKeyExists(arguments.data, "brandName") && len(arguments.data.brandName)`.
      if (dataValueLength(data, BRAND_NAME_DATA_KEY) > 0) {
        const payloadBrandName = dataValueText(data, BRAND_NAME_DATA_KEY);

        // Nested rather than folded into the condition above, so that a payload value with a
        // non-zero `len()` which CFML could not coerce to a string keeps the legacy control flow:
        // the first arm is entered and the `else if` at `:L71` is never reached. See
        // {@link dataValueText}.
        if (payloadBrandName !== undefined) {
          // `:L70` — by-reference write onto the caller's payload.
          data[URL_TITLE_DATA_KEY] = await this.createUniqueBrandUrlTitle(payloadBrandName);
        }
      } else {
        // `:L71` — `!isNull(arguments.brand.getBrandName()) && len(arguments.brand.getBrandName())`.
        const entityBrandName = brand.brandName;

        if (hasEntityText(entityBrandName)) {
          // `:L72` — same by-reference write, from the entity's own name.
          data[URL_TITLE_DATA_KEY] = await this.createUniqueBrandUrlTitle(entityBrandName);
        }
      }
    }

    // `:L76` — `return super.save(arguments.brand, arguments.data);`
    return this.baseService.save(brand, data);
  }

  /**
   * Instantiates a new, unpersisted brand.
   *
   * An IR-1 declaration: this member appears in no legacy source file, existing only through the
   * `new`-prefixed branch of the dispatcher at `org/Hibachi/HibachiService.cfc:L264-L265`. AAP
   * 0.4.2.5 declares the target as `newBrand(): Brand`, and it is reproduced exactly.
   *
   * SYNCHRONOUS, and the absence of a promise carries information. The legacy branch performs
   * in-memory entity instantiation only — no statement is issued and no connection is acquired — so
   * the brand repository declares the primitive synchronous too. A promise-returning signature would
   * compile and would then oblige every caller, production and double alike, to await something that
   * never yields.
   *
   * NO ARGUMENTS, because the legacy branch accepts none that the slice supplies; population belongs
   * to the base collaborator's populate step. Delegated to the repository factory rather than
   * constructing an entity here, so the adapter can return the {@link ManagedBrand}-shaped instance
   * the base collaborator needs, and so the collection defaults stay in one place.
   *
   * TRACEABLE at the entity level ONLY: `meta/tests/unit/entity/BrandTest.cfc:L55` builds its
   * subject through this member and `:L58-L60` asserts `getProducts()` equals `[]`. The empty-array
   * default is a field initialiser in `../domain/product/Brand`, so a brand returned here exposes an
   * empty products array and never `undefined`. The SERVICE-level behaviour of this member is
   * NET-NEW coverage (AAP 0.6.5.2).
   *
   * @returns A newly instantiated, unpersisted brand. Never null or undefined.
   */
  public newBrand(): ManagedBrand {
    return this.brandRepository.newBrand();
  }

  /**
   * Reads one brand by its primary identifier.
   *
   * An IR-1 declaration, from the `get`-prefixed branch at
   * `org/Hibachi/HibachiService.cfc:L305-L327`. AAP 0.4.2.5 declares the target as
   * `getBrand(brandID: string): Promise<Brand | null>` and it is reproduced exactly.
   *
   * ONE PARAMETER — the second is withheld deliberately, and the narrowing is recorded rather than
   * left implicit. The dispatcher's own documentation at `org/Hibachi/HibachiService.cfc:L294`
   * describes the synthesized form as also accepting an `isReturnNewOnNotFound` boolean, which
   * `:L306` defaults to `false` when absent. AAP 0.4.2.5 declares the one-argument form, and the same
   * table states that synthesis is "not reproduced wholesale, only where used": the default is the
   * behaviour the slice relies on, and a member whose return type flips between "the row, or
   * nothing" and "always an entity" cannot be typed honestly without overloads. A caller wanting a
   * fresh instance calls {@link BrandService.newBrand} explicitly.
   *
   * `null` MEANS "NO SUCH ROW", AND IS NOT AN EXCEPTION. The repository contract resolves `null` for
   * a missing row rather than rejecting, and that result is passed through untouched — no
   * throw-on-missing behaviour is invented (AAP 0.7.3 S9), and no default entity is substituted.
   *
   * NET-NEW coverage (AAP 0.6.5.2).
   *
   * @param brandID - The brand's primary identifier, a 32-character string per IR-6. Required and
   * positional, per the ordered-arguments-only convention at
   * `org/Hibachi/HibachiService.cfc:L253`.
   * @returns The matching brand, or `null` when no row matches. Never undefined.
   */
  public getBrand(brandID: string): Promise<ManagedBrand | null> {
    return this.brandRepository.getBrand(brandID);
  }

  /**
   * Removes a brand, subject to the ported delete guards.
   *
   * An IR-1 declaration, from the `delete`-prefixed branch at
   * `org/Hibachi/HibachiService.cfc:L270-L271`, whose private handler at `:L286-L288` reads
   * positional argument 1 by NUMERIC index and hands that value straight to `delete(entity)` — which
   * for this service is the LOCAL override at `model/service/HibachiService.cfc:L68` (IR-8). AAP
   * 0.4.2.5 declares the target as `deleteBrand(brand: Brand): Promise<boolean>` and it is
   * reproduced exactly.
   *
   * THE ENTITY IS THE ARGUMENT, NOT ITS IDENTIFIER — settled by that numeric-index read rather than
   * inferred. Narrowing the parameter to a `brandID` string would look tidier, would change the
   * contract, and would be a silent change since both forms are strings at the boundary.
   *
   * DELEGATED THROUGH THE BASE COLLABORATOR, WHICH IS WHERE THE GUARDS LIVE. It evaluates the ported
   * rule set under the `delete` context before removing anything, so the two guards of
   * `model/validation/Brand.json:L6-L7` — `products` and `physicalCounts` each capped at
   * `maxCollection: 0` — block a removal exactly as they did in CFML. A blocked removal never
   * reaches the repository.
   *
   * THE BOOLEAN IS RETURNED UNCHANGED, and it must not become a raise. `public boolean function
   * delete(required any entity)` at `model/service/HibachiService.cfc:L68` returns the verdict and
   * nothing else — `true` when the brand was removed, `false` when validation blocked it — and
   * `./BaseService` documents why that asymmetry with `save` is preserved. Nothing is caught,
   * inverted or re-wrapped here.
   *
   * NET-NEW coverage (AAP 0.6.5.2).
   *
   * @param brand - The entity to remove. Required and positional, matching the numeric-index read at
   * `org/Hibachi/HibachiService.cfc:L287`.
   * @returns `true` when the brand was removed, `false` when a delete guard blocked it.
   */
  public deleteBrand(brand: ManagedBrand): Promise<boolean> {
    return this.baseService.delete(brand);
  }

  /**
   * Derives a brand URL title that is free on `SwBrand`, reproducing both call sites at
   * `model/service/BrandService.cfc:L70` and `:L72`.
   *
   * Private because it is not part of the legacy public surface — the legacy lines call the injected
   * data service inline, twice, with identical arguments apart from the title source. Factoring the
   * two identical calls into one place removes duplication without changing behaviour, which is the
   * permitted half of the Minimal Change Clause (AAP 0.8.1: minimal in functional scope, explicitly
   * not in idiom). It adds no member to the service's contract.
   *
   * The uniqueness probe is created fresh on every derivation and never memoised (M7). It discards
   * the `tableName` argument the utility passes back because the repository member has the table
   * baked into its meaning and accepts only the candidate value — `model/dao/DataDAO.cfc:L123`
   * interpolates the table and column directly while binding only the value, so routing a
   * caller-supplied identifier through it is precisely what AAP 0.7.3 S2 forbids.
   *
   * THE PROBE'S POLARITY IS INVERTED FROM THE OBVIOUS READING AND MUST STAY THAT WAY. `true` means
   * the candidate is still AVAILABLE, matching `model/dao/DataDAO.cfc:L126-L130`, which returns
   * `false` when a row IS found. Inverting it produces no compile error: the collision loop in
   * `../util/urlTitle` would either never run, admitting duplicate titles, or never terminate.
   *
   * @param titleString - The human-readable source title, passed through untouched. Every
   * transformation belongs to `createUniqueURLTitle`.
   * @returns A URL title free on `SwBrand`, suffixed `-2`, `-3`, … on successive collisions.
   * @throws {DomainError} when the injected attempt budget is exhausted before a free title is found
   *   (SEC-13). Nothing is fabricated in that case: a generated fallback would hand back a title the
   *   uniqueness probe never approved, and `urlTitle` is unique-constrained.
   */
  private createUniqueBrandUrlTitle(titleString: string): Promise<string> {
    return createUniqueURLTitle(
      titleString,
      BRAND_TABLE_NAME,
      (_tableName, candidateUrlTitle) =>
        this.brandRepository.isUrlTitleAvailable(candidateUrlTitle),
      /* SEC-13 — the collision-probe bound, passed through rather than decided here. This service
       * states no number of its own: AAP 0.7.3 S9 forbids inventing one, so the value travels from the
       * composition root through the constructor to the utility unchanged. */
      this.urlTitleAttemptBudget,
    );
  }
}
