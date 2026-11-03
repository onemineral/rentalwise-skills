---
name: rentalwise-search-properties
description: How to search and list vacation rental properties and collections from the RentalWise API for a custom website - search results pages with dates, guests, destination/location, amenities, budget and currency filters, collection pages, destination pages, featured-property blocks, map views, and the reference data (locations, amenities, currencies) that filter UIs need. Use this skill whenever a website built on RentalWise (One Mineral PMS; also projects still on the deprecated @onemineral/pms-js-sdk, which these skills replace with plain HTTP) needs to show more than one property, or needs prices per stay in a list, even if the user just says "listing", "search page", "homepage grid" or "show available villas". Requires the client from rentalwise-api-auth.
---

# Searching properties and collections

Two endpoints list properties. Pick by what the page needs:

| Page needs | Endpoint | Why |
|---|---|---|
| Availability and a price for a stay (dates known), guest-count filtering, budget filter, amenity/location/collection filters, instant-book filter | `property/search` | Availability + pricing in one call. Returns only bookable properties for the dates. |
| A plain list with sorting by name/bedrooms, a featured block, a "related properties" row, resolving a property by slug, counting, any field search does not return | `property/query` | Generic query language (`where`, `with`, `sort`, `q`). No pricing unless you add the `availability` block. |

Both return the paginated envelope described in `rentalwise-api-auth`
(`{ data, current_page, last_page, per_page, total }`), with one twist described below: search
ignores `paginate`.

## Search flow for a results page

1. Read the UI state: check-in, check-out, adults, children, selected destinations (location
   ids), amenities, budget, currency, page. Keep this state in the URL query string so results
   are shareable and the property page can read the same dates.
2. Map it to `property/search` params (full list in `references/search-params.md`):

```json
{
  "website_visible": true,
  "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
  "guests": 4,
  "locations": [12],
  "amenities": [3, 8],
  "budget": { "min": null, "max": 3000 },
  "currency": { "iso_code": "EUR" },
  "instant_bookable": false
}
```

   - `guests` is one number: adults + children + babies. Search has no `adults`, `children` or
     `babies` argument (an unknown key is ignored silently, verified) and applies exactly one
     rule, `max_occupancy >= guests`, so babies count toward it. Note the quote is laxer: it
     checks `max_occupancy` against adults + children only and checks babies against
     `policies.babies_allowed`. Counting babies in search is the stricter of the two rules and
     never shows a property the quote would refuse for occupancy.
   - A baby in the party also needs `policies.babies_allowed`, which search cannot filter on.
     Either hide those properties after the `property/query` merge of "Cards need more"
     (`with: ["policies"]`), or run the search through `property/query` with the
     `availability` block and a `{ "field": "policies.babies_allowed", "eq": true }` condition
     (verified; `references/search-params.md`). Treat `null` as allowed, like the property page.
   - Omit `daterange` when the visitor has not picked dates. The API then returns every
     website-visible property without availability pricing, and you display `marketing_price`
     (a "from" price per night) when it is above zero.
   - Omit a filter rather than sending an empty array or `null`.
   - Validate dates on the server first: a past check-in makes the API answer 422
     (`errors["daterange.start"]`) instead of an empty list.
3. Call the backend route that forwards to `property/search`. The browser sends only the filter
   state; the route holds the token, adds `website_visible: true`, and returns mapped results.
   Never call `property/search` from browser code.
4. Render `data`. The fields a card gets are listed in `references/result-fields.md`; the price
   logic is the part people get wrong, so read it.
5. Page, sort and slice in your own code (below).

### Search returns everything at once

`property/search` accepts `paginate` but the current API ignores it: the response holds every
matching property (`per_page: 500`, `last_page: 1`, `total` = number of matches). Only the arguments in
`references/search-params.md` do anything: the action reads the validated body, which keeps
the declared arguments and drops every other key without an error (`where`, `sort` and `with`
included; verified in the backend and live). Sorting and extra filtering happen in your own
code. So:

- Treat the response as the full result set. Cache it for the duration of the visitor's
  request (or a few seconds), sort it (name, price, bedrooms, occupancy), then slice the page
  the visitor asked for. Show `total` as the match count.
- Keep the response small: with a large catalogue, filter by location or collection before
  searching rather than asking for everything.
- Guard for the day pagination starts working: if `last_page > 1`, fetch the remaining pages
  before sorting.
- If you need the server to sort by price, use `property/query` with the `availability` block
  and `availability.sort_by: "total"` (`references/search-params.md`); that endpoint does
  paginate.

