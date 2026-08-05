/**
 * Typed, eagerly validated environment reading for the extracted Catalog service.
 *
 * The legacy application held no connection details in source: config/configApplication.cfm:L2
 * names the `Slatwall` datasource and the application server resolves it out of band, while
 * org/Hibachi/Hibachi.cfc:L10-L13 supplies the framework defaults it overrides, including an empty
 * username and an empty password. Application.cfc:L78-L87 publishes the four resulting values, and
 * config/configORM.cfm:L4-L7 aborts when no datasource resolves — the fail-fast behaviour
 * reproduced here by validating every value once, at module load.
 *
 * Sole-reader invariant: this is the only file under src/** permitted to read the process
 * environment. Configuration flows one way (AAP §0.4.3.5) — this module reads it,
 * src/config/database.ts builds the pool, src/config/container.ts wires the graph, and every layer
 * below receives what it needs by constructor injection. Each read is written as a plain dotted
 * `process.env` access so the whole key set is enumerable in one pass.
 */

import { isIPv6 } from 'node:net';

/*
 * Every failure in this file is a `ConfigurationError`, not a bare `DomainError`, and the class is
 * the classification. `../errors/DomainError.ts` declares `ConfigurationError` for exactly this
 * category and overrides its public presentation to `SERVICE_CONFIGURATION`, while a bare
 * `DomainError` presents as `SERVICE_FAULT`; `../handlers/httpResponse.ts` reads that distinction to
 * decide what a caller is told. `../adapters/settings/StaticSettingResolver.ts` already threw
 * `ConfigurationError` for the analogous failure, so using the base class here would make the canonical
 * configuration failures the only ones classified as generic faults. `ConfigurationError` extends
 * `DomainError`, so nothing that tests for the base class is affected, and every message and locator
 * below is unchanged by the narrower class.
 */
import { ConfigurationError } from '../errors/DomainError';

/*
 * Translation notes for the reads below.
 *
 * The three-way runtime dialect probe at config/configORM.cfm:L8-L14 is collapsed to a fixed MySQL
 * target, as AAP §0.4.1.3 specifies. "Slatwall" [config/configApplication.cfm:L2] is a datasource
 * name and never a schema name, and none of the connection facts read here is declared anywhere in
 * legacy source, so each one is required of the operator rather than defaulted. Eager fail-fast
 * validation is inherited behaviour rather than an added safety feature, and three legacy
 * configuration behaviours with no target analogue are recorded as omissions where they would have
 * been read rather than modelled.
 *
 * Transport security and the pool's resource bounds are operator-supplied facts, and no figure is
 * invented for any of them (requirement IR-12). The Google feed's host authority also arrives as
 * configuration, because a stateless invocation has no request scope to read it from (AAP §0.6.6 /
 * IR-10). The three setting values whose legacy default is computed at run time are read here too: a
 * value the legacy derived by calling services this slice excludes cannot come from a frozen table,
 * and the only other sources would be a container literal or an invented default.
 */

/** How the connection to MySQL is protected in transit. */
export type DatabaseTlsMode = 'verified' | 'disabled';

/** The connection facts required to reach the existing Sw* schema. */
export interface DatabaseConfig {
  /** Host name or address of the MySQL server. Never defaulted. */
  readonly host: string;
  /** TCP port of the MySQL server, validated as an integer in the addressable range. */
  readonly port: number;
  /** Schema holding the Sw* tables. */
  readonly database: string;
  /** User the service authenticates as. Never defaulted; may legitimately be empty. */
  readonly user: string;
  /**
   * Password the service authenticates with. Never defaulted; may legitimately be empty, and
   * never logged, echoed, serialized or interpolated anywhere (AAP §0.8.3.9).
   */
  readonly password: string;
  /** How the connection is protected in transit. */
  readonly tlsMode: DatabaseTlsMode;
  /**
   * Greatest number of connection requests the pool may hold waiting once its connection limit is
   * reached; beyond it, a request fails instead of queueing indefinitely.
   */
  readonly queueLimit: number;
  /** Greatest number of connections the pool may open, when the operator states one. */
  readonly connectionLimit?: number;
  /**
   * Milliseconds the driver may spend establishing a connection before failing, when the operator
   * states a bound.
   */
  readonly connectTimeoutMs?: number;
}

/** The complete configuration surface of this service. */
export interface GoogleFeedConfig {
  /**
   * The host authority every absolute URL in the Google product feed is built on — the canonical
   * replacement for the legacy `CGI.HTTP_HOST` reads at
   * integrationServices/google/views/feed/product.cfm:L14, :L15, :L22, :L23 and :L24.
   */
  readonly host: string;
}

/*
 * There is no `ProductImportConfig`, `UrlTitleConfig` or `SkuCombinationConfig` here, and no loader for
 * one. Each would have mirrored a collaborator input that lives below the config layer, and each would have
 * made a deployment state a figure at load — for behaviour some deployments never reach — which is the
 * relocated invention AAP §0.7.3 and IR-12 forbid rather than an avoided one.
 */

