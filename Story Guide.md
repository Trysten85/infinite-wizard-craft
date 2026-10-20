# Infinite Wizard Craft: Story and Cast v0.1 (DRAFT)

The people of Crumb Lane, and the story they share. This guide is the content for ticket N3b. The
rules it sits on are in `Town Guide.md` under "Townsfolk as neighbours". Tone follows
`prompts/voice.md`. Every Fondness gate and every reward below is a draft for Rules to set in
`config/balance.json` and the cast data; none of them is decided here.

Settled by Trysten, 2026-10-18:

- **One fixed character per trade.** The Blacksmith is Dunstan Coals in every game.
- **Each person's arc stands alone, and a gentle thread runs through them:** Crumb Lane is not
  on the map. No destiny, no prophecy, and nothing is lost if the thread is never finished.

## What the code owns and what the AI owns

| Code owns | Story lane writes (data) | The model writes |
|---|---|---|
| Fondness gates, objectives, rewards, the XP share | Each person's name, pronoun, personality, traits, and fixed facts | The lines of a beat, in the person's voice |
| When someone arrives, who is housed, who meets whom | Lesson and beat titles, details, and premises | The exchange between two townsfolk at the Tavern |
| Which outcome a Tavern scene has | A plain line for every beat and scene, used when the model fails | Nothing that changes a fact, a number, or an outcome |
| Whether a beat is done | Calling lines | |

A beat always plays, even with the model down: it falls back to its plain line.

## The town thread: Crumb Lane is not on the map

The player arrives on a street of empty plots. Once the Wizard's Tower stands, Ignatius Puddlewick
unrolls the county map from the Office of Reasonable Enchantments. Where Crumb Lane ought to be
there is only a pale ring: somebody at the Office once set a teacup down on it. Officially, the
player lives nowhere.

Getting the lane recognised takes Form Nine-B, the Application to Be Somewhere. The form asks for six
things, and each townsperson can supply one:

| The form asks for | Who supplies it | Their beat |
|---|---|---|
| The signature of a practising wizard | Ignatius (the Wizard) | "The Lapsed Licence" |
| A boundary older than the form | Hester (the Farmer) | "Older Than the Map" |
| The form, filled in correctly and sealed | Ferris (the Merchant) | "Form Nine" |
| A public house, licensed to pour | Marigold (the Innkeeper) | "A Licence to Pour" |
| A street sign | Dunstan (the Blacksmith) | "A Sign for the Lane" |
| One registered remedy | Quince (the Herbalist) | "A Registered Remedy" |

Once all six are done, Ignatius's last beat, "On the Map", sends the form. A surveyor comes from
the Office as a visitor, walks the lane with a measuring chain, and the lane goes on the map. The
surveyor then stays (see "Villagers").

- **The thread never gates the game.** It opens no building, tier, job, or spell that cannot be
  reached without it. Its pieces are ordinary beats in each person's arc, with their own rewards.
- **The finale's reward is a proposal for Design:** a sign on the street (drawn by the page), a
  line in that night's ledger, and the first civic building when civic buildings come (the
  notice board, perhaps).

## The street

- **Crumb Lane.** One street, already named in play: the farmer's orders mention "the inn on
  Crumb Lane". This settles open question 5 in `Town Guide.md`.
- **The Second Kettle** is the inn (the Tavern). It is named after the first kettle, which
  Marigold does not talk about.
- **Thimble Row** is the next street over, already named in the order text. It is on the map,
  and is a little smug about it.
- **The Office of Reasonable Enchantments** is in the county town, far enough away that nobody
  from it has ever visited. It is fussy, slow, and quietly well-meaning.

## The cast

Each person below has the fields "The cast is hand-written" in `Town Guide.md` asks for, plus two
the event writer already reads: **traits** (one to three words) and **facts** (fixed once
written). A townsperson can be the evening visitor (A2), and today they arrive with neither, so
the model invents them fresh every visit. These close that gap.

None of the names are in the 30-name pool. `people` is unique by player and name, so a cast name
also in the pool could be taken first by someone else.

