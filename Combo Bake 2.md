# Combo Pipeline: Next Round Spec

For the coding agent running the combo "bake". This extends `combo-review-handoff.md` (the findings) and `voice.md` (tone). Read both first. This doc is what to build and run next.

## Goal
A reviewed combo database so that (A) most combos are answered from the cache with no model call, and (B) when the model does improvise, it is right. The game is a cozy, funny, non-violent alchemy-style crafting game. Same pair always gives the same result.

## Files that go with this doc
- `approved-combos.json`: the seed set (see "Seed the cache"). 61 pairs approved, 8 user-written pairs, 4 pairs still needing alternatives.
- `combo-sorted.csv`: all 727 pairs from the last bake, sorted Good / Needs review / Bad. **Reference only. Do not bulk-approve it, and do not use the Bad or Needs review rows as examples.**
- `combo-triage.csv`: the earlier flag sheet.

## What was decided
1. The last bake had real problems (attractors like Fertilizer 25x and Cave 13x, modern results, voice tics, weak logic). Regenerate with the fixes below instead of reviewing the old output.
2. **Do not review all 727.** Fix the generator, apply automatic gates, then review by priority (below).
3. Approved rows go back in two ways only: as final cache entries, and as retrieval examples.
4. A "no result" outcome exists for pairs with no sensible answer. Comedy mode (funny/pun results like Bat guano + Crown = Bad King) is **deferred**.
5. Nothing time-based anywhere in this pipeline.

## Step 1: Seed the cache
- Load `approved-combos.json`. Entries with `status: approved` become final cache answers (no model call ever for those pairs).
- Canonicalize keys (A+B equals B+A; hyphenate multiword inputs). Keep an alias table (saltwater / salt water).
- Entries with `status: needs_alternatives` (earth+smoke, metal+smoke, sand+spirits, iron+spirits) go to the review tool's pick-from-5 queue. Do not auto-fill them.
- Two entries have the result Phoenix (fire+feather and blood+feather). Keep fire+feather and send blood+feather to the pick-from-5 queue.
- `water + feather = Fowl` is the user's pick. Offer "Waterfowl" as a one-key alternative, but keep Fowl unless the user changes it.
- Entries with empty tags need tags assigned from the closed list in `fantasy-tag-vocabulary.md` (32 tags, 1-5 per entry). Propose tags, and the user approves.
- Descriptions on approved rows: regenerate them (1-2 sentences, new voice rules). Do not reuse the old text.

## Step 2: New combiner prompt and schema
One call, fixed schema, **reasoning before the answer**.

Output fields, in this order:
1. `inputs_summary`: one line per input (what it is, what it is known for).
2. `candidates`: 3 candidate results, each with a one-line reason. Include the plain compound name if one exists (saltwater).
3. `choice`: the pick and a one-line reason it beat the others.
4. `result`: name, tags (closed list, 1-5), mode (`ordinary` or `whimsical`), description (1-2 sentences), or `no_result: true` with a short gentle line ("Nothing happens. The kettle looks unimpressed.").
5. `rationale`: 2-3 sentences, why this over the runner-up. **For the human reviewer only. Never use it as a training label or retrieval example.**

Rules in the prompt:
- Blend both inputs. A result that reflects only one input is wrong.
- Use the plain compound name when one exists (saltwater, not brine).
- No modern or industrial items (see the banned list in `combo-review-handoff.md`: hospital, locomotive, airplane, selfie, sandwich, and similar).
- Do not fall back on an input's favorite association (Bat guano to Fertilizer, Bat to Cave, Smoke to Ash, Silver or Crystal to Mirror) unless both inputs justify it.
- Descriptions are 1-2 sentences. Ban or strongly limit: faint, faintly, whisper, hum, lullaby, sigh, "as if", blanket.
- Result names are real, common words or short natural compounds. No glued-on invented words (Mudhat, Saltcave).
- Reuse existing entry names when they fit. Pass the list of existing names in the prompt.
- No violence, gore, cruelty, real people, real drugs, or explicit content. Stay in `voice.md`.
- If no sensible result exists, return `no_result`.

