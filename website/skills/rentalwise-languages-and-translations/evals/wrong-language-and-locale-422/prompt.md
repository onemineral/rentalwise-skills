---
tags: [rentalwise]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Two bugs on our French pages (/fr). First, some property descriptions and a few amenity names still show in English. Second, the sorted listing is broken: property/query with sort [{ field: "name", direction: "asc", locale: "fr-FR" }] answers 422 "The selected value is invalid." Explain what is going on and fix the code.
