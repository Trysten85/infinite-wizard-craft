# Recipe Key

Generated from the game data by `npm run key`. Do not edit by hand; it is rewritten whenever the data changes.

Everything here can be made now, starting from Fire, Water, Earth, Air.
Drafted spells and materials are not listed until they are approved (`npm run craft -- status`).

- **Quick reference:** the last combo that makes each thing.
- **Full paths:** every combo in order, from the starting elements. Search this file for a name to find its path.
- Casting any spell needs a focus (the Spellbook), so spell paths include it.

## Quick reference

### Elements (4)

| Name | Made from | Combos |
|---|---|---|
| Light | Fire + Air | 1 |
| Life | Mud + Light | 3 |
| Shadow | Light + Earth | 2 |
| Death | Life + Shadow | 5 |

### Materials (30)

| Name | Made from | Combos |
|---|---|---|
| Metal | Earth + Fire | 1 |
| Mud | Water + Earth | 1 |
| Sand | Earth + Air | 1 |
| Sound | Air + Water | 1 |
| Steam | Fire + Water | 1 |
| Glass | Sand + Fire | 2 |
| Iron | Metal + Earth | 2 |
| Salt | Steam + Earth | 2 |
| Silver | Metal + Light | 3 |
| Animal | Life + Air | 4 |
| Blood | Life + Water | 4 |
| Crystal | Glass + Light | 4 |
| Forge | Fire + Iron | 3 |
| Gold | Silver + Fire | 4 |
| Person | Mud + Life | 4 |
| Spirits | Steam + Life | 5 |
| Sulfur | Fire + Salt | 3 |
| Tree | Earth + Life | 4 |
| Bat | Sound + Animal | 6 |
| Bone dust | Death + Earth | 6 |
| Crown | Gold + Crystal | 8 |
| Feather | Animal + Air | 5 |
| Food | Tree + Water | 5 |
| Herb | Tree + Mud | 5 |
| Mind | Animal + Light | 5 |
| Rotted leaves | Tree + Death | 7 |
| Smoke | Tree + Fire | 5 |
| Wilds | Tree + Animal | 6 |
| Bat guano | Bat + Food | 9 |
| Tea | Herb + Steam | 7 |

### Focus (1)

| Name | Made from | Combos |
|---|---|---|
| Spellbook | Tree + Light | 5 |

### Schools (8)

| Name | Made from | Combos |
|---|---|---|
| Abjuration | Water + Light | 2 |
| Evocation | Fire + Light | 2 |
| Illusion | Air + Light | 2 |
| Conjuration | Air + Shadow | 3 |
| Divination | Light + Shadow | 3 |
| Enchantment | Life + Light | 4 |
| Transmutation | Water + Shadow | 3 |
| Necromancy | Life + Death | 6 |

### Spells (38)

