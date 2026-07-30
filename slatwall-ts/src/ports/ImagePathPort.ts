/**
 * ImagePathPort — the typed boundary between the extracted Catalog slice and the unconverted
 * Slatwall image service.
 *
 * Authority: AAP 0.4.1.6 "Ports", row 7 — transformation CREATE, legacy origin
 * `model/entity/Sku.cfc:L145, L192, L221`, key changes "Image path, resized path and existence
 * flag". AAP 0.2.2.7 "Boundary Ports", row 2 restates the same origin and names the consumer:
 * "Image path, resized path and existence flag, consumed by the feed".
 *
 * WHY THIS FILE EXISTS — THE HIDDEN DEPENDENCY
 * --------------------------------------------
 * This port is the fix for the single most dangerous dependency in the whole extraction. The
 * legacy code reaches the image service through a runtime string lookup, `getService("imageService")`,
 * and — unlike every other collaborator of the in-scope services — it is NEVER declared as a
 * component property anywhere. AAP 0.6.3.2 classifies it "Hidden genuine" and states the
 * consequence outright: because it is resolved by string rather than declared as metadata, "any
 * dependency analysis based on component metadata misses it entirely — and a port built from that
 * analysis would compile and then fail at the first image operation." Rule R2 (AAP 0.4.3.2) names
 * the same call site as "the most consequential instance" and assigns it to this interface.
 *
 * Declaring the dependency here converts an invisible runtime lookup into a compile-checked
 * constructor parameter, which is what AAP 0.7.3 S3 requires: "Constructor injection only. No
 * service locator, no dynamic method synthesis, no string-keyed runtime resolution."
 *
 * THE THREE CALL SITES — the entire boundary, verified by repository-wide scan
 * ---------------------------------------------------------------------------
 *   1. `model/entity/Sku.cfc:189`   — `getResizedImage(argumentCollection=arguments)`
 *   2. `model/entity/Sku.cfc:218`   — `getResizedImagePath(argumentCollection=arguments)`
 *   3. `model/service/SkuService.cfc:212` — `saveImageFile(uploadResult=…, filePath=…,
 *      allowedExtensions="jpg,jpeg,png,gif")`
 *
 * There are ZERO such call sites in `model/entity/Product.cfc` or
 * `model/service/ProductService.cfc`. Four further hits exist in the repository —
 * `model/transient/HibachiScope.cfc:191`, `model/transient/HibachiScope.cfc:195`,
 * `model/entity/Image.cfc:117` and `model/entity/Image.cfc:145` — and every one of them sits in a
 * file that is explicitly out of scope (`Image.cfc` is not among the six in-scope entities of AAP
 * 0.2.1.2). The interface is sized to the three in-scope sites and no further.
 *
 * TODO(boundary): the collaborator behind every member of this interface is the Slatwall image
 * service, reached in the legacy tree only as `getService("imageService")`
 * (`model/entity/Sku.cfc:189`, `model/entity/Sku.cfc:218`,
 * `model/service/SkuService.cfc:212`). It is NOT converted by this slice and no implementation of
 * this interface is shipped by it. Per TR-5 (AAP 0.1.2.2) the boundary is crossed "only through a
 * declared port … The member is never quietly dropped from the interface", so all four members are
 * declared here even though two of them cannot be honoured faithfully on the target runtime (see
 * the EXECUTION-MODEL MISMATCH section below).
 *
 * WHAT THIS PORT IS: PATHS AND FLAGS
 * ----------------------------------
 * Four members, and deliberately nothing more:
 *   - an image path  (`model/entity/Sku.cfc:L145`)
 *   - a resized image path (`model/entity/Sku.cfc:L192`)
 *   - an existence flag (`model/entity/Sku.cfc:L221`)
 *   - a save member, forced by the third call site (`model/service/SkuService.cfc:212`)
 *
 * It resizes nothing, reads nothing from a file system, opens no network connection, and moves no
 * image bytes. The moment it started returning image data it would have stopped being a boundary
 * and started being an implementation.
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
 * imports — no sibling module, no Node built-in, no package, no barrel re-export. Paths and flags
 * are plain strings and booleans, so nothing needs importing. Consequences, all deliberate:
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
 * `review_rules` reports "No user rules provided." for this project, so no file and no constraint
 * enters scope by rule. That is not permission to lower the bar: the nine binding standards of AAP
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
 *   `model/entity/Sku.cfc:146` returns
 *       "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"
 *   — a WEB URL.
 *
 *   `model/entity/Sku.cfc:L221` declares `getImageExistsFlag()`, whose body at
 *   `model/entity/Sku.cfc:222` is
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
 * A second locator reinforces the same point: `model/service/SkuService.cfc:211` reads
 * `arguments.Sku.getImagePath()` and `model/service/SkuService.cfc:212` passes that identical
 * web-URL-shaped value to the image service as `filePath`. The save member therefore inherits the
 * very same ambiguity as the existence flag — a value that is a URL by construction and a file path
 * by use.
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
 * NO MISMATCH NUMBER IS CLAIMED. The eight numbered mismatches of AAP 0.6.6 are already allocated:
 * M1, M3 and M4 to the product importer, M2 to the feed handler, M5 to the unit of work, M6 to the
 * validation read-back loop, M7 to the repository ports and M8 to `SettingResolverPort`. This one is
 * an additional, unnumbered mismatch, and inventing a ninth number would violate AAP 0.7.3 S9.
 */

