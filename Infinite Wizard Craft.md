# Infinite Wizard Craft (working title): Design Map v0.1

## Handoff notes for Claude Code (read first)
This doc is the design source of truth. `fantasy-data-checklist.md` is the build order. Build **Phase 1 only** first, then stop and check in. Every number in here is a placeholder to tune, and anything marked DRAFT or listed under Open questions is not final.

### Rules of the build
1. **Code owns rules; the AI writes words.** XP, level, score, unlocks, law checks, and combo validity are computed in code. The model writes names, descriptions, and flavor, and judges borderline combos.
2. **Game data lives in data files** (JSON or YAML) validated by a schema: elements, schools, combos, spells, law table, XP table. Not in prompts, not hard-coded.
3. **All balance numbers live in one config file,** so tuning never needs a code change.
4. **All model calls go through one interface** so the LLM can be swapped. Model output is structured, validated against the schema, and rerolled on failure.
5. **Combo results are cached and persisted** so the same combo always gives the same result. Include a simple tool to review and delete cache entries.
6. **Write tests for every rule** and commit working versions often.
7. **Log every model call** (tokens and latency) so slow or failing prompts are easy to spot.

### Environment (decided)
- The model runs **locally on the user's own PC**, inside a VM the user has already set up. No hosted API.
- Who plays: draft is private, the user and a few friends, no profit.
- Cache shared across all players or per player. Draft: shared, with the delete tool above.

### First task: check the hardware
Before recommending anything, inspect the machine and report GPU model and VRAM, system RAM, CPU, free disk, and the VM host software.
- **Check whether the VM can actually see the GPU.** Many VM setups can't use the GPU without passthrough, and running a model on CPU alone is far slower. If the VM has no GPU access, either set up passthrough, or run the model server on the host (or WSL2 with GPU support) and have the game in the VM call it over the local network.
- Then recommend a runtime (for example Ollama, llama.cpp, or vLLM) and a model size class with quantization that fits the VRAM.
- Open-weight models change fast, so look up the current options instead of relying on memory.

### Picking the LLM
Build a small eval instead of guessing. Write 10-15 test prompts (generate a cantrip, judge a combo, name a spell, a voice check), run them on 2-3 local models in size classes that fit the hardware, and compare schema validity, in-world feel, and speed. What matters most for this game:
- **Reliable structured output.** Use the runtime's schema-constrained output (JSON schema or grammar) so a small model can't break the format.
- **Speed.** A new combo should come back in a few seconds. The critic pass doubles the calls, so measure with it on.
- **Voice.** Judge feel with the voice guide in the prompt, since a small model needs more steering than a large one.
- Hand-written combos and the cache mean the model is only called for new combos, so most play never waits on it.

The model interface in rule 4 makes swapping easy.

### Dependencies
- The combiner, cache, and element data can be built before the voice guide exists. The spell and name generator needs the Phase 0 voice guide first.
- Keep the SRD attribution text in the project. Any notes from the user's own D&D campaign go through the style-only distillation in Phase 0 and are never fed raw into prompts.

Original fantasy world. No canon to guard, so no lookalike checker. The engine is the same one designed for the Cradle fan project (alchemy combining, tags, a progression system, cache, critic), so it can be swapped between data layers later.

## Core idea
Start with a spellbook. Combine elements and materials to discover new spells, items, and jobs. Level up to reach stronger magic. Join guilds, pick jobs, craft your own gear. The AI writes names, flavor, spell variants, and random events scaled to your build. Code owns rules and numbers.

## Shared fields (every entry in every category)
- Tags (fire, healing, forging, living, mineral, rare...)
- Element/school affinity
- Tier
- Source (how you unlock or find it)
- XP (awarded the first time you discover or acquire it)

## Three categories

