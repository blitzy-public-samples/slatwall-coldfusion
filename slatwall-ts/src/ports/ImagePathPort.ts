/**
 * ImagePathPort — the typed boundary between the extracted Catalog slice and the unconverted
 * Slatwall image service.
 *
 * Authority: AAP §0.4.1.6 "Ports" row 7 and AAP §0.2.2.7 row 2 — origin
 * model/entity/Sku.cfc:L145, model/entity/Sku.cfc:L192 and model/entity/Sku.cfc:L221, scope "image
 * path, resized path and existence flag, consumed by the feed".
 *
 * WHY THIS FILE EXISTS — THE HIDDEN DEPENDENCY. The legacy code reaches the image service through a
 * runtime string lookup, `getService("imageService")`, and — unlike every other collaborator of the
 * in-scope services — never declares it as a component property. AAP §0.6.3.2 classifies it "hidden
 * genuine" and states the consequence: a dependency analysis based on component metadata misses it
 * entirely, so a port built from that analysis would compile and then fail at the first image
 * operation. Declaring it here converts an invisible lookup into a compile-checked constructor
 * parameter (AAP §0.7.3 S3, rule R2).
 *
 * THE THREE IN-SCOPE CALL SITES — the entire boundary:
 *   1. model/entity/Sku.cfc:L189 — `getResizedImage(argumentCollection=arguments)`
 *   2. model/entity/Sku.cfc:L218 — `getResizedImagePath(argumentCollection=arguments)`
 *   3. model/service/SkuService.cfc:L212 — `saveImageFile(uploadResult=..., filePath=...,
 *      allowedExtensions="jpg,jpeg,png,gif")`
 * The interface is sized to those three and no further; the remaining lookups in the legacy tree sit
 * in files that are out of scope.
 *
 * TODO(boundary): the collaborator behind every member is the Slatwall image service, which this
 * slice does not convert, so no implementation of this interface is shipped by it. Per TR-5 the
 * member is never quietly dropped from the interface, so all four members are declared even though
 * two of them cannot be honoured faithfully on the target runtime — see the EXECUTION-MODEL
 * MISMATCH block below.
 *
 * WHAT THIS PORT IS: PATHS AND FLAGS. Four members and nothing more — an image path
 * (model/entity/Sku.cfc:L145), a resized image path (model/entity/Sku.cfc:L192), an existence flag
 * (model/entity/Sku.cfc:L221) and a save member forced by the third call site
 * (model/service/SkuService.cfc:L212). It resizes nothing, reads no file system, opens no network
 * connection and moves no image bytes; the moment it returned image data it would have stopped being
 * a boundary.
 *
 * Every member resolves a `Promise`, because each one either crosses into the image service or
 * reaches a file system or object store. `SettingResolverPort` is SYNCHRONOUS instead, forced that
 * way by mismatch M8 (AAP §0.6.6) so that no caller in the slice can depend on background
 * completion. This port is not subject to M8; do NOT harmonise the two shapes.
 *
 * It resizes nothing, reads nothing from a file system, opens no network connection, and moves no
 * image bytes. The moment it started returning image data it would have stopped being a boundary
 * and started being an implementation.
 *
 * ⭐ PLUS ONE NOMINAL TYPE AND ONE PURE TAG FUNCTION — {@link ImageWebPath} and
 * {@link toImageWebPath}. It belongs HERE, not in an adapter, because the type IS part of the contract:
 * an adapter declaring it would leave the contract open. The tag function performs no I/O, imports
 * nothing and touches no environment, so it does not weaken the "contracts here, I/O there" rule this
 * section states.
 *
 * ⛔ AN EARLIER REVISION DECLARED MORE THAN THIS HERE, AND THE SURPLUS STAYS OUT OF THIS FILE — BUT THE
 * POLICY IT CARRIED IS NOW ENFORCED ELSEWHERE. Beyond the two symbols above it declared `ImageFileName`,
 * `ImageFileNameCandidate` and a seven-clause `validateImageFileName` gate. (No count is given, here or
 * in DECISION I-1, because the symbols are gone from this file and a count is no longer recomputable from
 * source; the names are. Their names are the evidence.) They cannot live here for a
 * reason that has nothing to do with security and everything to do with this file's own contract: a
 * compiled `RegExp` and a working function body are exactly what the "contracts here, I/O there" rule
 * three paragraphs up excludes, and {@link toImageWebPath} is admitted only because it performs no
 * inspection at all. A `const` union or a nominal type would have been fine here; a validator never was.
 *
 * ⛔ AND NO NARROWER SUCCESSOR ENFORCES IT ANYWHERE EITHER, AS OF REVIEW FINDING F4. A write-boundary
 * predicate did briefly stand in `src/services/SkuService.ts`; it is withdrawn, because it refused input
 * the legacy ACCEPTS and AAP §0.6.7.7 declares D18 the SINGLE behaviour-hardening exception in this port
 * (AAP §0.8.2 Guideline 4, §0.1.2.1). The exposure is therefore CARRIED, and it is flagged on
 * {@link ImagePathPort.saveImageFile} for the implementer who can legitimately confine it — an adapter is
 * the only layer that knows its own storage root. DECISION I-1 below records the whole sequence, control by
 * control.
 *
 * ASYNCHRONY, AND WHY IT DIFFERS FROM `SettingResolverPort`
 * --------------------------------------------------------
 * Every member resolves a `Promise`. Each one either crosses into the out-of-scope image service
 * (`model/entity/Sku.cfc:218`, `model/service/SkuService.cfc:212`) or reaches a file system or
 * object store (`model/entity/Sku.cfc:222`), so an implementation is inherently I/O-bound.
 *
 * `SettingResolverPort` is synchronous, and that is not an inconsistency to tidy up. Its contract
 * is forced synchronous by mismatch M8 (AAP 0.6.6): the legacy setting engine launches an
 * out-of-band thread, and declaring the port synchronous guarantees no caller in the slice can come
 * to depend on background completion. This port is not subject to M8, so the two shapes differ on
 * purpose. Do NOT harmonise them.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4 — hexagonal separation)
 * -----------------------------------------------------------
 * `src/ports/` declares contracts; `src/adapters/` performs I/O. This module therefore has ZERO
 * imports — no sibling module, no Node built-in, no package, no barrel re-export. Paths and flags are
 * strings and booleans at runtime, so nothing needs importing. Consequences, all deliberate:
 *   - No AWS type, client or SDK reference appears here. All AWS coupling is confined to
 *     `src/handlers/` (AAP 0.7.3 S4). That prohibition is at its most tempting in exactly this
 *     file, because image storage on the target platform means an object store — and it is
 *     nonetheless absolute.
 *   - No file-system, path or URL built-in is imported. An adapter does that work.
 *   - No third-party image-processing library is referenced. AAP 0.7.3 S5 freezes the dependency
 *     set at one runtime package plus AAP 0.5.2's ten development packages — eleven on disk, the
 *     extra being the `ts-node` the test runner cannot start without, as `jest.config.ts` derives —
 *     and this file adds nothing to either count.
 *   - No database driver, statement text, table name or column name appears anywhere (AAP 0.7.3 S2).
 *   - The process environment is never read here. Configuration flows one way through
 *     `src/config/` (AAP 0.4.3.5), and nothing below the config layer reads it.
 *   - There is no class, no abstract base and no constructor. The interface is satisfiable by a
 *     plain object literal, which is what lets `test/support/inMemoryRepositories.ts` hand-write a
 *     double: the legacy repository ships no mocking library at all (AAP 0.4.3.6).
 *   - Named exports only; no default export. Export names are load-bearing at the sibling call
 *     sites in the domain, service and Google-feed layers.
 *
 * The `domain` and `ports` layers relate in one direction only. `src/domain/sku/Sku.ts` carries
 * "image members behind `ImagePathPort`" (AAP 0.4.1.4) while this port's own origin is
 * `model/entity/Sku.cfc:L145, L192, L221` (AAP 0.2.2.7). The resolution is that the domain module
 * takes a type-only import of this interface and receives the implementation by injection. A
 * type-only import is erased during compilation, so there is no runtime cycle, no bundler ordering
 * problem and no runtime cost.
 *
 * RULES AND STANDARDS
 * -------------------
 * No file and no constraint enters this port's scope by user rule; AAP §0.7.1 records that verdict,
 * and AAP §0.7.5 makes the rules document itself the authority rather than any summary of it
 * embedded in source, so the tool's output is deliberately not transcribed here — a transcript can
 * go stale against the document, which is exactly why the plan forbids relying on one.
 * That is not permission to lower the bar: the nine binding standards of AAP
 * 0.7.3 govern instead, and each is cited inline at the declaration it constrains — S1 strict type
 * safety, S2 no statement text, S3 explicit injection, S4 hexagonal separation, S5 frozen
 * dependency set, S6 hand-stubbable for tests, S7 preserve and annotate, S8 flag mismatches, S9
 * invent nothing.
 *
 * Every behavioural claim below carries an inline `path:Lnnn` locator, per the artifact-trail
 * requirement of AAP 0.8.5, so a reviewer can verify any statement against the legacy source
 * without trusting this narrative.
 */

