/**
 * Slatwall primary-key identifier generation.
 *
 * Legacy origin:
 * Model/dao/HibachiDAO.cfc:L51-L53 — `createSlatwallUUID()`, whose entire body delegates to
 * `createHibachiUUID()`. The public member name is preserved here so this port stays
 * traceable to the legacy declaration.
 * Org/Hibachi/HibachiObject.cfc:L144-L146 — `createHibachiUUID()`, the implementation the
 * DAO delegates to: `return replace(lcase(createUUID()), '-', '', 'all');`
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
 */

/*
 * IR-7 — the three seeded product-type discriminators are fixed seed data, not generated values, and
 * must never be routed through this function. They are declared once, as typed constants, in
 * src/domain/BaseProductType.ts (mirrored for the suite in test/fixtures/productTypes.ts); this
 * module deliberately neither declares nor re-exports them, so there is only one place they can
 * drift from their seed rows at config/dbdata/SlatwallProductType.xml.cfm:L13-L15.
 */

/**
 * Generates a new Slatwall primary-key identifier.
 *
 * @returns a fresh identifier of exactly 32 lowercase hexadecimal characters with no dashes,
 * suitable for any `Sw*` column declared `ormtype="string" length="32"`.
 */
export function createSlatwallUUID(): string {
  return randomUUID().replaceAll('-', '');
}
