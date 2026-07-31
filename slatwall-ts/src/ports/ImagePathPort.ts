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
 * ⭐ PLUS THREE VALUE TYPES AND TWO PURE FUNCTIONS, and their presence in a port module is reasoned
 * rather than convenient. DECISION I-1 below splits the single `string` that used to serve as both a
 * display URL and a write destination into {@link ImageWebPath}, {@link ImageFileName} and
 * {@link ImageFileNameCandidate}, minted by {@link validateImageFileName} and {@link toImageWebPath}.
 * They belong HERE, not in an adapter, for three reasons: the types ARE the contract, so an adapter
 * declaring them would leave the contract open; {@link validateImageFileName} is the sole gate to the
 * write path and a boundary cannot delegate its own gate to the thing it is guarding; and both
 * functions are pure string predicates that perform no I/O, import nothing and touch no environment, so
 * neither weakens the "contracts here, I/O there" rule this section states.
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
 *     set at one runtime package plus ten development packages, and this file adds nothing to it.
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
 * ⭐ THAT AMBIGUITY IS NOW RESOLVED IN THE TYPES, AND ONLY THE UNIMPLEMENTABILITY REMAINS A MISMATCH.
 * DECISION I-1 below splits URL semantics from file-system semantics, so neither file-system member
 * accepts a composed path any longer: the existence flag takes the stored NAME
 * ({@link ImageFileNameCandidate}) and the save member takes a VALIDATED BASENAME
 * ({@link ImageFileName}) with no destination at all. What survives as a mismatch is narrower and
 * genuinely unresolvable here — that a Lambda runtime has no `expandPath` equivalent and no persistent
 * product-image directory to resolve against. The two questions were tangled together in the legacy and
 * are deliberately separated now: one was a defect and has been fixed, the other is an execution-model
 * gap and is still flagged.
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
 * NO MISMATCH NUMBER IS CLAIMED. The mismatch register is CLOSED at M1 through M9, and every one of
 * the nine is already allocated: M1, M3 and M4 to the product importer, M2 to the feed handler, M5 to
 * the unit of work for the request-end implicit transaction demarcation, M6 to the validation
 * read-back loop, M7 to the repository ports, M8 to `SettingResolverPort`, and M9 — CFML struct
 * iteration being unordered where the target's is not, found during the port rather than catalogued
 * in AAP 0.6.6 — to `src/services/SkuService.ts`. This one is an additional, unnumbered mismatch,
 * and inventing a TENTH number would violate AAP 0.7.3 S9.
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
 * SEC-07 — DECISION I-1: URL SEMANTICS AND FILESYSTEM SEMANTICS ARE DIFFERENT TYPES
 *
 * ⛔ THE LEGACY CONFLATES THEM, AND THAT CONFLATION IS THE VULNERABILITY. `model/entity/Sku.cfc:L146`
 * composes a WEB URL by interpolating the stored column value:
 *     "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"
 * Two consumers then feed that URL-shaped string to the FILESYSTEM:
 *   - `model/entity/Sku.cfc:L222` — `fileExists(expandPath(getImagePath()))`
 *   - `model/service/SkuService.cfc:L211-L212` — the same value is passed as `filePath` to
 *     `saveImageFile`, which WRITES.
 * `imageFile` is a persistent `SwSku` column (`model/entity/Sku.cfc:L58`) with NO validation rule in
 * `model/validation/Sku.json`, so a stored value of `../../../../tmp/payload.jpg` — the review's own
 * runtime vector — normalises straight out of the intended directory on both paths. Arbitrary file
 * placement and overwrite follow.
 *
 * ⭐ THE SPLIT IS THE FIX, AND IT COSTS NO DISPLAY BEHAVIOUR. Three types replace one `string`:
 *   - {@link ImageWebPath} — what `getImagePath` and `getResizedImagePath` return. Display only.
 *     Composed exactly as the legacy composes it, from whatever is stored, so NOTHING about the
 *     rendered feed or admin markup changes. It is branded solely so that it CANNOT be handed to a
 *     filesystem operation; that single restriction removes the traversal reach at compile time
 *     without touching a single rendered character.
 *   - {@link ImageFileName} — a validated BASENAME. Minted only by
 *     {@link validateImageFileName}, which is the only route by which any filesystem-facing member
 *     can be reached.
 *   - {@link ImageStorageBase} — the trusted directory a write is confined to. INJECTED, never
 *     written down here: report finding 8 requires that path-hardening policy be a product decision
 *     rather than silently invented in code, and AAP §0.7.3 standard 9 forbids minting the value.
 *
 * ⭐ THE FAILURE MODES ARE DELIBERATELY ASYMMETRIC, because the two consumers are asymmetric:
 *   - DISPLAY never fails. An unvalidated stored value still composes a path, exactly as before. A
 *     malformed name in a URL is not a filesystem risk, and raising here would break the Google feed
 *     for one bad row — a behaviour change in the opposite direction.
 *   - EXISTENCE resolves `false`. A value that cannot be a filename cannot name a stored file, and
 *     `false` is precisely what `model/entity/Sku.cfc:L225` already answers for a file that is not
 *     there, so the observable contract is unchanged and no third state is introduced.
 *   - STORING RAISES. See {@link SaveImageFileRequest} for why a boolean cannot carry this refusal.
 *
 * ⚠️ THIS IS A DECLARED HARDENING EXCEPTION, THE SECOND IN THE PORT, ON THE PRECEDENT OF DEFECT D18
 * (AAP §0.6.7.7). The legacy would have written outside the directory; this contract refuses to. That
 * is a real behavioural divergence and it is declared here rather than slipped in, so a reviewer
 * comparing the port against CFML knows it is intended. It is confined to the filesystem members: no
 * display output, no URL, no error key and no rendered field changes.
 * ============================================================================================== */

