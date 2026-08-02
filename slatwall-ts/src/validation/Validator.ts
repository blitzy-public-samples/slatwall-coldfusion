/**
 * `Validator` — the typed rule-set evaluation engine of the extracted Catalog slice.
 *
 * Ported from `org/Hibachi/HibachiValidationService.cfc`. AAP 0.4.1.5 row 1 makes this file CREATE and
 * that component REFERENCE: "Runtime JSON interpretation becomes typed rule-set evaluation with context
 * selection", over the seven transliterated documents in `./rules/`. Because those rule sets point here
 * for evaluation semantics, the generic semantics live in this header and theirs carry only
 * property-specific asymmetries.
 *
 * SECTION MARKERS `N1`-`N6` label this engine's six behavioural requirements — the dry-run switch (N1),
 * the open context string (N2), the two-object process flow (N3), the absence of any global error flag
 * (N4), the two documented non-ports (N5) and the two-argument error call (N6) — and are cited from the
 * declarations that discharge them.
 *
 * WHY THIS FILE IS THE MOST DANGEROUS ONE IN THE FOLDER. AAP IR-4 records that these documents "are
 * behavior, not configuration", because they "determine which saves and deletes succeed" (AAP 0.2.1.5).
 * Treat them as configuration and the port compiles cleanly, saves records the legacy system would have
 * rejected and rejects records it would have accepted — with no compile error, no exception and no
 * failing test to reveal it. Every null-semantics row and comparison rule below closes one such gap.
 *
 * WHAT THIS FILE IS NOT — TR-3, AND WHY THE JSON IS NOT SHIPPED. This engine does not read, bundle, parse
 * or interpret a JSON document: it has no file access and no deserialisation, and the legacy document
 * loader (`org/Hibachi/HibachiValidationService.cfc:L6-L53`) has no counterpart. Rules arrive already
 * typed from `./rules/*.rules.ts` and this file only EVALUATES them; interpreting documents at runtime
 * would reproduce the metadata-driven dispatch TR-3 retires. Nor is any `model/validation/*.json` copied,
 * symlinked or re-emitted, because TR-6 and AAP 0.4.1.1 hold the CFML tree byte-for-byte unchanged.
 *
 * THE THIRTEEN KEYS, CLOSED AT THIRTEEN over the seven enumerated in-scope documents — never wildcarded,
 * since AAP 0.4.4 warns that `model/validation/Product*.json` "would silently pull in out-of-scope
 * material". Two keys SELECT and are modelled on {@link ValidationRule}; eleven CONSTRAIN and are the
 * members of {@link Constraint}; `properties` is the structural container. The legacy vocabulary is far
 * wider — further `dataType` values, constraint keys and comparison evaluators — and that remainder is
 * not implemented, because none of it appears in the seven and AAP 0.7.3 S9 forbids inventing capability.
 *
 * TWO SELECTION MECHANISMS, ORTHOGONAL AND NEVER COLLAPSED INTO ONE. `contexts`
 * (`org/Hibachi/HibachiValidationService.cfc:L55-L95`) and `conditions` (`:L97-L131`) are independent
 * gates, modelled as independent fields; only one document uses `conditions`, and that asymmetry is real
 * legacy structure rather than something to tidy away.
 *   - CONTEXTS. The decisive line is `:L71`: a rule passes when it declares NO `contexts` key at all, or
 *     when the requested context appears in its comma-delimited list case-insensitively. A rule with no
 *     `contexts` key therefore applies in EVERY context, which is what makes both rules of
 *     `model/validation/Product_UpdateSkus.json` fire under any context string; and the list is
 *     comma-delimited, so "addOptionGroup,addOption" at `model/validation/Product.json:L4` is two
 *     entries, not one.
 *   - THE FLATTENING, which is why one property can accumulate several messages. `:L77-L88` explodes each
 *     rule object into ONE constraint record per key, excluding `contexts` and `conditions` (`:L78`) and
 *     copying `conditions` onto every record it produces (`:L83-L85`), so the single rule at
 *     `model/validation/Product.json:L10` becomes THREE independent constraints, each able to report its
 *     own error against the same property. Here the explosion lives in the data shape: a
 *     {@link ValidationRule} holds an ARRAY of constraints, so the flattening is visible in the rule set
 *     rather than performed at evaluation time.
 *   - CONDITIONS resolve a rule's comma-delimited list of condition NAMES against the document's own
 *     top-level block, OR ACROSS conditions (`:L124-L126`) and AND WITHIN one (`:L110-L121`). Three
 *     further details are behavior and are reproduced exactly: `:L108` guards the name lookup, so a name
 *     absent from the block is SKIPPED and the gate fails if it was the only one; `:L117` short-circuits
 *     on an unknown constraint type and leaves the all-met flag untouched, so an unknown constraint
 *     inside a conditions block is SILENTLY IGNORED — in deliberate contrast to `:L201-L203`, where an
 *     unknown constraint on the main path THROWS, and the two are NOT harmonised here; and `:L118`
 *     records a failure and keeps looping rather than breaking.
 *
 * NULL SEMANTICS PER CONSTRAINT — THE LIKELIEST SOURCE OF SILENT DRIFT. Each row is the verdict the
 * corresponding `validate_*` body returns for an ABSENT value; get one wrong and the set of saves that
 * succeed changes with nothing to signal it. Every constraint declaration below repeats its own row
 * together with the rest of that constraint's semantics, so this table is the index, not the detail.
 *
 *   required       null FAILS   `:L240-L246`      maxCollection  null PASSES  `:L309-L315`
 *   dataType       null PASSES  `:L256-L267`      regex          null PASSES  `:L481-L487`
 *   minValue       null PASSES  `:L269-L275`      eq             null FAILS   `:L385-L395`
 *   maxLength      null PASSES  `:L293-L299`      inList         null FAILS   `:L459-L465`
 *   minCollection  null PASSES  `:L301-L307`      method         n/a          `:L333-L335`
 *   unique         n/a          `:L467-L470`
 *
 * `minCollection` is the row that catches people: a floor of 1 PASSES on null and FAILS on an empty
 * array. Two further engine behaviours are also reproduced: `:L171` — a rule whose property does not
 * exist on the subject is SILENTLY SKIPPED, neither an error nor a failure; and `:L162` — a context that
 * is boolean-castable and casts to false skips validation ENTIRELY. Errors ACCUMULATE: evaluation never
 * short-circuits on a first failure, at any level.
 *
 * LOOSE EQUALITY IS LOAD-BEARING, NOT AN OVERSIGHT. `:L391` compares with CFML `==`, which coerces, so
 * `eq false` also matches the string "false", the number 0, the string "0" and the string "no", and
 * `eq 1` also matches the string "1" and the boolean true. It cannot be tightened, because none of the
 * four data properties at `model/process/Product_UpdateSkus.cfc:L52-L58` declares a `type=` attribute, so
 * a flag really may arrive as 1, "1", true or "yes". {@link isCfLooseEqual} reproduces CFML's coercion
 * ladder — numeric, then boolean, then a case-insensitive string comparison — rather than narrowing the
 * comparison and silently changing which delete guards fire.
 *
 * SUBJECT CONTRACT — HOW VALUES ARE READ WITHOUT STRING-KEYED DISPATCH. The legacy engine builds an
 * accessor name at runtime and invokes it dynamically (`:L241` is one of many such bodies), which is the
 * framework magic TR-3 retires and AAP 0.7.3 S3 forbids, so it is not reproduced in any form. Instead
 * each {@link PropertyValidation} carries an explicit typed {@link PropertyValueReader}; each `method`
 * constraint carries the ACTUAL bound domain method, as AAP 0.4.1.5 requires, plus that method's name,
 * needed only because the key shape at `:L222` embeds it; and each `unique` constraint carries an
 * explicit {@link UniqueTargetResolver}, the typed analogue of the last-object lookup at `:L468`. There
 * is no name-to-function map, no lookup table keyed by string and no reflection in this file.
 * {@link ValidationSubject} therefore declares exactly TWO members — the class name (`:L202`, `:L213`,
 * `:L216`) and the property-existence test (`:L171`) — precisely the two reads the legacy engine makes
 * that are not value access.
 *
 * A PERSISTENCE FLAG IS DELIBERATELY ABSENT. `:L212` branches on whether the subject is persistent, and
 * that branch selected only the substitution struct's class-name prefix, which DECISION D-1 removes
 * entirely, and which class-name resolution to use — a last-entity walk along a dotted identifier
 * (`:L213`) versus the subject's own class name (`:L216`). Every property identifier in all seven
 * documents is a single segment containing neither a dot nor an underscore, so both branches resolve
 * alike and the distinction is unobservable in this slice; declaring a flag that could not change an
 * outcome would be capability beyond what the migration requires (AAP 0.8.2 guideline 4).
 *
 * THE ERROR BAG — WHAT IS REPORTED, AND UNDER WHICH KEY. Failures accumulate in {@link ValidationError}
 * from `../errors/ValidationError`, whose surface mirrors the accessors the in-scope entities expose at
 * `org/Hibachi/HibachiTransient.cfc:L29-L68` — notably a miss returning an empty array (`:L43`) rather
 * than raising.
 *
 * THE KEY IS THE FULL PROPERTY IDENTIFIER, and it is the highest-risk detail in this file. All three
 * reporting branches (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`) report against
 * the property identifier, never the constraint type and never a method name: BOTH method-rule failures
 * declared at `model/validation/Sku.json:L5-L8` report under the key `options`, which is also why a key's
 * value is an array. The shortened name derived at `:L208` composes the message only; it is never the key.
 *
 * TWO ARGUMENTS TO addError, ALWAYS (N6). The engine's only call site passes the identifier and the
 * message and nothing else (`:L234`). A three-argument override does exist, at
 * `org/Hibachi/HibachiEntity.cfc:L151`, whose third parameter marks an error as not affecting
 * persistence — but that is an ENTITY concern belonging to `src/domain/`, never a validation-engine one,
 * and the dependency's own two-parameter signature makes the compiler enforce it here.
 *
 * NO GLOBAL FLAG IS SET (N4). `org/Hibachi/HibachiTransient.cfc:L455-L457` raises a process-wide "the
 * object graph has errors" flag when a persistent object fails validation. That is mismatch M5, and AAP
 * 0.4.1.7 places it in `src/adapters/mysql/UnitOfWork.ts`; reproducing it here would breach hexagonal
 * separation (AAP 0.7.3 S4) and would leak state across invocations on a warm container (M7). This
 * engine holds NO module-scope state of any kind.
 *
 * DECISION D-1 — BUILD THE MESSAGE KEY, DELIBERATELY SKIP THE SUBSTITUTION PASS. The legacy path composes
 * one of three key shapes and then runs a template-substitution pass over it (`:L223`, `:L227`, `:L231`).
 * This port composes the key — see {@link buildValidationMessage} — and does NOT run the substitution,
 * for three independent reasons: there is no resource bundle to resolve against, bundle resolution having
 * been a facility of the request scope of the framework AAP 0.8.3.2 retires; the pass is a provable
 * no-op, because `org/Hibachi/HibachiUtilityService.cfc:L71` collects substitution targets by matching a
 * dollar-brace placeholder pattern that none of the three key shapes can emit; and raw keys stay
 * comparable to legacy output, because an unresolved CFML bundle key comes back with a "_missing" suffix
 * while the traceable regression `issue_1335` in `meta/tests/unit/IssuesTest.cfc` asserts a reported
 * message does NOT carry that suffix. Two consequences: `../util/formatting` is deliberately NOT imported,
 * because with the substitution skipped it would be dead code (AAP 0.8.2 guideline 4); and the
 * substitution struct's `entity.`/`processObject.` class-name prefix (`:L214`, `:L217`) is never emitted,
 * because it existed only as a substitution VALUE. Stored messages are KEYS, not sentences — nothing here
 * translates, sentence-cases, trims, normalises or beautifies one.
 *
 * DECISION D-2 AND "THE SEVEN" — UNIQUENESS GOES THROUGH THE PORT, AND ONLY THROUGH THE PORT, because AAP
 * IR-5 requires application-side uniqueness checking in addition to the database constraints.
 *
 * POLARITY, PINNED: `true` MEANS UNIQUE, AND THEREFORE SAFE TO SAVE; `false` means the value is already
 * taken and the save must be rejected. `org/Hibachi/HibachiDAO.cfc:L142-L144` returns false when the
 * existence query finds rows and `:L146` returns true when it finds none, and `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L470` returns that result UNMODIFIED. Inverting it is
 * silent — every uniqueness rule in the slice would pass when it should fail, with no compile error and
 * no lint finding — so any accompanying test must exercise the COLLIDING case, since a test covering only
 * the non-colliding path passes under either polarity. SELF-EXCLUSION IS A NO-OP ON INSERT: the legacy
 * existence query excludes the row being validated by comparing primary identifiers
 * (`org/Hibachi/HibachiDAO.cfc:L140`), and on an insert there is no assigned identifier yet, so that term
 * excludes nothing — recorded because it looks like protection against self-collision and is not, on the
 * path that matters most.
 *
 * THE SEVEN `unique` rules an evaluator can be handed all route through the port, and they live at
 * `model/validation/Product.json:L10` and `:L16`, `model/validation/Sku.json:L11`,
 * `model/validation/Brand.json:L5`, `model/validation/Option.json:L3`,
 * `model/validation/OptionGroup.json:L4` and `model/validation/ProductType.json:L4`;
 * `model/validation/Product_UpdateSkus.json` contributes none. AAP IR-5's "five of the eight unique
 * columns" counts entity `unique="true"` COLUMN METADATA, an independent mechanism, and
 * `../ports/UniquePropertyPort` scopes its primary list to five documents while recording the seventh
 * separately; both are correct about different things, and seven governs here.
 *
 * M6 — THE VALIDATION READ-BACK LOOP, THE HIGHEST-RISK ITEM IN THE WHOLE SLICE. AAP 0.6.2 states it
 * plainly: `Sku.hasUniqueOptions()` "is not an ordinary helper. It is a declarative validation rule
 * registered in `model/validation/Sku.json` for the save context, and it executes a database query to do
 * its work." The cycle is entered here — `SkuService.createSkus()` saves a Sku, validation selects the
 * `save` context, the method rule at `model/validation/Sku.json:L6` invokes `Sku.hasUniqueOptions()`
 * (`model/entity/Sku.cfc:L756-L769`, whose `:L763` calls the product's option-resolution member), a query
 * runs over the SKU and SKU-option tables, and the result feeds back into the save still in flight. Under
 * CFML and Hibernate the rule observes only siblings already visible to the ORM session; the target has
 * no ORM session and no automatic flush, so — again AAP 0.6.2 — "a naive port that inserts every
 * combination and then validates, or that validates before any insert, produces different results from
 * the legacy code — silently."
 *
 * M6 is jointly owned, and the same-transaction visibility half belongs to
 * `src/adapters/mysql/UnitOfWork.ts`. What this file owes, and discharges: (a) the method rule is invoked
 * ONCE PER SUBJECT, in the order the caller presents subjects — for a combination batch, the order the
 * combination engine produced them — and this engine never batches subjects and never reorders them;
 * (b) it stays asynchronous WITHOUT being hoisted out of sequence, since every constraint is awaited one
 * at a time inside an ordinary sequential loop and constraint promises are never settled together,
 * because settling them together would reorder the very reads whose ordering is the behavior under
 * preservation; and (c) it never defeats that visibility by caching, so no result is memoised across
 * subjects, no snapshot is pre-fetched, and the rule is re-invoked for every subject.
 *
 * =============================================================================================
 * DECISION D-2 AND "THE SEVEN" — UNIQUENESS GOES THROUGH THE PORT, AND ONLY THROUGH THE PORT
 * =============================================================================================
 * AAP IR-5: "Application-side uniqueness checking is required in addition to database constraints.
 * `HibachiDAO.isUniqueProperty()` [org/Hibachi/HibachiDAO.cfc:L130-L146] enforces uniqueness with
 * an HQL existence query during validation, independently of the `unique="true"` column metadata."
 *
 * POLARITY, PINNED: `true` MEANS UNIQUE, AND THEREFORE SAFE TO SAVE. `false` means the value is
 * already taken and the save must be rejected. This is read first-hand, not inferred:
 * `org/Hibachi/HibachiDAO.cfc:L142-L144` returns false when the existence query finds rows, and
 * `:L146` returns true when it finds none. `validate_unique` at
 * `org/Hibachi/HibachiValidationService.cfc:L467-L470` then returns that result UNMODIFIED as its
 * own pass-or-fail verdict, which is what {@link Validator} does too. Inverting this is silent:
 * every uniqueness rule in the slice would pass when it should fail, with no compile error and no
 * lint finding, so the accompanying test must exercise the COLLIDING case — a test that only
 * covers the non-colliding path passes under either polarity.
 *
 * SELF-EXCLUSION IS A NO-OP ON INSERT. The legacy existence query excludes the row being validated
 * by comparing primary identifiers (`org/Hibachi/HibachiDAO.cfc:L140`). On an insert there is no
 * assigned identifier yet, so that term excludes nothing. Recorded because it looks like
 * protection against self-collision and is not, on the path that matters most.
 *
 * THE SEVEN. A direct search for the `unique` key across exactly the seven in-scope documents
 * returns SEVEN rules, and all seven are routed through the port:
 *
 *   model/validation/Product.json:10       productCode      (also carries the format rule)
 *   model/validation/Product.json:16       urlTitle
 *   model/validation/Sku.json:11           skuCode
 *   model/validation/Brand.json:5          urlTitle
 *   model/validation/Option.json:3         optionCode       (also carries the format rule)
 *   model/validation/OptionGroup.json:4    optionGroupCode  (also carries the format rule)
 *   model/validation/ProductType.json:4    urlTitle
 *
 * `model/validation/Product_UpdateSkus.json` contributes none.
 *
 * RECONCILING THE COUNTS, so they stop appearing to contradict one another. IR-5's "five of the
 * eight unique columns" counts entity `unique="true"` COLUMN METADATA, a different and independent
 * mechanism. The sibling declaration `../ports/UniquePropertyPort` enumerates SIX in its primary
 * list because that list is scoped to five documents, and it separately records the seventh at
 * `model/validation/ProductType.json:L4` rather than omitting it. All three numbers are correct
 * about different things; the number that governs THIS file is seven, because seven is how many
 * `unique` rules an evaluator can be handed. Six is not a ceiling. That sibling file is not edited
 * to say so — the reconciliation is stated here instead.
 *
 * =============================================================================================
 * SUBJECT CONTRACT, AND HOW VALUES ARE READ WITHOUT STRING-KEYED DISPATCH
 * =============================================================================================
 * The legacy engine reaches a property value by building an accessor name at runtime and invoking
 * it dynamically — the pattern visible in every `validate_*` body, for example
 * `org/Hibachi/HibachiValidationService.cfc:L241`. That is precisely the framework magic TR-3
 * retires and AAP 0.7.3 S3 forbids, so it is not reproduced in any form. Instead:
 *   - each {@link PropertyValidation} carries an explicit, typed {@link PropertyValueReader};
 *   - each `method` constraint carries the ACTUAL bound domain method (AAP 0.4.1.5 requires "the
 *     two method rules wired to the domain methods rather than to strings"), plus that method's
 *     name, which is needed for one reason only: the key shape at
 *     `org/Hibachi/HibachiValidationService.cfc:L222` embeds it;
 *   - each `unique` constraint carries an explicit {@link UniqueTargetResolver}, the typed
 *     analogue of the last-object lookup at `org/Hibachi/HibachiValidationService.cfc:L468`.
 * There is no name-to-function map, no lookup table keyed by string and no reflection anywhere in
 * this file.
 *
 * {@link ValidationSubject} therefore declares exactly TWO members, which are exactly the two
 * reads the legacy engine performs on the object that are not value access: the class name
 * (`org/Hibachi/HibachiValidationService.cfc:L202`, `:L213`, `:L216`) and the property-existence
 * test (`:L171`).
 *
 * A PERSISTENCE FLAG IS DELIBERATELY ABSENT. `org/Hibachi/HibachiValidationService.cfc:L212`
 * branches on whether the subject is persistent, and that branch selected two things: the
 * substitution struct's class-name prefix, which decision D-1 removes entirely, and which
 * class-name resolution to use — a last-entity walk along a dotted identifier at `:L213` versus
 * the subject's own class name at `:L216`. Every property identifier in all seven documents is a
 * single segment containing neither a dot nor an underscore, so both branches resolve to the same
 * value and the distinction is unobservable in this slice. Declaring a flag that could not change
 * an outcome would be capability beyond what the migration requires (AAP 0.8.2 guideline 4), so
 * the subject's own class name is used and the branch is recorded here instead.
 *
 * =============================================================================================
 * THE ERROR BAG — WHAT IS REPORTED, AND UNDER WHICH KEY
 * =============================================================================================
 * Failures are accumulated in {@link ValidationError} from `../errors/ValidationError`, whose
 * surface mirrors the accessors the in-scope entities expose at
 * `org/Hibachi/HibachiTransient.cfc:L29-L68` — notably a miss returning an empty array (`:L43`)
 * rather than raising. That file is a fixed dependency: nothing here edits it and nothing here
 * redeclares any part of it.
 *
 * THE KEY IS THE FULL PROPERTY IDENTIFIER — the highest-risk detail in this file. All three
 * reporting branches (`org/Hibachi/HibachiValidationService.cfc:L224`, `:L228`, `:L232`) report
 * against the property identifier, never against the constraint type and never against a method
 * name. Concretely, BOTH method-rule failures declared at `model/validation/Sku.json:L5-L8` report
 * under the key `options`, not under `hasUniqueOptions` or `hasOneOptionPerOptionGroup`. Two
 * failures landing under one key is exactly why a key's value is an array.
 *
 * The shortened name derived at `org/Hibachi/HibachiValidationService.cfc:L208` is used ONLY to
 * compose the message. It is never the key.
 *
 * TWO ARGUMENTS TO addError, ALWAYS (requirement N6). The engine's only call site passes the
 * identifier and the message and nothing else (`org/Hibachi/HibachiValidationService.cfc:L234`). A
 * three-argument override does exist, at `org/Hibachi/HibachiEntity.cfc:L151`, whose third
 * parameter marks an error as not affecting persistence — but that is an ENTITY concern belonging
 * to `src/domain/`, never a validation-engine concern. A third argument is never passed from here,
 * and this note exists so the next reader does not "restore" one. The dependency's own signature
 * takes exactly two parameters, so the compiler enforces it as well.
 *
 * NO GLOBAL FLAG IS SET (requirement N4). `org/Hibachi/HibachiTransient.cfc:L455-L457` raises a
 * process-wide "the object graph has errors" flag when a persistent object fails validation. That
 * is mismatch M5, and AAP 0.4.1.7 places it in `src/adapters/mysql/UnitOfWork.ts`. Reproducing it
 * here would breach hexagonal separation (AAP 0.7.3 S4) and, worse, would leak state across
 * invocations on a warm container (M7). This engine holds NO module-scope state of any kind.
 *
 * =============================================================================================
 * M6 — THE VALIDATION READ-BACK LOOP. THE HIGHEST-RISK ITEM IN THE WHOLE SLICE
 * =============================================================================================
 * AAP 0.6.2 states it plainly: "`Sku.hasUniqueOptions()` is not an ordinary helper. It is a
 * declarative validation rule registered in `model/validation/Sku.json` for the save context, and
 * it executes a database query to do its work."
 *
 * The cycle, and this file is where it is entered:
 *   `SkuService.createSkus()` -> save a Sku -> validation selects the `save` context ->
 *   the method rule at `model/validation/Sku.json:L6` -> `Sku.hasUniqueOptions()`
 *   (`model/entity/Sku.cfc:L756-L769`, whose L763 calls the product's option-resolution member)
 *   -> a query over the SKU and SKU-option tables -> back into the save that is still in flight.
 *
 * Under CFML and Hibernate the rule observes only siblings already visible to the ORM session.
 * In the target there is no ORM session and no automatic flush, so — again AAP 0.6.2 — "a naive
 * port that inserts every combination and then validates, or that validates before any insert,
 * produces different results from the legacy code — silently."
 *
 * M6 is jointly owned by this folder and `src/adapters/`; the same-transaction visibility half
 * belongs to `src/adapters/mysql/UnitOfWork.ts`. What this file owes, and discharges:
 *   (a) the method rule is invoked ONCE PER SUBJECT, in the order the caller presents subjects —
 *       for a combination batch, the order the combination engine produced them. This engine never
 *       batches subjects and never reorders them.
 *   (b) it stays asynchronous WITHOUT being hoisted out of sequence. Every constraint is awaited
 *       one at a time inside an ordinary sequential loop. There is no concurrent settlement of
 *       constraint promises anywhere in this file, deliberately: settling them together would
 *       reorder the very reads whose ordering is the behavior under preservation.
 *   (c) it never defeats that visibility by caching. No result is memoised across subjects, no
 *       snapshot is pre-fetched, and the rule is re-invoked for every subject.
 *
 * =============================================================================================
 * CONTEXT IS A CLOSED NINE-MEMBER UNION (requirement N2, as amended by DECISION V-1)
 * =============================================================================================
 * Nine context strings are observed. FIVE are declared in a `contexts` key — `save`, `delete`,
 * `addOptionGroup`, `addOption` and `addSubscriptionTerm`. FOUR are runtime-only and appear in no
 * in-scope document: the empty string, which is the engine's own default
 * (`org/Hibachi/HibachiValidationService.cfc:L153`, and again at
 * `org/Hibachi/HibachiTransient.cfc:L408`); `edit`, from `org/Hibachi/HibachiEntity.cfc:L215`;
 * `process`, the default at `org/Hibachi/HibachiEntity.cfc:L224`; and `updateSkus`.
 *
 * That last one is proven rather than guessed: `org/Hibachi/HibachiService.cfc:L114` composes a
 * process method name from the class name and the process context, and
 * `model/service/ProductService.cfc:L216` declares the member that composition must land on. The
 * same round-trip holds for the two declared process contexts at
 * `model/service/ProductService.cfc:L113` and `:L128`.
 *
 * ALL NINE are members of {@link ValidationContext}, and the parameter is that union rather than a
 * plain `string`. The count matters: a closed FIVE-member union of the declared contexts alone would
 * make the editability and processability checks at `org/Hibachi/HibachiEntity.cfc:L215` and `:L225`
 * UNREPRESENTABLE, which is why the four runtime-only contexts are first-class members here. What
 * the union excludes is not any observed context but the three values that switch validation OFF —
 * see DECISION V-1 on {@link ValidationContext} for the gate at `:L162`, the enumeration proving no
 * legacy call site selects it, and {@link legacyContextDisablesValidation} for the preserved
 * predicate itself.
 *
 * THE UNION IS ALSO CHECKED AT RUNTIME. A TypeScript union is erased when the bundle is emitted, so
 * the declaration alone binds only the callers the compiler checks. {@link Validator.validate}
 * therefore refuses any context outside {@link VALIDATION_CONTEXTS} before it does anything else,
 * which closes the same bypass on the three paths a type cannot reach — a parsed request body, an
 * `as ValidationContext` assertion, and a JavaScript consumer of the bundle. The refusal is licensed
 * on the D18 precedent and is argued in full at {@link VALIDATION_CONTEXTS}.
 *
 * Under any runtime-only context the L71 rule still governs: only rules WITHOUT a `contexts` key
 * fire, which across these seven documents means only the two rules of
 * `model/validation/Product_UpdateSkus.json`.
 *
 * TWO DOCUMENTED NON-PORTS (N5). Neither is a carried defect, so neither is annotated as one — AAP 0.7.3
 * S7 governs defects, and inventing a register entry for a deliberate omission would misuse it. The
 * POPULATED-SUB-PROPERTY CASCADE at `org/Hibachi/HibachiTransient.cfc:L412-L453` re-validates populated
 * sub-properties under a context chosen by `org/Hibachi/HibachiValidationService.cfc:L133-L151`, and that
 * chooser reads a `populatedPropertyValidation` key none of the seven documents declares, so the cascade
 * is unreachable from these rule sets and no cascade API exists here. The CUSTOM-OVERRIDE MERGE at
 * `org/Hibachi/HibachiValidationService.cfc:L6-L53` merges a per-class override document from the
 * customisation tree, whose validation directory holds nothing but a readme, so building a merge
 * mechanism for an empty input would violate AAP 0.7.3 S9. Also absent is the per-class-and-context
 * memoisation at `:L57` and `:L92`: rule sets are already resolved values here, and per M7 any
 * memoisation would have to be request-scoped rather than module-scoped, which makes no caching at all
 * the simplest compliant choice.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4). Two imports and no others: the error bag from `../errors/`, and
 * the uniqueness boundary from `../ports/` as a TYPE-ONLY import so no runtime edge is created. Both are
 * relative, per AAP 0.4.3.5 — "deliberately no path aliases — so `tsc` and `esbuild` resolve identically
 * and no runtime resolver shim is needed" — and there is no barrel re-export. This file issues no queries
 * and names no physical table or column, reaching the database only through the injected port (AAP 0.7.3
 * S2); it reads no process environment, configuration flowing one way through `src/config/`; and it
 * imports nothing from `adapters/`, `services/`, `config/`, `handlers/` or `integrations/`, and no cloud
 * handler type, that coupling belonging to `src/handlers/` alone. Collaborators arrive through the
 * constructor and nowhere else (AAP 0.7.3 S3): no service locator, no container import, no module-scope
 * singleton, no dynamic resolution.
 *
 * A NOTE ON LEGACY MESSAGE TEXT. Where the legacy engine raises for an authoring fault — an unrecognised
 * constraint type at `org/Hibachi/HibachiValidationService.cfc:L202`, an unrecognised `dataType` value at
 * `:L263` — this port also raises, because raising is the behavior, but it does NOT reproduce the legacy
 * wording: those strings are framework text outside the closed inventory `src/errors/` owns, so the
 * locators alone are cited.
 */

