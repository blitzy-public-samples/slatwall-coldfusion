/**
 * Setting-driven date and title formatting for the extracted Slatwall Catalog slice.
 *
 * SCOPE — exactly two setting keys, and nothing else:
 *   - `globalDateFormat`   drives `formatDate`
 *   - `productTitleString` drives `replaceStringTemplate`
 *
 * Every other key the in-scope entities read belongs elsewhere: image sizing and paths to
 * `ImagePathPort`, currency to `PricingPort`. There is deliberately no currency formatter here,
 * because every currency-derived calculated member is outside this slice.
 *
 * Legacy origins, reference only:
 *   - model/entity/Sku.cfc:L459-L480 — `getNextEstimatedAvailableDate()`, holding the only three
 *     `globalDateFormat` reads in the in-scope entity set, each of the shape
 *     `dateFormat(<date>, setting('globalDateFormat'))`.
 *   - model/entity/Product.cfc:L540-L545 — `getTitle()`, which interpolates `productTitleString`.
 *   - org/Hibachi/HibachiUtilityService.cfc:L70-L101 — the token substitution `getTitle()` uses.
 *   - model/entity/HibachiEntity.cfc:L128-L131 — `setting()`, the declared origin of
 *     `SettingResolverPort`.
 *
 * THIS MODULE RESOLVES NO SETTINGS. Both functions receive an already-resolved value as a plain
 * parameter, so the legacy dynamic `getService("settingService")` and
 * `getService("hibachiUtilityService")` lookups disappear rather than being re-created here.
 *
 * NO IMPORTS. `src/util/` is a leaf of the hexagonal layering: it may not reach into any other layer
 * and it introduces no third-party dependency. It reads no environment variable, since src/config/
 * owns that.
 *
 * BOTH EXPORTS ARE SYNCHRONOUS, and that is a decision rather than an accident. `SettingResolverPort`
 * is declared synchronous so that no caller in this slice can come to depend on the background
 * completion of the out-of-scope setting updater flagged as mismatch M8. Formatting inherits that
 * synchrony: neither function is `async` and neither returns a `Promise`.
 *
 * NEITHER SETTING IS SEEDED. Neither key appears among the rows in
 * config/dbdata/SlatwallSetting.xml.cfm, so both fall back to metadata defaults declared in the
 * out-of-scope model/service/SettingService.cfc (L163 and L193). This module therefore hardcodes
 * neither default — no fallback parameter, no `??` default, no constant. Recording which keys fall
 * back is the setting resolver's job; supplying a value here would invent one.
 *
 * NOT IN SCOPE HERE. The Google product feed builds its sale-price effective-date range from
 * hard-coded literal masks plus a time-of-day and a timezone offset
 * (integrationServices/google/views/feed/product.cfm:L30), and at :L18 reads the persisted
 * calculated title rather than `getTitle()`. That assembly belongs to the feed builder, which may
 * legitimately call `formatDate` with a literal mask — hence the case-insensitive matching below.
 */

/**
 * English month names, indexed by `Date.prototype.getMonth()` (0-11).
 *
 * Hard-coded rather than produced by the runtime's locale-sensitive date-formatting APIs. Those
 * resolve against the host's default locale and bundled ICU data, so identical input would render
 * differently on a developer machine and in the Lambda runtime, making output an environment
 * property. No locale is pinned anywhere in the repository, so choosing one would be invention
 * (S9). English names are what the legacy ColdFusion/Railo server emitted for these masks, which
 * makes them the faithful choice. No locale-sensitive API is referenced anywhere in this module.
 *
 * The three-letter `mmm` form is the first three characters of the full name for all twelve months,
 * which is exactly what CFML emits, so no second table is required.
 */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * English weekday names, indexed by `Date.prototype.getDay()` (0-6, Sunday first).
 *
 * Hard-coded for the same reasons as `MONTH_NAMES`. The three-letter `ddd` form is likewise the
 * first three characters of the full name for all seven weekdays.
 */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Recognised mask tokens, ordered longest-first within each letter family so that the scan always
 * takes the greediest match at a given position: `dddd` before `ddd` before `dd` before `d`, and
 * likewise for the month and year families. Entries are lower-case because matching is
 * case-insensitive.
 */
const MASK_TOKENS = ['dddd', 'ddd', 'dd', 'd', 'mmmm', 'mmm', 'mm', 'm', 'yyyy', 'yy'] as const;

type MaskToken = (typeof MASK_TOKENS)[number];

/** Width of the zero-padded two-character mask tokens (`yy`, `mm`, `dd`). */
const PADDED_TOKEN_WIDTH = 2;

