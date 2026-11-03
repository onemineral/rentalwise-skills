# RentalWise REST conventions

Contents: request shape · response envelope · pagination · query language (`where`, `with`,
`sort`, aggregations, `q`) · shared value types · error formats · endpoint map.

## Request shape

- Method is always `POST`, including reads. The body is JSON (`{}` when there are no
  arguments). `GET` is not served.
- URL: `{BASE_URL}{resource}/{action}`, e.g. `https://app.rentalwise.io/rest/property/search`.
  Resource and action are kebab-case, exactly as `settings/fetch` lists them under `schema`.
  (Code written against the deprecated JavaScript SDK used camelCase methods: `getQuote` is
  `get-quote`, `createBooking` is `create-booking`.)
- Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`,
  `Accept: application/json`.
- Uploads (not used by a guest website) are multipart; everything in this skill set is JSON.
- Only declared arguments reach an action: the body is validated against the action's
  argument list and every other key is dropped without an error (verified in the backend).
  A misspelled or unsupported parameter therefore never fails, it just does nothing; when a
  parameter seems to have no effect, check `scripts/schema.py args <resource>/<action>`.

## Response envelope

The HTTP body is the payload itself, no envelope. (The deprecated JavaScript SDK wrapped it as
`{ headers, lastResponse, response }`; when porting SDK code, `result.response` becomes the
parsed body.)

Single-record actions (`fetch`, `create`, `get-quote`, `create-booking`) return the record.
List actions (`query`, `search`) return a page:

```json
{
  "data": [ ... ],
  "current_page": 1,
  "last_page": 7,
  "per_page": 20,
  "from": 1,
  "to": 20,
  "total": 132
}
```

`from` and `to` are `null` when `data` is empty. Some actions return a bare array
(`get-unavailability`, `get-applicable-discounts`, `get-occupancy-rates`) and
`payment/create-client-secret` returns `{ "data": { ... } }`.

## Pagination

`"paginate": { "page": 1, "perpage": 20 }` on `query` actions. Keep `perpage` small on pages
that render many images; 200-500 is fine for reference data loaded once and cached.

`property/search` is different: it accepts `paginate` but, as observed on the current API, ignores
it and returns every matching property in one response (`per_page` comes back as 500,
`last_page` as 1). Treat the result as the complete list and page, sort and slice in your own
code. Guard for the day it changes: if `last_page > 1`, request the remaining pages.

## Query language (`query` actions)

All `*/query` endpoints accept the same block:

```json
{
  "where": {
    "conditions": [
      { "field": "status", "in": ["enabled"] },
      { "field": "seo.slug", "eq": "sea-view-villa" },
      { "field": "bedrooms", "gte": 3 }
    ],
    "conditions_logic": null
  },
  "sort": [{ "field": "name", "direction": "asc", "locale": "en" }],
  "paginate": { "page": 1, "perpage": 20 },
  "with": ["seo", "currency", "images", "location.country"],
  "no_auto_relations": false
}
```

- A condition is `{ field, <operator>: value }`. Operators used throughout this skill set: `eq`,
  `in`. Others follow the same pattern (`neq`, `gt`, `gte`, `lt`, `lte`, `like`, `null`). Fields
  can be dotted paths into relations (`seo.slug`, `legal_entity.id`, `location.id`).
- TranslatedText fields take composed operators whose value is `{ locale?, value }`: `contains`,
  `not_contains`, `eq`, `not_eq` (single-line fields only), `is_null`, `not_null` (`{ locale }`
  only): `{ "field": "name", "contains": { "locale": "fr", "value": "villa" } }`. Omit `locale`
  to use the account's default language. A locale the account has not enabled answers 422
  `{ "errors": { "where.conditions.0": ["The selected value is invalid."] } }`.
- `sort[].locale` applies to TranslatedText fields and must be one of the account's locales
  (`language/query`); omitted means the default language, unknown means 422 on `sort.N.locale`.
- `conditions_logic` is an optional boolean expression over condition indexes
  (`"(0 and 1) or 2"`); leave it out for AND.
- `with` eager-loads relations by dotted path (`amenities.amenity_group`,
  `rooms.beds.bed_type`, `related_properties.main_image`). Relations not listed come back
  absent, so always list what the page renders. `main_image`, `location`, `currency`,
  `property_type` and `collections` come with a property by default; `images`, `seo`,
  `policies`, `rates_settings`, `fees`, `rooms`, `reviews`, `videos`, `rental_agreement`,
  `legal_entity`, `amenities`, `discounts` do not.
- `no_auto_relations: true` disables the default relations and makes the response smaller;
  pair it with an explicit `with`. Use it on every list and lookup query.
- `q` is a free-text search over the record's `name` in the account's **default language** only
  (`location/query { "q": "new" }` matches "New York", "New Mexico", ...); for another language
  filter `name` with `contains` and a `locale`. Use it for
  type-ahead inputs with a small `perpage` and `no_auto_relations: true`. `picklist: true`
  exists but did not reduce the payload in testing; do not rely on it.
- `with_aggregations` adds computed values: `[{ type: "count", relation: "properties", as:
  "properties_count" }]` adds `aggregation_properties_count` to each record (the key is prefixed
  with `aggregation_`). An aggregation takes its own `where` with conditions on the related
  resource (`{ type: "count", relation: "properties", as: "visible_count", where: { conditions:
  [...] } }`); without it a count includes disabled and hidden records.

`fetch` actions take `{ id, with, no_auto_relations }` and return one record.

## Shared value types

| Type | Shape | Notes |
|---|---|---|
| TranslatedText | `{ "en": "Villa", "fr": "Villa", "ro": null }` | Keys are the `locale` codes of `language/query` (two-letter, lowercase). Only saved keys are present and a value may be `null` or `""`. Resolve: page locale → the account's default language (`is_default`) → first non-blank value. Older records may be a plain string: treat it as the default-language value. Rules, field list and helper in `rentalwise-languages-and-translations`. |
| DateRange | `{ "start": "2026-07-10", "end": "2026-07-17" }` | ISO dates, no time. `end` is the checkout day (not slept). Nights = end − start. |
| Geo | `{ "lat": 41.9, "lon": 12.5 }` | Note `lon`, not `lng`. |
| Currency ref | `{ "id": 1 }` or `{ "iso_code": "EUR" }` | Either key works where a `currency` object is accepted. |
| Money (`price`) | plain number | Decimal in the currency's major unit (e.g. `1234.5` EUR). Not cents. `0` often means "not set" (e.g. `marketing_price`). |
| Size | `{ "sqm": 120, "sqft": null }` | Either unit may be null. |
| Timestamps | `"2026-02-23 11:18:08"` | **UTC**, space separator, no offset (`created_at`, `expires_at`, `checkin_time`, ...). Parse as UTC: `new Date(s.replace(' ', 'T') + 'Z')`. The API's "today" (past-date 422s, `next_payment_due_date` comparisons, the automatic charge day) is the UTC calendar date. The account's display timezone is `tenant.settings.timezone` in `settings/fetch` (IANA name, default `Etc/GMT`); a property has no timezone field in the API. |
| Image | `{ id, thumbnail, medium, large, original, width, height, description, tags, order }` | CDN URLs with resize parameters baked in: thumbnail ≈400px square crop, medium ≈800px, large ≈1920px. |

## Error formats

Validation (422):

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "max_occupancy": ["The number of guests exceeds the maximum occupancy."],
    "rates_defined": ["No rates are defined for the selected dates."],
    "availability": ["The property is not available for the selected dates."]
  }
}
```

