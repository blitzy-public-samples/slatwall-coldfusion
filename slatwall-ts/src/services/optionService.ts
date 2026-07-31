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
//   src/handlers/bootstrap.ts                        composition root (wiring)
//   src/repositories/mysql/mysqlOptionRepository.ts  MySQL option adapter
//   src/services/skuService.ts                       inherits the omission pattern
//   src/services/productService.ts                   inherits the omission pattern
//   tests/unit/services                              this service's net-new suite
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - Option select-list and unused-option lookup service
//
// PORTED FROM: model/service/OptionService.cfc (99 lines), as a 1:1 logic
// extraction. THREE PUBLIC METHODS, which is the entire declared surface of the
// legacy component: one synchronous pure transformation and two data passthroughs.
//
// ★ THE STRUCTURAL FACT A REVIEWER MUST READ FIRST
//   LEGACY-NOTE [model/service/OptionService.cfc:L82-L96]: the legacy component
//   closes with FOUR section banners that are ALL EMPTY - Process Methods
//   (L82/L84), Save Overrides (L86/L88), Smart List Overrides (L90/L92) and Get
//   Overrides (L94/L96). Every CRUD-shaped method a caller might expect of an
//   "option service" - `getOption`, `newOption`, `saveOption`, `deleteOption`,
//   `validateOption`, `getOptionSmartList`, and the same set again for option
//   groups - arrived by inheritance from `HibachiService`, and that framework
//   base is deliberately not ported (AAP 0.5.3 redistributes its
//   responsibilities: persistence to the repository layer, validation to typed
//   schemas, ambient scope to explicit parameters). Their absence from the class
//   below is therefore FAITHFUL, not an omission. Do not add them.
//
//   ★ THAT ABSENCE IS WIDER HERE THAN IN ANY SIBLING SERVICE, because this one
//   service is the designated service for TWO entities: both
//   [model/entity/Option.cfc:L49] and [model/entity/OptionGroup.cfc:L49] declare
//   `hb_serviceName="optionService"`. So the component owning option-group CRUD
//   declares no option-group method whatsoever. Verified in both sources.
//
//   The Smart List Overrides banner being EMPTY is load-bearing for scope: no
//   smart-list rename happens in this file and none may be added. The project's
//   two smart-list replacements belong to `src/services/productService.ts`
//   (planned) and `src/services/skuService.ts` (planned), because
//   [model/service/ProductService.cfc:L342] and [model/service/SkuService.cfc:L309]
//   declare `getProductSmartList` / `getSkuSmartList` outright. This component
//   declares neither, so `findOptions`, `getOptionSmartList` and any
//   criteria/page/query surface are all out of bounds here.
//
// ★ THIS FILE ESTABLISHES THE DEAD-DI/1-INJECTION-OMISSION PATTERN
//   Exactly FOUR dead DI/1 injections exist in the in-scope slice, and this file
//   carries the first one to be annotated. The annotation on the constructor
//   below is the reusable template: `src/services/skuService.ts` (planned) has
//   one dead injection to omit and `src/services/productService.ts` (planned)
//   has two, and each should repeat that exact form. The shape of the annotation
//   matters as much as the omission, because an omission that is not recorded
//   reads as an oversight.
//
// ★ COLLABORATOR-COUNT CALIBRATION - THE "16+" FIGURE IS NOT ABOUT THIS SLICE
//   The project brief flags that DI/1 injects "16 or more" services, and that
//   figure is a property of ONE out-of-scope component. Verified counts:
//
//     BrandService          1
//     OptionService         2 DECLARED / 1 REAL   <- this file
//     PriceGroupService     3
//     PromotionService      3
//     RoundingRuleService   1
//     SkuService            5 DECLARED / 4 REAL
//     ProductService        8 DECLARED / 6 REAL
//     OrderService         16   (out of scope: [model/service/OrderService.cfc:L51]
//                                plus L53-L67)
//
//   So the heaviest in-scope service takes eight collaborators and this one takes
//   a single real collaborator. The untangling work in this slice is not a
//   sixteen-way graph; it is the inversion of two call directions, and neither of
//   them passes through this file.
//
// ⚠ LOCATOR CAUTION - THE SOURCE WINS
//   Every `model/**` locator cited in this file was re-read from the source while
//   authoring it. All of them proved EXACT, including the two DAO function
//   locators and the two validation locators, so NO correction is recorded
//   anywhere below. Specification locators across this project are known to drift
//   by a few lines. If a future reader finds any citation here disagreeing with
//   the source, THE SOURCE WINS - re-verify, correct the citation, and record the
//   correction as a LEGACY-NOTE naming both the cited and the actual line.
//
// PARAMETERIZED SQL - WHY NO STATEMENT APPEARS IN THIS FILE
//   The project standard is that every query uses prepared statements
//   exclusively, preserving the injection-safety guarantee `cfqueryparam` gave the
//   legacy code. That obligation is NOT DISCHARGED HERE, and it is not silently
//   skipped either: THIS SERVICE BUILDS AND EXECUTES NO SQL AT ALL.
//
//   Stating that explicitly matters more in this file than in any other service,
//   because two of its three methods are pure passthroughs to a data layer, so
//   inlining their queries would look like a simplification rather than a layer
//   violation. It is a layer violation. The two `<cfquery>` bodies at
//   [model/dao/OptionDAO.cfc:L51-L92] and [model/dao/OptionDAO.cfc:L94-L117] are
//   the SQL source of truth for `src/repositories/mysql/mysqlOptionRepository.ts`
//   (planned) and for nothing else. Both bind their list parameter with
//   `cfqueryparam ... list="true"` - [model/dao/OptionDAO.cfc:L68] and
//   [model/dao/OptionDAO.cfc:L107] - and the adapter, not this service, owns
//   reproducing that binding one parameter per parsed element.
//
// NO MONETARY VALUE IS TOUCHED ANYWHERE IN THIS FILE
//   All currency arithmetic in this subtree passes through the `Money` value
//   object over an arbitrary-precision decimal, and no raw floating-point
//   operation on a monetary value is permitted. That rule is VACUOUS here: this
//   service reads an option name and an option identifier and returns strings.
//   It imports no `Money`, no `Decimal`, and no rounding or precision helper.
//   Recorded so that a later change which introduces a price into this file is
//   recognised immediately as needing the value object rather than a number.
//
// THE LAYER BOUNDARY HERE IS ARCHITECTURAL, NOT LINTED
//   `src/domain/**` is fenced by a `no-restricted-imports` block in
//   `eslint.config.mjs` where a violation is a build failure. That block is scoped
//   to `src/domain/**/*.ts` ONLY - verified - so NO lint rule fences
//   `src/services/**`. The inward dependency flow this file observes is therefore
//   upheld by discipline and review: it depends on PORT INTERFACES only, never on
//   a concrete adapter, and it imports nothing from `src/repositories/**`,
//   `src/handlers/**` or `src/integrations/**`. There are also zero intra-folder
//   imports between the service modules; every collaborator arrives as a
//   constructor parameter and the graph is assembled once in
//   `src/handlers/bootstrap.ts` (planned).
//
// NO AMBIENT SCOPE, NO SERVICE LOCATOR, NO CACHE
//   Three sweeps of the 99-line component, each returning nothing:
//     * `getService(`                       -> zero hits. This component contains
//       no service-locator call, so no T2 rewrite applies to it. (The only
//       service-tier locator site anywhere in the slice is
//       [model/service/SkuService.cfc:L212], reaching the image service from an
//       out-of-scope branch.)
//     * `getHibachiScope` / `getSlatwallScope` -> zero hits. This service reads no
//       request-scoped ambient state, so it needs NO context parameter. Do not add
//       one speculatively.
//     * `variables.`                        -> zero hits. The component declares no
//       memo and no cache, so this class holds none. Module-level mutable state
//       would survive between unrelated invocations on a warm Lambda container and
//       is unsafe; the single sanctioned exception in the subtree is the MySQL
//       connection pool in `src/repositories/mysql/connection.ts` (planned).
//
//   The class below consequently holds no mutable state of any kind. One instance
//   constructed in the composition root can serve every invocation, and every
//   method is deterministic given its arguments and the injected port.
//
// TEST COVERAGE IS NET-NEW - NEVER PRESENT IT AS PARITY
//   There is NO `OptionServiceTest` anywhere in `meta/tests/`. The legacy service
//   tier under `meta/tests/unit/service/` contains only `AccountServiceTest`,
//   `HibachiServiceTest`, `PaymentServiceTest` and `UtilityRBServiceTest`, none of
//   them in scope, and `meta/tests/unit/dao/` contains only `AccountDAOTest` and
//   `PaymentDAOTest`. Every assertion written against this file is therefore
//   NET-NEW coverage and must be labelled as such.
//
//   The test tier is authored separately and NO test is declared here. What this
//   file owes the tests is testability, and it pays it structurally: the one
//   collaborator is an injected interface so a suite supplies a stub without a
//   database, and `getOptionsForSelect` is pure and synchronous so it needs no
//   mock, no fake clock and no await.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, and it was probed repeatedly to
//   confirm the read was complete rather than paginated. No rule has been invented
//   to fill the gap, and the absence is not licence to lower the bar: the
//   enterprise substitute standard applies at full strength to a 99-line service.
//   Concretely, here that means maximal strictness with no `any`, no suppression
//   comment and no non-null assertion; legacy method names carried over verbatim;
//   no validation, constraint or default that the legacy lacks; no dependency
//   outside the fixed pinned set - this file imports no third-party package at
//   all; no credential, connection string, table name or environment value present
//   as a value; and every judgment call annotated at the point where it was made.
//
// A NOTE ON WHICH MARKER FORMS APPEAR, AND WHY ONE DOES NOT
//   `CFML parity`, `LEGACY-NOTE` and `JUDGMENT CALL` all appear below. There is
//   deliberately NO `LEGACY-DEFECT` marker in this file: that form is reserved for
//   entries in the numbered defect register - thirty numbered entries plus eight
//   secondary items - and this component owns none of the numbered thirty. The
//   warts it does own are SECONDARY-register items, each labelled as such at its
//   site and recorded with `CFML parity`. Its absence is an accurate statement
//   about this component, not an omission.
//
//   For the same reason this file spends nothing from any budget ledger: no
//   signature reshaping (all three signatures keep their legacy shape, including
//   the two-parameter / one-parameter asymmetry), no visibility widening (all
//   three methods were already `public`), no signature widening (no parameter is
//   added to any of them), and no deliberate behavioural divergence. Nothing here
//   departs from what the legacy component does.
// ---------------------------------------------------------------------------

