---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

my rentalwise calls fail. property/search with a GET returns 404, and when I switched to POST I got 401. also property/get-quote gives me a 422 with errors.rates_defined. here's my fetch wrapper (it sends the token as 'X-Api-Key'). what's wrong and how should errors be handled?
