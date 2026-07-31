# NOTICE — GNU General Public License v3.0

## What this notice covers

This notice applies to the `slatwall-ts/` subtree of this repository.

`slatwall-ts/` is a TypeScript re-expression of business logic derived from **Slatwall 3.1.39** — the
release recorded in the repository-root `version.txt`. It ports a bounded catalog and
promotions/pricing slice of the legacy CFML application to the AWS Lambda `nodejs20.x` runtime, and
continues to read and write the same `Sw*` MySQL tables. Because it reproduces the business logic of
that application rather than merely calling it, the code in this subtree is a work derived from
Slatwall and is subject to the GNU General Public License.

The upstream license text carried forward here is the License section of the repository-root
`readme.md` and, identically, the repository-root `license.txt`.

## Attribution

Carried forward verbatim from `readme.md`:

```
Slatwall - An Open Source eCommerce Platform
Copyright (C) ten24, LLC
```

Copyright in the upstream work is held by ten24, LLC. Nothing in this subtree and nothing in this
notice displaces, replaces, or obscures that holdership.

## License

Slatwall is released under the GPL v3.0 license, with a special exception that is addressed below.
The upstream grant, which this subtree inherits, reads:

> This program is free software: you can redistribute it and/or modify it under the terms of the
> GNU General Public License as published by the Free Software Foundation,
> either version 3 of the License, or (at your option) any later version.

That is: **GPL v3.0 or later.** `slatwall-ts/package.json` records the same thing in its `license`
field, as `GPL-3.0-or-later`.

The upstream warranty disclaimer applies to this subtree exactly as it does to the rest of the work:

> This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
> even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
> General Public License for more details.

### Where the full license text lives

The full license text is **not reproduced in this file**. A verbatim copy of the GNU General Public
License, Version 3, 29 June 2007 already ships with this distribution at the repository root, in
`GNU_V3_Copy.txt` (over 600 lines). It is also published at <http://www.gnu.org/licenses/>.

Duplicating those terms inside this subtree would add nothing and would make this notice
unreviewable. `GNU_V3_Copy.txt` is the operative text; read it there. For information about the
upstream project, including commercial licensing, `readme.md` directs readers to
<http://www.getslatwall.com>.

## Combined works

From `readme.md`:

> Linking this program statically or dynamically with other modules is making a combined work based
> on this program. Thus, the terms and conditions of the GNU General Public License cover the whole
> combination.

