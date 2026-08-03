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
 *
 * The exported value is frozen and built once: mismatch M7 (AAP §0.6.6) records that only
 * module-scope state survives between Lambda invocations, so a mutable cache here could bleed
 * across callers while a frozen constant cannot. That is why no reload, override or reset entry
 * point exists. Pool lifecycle belongs to src/config/database.ts and commit timing to
 * src/adapters/mysql/UnitOfWork.ts.
 */

import { isIPv6 } from 'node:net';

/*
 * ⭐ EVERY FAILURE IN THIS FILE IS A `ConfigurationError`, NOT A BARE `DomainError`, AND THE CLASS IS
 * THE CLASSIFICATION. `../errors/DomainError.ts` declares `ConfigurationError` for exactly this
 * category and overrides its public presentation to `SERVICE_CONFIGURATION`, while a bare
 * `DomainError` presents as `SERVICE_FAULT`; `../handlers/httpResponse.ts` reads that distinction to
 * decide what a caller is told. `../adapters/settings/StaticSettingResolver.ts` already threw
 * `ConfigurationError` for the analogous failure, so using the base class here made the CANONICAL
 * configuration failures the only ones classified as generic faults. `ConfigurationError` extends
 * `DomainError`, so nothing that tests for the base class is affected, and every message and
 * `context` below is unchanged — only the class is.
 */
import { ConfigurationError } from '../errors/DomainError';

