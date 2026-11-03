---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

On our RentalWise property page the quote box just says "error" when the dates are taken. When the dates are not available we want to offer an "ask about other dates" form instead, prefilled with what the guest chose, and keep showing real validation messages (too many guests, minimum stay, bad coupon) when that is the actual problem. Implement the server route and the client logic, no styling.
