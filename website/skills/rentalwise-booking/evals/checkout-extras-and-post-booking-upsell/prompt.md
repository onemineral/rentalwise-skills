---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Our RentalWise site already has the quote box, guest form and create-booking route. The customer wants upselling: offer their services (airport transfer, breakfast, bikes, a private chef on a chosen evening) during checkout and again right after the booking is made, before payment, with prices that depend on the stay (nights, guests, hours, quantity). Add the server routes and the client-side state logic for both steps, no styling.