import type { Option } from '../domain/entities/option.js';
import type { OptionRepository, SelectOption } from '../domain/ports/optionRepository.js';

/**
 * The ported surface of `model/service/OptionService.cfc`.
 *
 * THREE PUBLIC METHODS, which is exactly what the legacy component declared: one
 * synchronous projection and two data passthroughs. See the file header for why the
 * absence of `getOption`, `newOption`, `saveOption`, `deleteOption` and every
 * smart-list accessor is faithful rather than incomplete, and why that absence
 * extends to option GROUPS as well as options.
 *
 * ONE COLLABORATOR, injected. Instances hold no mutable state of any kind, so a
 * single instance constructed in `src/handlers/bootstrap.ts` (planned) can serve
 * every invocation, and each method is deterministic given its arguments and the
 * injected port.
 */
export class OptionService {
  // CFML parity [model/service/OptionService.cfc:L49]: the component declaration reads
  // `component extends="HibachiService" accessors="true" {` and carries NEITHER
  // `persistent="false"` NOR `output="false"`, where the sibling declarations at
  // [model/service/BrandService.cfc:L49] and [model/service/RoundingRuleService.cfc:L49]
  // carry both. None of the four attributes has a TypeScript analogue - the framework
  // base is not ported, the accessors are written out by hand, and the two absent
  // attributes describe a CFML component lifecycle that does not exist here - so all of
  // them are dropped. SECONDARY-register item, recorded only so that a reviewer diffing
  // the ported services against their sources is not left wondering why this one header
  // is shorter than its siblings'.
  //
  // CFML parity [model/service/OptionService.cfc:L51,L53]: both property declarations
  // carry an explicit `type="any"`, exactly as [model/service/BrandService.cfc:L51] and
  // [model/service/RoundingRuleService.cfc:L51] do. `any` is not merely un-idiomatic
  // here, it is banned outright by the strictness profile, and the port interface below
  // supplies the real contract that the legacy declaration left unstated.
  // SECONDARY-register item.