/*
 * ============================================================================================
 * EXECUTION-MODEL MISMATCH — the existence flag cannot be implemented faithfully (AAP 0.8.3.6)
 * ============================================================================================
 *
 * This is this file's owned mismatch under AAP 0.7.3 S8, and it is flagged here rather than
 * resolved. AAP 0.8.3.6 is explicit: "Flag, rather than silently resolve, any case where a CFML
 * method's execution model … doesn't map cleanly to a single Lambda invocation."
 *
 * THE CONTRADICTION IS IN THE LEGACY SOURCE, NOT IN THE TRANSLATION.
 *
 *   `model/entity/Sku.cfc:L145` declares `getImagePath()`, whose body at
 *   `model/entity/Sku.cfc:L146` returns
 *       "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"
 *   — a WEB URL.
 *
 *   `model/entity/Sku.cfc:L221` declares `getImageExistsFlag()`, whose body at
 *   `model/entity/Sku.cfc:L222` is
 *       if( fileExists(expandPath(getImagePath())) )
 *   — it hands that web URL to `expandPath()` and then to `fileExists()`.
 *
 * `expandPath()` is a ColdFusion / servlet-container facility that maps a virtual, application
 * relative path onto an absolute file-system path. The round trip only appears to work because the
 * URL was manufactured from a file-system setting in the first place: `getBaseImageURL()` is
 * `getURLFromPath(setting('globalAssetsImageFolderPath'))` at
 * `model/transient/HibachiScope.cfc:L186`. In other words `getImageExistsFlag()` is attempting to
 * invert `getURLFromPath()` with `expandPath()` — one container facility undoing another.
 *
 * NEITHER HALF OF THAT ROUND TRIP EXISTS ON THE TARGET RUNTIME:
 *   - there is no Node equivalent of `expandPath()` whatsoever, because a Lambda process has no
 *     application-relative virtual path registry to resolve against; and
 *   - there is no meaningful target to resolve TO, because the Lambda file system is ephemeral and
 *     read-only apart from a temporary directory, so a product-image directory does not exist there
 *     at all.
 *
 * A second locator reinforces the same point: `model/service/SkuService.cfc:L211` reads
 * `arguments.Sku.getImagePath()` and `model/service/SkuService.cfc:L212` passes that identical
 * web-URL-shaped value to the image service as `filePath`. The save member therefore inherits the
 * very same ambiguity as the existence flag — a value that is a URL by construction and a file path
 * by use.
 *
 * ⚠️ THAT AMBIGUITY IS CARRIED, NOT RESOLVED, AND AN EARLIER REVISION RESOLVED IT IN ERROR. Both
 * file-system members accept the COMPOSED PATH, because that is precisely what the legacy hands them:
 * `model/entity/Sku.cfc:L222` passes `getImagePath()` to `expandPath`, and
 * `model/service/SkuService.cfc:L211-L212` passes the same composed value as `filePath`. The earlier
 * revision narrowed the existence flag to a stored NAME and the save member to a validated BASENAME with
 * no destination, which made a stored `../../../../tmp/payload.jpg` resolve `false` and raise
 * respectively where the legacy reported on, and wrote to, the traversed file. Rewriting the value was
 * the error: AAP §0.8.2 guideline 4 forbids it, and DECISION I-1 below keeps both members taking the
 * composed path exactly as the legacy hands it over.
 *
 * ⛔ NOTHING IS REWRITTEN HERE, AND ONLY THE WRITE PATH IS REFUSED — UPSTREAM, NOT IN THIS FILE. Under
 * review finding SEC-FILE-01 a gate over the stored `imageFile` column stands in
 * `src/services/SkuService.ts`, ahead of this port entirely, so a name the legacy's own generator could not
 * have produced never reaches the write. Every value that DOES arrive arrives byte-for-byte, unnarrowed and
 * unrewritten, which is why {@link SaveImageFileRequest.filePath} still types the whole path and not a name.
 * The residual CWE-22 reach on the PROBE is registered rather than closed (DECISION I-1 control (3)), and
 * the write-side obligations for an adapter are stated on {@link ImagePathPort.saveImageFile}. What remains a mismatch is exactly
 * what it always was — a Lambda runtime has no `expandPath` equivalent and no persistent product-image
 * directory to resolve against.
 *
 * WHAT IS DECIDED HERE, AND WHAT IS NOT:
 *   - DECIDED: `getImageExistsFlag` REMAINS a member of this interface. TR-5 (AAP 0.1.2.2) is
 *     unambiguous — "The member is never quietly dropped from the interface" — and dropping a
 *     member because it is inconvenient to implement would be a behavior change, which the Minimal
 *     Change Clause (AAP 0.8.1) forbids even while it licenses any amount of idiom change.
 *   - NOT DECIDED: how an adapter should answer the question. An object-store existence check, a
 *     conditional request against a content-delivery endpoint, or a deliberately constant stub are
 *     all defensible, and they differ in observable behavior. That choice belongs to whichever
 *     adapter implements this interface, and this contract deliberately does not prejudge it.
 *
 * NO MISMATCH NUMBER IS CLAIMED, AND NO RANGE IS RESTATED HERE. Every mismatch the port recognises is
 * already allocated to an owner elsewhere — M1, M3 and M4 to the product importer, M2 to the feed
 * handler, M5 to the unit of work for the request-end implicit transaction demarcation, M6 to the
 * validation read-back loop, M7 to the repository ports and M8 to `SettingResolverPort` — so the gap
 * recorded above is an additional, UNNUMBERED mismatch. Minting a number for it would violate AAP 0.7.3
 * S9, and AAP 0.6.6 is FROZEN at M1-M8 in any case. The two frozen bounds are stated in exactly one
 * place, `src/ports/repositories/SkuRepository.ts`, and deliberately not repeated here.
 */

/**
 * The fixed path segment that sits between the base image URL and the SKU image file name.
 *
 * Carried verbatim from the interpolated return at `model/entity/Sku.cfc:L146`:
 * `"#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"`. The same literal
 * appears in the administrative view at `admin/views/entity/producttabs/defaultimages.cfm:L56`,
 * which is out of scope but confirms the segment is a system-wide convention rather than an
 * accident of one method.
 *
 * It is exported as a value, not merely described in prose, because an implementation of
 * {@link ImagePathPort.getImagePath} must reproduce it exactly and a test must be able to assert on
 * it. Declaring it here keeps a single literal for both. Assembling the path from it is the
 * adapter's work; this module performs no concatenation of any kind (AAP 0.7.3 S4).
 */
export const SKU_IMAGE_PATH_SEGMENT = '/product/default/';

/**
 * The one resize method the legacy Catalog slice ever requests.
 *
 * Set at `model/entity/Sku.cfc:L186` inside `getResizedImage`, and at `model/entity/Sku.cfc:L214`
 * inside `getResizedImagePath`. Both write the identical literal, and no other value appears
 * anywhere in the slice.
 *
 * {@link ResizedImagePathRequest.resizeMethod} is nevertheless typed as an open `string` rather
 * than narrowed to this single literal. The legacy method forwards its whole argument scope with
 * `argumentCollection=arguments` (`model/entity/Sku.cfc:L218`), so a caller may supply a method this
 * slice never names, and the out-of-scope image service is free to accept others. Narrowing the
 * type to the one observed value would invent a restriction the source does not state, which AAP
 * 0.7.3 S9 forbids. The constant records the observed value; the type stays open.
 */
export const IMAGE_RESIZE_METHOD_SCALE_BEST = 'scaleBest';

/**
 * The upload extension allow-list, carried verbatim from the only place it is stated.
 *
 * `model/service/SkuService.cfc:L212` passes `allowedExtensions="jpg,jpeg,png,gif"` to the image
 * service — a comma-delimited list in one string, exactly as CFML list semantics expect. Four
 * extensions, in that order.
 *
 * AAP 0.4.1.8 boundary-stubs `SkuService.processImageUpload` because of "the hidden dynamic
 * `imageService` dependency", which makes this port the only place in the target where the detail
 * can survive at all. It is preserved as the single delimited string rather than split into an
 * array: the delimited form is what crosses the boundary at `model/service/SkuService.cfc:L212`, and
 * re-shaping it would be a contract change dressed up as a tidy-up. Adding a fifth extension, or
 * reordering these four, would be invention (AAP 0.7.3 S9).
 */
export const IMAGE_UPLOAD_ALLOWED_EXTENSIONS = 'jpg,jpeg,png,gif';