import { ValidationError } from '../errors/ValidationError';
import type { UniquePropertyEntity, UniquePropertyPort } from '../ports/UniquePropertyPort';

/* ==============================================================================================
 * SECTION 1 — CFML VALUE SEMANTICS
 *
 * The legacy predicates are written in CFML and lean on CFML's type system: one null, loose
 * equality, case-insensitive string comparison, boolean-and-numeric interchange, and list
 * functions that drop empty elements. TypeScript shares none of that, so the semantics are
 * reproduced explicitly here, once, where they can be reviewed and tested as a unit rather than
 * being re-improvised inside eleven evaluators.
 *
 * Everything in this section is module-private and pure. Nothing in it reads a clock, a
 * connection, the environment or any shared state.
 * ============================================================================================ */

/**
 * The one absent value of CFML, expressed over the two of TypeScript.
 *
 * CFML has a single null; TypeScript has both `null` and `undefined`, and a property reader can
 * plausibly return either — `undefined` for an unset field, `null` for a column read back as SQL
 * NULL. Both are treated as the CFML null, which is what makes the null column of the table in the
 * module header apply uniformly however a rule set's reader is written.
 */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

/**
 * Whether `value` is what CFML calls a simple value: a string, a number, a boolean or a date.
 *
 * Used by the length, collection and pattern predicates, each of which distinguishes a simple
 * value from a collection. Dates are included because CFML classifies them as simple, and a
 * date-valued property would consequently pass a length check rather than failing one.
 */
function isCfSimpleValue(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

/**
 * The string form CFML would measure or compare a simple value by.
 *
 * Only ever called after {@link isCfSimpleValue} has returned true, so the fallback is
 * unreachable for the value kinds this engine handles; it exists to keep the function total
 * without an assertion, because a cast here would be a cast on the hottest correctness path in
 * the file.
 */
function cfToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return '';
}

/**
 * CFML's numeric test.
 *
 * A finite number qualifies, and so does a string whose trimmed form is entirely a decimal
 * numeral — optionally signed, optionally fractional, optionally with an exponent. The empty
 * string does not qualify, which is why `required` and `dataType` disagree about it.
 *
 * TRANSLATION DECISION, stated because it is a judgment call rather than a transcription: a
 * BOOLEAN is NOT numeric here. CFML engines interchange booleans and the numbers 1 and 0 in many
 * positions, but the three properties any numeric rule in the seven documents actually targets —
 * price, list price and renewal price, at `model/validation/Sku.json:L4`, `:L9` and `:L10`, and
 * `model/validation/Product.json:L8` — are money values that never arrive as booleans. Accepting a
 * boolean as a number would therefore widen a rule without any in-scope evidence for it. The
 * interchange IS reproduced where the legacy code demonstrably relies on it, namely inside
 * {@link isCfLooseEqual}, whose comparison ladder converts booleans numerically. Locale-specific
 * grouped numerals and hexadecimal forms are likewise not accepted; no in-scope property is fed
 * from a locale-formatted source.
 */
function isCfNumeric(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * The number CFML would compare a value as, or `undefined` when it would not compare it as one.
 *
 * Booleans convert to 1 and 0 here, and ONLY here, because loose equality is the one place the
 * legacy code demonstrably depends on that interchange — see the note on {@link isCfNumeric}.
 */
function toCfNumber(value: unknown): number | undefined {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!isCfNumeric(value)) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number(value.trim());
  }
  return undefined;
}

/**
 * The boolean CFML would cast a value to, or `undefined` when the value is not castable.
 *
 * CFML accepts the booleans themselves, the words true/false and yes/no in any case, and any
 * number — where zero is false and every other value is true. Nothing else casts. The empty
 * string, in particular, does NOT cast, which is what makes the context gate at
 * `org/Hibachi/HibachiValidationService.cfc:L162` run validation for an empty context rather than
 * skipping it.
 */
function toCfBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === 'true' || normalised === 'yes') {
    return true;
  }
  if (normalised === 'false' || normalised === 'no') {
    return false;
  }
  if (isCfNumeric(normalised)) {
    return Number(normalised) !== 0;
  }
  return undefined;
}

/**
 * The legacy context gate — `org/Hibachi/HibachiValidationService.cfc:L162`, preserved verbatim in
 * behaviour and provably unreachable in effect.
 *
 * TODO(parity): `org/Hibachi/HibachiValidationService.cfc:L162` reads
 * `if(!isBoolean(arguments.context) || arguments.context)`, whose own comment is "If the context was
 * 'false' then we don't do any validation". A boolean-castable-false context therefore skips EVERY
 * rule and returns an empty bag. That behaviour is carried across rather than repaired, per AAP
 * 0.6.7 "preserve and annotate, do not repair", and this is the annotation.
 *
 * WHY IT IS STILL HERE AT ALL, given that it can no longer fire. Because deleting it would be a
 * silent behavioural claim that the legacy gate does not exist, and because the gate is genuinely
 * part of the engine's contract: `:L196` returns the bag either way, which is why this predicate
 * only decides whether to SKIP, never what to return. The same treatment — keep a proven-unreachable
 * branch, present and documented, rather than drop it or pretend it is exercised — is applied to the
 * populate-array branch in `../domain/base/populate.ts`, and for the same reason.
 *
 * WHY IT CANNOT FIRE, member by member. {@link toCfBoolean} returns `false` only for the strings
 * `false` and `no` in any case, and for any numeric string or number equal to zero. Across the nine
 * members of {@link ValidationContext}: `''` does not cast at all and so returns `undefined` — which
 * is exactly what makes an empty context VALIDATE NORMALLY rather than skip, the subtlety `:L162`
 * turns on; and `save`, `delete`, `edit`, `process`, `addOptionGroup`, `addOption`,
 * `addSubscriptionTerm` and `updateSkus` are none of them boolean words and none of them numeric, so
 * each also returns `undefined`. `undefined === false` is false, so every member proceeds to
 * validate. The predicate is retained as a total function over the union rather than hard-coded to
 * `false`, so that it stays a transcription of `:L162` and would keep behaving correctly if a member
 * were ever added.
 *
 * NO SEPARATE REQUEST-FACING ENTRY POINT EXISTS for the bypass, and none is provided: the closed
 * union at the one public entry point is the compatibility boundary, so there is nothing for a
 * handler, router or service to forward that could switch validation off. Requirement V-1 records
 * the enumeration proving no legacy call site selects it either.
 *
 * AND THE UNION IS NOW ENFORCED AT RUNTIME, not only declared. {@link Validator.validate} refuses any
 * context outside {@link VALIDATION_CONTEXTS} as its first statement, so this predicate can no longer
 * be reached with a boolean-castable-false value even by a caller that asserted past the type or that
 * has no types at all. The per-member proof above therefore describes a branch that is unreachable in
 * FACT; it is retained, present and documented, exactly as before.
 */
