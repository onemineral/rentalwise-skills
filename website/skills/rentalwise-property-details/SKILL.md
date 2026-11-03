---
name: rentalwise-property-details
description: How to load and render a single vacation rental property from the RentalWise API for a custom website - the property page content (name, descriptions, images, videos, amenities, rooms and beds, policies, house rules, fees, reviews, map position, rental agreement, related properties), plus the availability calendar (blocked dates, minimum stay), seasonal/occupancy rates and applicable discounts. Use this skill whenever a website built on RentalWise (One Mineral PMS; also projects still on the deprecated @onemineral/pms-js-sdk, which these skills replace with plain HTTP) needs a property detail page, a date picker that greys out unavailable nights, or any field of a single property by slug or id. Requires the client from rentalwise-api-auth; for the price of a stay use rentalwise-quote and for the booking page rentalwise-booking.
---

# Property details page

## Loading the property

URLs usually carry the SEO slug. Resolve by slug when the segment is not numeric, by id when it is,
and canonicalise to the slug:

```json
POST property/query
{
  "where": { "conditions": [
    { "field": "seo.slug", "eq": "sea-view-villa" },
    { "field": "status", "in": ["enabled"] },
    { "field": "website_visible", "eq": true }
  ]},
  "paginate": { "page": 1, "perpage": 1 },
  "with": [
    "seo", "currency", "images", "videos", "property_type",
    "amenities.amenity_group",
    "rooms.beds.bed_type", "rooms.images",
    "policies", "rates_settings", "fees.fee_type",
    "reviews", "rental_agreement",
    "location.seo", "location.country",
    "related_properties.main_image", "related_properties.seo", "related_properties.currency"
  ]
}
```

Run this in the page's server-side loader (or a server component); the browser never queries
RentalWise itself. Take `data[0]`; an empty `data` is a 404. With a known id,
`property/fetch { id, with }` returns the record directly, and your code applies the same
`status` / `website_visible` check to it before rendering.

The `status` and `website_visible` conditions are the visibility guard of the page, and both
fields are guarded by the key's role (`rentalwise-api-auth` section 4). A role without them
makes this query answer 422 `where.conditions.N.field`; do not drop the conditions to make
the 422 go away, because a hidden property would then be reachable by slug. Have the customer
grant the key's role "View Property Configuration" and rerun the auth skill's smoke test.

Everything not listed in `with` is missing from the response, so extend the list when the page
shows more (`collections`, `discounts`, `floor_images`, `location.images`). So is every field
or relation the key's role may not read: `with` ignores such a relation silently and the field
is absent from the record, which is why the mapping below treats every field as optional. The
field reference with types and display notes is in `references/property-fields.md`.

Before handing the record to the page, map it to what the page renders and drop what visitors
must not see: `geo` (exact coordinates; use `display_geo`), `access_pin_code`,
`checkin_instructions` / `checkout_instructions` and their PDF links (post-booking content),
`ical_url` / `calendar_url` / `supplier_calendar_url`, the health-score fields, `internal_name`,
and `legal_entity` beyond the name and contact fields you show.

Cache the record (an hour is typical, e.g. incremental static regeneration with a 3600 s
revalidate). Availability and prices are never cached with it.

## Rendering rules that matter

- Text fields (`name`, `headline`, `short_description`, `description`, `house_rules`,
  `surroundings`, `unique_benefits`, `home_truths`) are TranslatedText. Resolve for the page
  locale, then the account's default language, then any non-blank value (helper and full field
  list in `rentalwise-languages-and-translations`). `description` is plain text with newlines (preserve them);
  `unique_benefits` and some others contain HTML, so render them as HTML after sanitising.
- Images: `images[]` ordered by `order`; `main_image` is the hero. Use `large` for galleries,
  `medium` for grids, `thumbnail` for small cards. Alt text: `image.description` or the property
  name. `videos[]` with `status === "finished"` have an `embed_url` for an iframe.
- Map: use `display_geo`, not `geo`. When `show_exact_address` is false the customer does not
  want the exact position shown; `display_geo` is already offset by a few hundred metres. Show
  `address` and `postcode` only when `show_exact_address` is true.
- Booking mode: `policies.booking_category` is `instant_booking` or `request_to_book`. It
  changes the call-to-action label and the booking status you get later.