| Name | School | Tier | Made from | Combos |
|---|---|---|---|---|
| Resistance | Abjuration | 0 | Earth + Abjuration | 7 |
| Protection from Evil and Good | Abjuration | 1 | Abjuration + Resistance (needs Silver, Iron) | 11 |
| Arcane Lock | Abjuration | 2 | Abjuration + Protection from Evil and Good (needs Gold) | 13 |
| Counterspell | Abjuration | 3 | Abjuration + Arcane Lock | 14 |
| Acid Splash | Conjuration | 0 | Water + Conjuration | 8 |
| Mage Hand | Conjuration | 0 | Air + Conjuration | 8 |
| Fog Cloud | Conjuration | 1 | any Conjuration cantrip + Conjuration | 9 |
| Misty Step | Conjuration | 2 | Conjuration + Fog Cloud | 10 |
| Stinking Cloud | Conjuration | 3 | Conjuration + Misty Step (needs Rotted leaves) | 13 |
| True Strike | Divination | 0 | Light + Divination | 8 |
| Detect Magic | Divination | 1 | Divination + True Strike | 9 |
| Locate Object | Divination | 2 | Divination + Detect Magic (needs Tree) | 10 |
| Clairvoyance | Divination | 3 | Divination + Locate Object (needs Crystal) | 14 |
| Vicious Mockery | Enchantment | 0 | Air + Enchantment | 7 |
| Sleep | Enchantment | 1 | Enchantment + Vicious Mockery (needs Sand) | 9 |
| Hold Person | Enchantment | 2 | Enchantment + Sleep (needs Iron) | 12 |
| Fire Bolt | Evocation | 0 | Fire + Evocation | 7 |
| Light | Evocation | 0 | Light + Evocation | 7 |
| Ray of Frost | Evocation | 0 | Water + Evocation | 7 |
| Shocking Grasp | Evocation | 0 | Air + Evocation | 7 |
| Burning Hands | Evocation | 1 | any Evocation cantrip + Evocation | 8 |
| Scorching Ray | Evocation | 2 | Evocation + Burning Hands | 9 |
| Fireball | Evocation | 3 | Evocation + Scorching Ray (needs Sulfur, Bat guano) | 18 |
| Minor Illusion | Illusion | 0 | Light + Illusion | 7 |
| Color Spray | Illusion | 1 | Illusion + Minor Illusion (needs Sand) | 9 |
| Mirror Image | Illusion | 2 | Illusion + Color Spray | 10 |
| Fear | Illusion | 3 | Illusion + Mirror Image (needs Feather) | 13 |
| Chill Touch | Necromancy | 0 | Death + Necromancy | 9 |
| Spare the Dying | Necromancy | 0 | Life + Necromancy | 9 |
| False Life | Necromancy | 1 | any Necromancy cantrip + Necromancy (needs Spirits) | 12 |
| Gentle Repose | Necromancy | 2 | Necromancy + False Life (needs Salt) | 14 |
| Animate Dead | Necromancy | 3 | Necromancy + Gentle Repose (needs Blood, Animal, Bone dust) | 18 |
| Mending | Transmutation | 0 | Earth + Transmutation | 8 |
| Message | Transmutation | 0 | Air + Transmutation | 8 |
| Prestidigitation | Transmutation | 0 | Fire + Transmutation | 8 |
| Longstrider | Transmutation | 1 | any Transmutation cantrip + Transmutation (needs Earth) | 9 |
| Enlarge/Reduce | Transmutation | 2 | Transmutation + Longstrider (needs Iron) | 12 |
| Fly | Transmutation | 3 | Transmutation + Enlarge/Reduce (needs Feather) | 15 |

### Jobs (23)

| Name | Type | Made from | Combos |
|---|---|---|---|
| Farmer | mundane | Person + Earth | 5 |
| Hunter | mundane | Person + Animal | 6 |
| Carpenter | mundane | Person + Tree | 6 |
| Blacksmith | mundane | Person + Forge | 8 |
| Herbalist | mundane | Person + Herb | 7 |
| Merchant | mundane | Person + Silver | 7 |
| Scribe | mundane | Person + Feather | 7 |
| Soldier | mundane | Person + Iron | 7 |
| Spy | mundane | Person + Shadow | 6 |
| Tea Shop Owner | mundane | Merchant + Tea | 12 |
| Innkeeper | mundane | Person + Spirits | 7 |
| Wizard | magic | Person + Spellbook | 7 |
| Alchemist | magic | Herbalist + Transmutation | 10 |
| Runesmith | magic | Blacksmith + Spellbook | 11 |
| Enchanter | magic | Wizard + Crystal | 11 |
| Battle Mage | magic | Soldier + Evocation | 9 |
| Court Mage | magic | Wizard + Crown | 15 |
| Hermit Wizard | magic | Wizard + Wilds | 10 |
| Necromancer | magic | Wizard + Necromancy | 11 |
| Healer | magic | Spare the Dying or False Life + Herbalist | 13 |
| Magical Scholar | magic | Scribe + Spellbook | 10 |
| Professor | magic | Magical Scholar + Person | 11 |
| Back-Room Apothecary | magic | Alchemist + Shadow | 11 |

## Full paths

### Elements

#### Light

1. Fire + Air = Light

#### Life

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life

#### Shadow

1. Fire + Air = Light
2. Light + Earth = Shadow

#### Death

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Light + Earth = Shadow
5. Life + Shadow = Death

### Materials

#### Metal

1. Earth + Fire = Metal

#### Mud

1. Water + Earth = Mud

#### Sand

1. Earth + Air = Sand

#### Sound

1. Air + Water = Sound

#### Steam

1. Fire + Water = Steam

#### Glass

1. Earth + Air = Sand
2. Sand + Fire = Glass