/*
 * ============================================================================================
 * TWO SIBLINGS, FIVE DIVERGENCES, ONE INPUT — the parity register (AAP 0.8.2 Guideline 6)
 * ============================================================================================
 *
 * `model/entity/Sku.cfc` contains two methods that map a size token onto a settings lookup:
 * `getResizedImage` (declared `model/entity/Sku.cfc:L153`, size block `model/entity/Sku.cfc:L169-L187`,
 * boundary call `model/entity/Sku.cfc:L189`) and `getResizedImagePath` (declared
 * `model/entity/Sku.cfc:L192`, size block `model/entity/Sku.cfc:L203-L216`, boundary call
 * `model/entity/Sku.cfc:L218`). They do the same job and they disagree about it in five separate
 * ways.
 *
 * Only `getResizedImagePath` is a member of this interface — AAP 0.4.1.6 scopes this port to path
 * and flag concepts, and AAP 0.6.4.2 identifies the resized image PATH as what the Google feed
 * consumes. The register is recorded here anyway, because this is the file where the boundary is
 * defined and because the divergences determine what shape actually arrives at
 * {@link ImagePathPort.getResizedImagePath}. The owner of the divergent BEHAVIOUR is
 * `src/domain/sku/Sku.ts`, which carries both legacy members; the annotations below are addressed
 * to it.
 *
 * TODO(parity) I1 — THE MISSING FINAL `else`, and the most consequential of the five.
 *   `getResizedImage` ladders `l` / `m` / `s` onto `Large` / `Medium` / `Small` at
 *   `model/entity/Sku.cfc:L177-L183` and stops there: there is NO trailing `else`, so an unrecognised
 *   token passes through COMPLETELY UNCHANGED into the interpolated settings key read at
 *   `model/entity/Sku.cfc:L184-L185`.
 *   `getResizedImagePath` ladders the same three tokens at `model/entity/Sku.cfc:L205-L211` but DOES
 *   have a trailing `else`, which rewrites every unrecognised token to `Small` at
 *   `model/entity/Sku.cfc:L210` before the key is read at `model/entity/Sku.cfc:L212-L213`.
 *   Same input, two different outcomes. Giving `getResizedImage` the `else` it does not have would
 *   be a behavior change, and AAP 0.7.3 S7 requires the defect be preserved and annotated, never
 *   repaired. DO NOT HARMONISE THE TWO.
 *
 * TODO(parity) I2 — POSITIONAL VERSUS NAMED, and the divergence with the widest blast radius.
 *   `getResizedImage` accepts the positional form: its gate at `model/entity/Sku.cfc:L169` tests
 *   `structKeyExists(arguments, 1)` as well as `structKeyExists(arguments, "size")`, and it reads
 *   the positional value at `model/entity/Sku.cfc:L173-L176`.
 *   `getResizedImagePath` tests ONLY the named form at `model/entity/Sku.cfc:L203` and never looks at
 *   a positional argument.
 *   The observable consequence is severe rather than cosmetic. Invoked positionally, the two
 *   methods do entirely different things: `getResizedImage` treats the value as a size, whereas
 *   `getResizedImagePath` leaves the unnamed argument untouched in its argument scope and forwards
 *   it verbatim through `argumentCollection=arguments` at `model/entity/Sku.cfc:L218`, having
 *   performed no size handling at all.
 *   The target cannot reproduce the positional calling convention itself — a CFML argument scope is
 *   simultaneously an ordered array and a struct, and TypeScript has no such construct. That is a
 *   permitted idiom change under AAP 0.8.1; the resulting BEHAVIOURAL asymmetry is not, and it is
 *   `src/domain/sku/Sku.ts` that must keep the two members diverging.
 *
 * TODO(parity) I3 — DELETE ORDER RELATIVE TO THE SETTINGS READ.
 *   `getResizedImage` removes the size argument BEFORE reading width and height:
 *   `structDelete` at `model/entity/Sku.cfc:L172` (named form) and `model/entity/Sku.cfc:L175`
 *   (positional form), against the reads at `model/entity/Sku.cfc:L184-L185`.
 *   `getResizedImagePath` removes it AFTER: reads at `model/entity/Sku.cfc:L212-L213`, then
 *   `structDelete(arguments, "size")` at `model/entity/Sku.cfc:L215`.
 *   On the successful path both members end up forwarding an argument scope with no size in it, so
 *   the net effect coincides. It stops coinciding the moment the settings read does not return
 *   normally: `getResizedImagePath` would then forward a size argument that has already been
 *   rewritten in place by I4, while `getResizedImage` would have removed it. Recorded rather than
 *   normalised.
 *
 * TODO(parity) I4 — LOCAL VARIABLE VERSUS IN-PLACE MUTATION.
 *   `getResizedImage` works through a local, `thisSize`, assigned at `model/entity/Sku.cfc:L171` and
 *   `model/entity/Sku.cfc:L174`, leaving the argument scope alone.
 *   `getResizedImagePath` mutates the caller-visible argument in place, lower-casing it at
 *   `model/entity/Sku.cfc:L204` and overwriting it at `model/entity/Sku.cfc:L206`,
 *   `model/entity/Sku.cfc:L208` and `model/entity/Sku.cfc:L210`.
 *   This is what makes I3 observable, and it is why {@link ResizedImagePathRequest} is declared with
 *   `readonly` members: an implementation of this port receives a request it must not rewrite, and
 *   any lower-casing or token rewriting stays where the legacy code put it, in the domain member.
 *
 * TODO(parity) — A FIFTH ASYMMETRY, DELIBERATELY UNNUMBERED. `getResizedImage` derives an `alt`
 *   value from a setting at `model/entity/Sku.cfc:L159-L161`, guarded on the setting having non-zero
 *   length. `getResizedImagePath` has no `alt` handling of any kind: its body runs from the path
 *   assignment at `model/entity/Sku.cfc:L195` straight to the missing-image default at
 *   `model/entity/Sku.cfc:L197-L200`. {@link ResizedImagePathRequest} therefore has NO `alt` member,
 *   and its absence is behavior rather than an omission — a resized PATH carries no alternate text.
 *   No number is assigned to this observation: AAP 0.7.3 S9 forbids inventing new register entries,
 *   and the four labelled divergences above are the ones the plan enumerates.
 *
 * THE FOUR-PART GATE, CLAUSE BY CLAUSE
 * ------------------------------------
 * Everything above hangs off one condition. `model/entity/Sku.cfc:L203` reads, in full:
 *
 *   structKeyExists(arguments, "size") && !isNull(getProduct())
 *     && !structKeyExists(arguments, "width") && !structKeyExists(arguments, "height")
 *
 * All four clauses matter, and each one independently suppresses the entire settings lookup:
 *   1. `structKeyExists(arguments, "size")` — with no size token there is nothing to map, so the
 *      block is skipped. This is the path the Google feed takes: the feed calls the method with NO
 *      ARGUMENTS AT ALL at `integrationServices/google/views/feed/product.cfm:L23`, so for the
 *      feed's `g:image_link` the size block never executes and the request that reaches this port
 *      carries neither size nor width nor height.
 *   2. `!isNull(getProduct())` — the settings are read through the product
 *      (`model/entity/Sku.cfc:L212-L213`), so a SKU with no product skips the block entirely rather
 *      than failing. `product` is a nullable many-to-one on the SKU, so this is reachable.
 *   3. `!structKeyExists(arguments, "width")` — supplying an explicit width suppresses the lookup,
 *      and the caller's width is forwarded untouched.
 *   4. `!structKeyExists(arguments, "height")` — likewise for height. Supplying EITHER dimension is
 *      enough; the clauses are independent.
 *
 * Two consequences for this interface, both structural:
 *   - The gate executes in the DOMAIN member, before this port is reached, so an implementation
 *     receives the POST-gate argument set and must not re-apply the gate.
 *   - `size` can nevertheless still arrive here. The `structDelete` that removes it sits INSIDE the
 *     gated branch at `model/entity/Sku.cfc:L215`, so whenever the gate is false — an explicit width
 *     alongside a size, say — the size token survives and is forwarded to the image service by
 *     `argumentCollection=arguments` at `model/entity/Sku.cfc:L218`. That is why
 *     {@link ResizedImagePathRequest} declares `size` at all, and why it may legitimately arrive
 *     together with a width or a height.
 *
 * Clauses 3 and 4 turn on PRESENCE, not on value, which is why `exactOptionalPropertyTypes` is
 * load-bearing rather than incidental here (AAP 0.7.3 S1). "Width absent" and "width supplied"
 * select different legacy code paths, so an optional member of this request must be OMITTED to mean
 * absent — never set to an explicitly undefined value. Under that compiler setting the type system
 * enforces the distinction instead of leaving it to convention.
 */