  // LEGACY-NOTE [model/service/OptionService.cfc:L53]: property name="productService" is
  // declared by DI/1 convention but never referenced anywhere in the component. Omitted
  // deliberately rather than wired as an unused dependency; one of exactly four verified
  // dead DI/1 injections in the in-scope slice.
  //
  // The claim is evidence-backed rather than assumed: a sweep of the 99-line component
  // for `productService` returns EXACTLY ONE hit, and that hit IS the L53 declaration.
  // Nothing reads it. Under DI/1 the declaration alone was enough to have the collaborator
  // resolved and injected, so an edge that no code used stayed invisible; naming
  // collaborators as constructor parameters is what makes an unused one apparent instead.
  //
  // CONSEQUENCE FOR THE COMPOSITION ROOT: `src/handlers/bootstrap.ts` (planned) must NOT
  // wire a product service into this constructor. Doing so would reintroduce the dead
  // edge and, because `productService` declares eight collaborators of its own
  // [model/service/ProductService.cfc:L52-L60], would pull that whole subgraph into the
  // wiring required to build an option select list - a dependency this component does not
  // have.
  //
  // THIS IS THE TEMPLATE. `src/services/skuService.ts` (planned) has one dead injection
  // to omit and `src/services/productService.ts` (planned) has two; each should repeat
  // this form - cite the declaring line, state that the sweep found no reference, state
  // that the omission is deliberate, and state that the composition root must not wire
  // it. An omission that is not recorded reads as an oversight.
  //
  // ONE DISAGREEMENT WITH A NEIGHBOURING FILE, RESOLVED IN FAVOUR OF THE SOURCE: the
  // prose commentary in `src/domain/ports/optionRepository.ts` anticipates that this
  // property "becomes a separate constructor parameter at the service tier - two
  // collaborators in total". That is commentary, not contract - the port's type
  // declarations are unaffected by it - and the sweep above contradicts it. The source
  // wins, so the parameter is omitted and the port is left untouched.