function legacyContextDisablesValidation(context: ValidationContext): boolean {
  return toCfBoolean(context) === false;
}

/**
 * CFML's loose equality, reproduced as the ladder that satisfies every observed case.
 *
 * The ladder is ordered, and the order is what makes it correct:
 *   1. If BOTH sides convert to numbers, compare numerically. This rung is first because it is
 *      what keeps `eq 1` from matching the number 2 — both are boolean-castable to true, so a
 *      boolean-first ladder would wrongly report them equal.
 *   2. Otherwise, if both sides cast to booleans, compare as booleans. This rung is what makes
 *      `eq false` match the string "no", which no numeric comparison could.
 *   3. Otherwise compare as strings, CASE-INSENSITIVELY, because CFML's `==` ignores case on
 *      strings. A value that is not a simple value cannot be compared this way and reports
 *      unequal rather than raising.
 *
 * Worked against every case named in the module header: `eq false` matches false, "false", 0, "0"
 * and "no"; `eq 1` matches 1, "1", true and "yes", and does not match 2.
 *
 * One deliberate simplification, recorded because a reader comparing signatures will notice it:
 * the legacy evaluator declares its constraint value as a string
 * (`org/Hibachi/HibachiValidationService.cfc:L385`), so CFML stringifies a declared boolean before
 * comparing. This port compares against the declared value as authored. The outcome is identical
 * for every case above, because the comparison is loose on both sides of the translation — the
 * ladder reaches the same rung whether the right-hand side is the boolean false or the string
 * "false".
 */
function isCfLooseEqual(left: unknown, right: unknown): boolean {
  const leftNumber = toCfNumber(left);
  const rightNumber = toCfNumber(right);
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber === rightNumber;
  }

  const leftBoolean = toCfBoolean(left);
  const rightBoolean = toCfBoolean(right);
  if (leftBoolean !== undefined && rightBoolean !== undefined) {
    return leftBoolean === rightBoolean;
  }

  if (!isCfSimpleValue(left) || !isCfSimpleValue(right)) {
    return false;
  }
  return cfToString(left).toLowerCase() === cfToString(right).toLowerCase();
}

/**
 * Splits a CFML comma-delimited list into its elements.
 *
 * Two behaviours of CFML list functions are reproduced because both are observable:
 *   - EMPTY ELEMENTS ARE DROPPED. A list of "a,,b" holds two elements, not three, which is why an
 *     empty needle can never be found in any list.
 *   - ELEMENTS ARE NOT TRIMMED. A list written "a, b" holds "a" and " b", so a search for "b"
 *     does not match. No value in the seven documents contains a space — the two-context list at
 *     `model/validation/Product.json:L4` and the option lists at `:L4` and `:L5` are all written
 *     without one — so this cannot change an in-scope outcome. It is reproduced anyway, because
 *     trimming would be a silent behavior change offered as a convenience.
 */
function cfListToArray(list: string): string[] {
  return list.split(',').filter((element) => element.length > 0);
}

/**
 * CFML's case-insensitive list search, as a predicate.
 *
 * This is the comparison behind the context gate at
 * `org/Hibachi/HibachiValidationService.cfc:L71` and behind the `inList` evaluator at `:L461`.
 * A needle that is not a simple value cannot appear in a list and reports false; an empty needle
 * reports false for the reason given on {@link cfListToArray}.
 */
function cfListContainsNoCase(list: string, needle: unknown): boolean {
  if (!isCfSimpleValue(needle)) {
    return false;
  }
  const target = cfToString(needle).toLowerCase();
  if (target.length === 0) {
    return false;
  }
  return cfListToArray(list).some((element) => element.toLowerCase() === target);
}

/**
 * The trailing segment of a property identifier, splitting on BOTH the dot and the underscore.
 *
 * This reproduces `org/Hibachi/HibachiValidationService.cfc:L208`, where the delimiter argument is
 * a two-character string and CFML treats EACH character as a delimiter — not the pair as one.
 * Empty segments are dropped, per {@link cfListToArray}, so a trailing or doubled delimiter does
 * not yield an empty result. An identifier with no delimiter at all comes back unchanged, which is
 * the case for every property identifier in all seven documents.
 *
 * It is used for two things and nothing else: composing the message (`:L208`) and naming the
 * property handed to the uniqueness port (`:L469`). It is NEVER the error key.
 */
function cfLastSegment(propertyIdentifier: string): string {
  const segments = propertyIdentifier.split(/[._]/).filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  return last ?? propertyIdentifier;
}

/**
 * Whether `value` is what CFML would treat as a struct rather than as a component instance.
 *
 * CFML distinguishes the two, and the distinction changes outcomes: the presence predicate at
 * `org/Hibachi/HibachiValidationService.cfc:L242` passes ANY component instance outright while
 * requiring a struct to be non-empty, and the collection predicates at `:L303` and `:L311` count a
 * struct's keys while rejecting anything that is neither struct nor array.
 *
 * TRANSLATION DECISION: the discriminator is the prototype. A plain object literal, or a
 * prototype-less record of the kind a CFML struct really is, counts as a struct; anything carrying
 * a class prototype counts as a component instance. This is the closest faithful mapping available
 * — the required-property rules in scope target entity references (`productType` at
 * `model/validation/Product.json:L11` and `optionGroup` at `model/validation/Option.json:L5`),
 * which are class instances, while the collection rules target arrays.
 */
function isCfStruct(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * The number of keys CFML would count in a struct.
 *
 * Only called once {@link isCfStruct} has confirmed the value is struct-like — which it does as a
 * TYPE GUARD, so no cast is needed at any call site. Own enumerable keys are counted, which is what
 * a CFML struct's key count means; a prototype-less record has no inherited keys to confuse the
 * count in the first place.
 */
function cfStructCount(value: object): number {
  return Object.keys(value).length;
}

/**
 * CFML's URL validity test, reproduced over its six documented protocols.
 *
 * `org/Hibachi/HibachiValidationService.cfc:L259` delegates to the engine's own validity check,
 * whose documented URL protocols are HTTP, HTTPS, FTP, FILE, MAILTO and NEWS. Those six are
 * honoured here: the first four require an authority separator after the scheme, the last two do
 * not, and in every case a non-empty remainder containing no whitespace is required.
 *
 * HONEST LIMITATION, stated rather than implied away. The engine's internal pattern is not
 * published byte-for-byte, and no CFML runtime is available in this environment to compare against
 * — AAP 0.8.4.1 records that the cited local Docker setup does not exist in this repository, so no
 * behavioural comparison against the original was possible for any part of this port. This
 * predicate is therefore a documented APPROXIMATION of one engine function, and it is the only
 * approximation in this file. Every other predicate here is a transcription of CFML source or of
 * documented CFML operator semantics.
 *
 * ⭐ THIS IS THE ONLY URL PREDICATE IN THE SUBTREE. All six protocols are honoured
 * unconditionally, exactly as `:L259` does, and there is no policy split — see THE SIX-PROTOCOL URL
 * CHECK IS STILL THE WHOLE CHECK below for what SEC-15 attempted, which half of it stays withdrawn,
 * and which two syntactic rules are reinstated here.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — TWO SYNTACTIC RULES, NEITHER OF THEM A PROTOCOL NARROWING. A value
 * carrying an ASCII control character is refused (a parity CORRECTION, argued at
 * {@link containsAsciiControlCharacter}), and an authority component carrying userinfo credentials is
 * refused (a narrow DECLARED hardening, argued at {@link hasEmbeddedUserinfo}). Every one of the six
 * protocols still passes, which is exactly what distinguishes these two rules from the withdrawn
 * SEC-15 policy that rejected four whole protocols.
 */
function isCfUrlAnyProtocol(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  /*
   * SEC-HARDENING (D18-CLASS) — evaluated on the RAW value, BEFORE the trim below, and that ordering
   * is the point. `String.prototype.trim` strips tab, newline, carriage return, vertical tab and form
   * feed, so a check placed after it would let a leading or trailing CR-LF pair through and the value
   * would be stored carrying it. See {@link containsAsciiControlCharacter} for why refusing is the
   * faithful reading of `isValid("url", …)` rather than a narrowing of it.
   */
  if (containsAsciiControlCharacter(value)) {
    return false;
  }

  const candidate = value.trim();
  if (candidate.length === 0 || /\s/.test(candidate)) {
    return false;
  }
  if (!/^(?:(?:https?|ftp|file):\/\/|(?:mailto|news):)[^\s]+$/i.test(candidate)) {
    return false;
  }

  /*
   * SEC-HARDENING (D18-CLASS) — applied LAST, so it is reached only by a value that is otherwise a
   * well-formed URL in one of the six protocols. Scoped to the authority component of the four
   * authority-bearing schemes, so `mailto:hello@acme.test` is untouched.
   */
  return !hasEmbeddedUserinfo(candidate);
}

/**
 * Whether a string carries any ASCII control character — U+0000 to U+001F, or U+007F.
 *
 * =============================================================================================
 * ⭐ SEC-HARDENING (D18-CLASS) — A PARITY CORRECTION, NOT A NARROWING
 * =============================================================================================
 * THE FLAW THIS CLOSES. `isCfUrlAnyProtocol` trims the candidate and then rejects any remaining
 * whitespace, which catches every character JavaScript calls whitespace and NOTHING ELSE. The C0
 * control range is not whitespace apart from tab, LF, VT, FF and CR, so before this check
 * `https://acme.test/\u0000etc`, `https://acme.test\u0007`, `https://acme.test\u007f` and
 * `https://acme.test\r\nX-Injected: 1` all validated CLEAN and were stored verbatim. A stored value
 * carrying a raw CR or LF is a header-injection and log-injection payload the moment any consumer
 * puts it in a header or a log line (CWE-113, CWE-117); one carrying a NUL is a truncation payload for
 * any consumer that passes it to a C-string boundary (CWE-158). This is the CWE-20 half of the
 * finding, and it is a defect in the APPROXIMATION rather than a property of the legacy.
 *
 * WHY THIS IS A CORRECTION AND NOT A DIVERGENCE. `org/Hibachi/HibachiValidationService.cfc:L259`
 * delegates to the engine's `isValid(…, "url")`, which is a URL SYNTAX check. RFC 3986 §2 defines the
 * complete set of characters a URI may contain — unreserved, reserved and percent-encoded — and no
 * control character is in any of those sets; a control character can appear in a URI only
 * percent-encoded, never raw. So a string containing a raw control character is not a syntactically
 * valid URL under the specification the engine's own check implements, and the engine cannot be
 * accepting it AS a valid URL. Refusing it therefore aligns the approximation with the function it
 * approximates. The doc above already records that this predicate is the one documented approximation
 * in this file and that no CFML runtime exists here to compare against (AAP §0.8.4.1); correcting an
 * approximation toward its specification is not the "enhancement beyond what the migration requires"
 * that AAP §0.8.2 guideline 4 forbids.
 *
 * THE ONE OBSERVABLE DIFFERENCE, stated plainly rather than buried. A value whose ONLY control
 * characters are at the very start or the very end — `"https://acme.test\n"`, say — previously passed
 * because the trim removed them, and now fails. That is the deliberate consequence of checking before
 * trimming: the trim decides what this predicate examines, but it does not change what gets STORED, so
 * a value that passes on its trimmed form is persisted with the control character still in it. No
 * legitimate brand website carries one, and the flaw class removed is the same class D18 removes.
 *
 * WHAT IS DELIBERATELY NOT DONE. Ordinary spaces are still trimmed from the edges exactly as before,
 * so `" https://acme.test "` still passes. Nothing is stripped, rewritten, percent-encoded or
 * normalised — the value is refused or passed through untouched, per the REFUSE-NEVER-NORMALISE policy
 * this subtree applies uniformly.
 *
 * Iterated by code point rather than tested with a regular expression so that no control character
 * appears in a pattern literal, and so the C1 range is unambiguously out of scope: only the C0 range
 * and DEL are ASCII controls, and a U+0080-U+009F character in a URL is a separate matter this
 * predicate deliberately does not judge.
 */
function containsAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      return true;
    }
  }
  return false;
}

/** The four of the six protocols that carry an authority component after `://`. */
const AUTHORITY_BEARING_URL_SCHEME = /^(?:https?|ftp|file):\/\//i;

/**
 * Whether a URL's AUTHORITY component carries a userinfo (`user@host` or `user:password@host`) part.
 *
 * =============================================================================================
 * ⭐ SEC-HARDENING (D18-CLASS) — A NARROW DECLARED DEPARTURE, AND THE SECOND ONE IN THIS PORT
 * =============================================================================================
 * THE FLAW THIS CLOSES. `https://acme.test@evil.test/` reads to a human as a link to `acme.test` and
 * resolves to `evil.test`, because everything before the `@` is userinfo and the host is what follows
 * it. That is the classic CWE-601 deceptive-authority vector, and `https://user:pass@acme.test/`
 * additionally stores a credential in a field that is read back and rendered. `Brand.brandWebsite` is
 * a value a renderer puts in a link position, so both matter there specifically.
 *
 * THIS IS A DECLARED DEPARTURE, NOT A CORRECTION, and it is labelled differently from the control
 * character rule above for that reason. RFC 3986 §3.2.1 permits the userinfo production and merely
 * DEPRECATES the `user:password` form — "Use of the format user:password in the userinfo field is
 * deprecated" — so unlike a raw control character, a credentialed URL is syntactically valid and the
 * legacy engine's `isValid(…, "url")` accepts it. A brand carrying one SAVED in the legacy system and
 * is refused here. AAP §0.6.7.7 establishes the mechanism for exactly this: D18 is a divergence
 * declared in the open, argued, and recorded, rather than a silent fix — and this is the second entry
 * in that category, declared here in the same register.
 *
 * WHY IT IS LICENSED WHERE THE WITHDRAWN SEC-15 POLICY WAS NOT. The withdrawn policy rejected FOUR
 * WHOLE PROTOCOLS — `file`, `mailto`, `ftp` and `news` — and so refused entire categories of value
 * that the legacy accepted and MEANT: `mailto:hello@acme.test` is a perfectly ordinary contact URL.
 * This rule rejects no protocol at all. All six still pass, and what it removes is a single
 * sub-component that carries no business meaning in a brand website field and that the specification
 * itself deprecates. The blast radius is one syntactic form rather than four schemes, which is what
 * makes it proportionate where the policy split was not.
 *
 * SCOPED TO THE AUTHORITY, WHICH IS WHY `mailto:` IS UNAFFECTED. Only the four schemes in
 * {@link AUTHORITY_BEARING_URL_SCHEME} have an authority component, and only the span between `://`
 * and the first `/`, `?` or `#` is examined. So `mailto:hello@acme.test` and `news:acme.group` are not
 * inspected at all — their `@` is part of an opaque path, not userinfo — and `https://acme.test/a@b`
 * passes, because an `@` in a PATH is ordinary and carries no deceptive-authority meaning.
 *
 * @param candidate a trimmed, whitespace-free string already known to match one of the six protocols
 * @returns true when the authority component contains an `@`
 */
function hasEmbeddedUserinfo(candidate: string): boolean {
  const scheme = AUTHORITY_BEARING_URL_SCHEME.exec(candidate);
  if (scheme === null) {
    // `mailto:` and `news:` carry no authority component, so there is no userinfo to find.
    return false;
  }

  const authorityStart = scheme[0].length;
  let authorityEnd = candidate.length;
  for (let index = authorityStart; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (character === '/' || character === '?' || character === '#') {
      authorityEnd = index;
      break;
    }
  }

  return candidate.slice(authorityStart, authorityEnd).includes('@');
}

/* ==============================================================================================
 * SECTION 2 — THE TYPED CONSTRAINT MODEL
 *
 * This is the typed rule-set half of the AAP 0.4.1.5 mandate. Where the legacy engine read an
 * untyped structure out of a JSON document and dispatched on its keys by name, the shapes below
 * are compile-checked declarations: an unknown constraint kind, a misspelled key, a `dataType`
 * value outside the two the seven documents use, or a `method` rule wired to a string instead of a
 * function are all COMPILE errors rather than runtime surprises. That is the typed analogue of the
 * legacy engine's runtime raise at `org/Hibachi/HibachiValidationService.cfc:L212`, and of its
 * `dataType` whitelist raise at `:L263`.
 *
 * Every type is exported by name. There is no default export and no barrel re-export, and each
 * shape is a plain readonly record so that a rule set — or a test double, in a repository whose
 * legacy suite ships no mocking library at all (AAP 0.4.3.6) — can be written as an ordinary
 * object literal with no builder, factory or decorator involved. Decorators in particular are
 * absent by design: the compiler configuration enables neither of the decorator options.
 * ============================================================================================ */

/**
 * What this engine requires of the object being validated, and nothing more.
 *
 * Exactly two members, which are exactly the two reads the legacy engine performs on the subject
 * that are not property-value access. See SUBJECT CONTRACT in the module header for why a
 * persistence flag is deliberately not a third.
 *
 * The shape is structural rather than nominal, so every ported domain entity and process object
 * satisfies it without declaring that it does, and a hand-written literal satisfies it too. That is
 * what makes the engine unit-testable in isolation, which the legacy engine was not: its tests
 * booted the whole framework application and resolved services dynamically (AAP 0.4.3.6).
 */
