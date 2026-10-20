# Infinite Wizard Craft: The Day and the Town v0.1 (DRAFT)

The design for two linked systems: a **day** with a shape, and a **town** the player builds out of
what they craft. Decided with Trysten on 2026-10-11. The work is split into tickets in
`Work Board.md`. Tone follows `prompts/voice.md`. Every number here is a placeholder that belongs
in `config/balance.json`.

You have not seen the conversation that led to this, so this guide carries everything you need.

## Why

The game's numbers lead nowhere. Measured from the code and the saved games:

- Gold piles up. One save earned about 1,580 gold and spent 588. The only sinks are learning a
  spell and buying a shortcut from the shop.
- Level only gates spell tiers, and stops at 5. A level-up opens nothing.
- Reputation moves shop prices by up to 10% and nudges how often events arrive.
- Fondness, learned spells, and jobs the player discovered but did not take up do almost nothing.
- The shop is open from the first minute, so there is nothing to earn.
- Three unrelated counters tick out of sight: the shop restocks every 5 discoveries, a shift opens
  every 10, an event arrives at 15 points.

The town gives each of those one clear outlet. The day replaces the three counters with one clock
the player can see.

| Already in the game | In the town it becomes |
|---|---|
| Gold | Plots, buildings, upgrades, a meal at the tavern |
| Level | Deeds: how many plots may be owned, and how high a building can be raised |
| Discoveries | Stock on a building's shelves |
| Jobs discovered | Townsfolk, each bringing the plan for their building |
| Learned spells | Enchantments on buildings |
| Fondness | Regulars |
| Job `wantedTags` (unused, kept "for score") | Building quality |
| Reputation | As now, plus more one-night happenings when the player is well liked |

## Rules that do not bend

1. **No timers.** Nothing moves while the player is away or sitting still. Only their own actions
   move the day.
2. **Crafting is never capped or blocked.** The player can always combine.
3. **Materials stay have / don't have.** Nothing is counted, and nothing is used up. Gold is the
   only thing spent.
4. **Nothing is lost without a clear warning.** No decay, no ruined results, no building taken away.
5. **Code owns rules and numbers; the AI writes words.** The first build needs no model call at all.
6. **It must feed crafting.** Every building gives the player a reason to go and make something,
   or makes what they make worth more.

## What the code owns and what the AI owns

| Code owns | AI owns (later; plain text from data files first) |
|---|---|
| The sun, the phase of the day, hourglasses, when night falls | The line that opens the evening and the night ledger's remarks |
| Plots, prices, deeds, what a building needs, tiers | A building's own name ("The Second Kettle") |
| Stock slots, quality, Cheer, takings, perks | A townsperson's name and what they say when called on |
| Which one-night happening, and its effect | How the happening reads |

The AI never decides quality, takings, or whether a need is met.

## The day

The day is a budget of the player's own actions. It has four parts.

| Part | What happens |
|---|---|
| **Morning** | The player crafts. Each new discovery made by combining moves the sun one notch |
| **Noon** | The sun reaches `noon`. The order board opens: one shift today, at the player's job |
| **Evening** | The sun reaches `length`. The street lights up and the player has `time` to spend in town |
| **Night** | The day closes. The ledger shows what the town took in. A new morning begins |

### The sun

- **What moves it:** a new discovery made by combining, one notch. Working the shift,
  `shiftNotches`. Count discoveries the way `craftedCount` in `src/server/crafted.ts` does: things
  bought or given do not count.
- **What does not:** combining a pair already known, a pair that makes nothing, buying, learning
  a spell, gifts.
- The sun stops at `length`. Crafting past that is allowed and never moves it further.

### The shift

- One shift a day, open from noon until night. A shift not worked is not saved up.
- This replaces `shifts.every`. Rank, orders, quality, and pay are unchanged.
- If the player's job has a building standing, the shift is worked there (see "Your own building").

### The evening

At dusk the player has `time` evening actions. An action costs one hourglass unless the table
says otherwise.

