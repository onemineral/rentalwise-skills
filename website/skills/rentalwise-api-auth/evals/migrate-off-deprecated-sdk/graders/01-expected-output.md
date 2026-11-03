---
type: llm
focus: trace
weight: 1
---

The result matches this description: The rewritten module sends POST requests to {BASE_URL}property/search, property/get-quote and property/create-booking with a Bearer token from a server-side env var, JSON body and Accept header, returns the parsed body directly (no .response unwrapping), and maps non-2xx responses to an error that exposes statusCode and the 422 errors map. The agent points to POST settings/fetch and its schema (or the schema.py helper) as the way to verify each call's parameters, and does not keep the SDK as a dependency.
