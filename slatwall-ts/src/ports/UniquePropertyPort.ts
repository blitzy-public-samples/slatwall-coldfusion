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
 * ⛔ TODO(parity) — THIS PREDICATE IS THE READ HALF OF A CHECK-THEN-WRITE, AND NOTHING SERIALIZES IT
 * (CWE-367, TOCTOU). Two concurrent saves can both be told a value is free and both commit it. One
 * thing, and only one, sits behind it, and it is a REPORTING change rather than a serialization one:
 *
 *   REPORTING, AT THE EXECUTION BOUNDARY. A write that loses the race against a real database
 *   constraint arrives as a typed `UniqueConstraintViolationError` classified as a request rejection,
 *   instead of as an unclassified driver error indistinguishable from a service fault. The same writes
 *   succeed and fail, at the same moment; only the classification of the failure differs.
 *
 * ⛔ A REVISION ALSO TOOK A LOCKING READ IN THE ADAPTER — `FOR UPDATE`, on the boundary-scoped instance
 * only — and licensed it on the D18 footing on the ground that a locking read returns exactly the rows
 * the same statement returns without one and merely orders concurrent transactions. THAT IS WITHDRAWN.
 * The ground was sound; the objection is the COUNT. AAP §0.6.7.7 authorises exactly ONE departure from
 * behavioural preservation in this port — D18, the importer's parameterised SQL — and says so precisely
 * to give a reviewer diffing behaviour a fixed number of entries to check. Statement text is observable,
 * a lock-wait is observable under concurrency, and AAP §0.8.2 Guideline 4 admits no proportionality test.
 * That the legacy framework serializes an ANALOGOUS sort-order read-then-write at
 * org/Hibachi/HibachiDAO.cfc:L182 does not license it either: that lock guards a different member, which
 * this port does not carry, and importing a control from an unported member is still an addition.
 *
 * ⚠️ SO THE EXPOSURE IS CARRIED IN FULL, AND DIVERGENCE 1 MAKES IT WORSE ON TWO PROPERTIES. Five of the
 * seven ported rules have a `unique="true"` column behind them, so the database convicts the losing
 * write and the reporting change above gives it a name. `optionCode` and `optionGroupCode` have NO such
 * column, so on those two a lost race is arbitrated by nothing at all — before this port and after it.
 * The repair that would close it — adding the two missing unique indexes — is FORBIDDEN, not overlooked:
 * AAP §0.2.2.5 places schema migration outside this refactoring entirely, and the `Sw*` tables are read
 * and written as they are. Flagged, not claimed closed (AAP §0.7.3 S8).
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

/* =====================================================================================================
 * FOLDED IN FROM `src/ports/TransactionalWritePort.ts` — AAP §0.4.1 INVENTORY ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THIS SECTION IS HERE RATHER THAN IN ITS OWN FILE. AAP §0.4.1 freezes the subtree at 102 files and
 * `TransactionalWritePort.ts` was not one of them. The declaration itself is load-bearing — it is what
 * lets `src/handlers/**` reach a transaction boundary WITHOUT importing an adapter — so it is folded into
 * an approved port rather than deleted, and it is reproduced below unchanged, doc record and all.
 *
 * ⭐ WHY THIS HOST. Both declarations stand for `org/Hibachi/**` persistence infrastructure that the
 * WRITE path needs and that no domain type expresses: this file's own subject is the application-side
 * uniqueness probe of `org/Hibachi/HibachiDAO.cfc:L130-L146`, which runs inside a save, and the section
 * below is the transaction that save runs in. AAP §0.6.2's read-back — a uniqueness rule observing
 * siblings the same unit is still writing — is the exact point at which the two meet, so a reader who
 * needs one almost always needs the other.
 *
 * ⛔ NO IMPORT WAS ADDED, AND NO CYCLE IS POSSIBLE. This file imported nothing before the fold and the
 * folded section imported nothing either: it is one generic interface over a caller's graph type. The
 * handler layer therefore still imports a PORT and never an adapter, which is the property the section's
 * own doc record spends its length defending.
 *
 * ⚠️ THE FOLD CHANGES ONLY THE IMPORT PATH ITS CONSUMERS WRITE — `src/handlers/skuHandler.ts`,
 * `src/handlers/productHandler.ts`, `src/config/container.ts`, `src/adapters/mysql/UnitOfWork.ts` and two
 * test suites now name this file.
 * ================================================================================================== */

