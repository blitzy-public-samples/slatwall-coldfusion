// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts  composition root (wiring)
// ---------------------------------------------------------------------------

/**
 * Image persistence port - the narrow STUB port that stands in for the legacy CFML
 * `imageService` collaborator.
 *
 * ONE-SENTENCE CONTRACT
 *   A narrow interface with documented stub behaviour - NOT a partial implementation - that
 *   exists so the in-scope merchandise path compiles and runs unchanged while the
 *   image-handling branches that call it remain out of scope.
 *
 * ONE OF EXACTLY TWO STUB PORTS
 *   `src/domain/ports/` holds thirteen port interfaces and exactly two of them carry stub
 *   semantics: this one and `subscriptionTermProvider`. The plan is explicit that subscription
 *   handling and the image service become "narrow interfaces with documented stub behaviour
 *   rather than partial implementations", and that wording is the contract: the TYPE below is
 *   the real thing, and only the IMPLEMENTATION is a stub.
 *
 *   Do not read stubness into the neighbours. `addressZoneEvaluator` sits beside these two in
 *   the plan's classification of narrowly-ported collaborators, but it is a LIVE port: it
 *   carries `AddressService.isAddressInZone` [model/service/AddressService.cfc:L57], which the
 *   promotion address-zone qualifiers genuinely evaluate. Only `imageStore` and
 *   `subscriptionTermProvider` are stubs.
 *
 * WHY THIS PORT EXISTS - THE SERVICE-LOCATOR FACT (transformation rule T2)
 *   `imageService` was NOT a dependency-injected collaborator. `model/service/SkuService.cfc`
 *   declares exactly five DI properties, and `imageService` is not among them:
 *
 *     property name="skuDAO";           [model/service/SkuService.cfc:L51]
 *     property name="optionService";    [model/service/SkuService.cfc:L53]
 *     property name="productService";   [model/service/SkuService.cfc:L54]
 *     property name="subscriptionService"; [model/service/SkuService.cfc:L55]
 *     property name="contentService";   [model/service/SkuService.cfc:L56]
 *
 *   It was reached at runtime through `getService("imageService")`
 *   [model/service/SkuService.cfc:L212] - a SERVICE-LOCATOR lookup resolved by the DI/1 bean
 *   factory, invisible to any compiler and unverifiable at build time. Rule T2 replaces every
 *   such locator call with a constructor-injected port, which is the single clearest
 *   justification for this file: the collaborator that was implicit becomes an explicit,
 *   compile-checked constructor argument.
 *
 *   This is a framework pattern being replaced BY DESIGN, not a legacy defect. No
 *   `LEGACY-DEFECT` annotation is assigned to this file, and none is invented here. The same
 *   applies to the capital-`S` `Sku` argument name at [model/service/SkuService.cfc:L210]
 *   (`required any Sku`, inconsistent with every other CFML argument in the slice): that is a
 *   naming inconsistency belonging to the SERVICE method's signature, noted here once so the
 *   service-tier author is not surprised by it. It is not this port's concern - the port takes
 *   a file path and an upload result, never a `Sku`.
 *
 * INTERFACES ONLY - THIS MODULE EMITS NO RUNTIME JAVASCRIPT
 *   Type declarations exclusively. No class, no `const`, no `enum`, no function body, no
 *   default parameter value, no runtime value of any kind. Compiling this module produces at
 *   most an empty-module marker, and that is a property the validation gate checks rather than
 *   assumes. A TypeScript `enum` would breach it, so a closed vocabulary - were one ever
 *   needed here, and none is - would be a string-literal union.
 *
 * NO IMPORTS AT ALL, BY DESIGN
 *   This file lives under `src/domain/**`, which may import only from within `src/domain/**`
 *   and from `src/lib/**`; reaching into `src/repositories/**`, `src/handlers/**` or
 *   `src/integrations/**` is a build failure enforced by the ESLint `no-restricted-imports`
 *   boundary, not a convention. This module needs nothing from either side: its parameters are
 *   primitives plus the projection declared below, so it has ZERO import statements.
 *
 *   Two prohibitions are worth stating because they would RESOLVE if attempted, which is
 *   precisely why they are called out. First, no Node built-in - not `node:fs`, `node:path`,
 *   `node:buffer` or `node:stream` - because a port declares a CAPABILITY and never an I/O
 *   mechanism. Second, no storage client and no cloud SDK: the dependency set is closed at the
 *   thirteen exactly-pinned packages `package.json` declares - 3 runtime and 10 development -
 *   none of which is an image library or a storage client,
 *   and reaching for one from the domain would invert the very dependency this port
 *   straightens. Nor does this file read `src/lib/config.ts`: a store's own configuration is
 *   the implementation's business, supplied where the implementation is constructed.
 *
 * THE ASYNC RULING
 *   Both members return a promise. The project's async boundary is structural: a method is
 *   asynchronous when its work crosses out of the process, and persisting or removing a file
 *   does exactly that under the target's AWS Lambda `nodejs20.x` execution model. This is a
 *   statement about WHERE the work happens, never a claim about how fast it happens - this
 *   file asserts no non-functional requirement of any kind.
 *
 *   It is also part of why this port is a stub rather than a port onto a real filesystem: the
 *   legacy engine performed a synchronous file write against the CF server's own disk
 *   [model/service/ProductService.cfc:L249-L250 shows the sibling upload path doing exactly
 *   that], and that construct has no counterpart in the target's execution model.
 *
 * WHAT IS NOT PORTED
 *   No image business logic, at all. No resizing, no format conversion, no thumbnailing, no
 *   metadata extraction, no CDN or storage-provider selection, and no upload validation beyond
 *   the `allowedExtensions` list the CALLER supplies. The legacy image service did offer more -
 *   `model/entity/Sku.cfc:L189` reaches `getResizedImage` and `model/entity/Sku.cfc:L218`
 *   reaches `getResizedImagePath` - but both feed the admin and front-end presentation
 *   subsystems, which are out of scope, so neither capability is declared here. Existence
 *   checking is likewise absent: the legacy entity called the engine's `fileExists` builtin
 *   directly [model/entity/Sku.cfc:L221-L227]. Nothing reachable from an in-scope path needs a
 *   read, serve, URL-resolution, list, move or copy member, so this interface has exactly two.
 *
 *   Image-related SETTINGS are not this port's concern either, and they are not
 *   `settingsProvider`'s concern. `productImageDefaultExtension` (default `jpg`)
 *   [model/service/SettingService.cfc:L191] and `productImageOptionCodeDelimiter` (default `-`)
 *   [model/service/SettingService.cfc:L192] are read at exactly two sites, both inside
 *   `Sku.generateImageFileName()` [model/entity/Sku.cfc:L138] and [model/entity/Sku.cfc:L135],
 *   which composes an image FILE NAME and does nothing else. Neither key is one of the four the
 *   transformation plan allots the settings port ("only four keys", AAP 0.2.1; "exactly four
 *   keys", AAP 0.4.1), so neither is declared on `SettingKey`. Image-file-name composition is an
 *   image concern and therefore belongs behind THIS port; it does not become a settings concern
 *   by being spelled with a `setting()` call in the legacy source. No key appears here, no key
 *   appears on the settings port, and no fifth settings key may be added to make either compile.
 *
 * SCHEMA CONTINUITY
 *   This port touches no table at all. It moves and removes files; it reads and writes no row,
 *   and it defines no migration, no rename, no new table and no column change. The image paths
 *   it is handed are derived from a column that already exists and stays exactly as it is -
 *   `property name="imageFile" ormtype="string" length="50"` on
 *   [model/entity/Sku.cfc:L58], persisted in `SwSku` [model/entity/Sku.cfc:L49] and read
 *   through `getImageFile()` inside `getImagePath()` [model/entity/Sku.cfc:L145-L147]. Nothing
 *   here alters how that value is stored, named or interpreted.
 *
 * WHAT "DOCUMENTED STUB BEHAVIOUR" MEANS
 *   Four service methods are ported as THIN PASS-THROUGHS onto this port:
 *
 *     SkuService.processImageUpload                      [model/service/SkuService.cfc:L210]
 *     ProductService.processProduct_deleteDefaultImage   [model/service/ProductService.cfc:L198]
 *     ProductService.processProduct_updateDefaultImageFileNames
 *                                                        [model/service/ProductService.cfc:L208]
 *     ProductService.processProduct_uploadDefaultImage    [model/service/ProductService.cfc:L235]
 *
 *   The last of those is explicitly OUT OF SCOPE and is ported as a pass-through only - it is
 *   never made to work. The third needs no port member at all: its legacy body
 *   [model/service/ProductService.cfc:L208-L214] loops the product's SKUs and assigns
 *   `sku.setImageFile( sku.generateImageFileName() )`, reaching the image service nowhere.
 *   Default-image file NAMING is derived on the entity, so it is not a store concern.
 *
 *   The chosen stub behaviour is deliberately NOT decided here. Whether an implementation
 *   reports failure, refuses outright, or does something else is an implementation decision;
 *   encoding it in this file would mean emitting runtime code, and the type would then lie
 *   about being a contract. Equally, no stubness leaks into the type: there is no
 *   not-implemented error class, no sentinel value and no `__stub` discriminant anywhere below.
 *
 * WHO IMPLEMENTS THIS PORT
 *   `src/repositories/mysql/**` implements six of the thirteen ports - the product, SKU,
 *   option, product-type, promotion and price-group repositories. This is not one of them, and
 *   the target layout defines no adapter file for it anywhere, so its ONLY legal implementation
 *   home is the composition root, `src/handlers/bootstrap.ts` (planned). Two obligations attach there:
 *
 *     1. The chosen stub behaviour MUST be documented explicitly at the composition root. A
 *        caller must never be able to mistake stub output for a real successful write.
 *     2. No image business logic may be added at the composition root either. The stub stays a
 *        stub; growing it into a real store is a separate decision outside this scope.
 *
 * THESE NAMES ARE CANONICAL
 *   Every subtree that will consume this module - `src/domain/entities/`, `src/services/`,
 *   `src/repositories/mysql/`, `src/handlers/` and `src/integrations/google/` - is empty at the
 *   time of writing. The symbol names, member names and signatures published below are
 *   therefore the canonical contract those consumers will be written against. Do not rename
 *   them later. `saveImageFile` and its three parameters are carried over from the legacy call
 *   verbatim precisely so that a reviewer can diff the two surfaces member by member; the
 *   deletion member's name has no legacy antecedent and says so at its declaration.
 *
 * TEST COVERAGE IS NET-NEW, NOT LEGACY PARITY
 *   Only three legacy test files touch the in-scope slice at all, and not one of them covers
 *   image handling:
 *
 *     meta/tests/unit/entity/BrandTest.cfc
 *     meta/tests/unit/entity/ProductTest.cfc
 *     meta/tests/functional/admin/entity/ProductTest.cfc   - an empty stub
 *
 *   Coverage for this port is therefore entirely net-new and must be presented as such rather
 *   than as parity. Every member declared here requires a test. Those tests live under
 *   `slatwall-ts/tests/**` and are authored separately; none is written in this file.
 *
 * NO USER RULES WERE PROVIDED
 *   The project's rules document says exactly that, and nothing more. No rule is invented to
 *   fill the gap, and its absence is not licence to lower the bar - least of all for a stub.
 *   The enterprise standard applies at full strength here: maximal type strictness with no
 *   `any` and no suppression comment, a mechanically enforced layer boundary, no dependency
 *   beyond the pinned set, no hardcoded literal standing in for a setting, and one exported
 *   port per file with no barrel re-export.
 */

