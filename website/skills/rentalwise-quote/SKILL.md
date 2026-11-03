---
name: rentalwise-quote
description: How to price a stay through the RentalWise API on a custom website - the quote box / "check availability" widget on the property page (property/get-quote with dates, guests, currency and coupon code), the price breakdown (accommodation, fees, taxes, discounts, total, security deposit), re-quoting on every change, the not-available and rule-violation errors, the "book now" vs "request to book" call to action and the hand-off to the booking page, plus inquiries / "ask a question" / contact forms (inquiry/create) when the dates are not available or the property is inquire-only. Use this skill whenever a website built on RentalWise (One Mineral PMS; also projects still on the deprecated @onemineral/pms-js-sdk, which these skills replace with plain HTTP) needs a price box, a "check availability" or "get a quote" button, a total for selected dates, coupon support or an enquiry form, even when the user only mentions showing a price. The booking page itself (guest form, create-booking) is rentalwise-booking. Requires the client from rentalwise-api-auth and the property loaded as in rentalwise-property-details.
---

# Quote

The quote is the price box on the property page: the guest picks dates and guests, the site
shows what the stay costs, and the button leads to the booking page.

```
dates + guests chosen  →  property/get-quote  →  show price breakdown  →  "Book now" / "Request to book"
        │ (any change: dates, guests, coupon, currency → re-quote)                 │
        ├─ not available  →  other dates, or an inquiry (inquiry/create)            ▼
        └─ rule violated  →  the rule's message                        booking page (rentalwise-booking)
```

Every call here runs server-side with the token (see `rentalwise-api-auth`). Browser code calls
your own route, e.g. `POST /api/quote`, and sends only user input: dates, guests, coupon,
currency. The route adds `property` (validated) and the token and returns the breakdown. The
quote's `quote_id` is made for the browser and safe to send; the API token is not.

## 1. Request

```json
POST property/get-quote
{
  "property": 12,
  "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
  "adults": 2,
  "children": 1,
  "babies": 0,
  "pets": false,
  "currency": { "iso_code": "EUR" },
  "coupon_code": "SUMMER10"
}
```

Required: `property`, `daterange`, `adults`. Send `coupon_code` only when the visitor entered
one. Do not send `channel`, `total_accommodation`, `fees`, `commission_*`, `force` or `ignore`
from a website; `channel` is for OTA-style integrations and the rest let a caller override
pricing and rules and belong to back-office tools. `references/quote.md` has every parameter.

The dates, guests and coupon normally come from the property page URL
(`?checkin=2026-07-10&checkout=2026-07-17&adults=2&children=0`, see
`rentalwise-property-details` "Linking to the booking flow"); the quote box reads them, writes
its changes back to the URL and the booking page receives the same parameters (section 5).

## 2. Response: the price breakdown

`references/quote.md` has the full shape; the fields a website uses:

| Field | Use |
|---|---|
| `quote_id` | Opaque id of this exact price. The booking page passes it to `create-booking` so the guest pays what they saw. |
| `total` | Amount the guest will be charged in `currency.iso_code` (taxes and fees included). |
| `total_accommodation`, `total_fees`, `total_taxes`, `total_discount`, `total_before_discount` | Summary lines. |
| `products[]` | Line items: accommodation, each fee, discounts; each with `name`, `type`, `total`, `line_items[]`, `taxes[]`. Render these as the breakdown instead of hand-building one. |
| `security_deposit`, `security_deposit_currency` | Refundable deposit authorised separately; show it, do not add it to `total`. |
| `exceptions`, `warnings` | Rule violations / notices. Show warnings; a non-empty `exceptions` means not bookable as-is. |
| `search_criteria` | Echo of the request; the booking page reuses it when building the booking payload. |
| `property` | The full property record, trimmed to the fields the key's role may read like any other record (`rentalwise-api-auth` section 4); the booking page can use it instead of loading the property again. |

Show `product.total` (tax-inclusive) per line and `quote.total` as the grand total; offer a
details view with `line_items` and `taxes` when a product has more than one of them. Discounts
have negative totals. A per-night figure is `total_accommodation` divided by the nights, and
only if the customer wants one; never derive it from rates.

## 3. When to re-quote

Re-quote whenever dates, guests, coupon or currency change. Debounce typing in the coupon
field, but never show a total that was computed for different parameters. Quotes are not
cached by the API and should not be cached by the website: rates, availability and coupons
change in the PMS at any time. The booking page quotes again when it opens (section 5), so the
price box does not need to keep its quote fresh beyond the current view.

`quote_id` has no expiry time. It is a hash of the request (property, dates, adults, children,
babies, pets, coupon, currency) and of the computed totals, so it stays valid for as long as
quoting the same parameters yields the same total. When rates, availability, fees or the coupon
change in the PMS, `create-booking` recomputes the hash, finds a different one and answers 422
`quote_id` ("The pricing for this property has expired."). The booking page re-quotes on open to
carry the current price, not because of a clock.

