# Services (extras, add-ons, upsells) in detail

Everything a website needs to sell the host's services on top of the stay. Four `service/*`
endpoints and one `booking/*` endpoint; the service records themselves are managed in the PMS
and a website only reads them. All calls run server-side (`rentalwise-api-auth`).

| Endpoint | When | Prices in |
|---|---|---|
| `service/query-available` | dates + guests known; catalogue for the stay | property currency (estimates) |
| `service/price-services` | a selection on the checkout page, against a quote | quote currency (authoritative) |
| `property/create-booking` with `services` + `services_quote_id` | booking creation | booking currency |
| `service/price-services-for-booking` | extras step: cards for an existing booking | `booking_*` fields in the booking currency |
| `service/price-for-booking` | extras step: one configured service | `booking_*` fields in the booking currency |
| `booking/add-services` | extras step: add the selection to the booking | booking currency |

`service/query`, `service/fetch`, `service-type/query` and `service-request/*` exist too; a
website does not need them. `service-request/create` is the staff path (it takes a price from
the caller) and must not be used from a website.

Availability of these actions depends on the PMS release: `scripts/schema.py actions service`
must list `query-available`, `price-services`, `price-for-booking` and
`price-services-for-booking`. Validation messages of this module are not translated by
`x-locale` (except the expired-quote one), so map the keys below to your own strings.

## How the PMS prices a service

A service has a unit price in its own currency (`currency_iso`), optionally per season, and
optionally overridden per property. For a stay the engine resolves the unit price at the
service date (or at check-in when there is none), converts it to the target currency and
multiplies:

| `pricing_unit` | `multiplier` | Guest input | Notes |
|---|---|---|---|
| `per_stay` | 1 | none | Price fixed at the check-in date. |
| `per_night` | nights | none | Each night at its own seasonal rate; `has_variable_pricing: true` when the rates differ within the stay. |
| `per_guest` | `guests_count` | `guests_count` ≥ 1 | Defaults to adults + children of the stay. |
| `per_guest_per_night` | `guests_count` × nights | `guests_count` ≥ 1 | Nightly rates summed, then × guests. |
| `per_hour` | `duration_hours` | `duration_hours` ≥ 1 | Defaults to 1 hour. |
| `per_unit` | `quantity` | `quantity` 1..`max_bookable_quantity` | The only unit where `quantity` > 1 is accepted. |

Other rules the catalogue already applied and the pricing/booking calls re-check:

- `status: enabled` on the service and on its link to the property (general services are
  attached to every property automatically; property-specific ones only where assigned).
- `available_months`: a dated service against its date, a `per_stay` one against the check-in
  month, every other unit against every month the stay spans.
- `min_lead_hours`: counted back from midnight of the service date (or check-in); past it the
  service disappears from the catalogue.
- Inventory: `max_quantity` per day, shared across properties or per property. A `per_guest*`
  service consumes `guests_count` units, any other consumes `quantity`. The catalogue reports
  what is left as `available_quantity` (null = unlimited) and `max_bookable_quantity`
  (the lower of what is left and `max_quantity_per_booking`).
- `is_price_estimate`: the price is indicative; the host quotes the final one. Such a service
  can be requested after the booking exists (`booking/add-services`) but not at checkout.
- `booking_mode`: `instant` lines are billed immediately (a booking product of type `service`,
  inside the totals); `request` lines wait for the host (`service_requests[]`, outside the totals).

## `service/query-available`

| Param | Type | Notes |
|---|---|---|
| `property_id` | number | Required. |
| `checkin_date`, `checkout_date` | `YYYY-MM-DD` | Required; checkout after checkin. |
| `guests_count` | number | Optional, ≥ 1, default 2. Send adults + children. Used for the `total_estimate` of `per_guest*` units. |

Response: a plain JSON array (no `data` envelope), empty when the property offers nothing for
this stay. One item:

