# Infinite Wizard Craft: Quest Seeds v0.1 (DRAFT, seed and tag system)

Quests use the same idea as events (`fantasy-event-moments.md`): the design is a **seed**, not a script. A quest seed is a loose premise plus an **objective pattern** with open slots. The code fills the slots from the player's state, and the AI invents the story around them. Two players on the same job, or the same player twice, should rarely get the same quest. Tone follows `voice.md`. Every number is a placeholder to tune in the config file.

These are side quests and repeatable quests. The tutorial chain in the design map stays as it is.

## What the code owns and what the AI owns
| Code owns | AI owns |
|---|---|
| Which seed, the stakes size (S/M/L), the deadline | The quest giver's name, personality, and reason |
| The objectives: type, required tags, counts, tier | The story, setting, and why it matters |
| Progress tracking and completion checks | Wording of the quest title, the step text, and the progress notes |
| Rewards (gold, XP, rep, items, Fondness) | The turn-in scene and the thank-you text |
| Complications and bonus objectives (which ones, when) | How each complication reads |
| Failure and expiry rules | The line of the giver's reaction |

The AI never decides whether an objective is done. The code does, using tags and counts.

## Objective types (closed list, code-owned)
Every quest step is one of these. A seed lists which types it uses and what fills each slot.

| Type | The player must | Slots the code fills |
|---|---|---|
| Make | Craft or brew an item that meets requirements | item tags, minimum tier or quality |
| Gather | Collect materials | material tag, count, how (forage, trade, or craft) |
| Deliver | Bring something to a person or place | the item, the recipient (an NPC) |
| Serve | Complete some number of customer sales or jobs | count, job tag, optional quality |
| Discover | Make a first-time discovery that fits a description | a set of tags the new thing must have |
| Cast | Use a spell on a task | spell tag, count, a non-violent target kind (a chore, a plant, a lantern) |
| Tend | Let something grow, brew, or age over in-game days, with check-ins | item or plant, days, check-in count |
| Reach | Hit a milestone | rep band, Fondness level, or player level |

Nothing in the list needs combat, and nothing pays for damage.

## Quest anatomy (the data entry)
| Field | Meaning |
|---|---|
| id | Stable ID |
| premise | One loose line the AI expands, never a full scene |
| kind | commission, errand, deadline, puzzle, project |
| mood | 1-2 mood tags from the event mood list (warm, awkward, silly, tense (mild), proud, mysterious (harmless), bittersweet) |
| steps | An ordered list of objective patterns with open slots |
| slot_rules | How each slot is filled from the player's job, tags, inventory, level, and recent history |
| giver | `new`, `returning`, or `any` |
| complications | A short list of options (see below), of which the code may add one |
| bonus | An optional extra objective for a better reward |
| reward_profile | Gold, XP, rep, Fondness, item or recipe hint, scaled by stakes |
| time_limit | None, soft (reward shrinks), or hard (the quest expires) |
| min_level, job_filter | Optional limits (most seeds have none) |

## Why two playthroughs differ (the variation levers)
1. **Slot fill from the player.** The code reads the main job, secondary job, top tags, inventory, and level. A tea shop owner's "Make" slot gets brew tags, and a blacksmith's gets forge tags. Two tea shop owners with different tags get different asks.
2. **Constraint modifier.** The code can add one: a tag the item must have, a tag it must *not* have, a minimum quality, or "uses an ingredient you haven't used yet."
3. **Giver.** New or returning. Returning givers come from the interaction history and bring their past with the player.
4. **Complication.** The code may insert one at a step (about 1 in 3 quests): a short event seed drawn from the event system (a goose, an inspector, an unhappy customer), a changed deadline, or a swap of the item.
5. **Branch choice.** Some steps offer two ways to satisfy the same slot (forage it, trade for it, or craft it), and the player picks.
6. **Bonus objective.** Optional, tagged, and tied to the player's build.
7. **Anti-repeat memory.** The code logs the slot values used, and the next fill weights against anything used in the last several quests.
8. **AI story.** Even with identical slots, the AI writes a different giver, place, and reason each time.

## The 5 starter quest seeds

