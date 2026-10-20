# Work Board

The one list of what each session is building. The design behind the tickets is in
`Town Guide.md`. Read the guide section a ticket names before starting it.

## At a glance (for Trysten, in plain words)

**The first section to read, and the only one written for a person.** The sessions keep it
current: whoever finishes or starts something updates the line for it. The ticket codes in
brackets are for the sessions; you can ignore them.

**Last updated: 2026-10-20, by infinite-spell-craft-9c (the commit bot).**

### What is done
- The day, the street, buildings, stocking and quality, the evening's actions, and the
  town page. All built, reviewed and committed.
- The first plot costing 10 gold and needing a job, the visitor from dawn, old saves getting the
  stall, and one learn price. Built and committed (A1 to A4).
- Everything in the tree is now committed, including the big candle-to-moon rename, the cast and
  their stories, the quests, and Backend's bake and review tooling. Most of it still needs
  reviewing, and the commits say so.
- Hiring (the building first, the person second), the model's off-switch, the test-save builder
  and its picker, and the ⌛ in one place: all committed on 2026-10-20, with the tests passing
  (968) before the rework of the day began. Still unreviewed.

### Next up, before N3c: test saves and the model off (Slice 7)
- Coding rules from "Candle Gate", Tansy on day 2, timings in one place with a fast mode: **done
  by `-1c`, waiting for review (T1)**.
- The model switched off with a "Hey, fix the model" reminder (T2) and the test-save builder (T3):
  **Backend, `-5c`**. The ⌛ in one place (T4): **Page, `-d2`**.
- Buttons to swap between the test saves and start one over, shown only while developing (T5):
  **done by the Page, waiting for review**. The box sits folded in the bottom-left corner.

### What we are building now: the all-day town and the townsfolk
| In plain words | Who | State |
|---|---|---|
| Open most things all day; the shop and the shift close at dusk (N1) | Rules, `-1c` | **Rules built, tests pass; waiting for review and for Backend to switch it on (N2)** |
| Candles become time in code and ⌛ on the page (N8) | Rules, `-1c` | **Done, tests pass; waiting for each lane's review** |
| The rules for a hand-written cast of townsfolk: personalities, lessons, storylines (N3a) | Rules, `-1c` | **Built, tests pass; waiting for review** |
| Writing the six townsfolk and their stories (N3b) | Story Bot, `-e5` | **Free to fill in the data now** |
| Townsfolk who arrive homeless, move in, and teach their trade (N2, N4) | Backend, `-5c` | Waiting on the rules above |
| The People tab and the street changes (N5) | Page, `-d2` | Waiting on the rules above |
| Essential buildings that stay open in a plague (N6) | Rules, `-1c` | Later |
| The smaller quests, and the logic that checks quests (N7) | Quest Bot, `-f4` | Ready to start; works with Story |

### Who is doing what
| Session | Does | Right now |
|---|---|---|
| `-1c` | The rules and the gameplay loop | Cast rules and all-day rules done, unreviewed |
| `-5c` Backend and LLM Bot | The server and the combo bake | Waiting for review; three bake jobs are stuck because the model computer is unreachable |
| `-d2` Front End Bot | The page | Idle until the rules land |
| `-e5` Story Bot | The townsfolk's stories | Idle until the cast rules land |
| `-f4` Quest Bot | The smaller quests and quest logic | Ready to start; works with Story |
| `-1e` | Code review | Reviewing |
| `-9c` Commit Bot | Makes every commit, and keeps the history readable | Everything in the tree is committed, 86 commits in all, the last being the green floor under the rework of the day. Nothing is waiting on it |

### Waiting on Trysten
1. A go-ahead for `-1c` to start the two rules tickets, which unblocks everyone.
2. The model computer (Ollama) needs to be reachable for the bake to continue. The VM can see
   the host's network but the connection to port 11434 times out, which points at the host's
   firewall.
3. **Getting the code onto GitHub needs a token, not your password.** Everything is committed
   and the remote is already set, but GitHub has not accepted account passwords for git since
   2021, so the push fails no matter how often the password is changed. Make a token at
   github.com/settings/tokens (classic, tick `repo`) and paste it at the `Password:` prompt, or
   install `gh` and log in through the browser instead. Until that happens the only copies off
   this machine are `~/iwc-history-2026-10-20.bundle` (every commit) and
   `~/iwc-tree-snapshot-2026-10-19.tar.gz` (the whole tree, taken before the rename). Both are
   on this disk, which is the thing they are meant to protect against.

## How to use this board

0. **Keep "At a glance" current and in plain words.** No ticket codes without a plain sentence
   beside them. Trysten reads that section and nothing else. When you start, finish, or get
   blocked on something, change its line there too.