/**
 * A read-only projection of the CFML engine's file-upload result struct.
 *
 * WHY IT IS DECLARED HERE
 *   The legacy parameter is a bare `struct` - `required struct imageUploadResult`
 *   [model/service/SkuService.cfc:L210] - produced by the CF engine's own upload machinery.
 *   There is no in-scope entity for it and there never will be, because the engine that
 *   produced it is not part of the target. Modelling it as `any` or as an untyped
 *   string-keyed bag is forbidden outright, so it becomes what an out-of-scope type becomes
 *   throughout this project: a locally declared, read-only projection living in the one port
 *   that needs it. No separate file is created for it - `src/domain/ports/` is closed at
 *   thirteen files.
 *
 * THIS IS AN ANTI-CORRUPTION PROJECTION, NOT AN ENTITY
 *   It carries no identity, no persistence, no behaviour and no lifecycle. It is a boundary
 *   shape describing bytes that already exist somewhere, constructed by the caller at the seam
 *   and handed inward once. It MUST NOT be grown into an entity, and it must not accumulate
 *   members that merely happen to be available: every member below is one a file store needs
 *   in order to persist bytes at a path, and the register of deliberate omissions is part of
 *   the contract.
 *
 * DELIBERATELY OMITTED ENGINE KEYS
 *   The CF upload result carries considerably more than four keys. Each of the following is
 *   left out on purpose, so that minimality is auditable rather than asserted:
 *
 *     clientFile, clientFileName, clientFileFieldName - the browser-supplied name and form
 *       field. A store copying bytes to a caller-supplied path never consults them; the
 *       destination name is decided by the entity, not by the client.
 *     serverFileName, serverFileExt - redundant, being `serverFile` split in two.
 *     attemptedServerFile - an engine diagnostic about name collision resolution.
 *     fileWasSaved - an engine flag about the upload that already happened, upstream of this
 *       port. A caller that reaches a store has bytes to move.
 *     fileSize, oldFileSize - a store handed a source location does not need a byte count in
 *       order to copy it, and this port asserts no policy over either value.
 *     timeCreated, timeLastModified, dateLastAccessed - filesystem timestamps of the temporary
 *       artifact, of no interest to the destination.
 *
 * Every member is `readonly`: the projection is an input, and no in-scope path mutates it.
 */
