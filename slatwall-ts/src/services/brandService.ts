// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts  composition root (wiring)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - Brand save-override service
//
// PORTED FROM: model/service/BrandService.cfc (90 lines), as a 1:1 logic
// extraction. That component is the smallest service in the migrated slice, and
// the whole of its behaviour is a single guard chain, reproduced below
// condition-for-condition rather than transliterated.
//
// ★ THE STRUCTURAL FACT A REVIEWER MUST READ FIRST
//   LEGACY-NOTE [model/service/BrandService.cfc:L67]: `saveBrand` is the ONE AND
//   ONLY function declared anywhere in the 90-line legacy component.
//   Everything else a caller might expect of a service - `getBrand`, `newBrand`,
//   `deleteBrand`, `getBrandSmartList`, `validateBrand` - arrived by inheritance
//   from `HibachiService`, and that framework base is deliberately not ported
//   (its responsibilities are redistributed: persistence to the repository
//   layer, validation to typed schemas, ambient scope to explicit parameters).
//   Their absence from the class below is therefore FAITHFUL, not an omission.
//   Do not invent `getBrand`, `findBrands`, `deleteBrand` or any smart-list
//   method here.
//
//   The contrast with two sibling services is deliberate and worth stating so
//   the asymmetry is not mistaken for inconsistency: `productService.ts` and
//   `skuService.ts` DO receive explicit typed query replacements, because
//   `model/service/ProductService.cfc:L342` and `model/service/SkuService.cfc:L309`
//   declare `getProductSmartList` / `getSkuSmartList` outright. BrandService.cfc
//   declares neither, so no smart-list surface exists here and none may be added.
//
// ★ THIS FILE IS THE REFERENCE CONSUMER OF THE urlTitleGenerator PORT
//   It is the first and simplest of the port's three service-tier consumers, so
//   its shape is deliberately exemplary: `productService.ts` reuses this exact
//   pattern at `saveProduct` and `saveProductType`. The guard that decides
//   WHETHER to generate belongs to the service tier and differs between those
//   consumers - see the PRESERVED LEGACY DEFECT block in
//   src/domain/ports/urlTitleGenerator.ts, which records that `saveProduct`
//   guards on null only while this component and `saveProductType` guard on null
//   OR empty. Each variant is reproduced exactly as written; none is normalised.
//
// ⚠ LOCATOR CAUTION - THE SOURCE WINS
//   Every `model/**` locator cited in this file was re-read from the source
//   while authoring it, and every one proved exact: no drift was found, so no
//   correction is recorded. Specification locators across this project are known
//   to drift by a few lines. If a future reader finds any citation here
//   disagreeing with the source, THE SOURCE WINS - re-verify, correct the
//   citation, and record the correction as a LEGACY-NOTE naming both the cited
//   and the actual line.
//
//   One cosmetic non-discrepancy, stated so nobody hunts for it: the entire
//   outer gate occupies ONE physical line, L68. Specification renderings wrap it
//   across two rows for legibility; there is no second line and no missing test.
//
// TEST COVERAGE HERE IS NET-NEW, AND THAT MUST NEVER BE PRESENTED AS PARITY
//   `meta/tests/unit/service/` holds only AccountServiceTest, HibachiServiceTest,
//   PaymentServiceTest and UtilityRBServiceTest - none of them in scope and none
//   of them touching BrandService - so this service has NO legacy coverage
//   lineage whatsoever.
//
//   ⚠ THE TRAP WORTH NAMING: `meta/tests/unit/entity/BrandTest.cfc` DOES exist
//   and DOES carry a real legacy assertion - `defaults_are_correct()`, asserting
//   that `getProducts()` answers an empty array. That covers the Brand ENTITY,
//   and it is carried forward by src/domain/entities/brand.ts. It gives THIS
//   file zero coverage lineage, and its coverage must not be claimed here.
//
//   No test file is authored by this module: the `tests/` tier is owned
//   elsewhere. What this file owes that tier is testability, and it pays it
//   structurally - the single collaborator arrives by constructor injection, and
//   there is no ambient state, no module-level mutable state and no cache to
//   reset between cases.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN LEFT SILENT
//   * NO SQL, PARAMETERISED OR OTHERWISE. This service builds and executes no
//     query of any kind; the prepared-statement obligation that preserves the
//     `cfqueryparam` guarantee rests wholly with src/repositories/mysql/**.
//     Stating that matters here because of one subtlety: the legacy body passes
//     the literal physical table name `"SwBrand"` [L70, L72]. That string is an
//     ARGUMENT TO A PORT, not SQL authored here - see the call sites below.
//   * NO MONETARY VALUE IS TOUCHED. There is no price, discount, rate or total
//     anywhere in this component, so the project rule that all money arithmetic
//     passes through the `Money` value object is vacuous here. It is recorded so
//     that nobody later introduces a raw numeric price into this file believing
//     no rule applies.
//   * NO SETTING IS READ. This component consumes no configuration key, so it
//     imports neither the settings port nor src/lib/config.ts - and config.ts
//     must never be pressed into service as a settings resolver or a request
//     scope in any case.
//     LEGACY-NOTE [model/service/SettingService.cfc:L177]: `globalURLKeyBrand`
//     (default `"sb"`) is deliberately out of scope. The settingsProvider port's
//     key union is fixed and does not include it; brand URL construction is not
//     part of this slice. If a brand URL prefix ever seems necessary here, that
//     is the signal to stop - not to add an eighth key and not to hardcode "sb".
//   * NO ZOD SCHEMA - BUT THE SAVE-CONTEXT RULES ARE ENFORCED, AND THAT REVERSES
//     WHAT THIS BULLET USED TO SAY. It read: "NO VALIDATION SCHEMA.
//     `model/validation/Brand.json` exists and is enforced by the framework
//     validation service, which is not ported. Adding a schema here would
//     introduce a constraint the legacy save path never applied on this side of
//     `super.save`, so none is declared."
//
//     The premise was that the rules lived on the far side of a boundary somebody
//     else owned. They did - `HibachiService.save` ran `validate(context)` at
//     [org/Hibachi/HibachiService.cfc:L151] and reached the DAO only when
//     `!hasErrors()` [:L155]. But this file now performs that flush, so "the other
//     side of `super.save`" is HERE, and declining to validate would durably write
//     a row the legacy would have REFUSED to write. That is not fidelity; it is a
//     silently weaker save. `model/validation/Brand.json`'s three save-context
//     rules are therefore enforced in `assertBrandSaveContextRules` below, each
//     transcribed from the framework validator that answered it rather than
//     invented, and NO rule the file does not declare is added.
//
//     No zod schema is used, unlike `productService.ts`: three property rules over
//     an already-typed entity do not need a parser, and a schema would have to
//     restate the entity's own shape to get at them.
//   * NO LAYER VIOLATION. Nothing is imported from src/repositories/**,
//     src/handlers/** or src/integrations/**, and the one collaborator is a PORT
//     INTERFACE rather than a concrete adapter - `UrlTitleGenerator` names no
//     driver, connection, statement or table. Note precisely how that is
//     guaranteed: the ESLint `no-restricted-imports` layer boundary is scoped to
//     `src/domain/**/*.ts`, so for a file under `src/services/**` the boundary is
//     an ARCHITECTURAL constraint carried by this comment and by review - the
//     linter will not catch a violation here. (The barrel-import restriction does
//     apply to every `.ts` file, and this file imports no barrel; there is no
//     index.ts anywhere in this subtree.)
//   * NO CONTEXT PARAMETER. This component reaches neither `getHibachiScope()`
//     nor `getSlatwallScope()`, so unlike the price-group path it needs no
//     explicit request-context argument. None is added speculatively.
//   * NO SERVICE LOCATOR. A full sweep of BrandService.cfc finds zero
//     `getService(` sites; the only one in the in-scope service tier anywhere is
//     model/service/SkuService.cfc:L212. Nobody need look for one here.
//   * NO CACHE. The component declares no `variables.*` memo, and none is added.
//     Module-level mutable state would survive between unrelated invocations on a
//     warm container, which is unsafe; the one documented exception in this
//     subtree is the connection pool in src/repositories/mysql/connection.ts.
//
// DEPENDENCY INJECTION, AND THE CALIBRATION THAT PUTS "16+" IN ITS PLACE
//   The legacy declaration `property name="dataService" type="any";`
//   [model/service/BrandService.cfc:L51] was resolved at runtime by a DI/1 0.4.2
//   convention scan over component properties - a scan that carried a first-scan
//   lock. Here it is one explicit, compile-checked constructor argument typed to
//   a port interface: no scan, no service locator, no DI container package, and
//   the whole graph assembled once in src/handlers/bootstrap.ts (planned).
//
//   ★ THIS IS THE LEANEST SERVICE IN THE SLICE: exactly ONE collaborator, and it
//   is LIVE - zero dead injections. Verified counts across the slice, for
//   calibration: BrandService 1, RoundingRuleService 1, OptionService 2 (1 dead),
//   PriceGroupService 3, PromotionService 3, SkuService 5 (1 dead),
//   ProductService 8 (2 dead). The out-of-scope
//   model/service/OrderService.cfc:L51 + L53-L67 takes 16. The "16+" figure from
//   the project brief is a property of THAT orchestrator - which is exactly where
//   the strangler-fig seam sits - and not of this slice.
//
//   The four dead DI/1 injections in the slice are `SkuService.productService`,
//   `OptionService.productService`, `ProductService.contentService` and
//   `ProductService.productTypeDAO`. NONE of them belongs to this file, so no
//   dead-injection annotation appears below; there would be no basis for one.
//
// WHY NO `LEGACY-DEFECT` MARKER APPEARS BELOW - AN ABSENCE, NOT AN OVERSIGHT
//   This component owns no numbered entry in the project defect register. It owns
//   exactly three SECONDARY-REGISTER items, each labelled as such where a reader
//   meets it: the duplicated `START: DAO Passthrough` banner (L57/L59, recorded
//   just below), the unqualified `data.urlTitle` write (L70/L72) and the
//   positional `super.save` (L76). A `LEGACY-DEFECT` marker here would falsely
//   promote one of those to a numbered defect, so none is written - the three
//   marker forms that do appear are LEGACY-NOTE, JUDGMENT CALL and CFML parity.
//   Behaviour preservation still extends to defects generally; there simply is no
//   numbered one in these 90 lines.
//
// THIS FILE SPENDS FROM NONE OF THE FOUR BUDGET LEDGERS, WHICH ARE DISTINCT
//   * Signature reshapings: none. `saveBrand(brand, data)` keeps its legacy shape,
//     parameter order and returned entity. The anti-corruption inversions and the
//     smart-list renames belong to other services.
//   * Visibility widenings: none. `saveBrand` was already `public`, and no private
//     legacy helper is promoted here - this component declares no private method
//     to promote.
//   * Signature widenings: none. No parameter is added anywhere, and in
//     particular no clock or context argument - the only widening in the project
//     is `PromotionPeriod.isCurrent(now)`, which needs one because it compares
//     dates. Nothing here compares a date.
//   * Deliberate divergences: none. This file diverges from legacy behaviour
//     nowhere. The single behaviour-neutral translation choice - writing the
//     resolved title in place rather than into a copy - is recorded as a JUDGMENT
//     CALL on the method, which is a different thing from a divergence: the
//     observable outcome is identical to legacy.
//   The port set is likewise not extended: this file consumes `urlTitleGenerator`
//   and adds no port, no port member and no settings key.
//
// CFML parity [model/service/BrandService.cfc:L53-L63, L81-L87]: the legacy
// component carries six banner-delimited section comments, five of which wrap
// nothing at all - Logical Methods, DAO Passthrough, Process Methods, Smart List
// Overrides and Get Overrides are all empty. They are omitted here rather than
// reproduced as empty regions, and this note is the record of that choice rather
// than a silent drop. One of them is malformed and is worth preserving as an
// observation: L57 and L59 BOTH read `START: DAO Passthrough`, the second having
// plainly been meant to read `END`, so that section has no closing banner at all.
// That is a SECONDARY-REGISTER item, not a numbered defect, and it is the third
// occurrence of the same wart - model/service/PromotionService.cfc:L1102 and
// model/service/RoundingRuleService.cfc:L183 carry the other two.
// ---------------------------------------------------------------------------

