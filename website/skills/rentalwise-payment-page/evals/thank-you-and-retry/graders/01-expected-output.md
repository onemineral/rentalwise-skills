---
type: llm
focus: trace
weight: 1
---

The result matches this description: return_url_ok points to a thank-you route under the same hidden-id URL and return_url_ko back to the payment route with a status=ko flag; both routes resolve the URL to the booking id on the server and re-fetch the booking (no booking data is trusted from the query string); the thank-you page confirms by reading status/payment_status (confirmed+paid → confirmed copy, pending_host_confirmation → host will reply, still unpaid right after return → "confirming your payment" without a second pay button) and shows the next unpaid schedule step and the legal entity contact; the ko case shows a retry notice and renders the widget with a freshly created client secret; an already paid booking (payment_status paid or amount due 0) shows the summary without the widget; a booking whose status is expired_hold, cancelled or otherwise not payable shows a "no longer active" message with a link back to the property; pages are server-rendered per request with no-store and noindex.