/** Number of characters CFML's `mmm` and `ddd` masks emit. */
const ABBREVIATION_LENGTH = 3;

/**
 * Reads the English month name for `value`.
 *
 * The `undefined` branch cannot fire for a valid `Date`: `getMonth()` is specified to return an
 * integer in 0-11, so the lookup always hits one of the twelve entries. The branch exists to
 * discharge `noUncheckedIndexedAccess`, which types every indexed read as `T | undefined`. That is
 * a type-system obligation, not validation of the caller's input — S1 requires the file to be fixed
 * rather than the compiler configuration weakened, so no non-null assertion, cast or suppression
 * comment is used to sidestep it.
 *
 * The one way to reach the branch is an invalid `Date`, whose accessors yield `NaN`. Raising is then
 * the honest outcome: no substitute name may be fabricated (S9), and no invalid-`Date` pre-check is
 * added either, because that would be an enhancement beyond what the migration requires
 * (Guideline 4). Note that the year and numeric-month tokens do not index anything, so they render
 * an invalid date as `NaN` rather than raising — a consequence of adding no validation, not a
 * decision taken here.
 */
function monthName(value: Date): string {
  const monthIndex = value.getMonth();
  const name = MONTH_NAMES[monthIndex];

  if (name === undefined) {
    throw new RangeError(
      `Unsupported month index ${String(monthIndex)}: getMonth() yields 0-11 for any valid Date.`,
    );
  }

  return name;
}

/**
 * Reads the English weekday name for `value`.
 *
 * The `undefined` branch behaves exactly as in `monthName`: it cannot fire for a valid `Date`,
 * because `getDay()` is specified to return an integer in 0-6, and it exists only to discharge
 * `noUncheckedIndexedAccess`.
 */
function weekdayName(value: Date): string {
  const dayIndex = value.getDay();
  const name = WEEKDAY_NAMES[dayIndex];

  if (name === undefined) {
    throw new RangeError(
      `Unsupported day index ${String(dayIndex)}: getDay() yields 0-6 for any valid Date.`,
    );
  }

  return name;
}

/**
 * Renders one recognised mask token.
 *
 * Local-time accessors (`getFullYear`, `getMonth`, `getDate`, `getDay`) are used throughout, never
 * the `getUTC*` variants, and no timezone conversion is introduced. CFML's `dateFormat()` renders
 * in the ColdFusion/Railo server's local timezone; using JavaScript's local-time accessors keeps
 * the effective timezone an environment property in both systems rather than something this code
 * decides.
 *
 * The switch is exhaustive over `MaskToken`, so every reachable path returns and the union is
 * narrowed to `never` at the end of the body — which is what satisfies `noImplicitReturns` without
 * a fabricated fallback value.
 */
function renderToken(token: MaskToken, value: Date): string {
  switch (token) {
    case 'yyyy':
      return String(value.getFullYear());
    case 'yy':
      return String(value.getFullYear() % 100).padStart(PADDED_TOKEN_WIDTH, '0');
    case 'mmmm':
      return monthName(value);
    case 'mmm':
      return monthName(value).slice(0, ABBREVIATION_LENGTH);
    case 'mm':
      return String(value.getMonth() + 1).padStart(PADDED_TOKEN_WIDTH, '0');
    case 'm':
      return String(value.getMonth() + 1);
    case 'dddd':
      return weekdayName(value);
    case 'ddd':
      return weekdayName(value).slice(0, ABBREVIATION_LENGTH);
    case 'dd':
      return String(value.getDate()).padStart(PADDED_TOKEN_WIDTH, '0');
    case 'd':
      return String(value.getDate());
  }
}

/**
 * Returns the mask token beginning at `position`, or `undefined` when the character there is a
 * literal.
 *
 * The comparison lower-cases a slice of the original mask at each position rather than lower-casing
 * the whole mask once up front. Unicode case conversion is not guaranteed to preserve length —
 * U+0130 lower-cases to two code units — so indices into a lower-cased copy cannot be assumed to
 * line up with the original. Keeping every index an index into `mask` is also what allows
 * unrecognised characters to be emitted with their original case.
 */
function tokenAt(mask: string, position: number): MaskToken | undefined {
  return MASK_TOKENS.find((candidate) => {
    const slice = mask.substring(position, position + candidate.length);
    return slice.toLowerCase() === candidate;
  });
}

