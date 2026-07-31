/**
 * `BrandRepository` — the repository port for the Catalog's brand persistence surface.
 *
 * THERE IS NO `BrandDAO`, SO THIS PORT HAS NO LEGACY DECLARATION TO TRANSLITERATE. Every sibling in
 * this folder derives from a component that exists on disk — `model/dao/SkuDAO.cfc`,
 * `model/dao/OptionDAO.cfc`, `model/dao/ProductDAO.cfc` and `model/dao/ProductTypeDAO.cfc`. This one
 * derives from nothing: no brand data-access component exists in the tree, and
 * `model/service/BrandService.cfc:L51` declares `property name="dataService" type="any";` as the only
 * property the whole component has, so there is no brand data-access injection and no accessor was
 * ever generated for one. The component corroborates its own emptiness — a scan for function
 * declarations over it returns exactly ONE hit, `saveBrand` at
 * `model/service/BrandService.cfc:L67`, and five of its six banner-delimited sections contain nothing
 * but their own banner comments (`:L53-L55`, `:L57-L59`, `:L61-L63`, `:L81-L83`, `:L85-L87`); only the
 * save-override section at `:L65-L79` holds anything.
 *
 *   1. A repository-wide filename search for a brand data-access component returns ZERO hits. No
 *      `BrandDAO` exists anywhere in the tree, in any casing.
 *   2. `model/service/BrandService.cfc:L51` declares `property name="dataService" type="any";` and
 *      that is the ONLY property the whole component declares. There is no brand data-access
 *      injection to find, so no accessor was ever generated for one; a repository-wide grep for such
 *      an injection also returns zero hits.
 *
 * The component corroborates its own emptiness, which is why the second search matters as much as
 * the first. `model/service/BrandService.cfc` is 90 lines long and a scan for function declarations
 * over it returns exactly ONE hit — `saveBrand` at `model/service/BrandService.cfc:L67`. Five of its
 * six banner-delimited sections contain nothing but their own banner comments: `:L53-L55`,
 * `:L57-L59` (the data-access pass-through section — empty), `:L61-L63`, `:L81-L83` and `:L85-L87`.
 * Only the save-override section at `:L65-L79` holds anything.
 *
 * Worth recording, because a reader checking those locators will notice it: the pass-through
 * section's opening banner is duplicated — `:L57` and `:L59` carry the identical START text where
 * the second should have read END. That is an observation about the source, NOT a carried defect.
 * The register for this slice runs D1 to D24 and is CLOSED (AAP 0.6.7 catalogues D1-D21 under AAP
 * 0.7.3, S7; D22 through D24 were found during the port); no identifier is minted here, and nothing
 * in the legacy tree is corrected (TR-6).
 *
 * =================================================================================================
 * WHAT FABRICATES THE SURFACE INSTEAD, AND WHY THAT MAKES THIS FILE NECESSARY (IR-1)
 * =================================================================================================
 * `org/Hibachi/HibachiService.cfc:L255-L281` is a single dispatcher that manufactures the whole
 * implicit persistence surface of every service at call time by matching a lower-cased method-name
 * prefix: `get` at `:L258` (splitting at `:L259-L260` on a nine-character suffix into a paginated
 * variant), `new` at `:L264`, `list` at `:L266`, `save` at `:L268`, `delete` at `:L270`, `count` at
 * `:L272`, `export` at `:L274` and `process` at `:L276`. A name matching none of them reaches the
 * fallthrough raise at `org/Hibachi/HibachiService.cfc:L280` — cited by locator only, because the
 * message literal belongs to the closed inventory owned by `src/errors/DomainError.ts` and is
 * reproduced nowhere else, not even inside a comment.
 *
 * That mechanism is why `brandService.newBrand()`, `brandService.getBrand(id)` and
 * `brandService.deleteBrand(entity)` all resolve at runtime while appearing in no source file as a
 * declaration. IR-1 states the consequence: TypeScript under `strict` "has no equivalent facility",
 * so each such call site must become an explicitly declared, typed member. This file is that
 * requirement in its purest form — a contract that exists nowhere in the legacy tree as a
 * declaration, only as the emergent behaviour of eight prefix comparisons.
 *
 * THE FRAMEWORK'S OWN DOCBLOCK MAKES THE CASE FOR REPLACING IT, USING BRAND AS THE EXAMPLE.
 * `org/Hibachi/HibachiService.cfc:L256` lower-cases the incoming method name before any comparison,
 * so prefix dispatch is case-insensitive; the framework then had to carve an exception back out, and
 * `org/Hibachi/HibachiService.cfc:L299` records why, verbatim: "AND here is case sensetive to avoid
 * matching in property name i.e brAND" (the spelling of "sensetive" is the source's own). The
 * compound-filter form at `org/Hibachi/HibachiService.cfc:L298` splits a method name on the word AND,
 * and the word BRAND CONTAINS the word AND — so string-prefix-and-infix dispatch over entity names is
 * one naming coincidence away from misrouting, and the framework's own authors special-cased the
 * letters of this very entity. An explicitly declared interface cannot misroute: a member either
 * exists with a checked signature or the compiler rejects the call site.
 *
 * POSITIONAL ARGUMENTS ONLY — THE CONVENTION THAT FIXES EVERY SIGNATURE BELOW.
 * `org/Hibachi/HibachiService.cfc:L253`, verbatim: "NOTE: Ordered arguments only--named arguments not
 * supported." The note is repeated at `org/Hibachi/HibachiService.cfc:L303`, and the dispatcher proves
 * it structurally: the delete branch at `org/Hibachi/HibachiService.cfc:L286-L288` reads its argument
 * by NUMERIC index and the read branch at `org/Hibachi/HibachiService.cfc:L306` probes for the string
 * key `'2'`. Consequently no member below takes a named-argument struct, options object or partial
 * payload. That is the legacy calling convention preserved (TR-1), not a stylistic preference:
 * modelling any member as taking a keyed bag would silently widen a contract the framework never
 * offered.
 *
 * FIVE MEMBERS, NOT NINE — THE RESTRAINT IS AS BINDING AS THE DECLARATION. AAP §0.4.2.5 sets the
 * precedent for the product side: the `count`-, `list`- and `export`-prefixed members are NOT
 * declared, because "synthesis is not reproduced wholesale, only where used". Four prefixes are
 * declared here because the slice reaches for them, plus one uniqueness read the save path performs:
 *
 *   `new`    -> {@link BrandRepository.newBrand}
 *   `get`    -> {@link BrandRepository.getBrand}
 *   `save`   -> {@link BrandRepository.saveBrand}
 *   `delete` -> {@link BrandRepository.deleteBrand}
 *   (read)   -> {@link BrandRepository.isUrlTitleAvailable}
 *
 * Five synthesizable prefixes are deliberately WITHHELD, and their absence is a decision: no
 * `count`-prefixed member, no `list`-prefixed member (the four list forms documented at
 * `org/Hibachi/HibachiService.cfc:L241-L247`), no `export`-prefixed member, no `process`-prefixed
 * member, and no paginated read variant. The slice calls none of them for brand. The paginated
 * dynamic-query surface is owned in full by the query-abstraction port at the root of `src/ports/`,
 * whose legacy implementation is inherited framework plumbing at
 * `org/Hibachi/HibachiDAO.cfc:L102-L111`; duplicating a brand-shaped entry point for it here would
 * create a second, narrower owner of the same concern. The compound-filter read forms at
 * `org/Hibachi/HibachiService.cfc:L296` and `:L298` are withheld for the same reason. Every member
 * added here is a member a hand-written double must implement, so an interface padded "for
 * completeness" imposes real cost for capability nothing exercises (AAP §0.8.2 Guideline 4).
 *
 * WHERE THE STATEMENTS, THE IDENTIFIERS AND THE TRANSACTION LIVE INSTEAD. Statement text, placeholder
 * generation and identifier handling are the adapter's responsibility (AAP §0.4.1.7, §0.4.3.4), so
 * nothing statement-shaped crosses this boundary: no fragment, no physical table or column name in any
 * code position, no placeholder array (AAP §0.7.3 S2). What this file does carry is the adapter
 * OBLIGATIONS the type system cannot express, each stated on the member it constrains with its legacy
 * locator. Transaction demarcation is likewise absent: `model/service/BrandService.cfc` opens no
 * transaction, performs no flush and commits nothing, because the legacy commit happens implicitly at
 * request end — execution-model mismatch M5 (AAP §0.6.6) — whose owner in the target is
 * `src/adapters/mysql/UnitOfWork.ts`. M5 is cited here, not claimed here.
 *
 * =================================================================================================
 * TYPE-ONLY, THEREFORE WEIGHTLESS — AND HAND-IMPLEMENTABLE BY CONSTRUCTION
 * =================================================================================================
 * Everything below is a type declaration. There is no executable statement, no statement text, no
 * driver reference and no I/O of any kind, and the sole import is type-only so it too is erased.
 * TypeScript removes this module entirely at compile time, so it contributes zero bytes to the bundle
 * `build/esbuild.mjs` emits — while remaining the artefact that `src/adapters/mysql/**`,
 * `src/services/**`, the composition root and the hand-written test doubles are all checked against.
 * The contract is expressed as an interface rather than an abstract base type precisely so a double
 * can satisfy it with a plain object literal and inherit nothing (AAP 0.3.3, composition over
 * inheritance).
 *
 * =================================================================================================
 * WHERE THE STATEMENTS, THE IDENTIFIERS AND THE TRANSACTION LIVE INSTEAD
 * =================================================================================================
 * Statement text, placeholder generation and identifier handling are the adapter's responsibility
 * (AAP 0.4.1.7 and 0.4.3.4), so nothing statement-shaped crosses this boundary: no fragment, no
 * physical table or column name in any code position, and no placeholder array (AAP 0.7.3, S2). What
 * this file does carry is the set of adapter OBLIGATIONS the type system cannot express, each stated
 * on the member it constrains and each with the legacy locator that justifies it (AAP 0.8.5).
 *
 * Transaction demarcation is likewise absent, and deliberately so. `model/service/BrandService.cfc`
 * opens no transaction, performs no flush and commits nothing; the legacy commit happens implicitly
 * at request end, which is execution-model mismatch M5 (AAP 0.6.6). Its owner in the target is
 * `src/adapters/mysql/UnitOfWork.ts`, so this port declares no begin, commit, flush or
 * scope-a-transaction member. M5 is cited here, not claimed here, and the mismatch register is CLOSED
 * at M1 to M9 (AAP 0.6.6 catalogues M1-M8 and M9 was found during the port; AAP 0.7.3, S8) — no new
 * identifier is introduced.
 *
 * =================================================================================================
 * REFERENCE-ONLY SOURCES, AND WHICH HALF OF "MINIMAL CHANGE" APPLIES
 * =================================================================================================
 * `org/Hibachi/HibachiService.cfc`, `org/Hibachi/HibachiDAO.cfc`, `model/service/BrandService.cfc`,
 * `model/dao/DataDAO.cfc` and `model/service/DataService.cfc` are all REFERENCE-ONLY and never
 * modified (AAP §0.4.1.1, TR-6); the framework files are read for their contract and contribute no
 * code (AAP §0.8.3.2). The Minimal Change Clause (AAP §0.8.1) is minimal in FUNCTIONAL SCOPE and
 * expressly not in idiom: runtime prefix synthesis becoming compile-checked declarations, property
 * injection becoming constructor injection, and untyped returns becoming precise types are all the
 * permitted half. Behaviour is the line that does not move — the availability polarity of
 * {@link BrandRepository.isUrlTitleAvailable}, the synchronous return of
 * {@link BrandRepository.newBrand}, positional-only arguments, the fixed physical table behind the
 * uniqueness read, and the decision to declare four prefixes rather than nine.
 */

