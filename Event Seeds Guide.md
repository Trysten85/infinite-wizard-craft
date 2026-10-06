# Infinite Wizard Craft: Event Seeds v0.4 (DRAFT, seed and tag system)

This replaces the fixed event templates. An event is now a **seed**: a one-line premise plus tags. The AI invents the actual story, the people, and the wording. The code owns the consequences through **response types**, not through scripted options. Tone follows `voice.md`. Every number is a placeholder to tune in the config file.

## How an event works
1. **Code picks a seed** by matching the seed's tags against the player's job, top tags, level, Shop Rep, and recent events (see "Picking a seed"). It also picks the stakes size (S, M, or L) and whether the main person is new or returning.
2. **AI invents the story.** It gets the seed's premise and tags, the player brief (job, tags, rep band, recent history), and the cast. It writes a scene of 3-5 sentences, names any new people, and decides what went wrong or what is on offer. The seed is a starting point, so two events from the same seed should read differently.
3. **AI offers 3-4 responses,** each written in its own words but each tagged with exactly one **response type** (below). The AI chooses what the responses *are*; the code decides what each type *does*.
4. **AI takes a second look for a spell.** After the scene is written and before the player sees it, the AI is shown the scene and the spells the player has learned and can cast. If one of them would plainly solve the problem, it becomes the Skilled response (see "Spell solutions"). Usually none fits, and that is the expected answer.
5. **Player picks one.** The code applies the effects for that response type and stakes size. The AI writes a 1-2 sentence outcome.
6. **Code logs the event** to the interaction history, and may set a follow-up flag.

The code never reads the AI's story to decide effects. It only reads which response type the player chose.

## Response types (code-owned)
Every response the AI writes must map to one of these. Each type has a fixed effect profile, scaled by stakes size.

| Type | What the player does | Gold | Shop Rep | Fondness | Notes |
|---|---|---|---|---|---|
| Generous | Pays, gives, or goes out of their way | -S to -L | + | ++ | May set a follow-up flag |
| Skilled | Uses a tag or spell to solve it (gated) | ~0 | ++ | ++ | Only offered if the player has one of the seed's skill tags |
| Fair | Does the sensible, ordinary thing | small or 0 | + or 0 | + or 0 | The safe middle |
| Sharp | Takes advantage, haggles, or cuts a corner | + | - | - | Can pay off in gold, costs goodwill |
| Avoid | Ignores it, refuses, or leaves | 0 | -- | -- | May set a "problem returns" flag |

- The AI offers a mix: at least one non-negative type and (usually) one cost type. A seed lists which types it allows, and the code supplies those, so the AI can't offer a type that makes no sense for the seed.
- **Skill gate:** the Skilled response only appears if the player has a matching tag (or spell). The seed lists its skill tags from the closed tag list, so the AI never invents the gate.
- **Bounded surprise:** the code may add one small, tagged **twist** to an outcome (a bonus item, a price shift, a rumor), chosen from a short config list. The AI writes the line for it.
- **Price shifts, faction rep, and item hints** are optional extras that a seed can allow, with ranges in the config.

### Spell solutions (the second look)
Some events get better if the player knows a spell that solves them. Break something while you know Mending, and there is no loss to you and the town thinks more of you.

- **When:** after the AI has written the event, and before the player sees it. It is a separate, second step, so the scene is never written around a spell.
- **Who decides what:** the AI only answers one question: does one of these spells plainly solve this scene, and which one? It picks from the player's own list or says "none". The code owns the effect, which is the fixed **Skilled** profile: no gold lost, Shop Rep up, Fondness up.
- **Which spells count:** spells the player has **learned** and is high enough level to cast. A spell that bends someone's will (anything tagged `control`, such as Charm Person) is never offered as a solution.
- **Not every time:** the code only asks on some events (draft: 3 in 4), a seed can switch it off with `spell_solvable`, and the AI is told that most scenes have no fitting spell.
- **How it shows:** the Skilled response names the spell, so the page can show which one. If the player's tags had already earned a Skilled response, the spell version replaces it. If the seed did not allow Skilled at all, the spell adds it. There are still never more than four responses.
- **Fits:** something broke and the player knows Mending; a spill and Prestidigitation; something out of reach and Mage Hand. **Does not fit:** a nervous customer and Fire Bolt.