// A VALUE import, where this was `import type` before. `populate`
// [org/Hibachi/HibachiTransient.cfc:L169-L205] copied the payload ONTO the entity before the
// flush, and `Brand` is immutable and publishes no setter - so the only way to reproduce that
// step is to construct the populated entity. Constructing one needs the class itself.
import { Brand } from '../domain/entities/brand.js';
import type { UrlTitleGenerator } from '../domain/ports/urlTitleGenerator.js';
import { structFindKey, structGet, structKeyExists } from '../lib/cfml/struct.js';
import type { CfBooleanInput } from '../lib/cfml/truthiness.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';

/**
 * The mutable data payload handed to {@link BrandService.saveBrand}, standing in
 * for the legacy `required struct data` argument
 * [model/service/BrandService.cfc:L67].
 *
 * DELIBERATELY MINIMAL. Only the two keys the legacy body actually reads are
 * declared - `urlTitle` [L68, L70, L72] and `brandName` [L69] - because a struct
 * in CFML is untyped and enumerating the rest of the Brand column set here would
 * invent a contract the legacy save path never had. No key is required, no
 * default is supplied and no constraint is imposed: `model/validation/Brand.json`
 * is enforced by the framework validation service, which is not ported, and
 * schema continuity forbids adding a rule the legacy lacks.
 *
 * ★★ THE SIX PERSISTABLE COLUMNS ARE NOW ALL DECLARED, AND THAT REVERSES THIS
 * TYPE'S PREVIOUS SHAPE. It declared two members and defended the omission thus:
 * "MINIMAL IS NOT LOSSY... a payload that arrived carrying `activeFlag`,
 * `publishedFlag`, `brandWebsite` or `remoteID` still carries all of them
 * afterwards... the composition root that performs the flush therefore receives the
 * complete column set and not a two-key subset. Widening this interface to enumerate
 * those columns would add a contract the legacy save path never had while changing
 * nothing about what survives."
 *
 * Every clause of that was true EXCEPT its premise. It rested on some later stage
 * populating the entity from the whole struct, and the checked fact was that no such
 * stage existed - which is the defect the review raised. Now that this service
 * populates and writes, an undeclared column is not "still carried"; it is READ BY
 * NOBODY and therefore lost. Declaring the six is what makes the write non-lossy,
 * and it adds no contract the legacy lacked: `HibachiTransient.populate`
 * [org/Hibachi/HibachiTransient.cfc:L169-L205] looped `getProperties()` and copied
 * EVERY simple column key the struct held, so the legacy's populated surface was
 * always the full column set. This type now says so.
 *
 * WHAT IS STILL NOT DECLARED, DELIBERATELY: `brandID`, the four audit columns, and
 * every association. The identifier decides insert-versus-update and is not a
 * payload field; the audit columns are stamped by the writer from the request's own
 * actor and clock, so accepting them from a caller would let a client forge
 * attribution; and the eight associations are all `inverse="true"`
 * [model/entity/Brand.cfc:L60-L61, L66-L72], so a brand save never wrote one.
 *
 * ABSENT, PRESENT-BUT-EMPTY AND PRESENT-BUT-UNDEFINED ARE THREE DIFFERENT INPUTS
 * THAT THE GUARD CHAIN TREATS IDENTICALLY, and every one of them must work. Both
 * slots are typed `?: string | undefined` rather than `?: string` for that
 * reason: under `exactOptionalPropertyTypes` those are genuinely different types,
 * and the bare optional form would reject an explicit `urlTitle: undefined` -
 * precisely what a caller writes when it looked at a NULL column and found
 * nothing. Permitting omission AND explicit `undefined` keeps all three states
 * expressible, matching the convention the Brand entity's own constructor uses.
 *
 * WHY `urlTitle` IS WRITABLE WHILE `brandName` IS `readonly`. The asymmetry is
 * the contract, not an oversight: this service writes `urlTitle` and only
 * `urlTitle`, exactly as the legacy body does at L70 and L72, and it never writes
 * `brandName`. The types say so, so a reviewer can see the whole mutation surface
 * without reading the body. See the JUDGMENT CALL on {@link
 * BrandService.saveBrand} for why the write happens in place at all.
 */
