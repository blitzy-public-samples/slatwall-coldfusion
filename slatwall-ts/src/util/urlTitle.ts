/**
 * Unique URL-title generation for the extracted Catalog slice.
 *
 * Legacy origin: `model/service/DataService.cfc:L53-L71` (`createUniqueURLTitle`). ONLY that
 * 19-line span is in scope. The legacy component runs to 203 lines and AAP 0.2.1.8 lists it as
 * reference-only while carrying exactly one member across: "`createUniqueURLTitle()` [L53-L71]
 * — ported verbatim as a utility; the rest of the file is out of scope".
 * `loadDataFromXMLDirectory` (L73 onward) and every other member of that component are therefore
 * deliberately absent here.
 *
 * `DataService` itself is NOT recreated. AAP 0.6.3.1 and 0.6.3.3 classify `dataService` as a
 * genuine but NARROW dependency of the product and brand services — the only member either one
 * ever calls is `createUniqueURLTitle` — so AAP 0.4.1.8 narrows that dependency to "the ported
 * urlTitle utility, not a whole service". This subtree consequently has no `DataService` class,
 * no data-access component of its own and no XML loader.
 *
 * Behaviour is preserved exactly; only the idiom changes. That is the two-part Minimal Change
 * Clause of AAP 0.8.1 — minimal in functional scope, explicitly NOT minimal in idiom — and the
 * dividing line between its two halves is behaviour. Every judgement call the translation
 * required is annotated inline with the legacy locator that justifies it (AAP 0.8.2, Guideline 6).
 */

/**
 * Probes whether a candidate `urlTitle` value is still free on a given table.
 *
 * POLARITY — the single highest-risk semantic in this port, so it is stated ahead of anything
 * else. Resolving `true` means the value IS AVAILABLE: no existing row holds it. Resolving
 * `false` means the value is already TAKEN. That is precisely the contract of the legacy probe at
 * `model/dao/DataDAO.cfc:L115-L131`, which yields `false` on a non-zero record count [L126-L127]
 * and `true` otherwise [L130], and it is what makes the `while (!unique)` loop at
 * `model/service/DataService.cfc:L64` terminate.
 *
 * Inverting the polarity is silent — neither a compile error nor a type error results. The
 * observable consequence is one of two failures: the loop never runs, so duplicate `urlTitle`
 * values reach the database; or every candidate is reported taken, so the loop never ends.
 * Implementations MUST resolve `true` for "still free".
 *
 * INJECTION (AAP 0.8.2, Guideline 6). The legacy component reached its collaborator through the
 * DI/1 property declared at `model/service/DataService.cfc:L51` and the `getDataDAO()` accessor
 * synthesised for it, resolved by name at runtime. AAP 0.4.3.1 (R1) replaces DI/1 property
 * injection with explicit parameters, and AAP 0.4.3.2 (R2) replaces dynamic string lookup with
 * typed references, so the collaborator arrives here as an ordinary injected function — no
 * service locator, no container lookup, no module-level singleton (AAP 0.7.3, S3).
 *
 * Two deliberate limits on that abstraction. First, no port module is imported: `src/util/` is a
 * hexagonal leaf and this file has NO IMPORTS AT ALL (AAP 0.7.3, S4).
 *
 *   ⚠️ THAT IS AGAIN LITERALLY TRUE, AND THE ROUND TRIP IS RECORDED RATHER THAN TIDIED AWAY. An
 *   earlier checkpoint added a finite attempt budget with a deterministic raise, which required
 *   importing the shared error type and made this sentence read "its ONLY import is `../errors/`".
 *   The budget has since been removed — see the unbounded-loop note below — so the import went with
 *   it and the file is once more a pure function of its three arguments. The distinction that matters
 *   for S4 never changed: NO port, adapter, service, config, handler or integration module is imported
 *   here, and none ever should be, because those are the edges that would make a leaf into a layer.
 *   Should this file ever legitimately need to raise, `../errors/` is the one sibling leaf it may
 *   reach for — `../validation/Validator` and `../domain/base/populate` both name it for the same
 *   reason — and a bare `Error` would not be an acceptable substitute, because
 *   `src/handlers/httpResponse` could not translate it into a stable public failure.
 *
 * The wider boundary interface for application-side uniqueness checking is `UniquePropertyPort`
 * (AAP 0.4.1.6, legacy origin `org/Hibachi/HibachiDAO.cfc:L130-L146`, `isUniqueProperty()`, IR-5),
 * and its concrete implementation belongs to `src/adapters/mysql/**`; the narrower probe this
 * particular algorithm actually used is the one cited above. Second, the probe is NOT generalised to
 * an arbitrary column, because both legacy probe sites pin that argument to the single literal
 * `"urlTitle"` [`DataService.cfc:L62`, `L67`] — and inventing generality the source does not have is
 * forbidden by AAP 0.7.3, S9.
 *
 * Statement text and identifier handling stay out of this module altogether. Safe identifier
 * treatment for `tableName` is the adapter's responsibility (AAP 0.4.1.7 and 0.4.3.4).
 */