## 4. When the quote fails

The API answers 422 with `errors` keyed by rule name. Treat the keys `rates_defined`,
`availability` and `property_booked` as "not available for these dates": show one friendly
message and offer other dates or an inquiry (section 6). They often arrive together, e.g.

```json
{ "message": "The given data was invalid.",
  "errors": { "rates_defined": ["No rates are defined for the selected dates."],
              "availability": ["The property is not available for the selected dates."] } }
```

Any other keys (`min_stay`, `max_occupancy`, `children_allowed`, `min_prior_notify`,
`coupon_code`, `daterange.start`, ...) carry a specific message in `errors[key][0]`; show it
verbatim, and show it even when a not-available key is also present (a guest who picked too
many people should learn that, not just "unavailable"). An invalid `coupon_code` is such a
key: keep the breakdown without the coupon visible when you can (re-quote without it) and show
the coupon message next to the field. Working error-handling code and the list of rule keys are
in `references/quote.md`.

Return the "not available" outcome with a 200 from your own route, as data, and reserve 5xx for
real failures; the UI then distinguishes "pick other dates" from "try again later".

Send the header `x-locale: <locale>` (a two-letter code; `en`, `fr`, `pt`, `ro` are translated
today, others answer in English) when you show the API's own validation messages to visitors;
mapping the error keys to your own translated strings is still the better default. With the
client asset: `rw.post('property/get-quote', params, { headers: { 'x-locale': locale } })`.

The availability calendar of `rentalwise-property-details` prevents most not-available quotes:
grey out blocked nights and enforce the minimum stay before the guest asks for a price.

## 5. The call to action and the hand-off to the booking page

The button label and the promise it makes come from the property's policy:

| `policies.booking_category` | Label | What happens on the booking page |
|---|---|---|
| `instant_booking` | "Book now" | The booking is confirmed as soon as the first payment succeeds. |
| `request_to_book` | "Request to book" | The host accepts or rejects; payment usually follows acceptance. |

A property the customer only wants enquiries for (no online booking) gets an "Ask about this
property" button and the inquiry form of section 6 instead of a quote box.

The button links to the booking page with the search criteria only: check-in, check-out,
adults, children, babies, pets, coupon and currency, as URL parameters or in the same client
state the property page uses. Carry no prices and no `quote_id` is needed: the booking page
calls `property/get-quote` again on the server when it opens, and that fresh `quote_id` is the
one `create-booking` receives (`rentalwise-booking` section 1). A `quote_id` in the URL is
harmless but useless: it is an opaque hash of the request, not a reservation. The quote box is
where the guest edits dates, guests, coupon or currency: the booking page shows them fixed in
its UI and links back here to change them (its URL parameters remain the input, and a new
URL means a new quote there).

`book_url` in the response is RentalWise's hosted booking page for this quote. A custom website
builds its own booking page with `rentalwise-booking`; the link is a valid fallback for a site
that has no booking page yet.

## 6. Inquiries ("ask a question", contact page, inquire-only properties)

```json
POST inquiry/create
{
  "inquiry_type": "guest",
  "contact_name": "Ana Pop",
  "contact_email": "ana@example.com",
  "contact_phone": "+40 7...",
  "message": "Is the pool heated in May?",
  "inquire_property": 12,
  "inquire_check_in": "2026-05-10",
  "inquire_check_out": "2026-05-17",
  "inquire_adults": 2,
  "inquire_children": 0,
  "conversion_website_url": "https://www.customer.com/property/sea-view-villa",
  "point_of_conversion": "property-page"
}
```

`contact_name` and `inquiry_type` are required. Validation errors come back as 422 with field
keys. Use this when a quote fails with "not available" (prefill the dates and guests the guest
had chosen), when the property is inquire-only, and for the generic contact form (omit the
`inquire_*` fields). Like every other call it runs from your own route; the browser sends the
form fields and the route adds `inquire_property`, `conversion_website_url` and
`point_of_conversion` itself.

## Security and correctness checklist

- [ ] The quote and the inquiry are created server-side; the browser only sends dates, guests,
      coupon, currency and the inquiry form.
- [ ] No `rentalwise.io/rest` URL, no `RENTALWISE_API_TOKEN` and no `Bearer` header exist in
      browser code or in the built client bundle.
- [ ] The breakdown is rendered from `products[]` and `total`; no price is computed from rates
      or search results, and `security_deposit` is shown outside the total.
- [ ] Every change of dates, guests, coupon or currency triggers a new quote; a stale total is
      never shown next to new parameters.
- [ ] `rates_defined`, `availability` and `property_booked` become one "not available" message
      with an alternative (other dates, inquiry); every other 422 key shows its own message.
- [ ] The button says "Book now" or "Request to book" according to `policies.booking_category`
      and links to the booking page with the search criteria only.
- [ ] Inquire-only properties and the contact page use `inquiry/create` with `inquiry_type: guest`.