/* ==============================================================================================
 * DECISION A — the three-way runtime dialect probe is deliberately collapsed to a fixed MySQL
 * target (AAP §0.8.2 Guideline 6; the collapse is mandated by AAP §0.4.1.3, which specifies that
 * "the runtime `cfdbinfo` dialect probe [config/configORM.cfm:L8-L14] becomes a fixed MySQL
 * target with the branch documented").
 *
 * What the legacy code did, in four facts:
 *   1. It probed the database product AT RUNTIME. config/configORM.cfm:L3 issues
 *      `<cfdbinfo datasource="..." type="Version" name="dbVersion">` on every application start,
 *      then branches on `dbVersion.DATABASE_PRODUCTNAME`.
 *   2. It could select three ORM dialects: "MySQL" at config/configORM.cfm:L10,
 *      "MicrosoftSQLServer" at config/configORM.cfm:L12 and "Oracle10g" at
 *      config/configORM.cfm:L14.
 *   3. There is NO `<cfelse>`. The conditional closes at config/configORM.cfm:L15 with no
 *      fallback, so an unrecognised database product left `this.ormSettings.dialect` entirely
 *      unset and the application continued regardless. The fixed target chosen here is therefore
 *      NARROWER AND MORE HONEST than the legacy behaviour, not a feature added on top of it.
 *   4. Application.cfc:L87 republishes the selected dialect as the application value
 *      `databaseType`. That value IS the collapsed constant, which is precisely why it does not
 *      become a configuration variable here.
 *
 * What this port does instead: it targets MySQL only. AAP §0.1.2.1 maps persistence to "mysql2
 * prepared statements against the same Sw* tables", so the branch is resolved at DESIGN time
 * rather than at configuration time. Concretely, and so that none of this reads as an oversight:
 *   - There is no runtime product probe of any kind, and no capability detection.
 *   - There is no dialect type, enum, union, branch or strategy object anywhere in this subtree.
 *   - There is deliberately NO DB_DIALECT and NO DATABASE_TYPE environment variable. Offering one
 *     would advertise a portability this port does not have.
 *   - No database engine version is asserted. AAP §0.5.4 records the MySQL version as NOT
 *     DOCUMENTED — the legacy repository pins none, selecting a dialect at runtime instead — and
 *     AAP §0.9.3 requires recording that absence rather than supplying a plausible value (S9).
 *     The same applies to the Hibernate version, which has no in-repository pin either.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION B — "Slatwall" [config/configApplication.cfm:L2] is a DATASOURCE NAME, not a schema
 * name; and the connection facts this module reads are not declared anywhere in legacy source
 * (AAP §0.8.2 Guideline 6).
 *
 * config/configApplication.cfm:L2 sets `this.datasource.name = "Slatwall"`. That string is a
 * ColdFusion/Railo DATASOURCE NAME: an alias registered in the application server's
 * administrator, which the server resolves out of band to a JDBC URL, a schema, a user and a
 * password. It is NOT a schema name, NOT a host, NOT a port and NOT a user, and it is therefore
 * never used as one here. It appears in this file only in these comments, only with its locator.
 *
 * The evidence for treating it that way is the absence of everything else. Across
 * config/configApplication.cfm, config/configORM.cfm, Application.cfc and
 * org/Hibachi/Hibachi.cfc the datasource is referenced at four sites, and not one of them
 * declares a host, a port, a schema, a username or a password value:
 *   org/Hibachi/Hibachi.cfc:L10-L11 — the struct and the default name "hibachi".
 *   org/Hibachi/Hibachi.cfc:L12-L13 — username and password, BOTH set to the empty string.
 *   config/configApplication.cfm:L2  — overrides the name only.
 *   config/configORM.cfm:L3          — passes name, username and password straight to the probe.
 *
 * So host, port, schema, user and password are all supplied by the operator through the
 * environment, exactly as AAP §0.8.3.9 requires: "environment-driven DB configuration, no
 * hardcoded credentials". Two consequences are load-bearing and are stated so they cannot be
 * mistaken for omissions:
 *   - No value below is defaulted. Not the schema name, not the port, not the host, not the user.
 *     Defaulting any of them would assert a fact the legacy source does not state (S9), and the
 *     conventional MySQL port number in particular is nowhere in this file.
 *   - No credential exists in the legacy tree to carry across. Username and password are the
 *     empty string at org/Hibachi/Hibachi.cfc:L12-L13, so this port has nothing to inherit and
 *     hardcodes nothing.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION C — eager fail-fast validation is INHERITED behaviour, not an added safety feature
 * (AAP §0.8.2 Guidelines 2 and 6).
 *
 * The legacy application does not limp along with an unusable datasource. config/configORM.cfm:L2
 * opens a `<cftry>` around the probe; when the probe fails, config/configORM.cfm:L4 catches it,
 * config/configORM.cfm:L5 includes admin/views/main/nodatasource.cfm and config/configORM.cfm:L6
 * `<cfabort />`s the request outright. Failure is immediate, total and loud.
 *
 * Validating the whole configuration once at module load and throwing on the first problem is
 * therefore behaviour-consistent with config/configORM.cfm:L4-L7. It is the same contract in a
 * new idiom, not gold plating — which matters, because AAP §0.8.2 Guideline 4 forbids enhancing
 * behaviour beyond what the migration requires. What the legacy code did NOT do, and what is
 * correspondingly absent here, is retry, back off, fall back to a second datasource, degrade to a
 * read-only mode or emit a health signal.
 *
 * Two deliberate narrowings of that inheritance:
 *   - The legacy abort was triggered by an unreachable datasource, i.e. by a failed connection.
 *     This module never opens a connection: it validates only that the operator supplied the
 *     facts a connection needs. Connection establishment belongs to src/config/database.ts. That
 *     split is what lets a type-check, a test run and a bundle all succeed with no environment
 *     variable set and no database reachable.
 *   - A failure names the offending variable and never reveals its value. Reporting DB_PASSWORD
 *     as absent is required; echoing what it contained is forbidden under AAP §0.8.3.9. No
 *     validator below interpolates a value into a message, an error, a context payload or
 *     anything else, and there is no console call in this module at all.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION D — three legacy configuration behaviours have no target analogue and are recorded as
 * omissions rather than modelled (AAP §0.8.2 Guideline 6).
 *
 * 1. Application-instance naming. config/configApplication.cfm:L1 computes
 *    `this.name = "slatwall" & hash(getCurrentTemplatePath())`, deriving a per-deployment
 *    application name so that two copies on one server get separate application scopes. A
 *    stateless invocation has no application scope to name and no sibling deployment to
 *    disambiguate from, so the value has nothing to control. It is not modelled, and no
 *    application-name variable is introduced.
 *
 * 2. The ORM component-path append. config/configORM.cfm:L1 does
 *    `arrayAppend(this.ormsettings.cfclocation, "/Slatwall/integrationServices")`, which is how
 *    integrationServices/google/Integration.cfc came to be discovered at all: the framework
 *    scanned that path at start-up and picked up whatever implemented the integration contract
 *    (AAP IR-11). This port replaces discovery-by-path with an explicit typed import of
 *    src/integrations/google/GoogleIntegration.ts, per transformation rules R2 and TR-3 —
 *    framework magic becomes a compile-checked declaration. A search path is consequently not a
 *    configuration value here, and there is no variable for it.
 *
 * 3. The configuration-layering chain. org/Hibachi/Hibachi.cfc:L16 includes
 *    ../../config/configApplication.cfm inside a `try{}catch(any e){}` that swallows every error,
 *    and org/Hibachi/Hibachi.cfc:L18 then includes ../../custom/config/configApplication.cfm the
 *    same way, so a deployment could silently override any application setting. That chain is not
 *    reproduced: there is no override file, no layered merge, no fallback source and no silent
 *    catch. The evidence that nothing is lost is AAP §0.2.2.2, which verifies that custom/**
 *    contains "nothing but readme stubs, so there are zero catalog overrides to reconcile". One
 *    environment, read once, validated once.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION E — transport security and the pool's resource bounds are OPERATOR-SUPPLIED facts, and
 * no figure is invented for any of them (AAP §0.4.1.3; standard S9; requirement IR-12; security
 * finding SEC-12).
 *
 * WHY THESE FOUR VARIABLES EXIST AT ALL, WHEN THE LEGACY SOURCE DECLARES NONE
 * --------------------------------------------------------------------------
 * This is a driver-default problem, not a legacy-behaviour problem, and the distinction is what
 * licenses the change. The legacy application delegated the entire connection to the application
 * server (DECISION B), so there is no in-source original that says anything about transport
 * security or pool capacity. What makes "carry nothing over" the wrong reading here is that the
 * driver's behaviour in the ABSENCE of an explicit setting is not neutral:
 *   - no TLS is negotiated at all, so credentials and every Sw* row cross the network in
 *     cleartext; and
 *   - the queue of waiting connection requests is UNLIMITED, because the driver documents zero as
 *     the no-limit sentinel for it and zero is what applies when nothing is set.
 *
 * Omitting the settings therefore selects the insecure and the unbounded arrangement rather than
 * declining to choose. Four facts are consequently declared — and every one of them is supplied
 * by the operator, so this module still states no figure of its own.
 *
 * WHY THEY ARRIVE HERE, AND AS REQUIRED VALUES
 * -------------------------------------------
 * AAP §0.4.1.3 dictates the shape of precisely this change: pool sizing "is not carried over
 * because the legacy application delegates pooling to the CF/Railo server and pins nothing in
 * source". src/config/database.ts holds that same clause as its DECISION C and states the only
 * admissible form a knob may take — "it arrives through src/config/env.ts as an operator-supplied
 * value with no default invented in source, and the environment template declares it. It does not
 * arrive as a literal here." That is exactly the form used: four names read below, four values
 * required, no default substituted for any of them, and every one mirrored by name in
 * slatwall-ts/.env.example.
 *
 * Requiring them rather than defaulting them is the same fail-fast contract DECISION C inherits
 * from config/configORM.cfm:L4-L7, applied to the same class of fact as the other five: a
 * deployment that has not stated its transport mode or its capacity bounds is a deployment whose
 * operator has not yet decided, and it fails at load naming the variable rather than running with
 * a figure this port chose on their behalf.
 *
 * WHY NO UPPER BOUND IS IMPOSED ON THE THREE NUMBERS
 * -------------------------------------------------
 * Each of the three is validated as a plain base-ten integer of at least one, and no ceiling is
 * checked. The lower bound is arithmetic rather than invented — a pool that may hold fewer than
 * one connection can never connect, a queue that may hold fewer than one request cannot queue, and
 * a timeout of less than one millisecond cannot elapse — and rejecting zero is what actually
 * closes the finding, because zero is the driver's documented no-limit sentinel for the queue.
 * A ceiling, by contrast, would be a capacity figure with no source, and standard S9 forbids
 * exactly that: "No SLAs, latency targets, throughput figures or capacity numbers that the source
 * does not state." The security property the finding asks for is that this port ship no unbounded
 * default, and an operator-stated finite integer delivers it; choosing the magnitude is the
 * operator's decision, not this port's.
 *
 * WHY CLEARTEXT IS GATED ON A LOOPBACK HOST RATHER THAN MERELY DISCOURAGED
 * ----------------------------------------------------------------------
 * A transport mode that can be turned off by one environment variable is a control that will be
 * turned off. So {@link DatabaseTlsMode} carries two tokens and the unverified one is accepted
 * ONLY when the host is a loopback literal — which makes cleartext to a remote server not
 * discouraged but INEXPRESSIBLE, while leaving the local-development arrangement the setup log
 * describes (a container published on 127.0.0.1, presenting a self-signed certificate no public
 * trust store can verify) working unchanged. The check is a validation rule derived from the
 * addresses the platform reserves for loopback, not a policy figure, so it invents nothing.
 *
 * A private certificate authority needs no variable and no code here: Node reads additional
 * trusted roots from its own documented environment mechanism, so a deployment fronted by a
 * private CA supplies the root to the runtime and still runs in the verified mode. That is why
 * there is no certificate, key, passphrase or CA-path variable below — the port neither reads a
 * file nor parses a certificate, and src/config/env.ts imports no Node builtin.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION F — the Google feed's host authority arrives as CONFIGURATION, because a stateless
 * invocation has no request scope to read it from
 * (AAP §0.4.1.10; AAP §0.6.6 / IR-10; standard S9; requirement IR-12).
 *
 * WHY A VARIABLE OUTSIDE THE CONNECTION SET EXISTS AT ALL
 * -------------------------------------------------------
 * integrationServices/google/views/feed/product.cfm interpolates `CGI.HTTP_HOST` into all five of
 * its absolute URLs — :L14, :L15, :L22, :L23 and :L24 — with no validation of any kind. There is
 * no `CGI` scope on the target platform, and the routed feed operation in
 * src/handlers/googleFeedHandler.ts takes no invocation event, so the value cannot be read the way
 * the view reads it. The only ambient source left is configuration, and the sole-reader invariant
 * above means it has to come from HERE. That is the whole reason this variable exists.
 *
 * This is an EXECUTION-MODEL ADAPTATION, recorded in the same register as the M-series mismatches of
 * AAP §0.6.6 rather than resolved by guesswork (IR-10). It is stated rather than claimed as an
 * improvement: under the legacy two requests carrying two different host headers produce two
 * different documents, whereas here every invocation produces the configured host.
 *
 * WHY IT IS REQUIRED RATHER THAN DEFAULTED
 * ----------------------------------------
 * Same fail-fast contract as every other required name, inherited from config/configORM.cfm:L4-L7.
 * There is no host to inherit — the legacy read one from the request and recorded none in source — so any
 * value this module supplied on the operator's behalf would be invented, which standard S9 forbids
 * outright. A deployment that renders a merchant feed without having stated its own host is a
 * deployment whose operator has not yet decided, and failing at load naming the variable is the same
 * completeness rule the five required connection facts obey. It is a configuration-completeness rule,
 * NOT a security control.
 *
 * ⭐ THE SYNTAX RULE IS IN FORCE, IN TWO PLACES, AND THE FOUR-REVISION HISTORY IS KEPT
 * ------------------------------------------------------------------------------------------
 * This section has been rewritten four times. The history is kept because each revision's argument is worth
 * having on record, and because a future revision proposing to withdraw the rule again should have to
 * answer the one that decided it.
 *
 * ⛔ REVISION 1 said "no syntax rule runs anywhere", on the ground that the legacy view performs no check
 * and that refusing a configured host is an outcome change forbidden by AAP §0.8.2 Guideline 4.
 *
 * ⛔ REVISION 2 answered that this bundled two separable things and rejected the bundle: an INVENTED
 * authority policy (a character allowlist of its own devising, a 63-octet DNS-label ceiling the source
 * states nowhere, a fail-closed `allowedHosts` membership gate) and a TRANSCRIBED grammar with a published
 * source. It kept the first withdrawn and reinstated the second in two places: a
 * `requireHostAuthorityValue` reader here transcribing RFC 3986 §3.2.2 `host` with §3.2.3's optional
 * `port` — RFC 9110 §7.2 defines the HTTP `Host` field value as exactly that, and `CGI.HTTP_HOST` IS that
 * field value, so a value outside the production could never have reached `:L14`, `:L15`, `:L22`, `:L23`
 * or `:L24` — and a deny check at the serializer's sink. It also corrected the D18 reading revision 1
 * relied on, and that correction is right and is preserved: parameterised SQL does NOT return the same rows
 * as interpolated SQL for an input containing a quote, so D18's real test is that the divergence falls only
 * where the legacy's own behaviour was the flaw.
 *
 * ⛔ REVISION 3 ACCEPTED ALL OF REVISION 2'S ANALYSIS AND WITHDREW BOTH RULES ANYWAY, on the CARDINALITY
 * of the register rather than the shape of the divergence: AAP §0.6.7.7 does not license departures OF A
 * KIND, it names exactly ONE — D18 — so that a reviewer diffing behaviour has exactly one entry to check.
 *
 * ⭐ REVISION 4, THIS ONE, REINSTATES REVISION 2'S TWO RULES, AND THE CARDINALITY OBJECTION DOES NOT
 * REACH THEM. Review finding F8 classifies the unvalidated read as a MAJOR security defect — CWE-20
 * feeding CWE-601 — and directs that the value be validated as `host [ ":" port ]`. Revision 3's count
 * argument presumes the rule IS a behavioural departure, and on the evidence revision 2 itself assembled it
 * is not: `GOOGLE_FEED_HOST` is a variable this port INTRODUCED, and RFC 9110 §7.2 already defines the
 * legacy value it stands in for as precisely this production. A rule that admits every value the legacy
 * input could hold and refuses only values it could not hold FORECLOSES NO LEGACY OUTCOME, so there is no
 * behaviour on either side of it to enter in a register. It is alignment of a new input with an old value
 * space, and AAP §0.6.7.7's count is untouched by it.
 *
 * ⚠️ WHAT DOES ENTER THE REGISTER IS THE SCHEME. `product.cfm:L14`, `:L15`, `:L22`, `:L23` and `:L24`
 * hard-code `http://`, and the port emits `https://`. THAT is a genuine behavioural divergence, it is
 * directed by finding F8 (CWE-319), and it is declared as such — the second and only other entry beside
 * D18 — in src/integrations/google/ProductFeedBuilder.ts and in slatwall-ts/README.md. It is recorded
 * where the divergence is made, not here, because this module composes no URL.
 *
 * ⛔ AND THE INVENTED POLICIES OF REVISION 2'S FIRST GROUP STAY WITHDRAWN, ON THEIR OWN STRONGER GROUND.
 * A character allowlist and a 63-octet ceiling are figures the source states nowhere (standard S9,
 * IR-12), and an `allowedHosts` membership gate additionally refuses hosts a conforming deployment may
 * legitimately name. Those fail two tests rather than one, and the distinction is worth keeping: a future
 * proposal should say which of the three it is. {@link requireHostAuthorityValue} transcribes the grammar
 * and stops there.
 *
 * ✅ SO WHAT RUNS IS {@link requireNonBlankValue} FOR COMPLETENESS AND
 * {@link requireHostAuthorityValue} FOR SHAPE, AT LOAD, ONCE. And the serializer's
 * `validateFeedHostAuthority` re-applies the same rule per render, because its render context is a plain
 * `string` a caller could assemble without passing through this module — two independent checks of one
 * rule, neither trusting the other to have run.
 *
 * ⚠️ WHAT IS STILL CARRIED, AND MUST NOT BE READ AS CLOSED BY THE ABOVE (S8). The grammar admits `&`
 * and `'`, because RFC 3986 `reg-name` admits them, and the serializer no longer escapes the raw sinks
 * (finding CQ-9) — so a host containing `&` reaches `<link>` and `<description>` as itself. The serializer's
 * {@link renderRawFeedNode} REFUSES that value rather than publishing an unparseable document, which is
 * where that half is answered. And the SHAPE was never the whole of it: an operator who names a host they
 * do not control gets a feed pointing at that host, exactly as the legacy would for any `Host` header it
 * was handed, and deciding WHICH authority is legitimate has no source in the legacy code at all.
 *
 * src/handlers/googleFeedHandler.ts reads `config.googleFeed.host` from here and hands it to the render
 * context UNMODIFIED — not trimmed, not folded, not punycoded, not stripped of a default port and not
 * rewritten — having first re-checked its shape through the serializer's exported rule.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION G — the three setting values whose LEGACY DEFAULT IS COMPUTED AT RUN TIME are read HERE,
 * because a value the legacy derived by calling services this slice excludes cannot come from a
 * frozen table, and the only other places it could come from are a container literal or an invented
 * default — both forbidden (AAP §0.7.3 standard 3 and standard 9; IR-12).
 *
 * WHAT THE GAP IS
 * ---------------
 * src/adapters/settings/StaticSettingResolver.ts resolves the eighteen setting names this slice
 * reads. FIFTEEN of them come from frozen literals carried from
 * config/dbdata/SlatwallSetting.xml.cfm and the entity metadata defaults, and need nothing from the
 * environment. THREE do not, because [model/service/SettingService.cfc:L164, :L222, :L223] COMPUTE
 * them — two by calling the `Currency*` and `Fulfillment*` services AAP §0.2.2.1 excludes, and one
 * from the CFML application scope, which has no counterpart in a stateless invocation. That
 * adapter's `StaticSettingResolverConfiguration` is the shape those three arrive in, and
 * {@link SettingsConfig} below is that shape read from the environment.
 *
 * ⭐ ALL THREE ARE OPTIONAL, HERE AND AT THE ADAPTER, AND THE OPTIONALITY IS THE CONTRACT.
 * `StaticSettingResolver`'s constructor takes ONE argument that defaults to `{}`, so a deployment
 * that reads only `globalDateFormat` states nothing and every frozen name still resolves; supplying
 * one value makes ONE further name resolvable and omitting it leaves that ONE name — and only that
 * name — raising a classified configuration error. Under `exactOptionalPropertyTypes` an omitted
 * member is ABSENT rather than `undefined`, and {@link loadSettingsConfig} preserves that
 * distinction by never writing an absent key.
 *
 * ⛔ THREE FURTHER SECTIONS ONCE STOOD UNDER THIS DECISION AND ARE ALL WITHDRAWN, because the
 * REQUIRED, no-default collaborator each one fed has itself been withdrawn on AAP authority. The
 * reason belongs to each withdrawing file, so each is quoted in its own words:
 *   - src/util/urlTitle.ts, on its removed `UrlTitleAttemptBudget`: "The legacy states no ceiling,
 *     so every possible value of one is a fabricated number. Passing the fabrication to the caller
 *     as a required argument relocated the invention; it did not avoid it." The collision loop at
 *     model/service/DataService.cfc:L64 is unbounded in the legacy and is unbounded in the port.
 *     ⭐ AND A BOUND HAS SINCE BEEN REINSTATED FOR THAT LOOP TOO, by review finding F5 — but NOT inside
 *     the algorithm and NOT as configuration. the probe-budget section of `src/util/urlTitle.ts` wraps the injected PROBE,
 *     optionally, with no default, and `src/util/urlTitle.ts` is unchanged. THE DECISION IN THIS FILE IS
 *     UNAFFECTED for the same reason as the budget below: an optional collaborator obliges no deployment
 *     to state a figure, so there is still nothing here to load.
 *     ⚠️ A BOUND WAS BRIEFLY REINSTATED FOR THAT LOOP — outside the algorithm, wrapping the injected
 *     probe — and it has been WITHDRAWN AGAIN, so the loop is unbounded once more and there is still
 *     nothing here to load. THE DECISION IN THIS FILE IS UNAFFECTED either way.
 *   - src/services/SkuService.ts, on its then-removed `SkuCombinationBudget`: "Requiring the composition
 *     root to supply the maximum RELOCATED the fabrication rather than avoiding it: the number still
 *     had to be invented by somebody before the graph could be built at all."
 *   - src/ports/repositories/ProductRepository.ts, on the `ProductImportSourcePolicy` its SEC-08 gate
 *     was configured by: an implementation "must still NOT invent a host allow-list, a byte cap, a
 *     timeout or a redirect count. The source names no host and states no figure, so every possible
 *     value of each is a fabrication that AAP §0.7.3 standard 9 and IR-12 forbid."
 *
 * ⚠️ THE THIRD ENTRY WAS RE-ADJUDICATED BY REVIEW FINDING F8, AND THE CONCLUSION HERE SURVIVES IT
 * UNCHANGED. The SEC-08 gate is no longer withdrawn — a hostile import location IS refused — but every
 * control that came back is a FIXED LITERAL rather than a configurable value: the approved schemes are
 * what `cfhttp` can speak, and the blocked address ranges are defined by RFCs 1122, 1918, 3927, 4193 and
 * 4291. The four things a deployment would have had to supply are precisely the four that STAYED
 * withdrawn, which is why no `ProductImportConfig` returns with the gate and the quotation above is
 * taken from the clause that still forbids them.
 *
 * KEEPING THEIR LOADERS AFTER THE COLLABORATORS WENT WOULD HAVE BEEN THE SAME RELOCATION ALL THREE
 * REJECT. Seven environment variables — five import-policy values, one URL-title budget, one
 * combination budget — would have stayed MANDATORY under DECISION C's fail-fast contract, so every
 * deployment would have had to invent seven numbers before the service could start, to configure
 * behaviour no collaborator in this subtree can reach. Reading a value nothing consumes is not a
 * harmless leftover; it is an invented policy with a longer commute. Their shapes and loaders are
 * therefore removed and recorded in place — see the note above {@link SettingsConfig} and the loader
 * note above {@link loadSettingsConfig}.
 *
 * WHY THE SHAPE IS RESTATED LOCALLY INSTEAD OF IMPORTED
 * ----------------------------------------------------
 * Exactly the DECISION F precedent, and for the identical reason. `GoogleFeedConfig` is declared
 * here as a plain shape and the handler declares the shape it needs independently; the two meet
 * structurally at the composition root, which is what keeps the arrow pointing outward even though
 * both files are delivered. Importing `StaticSettingResolverConfiguration` from
 * src/adapters/** would point the arrow from the config layer INTO the layers that receive
 * configuration — the one direction AAP §0.4.3.5 rules out. So this module imports nothing but its
 * own error type, and structural typing does the rest: a member added to the adapter's interface and
 * not to {@link SettingsConfig} fails to compile at the wiring site, which is the signal that keeps
 * the two in step without an import.
 *
 * WHAT IS STILL NOT READ HERE, SO THE ABSENCES READ AS DECISIONS
 * --------------------------------------------------------------
 *   - No timeout, retry, chunk or queue figure for the importer's ONE-HOUR request budget
 *     [model/service/ProductService.cfc:L65-L68]. That is mismatch M1, it is unrepresentable in a
 *     single invocation, and AAP §0.4.1.9 gives it to src/handlers/productHandler.ts to FLAG. A
 *     variable here would look like a resolution of a mismatch this port deliberately surfaces.
 *   - No figure for the feed's 360-second render budget
 *     [integrationServices/google/views/feed/product.cfm:L9] — mismatch M2, same reasoning.
 *   - No numeric policy of any kind. Every number this module reads is a connection fact of
 *     DECISION E; the three values read under this decision are strings the legacy computed, and no
 *     layer below receives a bound, a ceiling or a budget from here.
 *   - No default the operator has to guess at. The SIX required variables are fatal when absent
 *     (DECISION B, DECISION E, DECISION F) and every one of them appears blank in
 *     slatwall-ts/.env.example so it has to be filled in; the TEN optional ones are commented out
 *     there and are genuinely absent-or-present, with each fallback documented beside its own name and
 *     no number authored by this port.
 *     DECISION E; the three values read under this decision are strings the legacy computed.
 *     ⭐ THIS LAST CLAUSE USED TO END "and no layer below receives a bound, a ceiling or a budget from
 *     here", AND DECISION H HAS SINCE QUALIFIED IT. Review finding SEC-1 (CWE-400) found that the three
 *     bounds which already existed in the code were UNREACHABLE, because no route carried an operator's
 *     figure to the composition root. DECISION H opens exactly that route, for exactly three optional
 *     names, and it is consistent with this decision rather than an exception to it: this module still
 *     AUTHORS no number. It carries one an operator states, and states nothing when they state nothing.
 *   - No default for anything. The TEN required variables are fatal when absent (DECISION B,
 *     DECISION E, DECISION F) and every one of them is blank in slatwall-ts/.env.example; the SIX
 *     optional inputs — three setting values and three resource bounds — are absent-or-present and are
 *     never substituted when absent.
 * ============================================================================================
 *
 * DECISION H — THE THREE FINITE RESOURCE BOUNDS ARE STATEABLE, AND STILL NEVER INVENTED
 *
 * Review finding SEC-1 (CWE-400): `SmartListMaterialisationBudget`, `SkuCombinationBudget` and
 * `UrlTitleProbeBudget` all existed as optional constructor arguments, and `src/config/container.ts`
 * supplied NONE of them — in the pool-bound graph and in the transaction-scoped rebuild alike. The bounds
 * were therefore unreachable: an operator who had measured a figure had nowhere to put it, and the
 * anonymous public feed could be made to materialise an unbounded selection.
 *
 * ⭐ THE FIX IS A ROUTE, NOT A NUMBER. Three OPTIONAL variables — see {@link ResourceBoundsConfig} — carry
 * a figure the DEPLOYMENT measured into the graph. Absent means absent: unbounded, which is the legacy's
 * own behaviour and the state every earlier revision of this file preserved.
 *
 * ⚠️ WHY THIS IS NOT THE THING THE THREE WITHDRAWN LOADERS WERE. `loadSkuCombinationConfig` and its two
 * siblings made a deployment supply a number before this module would build AT ALL, because loading is
 * fail-fast by DECISION C — so the number had to be invented by somebody, and relocating an invention is
 * not avoiding it. These three are optional, so no deployment is obliged to author anything. Making a bound
 * STATEABLE and making it MANDATORY are different decisions, and the withdrawal notes below reject only the
 * second.
 *
 * ⚠️ ONE ROUTE DOES REQUIRE A STATED BOUND, AND THE ASYMMETRY IS DELIBERATE.
 * `src/handlers/googleFeedHandler.ts` declines to render for an ANONYMOUS caller with no
 * `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY` stated, because `google:feed.product` is the one route
 * reachable with no principal and SEC-1's exposure is unbounded ANONYMOUS materialisation specifically.
 * That refusal names no figure — it requires the operator to have named one — and it is applied at
 * INVOCATION rather than at load, so an unstated bound fails the feed alone and not the other 33 routes.
 *   - No default for anything the operator must decide. The SIX required variables are fatal when
 *     absent (DECISION B, DECISION E, DECISION F) and every one of them is blank in
 *     slatwall-ts/.env.example; the THREE optional setting inputs read under this decision are
 *     absent-or-present and are never substituted when absent. The four optional transport and
 *     resource values of DECISION E do have declared absent-behaviour, which is a different thing
 *     from a default invented here — each is either omitted onward so the driver's own documented
 *     behaviour governs, or set to the one value that avoids selecting the driver's unbounded
 *     arrangement silently. DECISION E states each case in full.
 * ============================================================================================ */

