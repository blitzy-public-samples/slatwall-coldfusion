/**
 * `UniquePropertyPort` — application-side uniqueness checking for the extracted Catalog slice.
 *
 * =============================================================================================
 * LEGACY ORIGIN
 * =============================================================================================
 * `org/Hibachi/HibachiDAO.cfc:L130-L146`, the member `isUniqueProperty`. The hint directly above
 * it at `org/Hibachi/HibachiDAO.cfc:L129` states the purpose in the legacy author's own words:
 * the method exists for validation checks that a property value is not already in use.
 *
 * That component is 266 lines of framework code beneath `org/Hibachi/**`, which AAP 0.8.3.2
 * designates "a boundary to extract from, never modify". Its contract was read here; none of its
 * code was carried across, and no file outside `slatwall-ts/` was touched to produce this one.
 *
 * This file is the entirety of what survives the crossing. AAP 0.6.3.1 classifies the
 * `getHibachiDAO()` dependency — two call sites, at `model/service/ProductService.cfc:L287`
 * (a save) and `model/service/ProductService.cfc:L345` (a smart-list build) — as a framework
 * artifact whose treatment is "Excluded; narrowed to UniquePropertyPort". One predicate replaces
 * 266 lines, and that ratio is precisely what the word *narrowed* is doing in that verdict.
 * A related honesty note, because the two facts are easy to conflate: neither of those two call
 * sites is itself an `isUniqueProperty` call, so the narrowing verdict is about the framework DAO
 * dependency as a whole rather than about this predicate's own call graph. This predicate's real
 * consumers are listed under CONSUMERS below.
 *
 * =============================================================================================
 * WHY THIS PORT EXISTS AT ALL — IR-5
 * =============================================================================================
 * AAP IR-5 requires application-side uniqueness checking *in addition to* database constraints:
 * `isUniqueProperty` enforces uniqueness with an existence query during validation, independently
 * of the `unique="true"` column metadata, and "five of the eight unique columns declared in the
 * whole system belong to this slice".
 *
 * Both halves of that count were verified first-hand rather than taken on trust. A scan of
 * `model/entity/**` finds exactly eight `unique="true"` declarations. Exactly five are in slice:
 *
 *   1. `model/entity/Product.cfc:L54`      `urlTitle`
 *   2. `model/entity/Product.cfc:L56`      `productCode`
 *   3. `model/entity/Sku.cfc:L54`          `skuCode`   (also `length="50"`)
 *   4. `model/entity/ProductType.cfc:L56`  `urlTitle`
 *   5. `model/entity/Brand.cfc:L55`        `urlTitle`
 *
 * The remaining three sit outside the Catalog slice, at `model/entity/Currency.cfc:L52`
 * (`currencyCode`), `model/entity/MeasurementUnit.cfc:L58` (`unitCode`) and
 * `model/entity/Integration.cfc:L53` (`integrationPackage`). Five plus three is eight, so IR-5's
 * arithmetic holds exactly.
 *
 * Modelling that column metadata is explicitly NOT this port's job. IR-5 is worded "in addition
 * to" the database constraints, so the constraints stay the schema's concern — the `Sw*` schema is
 * the retained fixed point both systems continue to agree on (AAP 0.1.2) and nothing here
 * redeclares it.
 *
 * =============================================================================================
 * THE SIX CHECKABLE PROPERTIES
 * =============================================================================================
 * Uniqueness is *dispatched* from the declarative validation documents, not from the ORM
 * metadata, and the two sets do not coincide. Within the five in-scope validation documents this
 * port is scoped against, there are SIX save-context `unique` rules. Each is listed with its
 * locator so a reader can verify the coverage claim directly:
 *
 *   1. `model/validation/Product.json:L10`      `productCode`      (also carries a format rule)
 *   2. `model/validation/Product.json:L16`      `urlTitle`
 *   3. `model/validation/Sku.json:L11`          `skuCode`
 *   4. `model/validation/Brand.json:L5`         `urlTitle`
 *   5. `model/validation/Option.json:L3`        `optionCode`       (also carries a format rule)
 *   6. `model/validation/OptionGroup.json:L4`   `optionGroupCode`  (also carries a format rule)
 *
 * A seventh exists across the wider set of seven in-scope validation documents, at
 * `model/validation/ProductType.json:L4` (`urlTitle`). It is recorded rather than omitted because
 * an enumeration that stopped at six could otherwise read as an oversight.
 *
 * That enumeration is deliberately DOCUMENTATION and not a type. No closed union of property
 * names is declared anywhere in this file, because the legacy predicate is generic over
 * `(propertyName, entity)` by construction (see U1 and U2 below). The decisive evidence is how
 * the dispatcher derives the name: `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L469` computes it AT RUNTIME as the last segment of a
 * property-identifier path, so the value is not drawn from a fixed set and a union type cannot
 * express it. The framework predicate is also system-wide rather than catalog-specific — the
 * entity-level wrapper at `org/Hibachi/HibachiEntity.cfc:L328` accepts a property name belonging
 * to whichever entity is passed, and AAP IR-6 counts 113 of them. A union would additionally have
 * to be edited every time a validation document gained a rule, which would make a type change the
 * price of a configuration change.
 *
 * Worth noting alongside it, because it shows uniqueness reads in this slice are not all routed
 * through this one predicate: brand `urlTitle` uniqueness is reached instead through
 * `createUniqueURLTitle` against table `SwBrand`, at `model/service/BrandService.cfc:L70` and
 * `model/service/BrandService.cfc:L72`, whose own narrow probe is ported in `src/util/urlTitle.ts`.
 *
 * The format rule that accompanies three of the six is `^[a-zA-Z0-9-_.|:~^]+$`, reproduced
 * byte-exactly here and in a comment only. It is a SEPARATE constraint from uniqueness, it is
 * owned by `src/validation/rules/**`, and it is deliberately not compiled in this file — a port
 * declares contracts and holds no executable logic (AAP 0.7.3 S4).
 *
 * =============================================================================================
 * THE ORM / VALIDATION DIVERGENCE — TWO FINDINGS, ONE CONFIRMED AND ONE REFUTED
 * =============================================================================================
 * TODO(parity): DIVERGENCE 1 — CONFIRMED, and it is the single strongest justification for IR-5.
 * `model/validation/Option.json:L3` (`optionCode`) and `model/validation/OptionGroup.json:L4`
 * (`optionGroupCode`) each carry a save-context `unique` rule, yet a scan of
 * `model/entity/Option.cfc` and `model/entity/OptionGroup.cfc` finds NO `unique="true"`
 * declaration in either file — neither property appears among the five in-slice columns listed
 * above. For these two properties this port is therefore the ONLY uniqueness enforcement that
 * exists anywhere in the system. Delete the port and those two constraints do not degrade to a
 * database-level guarantee; they vanish outright. Carried as observed, not repaired (AAP 0.7.3
 * S7): no `unique="true"` is proposed for either entity, and no compensating behaviour is
 * invented here.
 *
 * TODO(parity): DIVERGENCE 2 — TESTED AND NOT BORNE OUT, recorded because the negative result is
 * itself the finding. The hypothesis under test was that `model/validation/Product.json` declares
 * `urlTitle` required but NOT unique, leaving the ORM column at `model/entity/Product.cfc:L54`
 * unaccompanied by an application-side check. A first-hand read refutes it:
 * `model/validation/Product.json:L16` declares `urlTitle` with a save-context `unique` rule, and
 * it therefore AGREES with the ORM flag at `model/entity/Product.cfc:L54`. That agreement is
 * exactly why the enumeration above numbers SIX rather than five. The refutation is stated instead
 * of the hypothesis because every behavioural claim in this subtree has to survive a reviewer
 * grepping the cited locator (AAP 0.8.5), and inventing a divergence the source does not have
 * would violate AAP 0.7.3 S9 just as surely as inventing a feature would. Nothing is "fixed"
 * either way: no rule is added to, and none removed from, either validation document.
 *
 * The divergence that genuinely exists is therefore ASYMMETRIC, in one direction only. Each of
 * the five in-slice ORM columns does have a matching validation rule —
 * `Product.cfc:L54` maps to `Product.json:L16`, `Product.cfc:L56` to `Product.json:L10`,
 * `Sku.cfc:L54` to `Sku.json:L11`, `ProductType.cfc:L56` to `ProductType.json:L4`, and
 * `Brand.cfc:L55` to `Brand.json:L5`. The validation side then carries two SURPLUS entries with
 * no ORM counterpart, and they are exactly the two option codes of DIVERGENCE 1. The validation
 * set is a strict superset of the ORM set; it is not a different set.
 *
 * =============================================================================================
 * CONSUMERS
 * =============================================================================================
 * `src/validation/Validator.ts` evaluates the `unique` constraint through this port for the six
 * properties enumerated above, and `src/services/**` runs validation before delegating to
 * `BaseService.save`. That mirrors the legacy dispatch exactly: `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L470` returns the result of `isUniqueProperty`
 * DIRECTLY as its own verdict, which is independent confirmation of the polarity documented on
 * the member below. Besides its own declaration at `org/Hibachi/HibachiDAO.cfc:L130`, the legacy
 * predicate has exactly FIVE call sites: the thin passthrough body at
 * `model/service/DataService.cfc:L167`; `org/Hibachi/HibachiValidationService.cfc:L469` and
 * `org/Hibachi/HibachiValidationService.cfc:L478`; and the two entity-level conveniences at
 * `org/Hibachi/HibachiEntity.cfc:L329` and `org/Hibachi/HibachiEntity.cfc:L336`. A repository-wide
 * search for the identifier returns one further line — `model/service/DataService.cfc:L166` — which
 * is the SIGNATURE of the same-named wrapper whose body is L167, not a sixth call site. It is
 * called out so the search result reconciles with this count rather than appearing to contradict it.
 *
 * Two of those references are informative about what this port must NOT acquire.
 *
 * First, the entity-level conveniences reach the collaborator through
 * `getBean("hibachiDAO")` — a string-keyed runtime lookup, visible at
 * `org/Hibachi/HibachiEntity.cfc:L329`. That is the precise mechanism AAP 0.7.3 S3 abolishes.
 * Implementations of this interface are supplied to their consumers as typed constructor
 * parameters, wired once in `src/config/container.ts`. This file exports no factory, no
 * singleton, no registry and no lookup helper.
 *
 * Second, `validate_uniqueOrNull` at `org/Hibachi/HibachiValidationService.cfc:L472-L479` short
 * circuits to a passing verdict when the property value is null, whereas `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L470` applies no such guard and passes the entity
 * straight through. None of the six rules enumerated above uses `uniqueOrNull` — every one of them
 * is a plain `unique` rule — so no null-handling policy is declared here. Adding one would be an
 * invention (AAP 0.7.3 S9) and would silently change which saves succeed.
 *
 * =============================================================================================
 * RULES PROVENANCE
 * =============================================================================================
 * No user rules provided. The project's rules document was read in full and returns exactly that
 * single line, so zero files enter scope by rule and no rule-derived constraint shaped this file.
 * Per the governing convention that is NOT permission to lower the bar: the nine binding standards
 * of AAP 0.7.3 (S1 strict type safety, S2 parameterized SQL, S3 explicit dependency injection,
 * S4 hexagonal separation, S5 exact-version pinning, S6 one labelled test per converted method,
 * S7 preserve and annotate, S8 flag mismatches, S9 invent nothing) govern instead, and each is
 * cited inline at the point where it bites.
 *
 * =============================================================================================
 * ARCHITECTURAL POSITION — AAP 0.7.3 S4
 * =============================================================================================
 * This module has ZERO imports, and that is a designed property rather than an accident of a
 * small file. Ports sit beneath `adapters/`, `services/`, `config/`, `validation/`, `handlers/`
 * and `integrations/`, so importing from one of them would invert the dependency direction. There
 * is no import from a concrete domain entity either: by U2 below, one predicate serves every
 * entity carrying a uniqueness rule, so a locally declared structural shape is the correct
 * modelling and a concrete entity import would be strictly narrower than the contract.
 *
 * Nothing is imported from the dependency manifest either — in particular not the MySQL driver,
 * even though this port's legacy origin *is* a query (AAP 0.7.3 S5; the manifest stays closed and
 * is not edited). No environment variable is read here; `src/config/env.ts` is the only module
 * permitted to do that. No AWS type appears; all such coupling is confined to `src/handlers/**`.
 * No credential, host, endpoint or account identifier appears anywhere in this file.
 *
 * Statement text is likewise absent. The legacy body composes its query inline, so this is the
 * standard the file is most at risk of violating, and the rule applied is absolute: the query is
 * quoted in prose on the member below for the artifact trail and appears nowhere in executable
 * position. There is no statement string, no placeholder array, no table name and no column name
 * anywhere in this interface. The port speaks in terms of a property name and an entity, exactly
 * as the legacy signature does.
 *
 * =============================================================================================
 * ASYNCHRONOUS — AND WHY `SettingResolverPort` IS NOT — AAP 0.7.3 S8
 * =============================================================================================
 * The single member here resolves a promise. That is forced by the legacy body: the statement at
 * `org/Hibachi/HibachiDAO.cfc:L140` is a genuine database round trip, and under the MySQL driver
 * it becomes an awaited call in `src/adapters/mysql/UniquePropertyChecker.ts`. Of the boundary
 * ports in this folder, this is the one that legitimately performs input and output.
 *
 * The sibling `SettingResolverPort` is deliberately SYNCHRONOUS, and the inconsistency between
 * the two is intentional rather than an oversight. AAP mismatch M8 records that the out-of-scope
 * collaborator behind settings resolution launches an out-of-band background thread, so that port
 * is declared synchronous specifically to guarantee no caller in the slice can come to depend on
 * background completion. The two ports are shaped by two different execution-model facts and must
 * not be harmonised in either direction — neither by making this one synchronous, which would be
 * a lie about the database round trip, nor by making that one asynchronous, which would reopen
 * the hazard M8 closes.
 *
 * =============================================================================================
 * THE VALIDATION READ-BACK HAZARD — FLAGGED HERE, OWNED ELSEWHERE
 * =============================================================================================
 * TODO(parity): uniqueness checking runs inside the validation pass, and AAP 0.6.2 identifies that
 * pass as "the single most dangerous thing in the slice". The reason is that validation there
 * READS BACK rows the same operation is still writing: `hasUniqueOptions` at
 * `model/entity/Sku.cfc:L756-L769` is a declarative rule registered in `model/validation/Sku.json`
 * (see the two method-based rules at `model/validation/Sku.json:L6-L7`) that executes a database
 * query of its own. Under the legacy engine such a rule observes sibling rows already visible to
 * the ORM session; under the MySQL driver there is no ORM session and no automatic flush, so a
 * port that checks uniqueness before every sibling insert, or after all of them, produces DIFFERENT
 * results from the legacy system with no error and no compile failure to announce it.
 *
 * The same exposure applies to this predicate directly. When a batch of rows is saved in one
 * operation — the combination engine at `model/service/SkuService.cfc:L58-L211` being the case
 * that matters — whether row N's uniqueness check observes rows 1..N-1 depends entirely on
 * transaction visibility, and the legacy answer is that it does.
 *
 * This is flagged, not solved, and deliberately so. Resolution belongs to
 * `src/adapters/mysql/UnitOfWork.ts`, which AAP 0.4.1.7 makes the owner of the explicit
 * transaction boundary. Accordingly NO transaction handle, session object or unit-of-work
 * parameter is added to the signature below: threading one through the port would relocate a
 * decision this file has no authority over, and would couple every consumer of a uniqueness rule
 * to a persistence concern. The contract states the requirement; the adapter satisfies it.
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
 * in `test/support/inMemoryRepositories.ts` satisfies it too — which is what makes the port
 * testable at all, given the legacy repository ships no mocking library (AAP 0.4.3.6).
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
   * Invoked fifth and last, at `org/Hibachi/HibachiDAO.cfc:L138`, and bound into the query at
   * `org/Hibachi/HibachiDAO.cfc:L140`.
   *
   * Typed `unknown` rather than a concrete type, and that choice is deliberate on both counts. The
   * legacy accessor at `org/Hibachi/HibachiTransient.cfc:L466` is declared with the widest CFML
   * return type because the value genuinely varies across the properties this predicate serves —
   * the six enumerated in the file header are all string-valued today, but the legacy contract is
   * not restricted to strings and narrowing it here would invent a constraint the source does not
   * state (AAP 0.7.3 S9). `unknown` is used in preference to the unchecked wide type because
   * AAP 0.7.3 S1 forbids the latter outright: `unknown` obliges the implementation to narrow before
   * use, which is precisely the discipline wanted at a boundary that feeds a bound query parameter.
   *
   * The legacy accessor additionally takes an optional formatting flag at
   * `org/Hibachi/HibachiTransient.cfc:L466`, which the call at
   * `org/Hibachi/HibachiDAO.cfc:L138` does not pass. It is therefore absent from this shape: the
   * uniqueness check compares stored values, never formatted ones, and declaring a parameter no
   * legacy call site supplies would widen the contract beyond the observed behaviour.
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
