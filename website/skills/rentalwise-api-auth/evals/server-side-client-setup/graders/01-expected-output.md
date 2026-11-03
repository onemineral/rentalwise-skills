---
type: llm
focus: trace
weight: 1
---

The result matches this description: A server-only client module reads RENTALWISE_BASE_URL (ending in /rest/) and RENTALWISE_API_TOKEN from env, uses Bearer auth and POST requests, no website-channel lookup is attempted, and the route handler forwards only a property search body without ever exposing the token to the browser. The agent mentions running the smoke test or an equivalent credential check.
