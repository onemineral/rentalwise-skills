---
type: llm
focus: trace
weight: 1
---

The result matches this description: The payment route does not expose the booking id in the URL (any scheme is acceptable: an encrypted or signed token, a random key mapped server-side, a session-bound segment), resolves the URL to the id on the server and returns 404 when it does not resolve, without calling the API; the booking is fetched server-side by id with booking/fetch (or booking/query on id) with the property, products, payment_schedule_steps and currency relations; the page derives a state (inactive, nothing due, payable) from status and payment_status; the browser receives a trimmed object (stay dates, guests, price lines, amount due = next_payment_amount with total_outstanding fallback, schedule, property name/image/area, security deposit, host contact) and never the full booking, main_guest details, access codes or payment_link; payment/create-client-secret is called server-side with absolute return_url_ok and return_url_ko built from a configured site URL; the rw-booking-payment element is rendered with client-secret, booking-id and instance and loads script.js/style.css from the returned instance; the API token stays server-side.