import type { ManagedEntity as EntitySideManagedEntity } from '../../domain/base/AuditableEntity';
import type { ManagedEntity } from '../../domain/base/populate';
import type { Brand } from '../../domain/product/Brand';

/**
 * A brand carrying the framework-inherited member surface that the save and delete path calls at run
 * time — the EXPLICIT form of a guarantee this port previously left implicit.
 *
 * ⚠️⚠️ F05 — WHY THIS ALIAS EXISTS. Every member below used to be typed on the bare domain `Brand`,
 * which told the composition root NOTHING about whether a hydrated brand could be handed to
 * `src/services/BaseService.ts` safely. That collaborator, and the `src/validation/Validator.ts` it
 * drives, call `getClassName()`, `hasProperty()`, `getPrimaryIDValue()`, `getEntityName()` and
 * `getPropertyMetaData()` on whatever they receive. A contract that promises only `Brand` while the
 * consumer requires those members is a contract that can be satisfied by an object which fails at run
 * time — so the requirement is stated here, in the return types, where the composition root reads it.
 *
 * `ManagedEntity` is the ported form of the members Hibachi supplied by inheritance and synthesis:
 * [org/Hibachi/HibachiObject.cfc:L135] (`getClassName`), [org/Hibachi/HibachiEntity.cfc:L244] and
 * [:L249] (`getPrimaryIDValue`, `getPrimaryIDPropertyName`), [:L287] (`getEntityName`) and
 * [org/Hibachi/HibachiTransient.cfc:L738] and [:L763] (`getPropertyMetaData`, `hasProperty`). In the
 * legacy application no equivalent alias could exist, because EVERY entity inherited the surface from
 * `HibachiEntity` and the guarantee was structural. This port has no inheritance to lean on (AAP
 * 0.8.3.2 retires `org/Hibachi/**` for this slice), so the guarantee is expressed as a type.
 *
 * NO ADAPTER, FACADE OR WRAPPER IS INTRODUCED, and that is a measurement rather than a preference:
 * `src/domain/product/Brand.ts` declares `class Brand implements AuditableEntity, ManagedEntity` — the
 * NON-generic entity-side contract in `src/domain/base/AuditableEntity.ts` — and
 * implements all seven members directly, so `Brand` ALREADY satisfies this alias and
 * {@link _BrandSatisfiesManagedBrand} proves it at compile time. Wrapping it would add a second
 * object identity for one entity and buy nothing. The alias therefore tightens what the contract SAYS
 * without changing what any implementation must DO (AAP 0.4.2, TR-1 — a tightening to the observed
 * contract, recorded rather than made silently).
 *
 * The import direction stays legal: `src/ports/**` imports from `src/domain/**` only, which is the
 * existing discipline in this folder and the one AAP 0.7.3 S4 requires.
 *
 * ⚠️ TWO SPELLINGS OF `ManagedEntity` EXIST AND THIS ALIAS USES THE GENERIC ONE DELIBERATELY.
 * `src/domain/base/AuditableEntity.ts` declares the NON-generic `interface ManagedEntity` that each
 * of the six entity classes lists in its `implements` clause — that is the entity's own promise.
 * `src/domain/base/populate.ts` declares `type ManagedEntity<TEntity>`, the VIEW a collaborator holds
 * over an entity, composed as the entity intersected with the metadata and error surfaces. A port
 * describes what it hands back to a collaborator, so the generic view is the correct one here and is
 * what every member below already returns. Both modules sit BELOW this port and below the service
 * that consumes it, so nothing here reaches sideways into `src/services/**` or `src/validation/**`.
 */