declare const IMAGE_WEB_PATH: unique symbol;
declare const IMAGE_FILE_NAME: unique symbol;

/**
 * A web-URL-shaped image path, for DISPLAY only.
 *
 * Composed as `model/entity/Sku.cfc:L146` composes it. ⛔ It is NOT a filesystem path and no member
 * of this port accepts it as one — that is the entire reason it carries a brand. `expandPath` on a
 * value of this shape is what `model/entity/Sku.cfc:L222` did, and it is the reach this type removes.
 */
export type ImageWebPath = string & { readonly [IMAGE_WEB_PATH]: 'web' };

/**
 * A validated image BASENAME — never a path.
 *
 * ⛔ UNFORGEABLE. `IMAGE_FILE_NAME` is a module-private `unique symbol` that is never exported, so no
 * `string` is assignable here and {@link validateImageFileName} is the only producer.
 */
export type ImageFileName = string & { readonly [IMAGE_FILE_NAME]: 'basename' };

/**
 * Anything that is NOT a composed web path: a raw stored column value, or a validated
 * {@link ImageFileName}.
 *
 * ⭐ THIS IS THE TYPE THAT REMOVES THE `expandPath` REACH, and it does so without requiring any caller
 * to mint a brand. The optional-`never` member is the mechanism: a plain `string` carries no
 * `IMAGE_WEB_PATH` property and so satisfies it, an {@link ImageFileName} carries a different brand
 * key and so satisfies it, but an {@link ImageWebPath} declares `IMAGE_WEB_PATH: 'web'` — which is not
 * assignable to `never` — and is therefore REJECTED AT COMPILE TIME.
 *
 * ⭐ WHY THAT ASYMMETRY IS EXACTLY WHAT WAS NEEDED HERE. The one consumer of the existence member is
 * `src/domain/sku/Sku.ts`, whose dependency contract admits `src/ports/**` only as `import type`. A
 * parameter of type {@link ImageFileName} would have forced that entity to call a runtime validator it
 * is not permitted to import; a parameter of plain `string` would have kept accepting the composed URL
 * that is the defect. This type accepts the raw stored value the entity already holds while making the
 * URL form unrepresentable, so the vulnerable call shape stops compiling with no new import at all.
 *
 * ⚠️ IT IS A DIRECTION, NOT A PROOF. Satisfying it means "this is not a web path"; it does NOT mean
 * "this is a safe basename". An implementation that touches a file system MUST still run
 * {@link validateImageFileName} — the obligation is stated on {@link ImagePathPort.getImageExistsFlag}.
 */
export type ImageFileNameCandidate = string & { readonly [IMAGE_WEB_PATH]?: never };

