---
name: rentalwise-booking
description: How to create a booking through the RentalWise API on a custom website - the booking / checkout page that follows the quote box of rentalwise-quote: the fresh server-side quote the page opens with, upselling extra services (airport transfer, cleaning, crib, breakfast, bikes - the catalogue for a stay, pricing by dates, guests, hours or quantity, services on the checkout page and an extras step after the booking exists), the guest details form, create-booking for instant-book and request-to-book properties, holds, source and tracking, and what to do after the booking is created (thank-you page vs hand-off to the payment page from rentalwise-payment-page). Use this skill whenever a website built on RentalWise (One Mineral PMS; also projects still on the deprecated @onemineral/pms-js-sdk, which these skills replace with plain HTTP) needs a "book now", "request to book", checkout, booking form, add-ons / extras / upsell step or any call to property/create-booking or booking/add-services. The price box on the property page is rentalwise-quote; the payment page itself is rentalwise-payment-page. Requires the client from rentalwise-api-auth and the property loaded as in rentalwise-property-details.
---

# Booking

The booking page is where the guest lands after "Book now" / "Request to book" on the property
page (`rentalwise-quote` section 5). It receives the search criteria (dates, guests, coupon,
currency) and does everything from there to the created booking:

```
booking page opens with dates + guests  →  property/get-quote (server-side)  →  price summary
        ▼
extras on the checkout page (optional)
        service/query-available  →  service/price-services  →  priced lines + services_quote_id
        ▼
guest details form  →  property/create-booking (quote_id, services, services_quote_id)  →  booking record
        ▼
extras step after the booking exists (optional)
        service/query-available  →  service/price-for-booking  →  booking/add-services  →  booking with new totals
        │
        ├─ next payment due later, or no online payment method  →  thank-you page
        └─ payment due now                                       →  payment page  (rentalwise-payment-page)
```

Every call here runs server-side with the token (see `rentalwise-api-auth`). Browser code calls
your own routes, e.g. `POST /api/quote`, `POST /api/services`, `POST /api/book`, and sends only
user input: dates, guests, coupon, currency, the selected services, the guest form. The route
adds `property` (validated) and the token, and returns the quote breakdown, the priced
services or a redirect target. Three things in this flow are made for the browser and are safe
to send it: the quote's `quote_id`, the priced services' `services_quote_id` and the service
catalogue. The API token is not, and neither is the booking's numeric `id` (section 6).

## 1. The page opens with a fresh quote

Quote again when the booking page renders, on the server, with the criteria the page received:
`property/get-quote` exactly as in `rentalwise-quote` sections 1 and 2 (request, breakdown,
`references/quote.md` of that skill for the full shape). The `quote_id` of this quote is the one
`create-booking` gets in section 4, and its `search_criteria` is the payload to build the
booking from. Ignore any `quote_id` the property page may have put in the URL: it is an opaque
hash of the request, not a reservation, and prices may have changed since.

Show the breakdown (`products[]`, `total`, `security_deposit` apart) read-only next to the form,
with the dates and guests fixed in the UI. Do not put pickers for the search criteria (dates,
guests, pets, coupon, currency) on the booking page. Everything on the page hangs off those
criteria: the quote, the service catalogue of section 2 (what is available depends on the
dates), every priced service line and its `services_quote_id` (a hash of `quote_id` and the
lines, so it dies with the quote), and any validation already shown. A change in place means
rebuilding all of it, and a selection kept from the old criteria is refused by
`create-booking`. Offer a "Change dates" link back to the property page instead, carrying the
current criteria, so the quote box there (`rentalwise-quote`) is the place the stay is edited.
The criteria themselves still live in the URL (or the client state the property page hands
over): the page quotes whatever it receives, so a changed URL opens the page with a new quote,
a reloaded catalogue and an empty service selection; never carry selected services across a
change of criteria. Re-quote again right before submitting the form when the page has been open for a while: `quote_id` has no
expiry time (it hashes the request and the totals, `rentalwise-quote` section 3), but a rate or
availability change since the quote makes `create-booking` answer 422 `quote_id`, and a fresh
quote turns that into a visible price change instead of a failed submit.