The arrival conditions are drafts for N1. "Discovery" means the person comes as soon as the job is
discovered, as now.

### Ignatius Puddlewick, the Wizard (he)

- **Home:** the Wizard's Tower. **Arrives:** on discovery.
- **Personality:** a retired certifier of kettles who has never once been in a hurry.
- **Traits:** kindly, wandering, proud of paperwork.
- **Facts:** He spent forty years at the Office of Reasonable Enchantments, certifying kettles. A
  wren nests in his hat and he will not disturb it. He has been writing *A Sensible History of
  Kettles* for years and is on chapter two.
- **Voice:** long sentences that wander off and come back carrying one exact, useful point.
- **Sample:** "The map is perfectly good. It is only that, according to it, you and I are
  standing in a saucer."
- **Lesson:** none. The Wizard is taught from the first day (`Town Guide.md`, "Learning a trade").
  He says so: "You already know how. I only have the hat."

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| A Blank Where We Live | 2 | | `built: wizards-tower` | commission (lost cats, cold soup) | Settled in his tower, he unrolls the county map and finds the teacup ring where the lane should be. Starts the thread. |
| The Lapsed Licence | 4 | | `learned-schools: 2` | tier unlock (the Tower's tier 2) | The form wants a practising wizard. His licence lapsed somewhere around chapter two, and the renewal asks him to show he keeps up with more than one school. He would like to watch the player do it. |
| Chapter Three | 6 | | `enchantments: 3` | perk | He finally starts chapter three. It is about the player, and he reads them the first line. |
| On the Map | 8 | all six thread beats | none beyond the waits | the thread's finale (above) | The form goes off. The surveyor comes, measures, and has a slice of pie. Crumb Lane is somewhere. |

### Hester Furrow, the Farmer (she)

- **Home:** the Farm. **Arrives:** on discovery.
- **Personality:** grows enormous vegetables and is embarrassed whenever anyone mentions it.
- **Traits:** blunt, patient, weather-wise.
- **Facts:** Her goose, the Magistrate, chases anyone carrying a clipboard. The hawthorn hedge at
  the end of the lane was planted by her great-grandmother. She forecasts rain by her left knee
  and is never wrong.
- **Voice:** short sentences, a weather report in every conversation, and every compliment passed
  on to the soil.
- **Sample:** "Rain by teatime. Don't look at the marrow, it gets ideas."
- **Lesson, "Hands in the Dirt":** grow a Tree (`has-entry: tree, made`), then make Food
  (`has-entry: food, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| The Marrow Question | 2 | | `tag-count: plant, 6` | commission (enormous vegetables) | The fair is coming and her marrow is only large. She wants to know what else grows on purpose. |
| The Magistrate | 4 | | `has-entry: spell-mage-hand` | tier unlock (the Farm's tier 2) | The goose has taken Ignatius's hat, wren and all, to the middle of the pond. Something has to fetch it that the goose cannot reach. |
| Older Than the Map | 6 | Ignatius, A Blank Where We Live | `has-entry: rotted-leaves, made` | thread piece | The form wants a boundary older than the form. The hedge qualifies, but it must look like a hedge on the day, so it wants a good mulching first. |
| Prize Day | 8 | | `depth: 8, made` | perk | The fair. The marrow wins. She pretends not to mind. The Magistrate attends in a ribbon. |

### Ferris Tally, the Merchant (they)

- **Home:** the Market Stall. **Arrives:** on discovery.
- **Personality:** haggles for the pleasure of it, even over things they are giving away.
- **Traits:** chatty, honest, a touch vain.
- **Facts:** Their brass scales are "the good scales", and only friends may look at them. They
  remember how everyone in town takes their tea. They keep every form the Office has ever printed,
  filed by colour.
- **Voice:** quick and warm, and nearly every sentence is an offer.
- **Sample:** "For you, half price. For anyone else, also half price, but don't tell them."
- **Lesson, "A Fair Weight":** make Glass (`has-entry: glass, made`), a jar to sell things from,
  then make Salt (`has-entry: salt, made`), the first thing any market weighs.

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| The Good Scales | 2 | | `built: market-stall` | commission | The scales deserve a proper counter. The stall is that counter. |
| Something for Everyone | 4 | | `bought: 3` | tier unlock (the Stall's tier 2) | Ferris wants to learn the lane's taste, so they watch what the player buys and take notes in the margin of a form. |
| Form Nine | 6 | Ignatius, A Blank Where We Live | `has-entry: crown, made` | thread piece | Form Nine-B must carry "any reasonable seal". Ferris holds that a seal should look important, and a crown is the most important-looking thing anyone can make before lunch. |
| A Rival, in a Friendly Way | 8 | | `regulars: 4` | perk | A travelling stall sets up at the end of the lane. Ferris is delighted and furious in equal measure, and wins the lane over by being nicer. |

### Marigold Tumble, the Innkeeper (she)

- **Home:** the Tavern, the Second Kettle. **Arrives:** on discovery, once two townsfolk are in
  town (an inn wants regulars before it wants an innkeeper).
- **Personality:** knows everyone's usual and most of their business, and keeps both behind the
  bar.
- **Traits:** unflappable, nosy, generous.
- **Facts:** The inn is named for the first kettle, which she will not talk about. The sign shows
  half a cat, because the painter left mid-job, and she has grown fond of it. She keeps a spare
  bed made up, for whoever.
- **Voice:** brief and warm. She ends conversations by putting food in front of people.
- **Sample:** "Sit. You look like someone who has been combining things since breakfast."
- **Lesson, "Last Orders":** make Food (`has-entry: food, made`), then brew Tea
  (`has-entry: tea, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Half a Cat | 2 | | `built: tavern` | commission | The sign goes up. The first customer asks where the rest of the cat is. |
| The Usual | 4 | | `evenings: 10` | tier unlock (the Tavern's tier 2) | She has never had to work out the player's usual. She means to, so she watches them across a run of evenings. |
| A Licence to Pour | 6 | Ferris, Form Nine | `tag-count: liquid, 5` | thread piece | The form names the inn, so the inn needs a licence. Ferris has filed it, and the Office wants proof that she pours more than one thing. |
| The First Kettle | 8 | Dunstan, The Box of Wrong Hinges | `regulars: 3` | perk | Bittersweet. She takes the cracked first kettle off the high shelf. It was her mother's. Dunstan has been mending things lately. |

### Dunstan Coals, the Blacksmith (he)

- **Home:** the Smithy. **Arrives:** on discovery, once one building stands (he waits until
  there is a town to make hinges for).
- **Personality:** very large, very gentle, and easier with iron than with people.
- **Traits:** shy, careful, perfectionist.
- **Facts:** A dragon called Mrs Cindertoe writes to him, at length, about the fit of her
  horseshoes. He hums one tune while he works and does not know its name. He keeps a box of every
  hinge that did not come out right, and cannot throw it away.
- **Voice:** few words and long pauses. He describes metal with great tenderness.
- **Sample:** "It's a good hinge. Listen. Doesn't say a thing."
- **Lesson, "Mind the Heat":** make Iron (`has-entry: iron, made`), then hold three metals
  (`tag-count: metal, 3`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Mrs Cindertoe's Letter | 2 | | `built: smithy` | commission (horseshoes, hinges) | A letter in singed handwriting arrives. The front left shoe pinches. |
| The Box of Wrong Hinges | 4 | | `has-entry: spell-mending` | tier unlock (the Smithy's tier 2) | The player could mend them all. He is not sure he wants that, since they are his history. He lets them mend one and keeps the rest. |
| A Sign for the Lane | 6 | Ignatius, A Blank Where We Live | `depth: 6, made` | thread piece | A street needs a sign before it can be on a map. He has never made letters before, and the first one comes out backwards. |
| The Name of the Tune | 8 | Tansy, Something That Hums; Marigold, The First Kettle | `evenings: 20` | perk | One of Tansy's tonics hums his tune. Marigold knows it: her mother sang it at the first kettle. |

### Quince Mallow, the Herbalist (they)

- **Home:** the Herb Garden. **Arrives:** on discovery.
- **Personality:** labels everything in very small handwriting, and worries about all of it.
- **Traits:** precise, anxious, kind.
- **Facts:** Meadowsweet is their favourite flower, and it makes them sneeze. They keep a notebook
  of every remedy that did not work, for balance. They talk to seedlings, but only to encourage
  them.
- **Voice:** they qualify everything and apologise for it, then say one thing with total
  certainty.
- **Sample:** "It might help. It probably won't hurt. It will definitely smell of mint."
- **Lesson, "Which Leaf Is Which":** pick an Herb (`has-entry: herb, made`), then learn what not
  to pick (`has-entry: rotted-leaves, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Small Labels | 2 | | `built: herb-garden` | commission (remedies for small troubles) | The garden is in, and every bed has a label too small to read. |
| The Smoke | 4 | | `has-entry: abjuration` | tier unlock (the Herb Garden's tier 2, which also needs Tansy) | Smoke from the forge gets into the sage. Abjuration keeps the rain off, so Quince wonders whether it keeps smoke off. They are too polite to ask Dunstan. |
| A Registered Remedy | 6 | Ignatius, A Blank Where We Live | `tag-count: healing, 3` | thread piece | The form wants one remedy registered with the Office. Quince has hundreds and cannot choose, so the player helps. |
| Meadowsweet | 8 | Tansy, The Sneeze | `regulars: 5` | perk | Tansy has made something for the sneeze. Quince holds a meadowsweet flower for the first time. |

### Tansy Vell, the Alchemist (she)

The Alchemist has no building of her own. From tier 2 the Herb Garden is hers and Quince's
together (`needsJob` in `Town Guide.md`), so she is housed when the Herb Garden stands.

- **Home:** the Herb Garden, shared. **Arrives:** on discovery, from level 3. (`arrival.quest` can
  only name a quest in `data/quests.json`, not a lesson.)
- **Personality:** Quince's old classmate, who never labels anything and is usually right.
- **Traits:** bold, cheerful, untidy.
- **Facts:** She and Quince studied together and still argue about the same jar. Her tonics hum
  when they are ready, each in a different key. She once turned a weed into a remedy and, on an
  off day, into something that sang.
- **Voice:** fast and delighted. She explains everything backwards, starting from the result.
- **Sample:** "It worked. Don't ask me which part."
- **Lesson, "Something That Bubbles":** find Transmutation (`has-entry: transmutation`), then make
  Sulfur (`has-entry: sulfur, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Two Labels on One Jar | 2 | | `built: herb-garden, tier 2` | commission (tonics) | She moves in. Quince labels the jar. She relabels it. |
| The Sneeze | 4 | Quince, The Smoke | `tag-count: reagent, 6` | perk | She is sure meadowsweet can be talked out of making Quince sneeze. Quince is sure it cannot. |
| Something That Hums | 6 | | `depth: 7, made` | perk | One tonic hums a tune nobody taught it. It is the one Dunstan hums. |

### Likes and dislikes (a draft for N1)

Each dislike is a mild irritation with some respect in it. Nobody in town is unkind.

| Job | Likes | Dislikes | Why, in a line |
|---|---|---|---|
| Farmer | Innkeeper, Herbalist | Wizard | The Magistrate has opinions about the wren in the hat. |
| Merchant | Blacksmith, Farmer | Innkeeper | Marigold gives things away, which is very bad for prices. |
| Innkeeper | Farmer, Merchant | Alchemist | A tonic once made the stew sing, during service. |
| Blacksmith | Farmer, Wizard | Herbalist | He knows about the smoke and cannot bear being so politely not complained to. |
| Herbalist | Innkeeper, Alchemist | Blacksmith | The smoke, and the sage. |
| Wizard | Merchant, Herbalist | Farmer | The goose. |
| Alchemist | Blacksmith, Wizard | | She likes everyone, which Quince finds suspicious. |

This makes the street a gentle puzzle: put the Farm by the Tavern and the Herb Garden, and keep
the Smithy away from the drying racks.

## Villagers

Villagers come through a visitor event and settle after a quest: a name, side quests, and no
workshop (`Town Guide.md`, "Arrival"). These three grow out of things the game already has.

| Villager | Comes through | Settles after | Facts |
|---|---|---|---|
| **Aldous Pell** (he), surveyor for the Office | The `the_official` seed, once the form is sent | "On the Map", and a slice of Marigold's pie | Carries a measuring chain he calls Gerald. Is afraid of geese. Had never been anywhere that was not on a map. |
| **Pim Calloway** (they), a travelling fiddler | Tonight's musician happening, then a Repeat visit | A side quest: spend evenings at the Tavern (`evenings`) | Plays only tunes they made up. Their fiddle is called Mildred. Sleeps in Marigold's spare bed whenever they pass. |
| **Vesper Ashby** (she), the stargazer | Tonight's stargazer happening, then a Repeat visit | A side quest: find Divination and learn a first-tier spell | Talks about stars only after dark. Names stars after people who were kind to her. Her brass tube was her grandmother's. Notices that the sky over Crumb Lane is not charted either. |

## Tavern scenes

Code picks the pair and the outcome (a friendship, a rumour, a small gift to the town). These are
the pairs worth writing first, with a plain exchange for each that the model's version replaces.

| Pair | What they talk about | Outcomes that suit it | Plain exchange |
|---|---|---|---|
| Hester and Marigold | Eggs, weather, who is courting whom | friendship, gift | "Rain tomorrow." "Then I'll want more eggs." "You always want more eggs." |
| Ferris and Dunstan | What a good hinge is worth | rumour | "I could sell these for twice that." "Then they'd be worth half." |
| Quince and Tansy | The jar | friendship, rumour | "It says 'calming'." "It *is* calming. It's just also a little bit loud." |
| Ignatius and Ferris | Forms, and the colours of forms | rumour | "Blue is for applications." "Pale blue. Blue is for complaints." |
| Marigold and Pim | The spare bed | friendship | "Same bed?" "Same bed. Same blanket. You still owe me a song." |
| Hester and Ignatius (a dislike) | The goose, the hat, the wren | friendship, rarely | "Your goose." "Your hat." They drink in a silence that is very nearly friendly. |
| Dunstan and Quince (a dislike) | Nothing, at first; then the smoke | friendship, rarely | "Sorry about the smoke." "Sorry about the sage." Neither knows who should be sorry. |
| Marigold and Tansy (a dislike) | The stew that sang | rumour | "It was in tune, at least." "It was in *my kitchen*." |

Whether a dislike pair can meet at all is a question for Design, below.

## Calling lines

Four or more per person, in place of today's one per job. `{name}` is the person's name.

- **Ignatius:** "{name} reads you a paragraph from chapter two, then a different paragraph from
  chapter two." / "{name} lifts his hat so you can see the wren, who does not care for you yet." /
  "{name} certifies your kettle out of habit. It passes." / "{name} shows you the map again, and
  the ring where the lane should be."
- **Hester:** "{name} says it will rain by teatime, and it does." / "{name} walks you down the
  rows and names every cabbage." / "{name} keeps the Magistrate behind her while you talk, mostly."
  / "{name} sends you home with an onion the size of your head and refuses to discuss it."
- **Ferris:** "{name} lets you look at the good scales, which is a compliment." / "{name}
  remembers how you take your tea, and has it ready." / "{name} haggles you down on something you
  were not buying." / "{name} shows you a form in a colour you did not know existed."
- **Marigold:** "{name} sets down a cup you did not ask for and does not charge for it." /
  "{name} tells you who has been in today and what they ordered, which is nearly gossip." /
  "{name} straightens the half a cat on the sign, fondly." / "{name} asks if you've eaten, and
  does not believe the answer."
- **Dunstan:** "{name} lets you work the bellows once, and watches carefully." / "{name} reads
  you a letter from Mrs Cindertoe, which takes some time." / "{name} hums while he works, and stops
  when he notices you listening." / "{name} shows you a hinge he is proud of. It does not squeak."
- **Quince:** "{name} presses a sprig into your hand and tells you what it is for." / "{name}
  shows you a label you can almost read." / "{name} adds a line to the notebook of things that did
  not work, and looks pleased about it." / "{name} introduces you to a seedling, encouragingly."
- **Tansy:** "{name} hands you a jar and asks you to hold it very still." / "{name} explains a
  tonic, starting from the end." / "{name} relabels something of Quince's while you watch." /
  "{name} lets you hear which key today's batch hums in."

## Rules for the model writer (beats and scenes)

On top of `prompts/voice.md` and the event writer's rules:

- **The person is given, not invented.** The prompt carries their personality, traits, facts, and
  voice note. Never contradict a fact or add a new one in a beat. A scene may propose a new fact,
  and code decides whether to keep it, as for visitors.
- **A beat says its objective in plain words** (a Crown, something six steps deep, a spell that
  fetches things) and never adds, drops, or changes a requirement. It never says the beat is done:
  code does that.
- **A beat:** two to four sentences of scene, then one or two lines from the person. End on a
  warm, wry, or quietly proud beat.
- **A Tavern scene:** four to six short lines of dialogue, alternating, with at most one line of
  stage direction. The last line delivers the outcome code chose: a small kindness for a
  friendship, one sentence naming the hinted thing for a rumour, the named thing for a gift.
- **Never mention** Fondness, likes, dislikes, takings, Cheer, quality, gold, or any number. A
  dislike shows only as a mild, respectful irritation.
- **The thread moves only when code moves it.** No scene says the lane is on the map before "On
  the Map" is done.
- **No one leaves, falls ill, or comes to harm.** Bittersweet is allowed (the first kettle);
  grief stays in the past and off screen.

## For Rules (N3a): what this content needs from the schema

The schema has landed (`castMemberSchema` in `src/shared/schema.ts`, rules in
`src/shared/cast.ts`), and the content is in `data/cast.json`. What landed differs from this
sketch in three ways: each beat has a `level` it pays at; rewards are `gold` (with `xp`),
`commission` (tags), `perk`, or `plan` (a tier of 2 or more, brought early); and lesson and
beat XP share the quests' two-fifths budget. So every lesson pays 0 XP, and only two level-5
beats carry any. The sketch below is kept for the record.

```
{
  id, name, pronoun, job, home,            // home: a building id, or shared
  personality,                             // one line
  traits: string[], facts: string[],       // passed to the visitor and beat writers as they are
  voice,                                   // one line, for the prompt
  likes: jobId[], dislikes: jobId[],
  arrival: { level? | buildings? | townsfolk? | quest? },
  lesson: Quest[],                         // the existing quest shape and its `done` conditions
  beats: [{ id, title, gate, waitsOn: beatId[], done, reward: { kind, ... },
            premise, line, thread?: true }],
  callingLines: string[]
}
```

- Every objective above uses an existing `done` type. Tansy's first beat uses `built` with a
  `tier`, which Quest Bot added in N7.
- `waitsOn` crosses people (Marigold's last beat waits on Dunstan's second), so it names beats by
  id across the whole cast, not only within one person.
- The finale "On the Map" has no objective of its own: it is done when its waits are done and its
  gate is met.

## Open questions

Copied to "Questions for design" on the board.

1. **Saved games.** Players saved before this already have townsfolk with names from the pool
   (the Wizard may be "Pip Thistlewood"). Draft: they keep those names, and the cast's traits,
   facts, and arcs attach by job. Or should each one be renamed to the cast name once?
2. **A tier unlock as a beat reward** puts a Fondness gate in front of tier 2, and `Town
   Guide.md` says a building can always be raised. Draft: the beat brings the tier's plan early,
   rather than tier 2 waiting on the beat. Which is meant?
3. **Dislike pairs at the Tavern.** The guide picks pairs from likes. Can a disliked pair meet
   now and then, for the rare friendship? It would be the only way a dislike ever softens.
4. **Mending a dislike.** Should any beat reward be "this dislike no longer counts" (Dunstan and
   Quince after the smoke is dealt with)? It would be a new reward kind.
5. **Two wizards.** The player's starter job is the Wizard, and Ignatius is the town's Wizard.
   Draft: fine. He is retired, and the player is the working one.
