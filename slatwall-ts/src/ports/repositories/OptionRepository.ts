/**
 * `OptionRepository` — the repository port for the Catalog's two option queries.
 *
 * Legacy origin: `model/dao/OptionDAO.cfc`, a component with exactly two members. AAP §0.4.1.6
 * mandates this file with a single instruction — "Two query methods with their `{name, value}`
 * projection shapes typed" — and AAP §0.4.2.6 fixes both target names:
 * `getUnusedProductOptions` (`model/dao/OptionDAO.cfc:L51`) becomes
 * {@link OptionRepository.findUnusedOptions}, and `getUnusedProductOptionGroups`
 * (`model/dao/OptionDAO.cfc:L94`) becomes {@link OptionRepository.findUnusedOptionGroups}.
 *
 * WHY A DAO IS IN SCOPE AT ALL. The prompt names no DAOs; AAP §0.2.1.3 adds all four as implicit
 * scope because "this is where the Catalog's business logic actually resides". Here that is literally
 * true: both public members of `model/service/OptionService.cfc` are one-line pass-throughs
 * (`model/service/OptionService.cfc:L73` and `:L77`), so every behaviour worth preserving — the
 * composed label, the set polarity, the row ordering — is expressed in the DAO and belongs to THIS
 * contract rather than to the service above it. A port declaring only `{ name: string; value: string }`
 * would still compile, and the service would then have to re-invent semantics the DAO already fixed.
 *
 * THE PROJECTION SHAPES ARE THE CONTRACT. Neither member returns an entity. Both return arrays of
 * two-field rows assembled row by row inside the DAO (`model/dao/OptionDAO.cfc:L87-L89` and
 * `:L112-L114`), so the shape of those rows and the meaning of each field is the whole observable
 * surface. That is why {@link UnusedOptionRow} and {@link UnusedOptionGroupRow} are declared here
 * beside the members that produce them, and why no domain type is referenced: this module has no
 * imports, which keeps `src/ports/` a hexagonal leaf (AAP §0.7.3 S4).
 *
 * WHERE THE STATEMENTS LIVE INSTEAD. Statement text, placeholder generation and identifier handling
 * are the adapter's job (AAP §0.4.1.7, §0.4.3.4), so nothing SQL-shaped crosses this boundary: no
 * fragment, no table or column name as a parameter, no placeholder array (AAP §0.7.3 S2). What this
 * file does carry is the adapter OBLIGATIONS the type system cannot express, each stated on the
 * member it constrains with its legacy locator. Neither member is paginated and neither accepts a
 * dynamic filter set, so no query-abstraction port is referenced either.
 *
 * NO CARRIED DEFECT LANDS IN THIS COMPONENT, which is worth recording because silence would invite
 * someone to "harden" source that needs no hardening. It binds every value through `<cfqueryparam>` —
 * at `model/dao/OptionDAO.cfc:L68`, `:L78` and `:L107`, which is all three of them — so it is
 * untouched by D18, the interpolation surface belonging to `model/dao/ProductDAO.cfc` alone. And it
 * names only correct physical tables (`SwOption`, `SwOptionGroup`, `SwSkuOption`, `SwSku`), so it is
 * untouched by the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132]. The annotations below therefore mark PRESERVED BEHAVIOUR, not defects.
 *
 * ⚠️ THE PARAGRAPH ABOVE WAS STATED TWICE, AND THE SECOND COPY IS REMOVED. Review finding F11 reported
 * the duplication; an earlier revision appended a corrected restatement rather than substituting it, so the
 * same three facts — every value bound, only physical tables named, no register entry landing here — were
 * asserted in two consecutive paragraphs with different wording. The first opened "The carried-defect
 * register for this slice runs from D1 to <a port-minted endpoint beyond D21> and is closed", and BOTH
 * halves of that were wrong: the range was not the AAP's, and no range belongs here at all. The bounds and
 * every port-minted observation live in exactly one place, `src/ports/repositories/SkuRepository.ts`.
 *
 * ⚠️ F27 — AND THE ATTRIBUTION OF THE NAMING DIVERGENCE WAS WRONG TOO, AND IS CORRECTED. It said the
 * divergence "affects `ProductDAO` and `ProductTypeDAO` only", which omitted the legacy component the
 * divergence ORIGINATES in and
 * where it takes its sharpest, intra-file form: `model/dao/SkuDAO.cfc` places logical entity names
 * in the native statement at `:L132` and `:L135` while using physical names in the native statement
 * at `:L179-L186`. `model/dao/ProductDAO.cfc` and `model/dao/ProductTypeDAO.cfc:L54-L62` are
 * affected too. Verified by reading all four catalog DAOs; OptionDAO remains the only one
 * untouched, which is this note's real point and is unchanged. No parity annotation below is
 * therefore attached to a defect; the annotations that ARE below mark PRESERVED BEHAVIOUR instead.
 *
 * `model/dao/OptionDAO.cfc` is REFERENCE-ONLY and never modified (AAP §0.4.1.1, TR-6). Behaviour is
 * preserved exactly while the idiom changes freely — the two halves of the Minimal Change Clause
 * (AAP §0.8.1) — and every judgement call the translation required is annotated inline with the
 * locator that justifies it (AAP §0.8.2 Guideline 6).
 */