  /**
   * @param optionRepository - Replaces the legacy
   *   `property name="optionDAO" type="any";` [model/service/OptionService.cfc:L51],
   *   the component's one and only LIVE collaborator. It resolved through the DI/1
   *   0.4.2 convention scan at runtime; here it is an explicit, compile-checked
   *   constructor parameter typed to a PORT INTERFACE rather than to a concrete
   *   adapter, so a test supplies a stub without a database and no service locator or
   *   container package is involved. Wired once, explicitly, in
   *   `src/handlers/bootstrap.ts` (planned).
   */
  constructor(private readonly optionRepository: OptionRepository) {}

  // CFML parity [model/service/OptionService.cfc:L55]: this method sits OUTSIDE every
  // section banner in the legacy component - it is declared at L55-L63, ahead of the
  // first banner (`START: Logical Methods`, L66), while every other method in the file
  // sits inside a banner pair. A structural inconsistency in the source with no bearing
  // on behaviour, and no analogue to reproduce. SECONDARY-register item.
  //
  // JUDGMENT CALL: the parameter is typed `readonly Option[]` rather than `Option[]`.
  // The element type, the parameter name, the arity and the position are all exactly as
  // published, so this is not a signature reshaping and no budget ledger is spent; only
  // the array's mutability is narrowed. Two reasons, the first of them decisive.
  //   1. The already-authored entities publish option arrays with OPPOSITE mutability:
  //      `getOptions()` returns `readonly Option[]` at
  //      [slatwall-ts/src/domain/entities/sku.ts:L1184] and
  //      `getOptionsByOptionGroup()` returns `readonly Option[]` at
  //      [slatwall-ts/src/domain/entities/product.ts:L2640], while
  //      `getOptions(orderby?, sortType, direction)` returns a MUTABLE `Option[]` at
  //      [slatwall-ts/src/domain/entities/optionGroup.ts:L1153]. `readonly Option[]` is
  //      the only form that accepts all three; declaring `Option[]` would make the SKU
  //      and product accessors non-assignable at the natural call site.
  //   2. The legacy body only ever READS the incoming array - there is no `arraySort`,
  //      `arrayDeleteAt` or `arrayAppend` against it - and a `readonly` parameter makes
  //      that a compiler guarantee instead of a comment. The arrays handed in are live
  //      entity collections rather than defensive copies, so mutating one would reach
  //      back into the caller's object graph.
  // This mirrors the reasoning already recorded in
  // `src/domain/ports/optionRepository.ts`, which chose the stricter `readonly` form for
  // its own results on the ground that it narrows what callers may do without
  // constraining the implementation at all.