| Action | Hourglasses | Needs | What it does |
|---|---|---|---|
| Sit with a stranger | 1 | A visitor waiting | Plays tonight's event. At the door until a Tavern stands, then at the Tavern. This holds from the first slice: once the day is in, a visitor is only seen from dusk and costs an hourglass. The test-event route is a tool and is never gated |
| A meal at the Tavern | 1 | A Tavern, gold | Tomorrow's discoveries pay more. One meal an evening |
| Call on a townsperson | 1 | Someone to call on | Fondness up. See "Townsfolk and regulars" |
| Lend a hand | 1 | A building | That building's quality is one step better tonight. Once per building per evening |
| Enchant a building | 1 | A learned spell that fits | See "Enchantments" |
| Raise a building a tier | 1 | Gold, needs, level | See "Buildings" |
| Raise a new building | 2 | Gold, needs, an empty plot | See "Buildings" |

**Free at any time of day:** looking at the town, buying a plot, moving stock between buildings,
buying from the shop, taking up a job, learning a spell.

### When night falls

Night falls on the first of these:

1. The last hourglass is spent.
2. The player goes to bed. This is offered from dusk.
3. **The midnight oil:** the player makes `nightAfter` discoveries in a row after dusk without
   spending an hourglass between them. Spending an hourglass starts the count again. The discovery that
   brings dusk on does not count; the count starts with the next one. Unspent hourglasses are gone.
   The page shows the count running down, so this is never a surprise.

A player who only wants to craft can do so all night. They miss the evening, and nothing else.

**Turning in early:** from noon the player may call it a day. This does not bring night: it
moves the sun straight to dusk, and the evening then has `earlyTime` hourglasses. Night falls
after that in one of the three ways above. This is the way out for a player who is stuck for new
discoveries.

### The night ledger

Shown once, when night falls. In order:

1. Takings from each building, with its quality tonight.
2. Cheer, and its band.
3. Anything a perk grew or brought (a gift, a rumour).
4. Anything missed ("The pedlar packed up and moved on").
5. A deed, if the player gained a level today.
6. The morning: the shop has new stock, the board has new orders.

### What the day replaces

| Today | Becomes |
|---|---|
| `shop.restockEvery` (every 5 discoveries) | The shop restocks each morning |
| `shifts.every` (every 10 discoveries) | One shift a day, from noon |
| `events.every` and `events.points` (15 points) | One visitor a day, written from dawn so it is ready by dusk |
| The `eventEvery` column of `events.repBands` | `tonightChance`: a well-liked player sees more one-night happenings |
| The event service's `day` (`history.length + 1`) | The real day number |

- **The visitor is written while the player crafts.** The write-ahead code in
  `src/server/events/service.ts` already writes an event whole and out of sight. Start it at dawn.
- **An ordinary visitor waits.** If the player does not sit with them tonight, the same visitor is
  there tomorrow, and no new one is written. Model work is never thrown away.
- Follow-up flags (`flagDay: event.day + 2`) keep working, now against real days.

### Tonight only

Some evenings carry a one-night happening. It is the only thing a player can miss.

- From day `tonight.fromDay`, each day has a `tonight.chance` of one. Never two days running.
- **It is announced at noon** ("Word is, a pedlar comes through tonight"), so missing it is a
  choice.
- If night falls before the player takes part, it is gone. It can come round again later.
- Effects are code-owned and listed in a data file. The starting five:

| Id | What the player hears | Effect, tonight only |
|---|---|---|
| `pedlar` | A travelling pedlar sets down a pack | One material the player lacks, two or more steps deeper than anything they have made, is for sale, with or without a Market Stall |
| `lantern-festival` | Lanterns are going up along the street | An enchantment cast tonight lasts twice as long |
| `harvest-supper` | Long tables are out in the lane | Tonight's meal gives twice the lift |
| `musician` | Someone is tuning a fiddle | The first call on a townsperson costs no hourglass and counts double |
| `stargazer` | A stranger has a brass tube pointed at the sky | A free hint toward a spell the player can nearly make |

### Draft numbers (`day` in `config/balance.json`)

| Key | Draft | Meaning |
|---|---|---|
| `length` | 10 | Notches from dawn to dusk |
| `noon` | 4 | Notch at which the order board opens |
| `shiftNotches` | 2 | Notches a shift moves the sun |
| `time` | 3 | Evening actions |
| `earlyTime` | 1 | Hourglasses when the player turns in early |
| `nightAfter` | 6 | Discoveries past dusk, with no hourglass spent, before night falls by itself |
| `tonight.fromDay` | 4 | First day a one-night happening may appear |
| `tonight.chance` | 0.25 | Chance each day, before the reputation band's shift |
| `events.repBands[].tonightChance` | Wobbly -0.10, Fine 0, Liked +0.05, Beloved +0.10 | Added to `tonight.chance`. It takes the place of `eventEvery`. Set in slice 4 (E1) |

