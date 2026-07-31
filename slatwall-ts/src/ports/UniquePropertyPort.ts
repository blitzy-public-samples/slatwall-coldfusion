/**
 * UniquePropertyPort — application-side uniqueness checking for the extracted Catalog slice.
 *
 * Legacy origin: `isUniqueProperty` at org/Hibachi/HibachiDAO.cfc:L130-L146, which enforces
 * uniqueness with an existence query during validation. Its contract was read here; no framework
 * code is carried across (AAP §0.8.3.2). AAP §0.6.3.1 narrows the whole `getHibachiDAO()`
 * framework dependency to this one predicate.
 *
 * IR-5 requires that check IN ADDITION TO the `unique="true"` column metadata, so the constraints
 * stay the schema's concern and nothing here redeclares them. Five of the eight unique columns in
 * the system are in slice: model/entity/Product.cfc:L54 (`urlTitle`), model/entity/Product.cfc:L56
 * (`productCode`), model/entity/Sku.cfc:L54 (`skuCode`), model/entity/ProductType.cfc:L56
 * (`urlTitle`) and model/entity/Brand.cfc:L55 (`urlTitle`).
 *
 * Uniqueness is dispatched from the declarative validation documents, not from the ORM metadata,
 * and the two sets do not coincide. Within the five validation documents this port is scoped
 * against there are six save-context `unique` rules:
 *
 *   1. model/validation/Product.json:L10      `productCode`      (also carries a format rule)
 *   2. model/validation/Product.json:L16      `urlTitle`
 *   3. model/validation/Sku.json:L11          `skuCode`
 *   4. model/validation/Brand.json:L5         `urlTitle`
 *   5. model/validation/Option.json:L3        `optionCode`       (also carries a format rule)
 *   6. model/validation/OptionGroup.json:L4   `optionGroupCode`  (also carries a format rule)
 *
 * A seventh sits in the wider set of in-scope documents, at model/validation/ProductType.json:L4
 * (`urlTitle`). The accompanying format rule `^[a-zA-Z0-9-_.|:~^]+$` is a SEPARATE constraint owned
 * by src/validation/rules/**; it is quoted here in prose only and compiled nowhere in this file.
 *
 * That enumeration is documentation, not a type. No closed union of property names is declared,
 * because `validate_unique` at org/Hibachi/HibachiValidationService.cfc:L469 derives the name AT
 * RUNTIME as the last segment of a property-identifier path, so the value is not drawn from a fixed
 * set. A union would also make a type change the price of a configuration change.
 *
 * Not every uniqueness read in the slice routes through this predicate: brand `urlTitle` uniqueness
 * is reached through `createUniqueURLTitle` at model/service/BrandService.cfc:L70-L72, whose narrow
 * probe is ported in src/util/urlTitle.ts.
 *
 * TODO(parity) DIVERGENCE 1: model/validation/Option.json:L3 (`optionCode`) and
 * model/validation/OptionGroup.json:L4 (`optionGroupCode`) each carry a save-context `unique` rule
 * while neither model/entity/Option.cfc nor model/entity/OptionGroup.cfc declares `unique="true"`.
 * For those two properties this port is the ONLY uniqueness enforcement in the system — delete it
 * and the constraints vanish rather than degrading to a database guarantee. Carried as observed:
 * no `unique="true"` is proposed and no compensating behaviour is invented (AAP §0.7.3 S7).
 *
 * CONSUMERS. src/validation/Validator.ts evaluates the `unique` constraint through this port, and
 * src/services/** runs validation before delegating to `BaseService.save`. That mirrors the legacy
 * dispatch: `validate_unique` at org/Hibachi/HibachiValidationService.cfc:L467-L470 returns the
 * result of `isUniqueProperty` DIRECTLY as its own verdict, which fixes the polarity documented on
 * the member below. `validate_uniqueOrNull` at
 * org/Hibachi/HibachiValidationService.cfc:L472-L479 additionally passes when the value is null,
 * but none of the six rules above uses it, so no null-handling policy is declared here — adding one
 * would be an invention and would silently change which saves succeed (AAP §0.7.3 S9).
 *
 * The single member is asynchronous because the statement at org/Hibachi/HibachiDAO.cfc:L140 is a
 * real database round trip; of the boundary ports in this folder this is the one that performs I/O.
 * The sibling `SettingResolverPort` is deliberately SYNCHRONOUS: mismatch M8 records an out-of-band
 * background thread behind settings resolution, and the synchronous signature is what stops a
 * caller depending on background completion. The two shapes must not be harmonised in either
 * direction.
 *
 * TODO(parity): uniqueness runs inside the validation pass, which AAP §0.6.2 (mismatch M6)
 * identifies as the slice's most dangerous behaviour, because validation READS BACK rows the same
 * operation is still writing. When a batch is saved in one operation — the combination engine at
 * model/service/SkuService.cfc:L58-L211 being the case that matters — whether row N's check
 * observes rows 1..N-1 depends on transaction visibility, and the legacy answer is that it does.
 * Flagged, not solved: resolution belongs to src/adapters/mysql/UnitOfWork.ts (AAP §0.4.1.7), and
 * NO transaction handle, session object or unit-of-work parameter is added to the signature below.
 */

