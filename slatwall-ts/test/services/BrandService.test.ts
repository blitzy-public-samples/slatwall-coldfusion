/**
 * `BrandService` — the four-member surface, the exact URL-title algorithm, and the local
 * `BaseService` save/delete contracts it delegates to.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/services/BrandService.test.ts` | CREATE |
 * "**NET-NEW**", and the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The
 * subject's contract is fixed by AAP §0.4.2.3 (the ONE declared member) and AAP §0.4.2.5 (the three
 * members that existed only through `onMissingMethod` synthesis, IR-1).
 *
 * =============================================================================================
 * THESE ARE UNIT TESTS. THE LEGACY SUITE'S EQUIVALENTS WERE INTEGRATION TESTS
 * =============================================================================================
 * Every case below imports the class under test directly and hands it collaborators through its
 * constructor. Nothing boots an application, nothing resolves a name at run time, and nothing
 * touches a database.
 *
 * The legacy harness could not work that way. `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84`
 * extends `mxunit.framework.TestCase`, instantiates the whole FW/1 application object at `:L52`,
 * calls `bootstrap()` at `:L60` and then reaches its subject through a DI/1 string lookup —
 * `request.slatwallScope.getService("brandService")` at
 * `meta/tests/unit/entity/BrandTest.cfc:L55`. A legacy "unit" test of this service was therefore an
 * integration test of the entire container, the ORM session and the request scope. AAP §0.4.3.6
 * records that difference as the single largest structural change between the two suites and directs
 * that a reviewer expect it BY DESIGN rather than read it as a gap.
 *
 * The legacy setup additionally granted itself a superuser at
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L62` — `request.slatwallScope.getAccount()
 * .setSuperUserFlag(1)` — because the container it had just booted enforced permissions on every
 * entity operation. That line is recorded here for provenance and for nothing else: this file
 * declares NO permission case, invents no account policy and asserts no authorisation outcome.
 * `BrandService` has no authorisation collaborator of its own, and the population-authorisation
 * decision that does exist behind `BaseService` belongs to the excluded `Account*` family
 * (AAP §0.2.2.1) and is exercised here only as the plain wiring the real constructor demands.
 *
 * =============================================================================================
 * TRACEABILITY IS DOCUMENTARY, NOT EMPIRICAL — AND NO RUNTIME COMPARISON WAS PERFORMED
 * =============================================================================================
 * Every legacy locator cited below was established by READING legacy source, never by running it.
 * Three independent facts make that the only available method, and all three are disclosed rather
 * than glossed:
 *   * MXUnit is not vendored anywhere in the repository, and `meta/tests/readme.txt:L1-L7` states
 *     that the suite needs MXUnit installed with a mapping inside CFIDE — plus CFSelenium, likewise
 *     mapped, for the functional folder. Neither mapping exists here.
 *   * There is no CFML engine on this host and no reproducible legacy runtime to supply one. The
 *     Docker/Compose local-development setup the brief cites at `meta/docker/slatwall-local-dev/`
 *     DOES NOT EXIST in this repository; `meta/` contains only `meta/tests/` and `meta/eclipse/`
 *     (AAP §0.8.4.1).
 *   * Consequently the legacy suite CANNOT be executed here, so no output of this file was ever
 *     compared against observed legacy behaviour (AAP §0.6.5.3, §0.8.4.2).
 * What that costs is stated plainly: these assertions pin the PORT against the legacy SOURCE, and a
 * reader who wants a behavioural diff against a running Slatwall must obtain a CFML runtime first.
 *
 * =============================================================================================
 * EVERY CASE BUILDS ITS OWN COLLABORATORS. THERE IS NO MODULE-SCOPE MUTABLE STATE
 * =============================================================================================
 * No repository, uniqueness seed, entity, error bag, map or counter is declared at module scope.
 * Each case calls a factory and gets a fresh graph, and the two module-level bindings that do exist
 * are immutable string primitives.
 *
 * That discipline is a direct response to what the legacy harness did NOT do. Both of its lifecycle
 * hooks are commented out in the source: `//variables.slatwallFW1Application.reloadApplication();`
 * at `meta/tests/unit/SlatwallUnitTestBase.cfc:L53` and
 * `//variables.slatwallFW1Application.endSlatwallLifecycle();` at `:L70`. With neither the reload
 * nor the lifecycle teardown running, application and request scope — including the DI/1 singletons,
 * the settings cache and the ORM session — persisted across every test in a run, so one case could
 * observe state another case left behind. AAP §0.6.6 M7 makes the same hazard a production concern
 * for the port: nothing survives a Lambda invocation except module-scope state, and a singleton on a
 * warm container is shared across invocations and therefore potentially across tenants. A suite that
 * shared a repository between cases would be unable to detect that class of leak, which is exactly
 * what the isolation cases at the end of this file exist to prove.
 *
 * =============================================================================================
 * TEST PROVENANCE — ALL FOUR PUBLIC MEMBERS ARE NET-NEW COVERAGE
 * =============================================================================================
 * AAP §0.6.5.2 verified that NO legacy `BrandServiceTest` exists anywhere under `meta/tests/`, and
 * that no legacy service test exists for any of the four in-scope services. Every case below is
 * therefore labelled `NET-NEW` in its own title, per case rather than only in aggregate, so the
 * ratio AAP §0.8.3.7 asks for is visible file-by-file and no parity with a legacy service assertion
 * is implied anywhere.
 *
 * The ONE traceable legacy thread that touches this service is an ENTITY assertion, and it is
 * labelled as traceable where it is used rather than claimed for the file as a whole:
 * `meta/tests/unit/entity/BrandTest.cfc:L49-L60` builds its subject through
 * `brandService.newBrand()` at `:L55` and then asserts at `:L58-L60` that `getProducts()` equals
 * `[]`. The entity-level port of that assertion lives in `../domain/Brand.test.ts`; what this file
 * pins is that the SERVICE member keeps it reachable.
 *
 * =============================================================================================
 * WHAT IS COVERED, GROUP BY GROUP
 * =============================================================================================
 * Seven groups, in the order a reviewer would want to read them — algorithm first, then the member
 * that consumes it, then the consequences that member's delegation produces, then the three members
 * the legacy never declared, then isolation.
 *
 *   A. `createUniqueURLTitle` — the ported algorithm of `model/service/DataService.cfc:L53-L71`.
 *      Pipeline ORDER, the `-2`-first suffix run, the probe polarity, the byte-exact `SwBrand` token
 *      and the unbounded loop. Assigned to this file because `BrandService` is the utility's only
 *      production caller and the place its probe is supplied.
 *   B. `saveBrand` over a RECORDING base collaborator — the `:L68` derivation guard in all six of its
 *      states, the payload-versus-entity name preference, the by-reference payload write, and the
 *      positional two-argument delegation at `:L76`.
 *   C. `saveBrand` over the REAL graph — real `Validator`, real `BaseService`, the ported rule set of
 *      `model/validation/Brand.json`. Includes the AAP-omitted no-slug path, the two uniqueness seams
 *      driven to disagree, and the `issue_1690_2` contract.
 *   D. `newBrand()` — the declared factory, its synchronous return, the traceable `products === []`
 *      default and per-call independence.
 *   E. `getBrand(brandID)` — exact identifier forwarding, hit by reference, miss as `null` with no
 *      fabricated fallback.
 *   F. `deleteBrand(brand)` — the products guard, the inert `physicalCounts` guard, the cleanup gate,
 *      and the inactive-entity settings sweep of the local `save()` override.
 *   G. M7 isolation and the declared surface — cross-graph leak proofs, the two-argument constructor,
 *      and an exhaustive prototype assertion that no dynamic dispatch survived.
 *
 * All four public members — `saveBrand`, `newBrand`, `getBrand`, `deleteBrand` — carry `NET-NEW`
 * member-labelled cases, and every case title in the file contains the label.
 *
 * =============================================================================================
 * TWO LANDED CONTRACTS DISAGREE WITH THE OBVIOUS READING. BOTH ARE EXPOSED, NEITHER IS SOFTENED
 * =============================================================================================
 * MISMATCH 1 — THE `SwBrand` TOKEN IS NOT OBSERVABLE AT THE SERVICE BOUNDARY.
 * `model/service/BrandService.cfc:L70` and `:L72` both pass `tableName="SwBrand"` explicitly, and
 * `src/services/BrandService.ts` does keep that literal. But its probe adapter DISCARDS the argument
 * — `(_tableName, candidateUrlTitle) => this.brandRepository.isUrlTitleAvailable(candidateUrlTitle)`
 * — because `BrandRepository.isUrlTitleAvailable(urlTitle)` is the one-argument, brand-only view of
 * the question, with the table baked into its meaning. So no service-level double can see the token.
 * Rather than weaken the requirement, this file asserts it where it IS observable: at the utility
 * boundary, byte-exactly, through the shared table-scoped probe double — and the literal is
 * additionally COMPILE-CHECKED, because {@link BRAND_TABLE} is written with `satisfies
 * UrlTitleTableName`, a union the support file derives from the real `PhysicalTableName` whitelist
 * with `Extract`. A typo or a renamed table stops the file compiling; a drift in what the utility
 * forwards fails a case.
 *
 * MISMATCH 2 — `BaseService.save` RAISES WHERE THE LEGACY RETURNED.
 * `model/service/HibachiService.cfc:L103` is `return arguments.entity;` and it runs on EVERY path,
 * failed validation included, because a Hibachi entity carried its own error bag for the caller to
 * inspect. `src/services/BaseService.ts` instead ends with `if (errors.hasErrors()) { throw errors; }`
 * and documents why: not every ported entity carries a bag, `ProductService.saveProductType`
 * converts the raise back into entity-carried findings for its own legacy contract, and
 * "`BrandService.saveBrand` and the SKU save path rely on the raise". The `issue_1690_2` contract at
 * `meta/tests/unit/IssuesTest.cfc:L203-L206` is what makes this worth pinning: that test saves a
 * brand-new, definitely-invalid entity with NO `hasErrors()` guard beforehand — contrast `issue_1690`
 * at `:L192-L201`, which guards — so the behaviour under regression is that an invalid save FAILS
 * CLEANLY AND REPORTABLY rather than blowing up opaquely or, worse, persisting.
 * This file therefore asserts the substance of that contract against the landed mechanism: the
 * failure arrives as the accumulated `ValidationError` bag with its keys and message keys intact,
 * NOTHING is persisted, the caller's entity reference survives and is still the instance it handed
 * in, and no other error type is substituted. Both locators are cited at the case so a reviewer
 * meets the divergence rather than discovering it.
 *
 * =============================================================================================
 * WHAT THIS FILE DELIBERATELY DOES NOT COVER
 * =============================================================================================
 * `src/handlers/brandHandler.ts` IS NOT TESTED HERE, AND 17 CASES THAT USED TO BE HERE ARE GONE.
 * An earlier revision of this file carried the handler's authorisation-gate and response-projection
 * cases, on the stated grounds that "AAP §0.4.1.12 enumerates NO `test/handlers/` directory". That
 * premise has since been overtaken by landed code — `test/handlers/skuHandler.test.ts` exists — and
 * it was never sufficient for THIS file in any case: `src/handlers/brandHandler.ts` and
 * `src/ports/AccountContextPort.ts` are both outside this file's dependency whitelist, and its build
 * contract forbids importing a handler or any AWS surface here. The cases are therefore removed
 * rather than relocated, because this file's contract also states that no other file may be
 * authored. The consequence, stated rather than hidden: `src/handlers/brandHandler.ts` currently has
 * no test of its own; its correct home is `test/handlers/brandHandler.test.ts`, alongside the
 * sibling that already exists; and nothing in the suite fails as a result, because no coverage
 * threshold is configured (and this file adds none).
 *
 * ALSO ABSENT, EACH FOR A NAMED REASON:
 *   * No `Product`, `Sku`, `Option` or `OptionGroup` service behaviour. Those services have their
 *     own suites and none of their members is reachable from this one.
 *   * No `SettingResolverPort` usage. It is in this file's whitelist as a NEGATIVE reference: it is
 *     a synchronous, READ-ONLY resolver, and pressing it into service as the write-side settings
 *     seam would misrepresent both it and `BaseService`'s own `EntitySettingCleanupPort`. The
 *     cleanup collaborators the landed `BaseService` actually declares are used instead.
 *   * No `PhysicalService` and no `physicalCounts` member. See the inert-guard case: inventing
 *     either would make a dead legacy rule come alive.
 *   * No `BrandDAO`. None exists in the legacy repository — `BrandService` relied entirely on the
 *     synthesized CRUD surface (IR-1) — so the explicit `BrandRepository` port is the only
 *     persistence seam used anywhere below.
 *   * No mocking library, no `jest.mock`, no spies, no module registry games. The legacy repository
 *     vendors no mocking library at all (AAP §0.4.3.6); every double here is a plain object literal
 *     or a shared factory from `../support/inMemoryRepositories`.
 *   * No attempt budget, retry cap, timeout, backoff, latency assertion or capacity figure anywhere.
 *     `model/service/DataService.cfc:L64` loops `while(!unique)` with no ceiling, and inventing one
 *     — even only in a test's expectations — is what AAP §0.7.3 S9 forbids.
 */
import { BRAND_PROPERTY_DESCRIPTORS } from '../../src/domain/product/Brand';
import { BaseService } from '../../src/services/BaseService';
import { BrandService } from '../../src/services/BrandService';
import { DomainError } from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import { createUniqueURLTitle } from '../../src/util/urlTitle';
import {
  brandValidationRules,
  physicalCountsPropertyValidation,
  productsPropertyValidation,
} from '../../src/validation/rules/brand.rules';
import {
  buildProduct,
  createBaseServicePersistenceDouble,
  createInMemoryBrandRepository,
  createManagedBrand,
  createPopulationAuthorizationDouble,
  createUrlTitleAvailabilityDouble,
  createValidatorHarness,
} from '../support/inMemoryRepositories';

import type { BrandPropertyName } from '../../src/domain/product/Brand';
import type { BrandRepository } from '../../src/ports/repositories/BrandRepository';
import type { UniquePropertyPort } from '../../src/ports/UniquePropertyPort';
import type { BrandBaseService, ManagedBrand } from '../../src/services/BrandService';
import type { UniqueValueProbe } from '../../src/util/urlTitle';
import type { ValidationContext } from '../../src/validation/Validator';
import type {
  BaseServicePersistenceDouble,
  BrandRepositoryCall,
  InMemoryBrandRepository,
  PopulationAuthorizationDouble,
  UniquePropertyValueSeed,
  UrlTitleAvailabilityCall,
  UrlTitleAvailabilityDouble,
  UrlTitleTableName,
  ValidatorHarness,
} from '../support/inMemoryRepositories';

/* ================================================================================================
 * SHARED IMMUTABLE BINDINGS
 *
 * Two string primitives, both frozen by being primitives. Nothing else lives at module scope.
 * ============================================================================================== */

/**
 * The physical table the brand URL title must be unique on.
 *
 * `satisfies` rather than a plain annotation, deliberately: it keeps the value at its LITERAL type
 * — so the narrowing in {@link requireBrandTable} works — while still checking the literal against
 * `UrlTitleTableName`, which `../support/inMemoryRepositories` derives from the real
 * `PhysicalTableName` whitelist with `Extract`. Byte-exactness against
 * `model/service/BrandService.cfc:L70`/`:L72` (`tableName="SwBrand"`) and against `table="SwBrand"`
 * on `model/entity/Brand.cfc:L49` is therefore a COMPILE-TIME property of this file and not only an
 * assertion: a typo, a renamed table or a token invented out of thin air stops the build.
 */