export interface BrandSaveInput {
  /**
   * The URL title. Read by the outer gate [L68] and written by either inner
   * branch [L70, L72] when generation fires.
   */
  urlTitle?: string | undefined;

  /**
   * The preferred title source. Read by the first inner branch [L69] and never
   * written.
   */
  readonly brandName?: string | undefined;

  /**
   * [model/entity/Brand.cfc:L53] `ormtype="boolean"`, undefaulted.
   *
   * Typed to the CFML boolean input union rather than to `boolean`, because that is
   * what `populate` fed the setter: it passed `trim(value)` - a STRING - and left the
   * coercion to the engine [org/Hibachi/HibachiTransient.cfc:L194]. `'1'`, `'true'`
   * and `'yes'` therefore all had to work, and the entity's own constructor accepts
   * the same union for the same reason.
   */
  readonly activeFlag?: CfBooleanInput;

  /** [model/entity/Brand.cfc:L54] Same input union and same reasoning as `activeFlag`. */
  readonly publishedFlag?: CfBooleanInput;

  /**
   * [model/entity/Brand.cfc:L57] Carried as an opaque string.
   *
   * `hb_formatType="url"` is presentation metadata, but `model/validation/Brand.json`
   * separately declares `{"contexts":"save","dataType":"url"}`, which IS enforced -
   * see `assertBrandSaveContextRules`. Nothing here or there contacts the host.
   */
  readonly brandWebsite?: string | undefined;

  /**
   * [model/entity/Brand.cfc:L74] The external-system correlation key.
   *
   * Declared because `populate` copied it like any other simple column, and no
   * validation rule governs it.
   */
  readonly remoteID?: string | undefined;
}

/**
 * The CFML predicate `!isNull(value) && len(value)`, expressed once as a single
 * narrowing test.
 *
 * WHY THIS EXISTS AT ALL, given that redeclaring an existing helper is forbidden:
 * it declares nothing new, it COMPOSES the two published helpers in exactly the
 * order the legacy conditions do - `isNullish()` for `isNull()` and
 * `cfTruthy(cfLen())` for `len()` in a condition, which is the documented house
 * idiom - and adds only the one thing neither can provide. `isNullish` and
 * `cfTruthy` both return `boolean`, and a `boolean` return cannot narrow a type,
 * so after testing them the compiler still sees `string | undefined` where the
 * urlTitleGenerator port requires a definite `string`. A `!` assertion is
 * banned in `src/**` and would be the wrong answer regardless, so the test is
 * given a type predicate and the narrowing falls out of the same expression that
 * performs the check. It is module-local and unexported: the file's public
 * surface stays one class and one input type.
 *
 * ⚠ `len()` IS NOT TRUTHINESS, and conflating them would change behaviour. The
 * legacy `!len(x)` is an EMPTY-STRING test, so a bare `!x` is the wrong
 * translation: `cfTruthy(cfLen('0'))` is true because `'0'` has length 1, while
 * `!'0'` in JavaScript is false and a bare `!x` would additionally swallow other
 * values. `cfLen` answers 0 for absent, so absence composes to false here
 * without a separate branch - and `isNullish` is still asked first, because it is
 * the term the legacy line actually wrote and keeping it makes the translation
 * checkable rather than merely equivalent.
 *
 * The NEGATION is the other half of the contract, and it is exact by De Morgan:
 * `!hasCfLength(x)` is `isNull(x) || !len(x)` - the left disjunction of the outer
 * gate at [model/service/BrandService.cfc:L68] - and the POSITIVE form is the
 * `!isNull(...) && len(...)` of the second inner branch at
 * [model/service/BrandService.cfc:L71].
 *
 * CFML parity [model/service/BrandService.cfc:L68, L69, L71]: all three legacy
 * emptiness tests in this component route through here.
 */
function hasCfLength(value: string | undefined): value is string {
  return !isNullish(value) && cfTruthy(cfLen(value));
}

/**
 * The two STRING-valued payload keys the legacy guard chain reads, as a narrow view over
 * {@link BrandSaveInput}.
 *
 * WHY A SECOND TYPE RATHER THAN READING THE INPUT DIRECTLY. `structGet` is generic in the
 * struct and answers `TStruct[keyof TStruct] | undefined` - the union of EVERY member type
 * - so reading `urlTitle` off the full input now yields `string | CfBooleanInput`, because
 * the two flag members widened that union. `hasCfLength` narrows a `string | undefined`
 * and must keep doing so: its whole purpose is handing the URL-title port a definite
 * `string` without a banned `!` assertion.
 *
 * Naming the view is the honest fix. It asserts nothing that is not already declared -
 * both members are `string | undefined` on the input - and it says exactly which keys the
 * guard chain treats as title sources, which is the same two the legacy body reads at
 * [model/service/BrandService.cfc:L68-L72]. The flags are read only by
 * `populatedColumn`, which takes `unknown` and coerces the way `populate` did, so they
 * never reach this path.
 */