#### Iron

1. Earth + Fire = Metal
2. Metal + Earth = Iron

#### Salt

1. Fire + Water = Steam
2. Steam + Earth = Salt

#### Silver

1. Earth + Fire = Metal
2. Fire + Air = Light
3. Metal + Light = Silver

#### Animal

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Life + Air = Animal

#### Blood

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Life + Water = Blood

#### Crystal

1. Earth + Air = Sand
2. Sand + Fire = Glass
3. Fire + Air = Light
4. Glass + Light = Crystal

#### Forge

1. Earth + Fire = Metal
2. Metal + Earth = Iron
3. Fire + Iron = Forge

#### Gold

1. Earth + Fire = Metal
2. Fire + Air = Light
3. Metal + Light = Silver
4. Silver + Fire = Gold

#### Person

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person

#### Spirits

1. Fire + Water = Steam
2. Water + Earth = Mud
3. Fire + Air = Light
4. Mud + Light = Life
5. Steam + Life = Spirits

#### Sulfur

1. Fire + Water = Steam
2. Steam + Earth = Salt
3. Fire + Salt = Sulfur

#### Tree

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree

#### Bat

1. Air + Water = Sound
2. Water + Earth = Mud
3. Fire + Air = Light
4. Mud + Light = Life
5. Life + Air = Animal
6. Sound + Animal = Bat

#### Bone dust

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Light + Earth = Shadow
5. Life + Shadow = Death
6. Death + Earth = Bone dust

#### Crown

1. Earth + Fire = Metal
2. Fire + Air = Light
3. Metal + Light = Silver
4. Silver + Fire = Gold
5. Earth + Air = Sand
6. Sand + Fire = Glass
7. Glass + Light = Crystal
8. Gold + Crystal = Crown

#### Feather

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Life + Air = Animal
5. Animal + Air = Feather

#### Food

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Water = Food

#### Herb

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Mud = Herb

#### Mind

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Life + Air = Animal
5. Animal + Light = Mind

#### Rotted leaves

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Light + Earth = Shadow
6. Life + Shadow = Death
7. Tree + Death = Rotted leaves

#### Smoke

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Fire = Smoke

#### Wilds

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Life + Air = Animal
6. Tree + Animal = Wilds

#### Bat guano

1. Air + Water = Sound
2. Water + Earth = Mud
3. Fire + Air = Light
4. Mud + Light = Life
5. Life + Air = Animal
6. Sound + Animal = Bat
7. Earth + Life = Tree
8. Tree + Water = Food
9. Bat + Food = Bat guano

#### Tea

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Mud = Herb
6. Fire + Water = Steam
7. Herb + Steam = Tea

### Focus

#### Spellbook

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook

### Schools

#### Abjuration

1. Fire + Air = Light
2. Water + Light = Abjuration

#### Evocation

1. Fire + Air = Light
2. Fire + Light = Evocation

#### Illusion

1. Fire + Air = Light
2. Air + Light = Illusion

#### Conjuration

1. Fire + Air = Light
2. Light + Earth = Shadow
3. Air + Shadow = Conjuration

#### Divination

1. Fire + Air = Light
2. Light + Earth = Shadow
3. Light + Shadow = Divination

#### Enchantment

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Life + Light = Enchantment

#### Transmutation

1. Fire + Air = Light
2. Light + Earth = Shadow
3. Water + Shadow = Transmutation

#### Necromancy

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Light + Earth = Shadow
5. Life + Shadow = Death
6. Life + Death = Necromancy

### Spells

#### Resistance (Abjuration, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Water + Light = Abjuration
7. Earth + Abjuration = Resistance

#### Protection from Evil and Good (Abjuration, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Water + Light = Abjuration
7. Earth + Abjuration = Resistance
8. Earth + Fire = Metal
9. Metal + Light = Silver
10. Metal + Earth = Iron
11. Abjuration + Resistance = Protection from Evil and Good  (needs Silver, Iron)

#### Arcane Lock (Abjuration, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Water + Light = Abjuration
7. Earth + Abjuration = Resistance
8. Earth + Fire = Metal
9. Metal + Light = Silver
10. Metal + Earth = Iron
11. Abjuration + Resistance = Protection from Evil and Good  (needs Silver, Iron)
12. Silver + Fire = Gold
13. Abjuration + Protection from Evil and Good = Arcane Lock  (needs Gold)