When this quote fails, handle it as `rentalwise-quote` section 4 says: `rates_defined`,
`availability` and `property_booked` mean the dates went away since the guest saw the price
(send them back to the property page with a "no longer available" message and the inquiry
option), any other key shows its own message. The `property` record in the quote response is
the full property; use it for the summary, the rental agreement and `policies.booking_category`
instead of loading the property again.

## 2. Extras on the checkout page (upselling services)

Services are what the host sells on top of the stay: airport transfer, mid-stay cleaning, a
crib, breakfast, bikes, a chef. The PMS prices them for the exact stay (dates, nights, guests,
hours, quantity, season, currency) and `create-booking` takes the selection, so the website
never computes a service price itself. `references/services.md` has every parameter, field and
error key plus working route code; this section is the flow.

**Check the PMS release first.** `scripts/schema.py actions service` (from `rentalwise-api-auth`)
must list `query-available`, `price-services`, `price-for-booking` and
`price-services-for-booking`. If it only lists `create/update/fetch/query/delete`, the account
runs the older services module (a flat `price`, no availability and no pricing engine): skip
this section and section 5, and let guests mention extras in `guest_message` instead.

### The catalogue for a stay

```json
POST service/query-available
{ "property_id": 12, "checkin_date": "2026-07-10", "checkout_date": "2026-07-17", "guests_count": 3 }
```