const BRAND_TABLE = 'SwBrand' satisfies UrlTitleTableName;

/**
 * The legacy entity name every `Brand` uniqueness seed is keyed by — `entityname="SlatwallBrand"` at
 * `model/entity/Brand.cfc:L49`, which is what `Brand.getEntityName()` returns and therefore what
 * the entity-property uniqueness port compares against.
 */
const BRAND_ENTITY_NAME_FOR_SEEDS = 'SlatwallBrand';

/* ================================================================================================
 * HELPERS — every one of them a pure function or a per-call factory
 * ============================================================================================== */

/**
 * Narrows the table token the utility forwards, refusing anything that is not `SwBrand`.
 *
 * THIS IS THE BYTE-EXACT ASSERTION, EXPRESSED AS A TYPE NARROWING RATHER THAN A CAST.
 * `UniqueValueProbe` declares its first parameter as a plain `string`
 * (`src/util/urlTitle.ts`), because the utility serves three tables — `SwProduct`, `SwProductType`
 * and `SwBrand` — while the shared probe double accepts only the derived `UrlTitleTableName` union.
 * Bridging the two with a cast would silence exactly the drift worth catching, so the bridge is a
 * refusal instead: a token other than `SwBrand` reaching this adapter fails the case loudly, with
 * the offending value in the message.
 */
function requireBrandTable(tableName: string): UrlTitleTableName {
  if (tableName !== BRAND_TABLE) {
    throw new Error(
      `Expected the brand URL-title probe to receive the table token '${BRAND_TABLE}', ` +
        `as declared at model/service/BrandService.cfc:L70 and :L72, but it received ` +
        `'${tableName}'.`,
    );
  }

  return tableName;
}

/**
 * Adapts the shared table-scoped probe double to the utility's injected-collaborator shape.
 *
 * The polarity is NOT flipped here and must never be: `true` means the candidate is still
 * AVAILABLE, matching `model/dao/DataDAO.cfc:L126-L130`, which returns `false` when a row IS found
 * and `true` only when the record count is zero. That is what makes the `while(!unique)` loop at
 * `model/service/DataService.cfc:L64` terminate at all, and inverting it produces no compile error.
 */
function brandUrlTitleProbe(double: UrlTitleAvailabilityDouble): UniqueValueProbe {
  return (tableName: string, value: string): Promise<boolean> =>
    double.probe.isUrlTitleAvailable(requireBrandTable(tableName), value);
}

/** Seeds a list of already-held brand URL titles for the table-scoped probe double. */
function heldBrandTitles(values: readonly string[]): readonly UrlTitleAvailabilityCall[] {
  return values.map((value) => ({ tableName: BRAND_TABLE, value }));
}

/**
 * The candidate sequence the legacy algorithm probes for `base`, up to and including the `-count`
 * suffix.
 *
 * Derived from `model/service/DataService.cfc:L55` and `:L65-L66` rather than spelled out: the
 * counter starts at 1 and is PRE-incremented, so the sequence is the bare title followed by `-2`,
 * `-3`, … and `-1` is never a member for any input whatsoever.
 */
function candidateRun(base: string, suffixedCount: number): readonly string[] {
  const candidates: string[] = [base];

  for (let addon = 2; addon <= suffixedCount + 1; addon += 1) {
    candidates.push(`${base}-${String(addon)}`);
  }

  return candidates;
}

/** Every URL title the brand repository was asked to check, in order. */
function probedUrlTitles(calls: readonly BrandRepositoryCall[]): readonly string[] {
  return calls.flatMap((call) => (call.member === 'isUrlTitleAvailable' ? [call.urlTitle] : []));
}

/** Every brand handed to the repository's write member, in order and by reference. */
function persistedBrands(calls: readonly BrandRepositoryCall[]): readonly ManagedBrand[] {
  return calls.flatMap((call) => (call.member === 'saveBrand' ? [call.brand] : []));
}

/** Every brand handed to the repository's remove member, in order and by reference. */
function removedBrands(calls: readonly BrandRepositoryCall[]): readonly ManagedBrand[] {
  return calls.flatMap((call) => (call.member === 'deleteBrand' ? [call.brand] : []));
}

/** Every identifier the repository's read member was asked for, in order. */
function requestedBrandIDs(calls: readonly BrandRepositoryCall[]): readonly string[] {
  return calls.flatMap((call) => (call.member === 'getBrand' ? [call.brandID] : []));
}

/** How many times the repository's synchronous factory was invoked. */
function factoryCallCount(calls: readonly BrandRepositoryCall[]): number {
  return calls.filter((call) => call.member === 'newBrand').length;
}

/* ================================================================================================
 * HARNESS 1 — THE REAL GRAPH: real `Validator`, real `BaseService`, real ported rule set
 *
 * Used wherever the behaviour under test is the validation or persistence CONSEQUENCE of a save or a
 * delete. Nothing in this graph is faked except the four seams that would otherwise reach a database
 * or an excluded service, and every one of those comes from `../support/inMemoryRepositories`.
 * ============================================================================================== */

/** Per-case seed configuration for {@link createBrandHarness}. */
interface BrandHarnessOptions {
  /**
   * URL titles the TABLE-VALUE probe reports as taken — the seam behind
   * `model/dao/DataDAO.cfc:L115-L131`, reached by the slug loop.
   */
  readonly takenUrlTitles?: readonly string[];
  /**
   * Rows the ENTITY-PROPERTY uniqueness port reports as holding a value — the seam behind
   * `org/Hibachi/HibachiDAO.cfc:L130-L146`, reached by the `unique` constraint of
   * `model/validation/Brand.json:L5`.
   *
   * DELIBERATELY SEPARATE FROM {@link BrandHarnessOptions.takenUrlTitles}, AND THE TWO ARE NEVER
   * HARMONISED. They are different legacy members with different arguments, different self-exclusion
   * behaviour and different call sites, and one case below drives them to DISAGREE on purpose.
   */
  readonly uniqueValues?: readonly UniquePropertyValueSeed[];
  /** What `updateAllSettingValuesToRemoveSpecificID` reports, per `model/service/HibachiService.cfc:L95`. */
  readonly settingValuesUpdated?: number;
  /** Brands already stored, so a read or a delete has something to find. */
  readonly storedBrands?: readonly ManagedBrand[];
}

/** The service under test plus every observation point the real graph offers. */
interface BrandHarness {
  readonly service: BrandService;
  readonly brands: InMemoryBrandRepository;
  readonly persistence: BaseServicePersistenceDouble<ManagedBrand>;
  readonly authorization: PopulationAuthorizationDouble;
  readonly validation: ValidatorHarness;
  /** Exposed so the two-argument positional delegation of `:L76` can be exercised directly. */
  readonly baseService: BaseService<ManagedBrand, BrandPropertyName>;
}

/**
 * Wire a `BrandService` over the real validation and base-service machinery.
 *
 * WHY A REAL `BaseService` AND A REAL `Validator` RATHER THAN DOUBLES OF EITHER. The behaviour this
 * file has to pin includes which saves are refused and which deletes are blocked, and those verdicts
 * are produced by the ported rule set in `src/validation/rules/brand.rules.ts` evaluated by
 * `src/validation/Validator.ts`. A doubled validator would assert the double.
 *
 * THE FOUR SUBSTITUTED SEAMS, AND WHY EACH IS THE MINIMUM THE REAL CONSTRUCTOR DEMANDS:
 *   * `persist` is the brand repository's OWN write member, referenced directly rather than wrapped,
 *     so a persisted brand is visible in the same call log as every other repository interaction.
 *     Safe to reference unbound because the in-memory repository declares its members as arrow
 *     properties closing over factory-local state.
 *   * `remove` HAS to be a thin adapter, and the reason is a genuine signature difference rather
 *     than convenience: `EntityRemover<TEntity>` resolves `void`, while
 *     `BrandRepository.deleteBrand` resolves a `boolean` reporting whether the row was there. A
 *     composition root faces the identical adapter, and routing it to the repository is what makes
 *     "the repository delete happened" observable at all.
 *   * `settingCleanup` and `commentCleanup` are REQUIRED members of `BaseServiceCollaborators`, so a
 *     `BaseService` cannot be constructed without them. They stand for
 *     `getService("settingService")` and `getService("commentService")` at
 *     `model/service/HibachiService.cfc:L76`, `:L79` and `:L95`-`:L99`, both of which belong to the
 *     excluded `Setting*` and `Content*` families. The shared double is an inert recorder: it invents
 *     no cache-invalidation hook, no settings mutator beyond the port's own three members, and no
 *     write path through the read-only `SettingResolverPort`.
 *
 * ⚠️ WHERE WRITES ARE OBSERVED, AND WHY THERE IS EXACTLY ONE PLACE. Because `persist` and `remove`
 * both route to the brand repository, the repository's own call log is the SINGLE record of every
 * write — {@link persistedBrands} and {@link removedBrands} read it, and `brands.brands` shows the
 * resulting store. The shared persistence double's `persisted` and `removed` arrays therefore stay
 * empty by construction under this wiring, so asserting them would be vacuous: it would pass whether
 * or not a write had happened. No case in this file asserts them, deliberately. What the double IS
 * consulted for is the part only it records — the two cleanup logs, the setting-value scrubs and the
 * settings-cache clear count.
 *
 * Every optional field is applied by conditional spread rather than by passing `undefined`, because
 * `exactOptionalPropertyTypes` makes an explicitly-undefined optional member a different type from an
 * absent one — and for `takenUrlTitles` versus `urlTitleAvailability` that distinction selects a
 * different code path inside the double.
 */
function createBrandHarness(options: BrandHarnessOptions = {}): BrandHarness {
  const brands = createInMemoryBrandRepository({
    ...(options.takenUrlTitles === undefined ? {} : { takenUrlTitles: options.takenUrlTitles }),
    ...(options.storedBrands === undefined ? {} : { brands: options.storedBrands }),
  });
  const validation = createValidatorHarness(options.uniqueValues ?? []);
  const authorization = createPopulationAuthorizationDouble();
  const persistence = createBaseServicePersistenceDouble<ManagedBrand>(
    options.settingValuesUpdated === undefined
      ? {}
      : { settingValuesUpdated: options.settingValuesUpdated },
  );

  const baseService = new BaseService<ManagedBrand, BrandPropertyName>({
    validator: validation.validator,
    ruleSet: brandValidationRules,
    propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
    populationAuthorization: authorization.populationAuthorization,
    persist: brands.repository.saveBrand,
    remove: async (brand: ManagedBrand): Promise<void> => {
      await brands.repository.deleteBrand(brand);
    },
    settingCleanup: persistence.seams.settingCleanup,
    commentCleanup: persistence.seams.commentCleanup,
  });

  return {
    authorization,
    baseService,
    brands,
    persistence,
    service: new BrandService(brands.repository, baseService),
    validation,
  };
}

/* ================================================================================================
 * HARNESS 2 — PURE DELEGATION: a recording `BrandBaseService`, no validation at all
 *
 * Used wherever the behaviour under test is what `saveBrand` HANDS ON — the guard branches, the
 * name-source preference, the by-reference payload mutation, the positional argument order. Mixing
 * validation into those cases would make a refused save indistinguishable from a skipped derivation.
 * ============================================================================================== */

/** One recorded delegation, capturing the arguments exactly as they arrived. */
interface RecordedSave {
  readonly brand: ManagedBrand;
  /** Captured BY REFERENCE, so the identity of the caller's payload object is assertable. */
  readonly data: Record<string, unknown> | undefined;
  /** `undefined` here means the argument was OMITTED, which is what `:L76` does. */
  readonly context: ValidationContext | undefined;
}

/** Seed configuration for {@link createDelegationHarness}. */
interface DelegationHarnessOptions {
  readonly takenUrlTitles?: readonly string[];
  /** What the recording base collaborator reports for a delete. Defaults to `true`. */
  readonly deleteVerdict?: boolean;
}

/** The service under test plus the delegation log. */
interface DelegationHarness {
  readonly service: BrandService;
  readonly brands: InMemoryBrandRepository;
  readonly saves: readonly RecordedSave[];
  readonly deletes: readonly ManagedBrand[];
}

/**
 * Wire a `BrandService` over a recording base collaborator.
 *
 * The double is a plain object literal satisfying the service's own exported `BrandBaseService`
 * interface — no mocking library, no spy, no partial cast. That is possible only because the landed
 * interface is a narrow two-member view written as ARROW-TYPED properties, which is also what makes
 * its parameters checked contravariantly: a double declared over a bare `Brand` would be REJECTED
 * here rather than silently admitted.
 *
 * `save` resolves the brand it was handed, mirroring `model/service/HibachiService.cfc:L103` — the
 * legacy override returns `arguments.entity` on every path — so a case asserting the returned value
 * is asserting pass-through and nothing else.
 */
function createDelegationHarness(options: DelegationHarnessOptions = {}): DelegationHarness {
  const brands = createInMemoryBrandRepository(
    options.takenUrlTitles === undefined ? {} : { takenUrlTitles: options.takenUrlTitles },
  );
  const saves: RecordedSave[] = [];
  const deletes: ManagedBrand[] = [];
  const deleteVerdict = options.deleteVerdict ?? true;

  const baseService: BrandBaseService = {
    save: (
      brand: ManagedBrand,
      data?: Record<string, unknown>,
      context?: ValidationContext,
    ): Promise<ManagedBrand> => {
      saves.push(Object.freeze({ brand, context, data }));
      return Promise.resolve(brand);
    },
    delete: (brand: ManagedBrand): Promise<boolean> => {
      deletes.push(brand);
      return Promise.resolve(deleteVerdict);
    },
  };

  return {
    brands,
    deletes,
    saves,
    service: new BrandService(brands.repository, baseService),
  };
}

/* ================================================================================================
 * GROUP A — `createUniqueURLTitle`, THE PORTED ALGORITHM OF `model/service/DataService.cfc:L53-L71`
 *
 * WHY THE UTILITY'S CASES LIVE IN THIS SERVICE'S FILE. AAP §0.4.1.12 enumerates no
 * `test/util/urlTitle.test.ts`, and this file's contract assigns the algorithm here explicitly. It is
 * also the right home on the merits: `BrandService.createUniqueBrandUrlTitle` is the utility's only
 * production caller in the whole subtree, and `BrandService` is where the uniqueness probe is
 * supplied, so the wiring contract between service, repository and utility belongs to this file.
 * The algorithm is consequently covered twice on purpose — directly, where the probe sequence is
 * cleanest to observe, and through `saveBrand` in Group B, which proves the probe actually reaches it
 * and that the derived title lands where the legacy put it.
 * ============================================================================================== */

