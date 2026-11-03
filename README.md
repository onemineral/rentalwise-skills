# RentalWise skills

Agent Skills for AI agents working with the RentalWise property management API. The repository
holds several skill sets, one folder each. Every set is a Claude Code plugin of its own and is
listed in the marketplace manifest at `.claude-plugin/marketplace.json`.

| Set | Folder | What it is for |
|---|---|---|
| Website | [`website/`](website/README.md) | Building standalone guest-facing websites on the API: client and auth, search, property page, quote, booking and upsells, payment page, languages and translations. |

## Installing a set

**Claude Code plugin.** Add the marketplace once, then install the set you need:

```
/plugin marketplace add onemineral/rentalwise-skills
/plugin install rentalwise-website@rentalwise-skills
```

**With the `skills` CLI (any agent).** The [`skills`](https://github.com/vercel-labs/skills)
CLI finds every `SKILL.md` in the repository and installs into Claude Code, Cursor, Codex,
OpenCode and other agents:

```sh
npx skills add onemineral/rentalwise-skills --list   # list every skill across all sets
npx skills add onemineral/rentalwise-skills          # pick skills and agents interactively
```

**By hand.** Copy the folders under `<set>/skills/` into the agent's skills directory. Each
set's README has the exact commands and the recommended reading order.

## Layout

```
.claude-plugin/marketplace.json   one entry per set
<set>/.claude-plugin/plugin.json  the set's plugin manifest
<set>/README.md                   what the set covers and how to install it
<set>/skills/<skill-name>/        SKILL.md plus references/, scripts/, assets/, evals/
```
