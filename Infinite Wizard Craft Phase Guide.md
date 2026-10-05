# Infinite Wizard Craft: Data Checklist (Phase Guide)

How to use: finish the data for a phase, hand it to Claude Code, build that phase, then move on.

Rules for all data:
- Every entry uses the shared fields: tags, element/school affinity, tier, source, XP.
- Original examples should be in your schema and your voice; the model echoes examples.
- SRD content needs the official CC-BY attribution text. Keep non-SRD spells out.

---

## Phase 0: Foundation
- [ ] Voice and worldview guide (tone, what magic feels like, what the world cares about)
  - [ ] Feed own DM notes to the AI with instructions to extract style only (tone, sentence rhythm, how power and danger are described, naming patterns, what never appears), with NO places, NPCs, factions, items, or plot hooks
  - [ ] Review the guide by hand and delete anything content-specific
  - [ ] Search the finished guide for leaked proper nouns from the notes
  - [ ] Separately, extract all proper nouns from the notes into a private blocklist (never shown to the generator)
  - [ ] Strip real names of players and friends from anything used
- [ ] "Never appears" list (real-world references, crude content, off-tone elements)
- [ ] Naming conventions (spells, places, guilds, items)
- [ ] Tag vocabulary
- [ ] Entry schema (the shared fields)
- [ ] 3 "bad examples" for the critic pass
- [ ] SRD attribution text saved from the official release

## Phase 1: Element alchemy + spellbook builder
- [ ] The 8 base elements (Fire, Water, Earth, Air, Life, Death, Light, Shadow): what each does and how it feels
- [ ] Which elements are available at the start and how the rest unlock (draft chain: Fire + Air = Light, Water + Earth = Mud, Mud + Light = Life, Light + Earth = Shadow, Life + Shadow = Death)
- [ ] Spell focus: crafting recipes for 3-4 focus types (e.g. Earth + Life = Tree, Tree + Light = Spellbook), which school each can channel, legal vs. unregistered version
- [ ] Class discovery: tag requirements for each magic job, plus a hint line for each locked class
- [ ] Tutorial quest chain (5-6 steps): objective, what it teaches, and a small reward for each
- [ ] The 8 schools with their effects (abjuration, conjuration, divination, enchantment, evocation, illusion, necromancy, transmutation)
- [ ] Hand-written combo table: 12-15 element pairs, 10-12 element + school seeds, about 15 material combos
- [ ] Cantrip list (tier 0: element + school, no components)
- [ ] First material chain written out (e.g. Sound + Animal = Bat, Bat + Food = Bat guano) with depth values
- [ ] Spell tier to minimum material depth table
- [ ] Verbs per element (burn, mend, mold, drain...)
- [ ] Spell structure (name, effect, range, cost, limit, tier and required level)
- [ ] SRD spell import: name, level, school, components, with tags
- [ ] 3 original example spells
- [ ] Guiding questions list

Build: element combiner, combo cache, spellbook, spell generator, schema validation.

## Phase 2: XP, levels, score, and materials
- [ ] Level ladder and what each level can cast
- [ ] Power benchmarks (what a low-level vs. high-level caster can do)
- [ ] XP table: what each first-time discovery pays (element, material, spell, focus, job, guild), by tier
- [ ] Level curve (XP needed per level) and the spell-tier-to-level rule (tier N needs level N to cast)
- [ ] Score rules: the wanted tags for each job, how castable spells, gear, and focus are compared, main job full and secondary half, and what score affects
- [ ] Gold rules and quest reward table (gold and XP) by quest tier
- [ ] Quest templates for repeatable quests (objective types, tier scaling)
- [ ] Material categories: metals, gems, woods, herbs, stone, soil, water, bones, hides, and so on
- [ ] Magic foraging: where and how rare materials are found
- [ ] Material tags and tier rules
- [ ] SRD component lines turned into material entries (sulfur, bat guano, and so on)
- [ ] 3 original examples each: rare metal, rare herb, rare organic material

Build: XP and level calculator, score calculator, greyed-out locked spells, material database, foraging system, tests for every rule.

## Phase 3: Crafting and jobs
- [ ] Magic job rules: enchanter, potion brewer, magic advisor / court mage, wizard (need magic tags)
- [ ] Non-magic job rules: blacksmith, carpenter, farmer, merchant, hunter, herbalist (no magic needed)
- [ ] Main job counts fully toward score, secondary half; rules for pairing a magic job with a non-magic one (e.g. blacksmith + enchanter)
- [ ] Job goal nodes as tag requirements
- [ ] Crafting rules: magic + materials = item
- [ ] 3 original potions, 3 enchantments, 3 crafted gear pieces
- [ ] Item tiers and quality rules

Build: crafting system, job nodes, item generator.

## Phase 4: People and civilization
- [ ] Guild tiers, benefits, obligations; 3 original licensed guilds and 3 original underground guilds
- [ ] Law levels (Open, Licensed, Restricted, Banned) and the law table: allowed schools, licensed jobs, contraband materials, penalties
- [ ] Home law level: how it's set at the start and how it changes (no hand-designed cities)
- [ ] Find a New Home rules: what's lost (job, guild, standing) and what's gained (new law level)
- [ ] License entries: requirements and what each costs to keep
- [ ] Court mage rules (strictest licensing and scrutiny)
- [ ] Meter rules: license standing, church standing, heat
- [ ] Law-change events: triggers, how often, what gets revoked or grandfathered, player response options
- [ ] Towns and factions: 3 original each
- [ ] Animals and familiars: bond rules and costs; 3 original examples
- [ ] NPC archetypes (mentor, rival, merchant, villain)
- [ ] Society basics (economy, how guilds work, what makes people join or leave)
- [ ] Arcane heritage / signature mark rules and temperament tags; 3 originals

Build: guild and bond systems, town entries, signature mark generator.

## Phase 5: Events, lore, stories
- [ ] World layer: regions, notable places, short timeline, major powers
- [ ] Event templates by level range (what kinds of events happen when)
- [ ] Stakes and rewards table by level (code-owned)
- [ ] Story format: how build tags feed the narrative
- [ ] 3 sample events at different levels

Build: event generator, lore retrieval, story generator, critic pass v2, event log.

---

## Later (not in scope for v1)
- Build-your-own-tower system (cost, materials, upgrades, risks)
- Designed cities or a world map

## Always running
- [ ] Review the log of AI-invented items
- [ ] Add good outputs to the example set; add bad ones to the critic's bad examples
