---
name: rentalwise-booking
description: How to create a booking through the RentalWise API on a custom website - the booking / checkout page that follows the quote box of rentalwise-quote: the fresh server-side quote the page opens with, the guest details form, create-booking for instant-book and request-to-book properties, holds, source and tracking, and what to do after the booking is created (thank-you page vs hand-off to the payment page from rentalwise-payment-page). Use this skill whenever a website built on RentalWise (One Mineral PMS; also projects still on the deprecated @onemineral/pms-js-sdk, which these skills replace with plain HTTP) needs a "book now", "request to book", checkout, booking form or any call to property/create-booking. The price box on the property page is rentalwise-quote; the payment page itself is rentalwise-payment-page. Requires the client from rentalwise-api-auth and the property loaded as in rentalwise-property-details.
---

# Booking

The booking page is where the guest lands after "Book now" / "Request to book" on the property
page (`rentalwise-quote` section 5). It receives the search criteria (dates, guests, coupon,
currency) and does everything from there to the created booking:

```
booking page opens with dates + guests  →  property/get-quote (server-side)  →  price summary
        ▼
guest details form  →  property/create-booking (quote_id)  →  booking record
        │
        ├─ next payment due later, or no online payment method  →  thank-you page
        └─ payment due now                                       →  payment page  (rentalwise-payment-page)
```

Every call here runs server-side with the token (see `rentalwise-api-auth`). Browser code calls
your own routes, e.g. `POST /api/quote` and `POST /api/book`, and sends only user input: dates,
guests, coupon, currency, the guest form. The route adds `property` (validated) and the token,
and returns the quote breakdown or a redirect target. The quote's `quote_id` is made for the
browser and safe to send it. The API token is not, and neither is the booking's numeric `id`
(section 4).

## 1. The page opens with a fresh quote

Quote again when the booking page renders, on the server, with the criteria the page received:
`property/get-quote` exactly as in `rentalwise-quote` sections 1 and 2 (request, breakdown,
`references/quote.md` of that skill for the full shape). The `quote_id` of this quote is the one
`create-booking` gets in section 3, and its `search_criteria` is the payload to build the
booking from. Ignore any `quote_id` the property page may have put in the URL: it is an opaque
hash of the request, not a reservation, and prices may have changed since.

Show the breakdown (`products[]`, `total`, `security_deposit` apart) read-only next to the form,
with the dates and guests fixed in the UI. Do not put pickers for the search criteria (dates,
guests, pets, coupon, currency) on the booking page. Everything on the page hangs off those
criteria: the quote and any validation already shown. Offer a "Change dates" link back to the
property page instead, carrying the current criteria, so the quote box there
(`rentalwise-quote`) is the place the stay is edited. The criteria themselves still live in the
URL (or the client state the property page hands over): the page quotes whatever it receives,
so a changed URL opens the page with a new quote. Re-quote again right before submitting the
form when the page has been open for a while: `quote_id` has no expiry time (it hashes the
request and the totals, `rentalwise-quote` section 3), but a rate or availability change since
the quote makes `create-booking` answer 422 `quote_id`, and a fresh quote turns that into a
visible price change instead of a failed submit.

When this quote fails, handle it as `rentalwise-quote` section 4 says: `rates_defined`,
`availability` and `property_booked` mean the dates went away since the guest saw the price
(send them back to the property page with a "no longer available" message and the inquiry
option), any other key shows its own message. The `property` record in the quote response is
the full property; use it for the summary, the rental agreement and `policies.booking_category`
instead of loading the property again.

## 2. Booking form

Collect for the main guest: first name, last name, email, phone, address, city, postcode,
country (id from `country/query`), optional company and VAT id. `create-booking` takes no
`city` or `postcode` for a guest (the API drops them silently), so join street, postcode and
city into the `address` string, one per line (`references/booking.md`). Show the property's rental
agreement (`rental_agreement.contents`) and require a checkbox when it exists. Summarise the
quote next to the form, read-only, with the dates and guests fixed (changing them means a new
quote). A free-text "message to the host" field maps to `guest_message`.

Persist the typed values in session storage keyed by property so a reload or a mobile tab
switch does not lose them.

