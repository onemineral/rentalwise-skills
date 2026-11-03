---
type: llm
focus: trace
weight: 1
---

The result matches this description: Explains that fields are guarded by the API key's role: website_visible needs the "View Property Configuration" ability, so the search argument was dropped silently and hidden properties came back, the where condition is refused with 422 and the records omit the field. Recommends verifying with the auth skill's smoke test or schema.py (schema is per token) rather than guessing, tells the user to have the customer grant the ability to the key's role (or issue a key with it) and refresh the schema cache, keeps website_visible: true and the status/website_visible where conditions in place, and does not suggest shipping the search without the guard or replacing it with a collection/tag filter unless the customer explicitly wants that.