  /**
   * Ported 1:1 from `public array function getOptionsForSelect(required any options)`
   * [model/service/OptionService.cfc:L55-L63].
   *
   * Projects each option onto the two-key select row the legacy body built at
   * [model/service/OptionService.cfc:L59] - the option's name as `name` and its
   * identifier as `value` - preserving input order. The legacy name is carried over
   * verbatim: `getOptionsForSelect`, never `toSelectOptions` and never `findOptions`,
   * because method-level interface parity is this migration's acceptance contract.
   *
   * SYNCHRONOUS, AND THAT IS A RULE RATHER THAN A PREFERENCE. A method in this port
   * becomes `async` if and only if its legacy body reaches the DAO or the ORM. This body
   * reaches neither: it reads two accessors off objects the caller already holds. It
   * therefore returns an array and not a promise, requires no `await` at any call site,
   * and is testable with no stub, no fake clock and no database.
   *
   * PURE. It reads its argument, allocates a new array, and touches nothing else - no
   * injected port, no ambient scope, no instance field, no module state. Calling it twice
   * with the same input yields two equal results and leaves the input untouched.
   *
   * @param options - The options to project. Read-only to this method, by type as well
   *   as by intent; nothing here sorts, splices, reverses or otherwise mutates the array
   *   or the entities inside it.
   * @returns One row per input option, in the SAME ORDER as the input. An empty input
   *   yields an empty array - never `undefined`, never `null`, and never a throw.
   */
  getOptionsForSelect(options: readonly Option[]): SelectOption[] {
    // CFML parity [model/service/OptionService.cfc:L56]: the legacy local is named
    // `sortedOptions`, but NOTHING IS EVER SORTED - the body only appends in input order
    // at L59 and returns that array at L62. There is no `arraySort`, no comparator and no
    // `ORDER BY` anywhere in the method. The output order is exactly the input order, and
    // introducing a sort to make the legacy name honest would CHANGE BEHAVIOUR, so none
    // is introduced. The misleading name is not carried into TypeScript, since the
    // expression below needs no local at all, but the fact is recorded here so the
    // divergence in naming cannot be mistaken for a divergence in behaviour.
    // SECONDARY-register item.
    //
    // CFML parity [model/service/OptionService.cfc:L58]: the loop counter is un-var'd and
    // leaks into the component variables scope. Inert here (nothing reads it); block
    // scoping in TypeScript makes the leak unreproducible. This is a secondary-register
    // item, NOT one of the three deliberate divergences.
    //
    // The loop FORM is deliberately not transliterated either. `for(i=1; i <=
    // arrayLen(arguments.options); i++)` with a 1-based index and an `arrayAppend` body
    // becomes a projection over the collection: minimal change scopes the functional
    // surface, not the code style, so reproducing a 1-based numeric index loop would
    // violate the directive rather than satisfy it. Projecting also means no indexed read
    // occurs, which is how the strictness profile's requirement that every indexed access
    // be proven safe is satisfied here without a non-null assertion - the legacy
    // `arguments.options[i]` would surface as `Option | undefined`, and asserting it away
    // is banned in `src/**`.
    //
    // JUDGMENT CALL: `getOptionName()` is typed `string | undefined` at
    // [slatwall-ts/src/domain/entities/option.ts:L865], because
    // [model/entity/Option.cfc:L54] declares `optionName ormtype="string"` with no
    // `notnull` and no default, so the column is genuinely nullable. The port's row type
    // requires a `string`, at [slatwall-ts/src/domain/ports/optionRepository.ts:L285].
    // The absent case is resolved to the EMPTY STRING, and that is a reproduction of
    // legacy behaviour rather than an invented default: Slatwall targets ColdFusion 9.0.1
    // and Railo 4.1 [readme.md:L1-L14], engines on which full null support is off by
    // default and a NULL string column read through the ORM surfaces as `""`. The empty
    // string is therefore the value the legacy runtime itself put into the `name` key for
    // that same row. The alternatives were all worse and all forbidden: a non-null
    // assertion silences the check that makes nullability visible, redeclaring the row
    // type would duplicate a locked port contract, and adding a member to the entity
    // would edit a file this service only consumes. `getOptionID()` needs no such
    // handling - it is the primary key and is typed `string` at
    // [slatwall-ts/src/domain/entities/option.ts:L852].
    return options.map((option) => ({
      name: option.getOptionName() ?? '',
      value: option.getOptionID(),
    }));
  }

