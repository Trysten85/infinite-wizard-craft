Infinite Wizard Craft: School Patterns v0.1 (v1 caps at tier 5; ladders so far cover tiers 0-3)

We worked backwards: pick a signature spell for each tier of each school, list the materials those spells need, then build a recipe tree for those materials from the 8 elements. Every recipe here is a placeholder. SRD spell names and components come from my memory of SRD 5.1, so Claude Code must verify each against the official text before using it. Gold-piece costs on SRD components are ignored in v1.

The pattern (same for every school)
Tier 0 (cantrip): Element + School, channeled through the focus, no components. Each school has 2-3 natural elements.
Tiers 1-3: one signature spell per tier. A spell is acquired by satisfying any 2 routes (spell ladder, components, teacher, scroll, experimentation, heritage) and cast at level = tier.
Components: each spell lists the materials it needs, if any. Holding all of them counts as the components route. Many spells have none, so they rely on the other routes.
The ladders are seeds. The AI fills the rest of each school in the same pattern, using the same rules.
How schools are created (DRAFT)

A school is an item you discover in the tree, then combine with elements and materials to make spells. Each school has one hand-written recipe made of two elements. These are core progression combos, so they're authored, not AI-judged. Each pair below is unused by every other recipe in the tree.

School	Recipe	Depth	Logic
Evocation	Fire + Light	2	Raw radiant force
Abjuration	Water + Light	2	Cleansing light, wards
Illusion	Air + Light	2	Mirage and shimmer
Divination	Light + Shadow	3	Bringing the hidden to light
Conjuration	Air + Shadow	3	Calling something out of the unseen
Enchantment	Life + Light	3	Warmth that moves living minds
Transmutation	Water + Shadow	3	Formless and shifting
Necromancy	Life + Death	4	The line between living and dead
From school to spell
Discover the school with its recipe above.
School + Element = cantrip, cast through your focus (Death + Necromancy = Chill Touch, Light + Divination = True Strike).
Tiers 1-3 come from the ladders below: routes plus components.

Example, Divination in 4 combos: Fire + Air = Light, Light + Earth = Shadow, Light + Shadow = Divination, Light + Divination = True Strike. Example, Necromancy in 7 combos: Light, Mud, Life, Shadow, Death, then Life + Death = Necromancy, then Death + Necromancy = Chill Touch.

Notes
Evocation, Abjuration, and Illusion are one combo past Light, so the tutorial can hand out a first school quickly. Necromancy is the deepest school.
Light appears in five recipes and Shadow in three, which matches the Light and Shadow split in the setting. Necromancy uses neither: it sits between Life and Death.
The elements in a school's recipe are not the same as its natural cantrip elements below. The recipe says how you discover the school, and the natural elements say which cantrips it makes.
Schools are their own item type, not tags.
Pending your OK: this replaces "the focus decides your starting school" in the design map. Nothing there has been changed yet.
The eight ladders
Abjuration (protect, ward, counter). Natural elements: Earth, Light

Cantrip seeds: Earth + Abjuration = Resistance. Light + Abjuration = original ward cantrip.

Tier	Spell	Needs
1	Protection from Evil and Good	Silver, Iron
2	Arcane Lock	Gold
3	Counterspell	none
Conjuration (summon, create, move). Natural elements: Air, Water, Shadow

Cantrip seeds: Air + Conjuration = Mage Hand. Water + Conjuration = Acid Splash. Shadow + Conjuration = original.

Tier	Spell	Needs
1	Fog Cloud	none
2	Cloud of Daggers	Glass
3	Stinking Cloud	Rotted leaves
Divination (reveal, sense, foresee). Natural elements: Light, Shadow

Cantrip seeds: Light + Divination = True Strike. Shadow + Divination = original.

Tier	Spell	Needs
1	Detect Magic	none
2	Locate Object	Tree (a twig)
3	Clairvoyance	Crystal
Enchantment (influence minds and emotions). Natural elements: Air, Life

Cantrip seeds: Air + Enchantment = Vicious Mockery. Life + Enchantment = original.

Tier	Spell	Needs
1	Sleep	Sand
2	Hold Person	Iron
3	No SRD spell that I know of	AI-generated original, or leave empty in v1
Evocation (raw energy, destructive or healing). Natural elements: Fire, Water, Air, Light (Life for healing)

Cantrip seeds: Fire + Evocation = Fire Bolt. Water + Evocation = Ray of Frost. Air + Evocation = Shocking Grasp. Light + Evocation = Light.

Tier	Spell	Needs
1	Burning Hands	none
2	Scorching Ray	none
3	Fireball	Sulfur, Bat guano
Illusion (deceive senses and minds). Natural elements: Light, Shadow

Cantrip seeds: Light + Illusion = Minor Illusion. Shadow + Illusion = original.

Tier	Spell	Needs
1	Color Spray	Sand
2	Mirror Image	none
3	Fear	Feather
Necromancy (life and death energies). Natural elements: Death, Shadow, Life

Cantrip seeds: Death + Necromancy = Chill Touch. Life + Necromancy = Spare the Dying. Shadow + Necromancy = original.

Tier	Spell	Needs
1	False Life	Spirits
2	Gentle Repose	Salt
3	Animate Dead	Blood, Animal (the flesh), Bone dust
Transmutation (change form and matter). Natural elements: Earth, Air, Fire, Water

Cantrip seeds: Earth + Transmutation = Mending. Air + Transmutation = Message. Fire + Transmutation = Prestidigitation.

Tier	Spell	Needs
1	Longstrider	Earth (a pinch of dirt)
2	Enlarge/Reduce	Iron
3	Fly	Feather

Cantrip seeds total: 21 (15 SRD cantrips and 6 originals).

Materials to create (working backwards)

Depth = longest chain of combos from the four starting elements. The core chain from the design map (Light, Mud, Life, Shadow, Death, Tree) is assumed.

Material	Recipe	Depth	Tags	Used by
Sand	Earth + Air	1	mineral, reagent	Sleep, Color Spray
Sound	Air + Water	1	energy	Bat
Metal	Earth + Fire	1	metal	Iron, Silver
Steam	Fire + Water	1	energy, industrial	Salt, Spirits
Salt	Steam + Earth	2	mineral, reagent	Gentle Repose, Sulfur
Glass	Sand + Fire	2	mineral, reagent	Cloud of Daggers, Crystal
Iron	Metal + Earth	2	metal, reagent	Protection from Evil and Good, Hold Person, Enlarge/Reduce
Silver	Metal + Light	2	metal, reagent	Protection from Evil and Good, Gold
Animal	Life + Air	3	animal	Bat, Feather, Animate Dead
Tree	Earth + Life	3	plant	Food, Rotted leaves, Locate Object
Blood	Life + Water	3	liquid, animal, reagent	Animate Dead
Spirits	Steam + Life	3	liquid, reagent	False Life
Sulfur	Fire + Salt	3	mineral, reagent, explosive	Fireball
Crystal	Glass + Light	3	mineral, reagent	Clairvoyance
Gold	Silver + Fire	3	metal, reagent, rare	Arcane Lock
Bat	Sound + Animal	4	animal	Bat guano
Food	Tree + Water	4	plant	Bat guano
Feather	Animal + Air	4	animal, reagent	Fear, Fly
Rotted leaves	Tree + Death	4	plant, toxic, reagent	Stinking Cloud
Bone dust	Death + Earth	4	animal, reagent	Animate Dead
Bat guano	Bat + Food	5	animal, reagent	Fireball
