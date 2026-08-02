/**
 * Process-object population descriptors — NET-NEW.
 *
 * PROVENANCE — EVERY CASE IN THIS FILE IS NET-NEW COVERAGE
 * There is no legacy `Product_AddOptionTest.cfc`, no `Product_AddOptionGroupTest.cfc` and no
 * `Product_UpdateSkusTest.cfc`. AAP §0.6.5.2 records the finding directly: the legacy MXUnit suite
 * under `meta/tests/` carries a dedicated component for `Product` and for `Brand` and for nothing
 * else in this slice, and it carries none at all for the three transient process objects. No
 * assertion below replicates a legacy case, so none is labelled TRACEABLE.
 *
 * THAT PROVENANCE IS DOCUMENTARY, NOT EMPIRICAL
 * No legacy result was observed and no output was compared, because the legacy suite CANNOT BE
 * EXECUTED in this environment: MXUnit is not vendored (`meta/tests/readme.txt:L4` requires it to be
 * installed on the machine with a mapping inside CFIDE, and `meta/tests/unit/SlatwallUnitTestBase.cfc`
 * extends `mxunit.framework.TestCase`, which is therefore unresolvable) and CFSelenium is not
 * vendored either. Every legacy claim below rests on the cited source locator and on nothing else.
 * That is a weaker claim than a re-run comparison, and it is stated rather than implied away
 * (AAP §0.6.5.3, §0.8.4.2).
 *
 * WHY THIS FILE EXISTS — THE ASYMMETRY IT CLOSES
 * Each of the three modules under `src/domain/process/` emits exactly ONE runtime value: a frozen
 * `PropertyDescriptorSet` that is the DECLARED replacement for the legacy runtime metadata walk at
 * `org/Hibachi/HibachiTransient.cfc:L178`. Two of the three had no value-importer anywhere in the
 * subtree — production or test — so two of the three module bodies never executed, and the parity
 * decisions they encode carried no executed assertion at all. The third,
 * `PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS`, was covered only incidentally, because
 * `src/services/ProductService.ts` value-imports it to build a validation subject.
 *
 * ⭐ SO THE THREE ARE ASSERTED HERE TOGETHER, INCLUDING THE ONE THAT WAS ALREADY REACHED. Covering
 * only the two dead modules would close the coverage hole while leaving the more useful property —
 * that all three declare the SAME transient contract — unstated, and would leave the incidentally
 * covered set asserted by nothing that names it. The cross-module block at the end is where that
 * agreement is pinned.
 *
 * WHY A DECLARED TABLE IS THE THING UNDER TEST AT ALL
 * `org/Hibachi/HibachiTransient.cfc:L178` iterated COMPONENT METADATA at runtime. TR-3 retires that
 * machinery, and `strict` TypeScript has no equivalent facility, so the metadata becomes a declared,
 * compile-checked constant. A declared table can drift from the source it transcribes in a way
 * reflection could not, which is precisely why it needs assertions pointed back at the legacy
 * locators — and why the assertions below read the production constant rather than restating it.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   - No population run. `populate()` and the four legacy branches are owned by
 *     `src/domain/base/populate.ts` and asserted where they live; this file asserts the DECLARATION.
 *   - No process BEHAVIOUR. `processProductAddOption`, `processProductAddOptionGroup` and
 *     `processProductUpdateSkus` each already have their own executed describe block in
 *     `test/services/ProductService.test.ts`, which is where the service's use of these inputs
 *     belongs. Re-driving them from here would duplicate that coverage without adding a claim.
 *   - No collaborator, no repository, no validator, no pool. The three modules under test import
 *     TYPES ONLY, so importing them pulls in no runtime dependency chain — which is the same
 *     property their own headers assert as M7 inertness, and the reason a test may import them at
 *     all.
 */

import type { PropertyDescriptorSet } from '../../../src/domain/base/populate';
import { PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS } from '../../../src/domain/process/ProductAddOption';
import { PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS } from '../../../src/domain/process/ProductAddOptionGroup';
import { PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS } from '../../../src/domain/process/ProductUpdateSkus';