export interface ImageUploadResultProjection {
  /**
   * The directory that already holds the uploaded bytes - the CFML upload-result key
   * `serverDirectory`. Together with `serverFile` this is the SOURCE location, without which
   * an implementation has nothing to copy.
   */
  readonly serverDirectory: string;

  /**
   * The file name of the uploaded bytes within `serverDirectory` - the CFML upload-result key
   * `serverFile`. Note that this is the name the engine settled on, which under a
   * make-unique upload policy is not the name the client sent.
   */
  readonly serverFile: string;

  /**
   * The extension the client supplied - the CFML upload-result key `clientFileExt`, carried
   * without a leading dot exactly as the engine reports it.
   *
   * This is the value an allow-list is applied to, which is the whole reason
   * `saveImageFile`'s third parameter has anything to test against. It is deliberately the
   * CLIENT extension rather than one derived from `serverFile`: an allow-list exists to judge
   * what arrived, not what the engine renamed it to.
   */
  readonly clientFileExt: string;

  /**
   * The media type the client declared, if it declared one - the CFML upload-result key
   * `contentType`.
   *
   * This is the only member an implementation can proceed without, which is why it is the
   * only optional one. It is written `contentType?: string` rather than
   * `contentType?: string | undefined` deliberately: under `exactOptionalPropertyTypes` the
   * bare `?:` form means "the key may be absent" and nothing else, whereas the explicit union
   * would additionally let a caller SET the key to `undefined`. There is no third state here
   * to model - a client either declared a media type or it did not - so admitting an explicit
   * `undefined` would create a distinction the boundary does not have.
   */
  readonly contentType?: string;
}

