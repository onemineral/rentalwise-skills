# Reference data for filters and switchers

Cache all of these for an hour or longer; they change rarely. Add `no_auto_relations: true` and
list the relations you need; the default relations make these lists several times larger.

## Locations (destinations)

```json
POST location/query
{
  "with": ["seo", "country", "parent_location", "main_image"],
  "sort": [{ "field": "name", "direction": "asc", "locale": "en" }],
  "paginate": { "page": 1, "perpage": 200 },
  "no_auto_relations": true
}
```

Record: `{ id, name: TranslatedText, description: TranslatedText, country: { id, name, iso_code_2,
iso_code_3, region }, geo: { lat, lon }, parent_location, ancestors: Location[] | null,
main_image, images, seo: { slug, title, meta_description } }`.

Type-ahead: `POST location/query { "q": "new", "no_auto_relations": true, "paginate": { "perpage": 10 } }`
matches names containing the text ("New York", "New Mexico", "Upstate New York").

Only locations that have website-visible properties are worth showing. Count them with an
aggregation that carries its own `where` (verified: without it the count includes disabled and
hidden properties, e.g. 9 instead of 3):

```json
"with_aggregations": [{
  "type": "count", "relation": "properties", "as": "properties_count",
  "where": { "conditions": [
    { "field": "website_visible", "eq": true },
    { "field": "status", "in": ["enabled"] }
  ]}
}]
```

The count arrives as `aggregation_properties_count` on each record. Hide zeros, or restrict to
the list of destinations the customer wants featured (keep that list in the project's
configuration). The aggregation's `where` is subject to the same role check as any other: a
key whose role may not read `website_visible` gets a 422 here, and the fix is the role, not a
count without the condition (`rentalwise-api-auth` section 4).

## Amenities

```json
POST amenity/query
{ "with": ["amenity_group"], "paginate": { "page": 1, "perpage": 500 }, "no_auto_relations": true }
```

Record: `{ id, name: TranslatedText, original_name, description, is_featured, amenity_group: { id, name, original_name }, image }`.
Group by `amenity_group.name` for the filter panel; `is_featured` marks the handful worth
showing on cards. `amenity-group/query` with `with: ["amenities"]` gives the same data grouped.

## Currencies

```json
POST currency/query
{ "paginate": { "page": 1, "perpage": 100 } }
```

Record: `{ id, iso_code, symbol, html_code, html_entity, name: TranslatedText }`. Which of
them the site offers, and the default, is project configuration agreed with the customer; a
single-currency site needs no switcher at all. Pass the chosen currency as `{ iso_code }` to
search and quote; the API converts. Without a `currency` parameter prices come back in each
property's own currency.

## Property types and tags

`property-type/query` → `{ id, name: TranslatedText, original_name }` for a type filter
(filter with a `property_type.id` condition on `property/query`; search has no type filter).
`tag/query` → `{ id, name }` for the `tags` / `not_tags` search filters.

## Countries (booking form, contact form)

```json
POST country/query
{ "sort": [{ "field": "name", "direction": "asc", "locale": "en" }], "paginate": { "page": 1, "perpage": 300 } }
```

Record: `{ id, name: TranslatedText, region: TranslatedText, iso_code_2, iso_code_3 }`. 249
countries; the booking guest `country` field takes the id.

## Languages

```json
POST language/query
{
  "sort": [{ "field": "locale", "direction": "asc" }],
  "paginate": { "page": 1, "perpage": 50 },
  "no_auto_relations": true
}
```

Record: `{ id, locale, iso_locale, original_name, international_name, is_default }`. `locale`
(`en`, `fr`, ...) is the key of every TranslatedText map and the value `sort[].locale` and
translated `where` conditions accept; `is_default` marks the account's default language, which is
the fallback for untranslated text; `original_name` is the switcher label. Which of them the site
offers is project configuration. Everything else is in `rentalwise-languages-and-translations`.
