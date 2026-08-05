/**
 * Locate a `__proto__` own key anywhere inside a parsed JSON request document.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Every request document this service accepts is validated by a `z.strictObject`, whose contract is
 * that an UNRECOGNIZED KEY IS A REFUSAL - the caller is told which member it should not have sent
 * rather than having it silently dropped. `__proto__` is the one key for which that contract does not
 * hold, and QA testing found the gap by submitting it.
 *
 * MEASURED, not assumed. Against `zod` 4.4.3 with a nested pair of strict objects:
 *
 *   {"order":{"a":"x","constructor":{}}}          -> REFUSED, `unrecognized_keys`, path ["order"]
 *   {"order":{"a":"x","__proto__":{"polluted":1}}} -> ACCEPTED, the key silently dropped
 *   {"order":{"a":"x"},"__proto__":{"p":1}}        -> ACCEPTED, and it IS an own key of the root
 *                                                    (`Object.hasOwn` true, `Object.keys` lists it)
 *
 * In all three cases `Object.prototype` was verified UNMODIFIED afterwards, which is the important
 * half of the finding and the reason it is rated informational: `JSON.parse` creates `__proto__` as an
 * ordinary own DATA property rather than invoking the setter, so no assignment reaches the prototype
 * chain, and nothing downstream of validation spreads or merges an unvalidated document into an
 * existing object. THIS FILE THEREFORE CLOSES AN INCONSISTENCY, NOT AN ACTIVE VULNERABILITY, and it
 * is written so that it would ALSO close the vulnerability if a future merge-style consumer were ever
 * introduced. Defence in depth is worth having precisely because it does not depend on the current
 * consumers staying as careful as they are today.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SHARED RATHER THAN INLINED TWICE
 * ---------------------------------------------------------------------------
 * Two boundaries parse a JSON request body - `../handlers/priceResolutionHandler.ts` and
 * `../handlers/promotionApplicationHandler.ts` - and this project's convention is one exported unit
 * per file with no barrels, which is honoured here. The integration suites deliberately duplicate
 * their executor doubles rather than share one, and the reasoning recorded there is that a shared
 * helper would be an exported unit that is the subject of no suite. That reasoning does not carry
 * over to this function, for two reasons: it IS the subject of its own suite, and duplicated
 * security-adjacent logic has a specific failure mode of its own - one copy gets corrected and the
 * other quietly does not. One implementation, one suite, two narrow named imports.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WALK IS DEEP, AND WHY IT IS ITERATIVE
 * ---------------------------------------------------------------------------
 * DEEP, because the asymmetry it corrects is deep. `strictObject` refuses an unrecognized key at
 * EVERY level of a nested document, so refusing `__proto__` only at the root would leave the very
 * inconsistency this closes in place one level down - and the nested case is the one QA actually
 * submitted.
 *
 * ITERATIVE, with an explicit stack, because recursion over caller-supplied nesting is a stack
 * overflow waiting to happen: a 2 000-level document is exactly what QA testing sent, and a
 * `RangeError` thrown from a security guard would convert a refusal into an unrecognized 500. The
 * work is bounded without needing a depth limit of its own - both call sites cap the request body's
 * byte length before parsing, so the node count is bounded by that cap, and a document produced by
 * `JSON.parse` cannot contain a cycle.
 */

/**
 * The one key name that `z.strictObject` does not treat as unrecognized.
 *
 * Written as a string constant rather than a literal at the comparison site so the value appears
 * exactly once, and spelled with a computed member access at every use so nothing in this module can
 * be read as assigning to a prototype.
 */
const PROTOTYPE_KEY = '__proto__';

/** How a path names an array element - the index, as the AAP's own field paths spell them. */
function extendPath(parentPath: string, segment: string): string {
  return parentPath === '' ? segment : `${parentPath}.${segment}`;
}

/**
 * One pending node: a value still to be examined, and the path that reaches it.
 *
 * `unknown` rather than `object`, because the stack carries array elements and object member values
 * before anything has narrowed them, and narrowing is this walk's own job.
 */
interface PendingNode {
  readonly value: unknown;
  readonly path: string;
}

/**
 * Find the path of the first `__proto__` own key in a parsed JSON document.
 *
 * Traversal order is deterministic - depth-first over own enumerable keys in insertion order, which
 * for a `JSON.parse` result is document order - so a document with several offending keys always
 * reports the same one, and a suite can assert the exact path rather than a set.
 *
 * ★ ONLY OWN KEYS ARE CONSULTED, VIA `Object.hasOwn`. An INHERITED `__proto__` is present on every
 * ordinary object in the language and is not a caller's doing; reporting it would refuse every
 * request. What is being detected is specifically a key the CALLER's document carries.
 *
 * ★ `null` IS HANDLED BEFORE `typeof`, and arrays before plain objects. `typeof null === 'object'`
 * would otherwise put `null` on the plain-object branch, and `Object.hasOwn(null, …)` throws.
 *
 * @param document the parsed request document, already known to be an object at its root.
 * @returns the dotted path of the offending key - `'__proto__'` at the root, `'order.__proto__'`
 *   nested, `'order.orderItems.0.__proto__'` inside an array - or `undefined` when the document
 *   carries none, which is the ordinary case for every well-formed request.
 */
export function findPrototypeKeyPath(document: object): string | undefined {
  const pending: PendingNode[] = [{ value: document, path: '' }];

  while (pending.length > 0) {
    // `pop()` is `T | undefined` under `noUncheckedIndexedAccess`, and the loop condition does not
    // narrow it, so the guard below is how the element is taken rather than a formality.
    const node = pending.pop();

    if (node === undefined) {
      break;
    }

    const { value, path } = node;

    if (value === null || typeof value !== 'object') {
      continue;
    }

    if (Array.isArray(value)) {
      // Elements are pushed in reverse so that `pop()` yields them in index order, which is what
      // makes the reported path the FIRST offending element rather than the last.
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: value[index], path: extendPath(path, String(index)) });
      }
      continue;
    }

    if (Object.hasOwn(value, PROTOTYPE_KEY)) {
      return extendPath(path, PROTOTYPE_KEY);
    }

    const keys = Object.keys(value);

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];

      if (key === undefined) {
        continue;
      }

      pending.push({
        // The index signature is what `Object.keys` already proved safe to read.
        value: (value as Record<string, unknown>)[key],
        path: extendPath(path, key),
      });
    }
  }

  return undefined;
}
