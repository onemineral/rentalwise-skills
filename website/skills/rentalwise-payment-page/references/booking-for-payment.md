# The booking as the payment page needs it

## Fetch

```json
POST booking/fetch
{
  "id": 9876,
  "with": ["property.main_image", "property.location", "property.legal_entity",
           "property.rental_agreement", "property.rates_settings",
           "products", "payment_schedule_steps", "currency", "main_guest"],
  "no_auto_relations": true
}
```

Returns the booking record (`rentalwise-booking/references/booking.md` has the
full example). The id comes from your URL scheme (SKILL.md section 1), resolved on the server. Unknown id → HTTP 404 `{ "message": "Record not found" }`; non-integer or zero id
→ 422 with `errors.id`. `booking/query` with `{ "where": { "conditions": [{ "field": "id",
"eq": 9876 }] } }` returns the same record inside the paginated envelope and `total: 0` for an
unknown id; use it when you want to add a `status` condition to the query instead of checking
the status in code.

## Fields the page uses

Every row below exists only when the key's role grants it (`rentalwise-api-auth` section 4):
`view-bookings` for the record, plus the guest-info, pricing, products and financials
abilities for the groups their names suggest. A missing field is absent from the record, a
relation the role may not load is ignored in `with`. `scripts/schema.py fields booking` with
the project's token is the authoritative list.

| Field | Purpose |
|---|---|
| `id` | Only for the widget's `booking-id` attribute and the `booking` argument of `create-client-secret`. Not in the URL, not in JSON responses. |
| `status` | Page state; see the table in SKILL.md section 2. Values: `hold`, `pending_payment`, `pending_host_confirmation`, `confirmed`, `completed`, `cancelled`, `expired_hold`, `expired_host_confirmation`, `rejected_by_host`, `voided_by_customer`, `relocated`. |
| `payment_status` | `unpaid`, `partial_paid`, `paid`, `refunded`. `paid` → nothing due. |
| `booking_category` | `instant_booking` or `request_to_book`; copy differs. |
| `next_payment_amount`, `next_payment_due_date` | Amount due now and when. `0`/`null` when nothing is scheduled. |
| `total_outstanding`, `total_paid`, `total` | Fallback amount, progress, grand total. |
| `currency.iso_code` | Currency of every amount on the booking. |
| `checkin`, `checkout`, `length_of_stay` | Stay. `checkin_time` / `checkout_time` are datetimes when the customer wants times shown. |
| `adults`, `children`, `babies`, `pets` | Party. |
| `products[]` | Price lines: `name` (string), `type` (`accommodation`, `fee`, `discount`, ...), `total`, `total_pretax`. Array in practice; guard for `{ data: [] }`. |
| `payment_schedule_steps[]` | `type` (`on_reservation`, `before_checkin`, `installment`), `short_description`, `due_date`, `amount`, `amount_paid`, `is_paid`, `charge_percent`, `days`. |
| `expires_at`, `expiration_hours` | Hold deadline (`hold` status). Datetime string `YYYY-MM-DD HH:MM:SS` in **UTC** (created as now + `hold_hours` on the UTC clock). Parse it as UTC and format it in the visitor's local timezone (`Intl.DateTimeFormat` with no explicit zone), or show "within N hours"; the account's own zone is `tenant.settings.timezone` in `settings/fetch` if the customer prefers that. |
| `security_deposit_status`, `security_deposit_link` | Deposit state; the link is a capability URL, keep it server-side. |
| `main_guest.first_name` | Greeting. Nothing else from `main_guest`. |
| `property.name`, `property.main_image.thumbnail` | Recognition. `name` is a translated map. |
| `property.bedrooms`, `bathrooms`, `max_occupancy` | Card line. |
| `property.location.name`, `property.address`, `property.show_exact_address` | Area; full address only when `show_exact_address` is true. |
| `property.rates_settings.security_deposit` | Deposit amount to announce when > 0 (in the property's `currency`). |
| `property.rental_agreement.contents` | Translated map; the terms the guest accepts by paying. |
| `property.legal_entity.legal_name`, `phone`, `email` | Contact block. Fields may be null. |

Not for the browser: everything else on `property` (`access_pin_code`, `checkin_instructions*`,
`checkout_instructions*`, `ical_url`, `calendar_url`, `geo`, health scores, `internal_name`,
`registration_number*`), the full `main_guest`, `payment_link`, `summary_url`,
`security_deposit_link`, `notes`, `concierge_notes`, `custom_fields`, `source_name`, totals
with `pm_share` in the name.

## Trimmed object

The shape `assets/payment-page-loader.ts` returns:

```ts
type PaymentPageBooking = {
  state: 'inactive' | 'nothing_due' | 'payable';
  ref: string;                        // the URL segment that stands for the booking, for links on the page
  status: string; paymentStatus: string; bookingCategory: string | null;
  checkin: string; checkout: string; nights: number;
  adults: number; children: number; babies: number; pets: boolean;
  currency: string;
  total: number; totalPaid: number; totalOutstanding: number;
  amountDue: number;                  // next_payment_amount || total_outstanding
  nextPaymentDueDate: string | null;
  expiresAt: string | null;
  lines: { name: string; type: string; total: number }[];
  schedule: { label: string; dueDate: string | null; amount: number; isPaid: boolean }[];
  guestFirstName: string | null;
  property: {
    name: Record<string, string> | string; image: string | null;
    bedrooms: number | null; bathrooms: number | null; maxOccupancy: number | null;
    area: string | null; address: string | null;   // address only when show_exact_address
    securityDeposit: number; securityDepositCurrency: string | null;
    rentalAgreement: Record<string, string> | string | null;
    contact: { name: string | null; phone: string | null; email: string | null };
  };
  widget: { clientSecret: string; instance: string; bookingId: number } | null;  // payable only
};
```

`widget.bookingId` is the one place the numeric id reaches the page, as the `booking-id`
attribute. The thank-you page uses the same loader with `withWidget: false`.