/* This file imports NOTHING. The `./BoundedRead` import that stood here served the two windowed
 * companions, and both have been withdrawn — see the block above `findUnusedOptionGroups`. */

/**
 * One row of {@link OptionRepository.findUnusedOptions} — an option offered for selection.
 *
 * THE LABEL IS COMPOSED, AND THE SEPARATOR IS OBSERVABLE OUTPUT. `name` is not a bare option
 * name. `model/dao/OptionDAO.cfc:L88` builds it as
 * `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}` — the owning option
 * group's name, then a SPACE, then a HYPHEN-MINUS, then a SPACE, then the option's own name.
 * Implementations MUST reproduce that exact three-character separator. An en dash, a slash, a
 * colon or a bare hyphen without its surrounding spaces would each change text that reaches a
 * rendered page, and the composition happens in the DAO rather than in
 * `model/service/OptionService.cfc` precisely because the service is a pass-through [`L73`].
 *
 * `value` is the option's own identifier, `SwOption.optionID`, projected at `OptionDAO.cfc:L60`.
 *
 * THE FIELD NAMES ARE LOAD-BEARING, NOT A LOCAL CONVENTION. The legacy rows are consumed as
 * drop-down entries: `admin/views/entity/preprocessproduct_addoption.cfm:L60` passes the array
 * straight into a `fieldType="select"` display, and the rendering tag at
 * `org/Hibachi/HibachiTags/HibachiFormField.cfm:L145-L148` keys on the literal strings `name` and
 * `value`, emitting the pair as the visible label and the submitted value at `L154`. Any other key
 * is not ignored — `L149-L150` turns it into a `data-*` attribute — so renaming `name` to `label`
 * or `value` to `id` would yield an entry with an empty label AND an empty value. Both keys stay
 * lowercase exactly as the unquoted CFML struct keys at `L88` produce them. (That framework file
 * is read for contract understanding only; no framework code is carried forward, per AAP 0.8.3.2.)
 *
 * Both fields are `readonly`: a row is a query-computed projection, never an object written back.
 */
export interface UnusedOptionRow {
  readonly name: string;
  readonly value: string;
}

/**
 * One row of {@link OptionRepository.findUnusedOptionGroups} — an option group offered for
 * selection.
 *
 * `name` is the PLAIN group name with no composition of any kind, and `value` is the group's own
 * identifier: `model/dao/OptionDAO.cfc:L113` builds
 * `{name=rs.optionGroupName, value=rs.optionGroupID}`. Contrast `L88`, which composes two names
 * into one label for {@link UnusedOptionRow}. The consumer is the sibling admin view
 * `admin/views/entity/preprocessproduct_addoptiongroup.cfm:L60`, reaching the same drop-down
 * rendering path, so the lowercase `name` / `value` keys are fixed here for the same reason.
 *
 * THE STRUCTURAL DUPLICATION WITH {@link UnusedOptionRow} IS DELIBERATE — DO NOT COLLAPSE IT.
 * The two types are shape-identical and semantically different, which is exactly the situation a
 * shared alias would erase. `name` is a composed `"group - option"` label in one and a plain group
 * name in the other; `value` is a `SwOption.optionID` in one and a `SwOptionGroup.optionGroupID`
 * in the other. Merging them, or aliasing one to the other, would let an option identifier be
 * handed to a caller expecting a group identifier with no compile error anywhere — and the two
 * members are used side by side, on the same product, by
 * `model/entity/Product.cfc:L635-L640` and `L642-L647`. Two names for two meanings is the encoding
 * of a behaviour-bearing difference, not redundancy awaiting cleanup (AAP 0.8.2, Guideline 4).
 *
 * Both fields are `readonly`, for the same reason as {@link UnusedOptionRow}.
 */