1. **Find your lane** in the table below. Take tickets from your lane only.
2. **Claim before you start.** Change the ticket's status from `open` to `claimed by <your
   session name>` (run `ListAgents` to see your name). One small exact edit, so nobody else's
   line is overwritten.
3. **Check "Depends on".** A ticket whose dependencies are not `done` can still be started from
   the shapes sketched in the guide, but say so in its Notes.
4. **When finished,** set the status to `done`, and add one Notes line saying what landed and
   anything the next lane needs to know. You do not commit; see "Commit and review" below.
5. **A question about the design** goes under "Questions for design" at the bottom, with the
   ticket id. The design session answers there and updates the guide.
6. **Do not change the design in code.** If a rule in the guide is wrong or cannot be built,
   say so under "Questions for design" and carry on with the rest.

Statuses: `open`, `claimed by <name>`, `blocked: <why>`, `done, unreviewed`, `done`.

**Commit and review (Trysten, 2026-10-16, final).** Nobody commits but the commit bot.

- **Owner:** tests and typecheck pass → status `done, unreviewed` → one Notes line (what landed,
  which files) → stop.
- **Review bot (infinite-spell-craft-1e):** reviews, fixes what it finds in the working tree,
  then adds a row under "Ready to commit" below and stops. It no longer commits.
- **Commit bot:** checks the tree is quiet, re-runs tests and typecheck, stages exactly the listed
  files, writes the message, commits, sets the ticket to `done` with the SHA in Notes, and
  clears the row.

Owners do not finalize their own tickets and do not message the bots; they read this board.
Messages between sessions are kept to what cannot go here.

A Bash hook (`.claude/hooks/git-guard.py`) refuses `git commit`, `add`, `merge`, `rebase`,
`reset`, `revert`, `cherry-pick`, `stash`, `tag`, `push`, `pull`, `am`, `rm`, `mv`, `checkout`,
`restore`, `switch`, `clean`, `update-ref`, and `commit-tree` from every session except the one
whose id is in `var/commit-bot-session`. **To claim or re-claim it after the commit bot
restarts:** the commit bot runs `git add -n .`. The refusal prints its session id, and Trysten
runs this in his own terminal (not through Claude):
`echo <session id> > "/home/trysten/Documents/Infinite Spell Craft/var/commit-bot-session"`

## Ready to commit

The commit bot owns every commit and takes work only from this table. It removes a row once
committed and puts the SHA in the ticket's Notes.

| Ticket | Files | Tests/typecheck | What landed, and what review changed |
|---|---|---|---|

Nothing waiting. Everything that stood here on 2026-10-19 is committed; see the Log for the
three SHAs and for why N8 and the five lanes' work had to go in as one commit. A5 needed no
code and is set to `done`.

## Lanes

| Lane | Owns | Does not touch |
|---|---|---|
| **Design** | `Town Guide.md`, this board, draft numbers, pacing checks | Code |
| **Rules** | `src/shared/` (types and pure rule maths), `data/`, `config/balance.json`, loading and checking content in `src/server/gameData.ts`, the pure order and option builders in `src/server/shifts/orders.ts`, the tests for those | Store, routes, page |
| **Backend** | `src/server/store.ts`, the services, `src/server/app.ts`, `src/tools/`, the README's API notes, their tests | Rule maths, data content, `gameData.ts`, `shifts/orders.ts`, page |
| **Page** | `web/`, `tests/web*` | Anything under `src/server` |
| **Bake** | Reviewed rows in `data/baked-combos.json`, the bake tools | Everything else |
| **Commit** | The git history: every commit and its message, `Process.md`, the commit conventions, `.gitignore`, the remote | Every other lane's work. It commits their files; it never writes them |

Rules goes first in each slice, because Backend and Page build on its types. Page can start from
the types alone.

Who holds which lane, as reported on 2026-10-15 (a session name changes when a session is
restarted, so check `ListAgents`):

| Lane | Session |
|---|---|
| Design | not heard from since the restart (was infinite-spell-craft-0a) |
| Rules, and the gameplay loop | infinite-spell-craft-90 (was -20, -f6/-23) |
| Backend | Backend and LLM Bot, infinite-spell-craft-5c (was -05, -33 / -7e) |
| Page | Front End Bot, infinite-spell-craft-ae (was -20, -48/-e6) |
| Bake | Backend and LLM Bot, infinite-spell-craft-5c (round 2, un-parked 2026-10-18; was -05, -33, signed `-e8` and `-7e` below) |
| Review | **Review Bot**, infinite-spell-craft-97 (was -1e, same session, renamed on a restart — the review notes below signed `-1e` are mine). Code review: architecture and planning. Reviews every ticket at `done, unreviewed`, fixes what it finds in the working tree, then adds a row to "Ready to commit" and stops. Owns no files and commits nothing |
| Commit | **Commit Bot**, infinite-spell-craft-9c, session `a466cb88-3747-4456-8286-418e0cc834c2` (claimed 2026-10-17). The only session the hook lets run `git commit`; `-97` is not it. Takes work only from "Ready to commit" above, stages exactly the files a row names, writes the message, commits, and clears the row. Owns no code and reviews nothing, so if your ticket is finished, leave it in the tree and say so on the board — it does not need a message. What a commit here should say is in `Process.md` |
| Story | **Story Bot**, infinite-spell-craft-e5: the cast and their storylines in `data/townsfolk.json` (or `data/cast.json`), lessons, calling lines, and the prompts for story and Tavern lines. Owns the **overarching quests**: each person's arc and the town-wide thread that links them. Content only; does not touch `src/` or `web/` |
| Quest | **Quest Bot**, infinite-spell-craft-f4 (Trysten, 2026-10-19): the **smaller quests** (`data/quests.json`: the town quests, side quests, the template lessons for jobs with no written person) and **all quest logic**: the `done` condition types in `src/shared/schema.ts` and how `measureCondition` in `src/server/progress.ts` counts them. Small exact edits in those two shared files. Works with Story: Story writes the big arcs, Quest builds the pieces and conditions they need |

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

### S5 · Bake · superseded by round 2 (B1-B8 below)
- **Notes:** parked 2026-10-11; un-parked 2026-10-18 on Trysten's word (he added `Combo Bake 2.md`
  and `Approved Combos.md`). The old "Done when" (13 staples first) is replaced by the plan in
  `~/.claude/plans/jsut-added-combo-bake-streamed-squid.md`. Town still never waits on the bake:
  nothing baked goes live until its description is rewritten and it is approved.

### Bake round 2 · Bake (claimed by the Backend and LLM Bot, 2026-10-18)
Decided with Trysten: carve 20 held-out pairs from the 61 approved; keep the current pipeline and
add the spec's single reasoning-first call as a second mode, A/B on the held-out set. A judge
model picking among many candidates is out of scope for this round.
- **B1 · seed the cache** · claimed: code done, live step waiting on the model. `npm run bake --
  seed` has run: 48 approved pairs are `fix` rows, 20 are held out (`data/combo-heldout.json`), 5
  are queued for alternatives; the old drafts are in `var/baked-combos.before-seed-2026-10-19.json`.
  `npm run bake -- redescribe` writes their new descriptions and puts them in the game; it needs
  the Ollama box at the `url` in `config/model.json`, which was not reachable from here.
  Files: `src/server/bakeSeed.ts`, `src/tools/bake.ts`, `src/server/bake.ts` (`describePair`),
  `src/shared/schema.ts` (`source`), `data/approved-combos.json`, `data/combo-heldout.json`,
  `data/baked-combos.json`, `tests/bakeSeed.test.ts`, `tests/bake.test.ts`.
- **B2 · automatic gates** · done, unreviewed. New triage flags (`reason names only one
  ingredient`, `middling mark`, `no tags`), `isHardFlag`, and a gate in `bakePair` that gives
  way to the next best candidate up to `generation.gateTries` (3) and otherwise queues the pair
  with a note. `blanket` added to `data/overused-words.json`. Files: `src/server/bakeTriage.ts`,
  `src/server/bake.ts`, `src/shared/schema.ts`, `config/balance.json`, `data/overused-words.json`,
  `tests/bakeTriage.test.ts`, `tests/bake.test.ts`. **Not done:** the spec's modern-name list in
  `data/banned-results.json` (the existing list is kept; Rules may want to extend it).
- **B3 · retrieval from approved rows, and "don't" examples** · done, unreviewed. `approvedExamples`,
  `DONT_EXAMPLES`, an `avoid` set and one-per-result in `pickExamples`; `combo.examples` 6 to 8.
  Used by the bake and score tools only. **The live game still uses the hand-written examples**:
  wiring approved examples into `main.ts` waits on the A/B. Files: `src/server/comboContext.ts`,
  `src/server/comboGenerator.ts`, `config/balance.json`, `tests/comboContext.test.ts`.
- **B4 · single-call mode** · done, unreviewed. `src/server/comboSingle.ts` and `--way single |
  single-lean`; a pair with no sensible result is kept as a draft row named Nothing to confirm.
  The game path is unchanged. Files: `src/server/comboSingle.ts`, `src/server/bake.ts`,
  `tests/bakeSingle.test.ts`.
- **B5 · held-out scorer and A/B** · claimed: code done, the live run waits on the model.
  `npm run bake -- score --way all` writes `var/bake/round2/score-<way>.md`. Files:
  `src/server/bakeScore.ts`, `src/tools/bake.ts`, `tests/bakeScore.test.ts`.
- **B6 · regenerate the remaining pairs** · claimed: `--round2` run mode is in (own record file,
  leaves settled, held-out and queued pairs alone); the run waits on B5's winner and the model.
  `approve <mark>` now needs `--i-know`.
- **B7 · keyboard review tool** · done, unreviewed. `npm run review`. Smoke-run against the real
  file with a piped `q` (nothing saved); the interactive keys cannot be driven from a test, so
  the logic lives in tested pure modules. Queue today: 109 pairs (5 alternatives, 54 priority 1,
  50 sample). Files: `src/tools/review.ts`, `src/server/reviewQueue.ts`,
  `src/server/reviewAlternatives.ts`, `package.json`, `tests/reviewQueue.test.ts`,
  `tests/reviewAlternatives.test.ts`.
- **B8 · acceptance checks and the Bake Guide** · done, unreviewed. `acceptanceChecks` now holds
  Water + Salt to Saltwater and Steam + Salt to not Sea; the Bake Guide has a Round 2 section and
  the README lists the new commands. Files: `src/server/bakeTriage.ts`, `Bake Guide.md`,
  `README.md`.
- **Small edits made in Rules files, exact lines only:** `bakedComboSchema` gains an optional
  `source`; `generation.gateTries` (3) added to the schema and `config/balance.json`;
  `generation.examples` 6 to 8; `blanket` and `blankets` added to `data/overused-words.json`.
  No `combo.mode`: the way is the `--way` flag on the bake tool. `data/banned-results.json` is
  untouched. Rules: shout if you object.
- **FYI:** `data/tags.json` has 30 tags, the spec says 32 (`fantasy-tag-vocabulary.md` is not in
  the repo).

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

### Q3 · Page · done, unreviewed
- **Reviewed** 2026-10-19 by infinite-spell-craft-1e: the pass is right, and the three "Done
  when" claims check out (drag onto a `slot:` zone, Cheer in the street header, quality beside
  takings in `web/src/NightLedger.tsx`). One fix made in the tree: `stockChange` asserted a stub
  `{ wants } as Building` into the shared rule, which was true only while `buildingScore` reads
  nothing but `wants` — the day it reads a second field the page alone would have read
  `undefined`, with no type error and no failing test. The rule now asks for `Wanting`
  (`Pick<Building, "wants">`), so the stub needs no cast and any widening breaks the build
  instead. Waiting in "Ready to commit".
- **What:** the inside of a building.
- **Depends on:** Q1 for the maths. Q2 to see it live.
- **Guide:** "Stock and quality", "Cheer".
- **Touches:** the Town view; dragging a discovery from the organizer onto a stock slot, with a
  quality preview as the shift's order board does it (`web/src/shiftPreview.ts`).
- **Done when:** stocking feels like the order board's pick-and-match; Cheer and its band show
  on the street; the night ledger lists each building's quality beside its takings.
- **Notes:** done 2026-10-18 by Front End Bot (infinite-spell-craft-ae), not committed. The work
  itself landed with E3 and the Q1 review: a discovery dragged onto a shelf is stocked
  (`slot:` zone → `stockShelf`), and each shelf shows the exact change (`stockChange` with the
  building's `lifts`, `rankBonus`, `enchantBonus`) in `web/src/Shelves.tsx`; Cheer and its band
  are in the street header (`web/src/Town.tsx`); the ledger lists quality beside takings
  (`web/src/NightLedger.tsx`). This pass: `web/src/town.ts` (a stale "no lift" comment) and
  `web/src/day.ts` + `tests/webDay.test.ts` (`visitorCue`'s `place` is now required, per review
  E3's note). 839 tests, typecheck clean.

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

### E3 · Page · done
- **Reviewed** by infinite-spell-craft-1e: the page named game content by id (the Tavern, and the
  two happenings taken by asking). The view now carries `BuildingView.meals` and
  `TonightView.action`, and the page knows no ids. Fixes in `7f40c95`; see "Review: the order
  writer and E3".
- **What:** the evening on the page.
- **Depends on:** E1 for the types. E2 to see it live.
- **Guide:** "The evening", "Tonight only".
- **Touches:** the Town view (the Tavern's inside, townsfolk to call on, casting a spell onto a
  building by dragging it there), the noon announcement, the existing `web/src/EventCard.tsx`
  shown at the Tavern.
- **Done when:** a player can see at dusk everything tonight offers and what each costs.
- **Notes:** committed `a70cae8` (the evening panel and its calls landed in `808813e`) by
  infinite-spell-craft-ae. The Tavern's plot is marked while a visitor waits there, its panel has
  "Sit with them", and tonight's happening is told once as a toast when first seen. The page
  falls back to "Tavern if one stands" before the event is in hand; if `Progress` carried the
  visitor's `place`, that fallback could go.


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

- **N2 · infinite-spell-craft-5c (Backend):** four things N2 met that the guide leaves open.
  1. **A first plot can deadlock.** The first plot needs a townsperson who has *arrived*
     (A1-1 pinned it to arrivals). The cast's Blacksmith arrives only with a building standing
     (`arrival.buildings: 1`). A player whose only trade so far is the blacksmith can never buy
     a plot, so never a building. Should the plot ask for a *discovered* trade instead, or
     should no first-tier person wait on a building?
  2. **Homeless and calls.** Homeless townsfolk leave at dusk, and calls are evening-only, so a
     homeless person can never be called on, and so never gain Fondness that way, while the
     guide says "until then the person can be called on but gives no service". As built, the
     leaving wins. Should calls on the homeless be allowed by day, or leaving wait?
  3. **Services** (commissions on the order board, hints, reforges) and the homeless' "worst
     prices" have no data, numbers, or rules yet. Whose ticket is that: N6, or a new one for
     Rules then Backend?
  4. **Small calls made in code:** a "shared" home is never homeless; a trade with no building
     has no home to wait for, so never leaves; neighbours change takings only, not Cheer
     (Cheer is town-wide); the store keeps one meal and one hand a day, so `day.limits` above
     1 would need a store change.


- **N4 · infinite-spell-craft-5c (Backend):** what N4 needs before its last two parts can be built.
  1. **Story scenes cost a candle?** The guide lists "a story scene" among the evening's people
     actions, but a beat is played by code in `settle` the moment its condition is met, at any
     hour, as quests are. As built, beats play themselves and the scene is read in the People
     tab. If watching a beat should be an evening action, it needs a `scene` row in `day.access`.
     - **Trysten, 2026-10-19 (relayed by Story, -e5):** a beat **pays the moment it is done**, as
       built. Its **scene waits** at the person's door and plays when the player visits that
       evening, for ⌛. Skipping it loses nothing, and it stays readable in the People tab. So it
       needs a `scene` row in `day.access`. Also settled: **the cast's story is hand-written,
       with nothing left to the model**, and the player is silent. See N3c, N3d and N4c.
  2. **The Tavern pair scene** needs rules: which pairs (likes only, or dislikes rarely: Story's
     question 3), how often (every night? a chance?), what each outcome does in code (a
     friendship: Fondness for both? a rumour: a hint, like the stargazer's? a gift: a discovery?),
     and a `listen` row in `day.access` with its cost. Rules first, then Backend writes it.
  3. **Villagers** (Aldous, Pim, Vesper in `Story Guide.md`) have no data file or schema: who
     they are, which seed or happening brings them, and the quest after which they settle.
  4. **Beat rewards** `perk`, `plan` and `commission` are recorded but do nothing yet (see N4a).
     A perk needs a place in `perksAt`/`perksOf` per player; an early plan needs `refuseTier` to
     read it; a commission waits on services (N2's question 3).


## Slice 5: answers of 2026-10-15

### A1 · Rules · done
- **What:** the first plot costs 10 gold, needs a first job, and a quest asks for it.
- **Reviewed** by infinite-spell-craft-1e: one real bug (the page's gate asked a different
  question from the server's) and `refusePlot` reshaped. Fixes in `1bf0c0c`; see "Review".
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

### A2 · Backend · done
- **Reviewed** by infinite-spell-craft-1e: the due-rule was written twice and had drifted; it is
  now one `visitorDue` in `src/shared/day.ts` (`1bf0c0c`). One question for Design is open, under
  "Review" — a bare page load now starts model work.
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

### A3 · Backend · done
- **Reviewed** by infinite-spell-craft-1e: the migration is sound. Two findings left for Backend
  under "Review" (A3-1 the redundant shop-ledger clause, A3-2 a query that grants property); no
  code change needed to finalise.
- **What:** players saved before the town get the Market Stall, whether or not they bought from
  the shop.
- **Notes:** done 2026-10-15 by infinite-spell-craft-05. A one-time migration adds
  `player_stats.stall_owed` and marks every player who owns no plot; `standingBuildings` grants
  the stall (tier with every shelf) once and clears it. Players made after this start at 0.
  Backed up as `var/game.before-stall-2026-10-15.db`; the migration runs on the real save at the
  next server start. Tested on a temp database made to look pre-town. Commit `0a3bd36`, unreviewed.

### A4 · Rules, Backend, Page · done
- **Reviewed** by infinite-spell-craft-1e: shown and charged are one number, and `saveGenerated`
  now drops `learnPrice` so one player's discount cannot reach the rows every player shares
  (`1bf0c0c`). The Page part landed in A5. A4-1 is left for Backend's judgement under "Review".
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

### A5 · Page · done
- **Reviewed** 2026-10-19 by infinite-spell-craft-1e: no code needed. This code was reviewed in
  the A1-A5 pass and every finding against it is already fixed in `1bf0c0c` — the Buy button
  disabled on `!!progress.job` while the server counts arrived townsfolk (A1-1, the real bug),
  `plotText`'s permissive `hasJob = true` default (E3-3), `plotNeedsJob` restating the server's
  rule (E3-4), and the spellbook showing the undiscounted price (A4-3). Nothing to stage; the row
  in "Ready to commit" asks only for the status.
- **What:** show the first plot's gate (`no-job`) and its price; show the learn price once A4
  lands; and fix the turn-in-early warning, which says the shift is lost when it stays open
  until night.
- **Notes:** committed `808813e` by infinite-spell-craft-ae. The street says the first plot waits on a first job
  and what it costs, with the button off until a job is taken (`plotNeedsJob`). The spellbook
  shows `learnPrice` (falling back to `learnCost`). The turn-in-early copy needed no change:
  "Call it a day" says nothing of orders, and a test holds that.

## Slice 6: an all-day town and townsfolk as neighbours (2026-10-18)

Trysten's direction, written up in "Townsfolk as neighbours" in `Town Guide.md`. Draft numbers go
in `config/balance.json`. Back up `var/game.db` before any progression change.

### N1 · Rules · done, unreviewed
- **What:** the access table (what is open when) and its tests; the shop and the order board
  close at dusk; daytime actions stop costing candles and gain once-a-day limits; a raise
  finishes overnight; the arrival conditions, likes and dislikes, and neighbour maths.
- **Touches:** `config/balance.json` (`day`), `src/shared/schema.ts`, `src/shared/town.ts`,
  `data/townsfolk.json`, tests; `npm run pace` rechecked for level 5 between day 25 and 30.
- **Also (Trysten, 2026-10-19): candles become the sun and the moon.** Rename `candles` to
  `moonSteps` (and `earlyCandles` to `earlyMoonSteps`, `day.costs` keys keep their names),
  `no-candles` to `no-moon`, and every line in `data/day-text.json` and `data/`, so that no text
  says "candle". Add the labelled track to the views: the phase name (Morning, Noon, Afternoon,
  Dusk, Night), the moon steps left, and what closes at dusk. See "The sun and the moon" in the
  guide. **Split out as N8 below**, because the word is in about 430 places across every lane.
- **Notes:** the rules are done 2026-10-19 by infinite-spell-craft-1c: `npm test` (890) and
  typecheck pass; no commit; the save was backed up (`var/game.before-allday-2026-10-19.db`).
  - **Landed:** `day.access` (per action, `anytime` or `evening`), `day.limits` (`mealsPerDay`,
    `handsPerBuilding`), `town.raiseNights` (1), `town.neighbour` (`reach`, `liked`, `disliked`,
    `cap`); in `src/shared/day.ts` `shopOpen` and `refuseAction`; `shiftOpen` now closes at dusk
    (a player who turns in early gives the shift up, so the page's warning is now true); in
    `src/shared/cast.ts` `arrivalMet` and `neighbourShift`. The loader refuses an `anytime`
    action that still costs candles.
  - **The switch is not flipped:** `day.access` is `evening` for every action, so the game
    plays as before, except that the shift now closes at dusk. **N2 flips it.**
  - **For Backend (N2):** call `refuseAction` instead of `refuseCandles`; set `access` to
    `anytime` and the cost to 0 for meal, hand, enchant, upgrade and build; keep visitor and call as
    `evening`; stop the shop at dusk with `shopOpen`; enforce `limits`; make a raise finish after
    `town.raiseNights` nights; add `neighbourShift` to a building's takings; use `arrivalMet` for
    who arrives; update the tests that expect these to be evening-only.
  - **Pace:** `npm run pace` reaches level 5 on about day 31, a little past the guide's 25 to 30.
    I did not check whether that moved with this change; the shift closing earlier is the only
    behaviour change so far. Worth a look when N2 lands, since candle costs change then.

## Slice 7: test saves, the model off, timings in one place (Trysten, 2026-10-19)

The plan is `/home/trysten/.claude/plans/d2-1-agree-on-toasty-pebble.md`. These come before N3c.

### T1 · Rules · done, unreviewed (infinite-spell-craft-1c)
- **What:** the "Candle Gate" coding rules in `Process.md` ("Keep things swappable") with a
  pointer in `CLAUDE.md`; `arrival.day` in the cast schema and `arrivalMet`; Tansy comes on day 2
  (`data/cast.json`); `events.followUpDays` (2) in `config/balance.json`; `readBalance` and
  `overlay` in `src/server/gameData.ts`, which lay `config/balance.<name>.json` over the real file
  when `BALANCE=<name>` is set; `config/balance.fast.json` (a 4-notch day, a happening every day,
  raises at once, follow-ups after 1 day); the test-save schema (`testSavesSchema` in
  `src/shared/schema.ts`, `testSaveProblems` in `src/shared/testSaves.ts`) and draft scenarios in
  `data/test-saves.json`. Tests: `tests/balance.test.ts`, `tests/cast.test.ts`, one line in
  `tests/evening.test.ts`. 942 tests and typecheck pass (run just now; may go stale). No commit.
  - **Added after T4:** `timeMark` ("⌛") in `data/day-text.json` (schema in `dayTextSchema`); the
    `no-time` sentence in `src/server/day.ts` reads it; the glyph is gone from `data/quests.json`
    and `data/test-saves.json`; a test in `tests/day.test.ts` holds it equal to the page's
    `TIME_MARK`. 948 tests and typecheck pass (run at 23:49; may go stale).

### T2 · Backend · done, unreviewed (infinite-spell-craft-5c) (the model off)
- **What:** `config/model.json` `"enabled": false`; while off, every model client throws a
  `GenerationError` starting "Hey, fix the model:" (with the URL and how to turn it back on);
  `refuse` in `src/server/app.ts` passes that message to the page; the server prints it at
  start; the visitor writer uses the canned writer while off, so evenings still work. Cached and
  baked combos still work.

- **Notes:** done 2026-10-19 by infinite-spell-craft-5c. 947 tests and typecheck pass; no commit.
  `config/model.json` has `"enabled": false` (schema default true). `createModelClient` returns a
  client that throws `ModelOff` (a `GenerationError`) with `modelOffMessage`: "Hey, fix the
  model: ..." naming the model, the URL, and the flag. `generateValidated` never retries it.
  `refuse` answers 503 with code `model-off` (added to `RuleCode`) and the message; the server
  prints it at start. While off, `main.ts` uses the canned event writer and no order or story
  writer (plain words). Tests in `tests/model.test.ts` and `tests/townService.test.ts` (a known
  pair is made; a new pair answers the reminder). Files: `src/server/llm/{config,generate}.ts`,
  `src/server/app.ts`, `src/server/main.ts`, `src/shared/schema.ts`, `config/model.json`,
  `README.md`, those tests.

### T3 · Backend · done, unreviewed (infinite-spell-craft-5c) (test saves)
- **What:** `npm run saves` (`src/tools/saves.ts`): backs up `var/game.db`, wipes it, and plays
  every scenario in `data/test-saves.json` into it with a fixed seed and the model off, one player
  per scenario; `npm run saves -- <player>` rebuilds one. Check `testSaveProblems` first. Tests:
  every scenario builds, lands where its `about` says, and builds the same twice. Also swap the
  literal `today + 2` in `src/server/events/service.ts` for `events.followUpDays`.
- **Note:** Trysten asked for the old saves to be wiped. The backup is kept.
- **Notes:** done 2026-10-20 by infinite-spell-craft-5c. 960 tests and typecheck pass; no commit.
  - **Landed:** `npm run saves` (`src/tools/saves.ts`): checks `testSaveProblems`, refuses while
    the dev server answers on `PORT` (it holds the save open), backs up `var/game.db` to
    `var/game.before-test-saves-<time>.db`, wipes it, and plays every scenario with its own fixed
    seed (from the player name, so one rebuilt alone comes out the same), the model off.
    `npm run saves -- <player>` clears and rebuilds that one; `-- --list` lists them. The steps
    are played by `src/server/testSaves.ts` through `src/server/game.ts` (`createOfflineGame`: the
    services as the server wires them, canned visitor, model off). `build` and `upgrade` meet the
    tier's needs themselves: named things discovered, a needed trade discovered, and "made" needs
    met by placeholder things (`test-<building>-<tier>-...`). Gold is ledger reason `test`.
    `store.deletePlayer` clears one player from every table that keeps one. `events.followUpDays`
    replaces the `+ 2`.
  - **Tests:** `tests/testSaves.test.ts`: the file names only real things, every scenario builds
    in one save, each builds the same twice, a check per scenario that it lands where its `about`
    says (Dunstan unhired, one call short of teaching, night falls on the last hourglass, Tansy
    comes after the night, six buildings hired...), and clearing one player.
  - **Fixed 2026-10-20 after the first real run:** the server's one-time hiring of old saves
    (`hireStanding`, N9) took the new test saves for old ones and hired smithy-built's Dunstan and
    others. Now `openStore` marks hiring as done for any save that had no hires table and no
    building standing (so a new save never qualifies), and the tool marks it too. Tested: a save
    built from nothing is left alone; a real pre-hiring save is still taken on, once. Re-run
    `npm run saves` (dev server stopped) to rebuild them clean. 961 tests pass.
  - **Files:** `src/tools/saves.ts`, `src/server/{game,testSaves}.ts`, `src/server/store.ts`
    (`deletePlayer`, `test` reason), `src/server/events/service.ts`, `package.json`, `README.md`,
    `tests/testSaves.test.ts`.

  - **Added 2026-10-20 (for the page's picker):** `GET /api/test-saves` lists `{ player, about }`;
    `POST /api/test-saves/:player/reset` rebuilds that save inside the running server through the
    same `rebuildScenario` as the tool, after the player's background writing finishes; refused
    (400) for anyone not in `data/test-saves.json`. Wired in `main.ts` unless `TEST_SAVES=off`.
    Tests in `tests/testSaves.test.ts` (list, reset puts it back, a real player is refused and
    untouched, routes absent when off). Files: `src/server/testSaves.ts`, `src/server/app.ts`,
    `src/server/main.ts`, `src/tools/saves.ts`, `README.md`, `tests/testSaves.test.ts`.
### T4 · Page · done, unreviewed (the ⌛ in one place)
- **What:** the ⌛ glyph is typed in several `web/src` files. Put it in one constant, or serve it
  as a line from `data/day-text.json`, so changing it is one edit (the Candle Gate rule).
- **Notes:** done 2026-10-19 by Front End Bot (infinite-spell-craft-ae), not committed. One
  constant, `TIME_MARK`, and `timeAmount(n)` in `web/src/timeMark.ts`; `day.ts`, `town.ts`,
  `icons.tsx` (`Said`, `spoken`), `StatusBar.tsx`, `Town.tsx`, `Workbench.tsx` read it, and
  `api.ts` lost its copy in a comment. `tests/webIcons.test.ts` fails if the mark is typed in any
  other `web/src` file. `data/day-text.json` is read by the server only, so a constant was the one
  place the page could use. Tests keep the literal ⌛ in their expected strings.
  - **For Rules and Backend:** the mark is still typed outside the page: the `no-time` sentence in
    `src/server/day.ts`, `town-evening` in `data/quests.json`, and `data/test-saves.json`. `Said`
    draws the page's `TIME_MARK` as the icon, so if the mark changes, those lines show the old one
    as plain text until they change too. If the server read the mark from `data/day-text.json`
    and sent it, the page could read it from there and the mark would live in one place in the
    whole game.

### T5 · Page · done, unreviewed (Front End Bot, infinite-spell-craft-ae) (Trysten, 2026-10-20: swap test saves)
- **What:** a small "Test saves" control, shown only in the dev server, that lists the scenarios
  in `data/test-saves.json` with each one's `about` as its tooltip. Picking one makes it the
  player and reloads the view. The list is read straight from the data file, so a new scenario
  shows up with no change to the page. Later, if Backend adds a route that rebuilds one save in
  place, add a "Start over" button beside the picker.
- **Notes:** done 2026-10-20 by Front End Bot (infinite-spell-craft-ae), not committed. 968 tests
  and typecheck pass (run at 00:06; may go stale). A dashed "Test saves" box, folded shut, in the
  bottom-left corner of the window, on the name form and the workbench alike, shown only when
  `import.meta.env.DEV`. It has a button per scenario (the `about` as tooltip, the open one
  marked) and "Start <player> over" for an open test save, which calls Backend's
  `POST /api/test-saves/:player/reset` and reloads the workbench; a refusal shows in the box.
  The list is a Vite JSON import of `data/test-saves.json`, so it works with the server down.
  Backend's `GET /api/test-saves` is not used. The workbench is keyed by player and restart
  count, so a swap or a start-over loads everything again. Not looked at in a browser.
  Files: `web/src/testSaves.tsx` (new), `web/src/App.tsx`, `web/src/api.ts` (`resetTestSave`),
  `web/src/vite-env.d.ts` (new, for `import.meta.env`), `web/src/styles.css` (the
  `.test-saves` rules at the end), `tests/webTestSaves.test.ts` (new).

### N9 · Rules, then Backend · Rules done, unreviewed; Backend done, unreviewed (infinite-spell-craft-5c) (Trysten, 2026-10-19: hiring)
- **What:** the building comes first and the person second. See "Hiring" in `Town Guide.md`.
  A trade crafted gives its plan; the first plot asks for a *discovered* trade (this removes the
  blacksmith deadlock in N2 question 1); the person arrives the morning after their building
  stands; hiring costs gold once (`town.hire`); a staffed building pays its takings each night
  and an unstaffed one earns nothing; apprenticeship is optional.
- **Rework for Backend:** the homeless state and "leave at dusk" built in N2 go away; the arrival
  moves from "job discovered" to "building stood overnight"; `arrival.buildings` in the cast
  needs a look with Story.
- **Trysten, 2026-10-19:** the hire costs more with the building's tier, and an unstaffed
  building earns nothing for now.
- **Rules part done, unreviewed** (infinite-spell-craft-1c): `town.hireByTier` (`[20, 50, 100]`,
  draft) in `config/balance.json`; `hireCost`, `hireTopUp` (raising a staffed building tops the hire
  up by the difference) and `staffedTakings` in `src/shared/town.ts`; tests in `tests/town.test.ts`.
  Backend wires them in: the hire route, `staffed` per building, and takings through
  `staffedTakings`.
- **Backend part done, unreviewed** (2026-10-19, infinite-spell-craft-5c). 931 of 932 tests (the
  one failure is Page's, below); typecheck clean; no commit. Save backed up
  (`var/game.before-hiring-2026-10-19.db`); the dev server has already applied it to the real save.
  - **Landed:** (1) `builder.jobs` is the trades discovered, so the first plot and a plan ask for
    a discovered trade (the blacksmith deadlock is gone) and reading the town no longer writes
    through `builder` (review A1-4). (2) `arrive` brings the person who runs each standing building
    (`runBy` at its tier; the cast's gate still applies); a trade with no building brings nobody.
    (3) `POST /town/hire { plot }` charges `hireCost(tier)` (ledger reason `hire`, table
    `town_hires`); `upgrade` charges `hireTopUp` with the tier's gold, refused together as
    `not-enough-gold`. (4) Takings go through `staffedTakings`; `BuildingView.staff` (optional,
    like `lifts`) gives the person, `hired`, and `hireCost`. (5) The homeless state, leaving at
    dusk, and the visitor filter are gone; `PersonView` drops `homeless`/`awayTonight` and gains
    `hired` and `worksAt`. (6) Teaching is unchanged and optional. Old saves: `hireStanding` at
    start-up hires, once, every building whose person already stands in it.
  - **On the real save:** Trysten's stall and Jason's Tavern and Herb Garden are hired. Jaclyn's
    and Test's stalls are not (Ferris had not come to them before), so they earn 0 until hired
    for 50. Say if those two should be hired too.
  - **One other lane's test now fails:** `tests/webTown.test.ts` "the first plot's gate" (Page):
    the gate is now a discovered trade, and nobody arrives with it, so `town.townsfolk` is empty
    there. The page should read the gate from the plans (a trade discovered) rather than from
    townsfolk. 931 of 932 pass.
  - **Files:** `src/server/town.ts`, `src/server/store.ts`, `src/server/app.ts`,
    `src/server/main.ts`, `src/server/events/service.ts`, `src/shared/schema.ts`
    (`BuildingView.staff`, `PersonView.hired`/`worksAt`), `README.md`, and tests
    `tests/{townService,teaching,story,evening,townQuests,townStock}.test.ts`.

### N8 · all lanes, one pass · done, unreviewed
- **Done 2026-10-19 by infinite-spell-craft-1c, on Trysten's word (time in code, ⌛ on the
  page, no name).** 916 tests and typecheck pass; no commit; save backed up
  (`var/game.before-time-sweep-2026-10-19.db`). **This replaces the moon names below.**
- **Backend's review (infinite-spell-craft-5c, 2026-10-19):** checked `src/server` (day, town,
  store, events, shifts, story, progress): no stray "candle" but the two flagged on purpose
  (`candles_spent`, and `readLedger` reading an old `last-candle` as `out-of-time`, both fine).
  `check`/`spend` read cleanly with `refuseTime` and `no-time`. 916 tests, typecheck clean.
  - **Names:** `day.time`, `day.earlyTime`, `timeLeft`, `timeMax`, `spendTime`, `extraTime`,
    `refuseTime`, the `time` perk, `RuleCode` `no-time`, `NightReason` `out-of-time`,
    `DayView.time`/`timeMax`/`turnInTime`, `TownView.plans[].time`.
  - **Saves:** the `candles_spent` column keeps its name; `readLedger` in `src/server/store.ts`
    reads an old `last-candle` ledger as `out-of-time` (tested).
  - **Page:** hourglass icons replace the candles in the status bar; all copy says ⌛; the sun
    meter's Dusk end says "The shop and the order board close here", and a line before dusk says
    so too.
  - **Left alone on purpose:** the Candle item and its recipes, `cold-candle`, the Court Mage's
    description, the shop-shelf candle.
  - **Each lane, please review your own files:** Backend `src/server/`, Page `web/` and
    `tests/web*`, Rules `src/shared/`, plus data and docs.
- **What:** rename candles to the moon (`candles` to `moonSteps`, `earlyCandles` to
  `earlyMoonSteps`, `no-candles` to `no-moon`, the `candles` perk, and every line of text and
  UI that says candle) and add the labelled sun-and-moon track to the day view.
- **How:** one session does it in a single mechanical sweep across `src/`, `web/`, `tests/`,
  `data/`, `config/`, and the docs, while the other lanes pause, and runs the suite after.
  Rules (`-1c`) will do it, and will say on the board when to stop editing.
- **Depends on:** N2 and N5 finished or paused, so the sweep has nothing in flight to clash with.

### N2 · Backend · done, unreviewed (infinite-spell-craft-5c, Backend and LLM Bot); services held, see Notes
- **Depends on:** N1.
- **What:** move the gating in `src/server/day.ts` and `src/server/town.ts`; homeless arrivals
  who leave at dusk and are housed by their building; services (commissions, hints, reforges);
  an overnight raise; a migration for saves with a raise or candles in flight.
- **Notes:** 2026-10-19 by infinite-spell-craft-5c. `npm test` (894) and typecheck pass. No
  commit. Save backed up (`var/game.before-n2-2026-10-19.db`); tried on a copy of it.
  - **Landed:** `day.check`/`day.spend` take the action and go by `refuseAction`; an `anytime`
    action takes no candle and leaves the day alone. **The switch is flipped** in
    `config/balance.json`: meal, hand, enchant, upgrade and build are `anytime` at cost 0;
    visitor and call stay `evening`. `day.limits` are enforced for meals and hands. The shop
    sells nothing from dusk (`shopOpen`, new code `shop-closed` in `RuleCode`), and its shelf
    can still be looked at. **A raise finishes overnight:** `town_plots.raising` (migration: a
    nullable column, so no save has one in flight), `TownView.plots[].raising` (optional, like
    `lifts`, until the page's fixtures carry it), finished after the night's takings by
    `finishRaises`, with a ledger line. `neighbourShift` is in every building's takings
    (`townState().neighbours`). Arrival goes by the cast: a written person arrives once
    `arrivalMet`, with their name, pronoun, traits and facts (so the visitor writer has them,
    as Story asked); a saved townsperson of that trade takes the cast identity and keeps their
    Fondness. Homeless townsfolk (`homeOf`/`isHomeless`) are gone from dusk: no calls, and
    never the evening's visitor.
  - **On the real save:** names change. Trysten's "The Wizard" is now Ignatius Puddlewick and
    "The Merchant" Ferris Tally; Jason's herbalist and innkeeper become Quince Mallow and
    Marigold Tumble. Every Fondness there is 0, so nothing else moves. `npm run pace` is
    unchanged (level 5 about day 29 to 31): N2 moves no sun.
  - **Files:** `src/server/day.ts`, `src/server/town.ts`, `src/server/shop.ts`,
    `src/server/store.ts`, `src/server/events/service.ts`, `src/shared/schema.ts` (`shop-closed`,
    `TownView.plots[].raising`), `config/balance.json` (`day.access`, `day.costs`), `README.md`,
    `tests/helpers.ts` (`newGame` takes optional `data`), `tests/day.test.ts`,
    `tests/dayService.test.ts`, `tests/evening.test.ts`, `tests/townQuests.test.ts`,
    `tests/townService.test.ts`, `tests/townStock.test.ts`.
  - **For Page (N5):** build/upgrade/meal/hand/enchant work by day with no candle; a plot shows
    `raising` until morning; `shop/buy` can answer `shop-closed`; `day.costs.build` is now 0, so
    the plan's `candles` reads 0.
  - **Held, for Design (see Questions):** services (commissions, hints, reforges) and the
    homeless' "worst prices" have no data or rule yet, so nothing is built for them.


### N6 · Rules · open
- **What:** the `essential` flag on buildings and its schema check; closure happenings that shut
  non-essential buildings for their length; the Smithy's share off raising any building; tests.
  Then Backend applies closures in the night ledger. See "Essential buildings" in the guide.

### N7 · Quest · done, unreviewed
- **What:** the smaller quests and the quest logic. New `done` condition types the arcs need
  (`built` with a `tier`, a person's Fondness, a lesson done, a thing crafted for a person), their
  measuring in `measureCondition`, and the template lessons for jobs with no written person.
  Works from what Story asks for in `Story Guide.md` ("For Rules"). Quest rewards keep to the
  two-fifths-of-XP test. Does not write the cast or the arcs (Story) or the cast schema (Rules).
- **Notes:** 2026-10-19, infinite-spell-craft-f4 (Quest Bot). Typecheck clean; 870 of 871 tests
  pass. The one failure is `tests/cast.test.ts` ("lets a beat wait on another person's beat"),
  which is N3a's new untracked work in progress, not this ticket's.
  - **Landed:** four `done` changes in `src/shared/schema.ts`: `built` takes an optional `tier`;
    `quest-done { quest }` (another quest paid, such as a lesson); `fondness { job, fondness }`
    (that job's townsperson has at least this much); `requests { count, job? }` (things made for
    someone who asked). They are measured in `measureCondition` in `src/server/progress.ts`.
    `settle` now fills requests before it pays quests, so a request filled, and the Fondness it
    brings, count in the same settling. `src/server/gameData.ts` refuses a `quest-done` that
    names an unknown quest or the quest itself, an unknown job, and a building tier past
    `town.tiers`. Tests are in `tests/townQuests.test.ts`.
  - **Files:** `src/shared/schema.ts`, `src/server/progress.ts`, `src/server/gameData.ts`, and
    `tests/townQuests.test.ts` (only the quest lines in each; the other edits in those files are
    other sessions').
  - **For N3a (Rules):** `quest-done` checks against `data.quests` and the `quest` ledger refs. If
    lessons or beats live in the cast and are paid under another ledger reason, widen the check
    and `state.paid` to cover them, or tell me and I will. Story says `waitsOn` and the arrival
    field may make `quest-done` unneeded for beats; it stays useful for side quests either way.
  - **Template lessons:** built by -1c under N3a (`templateLesson`/`lessonFor` in
    `src/shared/cast.ts`), so N7 does not build them.
  - **Later the same day:** `quest-done` may also name a lesson, either a cast member's own or the
    made-by-code `lesson-<job>` for a trade with no written person. `gameData.ts` gathers those
    through `lessonFor` and runs the quest checks over lessons as well as quests. A lesson
    counts as done once its id is in the `quest` ledger. **For N4 (Backend):** if a finished
    lesson is stored any other way, `state.paid` in `measure` needs to read it too. 872/872
    tests and typecheck pass.

### N3a · Rules · done, unreviewed
- **Depends on:** N1.
- **What:** the cast schema in `src/shared/schema.ts` (personality, likes and dislikes, arrival
  condition, lesson quests, storyline beats with Fondness gates, rewards), `town.teachAt`, the
  `taught` rule with the `not-taught` refusal, and the template lesson builder for jobs with no
  written person. Tests, including the two-fifths-of-XP rule for story quests.
- **Notes:** done 2026-10-19 by infinite-spell-craft-1c. `npm test` (871) and typecheck pass. No
  commit. Files: `src/shared/schema.ts`, new `src/shared/cast.ts`, `src/server/gameData.ts`,
  `config/balance.json` (`town.teachAt` 4), new `data/cast.json` (empty), `tests/cast.test.ts`,
  `tests/quests.test.ts`, `tests/town.test.ts`.
  - **For Story (N3b):** fill `data/cast.json` as `{ "people": [ ... ] }`. A person has `id`, `name`,
    `pronoun`, `job`, `home` (a building id or `shared`), `personality`, `voice`, `traits`,
    `facts`, `likes`, `dislikes`, `arrival` (`level`, `buildings`, `townsfolk`, `quest`, all
    optional), `lesson` (a list of ordinary quests, at least one), `beats`, `callingLines`. A beat
    has `id`, `title`, `level`, `gate` (Fondness), `waitsOn` (beat ids, from any person), optional
    `done` (any quest condition), `reward`, `premise`, `line`, optional `thread`. Rewards are
    `gold` (`gold`, `xp`), `commission` (`tags`), `perk` (any building perk), or `plan`
    (`building`, `tier` 2 or more). The loader checks ids, names, trades, jobs, buildings,
    quests, waits and circles, and prints what is wrong. Names must not be in the old arrival pool.
  - **Fitting:** `fitCast` (in `src/shared/cast.ts`) leaves out a person whose job or home is
    missing from a trimmed test world, and drops opinions, plans and waits that name something
    missing, as buildings and skins are. A test holds the shipped cast to the real data, so a
    misspelling still fails there. 875 tests pass with Story's seven people in.
  - **XP is one shared budget:** a lesson's `xp` and a `gold` beat's `xp` count toward the same
    two fifths of each level as `data/quests.json`. The quest test sums them.
  - **For Quest Bot (N7):** the quest conditions are now `questDoneSchema` in
    `src/shared/schema.ts`, shared by quests, lessons, and beats. `built` now takes a `tier` (N7).
  - **For Backend (N4):** `isTaught`/`refuseTrade` (`not-taught`), `lessonFor`, `templateLesson`,
    `openBeats` and `castXpAtLevel` are in `src/shared/cast.ts`. `town.teachAt` is 4.
  - **Not done here:** storing who was taught or which beats are done (Backend, N4). The
    `built` tier condition was done by Quest Bot (N7).

### N3b · Story · done, unreviewed (infinite-spell-craft-e5, Story Bot)
- **Depends on:** N3a for the schema (start from the shape in "Townsfolk as neighbours").
- **What:** the six buildings' people, each with a personality, likes and dislikes, a lesson that
  ends in teaching the trade, and a 3 to 5 beat storyline; the prompts and voice notes for beat
  dialogue and the Tavern scenes between two townsfolk.
- **Notes:** started 2026-10-18 before N3a, from the shape in the guide. Trysten settled three
  things: one fixed character per trade in every game; each person's arc stands alone, with a
  gentle town-wide thread through them (no destiny); the design goes in a new `Story Guide.md`.
  The guide comes first. The data waits on N3a's schema, so the content fits whatever shape
  Rules lands.
  - 2026-10-19, Trysten's split: Story keeps the arcs and how they connect. Quest Bot (N7) owns
    the smaller quests and every `done` condition. The conditions the arcs need were sent to -f4:
    `built` with a `tier` is new, a `beat-done` condition depends on N3a's `waitsOn`, and
    everything else is an existing type.
  - **Done 2026-10-19, unreviewed.** `npm test` (880) and typecheck pass.
    - **The cast:** `data/cast.json` holds seven people: the six buildings' people, plus Tansy,
      the Alchemist, who shares the Herb Garden. It has 27 beats, 13 lesson quests, and four
      calling lines each. Rules fixed the loader to fit the cast to a trimmed world (`fitCast`).
    - **Prompts:** `prompts/story.md` is the beat and Tavern-scene guide. N4's writers read it
      beside `prompts/voice.md`.
    - **New test:** `tests/castContent.test.ts` checks that every building's trade has a person,
      that no cast text has digits or `!`, that each person has three to five beats and calling
      lines with `{name}`, and that the thread's finale waits on a piece from each building's
      person.
    - **XP:** every lesson pays 0 XP and 5 gold. Only two level-5 beats pay XP (100 and 50), so
      the budget for levels 1 to 4 is left to Quest Bot. Perks and gold are drafts for Rules to
      tune.
    - **For N4 (Backend):** pass each person's `traits` and `facts` to the visitor writer when a
      townsperson is the visitor (today they arrive with neither). Tansy arrives from level 3,
      because `arrival.quest` cannot name a lesson.
    - **Files:** `data/cast.json`, `prompts/story.md`, `tests/castContent.test.ts`,
      `Story Guide.md`, and `README.md` (one pointer line).

### N3c · Rules · open (Trysten, 2026-10-19: the cast is hand-written)
- **What:** the shape for hand-written scenes, as sketched in `Story Guide.md` under "For Rules
  (N3c)":
  - A beat gets `scene` (lines, each with a speaker), `nudges`, `after` and `summary`, which
    replace `premise` and `line`.
  - A lesson gets a nudge and a `taught` scene.
  - Calling lines become conditional (`from`, `after`, `before`, and `when` from a closed list).
  - Tavern scenes become data, by pair and outcome.
  - A closed list of slots code fills (`{name}`, `{thing}`, `{other}`).
  - Loader checks for all of the above.
  - A pure `pickLine` (the most specific unheard line, then the one heard longest ago, always with
    a fallback), with tests.
  - A `visit` row in `day.access` and the costs, with its ⌛ cost. This is the evening visit
    that plays a waiting scene. Backend (-5c) asks for its own row under that name, so it goes
    through `refuseAction` the way `call` does.
- **Why:** the rules in `Story Guide.md`, "How we write the cast" (19-21: salience, unheard lines
  first, new lines with depth).

### N3d · Story · open (infinite-spell-craft-e5, after N3c)
- **What:** write every word the cast says, in the N3c shape in `data/cast.json`:
  - each beat: a scene of 3 to 8 lines, 1 or 2 nudges, and 2 "after" lines;
  - each lesson: a nudge and a taught scene;
  - 15 to 20 conditional calling lines a person;
  - Tavern scenes for each liked pair and outcome, and rarer dislike-pair scenes.
- **Also:** propose a `story-<person>` scenario per cast member in `data/test-saves.json`
  (Backend's T3), set at the Fondness of their next beat, so dialogue can be walked through (asked
  by -1c).
- **Then:** `prompts/story.md` shrinks to small talk for a townsperson as the evening visitor, and
  `tests/castContent.test.ts` grows (speakers, scene lengths, word limits for each person's voice,
  every fixed fact used).
- **Done already (2026-10-19, unreviewed):** in `Story Guide.md`, "How we write the cast" (21
  rules from research, the checklist, and the sources), and the inner life of each person: want,
  need, contradiction, how they meet stress, praise and conflict, and a running gag in three
  steps. Also the arcs fitted to Hiring in `data/cast.json`:
  - The five first beats that waited on the person's own building now open at Fondness 2 with no
    objective.
  - Marigold's and Dunstan's arrival gates are gone.
  - Files: `Story Guide.md`, `data/cast.json`, `tests/castContent.test.ts` (which beat counts as
    the finale).
  - `npm test`: everything passes except `tests/webTown.test.ts` "opens it once a job is
    discovered", which is N9's arrival change in progress, not this.

### N4c · Backend, then Page · open (after N3c)
- **What, Backend:**
  - Retire the model writer for beat scenes (`src/server/story/writer.ts`). The scene comes
    from data with its slots filled, and is still kept in `beat_scenes` and `PersonView.scenes`.
  - The evening visit that plays a waiting scene, for ⌛.
  - Keep track of which lines each player has heard, for `pickLine`.
  - Calls use `pickLine`.
  - Tavern scenes are chosen from data once their rules are settled (N4 question 2).
- **What, Page:** a "has something to show you" cue on a person with a waiting scene, and a scene
  drawn as lines with the speaker's name.

### N4 · Backend · N4a and beat scenes done, unreviewed; pair scene and Villagers held for design (infinite-spell-craft-5c)
- **Depends on:** N2, N3a, N3b.
- **What:** refuse `chooseJob` and the shift for an untaught job (a `taught` flag per person and
  a migration so saved jobs stay taught); `GET /town/people`; story beats by Fondness, the nightly pair scene written ahead and cached by pair, and
  Villagers who settle after a quest.

- **Notes:** split in two. **N4a** is everything code owns; **N4b** is the model's part.
  - **N4a · done, unreviewed** (2026-10-19, infinite-spell-craft-5c). `npm test` (906) and
    typecheck pass; no commit; save backed up (`var/game.before-n4-2026-10-19.db`), tried on a copy.
    - **Teaching:** `taught_jobs` table, seeded once with the job each saved player holds (on the
      real save: Trysten's tea-shop owner, Jason's innkeeper). `progress.isJobTaught` (starter, or
      taught). `chooseJob` refuses `not-taught` naming the person; the shift refuses `not-taught`
      and the board is not `ready`. `settle` pays each arrived person's lesson (as quests, so
      `quest-done` sees it, and its XP counts) and marks the trade taught once the lesson is done
      and Fondness reaches `town.teachAt`. A call now settles, so it can finish teaching.
    - **Beats:** played in `settle` (`openBeats`, the beat's level, its `done`), ledger reason
      `beat`, listed in `rewards.quests`; a `gold` reward pays gold and XP (counted in XP).
      **`commission`, `perk` and `plan` rewards are recorded but not in force:** a perk or an
      early plan needs Rules to say how a per-player perk joins `perksAt`/`perksOf` and how
      `refuseTier` reads an early plan; commissions wait on services (N2's held question).
    - **`GET /town/people`:** `PeopleView`/`PersonView` in `src/shared/schema.ts`.
    - **On the real save:** lessons already met are paid at the next start (5 gold each, no XP).
    - **Files:** `src/server/store.ts`, `src/server/progress.ts`, `src/server/town.ts`,
      `src/server/shifts/service.ts`, `src/server/app.ts`, `src/shared/schema.ts`, `README.md`,
      new `tests/teaching.test.ts`, and `addTaught` before `chooseJob` in `tests/{dayService,
      events,orderWriter,jobs,shiftService,shop,townStock}.test.ts`.
  - **N4b · beat scenes done, unreviewed; the rest held for design.** `npm test` (912) and
    typecheck pass.
    - **Beat scenes:** `src/server/story/writer.ts` (from `prompts/story.md` and the voice guide,
      the person exactly as written in the cast, checked: no numbers or game words, at most
      seven sentences, voice and blocklist) and `src/server/story/service.ts` (written out of
      sight after any request about the player, once a beat; the plain `line` stands until then
      and if the model fails, and is not retried). Kept in `beat_scenes`. `PersonView.scenes`
      lists each played beat with its words. Wired in `main.ts` (the `events` model key).
      Files: `src/server/story/{writer,service}.ts`, `src/server/store.ts`, `src/server/app.ts`,
      `src/server/main.ts`, `src/server/town.ts`, `src/shared/schema.ts`, `tests/story.test.ts`.
    - **Held: the Tavern pair scene and Villagers.** Nothing is written for them yet, because
      the rules they need are not anywhere: see "Questions for design" (N4).

### N5 · Page · claimed by infinite-spell-craft-ae (Front End Bot)
- **Depends on:** N1 for the types, N2 to see it live.
- **What:** the street shows who lives where and who is homeless; the People tab (Fondness,
  home, service, likes, open quests, next-beat hint); the day and evening split.
- **Notes:** in progress. First part, uncommitted, from reviewing N8: N1 closes the order board
  at dusk and turning in moves the sun to dusk, so `bedOffer`'s "Call it a day" now warns that a
  waiting shift closes; the bedtime "orders go with them" line is gone (dead after dusk); the
  order cue and closed board say "closed at dusk" in the evening. Files: `web/src/day.ts`,
  `tests/webDay.test.ts`. Second part: with `day.access` from Rules, `eveningBlock(action, day)`
  words the server's `refuseAction` (an "anytime" action has no hour; an "evening" one waits for
  dusk even when free), and `costBlock`, `handBlock` and `eveningOffers` go through it. Files:
  `web/src/town.ts`, `web/src/Town.tsx`, `tests/webTown.test.ts`. Rules' fixture edits in both
  web tests checked. Still to do: who lives where, and the People tab.
  - **Trysten's ask, 2026-10-19:** the day meter is drawn as one segment per notch, with Dawn,
    Noon and Dusk labelled under it and a readout ("3 of 10 · noon in 1 discovery, dusk in 7
    discoveries"). `sunTicks` and `sunReadout` in `web/src/day.ts`, with tests; markup in
    `web/src/StatusBar.tsx`, styles in `web/src/styles.css`. Not yet seen in a browser.
  - **Trysten's ask, 2026-10-19:** no emoji or symbol characters on the page. `web/src/icons.tsx`
    holds pixel sprites (hourglass, star, check, cross, diamond, sparkle, ring, carets, padlock);
    `<Said>` draws each ⌛ in rule and server text as the sprite, so the text in `day.ts`,
    `town.ts` and the server stays plain. The stylesheet's marks are the same sprites as CSS
    masks. `tests/webIcons.test.ts` checks the two match and that no symbol is left in the CSS.
  - **Trysten's ask, 2026-10-19:** the Discovered bookmark did nothing, because it was the only
    page. The Shop bookmark now always shows, with a padlock and the server's `no-shop` sentence
    until the shop opens (`ShopLocked` in `web/src/Shop.tsx`). Town is no longer a book bookmark:
    it is a Workbench / Town switch in the top bar, since it swaps the board, not the book.
  - **For N9 (hiring), 2026-10-19:** the first plot's gate reads `hasTrade(discoveries)`, a job
    among the same discoveries the server counts, not `town.townsfolk`; the gate test is rewritten
    to N9's rule. A building's panel says who runs it, or that nobody has come yet, and offers
    "Hire <name>" at `staff.hireCost` (`staffLine` in `web/src/town.ts`, `hireStaff` in
    `web/src/api.ts`, wired in `Town.tsx` and `Workbench.tsx`), with tests in `tests/webTown.test.ts`.

## Review

By infinite-spell-craft-1e (Review). Findings on `0a3bd36` (A1-A4) and `808813e` (A5). The full
report, including ten system-level findings, is at
`~/.claude/plans/you-are-code-review-woolly-deer.md`.

**A1-A4 reviewed and finalised: the fixes are commit `1bf0c0c`** (796 tests, typecheck clean).
Files touched: `src/shared/day.ts`, `src/shared/town.ts`, `src/server/{progress,store,town}.ts`,
`src/server/events/service.ts`, `web/src/{Town.tsx,Workbench.tsx,town.ts}`,
`tests/{day,store,town,webTown}.test.ts`. A5 is reviewed below; E3 and the order writer are
reviewed under "Review: the order writer and E3".

**Reviewed and finalised so far:** A1-A4 (`1bf0c0c`), the order writer (`d6bc682`), E3 (`7f40c95`).
Baseline on the last review: 803 tests, typecheck clean.

### A1 · the first plot's job gate

- **A1-1 · fixed, a real bug.** The page disabled the Buy button on `!!progress.job` — the job
  *taken up* — while `buyPlot` counts the townsfolk who have *arrived* with a job. A player who
  discovered a job and took none up was shown "Take one up" and a dead button for a plot the
  server would have sold. Reproduced, then fixed: `Town` derives the gate from `town.townsfolk`,
  the same list `buyPlot` counts, so there is no prop left to pass the wrong value into. New test
  in `tests/webTown.test.ts` ("the first plot's gate") pins the page and the server together.
- **A1-2 · fixed (the question asked).** `refusePlot` now takes the object:
  `refusePlot(owned, player: Pick<Builder, "jobs" | "level" | "gold">, rules)`. Five positionals
  was past the point where an object reads better, `refuseTier` already took a `Builder`, and
  `jobs: number` contradicted `Builder.jobs: string[]` one screen apart. The call site now reads
  `builder(player)` once instead of calling `progress.getProgress` and then `builder()`, which
  called it again.
- **A1-3 · `no-job` stands, with a caveat.** The code is fine; it carried two different
  conditions ("no job taken up" for shifts, "no trade in town" for plots). A1-1 settles the plot
  one. If they ever diverge again, give the plot its own code — the page already branches on
  `no-shop`, so it will branch on this.
- **A1-4 · raised, not fixed.** `builder(player)` calls `arrive(player)`, which **writes**
  (renames people, `addPerson` for new jobs). Counting trades to answer a yes/no question runs
  the arrival path. See S10 in the report.

### A2 · the visitor from dawn

- **A2-1 · fixed.** "Is a visitor due today" was written twice and had drifted: A2 dropped
  `sun > 0` from `events/service.ts` `isDue` and left it in `progress.ts`. (Backend unified them
  while I was reviewing.) Now there is one rule, `visitorDue(state, visitorDay, eventStates)` in
  `src/shared/day.ts`, asked by both, with a test in `tests/day.test.ts`.
- **A2-2 · for Design, please answer.** Dropping `sun > 0` means a bare page load
  (`GET /api/players/:player` → `prepare`) now starts model work. The old comment said that
  condition existed "so that the model is never set to work for someone who only opened the
  page". That may be the right trade for "ready by dusk", but it should be a decision: say so in
  the comment, or trigger `prepare` only from the action routes.

### A3 · the stall migration

Sound: the column and its `UPDATE` run in one transaction, `town_plots.player` is `NOT NULL` so
the `NOT IN` cannot be poisoned, and a player with no stats row reads as not owed. Two findings,
neither fixed:

- **A3-1.** The grant kept `|| store.getLedgerRefs(player, "shop").length > 0` beside the new
  `stallOwed`. That clause can no longer fire for anyone new (buying needs an open shop, else
  `no-shop`), so it is reachable only by the saves `stall_owed` already marks — two sources of
  truth, and the workaround will outlive the saves it was for. Safe to drop once the migration
  has run on the real save; I did not guess at whether it has.
- **A3-2.** `standingBuildings` is named like a read, is called from 9 sites in 6 modules, and
  now `addPlot`s, `setBuilding`s and `clearStallOwed`s. `main.ts:63` reaches it to price a spell,
  so quoting a price can raise a building. See S10.

### A4 · the single learn price

Landed well: `listDiscovered` projects `learnPrice` onto a copy, and `learn` charges it, so shown
and charged are one number.

- **A4-2 · fixed.** `GameEntry` is both the per-player view and the row `saveGenerated` writes,
  and nothing stopped a per-player price reaching the shared `entries` rows — one player's
  discount, baked in for everyone, permanently. `saveGenerated` now drops `learnPrice`, with a
  test in `tests/store.test.ts`.
- **A4-1 · raised, deliberately not fixed.** `learnShare` is optional on `createCombiner`, so a
  forgotten wire silently means no discount. Making it required is the right shape, but it would
  churn ~35 call sites across eight test files in other lanes for modest gain, and
  `tests/townService.test.ts:488` already pins shown-equals-charged through the real composition.
  Backend's call: the residual risk is a change to `main.ts:63` alone.

### A5/E3 · the page (reviewed, not yet fixed)

- **E3-1.** The page decides a Tavern stands by `building.id === "tavern"`
  (`web/src/town.ts` `TAVERN`); the server decides by the `meals` **perk**. Give a second
  building that perk, or re-id the Tavern, and the page hides a meal the server would serve.
  Test the perk, or have `BuildingView` carry the flag.
- **E3-2.** `ASKED_FOR = { pedlar, stargazer }` puts two rows of `data/tonight.json` — ids *and*
  their words — into a page constant. `TonightView` should carry the action label.
- **E3-3 · fixed with A1-1.** `plotText`'s `hasTrade` had a permissive default (`= true`), so any
  caller not updated silently skipped the new rule, and two tests exercised exactly those
  4-argument calls. Now required.
- **E3-4 · fixed with A1-2.** `plotNeedsJob` restated the server's rule in different terms.

### For the lanes: ten system findings

In the report, severest first. The two I would pull forward:

- **S1 (Backend).** `transaction` is private to the store and runs bare `BEGIN`, so no service can
  span one and nesting throws. Every multi-write action can half-happen: `buyPlot` does
  `addLedger(-price)` then `addPlot`, so a throw between them spends the gold and gives no plot.
  Same shape in `build`, `upgrade`, `meal`. Fix with `SAVEPOINT` and expose it.
- **S3 (Backend).** 103 unchecked `row.x as string` casts, and six readers using `SELECT *` on a
  schema that adds columns by migration. A mistyped column gives `undefined` typed as `string`.

The rest: S2 `store.ts` is one 1060-line closure over seven domains · S4 migrations have no
schema version · S5 `getProgress` writes and re-measures several times per request · S6
`RuleError` lives in `combiner.ts` so every service imports the combiner · S7 `town.ts` is both a
query layer and a service, and the import graph is acyclic only because two imports are
`import type` · S8 `createApp`'s optional services and 16 near-identical route bodies · S9
`Workbench.tsx` is 1106 lines with 22+ `useState` · S10 read-named functions that write.

## Review: the order writer and E3

By infinite-spell-craft-1e (Review), 2026-10-17. Findings on `86cb024` (the order writer) and
`a70cae8` (E3). Fixes in `d6bc682` and `7f40c95`; 803 tests, typecheck clean.

### The order writer (`86cb024`) · reviewed, done

Good module: the pure checks (`tooAlike`, `checkOrder`) sit apart from the model wrapper, it uses
the same `reject` pattern as the other writers, and it goes through `turns.inBackground`, so it
gives way to a player's combination as the README asks.

- **O-1 · fixed, the ticket's own claim.** "No repeated subject on a board" held only for the
  plain template. `draftOrder` kept a subject fresh with `text.startsWith(subject)`, but
  `writeBoard` stores the **model's** prose, which does not begin with the subject — and the
  writer is told it may invent something near it. So with a writer wired in, as `main.ts` does,
  the dedupe was a no-op: on the model path **12 of 20 seeds repeated a subject**.
  `tests/orderWriter.test.ts` passed because it covered the plain board only, splitting on
  `". It calls for"` — the one path where the bug could not appear.
  Now the subject is kept beside the order (`OrderDraft.subject`, a `shift_orders.subject`
  column) instead of being read back out of rendered words. That also makes the guarantee hold
  when a part-filled board is topped up around orders still open, which it never did. Two tests
  added on the model path.
  - **For Rules:** this is now load-bearing on `data/job-skins.json`. The innkeeper has 4
    subjects for a 3-order board, so the dedupe has one spare. The Log's note asking for 8-12
    subjects a job matters more than it did.
- **O-2 · fixed with O-1.** `subject: draft.text.split(/\.\s/)[0]!` re-parsed the subject out of
  the rendered template. Gone.
- **O-3 · fixed, a rule giving the wrong answer.** `checkOrder` asked for its tag words with
  `includes` and fell back to the bare tag, which is one lowercase word. So **a chair satisfied
  "air" and a price satisfied "ice"**: an order passed the check while not asking for what the
  board demanded. It now matches whole words, with tests for both near-misses.
- **O-4 · fixed, on Trysten's answer.** `GET /shift` raced the model behind an inline
  `setTimeout(…, 8000)` — a magic number in a route, an uncleared timer, and a wait that
  contradicts "a player never waits on the model" while still handing over template words when
  the model is slow. The board is written ahead, so the route now answers at once.
- **O-5 · for Backend, not changed.** `main.ts` builds the order writer with
  `createModelClient(model, "events")`, so orders take the `events` effort (`medium`) and timeout
  (120s), up to 4 attempts. The README documents the keys as `combos`, `naming` and `events`;
  orders are a fourth purpose with no key. These are tuning numbers, so they are yours: either
  add an `orders` key to `config/model.json` or say in the README that orders share events'.
- **O-6 · for Backend, not changed.** `tooAlike` divides shared words by the **smaller** order, so
  a short order is rejected for sharing two words with a long one, costing rerolls before the
  fallback. A measure over the union would be steadier. Worth watching with real play data.

### E3 (`a70cae8`) · reviewed, done

`visitorCue(day, place)` and `tonightNews(day, announced)` are pure, tested, and read the cost
from the day rather than assuming it.

- **E3-1, E3-2, E3-5 · fixed together, one root cause.** The page decided where meals are served
  by `building.id === "tavern"` while the server decides by the `meals` perk at the building's
  tier, and it kept `ASKED_FOR = { pedlar, stargazer }` — ids *and* their words — in a page
  constant. Not wrong today (the Tavern carries `meals` at tier 1), but it put content and words
  in the page, and a second place serving meals or a perk moved up a tier would have split them.
  `BuildingView.meals` and `TonightView.action` now carry it, from a new optional `ask` on the
  happening in `data/tonight.json`; the page drops both constants. The server's three copies of
  the perk check became `servesMeals` in `src/shared/town.ts`.
- **E3-6 · fixed.** `eveningOffers` guessed the seat from the town even when the visitor was in
  hand, so its line could say "at the Tavern" while the card said the door. It takes the event now.
- **E3-7 · comment corrected.** `announced` is a `useRef`: it survives re-renders, not a reload,
  so a refresh does re-announce. The comment said otherwise. If telling it once per real day
  matters, it needs storage — **a question for Design**, left alone for now.
- **Noted, no change.** `visitorCue(day, place = "door")` is the third new rule parameter to
  arrive with a permissive default (after `plotText`'s `hasJob = true`, removed under A1). Here
  it is harmless, but as a habit it hides a new rule from every caller not yet updated. A new
  parameter that carries a rule is better required, so the compiler names the call sites.

### Still open from the earlier pass

- **A2-2 / for Design:** a bare page load now starts model work, for both the visitor and the
  order board (`prepare` on `GET /api/players/:player`). The condition that prevented it was
  dropped in A2 with no note. Say so in the comment, or trigger `prepare` from the action routes.
- **A3-1, A3-2, A4-1 · for Backend**, as written under "Review".
- **S1-S10 · for their lanes.** Next up, on Trysten's word: **S1**, gold that can go missing
  between `addLedger` and `addPlot`.

- **N1 to N5 · infinite-spell-craft-90 (design):** three choices stand as drafts until Trysten
  says otherwise. (1) A raise finishes overnight. (2) The shift closes at dusk, not at night.
  (3) A disliked neighbour only lowers takings and Cheer a little, and costs nothing else.
  Trysten has answered: daytime build, stock, enchant, hand and meal; a building is its owner's
  home; arrival is discovery plus a condition.

- **N3b · infinite-spell-craft-e5 (Story):** five questions from `Story Guide.md`, each with a
  draft I will write to unless told otherwise.
  1. **Saved games.** Saved players already have townsfolk named from the pool. Draft: they keep
     those names, and the cast's traits, facts, and arcs attach by job. (Backend: `arrive()`
     binds a trade to its cast character for new arrivals only.)
  2. **Tier unlock as a beat reward** puts a Fondness gate before tier 2, and the guide promises
     a building can always be raised. Draft: the beat brings the tier's plan early, and tier 2
     never waits on a beat.
  3. **Dislike pairs at the Tavern.** Can a disliked pair meet now and then, for a rare
     friendship? Draft: yes, rarely.
  4. **Mending a dislike** as a new beat reward kind (Dunstan and Quince, after the smoke).
     Draft: not yet, flavour only.
  5. **Two wizards.** The player is a Wizard and Ignatius is the town's. Draft: fine, since he
     is retired.
  - **For N3a (Rules):** the guide's "For Rules" section has the shape this content needs. Every
    objective uses an existing `done` type except that `built` needs an optional `tier`.
    `waitsOn` crosses people. Traits and facts are included so the visitor writer gets them.

### Backend's answers to the review (2026-10-19, Backend and LLM Bot) · done, unreviewed

844 tests, typecheck clean. Nothing committed.

- **S1 · done, unreviewed.** `transaction` in `store.ts` nests (savepoints, a depth counter
  declared before the migrations use it) and is exposed as `store.atomically(fn)`, synchronous
  only. Every multi-write action runs inside one: `town.ts` (`buyPlot`, `build`, `upgrade`,
  `stock`, `hand`, `call`, `meal`, `enchant`, `tonight`), `shop.ts` `buy`, `progress.ts`
  (`settle`, `chooseJob`, `learn`), `shifts/service.ts` `work`, `day.ts` (`fall`, `after`,
  `spend`, `end`), and `events/service.ts` (`finish`, plus the write tail after the heart is
  written; never across an `await`). Tests: nesting and rollback in `tests/store.test.ts`; a
  store that breaks on `addPlot` / `addMeal` leaves gold and candles untouched in
  `tests/townService.test.ts`. One effect to know: a refusal thrown after `arrive` has written
  now undoes that arrival too; the next read does it again.
- **A3-1, A3-2 · done, unreviewed.** The grant left `standingBuildings`, which only reads again.
  `grantOwedStalls(data, store)` in `town.ts` runs once at start-up from `main.ts`, over
  `store.listOwedStalls()`, without the shop-ledger clause. `buyPlot` no longer reads the town
  first for it. Checked on a copy of `var/game.db`: nobody is owed any more (Jaclyn and Test had
  their stalls by the old path), so the first start with this changes nothing. Tests rewritten
  on a real pre-town database (`preTown` in `tests/townService.test.ts`), including that viewing
  the town writes nothing.
- **A4-1 · kept as it is.** `learnShare` stays optional: `tests/townService.test.ts` pins
  shown-equals-charged through the real wiring, and making it required would churn other lanes'
  tests for little.
- **O-5 · done, unreviewed.** `ModelJob` has `orders`; `effort.orders` and `timeoutSeconds.orders`
  are optional in `config/model.json` and fall back to `events` (`settingsFor` in
  `src/server/llm/config.ts`, tested in `tests/model.test.ts`). `main.ts` uses it; README says so.
- **O-6 · done, unreviewed.** `tooAlike` measures shared words against both orders together, not
  the shorter; a test holds a short order sharing two words with a long one.
- **Files:** `src/server/store.ts`, `src/server/town.ts`, `src/server/shop.ts`,
  `src/server/progress.ts`, `src/server/day.ts`, `src/server/shifts/service.ts`,
  `src/server/events/service.ts`, `src/server/main.ts`, `src/server/llm/config.ts`,
  `src/server/shifts/writer.ts`, `README.md`, `tests/store.test.ts`, `tests/townService.test.ts`,
  `tests/orderWriter.test.ts`, `tests/model.test.ts`.
- **Bake round 2** is separate: B2, B3, B4, B7, B8 done, unreviewed; B1, B5, B6 wait on the model
  box (`config/model.json` `url` was unreachable from here). Its files are listed under each B ticket.

## Log

- 2026-10-20: the commit bot committed the tree before T6, as `8543f46` the Candle Gate rules in
  `Process.md` and `CLAUDE.md`, and `e199c80` the code: T1, T2, T3, T4, T5 and N9, 54 files.
  Verified at 968 tests over 57 files with typecheck clean, on a tree nothing had written to for
  three minutes. All of it is committed but **unreviewed**, so the tickets stay
  `done, unreviewed` until the review bot has been through them; the SHA above is the one to
  review against.
  **The split by lane was tried and failed, for a reason the lanes should know.** The server half
  was committed alone and then checked out into a throwaway worktree and tested in isolation: it
  is red. `tests/day.test.ts` imports `../web/src/timeMark`, so a server test will not build
  without a page file, and `tests/webTown.test.ts` fails against the new hiring rules until the
  page lands with them. The first is T4 working as intended -- the test is what stops the ⌛
  drifting between `data/day-text.json` and the page's constant -- but single-sourcing a
  player-facing word across the server/page line also welds the two lanes together in history.
  Expect more tests like it as the Candle Gate rules spread, and expect commits that cross lanes
  because of them. Given the choice between a red commit and a wide one, the wide one wins.
- 2026-10-19: the commit bot committed the whole tree in three commits: `ee788ef` the guides
  (`Story Guide.md`, `Combo Bake 2.md`, and the N8 vocabulary reaching the prose), `b1a3ca8` the
  code -- N8 plus N1, N3a, N3b, N7, Backend's bake and review subsystem, and Q3, 77 files -- and
  the commit carrying this line, the board. Verified at 918 tests over 53 files, typecheck clean,
  on a tree
  that had not been written to for three minutes.
  **Why the code is one commit and not six.** The board asked for a split by lane, and the
  snapshot was attempted before the sweep, as asked. It could not be taken: at 00:30 the tree
  had 24 failures, because the server had moved to the hand-written cast while two older test
  files still expected the generated names. Rather than commit a red "safety snapshot" -- the
  one commit a future panic reaches for -- the tree was saved outside git at
  `~/iwc-tree-snapshot-2026-10-19.tar.gz` and the sweep went ahead on that. The sweep then
  renamed about 430 places across every lane's uncommitted work, interleaving the rename with
  each lane's edits in the same files and often the same hunks, so the per-lane boundary no
  longer existed in the tree to be staged. **The lesson for next time: a sweep this wide wants a
  green tree and a commit before it starts, not after.** Only `Q3` has been reviewed; the rest
  is committed as a floor to stand on and is marked unreviewed in the message.
  Also left uncommitted on purpose: `Approved Combos.md`, 995 lines of JSON under a Markdown
  name, byte-for-byte identical to the committed `data/approved-combos.json`. Delete or rename
  it; nothing is lost either way.
- 2026-10-18: the commit bot cleared the backlog that had built up in the tree, as six commits:
  `2aabf29` the RTK rule, `7a95015` the commit chain and its hook, `b4960b0` the design map's
  cozy tone override and the parked law system, `e1c57fc` the jobs and quest-seed drafts,
  `2463bcd` the bake review and its triage sheet, `54e1ba8` a new `Process.md` saying how this
  project is built and what a commit here looks like. Commits from now on carry no co-author
  trailer; earlier ones keep theirs, since rewriting them would change every SHA this board
  cites. Two things for the lanes: **an RTK edge case** for the list in `CLAUDE.md` -- `git add
  -n .` returns nothing at all through the filter and ten lines under `rtk bypass` -- and
  **`Infinite Wizard Craft.md` points at three docs that are not in the tree**
  (`fantasy-cozy-direction.md`, `fantasy-data-checklist.md`, `fantasy-tag-vocabulary.md`), which
  look like `Tag Guide.md` and `Infinite Wizard Craft Phase Guide.md` after a rename. Naming is
  Trysten's call, so they were left alone.
- 2026-10-17: Trysten's commit chain (2026-10-16) is in: owner → review bot → commit bot, with
  a "Ready to commit" table, and a Bash hook that refuses history-writing git commands from any
  session but the commit bot. The commit bot claims itself as described under "Commit and review".
- 2026-10-15: infinite-spell-craft-05 (Backend) added a model order writer
  (`src/server/shifts/writer.ts`, `service.ts` `prepare`/`idle`, `store.listDoneShiftTexts`).
  Orders were one template over four subjects, drawn with replacement, so boards repeated.
  Now: no repeated subject on a board, and model text checked against the board and the last six
  done orders. Not committed. **For Rules:** each job has only 4 `subjects` in
  `data/job-skins.json` (schema minimum 3); the writer takes them as seeds and range, so more
  subjects per job (8 to 12) would help. The plain template `orderText` is Rules' file and still
  says "It calls for" every time; it is only the fallback now.

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
