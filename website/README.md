# RentalWise website skills

A set of Agent Skills for AI agents that build standalone guest-facing websites on top of the
RentalWise property management API. The websites are independent projects: they are not
connected to the RentalWise website builder and do not use website channels or settings stored
in the PMS. They use the API for three things: reading data (properties, collections, locations,
amenities, availability, prices), creating bookings and taking payments. The skills cover exactly
that and say nothing about how the website should look. Pair them with whatever design or
framework guidance the project needs.

| Skill | Use it when the agent has to… |
|---|---|
| `rentalwise-api-auth` | configure credentials, set up the API client, understand request/response conventions and which endpoints a website may call. Read this one first. |
| `rentalwise-search-properties` | build a search or listing page, a collection page, a destination page, filters (dates, guests, location, amenities, budget, currency). |
| `rentalwise-property-details` | build a property page: content, images, amenities, rooms, policies, fees, reviews, availability calendar, seasonal rates. |
| `rentalwise-quote` | build the price box on the property page: price a stay (quote with coupon, currency, security deposit), re-quote on changes, handle not-available and rule errors, label the "book now" / "request to book" button and hand over to the booking page, or capture an inquiry / contact form. |
| `rentalwise-booking` | build the booking (checkout) page: the fresh quote it opens with, upsell the host's services (catalogue for the stay, pricing by nights, guests, hours or quantity, extras at checkout and after the booking is created), collect guest details, create the booking, decide between thank-you and payment. |
| `rentalwise-payment-page` | build the page the guest pays on: keep the booking id out of the URL, fetch and display the booking and property, embed the RentalWise payments widget, handle retry and the thank-you page. |
| `rentalwise-languages-and-translations` | make the site multilingual or render any translated field: which language keys the account uses (`language/query`), resolving TranslatedText with the right fallback, locale in sort/filter/search, per-language URLs, hreflang and metadata. Texts the website adds itself are not covered. |

## The two rules every skill repeats

The RentalWise API token grants access to the customer's bookings, guests and payments. It lives in server-side
environment variables without a public prefix, is used only from server code (page loaders, API
routes, serverless functions), and the browser talks exclusively to the website's own routes.
`rentalwise-api-auth` section 2 spells out what that means per stack; the other skills point
back to it wherever a call could be tempting to make from a component.

The token also carries a role, and every field, argument and relation of the API is guarded by
it. A field the role may not use is dropped from search arguments without an error, refused in
a `where`, skipped in `with` and absent from records; `website_visible` is the one that bites
(it needs "View Property Configuration", and without it `property/search` returns hidden
properties). `rentalwise-api-auth` section 4 explains the mechanism, its smoke test checks the
key, and the schema it downloads is computed for that token, so it is the list of what the key
can do.

## Installing

This set lives in the `website/` folder of the
[`rentalwise-skills`](https://github.com/onemineral/rentalwise-skills) repository, next to
other RentalWise skill sets. Each folder under `website/skills/` is a self-contained skill (a
`SKILL.md` plus `references/`, `scripts/`, `assets/` and `evals/`). The skills reference each
other by name, so install all seven together.

**With the `skills` CLI (any agent).** The [`skills`](https://github.com/vercel-labs/skills)
CLI finds every `SKILL.md` in the repository and installs into Claude Code, Cursor, Codex,
OpenCode and other agents (Node.js 22.20 or later). The list includes the other sets in the
repository, so pick the `rentalwise-*` skills from this one:

```sh
npx skills add onemineral/rentalwise-skills                        # pick skills and agents interactively
npx skills add onemineral/rentalwise-skills --skill 'rentalwise-*' -a claude-code -y   # all seven into Claude Code
npx skills add onemineral/rentalwise-skills --list                 # just list what is available
```

Skills land in the project by default (`.claude/skills/` for Claude Code); add `-g` for the
user-wide directory. Later, `npx skills check` reports updates and `npx skills update`
applies them.

**By hand.** Copy the folders into the agent's skills directory. For Claude Code that is
`.claude/skills/` in the website project:

```sh
git clone https://github.com/onemineral/rentalwise-skills.git /tmp/rentalwise-skills
mkdir -p .claude/skills
cp -R /tmp/rentalwise-skills/website/skills/rentalwise-* .claude/skills/
```

**Claude Code plugin.** The repository is also a plugin marketplace and this set is the
`rentalwise-website` plugin, so the skills can be installed and updated without copying:

```
/plugin marketplace add onemineral/rentalwise-skills
/plugin install rentalwise-website@rentalwise-skills
```

Installed as a plugin, the skills are listed as `/rentalwise-website:<skill-name>`. Updating
later: `git pull` and copy again, or `/plugin update rentalwise-website@rentalwise-skills`.

Each skill's `evals/` folder holds the prompts and graders that check it (`claude plugin eval`
format, run with `--eval-dir` pointing at that folder); agents ignore them.

## Recommended reading order for a new website

1. `rentalwise-api-auth` — credentials, server-side client, allowed endpoints.
2. `rentalwise-search-properties` — listing and search pages.
3. `rentalwise-property-details` — property page and calendar.
4. `rentalwise-quote` — price box on the property page, quote errors, inquiries.
5. `rentalwise-booking` — booking page: quote, extras/upsells, guest form, create-booking, where to send the guest next.
6. `rentalwise-payment-page` — payment page, widget, thank-you.
7. `rentalwise-languages-and-translations` — as soon as the site has a second language; section 2 applies
   to single-language sites too, because every name and description is a translated map.

## Source of truth

The skills use plain HTTP requests; the JavaScript SDK (`@onemineral/pms-js-sdk`) is deprecated
and not referenced except to help migrate away from it. Parameter and field tables were
generated from the API's own schema, returned by `POST settings/fetch` under `schema`, which
`rentalwise-api-auth/scripts/schema.py` browses. The flows (what to call when, how to display
prices, how to handle errors) come from RentalWise's own website implementation, with the
website-builder specifics (website channels, page settings) left out on purpose. The schema is downloaded once per project into `.rentalwise-schema.json` and every
later question about resources, actions, arguments or fields is answered from that file
(`schema.py` or `jq`), not by calling the API again. After a PMS release, run
`schema.py --refresh resources` and diff the parameter tables in `references/` against its output.
The tables were generated with a role that reads everything a website needs; the schema a
project downloads with its own key lists only what that key's role may use, which is the list
that applies to the project.
