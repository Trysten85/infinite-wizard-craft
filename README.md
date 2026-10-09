# Infinite Wizard Craft

Design: `Infinite Wizard Craft.md`. Build order: `Infinite Wizard Craft Phase Guide.md`.

## Run

Needs Node 22+ and Ollama on the host PC (reached at `http://192.168.56.1:11434`).

```
cd ~/Documents/"Infinite Spell Craft"
npm install
npm run dev        # game server on :3001, web page on http://localhost:5173
npm test           # rule tests
npm run typecheck
```

## The model

`config/model.json` says which model the game uses and how:

| Setting | What |
|---|---|
| `url` | Where Ollama answers. The host PC's address on the VirtualBox host-only network |
| `model` | The model, which must already be pulled in Ollama |
| `effort` | How hard a reasoning model thinks: `combos` for combinations, which the player waits on, and `events`, which are written out of sight. `low`, `medium`, `high`, or `null` for a model that does not reason |
| `keepAlive` | How long Ollama keeps the model loaded after a call |
| `timeoutSeconds` | How long one call may take before it is given up and tried again |
| `background` | How event writing gives way to combinations (below) |

Ollama answers one call at a time, so a combination would otherwise queue behind a whole event
beat. Instead, event writing is cut short the moment a combination needs the model, and starts
again once there have been `quietSeconds` without one. After giving way `giveWayTimes` times, a
call runs to the end, so a busy player cannot put an event off forever.

`OLLAMA_MODEL` and `OLLAMA_URL` override the file for one run. A different model is sent no
effort level.

## Comparing models

```
npm run eval -- gemma3:12b gpt-oss:20b
```

Runs each model through the same fixed set of the game's real prompts (combinations, the storybook
menu, events, the spell look, parting lines) on a throwaway save, and writes a side-by-side report
to `var/eval/<date>/report.md`. Each model must already be pulled in Ollama on the host PC. Nothing
in the game or the saved game is changed. To play with a different model afterwards, change
`model` in `config/model.json`.

`npm run eval -- game` runs the model exactly as the game does, with the efforts from
`config/model.json`. Use it after changing a prompt or a setting.

## Recipe key

`Recipe Key.md` lists everything that can be made right now: a quick table of what makes each
thing, and the full path to it from the starting elements. Search it for a name, for example
"Wizard", to see every combo in order.

It is generated, so don't edit it. It is rewritten when the server starts, when drafts are
approved, and by `npm run key`. A test fails if it falls out of step with the data.

## Where things live

| Path | What |
|---|---|
| `data/` | Game data: entries, combos, schools, ladders, spells, tag vocabulary (design notes in `Tag Guide.md`) |
| `config/balance.json` | Every balance number |
| `config/model.json` | Which model, and how hard it thinks for each job |
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

- Entries have a `kind`: `element`, `material`, `focus`, `school`, `spell`, or `job`.
- Spell entries have ids prefixed `spell-` (the Light cantrip is `spell-light`, the element is `light`),
  a `school` field, and their elements in `affinity`. A school's `affinity` is its natural elements.
- Errors return `{ error, code }`. `error` is a sentence that can be shown to the player.

| `code` | Status | Meaning |
|---|---|---|
| `no-result` | 422 | The pair makes nothing yet (a school or spell with no recipe) |
| `no-focus` | 400 | The pair would make a spell, but the player has no focus |
| `missing-needs` | 400 | The spell needs materials the player has not discovered; `error` names them |
| `rule` | 400 | Anything else the rules refuse, such as an undiscovered input |

### Progression and the shop

The server owns gold, XP, level, quests, and learned spells. They are saved per player.

| Route | Returns |
|---|---|
| `GET /api/players/:player` | also `progress` |
| `POST /api/players/:player/combine` | also `progress` and `rewards` |
| `POST /api/players/:player/learn` with `{ spell }` | `{ spell, cost, rewards, progress }` |
| `GET /api/players/:player/shop` | `{ slots, restockIn }` |
| `POST /api/players/:player/shop/buy` with `{ slot }` | `{ entry, rewards, progress, shop }` |

- `progress` is `{ xp, level, levelInto, levelSpan, gold, learned, quests }`. Each quest has a
  `state` of `done`, `active`, or `upcoming`.