/**
 * Formats `value` according to a CFML-style `dateFormat` mask.
 *
 * Recognised tokens, matched case-insensitively and longest-first:
 *
 *   - `yyyy` — four-digit year
 *   - `yy`   — last two digits of the year, zero-padded
 *   - `mmmm` — full English month name
 *   - `mmm`  — three-letter English month name
 *   - `mm`   — month number 1-12, zero-padded
 *   - `m`    — month number, no leading zero
 *   - `dddd` — full English weekday name
 *   - `ddd`  — three-letter English weekday name
 *   - `dd`   — day of month, zero-padded
 *   - `d`    — day of month, no leading zero
 *
 * Every other character is copied through literally with its original case preserved, so both
 * `mmm dd, yyyy` and `YYYY-MM-DD` work, and an unrecognised literal such as `T` stays upper-case.
 *
 * IMPLEMENTED AS A SINGLE LEFT-TO-RIGHT SCAN, which is a correctness requirement rather than a
 * stylistic preference. A chain of whole-string replacements would re-scan its own output: `mmmm`
 * renders `December`, which contains an `m`, and `dddd` renders `Wednesday`, which contains a `d`,
 * so a later `m` or `d` pass would corrupt them. Scanning once and appending means emitted output
 * is never examined again.
 *
 * TRANSLATION DECISION (AAP 0.8.2 Guideline 6). The CFML mask forms behind the two out-of-scope
 * metadata defaults — `mmm dd, yyyy` for `globalDateFormat` (three-letter month) and `hh:mm tt` for
 * `globalTimeFormat` (12-hour clock with meridiem) — have no exact built-in Node/ES2022 equivalent,
 * so mask interpretation is written out explicitly here rather than delegated or silently
 * approximated. No date library is introduced (S5), and no locale-sensitive API is used.
 * `globalTimeFormat` is named only to record that divergence: it is read by none of the six
 * in-scope entities, so this module contains no time formatter and the hour, minute, second and
 * meridiem tokens are not implemented. A mask containing them is not rejected — `mm` is still read
 * as a zero-padded month and the remaining characters pass through as literals.
 *
 * DELIBERATELY NOT IMPLEMENTED — a scope boundary, not a carried defect, so it carries no
 * `TODO(parity)` marker; S7 reserves that annotation for genuinely carried legacy behaviour.
 * CFML's `dateFormat` also accepts the named masks `short`, `medium`, `long` and `full`, an era
 * token, and a single-digit-year token. None is implemented because no in-scope call site uses one:
 * the sole in-scope legacy consumer is `Sku.getNextEstimatedAvailableDate()`
 * [model/entity/Sku.cfc:L459-L480], which always passes `setting('globalDateFormat')`. A mask
 * containing an unimplemented token is not rejected; its characters simply pass through as
 * literals, which is the same contract as any other unrecognised character.
 *
 * CONSUMER BOUNDARY. That sole consumer is itself boundary-excluded: `nextEstimatedAvailableDate`
 * appears on the AAP 0.2.2.6 excluded calculated-property list, so the member is stubbed in
 * `src/domain/sku/Sku.ts`. The formatter is nonetheless provided here because AAP 0.4.1.11 mandates
 * it and TR-5 forbids quietly dropping a member whose collaborator is out of scope. The two
 * incidental defects in that legacy method — the memoization key tested at L460 but never assigned,
 * and the discarded bare expression at L474 — belong to the SKU entity port, not to this formatter,
 * and are deliberately not modelled here.
 *
 * No input validation is performed: there is no invalid-`Date` check, no range check and no
 * mask-length limit. Adding one would be an enhancement beyond what the migration requires
 * (Guideline 4) and would report a condition the legacy code never reported (S9).
 *
 * @param value The date to render, interpreted in the host's local timezone.
 * @param mask  A CFML-style mask, typically the resolved value of the `globalDateFormat` setting.
 * @returns The rendered string. An empty mask yields an empty string.
 */
export function formatDate(value: Date, mask: string): string {
  let formatted = '';
  let position = 0;

  while (position < mask.length) {
    const token = tokenAt(mask, position);

    if (token === undefined) {
      // `charAt` rather than an index read: it is typed `string`, which discharges
      // `noUncheckedIndexedAccess` on the literal path with no cast and no assertion.
      formatted += mask.charAt(position);
      position += 1;
      continue;
    }

    formatted += renderToken(token, value);
    position += token.length;
  }

  return formatted;
}

/* ------------------------------------------------------------------------------------------------
 * Template substitution
 * --------------------------------------------------------------------------------------------- */

/**
 * Resolves one `${...}` property identifier to its replacement value.
 *
 * Returning `undefined` means the identifier could not be resolved, in which case the token is left
 * in the output verbatim. Returning an empty string is a resolved value and IS substituted; the two
 * are deliberately distinct — see `replaceStringTemplate`.
 *
 * Identifiers arrive exactly as they appear in the template, including dotted forms such as
 * `brand.brandName`. Traversing a dotted identifier is the resolver's responsibility: in the legacy
 * code that work is done by `getValueByPropertyIdentifier`
 * [org/Hibachi/HibachiUtilityService.cfc:L88], which belongs to the domain layer.
 *
 * This type is exported only so that callers can type their wiring explicitly (S3).
 */
