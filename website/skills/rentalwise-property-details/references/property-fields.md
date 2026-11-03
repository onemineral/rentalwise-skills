# Property record fields

Returned by `property/query`, `property/fetch` and (partially) `property/search`. Relations marked
"with" must be requested in `with`. Every field and relation is also subject to the key's
role: one the role may not read is absent from the record (no key, not `null`) and silently
skipped in `with`, so `scripts/schema.py fields property` run with the project's token is the
list that applies, not this page (`rentalwise-api-auth` section 4).

## Identity and text

| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `seo` (with) | `{ slug, title, meta_description, meta_keywords }` | `title`/`meta_*` are TranslatedText. Fallback meta: property name + short description, `main_image.medium` as social image. |
| `name` | TranslatedText | |
| `headline` | TranslatedText | One-liner. |
| `short_description` | TranslatedText | Teaser. |
| `description` | TranslatedText | Long text, newline separated paragraphs. |
| `unique_benefits` | TranslatedText | Often HTML. |
| `house_rules` | TranslatedText | |
| `home_truths` | TranslatedText | Honest caveats ("steep stairs"). |
| `surroundings` | TranslatedText | Neighbourhood text; fallback to `location.description`. |
| `checkin_instructions`, `checkout_instructions` | TranslatedText | Post-booking content; do not show publicly. |
| `registration_number`, `registration_number_jurisdiction` | string | Legal licence number some regions require on listings. |
| `status` | `enabled` / `pending` / `disabled` | Only `enabled` is public. Granted by "View Properties". |
| `website_visible` | boolean | Only `true` is public. Granted by "View Property Configuration", not by "View Properties": a key without it cannot filter on the field anywhere and never receives it. Check with the smoke test before building. |

## Facts

| Field | Type |
|---|---|
| `property_type` | `{ id, name: TranslatedText, original_name }` |
| `room_category_type` | `entire_home` / `private_room` / `hotel_room` / `shared_room` |
| `bedrooms`, `bathrooms`, `toilets` | number |
| `max_occupancy`, `comfortable_occupancy` | number |
| `interior_size`, `exterior_size` | `{ sqm, sqft }`, either null |
| `checkin_category` | `doorman_entry` / `lockbox` / `smartlock` / `keypad` / `host_checkin` / `other_checkin` |
| `price_type` | `daily_pricing` / `occupancy_based_pricing` |
| `marketing_price` | number or null, per night in `currency`; `0` means not set |
| `currency` | `{ id, iso_code, symbol }` |
| `reviews_rating`, `reviews_count` | number |

## Location

| Field | Type | Notes |
|---|---|---|
| `location` | Location | `name`, `description`, `country` (with `location.country`), `ancestors` (array or null), `seo` (with `location.seo`). |
| `address`, `postcode` | string | Show only when `show_exact_address`. |
| `geo` | Geo | Exact. Keep server-side. |
| `display_geo` | Geo or null | Use on maps. |
| `show_exact_address` | boolean | |

## Media (with)

| Field | Type | Notes |
|---|---|---|
| `main_image` | Image | Returned by default. |
| `images` | Image[] | Sorted by `order`. `tags` may label the room/view. |
| `floor_images` | Image[] | Floor plans. |
| `videos` | Video[] | `embed_url` (iframe), `thumbnail_url`, `title`, `description`, `order`, `status` (render `finished` only). |

## Amenities and rooms (with)

| Field | Type | Notes |
|---|---|---|
| `amenities` | Amenity[] | `name`, `is_featured`, `amenity_group.name`, `image`. Group by amenity group for the full list. |
| `rooms` | PropertyRoom[] | `name`, `description`, `type` (`bedroom` / `living_room`), `en_suite_bath`, `beds[] { bed_type { name, adults, children, babies }, bed_count, group }`, `images`. |

## Policies, rates settings, fees (with)

| Field | Type | Notes |
|---|---|---|
| `policies.booking_category` | `instant_booking` / `request_to_book` | |
| `policies.children_allowed`, `babies_allowed`, `pets_allowed`, `smoking_allowed`, `parties_allowed` | boolean or null | `null` = not configured; treat as allowed and let the quote decide. |
| `policies.checkin_window` | `{ from, to }` hour strings or `flexible` | |
| `policies.checkout_time` | hour string or `flexible` | |
| `policies.min_prior_notify` | `'0'`..`'7'` days (string) | |
| `policies.max_booking_window` | months | How far ahead a stay may start. |
| `policies.min_children_age`, `min_adults_age`, `adults_age_from` | number | |
| `policies.policy_description` | TranslatedText | Cancellation / house policy text. |
| `rates_settings.min_stay`, `max_stay` | number | |
| `rates_settings.changeover_days` | `'0'`..`'3'` | Weekday changeover rule, if the customer uses one. |
| `rates_settings.security_deposit` | number | In `currency`. |
| `rates_settings.base_occupancy`, `extra_guest_rate` | number | For occupancy-based pricing explanations. |
| `rates_settings.payment_schedule` | PaymentSchedule | Deposit/balance steps the booking will follow. |
| `fees` | PropertyFee[] | `fee_type { name, category, value_type, charge_mode, include_in_rent_subtotal, min_nights, max_nights }`, `amount`, `percent`. |
| `discounts` | Discount[] | `name`, `percent`, `amount`, `type` (`coupon` / `automatic`), `coupon_code` (do not display coupon codes publicly). |

## Social proof and legal (with)

| Field | Type |
|---|---|
| `reviews` | Review[] `{ rating, title, review_content, name, reviewed_at, review_sentiment, review_language }` |
| `rental_agreement` | `{ title, contents: TranslatedText }` |
| `rental_agreement_url`, `rental_agreement_pdf_url` | public URLs (no auth) |
| `brochure_url`, `calendar_url`, `ical_url` | public URLs |

## Relations for cross-linking (with)

| Field | Type |
|---|---|
| `related_properties` | Property[] (request `related_properties.main_image`, `.seo`, `.currency`) |
| `collections` | Collection[] |
| `tags` | Tag[] |
| `legal_entity` | `{ id, legal_name, business_name, phone, email, address, city, postcode, country }`: the company that invoices the booking. Needed for the payment-method check and the contact details on the thank-you page; do not expose `tax_id`. |
| `custom_fields` | free-form map the customer may use (e.g. a reviews widget script id); often `null` |

## Never shown to visitors

`geo`, `access_pin_code`, `checkin_instructions`, `checkout_instructions`,
`checkin_instructions_pdf_link`, `checkout_instructions_pdf_link`, `ical_url`, `calendar_url`,
`supplier_calendar_url`, `internal_name`, `external_id`, `score`, `health_score_*`,
`critical_score_*`, `last_statement_generated_at`, `scheduled_delete_at`.