/**
 * The single field of a property's metadata that the uniqueness check consumes.
 *
 * `org/Hibachi/HibachiDAO.cfc:L134` reads exactly one member off the metadata it retrieves — the
 * property's `name` — and nothing else in the legacy body touches that structure again. The shape
 * is kept to that one field for the reason AAP 0.6.3.5 gives for the ports being finite at all:
 * widen it to the full metadata record and the boundary stops being a boundary. The real legacy
 * structure carries the whole ORM property definition; none of the rest is needed to decide
 * uniqueness, so none of the rest is declared.
 *
 * Reading `name` rather than reusing the caller's `propertyName` argument verbatim is the legacy
 * behaviour and is preserved: `org/Hibachi/HibachiDAO.cfc:L134` resolves the argument through the
 * metadata first and then uses the resolved value to build the query at
 * `org/Hibachi/HibachiDAO.cfc:L140`. The two are normally identical, and the indirection is
 * retained because "normally" is not "always" and this file does not repair what it ports
 * (AAP 0.7.3 S7).
 */
export interface UniquePropertyMetaData {
  /**
   * The property's declared name, as resolved from the entity's own metadata.
   *
   * This is the value the legacy query interpolates as a column-position identifier at
   * `org/Hibachi/HibachiDAO.cfc:L140`. See the identifier warning on
   * {@link UniquePropertyPort.isUniqueProperty} — implementations must treat it as an identifier
   * requiring validation against a known-safe set, never as a bindable value.
   */
  readonly name: string;
}

/**
 * The minimal structural shape a uniqueness check needs from the entity being validated.
 *
 * WHY THE WHOLE ENTITY, AND NOT A VALUE PLUS A TABLE NAME. The legacy signature at
 * `org/Hibachi/HibachiDAO.cfc:L131-L132` takes a property name and the ENTITY, then derives
 * everything else from the entity itself across `org/Hibachi/HibachiDAO.cfc:L134-L138`. Reducing
 * the parameter to a bare value plus an identifier would be a behaviour change, not an idiom
 * change, so it is forbidden by the Minimal Change Clause of AAP 0.8.1: that clause licenses
 * rewriting the idiom freely while holding observable behaviour fixed, and the entity parameter is
 * load-bearing behaviour. The five members below are therefore not a convenience bundle — they are
 * exactly, and only, the five accessors the legacy body invokes, in the order it invokes them.
 *
 * WHY THIS SHAPE IS DECLARED LOCALLY. A structural type is declared here rather than importing a
 * concrete domain entity because one predicate serves every entity carrying a uniqueness rule —
 * at minimum `Product`, `Sku`, `Brand`, `Option`, `OptionGroup` and `ProductType`, per the six
 * enumerated properties in the file header. Importing one of them alone would make the contract
 * narrower than the behaviour it describes, and importing all of them would couple this port to
 * the domain layer for no gain. Structural typing means every domain entity exposing these five
 * accessors satisfies the shape without declaring that it does, and a hand-written object literal
 * in the planned `test/support/inMemoryRepositories.ts` will satisfy it too — which is what makes
 * the port testable at all, given the legacy repository ships no mocking library (AAP 0.4.3.6).
 *
 * The declared legacy return types are honoured rather than guessed. `getEntityName` is declared
 * returning a string at `org/Hibachi/HibachiEntity.cfc:L287`; `getPrimaryIDValue` at
 * `org/Hibachi/HibachiEntity.cfc:L244`; `getPrimaryIDPropertyName` at
 * `org/Hibachi/HibachiEntity.cfc:L249`; `getPropertyMetaData` returning a structure at
 * `org/Hibachi/HibachiTransient.cfc:L738`; and `getValueByPropertyIdentifier` returning the widest
 * CFML type at `org/Hibachi/HibachiTransient.cfc:L466`.
 */