export interface UnusedOptionGroupRow {
  readonly name: string;
  readonly value: string;
}

/**
 * Port for the two option queries of `model/dao/OptionDAO.cfc`, consumed by `OptionService` and
 * implemented against MySQL in `src/adapters/mysql/**`.
 *
 * The implementation is supplied by explicit constructor injection, replacing the DI/1 property
 * declared at `model/service/OptionService.cfc:L51` and the `getOptionDAO()` accessor synthesised
 * for it, which resolved by name at runtime (AAP 0.4.3.1 R1 and 0.4.3.2 R2; AAP 0.7.3 S3). The
 * second property that component declares, `productService` at `OptionService.cfc:L53`, is a dead
 * injection with zero call sites (AAP 0.6.3.4) and is deliberately not represented anywhere.
 *
 * OPPOSITE SET POLARITY — THE ONE FACT A READER OF EITHER MEMBER ALONE WILL GET WRONG. Both
 * members receive the same `existingOptionGroupIDList` argument and filter on it with INVERTED
 * predicates: `findUnusedOptions` keeps rows whose group IS IN the list
 * [`model/dao/OptionDAO.cfc:L68`], while `findUnusedOptionGroups` keeps rows whose group is NOT IN
 * it [`model/dao/OptionDAO.cfc:L107`]. One token of difference, and the two members answer
 * opposite questions about the same input — see each member for the divergent empty-input outcome
 * that follows from it. Normalising the pair into one polarity is the single most likely way to
 * break this port silently.
 *
 * TODO(parity): that asymmetry is CARRIED, not reconciled. It is preserved behaviour rather than
 * an inconsistency awaiting cleanup, and it is marked so a later reader who notices the mismatch
 * finds a decision here instead of an oversight. AAP 0.7.3 S7 requires legacy behaviour to be
 * preserved and annotated rather than repaired, and AAP 0.8.2 Guideline 4 forbids improving
 * business logic beyond what the migration requires; the outcomes at `L68` and `L107` are
 * observable output, so making the two members agree would change results.
 *
 * Every member resolves rather than returning synchronously. The legacy members are synchronous
 * because a CFML `<cfquery>` blocks the request thread; the target reaches the database through an
 * asynchronous driver, so the whole surface is promise-returning. That is idiom, not behaviour,
 * and it is the permitted half of the Minimal Change Clause (AAP 0.8.1).
 */