export type PropertyIdentifierResolver = (propertyIdentifier: string) => string | undefined;

/**
 * The legacy token grammar, reproduced exactly: `${`, one or more characters that are not `}`, then
 * `}` [org/Hibachi/HibachiUtilityService.cfc:L71, `reMatchNoCase("\${[^}]+}", template)`]. The
 * one-or-more quantifier is load-bearing: an empty token does not match the grammar and is
 * therefore emitted unchanged.
 *
 * Sharing one compiled pattern at module scope introduces no mutable state, because
 * `String.prototype.matchAll` constructs its own copy of the regular expression and so never
 * advances this object's `lastIndex`.
 */
const TEMPLATE_KEY_PATTERN = /\$\{[^}]+\}/g;

/** Length of the leading `${` delimiter stripped off a token when extracting its identifier. */
const TOKEN_PREFIX_LENGTH = 2;

/**
 * Substitutes every `${propertyIdentifier}` token in `template` with the value the resolver returns.
 *
 * Legacy origin: `org/Hibachi/HibachiUtilityService.cfc:L70-L101`. The sole in-scope caller is
 * `Product.getTitle()` [model/entity/Product.cfc:L540-L545], which interpolates the resolved
 * `productTitleString` setting; its result reaches `ProductService.saveProduct` as the
 * `titleString` argument to `createUniqueURLTitle` [model/service/ProductService.cfc:L269].
 *
 * FOUR LEGACY BEHAVIOURS PRESERVED EXACTLY (S7 — preserve and annotate, do not repair):
 *
 *  1. Token grammar — `${` plus one-or-more non-`}` characters plus `}` [L71]. An empty token does
 *     not match and survives unchanged.
 *  2. An unresolved identifier leaves its token verbatim. The legacy code seeds the replacement
 *     value with the token itself [L77-L78] and only blanks it when `removeMissingKeys` is true
 *     [L89-L90], which the in-scope caller never sets. An unresolved token is therefore emitted
 *     as-is, NOT as an empty string. A resolver returning an empty string has by contrast resolved
 *     the identifier, and that empty value IS substituted — hence the explicit `=== undefined`
 *     test rather than a falsy check, which would wrongly conflate the two.
 *  3. Replacement scope is every occurrence [L97 passes `"all"`], so a token appearing twice is
 *     substituted in both places.
 *  4. Dotted identifiers are handed to the resolver untouched. The legacy object branch delegates
 *     to `getValueByPropertyIdentifier` [L88], and the metadata default for `productTitleString`
 *     contains such an identifier, so splitting or traversing here would duplicate work the domain
 *     layer owns.
 *
 * The identifier is extracted with `slice`, which is exactly equivalent to the legacy
 * `replace(replace(token, "${", ""), "}", "")` [L80]: a matched token has exactly one leading `${`
 * and exactly one trailing `}`, because the character class excludes `}`, so those
 * single-occurrence replacements can only ever strip the two delimiters.
 *
 * Substitution uses the replacer-function form of `replaceAll`, not the string form. Given a string
 * replacement, JavaScript interprets the `$&`, `$$` and `$n` substitution patterns inside the
 * replacement, whereas CFML's `replace(..., "all")` [L97] is a plain literal substring replacement
 * with no such syntax — pattern substitution belongs to `reReplace()`. Returning the value through
 * a replacer function keeps it verbatim, preserving legacy output exactly for values containing a
 * dollar sign.
 *
 * TRANSLATION DECISION 1 (AAP 0.8.2 Guideline 6) — the legacy signature
 * `(template, object, formatValues = false, removeMissingKeys = false)` is narrowed here to
 * `(template, resolve)`:
 *
 *   - The `object` parameter becomes an injected resolver. `src/util/` may not import
 *     `src/domain/**` (S4), and dotted-identifier resolution is `getValueByPropertyIdentifier`'s
 *     job, which the domain layer owns. This also collapses the legacy struct branch [L81-L82] and
 *     object branch [L83-L88] into a single injected function, leaving the caller — the layer that
 *     properly owns the decision — to determine how an identifier resolves (AAP 0.4.3.2, R2:
 *     dynamic string lookup becomes a typed collaborator).
 *   - Both boolean flags are omitted because the only in-scope caller passes neither, so
 *     `formatValues = false` and `removeMissingKeys = false` are the only in-scope behaviours.
 *     Carrying parameters no in-scope caller exercises would be invention (S9). The practical
 *     consequences are precisely those legacy defaults: unresolved tokens are left verbatim rather
 *     than blanked, and resolved values arrive unformatted.
 *   - TR-1 is NOT violated by this narrowing. TR-1 governs the public method name, arity and
 *     argument order of every in-scope SERVICE member — the 28 public members of ProductService,
 *     SkuService, BrandService and OptionService. `replaceStringTemplate` is `org/Hibachi/**`
 *     framework code held as REFERENCE only, and AAP 0.8.3.2 directs that the framework be treated
 *     as an extraction boundary that is never carried forward. The legacy member name is
 *     nevertheless kept so the port stays traceable to its origin.
 *
 * TRANSLATION DECISION 2 (Guideline 6) — the legacy two-pass structure is collapsed into one loop,
 * and the collapse is exactly equivalent rather than merely similar. Legacy pass one builds a
 * `replacementArray` of key/value pairs [L75-L94]; pass two applies them in order against the
 * accumulating `returnString` [L96-L98]. Each replacement value depends only on its identifier, by
 * way of the resolver, and never on the accumulating string, so computing a value immediately
 * before applying it cannot change what that value is. The application order is likewise unchanged:
 * token order in both shapes. The two structures therefore produce identical output, including the
 * case in which a substituted value happens to contain a token that a later iteration also
 * replaces — both apply their replacements against the accumulating string and so behave the same
 * way. Iterating the original `template` also reproduces the legacy behaviour of resolving once per
 * matched occurrence, so a repeated token invokes the resolver as many times as it appears.
 *
 * @param template The template to interpolate, typically the resolved `productTitleString` setting.
 * @param resolve  Resolves an identifier to its value; `undefined` leaves the token verbatim.
 * @returns The interpolated string.
 */