/*
 * CARRIED WARNINGS THAT BELONG TO NEIGHBOURING LAYERS
 *
 * TODO(parity) — THE CASE-SENSITIVITY TRAP. `generateImageFileName` at
 * model/entity/Sku.cfc:L131-L139 sanitises both the option code (model/entity/Sku.cfc:L135) and the
 * product code (model/entity/Sku.cfc:L138) with the case-INSENSITIVE CFML replace,
 * `reReplaceNoCase`, against the pattern
 *
 *     [^a-z0-9\-\_]
 *
 * Because the call is case-insensitive, that negated class spares `A`-`Z` as well as `a`-`z`. The
 * same pattern compiled in JavaScript WITHOUT the ignore-case flag strips every uppercase letter
 * from every generated image file name — silently, producing a feed whose image links do not
 * resolve. Addressed to whichever layer implements file-name generation; the pattern above appears
 * in a comment only and this module compiles no regular expression.
 *
 * TODO(parity) — THE `getImageDirectory` ASYMMETRY. model/entity/Product.cfc:L320-L321 declares
 * `getImageDirectory()` and delegates it to `getDefaultSku().getImageDirectory()`, but
 * model/entity/Sku.cfc declares no such member, so the delegation targets a SKU member that does not
 * exist. This interface therefore declares no directory member: inventing one would fabricate a
 * contract the source does not have, and repairing the delegation is forbidden by AAP §0.7.3 S7.
 *
 * TODO(boundary) — SETTINGS READ ALONGSIDE THESE MEMBERS BELONG TO `SettingResolverPort`, so exactly
 * one port owns each key. None is redeclared here; they are cross-referenced by name and locator:
 *   - `productImageOptionCodeDelimiter`  model/entity/Sku.cfc:L135
 *   - `productImageDefaultExtension`     model/entity/Sku.cfc:L138
 *   - `imageAltString`                   model/entity/Sku.cfc:L159-L160
 *   - `imageMissingImagePath`            model/entity/Sku.cfc:L165, model/entity/Sku.cfc:L199
 *   - `productImage<size>Width`          model/entity/Sku.cfc:L184, model/entity/Sku.cfc:L212
 *   - `productImage<size>Height`         model/entity/Sku.cfc:L185, model/entity/Sku.cfc:L213
 * `globalAssetsImageFolderPath` belongs there too — it is the setting the base image URL is derived
 * from at model/transient/HibachiScope.cfc:L186. The last two are the interpolated pair, and an
 * unrecognised size token reaches the key unchanged through model/entity/Sku.cfc:L184-L185, which is
 * why the size segment stays open both there and on {@link ResizedImagePathRequest.size}.
 *
 * TODO(boundary) — THE REPEATED ADDITIONAL IMAGE LINKS DO NOT COME THROUGH THIS PORT.
 * integrationServices/google/views/feed/product.cfm:L23 builds `g:image_link` from the SKU's own
 * resized image path, which is {@link ImagePathPort.getResizedImagePath}. The repeated
 * `g:additional_image_link` at integrationServices/google/views/feed/product.cfm:L24 loops the
 * product's images and calls the equivalent member on each IMAGE entity, at
 * model/entity/Image.cfc:L145. That entity is not one of the six in scope (AAP §0.2.1.2), so the
 * member is deliberately absent here and the feed builder needs another source for those links.
 *
 * Two further legacy image members are deliberately NOT declared, so their absence reads as a
 * decision rather than an oversight (TR-5):
 *   - `getResizedImage` / `getImage`, model/entity/Sku.cfc:L149-L190, boundary call
 *     model/entity/Sku.cfc:L189. These return a rendered image rather than a path, and AAP §0.4.1.6
 *     scopes this port to paths and flags.
 *   - `getImageExtension`, model/entity/Sku.cfc:L141-L143. A pure string operation over the SKU's
 *     own file-name property that reaches no collaborator, so it belongs to src/domain/sku/Sku.ts.
 */