**Experiment to run:** same held-out set with and without the reasoning-first fields (inputs_summary, candidates, choice). Compare approval rate, attractor rate, and seconds per combo. Keep it only if approval rises and the time is acceptable. In live play, only new combos call the model, so some extra latency is fine. Allow turning the reasoning fields off once the cache is warm.

## Step 3: Retrieval examples
- For each new pair, pull 5-8 **approved** rows that share an input or are similar in type, and show them as examples (pair, result name, tags). Add the clean description only if rewritten.
- Pick varied examples. Do not fill the prompt with attractor results unless the pair truly earns them.
- Add 2-3 "don't" examples (bad result next to the corrected one): Water + Salt: Brine, should be Saltwater. Steam + Salt: Sea, should be Salt spray.
- Never include unreviewed rows, the model's old descriptions with voice tics, or held-out rows.

## Step 4: Automatic gates (before any human sees a row)
Reject and regenerate (up to N tries, then queue as `needs_alternatives`) when:
- The result name is already used by 3 or more other pairs, unless the pair is same-element or both inputs clearly justify it.
- The result name is on the banned list or is not a real word / natural compound.
- The result equals one of the inputs.
- The description is over 2 sentences or contains the banned phrases (or run an automatic rewrite pass).
- The reasoning or rationale mentions only one input.
- Tags are outside the closed list or empty.
- The model rates its own answer 3 or lower. (Model marks are unreliable, so use them only to order review, never to approve.)

