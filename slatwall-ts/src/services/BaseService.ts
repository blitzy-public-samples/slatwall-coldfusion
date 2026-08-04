/**
 * `BaseService` — the injectable `save` / `delete` collaborator that replaces CFML template-method
 * inheritance for the extracted Catalog slice.
 *
 * Authority: AAP §0.4.1.8 — the local `save` and `delete` overrides at
 * `model/service/HibachiService.cfc:L86` and `:L68` become an injectable collaborator (IR-8, rule R3).
 *
 * IR-8 — this is the local override, not the framework base. The difference is the file.
 * The hierarchy is two levels deep. `model/service/HibachiService.cfc:L49` extends the
 * fully-qualified `Slatwall.org.Hibachi.HibachiService`, while all four in-scope services declare
 * `extends="HibachiService"` with no package prefix — `model/service/ProductService.cfc:L49`,
 * `model/service/SkuService.cfc:L49`, `model/service/BrandService.cfc:L49` and
 * `model/service/OptionService.cfc:L49`. They therefore inherit the local class, and the local class
 * adds behaviour the framework base does not have: the settings and comments cleanup after a
 * successful removal (`model/service/HibachiService.cfc:L76` and `:L79`) and the activeFlag
 *
 * TODO(boundary): both port implementations belong to whoever brings `model/service/SettingService.cfc`
 * and a comment service into scope. Nothing in this subtree implements either, and nothing here may.
 */

