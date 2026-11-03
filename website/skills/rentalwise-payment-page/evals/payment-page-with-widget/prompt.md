---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Our RentalWise site creates bookings through /api/book. Now I need the page the guest lands on to pay the deposit: it should show the booking and property details and take the payment with RentalWise's own payment widget (no Stripe integration of our own). Guests must not be able to open other people's bookings by editing the URL. Next.js App Router, TypeScript, no styling needed.