export interface ValidationSubject {
  /**
   * The subject's class name, used to compose the reported message.
   *
   * Read at `org/Hibachi/HibachiValidationService.cfc:L202`, `:L213` and `:L216`. For the entities
   * of this slice the value is the bare entity name — Product, Sku, Brand, Option, OptionGroup,
   * ProductType — and for a process object it is the underscored process-object name, exactly as
   * `model/process/Product_UpdateSkus.cfc` is named.
   */
  getClassName(): string;

  /**
   * Whether this subject actually has the named property.
   *
   * Read at `org/Hibachi/HibachiValidationService.cfc:L171`, and the answer is consequential: when
   * it is false the rule is SILENTLY SKIPPED — not failed, not raised. A rule set may therefore
   * legitimately name a property some subject variant does not carry, exactly as the legacy
   * documents could.
   */
  hasProperty(propertyIdentifier: string): boolean;
}

/**
 * Reads one property's current value off the subject.
 *
 * This replaces the legacy engine's runtime accessor-name composition and dynamic invocation — the
 * pattern at `org/Hibachi/HibachiValidationService.cfc:L241` and in every sibling evaluator — with
 * an explicit typed function, per TR-3 and AAP 0.7.3 S3.
 *
 * The return type is `unknown` rather than a union of the shapes the engine can handle, and
 * deliberately so: the property really may be a string, a number, a boolean, a date, an array, a
 * struct-like record or an entity reference, and the null column of the table in the module header
 * depends on being able to observe an absent value. `unknown` forces every evaluator to narrow
 * before it reads, which is the point. It is never widened to the unchecked top type.
 *
 * A reader must be a plain synchronous accessor. Nothing in the legacy evaluators awaits a property
 * value, so a reader that returned a promise would be compared as an object and would silently fail
 * every simple-value predicate.
 */
export type PropertyValueReader<TSubject extends ValidationSubject> = (
  subject: TSubject,
) => unknown;

/**
 * Resolves the entity a uniqueness check should be performed against.
 *
 * The typed analogue of the last-object lookup at
 * `org/Hibachi/HibachiValidationService.cfc:L468`. It exists as an explicit function because
 * {@link ValidationSubject} deliberately does not satisfy the port's entity shape: the port needs
 * five accessors of its own, and requiring every validated subject to expose them would widen the
 * subject contract for the benefit of seven rules.
 *
 * For every `unique` rule in the seven documents the property identifier is a single segment, so
 * the resolved entity is the subject itself. The indirection is retained because the legacy engine
 * has it, and because a dotted identifier would resolve elsewhere.
 */
export type UniqueTargetResolver<TSubject extends ValidationSubject> = (
  subject: TSubject,
) => UniquePropertyEntity;

/**
 * Invokes a method-based validation rule against the subject.
 *
 * AAP 0.4.1.5 requires "the two method rules wired to the domain methods rather than to strings",
 * so this is the actual bound domain method — never a name looked up in a map. The legacy engine
 * invokes it with NO arguments (`org/Hibachi/HibachiValidationService.cfc:L334`), which this
 * signature preserves: the subject is the only thing passed, and it is passed so the binding can be
 * written as an ordinary function of the subject rather than requiring a pre-bound closure per
 * instance.
 *
 * The result type is the unknown top type, which already ADMITS A PROMISE — writing it as a union
 * with one would be redundant, since every value is assignable to it. The result is awaited
 * unconditionally at the single call site, so a synchronous rule and an asynchronous one are both
 * satisfied by this one signature. That flexibility is required, because the two in-scope rules
 * differ in both respects:
 *   - `hasUniqueOptions` (`model/entity/Sku.cfc:L756-L769`) performs a DATABASE READ at
 *     `model/entity/Sku.cfc:L763` and is therefore asynchronous in the target. This is the entry
 *     point of the M6 read-back loop described in the module header.
 *   - `hasOneOptionPerOptionGroup` (`model/entity/Sku.cfc:L772-L784`) is pure and in-memory and is
 *     therefore synchronous.
 * Both are declared in CFML as returning the widest type rather than a boolean, and the engine
 * coerces the result at `org/Hibachi/HibachiValidationService.cfc:L333-L335`; that declared-type
 * looseness is why `unknown` is faithful here and why the coercion is performed explicitly rather
 * than assumed.
 */
export type MethodRuleInvocation<TSubject extends ValidationSubject> = (
  subject: TSubject,
) => unknown;

/**
 * The only two `dataType` values the seven in-scope documents declare.
 *
 * Narrowed to a closed union ON PURPOSE, and this is the one place in the constraint model where
 * narrowing is mandated rather than chosen: AAP 0.7.3 S9 forbids implementing the address, date and
 * payment-card values that appear in the wider corpus but in none of the seven. The union makes
 * writing one a compile error, which is strictly stronger than the legacy engine's runtime raise at
 * `org/Hibachi/HibachiValidationService.cfc:L263`.
 *
 * Six of the seven `dataType` rules request `numeric` — `model/validation/Product.json:L8` and
 * `model/validation/Sku.json:L4`, `:L9`, `:L10`, plus both rules of
 * `model/validation/Product_UpdateSkus.json`. Exactly one requests `url`, at
 * `model/validation/Brand.json:L4`.
 */
export type DataTypeConstraintValue = 'numeric' | 'url';

/**
 * The value an equality constraint compares against.
 *
 * Deliberately wider than the two values observed — `false` at `model/validation/Product.json:L12`,
 * `model/validation/Sku.json:L3` and `:L12`, and `1` in both conditions of
 * `model/validation/Product_UpdateSkus.json` — because the comparison itself must stay loose. See
 * LOOSE EQUALITY in the module header: the PROPERTY side is genuinely untyped in the legacy source,
 * so a constraint written as the number 1 must still match the string "1" and the boolean true.
 * Narrowing this union would not make the comparison stricter; it would only stop a rule set from
 * expressing the legacy value in its legacy shape.
 */
export type EqualityConstraintValue = string | number | boolean;

/**
 * Presence. The most-used constraint in the slice, at eighteen rules.
 *
 * FAILS on an absent value, on an EMPTY ARRAY and on a whitespace-only string. PASSES for any
 * number including zero, for either boolean, for a non-empty array, for a non-empty struct and for
 * any entity reference. See `org/Hibachi/HibachiValidationService.cfc:L240-L246`.
 *
 * TODO(parity): the legacy evaluator declares a constraint value
 * (`org/Hibachi/HibachiValidationService.cfc:L240`) and then NEVER READS IT, so presence is
 * enforced whatever the value says — a rule written with a false value would still require the
 * property. All eighteen in-scope rules declare true, so the quirk is unobservable here; it is
 * carried rather than repaired, and the field is kept so a rule set can transcribe its document
 * faithfully.
 */
export interface RequiredConstraint {
  readonly constraintType: 'required';
  readonly constraintValue: boolean;
}

/**
 * Application-side uniqueness, evaluated exclusively through the injected port.
 *
 * See DECISION D-2 AND "THE SEVEN" in the module header for the polarity, for the self-exclusion
 * note, and for all seven locators.
 *
 * TODO(parity): as with presence, the legacy evaluator declares a constraint value at
 * `org/Hibachi/HibachiValidationService.cfc:L467` and never reads it, so the check always runs.
 * All seven in-scope rules declare true. Carried, not repaired.
 */
export interface UniqueConstraint<TSubject extends ValidationSubject> {
  readonly constraintType: 'unique';
  readonly constraintValue: boolean;

  /**
   * Resolves the entity the port should check. See {@link UniqueTargetResolver}.
   *
   * Required rather than optional: the port needs an entity shape the subject contract does not
   * provide, so there is no defensible default to fall back on. Making a rule set state it
   * explicitly is what keeps the uniqueness path free of casts.
   */
  readonly uniqueTarget: UniqueTargetResolver<TSubject>;
}

/* ==============================================================================================
 * THE SIX-PROTOCOL URL CHECK IS STILL THE WHOLE CHECK — SEC-15's POLICY SPLIT STAYS WITHDRAWN,
 * AND TWO OF ITS SYNTACTIC RULES ARE REINSTATED
 *
 * This block records a split verdict, and reading only half of it will mislead. The PROTOCOL
 * narrowing SEC-15 attempted is withdrawn and stays withdrawn. Two narrower rules it bundled in
 * alongside that narrowing are reinstated, each on its own argument, each labelled with what kind of
 * change it is. The three are separable, and separating them is the whole point: the earlier
 * revisions oscillated because all three were bundled into one all-or-nothing policy member.
 *
 * ⛔ WHAT AN EARLIER REVISION DID. It declared a `UrlDataTypePolicy` union of `'webAddress'` and
 * `'cfmlAnyProtocol'`, made naming one a REQUIRED member of every `dataType: 'url'` declaration, and
 * pointed the slice's single such declaration — `src/validation/rules/brand.rules.ts`, transcribing
 * `model/validation/Brand.json:L4` — at `'webAddress'`: a WHATWG-parsed predicate admitting only
 * `http` and `https`, and additionally rejecting embedded credentials and ASCII control characters.
 * It was declared as DECISION V-2, "a declared departure from byte-for-byte preservation", on the
 * D18 precedent.
 *
 * ⛔ WHY THE PROTOCOL NARROWING IS WITHDRAWN, AND STAYS WITHDRAWN.
 * `org/Hibachi/HibachiValidationService.cfc:L259` evaluates the rule as
 * `isNull(propertyValue) || isValid(arguments.constraintValue, propertyValue)`, and the engine's
 * documented `url` protocols are HTTP, HTTPS, FTP, FILE, MAILTO and NEWS — so a brand carrying
 * `file:///etc/passwd`, `mailto:hello@acme.test`, `ftp://files.test/x` or `news:acme.group` SAVED in
 * the legacy system, and under the withdrawn policy it failed validation instead. Those are saves the
 * legacy performed and MEANT: a contact `mailto:` is an ordinary brand website value. AAP §0.8.2
 * guideline 4 forbids enhancement "beyond what the migration requires", AAP §0.6.7 mandates "preserve
 * and annotate, do not repair", and AAP §0.2.1.5 states this document's contract as `brandWebsite`
 * "typed as a URL" with no narrowing to web schemes anywhere. ALL SIX PROTOCOLS THEREFORE PASS, and
 * the policy union, the per-declaration policy member and the second predicate remain deleted.
 *
 * ⭐ WHAT IS REINSTATED, AND WHY EACH IS SEPARABLE FROM THE ABOVE. Neither rule rejects a protocol,
 * so neither reaches the argument that sank the policy split. Both live inside
 * {@link isCfUrlAnyProtocol}, which remains the ONE predicate, evaluated unconditionally.
 *
 *   1. ASCII CONTROL CHARACTERS ARE REFUSED — a parity CORRECTION. RFC 3986 §2 admits no raw control
 *      character anywhere in a URI, so `isValid(…, "url")` cannot be accepting one AS a valid URL;
 *      the previous behaviour was a hole in the APPROXIMATION, not a property of the legacy. Before
 *      it, `https://acme.test\r\nX-Injected: 1` and `https://acme.test/\u0000etc` validated clean and
 *      were stored verbatim, which is CWE-113 and CWE-117 handed to any consumer that puts the value
 *      in a header or a log line. Full argument, including the one input whose outcome changes, at
 *      {@link containsAsciiControlCharacter}.
 *   2. USERINFO CREDENTIALS IN THE AUTHORITY ARE REFUSED — a narrow DECLARED departure, and the
 *      SECOND declared departure in this port after D18 itself. `https://acme.test@evil.test/` reads
 *      as `acme.test` and resolves to `evil.test` (CWE-601); RFC 3986 §3.2.1 deprecates the
 *      `user:password` form. Unlike rule 1 this IS a value the legacy accepted, so it is declared
 *      rather than presented as a correction. It costs one deprecated sub-component of one component
 *      of four schemes, against four whole schemes for the withdrawn policy — the difference in blast
 *      radius is what makes this proportionate and that one not. Full argument at
 *      {@link hasEmbeddedUserinfo}.
 *
 * ⚠️ WHAT REMAINS FLAGGED AND NOT CLOSED. `Brand.brandWebsite` can still hold a non-web scheme —
 * `file:`, `ftp:`, `mailto:`, `news:` — and that is deliberate per the withdrawal above. Such a value
 * may reach a link position in a renderer that treats every scheme alike (CWE-601-adjacent, and
 * CWE-79-adjacent once rendered).
 *
 * WHERE THE VALUE ACTUALLY GOES, re-measured rather than asserted. An earlier revision of this
 * paragraph claimed "no other in-scope member reads `brandWebsite` at all", and that claim was WRONG:
 * a repository-wide scan finds two readers, and naming them is the difference between a flagged
 * exposure and an undocumented one.
 *   - `src/handlers/brandHandler.ts` projects it into the JSON response body of the save, read and
 *     delete routes. This is the one boundary in scope that hands the value to a consumer, and it is
 *     annotated there with what the body does and does not guarantee. JSON encoding is not itself a
 *     sink — a control character would be escaped, and one can no longer be stored anyway — so what
 *     travels is a syntactically valid URL of an unconstrained scheme.
 *   - `src/domain/product/Product.ts` reads it to resolve the `brand.brandWebsite` SmartList property
 *     path, which is a filter and ordering key rather than an output position.
 * The Google feed is NOT a reader: it emits `getBrandName()` at
 * `integrationServices/google/views/feed/product.cfm:L32` and never the website.
 *
 * Closing the scheme exposure belongs to whoever owns the rendering surface, which is outside the AAP
 * scope — AAP §0.3.4 records that this deliverable is a headless service with no rendering layer of its
 * own — and to a schema-level or policy-level decision the operator makes, not to a silent narrowing
 * inside a ported format check.
 *
 * ⭐ WHAT IS UNCHANGED BY ANY OF THIS. One predicate, {@link isCfUrlAnyProtocol}, evaluated
 * unconditionally for every `dataType: 'url'` constraint, with no policy member anywhere. The message
 * key is unchanged too — it is composed from {@link DataTypeConstraint.constraintValue}, so
 * `validate.save.Brand.brandWebsite.dataType.url` is byte-identical to what
 * `org/Hibachi/HibachiValidationService.cfc:L226` composes, for a control-character refusal and a
 * userinfo refusal exactly as for a malformed-scheme refusal.
 * ============================================================================================ */

/**
 * The `numeric` arm of `dataType`. Six of the seven in-scope `dataType` rules are this one.
 */
export interface NumericDataTypeConstraint {
  readonly constraintType: 'dataType';
  readonly constraintValue: 'numeric';
}

/**
 * The `url` arm of `dataType`. Exactly one in-scope rule is this one, at
 * `model/validation/Brand.json:L4`.
 *
 * ⛔ IT CARRIES NO POLICY MEMBER, AND THAT IS THE WHOLE OF THE SEC-15 WITHDRAWAL AT THIS END. An
 * earlier revision required a `urlPolicy` here so that each declaration selected between a strict
 * web-address predicate and the legacy six-protocol approximation. There is one predicate now, so
 * there is nothing left to select — see THE SIX-PROTOCOL URL CHECK IS STILL THE WHOLE CHECK above.
 * The arm survives as a distinct interface only because `constraintValue` discriminates the union;
 * adding a member back here would reintroduce the choice this withdrawal removed.
 *
 * The two syntactic rules reinstated by SEC-HARDENING (D18-CLASS) deliberately did NOT come back as a
 * policy member. They are unconditional inside {@link isCfUrlAnyProtocol}, so every `url` declaration
 * gets them and no declaration can opt out — which is both simpler than a policy union and stricter
 * than one, since a policy member is a place a future declaration could silently choose the weaker arm.
 */
export interface UrlDataTypeConstraint {
  readonly constraintType: 'dataType';
  readonly constraintValue: 'url';
}

/**
 * Format checking, restricted to the two types the seven documents use, discriminated on
 * {@link DataTypeConstraintValue}.
 *
 * PASSES on an absent value (`org/Hibachi/HibachiValidationService.cfc:L259`), which is why the
 * money properties pair it with a presence rule when the value is mandatory — as
 * `model/validation/Sku.json:L9` does and `:L4` deliberately does not.
 *
 * The two arms differ only in `constraintValue`, and `constraintType: 'dataType'` is common to both,
 * so the dispatch in `evaluateConstraint` and the message-key composition are exactly what they were
 * before the arms were split apart. This paragraph previously belonged to a doc comment left orphaned
 * — attached to no declaration at all — when the withdrawn SEC-15 policy split was inserted between
 * it and this union; it is restored here.
 */
export type DataTypeConstraint = NumericDataTypeConstraint | UrlDataTypeConstraint;

/**
 * A numeric floor. All three in-scope rules declare zero, on the SKU money properties.
 *
 * PASSES on an absent value but FAILS on a non-null NON-NUMERIC one
 * (`org/Hibachi/HibachiValidationService.cfc:L271`), so it doubles as a numeric check for any value
 * that is actually present.
 */
export interface MinValueConstraint {
  readonly constraintType: 'minValue';
  readonly constraintValue: number;
}

/**
 * A trimmed-length ceiling. Exactly one in-scope rule, the system-code delete guard at
 * `model/validation/ProductType.json:L7`, which declares zero.
 *
 * PASSES on an absent value, on the empty string and on a whitespace-only string; FAILS on any
 * non-simple value (`org/Hibachi/HibachiValidationService.cfc:L295`). A ceiling of zero is therefore
 * a "must be blank" guard, not a no-op.
 */
export interface MaxLengthConstraint {
  readonly constraintType: 'maxLength';
  readonly constraintValue: number;
}

/**
 * A collection floor. Three in-scope rules, all declaring one, all on the unused-option collections
 * of `model/validation/Product.json:L13-L15`.
 *
 * THE ASYMMETRY THAT CATCHES PEOPLE: it PASSES on an absent value and FAILS on an EMPTY ARRAY
 * (`org/Hibachi/HibachiValidationService.cfc:L303`). A non-null simple value also fails, since it
 * is neither array nor struct.
 */
export interface MinCollectionConstraint {
  readonly constraintType: 'minCollection';
  readonly constraintValue: number;
}

