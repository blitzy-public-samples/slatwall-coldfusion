/**
 * Setting-driven date and title formatting for the extracted Slatwall Catalog slice.
 *
 * SCOPE — exactly two setting keys, and nothing else (AAP 0.4.1.11):
 *   - `globalDateFormat`   drives `formatDate`
 *   - `productTitleString` drives `replaceStringTemplate`
 *
 * Every other key the in-scope entities read belongs elsewhere: image sizing and paths to
 * `ImagePathPort`, currency to `PricingPort`, and so on. In particular there is deliberately no
 * currency formatter here — AAP 0.2.2.6 places every currency-derived calculated member on the
 * excluded list.
 *
 * LEGACY ORIGINS (reference only; the CFML tree is never modified — AAP 0.4.1.1 / TR-6):
 *   - model/entity/Sku.cfc:L459-L480 — `getNextEstimatedAvailableDate()`, which contains the only
 *     three `globalDateFormat` reads in the entire in-scope entity set (L462, L470, L472), each of
 *     the identical shape `dateFormat(<date>, setting('globalDateFormat'))`.
 *   - model/entity/Product.cfc:L540-L545 — `getTitle()`, which interpolates `productTitleString`.
 *   - org/Hibachi/HibachiUtilityService.cfc:L70-L101 — `replaceStringTemplate()`, the token
 *     substitution mechanism that `getTitle()` delegates to.
 *   - model/entity/HibachiEntity.cfc:L128-L131 — `setting()`, which forwards to the out-of-scope
 *     `settingService`. This is the declared origin of `SettingResolverPort`.
 *
 * THIS MODULE RESOLVES NO SETTINGS. Both functions receive an already-resolved value as a plain
 * parameter. Resolution is owned by `SettingResolverPort` and its implementation
 * `src/adapters/settings/StaticSettingResolver.ts`; the legacy `getService("settingService")` and
 * `getService("hibachiUtilityService")` lookups disappear rather than being re-created here
 * (AAP 0.7.3 S3, and 0.4.3.2 R2: dynamic string lookup becomes a typed collaborator).
 *
 * NO IMPORTS. `src/util/` is a leaf of the hexagonal layering (S4): it may not reach into
 * `domain/`, `ports/`, `adapters/`, `services/`, `validation/`, `integrations/`, `handlers/` or
 * `config/`, and it introduces no third-party dependency — `mysql2` remains the service's single
 * runtime dependency (S5). It reads no environment variable; `src/config/env.ts` is the only file
 * permitted to do that.
 *
 * BOTH EXPORTS ARE SYNCHRONOUS, and that is a decision rather than an accident. Execution-model
 * mismatch M8 (AAP 0.6.6) records that the out-of-scope `SettingService.updateStockCalculated`
 * launches a named out-of-band `cfthread`; `SettingResolverPort` is declared synchronous precisely
 * so that no caller in this slice can come to depend on background completion. Formatting inherits
 * that synchrony: neither function is `async` and neither returns a `Promise`.
 *
 * NEITHER SETTING IS SEEDED. `config/dbdata/SlatwallSetting.xml.cfm` holds 7 `<Record>` rows
 * spanning 5 distinct `settingName` values, and neither `globalDateFormat` nor `productTitleString`
 * is among them; both fall back to metadata defaults declared in the out-of-scope
 * `model/service/SettingService.cfc` (L163 and L193 respectively). This module therefore hardcodes
 * neither default — no fallback parameter, no `??` default, no constant. Recording which keys fall
 * back to defaults is `StaticSettingResolver`'s job (AAP 0.4.1.7); supplying a value here would
 * breach S9.
 *
 * NOT IN SCOPE HERE. The Google product feed builds its sale-price effective-date range out of
 * hard-coded literal masks plus a time-of-day and a timezone offset
 * (integrationServices/google/views/feed/product.cfm:L30), and at L18 reads the persisted
 * `getCalculatedTitle()` column rather than `getTitle()`. That assembly — including the `T`
 * separator, the range separator, the timezone-offset lookup and any time-of-day rendering —
 * belongs to `src/integrations/google/ProductFeedBuilder.ts`, which may legitimately call
 * `formatDate` with a literal mask such as `YYYY-MM-DD`; hence the case-insensitive matching below.
 */

/* ------------------------------------------------------------------------------------------------
 * Date formatting
 * --------------------------------------------------------------------------------------------- */

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