`errors` is keyed by field name for input problems (`daterange.start`, `quote_id`, `adults`) and
by rule name for business rules (`rates_defined`, `availability`, `min_stay`, ...). The top-level
`message` is sometimes the generic sentence and sometimes the first error message
(`property/search` with a past date answers
`{ "message": "Must be a date after or equal to today.", "errors": { "daterange.start": [...] } }`),
so always read `errors`. Flatten `Object.values(errors).flat()` when you just need messages.

Business errors that are not validation come back as **500** with
`{ "message": "...", "exception_type": "response_exception" }`; the message is meant for the
developer, not the visitor.

Authentication (401): `{ "message": "Unauthenticated." }`.

Wrong path: 500 with `{ "message": "Action with name \"x\" is not registered", ... }`. Not a
404; check the resource/action spelling.

## Endpoint map used by this skill set

Argument lists for each one come from `scripts/schema.py args <endpoint>`; the `returns` column
is the schema's `response_type`, whose fields `scripts/schema.py fields <type>` prints.

| Purpose | Endpoint | Returns | Skill |
|---|---|---|---|
| Search available properties | `property/search` | page of slim `property` records (see search skill) | search |
| List/filter properties (no pricing) | `property/query` | page of `property` | search, details |
| One property by id | `property/fetch` | `property` | details |
| Collections | `collection/query`, `collection/fetch` | `collection` | search |
| Locations (destinations, type-ahead via `q`) | `location/query` | `location` | search |
| Amenities | `amenity/query`, `amenity-group/query` | `amenity`, `amenity-group` | search, details |
| Currencies | `currency/query` | `currency` | search |
| Property types and tags (filters) | `property-type/query`, `tag/query` | `property-type`, `tag` | search |
| Countries (booking form) | `country/query` | `country` | booking |
| Languages the account writes content in (TranslatedText keys) | `language/query` | `language` | languages |
| Blocked dates | `property/get-unavailability` | array of `unavailability` `{ start_date, end_date }` | details |
| Seasonal occupancy rates | `property/get-occupancy-rates` | array of `property-occupancy-season` | details |
| Discounts for a period | `property/get-applicable-discounts` | array of `applicable-discount` | details |
| Price a stay | `property/get-quote` | `quote` | quote |
| Create booking | `property/create-booking` | `booking` | booking |
| Extras for a stay / for a booking | `service/query-available`, `service/price-services`, `service/price-services-for-booking`, `service/price-for-booking`, `booking/add-services` | arrays (see `rentalwise-booking/references/services.md`), `booking` | booking |
| Read a booking back | `booking/query`, `booking/fetch` | `booking` | booking, payment-page |
| Payment methods for a legal entity | `payment-method/query` | `payment-method` | booking |
| Payment widget secret | `payment/create-client-secret` | `{ data: { client_secret, instance } }` | payment-page |
| Contact / ask a question | `inquiry/create` | `inquiry` | quote |
| API schema (development time) | `settings/fetch` | `settings` with `schema` | auth |