/**
 * A collection ceiling — the delete-guard workhorse, at nine of the slice's rules, every one
 * declaring zero. It is how "this record still has dependants, so refuse to delete it" is
 * expressed for physical counts, products, child product types, options and SKUs.
 *
 * PASSES on an absent value; FAILS on a non-null SIMPLE value
 * (`org/Hibachi/HibachiValidationService.cfc:L311`).
 */
export interface MaxCollectionConstraint {
  readonly constraintType: 'maxCollection';
  readonly constraintValue: number;
}

/**
 * A pattern check. Three in-scope rules share one pattern, on the three code properties at
 * `model/validation/Product.json:L10`, `model/validation/Option.json:L3` and
 * `model/validation/OptionGroup.json:L4`.
 *
 * PASSES on an absent value (`org/Hibachi/HibachiValidationService.cfc:L483`).
 *
 * TRANSLATION DECISION: the pattern is applied AS AUTHORED, and anchoring is the pattern's own
 * business. The one in-scope pattern anchors both ends itself, so the CFML-versus-JavaScript
 * question of whether an unanchored pattern matches partially cannot arise for it. The pattern is
 * compiled fresh on each evaluation rather than being cached at module scope, per M7 — nothing in
 * this file may hold state between invocations on a warm container. The pattern text itself lives
 * in `src/validation/rules/**` and is not restated here.
 */
export interface RegexConstraint {
  readonly constraintType: 'regex';
  readonly constraintValue: string;
}

/**
 * Loose equality — the other delete-guard idiom, and the one whose comparison rules matter most.
 *
 * FAILS on an absent value (`org/Hibachi/HibachiValidationService.cfc:L391`). See LOOSE EQUALITY in
 * the module header, and {@link isCfLooseEqual} for the ladder.
 */
export interface EqualityConstraint {
  readonly constraintType: 'eq';
  readonly constraintValue: EqualityConstraintValue;
}

/**
 * Membership in a comma-delimited list, matched CASE-INSENSITIVELY.
 *
 * FAILS on an absent value (`org/Hibachi/HibachiValidationService.cfc:L461`). Two in-scope rules,
 * both gating a process context on the product's base type — merchandise for the two option
 * contexts at `model/validation/Product.json:L4`, subscription for the term context at `:L5`. The
 * second of those is the rule the traceable legacy regression `issue_1331` exercises through the
 * dry-run path described under requirement N1 below.
 *
 * The value keeps its legacy comma-delimited STRING form rather than becoming an array, so a rule
 * set transcribes its document literally and the case-insensitive comma semantics stay explicit
 * rather than being implied by a data-structure choice.
 */
export interface InListConstraint {
  readonly constraintType: 'inList';
  readonly constraintValue: string;
}

/**
 * A method-based rule: the subject decides for itself, and may query the database to do it.
 *
 * Two in-scope rules, both attached to the SKU option collection on the save context at
 * `model/validation/Sku.json:L5-L8`, and both therefore reporting under the key `options`.
 *
 * The constraint carries BOTH a name and a function, and neither is redundant:
 *   - `constraintValue` is the method NAME, and it is observable — the message shape at
 *     `org/Hibachi/HibachiValidationService.cfc:L222` embeds it, producing keys such as
 *     `validate.save.Sku.options.hasUniqueOptions`.
 *   - `invoke` is the bound domain method, per AAP 0.4.1.5 and AAP 0.7.3 S3. The name is NEVER used
 *     to find the function; that would be the string-keyed dispatch TR-3 retires.
 *
 * TODO(parity): the hint comment at `model/entity/Sku.cfc:L771` is a verbatim copy of the one at
 * `model/entity/Sku.cfc:L755` and therefore misdescribes `hasOneOptionPerOptionGroup` as checking
 * option-combination uniqueness, which is what its NEIGHBOUR checks. Recorded, not corrected: the
 * comment is legacy source text and no register entry is invented for it.
 */
export interface MethodConstraint<TSubject extends ValidationSubject> {
  readonly constraintType: 'method';
  readonly constraintValue: string;
  readonly invoke: MethodRuleInvocation<TSubject>;
}

/**
 * The eleven constraint kinds, as a discriminated union over `constraintType`.
 *
 * Closed at eleven. Adding a twelfth means finding a twelfth key in the seven documents, and there
 * is none — see THE THIRTEEN KEYS in the module header, where the other two of the thirteen are the
 * selection keys modelled on {@link ValidationRule} rather than as constraints.
 *
 * The discriminant makes the evaluator's switch exhaustive, so a kind that is declared here but not
 * evaluated is a compile error rather than a silently ignored rule.
 */
export type Constraint<TSubject extends ValidationSubject> =
  | RequiredConstraint
  | UniqueConstraint<TSubject>
  | DataTypeConstraint
  | MinValueConstraint
  | MaxLengthConstraint
  | MinCollectionConstraint
  | MaxCollectionConstraint
  | RegexConstraint
  | EqualityConstraint
  | InListConstraint
  | MethodConstraint<TSubject>;

/* ==============================================================================================
 * SECTION 3 — RULES, CONDITIONS AND RULE SETS
 *
 * The two SELECTION keys of the thirteen live here, on the rule rather than on the constraint,
 * because that is where the legacy documents put them and where the legacy engine reads them
 * (`org/Hibachi/HibachiValidationService.cfc:L71` for one, `:L83-L85` for the other). They are
 * separate fields with separate semantics and are never collapsed into a single notion of
 * applicability.
 * ============================================================================================ */

/**
 * One rule of a property: an optional context gate, an optional condition gate, and the constraints
 * the rule imposes when both gates pass.
 *
 * THE CONSTRAINT ARRAY IS THE FLATTENING. `org/Hibachi/HibachiValidationService.cfc:L77-L88`
 * explodes a legacy rule object into one constraint record per key; here that explosion is the data
 * shape, so the rule at `model/validation/Product.json:L10` transcribes to three entries in this
 * array and can report three independent errors against `productCode`. Expressing it structurally
 * rather than deriving it at evaluation time also FIXES THE EVALUATION ORDER, which the legacy
 * engine could not: it iterated a CFML struct, whose key order is unspecified. Constraints here are
 * evaluated in DECLARATION ORDER, top to bottom, and rules in declaration order within a property,
 * and properties in declaration order within a rule set. That determinism is a deliberate
 * improvement on an unspecified order, not a behavior change — no legacy behavior depended on an
 * order the engine never guaranteed — and it makes the accumulated message array reproducible,
 * which is what lets a test assert on it at all.
 */
export interface ValidationRule<TSubject extends ValidationSubject> {
  /**
   * The comma-delimited context list this rule applies to, matched case-insensitively.
   *
   * OMITTING THIS FIELD MEANS THE RULE APPLIES IN EVERY CONTEXT. That is the first half of
   * `org/Hibachi/HibachiValidationService.cfc:L71`, and it is not a convenience: it is what makes
   * both rules of `model/validation/Product_UpdateSkus.json` fire, since neither declares a context.
   *
   * The legacy comma-delimited string form is kept rather than becoming an array, for the same
   * reason it is kept on {@link InListConstraint}: a rule set should transcribe its document
   * literally, and the two-context value at `model/validation/Product.json:L4` is a single string in
   * the source. Elements are not trimmed — see {@link cfListToArray}.
   */
  readonly contexts?: string;

  /**
   * The comma-delimited list of CONDITION NAMES that gate this rule, resolved against the rule set's
   * own conditions.
   *
   * Only `model/validation/Product_UpdateSkus.json` uses this, and it uses it INSTEAD of a context
   * list rather than alongside one. The two gates remain independent: a rule may declare either,
   * both or neither, and when both are declared both must pass, because the legacy engine checks the
   * context first (`org/Hibachi/HibachiValidationService.cfc:L71`) and the conditions second
   * (`:L178-L183`).
   *
   * Names are resolved case-insensitively, matching CFML struct-key semantics at
   * `org/Hibachi/HibachiValidationService.cfc:L108`. An unresolvable name is skipped, and if it was
   * the only name the gate fails and the rule does not run.
   */
  readonly conditions?: string;

  readonly constraints: readonly Constraint<TSubject>[];
}

/**
 * One constraint inside a named condition: which property to read, how to read it, and what to
 * require of it.
 *
 * A condition is a predicate over the subject's own current state — "is the update-price flag
 * set?" — so it needs the same property-and-reader pairing a validated property needs, and it
 * reuses the same {@link Constraint} union. That reuse is faithful rather than convenient: the
 * legacy engine evaluates conditions through THE SAME `validate_*` family it uses for rules
 * (`org/Hibachi/HibachiValidationService.cfc:L117`), so a condition can in principle hold any
 * constraint kind. In the seven documents every condition holds exactly one equality check.
 */
export interface ConditionConstraint<TSubject extends ValidationSubject> {
  readonly propertyIdentifier: string;

  readonly read: PropertyValueReader<TSubject>;

  readonly constraint: Constraint<TSubject>;
}

/**
 * A named condition: all of its constraints must hold for the condition to be met.
 *
 * AND WITHIN, OR ACROSS. Every constraint of one condition must pass
 * (`org/Hibachi/HibachiValidationService.cfc:L110-L121`); a rule's condition list passes as soon as
 * ANY ONE of its named conditions is met (`:L124-L126`).
 *
 * The two in-scope conditions are declared at `model/validation/Product_UpdateSkus.json:L3-L8`: one
 * gating the price rule on the update-price flag, one gating the list-price rule on the
 * update-list-price flag.
 */
export interface ValidationCondition<TSubject extends ValidationSubject> {
  readonly name: string;

  readonly constraints: readonly ConditionConstraint<TSubject>[];
}

/**
 * All the rules for one property: the identifier failures are reported under, how to read the
 * value, and the rules themselves.
 *
 * The identifier is the FULL property identifier and it is what every reported error is keyed by —
 * see THE ERROR BAG in the module header. The trailing-segment form used in the message is derived
 * from it (`org/Hibachi/HibachiValidationService.cfc:L208`) and never replaces it.
 */
export interface PropertyValidation<TSubject extends ValidationSubject> {
  /**
   * The property identifier, exactly as the legacy document keys it — `productCode`, `options`,
   * `physicalCounts`, `baseProductType` and so on. This is the error key.
   */
  readonly propertyIdentifier: string;

  readonly read: PropertyValueReader<TSubject>;

  readonly rules: readonly ValidationRule<TSubject>[];
}

/**
 * One transliterated validation document: the typed replacement for a `model/validation/*.json`
 * file.
 *
 * Seven of these exist, one per in-scope document, and they live in `src/validation/rules/` — not
 * here. This engine never loads one; it is handed one. That separation is what AAP 0.3.3 describes
 * as "`src/validation/rules/*.rules.ts` evaluated by `Validator.ts`".
 *
 * The document's own top-level structure is preserved: a `properties` container plus, for the one
 * document that has it, a `conditions` block.
 */
export interface ValidationRuleSet<TSubject extends ValidationSubject> {
  readonly properties: readonly PropertyValidation<TSubject>[];

  /**
   * The document's named conditions, if it declares any.
   *
   * Omitted by six of the seven documents. Present only in
   * `model/validation/Product_UpdateSkus.json`, whose block is declared at its lines 2-9. A rule
   * that names a condition when this is omitted has an unresolvable name, so its gate fails and it
   * does not run — which is the legacy behavior at `org/Hibachi/HibachiValidationService.cfc:L108`,
   * where the guard tests for the block's presence before looking a name up inside it.
   */
  readonly conditions?: readonly ValidationCondition<TSubject>[];
}

/**
 * How to run one validation pass.
 *
 * ONE FIELD, AND IT IS THE DRY-RUN SWITCH — requirement N1. The legacy engine's third parameter
 * (`org/Hibachi/HibachiValidationService.cfc:L153`) chose between the subject's OWN error bag
 * (`:L156`) and a throwaway one (`:L158`). Here the choice is made by supplying a bag or not:
 *
 *   - SUPPLY a bag and failures accumulate into it, so a caller holding that bag observes them.
 *     This is the equivalent of the mutating mode, and it is what the save, delete and process flows
 *     use.
 *   - OMIT it and a fresh bag is created, returned, and referenced by nothing else. Nothing the
 *     caller holds is touched. This is the equivalent of the non-mutating mode, and it is what the
 *     deletability, editability and processability checks at `org/Hibachi/HibachiEntity.cfc:L205`,
 *     `:L215` and `:L225` need.
 *
 * Modelling the mode as "which bag" rather than as a boolean is what keeps this engine free of any
 * dependency on the subject's own error accessors, and therefore free of any dependency on
 * `src/domain/`. It is also exactly how the two legacy branches differed: both then handed the bag
 * back, and the mutating branch's write-back at
 * `org/Hibachi/HibachiValidationService.cfc:L192-L194` re-assigned the very reference it had read at
 * `:L156` — a no-op once the bag is a reference-typed object, which is why no write-back step
 * appears here.
 */
/**
 * The nine validation contexts this slice can select — a CLOSED union, per requirement N2 as
 * amended by DECISION V-1 below.
 *
 * Every member is an OBSERVED context with a locator, and there are no others. Five are declared in
 * a `contexts` key of an in-scope document; four are runtime-only and appear in no document:
 *
 *   | member                | where it comes from                                                |
 *   |-----------------------|--------------------------------------------------------------------|
 *   | `''`                  | the engine's own default, `org/Hibachi/HibachiValidationService.cfc:L153`, and again at `org/Hibachi/HibachiTransient.cfc:L408` |
 *   | `'save'`              | declared — all seven documents except `Product_UpdateSkus.json`     |
 *   | `'delete'`            | declared, and hard-coded at `org/Hibachi/HibachiEntity.cfc:L205`    |
 *   | `'edit'`              | hard-coded at `org/Hibachi/HibachiEntity.cfc:L215`                  |
 *   | `'process'`           | the default of `isProcessable`, `org/Hibachi/HibachiEntity.cfc:L224` |
 *   | `'addOptionGroup'`    | declared — `model/validation/Product.json`                          |
 *   | `'addOption'`         | declared — `model/validation/Product.json`                          |
 *   | `'addSubscriptionTerm'` | declared — `model/validation/Product.json`                         |
 *   | `'updateSkus'`        | the round-trip at `org/Hibachi/HibachiService.cfc:L114` landing on `model/service/ProductService.cfc:L216` |
 *
 * The five declared members were re-measured rather than recalled: every `contexts` value across
 * `model/validation/{Product,Sku,Brand,Option,OptionGroup,ProductType,Product_UpdateSkus}.json`
 * reduces to exactly `save`, `delete`, `addOptionGroup`, `addOption` and `addSubscriptionTerm` —
 * `Product.json` alone carries the last three, and `Product_UpdateSkus.json` declares no `contexts`
 * key at all, which is why its two rules fire under every member above.
 *
 * =============================================================================================
 * ⭐ DECISION V-1 — WHY THIS IS CLOSED, WHERE IT WAS PREVIOUSLY OPEN
 * =============================================================================================
 * This type replaced a plain `string` parameter. The original reasoning is preserved here because
 * it was sound as far as it went, and because the amendment turns on a fact it did not account for.
 *
 * THE ORIGINAL REASONING was that a closed FIVE-member union of the declared contexts would make
 * the editability and processability checks at `org/Hibachi/HibachiEntity.cfc:L215` and `:L225`
 * unrepresentable, since `edit` and `process` are declared in no document. That is correct, and it
 * is why this union has NINE members rather than five: the four runtime-only contexts are first
 * class here, so both capability checks remain expressible and the traceable `issue_1331`
 * regression — `Product.isProcessable('addOptionGroup')` — still translates literally.
 *
 * WHAT THE ORIGINAL REASONING MISSED is that an open `string` also admits the three values that
 * SWITCH VALIDATION OFF. `org/Hibachi/HibachiValidationService.cfc:L162` reads
 * `if(!isBoolean(arguments.context) || arguments.context)`, so a context of `'false'`, `'no'` or
 * `'0'` — in any case, and the number `0` too — skips every rule and returns an EMPTY bag: no
 * required check, no uniqueness check, no format check, no method rule and no delete guard. On an
 * open string that value is indistinguishable from a legitimate context, so any layer that ever
 * forwards a caller-supplied context reaches a total validation bypass. Closing the union makes all
 * three TYPE-ILLEGAL at this boundary.
 *
 * CLOSING THE UNION IS ONLY HALF THE FIX, and the amendment above previously claimed it was the whole
 * of it. A union is erased at runtime, so it binds the callers the compiler checks and binds nothing
 * on the paths where a value arrives unchecked — a parsed request body, an `as ValidationContext`
 * assertion, or a JavaScript consumer of the emitted bundle. The other half is the runtime membership
 * guard: see {@link VALIDATION_CONTEXTS} for the enforcement, the licensing argument on the D18
 * precedent, and why the response is a refusal rather than a substitution.
 *
 * THE LEGACY GATE ITSELF IS NOT REMOVED — see {@link legacyContextDisablesValidation}, which still
 * reproduces `:L162` and is still consulted on every call. What changed is only which values can
 * reach it, and AAP 0.6.7 governs that distinction: the behaviour is preserved and annotated, not
 * repaired.
 *
 * THE BYPASS IS UNREACHABLE IN THE LEGACY TOO, which is the fact that makes closing the union a
 * faithful port rather than a behavioural change. Every `context=` argument passed to `validate()`
 * anywhere in the legacy tree was enumerated: `"save"` (6), `"delete"` (5), `""` (4),
 * `arguments.context` (3), `arguments.processContext` (2), `'save'` (2), `"edit"` (2),
 * `attributes.processContext` (1), `arguments.task.getTaskMethod()` (1) and `'placeOrder'` (1).
 * NOT ONE call site passes a boolean-castable-false literal, and a repository-wide search for one
 * returns nothing. The gate at `:L162` is therefore dead code in the legacy application, and this
 * union makes it dead code here too — by construction rather than by coincidence.
 *
 * The last two of those legacy values are out of scope and deliberately absent from this union:
 * `'placeOrder'` is an order context and `model/**\/Order*.cfc` is excluded by AAP 0.2.2.1, and
 * `arguments.task.getTaskMethod()` is a scheduled-task context from the same excluded surface.
 * Adding either would be inventing a context this slice cannot reach (AAP 0.7.3 S9).
 *
 * NOT NARROWED, deliberately: {@link ValidationRule.contexts}. That member is a CFML LIST — a
 * comma-delimited string such as `"addOptionGroup,addOption"` at `model/validation/Product.json` —
 * so no single-member union can type it. It is also not caller data: every rule set in this subtree
 * is a frozen compile-time literal under `src/validation/rules/`, so its value is fixed at build
 * time and no request can influence it. The security property this union establishes therefore does
 * not depend on narrowing it.
 */
