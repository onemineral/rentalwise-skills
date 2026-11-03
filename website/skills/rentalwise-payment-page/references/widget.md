# RentalWise payments widget

Source: https://apidocs.rentalwise.com/docs/rentalwise/a60fe84c7b53b-rental-wise-payments-widget-integration-guide
(fetched 2026-10-28). The first part is the guide; the second part is what the widget build
served by a PMS instance actually does, checked by reading `public/widget/script.js`.

## The official guide

### Step 1: obtain a client secret token

Server-side request:

```
POST https://app.rentalwise.io/rest/payment/create-client-secret
Content-Type: application/json
Authorization: Bearer {{ API_KEY }}

{
  "booking": BOOKING_ID,
  "return_url_ok": "SUCCESS_URL",
  "return_url_ko": "CANCEL_URL"
}
```

Response:

```json
{
  "data": {
    "client_secret": "CLIENT_SECRET",
    "instance": "INSTANCE_URL"
  }
}
```

Schema (`schema.py args payment/create-client-secret`): `booking` (id, required),
`return_url_ok` (url, required), `return_url_ko` (url, required), `security_deposit_only`
(boolean; a secret for authorising only the security deposit, not the stay).

### Step 2: include the widget assets

```html
<link rel="stylesheet" href="{{ INSTANCE_URL }}/public/widget/style.css">
<script type="module" src="{{ INSTANCE_URL }}/public/widget/script.js"></script>
```

### Step 3: render the widget

```html
<rw-booking-payment
  client-secret="{{ CLIENT_SECRET }}"
  booking-id="{{ BOOKING_ID }}"
  instance="{{ INSTANCE_URL }}"
  pay-button-label="Process payment"
  locale="en"
  show-offline-payment-methods="false"
></rw-booking-payment>
```

## Verified behaviour

| Topic | What the build does |
|---|---|
| `instance` value | The API returns the PMS host with a trailing slash, e.g. `https://app.rentalwise.io/`. The widget strips trailing slashes itself, so both `instance="https://host/"` and `https://host` work. For the asset URLs, strip the slash and append `/public/widget/script.js` and `/public/widget/style.css`. |
| Element registration | `rw-booking-payment`, a Preact component registered with `client-secret`, `instance` and `booking-id` as observed attributes (changing them re-renders) and no shadow DOM. |
| Other attributes | `locale` (default `en`), `pay-button-label` (default "Process payment"), `show-offline-payment-methods` (default off). Attribute values arrive as strings, so omit `show-offline-payment-methods` to keep offline methods hidden and set `"true"` to show them. |
| Init call | `POST {instance}/public/payments/init/{booking-id}` with `{ clientSecret, showOfflinePaymentMethods }`. The response lists the enabled payment methods, the amount and the currency; the widget renders the method chooser and the gateway's form. |
| Gateways | Stripe and Stripe Connect (loads `https://js.stripe.com/v3/`, renders the card element inline, handles 3-D Secure), Authorize.net and RazorPay (inline), Redsys, xMoney, PayPal, PayU.in, Netopia and EuPlatesc (redirect to the provider's hosted page; the guest returns through the return URLs). |
| Processing | `POST {instance}/public/payments/process/{booking-id}/{method-id}` with the gateway's payment data and the client secret. The PMS confirms the payment and the booking. |
| Success | Dispatches `document.dispatchEvent(new CustomEvent('rw:payment-finalized', { detail: <PMS response> }))`, then sets `window.location.href` to the redirect in the response (your `return_url_ok`). |
| Failure | Shows the error inline (`.rw-payment-error`) and keeps the form; a rotated client secret from the PMS is picked up automatically. Redirect gateways send the guest to `return_url_ko`. |
| Lifetime | The widget reloads the page after one hour, so the loader must create a fresh secret on every render. |
| Styling hooks | Classes `rw-payment-form-container`, `rw-payment-loading`, `rw-payment-error`, `rw-widget-book-now-link` (the pay button). Override them in your own stylesheet loaded after `style.css`. |
| Logging | The widget logs `instance` and `booking-id` to the console on mount; nothing secret. |

### Integration notes

- Load `script.js` with `type="module"` once per page. Frameworks that render on the server
  should append the tag on the client (`useEffect`, `onMount`) or through their head manager,
  and render the element only after the script has loaded if they rely on `customElements`.
- CSP: allow the instance origin in `script-src`, `style-src`, `connect-src` and `img-src`;
  allow `https://js.stripe.com` in `script-src` and `frame-src` for Stripe (and the equivalent
  domains of whichever gateway the customer enabled). Without CSP, nothing to do.
- Localisation: pass the page locale in `locale`; the pay button text comes from
  `pay-button-label`, so translate it in the website. Offline method names come translated from
  the PMS where translations exist.
- Testing without a gateway: a PMS without an enabled online payment method answers the init
  call with no methods and the widget shows a loading/empty state. The decision in
  `rentalwise-booking` section 6 (`payment-method/query`) exists so the guest is
  not sent to such a page.
