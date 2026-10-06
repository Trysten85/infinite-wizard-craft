# Infinite Wizard Craft: Tag Vocabulary v0.1 (30 tags)

Tags are the shared language between spells, materials, items, jobs, and society. They describe what a thing does, what it's made of, or how the world treats it. Elements and schools are their own fields, not tags, and tier handles power level. All of this is a draft to review and adjust.

## The 30 tags

### Effect: what it does (8)
| Tag | Meaning |
|---|---|
| damage | Harms health, creatures, or structures. |
| healing | Restores health or cures ailments. Also marks potions and herbs that do it. |
| protection | Shields, wards, or resists harm, including countering other magic. |
| control | Restrains, slows, pushes, pulls, or otherwise limits what a target can do. |
| enhance | Temporarily improves a target's abilities or an item's quality. |
| utility | Practical non-combat effects: light, locks, carrying, repair, cleaning. |
| knowledge | Reveals information: scrying, detection, foresight, identification. |
| mind | Affects thoughts, emotions, or senses: charm, compulsion, illusion, fear. |

### Form: how it works (5)
| Tag | Meaning |
|---|---|
| energy | Raw elemental force: flame, lightning, frost, force. The core of evocation. |
| summon | Brings creatures, objects, or constructs into being, or moves things across distance. |
| transform | Changes the form, properties, or matter of something. |
| area | Affects an area instead of a single target. |
| explosive | Releases force suddenly and violently. Applies to spells and to volatile materials. |

### Materials: what it's made of (8)
| Tag | Meaning |
|---|---|
| metal | Ores, ingots, and alloys. The core of forging and enchanting. |
| mineral | Stone, gems, salts, soil, and other non-metal earth materials. |
| plant | Anything grown: herbs, roots, fungi, wood, fruit. |
| animal | Beast parts, hides, bone, byproducts like guano, and living creatures such as familiars. |
| liquid | Water, oils, acids, tinctures, blood. The base of most potions. |
| reagent | Usable as a spell or crafting component. Marks materials that go into spells. |
| toxic | Poisonous, corrosive, or dangerous to handle. Often contraband. |
| rare | Hard to find. Comes from foraging or trade, and raises value and unlock depth. |

### Craft: what a job does (3)
| Tag | Meaning |
|---|---|
| forging | Shaping metal and stone into tools, weapons, armor, and machine parts. |
| brewing | Mixing materials into potions, tonics, and poisons. |
| enchanting | Binding magic into objects: wands, enchanted gear, spell foci. |

### Society and law: how the world treats it (6)
| Tag | Meaning |
|---|---|
| licensed | Registered or approved by the church or a guild. Applies to foci, jobs, spells, and people. |
| contraband | Illegal to carry, trade, or practice at stricter law levels. Carrying it adds heat. |
| faith | Tied to the church, its rites, and its approved magic. |
| underground | Tied to the hidden economy, secret guilds, and black markets. |
| court | Tied to nobility, politics, and government. Raises scrutiny. |
| industrial | Tied to factories, steam, coal, machines, and the changing city. |

**Reserved for later:** `licensed`, `contraband`, and `underground` belong to the deferred law system. They stay in the list so adding law later doesn't change the schema, but v1 entries don't use them.

## Examples of tagged entries (draft)
| Entry | Element | School | Tags |
|---|---|---|---|
| Fire Bolt (cantrip) | Fire | Evocation | damage, energy |
| Fireball | Fire | Evocation | damage, energy, area, explosive |
| Mending | Earth | Transmutation | utility |
| Charm Person | Life | Enchantment | mind, control |
| Sulfur | Fire | none | mineral, reagent, explosive |
| Bat guano | Life | none | animal, reagent |
| Iron ingot | Earth | none | metal |
| Healing potion | Life | none | healing, liquid, plant |
| Spellbook focus | Light | none | plant |

Elements and schools sit in their own fields, so Fireball is Fire + Evocation with the four tags above. Elements shown here are placeholders. A spell can have more than one element (a fire-and-life purifying flame, say).

## Wanted tags per job (draft, used for score)
| Job | Wanted tags |
|---|---|
| Combat mage | damage, energy, control, area, protection |
| Potion brewer | brewing, healing, plant, liquid, reagent |
| Enchanter | enchanting, enhance, metal, mineral, reagent |
| Court mage | court, knowledge, mind, protection |
| Blacksmith | forging, metal, mineral, industrial |
| Hunter | damage, animal, plant, utility |

## How tags are used
- **Score:** each job lists its wanted tags, and the code compares the tags on your castable spells, gear, and focus against them.
- **Class discovery:** a job unlocks when a build has its required tags (for example, an enchanter needs enchanting, a reagent, and a magic source).
- **Law (later):** when the law system is added, the school decides whether a spell is legal, and `licensed` and `contraband` cover materials, items, and foci.
- **Combos:** when the AI judges a borderline combo, it receives both inputs' tags and must return a result tagged from this list.
- **Spell routes:** a spell's unlock routes come from its tags plus its element and school.
- **Events:** the AI receives a summary of your tags to write scenes that fit your build.

## Rules
1. **Closed list.** The schema only accepts these 30 tags. The AI can't invent one; if it needs one, it flags the entry for a human to decide.
2. **1 to 5 tags per entry** (placeholder cap).
3. **Elements and schools are separate fields,** so there's no `fire` or `evocation` tag. Code matches on element, school, and tags together, so a search for fire spells still finds Fireball.
4. **Tags describe the thing, not its power.** Tier handles power.
5. **Changing or removing a tag** means checking every job's wanted tags and the law table.
6. Lowercase, single words.

## Open questions
1. Do we need `ranged` or `touch`, or does the spell's range field cover it? (Draft: the range field covers it.)
2. Are `faith`, `court`, and `underground` enough for factions, or do guilds need their own tag list?
3. Disease and curses have no tag yet; `toxic` only covers poison and corrosion.
4. Left out to stay at 30: `military`, `undead`, `lasting`, `travel`. Add them if testing shows a gap.
5. Can a job's wanted list include an element or school (a fire mage wants Fire and Evocation) alongside tags? Draft: yes.
