---
name: rentalwise-languages-and-translations
description: How a website built on the RentalWise property management API handles languages and translated content - which locale keys the account's translated fields use (language/query, is_default), how to resolve a TranslatedText map for the page language with the right fallbacks, which property, location, amenity and SEO fields are translated, how to pass a locale to sort, filter and free-text search, per-language URLs with hreflang and metadata, and the x-locale header. Use this skill whenever a RentalWise-backed site (One Mineral PMS; also projects still on the deprecated @onemineral/pms-js-sdk) is multilingual or gets another language, needs a language switcher or locale routing, shows text in the wrong language or falls back to English, needs to know which translation key to read or send, or sorts and filters by a translated field. Also use it before rendering any name, description, amenity, location or SEO field for the first time, because they are all translated maps.
---

# Languages and translated content

Every human-readable text RentalWise stores (property names and descriptions, location, amenity
and country names, SEO titles, rental agreements, ...) is a **TranslatedText**: a JSON map from a
language code to the text in that language. The website decides which languages it offers, puts
the language in the URL, and resolves every map for the page language. This skill covers the
keys, the fallback rule, the request parameters that take a locale, and the SEO consequences.
Texts the website adds itself (buttons, labels, validation copy) are not covered: they are not in the API.

## 1. The account's languages are the keys

```json
POST language/query
{ "sort": [{ "field": "locale", "direction": "asc" }], "paginate": { "page": 1, "perpage": 50 }, "no_auto_relations": true }
```

```json
{ "total": 3, "data": [
  { "id": 1, "locale": "en", "iso_locale": "en_US", "original_name": "English",  "international_name": "English", "is_default": true },
  { "id": 2, "locale": "fr", "iso_locale": "fr_FR", "original_name": "Français", "international_name": "French",  "is_default": false },
  { "id": 3, "locale": "es", "iso_locale": "es_ES", "original_name": "Español",  "international_name": "Spanish", "is_default": false }
] }
```

- `locale` is **the** key: it is what TranslatedText maps are keyed by and what `sort[].locale`
  and translated `where` conditions accept. It is a lowercase two-letter ISO 639-1 code, one of
  the 29 the PMS supports: `bg ca cs da de el en es et eu fi fr hr hu is it lt lv nl nn pl pt ro
  sk sl sr sv tr uk`. There are no regional variants (`en-GB`, `pt_BR`, `zh-cn` do not exist).
- `is_default` marks the account's default language. Content is always written in it first;
  other languages may be partially translated (the PMS can auto-translate, but customers also
  leave gaps). It is the only language guaranteed to have text, so it is the fallback.
- `iso_locale` (`en_US`, `fr_FR`) is for formatting: turn `_` into `-` and pass it to `Intl`
  (`new Intl.NumberFormat('fr-FR', ...)`). Never send it to the API.
- `original_name` is the label for a language switcher ("Français"), `international_name` the
  English name.
- Cache the list for an hour or longer. The website token only reads it; `language/create` and
  `language/update` are back office.

Which languages the site offers is project configuration agreed with the customer: a subset of
this list, with the default language normally the account's `is_default` (that is the only one
whose content is complete). Do not offer a language that is not in `language/query`: there is no
content for it and the API rejects the key. If the customer wants a new language, they enable it
in RentalWise first; the website never invents a key.

Never send a framework sentinel such as next-translate's `__default`, `router.locale` before you
mapped it, or an uppercase/regional tag. Validate every locale against the cached list before it
reaches a request and fall back to the default language when it is unknown (`pickLocale` in the
asset).

## 2. Resolving a TranslatedText

```json
"name": { "en": "Sea view villa", "fr": "Villa vue mer" },
"headline": { "en": null },
"description": { "en": "Three floors...\nSecond paragraph", "fr": "" }
```

- Only keys that were ever saved are present; a key may hold `null` or `""`. Treat both as
  missing. Records saved before a field became translatable may be a plain string: treat the
  string as the default-language value.
- Resolution order: **page locale → account default language (`is_default`) → first non-blank
  value → nothing**. Do not hard-code `en` as the only fallback; `en` is the usual default but an
  account can have another, and a site whose default is `fr` must fall back to `fr`.
- Never hide a record because one translation is missing. Render the fallback (optionally with
  a small "shown in English" note). The same rule applies to amenity names, location names,
  country names, bed and fee types, policies, room names, image descriptions and SEO fields.
- Flags per field (from the schema, see `references/translated-fields.md`): `html` fields
  (`rental_agreement.contents`) are rendered as HTML after sanitising; `multiline` fields
  (`description`, `house_rules`, `surroundings`, ...) are plain text with `\n`, so preserve line
  breaks; everything else is a single line.

`assets/translated-text.ts` is a dependency-free helper: `resolveTranslated(value, locale,
defaultLocale)`, `pickLocale(requested, offered, defaultLocale)`, `toBcp47(isoLocale)`. Copy it
next to the API client and use it everywhere a map is rendered; one helper, not ad-hoc `name.en`.