export function replaceStringTemplate(
  template: string,
  resolve: PropertyIdentifierResolver,
): string {
  let returnString = template;

  for (const match of template.matchAll(TEMPLATE_KEY_PATTERN)) {
    const token = match[0];
    const value = resolve(token.slice(TOKEN_PREFIX_LENGTH, -1));

    if (value === undefined) {
      continue;
    }

    returnString = returnString.replaceAll(token, () => value);
  }

  return returnString;
}

/* ==================================================================================================
 * EXACT DECIMAL — THE `ormtype="big_decimal"` VALUE TYPE (F07)
 * ==================================================================================================
 * ⭐ WHY THIS SECTION EXISTS, AND WHAT WAS WRONG BEFORE IT DID.
 * Four catalog columns are declared `ormtype="big_decimal"`: `listPrice`, `price` and `renewalPrice` at
 * [model/entity/Sku.cfc:L55-L57], and `calculatedSalePrice` at [model/entity/Product.cfc:L62].
 * Hibernate mapped every one of them to a Java `BigDecimal` — exact, arbitrary precision. An IEEE-754
 * double is neither, and it has 53 bits of significand, so `9007199254740993.01` cannot be held in one.
 *
 * The port used to type those four fields `number`. `src/adapters/mysql/rowMappers.ts` compensated on the
 * READ side by refusing any stored value whose digits could not survive a round trip through a double —
 * a genuinely good check — but the WRITE side did the exact conversion the read side refused to accept:
 * a legacy-valid value arriving as text was passed through `Number(...)` before it was bound. The two
 * halves therefore disagreed. A price could be written lossily and then refused on the way back, and
 * nothing anywhere reported it: no compile error, no warning, no failing test. Rounding a monetary
 * amount is the least acceptable place for a silent divergence.
 *
 * ⭐ THE FIX IS TO STOP CONVERTING. {@link ExactDecimal} is the DIGITS, carried as text, from the driver
 * through the domain to the bind site and back. `mysql2` binds a string to a `DECIMAL` column without
 * reinterpreting it, and the pool is configured (`src/config/database.ts`) with `decimalNumbers: false`,
 * `supportBigNumbers` and `bigNumberStrings`, so a `DECIMAL` always ARRIVES as text too. Nothing in the
 * round trip needs a floating-point step, so nothing here takes one.
 *
 * ⚠️ SCALE IS PRESERVED VERBATIM, AND NO SCALE IS EVER IMPOSED. A stored `100.00` stays `'100.00'`. That
 * is not a formatting choice: this repository DECLARES no scale anywhere — the four properties stop at
 * `ormtype="big_decimal"`, the `Sw*` DDL is not in the repository at all (AAP §0.8.4.1), no key in
 * `src/ports/SettingResolverPort.ts` supplies a decimal-places value, and the legacy feed view applies
 * no `numberFormat` or mask. Inventing two decimal places would be a fabricated constant (AAP §0.7.3
 * standard 9, IR-12). Preserving what the database returned invents nothing and loses nothing, and it is
 * what closes the trailing-zero half of the F21 residue that
 * `src/integrations/google/ProductFeedBuilder.ts` previously had to record as unfixable.
 *
 * ⚠️ CANONICALISATION IS FOR COMPARISON ONLY, NEVER FOR STORAGE. `'100.00'` and `'100'` are the same
 * NUMBER and different TEXT. {@link compareExactDecimal} treats them as equal; neither is rewritten into
 * the other, because rewriting would discard the stored scale this type exists to keep.
 * ================================================================================================== */