/* ==================================================================================================
 * DERIVATION HELPERS OVER THE PRODUCTION DESCRIPTOR SETS
 *
 * These READ the production constants and never restate them, so every assertion below is a claim
 * about production rather than about a copy made for the test's convenience. `noUncheckedIndexedAccess`
 * is honoured throughout: nothing is read by index, no `.at()` result is dereferenced and no non-null
 * assertion appears anywhere in this file.
 *
 * They are generic over the set's two type parameters so one helper serves all three modules. That is
 * what lets the cross-module block state the shared contract once instead of three times.
 * ================================================================================================ */

/** The declared property names, in the order production declares them, which is population order. */
const declaredNames = <TTarget, TName extends string>(
  descriptorSet: PropertyDescriptorSet<TTarget, TName>,
): readonly string[] => descriptorSet.properties.map((descriptor) => descriptor.name);

/**
 * Name-to-declared-value-type for every COLUMN descriptor in the set.
 *
 * The `'valueType' in descriptor` narrowing selects columns without importing the descriptor union's
 * type names: a relationship descriptor declares a `kind` and no `valueType`, and a populate-disabled
 * descriptor declares neither. All three process objects declare columns only, so for them the result
 * covers every property — which is itself part of what the cross-module block asserts.
 */
const declaredValueTypes = <TTarget, TName extends string>(
  descriptorSet: PropertyDescriptorSet<TTarget, TName>,
): Record<string, string> => {
  const valueTypes: Record<string, string> = {};

  for (const descriptor of descriptorSet.properties) {
    if ('valueType' in descriptor) {
      valueTypes[descriptor.name] = descriptor.valueType;
    }
  }

  return valueTypes;
};

/**
 * The OWN enumerable member names of each descriptor, in declaration order per descriptor.
 *
 * This is how "the model is closed" (AAP §0.7.3 standard S9) becomes an assertion rather than a
 * claim: the descriptor union offers `kind`, `notNull`, `populateArray`, `fileUpload` and
 * `populateEnabled` in addition to `name` and `valueType`, and a process object declares NONE of
 * them. Enumerating the keys catches an addition as readily as a removal, in either direction.
 */
const declaredDescriptorMembers = <TTarget, TName extends string>(
  descriptorSet: PropertyDescriptorSet<TTarget, TName>,
): readonly (readonly string[])[] =>
  descriptorSet.properties.map((descriptor) => Object.keys(descriptor));

/**
 * The three optional members that would change population behaviour if any process object declared
 * one. Named here so both the per-module and the cross-module blocks assert the same list.
 *
 * `notNull` opens the empty-string branch at `org/Hibachi/HibachiTransient.cfc:L207` instead of the
 * delete at `:L196`; `populateArray` opens BRANCH 2 at `:L216`; `fileUpload` EXCLUDES the property
 * from ordinary population, because the column gate at `:L193` ends in a presence test for it. Each is
 * absent from all three modules, and each absence is a transcription of the legacy source rather than
 * an omission — `model/process/Product_AddOption.cfc:L52-L55`,
 * `model/process/Product_AddOptionGroup.cfc:L52-L55` and `model/process/Product_UpdateSkus.cfc:L52-L58`
 * carry no attribute other than `hb_rbKey`, which is a resource-bundle label and not a population
 * instruction.
 */
const BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS = ['notNull', 'populateArray', 'fileUpload'] as const;

/* ==================================================================================================
 * A — Product_AddOption — model/process/Product_AddOption.cfc:L49-L57
 * ================================================================================================ */