Resolve at render time from the full record. Cache API responses once (they contain all
languages) and cache rendered pages per locale.

## 3. Where a locale goes in a request

| Parameter | Behaviour (verified on the API) |
|---|---|
| `sort: [{ "field": "name", "direction": "asc", "locale": "fr" }]` | Sorts a TranslatedText field by that language. Omitted `locale` = default language. A locale the account has not enabled → 422 `{ "errors": { "sort.0.locale": ["The selected value is invalid."] } }`. |
| `where.conditions: [{ "field": "name", "contains": { "locale": "fr", "value": "villa" } }]` | TranslatedText fields take composed operators whose value is `{ locale?, value }`: `contains`, `not_contains`, `eq`, `not_eq` (single-line fields only), `is_null`, `not_null` (`{ "locale" }` only). Omitted `locale` = default language. Unknown locale → 422 on `where.conditions.N`. |
| `q: "villa"` | Free-text search matches the **default-language** `name` only. Fine for a destination type-ahead in the default language; for another language use `contains` with a `locale`. |
| header `x-locale: fr` | Translates the API's validation messages (`errors[*][]`, top-level `message`). Available for `en`, `fr`, `pt`, `ro` today; other values answer in English. Useful when you surface 422 messages to visitors; your own messages are still better. Not required for content, which always arrives in all languages. |

Nothing else takes a language. `property/search`, `property/get-quote`, `property/create-booking`,
`inquiry/create` and the availability endpoints are language-neutral and return every translation
in the record. There is no "give me French only" mode: the response is always the full map.

Sorting a list by name for a non-default language sorts by that language's text, so records
without a translation sort by `null` (first or last depending on the database). If that bothers
the page, sort in your own code after resolving the names.

## 4. URLs, SEO and per-language pages

- `seo.slug` (properties, locations, collections) is **one string shared by all languages**;
  there is no slug per language. Language goes into the URL as a path prefix or a host, never
  into the slug: `/properties/sea-view-villa` (default language, unprefixed) and
  `/fr/properties/sea-view-villa`. Some slugs carry a language prefix the customer typed
  (`en-caribbean-escape`); treat it as opaque text.
- Default language unprefixed, every other offered language prefixed, one canonical per
  language, and `<link rel="alternate" hreflang="...">` for each offered language plus
  `x-default` pointing at the default-language URL. Generate alternates only for the languages
  the site offers, not for the 29 the PMS supports.
- `<html lang>` is the page locale (`fr`), or the BCP 47 tag from `iso_locale` (`fr-FR`). Never
  a sentinel like `__default`.
- `seo.title`, `seo.meta_description` and `seo.meta_keywords` are TranslatedText: resolve them
  with the same rule, and build the fallback meta (name + short description) in the same locale.
  Structured data (JSON-LD) uses the resolved texts and `inLanguage: "<locale>"`.
- Static generation: pre-render the default language; render other languages on demand or
  pre-render only the offered ones. Include the locale in every page or fragment cache key.
- The booking and payment pages are usually not indexed, but they still render in the page
  locale and keep the prefix through redirects (quote → booking → payment).

## 5. Out of scope: the website's own texts

This skill covers text that comes from RentalWise. Labels, buttons, form copy, validation
messages and any other text the website itself adds are translated by whoever owns the website
project; the API has nothing for them that a standalone site may use (`website-translation` and
`website-channel/*-translations` belong to sites hosted by the RentalWise website builder, see
`rentalwise-api-auth` section 6). Two PMS facts that touch this boundary:

- `iso_locale` (`fr_FR`) from `language/query` is the tag to hand to `Intl` or `<html lang>`
  after turning `_` into `-` (`toBcp47` in the asset). Prices follow the selected currency's
  `iso_code`, not the language.
- `create-booking` has no language argument and cannot set the guest account's
  `preferred_language`. If the customer wants the booking language recorded, put the page locale
  in the booking `metadata` (`{ "locale": "fr" }`). Guest emails from the PMS follow the
  account's own notification settings.

## Checklist

- `language/query` cached; offered languages ⊆ account languages; default = `is_default`.
- One `resolveTranslated` helper used for every TranslatedText (names, descriptions, amenities,
  locations, countries, bed/fee types, policies, rooms, images, videos, SEO, rental agreement).
- Fallback chain is page → default → any; no record is hidden for a missing translation.
- Every `locale` sent in `sort` or `where` is validated against the list; unknown → default.
- `q` only for default-language type-ahead; `contains` + `locale` otherwise.
- URL prefix for non-default languages, shared slug, canonical + hreflang + `x-default`,
  `<html lang>` set, locale in cache keys.
- No `website-translation` or `website-channel` calls; texts the website adds itself are not
  this skill's concern.
