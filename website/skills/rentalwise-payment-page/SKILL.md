---
name: rentalwise-payment-page
description: How to build the payment page a guest lands on right after a booking is created on a standalone RentalWise website - a URL that does not expose the booking id (how to hide it is the builder's choice; an encrypted token is given as one example), a server-side loader that fetches the booking by id with booking/fetch and sends the browser only what the page shows, the booking and property summary (dates, guests, price lines, amount due now, payment schedule, hold deadline, security deposit, host contact), the RentalWise payments widget (<rw-booking-payment>, payment/create-client-secret, return URLs), the failed-payment retry and the thank-you page. Use this skill whenever a website built on RentalWise (One Mineral PMS) needs a pay page, checkout completion, deposit payment, "pay now" link, payment retry, booking confirmation or thank-you page, or whenever someone wants to redirect to the booking's payment_link, embed Stripe or another gateway directly, or put a booking id in a URL. Requires the client from rentalwise-api-auth and a booking created as in rentalwise-booking.
---

# Payment page

After `property/create-booking` succeeds, the booking flow (`rentalwise-booking`
section 6) redirects the guest to a payment page. This skill is that page plus the thank-you
page it returns to. The page:

1. is reached by a URL that does not expose the booking id;
2. loads the booking and its property on the server, by id;
3. shows the guest everything they need to recognise the booking and the amount due;
4. takes the payment with the RentalWise payments widget (`<rw-booking-payment>`) and nothing
   else: no Stripe or gateway SDK of your own, no card fields of your own.

```
/payment/{ref}  →  ref → booking id (server, your scheme)  →  booking/fetch  →  page state
                                                                  ├─ not found / not payable  →  404 or "no longer active"
                                                                  ├─ nothing due              →  summary, no widget
                                                                  └─ amount due               →  payment/create-client-secret
                                                                                                  → summary + widget
widget success → return_url_ok = /payment/{ref}/thank-you
widget failure → return_url_ko = /payment/{ref}?status=ko   (fresh secret, retry notice)
```

Every API call runs on the server with the token (`rentalwise-api-auth` section 2). The browser
receives a trimmed booking object, the widget's `client_secret` and `instance`, and nothing else.

## 1. Hide the booking id in the URL

The API fetches a booking by its id, and the id is a small sequential integer. A page at
`/payment/9876` lets anyone open other guests' bookings by changing the number, so the id must
not appear in the URL. How you hide it is up to you; design it so that a visitor cannot open a
booking they did not create, and so that the guest can still come back to the page later from
a gateway redirect or an email in another tab. Resolve the URL to the id on the server, and
answer 404 without calling the API when the URL does not resolve.

Some ways to do it:

- encrypt or sign the id with a server-side secret and put the result in the path (the example
  in `assets/payment-page-loader.ts`, AES-256-GCM, base64url, stateless);
- store a random key next to the id in your own database or KV store when the booking is
  created, and look it up on each request;
- keep the id in a server-side session and use a per-booking random path segment.

A hash of the id alone (`sha1(id)`) is not enough on its own: ids are enumerable, so anyone can
compute the hash of the next one.

The widget itself needs the numeric id as its `booking-id` attribute (section 4). That id ends
up in the page markup, which is only reachable through the hidden-id URL, and knowing it gains
nothing because no route of the website accepts a raw id. Do not "simplify" this by putting
the id in the URL as well. Treat the URL as a capability: mark the page `noindex`, exclude it
from sitemaps, send `Cache-Control: no-store`, and do not print the URL in page content that
analytics scripts collect.

## 2. Loader and page states

Load on the server, per request (never cached, never static):

```json
POST booking/fetch
{
  "id": 9876,
  "with": ["property.main_image", "property.legal_entity", "property.rental_agreement",
           "property.rates_settings", "products", "service_requests", "service_requests.service",
           "payment_schedule_steps", "currency", "main_guest"],
  "no_auto_relations": true
}
```

`booking/fetch` returns the record, a 404 `{ "message": "Record not found" }` for an unknown id and a
422 for a non-integer id (verified). Derive the state:

| Condition (in order) | State | Page shows |
|---|---|---|
| URL does not resolve to an id, or `booking/fetch` fails | 404 | Not found. |
| `status` not in `hold`, `pending_payment`, `pending_host_confirmation`, `confirmed` | inactive | "This booking is no longer active" (expired hold, cancelled, rejected...), link to the property. |
| `payment_status` is `paid`, or amount due is 0 | nothing due | Booking summary with "nothing to pay now", next due date from `payment_schedule_steps`. |
| otherwise | payable | Booking summary + widget for the amount due. |

Amount due now = `next_payment_amount`, falling back to `total_outstanding` when the former is
null or 0 while `total_outstanding` > 0. Create the client secret only in the payable state,
and create a new one on every render: the secret is tied to the booking and the amount
currently due, and the widget reloads the page by itself after an hour.

`assets/payment-page-loader.ts` implements the lookup, the state and the trimming on top of
the client from `rentalwise-api-auth`, with the encrypted-token example as its URL scheme; swap
the two token functions for your own scheme if you chose another. Copy it next to
`rentalwise-client.ts`. The booking route (`rentalwise-booking/assets/book-route.ts`) imports
`encodeBookingToken` from this file to build its redirect target, so both sides share one
scheme. `references/booking-for-payment.md` has the fields that matter.

## 3. What the page shows

Everything comes from the loaded booking and its `property`; nothing is passed through the
URL or kept from the booking form.

Booking:
- `checkin`, `checkout`, `length_of_stay`, `adults`, `children`, `babies`, `pets`;
- price lines from `products[]` (`name`, `total`; `products` may be an array or `{ data: [] }`),
  `total` in `currency.iso_code`; lines of type `service` are extras the guest added and are
  already inside `total`;
- pending extras from `service_requests[]` (`name`, `quantity`, `total`, `pricing_notes`,
  `status: "requested"`), listed apart as "requested, confirmed by the host later" and not added
  to the amount due;
- `payment_schedule_steps[]` (`short_description` or `type`, `due_date`, `amount`,
  `is_paid`) so the guest sees deposit now / balance later;
- the amount due now, prominently, with wording by `status`: `pending_host_confirmation` means
  the card is only charged once the host accepts; `hold` with `expires_at` (UTC, see `references/booking-for-payment.md`) means "pay before
  {expires_at, formatted in the visitor's local time} or the dates are released";
- `main_guest.first_name` to address the guest. Nothing else from `main_guest`: the URL may be
  forwarded and the page must not leak the guest's email, phone or address.

Property:
- `name`, `main_image.thumbnail`, `bedrooms`, `bathrooms`, `max_occupancy`;
- the area (`location.name`, the city part of `address`) but the exact address only when
  `show_exact_address` is true, exactly like the property page;
- `rates_settings.security_deposit` when > 0: "a security deposit of X is authorised
  separately" (it is not part of the amount due);
- `rental_agreement.contents` as a link or modal next to the pay button ("by paying you accept
  the rental agreement"), when it exists;
- `legal_entity` `legal_name`, `phone`, `email` as the "questions? contact" block.

Strip the rest before sending the booking to the browser. The loaded `property` carries
`access_pin_code`, check-in instructions, calendar URLs and internal scores; `main_guest` is
the full guest record; `payment_link`, `summary_url` and `security_deposit_link` are capability
URLs of their own. The loader asset returns only the fields above.

## 4. The RentalWise payments widget

Official guide: https://apidocs.rentalwise.com/docs/rentalwise/a60fe84c7b53b-rental-wise-payments-widget-integration-guide
(`references/widget.md` reproduces it and adds what was verified against the widget build).

Server-side, in the loader, when the state is payable:

```json
POST payment/create-client-secret
{
  "booking": 9876,
  "return_url_ok": "https://www.customer.com/payment/<ref>/thank-you",
  "return_url_ko": "https://www.customer.com/payment/<ref>?status=ko"
}
```

Response (verified): `{ "data": { "client_secret": "p_...:...", "instance": "https://<pms-host>/" } }`.
`return_url_ok` and `return_url_ko` are required absolute URLs; build them from a configured
`SITE_URL` environment variable, never from the request's `Host` header. `instance` is the
PMS host the widget talks to and ends with a slash.

In the page, load the assets from `instance` and render the element:

```html
<link rel="stylesheet" href="https://<pms-host>/public/widget/style.css">
<script type="module" src="https://<pms-host>/public/widget/script.js"></script>

<rw-booking-payment
  client-secret="p_...:..."
  booking-id="9876"
  instance="https://<pms-host>/"
  locale="en"
  pay-button-label="Pay 659.70 EUR"
  show-offline-payment-methods="true"
></rw-booking-payment>
```

Facts about the widget (from its build, not assumptions):

- Attributes: `client-secret`, `booking-id`, `instance` (required; the element reacts when
  they change), `locale` (default `en`), `pay-button-label` (default "Process payment"),
  `show-offline-payment-methods`. Attribute values are strings: omit
  `show-offline-payment-methods` to hide bank-transfer style methods, set `"true"` to show them.
- It renders without shadow DOM, so `style.css` applies and your own CSS can restyle its
  `rw-payment-*` classes.
- It calls the PMS's public payment endpoints under `instance` with the `client_secret`; it
  never needs the API token.
- Card forms come from the configured gateway (Stripe loads `js.stripe.com`); some gateways
  (Redsys, PayPal, Netopia, PayU, xMoney, EuPlatesc) navigate to the provider's hosted page
  and come back through the return URLs. If the site sets a Content-Security-Policy, allow the
  instance origin for `script-src`, `style-src` and `connect-src`, and the gateway's domains
  for `script-src` and `frame-src`.
- On success it dispatches `rw:payment-finalized` on `document` (`event.detail` is the PMS
  response) and then navigates to `return_url_ok`. Use the event for analytics only; the
  thank-you page confirms the payment by re-reading the booking.
- In React, Vue or Svelte, add the `<script type="module">` tag once (a `useEffect` or
  `onMount` that appends it, or the framework's head manager) and render the element with
  kebab-case attributes; type the custom element if the framework complains.

Never load the widget from a URL that carries the API token, never put the token in an
attribute, and never submit card data to your own routes.

### The hosted alternative

`booking.payment_link` is RentalWise's own payment page for the booking. A site that must ship
with zero payment UI can redirect there instead of rendering the widget. It is a capability
URL: pass it as a server-side redirect, do not print it in the page or return it in JSON.

## 5. Retry and thank-you

- `/payment/{ref}?status=ko`: same page, same loader, plus a notice "the payment could not
  be processed, please try again or choose another method". The loader already created a
  fresh secret, so the widget is ready for a second attempt. Do not show gateway error details
  from the query string; the widget shows its own messages inline.
- `/payment/{ref}/thank-you`: resolve the same URL to the id, load the booking again (same loader,
  no secret). Show the summary and a message by state: `payment_status` `paid` or
  `partial_paid` and `status` `confirmed` → "booking confirmed, confirmation email sent";
  `pending_host_confirmation` → "the host will reply within X; your payment method is saved";
  still `unpaid` right after the return → "we are confirming your payment" with no second pay
  button (the PMS may finish processing a redirect-based gateway after the guest comes back);
  anything else → the generic summary. Include the `legal_entity` contact block and the next
  schedule step when one is unpaid.
- The booking flow also sends guests here directly when nothing is due at booking time
  (`rentalwise-booking` section 6). The same hidden-id URL serves both cases.

## Checklist

- [ ] The payment and thank-you URLs do not contain the booking id; no route accepts a numeric
      booking id, and the booking flow returns the page URL, not `id`, to the browser.
- [ ] The URL is resolved to the id on the server before `booking/fetch`; a URL that does not
      resolve is a 404 without an API call; any secret involved is a server-side environment
      variable.
- [ ] `booking/fetch` runs on the server per request; the browser receives the trimmed booking
      from `assets/payment-page-loader.ts` (or an equivalent): no `main_guest` beyond the
      first name, no property operational fields, no `payment_link` / `summary_url` /
      `security_deposit_link`.
- [ ] `payment/create-client-secret` is called server-side with absolute return URLs built from
      `SITE_URL`; only `client_secret` and `instance` reach the markup.
- [ ] The widget assets load from the returned `instance`; no gateway SDK is integrated
      directly and no card field exists in the site's own code.
- [ ] Page states: inactive, nothing due, payable, `?status=ko`, thank-you (paid, pending host,
      still processing) all have copy.
- [ ] Amount due = `next_payment_amount` with `total_outstanding` fallback; `expires_at` shown
      for holds; `security_deposit` shown as separate.
- [ ] The page is rendered per request, sent with `Cache-Control: no-store`, excluded from
      sitemaps and marked `noindex`.