/**
 * How the connection to MySQL is protected in transit.
 *
 * Two tokens and no third, because there is no third arrangement this port is willing to open:
 *
 *   `verified` — TLS is required, the server's certificate chain is verified against the
 *     runtime's trust store, and the server's identity is checked against the host connected to.
 *     The mode every deployment that is not a local database uses, and the only mode accepted for
 *     a non-loopback host.
 *
 *   `disabled` — no TLS. Accepted ONLY when {@link DatabaseConfig.host} is a loopback literal, so
 *     it cannot select cleartext across a network. Its whole purpose is the local development
 *     database, whose self-signed certificate no public trust store can verify.
 *
 * Deliberately absent is any token that would keep TLS while skipping verification. An unverified
 * session is indistinguishable from an intercepted one, so offering it would advertise protection
 * this port cannot provide, and no `SslOptions` field that disables verification is set anywhere
 * in src/config/database.ts.
 */
export type DatabaseTlsMode = 'verified' | 'disabled';

/**
 * The connection facts required to reach the existing Sw* schema.
 *
 * Field-by-field provenance, because only two of the nine have any legacy counterpart at all:
 *   `user`     — Application.cfc:L81 (`this.datasource.username`), empty at
 *                org/Hibachi/Hibachi.cfc:L12.
 *   `password` — Application.cfc:L84 (`this.datasource.password`), empty at
 *                org/Hibachi/Hibachi.cfc:L13.
 *   `host`, `port`, `database` — not declared anywhere in legacy source. See DECISION B: the
 *                legacy application named a datasource and let the application server resolve
 *                these out of band, so they are new here by necessity, not by choice.
 *   `tlsMode`, `connectionLimit`, `queueLimit`, `connectTimeoutMs` — likewise not declared
 *                anywhere in legacy source, and present for the reason DECISION E sets out: the
 *                driver's behaviour when they are unset is the unencrypted and the unbounded one,
 *                so declining to state them would select that arrangement rather than decline to
 *                choose. Each is supplied by the operator; none is defaulted here.
 *
 * Every member is `readonly`, and the value exposed as {@link config} is frozen at both levels,
 * so the shape is immutable at type level and at run time alike.
 */
export interface DatabaseConfig {
  /** Host name or address of the MySQL server. Never defaulted. */
  readonly host: string;
  /** TCP port of the MySQL server, validated as an integer in the addressable range. */
  readonly port: number;
  /**
   * Schema holding the Sw* tables.
   *
   * Deliberately NOT defaulted to the legacy datasource alias at
   * config/configApplication.cfm:L2 — that alias is a datasource name, not a schema name
   * (DECISION B).
   */
  readonly database: string;
  /** User the service authenticates as. Never defaulted; may legitimately be empty. */
  readonly user: string;
  /**
   * Password the service authenticates with. Never defaulted; may legitimately be empty, and
   * never logged, echoed, serialized or interpolated anywhere (AAP §0.8.3.9).
   */
  readonly password: string;
  /**
   * How the connection is protected in transit.
   *
   * `disabled` is accepted only for a loopback {@link host} (DECISION E). When the operator states
   * nothing this is `verified`, which is the fail-safe direction: absence encrypts, and the
   * unencrypted arrangement has to be asked for by name.
   */
  readonly tlsMode: DatabaseTlsMode;
  /**
   * Greatest number of connection requests the pool may hold waiting once its connection limit is
   * reached; beyond it, a request fails instead of queueing indefinitely.
   *
   * Zero is rejected: zero is the driver's documented no-limit sentinel, so accepting it would
   * reinstate the unbounded queue this value exists to close. It is the one bound with a fallback —
   * the module's own declared floor — precisely because omitting the option would SELECT that
   * sentinel rather than decline to choose (DECISION E).
   */
  readonly queueLimit: number;
  /**
   * Greatest number of connections the pool may open, when the operator states one.
   *
   * ⭐ ABSENT MEANS "NOT STATED BY THIS SERVICE", and src/config/database.ts then omits the driver
   * option entirely so the driver's own bounded default applies. AAP §0.4.1.3 requires exactly that:
   * pool sizing "is not carried over because the legacy application delegates pooling to the
   * CF/Railo server and pins nothing in source", so a default invented here would be the figure
   * IR-12 forbids. A value that IS supplied is validated as an integer of at least one, with no
   * ceiling, because a ceiling would be an invented capacity figure (DECISION E).
   */
  readonly connectionLimit?: number;
  /**
   * Milliseconds the driver may spend establishing a connection before failing, when the operator
   * states a bound.
   *
   * Absent means the driver's own documented connect timeout applies — the same delegation
   * {@link connectionLimit} describes, and for the same reason. A value that is supplied is
   * validated as an integer of at least one. It bounds connection setup only: it is not a statement,
   * request or invocation timeout, and it is not a latency target of any kind (DECISION E).
   */
  readonly connectTimeoutMs?: number;
}

/**
 * The complete configuration surface of this service.
 *
 * It contains exactly one section because the Catalog slice needs exactly one: reaching the
 * existing MySQL schema. The Minimal Change Clause (AAP §0.8.1) is minimal in FUNCTIONAL SCOPE,
 * so no configuration is carried for any excluded domain family — account, order, vendor,
 * subscription, stock, promotion, physical, attribute, payment, content, price group, shipping,
 * location, tax, setting, inventory, currency, fulfillment or category. The same clause is
 * explicitly NOT minimal in idiom, which is what licenses replacing a runtime product probe and
 * a swallowed include chain with one typed, frozen object.
 */
export interface GoogleFeedConfig {
  /**
   * The host authority every absolute URL in the Google product feed is built on — the canonical
   * replacement for the legacy `CGI.HTTP_HOST` reads at
   * integrationServices/google/views/feed/product.cfm:L14, :L15, :L22, :L23 and :L24.
   *
   * Typed as a plain string HERE and NOT validated anywhere, on purpose. This module checks presence
   * and non-blankness only; the authority-syntax rule that used to run in the serializer is WITHDRAWN,
   * because the legacy performs no check and refusing a configured host is an outcome change. The
   * residual injection and origin-rebasing exposure is FLAGGED rather than closed (S8). See DECISION F
   * for the full argument and for why the arrow does not point upward from config into integrations.
   *
   * IT IS CONFIGURATION RATHER THAN A REQUEST HEADER because a stateless invocation has no request
   * scope — an execution-model adaptation (IR-10), not a control.
   */
  readonly host: string;
}

/*
 * ⛔ THREE CONFIG SHAPES ONCE STOOD HERE — `ProductImportConfig`, `UrlTitleConfig` and
 * `SkuCombinationConfig` — AND ALL THREE ARE REMOVED WITH THEIR LOADERS. Each mirrored a REQUIRED,
 * no-default collaborator input below the config layer, and every one of those inputs has since been
 * withdrawn on AAP authority: the URL-title attempt budget and the SKU combination budget as invented
 * ceilings the legacy states nowhere (AAP §0.8.2 guideline 4, §0.7.3 standard 9, IR-12), and the
 * importer's `ProductImportSourcePolicy` along with the branded source type its SEC-08 gate produced.
 *
 * ⚠️ AND THE IMPORT ENTRY NEEDS ITS REASON RESTATED, BECAUSE THE ONE ORIGINALLY GIVEN HERE HAS BEEN
 * DISPROVED. This said the gate went "because refusing a location the legacy would have fetched changes
 * an outcome and D18 is the SOLE declared behaviour-preservation exception (AAP §0.6.7.7)". Review
 * finding F8 re-opened that: the legacy CANNOT fetch any location at all, because the
 * `utilityTagService` bean its retrieval calls does not exist anywhere in the legacy tree, so there was
 * no outcome for a refusal to change. The gate is therefore back, and
 * `src/ports/repositories/ProductRepository.ts` carries the full re-adjudication.
 *
 * ⭐ WHAT DID NOT COME BACK IS EXACTLY WHAT THIS FILE WOULD HAVE HAD TO SUPPLY. The reinstated controls
 * are fixed literals — the schemes `cfhttp` can speak, and address ranges defined by RFCs 1122, 1918,
 * 3927, 4193 and 4291 — while the host allow-list, byte cap, timeout and redirect count stayed withdrawn
 * as invented figures. A `ProductImportConfig` would have had nothing left to carry, so none is
 * reinstated and this removal stands.
 *
 * ⚠️ THE WITHDRAWALS LISTED ABOVE HAVE BEEN REVERSED AND PARTLY RE-WITHDRAWN BELOW THE CONFIG LAYER, AND
 * THE LIST IS CORRECTED HERE RATHER THAN LEFT TO CONTRADICT THE CODE. What is actually in the tree now:
 *
 *   `SkuCombinationBudget`            WITHDRAWN AGAIN (finding F4). It was reinstated for a time, exported
 *                                     from ../services/SkuService.ts as an OPTIONAL constructor parameter
 *                                     with no default; the withdrawal rests on AAP §0.6.7.7 declaring D18
 *                                     the single behavioural exception in this port, not on the objection
 *                                     that killed its earlier REQUIRED form.
 *   `UrlTitleProbeBudget`             REINSTATED (finding F5) in ../util/urlTitle.ts (probe-budget section), wrapped
 *                                     around the injected probe so the ported algorithm in
 *                                     ../util/urlTitle.ts is untouched.
 * ⚠️ THE WITHDRAWALS LISTED ABOVE HAVE OSCILLATED BELOW THE CONFIG LAYER, AND THE LIST IS CORRECTED HERE
 * RATHER THAN LEFT TO CONTRADICT THE CODE. What is actually in the tree now:
 *
 *   `SkuCombinationBudget`            GONE. Reinstated once as an OPTIONAL constructor parameter on
 *                                     ../services/SkuService.ts and withdrawn again: AAP §0.6.7.7 declares
 *                                     exactly one departure in this port (D18) and an optional ceiling is
 *                                     still a capability the source does not describe.
 *   `UrlTitleProbeBudget`            GONE, with the whole of ../util/urlTitleProbeBudget.ts, on the same
 *                                     ground. ../util/urlTitle.ts records the exposure that is carried.
 *   `ProductImportSourcePolicy`       REINSTATED (findings F8, F9) and, unlike the two budgets, REQUIRED
 *                                     rather than optional — ../ports/repositories/ProductRepository.ts
 *                                     calls it "THE REQUIRED CONTRACT SEC-08 DESCRIBES", and
 *                                     ../adapters/mysql/MySqlProductRepository.ts declares
 *                                     `readonly sourcePolicy` with no `?`.
 *   `ValidatedProductImportSource`    NOT withdrawn: it is declared and exported by that same port and is
 *                                     what `validateSource` returns. AAP §0.4.2.6 ratifies a plain
 *                                     `string` for the public ARGUMENT, and that is unchanged; the brand
 *                                     is the internal evidence that the argument was checked, and it is
 *                                     unforgeable outside the module because its key is never exported.
 *
 * ⭐ AND NOT ONE OF THE FOUR CHANGES THIS FILE'S DECISION, WHICH IS WHY THE CORRECTION COSTS THE LOADER
 * NOTHING. Two are optional and oblige no deployment to state anything. The third is required, but it is
 * required of the COMPOSITION ROOT as a constructor collaborator, not of the ENVIRONMENT as a variable to
 * read — the operator hands over an object, and every scheme, host, address range and bound inside it is
 * the operator's own. The fourth is a type, not a value. So `loadProductImportConfig` stays removed and
 * no environment name returns for any of them.
 *
 * See the loader note further down for each withdrawing file's own words, and DECISION G for the one
 * collaborator that still reads from here.
 */