/** The three setting values whose legacy default is computed at run time. */
export interface SettingsConfig {
  /**
   * The CFML application scope's `applicationRootMappingPath`, from which
   * `globalAssetsImageFolderPath` is derived exactly as [model/service/SettingService.cfc:L164]
   * derives it.
   */
  readonly applicationRootMappingPath?: string;

  /**
   * The comma-delimited currency identifier list [model/service/SettingService.cfc:L222] computes as
   * `getCurrencyService().getAllActiveCurrencyIDList()`.
   */
  readonly skuEligibleCurrencies?: string;

  /**
   * The comma-delimited fulfillment-method identifier list
   * [model/service/SettingService.cfc:L223] computes as
   * `getFulfillmentService().getAllActiveFulfillmentMethodIDList()`.
   */
  readonly skuEligibleFulfillmentMethods?: string;
}

/**
 * The six finite resource bounds a deployment must state, so the composition root can wire them.
 */
export interface ResourceBoundsConfig {
  /**
   * The largest number of records one smart-list query may materialise — the figure
   * `../adapters/mysql/SmartListQueryBuilder.ts` applies in `execute` and `executeRecords`.
   */
  readonly smartListMaximumRecordsPerQuery?: number;

  /**
   * The largest number of query-complexity units one compiled smart-list statement may carry — review
   * finding's second half.
   */
  readonly smartListMaximumPredicatesPerQuery?: number;

  /**
   * The largest number of SKU combinations one merchandise `createSkus` request may enumerate — the figure
   * `../services/SkuService.ts` applies to the odometer enumeration of
   * [model/service/SkuService.cfc:L58-L211].
   */
  readonly skuMaximumCombinationsPerRequest?: number;

  /**
   * The maximum number of uniqueness probes one URL-title derivation may issue.
   */
  readonly urlTitleMaximumProbesPerDerivation?: number;

  /**
   * The largest number of `g:additional_image_link` elements one feed record may emit
   * 's per-record clause.
   */
  readonly googleFeedMaximumImagesPerRecord?: number;

  /**
   * The largest number of bytes the rendered product feed document may reach its
   * response-size clause.
   */
  readonly googleFeedMaximumResponseBytes?: number;
}

export interface AppConfig {
  readonly database: DatabaseConfig;

  /** The Google product feed section — see {@link GoogleFeedConfig}. */
  readonly googleFeed: GoogleFeedConfig;

  /** The three run-time-computed setting values — see {@link SettingsConfig}. */
  readonly settings: SettingsConfig;

  /** The six optional finite resource bounds — see {@link ResourceBoundsConfig}. */
  readonly resourceBounds: ResourceBoundsConfig;
}

/* Validation helpers. */

/** Matches an unsigned base-ten integer and nothing else. */
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

/** Lowest addressable TCP port. Port zero is reserved and cannot be connected to. */
const LOWEST_ADDRESSABLE_TCP_PORT = 1;

/** Highest addressable TCP port, the maximum of the protocol's 16-bit unsigned port field. */
const HIGHEST_ADDRESSABLE_TCP_PORT = 65535;

/** Smallest value a pool bound or a connection timeout may take. */
const LOWEST_PERMITTED_RESOURCE_BOUND = 1;

/** The transport mode used when `DB_TLS_MODE` is not set at all. */
const DEFAULT_DATABASE_TLS_MODE: DatabaseTlsMode = 'verified';

/** The longest a MySQL database identifier may be. */
const MAX_MYSQL_IDENTIFIER_LENGTH = 64;

/*
 * A `lowest_permitted_hop_bound` of zero once stood here, as the one asymmetry in the numeric
 * readers, and the floor parameter that carried it is gone with it. The zero floor existed solely so
 * the import policy's environment-supplied redirect count could accept "follow none"; with that value no
 * longer read here
 * — see the note above {@link SettingsConfig} — all three surviving numeric reads are
 * resource bounds that must admit something. So {@link requireResourceBoundValue} applies
 * {@link LOWEST_PERMITTED_RESOURCE_BOUND} itself rather than taking a floor argument that every
 * caller would now pass the same value for: a parameter with one possible value documents a choice.
 */

/*
 * A `LIST_DELIMITER` comma once stood here, and so did the `requireDelimitedListValue` reader
 * further down that was its only user. Both are removed, because the two allowlists they split were
 * the import policy's environment-supplied schemes and hosts. The two delimited setting values
 * that remain are read whole and never split here: their legacy consumers read them with CFML list
 * functions [model/entity/Sku.cfc:L373, :L375], so splitting them at the boundary would hand the
 * setting adapter a shape the legacy never produced.
 */

/** Highest value an IPv4 dotted-quad octet may take, the maximum of its 8-bit unsigned field. */
const HIGHEST_IPV4_OCTET = 255;

/** Number of dotted-quad components in an IPv4 literal. */
const IPV4_OCTET_COUNT = 4;

/** First octet of the block reserved for IPv4 loopback, 127.0.0.0/8. */
const IPV4_LOOPBACK_PREFIX = '127';

/** The non-dotted-quad spellings of the loopback host that are accepted as local. */
const LOOPBACK_HOST_NAMES: readonly string[] = [
  'localhost',
  '::1',
  '[::1]',
  '0:0:0:0:0:0:0:1',
  '[0:0:0:0:0:0:0:1]',
];