export interface OptionRepository {
  /**
   * Lists the options a product may still be offered, as drop-down rows.
   *
   * THE BUSINESS RULE. A row qualifies when BOTH conditions hold: the option belongs to one of
   * the option groups already present on this product, and the option is not yet carried by any
   * SKU of this product. The first condition is the set-membership filter at
   * `model/dao/OptionDAO.cfc:L68`; the second is the correlated non-existence guard spanning
   * `model/dao/OptionDAO.cfc:L70-L81`, which rules out an option that appears in the SKU-option
   * link table `SwSkuOption` for a SKU (`SwSku`) of the given product, correlating on
   * `a.optionID = SwOption.optionID` at `L80`. The inner projection is redundant inside a
   * non-existence test but harmless [`L71-L72`]; it needs no reproduction and no repair.
   *
   * EMPTY INPUT IS LEGAL, MEANINGFUL, AND ORDINARY — AND IT RESOLVES TO AN EMPTY ARRAY. CFML
   * `<cfqueryparam ... list="true">` on an empty string yields ONE empty-string parameter, so the
   * legacy predicate at `model/dao/OptionDAO.cfc:L68` becomes `IN ('')` and matches nothing. This
   * is not a hypothetical edge: `model/entity/Product.cfc:L637` supplies the argument as
   * `structKeyList(getOptionGroupsStruct())`, and that struct [`Product.cfc:L241-L249`] is empty
   * for any product that has no option groups yet [`Product.cfc:L251-L261`], so the empty string
   * is the ordinary state of a fresh product. Implementations MUST therefore resolve `[]` rather
   * than reject, guard, or treat the case as an error. Compare
   * {@link OptionRepository.findUnusedOptionGroups}, where the identical input returns EVERY row.
   *
   * ADAPTER OBLIGATION — EMIT EXACTLY ONE PLACEHOLDER FOR AN EMPTY LIST. Splitting `''` on a
   * comma yields `['']` in TypeScript just as `list="true"` yields one empty parameter in CFML,
   * so the two agree naturally; the failure mode is "optimising" the empty case down to zero
   * placeholders, which is a syntax error at the database rather than a compile error here.
   *
   * ADAPTER OBLIGATION — BIND IN STATEMENT ORDER, WHICH IS THE REVERSE OF THIS SIGNATURE. The
   * legacy signature declares `productID` first [`model/dao/OptionDAO.cfc:L52`] and
   * `existingOptionGroupIDList` second [`L53`], but the statement binds them the other way round:
   * the group list at `L68` comes BEFORE the product identifier at `L78`. The signature order is
   * preserved here exactly as AAP 0.4.2.6 specifies, and because
   * `model/entity/Product.cfc:L637` already calls positionally in that order. TR-4 requires the
   * bound parameter array to follow the legacy STATEMENT sequence, so an adapter that assembles it
   * in signature order produces a silently wrong result — two same-typed strings swapped, which no
   * type check can catch. This warning is recorded here because this is the file the adapter
   * author reads.
   *
   * TODO(parity): the divergence between the two orders is CARRIED, not tidied. Reordering the
   * parameters of this member to match the binding sequence would look like a harmless
   * simplification and would break the two positional call sites that already exist — the legacy
   * one at `model/entity/Product.cfc:L637` and the target surface AAP 0.4.2.6 mandates. Reordering
   * the bindings instead would violate TR-4. Both orders are therefore fixed, and only the mapping
   * between them is the adapter's responsibility.
   *
   * ROW ORDER IS OBSERVABLE. `model/dao/OptionDAO.cfc:L82-L84` orders by the option group's name
   * and then the option's name, and callers render the array directly as drop-down entries, so
   * that sequence is part of the output. No sorting parameter is offered, because the legacy
   * offers none (AAP 0.7.3, S9).
   *
   * TR-1 TIGHTENING, RECORDED. The legacy member declares `returntype="any"`
   * [`model/dao/OptionDAO.cfc:L51`] yet demonstrably resolves to an array of two-field rows
   * [`L87-L89`, `L91`], and `model/service/OptionService.cfc:L72` independently declares
   * `array` for the same value. The target narrows that to `Promise<UnusedOptionRow[]>`.
   *
   * @param productID - Identifier of the product whose SKUs determine what counts as already
   * used. Required, exactly as at `model/dao/OptionDAO.cfc:L52`.
   * @param existingOptionGroupIDList - Comma-delimited list of the option-group identifiers
   * already present on that product. Required, exactly as at `model/dao/OptionDAO.cfc:L53`. Kept
   * as a delimited string rather than modernised to an array: the empty-string case above is
   * load-bearing, and an array type would invite a caller to pass an empty array, which in turn
   * invites the zero-placeholder syntax error described above.
   * @returns The qualifying options as drop-down rows, ordered as described. Possibly empty;
   * never null or undefined.
   */
  findUnusedOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<UnusedOptionRow[]>;

  /*
   * ⛔ A WINDOWED COMPANION — `findUnusedOptionsBounded(window, productID, existingOptionGroupIDList)`
   * — WAS DECLARED HERE AND HAS BEEN WITHDRAWN, together with its sibling below. Both took a
   * caller-stated `BoundedReadWindow`, appended `limit ? offset ?` to the shared predicate and
   * answered a `BoundedReadResult<…>`.
   *
   * ⭐ THE GROUND IS NO CALLER, AND IT IS THE SECOND HALF OF A WITHDRAWAL THAT STARTED AT THE SERVICE.
   * `OptionService` declares exactly the seven members AAP §0.4.1.8 fixes — the three from
   * `model/service/OptionService.cfc` plus the four the legacy synthesized — so
   * `getUnusedProductOptionsBounded` and `getUnusedProductOptionGroupsBounded` were withdrawn from it.
   * With those gone, nothing in `src/services/**`, `src/handlers/**` or `src/integrations/**` could
   * reach these two declarations. A port member no production path can reach is not a capability: it is
   * runtime weight in every emitted artifact, because a method on an INSTANTIATED class is not
   * tree-shaken the way a module-level function is. `./SkuRepository` and `./ProductRepository` record
   * the identical withdrawal of their own windowed searches.
   *
   * ⚠️ BOTH UNBOUNDED MEMBERS ARE UNCHANGED, INCLUDING THE TWO THINGS EASIEST TO LOSE. The `IN` /
   * `NOT IN` polarity split survives, the empty-list case still emits exactly one placeholder bound to
   * the empty string — resolving to NO options here and to EVERY option group in the sibling — and the
   * bind order stays statement order rather than argument order. Nothing about which rows qualify or
   * the order they arrive in was touched by this removal (AAP §0.8.2 Guideline 4, §0.7.3 S9).
   *
   * ⭐ AND NO INTERNAL CALLER WAS INVENTED TO KEEP THEM ALIVE. That would have added a call path the
   * legacy has no counterpart for. The window vocabulary still exists at `./BoundedRead` and the
   * handler-edge reader that parses one still exists at `src/handlers/httpResponse.ts`, so re-declaring
   * a bounded member later is additive work against a written-down contract.
   */