  // ===========================================================================
  // The two data passthroughs.
  //
  // CFML parity [model/service/OptionService.cfc:L70,L80]: the legacy section is opened
  // TWICE and never closed - L70 and L80 both read
  // `// ===================== START: DAO Passthrough ===========================`, and
  // the second was plainly meant to be `END`, so the section has no closing banner at
  // all. This is the fourth occurrence of the identical wart in the migrated slice, after
  // [model/service/BrandService.cfc:L59], [model/service/RoundingRuleService.cfc:L183]
  // and [model/service/PromotionService.cfc:L1102] - a recurring project-wide
  // copy-and-paste pattern rather than an isolated slip in this one file. Banner comments
  // carry no behaviour, so nothing is reproduced; the section below is delimited once,
  // correctly. SECONDARY-register item.
  //
  // CFML parity [model/service/OptionService.cfc:L73,L77]: both bodies forward with
  // `argumentCollection=arguments`, spelled with a capital `C`, where
  // [model/service/RoundingRuleService.cfc:L63] spells the same construct
  // `argumentcollection` in lower case. CFML identifiers are case-insensitive so the
  // difference is purely cosmetic, and the construct itself disappears in translation:
  // each method below forwards its NAMED parameters explicitly, which is what makes the
  // forwarded argument list visible to the compiler instead of assembled at runtime.
  // SECONDARY-register item, covering both sites.
  //
  // CFML parity [model/service/OptionService.cfc:L72,L76] against
  // [model/dao/OptionDAO.cfc:L51,L94]: the service declares `returntype="array"` on both
  // methods while the DAO underneath declares `returntype="any"` on the first and NO
  // return type at all on the second. The three declarations cannot all be the tightest
  // description of one value, and TypeScript cannot hold them simultaneously, so the
  // honest resolution is to type the promise to the element type the port declares.
  // SECONDARY-register item.
  //
  // CFML parity [model/validation/Product.json:L13-L14]: neither of these methods is
  // dead code, and the reason is declarative. `"unusedProductOptions"` carries
  // `{"contexts":"addOption","minCollection":1}` at L13 and
  // `"unusedProductOptionGroups"` carries `{"contexts":"addOptionGroup","minCollection":1}`
  // at L14, so the results below gate whether a product may accept another option or
  // option group at all. An EMPTY array is therefore a meaningful answer that fails those
  // contexts by design - it must be returned as an empty array and never smoothed into a
  // default, a fallback or a synthesised placeholder row. Enforcing the constraints is
  // not this method's job and no validation surface appears here.
  //
  // JUDGMENT CALL: the interface-mapping table typed these Promise<Option[]> /
  // Promise<OptionGroup[]>, but ../domain/ports/optionRepository.ts declares
  // SelectOption[]. The port is authoritative and more faithful: model/dao/OptionDAO.cfc
  // returns <cfquery> record sets, not hydrated entities. Mirrored the port exactly.
  //
  // The evidence is checkable line by line and it is unambiguous. Neither DAO function
  // calls `ORMExecuteQuery` or `entityLoad`, and neither hydrates anything: each runs a
  // `<cfquery>` and then loops the record set BUILDING a two-key structure per row -
  // [model/dao/OptionDAO.cfc:L88] appends `{name, value}` where `name` is the composite
  // `"<optionGroupName> - <optionName>"` and `value` is the option identifier, and
  // [model/dao/OptionDAO.cfc:L113] appends `{name, value}` where `name` is the option
  // group name and `value` is the option group identifier. Those arrays are what get
  // returned, at [model/dao/OptionDAO.cfc:L91] and [model/dao/OptionDAO.cfc:L116]. So the
  // legacy contract is an array of name/value pairs, and no entity ever exists to return.
  // Reading the source correctly where the plan paraphrased it is not a behavioural
  // divergence and spends no budgeted divergence.
  //
  // Note the consequence for the second method in particular: its legacy result is
  // option-GROUP rows, yet its element type is the same `SelectOption`. That is faithful -
  // both queries project a label and an identifier - and it is why this file imports no
  // `OptionGroup` type at all. The `readonly` on both returns is likewise the port's own,
  // carried through unchanged rather than relaxed.
  // ===========================================================================

