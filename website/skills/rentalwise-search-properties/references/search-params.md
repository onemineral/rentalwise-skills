# `property/search` parameters

All optional. Omit a key rather than sending `null` or `[]`. Generated from the schema
(`scripts/schema.py args property/search`); re-run after a PMS release.

| Param | Type | Meaning |
|---|---|---|
| `daterange` | `{ start, end }` ISO dates | Stay to price and check availability for. `end` is checkout. Without it, no availability filtering or pricing is done. A `start` before today is a 422. |
| `guests` | number | Total guests: adults + children + babies. The only occupancy rule search applies is `max_occupancy >= guests`; there is no `adults`, `children` or `babies` argument and no policy filter (see SKILL.md for `babies_allowed`). |
| `instant_bookable` | boolean | `true` keeps only properties whose policy is `instant_booking`. |
| `locations` | number[] | Location ids; parents include their descendants. |
| `amenities` | number[] | All listed amenities must be present. |
| `collections` | number[] | Property must belong to one of these collections (collection locations/tags are honoured). |
| `tags` / `not_tags` | number[] | Include/exclude by tag id. |
| `min_bedrooms`, `min_bathrooms` | number | Lower bounds. |
| `budget` | `{ min, max }` | Total stay price bounds in the requested currency. Only meaningful with `daterange`. |
| `currency` | `{ id }` or `{ iso_code }` | Currency to convert prices into. Results carry `availability_details.converted`. |
| `geo` | `{ lat, lon }` | Centre point for distance-based relevance. |
| `discounts_count` | number | Only properties with at least this many active discounts. |
| `website_visible` | boolean | Send `true` on a public site so hidden properties never leak. |
| `include_fees` | boolean | Include mandatory fees in `availability_details.total`. Set it to match how the customer wants list prices shown; the quote always includes fees. |
| `ignore_min_stay`, `ignore_restrictions` | boolean | Return properties that fail min-stay/other rules (for inquiry flows). Do not use for bookable prices. |
| `channel`, `markup` | | Sales-channel attribution and markup for OTA-style integrations. A standalone website leaves both out. |
| `paginate` | `{ page, perpage }` | Accepted but ignored by the current API: the full result set comes back with `per_page: 500`. Page in your own code. |
| `with_aggregations` | array | Same as on `query` endpoints. Rarely needed. |

The arguments above are the complete list (`scripts/schema.py args property/search`). Any
other key in the body is dropped by validation before the action runs, silently (the backend
keeps only declared arguments; verified live with a `where` block and a `sort`, which changed
neither the result set nor its order), so a filter that seems to have no effect is one the
action does not take. The records that come back are slim, see `result-fields.md`;
relations, sorting and `where` filtering belong to `property/query` below.

## `property/query` for listing without availability

```json
{
  "where": {
    "conditions": [
      { "field": "status", "in": ["enabled"] },
      { "field": "website_visible", "eq": true },
      { "field": "location.id", "in": [12, 13] }
    ]
  },
  "with": ["seo", "currency", "main_image", "location"],
  "sort": [{ "field": "name", "direction": "asc", "locale": "en" }],
  "paginate": { "page": 1, "perpage": 20 },
  "no_auto_relations": true
}
```

Sortable fields include `name` (with a `locale` from `language/query`; omitted = default language), `bedrooms`, `bathrooms`, `max_occupancy`,
`reviews_rating`, `marketing_price`, `created_at`. `q` adds a free-text match on the name
(`"q": "art"` matches "Cortonese Art Apartment"); it is the simplest "search by name" box.

### Availability block on `property/query`

`property/query` can also price a stay, which gives you server-side price sorting and real
pagination:

```json
{
  "availability": {
    "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
    "guests": 4,
    "currency": { "iso_code": "EUR" },
    "sort_by": "total",
    "sort_direction": "asc",
    "budget": { "min": null, "max": 3000 },
    "ignore": []
  },
  "where": { "conditions": [{ "field": "website_visible", "eq": true }, { "field": "status", "in": ["enabled"] }] },
  "paginate": { "page": 1, "perpage": 20 },
  "no_auto_relations": true
}
```

`ignore` is required inside the block; send `[]` to apply every rule. Being a `query`, it
takes `where` conditions on policies too: add `{ "field": "policies.babies_allowed", "eq": true }`
(or `children_allowed`, `pets_allowed`) when the party needs it; `property/search` cannot. Other keys: `months`
(array of `YYYY-MM` for "flexible dates" searches), `over_weekend`, `min_stay`, `max_stay`,
`pets`, `include_inquire_only`. Results carry the same `availability_details` as search.

## Resolving ids from UI values

| UI value | Lookup |
|---|---|
| Destination name typed by visitor | `location/query { "q": "rom", "no_auto_relations": true, "paginate": { "perpage": 10 } }` → `data[].{ id, name }` |
| Destination slug in URL | `location/query` where `seo.slug` eq slug |
| Collection slug in URL | `collection/query` where `seo.slug` eq slug |
| Currency code from switcher | pass `{ "iso_code": "EUR" }` directly |
| Amenity checkboxes | ids from `amenity/query` |