export type ManagedBrand = ManagedEntity<Brand>;

/**
 * Compile-time proof of the TWO facts this port depends on, stated separately because they are two
 * different claims and only one of them is about the entity class alone.
 *
 * ⚠️ THE OBVIOUS GUARD — `Brand extends ManagedBrand` — WOULD BE FALSE, AND ASSERTING IT WAS A REAL
 * MISTAKE THAT IS RECORDED HERE RATHER THAN QUIETLY DROPPED. A bare `Brand` does NOT carry the six
 * members of the error surface (`addError`, `addErrors`, `getErrors`, `getError`, `hasErrors`,
 * `hasError`); `src/domain/base/populate.ts`'s `manageEntity` is what supplies them, which is exactly
 * why {@link ManagedBrand} is the intersection it is and why the ADAPTER — not the entity module —
 * must produce values of that type. Asserting the entity already satisfied it would have compiled
 * only while `ManagedBrand` was spelled as the weaker non-generic contract, and would then have
 * silently stopped proving anything the day the port's members were typed at the managed view.
 *
 * SO THE TWO TRUE CLAIMS ARE ASSERTED INSTEAD:
 *
 *   1. `Brand` satisfies the ENTITY-SIDE contract it declares — the non-generic `ManagedEntity`
 *      interface in `src/domain/base/AuditableEntity.ts` that appears in its `implements` clause. If a
 *      future change strips `getClassName`, `getEntityName`, `hasProperty`, `getPropertyMetaData`,
 *      `getPrimaryIDValue` or `getPrimaryIDPropertyName` off the class, the build breaks here.
 *   2. Every value this port hands back is still usable AS a `Brand`. That is what lets
 *      `src/services/BrandService.ts` read declared properties straight off a repository result
 *      without a cast, and it fails here if `ManagedBrand` ever stops intersecting the entity.
 *
 * Both are type-only and contribute nothing to the bundle.
 */