#### Counterspell (Abjuration, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Water + Light = Abjuration
7. Earth + Abjuration = Resistance
8. Earth + Fire = Metal
9. Metal + Light = Silver
10. Metal + Earth = Iron
11. Abjuration + Resistance = Protection from Evil and Good  (needs Silver, Iron)
12. Silver + Fire = Gold
13. Abjuration + Protection from Evil and Good = Arcane Lock  (needs Gold)
14. Abjuration + Arcane Lock = Counterspell

#### Acid Splash (Conjuration, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Air + Shadow = Conjuration
8. Water + Conjuration = Acid Splash

#### Mage Hand (Conjuration, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Air + Shadow = Conjuration
8. Air + Conjuration = Mage Hand

#### Fog Cloud (Conjuration, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Air + Shadow = Conjuration
8. Air + Conjuration = Mage Hand
9. Conjuration + Mage Hand = Fog Cloud

#### Misty Step (Conjuration, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Air + Shadow = Conjuration
8. Air + Conjuration = Mage Hand
9. Conjuration + Mage Hand = Fog Cloud
10. Conjuration + Fog Cloud = Misty Step

#### Stinking Cloud (Conjuration, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Air + Shadow = Conjuration
8. Air + Conjuration = Mage Hand
9. Conjuration + Mage Hand = Fog Cloud
10. Conjuration + Fog Cloud = Misty Step
11. Life + Shadow = Death
12. Tree + Death = Rotted leaves
13. Conjuration + Misty Step = Stinking Cloud  (needs Rotted leaves)

#### True Strike (Divination, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Light + Shadow = Divination
8. Light + Divination = True Strike

#### Detect Magic (Divination, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Light + Shadow = Divination
8. Light + Divination = True Strike
9. Divination + True Strike = Detect Magic

#### Locate Object (Divination, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Light + Shadow = Divination
8. Light + Divination = True Strike
9. Divination + True Strike = Detect Magic
10. Divination + Detect Magic = Locate Object  (needs Tree)

#### Clairvoyance (Divination, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Light + Shadow = Divination
8. Light + Divination = True Strike
9. Divination + True Strike = Detect Magic
10. Divination + Detect Magic = Locate Object  (needs Tree)
11. Earth + Air = Sand
12. Sand + Fire = Glass
13. Glass + Light = Crystal
14. Divination + Locate Object = Clairvoyance  (needs Crystal)

#### Vicious Mockery (Enchantment, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Life + Light = Enchantment
7. Air + Enchantment = Vicious Mockery

#### Sleep (Enchantment, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Life + Light = Enchantment
7. Air + Enchantment = Vicious Mockery
8. Earth + Air = Sand
9. Enchantment + Vicious Mockery = Sleep  (needs Sand)

#### Hold Person (Enchantment, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Life + Light = Enchantment
7. Air + Enchantment = Vicious Mockery
8. Earth + Air = Sand
9. Enchantment + Vicious Mockery = Sleep  (needs Sand)
10. Earth + Fire = Metal
11. Metal + Earth = Iron
12. Enchantment + Sleep = Hold Person  (needs Iron)

#### Fire Bolt (Evocation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Fire + Evocation = Fire Bolt

#### Light (Evocation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Light + Evocation = Light

#### Ray of Frost (Evocation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Water + Evocation = Ray of Frost

#### Shocking Grasp (Evocation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Air + Evocation = Shocking Grasp

#### Burning Hands (Evocation, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Fire + Evocation = Fire Bolt
8. Evocation + Fire Bolt = Burning Hands

#### Scorching Ray (Evocation, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Fire + Evocation = Fire Bolt
8. Evocation + Fire Bolt = Burning Hands
9. Evocation + Burning Hands = Scorching Ray

#### Fireball (Evocation, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Fire + Light = Evocation
7. Fire + Evocation = Fire Bolt
8. Evocation + Fire Bolt = Burning Hands
9. Evocation + Burning Hands = Scorching Ray
10. Fire + Water = Steam
11. Steam + Earth = Salt
12. Fire + Salt = Sulfur
13. Air + Water = Sound
14. Life + Air = Animal
15. Sound + Animal = Bat
16. Tree + Water = Food
17. Bat + Food = Bat guano
18. Evocation + Scorching Ray = Fireball  (needs Sulfur, Bat guano)

