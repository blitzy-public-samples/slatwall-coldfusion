/**
 * `sku.rules.ts` — the typed transliteration of `model/validation/Sku.json`.
 *
 * Authority: AAP §0.4.1.5 Validation Layer, the row
 * `slatwall-ts/src/validation/rules/sku.rules.ts | CREATE | model/validation/Sku.json | "Numeric
 * minimums, skuCode uniqueness, and the two method rules wired to the domain methods rather than to
 * strings"`. Corroborated by the AAP §0.3.1 target tree line `sku.rules.ts <-
 * model/validation/Sku.json (incl. the two method rules)` and by the AAP §0.4.4 wildcard row
 * `slatwall-ts/src/validation/rules/** | CREATE — the seven rule sets`.
 *
 * PROVENANCE, VERIFIED RATHER THAN ASSUMED. `model/validation/Sku.json` is 15 lines and hashes to
 * md5 `2fcd34d2ba14877d256d91b58759272f`. Both were measured against the working tree before a line
 * of this file was written, because every locator below is only as good as the document it points
 * into.
 *
 * EVERY LEGACY FILE NAMED IN THIS FILE IS REFERENCE-ONLY AND IS NEVER MODIFIED. Transformation rule
 * TR-6 and AAP §0.4.1.1 hold the CFML tree byte-for-byte unchanged: every target file is CREATE and
 * every legacy file is REFERENCE, so the plan contains zero UPDATE rows.
 *
 * =============================================================================================
 * WHY THIS FILE EXISTS — IR-4 NAMES ITS TWO RULES SPECIFICALLY
 * =============================================================================================
 * AAP IR-4: "Declarative validation is part of the observable behavior. Seven catalog validation
 * files define required fields, uniqueness, regular-expression formats, conditional rules and delete
 * guards. Two `Sku` rules are method-based and execute real queries. These are behavior, not
 * configuration, and are ported as typed rule sets."
 *
 * The two rules IR-4 singles out are the two declared at `model/validation/Sku.json:5-8` and
 * transcribed below. They are the reason the implicit-scope argument for the whole validation layer
 * exists, and they make this the only one of the seven documents that carries executable code.
 *
 * AAP §0.2.1.5 states the stake from the other direction: these documents "are interpreted at
 * runtime by the validation service and determine which saves and deletes succeed." Treat this one
 * as configuration and the result is a port that compiles cleanly, saves SKUs the legacy system
 * would reject, and rejects SKUs the legacy system would accept — with no compile error, no
 * exception and no failing test to reveal it.
 *
 * SCOPE NOTE. `model/validation/Sku.json` is an IMPLICIT SCOPE ADDITION (AAP §0.2.1.5): the prompt
 * names no validation document. It is in scope because the behavior it defines is observable, and
 * because two of its rules are executable code.
 *
 * =============================================================================================
 * WHAT THIS FILE IS NOT — TR-3, AND WHY THE JSON IS NOT SHIPPED
 * =============================================================================================
 * Transformation rule TR-3: "Replace framework magic with declarations. Every runtime-synthesized
 * method, every string-keyed service lookup and every metadata-driven behavior becomes an explicit,
 * compile-checked declaration."
 *
 * So no JSON document is imported, required, bundled, parsed, copied, moved, symlinked or re-emitted
 * into `slatwall-ts/`, and `resolveJsonModule` is not enabled in `slatwall-ts/tsconfig.json`. The
 * document is TRANSLITERATED, never VENDORED. Interpreting it at runtime would reproduce exactly the
 * metadata-driven dispatch TR-3 retires.
 *
 * ENUMERATE, NEVER WILDCARD. `model/validation/` holds 96 JSON documents and exactly seven are in
 * scope, enumerated in AAP §0.4.4 as
 * `model/validation/{Product,Sku,Brand,Option,OptionGroup,ProductType,Product_UpdateSkus}.json`.
 * That section is explicit that a pattern such as `model/validation/Product*.json` "would silently
 * pull in out-of-scope material". This file covers `Sku` and nothing else — in particular
 * `model/validation/SkuCurrency.json` is excluded outright by AAP §0.2.2.4, so none of its rules is
 * merged here and no `skuCurrencies` guard is invented even though `model/entity/Sku.cfc:L72`
 * declares that collection with `cascade="all-delete-orphan"`.
 *
 * =============================================================================================
 * THE DOCUMENT, MEASURED — EIGHT PROPERTIES, NINE RULE OBJECTS, THIRTEEN CONSTRAINTS
 * =============================================================================================
 * Line numbers are into `model/validation/Sku.json`. `options` is the only property carrying more
 * than one rule object, which is why a property's rules are an ARRAY.
 *
 *   :3   defaultFlag            delete   eq false
 *   :4   listPrice              save     dataType numeric, minValue 0
 *   :5-8 options                save     method hasUniqueOptions          (:6)
 *                               save     method hasOneOptionPerOptionGroup (:7)
 *   :9   price                  save     required, dataType numeric, minValue 0
 *   :10  renewalPrice           save     dataType numeric, minValue 0
 *   :11  skuCode                save     required, unique
 *   :12  transactionExistsFlag  delete   eq false
 *   :13  physicalCounts         delete   maxCollection 0
 *
 * CONSTRAINT TALLY: required 2, dataType 3, minValue 3, unique 1, method 2, eq 2, maxCollection 1 —
 * FOURTEEN CONSTRAINTS IN TOTAL, drawn from seven of the thirteen constraint KEYS the seven documents
 * use between them. The two counts are different things and are easy to conflate: thirteen is the size
 * of the VOCABULARY, fourteen is the number of constraint INSTANCES this one document declares.
 * CONTEXTS: `save` on six rule objects, `delete` on three.
 *
 * THIS DOCUMENT IS THE ONLY ONE OF THE SEVEN THAT USES `method` AT ALL — both folder-wide uses are
 * here. It declares NO `conditions`, NO `regex`, NO `inList`, NO `minCollection` and NO `maxLength`.
 *
 * THE FLATTENING, and why one property can accumulate several messages.
 * `org/Hibachi/HibachiValidationService.cfc:L77-L88` explodes each rule object into ONE constraint
 * record per key, excluding `contexts` and `conditions` and copying `conditions` onto every record it
 * produces. So `price` at `:9` becomes THREE independent constraints and `skuCode` at `:11` becomes
 * TWO, each able to report its own error against the same property, because evaluation NEVER
 * short-circuits. `../Validator` expresses that explosion in the data shape itself — a rule holds an
 * array of constraints — so the flattening is visible here rather than performed at evaluation time.
 *
 * DETERMINISTIC EVALUATION ORDER, A DELIBERATE CHOICE WITH NO LEGACY COUNTERPART. The legacy engine
 * iterated a CFML struct at `org/Hibachi/HibachiValidationService.cfc:L68`, and CFML struct-key
 * iteration order is unspecified. This port fixes an order instead: properties in the SOURCE
 * DOCUMENT'S KEY ORDER — `defaultFlag`, `listPrice`, `options`, `price`, `renewalPrice`, `skuCode`,
 * `transactionExistsFlag`, `physicalCounts` — rules in document order within a property, and
 * constraints in the source key order within a rule object (`price`: required, dataType, minValue;
 * `skuCode`: required, unique). This is not a behavior change: no legacy behavior could depend on an
 * order the engine never guaranteed, and because errors accumulate rather than short-circuit the SET
 * of reported failures is identical either way. What determinism buys is a reproducible message
 * array, which is what lets a test assert on it at all.
 *
 * =============================================================================================
 * ⭐⭐ M6 — THE VALIDATION READ-BACK LOOP. THE HIGHEST-RISK ITEM IN THE WHOLE SLICE
 * =============================================================================================
 * AAP §0.6.2 states it plainly: "`Sku.hasUniqueOptions()` is not an ordinary helper. It is a
 * declarative validation rule registered in `model/validation/Sku.json` for the save context, and it
 * executes a database query to do its work."
 *
 * THE CYCLE, with every locator traced through source rather than inferred:
 *
 *   `SkuService.createSkus()`            [model/service/SkuService.cfc:L58-L211]
 *     -> save a Sku
 *       -> validation selects the `save` context
 *         -> the method rule at                       [model/validation/Sku.json:5]
 *           -> `Sku.hasUniqueOptions()`               [model/entity/Sku.cfc:L756-L769]
 *             -> `Product.getSkusBySelectedOptions()` [model/entity/Product.cfc:L366-L368]
 *               -> the conjunctive option query       [model/dao/SkuDAO.cfc:L107-L128]
 *                 -> back into the save that is still in flight
 *
 * Under CFML and Hibernate the rule observes only sibling SKUs already visible to the ORM session.
 * In the target there is no ORM session and no automatic flush, so — again AAP §0.6.2 — "a naive port
 * that inserts every combination and then validates, or that validates before any insert, produces
 * different results from the legacy code — silently."
 *
 * M6 IS JOINTLY OWNED by this folder and `src/adapters/`. Refactor discipline guideline 6 requires the
 * judgment to be documented at the site where it is made, so it is recorded HERE as well as at the
 * `../Validator` wiring site; both files carrying it is correct rather than redundant. The
 * same-transaction visibility half belongs to `src/adapters/mysql/UnitOfWork.ts` (AAP §0.4.1.7).
 *
 * THE THREE OBLIGATIONS THIS FILE MUST NOT VIOLATE, and how each is discharged:
 *
 *   1. PER SKU, IN COMBINATION-ENGINE ORDER. The rule must be invoked once per SKU, in the order the
 *      odometer enumeration inside `model/service/SkuService.cfc:L58-L211` produced them, because
 *      that order determines both the generated SKU set and the order in which uniqueness validation
 *      observes its siblings. Nothing declared here batches subjects, groups them or reorders them:
 *      the declarations are inert data and the iteration belongs entirely to `../Validator`, which
 *      states that it "never batches subjects and never reorders them".
 *   2. ASYNCHRONOUS WITHOUT BEING HOISTED. `hasUniqueOptions` is declared asynchronous, and
 *      `../Validator` awaits every constraint one at a time inside an ordinary sequential loop with
 *      no concurrent settlement anywhere. Settling the constraint promises together would reorder the
 *      very reads whose ordering is the behavior under preservation.
 *   3. NEVER DEFEAT THAT VISIBILITY BY CACHING. No verdict is memoised across SKUs, no snapshot of
 *      sibling SKUs is pre-fetched, and the rule is re-invoked for every subject. Per M7 any
 *      memoisation in the target must be request-scoped rather than module-scoped, because nothing
 *      may bleed between invocations on a warm container; the simplest compliant choice is the one
 *      taken here, which is NONE AT ALL. THIS FILE PERFORMS NO CACHING WHATSOEVER.
 *
 * M6 IS SURFACED HERE, NOT SOLVED HERE (AAP §0.7.3 S8). Mismatches M1 through M8 are all allocated in
 * AAP §0.6.6 and no ninth is invented.
 *
 * =============================================================================================
 * WHY THERE IS NO MODULE-SCOPE ASSEMBLED RULE SET, UNLIKE THE OTHER SIX DOCUMENTS
 * =============================================================================================
 * `./brand.rules`, `./product.rules` and `./productType.rules` each export a fully assembled rule set
 * as a frozen module-scope constant. THIS FILE DELIBERATELY DOES NOT, and the reason is M6 obligation
 * 3 rather than preference.
 *
 * `Sku.hasUniqueOptions` in `../../domain/sku/Sku` takes an injected option-resolution lookup — the
 * explicit-injection translation of the legacy `getProduct().getSkusBySelectedOptions(...)` reach at
 * `model/entity/Sku.cfc:L763`. A module-scope assembled rule set would therefore have to CAPTURE that
 * lookup in a closure held for the lifetime of the module. On a warm Lambda container that closure
 * outlives the invocation that created it, which is precisely the cross-invocation bleed M7 forbids,
 * and a stale lookup would read against a transaction that has already ended — defeating the
 * same-transaction visibility M6 depends on.
 *
 * So {@link createSkuValidationRules} is the ONLY assembled form, and the lookup is supplied per
 * invocation at the composition root. Everything else — every constraint, every rule object and every
 * property validation that needs no collaborator — is still exported as an individual frozen value,
 * so the net-new suite can import and assert each one in isolation (AAP §0.7.3 S6).
 *
 * =============================================================================================
 * THE MESSAGE KEYS THIS DOCUMENT PRODUCES — RATIFIED DECISION D-1
 * =============================================================================================
 * `../Validator` composes one of three key shapes and DELIBERATELY SKIPS the legacy
 * template-substitution pass. Its own header carries the three independent reasons in full: there is
 * no resource bundle in the target, the pass is a provable no-op because none of the three shapes can
 * emit a substitution placeholder, and a raw key stays comparable to legacy output because CFML
 * appends a "missing" suffix only to an UNRESOLVED bundle key and a raw key never carries one. That
 * reasoning is not restated here; what belongs here is the resulting inventory.
 *
 * `model/entity/Sku.cfc:L49` declares the component `persistent=true`, so the class-name segment
 * resolves under the `entity.` prefix and never `processObject.`. FOURTEEN KEYS, ONE PER CONSTRAINT —
 * the `dataType` shape appends its value as a fourth segment, which is the only reason the three
 * shapes are not interchangeable:
 *
 *   via the `method` template   [org/Hibachi/HibachiValidationService.cfc:L222]
 *     validate.save.Sku.options.hasUniqueOptions
 *     validate.save.Sku.options.hasOneOptionPerOptionGroup
 *   via the `dataType` template [org/Hibachi/HibachiValidationService.cfc:L226]
 *     validate.save.Sku.price.dataType.numeric
 *     validate.save.Sku.listPrice.dataType.numeric
 *     validate.save.Sku.renewalPrice.dataType.numeric
 *   via the general template    [org/Hibachi/HibachiValidationService.cfc:L230]
 *     validate.save.Sku.price.required
 *     validate.save.Sku.price.minValue
 *     validate.save.Sku.listPrice.minValue
 *     validate.save.Sku.renewalPrice.minValue
 *     validate.save.Sku.skuCode.required
 *     validate.save.Sku.skuCode.unique
 *     validate.delete.Sku.defaultFlag.eq
 *     validate.delete.Sku.transactionExistsFlag.eq
 *     validate.delete.Sku.physicalCounts.maxCollection
 *
 * THESE ARE KEYS, NOT SENTENCES. Nothing here translates, sentence-cases, normalises, trims,
 * lowercases, pluralises or beautifies one. `../util/formatting` is deliberately NOT imported: with
 * the substitution skipped it would be dead code, which refactor discipline guideline 4 forbids.
 *
 * ⚠️ THE ERROR KEY IS THE PROPERTY IDENTIFIER, NEVER THE CONSTRAINT TYPE AND NEVER A METHOD NAME.
 * All three reporting branches — `org/Hibachi/HibachiValidationService.cfc:L224`, `:L228` and `:L232`
 * — call the error bag with exactly TWO arguments, the property identifier and the message. So
 * `price`'s three constraints all report under `price`, `skuCode`'s two under `skuCode`, and BOTH
 * method-rule failures under `options` — never under `hasUniqueOptions` or
 * `hasOneOptionPerOptionGroup`. Two failures landing under one key is exactly why a key's value is an
 * array. The shortened name derived at `:L208` is used ONLY to compose the message and is never the
 * key. The three-argument override at `org/Hibachi/HibachiEntity.cfc:L151` is an ENTITY concern
 * belonging to `src/domain/`, never a validation concern, and is never reached from here.
 *
 * =============================================================================================
 * REQUIREMENT N1 — THE DRY-RUN CONTRACT, AND WHY IT BINDS THIS FILE IN PARTICULAR
 * =============================================================================================
 * `org/Hibachi/HibachiEntity.cfc:L205`, `:L215` and `:L225` call the validator with error recording
 * switched OFF and read the failure flag off the returned throwaway bag — that is how the
 * deletability, editability and processability predicates work.
 *
 * THAT PATH IS REACHABLE FOR THIS FILE SPECIFICALLY: the deletability predicate on a SKU is how the
 * "can this be deleted?" question is answered, and it flows through exactly the three delete-context
 * guards declared below — two reading calculated properties and one inert. Every declaration here is
 * therefore purely declarative frozen data with pure synchronous readers: nothing mutates the subject,
 * nothing has a side effect, and nothing assumes a failure is being recorded.
 *
 * =============================================================================================
 * TWO DOCUMENTED NON-PORTS — REQUIREMENT N5. NEITHER IS A CARRIED DEFECT
 * =============================================================================================
 * Neither is annotated as one: AAP §0.7.3 S7 governs defects, and inventing a register entry for a
 * deliberate omission would misuse it.
 *
 *   1. THE POPULATED-SUB-PROPERTY CASCADE. `org/Hibachi/HibachiTransient.cfc:L412-L453` walks
 *      populated sub-properties and re-validates them under a context chosen by
 *      `org/Hibachi/HibachiValidationService.cfc:L135-L151`, which reads the
 *      `populatedPropertyValidation` and `validate` keys. NEITHER key appears in ANY of the seven
 *      in-scope documents, so the cascade is unreachable from these rule sets and no cascade API
 *      belongs anywhere in this folder. Worth stating HERE in particular, because
 *      `Sku` -> `options` -> `Option` -> `OptionGroup` is exactly the graph over which a reader might
 *      expect a cascading pass — and because `hasOneOptionPerOptionGroup` walks precisely that graph
 *      INSIDE A SINGLE RULE rather than through any cascade mechanism.
 *   2. THE CUSTOM-OVERRIDE MERGE. `org/Hibachi/HibachiValidationService.cfc:L6-L53` merges a per-class
 *      override document from the customisation tree into the core document. AAP §0.2.2.2 records
 *      that tree as an override placeholder containing nothing but readme stubs, so ZERO catalog
 *      overrides exist and building a merge mechanism for an empty input would violate AAP §0.7.3 S9.
 *
 * =============================================================================================
 * THREE MEASURED CORRECTIONS TO UPSTREAM CLAIMS — STATED HERE, NEVER FIXED IN A SIBLING
 * =============================================================================================
 * All three were measured against the working tree. No sibling file is edited; the correction lives
 * here so the next reader does not "fix" a right number into a wrong one.
 *
 *   1. THE UNKNOWN-CONSTRAINT THROW IS AT `org/Hibachi/HibachiValidationService.cfc:L202`, not L212.
 *      `../Validator` cites L212 for it. L212 is in fact the `isPersistent()` branch that selects the
 *      `entity.` versus `processObject.` class-name prefix, and the separate `dataType` whitelist
 *      throw is at `:L263`.
 *   2. THE `dataType` WHITELIST AT `org/Hibachi/HibachiValidationService.cfc:L258` ENUMERATES 26
 *      VALUES, not 27. Counted by splitting the literal list on its delimiter. The count is
 *      incidental to behavior — what matters is that `numeric` is on it and that an off-list value
 *      raises at `:L263` — but it is stated accurately because AAP §0.7.3 S9 forbids inventing
 *      numbers, and that cuts both ways.
 *   3. THIS DOCUMENT DECLARES FOURTEEN CONSTRAINTS, NOT THIRTEEN. The upstream aggregate says thirteen,
 *      but its own itemisation — required 2, dataType 3, minValue 3, unique 1, method 2, eq 2,
 *      maxCollection 1 — sums to fourteen, and the itemisation is the half that is correct: each entry
 *      matches `model/validation/Sku.json` byte for byte, verified by parsing the document and counting
 *      its constraint keys directly. So the aggregate is an arithmetic slip, not a missing constraint.
 *      The same slip propagates to the message-key count, which the upstream text gives as eleven while
 *      itself listing fourteen. THE DOCUMENT GOVERNS: fourteen constraints are declared below and
 *      fourteen keys are inventoried above. Recorded rather than quietly matched, because a port that
 *      shipped thirteen to agree with the aggregate would be missing a real rule.
 *
 * A FOURTH UPSTREAM CLAIM IS CORRECTED AT ITS OWN SITE: `../../ports/UniquePropertyPort` counts SIX
 * validation-document uniqueness rules and denies that `model/validation/Product.json` declares
 * `urlTitle` unique. There are SEVEN and it does. The full seven-locator correction is recorded where
 * the uniqueness rule is declared, at {@link createSkuCodePropertyValidation}.
 *
 * =============================================================================================
 * ARCHITECTURAL POSITION — AAP §0.7.3 S2, S3, S4, S5
 * =============================================================================================
 * THREE IMPORTS, ALL RELATIVE AND ALL TYPE-ONLY, so no runtime edge is emitted at all: the constraint
 * model from `../Validator`, the entity's property-name unions and the two method signatures from
 * `../../domain/sku/Sku`, and the uniqueness port's entity shape from
 * `../../ports/UniquePropertyPort`. Per AAP §0.4.3.5 every intra-subtree import is a relative path —
 * "deliberately no path aliases — so `tsc` and `esbuild` resolve identically and no runtime resolver
 * shim is needed" — and `slatwall-ts/tsconfig.json` declares neither `paths` nor `baseUrl`. There is
 * no barrel and no `index.ts`; an alias that type-checks can still throw at cold start.
 *
 * THE DEPENDENCY EDGE RUNS ONE WAY ONLY. `../Validator` never imports a rules file — it RECEIVES a
 * rule set as an argument — so the graph is acyclic by construction. This file imports no sibling
 * rules file either. In particular it does NOT import `./product.rules`: that module owns the shared
 * code-format pattern, and this document declares no format constraint, so reaching for it would be
 * an unused import.
 *
 * S2 IS A NEGATIVE OBLIGATION HERE: THIS FILE ISSUES ZERO SQL. No statement text, no query fragment,
 * no physical table or column identifier in executable position. `SwSku`, `SwSkuOption` and
 * `SwPhysicalSku` appear in prose comments only, never inside a key, a message, a constant or any
 * string literal. Even though the rules below reach the database THROUGH the domain method and the
 * unit of work, this file touches neither: it declares, it does not execute.
 *
 * CONSEQUENTLY ABSENT, EACH DELIBERATELY: any import from `adapters/`, `services/`, `config/`,
 * `handlers/` or `integrations/`; the database driver; any cloud event, result, context or handler
 * type, which coupling belongs to `src/handlers/` alone; any read of the process environment, which
 * flows one way through `src/config/env.ts`; any file-system or network access; any logging framework;
 * any schema-validation package, since AAP §0.7.3 S5 freezes the dependency set and
 * `slatwall-ts/package.json` is never edited. Collaborators arrive as explicit parameters and nowhere
 * else (S3): no service locator, no container import, no dynamic resolution, and no side effect at
 * module load beyond declaring the frozen rule data.
 *
 * NO LEGACY RAISE TEXT IS REPRODUCED ANYWHERE IN THIS FILE, not even inside a comment — locators
 * alone are cited. That applies to `org/Hibachi/HibachiService.cfc:L117` and `:L136`,
 * `org/Hibachi/HibachiErrors.cfc:L50`, `model/service/SkuService.cfc:L204`, and — specific to this
 * file's own call chain — the three raises inside `Product.getSkuBySelectedOptions` at
 * `model/entity/Product.cfc:L355`, `:L357` and `:L362`.
 */

