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
| `effort` | How hard a reasoning model thinks: `combos` for combinations, which the player waits on, `naming` for the one call in a combination that decides what the thing is, and `events`, which are written out of sight. `low`, `medium`, `high`, or `null` for a model that does not reason |
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

- `progress` is `{ xp, level, levelInto, levelSpan, gold, learned, quests }`.
- Each quest is `{ id, title, detail, track, level, gold, xp, state, progress? }`. `track` is `main`
  or `side`. `state` is `done`, `active` (the next main quest), `upcoming` (open), or `locked`
  (opens at `level`). `progress` is `{ have, need }`, only on a quest that counts something.
- `rewards` is `{ gold, quests }`: what the player earned by that action, for toasts. Each quest in
  it is `{ id, title, gold, xp }`.
- Every spell entry has `learnCost`, the gold it takes to learn, and `learnLevel`, the level it
  takes, wherever the entry appears (the player's entries, a combine result, a shop slot). The
  learn route also returns the `cost` paid.
- Each shop slot is `{ slot, type, reason, entry, price, sold }`. `type` is `random` or `tailored`,
  and `reason` says why a tailored item was picked. `restockIn` counts new discoveries to go.
- The types are exported from `src/shared/schema.ts`: `Progress`, `Rewards`, `ShopSlot`, `ShopView`.
- More error codes: `not-enough-gold`, `sold-out`, and `level-too-low` (all 400).

### Quests, XP, and levels

- XP comes from first discoveries (`discoveryXpByTier` in `config/balance.json`) and from quests.
  Going from level N to N + 1 takes N times `levels.xpStep`.
- The 40 quests are in `data/quests.json`: 20 `main`, worked through in order, and 20 `side`.
  Each has a `done` condition, which is data (the kinds are listed in `questSchema`), and pays
  `gold` and `xp`.
- A quest pays once its condition is met and the player has reached its `level`. What the player
  did earlier still counts. Quests pay about two fifths of the XP each level takes, and a test
  holds them to that.
- A quest that says "Make" has `made: true` in its condition: only things the player made by
  combining count, and anything bought or given is left out. A test holds every such quest to it.
- "Reach level N" quests pay gold and no XP. Only three quests have anything to do with events,
  and they only count how many the player has seen through.
- A spell can be learned once the player reaches `spellLevelByTier` for its tier: cantrips at
  level 1, then levels 2, 3, and 5 for tiers 1 to 3.
- A level once reached is kept. If these numbers change under a saved player, the XP they are
  short of their old level is made up once (`player_stats.bonus_xp`).

```
npm run pace    # XP and hours each level should take, and how fast saved players have gone
```

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
- **Taking up a job.** Discovering a job does not make it the player's. `POST
  /api/players/:player/job` with `{ job }` takes up a job the player has discovered and returns
  `{ rewards, progress }`. `progress.job` is `{ id, name }`, or `null` before one is chosen. It is
  saved, and stays theirs until they take up a different one. Events (which seeds can fire, the
  Skilled response, what the writer is told the player does) and the shop's job slot go by this
  job only. An undiscovered job, or anything that is not a job, is refused with 400.
- `wantedTags` is for score, which is not built yet.
- A job combined with anything that has no hand-written recipe returns `no-result`.

```
npm run path -- blacksmith    # how something is made, worked back to the starting elements
npm run path -- jobs          # every job with the length of its chain
```

### Work shifts (rules and data)

A job's shift is one order from its board, filled by picking a **Base**, a **Method**, and an
optional **Touch**. The design is in `Jobs Guide.txt`. This part is the rules and the content;
saving shifts and serving them to the page is the shift service's job.

- **Skins** are in `data/job-skins.json`, one per job. A skin names the three slots, lists the
  job's own *staples* for each (always on offer, so nobody has an empty slot), and says which
  of the player's things fit a slot (`from`: kinds and tags). A staple with a `rank` opens at
  that rank. A new job only needs a skin.
- **Orders** (`stockOrder` in `src/server/shifts/orders.ts`) ask for two tags, or up to three
  from Journeyman, and have a tier at or one under what the player's level allows. The tags are
  taken one from each slot, so some choice always covers them all.
- **Options** (`optionsFor`) are the staples for the player's rank plus what they have
  discovered that fits. A spell fits only once learned and castable. Nothing is used up.
- **Quality** (`src/shared/shifts.ts`, which the page can import too): the score is the share
  of the order's tags covered, plus `tierBonus` when the best Base or Touch meets the order's
  tier, plus the rank's bonus. That gives Meh, Good, Great, or Perfect, moved at most one step
  by luck and never below Meh. `previewRange` gives the likeliest result and the range before
  the player confirms.
- **Pay** (`payFor`): gold and XP by the order's tier, scaled by quality. Great and Perfect
  also raise standing.
- **Ranks** come from shifts done in that job and are never lost: Apprentice, Journeyman at 8,
  Master at 20. A build score is not asked for yet (`score: null`).
- **Timing**: one shift opens every 10 discoveries made by combining, counted the way the shop
  counts toward a restock. The first is open as soon as a job is taken up (`shiftIn`).
- Order and result text is plain for now, from `data/shift-text.json`. Every number is under
  `shifts` in `config/balance.json`.

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

A small model is poor at inventing the right answer in one go, better at choosing from a short
list, and best when code has already cut the list down. So a new combination is named in steps
(`src/server/comboGenerator.ts`), and code does as much of the deciding as it can
(`src/server/comboContext.ts`).

1. **Is magic in play?** Code decides. It is when an ingredient is one of
   `generation.wonderInputs`, a focus, or itself a storybook result.
2. **Storybook.** For a magical pair, code looks up which things in `data/storybook.json` one
   ingredient *makes* (`from`) and the other *wakes* (`wokenBy`). A tree and Life: Treant, Dryad.
   The model chooses one from that closed list, or declines them all. A tree and anything else is
   never a Treant.
3. **Ideas.** Otherwise the model answers three plain questions about the pair, each with its
   reason before its name: what the two make, where they are found together, and a thing with
   both in it. The first answer the game's rules allow is taken. If another pair already makes
   that thing and one of the other answers is new, the new one is taken instead.
   - The model is given the ingredients' **names only**, plus what a model-made ingredient was
     made from. Never their descriptions: those are jokes ("Person: mud that stood up"), and a
     small model takes them at their word.
   - It is also shown a few examples from `data/combo-examples.json` and the hand-written
     recipes, chosen to resemble the pair.
   - A magical pair that makes nothing from the storybook makes an **everyday thing touched by
     magic**: a plain name, with one small enchantment in its description.
4. **Describe.** The description and tags are written for the chosen name.
   - **Short.** `generation.maxSentences` and `maxWords` are enforced by code: a longer
     description is sent back and rewritten. The same limit holds in the revoice and craft tools.
   - **Material tags are handed down.** A tag in the "material" group of `data/tags.json` (metal,
     plant, liquid...) is only on offer if one of the ingredients carries it. What a thing does
     is still the model's to say. Three tags at most.
   - **The whimsy dial.** Code marks `generation.twistShare` of ordinary pairs (one in four) for
     one playful twist in the description. A pair always gets the same treatment. The name, the
     tags, and what the thing is stay literal.

| To change | Edit |
|---|---|
| Which fairy-tale things exist, what each is made of, and what wakes it | `data/storybook.json` |
| The examples shown to the model | `data/combo-examples.json` |
| How many examples, storybook things offered, and tags; the temperatures | `generation` in `config/balance.json` |

- `generation.naming` is how step 3 asks: `questions` (the three questions) or `word` (only the
  one word, nothing else). Compare them with `npm run bench -- --naming word`, and try a harder-
  thinking naming call with `--effort medium`. As measured on 2026-10-09 with `gpt-oss:20b`:

  | Naming | Right answers, of 54 | Bad or failed | Seconds |
  |---|---|---|---|
  | The generator before all this | 20 | 1 | 5.2 |
  | `questions`, low effort (two runs) | 29, 34 | 1, 1 | 6.5, 5.8 |
  | `word`, low effort | 29 | 5 | 10.2 |
  | `word`, medium effort | stopped after six pairs | one timed out | 91 |

  The one word is slower because it is so often a name the rules refuse, and then it must be
  asked again. Two runs of the same setting differ by about three answers, so smaller gaps than
  that mean nothing.
- `generation.pick` adds a step where the model judges between the three ideas. It is off: at
  low effort the model judges poorly and it doubles the wait. Try it with `npm run bench -- --pick`.
- `generation.charmedCarriesMagic` decides whether an everyday thing touched by magic counts as
  magical itself. Off, the magic fades unless a magical ingredient is added again.
- A name that is only the two ingredients run together (Bloodfire from Blood and Fire) is refused.

### Measuring it

```
npm run bench                  # every pair in data/combo-bench.json, graded
npm run bench -- sand spirit   # only pairs that use one of these things
```

Runs each pair on a throwaway save and writes `var/bench/<date>/report.md`, beside the last full
run. Each pair in `data/combo-bench.json` lists answers that are `good` and answers that are
`bad`. Anything else is graded by the model itself, thinking harder than it does in the game, and
comes out as plausible or doubtful. That grade is rough: read the report, and move answers onto
the lists to settle them. The report also shows what the model suggested for each pair and how
long each step took. Run it before and after changing a prompt, the storybook, or a setting.

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
npm run cache -- revoice --long  # rewrite only the ones over the length limit
npm run cache -- review          # have the model grade every cached combo and list the doubtful ones
```