type _BrandSatisfiesEntitySideContract = Brand extends EntitySideManagedEntity ? true : never;
const _brandSatisfiesEntitySideContract: _BrandSatisfiesEntitySideContract = true;
void _brandSatisfiesEntitySideContract;

type _ManagedBrandIsUsableAsBrand = ManagedBrand extends Brand ? true : never;
const _managedBrandIsUsableAsBrand: _ManagedBrandIsUsableAsBrand = true;
void _managedBrandIsUsableAsBrand;

/**
 * Port for the brand persistence primitives `BrandService` consumes, implemented against MySQL in
 * `src/adapters/mysql/**` and supplied to the service by explicit constructor injection.
 *
 * The implementation arrives as a constructor parameter, replacing two distinct legacy mechanisms at
 * once (AAP 0.7.3, S3). The first is DI/1 property injection: `model/service/BrandService.cfc:L51`
 * declares its collaborator as a component property that the container populated by NAME during a
 * runtime bean scan, reached thereafter through a generated accessor (AAP 0.4.3.1, R1). The second is
 * the prefix synthesis of `org/Hibachi/HibachiService.cfc:L255-L281`, which needed no declaration of
 * any kind (AAP 0.4.3.2, R2). Neither survives: there is no service locator here, no string-keyed
 * runtime resolution and no dynamic method fabrication.
 *
 * `BrandService` is the cleanest of the four in-scope services — AAP 0.6.3.3 records ZERO dead
 * injections for it, in contrast to the four carried by its siblings — so nothing in this port exists
 * to accommodate an unused dependency. Its one declared collaborator is genuine but NARROW: both call
 * sites use it for a single purpose, unique URL-title derivation at
 * `model/service/BrandService.cfc:L70` and `model/service/BrandService.cfc:L72`. That algorithm is
 * ported as the utility `src/util/urlTitle.ts`, and the database read it depends on is
 * {@link BrandRepository.isUrlTitleAvailable} below — which is why this port carries a uniqueness
 * member at all.
 *
 * FOUR MEMBERS RESOLVE, ONE RETURNS DIRECTLY. The three database-touching primitives and the
 * uniqueness read are promise-returning because the target reaches MySQL through an asynchronous
 * driver, whereas the legacy members were synchronous only because a CFML query blocks the request
 * thread. That is idiom, and it is the permitted half of the Minimal Change Clause (AAP 0.8.1).
 * {@link BrandRepository.newBrand} is the deliberate exception, and its synchronous signature carries
 * information rather than style — see the member.
 *
 * THE SERVICE CONTRACT AND THIS CONTRACT ARE DIFFERENT SURFACES, DELIBERATELY. AAP 0.4.2.3 declares
 * the service member as `saveBrand(brand, data)`, taking the raw inbound payload; AAP 0.4.2.5
 * declares `newBrand`, `getBrand` and `deleteBrand` on the service too. The members below are the
 * PRIMITIVES BENEATH those, and their signatures are narrower on purpose. Populating an entity from
 * a payload and validating it belong to `src/services/**` and `src/validation/**`; persisting an
 * already-populated entity belongs here. Conflating the two would push populate-and-validate concerns
 * into the persistence layer, which is exactly the layering the hexagonal split exists to prevent
 * (AAP 0.7.3, S4).
 *
 * EVERY MEMBER HERE DEALS IN THE MANAGED ENTITY SHAPE, NOT THE BARE DOMAIN CLASS.
 * =================================================================================================
 * The four entity-bearing members below are typed `ManagedEntity<Brand>` — `Brand` intersected with
 * the seven framework introspection members and the six error members that
 * `src/domain/base/populate.ts` declares and its `manageEntity` supplies. This is a correction, and
 * the reason is worth stating because the narrower reading looks more conservative and is in fact
 * less faithful.
 *
 * WHAT THE LEGACY BRANCHES ACTUALLY HAND BACK. Two hops, both read rather than inferred. The
 * `new`-prefixed branch is selected at `org/Hibachi/HibachiService.cfc:L264-L265` and dispatches to
 * `onMissingNewMethod`, whose whole body is `return new( entityName );` at
 * `org/Hibachi/HibachiService.cfc:L548`. The `get`-prefixed branch is selected at
 * `org/Hibachi/HibachiService.cfc:L258` and dispatches to `onMissingGetMethod`, which ends in
 * `return get( entityName, id, isReturnNewOnNotFound );` at `org/Hibachi/HibachiService.cfc:L326`.
 * Both yield a full Hibachi ENTITY, not a property bag. Such an entity answers
 * `getClassName()`, `hasProperty()`, `getPropertyMetaData()`, `getPrimaryIDValue()`,
 * `getPrimaryIDPropertyName()`, `getEntityName()` and `getValueByPropertyIdentifier()`, and it
 * carries its own error bean — every one of them INHERITED rather than written per entity. The
 * inheritance is observable in the source rather than assumed: `model/entity/Sku.cfc:L843-L855`
 * overrides `getPropertyMetaData` and then falls through to `super.getPropertyMetaData(
 * argumentCollection=arguments )` at `:L854`, a call that can only resolve because the base class
 * supplies the member. Declaring these members as bare `Brand` therefore described something the
 * legacy never produced.
 *
 * WHY IT MATTERED RATHER THAN BEING MERELY IMPRECISE. `src/services/BrandService.ts` names the shape
 * its base collaborator and the ported brand rule set require, and `src/validation/Validator.ts`
 * calls `getClassName()` on the subject it is handed. With this port narrowed to `Brand`, the only
 * two sources of a brand in the whole subtree — {@link BrandRepository.newBrand} and
 * {@link BrandRepository.getBrand} — discarded the surface their implementations already had, so no
 * code path could produce a value satisfying that requirement and a plain `Brand` reaching the
 * validator failed at its first call. `src/adapters/mysql/rowMappers.ts` had ALREADY been routing
 * every brand through `manageEntity`; this contract was throwing that away at the boundary.
 * `Object.assign` preserves identity, so the managed value IS the entity and nothing is wrapped.
 *
 * NO LAYERING RULE IS BENT. `src/domain/base/populate.ts` is a domain module, and this folder already
 * imports from `src/domain/**` for `Brand` itself; the import added for it is type-only, so nothing
 * is pulled into any bundle. The three MySQL obligations recorded per member are unchanged.
 */