## Price display rules

- With dates: each property carries `availability_details` with `total`,
  `total_before_discount`, `length_of_stay`, `currency_iso` and, when you asked for a different
  currency, a `converted` block. Show `converted.total` if present, else `total`. Nightly price =
  total / length_of_stay. If `total_before_discount > total`, show the strike-through.
- `is_price_approximate: true` means fees or taxes could not be fully computed; label the price
  "from" or "approx." and rely on the quote for the exact amount.
- Without dates: show `marketing_price` (per night, in `currency`) when it is > 0; it is `0` or
  `null` when the customer has not set one, and then the card shows no price. Never invent a
  price from rates.
- The exact amount the guest pays always comes from `property/get-quote`
  (`rentalwise-quote`), never from search results.

## Cards need more than search returns

A search result is a slim record: id, name, short_description, description, bedrooms,
bathrooms, toilets, max_occupancy, comfortable_occupancy, currency, marketing_price, main_image,
location, seo, display_geo, plus `availability_details` and `rate` when dates were sent. There
is no property type, no reviews rating, no amenities and no booking category. When a
card needs those, run one `property/query` for the ids on the page:

```json
{ "where": { "conditions": [{ "field": "id", "in": [12, 15, 31] }] },
  "with": ["property_type", "amenities", "policies"], "no_auto_relations": true, "paginate": { "perpage": 50 } }
```

and merge by id. Cache that per-property data; it changes rarely.

## Collections

Collections are curated groups of properties ("Beachfront", "Family villas"). A collection page
is a search page pre-filtered by the collection:

```json
POST collection/query
{ "where": { "conditions": [{ "field": "seo.slug", "eq": "beachfront" }] }, "with": ["seo"], "paginate": { "perpage": 1 }, "no_auto_relations": true }
```

Then `property/search` with `"collections": [collection.id]` plus whatever filters the visitor
set. Use `collection.name`, `description` (TranslatedText) and `main_image` for the header. A
collection can also target `locations` and `tags`; `property/search` with `collections` already
honours them. To list all collections for a menu or home page: `collection/query` with
`sort: [{ field: "name", direction: "asc", locale: "en" }]`, optionally a condition
`{ field: "is_featured", eq: true }`.

Resolve by slug when the URL has a slug and by `id` when it is numeric (check `isNaN(slug)` to
decide the field). Canonicalise URLs to the slug. Slugs are whatever the customer typed in the
PMS (sometimes prefixed with a locale, like `en-caribbean-escape`); never derive them from the
name.

## Destinations (locations)

Locations are hierarchical (`parent_location`, `ancestors`, which may be `null` or `[]` at the
top level). A destination page queries `location/query` by `seo.slug` with
`with: ["seo", "images", "country", "ancestors"]`, then runs `property/search` with
`locations: [location.id]`. Searching a parent location includes its children.

## Reference data for filters

Load once, cache for an hour: locations for the destination picker (`location/query`; for
type-ahead send `q`), amenities grouped for the filter panel (`amenity/query` with
`with: ["amenity_group"]`), currencies for the switcher (`currency/query`). Exact requests and
shapes are in `references/reference-data.md`. Which currencies, languages and destinations the
site offers is the website's own configuration (agree it with the customer and keep it in the
project); the API only tells you what exists (`currency/query`, `language/query`, `location/query`).

## Pitfalls

- Visitors may only see `website_visible` properties. Pass `website_visible: true` on every
  `property/search` and add `{ field: "website_visible", eq: true }` plus
  `{ field: "status", in: ["enabled"] }` conditions to every `property/query` on a public page.
- `daterange.end` is the checkout date. One night = end is the day after start.
- Property names, locations and amenity names are TranslatedText maps; resolve them for the
  page locale, then the account's default language, then any non-blank value
  (`rentalwise-languages-and-translations`). Any `locale` you send in `sort` or a `where`
  condition must be one the account has enabled, or the API answers 422.
- `property/search` already applies min-stay and other restrictions; `ignore_min_stay` /
  `ignore_restrictions` exist for "inquire anyway" flows only and must not be used to show
  bookable prices.
- Every call in this skill runs on the server, including the small ones: the destination
  type-ahead (`location/query` with `q`) and the currency list come through your own routes. A
  search box that calls `*.rentalwise.io` from the browser would need the token in the bundle.
  If you catch yourself writing `fetch('https://app.rentalwise.io/rest/...')` in a component,
  move it into a route and call that route instead.