/* ================================================================================================
 * SEC-07 / DECISION I-1, RE-ADJUDICATED THREE TIMES — CONTROL (1) IS REINSTATED ON A NEW GROUND, THE
 * READ-PATH EXPOSURE STAYS CARRIED, AND THE WRITE CONTRACT NOW CARRIES OBLIGATIONS
 *
 * THE HISTORY MATTERS HERE, BECAUSE THIS BLOCK HAS BEEN WRITTEN FOUR TIMES AND A READER DESERVES TO SEE
 * WHY IT SETTLED WHERE IT DID. It first withdrew SIX distinct controls on ONE argument. A later revision
 * found that argument sound for four of them and false for two, and REINSTATED control (1) — a name gate
 * at the write boundary — on the ground that D18's own example already changes outcomes on malicious
 * input, so a refusal shares D18's shape. Review finding F4 then withdrew control (1) again, and NOT by
 * disputing that reading: by PRECEDENCE. AAP §0.6.7.7 declares D18 "the single place where the port
 * intentionally does not preserve legacy behavior exactly", AAP §0.8.2 Guideline 4 forbids enhancement
 * beyond what the migration requires, and AAP §0.1.2.1 makes the plan FROZEN and not reinterpretable.
 * Reaching a SECOND exception by analogy with the first is exactly the reinterpretation §0.1.2.1
 * excludes, however well-argued the analogy.
 *
 * ⭐⭐ REVIEW FINDING SEC-FILE-01 REINSTATES CONTROL (1), AND ACCEPTS F4's POINT RATHER THAN DISPUTING IT.
 * The analogy to D18 IS an unlicensed reinterpretation, and it is abandoned. The gate is reinstated on a
 * ground that needs no exception at all, because it is not a divergence: THERE IS NO LEGACY BEHAVIOUR ON
 * THIS WRITE PATH TO PRESERVE. That is not an argument — it is the fact this very block established
 * repo-wide, five paragraphs below, and then did not apply:
 *
 *     `saveImageFile` DOES NOT EXIST ANYWHERE IN THE LEGACY. One call site
 *     (`model/service/SkuService.cfc:L212`), zero declarations. The `save*` prefix routes the name to
 *     `org/Hibachi/HibachiService.cfc:L268` → `onMissingSaveMethod` [:L552-L560], which indexes
 *     `missingMethodArguments[1]` POSITIONALLY, and [:L253] states "Ordered arguments only--named
 *     arguments not supported." [:L212] passes ONLY named arguments.
 *
 * AAP §0.8.2 Guideline 4 requires that existing behaviour be preserved "exactly as-is". Where there is no
 * existing behaviour, nothing is preserved and nothing is changed, so §0.6.7.7's single-exception clause is
 * NOT ENGAGED — this is not a second exception, it is a path that never had a first outcome. This block
 * already conceded the consequence in its own words: the contract "is defined by AAP §0.4.3.2 and by the
 * call site rather than by a legacy body — there is no legacy body to reproduce." A contract with no legacy
 * body is SPECIFIED, not diverged from.
 *
 * ⭐ WHAT MOVED, AND WHAT DELIBERATELY DID NOT:
 *   • (1) name gate at the WRITE boundary — REINSTATED, in `src/services/SkuService.ts`, before a path is
 *     composed. Transcribed from `model/entity/Sku.cfc:L131-L139`, the legacy's own generator, so no policy
 *     is invented (AAP §0.7.3 S9, IR-12).
 *   • (3) narrowing the existence PROBE — STAYS WITHDRAWN, and F4 was right about it for a second reason
 *     that survives everything above: `model/entity/Sku.cfc:L222` HAS a defined result for every input,
 *     writes nothing, and discloses one bit. Refusing to probe would replace a defined answer. The
 *     read-path CWE-22 exposure stays CARRIED and FLAGGED (AAP §0.7.3 S8).
 *   • (2), (4), (6) — STAY WITHDRAWN as authored code here, and are now stated as OBLIGATIONS on
 *     {@link ImagePathPort.saveImageFile} instead. An obligation on an unimplemented member changes no
 *     outcome of any request, because there is no implementation for it to change; it constrains whoever
 *     writes one. That is the gap the finding actually measured — "the vulnerability becomes reachable as
 *     soon as a functional adapter is supplied UNDER THE EXISTING CONTRACT".
 *   • (5) raising on refusal — STAYS WITHDRAWN. The gate answers `false`, a value [:L213-L217] already
 *     produces, so no caller gains a failure mode the legacy lacked — and a bare boolean is also the
 *     strongest available form of the finding's "refusal without leaking destination details" clause.
 *
 * The per-control verdicts below are preserved as they were written, with each one's current disposition
 * marked, so the reasoning that produced them stays auditable rather than being overwritten.
 *
 * ⛔ WHAT THE LEGACY DOES, VERBATIM, AND IT VALIDATES NOTHING AT THE POINT OF USE.
 * `model/entity/Sku.cfc:L146` composes a WEB URL by interpolating the stored column value:
 *     "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"
 * and two consumers hand that URL-shaped string to the FILESYSTEM:
 *   - `model/entity/Sku.cfc:L222` — `fileExists(expandPath(getImagePath()))`  → READ / probe
 *   - `model/service/SkuService.cfc:L211-L212` — `var imagePath = arguments.Sku.getImagePath();` then
 *     the same value as `filePath` to `saveImageFile`                        → WRITE
 * `imageFile` is a persistent `SwSku` column (`model/entity/Sku.cfc:L58`) with NO validation rule in
 * `model/validation/Sku.json`, so a stored `../../../../tmp/payload.jpg` normalises straight out of the
 * intended directory on both paths. That exposure is real.
 *
 * ⛔ AND A CLAIM THIS BLOCK USED TO MAKE HERE IS INCOMPLETE — CORRECTED UNDER REVIEW FINDING SEC-FILE-01.
 * It read "the column is not fed by anything arbitrary, and that is checkable… exactly two writers populate
 * it, and BOTH assign the output of one generator", and concluded that a deployment whose column was only
 * ever written by those two is not exposed at all. There is a THIRD writer, and it takes ARBITRARY CALLER
 * DATA: the bulk importer. `model/dao/ProductDAO.cfc:L207` calls
 * `saveImportData(data, r, "SlatwallSku", skuColumns, …)` where `skuColumns` is derived from the uploaded
 * FILE'S OWN HEADINGS, so a `sku_imageFile` column in an imported file is written straight to the row —
 * which is precisely the "Store/IMPORT" half of the finding's exploit. `src/adapters/mysql/`'s
 * `IMPORTABLE_SKU_COLUMNS` faithfully lists `imageFile` for that reason.
 *
 * That correction does not weaken the measurement below; it is why the gate belongs at the POINT OF USE
 * rather than at any one writer. Screening `processImageUpload` screens all three writers at once, and it
 * does so without refusing an import the legacy accepts — an imported row is a database write, not a file
 * write, and the hazard only materialises when the value becomes a write DESTINATION.
 *
 * ⭐ THE TWO GENERATOR-BASED WRITERS, WHICH ARE STILL WHERE THE POLICY COMES FROM. Repo-wide, two of the
 * three writers assign the output of one generator:
 *   - `model/service/ProductService.cfc:L210` — `sku.setImageFile( sku.generateImageFileName() )`
 *   - `model/service/ContentService.cfc:L138` — the same call
 * and `generateImageFileName` (`model/entity/Sku.cfc:L131-L139`) filters every contributed segment
 * through `reReplaceNoCase(…, "[^a-z0-9\-\_]", "", "all")` before appending one `"."` and one extension.
 * So those two writers can only ever store a single path segment drawn from `[A-Za-z0-9\-_]` plus one dot.
 * THE GENERATOR IS THE POLICY; it was simply never re-checked at the point of use. Under review finding
 * SEC-FILE-01 it IS re-checked there — `src/services/SkuService.ts` transcribes exactly that shape — so the
 * policy the port enforces is the legacy's own rather than an invented one (AAP §0.7.3 S9, IR-12), and the
 * third writer above is the reason the re-check is worth performing. `src/services/SkuService.ts` carries
 * the same measurement at the write it decides.
 *
 * ================================ THE SIX CONTROLS, ADJUDICATED ==================================
 *
 * ⭐ (1) A NAME GATE OVER THE STORED VALUE — **REINSTATED** UNDER SEC-FILE-01, ON THE NO-LEGACY-BEHAVIOUR
 * GROUND STATED ABOVE RATHER THAN ON THE D18 ANALOGY. The account below is the F4 withdrawal as written,
 * kept because its reasoning about the ANALOGY is correct and worth not losing; what it lacked was the
 * observation that this path has no legacy outcome at all. It was
 * briefly reinstated in `src/services/SkuService.ts` as a single predicate consulted by
 * `processImageUpload` before any member of this port was touched, transcribed from the legacy's own
 * generator and answering `false` rather than raising. It was as narrow as such a gate can be, and it was
 * still a behaviour change on input the legacy accepts, which only AAP §0.6.7.7's declared exception could
 * license and §0.6.7.7 declares exactly one. TWO SECONDARY POINTS SURVIVE THAT WITHDRAWAL and are kept
 * because they remain true independently: such a gate could never have lived in THIS file (a compiled
 * `RegExp` and a function body are outside a contracts-only module, which is why the earliest revision's
 * `validateImageFileName` had to leave regardless of the security verdict), and the place to confine an
 * image write is an ADAPTER, which is the only layer that knows its own storage root.
 *
 * ⛔ (2) `ImageStorageBase`, AN INJECTED CONTAINMENT DIRECTORY — STAYS WITHDRAWN AS AUTHORED CODE, and is
 * now an OBLIGATION (a) on {@link ImagePathPort.saveImageFile} for the adapter that has a root. GROUND 3
 * BELOW IS SOUND and is what lets the gate confine the write without any root at all. It had no legacy counterpart, so any value for it would be invented configuration, which AAP
 * §0.7.3 standard 9 and IR-12 forbid. Nothing is lost: because `L146` composes
 * `<baseImageURL>` + `/product/default/` + `<imageFile>`, requiring `imageFile` to be a single segment
 * confines the write to whatever directory that prefix denotes, WHATEVER it denotes. The confinement is
 * relative, derives entirely from the legacy's own composition, and needs no root to compare against.
 *
 * ⛔ (3) NARROWING {@link ImagePathPort.getImageExistsFlag} TO A STORED NAME — STAYS WITHDRAWN. This is
 * the READ path, and F6 does not reach it. `L222` probes whatever the composed path resolves to,
 * including a traversed one, and answers a boolean about THAT file. Refusing to probe would replace a
 * defined legacy answer with a different one, on an operation that writes nothing and discloses only a
 * boolean. Preserve and annotate (AAP §0.6.7).
 *
 * ⛔ (4) REPLACING {@link SaveImageFileRequest.filePath} WITH A VALIDATED BASENAME — STAYS WITHDRAWN, and
 * it was never a hardening. A basename carries no destination, so the earlier revision did not confine
 * the write, it destroyed it. The composed path is passed through UNCHANGED, exactly as
 * `model/service/SkuService.cfc:L211-L212` passes it, and `src/services/SkuService.ts`'s own schema puts
 * that beyond doubt — it requires that member to "preserve the exact file path supplied by the SKU/image
 * path contract". This control stays withdrawn on its own merits, not merely on precedence.
 *
 * ⛔ (5) RAISING ON REFUSAL — STAYS WITHDRAWN, AND IS NOW MOOT SINCE NOTHING REFUSES.
 * `model/service/SkuService.cfc:L213-L217` has exactly two outcomes, `true` and `false`, and records
 * nothing on either, so a raise would have handed callers a failure mode the legacy never had. Note that
 * the two halves of the middle revision CONTRADICTED each other on this point —
 * {@link ImagePathPort.saveImageFile}'s own note chose `false` while the service side raised — and `false`
 * was the half that was right, for as long as either existed.
 *
 * ⛔ (6) INSPECTING THE UPLOADED BYTES FOR A PERMITTED IMAGE TYPE — STAYS WITHDRAWN AS AUTHORED CODE HERE,
 * and is now OBLIGATION (d) on {@link ImagePathPort.saveImageFile}, where the finding asks for it and where
 * the bytes actually are. Nothing in the legacy sniffs content. `L212` passes an `allowedExtensions` list and nothing more; a magic-number or
 * MIME check would be a control invented here, which IR-12 and AAP §0.7.3 standard 9 forbid.
 *
 * ============================= THE ONE GROUND THAT WAS FALSE ====================================
 *
 * ⛔ GROUND 2 OF THE ORIGINAL WITHDRAWAL IS DISPROVED BY ITS OWN EXAMPLE. It read: D18 "is a precedent
 * for a divergence that removes a flaw class WITHOUT changing an outcome — parameterised SQL returns
 * exactly the rows interpolated SQL returned. A refusal has no such property." The second sentence is
 * false about D18 itself. Parameterised SQL does NOT return what interpolated SQL returned on the inputs
 * that matter: on `O'Brien` the legacy raised a syntax error and the port returns the row, and on an
 * injecting value the legacy ran the attacker's statement and the port runs none. D18 changes outcomes;
 * it changes them ONLY where the legacy's own behaviour was the flaw. That is D18's actual shape:
 *
 *     for every input on which the legacy produced a well-defined, intended result, the port produces
 *     the same result; the divergence falls only on inputs where the legacy's behaviour WAS the flaw.
 *
 * ⛔ AND CONTROL (1) DID SATISFY THAT TEST, WHICH IS PRECISELY WHY THE WITHDRAWAL HAD TO REST ON
 * SOMETHING ELSE. Every value the legacy's own two writers can store would have been admitted, so every
 * intended input was unchanged; only a value no generator could have produced — a separator, a second
 * dot, a traversal — was refused, and on those the legacy's behaviour WAS the flaw. Sharing D18's shape
 * is not the same as being D18: AAP §0.6.7.7 names ONE divergence, by locator, and §0.1.2.1 forbids
 * reading the plan as licensing a class of them. A future iteration that wants this control has a clean
 * route — amend the AAP, which is a decision above this port's authority — and until then the exposure is
 * carried and flagged. Grounds 1 and 3 of the original withdrawal survive intact and are honoured above at
 * (2), (3) and (6).
 *
 * ⚠️ AND A SEPARATE FACT ABOUT THIS PATH, VERIFIED REPO-WIDE, THAT MAKES (1) EASIER STILL. The
 * collaborator member `saveImageFile` DOES NOT EXIST ANYWHERE IN THE LEGACY. A grep across every `.cfc`
 * and `.cfm` finds ONE call site (`model/service/SkuService.cfc:L212`) and ZERO declarations;
 * `model/service/ImageService.cfc:L54` extends `HibachiService` and declares only `getResizedImage`,
 * `getResizedImagePath`, a private `scaleImage` and `clearImageCache`; and `custom/` holds nothing but
 * readme and `.gitignore` stubs, so no override supplies it. The `save*` prefix means
 * `org/Hibachi/HibachiService.cfc:L268` intercepts the name and routes it to `onMissingSaveMethod`
 * (`L552-L560`), which indexes `missingMethodArguments[1]` positionally — and `L253` states the
 * limitation outright: "Ordered arguments only--named arguments not supported." `L212` passes only NAMED
 * arguments. So the legacy has no well-defined result on this path for ANY input, which is the same
 * class of defect as D4 and D5 (AAP §0.6.7.3). It is recorded here by locator and NOT minted as a new
 * register number: the canonical block in `src/ports/repositories/SkuRepository.ts` records that AAP
 * §0.6.7 is FROZEN at D1-D21 and AAP §0.6.6 at M1-M8, minting past either range caused a documented
 * contradiction once already, and AAP §0.8.2 guideline 6 asks for the decision to be COMMENTED with its
 * locator, not numbered. It is also why this port's
 * {@link ImagePathPort.saveImageFile} contract is defined by AAP §0.4.3.2 and by the call site rather
 * than by a legacy body — there is no legacy body to reproduce.
 *
 * ⚠️ WHAT IS FLAGGED AND NOT CLOSED — NOW THE READ PATH ONLY. The READ path keeps the legacy's CWE-22 reach
 * by decision (3), and it is FLAGGED by locator at {@link ImagePathPort.getImageExistsFlag} — the S8
 * treatment the AAP prescribes for a divergence a port is not licensed to make. The WRITE path is CLOSED:
 * `src/services/SkuService.ts` refuses a name the generator could not have produced before a path is
 * composed, and {@link ImagePathPort.saveImageFile} states obligations (a)-(f) for the adapter beneath it.
 * No adapter for this port is authored in this checkpoint (AAP §0.4.1.7 enumerates none), which is exactly
 * why the obligations are stated on the contract rather than implemented in one.
 *
 * ⭐ WHAT SURVIVES HERE, AND IT CHANGES NOTHING. {@link ImageWebPath} remains, as a purely NOMINAL label
 * for "a path this slice composed for an image". EVERY member that consumes a path accepts it — the
 * existence probe and the save request both do — so it refuses nothing, gates nothing and alters no
 * outcome. It is documentation the compiler can carry, not a restriction: {@link toImageWebPath} tags
 * any string on request and no member demands a tag a caller cannot obtain. There is no enforcement
 * anywhere for it to stand in for; the type system was never asked to carry one, and now neither is the
 * service.
 * ============================================================================================== */