### Rep bands (draft)
| Shop Rep | Band | Effect |
|---|---|---|
| Below -5 | Wobbly | Fewer customers, prices fall about 10% |
| -5 to +5 | Fine | Normal |
| +6 to +15 | Liked | More customers, a small price bonus |
| +16 and up | Beloved | More customers, bigger bonus, extra event offers |

## Seed card format
Each seed is a data entry (YAML or JSON):

| Field | Meaning |
|---|---|
| id | Stable ID |
| premise | One line the AI expands. Short and loose, never a full scene |
| kind | One of the event kinds below |
| mood | 1-2 mood tags (below) |
| tags | Player-side tags that make this seed likely or allowed (from the closed tag list) |
| skill_tags | Tags that unlock the Skilled response |
| who | `new`, `returning`, or `any` (who the main person is) |
| stakes | Allowed sizes (S, M, L) |
| response_types | Which of the 5 types the seed allows |
| follow_up | none, possible, or likely, plus the kind of follow-up |
| spell_solvable | Whether the second look for a spell runs for this seed (default yes) |
| min_level, job_filter | Optional limits (most seeds have none) |

### Event kinds (closed list)
- **oopsy:** the player caused trouble
- **mishap:** something went wrong that wasn't their fault
- **opportunity:** a chance to grow the shop or career
- **conflict:** someone is unhappy
- **social:** a meeting, a friendship, a light romance
- **bureaucracy:** an official or a rule
- **community:** the town needs something
- **trade:** an odd deal or a rare find
- **comic:** pure silliness with a small cost or reward

### Mood tags (closed list)
warm, awkward, silly, tense (mild), proud, mysterious (harmless), bittersweet

The AI must stay inside the mood tags. They steer the scene's feel, and the critic pass checks them.

## Starter seeds (10 + the Repeat)
Premises are deliberately loose. The AI decides who, where, what, and how it feels.

| # | Seed id | Kind | Premise | Mood | Tags | Skill tags | Types allowed | Follow-up | Spells that could solve it (examples) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | meet_cute | social | Someone new catches the player's eye at work, and the player has a chance to make an impression | warm, awkward | any job | brewing, knowledge, mind | Generous, Skilled, Fair, Avoid | likely | Prestidigitation for a small flourish; Light or Dancing Lights to set the mood |
| 2 | my_fault | oopsy | The player's magic or work causes a small mess for someone nearby | awkward, silly | any caster | utility, healing, transform | Generous, Skilled, Avoid | possible | Mending to fix what broke; Prestidigitation to clean up the mess |
| 3 | grand_guest | social | An important person visits and expects a lot | tense, proud | any job, level 2+ | court, knowledge, hospitality | Generous, Fair, Sharp | possible | Prestidigitation to warm, tidy, and season; Dancing Lights for the room |
| 4 | small_thief | comic | A small animal or odd creature takes something it shouldn't | silly | any | animal, utility | Generous, Fair, Avoid | possible | Mage Hand to fetch it back; Speak with Animals or Animal Friendship to ask nicely |
| 5 | town_needs | community | The town needs a favor with a deadline | warm, proud | any job, level 2+ | utility, crafting tags | Generous, Skilled, Avoid | possible | Mending, Light, Purify Food and Drink, or Create Food and Water, depending on the favor |
| 6 | the_official | bureaucracy | Someone official checks on the player's work | tense, awkward | brewing, enchanting, trade | knowledge, protection | Fair, Generous, Sharp | possible | Detect Magic or Identify, to show the work is what it claims to be |
| 7 | big_chance | opportunity | A big opportunity for the player's job appears | proud, tense | any job, level 2+ | job's own craft tags | Generous, Skilled, Fair, Avoid | likely | Whatever suits the job: Mending for a smith, Prestidigitation for a tea shop |
| 8 | unhappy_someone | conflict | Someone is unhappy with the player, for a reason the story gives | tense, awkward | any | job's own craft tags | Generous, Skilled, Fair, Avoid | likely | Mending or Prestidigitation to put the thing right. Never a spell that changes their mind |
| 9 | off_the_menu | trade | Someone asks for something unusual and the player picks their line | silly, mysterious | any job, level 2+ | job's own craft tags | Fair, Sharp, Avoid | possible | Identify, Detect Magic, or Prestidigitation |
| 10 | not_my_mess | mishap | Someone else breaks, spills, or ruins something of the player's | awkward, warm | any | none | Generous, Fair, Sharp | possible | Mending, so nothing is lost; Prestidigitation for a spill |
| 11 | repeat | (inherits) | A person the player has met before comes back | (inherits) | any | (inherits) | all 5 | per history | (inherits) |