/*
 * The five constants below transcribe the RFC 3986 §3.2.2 `host` production, and they have two consumers.
 */

/** RFC 3986 §3.2.2 `reg-name`, transcribed: `*( unreserved / pct-encoded / sub-delims )`. */
const REGISTERED_NAME_PATTERN = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})+$/;

/**
 * Opening delimiter of the RFC 3986 §3.2.2 `IP-literal` form, `"[" ( IPv6address / IPvFuture ) "]"`.
 */
const IP_LITERAL_OPEN = '[';

/** Closing delimiter of the RFC 3986 §3.2.2 `IP-literal` form. */
const IP_LITERAL_CLOSE = ']';

/**
 * The complete character set of the RFC 3986 §3.2.2 `IPv6address` production — HEXDIG, `:` and the
 * `.` of an embedded `IPv4address` — and nothing else.
 */
const IPV6_ADDRESS_CHARACTERS_PATTERN = /^[0-9A-Fa-f:.]+$/;

/**
 * RFC 3986 §3.2.2 `IPvFuture`, transcribed: `"v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )`.
 */
const IP_FUTURE_PATTERN = /^v[0-9A-Fa-f]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+$/;

/** The `:` introducing the optional `port` of RFC 3986 §3.2.2's `host [ ":" port ]`. */
const HOST_PORT_SEPARATOR = ':';

/**
 * Reads a variable that must be present, and returns it verbatim.
 */
function requirePresentValue(variableName: string, rawValue: string | undefined): string {
  if (typeof rawValue !== 'string') {
    throw new ConfigurationError(
      /*
       * The second sentence is deliberately variable-agnostic, because this helper answers for more
       * than one kind of variable: it reads the five connection identities and the feed host of
       * `loadGoogleFeedConfig`, so a connection-flavoured sentence would answer for a value that is not
       * a connection setting at all. It is also scoped to the required set, which is the only set that
       * reaches this failure path.
       */
      `Required environment variable ${variableName} is not set. ` +
        `This service reads ${String(ENVIRONMENT_VARIABLE_TOTAL)} environment variables, of which ` +
        `${String(ENVIRONMENT_VARIABLE_REQUIRED_TOTAL)} are required and have no ` +
        'default of any kind: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and GOOGLE_FEED_HOST. ' +
        `The other ${String(ENVIRONMENT_VARIABLE_OPTIONAL_TOTAL)} are optional and fall back as ` +
        'slatwall-ts/.env.example documents.',
      { context: { variable: variableName } },
    );
  }

  return rawValue;
}

/**
 * Reads a variable that must carry non-whitespace content once it is being read at all.
 */
function requireNonBlankValue(variableName: string, rawValue: string | undefined): string {
  const value = requirePresentValue(variableName, rawValue);

  if (value.trim().length === 0) {
    throw new ConfigurationError(
      `Environment variable ${variableName} is set but blank. A blank value is not a way to say ` +
        '"unset": this service substitutes nothing for either, so a required variable must carry a ' +
        'real value and an optional one must be left out entirely rather than left empty. ' +
        `slatwall-ts/.env.example states which of the ${String(ENVIRONMENT_VARIABLE_TOTAL)} names are ` +
        'required and which are optional, and comments the optional ones out for this reason.',
      { context: { variable: variableName } },
    );
  }

  return value;
}

/**
 * Reads a variable that must be present and must denote an addressable TCP port.
 */
function requireTcpPortValue(variableName: string, rawValue: string | undefined): number {
  /*
   * Tested exactly as supplied. A `.trim()` stood between this read and the pattern test below, and it
   * made the implementation the looser of the two statements of this grammar: `slatwall-ts/.env.example`
   * says the value "must be a plain base-ten TCP port number" and the message below says "any other
   * non-digit character" is rejected, while ` 3306 ` loaded — a space being a non-digit character. The
   * pre-trim is gone rather than the two sentences, because refusing the padded value is the smaller edit
   * and it keeps the stricter of the two contracts. It also widens correctly: `String.prototype.trim`
   * strips the whole Unicode whitespace set, so a tab-, newline-, no-break-space- or
   * ideographic-space-padded value was admitted too, and each of those is a value an operator wrote by
   * accident rather than a value they meant.
   *
   * Blankness is still a separate answer, and deliberately so: {@link requireNonBlankValue} runs first and
   * reports an all-whitespace value as "set but blank", which is the diagnostic that tells an operator they
   * typed a name and left it empty. Only a value that carries non-whitespace content reaches the grammar
   * below, so the two failures stay distinguishable rather than collapsing into one.
   */
  const value = requireNonBlankValue(variableName, rawValue);

  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be a plain base-ten integer TCP port number. ` +
        'A sign, a decimal point, exponent notation, a radix prefix, leading or trailing whitespace ' +
        'and any other non-digit character are all rejected; the value is read exactly as supplied ' +
        "and is never trimmed on the operator's behalf.",
      { context: { variable: variableName } },
    );
  }

  const port = Number(value);

  // Belt and braces after the pattern test: a digit run long enough to exceed the exactly
  // representable integer range would convert to a non-integer, and any digit run at all can
  // still fall outside the addressable range.
  if (
    !Number.isInteger(port) ||
    port < LOWEST_ADDRESSABLE_TCP_PORT ||
    port > HIGHEST_ADDRESSABLE_TCP_PORT
  ) {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be a TCP port number between ` +
        `${LOWEST_ADDRESSABLE_TCP_PORT} and ${HIGHEST_ADDRESSABLE_TCP_PORT}.`,
      { context: { variable: variableName } },
    );
  }

  return port;
}