## Step 5: Review, by priority
- **Never review the whole grid.** 39 inputs make 741 pairs, and most are unrelated.
- **Priority 1 (about 60-100 pairs):** the base elements, early materials, and school-recipe inputs players hit first.
- **Priority 2:** a random sample of about 50 from the rest, to estimate the error rate. If it is low, stop.
- **Priority 3:** review on use. New combos enter the cache marked `unreviewed`. A "this doesn't make sense" flag button (for the user's friends) sends flagged and heavily used combos to the review queue. Combos nobody makes never need review.
- **Held-out set:** about 100 reviewed pairs, chosen at random, never used in prompts, examples, or cache seeding. Score every round against them.

### Review tool (build this)
A small keyboard tool, about 5 seconds per row:
- Show only the pair and the result (hide the description).
- Keys: `y` keep, `n` reject, `x` no result, `1-5` pick an alternative, `s` skip, and a field to type a custom fix.
- For `n` or "needs alt", the model proposes 5 alternatives (blend both inputs, plain compound first) and the reviewer presses a number.
- Record for every rejection: failure type (attractor, too specific, metaphorical, wrong category, modern, duplicate, bad logic) and the chosen fix. Rejected rows with a fix become critic "bad examples".
- Notes column: if a result is funny but wrong for now, the reviewer writes the joke in the notes. These seed comedy mode later.
- Show the model's rationale (2-3 sentences) beside each row to speed triage. Flag rows whose rationale mentions only one input or contradicts the result.

## Step 6: Metrics and acceptance (compare each round)
- Held-out approval rate rises round over round.
- No result name covers more than a small share of pairs (3 or fewer pairs per name unless genuinely related).
- Zero results on the banned list.
- 100% of descriptions are 1-2 sentences, and banned phrases appear in under 5%.
- Water + Salt returns Saltwater. Steam + Salt does not return Sea.
- Average seconds per combo, with and without the reasoning fields.
- Stop looping when the held-out score plateaus. 3 to 5 rounds is a ceiling, not a target.

## Data checks
- Store the full schema per row: pair key, result, tags, element, mode, description, review status, source (user / assistant-read / model), and for rejects the failure type and fix.
- Treat the data as a graph. Results become inputs later, so each approved result must make sense when it feeds other combos.

## Deferred (do not build yet)
- **Comedy mode:** results built from each input's connotation (Bat guano + Crown = Bad King, Salt + Crown = Salty King). Plan: the user writes 10-15 examples, the model proposes about 5 candidates per pair, the user picks. Keep mild (no crude content).
- Fine-tuning. Try retrieval and rules first. Consider it only if they plateau.
- Anything time-based.

## Appendix: the 61 approved pairs from the last bake
Descriptions are intentionally omitted. Regenerate them.

| Pair | Result | Tags |
|---|---|---|
| air + air | Wind | utility, energy |
| animal + forge | Horseshoe | utility, forging |
| animal + wilds | Wildlife | animal, plant |
| bat guano + bat guano | Fertilizer | utility, animal, reagent |
| blood + crystal | Ruby | mineral |
| bone dust + bone dust | Bone meal | utility, reagent, animal |
| crystal + food | Sugar | mineral, reagent |
| crystal + tea | Iced tea | brewing, liquid |
| earth + animal | Burrow | utility, animal |
| earth + blood | Red clay | mineral, reagent |
| earth + earth | Soil | mineral, utility |
| earth + forge | Kiln | mineral, industrial |
| earth + iron | Ore | metal, mineral, reagent |
| feather + crown | Peacock | animal |
| fire + fire | Campfire | utility, energy |
| fire + smoke | Bonfire | utility, energy, area |
| food + crown | Crown roast | utility, enchanting |
| food + herb | Salad | plant, utility |
| food + person | Meal | utility |
| forge + forge | Foundry | forging, industrial, utility |
| glass + blood | Vial | utility, liquid |
| glass + crown | Crown glass | utility |
| glass + crystal | Crystal glass | mineral, utility |
| glass + person | Glazier | utility, industrial |
| gold + crown | Gold crown | metal, forging, court |
| gold + gold | Treasure | metal, utility |
| gold + spellbook | Golden tome | enchanting, knowledge |
| herb + wilds | Wild Herb | plant, reagent |
| iron + iron | Chain | metal, forging, utility |
| life + life | Family | healing, enchanting |
| light + light | Sun | utility, energy |
| light + tea | Sun tea | brewing, utility |
| metal + sulfur | Pyrite | mineral, reagent, utility |
| metal + wilds | Ironwood | plant, utility |
| mud + mud | Clay | mineral, forging, utility |
| mud + rotted leaves | Humus | mineral, plant, utility |
| rotted leaves + wilds | Forest floor | plant, utility |
| salt + crystal | Salt crystal | mineral |
| salt + food | Seasoning | utility |
| salt + herb | Herb salt | utility, plant, mineral |
| sand + crystal | Quartz | mineral, reagent |
| sand + wilds | Oasis | utility, plant, mineral |
| shadow + feather | Blackbird | control |
| silver + sulfur | Tarnish | mineral, utility |
| smoke + animal | Smoked meat | transform |
| smoke + crystal | Quartz | mineral |
| smoke + tea | Smoked tea | brewing, plant |
| sound + person | Singer | utility |
| spirits + crystal | Chalice | utility, mineral |
| spirits + food | Marinade | liquid, utility |
| steam + food | Dumpling | utility, transform |
| steam + sound | Whistle | utility |
| tree + crown | Wooden crown | plant |
| tree + glass | Greenhouse | utility, plant |
| tree + wilds | Jungle | plant |
| water + person | Bath | utility, liquid |
| water + rotted leaves | Swamp | liquid, plant |
| water + sound | Splash | utility, liquid |
| water + water | Lake | liquid, utility |
| water + wilds | Wetland | utility, plant, liquid |
| wilds + crown | Canopy | plant, utility |

## Appendix: the user's own verdicts (also in `approved-combos.json`)
| Pair | Result |
|---|---|
| metal + person | Armor |
| earth + mud | Clay |
| water + feather | Fowl |
| death + smoke | Sickly Fog |
| fire + feather | Phoenix |
| sulfur + wilds | Wildfire |
| silver + gold | Bank |
| blood + feather | Phoenix (duplicate, needs an alternative) |
| earth + smoke, metal + smoke, sand + spirits, iron + spirits | needs alternatives |