- Occupancy: `max_occupancy` caps the guest picker (`max_adults`, `max_children` when set);
  `policies.children_allowed`, `babies_allowed`, `pets_allowed` hide or disable those counters.
  These booleans can be `null`, which means "not configured": treat as allowed and let the quote
  decide.
- Check-in and check-out: `policies.checkin_window { from, to }` and `policies.checkout_time`
  are hour numbers as strings (`"15"`) or `"flexible"`.
- Fees: `fees[]` with `fee_type.name`, `amount` or `percent`, `fee_type.charge_mode`
  (`per_stay`, `per_night`, `per_guest`, `per_guest_per_night`) and
  `fee_type.include_in_rent_subtotal`. Display them as "what is included"; the quote computes
  the exact amounts.
- Security deposit: `rates_settings.security_deposit` in `currency`. Show it near the booking
  CTA when > 0 so there is no surprise at payment.
- Minimum stay: `rates_settings.min_stay` is the default; the quote enforces per-period
  minimums.
- Size: `interior_size` / `exterior_size` are `{ sqm, sqft }`, either may be null.
- Reviews: `reviews[]` with `rating`, `title`, `review_content`, `name`, `reviewed_at`,
  `review_sentiment`. Aggregate numbers are on the property: `reviews_rating`, `reviews_count`.
- Rental agreement: `rental_agreement.contents` (TranslatedText, HTML). The booking form must
  show it and require acceptance when present; `rental_agreement_url` / `_pdf_url` are public
  links to the same document.
- Related properties: `related_properties[]` are chosen by the customer; render as cards when
  non-empty. `collections[]` comes by default and gives "part of: Beachfront" links.

## Availability calendar

Guests expect the date picker to grey out unavailable nights before they ask for a price.

```json
POST property/get-unavailability
{ "property": 12, "daterange": { "start": "2026-10-26", "end": "2029-10-26" } }
```

Expose this through a backend route the date picker fetches (for example
`GET /api/property/12/unavailability`); the component must not call RentalWise directly, since
that would put the token in the browser. The API returns a bare array of blocked periods
`[{ "start_date": "2026-12-20", "end_date": "2026-12-27" }]` (bookings and manual blocks), empty
when nothing is blocked. Request up to three years ahead once per page load and convert the
list into a full timeline of alternating available/unavailable ranges for the picker, merging
overlapping blocks. The algorithm and an example are in `references/availability.md`.

Rules for the picker:

- Check-in cannot be before today, and `policies.min_prior_notify` (days, `"0"`..`"7"`) pushes
  the first selectable day forward; `policies.max_booking_window` (months) caps how far ahead.
  "Today" for the API is the UTC calendar date (an earlier check-in is a 422), so compute it in
  UTC rather than from the visitor's or the property's local clock; around midnight they differ.
- A blocked range's `end_date` is the last blocked night; checkout on the day after is fine
  (and check-in on a `start_date` of a block is not).
- Minimum stay comes from `rates_settings.min_stay` for a quick hint in the picker; the quote is
  the authority and will reject a too-short stay with a 422 you must display.

Do not use the calendar response to compute prices. When both dates are set, ask for a quote.

## Seasonal and occupancy-based rates (optional)

Some properties price by number of guests per season (`price_type ===
"occupancy_based_pricing"`). Only for those, call from the server
`property/get-occupancy-rates { "property": 12, "limit": 500, "currency": "EUR" }`, described in
`references/availability.md`. On a `daily_pricing` property the call fails with a 500
`response_exception` ("This action is not available for the price type of the property"), so
check `price_type` first.

`property/get-applicable-discounts { "id": 12, "daterange": {...} }` lists promotions and
length-of-stay discounts for a period if you want to advertise them (empty array when none).
Daily-priced properties have no public per-night rate endpoint that a website should depend on;
show `marketing_price` as the "from" price when it is > 0 and let the quote produce the real
total.

## Linking to the booking flow

Keep check-in, check-out, adults, children and coupon in the property page URL
(`?checkin=2026-07-10&checkout=2026-07-17&adults=2&children=0`). The quote box reads them, and
the booking page receives them unchanged. The `rentalwise-quote` skill (price box) and then `rentalwise-booking` (booking page) continue
from there.