#### Minor Illusion (Illusion, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Air + Light = Illusion
7. Light + Illusion = Minor Illusion

#### Color Spray (Illusion, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Air + Light = Illusion
7. Light + Illusion = Minor Illusion
8. Earth + Air = Sand
9. Illusion + Minor Illusion = Color Spray  (needs Sand)

#### Mirror Image (Illusion, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Air + Light = Illusion
7. Light + Illusion = Minor Illusion
8. Earth + Air = Sand
9. Illusion + Minor Illusion = Color Spray  (needs Sand)
10. Illusion + Color Spray = Mirror Image

#### Fear (Illusion, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Air + Light = Illusion
7. Light + Illusion = Minor Illusion
8. Earth + Air = Sand
9. Illusion + Minor Illusion = Color Spray  (needs Sand)
10. Illusion + Color Spray = Mirror Image
11. Life + Air = Animal
12. Animal + Air = Feather
13. Illusion + Mirror Image = Fear  (needs Feather)

#### Chill Touch (Necromancy, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Life + Shadow = Death
8. Life + Death = Necromancy
9. Death + Necromancy = Chill Touch

#### Spare the Dying (Necromancy, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Life + Shadow = Death
8. Life + Death = Necromancy
9. Life + Necromancy = Spare the Dying

#### False Life (Necromancy, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Life + Shadow = Death
8. Life + Death = Necromancy
9. Death + Necromancy = Chill Touch
10. Fire + Water = Steam
11. Steam + Life = Spirits
12. Necromancy + Chill Touch = False Life  (needs Spirits)

#### Gentle Repose (Necromancy, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Life + Shadow = Death
8. Life + Death = Necromancy
9. Death + Necromancy = Chill Touch
10. Fire + Water = Steam
11. Steam + Life = Spirits
12. Necromancy + Chill Touch = False Life  (needs Spirits)
13. Steam + Earth = Salt
14. Necromancy + False Life = Gentle Repose  (needs Salt)

#### Animate Dead (Necromancy, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Life + Shadow = Death
8. Life + Death = Necromancy
9. Death + Necromancy = Chill Touch
10. Fire + Water = Steam
11. Steam + Life = Spirits
12. Necromancy + Chill Touch = False Life  (needs Spirits)
13. Steam + Earth = Salt
14. Necromancy + False Life = Gentle Repose  (needs Salt)
15. Life + Water = Blood
16. Life + Air = Animal
17. Death + Earth = Bone dust
18. Necromancy + Gentle Repose = Animate Dead  (needs Blood, Animal, Bone dust)

#### Mending (Transmutation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Water + Shadow = Transmutation
8. Earth + Transmutation = Mending

#### Message (Transmutation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Water + Shadow = Transmutation
8. Air + Transmutation = Message

#### Prestidigitation (Transmutation, cantrip)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Water + Shadow = Transmutation
8. Fire + Transmutation = Prestidigitation

#### Longstrider (Transmutation, tier 1)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Water + Shadow = Transmutation
8. Earth + Transmutation = Mending
9. Transmutation + Mending = Longstrider  (needs Earth)

#### Enlarge/Reduce (Transmutation, tier 2)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Water + Shadow = Transmutation
8. Earth + Transmutation = Mending
9. Transmutation + Mending = Longstrider  (needs Earth)
10. Earth + Fire = Metal
11. Metal + Earth = Iron
12. Transmutation + Longstrider = Enlarge/Reduce  (needs Iron)

#### Fly (Transmutation, tier 3)

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Earth + Life = Tree
5. Tree + Light = Spellbook
6. Light + Earth = Shadow
7. Water + Shadow = Transmutation
8. Earth + Transmutation = Mending
9. Transmutation + Mending = Longstrider  (needs Earth)
10. Earth + Fire = Metal
11. Metal + Earth = Iron
12. Transmutation + Longstrider = Enlarge/Reduce  (needs Iron)
13. Life + Air = Animal
14. Animal + Air = Feather
15. Transmutation + Enlarge/Reduce = Fly  (needs Feather)

### Jobs

#### Farmer

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Person + Earth = Farmer

#### Hunter

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Life + Air = Animal
6. Person + Animal = Hunter