import type {
  SkuNonPersistentPropertyName,
  SkuPropertyName,
  SkuValidatedPropertyName,
  SkusBySelectedOptionsLookup,
} from '../../domain/sku/Sku';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  DataTypeConstraint,
  EqualityConstraint,
  MaxCollectionConstraint,
  MethodConstraint,
  MinValueConstraint,
  PropertyValidation,
  RequiredConstraint,
  UniqueConstraint,
  UniqueTargetResolver,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/**
 * The validation view of a SKU that this rule set reads.
 *
 * WHY A VIEW RATHER THAN THE ENTITY ITSELF. `../Validator` requires property readers to be PLAIN
 * SYNCHRONOUS ACCESSORS, because a reader that returned a promise would be measured as an object and
 * would silently satisfy every simple-value predicate — `required` would pass on an unresolved
 * promise, `dataType numeric` would fail on one, and no error would identify the cause. Two of the
 * values this document constrains cannot be read synchronously off the entity:
 *
 *   - `getDefaultFlag(...)` in `../../domain/sku/Sku` needs an injected default-SKU reader, the
 *     explicit-injection translation of the unguarded three-hop chain at `model/entity/Sku.cfc:L443`.
 *   - `getTransactionExistsFlag(...)` is ASYNCHRONOUS there, mirroring the service round-trip its
 *     `Product` counterpart performs at `model/entity/Product.cfc:L624-L629`.
 *
 * So the caller resolves those two values once, ahead of validation, and presents them here alongside
 * the entity's own synchronously readable fields. The two METHOD members, by contrast, are declared
 * with the EXACT signatures `../../domain/sku/Sku` publishes, so a view delegates to the real domain
 * methods rather than reimplementing them (AAP §0.7.3 S3).
 *
 * EVERY VALUE MEMBER IS OPTIONAL AND TYPED `unknown`, deliberately. The legacy engine read whatever
 * the entity held and let each constraint decide — `org/Hibachi/HibachiValidationService.cfc:L240-L245`
 * measures a trimmed length, `:L269-L275` requires a number, `:L309-L315` accepts arrays and structs
 * alike. Narrowing a member to `number` here would move that decision from the constraint to the type
 * system and change which values reach a predicate at all. `unknown` keeps the constraints in charge
 * while still forbidding every unchecked operation, which is what AAP §0.7.3 S1 asks for.
 *
 * `physicalCounts` is present for exactly one reason: the source document constrains it. It is
 * declared by NEITHER of the entity's property unions, so no conforming view can supply it and the
 * guard is inert. See {@link physicalCountsPropertyValidation}.
 */
