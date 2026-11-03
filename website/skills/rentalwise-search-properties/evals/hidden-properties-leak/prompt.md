---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Our RentalWise search page shows two villas the client says are hidden from the website in the PMS. The route sends property/search with website_visible: true, so I tried filtering afterwards with a property/query where website_visible eq true, but that gives a 422 saying the field does not exist in the schema, and the search results have no website_visible key either. The PMS was not upgraded. What is going on and what should I change?
