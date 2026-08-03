/**
 * `httpResponse` — the request readers, pinned against the event shapes the AWS platform actually
 * delivers rather than the ones its TypeScript typings describe.
 *
 * AAP authority: the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. This file sits
 * beside the four per-handler boundary suites; they assert what each ROUTED MEMBER answers, and this one
 * asserts what the SHARED READERS beneath them do with the raw event. Neither duplicates the other.
 *
 * =============================================================================================
 * WHY THIS FILE EXISTS, STATED PLAINLY
 * =============================================================================================
 * It did not exist, and its absence is why a real defect shipped. `src/handlers/httpResponse.ts`
 * narrowed each event container against `null` ONLY, on the strength of the AWS v1 typings declaring
 * the containers required-and-nullable. That reasoning mistook an annotation for the wire format: API
 * Gateway's payload format 2.0 — which a Lambda function URL uses, and which the console selects by
 * default for a new HTTP API integration — OMITS `queryStringParameters` when there is no query string
 * and omits `pathParameters` unless the route declares one. On that shape
 * `Object.hasOwn(undefined, name)` and `Object.entries(undefined)` both raise a `TypeError`, and
 * because the readers run BEFORE the handler's own `try`, the raise ESCAPED the handler entirely —
 * no status mapping, no body sanitisation, no correlation ID. Measured across the four catalog
 * handlers, 29 of 33 routed members threw.
 *
 * So every case below that says "absent" is pinning that shape, and the shape it is pinning is the
 * DEFAULT one for a console-wired HTTP API, not an exotic one.
 *
 * ⭐ NOT ONE CASE IN THIS FILE NEEDS A CAST, AND THAT IS THE POINT OF THE SIGNATURES IT EXERCISES.
 * Each reader takes a `Partial<Pick<APIGatewayProxyEvent, …>>` slice, so "the container key is absent"
 * is expressible as the plain object literal `{}` — a type-level statement that the runtime shape is
 * legal. A reader declaring the un-partialled slice could only be tested here through a
 * shape-forcing cast, which is to say the missing test and the missing narrowing had the same cause.
 *
 * =============================================================================================
 * WHAT IS UNDER TEST
 * =============================================================================================
 *   - THE THREE-WAY EQUIVALENCE. For every reader, "the container key is absent", "the container is
 *     `null`" and "the container is present but does not carry the name" answer IDENTICALLY, because
 *     all three mean the same thing to a caller: nothing was addressed.
 *   - THE ONE DISTINCTION THAT IS NOT COLLAPSED. An empty string is a VALUE and is returned as one.
 *     AAP §0.6.1.3 T5 records that an empty option selection legitimately degenerates to every
 *     option-bearing SKU of a product, so substituting absence for it would feed a different input
 *     into a member that behaves differently for it.
 *   - PASS-THROUGH IS ABSOLUTE. No value is trimmed, case-folded, coerced or rewritten by any reader.
 *   - OWN-KEY READS ONLY. A name colliding with an inherited member of `Object.prototype` is refused,
 *     so no reader can hand back a function from a signature that promises a string.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 verified that the legacy suite
 * contains no controller test of any kind — `meta/tests/functional/admin/entity/ProductTest.cfc` is an
 * empty component with zero test methods — and the readers here port no legacy member: they stand in
 * for the CFML engine's own population of the `URL`, `FORM` and `CGI` scopes, which no legacy test
 * exercised because the engine supplied it. Nothing in this file extends a legacy assertion, and none
 * is labelled as though it did.
 */
import {
  BOUNDED_READ_LIMIT_PARAMETER,
  BOUNDED_READ_OFFSET_PARAMETER,
  HTTP_STATUS,
  readBoundedReadWindow,
  readHeader,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  readSmartListInput,
} from '../../src/handlers/httpResponse';

/* ================================================================================================
 * readPathParameter
 * ============================================================================================== */