/**
 * The fixed path segment that sits between the base image URL and the SKU image file name.
 *
 * Carried verbatim from the interpolated return at `model/entity/Sku.cfc:146`:
 * `"#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"`. The same literal
 * appears in the administrative view at `admin/views/entity/producttabs/defaultimages.cfm:56`,
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
 * Set at `model/entity/Sku.cfc:186` inside `getResizedImage`, and at `model/entity/Sku.cfc:214`
 * inside `getResizedImagePath`. Both write the identical literal, and no other value appears
 * anywhere in the slice.
 *
 * {@link ResizedImagePathRequest.resizeMethod} is nevertheless typed as an open `string` rather
 * than narrowed to this single literal. The legacy method forwards its whole argument scope with
 * `argumentCollection=arguments` (`model/entity/Sku.cfc:218`), so a caller may supply a method this
 * slice never names, and the out-of-scope image service is free to accept others. Narrowing the
 * type to the one observed value would invent a restriction the source does not state, which AAP
 * 0.7.3 S9 forbids. The constant records the observed value; the type stays open.
 */
export const IMAGE_RESIZE_METHOD_SCALE_BEST = 'scaleBest';

/**
 * The upload extension allow-list, carried verbatim from the only place it is stated.
 *
 * `model/service/SkuService.cfc:212` passes `allowedExtensions="jpg,jpeg,png,gif"` to the image
 * service — a comma-delimited list in one string, exactly as CFML list semantics expect. Four
 * extensions, in that order.
 *
 * AAP 0.4.1.8 boundary-stubs `SkuService.processImageUpload` because of "the hidden dynamic
 * `imageService` dependency", which makes this port the only place in the target where the detail
 * can survive at all. It is preserved as the single delimited string rather than split into an
 * array: the delimited form is what crosses the boundary at `model/service/SkuService.cfc:212`, and
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
 * `getResizedImage` (declared `model/entity/Sku.cfc:153`, size block `model/entity/Sku.cfc:169-187`,
 * boundary call `model/entity/Sku.cfc:189`) and `getResizedImagePath` (declared
 * `model/entity/Sku.cfc:L192`, size block `model/entity/Sku.cfc:203-216`, boundary call
 * `model/entity/Sku.cfc:218`). They do the same job and they disagree about it in five separate
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
 *   `model/entity/Sku.cfc:177-183` and stops there: there is NO trailing `else`, so an unrecognised
 *   token passes through COMPLETELY UNCHANGED into the interpolated settings key read at
 *   `model/entity/Sku.cfc:184-185`.
 *   `getResizedImagePath` ladders the same three tokens at `model/entity/Sku.cfc:205-211` but DOES
 *   have a trailing `else`, which rewrites every unrecognised token to `Small` at
 *   `model/entity/Sku.cfc:210` before the key is read at `model/entity/Sku.cfc:212-213`.
 *   Same input, two different outcomes. Giving `getResizedImage` the `else` it does not have would
 *   be a behavior change, and AAP 0.7.3 S7 requires the defect be preserved and annotated, never
 *   repaired. DO NOT HARMONISE THE TWO.
 *
 * TODO(parity) I2 — POSITIONAL VERSUS NAMED, and the divergence with the widest blast radius.
 *   `getResizedImage` accepts the positional form: its gate at `model/entity/Sku.cfc:169` tests
 *   `structKeyExists(arguments, 1)` as well as `structKeyExists(arguments, "size")`, and it reads
 *   the positional value at `model/entity/Sku.cfc:173-176`.
 *   `getResizedImagePath` tests ONLY the named form at `model/entity/Sku.cfc:203` and never looks at
 *   a positional argument.
 *   The observable consequence is severe rather than cosmetic. Invoked positionally, the two
 *   methods do entirely different things: `getResizedImage` treats the value as a size, whereas
 *   `getResizedImagePath` leaves the unnamed argument untouched in its argument scope and forwards
 *   it verbatim through `argumentCollection=arguments` at `model/entity/Sku.cfc:218`, having
 *   performed no size handling at all.
 *   The target cannot reproduce the positional calling convention itself — a CFML argument scope is
 *   simultaneously an ordered array and a struct, and TypeScript has no such construct. That is a
 *   permitted idiom change under AAP 0.8.1; the resulting BEHAVIOURAL asymmetry is not, and it is
 *   `src/domain/sku/Sku.ts` that must keep the two members diverging.
 *
 * TODO(parity) I3 — DELETE ORDER RELATIVE TO THE SETTINGS READ.
 *   `getResizedImage` removes the size argument BEFORE reading width and height:
 *   `structDelete` at `model/entity/Sku.cfc:172` (named form) and `model/entity/Sku.cfc:175`
 *   (positional form), against the reads at `model/entity/Sku.cfc:184-185`.
 *   `getResizedImagePath` removes it AFTER: reads at `model/entity/Sku.cfc:212-213`, then
 *   `structDelete(arguments, "size")` at `model/entity/Sku.cfc:215`.
 *   On the successful path both members end up forwarding an argument scope with no size in it, so
 *   the net effect coincides. It stops coinciding the moment the settings read does not return
 *   normally: `getResizedImagePath` would then forward a size argument that has already been
 *   rewritten in place by I4, while `getResizedImage` would have removed it. Recorded rather than
 *   normalised.
 *
 * TODO(parity) I4 — LOCAL VARIABLE VERSUS IN-PLACE MUTATION.
 *   `getResizedImage` works through a local, `thisSize`, assigned at `model/entity/Sku.cfc:171` and
 *   `model/entity/Sku.cfc:174`, leaving the argument scope alone.
 *   `getResizedImagePath` mutates the caller-visible argument in place, lower-casing it at
 *   `model/entity/Sku.cfc:204` and overwriting it at `model/entity/Sku.cfc:206`,
 *   `model/entity/Sku.cfc:208` and `model/entity/Sku.cfc:210`.
 *   This is what makes I3 observable, and it is why {@link ResizedImagePathRequest} is declared with
 *   `readonly` members: an implementation of this port receives a request it must not rewrite, and
 *   any lower-casing or token rewriting stays where the legacy code put it, in the domain member.
 *
 * TODO(parity) — A FIFTH ASYMMETRY, DELIBERATELY UNNUMBERED. `getResizedImage` derives an `alt`
 *   value from a setting at `model/entity/Sku.cfc:159-161`, guarded on the setting having non-zero
 *   length. `getResizedImagePath` has no `alt` handling of any kind: its body runs from the path
 *   assignment at `model/entity/Sku.cfc:195` straight to the missing-image default at
 *   `model/entity/Sku.cfc:197-200`. {@link ResizedImagePathRequest} therefore has NO `alt` member,
 *   and its absence is behavior rather than an omission — a resized PATH carries no alternate text.
 *   No number is assigned to this observation: AAP 0.7.3 S9 forbids inventing new register entries,
 *   and the four labelled divergences above are the ones the plan enumerates.
 *
 * THE FOUR-PART GATE, CLAUSE BY CLAUSE
 * ------------------------------------
 * Everything above hangs off one condition. `model/entity/Sku.cfc:203` reads, in full:
 *
 *   structKeyExists(arguments, "size") && !isNull(getProduct())
 *     && !structKeyExists(arguments, "width") && !structKeyExists(arguments, "height")
 *
 * All four clauses matter, and each one independently suppresses the entire settings lookup:
 *   1. `structKeyExists(arguments, "size")` — with no size token there is nothing to map, so the
 *      block is skipped. This is the path the Google feed takes: the feed calls the method with NO
 *      ARGUMENTS AT ALL at `integrationServices/google/views/feed/product.cfm:23`, so for the
 *      feed's `g:image_link` the size block never executes and the request that reaches this port
 *      carries neither size nor width nor height.
 *   2. `!isNull(getProduct())` — the settings are read through the product
 *      (`model/entity/Sku.cfc:212-213`), so a SKU with no product skips the block entirely rather
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
 *     gated branch at `model/entity/Sku.cfc:215`, so whenever the gate is false — an explicit width
 *     alongside a size, say — the size token survives and is forwarded to the image service by
 *     `argumentCollection=arguments` at `model/entity/Sku.cfc:218`. That is why
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
 * ============================================================================================
 * CARRIED WARNINGS THAT BELONG TO NEIGHBOURING LAYERS
 * ============================================================================================
 *
 * TODO(parity) — THE CASE-SENSITIVITY TRAP. `generateImageFileName` at
 * `model/entity/Sku.cfc:131-139` sanitises both the option code
 * (`model/entity/Sku.cfc:135`) and the product code (`model/entity/Sku.cfc:138`) with the
 * case-INSENSITIVE variant of the CFML regular-expression replace, `reReplaceNoCase`, against the
 * pattern
 *
 *     [^a-z0-9\-\_]
 *
 * Because the call is case-insensitive, that negated class spares `A`-`Z` as well as `a`-`z`. A
 * JavaScript regular expression compiled from the same pattern WITHOUT the ignore-case flag strips
 * every uppercase letter from every generated image file name — silently, with no error anywhere,
 * producing a product feed whose image links simply do not resolve. This annotation is addressed to
 * whichever layer implements file-name generation; the pattern above is reproduced inside a comment
 * only, and this module compiles no regular expression of any kind (AAP 0.7.3 S4).
 *
 * TODO(parity) — THE `getImageDirectory` ASYMMETRY, recorded so the question closes.
 * `model/entity/Product.cfc:L320-L321` declares `getImageDirectory()` and delegates it to
 * `getDefaultSku().getImageDirectory()`. `model/entity/Sku.cfc` declares NO `getImageDirectory`
 * member at all — a repository-wide scan of that file returns nothing — so the product-side
 * delegation targets a SKU member that does not exist. This interface therefore declares no
 * directory member: inventing one would fabricate a contract the source does not have (AAP 0.7.3
 * S9), and repairing the legacy delegation is out of scope for a port declaration and forbidden by
 * AAP 0.7.3 S7 in any case. Recorded, not resolved, and not assigned a defect number.
 *
 * TODO(boundary) — SETTINGS READ ALONGSIDE THESE MEMBERS BELONG TO `SettingResolverPort`.
 * The legacy image block reads six distinct settings, and NONE of them is redeclared here; they are
 * cross-referenced by name and locator only, so exactly one port owns each key:
 *   - `productImageOptionCodeDelimiter`  `model/entity/Sku.cfc:135`
 *   - `productImageDefaultExtension`     `model/entity/Sku.cfc:138`
 *   - `imageAltString`                   `model/entity/Sku.cfc:159`, `model/entity/Sku.cfc:160`
 *   - `imageMissingImagePath`            `model/entity/Sku.cfc:165`, `model/entity/Sku.cfc:199`
 *   - `productImage<size>Width`          `model/entity/Sku.cfc:184`, `model/entity/Sku.cfc:212`
 *   - `productImage<size>Height`         `model/entity/Sku.cfc:185`, `model/entity/Sku.cfc:213`
 * `globalAssetsImageFolderPath` belongs there too: it is the setting the base image URL is derived
 * from at `model/transient/HibachiScope.cfc:L186`.
 *
 * The last two are the interpolated pair, and I1 is exactly why `SettingResolverPort` keeps them
 * open rather than enumerating the three known size tokens: an unrecognised token reaches the key
 * unchanged through `model/entity/Sku.cfc:184-185`, so the set of keys that can legitimately be
 * requested is not closed. The same reasoning fixes the type of
 * {@link ResizedImagePathRequest.size} below.
 *
 * TODO(boundary) — THE REPEATED ADDITIONAL IMAGE LINKS DO NOT COME THROUGH THIS PORT.
 * `integrationServices/google/views/feed/product.cfm:23` builds `g:image_link` from the SKU's own
 * resized image path, which is {@link ImagePathPort.getResizedImagePath}. The repeated
 * `g:additional_image_link` on the next line, `integrationServices/google/views/feed/product.cfm:24`,
 * loops the product's images and calls the equivalent member on each IMAGE entity, resolved at
 * `model/entity/Image.cfc:145`. `model/entity/Image.cfc` is not one of the six in-scope entities of
 * AAP 0.2.1.2, so that member is out of scope and is deliberately absent from this interface.
 * `src/integrations/google/ProductFeedBuilder.ts` consequently needs a source for the additional
 * links that this port does not supply.
 *
 * Two further legacy image members are deliberately NOT declared here, and are listed so their
 * absence reads as a decision rather than an oversight (TR-5):
 *   - `getResizedImage` / `getImage`, `model/entity/Sku.cfc:149-190`, boundary call
 *     `model/entity/Sku.cfc:189`. These return a rendered image rather than a path, and AAP 0.4.1.6
 *     scopes this port to "Image path, resized path and existence flag". A layer that needs the
 *     rendering variant must extend the boundary deliberately rather than assume it is here.
 *   - `getImageExtension`, `model/entity/Sku.cfc:141-143`. It is a pure string operation over the
 *     SKU's own file-name property and reaches no collaborator at all, so it belongs to
 *     `src/domain/sku/Sku.ts`, not to a boundary.
 */