describe('createUniqueURLTitle — the slug pipeline, in the legacy order', () => {
  /**
   * Slug `input` against a probe that reports everything free, so only the transformation is under
   * test. A fresh double per call: no probe state is shared between assertions.
   */
  async function slug(input: string): Promise<string> {
    const probe = createUrlTitleAvailabilityDouble();
    return createUniqueURLTitle(input, BRAND_TABLE, brandUrlTitleProbe(probe));
  }

  it('NET-NEW — model/service/DataService.cfc:L57-L58 — trims, lowercases, strips, THEN collapses spaces', async () => {
    /*
     * `:L57` nests the calls as `reReplace(lcase(trim(titleString)), "[^a-z0-9 \-]", "", "all")`, so
     * the trim is innermost and runs FIRST, then the case fold, then the strip. Only afterwards does
     * `:L58` collapse `[ ]+` to a single hyphen. All four steps are visible in this one input:
     * surrounding whitespace disappears, the capitals fold, the underscore and the exclamation mark
     * are discarded, and the interior space run becomes ONE hyphen.
     */
    await expect(slug('  My_Great Brand!  ')).resolves.toBe('mygreat-brand');
  });

  it('NET-NEW — model/service/DataService.cfc:L57-L58 — "A & B" becomes "a-b" because the ampersand goes before the collapse', async () => {
    /*
     * THE ORDER IS OBSERVABLE HERE AND NOWHERE ELSE AS SHARPLY. Stripping `&` first leaves `'a  b'`
     * — TWO spaces, the ampersand's former neighbours — and the single `[ ]+` run then collapses to
     * ONE hyphen. Collapsing first would instead give `'a-&-b'` and then `'a--b'`: a different URL
     * title, from the same input, with no error anywhere. That is why the sequence is reproduced
     * rather than tidied.
     */
    await expect(slug('A & B')).resolves.toBe('a-b');
  });

  it('NET-NEW — model/service/DataService.cfc:L58 — "a - b" becomes "a---b": only SPACES collapse, never hyphens', async () => {
    /*
     * The collapse class at `:L58` is exactly `[ ]+` — a single-space class. The hyphen is a member
     * of the RETAINED set at `:L57` (`[^a-z0-9 \-]` keeps it), so an existing hyphen survives
     * untouched and each flanking single-space run contributes one more. THREE hyphens: one for the
     * leading space run, the original, one for the trailing space run.
     *
     * Using `\s+` here instead of `[ ]+`, or folding hyphen runs down to one, would each change
     * observable output. Both are the kind of well-intentioned tidy-up AAP §0.8.2 Guideline 4
     * forbids.
     */
    await expect(slug('a - b')).resolves.toBe('a---b');
  });

  it('NET-NEW — model/service/DataService.cfc:L57-L58 — a hyphen RUN survives and gains one per flanking space run', async () => {
    // FOUR hyphens: the two already present plus one for each of the two collapsed space runs.
    await expect(slug('A -- B')).resolves.toBe('a----b');
  });

  it('NET-NEW — model/service/DataService.cfc:L57 — the trim runs BEFORE the strip, so a discarded edge character leaves its space behind', async () => {
    /*
     * `trim` removes whitespace from the ORIGINAL string; the strip then discards `!` and leaves the
     * space that was next to it, which collapses into a leading or trailing hyphen. The result is
     * neither re-trimmed nor stripped of edge hyphens, because the legacy does neither.
     */
    await expect(slug('! Foo')).resolves.toBe('-foo');
    await expect(slug('Foo !')).resolves.toBe('foo-');
  });

  it('NET-NEW — model/service/DataService.cfc:L57 — digits and existing hyphens pass through, and non-ASCII letters do not', async () => {
    /*
     * The retained class is exactly `[a-z0-9 \-]` AFTER the lowercase fold, and `reReplace` carries
     * no `i` flag — `reReplaceNoCase` is not what `:L57` calls. So accented and non-Latin letters are
     * DISCARDED rather than transliterated: no Unicode normalisation, no `é` to `e` mapping, nothing
     * the legacy did not do.
     */
    await expect(slug('Brand-99 Series 2')).resolves.toBe('brand-99-series-2');
    /*
     * `é` and `ω` are discarded outright. The interior space then survives the strip and collapses to
     * a TRAILING hyphen, because the strip ran after the trim and the legacy never re-trims — the same
     * mechanism as the `'Foo !'` case above, reached here through a different class of character.
     */
    await expect(slug('Café Ω')).resolves.toBe('caf-');
  });

  it('NET-NEW — model/service/DataService.cfc:L70 — an all-discarded title slugs to the EMPTY string and is returned as-is', async () => {
    /*
     * No error is raised, no placeholder is substituted and no identifier is generated in its place.
     * `urlTitle` being `required` at `model/validation/Brand.json:L5` means VALIDATION is what reports
     * the consequence — see the isolation case in Group C, which drives exactly this input through
     * the real rule set.
     */
    await expect(slug('!!!')).resolves.toBe('');
    await expect(slug('')).resolves.toBe('');
  });
});

describe('createUniqueURLTitle — the collision suffix sequence', () => {
  it('NET-NEW — model/service/DataService.cfc:L62 — no collision means ONE probe and NO suffix', async () => {
    const probe = createUrlTitleAvailabilityDouble();

    await expect(
      createUniqueURLTitle('My Brand', BRAND_TABLE, brandUrlTitleProbe(probe)),
    ).resolves.toBe('my-brand');

    /*
     * `:L62` probes ONCE before the loop and `:L64` then finds `unique` already true, so the bare
     * candidate comes back unsuffixed. This is why the algorithm is not a `do…while`.
     */
    expect(probe.calls.map((call) => call.value)).toEqual(['my-brand']);
  });

  it('NET-NEW — model/service/DataService.cfc:L55,L65-L66 — the FIRST collision suffix is -2, and -1 is never proposed', async () => {
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['my-brand']));

    await expect(
      createUniqueURLTitle('My Brand', BRAND_TABLE, brandUrlTitleProbe(probe)),
    ).resolves.toBe('my-brand-2');

    /*
     * `var addon = 1` at `:L55`, then `addon++` at `:L65` runs BEFORE the suffix is interpolated at
     * `:L66`. The counter is therefore PRE-incremented and `-1` is unreachable for every possible
     * input. This is observable output, not an off-by-one awaiting repair: initialising to 2,
     * post-incrementing, or starting at 0 would each change the titles the system produces.
     */
    expect(probe.calls.map((call) => call.value)).toEqual(['my-brand', 'my-brand-2']);
    expect(probe.calls.map((call) => call.value)).not.toContain('my-brand-1');
  });

  it('NET-NEW — model/service/DataService.cfc:L64-L67 — the second collision gives -3, and the run has no gaps', async () => {
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['my-brand', 'my-brand-2']));

    await expect(
      createUniqueURLTitle('My Brand', BRAND_TABLE, brandUrlTitleProbe(probe)),
    ).resolves.toBe('my-brand-3');

    expect(probe.calls.map((call) => call.value)).toEqual(candidateRun('my-brand', 2));
  });

  it('NET-NEW — model/service/DataService.cfc:L64-L67 — probe count and suffix stay in lockstep: N collisions cost N+1 probes and yield suffix N+1', async () => {
    /*
     * The invariant across the whole loop, checked at four widths rather than one so an off-by-one in
     * either direction — a probe skipped, a suffix advanced twice — cannot hide behind a single
     * sample. `0` is the no-collision boundary: no titles held, ONE probe, NO suffix.
     */
    for (const collisions of [0, 1, 2, 7]) {
      const held = candidateRun('x', collisions).slice(0, collisions);
      const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(held));

      const resolved = await createUniqueURLTitle('X', BRAND_TABLE, brandUrlTitleProbe(probe));

      expect(held).toHaveLength(collisions);
      expect(probe.calls).toHaveLength(collisions + 1);
      expect(resolved).toBe(collisions === 0 ? 'x' : `x-${String(collisions + 1)}`);
    }
  });

  it('NET-NEW — model/dao/DataDAO.cfc:L126-L130 — the probe polarity is true=available, false=collision', async () => {
    /*
     * THE HIGHEST-RISK SEMANTIC IN THE WHOLE DERIVATION, AND IT IS SILENT WHEN WRONG. `:L126-L127`
     * returns `false` when the record count is non-zero — the value IS taken — and `:L130` returns
     * `true` only when nothing holds it. Inverting the two produces no compile error and no type
     * error; it produces either duplicate `urlTitle` values reaching a `unique="true"` column, or a
     * loop that never terminates.
     *
     * Asserted from both sides with one seeded title, which is the smallest input that distinguishes
     * the two readings: the taken candidate is refused and skipped, the free one is accepted and
     * returned.
     */
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['taken']));

    await expect(probe.probe.isUrlTitleAvailable(BRAND_TABLE, 'taken')).resolves.toBe(false);
    await expect(probe.probe.isUrlTitleAvailable(BRAND_TABLE, 'free')).resolves.toBe(true);
    await expect(
      createUniqueURLTitle('Taken', BRAND_TABLE, brandUrlTitleProbe(probe)),
    ).resolves.toBe('taken-2');
  });

  it('NET-NEW — model/service/BrandService.cfc:L70,L72 — the probe receives the byte-exact table token SwBrand', async () => {
    /*
     * `tableName="SwBrand"` is passed explicitly at BOTH legacy call sites, and it matches
     * `table="SwBrand"` on `model/entity/Brand.cfc:L49`. Two independent mechanisms pin it here:
     * {@link BRAND_TABLE} is written with `satisfies UrlTitleTableName`, so the literal is checked at
     * COMPILE time against the union the support file derives from the real `PhysicalTableName`
     * whitelist; and {@link requireBrandTable} REFUSES any other token at run time, so a drift in
     * what the utility forwards fails loudly rather than passing quietly.
     *
     * ⚠ WHERE THIS ASSERTION CANNOT BE MADE, STATED RATHER THAN IMPLIED. It is made at the UTILITY
     * boundary because the landed service cannot expose it: `BrandService.createUniqueBrandUrlTitle`
     * adapts the utility's two-argument probe to `BrandRepository.isUrlTitleAvailable(urlTitle)`, the
     * one-argument brand-only view whose table is baked into its meaning, and DISCARDS the token in
     * the process. No service-level double can see it. The mismatch against this file's contract —
     * which asks for the token to be asserted — is therefore exposed here rather than papered over,
     * and the requirement is met at the only boundary where the token still exists.
     */
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['acme']));

    await createUniqueURLTitle('ACME', BRAND_TABLE, brandUrlTitleProbe(probe));

    expect(probe.calls).toEqual([
      { tableName: 'SwBrand', value: 'acme' },
      { tableName: 'SwBrand', value: 'acme-2' },
    ]);
    for (const call of probe.calls) {
      expect(call.tableName).toBe('SwBrand');
    }
  });

  it('NET-NEW — model/service/DataService.cfc:L64 — the loop is UNBOUNDED: one round trip per iteration, no ceiling, no fabricated fallback', async () => {
    /*
     * TODO(parity) `model/service/DataService.cfc:L64` — `while(!unique)` carries NO ceiling, so a
     * value that keeps colliding keeps issuing probes indefinitely. The exposure is real and it is
     * CARRIED OVER rather than repaired: AAP §0.8.2 Guideline 4 forbids enhancing business logic
     * beyond what the migration requires, and IR-9 admits exactly one hardening exception — D18, the
     * importer's SQL parameterisation — which is not this. An earlier revision of the utility added
     * an attempt budget with a deterministic raise and it was withdrawn.
     *
     * WHAT THIS CASE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. It asserts the two observable facts:
     * exactly ONE probe per iteration, and termination only when the probe reports a free value. A
     * finite seeded run of 500 collisions stands in for the unbounded one — an endless loop cannot be
     * asserted on — and it is two orders of magnitude past any plausible ceiling, so a reinstated
     * bound short of 501 fails here.
     *
     * NO retry limit, latency assertion, backoff, capacity figure or timeout appears in this case or
     * anywhere in this file. Asserting a bound would invent the very number AAP §0.7.3 S9 forbids,
     * and would make the test the specification for a safeguard the legacy does not have.
     */
    const collisions = 500;
    const probe = createUrlTitleAvailabilityDouble(
      heldBrandTitles(candidateRun('my-brand', collisions - 1)),
    );

    await expect(
      createUniqueURLTitle('My Brand', BRAND_TABLE, brandUrlTitleProbe(probe)),
    ).resolves.toBe('my-brand-501');

    // 501 round trips: the bare candidate plus `-2` through `-501`. One per iteration, no batching.
    expect(probe.calls).toHaveLength(collisions + 1);
    expect(probe.calls.map((call) => call.value)).toEqual(candidateRun('my-brand', collisions));
  });

  it('NET-NEW — model/service/DataService.cfc:L60,L66 — the suffix is appended to the SLUG, not to the raw title, and the empty slug is no exception', async () => {
    /*
     * `:L60` captures `returnTitle = urlTitle` — the ALREADY-SLUGGED value — and `:L66` interpolates
     * `"#urlTitle#-#addon#"` from that same slugged base, never from `arguments.titleString`. So a
     * collision re-suffixes the slug and cannot smuggle stripped characters back in.
     *
     * The empty slug follows the identical path with no special case anywhere: a held `''` yields
     * `'-2'`. That is a derivation of the algorithm as written, recorded so a future reader does not
     * mistake the absence of an empty-string guard for an oversight. There is no failure branch here
     * on which a UUID-suffixed fallback or a placeholder title could be substituted, and none is
     * invented.
     */
    const slugged = createUrlTitleAvailabilityDouble(heldBrandTitles(['my-brand']));
    await expect(
      createUniqueURLTitle('  My Brand!  ', BRAND_TABLE, brandUrlTitleProbe(slugged)),
    ).resolves.toBe('my-brand-2');
    // The suffix hangs off `my-brand`, so the discarded `!` and the trimmed padding cannot reappear.
    expect(slugged.calls.map((call) => call.value)).toEqual(['my-brand', 'my-brand-2']);

    const empty = createUrlTitleAvailabilityDouble(heldBrandTitles(['']));
    await expect(createUniqueURLTitle('!!!', BRAND_TABLE, brandUrlTitleProbe(empty))).resolves.toBe(
      '-2',
    );
  });
});

/* ================================================================================================
 * GROUP B — `saveBrand`, THE DERIVATION GUARD AND THE DELEGATION
 * `model/service/BrandService.cfc:L67-L77`
 *
 * These cases run over the RECORDING base collaborator, not the real one. The behaviour under test is
 * what `saveBrand` decides and what it hands on — which branch of `:L68-L74` it takes, which name
 * source it picks, what it writes onto the payload, and in what order it passes its two arguments.
 * Introducing validation here would confuse a skipped derivation with a refused save, so validation
 * gets its own group.
 * ============================================================================================== */