/**
 * The three setting values whose legacy default is computed at run time — see DECISION G.
 *
 * Structurally the `StaticSettingResolverConfiguration` of
 * src/adapters/settings/StaticSettingResolver.ts. Fifteen of the eighteen names that adapter resolves
 * come from frozen literals and need nothing here; these three do not, because
 * [model/service/SettingService.cfc:L164, :L222, :L223] COMPUTE them, two of them from services this
 * slice excludes.
 *
 * ⭐ ALL THREE ARE OPTIONAL, AND THE OPTIONALITY IS THE CONTRACT RATHER THAN LENIENCY. Supplying a
 * value makes the corresponding setting name resolvable; omitting it leaves that ONE name raising a
 * classified configuration error while every other name continues to work. A deployment that reads
 * only `globalDateFormat` must not be forced to invent currency and fulfillment lists it has no
 * business knowing. Under `exactOptionalPropertyTypes` an omitted member is ABSENT rather than
 * `undefined`, and the loader below preserves that distinction by never writing an absent key.
 */
export interface SettingsConfig {
  /**
   * The CFML application scope's `applicationRootMappingPath`, from which
   * `globalAssetsImageFolderPath` is derived exactly as [model/service/SettingService.cfc:L164]
   * derives it.
   *
   * ⚠️ THE PATH ONLY, WITHOUT the `/custom/assets/images` suffix. The suffix is the legacy's and the
   * setting adapter appends it, so supplying a path that already includes it produces a doubled
   * suffix. Stated here because this is the value an operator types.
   */
  readonly applicationRootMappingPath?: string;

  /**
   * The comma-delimited currency identifier list [model/service/SettingService.cfc:L222] computes as
   * `getCurrencyService().getAllActiveCurrencyIDList()`.
   *
   * Carried as a delimited STRING rather than an array because the legacy consumer reads it with list
   * functions — [model/entity/Sku.cfc:L373] and [:L375] — and the `Currency*` family is out of scope
   * (AAP §0.2.2.1), so the deployment supplies the list that service would have returned.
   */
  readonly skuEligibleCurrencies?: string;

  /**
   * The comma-delimited fulfillment-method identifier list
   * [model/service/SettingService.cfc:L223] computes as
   * `getFulfillmentService().getAllActiveFulfillmentMethodIDList()`.
   *
   * A delimited string for the same reason as the currency list. Two independent facts make it
   * unanswerable statically: the computation reaches the excluded `Fulfillment*` family, and the
   * three seeded rows at [config/dbdata/SlatwallSetting.xml.cfm:L14-L16] are scoped by
   * `productTypeID` while the port's resolution context carries an entity kind and identifier only.
   */
  readonly skuEligibleFulfillmentMethods?: string;
}

/**
 * The three FINITE RESOURCE BOUNDS a deployment may state, so the composition root can wire them.
 *
 * ⭐ WHY THIS SECTION EXISTS: REVIEW FINDING SEC-1 (CWE-400). Three bounds already existed in the code —
 * `SmartListMaterialisationBudget`, `SkuCombinationBudget` and `UrlTitleProbeBudget` — each as an OPTIONAL
 * constructor argument with no default. SEC-1 found that `../config/container.ts` supplied NONE of them, in
 * the pool-bound graph and in the transaction-scoped rebuild alike, so every bound was UNREACHABLE: an
 * operator who had measured a figure had no way to state it, and the anonymous public feed could be made to
 * materialise an unbounded selection. This section is the missing route from an operator's decision to the
 * graph.
 *
 * ⭐ AND IT INVENTS NOTHING, WHICH IS THE CONSTRAINT THAT SHAPES EVERY MEMBER BELOW (AAP §0.7.3 S9,
 * IR-12). Every member is OPTIONAL and there is NO DEFAULT, NO FALLBACK and NO SUGGESTED VALUE anywhere in
 * this file or in the container. An absent variable leaves the corresponding collaborator exactly as the
 * legacy behaved — unbounded — and a present one states a figure the DEPLOYMENT measured. The distinction
 * matters because it is what separates this section from the three loaders withdrawn below: those required
 * a deployment to supply a number before the module would build at all, which made the number a
 * fabrication with a different author. Making a bound STATEABLE is not the same as making it MANDATORY.
 *
 * ⚠️ ONE PLACE DOES MAKE A BOUND MANDATORY, AND IT IS SCOPED TO THE ROUTE THAT NEEDS IT.
 * `../handlers/googleFeedHandler.ts` refuses to render for an ANONYMOUS caller unless
 * {@link ResourceBoundsConfig.smartListMaximumRecordsPerQuery} is stated, because `google:feed.product` is
 * the one route reachable with no principal and SEC-1's exposure is specifically unbounded ANONYMOUS
 * materialisation. That refusal names no figure either — it requires the operator to have named one — and
 * it is deferred to invocation so an unstated bound fails the feed alone rather than the whole router.
 *
 * ⛔ AND EVERY VALUE GOES THROUGH {@link optionalResourceBoundValue}, SO A PRESENT-BUT-USELESS VALUE FAILS
 * AT LOAD. Zero, a negative, a fraction, `NaN`, `Infinity` and a non-numeric string are all refused by
 * name. A bound of zero is the dangerous one to admit silently — it would refuse every query rather than
 * bounding it — which is why the floor is enforced here and not left to the collaborator.
 */
export interface ResourceBoundsConfig {
  /**
   * The largest number of records ONE smart-list query may materialise — the figure
   * `../adapters/mysql/SmartListQueryBuilder.ts` applies in `execute` AND `executeRecords`.
   *
   * From `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY`. This is the bound the anonymous feed reads through,
   * so it is the one member a deployment must state before `google:feed.product` will serve.
   */
  readonly smartListMaximumRecordsPerQuery?: number;

  /**
   * The largest number of SKU combinations ONE merchandise `createSkus` request may enumerate — the figure
   * `../services/SkuService.ts` applies to the odometer enumeration of
   * [model/service/SkuService.cfc:L58-L211].
   *
   * From `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`. A value of 1 is meaningful rather than degenerate:
   * [:L67] starts `totalCombos` at 1, so a ceiling of 1 admits the option-less default SKU and refuses
   * everything larger.
   */
  readonly skuMaximumCombinationsPerRequest?: number;

  /**
   * The maximum number of uniqueness probes ONE URL-title derivation may issue.
   *
   * ⛔ NOTHING READS IT. The `UrlTitleProbeBudget` that applied it, and the `../util/urlTitleProbeBudget.ts`
   * leaf it lived in, are both WITHDRAWN — see the withdrawal record above. The member is retained only so an
   * operator's existing setting is still parsed rather than silently rejected.
   *
   * From `CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION`. It bounds the probe rather than the algorithm:
   * `../util/urlTitle.ts` is untouched, so the `-2`-first suffix sequence of
   * [model/service/DataService.cfc:L53-L71] is unchanged for every derivation that stays in budget.
   */
  readonly urlTitleMaximumProbesPerDerivation?: number;
}

export interface AppConfig {
  readonly database: DatabaseConfig;

  /**
   * The Google product feed section — see {@link GoogleFeedConfig} and DECISION F.
   *
   * Present as its own section rather than as a loose member so that the two concerns stay
   * separable: a deployment reading this section is rendering a merchant feed, and a deployment
   * reading {@link AppConfig.database} is reaching the Sw* schema. Nothing in the feed section is a
   * connection fact and nothing in the database section is a presentation fact.
   */
  readonly googleFeed: GoogleFeedConfig;

  /** The three run-time-computed setting values — see {@link SettingsConfig} and DECISION G. */
  readonly settings: SettingsConfig;

  /**
   * The three optional finite resource bounds — see {@link ResourceBoundsConfig} and review finding SEC-1.
   *
   * Present as its own section for the same reason the feed and database sections are separate: a bound is
   * a POLICY fact an operator measured, not a connection fact and not a presentation fact. The section is
   * always present; every member inside it may be absent.
   */
  readonly resourceBounds: ResourceBoundsConfig;
}

/* ==============================================================================================
 * VALIDATION HELPERS
 *
 * SIX READERS — five that must produce a value and one that may return `undefined` — plus the
 * loopback predicate one of them consults, one shared argument shape, and three shared guarantees.
 *
 * Guarantee 1 — no unsound narrowing. An environment read is typed `string | undefined`, and
 * `noUncheckedIndexedAccess` means that stays true however the read is written. Each helper
 * narrows it with a real `typeof` test, so nothing here uses a non-null assertion, a type
 * assertion of any kind, an unsafe escape hatch or a suppression comment (standard S1). The
 * compiler contract in tsconfig.json is never weakened to admit code; the code is written to
 * satisfy it.
 *
 * Guarantee 2 — no value ever leaves a helper except as its return value. A message, and the
 * structured context attached to it, carry the VARIABLE NAME only. Naming DB_PASSWORD as absent
 * is required so an operator can fix the deployment; disclosing what it held is forbidden
 * (AAP §0.8.3.9, DECISION C).
 *
 * Guarantee 3 — values are returned exactly as supplied, never normalised. Whitespace is used to
 * DETECT a blank value, and for the numeric parse, but a surviving value is handed back verbatim.
 * Trimming would be a silent transformation of operator input, and it would be outright wrong for
 * a password, where leading or trailing whitespace can be significant.
 *
 * "Required" throughout means PRESENT. Absence of any of the SIX required variables is fatal, and no
 * default is ever substituted for any of them (DECISION B, DECISION E, DECISION F, standard S9): FIVE
 * are connection facts — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — and ONE is the
 * Google feed host (DECISION F).
 *
 * TEN FURTHER VARIABLES ARE OPTIONAL, which brings the key set this module reads to SIXTEEN names in
 * total: the transport mode and the three pool bounds of DECISION E (`DB_TLS_MODE`,
 * `DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS`), the three run-time-computed setting
 * inputs of {@link SettingsConfig} (DECISION G), and the three finite resource bounds of
 * {@link ResourceBoundsConfig} (DECISION H). Optional means genuinely absent-or-present: an omitted one
 * takes the fallback documented at its own reader — a safe direction or the driver's own default, never a
 * figure authored here — and a present-but-blank one is still an error, since blank cannot be what an
 * operator meant by supplying the name at all. That last rule is why every optional name in
 * slatwall-ts/.env.example is commented out rather than left as a bare empty assignment.
 *
 * ⚠️ THE COUNT HAS MOVED TWICE AND BOTH MOVES ARE RECORDED, because a census a reader cannot trust is
 * worse than none. It first read "TEN required and THREE optional", treating all nine connection facts as
 * required; review finding F7 corrected that to SIX and SEVEN, readable straight off the `require*` and
 * `optional*` helper calls. Review finding SEC-1 then added {@link loadResourceBoundsConfig}'s three
 * `CATALOG_*` names, all optional and all defaultless, taking the totals to SIX and TEN. Two of those three
 * bounds — the SKU combination ceiling and the URL-title probe ceiling — are read but no longer APPLIED,
 * their budgets having been withdrawn; they are still parsed so that an operator's existing setting is not
 * silently rejected, and they still count toward the key set this module reads.
 *
 * ⚠️ OPTIONAL IS NOT LENIENT, AND IT DOES NOT MEAN ONE RULE. An omitted variable is never replaced by
 * a value chosen arbitrarily: each optional name has a DECLARED behaviour when absent — the verified
 * transport mode for `DB_TLS_MODE`, omission of the pool option entirely for the connection limit and
 * the connect timeout, the lowest permitted bound for `DB_QUEUE_LIMIT` because the driver reads unset
 * as unlimited, and a per-name classified error at resolution time for the three settings. A
 * present-but-BLANK value remains an error for every one of the sixteen, since blank cannot be what
 * an operator meant by supplying the name at all.
 *
The loader uses `require*` helpers for exactly six names and `optional*` helpers for the
 * other ten, so the count is readable straight off {@link loadDatabaseConfig},
 * {@link loadGoogleFeedConfig}, {@link loadSettingsConfig} and {@link loadResourceBoundsConfig}.
 * ============================================================================================ */