export type ValidationContext =
  | ''
  | 'save'
  | 'delete'
  | 'edit'
  | 'process'
  | 'addOptionGroup'
  | 'addOption'
  | 'addSubscriptionTerm'
  | 'updateSkus';

/**
 * The nine members of {@link ValidationContext} as a RUNTIME inventory — the enforcement half of
 * DECISION V-1.
 *
 * =============================================================================================
 * ⭐ SEC-HARDENING (D18-CLASS) — WHY A RUNTIME LIST EXISTS ALONGSIDE THE TYPE
 * =============================================================================================
 * DECISION V-1 above closes {@link ValidationContext} to nine members and argues, correctly, that
 * this makes the `:L162` validation bypass TYPE-ILLEGAL at the one public entry point. What it did
 * not account for is that a TypeScript union is ERASED AT RUNTIME: it constrains callers the
 * compiler checks, and constrains nothing at all where a value crosses into the engine without
 * having been checked. Three such crossings exist in this deliverable's own layering and none of
 * them is hypothetical:
 *
 *   - a handler that reads a context off `JSON.parse` of a request body, whose static type is
 *     `unknown` or `any` until something narrows it;
 *   - any `as ValidationContext` assertion, which the compiler accepts without a check — the
 *     accompanying suite performs exactly this cast, and it is how the bypass was demonstrated;
 *   - a JavaScript consumer of the emitted bundle, for which no type existed in the first place.
 *
 * On any of those paths a context of `'false'`, `'no'`, `'0'` or the number `0` reaches
 * {@link legacyContextDisablesValidation}, casts to false, and returns an EMPTY error bag: no
 * required check, no uniqueness check, no format check, no method rule and no delete guard. The
 * caller then reads `hasErrors()` as false and persists. That is a total validation bypass reached
 * by supplying one string, and closing the union does not stop it — it only stops the compiler from
 * writing it down.
 *
 * WHY REINSTATING THE GUARD IS LICENSED, on the D18 precedent (AAP 0.6.7.7). D18 is this
 * deliverable's declared test for a change that hardens without altering behaviour: the SQL
 * parameterisation of the importer returns the same rows for every input the legacy was designed to
 * accept, and diverges only for inputs that attack the legacy's own composition mechanism. The
 * membership guard has exactly that property, and the proof is already in DECISION V-1: every
 * `context=` argument passed to `validate()` anywhere in the legacy tree was enumerated, and NOT ONE
 * is boolean-castable-false. Every value the legacy application actually passes is a member of this
 * inventory, so the guard changes NO outcome for any legacy input. It diverges only for the three
 * values that switch the engine off — the values that attack the context mechanism itself.
 *
 * WHY IT IS A REFUSAL AND NOT A NORMALISATION. An unrecognised context is not silently mapped to
 * `'save'`, to `''`, or to anything else. Mapping would run a DIFFERENT rule set from the one the
 * caller named, which is a behavioural invention (AAP 0.7.3 S9), and it would also make the bypass
 * attempt indistinguishable from a legitimate call. Refusing is the same policy the sibling
 * materialisation gate in `../adapters/mysql/SmartListQueryBuilder.ts` states as "REFUSE, NEVER
 * TRUNCATE", and the same policy the two constraint raises in SECTION 4 already follow.
 *
 * WHAT IS NOT DONE. The legacy gate at `:L162` is NOT deleted — see
 * {@link legacyContextDisablesValidation}, which still transcribes it and is still consulted on
 * every call. AAP 0.6.7 governs that distinction: the legacy behaviour is preserved and annotated,
 * not repaired. What the guard changes is only which values can REACH it, which is what turns
 * "unreachable by type" into "unreachable in fact".
 *
 * MODULE-SCOPE CONSTANT, NOT STATE. This is a frozen list of nine string literals and the
 * {@link VALIDATION_CONTEXT_MEMBERS} lookup built from it once. Neither is ever written to after
 * module initialisation, so neither can bleed between invocations on a warm container and M7 is
 * unaffected — the statelessness requirement on the engine concerns the Validator INSTANCE, which
 * still holds exactly one readonly field.
 *
 * Exported so a caller that must narrow an untrusted value can do so through
 * {@link isValidationContext} rather than by asserting, and so the accompanying suite can assert the
 * inventory against the union directly rather than restating it.
 */
export const VALIDATION_CONTEXTS = [
  '',
  'save',
  'delete',
  'edit',
  'process',
  'addOptionGroup',
  'addOption',
  'addSubscriptionTerm',
  'updateSkus',
] as const satisfies readonly ValidationContext[];

/**
 * Proves at COMPILE TIME that {@link VALIDATION_CONTEXTS} covers every member of
 * {@link ValidationContext}.
 *
 * The `satisfies` clause above already proves the inclusion in one direction — no entry of the list
 * can be a non-member. This alias proves the other: `Exclude` is `never` only when the union is
 * fully covered, and `never` is the only type the parameter accepts. Add a tenth member to the union
 * without adding it here and this line fails to compile, so the runtime guard cannot silently fall
 * behind the type it enforces. That is the whole purpose; the alias is never used as a value.
 */
export type ValidationContextCoverage<
  TUncovered extends never = Exclude<ValidationContext, (typeof VALIDATION_CONTEXTS)[number]>,
> = TUncovered;

/**
 * The membership lookup, built once from {@link VALIDATION_CONTEXTS} and keyed CASE-INSENSITIVELY.
 *
 * Typed as `ReadonlySet<string>` rather than `ReadonlySet<ValidationContext>` deliberately: the
 * whole point is to test a value whose type is NOT yet known to be a member, and a set keyed by the
 * union would require the very narrowing this lookup performs.
 */
const VALIDATION_CONTEXT_MEMBERS: ReadonlySet<string> = new Set<string>(
  VALIDATION_CONTEXTS.map((context) => context.toLowerCase()),
);

/**
 * Whether an arbitrary value NAMES one of the nine {@link ValidationContext} members.
 *
 * A type predicate rather than a boolean, so a caller holding an untrusted value narrows it by
 * TESTING instead of by asserting.
 *
 * WHOLE-VALUE MATCH, CASE-INSENSITIVE — and each half of that is a deliberate decision measured
 * against the legacy engine rather than chosen for strictness:
 *
 *   - CASE-INSENSITIVE, because the legacy engine's own context comparison is. `:L71` selects with
 *     `listFindNoCase(rule.contexts, arguments.context)` and `:L162` casts with `isBoolean`, both of
 *     which ignore case, so `ADDOPTIONGROUP` is a context the legacy accepts and acts on exactly as
 *     it acts on `addOptionGroup`. A case-SENSITIVE guard would refuse a value the legacy honours,
 *     which is a behavioural change (AAP 0.8.2 g2) and would fail the D18 test this hardening is
 *     licensed under. The accompanying suite pins both case variants directly.
 *   - WHOLE-VALUE, because `listFindNoCase` is an ELEMENT search and not a substring search, so
 *     `addOptionGrou` and `ption` select nothing in the legacy and name no context here either.
 *
 * NO TRIMMING AND NO ALIASING. Whitespace is not stripped and no near-miss is mapped to a member:
 * both would be normalisations of caller input that the legacy does not perform, and a normalisation
 * would run a rule set the caller did not name.
 *
 * THE NARROWING IS DELIBERATELY WIDE, and this is the one soundness trade-off in this predicate: a
 * value differing from a member only in case narrows to the canonical union while remaining, as a
 * string, something else. That is safe here because every consumer of a narrowed
 * {@link ValidationContext} in this subtree treats it case-insensitively or verbatim, and never as a
 * literal to compare case-sensitively — {@link ruleAppliesToContext} compares through
 * `cfListContainsNoCase`, {@link legacyContextDisablesValidation} casts through
 * {@link toCfBoolean}, and {@link buildValidationMessage} interpolates it UNCHANGED so the composed
 * key keeps the caller's casing exactly as `:L224` does. Case-folding the value instead would have
 * been the unsound choice: it would silently rewrite the emitted message key.
 *
 * THE SECURITY PROPERTY IS UNAFFECTED BY THE CASE INSENSITIVITY. {@link toCfBoolean} returns false
 * only for `false` and `no` in any case and for numeric zero; no member of
 * {@link VALIDATION_CONTEXTS} equals either word in ANY casing, and none is numeric. So every value
 * this predicate admits still fails the `:L162` gate, and every value that would pass that gate is
 * still refused.
 *
 * Note that `''` is a MEMBER and returns true: an empty context is the engine's own default
 * (`org/Hibachi/HibachiValidationService.cfc:L153`) and validates normally.
 *
 * @param value any value, from any boundary, of any type
 * @returns true when the value is a string naming one of the nine members, ignoring case
 */
export function isValidationContext(value: unknown): value is ValidationContext {
  return typeof value === 'string' && VALIDATION_CONTEXT_MEMBERS.has(value.toLowerCase());
}

export interface ValidateOptions {
  /**
   * The bag to accumulate into. Omit for a dry run.
   *
   * A supplied bag is appended to, never cleared: a caller may hand in a bag that already carries
   * failures from an earlier step and they survive, which is what makes the process gate below
   * behave like the legacy entity's own error check.
   */
  readonly errors?: ValidationError;
}

/**
 * The process object half of a two-object process validation. See {@link ProcessValidationRequest}.
 */
export interface ProcessObjectValidationTarget<TProcessObject extends ValidationSubject> {
  readonly subject: TProcessObject;

  /** Its transliterated rule set, for example the one for `model/validation/Product_UpdateSkus.json`. */
  readonly ruleSet: ValidationRuleSet<TProcessObject>;

  readonly errors?: ValidationError;
}

/**
 * The inputs of the two-object, single-context process flow — requirement N3.
 *
 * This mirrors `org/Hibachi/HibachiService.cfc:L84-L130`, whose ordering is the behavior:
 *   1. `:L96` validates THE ENTITY under the process context.
 *   2. `:L99` gates on the entity having no errors, AND on a process object existing for that
 *      context at all.
 *   3. `:L108` validates THE PROCESS OBJECT under THE SAME context string.
 * The process method itself is only reached afterwards, at `:L113-L115`, and this engine never goes
 * there: the universal legacy shape is validate, then check, then persist, and `Validator` owns only
 * the first step. It never persists and never invokes a process method.
 *
 * The presence of {@link processObject} plays the role of the existence test at `:L99`: omit it and
 * the second pass cannot run, exactly as the legacy gate would prevent.
 */
export interface ProcessValidationRequest<
  TEntity extends ValidationSubject,
  TProcessObject extends ValidationSubject,
> {
  readonly entity: TEntity;

  readonly entityRuleSet: ValidationRuleSet<TEntity>;

  /**
   * The single context string used for BOTH passes.
   *
   * One string, not two. `org/Hibachi/HibachiService.cfc:L96` and `:L108` pass the same value, and
   * splitting it into two parameters would let a caller do something the legacy flow cannot.
   * Observed values here are the three process contexts that round-trip through the method-name
   * composition at `org/Hibachi/HibachiService.cfc:L114` — see CONTEXT IS A CLOSED NINE-MEMBER UNION
   * in the module header, which this cross-reference previously named by its superseded title.
   *
   * Not separately guarded here: {@link Validator.validateProcess} forwards this value straight into
   * {@link Validator.validate} as its first action, so the membership refusal described at
   * {@link VALIDATION_CONTEXTS} fires before either pass runs and before either supplied bag is read.
   */
  readonly processContext: ValidationContext;

  readonly entityErrors?: ValidationError;

  readonly processObject?: ProcessObjectValidationTarget<TProcessObject>;
}

/**
 * The outcome of a two-object process validation.
 *
 * Both bags are always present so a caller never has to narrow one away; {@link processObjectRan}
 * is what distinguishes "validated and clean" from "never validated".
 */
export interface ProcessValidationResult {
  readonly entityErrors: ValidationError;

  /**
   * The process object's bag.
   *
   * When the gate blocked the second pass, or when no process object was supplied, this is the
   * supplied process-object bag left exactly as it was, or an empty throwaway when none was
   * supplied. It is never fabricated with content.
   */
  readonly processObjectErrors: ValidationError;

  /**
   * Whether the process object was actually validated.
   *
   * False when no process object was supplied, or when the entity carried errors and the gate at
   * `org/Hibachi/HibachiService.cfc:L99` therefore blocked the second pass.
   */
  readonly processObjectRan: boolean;
}

/* ==============================================================================================
 * SECTION 4 — MESSAGE CONSTRUCTION
 *
 * This file is the GENERATOR of the reported message keys. The sibling `../errors/ValidationError`
 * stores them and documents their shape, and says so explicitly: composing them is this file's job.
 * ============================================================================================ */

/**
 * Composes the resource-bundle key a failed constraint is reported with.
 *
 * THREE SHAPES, from `validateConstraint`, and the branch is chosen by the constraint's kind:
 *
 *   method     `org/Hibachi/HibachiValidationService.cfc:L222`
 *              validate.{context}.{className}.{propertyName}.{constraintValue}
 *              for example validate.save.Sku.options.hasUniqueOptions
 *                      and validate.save.Sku.options.hasOneOptionPerOptionGroup
 *
 *   dataType   `org/Hibachi/HibachiValidationService.cfc:L226`
 *              validate.{context}.{className}.{propertyName}.dataType.{constraintValue}
 *              for example validate.save.Sku.price.dataType.numeric
 *                      and validate.save.Brand.brandWebsite.dataType.url
 *
 *   all others `org/Hibachi/HibachiValidationService.cfc:L230`
 *              validate.{context}.{className}.{propertyName}.{constraintType}
 *              for example validate.save.Product.productCode.required
 *                      and validate.save.Product.productCode.unique
 *                      and validate.save.Product.productCode.regex
 *                      and validate.delete.ProductType.systemCode.maxLength
 *                      and validate.addOptionGroup.Product.baseProductType.inList
 *
 * Note what those examples show about the first two shapes: `method` embeds the constraint's VALUE
 * where the third shape embeds its TYPE, and `dataType` embeds BOTH. That is why the three cannot be
 * folded into one template with a conditional segment.
 *
 * The property segment is the TRAILING segment of the identifier
 * (`org/Hibachi/HibachiValidationService.cfc:L208`), split on both the dot and the underscore. For
 * every identifier in all seven documents that is the whole identifier. It is used here and nowhere
 * else; the error KEY is always the full identifier.
 *
 * The substitution pass that followed each of the three lines above is deliberately NOT run — see
 * DECISION D-1 in the module header for the three reasons, one of which is that the pass is a
 * provable no-op against these shapes. The emitted key is therefore a raw, unresolved key, and it is
 * returned exactly as composed: never translated, sentence-cased, trimmed, re-cased or otherwise
 * beautified.
 *
 * Exported because the accompanying test suite asserts the three shapes directly, which is a
 * stronger check than inferring them from an accumulated bag.
 *
 * @param context the validation context, used verbatim as the second segment
 * @param className the subject's class name, from {@link ValidationSubject.getClassName}
 * @param propertyIdentifier the FULL property identifier; the trailing segment is derived here
 * @param constraint the failed constraint, whose kind selects the shape
 * @returns the composed resource-bundle key
 */
export function buildValidationMessage<TSubject extends ValidationSubject>(
  context: ValidationContext,
  className: string,
  propertyIdentifier: string,
  constraint: Constraint<TSubject>,
): string {
  const propertyName = cfLastSegment(propertyIdentifier);
  const prefix = `validate.${context}.${className}.${propertyName}`;

  if (constraint.constraintType === 'method') {
    return `${prefix}.${constraint.constraintValue}`;
  }
  if (constraint.constraintType === 'dataType') {
    return `${prefix}.dataType.${constraint.constraintValue}`;
  }
  return `${prefix}.${constraint.constraintType}`;
}

/**
 * Renders an unknown value as a diagnostic token, or a neutral placeholder when it is not a usable
 * string.
 *
 * Total over any input by construction. Diagnosing a malformed rule set must never itself raise a
 * different error and mask the real one.
 */
function describeToken(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'unrecognised';
}

/**
 * Describes an unrecognised constraint for the raise below, without reading a typed member off a
 * value the type system has already ruled out.
 *
 * Reached only when a rule set is built outside the type system — from an untyped fixture, say, or
 * across a boundary where the declarations were not applied.
 */
function describeConstraintType(constraint: unknown): string {
  if (typeof constraint === 'object' && constraint !== null && 'constraintType' in constraint) {
    const { constraintType } = constraint;
    return describeToken(constraintType);
  }
  return 'unrecognised';
}

/**
 * The outcome of evaluating one constraint.
 *
 * THREE STATES, NOT TWO, and the third is what makes the two selection paths differ correctly.
 * `org/Hibachi/HibachiValidationService.cfc` treats an unrecognised constraint kind differently
 * depending on where it is found:
 *   - in the main path it RAISES (`:L201-L203`);
 *   - inside a conditions block it is SILENTLY IGNORED, because `:L117` tests for the evaluator's
 *     existence FIRST and the conjunction short-circuits before anything runs.
 *
 * Modelling that third state explicitly reproduces both behaviours from ONE enumeration of the
 * eleven kinds, and it does so without a raise-and-catch. That distinction matters for fidelity as
 * well as for cleanliness: catching a raise would ALSO have swallowed the two raises that must
 * propagate from inside a conditions block — the `dataType` whitelist raise at `:L263` and a method
 * result that cannot be read as a verdict — because the legacy engine's existence test does not
 * shield a raise thrown by an evaluator that does exist.
 */
type ConstraintVerdict = 'pass' | 'fail' | 'unevaluable';