export interface BrandRepository {
  /**
   * Instantiates a new, unpersisted brand.
   *
   * SYNCHRONOUS, AND THE ABSENCE OF A PROMISE IS THE POINT. The legacy `new`-prefixed branch at
   * `org/Hibachi/HibachiService.cfc:L264-L265` resolves to in-memory entity instantiation: it
   * allocates an object and returns it. No statement is issued, no connection is acquired and no row
   * is read or written. Declaring this member synchronous states that fact in the type, exactly as
   * AAP 0.4.2.5 does for the service-level equivalent. A promise-returning signature would compile
   * perfectly and would then oblige every caller — production and test double alike — to await
   * something that never yields, permanently encoding an I/O boundary that does not exist.
   *
   * NOT AN IDENTITY GENERATOR, AND NOT A PERSISTENCE CALL. The returned entity is transient. The
   * 32-character identifier convention of IR-6 is owned by `src/util/uuid.ts` and applied on the
   * write path; whether a brand created here is assigned its identifier at instantiation or at
   * persistence is the adapter's and the entity's concern, not this contract's. Nothing here reaches
   * the database, so nothing here can fail for a database reason.
   *
   * NO ARGUMENTS, BECAUSE THE LEGACY BRANCH ACCEPTS NONE THAT THE SLICE SUPPLIES. Adding an initial
   * values parameter would invent a capability the source does not offer (AAP 0.7.3, S9), and
   * population is owned by `src/domain/base/populate.ts` in any case.
   *
   * THE INSTANCE IS ALREADY MANAGED WHEN IT LEAVES HERE. The return type is `ManagedEntity<Brand>`
   * for the reason given in the module header: the `return new( entityName );` this branch reaches at
   * `org/Hibachi/HibachiService.cfc:L548` produces a Hibachi entity that already answers the
   * seven introspection members and owns an error bean, so an implementation must route the instance
   * through `manageEntity` from `src/domain/base/populate.ts` before returning it. That call mutates
   * and returns the same object, so this member still allocates exactly one entity and still issues
   * no statement. `src/services/BrandService.ts` relies on this: the value it hands to its base
   * collaborator and to the validator comes from here.
   *
   * @returns A newly instantiated, unpersisted, already-managed brand. Never null or undefined.
   */
  newBrand(): ManagedEntity<Brand>;