export interface SkuValidationSubject extends ValidationSubject {
  /** Resolved ahead of validation; non-persistent at `model/entity/Sku.cfc:L105`. */
  readonly defaultFlag?: unknown;

  /** `model/entity/Sku.cfc:L55` — `ormtype="big_decimal"`, ORM `default="0"`. */
  readonly listPrice?: unknown;

  /** `model/entity/Sku.cfc:L76` — the many-to-many collection this SKU OWNS. */
  readonly options?: unknown;

  /** `model/entity/Sku.cfc:L56` — `ormtype="big_decimal"`, ORM `default="0"`. */
  readonly price?: unknown;

  /** `model/entity/Sku.cfc:L57` — `ormtype="big_decimal"`, ORM `default="0"`. */
  readonly renewalPrice?: unknown;

  /** `model/entity/Sku.cfc:L54` — `unique="true" length="50"`. */
  readonly skuCode?: unknown;

  /** Resolved ahead of validation; non-persistent at `model/entity/Sku.cfc:L121`. */
  readonly transactionExistsFlag?: unknown;

  /** Constrained by `model/validation/Sku.json:13` but declared by no entity property. */
  readonly physicalCounts?: unknown;

  /**
   * `model/entity/Sku.cfc:L756-L769`. ASYNCHRONOUS — it reaches the database. The `lookup` parameter
   * is the injected replacement for the legacy `getProduct().getSkusBySelectedOptions(...)` reach at
   * `:L763`; see {@link createHasUniqueOptionsConstraint} for why it is supplied per invocation.
   */
  hasUniqueOptions(lookup: SkusBySelectedOptionsLookup): Promise<boolean>;

  /**
   * `model/entity/Sku.cfc:L772-L784`. SYNCHRONOUS, pure and in-memory, and takes no argument in the
   * legacy source or here.
   */
  hasOneOptionPerOptionGroup(): boolean;
}

/**
 * The eight property identifiers this rule set declares.
 *
 * Built on `SkuValidatedPropertyName`, which `../../domain/sku/Sku` publishes expressly for this file
 * as the set of entity-declared properties `model/validation/Sku.json` constrains — seven of them. The
 * eighth, `physicalCounts`, is added here rather than there precisely because the entity does not
 * declare it; keeping the two apart in the type is what makes the asymmetry legible instead of
 * accidental.
 */
export type SkuValidationPropertyIdentifier =
  SkuValidatedPropertyName | typeof PHYSICAL_COUNTS_IDENTIFIER;

/**
 * Hands the subject to the uniqueness port unchanged.
 *
 * RATIFIED DECISION D-2 and IR-5: the `unique` constraint is evaluated through the injected
 * `../../ports/UniquePropertyPort`, never by an ad-hoc query from this layer and never by trusting the
 * database constraint alone. `../Validator` calls the resolver, passes the result to the port and
 * returns the port's verdict UNMODIFIED — so the resolver's whole job is to expose the subject under
 * the port's entity shape.
 *
 * The identity body is not a shortcut. `org/Hibachi/HibachiDAO.cfc:L134-L140` reads the entity name,
 * the identifier property, the current identifier value and the property value off THE ENTITY BEING
 * SAVED; a resolver that substituted a different object would change which row the existence query
 * excludes. The intersection in the parameter type is what makes the identity legal: a caller must
 * present a subject that already answers the port's five accessors, because
 * `../../domain/sku/Sku` implements the validation surface but not the port's metadata surface.
 */
export function resolveSkuUniqueTarget(
  subject: SkuValidationSubject & UniquePropertyEntity,
): UniquePropertyEntity {
  return subject;
}

/**
 * `save` — `model/validation/Sku.json:4`, `:6`, `:7`, `:9`, `:10`, `:11`.
 *
 * A DEFAULTED parameter at `org/Hibachi/HibachiService.cfc:L133`, so a caller CAN override it. Matched
 * case-insensitively against a rule's contexts at `org/Hibachi/HibachiValidationService.cfc:L71`.
 */
const SAVE_CONTEXT = 'save';

/**
 * `delete` — `model/validation/Sku.json:3`, `:12`, `:13`.
 *
 * ⭐ P-2, THE DELETE-CONTEXT ASYMMETRY. `delete` is HARD-CODED at
 * `org/Hibachi/HibachiService.cfc:L55`, where the entity is validated under a literal delete context,
 * whereas `save` at `:L133` is a defaulted parameter a caller may override. So the three delete guards
 * below are UNCONDITIONAL on the delete path: no caller can substitute a laxer context to get past
 * them, and no code path deletes a SKU without them running.
 *
 * The legacy shape is validate, then check, then persist — and `../Validator` performs only the first
 * two. It NEVER persists and never deletes; the decision it returns is acted on by
 * `src/services/` and `src/adapters/`. That separation is what makes requirement N1's dry-run read
 * legitimate: the same declarations answer "would this delete be allowed?" without touching a row.
 */
const DELETE_CONTEXT = 'delete';

/**
 * `defaultFlag` — `model/validation/Sku.json:3`.
 *
 * Typed through `SkuNonPersistentPropertyName` rather than `SkuPropertyName` because
 * `model/entity/Sku.cfc:L105` declares it `persistent="false"`. The `Extract` is a compile-time
 * assertion: were the entity to stop declaring the property, this line would fail to type-check rather
 * than silently produce a guard the engine skips at
 * `org/Hibachi/HibachiValidationService.cfc:L171`.
 */
const DEFAULT_FLAG_IDENTIFIER: Extract<SkuNonPersistentPropertyName, 'defaultFlag'> = 'defaultFlag';

/** `listPrice` — `model/validation/Sku.json:4`; persistent at `model/entity/Sku.cfc:L55`. */
const LIST_PRICE_IDENTIFIER: Extract<SkuPropertyName, 'listPrice'> = 'listPrice';

/** `options` — `model/validation/Sku.json:5-8`; persistent at `model/entity/Sku.cfc:L76`. */
const OPTIONS_IDENTIFIER: Extract<SkuPropertyName, 'options'> = 'options';

/** `price` — `model/validation/Sku.json:9`; persistent at `model/entity/Sku.cfc:L56`. */
const PRICE_IDENTIFIER: Extract<SkuPropertyName, 'price'> = 'price';

/** `renewalPrice` — `model/validation/Sku.json:10`; persistent at `model/entity/Sku.cfc:L57`. */
const RENEWAL_PRICE_IDENTIFIER: Extract<SkuPropertyName, 'renewalPrice'> = 'renewalPrice';

/** `skuCode` — `model/validation/Sku.json:11`; persistent at `model/entity/Sku.cfc:L54`. */
const SKU_CODE_IDENTIFIER: Extract<SkuPropertyName, 'skuCode'> = 'skuCode';

/**
 * `transactionExistsFlag` — `model/validation/Sku.json:12`.
 *
 * Non-persistent at `model/entity/Sku.cfc:L121`, hence the same union as `defaultFlag`.
 */
const TRANSACTION_EXISTS_FLAG_IDENTIFIER: Extract<
  SkuNonPersistentPropertyName,
  'transactionExistsFlag'
> = 'transactionExistsFlag';

