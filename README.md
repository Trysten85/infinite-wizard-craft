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
| `data/` | Game data: entries, combos, schools, tag vocabulary |
| `config/balance.json` | Every balance number |
| `prompts/voice.md` | Voice guide sent with every model call (placeholder until Phase 0) |
| `src/shared/schema.ts` | Schemas for data files and model output |
| `src/server/combiner.ts` | Combine rules |
| `src/server/store.ts` | SQLite: combo cache, discoveries, model call log (`var/game.db`) |
| `src/server/llm/` | The one model interface, the Ollama client, and a fake for tests |
| `web/` | React page |

## Cache tool

```
npm run cache -- list            # every cached combo and what it made
npm run cache -- delete fire+mud # delete one; also removes anything built from it
npm run cache -- calls           # recent model calls with tokens and latency
```