/**
 * Decides whether `host` matches the RFC 3986 §3.2.2 `host` production.
 */
function isHostProduction(host: string): boolean {
  if (!host.startsWith(IP_LITERAL_OPEN)) {
    return REGISTERED_NAME_PATTERN.test(host);
  }

  if (!host.endsWith(IP_LITERAL_CLOSE)) {
    return false;
  }

  const literal = host.slice(IP_LITERAL_OPEN.length, host.length - IP_LITERAL_CLOSE.length);

  if (IP_FUTURE_PATTERN.test(literal)) {
    return true;
  }

  return IPV6_ADDRESS_CHARACTERS_PATTERN.test(literal) && isIPv6(literal);
}

/**
 * Locates the `:` that introduces an optional port in an RFC 3986 §3.2.2 `host` §3.2.3 `port` pair.
 */
function findHostPortSeparatorIndex(value: string): number {
  if (value.startsWith(IP_LITERAL_OPEN)) {
    const closingIndex = value.indexOf(IP_LITERAL_CLOSE);

    return closingIndex === -1 ? -1 : value.indexOf(HOST_PORT_SEPARATOR, closingIndex);
  }

  const firstIndex = value.indexOf(HOST_PORT_SEPARATOR);

  // An unbracketed value with a second colon is a bare IPv6 address, not a host-and-port pair. Returning
  // the first index would split `::1` into an empty host and a port of `:1`, and both halves would then be
  // refused with a message about the wrong half; refusing the whole value as a host is the truthful answer,
  // and `-1` routes it there.
  return firstIndex === -1 || value.indexOf(HOST_PORT_SEPARATOR, firstIndex + 1) === -1
    ? firstIndex
    : -1;
}

/**
 * Reads a variable that must denote an HTTP authority — RFC 3986 §3.2.2 `host` with §3.2.3's optional
 * `port` — and refuses anything else.
 *
 * `GOOGLE_FEED_HOST` is the only caller, and it is validated rather than merely read for presence because
 * the value is interpolated into five absolute URLs of the rendered feed:
 * `integrationServices/google/views/feed/product.cfm:L14`, `:L15`, `:L22`, `:L23` and `:L24`. The value
 * stands in for `CGI.HTTP_HOST`, and RFC 9110 §7.2 defines that field as §3.2.2 `host` plus §3.2.3 `port`
 * with userinfo excluded — so a value outside the production could never have reached `:L14` and refusing
 * it forecloses no legacy rendering (AAP §0.8.2 guideline 4). It is alignment with the replaced input's
 * value space, not a behavioural divergence, so it does not consume the single departure AAP §0.6.7.7
 * authorises (D18). The exposure it closes is concrete: `good.example@evil.example` silently moves the
 * origin of every URL in the document (CWE-20 feeding CWE-601) and `evil.example#` collapses all five onto
 * one page. Nothing beyond the grammar is invented — no allowlist, denylist, length ceiling, label-count
 * rule, DNS lookup, reachability probe or scheme handling — and the diagnostic names the variable but never
 * echoes the rejected value, the same discipline `assertRepresentableInXml` follows in
 * `../integrations/google/ProductFeedBuilder.ts`.
 *
 * @param variableName the environment variable being read, named in every failure
 * @param rawValue the raw value, or `undefined` when the variable is not set at all
 * @returns the authority exactly as supplied — never trimmed, folded, punycoded or stripped of a port
 * @throws ConfigurationError naming `variableName` when the variable is absent, blank, or outside the
 *   `host [ ":" port ]` production
 */