/**
 * Labels an already-composed image URL as an {@link ImageWebPath}.
 *
 * ⚠️ A NOMINAL TAG, NOT A VALIDATION, and deliberately so. It asserts nothing about the value; it
 * records that the value is a URL rather than a file-system path. That single distinction is what the
 * type system then enforces, because no member that touches a file system accepts an
 * {@link ImageWebPath} — see {@link ImageFileNameCandidate} and {@link SaveImageFileRequest}.
 *
 * ⛔ IT CANNOT WIDEN A CALLER'S REACH. The only brand it produces is the DISPLAY brand; there is no
 * route from here to an {@link ImageFileName}, so no amount of tagging lets a caller reach the file
 * system. {@link validateImageFileName} remains the sole entrance to the write path.
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
 * The trusted directory that image writes are confined to.
 *
 * ⛔ NO DEFAULT AND NO LITERAL. The value is an operator decision travelling from the composition
 * root; report finding 8 requires exactly that, and AAP §0.7.3 standard 9 forbids inventing it. The
 * legacy has no equivalent — it derived a destination from the stored column value — so there is no
 * source value to carry, and a fabricated one would be the invention the AAP prohibits.
 *
 * ⭐ IT IS THE ADAPTER'S CONSTRUCTION-TIME CONFIGURATION, NOT A REQUEST MEMBER, and the placement is
 * the point. Putting a trusted absolute directory on {@link SaveImageFileRequest} would oblige
 * `src/services/SkuService.ts` to hold file-system configuration in order to ask for a store, which
 * inverts the hexagonal separation AAP §0.7.3 standard 4 requires and would let a caller choose the
 * base it is supposed to be confined to. The shape is declared here so the composition root has a
 * typed value to inject into whichever adapter implements {@link ImagePathPort}; AAP §0.4.1.7
 * enumerates no image adapter, so none is authored in this checkpoint.
 */
export interface ImageStorageBase {
  /**
   * An absolute, already-canonical directory under which every stored image must land.
   *
   * The adapter MUST canonicalise the joined destination and re-verify containment after doing so;
   * see {@link SaveImageFileRequest}. Declaring the base canonical here does not discharge that
   * obligation, because canonicalisation of the JOIN is what defeats symlink and normalisation
   * tricks that a basename check alone cannot see.
   */
  readonly absoluteDirectory: string;
}

/**
 * Accepts a stored image file name if — and only if — it is a safe basename with an allowed
 * extension, and reports rejection rather than repairing the value.
 *
 * ⛔ NOTHING IS SANITISED, STRIPPED OR REWRITTEN. A rejected value is rejected; it is never turned
 * into an accepted one. Sanitising is what makes traversal filters defeatable — `....//` and
 * percent- or overlong-encoded separators survive one pass of stripping — and it would also silently
 * change which file a caller addressed. Membership is decided; the value is returned unchanged.
 *
 * The clauses, each independent:
 *   1. non-empty, and no longer than the column allows — `ormtype="string" length="50"` at
 *      `model/entity/Sku.cfc:L58`, so a longer value could never have been stored anyway;
 *   2. no ASCII control character and no NUL, tested on the RAW value before anything else, because a
 *      NUL truncates the path in some filesystem layers below this one;
 *   3. no path separator of either flavour, `/` or `\`, so the value cannot address a directory;
 *   4. not `.` or `..`, and no `..` segment anywhere;
 *   5. no drive-letter or UNC prefix, so it cannot be absolute on any platform;
 *   6. exactly one extension separator, positioned so that both a non-empty stem and a non-empty
 *      extension exist — which also rejects a leading-dot name with no stem;
 *   7. the extension, case-insensitively, is a member of `allowedExtensions`. The four legacy values
 *      arrive verbatim in {@link IMAGE_UPLOAD_ALLOWED_EXTENSIONS} from
 *      `model/service/SkuService.cfc:L212`; no extension is added to that set here.
 *
 * ⚠️ AN EXTENSION IS NOT CONTENT. Clause 7 checks a NAME. Verifying that the bytes are actually an
 * image is a distinct obligation and it belongs to the adapter, which is the only layer that holds
 * them; it is stated as a requirement on {@link SaveImageFileRequest} rather than pretended to here.
 *
 * @param candidate the stored value, as read from the entity. Never mutated.
 * @param allowedExtensions the comma-delimited list from `model/service/SkuService.cfc:L212`.
 * @returns the same string, branded, or `undefined` when any clause fails.
 */