### 1. Magic (spellcraft)
Spells, elements and schools, enchantments, magical techniques, spell components as magic tags, and **magic jobs** (jobs that can't exist without magic): enchanter, potion brewer, magic advisor / court mage, wizard, sorcerer.
- *Within itself:* combine elements and spells to discover new ones; spells scale by tier.

### 2. Materials and nature
Magic foraging, unique metals, gems, trees, herbs, dirt, stone, water, bones, hides, and all other organic or inorganic matter.
- *Within itself:* blend or alloy materials; quality set by tier and affinity match.
- Rare/magical materials come from foraging in specific places and conditions.

### 3. People and civilization
**Non-magic jobs** (blacksmith, carpenter, farmer, merchant, hunter, and so on), guilds, towns, factions, man-made things (finished gear, tools, buildings), animals, familiars, and living beings generally.
- *Within itself:* jobs, guild ranks, town growth, bonds with animals and NPCs.

## How the categories connect
- **Magic + Materials = crafting:** potions, enchanting, alchemy, smithing, spell components.
- **Magic + People = training and jobs:** guild spells, apprenticeships, familiars.
- **Materials + People = trade and building:** gathering, markets, towns, finished goods.
- **All three = events and stories:** the AI uses your spells, materials, and social standing to write events.

Finished goods (a potion, an enchanted sword) are generated entries that carry tags from all three inputs.

## Base elements
The eight nouns everything is built from.

| Element | Represents | Feeds into |
|---|---|---|
| Fire | Energy, forges, destruction, purification | Evocation, smithing |
| Water | Flow, cleansing, chemistry | Alchemy, Transmutation |
| Earth | Stone, ore, soil, structure | Metals, building, Abjuration |
| Air | Breath, wind, sound, smoke | Illusion, voice magic |
| Life | Growth, blood, healing, beasts | Healing, Necromancy |
| Death | Decay, endings, the dead | Necromancy, rot |
| Light | Truth, order, faith | The church's side: Abjuration, Divination |
| Shadow | Secrets, concealment, fear | The underground side: Illusion, forbidden magic |

- Industrial feel comes from derived items (placeholder examples: Fire + Water = Steam, Earth + Fire = Metal, Tree + Fire = Smoke).
- Mind-related magic can come from a derived element (placeholder: Life + Air = Mind), so it doesn't need a base slot.
- Draft start: the classic four (Fire, Water, Earth, Air), with Life, Death, Light, and Shadow unlocked through early combos.

### Early unlock chain (placeholder recipes)
| Combo | Result | Logic |
|---|---|---|
| Fire + Air | Light | Flame in open air |
| Water + Earth | Mud | Already planned |
| Mud + Light | Life | Warmth and light on wet ground |
| Light + Earth | Shadow | Light blocked by something solid |
| Life + Shadow | Death | Life taken into the dark |

- Every advanced element is 1-3 combos from the starting four, so all eight are reachable in the tutorial and early game.
- Pacing: Light and Mud come first, Life and Shadow second, Death last (it needs both).
- It continues straight into the focus chain: Earth + Life = Tree, Tree + Light = Spellbook.
- Shadow being "light blocked by earth" fits the setting: the church's element (Light) casts the underground's element (Shadow).
- These are core progression combos, so they're part of the hand-written set, not left to the AI.

## Magic types: the eight schools
Schools are the **verbs** of magic (how you shape it). Elements and materials are the **nouns** (what it's made of). A spell is a noun plus a verb. Schools are a dimension a player chooses; they don't combine with each other the way elements do. Every spell carries exactly one school tag, which is also what the law table uses.

| School | What it does | Draft legal sensitivity | Example tags |
|---|---|---|---|
| Abjuration | Protective magic: wards, blocking, banishing, countering other magic | Commonly licensable | protection, ward, counter |
| Conjuration | Summoning creatures, creating objects, teleportation | Regulated, summoning and teleportation especially | summon, create, teleport |
| Divination | Revealing information, scrying, foresight | Tightly regulated near political figures | knowledge, scrying, foresight |
| Enchantment | Influencing minds, charming, compelling behavior and emotions | Most restricted | mind, charm, compel |
| Evocation | Channeling raw energy for destructive effects (often elemental) or healing | Restricted outside military use | energy, damage, healing |
| Illusion | Deceiving the senses or mind, phantasms, altered perception | Tightly regulated near political figures | deception, phantasm, perception |
| Necromancy | Manipulating life and death energies, harming undead, raising the dead | Most restricted | life, death, undead |
| Transmutation | Physically altering the properties, form, or matter of creatures and objects | Commonly licensable | change, form, matter |

Notes:
- Cantrips are element + school with no components (see Combo structure and scaling).
- Legal sensitivity is a starting draft for the law table; tune it per law level.
- Base elements (the nouns) are defined in "Base elements" above.

## Spell focus and discovery (DRAFT)
Elements and materials alone are just matter. A **spell focus** (a catalyst item every player crafts first) is what turns them into magic.

### Core loop
1. **Combine elements and materials** to discover new ones (Little Alchemy layer; no focus needed).
2. **Use the focus to cast:** Element + School, channeled through the focus, makes a cantrip. No focus, no spells.
3. **Discover higher spells** through the multi-route unlock rules (known lower spell, components, teacher, scroll, experimentation, heritage). You can hold a spell before you're high enough level to cast it.
4. **Discover classes (magic jobs)** by meeting their tag requirements (see below).

### Focus types
- A focus has a type (draft: 3-4, such as wand, orb, tome, charm). The type decides which schools it can channel. Players craft their first focus from the alchemy chain (see below), and the guiding questions can suggest which type to aim for.
- Start with one school. More schools unlock through routes (teacher, tome, guild, experimentation with rare materials) and need a minimum level.
- Better focuses are crafted (materials + a magic job) and raise the number of schools it can channel and add to your score.
- Crafting your first focus awards XP, and a better focus adds to your score.

### Crafting your own focus
The first focus is the player's first big discovery, built from ordinary combos.
- Placeholder chain: Earth + Life = Tree, Tree + Light = Spellbook (a tome-type focus).
- Each focus type has its own recipe from different elements and materials (placeholders: Tree + something for a wand, a glass-type material for an orb).
- The recipe decides the type, and the type decides the starting school.
- Better focuses need deeper materials and a magic job, the same depth rule as spells.

### Focus and the law
The focus is the regulated object. A **licensed focus** is registered and stamped by the church or a guild. An **unregistered focus** is contraband: it works the same, but carrying it adds heat. This ties the focus directly into the license, underground, and heat systems.

### Discovering classes
- Classes (enchanter, potion brewer, magic advisor / court mage, wizard) are goal nodes defined by tag requirements, not recipes (for example, an enchanter needs Enchantment, a focus, and a material tag).
- When a build meets a node's requirements, the class unlocks and the AI names and describes it for that player.
- The journal shows locked classes as silhouettes with a hint (like Little Alchemy's discovery log), so players know what they're working toward.

## Quests and tutorial (DRAFT)
A small quest system that doubles as the tutorial. Keep it light.

- **Code owns** each quest's objective (tag-based, such as "make a material with tag X" or "cast a cantrip"), its tier, and its reward (gold and XP). **The AI writes** the flavor text and the quest-giver's voice.
- **Gold** pays for trade, licenses, and the shortcuts already in the design.
- **XP** is the single progression number (see "XP, levels, and score"). Quests and first-time discoveries award it, and level gates which spells you can cast.

### Tutorial chain (placeholder, 5-6 steps)
1. Combine two elements (learn the core loop)
2. Craft your first focus (the Earth + Life = Tree chain)
3. Cast your first cantrip (Element + School through the focus)
4. Register your focus for a license, or keep it hidden and take heat (teaches the law system)
5. Gather or craft a component for a higher spell (teaches material depth)
6. Receive your first class hint (a locked silhouette in the journal)

Each step pays a small gold and XP reward and teaches one system. After the tutorial, the same quest templates generate repeatable quests scaled to the player's level.

## Combo structure and scaling

### Three combo types
| Type | Example | Role |
|---|---|---|
| Material + material | Water + Earth = Mud | Little Alchemy layer; builds the material tree |
| Element + school | Fire + Evocation = fire cantrip | Schools are verbs (method), elements are nouns (substance) |
| Spell + components | Fire spell + Evocation + sulfur + bat guano = Fireball | Components unlock and modify higher-tier spells |

The eight schools are defined in "Magic types: the eight schools" above.

### Scaling rule: material depth gates spell tier
- **Cantrip (tier 0):** element + school, no components. Easy to reach, available at the start.
- **Higher tiers:** need a known lower spell, the school, AND components. The deeper the component sits in the material tree, the higher the tier it unlocks.
- Code computes the "depth" of each material (how many combos from base materials), and a spell tier requires a minimum depth.

Example chain (placeholder):
1. Sound + Animal = Bat
2. Bat + Food = Bat guano (depth 2)
3. Fireball is a tier 3 spell (level 3 in the SRD). The component chain above is only one way to reach it (see "Ways to unlock a higher-tier spell").

### Ways to unlock a higher-tier spell
Every spell tier has **route options** for acquiring it and a **level gate** for casting it. A spell is acquired when the player satisfies enough routes (draft: any 2 of the list); no single route is required. It can be cast only once the player's level meets the spell's tier (Fireball is tier 3, so it needs level 3). An acquired spell the player can't cast yet is shown greyed out with its required level.

Routes into Fireball (tier 3), as an example:
1. **Spell ladder:** Fire Bolt (cantrip) to Burning Hands (tier 1) to Scorching Ray (tier 2) to Fireball (tier 3). Learning the lower spells counts as the route.
2. **Components:** sulfur plus bat guano (the material-depth chain).
3. **Teacher or guild:** learn it from a mage, a guild library, or a court mage mentor.
4. **Scroll or item:** find, buy, or craft a scroll or wand and study it.
5. **Experimentation:** combine a known fire spell with a volatile material and let the AI judge, then cache the result.
6. **Heritage or signature mark:** a fire-leaning arcane heritage counts as a route.

Notes:
- The route list per spell comes from its tags (fire, evocation, explosive), so most spells get routes without hand-writing each one.
- Higher-tier routes cost more (deeper material chains, more standing with a guild).
- SRD spells (Fire Bolt, Burning Hands, Scorching Ray, Fireball) can seed the ladder; verify each against the SRD text.

### Shortcuts (so the chain isn't a wall)
- **Foraging:** find guano in a bat cave, which skips the chain but needs a location and risk.
- **Trade:** buy it from a merchant or guild, which costs gold and standing.
- **Jobs:** an alchemist or herbalist may start with certain materials.
Each shortcut costs something, so crafting from scratch stays a real option.

### Hand-written combo targets (Phase 1)
- Elements: 12-15 progression-critical pairs (8 base elements = 28 possible pairs); AI fills the rest, cached
- Element + school: 10-12 seeds plus the SRD spell import
- Materials: about 20 base materials, 15 hand-written combos
- Components: start from SRD component lines
- About 40-50 hand-written entries total; everything else generated and cached within tag rules

## XP, levels, and score (DRAFT)
One progression number (XP) and one quality number (score). This replaces the earlier points-ceiling system. All numbers are placeholders to tune.

### XP and level
- **XP comes from** quests and first-time discoveries ("crafts"): a new element or material combo, a new spell, a new focus, a new job, joining a guild, and so on. Each discovery pays XP once, so exploring is rewarded and repeating the same combo isn't.
- **Higher-tier discoveries pay more XP.**
- **Level comes from total XP** (placeholder curve: each level needs more XP than the last).
- **Level gates casting, not owning.** A spell of tier N needs level N to cast (cantrips at level 1; Fireball is tier 3, so it needs level 3). Acquiring a spell is gated by routes (see "Ways to unlock a higher-tier spell"), so a player can hold a spell they can't cast yet. It shows greyed out in the spellbook with its required level, which gives them something to work toward.
- **Code owns** the XP table, the level curve, and the spell-tier-to-level rule. The AI never decides XP or level.
- Level is the ceiling. There is no separate points total.

### Score (how good the build is)
Level says what you *can* cast. Score says how well your build does its job.
- **Code computes it from tags.** Each job entry lists the tags a good build for that job has (a combat mage wants damage, energy, and control spells; a potion brewer wants brewing recipes and a rich material set). Your castable spells, gear, and focus are compared against your job's wanted tags.
- **Main job counts fully, secondary job counts half.** Dabbling in a second job adds a little and opens crossover builds.
- **Example:** a combat mage with no good combat spells at their level scores low. A combat mage with a strong set of combat spells and gear scores high. Two characters at the same level can have very different scores.
- **Possible uses (to decide):** guild admission and rank, event success odds, class title quality, quality of crafted items, bragging rights.
- Guilds, licenses, heritage, familiars, and gear matter through the resources they give and through score, not through a separate points total.

### Stacking
"Each discovery pays XP once" covers most of the stacking problem. Check during testing whether anything still needs a cap.

## Jobs
Two kinds, split by whether the job needs magic to exist.

- **Magic jobs (live in Magic):** enchanter, potion brewer, magic advisor / court mage, wizard, sorcerer. Require magic tags (a known spell or school).
- **Non-magic jobs (live in People and civilization):** blacksmith, carpenter, farmer, merchant, hunter, and more. Require no magic.

A main job counts fully toward your score; secondary jobs count half. Each job lists the tags a good build for it has. Jobs are goal nodes defined by tag requirements, not fixed recipes (for example, an enchanter needs a magic tag, a material tag, and a crafting tool), so many routes lead to each.

**Mixing the two is where crafting gets interesting.** A blacksmith with an enchanter side job can make enchanted gear, and a hunter with a potion-brewing side job can make beast-lure potions. Non-magic jobs can score well without any spells, while magic jobs have a higher potential score that depends on the spells you can cast. A court mage is a social job as well as a magic one, so it can also draw on guild and faction standing.

## Guilds
Tiered like small to large organizations. Bigger guilds give more resources and standing but add obligations or restrictions.

## Setting: regulated magic
Dark, gritty, church-run, industrializing world. Magic exists but is strictly regulated. Licensed practitioners (court mages, approved alchemists) operate under many rules; unlicensed practice is heresy. Underground guilds exist. Light gameplay system: few numbers, choices with costs.

### Law levels (code-owned, one for your home)
Your home has a law level. There are no hand-designed cities in v1; the law level is just a setting the code tracks, and the AI describes the place in flavor text when needed. Draft levels: **Open, Licensed, Restricted, Banned**. A law table defines what each level allows: which schools are legal, which jobs need a license, which materials are contraband, and what the penalties are.

### Schools as legal categories (draft)
The eight schools are a natural way to write law. Example sensitivity: Enchantment (mind influence) and Necromancy are the most restricted, Divination and Illusion are tightly regulated near political figures, Evocation is restricted outside military use, and Abjuration and Transmutation are commonly licensable. Spells carry school tags, so the law table applies to any spell, including AI-invented ones.

### Licensed vs underground
| Path | Gains | Costs |
|---|---|---|
| Licensed (above ground) | Safety, resources, legitimacy, access to court and guild libraries | Restricted schools, inspections, obligations, scrutiny near politics |
| Underground | Freedom, forbidden spells, black-market materials | Heat (suspicion), arrest or heresy risk, fewer resources |

- **Court mage:** a licensed magic job with the heaviest scrutiny. A single misstep near a political figure can trigger a heresy event.
- Licenses are entries with requirements and ongoing costs. Underground guilds use the same guild tiers with different tradeoffs.
- **Code-owned meters:** license standing, church standing, and heat. Law level plus meters decide which actions are safe, risky, or illegal.

### Law-change events
Random events can change a city's law level (for example, magic becomes restricted after a scandal or a political shift).
- **Code decides** when a change fires, which city it affects, the new level, and what it revokes or grandfathers in.
- **The AI writes** the announcement and the scenes around it.
- Keep these rare and telegraphed (rumors, rising tension first), and give players responses: comply, go underground, petition, bribe, or find a new home.
- The player's build is recalculated against the new law table, so the change actually changes how they play.

### Find a new home (relocation)
An abstract choice, not a designed city. The player leaves for a place with a different law level (code sets the new level, the AI writes the scene).
- **Gain:** magical freedom (a looser law level).
- **Lose:** your current job and guild, with their standing. You keep your XP and level, but your score drops until you rebuild.
- Stays simple: no map, no city entries, just a new home with a new law level.

### Later, not in v1: build your own tower
A long-term option for players who want independence: build a tower and focus on growing more powerful. Needs its own rules (cost, materials, upgrades, risks), so it comes after the core phases.

## Random events
The AI writes events using your build, level, job, guild, and inventory. Code decides the stakes, difficulty, and rewards from your level. The AI writes only the scene. Log events so later ones stay consistent with your story.

## Spells and the D&D 5e SRD
- The 5e System Reference Document is released under CC-BY-4.0. SRD spells (Fireball, Mending, and others) can be used with the required attribution. Check versions (5.1 and 5.2 have separate license texts) and take the text from the official release.
- Non-SRD spells (other books, named-wizard spells) are not covered. Verify any spell, such as Mold Earth, against the SRD before including it.
- Use SRD spells as a starting library, and use component lines (like sulfur and bat guano for Fireball) as seed material entries.
- Beyond the SRD, the AI generates original spells in your schema.
- The model knows D&D deeply, so outputs may drift D&D-flavored; a voice guide and original examples keep an identity of your own.

## Code owns
- XP table, level curve, and the spell-tier-to-level rule
- Score calculation
- Unlock checks
- Combo cache (same combo always gives the same result)
- Event stakes and rewards
- Schema validation

## AI layer
1. Voice and worldview guide (own words, every prompt)
2. Original sample outputs (3-5 spells, items, events) as few-shot examples
3. Strict output schema
4. Critic pass: scores outputs against a rubric (in-world only, right tone, correct scale for level) and rerolls on failure
5. Retrieval for world details

If prompting plateaus: LoRA fine-tune a small open model on your own curated outputs.

## Guardrails
Concepts are open; real people, brands, and real-world content are not.
1. Closed inputs (players pick existing entries, no free text at first)
2. Schema has no slot for real people
3. Named-entity check rejects real people, celebrities, brands, places
4. Moderation filter on all generated text
5. Sanitize any free-text fields and keep them out of the shared cache
6. Critic rubric includes no sexual or crude content and a stays-in-world check
7. Log newly invented items and audit them

## Roadmap
1. Element alchemy + spellbook builder
2. XP, levels, score + materials
3. Crafting and jobs (potions, enchanting, smithing)
4. People and civilization (guilds, towns, familiars)
5. Random events, world lore, stories

## Open questions
1. Stack limits: how many spells, jobs, guilds, bonds?
2. What do guilds and familiars cost?
3. Do we still need diminishing returns, or does "each discovery pays XP once" cover it?
4. First crafting test case: potion or enchanted weapon?
5. Final name (Infinite Wizard Craft is close to Infinite Craft; pick something distinct if published)
6. Start with the classic four elements (unlocking the other four through early discoveries) or all eight? Draft default: four.
7. Focus: how many types at launch, and how many schools does a player start with? Draft: 3-4 focus types, one starting school.
8. (Resolved in draft) Life and Light unlock through the early chain in "Base elements", which also drives the tutorial.
9. (Resolved in draft) XP and points are merged: XP drives level, level gates casting, and a separate score measures build quality.
10. What should score actually affect (guild admission and rank, event odds, item quality, bragging rights)?
11. Level cap and XP curve: how many levels, and does spell tier map 1:1 to level?