function requireHostAuthorityValue(variableName: string, rawValue: string | undefined): string {
  const value = requireNonBlankValue(variableName, rawValue);
  const separatorIndex = findHostPortSeparatorIndex(value);
  const host = separatorIndex === -1 ? value : value.slice(0, separatorIndex);
  const port = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1);

  if (!isHostProduction(host)) {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be an HTTP authority: a registered name, an IPv4 ` +
        'literal or a bracketed IPv6 or IPvFuture literal as defined by RFC 3986 section 3.2.2, ' +
        'optionally followed by ":" and a port. RFC 9110 section 7.2 defines the Host field this value ' +
        'stands in for as exactly that production, so a scheme prefix such as "https://", a ' +
        '"user@" or "user:password@" prefix, a "/" path, a "?" query, a "#" fragment, a backslash, ' +
        'whitespace, a control character, a bare unbracketed IPv6 address and any non-ASCII character ' +
        'are all outside it and are rejected; an internationalised name is supplied as its A-label. ' +
        'The value is interpolated into every absolute URL of the Google product feed, so a value that ' +
        'is not an authority would move the origin of the whole document.',
      { context: { variable: variableName } },
    );
  }

  if (port !== undefined) {
    /*
     * The port half is held to the same rule `DB_PORT` is held to, by reading it through the same
     * reader — one definition of "addressable TCP port" for the whole module. The variable name is
     * carried through unchanged so the operator is told which variable to fix, not which half.
     */
    requireTcpPortValue(variableName, port);
  }

  return value;
}

/**
 * Reads a variable that must be present and must denote an integer resource bound.
 */
function requireResourceBoundValue(variableName: string, rawValue: string | undefined): number {
  /*
   * Read exactly as supplied, for the reason recorded in {@link requireTcpPortValue} — one definition of
   * "plain base-ten integer" for every numeric value this module reads, so the nine optional integer
   * controls are held to precisely the grammar `DB_PORT` is held to and `slatwall-ts/.env.example`'s
   * "a value that is supplied must be a plain base-ten integer" is true of all ten.
   */
  const value = requireNonBlankValue(variableName, rawValue);

  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be a plain base-ten integer. A sign, a decimal ` +
        'point, exponent notation, a radix prefix, leading or trailing whitespace and any other ' +
        'non-digit character are all rejected; the value is read exactly as supplied and is never ' +
        "trimmed on the operator's behalf.",
      { context: { variable: variableName } },
    );
  }

  const bound = Number(value);

  // `Number.isSafeInteger` rather than `Number.isInteger`: a digit run long enough to leave the
  // exactly representable range converts to a value that no longer denotes the digits supplied,
  // and silently acting on a different number than the operator wrote is worse than refusing.
  if (!Number.isSafeInteger(bound) || bound < LOWEST_PERMITTED_RESOURCE_BOUND) {
    throw new ConfigurationError(
      /*
       * The sentence naming the driver's sentinel is scoped to the one variable it is about, and must
       * stay that way. This reader serves every numeric bound in the module, and "the driver reads it as
       * no limit" is true of `DB_QUEUE_LIMIT` alone — not of the connection limit, not of the timeout and
       * not of any CATALOG_* bound the driver never sees. Same reasoning as the message generalisation
       * recorded in the body of {@link requirePresentValue}.
       */
      `Environment variable ${variableName} must be an exactly representable integer of at ` +
        `least ${LOWEST_PERMITTED_RESOURCE_BOUND}. A bound below its floor admits nothing at all, ` +
        'and for DB_QUEUE_LIMIT in particular the driver reads zero as "no limit", which is the ' +
        'unbounded behaviour that value exists to prevent.',
      { context: { variable: variableName } },
    );
  }

  return bound;
}

/**
 * Reads a variable that may legitimately be absent, and refuses it when present but blank.
 */
function optionalNonBlankValue(
  variableName: string,
  rawValue: string | undefined,
): string | undefined {
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  if (rawValue.trim().length === 0) {
    throw new ConfigurationError(
      `Environment variable ${variableName} is set but blank. It is optional, so leave it unset ` +
        'entirely rather than empty: an empty value is not the same as no value, and this service ' +
        'substitutes nothing for either.',
      { context: { variable: variableName } },
    );
  }

  return rawValue;
}

/*
 * `requireDelimitedListValue` once stood here — the reader that required a variable to be present,
 * accepted a blank whole value as the empty list, refused a blank entry inside a non-empty one, and
 * returned the entries frozen and verbatim. It is removed with its only two callers: the import policy's
 * environment-supplied scheme and host allowlists. Its asymmetry was specific to those two
 * variables — presence required, blank permitted, because "no location at all" was one of the answers
 * the operator was being asked for — so nothing that survives here wants it. See the note where
 * `LIST_DELIMITER` stood for why the two delimited setting values that remain are read whole rather
 * than split, and the note where the import policy's own reader stood for why those two variables
 * are not read here at all.
 */

/**
 * Decides whether a configured host names the loopback interface.
 */
function isLoopbackHost(host: string): boolean {
  const candidate = host.trim();

  if (LOOPBACK_HOST_NAMES.includes(candidate)) {
    return true;
  }

  const octets = candidate.split('.');

  if (octets.length !== IPV4_OCTET_COUNT || octets[0] !== IPV4_LOOPBACK_PREFIX) {
    return false;
  }

  return octets.every(
    (octet) => UNSIGNED_INTEGER_PATTERN.test(octet) && Number(octet) <= HIGHEST_IPV4_OCTET,
  );
}

/**
 * Reads the database host, and holds it to the same grammar the feed host is held to.
 */