describe('saveBrand — the L68 derivation guard', () => {
  it('NET-NEW — model/service/BrandService.cfc:L68-L72 — derives a title when the entity has none AND the payload supplies none', async () => {
    /*
     * The both-missing case, which is the only one that derives. A fresh `Brand` leaves `urlTitle`
     * `undefined` — `src/domain/product/Brand.ts` declares it optional, standing in for the legacy
     * `isNull(getURLTitle())` — and the payload carries only a name.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — an entity that ALREADY has a title short-circuits the guard: no probe, value untouched', async () => {
    /*
     * `isNull(getURLTitle()) || !len(getURLTitle())` is the FIRST half of the `and`, so a non-empty
     * entity title alone suppresses the derivation. The pre-existing value is not re-slugged, not
     * re-checked for uniqueness and not copied into the payload — the legacy touches none of those.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets', urlTitle: 'legacy-slug' });
    const data: Record<string, unknown> = { brandName: 'Something Else Entirely' };

    await harness.service.saveBrand(brand, data);

    expect(brand.urlTitle).toBe('legacy-slug');
    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — a payload that SUPPLIES a title short-circuits the guard, and the supplied value survives verbatim', async () => {
    /*
     * `!structKeyExists(arguments.data, "urlTitle") || !len(arguments.data.urlTitle)` is the second
     * half. An incoming title is passed through EXACTLY as given — not slugged, not lowercased, not
     * uniqued — because the legacy only ever writes `data.urlTitle` inside the guard it has already
     * skipped. The value below is deliberately one the slug pipeline would mangle, so a stray
     * re-derivation could not pass this case.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets' });
    const data: Record<string, unknown> = { brandName: 'ACME Widgets', urlTitle: 'Caller_Chosen!' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('Caller_Chosen!');
    expect(harness.brands.calls).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — both halves supplied is still a short-circuit, and neither value moves', async () => {
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets', urlTitle: 'entity-slug' });
    const data: Record<string, unknown> = { urlTitle: 'payload-slug' };

    await harness.service.saveBrand(brand, data);

    // Neither side wins, because the legacy never reconciles them: each stays where it was.
    expect(brand.urlTitle).toBe('entity-slug');
    expect(data.urlTitle).toBe('payload-slug');
    expect(harness.brands.calls).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — EMPTY counts as missing on both halves, so an empty pair still derives', async () => {
    /*
     * `len()` is the operative test on both halves, not `structKeyExists` alone and not a null check
     * alone. An entity title of `''` and a PRESENT payload key whose value is `''` are therefore both
     * "missing", and the derivation runs. This is the case a `!== undefined` or a bare
     * `structKeyExists` translation would get wrong, silently, by skipping the derivation and leaving
     * an empty `urlTitle` to fail `model/validation/Brand.json:L5` instead.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets', urlTitle: '' });
    const data: Record<string, unknown> = { urlTitle: '' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — a whitespace-only title is NOT empty, so it short-circuits', async () => {
    /*
     * `len(" ")` is 1. CFML's `len` does not trim, and neither does the port — the trim in the slug
     * pipeline belongs to `model/service/DataService.cfc:L57` and runs only once a derivation has
     * already been decided upon. So a single space suppresses the derivation and is handed on as-is.
     * Adding a trim to this guard would be a repair, not a translation.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets' });
    const data: Record<string, unknown> = { urlTitle: ' ' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe(' ');
    expect(harness.brands.calls).toEqual([]);
  });
});

describe('saveBrand — which name source the derivation reads', () => {
  it('NET-NEW — model/service/BrandService.cfc:L69-L72 — the PAYLOAD name wins when both sources are present', async () => {
    /*
     * `:L69` tests the payload first and `:L71` is its `else if`, so the entity's own name is read
     * only when the payload has nothing usable. Both sources are populated here with DIFFERENT
     * values, which is the only arrangement that distinguishes the two arms.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: 'Payload Name' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('payload-name');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['payload-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L71-L72 — an ABSENT payload name falls through to the entity name', async () => {
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = {};

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('entity-name');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69,L71 — an EMPTY payload name also falls through, because :L69 tests len() and not just existence', async () => {
    /*
     * `structKeyExists(arguments.data, "brandName") && len(arguments.data.brandName)` — the key is
     * present, its length is zero, so the `and` fails and control reaches the `else if`. A
     * key-existence-only translation would enter the first arm, hand `''` to the slug pipeline and
     * derive `''`, which is a different stored value.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: '' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('entity-name');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L73 — with BOTH name sources unusable, NO urlTitle key is added at all', async () => {
    /*
     * THE FALL-THROUGH THE `if` / `else if` PAIR LEAVES OPEN, AND IT IS NOT AN ERROR PATH. `:L73`
     * closes the inner `else if` with no trailing `else`, so when the payload name is empty and the
     * entity name is null or empty, the guard body simply does nothing. No key is written, no probe is
     * issued and no exception is raised HERE — the consequence surfaces one layer up, in validation,
     * because `model/validation/Brand.json:L5` marks `urlTitle` required. Group C drives that
     * consequence through the real rule set.
     *
     * Asserted with `not.toHaveProperty` rather than a value comparison, because "absent" and
     * "present but undefined" are different payloads once the base collaborator populates from them.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: '' };

    await harness.service.saveBrand(brand, data);

    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);
    // Still delegated: `:L76` is outside the guard and runs on every path.
    expect(harness.saves).toHaveLength(1);
  });

  it('NET-NEW — model/service/BrandService.cfc:L70 — the collision suffix reaches the payload, so the derivation is the real loop and not a one-shot slug', async () => {
    /*
     * `takenUrlTitles` seeds the REPOSITORY's availability answer, so this case also proves the probe
     * the service constructs is wired to `BrandRepository.isUrlTitleAvailable` and not to some
     * always-free default. Two round trips, `-2` on the payload.
     */
    const harness = createDelegationHarness({ takenUrlTitles: ['acme-widgets'] });
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('acme-widgets-2');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets', 'acme-widgets-2']);
  });
});