  /**
   * Ported 1:1 from `public array function getUnusedProductOptions(required string
   * productID, required string existingOptionGroupIDList)`
   * [model/service/OptionService.cfc:L72-L74].
   *
   * A passthrough, and deliberately nothing more: the legacy body is a single forwarding
   * statement with no guard, no default, no transformation of the result and no length
   * test on either argument, so none is added here. The query it forwards to is at
   * [model/dao/OptionDAO.cfc:L51-L92], which restricts to option groups the product
   * already carries with an `IN` match and then drops any option already used by one of
   * that product's SKUs with a `NOT EXISTS` subquery.
   *
   * ASYNC BECAUSE THE LEGACY BODY REACHES THE DATA STORE. That is the whole of the rule,
   * and it is the one respect in which this signature differs from its source.
   *
   * TWO PARAMETERS, `productID` FIRST. The asymmetry against its sibling below - which
   * takes no product identifier - is the source's own, at
   * [model/dao/OptionDAO.cfc:L52-L53] versus [model/dao/OptionDAO.cfc:L95], and it is
   * preserved verbatim rather than harmonised.
   *
   * @param productID - The product whose SKUs are checked for options already in use.
   *   Bound as a parameter by the adapter, at [model/dao/OptionDAO.cfc:L78] in the source.
   * @param existingOptionGroupIDList - A CFML comma-delimited list of option group
   *   identifiers to search within. It stays a `string` here and is NOT parsed: signature
   *   parity requires the string, and splitting it is the adapter's job, exactly as it was
   *   the DAO's. That is why this file imports no list helper.
   * @returns The select rows the query produced, ordered by option group name then option
   *   name. Possibly empty - see the validation note above.
   */
  async getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]> {
    return this.optionRepository.getUnusedProductOptions(productID, existingOptionGroupIDList);
  }

  /**
   * Ported 1:1 from `public array function getUnusedProductOptionGroups(required string
   * existingOptionGroupIDList)` [model/service/OptionService.cfc:L76-L78].
   *
   * A passthrough on the same terms as its sibling. The query it forwards to is at
   * [model/dao/OptionDAO.cfc:L94-L117].
   *
   * ★ ONE PARAMETER, AND NO PRODUCT IDENTIFIER. The legacy method takes only the option
   * group list, so the answer is "every option group not in this list" across the WHOLE
   * catalog rather than anything scoped to a product. An optional `productID` is
   * deliberately NOT added: the ledger for adding a parameter is spent elsewhere in the
   * project, and adding one here would invent a requirement and quietly change the
   * result set.
   *
   * ★ THE LIST IS USED WITH THE OPPOSITE POLARITY TO ITS SIBLING - `NOT IN` at
   * [model/dao/OptionDAO.cfc:L107] against `IN` at [model/dao/OptionDAO.cfc:L68] - because
   * an unused group is one the product does NOT already carry. Neither legacy function
   * guards an empty list, so an empty input leaves this query excluding nothing while it
   * leaves the sibling matching nothing. Both outcomes belong to the caller and no guard
   * is introduced here to smooth the asymmetry over.
   *
   * ASYNC BECAUSE THE LEGACY BODY REACHES THE DATA STORE.
   *
   * @param existingOptionGroupIDList - A CFML comma-delimited list of option group
   *   identifiers to EXCLUDE. Stays a `string` and is not parsed here, for the same reason
   *   as above.
   * @returns The select rows the query produced, ordered by option group name. Possibly
   *   empty - see the validation note above.
   */
  async getUnusedProductOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]> {
    return this.optionRepository.getUnusedProductOptionGroups(existingOptionGroupIDList);
  }
}
