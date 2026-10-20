# Infinite Wizard Craft: Story and Cast v0.1 (DRAFT)

The people of Crumb Lane, and the story they share. This guide is the content for ticket N3b. The
rules it sits on are in `Town Guide.md` under "Townsfolk as neighbours". Tone follows
`prompts/voice.md`. Every Fondness gate and every reward below is a draft for Rules to set in
`config/balance.json` and the cast data; none of them is decided here.

Settled by Trysten, 2026-10-18:

- **One fixed character per trade.** The Blacksmith is Dunstan Coals in every game.
- **Each person's arc stands alone, and a gentle thread runs through them:** Crumb Lane is not
  on the map. No destiny, no prophecy, and nothing is lost if the thread is never finished.

Settled by Trysten, 2026-10-19:

- **The cast's story is hand-written.** Every beat scene, lesson, calling line, and Tavern scene
  between townsfolk is written here and kept in data. The model writes none of it. It keeps
  strangers who visit, small talk when a townsperson is the evening visitor, orders, and
  combinations.
- **The player is silent.** Townsfolk speak to them and react to what they have done.
- **A beat pays the moment it is done.** Its scene waits at the person's door and plays when the
  player visits that evening, for ⌛. Skipping it loses nothing, and it is kept in the People tab.

## What the code owns and what the writing owns

| Code owns | Story lane writes (data) | The model writes |
|---|---|---|
| Fondness gates, objectives, rewards, the XP share | Each person, their facts, and every line they say | Small talk when a townsperson is the evening visitor, from their fixed traits and facts |
| When someone arrives, and who meets whom | Lesson, beat, and Tavern scenes | Strangers who visit, orders, combinations |
| Which outcome a Tavern scene has, and which line is picked | Calling lines with the conditions they wait for | Nothing about any arc |
| Whether a beat is done, and the slots it fills (`{thing}`) | | |

## How we write the cast

These rules come from research into what makes characters, conversations, and quest givers work
(sources at the end of this section). Every scene is checked against the list before it lands.

### A person

1. **A want, a need, and a contradiction.** The want is concrete and drives the arc. The need is
   the inner change the arc delivers. The contradiction is a gap between how they seem and how
   they are. The want should look like the fix for the need, and turn out not to be. Dunstan
   wants every hinge perfect, needs to let a thing be imperfect, and is huge and soft-spoken.
2. **A life apart from the player.** They want things from each other, are sometimes busy, and
   have things happen to them off-screen. The player's sense of mattering comes from people who
   have their own business. "Agency is an effect, not a goal" (Meg Jayanth).
3. **Specific, not decorated.** One telling detail beats a list. Every fixed fact must pay off in
   at least one scene, and a fact that never matters gets cut.
4. **They change, and the town shows it.** After a beat, their calling lines change, and
   something in the world changes too: a sign, a habit, a line in the ledger.
5. **No two handle things the same way.** Under stress, Hester deflects, Ferris talks more,
   Quince apologises, Tansy charges ahead, Dunstan goes quiet, Marigold feeds someone, and
   Ignatius digresses. Each sheet below says how they meet stress, praise, and conflict.

### How they talk

6. **Distinct voices.** Each person has their own vocabulary, sentence length, and topics they
   raise and avoid. The swap test: give one person's line to another, and it must read wrong.
   Tics stay subtle, because calling lines repeat and loud quirks grate.
7. **Subtext.** People talk about the kettle, not the grief. Ask what this person is afraid to
   say, and let that shape the line. The sheet below names it.
8. **Start with a verb, and leave on the beat.** Every scene opens mid-activity: what are they
   doing when the player arrives? It ends on its last good line, with no goodbyes.
9. **Short, with the joke last.** A scene runs three to eight lines of one or two sentences each,
   with the joke landing in the last few words (`voice.md`).
10. **The world notices the player.** Lines react to what the player did, through slots code
    fills (`{thing}`: the discovery that finished the beat). Ask what this person would notice.
    The player never speaks, so the scene carries their part by how others react to them.

### Between two people

11. **Pairs are built on contrast.** One plays it straight while the other is the comic engine.
    The dislike pairs are the best engines, because each quirk feeds the other.