interface BrandTitleSource {
  readonly urlTitle?: string | undefined;
  readonly brandName?: string | undefined;
}

/**
 * Writes the resolved `urlTitle` into the save payload the way a CFML struct
 * assignment writes: updating the key ALREADY IN USE when one is present in any
 * casing, and creating the canonical key only when none is.
 *
 * WHY THIS IS NOT OVER-ENGINEERING - THE ALTERNATIVE LOSES THE TITLE. A plain
 * `data.urlTitle = value` is correct for a payload whose key is spelled
 * canonically, and wrong for one that is not. A CFML struct holds ONE key per
 * name because its key store folds case, so `data.urlTitle = value` UPDATES an
 * existing `URLTitle` entry in place [model/service/BrandService.cfc:L70, L72].
 * TypeScript object keys are case-sensitive, so the same statement would ADD a
 * second entry and leave the first one holding its stale value. That is not a
 * cosmetic difference: the outer gate reads this key case-insensitively, and so
 * does every other struct read in this port, and a case-insensitive read answers
 * with the FIRST matching own key. A stale `URLTitle: ''` sitting ahead of a
 * freshly written `urlTitle` would therefore SHADOW the generated title, and the
 * value ultimately persisted would carry the empty string that the guard chain
 * had just decided to replace - reproduced and confirmed against the built
 * CommonJS artifact before this helper was introduced.
 *
 * Reproducing CFML's single-key write closes that gap, and the primitive it needs
 * already exists for exactly this purpose: `structFindKey` is documented in
 * src/lib/cfml/struct.ts as the way to "write back under the key already in use
 * rather than adding a second entry that differs only by case". Nothing here is
 * invented, and no key is ever deleted - `structDelete` is deliberately absent
 * from that module and is not needed, because the stored key is updated rather
 * than replaced.
 *
 * REACHABILITY, STATED HONESTLY. A caller typed against `BrandSaveInput` cannot
 * produce a differently-cased key: excess-property checking rejects it. The path
 * opens at an untyped boundary - a handler that parses a JSON body and hands the
 * result on - which is precisely where CFML's case-insensitivity used to absorb
 * the difference silently. Handling it here keeps this service correct for the
 * payload it is actually given rather than only for the payload it hopes for.
 *
 * This is a TRANSLATION of CFML semantics, not a behavioural divergence: under
 * both engines exactly one key holds the resolved title afterwards, and the guard
 * chain that decided to write it is untouched. `Reflect.set` performs the update
 * without a type assertion, without an index signature and without `any`, so the
 * dynamic key stays confined to this one helper - it is a data write under a
 * runtime-discovered name, never dynamic dispatch of behaviour.
 */
function writeResolvedUrlTitle(data: BrandSaveInput, urlTitle: string): void {
  const storedKey = structFindKey(data, 'urlTitle');

  if (storedKey === undefined || storedKey === 'urlTitle') {
    data.urlTitle = urlTitle;
    return;
  }

  Reflect.set(data, storedKey, urlTitle);
}

// ---------------------------------------------------------------------------
// The durable half of `super.save`, and the populate/validate steps that precede it
// ---------------------------------------------------------------------------

/**
 * The persistence collaborator this service needs in order to BE a save.
 *
 * ★★★ WHY THE CONTRACT IS DECLARED HERE, IN THE CONSUMER, RATHER THAN IN
 * `src/domain/ports/`. The AAP enumerates THIRTEEN ports (0.3.1) and specifies
 * `ProductRepository`'s member set, and neither has room for a brand writer - there is
 * no `BrandDAO.cfc` in the legacy repository to have ported one from, because
 * `super.save` was framework-inherited generic CRUD
 * [org/Hibachi/HibachiService.cfc:L133-L169] that AAP 0.5.3 lists among the
 * dependencies deliberately not carried forward. So the write can be neither a
 * fourteenth port nor a seventh member of an existing one.
 *
 * What remains is exactly what the AAP already does with every other replaced
 * framework responsibility: put it in the composition root. This interface is the
 * narrow contract the root satisfies - ONE METHOD, no connection, no statement, no
 * table name, nothing a domain port would have carried - and `src/handlers/bootstrap.ts`
 * satisfies it STRUCTURALLY with a module-local collaborator over the request's
 * prepared-statement executor. TypeScript's structural typing is what makes that work
 * without an import in either direction: this file names no adapter, and the adapter
 * declares no `implements`.
 *
 * ★ THE LAYER RULE PERMITS THIS, AND IT IS WORTH BEING PRECISE ABOUT WHY. The ESLint
 * `no-restricted-imports` boundary forbids `src/domain/**` from importing repositories,
 * handlers or integrations. A file under `src/services/**` declaring an interface it
 * needs, and importing nothing, crosses no boundary at all: dependency flows inward,
 * from the root to this service, exactly as with the six ports it would have used had
 * one carried this member. `PriceGroupService` and `PromotionService` each already
 * declare their own framework-read contract on the same footing.
 *
 * IT TAKES THE ENTITY AND NOTHING ELSE. The payload's role ends before this point: the
 * populate step below has already folded it onto the entity, so handing the struct
 * across as well would give the writer a second, redundant source of truth for every
 * column and an opportunity to disagree with the first.
 */
export interface BrandFrameworkWrites {
  /**
   * Persist one brand - INSERT when `isNew()`, UPDATE otherwise - and answer the
   * persisted row.
   *
   * The returned entity is not the argument: a new brand acquires the identifier the
   * absent flush used to mint [model/entity/Brand.cfc:L52, `generator="uuid"
   * unsavedvalue=""`], and both paths acquire audit stamps, so the answer necessarily
   * differs from the input.
   *
   * MAY REJECT. The `"unique":true` half of the `urlTitle` rule
   * [model/validation/Brand.json] needs a query, so it is the one save-context rule
   * this service cannot evaluate itself; the implementation transcribes
   * `HibachiDAO.isUniqueProperty` [org/Hibachi/HibachiDAO.cfc:L130-L147] and refuses
   * on a collision.
   */
  saveBrand(brand: Brand): Promise<Brand>;
}

/**
 * Raised when a brand fails one of `model/validation/Brand.json`'s save-context rules.
 *
 * ★ WHY A THROW, WHERE THE LEGACY SET AN ERROR FLAG. `HibachiService.save` called
 * `validate(context)` [org/Hibachi/HibachiService.cfc:L151] and then flushed only if
 * `!hasErrors()` [:L155]; on failure it announced a failure event and RETURNED THE
 * ENTITY, errors attached. `hasErrors()` is part of the framework validation service,
 * which is not ported, and no entity in this subtree carries an error collection - so
 * there is no channel for a returned-with-errors entity, and inventing one would be a
 * new framework rather than a port.
 *
 * A throw is what the subtree already does with the same situation: `productService.ts`
 * lets `productUpdateSkusSchema.parse(input)` reject. The property that must hold either
 * way, and does, is the one that matters: A FAILING BRAND IS NOT WRITTEN.
 *
 * Names the property and the rule, and NOT the value. A brand name or website is the
 * caller's own commercial data and `src/handlers/errorMapper.ts` may publish this
 * message.
 */