/**
 * Matches an unsigned base-ten integer and nothing else.
 *
 * This guard runs BEFORE the numeric conversion because numeric conversion in JavaScript is far
 * more permissive than a port number warrants, and every one of those permissions would silently
 * accept a misconfiguration: an empty string converts to zero, a `0x`-prefixed string is read as
 * hexadecimal, an `e`-notation string expands, a fractional string converts without complaint,
 * surrounding whitespace is ignored and an explicit sign is accepted. Rejecting anything that is
 * not a plain run of digits first makes the conversion total, so the parse below cannot produce a
 * surprising number and cannot produce `NaN`.
 */
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

/**
 * Lowest addressable TCP port. Port zero is reserved and cannot be connected to.
 *
 * This bound and {@link HIGHEST_ADDRESSABLE_TCP_PORT} are published platform limits — the TCP port
 * field is a 16-bit unsigned integer — which is the one category of number this port may state
 * without a source locator (standard S9). Neither is a default: no port value is ever supplied on
 * the operator's behalf, and the conventional MySQL port number appears nowhere in this file.
 */
const LOWEST_ADDRESSABLE_TCP_PORT = 1;

/** Highest addressable TCP port, the maximum of the protocol's 16-bit unsigned port field. */
const HIGHEST_ADDRESSABLE_TCP_PORT = 65535;

/**
 * Smallest value a pool bound or a connection timeout may take.
 *
 * Arithmetic rather than invented, which is what keeps it clear of standard S9: a pool that may
 * hold fewer than one connection can never connect, a queue that may hold fewer than one request
 * cannot queue, and a timeout shorter than one millisecond cannot elapse. Rejecting zero is the
 * substance of the bound, because zero is the driver's documented no-limit sentinel for the queue
 * (DECISION E). No corresponding ceiling exists here, deliberately — see DECISION E for why one
 * would be a capacity figure with no source. It is the floor for all three numbers this module
 * reads and, since the withdrawal recorded immediately below, the ONLY floor.
 */
const LOWEST_PERMITTED_RESOURCE_BOUND = 1;

/**
 * The transport mode used when `DB_TLS_MODE` is not set at all.
 *
 * ⭐ FAIL-SAFE BY CONSTRUCTION. `verified` is the mode that requires TLS, verifies the server's chain
 * against the runtime's trust store and checks the certificate against the host connected to. Absence
 * therefore encrypts; the unencrypted mode is reachable only by naming it, and then only for a loopback
 * host. A default in the other direction would mean a deployment that forgot one variable shipped
 * credentials and rows in cleartext, which is precisely the outcome the mode exists to prevent.
 */
const DEFAULT_DATABASE_TLS_MODE: DatabaseTlsMode = 'verified';

/**
 * The longest a MySQL database identifier may be.
 *
 * ⛔ A DOCUMENTED SERVER LIMIT, NOT A BOUND THIS PORT CHOSE (IR-12, standard S9). MySQL specifies 64
 * characters as the maximum length of a database, table or column identifier; a longer `DB_NAME` cannot
 * name a schema on any server, whatever its capacity. So this is not a quota, a capacity estimate or a
 * service level — it is the point past which the value provably cannot be what it claims to be, which
 * is the only kind of numeric bound this module is permitted to hold. It is read by exactly one reader,
 * {@link requireDatabaseSchemaValue}, and it caps nothing the server would otherwise have accepted.
 */
const MAX_MYSQL_IDENTIFIER_LENGTH = 64;

/*
 * ⛔ A `LOWEST_PERMITTED_HOP_BOUND` OF ZERO ONCE STOOD HERE, AS THE ONE ASYMMETRY IN THE NUMERIC
 * READERS, AND THE FLOOR PARAMETER THAT CARRIED IT IS GONE WITH IT. The zero floor existed solely so
 * the withdrawn import policy's redirect count could accept "follow none"; with that shape removed
 * — see DECISION G and the note above {@link SettingsConfig} — all three surviving numeric reads are
 * resource bounds that must admit something. So {@link requireResourceBoundValue} applies
 * {@link LOWEST_PERMITTED_RESOURCE_BOUND} itself rather than taking a floor argument that every
 * caller would now pass the same value for: a parameter with one possible value documents a choice
 * that no longer exists.
 */

/*
 * ⛔ A `LIST_DELIMITER` COMMA ONCE STOOD HERE, AND SO DID THE `requireDelimitedListValue` READER
 * FURTHER DOWN THAT WAS ITS ONLY USER. Both are removed, because the two allowlists they split were
 * the withdrawn import policy's schemes and hosts (DECISION G). The two delimited setting values
 * that remain are read WHOLE and never split here: their legacy consumers read them with CFML list
 * functions [model/entity/Sku.cfc:L373, :L375], so splitting them at the boundary would hand the
 * setting adapter a shape the legacy never produced.
 */

/**
 * Highest value an IPv4 dotted-quad octet may take, the maximum of its 8-bit unsigned field.
 *
 * A published protocol limit, like the TCP port bounds above, and therefore in the one category of
 * number this port may state without a source locator (standard S9). Used only to decide whether a
 * configured host is a loopback literal, never to build or normalise an address.
 */
const HIGHEST_IPV4_OCTET = 255;

/** Number of dotted-quad components in an IPv4 literal. */
const IPV4_OCTET_COUNT = 4;

/** First octet of the block reserved for IPv4 loopback, 127.0.0.0/8. */
const IPV4_LOOPBACK_PREFIX = '127';

/**
 * The non-dotted-quad spellings of the loopback host that are accepted as local.
 *
 * `localhost` is the name every platform reserves for the loopback interface; the remainder are
 * the IPv6 loopback address in its compressed and fully expanded forms, each also in the bracketed
 * form a host field may carry. Anything outside this list and outside 127.0.0.0/8 is treated as
 * remote, which is the fail-safe direction: an unrecognised spelling forces the verified transport
 * mode rather than permitting cleartext (DECISION E).
 */
const LOOPBACK_HOST_NAMES: readonly string[] = [
  'localhost',
  '::1',
  '[::1]',
  '0:0:0:0:0:0:0:1',
  '[0:0:0:0:0:0:0:1]',
];

/* ==============================================================================================
 * THE FIVE CONSTANTS BELOW TRANSCRIBE THE RFC 3986 §3.2.2 `host` PRODUCTION, AND THEY HAVE TWO CONSUMERS
 *
 * ⭐ {@link requireDatabaseHostValue} FOR `DB_HOST`, AND {@link requireHostAuthorityValue} FOR
 * `GOOGLE_FEED_HOST` — the latter adding RFC 3986 §3.2.3's optional `port`, because an HTTP authority may
 * carry one where a `mysql2` host may not (`DB_PORT` is its own variable). The feed reader was WITHDRAWN for
 * one revision and review finding F8 reinstated it; the adjudication is at {@link
 * requireHostAuthorityValue}, and turns on `GOOGLE_FEED_HOST` standing in for `CGI.HTTP_HOST`, which
 * RFC 9110 §7.2 already DEFINES as exactly this production — so the rule aligns a port-introduced variable
 * with the value space of the legacy input it replaces rather than diverging from any legacy outcome.
 *
 * ⭐ WHY THEY SURVIVE FOR `DB_HOST`. That variable stands in for the `Slatwall` datasource DEFINITION at
 * `config/configApplication.cfm:L2`, not for a value the legacy emitted. A host outside this production
 * cannot be connected to under either system — `mysql://10.0.0.1`, `user:pw@10.0.0.1`, a trailing newline,
 * a filesystem socket path — so refusing it at load forecloses no successful legacy outcome; it replaces an
 * opaque driver failure with a message naming the variable. That is the same discipline
 * {@link requireTcpPortValue} applies in refusing a port outside the protocol's own 16-bit field.
 *
 * ⛔ WHAT WAS NEVER PERMISSIBLE AND STILL IS NOT: a character allowlist of this port's own devising, a
 * 63-octet DNS-label ceiling the source states nowhere, and a fail-closed `allowedHosts` membership gate.
 * Each states a figure or a policy with no source locator (standard S9, IR-12), and a membership gate
 * additionally refuses hosts a conforming deployment may legitimately name. The constants below invent
 * nothing: what they accept is what RFC 3986 accepts, including percent-encoding and every sub-delimiter
 * (`&` and `'` among them) that a narrower rule would have had to invent its way out of.
 *
 * WHAT IS DELIBERATELY STILL ACCEPTED. RFC 3986 `reg-name` admits percent-encoding and every
 * sub-delimiter, which includes `&` and `'`. Narrowing those away would be invention, so they are accepted
 * here — and they stay accepted even though the serializer no longer escapes them. An earlier revision of
 * src/integrations/google/ProductFeedBuilder.ts escaped every dynamic text node, so an accepted `&` reached
 * the feed as `&amp;`; that escape is withdrawn at the raw sinks under the current review's finding F4, and
 * an accepted `&` now reaches the feed verbatim, leaving the document without a defined parse exactly as
 * the legacy leaves it. This boundary still owns only the GRAMMAR. Tightening it to cover a withdrawn
 * encoding would move a serializer's policy into a configuration loader, which is the coupling both files
 * exist to avoid.
 * ⚠️ AND NO ENCODING RUNS DOWNSTREAM EITHER, WHICH AN EARLIER VERSION OF THIS BLOCK RELIED ON. It said the
 * serializer "escapes every dynamic text node it emits", so an accepted `&` would land as `&amp;`. That
 * broadened escape is withdrawn: `src/integrations/google/ProductFeedBuilder.ts` escapes the SIX sinks
 * `product.cfm` escapes and no others, and neither host sink is among them.
 * ============================================================================================ */

/**
 * RFC 3986 §3.2.2 `reg-name`, transcribed: `*( unreserved / pct-encoded / sub-delims )`.
 *
 * `unreserved` is ALPHA / DIGIT / `-` / `.` / `_` / `~`; `pct-encoded` is `%` followed by exactly two
 * hex digits; `sub-delims` is `!` `$` `&` `'` `(` `)` `*` `+` `,` `;` `=`. The production's `*`
 * repetition is written `+` here because the empty host is already refused one layer earlier by
 * {@link requireNonBlankValue}, so admitting it would only move the same failure.
 *
 * An `IPv4address` needs no separate alternative: its digits and dots are all `unreserved`, so a
 * dotted quad matches this pattern as a registered name, exactly as RFC 3986 §3.2.2 notes a
 * registered name may look like one.
 */
const REGISTERED_NAME_PATTERN = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})+$/;

/** Opening delimiter of the RFC 3986 §3.2.2 `IP-literal` form, `"[" ( IPv6address / IPvFuture ) "]"`. */
const IP_LITERAL_OPEN = '[';

/** Closing delimiter of the RFC 3986 §3.2.2 `IP-literal` form. */
const IP_LITERAL_CLOSE = ']';

/**
 * The complete character set of the RFC 3986 §3.2.2 `IPv6address` production — HEXDIG, `:` and the
 * `.` of an embedded `IPv4address` — and nothing else.
 *
 * Applied in addition to the runtime's own address parser because that parser is more permissive
 * than this production: `require('node:net').isIPv6('fe80::1%eth0')` answers true, accepting the
 * zone identifier of RFC 6874's separate `IPv6addrz` extension, which RFC 3986 does not admit. The
 * character test refuses the `%` that carries a zone identifier, so the pair together accept the
 * production and nothing beyond it.
 */
const IPV6_ADDRESS_CHARACTERS_PATTERN = /^[0-9A-Fa-f:.]+$/;

/**
 * RFC 3986 §3.2.2 `IPvFuture`, transcribed: `"v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )`.
 *
 * Carried for completeness of the transcription rather than because any deployment is expected to
 * use it: leaving the alternative out would make this rule stricter than the production it cites,
 * which is the invention the block above refuses to repeat.
 */
const IP_FUTURE_PATTERN = /^v[0-9A-Fa-f]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+$/;

/**
 * The `:` introducing the optional `port` of RFC 3986 §3.2.2's `host [ ":" port ]`.
 *
 * Read by {@link findHostPortSeparatorIndex} for `GOOGLE_FEED_HOST` alone. {@link
 * requireDatabaseHostValue} deliberately performs no such split — `DB_PORT` is its own variable, so a `:`
 * in `DB_HOST` is an operator error rather than a separator, and `reg-name` admits no colon, so the
 * production itself refuses it.
 */
const HOST_PORT_SEPARATOR = ':';

/**
 * Reads a variable that must be present, and returns it verbatim.
 *
 * Presence is the only requirement, so the empty string is a legal value. That tolerance exists for
 * source parity with the two variables that have a legacy counterpart — org/Hibachi/Hibachi.cfc:L12
 * sets the datasource username to the empty string and org/Hibachi/Hibachi.cfc:L13 does the same for
 * the password — and rejecting them would invent a constraint the legacy source contradicts. It is
 * NOT a recommended production posture: a real deployment should supply an explicit account scoped
 * to least privilege on the Sw* schema, unless the database is intentionally and securely configured
 * for credentialless access. Absent and empty stay different states, and only absent is an error.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the value exactly as supplied, including the empty string
 * @throws ConfigurationError naming `variableName` when the variable is not set at all
 */