12. **A status see-saw.** In every exchange status shifts at least once, kindly. Whoever starts
    on top ends a little lower, or the other way round. Nobody wins, and nobody is put down.
13. **Overheard from the middle.** A Tavern scene is a fragment of a longer conversation, with
    only its most revealing lines kept. The player walks in on it.
14. **Callbacks and running gags in threes.** Each gag escalates across three appearances, each
    a little bigger. Scenes refer back to earlier beats, so the town builds a shared history.
15. **Relationships change.** Two townsfolk can grow closer through their arcs, as Dunstan and
    Quince do over the smoke, and later scenes reflect it.

### Quests and beats

16. **A simple ask, a personal reason.** The task can be small (make a Crown). The reason must
    matter to them, in their own words.
17. **Story is the reward.** Each Fondness gate pays with something revealing about the person,
    not only an item.
18. **The next step can be found, but is never spelled out.** While a beat is open, calling on
    the person gives a nudge line, and the People tab gives a hint. Never the recipe.

### Repetition

Hand-written text needs a system, or it repeats.

19. **The most specific line wins, and there is always a fallback.** Lines carry conditions:
    Fondness, before or after a beat, a building standing, tonight's happening. Code picks the
    most specific line that matches, and every person has lines that always match.
20. **Unheard lines first.** No line repeats while an unheard one matches. After that, the line
    heard longest ago comes back.
21. **New lines with depth.** Each step of Fondness and each finished beat opens new calling
    lines, so calling on someone keeps paying.

### Cozy limits

From `voice.md`. Nobody is harmed, leaves, or falls ill. Grief is remembered, gently, and never
happens on screen. No number, game word, or exclamation mark appears in any line. Romance goes
no further than a shy look or a shared pie.

### The checklist, for every scene

- Does it open on someone doing something, and end on its best line?
- Could any line be given to someone else? If it could, rewrite it.
- What is the speaker not saying? Is that under the line?
- Does the status shift, even a little?
- Does it notice the player, or call back to something earlier?
- Is it three to eight lines, with no number, no game word, and no exclamation mark?
- Does a fixed fact show up, or a running gag move one step on?

### Sources

