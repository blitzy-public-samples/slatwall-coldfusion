/**
 * Slatwall primary-key identifier generation.
 *
 * Legacy origin:
 *   model/dao/HibachiDAO.cfc:L51-L53 — `createSlatwallUUID()`, whose entire body delegates to
 *     `createHibachiUUID()`. The public member name is preserved here so this port stays
 *     traceable to the legacy declaration.
 *   org/Hibachi/HibachiObject.cfc:L144-L146 — `createHibachiUUID()`, the implementation the
 *     DAO delegates to: `return replace(lcase(createUUID()), '-', '', 'all');`
 *
 * Requirement satisfied — IR-6: primary keys are 32-character UUID strings generated in
 * application code. 107 of 113 legacy entities declare
 * `fieldtype="id" generator="uuid" ormtype="string" length="32"`, so an identifier is exactly
 * 32 lowercase hexadecimal characters with no dashes. Neither database auto-increment nor a
 * dashed RFC-4122 string is usable against those columns.
 */

import { randomUUID } from 'node:crypto';

/*
 * Translation decision — AAP §0.8.2 Guideline 6. Recorded here because this file is where the
 * judgment was made.
 *
 * 1. The legacy expression was `replace(lcase(createUUID()), '-', '', 'all')`. CFML's
 *    `createUUID()` emits a dashed form in an `8-4-4-16` grouping, which the `'all'` replace
 *    reduces to 32 hexadecimal characters.
 * 2. The TypeScript equivalent reaches the same 32-lowercase-hex shape by a different route:
 *    `randomUUID()` from `node:crypto` emits a dashed RFC-4122 version-4 form in an
 *    `8-4-4-4-12` grouping, which its specification already defines as lowercase, and the same
 *    dash-stripping yields 32 hexadecimal characters. Because the source is specified
 *    lowercase, the legacy `lcase()` step has no counterpart to write — a `.toLowerCase()`
 *    here would be dead code.
 * 3. The one honest divergence: identifiers produced here carry the RFC-4122 version-4 version
 *    and variant bits in fixed positions, where the output of CFML's `createUUID()` did not
 *    follow that layout. Both forms satisfy /^[0-9a-f]{32}$/, both are 32 characters, and both
 *    are opaque as far as the `Sw*` schema is concerned — its identifier columns are plain
 *    32-character strings. This is a deliberate, documented translation decision, not an
 *    accident.
 */

/*
 * IR-7 — the three seeded product-type discriminators are fixed seed data, not generated
 * values, and must never be routed through this function:
 *   444df2f7ea9c87e60051f3cd87b435a1  merchandise
 *   444df2f9c7deaa1582e021e894c0e299  subscription
 *   444df313ec53a08c32d8ae434af5819a  contentAccess
 * They are seeded at config/dbdata/SlatwallProductType.xml.cfm:L13-L15 and are the literal
 * branch keys of `SkuService.createSkus`. They belong to src/domain/BaseProductType.ts and
 * test/fixtures/productTypes.ts as constants; this module deliberately neither declares nor
 * re-exports them. Their format is also the third independent corroboration of the shape this
 * function produces.
 */

/**
 * Generates a new Slatwall primary-key identifier.
 *
 * Port of `createSlatwallUUID()` [model/dao/HibachiDAO.cfc:L51-L53] and, through its
 * delegation, of `createHibachiUUID()` [org/Hibachi/HibachiObject.cfc:L144-L146].
 *
 * The function is synchronous, takes no arguments and holds no state, so every call is
 * independent — a property the stateless Lambda execution model relies on.
 *
 * @returns A fresh identifier of exactly 32 lowercase hexadecimal characters with no dashes,
 *          suitable for any `Sw*` column declared `ormtype="string" length="32"`.
 */
export function createSlatwallUUID(): string {
  return randomUUID().replaceAll('-', '');
}
