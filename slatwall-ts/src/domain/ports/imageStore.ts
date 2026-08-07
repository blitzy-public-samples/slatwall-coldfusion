/**
 * A read-only projection of the CFML engine's file-upload result struct.
 *
 * The legacy parameter is a bare `struct` - `required struct imageUploadResult`
 * [model/service/SkuService.cfc:L210] - produced by the CF engine's own upload machinery.
 *
 * It carries no identity, no persistence, no behaviour and no lifecycle.
 */
export interface ImageUploadResultProjection {
  /**
   * The directory that already holds the uploaded bytes - the CFML upload-result key
   * `serverDirectory`. Together with `serverFile` this is the SOURCE location, without which an
   * implementation has nothing to copy.
   */
  readonly serverDirectory: string;

  /**
   * The file name of the uploaded bytes within `serverDirectory` - the CFML upload-result key
   * `serverFile`.
   */
  readonly serverFile: string;

  /**
   * The extension the client supplied - the CFML upload-result key `clientFileExt`, carried
   * without a leading dot exactly as the engine reports it.
   *
   * This is the value an allow-list is applied to, which is the whole reason `saveImageFile`'s
   * third parameter has anything to test against.
   */
  readonly clientFileExt: string;

  /**
   * The media type the client declared, if it declared one - the CFML upload-result key
   * `contentType`.
   *
   * This is the only member an implementation can proceed without, which is why it is the only
   * optional one.
   */
  readonly contentType?: string;
}

/**
 * Everything needed to compose one SKU's default-image file name.
 *
 * Carries RAW, UNSANITISED values exactly as the entities hold them.
 *
 * Both fields admit `undefined` because the string columns behind them are nullable:
 * `productCode` [model/entity/Product.cfc:L56] and `optionCode` [model/entity/Option.cfc:L53].
 */
export interface SkuImageFileNameDescriptor {
  /**
   * The owning product's code, raw.
   */
  readonly productCode: string | undefined;

  /**
   * The option codes that participate in the name, raw, in the order the sku holds its options.
   *
   * The caller has already applied the one filter [model/entity/Sku.cfc:L134] applies -
   * `if(option.getOptionGroup().getImageGroupFlag())`.
   */
  readonly imageGroupOptionCodes: readonly (string | undefined)[];
}

/**
 * The image persistence port - the narrow STUB port standing in for the legacy CFML `imageService`
 * collaborator, with documented stub behaviour rather than a partial implementation.
 *
 * `saveImageFile` backs `SkuService.processImageUpload(sku, result)`
 * [model/service/SkuService.cfc:L212] and `deleteImageFile` backs
 * `ProductService.processProduct_deleteDefaultImage(product, data)`
 * [model/service/ProductService.cfc:L198].
 */
export interface ImageStore {
  /**
   * Persist already-uploaded bytes at a caller-supplied path.
   *
   * @param uploadResult Where the bytes already are, as the read-only projection above.
   * @param filePath The destination path, resolved by the caller as described above.
   * @param allowedExtensions The permitted extensions, as a CFML COMMA-DELIMITED LIST STRING.
   * @returns Whether the bytes were persisted, per the strict-boolean note above.
   */
  saveImageFile(
    uploadResult: ImageUploadResultProjection,
    filePath: string,
    allowedExtensions: string,
  ): Promise<boolean>;

  /**
   * Remove a stored image file at a caller-supplied path.
   *
   * Stated plainly, because every other name in this file is carried over verbatim and this one
   * cannot be.
   *
   * Three reasons, each grounded in the legacy body rather than in preference.
   *
   * @param filePath The path of the file to remove, resolved by the caller from the entity in the
   * same way as for `saveImageFile`.
   */
  deleteImageFile(filePath: string): Promise<void>;

  /**
   * Compose the default-image file name for one SKU.
   *
   * Synchronous, deliberately, and the only synchronous member on this port.
   *
   * @param descriptor The raw product code and the raw participating option codes, in traversal
   * order.
   * @returns The composed file name, extension included.
   */
  generateSkuImageFileName(descriptor: SkuImageFileNameDescriptor): string;
}

// The root-containment obligation on every implementation of this port.
//
// Why it is prose and not a type, stated plainly rather than left as an apparent oversight.
//
// The stub wired in at `src/handlers/bootstrap.ts` touches no filesystem, so it cannot traverse
// one and there is nothing for it to contain.