### 1. The Commission (kind: commission)
- **Premise:** Someone needs a particular thing made, and has opinions about it.
- **Mood:** warm, awkward.
- **Steps:** Make (item tags from the player's job, plus one constraint modifier) → Deliver (to the giver).
- **Slot rules:** item tags = 2-3 tags from the player's job's wanted list, or from their top tags. Constraint = one extra tag, a minimum quality, or "no `rare` ingredients."
- **Complication options:** the giver changes the order mid-way, an ingredient runs out, the giver's pet inspects the item.
- **Bonus:** use an ingredient the player hasn't used before, or finish early.
- **Time limit:** soft.
- **Giver:** any.
- **Reward profile:** gold (M), XP, rep, Fondness.
- **Two possible versions:** a tea shop owner asked for "a calming blend, strictly no rare herbs, for a very nervous goat." A smith asked for "a gate hinge that doesn't squeak and doesn't cost much," for a person who hates both.

### 2. The Shortage (kind: errand)
- **Premise:** Something the town or a neighbor depends on has run out, and someone needs materials fast.
- **Mood:** tense (mild), warm.
- **Steps:** Gather (a material tag, a count, and a method: forage, trade, or craft) → Deliver (to a person or the town).
- **Slot rules:** material tag = one from the player's job's tags, with a bias toward something the player lacks. The method is the player's choice at the start, with rewards slightly higher for foraging.
- **Complication options:** a rival buys up the stock, bad weather, a recipient who isn't home.
- **Bonus:** deliver more than asked, or deliver with a handwritten recipe.
- **Time limit:** soft.
- **Giver:** any.
- **Reward profile:** gold (S-M), XP, rep (town-wide), a chance of a rare material.
- **Two possible versions:** the lamplighters need glowing moss (a farmer forages it); the bakery needs flour-grade grain (a brewer trades for it).

### 3. The Big Day (kind: deadline)
- **Premise:** A date is coming, and someone has big plans that need the player's help.
- **Mood:** proud, tense (mild).
- **Steps:** Make or Serve (a count, scaled to the stakes) → Deliver or Reach (be present on the day).
- **Slot rules:** the occasion is the AI's choice (a wedding, a fair, a guild showcase, a funeral for a beloved old hat), but the count, tags, and deadline come from the code, based on level and job.
- **Complication options:** an order doubles, a key helper falls ill (mildly), a surprise guest arrives, the date moves up.
- **Bonus:** reach a quality target or add a signature touch from the player's own tags.
- **Time limit:** hard on the main deadline, with bonus extras if finished early.
- **Giver:** any, with a strong chance of a returning NPC if the player is Liked or better.
- **Reward profile:** gold (L), XP (more), rep (larger), item or recipe hint.
- **Two possible versions:** a wedding that needs 30 cups of "something dignified"; a fair where the farmer's pumpkins must be both enormous and polite.

### 4. The Puzzle (kind: puzzle)
- **Premise:** Someone describes a thing that doesn't exist yet and asks the player to make it exist.
- **Mood:** mysterious (harmless), silly.
- **Steps:** Discover (a new thing whose tags match a described set) → Make (one of it) → Deliver.
- **Slot rules:** the code picks 2-3 tags the finished thing must have and a tier close to the player's level. It picks a combination the player hasn't yet discovered, so the quest is a real first-time discovery. The AI describes it in the giver's words ("a tea that tastes like rain," "a lock that only opens for kindness") without giving the recipe.
- **Hints:** the player can ask the giver for a hint, which costs a little rep or gold and reveals one tag or an ingredient category.
- **Complication options:** a misleading clue from a gossiping neighbor, a rival chasing the same thing.
- **Bonus:** a second, matching discovery on the way.
- **Time limit:** none, but the giver may check in.
- **Giver:** any.
- **Reward profile:** XP (the biggest of the five, since it includes the discovery reward), gold (M), a recipe hint, and a named entry in the player's book.
- **Why it varies:** the tag set is different every time, so even the same job gets a different puzzle.

### 5. The Slow Project (kind: project)
- **Premise:** Something worthwhile takes time, and someone asks the player to see it through.
- **Mood:** warm, bittersweet.
- **Steps:** Gather (starter materials) → Tend (a number of in-game days, with check-ins) → Make (a finished result) → Deliver.
- **Slot rules:** the thing to tend is chosen from the player's job: a tea blend that must steep for days, a seedling, a batch of aged metal, a slow brew. Days and check-ins scale with stakes.
- **Check-ins:** at each one, the code can ask the player to do one small thing (add a drop of something, adjust the heat) and may fire a small event seed. The AI writes a short progress note each time.
- **Complication options:** a bad batch (replace a step), a surprise visitor, a wrong season.
- **Bonus:** finish with a higher quality than asked.
- **Time limit:** soft. Missing a check-in lowers the result's quality instead of failing the quest.
- **Giver:** returning preferred, since long quests suit people the player knows.
- **Reward profile:** gold (M), XP, Fondness (large), and a lasting perk (a small price shift or a recurring customer).
- **Two possible versions:** a farmer tends a stubborn seedling for an old neighbor who talks to it; a smith watches a long, slow cooling for a bell that must ring in one particular note.

## Rewards and failure
- **Reward scale:** stakes size (S, M, L) sets the base gold and XP. Level and tier scale it. The bonus objective adds a smaller extra.
- **Style reward:** how the player does it can change the extra reward (a skilled solution, a generous solution, or a quick one), tied to the same response-type idea used in events.
- **Soft failure:** an expired or abandoned quest costs a small rep dip and the giver's disappointment, never anything harsh. Abandoning is always allowed. Hard deadlines only close the quest, with no extra penalty.
- **No stacking exploits:** a quest pays XP once. Discovery XP inside a quest follows the normal "each discovery pays once" rule.

## Quest log and history
Quests connect to the interaction history so the story holds together.

| Field | Meaning |
|---|---|
| quest_id, seed_id, kind | Which quest and seed |
| giver_npc_id | Link to the NPC record |
| status | offered, active, complete, failed, abandoned |
| step_index and step_state | Where the player is, and each step's progress |
| slot_values | The exact tags, counts, and modifiers the code filled (used for anti-repeat) |
| complication | Which one fired, if any |
| title, step_text, summary | AI-written, stored, and fixed |
| rewards_applied | Exactly what the code paid out |
| started_day, ended_day | For pacing and memory |

- Completing a quest writes an interaction record for the giver, so the Repeat seed can bring them back.
- The AI prompt gets the quest's slot values, the giver's NPC record, and the last few quests' summaries, never the full log.
- Facts the AI introduced (a goat named Duchess) go into the NPC record once, and stay fixed.
- A quest log viewer lets you read, edit, or delete quests, to fix bad AI output.

## Rules for the AI writer
- Use the seed's premise and mood as a starting point, then invent freely: giver, setting, reason, and details. Don't reuse earlier quests' wording.
- Write the quest title, a short brief (2-4 sentences), a one-line description per step, a progress note per check-in, and a 2-3 sentence turn-in scene.
- The brief must mention every slot the code filled (the right tags, counts, and constraints), in plain words. It must not add, drop, or change any requirement.
- Never write numbers for gold, XP, or rep. The UI shows them.
- Stay in tone (`voice.md`): warm, wry, harmless. No injury, cruelty, real people, real drugs, or explicit content. Romance stays light.
- A quest never requires fighting or harming anything.

## Notes for Claude Code
- Seeds, objective types, and reward profiles live in data files. Numbers live in the config file. The AI prompt never contains numbers.
- Slot fillers are code functions with tests: they read job, tags, inventory, level, and history, and avoid recently used values.
- Validate the AI's output with a schema: title, brief, one text per step, and optional new NPC and facts. A critic pass checks that the brief matches the filled slots, the tone is right, and nothing violates the NPC facts. Reroll on failure.
- Objective completion is pure code: tag checks, counts, item tier, and days.
- Complications call the event system, so build events first or stub them.
- Tests: slot fill by job, anti-repeat, objective completion for each type, reward scaling, soft failure, abandonment, Tend check-ins and quality loss, complications, and history links.
- Phase it: build the objective engine and 1-2 seeds with a stub AI that returns canned text, then plug in the model.

## Open questions
1. **Active quests:** cap at 2-3 at a time, or let players hold more?
2. **Quest board or NPC-initiated?** Draft: both, with a small board of 2-3 offers that refreshes.
3. **Complication rate:** about 1 in 3 (draft). Too many?
4. **Hints in Puzzle quests:** free, or at a small cost? Draft: small cost.
5. **Hard deadlines:** do we want any in v1, or keep every quest soft for a cozy feel?
6. **Seed library size:** 5 is the starter set. How many for launch, and can the AI propose new seeds for review?
7. **Shared quests:** should friends ever see or help with each other's quests? Draft: no, per-player in v1.
8. **Tutorial overlap:** should the first Commission replace the old step "Gather or craft a component for a higher spell"? Draft: keep the tutorial separate.