`guests_count` is adults + children (babies do not count). The response is a plain array, not
a paginated envelope, of the services bookable for this stay at this property; disabled,
out-of-season, past-lead-time and sold-out services are already removed, so an empty array means
"no extras to offer". Each item carries the content (`name`, `description`, `service_type`,
`main_image`, all translated texts as in `rentalwise-languages-and-translations`), the rules
(`booking_mode`, `pricing_unit`, `is_price_estimate`, `requires_service_date`, `min_lead_hours`,
`max_bookable_quantity`, `available_quantity`) and an estimate (`price` per unit,
`total_estimate` for the default selection, `has_variable_pricing`, `currency_iso`, the
property's currency). Call it together with the quote of section 1. The list and the prices are
specific to those criteria: when the page opens with different dates or guests (section 1), call
it again and start the selection from scratch.

What the guest has to choose depends on `pricing_unit`:

| `pricing_unit` | Total is | Input the guest provides |
|---|---|---|
| `per_stay` | unit price | nothing |
| `per_night` | sum of the nightly price over the stay | nothing (nights come from the stay) |
| `per_guest` | unit price × `guests_count` | `guests_count` (prefill adults + children) |
| `per_guest_per_night` | nightly price summed over the stay × `guests_count` | `guests_count` |
| `per_hour` | unit price × `duration_hours` | `duration_hours` ≥ 1 |
| `per_unit` | unit price × `quantity` | `quantity`, 1..`max_bookable_quantity` (null = unlimited) |

`quantity` above 1 is refused for every unit except `per_unit`. `requires_service_date: true`
adds a date picker limited to the stay (`checkin`..`checkout`) and not earlier than
`min_lead_hours` from now. `booking_mode: "request"` lines are shown with their price but
labelled "on request": the host confirms them later and they are not charged now.
`is_price_estimate: true` services have no firm price and cannot go through `create-booking`.

Two flags decide where a service is offered. `is_featured` is the PMS switch "Display this
service on the checkout page". The reference implementation lists on the checkout page the
featured services that need neither a date nor hours and are not estimates (a checkbox list with
a quantity stepper for `per_unit` and a guest count for the `per_guest*` units), and moves
everything else to an extras step after the booking exists (section 5), where a date, a
duration, a free-text request and estimates are all possible. Keep that split unless the
customer asks for a single page: it keeps the checkout form short and `create-booking` cannot
bill an estimate anyway.

### Price the selection

```json
POST service/price-services
{
  "property": 12,
  "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
  "adults": 2, "children": 1, "babies": 0, "pets": false,
  "currency": { "iso_code": "EUR" },
  "coupon_code": "SUMMER10",
  "quote_id": "8fc939b18bca120e000e1b6682d50e0bf87cfba5",
  "services": [
    { "service_id": 7, "quantity": 1 },
    { "service_id": 9, "quantity": 1, "guests_count": 3 },
    { "service_id": 4, "quantity": 2 }
  ]
}
```

Send exactly the parameters that produced the quote plus its `quote_id` and the selection:
the API re-runs the quote and answers 422 `{ "errors": { "quote_id": [...] } }` when the stay no
longer prices the same (re-quote, then re-price). The response is authoritative and in the quote
currency:

| Field | Use |
|---|---|
| `services[]` | One line per selected service: `service_id`, `name`, `pricing_unit`, the selection echoed, `unit_price`, `total`, `currency_iso`, `booking_mode`, `is_price_estimate`, `has_variable_pricing`. Render these under the quote breakdown. |
| `total_services` | Sum of the instant lines only. Show `quote.total + total_services` as the amount due; request lines stay outside it. |
| `services_quote_id` | Hash of the priced lines. Pass it to `create-booking` with the same `services`. |

Re-price whenever the selection, the guest count or the quote changes, and keep the submit
button disabled while a selection is unpriced. Line-level validation errors come back as
`services.<index>.<field>` keys (service not offered, not available for these dates, lead time
passed, `guests_count` or `duration_hours` missing, quantity above 1 on a non-unit service) and
a `services` key for the per-booking cap and sold-out cases; show the message next to the
service it concerns. Nothing about these prices is cached: they are computed per request.

## 3. Booking form

Collect for the main guest: first name, last name, email, phone, address, city, postcode,
country (id from `country/query`), optional company and VAT id. `create-booking` takes no
`city` or `postcode` for a guest (the API drops them silently), so join street, postcode and
city into the `address` string, one per line (`references/booking.md`). Show the property's rental
agreement (`rental_agreement.contents`) and require a checkbox when it exists. Summarise the
quote and the priced services next to the form, read-only, with the dates and guests fixed
(changing them means a new quote and a new price-services call).

Persist the typed values and the service selection in session storage keyed by property so a
reload or a mobile tab switch does not lose them.

## 4. Create the booking

```json
POST property/create-booking
{
  "property": 12,
  "quote_id": "8fc939b18bca120e000e1b6682d50e0bf87cfba5",
  "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
  "adults": 2,
  "children": 1,
  "currency": { "iso_code": "EUR" },
  "coupon_code": "SUMMER10",
  "services": [
    { "service_id": 7, "quantity": 1 },
    { "service_id": 9, "quantity": 1, "guests_count": 3 }
  ],
  "services_quote_id": "3b1c0d8f5e2a7c9b4d6e1f0a2b3c4d5e6f708192",
  "guests": [{
    "first_name": "Ana", "last_name": "Pop", "email": "ana@example.com", "phone": "+40 7...",
    "address": "Str. Lunga 1\n400001 Cluj", "country": 178,
    "company": null, "vat_id": null
  }],
  "guest_message": "We arrive late, around 22:00.",
  "hold": true,
  "hold_hours": 2,
  "tracking": { "utm_source": "google", "utm_campaign": "summer", "gclid": null },
  "source_name": "website"
}
```

- `quote_id` is effectively required: without it the API answers 422
  `{ "errors": { "quote_id": ["Required when none of total accommodation with fees / total accommodation are present."] } }`,
  and the alternative (sending totals yourself) is exactly what a website must never do.
- `daterange`, `adults`, `children`, `coupon_code` and `currency` must match the quote; take
  them from `quote.search_criteria` of the quote made in section 1.
- `services` and `services_quote_id` come straight from the last `price-services` response:
  the lines as `{ service_id, quantity, guests_count }` (plus `duration_hours` and
  `service_date` when you collected them) and the hash. The API re-prices the lines inside the
  booking transaction and refuses the whole booking with 422 `services_quote_id` when the hash
  no longer matches, so the guest is never charged a different amount than the one displayed.
  An estimate-priced service answers 422 `services.<index>.service_id` ("priced on request and
  cannot be booked online"). Omit both fields when nothing was selected.
- Instant services become billed `products[]` of type `service` and are included in the
  booking's `total`, `total_outstanding` and the payment schedule. On-request services become
  `service_requests[]` with `status: "requested"`, outside the totals, for the host to confirm.
- `guests[0]` is the main guest. The API creates the guest account and `booker` from it; no
  separate `booker` object is needed.
- `source_name`: a label the customer sees in the PMS as the origin of the booking. Use the
  site's name or domain so bookings from this website are recognisable.
- `hold` / `hold_hours`: when the customer wants abandoned-checkout bookings to expire
  automatically, set `hold: true` and the hours (1-72 h is a sensible range; agree the value
  with the customer, possibly different for instant and request-to-book). Omit both to create
  the booking without a hold.
- Everything not listed above (`status`, `total_*`, `card`, `payment_schedule`, `force`,
  `skip_host_confirmation`, `handles_payment`, `booking_category`) is for back-office or OTA
  integrations. A website that sends them can create unpaid or mis-priced bookings.

The response is the booking record (`references/booking.md`). Do not return it to the browser.
The route decides where the guest goes next (section 5 or 6) and answers with a redirect
target (or `{ next: '/booking/extras/<ref>' }` for a fetch-based form), nothing more.
`assets/book-route.ts` is that route end to end (input validation, the fresh quote of section 1,
service pricing, `create-booking`, the decision of section 6 and the hidden-id redirect
target); copy it next to `rentalwise-client.ts` and `payment-page-loader.ts`. The status
depends on the property's policy:

| `policies.booking_category` | Resulting `status` | Meaning for the guest |
|---|---|---|
| `instant_booking` | `pending_payment` (or `hold` while on hold) | Confirmed as soon as the first payment succeeds. |
| `request_to_book` | `pending_host_confirmation` | The host accepts or rejects; payment usually follows acceptance. |

Label the submit button accordingly ("Book now" / "Send booking request"), as the property
page did (`rentalwise-quote` section 5).

422 on create means the quote no longer holds (dates taken, rule changed), a service line was
refused or a guest field is invalid; show `errors[key][0]` messages. For `quote_id` re-quote
the same criteria on the server and show the new price; when the dates themselves went away,
send the guest back to the property page to pick others (section 1).

## 5. Extras after the booking exists

The second upsell moment is the page between `create-booking` and payment: the booking is
created, the amount is not charged yet, and the guest can still add a late check-out, a chef
for Tuesday evening, two hours of babysitting or anything priced on request. It is also the
place for every service the checkout page did not list. Skip it when `query-available` returns
nothing new.

The page is addressed like the payment page, by a URL that does not expose the booking id
(`rentalwise-payment-page` section 1). Its server route:

1. Loads the booking with `booking/fetch { id, with: ["property", "currency", "products",
   "service_requests", "service_requests.service"] }` and checks it is still open for extras:
   `status` in `pending_payment`, `hold`, `pending_host_confirmation` and `payment_status`
   empty or `unpaid`. Otherwise redirect straight to section 6's target.
2. Calls `service/query-available` with the booking's `property.id`, `checkin`, `checkout` and
   `adults + children`, and drops what is already on the booking: `service_requests[].service.id`
   and `products[]` with `type: "service"` by their `service_id` (plus the featured services the
   checkout page already offered, if you keep the split from section 2).
3. Prices the cards with one call, `service/price-services-for-booking { booking, services: [ids] }`,
   which returns a row per id with `booking_total` (the default selection in the booking
   currency; `total` is the same in the service's own currency). Pass only ids from step 2: this
   endpoint prices whatever it is given, with no property filter.
4. Prices a configured service, when the guest picks a date, hours, guests or a quantity, with
   `service/price-for-booking { booking, service, items_count, guests_count, duration_hours, service_date }`
   and shows `booking_total`. The call is a display path without guards: check yourself that
   `service_date` lies within `checkin`..`checkout` and after the lead time, and never forward
   `price` or `pricing_unit` (staff overrides) from the browser.
5. Adds the selection with one call:

```json
POST booking/add-services
{
  "booking": 9876,
  "identifier": "d41d8cd98f00b204e9800998ecf8427e",
  "services": [
    { "service_id": 11, "quantity": 1, "service_date": "2026-07-14", "duration_hours": 3,
      "guest_request": "Vegetarian menu please", "expected_total": 240 },
    { "service_id": 15, "quantity": 1, "expected_total": null }
  ]
}
```

`identifier` is the booking's own public secret: the `data` query parameter of
`booking.payment_link`, read on the server from the booking you just fetched. `expected_total`
is the `booking_total` the guest saw for a firm, instant line; the API refuses the add with 422
`services.<index>.expected_total` if the price moved. Leave it null for request-mode and
estimate lines. The response is the booking record with instant lines billed and the totals
recalculated, so the payment that follows charges the new amount; request and estimate lines
are `service_requests` for the host. Decide the next page from this returned record exactly as
in section 6. Other 422 keys: `booking` (no longer open for extras), `services.<index>.service_id`
(already on the booking, not offered, not available, lead time), `services.<index>.service_date`
(outside the stay); a wrong `identifier` is a 404.

Showing the step with nothing selected is a plain "continue" to section 6. The reference
implementation and complete route code are in `references/services.md`.

## 6. After the booking: thank you or pay now

Decide in this order, in the same server route that created the booking (or added the extras):

1. `booking.next_payment_due_date` is a future date (compare its `YYYY-MM-DD` with today's UTC
   date) → nothing is due today. Send the guest to the thank-you page: the payment schedule's
   first step is later, for instant-book and request-to-book alike.
2. Otherwise check that the property's legal entity has an online payment method the website
   may use. Load the legal entity explicitly (`property/fetch { id, with: ["legal_entity"],
   no_auto_relations: true }`; neither the property page's `with` list nor the quote's
   `property` is guaranteed to carry it), then:

   ```json
   POST payment-method/query
   {
     "where": { "conditions": [
       { "field": "legal_entity.id", "eq": 45 },
       { "field": "status", "in": ["enabled"] },
       { "field": "show_on_website", "eq": true }
     ]},
     "paginate": { "page": 1, "perpage": 1 },
     "no_auto_relations": true
   }
   ```

   A non-empty `data` means yes. Treat a missing legal entity or a failed call as "no" (the
   booking exists; the customer can still collect payment offline) and send the guest to the
   thank-you page.
3. Otherwise send the guest to the payment page. This includes request-to-book bookings
   (`pending_host_confirmation`) whose first step is due now: the widget captures the payment
   method and the page words the button as a request (`rentalwise-payment-page` section 3).

`assets/book-route.ts` implements the three steps (`nextStepAfterBooking`).

Both pages are built with `rentalwise-payment-page`, and both are addressed by a URL that does
not contain the booking id (that skill's section 1 leaves the hiding scheme to you and gives an
encrypted token as one example). Build that URL on the server right after `create-booking`;
the browser receives the redirect target and never the numeric id. The extras step of section 5
sits in front of this decision and uses the same URL scheme.

## 7. Payment

Everything from here on, the payment page, the widget, the retry and the thank-you page, is in
`rentalwise-payment-page`. Three reminders that belong to this side of the hand-off:

- `booking.payment_link` is RentalWise's hosted payment page. If the site redirects there
  instead of rendering its own page, do it with a server-side redirect from the booking route;
  do not return the link in JSON.
- A booking created with `hold: true` has `expires_at`; the payment page shows the deadline,
  so pass nothing about it through the URL.
- Services added as instant lines are already inside `total_outstanding` and
  `next_payment_amount`; the payment page lists them from `products[]` (type `service`) and
  lists pending `service_requests[]` separately as "requested, to be confirmed by the host".

## Security and correctness checklist

- [ ] The quote, the service pricing and the booking are created server-side; the browser only
      sends dates, guests, coupon, currency, the service selection and the guest form.
- [ ] No `rentalwise.io/rest` URL, no `RENTALWISE_API_TOKEN` and no `Bearer` header exist in
      browser code or in the built client bundle.
- [ ] The booking page makes its own quote when it opens; its `quote_id` is passed to
      `create-booking` and prices are never sent from the client.
- [ ] Service lines in `create-booking` are the ones from the last `price-services` response,
      with its `services_quote_id`; a selection is re-priced on every change and the submit
      waits for it.
- [ ] Request-mode and estimate lines are labelled "on request" and excluded from the amount
      due; estimates are never sent to `create-booking`.
- [ ] The extras step is only shown while the booking is unpaid and pending; `booking/add-services`
      gets `identifier` from the server-side booking record and `expected_total` for every firm
      instant line.
- [ ] `source_name` is set on `create-booking` so the customer can tell website bookings apart.
- [ ] Request-to-book and instant-book are labelled differently and lead to the right
      post-booking message.
- [ ] The booking route answers with a redirect target that does not expose the booking id,
      and never the booking record; the next pages follow `rentalwise-payment-page`.
- [ ] Rental agreement acceptance is enforced when `rental_agreement` exists.
- [ ] Guest form values and the service selection survive a reload (session storage).
