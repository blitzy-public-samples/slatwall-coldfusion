/**
 * ImagePathPort — the typed boundary between the extracted Catalog slice and the unconverted
 * Slatwall image service.
 * Authority: AAP §0.4.1.6 "Ports" row 7 and AAP §0.2.2.7 row 2 — origin
 * model/entity/Sku.cfc:L145, model/entity/Sku.cfc:L192 and model/entity/Sku.cfc:L221, scope "image
 * path, resized path and existence flag, consumed by the feed".
 * Why this file EXISTS — the hidden dependency. The legacy code reaches the image service through a
 * runtime string lookup, `getService("imageService")`, and — unlike every other collaborator of the
 * in-scope services — never declares it as a component property. AAP §0.6.3.2 classifies it "hidden
 * genuine" and states the consequence: a dependency analysis based on component metadata misses it
 * entirely, so a port built from that analysis would compile and then fail at the first image
 * operation. Declaring it here converts an invisible lookup into a compile-checked constructor
 * parameter (AAP §0.7.3, rule R2).
 *
 * TODO(boundary): the collaborator behind every member is the Slatwall image service, which this
 * slice does not convert, so no implementation of this interface is shipped by it. Per TR-5 the
 * member is never quietly dropped from the interface, so all four members are declared even though
 * two of them cannot be honoured faithfully on the target runtime — see the execution-model
 * mismatch block below.
 */

/* Execution-model mismatch — the existence flag cannot be implemented faithfully (AAP §0.8.3.6) */

/** The fixed path segment that sits between the base image URL and the SKU image file name. */
export const SKU_IMAGE_PATH_SEGMENT = '/product/default/';

/** The one resize method the legacy catalog slice ever requests. */
export const IMAGE_RESIZE_METHOD_SCALE_BEST = 'scaleBest';

/** The upload extension allow-list, carried verbatim from the only place it is stated. */
export const IMAGE_UPLOAD_ALLOWED_EXTENSIONS = 'jpg,jpeg,png,gif';

/*
 * TODO(parity) — `getResizedImage` and `getResizedImagePath` take the same input and diverge five
 * ways. Both are carried as observed (AAP §0.8.2 guideline 4); none is numbered, because AAP §0.7.3
 * forbids inventing register entries and the plan assigns no identifier to any of them.
 *
 * - Unrecognised size token. `getResizedImage` ladders `l`/`m`/`s` onto `large`/`medium`/`small` at
 *   `model/entity/Sku.cfc:L177-L183` with no trailing `else`, so an unrecognised token reaches the
 *   interpolated settings key unchanged at `model/entity/Sku.cfc:L184-L185`. `getResizedImagePath`
 *   ladders the same tokens at `model/entity/Sku.cfc:L205-L211` and does have the `else`, rewriting
 *   anything unrecognised to `small` at `model/entity/Sku.cfc:L210`.
 * - Argument form. `getResizedImage` accepts the positional call — its gate at
 *   `model/entity/Sku.cfc:L169` tests `structKeyExists(arguments, 1)` and it reads the positional
 *   value at `model/entity/Sku.cfc:L173-L176`. `getResizedImagePath` tests only the named form at
 *   `model/entity/Sku.cfc:L203`.
 * - Delete order against the settings read. `getResizedImage` deletes the size argument first
 *   (`model/entity/Sku.cfc:L172` named, `:L175` positional) then reads at `:L184-L185`;
 *   `getResizedImagePath` reads at `:L212-L213` then deletes at `:L215`.
 * - Mutation. `getResizedImage` works through the local `thisSize` (`model/entity/Sku.cfc:L171`,
 *   `:L174`); `getResizedImagePath` lower-cases and overwrites the caller-visible argument in place
 *   at `model/entity/Sku.cfc:L204`, `:L206`, `:L208` and `:L210`.
 * - Alternate text. `getResizedImage` derives `alt` from a setting at
 *   `model/entity/Sku.cfc:L159-L161` when that setting is non-empty; `getResizedImagePath` has no
 *   `alt` handling at all, running from the path assignment at `:L195` to the missing-image default
 *   at `:L197-L200`. {@link ResizedImagePathRequest} therefore has no `alt` member, and its absence
 *   is behavior rather than an omission.
 */

/*
 * Carried warnings that belong to neighbouring layers
 *
 * TODO(parity) — the case-sensitivity trap. `generateImageFileName` at
 * model/entity/Sku.cfc:L131-L139 sanitises both the option code (model/entity/Sku.cfc:L135) and the
 * product code (model/entity/Sku.cfc:L138) with the case-insensitive CFML replace,
 * `reReplaceNoCase`, against the pattern
 *
 * TODO(parity) — the `getImageDirectory` asymmetry. model/entity/Product.cfc:L320-L321 declares
 * `getImageDirectory` and delegates it to `getDefaultSku().getImageDirectory`, but
 * model/entity/Sku.cfc declares no such member, so the delegation targets a SKU member that does not
 * exist. This interface therefore declares no directory member: inventing one would fabricate a
 * contract the source does not have, and repairing the delegation is forbidden by AAP §0.7.3.
 *
 * TODO(boundary) — settings read alongside these members belong to `SettingResolverPort`, so exactly
 * one port owns each key. None is redeclared here; they are cross-referenced by name and locator:
 *
 * TODO(boundary) — the repeated additional image links do not come through this port.
 * integrationServices/google/views/feed/product.cfm:L23 builds `g:image_link` from the SKU's own
 * resized image path, which is {@link ImagePathPort.getResizedImagePath}. The repeated
 * `g:additional_image_link` at integrationServices/google/views/feed/product.cfm:L24 loops the
 * product's images and calls the equivalent member on each image entity, at
 * model/entity/Image.cfc:L145. That entity is not one of the six in scope (AAP §0.2.1.2), so the
 * member is deliberately absent here and the feed builder needs another source for those links.
 */

