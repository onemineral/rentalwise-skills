---
tags: [rentalwise]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Build the data layer for a search results page: the URL has ?checkin=2026-08-01&checkout=2026-08-08&adults=2&children=1&destination=<location id>&currency=EUR. Return a list of properties with name, main image, location, bedrooms, sleeps, and the stay price (with strike-through if discounted). Also handle the case where no dates are given. TypeScript, framework-agnostic functions are fine.
