---
type: llm
focus: trace
weight: 1
---

The result matches this description: Quotes again on the server when the booking page opens (property/get-quote with property, daterange, adults, children, currency and coupon_code) and uses that quote's quote_id and search_criteria rather than anything carried in the URL; keeps dates and guests read-only in the booking page UI (a change goes back to the property page; the URL parameters stay the input and a new URL quotes again) instead of offering pickers there; renders products[] and total with security_deposit apart and handles a failed quote (not-available vs rule messages); create-booking receives quote_id, the quote's search criteria, a guests array with the main guest and a source_name, enforces rental agreement acceptance when present; afterwards it redirects to thank-you when next_payment_due_date is in the future or no online payment method exists (payment-method/query), otherwise to a payment page whose URL does not expose the booking id, and never returns the booking record or its id to the browser; everything API-related runs server-side.
