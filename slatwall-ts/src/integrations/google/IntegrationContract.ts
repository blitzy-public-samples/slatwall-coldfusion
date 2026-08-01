/**
 * IntegrationContract — the five-member contract every Slatwall integration adapter satisfies.
 *
 * Legacy origin: the `<cfinterface>` block at
 * `integrationServices/IntegrationInterface.cfc:L50-L89`, which declares exactly five members, in
 * this order:
 *
 *   :L52  init                 return declared as CFML's untyped catch-all
 *   :L56  getDisplayName       returntype="string"
 *   :L63  getIntegrationTypes  returntype="string"
 *   :L75  getSettings          returntype="struct"
 *   :L82  getEventHandlers     no `access` attribute — public by CFML default
 *
 * `:L82` is the subtle one. It declares no `access` attribute at all, and CFML defaults component
 * function access to public, so it is a full member of the public contract rather than an internal
 * helper. There is no sixth member.
 *
 * The loose CFML return declarations are not what fixes the target types; the default bodies at
 * `integrationServices/BaseIntegration.cfc:L51-L69` are — `return this` (`:L52`), `"Not Defined"`
 * (`:L56`), `""` (`:L60`), `{}` (`:L64`) and `[]` (`:L68`). Each member below is typed from the
 * value the legacy observably returns.
 *
 * THE CONTRACT IS TRANSLATED; THE DISCOVERY IS NOT
 * The legacy framework located integrations by scanning components on the ORM CFC path, and AAP
 * §0.8.3.2 retires that machinery rather than carrying it forward. Its whole replacement is one
 * hand-written `implements` clause in `GoogleIntegration.ts`. That is why this module holds no
 * registry, no lookup table, no discovery helper and no factory: the mechanism they would serve no
 * longer exists.
 *
 * The legacy adapter satisfies the contract partly through inheritance —
 * `integrationServices/google/Integration.cfc:L49` both extends the base component and declares
 * `implements` — overriding `init` (`:L51`), `getIntegrationTypes` (`:L55`), `getDisplayName`
 * (`:L59`) and `getSettings` (`:L63`), and inheriting the fifth member unchanged. The port
 * reproduces that shape: `BaseIntegration.ts` implements this interface, and `GoogleIntegration.ts`
 * implements it through that base.
 *
 * WHERE THE GOOGLE FEED LOGIC LIVES — orientation, because the adapter is the wrong place to look
 * `GoogleIntegration.ts` is nearly empty by faithfulness, not by neglect: the legacy
 * `integrationServices/google/Integration.cfc` carries no feed logic at all, only two fixed strings
 * and an empty structure. Record selection is ported from
 * `integrationServices/google/controllers/feed.cfc` into `ProductFeedQuery.ts`, and all RSS field
 * shaping is ported from `integrationServices/google/views/feed/product.cfm` into
 * `ProductFeedBuilder.ts`, which is where the real work of the feed lands.
 *
 * TYPES ONLY, AND NO IMPORTS
 * Both exports are interfaces, so nothing here survives compilation and consumers reach this module
 * with `import type`. It declares no import of its own: a contract that reached for a collaborator
 * would invert the dependency direction of every file implementing it. It holds no module-scope
 * binding of any kind either, which satisfies mismatch M7 — nothing may survive between invocations
 * of a stateless handler — by construction rather than by discipline.
 *
 *   GoogleIntegration.ts   nearly empty BY FAITHFULNESS, not by neglect. The legacy
 *                          integrationServices/google/Integration.cfc carries no feed logic
 *                          whatsoever — its contract members return two fixed strings and an
 *                          empty structure.
 *   ProductFeedQuery.ts    owns record SELECTION, ported from
 *                          integrationServices/google/controllers/feed.cfc — the three related-property
 *                          joins, the three activity filters and the availability range.
 *   ProductFeedBuilder.ts  owns all RSS field shaping, ported from
 *                          integrationServices/google/views/feed/product.cfm. This is where the
 *                          real work of the feed lands.
 *   README.md              records the route `?slatAction=google:feed.product` and the FeedDAO
 *                          dead-code finding (D12).
 *
 * ⭐ F19 — THE SPLIT IS NOW REALISED IN FULL, AND THIS NOTE RECORDS THE CORRECTION RATHER THAN
 * DELETING IT. An earlier revision of this header described `ProductFeedQuery.ts` and `README.md` in
 * the present tense before either existed, and the correction that followed overshot: it asserted that
 * "this folder currently holds FOUR files" and that neither was delivered. Both statements are now
 * false. The folder holds SIX files — `IntegrationContract.ts`, `BaseIntegration.ts`,
 * `GoogleIntegration.ts`, `ProductFeedQuery.ts`, `ProductFeedBuilder.ts` and `README.md` — which is
 * exactly the inventory AAP §0.4.1.10 names, so every forward reference above resolves to a file a
 * reader can open. The history is kept in one sentence because the SPLIT is the architectural finding
 * worth recording (AAP §0.6.4: the interface implementation carries no feed logic at all), and because
 * a header that has twice misdescribed its own folder should say so once rather than silently agree
 * with whatever is on disk today.
 *
 * NO SUPERTYPE, AND NO SIXTH MEMBER
 * The legacy base component extends a Hibachi framework object
 * (`integrationServices/BaseIntegration.cfc:L49`); `org/Hibachi/**` is the boundary being extracted
 * from and is never carried forward (AAP §0.8.3.2), so this interface has no `extends` clause.
 * Three candidate sixth members are declared on a component but on no `<cfinterface>` member: the
 * admin-markup member at `integrationServices/BaseIntegration.cfc:L71` and the two settings-related
 * members at `integrationServices/google/Integration.cfc:L67` and `:L73`. Each is declared where it
 * actually lives — on `BaseIntegration.ts` and `GoogleIntegration.ts` — because promoting either
 * kind here would impose a requirement the legacy interface never imposed.
 *
 * REGISTER DISCIPLINE
 * -------------------
 * This folder owns exactly two entries of the plan's carried-defect register (AAP §0.6.7): the
 * display-name copy-paste artifact D11, annotated in `GoogleIntegration.ts`, and the dead feed DAO
 * D12, recorded in `README.md`. The principle that a register entry must be findable in exactly ONE
 * place is honoured by that placement, and AAP §0.4.1.10 assigns it there explicitly: the README row
 * documents "the finding that `model/dao/FeedDAO.cfc` is orphaned dead code with broken SQL (defect
 * D12) and is deliberately not ported".
 *
 * ⭐ F19 — THE D12 EVIDENCE IS NOT RESTATED HERE, AND THAT IS THE CORRECTION. A revision written while
 * `README.md` was still undelivered transcribed the whole evidence chain — the trailing comma, the
 * `ON`-less join, the unscoped result variable, the zero callers — into this header so the finding would
 * be findable somewhere. `README.md` now exists and carries it, so keeping a second copy here would
 * violate the one-place rule in the opposite direction and leave two texts to keep in step by hand.
 * The evidence lives in `README.md` §9; this header states only that D12 exists, that it belongs to
 * this folder, and where to read it.
 *
 * This module mints no new defect number and no new execution-mismatch number, so the two parity
 * notes below are deliberately UNNUMBERED: they record stale legacy documentation, they do not extend
 * the register.
 */

