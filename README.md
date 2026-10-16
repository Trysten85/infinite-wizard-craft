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
| `GET /api/players/:player/shop` | `{ slots }`, or 400 with code `no-shop` until a Market Stall stands |
| `POST /api/players/:player/shop/buy` with `{ slot }` | `{ entry, rewards, progress, shop }` |

- `progress` is `{ xp, level, levelInto, levelSpan, gold, learned, quests }`.
- Each quest is `{ id, title, detail, track, level, gold, xp, state, progress? }`. `track` is `main`
  or `side`. `state` is `done`, `active` (the next main quest), `upcoming` (open), or `locked`
  (opens at `level`). `progress` is `{ have, need }`, only on a quest that counts something.
- `rewards` is `{ gold, quests }`: what the player earned by that action, for toasts. Each quest in
  it is `{ id, title, gold, xp }`.
- Every spell entry has `learnCost`, the gold it takes to learn, and `learnLevel`, the level it
  takes, wherever the entry appears (the player's entries, a combine result, a shop slot). In the
  player's own entries a spell also has `learnPrice`, what this player pays once the town's
  learning discount is taken off; the learn route charges exactly that and returns it as `cost`.
- Each shop slot is `{ slot, type, reason, entry, price, sold }`. `type` is `random` or `tailored`,
  and `reason` says why a tailored item was picked. The shelf is stocked afresh each morning
  (see "The day (routes)"), and a bought slot stays empty until then. The shop is earned: see
  "The town (routes)" for when it opens and how many shelves it has.
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

There is one visitor a day. They are written once the player has made something that day, are
only seen from dusk, and sitting with them takes a candle (see "The day (routes)").

An event is a short conversation in two beats. Someone arrives with something on their mind, the
player reacts, the person says what they are after, and the player answers.

| Route | Returns |
|---|---|
| `GET /api/players/:player/event` | `{ event }`. `event` is null until one is waiting and it is dusk. Answers at once |
| `POST /api/players/:player/event/respond` with `{ type, beat? }` | `{ outcome, effects, next, request, hint, gift, rewards, night, dusk, progress }` |
| `POST /api/players/:player/event/test` with `{ seed? }` | `{ event, seed }` |

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
  - `progress.eventReady` is true only when a visitor is waiting, at any time of day. Every
    route that returns `progress` carries it. The visitor is shown, and can be answered, only
    from dusk: before it `GET /event` answers `{ event: null }` and responding is refused with
    `not-evening`.
  - `progress.eventIn` is now counted in days: 0 while today's visitor is on the way or waiting,
    1 once the player has sat with them. `eventIn: 0` with `eventReady: false` means a visitor
    is on the way. It is written in the background from the day's start, so it is ready by dusk.
  - A visitor the player does not sit with waits: the same one is at the door the next evening,
    and nobody new is written until they have been seen.
  - The candle (`day.costs.visitor`) is taken when the conversation ends, at the second beat or
    at the door, so night never falls in the middle of one. Responding is refused with
    `no-candles` when too few are left.
  - If the server stops part-way through, the event is carried on from what was already written
    the next time that player does anything.
- **Test route:** writes a fresh event and returns it as soon as the arrival is written (the
  second beats follow behind it, so answering straight away can wait). It works at any time of
  day and costs no candle, it is not the day's visitor, and an event already waiting is replaced. It is a real event: playing it changes gold, standing, and fondness.
  Seed ids are in `data/event-seeds.json`, plus `repeat` to bring back someone the player has met.

```
npm run events -- <player>    # the day a player is on, the people they know, every event, and open requests
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
optional **Touch**. The design is in `Jobs Guide.txt`. This part is the rules and the content.
Saving shifts and serving them to the page is the shift service's job, described after it.

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
- **Timing**: one shift a day, open from noon until night (`shiftOpen` in `src/shared/day.ts`).
  A shift not worked is not saved up.
- Order and result text is plain for now, from `data/shift-text.json`. Every number is under
  `shifts` in `config/balance.json`.

### The day (rules)

The design is in `Town Guide.md`. The rules are plain functions in `src/shared/day.ts`, and the
numbers are under `day` in `config/balance.json`. Nothing is a timer: only the player's own
actions move the day.

- **The sun** moves one notch for a new discovery made by combining, and `shiftNotches` for a
  shift (`afterAction`). It is morning until `noon`, afternoon until `length`, then evening.
- **The shift** is open from noon until night, once a day (`shiftOpen`). It is not saved up.
- **Candles** are the evening's actions. `refuseCandles` answers `not-evening` or `no-candles`.
- **Night** falls when the last candle is spent, when the player goes to bed, or after
  `nightAfter` discoveries past dusk with no candle spent between them (`nightFalls`).
- **Turning in early** (from noon) brings dusk at once with `earlyCandles`, not night.
- A day in progress is a `DayState`; `dayView` turns it into `progress.day` for the page.
- Plain lines for dusk, night, and morning are in `data/day-text.json`.

### The town (rules)

The rules are plain functions in `src/shared/town.ts`, the buildings are in
`data/buildings.json`, and the numbers are under `town` in `config/balance.json`.

- **Plots** are bought in order (`plotPrice`), up to the deeds the player's level gives
  (`deedsFor`). `refusePlot` answers `no-job` (the first plot waits on a first job), `no-deed`, or
  `not-enough-gold`.
- **A building** has a price, the tags it wants on its shelves, the tags a spell must carry to
  be cast on it, and one entry per tier. A tier lists everything the building gives at that
  tier (`perks`), named things it needs, and a townsperson who must have arrived (`needsJob`).
- **Needs** are checked, never taken. A named thing must have a hand-written recipe. A higher
  tier also asks for some number of different things the player made themselves, at a depth,
  that the building wants (`town.tiers[].made`). Only materials and spells count.
  `checkNeeds` says each need in words; `refuseTier` answers `level-too-low`, `needs-missing`,
  or `not-enough-gold`, in that order.
- **Takings** (`takingsFor`) are the tier's, scaled by the building's quality tonight.
- **Perks** are a closed list (`perkSchema`). `perksOf` gathers one kind across the town, with
  the quality of the building each comes from.
- **Quality** (`buildingScore`, `buildingQuality`): the share of a building's wants its stock
  covers between them, plus `shifts.tierBonus` when the best stocked thing meets the building's
  tier, plus a live enchantment's bonus, plus the owner's rank bonus at their own building. It
  is judged on the shift's scale with no luck. Lifts (`liftsFor`, a lent hand, a good shift)
  then move it up, never past Perfect, and an empty building is always Meh.
  `previewQuality` answers the same sum with one thing added or cleared.
- **Cheer** (`cheerPoints`, `cheerBand`): a point per quality step of each building, per
  regular, and per live enchantment, in the bands under `town.cheer`. Worked out each time, never
  stored. A band raises takings by its share.
- A test holds the town to never being blocked: every named need and every townsperson can be
  made by fixed recipes, and every building can reach Good from fixed recipes alone.

### The day (routes)

The day service (`src/server/day.ts`) saves where each player is in their day and runs it with
the rules above.

| Route | Returns |
|---|---|
| `POST /api/players/:player/day/end` (no body) | `{ rewards, night, dusk, progress }` |

- `progress.day` is a `DayView` on every `progress`: `{ number, sun, length, noon, phase,
  candles, candlesMax, nightIn, canTurnIn, shiftDone, tonight, lastLedger, ... }`.
- **Every route that returns `progress` also returns `night` and `dusk`.** `night` is the
  `Ledger` when that action ended the day, otherwise null. `dusk` is a line to show when that
  action brought the evening on, otherwise null. Only combining, working a shift, the last
  answer to a visitor, and `day/end` can set either.
- **The sun** moves when a combine answers `firstDiscovery: true`, and when a shift is worked.
  Making something again, buying, learning, and gifts leave it alone.
- **`day/end`** is one call for both ways of stopping. From dusk it is going to bed: `night`
  comes back. From noon it is turning in early: `dusk` comes back, and the evening has
  `earlyCandles`. In the morning it is refused (400, code `rule`).
- **Night** also falls by itself: on the candle that was the last (`night` on that response,
  for now only the last answer to a visitor), and on the `nightAfter`th new discovery after
  dusk with no candle spent between them (`night` on that combine).
- When night falls the ledger is saved and the player is at dawn on the next day in the same
  step. `progress.day.lastLedger` is that ledger until the next night, so it survives a reload.
- **Each morning** the shop has a new shelf, the order board opens again at noon, and a new
  visitor is written once the player has made something.
- **The ledger** has `takings` empty and `cheer` null until there is a town. `deed` is true
  when the player gained a level that day. `lines` are plain, from `data/day-text.json`.
- **Saved games** from before days open at dawn on day 1 with everything they had and the
  shelf they last saw. The day numbers on old events and people, which were counted in events,
  are moved back to end at day 0, keeping their order and the gaps between them.

### The town (routes)

The town service (`src/server/town.ts`) saves each player's street and serves it with the rules
above.

| Route | Returns |
|---|---|
| `GET /api/players/:player/town` | A `TownView`: `{ plots, deeds, cheer, townsfolk, plans }` |
| `POST /api/players/:player/town/plots` (no body) | `{ plot, rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/build` with `{ plot, building }` | `{ rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/upgrade` with `{ plot }` | `{ rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/stock` with `{ plot, slot, entry }` | `{ rewards, night, dusk, progress }`. `entry: null` clears the shelf |
| `POST /api/players/:player/town/hand` with `{ plot }` | `{ rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/call` with `{ person }` | `{ line, fondness, rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/meal` (no body) | `{ lift, cost, rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/enchant` with `{ plot, spell }` | `{ days, rewards, night, dusk, progress }` |
| `POST /api/players/:player/town/tonight` (no body) | `{ line, entry, price, rewards, night, dusk, progress }` |

- **Townsfolk** arrive when their job is discovered, taken up or not, as a row among the
  player's people with `job` set. Until they are given names they go by their trade ("The
  Blacksmith"). They can be the evening's visitor, but do not count against the cast of
  people met through events (`maxActivePeople`), so they never crowd out new arrivals. A townsperson whose job has a building brings its plan.
- **Plots** are bought in order, at any time of day. Refused with `no-job` (no job yet, first plot only), `no-deed` (the level's deeds
  are used up) or `not-enough-gold`. The first costs 10 gold, and a quest asks for it.
- **Raising a building** needs a plot the player owns with nothing on it, the plan in hand, and
  no building of that kind standing already (all `rule`). Then, in this order: `level-too-low`,
  `needs-missing` (the sentence lists what is missing), `not-enough-gold`, `not-evening`,
  `no-candles`. It costs `day.costs.build` candles. Raising a tier is the same with
  `day.costs.upgrade`. Either can take the last candle, and then `night` comes back.
- **Stock** is a discovery on a shelf (a material or a spell the player has discovered), up to
  the tier's slots. Stocking is free and at any hour. A discovery is on one shelf at a time, so
  stocking it somewhere else moves it. Refusals are `rule`.
- **Quality** is worked out once in `standingBuildings` (`src/server/town.ts`) from the stock,
  the tier, other buildings' `lifts` perks, a hand lent this evening, a Great or Perfect shift
  worked today (own building only), and the owner's rank (own building only: the one their
  job runs). An empty building is Meh. **A hand** costs `day.costs.hand` candle, once a
  building an evening, and is refused on bare shelves.
- **Cheer** is `townCheer`: points from every building's quality, in the bands under
  `town.cheer`. `TownView.cheer` and the night ledger's `cheer` carry `{ points, band }` (the
  ledger's is null on an empty street), and the band's share raises every building's takings.
- **Takings** are paid by each standing building when night falls, through the gold ledger
  (reason `takings`, once a night a plot), at the quality it has tonight and raised by Cheer,
  and listed in the ledger's `takings`. Meh still pays.
- **Perks in force now, added:** `lifts`, `candles` (an extra evening candle, counted by
  `progress.day.candles` and by when night falls), and `rumour` and `gift` (on every `every`th
  day, at night, listed in the ledger's `brought`).
- **Townsfolk** are named from `data/townsfolk.json`, the next name nobody the player knows
  has, with its pronoun. A person who came before names existed is renamed once.
- **Calling on someone** (`/town/call`): +1 Fondness, a line from `callingLines` (the job's
  own, else the default), `day.costs.call` candle, once a person an evening. Works for people
  met in events too. A person whose fondness reaches `town.regularAt` is a regular for good:
  a point of Cheer, and `town.regularTakings` more takings at the building they work (a person
  met in an event, the Tavern).
- **A meal** (`/town/meal`, needs a Tavern): `5 x level` gold and `day.costs.meal` candle, once
  an evening. The next day's new discoveries pay `lift` more gold and XP (ledger reason `meal`).
- **Enchanting** (`/town/enchant`): a learned spell that fits the building (`enchantmentFits`),
  `day.costs.enchant` candle, one a building, a new one replaces the old. It adds
  `enchantBonus` to the quality, counts a point of Cheer, lasts `enchantmentDays`, and each
  night takes one off: the ledger says when one day is left and when it has faded.
- **One-night happenings** (`data/tonight.json`): rolled the first time a day is looked at, by
  the day rules and the reputation band's `tonightChance`, never two days running, shown in
  `progress.day.tonight` from noon. It is taken by doing what it changes (the musician's free
  first call, the supper's doubled meal, the festival's doubled enchantment) or, for the
  pedlar and the stargazer, by `/town/tonight` (no candle, evening only). Not taken by
  night, it is named in the ledger's `missed`.
- **Perks in force:** `opens-shop`, `shop-shelves` (the three tailored shelves, filled from
  the next morning), `shop-discount`, and `discovery-gold` (extra gold for a new discovery made
  by combining that carries one of the building's tags, ledger reason `perk`, included in
  `rewards.gold`). `meals` and `enchant-days` work through the meal and enchanting above. `learn-discount`
  does nothing yet.
- **In the view,** `enchantment` and `regular` are real, and `cheer` counts regulars and
  enchantments. `plans[].ready` and `next.ready` mean the level, the
  needs, and the gold are there; they say nothing of the hour or the candles.
- **Saved games:** a player who had bought from the shop and owns no plot is given the Market
  Stall on plot 0 at the tier with every shelf, the first time anything asks about their town.
  A saved player who never bought anything has no shop until they raise the stall.

### Work shifts (routes)

The shift service (`src/server/shifts/service.ts`) keeps each player's board, pays out, and
writes the log.

| Route | Returns |
|---|---|
| `GET /api/players/:player/shift` | A `ShiftBoard`: `{ job, rank, ready, slots, orders, options, rules }` |
| `POST /api/players/:player/shift` with `{ order, base, method, touch? }` | `{ result, rewards, night, dusk, progress, shift }` |

- The board is for the job the player has taken up. With no job, `job` is null and the rest is
  empty. It always holds `shifts.board` open orders: filling one brings a new one, and an open
  order is never dropped. Each job keeps its own orders and its own rank.
- `order` is the id of an order on the board. `base`, `method`, and `touch` are option ids from
  `options` (a staple's id starts with `staple:`). `touch` may be left out.
- `result` is a `ShiftResult`: `{ order, quality: { id, name }, line, gold, xp, rep, rankUp }`.
  `rankUp` is the new rank when this shift earned one, otherwise null. `rules` on the board lets
  the page preview a result with `previewRange` from `src/shared/shifts.ts`.
- `rewards` is whatever else the shift set off (a quest finished by its XP), as elsewhere.
  `shift` is the board afterwards.
- `progress.shiftReady` is true when a job is taken up, it is noon or later, and today's shift
  has not been worked. `progress.day.shiftDone` says the last of those by itself. `ready` on
  the board is the same answer. A shift moves the sun `day.shiftNotches`, which can bring dusk.
- Refusals are 400 with a `code`: `no-job`, `shift-not-ready`, or `rule` for an order that is
  not on the board or a choice that is not on offer.
- Gold is paid through the ledger (reason `shift`), XP counts toward level like any other, and
  standing moves for Great and Perfect. Every shift is logged in the `shifts` table.

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
- A result's name must be made of real words (`data/words.txt`), may not be only the
  ingredients' own names again, and may not be on `data/banned-results.json` (nothing from after
  the age of steam). `data/name-aliases.json` gives the one spelling of a name.
- Each basic thing has a `gloss` in `data/entries.json`, a few plain words shown to the model
  beside its name, so that Spirits is read as a drink and a Bat as an animal.
- A description may not use the words in `data/overused-words.json`.
- A pair can make nothing: a row with status `nothing` in `data/baked-combos.json` answers
  `no-result` (422) with a line from `data/no-result-lines.json`. `Bake Guide.md` has the rest.

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

## The overnight bake

`npm run bake` has the model work through every pair of basic things that has no recipe yet
(about 730), thinking harder than it can while a player waits. Nothing it makes is in the game
until it is approved.

For each pair it gathers candidates (the storybook choice if there is one, then two rounds of
the three questions), has the model **mark each one out of five with a reason** and say which it
would keep, and writes up the winner with the game's own describing step.

```
npm run bake                 # work through the pairs, carrying on from where it stopped
npm run bake -- --limit 10   # only that many pairs, for a trial
npm run bake -- pause        # stop within a second and let go of the model
npm run bake -- resume       # carry on
npm run bake -- status       # how far it has got and how long is left
npm run bake -- review       # write a reading list to var/bake/review.md, lowest marks first
npm run bake -- approve 4    # approve every draft marked 4 or better
npm run bake -- approve sand+water     # approve single pairs
npm run bake -- reject sand+water      # turn single pairs down
```

- **Sharing the PC** is set under `bake` in `config/model.json`. It works for `workMinutes`, then
  rests so that it is busy only `share` of the time (0.5 is half and half), and with
  `unloadWhileResting` it tells Ollama to let go of the model while it rests, which frees the
  video memory. While someone is playing the game it stands aside, and carries on once the game
  has left the model alone for `quietMinutes`. Stopped, crashed, or slept through, the next start
  skips what is already done.
- **Results** go to `data/baked-combos.json` as drafts, each with the model's mark and reason.
  A row with `status: "ok"` is a fixed recipe from the next server start. A baked thing can
  still be reached from other pairs while playing; a hand-written thing cannot.
- **Everything is kept** in `var/bake/`, which is not in git:
  - `pairs.jsonl`: one line per pair. What code decided, every candidate with its reason and
    its mark, what the rules refused and why, the pick and the runner-up, the words, and the
    seconds each step took.
  - `calls.jsonl`: every model call whole. The prompt, the answer, the model's own thinking,
    the effort, the tokens, the seconds, and whether the answer passed.
  - `prompts.json`: each system prompt once, under the id the calls refer to.
- The ranking runs at `bake.rankEffort`. If that fails or times out it is redone at ordinary
  effort, and the record says which.

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