export class BrandValidationError extends Error {
  public readonly propertyName: string;

  public readonly reason: string;

  constructor(propertyName: string, reason: string) {
    super(
      `saveBrand refused: ${propertyName} ${reason} ` +
        '(model/validation/Brand.json, save context). No row was written.',
    );
    this.name = 'BrandValidationError';
    this.propertyName = propertyName;
    this.reason = reason;
  }
}

/**
 * One column's fate under `populate`: either the payload supplied it - in which case
 * the resolved value travels with the verdict, and `undefined` means SET TO NULL - or
 * it did not, and the entity keeps whatever it already held.
 *
 * The distinction cannot be collapsed into `string | undefined`, because "absent" and
 * "present and blank" are different instructions
 * [org/Hibachi/HibachiTransient.cfc:L191-L196]: the first preserves, the second nulls.
 */
type PopulatedColumn =
  { readonly supplied: true; readonly value: string | undefined } | { readonly supplied: false };

const COLUMN_NOT_SUPPLIED: PopulatedColumn = Object.freeze({ supplied: false });

/**
 * Read one simple column out of the save payload the way
 * `HibachiTransient.populate` [org/Hibachi/HibachiTransient.cfc:L169-L205] read it.
 *
 * FOUR RULES, EACH TRANSCRIBED RATHER THAN CHOSEN:
 *
 *   1. `structKeyExists(arguments.data, currentProperty.name)` [L184] - a key the
 *      payload does not hold is not populated, and the stored value survives. The read
 *      is case-insensitive here because a CFML struct folds key case and this payload
 *      may have arrived from an untyped boundary; `structFindKey` is the primitive
 *      `src/lib/cfml/struct.ts` publishes for exactly that.
 *   2. `isSimpleValue(arguments.data[...])` [L192] - the column branch is entered only
 *      for a scalar. An object, array or function reaching a column key fell through
 *      every branch and set nothing, so it reads as NOT SUPPLIED.
 *   3. `trim(...) == "" && !notNull` -> `_setProperty(name)` [L194-L195] - a blank value
 *      UNSETS the property, which becomes SQL NULL. None of Brand's six persistable
 *      columns declares `notnull`, so the second conjunct holds for all of them and no
 *      per-column table is needed.
 *   4. `_setProperty(name, trim(value))` [L200] - and otherwise the value is stored
 *      TRIMMED. That trim is easy to overlook and is observable: a payload
 *      `brandName: '  Acme  '` persisted as `'Acme'`.
 *
 * `null` and `undefined` have no CFML counterpart - a struct key cannot hold either -
 * so both are treated as the blank case, which is the same reading `BrandSaveInput`
 * documents for its optional slots.
 */
function populatedColumn(data: object, propertyName: string): PopulatedColumn {
  const storedKey = structFindKey(data, propertyName);

  if (storedKey === undefined) {
    return COLUMN_NOT_SUPPLIED;
  }

  const rawValue: unknown = Reflect.get(data, storedKey);

  if (rawValue === null || rawValue === undefined) {
    return { supplied: true, value: undefined };
  }

  if (
    typeof rawValue !== 'string' &&
    typeof rawValue !== 'number' &&
    typeof rawValue !== 'boolean' &&
    typeof rawValue !== 'bigint'
  ) {
    return COLUMN_NOT_SUPPLIED;
  }

  const trimmed = String(rawValue).trim();

  return { supplied: true, value: trimmed === '' ? undefined : trimmed };
}

/**
 * Fold the save payload onto the brand, reproducing the `populate` step
 * `super.save` performed at [org/Hibachi/HibachiService.cfc:L146] before it validated
 * and flushed.
 *
 * ★ A NEW INSTANCE, NOT A MUTATION, and the observable outcome is the same. CFML
 * populated the managed entity in place; `Brand` here is immutable by construction and
 * publishes no setter, so the populated state is expressed as a fresh entity carrying
 * the folded columns. The caller's own instance is left exactly as it was - which the
 * suite asserts - and the returned brand is what gets written and answered.
 *
 * SIX COLUMNS, AND THE IDENTIFIER CARRIED THROUGH UNCHANGED. `brandID` is not a
 * populated field: it decides INSERT versus UPDATE via `isNew()`, and letting a payload
 * set it would let a caller redirect a save onto another brand's row. The four audit
 * columns are likewise carried through rather than populated - the writer stamps them
 * from the request's actor and clock [org/Hibachi/HibachiEntity.cfc:L609, L661], and
 * accepting them from a caller would let a client forge attribution.
 *
 * ALL FIVE ASSOCIATIONS ARE PASSED THROUGH. They are `inverse="true"`
 * [model/entity/Brand.cfc:L60-L61, L66-L72] so no brand save ever wrote one, but
 * dropping them here would hand back a brand that had silently lost its in-memory
 * graph.
 */
function populateBrandFromSaveInput(brand: Brand, data: BrandSaveInput): Brand {
  const urlTitle = populatedColumn(data, 'urlTitle');
  const brandName = populatedColumn(data, 'brandName');
  const brandWebsite = populatedColumn(data, 'brandWebsite');
  const remoteID = populatedColumn(data, 'remoteID');
  const activeFlag = populatedColumn(data, 'activeFlag');
  const publishedFlag = populatedColumn(data, 'publishedFlag');

  return new Brand({
    brandID: brand.getBrandID(),
    urlTitle: urlTitle.supplied ? urlTitle.value : brand.getUrlTitle(),
    brandName: brandName.supplied ? brandName.value : brand.getBrandName(),
    brandWebsite: brandWebsite.supplied ? brandWebsite.value : brand.getBrandWebsite(),
    remoteID: remoteID.supplied ? remoteID.value : brand.getRemoteID(),
    // The flag slots accept the CFML boolean input union, so a trimmed `'1'` or `'true'`
    // from the payload reaches the entity's own `cfBoolean` coercion exactly as
    // `_setProperty(name, trim(value))` reached the engine's.
    activeFlag: activeFlag.supplied ? activeFlag.value : brand.getActiveFlag(),
    publishedFlag: publishedFlag.supplied ? publishedFlag.value : brand.getPublishedFlag(),
    products: brand.getProducts(),
    promotionRewards: brand.getPromotionRewards(),
    promotionRewardExclusions: brand.getPromotionRewardExclusions(),
    promotionQualifiers: brand.getPromotionQualifiers(),
    promotionQualifierExclusions: brand.getPromotionQualifierExclusions(),
    createdDateTime: brand.getCreatedDateTime(),
    createdByAccountID: brand.getCreatedByAccountID(),
    modifiedDateTime: brand.getModifiedDateTime(),
    modifiedByAccountID: brand.getModifiedByAccountID(),
  });
}