### More seed ideas for later (not in the starter set)
a rival's friendly challenge, a lost item with no owner, a festival booth, a rumor about the player, a stranger asking for directions, a sudden shortage of an ingredient, a traveling merchant, a rainstorm, a surprise visit from family.

## Picking a seed
The code scores each seed and picks randomly by weight:
- **Job match:** seeds whose tags overlap the player's main job and top tags rank higher; a secondary job counts half.
- **Gates:** the seed's level, job, and rep limits must pass.
- **Variety:** a seed or kind that fired recently is weighted down, so the same kind doesn't repeat back to back.
- **Story pressure:** open follow-up flags and recent big events raise matching seeds (an unhappy NPC raises `unhappy_someone` and `repeat`).
- **Mood balance:** if the last few events were tense, prefer warm or silly.
- **Repeat share:** the Repeat seed is picked about 1 in 4 once the player has met at least a couple of NPCs (placeholder).

### The Repeat seed (how it differs)
- **Pick rule (code):** weighted choice among known NPCs. Weights go up for open follow-up flags, strong Fondness (high or low), and time since last seen. An NPC with an open flag takes priority over a plain return. A cooldown stops the same NPC appearing twice in a row.
- **Premise:** the AI is given the NPC's record and last few interactions, then decides why they return (to say thanks, ask a favor, pick a fight, bring a gift, or just say hello). It inherits the earlier seed's mood, adjusted by Fondness.
- **Response types:** all 5, with Fondness shaping which are offered (high Fondness: Generous and Fair lean positive; low Fondness: Avoid and Sharp come with larger costs and an "Amends" Generous option).
- **Resolved threads:** the code can mark an NPC "resolved" after a settled apology, a finished arc, or a full falling-out. Resolved NPCs return rarely, for a short, warm closing scene.

## Interaction history (what we store)
Every event writes a record, so Repeats and the AI both have something to work from.

### NPC record (one per recurring character)
| Field | Meaning |
|---|---|
| npc_id | Stable ID |
| name | Written by the AI the first time, then fixed |
| role and trait tags | A short role (neighbor, customer, inspector) and 1-3 tone words (fussy, shy, cheerful), chosen once and then fixed |
| facts | A few stable facts the AI introduced (a pet, a job, a quirk), written once, never edited by later scenes |
| fondness | Current number, code-owned |
| status | active, resolved, or dormant |
| first_met_event, last_seen_day | Where the thread started and when the NPC last appeared |
| open_flags | List of pending follow-ups (with earliest day) |

### Interaction record (one per event)
| Field | Meaning |
|---|---|
| interaction_id, day | When it happened |
| seed_id and kind | Which seed ran |
| npc_ids | Who was involved (may be none) |
| scene_summary | 1-2 plain sentences the AI writes right after the scene |
| response_type | The type the player chose |
| response_text | The wording the AI used for that option |
| effects_applied | Gold, Rep, Fondness, price shift, flags: exactly what the code did |
| outcome_summary | One sentence the AI writes for the next prompt |
| tags | The player's top tags at the time |