Saved players have gone at 120 to 160 discoveries an hour, so a day is about seven minutes. A day
is 10 discoveries, or 8 with the shift worked, so the roughly 245 discoveries to level 5 come to
between day 25 and day 30. Read the pace check against that range. The three old counters already
added up to a day of about ten discoveries, so this is a change of shape more than a change of pace.

## The town

### The street

- The town is one street, drawn side-on. Plots run along it in a row.
- **Plots are bought with gold,** the next one along each time, at `town.plotPrices`. The first
  costs 10 gold and waits on the player's first job (Trysten, 2026-10-15).
- **Level sets how many plots may be owned** (`town.deedsByLevel`). Gaining a level hands the
  player a deed in that night's ledger. This is what a level-up now gives.
- A building, once raised, stays where it is. A full pixel-art town map comes later, so keep
  position as plain data (a plot index) and keep rules about neighbours out of the first build.

| Key | Draft |
|---|---|
| `town.plotPrices` | 10, 30, 60, 100, 150, 210, 280, 360, 450 |
| `town.deedsByLevel` | 2, 3, 5, 7, 9 |

### Townsfolk bring the buildings

**A job the player crafts becomes a townsperson.** Person + Forge makes a Blacksmith, and a
blacksmith arrives looking for somewhere to work. Their arrival puts their building's plan in the
player's hands.

- A townsperson arrives when the job is first discovered, whether or not the player takes it up.
- The job the player **takes up** is the one they work themselves. The rest run their own places.
- A townsperson with no building yet gives nothing, and can still be called on.
- Six buildings come first. The other sixteen jobs keep working exactly as they do today until
  their buildings are written.
- Later, civic buildings with no townsperson (a well, a notice board, a square, a guildhall) will
  open by level and reputation. Leave room for a building whose `job` is absent.

### Buildings

A building has a tier from 1 to 3. Raising it, or raising it a tier, costs gold and has **needs**:
things the player must have discovered. Needs are checked, never taken.

A need is one of two shapes:

- **A named thing** with a hand-written recipe: `{ entry: "spirits" }`.
- **Any discovery with a tag, at a depth:** `{ tag: "brewing", depth: 5, made: true }`. `made`
  means the player combined it themselves, as in quests.

| Tier | Gold | Level | Needs | Stock slots | Takings a night |
|---|---|---|---|---|---|
| 1 | The building's own price | 1 | The building's named things | 2 | 5 |
| 2 | 150 | 3 | Two different things the player made, each at depth 5 or more and each carrying one of the building's wants | 3 | 12 |
| 3 | 400 | 5 | Three such things at depth 8 or more | 4 | 24 |

The first six:

| Building | Townsperson | Price | Needs at tier 1 | Wants (stock tags) | Enchant tags |
|---|---|---|---|---|---|
| Farm | Farmer | 30 | Mud, Animal | plant, animal, liquid | healing, enhance |
| Market Stall | Merchant | 50 | Tree, Glass | reagent, enchanting, industrial, knowledge | knowledge, utility |
| Tavern | Innkeeper (new job: Person + Spirits) | 80 | Spirits, Food, Tree | brewing, liquid, plant, animal | utility, healing |
| Smithy | Blacksmith | 70 | Forge, Iron | forging, metal, mineral, industrial | energy, protection |
| Herb Garden | Herbalist | 50 | Herb, Mud | plant, healing, reagent, liquid | healing, transform |
| Wizard's Tower | Wizard | 100 | Spellbook, Crystal | knowledge, enchanting, mind, energy | knowledge, protection |

**A want must be a tag with plenty of things behind it.** `rare`, `court`, and `toxic` are each
carried by one hand-written thing and almost nothing the model makes (`rare` is author-only), so
no building wants them. Counted on 2026-10-11, the wants above are each carried by 13 or more
drafted or fixed things. Two buildings may want the same tag: that is what makes stocking a choice.

What each gives back to crafting, by tier:

| Building | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Farm | Lifts the Tavern's quality one step | Lifts the Herb Garden too | Takings only |
| Market Stall | **Opens the shop,** with its three random shelves | Adds the three tailored shelves | Shop prices 10% lower |
| Tavern | Meals, and the evening's stranger sits here | A free rumour (a hint) every 3 days | The meal's lift is half as big again |
| Smithy | Extra gold for discoveries tagged metal, mineral, or forging | The same, larger | The same, larger |
| Herb Garden | Extra gold for discoveries tagged plant, reagent, or healing | With an Alchemist in town it becomes the Alchemist's, and grows a gift every 4 days | Gifts every 2 days |
| Wizard's Tower | Spells cost 25% less to learn | Enchantments last 2 days longer | One more hourglass each evening |

- The Herb Garden's tier 2 also needs the Alchemist to have arrived. A tier may name a job this
  way (`needsJob`).
- The things a higher tier asks the player to have made are materials or spells, the same things
  that can sit on a shelf. A deep job carrying a want does not count.
- Raising is refused for the level first, then the needs, then the gold, so the player hears
  about the longest wait first.
- **Extra discovery gold** is a share of the discovery's own gold, set by the building's quality
  that night. Smithy (Meh / Good / Great / Perfect): tier 1 `0.25 / 0.5 / 0.75 / 1`, tier 2
  `0.4 / 0.75 / 1.1 / 1.5`, tier 3 `0.5 / 1 / 1.5 / 2`. Herb Garden: `0.25 / 0.5 / 0.75 / 1` at
  every tier, since its later tiers give gifts. **The extra is rounded up, so it is never less
  than 1 gold.** A perk the player cannot see paying is a perk they do not have.
- A gift follows the rules events already use for gifts (`events.payoff`): something the player
  lacks and could reach, never one of `payoff.never`.

**Perk types.** Perks are data on the building, drawn from a closed list that code knows:

| Type | Fields |
|---|---|
| `opens-shop` | none |
| `shop-shelves` | which shelves it adds (`tailored`) |
| `shop-discount` | share |
| `discovery-gold` | tags, share by quality |
| `lifts` | building, steps |
| `learn-discount` | share |
| `rumour` | every (days) |
| `gift` | tags, every (days) |
| `enchant-days` | days |
| `time` | count |
| `meals` | lift, and the gold a meal costs |

### Stock and quality

- A building has stock slots by tier. The player puts a discovery in a slot.
- **What can be stocked:** materials and spells the player has discovered. Never elements,
  schools, jobs, or the focus.
- **A discovery sits in one building at a time.** Moving it is free and can be done at any time
  of day. This is the choice that makes it management: Honey can go on the Tavern's menu or the
  Herb Garden's shelf, not both.
- **Quality** uses the shift's scale and maths (`matchScore` and `qualityFor` in
  `src/shared/shifts.ts`), so the page can preview it the same way:
  - the share of the building's wants covered by its stock between them,
  - plus `shifts.tierBonus` when the best stocked thing is at least the building's tier,
  - plus the bonus of a live enchantment,
  - plus the player's rank bonus, at their own building only.
- That score gives Meh, Good, Great, or Perfect. `lifts`, lending a hand, and a good shift move
  it up by steps afterwards, never past Perfect. There is no luck in a building's quality.
- **Takings** each night: the tier's takings, times the quality's gold multiplier in
  `shifts.qualities`, times the Cheer band. Paid through the ledger with reason `takings`.
- An empty building is Meh and still pays. Nothing is ever ruined.

**What is guaranteed and what is found.** The town never waits on the overnight bake, and never
on the model's luck:

- A building can always be raised: tier 1 needs are hand-written things.
- A building can always reach Good: at least half of each building's wants are carried by things
  with fixed recipes. Counted on 2026-10-11, every building has at least three such wants.
- **The last want or two must be found.** `brewing` and `enchanting` are carried by nothing with
  a fixed recipe today (`knowledge` has four spells). A player gets them by combining: the model
  gives those tags to what it makes (26 and 77 of the 727 baked drafts carry them). Hunting for
  "something brewed for the Tavern" is the reason to go back to the board, which is the point.