## 3. Create the booking

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
- Arguments the key's role may not use are dropped silently, like unknown keys
  (`rentalwise-api-auth` section 4). If `hold`, `source_name` or `tracking` show no effect on
  the created booking, compare the payload with `schema.py args property/create-booking` run
  with this token before debugging the code.

The response is the booking record (`references/booking.md`). Do not return it to the browser.
The route decides where the guest goes next (section 4) and answers with a redirect target (or
`{ next: '/payment/<ref>' }` for a fetch-based form), nothing more. `assets/book-route.ts` is
that route end to end (input validation, the fresh quote of section 1, `create-booking`, the
decision of section 4 and the hidden-id redirect target); copy it next to
`rentalwise-client.ts` and `payment-page-loader.ts`. The status depends on the property's
policy:

| `policies.booking_category` | Resulting `status` | Meaning for the guest |
|---|---|---|
| `instant_booking` | `pending_payment` (or `hold` while on hold) | Confirmed as soon as the first payment succeeds. |
| `request_to_book` | `pending_host_confirmation` | The host accepts or rejects; payment usually follows acceptance. |

Label the submit button accordingly ("Book now" / "Send booking request"), as the property
page did (`rentalwise-quote` section 5).

422 on create means the quote no longer holds (dates taken, rule changed) or a guest field is
invalid; show `errors[key][0]` messages. For `quote_id` re-quote the same criteria on the
server and show the new price; when the dates themselves went away, send the guest back to the
property page to pick others (section 1).

## 4. After the booking: thank you or pay now

Decide in this order, in the same server route that created the booking:

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
   thank-you page. `legal_entity`, `status` and `show_on_website` are guarded by the key's
   role like every field (`rentalwise-api-auth` section 4): a role that may not read them
   makes the relation absent or the query a 422, and every guest silently lands on the
   thank-you page without paying. The asset logs that failure; if online payment never
   triggers, check `schema.py fields payment-method` and `schema.py fields property` with the
   project's token before touching the code.
3. Otherwise send the guest to the payment page. This includes request-to-book bookings
   (`pending_host_confirmation`) whose first step is due now: the widget captures the payment
   method and the page words the button as a request (`rentalwise-payment-page` section 3).

`assets/book-route.ts` implements the three steps (`nextStepAfterBooking`).

Both pages are built with `rentalwise-payment-page`, and both are addressed by a URL that does
not contain the booking id (that skill's section 1 leaves the hiding scheme to you and gives an
encrypted token as one example). Build that URL on the server right after `create-booking`;
the browser receives the redirect target and never the numeric id.

## 5. Payment

Everything from here on, the payment page, the widget, the retry and the thank-you page, is in
`rentalwise-payment-page`. Two reminders that belong to this side of the hand-off:

- `booking.payment_link` is RentalWise's hosted payment page. If the site redirects there
  instead of rendering its own page, do it with a server-side redirect from the booking route;
  do not return the link in JSON.
- A booking created with `hold: true` has `expires_at`; the payment page shows the deadline,
  so pass nothing about it through the URL.

## Security and correctness checklist

- [ ] The quote and the booking are created server-side; the browser only sends dates, guests,
      coupon, currency and the guest form.
- [ ] No `rentalwise.io/rest` URL, no `RENTALWISE_API_TOKEN` and no `Bearer` header exist in
      browser code or in the built client bundle.
- [ ] The booking page makes its own quote when it opens; its `quote_id` is passed to
      `create-booking` and prices are never sent from the client.
- [ ] `source_name` is set on `create-booking` so the customer can tell website bookings apart.
- [ ] The visibility guard on the booked property refuses what is readable and hidden, and the
      auth skill's smoke test confirmed the key's role reads `status` and `website_visible`;
      arguments and relations the role may not use were checked against `schema.py`.
- [ ] Request-to-book and instant-book are labelled differently and lead to the right
      post-booking message.
- [ ] The booking route answers with a redirect target that does not expose the booking id,
      and never the booking record; the next pages follow `rentalwise-payment-page`.
- [ ] Rental agreement acceptance is enforced when `rental_agreement` exists.
- [ ] Guest form values survive a reload (session storage).
