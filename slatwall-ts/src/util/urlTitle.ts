/**
 * Unique URL-title generation for the extracted Catalog slice.
 *
 * Legacy origin: `model/service/DataService.cfc:L53-L71` (`createUniqueURLTitle`). Only that
 * 19-line span is in scope. The legacy component runs to 203 lines and AAP §0.2.1.8 lists it as
 * reference-only while carrying exactly one member across: "`createUniqueURLTitle` [L53-L71]
 * — ported verbatim as a utility; the rest of the file is out of scope".
 * `loadDataFromXMLDirectory` (L73 onward) and every other member of that component are therefore
 * deliberately absent here.
 *
 * `DataService` itself is not recreated. AAP §0.6.3.1 and 0.6.3.3 classify `dataService` as a
 * genuine but narrow dependency of the product and brand services — the only member either one
 * ever calls is `createUniqueURLTitle` — so AAP §0.4.1.8 narrows that dependency to "the ported
 * urlTitle utility, not a whole service". This subtree consequently has no `DataService` class,
 * no data-access component of its own and no XML loader.
 */

/*
 * The one import this leaf takes — see the import-discipline note above {@link UrlTitleProbeBudget}. It is
 * the sibling error leaf, reached only so a refusal can be translated into a stable public failure by
 * `../handlers/httpResponse`; a bare `error` would not be (AAP §0.7.3).
 */
import { ConfigurationError, DomainError } from '../errors/DomainError';

/** Probes whether a candidate `urlTitle` value is still free on a given table. */
export type UniqueValueProbe = (tableName: string, value: string) => Promise<boolean>;

/*
 * The probe loop is bounded (CWE-400). `model/service/DataService.cfc:L64` is `while(!unique)` with no
 * ceiling. Every iteration issues a
 * database read through the injected probe, so a value that keeps colliding keeps issuing round trips —
 * indefinitely. In a persistent CFML application that was a slow request; in a stateless invocation it is
 * unbounded I/O against a shared database, and a caller cannot distinguish it from a hang. That is the
 * exposure, and it is now refused rather than carried.
 */

/** The ceiling on how many uniqueness probes one URL-title derivation may issue. */
export interface UrlTitleProbeBudget {
  /**
   * Answers the largest number of probes one derivation may issue.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   * `CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION`
   */
  readonly resolveMaximumProbes: () => number;
}

/**
 * Builds the fail-closed probe budget from whatever figure a deployment stated.
 *
 */
export function createUrlTitleProbeBudget(
  maximumProbesPerDerivation: number | undefined,
): UrlTitleProbeBudget {
  if (
    maximumProbesPerDerivation !== undefined &&
    (!Number.isSafeInteger(maximumProbesPerDerivation) || maximumProbesPerDerivation < 1)
  ) {
    throw new DomainError(
      'The URL-title probe budget must be a positive safe integer, so the configured value cannot ' +
        'bound how many uniqueness probes one derivation may issue.',
      { context: { maximumProbesPerDerivation } },
    );
  }

  return Object.freeze({
    resolveMaximumProbes: (): number => {
      if (maximumProbesPerDerivation !== undefined) {
        return maximumProbesPerDerivation;
      }

      throw new ConfigurationError(
        'URL-title derivation refuses to probe an unbounded collision chain. Set ' +
          'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION to the largest number of uniqueness probes this ' +
          'deployment permits one derivation to issue, or supply resourceBounds when composing the ' +
          'container.',
        {
          context: {
            locator: 'model/service/DataService.cfc:L64',
            variable: 'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
          },
        },
      );
    },
  });
}

/**
 * Derives a URL title for `titleString` and appends a numeric suffix until the value is free.
 *
 * @param titleString - The human-readable title to derive a URL title out of.
 * @param tableName - The table the candidate value must be unique on.
 * @param isValueAvailable - Uniqueness probe; see {@link UniqueValueProbe} for its polarity. It is
 * appended after the two legacy parameters so the positional order `(titleString, tableName)` at
 * `model/service/DataService.cfc:L53` stays undisturbed.
 */
export async function createUniqueURLTitle(
  titleString: string,
  tableName: string,
  isValueAvailable: UniqueValueProbe,
  probeBudget: UrlTitleProbeBudget,
): Promise<string> {
  /*
   * — resolved first, before the slug is built and before any round trip. A deployment that
   * stated no ceiling learns so without touching the database, and the message names the variable.
   */
  const maximumProbes = probeBudget.resolveMaximumProbes();
  let probesIssued = 0;

  /**
   * Issues one probe against the budget.
   *
   */
  const probe = async (candidate: string): Promise<boolean> => {
    if (probesIssued >= maximumProbes) {
      throw new DomainError(
        `Deriving a unique URL title for table ${tableName} would issue more than the ` +
          `${String(maximumProbes)} uniqueness probes this deployment permits one derivation to make. ` +
          `No title was returned and none was fabricated.`,
        {
          context: {
            tableName,
            maximumProbes,
            probesIssued,
            lastCandidate: candidate,
            locator: 'model/service/DataService.cfc:L64',
          },
        },
      );
    }

    probesIssued++;

    return isValueAvailable(tableName, candidate);
  };

  // Collision counter, initialised to 1 at `model/service/DataService.cfc:L55`.
  //
  // TODO(parity): the counter is pre-incremented. `addon++` at `DataService.cfc:L65` runs before
  // the suffix is interpolated at `L66`, so the first collision suffix is `-2`, the second is
  // `-3`, and `-1` is never produced for any input whatsoever. This is deliberate behavioural
  // parity, not an off-by-one defect awaiting repair: the suffix sequence is observable output,
  // and AAP §0.8.2 Guideline 4 — "Do not enhance or optimize business logic beyond what the
  // migration requires" — forbids correcting it. Initialising to 2, post-incrementing after the
  // suffix is built, or starting at 0 would each change that observable output.
  let addon = 1;

  // Slug transformation — `DataService.cfc:L57-L58`, reproduced step for step.
  let urlTitle = titleString
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 \-]/g, '');
  urlTitle = urlTitle.replace(/[ ]+/g, '-');

  let returnTitle = urlTitle;

  // The probe runs once before the loop [`DataService.cfc:L62`] and then again at the end of each
  // iteration [`L67`]. A candidate that collides with nothing therefore comes back unchanged,
  // with no suffix at all — which is why this is not restructured as a `do...while`.
  let unique = await probe(returnTitle);

  // `DataService.cfc:L64-L68`. The body is the legacy's three statements in the legacy's order:
  // Pre-increment the counter [`L65`], build the suffixed candidate [`L66`], probe it [`L67`]. Nothing
  // else belongs in here.
  while (!unique) {
    addon++;
    returnTitle = `${urlTitle}-${addon}`;
    unique = await probe(returnTitle);
  }

  // `DataService.cfc:L70`. Always a string — never null and never undefined — matching the
  // `returntype="string"` declared at L53 (AAP §0.7.3, AAP §0.7.3).
  return returnTitle;
}
