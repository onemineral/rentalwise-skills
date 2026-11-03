---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

We already have a /payment/[ref] page with the RentalWise widget (the ref hides the booking id) on our SvelteKit site. Add what happens after: the page the widget returns to when the payment went through, and what to show when it failed. Also handle the case where the guest opens the payment link again after already paying, or after the hold expired.
