---
type: llm
focus: trace
weight: 1
---

The result matches this description: Distinguishes the 422 keys rates_defined, availability and property_booked (one not-available outcome returned as data, not as a server error) from rule keys such as min_stay, max_occupancy, children_allowed and coupon_code (their errors[key][0] message shown verbatim, also when a not-available key is present); on not-available shows an inquiry form prefilled with the dates and guests and submits it through a server route that calls inquiry/create with inquiry_type guest, contact_name, contact_email, message, inquire_property, inquire_check_in, inquire_check_out, inquire_adults, inquire_children and point_of_conversion, maps its 422 field errors to the form, and never exposes the API token or calls the API from the browser.