/** Lifts a legacy `validate_*` boolean into a {@link ConstraintVerdict}. */
function verdictOf(passed: boolean): ConstraintVerdict {
  return passed ? 'pass' : 'fail';
}

/**
 * Raised for a constraint kind this engine does not evaluate.
 *
 * The legacy engine raises in exactly this situation, at
 * `org/Hibachi/HibachiValidationService.cfc:L201-L203`, and it raises again for a `dataType` value
 * outside its whitelist at `:L263`. Raising is the behavior, so raising is preserved.
 *
 * THE LEGACY WORDING IS NOT REPRODUCED. Those two strings are framework text, and the closed
 * inventory of legacy literals this deliverable reproduces belongs to `src/errors/` — which is why
 * the message below is the port's own neutral text, and why only the locators are cited. The three
 * facts the legacy message carried are all still reported: the subject's class, the property, and
 * the offending constraint kind.
 *
 * The built-in type error is used rather than a new error class, for two reasons. It is the accurate
 * classification — an unevaluable constraint is a malformed input, not a validation failure, and it
 * must not be mistaken for one by a caller catching validation errors. And `src/errors/` is a closed
 * folder of two files and three classes (AAP 0.4.1.11), so this file may not add a fourth there and
 * declaring an error class outside that folder would breach the layering of AAP 0.7.3 S4.
 */
function unevaluableConstraint(
  className: string,
  propertyIdentifier: string,
  constraint: unknown,
): TypeError {
  return new TypeError(
    `Rule set for ${className} declares a constraint on '${propertyIdentifier}' of kind ` +
      `'${describeConstraintType(constraint)}', which this validator does not evaluate.`,
  );
}

/**
 * Raised for a `dataType` value outside the two this engine evaluates.
 *
 * The counterpart of the whitelist raise at `org/Hibachi/HibachiValidationService.cfc:L263`, and
 * reachable only from a rule set built outside the type system — {@link DataTypeConstraintValue}
 * makes any other value a compile error. Unlike an unrecognised constraint KIND, this raise
 * propagates from a conditions block as well as from the main path, because the legacy existence
 * test at `:L117` finds the `dataType` evaluator perfectly well and then that evaluator raises.
 */
function unevaluableDataType(className: string, dataType: unknown): TypeError {
  return new TypeError(
    `Rule set for ${className} declares a dataType constraint of '${describeToken(dataType)}', ` +
      `which this validator does not evaluate.`,
  );
}

/**
 * Raised when a method-based rule resolves to something that cannot be read as a pass-or-fail
 * verdict.
 *
 * The legacy engine declares `validate_method` as returning a boolean while the two rules it calls
 * are declared as returning the widest type
 * (`org/Hibachi/HibachiValidationService.cfc:L333-L335`, `model/entity/Sku.cfc:L756` and `:L772`),
 * so the engine relies on the CFML runtime to cast the result and FAILS LOUDLY when it cannot. That
 * loudness is the behavior worth keeping: silently treating an uncastable result as a failure would
 * reject valid records, and silently treating it as a pass would admit invalid ones. Both are the
 * silent drift this file exists to prevent.
 */
function uncoercibleMethodResult(className: string, methodName: string): TypeError {
  return new TypeError(
    `Method rule '${methodName}' on ${className} resolved to a value that cannot be read as a ` +
      `boolean verdict.`,
  );
}

/**
 * Renders a REJECTED context for the raise below without echoing caller data verbatim.
 *
 * The other three factories in this section interpolate build-time literals — a class name, a
 * property identifier from a frozen rule set, a constraint kind — so echoing them is safe. A rejected
 * context is the opposite: it is precisely the value a caller supplied and this engine refused, so it
 * is the one string in this file that may be attacker-controlled. Interpolating it raw would push a
 * newline, an ANSI escape or a megabyte of text into whatever consumes the message, which is CWE-117
 * log injection in the same shape `../adapters/mysql/UnitOfWork.ts` already defends against when it
 * neutralises an abandoned failure.
 *
 * The treatment is therefore: report the TYPE for a non-string, and for a string keep only printable
 * ASCII, replace everything else with a single question mark, and cap the result. Enough to diagnose
 * a genuine caller mistake, not enough to carry a payload.
 */
function describeRejectedContext(context: unknown): string {
  if (typeof context !== 'string') {
    return `<${typeof context}>`;
  }
  const printable = Array.from(context.slice(0, REJECTED_CONTEXT_ECHO_LIMIT), (character) =>
    character >= ' ' && character <= '~' ? character : '?',
  ).join('');
  return context.length > REJECTED_CONTEXT_ECHO_LIMIT ? `${printable}…` : printable;
}

/** How many characters of a rejected context the raise echoes. Diagnostic, not a transport. */
const REJECTED_CONTEXT_ECHO_LIMIT = 40;

/**
 * Raised when a context reaches {@link Validator.validate} that is not one of the nine members of
 * {@link ValidationContext}.
 *
 * The enforcement half of DECISION V-1's SEC-HARDENING block; see {@link VALIDATION_CONTEXTS} for
 * why the guard exists, why refusing is the only sound response, and why it is licensed on the D18
 * precedent.
 *
 * `TypeError` for the same two reasons {@link unevaluableConstraint} gives: an unrecognised context
 * is a malformed input rather than a validation failure and must not be caught by a caller handling
 * validation failures, and `src/errors/` is a closed folder of two files that this file may not add
 * to (AAP 0.4.1.11, AAP 0.7.3 S4).
 */
function unrecognisedValidationContext(context: unknown): TypeError {
  return new TypeError(
    `Validation was requested under context '${describeRejectedContext(context)}', which is not ` +
      `one of the nine contexts this engine recognises. The request is refused; it is not run ` +
      `under a substituted context, and it is not skipped.`,
  );
}

/* ==============================================================================================
 * SECTION 5 — THE ENGINE
 *
 * One class, one collaborator, no state. Everything it needs per pass arrives as an argument.
 * ============================================================================================ */

/**
 * Evaluates typed rule sets against a subject and accumulates the failures.
 *
 * This is the port of `org/Hibachi/HibachiValidationService.cfc` reduced to what the Catalog slice
 * actually reaches: context selection, condition gating, the eleven constraint evaluators, message
 * composition and error accumulation. The document loader, the custom-override merge, the
 * populated-sub-property cascade and the per-class memoisation are all deliberately absent — see
 * WHAT THIS FILE IS NOT and TWO DOCUMENTED NON-PORTS in the module header.
 *
 * STATELESSNESS IS A REQUIREMENT, NOT A STYLE CHOICE. The instance holds exactly one field, the
 * injected port, and it is readonly. There is no cache, no memoisation table and no accumulated
 * counter — nothing that could survive one pass and leak into the next. M7 requires it (nothing may
 * bleed between invocations on a warm container) and requirement N4 reinforces it (no global or
 * module-scope flag is raised, unlike `org/Hibachi/HibachiTransient.cfc:L455-L457`, which is M5 and
 * belongs to `src/adapters/mysql/UnitOfWork.ts`). One consequence is that a single instance is safe
 * to share across every subject in a batch, and another is that constructing a fresh one per
 * invocation costs nothing.
 *
 * @example
 * ```ts
 * const validator = new Validator(uniquePropertyChecker);
 * const errors = new ValidationError();
 * await validator.validate(sku, skuRules, 'save', { errors });
 * if (!errors.hasErrors()) {
 *   await repository.save(sku);
 * }
 * ```
 *
 * @example
 * ```ts
 * // A dry run — the equivalent of the deletability check at
 * // org/Hibachi/HibachiEntity.cfc:L205. No bag is supplied, so nothing the caller holds changes.
 * const isDeletable = !(await validator.validate(product, productRules, 'delete')).hasErrors();
 * ```
 */
export class Validator {
  /**
   * The uniqueness boundary, injected per AAP 0.7.3 S3 and imported type-only so no runtime edge is
   * created from this layer to any adapter.
   *
   * Every one of the seven `unique` rules is evaluated through this and through nothing else: there
   * is no ad-hoc query anywhere in this file, and the database constraint alone is explicitly not
   * relied upon (AAP IR-5). See DECISION D-2 in the module header for the polarity.
   */
  private readonly uniquePropertyPort: UniquePropertyPort;

  /**
   * @param uniquePropertyPort the application-side uniqueness check. Required rather than optional:
   *   seven in-scope rules depend on it, and for two of them — the option and option-group code
   *   rules at `model/validation/Option.json:L3` and `model/validation/OptionGroup.json:L4` — no
   *   database constraint exists behind it, so a validator without it would silently stop enforcing
   *   uniqueness rather than degrade to a weaker guarantee.
   */
  public constructor(uniquePropertyPort: UniquePropertyPort) {
    this.uniquePropertyPort = uniquePropertyPort;
  }

  /**
   * Validates one subject against one rule set under one context, and RETURNS the error bag.
   *
   * Returning the bag rather than mutating the subject is requirement N1, and it is triple-proven in
   * the legacy source: the engine's signature carries the mode parameter
   * (`org/Hibachi/HibachiValidationService.cfc:L153`), the engine returns the bag (`:L196`, and the
   * entity-side wrapper returns it too at `org/Hibachi/HibachiTransient.cfc:L459`), and the three
   * capability checks at `org/Hibachi/HibachiEntity.cfc:L205`, `:L215` and `:L225` each read
   * `hasErrors()` off a RETURNED THROWAWAY bag. Without the returned bag and the dry-run mode, the
   * traceable legacy regression `issue_1331` in `meta/tests/unit/IssuesTest.cfc` — which asserts that
   * a content-access product is not processable for the add-option-group context — could not be
   * ported at all.
   *
   * THE ORDER OF OPERATIONS, each step carrying the locator it reproduces:
   *   0. REFUSE a context outside {@link VALIDATION_CONTEXTS}. No legacy counterpart, because the
   *      legacy parameter is an open string; this is the runtime half of DECISION V-1 and it runs
   *      first so that a refused call leaves a caller-supplied bag untouched.
   *   1. Choose the bag: the supplied one, or a fresh throwaway (`:L155-L159`).
   *   2. If the context is boolean-castable and casts to FALSE, skip validation entirely and return
   *      the bag untouched (`:L162`). A context of "false", "no" or "0" therefore validates nothing,
   *      while the EMPTY STRING does not cast at all and so validates normally. Step 0 means no such
   *      value can arrive, so this step is preserved-but-unreachable rather than live.
   *   3. For each property in declaration order: if the subject does not have it, SKIP the property
   *      silently (`:L171`).
   *   4. For each of its rules in declaration order: apply the context gate (`:L71`).
   *   5. For each constraint of a passing rule in declaration order: apply the condition gate
   *      (`:L177-L180`), then evaluate, then on failure compose the message and record it against the
   *      FULL property identifier (`:L224`, `:L228`, `:L232`).
   *
   * No step short-circuits. Errors accumulate across properties, across rules and across the
   * constraints of one rule, which is why the bag's values are arrays and why one save can report
   * several failures for one property.
   *
   * SEQUENTIAL BY CONSTRUCTION — M6. Constraints are awaited one at a time. Nothing here settles
   * constraint promises together, and that is deliberate rather than an oversight: two of the eleven
   * constraints reach the database, and one of them is the read-back rule of AAP 0.6.2 whose ordering
   * relative to its siblings' writes IS the behavior under preservation. See M6 in the module header
   * for the three obligations this discharges.
   *
   * @param subject the object to validate
   * @param ruleSet its transliterated rule set, from `src/validation/rules/`
   * @param context the context to select rules for — one of the nine members of
   *   {@link ValidationContext}, per requirement N2 as amended by DECISION V-1. Closing this
   *   parameter declares the `:L162` validation bypass unreachable; the membership guard described at
   *   {@link VALIDATION_CONTEXTS} is what makes it so at runtime.
   * @param options supply `errors` to accumulate into a caller-held bag; omit for a dry run
   * @returns the bag the failures were accumulated into
   * @throws TypeError when the context is not one of the nine members of
   *   {@link ValidationContext} — refused before any work, and never substituted or skipped; when a
   *   rule set declares a constraint kind this engine does not evaluate (`:L201-L203`); when it
   *   declares a `dataType` value outside the two supported ones (`:L263`); or when a method rule
   *   resolves to a value that cannot be read as a verdict
   */
  public async validate<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    options?: ValidateOptions,
  ): Promise<ValidationError> {
    /*
     * SEC-HARDENING (D18-CLASS) — the runtime membership guard, and the FIRST statement of the
     * method by necessity: it must run before the bag is chosen, before the legacy gate below and
     * before any rule is read, because a refused context must leave a caller-supplied bag exactly as
     * it was found. See {@link VALIDATION_CONTEXTS} for the licensing argument and for the three
     * crossings on which an unchecked value reaches here despite the closed union.
     */
    if (!isValidationContext(context)) {
      throw unrecognisedValidationContext(context);
    }

    const errors = options?.errors ?? new ValidationError();

    /*
     * `org/Hibachi/HibachiValidationService.cfc:L162` — the legacy context gate, preserved. See
     * {@link legacyContextDisablesValidation} for the locator, the TODO(parity) annotation and the
     * per-member proof that no value of {@link ValidationContext} can select it. The guard above now
     * makes that proof hold at RUNTIME as well as in the type system, so this branch is dead in fact
     * and not merely dead by declaration.
     */
    if (legacyContextDisablesValidation(context)) {
      return errors;
    }

    const className = subject.getClassName();

    for (const property of ruleSet.properties) {
      // `:L171` — silently skip a rule whose property the subject does not carry.
      if (!subject.hasProperty(property.propertyIdentifier)) {
        continue;
      }

      for (const rule of property.rules) {
        // `:L71` — the context gate. An absent context list means every context.
        if (!ruleAppliesToContext(rule, context)) {
          continue;
        }

        for (const constraint of rule.constraints) {
          // `:L177-L180` — the condition gate is re-evaluated for EVERY constraint of the rule,
          // exactly as the legacy engine does, because it copied the rule's condition list onto each
          // flattened constraint record (`:L83-L85`) and then tested it per record. Hoisting the
          // check out of this loop would be a caching decision, and M7 forbids caching here.
          if (rule.conditions !== undefined) {
            const conditionsMet = await this.conditionsAreMet(subject, ruleSet, rule.conditions);
            if (!conditionsMet) {
              continue;
            }
          }

          const verdict = await this.evaluateConstraint(
            subject,
            property.propertyIdentifier,
            property.read,
            constraint,
            className,
          );

          // `:L201-L203` — in the MAIN path an unrecognised constraint kind raises. Inside a
          // conditions block the same input is ignored instead; the two are not harmonised.
          if (verdict === 'unevaluable') {
            throw unevaluableConstraint(className, property.propertyIdentifier, constraint);
          }

          if (verdict === 'fail') {
            // `:L224`, `:L228`, `:L232` — reported against the FULL property identifier, with
            // exactly TWO arguments. Requirement N6: the three-argument override at
            // `org/Hibachi/HibachiEntity.cfc:L151` is an entity concern and is never used from here.
            errors.addError(
              property.propertyIdentifier,
              buildValidationMessage(context, className, property.propertyIdentifier, constraint),
            );
          }
        }
      }
    }

    return errors;
  }

  /**
   * Runs the two-object, single-context process flow — requirement N3.
   *
   * Reproduces the ordering of `org/Hibachi/HibachiService.cfc:L84-L130`: validate the entity under
   * the process context (`:L96`), gate on the entity being clean and on a process object existing
   * (`:L99`), then validate the process object under THE SAME context (`:L108`).
   *
   * The gate is evaluated against the entity's BAG, not against "did this call add anything", which
   * matters when a caller supplies a bag that already carries failures from an earlier step: the
   * legacy gate called the entity's own error check and would have seen those too.
   *
   * This method never invokes a process method and never persists. The legacy flow reaches the
   * process method at `:L113-L115`, after this point; the universal shape is validate, then check,
   * then persist, and this engine owns only the first step.
   *
   * @param request the entity, the optional process object, their rule sets and the shared context
   * @returns both bags, plus whether the second pass actually ran
   * @throws TypeError under the same conditions as {@link validate}, including an unrecognised
   *   {@link ProcessValidationRequest.processContext} — refused on the first delegated call, so
   *   neither pass runs and neither supplied bag is touched
   */
  public async validateProcess<
    TEntity extends ValidationSubject,
    TProcessObject extends ValidationSubject,
  >(request: ProcessValidationRequest<TEntity, TProcessObject>): Promise<ProcessValidationResult> {
    // `:L96` — the entity is validated first, under the process context.
    const entityErrors = await this.validate(
      request.entity,
      request.entityRuleSet,
      request.processContext,
      request.entityErrors === undefined ? undefined : { errors: request.entityErrors },
    );

    const target = request.processObject;

    // `:L99` — both halves of the gate: no entity errors, AND a process object for this context.
    if (target === undefined || entityErrors.hasErrors()) {
      return {
        entityErrors,
        processObjectErrors: target?.errors ?? new ValidationError(),
        processObjectRan: false,
      };
    }

    // `:L108` — the process object is validated under the SAME context string.
    const processObjectErrors = await this.validate(
      target.subject,
      target.ruleSet,
      request.processContext,
      target.errors === undefined ? undefined : { errors: target.errors },
    );

    return { entityErrors, processObjectErrors, processObjectRan: true };
  }

  /**
   * Evaluates a rule's condition list — `org/Hibachi/HibachiValidationService.cfc:L97-L131`.
   *
   * OR ACROSS conditions, AND WITHIN one. The list is comma-delimited; a name that the rule set does
   * not declare is skipped (`:L108`); and an EMPTY list yields false (`:L130`), so a rule whose
   * condition list resolves to nothing never runs.
   *
   * Two details that look like bugs and are behavior:
   *   - No short-circuit inside a condition. `:L118` records the failure and keeps looping, so every
   *     constraint of a condition is evaluated even once the condition is known to have failed.
   *   - An unknown constraint kind inside a condition is SILENTLY IGNORED, because `:L117` tests for
   *     the evaluator's existence FIRST and the conjunction short-circuits, leaving the all-met flag
   *     untouched. This is the deliberate opposite of the main path, which raises for the same input
   *     (`:L201-L203`). The two are not harmonised: {@link evaluateConstraint} raises, and the catch
   *     below converts that raise into the silent skip this path requires.
   */
  private async conditionsAreMet<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    conditions: string,
  ): Promise<boolean> {
    const declared = ruleSet.conditions ?? [];

    for (const name of cfListToArray(conditions)) {
      // `:L108` — CFML struct keys are case-insensitive, so the name lookup is too.
      const condition = declared.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      if (condition === undefined) {
        continue;
      }

      let allConstraintsMet = true;

      for (const conditionConstraint of condition.constraints) {
        const verdict = await this.evaluateConstraint(
          subject,
          conditionConstraint.propertyIdentifier,
          conditionConstraint.read,
          conditionConstraint.constraint,
          subject.getClassName(),
        );

        // `:L117` — an unrecognised constraint kind inside a conditions block is SILENTLY IGNORED,
        // because the legacy existence test short-circuits the conjunction before any evaluator
        // runs and so never clears the all-met flag. Skipping without recording a failure is what
        // reproduces that. Note what is NOT skipped: a raise from inside an evaluator that DOES
        // exist — the `dataType` whitelist raise at `:L263`, or a method result that cannot be read
        // as a verdict — still propagates out of this loop, exactly as it would in CFML.
        if (verdict === 'unevaluable') {
          continue;
        }

        // `:L118` — record and keep going. Deliberately not a break.
        if (verdict === 'fail') {
          allConstraintsMet = false;
        }
      }

      // `:L124-L126` — one met condition is enough for the whole list.
      if (allConstraintsMet) {
        return true;
      }
    }

    // `:L130` — no condition met, including the case of an empty list.
    return false;
  }

  /**
   * Dispatches one constraint to its evaluator — the typed replacement for
   * `org/Hibachi/HibachiValidationService.cfc:L200-L235`'s name-composed dynamic invocation.
   *
   * The switch is exhaustive over the discriminated union, so adding a twelfth constraint kind
   * without evaluating it is a compile error. Its final branch reports {@link ConstraintVerdict}'s
   * third state rather than raising, which is what lets ONE enumeration of the eleven kinds serve
   * both selection paths: the main path turns that state into the raise of `:L201-L203`, while the
   * conditions path turns it into the silent skip of `:L117`.
   *
   * A `pass` verdict corresponds to a legacy `validate_*` body returning true and a `fail` verdict
   * to it returning false, so the polarity of every evaluator below is unchanged from the source.
   */
  private async evaluateConstraint<TSubject extends ValidationSubject>(
    subject: TSubject,
    propertyIdentifier: string,
    read: PropertyValueReader<TSubject>,
    constraint: Constraint<TSubject>,
    className: string,
  ): Promise<ConstraintVerdict> {
    switch (constraint.constraintType) {
      case 'required':
        return verdictOf(isPresent(read(subject)));

      case 'dataType':
        return verdictOf(satisfiesDataType(read(subject), constraint, className));

      case 'minValue':
        return verdictOf(satisfiesMinValue(read(subject), constraint.constraintValue));

      case 'maxLength':
        return verdictOf(satisfiesMaxLength(read(subject), constraint.constraintValue));

      case 'minCollection':
        return verdictOf(satisfiesMinCollection(read(subject), constraint.constraintValue));

      case 'maxCollection':
        return verdictOf(satisfiesMaxCollection(read(subject), constraint.constraintValue));

      case 'regex':
        return verdictOf(satisfiesRegex(read(subject), constraint.constraintValue));

      case 'eq':
        return verdictOf(satisfiesEquality(read(subject), constraint.constraintValue));

      case 'inList':
        return verdictOf(satisfiesInList(read(subject), constraint.constraintValue));

      case 'method':
        return verdictOf(await evaluateMethodRule(subject, constraint, className));

      case 'unique':
        // `:L467-L470` — the whole check is delegated, and the port's verdict is returned
        // UNMODIFIED. `true` means unique and therefore savable; see DECISION D-2. The property name
        // handed over is the trailing segment of the identifier, per `:L469`, while the error this
        // failure produces is still keyed by the FULL identifier.
        return verdictOf(
          await this.uniquePropertyPort.isUniqueProperty(
            cfLastSegment(propertyIdentifier),
            constraint.uniqueTarget(subject),
          ),
        );

      default:
        // Unreachable while the union holds. Reported rather than raised so the caller decides —
        // see the note on {@link ConstraintVerdict}.
        return 'unevaluable';
    }
  }
}