/**
 * A `big_decimal` value, held as its exact decimal digits.
 *
 * The brand is nominal: an arbitrary string is not assignable to it, so every value of this type has
 * passed {@link toExactDecimal} or {@link exactDecimalFromNumber} and is therefore either well-formed
 * decimal text or the single {@link EXACT_DECIMAL_NOT_NUMERIC} sentinel. It remains a `string` at
 * runtime, which is what lets it be bound to a parameter with no conversion step at all.
 */
export type ExactDecimal = string & { readonly __exactDecimal: 'ExactDecimal' };

/**
 * Well-formed exact-decimal text: an optional minus, digits, and an optional fractional part.
 *
 * No exponent and no grouping separators — MySQL emits neither for a `DECIMAL` column, and a leading
 * `+` is stripped by {@link toExactDecimal} before this is applied.
 */
const EXACT_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Scientific notation, in the spellings `String(number)` and CFML numeric text can both produce. */
const EXPONENTIAL_DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * The value `0`, which is the legacy `default="0"` on all three `Sku` monetary properties
 * [model/entity/Sku.cfc:L55-L57].
 */
export const EXACT_DECIMAL_ZERO = '0' as ExactDecimal;

/**
 * What a NON-NUMERIC assignment becomes — the exact counterpart of the `NaN` the previous numeric
 * coercion produced, and it is deliberately NOT an exception.
 *
 * `newSku.setPrice(arguments.data.price)` at [model/service/SkuService.cfc:L93] is a generated setter
 * with no declared type, so CFML stores whatever it is handed and the `numeric` constraint at
 * `model/validation/Sku.json:L5` is what reports the problem, under that property's own key. This
 * sentinel preserves that division of labour: it fails {@link EXACT_DECIMAL_PATTERN}, so
 * {@link isExactDecimalNumeric} rejects it and so does the validation rule, in the same place and with
 * the same message key as the legacy. Throwing here would move the failure; substituting zero would
 * hide it.
 */
export const EXACT_DECIMAL_NOT_NUMERIC = 'NaN' as ExactDecimal;

/**
 * Rewrites scientific notation as plain decimal text, WITHOUT a floating-point step.
 *
 * The digits are shifted, not recomputed, so `'1.2345678901234567890e25'` expands to all of its digits
 * rather than to the 17 a double would keep. Returns the input unchanged when there is no exponent.
 *
 * @param text - Decimal text, possibly in scientific notation.
 * @returns Plain decimal text of the identical value.
 */
