# `property/create-booking` and the booking record

## Parameters a website sends

| Param | Type | Notes |
|---|---|---|
| `property` | number | Required. |
| `quote_id` | string | From the latest quote. Locks the price the guest saw. |
| `daterange` | `{ start, end }` | Required; same as the quote. |
| `adults` | number | Required; same as the quote. |
| `children`, `babies`, `pets`, `bedrooms` | | Same as the quote. |
| `currency` | `{ iso_code }` or `{ id }` | Same as the quote. |
| `coupon_code` | string | Same as the quote. |
| `source_name` | string | Origin label shown in the PMS (site name or domain). |
| `guests` | array | Required, at least the main guest. Fields per the schema: `first_name`, `last_name`, `full_name`, `email`, `secondary_email`, `phone`, `secondary_phone`, `company`, `vat_id`, `address`, `country` (country id), `gender`, `birthdate`, `birth_year`, `notes`, `external_id`, `source`.* Additional guests can be added later via the online check-in. |
| `guest_message` | string | Free text from the guest to the host. |
| `hold`, `hold_hours` | boolean, number | Auto-expire the booking if unpaid after N hours. |
| `pending_expiration_hours` | number | Expiry for request-to-book awaiting host. Usually left to PMS defaults. |
| `tracking` | `{ utm_source, utm_medium, utm_campaign, utm_content, gclid, mclid, device, timestamp }` | Marketing attribution. Read UTM params from a first-touch cookie set by middleware. |
| `point_of_conversion` | string | Which page/CTA converted. |
| `metadata` | any | Your own JSON, stored with the booking. |
| `selected_payment_method` | number | Pre-select a payment method id (offline flows). |
| `allow_automated_processing` | boolean | Let the PMS charge scheduled payments automatically from the stored card; only relevant when a card is attached. |

\* `guests[]` has no `city` or `postcode` argument in the schema (the guest record itself has
them, but `create-booking` does not take them). Put the city and postcode on separate lines
inside `address` if the customer wants them stored. Re-check with
`scripts/schema.py args property/create-booking` after a PMS upgrade.

`create-booking` has no language argument: the API does not record which language the guest
booked in, and the guest account's `preferred_language` cannot be set from here. If the customer
wants it, put the page locale in `metadata` (`{ "locale": "fr" }`). Guest emails from the PMS
follow the account's own notification settings (`rentalwise-languages-and-translations`).

## Response: the booking record

```json
{
  "id": 9876,
  "uuid": "c1f1...",
  "status": "pending_payment",
  "booking_category": "instant_booking",
  "property": { "id": 12, "...": "..." },
  "currency": { "iso_code": "EUR" },
  "checkin": "2026-07-10", "checkout": "2026-07-17",
  "daterange": { "start": "2026-07-10", "end": "2026-07-17" },
  "length_of_stay": 7,
  "adults": 2, "children": 1, "babies": 0, "pets": false,
  "total": 2199, "total_pretax": 2010, "total_taxes": 189,
  "total_accommodation": 2079, "total_fees": 120,
  "total_paid": 0, "total_outstanding": 2199, "total_refunded": 0,
  "payment_status": "unpaid",
  "next_payment_due_date": "2026-05-26",
  "next_payment_amount": 659.7,
  "payment_link": "https://app.rentalwise.io/public/payment/...",
  "security_deposit_link": "https://app.rentalwise.io/public/security-deposit/...",
  "summary_url": "https://app.rentalwise.io/public/booking-summary/...",
  "expires_at": "2026-05-26 14:00:00",
  "expiration_hours": 2,
  "handles_payment": true,
  "main_guest": { "id": 555, "first_name": "Ana", "last_name": "Pop", "email": "ana@example.com" },
  "products": [ ... same shape as quote.products ... ],
  "payment_schedule_steps": [
    { "type": "on_reservation", "charge_percent": 30, "amount": 659.7, "amount_paid": 0, "is_paid": false, "due_date": "2026-05-26", "short_description": "Deposit" },
    { "type": "before_checkin", "days": 30, "charge_percent": 70, "amount": 1539.3, "amount_paid": 0, "is_paid": false, "due_date": "2026-06-10", "short_description": "Balance" }
  ],
  "coupon": { "name": "SUMMER10", "percent": 10 },
  "created_at": "2026-05-26 12:00:00",
  "updated_at": "2026-05-26 12:00:00"
}
```

Statuses: `hold`, `pending_payment`, `pending_host_confirmation`, `confirmed`, `completed`,
`cancelled`, `expired_hold`, `expired_host_confirmation`, `rejected_by_host`,
`voided_by_customer`, `relocated`.

`products` may come back as a plain array or as a paginated object `{ data: [...] }` depending
on how the relation was loaded; normalise before mapping. `payment_schedule_steps[].type` is
`on_reservation`, `before_checkin` or `installment`; the booking is fully paid when every step
has `is_paid: true` (`payment_status` says `paid` / `partial_paid` / `unpaid` too).

## Reading a booking back (payment and confirmation pages)

`booking/fetch { id, with: [...] }` returns the record; an unknown id answers HTTP 404
`{ "message": "Record not found" }`. `booking/query` with a condition on `id` returns it in the
paginated envelope and lets you add a `status` condition. `rentalwise-payment-page` covers
which relations to load, how to keep the id out of the URL, and what to send to the
browser. Never list or search bookings by email from a public route.

## Hold timing

`hold: true` with `hold_hours: N` sets `expires_at`. If the guest does not pay in time the PMS
moves the booking to `expired_hold` and frees the dates. Mention the deadline on the payment
page when `expires_at` is set.