/**
 * The argument set that crosses into the image service when a resized image PATH is requested.
 *
 * Legacy origin: the argument scope forwarded by `argumentCollection=arguments` at
 * `model/entity/Sku.cfc:218`, as assembled by `getResizedImagePath`
 * (`model/entity/Sku.cfc:L192-219`). The legacy method declares no parameters at all and relies on
 * the CFML argument scope, which AAP 0.7.3 S1 forbids reproducing as an untyped bag; the members
 * below are the argument names that method actually writes, with the presence semantics of the
 * four-part gate at `model/entity/Sku.cfc:203` preserved exactly.
 *
 * Every member is `readonly`. I4 above shows the legacy method rewriting its own argument scope in
 * place; an implementation of this port is downstream of that rewriting and has no business
 * repeating it.
 */
export interface ResizedImagePathRequest {
  /**
   * The unresized image path, always present.
   *
   * `model/entity/Sku.cfc:195` assigns it unconditionally, before any gate, from the SKU's own
   * `getImagePath()` (`model/entity/Sku.cfc:L145`). It is therefore required here rather than
   * optional — a TR-1 tightening of a CFML argument that carries no declaration at all, recorded
   * rather than made silently.
   *
   * Its value is the web-URL-shaped string described in the EXECUTION-MODEL MISMATCH section:
   * `model/entity/Sku.cfc:146` composes it from the base image URL, the
   * {@link SKU_IMAGE_PATH_SEGMENT} literal and the SKU's image file name.
   */
  readonly imagePath: string;