```json
{
  "id": 9,
  "name": { "en": "Breakfast basket", "fr": "Panier petit-déjeuner" },
  "description": { "en": "<p>Fresh bread, pastries, fruit and juice delivered at 8:00.</p>" },
  "service_type": { "id": 2, "name": { "en": "Food & drinks" }, "description": null },
  "main_image": { "thumbnail": "https://…/thumb.jpg", "medium": "https://…/medium.jpg", "large": "https://…/large.jpg", "original": "https://…/original.jpg", "width": 1600, "height": 1067, "description": null },
  "is_featured": true,
  "booking_mode": "request",
  "pricing_unit": "per_guest_per_night",
  "is_price_estimate": false,
  "requires_service_date": false,
  "min_lead_hours": 24,
  "max_quantity_per_booking": null,
  "price": 12,
  "total_estimate": 252,
  "has_variable_pricing": false,
  "available_quantity": null,
  "max_bookable_quantity": null,
  "currency_iso": "EUR"
}
```

| Field | Use |
|---|---|
| `name`, `description`, `service_type.name` | Translated maps; resolve as in `rentalwise-languages-and-translations`. `description` is HTML. |
| `main_image` | May be null. Use `medium`/`large` for the card. |
| `is_featured` | The PMS switch "Display this service on the checkout page". |
| `booking_mode`, `is_price_estimate` | Label: instant and firm → charged now; `request` → "on request"; estimate → "price on request", only via the extras step. |
| `pricing_unit`, `requires_service_date`, `min_lead_hours`, `max_bookable_quantity` | Which inputs to show (table above). |
| `price` | Unit price at check-in, in `currency_iso` (the property currency). Show as "from" or "per night / per guest / per hour / per unit". |
| `total_estimate` | Total for the default selection (quantity 1, the stay's guests and nights, 1 hour). Good for a card; the authoritative number comes from `price-services`. |
| `has_variable_pricing` | Tell the guest the nightly rate changes during the stay. |
| `available_quantity` | Units left for the stay; say "only N left" when it is small. |

`pricing_notes` (the host's "per bike, per day" note) is not part of this projection; it
follows the service onto the booking's service requests and product lines, where the payment
page can show it.

## `service/price-services`

Parameters: every parameter you sent to `property/get-quote` (`property`, `daterange`,
`adults`, `children`, `babies`, `pets`, `bedrooms`, `currency`, `coupon_code`), plus:

| Param | Type | Notes |
|---|---|---|
| `quote_id` | string | Required. The API re-runs the quote with the other parameters and compares; a different result is 422 `quote_id`. |
| `services[]` | array | Required. `service_id` (required), `quantity` (default 1), `guests_count`, `duration_hours`, `service_date` (`YYYY-MM-DD`), each nullable. |

Response:

```json
{
  "quote_id": "8fc939b18bca120e000e1b6682d50e0bf87cfba5",
  "services_quote_id": "3b1c0d8f5e2a7c9b4d6e1f0a2b3c4d5e6f708192",
  "services": [
    { "service_id": 7, "name": { "en": "Airport transfer" }, "pricing_unit": "per_stay",
      "quantity": 1, "guests_count": null, "duration_hours": null, "service_date": null,
      "unit_price": 60, "total": 60, "currency_iso": "EUR",
      "booking_mode": "instant", "is_price_estimate": false, "has_variable_pricing": false },
    { "service_id": 9, "name": { "en": "Breakfast basket" }, "pricing_unit": "per_guest_per_night",
      "quantity": 1, "guests_count": 3, "duration_hours": null, "service_date": null,
      "unit_price": 12, "total": 252, "currency_iso": "EUR",
      "booking_mode": "request", "is_price_estimate": false, "has_variable_pricing": false }
  ],
  "total_services": 60,
  "currency_iso": "EUR"
}
```

`total_services` sums the instant lines only (60, not 312): the breakfast is requested, not
charged. Amount due now = `quote.total + total_services`. `services_quote_id` is a hash of
`quote_id` and the priced lines; `create-booking` recomputes it after re-pricing the lines and
rejects a mismatch.

422 keys:

| Key | Meaning | What to do |
|---|---|---|
| `quote_id` | the stay no longer prices the same ("The pricing for this home has expired.") | re-quote, then re-price |
| `services.<n>.service_id` | not offered at this property / not available for the dates / lead time passed | drop the line, refresh the catalogue |
| `services.<n>.service_date` | required for this service | show the date picker |
| `services.<n>.guests_count`, `services.<n>.duration_hours` | required for this unit | show the input |
| `services.<n>.quantity` | quantity above 1 on a non-`per_unit` service | clamp to 1 |
| `services` | per-booking cap exceeded, or no longer available (sold out) | message under the list, refresh the catalogue |

`<n>` is the index in the `services` array you sent.

## `property/create-booking` additions

| Param | Type | Notes |
|---|---|---|
| `services[]` | array | `service_id`, `quantity`, `guests_count`, `duration_hours`, `service_date`: the lines from the last `price-services` response, selection fields only. No `guest_request` here (use the extras step for notes). |
| `services_quote_id` | string | From the same response. Optional in the schema, always send it: without it the API bills whatever the lines price at now. |

Inside the booking transaction the API validates each line again (same keys as above), refuses
estimates with 422 `services.<n>.service_id` ("This service is priced on request and cannot be
booked online."), re-prices, and compares the hash: 422 `services_quote_id` ("The pricing for
this home has expired.") rolls the whole booking back, nothing is created. Instant lines become
`products[]` of type `service` (with `service_id`, `pricing_unit`, `items_count`,
`service_date`), request lines become `service_requests[]` with `status: "requested"`.

## `service/price-services-for-booking`

| Param | Type | Notes |
|---|---|---|
| `booking` | number | Required. |
| `services` | number[] | Required, max 200 ids. |

Returns an array of rows (one per id that exists; unknown ids are skipped), each the default
selection (quantity 1, the booking's guests and nights, 1 hour, the check-in date):

```json
[
  { "service_id": 11, "unit_price": 80, "total": 80, "multiplier": 1, "pricing_unit": "per_hour",
    "currency_iso": "EUR", "has_variable_pricing": false, "is_price_estimate": false,
    "booking_unit_price": 80, "booking_total": 80, "booking_currency_iso": "EUR" }
]
```

`unit_price`/`total` are in the service's own currency, `booking_unit_price`/`booking_total`
in the booking's: display the `booking_*` numbers, they are what the line is created at. The
endpoint does not filter by property or availability: feed it only ids that
`query-available` returned for the booking's property and dates.

## `service/price-for-booking`

| Param | Type | Notes |
|---|---|---|
| `booking`, `service` | number | Required. |
| `items_count` | number | Quantity (`per_unit`), ≥ 1. |
| `guests_count`, `duration_hours` | number | ≥ 1, when the unit needs them. |
| `service_date` | `YYYY-MM-DD` | When `requires_service_date`. |
| `pricing_unit`, `price` | | Staff overrides. Never forward them from a website. |

Same row as above without `service_id`. It is a display path with no guards: it prices a date
outside the stay or past the lead time without complaint and `add-services` then refuses it, so
validate the date on your side first (within `checkin`..`checkout`, not before
`now + min_lead_hours` rounded up to midnight).

## `booking/add-services`

| Param | Type | Notes |
|---|---|---|
| `booking` | number | Required. |
| `identifier` | string | Required. The `data` query parameter of `booking.payment_link` (also in `summary_url`). Wrong value → 404, same as an unknown booking. |
| `services[]` | array | Required, 1..50 lines: `service_id`, `quantity`, `guests_count`, `duration_hours`, `service_date`, `guest_request` (≤ 1000 chars), `expected_total`. |

Rules, in the order they are checked:

| 422 key | Meaning |
|---|---|
| `booking` | "Extras can no longer be added to this booking.": status not in `pending_payment` / `hold` / `pending_host_confirmation`, or `payment_status` not `unpaid`. Send the guest on to payment or thank-you. |
| `services.<n>.service_date` | outside `checkin`..`checkout` |
| `services.<n>.service_id` | already on the booking (any unit but `per_unit`), not offered at the property, not available for the dates, lead time passed |
| `services.<n>.quantity`, `.guests_count`, `.duration_hours` | as in `price-services` |
| `services` | per-booking cap, sold out |
| `services.<n>.expected_total` | "The price of this service has changed. Please review it and try again.": re-price and show the new amount |

The whole call is one transaction on the locked booking: a refused line adds nothing. On success
the response is the booking record (same shape as `create-booking`, `references/booking.md`)
with instant lines billed, `total`/`total_outstanding`/`next_payment_amount` recalculated and
request or estimate lines under `service_requests`. Estimates are accepted here (they stay
`requested` with the indicative price).

## Server routes (reference implementation)

The code below uses `rw.post()` from `rentalwise-api-auth/assets/rentalwise-client.ts` and the
error shape of `rentalwise-quote/references/quote.md`. Adapt the route plumbing to the framework.

```ts
// services.ts (server-only)
import { rw } from './rentalwise';
import { RentalWiseError } from './rentalwise-client';

export type PricingUnit = 'per_stay' | 'per_night' | 'per_guest' | 'per_guest_per_night' | 'per_hour' | 'per_unit';

export interface AvailableService {
    id: number;
    name: Record<string, string>;
    description: Record<string, string> | null;
    service_type: { id: number; name: Record<string, string> } | null;
    main_image: { thumbnail: string; medium: string; large: string } | null;
    is_featured: boolean;
    booking_mode: 'instant' | 'request';
    pricing_unit: PricingUnit;
    is_price_estimate: boolean;
    requires_service_date: boolean;
    min_lead_hours: number | null;
    max_quantity_per_booking: number | null;
    price: number;
    total_estimate: number;
    has_variable_pricing: boolean;
    available_quantity: number | null;
    max_bookable_quantity: number | null;
    currency_iso: string;
}

export interface ServiceSelection {
    service_id: number;
    quantity: number;
    guests_count?: number;
    duration_hours?: number;
    service_date?: string;
}

export function maxQuantity(s: AvailableService): number {
    if (s.pricing_unit !== 'per_unit') return 1;
    const caps = [s.max_bookable_quantity, s.max_quantity_per_booking].filter((n): n is number => n != null && n > 0);
    return caps.length ? Math.min(...caps) : Number.POSITIVE_INFINITY;
}

/** Which inputs a service needs before it can be priced. */
export function requiredInputs(s: AvailableService) {
    return {
        date: s.requires_service_date,
        hours: s.pricing_unit === 'per_hour',
        guests: s.pricing_unit === 'per_guest' || s.pricing_unit === 'per_guest_per_night',
        quantity: s.pricing_unit === 'per_unit' && maxQuantity(s) > 1,
        note: s.booking_mode === 'request' || s.is_price_estimate,
    };
}

/** Bookable from the checkout checkbox list: no date, no hours, a firm price. */
export function bookableAtCheckout(s: AvailableService): boolean {
    return !s.is_price_estimate && !s.requires_service_date && s.pricing_unit !== 'per_hour';
}

export async function availableServices(property: number, daterange: { start: string; end: string }, guests: number) {
    const list = (await rw.post('service/query-available', {
        property_id: property,
        checkin_date: daterange.start,
        checkout_date: daterange.end,
        guests_count: Math.max(guests, 1),
    })) as AvailableService[];
    return list; // return as-is to the browser: it is catalogue content
}

function validationError(e: unknown) {
    if (e instanceof RentalWiseError && e.statusCode === 422) {
        return { ok: false as const, status: 422, message: e.responseBody.message, errors: e.responseBody.errors ?? {} };
    }
    throw e;
}

// POST /api/services/price   body: { quoteParams, quote_id, services }
export async function priceServices(quoteParams: object, quote_id: string, services: ServiceSelection[]) {
    try {
        const priced = await rw.post('service/price-services', { ...quoteParams, quote_id, services });
        return { ok: true as const, priced };
    } catch (e) {
        return validationError(e);
    }
}

// Inside POST /api/book, after the guest form was validated (the complete route is assets/book-route.ts):
//   const booking = await rw.post('property/create-booking', {
//       ...quote.search_criteria, quote_id, guests: [mainGuest], source_name: SITE_NAME,
//       services: priced?.services.map(({ service_id, quantity, guests_count, duration_hours, service_date }) =>
//           ({ service_id, quantity, guests_count, duration_hours, service_date })),
//       services_quote_id: priced?.services_quote_id,
//   });

// ---- extras step, after the booking exists ----

const BOOKING_WITH = ['property', 'currency', 'products', 'service_requests', 'service_requests.service'];

export function isOpenForExtras(b: { status: string; payment_status?: string | null }) {
    const open = ['pending_payment', 'hold', 'pending_host_confirmation'].includes(b.status);
    return open && (!b.payment_status || b.payment_status === 'unpaid');
}

export function serviceIdsOnBooking(b: any): number[] {
    const ids = new Set<number>();
    for (const r of b.service_requests?.data ?? b.service_requests ?? []) if (r.service?.id) ids.add(r.service.id);
    for (const p of b.products?.data ?? b.products ?? []) if (p.type === 'service' && p.service_id) ids.add(p.service_id);
    return [...ids];
}

// GET /booking/extras/<ref>  -> loader
export async function extrasCatalogue(bookingId: number) {
    const booking = await rw.post('booking/fetch', { id: bookingId, with: BOOKING_WITH });
    if (!isOpenForExtras(booking)) return { booking, services: [], prices: {} };

    const onBooking = new Set(serviceIdsOnBooking(booking));
    const services = (await availableServices(booking.property.id, { start: booking.checkin, end: booking.checkout },
        booking.adults + (booking.children ?? 0))).filter((s) => !onBooking.has(s.id));

    const prices: Record<number, any> = {};
    if (services.length) {
        const rows = await rw.post('service/price-services-for-booking', { booking: booking.id, services: services.map((s) => s.id) });
        for (const row of rows) prices[row.service_id] = row; // show row.booking_total in booking.currency.iso_code
    }
    return { booking, services, prices };
}

// POST /api/booking/extras/price  body: { ref, service_id, options }
export async function priceExtra(bookingId: number, service_id: number, o: Omit<ServiceSelection, 'service_id'>) {
    const booking = await rw.post('booking/fetch', { id: bookingId });
    if (o.service_date && (o.service_date < booking.checkin || o.service_date > booking.checkout)) {
        return { ok: false as const, status: 422, message: 'service_date', errors: { service_date: ['The service date must fall within the stay.'] } };
    }
    const row = await rw.post('service/price-for-booking', {
        booking: booking.id, service: service_id,
        items_count: o.quantity, guests_count: o.guests_count ?? null,
        duration_hours: o.duration_hours ?? null, service_date: o.service_date ?? null,
    });
    return { ok: true as const, row }; // row.booking_total is the number to show and to send back as expected_total
}

// POST /api/booking/extras  body: { ref, services: (ServiceSelection & { guest_request?, expected_total? })[] }
export async function addExtras(bookingId: number, services: Array<ServiceSelection & { guest_request?: string; expected_total?: number | null }>) {
    const booking = await rw.post('booking/fetch', { id: bookingId });
    const identifier = new URL(booking.payment_link).searchParams.get('data'); // stays on the server
    try {
        const updated = await rw.post('booking/add-services', {
            booking: booking.id,
            identifier,
            services: services.map((s) => ({
                service_id: s.service_id, quantity: s.quantity,
                guests_count: s.guests_count ?? null, duration_hours: s.duration_hours ?? null,
                service_date: s.service_date ?? null, guest_request: s.guest_request ?? null,
                expected_total: s.expected_total ?? null,
            })),
        });
        return { ok: true as const, booking: updated }; // decide thank-you vs payment from `updated`
    } catch (e) {
        return validationError(e);
    }
}
```

`bookingId` comes from the page's hidden-id scheme (`rentalwise-payment-page` section 1); the
browser never sends a numeric booking id or the identifier. If the site uses RentalWise's own
pair (`?id=<booking id>&data=<identifier>`, the scheme of `payment_link`), the id is visible in
the URL and the `identifier` acts as the secret; that is an acceptable alternative when the
customer accepts a visible id.

## Displaying prices

- Checkout page: catalogue `price`/`total_estimate` in the property currency on the cards, the
  `price-services` lines in the quote currency once selected, `total_services` added to
  `quote.total`. When the quote currency differs from the property currency the two numbers
  differ: label the card as "from" and let the priced line be the one in the summary.
- Extras step: `booking_total` from the two `*-for-booking` endpoints, in the booking currency.
- Request-mode lines: price shown, marked "on request", never in the amount due.
- Estimates: "price on request" or "from <total_estimate>", no `expected_total`.
- `has_variable_pricing`: a short note that nightly rates vary over the stay.
- `pricing_notes` is absent from the catalogue; `name` and `description` are the texts to use.