#### Carpenter

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Person + Tree = Carpenter

#### Blacksmith

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Fire = Metal
6. Metal + Earth = Iron
7. Fire + Iron = Forge
8. Person + Forge = Blacksmith

#### Herbalist

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Mud = Herb
7. Person + Herb = Herbalist

#### Merchant

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Fire = Metal
6. Metal + Light = Silver
7. Person + Silver = Merchant

#### Scribe

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Life + Air = Animal
6. Animal + Air = Feather
7. Person + Feather = Scribe

#### Soldier

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Fire = Metal
6. Metal + Earth = Iron
7. Person + Iron = Soldier

#### Spy

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Light + Earth = Shadow
6. Person + Shadow = Spy

#### Tea Shop Owner

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Fire = Metal
6. Metal + Light = Silver
7. Person + Silver = Merchant
8. Earth + Life = Tree
9. Tree + Mud = Herb
10. Fire + Water = Steam
11. Herb + Steam = Tea
12. Merchant + Tea = Tea Shop Owner

#### Innkeeper

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Fire + Water = Steam
6. Steam + Life = Spirits
7. Person + Spirits = Innkeeper

#### Wizard

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Light = Spellbook
7. Person + Spellbook = Wizard

#### Alchemist

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Mud = Herb
7. Person + Herb = Herbalist
8. Light + Earth = Shadow
9. Water + Shadow = Transmutation
10. Herbalist + Transmutation = Alchemist

#### Runesmith

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Fire = Metal
6. Metal + Earth = Iron
7. Fire + Iron = Forge
8. Person + Forge = Blacksmith
9. Earth + Life = Tree
10. Tree + Light = Spellbook
11. Blacksmith + Spellbook = Runesmith

#### Enchanter

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Light = Spellbook
7. Person + Spellbook = Wizard
8. Earth + Air = Sand
9. Sand + Fire = Glass
10. Glass + Light = Crystal
11. Wizard + Crystal = Enchanter

#### Battle Mage

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Fire = Metal
6. Metal + Earth = Iron
7. Person + Iron = Soldier
8. Fire + Light = Evocation
9. Soldier + Evocation = Battle Mage

#### Court Mage

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Light = Spellbook
7. Person + Spellbook = Wizard
8. Earth + Fire = Metal
9. Metal + Light = Silver
10. Silver + Fire = Gold
11. Earth + Air = Sand
12. Sand + Fire = Glass
13. Glass + Light = Crystal
14. Gold + Crystal = Crown
15. Wizard + Crown = Court Mage

#### Hermit Wizard

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Light = Spellbook
7. Person + Spellbook = Wizard
8. Life + Air = Animal
9. Tree + Animal = Wilds
10. Wizard + Wilds = Hermit Wizard

#### Necromancer

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Light = Spellbook
7. Person + Spellbook = Wizard
8. Light + Earth = Shadow
9. Life + Shadow = Death
10. Life + Death = Necromancy
11. Wizard + Necromancy = Necromancer

#### Healer

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Mud = Herb
7. Person + Herb = Herbalist
8. Tree + Light = Spellbook
9. Light + Earth = Shadow
10. Life + Shadow = Death
11. Life + Death = Necromancy
12. Life + Necromancy = Spare the Dying
13. Herbalist + Spare the Dying = Healer

#### Magical Scholar

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Life + Air = Animal
6. Animal + Air = Feather
7. Person + Feather = Scribe
8. Earth + Life = Tree
9. Tree + Light = Spellbook
10. Scribe + Spellbook = Magical Scholar

#### Professor

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Life + Air = Animal
6. Animal + Air = Feather
7. Person + Feather = Scribe
8. Earth + Life = Tree
9. Tree + Light = Spellbook
10. Scribe + Spellbook = Magical Scholar
11. Magical Scholar + Person = Professor

#### Back-Room Apothecary

1. Water + Earth = Mud
2. Fire + Air = Light
3. Mud + Light = Life
4. Mud + Life = Person
5. Earth + Life = Tree
6. Tree + Mud = Herb
7. Person + Herb = Herbalist
8. Light + Earth = Shadow
9. Water + Shadow = Transmutation
10. Herbalist + Transmutation = Alchemist
11. Alchemist + Shadow = Back-Room Apothecary