export interface UniquePropertyEntity {
  /**
   * Resolves the metadata for `propertyName` on this entity.
   *
   * Invoked first by the legacy body, at `org/Hibachi/HibachiDAO.cfc:L134`.
   *
   * AN UNKNOWN PROPERTY NAME IS AN ERROR, NOT A SILENT MISS. The legacy implementation at
   * `org/Hibachi/HibachiTransient.cfc:L738-L747` looks the name up in the entity's property
   * structure and returns the entry when the key is present
   * (`org/Hibachi/HibachiTransient.cfc:L741-L743`); when the key is absent it THROWS
   * (`org/Hibachi/HibachiTransient.cfc:L746`). The return type here is consequently not optional,
   * which is faithful to that declaration — a caller never receives an absent result, it receives
   * a raised error instead.
   *
   * That distinction is a real obligation on the implementation, and it is worth stating plainly
   * because the strict compiler settings make the wrong choice easy to reach for. Under
   * `noUncheckedIndexedAccess` the adapter's own keyed read of a property map yields a possibly
   * undefined value, and the tempting resolutions — a non-null assertion, or quietly reporting the
   * value as unique — would both diverge from the legacy behaviour. The adapter must handle an
   * unrecognised property name EXPLICITLY, and must surface it, rather than assume the key is
   * present or let the absence collapse into a passing verdict.
   */
  getPropertyMetaData(propertyName: string): UniquePropertyMetaData;

  /**
   * The entity's logical name.
   *
   * Invoked second, at `org/Hibachi/HibachiDAO.cfc:L135`, and interpolated into the query at
   * `org/Hibachi/HibachiDAO.cfc:L140`.
   *
   * This is the LOGICAL entity name, not the physical `Sw*` table name — the legacy statement is
   * expressed over the mapped object graph, so a name of the `Slatwall`-prefixed form is correct
   * there and is not a defect to be corrected. Translating that logical name to the physical table
   * the query must actually address is the adapter's responsibility, and it is one more reason the
   * identifier warning on {@link UniquePropertyPort.isUniqueProperty} matters: the value crossing
   * this boundary is not already a table name.
   */
  getEntityName(): string;

  /**
   * The entity's primary identifier VALUE.
   *
   * Invoked third, at `org/Hibachi/HibachiDAO.cfc:L136`, and bound into the self-exclusion term of
   * the query at `org/Hibachi/HibachiDAO.cfc:L140`.
   *
   * TODO(parity): A NEW ROW CARRIES NO ASSIGNED IDENTIFIER HERE, WHICH MAKES THE SELF-EXCLUSION
   * TERM A NO-OP. A row being inserted has not been assigned its identifier yet — the legacy
   * accessor at `org/Hibachi/HibachiEntity.cfc:L244-L246` simply forwards to the generated getter
   * for whichever property `getPrimaryIDPropertyName` names, and for an unsaved instance there is
   * nothing there to forward. The self-exclusion term consequently excludes nothing on insert, and
   * the check degenerates to a plain existence test over the whole set. On update the same term is
   * live and does real work: it is what stops a row colliding with ITSELF and reporting its own
   * unchanged value as already taken.
   *
   * AAP 0.4.1.7 names this observation as one the implementation must reproduce, which is why it
   * is recorded in the contract rather than left in the adapter: the adapter is where it would be
   * lost. The obligation it creates is that the insert case be handled DELIBERATELY — the legacy
   * term is preserved, not dropped, and the implementation must not bind an empty identifier and
   * trust the comparison to behave, because a comparison against an absent value does not reliably
   * evaluate the way an equality-style predicate reads. Carried as observed, not repaired
   * (AAP 0.7.3 S7).
   */
  getPrimaryIDValue(): string;

  /**
   * The NAME of the entity's primary identifier property.
   *
   * Invoked fourth, at `org/Hibachi/HibachiDAO.cfc:L137`, and interpolated as an identifier into
   * the self-exclusion term at `org/Hibachi/HibachiDAO.cfc:L140`. Distinct from
   * {@link UniquePropertyEntity.getPrimaryIDValue}: this yields the property's name, that yields
   * its value, and the legacy statement uses both — the name in identifier position and the value
   * in bound position. Conflating them is the kind of mistake that produces a statement which
   * parses and then matches the wrong rows, so both members are declared separately here exactly
   * as the legacy body reads them separately.
   *
   * Identifiers are constrained in the port's own terms: AAP IR-6 records that 107 of 113 entities
   * declare a 32-character string identifier generated in application code, so this name is drawn
   * from entity metadata and never from caller input. See the identifier warning on
   * {@link UniquePropertyPort.isUniqueProperty}.
   */
  getPrimaryIDPropertyName(): string;