/*
 * The read-path exposure stays carried, as found; the write contract below carries the obligations
 * an implementation must satisfy.
 */

declare const IMAGE_WEB_PATH: unique symbol;

/** A web-URL-shaped image path — the value `model/entity/Sku.cfc:L146` composes. */
export type ImageWebPath = string & { readonly [IMAGE_WEB_PATH]: 'web' };

/**
 * Labels an already-composed image URL as an {@link ImageWebPath}.
 *
 * @param composedPath a path already assembled for display.
 * @returns the same string, tagged. Never mutated, never inspected.
 */
export function toImageWebPath(composedPath: string): ImageWebPath {
  return composedPath as ImageWebPath;
}

/**
 * The argument set that crosses into the image service when a resized image path is requested.
 *
 * Legacy origin: the argument scope forwarded by `argumentCollection=arguments` at
 * `model/entity/Sku.cfc:L218`, as assembled by `getResizedImagePath`
 * (`model/entity/Sku.cfc:L192-219`). The legacy method declares no parameters at all and relies on
 * the CFML argument scope, which AAP §0.7.3 forbids reproducing as an untyped bag; the members
 * below are the argument names that method actually writes, with the presence semantics of the
 * four-part gate at `model/entity/Sku.cfc:L203` preserved exactly.
 */
export interface ResizedImagePathRequest {
  /** The unresized image path, always present. */
  readonly imagePath: ImageWebPath;

  /** The fallback path used when the image itself is absent, always present. */
  readonly missingImagePath: string;

  /** The raw size token, when one survives the gate. */
  readonly size?: string;

  /**
   * Target width in pixels, present either because the caller supplied it or because the gate
   * derived it.
   */
  readonly width?: number;

  /**
   * Target height in pixels, with exactly the semantics of {@link ResizedImagePathRequest.width}.
   */
  readonly height?: number;

  /** How the image service should scale, when the gate supplied a value or the caller did. */
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
  /** The opaque result of the upload that produced the image, passed straight through. */
  readonly uploadResult: Readonly<Record<string, unknown>>;

  /** Where the file is stored — the legacy `filePath` argument, under its own name. */
  readonly filePath: ImageWebPath;

  /** The comma-delimited list of acceptable file extensions. */
  readonly allowedExtensions: string;
}

/** The image boundary of the extracted catalog slice. */
export interface ImagePathPort {
  /**
   * Resolves the unresized path of a SKU image from its stored file name.
   *
   * Legacy origin `model/entity/Sku.cfc:L145`, whose body at `model/entity/Sku.cfc:L146` composes
   * the base image URL, the {@link SKU_IMAGE_PATH_SEGMENT} literal and the SKU's image file name.
   *
   * @param imageFile the SKU's stored image file name — the persistent property declared at
   * `model/entity/Sku.cfc:58`, which `model/entity/Sku.cfc:146` interpolates as the final segment
   * of the path. Accepted unvalidated, exactly as the legacy accepts it.
   *
   * @returns the composed image path, in the same web-URL-shaped form the legacy method returns,
   * tagged {@link ImageWebPath} via {@link toImageWebPath}.
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
   * @param request the post-gate argument set forwarded at `model/entity/Sku.cfc:L218`.
   * @returns the resized rendition's path, or the request's `missingImagePath` where the legacy
   * image service would have fallen back to it (`model/entity/Sku.cfc:199`). Either way the value is
   * for display and is tagged {@link ImageWebPath}; where the fallback is returned the adapter tags
   * the configured value with {@link toImageWebPath}, which is a label and not an assertion about it.
   */
  getResizedImagePath(request: ResizedImagePathRequest): Promise<ImageWebPath>;

  /**
   * Reports whether the image behind a path actually exists.
   *
   * Legacy origin `model/entity/Sku.cfc:L221`, whose body at `model/entity/Sku.cfc:L222` tests
   * `fileExists(expandPath(getImagePath))` and returns a plain boolean at
   * `model/entity/Sku.cfc:L223` and `model/entity/Sku.cfc:L225`.
   *
   * @param imagePath the composed path, as `model/entity/Sku.cfc:L222` supplies it — the result of
   * {@link ImagePathPort.getImagePath}, which is what `expandPath` receives there. Accepted
   * unvalidated, exactly as the legacy accepts it.
   */
  getImageExistsFlag(imagePath: ImageWebPath): Promise<boolean>;

  /**
   * Stores an uploaded image against a SKU image path.
   *
   * Legacy origin `model/service/SkuService.cfc:L212`, reached from `processImageUpload`
   * (`model/service/SkuService.cfc:L210-L218`). AAP §0.4.1.8 boundary-stubs that service member
   * precisely because of "the hidden dynamic `imageService` dependency", so this declaration is
   * what the stub is implemented against.
   *
   * @param request the boundary argument set assembled at `model/service/SkuService.cfc:L212`.
   * @returns `true` when the image was stored. The legacy method narrows the image service's result
   * to a boolean at `model/service/SkuService.cfc:L213-L217`, returning `true` at
   * `model/service/SkuService.cfc:L214` and `false` at `model/service/SkuService.cfc:L216`, so the
   * boolean is the observable contract even though the enclosing CFML member is declared with the
   * loosest possible return type. Recorded as a TR-1 tightening.
   */
  saveImageFile(request: SaveImageFileRequest): Promise<boolean>;
}