export type UniqueValueProbe = (tableName: string, value: string) => Promise<boolean>;

/* ================================================================================================
 * TODO(parity) `model/service/DataService.cfc:L64` — THE PROBE LOOP IS UNBOUNDED, AND THAT IS
 * CARRIED OVER RATHER THAN REPAIRED
 * ================================================================================================
 * `:L64` is `while(!unique)` with no ceiling. Every iteration issues a database read through the
 * injected probe, so a value that keeps colliding keeps issuing round trips — indefinitely. In a
 * persistent CFML application that was a slow request; in a stateless invocation it is unbounded I/O
 * against a shared database, and a caller cannot distinguish it from a hang. The exposure is real and
 * it is recorded here so a reader meets a decision rather than an oversight.
 *
 * ⛔ IT IS STILL NOT BOUNDED HERE, AND THE HISTORY OF THAT IS WORTH STATING PLAINLY BECAUSE THIS FILE
 * ONCE DID BOUND IT. A finite attempt budget with a deterministic raise was added at an earlier
 * checkpoint, on the strength of a review suggestion, and it has been REMOVED. Three authorities
 * converge against it and none for it:
 *
 *   1. This file's own frozen build specification, verbatim: "The loop is unbounded, exactly as at
 *      L64. Do not add a maximum-attempts ceiling, a retry cap, a timeout, an AbortSignal, or a
 *      fallback that appends a UUID."
 *   2. AAP 0.8.2 Guideline 4 — "Do not enhance or optimize business logic beyond what the migration
 *      requires" — and AAP IR-9, which carries defects across as flagged annotations with EXACTLY ONE
 *      declared exception: D18, the importer's SQL parameterization, which belongs to
 *      `../adapters/mysql/MySqlProductRepository` and is the only hardening this port is authorised
 *      to perform (AAP 0.6.7.7).
 *   3. AAP 0.7.3 S9 — invent nothing the source does not state. The legacy states no ceiling, so
 *      every possible value of one is a fabricated number. Passing the fabrication to the caller as a
 *      required argument relocated the invention; it did not avoid it.
 *
 * WHAT WAS LOST BY REMOVING IT, STATED HONESTLY: a pathologically colliding title now loops as long
 * as the legacy would have. WHAT WAS REGAINED: a call that succeeds does so for exactly the legacy's
 * reasons, and no call fails for a reason the legacy had no counterpart for. A bounded loop changed
 * the failure surface of a member whose contract is `returntype="string"` — it could raise where the
 * legacy always returned — and that is a behavioural difference, not a neutral safeguard.
 *
 * IF A BOUND IS EVER WANTED, IT BELONGS OUTSIDE THIS ALGORITHM. An invocation-level deadline, or a
 * database-side unique constraint the adapter reports, bounds the work without editing the ported
 * member or fabricating a suffix the legacy never produced. Neither is in scope here, and neither is
 * implied to be owed.
 * ============================================================================================== */

/**
 * Derives a URL title for `titleString` and appends a numeric suffix until the value is free.
 *
 * The positional parameter order `(titleString, tableName)` is preserved exactly as declared at
 * `model/service/DataService.cfc:L53`; the injected collaborator is appended LAST so the legacy
 * order is left undisturbed. `tableName` is typed plainly as `string` and is deliberately NOT
 * narrowed to a union or an enum: the callers pass three distinct literals — at
 * `model/service/ProductService.cfc:L269`, `L297` and `L299`, and at
 * `model/service/BrandService.cfc:L70` and `L72` — so any narrower type would break the
 * product-type calls outright.
 *
 * @param titleString - The human-readable title to derive a URL title out of.
 * @param tableName - The table the candidate value must be unique on.
 * @param isValueAvailable - Uniqueness probe; see {@link UniqueValueProbe} for its polarity. It is
 *   appended LAST so the legacy positional order `(titleString, tableName)` at
 *   `model/service/DataService.cfc:L53` stays undisturbed, and it is the LAST parameter this member
 *   takes: there is deliberately no fourth. See the unbounded-loop note above.
 * @returns The unique URL title. Always a string, possibly empty; never null or undefined — matching
 *   the `returntype="string"` the legacy member declares, which is the reason this function has no
 *   failure path of its own. Whatever the probe rejects with propagates unchanged.
 */