import type { AuditableEntity } from '../domain/base/AuditableEntity';
import {
  populate,
  type EntityErrorSurface,
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
 */
const DEFAULT_SAVE_CONTEXT: ValidationContext = 'save';

/**
 * The context the inherited removal path validates under, from
 * [org/Hibachi/HibachiService.cfc:L55] — `arguments.entity.validate(context="delete")`.
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
 */
const NO_SETTINGS_REMOVED = 0;

/**
 * The five class names whose save clears the whole settings cache, from the `listFindNoCase` list at
 * [model/service/HibachiService.cfc:L98], in the legacy order.
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
 * @typeParam TEntity - The entity type this persister handles.
 */
export type EntityPersister<TEntity> = (entity: TEntity) => Promise<TEntity>;

/**
 * Removes an entity's row and its many-to-many link rows.
 *
 * @typeParam TEntity - The entity type this remover handles.
 */
export type EntityRemover<TEntity> = (entity: TEntity) => Promise<void>;

/**
 * The two setting-side effects the local override reaches out of scope for, declared as one port.
 *
 * TODO(boundary): the implementation belongs to the SettingService port family under AAP §0.2.2.7 and
 * is written by whoever brings `model/service/SettingService.cfc` into scope. Nothing in this subtree
 * implements it, and nothing here may.
 */
export interface EntitySettingCleanupPort {
  /**
   * Removes every setting row related to one entity — `model/service/HibachiService.cfc:L76`, inside
   * the `if(deleteOK)` gate at `:L73`.
   */
  removeAllEntityRelatedSettings(entity: MaintenanceEntityRef): Promise<void>;

  /**
   * Strips one primary identifier out of every stored setting value and resolves how many setting
   * values were changed — `model/service/HibachiService.cfc:L94-L96`.
   */
  updateAllSettingValuesToRemoveSpecificID(primaryIDValue: string): Promise<number>;

  /** Invalidates the whole settings cache — `model/service/HibachiService.cfc:L98-L100`. */
  clearAllSettingsCache(): Promise<void>;
}

/**
 * The comment-side effect the local override reaches out of scope for.
 *
 * TODO(boundary): the implementation belongs to whoever brings a comment service into scope. Nothing
 * in this subtree implements it, and nothing here may.
 */
export interface EntityCommentCleanupPort {
  /** Removes every comment row related to one entity — `model/service/HibachiService.cfc:L79`. */
  removeAllEntityRelatedComments(entity: MaintenanceEntityRef): Promise<void>;
}

/**
 * What this collaborator requires of a persistent catalog entity, and nothing more.
 *
 * @typeParam TPropertyName - The union of the entity's declared property names.
 */
export type BaseServiceEntity<TPropertyName extends string> = ValidationSubject &
  AuditableEntity &
  EntityErrorSurface &
  PopulationTarget<TPropertyName> & {
    /**
     * The entity's primary identifier value — the port of
     * [org/Hibachi/HibachiEntity.cfc:L244], and the argument
     * `settingService.updateAllSettingValuesToRemoveSpecificID( … )` receives at
     * [model/service/HibachiService.cfc:L95].
     */
    getPrimaryIDValue(): string;
  };

/** The `activeFlag` value, narrowed to at run time rather than required of every entity. */
interface ActiveFlagReader {
  readonly activeFlag: boolean;
}

/**
 * Reports whether `entity` carries a known `activeFlag` value, and narrows it so the value can be read.
 *
 * @typeParam TSubject - The subject type being narrowed.
 *
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
 * @typeParam TEntity - The entity type this instance serves.
 * @typeParam TPropertyName - The union of that entity's declared property names.
 */
/** The narrow identity surface the two maintenance ports need in order to act on an entity. */
export interface MaintenanceEntityRef {
  /** [org/Hibachi/HibachiObject.cfc:L135] — the bare class name. */
  getClassName(): string;

  /** [org/Hibachi/HibachiEntity.cfc:L244] — the primary identifier's value. */
  getPrimaryIDValue(): string;
}

/*
 * There is no `EntitySettingMaintenancePort`. It was declared as a same-shape rival of
 * {@link EntitySettingCleanupPort} — identical members, identical legacy locators, a different
 * noun — and two port interfaces for one collaborator is a drift hazard, not a choice: a
 * wiring site satisfying one of them would leave the other unimplemented with nothing
 * reporting it. EntitySettingCleanupPort is the surviving declaration and it kept the stronger
 * typing the rival introduced: its entity parameter is {@link MaintenanceEntityRef} rather
 * than `unknown`, so an implementation can read `getClassName()` and `getPrimaryIDValue()`
 * off it without a cast, which is exactly what the legacy call site does.
 */

/*
 * There is no `EntityCommentMaintenancePort`. It was declared as a same-shape rival of
 * {@link EntityCommentCleanupPort} — identical members, identical legacy locators, a different
 * noun — and two port interfaces for one collaborator is a drift hazard, not a choice: a
 * wiring site satisfying one of them would leave the other unimplemented with nothing
 * reporting it. EntityCommentCleanupPort is the surviving declaration and it kept the stronger
 * typing the rival introduced: its entity parameter is {@link MaintenanceEntityRef} rather
 * than `unknown`, so an implementation can read `getClassName()` and `getPrimaryIDValue()`
 * off it without a cast, which is exactly what the legacy call site does.
 */

/**
 * Resolves an entity into the subject its DELETE-context rules can actually evaluate.
 *
 * @param entity - The entity being deleted.
 * @returns The subject to validate. It may be the entity itself once enriched, or a distinct view of
 * it; `delete` uses whatever comes back and never re-reads the argument for validation.
 */
export type DeleteSubjectResolver<TEntity> = (entity: TEntity) => Promise<TEntity>;

export interface BaseServiceCollaborators<
  TEntity extends BaseServiceEntity<TPropertyName>,
  TPropertyName extends string,
> {
  /**
   * The rule-set evaluation engine, whose `validate` entry point replaces
   * `arguments.entity.validate(context=…)` at [org/Hibachi/HibachiService.cfc:L151] and [:L55].
   */
  readonly validator: Validator;

  /** This entity's transliterated validation document, from `src/validation/rules/`. */
  readonly ruleSet: ValidationRuleSet<TEntity>;

  /**
   * This entity's declared population contract, the typed replacement for the metadata-driven
   * `getProperties()` walk the legacy `populate` performed.
   */
  readonly propertyDescriptors: PropertyDescriptorSet<TEntity, TPropertyName>;

  /**
   * The resolved authorisation context for population — arms 2 and 3 of the legacy population gate
   * [org/Hibachi/HibachiTransient.cfc:L186-L190], declared in `../ports/AccountContextPort`.
   */
  readonly populationAuthorization: PopulationAuthorizationPort;

  /** The persistence step of [org/Hibachi/HibachiService.cfc:L155]. See {@link EntityPersister}. */
  readonly persist: EntityPersister<TEntity>;

  /** The removal step of `org/Hibachi/HibachiService.cfc:L61` and `:L64`. */
  readonly remove: EntityRemover<TEntity>;

  /**
   * The out-of-scope setting cleanup the local override performs — see
   * {@link EntitySettingCleanupPort}.
   */
  readonly settingCleanup: EntitySettingCleanupPort;

  /**
   * The out-of-scope comment cleanup the local override performs — see
   * {@link EntityCommentCleanupPort}.
   */
  readonly commentCleanup: EntityCommentCleanupPort;

  /** The delete-context resolution step; see {@link DeleteSubjectResolver}. */
  readonly resolveDeleteSubject?: DeleteSubjectResolver<TEntity>;
}

/**
 * The two local base-class overrides the in-scope catalog services inherit, as an injectable
 * collaborator.
 *
 * @typeParam TEntity - The persistent entity type this instance serves.
 * @typeParam TPropertyName - The union of that entity's declared property names.
 *
 * @example
 * ```ts
 * // Wiring, in src/config/container.ts — one instance per entity type. The `authorization`
 * // collaborator is required: it supplies ARMs 2 and 3 of the population master gate at
 * // [org/Hibachi/HibachiTransient.cfc:L186-L190], and omitting it is a compile error rather than a
 * // save that silently populates nothing. See BaseServiceCollaborators.authorization.
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

  /* The three collaborator fields are declared once, directly above, and they are not optional. */

  /** See {@link BaseServiceCollaborators.resolveDeleteSubject}. */
  private readonly resolveDeleteSubject: DeleteSubjectResolver<TEntity> | undefined;

  /**
   * Binds the collaborators once.
   *
   * @param collaborators - Eight required members — validator, rule set, property descriptors,
   * population authorisation, persister, remover, setting cleanup and comment cleanup — plus one
   * optional crossing, {@link BaseServiceCollaborators.resolveDeleteSubject}, whose absence changes
   * behaviour rather than failing loudly: `delete` then validates the raw entity, which is correct
   * only for entities whose guards read owned collections. Its own field documents the asymmetry.
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
   * @param entity - The entity to save. Populated in place and returned, so the caller's reference and
   * the return value are the same object whether the save succeeded or failed.
   *
   * @param data - The incoming payload. Defaults to an empty payload exactly as [:L86] does, and
   * population runs unconditionally as a result — see the subtlety recorded in the module header.
   * Keys matching no declared property are silently ignored, as they were in CFML.
   */
  public async save(
    entity: TEntity,
    data: Record<string, unknown> = {},
    context: ValidationContext = DEFAULT_SAVE_CONTEXT,
  ): Promise<TEntity> {
    /*
     * [model/service/HibachiService.cfc:L88] — the inherited path, whose contract is
     * [org/Hibachi/HibachiService.cfc:L133-L169]. Expressed as its three observable steps.
     */
    const populatedEntity: TEntity = populate(
      entity,
      data,
      this.propertyDescriptors,
      this.populationAuthorization,
    );

    /*
     * Step 2 — validate, [org/Hibachi/HibachiService.cfc:L151]. The context is forwarded verbatim.
     */
    const errors: ValidationError = await this.validator.validate(
      populatedEntity,
      this.ruleSet,
      context,
    );

    /*
     * Step 3 — persist, gated, [org/Hibachi/HibachiService.cfc:L154-L155]. The gate is the reason a
     * failing entity is never written, and the reassignment is the reason this method can return the
     * persisted instance rather than the argument.
     */
    let savedEntity: TEntity = populatedEntity;

    if (!errors.hasErrors()) {
      savedEntity = await this.persist(populatedEntity);
    }

    /*
     * [model/service/HibachiService.cfc:L91] — back in the local override. The gate is two-part and
     * stays two-part: no failures, and the entity declares `activeFlag`. The second conjunct is the
     * CFML reflection call translated to a structural narrowing; for `Option` and `OptionGroup`, which
     * declare no `activeFlag` at all, it is false and this whole block is skipped exactly as the
     * legacy line skips it. It also reads the field rather than probing for a generated accessor — see
     * {@link ActiveFlagReader}, without which correction this block was unreachable for every entity.
     */
    if (!errors.hasErrors() && entityReadsActiveFlag(savedEntity)) {
      /*
       * [:L93] `var settingsRemoved = 0;` — and [:L95] declares `var settingsRemoved` a second time
       * inside the branch below. In CFML both declarations name the same function-scoped variable, so
       * the inner assignment is visible to the test at [:L98]; in TypeScript a second declaration
       * would create a different block-scoped binding and silently break that data flow. Declared
       * once here for that reason, and the legacy duplicate is recorded rather than repaired — see the
       * parity note in the module header. No D-number is minted for it.
       */
      let settingsRemoved = NO_SETTINGS_REMOVED;

      /*
       * [:L94] `if(!arguments.entity.getActiveFlag)` — the generated accessor read as a field, for
       * the reason recorded on {@link ActiveFlagReader}. {@link entityReadsActiveFlag} has already
       * established that the value is a known boolean, so this negation is total.
       */
      if (!savedEntity.activeFlag) {
        /*
         * [model/service/HibachiService.cfc:L94-L96] — `var settingsRemoved =
         * getService("settingService").updateAllSettingValuesToRemoveSpecificID(
         * arguments.entity.getPrimaryIDValue() )`, reproduced through
         * {@link EntitySettingCleanupPort} (TR-5).
         */
        settingsRemoved = await this.settingCleanup.updateAllSettingValuesToRemoveSpecificID(
          savedEntity.getPrimaryIDValue(),
        );
      }

      /*
       * [:L98] the disjunction, retained in full — both arms, and all five literal class names inside
       * {@link SETTINGS_CACHE_CLEARING_CLASS_NAMES}. For an in-scope entity the second arm can never
       * match, because every one of those five names is an excluded entity; the first arm is live,
       * carrying the real count gap 3 above resolved. The five names are reproduced rather than
       * collapsed because the rule itself is the observable behaviour (AAP §0.8.2 guideline 4).
       */
      if (
        settingsRemoved > NO_SETTINGS_REMOVED ||
        clearsAllSettingsCacheForClassName(savedEntity.getClassName())
      ) {
        /*
         * [model/service/HibachiService.cfc:L98-L100] — `getService("settingService")
         * clearAllSettingsCache()`, reproduced through {@link EntitySettingCleanupPort} (TR-5,
         * TR-5).
         */
        await this.settingCleanup.clearAllSettingsCache();
      }
    }

    /* [:L103] `return arguments.entity;` */
    if (errors.hasErrors()) {
      savedEntity.addErrors(errors.getErrors());
    }

    return savedEntity;
  }

  /**
   * Removes an entity when its delete-context validation passes, then runs the local cleanup gate.
   *
   * @param entity - The entity to remove.
   * @returns `true` when the entity passed delete-context validation and was removed, `false`
   * otherwise. Never anything else, and never a raised error for a validation failure.
   */
  public async delete(entity: TEntity): Promise<boolean> {
    /*
     * [model/service/HibachiService.cfc:L70] — the inherited path. Its first step is
     * `arguments.entity.validate(context="delete")` at [org/Hibachi/HibachiService.cfc:L55], where the
     * context is hard-coded, which is why this member takes no context parameter.
     */
    /*
     * — resolve before validating. See {@link DeleteSubjectResolver} for why the raw entity is
     * not a usable delete subject: this domain's delete guards read derived values, and `eq` is one of
     * only two constraints that fail rather than pass on an absent value
     * ([org/Hibachi/HibachiValidationService.cfc:L387-L390]), so an unresolved flag actively refuses the
     * delete instead of ignoring it.
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
     */
    let deleteOK = false;

    if (!errors.hasErrors()) {
      await this.remove(entity);
      deleteOK = true;
    }

    if (deleteOK) {
      /*
       * [model/service/HibachiService.cfc:L76] then [:L79] — the two cleanup steps, reproduced through
       * {@link EntitySettingCleanupPort} and {@link EntityCommentCleanupPort} (TR-5). Both sit
       * inside the `if(deleteOK)` gate and both run after {@link EntityRemover}, exactly as the legacy
       * lines do relative to `super.delete` at [:L70].
       */
      await this.settingCleanup.removeAllEntityRelatedSettings(entity);
      await this.commentCleanup.removeAllEntityRelatedComments(entity);
    }

    return deleteOK;
  }
}
