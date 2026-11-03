---
type: llm
focus: trace
weight: 1
---

The result matches this description: Reads the account's languages with language/query and offers Spanish only if a record with locale "es" exists (otherwise tells the customer to enable it in RentalWise instead of inventing the key); takes the default language from is_default rather than assuming en; resolves every TranslatedText (names, descriptions, amenities, locations, seo) with one helper in the order page locale -> default -> any non-blank value and never hides a record for a missing translation; keeps seo.slug shared across languages with /es as a path prefix and the default language unprefixed; emits canonical, hreflang alternates for en and es plus x-default, and <html lang>; sends a validated two-letter locale in sort[].locale; does not call website-translation or website-channel endpoints and does not treat the website's own texts as a RentalWise concern; the API token stays server-side.