- Meg Jayanth, "Forget Protagonists: Writing NPCs with Agency", GDC 2016 (GDC Vault; Kill
  Screen's report): NPCs with their own drive.
- Supergiant Games on *Hades* (Game Developer, "How Supergiant weaves narrative rewards…";
  GameSpot, Greg Kasavin): reactivity, "what would these characters notice", story as reward.
- Emily Short, "Beyond Branching" (emshort.blog, 2016): salience-based lines, fallbacks, weighting
  used content down.
- "Adding life to worlds with dialogue barks" (Game Developer): start with verbs, overheard
  banter, subtle tics.
- Keith Johnstone, *Impro*: status transactions and the see-saw.
- *Stardew Valley* heart events (Stardew wiki; TheGamer): gated scenes as reward, events that
  change the town.
- *Animal Crossing: New Horizons* (Screen Rant; GameFAQs): repetition, shared personality lines,
  content players cannot find.
- *The Witcher 3* side quests (Kotaku; TheGamer): a simple task wrapped in a personal reason.
- Want and need (K. M. Weiland, Helping Writers Become Authors; Janice Hardy, Fiction
  University); ensembles and foils (Chris Head; Creative Screenwriting; Writer's Digest); comedy
  craft: callbacks, heightening, the rule of three (Writing Workshops; Highbrow).

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

Under Hiring (`Town Guide.md`, 2026-10-19), a person comes to work the morning after their
building stands. So each first beat has no objective: it opens once the player has called on them
enough (the gate), and it is their first proper conversation.

### Ignatius Puddlewick, the Wizard (he)

- **Home:** the Wizard's Tower. **Arrives:** the morning after the Wizard's Tower stands.
- **Personality:** a retired certifier of kettles who has never once been in a hurry.
- **Traits:** kindly, wandering, proud of paperwork.
- **Facts:** He spent forty years at the Office of Reasonable Enchantments, certifying kettles. A
  wren nests in his hat and he will not disturb it. He has been writing *A Sensible History of
  Kettles* for years and is on chapter two.
- **Voice:** long sentences that wander off and come back carrying one exact, useful point.
- **Sample:** "The map is perfectly good. It is only that, according to it, you and I are
  standing in a saucer."
- **Wants** to finish his book. **Needs** to see that his useful years are not behind him: the
  lane on the map is the chapter that matters. **Contradiction:** forty years certifying things,
  and nothing he owns is certified.
- **Under stress** he digresses; **praised**, he credits the kettles, then writes it down later;
  **in conflict**, he produces a form. **Won't say:** he is afraid nobody needs him now.
  **Raises** kettles, forms, the wren, and the Office's old ways; **avoids** why he retired.
- **Running gag, the Magistrate and his things:** the goose takes his hat (Hester's second beat),
  then his spectacles, then Form Nine-B on its way to the post, and delivers it.
- **Lesson:** none. The Wizard is taught from the first day (`Town Guide.md`, "Learning a trade").
  He says so: "You already know how. I only have the hat."

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| A Blank Where We Live | 2 | | none: opens at the gate | commission (lost cats, cold soup) | Settled in his tower, he unrolls the county map and finds the teacup ring where the lane should be. Starts the thread. |
| The Lapsed Licence | 4 | | `learned-schools: 2` | tier unlock (the Tower's tier 2) | The form wants a practising wizard. His licence lapsed somewhere around chapter two, and the renewal asks him to show he keeps up with more than one school. He would like to watch the player do it. |
| Chapter Three | 6 | | `enchantments: 3` | perk | He finally starts chapter three. It is about the player, and he reads them the first line. |
| On the Map | 8 | all six thread beats | none beyond the waits | the thread's finale (above) | The form goes off. The surveyor comes, measures, and has a slice of pie. Crumb Lane is somewhere. |

### Hester Furrow, the Farmer (she)

- **Home:** the Farm. **Arrives:** the morning after the Farm stands.
- **Personality:** grows enormous vegetables and is embarrassed whenever anyone mentions it.
- **Traits:** blunt, patient, weather-wise.
- **Facts:** Her goose, the Magistrate, chases anyone carrying a clipboard. The hawthorn hedge at
  the end of the lane was planted by her great-grandmother. She forecasts rain by her left knee
  and is never wrong.
- **Voice:** short sentences, a weather report in every conversation, and every compliment passed
  on to the soil.
- **Sample:** "Rain by teatime. Don't look at the marrow, it gets ideas."
- **Wants** the marrow to win, though she would never say so. **Needs** to be good at something
  out loud. **Contradiction:** blunt about everything except her own work.
- **Under stress** she gives a weather report; **praised**, she credits the soil; **in
  conflict**, she says one sentence and goes back to digging. **Won't say:** she is proud.
  **Raises** the weather, the hedge, and the goose; **avoids** the prize.
- **Running gag, her left knee:** rain by teatime, and it rains; rain for the surveyor's visit,
  and it rains on the surveyor only; on prize day the knee says sun, for the first time anyone
  can remember.
- **Lesson, "Hands in the Dirt":** grow a Tree (`has-entry: tree, made`), then make Food
  (`has-entry: food, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| The Marrow Question | 2 | | `tag-count: plant, 6` | commission (enormous vegetables) | The fair is coming and her marrow is only large. She wants to know what else grows on purpose. |
| The Magistrate | 4 | | `has-entry: spell-mage-hand` | tier unlock (the Farm's tier 2) | The goose has taken Ignatius's hat, wren and all, to the middle of the pond. Something has to fetch it that the goose cannot reach. |
| Older Than the Map | 6 | Ignatius, A Blank Where We Live | `has-entry: rotted-leaves, made` | thread piece | The form wants a boundary older than the form. The hedge qualifies, but it must look like a hedge on the day, so it wants a good mulching first. |
| Prize Day | 8 | | `depth: 8, made` | perk | The fair. The marrow wins. She pretends not to mind. The Magistrate attends in a ribbon. |

### Ferris Tally, the Merchant (they)

- **Home:** the Market Stall. **Arrives:** the morning after the Market Stall stands.
- **Personality:** haggles for the pleasure of it, even over things they are giving away.
- **Traits:** chatty, honest, a touch vain.
- **Facts:** Their brass scales are "the good scales", and only friends may look at them. They
  remember how everyone in town takes their tea. They keep every form the Office has ever printed,
  filed by colour.
- **Voice:** quick and warm, and nearly every sentence is an offer.
- **Sample:** "For you, half price. For anyone else, also half price, but don't tell them."
- **Wants** the lane to be a proper market. **Needs** to be valued for themselves, not for the
  bargain. **Contradiction:** haggles over everything, and gives everything away to friends.
- **Under stress** they talk faster; **praised**, they offer a discount; **in conflict**, they
  file a form about it. **Won't say:** the stall is lonely between customers. **Raises**
  prices, how people take their tea, and the colours of forms; **avoids** where they came from.
- **Running gag, the colours of forms:** pale blue is for applications; then a form in heron
  grey, a colour nobody else has seen; then the Office replies on a colour even Ferris did not
  know existed, and they frame it.
- **Lesson, "A Fair Weight":** make Glass (`has-entry: glass, made`), a jar to sell things from,
  then make Salt (`has-entry: salt, made`), the first thing any market weighs.

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| The Good Scales | 2 | | none: opens at the gate | commission | The scales deserve a proper counter. The stall is that counter. |
| Something for Everyone | 4 | | `bought: 3` | tier unlock (the Stall's tier 2) | Ferris wants to learn the lane's taste, so they watch what the player buys and take notes in the margin of a form. |
| Form Nine | 6 | Ignatius, A Blank Where We Live | `has-entry: crown, made` | thread piece | Form Nine-B must carry "any reasonable seal". Ferris holds that a seal should look important, and a crown is the most important-looking thing anyone can make before lunch. |
| A Rival, in a Friendly Way | 8 | | `regulars: 4` | perk | A travelling stall sets up at the end of the lane. Ferris is delighted and furious in equal measure, and wins the lane over by being nicer. |

### Marigold Tumble, the Innkeeper (she)

- **Home:** the Tavern, the Second Kettle. **Arrives:** the morning after the Tavern stands.
- **Personality:** knows everyone's usual and most of their business, and keeps both behind the
  bar.
- **Traits:** unflappable, nosy, generous.
- **Facts:** The inn is named for the first kettle, which she will not talk about. The sign shows
  half a cat, because the painter left mid-job, and she has grown fond of it. She keeps a spare
  bed made up, for whoever.
- **Voice:** brief and warm. She ends conversations by putting food in front of people.
- **Sample:** "Sit. You look like someone who has been combining things since breakfast."
- **Wants** everyone fed and the inn full. **Needs** to let someone look after her for once.
  **Contradiction:** knows everyone's business, and keeps her own behind lock and key.
- **Under stress** she puts food in front of someone; **praised**, she says "eat your stew";
  **in conflict**, she is brisk and unbothered. **Won't say:** anything about her mother or the
  first kettle. **Raises** who came in and what they ordered; **avoids** the high shelf.
- **Running gag, half a cat:** someone asks where the rest of the cat is; then a painter offers
  to finish it and she will not hear of it; then the Office's new map marks the inn with half a
  cat.
- **Lesson, "Last Orders":** make Food (`has-entry: food, made`), then brew Tea
  (`has-entry: tea, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Half a Cat | 2 | | none: opens at the gate | commission | The sign goes up. The first customer asks where the rest of the cat is. |
| The Usual | 4 | | `evenings: 10` | tier unlock (the Tavern's tier 2) | She has never had to work out the player's usual. She means to, so she watches them across a run of evenings. |
| A Licence to Pour | 6 | Ferris, Form Nine | `tag-count: liquid, 5` | thread piece | The form names the inn, so the inn needs a licence. Ferris has filed it, and the Office wants proof that she pours more than one thing. |
| The First Kettle | 8 | Dunstan, The Box of Wrong Hinges | `regulars: 3` | perk | Bittersweet. She takes the cracked first kettle off the high shelf. It was her mother's. Dunstan has been mending things lately. |

### Dunstan Coals, the Blacksmith (he)

- **Home:** the Smithy. **Arrives:** the morning after the Smithy stands.
- **Personality:** very large, very gentle, and easier with iron than with people.
- **Traits:** shy, careful, perfectionist.
- **Facts:** A dragon called Mrs Cindertoe writes to him, at length, about the fit of her
  horseshoes. He hums one tune while he works and does not know its name. He keeps a box of every
  hinge that did not come out right, and cannot throw it away.
- **Voice:** few words and long pauses. He describes metal with great tenderness.
- **Sample:** "It's a good hinge. Listen. Doesn't say a thing."
- **Wants** every piece of work perfect. **Needs** to let an imperfect thing be, and to be heard
  (he hums out loud by the end). **Contradiction:** the largest person on the lane, and the
  quietest.
- **Under stress** he goes quiet and works; **praised**, he looks at the thing, not at you; **in
  conflict**, he apologises to the iron. **Won't say:** he would like to belong somewhere.
  **Raises** metal and Mrs Cindertoe; **avoids** himself and the tune.
- **Running gag, Mrs Cindertoe's letters:** her front left shoe pinches; then she wants a
  matching set for her niece; then she writes to say Crumb Lane is on her map now, which is a
  dragon's map and much older than the Office's.
- **Lesson, "Mind the Heat":** make Iron (`has-entry: iron, made`), then hold three metals
  (`tag-count: metal, 3`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Mrs Cindertoe's Letter | 2 | | none: opens at the gate | commission (horseshoes, hinges) | A letter in singed handwriting arrives. The front left shoe pinches. |
| The Box of Wrong Hinges | 4 | | `has-entry: spell-mending` | tier unlock (the Smithy's tier 2) | The player could mend them all. He is not sure he wants that, since they are his history. He lets them mend one and keeps the rest. |
| A Sign for the Lane | 6 | Ignatius, A Blank Where We Live | `depth: 6, made` | thread piece | A street needs a sign before it can be on a map. He has never made letters before, and the first one comes out backwards. |
| The Name of the Tune | 8 | Tansy, Something That Hums; Marigold, The First Kettle | `evenings: 20` | perk | One of Tansy's tonics hums his tune. Marigold knows it: her mother sang it at the first kettle. |

### Quince Mallow, the Herbalist (they)

- **Home:** the Herb Garden. **Arrives:** the morning after the Herb Garden stands.
- **Personality:** labels everything in very small handwriting, and worries about all of it.
- **Traits:** precise, anxious, kind.
- **Facts:** Meadowsweet is their favourite flower, and it makes them sneeze. They keep a notebook
  of every remedy that did not work, for balance. They talk to seedlings, but only to encourage
  them.
- **Voice:** they qualify everything and apologise for it, then say one thing with total
  certainty.
- **Sample:** "It might help. It probably won't hurt. It will definitely smell of mint."
- **Wants** everything labelled correctly, so nobody takes the wrong leaf. **Needs** to trust
  something that isn't written down: Tansy, and in the end meadowsweet. **Contradiction:** anxious
  about everything except plants, about which they are never wrong.
- **Under stress** they apologise and qualify; **praised**, they pass it on to the seedlings;
  **in conflict**, they say nothing at all (the smoke). **Won't say:** they are tired of being
  careful. **Raises** what each leaf is for; **avoids** what they want for themselves.
- **Running gag, tiny labels:** nobody can read them; then Ferris lends a magnifying glass,
  and it is not enough; then the registered remedy has to be written large, and it costs them.
- **Lesson, "Which Leaf Is Which":** pick an Herb (`has-entry: herb, made`), then learn what not
  to pick (`has-entry: rotted-leaves, made`).

| Beat | Gate | Waits on | Objective (draft) | Reward kind | Premise |
|---|---|---|---|---|---|
| Small Labels | 2 | | none: opens at the gate | commission (remedies for small troubles) | The garden is in, and every bed has a label too small to read. |
| The Smoke | 4 | | `has-entry: abjuration` | tier unlock (the Herb Garden's tier 2, which also needs Tansy) | Smoke from the forge gets into the sage. Abjuration keeps the rain off, so Quince wonders whether it keeps smoke off. They are too polite to ask Dunstan. |
| A Registered Remedy | 6 | Ignatius, A Blank Where We Live | `tag-count: healing, 3` | thread piece | The form wants one remedy registered with the Office. Quince has hundreds and cannot choose, so the player helps. |
| Meadowsweet | 8 | Tansy, The Sneeze | `regulars: 5` | perk | Tansy has made something for the sneeze. Quince holds a meadowsweet flower for the first time. |

### Tansy Vell, the Alchemist (she)

The Alchemist has no building of her own. From tier 2 the Herb Garden is hers and Quince's
together (`needsJob` in `Town Guide.md`), so she is housed when the Herb Garden stands.

- **Home:** the Herb Garden, shared. **Arrives:** on day 2 (Trysten, 2026-10-19; `arrival.day`).
- **Personality:** Quince's old classmate, who never labels anything and is usually right.
- **Traits:** bold, cheerful, untidy.
- **Facts:** She and Quince studied together and still argue about the same jar. Her tonics hum
  when they are ready, each in a different key. She once turned a weed into a remedy and, on an
  off day, into something that sang.
- **Voice:** fast and delighted. She explains everything backwards, starting from the result.
- **Sample:** "It worked. Don't ask me which part."
- **Wants** to make something that sings on purpose. **Needs** to finish one thing properly, and
  to say she missed Quince. **Contradiction:** careless with labels, careful with people.
- **Under stress** she speeds up; **praised**, she says it worked and not to ask which part;
  **in conflict**, she relabels the jar. **Won't say:** she came to Crumb Lane for Quince.
  **Raises** results and musical keys; **avoids** how things went wrong.
- **Running gag, the jar:** two labels that disagree; then three; then the jar hums its own name,
  and both of them write it down.
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

## What the model still writes: a townsperson as the evening visitor

When a townsperson is the evening's visitor, the event writer uses their fixed traits and facts
for a little small talk. `prompts/story.md` holds its rules:

- **The person is given, not invented.** Never contradict a fact or add a new one.
- **Never touch an arc.** No beat, lesson, or Tavern scene is mentioned, and the thread moves
  only when code moves it.
- **Never mention** Fondness, likes, dislikes, takings, Cheer, quality, gold, how much of the
  evening is left, or any number.
- **No one leaves, falls ill, or comes to harm.**

## For Rules (N3c): the shape hand-written scenes need

Rules owns the final schema. The N3a shape (`castMemberSchema` in `src/shared/schema.ts`) has a
`premise` and one `line` per beat for the model; hand-written scenes need this instead:

```
Line:     { who: personId | "stage", text }    // "stage": one line saying what someone does
Beat:     { ...as now, minus premise and line,
            scene: Line[],                     // three to eight lines, played in the evening
            nudges: string[],                  // calling lines while the beat is open
            after: string[],                   // calling lines the beat unlocks
            summary }                          // one line for the ledger and the People tab
Lesson:   { ...the quest, nudge, taught: Line[] }
Calling:  { text, from?: fondness, after?: beatId, before?: beatId, when?: context }
Tavern:   { pair: [personId, personId], outcome: "friendship" | "rumour" | "gift",
            after?: beatId, lines: Line[] }
```

- **Slots** are a closed list that code fills: `{name}` (the speaker's), `{thing}` (the
  discovery that finished the beat, or the rumour's or gift's thing), and `{other}` (the other
  person in a Tavern scene). The player has no lines.
- **`pickLine`** (pure, in `src/shared/cast.ts`) picks a calling line: the most specific unheard
  match, then the one heard longest ago. Every person has lines with no condition, so there is
  always a fallback.
- **`when`** is a closed list for Rules to choose, for example: a building of a named trade
  stands, a liked or disliked neighbour, tonight's happening, a meal eaten today.
- **Loader checks:** every `who` is in the cast; slots are from the list; `after` and `before`
  name real beats; every beat has a scene and at least one nudge.
- **What each Tavern outcome does** stays code's, and is still N4's question 2.

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
6. **Tansy under Hiring.** Settled by Trysten, 2026-10-19: she comes on day 2 (`arrival.day`).