export function validateImageFileName(
  candidate: string,
  allowedExtensions: string,
): ImageFileName | undefined {
  // 1 — length. 50 is the declared column width at `model/entity/Sku.cfc:L58`, not a chosen bound.
  if (candidate.length === 0 || candidate.length > SKU_IMAGE_FILE_COLUMN_LENGTH) {
    return undefined;
  }
  // 2 — control characters and NUL, on the raw value.
  if (/[\u0000-\u001F\u007F]/.test(candidate)) {
    return undefined;
  }
  // 3 — separators of either flavour.
  if (candidate.includes('/') || candidate.includes('\\')) {
    return undefined;
  }
  // 4 — relative-traversal spellings. Clause 3 already removed `../`, so this catches the bare forms.
  if (candidate === '.' || candidate === '..' || candidate.includes('..')) {
    return undefined;
  }
  // 5 — absolute forms: a Windows drive letter, or a UNC prefix that clause 3 would already reject.
  if (/^[a-zA-Z]:/.test(candidate)) {
    return undefined;
  }
  // 6 — exactly one separator, with a non-empty stem and a non-empty extension on either side.
  const separatorIndex = candidate.indexOf('.');
  if (
    separatorIndex <= 0 ||
    separatorIndex !== candidate.lastIndexOf('.') ||
    separatorIndex === candidate.length - 1
  ) {
    return undefined;
  }
  // 7 — extension membership, case-insensitive, against the caller's list.
  const extension = candidate.slice(separatorIndex + 1).toLowerCase();
  const permitted = allowedExtensions
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (!permitted.includes(extension)) {
    return undefined;
  }
  return candidate as ImageFileName;
}

/**
 * The declared width of the `imageFile` column — `ormtype="string" length="50"` at
 * `model/entity/Sku.cfc:L58`.
 *
 * A source-declared figure carrying its locator, not a chosen limit (AAP §0.7.3 standard 9).
 */