  /**
   * Reads one brand by its primary identifier.
   *
   * ONE PARAMETER, AND THE SECOND IS WITHHELD DELIBERATELY — TR-1 NARROWING, RECORDED. The read
   * branch's own documentation at `org/Hibachi/HibachiService.cfc:L294` describes the synthesized form
   * as accepting TWO arguments: the identifier, plus an optional boolean instructing the dispatcher to
   * hand back a freshly instantiated entity when no row matches. The implementation honours it —
   * `org/Hibachi/HibachiService.cfc:L306` probes the argument struct for the string key `'2'` and
   * defaults the flag to false when it is absent.
   *
   * The second argument is NOT reproduced: AAP §0.4.2.5 declares the one-argument form, and the same
   * table states that synthesis is "not reproduced wholesale, only where used". It also removes a
   * genuine hazard — a single member whose return type flips between "the row, or nothing" and "always
   * an entity" depending on a boolean cannot be typed honestly without overloads, and the legacy
   * default of false is the behaviour the slice relies on. A caller wanting a fresh instance calls
   * {@link BrandRepository.newBrand} explicitly.
   *
   * `null` FOR "NO SUCH ROW", NOT AN EXCEPTION. The legacy branch is declared with no return type
   * whatsoever, so its value is entirely untyped; AAP 0.4.2.5 fixes the target as
   * `Promise<Brand | null>`, and the union with `null` is reproduced exactly. The non-null arm is
   * narrowed one step further to `ManagedEntity<Brand>` — a TR-1 tightening to the observed contract,
   * recorded here rather than made silently, since the row this member reads is hydrated by
   * `src/adapters/mysql/rowMappers.ts`, whose `mapBrandRow` already returns precisely that shape.
   * Under `strictNullChecks` the absent case
   * becomes unignorable at every call site — precisely the discipline an untyped return could never
   * provide. Implementations MUST resolve `null` for a missing row rather than rejecting: absence is
   * an ordinary outcome here, not a fault.
   *
   * ADAPTER OBLIGATION — BIND THE IDENTIFIER, NEVER INTERPOLATE IT. The value is bound as a
   * placeholder parameter; the physical table and column names are the adapter's fixed, validated
   * identifiers and never arrive through this signature (AAP §0.7.3 S2).
   *
   * @param brandID - The brand's primary identifier, a 32-character string per IR-6. Required and
   * positional, matching the ordered-arguments-only convention at
   * `org/Hibachi/HibachiService.cfc:L253`.
   * @returns The matching brand, or `null` when no row matches. Never undefined.
   */
  getBrand(brandID: string): Promise<ManagedEntity<Brand> | null>;