describe('saveBrand — how a NON-STRING payload value is read, which is where CFML len() diverges', () => {
  /*
   * WHY THIS BLOCK EXISTS AT ALL. `model/service/BrandService.cfc:L68` and `:L69` both test payload
   * entries with CFML's `len()`, and CFML's payload struct is untyped: a form or API post can put a
   * number, a boolean, a date, an array or a struct under `brandName` or `urlTitle`. The landed port
   * reproduces `len()` over each of those shapes rather than assuming a string, so every shape is a
   * real branch of the two guards and each gets a case.
   *
   * ⚠️ AND ONE OF THOSE SHAPES IS AN ENGINE DIVERGENCE, FLAGGED RATHER THAN RESOLVED. `len()` of a
   * COMPLEX value is precisely where the two engines this application supports disagree: `readme.md:L6`
   * names ColdFusion 9.0.1+ and `:L8` names Railo 4.1+, the Railo/Lucee lineage accepts an array or
   * struct and returns a count while the ACF lineage refuses. `src/services/BrandService.ts` records
   * that neither is "the" legacy behaviour and declines to pick an engine on the port's own authority
   * (AAP §0.8.3.6, §0.7.3's invent-nothing standard). The cases below therefore pin what the port DOES
   * — count the members — and say so, rather than asserting a raise the source does not state.
   */

  it('NET-NEW — model/service/BrandService.cfc:L69-L70 — a NUMERIC payload name is rendered as CFML would render it into a string parameter', async () => {
    /*
     * `len(12345)` is 5 in CFML, because the number is rendered to a string first; the same value then
     * reaches `createUniqueURLTitle`'s `required string titleString` parameter at
     * `model/service/DataService.cfc:L53` through the identical coercion. Digits survive the strip, so
     * the slug is the digits themselves.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: 12345 };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('12345');
    // The payload arm was taken, so the entity's own name was never consulted.
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['12345']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69-L70 — a BOOLEAN payload name is rendered too, and its rendered length is what the guard measures', async () => {
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: true };

    await harness.service.saveBrand(brand, data);

    // `len(true)` is 4 — the length of the rendering, not of a cast to `1`.
    expect(data.urlTitle).toBe('true');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['true']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L70 — TODO(parity): a DATE payload name renders through toISOString(), not through a CFML date mask', async () => {
    /*
     * TODO(parity) — `src/services/BrandService.ts` carries this one as a flagged annotation and it is
     * asserted here in the same spirit. CFML would render a date-valued payload entry with the
     * ENGINE'S own date-time mask; the port renders it with `toISOString()`. The two differ in FORMAT
     * for this single pathological input, no in-scope caller supplies one, and choosing a mask would
     * mean inventing a format the source never states (AAP §0.7.3 S9).
     *
     * The case pins what the port DOES so a future change of rendering is visible, and says plainly
     * that the value below is NOT a claim about what CFML would have produced.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: new Date('2024-01-15T00:00:00.000Z') };

    await harness.service.saveBrand(brand, data);

    // '2024-01-15T00:00:00.000Z' lowercased, with ':' and '.' stripped and no space run to collapse.
    expect(data.urlTitle).toBe('2024-01-15t000000000z');
  });

  it('NET-NEW — model/service/BrandService.cfc:L69-L73 — a NON-SIMPLE payload name with a non-zero len() enters the FIRST arm and the :L71 else-if is never reached', async () => {
    /*
     * ⭐ THE SUBTLEST BRANCH IN THE MEMBER, AND THE REASON THE LANDED CODE NESTS ITS SECOND CHECK
     * INSTEAD OF FOLDING IT INTO THE FIRST CONDITION.
     *
     * An array of two members has `len()` 2 under the Railo/Lucee reading, so `:L69` SUCCEEDS and
     * control enters the first arm. But that value cannot be coerced into the `required string
     * titleString` parameter, so no title is derived. The `else if` at `:L71` belongs to an `if` that
     * was already taken, so the entity's own perfectly usable `brandName` is NEVER consulted — and the
     * save proceeds with no `urlTitle` at all.
     *
     * Folding the coercion check into `:L69`'s condition would look equivalent and is not: control
     * would fall through to `:L71` and the entity name WOULD be used, producing a stored `urlTitle`
     * where the legacy stores none. That is a silent behavioural change from a tidier-looking
     * translation, which is exactly the class of drift AAP §0.8.2 guideline 2 forbids.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: ['first', 'second'] };

    await harness.service.saveBrand(brand, data);

    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);
    // The entity name was usable and was still not used — that is the whole point of the case.
    expect(brand.brandName).toBe('Entity Name');
    expect(brand.urlTitle).toBeUndefined();
    // Delegation still happens, because `:L76` sits outside the guard.
    expect(harness.saves).toHaveLength(1);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69,L71 — an EMPTY non-simple payload name has len() zero, so control DOES reach the entity name', async () => {
    /*
     * The other side of the same measurement: an empty array and an empty struct both count zero
     * members, `:L69` fails, and the `else if` at `:L71` runs normally. Together with the previous case
     * this pins that the guard measures the COUNT rather than merely testing complexity.
     */
    const emptyArray = createDelegationHarness();
    const arrayBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    await emptyArray.service.saveBrand(arrayBrand, { brandName: [] });
    expect(probedUrlTitles(emptyArray.brands.calls)).toEqual(['entity-name']);

    const emptyStruct = createDelegationHarness();
    const structBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    await emptyStruct.service.saveBrand(structBrand, { brandName: {} });
    expect(probedUrlTitles(emptyStruct.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69 — a NULL or explicitly-undefined payload name measures zero, and control reaches the entity name', async () => {
    /*
     * `null` is deliberately distinguished from an object here: it is the CFML null-equivalent, so it
     * measures zero rather than counting keys, and a key that is present with an undefined value
     * measures zero as well — matching `structKeyExists` being true while `len()` is not.
     */
    const nullName = createDelegationHarness();
    const nullBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    await nullName.service.saveBrand(nullBrand, { brandName: null });
    expect(probedUrlTitles(nullName.brands.calls)).toEqual(['entity-name']);

    const undefinedName = createDelegationHarness();
    const undefinedBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    const presentButUndefined: Record<string, unknown> = { brandName: undefined };
    expect(Object.prototype.hasOwnProperty.call(presentButUndefined, 'brandName')).toBe(true);
    await undefinedName.service.saveBrand(undefinedBrand, presentButUndefined);
    expect(probedUrlTitles(undefinedName.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — a NON-STRING payload urlTitle with a non-zero len() short-circuits the guard and is handed on untouched', async () => {
    /*
     * The same measurement applied to the OTHER half of `:L68`. `len(42)` is 2, so the payload counts
     * as supplying a title, no derivation runs, and the numeric value is passed to `super.save()`
     * exactly as received — population, not this member, decides what to do with it.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: 'Entity Name', urlTitle: 42 };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe(42);
    expect(harness.brands.calls).toEqual([]);
    expect(harness.saves[0]?.data).toBe(data);
  });
});

describe('saveBrand — the by-reference payload write and the delegation at L76', () => {
  it('NET-NEW — model/service/BrandService.cfc:L70,L72 — the derived title is written onto the SAME payload object the caller passed', async () => {
    /*
     * G6 — `data.urlTitle = …` at `:L70` and `:L72` is UNSCOPED CFML. It resolves through the scope
     * search order to `arguments.data`, because a local named `data` was never `var`-declared in this
     * function, so the assignment mutates the CALLER'S struct rather than a local copy. It is easy to
     * read as a local write and it is not one: the caller observes the derived title after the call
     * returns, and `:L76` passes that same mutated struct on to `super.save()`.
     *
     * Strict TypeScript cannot reproduce the ambiguity — there is no implicit scope search — so the
     * port makes the mutation EXPLICIT with `data[URL_TITLE_DATA_KEY] = …` on the parameter itself.
     * The observable contract is identical, and this case pins it from both sides: the caller's own
     * reference carries the value, and the object handed to the base collaborator is that very
     * object by IDENTITY, not a structural equal.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    const [recorded] = harness.saves;

    expect(harness.saves).toHaveLength(1);
    expect(recorded?.data).toBe(data);
    expect(data.urlTitle).toBe('acme-widgets');
  });

  it('NET-NEW — model/service/BrandService.cfc:L70,L76 — the write happens BEFORE the delegation, so the base collaborator already sees the derived title', async () => {
    /*
     * Ordering matters and is not incidental: the derived title has to be present in the payload by
     * the time population runs, or `urlTitle` would never be set on the entity and
     * `model/validation/Brand.json:L5` would refuse every generated brand. The recording collaborator
     * snapshots the payload's `urlTitle` at the instant it is called, so a write moved after the
     * delegation — or an `await` misplaced so the derivation resolves later — fails here.
     */
    const harness = createDelegationHarness({ takenUrlTitles: ['acme-widgets'] });
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(harness.saves[0]?.data?.urlTitle).toBe('acme-widgets-2');
  });

  it('NET-NEW — model/service/BrandService.cfc:L70 — no key OTHER than urlTitle is added, removed or rewritten', async () => {
    /*
     * The legacy touches exactly one key. Everything the caller supplied — including keys that mean
     * nothing to `Brand` — arrives at `super.save()` untouched, because population, not this member,
     * is what decides which keys are honoured.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = {
      activeFlag: true,
      brandName: 'ACME Widgets',
      brandWebsite: 'https://example.test/acme',
      somethingUnknown: 'left alone',
    };

    await harness.service.saveBrand(brand, data);

    expect(Object.keys(data).sort()).toEqual([
      'activeFlag',
      'brandName',
      'brandWebsite',
      'somethingUnknown',
      'urlTitle',
    ]);
    expect(data.brandName).toBe('ACME Widgets');
    expect(data.brandWebsite).toBe('https://example.test/acme');
    expect(data.somethingUnknown).toBe('left alone');
    expect(data.activeFlag).toBe(true);
  });

  it('NET-NEW — model/service/BrandService.cfc:L76 — the delegation is POSITIONAL: (brand, data), with the context argument OMITTED', async () => {
    /*
     * `return super.save(arguments.brand, arguments.data)` passes two ordered arguments and no third.
     * `org/Hibachi/HibachiService.cfc:L253` records that the framework's dispatch supports ordered
     * arguments ONLY — named arguments are not supported — so argument ORDER is part of the contract
     * and not a formatting choice.
     *
     * Omitting the third argument is equally load-bearing. `model/service/HibachiService.cfc:L86`
     * declares `save(required any entity, struct data={}, string context="save")`, so the omission is
     * what selects the `"save"` context and the fresh empty struct default. The port keeps the
     * omission rather than passing `'save'` explicitly, so the DEFAULT is what supplies it — which is
     * why `context` is asserted `undefined` here rather than `'save'`. Group C proves the default
     * that omission selects actually takes effect.
     *
     * IR-8 — `super.save` at `:L76` resolves to the LOCAL Slatwall override at
     * `model/service/HibachiService.cfc:L86`, not to the framework base at
     * `org/Hibachi/HibachiService.cfc`. The distinction is behavioural: the local override adds the
     * inactive-entity settings sweep of `:L91-L100` on top of the framework save. The port expresses
     * that as delegation to an INJECTED base collaborator rather than as inheritance (R3, AAP
     * §0.4.3.3), and `BrandService` extends nothing at all.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(harness.saves).toEqual([{ brand, context: undefined, data }]);
    expect(harness.saves[0]?.brand).toBe(brand);
    expect(harness.saves[0]?.context).toBeUndefined();
  });

  it('NET-NEW — model/service/BrandService.cfc:L76 — the member RETURNS what the base collaborator returns, by reference', async () => {
    /*
     * `return super.save(...)` — the value is passed straight back, with no post-processing and no
     * re-read from the repository. `model/service/HibachiService.cfc:L103` returns `arguments.entity`,
     * so the identity that comes back is the identity that went in.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();

    const returned = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(returned).toBe(brand);
  });

  it('NET-NEW — model/service/BrandService.cfc:L76 — the repository write member is NOT called directly: persistence is the base collaborator’s business', async () => {
    /*
     * A scope assertion, and a meaningful one. `BrandRepository` exposes a `saveBrand` member, and
     * calling it here would look harmless while bypassing validation entirely — the legacy routes
     * every brand write through `super.save()` so the rule set of `model/validation/Brand.json` gets
     * its say. With the recording collaborator in place NOTHING may reach the repository except the
     * URL-title probe.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();

    await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.calls.every((call) => call.member === 'isUrlTitleAvailable')).toBe(true);
  });
});

/* ================================================================================================
 * GROUP C — `saveBrand` THROUGH THE REAL GRAPH: the ported rule set, the real `Validator`, the real
 * `BaseService`
 * `model/validation/Brand.json`, `model/service/HibachiService.cfc:L86-L104`,
 * `meta/tests/unit/IssuesTest.cfc:L203-L206`
 *
 * Nothing is doubled here except the four seams a `BaseService` cannot be constructed without. The
 * verdicts below are produced by `src/validation/rules/brand.rules.ts` evaluated by
 * `src/validation/Validator.ts`, which is the only way an assertion about which saves are REFUSED can
 * be about the port rather than about a double.
 * ============================================================================================== */

describe('saveBrand — the real validation path', () => {
  it('NET-NEW — model/validation/Brand.json:L3,L5 — a derivable name yields a save that PASSES and persists exactly once', async () => {
    /*
     * The baseline the refusal cases are measured against. `brandName` satisfies `:L3`, the derived
     * `urlTitle` satisfies both constraints of `:L5`, and `brandWebsite` is absent — which `:L4`
     * permits, because a `dataType` check passes on an absent value
     * (`org/Hibachi/HibachiValidationService.cfc:L483`).
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const saved = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(saved).toBe(brand);
    expect(brand.brandName).toBe('ACME Widgets');
    expect(brand.urlTitle).toBe('acme-widgets');
    // The derived title reached the entity through POPULATION, not through a direct field write.
    expect(harness.authorization.calls.map((call) => call.propertyName).sort()).toEqual([
      'brandName',
      'urlTitle',
    ]);
    expect(persistedBrands(harness.brands.calls)).toEqual([brand]);
    expect(harness.brands.brands).toEqual([brand]);
  });

  it('NET-NEW — model/validation/Brand.json:L5 — AAP-OMITTED PATH: a name that slugs to nothing leaves urlTitle unset, and urlTitle.required fails ALONE', async () => {
    /*
     * THE PATH THE AAP'S OWN NARRATIVE STEPS OVER, ISOLATED SO THE CONSEQUENCE IS UNAMBIGUOUS.
     *
     * `'!!!'` has `len() == 3`, so `model/service/BrandService.cfc:L69` enters its first arm and the
     * derivation runs — this is NOT the `:L73` fall-through. But every character is outside the
     * retained class of `model/service/DataService.cfc:L57`, so the slug is `''`, and `''` is what
     * `:L70` writes onto the payload. Population then CLEARS a blank value rather than storing it, so
     * `urlTitle` arrives at validation ABSENT.
     *
     * WHY THIS EXACT INPUT AND NOT A SIMPLER ONE. It is the only shape that makes the required-title
     * failure a lone finding: `brandName` is satisfied, `brandWebsite` is absent and therefore fine,
     * and `urlTitle` is the single refused property. Every other route to an unset title — an absent
     * name, an empty name — ALSO fails `brandName` at `:L3`, so the title failure would be one of two
     * and could not be attributed. The next case covers that route on its own terms.
     *
     * `.unique` does NOT also fire, and that is the rule set behaving correctly rather than a gap: an
     * absent value binds to nothing, the existence query returns no rows, and
     * `org/Hibachi/HibachiDAO.cfc:L130-L146` therefore answers unique. Only `.required` distinguishes
     * absent from present.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: '!!!' };

    const raised = await harness.service.saveBrand(brand, data).catch((error: unknown) => error);

    // The derivation ran and produced the empty slug, which is what reached the payload.
    expect(data.urlTitle).toBe('');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['']);
    // Population cleared it, so the entity carries no title at all.
    expect(brand.urlTitle).toBeUndefined();
    expect(brand.brandName).toBe('!!!');

    expect(raised).toBeInstanceOf(ValidationError);
    if (raised instanceof ValidationError) {
      expect(raised.getErrors()).toEqual({
        urlTitle: ['validate.save.Brand.urlTitle.required'],
      });
    }

    // THE PERSISTER IS NOT CALLED. That gate is the whole point of the refusal.
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.brands).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L73 + model/validation/Brand.json:L3,L5 — the true fall-through fails BOTH required rules, and that is reported rather than smoothed over', async () => {
    /*
     * A FINDING, NOT A TEST FIXTURE. The `:L73` fall-through is reachable only when NEITHER name
     * source is usable — and `model/validation/Brand.json:L3` makes `brandName` required in the very
     * same context. So the branch that produces no `urlTitle` can never be the only thing wrong: a
     * brand that reaches it fails `brandName.required` as well, always.
     *
     * The AAP's account of this path — "no `urlTitle` is added … Brand save validation fails because
     * `Brand.json:L5` requires and uniquely validates `urlTitle`" — is therefore true but incomplete
     * about which findings appear. Both keys are asserted here so the file states the whole verdict,
     * and the preceding case isolates the title failure by a route the AAP does not describe. Neither
     * case is weakened to match the other.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = {};

    const raised = await harness.service.saveBrand(brand, data).catch((error: unknown) => error);

    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);

    expect(raised).toBeInstanceOf(ValidationError);
    if (raised instanceof ValidationError) {
      expect(raised.getErrors()).toEqual({
        brandName: ['validate.save.Brand.brandName.required'],
        urlTitle: ['validate.save.Brand.urlTitle.required'],
      });
    }
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });

  it('NET-NEW — model/validation/Brand.json:L5 — the TABLE-VALUE seam and the ENTITY-PROPERTY seam are different checks, and are left free to disagree', async () => {
    /*
     * ⚠️ TWO UNIQUENESS MECHANISMS, DELIBERATELY NOT HARMONISED. They are different legacy members
     * with different arguments and different call sites:
     *
     *   * `model/dao/DataDAO.cfc:L115-L131` — `verifyUniqueTableValue(tableName, column, value)`.
     *     Table-and-column scoped, NO self-exclusion, reached only by the slug loop at
     *     `model/service/DataService.cfc:L62` and `:L67`.
     *   * `org/Hibachi/HibachiDAO.cfc:L130-L146` — `isUniqueProperty(propertyName, entity)`. Entity
     *     scoped, WITH the `e.<idProperty> != :entityID` self-exclusion, reached only by the `unique`
     *     constraint of `model/validation/Brand.json:L5`.
     *
     * This case drives them to CONTRADICT each other on purpose, which is the only arrangement that
     * proves the port kept them separate: the table probe reports `acme-widgets` free, so the slug
     * loop returns it UNSUFFIXED, and the entity-property port then reports a different row holding
     * it, so validation refuses the save. Routing the slug loop through entity-property uniqueness —
     * the tempting simplification — would have produced `acme-widgets-2` and a save that PASSES,
     * which is a different stored value from a different code path.
     *
     * The port is annotated with its own interface type here rather than left inferred, to make the
     * argument shapes of the two seams visibly different at the call site.
     */
    const harness = createBrandHarness({
      uniqueValues: [
        {
          entityID: 'incumbent-brand-id',
          entityName: BRAND_ENTITY_NAME_FOR_SEEDS,
          propertyName: 'urlTitle',
          value: 'acme-widgets',
        },
      ],
    });
    const { brand } = createManagedBrand();

    const raised = await harness.service
      .saveBrand(brand, { brandName: 'ACME Widgets' })
      .catch((error: unknown) => error);

    // ONE table-value probe, and it said "free" — no suffix was ever considered.
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets']);
    expect(brand.urlTitle).toBe('acme-widgets');

    // The entity-property seam is a different member, asked with a different argument shape.
    const entityUniqueness: UniquePropertyPort = harness.validation.uniqueProperty.uniqueProperty;
    await expect(entityUniqueness.isUniqueProperty('urlTitle', brand)).resolves.toBe(false);

    expect(raised).toBeInstanceOf(ValidationError);
    if (raised instanceof ValidationError) {
      expect(raised.getErrors()).toEqual({
        urlTitle: ['validate.save.Brand.urlTitle.unique'],
      });
    }
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiDAO.cfc:L143 — the uniqueness check EXCLUDES the row being saved, so a brand keeps its own title on re-save', async () => {
    /*
     * `and e.#entityIDproperty# != :entityID` at `:L143`. Without it every update of an existing brand
     * would collide with itself and no brand could ever be saved twice. The incumbent row seeded here
     * holds the same value under the SAME identifier as the entity, which is the only arrangement the
     * self-exclusion clause distinguishes.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand({ brandID: 'brand-1', urlTitle: 'acme-widgets' });
    harness.validation.uniqueProperty.take({
      entityID: 'brand-1',
      entityName: BRAND_ENTITY_NAME_FOR_SEEDS,
      propertyName: 'urlTitle',
      value: 'acme-widgets',
    });

    const saved = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets Renamed' });

    expect(saved).toBe(brand);
    // The guard at `:L68` short-circuited, so the existing title is intact and unprobed.
    expect(brand.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(harness.brands.calls)).toEqual([]);
    expect(persistedBrands(harness.brands.calls)).toEqual([brand]);
  });

  it('NET-NEW — model/validation/Brand.json:L4 — brandWebsite is an OPTIONAL url check: absent passes, malformed fails, well-formed passes', async () => {
    /*
     * `[{"contexts":"save","dataType":"url"}]` declares a FORMAT rule and nothing else — no
     * `required`, and no length ceiling anywhere in the document. Three inputs, one per branch:
     *
     * ⚠️ NOT TO BE CONFLATED WITH `hb_formatType="url"` AT `model/entity/Brand.cfc:L57`. That
     * attribute is a DISPLAY hint consumed by the admin rendering layer, which is out of scope; it is
     * not read by validation and carries no constraint. The live rule is the JSON one, and no maximum
     * length is derived from either, because neither declares one.
     */
    const absent = createBrandHarness();
    const absentBrand = createManagedBrand().brand;
    await expect(absent.service.saveBrand(absentBrand, { brandName: 'No Website' })).resolves.toBe(
      absentBrand,
    );

    const malformed = createBrandHarness();
    const malformedBrand = createManagedBrand().brand;
    const raised = await malformed.service
      .saveBrand(malformedBrand, { brandName: 'Bad Website', brandWebsite: 'not a url at all' })
      .catch((error: unknown) => error);

    expect(raised).toBeInstanceOf(ValidationError);
    if (raised instanceof ValidationError) {
      expect(raised.getErrors()).toEqual({
        brandWebsite: ['validate.save.Brand.brandWebsite.dataType.url'],
      });
    }
    expect(persistedBrands(malformed.brands.calls)).toEqual([]);

    const wellFormed = createBrandHarness();
    const wellFormedBrand = createManagedBrand().brand;
    await expect(
      wellFormed.service.saveBrand(wellFormedBrand, {
        brandName: 'Good Website',
        brandWebsite: 'https://example.test/acme',
      }),
    ).resolves.toBe(wellFormedBrand);
    expect(persistedBrands(wellFormed.brands.calls)).toEqual([wellFormedBrand]);
  });
});

describe('saveBrand — the issue_1690_2 contract, and the one place the port diverges from it', () => {
  it('NET-NEW — meta/tests/unit/IssuesTest.cfc:L203-L206 — a validation failure is a KEYED, RECOVERABLE bag: nothing persisted, findings intact, entity reference alive', async () => {
    /*
     * WHAT THE LEGACY REGRESSION ACTUALLY ASSERTS. `issue_1690_2` at `:L203-L206` creates a new
     * entity and saves it with NO guard around the call — contrast `issue_1690` at `:L192-L201`, which
     * wraps its assertions in `if(!product.hasErrors())`. The unguarded form is the assertion: saving
     * an entity that cannot pass validation must not blow the request up. The findings come back on
     * the entity, the caller inspects them, and the caller stays in control.
     *
     * ⚠️ MISMATCH — THE LANDED CONTRACT RAISES WHERE THE LEGACY RETURNED. `src/services/BaseService.ts`
     * documents this at its `:L103` note: `model/service/HibachiService.cfc:L103` returned
     * `arguments.entity` on EVERY path because the entity carried its own bag, and not every ported
     * entity carries one, so the accumulated bag is THROWN instead — deliberately, after the
     * two-part gate at `:L91` has been evaluated so both of its arms stay live. The divergence is a
     * layer decision with a named exception: `src/services/ProductService.ts` catches it and returns
     * the entity, because `model/service/ProductService.cfc:L310` returns on every path and its own
     * `:L306` gate reads `hasErrors()`. `BrandService.saveBrand` is explicitly one of the callers that
     * RELIES on the raise.
     *
     * THE MISMATCH IS EXPOSED, AND THE SUBSTANCE IS STILL PINNED. This case asserts every element of
     * the legacy contract that survived the change of mechanism, and asserts the mechanism itself
     * rather than pretending it did not change:
     *   1. The findings are keyed by property and carry their legacy-shaped message keys, unaltered.
     *   2. Nothing was persisted — the failure is recoverable, not half-applied.
     *   3. The caller's entity reference is the same object and carries what population wrote, so a
     *      caller can still inspect and correct it exactly as `issue_1690` does.
     *   4. The failure is a `ValidationError`, which is a `DomainError` — the recoverable, serialisable
     *      family — and NOT a `ConfigurationError`, a `DataIntegrityError` or a bare `Error`. "Does not
     *      throw solely because validation failed" becomes "does not fail in an UNRECOVERABLE way",
     *      which is the part of the guarantee the port can keep.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const raised = await harness.service
      .saveBrand(brand, { brandWebsite: 'https://example.test/acme' })
      .catch((error: unknown) => error);

    // 1 — the findings, keyed and intact.
    expect(raised).toBeInstanceOf(ValidationError);
    expect(raised).toBeInstanceOf(DomainError);
    if (raised instanceof ValidationError) {
      expect(raised.hasErrors()).toBe(true);
      expect(raised.hasError('brandName')).toBe(true);
      expect(raised.getError('brandName')).toEqual(['validate.save.Brand.brandName.required']);
      expect(raised.getError('urlTitle')).toEqual(['validate.save.Brand.urlTitle.required']);
      // The well-formed website was accepted, so its key is absent — findings are per-property.
      expect(raised.hasError('brandWebsite')).toBe(false);
      expect(Object.keys(raised.getErrors()).sort()).toEqual(['brandName', 'urlTitle']);
    }

    // 2 — nothing persisted: no repository write call, and the store is still empty.
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.brands).toEqual([]);

    // 3 — the caller's reference survives, carrying what population managed to write.
    expect(brand.brandWebsite).toBe('https://example.test/acme');
    expect(brand.brandName).toBeUndefined();
  });

  it('NET-NEW — src/validation/Validator.ts — the Validator NEVER persists: a dry run touches no write seam at all', async () => {
    /*
     * `Validator.validate` returns a bag and mutates nothing outside it — no write, no flush, no
     * repository call of any kind. Asserted by running the real rule set through the harness's
     * dry-run mode over a subject that would FAIL, and then observing that every write seam is
     * untouched. That separation is what lets `BaseService` gate persistence on the bag rather than
     * having to undo a write.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const errors = await harness.validation.validateDryRun(brand, brandValidationRules, 'save');

    expect(errors.hasErrors()).toBe(true);
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['brandName', 'urlTitle']);
    expect(harness.brands.calls).toEqual([]);
    expect(harness.brands.brands).toEqual([]);
    expect(harness.persistence.settingCleanups).toEqual([]);
    expect(harness.persistence.commentCleanups).toEqual([]);
    // A dry run leaves the subject alone: no bag is attached to the entity.
    expect(brand.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L86 — the OMITTED third argument is what selects the "save" context, and the omitted second a fresh empty payload', async () => {
    /*
     * `save(required any entity, struct data={}, string context="save")` declares both defaults, and
     * `model/service/BrandService.cfc:L76` passes only two arguments, so the CONTEXT default is what
     * `saveBrand` relies on. This case exercises the defaults at the boundary that owns them — the
     * base service — because `saveBrand` always forwards its own explicit payload and so can never
     * exercise the `data={}` default itself. No overload is fabricated on `saveBrand` to reach it.
     *
     * BOTH DEFAULTS ARE OBSERVED INDIRECTLY, BECAUSE NEITHER IS EXPOSED DIRECTLY:
     *   * The `"save"` context shows up in the message keys. Every finding is prefixed
     *     `validate.save.` — a `delete`-context run over this same rule set produces the products and
     *     physical-counts guards instead, and no required-field findings at all.
     *   * The empty payload shows up as ZERO population-authorisation requests. `populate` consults
     *     the authorisation port once per payload key it intends to write, so an empty struct produces
     *     an empty call log. A shared or pre-populated default would leave entries here.
     *
     * That the default is FRESH per call is a property of the default-initialiser semantics rather
     * than something a test can observe — nothing inside `save` writes to it, so no state could leak
     * even in principle. Stated rather than asserted through a fabricated seam.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const raised = await harness.baseService.save(brand).catch((error: unknown) => error);

    expect(harness.authorization.calls).toEqual([]);
    expect(raised).toBeInstanceOf(ValidationError);
    if (raised instanceof ValidationError) {
      expect(raised.getErrors()).toEqual({
        brandName: ['validate.save.Brand.brandName.required'],
        urlTitle: ['validate.save.Brand.urlTitle.required'],
      });
      for (const messages of Object.values(raised.getErrors())) {
        for (const message of messages) {
          expect(message.startsWith('validate.save.Brand.')).toBe(true);
        }
      }
    }
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });
});

/* ================================================================================================
 * GROUP D — `newBrand()`, THE FIRST OF THE THREE MEMBERS THAT EXISTED ONLY AS RUNTIME SYNTHESIS
 * `org/Hibachi/HibachiService.cfc:L255-L265`, `:L544-L549`; AAP §0.4.2.5, IR-1
 *
 * WHY THESE THREE MEMBERS NEED TESTS AT ALL, WHEN NO LEGACY SOURCE FILE DECLARES THEM.
 * `model/service/BrandService.cfc` declares exactly ONE function, `saveBrand` at `:L67`. Yet
 * `brandService.newBrand()`, `brandService.getBrand(id)` and `brandService.deleteBrand(entity)` all
 * resolve at run time, because `onMissingMethod` at `:L255-L281` dispatches on the method-name PREFIX
 * — `get` at `:L258`, `new` at `:L264`, `delete` at `:L270` — and fabricates the call. `newBrand` in
 * particular routes through `onMissingNewMethod` at `:L544-L549`, which strips the three-character
 * `new` prefix with `missingMethodName.substring(3)` and constructs `Brand`.
 *
 * IR-1 and TR-3 forbid reproducing that mechanism: TypeScript under `strict` has no equivalent
 * facility, and inventing one — a proxy, an index signature, a string-keyed dispatcher — would put
 * back exactly the metaprogramming the extraction exists to remove. So each of the three is an
 * EXPLICITLY DECLARED, typed member, and these groups assert the declared member rather than the
 * dispatch. `newBrand` also has the only traceable legacy thread of the three: the legacy entity suite
 * obtains its subject through it at `meta/tests/unit/entity/BrandTest.cfc:L55`.
 * ============================================================================================== */

describe('newBrand — the explicitly declared factory', () => {
  it('NET-NEW — org/Hibachi/HibachiService.cfc:L264,L544-L549 — the member is DECLARED and SYNCHRONOUS, and forwards to the repository factory', async () => {
    /*
     * Synchronous, and that is a contract detail rather than an implementation choice: the legacy
     * `new` prefix constructs a transient CFC and hands it straight back — no query, no await, nothing
     * to resolve. `../ports/repositories/BrandRepository` declares `newBrand(): ManagedEntity<Brand>`
     * for the same reason, and a `Promise`-returning port would have forced every call site in the
     * legacy suite's shape to become asynchronous for no behavioural reason.
     *
     * The assertion below is what distinguishes a declared member from a synthesized one: the value is
     * usable IMMEDIATELY, with no `await`, and the forwarding is visible in the repository call log.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(brand).not.toBeInstanceOf(Promise);
    expect(factoryCallCount(harness.brands.calls)).toBe(1);
    expect(harness.brands.calls).toEqual([{ member: 'newBrand' }]);
    // Awaiting it is harmless and yields the same object, which is what "not a promise" means here.
    await expect(Promise.resolve(brand)).resolves.toBe(brand);
  });

  it('NET-NEW — model/entity/Brand.cfc:L49,L52 — the product is a real managed Brand, carrying the entity contract and the unsaved-value sentinel', async () => {
    /*
     * A factory that returned a bare object literal would satisfy the signature and then fail the
     * moment validation asked for metadata. The four members below are exactly the ones the ported
     * rule set and the uniqueness port consult, so they are asserted rather than assumed:
     * `getClassName()` keys every validation message, `getEntityName()` keys every uniqueness seed,
     * `getPrimaryIDPropertyName()` and `getPrimaryIDValue()` supply the self-exclusion clause of
     * `org/Hibachi/HibachiDAO.cfc:L143`.
     *
     * `brandID` starts at the empty string because `model/entity/Brand.cfc:L52` declares
     * `unsavedvalue="" default=""`, and `isNew()` reads that sentinel. IR-6 governs what replaces it:
     * a 32-character dash-free hex identifier minted by the persistence layer, never here.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(brand.getClassName()).toBe('Brand');
    expect(brand.getEntityName()).toBe(BRAND_ENTITY_NAME_FOR_SEEDS);
    expect(brand.getPrimaryIDPropertyName()).toBe('brandID');
    expect(brand.getPrimaryIDValue()).toBe('');
    expect(brand.isNew()).toBe(true);
    expect(brand.hasErrors()).toBe(false);

    // IR-6, observed end to end: the sentinel is replaced by a 32-character dash-free identifier.
    await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });
    expect(brand.isNew()).toBe(false);
    expect(brand.brandID).toMatch(/^[0-9a-f]{32}$/);
  });

  it('NET-NEW — meta/tests/unit/entity/BrandTest.cfc:L58-L60 — TRACEABLE DEFAULT: getProducts() is an EMPTY ARRAY, not undefined and not shared', () => {
    /*
     * ⭐ THE ONE THREAD IN THIS FILE WITH A LEGACY COUNTERPART, AND IT IS AN ENTITY ASSERTION REACHED
     * THROUGH THIS SERVICE MEMBER. `meta/tests/unit/entity/BrandTest.cfc` obtains its subject at `:L55`
     * with `request.slatwallScope.getService("brandService").newBrand()`, and then OVERRIDES the
     * inherited defaults assertion at `:L58-L60` with `assertEquals(variables.entity.getProducts(),
     * [])`. AAP §0.6.5.1 records it as "the overridden defaults assertion plus three inherited".
     *
     * The case itself is still labelled NET-NEW, because what it asserts here is the TypeScript
     * factory's contract rather than a re-run of the MXUnit case — AAP §0.8.3.7 requires the
     * distinction be visible per case rather than implied, and §0.6.5.3 records that the legacy suite
     * cannot be executed in this environment at all. The provenance is the value it pins; the
     * mechanism is new.
     *
     * `toEqual([])` alone would also pass for `undefined` under some readings, so the array-ness and
     * the length are asserted separately.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(Array.isArray(brand.getProducts())).toBe(true);
    expect(brand.getProducts()).toEqual([]);
    expect(brand.getProducts()).toHaveLength(0);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L544-L549 — each call yields a FRESH instance with independent mutable state', () => {
    /*
     * The legacy `new` prefix constructs a new transient on every call; a memoised or module-scope
     * instance would be a different thing entirely, and under M7 (AAP §0.6.6) it would also leak
     * across invocations on a warm Lambda container. The collections are the sharp case: `products` is
     * the entity's OWN live array — `getProducts()` returns it by reference so
     * `Product.setBrand` can push into it — so two instances sharing one array would be invisible
     * until the first relationship was written.
     */
    const harness = createBrandHarness();

    const first = harness.service.newBrand();
    const second = harness.service.newBrand();

    expect(first).not.toBe(second);
    expect(first.getProducts()).not.toBe(second.getProducts());
    expect(factoryCallCount(harness.brands.calls)).toBe(2);

    first.brandName = 'First Brand';
    first.getProducts().push(buildProduct({ productID: 'product-1' }));

    expect(second.brandName).toBeUndefined();
    expect(second.getProducts()).toEqual([]);
    expect(first.getProducts()).toHaveLength(1);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L255-L281 — the factory neither validates nor persists: a brand-new instance touches no write seam', async () => {
    /*
     * `onMissingNewMethod` constructs and returns; it does not save. So a fresh brand — which would
     * FAIL `model/validation/Brand.json:L3` and `:L5` on both required rules — can be created without
     * any complaint at all, and only reaches validation when someone saves it. Asserted by creating
     * one and then observing that every write seam and the whole store are untouched.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(harness.brands.brands).toEqual([]);
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(removedBrands(harness.brands.calls)).toEqual([]);
    // And it is genuinely invalid, which is why not validating here is observable behaviour.
    const errors = await harness.validation.validateDryRun(brand, brandValidationRules, 'save');
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['brandName', 'urlTitle']);
  });
});

/* ================================================================================================
 * GROUP E — `getBrand(brandID)`
 * `org/Hibachi/HibachiService.cfc:L258`; AAP §0.4.2.5, IR-1
 * ============================================================================================== */

describe('getBrand — the explicitly declared read', () => {
  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — the identifier is forwarded to the repository EXACTLY as received', async () => {
    /*
     * `onMissingMethod`'s `get` prefix passes the first ordered argument straight through — `:L253`
     * records that ordered arguments are the only supported form — so the port must not trim, case-fold
     * or otherwise normalise it. Three deliberately awkward identifiers, forwarded byte for byte, in
     * call order.
     *
     * The empty string is included on purpose: it is `model/entity/Brand.cfc:L52`'s `unsavedvalue`, so
     * a caller could plausibly hand it over, and the correct behaviour is to ask the repository and
     * report the miss rather than to guess.
     */
    const harness = createBrandHarness();

    await harness.service.getBrand('444df2f7ea9c87e60051f3cd87b435a1');
    await harness.service.getBrand('  Padded-ID  ');
    await harness.service.getBrand('');

    expect(requestedBrandIDs(harness.brands.calls)).toEqual([
      '444df2f7ea9c87e60051f3cd87b435a1',
      '  Padded-ID  ',
      '',
    ]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — a HIT resolves the stored entity by reference, unmodified', async () => {
    /*
     * By reference, not by value: the services pass entities around by identity, and the uniqueness
     * self-exclusion of `org/Hibachi/HibachiDAO.cfc:L143` depends on the retrieved instance carrying
     * the same identifier the caller will save under. A copy would break both.
     */
    const stored = createManagedBrand({
      brandID: 'brand-1',
      brandName: 'ACME Widgets',
      urlTitle: 'acme-widgets',
    }).brand;
    const harness = createBrandHarness({ storedBrands: [stored] });

    const found = await harness.service.getBrand('brand-1');

    expect(found).toBe(stored);
    expect(found?.brandName).toBe('ACME Widgets');
    expect(found?.urlTitle).toBe('acme-widgets');
    expect(requestedBrandIDs(harness.brands.calls)).toEqual(['brand-1']);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — a MISS resolves null, and fabricates nothing to fill the gap', async () => {
    /*
     * THE THREE THINGS A MISS MUST NOT DO, EACH ASSERTED. `../ports/repositories/BrandRepository`
     * declares `Promise<ManagedEntity<Brand> | null>`, so the miss is a VALUE and the caller decides:
     *
     *   1. It does not raise. The legacy `get` prefix returns whatever the DAO found, and a missing row
     *      is an ordinary answer rather than an error condition.
     *   2. It does not fall back to the factory. The legacy framework's entity-get path has a
     *      new-instance fallback, and `src/services/BrandService.ts` records that `getBrand` here does
     *      NOT reproduce it: a caller wanting a fresh instance calls `newBrand()` explicitly. So a miss
     *      leaves the factory call count at zero.
     *   3. It does not write anything — no upsert, no cache fill, no locator.
     *
     * `toBeNull` rather than a falsy check, because `null` and `undefined` are different answers under
     * `strict` and only one of them is declared.
     */
    const stored = createManagedBrand({ brandID: 'brand-1' }).brand;
    const harness = createBrandHarness({ storedBrands: [stored] });

    const found = await harness.service.getBrand('no-such-brand');

    expect(found).toBeNull();
    expect(found).not.toBeUndefined();
    expect(factoryCallCount(harness.brands.calls)).toBe(0);
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.calls).toEqual([{ brandID: 'no-such-brand', member: 'getBrand' }]);
    // The store is untouched by a miss.
    expect(harness.brands.brands).toEqual([stored]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — repeated reads are not memoised, so each call issues its own round trip (M7)', async () => {
    /*
     * M7 (AAP §0.6.6): the legacy relied on a `cacheuse="transactional"` second-level cache and on
     * lazy per-instance caches in entity `variables` scope, and NOTHING of that kind survives between
     * Lambda invocations except module-scope state. Memoising a read here would be worse than useless
     * — on a warm container it would serve one tenant's brand to the next request. Two identical reads
     * therefore produce two recorded calls.
     */
    const stored = createManagedBrand({ brandID: 'brand-1' }).brand;
    const harness = createBrandHarness({ storedBrands: [stored] });

    const first = await harness.service.getBrand('brand-1');
    const second = await harness.service.getBrand('brand-1');

    expect(first).toBe(stored);
    expect(second).toBe(stored);
    expect(requestedBrandIDs(harness.brands.calls)).toEqual(['brand-1', 'brand-1']);
  });
});

/* ================================================================================================
 * GROUP F — `deleteBrand(brand)`
 * `model/validation/Brand.json:L6-L7`, `model/service/HibachiService.cfc:L68-L84`;
 * AAP §0.4.2.5, IR-1
 * ============================================================================================== */

describe('deleteBrand — the delete guards', () => {
  it('NET-NEW — model/validation/Brand.json:L6 — a brand with PRODUCTS is refused: false returned, nothing removed, no cleanup run', async () => {
    /*
     * `"products": [{"contexts":"delete","maxCollection":0}]` — a ceiling of zero on the collection,
     * so any product at all blocks the delete. This is the live half of the document's two delete
     * guards, and it is the reason `model/entity/Brand.cfc:L61` can declare its one-to-many with NO
     * cascade: the application refuses the delete rather than orphaning or cascading rows.
     *
     * THE VERDICT IS A BOOLEAN AND NOT A RAISE, and that asymmetry against `save` is deliberate.
     * `model/service/HibachiService.cfc:L83` returns `deleteOK` unchanged, and
     * `src/services/BaseService.ts` keeps it that way because
     * `model/service/ProductService.cfc:L326-L333` clears a product's default SKU before calling and
     * restores it only on `false`. Raising instead would strand that caller.
     *
     * The relationship is built through `addProduct`, which delegates to `Product.setBrand` and pushes
     * into the brand's own live array — the same path production uses, so the guard sees what it would
     * really see rather than a hand-stuffed array.
     */
    const brand = createManagedBrand({ brandID: 'brand-1', urlTitle: 'acme-widgets' }).brand;
    brand.addProduct(buildProduct({ productID: 'product-1', productName: 'Widget' }));
    const harness = createBrandHarness({ storedBrands: [brand] });

    const removed = await harness.service.deleteBrand(brand);

    expect(brand.getProducts()).toHaveLength(1);
    expect(removed).toBe(false);
    // Nothing was removed: no repository call, and the row is still in the store.
    expect(removedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.brands).toEqual([brand]);
    // And the two cleanup steps sit INSIDE the `if(deleteOK)` gate at `:L73`, so neither ran.
    expect(harness.persistence.settingCleanups).toEqual([]);
    expect(harness.persistence.commentCleanups).toEqual([]);
  });

  it('NET-NEW — model/validation/Brand.json:L6 — an EMPTY products collection permits the delete, and the row really goes', async () => {
    /*
     * `maxCollection: 0` passes for a collection of length zero — and, per
     * `org/Hibachi/HibachiValidationService.cfc:L311`, also for an ABSENT value, which is exactly why
     * the ported rule reads the array rather than a possibly-absent property. A brand from
     * `newBrand()` satisfies it by the traceable `products === []` default of Group D.
     */
    const brand = createManagedBrand({ brandID: 'brand-1', urlTitle: 'acme-widgets' }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    const removed = await harness.service.deleteBrand(brand);

    expect(removed).toBe(true);
    expect(removedBrands(harness.brands.calls)).toEqual([brand]);
    expect(harness.brands.brands).toEqual([]);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L73-L81 — the two cleanup steps run ONLY after a successful delete, and only then', async () => {
    /*
     * The local override's whole contribution over the framework base is this gate:
     *
     *     if(deleteOK) {
     *         getService("settingService").removeAllEntityRelatedSettings( entity=arguments.entity );  // :L76
     *         getService("commentService").removeAllEntityRelatedComments( entity=arguments.entity );  // :L79
     *     }
     *
     * Both collaborators belong to excluded families — `Setting*` and `Content*` per AAP §0.2.2.1 — so
     * they are reached through the two cleanup ports `BaseServiceCollaborators` requires, doubled here
     * as inert recorders. NO hook, port or service locator is invented to observe them, and the
     * read-only `SettingResolverPort` is deliberately NOT pressed into service as a write seam: it
     * resolves configuration values and has no cleanup member at all.
     *
     * WHAT IS ASSERTED, AND THE ONE THING THAT IS DOCUMENTED INSTEAD. Both cleanups are recorded
     * against the same entity after a delete that succeeded, and the preceding case proves both are
     * absent when the delete was refused. Their relative ORDER — settings before comments — is awaited
     * sequentially in source order by `src/services/BaseService.ts`, which documents why it must not
     * become `Promise.all`; but the two doubles are separate logs with no shared clock, so a
     * cross-log ordering assertion would be asserting the harness rather than the port. It is recorded
     * here rather than faked.
     */
    const brand = createManagedBrand({ brandID: 'brand-1', urlTitle: 'acme-widgets' }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    await expect(harness.service.deleteBrand(brand)).resolves.toBe(true);

    /*
     * Both ports receive `entity=arguments.entity` — the SAME instance, by reference, exactly as `:L76`
     * and `:L79` pass it. Identity is asserted rather than structural equality, because a copy would
     * carry the right class name and identifier while being the wrong object.
     */
    expect(harness.persistence.settingCleanups).toHaveLength(1);
    expect(harness.persistence.settingCleanups[0]).toBe(brand);
    expect(harness.persistence.commentCleanups).toHaveLength(1);
    expect(harness.persistence.commentCleanups[0]).toBe(brand);
    // And the ref members the ports actually read resolve to the brand's own metadata.
    expect(harness.persistence.settingCleanups[0]?.getClassName()).toBe('Brand');
    expect(harness.persistence.settingCleanups[0]?.getPrimaryIDValue()).toBe('brand-1');
  });

  it('NET-NEW — model/validation/Brand.json:L7 + model/entity/Brand.cfc:L71 — the physicalCounts guard is INERT, and is preserved unrenamed', async () => {
    /*
     * ⚠️ A VALIDATION-DOCUMENT DEFECT, CARRIED RATHER THAN CORRECTED. `model/validation/Brand.json:L7`
     * declares its second delete guard against `physicalCounts`:
     *
     *     "physicalCounts": [{"contexts":"delete","maxCollection":0}]
     *
     * `model/entity/Brand.cfc` declares no such property. Its many-to-many relationship to physical
     * counts is named `physicals`, at `:L71`. The legacy validation engine SKIPS a rule whose property
     * the subject does not carry — `org/Hibachi/HibachiValidationService.cfc:L171` — so the rule has
     * never fired, for any brand, in any release. It is dead configuration that LOOKS live.
     *
     * PRESERVE AND ANNOTATE (AAP §0.8.2 guideline 4, IR-9). Three repairs suggest themselves and all
     * three are refused: renaming the rule to `physicals` would ACTIVATE a guard the legacy never
     * enforced and start blocking deletes that currently succeed; adding a `physicalCounts` member to
     * `Brand` would fabricate a property no legacy file declares; and invoking a real
     * `PhysicalService` would reach into an excluded family (AAP §0.2.2.1 excludes the six
     * `Physical`-prefixed files under `model/`). So the rule is transcribed with its ORIGINAL
     * identifier and made inert by
     * construction, and `src/validation/rules/brand.rules.ts` gives it a reader that returns
     * `undefined`.
     *
     * ASSERTED FROM THREE INDEPENDENT DIRECTIONS, so a future rename cannot slip through:
     *   1. The transcribed rule still carries the identifier `physicalCounts`, spelled as the legacy
     *      spells it, and is a member of the live rule set.
     *   2. `Brand.hasProperty('physicalCounts')` is false while `hasProperty('activeFlag')` is true —
     *      the skip at `:L171` is genuinely what silences it, not a missing rule.
     *   3. No `validate.delete.Brand.physicalCounts.maxCollection` finding is EVER produced, including
     *      on the delete that the products guard refuses — the run where every delete rule is
     *      evaluated.
     */
    const brand = createManagedBrand({ brandID: 'brand-1' }).brand;
    brand.addProduct(buildProduct({ productID: 'product-1' }));
    const harness = createBrandHarness({ storedBrands: [brand] });

    // 1 — the identifier is preserved byte for byte, and the rule is in the live set.
    expect(physicalCountsPropertyValidation.propertyIdentifier).toBe('physicalCounts');
    expect(productsPropertyValidation.propertyIdentifier).toBe('products');
    expect(brandValidationRules.properties).toContain(physicalCountsPropertyValidation);
    expect(brandValidationRules.properties).toContain(productsPropertyValidation);
    /*
     * Its reader answers absent — and takes NO subject at all, which is a stronger statement of
     * inertness than returning `undefined` from a subject it was handed: there is no argument through
     * which a future edit could accidentally make it read something. Compare
     * `productsPropertyValidation.read`, which genuinely reads its subject.
     */
    expect(physicalCountsPropertyValidation.read()).toBeUndefined();
    expect(productsPropertyValidation.read(brand)).toEqual(brand.getProducts());

    /*
     * 2 — the subject does not carry `physicalCounts`, which is what triggers the `:L171` skip. Note
     * WHICH fact does the silencing: the brand DOES carry `physicals`, so the relationship is present
     * and the rule misses it purely on the NAME. That is the whole defect — a typo in a configuration
     * document, not an absent relationship — and it is why renaming the rule would activate a guard
     * that has never run rather than merely tidying a dead entry. `activeFlag` is asserted alongside
     * as the control: `hasProperty` really does answer true for a declared property, so the false
     * above is a genuine miss and not a broken probe.
     */
    expect(brand.hasProperty('physicalCounts')).toBe(false);
    expect(brand.hasProperty('physicals')).toBe(true);
    expect(brand.hasProperty('activeFlag')).toBe(true);

    // 3 — the guard never fires, on the very run where every delete rule is evaluated.
    const errors = await harness.validation.validateDryRun(brand, brandValidationRules, 'delete');
    expect(errors.getErrors()).toEqual({
      products: ['validate.delete.Brand.products.maxCollection'],
    });
    expect(errors.hasError('physicalCounts')).toBe(false);
    await expect(harness.service.deleteBrand(brand)).resolves.toBe(false);
  });

  it('NET-NEW — model/validation/Brand.json:L3-L5 — the SAVE-context rules do not run on a delete, so an unnamed brand is still deletable', async () => {
    /*
     * Context selection is the mechanism that keeps one rule set serving both members. `:L3`, `:L4` and
     * `:L5` all declare `"contexts":"save"`, and `src/validation/Validator.ts` reproduces the legacy
     * context gate at `org/Hibachi/HibachiValidationService.cfc:L71`, so none of them is evaluated
     * under `delete`. A brand that could never be SAVED is therefore perfectly deletable — which is
     * the behaviour the legacy has, and is not obviously right until you notice that a row already in
     * the database may predate a rule.
     */
    const brand = createManagedBrand({ brandID: 'brand-1' }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    expect(brand.brandName).toBeUndefined();
    expect(brand.urlTitle).toBeUndefined();

    await expect(harness.service.deleteBrand(brand)).resolves.toBe(true);
    expect(removedBrands(harness.brands.calls)).toEqual([brand]);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L86 — deleteBrand does NOT go through the save path: no populate, no persist, no save-context findings', async () => {
    /*
     * A scope assertion. The delete path validates under `delete`, removes, and cleans up; it never
     * populates and never persists. Zero authorisation requests is the sharpest evidence for the
     * first, because `populate` consults the authorisation port once per payload key it intends to
     * write and the delete path supplies no payload at all.
     */
    const brand = createManagedBrand({ brandID: 'brand-1' }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    await expect(harness.service.deleteBrand(brand)).resolves.toBe(true);

    expect(harness.authorization.calls).toEqual([]);
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });
});

describe('the inactive-entity settings sweep of the local save override', () => {
  /*
   * TODO(parity) X15 — `model/service/HibachiService.cfc:L93,L95`. The local `save()` override
   * declares `var settingsRemoved = 0;` at `:L93` and then declares `var settingsRemoved` a SECOND
   * time, inside the `if` at `:L95`, in the same function scope. CFML has no block scope: both
   * declarations name one function-scoped variable, so the inner assignment IS visible to the
   * `settingsRemoved gt 0` test at `:L98` and the duplicate `var` is inert.
   *
   * STRICT TYPESCRIPT CANNOT REPRODUCE IT, AND THERE IS NOTHING BEHAVIOURAL TO REPRODUCE. A second
   * `let` inside the block would create a DIFFERENT binding, the outer counter would stay at zero and
   * the gate at `:L98` would silently stop seeing the count — turning an inert legacy oddity into a
   * real behavioural regression. `src/services/BaseService.ts` therefore declares the counter ONCE and
   * records the duplicate as documentary parity, minting no D-number for it.
   *
   * THE DEFECT ITSELF HAS NO OBSERVABLE RESULT, so no case below asserts it. What the cases DO assert
   * is the data flow the duplicate could have broken — that the count really reaches the gate — which
   * is the only part of `:L93-L99` that any test can see. Asserting the duplicate would mean asserting
   * a source-text property of a file this port never executes.
   */

  it('NET-NEW — model/service/HibachiService.cfc:L91,L94-L96 — an INACTIVE brand that saved cleanly has its setting values scrubbed by primary ID', async () => {
    /*
     * The two-part gate at `:L91` — no errors AND the entity declares `activeFlag` — then `:L94`'s
     * `if(!getActiveFlag())`. `Brand` declares `activeFlag` at `model/entity/Brand.cfc:L59`, so both
     * arms are live for this entity, and the identifier passed at `:L95` is `getPrimaryIDValue()`
     * exactly.
     */
    const harness = createBrandHarness({ settingValuesUpdated: 3 });
    const { brand } = createManagedBrand({ brandID: 'brand-1' });

    await harness.service.saveBrand(brand, { activeFlag: false, brandName: 'ACME Widgets' });

    expect(brand.activeFlag).toBe(false);
    expect(harness.persistence.settingValueScrubs).toEqual(['brand-1']);
    /*
     * `:L98` — `settingsRemoved gt 0` is the FIRST arm of the disjunction and the only one that can
     * ever match for a brand: the second arm lists Currency, FulfillmentMethod, OrderOrigin,
     * PaymentTerm and PaymentMethod, every one of them an excluded entity. A non-zero count therefore
     * reaching the gate is precisely the data flow the X15 duplicate `var` could have broken.
     */
    expect(harness.persistence.settingsCacheClears()).toBe(1);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L98 — a ZERO scrub count leaves the settings cache alone, because Brand is not one of the five listed classes', async () => {
    const harness = createBrandHarness();
    const { brand } = createManagedBrand({ brandID: 'brand-1' });

    await harness.service.saveBrand(brand, { activeFlag: false, brandName: 'ACME Widgets' });

    expect(harness.persistence.settingValueScrubs).toEqual(['brand-1']);
    expect(harness.persistence.settingsCacheClears()).toBe(0);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L94 — an ACTIVE brand skips the sweep entirely', async () => {
    const harness = createBrandHarness({ settingValuesUpdated: 3 });
    const { brand } = createManagedBrand({ brandID: 'brand-1' });

    await harness.service.saveBrand(brand, { activeFlag: true, brandName: 'ACME Widgets' });

    expect(brand.activeFlag).toBe(true);
    expect(harness.persistence.settingValueScrubs).toEqual([]);
    expect(harness.persistence.settingsCacheClears()).toBe(0);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L91 — a save that FAILED validation runs no sweep, whatever the activeFlag says', async () => {
    /*
     * The first arm of the `:L91` gate. The payload sets `activeFlag` false, which would otherwise
     * trigger the sweep, but validation refuses the save — so the post-processing block is skipped
     * along with the persist. Nothing half-applies.
     */
    const harness = createBrandHarness({ settingValuesUpdated: 3 });
    const { brand } = createManagedBrand({ brandID: 'brand-1' });

    await expect(harness.service.saveBrand(brand, { activeFlag: false })).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.persistence.settingValueScrubs).toEqual([]);
    expect(harness.persistence.settingsCacheClears()).toBe(0);
  });
});

/* ================================================================================================
 * GROUP G — M7 ISOLATION AND THE DECLARED SURFACE
 * AAP §0.6.6 M7; IR-1 / TR-3; `model/service/BrandService.cfc:L51`
 *
 * WHY A WHOLE GROUP FOR STATE ISOLATION. The legacy application ran on a persistent CF or Railo
 * server, and it leaned on that: `cacheuse="transactional"` second-level caching on 111 of 113
 * entities, lazy per-instance caches in entity `variables` scope, and the memoised option-group sort
 * order at `model/dao/SkuDAO.cfc:L204-L228`. NONE of that survives between Lambda invocations except
 * module-scope state — and module-scope state on a WARM container is worse than no cache, because it
 * serves one request's data to the next. M7 is the reason this file builds every collaborator inside
 * the case that uses it, and the reason the cases below prove that two independently-built graphs
 * cannot see each other.
 * ============================================================================================== */

describe('M7 — nothing leaks between independently constructed service graphs', () => {
  it('NET-NEW — AAP §0.6.6 M7 — a collision sequence in one graph does not give the next graph a suffix', async () => {
    /*
     * THE CASE THIS GROUP EXISTS FOR. Graph A meets two taken titles and must climb to `-3`; graph B
     * is built independently with nothing taken and must resolve the BARE candidate in ONE probe. If
     * the probe, the counter or the availability set were module-scope, memoised, or cached on the
     * service, B would inherit A's climb and answer `acme-widgets-3` — or, worse, answer `-3` without
     * probing at all.
     */
    const graphA = createBrandHarness({ takenUrlTitles: ['acme-widgets', 'acme-widgets-2'] });
    const graphB = createBrandHarness();

    const brandA = graphA.service.newBrand();
    await graphA.service.saveBrand(brandA, { brandName: 'ACME Widgets' });

    const brandB = graphB.service.newBrand();
    await graphB.service.saveBrand(brandB, { brandName: 'ACME Widgets' });

    expect(brandA.urlTitle).toBe('acme-widgets-3');
    expect(probedUrlTitles(graphA.brands.calls)).toEqual([
      'acme-widgets',
      'acme-widgets-2',
      'acme-widgets-3',
    ]);

    // B's FIRST probe is the bare candidate, and it is B's ONLY probe.
    expect(probedUrlTitles(graphB.brands.calls)).toEqual(['acme-widgets']);
    expect(brandB.urlTitle).toBe('acme-widgets');

    // The two call logs are distinct arrays, not two views of one.
    expect(graphA.brands.calls).not.toBe(graphB.brands.calls);
  });

  it('NET-NEW — AAP §0.6.6 M7 — entity-property uniqueness state is factory-local too, so one graph’s incumbent row does not refuse another graph’s save', async () => {
    /*
     * The same proof for the OTHER uniqueness seam. Graph A is seeded with an incumbent row holding
     * `acme-widgets`, so its save is refused with `.unique`; graph B, built with no seeds, saves the
     * identical brand cleanly. A shared or memoised uniqueness port would refuse both.
     */
    const graphA = createBrandHarness({
      uniqueValues: [
        {
          entityID: 'incumbent-brand-id',
          entityName: BRAND_ENTITY_NAME_FOR_SEEDS,
          propertyName: 'urlTitle',
          value: 'acme-widgets',
        },
      ],
    });
    const graphB = createBrandHarness();

    await expect(
      graphA.service.saveBrand(graphA.service.newBrand(), { brandName: 'ACME Widgets' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(persistedBrands(graphA.brands.calls)).toEqual([]);

    const brandB = graphB.service.newBrand();
    await expect(graphB.service.saveBrand(brandB, { brandName: 'ACME Widgets' })).resolves.toBe(
      brandB,
    );
    expect(persistedBrands(graphB.brands.calls)).toEqual([brandB]);
    expect(graphA.validation.uniqueProperty.calls).not.toBe(graphB.validation.uniqueProperty.calls);
  });

  it('NET-NEW — AAP §0.6.6 M7 — the store, the factory count and the cleanup logs are all per-graph', async () => {
    const stored = createManagedBrand({ brandID: 'brand-1', urlTitle: 'acme-widgets' }).brand;
    const graphA = createBrandHarness({ storedBrands: [stored] });
    const graphB = createBrandHarness();

    // A read that HITS in A must MISS in B, from the same identifier.
    await expect(graphA.service.getBrand('brand-1')).resolves.toBe(stored);
    await expect(graphB.service.getBrand('brand-1')).resolves.toBeNull();

    // A delete in A leaves B's store — which never held the row — exactly as it was.
    await expect(graphA.service.deleteBrand(stored)).resolves.toBe(true);
    expect(graphA.brands.brands).toEqual([]);
    expect(graphB.brands.brands).toEqual([]);
    expect(graphA.persistence.settingCleanups).toHaveLength(1);
    expect(graphB.persistence.settingCleanups).toEqual([]);

    // The factory counter is per-graph as well.
    graphA.service.newBrand();
    graphA.service.newBrand();
    graphB.service.newBrand();
    expect(factoryCallCount(graphA.brands.calls)).toBe(2);
    expect(factoryCallCount(graphB.brands.calls)).toBe(1);
  });

  it('NET-NEW — model/service/DataService.cfc:L62 — WITHIN one graph the derivation re-probes every time and memoises no resolved title', async () => {
    /*
     * The intra-graph half of M7. `src/services/BrandService.ts` records that the uniqueness probe is
     * constructed fresh on every derivation and never memoised, so a second brand with the same name
     * must issue its own round trips against the CURRENT state of the table rather than replaying the
     * first brand's answer.
     *
     * The incumbent title is registered explicitly with `takeUrlTitle` between the two saves, because
     * the in-memory repository does not index saved brands into its availability set — a deliberate
     * limitation of the double, since the real `MySqlBrandRepository` answers from the table itself.
     * Making the take explicit keeps the case about the SERVICE re-probing rather than about the
     * double bookkeeping for it.
     */
    const harness = createBrandHarness();

    const first = harness.service.newBrand();
    await harness.service.saveBrand(first, { brandName: 'ACME Widgets' });
    expect(first.urlTitle).toBe('acme-widgets');

    harness.brands.takeUrlTitle('acme-widgets');

    const second = harness.service.newBrand();
    await harness.service.saveBrand(second, { brandName: 'ACME Widgets' });

    expect(second.urlTitle).toBe('acme-widgets-2');
    // Four probes in total: one for the first brand, then two for the second. Nothing was replayed.
    expect(probedUrlTitles(harness.brands.calls)).toEqual([
      'acme-widgets',
      'acme-widgets',
      'acme-widgets-2',
    ]);
  });
});

describe('the declared surface — no synthesis, no dead injection, no invented collaborator', () => {
  it('NET-NEW — model/service/BrandService.cfc:L51 — the constructor takes EXACTLY TWO collaborators, and BrandService has no dead injection to drop', async () => {
    /*
     * ⭐ BRANDSERVICE IS THE ONE SERVICE IN THE SLICE WITH NO DEAD INJECTION, AND THAT IS A FINDING
     * WORTH PINNING RATHER THAN A GAP. AAP §0.6.3.5 counts four dead injections across the slice —
     * `productTypeDAO` and `contentService` on `ProductService`, `productService` on `SkuService`, and
     * `productService` on `OptionService` — and §0.6.3.3 records `BrandService` as "the cleanest of the
     * four services", with exactly ONE declared injection at `model/service/BrandService.cfc:L51`
     * (`dataService`, used at `:L70` and `:L72` and nowhere else) plus the `super.save()` inheritance
     * at `:L76`. There is nothing here to leave unwired, and this file claims none.
     *
     * The two constructor parameters map one-for-one onto that: `BrandRepository` stands for the CRUD
     * surface `onMissingMethod` synthesized (there is no `BrandDAO` anywhere in the repository — the
     * legacy service never had a DAO to inject), and `BrandBaseService` replaces the inheritance. The
     * NARROW `dataService` dependency became `../util/urlTitle` rather than a third parameter, because
     * only `createUniqueURLTitle` was ever used out of a 203-line service — AAP §0.6.3.3 classifies it
     * as "genuine but narrow".
     *
     * WHAT AN ARITY OF EXACTLY 2 RULES OUT, which is the point: no injected setting resolver, no
     * account context, no attempt budget, no image port, no logger — nothing beyond what the legacy
     * line declares.
     */
    expect(BrandService.length).toBe(2);

    // And the graph really is constructible from just those two, which the harness demonstrates.
    const harness = createBrandHarness();
    expect(harness.service).toBeInstanceOf(BrandService);
    await expect(
      harness.service.saveBrand(harness.service.newBrand(), { brandName: 'ACME Widgets' }),
    ).resolves.toBeInstanceOf(Object);

    /*
     * THE FIRST COLLABORATOR'S SURFACE, PINNED EXHAUSTIVELY. Annotated with the landed port type so
     * the whole assertion is compile-checked as well as asserted, and stated as an exact member list
     * because that is what rules out a re-imported DAO layer: five members, no `executeQuery`, no
     * `ormExecuteQuery` passthrough, no `getBrandSmartList`, no `countBrand`, no `listBrand`, no
     * `exportBrand`. There is no `BrandDAO` in the legacy repository to port — a repository-wide scan
     * finds none, which is precisely why AAP §0.4.1.6 declares this port from the SYNTHESIZED surface
     * at `org/Hibachi/HibachiService.cfc:L255-L281` rather than from a DAO file.
     */
    const repositoryPort: BrandRepository = harness.brands.repository;
    expect(Object.keys(repositoryPort).sort()).toEqual([
      'deleteBrand',
      'getBrand',
      'isUrlTitleAvailable',
      'newBrand',
      'saveBrand',
    ]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L255-L281 — the prototype carries FOUR declared members and no dynamic dispatch of any kind (IR-1, TR-3)', () => {
    /*
     * THE ASSERTION THAT PROVES THE SYNTHESIS IS GONE RATHER THAN RELOCATED. `onMissingMethod` at
     * `:L255-L281` fabricated a member for nine prefixes — `get`, `get…SmartList`, `new`, `list`,
     * `save`, `delete`, `count`, `export` and `process` — so in CFML `brandService.countBrand()`,
     * `brandService.listBrand()` and `brandService.exportBrand()` all resolved too, whether or not
     * anything called them. AAP §0.4.2.5 states the rule the port follows instead: synthesis is
     * reproduced "only where used", so the four members the slice actually calls are declared and the
     * rest simply do not exist.
     *
     * An exhaustive own-property list is what makes that checkable. It fails if a member is added, if
     * one is renamed, and — most importantly — if a proxy, an index signature or a string-keyed
     * dispatcher is ever introduced to bring the prefix ladder back.
     *
     * `createUniqueBrandUrlTitle` appears because `private` is a COMPILE-TIME modifier with no runtime
     * effect. It is not a contract member: it factors the two byte-identical call sites at `:L70` and
     * `:L72` into one place, which AAP §0.8.1 permits explicitly — minimal in functional scope, not in
     * idiom. Listing it rather than filtering it out keeps the assertion exhaustive and honest.
     */
    expect(Object.getOwnPropertyNames(BrandService.prototype).sort()).toEqual([
      'constructor',
      'createUniqueBrandUrlTitle',
      'deleteBrand',
      'getBrand',
      'newBrand',
      'saveBrand',
    ]);

    // No static surface either — no registry, no factory table, no memo cache hanging off the class.
    expect(Object.getOwnPropertyNames(BrandService).sort()).toEqual([
      'length',
      'name',
      'prototype',
    ]);

    // And the class extends nothing (R3, AAP §0.4.3.3): its prototype chain stops at Object.
    expect(Object.getPrototypeOf(BrandService.prototype)).toBe(Object.prototype);
  });

  it('NET-NEW — model/entity/Brand.cfc — Brand has NO calculated service-backed member, so no boundary port is needed and none is introduced', () => {
    /*
     * AAP §0.2.2.6 draws the calculated-property boundary and then records the exemption that applies
     * here: "`Brand.cfc`, `Option.cfc` and `OptionGroup.cfc` declare no non-persistent properties at
     * all, so they are unaffected." `Product` declares twenty such members and `Sku` twenty-three,
     * reaching into the excluded pricing, promotion, inventory and currency services; `Brand` declares
     * none. §0.4.1.4 says the same from the other side — "no non-persistent properties exist, so the
     * port is complete".
     *
     * THAT IS WHY THIS FILE IMPORTS NO PORT AT ALL BEYOND THE UNIQUENESS ONE. `SettingResolverPort` is
     * in this file's dependency whitelist and is deliberately NOT imported: nothing in the brand slice
     * reads a configuration key, and pressing a read-only resolver into service as a cleanup seam —
     * the one plausible misuse — is refused in Group F. `ImagePathPort`, `PricingPort`,
     * `SubscriptionTermPort`, `AccessContentPort`, `AccountContextPort` and `SmartListQueryPort` are
     * not reachable from anything this file exercises.
     *
     * ASSERTED STRUCTURALLY, FROM THE EXCLUSION LIST ITSELF. §0.2.2.6 enumerates the members the port
     * excludes because they reach out-of-scope services, and a brand answers `hasProperty` false for
     * every one of them AND carries no runtime member of that name — so there is nothing a getter could
     * hide behind. `brandName` is the control on the same probe: it is a declared property, so
     * `hasProperty` answers true, which proves the false answers above are real misses.
     *
     * No property TOTAL is asserted anywhere here. A count is exactly the kind of disputed figure AAP
     * §0.7.3's invent-nothing standard warns against, and it would also break on any legitimate
     * addition; the INVARIANT is what matters.
     */
    expect(BRAND_PROPERTY_DESCRIPTORS.persistent).toBe(true);
    expect(BRAND_PROPERTY_DESCRIPTORS.entityName).toBe('Brand');
    expect(BRAND_PROPERTY_DESCRIPTORS.properties.length).toBeGreaterThan(0);

    const brand = createManagedBrand().brand;

    for (const excludedCalculatedMember of [
      'salePrice',
      'salePriceDetails',
      'livePrice',
      'currentAccountPrice',
      'qats',
      'currencyDetails',
      'allowBackorderFlag',
      'eligibleFulfillmentMethods',
      'adminIcon',
    ]) {
      expect(brand.hasProperty(excludedCalculatedMember)).toBe(false);
      expect(excludedCalculatedMember in brand).toBe(false);
    }
    expect(brand.hasProperty('brandName')).toBe(true);

    // The rule set reaches the same two collections and nothing else outside the entity.
    expect(productsPropertyValidation.read(brand)).toBe(brand.getProducts());
    expect(physicalCountsPropertyValidation.read()).toBeUndefined();
  });
});