export async function createUniqueURLTitle(
  titleString: string,
  tableName: string,
  isValueAvailable: UniqueValueProbe,
): Promise<string> {
  // Collision counter, initialised to 1 at `model/service/DataService.cfc:L55`.
  //
  // TODO(parity): the counter is PRE-incremented. `addon++` at `DataService.cfc:L65` runs BEFORE
  // the suffix is interpolated at `L66`, so the first collision suffix is `-2`, the second is
  // `-3`, and `-1` is never produced for any input whatsoever. This is deliberate behavioural
  // parity, NOT an off-by-one defect awaiting repair: the suffix sequence is observable output,
  // and AAP 0.8.2 Guideline 4 — "Do not enhance or optimize business logic beyond what the
  // migration requires" — forbids correcting it. Initialising to 2, post-incrementing after the
  // suffix is built, or starting at 0 would each change that observable output.
  let addon = 1;

  // Slug transformation — `DataService.cfc:L57-L58`, reproduced step for step.
  //
  // THE ORDER IS LOAD-BEARING. L57 nests the calls as `reReplace(lcase(trim(...)), ...)`, so the
  // whitespace trim is innermost and runs first, then the case fold, then the strip; the space
  // collapse at L58 then operates on the ALREADY-STRIPPED string. Swapping those last two steps
  // changes observable output. For the input `'A & B'` the legacy order discards the ampersand
  // and leaves both of its neighbouring spaces behind (`'a  b'`), which collapse to `'a-b'`;
  // collapsing first would instead give `'a-&-b'` and then `'a--b'`. Those are two different URL
  // titles, which is why the sequence is reproduced rather than tidied.
  //
  // The stripping class is exactly `[^a-z0-9 \-]`. It retains the literal space and the literal
  // hyphen and discards everything else — underscores, punctuation, accented letters and every
  // other non-ASCII code point. It carries no `i` flag, matching CFML `reReplace`, which is
  // case-sensitive; the case-insensitive variant `reReplaceNoCase` is NOT what L57 uses.
  //
  // The collapse class is exactly `[ ]+`, a single-space class. It is deliberately not `\s+`,
  // which would additionally match tab, newline, carriage return, form feed and Unicode spaces
  // and so would no longer be the algorithm being ported. Both replacements are global, matching
  // the `"all"` scope argument the legacy passes to `reReplace` in both calls.
  let urlTitle = titleString
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 \-]/g, '');
  urlTitle = urlTitle.replace(/[ ]+/g, '-');

  let returnTitle = urlTitle;

  // The probe runs ONCE BEFORE the loop [`DataService.cfc:L62`] and then again at the END of each
  // iteration [`L67`]. A candidate that collides with nothing therefore comes back unchanged,
  // with no suffix at all — which is why this is not restructured as a `do...while`.
  //
  // The probe is a database read, and that read is the only reason this function is asynchronous
  // (AAP 0.7.3, S8 — no execution-model mismatch beyond that plain fact is claimed for this
  // file). The awaits are inherently sequential: each candidate is built using the previous
  // probe's result, so they cannot be issued in parallel.
  let unique = await isValueAvailable(tableName, returnTitle);

  // `DataService.cfc:L64-L68`, reproduced with NO ceiling — see the unbounded-loop note above the
  // probe type for why the bound that briefly lived here was removed rather than kept.
  //
  // The body is the legacy's three statements in the legacy's order: pre-increment the counter
  // [`L65`], build the suffixed candidate [`L66`], probe it [`L67`]. Nothing else belongs in here.
  // There is no attempt counter, no elapsed-time check, no pause between probes and no fabricated
  // fallback title, because a value this function returned without the probe approving it would
  // either violate the unique constraint at the adapter or silently take a title the caller never
  // asked for.
  while (!unique) {
    addon++;
    returnTitle = `${urlTitle}-${addon}`;
    unique = await isValueAvailable(tableName, returnTitle);
  }

  // `DataService.cfc:L70`. Always a string — never null and never undefined — matching the
  // `returntype="string"` declared at L53 (AAP 0.7.3, S1).
  //
  // Edge cases that reach this point untouched. Each follows mechanically out of L57-L58 and
  // L62-L70, and each is preserved rather than tidied (Guideline 4):
  //   * The trim runs once and only BEFORE the strip, so a discarded leading or trailing
  //     character leaves its space behind, and that space collapses into a leading or trailing
  //     hyphen: `'! Foo'` yields `'-foo'` and `'Foo !'` yields `'foo-'`. The result is neither
  //     re-trimmed nor stripped of edge hyphens.
  //   * An input made up entirely of discarded characters reduces to the empty string, and the
  //     empty string is probed and returned as-is. No error is raised, no placeholder title is
  //     substituted and no identifier is generated in its place.
  //   * Hyphen runs already present in the input survive, because only spaces are collapsed:
  //     `'A -- B'` yields `'a----b'` — FOUR hyphens, being the two already present plus one for each
  //     of the two collapsed single-space runs flanking them. (This worked example previously read
  //     `'a---b'`, which is arithmetically wrong for this input and is corrected here rather than
  //     left standing; the behaviour it describes is unchanged and is pinned by a test.)
  //   * Digits and existing hyphens pass through untouched.
  //   * No maximum length is imposed. The legacy imposes none, and the bound on the underlying
  //     storage is the database's concern and the adapter's.
  return returnTitle;
}