  /**
   * Persists an already-populated brand, inserting or updating as its identity requires.
   *
   * ONE PARAMETER, AND THE PAYLOAD ARGUMENT BELONGS TO A DIFFERENT LAYER — THE MOST IMPORTANT
   * DISTINCTION IN THIS FILE. The legacy service member is declared at
   * `model/service/BrandService.cfc:L67` as `saveBrand(required any brand, required struct data)` and
   * forwards BOTH values positionally at `model/service/BrandService.cfc:L76`. AAP 0.4.2.3
   * accordingly declares the SERVICE contract with both arguments. This member is the primitive
   * beneath that service, and it takes the entity alone.
   *
   * The split is not cosmetic. Everything the second argument is for happens in the service, above
   * this boundary: the guard at `model/service/BrandService.cfc:L68` inspects the entity's existing
   * URL title AND the payload key together, the branch at `model/service/BrandService.cfc:L69` reads
   * a name out of the payload, and `model/service/BrandService.cfc:L70` and
   * `model/service/BrandService.cfc:L72` then WRITE a derived URL title back INTO the payload before
   * anything is persisted. Population and validation are owned by `src/domain/base/populate.ts` and
   * `src/validation/**`; by the time control reaches this member the entity is fully populated and
   * validated, so a payload here would be either unused or a second, competing source of truth.
   * Accepting it would drag populate-and-validate concerns into the persistence layer (AAP 0.7.3,
   * S4).
   *
   * IR-8 — WHAT `super.save()` ACTUALLY RESOLVED TO, AND WHY IT IS NOT INHERITED. The forwarding call
   * at `model/service/BrandService.cfc:L76` resolves to the LOCAL override at
   * `model/service/HibachiService.cfc:L86`, which is Slatwall code inside the extraction path, NOT to
   * the framework base at `org/Hibachi/HibachiService.cfc`. That local override adds behaviour, so the
   * distinction is load-bearing rather than trivia. In the target, template-method inheritance is
   * replaced by composition against an injected base collaborator (AAP 0.4.3.3, R3; AAP 0.3.3), whose
   * port is `src/services/BaseService.ts`. Nothing framework-derived is extended, and no framework
   * member the slice never used is inherited into this contract.
   *
   * ADAPTER OBLIGATION — APPLICATION-SIDE UNIQUENESS IS CHECKED BEFORE THE WRITE, NOT INSTEAD OF THE
   * COLUMN CONSTRAINT (IR-5). `org/Hibachi/HibachiDAO.cfc:L130-L146` performs a pre-save existence
   * query independently of any column-level uniqueness metadata, and `org/Hibachi/HibachiDAO.cfc:L140`
   * excludes the entity being saved from its own result by identifier. Both facts are preserved by the
   * target, and the generic form of that check is owned by the dedicated uniqueness port declared
   * beside this folder under `src/ports/`; the brand URL-title case reaches it instead through
   * {@link BrandRepository.isUrlTitleAvailable}, for the reason given on that member. This member
   * therefore declares no uniqueness parameter and returns no validation outcome: it persists, and
   * validation has already run.
   *
   * ADAPTER OBLIGATION — RESOLVE THE PERSISTED ENTITY, AND BIND EVERY VALUE. The legacy member is
   * declared `returntype="any"` at `model/service/BrandService.cfc:L67` yet demonstrably yields the
   * saved entity, and AAP 0.4.2.3 fixes the target as a brand rather than void; that is reproduced
   * here as a TR-1 tightening. Every column value is bound as a placeholder parameter and no
   * identifier is ever interpolated (AAP 0.7.3, S2). Transaction demarcation is NOT this member's
   * concern — see the note on M5 in the module header.
   *
   * THE ARGUMENT AND THE RESULT ARE BOTH THE MANAGED SHAPE, AND THE ARGUMENT SIDE IS THE LOAD-BEARING
   * HALF. Every brand that reaches persistence in this subtree came from
   * {@link BrandRepository.newBrand} or {@link BrandRepository.getBrand}, so it is managed by the time
   * it arrives; declaring that is what lets `src/services/BaseService.ts` be instantiated at the same
   * shape it validates. Because the base collaborator returns whatever this member resolves, the
   * result is declared managed too — an implementation satisfies it by resolving the entity it was
   * handed, since `manageEntity` preserves identity and persistence does not replace the object.
   *
   * @param brand - The fully populated, already-validated, already-managed entity to persist.
   * Required and positional.
   * @returns The persisted brand, still managed. Never null or undefined.
   */
  saveBrand(brand: ManagedEntity<Brand>): Promise<ManagedEntity<Brand>>;

  /**
   * Removes a brand.
   *
   * THE ENTITY IS THE ARGUMENT, NOT ITS IDENTIFIER. This is settled by the dispatcher rather than
   * inferred: `org/Hibachi/HibachiService.cfc:L286-L288` reads positional argument 1 out of the
   * argument struct by NUMERIC index and hands that value straight to the underlying removal, so
   * whatever the caller passed IS what is removed. AAP 0.4.2.5 declares the target as taking the
   * entity, and that is reproduced exactly. Narrowing the parameter to an identifier string would look
   * tidier and would change the contract: a caller holding an entity would have to reach into it, and
   * a caller holding only a string would gain an entry point the legacy never offered (AAP 0.7.3, S9).
   * It would also be a silent change, since both forms are strings at the boundary.
   *
   * `boolean` OUT, AND THE POLARITY IS THE ORDINARY ONE. The dispatcher branch returns whatever the
   * underlying removal returns and declares no type of its own; AAP 0.4.2.5 fixes the target as
   * `Promise<boolean>`, a TR-1 tightening recorded here. `true` means the brand was removed and
   * `false` means it was not — the plain reading, and deliberately NOT the inverted
   * found-versus-available polarity that {@link BrandRepository.isUrlTitleAvailable} carries. The two
   * are neighbours in this interface and their booleans mean unrelated things, so each states its own
   * polarity rather than relying on a shared convention that does not exist.
   *
   * ADAPTER OBLIGATION — DELETE GUARDS RUN BEFORE THIS MEMBER, NOT INSIDE IT. `model/validation/`
   * declares the brand delete rules, and they are ported as a typed rule set under
   * `src/validation/rules/**` (IR-4) and evaluated by the service. This member neither evaluates them
   * nor reports which one failed; a blocked removal never reaches it. That is why the return type is a
   * plain boolean and not a validation result.
   *
   * @param brand - The already-managed entity to remove. Required and positional, matching the
   * numeric-index read at `org/Hibachi/HibachiService.cfc:L287`. The delete guards evaluated above
   * this boundary read `getPropertyMetaData` and `getPrimaryIDValue` off the same value, so the
   * managed shape is what the caller necessarily holds by the time it gets here.
   * @returns `true` when the brand was removed, `false` when it was not. Never null or undefined.
   */
  deleteBrand(brand: ManagedEntity<Brand>): Promise<boolean>;