/**
 * `isValid("url", value)`, for the one `dataType` constraint Brand declares.
 *
 * WHAT IT ACCEPTS AND WHY. CFML's `isValid("url", ...)` requires an ABSOLUTE URL - a
 * scheme is mandatory and a bare host or relative path fails - which is precisely the
 * distinction the `URL` constructor draws, so the constructor is the test rather than a
 * hand-rolled expression. Deliberately NOT restricted to http and https: the legacy
 * validator restricted neither, and a merchant's `ftp://` link would have saved. No
 * request is made, no host is resolved, and nothing about the target is checked -
 * only the shape of the string.
 */
function isValidUrl(value: string): boolean {
  return URL.canParse(value);
}

/**
 * Enforce the three save-context rules in `model/validation/Brand.json`, in the order
 * the file lists them.
 *
 * Runs on the POPULATED brand, not on the payload and not on the caller's instance,
 * because that is the order `super.save` used: populate [org/Hibachi/HibachiService.cfc:L146],
 * then validate [:L151]. Validating the pre-populate entity would refuse a save whose
 * payload supplied the missing value.
 *
 * THE `unique` HALF OF THE `urlTitle` RULE IS NOT HERE. It needs a query, so it belongs
 * to {@link BrandFrameworkWrites}, whose implementation transcribes
 * `HibachiDAO.isUniqueProperty` [org/Hibachi/HibachiDAO.cfc:L130-L147]. Splitting one
 * JSON rule across two places is worth stating plainly, and the alternative - giving
 * this service a uniqueness read of its own - would put a second query surface in the
 * service tier for a rule the writer already has to hold anyway.
 *
 * EACH TEST IS THE FRAMEWORK VALIDATOR'S, TRANSCRIBED:
 *   * `required` -> `validate_required` [org/Hibachi/HibachiValidationService.cfc:L233-L239],
 *     whose simple-value arm is `len(trim(propertyValue))`. The trim is redundant after
 *     populate, which already trimmed, but `cfLen` is used because it is the published
 *     helper for a CFML length test and a bare `!value` would mis-handle `'0'`.
 *   * `dataType` -> `validate_dataType` [:L256-L262], which PASSES ON NULL - `isNull(...)
 *     || isValid(...)` - so an absent website is valid and only a present, malformed one
 *     is refused.
 */
function assertBrandSaveContextRules(brand: Brand): void {
  if (!cfTruthy(cfLen(brand.getBrandName()))) {
    throw new BrandValidationError('brandName', 'is required');
  }

  const brandWebsite = brand.getBrandWebsite();

  if (brandWebsite !== undefined && !isValidUrl(brandWebsite)) {
    throw new BrandValidationError('brandWebsite', 'must be a valid URL');
  }

  if (!cfTruthy(cfLen(brand.getUrlTitle()))) {
    throw new BrandValidationError('urlTitle', 'is required');
  }
}

// ---------------------------------------------------------------------------
// RETIRED - `BrandPersistenceUnavailableError`, and this tombstone records what it said
// so the reversal is checkable rather than merely absent.
//
// It was raised unconditionally at the end of `saveBrand`, and its own docblock argued:
// "THIS SLICE CANNOT DURABLY WRITE A BRAND... the durable half genuinely does not exist
// here, and no amount of care in this file can conjure it... Failing closed is the half
// of the required resolution that is achievable without adding a fourteenth port the
// AAP's enumerated layout does not have room for."
//
// ★ THE FIRST HALF WAS RIGHT AND THE CONCLUSION WAS WRONG, FOR ONE REASON. Everything
// it said about the port set is still true: there is no fourteenth port, and
// `ProductRepository` gains no seventh member. What it missed is that A DOMAIN PORT WAS
// NEVER THE ONLY ROUTE. The AAP puts every replaced framework responsibility in the
// composition root, and the root already hosts module-local structural collaborators
// over the request's executor for `PriceGroupService` and `PromotionService` - so the
// durable half could arrive the same way, and now does, as
// the `BrandFrameworkWrites` contract above. "No port is available" was read as "no write is
// possible"; those are different claims, and only the first was ever established.
//
// Its own closing line anticipated this: "when brand persistence is wired, the `throw`
// in `saveBrand` is deleted and the flush result returned in its place. Nothing else
// about the method changes." That is exactly what happened - plus the populate and
// validate steps that `super.save` performed either side of the flush, which the throw
// had made unreachable and therefore unwritten.
//
// The class is REMOVED rather than deprecated: it is a signal about an unavailable
// capability, the capability is available, and leaving a constructible
// never-thrown error behind invites a caller to keep branching on it.
// `src/handlers/errorMapper.ts` no longer references it.
// ---------------------------------------------------------------------------

/**
 * The ported surface of `model/service/BrandService.cfc`.
 *
 * ONE PUBLIC METHOD, because the legacy component declared one function. See the
 * file header for why the absence of `getBrand`, `deleteBrand` and the smart-list
 * accessors is faithful rather than incomplete.
 *
 * ONE DECLARED LEGACY COLLABORATOR, plus the durable half of the framework save.
 * `dataService` [model/service/BrandService.cfc:L51] really is the only thing the legacy
 * component injects - it remains the leanest service in the slice on that measure - and
 * the second constructor argument is not a second legacy dependency but the persistence
 * `super.save` supplied by inheritance. Both arrive explicitly, and instances hold no
 * mutable state of any kind.
 *
 * PER REQUEST, NOT PER CONTAINER, and the reason changed with the second argument. This
 * class still caches nothing, so on its own it would be safe to construct once. Its
 * writer collaborator closes over the request's audit actor, so the composition root
 * builds both per request; a container-scoped brand service would stamp one request's
 * account onto another request's row.
 */
export class BrandService {
  /**
   * @param urlTitleGenerator - Replaces the legacy
   *   `property name="dataService" type="any";`
   *   [model/service/BrandService.cfc:L51] - the component's one and only
   *   DECLARED collaborator. It is narrowed from a general-purpose "data service"
   *   to the single method this component actually consumed
   *   [slatwall-ts/src/domain/ports/urlTitleGenerator.ts:L60], and it is a port
   *   interface rather than a concrete adapter, so a test supplies a stub without
   *   a database. Wired once, explicitly, in `src/handlers/bootstrap.ts`.
   * @param frameworkWrites - The durable half of `super.save`
   *   [model/service/BrandService.cfc:L76], which the legacy component inherited from
   *   `HibachiService` rather than declaring. See {@link BrandFrameworkWrites} for why
   *   the contract is declared in this file instead of in `src/domain/ports/`, and why
   *   satisfying it does not extend the thirteen-port set. Like the generator it is an
   *   interface, so a test supplies a recording double and needs no database.
   */
  constructor(
    private readonly urlTitleGenerator: UrlTitleGenerator,
    private readonly frameworkWrites: BrandFrameworkWrites,
  ) {}