- `rewards` is `{ gold, quests }`: what the player earned by that action, for toasts.
- Every spell entry has `learnCost`, the gold it takes to learn, wherever the entry appears
  (the player's entries, a combine result, a shop slot). The learn route also returns the `cost` paid.
- Each shop slot is `{ slot, type, reason, entry, price, sold }`. `type` is `random` or `tailored`,
  and `reason` says why a tailored item was picked. `restockIn` counts new discoveries to go.
- The types are exported from `src/shared/schema.ts`: `Progress`, `Rewards`, `ShopSlot`, `ShopView`.
- More error codes: `not-enough-gold` and `sold-out` (both 400).

**For the page to switch over:** stop working out XP, level, gold, and quests in
`web/src/progress.ts` and `web/src/quests.ts` and read `progress` instead; call the learn route
when a spell is dropped on the focus, instead of saving learned spells in the browser; and fill
the shop shelf from the shop routes. Learned spells saved in a browser are not carried over.

### Events

An event arrives when a player has earned 15 points: 1 per new discovery made by combining,
2 per quest or request finished, 1 per spell learned, 3 per level gained.

An event is a short conversation in two beats. Someone arrives with something on their mind, the
player reacts, the person says what they are after, and the player answers.

| Route | Returns |
|---|---|
| `GET /api/players/:player/event` | `{ event, eventIn }`. `event` is null until one is waiting. Answers at once |
| `POST /api/players/:player/event/respond` with `{ type, beat? }` | `{ outcome, effects, next, request, hint, gift, rewards, progress }` |
| `POST /api/players/:player/event/test` with `{ seed? }` | `{ event, eventIn, seed }` |

- An event is `{ id, beat, beats, earlier, kind, mood, person, scene, responses }`. `earlier` is
  the conversation so far: `[{ scene, chosen, outcome }]`. Each response is `{ type, text }`, where
  `type` is `generous`, `skilled`, `fair`, `sharp`, or `avoid`.
- **Beat 1** always offers `generous`, `fair`, and `avoid`. Answering it returns `outcome` (how the
  person takes it) and `next`, the second beat. `avoid` ends the event there, with `next: null`.
- **Beat 2** offers what the seed allows. Answering it ends the event: `next` is null, and one of
  `request`, `hint`, or `gift` may be set if the player helped.
  - `request`: `{ id, from, ask, entry, gold, state }`. Filled the moment the player has that entry.
  - `hint`: `{ entry, recipe, from }`. `recipe` is what the thing is made from, such as "Sand and Fire".
  - `gift`: `{ id, name }`. The player now has that entry.
- A Skilled response at beat 2 that uses one of the player's spells also has `spell: { id, name }`.
  A spell is only put forward if it carries one of the seed's `spellTags` and none of
  `events.spellCheck.blockedTags`.
- Send `beat` (the beat being answered) with a response. If it is not the current beat the server
  answers 400 "That moment has passed", so a double click cannot answer the next beat by accident.
- `effects` is `{ gold, rep, fondness }`. Outcomes and effects are only returned by responding.
- `progress` also carries `rep`, `repBand`, `requests`, `hints`, `eventReady`, and `eventIn`
  (the shared type is `PlayerProgress`).
- **Timing:** an event is written whole, out of sight, before the player hears of it: the arrival,
  and the second beat for both ways of carrying on. That takes a minute or two. Once it is
  waiting, playing it never waits on the model.
  - `progress.eventReady` is true only when an event is waiting. Every route that returns
    `progress` carries it, so the page can show that someone has arrived after any action.
  - `eventIn: 0` with `eventReady: false` means an event has been earned and is on its way.
  - The points an event cost are spent when it appears, not when it is earned.
  - If the server stops part-way through, the event is carried on from what was already written
    the next time that player does anything.
- **Test route:** writes a fresh event and returns it as soon as the arrival is written (the
  second beats follow behind it, so answering straight away can wait). It needs no points and
  spends none, and an event already waiting is replaced. It is a real event: playing it changes gold, standing, and fondness.
  Seed ids are in `data/event-seeds.json`, plus `repeat` to bring back someone the player has met.

```
npm run events -- <player>    # the people a player knows, every event, and open requests
```

Seeds are in `data/event-seeds.json`; every number is under `events` in `config/balance.json`.
The design is in `Event Seeds Guide.md`.

## Schools and spells

- A school is discovered by its recipe in `data/combos.json` (Fire + Light = Evocation).
- School + element = cantrip, for the seeds in `data/combos.json`. The player needs a focus.
- School + a spell of that school one tier lower = the next spell in `data/ladders.json`,
  if the player has discovered every material in its `needs`.
- Design notes are in `Magic School Patterns.md`.

## Jobs

Jobs are in `data/jobs.json`. Each is discovered by combining its two `inputs`, like anything else.

- A mundane job is a Person plus a tool, place, or material (Person + Forge = Blacksmith).
- A magic job needs a school or a focus somewhere in its chain (Blacksmith + Spellbook = Runesmith).
- `hint` is what the journal shows while a job is undiscovered. `GET /api/jobs` returns
  `{ jobs: [{ id, magic, hint, starter }] }` for every job. `starter` is true for the job the
  first job quest should point at (Wizard); a discovered job also appears among the
  player's entries with kind `job`.
- `orAnySpellTagged` adds recipes: a Healer is a Herbalist plus any healing spell in play.
- `wantedTags` is for score, which is not built yet.
- A job combined with anything that has no hand-written recipe returns `no-result`.

```
npm run path -- blacksmith    # how something is made, worked back to the starting elements
npm run path -- jobs          # every job with the length of its chain
```

## Drafting spell recipes

Spells outside the hand-written ladders are made by rule: **a spell of the same school one tier
lower + the spell's key** (for a cantrip, the school itself + the key). Keys and any new materials are drafted by `npm run craft` and are not
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

## How new combinations are named

- An ordinary pair makes an ordinary, real-world thing with a plain name (Water + Sand = Beach).
- A pair with magic in it may make a storybook thing (Clay + Life = Golem). Magic is in play when
  an ingredient is one of `generation.wonderInputs` in `config/balance.json`, a focus, or itself a
  storybook result.
- For a magical pair the model picks from the fixed list in `data/storybook.json`, or says none.
  Edit that list to turn the fantasy up or down.
- One thing can be made several ways. But when a new pair lands on something another pair
  already makes, the model is asked once more whether something else fits just as well. If it
  gives the same answer again, that answer stands.

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
npm run cache -- revoice         # rewrite cached descriptions in the current voice (names stay; a backup is kept)
```