function requirePresentValue(variableName: string, rawValue: string | undefined): string {
  if (typeof rawValue !== 'string') {
    throw new ConfigurationError(
      /* The second sentence is deliberately variable-agnostic, because this helper answers for more
       * than one KIND of variable: it began as a database-only reader whose message said "Every
       * database connection value", and the feed host of `loadGoogleFeedConfig` then began reading
       * through it too, which left a connection-flavoured sentence answering for a value that is not a
       * connection setting at all.
       *
       * ⚠️ IT IS ALSO SCOPED TO THE REQUIRED SET, WHICH IT PREVIOUSLY WAS NOT. The sentence used to
       * read "Every configuration value this service reads must be supplied by the environment; it
       * defaults none of them" — true of the ten-required contract this module started with, and false
       * once four connection values and the three DECISION G setting values became optional with
       * documented fallbacks. An earlier review round recorded the drift. The message now says only what
       * is true of the six variables that actually reach this helper's failure path, and the named
       * variable still tells an operator exactly which one is missing.
       *
       * ⚠️ THE OPTIONAL COUNT IN THIS MESSAGE WAS WRONG, AND IT WAS WRONG WHERE AN OPERATOR READS IT.
       * It said "The other seven are optional" while the module reads SIXTEEN names of which SIX are
       * required — so ten are optional, not seven. The figure is the arithmetic complement of two numbers
       * in the same sentence, which is why it read as plausible. Review finding F11 reported the same
       * miscount in this file's header prose and in the subtree README; the count here is the last copy of
       * it. Measured, and the command is worth keeping because it settles the question in one line:
       * `grep -o 'process\.env\.[A-Z_]*' src/config/env.ts | sort -u | wc -l` reports 16. */
      `Required environment variable ${variableName} is not set. ` +
        'This service reads SIXTEEN environment variables, of which SIX are required and have no ' +
        'default of any kind: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and GOOGLE_FEED_HOST. ' +
        'The other TEN are optional and fall back as slatwall-ts/.env.example documents.',
      { context: { variable: variableName } },
    );
  }

  return rawValue;
}

/**
 * Reads a variable that must carry non-whitespace content once it is being read at all.
 *
 * A blank value is a misconfiguration indistinguishable in effect from an absent one, and refusing it
 * here is the same fail-fast contract the legacy `<cfcatch>` at config/configORM.cfm:L4-L7 applied to
 * an unusable datasource.
 *
 * ⚠️ ITS BLANK MESSAGE IS DELIBERATELY KIND-AGNOSTIC, BECAUSE THIS READER SERVES BOTH KINDS. It began
 * as a connection-identity reader for the host and the schema and its message said the value "must name
 * a real connection target" — which stopped being true once the four optional connection values started
 * reaching it too, by way of {@link optionalTlsModeValue} and {@link optionalResourceBoundValue}, since
 * a transport mode and a pool bound name no target and are not required at all. An operator whose
 * `DB_TLS_MODE=` was blank was told to name a connection target. Review finding F7 covered exactly this
 * class of stale generic text. The message now states the one rule that holds for every caller — blank
 * is not a way to say "unset" — and points at the template that says which names are which, rather than
 * asserting something about a kind of value it cannot see from here. The optional readers that decline
 * to delegate say more, at {@link optionalNonBlankValue}.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the value exactly as supplied, un-trimmed
 * @throws ConfigurationError naming `variableName` when the variable is absent, or present but blank
 */
function requireNonBlankValue(variableName: string, rawValue: string | undefined): string {
  const value = requirePresentValue(variableName, rawValue);

  if (value.trim().length === 0) {
    throw new ConfigurationError(
      `Environment variable ${variableName} is set but blank. A blank value is not a way to say ` +
        '"unset": this service substitutes nothing for either, so a required variable must carry a ' +
        'real value and an optional one must be left out entirely rather than left empty. ' +
        'slatwall-ts/.env.example states which of the thirteen names are required and which are ' +
        'optional, and comments the optional ones out for this reason.',
      { context: { variable: variableName } },
    );
  }

  return value;
}

/**
 * Reads a variable that must be present and must denote an addressable TCP port.
 *
 * The only non-string field in the configuration, and the only one that is converted rather than
 * passed through. The conversion is total: a value that is not a plain run of digits within the
 * addressable range throws, and no malformed input is ever coerced into a number that would fail
 * later, at connection time, with a far less useful diagnostic.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the port as an integer
 * @throws ConfigurationError naming `variableName` when the variable is absent, blank, not a plain
 *   base-ten integer, or outside the addressable port range
 */
function requireTcpPortValue(variableName: string, rawValue: string | undefined): number {
  const value = requireNonBlankValue(variableName, rawValue).trim();

  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be a plain base-ten integer TCP port number. ` +
        'A sign, a decimal point, exponent notation, a radix prefix and any other non-digit ' +
        'character are all rejected.',
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
 *
 * `host = IP-literal / IPv4address / reg-name`. The bracketed `IP-literal` alternative is checked
 * against {@link IPV6_ADDRESS_CHARACTERS_PATTERN} together with the runtime's own address parser, or
 * against {@link IP_FUTURE_PATTERN}; every other spelling is checked against
 * {@link REGISTERED_NAME_PATTERN}, which subsumes `IPv4address`.
 *
 * @param host the host portion of the value, with any port already removed
 * @returns true when the host matches the production, false otherwise
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
 *
 * ⭐ THE SEARCH STARTS AFTER THE CLOSING BRACKET OF AN `IP-literal`, WHICH IS THE WHOLE REASON THIS IS A
 * FUNCTION RATHER THAN A `lastIndexOf` CALL. `[::1]:3000` carries four colons and only the last one is the
 * port delimiter; a bare `::1` carries two and none of them is. So a bracketed value is measured from its
 * `]`, and an unbracketed one is required to carry AT MOST ONE colon — because an unbracketed multi-colon
 * value is a bare IPv6 address, which RFC 3986 does not admit in an authority and which no `Host` field may
 * carry either.
 *
 * @param value the authority being read, already known to be non-blank
 * @returns the index of the port delimiter, or `-1` when the value carries no port
 */
function findHostPortSeparatorIndex(value: string): number {
  if (value.startsWith(IP_LITERAL_OPEN)) {
    const closingIndex = value.indexOf(IP_LITERAL_CLOSE);

    return closingIndex === -1 ? -1 : value.indexOf(HOST_PORT_SEPARATOR, closingIndex);
  }

  const firstIndex = value.indexOf(HOST_PORT_SEPARATOR);

  // An unbracketed value with a SECOND colon is a bare IPv6 address, not a host-and-port pair. Returning
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
 * `GOOGLE_FEED_HOST` is the only caller, and it is read here rather than merely for presence because the
 * value is interpolated into FIVE absolute URLs of the rendered feed:
 * `integrationServices/google/views/feed/product.cfm:L14`, `:L15`, `:L22`, `:L23` and `:L24`.
 *
 * ⭐ WHY THIS FORECLOSES NO LEGACY OUTCOME, WHICH IS THE ONLY QUESTION AAP §0.8.2 GUIDELINE 4 ASKS. The
 * value this variable stands in for is `CGI.HTTP_HOST` — the HTTP `Host` field value. RFC 9110 §7.2
 * DEFINES that field as RFC 3986 §3.2.2 `host` plus §3.2.3 `port`, with userinfo expressly excluded. A
 * value outside that production is therefore not a `Host` field value at all and could never have reached
 * `product.cfm:L14`: refusing it here removes no rendering the legacy was capable of producing. This is
 * ALIGNMENT of a port-introduced configuration input with the value space of the legacy input it replaces,
 * not a behavioural divergence, and so it does not consume the single departure AAP §0.6.7.7 authorises
 * (D18, the importer's parameterised SQL).
 *
 * ⚠️ AN EARLIER REVISION WITHDREW THIS READER ON THE OPPOSITE READING, AND REVIEW FINDING F8 REVERSED IT.
 * That revision counted the rule as a second departure and cited AAP §0.6.7.7's count. The current review
 * classifies the unvalidated read as a MAJOR security defect — CWE-20 feeding CWE-601 — because
 * `good.example@evil.example` silently moves the origin of every URL in the document while
 * `evil.example#` collapses all five onto one page. The distinction above is what resolves the two
 * readings: this reader judges the SYNTAX of a variable the legacy does not have, against the production
 * the legacy's own source value is defined by, so there is no legacy outcome on either side of it.
 *
 * ⛔ AND IT INVENTS NO POLICY BEYOND THAT PRODUCTION. No allowlist, no denylist of names, no length
 * ceiling, no label-count rule, no DNS lookup, no reachability probe and no scheme handling: the check is
 * the transcribed grammar and nothing else, so every authority RFC 9110 admits is accepted. Non-ASCII
 * falls outside `reg-name` and is refused — an internationalised name is supplied as its A-label, which is
 * the form that reaches the wire regardless.
 *
 * ⛔ THE DIAGNOSTIC NAMES THE VARIABLE AND NEVER ECHOES THE VALUE. A rejected authority is attacker-
 * supplied text by hypothesis, and copying it into a log or a response would carry the payload one layer
 * further; the same discipline `assertRepresentableInXml` follows in
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
    /* The port half is held to the SAME rule `DB_PORT` is held to, by reading it through the same
     * reader — one definition of "addressable TCP port" for the whole module. The variable name is
     * carried through unchanged so the operator is told which variable to fix, not which half. */
    requireTcpPortValue(variableName, port);
  }

  return value;
}

/**
 * Reads a variable that must be present and must denote an integer resource bound.
 *
 * Applied to the pool's connection limit, its queue limit and the connection timeout — the three
 * numbers DECISION E requires the operator to state so that this port does not have to invent them,
 * and the only three numbers this module reads at all. The validation is deliberately asymmetric: a
 * floor is enforced because a bound below its floor is not a bound at all, and no ceiling is
 * enforced because any ceiling would be a capacity figure with no source (standard S9).
 *
 * THE FLOOR IS {@link LOWEST_PERMITTED_RESOURCE_BOUND} AND IS APPLIED HERE RATHER THAN PASSED IN.
 * It was a parameter while a second, zero floor existed for the withdrawn import policy's redirect
 * count; with that shape gone (DECISION G) every caller would pass the same constant, so the reader
 * names it directly. One numeric reader with one message is still the point — the same consolidation
 * {@link requirePresentValue} records in its own body comment — and the constant is now part of the
 * contract rather than an argument each call site restates.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the bound as an integer of at least {@link LOWEST_PERMITTED_RESOURCE_BOUND}
 * @throws ConfigurationError naming `variableName` when the variable is absent, blank, not a plain
 *   base-ten integer, not exactly representable, or below the floor
 */