  /**
   * The current value held by `propertyIdentifier` on this entity — the value whose uniqueness is
   * in question.
   *
   * Invoked fifth and last at org/Hibachi/HibachiDAO.cfc:L138 and bound into the query at
   * org/Hibachi/HibachiDAO.cfc:L140.
   *
   * Typed `unknown` on both counts deliberately: the legacy accessor at
   * org/Hibachi/HibachiTransient.cfc:L466 is declared with the widest CFML return type because the
   * value genuinely varies across the properties this predicate serves, so narrowing it here would
   * invent a constraint the source does not state (AAP §0.7.3 S9); and `unknown` rather than the
   * unchecked wide type obliges an implementation to narrow before use, which is the discipline
   * wanted at a boundary that feeds a bound query parameter.
   *
   * The legacy accessor also takes an optional formatting flag that the call at
   * org/Hibachi/HibachiDAO.cfc:L138 does not pass, so it is absent here: the check compares stored
   * values, never formatted ones.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown;
}

/**
 * Application-side uniqueness checking — the boundary this whole file exists to declare.
 *
 * Implementations belong to `src/adapters/mysql/**`, per AAP 0.4.1.7, which names
 * `src/adapters/mysql/UniquePropertyChecker.ts` as the concrete counterpart. Consumers receive an
 * implementation as a typed constructor parameter (AAP 0.7.3 S3).
 *
 * The interface carries exactly ONE member, and the exclusions are as much a part of the design as
 * the inclusion. `getTableTopSortOrder`, the immediate neighbour of the legacy origin at
 * `org/Hibachi/HibachiDAO.cfc:L149`, is deliberately ABSENT: it is a sort-order query with nothing
 * to do with uniqueness, and AAP 0.4.1.7 places that concern in
 * `src/adapters/mysql/UnitOfWork.ts`. It is cited here so a reader can confirm it was considered
 * and excluded rather than overlooked. Equally absent, and for the same reason — no legacy
 * counterpart exists, so adding one would be invention under AAP 0.7.3 S9 — are a generic
 * existence helper keyed on a table and column, and a batch or bulk uniqueness call.
 *
 * TODO(boundary): the legacy collaborator on the far side of this boundary is framework code under
 * `org/Hibachi/**`, which AAP 0.8.3.2 places out of scope permanently — the framework "is being
 * retired for this slice, not carried forward". This declaration is the whole of the crossing, and
 * it is what lets the extracted services build, test and package without the rest of Slatwall
 * being converted (AAP 0.8.3.8). No implementation is provided in this file, and none is imported
 * into it.
 */
export interface UniquePropertyPort {
  /**
   * Reports whether `propertyName` on `entity` still holds a value no other row has taken.
   *
   * ------------------------------------------------------------------------------------------
   * POLARITY — RESOLVING `true` MEANS UNIQUE. STATED FIRST BECAUSE IT IS THE HIGHEST RISK HERE.
   * ------------------------------------------------------------------------------------------
   * `true` means the value IS unique, and therefore that the entity is safe to save. `false` means
   * the value is ALREADY IN USE and the save must be rejected. The polarity is inverted relative
   * to the intuitive reading of a query result: the legacy body returns `false` when rows are
   * found (`org/Hibachi/HibachiDAO.cfc:L142-L144`) and `true` when none are
   * (`org/Hibachi/HibachiDAO.cfc:L146`).
   *
   * This is not an inference. The legacy hint at `org/Hibachi/HibachiEntity.cfc:L327` documents it
   * in the original author's words — the check returns true when the property's value is unique,
   * and false when the value is already in the database — and `validate_unique` at
   * `org/Hibachi/HibachiValidationService.cfc:L467-L470` confirms it from the consumer side by
   * returning this result unmodified as its own pass-or-fail verdict.
   *
   * Inverting it is silent. There is no compile error, no type error and no lint finding, and the
   * observable consequence is that every uniqueness rule in the slice passes when it should fail —
   * all six enumerated in the file header, including the two at `model/validation/Option.json:L3`
   * and `model/validation/OptionGroup.json:L4` for which, per DIVERGENCE 1, no database constraint
   * exists to catch the mistake downstream. Implementations MUST resolve `true` for "unique", and
   * the accompanying test MUST cover the collision case, because a test that only exercises the
   * non-colliding path passes under either polarity.
   *
   * ------------------------------------------------------------------------------------------
   * THE LEGACY STATEMENT, AND THE IDENTIFIER WARNING IT CARRIES
   * ------------------------------------------------------------------------------------------
   * The statement composed at `org/Hibachi/HibachiDAO.cfc:L140` reads, over the mapped object
   * graph: from the entity, where the property equals the supplied value, and the primary
   * identifier property does not equal the supplied identifier. It is quoted in prose here, and
   * only here, for the artifact trail required by AAP 0.8.5; no statement text appears in
   * executable position anywhere in this file (AAP 0.7.3 S2).
   *
   * Its construction is split, and the split is the warning. THREE values are interpolated
   * directly into the statement as IDENTIFIERS — the entity name from
   * {@link UniquePropertyEntity.getEntityName}, the resolved property name from
   * {@link UniquePropertyMetaData.name}, and the primary identifier property name from
   * {@link UniquePropertyEntity.getPrimaryIDPropertyName}. Only TWO are bound as VALUES: the
   * property value and the primary identifier value.
   *
   * That split survives translation because it must. AAP 0.4.3.4 records that a placeholder
   * "binds values only and cannot substitute identifiers", so the two bound values become
   * positional parameters in legacy binding order, while the three identifiers cannot. AAP 0.7.3
   * S2 therefore requires implementations to build those three from a VALIDATED, KNOWN-SAFE SET —
   * derived from entity metadata, never interpolated from caller input.
   *
   * One clarification, because this interpolation resembles a defect the plan treats very
   * differently elsewhere. Interpolation of that kind is what triggered the plan's ONE declared
   * exception to preserve-and-annotate — but that exception lives in a DIFFERENT file. AAP 0.6.7.7
   * hardens the importer's interpolated statements, ported into
   * `src/adapters/mysql/MySqlProductRepository.ts`, precisely because those interpolate values
   * taken from an uploaded file. The interpolation here is NOT that case: these three identifiers
   * originate in the entity's own metadata, never in caller-supplied or file-supplied data. NO
   * exception is therefore claimed by this file, and none may be. The requirement above is a
   * restatement of the standing standard, not a departure from it.
   *
   * ------------------------------------------------------------------------------------------
   * SIGNATURE FIDELITY, AND THE TIGHTENING RECORDED PER TR-1
   * ------------------------------------------------------------------------------------------
   * The member name, the parameter count and the parameter order are preserved exactly from
   * `org/Hibachi/HibachiDAO.cfc:L130-L132`: the name `isUniqueProperty`, two parameters, property
   * name first and entity second.
   *
   * The types are tightened, and AAP TR-1 requires the tightening be RECORDED rather than made
   * silently. What the legacy source declares is the loosest possible contract: the function at
   * `org/Hibachi/HibachiDAO.cfc:L130` states no return type and no access modifier, and NEITHER
   * argument carries a type attribute — `propertyName` at `org/Hibachi/HibachiDAO.cfc:L131` and
   * `entity` at `org/Hibachi/HibachiDAO.cfc:L132` are both merely marked as mandatory.
   *
   * The tightening is to the OBSERVED contract, not to a preference. Two in-repository declarations
   * fix it independently: the passthrough at `model/service/DataService.cfc:L166` declares the same
   * member returning a boolean and takes `propertyName` as a string, and
   * `org/Hibachi/HibachiEntity.cfc:L328` likewise declares its wrapper returning a boolean with a
   * string property name. The entity parameter is tightened to the structural shape
   * {@link UniquePropertyEntity}, whose five members are exactly the five accessors the legacy body
   * invokes at `org/Hibachi/HibachiDAO.cfc:L134-L138` — a tightening from "unconstrained" to
   * "precisely what is used", which removes no capability a caller previously had.
   *
   * The return is promise-wrapped for the reason set out in the file header: the legacy body
   * performs a real database round trip at `org/Hibachi/HibachiDAO.cfc:L140`. That asynchrony is
   * deliberate, and is deliberately NOT harmonised with the synchronous `SettingResolverPort`.
   *
   * @param propertyName - The property to check, named as the validation rule names it. Resolved
   *   through the entity's metadata before use, exactly as at `org/Hibachi/HibachiDAO.cfc:L134`;
   *   an unrecognised name is an error rather than a passing verdict. Deliberately NOT narrowed to
   *   a union of the six enumerated properties: the dispatcher at
   *   `org/Hibachi/HibachiValidationService.cfc:L469` computes this value at runtime from a
   *   property-identifier path, which no union type can express. See THE SIX CHECKABLE PROPERTIES
   *   in the file header for the full reasoning.
   * @param entity - The entity being validated, supplying both the value under test and the
   *   identifier the self-exclusion term compares against. Passed whole, per
   *   `org/Hibachi/HibachiDAO.cfc:L132`.
   * @returns `true` when the value is unique and the save may proceed; `false` when it is already
   *   in use. Never null, never undefined, and never inverted.
   */
  isUniqueProperty(propertyName: string, entity: UniquePropertyEntity): Promise<boolean>;
}