/**
 * The image persistence port.
 *
 * Two members, and two is the maximum. `saveImageFile` is carried over from the one fully
 * verified legacy collaborator signature; `deleteImageFile` exists so that the out-of-scope
 * deletion branch has a seam to delegate to. Nothing else in the in-scope slice reaches an
 * image store, so nothing else is declared - adding a third member would grow the surface
 * past what the legacy call sites prove is needed.
 *
 * The implementation wired in at `src/handlers/bootstrap.ts` (planned) is a documented stub. That does
 * not make this interface provisional: it is the real contract, and a later decision to back
 * it with a genuine store changes only the implementation, never these signatures.
 */
export interface ImageStore {
  /**
   * Persist already-uploaded bytes at a caller-supplied path.
   *
   * LEGACY ORIGIN - the one fully verified collaborator signature in this slice
   *   [model/service/SkuService.cfc:L210-L218] is `processImageUpload`, whose entire body is a
   *   path lookup, this call, and a boolean collapse. The call itself
   *   [model/service/SkuService.cfc:L212] passes exactly three NAMED arguments:
   *
   *     getService("imageService").saveImageFile(
   *       uploadResult      = arguments.imageUploadResult,
   *       filePath          = imagePath,
   *       allowedExtensions = "jpg,jpeg,png,gif"
   *     )
   *
   *   The member name and all three parameter names are reproduced verbatim, in that order,
   *   because interface parity is this project's acceptance contract: a reviewer must be able
   *   to place the two surfaces side by side and check them member by member.
   *
   * THE RETURN IS A STRICT BOOLEAN
   *   The legacy method assigns the result and immediately collapses it to `true` or `false`
   *   through an explicit if/else [model/service/SkuService.cfc:L213-L217] rather than
   *   returning the raw value, so the honest ported type is a boolean - and, per the async
   *   ruling, a promise of one. Nothing here dictates WHAT an implementation reports; the
   *   stub's chosen behaviour is documented at the composition root.
   *
   * @param uploadResult - Where the bytes already are, as the read-only projection above.
   *   Deliberately not an entity: the caller resolves the destination from the entity BEFORE
   *   calling the port - `arguments.Sku.getImagePath()` at
   *   [model/service/SkuService.cfc:L211], itself defined at [model/entity/Sku.cfc:L145-L147] -
   *   so passing a `Sku` inward would invert the dependency this port exists to straighten.
   * @param filePath - The destination path, resolved by the caller as described above. The
   *   port neither composes nor rewrites it, and it holds no notion of a root, a prefix or a
   *   provider: all of that belongs to the implementation.
   * @param allowedExtensions - The permitted extensions, as a CFML COMMA-DELIMITED LIST
   *   STRING. It stays a `string` rather than becoming an array, for signature parity with the
   *   legacy call; an implementation parses it with the sanctioned helpers in
   *   `src/lib/cfml/list.js` (`listToArray` to split it, `listFindNoCase` to test membership
   *   with CFML's case-insensitive semantics), which this module names but deliberately does
   *   not import. It has NO default value here on purpose: the observed value
   *   `jpg,jpeg,png,gif` is a literal at the CALL SITE, not a property of the store, so baking
   *   it in would hardcode a policy the caller owns.
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
   * THIS NAME HAS NO LEGACY ANTECEDENT
   *   Stated plainly, because every other name in this file is carried over verbatim and this
   *   one cannot be. The legacy deletion path never went through the image service at all: it
   *   called the CF engine's own builtins inline -
   *   `fileExists(...)` at [model/service/ProductService.cfc:L200] guarding
   *   `fileDelete(...)` at [model/service/ProductService.cfc:L201] - so there is no
   *   `imageService` deletion method anywhere in the slice to take a name from. `deleteImageFile`
   *   is chosen for symmetry with the one verified collaborator name, so that the pair reads as
   *   the two file-store operations they are.
   *
   * WHY IT EXISTS AT ALL
   *   Solely as a seam. `processProduct_deleteDefaultImage`
   *   [model/service/ProductService.cfc:L198-L206] is ported as a thin pass-through and needs
   *   something to delegate to; without this member the domain would have to reach a
   *   filesystem directly, which the layer boundary forbids. No image business logic is ported
   *   with it.
   *
   * WHY IT RETURNS NOTHING
   *   Three reasons, each grounded in the legacy body rather than in preference. The engine's
   *   `fileDelete` builtin yields no value. The calling process method consumes no deletion
   *   outcome - it returns `arguments.product` [model/service/ProductService.cfc:L205]
   *   regardless of what happened. And the `fileExists` guard at
   *   [model/service/ProductService.cfc:L200] means an absent file is a non-event rather than a
   *   failure, so there is no deleted-versus-already-gone distinction for a boolean to carry.
   *   Returning one would require inventing that distinction, which is exactly the kind of
   *   surface growth the minimal-change directive rules out. Contrast `saveImageFile`, which
   *   does return a boolean because its legacy caller genuinely branches on the result.
   *
   * @param filePath - The path of the file to remove, resolved by the caller from the entity
   *   in the same way as for `saveImageFile`.
   */
  deleteImageFile(filePath: string): Promise<void>;
}