/**
 * `physicalCounts` — `model/validation/Sku.json:13`.
 *
 * ⭐⭐ THE `Exclude` HERE IS THE POINT, AND IT IS INVERTED RELATIVE TO EVERY IDENTIFIER ABOVE. It
 * compiles only while `physicalCounts` is declared by NEITHER `SkuPropertyName` NOR
 * `SkuNonPersistentPropertyName` — that is, only while the entity genuinely has no such property. The
 * type therefore PROVES the premise on which {@link physicalCountsPropertyValidation} rests, and if a
 * future entity revision ever added the property this line would break loudly and force the inertness
 * comment to be revisited rather than leaving a stale claim in place.
 *
 * The nearest declaration is `physicals` at `model/entity/Sku.cfc:L87`, a different property with a
 * different name. Renaming to it is forbidden — see {@link physicalCountsPropertyValidation}.
 */
const PHYSICAL_COUNTS_IDENTIFIER: Exclude<
  'physicalCounts',
  SkuPropertyName | SkuNonPersistentPropertyName
> = 'physicalCounts';

/**
 * The method name carried by the rule at `model/validation/Sku.json:6`.
 *
 * ⚠️ THIS IS A MESSAGE-KEY SEGMENT, NOT A DISPATCH KEY. The legacy engine used the string BOTH ways:
 * `org/Hibachi/HibachiValidationService.cfc:L333-L335` invoked the method by name with zero arguments,
 * and `:L222` interpolated the same string into the message key. TR-3 retires the first use and keeps
 * the second, so the constraint's `invoke` calls the member DIRECTLY while this constant supplies only
 * the fourth key segment.
 *
 * The `Extract<keyof …>` makes that safe rather than merely intended: the string is provably the name
 * of a real member of {@link SkuValidationSubject}, so the emitted key cannot drift away from the
 * method it describes even though nothing looks the method up by it.
 */
const HAS_UNIQUE_OPTIONS_METHOD_NAME: Extract<keyof SkuValidationSubject, 'hasUniqueOptions'> =
  'hasUniqueOptions';

/**
 * The method name carried by the rule at `model/validation/Sku.json:7`.
 *
 * Same standing as {@link HAS_UNIQUE_OPTIONS_METHOD_NAME}: a key segment only, compile-checked against
 * the real member name.
 */
const HAS_ONE_OPTION_PER_OPTION_GROUP_METHOD_NAME: Extract<
  keyof SkuValidationSubject,
  'hasOneOptionPerOptionGroup'
> = 'hasOneOptionPerOptionGroup';

/* ============================================================================================== *
 * PROPERTY 1 OF 8 — `defaultFlag`, delete guard        `model/validation/Sku.json:3`
 * ============================================================================================== */

/**
 * `eq false` on `defaultFlag` — `model/validation/Sku.json:3`.
 *
 * ⭐ THE LOOSE COMPARISON IS LOAD-BEARING AND IS DELIBERATELY NOT TIGHTENED.
 * `org/Hibachi/HibachiValidationService.cfc:L385-L395` declares its comparison value as a REQUIRED
 * STRING, so the JSON boolean `false` had already become the string `"false"` by the time the loose
 * CFML `==` at `:L391` ran. A loose comparison against `"false"` therefore ALSO matches `false`, `"0"`,
 * `0` and `"no"` — every value CFML treats as false-equivalent.
 *
 * `../Validator` reproduces that ladder faithfully: numeric coercion first, then boolean coercion
 * accepting `true`/`false`/`yes`/`no` in any case and any number, then a case-insensitive string
 * comparison. Declaring the value as the BOOLEAN `false` here is what routes into that ladder, so the
 * legacy tolerance is preserved by data rather than re-implemented. TIGHTENING THIS TO A STRICT
 * IDENTITY CHECK WOULD REJECT DELETES THE LEGACY SYSTEM PERMITS, whenever the calculated flag arrives
 * as `0` or `"false"` from a driver or a serialised boundary.
 *
 * ⭐ AND `eq` IS THE ONE CONSTRAINT THAT FAILS ON AN ABSENT VALUE — SO AN UNRESOLVED FLAG BLOCKS THE
 * DELETE. `org/Hibachi/HibachiValidationService.cfc:L387-L390` guards the dereference and returns
 * false for a missing value, uniquely among the constraints this document reaches: `dataType`,
 * `minValue`, `maxCollection` and `unique` all PASS on an absent value, and only `required` and `eq`
 * fail. `../Validator` matches that, returning false before it compares anything.
 *
 * The consequence is real and is preserved: if the resolved `defaultFlag` is absent, THE GUARD FAILS
 * AND THE DELETE IS REFUSED. That is legacy-faithful and it is the safe direction — an unknown default
 * status refuses the destructive operation. NO NULL-COALESCE, NO DEFAULT AND NO FALLBACK IS ADDED HERE;
 * any of them would convert a refusal into a permission, which refactor discipline guideline 4 forbids
 * and which no legacy behavior supports.
 */
export const defaultFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: false,
} as const) satisfies EqualityConstraint;

