# Infinite Wizard Craft: Bake Guide

How the overnight bake works, every command for it, and what we learned getting here.
Written 2026-10-10. The numbers are from `gpt-oss:20b` on the RX 6800 XT.

## What the bake is

When a player makes a brand-new combination, the model has about six seconds and has to think
lightly. That is good enough for magical pairs and hit and miss for ordinary ones.

The bake does the same job with no one waiting. It works through every pair of basic things
that has no recipe yet, has the model **mark its own candidates out of five with a reason** while
thinking harder, and keeps everything it does. Its picks are drafts. Nothing is in the game
until you approve it, and an approved pair becomes a fixed recipe, the same for every player.

## Quick start

Run everything from the project folder, with Node from nvm:

```
cd ~/Documents/"Infinite Spell Craft"
npm run bake                 # start, or carry on from where it stopped
npm run bake -- status       # how far it has got
npm run bake -- pause        # free the graphics card now
npm run bake -- resume       # carry on
```

To leave it running after the terminal closes:

```
nohup setsid npm run -s bake >> var/bake/bake.log 2>&1 < /dev/null &
tail -f var/bake/bake.log    # watch it (Ctrl+C stops watching, not the bake)
```

## Every command

| Command | What it does |
|---|---|
| `npm run bake` | Works through the pairs. Skips any already done, so it is safe to run again after a stop, a crash, or the PC sleeping. Refuses to start twice. |
| `npm run bake -- --limit 10` | Only that many pairs. For a trial after changing a prompt or a setting. |
| `npm run bake -- pause` | Stops within a second, cutting short the call in progress, and tells Ollama to let go of the model. The half-done pair is redone later. |
| `npm run bake -- resume` | Carries on. If the bake is not running it says so, and `npm run bake` starts it. |
| `npm run bake -- status` | Pairs done, seconds a pair, hours left, how many got each mark, how many drafts are waiting, and whether it is running or paused. |
| `npm run bake -- review` | Writes `var/bake/review.md`: every draft, lowest marks first, with the model's reason and its second choice. |
| `npm run bake -- approve 4` | Approves every draft marked 4 or better. Any mark from 1 to 5 works. |
| `npm run bake -- approve sand+water air+air` | Approves single pairs by their key. The key is in the review list. |
| `npm run bake -- reject sand+water` | Turns single pairs down. A rejected pair stays rejected if the bake is run again. |
| `npm run bake -- triage` | Writes `data/combo-triage.csv`: every draft, flagged by code, with a suggested verdict and empty columns for yours. Safe to run again: verdicts you have filled in are carried over. Also prints the acceptance checks. |
| `npm run bake -- import data/combo-triage.csv` | Reads your verdicts back into the drafts. A row you left blank is untouched. |
| `npm run bake -- import data/combo-triage.csv --accept-suggestions` | The same, taking the suggestion wherever you left a row blank. |
| `npm run bake -- why bat+tea` | One pair's whole trail: every candidate, its mark and reason, what the rules refused, the model's weighing-up, and its own thinking call by call. |

To stop it for good, not just pause: `kill -INT $(cat var/bake/pid)`. It stops cleanly, and
`npm run bake` carries on later.

After approving, **restart the server**. Approved rows are read when it starts. If an approval
would break the game data (a result named the same as a hand-written thing, say), it is undone
and you are told why.

## Sharing the PC

Set under `bake` in `config/model.json`. The settings are read when the bake starts, so stop and
start it after a change.

| Setting | Now | Meaning |
|---|---|---|
| `share` | 1 | The share of the time it works. 1 is flat out, 0.5 is half and half, 0.25 a quarter. |
| `workMinutes` | 5 | How long it works at a stretch before resting. |
| `unloadWhileResting` | true | Lets go of the model while resting, which frees its video memory. |
| `quietMinutes` | 3 | How long the game must leave the model alone before the bake carries on. |
| `rankEffort` | medium | How hard the model thinks when it marks its candidates. |
| `rankTimeoutSeconds` | 180 | How long one ranking call may take before it is redone at ordinary effort. |

Things worth knowing:

- **The model holds about 12.7 GB of the card's 16 GB whenever it is loaded,** busy or not. A
  smaller `share` makes it busy less often, but only `unloadWhileResting` or `pause` gives the
  memory back.
- **At `share` 1 it never rests,** so the model stays loaded the whole time. Use `pause` before
  playing anything heavy.
- **The wizard game comes first.** When the game server uses the model, the bake cuts its own
  call short and waits for `quietMinutes` of quiet. It keeps the model loaded for the player
  while it waits. (This has tests, but had not been seen live at the time of writing.)
- **Ollama answers one call at a time.** That is why the bake has to stand aside: a combination
  would otherwise queue behind a whole ranking call.

## What it does for each pair

1. **Code sets the scene.** Is magic in play (Life, Death, Light, Shadow, Mind, a focus)? If so,
   which storybook things does one ingredient make and the other wake?
