---
type: llm
focus: trace
weight: 1
---

The result matches this description: Uses property/search with daterange, guests = adults + children + babies (one number; search has no per-type argument), locations and currency iso_code, and pages/sorts the full result set in its own code because search ignores paginate; prices come from availability_details (converted total when present, total_before_discount for strike-through, nightly = total / length_of_stay, is_price_approximate labelled); without dates it omits daterange and shows marketing_price; property names are resolved from TranslatedText for the page locale with the account's default language (is_default) as fallback, not a hard-coded en; the token stays server-side.
