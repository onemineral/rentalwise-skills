# `property/get-quote` in detail

## Parameters

| Param | Type | Notes |
|---|---|---|
| `property` | number | Required. |
| `daterange` | `{ start, end }` | Required. `end` is checkout. |
| `adults` | number | Required, ≥ 1. |
| `children`, `babies` | number | Default 0. Policies may forbid them (`children_allowed`, `babies_allowed`). |
| `pets` | boolean | Pet fee may apply; policy may forbid. |
| `bedrooms` | number | For properties sold by bedroom count (rare). |
| `currency` | `{ id }` or `{ iso_code }` | Conversion target; totals and `currency` in the response are in it. |
| `coupon_code` | string | Validated; invalid codes return 422 with a `coupon_code` key. |
| `public` | boolean | Marks the quote as coming from a public source; harmless on a website, not required. |
| `booking` | number | Only when re-quoting an existing booking (modification flows). |
| `booker`, `booker_data` | | Attach a known guest; the website normally does not. |
| `fees`, `overlap_fees`, `total_accommodation*`, `commission_*`, `force`, `ignore` | | Back-office overrides. Do not expose. |

## Response

```json
{
  "quote_id": "8fc939b18bca120e000e1b6682d50e0bf87cfba5",
  "search_criteria": {
    "property": 12, "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
    "adults": 2, "children": 1, "babies": 0, "pets": false,
    "currency": { "iso_code": "EUR" }, "coupon_code": "SUMMER10"
  },
  "property": { "id": 12, "name": { "en": "Sea View Villa" }, "main_image": { ... }, "policies": { ... }, "...": "..." },
  "currency": { "id": 2, "iso_code": "EUR", "symbol": "€" },
  "booking": null,
  "booker": null,
  "products": [
    {
      "name": "Accommodation", "type": "accommodation",
      "checkin": "2026-07-10", "checkout": "2026-07-17",
      "total_pretax": 2100, "total": 2289,
      "include_in_accommodation_subtotal": false,
      "line_items": [
        { "name": "7 night(s) @ €300.00/night (2026-07-10 / 2026-07-16)", "type": "rate", "quantity": 7, "unit_pretax": 300, "total_pretax": 2100, "start_date": "2026-07-10", "end_date": "2026-07-16" }
      ],
      "taxes": [ { "name": "VAT 9%", "total": 189 } ]
    },
    { "name": "Cleaning fee", "type": "fee", "total_pretax": 120, "total": 120, "line_items": [], "taxes": [] },
    { "name": "SUMMER10", "type": "discount", "total_pretax": -210, "total": -210, "line_items": [], "taxes": [] }
  ],
  "total": 2199,
  "total_pretax": 2010,
  "total_taxes": 189,
  "total_accommodation": 2079,
  "total_accommodation_pretax": 1890,
  "total_fees": 120,
  "total_fees_pretax": 120,
  "total_before_discount": 2409,
  "total_discount": 210,
  "security_deposit": 500,
  "security_deposit_currency": { "iso_code": "EUR" },
  "commission": null,
  "book_url": "https://app.rentalwise.io/public/booking/12?start_date=...&quote_id=...",
  "exceptions": [],
  "warnings": []
}
```

Product `type` values: `accommodation`, `fee`, `additional_fee`, `discount`, `bond_capture`,
`other`. Discounts have negative totals. Show
`product.total` (tax-inclusive) per line and `quote.total` as the grand total; offer a details
view with `line_items` and `taxes` when a product has more than one of them.

`book_url` is RentalWise's hosted booking page for this quote. A custom website usually builds
its own form, but the link is a valid fallback.

`property` in the response is the full property record; you can use it instead of loading the
property again on the booking page.

## `quote_id`

`sha1` of a JSON document with the property id, check-in, check-out, adults, children, babies,
pets, coupon code, currency id, the (back-office) total overrides and fees, and the computed
`total` / `total_pretax`. No timestamp, no server-side record: the id never expires by time and
is valid for as long as the same request prices the same. `create-booking` quotes again, hashes
the result and compares; a mismatch is 422 `quote_id` with the message
"The pricing for this property has expired." (translated by `x-locale`).

## Error handling

```ts
import { rw } from './rentalwise';                 // createRentalWiseClient(...) from the auth skill
import { RentalWiseError } from './rentalwise-client';

try {
    const quote = await rw.post('property/get-quote', params);
    return { ok: true, quote };
} catch (e) {
    if (e instanceof RentalWiseError && e.statusCode === 422) {
        const errors = e.responseBody.errors ?? {};
        const keys = Object.keys(errors).filter((k) => !['rates_defined', 'availability', 'property_booked'].includes(k));
        if (keys.length === 0) {
            return { ok: false, message: 'Property is not available for the selected dates.', errors: [] };
        }
        return { ok: false, message: e.responseBody.message, errors: keys.map((k) => errors[k][0]) };
    }
    return { ok: false, message: 'There was an error processing your request.', errors: [] };
}
```

Return the error payload with a 200 from your own route when it is a normal "not available"
outcome, and reserve 5xx for real failures; the UI then distinguishes "pick other dates" from
"try again later".

## Rule keys seen in 422 responses

`rates_defined` (no rates for part of the period), `availability` (overlap with a booking or
block; older releases used `property_booked`), `min_stay`, `max_stay`, `min_prior_notify`, `max_booking_window`, `checkin_restricted`,
`checkout_restricted`, `max_occupancy`, `children_allowed`, `babies_allowed`, `pets_allowed`,
`coupon_code`, `daterange.start`, `daterange.end`, `adults`.