This clause bears directly on `slatwall-ts/`. The subtree reproduces Slatwall business logic and
links against third-party modules in order to run it, as recorded under
[Third-party dependencies](#third-party-dependencies) below. The result is a combined work based on
Slatwall, and the terms and conditions of the GNU General Public License cover the whole
combination.

## The special exception

The upstream license carries a special exception. The copyright holders give permission to combine
the program with independent modules and your custom code, regardless of the license terms of those
independent modules, and to copy and distribute the resulting program under terms of your choice —
**provided that all three of the following guidelines are followed**:

1. "You also meet the terms and conditions of the license of each independent module"
2. "You must not alter the default display of the Slatwall name or logo from any part of the application"
3. "Your custom code must not alter or create any files inside Slatwall, except in the following directories:"
   — followed by a single entry: `/integrationServices/`

### The special exception does NOT extend to `slatwall-ts/`

`slatwall-ts/` is a top-level directory of this repository. It is not `/integrationServices/`, and it
is not located anywhere beneath `/integrationServices/`.

The exception's third guideline names `/integrationServices/` as the only directory in which custom
code may alter or create files inside Slatwall. This subtree lies outside that directory.

**Therefore the special exception does not apply to `slatwall-ts/`. The standard terms of the GNU
General Public License, version 3 or (at your option) any later version, govern this subtree in
full, without the exception.**

No file in this subtree and no statement in this notice claims the special exception, relies on it,
or extends it to the TypeScript code. Code in `slatwall-ts/` is offered under the GPL. Combining it
with independent modules therefore does not draw on the exception's permission to distribute the
result under terms of your choice.

### The name and logo guideline

Recorded for completeness: the exception's second guideline forbids altering the default display of
the Slatwall name or logo from any part of the application.

`slatwall-ts/` renders no user interface. It is a headless backend service — Lambda handlers plus one
machine-readable product-feed renderer. The presentation subsystems `admin/`, `frontend/`, `public/`,
and `assets/` are outside the scope of this port and are untouched by it. There is accordingly no
name or logo display inside this subtree for it to alter, and it alters no display elsewhere in the
application.

### Redistribution

Also from `readme.md`:

> You may copy and distribute the modified version of this program that meets the above guidelines
> as a combined work under the terms of GPL for this program, provided that you include the source
> code of that other code when and as the GNU GPL requires distribution of source code.

Redistribution therefore requires including source code as the GNU GPL requires. The upstream text
adds that if you modify the program you may extend the exception to your version,
"but you are not obligated to do so" — extending it is permitted, not obligatory. This subtree does
not extend it; as stated above, the standard GPL terms govern here.

## Provenance

Recorded so that the attribution is auditable.

| Aspect            | Detail                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| Upstream baseline | Slatwall 3.1.39, per the repository-root `version.txt`                       |
| Upstream license  | GPL v3.0 or later, with the special exception recorded above                 |
| License sources   | Repository-root `readme.md` (License section) and `license.txt`, which agree |
| Full license text | Repository-root `GNU_V3_Copy.txt`                                            |

### Derived from

| Upstream source                                                                 | Files | Lines |
| ------------------------------------------------------------------------------- | ----: | ----: |
| Entities under `model/entity/`                                                  |    18 | 5,002 |
| Services under `model/service/`                                                 |     7 | 2,694 |
| Data-access components under `model/dao/`                                       |     6 | 1,554 |
| Declarative validation schemas under `model/validation/`                        |    12 |     — |
| Process objects under `model/process/`                                          |     3 |     — |
| Google adapter under `integrationServices/google/`                              |     6 |     — |
| Contracts `integrationServices/IntegrationInterface.cfc`, `BaseIntegration.cfc` |     2 |     — |

Of the 2,694 service lines, `model/service/PromotionService.cfc` alone accounts for 1,125.

### Not derived from

`org/Hibachi/**` — 938 files, including 24 top-level `Hibachi*.cfc` classes — is a boundary this port
extracts from and never modifies. No file beneath it is ported into `slatwall-ts/`. The
responsibilities that framework carried (dependency injection, request routing, ORM-managed
persistence, request-scoped ambient state) are re-expressed independently in this subtree rather than
translated from its source.

### Upstream files modified

None. No existing repository file is modified by this port: every legacy CFML artifact was read as a
reference, and every artifact under `slatwall-ts/` is new. The repository-root `readme.md`,
`license.txt`, and `GNU_V3_Copy.txt` are the upstream originals and are unmodified.

## Third-party dependencies

`slatwall-ts/package.json` declares thirteen direct dependencies — three runtime and ten development
— each pinned to an exact version, with no range specifiers.

Runtime:

| Package      | Version | Declared license |
| ------------ | ------- | ---------------- |
| `decimal.js` | 10.6.0  | MIT              |
| `mysql2`     | 3.23.1  | MIT              |
| `zod`        | 4.4.3   | MIT              |

Development:

| Package               | Version  | Declared license |
| --------------------- | -------- | ---------------- |
| `typescript`          | 5.9.3    | Apache-2.0       |
| `@types/node`         | 20.19.43 | MIT              |
| `@types/aws-lambda`   | 8.10.162 | MIT              |
| `vitest`              | 4.1.10   | MIT              |
| `@vitest/coverage-v8` | 4.1.10   | MIT              |
| `esbuild`             | 0.28.1   | MIT              |
| `eslint`              | 10.8.0   | MIT              |
| `typescript-eslint`   | 8.65.0   | MIT              |
| `prettier`            | 3.9.6    | MIT              |
| `dotenv`              | 17.4.2   | BSD-2-Clause     |

The "Declared license" column transcribes the identifier each package declares in its own metadata,
as recorded in `slatwall-ts/package-lock.json`. It is a transcription of that metadata and not an
independent determination — consult each package's own license file for its operative terms.
`package-lock.json` is likewise the record of the transitive dependency set and of the licenses
declared across it.

Each of these modules carries its own license, and those terms must be honored. The upstream
exception's first guideline states the same obligation — "You also meet the terms and conditions of
the license of each independent module" — and although that exception does not apply to this
subtree, the obligation to honor every dependency's own license stands independently of it.

## Scope of this notice

This notice records two kinds of fact: what the upstream Slatwall license text says, and where this
subtree sits in the repository's directory tree. It does not interpret those terms, does not add to
or subtract from them, and is not legal advice.

Where this notice and the license text could be read differently, the license text governs:
`GNU_V3_Copy.txt` for the GNU General Public License itself, and the License section of `readme.md`
— identically, `license.txt` — for the Slatwall-specific statement and its special exception.
