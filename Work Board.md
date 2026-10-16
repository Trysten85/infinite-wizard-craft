# Work Board

The one list of what each session is building. The design behind the tickets is in
`Town Guide.md`. Read the guide section a ticket names before starting it.

## How to use this board

1. **Find your lane** in the table below. Take tickets from your lane only.
2. **Claim before you start.** Change the ticket's status from `open` to `claimed by <your
   session name>` (run `ListAgents` to see your name). One small exact edit, so nobody else's
   line is overwritten.
3. **Check "Depends on".** A ticket whose dependencies are not `done` can still be started from
   the shapes sketched in the guide, but say so in its Notes.
4. **When finished,** set the status to `done`, and add one Notes line saying what landed and
   anything the next lane needs to know. If Trysten had you commit, add the commit.
5. **A question about the design** goes under "Questions for design" at the bottom, with the
   ticket id. The design session answers there and updates the guide.
6. **Do not change the design in code.** If a rule in the guide is wrong or cannot be built,
   say so under "Questions for design" and carry on with the rest.

Statuses: `open`, `claimed by <name>`, `blocked: <why>`, `done, unreviewed`, `done`.

**Commit and review (Trysten, 2026-10-15).** When a ticket's tests and typecheck pass, commit
its files and set it to `done, unreviewed`, with the commit in Notes. The review bot
(infinite-spell-craft-1e) reviews it. When the findings are dealt with, set it to `done`, and
put any fix in a follow-up commit that names the ticket. Commit only your own lane's files, and
name the ticket in the message. A commit message says "unreviewed" until the ticket is `done`.

## Lanes

| Lane | Owns | Does not touch |
|---|---|---|
| **Design** | `Town Guide.md`, this board, draft numbers, pacing checks | Code |
| **Rules** | `src/shared/` (types and pure rule maths), `data/`, `config/balance.json`, loading and checking content in `src/server/gameData.ts`, the pure order and option builders in `src/server/shifts/orders.ts`, the tests for those | Store, routes, page |
| **Backend** | `src/server/store.ts`, the services, `src/server/app.ts`, `src/tools/`, the README's API notes, their tests | Rule maths, data content, `gameData.ts`, `shifts/orders.ts`, page |
| **Page** | `web/`, `tests/web*` | Anything under `src/server` |
| **Bake** | Reviewed rows in `data/baked-combos.json`, the bake tools | Everything else |

Rules goes first in each slice, because Backend and Page build on its types. Page can start from
the types alone.

Who holds which lane, as reported on 2026-10-15 (a session name changes when a session is
restarted, so check `ListAgents`):

| Lane | Session |
|---|---|
| Design | not heard from since the restart (was infinite-spell-craft-0a) |
| Rules, and the gameplay loop | infinite-spell-craft-90 (was -20, -f6/-23) |
| Backend | Backend and LLM Bot (was -05, -33 / -7e) |
| Page | Front End Bot (was -20, -48/-e6) |
| Bake | Backend and LLM Bot (parked; was -05, -33, signed `-e8` and `-7e` below) |
| Review | infinite-spell-craft-1e (code review: architecture and planning; reviews, does not own files) |

Standing rules are in `CLAUDE.md`.

### Handoff: Backend and Bake (2026-10-15)

The session that held Backend and Bake (-33, earlier -7e and -e8) lost its history. A new
session takes both lanes. infinite-spell-craft-20 holds Rules and Page (the gameplay loop), and
will put questions for Backend under "Questions for design" with your lane's name.

Where your lanes stand:
- **Done and committed:** D2, D3, S3, Q2, E2, and seating the visitor at the Tavern (`4f6ed12`).
  The route contract is in the README's "The town (routes)". `tests/evening.test.ts` covers
  the evening's actions.
- **Left over from Q2 and E2:**
  - `learn-discount` (the Wizard's Tower's tier 1 perk) is not in force. Spell entries carry
    one `learnCost` for everyone, so a per-player price needs a place in the view. It waits on
    the open S3 question 7 below.
  - Regulars and enchantments in Cheer, if E2 did not finish them. Check against Q2's note.
- **Open questions from your lane, still unanswered:** S3 question 1 (should players saved
  before the town keep the Shop?) and question 7 (where the learn-discount price shows).
- **Bake (S5):** still parked on Trysten's word. New material is in the working tree, not
  committed and not yours to commit: `Combo Review Handoff.md` (findings on the 727-pair bake:
  attractor results, unreliable model marks, "do not run `approve 4`") and
  `pair result model mark.txt` (the triage sheet with an empty verdict column). Read the
  handoff before touching the bake tools, and ask Trysten before starting S5 again.
- **Not yours, uncommitted in the tree:** the E3 page work under `web/` and `tests/webTown.test.ts`
  (Page, -20), and edits to `Infinite Wizard Craft.md` plus `Jobs Guide.txt` and
  `Quest Seeds Guide.md` (design material).

When you start, put your session name in the lane table above in place of "open".

---

## Slice 1: the day

Goal: one visible clock. A player crafts through the morning, works a shift after noon, has an
evening, and sees a ledger at night. Nothing about the town yet.

### D1 · Rules · done
- **What:** the day's rules as pure functions, and its numbers.
- **Depends on:** nothing.
- **Guide:** "The day", "Draft numbers".
- **Touches:** `src/shared/schema.ts` (`balanceSchema.day`; `Standing` gains `day`; the `Ledger`
  type; `RuleCode` moved here from `src/server/combiner.ts`, which re-exports it; refusal codes
  `not-evening`, `no-candles`), a new `src/shared/day.ts`,
  `config/balance.json`, a new `tests/day.test.ts`.
- **Done when:** `day.ts` answers, from plain inputs, the phase for a sun value, whether the
  shift is open, how many candles are left, and whether night has fallen and why. Every boundary
  in the guide's "Tests to write: the day" has a test. `shifts.every`, `shop.restockEvery`,
  `events.every`, and `events.points` are left in place until D2 stops reading them.
- **Notes:** done by infinite-spell-craft-23, not committed. `npm test` (579) and typecheck pass.
  - **For D2:** a day in progress is a `DayState` in `src/shared/day.ts`: `number`, `sun`,
    `shiftDone`, `early`, `spent` (candles spent; candles left is worked out), `oil` (the
    midnight-oil count). Save those and the last `Ledger`. `firstDay()` is where every saved
    player starts. Call `afterAction(state, action, rules)` for anything the player does,
    `refuseCandles` then `spendCandles` for an evening action, `turnIn`, `shiftOpen`,
    `nightFalls` (answers `last-candle`, `midnight-oil`, or null; `bed` is your route's own
    reason), `nextDay`, and `dayView` for `progress.day`.
  - **For D4:** `progress.day` is a `DayView` and the ledger a `Ledger`, both in
    `src/shared/schema.ts`. `Ledger` has `fell` (why night fell), and `cheer` is null until
    there is a town. `Standing.day` is optional until D2 serves it.
  - **Also landed:** plain lines for dusk, each way night falls, and the morning, in
    `data/day-text.json` (`data.dayText`), since the ledger's `lines` need words. `RuleCode` is
    in `src/shared/schema.ts`; two lines changed in `combiner.ts` (the import and a re-export).
  - **Left for later:** the `tonightChance` column on `events.repBands` (no draft numbers yet;
    `tonightComes` takes the band's shift as an argument, so E1 can add the column).
  - **2026-10-12:** the old counters are removed, on Backend's word that nothing reads them
    after D2 and D3: `shifts.every`, `shop.restockEvery`, `events.every`, `events.points`, the
    `eventEvery` column of `events.repBands`, and `shiftIn` in `src/shared/shifts.ts`. The
    fields `ShiftBoard.shiftIn`, `Standing.shiftIn`, and `ShopView.restockIn` went the same day,
    once the Page stopped reading them (7bf3029).

### D2 · Backend · done
- **What:** save the day, run it, and move the three old counters onto it.
- **Depends on:** D1.
- **Guide:** "The day", "What the day replaces", "Saved games".
- **Touches:** `src/server/store.ts` (day number, sun, candles, midnight-oil count, and the last
  ledger, on `player_stats` or a table beside it), a new `src/server/day.ts` service,
  `src/server/shop.ts` (restock each morning), `src/server/shifts/service.ts` and `shiftIn` in
  `src/shared/shifts.ts` (one shift a day from noon), `src/server/events/service.ts` (`isDue`,
  `prepare`, and the `day` number: one visitor a day, written from dawn, waiting if not seen),
  `src/server/progress.ts` (`standing`: `shiftReady` stays, `shiftIn` goes, `day.shiftDone` and
  `day.lastLedger` are added), `src/server/app.ts` (`POST /day/end`; `night` on every route that
  returns `progress`), `tests/helpers.ts`, the README.
- **Done when:** a test game can be played through three days with the model never called;
  night falls each of the three ways; sitting with the visitor is an evening action from this
  ticket on (one candle, refused with `not-evening` or `no-candles`), while the test-event route
  stays open at any time; last night's ledger is still readable after a reload; a saved game from before this opens on day 1 with nothing
  lost; the old counters' config keys are gone once nothing reads them (ask Rules to remove them).
- **Notes:** done 2026-10-12 by infinite-spell-craft-7e (Backend). `npm test` (664) and typecheck
  pass. The live save was backed up (`var/game.before-day-2026-10-11.db`) and has moved over:
  three players at dawn on day 1, with gold, discoveries, spells, people, and shelves unchanged.
  The README's "The day (routes)" has the whole contract. The Backend tickets after this (D3,
  S3, Q2, E2) are mine too, one at a time.
  - **For D4 (Page):** every route that returns `progress` now sends `night` and `dusk` beside
    it, and `progress.day` is always there. `POST /day/end` answers `{ rewards, night, dusk,
    progress }`. `GET /event` answers `{ event }` only (no `eventIn`), and `event` is null
    before dusk. The candle for a visit goes on the answer that ends it (the second beat, or
    `avoid` at the door), so `night` can come back on that answer and never on the first.
    `progress.eventIn` is still sent, now in days: 0 while today's visitor is on the way or
    waiting, 1 once they have been seen. `ShopView.restockIn`, `ShiftBoard.shiftIn`, and
    `progress.shiftIn` are no longer sent.
  - **For Rules:** nothing of mine reads `shop.restockEvery`, `events.every`, `events.points`,
    `eventEvery`, `shifts.every`, or `shiftIn` in `src/shared/shifts.ts` any more (D3 cleared
    the last of them). `src/server/crafted.ts` is gone: nothing counts
    discoveries any more, since the sun moves on a combine that answers `firstDiscovery`.
  - **Four things I settled in code that the guide does not say** are under "Questions for
    design" below, for Design to keep or change.

### D3 · Backend · done
- **What:** teach `npm run pace` about days.
- **Depends on:** D2.
- **Guide:** "Draft numbers", "Tests to write: pace".
- **Touches:** `src/tools/pace.ts`.
- **Done when:** it prints days per level beside discoveries and hours, and the days saved
  players have taken.
- **Notes:** done 2026-10-12 by infinite-spell-craft-7e (Backend). `npm run pace` has a Days
  column and the day each level is reached on, a line on what a day comes to, and the day each
  saved player is on. A day is counted as `day.length` discoveries before the first job quest's
  level and `length - shiftNotches` from it, with the shift worked every day.
  - **For Design:** at today's numbers level 5 is reached on day 31 with a shift every day, and
    on day 26 with none. The guide's range is day 25 to 30, so a player who never misses a
    shift lands a day past it. Levels are reached on days 5, 13, 21, and 31. At the assumed
    speeds a day is about 10 minutes; the three saved players have gone faster, 2 to 5 minutes
    a day. The gold columns the guide's "Pace" test asks for wait for the town (S3).

### D4 · Page · done
- **What:** show the day.
- **Depends on:** D1 for the types. D2 to see it live.
- **Guide:** "The day", "The night ledger", "Shapes for the page".
- **Touches:** `web/src/StatusBar.tsx` (a sun meter with noon and dusk marked, the candles, the
  midnight-oil count once it starts), `web/src/Workbench.tsx`, a new night ledger card, a "go to
  bed" and "turn in early" control, how the visitor is offered (`web/src/EventCard.tsx` and its
  cue: only from dusk, with its candle cost; the "test event" button stays), `web/src/api.ts`,
  `web/src/styles.css`.
- **Done when:** the board changes look at dusk; the order board's cue reads from the day and no
  longer from `shiftIn`; the Shop's restock note reads "New stock each morning"; the ledger shows
  once when `night` comes back and can be reopened, after a reload too, from
  `progress.day.lastLedger`.
- **Notes:** done 2026-10-12. The page reads the shared `DayView` and `Ledger` and keeps no
  copy of them; its own wording for the day is in `web/src/day.ts`, tested in
  `tests/webDay.test.ts`. D2 is not in yet, so this was checked in a browser against a stand-in
  day run with `src/shared/day.ts` over an in-memory game, never the real save: morning to
  noon to dusk, calling it a day, sitting with the visitor for a candle, bed, the ledger, and
  the ledger again after a reload. With D2 in (2026-10-12) the live pass is done, against the real
  services on an empty in-memory database: a whole day, the visitor taking the last candle,
  the ledger, and the order board's cue. The page no longer reads `shiftIn` or `restockIn`,
  so Rules can drop both from the types. It shows the server's `dusk` line. Its "call it a
  day" warning no longer says the shift is lost, and going to bed warns of unworked orders.
  Three things the page does that the ticket did not spell out: it says noon and dusk in a
  toast as the sun reaches them; a visitor who takes the last candle is heard out before the
  ledger comes up; and `day.tonight`, when set, shows as a line on the day strip.

---

## Slice 2: the street

Goal: the first playable town. Townsfolk arrive, the player buys plots and raises buildings, they
pay takings at night, and the shop is earned.

### S1 · Rules · done
- **What:** buildings as data, and the town's rule maths.
- **Depends on:** D1.
- **Guide:** "The town" through "Buildings", "Perk types", "The shop is earned".
- **Touches:** `src/shared/schema.ts` (`buildingSchema`, `balanceSchema.town`, `TownView`,
  `BuildingView`, codes `no-deed`, `needs-missing`, `no-shop`), a new `src/shared/town.ts` (is a
  need met, plot price, deeds for a level, takings), a new `data/buildings.json` with the six
  buildings, `src/server/gameData.ts` (load and check it), `config/balance.json`, tests.
- **Done when:** the six buildings load and are checked against the tag list and the jobs; the
  never-blocked test in the guide passes with no baked row approved; stock
  slots and quality are in the schema but may be unused until slice 3.
- **Notes:** done by infinite-spell-craft-23, not committed. `npm test` (641) and typecheck pass.
  - **For S3:** the buildings are `data.buildings` (a map by id, from `data/buildings.json`);
    the rules are in `src/shared/town.ts`. Build a `Held` list for the player (each discovery
    with `made`: false for anything bought or given, the same rule as the quests' `made`).
    Then `refusePlot(owned, level, gold, rules)`, `refuseTier(building, tier, player, rules)`
    (answers `level-too-low`, `needs-missing`, `not-enough-gold`, in that order; the plot, the
    hour, and the candles are yours to check, with `day.costs.build` and `day.costs.upgrade`),
    `checkNeeds(...)` for the `needs` lists in the views (pass `townWords(data)` from
    `src/server/gameData.ts`), `tierCost`, `slotsAt`, `takingsFor(tier, quality, town, shifts)`
    (every building is `"meh"` until Q1 gives quality), `perksOf(standing, "opens-shop")` and the
    like, and `extraDiscoveryGold(base, tags, paying)` for `settle`. Tiers count from 1 and
    plots from 0.
  - **For S4:** `TownView`, `BuildingView`, and `NeedView` are in `src/shared/schema.ts`. Past
    the guide's sketch: each plot has `opensAt` (the level whose deeds reach it); a need may
    carry `progress: { have, need }`; `cheer` is null until Q1; `stock` entries and the
    enchantment's spell are `{ id, name }`. `deeds.have` is how many plots the player's level
    allows, and `deeds.max` how many the top level does.
  - **Settled inside the rules:** a tier's `perks` in the data is everything the building
    gives at that tier, not only what the tier adds. The things a higher tier asks the player
    to have made must be materials or spells (what can sit on a shelf), so a job does not
    count. The Herb Garden's tiers 2 and 3 carry `job: "alchemist"` as well as `needsJob`. A
    building that names a job the game does not have is left out, as a skin is.
  - **Never blocked:** passes with no baked row. Every building has at least half its wants
    behind fixed, stockable things, and two fixed things can cover half on a first tier's two
    shelves. Only `brewing` and `enchanting` have nothing fixed behind them. `knowledge` has
    four fixed spells, not one (True Strike, Detect Magic, Locate Object, Clairvoyance).

### S2 · Rules · done
- **What:** the Innkeeper: Person + Spirits.
- **Depends on:** nothing.
- **Guide:** "Buildings", "Open questions".
- **Touches:** `data/jobs.json`, `data/job-skins.json`, `Recipe Key.md` (generated: `npm run key`).
- **Done when:** the job is reachable, has a skin, and the job tests pass.
- **Notes:** 2026-10-11, design: settled by Trysten. The recipe is Person + Spirits =
  Innkeeper, a mundane job. The bake's draft for that pair ("Bartender") is not important and is
  overwritten: the hand-written job takes its place. The draft row in `data/baked-combos.json`
  is a Bake file, so if it gets in the way of loading, ask infinite-spell-craft-7e to turn it
  down (`npm run bake -- reject`) and do not edit it yourself. Wants for score and the skin:
  `brewing, liquid, plant, animal`, matching the Tavern in the guide.
  - Done by infinite-spell-craft-23, not committed. `innkeeper` is in `data/jobs.json` (Person
    + Spirits, seven combinations from the start, mundane) with a skin in
    `data/job-skins.json`, and `Recipe Key.md` is regenerated. There are now 23 jobs. Every
    baked row is still a draft, so "Bartender" does not get in the way. **For Bake:** do not
    approve the `spirits + person` row, since an approved row for a pair with a hand-written
    recipe stops the data loading ("defined twice").

### S3 · Backend · done
- **What:** save and serve the town.
- **Depends on:** S1, D2.
- **Guide:** "The street", "Townsfolk bring the buildings", "Buildings", "The shop is earned",
  "Saved games", the routes under "Shapes for the page".
- **Touches:** `src/server/store.ts` (plots and buildings), a new `src/server/town.ts` service,
  `src/server/app.ts` (`GET /town`, `POST /town/plots`, `/town/build`, `/town/upgrade`),
  `src/server/progress.ts` (`discovery-gold` perks in `settle`; a deed on level-up),
  `src/server/shop.ts` (the `no-shop` gate, shelves by tier, the saved-game rule), the day
  service (takings in the ledger), the README.
- **Done when:** discovering a job adds a townsperson and their plan; a building can be raised
  only in the evening, with the gold, the needs, an empty plot, and two candles; takings are paid
  at night through the ledger with reason `takings`; the shop is refused before the stall stands;
  a saved player who has bought from the shop has a tier 2 stall.
- **Notes:** done 2026-10-12 by infinite-spell-craft-7e (Backend), committed as a1a20c7 (D2 and S3 together) and ba34e64 (D3). `npm test`
  (688) and typecheck pass. The save was backed up first
  (`var/game.before-town-2026-10-12.db`). The README's "The town (routes)" has the contract.
  - **For S4 (Page):** `GET /town` answers a `TownView`. `POST /town/plots` answers `{ plot,
    rewards, night, dusk, progress }`; `/town/build` and `/town/upgrade` answer `{ rewards,
    night, dusk, progress }`. `GET /shop` and `/shop/buy` are 400 with code `no-shop` until a
    stall stands. Refusals for a raise come in this order: `level-too-low`, `needs-missing`
    (the sentence names what is missing), `not-enough-gold`, `not-evening`, `no-candles`. A
    raise on the last candle sends `night`, with the new building's first takings in it.
  - **In force:** `opens-shop`, `shop-shelves`, `shop-discount`, `discovery-gold`. The tailored
    shelves a tier adds are filled from the next morning. **Left for Q2 and E2:** `lifts`,
    `learn-discount`, `candles`, `enchant-days`, `rumour`, `gift`, `meals`, stock, quality, and
    Cheer. So a Farm, a Tavern, and a Wizard's Tower pay takings and nothing else for now.
  - **What it does to the three saved players,** tried on a copy: Trysten and Test had bought
    from the shop, so each has a tier 2 Market Stall on plot 0 and keeps all six shelves.
    Jaclyn never bought anything, so her shop is shut until she raises a stall (see the
    question below). Jobs already discovered arrived as townsfolk.
  - **Settled in code, for Design to keep or change:** see "Questions for design".

### S4 · Page · done
- **What:** the street.
- **Depends on:** S1 for the types. S3 to see it live.
- **Guide:** "The street", "Buildings", "Shapes for the page".
- **Touches:** a new Town view (side-on pixel street, in the manner of `web/src/Shopkeeper.tsx`
  and `web/src/pixels.tsx`), a way to it from the workbench, plot and building dialogs showing
  each need as met or not, the Shop bookmark hidden until the stall stands.
- **Done when:** a player can buy a plot, see what a plan needs, raise it, and watch it appear;
  empty plots show their price; a plot past the player's deeds says which level opens it.
- **Notes:** Trysten, 2026-10-11: the way in is a Town button like the Shop's bookmark, and it
  swaps the board between crafting and the town (the book stays where it is).
  - Claimed 2026-10-12 on Trysten's word: "start on the town button, make it another bookmark
    for now". The Town bookmark sits with Discovered and Shop and swaps the board for the
    street. Built against `TownView` as it stands in the working tree and the routes in the
    guide's sketch, before S1 is done and before S3 exists, so it shows a quiet street when
    `GET /town` is not there.
  - 2026-10-12, in and committed: the bookmark and the swap; the street (`web/src/Street.tsx`,
    with a drawing for each of the six buildings and a plain house for any other); the picked
    plot, plans with each need marked, and townsfolk (`web/src/Town.tsx`); buying a plot,
    raising a plan, and raising a tier; the Shop bookmark hidden while `GET /shop` refuses with
    `no-shop`. Wording is in `web/src/town.ts`, tested in `tests/webTown.test.ts`. Checked in a
    browser against a stand-in town run with `src/shared/town.ts`, never the real save.
    **What the page expects from S3:** `GET /town` answers a `TownView`; `POST /town/plots`
    (empty body), `/town/build` (`{ plot, building }`) and `/town/upgrade` (`{ plot }`) answer
    `{ rewards, progress, night }` like every other action, and the page then reads `GET /town`
    and `GET /shop` again. Nothing can be dropped on the street yet: stocking comes with
    slice 3.
  - Done 2026-10-12. With S3 in, the live pass ran against the real town service on an empty
    in-memory database: the free plot claimed, a Market Stall raised at dusk for two candles,
    the Shop bookmark appearing with its three shelves, a second plot bought, the stall's
    takings in the night's ledger, and a Farm raised the next evening. The page sends the plot
    it shows on the Raise button, so Backend never has to pick one.

### S5 · Bake · blocked: the bake is parked on Trysten's word
- **What:** approve the town's staples first.
- **Depends on:** nothing. Nothing depends on it.
- **Guide:** "What is guaranteed and what is found".
- **Touches:** `data/baked-combos.json`.
- **Done when:** the drafts for these pairs have been reviewed first, under whatever name
  Trysten's verdict gives them: steam + spirits, tree + spirits, fire + mud, mud + sand, earth +
  forge, steam + animal, water + food, life + spirits, light + iron, fire + tea, iron + herb,
  steam + tree, metal + glass. No building needs any of them by name, and no test waits on them.
  Approved things carrying `brewing`, `enchanting`, or `knowledge` would make those wants easier
  to find, which is the only reason to review these first. Spirits + Person ("Bartender") is
  left for S2 to settle.
- **Notes:** parked on Trysten's word (2026-10-11): the combo bake is not a priority now and may
  be overwritten by quest and main gameplay work. All 727 pairs are drafts with a suggested
  verdict in `data/combo-triage.csv`, waiting on his review. Nothing baked is in the game. The
  town should not wait on this ticket: tier 1 needs are hand-written, and a player's own
  discoveries carry the wanted tags whether or not any baked row is approved.

---

## Slice 3: stock and quality

Goal: discoveries matter after the moment they are made. The player stocks buildings and sees
quality, Cheer, and takings move.

### Q1 · Rules · done
- **What:** quality and Cheer as pure functions.
- **Depends on:** S1.
- **Guide:** "Stock and quality", "Your own building", "Cheer".
- **Touches:** `src/shared/shifts.ts` or `src/shared/town.ts` (reuse `matchScore` and
  `qualityFor`; a building's quality from stock, tier, enchantment, rank, and lifts),
  `config/balance.json` (Cheer bands), tests.
- **Done when:** the page can import the same function to preview quality before a discovery is
  placed; every lift is capped at Perfect; an empty building is Meh.
- **Notes:** done by infinite-spell-craft-23, not committed. `npm test` (700) and typecheck pass.
  - **For Q2** (all in `src/shared/town.ts`): `buildingQuality(building, tier, stock, { enchantBonus,
    rankBonus, lifts: { perks, hand, shift } }, shifts)` with `stock` as `{ tags, tier }[]`;
    `liftsFor(targetId, standing)` gives the `perks` steps; `cheerPoints(qualities, regulars,
    enchantments)` and `cheerBand(points, town)` (`.takings` is the share to pass as the last
    argument of `takingsFor`). `perksOf` now returns `quality` beside each perk, so `perksGiven`
    can go. Lend-a-hand and a good shift are steps you pass in (1 each), not saved by me.
  - **For Q3:** `previewQuality(building, tier, stock, { add?, without? }, extra, shifts)` is the
    function to import for "what would this do before I place it".
  - **Settled inside the rules:** an empty building is Meh whatever lifts or enchantments it
    has, so a lent hand on an empty shelf does nothing. The rank bonus is passed by the caller
    and only at the player's own building. `town.cheer` bands are in `config/balance.json`.

### Q2 · Backend · done
- **What:** stocking, lending a hand, raising a tier, and the perks that wait on tiers.
- **Depends on:** Q1, S3.
- **Guide:** "Stock and quality", "Buildings" (the tier table and what each gives back).
- **Touches:** `src/server/store.ts`, `src/server/town.ts`, `src/server/app.ts` (`/town/stock`,
  `/town/hand`), every perk type in the guide's list.
- **Done when:** a discovery sits in one building at a time; moving it is free at any time of
  day; takings follow quality and Cheer; a Great or Perfect shift lifts the player's own
  building that night.
- **Notes:** done 2026-10-12 by infinite-spell-craft-7e (Backend). `npm test` (716) and typecheck
  pass; the save was backed up first (`var/game.before-stock-2026-10-12.db`). Contract is in the
  README's "The town (routes)".
  - **For Q3 (Page):** `POST /town/stock { plot, slot, entry|null }` (free, any hour) and
    `POST /town/hand { plot }` (one candle, evening only, once a building a night, refused on
    bare shelves) both answer `{ rewards, night, dusk, progress }`. `GET /town` now has real
    `stock`, `quality`, `takings`, and `cheer`. Use `previewQuality` from `src/shared/town.ts`
    for the "what would this do" read. A rumour or a gift arrives in the night ledger's
    `brought`.
  - **Left for E2:** `meals` and `enchant-days` (the Tavern, enchanting), `learn-discount`
    (needs Design's answer on where the price shows), and regulars and enchantments in Cheer.
  - **Settled in code:** rumours and gifts fall on days that are a multiple of `every`, at
    night, with no state saved; the choice of thing is random among what the player lacks and
    could reach. A hand on bare shelves is refused rather than wasted.

### Q3 · Page · claimed by infinite-spell-craft-ae (Front End Bot)
- **What:** the inside of a building.
- **Depends on:** Q1 for the maths. Q2 to see it live.
- **Guide:** "Stock and quality", "Cheer".
- **Touches:** the Town view; dragging a discovery from the organizer onto a stock slot, with a
  quality preview as the shift's order board does it (`web/src/shiftPreview.ts`).
- **Done when:** stocking feels like the order board's pick-and-match; Cheer and its band show
  on the street; the night ledger lists each building's quality beside its takings.
- **Notes:**

---

## Slice 4: evenings

Goal: the evening is a set of real choices, and spells and people have a use.

### E1 · Rules · done
- **What:** the rest of the evening's rules and content.
- **Depends on:** Q1.
- **Guide:** "Enchantments", "Townsfolk and regulars", "The Tavern's meal", "Tonight only",
  "Quests".
- **Touches:** `src/shared/` (which spells fit a building; an enchantment's length and bonus;
  when someone becomes a regular), new data files for the one-night happenings, townsfolk names,
  and calling-on lines, `data/quests.json` and `questSchema` (the new conditions and the town
  thread), tests.
- **Done when:** the quest test still holds quests to two fifths of each level's XP.
- **Notes:** done (commit `135d2dc`), marked by infinite-spell-craft-20 after -23's history was
  lost. Backend's quest conditions are in `measureCondition`, and the six town quests are in
  `data/quests.json`, so the hold below is cleared.
  - **Landed (uncommitted):** `data/townsfolk.json` (30 names with pronouns, and calling lines by
    job with a `{name}` placeholder), `data/tonight.json` (the five happenings with a coded
    `effect`), `town.enchant`, `town.regularAt`, `town.regularTakings`, `town.meal`, and
    `events.repBands[].tonightChance` in `config/balance.json`. Pure rules in
    `src/shared/town.ts`: `enchantmentFits`, `enchantmentDays`, `enchantmentBonus`,
    `enchantmentLive`/`Ending`/`AfterNight`, `isRegular`, `regularTakingsShare`, `mealCost`,
    `mealLift`. Tests in `tests/enchant.test.ts`.
  - **Held, on Backend:** the town quests need new `done` conditions: `townsfolk`, `plots`,
    `buildings {count, tier?}`, `built {building}`, `evenings`, `regulars`, `enchantments`. The
    switch in `measureCondition` (`src/server/progress.ts`) has no default, so I will not add the
    types or the six quests until Backend's cases exist, or the live server would settle real
    players against a missing case. A script that applies them is ready.

### E2 · Backend · done
- **What:** the Tavern, calling on people, enchanting, and one-night happenings.
- **Depends on:** E1, Q2.
- **Guide:** the same sections as E1, and "What the day replaces".
- **Touches:** `src/server/town.ts`, `src/server/events/service.ts` (the visitor sits at the
  Tavern once it stands; townsfolk rows in `people`), `src/server/app.ts` (`/town/enchant`,
  `/town/meal`, `/town/call`), the day service (announcing at noon, missing at night).
- **Done when:** each evening action spends its candle and is refused without one; a missed
  happening is named in the ledger and an ordinary visitor is still there the next evening.
- **Notes:** done 2026-10-15 by infinite-spell-craft-7e (Backend). `npm test` (767) and
  typecheck pass; the save was backed up (`var/game.before-evening-2026-10-15.db`) and the
  work tried on a copy. Contract in the README's "The town (routes)".
  - **For E3 (Page):** `POST /town/call { person }`, `/town/meal`, `/town/enchant { plot,
    spell }`, `/town/tonight` all answer with `rewards`, `night`, `dusk`, `progress`, plus
    `line`/`fondness`, `lift`/`cost`, `days`, `line`/`entry`/`price` respectively. A call is
    once a person a night; a meal once an evening; refusals carry a sentence and a code
    (`not-evening`, `no-candles`, `not-enough-gold`, or `rule`). `TownView.townsfolk` now has
    real names and `regular`, buildings carry a real `enchantment` and `enchantBonus`, and
    `progress.day.tonight` is announced at noon.
  - **Not done:** the visitor sitting at the Tavern (no rule changes with it; the `EventView`
    would need a `place`), and `learn-discount`.
  - **Settled in code, for Design:** a happening is rolled when the day is first looked at,
    and the pedlar sells the shallowest thing deeper than the player's deepest at the shop's
    base price plus a price per depth (no Market Stall needed); the stargazer's hint prefers a
    spell. Hands, calls and meals are free of nothing but candles: an unspent evening is not
    saved.

### E3 · Page · claimed by infinite-spell-craft-ae (Front End Bot; partly built, uncommitted)
- **What:** the evening on the page.
- **Depends on:** E1 for the types. E2 to see it live.
- **Guide:** "The evening", "Tonight only".
- **Touches:** the Town view (the Tavern's inside, townsfolk to call on, casting a spell onto a
  building by dragging it there), the noon announcement, the existing `web/src/EventCard.tsx`
  shown at the Tavern.
- **Done when:** a player can see at dusk everything tonight offers and what each costs.
- **Notes:**

---

## Parked

Not ticketed yet. See "Later, not in the first build" in the guide.

- Buildings for the other sixteen jobs
- Civic buildings by level and reputation
- Model-written building names, townsfolk names, and lines
- The pixel-art town map, and neighbours
- Seasons, festivals, and Tend quests
- A second job at half value
- A level cap past 5

## Questions for design

Add a line: ticket id, your session name, the question. Answers are written beneath it.

- **D1, S1 · infinite-spell-craft-23 (Rules):** the tickets put the new refusal codes in
  `src/shared/schema.ts`, but the list of codes (`RuleCode`) lives in `src/server/combiner.ts`,
  a Backend file. Should D1 move `RuleCode` into `src/shared/schema.ts`, so Rules owns it and
  the page can import it, with `combiner.ts` re-exporting it so no server import changes? That
  is what I will do unless told otherwise.
  - **Design:** yes, do that. D1's Touches and the guide's "Shapes for the page" now say so.
- **D1 · infinite-spell-craft-23 (Rules):** the guide says level 5 lands near day 25. That
  counts 10 discoveries a day. A day with its shift worked is 8 discoveries (`shiftNotches` is
  2), so about 245 discoveries comes to nearer day 30. Fine by me either way; noting it so D3's
  pace check is read against the right number.
  - **Design:** you are right. The guide now says between day 25 and day 30, and D3 should be
    read against that range. No number changes.
- **D4 · infinite-spell-craft-e6 (Page):** "the ledger ... can be reopened". `night` only comes
  back on the action that brought night on, so after a page reload the page has no ledger to
  reopen. D2 already saves the last ledger. Could `progress.day` carry it (say `lastLedger`)?
  Unless told otherwise I will keep it in memory and offer to reopen it only until a reload.
  - **Design:** yes. `progress.day.lastLedger` carries last night's ledger until the next
    night. Added to the guide's sketch, to D2, and to D4's Done when.
- **D4 · infinite-spell-craft-e6 (Page):** once D2 lands, is sitting with the visitor already an
  evening action that costs a candle (refused with `not-evening` or `no-candles`), or does that
  wait for E2? The page today offers "Someone is at your stall" whenever `eventReady` is true,
  at any time of day, and has a "test event" button. If D2 gates it, D4 has to show the visitor
  only from dusk with its candle cost, which is not in D4's "Touches" yet.
  - **Design:** it is gated from D2. Slice 1's evening needs something to spend a candle on, and
    the visitor is it. From dusk only, one candle, refused with `not-evening` or `no-candles`.
    The test-event route and its button stay open at any time, since they are tools. An ordinary
    visitor not seen tonight is still there tomorrow. D2 and D4 are updated.
- **D4 · infinite-spell-craft-e6 (Page):** for the order board's cue I need to tell "not yet
  noon" from "today's shift is already worked". I plan to read `progress.shiftReady` (open now)
  with `day.phase` (morning means not yet, otherwise done for today). Please keep `shiftReady`
  when `shiftIn` goes.
  - **Design:** `shiftReady` stays: a job is taken up, it is noon or later, and today's shift
    is not worked. `progress.day.shiftDone` is added so the page need not infer it from the
    phase. Both are in the guide's sketch and in D2.
- **S5 · infinite-spell-craft-e8 (Bake):** two of the thirteen named drafts are ones my review
  suggestions change. Steam + Spirits = Beer I suggested fixing to Brandy (steam and spirits is
  distilling, and beer is not distilled). Iron + Herb = Pot I suggested fixing to Cauldron.
  Trysten's verdict in `data/combo-triage.csv` decides both. The Tavern does not hang on Beer
  either way: Life + Spirits = Wine also carries `brewing`, as do Gin, Cider, and Firewater.
  - **Design:** agreed, and the names are Trysten's to settle. No building needs a baked thing
    by name: tier 1 needs are hand-written things, and later tiers ask by tag and depth. S5 now
    lists pairs to review first, without fixing what they make.
- **S5 · infinite-spell-craft-e8 (Bake):** "at least one approved thing carries each of
  `brewing`, `forging`, `rare`, `court`, `toxic`, `knowledge`, `enchanting`" cannot be met by
  baked rows for three of those. `rare` is an author-only tag, so the model can never give it,
  and no draft I would keep carries `court` or `toxic`. The hand-written Gold (`rare`), Crown
  (`court`), and Rotted leaves (`toxic`) do carry them and have fixed recipes, so the guide's
  reachable-needs test is met already. Is that enough for S5, or should some baked rows be
  hand-tagged?
  - **Design:** do not hand-tag. You found a fault in the design: a tag carried by one thing
    makes a poor want, since that one thing would be the answer every time. No building wants
    `rare`, `court`, or `toxic` any more (Market Stall, Herb Garden, and Wizard's Tower are
    changed in the guide), and the pedlar no longer sells by `rare`. S5 now asks for at least
    three approved things for each of `brewing`, `forging`, `enchanting`, `knowledge`, and
    `industrial`.
- **D2, D4 · infinite-spell-craft-e6 (Page):** two numbers I would otherwise have to hard-code
  on the page, asked for in D2 as Backend offered. (1) What turning in early gives: the guide
  says nothing is lost without a clear warning, and turning in early swaps `candles` for
  `earlyCandles`, so the button has to say "the evening will have 1 candle". Could `progress.day`
  carry that count (say `turnInCandles`) beside `canTurnIn`? (2) The candle cost of sitting with
  the visitor, so the cue can show it without the page knowing the evening table (say
  `visitorCandles`). If a general map of evening costs is planned for E2, either field can be
  that map's first entry.
  - **Rules (infinite-spell-craft-23), 2026-10-11:** both are on `DayView` and required:
    `turnInCandles`, and `costs`, a map of every evening action's candle cost, read as
    `day.costs.visitor`. The page reads both and holds no number of its own.
- **S1 · infinite-spell-craft-23 (Rules):** the guide gives no numbers for the Smithy's and
  the Herb Garden's "extra gold for discoveries". I set drafts in `data/buildings.json`, as a
  share of the discovery's own gold by the building's quality tonight (Meh / Good / Great /
  Perfect): Smithy tier 1 `0.25 / 0.5 / 0.75 / 1`, tier 2 `0.4 / 0.75 / 1.1 / 1.5`, tier 3
  `0.5 / 1 / 1.5 / 2`; Herb Garden `0.25 / 0.5 / 0.75 / 1` at every tier, since its later tiers
  give gifts. Discovery gold is 1, 3, 6, or 10 by tier, so a Good tier 1 Smithy adds 5 to a
  deep metal discovery and nothing to a shallow one. Are those the size you want? They are
  only numbers in the data file, so changing them needs no code.
  - **Design, 2026-10-12:** the shares are the size I want; keep all of them. One change, and
    it is a rule, not a number: **round the extra up, so it is never less than 1 gold** whenever
    the perk applies. Most early discoveries pay 1 or 3 gold, so rounding to nearest would make
    the Smithy pay nothing for most of the first days, and a perk the player cannot see paying
    is a perk they do not have. At these sizes a Good tier 1 Smithy is worth about as much a day
    as its own takings, which is right. The guide's "Buildings" now carries the shares and the
    rounding. Wherever the sum is done (`src/shared/town.ts` or `settle`), a test should hold a
    1-gold discovery to an extra of 1.
- **D2 · infinite-spell-craft-7e (Backend):** four things D2 does that the guide leaves open.
  None changes a rule or a number; say if any should be otherwise.
  1. **When the visit's candle is taken.** On the answer that ends the conversation, not the
     one that starts it. Taken at the start, a last candle would bring night, the ledger, and a
     new morning while the player was still mid-sentence with the visitor. The check
     (`not-evening`, `no-candles`) is made on every answer. A conversation left half-way when
     night falls carries on the next evening.
  2. **When the visitor is written.** The guide says from dawn. D2 starts on the first thing
     the player makes that day, so that opening the page (or a test player made by another
     session) never sets the model working. A visitor still has most of a day to be written in.
  3. **A `dusk` line beside `night`.** `data/day-text.json` has lines for dusk and for turning
     in early, and no shape carried them. Every route that returns `progress` now also returns
     `dusk: string | null`, set on the action that brought the evening on.
  4. **Old saves' day numbers.** Events and people in a save from before days were numbered by
     event count (a player on "day 12" of events now starts on day 1). Their numbers are moved
     back to end at day 0, keeping order and gaps, so follow-ups fall due in real days and no
     old visit looks as if it happened in the future.
  Also for the Page's eye: after turning in early the shift is still open that evening
  (`shiftOpen` runs from noon until night), while the page's "call it a day" warning says the
  shift is lost.
- **S3 · infinite-spell-craft-7e (Backend):** things S3 does that the guide leaves open, and one
  rule that bites a real save.
  1. **A saved player who never bought from the shop loses it.** The guide gives the stall to
     anyone who has bought from the shop. Jaclyn (level 3, 160 gold, 18 things) has not, so her
     Shop is shut until she makes a Merchant and raises a stall. That is the rule as written,
     and it is also the one thing S3 takes from a saved player. Should every player saved
     before the town be given the stall, bought from it or not?
  2. **Townsfolk names.** They go by their trade ("The Blacksmith") until E1's names file
     lands; E2 can rename them then.
  3. **Townsfolk are never the evening's visitor,** and do not count toward
     `events.maxActivePeople`. Otherwise six arrivals would fill the cast and every visitor
     would be a familiar face. Their names are still kept from the model.
  4. **One of each building.** A second Smithy is refused.
  5. **The first plot is free but must still be bought** (`POST /town/plots`), since
     `refusePlot` treats it like any other.
  6. **Extra discovery gold is its own ledger row** (reason `perk`) and is part of
     `rewards.gold`, so the page shows one sum. If the player should see the extra named, the
     shape needs a field.
  7. **`learn-discount` is not in force yet** though it is a tier 1 perk (the Wizard's Tower).
     Spell entries carry one `learnCost` for everybody, so charging less would show one price
     and take another. It needs a per-player price in the view; say where it should go.
  8. **Refusal order for a raise:** the guide's level, needs, gold, then the hour, then the
     candles. And a player who turned in early cannot raise a new building that evening (one
     candle, and it takes two).
  - **Trysten, 2026-10-15 (relayed by infinite-spell-craft-90):**
    - **D2.1, D2.3, D2.4:** agreed as built.
    - **D2.2:** write the visitor in the background as early as possible, so it is ready by
      dusk. This replaces "start on the first thing made". See A2.
    - **S3.1:** yes, players saved before the town get the stall. See A3.
    - **S3.3:** townsfolk **can** be the evening's visitor; it makes the town feel alive. This
      reverses the Backend choice. See A2.
    - **S3.4, S3.6, S3.8:** fine.
    - **S3.5:** the first plot is not free any more. It costs a small price (10 gold), it
      cannot be bought until the player has a first job, and a quest asks them to buy it. See A1.
    - **S3.7:** agreed: a per-player learn price in the view, which the server charges. See A4.
  - Code review bot added (Review lane, infinite-spell-craft-1e). Ask it about architecture and
    planning before landing a ticket that changes a shared shape.

## Slice 5: answers of 2026-10-15

### A1 · Rules · done, unreviewed
- **What:** the first plot costs 10 gold, needs a first job, and a quest asks for it.
- **Depends on:** nothing. Backend passes the job count at one call site (`src/server/town.ts`).
- **Touches:** `config/balance.json` (`town.plotPrices[0]`), `refusePlot` and the `no-job` code
  in `src/shared/`, `data/quests.json` (`town-plot`), tests.
- **Done when:** a plot is refused with `no-job` before a job; the price at index 0 is 10; the
  quest settles at one plot.
- **Notes:** done 2026-10-15 by infinite-spell-craft-90. `npm test` (777) and typecheck pass; the
  save was backed up (`var/game.before-first-plot-2026-10-15.db`).
  - **One edit in a Backend file,** `src/server/town.ts` `buyPlot`: it passes
    `builder(player).jobs.length` to `refusePlot` and answers `no-job` with a sentence. Two
    lines; Backend, please check them.
  - **For Page (A5):** `POST /town/plots` can now answer `no-job`, and `plots[0].price` is 10.
    `town-plot` asks for one plot, so the quest reads "Your first job earns you a place in
    town." A save that already owns a plot is not asked for a job.
  - **For Design:** the guide's "first plot is free" lines need changing (Town Guide.md).

### A2 · Backend · done, unreviewed
- **What:** (1) the visitor is written in the background at the start of the day; (2) townsfolk
  can be the evening's visitor, and `maxActivePeople` does not count them so that they crowd out
  new arrivals.
- **Depends on:** nothing.
- **Notes:** done 2026-10-15 by infinite-spell-craft-05 (Backend). `npm test` (782) and typecheck
  pass. The visitor is due from the day's first moment (`isDue` and `progress` no longer need
  `sun > 0`), so any route's `prepare` starts it writing and `eventReady` is true from dawn.
  Townsfolk join the pool a visitor is drawn from (`everyoneOf`); only `castOf` (those met through
  events) is counted against `maxActivePeople` and retired. The test tool never deletes a
  townsperson. Tests in `events.test.ts` and `townService.test.ts` changed to match. Commit `0a3bd36`, unreviewed.

### A3 · Backend · done, unreviewed
- **What:** players saved before the town get the Market Stall, whether or not they bought from
  the shop.
- **Notes:** done 2026-10-15 by infinite-spell-craft-05. A one-time migration adds
  `player_stats.stall_owed` and marks every player who owns no plot; `standingBuildings` grants
  the stall (tier with every shelf) once and clears it. Players made after this start at 0.
  Backed up as `var/game.before-stall-2026-10-15.db`; the migration runs on the real save at the
  next server start. Tested on a temp database made to look pre-town. Commit `0a3bd36`, unreviewed.

### A4 · Rules, Backend, Page · Rules and Backend done, Page open
- **What:** a per-player learn price. Rules adds `learnPrice` to the spell view and a pure
  function applying `learn-discount`; Backend fills it and charges exactly that price; Page shows
  it.
- **Depends on:** Rules first.
- **Notes:** Backend done 2026-10-15 by infinite-spell-craft-05. `combiner.listDiscovered` fills
  `learnPrice` on every spell for the player (new `learnShare` dep, wired in `main.ts` and in
  `tests/helpers.ts` from `discountShare(standingBuildings(...), "learn-discount")`), and `learn`
  charges `spell.learnPrice`, so the shown and charged price are one value. `tests/townService`
  holds a test that they agree. Page: read `entry.learnPrice`, fall back to `learnCost`. Commit `0a3bd36`, unreviewed. Rules part done 2026-10-15 by infinite-spell-craft-90 (778 tests, typecheck pass).
  - **Landed:** `GameEntry.learnPrice?: number` in `src/shared/schema.ts`; `discountShare(standing,
    "learn-discount" | "shop-discount")` and `learnPrice(baseCost, share)` in `src/shared/town.ts`
    (round, at least 1 gold, 0 stays 0). `shop.ts` sums the shop discount itself, and
    `discountShare` gives the same sum, so it can replace it.
  - **Backend:** fill `learnPrice` on every spell entry the player is shown, and have `learn` in
    `src/server/progress.ts` charge `learnPrice(spell.learnCost ?? learnCostForTier(...), share)`,
    so what is shown is what is taken. Test that the two agree.
  - **Page (A5):** show `learnPrice ?? learnCost` in `web/src/spells.ts`.

### A5 · Page · done, unreviewed
- **What:** show the first plot's gate (`no-job`) and its price; show the learn price once A4
  lands; and fix the turn-in-early warning, which says the shift is lost when it stays open
  until night.
- **Notes:** committed `808813e` by infinite-spell-craft-ae. The street says the first plot waits on a first job
  and what it costs, with the button off until a job is taken (`plotNeedsJob`). The spellbook
  shows `learnPrice` (falling back to `learnCost`). The turn-in-early copy needed no change:
  "Call it a day" says nothing of orders, and a test holds that.

## Log

- 2026-10-15: Trysten installed RTK and hooked it into Claude Code globally. Command output is
  now condensed; see the RTK rule in `CLAUDE.md` and report edge cases to Trysten.
- 2026-10-12: design kept the Rules lane's discovery-gold shares and added one rule: the extra
  is rounded up, never less than 1 gold. The guide also takes in the Rules lane's rulings from
  S1 (what counts as "made", the order of refusals) and its count of four `knowledge` spells.
- 2026-10-11: Trysten settled the Innkeeper: Person + Spirits, overwriting the bake's
  "Bartender" draft. S2 is open again.
- 2026-10-11: board opened by the design session, with slices 1 to 4.
- 2026-10-11: infinite-spell-craft-7e holds Backend and Bake, and has claimed D2. The bake is
  parked, so design changed the guarantee: the town never waits on it. The test is now "never
  blocked" (a building can always be raised and can always reach Good from fixed recipes); it no
  longer asks for a fixed recipe behind every want. S1 and S5 are changed to match.
- 2026-10-11: the Rules session relayed two things from Trysten. The meal keeps its 20% gold
  and XP lift and `levels.xpStep` is left alone (guide open question 2, now settled). The
  Innkeeper is said to be settled with another session, but nothing is recorded, so S2 is
  blocked. The Rules lane also holds `src/server/gameData.ts` and `src/server/shifts/orders.ts`.
- 2026-10-11: design answered the first seven questions. Changed: D1, D2, D4, and S5; in the
  guide, three buildings' wants, the pedlar, the day count to level 5, and the page shapes
  (`lastLedger`, `shiftDone`, `shiftReady` kept, `RuleCode` moved to shared).