function requireDatabaseHostValue(variableName: string, rawValue: string | undefined): string {
  const value = requireNonBlankValue(variableName, rawValue);

  if (isHostProduction(value) || isIPv6(value)) {
    return value;
  }

  throw new ConfigurationError(
    `Environment variable ${variableName} must be a bare host: a registered name or IPv4 literal as ` +
      'defined by RFC 3986 section 3.2.2, an IPv6 address written either bracketed or bare, or an ' +
      'IPvFuture literal. A scheme prefix such as "mysql://", a "user:password@" prefix, a ":" and ' +
      'port — the port is DB_PORT, and belongs there — a path, a query, a fragment, whitespace, a ' +
      'control character and any non-ASCII character are all outside that grammar and are rejected; ' +
      'an internationalised name is supplied as its A-label. A filesystem socket path is rejected ' +
      "too: a unix socket is reached through the driver's own socket option, which this service does " +
      'not configure, so a path here would be resolved as a hostname and fail to connect.',
    { context: { variable: variableName } },
  );
}

/**
 * Reads the database schema name, refusing a value MySQL could never resolve to one.
 */
function requireDatabaseSchemaValue(variableName: string, rawValue: string | undefined): string {
  const value = requireNonBlankValue(variableName, rawValue);

  if (value.length <= MAX_MYSQL_IDENTIFIER_LENGTH) {
    return value;
  }

  throw new ConfigurationError(
    `Environment variable ${variableName} is longer than a MySQL database identifier may be. The ` +
      `server's documented maximum is ${String(MAX_MYSQL_IDENTIFIER_LENGTH)} characters, so a longer ` +
      'value cannot name a schema on any server and would fail at the first query with a driver error ' +
      'naming neither this variable nor the environment. It is refused here instead. This service ' +
      'reads and writes an existing schema and neither creates nor migrates one, so the value must be ' +
      'the name of a schema that already exists.',
    { context: { variable: variableName } },
  );
}

/**
 * Reads an optional transport mode, defaulting to the verified one.
 */
function optionalTlsModeValue(
  variableName: string,
  rawValue: string | undefined,
  host: string,
): DatabaseTlsMode {
  if (rawValue === undefined) {
    return DEFAULT_DATABASE_TLS_MODE;
  }

  return requireTlsModeValue(variableName, rawValue, host);
}

/**
 * Reads an optional resource bound, answering `undefined` when the operator states none.
 */
function optionalResourceBoundValue(
  variableName: string,
  rawValue: string | undefined,
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  return requireResourceBoundValue(variableName, rawValue);
}

/**
 * Reads the optional queue bound, falling back to the floor this module already declares.
 */
function optionalBoundedQueueValue(variableName: string, rawValue: string | undefined): number {
  return optionalResourceBoundValue(variableName, rawValue) ?? LOWEST_PERMITTED_RESOURCE_BOUND;
}

/**
 * Reads the transport mode, and refuses the one combination that would send cleartext over a
 * network.
 */