declare const IMAGE_WEB_PATH: unique symbol;

/**
 * A web-URL-shaped image path — the value `model/entity/Sku.cfc:L146` composes.
 *
 * ⚠️ A NOMINAL LABEL, NOT A RESTRICTION. The legacy treats this single value as BOTH a display URL and
 * a filesystem path — `model/entity/Sku.cfc:L222` wraps it in `expandPath`, and
 * `model/service/SkuService.cfc:L211-L212` passes it as `filePath` to a member that writes — so both
 * file-system members of this port accept it, exactly as the legacy does. The brand records what the
 * value IS; it refuses nothing. An earlier revision used it to make those two call shapes uncompilable,
 * which changed two outcomes; see the withdrawal block above.
 */
export type ImageWebPath = string & { readonly [IMAGE_WEB_PATH]: 'web' };

/**
 * Labels an already-composed image URL as an {@link ImageWebPath}.
 *
 * ⚠️ A NOMINAL TAG, NOT A VALIDATION, and deliberately so. It asserts nothing about the value; it
 * records that the value is a path this slice composed for an image. Nothing is enforced on the back of
 * it — every member of this port that consumes a path accepts an {@link ImageWebPath}, exactly as the
 * legacy hands the composed value to both of its file-system consumers. See the withdrawal block above.
 *
 * Two producers exist in the slice, and both compose rather than validate: the adapter behind
 * {@link ImagePathPort.getImagePath}, mirroring `model/entity/Sku.cfc:L146`, and
 * `src/integrations/google/ProductFeedBuilder.ts` for the additional-image path an image entity
 * carries in its own right (`model/entity/Image.cfc:L120-L146`).
 *
 * @param composedPath a path already assembled for display.
 * @returns the same string, tagged. Never mutated, never inspected.
 */
export function toImageWebPath(composedPath: string): ImageWebPath {
  return composedPath as ImageWebPath;
}

/**
 * The argument set that crosses into the image service when a resized image PATH is requested.
 *
 * Legacy origin: the argument scope forwarded by `argumentCollection=arguments` at
 * `model/entity/Sku.cfc:L218`, as assembled by `getResizedImagePath`
 * (`model/entity/Sku.cfc:L192-219`). The legacy method declares no parameters at all and relies on
 * the CFML argument scope, which AAP 0.7.3 S1 forbids reproducing as an untyped bag; the members
 * below are the argument names that method actually writes, with the presence semantics of the
 * four-part gate at `model/entity/Sku.cfc:L203` preserved exactly.
 *
 * Every member is `readonly`. I4 above shows the legacy method rewriting its own argument scope in
 * place; an implementation of this port is downstream of that rewriting and has no business
 * repeating it.
 */
export interface ResizedImagePathRequest {
  /**
   * The unresized image path, always present.
   *
   * `model/entity/Sku.cfc:L195` assigns it unconditionally, before any gate, from the SKU's own
   * `getImagePath()` (`model/entity/Sku.cfc:L145`). It is therefore required here rather than
   * optional — a TR-1 tightening of a CFML argument that carries no declaration at all, recorded
   * rather than made silently.
   *
   * Its value is the web-URL-shaped string described in the EXECUTION-MODEL MISMATCH section:
   * `model/entity/Sku.cfc:L146` composes it from the base image URL, the
   * {@link SKU_IMAGE_PATH_SEGMENT} literal and the SKU's image file name.
   *
   * ⭐ TYPED {@link ImageWebPath} PER DECISION I-1, so the member says in the type system what the
   * preceding paragraph says in prose. Before the split this was an open `string`, which meant a raw
   * stored file name and a composed URL were interchangeable here — and they are not: the resized
   * rendition is resolved RELATIVE to a composed path. The brand is obtained by forwarding the result
   * of {@link ImagePathPort.getImagePath}, exactly as `model/entity/Sku.cfc:195` forwards it, so no
   * caller in the slice mints anything to satisfy this member.
   */
  readonly imagePath: ImageWebPath;

  /**
   * The fallback path used when the image itself is absent, always present.
   *
   * `model/entity/Sku.cfc:L197-L200` defaults it from a setting whenever the caller has not supplied
   * it, so by the time the boundary at `model/entity/Sku.cfc:L218` is reached the argument is
   * guaranteed to exist. Required here for that reason (TR-1). The value may legitimately be an
   * empty string, because the default comes straight from `imageMissingImagePath` at
   * `model/entity/Sku.cfc:L199` and that setting can be unset; the key itself is
   * `SettingResolverPort`'s to own, not this port's.
   *
   * ⭐ DELIBERATELY LEFT AN OPEN `string` WHERE ITS SIBLING IS BRANDED, and the asymmetry is reasoned
   * rather than an oversight. This value is CONFIGURATION read straight from a setting, not a path
   * this slice composes, so there is nothing for a mint to attest; branding it would oblige every
   * caller to tag a setting value, and `src/domain/sku/Sku.ts` — which resolves the setting at
   * `model/entity/Sku.cfc:198-200` — is admitted to `src/ports/**` only as `import type` and so cannot
   * call a mint. The security property does not depend on it either way: DECISION I-1 exists to keep
   * values OUT of file-system members, and this member reaches none. It is consumed only as the
   * fallback that {@link ImagePathPort.getResizedImagePath} may return for display.
   */
  readonly missingImagePath: string;

  /**
   * The raw size token, when one survives the gate.
   *
   * Typed as an OPEN `string` and deliberately NOT as a union of the three tokens the ladder
   * recognises. I1 is the reason: `model/entity/Sku.cfc:L177-L183` has no trailing `else`, so an
   * arbitrary token legitimately flows into the interpolated settings key at
   * `model/entity/Sku.cfc:L184-L185`. A closed union would make an input the legacy system accepts
   * unrepresentable, which is a behavior change disguised as a type improvement, and it would
   * contradict the matching decision `SettingResolverPort` takes for the interpolated
   * width and height keys.
   *
   * It is optional because it is absent on the two commonest paths: the gate at
   * `model/entity/Sku.cfc:L203` requires it, and the Google feed omits it entirely at
   * `integrationServices/google/views/feed/product.cfm:L23`. When the gate SUCCEEDS the token is
   * removed at `model/entity/Sku.cfc:L215` and never reaches an implementation; when the gate FAILS
   * — for instance because an explicit width was supplied — it survives and is forwarded. Omit the
   * member to mean absent; `exactOptionalPropertyTypes` makes that the only way to say it.
   */
  readonly size?: string;

  /**
   * Target width in pixels, present either because the caller supplied it or because the gate
   * derived it.
   *
   * Derived form: `model/entity/Sku.cfc:L212` reads the interpolated `productImage<size>Width`
   * setting through the product. Caller-supplied form: clause 3 of the gate at
   * `model/entity/Sku.cfc:L203` tests for exactly this argument, and its presence suppresses the
   * derivation.
   *
   * TR-1 tightening, recorded: the legacy value is whatever the untyped setting accessor returns
   * (`model/entity/Sku.cfc:L212`), and a pixel dimension is numeric by nature, so it is typed
   * `number` here. Converting a setting value into that shape is the caller's responsibility, and
   * the conversion sits in the domain member where the legacy read happens. No default dimension is
   * declared anywhere in this file — the source states none, and AAP 0.7.3 S9 forbids inventing
   * one.
   */
  readonly width?: number;

  /**
   * Target height in pixels, with exactly the semantics of {@link ResizedImagePathRequest.width}.
   *
   * Derived at `model/entity/Sku.cfc:L213` from the interpolated `productImage<size>Height` setting;
   * tested for presence by clause 4 of the gate at `model/entity/Sku.cfc:L203`. Either dimension
   * alone is enough to suppress the derivation, so the two members are independent.
   */
  readonly height?: number;

  /**
   * How the image service should scale, when the gate supplied a value or the caller did.
   *
   * `model/entity/Sku.cfc:L214` sets it to the literal recorded as
   * {@link IMAGE_RESIZE_METHOD_SCALE_BEST}, and that is the only value the slice ever names. Typed
   * as an open `string` all the same, for the reason given on that constant: the argument scope is
   * forwarded wholesale at `model/entity/Sku.cfc:L218`, so the legacy contract does not close the
   * set.
   *
   * Optional, because it is written only inside the gated branch at
   * `model/entity/Sku.cfc:L203-L216`. On the Google feed path
   * (`integrationServices/google/views/feed/product.cfm:L23`) no resize method is sent at all.
   */
  readonly resizeMethod?: string;
}

