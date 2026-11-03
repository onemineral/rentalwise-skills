# Availability and rates endpoints

## `property/get-unavailability`

```json
{ "property": 12, "daterange": { "start": "2026-10-26", "end": "2029-10-26" }, "booked_only": false }
```

Response: a bare array of blocked periods (`[]` when nothing is blocked).

```json
[
  { "start_date": "2026-12-20", "end_date": "2026-12-27" },
  { "start_date": "2027-01-03", "end_date": "2027-01-05" }
]
```

`end_date` is the last unavailable night. The schema lists only these two fields; ignore any
extra keys. `booked_only: true` ignores manual blocks; a public site should leave it
false. `exclude_booking` is for modifying an existing booking.

### Turning blocks into picker ranges

Date pickers usually want a complete, ordered timeline. Reference algorithm (the one
RentalWise's own websites use):

1. Clamp each block to the requested period, drop blocks outside it, sort by start.
2. Merge blocks that overlap or touch (next start ≤ previous end + 1 day).
3. Walk a cursor from the period start: emit an available range up to the day before each
   block, then the block as unavailable, then continue from the day after the block. Emit a
   trailing available range to the period end.

Output used by the reference picker:

```json
[
  { "startDate": "2026-10-26", "endDate": "2026-12-19", "isAvailable": true,  "minStay": 1 },
  { "startDate": "2026-12-20", "endDate": "2026-12-27", "isAvailable": false, "minStay": 1 },
  { "startDate": "2026-12-28", "endDate": "2029-10-26", "isAvailable": true,  "minStay": 1 }
]
```

Checkout is allowed on the first day of an unavailable range (the guest leaves that morning);
check-in is not.

## `property/get-occupancy-rates`

For `price_type === "occupancy_based_pricing"` properties.

```json
{ "property": 12, "limit": 500, "include_past": false, "currency": "EUR" }
```

Response: an array of `property-occupancy-season` records:
`{ id, name, daterange: { start, end }, min_stay, is_incremental, notes, occupancy_rates: [{ occupancy, bedrooms, rates }] }`
where `rates` is a JSON structure of nightly prices for that occupancy (inspect a real response
before rendering; its layout depends on the length-of-stay template). Show these as a
"Seasonal rates" table when the customer enables it for the page. Calling this on a
`daily_pricing` property returns 500 `response_exception`; check `price_type` first.

## `property/get-applicable-discounts`

```json
{ "id": 12, "daterange": { "start": "2026-07-10", "end": "2026-07-17" } }
```

Response: `[{ daterange, discounts: [{ name, percent, amount, type: "discount" | "los_discount", los: { min_stay, percent } }] }]`.
Useful for "stay 7 nights, save 10%" badges. The quote applies them automatically.

## Endpoints to avoid on a public site

`property/get-rates-availability`, `property/rates-with-ranges` and `property/get-los-rates`
return the raw rate grid (nightly rates, min stays per day). They are heavy and expose pricing
internals; use `get-unavailability` for the calendar and the quote for prices.