function expandExponentialDecimalText(text: string): string {
  const match = EXPONENTIAL_DECIMAL_PATTERN.exec(text);
  if (match === null) {
    return text;
  }

  const sign = match[1] === '-' ? '-' : '';
  const integerDigits = match[2] ?? '';
  const fractionDigits = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');
  const digits = `${integerDigits}${fractionDigits}`;
  const pointPosition = integerDigits.length + exponent;

  if (pointPosition <= 0) {
    return `${sign}0.${'0'.repeat(-pointPosition)}${digits}`;
  }
  if (pointPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/**
 * CFML `isNumeric`, applied to a raw value.
 *
 * Kept identical to the predicate `../validation/Validator` applies for the `numeric` data-type
 * constraint: booleans are NOT numeric, the empty string is NOT numeric, a non-finite number is NOT
 * numeric, and a numeric string — including one in scientific notation — is. The two must agree,
 * because a value coerced here is the same value that rule later judges.
 *
 * @param value - Any value.
 * @returns `true` when CFML would treat it as a number.
 */
function readsAsCfmlNumericText(value: unknown): boolean {
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
 * Normalises well-formed decimal text into the spelling {@link EXACT_DECIMAL_PATTERN} accepts.
 *
 * Strips a leading `+`, supplies a leading zero for `'.5'`, and drops a trailing point from `'5.'`.
 *
 * TRAILING ZEROS AFTER THE POINT ARE KEPT — they are the stored scale, and this type exists to preserve
 * it. That rule holds for zero too, so `'-0.000'` normalises to `'0.000'` and not to `'0'`: the SIGN is
 * dropped, because a negative zero denotes the same amount as a positive one and no `Sw*` column can
 * distinguish them, but the SCALE is not, because dropping it here would reintroduce exactly the loss the
 * type prevents everywhere else. {@link compareExactDecimal} already treats `'0.000'` and `'0'` as equal,
 * so nothing downstream needs them spelled the same way.
 *
 * @param text - Numeric text already accepted by {@link readsAsCfmlNumericText}, exponent expanded.
 * @returns The normalised spelling of the identical value.
 */
function normaliseDecimalSpelling(text: string): string {
  const negative = text.startsWith('-');
  let magnitude = text.replace(/^[+-]/, '');
  if (magnitude.startsWith('.')) {
    magnitude = `0${magnitude}`;
  }
  if (magnitude.endsWith('.')) {
    magnitude = magnitude.slice(0, -1);
  }
  /* `-0`, `-0.0` and `-0.000` all denote zero, whose sign carries no meaning for a stored amount — so the
   * sign is dropped while the scale is left exactly as it arrived. */
  const signMeaningful = negative && /[1-9]/.test(magnitude);
  return signMeaningful ? `-${magnitude}` : magnitude;
}

/**
 * Coerces a value the way CFML coerces one on assignment to a `big_decimal` property.
 *
 * A boolean becomes `'1'` or `'0'`, matching CFML's numeric reading of a boolean. Numeric text is kept
 * DIGIT FOR DIGIT — this is the whole point of the type, so no `Number(...)` appears on this path. A
 * `number` is handed to {@link exactDecimalFromNumber}, which is where the only unavoidable
 * floating-point boundary in the module is documented. Anything else becomes
 * {@link EXACT_DECIMAL_NOT_NUMERIC}.
 *
 * @param value - The raw value, typically off an untyped request payload.
 * @returns The exact value, or the non-numeric sentinel.
 */
export function toExactDecimal(value: unknown): ExactDecimal {
  if (typeof value === 'boolean') {
    return (value ? '1' : '0') as ExactDecimal;
  }
  /* A number is already a double, so it goes to the one function that documents that boundary; it also
   * screens non-finite values, which CFML does not treat as numeric either. */
  if (typeof value === 'number') {
    return exactDecimalFromNumber(value);
  }
  if (typeof value !== 'string' || !readsAsCfmlNumericText(value)) {
    return EXACT_DECIMAL_NOT_NUMERIC;
  }
  const expanded = expandExponentialDecimalText(value.trim());
  return normaliseDecimalSpelling(expanded) as ExactDecimal;
}

/**
 * Reads exact-decimal text that a trusted source produced — a `DECIMAL` column, or a value already
 * matched against {@link EXACT_DECIMAL_PATTERN} by the caller.
 *
 * @param text - The text to adopt.
 * @returns The branded value, or `undefined` when the text is not well-formed decimal text.
 */
export function parseExactDecimal(text: string): ExactDecimal | undefined {
  const expanded = expandExponentialDecimalText(text.trim());
  const normalised = normaliseDecimalSpelling(expanded);
  return EXACT_DECIMAL_PATTERN.test(normalised) ? (normalised as ExactDecimal) : undefined;
}

/**
 * Adopts a JavaScript `number` as an exact decimal.
 *
 * ⚠️ THIS IS THE ONE LOSSY BOUNDARY IN THE MODULE, AND IT IS LOSSY BEFORE IT IS REACHED. A `number`
 * argument has already been rounded to the nearest double by whoever produced it, so no digit is lost
 * HERE — the function records exactly what the double denotes, expanding any exponent so the result is
 * plain decimal text of every magnitude. It exists for the two places a `number` genuinely arrives: an
 * out-of-scope port that types its value that way (`../ports/PricingPort`, whose shape AAP §0.2.2.7
 * forbids this slice to redefine), and a numeric literal in a test or fixture.
 *
 * @param value - A finite number.
 * @returns Its exact decimal text, or the non-numeric sentinel when the number is not finite.
 */
export function exactDecimalFromNumber(value: number): ExactDecimal {
  if (!Number.isFinite(value)) {
    return EXACT_DECIMAL_NOT_NUMERIC;
  }
  const expanded = expandExponentialDecimalText(String(value));
  return normaliseDecimalSpelling(expanded) as ExactDecimal;
}

/**
 * Is this value numeric — i.e. anything other than {@link EXACT_DECIMAL_NOT_NUMERIC}?
 *
 * NOT EXPORTED. Nothing outside this module needs to ask: a consumer that must order two values calls
 * {@link compareExactDecimal}, which answers `undefined` for an unorderable operand, and a consumer that
 * must reject a non-numeric value is a validation rule, which already applies CFML's own `isNumeric`
 * predicate to the text. Exporting a second, near-identical predicate would invite the two to drift.
 *
 * @param value - The value to test.
 * @returns `true` when the value is well-formed decimal text.
 */
function isExactDecimalNumeric(value: ExactDecimal): boolean {
  return EXACT_DECIMAL_PATTERN.test(value);
}

/**
 * Splits well-formed decimal text into its sign and its two digit runs.
 *
 * @param value - Well-formed decimal text.
 * @returns The sign as `1` or `-1`, the integer digits with leading zeros removed, and the fraction
 *   digits with trailing zeros removed.
 */
function decimalParts(value: string): { sign: number; whole: string; fraction: string } {
  const negative = value.startsWith('-');
  const magnitude = negative ? value.slice(1) : value;
  const [rawWhole = '', rawFraction = ''] = magnitude.split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  const isZero = /^0*$/.test(whole) && fraction.length === 0;
  return { sign: negative && !isZero ? -1 : 1, whole, fraction };
}

/**
 * Compares two exact decimals EXACTLY, without converting either to a number.
 *
 * The comparison is digit-wise: sign first, then integer-digit COUNT (which orders magnitudes without
 * arithmetic), then the integer digits lexically, then the fraction digits over the longer of the two
 * scales. That is why `'9'` and `'10'` order correctly where a plain string comparison would not, and
 * why `'100.00'` equals `'100'`.
 *
 * ⚠️ A NON-NUMERIC OPERAND IS NEVER ORDERED. As with `NaN`, comparing against
 * {@link EXACT_DECIMAL_NOT_NUMERIC} yields `undefined` rather than an arbitrary answer, so a caller has
 * to decide what an unorderable value means instead of being handed a silent `false`.
 *
 * @param left - The left operand.
 * @param right - The right operand.
 * @returns `-1`, `0` or `1`, or `undefined` when either operand is non-numeric.
 */
export function compareExactDecimal(
  left: ExactDecimal,
  right: ExactDecimal,
): -1 | 0 | 1 | undefined {
  if (!isExactDecimalNumeric(left) || !isExactDecimalNumeric(right)) {
    return undefined;
  }

  const a = decimalParts(left);
  const b = decimalParts(right);

  if (a.sign !== b.sign) {
    return a.sign < b.sign ? -1 : 1;
  }

  const direction: -1 | 1 = a.sign < 0 ? -1 : 1;

  if (a.whole.length !== b.whole.length) {
    return a.whole.length < b.whole.length ? ((-direction * 1) as -1 | 1) : direction;
  }
  if (a.whole !== b.whole) {
    return a.whole < b.whole ? ((-direction * 1) as -1 | 1) : direction;
  }

  const scale = Math.max(a.fraction.length, b.fraction.length);
  const aFraction = a.fraction.padEnd(scale, '0');
  const bFraction = b.fraction.padEnd(scale, '0');
  if (aFraction === bFraction) {
    return 0;
  }
  return aFraction < bFraction ? ((-direction * 1) as -1 | 1) : direction;
}

/**
 * Projects an exact decimal onto a JavaScript `number`.
 *
 * ⚠️ NAMED SO THAT EVERY LOSSY READ IS VISIBLE IN THE CALLER. This is the only way a monetary value in
 * this port becomes a double, and each call site is expected to say why it has to. It exists for
 * boundaries that type their value `number` and that this slice may not redefine — an out-of-scope port,
 * or a serialised response field.
 *
 * @param value - The value to project.
 * @returns The nearest double, or `NaN` for the non-numeric sentinel.
 */
export function exactDecimalToNumber(value: ExactDecimal): number {
  return isExactDecimalNumeric(value) ? Number(value) : Number.NaN;
}

/* ⛔ THERE IS NO `renderExactDecimal` HERE, DELIBERATELY. An earlier draft of this module exported one
 * that raised on the non-numeric sentinel so a document could not carry it. Nothing needed it: an
 * `ExactDecimal` already IS its own textual form, so every emitter interpolates the value directly, and
 * the one emitter that could have called it — `../integrations/google/ProductFeedBuilder`'s
 * `renderFeedMoney` — must specifically NOT raise, because the legacy view completes a render this port
 * has no licence to abort. An exported helper with no caller, and with the wrong semantics for its only
 * plausible caller, is invented API surface (AAP §0.7.3 S9) — so it was removed rather than left to rot. */