function requireResourceBoundValue(variableName: string, rawValue: string | undefined): number {
  const value = requireNonBlankValue(variableName, rawValue).trim();

  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be a plain base-ten integer. A sign, a decimal ` +
        'point, exponent notation, a radix prefix and any other non-digit character are all ' +
        'rejected.',
      { context: { variable: variableName } },
    );
  }

  const bound = Number(value);

  // `Number.isSafeInteger` rather than `Number.isInteger`: a digit run long enough to leave the
  // exactly representable range converts to a value that no longer denotes the digits supplied,
  // and silently acting on a different number than the operator wrote is worse than refusing.
  if (!Number.isSafeInteger(bound) || bound < LOWEST_PERMITTED_RESOURCE_BOUND) {
    throw new ConfigurationError(
      /* The sentence naming the driver's sentinel is kept, and kept SCOPED to the one variable it is
       * about. It was an unqualified claim while this reader served only the three pool numbers, was
       * qualified when the withdrawn DECISION G policy numbers briefly read through it — where "the
       * driver reads it as no limit" would have been asserted about a redirect count and a byte cap
       * the driver never sees — and stays qualified now that those callers are gone, because the
       * connection limit and the timeout are not queue sentinels either. Same reasoning as the
       * message generalisation recorded in the body of {@link requirePresentValue}. */
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
 *
 * The only reader in this module that can return `undefined`, and it exists for the three
 * run-time-computed setting inputs of {@link SettingsConfig} alone. Their optionality is a contract
 * recorded at that interface: supplying one makes a single setting name resolvable and omitting one
 * leaves that name — and only that name — unresolvable, so forcing every deployment to state all
 * three would force it to invent currency and fulfillment lists it has no business knowing.
 *
 * ⛔ ABSENT AND BLANK ARE DIFFERENT, AND ONLY ABSENT IS PERMITTED. This is the mirror image of
 * {@link requirePresentValue}, which permits blank and refuses absent, and the asymmetry is
 * deliberate in both directions. There the empty string is a real legacy value
 * [org/Hibachi/Hibachi.cfc:L12-L13]; here it is a deployment that typed the name and left it empty,
 * which cannot be what was meant — a blank path resolves to the bare `/custom/assets/images` suffix
 * and a blank identifier list is a list of nothing, and both would look like working configuration
 * while behaving as if nothing had been supplied. Refusing is what makes "absent" mean absent.
 *
 * ⭐ NOTHING IS SUBSTITUTED WHEN THE VALUE IS ABSENT. The caller must OMIT the corresponding key
 * rather than write `undefined` into it, because `exactOptionalPropertyTypes` makes those two states
 * distinct and the consuming adapter tests for presence.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, possibly absent
 * @returns the value exactly as supplied and un-trimmed, or `undefined` when the variable is not set
 * @throws ConfigurationError naming `variableName` when the variable is set but carries no non-whitespace
 *   content
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
 * ⛔ `requireDelimitedListValue` ONCE STOOD HERE — the reader that required a variable to be PRESENT,
 * accepted a blank whole value as the empty list, refused a blank entry inside a non-empty one, and
 * returned the entries frozen and verbatim. It is removed with its only two callers: the withdrawn
 * import policy's scheme and host allowlists (DECISION G). Its asymmetry was specific to those two
 * variables — presence required, blank permitted, because "no location at all" was one of the answers
 * the operator was being asked for — so nothing that survives here wants it. See the note where
 * `LIST_DELIMITER` stood for why the two delimited setting values that remain are read WHOLE rather
 * than split, and DECISION G for the withdrawal itself.
 */

/**
 * Decides whether a configured host names the loopback interface.
 *
 * Recognises the reserved names and IPv6 loopback spellings in {@link LOOPBACK_HOST_NAMES}, and
 * any IPv4 literal inside the reserved 127.0.0.0/8 block. Every octet is range-checked rather than
 * merely shape-checked, because a dotted string whose octets are out of range is not an address at
 * all — it is a host NAME, and a name can resolve anywhere. Treating one as local would be exactly
 * the bypass the loopback gate exists to prevent.
 *
 * Every unrecognised spelling — a decimal-packed address, a wildcard DNS name that happens to
 * embed a loopback quad, an address with more or fewer than four components — is reported as
 * remote. That is the fail-safe direction: an unrecognised host forces the verified transport mode
 * rather than permitting cleartext (DECISION E).
 *
 * @param host the configured host, exactly as the operator supplied it
 * @returns `true` when the host is a recognised loopback literal, `false` in every other case
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
 *
 * ⭐ WHY THIS EXISTS. `DB_HOST` was read through {@link requireNonBlankValue} alone, so in the one module
 * whose stated purpose is typed validation with descriptive errors, `mysql://10.0.0.1`,
 * `user:pw@10.0.0.1`, a value with a trailing newline and a non-ASCII name all LOADED — and then surfaced
 * later as an opaque driver connect failure with no mention of configuration. None of those shapes can
 * connect, so refusing them at load forecloses no working arrangement; it only moves an inevitable failure
 * to the boundary that can name the variable.
 *
 * ⚠️ IT IS A SIBLING OF {@link requireHostAuthorityValue}, NOT A COPY OF IT, AND BOTH ARE IN FORCE.
 * `GOOGLE_FEED_HOST` stands in for `CGI.HTTP_HOST`, which RFC 9110 §7.2 defines as an RFC 3986 authority —
 * so holding it to that production forecloses no legacy outcome. `DB_HOST` stands in for the `Slatwall`
 * datasource DEFINITION at `config/configApplication.cfm:L2`, which the legacy never validated in source
 * either — but a malformed value there produces a failed connection under both systems, so again no
 * successful legacy outcome is foreclosed. The two rules reach the same verdict by different routes, which
 * is why they are written separately rather than collapsed.
 *
 * ⭐ IT IS A MySQL-HOST VARIANT, NOT THE FEED'S RULE REUSED, AND THE THREE DIFFERENCES ARE DELIBERATE:
 *
 *   1. NO `":" port` SUFFIX. The feed host is an HTTP authority, where RFC 3986 §3.2.3 permits a port.
 *      Here the port is its own variable, `DB_PORT`, validated as a TCP port number in its own right —
 *      so a colon in this value means the operator has put the port in the wrong place, and saying so
 *      is more useful than accepting it and then having two sources for one number.
 *   2. A BARE, BRACKET-FREE IPv6 ADDRESS IS ACCEPTED. `::1` and `0:0:0:0:0:0:0:1` are legitimate
 *      `mysql2` hosts — the driver hands the value to the platform's own connector, which accepts an
 *      IPv6 literal unbracketed — and both are in {@link LOOPBACK_HOST_NAMES}, so refusing them would
 *      break the loopback transport rule for the one arrangement it exists to serve. Bracketed forms
 *      are accepted too, so an operator who writes the URI-style literal is not penalised.
 *   3. A FILESYSTEM SOCKET PATH IS REFUSED, WITH A MESSAGE THAT SAYS WHY. A unix socket is a
 *      legitimate way to reach MySQL, but it is configured through the driver's `socketPath` option,
 *      and `src/config/database.ts` sets no such option — it passes this value as `host`, where a path
 *      would be resolved as a hostname and fail. So a socket path could never have worked, and a
 *      reader who supplies one deserves that answer at load rather than a name-resolution error later.
 *      Accepting it silently is what the previous rule did.
 *
 * ⛔ AND IT INVENTS NO POLICY. There is no allowlist, no length ceiling, no label-count rule, no DNS
 * lookup and no reachability test: the check is the transcribed RFC 3986 §3.2.2 `host` production plus
 * the platform's own IPv6 parser, exactly as the feed host's rule is. Non-ASCII is outside `reg-name`
 * and is therefore refused — an internationalised name is supplied as its A-label, which is the form
 * that reaches the wire anyway.
 *
 * @param variableName the environment variable being read, named in every failure
 * @param rawValue the raw value, or `undefined` when the variable is not set at all
 * @returns the host exactly as supplied, never trimmed, folded or rewritten
 * @throws ConfigurationError naming `variableName` when the variable is absent, blank, or outside the
 *   accepted grammar
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
 * Reads the database SCHEMA NAME, refusing a value MySQL could never resolve to one.
 *
 * ⭐ WHY THIS EXISTS AT ALL, given `requireNonBlankValue` already rejected the empty case. QA edge case
 * 14 recorded that a `DB_NAME` of 4096 characters was ACCEPTED, alongside the `DB_HOST` payloads that
 * {@link requireDatabaseHostValue} now refuses, and attributed both to the same finding: this file
 * validated one connection coordinate carefully and its neighbours not at all. MySQL's documented
 * maximum length for a database identifier is 64 characters, so a longer value cannot name a schema on
 * ANY server. Admitting it does not make the deployment work — it defers the failure to the first query,
 * where the driver reports a syntax or unknown-database error that names neither the variable nor the
 * fact that the environment was wrong. Refusing it here names `DB_NAME` at the boundary instead, which
 * is the same bargain every other reader in this file already makes.
 *
 * ⛔ THE BOUND IS A DOCUMENTED PLATFORM LIMIT, NOT AN INVENTED ONE (IR-12). 64 is MySQL's identifier
 * maximum, not a capacity estimate, a quota or a service level, and nothing here caps anything the
 * server would otherwise have allowed. The check is deliberately length-only: the legacy schema is the
 * fixed contract both systems agree on (AAP §0.1.2), this port neither creates nor migrates it, and
 * MySQL permits a very wide character range in a quoted identifier — so screening the character set
 * would risk refusing a schema that genuinely exists, which is the opposite of the intent.
 *
 * @param variableName the environment variable being read
 * @param rawValue the raw value, or `undefined` when the variable is not set at all
 * @returns the schema name exactly as supplied, once it is short enough to be one
 * @throws ConfigurationError naming `variableName` when the value is absent, blank, or longer than a
 *   MySQL identifier may be
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
 * Reads an OPTIONAL transport mode, defaulting to the verified one.
 *
 * ⭐ WHY IT IS OPTIONAL: AAP §0.4.1.3 IS EXPLICIT THAT POOL SETTINGS ARE NOT CARRIED OVER, and the
 * documented boot contract is five variables — host, port, schema, user, password. Requiring four more
 * meant a deployment configured exactly to the plan failed closed at cold start, which is a
 * configuration contract disagreeing with the document an operator reads first.
 *
 * ⭐ WHY THE DEFAULT IS SAFE RATHER THAN CONVENIENT, which is the whole reason this can be optional at
 * all. Absence resolves to `verified`: TLS required, chain verified, identity checked. The unencrypted
 * arrangement is reachable ONLY by asking for it explicitly, and even then only for a loopback host —
 * {@link requireTlsModeValue}'s cross-check is unchanged and still refuses `disabled` for anything
 * else. So the fail-safe direction is preserved and strengthened: where the previous contract made an
 * operator state the transport and failed the boot if they did not, this one encrypts by default and
 * still refuses to be talked out of it over a network.
 *
 * ⛔ AND NO FIGURE IS AUTHORED (IR-12). A token is not a capacity number, a timeout or a service level.
 *
 * @param variableName the environment variable being read
 * @param rawValue the raw value, or `undefined` when the variable is not set at all
 * @param host the already-validated database host, for the cleartext cross-check
 * @returns the configured mode, or `verified` when the variable is not set
 * @throws ConfigurationError naming `variableName` when a value is present but not one of the two
 *   tokens, or when `disabled` is asked for with a non-loopback host
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
 * Reads an OPTIONAL resource bound, answering `undefined` when the operator states none.
 *
 * ⭐ ABSENCE MEANS "THE DRIVER'S OWN DEFAULT", AND THAT IS THE POINT. AAP §0.4.1.3 says pool sizing is
 * not carried over "because the legacy application delegates pooling to the CF/Railo server and pins
 * nothing in source", so this port must not pin anything either. Answering `undefined` lets
 * `src/config/database.ts` OMIT the option entirely, which leaves the decision with the driver rather
 * than moving it into this file under a new number. That is why this reader has no fallback value of
 * its own: a default here would be exactly the invented figure IR-12 forbids.
 *
 * ⛔ IT IS NOT USED FOR THE QUEUE BOUND. `DB_QUEUE_LIMIT` cannot be delegated the same way, because the
 * driver reads its own default of zero as "no limit" — the unbounded behaviour that value exists to
 * prevent. {@link optionalBoundedQueueValue} handles that one case separately, and says so.
 *
 * A value that IS present is held to exactly the same rules as before: a plain base-ten integer, at
 * least the floor, exactly representable. An empty or whitespace-only value is a misconfiguration
 * rather than a way to say "unset", which is the same distinction {@link optionalNonBlankValue} draws.
 *
 * @param variableName the environment variable being read
 * @param rawValue the raw value, or `undefined` when the variable is not set at all
 * @returns the bound the operator stated, or `undefined` when they stated none
 * @throws ConfigurationError naming `variableName` when a value is present but not an acceptable bound
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
 * Reads the OPTIONAL queue bound, falling back to the floor this module already declares.
 *
 * ⚠️ THIS IS THE ONE BOUND THAT CANNOT BE LEFT TO THE DRIVER, and the asymmetry with
 * {@link optionalResourceBoundValue} is deliberate rather than an inconsistency. `mysql2` reads a
 * queue limit of zero as "no limit", and zero is its default — so omitting the option does not decline
 * to choose, it SELECTS an unbounded queue of waiting connection requests. Every other option in the
 * pool can be delegated safely; this one cannot.
 *
 * ⭐ THE FALLBACK AUTHORS NO NEW NUMBER. It is {@link LOWEST_PERMITTED_RESOURCE_BOUND}, the floor this
 * module already declares and already enforces for every bound an operator supplies. Reusing it keeps
 * the file's numeric vocabulary at exactly one value, and that value is a FLOOR — the smallest bound
 * that is certainly not the driver's unbounded sentinel — rather than a capacity estimate, a throughput
 * figure or a tuning recommendation (IR-12). An operator who wants a deeper queue states one.
 *
 * @param variableName the environment variable being read
 * @param rawValue the raw value, or `undefined` when the variable is not set at all
 * @returns the bound the operator stated, or the declared floor when they stated none
 * @throws ConfigurationError naming `variableName` when a value is present but not an acceptable bound
 */
function optionalBoundedQueueValue(variableName: string, rawValue: string | undefined): number {
  return optionalResourceBoundValue(variableName, rawValue) ?? LOWEST_PERMITTED_RESOURCE_BOUND;
}

/**
 * Reads the transport mode, and refuses the one combination that would send cleartext over a
 * network.
 *
 * The token is matched exactly, with no case folding and no synonym: guarantee 3 above rules out
 * silently transforming operator input, and a closed two-token set with a message that names both
 * accepted spellings is more predictable than a lenient match. Surrounding whitespace is removed
 * for the comparison only, exactly as it is for the numeric readers.
 *
 * The cross-check against the host is what makes DECISION E enforceable rather than advisory. It
 * lives here, in the only module that holds both facts, so that no later layer has to remember to
 * apply it — src/config/database.ts receives a mode it can act on unconditionally.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @param host the already-validated host the mode is checked against
 * @returns the validated transport mode
 * @throws ConfigurationError naming `variableName` when the variable is absent, blank, not one of the two
 *   accepted tokens, or requests cleartext for a host that is not a loopback literal
 */
function requireTlsModeValue(
  variableName: string,
  rawValue: string | undefined,
  host: string,
): DatabaseTlsMode {
  const mode = requireNonBlankValue(variableName, rawValue).trim();

  if (mode !== 'verified' && mode !== 'disabled') {
    throw new ConfigurationError(
      `Environment variable ${variableName} must be exactly "verified" or "disabled". There is ` +
        'deliberately no mode that keeps TLS while skipping certificate or identity ' +
        'verification, because an unverified session is indistinguishable from an intercepted one.',
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

/**
 * Reads and validates the database section, then freezes it.
 *
 * The nine environment reads below are the complete set for the DATABASE section — the service as a
 * whole reads SIXTEEN names: these nine, the Google feed host in `loadGoogleFeedConfig()`
 * (DECISION F), the three OPTIONAL run-time-computed setting inputs of DECISION G, and the three OPTIONAL
 * resource bounds of DECISION H.
 * They are written as literal dotted accesses so that the key set is statically visible in one
 * search and so that no key is resolved through a computed string (standard S3).
 *
 * ⭐ FIVE OF THE NINE ARE REQUIRED, AND THOSE FIVE ARE THE PLAN'S OWN BOOT CONTRACT.
 * `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` have no default of any kind — a
 * connection target and an identity cannot be guessed, and AAP §0.4.1.3 requires that nothing here be
 * defaulted. The other four are OPTIONAL, because the same section of the plan says pool settings are
 * "not carried over": requiring them made a deployment configured exactly to the documented five-variable
 * contract fail closed at cold start, so the contract and the document disagreed in the one place an
 * operator reads first.
 *
 * ⭐ AND EVERY FALLBACK IS EITHER SAFE OR DELEGATED, WITH NO NEW FIGURE AUTHORED (IR-12):
 *   - `DB_TLS_MODE` absent ⇒ `verified`. Absence encrypts; cleartext must be asked for by name and is
 *     still refused for anything but a loopback host.
 *   - `DB_QUEUE_LIMIT` absent ⇒ the floor this module already declares, because the driver reads its
 *     own default of zero as "no limit" — the single option where delegating would be unsafe.
 *   - `DB_CONNECTION_LIMIT` and `DB_CONNECT_TIMEOUT_MS` absent ⇒ OMITTED from the pool options, so the
 *     driver's own bounded defaults apply and this port states no number at all.
 *
 * They are evaluated in the order host, port, schema, user, password, transport mode, queue bound —
 * with the two omissible bounds read before the literal is built — so the first problem in that order is
 * the one reported, which is deterministic and reproducible for an operator debugging a deployment.
 *
 * The host is read into a local before the literal is built because the transport mode is
 * validated against it (DECISION E). That is the only cross-field rule in this module, and it is
 * applied here rather than deferred to src/config/database.ts so that an invalid combination can
 * never reach the pool at all.
 */
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
     * ⚠️ OMITTED RATHER THAN SET TO `undefined`, WHICH `exactOptionalPropertyTypes` MAKES A REAL
     * DISTINCTION. An absent member means "this service states no bound", which is what
     * src/config/database.ts reads to leave the driver's option out entirely; a member present with the
     * value `undefined` would not type-check against the declared optional and would also be a
     * different statement — "the bound is nothing" rather than "there is no bound to state".
     */
    ...(connectionLimit === undefined ? {} : { connectionLimit }),
    ...(connectTimeoutMs === undefined ? {} : { connectTimeoutMs }),
  });
}

/**
 * Reads the Google feed section, then freezes it.
 *
 * One environment read, held to presence, non-blankness AND the HTTP-authority production. A blank host
 * cannot identify an origin, so a blank one is a misconfiguration indistinguishable in effect from an
 * absent one — the same reasoning {@link requireNonBlankValue} applies to DB_NAME.
 *
 * ⭐ THE SYNTAX RULE IS {@link requireHostAuthorityValue}, AND IT RUNS AT LOAD, ONCE. The value is
 * interpolated into five absolute URLs of the rendered document, so an authority that is not an authority
 * moves the origin of the whole feed. The full adjudication — why holding a port-introduced variable to the
 * production RFC 9110 §7.2 already defines its legacy source by is ALIGNMENT rather than a second
 * departure under AAP §0.6.7.7 — is at {@link requireHostAuthorityValue}. Review finding F8 directed it.
 *
 * ⭐ AND IT IS CHECKED AGAIN AT THE SINK, DELIBERATELY. `validateFeedHostAuthority` in
 * src/integrations/google/ProductFeedBuilder.ts re-applies the same rule per render, because the
 * serializer's render context is a plain `string` that a caller could assemble without passing through this
 * module at all. Two independent checks of one rule is the point: neither layer trusts the other to have
 * run, and the serializer's is ATOMIC — it refuses before any byte is produced.
 */
function loadGoogleFeedConfig(): GoogleFeedConfig {
  return Object.freeze({
    host: requireHostAuthorityValue('GOOGLE_FEED_HOST', process.env.GOOGLE_FEED_HOST),
  });
}

/*
 * ⛔ THREE LOADERS ONCE STOOD HERE — `loadProductImportConfig`, `loadUrlTitleConfig` and
 * `loadSkuCombinationConfig` — AND ALL THREE ARE REMOVED. Each read a value that no collaborator asks
 * for any more, and each of the three withdrawing files says in its own words that leaving the value
 * here would RELOCATE an invented number rather than avoid it:
 *
 *   - `src/util/urlTitle.ts` on its removed `UrlTitleAttemptBudget`: "The legacy states no ceiling, so
 *     every possible value of one is a fabricated number. Passing the fabrication to the caller as a
 *     required argument relocated the invention; it did not avoid it."
 *     ⭐ AND A BOUND HAS SINCE BEEN REINSTATED FOR THAT LOOP TOO, by review finding F5 — but NOT inside
 *     the algorithm and NOT as configuration. the probe-budget section of `src/util/urlTitle.ts` wraps the injected PROBE,
 *     optionally, with no default, and `src/util/urlTitle.ts` is unchanged. THE DECISION IN THIS FILE IS
 *     UNAFFECTED for the same reason as the budget below: an optional collaborator obliges no deployment
 *     to state a figure, so there is still nothing here to load.
 *     ⚠️ A BOUND WAS BRIEFLY REINSTATED FOR THAT LOOP — outside the algorithm, wrapping the injected
 *     probe — and it has been WITHDRAWN AGAIN, so the loop is unbounded once more and there is still
 *     nothing here to load. THE DECISION IN THIS FILE IS UNAFFECTED either way.
 *   - `src/services/SkuService.ts` on its then-removed `SkuCombinationBudget`: "Requiring the composition
 *     root to supply the maximum RELOCATED the fabrication rather than avoiding it: the number still
 *     had to be invented by somebody before the graph could be built at all."
 *   - `src/ports/repositories/ProductRepository.ts` on the four controls its re-adjudicated SEC-08 gate
 *     still refuses to invent. It says this in two places, and they are quoted separately here rather
 *     than run together, because they are not adjacent in that file: at its member note, an
 *     implementation "must still NOT invent a host allow-list, a byte cap, a timeout or a redirect
 *     count"; and in its head block, "The source names no host and states no figure, so every possible
 *     value of each is a fabrication that AAP §0.7.3 standard 9 and IR-12 forbid."
 *
 * ⚠️ THE THIRD FILE NO LONGER WITHDRAWS ITS GATE, ONLY THE CONFIGURABLE PART OF IT — AND THAT IS STILL
 * THE WHOLE OF WHAT THIS LOADER WOULD HAVE READ. Review finding F8 reinstated the scheme, credential and
 * address-literal refusals as fixed literals; the four values a deployment would have had to supply are
 * exactly the four that remain withdrawn. So `loadProductImportConfig` would still have nothing to load,
 * and its removal is unaffected.
 *
 * Keeping the loaders would also have made a deployment supply SEVEN environment variables — five
 * import-policy values plus the two budgets — before this module would build at all, for no
 * behavioural effect anywhere, because `loadConfig` is fail-fast by DECISION C. `loadSettingsConfig`
 * below survives on its own merits: `../adapters/settings/StaticSettingResolver`'s
 * `StaticSettingResolverConfiguration` is a live contract and its three names are the setting values
 * whose LEGACY default is computed at run time, so a deployment-supplied value replaces a computation
 * rather than inventing a ceiling.
 */

/**
 * Reads the three optional setting inputs, then freezes them.
 *
 * ⭐ AN ABSENT VALUE OMITS ITS KEY RATHER THAN WRITING `undefined` INTO IT, and under
 * `exactOptionalPropertyTypes` that is a real distinction rather than a stylistic one: the consuming
 * adapter declares each member as `?: string`, so a key present and holding `undefined` is NOT
 * assignable to it. The conditional spreads below are what keep the two states apart, and they are
 * the reason this loader cannot be written as a flat object literal.
 *
 * Every read goes through {@link optionalNonBlankValue}, so a variable left empty rather than unset
 * fails here instead of resolving to a value that behaves as though nothing had been supplied.
 */
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

/**
 * Reads the three optional finite resource bounds, then freezes them — review finding SEC-1 (CWE-400).
 *
 * ⭐ AN ABSENT VARIABLE OMITS ITS KEY RATHER THAN WRITING `undefined` INTO IT, exactly as
 * {@link loadSettingsConfig} does and for the same `exactOptionalPropertyTypes` reason: the collaborators
 * that consume these figures declare their budget arguments as optional, and a key present holding
 * `undefined` is not assignable to an optional member. The conditional spreads are what keep ABSENT and
 * `undefined` apart, and they are why this cannot be a flat object literal.
 *
 * ⭐ AND ABSENT IS A REAL, SUPPORTED STATE RATHER THAN A DEGRADED ONE. An operator who has measured no
 * figure states none, and the graph is wired exactly as it was before this section existed: unbounded, which
 * is the legacy's own behaviour. No default is substituted, no floor is promoted to a default, and nothing
 * in this loader suggests a value (AAP §0.7.3 S9, IR-12). The ONE consequence of stating nothing is that
 * the anonymous feed route declines to serve — see {@link ResourceBoundsConfig} — and that consequence is
 * a refusal, not a fabricated number.
 *
 * ⚠️ EVERY READ GOES THROUGH {@link optionalResourceBoundValue}, SO A PRESENT VALUE IS VALIDATED AT LOAD
 * and a mis-typed bound is a named configuration failure rather than a run-time surprise. That helper
 * enforces {@link LOWEST_PERMITTED_RESOURCE_BOUND} as a floor and refuses zero, negatives, fractions,
 * `NaN`, `Infinity` and non-numeric text. Note that it does NOT fall back the way
 * {@link optionalBoundedQueueValue} does: the queue bound must fall back because `mysql2` reads its own
 * default of zero as "unbounded", so omitting the option SELECTS something; these three bounds have no such
 * sentinel, so omitting them genuinely declines to choose.
 */
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

  return Object.freeze({
    ...(smartListMaximumRecordsPerQuery === undefined ? {} : { smartListMaximumRecordsPerQuery }),
    ...(skuMaximumCombinationsPerRequest === undefined ? {} : { skuMaximumCombinationsPerRequest }),
    ...(urlTitleMaximumProbesPerDerivation === undefined
      ? {}
      : { urlTitleMaximumProbesPerDerivation }),
  });
}