function requireTlsModeValue(
  variableName: string,
  rawValue: string | undefined,
  host: string,
): DatabaseTlsMode {
  /*
   * Read exactly as supplied, on the same reasoning as the two numeric readers above and for the same
   * reason this one states it: the message below says the value must be "exactly" one of two spellings,
   * and a `.trim()` here made ` disabled ` one of them. Tightening the numeric readers alone would have
   * left this the one lax value in the module, and the one it is least safe to be lax about — `disabled`
   * selects cleartext, so the spelling that reaches the comparison should be the spelling the operator
   * committed, not one this module derived from it.
   */
  const mode = requireNonBlankValue(variableName, rawValue);

  if (mode !== 'verified' && mode !== 'disabled') {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be exactly "verified" or "disabled" — read as ` +
        'supplied, so a padded, differently cased or otherwise decorated spelling is refused rather ' +
        'than normalised. There is deliberately no mode that keeps TLS while skipping certificate or ' +
        'identity verification, because an unverified session is indistinguishable from an ' +
        'intercepted one.',
      { context: { variable: variableName } },
    );
  }

  if (mode === 'disabled' && !isLoopbackHost(host)) {
    throw new ConfigurationError(
      `Environment variable ${variableName} may only be "disabled" when DB_HOST is a loopback ` +
        'literal. Unencrypted MySQL traffic to a host reached over a network would expose the ' +
        'credentials and every row in transit, so this combination is refused rather than warned ' +
        'about. Supply the server\'s certificate authority to the runtime and use "verified".',
      { context: { variable: variableName } },
    );
  }

  return mode;
}

/** Reads and validates the database section, then freezes it. */
function loadDatabaseConfig(): DatabaseConfig {
  const host = requireDatabaseHostValue('DB_HOST', process.env.DB_HOST);
  const connectionLimit = optionalResourceBoundValue(
    'DB_CONNECTION_LIMIT',
    process.env.DB_CONNECTION_LIMIT,
  );
  const connectTimeoutMs = optionalResourceBoundValue(
    'DB_CONNECT_TIMEOUT_MS',
    process.env.DB_CONNECT_TIMEOUT_MS,
  );

  return Object.freeze({
    host,
    port: requireTcpPortValue('DB_PORT', process.env.DB_PORT),
    database: requireDatabaseSchemaValue('DB_NAME', process.env.DB_NAME),
    user: requirePresentValue('DB_USER', process.env.DB_USER),
    password: requirePresentValue('DB_PASSWORD', process.env.DB_PASSWORD),
    tlsMode: optionalTlsModeValue('DB_TLS_MODE', process.env.DB_TLS_MODE, host),
    queueLimit: optionalBoundedQueueValue('DB_QUEUE_LIMIT', process.env.DB_QUEUE_LIMIT),

    /*
     * Omitted rather than set to `undefined`, which `exactOptionalPropertyTypes` makes a real
     * distinction. An absent member means "this service states no bound", which is what
     * src/config/database.ts reads to leave the driver's option out entirely; a member present with the
     * value `undefined` would not type-check against the declared optional and would also be a
     * different statement — "the bound is nothing" rather than "there is no bound to state".
     */
    ...(connectionLimit === undefined ? {} : { connectionLimit }),
    ...(connectTimeoutMs === undefined ? {} : { connectTimeoutMs }),
  });
}

/** Reads the Google feed section, then freezes it. */
function loadGoogleFeedConfig(): GoogleFeedConfig {
  return Object.freeze({
    host: requireHostAuthorityValue('GOOGLE_FEED_HOST', process.env.GOOGLE_FEED_HOST),
  });
}

/*
 * There is no `loadProductImportConfig`, `loadUrlTitleConfig` or `loadSkuCombinationConfig`, and none may
 * be added in that form. Each would have read a figure at load, under this module's fail-fast contract, so a
 * deployment would have had to state seven values — five import-policy values plus two budgets — before this
 * module would build at all, including for behaviour it never reaches. That relocates an invented number
 * instead of avoiding it (AAP §0.7.3, IR-12).
 */

/** Reads the three optional setting inputs, then freezes them. */
function loadSettingsConfig(): SettingsConfig {
  const applicationRootMappingPath = optionalNonBlankValue(
    'SETTING_APPLICATION_ROOT_MAPPING_PATH',
    process.env.SETTING_APPLICATION_ROOT_MAPPING_PATH,
  );
  const skuEligibleCurrencies = optionalNonBlankValue(
    'SETTING_SKU_ELIGIBLE_CURRENCIES',
    process.env.SETTING_SKU_ELIGIBLE_CURRENCIES,
  );
  const skuEligibleFulfillmentMethods = optionalNonBlankValue(
    'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',
    process.env.SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS,
  );

  return Object.freeze({
    ...(applicationRootMappingPath === undefined ? {} : { applicationRootMappingPath }),
    ...(skuEligibleCurrencies === undefined ? {} : { skuEligibleCurrencies }),
    ...(skuEligibleFulfillmentMethods === undefined ? {} : { skuEligibleFulfillmentMethods }),
  });
}

/** Reads the six optional finite resource bounds, then freezes them. Each is operator-supplied. */
function loadResourceBoundsConfig(): ResourceBoundsConfig {
  const smartListMaximumRecordsPerQuery = optionalResourceBoundValue(
    'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
    process.env.CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY,
  );
  const skuMaximumCombinationsPerRequest = optionalResourceBoundValue(
    'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
    process.env.CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST,
  );
  const urlTitleMaximumProbesPerDerivation = optionalResourceBoundValue(
    'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
    process.env.CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION,
  );
  const smartListMaximumPredicatesPerQuery = optionalResourceBoundValue(
    'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
    process.env.CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY,
  );
  const googleFeedMaximumImagesPerRecord = optionalResourceBoundValue(
    'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
    process.env.CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD,
  );
  const googleFeedMaximumResponseBytes = optionalResourceBoundValue(
    'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
    process.env.CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES,
  );

  return Object.freeze({
    ...(smartListMaximumRecordsPerQuery === undefined ? {} : { smartListMaximumRecordsPerQuery }),
    ...(smartListMaximumPredicatesPerQuery === undefined
      ? {}
      : { smartListMaximumPredicatesPerQuery }),
    ...(skuMaximumCombinationsPerRequest === undefined ? {} : { skuMaximumCombinationsPerRequest }),
    ...(urlTitleMaximumProbesPerDerivation === undefined
      ? {}
      : { urlTitleMaximumProbesPerDerivation }),
    ...(googleFeedMaximumImagesPerRecord === undefined ? {} : { googleFeedMaximumImagesPerRecord }),
    ...(googleFeedMaximumResponseBytes === undefined ? {} : { googleFeedMaximumResponseBytes }),
  });
}

/** Builds the whole configuration and freezes it at both levels. */
function loadConfig(): AppConfig {
  /*
   * The documented split is checked before any variable is read, so a census that has drifted from the
   * loaders is reported as the documentation fault it is rather than as a missing variable.
   */
  assertEnvironmentVariableCensus();

  return Object.freeze({
    database: loadDatabaseConfig(),
    googleFeed: loadGoogleFeedConfig(),
    settings: loadSettingsConfig(),
    resourceBounds: loadResourceBoundsConfig(),
  });
}

/*
 * The variable census, as data rather than as prose
 * why this exists at all. Every prose census in this file and in slatwall-ts/.env.example had drifted
 * from the loaders — a review pass found "sixteen names, six required, ten optional" stated in five
 * places while the loaders read nineteen, and one of those statements claimed a `grep` had confirmed the
 * figure. A number a reader is invited to trust and cannot check is worse than no number. So the
 * inventory is declared once, here, as data; {@link assertEnvironmentVariableCensus} checks it against
 * itself at module load; and every prose statement of the split points at it.
 */

/** One environment variable this module reads, with the loader that reads it. */
interface EnvironmentVariableCensusEntry {
  /** The variable name, spelled exactly as the `process.env` read spells it. */
  readonly name: string;
  /** Whether absence is fatal at load. */
  readonly required: boolean;
  /** The loader that reads it, so a reader can go straight to the rule it is held to. */
  readonly loader:
    | 'loadDatabaseConfig'
    | 'loadGoogleFeedConfig'
    | 'loadSettingsConfig'
    | 'loadResourceBoundsConfig';
}

/** Every environment variable this module reads — the whole key set, in loader order. */
const ENVIRONMENT_VARIABLE_CENSUS: readonly EnvironmentVariableCensusEntry[] = Object.freeze([
  { name: 'DB_HOST', required: true, loader: 'loadDatabaseConfig' },
  { name: 'DB_PORT', required: true, loader: 'loadDatabaseConfig' },
  { name: 'DB_NAME', required: true, loader: 'loadDatabaseConfig' },
  { name: 'DB_USER', required: true, loader: 'loadDatabaseConfig' },
  { name: 'DB_PASSWORD', required: true, loader: 'loadDatabaseConfig' },
  { name: 'DB_TLS_MODE', required: false, loader: 'loadDatabaseConfig' },
  { name: 'DB_CONNECTION_LIMIT', required: false, loader: 'loadDatabaseConfig' },
  { name: 'DB_QUEUE_LIMIT', required: false, loader: 'loadDatabaseConfig' },
  { name: 'DB_CONNECT_TIMEOUT_MS', required: false, loader: 'loadDatabaseConfig' },
  { name: 'GOOGLE_FEED_HOST', required: true, loader: 'loadGoogleFeedConfig' },
  { name: 'SETTING_APPLICATION_ROOT_MAPPING_PATH', required: false, loader: 'loadSettingsConfig' },
  { name: 'SETTING_SKU_ELIGIBLE_CURRENCIES', required: false, loader: 'loadSettingsConfig' },
  {
    name: 'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',
    required: false,
    loader: 'loadSettingsConfig',
  },
  {
    name: 'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
    required: false,
    loader: 'loadResourceBoundsConfig',
  },
  {
    name: 'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
    required: false,
    loader: 'loadResourceBoundsConfig',
  },
  {
    name: 'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
    required: false,
    loader: 'loadResourceBoundsConfig',
  },
  {
    name: 'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
    required: false,
    loader: 'loadResourceBoundsConfig',
  },
  {
    name: 'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
    required: false,
    loader: 'loadResourceBoundsConfig',
  },
  {
    name: 'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
    required: false,
    loader: 'loadResourceBoundsConfig',
  },
]);

/** The totals every prose statement of the split in this subtree quotes. */
const ENVIRONMENT_VARIABLE_TOTAL = 19;
/** How many of them are fatal when absent. */
const ENVIRONMENT_VARIABLE_REQUIRED_TOTAL = 6;
/** How many are absent-or-present. */
const ENVIRONMENT_VARIABLE_OPTIONAL_TOTAL = 13;

/**
 * Checks the census against itself at module load, so the documented split cannot drift again.
 */
function assertEnvironmentVariableCensus(): void {
  const names = ENVIRONMENT_VARIABLE_CENSUS.map((entry) => entry.name);
  const requiredCount = ENVIRONMENT_VARIABLE_CENSUS.filter((entry) => entry.required).length;
  const optionalCount = ENVIRONMENT_VARIABLE_CENSUS.length - requiredCount;

  if (new Set(names).size !== names.length) {
    throw new ConfigurationError(
      'The environment-variable census names the same variable twice, so its totals cannot be trusted.',
    );
  }

  if (
    names.length !== ENVIRONMENT_VARIABLE_TOTAL ||
    requiredCount !== ENVIRONMENT_VARIABLE_REQUIRED_TOTAL ||
    optionalCount !== ENVIRONMENT_VARIABLE_OPTIONAL_TOTAL
  ) {
    throw new ConfigurationError(
      `The environment-variable census reports ${String(names.length)} names, of which ` +
        `${String(requiredCount)} are required and ${String(optionalCount)} optional, while this module ` +
        `documents ${String(ENVIRONMENT_VARIABLE_TOTAL)}, ` +
        `${String(ENVIRONMENT_VARIABLE_REQUIRED_TOTAL)} and ` +
        `${String(ENVIRONMENT_VARIABLE_OPTIONAL_TOTAL)}. Update slatwall-ts/.env.example and every ` +
        'census in this file together with the loader that changed.',
    );
  }
}

/**
 * Reports the environment-variable inventory this module reads, for documentation and for tests.
 *
 * @returns one entry per variable, in loader order.
 */
export function environmentVariableCensus(): readonly EnvironmentVariableCensusEntry[] {
  return ENVIRONMENT_VARIABLE_CENSUS;
}

/**
 * The validated, immutable configuration for this service.
 *
 * @example
 * ```ts
 * import { config } from '../config/env';
 * ```
 */
export const config: AppConfig = loadConfig();