2. **Candidates, at ordinary effort.** The storybook choice if any, then two rounds of the three
   questions (what the two make, where they are found, a thing with both in it). The second
   round is told what the first said. Usually four to seven candidates, each with a reason.
   The game's rules throw out hand-written names, welded names, and the like.
3. **Ranking, at `rankEffort`.** The model first weighs the candidates up in two or three
   sentences, before it has marked or chosen anything: what the two things are, which
   suggestions owe something to both, what makes the pair easy or hard. Then it gives every
   candidate a reason and a mark, and says which one it would keep. The pick is the highest mark; among equals, the one it would keep.
4. **The words.** Description and tags for the pick, by the same step the game uses: three
   sentences at most, material tags handed down from the ingredients, one pair in four given a
   playful twist.

The marks mean: 5, nearly any child would say this at once. 4, a clear result of both. 3,
reasonable but takes a moment. 2, a stretch or really from one ingredient. 1, unconnected.

## What is kept, and where

| File | In git | What |
|---|---|---|
| `data/baked-combos.json` | yes | One row per pair: the result, its words, the model's mark and reason, and `status` (`draft`, `ok`, or `rejected`). The only file the game reads. |
| `var/bake/pairs.jsonl` | no | One line per pair, everything about it (below). |
| `var/bake/calls.jsonl` | no | One line per model call, whole (below). |
| `var/bake/prompts.json` | no | Each system prompt once, under the id the calls refer to. |
| `var/bake/review.md` | no | The reading list, rewritten by `review`. |
| `var/bake/bake.log` | no | The running log, when started with the `nohup` line above. |
| `var/bake/pid`, `PAUSE`, `player-active` | no | How the bake, the pause command, and the game server find each other. |

**A line of `pairs.jsonl`** has: the two ingredients; whether magic was in play; whether the
pair is marked playful; the storybook things on offer and the one chosen; every candidate with
its reason, where it came from, its mark, and the model's justification; what the rules refused
and why; the effort the ranking ran at; the one the model said it would keep; the pick and the
runner-up; the description, tags, and any tag the model wished it had; and the seconds each step took.

**A line of `calls.jsonl`** has: the pair, the purpose of the call, the model, the effort, the
temperature, the prompt, the answer, **the model's own thinking**, the tokens in and out, the
seconds, and whether the answer passed the game's checks (and if not, why).

`var/` is not in git, so the raw data lives only on this machine. Copy `var/bake/` somewhere
safe if it matters. It is the material for any later work on the model: fine-tuning, a better
grader, or a list of examples.

## Reviewing and approving

1. `npm run bake -- review`, then read `var/bake/review.md`.
2. Reject what is wrong: `npm run bake -- reject steam+silver`.
3. Approve the rest in one go (`npm run bake -- approve 4`) or pair by pair.
4. Restart the server.

A row can also be edited by hand in `data/baked-combos.json`: fix a name or a description, set
`status` to `ok`. Names are stored with a capital.

What approval does:

- The pair is a fixed recipe from then on, and never reaches the model again.
- Its result is a thing in the game. If two approved pairs make the same thing, the first one's
  words are used.
- The result can still come out of other pairs while playing (a Beach from some deeper pair).
  Hand-written things stay reserved, as before.
- A saved combination for the same pair is simply overridden. The old result stays in any
  player's discoveries.

## Reviewing with the triage file

The first bake showed the model's marks cannot approve anything, so review goes through
`data/combo-triage.csv` instead of `approve 4`. Open it in a spreadsheet.

| Column | What |
|---|---|
| `flags` | What code can see: a name used more than 3 times, a thing from after the age of steam, not a real word, a name that only says what went in, a low mark, worn-out words, too long. |
| `SUGGESTED`, `SUGGESTED_RESULT`, `FAILURE` | A suggested verdict. For the first bake these are in `data/combo-suggestions.json`. Otherwise they come from the flags. |
| `YOUR_VERDICT` | `keep`, `fix`, `reject`, or `nothing`. **This is the column that counts.** |
| `YOUR_RESULT_IF_FIX` | The right result, for a `fix`. Left blank, the suggested result is used. |
| `NOTES` | Anything worth keeping. A funny answer for later goes here. |

What each verdict does on import:

- `keep`: approved. In the game at the next server start.
- `fix`: the row is marked with the right result. Its description still has to be rewritten for
  the new name before it goes live.
- `reject`: wrong, with a better answer likely. It is baked again in the next round.
- `nothing`: the pair makes nothing. In the game it answers with a gentle line from
  `data/no-result-lines.json`, always the same one for that pair, and the model is never asked.

Failure types, kept on every row that was not simply kept: attractor, one-sided, bad logic,
modern, not a word, name pun, misread ingredient, too abstract, metaphorical, wrong category.

## Rules enforced by code

