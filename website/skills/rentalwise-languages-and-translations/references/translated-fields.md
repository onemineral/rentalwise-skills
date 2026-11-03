# Translated fields by resource

Generated from the API schema (`POST settings/fetch` → `schema[resource].fields`, type
`translated-text`) on 2026-10-28. Regenerate after a PMS release with
`rentalwise-api-auth/scripts/schema.py fields <resource>` and look for `translated-text`.

Flags: **html** = contains HTML, sanitise and render as markup. **multiline** = plain text with
`\n` line breaks, preserve them. No flag = single line (also sortable and filterable with `eq`).

| Resource | Translated fields | Notes |
|---|---|---|
| `property` | `name`, `headline`, `short_description` (multiline), `description` (multiline), `house_rules` (multiline), `surroundings` (multiline), `unique_benefits` (multiline), `home_truths` (multiline), `checkin_instructions` (multiline), `checkout_instructions` (multiline) | `unique_benefits` and `home_truths` often contain HTML in practice although the schema flags them as plain multiline: sanitise and render as HTML when the text contains tags. `checkin_instructions` / `checkout_instructions` never go to the browser (`rentalwise-api-auth` section 8). `internal_name` is a plain string for staff; never show it. |
| `seo` (on property, location, collection via `with: ["seo"]`) | `title`, `meta_description`, `meta_keywords` | `slug` is a plain string shared by all languages. |
| `location` | `name`, `description` (multiline) | `ancestors[].name` and `parent_location.name` are the same type. |
| `country` | `name`, `region` | `iso_code_2` / `iso_code_3` are plain. |
| `collection` | `name`, `description` (multiline) | |
| `amenity` | `name`, `description` (multiline) | `original_name` is the untranslated catalogue name (plain string), useful as a stable key for icons. |
| `amenity-group` | `name` | `original_name` plain. |
| `property-type` | `name` | `original_name` plain. |
| `bed-type` | `name` | `original_name` plain. Reached through `rooms.beds.bed_type`. |
| `fee-type` | `name` | Reached through `fees.fee_type`. |
| `property-room` | `name`, `description` | `with: ["rooms"]`. |
| `property-policy` | `policy_description` | `with: ["policies"]`; the other policy fields are picklists and numbers. |
| `rental-agreement` | `contents` (html, multiline) | `with: ["rental_agreement"]`. Render as sanitised HTML in a modal; the booking form must link to it. |
| `currency` | `name` | `iso_code`, `symbol` plain. |
| `image` | `description` | Alt text. Falls back to the property name. |
| `video` | `title`, `description` | |

Not translated (plain strings or numbers): `quote`, `booking`, `inquiry`, `review`, `discount`,
`applicable-discount`, `property-fee` (the name comes from `fee_type.name`), `tag`,
`legal-entity`, `property-occupancy-season`, `availability-details`, `language` itself.

## Picklist values are keys, not text

Fields such as `property-policy.booking_category`, `property.status`, `booking.status`,
`fee.type` return machine keys (`instant_booking`, `pending_payment`). The API has no translated
label for them (the schema's `label` is English only); showing them in words is the website's
own text, outside this skill set.

## Values that look translated but are not

- `internal_name` on a property is the staff-facing name: plain, untranslated, not for visitors.
- `original_name` on amenities, groups, property types and bed types is the English catalogue
  name used as a stable identifier.
- `international_name` / `original_name` on `language` are plain strings (the English name and
  the native name of the language).
