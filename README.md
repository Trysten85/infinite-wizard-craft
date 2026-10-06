# Infinite Wizard Craft

Design: `Infinite Wizard Craft.md`. Build order: `Infinite Wizard Craft Phase Guide.md`.

## Run

Needs Node 22+ and Ollama on the host PC (reached at `http://192.168.56.1:11434`).

```
npm install
npm run dev        # game server on :3001, web page on http://localhost:5173
npm test           # rule tests
npm run typecheck
```

Override the model or address with `OLLAMA_MODEL` and `OLLAMA_URL`.

## Where things live

| Path | What |
|---|---|
| `data/` | Game data: entries, combos, schools, ladders, spells, tag vocabulary (design notes in `Tag Guide.md`) |
| `config/balance.json` | Every balance number |
| `prompts/voice.md` | Voice guide sent with every model call |
| `src/shared/schema.ts` | Schemas for data files and model output |
| `src/server/combiner.ts` | Combine rules |
| `src/server/store.ts` | SQLite: combo cache, discoveries, model call log (`var/game.db`) |
| `src/server/llm/` | The one model interface, the Ollama client, and a fake for tests |
| `web/` | React page |

## API (for the front end)

| Route | Returns |
|---|---|
| `GET /api/players/:player` | `{ entries }`: everything the player has discovered |
| `POST /api/players/:player/combine` with `{ a, b }` | `{ entry, origin, firstDiscovery }` |

- Entries have a `kind`: `element`, `material`, `focus`, `school`, or `spell`.
- Spell entries have ids prefixed `spell-` (the Light cantrip is `spell-light`, the element is `light`),
  a `school` field, and their elements in `affinity`. A school's `affinity` is its natural elements.
- Errors return `{ error, code }`. `error` is a sentence that can be shown to the player.

| `code` | Status | Meaning |
|---|---|---|
| `no-result` | 422 | The pair makes nothing yet (a school or spell with no recipe) |
| `no-focus` | 400 | The pair would make a spell, but the player has no focus |
| `missing-needs` | 400 | The spell needs materials the player has not discovered; `error` names them |
| `rule` | 400 | Anything else the rules refuse, such as an undiscovered input |

## Schools and spells

- A school is discovered by its recipe in `data/combos.json` (Fire + Light = Evocation).
- School + element = cantrip, for the seeds in `data/combos.json`. The player needs a focus.
- School + a spell of that school one tier lower = the next spell in `data/ladders.json`,
  if the player has discovered every material in its `needs`.
- Design notes are in `Magic School Patterns.md`.

## Drafting spell recipes

Spells outside the hand-written ladders are made by rule: **a spell of the same school one tier
lower + the spell's key**. Keys and any new materials are drafted by `npm run craft` and are not
in the game until approved.

```
npm run craft -- status              # what is drafted, approved, and waiting
npm run craft -- approve all         # approve every complete draft (rows marked "review" are skipped)
npm run craft -- approve mica shatter  # approve single materials or spells by id
npm run craft -- plan 4-5            # draft keys for more tiers (default 1-3)
npm run craft -- materials           # ask the local model for recipes for new materials
```

| To change | Edit |
|---|---|
| A spell's key | `data/spell-recipes.json` (`note` says why the key was chosen) |
| A new material's recipe, text, or tags | `data/spell-materials.json` |

Set `status` to `ok` to make a row live, by hand or with `approve`. Re-running `plan` or
`materials` never overwrites existing rows. Depth limits for new materials are
`componentDepthByTier` in `config/balance.json`.

## Blocklist

`Blocklist.md` lists proper nouns the model must never produce. It is not in git because it holds
real names; the game runs without it but warns at startup. Generated names and descriptions that
contain a term are rerolled.

```
npm run blocklist    # scan data/, prompts/, and cached entries for blocklisted terms
```

## Tag review

Tags come from the closed list in `data/tags.json`. The model can only pick from it.

```
npm run tags                          # entries with no tags, a model hint, or retired tags
npm run tags -- set mist utility,area # set a generated entry's tags
```

Hand-written entries are retagged by editing `data/entries.json`.

## SRD spells

`data/spells.json` holds the 319 SRD 5.1 spells in the game's schema. It is generated, so don't
edit it by hand. Attribution and source details are in `data/srd/ATTRIBUTION.md`.

```
npm run srd -- review            # spells whose tags need a human
npm run srd -- review elements   # spells with no element
npm run srd -- import            # rebuild data/spells.json after editing the files below
npm run srd -- materials         # ask the local model to split any new material phrases
npm run srd -- download          # re-fetch the pinned source file
```

| To change | Edit |
|---|---|
| A spell's tags or elements | `data/srd/overrides.json` |
| The materials found in a phrase | `data/srd/material-phrases.json` (set `status` to `ok` when fixed) |

## Cache tool

```
npm run cache -- list            # every cached combo and what it made
npm run cache -- delete fire+mud # delete one; also removes anything built from it
npm run cache -- calls           # recent model calls with tokens and latency
```