These hold for the live game and the bake alike (`comboRules` in `src/server/combiner.ts`).

| Rule | Where to change it |
|---|---|
| A name must be made of real words | `data/words.txt` (from SCOWL, license beside it) and `data/extra-words.json` for real words it lacks |
| A name of two words or more may not be only the ingredients' own names | code (`src/server/names.ts`) |
| Nothing from after the age of steam | `data/banned-results.json` |
| A description may not lean on worn-out words | `data/overused-words.json` |
| A description is 2 sentences at most | `generation.maxSentences` in `config/balance.json` |
| One spelling per name | `data/name-aliases.json` |
| In the bake, a name already made by 3 pairs is passed over | `generation.bakeNameCap` |
| The model is told what an ambiguous thing is | `gloss` on each entry in `data/entries.json` |

## Read before trusting the marks

From the first 517 pairs:

- **The marks are generous.** Nearly nine in ten got a 4 or a 5. Things marked 5 included
  "Salted sand" and Golden Record; "China" for Spirits + Bone dust got a 4. Use the marks to
  sort the reading list, not as a verdict. Read the 5s too.
- **It repeats itself.** Steel and Mirror came up eleven times each, Cave nine. The bake does
  not steer away from repeats the way the live game does. Decide, when reviewing, how many ways
  you want to make Steel.
- **A low mark still makes a draft.** When the best candidate scored 2, it is in the drafts
  file anyway. Those need rejecting, not skipping.
- **Made-up words can slip through** ("Mirrorroom").
- **Words with two meanings trip it.** Spirits the drink was read as ghosts more than once.
- **Magic is under-used.** About four in ten magical pairs came out as a storybook thing.

## What we tried on the way, and what it showed

Measured with `npm run bench` on 54 fixed pairs. Two runs of the same setting differ by about
three answers, so smaller gaps mean nothing.

| What | Right answers, of 54 | Seconds |
|---|---|---|
| The first generator (one call for name, words, and tags) | 20 | 5.2 |
| Three questions, low effort | 29 to 34 | about 6 |
| One word only, low effort | 29, with 5 bad or failed | 10 |
| One word only, medium effort | stopped after six pairs | 91 |

What turned out to matter:

- **Let code narrow the choice.** The model is poor at inventing, better at choosing from a
  short list, best when code has already cut the list down. The storybook list, with what each
  thing is made of and what wakes it, is why magical pairs are reliable.
- **Names only.** The joke descriptions ("Person: mud that stood up") were being read
  literally. Every step now sees the ingredients' names and nothing else.
- **It copies examples.** One worked example in a prompt came straight back as an answer.
- **It judges poorly at low effort.** Asked to pick among its own ideas, it chose Ironwood over
  Hammer even when warned. So the live game takes the first usable answer and does not judge.
- **Thinking harder helps judging, and is far too slow for play.** That is the whole reason
  for the bake: the judging happens when nobody is waiting.

## Related commands

```
npm run bench                    # measure live naming on the fixed pairs (leaves approved bakes out)
npm run bench -- sand spirit     # only pairs that use one of these things
npm run cache -- review          # have the model grade every saved combination and list the doubtful ones
npm run cache -- list            # every saved combination
npm run cache -- delete fire+mud # delete one, and anything built from it (back up var/game.db first)
npm run cache -- calls           # recent model calls made by the game
```

## Where the code is

| File | What |
|---|---|
| `src/tools/bake.ts` | The command: run, pause, resume, status, review, approve, reject |
| `src/server/bake.ts` | Works one pair and writes its record |
| `src/server/bakePairs.ts` | Which pairs, in which order |
| `src/server/bakeRank.ts` | The marking step, and how the pick is settled |
| `src/server/bakeLog.ts` | Keeps every model call whole |
| `src/server/bakePace.ts` | Work then rest, pausing, and standing aside for players |
| `src/server/comboGenerator.ts` | The naming and describing steps, shared with the live game |
| `src/server/gameData.ts` | Loads approved rows as fixed recipes |
| `tests/bake.test.ts` | Tests for all of the above |

## If something looks wrong

| What you see | What to do |
|---|---|
| "The bake is already running" but it is not | Delete `var/bake/pid` and start it again. |
| It says paused and you did not pause it | `npm run bake -- resume`, or delete `var/bake/PAUSE`. |
| It keeps saying someone is playing | The game server used the model in the last few minutes. It carries on by itself. Deleting `var/bake/player-active` forces it. |
| Every pair is slow or failing | Ollama is not answering. Check it is running on the host PC and that `url` in `config/model.json` is right. |
| A pair "came to nothing" | Every suggestion broke a rule. It has a record but no draft. Delete its line from `var/bake/pairs.jsonl` to have it tried again. |
| You want a pair done over | Delete its line from `var/bake/pairs.jsonl` and, if it is still a draft, its row in `data/baked-combos.json`. |
