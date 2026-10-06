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
| `data/` | Game data: entries, combos, schools, tag vocabulary (design notes in `Tag Guide.md`) |
| `config/balance.json` | Every balance number |
| `prompts/voice.md` | Voice guide sent with every model call (placeholder until Phase 0) |
| `src/shared/schema.ts` | Schemas for data files and model output |
| `src/server/combiner.ts` | Combine rules |
| `src/server/store.ts` | SQLite: combo cache, discoveries, model call log (`var/game.db`) |
| `src/server/llm/` | The one model interface, the Ollama client, and a fake for tests |
| `web/` | React page |

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
