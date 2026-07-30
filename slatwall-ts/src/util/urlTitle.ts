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
 * hexagonal leaf and stays entirely free of imports (AAP 0.7.3, S4). The wider boundary interface
 * for application-side uniqueness checking is `UniquePropertyPort` (AAP 0.4.1.6, legacy origin
 * `org/Hibachi/HibachiDAO.cfc:L130-L146`, `isUniqueProperty()`, IR-5) and its concrete
 * implementation belongs to `src/adapters/mysql/**`; the narrower probe this particular algorithm
 * actually used is the one cited above. Second, the probe is NOT generalised to an arbitrary
 * column, because both legacy call sites pin that argument to the single literal `"urlTitle"`
 * [`DataService.cfc:L62`, `L67`] — and inventing generality the source does not have is forbidden
 * by AAP 0.7.3, S9.
 *
 * Statement text and identifier handling stay out of this module altogether. Safe identifier
 * treatment for `tableName` is the adapter's responsibility (AAP 0.4.1.7 and 0.4.3.4).
 */
export type UniqueValueProbe = (tableName: string, value: string) => Promise<boolean>;

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
 * @param isValueAvailable - Uniqueness probe; see {@link UniqueValueProbe} for its polarity.
 * @returns The unique URL title. Always a string, possibly empty; never null or undefined.
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

  // `DataService.cfc:L60`.
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

  // Unbounded by design, exactly as `DataService.cfc:L64`. No ceiling on the number of probes and
  // no generated fallback identifier is introduced: Guideline 4 forbids the enhancement, and AAP
  // 0.7.3 S9 forbids inventing the bound that such a ceiling would demand.
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
  //     `'A -- B'` yields `'a---b'`.
  //   * Digits and existing hyphens pass through untouched.
  //   * No maximum length is imposed. The legacy imposes none, and the bound on the underlying
  //     storage is the database's concern and the adapter's.
  return returnTitle;
}