  /**
   * Reports whether a candidate URL title is still free for a brand.
   *
   * TRUE MEANS AVAILABLE — NOT "FOUND", NOT "TAKEN". THIS IS THE HIGHEST-RISK DETAIL IN THE FILE.
   * The legacy primitive is `verifyUniqueTableValue`, declared at `model/dao/DataDAO.cfc:L115` with an
   * explicit boolean return type. Its body runs one existence read at `model/dao/DataDAO.cfc:L123` and
   * then inverts the obvious answer: `model/dao/DataDAO.cfc:L126-L128` returns FALSE when a row IS
   * found, and `model/dao/DataDAO.cfc:L130` returns TRUE otherwise. So the boolean answers "is this
   * value still free?", not "does this value exist?".
   *
   * That polarity is not an accident of this one component. `org/Hibachi/HibachiDAO.cfc:L142-L144`
   * returns false on a hit and `org/Hibachi/HibachiDAO.cfc:L146` returns true otherwise, so the
   * system-wide uniqueness predicate of IR-5 reads the same way. The member name here is chosen to
   * make the direction unmissable at every call site, which is why it is NOT named for existence or
   * for being taken — those names would each read as the exact opposite of the value returned.
   *
   * INVERTING IT IS COMPLETELY SILENT. It produces no compile error, no type error and no lint
   * finding, and the observable damage is one of two failures inside the collision loop that consumes
   * it: either the loop never runs and duplicate URL titles reach the database, or every candidate is
   * reported taken and the loop never terminates. Implementations MUST resolve `true` for "still
   * free".
   *
   * WHY IT LIVES ON THE BRAND PORT AT ALL, AND WHY IT TAKES EXACTLY ONE PARAMETER. The legacy
   * primitive is generic over three arguments — a table, a column and a value
   * [`model/dao/DataDAO.cfc:L116-L118`] — but at this call path the first two are CONSTANTS, verified
   * on both sides. The column is pinned to the single literal `urlTitle` by the algorithm's only two
   * probe sites, `model/service/DataService.cfc:L62` and `model/service/DataService.cfc:L67`. The
   * table is pinned to `SwBrand` by the algorithm's only two brand callers,
   * `model/service/BrandService.cfc:L70` and `model/service/BrandService.cfc:L72`.
   *
   * Both identifiers are therefore baked into this member's MEANING rather than passed to it, and
   * that is forced rather than chosen: `model/dao/DataDAO.cfc:L123` interpolates both of them directly
   * into the statement while binding only the value, so accepting either through this signature would
   * hand a caller-supplied string to an identifier position. AAP 0.7.3 S2 forbids exactly that — every
   * value is bound as a placeholder and identifiers come only from a validated, adapter-side
   * whitelist. One parameter, the candidate value, is the whole signature.
   *
   * ADAPTER OBLIGATION — NO MEMOIZATION, NO PER-CALL SIDE EFFECT, SAFE TO RE-CALL. The consumer calls
   * this an unbounded number of times for a single derivation: `model/service/DataService.cfc:L62`
   * probes once and the loop at `model/service/DataService.cfc:L64-L68` probes again on every
   * iteration. Each call MUST read current state. A cache would make the loop non-terminating on its
   * first collision, and the legacy holds none — nor may one be introduced (AAP 0.7.3, S9). This is
   * also the right answer for a warm container: module-scope memoization leaks across invocations and
   * therefore across tenants, which is execution-model mismatch M7 (AAP 0.6.6), cited and not claimed.
   *
   * THE SUFFIX RULE IS NOT THIS MEMBER'S BUSINESS. What a caller does after a `false` — how a
   * candidate is re-derived and what the next one looks like — is owned entirely by
   * `src/util/urlTitle.ts`, ported from `model/service/DataService.cfc:L53-L71`, including the
   * counter-ordering detail AAP 0.4.1.11 records at `model/service/DataService.cfc:L55`,
   * `model/service/DataService.cfc:L65` and `model/service/DataService.cfc:L66`. It is cited by
   * locator here and deliberately neither implemented nor restated, so there is exactly one owner of
   * it. That utility declares its own narrow probe type locally and imports nothing from this folder;
   * an adapter can satisfy both shapes, and neither type is re-exported by the other.
   *
   * TODO(parity): TWO DIVERGENT UNIQUE-URL-TITLE STRATEGIES COEXIST IN THE LEGACY SYSTEM, AND THEY
   * STAY DIVERGENT. The strategy behind this member is the numeric-suffix retry of
   * `model/service/DataService.cfc:L53-L71`. A DIFFERENT strategy exists at
   * `model/dao/ProductDAO.cfc:L398-L409`, reached only when the importer's target is the product
   * table: it derives a filtered file name and, on collision, appends the product code rather than a
   * counter. Harmonising the two would change observable output on one path or the other, so the
   * divergence is documented and CARRIED, not reconciled (AAP 0.7.3 S7; AAP 0.8.2 Guideline 4). No
   * product-shaped variant is added to this brand interface, and no register identifier is minted —
   * D1 to D24 is closed.
   *
   * @param urlTitle - The candidate URL-title value to test. Required and positional. Bound as a
   * placeholder parameter, exactly as `model/dao/DataDAO.cfc:L123` binds it and nothing else.
   * @returns `true` when the candidate is still AVAILABLE — no brand row already carries it — and
   * `false` when it is already in use. Never null or undefined.
   */
  isUrlTitleAvailable(urlTitle: string): Promise<boolean>;
}