  /**
   * The fallback path used when the image itself is absent, always present.
   *
   * `model/entity/Sku.cfc:197-200` defaults it from a setting whenever the caller has not supplied
   * it, so by the time the boundary at `model/entity/Sku.cfc:218` is reached the argument is
   * guaranteed to exist. Required here for that reason (TR-1). The value may legitimately be an
   * empty string, because the default comes straight from `imageMissingImagePath` at
   * `model/entity/Sku.cfc:199` and that setting can be unset; the key itself is
   * `SettingResolverPort`'s to own, not this port's.
   */
  readonly missingImagePath: string;

  /**
   * The raw size token, when one survives the gate.
   *
   * Typed as an OPEN `string` and deliberately NOT as a union of the three tokens the ladder
   * recognises. I1 is the reason: `model/entity/Sku.cfc:177-183` has no trailing `else`, so an
   * arbitrary token legitimately flows into the interpolated settings key at
   * `model/entity/Sku.cfc:184-185`. A closed union would make an input the legacy system accepts
   * unrepresentable, which is a behavior change disguised as a type improvement, and it would
   * contradict the matching decision `SettingResolverPort` takes for the interpolated
   * width and height keys.
   *
   * It is optional because it is absent on the two commonest paths: the gate at
   * `model/entity/Sku.cfc:203` requires it, and the Google feed omits it entirely at
   * `integrationServices/google/views/feed/product.cfm:23`. When the gate SUCCEEDS the token is
   * removed at `model/entity/Sku.cfc:215` and never reaches an implementation; when the gate FAILS
   * — for instance because an explicit width was supplied — it survives and is forwarded. Omit the
   * member to mean absent; `exactOptionalPropertyTypes` makes that the only way to say it.
   */
  readonly size?: string;