/** The sole rule on `defaultFlag` — `model/validation/Sku.json:3`, delete context only. */
export const defaultFlagDeleteRule = Object.freeze({
  contexts: DELETE_CONTEXT,
  constraints: Object.freeze([defaultFlagEqualityConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/**
 * `defaultFlag` — the first of three delete guards.
 *
 * ⭐⭐ S8 NOTE — NOT ONE OF THIS DOCUMENT'S THREE DELETE GUARDS READS A PERSISTENT COLUMN. Worth stating
 * once, here, because it is counter-intuitive for a guard that decides whether a row may be removed:
 *
 *   - `defaultFlag` is `persistent="false"` at `model/entity/Sku.cfc:L105` — CALCULATED. It is
 *     nonetheless a DECLARED property, so the gate at
 *     `org/Hibachi/HibachiValidationService.cfc:L171` passes and this guard is LIVE.
 *   - `transactionExistsFlag` is `persistent="false"` at `model/entity/Sku.cfc:L121` — also declared,
 *     also live. See {@link transactionExistsFlagPropertyValidation}.
 *   - `physicalCounts` is declared NOWHERE on the entity, so the same gate silently skips it and the
 *     guard is INERT. See {@link physicalCountsPropertyValidation}.
 *
 * So a SKU's deletability turns on two derived values and one rule that never fires — which is exactly
 * why the resolution of those two values, and the absent-value semantics above, matter more than they
 * would for an ordinary column read.
 */
export const defaultFlagPropertyValidation = Object.freeze({
  propertyIdentifier: DEFAULT_FLAG_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.defaultFlag,
  rules: Object.freeze([defaultFlagDeleteRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/* ============================================================================================== *
 * PROPERTY 2 OF 8 — `listPrice`, save                  `model/validation/Sku.json:4`
 * ============================================================================================== */

/**
 * `dataType numeric` on `listPrice` — `model/validation/Sku.json:4`.
 *
 * ⭐ X4 — THERE ARE THREE NUMERIC PRICE FIELDS IN THIS DOCUMENT, NOT ONE. The AAP's summary prose
 * names `price` and `skuCode` and the two method rules; `listPrice` at `:4` and `renewalPrice` at `:10`
 * are just as real, and dropping either would silently accept a non-numeric or negative amount the
 * legacy system rejects. All three are declared:
 *
 *   `price`        `:9`   required + dataType numeric + minValue 0   — THREE constraints
 *   `listPrice`    `:4`              dataType numeric + minValue 0   — TWO, NOT required
 *   `renewalPrice` `:10`             dataType numeric + minValue 0   — TWO, NOT required
 *
 * The entity backs all three identically at `model/entity/Sku.cfc:L55-L57`: `ormtype="big_decimal"`,
 * `hb_formatType="currency"`, `default="0"`.
 *
 * `hb_formatType="currency"` IS A DISPLAY HINT AND YIELDS NO CONSTRAINT. No currency data type, no
 * decimal-places rule, no upper bound and no two-decimal format check is derived from it. The data-type
 * whitelist at `org/Hibachi/HibachiValidationService.cfc:L258` enumerates 26 values — counted, not
 * assumed — and there is no currency member among them; an off-list value raises at `:L263`.
 * `../Validator` narrows the same idea to the two values these seven documents actually use, so an
 * invented data type fails to compile instead of raising at run time. AAP §0.7.3 S9 forbids inventing
 * the rest.
 *
 * ABSENT VALUES PASS THIS CONSTRAINT. `org/Hibachi/HibachiValidationService.cfc:L256-L266` returns true
 * for a missing value and defers to `required` — which `listPrice` does not declare. So an absent list
 * price is VALID here, and that is deliberate.
 */
export const listPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/**
 * `minValue 0` on `listPrice` — `model/validation/Sku.json:4`.
 *
 * `org/Hibachi/HibachiValidationService.cfc:L269-L275` passes on an absent value and fails on a
 * non-null value that is not a number — so it overlaps the data-type constraint rather than replacing
 * it, and both are declared because the document declares both.
 *
 * The literal `0` is source-declared at `model/validation/Sku.json:4` and is not a chosen floor.
 */
export const listPriceMinValueConstraint = Object.freeze({
  constraintType: 'minValue',
  constraintValue: 0,
} as const) satisfies MinValueConstraint;

/**
 * The sole rule on `listPrice` — `model/validation/Sku.json:4`.
 *
 * Two constraints in one rule object, which the legacy engine flattened into two independent records
 * at `org/Hibachi/HibachiValidationService.cfc:L77-L88`. Both can report against `listPrice` in a
 * single pass because evaluation never short-circuits.
 */
export const listPriceSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([listPriceDataTypeConstraint, listPriceMinValueConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `listPrice` — `model/validation/Sku.json:4`; persistent at `model/entity/Sku.cfc:L55`. */
export const listPricePropertyValidation = Object.freeze({
  propertyIdentifier: LIST_PRICE_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.listPrice,
  rules: Object.freeze([listPriceSaveRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/* ============================================================================================== *
 * PROPERTY 3 OF 8 — `options`, TWO METHOD RULES        `model/validation/Sku.json:5-8`
 *
 * THE DEFINING SECTION OF THIS FILE. IR-4 singles these two rules out by name, and AAP §0.4.1.5
 * requires them "wired to the domain methods rather than to strings".
 *
 * ⚠️ BOTH FAILURES REPORT UNDER THE KEY `options`, NEVER UNDER A METHOD NAME. All three reporting
 * branches of the legacy engine — `org/Hibachi/HibachiValidationService.cfc:L224`, `:L228` and `:L232`
 * — key the error by the PROPERTY IDENTIFIER and take exactly two arguments. Both rules below attach
 * to the same property, so both messages accumulate under `options`. THAT IS PRECISELY WHY A KEY'S
 * VALUE IS AN ARRAY, and it is the one place in this document where two DIFFERENT rule objects, rather
 * than two constraints of one rule object, converge on a single key.
 *
 * THE PROPERTY IS DECLARED, SO BOTH RULES ARE LIVE. `model/entity/Sku.cfc:L76` declares `options` as a
 * many-to-many over the SKU-option link table, so the existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` passes. Contrast `physicalCounts`, which fails the
 * same gate — see {@link physicalCountsPropertyValidation}.
 *
 * `Sku` IS THE OWNING SIDE of that many-to-many: `model/entity/Sku.cfc:L76` carries no inverse marker,
 * and `model/entity/Option.cfc:L110-L115` confirms it by delegating its own add and remove operations
 * back to the SKU. The property carries NO cascade attribute and NO delete guard — its only rules are
 * the two save-context method rules below, and inventing an `options` delete guard would reject deletes
 * the legacy system permits.
 * ============================================================================================== */

/**
 * `method hasUniqueOptions` — `model/validation/Sku.json:6`. ASYNCHRONOUS: IT QUERIES THE DATABASE.
 *
 * THE LEGACY BODY, `model/entity/Sku.cfc:L756-L769`: it accumulates the SKU's option identifiers into a
 * delimited list (`:L757-L761`), asks the product for every SKU matching that exact option selection
 * (`:L763`), and returns true only when the result is empty or is the single SKU being validated
 * (`:L764`). Declared `public any function`, NOT boolean — the engine coerced the result at
 * `org/Hibachi/HibachiValidationService.cfc:L333-L335`, and `../Validator` reproduces that coercion
 * including the raise on a result it cannot coerce.
 *
 * ⭐⭐ M6 — THIS IS THE READ-BACK LOOP. This constraint is the entry point of the cycle traced in full
 * in the file header: a save triggers validation, validation runs this rule, and this rule queries the
 * very table the save is writing. The three obligations are restated here because this is where they
 * bite, and all three are satisfied by what this factory does NOT do:
 *
 *   1. It holds no collection of subjects, so nothing can batch or reorder the per-SKU invocations that
 *      `model/service/SkuService.cfc:L58-L211` produces in odometer order.
 *   2. It returns the promise from the domain method unawaited, leaving sequencing entirely to
 *      `../Validator`, which awaits each constraint in turn and never settles them together.
 *   3. IT CACHES NOTHING. Every invocation calls through to a live lookup, so each SKU's uniqueness
 *      read observes the writes already made by its predecessors inside the same transaction — the
 *      guarantee `src/adapters/mysql/UnitOfWork.ts` provides and this file must not defeat. Memoising a
 *      verdict, or resolving the sibling set once and reusing it, would break M6 silently, which is the
 *      whole hazard AAP §0.6.2 warns about. Per M7 any memoisation would in any case have to be
 *      request-scoped rather than module-scoped; none is used, which is the simplest compliant answer.
 *
 * WHY A FACTORY RATHER THAN A CONSTANT. `hasUniqueOptions` in `../../domain/sku/Sku` takes an injected
 * option-resolution lookup — the explicit-injection translation of the legacy reach through
 * `getProduct().getSkusBySelectedOptions(...)` at `model/entity/Sku.cfc:L763`, which resolved a service
 * dynamically. Binding it at module scope would capture a request-scoped collaborator for the lifetime
 * of the module; supplying it per invocation keeps M6 obligation 3 and M7 both intact. AAP §0.7.3 S3
 * forbids reintroducing a locator to avoid the parameter, so the parameter stays.
 *
 * ⭐ THE CALL IS A DIRECT MEMBER INVOCATION, NOT A NAME LOOKUP. The legacy engine used the method NAME
 * as a dispatch key at `org/Hibachi/HibachiValidationService.cfc:L333-L335`; TR-3 retires exactly that.
 * `invoke` calls the member directly and {@link HAS_UNIQUE_OPTIONS_METHOD_NAME} survives only as the
 * message-key segment. The call is wrapped in an arrow rather than passed as a bare member reference so
 * the receiver is preserved — an unbound reference would lose it and fail at run time.
 *
 * ⭐ A CASE-SENSITIVITY DIVERGENCE, ACCEPTED DELIBERATELY. The self-exclusion at
 * `model/entity/Sku.cfc:L764` compares two identifiers with CFML `==`, which is CASE-INSENSITIVE; the
 * strict comparison in `../../domain/sku/Sku` is case-sensitive. Per IR-6 every primary key in this
 * system is a 32-character UUID string generated in application code, emitted as lowercase hexadecimal
 * with no dashes, so no two identifiers can differ by case alone and the strict comparison decides
 * every real case identically. Recorded rather than smoothed over, because the mechanism genuinely
 * changed even though the outcome does not.
 *
 * ⭐⭐ TODO(parity) D19 — model/entity/Sku.cfc:L764 — AAP §0.6.2. AN OPTION-LESS SKU FAILS THIS RULE
 * WHENEVER ITS PRODUCT ALREADY HAS OPTION-BEARING SKUS, AND THAT DEFECT IS CARRIED, NOT REPAIRED.
 *
 * The chain: for a SKU with zero options the accumulated list stays empty, because `:L757` initialises
 * it empty and the loop at `:L759` never runs. Per T5 an empty selection is a LEGAL, MEANINGFUL input —
 * the list length of an empty string is zero, so the query builder at `model/dao/SkuDAO.cfc:L107-L128`
 * appends no existence clause and the query degenerates to "every option-bearing SKU of this product".
 * The guard at `:L764` then passes only when that result is empty or is this SKU alone. A product that
 * already has option-bearing SKUs therefore makes the guard FAIL for an option-less default SKU.
 *
 * AAP §0.6.2 requires this be "carried across as observed behavior with a `TODO(parity)` annotation
 * rather than repaired". So: NO empty-options short circuit is added, the `:L764` guard is NOT rewritten,
 * and a default SKU is NOT special-cased. Refactor discipline guideline 4 — do not enhance or optimise
 * business logic beyond what the migration requires — is what forbids the obvious fix, and AAP §0.7.3
 * S7 is what requires the annotation instead.
 *
 * T5 CALLER PRECISION, WHICH IS WHY GUARDING AGAINST AN EMPTY SELECTION IS NOT AN OPTION EITHER. The
 * degenerate empty-selection form is depended on by this rule AND by the plural
 * `Product.getSkusBySelectedOptions` at `model/entity/Product.cfc:L366-L368`, which defaults the
 * selection to empty. It is NOT depended on by the singular `Product.getSkuBySelectedOptions` at
 * `:L349-L364`, which tests the selection's length at `:L350` and never reaches the query on the empty
 * path. Rejecting an empty selection would therefore break the first two callers while leaving the
 * third untouched — a change that would look locally harmless.
 */
export function createHasUniqueOptionsConstraint(
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): MethodConstraint<SkuValidationSubject> {
  const constraint: MethodConstraint<SkuValidationSubject> = {
    constraintType: 'method',
    constraintValue: HAS_UNIQUE_OPTIONS_METHOD_NAME,
    invoke: (subject: SkuValidationSubject): Promise<boolean> =>
      subject.hasUniqueOptions(selectedOptionsLookup),
  };

  return Object.freeze(constraint);
}

/**
 * `method hasOneOptionPerOptionGroup` — `model/validation/Sku.json:7`. SYNCHRONOUS, PURE, IN-MEMORY.
 *
 * THE LEGACY BODY, `model/entity/Sku.cfc:L772-L784`: it walks the SKU's options accumulating each
 * option's group identifier, and returns false the moment it meets one it has already seen. AAP §0.6.2
 * describes it as "pure and in-memory — it walks `getOptions()` and returns false on the first repeated
 * `optionGroup.optionGroupID` — and ports as a straightforward loop with no data access at all."
 * Declared `public any function` like its sibling, and coerced the same way.
 *
 * ⭐ THE SYNC/ASYNC CONTRAST IS THE POINT, NOT AN INCONSISTENCY. Two rules sit on one property in one
 * context: {@link createHasUniqueOptionsConstraint} reaches the database and is asynchronous, this one
 * touches nothing outside the object graph already in memory and is synchronous. `../Validator`
 * evaluates both in a single pass without being forced to split them, and it must not be: the
 * asynchronous rule's ordering carries the M6 guarantee, while making the synchronous rule asynchronous
 * to match would add an await the legacy system never had. The declarations keep each one's true nature.
 *
 * ⭐ SHORT-CIRCUITS ON THE FIRST REPEAT — `model/entity/Sku.cfc:L777` returns immediately. The loop is
 * NOT rewritten into a count-all-duplicates or group-and-compare form. Those forms agree on the verdict
 * but not on the work done, and the early return is the observed behavior.
 *
 * ⭐ AN EMPTY OPTION COLLECTION PASSES VACUOUSLY. With no options the loop body never executes and
 * `:L783` returns true. Note the asymmetry with its sibling, which FAILS the same SKU under the
 * conditions described in the D19 annotation above — the two rules on this property disagree about what
 * an option-less SKU means, and both behaviors are preserved as they are.
 *
 * ⭐ A CASE-SENSITIVITY DIVERGENCE IN THE OPPOSITE DIRECTION, AND IT IS NOT HARMONISED.
 * `model/entity/Sku.cfc:L776` tests for the repeat with a CASE-SENSITIVE list search, deliberately
 * unlike the case-INSENSITIVE searches the engine itself uses for context matching at
 * `org/Hibachi/HibachiValidationService.cfc:L71` and for list membership at `:L459-L465`. The
 * strict comparison in `../../domain/sku/Sku` matches the case-sensitive legacy behavior exactly. Making
 * the three agree would be a behavior change dressed as a cleanup.
 *
 * S8 NOTE — THE CHAINED READ IS FRAGILE, AND THAT FRAGILITY IS LEGACY STRUCTURE. `:L776` and `:L779`
 * both reach through an option to its group and then to that group's identifier.
 * `model/entity/Option.cfc:L59` declares the option-to-group relationship WITHOUT a required marker,
 * and `:L106` genuinely removes it, so an in-memory option can lack a group and this chained read would
 * fail on one. Requiredness is enforced only at save time, by `model/validation/Option.json`. Surfaced
 * here as an observation; NOT a carried defect and NOT assigned a register number, because the register
 * is closed and this is documented legacy structure rather than a fault introduced by the port.
 *
 * S7 NOTE, UNNUMBERED BY DESIGN — THE DOCUMENTATION HINT ABOVE THIS METHOD IS A COPY-PASTE ARTEFACT.
 * `model/entity/Sku.cfc:L771` is byte-identical to `:L755`, so it describes this method as validating a
 * unique option combination — which is its sibling's job, not its own. Verified by comparing the two
 * lines directly. Recorded WITHOUT a defect number: AAP §0.6.7 closes the register, and inventing an
 * entry for a stray comment would corrupt an inventory that reviewers rely on. The behavior is
 * unaffected; only the legacy hint is wrong.
 */
export const hasOneOptionPerOptionGroupMethodConstraint = Object.freeze({
  constraintType: 'method',
  constraintValue: HAS_ONE_OPTION_PER_OPTION_GROUP_METHOD_NAME,
  invoke: (subject: SkuValidationSubject): boolean => subject.hasOneOptionPerOptionGroup(),
} as const) satisfies MethodConstraint<SkuValidationSubject>;

/**
 * The FIRST rule object on `options` — `model/validation/Sku.json:6`, save context.
 *
 * A factory for the same reason its constraint is: the lookup is request-scoped. Kept separate from the
 * second rule object so the net-new suite can assert each method rule in isolation (AAP §0.7.3 S6).
 */
export function createHasUniqueOptionsSaveRule(
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): ValidationRule<SkuValidationSubject> {
  const rule: ValidationRule<SkuValidationSubject> = {
    contexts: SAVE_CONTEXT,
    constraints: Object.freeze([createHasUniqueOptionsConstraint(selectedOptionsLookup)]),
  };

  return Object.freeze(rule);
}

/** The SECOND rule object on `options` — `model/validation/Sku.json:7`, save context. */
export const hasOneOptionPerOptionGroupSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([hasOneOptionPerOptionGroupMethodConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/**
 * `options` — TWO rule objects, in source-document order.
 *
 * `hasUniqueOptions` at `model/validation/Sku.json:6` comes first and
 * `hasOneOptionPerOptionGroup` at `:7` second, matching the document. Both report under `options`.
 *
 * THE READER IS HONEST BUT UNREAD BY THESE RULES, and that is faithful. A property validation must
 * supply a reader, and this one genuinely returns the SKU's option collection. The method arm of
 * `../Validator` does not consult it, exactly as the legacy engine did not: `:L333-L335` handed the
 * METHOD the whole object and never the property value. The reader is nonetheless correct rather than a
 * placeholder, so anything that does read it — a diagnostic, a future non-method rule on this property —
 * gets the real collection.
 */
export function createOptionsPropertyValidation(
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): PropertyValidation<SkuValidationSubject> {
  const propertyValidation: PropertyValidation<SkuValidationSubject> = {
    propertyIdentifier: OPTIONS_IDENTIFIER,
    read: (subject: SkuValidationSubject): unknown => subject.options,
    rules: Object.freeze([
      createHasUniqueOptionsSaveRule(selectedOptionsLookup),
      hasOneOptionPerOptionGroupSaveRule,
    ]),
  };

  return Object.freeze(propertyValidation);
}

/* ============================================================================================== *
 * PROPERTY 4 OF 8 — `price`, save                      `model/validation/Sku.json:9`
 *
 * THE ONLY PROPERTY IN THIS DOCUMENT CARRYING THREE CONSTRAINTS. The legacy engine flattened them into
 * three independent records at `org/Hibachi/HibachiValidationService.cfc:L77-L88`, and because
 * evaluation never short-circuits all three can report against `price` in one pass.
 * ============================================================================================== */

/**
 * `required` on `price` — `model/validation/Sku.json:9`. THE ONLY REQUIRED PRICE OF THE THREE.
 *
 * ⭐ ZERO SATISFIES THIS CONSTRAINT, AND THAT IS THE DECISIVE DETAIL. The legacy check at
 * `org/Hibachi/HibachiValidationService.cfc:L240-L245` measures the TRIMMED LENGTH of the value, and
 * the trimmed length of `0` is one — so zero PASSES. Since `model/entity/Sku.cfc:L56` gives the property
 * an ORM `default="0"`, A FRESHLY CONSTRUCTED SKU ALREADY SATISFIES `price required` WITHOUT ANYONE
 * SETTING A PRICE. What this constraint actually rejects is an absent value, an empty string, a
 * whitespace-only string and an empty collection; any object passes, because its trimmed length is
 * non-zero. `../Validator` reproduces that ladder rather than substituting a truthiness test, which
 * would wrongly reject zero and silently make every default-priced SKU invalid.
 *
 * The constraint's own value is DECLARED BUT UNUSED by the legacy check — `:L240-L245` never reads it —
 * so the `true` below is the document's declaration faithfully carried, not a switch that anything
 * consults.
 */
export const priceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `dataType numeric` on `price` — `model/validation/Sku.json:9`.
 *
 * Identical in kind to {@link listPriceDataTypeConstraint}, where the 26-value whitelist and the
 * refusal to derive anything from the currency display hint are recorded in full. Declared separately
 * rather than shared because it is a separate declaration in the source document, and because a shared
 * constant would make the three price properties look like one rule with three subjects.
 */
export const priceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/**
 * `minValue 0` on `price` — `model/validation/Sku.json:9`.
 *
 * ⛔ AN ASYMMETRY WITH `Product.price` THAT IS REAL LEGACY STRUCTURE AND IS NOT HARMONISED.
 * `model/validation/Product.json:8` declares its `price` as required and numeric with NO minimum, while
 * `model/validation/Sku.json:9` declares all three. So a negative product price passes validation and a
 * negative SKU price does not. Neither side is adjusted: `minValue` is not added to the product rule —
 * that document belongs to `./product.rules` — and it is not removed from this one. Making the two agree
 * would change which saves succeed on both sides at once, in opposite directions.
 */
export const priceMinValueConstraint = Object.freeze({
  constraintType: 'minValue',
  constraintValue: 0,
} as const) satisfies MinValueConstraint;

/**
 * The sole rule on `price` — `model/validation/Sku.json:9`, three constraints in source key order.
 *
 * Order is `required`, then `dataType`, then `minValue`, matching the document. As recorded in the file
 * header this ordering is a determinism choice with no legacy counterpart: the engine iterated an
 * unordered struct, and because errors accumulate the SET of failures is order-independent. Fixing the
 * order only fixes the sequence of the reported messages, which is what makes them assertable.
 */
export const priceSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([
    priceRequiredConstraint,
    priceDataTypeConstraint,
    priceMinValueConstraint,
  ]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `price` — `model/validation/Sku.json:9`; persistent at `model/entity/Sku.cfc:L56`. */
export const pricePropertyValidation = Object.freeze({
  propertyIdentifier: PRICE_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.price,
  rules: Object.freeze([priceSaveRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/* ============================================================================================== *
 * PROPERTY 5 OF 8 — `renewalPrice`, save               `model/validation/Sku.json:10`
 * ============================================================================================== */

/**
 * `dataType numeric` on `renewalPrice` — `model/validation/Sku.json:10`.
 *
 * The third of the three numeric price fields recorded under X4 at
 * {@link listPriceDataTypeConstraint}. Backed by `model/entity/Sku.cfc:L57` with the same big-decimal
 * type, currency display hint and `default="0"` as its two siblings, and — like `listPrice` and unlike
 * `price` — NOT required, so an absent renewal price is valid.
 */
export const renewalPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/** `minValue 0` on `renewalPrice` — `model/validation/Sku.json:10`. */
export const renewalPriceMinValueConstraint = Object.freeze({
  constraintType: 'minValue',
  constraintValue: 0,
} as const) satisfies MinValueConstraint;

/** The sole rule on `renewalPrice` — `model/validation/Sku.json:10`. */
export const renewalPriceSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([renewalPriceDataTypeConstraint, renewalPriceMinValueConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `renewalPrice` — `model/validation/Sku.json:10`; persistent at `model/entity/Sku.cfc:L57`. */
export const renewalPricePropertyValidation = Object.freeze({
  propertyIdentifier: RENEWAL_PRICE_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.renewalPrice,
  rules: Object.freeze([renewalPriceSaveRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/* ============================================================================================== *
 * PROPERTY 6 OF 8 — `skuCode`, save                    `model/validation/Sku.json:11`
 *
 * ⭐⭐ THE MIRROR-IMAGE TRAP OF THIS FILE, AND IT CUTS BOTH WAYS.
 *
 * `model/entity/Sku.cfc:L54` declares the column `unique="true" length="50"`. TWO OPPOSITE MISTAKES
 * FOLLOW FROM READING THAT LINE CARELESSLY:
 *
 *   1. CONCLUDING THAT THE DATABASE CONSTRAINT MAKES THE VALIDATION RULE REDUNDANT, and dropping the
 *      application-side uniqueness check. IR-5 exists precisely to forbid that — see
 *      {@link createSkuCodeUniqueConstraint}.
 *   2. CONCLUDING THAT `length="50"` IMPLIES A LENGTH RULE, and inventing one. The document declares no
 *      such rule — see the maximum-length note below.
 *
 * Both errors change which saves succeed, in opposite directions, and neither produces an error message
 * that points at the cause.
 *
 * ⛔ NO MAXIMUM-LENGTH CONSTRAINT IS DECLARED HERE, DELIBERATELY. `model/validation/Sku.json:11`
 * declares exactly two constraints, `required` and `unique`, and no length constraint appears anywhere
 * in the document. Adding one from the column metadata would REJECT SAVES THE LEGACY VALIDATION LAYER
 * ACCEPTS — a fifty-one-character code is refused by the database, not by validation, and the two
 * failures surface in different places with different messages. Across all seven in-scope documents a
 * maximum-length constraint appears EXACTLY ONCE, on the product type's system code with the value zero,
 * which is itself evidence of how rarely this vocabulary is used rather than a licence to spread it.
 * AAP §0.7.3 S9 and refactor discipline guideline 4 both forbid the addition. The same reasoning applies
 * to `imageFile` at `model/entity/Sku.cfc:L58`, which also carries a length and also gets no rule.
 * S8 NOTE, recorded as an observation rather than a carried defect: the legacy document is not wrong, it
 * simply relies on the database for that particular guarantee.
 * ============================================================================================== */

/**
 * `required` on `skuCode` — `model/validation/Sku.json:11`.
 *
 * The trimmed-length measurement at `org/Hibachi/HibachiValidationService.cfc:L240-L245` matters
 * differently here than it does for `price`: an empty string and a whitespace-only string both FAIL, so
 * a SKU code consisting of spaces is rejected — but the value is NOT trimmed before being stored, and
 * nothing here normalises it. The constraint measures; it does not transform.
 *
 * Unlike the three price properties this one has no ORM default at `model/entity/Sku.cfc:L54`, so a
 * freshly constructed SKU does NOT satisfy this constraint — the contrast with
 * {@link priceRequiredConstraint}, where the default `"0"` passes, is worth keeping in view.
 */
export const skuCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `unique` on `skuCode` — `model/validation/Sku.json:11`. THE ONLY UNIQUENESS RULE IN THIS DOCUMENT.
 *
 * ⭐ IR-5 REQUIRES THIS RULE EVEN THOUGH THE DATABASE ALREADY ENFORCES THE COLUMN. Verbatim:
 * "Application-side uniqueness checking is required in addition to database constraints.
 * `HibachiDAO.isUniqueProperty()` [org/Hibachi/HibachiDAO.cfc:L130-L146] enforces uniqueness with an HQL
 * existence query during validation, independently of the `unique="true"` column metadata."
 *
 * SO `skuCode` IS DOUBLE-ENFORCED, and deliberately so. `model/entity/Sku.cfc:L54` carries the column
 * constraint AND `model/validation/Sku.json:11` carries the validation rule. That is the OPPOSITE of the
 * two comparable code properties in this slice: `model/entity/Option.cfc:L53` and
 * `model/entity/OptionGroup.cfc:L54` carry NO column constraint at all, so for those two the validation
 * document is the ONLY enforcement that exists. The difference matters because it means neither
 * mechanism can be treated as the general rule — dropping validation here would still leave a database
 * error, while dropping it there would leave nothing.
 *
 * ⭐⭐ X8 — THERE ARE SEVEN UNIQUENESS RULES ACROSS THE SEVEN IN-SCOPE DOCUMENTS, NOT SIX AND NOT FIVE.
 * Counted directly, twice, by searching the seven documents for the constraint key:
 *
 *   model/validation/Product.json:10       productCode
 *   model/validation/Product.json:16       urlTitle          <- denied outright by one upstream document
 *   model/validation/Sku.json:11           skuCode           <- THIS RULE
 *   model/validation/Brand.json:5          urlTitle
 *   model/validation/Option.json:3         optionCode
 *   model/validation/OptionGroup.json:4    optionGroupCode
 *   model/validation/ProductType.json:4    urlTitle          <- invisible to that same document
 *
 * `model/validation/Product_UpdateSkus.json` contributes none.
 *
 * TWO UPSTREAM DOCUMENTS UNDERCOUNT THIS, AND THE CORRECTION IS RECORDED HERE RATHER THAN THERE.
 * `../../ports/UniquePropertyPort` states six and asserts that `model/validation/Product.json` declares
 * its url title required but not unique; the measurement above shows seven and shows that it does. The
 * root cause is that its own survey omits `model/validation/ProductType.json` entirely, which is why the
 * seventh rule is invisible to it and why its own table is internally inconsistent. `../Validator`
 * independently carries the corrected count, so the only stale statement left in the subtree is that one
 * port document — and it is NOT edited, because a sibling file is never modified from here.
 *
 * ⭐ RECONCILING IR-5's "FIVE OF THE EIGHT" SO THE TWO NUMBERS STOP LOOKING LIKE A CONTRADICTION. IR-5
 * counts ENTITY COLUMN METADATA, a different and independent mechanism, as IR-5 itself says. Searching
 * the entity tree for the column marker returns EIGHT declarations system-wide —
 * `model/entity/Currency.cfc:L52`, `model/entity/Product.cfc:L54` and `:L56`,
 * `model/entity/ProductType.cfc:L56`, `model/entity/MeasurementUnit.cfc:L58`,
 * `model/entity/Integration.cfc:L53`, `model/entity/Brand.cfc:L55` and `model/entity/Sku.cfc:L54` — of
 * which five belong to this slice. The VALIDATION-DOCUMENT count is SEVEN. BOTH STATEMENTS ARE TRUE;
 * THEY MEASURE DIFFERENT THINGS. Stated explicitly so the next reader does not "correct" one into the
 * other and lose a real rule in the process.
 *
 * RATIFIED DECISION D-2 — EVALUATION ROUTES THROUGH THE INJECTED PORT AND NOWHERE ELSE. The resolver
 * arrives as a parameter, `../Validator` hands its result to `../../ports/UniquePropertyPort` and returns
 * the port's answer unchanged. This file issues no query of its own and does not fall back on the column
 * constraint. See {@link resolveSkuUniqueTarget} for why the resolver must expose the entity being saved
 * rather than any substitute.
 *
 * ⭐ POLARITY, PINNED FROM FIRST-HAND EVIDENCE: TRUE MEANS UNIQUE, WHICH MEANS SAFE TO SAVE.
 * `org/Hibachi/HibachiDAO.cfc:L142-L144` returns false when the existence query finds a row, and `:L146`
 * returns true when it finds none. INVERTING THIS SILENTLY INVERTS EVERY UNIQUENESS RULE IN THE SLICE —
 * duplicates would be admitted and first saves refused, with no error to explain either.
 *
 * ⭐ THE SELF-EXCLUSION CLAUSE IS A NO-OP ON INSERT, AND THAT IS NOT A BUG TO FIX. The query at
 * `org/Hibachi/HibachiDAO.cfc:L136-L140` excludes the row whose identifier matches the entity being
 * validated, so an UPDATE does not collide with itself. On an INSERT there is no identifier to exclude
 * yet — `model/entity/Sku.cfc:L52` declares the identifier with an empty unsaved value — so the clause
 * matches nothing and the query degenerates to a plain existence check. Correct in both cases, and
 * preserved as it stands.
 *
 * ⭐ AN ABSENT VALUE PASSES THIS CONSTRAINT, INDIRECTLY. `org/Hibachi/HibachiValidationService.cfc:L467-L470`
 * has NO null guard and delegates the whole entity to the checker, and its own constraint value is
 * declared but unused. So the port must not raise on an absent value, must not rewrite the comparison
 * into a null test, and must not answer false for one; absence is `required`'s business, and here
 * `required` is declared alongside so the pair covers it. The shortened property name the engine derives
 * at `:L208` is used only to compose the message and is never the error key — this failure reports under
 * `skuCode`.
 */
export function createSkuCodeUniqueConstraint<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): UniqueConstraint<TSubject> {
  const constraint: UniqueConstraint<TSubject> = {
    constraintType: 'unique',
    constraintValue: true,
    uniqueTarget: resolveUniqueTarget,
  };

  return Object.freeze(constraint);
}

/**
 * The sole rule on `skuCode` — `model/validation/Sku.json:11`, two constraints in source key order.
 *
 * `required` first, `unique` second. Both are independent records after the flattening at
 * `org/Hibachi/HibachiValidationService.cfc:L77-L88`, and because evaluation never short-circuits BOTH
 * can report against `skuCode` in a single pass — an absent code fails `required` and is then still
 * handed to the uniqueness check, which passes it for the reason given above.
 */
export function createSkuCodeSaveRule<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): ValidationRule<TSubject> {
  const rule: ValidationRule<TSubject> = {
    contexts: SAVE_CONTEXT,
    constraints: Object.freeze([
      skuCodeRequiredConstraint,
      createSkuCodeUniqueConstraint(resolveUniqueTarget),
    ]),
  };

  return Object.freeze(rule);
}

/** `skuCode` — `model/validation/Sku.json:11`; persistent and column-unique at `model/entity/Sku.cfc:L54`. */
export function createSkuCodePropertyValidation<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): PropertyValidation<TSubject> {
  const propertyValidation: PropertyValidation<TSubject> = {
    propertyIdentifier: SKU_CODE_IDENTIFIER,
    read: (subject: TSubject): unknown => subject.skuCode,
    rules: Object.freeze([createSkuCodeSaveRule(resolveUniqueTarget)]),
  };

  return Object.freeze(propertyValidation);
}

/* ============================================================================================== *
 * PROPERTY 7 OF 8 — `transactionExistsFlag`, delete guard   `model/validation/Sku.json:12`
 * ============================================================================================== */

/**
 * `eq false` on `transactionExistsFlag` — `model/validation/Sku.json:12`.
 *
 * The constraint semantics are identical to {@link defaultFlagEqualityConstraint}, where the loose
 * comparison and the absent-value failure are documented in full. Both apply here unchanged: the value
 * stays the BOOLEAN so the coercion ladder is reached, and an unresolved flag REFUSES the delete rather
 * than permitting it. No coalesce is added.
 *
 * ⭐ WHAT MAKES THIS FLAG DIFFERENT FROM ITS SIBLING IS THE COST OF PRODUCING IT. `defaultFlag` is
 * derived from the product's default SKU; this one asks whether any transaction anywhere references the
 * SKU. `model/entity/Sku.cfc:L121` declares it `persistent="false"`, and the `Product` counterpart at
 * `model/entity/Product.cfc:L624-L629` shows the shape of the answer — a memoised service round-trip,
 * which the service exposes with NO arguments at `model/service/SkuService.cfc:L285-L287` even though the
 * underlying data-access member accepts optional product and SKU identifiers. The work itself is the
 * ten-branch existence chain at `model/dao/SkuDAO.cfc:L53-L98`, which belongs to
 * `src/adapters/mysql/` and is reached from `../../domain/sku/Sku` asynchronously.
 *
 * WHICH IS WHY THE VALUE IS RESOLVED BEFORE VALIDATION RATHER THAN READ DURING IT. A property reader must
 * be synchronous, as {@link SkuValidationSubject} explains, so the caller awaits this flag once and
 * presents it. That is a mechanical consequence of the execution model, not a change of behavior: the
 * legacy engine also read a value the entity had already computed by the time validation ran.
 */
export const transactionExistsFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: false,
} as const) satisfies EqualityConstraint;

/** The sole rule on `transactionExistsFlag` — `model/validation/Sku.json:12`, delete context only. */
export const transactionExistsFlagDeleteRule = Object.freeze({
  contexts: DELETE_CONTEXT,
  constraints: Object.freeze([transactionExistsFlagEqualityConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/**
 * `transactionExistsFlag` — the second of three delete guards, and the second that reads no column.
 *
 * Non-persistent at `model/entity/Sku.cfc:L121` but DECLARED, so the existence gate at
 * `org/Hibachi/HibachiValidationService.cfc:L171` passes and this guard is LIVE. See
 * {@link defaultFlagPropertyValidation} for the full statement of why none of the three guards reads a
 * persistent column.
 */
export const transactionExistsFlagPropertyValidation = Object.freeze({
  propertyIdentifier: TRANSACTION_EXISTS_FLAG_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.transactionExistsFlag,
  rules: Object.freeze([transactionExistsFlagDeleteRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/* ============================================================================================== *
 * PROPERTY 8 OF 8 — `physicalCounts`, delete guard      `model/validation/Sku.json:13`
 * ============================================================================================== */

/**
 * `maxCollection 0` on `physicalCounts` — `model/validation/Sku.json:13`.
 *
 * Kept as its own exported value even though the rule it belongs to never fires, so the net-new suite can
 * assert that the declaration was carried rather than having to prove the absence of something.
 *
 * TWO SEMANTICS WORTH RECORDING, BECAUSE THEY BOUND HOW MUCH THIS GUARD COULD EVER HAVE DONE.
 * `org/Hibachi/HibachiValidationService.cfc:L309-L315` PASSES on an absent value, and an EMPTY
 * collection PASSES a maximum of zero — it also accepts a struct as a countable value, and fails a
 * non-null simple value outright. So even if the property existed, this guard would only ever bite on a
 * NON-EMPTY collection. The literal `0` is source-declared and is not a chosen threshold.
 */
export const physicalCountsMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/** The sole rule on `physicalCounts` — `model/validation/Sku.json:13`, delete context only. */
export const physicalCountsDeleteRule = Object.freeze({
  contexts: DELETE_CONTEXT,
  constraints: Object.freeze([physicalCountsMaxCollectionConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/**
 * `physicalCounts` — DECLARED VERBATIM, AND INERT AT RUN TIME.
 *
 * ⭐⭐ B2b — THIS GUARD NAMES A PROPERTY THE ENTITY DOES NOT HAVE, SO THE LEGACY ENGINE SILENTLY SKIPPED
 * IT. The three facts, each measured:
 *
 *   - `model/validation/Sku.json:13` declares the rule against `physicalCounts`.
 *   - `model/entity/Sku.cfc` declares NO property of that name anywhere in its property block
 *     (`L52-L121`). The nearest declaration is `physicals` at `:L87` — a DIFFERENT property, an inverse
 *     many-to-many to the physical entity over the physical-SKU link table.
 *   - `org/Hibachi/HibachiValidationService.cfc:L171` gates every rule on the object actually declaring
 *     the property. It does not, so the rule is SKIPPED — no error, no warning, no effect. THE GUARD HAS
 *     NEVER FIRED IN THE LEGACY SYSTEM.
 *
 * {@link PHYSICAL_COUNTS_IDENTIFIER} encodes that premise in the type system, so the claim above cannot
 * quietly go stale.
 *
 * ⛔ THE MANDATE, AND WHY EACH TEMPTING ALTERNATIVE IS WRONG:
 *
 *   - IT IS DECLARED, NOT DROPPED. AAP §0.7.3 S7 preserves and annotates, and refactor discipline
 *     guideline 2 requires behavior preserved exactly as-is. The document declares this rule, so the port
 *     declares it. Dropping it would silently discard a documented declaration and leave a reviewer
 *     comparing the two unable to tell whether it was considered.
 *   - IT IS NOT RENAMED TO `physicals`. That is the single most tempting edit in this file and it would be
 *     a behavior change of the worst kind: it would ACTIVATE a guard the legacy system never runs,
 *     BLOCKING DELETES THE LEGACY SYSTEM PERMITS for any SKU with a physical association. Guideline 4
 *     forbids it.
 *   - NO ENTITY IS ASKED TO GROW THE FIELD. `../../domain/sku/Sku` is a sibling file and is never
 *     modified from here; adding the property there would activate this guard just as surely as renaming
 *     it, only less visibly.
 *
 * ONE OF FOUR FILES CARRYING THIS SAME INERT GUARD — `./product.rules`, this file, `./brand.rules` and
 * `./productType.rules` each declare a `physicalCounts` maximum-collection guard against an entity that
 * does not declare the property. Handled identically in each, which is what makes the pattern legible as
 * a property of the legacy documents rather than an oddity of any one port.
 */
export const physicalCountsPropertyValidation = Object.freeze({
  propertyIdentifier: PHYSICAL_COUNTS_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.physicalCounts,
  rules: Object.freeze([physicalCountsDeleteRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/* ============================================================================================== *
 * WHAT THIS DOCUMENT DOES NOT DECLARE — AAP §0.7.3 S9, INVENT NOTHING
 *
 * `model/entity/Sku.cfc` declares roughly fifty properties across its persistent, relationship, remote,
 * audit and non-persistent blocks. EIGHT are constrained. Every absence below was checked against the
 * source document rather than assumed, and each is left absent on purpose — a rule invented here would
 * reject saves or deletes the legacy system permits, which is the one failure mode that produces no
 * error message pointing at its own cause.
 *
 *   `skuID`                    `:L52`  the identifier. No required rule, NO 32-character length rule and
 *                                      no format rule. IR-6's 32-character generation belongs to
 *                                      `src/util/uuid.ts`, not to validation.
 *   `activeFlag`               `:L53`  boolean with an ORM default. No data-type rule and specifically NO
 *   `userDefinedPriceFlag`     `:L59`  equality rule. The five equality uses across the seven documents
 *                                      are the three delete-guard flags here and on siblings, plus two
 *                                      update-flag conditions in another document — nowhere else.
 *   `imageFile`                `:L58`  carries a length, gets NO length rule, for the reason given at
 *                                      property 6. No path, extension or address rule either; the address
 *                                      data type is used exactly once folder-wide, on a brand's website.
 *   `calculatedQATS`           `:L62`  a calculated column the document ignores entirely.
 *   `product`                  `:L65`  ⭐ S8 NOTE — NOT DECLARED REQUIRED, ASYMMETRICALLY WITH
 *                                      `model/validation/Option.json`, WHICH DOES DECLARE ITS OWN
 *                                      MANY-TO-ONE REQUIRED. The asymmetry is sharp here because
 *                                      `hasUniqueOptions` reaches through this very relationship at
 *                                      `model/entity/Sku.cfc:L763` and would fail without it. Real legacy
 *                                      structure; surfaced, NOT repaired, and no rule added.
 *   `subscriptionTerm`         `:L66`  many-to-one to an out-of-scope entity. No rule.
 *   `alternateSkuCodes`        `:L69`  ⛔ FOUR COLLECTIONS DECLARE DELETE-ORPHAN CASCADE AND THIS DOCUMENT
 *   `attributeValues`          `:L70`     GUARDS NONE OF THEM; `orderItems` at `:L71` is lazy and also
 *   `skuCurrencies`            `:L72`     unguarded. Declaring a guard for any would reject deletes the
 *   `stocks`                   `:L73`     legacy system permits. In particular NO `stocks` guard is added
 *                                         on the strength of `stocksDeletableFlag` — see the note below.
 *                                         `model/validation/SkuCurrency.json` is out of scope per AAP
 *                                         §0.2.2.4, so none of its rules is merged here either.
 *   `accessContents`           `:L77`  many-to-many owner collections reaching out-of-scope entities.
 *   `subscriptionBenefits`     `:L78`  No rules.
 *   `renewalSubscriptionBenefits` `:L79`
 *   promotion and price-group  `:L82-L86`  five inverse collections. No rules.
 *   `physicals`                `:L87`  NOT what `model/validation/Sku.json:13` names. See property 8.
 *   `remoteID`                 `:L90`  and the four audit properties at `:L93-L96`, all with population
 *                                      disabled — `src/domain/base/AuditableEntity.ts`'s concern.
 *   the non-persistent block   `:L99-L121`  twenty-three properties, of which this document names exactly
 *                                      two. No rule for any of the rest, and specifically none for the
 *                                      calculated members AAP §0.2.2.6 excludes — the sale-price family,
 *                                      live and current-account price, availability, currency detail,
 *                                      fulfilment methods, next-available date and the administrative
 *                                      icon. Those reach exclusively into out-of-scope services and sit
 *                                      behind ports; NO port is imported to reach them and none is
 *                                      validated.
 *
 * `stocksDeletableFlag` `:L120` DESERVES ITS OWN LINE, BECAUSE IT LOOKS LIKE A DELETE GUARD AND IS NOT ONE.
 * No rule in `model/validation/Sku.json` names it — verified against the document, not inferred. It is
 * also the visible end of a broken chain: `model/entity/Sku.cfc:L567-L572` delegates to
 * `model/service/SkuService.cfc:L281-L283`, which delegates to a data-access member that EXISTS NOWHERE
 * IN THE REPOSITORY. That is defect D4. BECAUSE NO RULE REACHES IT, THIS FILE DECLARES NO RULE FOR IT AND
 * CARRIES NO D4 ANNOTATION — the defect is real but it is not on this file's path, and annotating it here
 * would imply a dependency that does not exist.
 *
 * THE FORBIDDEN VOCABULARY. Only the thirteen constraint keys the seven documents actually use are
 * available, and this file reaches seven of them. Vocabulary that exists elsewhere in the 96-document
 * corpus or in the engine but NEVER in these seven — other data types such as an address, a date or a
 * card format; minimum-length, property-comparison, nullability, maximum-value, populated-property and
 * nested-validation keys; and the engine's unused ordering comparators — appears at ZERO occurrences here.
 * `../Validator` models the constraints as a discriminated union, so an invented key fails to compile
 * rather than raising the way the legacy engine did at
 * `org/Hibachi/HibachiValidationService.cfc:L202`. THE ONLY NUMERIC LITERALS IN THIS FILE ARE THE THREE
 * ZERO MINIMUMS AT `model/validation/Sku.json:4`, `:9` AND `:10` AND THE ONE ZERO MAXIMUM AT `:13`, every
 * one of them source-declared with a locator.
 * ============================================================================================== */

/**
 * Assembles the complete `Sku` rule set — the transliteration of `model/validation/Sku.json` as a whole.
 *
 * EIGHT PROPERTY VALIDATIONS IN SOURCE-DOCUMENT KEY ORDER: `defaultFlag`, `listPrice`, `options`,
 * `price`, `renewalPrice`, `skuCode`, `transactionExistsFlag`, `physicalCounts`. Nine rule objects and
 * fourteen constraints in total, as tallied and reconciled in the file header. There is no ninth
 * property.
 *
 * ⭐ THIS IS THE ONLY ASSEMBLED FORM, WHICH IS A DELIBERATE DIVERGENCE FROM THE OTHER SIX RULE SETS. Each
 * of them also exports a fully assembled frozen constant at module scope; this one does not, and the
 * reason is M6 obligation 3 rather than taste. A module-scope rule set would have to capture the
 * option-resolution lookup in a closure living as long as the module, which on a warm container outlives
 * the invocation that created it — the cross-invocation bleed M7 forbids — and a stale lookup would read
 * against a finished transaction, defeating the same-transaction visibility `hasUniqueOptions` depends on.
 * Supplying both collaborators per invocation keeps the request boundary intact. The full argument is in
 * the file header; it is summarised here because this is the function whose shape it dictates.
 *
 * NOTHING IS CACHED AND NOTHING IS SHARED BETWEEN CALLS. Each call rebuilds the two collaborator-bearing
 * property validations and reuses the six frozen collaborator-free ones, which hold no state and cannot
 * bleed. The returned rule set is frozen, so a caller cannot mutate the declarations another caller will
 * read.
 *
 * ON THE DELETE PATH NEITHER COLLABORATOR IS CONSULTED — the three delete guards declare no uniqueness and
 * no method rule, and context matching at `org/Hibachi/HibachiValidationService.cfc:L71` excludes every
 * save-context rule. They are still parameters of this function because one document produces one rule
 * set; that is what keeps requirement N1's dry-run deletability read evaluable from the same declarations
 * the save path uses.
 *
 * `conditions` IS OMITTED ENTIRELY RATHER THAN SET EMPTY. `model/validation/Sku.json` declares no
 * conditional rule anywhere — unlike `model/validation/Product_UpdateSkus.json`, whose rules are
 * conditional on update flags — and under `exactOptionalPropertyTypes` an optional member must be absent
 * rather than explicitly empty.
 *
 * EVERY RULE REMAINS INDIVIDUALLY IMPORTABLE (AAP §0.7.3 S6). The net-new suite at
 * `slatwall-ts/test/validation/rules.test.ts` — which this file does NOT create, because it belongs to
 * the sibling test subtree — can assert each constraint, each rule object and each property validation in
 * isolation, and can assert the two method rules separately from one another and the D19 behavior as the
 * observed behavior it is.
 *
 * @param resolveUniqueTarget exposes the entity being saved to the uniqueness port; pass
 *   {@link resolveSkuUniqueTarget} unless a caller has a genuine reason to adapt it.
 * @param selectedOptionsLookup resolves the SKUs matching an option selection, for the request currently
 *   in flight. MUST be scoped to the active transaction so `hasUniqueOptions` observes sibling SKUs
 *   already written by the same combination batch.
 */
export function createSkuValidationRules<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): ValidationRuleSet<TSubject> {
  const ruleSet: ValidationRuleSet<TSubject> = {
    properties: Object.freeze([
      defaultFlagPropertyValidation,
      listPricePropertyValidation,
      createOptionsPropertyValidation(selectedOptionsLookup),
      pricePropertyValidation,
      renewalPricePropertyValidation,
      createSkuCodePropertyValidation(resolveUniqueTarget),
      transactionExistsFlagPropertyValidation,
      physicalCountsPropertyValidation,
    ]),
  };

  return Object.freeze(ruleSet);
}