- Tiers 2 and 3 ask for things made at depth 5 and depth 8. Almost nothing hand-written is that
  deep, so those tiers lean on the player's own discoveries by design, as the quest "Make
  something ten steps deep" already does. Material tags (plant, metal, liquid) are handed down
  from ingredients, so a deep thing carrying a want can always be made.

### Your own building

When the player's job has a building standing:

- Their rank bonus counts toward its quality.
- A Great or Perfect shift today lifts its quality one step tonight.
- Nothing else about the shift changes.

### Cheer

Cheer is how good life in the town is. It is **worked out each time, never stored,** so it
cannot drift out of step with the town.

- One point per quality step of each building (Meh 0, Good 1, Great 2, Perfect 3).
- One point per regular.
- One point per live enchantment.

| Band | From | Takings |
|---|---|---|
| Quiet | 0 | as they are |
| Pleasant | 4 | 10% more |
| Lively | 9 | 20% more |
| Merry | 15 | 30% more |

Reputation is separate and unchanged: it is what the town thinks of the player, and it is earned
through people. Cheer is what the player has built.

### Enchantments

A learned spell can be cast on a building as an evening action.

- **Which spells fit:** ones the player has learned and is high enough level to cast, that carry
  one of the building's enchant tags and none of `town.enchant.blockedTags` (draft: `control`,
  the same rule events use).
- One enchantment per building. A new one replaces the old.
- **It lasts** `3 + 2 x the spell's tier` days, and adds `0.1 + 0.05 x tier` to the building's
  quality score while it lasts.
- When it has one day left the ledger says so. It then ends, and can be cast again.

This is what learned spells are for, and what makes a higher spell tier worth reaching.

### Townsfolk and regulars

- Each townsperson gets a row in the `people` table when they arrive, with their job as the role.
  Their name comes from a list in a data file for now.
- People met through events are already in that table. Both kinds can be called on.
- **Calling on someone** raises Fondness by 1. Text is one plain line from a data file for now.
- At Fondness `town.regularAt` (draft 6) they become a **regular**: one Cheer point, and 10% more
  takings at their own building if they have one. A person met through an event is a regular of
  the Tavern.
- A regular stays a regular. Fondness falling later does not undo it.

### The Tavern's meal

- Costs `5 x level` gold and one hourglass. One an evening.
- **Tomorrow, discoveries pay 20% more gold and XP.** It ends at the next night.
- The XP part brings levels a little sooner. Trysten has accepted that as the numbers stand, so
  `levels.xpStep` is left alone.

## Townsfolk as neighbours (DRAFT, 2026-10-18)

Trysten's direction: most of the town is open all day, and townsfolk work the way Terraria's do,
with a story beat from Enshrouded. Every number below is a draft for `config/balance.json`. Open
questions are on the board under "Questions for design" (N-tickets).

### When things are open

| Time | Open |
|---|---|
| Morning to dusk | Crafting, building and raising, stocking, enchanting, lending a hand, the meal, plots, learning, the shop, and the shift (noon to dusk) |
| Dusk and night | The visitor, calling on people, tonight's happening, story scenes, and scenes between two townsfolk at the Tavern |
| Closed at dusk | The shop and the order board |

- Daytime actions cost no hourglass. Their limits are gold and once-a-day rules (a hand once a
  building a day, one meal a day). A raise finishes overnight.
- Hourglasses are the evening's budget for people: the visitor, a call, a story scene, listening in
  on two townsfolk. Nothing is lost by skipping them.

### Time and the hourglass (replaces candles; Trysten, 2026-10-19)

Candles were unclear about timing. The day is now shown as a sun-and-moon cycle, and the evening's
budget as hourglasses with no name: "You have 2 ⌛ left." In code it is `time`.

- **The sun** crosses the day, one notch for each new discovery and more for a shift. Noon is
  marked on the track, and the Dusk end says "The shop and the order board close here."