  /**
   * Target width in pixels, present either because the caller supplied it or because the gate
   * derived it.
   *
   * Derived form: `model/entity/Sku.cfc:212` reads the interpolated `productImage<size>Width`
   * setting through the product. Caller-supplied form: clause 3 of the gate at
   * `model/entity/Sku.cfc:203` tests for exactly this argument, and its presence suppresses the
   * derivation.
   *
   * TR-1 tightening, recorded: the legacy value is whatever the untyped setting accessor returns
   * (`model/entity/Sku.cfc:212`), and a pixel dimension is numeric by nature, so it is typed
   * `number` here. Converting a setting value into that shape is the caller's responsibility, and
   * the conversion sits in the domain member where the legacy read happens. No default dimension is
   * declared anywhere in this file — the source states none, and AAP 0.7.3 S9 forbids inventing
   * one.
   */
  readonly width?: number;

  /**
   * Target height in pixels, with exactly the semantics of {@link ResizedImagePathRequest.width}.
   *
   * Derived at `model/entity/Sku.cfc:213` from the interpolated `productImage<size>Height` setting;
   * tested for presence by clause 4 of the gate at `model/entity/Sku.cfc:203`. Either dimension
   * alone is enough to suppress the derivation, so the two members are independent.
   */
  readonly height?: number;