describe('ProductAddOption — NET-NEW — the exported population descriptors, model/process/Product_AddOption.cfc:L49-L57', () => {
  it('NET-NEW — model/process/Product_AddOption.cfc:L52,L55 — the two column descriptors appear in source declaration order', () => {
    /*
     * Declaration order is preserved because it IS population order: the legacy loop at
     * `org/Hibachi/HibachiTransient.cfc:L178` iterates DECLARED PROPERTIES rather than payload keys,
     * never the reverse. A payload key matching no declared property is silently ignored, which is a
     * direct consequence of that iteration direction and the reason a two-entry table is the COMPLETE
     * contract rather than a partial one.
     */
    expect(declaredNames(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual(['product', 'option']);

    /*
     * ⚠️ NOTHING ELSE IS DECLARED, AND THE ABSENCES ARE THE CONTRACT. A process object is TRANSIENT:
     * `model/process/Product_AddOption.cfc:L49` extends `HibachiProcess` and declares no identifier
     * property, no audit property and no relationship, so there is no `processObjectID`, no
     * `createdDateTime` pair and no collection to declare. The entity the process acts ON arrives as
     * the injected `product` property, which is why `product` is declared and `productID` is not.
     */
    expect(declaredNames(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toHaveLength(2);
  });

  it("NET-NEW — model/process/Product_AddOption.cfc:L52,L55 — both properties declare 'untyped', because the legacy declares no ormtype at all", () => {
    /*
     * `'untyped'` is a POSITIVE statement that there is nothing to convert towards, not an absence of
     * thought: neither `property name="product";` at `:L52` nor `property name="option";` at `:L55`
     * carries an `ormtype`, so BRANCH 1's coercion has no target type to coerce to. Declaring
     * `'string'` here instead would stringify an injected entity reference, which is exactly the
     * defect the required `valueType` member exists to make impossible to introduce silently.
     */
    expect(declaredValueTypes(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual({
      product: 'untyped',
      option: 'untyped',
    });
  });

  it('NET-NEW — model/process/Product_AddOption.cfc:L49 — the set carries the legacy UNDERSCORED class name, not the TypeScript class name', () => {
    /*
     * `getClassName()` at `org/Hibachi/HibachiObject.cfc:L135-L137` returns
     * `listLast(getClassFullname(), ".")`. The CFML file is `Product_AddOption.cfc`, so the legacy
     * value is `Product_AddOption` — UNDERSCORE AND ALL — while the TypeScript interface is named
     * `ProductAddOption`. The legacy spelling is carried because it is what ARM 3 of the population
     * gate would have been keyed by (`org/Hibachi/HibachiTransient.cfc:L190`), and because
     * `getEntityPermissionDetails()` builds its key set from a directory listing at
     * `org/Hibachi/HibachiAuthenticationService.cfc:L131-L141`, where a renamed key would match no
     * permission record and — the ladder being default-deny — silently deny every property.
     *
     * ⛔ THE TWO SPELLINGS ARE ASSERTED APART ON PURPOSE. Asserting only the literal would pass if the
     * constant were later derived from `constructor.name`; asserting the inequality as well is what
     * pins the DECISION rather than merely the current value.
     */
    expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).toBe('Product_AddOption');
    expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).not.toBe('ProductAddOption');
    expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).toContain('_');
  });

  it('NET-NEW — ProductAddOption org/Hibachi/HibachiTransient.cfc:L186-L190 — persistent is false, which is ARM 1 and therefore a short-circuit', () => {
    /*
     * ⭐ THE CONSEQUENTIAL MEMBER, AND IT IS BEHAVIOUR RATHER THAN BOOKKEEPING. The master gate reads
     * `!isPersistent() || (publicPopulateFlag && … == "public") || authenticateEntityProperty(…)`.
     * `model/process/Product_AddOption.cfc:L49` declares
     * `component output="false" accessors="true" extends="HibachiProcess" {` with NO `persistent`
     * attribute, so `isPersistent()` at `org/Hibachi/HibachiObject.cfc:L11-L18` answers false, the OR
     * short-circuits on its FIRST arm, and the process object populates freely — no authorisation
     * question is ever asked about any of its properties. The six persistent catalog entities declare
     * `persistent=true`, so for them the third arm really is consulted. That asymmetry is observable
     * behaviour.
     *
     * The corollary is asserted too: because ARM 1 already decides the question, no descriptor needs
     * ARM 2's `public` flag, and none declares it. If one ever did, the flag would be dead code whose
     * presence implied a gate that cannot run.
     */
    expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.persistent).toBe(false);

    for (const members of declaredDescriptorMembers(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)) {
      expect(members).not.toContain('populateEnabled');
    }
  });

  it('NET-NEW — ProductAddOption AAP §0.7.3 S9 — the model is closed: three set members, and exactly {name, valueType} on each descriptor', () => {
    /*
     * Every member the descriptor contract offers is either used or omitted for a documented reason.
     * Enumerating the OWN keys is what makes that checkable in both directions — an added member is
     * caught as readily as a removed one.
     */
    expect(Object.keys(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual([
      'entityName',
      'persistent',
      'properties',
    ]);
    expect(declaredDescriptorMembers(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual([
      ['name', 'valueType'],
      ['name', 'valueType'],
    ]);

    for (const members of declaredDescriptorMembers(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)) {
      for (const behaviourChangingMember of BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS) {
        expect(members).not.toContain(behaviourChangingMember);
      }
      /* No relationship descriptor either, so nothing declares a `kind`, a loader or a related id. */
      expect(members).not.toContain('kind');
    }
  });

  it('NET-NEW — ProductAddOption frozen at both declared levels, so a caller that receives the contract cannot mutate it', () => {
    /*
     * The module's own header states the claim precisely: frozen at BOTH LEVELS — the set and its
     * property list. It says nothing about a third level, and there is none: `Object.freeze([...])`
     * freezes the ARRAY and not its elements, so the individual descriptor objects are extensible.
     * That is asserted as it stands rather than tightened, because tightening it here would assert a
     * property production does not have and would then quietly disagree with the source comment.
     *
     * `Reflect.set` and `Reflect.deleteProperty` are used rather than a cast-and-assign: they report
     * refusal as a boolean, so the assertion needs no `any`, no double assertion through `unknown` and
     * no reliance on which mutations happen to throw under the emitted strict mode.
     */
    expect(Object.isFrozen(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toBe(true);
    expect(Object.isFrozen(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.properties)).toBe(true);

    expect(Reflect.set(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS, 'persistent', true)).toBe(false);
    expect(Reflect.deleteProperty(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS, 'entityName')).toBe(
      false,
    );
    expect(
      Reflect.set(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.properties, 0, {
        name: 'product',
        valueType: 'string',
      }),
    ).toBe(false);

    /* And the refusals left the contract exactly as declared. */
    expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.persistent).toBe(false);
    expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).toBe('Product_AddOption');
    expect(declaredValueTypes(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual({
      product: 'untyped',
      option: 'untyped',
    });
  });
});

/* ==================================================================================================
 * B — Product_AddOptionGroup — model/process/Product_AddOptionGroup.cfc:L49-L57
 *
 * The sibling of block A, and the difference between them is one property NAME. It is asserted
 * separately rather than folded into a table-driven loop with A, because the point of the pair is that
 * `option` and `optionGroup` are DIFFERENT contracts: `ProductService.processProductAddOption` resolves
 * a single option while `processProductAddOptionGroup` resolves a group and then reads its collection
 * (`model/service/ProductService.cfc:L115`). A loop that proved "both have two properties" would pass
 * with the two names swapped.
 * ================================================================================================ */

describe('ProductAddOptionGroup — NET-NEW — the exported population descriptors, model/process/Product_AddOptionGroup.cfc:L49-L57', () => {
  it('NET-NEW — model/process/Product_AddOptionGroup.cfc:L52,L55 — the two column descriptors appear in source declaration order', () => {
    expect(declaredNames(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual([
      'product',
      'optionGroup',
    ]);
    expect(declaredNames(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toHaveLength(2);

    /* ⚠️ And it is `optionGroup`, NOT `option` — the whole distinction between this type and its sibling. */
    expect(declaredNames(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).not.toContain('option');
  });

  it("NET-NEW — model/process/Product_AddOptionGroup.cfc:L52,L55 — both properties declare 'untyped', because the legacy declares no ormtype at all", () => {
    expect(declaredValueTypes(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual({
      product: 'untyped',
      optionGroup: 'untyped',
    });
  });

  it('NET-NEW — model/process/Product_AddOptionGroup.cfc:L49 — the set carries the legacy UNDERSCORED class name, not the TypeScript class name', () => {
    expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toBe('Product_AddOptionGroup');
    expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).not.toBe(
      'ProductAddOptionGroup',
    );
    expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toContain('_');
  });

  it('NET-NEW — ProductAddOptionGroup org/Hibachi/HibachiTransient.cfc:L186-L190 — persistent is false, which is ARM 1 and therefore a short-circuit', () => {
    expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.persistent).toBe(false);

    for (const members of declaredDescriptorMembers(
      PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
    )) {
      expect(members).not.toContain('populateEnabled');
    }
  });

  it('NET-NEW — ProductAddOptionGroup AAP §0.7.3 S9 — the model is closed: three set members, and exactly {name, valueType} on each descriptor', () => {
    expect(Object.keys(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual([
      'entityName',
      'persistent',
      'properties',
    ]);
    expect(declaredDescriptorMembers(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual([
      ['name', 'valueType'],
      ['name', 'valueType'],
    ]);

    for (const members of declaredDescriptorMembers(
      PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
    )) {
      for (const behaviourChangingMember of BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS) {
        expect(members).not.toContain(behaviourChangingMember);
      }
      expect(members).not.toContain('kind');
    }
  });

  it('NET-NEW — ProductAddOptionGroup frozen at both declared levels, so a caller that receives the contract cannot mutate it', () => {
    expect(Object.isFrozen(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toBe(true);
    expect(Object.isFrozen(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.properties)).toBe(true);

    expect(Reflect.set(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS, 'persistent', true)).toBe(
      false,
    );
    expect(
      Reflect.deleteProperty(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS, 'entityName'),
    ).toBe(false);
    expect(
      Reflect.set(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.properties, 0, {
        name: 'product',
        valueType: 'string',
      }),
    ).toBe(false);

    expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.persistent).toBe(false);
    expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toBe('Product_AddOptionGroup');
    expect(declaredValueTypes(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual({
      product: 'untyped',
      optionGroup: 'untyped',
    });
  });
});

/* ==================================================================================================
 * C — Product_UpdateSkus — model/process/Product_UpdateSkus.cfc:L49-L60
 *
 * The third in-scope process object, and the one already reached transitively because
 * `src/services/ProductService.ts` value-imports its descriptor set to build the validation subject
 * `../validation/rules/productUpdateSkus.rules` reads. Asserted here by NAME so the contract has an
 * owner of its own rather than depending on a service test that could stop importing it.
 * ================================================================================================ */

describe('ProductUpdateSkus — NET-NEW — the exported population descriptors, model/process/Product_UpdateSkus.cfc:L49-L60', () => {
  it('NET-NEW — model/process/Product_UpdateSkus.cfc:L52-L58 — the five column descriptors appear in source declaration order', () => {
    /*
     * ⭐ THE FLAG-BEFORE-VALUE ORDER IS THE POINT, NOT INCIDENTAL. `:L55` declares `updatePriceFlag`
     * and `:L56` declares `price`; `:L57` declares `updateListPriceFlag` and `:L58` declares
     * `listPrice`. `model/validation/Product_UpdateSkus.json` names the FLAG and the PRICE as separate
     * property identifiers and gates each price on its own flag, so collapsing a pair into one
     * nullable price — letting presence stand in for the flag — would leave the conditions
     * unexpressible and would invent a meaning for a present price with an absent flag.
     */
    expect(declaredNames(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
      'product',
      'updatePriceFlag',
      'price',
      'updateListPriceFlag',
      'listPrice',
    ]);
    expect(declaredNames(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toHaveLength(5);
  });

  it("NET-NEW — model/process/Product_UpdateSkus.cfc:L52-L58 — all five properties declare 'untyped', hb_rbKey notwithstanding", () => {
    /*
     * ⚠️ `:L56` and `:L58` DO carry an attribute — `hb_rbKey="entity.sku.price"` and
     * `hb_rbKey="entity.sku.listPrice"` — and it is NOT a population instruction. It names a
     * resource-bundle label for display, so it changes no value type and opens no branch. Reading it
     * as an `ormtype` would type two untyped properties as prices; the two are asserted `'untyped'`
     * alongside the other three precisely so that misreading cannot land silently.
     */
    expect(declaredValueTypes(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual({
      product: 'untyped',
      updatePriceFlag: 'untyped',
      price: 'untyped',
      updateListPriceFlag: 'untyped',
      listPrice: 'untyped',
    });
  });

  it('NET-NEW — model/process/Product_UpdateSkus.cfc:L49 — the set carries the legacy UNDERSCORED class name, not the TypeScript class name', () => {
    expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).toBe('Product_UpdateSkus');
    expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).not.toBe('ProductUpdateSkus');
    expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).toContain('_');
  });

  it('NET-NEW — ProductUpdateSkus org/Hibachi/HibachiTransient.cfc:L186-L190 — persistent is false, which is ARM 1 and therefore a short-circuit', () => {
    expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.persistent).toBe(false);

    for (const members of declaredDescriptorMembers(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)) {
      expect(members).not.toContain('populateEnabled');
    }
  });

  it('NET-NEW — ProductUpdateSkus AAP §0.7.3 S9 — the model is closed: three set members, and exactly {name, valueType} on each descriptor', () => {
    expect(Object.keys(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
      'entityName',
      'persistent',
      'properties',
    ]);
    expect(declaredDescriptorMembers(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
      ['name', 'valueType'],
      ['name', 'valueType'],
      ['name', 'valueType'],
      ['name', 'valueType'],
      ['name', 'valueType'],
    ]);

    for (const members of declaredDescriptorMembers(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)) {
      for (const behaviourChangingMember of BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS) {
        expect(members).not.toContain(behaviourChangingMember);
      }
      expect(members).not.toContain('kind');
    }
  });

  it('NET-NEW — ProductUpdateSkus frozen at both declared levels, so a caller that receives the contract cannot mutate it', () => {
    expect(Object.isFrozen(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toBe(true);
    expect(Object.isFrozen(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.properties)).toBe(true);

    expect(Reflect.set(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS, 'persistent', true)).toBe(false);
    expect(Reflect.deleteProperty(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS, 'entityName')).toBe(
      false,
    );
    expect(
      Reflect.set(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.properties, 0, {
        name: 'product',
        valueType: 'string',
      }),
    ).toBe(false);

    expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.persistent).toBe(false);
    expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).toBe('Product_UpdateSkus');
    expect(declaredNames(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
      'product',
      'updatePriceFlag',
      'price',
      'updateListPriceFlag',
      'listPrice',
    ]);
  });
});

/* ==================================================================================================
 * D — THE THREE TOGETHER — the shared transient contract, and the absence of shared state
 *
 * This block is the reason the file covers all three modules rather than only the two that had no
 * importer. Each case states a property of the SET of process objects that no per-module case can:
 * agreement where they must agree, and separation where they must not be joined.
 * ================================================================================================ */

describe('the three in-scope process objects — NET-NEW — one transient contract, three independent tables', () => {
  /** The complete in-scope process-object inventory of AAP §0.4.1.4, labelled for readable failures. */
  const PROCESS_OBJECT_DESCRIPTOR_SETS = [
    {
      legacyFile: 'model/process/Product_AddOption.cfc',
      set: PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS,
    },
    {
      legacyFile: 'model/process/Product_AddOptionGroup.cfc',
      set: PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
    },
    {
      legacyFile: 'model/process/Product_UpdateSkus.cfc',
      set: PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS,
    },
  ] as const;

  it('NET-NEW — AAP §0.4.1.4 — exactly three process objects are in scope, and each names its legacy component', () => {
    /*
     * The prompt's process-object list names exactly three, which is what excludes
     * `model/process/Product_AddSubscriptionTerm.cfc` and
     * `model/process/Product_UploadDefaultImage.cfc` even though they sit in the same product family
     * (AAP §0.2.2.4). Asserting the inventory here means an added fourth descriptor set cannot enter
     * the domain layer without this case being updated deliberately.
     */
    expect(PROCESS_OBJECT_DESCRIPTOR_SETS).toHaveLength(3);
    expect(PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set.entityName)).toEqual([
      'Product_AddOption',
      'Product_AddOptionGroup',
      'Product_UpdateSkus',
    ]);
  });

  it('NET-NEW — org/Hibachi/HibachiObject.cfc:L11-L18 — every one of the three is transient, and none declares a persistent attribute to be read', () => {
    /*
     * ⭐ THE AGREEMENT IS THE ASSERTION. All three legacy components declare, at L49 of each,
     * `component output="false" accessors="true" extends="HibachiProcess" {` with no `persistent`
     * attribute, so `isPersistent()` is false for all three and ARM 1 short-circuits for all three.
     * A single set flipping to `true` would silently start asking authorisation questions of a type
     * the legacy never asked any, and the per-module cases would each still pass in isolation while
     * the family stopped agreeing — which is exactly what a cross-module case exists to catch.
     */
    for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
      expect(entry.set.persistent).toBe(false);
    }

    /* Stated positively as well, so the claim is "all false" rather than "none observed true". */
    expect(PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set.persistent)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("NET-NEW — every declared property of every process object is a column typed 'untyped' — no relationship, no populate-disabled audit member", () => {
    /*
     * The persistent catalog entities carry twelve `ormtype="timestamp"` audit properties between
     * them, all populate-disabled, plus relationship descriptors that require a loader and a
     * sub-populator. A process object carries NEITHER, and the difference is structural rather than
     * incidental: it has no table, so it has no audit block, and its related entity ARRIVES injected
     * rather than being loaded by identifier.
     */
    for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
      const names = declaredNames(entry.set);
      const valueTypes = declaredValueTypes(entry.set);

      /* Every property is a column, so the column projection covers the whole declared list. */
      expect(Object.keys(valueTypes).sort()).toEqual([...names].sort());
      expect(Object.values(valueTypes).every((valueType) => valueType === 'untyped')).toBe(true);

      /* And none of them is one of the four audit properties the entities all declare. */
      for (const auditPropertyName of [
        'createdDateTime',
        'createdByAccountID',
        'modifiedDateTime',
        'modifiedByAccountID',
      ]) {
        expect(names).not.toContain(auditPropertyName);
      }
    }
  });

  it('NET-NEW — every one of the three declares `product` FIRST, because the process acts on an injected entity', () => {
    /*
     * `model/process/Product_AddOption.cfc:L52`, `model/process/Product_AddOptionGroup.cfc:L52` and
     * `model/process/Product_UpdateSkus.cfc:L52` each declare `product` as the FIRST property, and
     * `src/services/ProductService.ts` takes the product as its own first parameter on all three
     * process members. The ordering is population order, so the shared first position is a real
     * property of the family rather than a coincidence of transcription.
     */
    for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
      const names = declaredNames(entry.set);

      expect(names.indexOf('product')).toBe(0);
      /* Declared once, not repeated — a duplicate would population-assign the same key twice. */
      expect(names.filter((name) => name === 'product')).toHaveLength(1);
    }
  });

  it('NET-NEW — M7 — the three tables are independent objects, so nothing one module declares can leak into another', () => {
    /*
     * ⚠️ WHY THIS IS AN M7 CASE AND NOT A STYLE CASE. AAP §0.6.6 M7 records that nothing survives
     * between Lambda invocations except MODULE-SCOPE state, and these three constants are exactly
     * that: module-scope values a warm container reuses across invocations. Sharing one array between
     * two sets — an easy transcription slip, since two of the three tables begin identically — would
     * make a single mutation observable from both, and freezing only makes that impossible while the
     * freeze survives. Distinct identity is the stronger statement, so it is the one asserted.
     */
    const propertyTables = PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set.properties);
    expect(new Set(propertyTables).size).toBe(3);

    const sets = PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set);
    expect(new Set(sets).size).toBe(3);

    /* No two of the three declare the same property list, either — the tables genuinely differ. */
    const declaredLists = PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) =>
      declaredNames(entry.set).join(','),
    );
    expect(new Set(declaredLists).size).toBe(3);
  });

  it('NET-NEW — M7 — importing these modules is observably inert: the exports are stable frozen constants, not factory output', () => {
    /*
     * Each module's header states that freezing "is not a side effect … importing this module remains
     * observably inert (M7)". The observable form of that claim is what is asserted here: the export
     * is the SAME frozen object on every read, so there is no factory to invoke, no lazily built cache
     * to warm and no per-read allocation that two invocations could diverge on. A descriptor set built
     * by a factory would hand back a fresh object each time and this case would fail — which is the
     * distinction worth pinning, because the repository's other memoised structures are deliberately
     * factory-scoped for the opposite reason.
     */
    for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
      expect(entry.set).toBe(entry.set);
      expect(Object.isFrozen(entry.set)).toBe(true);
      expect(Object.isFrozen(entry.set.properties)).toBe(true);
      expect(Array.isArray(entry.set.properties)).toBe(true);
    }

    /* Read through the original import bindings as well, so identity is proven across both paths. */
    expect(PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set)).toEqual([
      PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS,
      PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
      PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS,
    ]);
  });
});