describe('readPathParameter — an absent container is absence, never a throw', () => {
  it('NET-NEW — the container key ABSENT answers `undefined` instead of raising a TypeError', () => {
    /* The exact probe from the QA reproduction. Before the narrowing it raised
     * `TypeError: Cannot convert undefined or null to object` with `Function.hasOwn` as its first frame. */
    expect(readPathParameter({}, 'productID')).toBeUndefined();
  });

  it('NET-NEW — the three ways of addressing nothing are INDISTINGUISHABLE', () => {
    const absent = readPathParameter({}, 'productID');
    const nulled = readPathParameter({ pathParameters: null }, 'productID');
    const otherName = readPathParameter({ pathParameters: { skuID: 'x' } }, 'productID');

    expect(absent).toBeUndefined();
    expect(nulled).toBe(absent);
    expect(otherName).toBe(absent);
  });

  it('NET-NEW — a present parameter is returned BYTE FOR BYTE, with no trimming or folding', () => {
    const value = '  Mixed CASE\twith\nwhitespace  ';

    expect(readPathParameter({ pathParameters: { productID: value } }, 'productID')).toBe(value);
  });

  it('NET-NEW — an EMPTY value is a value, not absence (AAP §0.6.1.3 T5)', () => {
    /* Collapsing this onto `undefined` would hand a member that treats "" as a legal, meaningful input
     * the wrong input entirely. The distinction is preserved deliberately. */
    expect(readPathParameter({ pathParameters: { selectedOptions: '' } }, 'selectedOptions')).toBe(
      '',
    );
  });

  it('NET-NEW — an INHERITED name is refused, so no function can leak through a string signature', () => {
    /* `Object.hasOwn` is load-bearing: a bare indexed read would resolve `toString` through the
     * prototype chain and hand back a function from a reader declared to answer `string | undefined`. */
    expect(readPathParameter({ pathParameters: {} }, 'toString')).toBeUndefined();
    expect(readPathParameter({ pathParameters: {} }, 'constructor')).toBeUndefined();
    expect(readPathParameter({ pathParameters: {} }, '__proto__')).toBeUndefined();
  });

  it('NET-NEW — an OWN key shadowing an inherited name is still read, because it was supplied', () => {
    expect(readPathParameter({ pathParameters: { toString: 'supplied' } }, 'toString')).toBe(
      'supplied',
    );
  });

  it('NET-NEW — a container carrying an explicitly undefined member answers absence', () => {
    /* `APIGatewayProxyEventPathParameters` declares its members possibly-absent, so the own-key test
     * can pass while the value is still nothing. The declared return type covers it and no default is
     * substituted. */
    expect(
      readPathParameter({ pathParameters: { productID: undefined } }, 'productID'),
    ).toBeUndefined();
  });
});

/* ================================================================================================
 * readQueryStringParameter
 * ============================================================================================== */

describe('readQueryStringParameter — the container payload format 2.0 omits most often', () => {
  it('NET-NEW — the container key ABSENT answers `undefined` instead of raising a TypeError', () => {
    expect(readQueryStringParameter({}, 'fileURL')).toBeUndefined();
  });

  it('NET-NEW — absent, `null` and present-without-the-name are INDISTINGUISHABLE', () => {
    const absent = readQueryStringParameter({}, 'fileURL');

    expect(absent).toBeUndefined();
    expect(readQueryStringParameter({ queryStringParameters: null }, 'fileURL')).toBe(absent);
    expect(readQueryStringParameter({ queryStringParameters: { term: 'x' } }, 'fileURL')).toBe(
      absent,
    );
  });

  it('NET-NEW — an attacker-chosen name colliding with an inherited member is refused', () => {
    /* A client chooses query-parameter names freely, so this is the container whose keys are
     * attacker-influenced — which is why the own-key guard matters more here than for a route template. */
    expect(readQueryStringParameter({ queryStringParameters: {} }, 'valueOf')).toBeUndefined();
    expect(
      readQueryStringParameter({ queryStringParameters: {} }, 'hasOwnProperty'),
    ).toBeUndefined();
  });

  it('NET-NEW — a value carrying a SQL payload is forwarded byte-identically as an opaque value', () => {
    const payload = "' OR 1=1 --";

    expect(readQueryStringParameter({ queryStringParameters: { term: payload } }, 'term')).toBe(
      payload,
    );
  });
});

/* ================================================================================================
 * readHeader
 * ============================================================================================== */