  /**
   * How the image service should scale, when the gate supplied a value or the caller did.
   *
   * `model/entity/Sku.cfc:214` sets it to the literal recorded as
   * {@link IMAGE_RESIZE_METHOD_SCALE_BEST}, and that is the only value the slice ever names. Typed
   * as an open `string` all the same, for the reason given on that constant: the argument scope is
   * forwarded wholesale at `model/entity/Sku.cfc:218`, so the legacy contract does not close the
   * set.
   *
   * Optional, because it is written only inside the gated branch at
   * `model/entity/Sku.cfc:203-216`. On the Google feed path
   * (`integrationServices/google/views/feed/product.cfm:23`) no resize method is sent at all.
   */
  readonly resizeMethod?: string;
}

/**
 * The argument set that crosses into the image service when an uploaded SKU image is stored.
 *
 * Legacy origin: `model/service/SkuService.cfc:212`, the third and final image-service call site in
 * the slice. Member names are the boundary's names, not the caller's: the enclosing method declares
 * its parameter as `imageUploadResult` at `model/service/SkuService.cfc:210` and then forwards it
 * under the name `uploadResult` at `model/service/SkuService.cfc:212`. The boundary name is the one
 * that belongs in a port.
 */
export interface SaveImageFileRequest {
  /**
   * The opaque result of the upload that produced the image, passed straight through.
   *
   * `model/service/SkuService.cfc:210` declares it as a required CFML struct and
   * `model/service/SkuService.cfc:212` forwards it without reading a single key, so the legacy code
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
   * Where the image is to be stored.
   *
   * `model/service/SkuService.cfc:211` obtains this value from the SKU's own `getImagePath()` and
   * `model/service/SkuService.cfc:212` passes it under this name. It is consequently the same
   * web-URL-shaped value that the existence flag cannot resolve, which is the second locator cited
   * in the EXECUTION-MODEL MISMATCH section above. The argument name from the legacy boundary is
   * preserved rather than renamed to something tidier, because the mismatch between the name and
   * the value is itself part of the finding.
   */
  readonly filePath: string;