- **At dusk the moon** takes the sun's place, and the evening's ⌛ sit beside it. Sitting with the
  visitor or calling on someone takes 1 ⌛. Night falls when the time is gone ("The sand has run
  out"), when the player goes to bed, or after the midnight oil.
- Turning in early gives a shorter evening, `day.earlyTime`.
- **Names in code:** `day.time`, `day.earlyTime`, `timeLeft`, `timeMax`, `spendTime`, the `time`
  perk, the refusal `no-time`, and the night reason `out-of-time`. The database column is still
  `candles_spent`, and a saved ledger that says `last-candle` is read as `out-of-time`.
- The in-game Candle item is a thing like any other and is not part of this.

### Hiring (Trysten, 2026-10-19: replaces the arrival and homeless rules below)

The building comes first, then the person.

- **Craft the trade, then build.** Making a blacksmith gives the Smithy's plan. The player buys a
  plot and raises the Smithy. There is no one in town for it yet.
- **The next morning, someone comes to work there.** The building attracts them: one person to a
  building, the hand-written person for that trade, with their arrival gate still applying. There
  are no homeless townsfolk and nobody leaves at dusk.
- **Hiring costs gold once,** more for a higher tier (`town.hireByTier`, draft 20, 50, 100). Raising a
  staffed building tops the hire up by the difference. A hired person runs the building. An
  unstaffed building earns nothing, for now (Trysten, 2026-10-19).
- **They pay back every day.** A staffed building pays its takings each night, and more at higher
  Fondness or a better building, so the hire is an investment.
- **Apprenticeship is a choice.** Their lesson and Fondness (`town.teachAt`) let the player take
  up the trade and work its shift. The player may hire and never apprentice.
- The first plot asks only for a *discovered* trade (its plan), not for an arrived person.

### Arrival, homes, and what a person gives (OLD: the arrival and homeless parts are superseded by "Hiring")

- **Arrival:** discovering a job brings its plan, as now. The person arrives when their own
  condition is also met, written per person in `data/townsfolk.json` (a level, a building
  standing, a number of townsfolk, or a quest done). A few come through a visitor event
  instead and settle after a quest. These are the town's Villagers: a name, side quests, and no
  workshop.
- **Homes:** a person's building is their home. Until it stands they are **homeless**: they wait
  at the Tavern's door by day, give the worst prices, and leave at dusk, to come back the next
  morning. Raising their building houses them for good.
- **Their service:** a housed person opens something past the building's perk: commissions on
  the order board in their job's tags, a hint toward a recipe, or a reforge of a stocked thing.
  Each is data, and code decides the reward.
- **Neighbours:** each job likes some jobs and dislikes others (data). A liked neighbour on the
  next plot or two lifts that building's takings and its owner's Cheer a little, and a disliked
  one lowers them by the same amount, never below zero. Position is the plot index.

### Learning a trade

- A job is taken up only once its person has **taught** it, so the shift for that job stays shut
  until then. The starter job (the Wizard) is taught from the first day. A save that already has
  a job keeps it.
- Teaching needs Fondness `town.teachAt` (draft 4, below `town.regularAt`) and the person's first
  lesson done: one or two quests of theirs, such as crafting something they ask for or bringing
  a named material. Until then the person can be called on but gives no service.
- A job with no written person yet gets a lesson built by code from its `wantedTags` (make two
  things with those tags, then call on them), so nothing waits on writing.

### The cast is hand-written

- Named townsfolk are **data, not model output**: `data/townsfolk.json` (or `data/cast.json`),
  checked by a schema in `src/shared/schema.ts`. Each has an id, a name, a pronoun, a job, a
  one-line personality, liked and disliked jobs, an arrival condition, lesson quests, storyline
  beats with Fondness gates, and rewards. The model writes only the lines around them.
- The six buildings' people come first. The 30-name pool stays for Villagers and for jobs with no
  written person.
- The Story lane owns this content. Rules owns the schema and the maths, Backend serves it.

### The People tab

A bookmark beside Town. It lists everyone in town, housed or homeless, with Fondness against the
regular and taught thresholds, their home (or "waiting at the Tavern"), their service, what they
like, open quests with progress, and a hint of the next story beat (never the answer). One route,
`GET /town/people`, builds it from the same rules.

### Storylines and scenes

- Each craftsperson has a storyline of 3 to 5 beats, in new data. Code owns the objective, the
  Fondness gate and the reward. The model writes the lines.
- A beat's reward is a tier unlock, a new commission, or a perk, and a beat may wait on another
  person's beat, so the town depends on itself.
- Storyline quests keep to the quest rule: all quests together pay two fifths of each level's XP.
- At night two housed townsfolk may meet at the Tavern. Code picks the pair from their likes
  and the outcome (a friendship, a rumour, a small gift to the town). The model writes the
  exchange ahead, in the background, cached by pair. Listening in costs an hourglass, and the
  result is in the morning ledger either way.

### Essential buildings (DRAFT, Trysten 2026-10-19)

`utility` is not a tag a building wants. It is a property of the building: does the town need it?
The test is "would it shut during a fantasy plague?" A building that supplies goods or services
people cannot do without is **essential**. One that people enjoy is not.

| Essential | Not essential |
|---|---|
| Market Stall, Farm, Smithy, Herb Garden | Tavern, Wizard's Tower (and later a tea shop) |

- It is a flag in `data/buildings.json` (`essential: true`), checked by the schema.
- **Closures:** some one-night or few-day happenings (a plague scare, a storm, a curfew) close the
  non-essential buildings for their length. They earn no takings meanwhile, and the ledger says so
  in a line. Essential buildings keep earning. Nothing is ever lost for good.
- **Building needs the essentials:** a Smithy standing makes raising any building cheaper by a
  share (draft), as construction needs a blacksmith. A Carpenter's yard will do the same later.
- Numbers and the happenings go in `config/balance.json` and `data/tonight.json`.

## The shop is earned

- Until a Market Stall stands, the shop routes refuse with code `no-shop`, and the page shows no
  Shop bookmark.
- The Merchant is seven combinations from the start, and the stall costs 50 gold on the second
  plot, so a new player should open it by about day 6. The quest "Buy something from the shop"
  sits at level 2, which fits.
- At tier 1 the shelf holds only the three random things. The three tailored shelves
  (`nextStep`, `forJob`, `forLevel` in `src/server/shop.ts`) come at tier 2.

## Saved games

Nothing a player has is taken away.

- Every saved player starts on day 1, at dawn, with the sun at 0.
- An event already waiting becomes tonight's visitor.
- **A player who has ever bought from the shop is given a Market Stall** on their first plot, at
  tier 2, since they have been using all six shelves.
- Every job already discovered arrives as a townsperson.
- Ranks, quests, people, Fondness, levels, and gold are untouched.
- Back up `var/game.db` before the first run against it, and try each slice on a copy with a
  made-up player first. The dev server reloads rule changes onto real players while they are
  being edited.

## Quests

- New conditions for `questSchema`: `days` (days seen through), `buildings` (count, with an
  optional tier), `built` (one named building), `evenings` (evening actions taken), `regulars`.
- A short main-quest thread, placed after "Make a person": welcome a townsperson, buy a plot,
  raise a building, open the Market Stall, spend an evening at the Tavern, enchant a building.
- A test holds quests to two fifths of each level's XP. Keep that share: move XP between quests
  or pay the new ones in gold.

## Tests to write

- **The day:** each boundary of the sun (noon, dusk); what moves it and what does not; the shift
  opening and not being saved up; hourglasses spent and refused; the three ways night falls; the
  midnight-oil count starting again when an hourglass is spent; turning in early; an ordinary visitor
  waiting; a one-night happening being announced, taken, and missed; never two days running.
- **The town:** plot prices and deeds by level; a need met by a named thing and by tag and depth;
  `made` leaving out bought things; a discovery held by one building at a time; quality from
  stock, tier, enchantment, and rank; every lift capped at Perfect; takings by tier, quality, and
  Cheer band; each perk type; an enchantment's length and its ending; a regular staying a regular.
- **The shop:** refused before the stall; shelves by tier; the saved-game rule.
- **Never blocked:** every named need has a path by fixed recipes from the starting four, and
  every building can reach Good from fixed recipes alone: at least half its wants are each
  carried by a stockable thing (a material or a spell) with a fixed recipe. Model this on
  `tests/buildable.test.ts`. The test does **not** ask for a fixed recipe behind every want. See
  "What is guaranteed and what is found" under "Stock and quality".
- **Pace:** `npm run pace` prints, per level, the gold a player earns and the gold the town can
  take. Aim for the town to take about two thirds through level 5.

## Shapes for the page (sketch)

The rules lane owns the final types in `src/shared/schema.ts`. These are a starting point so the
page can be drawn before the server answers.

```
progress.day: {
  number, sun, length, noon,
  phase: "morning" | "afternoon" | "evening",
  time, timeMax,
  nightIn,            // discoveries until night falls by itself; evening only
  canTurnIn,          // true from noon
  turnInTime,      // what the evening will have if the player turns in early
  costs,              // every evening action's hourglass cost, read as day.costs.visitor
  shiftDone,          // today's shift has been worked
  tonight: { id, name, line, taken } | null,  // null until announced at noon
  lastLedger: Ledger | null                   // last night's, so the page can reopen it after a reload
}

Ledger: {
  day,
  takings: [{ plot, building, name, quality, gold }],
  cheer: { points, band },
  brought: [{ kind: "gift" | "rumour", line }],
  missed: string | null,
  deed: boolean,
  lines: string[]
}

TownView: {
  plots: [{ index, owned, price, building: BuildingView | null }],
  deeds: { have, max },
  cheer: { points, band },
  townsfolk: [{ person, job, name, housed, fondness, regular }],
  plans: [{ building, name, price, time, needs: [{ label, met }], ready }]
}

BuildingView: {
  id, name, tier, quality, takings,
  wants: string[],
  stock: [{ slot, entry | null }],
  enchantment: { spell, daysLeft } | null,
  next: { gold, level, needs: [{ label, met }], ready } | null
}
```

Any route that returns `progress` also returns `night: Ledger | null`, set when that action
brought night on. The same ledger is then kept as `progress.day.lastLedger` until the next night.

`progress.shiftReady` stays: true when a job is taken up, it is noon or later, and today's shift
has not been worked. `progress.shiftIn` goes.

| Route | Does |
|---|---|
| `POST /day/end` | Goes to bed, or turns in early before dusk |
| `GET /town` | The `TownView` |
| `POST /town/plots` | Buys the next plot |
| `POST /town/build` with `{ plot, building }` | Raises a new building (2 ⌛) |
| `POST /town/upgrade` with `{ plot }` | Raises it a tier (1 ⌛) |
| `POST /town/stock` with `{ plot, slot, entry }` | Stocks a slot, or clears it with `entry: null` (free) |
| `POST /town/hand` with `{ plot }` | Lends a hand (1 ⌛) |
| `POST /town/enchant` with `{ plot, spell }` | Casts a spell on it (1 ⌛) |
| `POST /town/meal` | A meal at the Tavern (1 ⌛, gold) |
| `POST /town/call` with `{ person }` | Calls on someone (1 ⌛) |

All under `/api/players/:player`. New refusal codes: `not-evening`, `no-time`, `no-deed`,
`needs-missing`, `no-shop`, alongside `not-enough-gold` and `level-too-low`. The list of codes
(`RuleCode`) moves from `src/server/combiner.ts` into `src/shared/schema.ts`, so the Rules lane
owns it and the page can import it; `combiner.ts` re-exports it. Every refusal is
`{ error, code }` with a sentence the player can read, and anything the page must show after a
reload is readable from a GET.

## Later, not in the first build

- Buildings for the other sixteen jobs (a library for the Scribe, a carpenter's yard that makes
  building cheaper, a tea shop, a watch house).
- Civic buildings by level and reputation.
- Model-written building names, townsfolk names, and what they say.
- The pixel-art town map, with neighbours that help each other.
- Seasons, festivals, and the Quest Seeds Guide's Tend objective, which all need days.
- A second job at half value.
- Raising the level cap past 5.

## Open questions (for Trysten)

1. **The Innkeeper's recipe.** Settled 2026-10-11 by Trysten: Person + Spirits. The bake's
   draft for that pair ("Bartender") is overwritten by the hand-written job.
2. **The meal's XP lift.** Settled 2026-10-11, as relayed by the Rules session: keep the 20%
   lift to gold and XP, and leave `levels.xpStep` alone.
3. **`utility`.** The model puts it on a great many things, so it is left out of every building's
   wants. Is that right, or should some building want it?
4. **The level cap.** Settled 2026-10-19 by Trysten: stays at 5 for now. Scaling and late game wait until the full loop is settled.
   (Earlier question:) With a town, level 5 comes between day 25 and day 30 and tier 3 opens at the
   same moment. Is the town the long game, or should levels go on?
5. **Naming.** "Cheer" for town satisfaction, "time" for evening actions, "deeds" for plot
   allowances. A farmer's order already mentions "the inn on Crumb Lane"; is that the street?