const SKU_IMAGE_FILE_COLUMN_LENGTH = 50;

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
   * WHICH FILE is being stored — a validated basename, never a destination.
   *
   * ⛔ THIS MEMBER REPLACES THE LEGACY `filePath` ARGUMENT, AND THE RENAME IS THE FIX RATHER THAN
   * TIDYING. `model/service/SkuService.cfc:211` obtained the legacy value from the SKU's own
   * `getImagePath()` and `model/service/SkuService.cfc:212` passed it as `filePath`, so a WEB URL
   * composed from an unvalidated persistent column arrived at a member that WRITES. Because
   * `imageFile` (`model/entity/Sku.cfc:L58`) carries no rule in `model/validation/Sku.json`, a stored
   * `../../../../tmp/payload.jpg` — the review's own runtime vector — resolved clean out of the
   * intended directory. Keeping the name while changing nothing else would have preserved a defect
   * that a comment cannot mitigate.
   *
   * ⭐ THE CALLER NO LONGER CHOOSES A DESTINATION AT ALL. It names a file; the adapter decides where
   * that file lands, by joining this basename under its injected {@link ImageStorageBase}. Removing
   * the destination from the request is what makes arbitrary placement unrepresentable rather than
   * merely discouraged — there is no longer a member through which a directory can be expressed.
   *
   * ⛔ UNFORGEABLE BY CONSTRUCTION. {@link ImageFileName} is branded with a module-private
   * `unique symbol`, so no `string` — however carefully assembled — is assignable here, and
   * {@link validateImageFileName} is the only producer. A caller that holds an unvalidated value
   * cannot reach this member without first passing that gate and handling its rejection.
   */
  readonly imageFileName: ImageFileName;

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
   * composition still never fails; what changes is that the RESULT is now marked as a URL and is
   * consequently refused by every file-system member of this interface.
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
   * ⛔ THE URL-TO-FILE-SYSTEM CONVERSION IS GONE FROM THIS CONTRACT ENTIRELY — DECISION I-1. The
   * parameter was the composed path, which is precisely the value `model/entity/Sku.cfc:222` fed to
   * `expandPath`, so a stored `../../../../tmp/payload.jpg` reached a file-system probe outside the
   * intended directory. It is now the stored NAME, typed {@link ImageFileNameCandidate} so that an
   * {@link ImageWebPath} is rejected at compile time. The member therefore receives nothing it could
   * traverse with, and an implementation has no path to un-compose.
   *
   * ⭐ THREE OBLIGATIONS ON AN IMPLEMENTATION, in this order, none of them optional:
   *   1. run {@link validateImageFileName} on the argument, with the extension policy the deployment
   *      serves, and resolve `false` when it rejects — see the return contract below;
   *   2. join the accepted basename under the injected {@link ImageStorageBase}, then CANONICALISE the
   *      joined result and re-verify that it is still inside that base. Canonicalising the join is what
   *      defeats symlink and encoding tricks a name check alone cannot see;
   *   3. probe only that canonical destination.
   *
   * @param imageFile the SKU's stored image file name — the persistent property at
   *   `model/entity/Sku.cfc:L58`. A raw `string` and a validated {@link ImageFileName} both satisfy the
   *   parameter; a composed {@link ImageWebPath} does not.
   * @returns `true` when the image exists, mirroring `model/entity/Sku.cfc:223`; `false` otherwise,
   *   mirroring `model/entity/Sku.cfc:225`. The legacy member never raises and never yields a third
   *   state, so an implementation that cannot determine existence must resolve one of these two and
   *   say in its own documentation which it chose and why. A NAME THAT FAILS VALIDATION RESOLVES
   *   `false`, and that is parity rather than a new state: a value that cannot be a file name cannot
   *   name a stored file, and `false` is already what `model/entity/Sku.cfc:225` answers for a file
   *   that is not there.
   */
  getImageExistsFlag(imageFile: ImageFileNameCandidate): Promise<boolean>;

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
   * ⭐ FOUR OBLIGATIONS ON AN IMPLEMENTATION — DECISION I-1. The type system delivers the request to
   * the adapter already holding a validated basename and holding NO destination; discharging the rest
   * is the adapter's, because it is the only layer that holds the bytes and the trusted base:
   *   1. RESOLVE, never accept, the destination: join {@link SaveImageFileRequest.imageFileName} under
   *      the injected {@link ImageStorageBase} and treat that join as the only candidate;
   *   2. CANONICALISE the joined path and RE-VERIFY containment within the base afterwards. The
   *      basename check upstream cannot see symlinks, mount tricks or platform-specific normalisation,
   *      and only canonicalising the join can;
   *   3. VERIFY CONTENT, not just the name. {@link SaveImageFileRequest.allowedExtensions} constrains a
   *      NAME; an extension is not evidence of type. Confirm the bytes are an image of a permitted type
   *      before they are written, so a renamed executable is refused. This is the CWE-434 half of the
   *      finding and it cannot be discharged by any type;
   *   4. resolve `false` rather than raising when any of the above refuses, per the return contract
   *      below.
   *
   * ⚠️ NO OVERWRITE, RETENTION, PERMISSION OR NAMING POLICY IS STATED HERE, deliberately. The legacy
   * declares none — `model/service/SkuService.cfc:212` names a path and passes bytes — and AAP §0.7.3
   * standard 9 forbids inventing one. An adapter that needs such a policy receives it the way
   * {@link ImageStorageBase} is received: injected, as a product decision.
   *
   * ⭐ FOUR OBLIGATIONS ON AN IMPLEMENTATION — DECISION I-1. The type system delivers the request to
   * the adapter already holding a validated basename and holding NO destination; discharging the rest
   * is the adapter's, because it is the only layer that holds the bytes and the trusted base:
   *   1. RESOLVE, never accept, the destination: join {@link SaveImageFileRequest.imageFileName} under
   *      the injected {@link ImageStorageBase} and treat that join as the only candidate;
   *   2. CANONICALISE the joined path and RE-VERIFY containment within the base afterwards. The
   *      basename check upstream cannot see symlinks, mount tricks or platform-specific normalisation,
   *      and only canonicalising the join can;
   *   3. VERIFY CONTENT, not just the name. {@link SaveImageFileRequest.allowedExtensions} constrains a
   *      NAME; an extension is not evidence of type. Confirm the bytes are an image of a permitted type
   *      before they are written, so a renamed executable is refused. This is the CWE-434 half of the
   *      finding and it cannot be discharged by any type;
   *   4. resolve `false` rather than raising when any of the above refuses, per the return contract
   *      below.
   *
   * ⚠️ NO OVERWRITE, RETENTION, PERMISSION OR NAMING POLICY IS STATED HERE, deliberately. The legacy
   * declares none — `model/service/SkuService.cfc:212` names a path and passes bytes — and AAP §0.7.3
   * standard 9 forbids inventing one. An adapter that needs such a policy receives it the way
   * {@link ImageStorageBase} is received: injected, as a product decision.
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