  /**
   * The comma-delimited list of acceptable file extensions.
   *
   * Required rather than optional: the one call site in the slice supplies it explicitly and
   * unconditionally at `model/service/SkuService.cfc:212`, so under TR-1 the contract is tightened
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
   * Legacy origin `model/entity/Sku.cfc:L145`, whose body at `model/entity/Sku.cfc:146` composes
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
   * @param imageFile the SKU's stored image file name — the persistent property declared at
   *   `model/entity/Sku.cfc:58`, which `model/entity/Sku.cfc:146` interpolates as the final segment
   *   of the path.
   * @returns the composed image path, in the same web-URL-shaped form the legacy method returns.
   */
  getImagePath(imageFile: string): Promise<string>;

  /**
   * Resolves the path of a resized rendition of an image.
   *
   * Legacy origin `model/entity/Sku.cfc:L192`, boundary call `model/entity/Sku.cfc:218`. This is
   * the member the Google product feed consumes: `g:image_link` at
   * `integrationServices/google/views/feed/product.cfm:23` is built from it, with no arguments
   * supplied beyond the two the SKU always sets.
   *
   * The request arrives already past the four-part gate at `model/entity/Sku.cfc:203`. An
   * implementation must NOT re-apply that gate, must not rewrite the request, and must not
   * substitute a size token for a missing dimension — every one of those decisions has already been
   * made, or deliberately not made, upstream. See the parity register above for the five ways the
   * two legacy siblings differ and for why {@link ResizedImagePathRequest.size} is an open string.
   *
   * @param request the post-gate argument set forwarded at `model/entity/Sku.cfc:218`.
   * @returns the resized rendition's path, or the request's `missingImagePath` where the legacy
   *   image service would have fallen back to it (`model/entity/Sku.cfc:199`).
   */
  getResizedImagePath(request: ResizedImagePathRequest): Promise<string>;

  /**
   * Reports whether the image behind a path actually exists.
   *
   * Legacy origin `model/entity/Sku.cfc:L221`, whose body at `model/entity/Sku.cfc:222` tests
   * `fileExists(expandPath(getImagePath()))` and returns a plain boolean at
   * `model/entity/Sku.cfc:223` and `model/entity/Sku.cfc:225`.
   *
   * READ THE EXECUTION-MODEL MISMATCH SECTION OF THIS MODULE BEFORE IMPLEMENTING THIS MEMBER. The
   * legacy implementation hands a web URL to a container facility that resolves virtual application
   * paths onto a real file system, and neither the facility nor a product-image directory exists on
   * the target runtime. The member is declared regardless, because TR-5 forbids quietly dropping a
   * boundary member, and how to answer the question is left to the adapter as an explicit,
   * documented decision rather than being prejudged by this contract.
   *
   * @param imagePath the value produced by {@link ImagePathPort.getImagePath}, exactly as
   *   `model/entity/Sku.cfc:222` passes it.
   * @returns `true` when the image exists, mirroring `model/entity/Sku.cfc:223`; `false` otherwise,
   *   mirroring `model/entity/Sku.cfc:225`. The legacy member never raises and never yields a third
   *   state, so an implementation that cannot determine existence must resolve one of these two and
   *   say in its own documentation which it chose and why.
   */
  getImageExistsFlag(imagePath: string): Promise<boolean>;

  /**
   * Stores an uploaded image against a SKU image path.
   *
   * Legacy origin `model/service/SkuService.cfc:212`, reached from `processImageUpload`
   * (`model/service/SkuService.cfc:210-218`). AAP 0.4.1.8 boundary-stubs that service member
   * precisely because of "the hidden dynamic `imageService` dependency", so this declaration is
   * what the stub is implemented against.
   *
   * The member stores; it does not transform. No scaling, cropping, format conversion, dimension
   * inspection or content-type detection is part of this contract — the port trades in paths and
   * flags, and AAP 0.7.3 S9 forbids inventing capability the source does not state.
   *
   * @param request the boundary argument set assembled at `model/service/SkuService.cfc:212`.
   * @returns `true` when the image was stored. The legacy method narrows the image service's result
   *   to a boolean at `model/service/SkuService.cfc:213-217`, returning `true` at
   *   `model/service/SkuService.cfc:214` and `false` at `model/service/SkuService.cfc:216`, so the
   *   boolean is the observable contract even though the enclosing CFML member is declared with the
   *   loosest possible return type. Recorded as a TR-1 tightening.
   */
  saveImageFile(request: SaveImageFileRequest): Promise<boolean>;
}