/**
 * The argument set that crosses into the image service when an uploaded SKU image is stored.
 *
 * Legacy origin: `model/service/SkuService.cfc:L212`, the third and final image-service call site in
 * the slice. Member names are the boundary's names, not the caller's: the enclosing method declares
 * its parameter as `imageUploadResult` at `model/service/SkuService.cfc:L210` and then forwards it
 * under the name `uploadResult` at `model/service/SkuService.cfc:L212`. The boundary name is the one
 * that belongs in a port.
 */
export interface SaveImageFileRequest {
  /**
   * The opaque result of the upload that produced the image, passed straight through.
   *
   * `model/service/SkuService.cfc:L210` declares it as a required CFML struct and
   * `model/service/SkuService.cfc:L212` forwards it without reading a single key, so the legacy code
   * itself treats the value as opaque. It is modelled as a read-only string-keyed record of unknown
   * values, which preserves "a struct of unspecified shape" without resorting to an unchecked type
   * — AAP 0.7.3 S1 permits no such escape and no suppression comment.
   *
   * Its interior is deliberately unmodelled. AAP 0.6.3.1 classifies the temporary-directory
   * facility this upload flows through as a framework artifact, "Excluded — image boundary", so no
   * multipart structure, no temporary-directory convention and no stream type is described here or
   * anywhere in this file.
   */
  readonly uploadResult: Readonly<Record<string, unknown>>;

  /**
   * WHERE the file is stored — the legacy `filePath` argument, under its own name.
   *
   * `model/service/SkuService.cfc:L211` obtains the value from the SKU's own `getImagePath()` and
   * `model/service/SkuService.cfc:L212` passes it as `filePath`, so a composed WEB URL is what actually
   * crosses this boundary. Typed {@link ImageWebPath} to record exactly that, and NOT narrowed further:
   * see DECISION I-1 above, control (4), for the revision that replaced this member with a validated
   * basename and no destination, and for why that rewrite was never a hardening — a basename carries no
   * destination, so it did not confine the write, it destroyed it.
   *
   * ⭐ THE VALUE THAT ARRIVES HERE IS PRE-SCREENED AT ITS SOURCE, AND IT IS STILL THE WHOLE COMPOSED PATH.
   * Under review finding SEC-FILE-01, `src/services/SkuService.ts` screens the stored `imageFile` against the
   * shape `model/entity/Sku.cfc:L131-L139`'s generator can produce BEFORE the path is composed, so what
   * reaches this member is one safe segment appended to the legacy's own prefix — which confines it to
   * whatever that prefix denotes, without this port ever naming a root. The path is otherwise handed over
   * byte for byte, exactly as `model/service/SkuService.cfc:L211-L212` hands it over. An adapter still owes
   * obligations (a)-(f) on {@link ImagePathPort.saveImageFile} as defence in depth; the READ path's exposure
   * is separate and stays carried (control (3)).
   *
   * The name is the boundary's name, not the caller's, exactly as `uploadResult` is: the enclosing
   * legacy member holds the value in a local called `imagePath` at `:L211` and passes it as `filePath`
   * at `:L212`.
   */
  readonly filePath: ImageWebPath;

  /**
   * The comma-delimited list of acceptable file extensions.
   *
   * Required rather than optional: the one call site in the slice supplies it explicitly and
   * unconditionally at `model/service/SkuService.cfc:L212`, so under TR-1 the contract is tightened
   * to the observed shape and the tightening is recorded here. Callers pass
   * {@link IMAGE_UPLOAD_ALLOWED_EXTENSIONS}, which carries the four legacy values verbatim; the
   * type stays `string` because the delimited list is what crosses the boundary.
   */
  readonly allowedExtensions: string;
}

/**
 * The image boundary of the extracted Catalog slice.
 *
 * Four members, one per in-scope legacy concept, in the order AAP 0.4.1.6 lists them. Every member
 * resolves a `Promise`, for the reason given in the ASYNCHRONY section of the module header.
 *
 * An implementation belongs in `src/adapters/`. This interface is intentionally small enough to
 * satisfy with a plain object literal, which is how the test suite substitutes it: AAP 0.4.3.6
 * records that the legacy repository contains no mocking library at all, so hand-written doubles
 * are the only mechanism available. Coverage for the members below is NET-NEW — the legacy suite
 * contains no test of any image member — and it is flagged as such rather than implied to be
 * traceable, per AAP 0.8.3.7.
 */
export interface ImagePathPort {
  /**
   * Resolves the unresized path of a SKU image from its stored file name.
   *
   * Legacy origin `model/entity/Sku.cfc:L145`, whose body at `model/entity/Sku.cfc:L146` composes
   * the base image URL, the {@link SKU_IMAGE_PATH_SEGMENT} literal and the SKU's image file name.
   *
   * This is a port member even though the legacy method never calls the image service, because the
   * value it needs is not the SKU's to produce: the base image URL comes from
   * `model/transient/HibachiScope.cfc:L186`, which derives it from the
   * `globalAssetsImageFolderPath` setting through a container URL facility. Both the facility and
   * the setting sit outside this slice, so composing the path is boundary work. Neither the base
   * URL accessor nor the URL facility is exposed as a member of this interface: AAP 0.8.3.2 makes
   * the framework tree "a boundary to extract from, never modify", so its contract is read and its
   * code is not carried.
   *
   * ⭐ THE PARAMETER STAYS AN OPEN `string` AND THE RETURN IS BRANDED, which is DECISION I-1's display
   * arm expressed as a signature. The legacy interpolates whatever is stored without inspecting it
   * (`model/entity/Sku.cfc:146`), and rejecting a malformed name here would break the Google feed for a
   * single bad row — a behaviour change in the opposite direction from the one the finding asks for. So
   * composition never fails; what the brand adds is that the RESULT is marked as a URL.
   *
   * ⚠️ AN EARLIER FORM OF THE SENTENCE ABOVE ENDED "and is consequently refused by every file-system
   * member of this interface", WHICH WAS FALSE AND CONTRADICTED DECISION I-1 IN THE SAME FILE. Both
   * file-system members ACCEPT an {@link ImageWebPath} — see {@link ImagePathPort.getImageExistsFlag} and
   * {@link SaveImageFileRequest.filePath} — precisely so that the composed value the legacy hands them can
   * still be handed to them. The claim survived from the pre-withdrawal revision, where the brand DID make
   * those two call shapes uncompilable. Nothing here refuses anything.
   *
   * ⛔ AND NO GATE PRECEDES THIS MEMBER ON THE DISPLAY PATH, WHICH IS MOST OF ITS TRAFFIC. Composition is
   * display work, reached by the Google feed and by admin display for every SKU, so it is not gated:
   * `model/entity/Sku.cfc:L145-L147` interpolates whatever is stored, and refusing to compose would change
   * what a display surface renders. The ONE caller that goes on to WRITE — `processImageUpload` in
   * `src/services/SkuService.ts` — screens the stored name first under review finding SEC-FILE-01 and does
   * not reach this member at all when it refuses, so a gated write costs this member nothing.
   *
   * @param imageFile the SKU's stored image file name — the persistent property declared at
   *   `model/entity/Sku.cfc:58`, which `model/entity/Sku.cfc:146` interpolates as the final segment
   *   of the path. Accepted unvalidated, exactly as the legacy accepts it.
   * @returns the composed image path, in the same web-URL-shaped form the legacy method returns,
   *   tagged {@link ImageWebPath} via {@link toImageWebPath}.
   */
  getImagePath(imageFile: string): Promise<ImageWebPath>;

  /**
   * Resolves the path of a resized rendition of an image.
   *
   * Legacy origin `model/entity/Sku.cfc:L192`, boundary call `model/entity/Sku.cfc:L218`. This is
   * the member the Google product feed consumes: `g:image_link` at
   * `integrationServices/google/views/feed/product.cfm:L23` is built from it, with no arguments
   * supplied beyond the two the SKU always sets.
   *
   * The request arrives already past the four-part gate at `model/entity/Sku.cfc:L203`. An
   * implementation must NOT re-apply that gate, must not rewrite the request, and must not
   * substitute a size token for a missing dimension — every one of those decisions has already been
   * made, or deliberately not made, upstream. See the parity register above for the five ways the
   * two legacy siblings differ and for why {@link ResizedImagePathRequest.size} is an open string.
   *
   * @param request the post-gate argument set forwarded at `model/entity/Sku.cfc:L218`.
   * @returns the resized rendition's path, or the request's `missingImagePath` where the legacy
   *   image service would have fallen back to it (`model/entity/Sku.cfc:199`). Either way the value is
   *   for display and is tagged {@link ImageWebPath}; where the fallback is returned the adapter tags
   *   the configured value with {@link toImageWebPath}, which is a label and not an assertion about it.
   */
  getResizedImagePath(request: ResizedImagePathRequest): Promise<ImageWebPath>;

