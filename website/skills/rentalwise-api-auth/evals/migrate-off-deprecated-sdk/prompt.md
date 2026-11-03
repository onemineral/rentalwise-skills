---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Our Node backend uses @onemineral/pms-js-sdk for RentalWise (newPmsClient with a token provider, then pms.property.search, pms.property.getQuote and pms.property.createBooking, reading result.response and catching OMError). The SDK is being deprecated. Rewrite lib/pms.ts to use plain HTTP requests instead, keep the same three functions, and tell me how to check the exact request parameters for each call.