/**
 * The transaction boundary a write path runs inside — the port that replaces the legacy's request-end
 * commit.
 *
 * AAP authority: AAP §0.3.3 lists **Unit of Work** as the pattern that replaces "the implicit
 * request-end commit gated on `getORMHasErrors()`", and AAP §0.4.4 authorises
 * `slatwall-ts/src/ports/**` | CREATE. `src/adapters/mysql/UnitOfWork.ts` already implements the
 * mechanism; this file is the DECLARATION that lets a handler reach it without importing an adapter.
 *
 * =================================================================================================
 * WHY A PORT AND NOT A DIRECT CALL TO `UnitOfWork`
 * =================================================================================================
 * ⛔ A HANDLER MUST NOT IMPORT FROM `../adapters/**`. AAP §0.3.3 places `handlers` and `adapters` in
 * different layers of the hexagon and confines all AWS coupling to the handler layer; a handler that
 * imported `UnitOfWork` would couple the AWS boundary to MySQL and to `mysql2`'s `PoolConnection`, which
 * is the one direction the architecture exists to prevent. AAP §0.5.5 depends on that separation
 * concretely: it states a runtime migration touches four artefacts "with no change to `src/domain/**`,
 * `src/services/**`, `src/ports/**` or `src/adapters/**`", which only holds while the handler layer knows
 * nothing about the driver.
 *
 * ⭐ THE GRAPH IS A TYPE PARAMETER BECAUSE A TRANSACTION-SCOPED SERVICE IS A DIFFERENT OBJECT. This is
 * the part that a "just wrap the call in a transaction" reading gets wrong. A service holds its
 * repository, and a repository holds its executor, from the moment it is constructed — so the service a
 * handler captured at start-up is bound to the POOL, and calling it inside an open transaction would run
 * its statements on a DIFFERENT connection, outside that transaction. Nothing would fail; the writes
 * would simply not be part of the unit being committed, and a roll-back would leave them behind. The work
 * function therefore receives a graph BUILT FOR THAT TRANSACTION rather than closing over an ambient one,
 * and `TGraph` is generic so each handler declares only the capabilities its write path uses.
 *
 * =================================================================================================
 * WHAT THE TWO ARGUMENTS CORRESPOND TO IN THE LEGACY
 * =================================================================================================
 * The legacy commit is not a statement anyone wrote. Per AAP §0.6.6 M5, `flushAtRequestEnd=false` and
 * `Hibachi.cfc` performs a double `ormFlush()` at request end ONLY when the ORM reports no errors, so
 * every write in a request was kept or discarded together, decided by a predicate evaluated after the
 * work finished. `runWrite` is that shape made explicit: `work` is the request's writes and `hasErrors`
 * is the gate, evaluated once, after the work and before the commit.
 *
 * ⚠️ THE GATE IS A CALLBACK RATHER THAN A RETURNED FLAG, AND THAT IS FORCED BY WHERE ERRORS LIVE. In
 * this slice a batch's findings do NOT accumulate onto a single object: `src/services/SkuService.ts`
 * records at length that per-SKU rule findings stay on the SKU that produced them while branch
 * preconditions go to the product's bag, and that a product-level merge must not be reinstated because it
 * re-keys a SKU's `skuCode` finding onto the product and loses which SKU failed. A caller must therefore
 * be free to inspect the whole graph it just mutated, which a boolean returned from `work` cannot express
 * — the work's return value is the operation's own result, and for `createSkus` that result is `true`
 * unconditionally even when the batch failed.
 */

/**
 * Runs one unit of work inside one transaction, against a graph built for that transaction.
 *
 * ⚠️ IMPLEMENTATIONS OWN THE WHOLE LIFECYCLE AND MUST NOT LEAK IT. Acquire, begin, commit or roll back,
 * and DISPOSE OF the connection on every path — including when the work throws.
 * `src/adapters/mysql/UnitOfWork.ts` holds that sequence, and this contract deliberately exposes none of
 * it: a caller cannot commit early, cannot roll back explicitly and cannot reach the connection.
 *
 * ⛔ DISPOSAL IS NOT ALWAYS A RELEASE, and an implementation that made it one would be wrong rather than
 * merely simple. A connection whose begin, commit or roll-back ITSELF failed carries a transaction state
 * nobody can describe, so returning it to a warm pool hands the next invocation whatever was left open —
 * precisely the cross-invocation bleed M7 exists to prevent, and silent, because the next caller sees no
 * error. Such a connection must be taken out of service instead. Both branches are asserted against the
 * MySQL implementation in `test/adapters/MySqlSkuRepository.test.ts`'s folded `UnitOfWork` block, and the structural double in
 * `test/support/inMemoryRepositories.ts` reproduces the same rule so a consumer suite cannot disagree
 * with the class about it.
 *
 * @typeParam TGraph - The transaction-scoped capabilities the work needs. Declared by the caller, so a
 *   write path depends on nothing wider than it uses.
 */
export interface TransactionalWriteRunner<TGraph> {
  /**
   * @param work - The writes, run inside an open transaction against a graph bound to it.
   * @param hasErrors - The commit gate, evaluated ONCE after `work` settles successfully. `true` rolls
   *   the transaction back and reports the roll-back to the caller as a failure; `false` commits. It must
   *   be free of side effects, and it must read the state `work` accumulated rather than re-deriving it.
   * @returns Whatever `work` produced — for a unit that was COMMITTED.
   * @throws When `work` throws, after rolling back; and when `hasErrors` reports accumulated findings,
   *   because a caller that received the work's value would otherwise be unable to tell a committed
   *   result from a discarded one. `createSkus` makes that concrete: it returns `true` even for a batch
   *   whose SKUs all failed validation, so its return value cannot distinguish the two outcomes.
   * @throws When a SETTLEMENT itself fails — the begin, the commit, or the roll-back that either of the
   *   two cases above asked for. A commit failure reaches the caller as the driver reported it, because
   *   that failure is the whole story; a roll-back failure is compound, so it is reported as the more
   *   serious fact — that nothing can be said about what the database retained — carrying the roll-back's
   *   own failure as `cause`. On every one of these paths the connection is taken out of service rather
   *   than returned to the pool, per the disposal rule above.
   */
  runWrite<TResult>(
    work: (graph: TGraph) => Promise<TResult>,
    hasErrors: () => boolean,
  ): Promise<TResult>;
}
