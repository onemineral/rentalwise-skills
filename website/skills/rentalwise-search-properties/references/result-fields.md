# Fields on a search result

`property/search` returns a slim projection of the property, not the full record. Observed on
the current API, each item in `data` has exactly these keys:

| Field | Type | Use |
|---|---|---|
| `id` | number | Key, and the `property` value for quote/booking. |
| `name` | TranslatedText | Title. |
| `short_description`, `description` | TranslatedText | Teaser; `description` is the long text, truncate it yourself. |
| `main_image` | Image or null | `thumbnail` (400 square), `medium` (800), `large` (1920). Use `description` as alt text, else the name. |
| `location` | Location | `name` (TranslatedText), `country`, `ancestors` (may be null) for "Rome, Lazio, Italy". |
| `seo` | `{ slug, title, meta_description }` | Property page URL segment. Fall back to `id` if `slug` is empty. |
| `bedrooms`, `bathrooms`, `toilets` | number | Facts row. |
| `max_occupancy`, `comfortable_occupancy` | number | "Sleeps 8". |
| `currency` | `{ id, iso_code, symbol }` | Currency of `marketing_price` and of unconverted totals. |
| `marketing_price` | number or null | "From X / night" when there are no dates; `0`/`null` means not set, show nothing. |
| `display_geo` | `{ lat, lon }` or null | Map pin. Already offset when `show_exact_address` is false; `geo` is not returned. |
| `availability_details` | object | Present when the search had `daterange`. See below. |
| `rate` | object or null | Raw rate details for the dates; prefer `availability_details`. |

Not in a search result: `headline`, `property_type`, `reviews_rating` / `reviews_count`,
`policies` (so no booking category), `price_type`, `amenities`, `discounts`, `images`. Load them
with one `property/query` for the page's ids (`with: ["property_type", "amenities", "policies"]`,
`no_auto_relations: true`) and merge by id, or design the card around what search returns.

## `availability_details`

Field list from the schema (`scripts/schema.py fields availability-details`):

```json
{
  "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
  "length_of_stay": 7,
  "total": 2450,
  "total_before_discount": 2800,
  "total_discount": 350,
  "total_discount_percent": 12.5,
  "total_accommodation": 2300,
  "total_fees": 150,
  "currency_iso": "USD",
  "is_price_approximate": false,
  "converted": {
    "total": 2250.4, "total_before_discount": 2571.9, "total_discount": 321.5,
    "total_accommodation": 2112.6, "total_fees": 137.8, "currency_iso": "EUR"
  },
  "min_stay": { "ok": true, "value": 5 },
  "max_stay": { "ok": true, "value": 30 },
  "min_prior_notify_days": { "ok": true, "value": 2 },
  "max_booking_window_days": { "ok": true, "value": 365 },
  "checkin_restricted": { "ok": true, "value": false },
  "checkout_restricted": { "ok": true, "value": false }
}
```

Display logic:

```ts
const d = property.availability_details;
const total = d.converted?.total ?? d.total;
const currency = d.converted?.currency_iso ?? d.currency_iso;
const before = d.converted?.total_before_discount ?? d.total_before_discount ?? total;
const nightly = d.length_of_stay ? total / d.length_of_stay : total;
const showStrike = before > total;
```

The `*.ok` flags are informational on search results (search already excluded failing
properties unless you passed `ignore_*`). They matter when you use `property/query` with
`availability.ignore`.