  /**
   * Reports whether the image behind a path actually exists.
   *
   * Legacy origin `model/entity/Sku.cfc:L221`, whose body at `model/entity/Sku.cfc:L222` tests
   * `fileExists(expandPath(getImagePath()))` and returns a plain boolean at
   * `model/entity/Sku.cfc:L223` and `model/entity/Sku.cfc:L225`.
   *
   * READ THE EXECUTION-MODEL MISMATCH SECTION OF THIS MODULE BEFORE IMPLEMENTING THIS MEMBER. The
   * legacy implementation hands a web URL to a container facility that resolves virtual application
   * paths onto a real file system, and neither the facility nor a product-image directory exists on
   * the target runtime. The member is declared regardless, because TR-5 forbids quietly dropping a
   * boundary member, and how to answer the question is left to the adapter as an explicit,
   * documented decision rather than being prejudged by this contract.
   *
   * ⚠️ THE PARAMETER IS THE COMPOSED PATH, BECAUSE THAT IS WHAT `:L222` PROBES WITH. An earlier
   * revision narrowed it to the stored NAME and imposed three obligations on an implementation —
   * validate the basename, join it under an injected containment directory, canonicalise the join and
   * probe only that. All of it stays withdrawn: it made a traversal name resolve `false` where the legacy
   * reported on the traversed file, which is an outcome change, and the containment directory had no
   * legacy counterpart to derive a value from. See DECISION I-1 above, control (3).
   *
   * ⛔ AND NO GATE REACHES THIS MEMBER — THE VERDICT FOR THE READ PATH, AND IT IS NOW THE ONLY PATH THAT
   * KEEPS IT (DECISION I-1 control (3)). `:L222` answers a boolean about whatever the composed path resolves
   * to, including a traversed one, and that answer is a DEFINED legacy outcome for every input: refusing to
   * probe would replace it with a different one, on an operation that writes nothing and discloses one bit.
   * That is what distinguishes this member from the write, where review finding SEC-FILE-01 established
   * there is no defined legacy outcome to preserve at all. The residual CWE-22 exposure here is therefore
   * FLAGGED at `model/entity/Sku.cfc:L222` for the operator to close in an adapter — deliberately still
   * open, and deliberately no longer symmetrical with {@link ImagePathPort.saveImageFile}.
   *
   * @param imagePath the composed path, as `model/entity/Sku.cfc:L222` supplies it — the result of
   *   {@link ImagePathPort.getImagePath}, which is what `expandPath` receives there. Accepted
   *   unvalidated, exactly as the legacy accepts it.
   * @returns `true` when the image exists, mirroring `model/entity/Sku.cfc:223`; `false` otherwise,
   *   mirroring `model/entity/Sku.cfc:225`. The legacy member never raises and never yields a third
   *   state, so an implementation that cannot determine existence must resolve one of these two and
   *   say in its own documentation which it chose and why.
   */
  getImageExistsFlag(imagePath: ImageWebPath): Promise<boolean>;

  /**
   * Stores an uploaded image against a SKU image path.
   *
   * Legacy origin `model/service/SkuService.cfc:L212`, reached from `processImageUpload`
   * (`model/service/SkuService.cfc:L210-L218`). AAP 0.4.1.8 boundary-stubs that service member
   * precisely because of "the hidden dynamic `imageService` dependency", so this declaration is
   * what the stub is implemented against.
   *
   * The member stores; it does not transform. No scaling, cropping, format conversion or dimension
   * inspection is part of this contract — the port trades in paths and flags, and AAP 0.7.3 S9 forbids
   * inventing capability the source does not state.
   *
   * =================================================================================================
   * ⭐⭐ OBLIGATIONS ON AN IMPLEMENTATION — REVIEW FINDING SEC-FILE-01 (CWE-22, CWE-434)
   * =================================================================================================
   * ⛔ THIS CONTRACT USED TO IMPOSE NOTHING BEYOND STORING THE BYTES, AND THAT ABSENCE *WAS* THE FINDING.
   * The review's own mitigating fact reads: "The shipped production image adapter is NotImplemented and
   * refuses, so no current file write occurs. The vulnerability becomes reachable AS SOON AS A FUNCTIONAL
   * ADAPTER IS SUPPLIED UNDER THE EXISTING CONTRACT." So the defect was never a byte this port writes —
   * it writes none — it was that an implementer reading this contract was told to store a path and told
   * nothing else. A future adapter author would have been conforming, and exposed.
   *
   * ⭐ WHY STATING OBLIGATIONS IS NOT THE HARDENING DECISION I-1 WITHDREW. Those controls were withdrawn
   * because they changed an OUTCOME for input the legacy accepts. An obligation on an unimplemented member
   * changes no outcome of any request, because there is no implementation for it to change: it constrains
   * whoever writes one, which is the layer that AAP §0.4.1.7 places outside this checkpoint and that
   * DECISION I-1 control (2) itself names as "the only layer that knows its own storage root". Stating what
   * that layer must do is discharging AAP §0.7.3 S8 — flag the mismatch — in the one form the mismatch can
   * be flagged so that it is not simply inherited.
   *
   * ⭐ AN IMPLEMENTATION OF THIS MEMBER MUST, and a deployment reviewing an adapter should check each:
   *   (a) RESOLVE AND CANONICALISE the destination under its own storage root or object-key namespace, and
   *       re-verify containment AFTER canonicalisation — before opening anything for writing. `filePath`
   *       arrives as a composed WEB path (see {@link SaveImageFileRequest.filePath}), not a filesystem
   *       path, and translating one into the other is this layer's work.
   *   (b) REFUSE a destination that escapes that root, including via a SYMLINK whose target lies outside
   *       it. Canonicalisation alone does not catch a symlink created between the check and the open, so
   *       the containment test belongs on the opened handle where the platform allows it.
   *   (c) IMPOSE A BYTE LIMIT on the stored payload, and refuse rather than truncate.
   *   (d) VERIFY THE CONTENT is an image of a permitted type by inspecting the bytes, treating the
   *       extension in `allowedExtensions` as a SECONDARY check rather than the primary one. An extension
   *       is caller-controlled metadata; the magic bytes are the artefact.
   *   (e) NOT SILENTLY OVERWRITE an existing object it did not intend to replace.
   *   (f) REFUSE BY RESOLVING `false`, WITHOUT LEAKING DESTINATION DETAIL — no resolved path, no storage
   *       root, no partial candidate, and no distinction a caller could use to probe the filesystem. This
   *       is the one obligation that is ALSO a preservation requirement: `model/service/SkuService.cfc:L216`
   *       returns `false` and records nothing, so a raise would hand callers a failure mode the legacy
   *       never had. See the `⚠️ A DECLINED WRITE` note on `SkuService.processImageUpload`.
   *
   * ⚠️ THESE ARE OBLIGATIONS, NOT INJECTED CONFIGURATION, AND THE DISTINCTION KEEPS AAP §0.7.3 S9 AND
   * IR-12 SATISFIED. No root VALUE, no byte FIGURE and no MIME LIST is authored here — every one of those
   * is an operator's to state, exactly as the six resource bounds are. What is authored is the requirement
   * that an implementation have them. DECISION I-1 controls (2), (4) and (6) stay withdrawn on that same
   * line: this port still injects no `ImageStorageBase`, still substitutes no basename for the composed
   * path, and still inspects no bytes itself.
   *
   * ⭐ AND THE TRAVERSAL IS ALREADY REFUSED UPSTREAM, SO (a)-(f) ARE DEFENCE IN DEPTH RATHER THAN THE ONLY
   * LINE. `src/services/SkuService.ts` screens the stored `imageFile` against the shape
   * `model/entity/Sku.cfc:L131-L139`'s own generator can produce, BEFORE a path is composed, so a
   * `../../../../tmp/payload.jpg` never reaches this member at all. That gate rests on a fact verified
   * repo-wide and recorded in DECISION I-1: this member DOES NOT EXIST IN THE LEGACY, and the one call site
   * cannot dispatch to the framework fallback because that fallback takes ordered arguments only. There is
   * no legacy outcome on this path to preserve, so the gate is a specification rather than a divergence,
   * and AAP §0.6.7.7's single-exception clause is not engaged. The READ path is different and its exposure
   * remains carried and flagged — see {@link ImagePathPort.getImageExistsFlag}.
   *
   * ⚠️ NO RETENTION, PERMISSION OR NAMING POLICY IS STATED, deliberately, and (e) is not one. The legacy
   * declares none — `model/service/SkuService.cfc:212` names a path and passes bytes — and AAP §0.7.3
   * standard 9 forbids inventing one. Refusing a SILENT overwrite is a safety obligation on the
   * implementation, not a lifecycle policy for stored objects; an adapter that needs the latter receives it
   * the way any other storage-shaped decision reaches this port: injected, as a product decision.
   *
   * @param request the boundary argument set assembled at `model/service/SkuService.cfc:L212`.
   * @returns `true` when the image was stored. The legacy method narrows the image service's result
   *   to a boolean at `model/service/SkuService.cfc:L213-L217`, returning `true` at
   *   `model/service/SkuService.cfc:L214` and `false` at `model/service/SkuService.cfc:L216`, so the
   *   boolean is the observable contract even though the enclosing CFML member is declared with the
   *   loosest possible return type. Recorded as a TR-1 tightening.
   */
  saveImageFile(request: SaveImageFileRequest): Promise<boolean>;
}