/**
 * The contract every Slatwall integration adapter satisfies — five members, no more.
 *
 * Legacy: integrationServices/IntegrationInterface.cfc:L50-L89. The members are declared in the
 * legacy order so the two files can be read side by side, member for member.
 *
 * ALL FIVE MEMBERS ARE SYNCHRONOUS. Every legacy member is synchronous, no in-scope caller awaits
 * one, and this folder's implementations are pure value returns. Not one member therefore returns
 * a deferred value, and the keyword that would mark a member as awaitable appears nowhere in this
 * module. Deferring a member would change the observable contract for every implementor and every
 * caller — a behavior change the Minimal Change Clause (AAP §0.8.1) forbids, under which idiom
 * may change freely but behavior may not.
 *
 * `IntegrationSettingDescriptor`, referenced by the fourth member, is declared immediately below;
 * TypeScript interface declarations hoist, so the forward reference resolves.
 */
export interface IntegrationContract {
  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L52.
   *
   * The polymorphic `this` return type is the translation of a CFML declaration whose return was
   * the language's untyped catch-all, combined with a body that universally returns the component
   * itself (integrationServices/BaseIntegration.cfc:L52 and
   * integrationServices/google/Integration.cfc:L52).
   *
   * `this` preserves the fluent contract for implementors: `GoogleIntegration.init()` is typed as
   * returning `GoogleIntegration`, not as returning this interface, so a caller keeps the concrete
   * type it started with and can chain against it. Typing the member as the interface, as `void`
   * or as `unknown` would each discard that, and reproducing the untyped catch-all is forbidden
   * outright by AAP §0.7.3 S1.
   */
  init(): this;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L56, documented at L57-L60 as returning
   * the display name the integration should carry.
   *
   * Both observable returns are plain strings — `"Not Defined"` from the base component
   * (integrationServices/BaseIntegration.cfc:L56) and `"Google"` from the adapter
   * (integrationServices/google/Integration.cfc:L60) — so `string` is exact, and no narrower
   * literal type is available without inventing one.
   */
  getDisplayName(): string;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L63.
   *
   * The contract is a comma-separated list carried in a SINGLE string, as its documentation states
   * at L65-L66, and it is kept as `string` for precisely that reason. The four tokens the legacy
   * documentation enumerates, with the meanings it gives them
   * (integrationServices/IntegrationInterface.cfc:L68-L71), are recorded here as documentation
   * only:
   *
   *   shipping  the integration becomes usable by shipping methods and rates.
   *   payment   the integration becomes usable by payment methods.
   *   fw1       the integration may carry custom views.
   *   custom    the integration only hooks into events; no views and nothing further.
   *
   * They are NOT modelled as a union type, and the return is NOT an array. Three reasons, each
   * evidenced: the legacy value is one string that may carry several comma-separated tokens; the
   * only in-scope adapter returns the single token `"fw1"`
   * (integrationServices/google/Integration.cfc:L56) while the base component returns the empty
   * string (integrationServices/BaseIntegration.cfc:L60), so neither observable value would
   * justify a closed set; and two of the four tokens exist to serve the payment and shipping
   * adapter families that are explicitly out of scope
   * (AAP §0.2.2.3). Narrowing the type here would invent a contract the legacy interface does not
   * state (AAP §0.7.3 S9).
   */
  getIntegrationTypes(): string;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L75, declared `returntype="struct"`.
   *
   * Both observable implementations return an empty structure — the base component at
   * integrationServices/BaseIntegration.cfc:L64, the adapter at
   * integrationServices/google/Integration.cfc:L64 — and the one populated setting structure in
   * the entire slice keys descriptors by setting name, which is what fixes the value type below.
   *
   * `Readonly<...>` records that the returned structure is a description to be read, never a
   * handle to be written through. Under the subtree's `noUncheckedIndexedAccess` setting an
   * indexed read is typed `IntegrationSettingDescriptor | undefined`, so a caller must handle the
   * absent-key case explicitly — correct here, because the empty structure is the normal return.
   *
   * TODO(parity) — legacy documentation defect, preserved rather than repaired (AAP §0.7.3 S7).
   * integrationServices/IntegrationInterface.cfc:L77-L78 documents this member as returning true
   * only when a `/views/main/default.cfm` file is present inside the integration service: a
   * boolean description attached to a member whose declared return type is `struct` and whose two
   * observable implementations both return an empty structure. The declared `struct` contract
   * wins and the prose is stale. It is recorded, not corrected, and deliberately carries no
   * register number.
   */
  getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>>;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L82 — the member declaring no `access`
   * attribute, public by CFML default. Both observable implementations return an empty array
   * (integrationServices/BaseIntegration.cfc:L68, inherited unchanged by the Google adapter).
   *
   * The ELEMENT type is not observable in the in-scope slice: every implementation returns an
   * empty array, no in-scope caller reads an element, and the legacy prose describes a shape the
   * declaration contradicts (see the parity note below). `unknown` is therefore the honest
   * element type — it satisfies AAP §0.7.3 S1 because it is not the untyped catch-all and forces
   * a consumer to narrow before use, and it satisfies S9 because it invents no element shape.
   * `readonly` records that the value is a declaration to be read, not a collection to append to.
   *
   * TODO(parity) — legacy documentation defect, preserved rather than repaired (AAP §0.7.3 S7).
   * integrationServices/IntegrationInterface.cfc:L84 documents this member as returning valid
   * ColdSpring XML that overrides the default XML: a markup-string description attached to a
   * member declared `returntype="array"` and observably returning an empty array. The declared
   * `array` contract wins and the prose is stale. It is recorded, not corrected, and deliberately
   * carries no register number.
   */
  getEventHandlers(): readonly unknown[];
}

/**
 * The shape of one entry in the structure an integration returns to describe its settings.
 *
 * This shape is taken from the only populated setting structure observable in the in-scope slice,
 * at
 * integrationServices/google/Integration.cfc:L67-L71, whose descriptor literal is
 * `{fieldType="select"}` on L69. One key, one field, one value.
 *
 * `fieldType` stays `string` and is NOT narrowed to a `'select'` literal union. `select` is the
 * value the Google adapter happens to use; it is not an enumeration the contract declares, and no
 * second value is observable in scope from which a union could honestly be built.
 *
 * Nothing else about a setting descriptor is observable in scope, so nothing else is declared —
 * no default value, no label, no option list, no required flag, no data type, no sort order. Each
 * would be invention (AAP §0.7.3 S9).
 *
 * It is declared in this module, rather than in a shared type bucket, because this is the
 * producing module for the contract's types and because the folder contains no such bucket — its six
 * delivered files are exactly the six AAP §0.4.1.10 names, and none of them is a type bucket.
 * It is exported because `GoogleIntegration.ts` needs it for the adapter-only settings member that
 * this contract deliberately does not declare.
 */
export interface IntegrationSettingDescriptor {
  readonly fieldType: string;
}