describe('readHeader — the container the AWS typings call always-present', () => {
  it('NET-NEW — an ABSENT header container answers `undefined` instead of raising a TypeError', () => {
    /* This reader was NOT among the three the QA finding enumerated, and it carried the identical
     * defect: `Object.entries(undefined)` raises the same TypeError. It matters more than the other
     * three, because every gated route calls it FIRST through the authorization gate — so a raise here
     * escaped before any other reader was reached. */
    expect(readHeader({}, 'authorization')).toBeUndefined();
  });

  it('NET-NEW — an absent container and an absent header are answered identically', () => {
    expect(readHeader({}, 'authorization')).toBe(readHeader({ headers: {} }, 'authorization'));
  });

  it('NET-NEW — the header NAME is matched without regard to case (RFC 9110)', () => {
    const event = { headers: { AuThOrIzAtIoN: 'Bearer abc' } };

    expect(readHeader(event, 'authorization')).toBe('Bearer abc');
    expect(readHeader(event, 'AUTHORIZATION')).toBe('Bearer abc');
  });

  it('NET-NEW — the header VALUE is never folded, only the name is', () => {
    expect(readHeader({ headers: { 'x-probe': 'MiXeD' } }, 'X-Probe')).toBe('MiXeD');
  });

  it('NET-NEW — an inherited member is never mistaken for a received header', () => {
    /* `Object.entries` yields own enumerable entries only, which is what closes this without a guard. */
    expect(readHeader({ headers: {} }, 'toString')).toBeUndefined();
  });
});

/* ================================================================================================
 * readSmartListInput
 * ============================================================================================== */

describe('readSmartListInput — an absent query string is the legal `data={}` case', () => {
  it('NET-NEW — the container key ABSENT answers the empty input instead of raising a TypeError', () => {
    expect(readSmartListInput({})).toStrictEqual({});
  });

  it('NET-NEW — absent and `null` both answer the empty input', () => {
    expect(readSmartListInput({})).toStrictEqual(
      readSmartListInput({ queryStringParameters: null }),
    );
  });

  it('NET-NEW — an empty result is LEGAL and MEANINGFUL, not a failure', () => {
    /* It is exactly the `data={}` default at [model/service/SkuService.cfc:L309] and
     * [model/service/ProductService.cfc:L342], and what every in-repository caller effectively passes. */
    const input = readSmartListInput({ queryStringParameters: { unrecognised: 'ignored' } });

    expect(input).toStrictEqual({});
  });

  it('NET-NEW — only the vocabulary the legacy interpreter recognised is forwarded', () => {
    const input = readSmartListInput({
      queryStringParameters: {
        keyword: 'shirt',
        OrderBy: 'productName|ASC',
        'P:Show': '10',
        'F:activeFlag': '1',
        'FR:price': '10^20',
        madeUpKey: 'dropped',
      },
    });

    expect(input).toStrictEqual({
      keyword: 'shirt',
      OrderBy: 'productName|ASC',
      'P:Show': '10',
      'F:activeFlag': '1',
      'FR:price': '10^20',
    });
  });

  it('NET-NEW — nothing is defaulted, clamped, ordered or paginated (AAP §0.7.3 S9)', () => {
    const input = readSmartListInput({ queryStringParameters: { keyword: 'shirt' } });

    expect(Object.keys(input)).toStrictEqual(['keyword']);
  });

  it('NET-NEW — an inherited member cannot be mistaken for a supplied parameter', () => {
    expect(readSmartListInput({ queryStringParameters: {} })).toStrictEqual({});
  });
});

/* ================================================================================================
 * readBoundedReadWindow
 * ============================================================================================== */