  /**
   * Lists the option groups not yet present on a product, as drop-down rows.
   *
   * THE BUSINESS RULE, AND ITS INVERTED POLARITY. Every option group whose identifier is absent
   * from the supplied list qualifies — `model/dao/OptionDAO.cfc:L107` filters with NOT IN, the
   * mirror image of the IN filter at `L68` used by
   * {@link OptionRepository.findUnusedOptions}. Note what this member does NOT do: it takes no
   * product identifier and consults neither `SwSku` nor `SwSkuOption`, so it applies no
   * correlated non-existence guard at all. "Unused" therefore means something narrower here than
   * in the sibling member — not present on the product, as judged solely from the list the caller
   * supplied. The scope is the whole `SwOptionGroup` table [`L105`], which is faithful to the
   * legacy and is not a missing filter awaiting repair (AAP 0.8.2, Guideline 4).
   *
   * EMPTY INPUT IS LEGAL AND MEANINGFUL — AND IT RESOLVES TO EVERY ROW. With an empty list the
   * legacy predicate becomes `NOT IN ('')`, which every real identifier satisfies, so the result
   * is ALL option groups. This is the exact opposite outcome to
   * {@link OptionRepository.findUnusedOptions} for the identical input, and it is correct: a
   * product with no option groups yet has none used, so all of them are available to add. That
   * empty string arrives by the ordinary path, `structKeyList(getOptionGroupsStruct())` at
   * `model/entity/Product.cfc:L644`. Implementations MUST NOT guard, short-circuit or special-case
   * it, and MUST still emit exactly one placeholder bound to the empty string.
   *
   * ROW ORDER IS OBSERVABLE. `model/dao/OptionDAO.cfc:L108-L109` orders by the option group's
   * name — one sort term, where the sibling member has two.
   *
   * TR-1 TIGHTENING, RECORDED — AND MORE THAN FOR THE SIBLING MEMBER. `model/dao/OptionDAO.cfc:L94`
   * declares NEITHER `returntype` NOR `access`, so the legacy member is public only by CFML
   * default and its value is entirely untyped, yet it demonstrably resolves to an array of
   * two-field rows [`L112-L114`, `L116`] and `model/service/OptionService.cfc:L76` declares
   * `array` for it. The target narrows that to `Promise<UnusedOptionGroupRow[]>` and states the
   * member's visibility explicitly by declaring it on this port.
   *
   * @param existingOptionGroupIDList - Comma-delimited list of the option-group identifiers
   * already present on the product. Required, exactly as at `model/dao/OptionDAO.cfc:L95`, and
   * kept as a delimited string for the reason given on {@link OptionRepository.findUnusedOptions}.
   * @returns The qualifying option groups as drop-down rows, ordered by name. Possibly empty;
   * never null or undefined.
   */
  findUnusedOptionGroups(existingOptionGroupIDList: string): Promise<UnusedOptionGroupRow[]>;

  /*
   * ⛔ `findUnusedOptionGroupsBounded(window, existingOptionGroupIDList)` STOOD HERE AND HAS BEEN
   * WITHDRAWN. The full reasoning is recorded once, at the withdrawal of its sibling above, and is not
   * restated: no production path could reach either member after `OptionService` was restored to its
   * seven declared members, and an unreachable method on an instantiated class is bundle weight rather
   * than capability. The unbounded member above — `NOT IN`, one sort term, whole-table by design for an
   * empty list — is untouched.
   */
}