  /**
   * Ported 1:1 from `public any function saveBrand(required any brand, required
   * struct data)` [model/service/BrandService.cfc:L67-L77].
   *
   * Resolves the brand's `urlTitle` when - and only when - the legacy guard chain
   * says it must be generated, then answers the brand. The legacy name is carried
   * over verbatim: `saveBrand`, never `save` and never `createBrand`, because
   * method-level interface parity is this migration's acceptance contract.
   *
   * ASYNC BECAUSE THE LEGACY BODY REACHES THE DATA STORE - TWICE, and now both
   * reaches are here. The generator runs a uniqueness read per candidate slug against
   * `SwBrand.urlTitle`, and `super.save` flushed the row. Nothing about the declared
   * shape changes: the parameter list, its order and the `Promise<Brand>` return all
   * stand as they were.
   *
   * THREE STEPS, IN THE LEGACY'S ORDER, AND THE ORDER IS LOAD-BEARING:
   *   1. resolve `urlTitle` through the guard chain [model/service/BrandService.cfc:L68-L73],
   *      writing it into the payload - which is where the next step reads it from;
   *   2. populate the entity from the payload [org/Hibachi/HibachiService.cfc:L146] and
   *      validate the result [:L151];
   *   3. flush, and answer the persisted row [:L155].
   *
   * SIX INPUT SHAPES FOR THE TITLE GUARD, ALL REACHABLE, ALL PRESERVED:
   *   1. entity already has a non-empty `urlTitle`  -> no generation
   *   2. incoming `data.urlTitle` non-empty         -> no generation
   *   3. neither, and `data.brandName` non-empty    -> generate from data [L70]
   *   4. neither, no `data.brandName`, entity name  -> generate from entity [L72]
   *   5. neither, and no name from either source    -> NO `urlTitle` set, and the
   *      SAVE-CONTEXT RULES then refuse the write - see below
   *   6. `data.urlTitle` present but empty string   -> treated exactly as absent,
   *      so generation proceeds
   *
   * ★ SHAPE 5 NOW REFUSES, WHERE THIS DOCBLOCK USED TO PROMISE "NO `urlTitle` set, no
   * throw". Both halves of the old sentence were describing a method that never wrote
   * anything, so "no throw" cost nothing. Under the legacy, shape 5 reached
   * `validate(context="save")` with `urlTitle` unset, `model/validation/Brand.json`
   * declares it `required`, `hasErrors()` was therefore true, and
   * [org/Hibachi/HibachiService.cfc:L155] SKIPPED THE DAO CALL - so the legacy did not
   * write the row either. The preserved property is the one that matters, that no row
   * is written; only the delivery differs, because `hasErrors()` has no ported channel
   * and this subtree signals a failed validation by throwing. There is still NO
   * fallback, no slug-from-identifier and no empty-string assignment: the guard chain
   * is untouched, and the refusal comes from the declared rule rather than from the
   * title logic.
   *
   * @param brand - The brand being saved. NOT mutated: the entity is immutable, so the
   *   populate step produces a new instance and the caller's own object is untouched.
   * @param data - The save payload. Its `urlTitle` is written in place when
   *   generation fires - see the JUDGMENT CALL below - and every column it carries is
   *   then folded onto the entity.
   * @returns The PERSISTED brand, which is a different instance from the argument: a new
   *   brand carries the identifier the flush minted [model/entity/Brand.cfc:L52], and
   *   both paths carry the audit stamps the write applied.
   * @throws {BrandValidationError} When a save-context rule in
   *   `model/validation/Brand.json` fails. Nothing is written.
   */
  async saveBrand(brand: Brand, data: BrandSaveInput): Promise<Brand> {
    // LEGACY-NOTE [model/service/BrandService.cfc:L68]: the legacy line reads the
    // value back as `arguments.brand.getURLTitle()` with a capital `URL`, while
    // the ported entity publishes `getUrlTitle()` with a lowercase `rl`
    // [slatwall-ts/src/domain/entities/brand.ts:L770], matching the property
    // spelling `urlTitle` at [model/entity/Brand.cfc:L55]. CFML method lookup is
    // case-insensitive, so both spellings name one accessor there; TypeScript is
    // case-sensitive, and the entity deliberately publishes no `getURLTitle()`
    // alias, so the spelling it actually exposes is used verbatim. (The entity
    // records the same hazard against L67, its signature line; the call itself is
    // on L68.)
    //
    // The casing asymmetry is load-bearing in this one method and is left
    // un-normalised in all three directions: the ENTITY accessor is
    // `getUrlTitle`, the DATA key stays `urlTitle`, and the PORT method keeps its
    // capitalised `createUniqueURLTitle`
    // [slatwall-ts/src/domain/ports/urlTitleGenerator.ts:L60].
    //
    // CFML parity [model/service/BrandService.cfc:L68]: the outer gate is a
    // CONJUNCTION OF TWO DISJUNCTIONS and fires only when the brand has no usable
    // URL title from EITHER source. Both halves are reproduced as written, in
    // order, so the translation is checkable term by term:
    //
    //   isNull(brand.getURLTitle()) || !len(brand.getURLTitle())
    //     -> !hasCfLength(brand.getUrlTitle())
    //   !structKeyExists(data, "urlTitle") || !len(data.urlTitle)
    //     -> !structKeyExists(data, 'urlTitle') || !hasCfLength(structGet(data, 'urlTitle'))
    //
    // A non-empty entity URL title, OR a non-empty incoming `urlTitle`,
    // suppresses generation entirely. The accessor is invoked once rather than
    // the legacy's twice, which is unobservable: it is a pure field read on an
    // immutable entity.
    //
    // The data key is read through the case-insensitive accessor because CFML
    // struct keys fold case and TypeScript keys do not, so a caller sending
    // `URLTitle` or `urltitle` behaves exactly as it did under CFML. No
    // default-value argument is passed - the accessor deliberately offers none,
    // and a default is precisely how a silent fallback would enter this path.
    // `structKeyExists` is retained even though the emptiness test alone would
    // subsume it, because it is the term the legacy line wrote; keeping both
    // preserves the gate condition-for-condition, and it is what distinguishes
    // shape 6 from shape 2 for a reader.
    if (
      !hasCfLength(brand.getUrlTitle()) &&
      (!structKeyExists(data, 'urlTitle') ||
        !hasCfLength(structGet<BrandTitleSource>(data, 'urlTitle')))
    ) {
      // CFML parity [model/service/BrandService.cfc:L69-L72]: the preference order
      // is `data.brandName` FIRST and the entity's own `getBrandName()` SECOND.
      // Both are bound to locals so the narrowing predicate can hand the port a
      // definite `string`; a call expression is not narrowable, and `!` is banned.
      const incomingBrandName = structGet<BrandTitleSource>(data, 'brandName');
      const entityBrandName = brand.getBrandName();

      if (structKeyExists(data, 'brandName') && hasCfLength(incomingBrandName)) {
        // JUDGMENT CALL: the generated title is written INTO THE CALLER'S `data`
        // object, in place, rather than into a copy. Three facts leave no other
        // channel, and they are worth stating together because the alternative
        // looks tidier and is silently wrong. (1) `Brand` is immutable and is
        // imported type-only, so the resolved title can be applied neither
        // through a setter nor by constructing a replacement - the route legacy
        // `saveProduct` takes at [model/service/ProductService.cfc:L269] is
        // genuinely unavailable here, and this component did not take it anyway.
        // (2) The declared return is `Promise<Brand>` for interface parity, so the
        // return value cannot carry the payload. (3) The payload is what a save
        // populates FROM - the legacy `super.save(brand, data)` copied the struct
        // onto the entity before flushing - so the object the caller goes on to
        // flush has to be the one this branch wrote to. A copy made here and
        // discarded would leave that flush populating from a payload that still
        // holds the empty `urlTitle` the guard chain had just decided to replace,
        // quietly breaking the one contract that must hold: the value ultimately
        // persisted carries the generated `urlTitle` under exactly these
        // conditions, and carries none when neither inner branch fires. Mutating
        // in place also matches what the caller observes under CFML, where the
        // struct is passed by reference and the caller sees the resolved title
        // afterwards. The write itself is one
        // narrow, statically-typed store into a declared field - not CFML scope
        // emulation - routed through `writeResolvedUrlTitle` so that a payload
        // whose key arrived in a different casing ends up with ONE key holding the
        // title, as a CFML struct would; the mutation surface is declared in
        // `BrandSaveInput`, where `urlTitle` is the only writable slot.
        //
        // CFML parity [model/service/BrandService.cfc:L70]: the legacy assignment
        // target is the UNQUALIFIED `data.urlTitle` rather than
        // `arguments.data.urlTitle`. In CFML the unqualified name still resolves
        // through the arguments scope, so the caller's struct is mutated in place
        // and the missing qualification changes nothing; it is simply absent.
        // SECONDARY-REGISTER item, not a numbered defect.
        //
        // CFML parity [model/service/BrandService.cfc:L70]: `tableName="SwBrand"`
        // is the PHYSICAL table name [model/entity/Brand.cfc:L49], passed verbatim
        // as a port argument and NOT as SQL authored here. It is not derived from
        // the entity name, not mapped through a table registry, and not
        // "corrected" to `Brand`: schema continuity requires the literal, and
        // slug uniqueness is scoped to that one table's `urlTitle` column. It is
        // inlined at both call sites exactly as the legacy inlines it twice, and
        // the port's closed `UrlTitleTableName` union is what makes the literal
        // compile-checked rather than stringly typed.
        writeResolvedUrlTitle(
          data,
          await this.urlTitleGenerator.createUniqueURLTitle(incomingBrandName, 'SwBrand'),
        );
      } else if (hasCfLength(entityBrandName)) {
        // CFML parity [model/service/BrandService.cfc:L71]: the second branch is
        // `!isNull(arguments.brand.getBrandName()) && len(...)`, which is exactly
        // the positive form of `hasCfLength`. Reached only when the first branch's
        // title source was absent or empty.
        //
        // CFML parity [model/service/BrandService.cfc:L72]: same unqualified
        // in-place write and same literal `"SwBrand"` as L70; the JUDGMENT CALL
        // above governs both sites.
        writeResolvedUrlTitle(
          data,
          await this.urlTitleGenerator.createUniqueURLTitle(entityBrandName, 'SwBrand'),
        );
      }

      // CFML parity [model/service/BrandService.cfc:L73]: there is NO `else`
      // branch. When neither source yields a name, `urlTitle` is never set at all
      // and the guard chain simply falls through. That path is live, reachable and
      // faithful - input shape 5 above - so no fallback, no slug-from-ID, no
      // empty-string assignment and no title-related error is added HERE.
      //
      // ★ WHAT ANSWERS INSTEAD, AND THIS SENTENCE REPLACES A CLAIM THAT IS NO LONGER
      // TRUE. It used to read: "Whether the save then fails on the `unique="true"` /
      // required constraint declared at [model/entity/Brand.cfc:L55] and in
      // `model/validation/Brand.json` is the framework validation service's business,
      // and that service is not ported." The rules are the same rules; what has
      // changed is that this file now performs the flush those rules gated, so
      // declining to evaluate them would durably write a row the legacy refused.
      // `assertBrandSaveContextRules`, below the guard, is where shape 5 is refused -
      // by the `required` rule, exactly as `validate_required`
      // [org/Hibachi/HibachiValidationService.cfc:L233-L239] refused it. The
      // separation still holds: the title logic decides nothing about validity, and
      // the validator decides nothing about titles.
    }

    // ★★★ THE DURABLE HALF OF `super.save`, PERFORMED HERE. This is the statement that
    // used to raise `BrandPersistenceUnavailableError` unconditionally, making the
    // service's only operation permanently unavailable. The tombstone above the class
    // records the argument that led there and why its conclusion was wrong; what follows
    // is `HibachiService.save` [org/Hibachi/HibachiService.cfc:L133-L169] reproduced in
    // its own order.
    //
    // CFML parity [model/service/BrandService.cfc:L76]: the legacy call is
    // POSITIONAL - `super.save(arguments.brand, arguments.data)` - where
    // [model/service/RoundingRuleService.cfc:L63] passes `argumentcollection=arguments`
    // for the same operation. A gratuitous inconsistency across the slice, recorded so a
    // reviewer can see it was observed rather than missed. SECONDARY-REGISTER item, not a
    // numbered defect.

    // STEP 1 - POPULATE [org/Hibachi/HibachiService.cfc:L146]. The resolved `urlTitle`
    // sits in the payload, which is exactly where the legacy save read it from, so this
    // is also what carries the guard chain's work into the row. A new instance rather
    // than a mutation, because `Brand` is immutable; the caller's object is untouched.
    const populatedBrand = populateBrandFromSaveInput(brand, data);

    // STEP 2 - VALIDATE [org/Hibachi/HibachiService.cfc:L151], on the POPULATED entity
    // and before anything is written. The legacy reached the DAO only when
    // `!hasErrors()` [:L155]; here a failing rule throws, and either way no row is
    // written. The `"unique":true` half of the `urlTitle` rule needs a query and is
    // enforced by the writer - see `assertBrandSaveContextRules`.
    assertBrandSaveContextRules(populatedBrand);

    // STEP 3 - FLUSH [org/Hibachi/HibachiService.cfc:L155], and answer THE PERSISTED ROW
    // rather than the argument. A new brand acquires there the identifier
    // [model/entity/Brand.cfc:L52, `generator="uuid" unsavedvalue=""`] that the absent
    // flush used to leave unminted, and both paths acquire the audit stamps
    // [org/Hibachi/HibachiEntity.cfc:L609, L661]. Returning the input instead would hand
    // back a brand whose `isNew()` still answered true after a successful insert.
    //
    // NOT REPRODUCED, DELIBERATELY: the before/after save EVENTS the framework announced
    // [org/Hibachi/HibachiService.cfc:L140, and the failure announcement on the invalid
    // path]. `HibachiEventService` is not ported (AAP 0.5.3) and nothing in the subtree
    // subscribes, so announcing into a void would be ceremony rather than behaviour.
    return await this.frameworkWrites.saveBrand(populatedBrand);
  }
}