describe('readBoundedReadWindow — the absent container is refused, not raised on', () => {
  it('NET-NEW — the container key ABSENT refuses with the limit named, and does not throw', () => {
    const result = readBoundedReadWindow({});

    expect(result.present).toBe(false);

    if (!result.present) {
      expect(result.response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(JSON.parse(result.response.body)).toStrictEqual({
        message: 'A "limit" query parameter is required, and must be a positive whole number',
      });
    }
  });

  it('NET-NEW — absent and `null` are refused identically', () => {
    expect(readBoundedReadWindow({})).toStrictEqual(
      readBoundedReadWindow({ queryStringParameters: null }),
    );
  });

  it('NET-NEW — a stated window is read exactly as stated, with no clamping', () => {
    const result = readBoundedReadWindow({
      queryStringParameters: {
        [BOUNDED_READ_LIMIT_PARAMETER]: '25',
        [BOUNDED_READ_OFFSET_PARAMETER]: '0',
      },
    });

    expect(result.present).toBe(true);

    if (result.present) {
      expect(result.window).toStrictEqual({ limit: 25, offset: 0 });
    }
  });
});

/* ================================================================================================
 * readJsonObjectBody
 * ============================================================================================== */

describe('readJsonObjectBody — three spellings of "no body", all reported as absence', () => {
  it('NET-NEW — an ABSENT body member reports `absent`, not `malformed`', () => {
    /* Unlike the container readers this never escaped the error contract — `JSON.parse(undefined)`
     * parses the STRING "undefined" and throws, and the throw was caught — so the answer was mapped and
     * safe. It was simply the WRONG REASON: a client told its body was malformed when it sent none
     * cannot act on that. Payload format 2.0 omits `body` rather than nulling it. */
    expect(readJsonObjectBody({})).toStrictEqual({ present: false, problem: 'absent' });
  });

  it('NET-NEW — `null`, the empty string and an absent member all report `absent`', () => {
    const absent = { present: false, problem: 'absent' };

    expect(readJsonObjectBody({})).toStrictEqual(absent);
    expect(readJsonObjectBody({ body: null })).toStrictEqual(absent);
    expect(readJsonObjectBody({ body: '' })).toStrictEqual(absent);
  });

  it('NET-NEW — genuinely invalid JSON still reports `malformed`, so the two stay distinguishable', () => {
    expect(readJsonObjectBody({ body: '{"unterminated":' })).toStrictEqual({
      present: false,
      problem: 'malformed',
    });
  });

  it('NET-NEW — a non-object JSON document reports `notAnObject`', () => {
    expect(readJsonObjectBody({ body: '"a string"' })).toStrictEqual({
      present: false,
      problem: 'notAnObject',
    });
    expect(readJsonObjectBody({ body: '[]' })).toStrictEqual({
      present: false,
      problem: 'notAnObject',
    });
    expect(readJsonObjectBody({ body: 'null' })).toStrictEqual({
      present: false,
      problem: 'notAnObject',
    });
  });

  it('NET-NEW — a parsed object is returned as-is, and prototype pollution is not performed', () => {
    const result = readJsonObjectBody({ body: '{"brandName":"Acme","__proto__":{"polluted":1}}' });

    expect(result.present).toBe(true);

    if (result.present) {
      expect(result.value['brandName']).toBe('Acme');
    }

    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('NET-NEW — duplicate keys keep last-value semantics, which is JSON.parse own behaviour', () => {
    const result = readJsonObjectBody({ body: '{"brandName":"first","brandName":"second"}' });

    expect(result.present).toBe(true);

    if (result.present) {
      expect(result.value['brandName']).toBe('second');
    }
  });
});

/* ================================================================================================
 * THE CROSS-READER PROPERTY — no reader raises for ANY combination of absent containers
 * ============================================================================================== */

describe('every reader survives an event carrying NONE of the containers it reads', () => {
  it('NET-NEW — the empty event is answered by all six readers without a single throw', () => {
    /* The property the 29-of-33 blast radius came down to, asserted once in one place. An event
     * literal with no containers at all is the most extreme payload-format-2.0 shape, and every reader
     * answers it with its own documented "nothing was supplied" value. */
    expect(() => {
      readPathParameter({}, 'productID');
      readQueryStringParameter({}, 'term');
      readHeader({}, 'authorization');
      readSmartListInput({});
      readBoundedReadWindow({});
      readJsonObjectBody({});
    }).not.toThrow();
  });

  it('NET-NEW — and answers it identically to the canonical all-null v1 shape', () => {
    expect(readPathParameter({}, 'productID')).toBe(
      readPathParameter({ pathParameters: null }, 'productID'),
    );
    expect(readQueryStringParameter({}, 'term')).toBe(
      readQueryStringParameter({ queryStringParameters: null }, 'term'),
    );
    expect(readHeader({}, 'authorization')).toBe(readHeader({ headers: {} }, 'authorization'));
    expect(readSmartListInput({})).toStrictEqual(
      readSmartListInput({ queryStringParameters: null }),
    );
    expect(readBoundedReadWindow({})).toStrictEqual(
      readBoundedReadWindow({ queryStringParameters: null }),
    );
    expect(readJsonObjectBody({})).toStrictEqual(readJsonObjectBody({ body: null }));
  });
});