### Rules for the history
- **Code owns numbers and flags,** and the AI only writes the summaries and the new facts.
- **The AI's prompt gets a trimmed view:** the NPC record, their last 3-5 interactions, any open flags, and the last few events overall. Never the full log.
- **Facts are fixed once written.** If a later scene needs a new fact about an NPC, the AI proposes it and the code adds it to the record. The critic checks later scenes against the facts so nobody changes jobs or loses a cat.
- **Size control:** older summaries compress into one line per NPC. The full log stays on disk for review but isn't sent to the model.
- **Guardrails:** NPC names follow the naming style and pass the named-entity check. Player-typed names, if allowed later, are sanitized and kept out of any shared cache.
- **Per-player storage:** history belongs to each player's save, separate from the shared combo cache.
- **Review tool:** a simple view to read, edit, or delete any NPC or interaction, to fix bad AI output.

## Rules for the AI writer
- Use the seed's premise and mood as a starting point, then invent freely: the setting, the people, the problem, and the details. Don't copy any sample line.
- Scene: 3-5 sentences. Each response: one short line. Outcome: 1-2 sentences.
- Return exactly the response types the code requests, once each, with the type labeled. No extra options, no missing ones.
- Never mention gold, rep, Fondness, or any number in the text. The UI shows them.
- Honor the player brief: refer to their job and recent events when it fits. Reuse NPCs from the cast when the seed allows it.
- Stay in tone (`voice.md`): warm, wry, harmless. No injury, cruelty, real people, real drugs, or explicit content. Romance stays light (a walk, a pie, a letter).

## Notes for Claude Code
- Store seeds as data files with the fields above. Effects by response type live in the config file, so tuning needs no code change. The AI prompt never contains numbers.
- The second look for a spell is its own model call with its own schema: one spell id from the player's list or "none", plus the response line and outcome. The response line must name the spell. The effect is always the Skilled profile.
- Validate the AI's output with a schema: scene text, a list of responses each with a `type` from the allowed set, outcome text per response, any new NPC (name, role, trait tags, facts). Reject and reroll on a missing, extra, or mislabeled response.
- The critic pass checks tone, mood match, no numbers, consistency with NPC facts, and that each response really fits its type (a "Generous" response must actually be generous).
- Log every event and model call. Add an event log viewer.
- Tests: seed scoring and weights, variety cooldowns, skill-gate filtering, response-type effects by stakes, rep bands, price shift expiry, the Repeat picker (priority for open flags, cooldown, resolved NPCs, empty history), and history compression.
- Phase it: build the seed picker, response types, and history with a stub "AI" that returns canned text first, then plug in the real model.

## Open questions
1. **Response type balance:** should the AI always offer 4 responses, or 3-4 depending on the seed? (Draft: 3-4.)
2. **The Sharp type:** is it okay for players to profit by being a bit sneaky, or should it carry a harder cost?
3. **Twists:** how often should the code add a bonus twist to an outcome? Draft: about 1 in 5.
4. **Price shifts:** shop sell price only, or buy price too?
5. **Fondness:** apply to every recurring NPC, or only a small named cast (draft cap: 8-10 active)?
6. **Romance:** keep it to dates and gifts, or build a longer thread? Draft: light and optional.
7. **Events per day:** one per in-game day, or random?
8. **Repeat frequency:** about 1 in 4 once the player has met a few people. Too much, too little?
9. **Seed library size:** the 10 are starters. How many for launch (30? 50?), and should the AI be allowed to propose new seeds for human review?
10. **Spell solutions:** the code asks about 3 events in 4 (draft). Should some spells do more than the plain Skilled effect, such as Mending also returning a broken item?
11. **Memory depth:** is the last 3-5 interactions enough for the AI, or do you want longer arcs?