/**
 * Builds the whole configuration and freezes it at both levels.
 *
 * Freezing the outer object alone would leave the nested sections writable, so each section is
 * frozen by its own loader and the container is frozen second. The freeze refuses the write in every
 * case, and because every module in this subtree is emitted in strict mode — CommonJS output carries
 * a `'use strict'` prologue — a consumer's assignment raises a `TypeError` instead of failing
 * silently. So the immutability is enforced at run time by two independent mechanisms, not merely
 * advertised in the types by `readonly`.
 *
 * The database section is loaded first, so a deployment missing a connection fact reports that
 * before it reports a missing feed host. That ordering is arbitrary only in appearance: the
 * connection facts are required by every entry point, whereas the feed host is required by one, so
 * reporting the broader failure first is the more useful diagnostic. The DECISION G setting section
 * is loaded last for the same reason, and it is the one section that cannot fail at all unless a name
 * was typed and left empty — all three of its inputs are optional.
 *
 * ⛔ NO SECTION IS LAZY AND NONE IS SKIPPABLE. Loading only the sections a particular entry point
 * needs would mean a Lambda that never renders the feed could ship with no feed host and a Lambda
 * that never opens a pool could ship with no connection facts, each discovering it on first use
 * rather than at load — the fail-fast contract DECISION C inherits from config/configORM.cfm:L4-L7
 * applies to every value equally.
 */
function loadConfig(): AppConfig {
  return Object.freeze({
    database: loadDatabaseConfig(),
    googleFeed: loadGoogleFeedConfig(),
    settings: loadSettingsConfig(),
    resourceBounds: loadResourceBoundsConfig(),
  });
}

/**
 * The validated, immutable configuration for this service.
 *
 * Built exactly once, when this module is first loaded, and never rebuilt: there is no reload,
 * override, set or reset entry point, by design (see WHY THERE IS NO CROSS-INVOCATION CACHE in
 * the file header).
 *
 * SIXTEEN variables are read — the count is measured from the `process.env` reads in this file, not
 * recalled — as **SIX required**: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` and
 * `GOOGLE_FEED_HOST`; and **TEN optional**: `DB_TLS_MODE`, `DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`,
 * `DB_CONNECT_TIMEOUT_MS`, the three DECISION G `SETTING_*` values and the three DECISION H `CATALOG_*`
 * bounds. Loading this module with any of the SIX missing or malformed — or with any of the TEN optional
 * ones PRESENT BUT BLANK — throws a {@link ConfigurationError} naming the offending variable: the
 * fail-fast contract inherited from config/configORM.cfm:L4-L7 and set out in DECISION C. Per loader that
 * is five required plus four optional in `loadDatabaseConfig`, one required in `loadGoogleFeedConfig`,
 * three optional in `loadSettingsConfig` and three optional in the DECISION H reader, and
 * slatwall-ts/.env.example states the same split for an operator who never opens this file.
 * Blank-is-an-error is why every optional name in that template is commented out rather than left as a
 * bare empty assignment.
 *
 * ⚠️ THIS PARAGRAPH CARRIED THREE MUTUALLY CONTRADICTORY COPIES OF ITSELF AND NOW CARRIES ONE. An
 * earlier version said "TEN required ... THREE optional" — the contract before the four pool and transport
 * values were made optional — and a correction was APPENDED rather than substituted, twice, leaving two
 * further fragments that began mid-sentence ("the file header). Loading this module with any of the TEN
 * required variables...") and disagreed with each other about the required count. Review finding F11
 * reported the residue. There is now exactly one statement of the split, and it is the executable one.
 *
 * Consumed by constructor injection only, and the feed's route to this value is INDIRECT.
 * src/config/database.ts reads it to create the module-scope pool. src/config/container.ts wires the
 * resulting collaborators and EXPOSES the validated configuration on the graph, and it is from there
 * that src/handlers/googleFeedHandler.ts takes the feed host — its wiring reads
 * `container.config.googleFeed` (DECISION F) rather than importing this module, which is precisely
 * what lets the handler be constructed in a test with no environment present. Nothing below the
 * config layer imports this module, and nothing below it reads the environment (AAP §0.4.3.5).
 *
 * ⭐ THE DECISION G SECTION IS WHAT THE COMPOSITION ROOT BINDS INSTEAD OF A LITERAL. It is
 * structurally the shape its consumer declares — `StaticSettingResolverConfiguration` — so wiring is
 * a pass-through with no adaptation, no cast and no value chosen in the container.
 *
 * @example
 * ```ts
 * import { config } from '../config/env';
 *
 * const { host, port, database, user, password } = config.database;
 *
 * // DECISION F — handed to the feed render context unmodified and unchecked.
 * const feedHost = config.googleFeed.host;
 * ```
 */
export const config: AppConfig = loadConfig();