/* ==============================================================================================
 * SECTION 6 — THE ELEVEN EVALUATORS
 *
 * One function per constraint kind, each a transcription of the corresponding legacy `validate_*`
 * body, each returning true for PASS. The null column of the table in the module header is
 * implemented here and nowhere else, which is why these are separate named functions rather than
 * inline expressions: each one is individually reviewable against its locator, and individually
 * assertable through a single-constraint rule set.
 *
 * All eleven are module-private and stateless. The two that are asynchronous are so because the
 * legacy behavior they reproduce reaches the database — see M6 in the module header.
 * ============================================================================================ */

/**
 * The context gate — `org/Hibachi/HibachiValidationService.cfc:L71`.
 *
 * A rule with no context list applies in EVERY context; otherwise the requested context must appear
 * in the comma-delimited list, case-insensitively.
 *
 * The empty context deserves its own note, because it is one of the four runtime-only context values
 * and it behaves in a way that looks wrong until traced: an empty needle is never found in any list
 * (see {@link cfListToArray}), so under the empty context ONLY rules without a context list fire.
 * Across the seven documents that means only the two rules of
 * `model/validation/Product_UpdateSkus.json`.
 */
function ruleAppliesToContext<TSubject extends ValidationSubject>(
  rule: ValidationRule<TSubject>,
  context: ValidationContext,
): boolean {
  if (rule.contexts === undefined) {
    return true;
  }
  return cfListContainsNoCase(rule.contexts, context);
}

/**
 * `required` — `org/Hibachi/HibachiValidationService.cfc:L240-L246`.
 *
 * The legacy predicate passes when the value is not null AND is one of: any component instance;
 * a non-empty array; a non-empty struct; or a simple value whose TRIMMED string length is non-zero.
 *
 * The consequences that catch people, all of them load-bearing:
 *   - An EMPTY ARRAY FAILS. The array branch requires a non-zero length.
 *   - A WHITESPACE-ONLY STRING FAILS, because the length is measured after trimming.
 *   - The NUMBER ZERO PASSES, because its string form has length one. A required price of zero is
 *     therefore valid — which matters, since `model/validation/Sku.json:L9` pairs a presence rule
 *     with a floor of zero rather than with a floor of one.
 *   - BOTH BOOLEANS PASS, including false, for the same reason.
 *   - An EMPTY STRUCT FAILS while any ENTITY REFERENCE PASSES. That distinction is what
 *     {@link isCfStruct} exists to draw, and it is why the required entity references at
 *     `model/validation/Product.json:L11` and `model/validation/Option.json:L5` pass on presence
 *     alone.
 */
function isPresent(value: unknown): boolean {
  if (isAbsent(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isCfSimpleValue(value)) {
    return cfToString(value).trim().length > 0;
  }
  if (isCfStruct(value)) {
    return cfStructCount(value) > 0;
  }
  // Anything object-like that is left is a component instance in CFML terms, and `:L242` passes any
  // component OUTRIGHT without inspecting it — which is exactly what makes a required entity
  // reference satisfiable by presence alone. The remaining primitive kinds JavaScript has and CFML
  // does not — symbols and arbitrary-precision integers — have no legacy counterpart to be faithful
  // to, and no reader in this slice can produce one, so they are not modelled as present.
  return typeof value === 'object' || typeof value === 'function';
}

/**
 * `dataType` — `org/Hibachi/HibachiValidationService.cfc:L256-L267`.
 *
 * PASSES on an absent value (`:L259`), so it is a format check on values that are present rather than
 * a presence check. The two supported types are the only two the seven documents declare; the raise
 * in the final branch is the runtime counterpart of `:L263`, reachable only from a rule set built
 * outside the type system, since {@link DataTypeConstraintValue} makes any other value a compile
 * error.
 */
function satisfiesDataType(
  value: unknown,
  constraint: DataTypeConstraint,
  className: string,
): boolean {
  /*
   * Read the discriminant ONCE, before any narrowing, so the unreachable branch below can still
   * name it. Narrowing `constraint` down to `never` also narrows any later read THROUGH it, which is
   * why this is a separate binding rather than a widening assignment or an `as` cast at the throw.
   */
  const dataType: DataTypeConstraintValue = constraint.constraintValue;

  if (isAbsent(value)) {
    return true;
  }
  if (constraint.constraintValue === 'numeric') {
    return isCfNumeric(value);
  }
  if (constraint.constraintValue === 'url') {
    /*
     * ⛔ THERE IS NO POLICY SELECTION HERE, AND SEC-15's POLICY SPLIT STAYS WITHDRAWN. An earlier
     * revision branched on a required `urlPolicy` member between a strict web-address predicate and
     * the legacy six-protocol approximation. `org/Hibachi/HibachiValidationService.cfc:L259` performs
     * one check, so this performs one check — now including the two unconditional syntactic rules of
     * SEC-HARDENING (D18-CLASS). THE SIX-PROTOCOL URL CHECK IS STILL THE WHOLE CHECK carries the full
     * record of which half of SEC-15 came back and why.
     */
    return isCfUrlAnyProtocol(value);
  }
  /*
   * EXHAUSTIVENESS. Both arms of `DataTypeConstraint` are handled above, so this branch is
   * unreachable THROUGH THE TYPE SYSTEM — the guarantee the legacy engine lacked, since it dispatched
   * on a string read out of a JSON document. It is retained as the runtime counterpart of the
   * whitelist raise at `org/Hibachi/HibachiValidationService.cfc:L263`, reachable only by a rule set
   * assembled outside the type system.
   */
  throw unevaluableDataType(className, dataType);
}

/**
 * `minValue` — `org/Hibachi/HibachiValidationService.cfc:L269-L275`.
 *
 * PASSES on an absent value, and FAILS on a value that is present but NOT NUMERIC — so it enforces
 * numericality as well as the floor. All three in-scope rules declare a floor of zero, on the SKU
 * money properties at `model/validation/Sku.json:L4`, `:L9` and `:L10`.
 *
 * ⚠️ F07 — THE `toCfNumber` CONVERSION HERE IS LOSSY, AND IT PROVABLY CANNOT CHANGE AN OUTCOME. The three
 * values it judges are now `ExactDecimal` (exact digits as text), and this function converts one to a
 * double before comparing. For a value beyond 2^53 that conversion rounds — but ALL THREE in-scope floors
 * are ZERO, and rounding to the nearest double never crosses zero: it preserves the sign exactly, and it
 * maps a non-zero magnitude to a non-zero one. So `numeric >= 0` returns what an exact comparison would
 * return for every input, and the rule's verdict is unaffected.
 *
 * It is stated rather than pre-emptively rewritten because the alternative — routing this through
 * `../util/formatting`'s `compareExactDecimal` — would require this generic engine to assume its subject
 * is exact-decimal text, which it is not: `minValue` is declared against a `number` floor read out of a
 * JSON document and is applied to whatever the subject carries. THE MOMENT A NON-ZERO FLOOR IS INTRODUCED
 * this reasoning lapses and the comparison must become exact; that is the trigger to watch for, and it is
 * recorded here rather than left to be rediscovered.
 */
function satisfiesMinValue(value: unknown, minimum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (!isCfNumeric(value)) {
    return false;
  }
  const numeric = toCfNumber(value);
  return numeric !== undefined && numeric >= minimum;
}

/**
 * `maxLength` — `org/Hibachi/HibachiValidationService.cfc:L293-L299`.
 *
 * PASSES on an absent value; measures the TRIMMED length; and FAILS on any value that is not simple.
 * The single in-scope rule is the system-code delete guard at
 * `model/validation/ProductType.json:L7`, whose ceiling of zero passes only for an absent, empty or
 * whitespace-only value — the idiom for "a seeded record may not be deleted".
 */
function satisfiesMaxLength(value: unknown, maximum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (!isCfSimpleValue(value)) {
    return false;
  }
  return cfToString(value).trim().length <= maximum;
}

/**
 * `minCollection` — `org/Hibachi/HibachiValidationService.cfc:L301-L307`.
 *
 * PASSES on an absent value; counts an array's length or a struct's keys; FAILS on anything else,
 * including any simple value.
 *
 * THE ASYMMETRY WORTH RE-READING: a floor of one PASSES on null and FAILS on an empty array. The
 * three in-scope rules — the unused-option and unused-term collections at
 * `model/validation/Product.json:L13-L15` — are what gate the three add-something process contexts,
 * so this asymmetry decides whether those processes are offered.
 */
function satisfiesMinCollection(value: unknown, minimum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length >= minimum;
  }
  if (isCfStruct(value)) {
    return cfStructCount(value) >= minimum;
  }
  return false;
}

/**
 * `maxCollection` — `org/Hibachi/HibachiValidationService.cfc:L309-L315`.
 *
 * PASSES on an absent value; counts an array's length or a struct's keys; FAILS on anything else,
 * including any simple value.
 *
 * Nine in-scope rules use it, every one with a ceiling of zero, and together they are the slice's
 * delete-guard vocabulary: physical counts on four entities, plus products and child product types
 * on the product type, products on the brand, options on the option group and SKUs on the option.
 * A ceiling of zero on an absent collection passing is the reason a guard must be paired with a
 * reader that returns an ARRAY rather than an absent value when the relationship is simply empty.
 */
function satisfiesMaxCollection(value: unknown, maximum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length <= maximum;
  }
  if (isCfStruct(value)) {
    return cfStructCount(value) <= maximum;
  }
  return false;
}

/**
 * `regex` — `org/Hibachi/HibachiValidationService.cfc:L481-L487`.
 *
 * PASSES on an absent value (`:L483`); FAILS on a value that is not simple, since a pattern cannot be
 * applied to a collection. The pattern is applied as authored and compiled fresh each time, per the
 * note on {@link RegexConstraint}.
 *
 * A MALFORMED PATTERN RAISES rather than silently failing the rule. That is the honest translation:
 * an unusable pattern is an authoring fault in the rule set, and reporting it as a validation failure
 * would make every value of that property invalid for a reason no message could convey.
 */
function satisfiesRegex(value: unknown, pattern: string): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (!isCfSimpleValue(value)) {
    return false;
  }
  return new RegExp(pattern).test(cfToString(value));
}

/**
 * `eq` — `org/Hibachi/HibachiValidationService.cfc:L385-L395`.
 *
 * FAILS on an absent value (`:L391` requires the value to be present), then compares LOOSELY. See
 * LOOSE EQUALITY in the module header for why the looseness is preserved rather than tightened, and
 * {@link isCfLooseEqual} for the comparison ladder.
 *
 * Three in-scope rules are delete guards comparing a flag against false —
 * `model/validation/Product.json:L12`, `model/validation/Sku.json:L3` and `:L12` — and two are the
 * conditions of `model/validation/Product_UpdateSkus.json`, comparing an update flag against one.
 */
function satisfiesEquality(value: unknown, expected: EqualityConstraintValue): boolean {
  if (isAbsent(value)) {
    return false;
  }
  return isCfLooseEqual(value, expected);
}

/**
 * `inList` — `org/Hibachi/HibachiValidationService.cfc:L459-L465`.
 *
 * FAILS on an absent value; otherwise the value must appear in the comma-delimited list,
 * CASE-INSENSITIVELY (`:L461`). Both in-scope rules gate a process context on the product's base
 * type, at `model/validation/Product.json:L4` and `:L5`.
 */
function satisfiesInList(value: unknown, list: string): boolean {
  if (isAbsent(value)) {
    return false;
  }
  return cfListContainsNoCase(list, value);
}

/**
 * `method` — `org/Hibachi/HibachiValidationService.cfc:L333-L335`.
 *
 * The subject's own method decides, and the legacy engine passes it NO ARGUMENTS (`:L334`). The
 * result is then coerced, because the two in-scope methods are declared as returning the widest CFML
 * type rather than a boolean (`model/entity/Sku.cfc:L756` and `:L772`).
 *
 * M6 IS ENTERED HERE. This is the wiring site of the read-back loop described in the module header:
 * `hasUniqueOptions` performs a database read at `model/entity/Sku.cfc:L763` from inside validation
 * of a save that is still in flight. The single `await` below is what keeps that read in sequence
 * with its siblings; the surrounding loops never settle constraint promises together and never cache
 * a verdict, so a batch of SKUs is validated one at a time, in the order the caller produced them.
 * The other half of M6 — making each insert visible to the next subject's read within the same
 * transaction — belongs to `src/adapters/mysql/UnitOfWork.ts`.
 *
 * TWO CASE-SENSITIVITY DIVERGENCES ARE DOCUMENTED RATHER THAN RESOLVED HERE, because they live in the
 * ported domain methods and not in this engine:
 *   - The self-exclusion comparison at `model/entity/Sku.cfc:L764` uses CFML equality, which is
 *     case-INSENSITIVE, whereas the TypeScript comparison in the ported method is case-sensitive.
 *     The identifiers compared are 32-character lowercase hexadecimal (AAP IR-6), so a
 *     case-sensitive comparison is correct for every value that can actually occur.
 *   - The duplicate-group check at `model/entity/Sku.cfc:L776` uses the CASE-SENSITIVE list search,
 *     deliberately unlike the case-insensitive searches this engine performs for contexts and for
 *     list membership. The two are NOT harmonised.
 */
async function evaluateMethodRule<TSubject extends ValidationSubject>(
  subject: TSubject,
  constraint: MethodConstraint<TSubject>,
  className: string,
): Promise<boolean> {
  const resolved: unknown = await constraint.invoke(subject);
  const verdict = toCfBoolean(resolved);
  if (verdict === undefined) {
    throw uncoercibleMethodResult(className, constraint.constraintValue);
  }
  return verdict;
}
